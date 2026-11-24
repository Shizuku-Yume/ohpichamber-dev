import { copyFile, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { formatBytes, isProbablyBinary } from '@oh-my-pi/pi-utils';
import { createAgentSession, type ExtensionFactory } from '@oh-my-pi/pi-coding-agent/sdk';
import { EventBus } from '@oh-my-pi/pi-coding-agent/utils/event-bus';
import { TASK_SUBAGENT_LIFECYCLE_CHANNEL, TASK_SUBAGENT_PROGRESS_CHANNEL, TASK_SUBAGENT_EVENT_CHANNEL, type SubagentLifecyclePayload } from '@oh-my-pi/pi-coding-agent/task';
import type { CompletedRewindState } from '@oh-my-pi/pi-coding-agent/tools/checkpoint';
import { autosaveApprovedPlan, isPlanAutosaveEnabled } from '@oh-my-pi/pi-coding-agent/plan-mode/plan-autosave';
import type { AssistantMessage, Model } from '@oh-my-pi/pi-ai';
import { AgentLifecycleManager } from '@oh-my-pi/pi-coding-agent/registry/agent-lifecycle';
import { USER_INTERRUPT_LABEL } from '@oh-my-pi/pi-coding-agent/session/messages';
import type { AgentMessage } from '@oh-my-pi/pi-agent-core';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import type { AgentSessionHandle } from '@oh-my-pi/pi-coding-agent/session/agent-session-handle';
import type { PromptOptions } from '@oh-my-pi/pi-coding-agent/session/agent-session-types';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { recordSessionRecap } from '@oh-my-pi/pi-coding-agent/session/session-index';
import { AgentRegistry } from '@oh-my-pi/pi-coding-agent/registry/agent-registry';
import { JobWidgets } from '@oh-my-pi/pi-coding-agent/job-widgets/registry';
import { createModelJobCaptionWriter } from '@oh-my-pi/pi-coding-agent/job-widgets/caption';
import { listServicesTolerant, sendService, serviceLogs, stopService } from '@oh-my-pi/pi-coding-agent/launch/services';
import { cfgAsyncWidgets, cfgTasksTodoClearDelay, cfgToolsIntentTracing } from '@oh-my-pi/pi-coding-agent/tools/settings';
import { createTodoHudStateData, getTodoHudVisibility, TODO_HUD_STATE_CUSTOM_TYPE } from '@oh-my-pi/pi-coding-agent/tools/todo';
import { isClosedTodo } from '@oh-my-pi/pi-tui/tools/todo';
import type { ToolSession } from '@oh-my-pi/pi-coding-agent/tools';
import { resolveToolTier } from '@oh-my-pi/pi-coding-agent/tools/approval';
import { initializeExtensions } from '@oh-my-pi/pi-coding-agent/modes/runtime-init';
import { executeAcpBuiltinSlashCommand, isAllowedBuiltinCommand, isReadOnlyBuiltinCommand, parseSlashCommand } from './builtin-commands.ts';
import type { SlashCommandRuntime } from '@oh-my-pi/pi-coding-agent/slash-commands/types';
import { RpcBtwController } from '@oh-my-pi/pi-coding-agent/modes/rpc/rpc-btw';
import { MAGIC_KEYWORDS, type MagicKeywordContext } from '@oh-my-pi/pi-coding-agent/modes/magic-keywords';
import { containsMagicKeyword } from '@oh-my-pi/pi-tui/prompt/magic-keywords';
import { parseTurnBudget } from '@oh-my-pi/pi-coding-agent/modes/turn-budget';
import { parseConfiguredThinkingLevel } from '@oh-my-pi/pi-tui/thinking';
import { JsonObjectSchema, MCPOAuthPublicConfigurationSchema, SessionBranchRequestSchema, type AdvisorNote, type Agent, type CapturedSendOptions, type JsonObject, type LoopState, type Run, type RunOrigin, type SessionBranchRequest, type Subagent } from '@openchamber/agent-contract';
import { parseLoopArgs } from '@oh-my-pi/pi-coding-agent/modes/loop-limit';
import { evaluateLoopCondition, describeLoopCondition } from '@oh-my-pi/pi-coding-agent/modes/loop-condition';
type LoopConditionConfig = { command: string; until: boolean };
import { parseGeneratedRule, sanitizeRuleName } from '@oh-my-pi/pi-coding-agent/modes/controllers/omfg-rule';
import { runCleanse, type CleanseRunUi } from '@oh-my-pi/pi-coding-agent/cleanse/index';
import { cfgTaskAgentIdleTtlMs } from '@oh-my-pi/pi-coding-agent/task/settings';
import { createPersistedSubagentReviverFactory } from '@oh-my-pi/pi-coding-agent/task/persisted-revive';
import { registerPersistedSubagents, sessionFileBelongsToRoot } from '@oh-my-pi/pi-coding-agent/registry/persisted-agents';
import { agentTranscriptSource } from '@oh-my-pi/pi-coding-agent/modes/agent-hub-runtime';
import { MAIN_AGENT_ID, type AgentRef } from '@oh-my-pi/pi-coding-agent/registry/agent-registry';
import { SessionObserverRegistry } from '@oh-my-pi/pi-tui/overlays/session-observer-registry';
import type { SubagentTranscriptEntry, SubagentTranscriptResponse } from '@openchamber/agent-contract';
import { settleUsageSession } from './usage.ts';
import type { WorkerBootstrapMessage, WorkerInteraction, WorkerOperation, WorkerOperationResult } from '../protocol.ts';
import type { ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { SubagentEventSchema, SubagentLifecyclePayloadSchema, SubagentProjector, SubagentProgressSchema, type SubagentEventObservation } from './subagent-projection.ts';
import { WorkerInteraction as NativeInteraction } from './interaction.ts';
import { WorkerModeController } from './mode.ts';
import { BRANCH_TYPE, nativePrivateRootContext, rememberPrivateRoots, resolveCanonicalMessage, selectedBranchRevert, WorkerProjection, type BranchSelection } from './projection.ts';
import { WorkerCatalogs } from './catalogs.ts';
import { WorkerMcp, readNativeMcpConfigurationIfPresent } from './mcp.ts';
import { NativeMcpCredentials } from './mcp-credentials.ts';
import { WorkerShell } from './shell.ts';
import { WorkerCompletion } from './completion.ts';
import { consumePrewarmedNativeRuntime, nativeExtensionRoots, nativeModelsContext, nativeSkillOptions, openNativeRuntime } from './native-runtime.ts';
import { NativeWebSearch, installWebSearchAuthorization } from './catalog-websearch.ts';
import { NativeApprovalRequired, type WorkerAuthorize } from './policy.ts';
import { createHostToolController, normalizeHostToolEnablement, HOST_TOOL_DESCRIPTIONS, type HostToolController, type HostToolName } from './host-tool.ts';
import type { WorkerHostInvoke } from './host-actions.ts';
import { formatModelString } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { DEFERRED_TITLE_SYSTEM_PROMPT, deferredTitleContext, firstUserMessageText, generateSelectedModelTitle } from './auto-title.ts';
import { cfgTitleRefreshOnReplan } from '@oh-my-pi/pi-coding-agent/utils/title-settings';
import { captureNativePolicy } from './native-policy-snapshot.ts';
import type { HostNativePolicySnapshot, NativePolicyContext } from '../native-policy-protocol.ts';
import { createNativeBashAuthorizer } from './native-bash-policy.ts';
import { resolveDeclaredTier } from './tool-tier.ts';
import { NativePermissionBridge } from './native-permission-bridge.ts';
import { BashTool } from '@oh-my-pi/pi-coding-agent/tools/bash';
import { cfgTaskPerCallModel } from '@oh-my-pi/pi-coding-agent/task/settings';
import { nativePluginExtensionPaths } from './native-plugin-loader.ts';
import { NativeCacheWarming } from './catalog-warming.ts';
import { SuggestionDriver } from './suggestion.ts';
import { InternalUrlRouter, resolveLocalRoot } from '@oh-my-pi/pi-coding-agent/internal-urls';
import { readPlanFile } from '@oh-my-pi/pi-coding-agent/plan-mode/plan-files';
import { prompt as nativePrompt } from '@oh-my-pi/pi-utils';
import planApprovedPrompt from '@oh-my-pi/pi-coding-agent/prompts/system/plan-mode-approved' with { type: 'text' };
import planCompactPrompt from '@oh-my-pi/pi-coding-agent/prompts/system/plan-mode-compact-instructions' with { type: 'text' };
import { PlanReferenceSchema, PlanReviewSchema, type PlanReviewResponse } from '@openchamber/agent-contract';

/** A text attachment under these bounds is inlined into the prompt instead of handed off by path. */
const MAX_INLINE_ATTACHMENT_BYTES = 256 * 1024;
/** Replace every character that could escape or break a `local://` name; the slash-free result stays one segment. */
const SAFE_ATTACHMENT_NAME = /[^A-Za-z0-9._-]/g;

/**
 * Copy a Host-resolved attachment into the session's own `local://` scratch
 * root and return its root-relative path.
 *
 * OMP serves `local://` at read tier and enforces containment on resolve, so
 * the model can `read` it without a private Host absolute path ever entering
 * the prompt or the canonical DTO. The Host bytes are copied, never moved:
 * the attachment store keeps owning its own file.
 */
async function materializeAttachmentForRead(
  manager: SessionManager,
  sourcePath: string,
  attachment: { attachmentId: string; name: string },
): Promise<string> {
  const rootCandidate = resolveLocalRoot({
    getArtifactsDir: () => manager.getArtifactsDir(),
    getSessionId: () => manager.getSessionId(),
  });
  await mkdir(rootCandidate, { recursive: true, mode: 0o700 });
  const localRoot = await realpath(rootCandidate);
  const safeName = attachment.name.replace(SAFE_ATTACHMENT_NAME, '_').replace(/^\.+/, '_') || 'attachment';
  const relativeName = `attachments/${attachment.attachmentId}-${safeName}`;
  const target = join(localRoot, relativeName);
  // `local://` is root-relative; a private absolute path is never published.
  const relativePath = relative(localRoot, target).split(sep).join('/');
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) throw new ProjectionError(400, 'INVALID_REQUEST', 'Attachment cannot be placed in the session scratch space');
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await copyFile(sourcePath, target);
  return relativePath;
}
type PromptOperation = Extract<WorkerOperation, { type: 'prompt' | 'steer' | 'follow-up' }>;
type PreparedPrompt = { text: string; options: PromptOptions; context: Parameters<SessionManager['appendMessage']>[0][] };
type NativeAdmission = { skillsAvailable: boolean; profile?: Agent | null };

export class WorkerSession {
  private readonly modeController: WorkerModeController;
  private projection: WorkerProjection;
  private readonly unsubscribe: () => void;
  private readonly operations = new Set<Promise<WorkerOperationResult>>();
  private readonly defaultToolNames: string[];
  private readonly defaultMountedNames: string[];
  private readonly defaultRegisteredNames: string[];
  private readonly queuedContext = new WeakMap<AgentMessage, PreparedPrompt['context']>();
  private readonly nativeQueuedPreparation: AgentSession['agent']['prepareQueuedMessages'];
  readonly btw: RpcBtwController;
  private binding: Promise<void> = Promise.resolve();
  private readonly titleUnsubscribe: () => void;
  /** Non-blocking initial MCP application; awaited only during close. */
  mcpStartup: Promise<void> | undefined;
  private pendingTitleInput: string | undefined;
  private titleGeneration: Promise<void> | undefined;
  private titleAbort: AbortController | undefined;
  private promptTask: Promise<void> | undefined;
  private preparation: Promise<PreparedPrompt> | undefined;
  private cancellingRunId: string | undefined;
  private closed = false;
  private skillsApplying = false;
  private failed = false;
  private controllingBranch = false;
  private compacting = false;
  private lastEmittedCompaction: { compactionId: string; completedAt: number } | undefined;
  private reviewingPlan = false;
  private planRevision = 0;
  private planReviewTask: Promise<void> | undefined;
  private publishedContinuationPending = false;
  private todoAutoClearTimer: NodeJS.Timeout | undefined;
  private todoAutoClearGeneration = 0;
  private todoAutoClearSnapshotKey: string | undefined;
  private todoAutoClearDelaySeconds: number | undefined;
  private readonly liveSubagents = new Map<string, Subagent>();
  readonly suggestionDriver: SuggestionDriver;
  private _draftPresent = false;
  private readonly toolCallToSubagentId = new Map<string, string>();
  /** Tool events that arrived before their subagent's first lifecycle/progress frame. */
  private readonly pendingSubagentEvents = new Map<string, SubagentEventObservation[]>();
  private readonly subagentProjector: SubagentProjector;
  // Agent Hub reads: the observer registry tracks live sessions for the tree
  // cost rollup, and the persisted roster is only awaited when the UI asks.
  private readonly observers = new SessionObserverRegistry();
  private persistedRoster: Promise<void> | undefined;
  get sessionId(): string { return this._sessionId; }
  get sessionFile(): string { return this._sessionFile; }
  get completedRewindState(): CompletedRewindState | undefined {
    return this.session.getLastCompletedRewind();
  }
  private loopState: LoopState = { active: false, iteration: 0 };
  private loopCondition?: LoopConditionConfig;
  private loopDurationMs?: number;
  private loopStartedAtMs?: number;
  private advisorActive = false;
  private pendingAdvisorNotes: AdvisorNote[] = [];
  private readonly activeTanSessions = new Map<string, { session: AgentSession; abort: () => Promise<void>; dispose: () => Promise<void> }>();
  private constructor(
    readonly session: AgentSession,
    private readonly authStorage: AuthStorage,
    private _sessionFile: string,
    private readonly publish: (inputs: ProjectionInput[]) => void,
    private _sessionId: string,
    private readonly cwd: string,
    private readonly onFatal: () => void,
    private readonly interaction: NativeInteraction,
    private readonly catalogs: WorkerCatalogs,
    private readonly mcp: WorkerMcp | undefined,
    private readonly shell: WorkerShell,
    private readonly completion: WorkerCompletion,
    private readonly admission: NativeAdmission,
    private readonly authorize: WorkerAuthorize,
    private readonly authorizeProviderUse: (model: { provider: string; id: string; baseUrl: string }) => Promise<void>,
    private readonly onSubagent: (payload: SubagentLifecyclePayload & { assignment?: string }) => void,
    private readonly subagentEventBus: EventBus,
    private readonly webSearch: NativeWebSearch,
    private readonly permissionBridge: NativePermissionBridge,
    /** The shared catalog identity; a `/btw` branch rekeys its root in place. */
    private readonly workerIdentity: { rootSessionId: string },
    private readonly sanitizeProviderError: (text: string) => string,
    private readonly toolPolicy: { observer: ExtensionFactory; authorizeBashExecution: ReturnType<typeof createNativeBashAuthorizer> },
    private readonly hostToolsController?: HostToolController,
  ) {
    this.modeController = new WorkerModeController(
      session,
      title => this.proposePlan(title),
      start => this.startWorkerRun('goal', start),
      () => this.publishContinuationPending(),
      mode => this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', mode } }]),
    );
    this.projection = new WorkerProjection(session.sessionManager, this._sessionId, [], () => session.getTodoPhases(), sanitizeProviderError);
    this.defaultToolNames = session.getActiveToolNames();
    this.defaultMountedNames = session.getMountedToolCommandNames();
    this.defaultRegisteredNames = session.getAllToolNames();
    this.btw = new RpcBtwController(session, frame => {
      if (frame.type === 'btw_delta') this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'btw.delta', recordId: frame.recordId, delta: frame.delta } }]);
      else if (frame.type === 'btw_record') {
        if (frame.record.status !== 'running') {
          const completed = { type: 'btw.completed' as const, recordId: frame.record.id, status: frame.record.status === 'complete' ? 'completed' as const : frame.record.status === 'cancelled' ? 'cancelled' as const : 'failed' as const, text: frame.record.answer };
          this.emit([{ timestamp: frame.record.updatedAt, transient: true, event: frame.record.error === undefined ? completed : { ...completed, error: frame.record.error } }]);
        }
      }
    });
    this.nativeQueuedPreparation = session.agent.prepareQueuedMessages;
    this.subagentProjector = new SubagentProjector(this._sessionId, this.liveSubagents, this.pendingSubagentEvents, this.toolCallToSubagentId, inputs => this.emit(inputs), inputs => this.publish(inputs));
    this.titleUnsubscribe = session.sessionManager.onSessionNameChanged(() => {
      const title = session.sessionManager.getSessionName()?.trim();
      if (title) this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', title } }]);
    });
    this.subagentEventBus.on(TASK_SUBAGENT_LIFECYCLE_CHANNEL, data => {
      const parsed = SubagentLifecyclePayloadSchema.safeParse(data);
      if (!parsed.success) return;
      this.onSubagent({ ...parsed.data, assignment: this.liveSubagents.get(parsed.data.id)?.solutionSpace });
      this.subagentProjector.handleSubagentLifecycle(parsed.data);
    });
    this.subagentEventBus.on(TASK_SUBAGENT_PROGRESS_CHANNEL, data => {
      const parsed = SubagentProgressSchema.safeParse(data);
      if (!parsed.success) return;
      this.subagentProjector.handleSubagentProgress(parsed.data);
    });
    this.subagentEventBus.on(TASK_SUBAGENT_EVENT_CHANNEL, data => {
      const parsed = SubagentEventSchema.safeParse(data);
      if (!parsed.success) return;
      this.subagentProjector.handleSubagentEvent(parsed.data);
    });
    // OMP's own IdleMaintenance owns recaps now: it journals them into
    // `history.db` (`session_recaps`), and the UI reads that journal through
    // the `recaps` route. `isBlocked` keeps a recap from firing while a turn,
    // compaction or session transition is in flight.
    this.observers.subscribeToEventBus(this.subagentEventBus, this.subagentEventBus);
    this.observers.setMainSession(this._sessionFile);
    session.enableIdleMaintenance({
      isBlocked: () => this.idleRecapBlocked(),
      scheduledTurn: () => this.scheduledTurn(),
      onRecap: recap => {
        try { recordSessionRecap(this._sessionId, this.cwd, recap); } catch { /* best-effort recap journal */ }
        // Transient: the recap is a hint about the settled turn, not a durable
        // transcript entry, so it must not become part of the history stream.
        this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'session.recap', recap, createdAt: Date.now() } }]);
      },
    });
    this.suggestionDriver = new SuggestionDriver({
      session,
      emit: events => this.emit(events),
      hasDraft: () => this.hasDraft(),
      isAborted: () => Boolean(this.cancellingRunId),
      authorize: this.authorizeProviderUse,
    });
    // Subagents restored from persisted transcripts become `parked` refs, so a
    // UI reload still sees the swarm the previous worker built.
    this.persistedRoster = registerPersistedSubagents(AgentRegistry.global(), this._sessionFile).catch(() => undefined);
    session.agent.prepareQueuedMessages = async (messages, signal, ...rest) => {
      const nativePreparation = await this.nativeQueuedPreparation?.(messages, signal, ...(rest as [never]));
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
    this.unsubscribe = session.subscribe(event => this.handleSessionEvent(event));
  }

  handleSessionEvent(event: Parameters<Parameters<AgentSession['subscribe']>[0]>[0]): void {
    try {
      this.modeController.observe(event);
      this.publishContinuationPending();
      if (event.type === 'todo_auto_clear' && this.session.getTodoPhases().length > 0) {
        this.session.setTodoPhases([]);
      }
      const projected = this.projection.consume(event);
      for (const input of projected) {
        if (input.event.type === 'session.compacted') {
          this.lastEmittedCompaction = { compactionId: input.event.compactionId, completedAt: input.event.completedAt };
        }
      }
      this.emit(projected);
      if (event.type === 'goal_updated' || (event.type === 'agent_end' && !this.modeController.isTransitioning())) {
        this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', mode: this.modeController.mode() } }]);
      }
      if (event.type === 'thinking_level_changed') {
        const model = this.session.model;
        this.emit([{
          timestamp: Date.now(), event: {
            type: 'session.updated', selection: {
              model: model ? { providerId: model.provider, modelId: model.id } : null,
              thinkingLevel: event.configured ?? event.thinkingLevel ?? null,
            }
          }
        }]);
      }
      if (event.type === 'tool_execution_end' && !event.isError && (event.toolName === 'todo' || event.toolName === 'eval')) {
        if (event.toolName === 'eval') {
          const todoUpdate = this.projection.syncTodosIfChanged(Date.now());
          if (todoUpdate) this.emit([todoUpdate]);
        }
        this.syncTodoAutoClear();
      }
      if (event.type === 'auto_compaction_end' || event.type === 'manual_compaction_end' || event.type === 'todo_auto_clear') {
        this.syncTodoAutoClear();
      }
      if (event.type === 'message_end' || event.type === 'turn_end' || event.type === 'agent_pause' || event.type === 'agent_end') {
        const isTodoToolResultEnd =
          event.type === 'message_end' &&
          event.message.role === 'toolResult' &&
          (event.message.toolName === 'todo' || event.message.toolName === 'eval') &&
          !event.message.isError;
        void this.bind().then(() => {
          if (this.closed || this.failed) return;
          if (isTodoToolResultEnd) {
            const todoUpdate = this.projection.syncTodosIfChanged(Date.now());
            if (todoUpdate) this.emit([todoUpdate]);
          }
          if (isTodoToolResultEnd || event.type === 'turn_end' || event.type === 'agent_pause' || event.type === 'agent_end') {
            this.syncTodoAutoClear();
          }
        }).catch(error => this.fail(error));
      }
      if (event.type === 'agent_end') {
        this.scheduleAutoTitle();
        void this.suggestionDriver.handleAgentEnd(event);
        // Settle this turn's spend into `stats.db`; the analytics index must
        // follow live work instead of waiting for an offline rescan.
        void settleUsageSession(this._sessionFile).catch(() => undefined);
        if (this.loopState.active) void this.handleLoopTurnEnd();
      }
      if (
        (event.type === 'message_start' || event.type === 'message_end') &&
        event.message.role === 'custom' &&
        (event.message as { customType?: string }).customType === 'advisor'
      ) {
        const detailsNotes = (event.message as { details?: { notes?: Array<{ note?: string; text?: string; severity?: string; advisor?: string }> } }).details?.notes;
        if (Array.isArray(detailsNotes)) {
          for (const item of detailsNotes) {
            const text = item.note ?? item.text ?? '';
            if (text && !this.pendingAdvisorNotes.some(p => p.text === text)) {
              this.pendingAdvisorNotes.push({
                noteId: randomUUID(),
                severity: ['blocker', 'concern', 'nit'].includes(item.severity ?? '') ? (item.severity as 'blocker' | 'concern' | 'nit') : 'concern',
                text,
                timestamp: Date.now(),
                advisorName: item.advisor ?? 'advisor',
              });
            }
          }
        }
      }
      if ((event as { type: string }).type === 'advisor_yielded') {
        const incomingNotes: AdvisorNote[] = [];
        const eventNotes = (event as { notes?: unknown }).notes;
        if (Array.isArray(eventNotes)) {
          for (const item of eventNotes) {
            if (typeof item === 'object' && item !== null) {
              const cast = item as { noteId?: string; severity?: string; text?: string; note?: string; timestamp?: number; advisorName?: string; advisor?: string };
              incomingNotes.push({
                noteId: cast.noteId ?? randomUUID(),
                severity: ['blocker', 'concern', 'nit'].includes(cast.severity ?? '') ? (cast.severity as 'blocker' | 'concern' | 'nit') : 'concern',
                text: cast.text ?? cast.note ?? '',
                timestamp: cast.timestamp ?? Date.now(),
                advisorName: cast.advisorName ?? cast.advisor ?? 'advisor',
              });
            }
          }
        }
        const queued = [
          ...this.session.agent.peekSteeringQueue(),
          ...this.session.agent.peekFollowUpQueue(),
        ];
        for (const msg of queued) {
          if (msg.role === 'custom' && (msg as { customType?: string }).customType === 'advisor') {
            const detailsNotes = (msg as { details?: { notes?: Array<{ note?: string; text?: string; severity?: string; advisor?: string }> } }).details?.notes;
            if (Array.isArray(detailsNotes)) {
              for (const item of detailsNotes) {
                incomingNotes.push({
                  noteId: randomUUID(),
                  severity: ['blocker', 'concern', 'nit'].includes(item.severity ?? '') ? (item.severity as 'blocker' | 'concern' | 'nit') : 'concern',
                  text: item.note ?? item.text ?? '',
                  timestamp: Date.now(),
                  advisorName: item.advisor ?? 'advisor',
                });
              }
            }
          }
        }
        for (const n of incomingNotes) {
          if (n.text && !this.pendingAdvisorNotes.some(p => p.text === n.text)) {
            this.pendingAdvisorNotes.push(n);
          }
        }
        if (this.pendingAdvisorNotes.length > 0) {
          const notesToEmit = [...this.pendingAdvisorNotes];
          this.pendingAdvisorNotes = [];
          this.emit([{
            timestamp: Date.now(),
            transient: true,
            event: {
              type: 'advisor_yielded',
              notes: notesToEmit,
            },
          }]);
        }
      }
    } catch (error) { this.fail(error); }
  }

  static async open(input: WorkerBootstrapMessage, publish: (inputs: ProjectionInput[]) => void, onInteraction: (interaction: WorkerInteraction) => void, onFatal: () => void, hostAuthorize: WorkerAuthorize, invokeHostAction: WorkerHostInvoke, publishPolicy: (snapshot: HostNativePolicySnapshot) => void, onSubagent: (payload: SubagentLifecyclePayload & { assignment?: string }) => void): Promise<WorkerSession> {
    if (input.mcpConfiguration && !input.mcpConfigPath) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'MCP storage ownership is missing');
    if (input.skillSources && !input.agentDirectoryId) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Skill source ownership is missing');
    const prewarmed = await consumePrewarmedNativeRuntime(input);
    const runtime = prewarmed?.runtime ?? await openNativeRuntime(input);
    const { authStorage, settings, modelRegistry } = runtime;
    let manager: SessionManager | undefined;
    let session: AgentSession | undefined;
    let shell: WorkerShell | undefined;
    let projection: WorkerProjection | undefined;
    let owned: WorkerSession | undefined;
    const admission: NativeAdmission = { skillsAvailable: !input.skillSources };
    let capturePolicy: (() => Promise<void>) | undefined;
    const authorize: WorkerAuthorize = async (request, context) => {
      await capturePolicy?.();
      await hostAuthorize(request, context);
    };
    // Successful provider.use approvals for this worker's lifetime, keyed by the
    // exact (provider, model, endpoint) the Host authorized. Denials are never
    // cached, so a policy change still refuses the next attempt; the first use of
    // each key always performs the full Host `/authorization-policy` round-trip.
    const authorizedProviderUses = new Set<string>();
    const providerUseKey = (input: JsonObject): string | null => (
      typeof input.providerId === 'string' && typeof input.modelId === 'string'
        ? JSON.stringify([input.providerId, input.modelId, typeof input.endpoint === 'string' ? input.endpoint : null])
        : null
    );
    const authorizeTool = async (toolName: string, toolInput: JsonObject, approval?: { approvalId?: string; toolCallId: string }): Promise<void> => {
      if (toolName === 'provider.use' && approval === undefined) {
        const key = providerUseKey(toolInput);
        if (key !== null && authorizedProviderUses.has(key)) return;
        await capturePolicy?.();
        const model = session?.model;
        const editMode = runtime.effectiveEditMode(model ? formatModelString(model) : undefined);
        const nativeContext: NativePolicyContext = {
          editMode: editMode === 'magic' ? 'none' : editMode,
          declaredTier: resolveDeclaredTier(session, toolName, toolInput),
        };
        if (model) {
          nativeContext.providerId = model.provider;
          nativeContext.modelId = model.id;
          nativeContext.endpoint = model.baseUrl;
        }
        await hostAuthorize({ type: 'tool', toolName, input: toolInput }, nativeContext);
        if (key !== null) authorizedProviderUses.add(key);
        return;
      }
      await capturePolicy?.();
      const model = session?.model;
      const editMode = runtime.effectiveEditMode(model ? formatModelString(model) : undefined);
      if (toolName === 'edit' && editMode === 'magic') {
        throw new ProjectionError(403, 'UNAUTHORIZED', 'Magic edit mode is not supported');
      }
      const nativeContext: NativePolicyContext = {
        editMode: editMode === 'magic' ? 'none' : editMode,
        declaredTier: resolveDeclaredTier(session, toolName, toolInput),
      };
      if (model) {
        nativeContext.providerId = model.provider;
        nativeContext.modelId = model.id;
        nativeContext.endpoint = model.baseUrl;
      }
      return hostAuthorize({ type: 'tool', toolName, input: toolInput, ...approval }, nativeContext);
    };
    // One mutable identity object is shared by the catalogs, the MCP manager
    // and the host-tool scope, so a completed `/btw` branch rekeys them all at
    // once instead of leaving a retired root id on any published catalog.
    const worker = { workspaceId: input.workspaceId, rootSessionId: input.rootSessionId, workerGeneration: input.workerGeneration };
    const interaction = new NativeInteraction({
      request: onInteraction,
      currentTurn: () => projection?.currentTurn()?.turnId,
      // `toolCallToSubagentId` is filled by subagent event frames after the
      // session owns the maps; the lookup defers to them at request time.
      subagentForToolCall: toolCallId => {
        const session = owned;
        if (!session) return undefined;
        const subagentId = session.toolCallToSubagentId.get(toolCallId);
        if (!subagentId) return undefined;
        const childSessionId = session.liveSubagents.get(subagentId)?.childSessionId;
        return { subagentId, ...(childSessionId === undefined ? {} : { childSessionId }) };
      },
    });
    const observer: ExtensionFactory = api => {
      api.on('tool_call', async (event, ctx) => {
        interaction.observeToolCall(event);
        if ((!ctx?.agent || ctx.agent.kind === 'main') && admission.profile && admission.profile.allowedTools !== null && !admission.profile.allowedTools.includes(event.toolName)) return { block: true, reason: 'Selected agent profile does not permit this tool' };
        // Host tools route through their domain capability owner; `bash` keeps
        // its own approval path. The set comes from the registered inventory so
        // a newly registered host tool cannot fall to the generic refusal below.
        if ((Object.keys(HOST_TOOL_DESCRIPTIONS) as string[]).concat('bash').includes(event.toolName)) return;
        // The native search tool is the SDK's egress entry point, not a generic
        // tool grant. Host authorization already owns web-search policy (including
        // enterprise refusal), so route exactly this SDK name to that capability.
        // Every other tool keeps the descriptor/approval-aware generic path.
        if (event.toolName === 'web_search') {
          try { await authorize({ type: 'web-search' }); }
          catch (error) {
            return {
              block: true,
              reason: error instanceof ProjectionError ? error.message : 'Host policy refused the tool operation',
            };
          }
          return;
        }
        const toolInput = JsonObjectSchema.parse(JSON.parse(JSON.stringify(event.input)));
        try {
          await authorizeTool(event.toolName, toolInput);
        } catch (error) {
          if (error instanceof NativeApprovalRequired) {
            // This approval comes from the Host authorizer inside `tool_call`,
            // not from OMP's own gate, so `ctx.ui.approve` has no
            // `tool_approval_requested` observation to match and would answer
            // `deny` for every request. Ask the user through the canonical
            // approval path instead, which the session mode can auto-answer.
            const approved = await interaction.approveTool(
              event.toolCallId,
              event.toolName,
              toolInput,
              error.message,
            );
            if (!approved) {
              return { block: true, reason: 'Tool approval was rejected' };
            }
            const approvalId = interaction.takeApprovalReceipt(event.toolCallId);
            if (!approvalId) {
              return { block: true, reason: 'Tool approval is unavailable' };
            }
            try {
              await authorizeTool(event.toolName, toolInput, { approvalId, toolCallId: event.toolCallId });
              return;
            } catch (reauthError) {
              return {
                block: true,
                reason: reauthError instanceof ProjectionError ? reauthError.message : 'Host policy refused the tool operation',
              };
            }
          }
          return {
            block: true,
            reason: error instanceof ProjectionError ? error.message : 'Host policy refused the tool operation',
          };
        }
      });
      api.on('before_agent_start', () => undefined);
      api.on('tool_approval_requested', event => { interaction.observeApproval(event); });
      api.on('tool_result', event => { interaction.forgetToolCall(event.toolCallId); });
      api.on('tool_approval_resolved', event => { interaction.forgetToolCall(event.toolCallId, false); });
    };
    const mcpCredentials = new NativeMcpCredentials(authStorage, input.workspaceId);
    const mcp = input.mcpConfigPath ? new WorkerMcp({
      cwd: input.cwd, configPath: input.mcpConfigPath,
      userConfigPath: join(input.agentDirectory, 'mcp.json'),
      worker, authStorage,
      resolveCredentialRef: reference => mcpCredentials.resolve(reference),
      // authorizeServer already checked the Host-resolved command before this resolver is called.
      resolveCommand: async transport => transport.command,
      authorizeServer: (server, proposed) => authorize({ type: 'mcp-server', server, ...(proposed ? { proposed: true } : {}) }),
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
      const [, pluginExtensionPaths] = await Promise.all([
        installWebSearchAuthorization(runtime, hostAuthorize),
        prewarmed?.pluginExtensionPaths ?? nativePluginExtensionPaths(input.cwd),
      ]);
      const directory = input.sessionsDirectory ?? SessionManager.getDefaultSessionDir(input.cwd, input.agentDirectory);
      manager = input.sessionFile
        ? await SessionManager.open(input.sessionFile, directory, undefined, { initialCwd: input.cwd, throwIfMissing: true })
        : SessionManager.create(input.cwd, directory);
      const nativeManager = manager;
      const bashPolicy = new BashTool({
        cwd: input.cwd, hasUI: true, settings,
        getSessionFile: () => nativeManager.getSessionFile() ?? null,
        // This factory does not override SDK spawns; retain its actual default policy context.
        getSessionSpawns: () => '*',
      });
      const subagentEventBus = new EventBus();
      const permissionBridge = new NativePermissionBridge(
        (toolCall, options, sessionRuleKey, signal, steeringSignal) => interaction.requestPermission(toolCall, options, sessionRuleKey, signal, steeringSignal),
        toolCall => {
          try {
            const decision = bashPolicy.approval(toolCall.rawInput);
            if (decision === 'read' || decision === 'write' || decision === 'exec') return 'prompt';
            return decision.policy === 'allow' ? 'allow' : decision.policy === 'deny' ? 'deny' : 'prompt';
          } catch { return 'prompt'; }
        },
      );
      // OMP owns titles. The worker runs its own automatic title after an idle
      // turn so the title provider can be pinned and authorized before its
      // credentials are released; OMP's autoTitle and replan title paths have
      // no such seam.
      cfgTitleRefreshOnReplan.override(settings, false);
      cfgTaskPerCallModel.override(settings, 'on');
      if (!cfgToolsIntentTracing.isConfigured(settings)) cfgToolsIntentTracing.override(settings, true);
      const initialHostTools = normalizeHostToolEnablement(input.hostTools);
      const hostToolsController = createHostToolController({
        scope: { sessionId: input.rootSessionId, rootSessionId: input.rootSessionId, workspaceId: input.workspaceId },
        invoke: invocation => invokeHostAction(invocation.request, invocation.signal),
        approveSecretRun: async (toolCallId, command, signal) => {
          const decision = bashPolicy.approval(command);
          if (decision !== 'read' && decision !== 'write' && decision !== 'exec' && decision.policy === 'deny') {
            throw new ProjectionError(403, 'UNAUTHORIZED', 'Native command policy refused the secret command');
          }
          if (!await interaction.approveSecretCommand(toolCallId, command, signal)) {
            throw new ProjectionError(403, 'UNAUTHORIZED', 'Secret command approval was rejected');
          }
          const approvalId = interaction.takeApprovalReceipt(toolCallId);
          if (!approvalId) throw new ProjectionError(403, 'UNAUTHORIZED', 'Secret command approval is unavailable');
          await authorizeTool('bash', command, { toolCallId, approvalId });
        },
        initialEnablement: initialHostTools,
      });
      const authorizeBashExecution = createNativeBashAuthorizer({
        interaction,
        authorize: (toolCallId, toolInput, approvalId) => authorizeTool('bash', toolInput, { toolCallId, approvalId }),
        nativeAuthorized: (toolCallId, toolInput) => permissionBridge.isNativeAuthorized('bash', toolInput, toolCallId),
      });
      const result = await createAgentSession({
        cwd: input.cwd, agentDir: input.agentDirectory, sessionManager: manager, authStorage, modelRegistry, settings,
        initialModelRefreshStrategy: 'offline',
        autoTitle: false,
        cacheWarming: 'idle',
        enableMCP: mcp !== undefined, mcpManager: mcp, disableExtensionDiscovery: true,
        tuiTranscript: true,
        hasUI: true, interactivePrompts: true, subagentEventBus, extensions: [observer, hostToolsController.extension],
        authorizeBashExecution,
        extensionRoots: () => nativeExtensionRoots(settings, pluginExtensionPaths),
        getApiKey: async model => {
          await authorizeTool('provider.use', { providerId: model.provider, modelId: model.id, endpoint: model.baseUrl });
          return modelRegistry.resolver(model, session?.agent.sessionId ?? input.workerGeneration);
        },
      });
      session = result.session;
      if (result.extensionsResult.errors.length > 0) {
        throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native plugin or local extension failed to load');
      }
      const nativeSession = session;
      nativeSession.setClientBridge(permissionBridge.clientBridge);
      hostToolsController.bindSession(nativeSession);
      mcp?.attachSession(nativeSession);
      result.setToolUIContext(interaction.ui, true);
      const warming = new NativeCacheWarming({ cwd: input.cwd, agentDirectory: input.agentDirectory, session: nativeSession });
      const catalogs = new WorkerCatalogs({
        ...nativeModelsContext(runtime, () => nativeSession.sessionManager.getSessionId()), worker,
        warming,
        session: nativeSession,
        cwd: input.cwd, agentDirectory: input.agentDirectory, agentDirectoryId: input.agentDirectoryId ?? input.workerGeneration,
        get extensionRoots() { return nativeExtensionRoots(settings, pluginExtensionPaths); },
        get options() { return nativeSkillOptions(settings, pluginExtensionPaths); },
        availableToolNames: () => nativeSession.getAllToolInfos().map(tool => tool.name),
        assertProviderEntryAllowed: () => authorize({ type: 'provider-entry' }),
        publishSkills: async staged => {
          type SkillPayload = (typeof staged)[number] & { content?: string };
          const capture = (skills: readonly SkillPayload[]) => skills.map(skill => JSON.stringify({ name: skill.name, description: skill.description, filePath: skill.filePath, baseDir: skill.baseDir, source: skill.source, hide: skill.hide, containRoot: skill.containRoot, content: skill.content, metadata: skill._source })).sort();
          const expected = capture(staged);
          const current = capture(nativeSession.skills);
          const match = expected.length === current.length && expected.every((desc, i) => desc === current[i]);
          if (!match) {
            await nativeSession.refreshSkills();
            const actual = capture(nativeSession.skills);
            if (expected.length !== actual.length || expected.some((skill, index) => skill !== actual[index])) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skill publication changed during application');
          }
        },
        setSkillsRuntimeAvailable: available => { admission.skillsAvailable = available; },
      });
      const nativeOwnerId = nativeSession.getAgentId();
      if (!nativeSession.asyncJobManager || nativeOwnerId === undefined) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Native shell ownership is unavailable');
      const captioner = createModelJobCaptionWriter({
        sessionId: () => input.rootSessionId,
        settings: nativeSession.settings,
        modelRegistry,
      });
      const widgets = new JobWidgets({
        captioner,
        enabled: () => cfgAsyncWidgets.get(nativeSession.settings),
      });
      const toolSession: ToolSession = Object.assign(Object.create(nativeSession), {
        cwd: input.cwd,
        hasUI: true,
        getSessionId: () => input.rootSessionId,
        getAgentId: () => nativeOwnerId,
        getSessionFile: () => manager?.getSessionFile() ?? undefined,
        getSessionSpawns: () => { const file = manager?.getSessionFile(); return file ? file.replace(/\.jsonl$/, '') : null; },
        registerSessionChangeCallback: nativeSession.registerSessionChangeCallback.bind(nativeSession),
        queueLaunchCompletion: nativeSession.queueLaunchCompletion.bind(nativeSession),
      });
      // Subscribe before readiness and prompt admission; factory creation starts no Bash jobs.
      shell = new WorkerShell({
        manager: nativeSession.asyncJobManager, nativeOwner: { agentId: nativeOwnerId, registry: AgentRegistry.global() },
        workspaceId: input.workspaceId, projectId: input.projectId, sessionId: input.rootSessionId,
        retiredSessionIds: input.retiredSessionIds,
        workerGeneration: input.workerGeneration, epoch: input.observationEpoch ?? randomUUID(), cwd: input.cwd,
        widgets,
        listServices: async () => {
          const res = await listServicesTolerant(toolSession);
          if (res.error) {
            throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', `Daemon broker list failed: ${res.error}`);
          }
          return res.services;
        },
        serviceLogs: async (name: string) => {
          return serviceLogs(toolSession, name);
        },
        sendServiceInput: async (serviceName: string, inputData: string) => {
          await sendService(toolSession, serviceName, inputData);
        },
        stopService: async (name: string) => {
          await stopService(toolSession, name);
        },
        privateRoots: nativePrivateRootContext(manager),
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
      const authorizeProviderUse = async (model: { provider: string; id: string; baseUrl: string }): Promise<void> => {
        await authorizeTool('provider.use', { providerId: model.provider, modelId: model.id, endpoint: model.baseUrl });
      };
      owned = new WorkerSession(nativeSession, authStorage, sessionFile, publish, input.rootSessionId, input.cwd, onFatal, interaction, catalogs, mcp, shell, completion, admission, authorize, authorizeProviderUse, onSubagent, subagentEventBus, new NativeWebSearch(runtime, input.workspaceId, authorize), permissionBridge, worker, runtime.sanitizeProviderError, { observer, authorizeBashExecution }, hostToolsController);
      // Persisted subagents must be revivable after a worker restart: the factory
      // rebuilds one from its transcript, and the TTL mirrors the native task-agent
      // idle setting so a parked agent is collected exactly when OMP would.
      AgentLifecycleManager.global().setPersistedSubagentReviverFactory(
        createPersistedSubagentReviverFactory({
          session: nativeSession, authStorage, modelRegistry, settings: nativeSession.settings,
          authorizeBashExecution,
          enableLsp: true, eventBus: subagentEventBus, subagentEventBus,
        }),
        () => Math.trunc(Number(cfgTaskAgentIdleTtlMs.get(nativeSession.settings)) || 0),
      );
      await owned.modeController.goal.reconcile();
      await owned.modeController.restore();
      capturePolicy = async () => {
        try {
          const configuration = input.mcpConfigPath ? await readNativeMcpConfigurationIfPresent(input.mcpConfigPath, input.workspaceId, join(input.agentDirectory, 'mcp.json')) : null;
          publishPolicy(await captureNativePolicy({ projectId: input.projectId, workspaceId: input.workspaceId, cwd: input.cwd, agentDirectory: input.agentDirectory, agentDirectoryId: input.agentDirectoryId ?? input.workerGeneration }, runtime, catalogs.agents, configuration?.config.servers ?? []));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          process.stderr.write(`${JSON.stringify({ type: 'policy.capture.warning', message: message.slice(0, 200) })}\n`);
        }
      };
      // The first snapshot must exist before the worker reports ready: a session
      // start is the only chance to publish it, and readers treat a ready worker
      // as having one. capturePolicy swallows its own failures, so awaiting it
      // cannot fail the open; it only orders the publish ahead of readiness.
      const initialPolicyCapture = capturePolicy();
      projection = owned.projection;
      // External MCP servers can take tens of seconds to handshake; the first
      // prompt must not wait for them. Start the connection in the background,
      // publish the ready catalog when it lands, and keep the worker open on
      // failure (a slow or broken external server never fails the session).
      if (input.mcpConfiguration && mcp) {
        const initialMcpConfiguration = input.mcpConfiguration;
        owned.mcpStartup = mcp.apply({ persistedRevision: initialMcpConfiguration.persistedRevision }, initialMcpConfiguration)
          .then(outcome => {
            if (outcome.outcome !== 'applied') {
              process.stderr.write(`${JSON.stringify({ type: 'mcp.runtime.failure', error: { code: 'MCP_APPLY_FAILED', detail: 'Initial MCP configuration was not applied; prompt admission stays available.' } })}\n`);
            }
          })
          .catch(() => {
            process.stderr.write(`${JSON.stringify({ type: 'mcp.runtime.failure', error: { code: 'MCP_APPLY_FAILED', detail: 'Initial MCP configuration could not be applied; prompt admission stays available.' } })}\n`);
          });
      }
      // Skill publications are generation-local; an untouched configuration still has CAS revision zero.
      const postInitTasks: Promise<unknown>[] = [];
      if (input.skillSources) postInitTasks.push(catalogs.skills.apply(input.skillSources, '1'));
      if (input.options) postInitTasks.push(owned.selectOptions(input.options));
      postInitTasks.push(initializeExtensions(nativeSession, {
        mode: 'rpc', uiContext: interaction.ui,
        reportSendError: () => owned?.fail(), reportRuntimeError: () => owned?.fail(), onShutdown: onFatal,
      }));
      const sessionWarmingMode = input.sessionWarmingMode;
      const startupWarming = sessionWarmingMode !== undefined && sessionWarmingMode !== null
        ? Promise.resolve().then(() => warming.apply(sessionWarmingMode))
        : warming.read(input.workspaceId, '0').then(w => warming.apply(w.mode));
      postInitTasks.push(startupWarming.catch(() => { }));
      await Promise.all(postInitTasks);
      await initialPolicyCapture;
      owned.syncTodoAutoClear();
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

  private lastSelectedOptions?: { key: string; modelsFileStamp: string };

  private async selectOptions(options: CapturedSendOptions): Promise<void> {
    // Root options select only the model and thinking effort; OMP owns root tools.
    const mode = this.modeController.mode();
    if (mode.kind === 'plan' && mode.status === 'active') return;
    const fallback = this.session.model ? { providerId: this.session.model.provider, modelId: this.session.model.id } : null;
    const providerId = options.providerId ?? fallback?.providerId;
    const modelId = options.modelId ?? fallback?.modelId;
    if (!providerId || !modelId) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected model is unavailable');
    const optionsKey = JSON.stringify({ providerId, modelId, variant: options.variant, reasoningEffort: options.reasoningEffort, agentId: options.agentId });
    const previous = this.lastSelectedOptions;
    if (previous?.key === optionsKey && this.session.isStreaming) return;
    const modelsFileStamp = this.catalogs.models.modelsFileStamp();
    if (previous?.key === optionsKey && previous.modelsFileStamp === modelsFileStamp) return;
    const selected = await this.catalogs.resolveSelection({ providerId, modelId }, { variant: options.variant, reasoningEffort: options.reasoningEffort });
    await this.session.setModelTemporary(selected.nativeModel);
    if (selected.reasoningEffort !== null || options.variant !== null || options.reasoningEffort !== null) {
      const effort = this.session.getAvailableEffortSelectors().find(selector => selector === (selected.reasoningEffort ?? 'off'));
      if (effort === undefined && selected.nativeModel.reasoning) throw new ProjectionError(422, 'MODEL_UNAVAILABLE', 'Selected model effort is unavailable');
      if (effort !== undefined) this.session.setThinkingLevel(effort);
    }
    const profile = options.agentId ? await this.catalogs.agents.profile(options.agentId) : null;
    if (profile && profile.allowedTools !== null) {
      const available = this.session.getAllToolInfos();
      if (profile.allowedTools.some(name => !available.some(tool => tool.name === name))) throw new ProjectionError(422, 'UNSUPPORTED_CAPABILITY', 'Selected profile tool is unavailable');
      await this.session.setActiveToolsByName([...profile.allowedTools]);
    } else if (this.admission.profile) {
      await this.session.restoreNonMCPToolPresentation(this.defaultToolNames, this.defaultMountedNames, this.defaultRegisteredNames);
    }
    this.admission.profile = profile;
    this.lastSelectedOptions = { key: optionsKey, modelsFileStamp };
  }

  seed(): ProjectionSeed {
    const seed = this.projection.seed();
    return this.loopState.active ? { ...seed, loop: this.loopState } : seed;
  }
  get continuationPending(): boolean { return this.modeController.goal.continuationPending; }
  mode() { return this.modeController.mode(); }

  private publishContinuationPending(): void {
    const pending = this.continuationPending;
    if (pending === this.publishedContinuationPending) return;
    this.publishedContinuationPending = pending;
    this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', continuationPending: pending } }]);
  }

  private emit(inputs: ProjectionInput[]): void { if (!this.closed && inputs.length !== 0) this.publish(inputs); }

  private fail(cause?: unknown): void {
    if (this.failed) return;
    this.failed = true;
    try {
      const detail = cause instanceof Error ? cause.name : 'unknown';
      process.stderr.write(`${JSON.stringify({ type: 'openchamber.diagnostic', level: 'error', code: 'WORKER_SESSION_FAILED', detail })}\n`);
    } catch { /* diagnostics never affect lifecycle */ }
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

  private cancelTodoAutoClearTimer(): void {
    this.todoAutoClearGeneration++;
    this.todoAutoClearSnapshotKey = undefined;
    this.todoAutoClearDelaySeconds = undefined;
    if (this.todoAutoClearTimer) {
      clearTimeout(this.todoAutoClearTimer);
      this.todoAutoClearTimer = undefined;
    }
  }

  private syncTodoAutoClear(): void {
    if (this.closed || this.failed) {
      this.cancelTodoAutoClearTimer();
      return;
    }
    const phases = this.session.getTodoPhases();
    const branch = this.session.sessionManager.getBranch();
    if (phases.length === 0 || getTodoHudVisibility(branch, phases) === 'dismissed') {
      this.cancelTodoAutoClearTimer();
      return;
    }
    const tasks = phases.flatMap(phase => phase.tasks);
    if (tasks.length === 0 || tasks.some(task => !isClosedTodo(task))) {
      this.cancelTodoAutoClearTimer();
      return;
    }
    const delaySeconds = cfgTasksTodoClearDelay.get(this.session.settings);
    if (typeof delaySeconds !== 'number' || !Number.isFinite(delaySeconds) || delaySeconds < 0) {
      this.cancelTodoAutoClearTimer();
      return;
    }
    const snapshotKey = JSON.stringify(phases);
    if (
      this.todoAutoClearTimer !== undefined &&
      this.todoAutoClearSnapshotKey === snapshotKey &&
      this.todoAutoClearDelaySeconds === delaySeconds
    ) {
      return;
    }
    this.cancelTodoAutoClearTimer();
    this.todoAutoClearSnapshotKey = snapshotKey;
    this.todoAutoClearDelaySeconds = delaySeconds;
    const generation = this.todoAutoClearGeneration;
    const sessionId = this.session.sessionManager.getSessionId();
    const sessionFile = this.session.sessionManager.getSessionFile();
    const isCurrent = (): boolean =>
      !this.closed &&
      !this.failed &&
      !this.controllingBranch &&
      generation === this.todoAutoClearGeneration &&
      this.session.sessionManager.getSessionId() === sessionId &&
      this.session.sessionManager.getSessionFile() === sessionFile &&
      JSON.stringify(this.session.getTodoPhases()) === snapshotKey;
    const persistAndHide = async (): Promise<void> => {
      this.todoAutoClearTimer = undefined;
      this.todoAutoClearSnapshotKey = undefined;
      this.todoAutoClearDelaySeconds = undefined;
      await this.session.settleInFlightMessagePersistence();
      await this.binding;
      if (!isCurrent()) return;
      const data = createTodoHudStateData(this.session.sessionManager.getBranch(), this.session.getTodoPhases(), 'dismissed');
      if (!data) return;
      this.session.sessionManager.appendCustomEntry(TODO_HUD_STATE_CUSTOM_TYPE, data);
      await this.session.sessionManager.flush();
      if (!isCurrent()) return;
      const todoUpdate = this.projection.syncTodosIfChanged(Date.now());
      if (todoUpdate) this.emit([todoUpdate]);
    };
    this.todoAutoClearTimer = setTimeout(() => {
      void persistAndHide().catch(() => {
        // Best-effort HUD auto-clear persistence; leave todos intact if persistence fails.
      });
    }, delaySeconds * 1000);
    this.todoAutoClearTimer.unref?.();
  }
  /**
   * A recap is only meaningful for a settled session: a pending turn, an
   * active loop iteration or a transition would describe work still in motion.
   */
  private idleRecapBlocked(): boolean {
    // No turn reference here: `promptTask` stays assigned after a turn completes
    // (hosts await it as the settled handle), so it would block every recap.
    return this.closed || this.failed || this.compacting || this.controllingBranch
      || this.planReviewTask !== undefined;
  }

  /** A loop with turns left keeps IdleMaintenance waiting rather than recapping a partial run. */
  private scheduledTurn(): boolean {
    return this.loopState.active || this.publishedContinuationPending;
  }

  /** Live refs plus persisted ones, scoped to this session's artifact tree. */
  private hubRefs(): AgentRef[] {
    return AgentRegistry.global().list().filter(ref => ref.id !== MAIN_AGENT_ID
      && (ref.sessionFile === null || sessionFileBelongsToRoot(ref.sessionFile, this._sessionFile)));
  }

  private hubRoster(): Subagent[] {
    const nonNegativeInt = (value: number | undefined): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : undefined;
    return this.hubRefs().map(ref => {
      const live = this.liveSubagents.get(ref.id);
      const persisted = ref.sessionFile !== null && !this.liveSubagents.has(ref.id);
      // Persisted refs derive timestamps from fs.stat `mtimeMs` (often floats);
      // canonical TimestampSchema requires safe integers, so truncate here.
      const createdAt = nonNegativeInt(live?.createdAt) ?? nonNegativeInt(ref.createdAt);
      const updatedAt = nonNegativeInt(live?.updatedAt) ?? nonNegativeInt(ref.lastActivity);
      const tokens = nonNegativeInt(live?.tokens);
      const contextTokens = nonNegativeInt(live?.contextTokens);
      const contextWindow = typeof live?.contextWindow === 'number' && Number.isFinite(live.contextWindow) && live.contextWindow > 0 ? Math.trunc(live.contextWindow) : undefined;
      const turnCount = nonNegativeInt(live?.turnCount);
      return {
        subagentId: ref.id,
        parentSessionId: this._sessionId,
        ...(live?.childSessionId === undefined ? {} : { childSessionId: live.childSessionId }),
        ...(live?.toolCallId === undefined ? {} : { toolCallId: live.toolCallId }),
        name: live?.name ?? (ref.displayName || ref.id),
        role: live?.role ?? ref.displayName,
        ...(live?.solutionSpace === undefined ? {} : { solutionSpace: live.solutionSpace }),
        status: live?.status ?? (persisted ? 'parked' : 'idle'),
        ...(live?.activeTool === undefined ? {} : { activeTool: live.activeTool }),
        ...(live?.activeToolCallId === undefined ? {} : { activeToolCallId: live.activeToolCallId }),
        ...(live?.activeToolArgs === undefined ? {} : { activeToolArgs: live.activeToolArgs }),
        ...(live?.model === undefined ? {} : { model: live.model }),
        ...(tokens === undefined ? {} : { tokens }),
        ...(contextTokens === undefined ? {} : { contextTokens }),
        ...(contextWindow === undefined ? {} : { contextWindow }),
        ...(live?.cost === undefined ? {} : { cost: live.cost }),
        ...(ref.history?.directCost === undefined ? {} : { directCost: ref.history.directCost }),
        ...(turnCount === undefined ? {} : { turnCount }),
        ...(live?.retryCountdown === undefined ? {} : { retryCountdown: live.retryCountdown }),
        ...(live?.depth === undefined ? {} : { depth: live.depth }),
        ...(live?.parentSubagentId !== undefined ? { parentSubagentId: live.parentSubagentId } : ref.parentId === undefined ? {} : { parentSubagentId: ref.parentId }),
        ...(live?.description === undefined ? {} : { description: live.description }),
        ...(live?.task === undefined ? {} : { task: live.task }),
        ...(live?.lastIntent === undefined ? {} : { lastIntent: live.lastIntent }),
        ...(live?.stage === undefined ? {} : { stage: live.stage }),
        ...(live?.completionPercent === undefined ? {} : { completionPercent: live.completionPercent }),
        ...(live?.recentOutput === undefined ? {} : { recentOutput: live.recentOutput }),
        ...(live?.durationMs === undefined ? {} : { durationMs: live.durationMs }),
        ...(ref.sessionFile === null ? {} : { sessionFile: ref.sessionFile }),
        ...(persisted ? { persisted: true } : {}),
        ...(createdAt === undefined ? {} : { createdAt }),
        ...(updatedAt === undefined ? {} : { updatedAt }),
      };
    });
  }

  /** Direct spend plus every descendant's, walking the parent links. */
  private hubTreeCost(): { sessionId: string; directCost: number; treeCost: number } {
    const rows = this.hubRefs();
    const byId = new Map(rows.map(row => [row.id, row]));
    const own = new Map(rows.map(row => [row.id, row.history?.directCost ?? 0]));
    const children = new Map<string, AgentRef[]>();
    for (const row of rows) {
      if (row.parentId === undefined) continue;
      children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
    }
    const directCost = rows.reduce((total, row) => total + (own.get(row.id) ?? 0), 0);
    const walked = new Set<string>();
    let treeCost = 0;
    const walk = (id: string): number => {
      if (walked.has(id)) return 0;
      walked.add(id);
      return (children.get(id) ?? []).reduce((total, child) => total + walk(child.id), own.get(id) ?? 0);
    };
    for (const row of rows) {
      if (row.parentId !== undefined && byId.has(row.parentId)) continue;
      treeCost += walk(row.id);
    }
    return { sessionId: this._sessionId, directCost, treeCost };
  }

  private async hubTranscript(subagentId: string): Promise<SubagentTranscriptResponse> {
    const ref = this.hubRefs().find(candidate => candidate.id === subagentId);
    if (!ref || ref.sessionFile === null) throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'The subagent transcript is unavailable');
    const text = await readFile(ref.sessionFile, 'utf8').catch(() => {
      throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'The subagent transcript is unavailable');
    });
    const entries: SubagentTranscriptEntry[] = [];
    for (const entry of agentTranscriptSource.parseEntries(text)) {
      if (entry.type !== 'message') continue;
      // The parser returns the SDK message union, so blocks are read structurally.
      const message = entry.message as { role: string; content?: unknown; provider?: string; model?: string };
      const parts: Array<{ type?: string; text?: string; name?: string }> = Array.isArray(message.content) ? message.content : [];
      const textParts: string[] = [];
      const toolCalls: string[] = [];
      for (const part of parts) {
        if (part.type === 'text' && part.text) textParts.push(part.text);
        if (part.type === 'toolCall' && part.name) toolCalls.push(part.name);
      }
      if (textParts.length === 0 && toolCalls.length === 0) continue;
      const role = message.role === 'user' ? 'user' : message.role === 'assistant' ? 'assistant' : 'system';
      entries.push({
        entryId: String(entry.id ?? `${subagentId}-${entries.length}`),
        role,
        text: textParts.join('\n'),
        createdAt: typeof entry.timestamp === 'number' && entry.timestamp > 0 ? entry.timestamp : Date.now(),
        ...(message.provider === undefined ? {} : { providerId: message.provider }),
        ...(message.model === undefined ? {} : { modelId: message.model }),
        toolCalls,
      });
    }
    return { subagentId, sessionFile: ref.sessionFile, entries };
  }


  private async handleLoopTurnEnd(): Promise<void> {
    if (!this.loopState.active) return;
    if (this.loopState.maxIterations && this.loopState.iteration >= this.loopState.maxIterations) {
      this.loopState = { ...this.loopState, active: false };
      this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', loop: this.loopState } }]);
      return;
    }
    if (this.loopDurationMs && this.loopStartedAtMs && (Date.now() - this.loopStartedAtMs >= this.loopDurationMs)) {
      this.loopState = { ...this.loopState, active: false };
      this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', loop: this.loopState } }]);
      return;
    }
    if (this.loopCondition) {
      const verdict = await evaluateLoopCondition(this.loopCondition, {
        cwd: this.cwd,
        timeoutMs: 30000,
        sessionId: this.sessionId,
      });
      if (verdict.kind === 'halt' || verdict.kind === 'error') {
        this.loopState = { ...this.loopState, active: false };
        this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', loop: this.loopState } }]);
        return;
      }
    }
    this.loopState = { ...this.loopState, iteration: this.loopState.iteration + 1 };
    this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', loop: this.loopState } }]);
    if (this.loopState.prompt) {
      setTimeout(() => {
        void this.session.prompt(this.loopState.prompt!).catch(() => { });
      }, 50);
    }
  }

  private async prepare(operation: PromptOperation): Promise<PreparedPrompt> {
    const { input, options } = operation.request;
    await this.selectOptions(options);
    let text = input.text;
    const contextMessages: PreparedPrompt['context'] = [];
    const turnBudget = parseTurnBudget(text);
    this.session.sessionManager.beginTurnBudget(turnBudget?.total ?? null, turnBudget?.hard ?? false);
    for (const keyword of MAGIC_KEYWORDS) {
      if (!containsMagicKeyword(text, keyword.word)) continue;
      if (keyword.id === 'ultrathink') {
        const targetLevel = parseConfiguredThinkingLevel('xhigh');
        if (targetLevel) await this.session.setThinkingLevel(targetLevel);
      }
      const magicContext: MagicKeywordContext = {
        tools: this.session.getEnabledToolNames(),
        taskBatch: true,
        scoutAvailable: true,
        evalTools: true,
        py: true,
        js: true,
        freshAgents: false,
        perCallModel: false,
      };
      if (keyword.requires.every(tool => magicContext.tools.includes(tool))) {
        contextMessages.push({
          role: 'custom',
          customType: `${keyword.id}-notice`,
          content: keyword.notice(magicContext),
          display: false,
          attribution: 'user',
          timestamp: Date.now(),
        });
      }
    }
    const invocation = /^\/skill:([^\s]+)(?:\s+([\s\S]*))?$/.exec(text);
    if (invocation) text = await this.catalogs.skills.preparePrompt(invocation[1]!, invocation[2] ?? '');
    for (const context of input.context) {
      // A user-requested skill expansion stays a developer instruction. Captured
      // context and user pins travel as hidden user text: plain OMP never sees
      // app-authored custom/developer messages for them.
      if (context.kind === 'instruction') contextMessages.push({ role: 'developer' as const, content: context.text, timestamp: Date.now() });
      else if (context.text) contextMessages.push({ role: 'user' as const, content: context.text, synthetic: true, timestamp: Date.now() });
    }
    const images: NonNullable<PromptOptions['images']> = [];
    for (const attachment of input.attachments) {
      const reference = operation.attachments?.find(item => item.attachmentId === attachment.attachmentId);
      if (!reference) throw new ProjectionError(400, 'INVALID_REQUEST', 'Attachment has no Host-resolved file');
      if (attachment.mediaType.startsWith('image/')) {
        images.push({ type: 'image', data: (await readFile(reference.path)).toString('base64'), mimeType: attachment.mediaType });
        continue;
      }
      // Inlinable text travels as delimited context: OMP renders a
      // `fileMention` as `<file path="…">…</file>`. A binary or oversized
      // attachment instead becomes a usable `read` target — never a rejection,
      // and never a private Host absolute path: the copy lands in the session's
      // own `local://` scratch root, which OMP serves at read tier and
      // containment-checks on resolve.
      const { size } = await stat(reference.path);
      const binary = await isProbablyBinary(reference.path);
      if (!binary && size <= MAX_INLINE_ATTACHMENT_BYTES) {
        // The size gate above already bounds this; a slice would silently hand
        // the model a truncated file it believes is complete.
        const content = await readFile(reference.path, 'utf8');
        contextMessages.push({ role: 'fileMention', files: [{ path: attachment.name, content }], timestamp: Date.now() });
        continue;
      }
      const relativePath = await materializeAttachmentForRead(this.session.sessionManager, reference.path, attachment);
      const reason = binary ? 'binary file' : 'too large';
      contextMessages.push({
        role: 'fileMention',
        files: [{
          path: `local://${relativePath}`,
          content: `(skipped auto-read: ${reason}, ${formatBytes(size)}). Read this file to inspect it.`,
          byteSize: size,
          skippedReason: binary ? 'binary' : 'tooLarge',
        }],
        timestamp: Date.now(),
      });
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
    if (this.preparation || this.projection.activeRun() || this.session.isRunActive) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
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
      if (this.preparation || this.projection.activeRun() || this.session.isRunActive) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
      const before = this.projection.seed();
      if (before.branch.branchId !== request.branchId || before.branch.branchVersion !== request.branchVersion) {
        throw new ProjectionError(409, 'SESSION_BRANCH_CONFLICT', 'The selected branch has changed');
      }
      previousLeaf = manager.getLeafId();
      previousRevert = selectedBranchRevert(manager.getBranch());
      if (request.action === 'revert' && previousRevert?.revertedMessageId === request.messageId) {
        throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Native tree navigation was not committed');
      }
      const targetId = request.action === 'revert'
        ? resolveCanonicalMessage(manager, this.sessionId, request.messageId, true) : previousRevert?.restoreLeafId;
      if (!targetId || targetId === previousLeaf) {
        throw new ProjectionError(409, !targetId ? 'SESSION_BRANCH_CONFLICT' : 'COMMAND_IN_FLIGHT',
          !targetId ? 'The requested branch selection is unavailable' : 'Native tree navigation was not committed');
      }
      const targetMessage = request.action === 'revert' ? before.messages.find(message => message.messageId === request.messageId) : undefined;
      navigationStarted = true;
      const navigation = await this.session.navigateTree(targetId, { summarize: false, allowAskReopen: false });
      navigated = manager.getLeafId() !== previousLeaf;
      if (navigation.cancelled || navigation.aborted || navigation.reopenAsk || !navigated) {
        throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Native tree navigation was not committed');
      }
      await manager.appendEntriesAtomically(() => manager.appendCustomEntry(BRANCH_TYPE, {
        restoreLeafId: request.action === 'revert' ? previousRevert?.restoreLeafId ?? previousLeaf : null,
        revertedMessageId: request.action === 'revert' ? request.messageId : null,
      }));
      this.projection.resetSelection();
      this.syncTodoAutoClear();
      const seed = this.seed();
      this.permissionBridge?.reset();
      this.interaction.cancelAll();
      return {
        type: 'branch', seed, result: {
          sessionId: this.sessionId, branch: seed.branch,
          draft: navigation.editorText === undefined ? null : {
            text: this.projection.publicText(navigation.editorText),
            attachments: targetMessage?.parts.flatMap(part => part.type === 'attachment'
              ? [{ attachmentId: part.attachmentId, mediaType: part.mediaType, name: part.name, size: part.size, uri: part.uri }] : []) ?? []
          },
        }
      };
    } catch (error) {
      if (navigationStarted && (navigated || manager.getLeafId() !== previousLeaf)) {
        this.permissionBridge?.reset();
        this.interaction.cancelAll();
        try {
          if (previousLeaf === null) manager.resetLeaf(); else await this.session.navigateTree(previousLeaf, { summarize: false, allowAskReopen: false });
          await manager.appendEntriesAtomically(() => manager.appendCustomEntry(BRANCH_TYPE, previousRevert ?? { restoreLeafId: null, revertedMessageId: null }));
          this.projection.resetSelection();
          this.syncTodoAutoClear();
          await this.modeController.restore();
          await this.modeController.goal.reconcile();
        } catch {
          this.fail();
          throw new ProjectionError(503, 'SESSION_RESTORE_FAILED', 'The prior native branch selection could not be persisted');
        }
      }
      if (error instanceof ProjectionError) throw error;
      throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', error instanceof Error ? error.message : 'Native tree navigation was not committed');
    } finally { this.controllingBranch = false; }
  }

  private async proposePlan(title: string) {
    const result = await this.session.preparePlanForReview(title);
    const details = result.details;
    if (!details) throw new Error('Native plan preparation did not return plan details');
    const reference = details.planFilePath;
    // Reject host paths before opening the OMP reader or publishing any payload.
    PlanReferenceSchema.parse(reference);
    const localProtocolOptions = {
      getArtifactsDir: () => this.session.sessionManager.getArtifactsDir(),
      getSessionId: () => this.session.sessionManager.getSessionId(),
    };
    const localRoot = await realpath(resolveLocalRoot(localProtocolOptions));
    const locatedPath = await InternalUrlRouter.instance().locate(reference, { cwd: this.cwd, localProtocolOptions });
    if (!locatedPath) throw new Error('The proposed session-local plan is missing');
    const resolvedPlanPath = await realpath(locatedPath);
    const pathWithinRoot = relative(localRoot, resolvedPlanPath);
    if (pathWithinRoot === '' || pathWithinRoot.startsWith(`..${sep}`) || pathWithinRoot === '..' || isAbsolute(pathWithinRoot)) {
      throw new Error('The proposed plan resolves outside the session-local artifact root');
    }
    const planText = await readPlanFile(reference, { cwd: this.cwd, localProtocolOptions });
    if (!planText?.trim()) throw new Error('The proposed session-local plan is empty or missing');
    const review = PlanReviewSchema.parse({ type: 'plan-review', title: details.title, planReference: reference, planText });
    const revision = this.planRevision + 1;
    this.interaction.requestPlanReview({ ...review, title: this.projection.publicText(review.title), planText: this.projection.publicText(review.planText) }, response => {
      if (!response || response.action === 'reject') return;
      this.reviewingPlan = true;
      this.planReviewTask = this.continuePlanReview(response, review, revision).catch(() => { if (!this.closed) this.fail(); }).finally(() => { this.reviewingPlan = false; });
    });
    this.planRevision = revision;
    // Complete propose without waiting for human input: the planning run
    // must settle before an origin:plan run can own the next execution turn.
    return result;
  }

  private async continuePlanReview(response: PlanReviewResponse, review: { title: string; planReference: string; planText: string }, revision: number): Promise<void> {
    await this.promptTask;
    await this.binding;
    if (this.closed || this.failed || revision !== this.planRevision || this.modeController.mode().kind !== 'plan') return;
    if (response.action === 'reject') return;
    if (response.action === 'feedback') {
      this.reviewingPlan = false;
      void this.startWorkerRun('plan', async () => { await this.session.prompt(response.feedback); return true; }).catch(() => this.fail());
      return;
    }
    let targetExecutionModel: Model | undefined;
    if (response.executionModel) {
      targetExecutionModel = this.session.modelRegistry.find(response.executionModel.providerId, response.executionModel.modelId);
      if (!targetExecutionModel) {
        // Validation error: resolve failed review without crashing the worker session
        this.reviewingPlan = false;
        this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', mode: this.modeController.mode() } }]);
        return;
      }
    }
    if (isPlanAutosaveEnabled(this.session.settings)) {
      await autosaveApprovedPlan({
        settings: this.session.settings,
        cwd: this.cwd,
        title: review.title,
        planContent: review.planText,
      }).catch(() => { });
    }
    const compact = response.action === 'approve-compact';
    if (compact) this.session.markPlanInternalAbortPending();
    try {
      await this.modeController.approve(compact ? async () => {
        this.session.setPlanReferencePath(review.planReference);
        try {
          const previousCompaction = this.lastEmittedCompaction;
          const result = await this.session.compact(undefined, { internalGuidance: nativePrompt.render(planCompactPrompt, { planFilePath: review.planReference }), suppressContinuation: true });
          if (!this.lastEmittedCompaction || this.lastEmittedCompaction === previousCompaction) {
            const completedAt = Date.now();
            this.emit([{ timestamp: completedAt, event: { type: 'session.compacted', compactionId: randomUUID(), tokensBefore: result.tokensBefore, completedAt } }]);
          }
        } catch (error) {
          // Compaction is best-effort: an already-compacted or too-small session
          // must not cancel the plan the user approved.
          if (this.closed || this.failed) throw error;
        }
      } : undefined);
    } finally { this.session.clearPlanInternalAbortPending(); }
    if (targetExecutionModel) {
      await this.session.setModelTemporary(targetExecutionModel);
      this.emit([{
        timestamp: Date.now(), event: {
          type: 'session.updated', mode: this.modeController.mode(), selection: {
            model: { providerId: targetExecutionModel.provider, modelId: targetExecutionModel.id },
            thinkingLevel: this.session.configuredThinkingLevel() ?? null,
          }
        }
      }]);
    } else {
      this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', mode: this.modeController.mode() } }]);
    }
    if (this.closed || this.failed || revision !== this.planRevision) return;
    this.session.setPlanReferencePath(review.planReference);
    const text = nativePrompt.render(planApprovedPrompt, { planFilePath: review.planReference, planContent: review.planText, contextPreserved: true });
    this.session.markPlanReferenceSent();
    this.reviewingPlan = false;
    void this.startWorkerRun('plan', async () => { await this.session.prompt(text); return true; }).catch(() => this.fail());
  }

  /** Start a turn initiated by OMP, without creating or retaining a Host prompt. */
  startWorkerRun(origin: Exclude<RunOrigin, 'host'>, start: () => Promise<boolean>): Promise<boolean> {
    if (this.closed || this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Worker session is unavailable');
    if (this.controllingBranch) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Native branch selection is in progress');
    if (this.preparation || this.projection.activeRun()) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
    const runId = randomUUID();
    this.emit(this.projection.beginRun(runId, Date.now(), [], origin));
    this.publishContinuationPending();
    const task = (async () => {
      try {
        await this.stopAutoTitle();
        this.suggestionDriver.cancel();
        await this.session.sessionManager.flush();
        const dispatched = await start();
        if (dispatched) await this.session.waitForRunEnd();
        await this.bind();
        await this.modeController.settleTransition();
        if (!dispatched && this.projection.activeRun()?.runId === runId) {
          this.emit(this.projection.completeRun(Date.now()));
          await this.session.sessionManager.flush();
        }
        return dispatched;
      } catch (error) {
        if (this.projection.activeRun()?.runId === runId) {
          this.emit(this.cancellingRunId === runId
            ? this.projection.cancelRun(Date.now(), runId) : this.projection.failRun('Agent execution failed', Date.now()));
        }
        throw error;
      }
    })();
    this.promptTask = task.then(() => { }, () => { });
    return task;
  }
  async toggleHostTool(toolName: HostToolName, enabled: boolean): Promise<void> {
    await this.hostToolsController?.toggle(toolName, enabled);
  }

  async configureHostTools(tools: Partial<Record<HostToolName, boolean>>): Promise<void> {
    await this.hostToolsController?.configure(tools);
  }

  /** Stop an in-flight background title before a user turn or disposal touches provider settings. */
  private async stopAutoTitle(): Promise<void> {
    this.titleAbort?.abort();
    const generation = this.titleGeneration;
    if (generation) await generation;
  }

  /** Start one best-effort title attempt once the session is idle and still unnamed. */
  private scheduleAutoTitle(): void {
    if (this.closed || this.failed || process.env.PI_NO_TITLE || this.titleGeneration || this.session.isRunActive || this.projection.activeRun() || this.cancellingRunId || this.session.sessionManager.getSessionName()) return;
    const turns = this.projection.seed().turns;
    if (!turns.some(turn => turn.status === 'completed')) return;
    const text = this.pendingTitleInput || firstUserMessageText(this.session.agent.state.messages);
    const context = deferredTitleContext({
      messages: this.session.agent.state.messages,
      sessionName: this.session.sessionManager.getSessionName(),
    });
    if (!text && !context) return;
    const controller = new AbortController();
    const generation = (async () => {
      try {
        const model = this.session.model;
        if (!model) return;
        const title = text ? await this.generateTitleFrom(text, controller) : null;
        if (controller.signal.aborted || this.closed || this.session.sessionManager.getSessionName()) return;
        if (title) {
          await this.session.sessionManager.setSessionName(title, 'auto');
          await this.session.sessionManager.flush();
          this.pendingTitleInput = undefined;
          return;
        }
        if (!context) return;
        const retitled = await this.generateTitleFrom(context, controller, DEFERRED_TITLE_SYSTEM_PROMPT);
        if (!retitled || controller.signal.aborted || this.closed || this.session.sessionManager.getSessionName()) return;
        await this.session.sessionManager.setSessionName(retitled, 'auto');
        await this.session.sessionManager.flush();
        this.pendingTitleInput = undefined;
      } catch {
        // A refused or unavailable title provider leaves the session untitled; it never fails the user run.
      }
    })();
    this.titleAbort = controller;
    this.titleGeneration = generation;
    void generation.finally(() => {
      if (this.titleGeneration === generation) this.titleGeneration = undefined;
      if (this.titleAbort === controller) this.titleAbort = undefined;
    });
  }

  private async generateTitleFrom(source: string, controller: AbortController, customSystemPrompt?: string): Promise<string | null> {
    return generateSelectedModelTitle({
      session: this.session,
      settings: this.session.settings,
      firstMessage: source,
      authorize: this.authorizeProviderUse,
      signal: controller.signal,
      customSystemPrompt,
    });
  }

  operation(operation: WorkerOperation): Promise<WorkerOperationResult> {
    const task = this.executeOperation(operation);
    this.operations.add(task);
    void task.then(() => this.operations.delete(task), () => this.operations.delete(task));
    return task;
  }

  private async mcpResult(request: Extract<WorkerOperation, { type: 'mcp' }>['operation']): Promise<WorkerOperationResult> {
    if (!this.mcp) throw new ProjectionError(503, 'MCP_APPLY_FAILED', 'MCP runtime ownership is unavailable');
    switch (request.type) {
      case 'read': return { type: 'mcp', result: { type: 'catalog', catalog: this.mcp.read(request.configuration) } };
      case 'persist': return { type: 'mcp', result: { type: 'persisted', configuration: await this.mcp.persist(request.request, request.configuration) } };
      case 'apply': return { type: 'mcp', result: { type: 'applied', result: await this.mcp.apply(request.request, request.configuration) } };
      case 'reconnect': return { type: 'mcp', result: { type: 'catalog', catalog: await this.mcp.reconnect(request.serverId, request.request, request.configuration) } };
      case 'oauth.status': return { type: 'mcp', result: { type: 'oauth', result: await this.mcp.oauthRead(request.serverId, request.configuration) } };
      case 'oauth': return { type: 'mcp', result: { type: 'oauth', result: await this.mcp.oauthExecute(request.serverId, request.request, request.configuration) } };
      case 'test': return { type: 'mcp', result: { type: 'tested', result: await this.mcp.test(request.serverId, request.configuration) } };
      case 'secret.write': throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'MCP credential writes belong to the workspace owner');
      case 'discover': throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'MCP tool discovery belongs to the workspace owner');
    }
  }

  private async executeOperation(operation: WorkerOperation): Promise<WorkerOperationResult> {
    if (this.closed || this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Worker session is unavailable');
    if (this.controllingBranch) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Native branch selection is in progress');
    if ((this.compacting || this.session.isCompacting) && !['compact.abort', 'abort', 'history', 'question.resolve', 'approval.resolve'].includes(operation.type)) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Session compaction is in progress');
    if (this.reviewingPlan && !['compact.abort', 'abort', 'question.resolve', 'history'].includes(operation.type)) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Plan review transition is in progress');
    switch (operation.type) {
      case 'goal': {
        const request = operation;
        if (request.op === 'create' && (request.providerId || request.modelId || request.variant !== undefined || request.reasoningEffort !== undefined)) {
          await this.selectOptions({ providerId: request.providerId ?? null, modelId: request.modelId ?? null, agentId: null, variant: request.variant ?? null, reasoningEffort: request.reasoningEffort ?? null });
        }
        if (request.op === 'create' || request.op === 'resume') {
          if (this.preparation || this.projection.activeRun() || this.session.isRunActive || this.continuationPending) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        }
        if (request.op === 'create' && !request.objective?.trim()) throw new ProjectionError(400, 'INVALID_REQUEST', 'A goal objective is required');
        if (request.op === 'create' && ['plan', 'vibe'].includes(this.mode().kind)) await this.modeController.set('main');
        if (request.op === 'pause' || request.op === 'drop') this.modeController.stopForHostAbort();
        try {
          await this.modeController.goal.handle({ op: request.op, objective: request.objective, token_budget: request.tokenBudget ?? undefined });
        } catch (error) {
          throw new ProjectionError(400, 'INVALID_REQUEST', error instanceof Error ? error.message : 'Goal operation failed');
        }
        if (request.op === 'drop' && this.modeController.mode().kind === 'goal') this.session.sessionManager.appendModeChange('none');
        this.publishedContinuationPending = this.continuationPending;
        const mode = this.modeController.mode();
        this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', mode, continuationPending: this.continuationPending } }]);
        return { type: 'goal', mode };
      }
      case 'mode.set': {
        const currentMode = this.modeController.mode();
        const isDisarming = operation.mode === 'main' && currentMode.kind === 'plan' && currentMode.status === 'armed';
        const isDeferredPlan = operation.mode === 'plan' && this.session.isRunActive;
        if (!isDeferredPlan && !isDisarming && (this.preparation || this.projection.activeRun() || this.session.isRunActive || this.continuationPending)) {
          throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        }
        const mode = await this.modeController.set(operation.mode);
        this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', mode } }]);
        return { type: 'mode.set', mode };
      }
      case 'session.rename': {
        await this.binding;
        if (!await this.session.sessionManager.setSessionName(operation.title, 'user')) throw new ProjectionError(400, 'INVALID_REQUEST', 'Session title is empty');
        await this.session.sessionManager.flush();
        const title = this.session.sessionManager.getSessionName();
        if (!title) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Session title was not persisted');
        return { type: 'session.rename', title };
      }
      case 'web-search': {
        if (operation.operation.type !== 'apply') throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Search mutations require their workspace owner');
        const result = await this.webSearch.operation(operation.operation);
        await this.session.reconcileBuiltinTools();
        return { type: 'web-search', result };
      }
      case 'host-tools.toggle': {
        await this.toggleHostTool(operation.toolName as HostToolName, operation.enabled);
        return { type: 'host-tools.toggle', enabled: operation.enabled };
      }
      case 'host-tools.configure': {
        await this.configureHostTools(operation.tools as Partial<Record<HostToolName, boolean>>);
        return { type: 'host-tools.configure', configured: true };
      }
      case 'catalog': {
        const applying = operation.operation.type === 'skills.apply';
        if (applying && this.skillsApplying) throw new ProjectionError(409, 'CATALOG_CONFLICT', 'Skill application is already active');
        if (applying) this.skillsApplying = true;
        try {
          const result = await this.catalogs.operation(operation.operation, operation.revision);
          if (operation.operation.type === 'skills.apply' && result.type === 'skills.applied' && result.result.outcome === 'applied') this.emit([{ timestamp: Date.now(), event: { type: 'catalog.updated', catalog: { kind: 'skills', state: this.catalogs.skills.read(operation.operation.sources) } } }]);
          if (operation.operation.type === 'catalog.settings.apply') this.syncTodoAutoClear();
          return { type: 'catalog', result };
        } finally { if (applying) this.skillsApplying = false; }
      }
      case 'btw.ask': {
        this.suggestionDriver.cancel();
        await this.stopAutoTitle();
        if (!this.session.isRunActive) {
          await this.promptTask;
          await this.bind();
        }
        const record = await this.btw.ask(operation.question, operation.recordId);
        return { type: 'btw.ask', recordId: record.id };
      }
      case 'btw.cancel':
        return { type: 'btw.cancel', cancelled: this.btw.cancel(operation.recordId) };
      case 'btw.branch': {
        if (this.controllingBranch) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Native branch selection is in progress');
        if (this.preparation || this.projection.activeRun() || this.session.isRunActive) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        const history = await this.btw.history();
        const record = history.find(r => r.id === operation.recordId);
        if (!record) throw new ProjectionError(404, 'SESSION_NOT_FOUND', `BTW record not found: ${operation.recordId}`);
        const currentLeafId = this.session.sessionManager.getLeafId() ?? '';
        if (record.status !== 'complete') {
          throw new ProjectionError(400, 'INVALID_REQUEST', 'Cannot branch from an incomplete /btw question');
        }
        const branch = this.session.sessionManager.getBranch();
        const recordIndex = branch.findIndex(entry => entry.id === record.leafId);
        if (!currentLeafId || recordIndex < 0 || branch.slice(recordIndex + 1).some(entry => entry.type !== 'model_usage')) {
          throw new ProjectionError(409, 'SESSION_BRANCH_CONFLICT', 'Session branch changed since /btw started');
        }
        const assistantMessage: AssistantMessage = {
          role: 'assistant',
          content: [{ type: 'text', text: record.answer }],
          api: 'chat',
          provider: this.session.model?.provider ?? 'native',
          model: this.session.model?.id ?? 'native',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: 'stop',
          timestamp: Date.now(),
        };
        const branchRes = await this.session.branchFromBtw(record.question, assistantMessage, currentLeafId, this.session.sessionManager.getSessionId());
        if (branchRes.cancelled) throw new ProjectionError(409, 'COMMAND_IN_FLIGHT', 'Branching from /btw was cancelled');
        if (branchRes.sessionFile) this._sessionFile = branchRes.sessionFile;
        const newSessionId = this.session.sessionManager.getSessionId();
        this._sessionId = newSessionId;
        // The native branch rekeys the root this worker serves. Shell jobs, the
        // Host tool scope, the MCP/skill catalog owner and the parent id of any
        // subagent all name that root, so they move with it; a stale id makes
        // the Host's root check refuse those reads with 503.
        this.shell.rekey(newSessionId);
        this.hostToolsController?.rekey(newSessionId);
        this.mcp?.rekey(newSessionId);
        this.workerIdentity.rootSessionId = newSessionId;
        this.projection = new WorkerProjection(this.session.sessionManager, newSessionId, [], () => this.session.getTodoPhases(), this.sanitizeProviderError);
        this.projection.resetSelection();
        this.syncTodoAutoClear();
        await this.session.sessionManager.flush();
        const seed = this.seed();
        return {
          type: 'btw.branch',
          sessionFile: branchRes.sessionFile,
          sessionId: newSessionId,
          rootSessionId: newSessionId,
          branch: seed.branch,
          seed,
        };
      }
      case 'subagent.steer': {
        const owned = this.liveSubagents.get(operation.subagentId);
        if (!owned || owned.parentSessionId !== this.sessionId) {
          throw new ProjectionError(404, 'SESSION_NOT_FOUND', `Subagent not found in this session: ${operation.subagentId}`);
        }
        const notRunning = `Subagent not running: ${operation.subagentId}`;
        try {
          const session = await AgentLifecycleManager.global().ensureLive(operation.subagentId);
          const accepted = Promise.withResolvers<void>();
          const unsubscribe = session.subscribe(event => {
            if (event.type === 'agent_start') accepted.resolve();
          });
          session.prompt(operation.message, { streamingBehavior: 'steer', throwOnDrop: true }).then(
            () => accepted.resolve(),
            err => accepted.reject(err),
          );
          try {
            await accepted.promise;
          } finally {
            unsubscribe();
          }
          return { type: 'subagent.steer', subagentId: operation.subagentId, accepted: true };
        } catch (error) {
          throw new ProjectionError(404, 'SESSION_NOT_FOUND', error instanceof Error ? error.message : notRunning);
        }
      }
      case 'subagent.cancel': {
        const owned = this.liveSubagents.get(operation.subagentId);
        if (!owned || owned.parentSessionId !== this.sessionId) {
          return { type: 'subagent.cancel', subagentId: operation.subagentId, cancelled: false };
        }
        const tan = this.activeTanSessions.get(operation.subagentId);
        if (tan) {
          await tan.abort();
          return { type: 'subagent.cancel', subagentId: operation.subagentId, cancelled: true };
        }
        const ref = AgentRegistry.global().get(operation.subagentId);
        if (!ref) {
          return { type: 'subagent.cancel', subagentId: operation.subagentId, cancelled: false };
        }
        await Promise.allSettled([
          AgentLifecycleManager.global().release(operation.subagentId, ref, { tombstone: true }),
          ref.session ? ref.session.abort({ reason: USER_INTERRUPT_LABEL }) : Promise.resolve(),
        ]);
        owned.status = 'cancelled';
        this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: { ...owned } } }]);
        return { type: 'subagent.cancel', subagentId: operation.subagentId, cancelled: true };
      }
      case 'subagent.revive': {
        let revived: AgentSessionHandle;
        try { revived = await AgentLifecycleManager.global().ensureLive(operation.subagentId); }
        catch { throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'The subagent is not revivable'); }
        // The instruction goes to the subagent's own session, so it is recorded
        // in that transcript and never attributed to the parent.
        if (operation.message !== undefined) await revived.prompt(operation.message, { streamingBehavior: 'steer', throwOnDrop: true });
        return { type: 'subagent.revive', subagentId: operation.subagentId, revived: true, prompted: operation.message !== undefined };
      }
      case 'subagents.list':
        return { type: 'subagents.list', subagents: this.hubRoster() };
      case 'subagents.transcript':
        return { type: 'subagents.transcript', transcript: await this.hubTranscript(operation.subagentId) };
      case 'subagents.tree-cost':
        return { type: 'subagents.tree-cost', cost: this.hubTreeCost() };

      case 'loop.stop': {
        this.loopState = { active: false, iteration: 0 };
        this.loopCondition = undefined;
        this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', loop: this.loopState } }]);
        return { type: 'loop.stop', stopped: true };
      }
      case 'command': {
        const parsed = parseSlashCommand(operation.text);
        if (!parsed || !isAllowedBuiltinCommand(parsed.name)) throw new ProjectionError(400, 'INVALID_REQUEST', 'Slash command is not allowed');
        const active = this.preparation || this.projection.activeRun() || this.session.isRunActive;
        if (active && !isReadOnlyBuiltinCommand(parsed.name)) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        if (active && parsed.name === 'jobs' && parsed.args.startsWith('kill')) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        if (active && parsed.name === 'usage' && parsed.args.startsWith('reset')) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        if (active && parsed.name === 'todo' && parsed.args) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        if (parsed.name === 'loop') {
          if (this.loopState.active && !parsed.args.trim()) {
            this.loopState = { active: false, iteration: 0 };
            this.loopCondition = undefined;
            this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', loop: this.loopState } }]);
            return { type: 'command', output: 'Loop mode disabled.' };
          }
          const loopArgs = parseLoopArgs(parsed.args);
          if (typeof loopArgs === 'string') {
            throw new ProjectionError(400, 'INVALID_REQUEST', loopArgs);
          }
          const maxIterations = loopArgs.limit?.kind === 'iterations' ? loopArgs.limit.iterations : undefined;
          const durationMs = loopArgs.limit?.kind === 'duration' ? loopArgs.limit.durationMs : undefined;
          this.loopCondition = loopArgs.condition;
          this.loopDurationMs = durationMs;
          this.loopStartedAtMs = Date.now();
          const conditionDesc = loopArgs.condition ? describeLoopCondition(loopArgs.condition) : undefined;
          this.loopState = {
            active: true,
            iteration: 1,
            maxIterations,
            condition: conditionDesc,
            prompt: loopArgs.prompt,
          };
          this.emit([{ timestamp: Date.now(), event: { type: 'session.updated', loop: this.loopState } }]);
          if (loopArgs.prompt) {
            setTimeout(() => {
              void this.session.prompt(loopArgs.prompt!).catch(() => { });
            }, 10);
          }
          const desc = [
            loopArgs.limit ? (loopArgs.limit.kind === 'iterations' ? `${loopArgs.limit.iterations} iterations` : `${loopArgs.limit.durationMs / 1000}s`) : undefined,
            conditionDesc,
          ].filter(Boolean).join(', ');
          return { type: 'command', output: `Loop mode enabled${desc ? ` (${desc})` : ''}.` };
        }
        if (parsed.name === 'omfg') {
          const complaint = parsed.args.trim();
          if (!complaint) throw new ProjectionError(400, 'INVALID_REQUEST', 'Usage: /omfg <complaint>');
          const promptText = `The user is frustrated about recurring agent behavior:\n"${complaint}"\nAuthor ONE Time Traveling Stream Rule (TTSR) in JSON format with fields: name, description, scope, condition, body.`;
          let replyText = '';
          try {
            const result = await this.session.runEphemeralTurn({ promptText });
            replyText = result.replyText;
          } catch (error) {
            throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', `TTSR rule synthesis model turn failed: ${error instanceof Error ? error.message : String(error)}`);
          }
          const parsedRule = parseGeneratedRule(replyText);
          if ('error' in parsedRule) {
            throw new ProjectionError(400, 'INVALID_REQUEST', `Model did not return a valid TTSR rule: ${parsedRule.error}`);
          }
          const ruleName = sanitizeRuleName(parsedRule.rule.name);
          if (!ruleName) {
            throw new ProjectionError(400, 'INVALID_REQUEST', 'Synthesized TTSR rule has an invalid name');
          }
          const rulePath = join(this.cwd, '.omp', 'rules', `${ruleName}.md`);
          await mkdir(dirname(rulePath), { recursive: true });
          await writeFile(rulePath, parsedRule.fileContent, 'utf8');
          await this.session.refreshSkillsAndCommands();
          return { type: 'command', output: `Synthesized TTSR rule "${ruleName}" in .omp/rules/${ruleName}.md` };
        }
        if (parsed.name === 'cleanse') {
          const activeCheckers: string[] = [];
          const completedCheckers: string[] = [];
          const repairedFiles: string[] = [];
          let diagnosticsCount = 0;

          const emitCleanse = (status: 'discovering' | 'repairing' | 'verifying' | 'completed' | 'failed' | 'cancelled') => {
            this.emit([{
              timestamp: Date.now(),
              transient: true,
              event: {
                type: 'cleanse.progress',
                status,
                activeCheckers: [...activeCheckers],
                completedCheckers: [...completedCheckers],
                repairedFiles: [...repairedFiles],
                diagnosticsCount,
              },
            }]);
          };

          emitCleanse('discovering');

          const ui: CleanseRunUi = {
            board: {
              interactive: false,
              log: () => { },
              phase: () => { },
              checkerStarted: checker => {
                if (!activeCheckers.includes(checker.label)) activeCheckers.push(checker.label);
                emitCleanse('discovering');
              },
              checkerFinished: check => {
                const idx = activeCheckers.indexOf(check.label);
                if (idx !== -1) activeCheckers.splice(idx, 1);
                if (!completedCheckers.includes(check.label)) completedCheckers.push(check.label);
                diagnosticsCount += check.diagnostics?.length ?? 0;
                emitCleanse('discovering');
              },
              repairFinished: () => {
                emitCleanse('verifying');
              },
              agentStarted: (name, assignment) => {
                const files = assignment.groups.map(g => g.file).filter((f): f is string => Boolean(f));
                for (const f of files) {
                  if (!repairedFiles.includes(f)) repairedFiles.push(f);
                }
                const subagentId = `Cleanse-${name}`;
                const subagent: Subagent = {
                  subagentId,
                  parentSessionId: this.sessionId,
                  childSessionId: subagentId,
                  role: 'cleanse-repair',
                  status: 'running',
                };
                this.liveSubagents.set(subagentId, subagent);
                this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent } }]);
                emitCleanse('repairing');
              },
              agentProgress: (name, progress) => {
                const subagentId = `Cleanse-${name}`;
                const existing = this.liveSubagents.get(subagentId);
                if (existing) {
                  const updated: Subagent = {
                    ...existing,
                    tokens: (progress as { tokens?: number })?.tokens ?? existing.tokens,
                    activeTool: (progress as { activeTool?: string })?.activeTool ?? existing.activeTool,
                  };
                  this.liveSubagents.set(subagentId, updated);
                  this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: updated } }]);
                }
              },
              agentFinished: (outcome, _assignment) => {
                const subagentId = `Cleanse-${outcome.name}`;
                const existing = this.liveSubagents.get(subagentId);
                if (existing) {
                  const finalized: Subagent = {
                    ...existing,
                    status: outcome.success ? 'completed' : 'failed',
                  };
                  this.liveSubagents.set(subagentId, finalized);
                  this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: finalized } }]);
                }
                emitCleanse('repairing');
              },
              close: () => { },
            },
            print: () => { },
            printError: () => { },
          };

          const abortController = new AbortController();
          const modelSelector = this.session.model ? formatModelString(this.session.model) : undefined;
          try {
            const result = await runCleanse({ all: true, maxAgents: 4, model: modelSelector }, ui, abortController.signal);
            const finalStatus = result.status === 'cancelled' ? 'cancelled' : 'completed';
            emitCleanse(finalStatus);
            return {
              type: 'command',
              output: `Cleanse diagnostics: ${result.report.checks.length} check(s) executed, ${result.report.diagnostics.length} diagnostic(s) detected across ${repairedFiles.length} file(s).`,
            };
          } catch (error) {
            emitCleanse('failed');
            throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', `Cleanse execution failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (parsed.name === 'tan') {
          const work = parsed.args.trim();
          if (!work) throw new ProjectionError(400, 'INVALID_REQUEST', 'Usage: /tan <work>');
          const sessionDir = this.sessionFile.slice(0, -6);
          const cloneId = `Tan-${randomUUID().slice(0, 8)}`;
          const cloneFile = join(sessionDir, `${cloneId}.jsonl`);
          try {
            const cloneManager = await SessionManager.forkFrom(this.sessionFile, this.cwd, sessionDir, undefined, {
              copyArtifacts: false,
              suppressBreadcrumb: true,
              sessionFile: cloneFile,
              resetInheritedCost: true,
              repairInterruptedTail: true,
            });
            const cloneSessionId = cloneManager.getSessionId() ?? cloneId;
            const created = await createAgentSession({
              cwd: this.cwd,
              sessionManager: cloneManager,
              model: this.session.model,
              systemPrompt: [...this.session.systemPrompt],
              toolNames: this.session.getEnabledToolNames(),
              mountedToolNames: this.session.getMountedToolCommandNames(),
              modelRegistry: this.session.modelRegistry,
              authStorage: this.authStorage,
              settings: this.session.settings,
              hasUI: false,
              enableMCP: false,
              disableExtensionDiscovery: true,
              extensions: [this.toolPolicy.observer],
              authorizeBashExecution: this.toolPolicy.authorizeBashExecution,
              cacheWarming: 'off',
              agentId: cloneId,
              agentDisplayName: 'tan',
            });
            const subagent: Subagent = {
              subagentId: cloneId,
              parentSessionId: this.sessionId,
              childSessionId: cloneSessionId,
              role: 'tan-worker',
              status: 'running',
              description: work,
            };
            this.liveSubagents.set(cloneId, subagent);
            this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent } }]);

            let finalized = false;
            let unsubscribeTan: (() => void) | undefined;
            const finalize = async (finalStatus: 'completed' | 'failed' | 'cancelled') => {
              if (finalized) return;
              finalized = true;
              if (unsubscribeTan) {
                unsubscribeTan();
                unsubscribeTan = undefined;
              }
              this.activeTanSessions.delete(cloneId);
              const current = this.liveSubagents.get(cloneId);
              if (current && current.status === 'running') {
                const updated: Subagent = {
                  ...current,
                  status: finalStatus,
                };
                this.liveSubagents.set(cloneId, updated);
                this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: updated } }]);
              }
              try {
                await created.session.dispose();
              } catch {
                // Best-effort session disposal on finalization
              }
            };

            this.activeTanSessions.set(cloneId, {
              session: created.session,
              abort: async () => {
                try { await created.session.abort(); } catch {
                  // Suppress abort rejection on cancel
                }
                await finalize('cancelled');
              },
              dispose: async () => {
                await finalize('cancelled');
              },
            });

            unsubscribeTan = created.session.subscribe(event => {
              const current = this.liveSubagents.get(cloneId);
              if (!current || current.status !== 'running') return;
              if (event.type === 'tool_execution_start') {
                const updated: Subagent = {
                  ...current,
                  activeTool: event.toolName,
                  turnCount: (current.turnCount ?? 0) + 1,
                };
                this.liveSubagents.set(cloneId, updated);
                this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: updated } }]);
              } else if (event.type === 'message_end' && event.message.role === 'assistant') {
                const usage = (event.message as { usage?: { total_tokens?: number } }).usage;
                if (usage?.total_tokens) {
                  const updated: Subagent = {
                    ...current,
                    tokens: (current.tokens ?? 0) + usage.total_tokens,
                  };
                  this.liveSubagents.set(cloneId, updated);
                  this.emit([{ timestamp: Date.now(), transient: true, event: { type: 'subagent.updated', subagent: updated } }]);
                }
              } else if (event.type === 'agent_end') {
                void finalize('completed');
              }
            });

            void created.session.prompt(work, { streamingBehavior: 'followUp' })
              .then(() => created.session.waitForRunEnd())
              .then(() => finalize('completed'))
              .catch(() => finalize('failed'));

            return { type: 'command', output: `Dispatched background clone for tangential work: "${work}" (cloneId: ${cloneId})` };
          } catch (error) {
            throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', `Background session clone dispatch failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        if (parsed.name === 'advisor') {
          const args = parsed.args.trim();
          if (args === 'on') {
            const active = this.session.setAdvisorEnabled(true);
            this.advisorActive = active;
            return { type: 'command', output: active ? 'Advisor enabled.' : "Advisor setting enabled, but no model is assigned to the 'advisor' role." };
          }
          if (args === 'off') {
            this.session.setAdvisorEnabled(false);
            this.advisorActive = false;
            return { type: 'command', output: 'Advisor disabled.' };
          }
          if (args === 'status') {
            return { type: 'command', output: this.session.formatAdvisorStatus() };
          }
          const active = this.session.toggleAdvisorEnabled();
          this.advisorActive = active;
          return { type: 'command', output: active ? 'Advisor enabled.' : 'Advisor disabled.' };
        }
        await this.binding;
        if (parsed.name === 'clear') {
          const result = await this.session.resetSessionContext();
          this.session.sessionManager.beginTurnBudget(null, false);
          const dropped = result ? result.droppedCount : 0;
          const todoUpdate = this.projection.syncTodosIfChanged(Date.now());
          if (todoUpdate) this.emit([todoUpdate]);
          this.syncTodoAutoClear();
          return { type: 'command', output: `Context reset — ${dropped} ${dropped === 1 ? 'message' : 'messages'} dropped; session continues.` };
        }
        const output: string[] = [];
        const runtime: SlashCommandRuntime = {
          session: this.session,
          sessionManager: this.session.sessionManager,
          settings: this.session.settings,
          cwd: this.cwd,
          output: (text: string) => { output.push(text); },
          // This surface has no ACP command list to re-advertise; the workspace catalog is Host-pulled.
          refreshCommands: () => { },
          reloadPlugins: async () => { await this.session.refreshSkillsAndCommands(); },
        };
        const result = await executeAcpBuiltinSlashCommand(operation.text, runtime);
        if (result === false || 'prompt' in result) throw new ProjectionError(400, 'INVALID_REQUEST', 'Slash command cannot run as a builtin');
        const todoUpdate = this.projection.syncTodosIfChanged(Date.now());
        if (todoUpdate) this.emit([todoUpdate]);
        this.syncTodoAutoClear();
        return { type: 'command', output: output.join('\n') };
      }
      case 'usage.stats': case 'usage.tools':
        throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Historical usage reads belong to the cold usage worker');
      case 'mcp.configuration.read':
        throw new ProjectionError(400, 'UNSUPPORTED_CAPABILITY', 'Configuration hydration belongs to the workspace worker');
      case 'mcp': return this.mcpResult(operation.operation);
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
              messageId = this.projection.admitQueuedPrompt(queued, operation.request.input.attachments, operation.request.input.context);
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
        if (this.preparation || this.projection.activeRun() || this.continuationPending) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        if (this.skillsApplying || !this.admission.skillsAvailable) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skills must be successfully applied before prompt admission');
        await this.stopAutoTitle();
        this.suggestionDriver.cancel();
        this.preparation = this.prepare(operation);
        let prepared: PreparedPrompt;
        try { prepared = await this.preparation; }
        finally { this.preparation = undefined; }
        if (this.closed || this.failed) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Worker session is unavailable');
        if (this.skillsApplying || !this.admission.skillsAvailable) throw new ProjectionError(503, 'SKILL_APPLY_FAILED', 'Native skills changed during prompt preparation');
        this.pendingTitleInput = operation.request.input.text.trim() || this.pendingTitleInput;
        this.emit(this.projection.beginRun(operation.runId, Date.now(), operation.request.input.attachments, operation.request.input.context));
        const run = this.projection.activeRun();
        if (!run) throw new ProjectionError(503, 'INTERNAL_ERROR', 'Run admission failed');
        const accepted: Run = { ...run };
        this.promptTask = this.session.prompt(prepared.text, prepared.options).then(async dispatched => {
          if (dispatched) await this.session.waitForRunEnd();
          await this.bind();
          if (!dispatched) {
            this.emit(this.cancellingRunId === operation.runId
              ? this.projection.cancelRun(Date.now()) : this.projection.completeRun(Date.now()));
            this.scheduleAutoTitle();
          }
        }).catch(() => {
          this.emit(this.cancellingRunId === operation.runId
            ? this.projection.cancelRun(Date.now()) : this.projection.failRun('Agent execution failed', Date.now()));
          this.scheduleAutoTitle();
        });
        return { type: 'prompt', run: accepted };
      }
      case 'abort': {
        const run = this.projection.activeRun();
        if (!run || run.runId !== operation.runId) throw new ProjectionError(404, 'RUN_NOT_FOUND', 'Run not found');
        this.modeController.stopForHostAbort();
        this.planRevision++;
        this.cancellingRunId = operation.runId;
        await this.stopAutoTitle();
        this.suggestionDriver.cancel();
        this.interaction.cancelAll();
        this.session.abortCompaction();
        await this.session.abort({ reason: USER_INTERRUPT_LABEL });
        await this.promptTask;
        await this.bind();
        this.emit(this.projection.cancelRun(Date.now(), operation.runId));
        this.cancellingRunId = undefined;
        this.scheduleAutoTitle();
        // finish() mutates this exact record; a newer run may have started, but this settled record stays detached.
        if (run.finishedAt === undefined || run.status === 'running' || run.status === 'pending') {
          throw new ProjectionError(503, 'INTERNAL_ERROR', 'Run cancellation did not settle');
        }
        const settled: Run = { runId: run.runId, sessionId: run.sessionId, origin: run.origin, status: run.status, createdAt: run.createdAt, finishedAt: run.finishedAt };
        if (run.error !== undefined) settled.error = run.error;
        return { type: 'abort', run: settled };
      }
      case 'approval.resolve':
        if (!this.interaction.resolveApproval(operation.approvalId, operation.decision)) throw new ProjectionError(404, 'APPROVAL_NOT_FOUND', 'Approval request is not pending');
        return { type: 'approval.resolve', resolved: true };
      case 'question.resolve': {
        if (!this.interaction.resolveQuestion(operation.questionId, operation.action, operation.response)) throw new ProjectionError(404, 'QUESTION_NOT_FOUND', 'Question request is not pending');
        return { type: 'question.resolve', resolved: true };
      }
      case 'history':
        await this.binding;
        return { type: 'history', history: this.projection.history(operation.request) };
      case 'compact.abort': {
        const aborted = this.compacting || this.session.isCompacting;
        if (aborted && this.reviewingPlan) this.planRevision++;
        this.session.abortCompaction();
        return { type: 'compact.abort', aborted };
      }
      case 'compact': {
        if (this.preparation || this.projection.activeRun() || this.session.isRunActive || this.continuationPending || this.controllingBranch) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        this.compacting = true;
        try {
          await this.binding;
          const previousCompaction = this.lastEmittedCompaction;
          const result = await this.session.compact(operation.instructions).catch(error => {
            // OMP does not export the refusal class; its name is the stable identity.
            if (error instanceof Error && error.name === 'ManualCompactionNoOpError') {
              throw new ProjectionError(422, 'SESSION_TOO_SMALL', 'Session is too small to compact');
            }
            throw error;
          });
          if (this.lastEmittedCompaction && this.lastEmittedCompaction !== previousCompaction) {
            return {
              type: 'compact',
              compactionId: this.lastEmittedCompaction.compactionId,
              tokensBefore: result.tokensBefore,
              completedAt: this.lastEmittedCompaction.completedAt,
            };
          }
          const completedAt = Date.now();
          const compactionId = randomUUID();
          this.emit([{ timestamp: completedAt, event: { type: 'session.compacted', compactionId, tokensBefore: result.tokensBefore, completedAt } }]);
          return { type: 'compact', compactionId, tokensBefore: result.tokensBefore, completedAt };
        } finally { this.compacting = false; }
      }
      case 'branch':
        return this.selectBranch(operation.request);
      case 'tools.catalog': {
        const toolInfos = this.session.getAllToolInfos();
        const tools = toolInfos.map((info) => {
          const tool = this.session.getToolByName(info.name);
          const tier = tool ? resolveToolTier(tool, {}) : 'exec';
          const label = (typeof tool?.label === 'string' && tool.label) ? tool.label : info.name;
          const description = (typeof tool?.description === 'string' && tool.description) ? tool.description : (info.description || '');
          return {
            name: info.name,
            label,
            description,
            tier,
            availability: true,
          };
        });
        return {
          type: 'tools.catalog',
          catalog: {
            sessionId: this.sessionId,
            tools,
          },
        };
      }
      case 'delete.prepare':
        if (this.preparation || this.projection.activeRun()) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
        await this.bind();
        return { type: 'delete.prepare', sessionFile: this.sessionFile };
    }
    throw new ProjectionError(400, 'INVALID_REQUEST', 'Unsupported worker operation');
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.subagentProjector.settleSubagentsForClose();
    this.cancelTodoAutoClearTimer();
    this.permissionBridge?.stop();
    this.pendingTitleInput = undefined;
    await this.stopAutoTitle();
    this.suggestionDriver.cancel();
    this.interaction.close();
    // Close the MCP owner first: it disconnects staged transports, so a pending
    // 30 s handshake settles instead of stalling this worker's 5 s shutdown.
    const mcpClosing = this.mcp?.close();
    try { await this.mcpStartup; } catch { /* its failure is already reported as a runtime failure */ }
    try {
      await this.btw.close();
      await this.catalogs.close();
      try { await this.preparation; } catch { /* The operation reports preparation failure to its caller. */ }
      this.modeController.stopForHostAbort();
      await this.session.abort({ reason: USER_INTERRUPT_LABEL });
      await this.promptTask;
      await this.planReviewTask;
      await this.bind();
      for (const tan of this.activeTanSessions.values()) {
        try { await tan.dispose(); } catch {
          // Suppress disposal errors during worker teardown
        }
      }
      this.activeTanSessions.clear();
    } finally {
      this.unsubscribe();
      this.titleUnsubscribe();
      this.session.agent.prepareQueuedMessages = this.nativeQueuedPreparation;
      try {
        try { await this.completion.close(); }
        finally {
          await Promise.allSettled([...this.operations]);
          try { await this.shell.close(); } finally { await mcpClosing; }
        }
      } finally {
        this.session.setClientBridge(undefined);
        try { await this.session.dispose(); } finally { this.authStorage.close(); }
      }
    }
  }
  hasDraft(): boolean {
    return this._draftPresent;
  }

  setDraft(present: boolean): void {
    this._draftPresent = present;
  }
}
