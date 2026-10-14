import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createAgentSession, type ExtensionFactory } from '@oh-my-pi/pi-coding-agent/sdk';
import type { AgentMessage } from '@oh-my-pi/pi-agent-core';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import type { PromptOptions } from '@oh-my-pi/pi-coding-agent/session/agent-session-types';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { AgentRegistry } from '@oh-my-pi/pi-coding-agent/registry/agent-registry';
import { initializeExtensions } from '@oh-my-pi/pi-coding-agent/modes/runtime-init';
import { JsonObjectSchema, MCPOAuthPublicConfigurationSchema, SessionBranchRequestSchema, type Agent, type CapturedSendOptions, type JsonObject, type Run, type SessionBranchRequest } from '@openchamber/agent-contract';
import type { WorkerBootstrapMessage, WorkerInteraction, WorkerOperation, WorkerOperationResult } from '../protocol.ts';
import type { ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { WorkerInteraction as NativeInteraction } from './interaction.ts';
import { BRANCH_TYPE, rememberPrivateRoots, resolveCanonicalMessage, selectedBranchRevert, WorkerProjection, type BranchSelection } from './projection.ts';
import { WorkerCatalogs, credentialReference } from './catalogs.ts';
import { WorkerMcp, readNativeMcpConfigurationIfPresent } from './mcp.ts';
import { WorkerShell } from './shell.ts';
import { WorkerCompletion } from './completion.ts';
import { nativeExtensionRoots, nativeModelsContext, nativeSkillOptions, openNativeRuntime } from './native-runtime.ts';
import type { WorkerAuthorize } from './policy.ts';
import { createHostToolExtension } from './host-tool.ts';
import type { WorkerHostInvoke } from './host-actions.ts';
import { formatModelString } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { captureNativePolicy } from './native-policy-snapshot.ts';
import type { HostNativePolicySnapshot, NativePolicyContext } from '../native-policy-protocol.ts';
import { createNativeBashPolicyExtension } from './native-bash-policy.ts';
import { BashTool } from '@oh-my-pi/pi-coding-agent/tools/bash';

type PromptOperation = Extract<WorkerOperation, { type: 'prompt' | 'steer' | 'follow-up' }>;
type PreparedPrompt = { text: string; options: PromptOptions; context: Parameters<SessionManager['appendMessage']>[0][] };
type NativeAdmission = { skillsAvailable: boolean; profile: Agent | null };

export class WorkerSession {
  private readonly projection: WorkerProjection;
  private readonly unsubscribe: () => void;
  private readonly operations = new Set<Promise<WorkerOperationResult>>();
  private readonly defaultToolNames: string[];
  private readonly defaultMountedNames: string[];
  private readonly queuedContext = new WeakMap<AgentMessage, PreparedPrompt['context']>();
  private readonly nativeQueuedPreparation: AgentSession['agent']['prepareQueuedMessages'];
  private binding: Promise<void> = Promise.resolve();
  private promptTask: Promise<void> | undefined;
  private preparation: Promise<PreparedPrompt> | undefined;
  private cancellingRunId: string | undefined;
  private closed = false;
  private skillsApplying = false;
  private failed = false;
  private controllingBranch = false;

  private constructor(
    readonly session: AgentSession,
    private readonly authStorage: AuthStorage,
    readonly sessionFile: string,
    private readonly publish: (inputs: ProjectionInput[]) => void,
    private readonly sessionId: string,
    private readonly onFatal: () => void,
    private readonly interaction: NativeInteraction,
    private readonly catalogs: WorkerCatalogs,
    private readonly mcp: WorkerMcp | undefined,
    private readonly shell: WorkerShell,
    private readonly completion: WorkerCompletion,
    private readonly admission: NativeAdmission,
    private readonly authorize: WorkerAuthorize,
  ) {
    this.projection = new WorkerProjection(session.sessionManager, sessionId);
    this.defaultToolNames = session.getActiveToolNames();
    this.defaultMountedNames = session.getMountedXdevToolNames();
    this.nativeQueuedPreparation = session.agent.prepareQueuedMessages;
    session.agent.prepareQueuedMessages = async (messages, signal) => {
      const nativePreparation = await this.nativeQueuedPreparation?.(messages, signal);
      return {
        commit: () => {
          const nativeContext = nativePreparation?.commit();
          if (nativePreparation && nativeContext === undefined) return undefined;
          // Queued turns do not drain the SDK's direct-prompt nextTurn buffer.
          // Native preparation commits these companions with the same user delivery.
          const context: AgentMessage[] = [];
          for (const message of messages) {
            const captured = this.queuedContext.get(message);
            if (captured) context.push(...captured);
          }
          if (nativeContext) context.push(...nativeContext);
          return context;
        },
      };
    };
    this.unsubscribe = session.subscribe(event => {
      try {
        this.emit(this.projection.consume(event));
        if (event.type === 'message_end' || event.type === 'turn_end' || event.type === 'agent_end') {
          void this.bind().catch(() => this.fail());
        }
      } catch { this.fail(); }
    });
  }

  static async open(input: WorkerBootstrapMessage, publish: (inputs: ProjectionInput[]) => void, onInteraction: (interaction: WorkerInteraction) => void, onFatal: () => void, hostAuthorize: WorkerAuthorize, invokeHostAction: WorkerHostInvoke, publishPolicy: (snapshot: HostNativePolicySnapshot) => void): Promise<WorkerSession> {
    if (input.mcpConfiguration && !input.mcpConfigPath) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'MCP storage ownership is missing');
    if (input.skillSources && !input.agentDirectoryId) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Skill source ownership is missing');
    const runtime = await openNativeRuntime(input);
    const { authStorage, settings, modelRegistry } = runtime;
    let manager: SessionManager | undefined;
    let session: AgentSession | undefined;
    let shell: WorkerShell | undefined;
    let projection: WorkerProjection | undefined;
    let owned: WorkerSession | undefined;
    const admission: NativeAdmission = { skillsAvailable: !input.skillSources, profile: null };
    let capturePolicy: (() => Promise<void>) | undefined;
    const authorize: WorkerAuthorize = async (request, context) => {
      await capturePolicy?.();
      await hostAuthorize(request, context);
    };
    const authorizeTool = async (toolName: string, toolInput: JsonObject, approval?: { approvalId?: string; toolCallId: string }): Promise<void> => {
      await capturePolicy?.();
      const profile = admission.profile;
      if (profile && !profile.allowedTools.includes(toolName)) throw new ProjectionError(403, 'UNAUTHORIZED', 'Selected agent profile does not permit this tool');
      const model = session?.model;
      const nativeContext: NativePolicyContext = { editMode: runtime.effectiveEditMode(model ? formatModelString(model) : undefined) };
      if (model) {
        nativeContext.providerId = model.provider;
        nativeContext.modelId = model.id;
        nativeContext.endpoint = model.baseUrl;
      }
      return hostAuthorize({ type: 'tool', toolName, input: toolInput, agentId: profile?.agentId, permissionPresetId: profile?.permissionPresetId, ...approval }, nativeContext);
    };
    const worker = { workspaceId: input.workspaceId, rootSessionId: input.rootSessionId, workerGeneration: input.workerGeneration };
    const interaction = new NativeInteraction({ request: onInteraction, currentTurn: () => projection?.currentTurn()?.turnId });
    const observer: ExtensionFactory = api => {
      api.on('tool_call', async event => {
        interaction.observeToolCall(event);
        if (admission.profile && !admission.profile.allowedTools.includes(event.toolName)) return { block: true, reason: 'Selected agent profile does not permit this tool' };
        if (['bash', 'openchamber', 'web', 'memory', 'notify'].includes(event.toolName)) return;
        try { await authorizeTool(event.toolName, JsonObjectSchema.parse(event.input)); }
        catch { return { block: true, reason: 'Host policy refused the tool operation' }; }
      });
      api.on('before_agent_start', () => admission.profile?.systemPromptOverride === undefined ? undefined : { systemPrompt: [admission.profile.systemPromptOverride] });
      api.on('tool_approval_requested', event => { interaction.observeApproval(event); });
      api.on('tool_result', event => { interaction.forgetToolCall(event.toolCallId); });
      api.on('tool_approval_resolved', event => { interaction.forgetToolCall(event.toolCallId, false); });
    };
    const mcp = input.mcpConfigPath ? new WorkerMcp({
      cwd: input.cwd, configPath: input.mcpConfigPath, worker, authStorage,
      resolveCredentialRef: async reference => {
        await authStorage.credentials.reload();
        const row = authStorage.credentials.list().find(candidate => candidate.disabledCause === null && credentialReference(candidate.provider, candidate.id) === reference);
        if (!row) throw new ProjectionError(403, 'UNAUTHORIZED', 'MCP credential reference is unavailable');
        return row.provider;
      },
      // authorizeServer already checked the Host-resolved command before this resolver is called.
      resolveCommand: async transport => transport.command,
      authorizeServer: server => authorize({ type: 'mcp-server', server }),
      authorizeOAuth: (server, configuration) => {
        const publicConfiguration = MCPOAuthPublicConfigurationSchema.parse(configuration);
        const present = Object.fromEntries(Object.entries(publicConfiguration).filter(([, value]) => value !== undefined));
        return authorize({ type: 'mcp-oauth', server, configuration: JsonObjectSchema.parse(present) });
      },
      sanitizeTool: tool => ({ ...tool, description: tool.description.split(input.cwd).join('[workspace]').split(input.agentDirectory).join('[agent-directory]') }),
      onCatalog: state => publish([{ timestamp: Date.now(), event: { type: 'catalog.updated', catalog: { kind: 'mcp', state } } }]),
      onRuntimeFailure: error => { process.stderr.write(`${JSON.stringify({ type: 'mcp.runtime.failure', error })}\n`); },
      isCurrent: () => !owned || !owned.closed && !owned.failed,
    }) : undefined;
    try {
      const directory = input.sessionsDirectory ?? SessionManager.getDefaultSessionDir(input.cwd, input.agentDirectory);
      manager = input.sessionFile
        ? await SessionManager.open(input.sessionFile, directory, undefined, { initialCwd: input.cwd, throwIfMissing: true })
        : SessionManager.create(input.cwd, directory);
      const nativeManager = manager;
      const bashPolicy = new BashTool({ cwd: input.cwd, hasUI: true, settings,
        getSessionFile: () => nativeManager.getSessionFile() ?? null,
        // This factory does not override SDK spawns; retain its actual default policy context.
        getSessionSpawns: () => '*',
      });
      const result = await createAgentSession({
        cwd: input.cwd, agentDir: input.agentDirectory, sessionManager: manager, authStorage, modelRegistry, settings,
        initialModelRefreshStrategy: 'offline',
        enableMCP: mcp !== undefined, mcpManager: mcp, enableLsp: false, disableExtensionDiscovery: true,
        hasUI: true, interactivePrompts: true, extensions: [observer, createNativeBashPolicyExtension({ interaction, approval: bashPolicy.approval,
          authorize: (toolCallId, toolInput, approvalId) => authorizeTool('bash', toolInput, { toolCallId, approvalId }),
        }), createHostToolExtension({
          scope: { sessionId: input.rootSessionId, rootSessionId: input.rootSessionId, workspaceId: input.workspaceId },
          invoke: invocation => invokeHostAction(invocation.request, invocation.signal),
        })],
        extensionRoots: () => nativeExtensionRoots(settings),
        getApiKey: async model => {
          await authorizeTool('provider.use', { providerId: model.provider, modelId: model.id, endpoint: model.baseUrl });
          return modelRegistry.resolver(model, session?.agent.sessionId ?? input.workerGeneration);
        },
      });
      session = result.session;
      const nativeSession = session;
      mcp?.attachSession(nativeSession);
      result.setToolUIContext(interaction.ui, true);
      const catalogs = new WorkerCatalogs({
        ...nativeModelsContext(runtime, () => nativeSession.sessionManager.getSessionId()), worker,
        cwd: input.cwd, agentDirectory: input.agentDirectory, agentDirectoryId: input.agentDirectoryId ?? input.workerGeneration,
        get extensionRoots() { return nativeExtensionRoots(settings); },
        get options() { return nativeSkillOptions(settings); },
        permissionPreset: presetId => authorize({ type: 'tool', toolName: 'permission.preset', input: { presetId }, permissionPresetId: presetId }),
        availableToolNames: () => nativeSession.getAllToolInfos().map(tool => tool.name),
        assertProviderEntryAllowed: () => authorize({ type: 'provider-entry' }),
        publishSkills: async staged => {
          await nativeSession.refreshSkills();
          const capture = (skills: typeof staged | typeof nativeSession.skills) => skills.map(skill => JSON.stringify({ name: skill.name, description: skill.description, filePath: skill.filePath, baseDir: skill.baseDir, source: skill.source, hide: skill.hide, containRoot: skill.containRoot, metadata: skill._source })).sort();
          const expected = capture(staged), actual = capture(nativeSession.skills);
          if (expected.length !== actual.length || expected.some((skill, index) => skill !== actual[index])) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skill publication changed during application');
        },
        setSkillsRuntimeAvailable: available => { admission.skillsAvailable = available; },
      });
      const nativeOwnerId = nativeSession.getAgentId();
      if (!nativeSession.asyncJobManager || nativeOwnerId === undefined) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native shell ownership is unavailable');
      // Subscribe before readiness and prompt admission; factory creation starts no Bash jobs.
      shell = new WorkerShell({
        manager: nativeSession.asyncJobManager, nativeOwner: { agentId: nativeOwnerId, registry: AgentRegistry.global() },
        workspaceId: input.workspaceId, projectId: input.projectId, sessionId: input.rootSessionId,
        workerGeneration: input.workerGeneration, epoch: input.observationEpoch ?? randomUUID(), cwd: input.cwd,
      });
      const completion = new WorkerCompletion(modelRegistry, input.workspaceId, async (selection, controls) => {
        const selected = await catalogs.resolveSelection(selection, controls);
        await authorizeTool('provider.use', { providerId: selection.providerId, modelId: selection.modelId, endpoint: selected.nativeModel.baseUrl });
        return selected;
      });
      await manager.ensureOnDisk();
      const sessionFile = manager.getSessionFile();
      if (!sessionFile) throw new ProjectionError(503, 'SESSION_RESTORE_FAILED', 'Session storage is unavailable');
      await rememberPrivateRoots(manager, input);
      owned = new WorkerSession(nativeSession, authStorage, sessionFile, publish, input.rootSessionId, onFatal, interaction, catalogs, mcp, shell, completion, admission, authorize);
      capturePolicy = async () => {
        const configuration = input.mcpConfigPath ? await readNativeMcpConfigurationIfPresent(input.mcpConfigPath, input.workspaceId) : null;
        publishPolicy(await captureNativePolicy({ projectId: input.projectId, workspaceId: input.workspaceId, cwd: input.cwd, agentDirectory: input.agentDirectory, agentDirectoryId: input.agentDirectoryId ?? input.workerGeneration }, runtime, catalogs.agents, configuration?.config.servers ?? []));
      };
      await capturePolicy();
      projection = owned.projection;
      if (input.mcpConfiguration && mcp) {
        const applied = await mcp.apply({ persistedRevision: input.mcpConfiguration.persistedRevision }, input.mcpConfiguration);
        if (applied.outcome !== 'applied') throw new ProjectionError(503, 'MCP_APPLY_FAILED', 'Initial MCP configuration could not be applied');
      }
      // Skill publications are generation-local; an untouched configuration still has CAS revision zero.
      if (input.skillSources) await catalogs.skills.apply(input.skillSources, '1');
      if (input.options) await owned.selectOptions(input.options);
      await initializeExtensions(nativeSession, {
        mode: 'rpc', uiContext: interaction.ui,
        reportSendError: () => owned?.fail(), reportRuntimeError: () => owned?.fail(), onShutdown: onFatal,
      });
      return owned;
    } catch (error) {
      interaction.close();
      if (owned) await owned.close();
      else {
        try { await shell?.close(); }
        finally {
          try { await mcp?.close(); }
          finally { try { if (session) await session.dispose(); else await manager?.close(); } finally { authStorage.close(); } }
        }
      }
      throw error;
    }
  }

  private async selectOptions(options: CapturedSendOptions): Promise<void> {
    const profile = options.agentId === null ? null : await this.catalogs.agents.profile(options.agentId);
    const fallback = profile?.model ?? (this.session.model ? { providerId: this.session.model.provider, modelId: this.session.model.id } : null);
    const providerId = options.providerId ?? fallback?.providerId;
    const modelId = options.modelId ?? fallback?.modelId;
    if (!providerId || !modelId) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected model is unavailable');
    const selected = await this.catalogs.resolveSelection({ providerId, modelId }, { variant: options.variant, reasoningEffort: options.reasoningEffort });
    await this.session.setModelTemporary(selected.nativeModel);
    if (selected.reasoningEffort !== null || options.variant !== null || options.reasoningEffort !== null) {
      const effort = this.session.getAvailableEffortSelectors().find(selector => selector === (selected.reasoningEffort ?? 'off'));
      if (effort === undefined && selected.nativeModel.reasoning) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected model effort is unavailable');
      if (effort !== undefined) this.session.setThinkingLevel(effort);
    }
    if (profile) {
      const available = this.session.getAllToolInfos();
      if (profile.allowedTools.some(name => !available.some(tool => tool.name === name))) throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected profile tool is unavailable');
      await this.session.setActiveToolsByName([...profile.allowedTools]);
    } else if (this.admission.profile) {
      await this.session.restoreNonMCPToolPresentation(this.defaultToolNames, this.defaultMountedNames);
    }
    this.admission.profile = profile;
  }

  seed(): ProjectionSeed { return this.projection.seed(); }

  private emit(inputs: ProjectionInput[]): void { if (inputs.length !== 0) this.publish(inputs); }

  private fail(): void {
    if (this.failed) return;
    this.failed = true;
    try { this.emit(this.projection.failRun('Session projection failed', Date.now())); }
    finally { this.onFatal(); }
  }

  private bind(): Promise<void> {
    this.binding = this.binding.then(async () => {
      await this.session.settleInFlightMessagePersistence();
      this.projection.bindPending();
      await this.session.sessionManager.flush();
    });
    return this.binding;
  }

  private async prepare(operation: PromptOperation): Promise<PreparedPrompt> {
    const { input, options } = operation.request;
    if (input.agentMention && options.agentId !== null && input.agentMention.agentId !== options.agentId) throw new ProjectionError(400, 'INVALID_REQUEST', 'Agent mention and selected profile disagree');
    await this.selectOptions(input.agentMention ? { ...options, agentId: input.agentMention.agentId } : options);
    let text = input.text;
    const contextMessages: PreparedPrompt['context'] = [];
    const invocation = /^\/skill:([^\s]+)(?:\s+([\s\S]*))?$/.exec(text);
    if (invocation) text = await this.catalogs.skills.preparePrompt(invocation[1]!, invocation[2] ?? '');
    for (const context of input.context) {
      if (context.kind === 'instruction' || context.kind === 'synthetic') {
        const message = context.kind === 'instruction'
          ? { role: 'developer' as const, content: context.text, timestamp: Date.now() }
          : { role: 'user' as const, content: context.text, synthetic: true, timestamp: Date.now() };
        contextMessages.push(message);
      } else {
        if (context.instructions) {
          const message = { role: 'developer' as const, content: context.instructions, timestamp: Date.now() };
          contextMessages.push(message);
        }
        contextMessages.push({
          role: 'custom', customType: 'ohpichamber.context', content: context.text, display: false,
          details: { metadata: context.metadata, deliveryReceiptId: context.deliveryReceiptId },
          attribution: 'agent', timestamp: Date.now(),
        });
      }
    }
    const images: NonNullable<PromptOptions['images']> = [];
    for (const attachment of input.attachments) {
      const reference = operation.attachments?.find(item => item.attachmentId === attachment.attachmentId);
      if (!reference) throw new ProjectionError(400, 'INVALID_REQUEST', 'Attachment has no Host-resolved file');
      if (attachment.mediaType.startsWith('image/')) {
        images.push({ type: 'image', data: (await readFile(reference.path)).toString('base64'), mimeType: attachment.mediaType });
      } else {
        contextMessages.push({ role: 'custom', customType: 'ohpichamber.attachment', display: false,
          content: `Attached file ${attachment.name}: ${reference.path}`, details: attachment,
          attribution: 'agent', timestamp: Date.now(),
        });
      }
    }
    if (operation.type === 'prompt') {
      for (const message of contextMessages) {
        // Keep every native role in the same ordered transcript path; nextTurn can
        // buffer custom messages while a previous terminal turn is still unwinding.
        this.session.agent.appendMessage(message);
        this.session.sessionManager.appendMessage(message);
      }
    }
    await this.session.sessionManager.flush();
    return { text, options: { throwOnDrop: true, images, runCommands: false, expandPromptTemplates: false }, context: contextMessages };
  }
  private async selectBranch(input: SessionBranchRequest): Promise<Extract<WorkerOperationResult, { type: 'branch' }>> {
    const request = SessionBranchRequestSchema.parse(input);
    if (this.preparation || this.projection.activeRun() || this.session.isStreaming) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
    this.controllingBranch = true;
    const manager = this.session.sessionManager;
    let previousLeaf: string | null = manager.getLeafId();
    let previousRevert: BranchSelection | null = null;
    let navigated = false;
    let navigationStarted = false;
    try {
      await this.promptTask;
      await this.bind();
      if (this.closed || this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Worker session is unavailable');
      if (this.preparation || this.projection.activeRun() || this.session.isStreaming) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
      const before = this.projection.seed();
      if (before.branch.branchId !== request.branchId || before.branch.branchVersion !== request.branchVersion) {
        throw new ProjectionError(409, 'SESSION_BRANCH_CONFLICT', 'The selected branch has changed');
      }
      previousLeaf = manager.getLeafId();
      previousRevert = selectedBranchRevert(manager.getBranch());
      const targetId = request.action === 'revert'
        ? resolveCanonicalMessage(manager, this.sessionId, request.messageId, true) : previousRevert?.restoreLeafId;
      if (!targetId) throw new ProjectionError(409, 'SESSION_BRANCH_CONFLICT', 'The requested branch selection is unavailable');
      const targetMessage = request.action === 'revert' ? before.messages.find(message => message.messageId === request.messageId) : undefined;
      navigationStarted = true;
      const navigation = await this.session.navigateTree(targetId, { summarize: false, allowAskReopen: false });
      navigated = manager.getLeafId() !== previousLeaf;
      if (navigation.cancelled || navigation.aborted || navigation.reopenAsk) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Native tree navigation was not committed');
      await manager.appendEntriesAtomically(() => manager.appendCustomEntry(BRANCH_TYPE, {
        restoreLeafId: request.action === 'revert' ? previousRevert?.restoreLeafId ?? previousLeaf : null,
        revertedMessageId: request.action === 'revert' ? request.messageId : null,
      }));
      this.projection.resetSelection();
      const seed = this.projection.seed();
      this.interaction.cancelAll();
      return { type: 'branch', seed, result: { sessionId: this.sessionId, branch: seed.branch,
        draft: navigation.editorText === undefined ? null : { text: this.projection.publicText(navigation.editorText),
          attachments: targetMessage?.parts.flatMap(part => part.type === 'attachment'
            ? [{ attachmentId: part.attachmentId, mediaType: part.mediaType, name: part.name, size: part.size, uri: part.uri }] : []) ?? [] },
      } };
    } catch (error) {
      if (navigationStarted && (navigated || manager.getLeafId() !== previousLeaf)) {
        // The native context may already have switched. Retire it rather than
        // allowing a prompt against a failed selection or stale agent context.
        try {
          if (previousLeaf === null) manager.resetLeaf(); else manager.branch(previousLeaf);
          await manager.appendEntriesAtomically(() => manager.appendCustomEntry(BRANCH_TYPE, previousRevert ?? { restoreLeafId: null, revertedMessageId: null }));
        } catch {
          throw new ProjectionError(503, 'SESSION_RESTORE_FAILED', 'The prior native branch selection could not be persisted');
        } finally { this.fail(); }
      }
      throw error;
    } finally { this.controllingBranch = false; }
  }

  operation(operation: WorkerOperation): Promise<WorkerOperationResult> {
    const task = this.executeOperation(operation);
    this.operations.add(task);
    void task.then(() => this.operations.delete(task), () => this.operations.delete(task));
    return task;
  }

  private async executeOperation(operation: WorkerOperation): Promise<WorkerOperationResult> {
    if (this.closed || this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Worker session is unavailable');
    if (this.controllingBranch) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Native branch selection is in progress');
    switch (operation.type) {
      case 'catalog': {
        const applying = operation.operation.type === 'skills.apply';
        if (applying && this.skillsApplying) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Skill application is already active');
        if (applying) this.skillsApplying = true;
        try {
          const result = await this.catalogs.operation(operation.operation, operation.revision);
          if (operation.operation.type === 'skills.apply' && result.type === 'skills.applied' && result.result.outcome === 'applied') this.emit([{ timestamp: Date.now(), event: { type: 'catalog.updated', catalog: { kind: 'skills', state: this.catalogs.skills.read(operation.operation.sources) } } }]);
          return { type: 'catalog', result };
        } finally { if (applying) this.skillsApplying = false; }
      }
      case 'mcp.configuration.read':
        throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Configuration hydration belongs to the workspace worker');
      case 'mcp': {
        if (!this.mcp) throw new ProjectionError(503, 'MCP_APPLY_FAILED', 'MCP runtime ownership is unavailable');
        const request = operation.operation;
        switch (request.type) {
          case 'read': return { type: 'mcp', result: { type: 'catalog', catalog: this.mcp.read(request.configuration) } };
          case 'persist': return { type: 'mcp', result: { type: 'persisted', configuration: await this.mcp.persist(request.request, request.configuration) } };
          case 'apply': return { type: 'mcp', result: { type: 'applied', result: await this.mcp.apply(request.request, request.configuration) } };
          case 'reconnect': return { type: 'mcp', result: { type: 'catalog', catalog: await this.mcp.reconnect(request.serverId, request.request, request.configuration) } };
          case 'oauth.status': return { type: 'mcp', result: { type: 'oauth', result: await this.mcp.oauthRead(request.serverId, request.configuration) } };
          case 'oauth': return { type: 'mcp', result: { type: 'oauth', result: await this.mcp.oauthExecute(request.serverId, request.request, request.configuration) } };
        }
      }
      case 'shell':
        if (operation.operation.type === 'start') await this.authorize({ type: 'shell', request: operation.operation.request });
        return { type: 'shell', result: await this.shell.operation(operation.operation) };
      case 'completion':
        return { type: 'completion', result: await this.completion.operation(operation.operation) };
      case 'steer': case 'follow-up': {
        const requestedRunId = this.projection.activeRun()?.runId;
        const assertStreaming = () => {
          if (this.closed || this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Worker session is unavailable');
          if (!requestedRunId || this.projection.activeRun()?.runId !== requestedRunId || !this.session.isStreaming) throw new ProjectionError(404, 'RUN_NOT_FOUND', 'A live streaming run is required');
        };
        assertStreaming();
        if (this.preparation) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Prompt preparation is already in progress');
        if (this.skillsApplying || !this.admission.skillsAvailable) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skills must be applied before streaming admission');
        this.preparation = this.prepare(operation);
        try {
          const prepared = await this.preparation;
          assertStreaming();
          let acceptedAt: number | undefined;
          let messageId: string | undefined;
          const streamingBehavior = operation.type === 'steer' ? 'steer' : 'followUp';
          const dispatched = await this.session.prompt(prepared.text, {
            ...prepared.options, streamingBehavior,
            // prompt() yields before dispatch; this option is read synchronously at native dispatch.
            // Enforce the live-run contract there too instead of accidentally starting an idle turn.
            get expandPromptTemplates() { assertStreaming(); return false; },
            onPromptAdmitted: () => {
              const queue = streamingBehavior === 'steer' ? this.session.agent.peekSteeringQueue() : this.session.agent.peekFollowUpQueue();
              const queued = queue.at(-1);
              if (!queued || queued.role !== 'user') throw new ProjectionError(503, 'INTERNAL_ERROR', 'Native queued user message is unavailable');
              if (prepared.context.length > 0) this.queuedContext.set(queued, prepared.context);
              messageId = this.projection.admitQueuedPrompt(queued, operation.request.input.attachments);
              acceptedAt = Date.now();
            },
          });
          if (!dispatched || acceptedAt === undefined || !messageId) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Native streaming prompt was not admitted');
          return operation.type === 'steer'
            ? { type: 'steer', ack: { sessionId: this.sessionId, runId: requestedRunId!, acceptedAt } }
            : { type: 'follow-up', ack: { sessionId: this.sessionId, followUpId: messageId, acceptedAt } };
        } finally { this.preparation = undefined; }
      }
      case 'prompt': {
        if (this.preparation || this.projection.activeRun()) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        if (this.skillsApplying || !this.admission.skillsAvailable) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skills must be successfully applied before prompt admission');
        this.preparation = this.prepare(operation);
        let prepared: PreparedPrompt;
        try { prepared = await this.preparation; }
        finally { this.preparation = undefined; }
        if (this.closed || this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Worker session is unavailable');
        if (this.skillsApplying || !this.admission.skillsAvailable) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skills changed during prompt preparation');
        this.emit(this.projection.beginRun(operation.runId, Date.now(), operation.request.input.attachments));
        const run = this.projection.activeRun();
        if (!run) throw new ProjectionError(503, 'INTERNAL_ERROR', 'Run admission failed');
        const accepted: Run = { ...run };
        this.promptTask = this.session.prompt(prepared.text, prepared.options).then(async dispatched => {
          await this.bind();
          if (!dispatched) this.emit(this.projection.completeRun(Date.now()));
        }).catch(() => {
          this.emit(this.cancellingRunId === operation.runId
            ? this.projection.cancelRun(Date.now()) : this.projection.failRun('Agent execution failed', Date.now()));
        });
        return { type: 'prompt', run: accepted };
      }
      case 'abort': {
        const run = this.projection.activeRun();
        if (!run || run.runId !== operation.runId) throw new ProjectionError(404, 'RUN_NOT_FOUND', 'Run not found');
        this.cancellingRunId = operation.runId;
        this.interaction.cancelAll();
        await this.session.abort();
        await this.promptTask;
        await this.bind();
        this.emit(this.projection.cancelRun(Date.now()));
        this.cancellingRunId = undefined;
        return { type: 'abort', run: { ...run } };
      }
      case 'approval.resolve':
        if (!this.interaction.resolveApproval(operation.approvalId, operation.decision)) throw new ProjectionError(404, 'APPROVAL_NOT_FOUND', 'Approval request is not pending');
        return { type: 'approval.resolve', resolved: true };
      case 'question.resolve':
        if (!this.interaction.resolveQuestion(operation.questionId, operation.action, operation.response)) throw new ProjectionError(404, 'QUESTION_NOT_FOUND', 'Question request is not pending');
        return { type: 'question.resolve', resolved: true };
      case 'history':
        await this.binding;
        return { type: 'history', history: this.projection.history(operation.request) };
      case 'branch':
        return this.selectBranch(operation.request);
      case 'delete':
        if (this.preparation || this.projection.activeRun()) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        await this.bind();
        await this.session.sessionManager.dropSession(this.sessionFile);
        return { type: 'delete', deletedSessionIds: [this.sessionId] };
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.interaction.close();
    try {
      try { await this.preparation; } catch { /* The operation reports preparation failure to its caller. */ }
      await this.session.abort();
      await this.promptTask;
      await this.bind();
    } finally {
      this.unsubscribe();
      this.session.agent.prepareQueuedMessages = this.nativeQueuedPreparation;
      try {
        try { await this.completion.close(); }
        finally {
          await Promise.allSettled([...this.operations]);
          try { await this.shell.close(); } finally { await this.mcp?.close(); }
        }
      } finally { try { await this.session.dispose(); } finally { this.authStorage.close(); } }
    }
  }
}

