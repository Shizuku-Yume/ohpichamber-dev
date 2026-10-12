import { readFile } from 'node:fs/promises';
import { createAgentSession, discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/sdk';
import type { ExtensionFactory } from '@oh-my-pi/pi-coding-agent/sdk';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { initializeExtensions } from '@oh-my-pi/pi-coding-agent/modes/runtime-init';
import type { CapturedSendOptions, Run } from '@openchamber/agent-contract';
import type { WorkerBootstrapMessage, WorkerInteraction, WorkerOperation, WorkerOperationResult } from '../protocol.ts';
import type { ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { WorkerInteraction as NativeInteraction } from './interaction.ts';
import { WorkerProjection } from './projection.ts';

type Session = Awaited<ReturnType<typeof createAgentSession>>['session'];
type AuthStorage = Awaited<ReturnType<typeof discoverAuthStorage>>;
type PromptOperation = Extract<WorkerOperation, { type: 'prompt' }>;
type NativePromptOptions = NonNullable<Parameters<Session['prompt']>[1]>;

async function selectOptions(session: Session, options: CapturedSendOptions): Promise<void> {
  if (options.agentId !== null) throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Agent profiles are not available in this service stage');
  if (options.providerId !== null || options.modelId !== null) {
    const provider = options.providerId ?? session.model?.provider;
    const modelId = options.modelId ?? session.model?.id;
    const model = provider && modelId ? session.modelRegistry.find(provider, modelId) : undefined;
    if (!model) throw new ProjectionError(400, 'MODEL_UNAVAILABLE', 'Selected model is unavailable');
    await session.setModelTemporary(model);
  }
  if (options.variant !== null && options.reasoningEffort !== null && options.variant !== options.reasoningEffort) {
    throw new ProjectionError(400, 'INVALID_REQUEST', 'Variant and reasoning effort disagree');
  }
  const requested = options.reasoningEffort ?? options.variant;
  if (requested !== null) {
    const effort = session.getAvailableEffortSelectors().find(selector => selector === requested);
    if (effort === undefined) throw new ProjectionError(400, 'MODEL_UNAVAILABLE', 'Selected effort is unavailable');
    session.setThinkingLevel(effort);
  }
}

export class WorkerSession {
  private readonly projection: WorkerProjection;
  private readonly unsubscribe: () => void;
  private binding: Promise<void> = Promise.resolve();
  private promptTask: Promise<void> | undefined;
  private preparation: Promise<NativePromptOptions> | undefined;
  private cancellingRunId: string | undefined;
  private closed = false;
  private failed = false;

  private constructor(
    readonly session: Session,
    private readonly authStorage: AuthStorage,
    readonly sessionFile: string,
    private readonly publish: (inputs: ProjectionInput[]) => void,
    private readonly sessionId: string,
    private readonly onFatal: () => void,
    private readonly interaction: NativeInteraction,
  ) {
    this.projection = new WorkerProjection(session.sessionManager, sessionId);
    this.unsubscribe = session.subscribe(event => {
      try {
        this.emit(this.projection.consume(event));
        if (event.type === 'message_end' || event.type === 'turn_end' || event.type === 'agent_end') {
          void this.bind().catch(() => this.fail());
        }
      } catch { this.fail(); }
    });
  }

  static async open(input: WorkerBootstrapMessage, publish: (inputs: ProjectionInput[]) => void, onInteraction: (interaction: WorkerInteraction) => void, onFatal: () => void): Promise<WorkerSession> {
    const authStorage = await discoverAuthStorage(input.agentDirectory, { cwd: input.cwd });
    let manager: SessionManager | undefined;
    let session: Session | undefined;
    let projection: WorkerProjection | undefined;
    const interaction = new NativeInteraction({ request: onInteraction, currentTurn: () => projection?.currentTurn()?.turnId });
    const observer: ExtensionFactory = api => {
      api.on('tool_call', event => { interaction.observeToolCall(event); });
      api.on('tool_approval_requested', event => { interaction.observeApproval(event); });
      api.on('tool_result', event => { interaction.forgetToolCall(event.toolCallId); });
      api.on('tool_approval_resolved', event => { interaction.forgetToolCall(event.toolCallId); });
    };
    try {
      const directory = input.sessionsDirectory ?? SessionManager.getDefaultSessionDir(input.cwd, input.agentDirectory);
      manager = input.sessionFile
        ? await SessionManager.open(input.sessionFile, directory, undefined, { initialCwd: input.cwd, throwIfMissing: true })
        : SessionManager.create(input.cwd, directory);
      const result = await createAgentSession({
        cwd: input.cwd, agentDir: input.agentDirectory, sessionManager: manager, authStorage,
        enableMCP: false, enableLsp: false, disableExtensionDiscovery: true, hasUI: true, interactivePrompts: true, extensions: [observer],
      });
      session = result.session;
      result.setToolUIContext(interaction.ui, true);
      if (input.options) await selectOptions(session, input.options);
      await manager.ensureOnDisk();
      const sessionFile = manager.getSessionFile();
      if (!sessionFile) throw new ProjectionError(503, 'SESSION_RESTORE_FAILED', 'Session storage is unavailable');
      const owned = new WorkerSession(session, authStorage, sessionFile, publish, input.rootSessionId, onFatal, interaction);
      projection = owned.projection;
      await initializeExtensions(session, {
        mode: 'rpc', uiContext: interaction.ui,
        reportSendError: () => owned.fail(),
        reportRuntimeError: () => owned.fail(),
        onShutdown: onFatal,
      });
      return owned;
    } catch (error) {
      interaction.close();
      try {
        if (session) await session.dispose();
        else await manager?.close();
      } finally { authStorage.close(); }
      throw error;
    }
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

  private async prepare(operation: PromptOperation): Promise<NativePromptOptions> {
    const { input, options } = operation.request;
    if (input.agentMention) throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Agent mentions are not available in this service stage');
    await selectOptions(this.session, options);
    for (const context of input.context) {
      if (context.kind === 'instruction' || context.kind === 'synthetic') {
        const message = context.kind === 'instruction'
          ? { role: 'developer' as const, content: context.text, timestamp: Date.now() }
          : { role: 'user' as const, content: context.text, synthetic: true, timestamp: Date.now() };
        this.session.agent.appendMessage(message);
        this.session.sessionManager.appendMessage(message);
      } else {
        await this.session.sendCustomMessage({
          customType: 'ohpichamber.context', content: context.text, display: false,
          details: { metadata: context.metadata, deliveryReceiptId: context.deliveryReceiptId },
        }, { triggerTurn: false, deliverAs: 'nextTurn' });
        if (context.instructions) {
          const message = { role: 'developer' as const, content: context.instructions, timestamp: Date.now() };
          this.session.agent.appendMessage(message);
          this.session.sessionManager.appendMessage(message);
        }
      }
    }
    const images: NonNullable<NativePromptOptions['images']> = [];
    for (const attachment of input.attachments) {
      const reference = operation.attachments?.find(item => item.attachmentId === attachment.attachmentId);
      if (!reference) throw new ProjectionError(400, 'INVALID_REQUEST', 'Attachment has no Host-resolved file');
      if (attachment.mediaType.startsWith('image/')) {
        images.push({ type: 'image', data: (await readFile(reference.path)).toString('base64'), mimeType: attachment.mediaType });
      } else {
        await this.session.sendCustomMessage({ customType: 'ohpichamber.attachment', display: false,
          content: `Attached file ${attachment.name}: ${reference.path}`, details: attachment,
        }, { triggerTurn: false, deliverAs: 'nextTurn' });
      }
    }
    await this.session.sessionManager.flush();
    return { throwOnDrop: true, images };
  }

  async operation(operation: WorkerOperation): Promise<WorkerOperationResult> {
    if (this.closed || this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Worker session is unavailable');
    switch (operation.type) {
      case 'prompt': {
        if (this.preparation || this.projection.activeRun()) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        this.preparation = this.prepare(operation);
        let options: NativePromptOptions;
        try { options = await this.preparation; }
        finally { this.preparation = undefined; }
        if (this.closed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Worker session is closed');
        this.emit(this.projection.beginRun(operation.runId, Date.now(), operation.request.input.attachments));
        const run = this.projection.activeRun();
        if (!run) throw new ProjectionError(503, 'INTERNAL_ERROR', 'Run admission failed');
        const accepted: Run = { ...run };
        this.promptTask = this.session.prompt(operation.request.input.text, options).then(async dispatched => {
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
      try { await this.session.dispose(); } finally { this.authStorage.close(); }
    }
  }
}

