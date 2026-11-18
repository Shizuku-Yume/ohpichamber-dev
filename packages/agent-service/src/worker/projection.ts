import { readSessionMode } from './mode.ts';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, isAbsolute } from 'node:path';
import { z } from 'zod';
import type { AgentSessionEvent } from '@oh-my-pi/pi-coding-agent/session/agent-session-events';
import type { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import type { SessionEntry } from '@oh-my-pi/pi-coding-agent/session/session-entries';
import { getLatestTodoPhasesFromEntries, getTodoHudVisibility, isTodoPhase } from '@oh-my-pi/pi-coding-agent/tools/todo';
import { isClosedTodo } from '@oh-my-pi/pi-tui/tools/todo';
import { CounterSchema, EntityIdSchema, HistoryPageRequestSchema, HistoryPageSchema, JsonObjectSchema, JsonValueSchema, NoticePartSchema, PromptAttachmentSchema, SessionMentionSchema, TokenUsageSchema, parseModelString } from '@openchamber/agent-contract';
import type { CompactionMethod, EditPreview, EditPreviewFile, HistoryPage, HistoryPageRequest, JsonObject, JsonValue, Message, NoticePart, Part, PromptAttachment, PromptContext, Run, RunOrigin, SessionCompacting, SessionMention, StepTiming, TodoPhase, TodoStatus, TokenUsage, Turn } from '@openchamber/agent-contract';
import type { ProjectionEvent, ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NoticePartInput = DistributiveOmit<NoticePart, 'partId'>;

type NativeMessage = Extract<AgentSessionEvent, { type: 'message_start' }>['message'];
type VisibleMessage = Extract<NativeMessage, { role: 'user' | 'assistant' | 'toolResult' }>;
function sessionMentions(context: readonly PromptContext[]): SessionMention[] {
  return context.flatMap(item => {
    if (item.kind !== 'context') return [];
    const parsed = SessionMentionSchema.safeParse(item.metadata.openchamberContext);
    return parsed.success ? [parsed.data] : [];
  });
}
const REF_TYPE = 'ohpichamber.canonical.v1';
const RUN_TYPE = 'ohpichamber.run.v1';
const WORKER_RUN_TYPE = 'ohpichamber.worker-run.v1';
const TURN_TYPE = 'ohpichamber.turn.v1';
const ReferenceSchema = z.strictObject({
  nativeEntryId: EntityIdSchema, messageId: EntityIdSchema, turnId: EntityIdSchema,
  runId: EntityIdSchema, userMessageId: EntityIdSchema, /** Written by earlier builds for a turn it authored no user message for; read only. */ virtualUser: z.boolean().optional(),
  attachments: z.array(PromptAttachmentSchema),
  sessionMentions: z.array(SessionMentionSchema).optional(),
});
type Reference = z.infer<typeof ReferenceSchema>;
export const BRANCH_TYPE = 'ohpichamber.branch.v1';
const BranchSelectionSchema = z.strictObject({ restoreLeafId: EntityIdSchema.nullable(), revertedMessageId: EntityIdSchema.nullable() });
export type BranchSelection = z.infer<typeof BranchSelectionSchema>;
const PRIVATE_ROOTS_TYPE = 'ohpichamber.private-roots.v1';
const PrivateRootSchema = z.strictObject({ root: z.string().min(1).refine(isAbsolute), label: z.enum(['workspace', 'agent-directory', 'session-storage']) });
const PrivateRootsSchema = z.array(PrivateRootSchema);
type PrivateRoot = z.infer<typeof PrivateRootSchema>;
const PrivateTextSchema = z.string();
const PRIVATE_PATH_DELIMITERS = ' \t\n\r"\'`=:,;()[]{}<>';
function startsPrivatePath(text: string, index: number, context = ''): boolean {
  const previous = index > 0 ? text[index - 1] : context.at(-1);
  return previous === undefined || PRIVATE_PATH_DELIMITERS.includes(previous)
    || (index >= 7 ? text.startsWith('file://', index - 7) : context.slice(index - 7) + text.slice(0, index) === 'file://');
}
function endsPrivatePath(text: string, index: number): boolean {
  return index === text.length || text[index] === '/' || PRIVATE_PATH_DELIMITERS.includes(text[index]!);
}

export function nativePrivateRootContext(manager: SessionManager): PrivateRoot[] {
  const roots = new Map<string, PrivateRoot>();
  for (const entry of manager.getEntries()) {
    if (entry.type !== 'custom' || entry.customType !== PRIVATE_ROOTS_TYPE) continue;
    for (const value of PrivateRootsSchema.parse(entry.data)) roots.set(value.root, value);
  }
  return [...roots.values()];
}

function storageRoots(manager: SessionManager): PrivateRoot[] {
  const file = manager.getSessionFile();
  if (!file) return [];
  const roots: PrivateRoot[] = [{ root: file, label: 'session-storage' }, { root: dirname(file), label: 'session-storage' }];
  const artifacts = manager.getArtifactsDir();
  if (artifacts !== null) roots.push({ root: artifacts, label: 'session-storage' });
  return roots;
}

/** Private scope context stays in the native tree, never a second transcript store. */
export async function rememberPrivateRoots(manager: SessionManager, scope: { cwd: string; agentDirectory: string }, inherited: readonly PrivateRoot[] = []): Promise<void> {
  const known = new Set(nativePrivateRootContext(manager).map((value) => value.root));
  const added = PrivateRootsSchema.parse([...inherited, { root: scope.cwd, label: 'workspace' }, { root: scope.agentDirectory, label: 'agent-directory' }, ...storageRoots(manager)])
    .filter((value) => { if (known.has(value.root)) return false; known.add(value.root); return true; });
  if (added.length) await manager.appendEntriesAtomically(() => manager.appendCustomEntry(PRIVATE_ROOTS_TYPE, added));
}

function opaqueNativeId(kind: 'message' | 'turn' | 'run', sessionId: string, entryId: string): string {
  return `${kind}:${createHash('sha256').update(JSON.stringify([sessionId, kind, entryId])).digest('hex')}`;
}

/** References are tree-wide: selecting an ancestor must not discard its public identity. */
function nativeReferences(manager: SessionManager): Map<string, Reference> {
  const references = new Map<string, Reference>();
  for (const entry of manager.getEntries()) if (entry.type === 'custom' && entry.customType === REF_TYPE) {
    const reference = ReferenceSchema.parse(entry.data);
    references.set(reference.nativeEntryId, reference);
  }
  return references;
}

export function resolveCanonicalMessage(manager: SessionManager, sessionId: string, messageId: string, selectedOnly = false): string | null {
  const references = nativeReferences(manager);
  for (const entry of selectedOnly ? manager.getBranch() : manager.getEntries()) {
    if (entry.type === 'custom_message' && entry.customType === 'rewind-report') {
      if (opaqueNativeId('message', sessionId, entry.id) === messageId) return entry.id;
    }
    if (entry.type !== 'message' || !visible(entry.message)) continue;
    if ((references.get(entry.id)?.messageId ?? opaqueNativeId('message', sessionId, entry.id)) === messageId) return entry.id;
  }
  return null;
}

export function selectedBranchRevert(branch: readonly SessionEntry[]): BranchSelection | null {
  for (let index = branch.length - 1; index >= 0; index--) {
    const entry = branch[index];
    if (entry.type === 'message' && visible(entry.message)) return null;
    if (entry.type === 'custom' && entry.customType === BRANCH_TYPE) {
      const selection = BranchSelectionSchema.parse(entry.data);
      return selection.revertedMessageId === null ? null : selection;
    }
  }
  return null;
}
const WorkerRunSchema = z.strictObject({ runId: EntityIdSchema, origin: z.enum(['plan', 'goal']), createdAt: z.number().finite().nonnegative(), turnId: EntityIdSchema, userMessageId: EntityIdSchema });
const TerminalSchema = z.strictObject({
  runId: EntityIdSchema, status: z.enum(['completed', 'failed', 'cancelled']), origin: z.enum(['host', 'plan', 'goal']).optional(),
  finishedAt: z.number().finite().nonnegative(), error: z.string().optional(),
});
const TurnTerminalSchema = TerminalSchema.extend({ turnId: EntityIdSchema, startedAt: z.number().finite().nonnegative() });
const HistoryCursorSchema = z.tuple([EntityIdSchema, CounterSchema, EntityIdSchema.nullable(), EntityIdSchema.nullable(), z.number().int().nonnegative()]);
interface LiveMessage {
  messageId: string; turnId: string; runId: string; userMessageId: string;
  nativeMessage: VisibleMessage;
  attachments: PromptAttachment[]; sessionMentions: SessionMention[]; started: Set<number>; toolCallIndexById: Map<string, number>; lastEmittedToolInputByCallId: Map<string, string>; editPreviewsByToolCallId: Map<string, EditPreview>; providerId?: string; modelId?: string; usage?: TokenUsage; timing?: StepTiming;
}

type NativeAssistantMessage = Extract<VisibleMessage, { role: 'assistant' }>;

/**
 * The native usage carries provider-only counters (`reasoningTokens`, provider
 * extras) that the canonical wire contract does not publish. Map the shared
 * fields explicitly so a provider counter added by the SDK cannot fail a
 * session restore, and parse the result to keep the canonical numbers strict.
 * `reasoningTokens` is projected as `reasoning` because the context panel
 * reports it beside input/output; it stays an informative counter and is not
 * added to `totalTokens`, which the SDK already counts in full.
 */
function canonicalUsage(usage: NonNullable<NativeAssistantMessage['usage']>): TokenUsage {
  return TokenUsageSchema.parse({
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    reasoning: usage.reasoningTokens ?? 0,
    cost: {
      input: usage.cost.input,
      output: usage.cost.output,
      cacheRead: usage.cost.cacheRead,
      cacheWrite: usage.cost.cacheWrite,
      total: usage.cost.total,
    },
  });
}

/**
 * The step's own timeline. Absolute epochs, derived only from what the native
 * message records, so a transcript restored from disk equals the stream that
 * produced it: `ttft` and `duration` are request-relative, `timestamp` and
 * `completedAt` are absolute.
 */
function stepTiming(message: NativeAssistantMessage): StepTiming {
  const startedAt = Math.max(0, Math.round(message.timestamp));
  const timing: StepTiming = { startedAt };
  const ttft = z.number().finite().safeParse(message.ttft);
  if (ttft.success) {
    timing.firstTokenAt = Math.max(startedAt, Math.round(startedAt + ttft.data));
  }
  const duration = z.number().finite().safeParse(message.duration);
  const completedAt = z.number().finite().safeParse(message.completedAt);
  const completed = completedAt.success
    ? completedAt.data
    : duration.success ? startedAt + duration.data : undefined;
  if (completed !== undefined && Number.isFinite(completed)) timing.completedAt = Math.max(startedAt, Math.round(completed));
  return timing;
}

function metadata(message: VisibleMessage): Pick<LiveMessage, 'providerId' | 'modelId' | 'usage' | 'timing'> {
  if (message.role !== 'assistant') return {};
  return {
    providerId: message.provider,
    modelId: message.model,
    usage: message.usage ? canonicalUsage(message.usage) : undefined,
    timing: stepTiming(message),
  };
}
function visible(message: NativeMessage): message is VisibleMessage {
  return message.role === 'assistant' || message.role === 'toolResult' || (message.role === 'user' && message.synthetic !== true);
}
function partId(messageId: string, index: number): string { return `${messageId}:${index}`; }
/** SDK tool arguments can carry symbol-keyed markers; canonical records are JSON (see NativeInteraction.observeToolCall). */
function toolInput(value: JsonValue): JsonObject { return JsonObjectSchema.parse(JSON.parse(JSON.stringify(value))); }

/**
 * A tool outcome as the SDK reports it. `content` blocks, optional structured
 * `details` and the non-throwing failure flag; every native result shape, from
 * a partial frame to a persisted `toolResult` message, parses through this.
 */
const ToolResultPayloadSchema = z.looseObject({
  toolCallId: z.string().optional(), toolName: z.string().optional(),
  content: z.unknown().optional(), details: z.unknown().optional(), isError: z.boolean().optional().catch(undefined),
});
/** A native result as JSON, which is what the wire and their IPC carry. */
function resultPayload(value: unknown): ToolResultPayload {
  const json = JsonValueSchema.safeParse(JSON.parse(JSON.stringify(value ?? {})));
  return ToolResultPayloadSchema.parse(json.success ? json.data : {});
}
type ToolResultPayload = z.infer<typeof ToolResultPayloadSchema>;
/** The failure markers OMP puts on `details`; the kind comes from the most specific one. */
const ToolFailureDetailsSchema = z.looseObject({
  __synthetic: z.boolean().optional(), __interrupted: z.boolean().optional(),
  upstreamError: z.string().optional(), errorKind: z.string().min(1).optional(), timedOut: z.boolean().optional(),
  async: z.looseObject({ state: z.string().optional() }).optional(),
});
const ToolTextBlockSchema = z.looseObject({ type: z.literal('text'), text: z.string() });
const HostDetailsSchema = z.looseObject({ openchamber: z.json().optional() });
const CompactionResultExtrasSchema = z.looseObject({
  tokensAfter: z.number().int().nonnegative().optional(),
  warning: z.string().optional(),
});
const TodoToolResultDetailsSchema = z.looseObject({ op: z.string().optional(), phases: z.array(z.unknown()).optional() });

type NativeTodoPhaseInput = {
  readonly name: string;
  readonly tasks: readonly { readonly content: string; readonly status: TodoStatus; readonly blocker?: string }[];
};

function mapCompactionAction(action: string | undefined): CompactionMethod {
  switch (action) {
    case 'context-full':
    case 'soft':
      return 'soft-compacted';
    case 'remote':
      return 'remote-compacted';
    case 'shake':
      return 'shaken';
    case 'snapcompact':
      return 'snap-compacted';
    case 'handoff':
      return 'handed-off';
    default:
      return 'compacted';
  }
}

function mapManualCompactionMode(mode: string | undefined): CompactionMethod {
  switch (mode) {
    case 'shake':
      return 'shaken';
    case 'snapcompact':
      return 'snap-compacted';
    case 'remote':
      return 'remote-compacted';
    case 'handoff':
      return 'handed-off';
    default:
      return 'soft-compacted';
  }
}

/** The text a reader sees for a result: its text blocks, joined. */
function toolResultText(content: unknown): string {
  const blocks = z.array(z.unknown()).safeParse(content ?? []);
  if (!blocks.success) return '';
  return blocks.data.flatMap((block) => {
    const text = ToolTextBlockSchema.safeParse(block);
    return text.success ? [text.data.text] : [];
  }).join('\n').trim();
}

/**
 * The canonical output object: the SDK's content and details verbatim, so a
 * tool card reads what the tool returned. An OpenChamber host tool carries its
 * envelope in `details.openchamber`; it is also hoisted to the top level,
 * which is where a card's `metadata.openchamber` looks.
 */
function toolResultOutput(content: unknown, details: unknown): JsonValue {
  const host = HostDetailsSchema.safeParse(details ?? {});
  const base: { content: unknown; details?: unknown; openchamber?: unknown } = details === undefined ? { content: content ?? [] } : { content: content ?? [], details };
  if (host.success && host.data.openchamber !== undefined) base.openchamber = host.data.openchamber;
  // SDK details can hold undefined fields; IPC and the wire carry JSON.
  return JsonValueSchema.parse(JSON.parse(JSON.stringify(base)));
}

/**
 * A result part for one call: its output, and for a failure the kind OMP
 * knows (`synthetic` for a call it never ran, `interrupted`, an edit's own
 * `errorKind`, a bash `timeout`, a dead background job) beside the detail the
 * tool itself reported, never a placeholder the reader cannot act on.
 */
function toolResultPart(resultPartId: string, toolCallId: string, toolName: string, payload: ToolResultPayload): Part {
  const parsed = ToolFailureDetailsSchema.safeParse(payload.details ?? {});
  const fields = parsed.success ? parsed.data : {};
  const part: Part = {
    type: 'tool_result', partId: resultPartId, toolCallId, toolName,
    isError: payload.isError === true,
    output: toolResultOutput(payload.content, payload.details),
  };
  if (payload.isError !== true) return part;
  const detail = toolResultText(payload.content) || (fields.upstreamError ?? '').trim();
  if (detail) part.error = detail;
  part.errorKind = fields.__synthetic === true ? 'synthetic'
    : fields.__interrupted === true ? 'interrupted'
      : fields.errorKind ?? (fields.timedOut === true ? 'timeout' : undefined)
      ?? (fields.async?.state === 'failed' || fields.async?.state === 'cancelled' ? 'background-job' : undefined)
      ?? 'tool_error';
  return part;
}

function parts(message: VisibleMessage, messageId: string, attachments: PromptAttachment[], mentions: readonly SessionMention[], toolResults?: ReadonlyMap<string, ToolResultPayload>): Part[] {
  if (message.role === 'toolResult') return [];
  const result: Part[] = [];
  if (Array.isArray(message.content)) {
    for (const [index, item] of message.content.entries()) {
      if (item.type === 'text') result.push({ type: 'text', partId: partId(messageId, index), content: item.text });
      else if (item.type === 'thinking') result.push({
        type: 'reasoning', partId: partId(messageId, index), content: item.thinking,
        signature: item.thinkingSignature,
      });
      else if (item.type === 'toolCall') result.push({
        type: 'tool_call', partId: partId(messageId, index), toolCallId: item.id,
        toolName: item.name, input: toolInput(JSON.parse(JSON.stringify(item.arguments))),
        status: toolResults?.has(item.id) ? toolResults.get(item.id)!.isError === true ? 'failed' : 'completed' : 'running',
      });
    }
  } else {
    result.push({ type: 'text', partId: partId(messageId, 0), content: message.content });
  }
  if (message.role === 'assistant') {
    const nativeAny = message as NativeMessage & { upstreamModel?: unknown; model?: unknown };
    if (typeof nativeAny.upstreamModel === 'string' && typeof nativeAny.model === 'string' && nativeAny.upstreamModel && nativeAny.upstreamModel !== nativeAny.model) {
      result.push({
        type: 'notice',
        partId: `${messageId}:notice:model_mismatch`,
        noticeType: 'served_model_mismatch',
        level: 'warning',
        details: {
          requested: nativeAny.upstreamModel,
          served: nativeAny.model,
          provider: typeof nativeAny.provider === 'string' ? nativeAny.provider : '',
          upstreamProvider: typeof nativeAny.upstreamProvider === 'string' ? nativeAny.upstreamProvider : undefined,
        },
      });
    }
  }
  if (message.role === 'user' && mentions.length > 0) {
    const text = result.find(part => part.type === 'text');
    if (text?.type === 'text') text.sessionMentions = mentions.map(mention => ({ ...mention }));
  }
  for (const [index, attachment] of attachments.entries()) result.push({ type: 'attachment', partId: `${messageId}:attachment:${index}`, ...attachment });
  return result;
}

/** Native transcript owns content; custom entries retain canonical identity and lifecycle times. */
export class WorkerProjection {
  private run: Run | null = null;
  private turn: { turnId: string; userMessageId: string; open: boolean; startedAt: number } | undefined;
  private message: LiveMessage | undefined;
  private readonly pending: LiveMessage[] = [];
  private attachments: PromptAttachment[] = [];
  private sessionMentions: SessionMention[] = [];
  private readonly queuedPrompts = new WeakMap<NativeMessage, { messageId: string; attachments: PromptAttachment[]; sessionMentions: SessionMention[] }>();
  private entryOffset: number;
  private stopReason: 'error' | 'aborted' | undefined;
  private cancelRequestedRunId: string | undefined;
  private readonly privateRoots: PrivateRoot[];
  private readonly textSuffixes = new Map<string, { suffix: string; context: string }>();
  private lastCacheRead = 0;
  private manualCompactionMode: string | undefined;
  private compactingState: SessionCompacting | null = null;
  private lastProjectedTodosJson = '[]';
  private readonly deferredNotices: NoticePart[] = [];
  /**
   * Which message owns each live tool call, and the part its result attaches
   * to. A result is a part of the message that made the call, so the owner is
   * recorded when the call is authored and never guessed from a later message.
   */
  private readonly liveToolCallOwners = new Map<string, { messageId: string; callPartId: string }>();
  private readonly publishedResultParts = new Set<string>();
  private readonly completedResultParts = new Set<string>();
  private readonly toolCallPreviews = new Map<string, EditPreview>();

  private ownToolCall(toolCallId: string, messageId: string | undefined, contentIndex: number | undefined): void {
    if (!messageId || contentIndex === undefined) return;
    this.liveToolCallOwners.set(toolCallId, { messageId, callPartId: partId(messageId, contentIndex) });
  }

  /** The result part a call's outcome belongs to, published on the call's message. */
  private publishToolResult(payload: ToolResultPayload, terminal: boolean, emit: (event: ProjectionEvent) => void): void {
    const toolCallId = payload.toolCallId;
    const toolName = payload.toolName;
    if (!toolCallId || !toolName) return;
    const owner = this.liveToolCallOwners.get(toolCallId);
    if (!owner) return;
    const part = toolResultPart(`${owner.callPartId}:result`, toolCallId, toolName, payload);
    if (!this.publishedResultParts.has(part.partId)) {
      this.publishedResultParts.add(part.partId);
      emit({ type: 'part.started', messageId: owner.messageId, part });
    }
    // A partial frame is a live update; the terminal frame closes the part once
    // so a restored transcript and the stream end on the same value. The native
    // result message that follows the terminal frame repeats that same outcome.
    if (terminal && this.completedResultParts.has(part.partId)) return;
    if (terminal) this.completedResultParts.add(part.partId);
    emit(terminal ? { type: 'part.completed', part } : { type: 'part.updated', part });
  }

  private persistAndPublishNotice(
    notice: NoticePartInput,
    timestamp: number,
    emit: (event: ProjectionEvent) => void,
  ): void {
    const lastEntry = this.manager.getBranch().findLast((e) => e.type === 'message' && visible(e.message));
    const branchMessageId = lastEntry
      ? (nativeReferences(this.manager).get(lastEntry.id)?.messageId ?? opaqueNativeId('message', this.sessionId, lastEntry.id))
      : null;
    const targetMessageId = this.message?.messageId
      ?? this.pending.at(-1)?.messageId
      ?? branchMessageId;

    const noticePartId = targetMessageId
      ? `${targetMessageId}:notice:${randomUUID()}`
      : `${this.sessionId}:notice:${randomUUID()}`;

    const noticePart = NoticePartSchema.parse({
      ...notice,
      partId: noticePartId,
    });

    this.manager.appendCustomEntry('ohpichamber.notice.v1', {
      messageId: targetMessageId,
      turnId: this.turn?.turnId ?? null,
      part: noticePart,
      timestamp,
    });

    if (targetMessageId) {
      emit({ type: 'part.started', messageId: targetMessageId, part: noticePart });
      emit({ type: 'part.completed', part: noticePart });
    } else {
      this.deferredNotices.push(noticePart);
    }
  }
  constructor(
    private readonly manager: SessionManager,
    private readonly sessionId: string,
    privateRoots: readonly PrivateRoot[] = [],
    private readonly readLiveTodos?: () => readonly NativeTodoPhaseInput[],
  ) {
    this.entryOffset = manager.getBranch().length;
    const roots = new Map(nativePrivateRootContext(manager).map((value) => [value.root, value]));
    for (const value of storageRoots(manager)) roots.set(value.root, value);
    for (const value of privateRoots) roots.set(value.root, value);
    const cwd = manager.getHeader()?.cwd;
    if (cwd) roots.set(cwd, { root: cwd, label: 'workspace' });
    this.privateRoots = [...roots.values()].sort((left, right) => right.root.length - left.root.length);
    this.lastProjectedTodosJson = JSON.stringify(this.currentTodos());
  }

  publicText(text: string, context = ''): string {
    for (const { root, label } of this.privateRoots) {
      let next = '';
      let copied = 0;
      for (let index = text.indexOf(root); index >= 0; index = text.indexOf(root, index + root.length)) {
        if (!startsPrivatePath(text, index, context) || (!root.endsWith('/') && !endsPrivatePath(text, index + root.length))) continue;
        next += text.slice(copied, index) + `[${label}]`;
        copied = index + root.length;
      }
      if (copied) text = next + text.slice(copied);
    }
    return text;
  }

  private publicJson(value: JsonValue): JsonValue {
    if (Array.isArray(value)) {
      let next: JsonValue[] | undefined;
      for (let index = 0; index < value.length; index++) {
        const item = this.publicJson(value[index]!);
        if (item !== value[index]) { next ??= value.slice(); next[index] = item; }
      }
      return next ?? value;
    }
    if (value instanceof Object) return this.publicJsonObject(value);
    const text = PrivateTextSchema.safeParse(value);
    return text.success ? this.publicText(text.data) : value;
  }

  private publicJsonObject(value: JsonObject): JsonObject {
    let next: JsonObject | undefined;
    for (const key of Object.keys(value)) {
      const publicKey = this.publicText(key);
      const item = this.publicJson(value[key]!);
      if (publicKey !== key || item !== value[key]) {
        next ??= { ...value };
        if (publicKey !== key) delete next[key];
        next[publicKey] = item;
      }
    }
    return next ?? value;
  }

  private parseEditPreview(update: unknown): EditPreview | undefined {
    if (!update || typeof update !== 'object') return undefined;
    const updateObj = update as { files?: unknown };
    if (!('files' in updateObj) || !Array.isArray(updateObj.files)) return undefined;
    const files: EditPreviewFile[] = [];
    for (const item of updateObj.files) {
      if (!item || typeof item !== 'object') continue;
      const file = item as { path?: unknown };
      if (typeof file.path !== 'string' || !file.path) continue;
      files.push({
        path: this.publicText(file.path),
        ...(typeof file.diff === 'string' ? { diff: this.publicText(file.diff) } : {}),
        ...(typeof file.firstChangedLine === 'number' && Number.isInteger(file.firstChangedLine) ? { firstChangedLine: file.firstChangedLine } : {}),
        ...(typeof file.error === 'string' ? { error: this.publicText(file.error) } : {}),
        ...(typeof file.op === 'string' ? { op: this.publicText(file.op) } : {}),
        ...(typeof file.rename === 'string' ? { rename: this.publicText(file.rename) } : {}),
      });
    }
    if (files.length === 0) return undefined;
    return {
      files,
      ...(typeof updateObj.streaming === 'boolean' ? { streaming: updateObj.streaming } : {}),
      ...(typeof updateObj.generation === 'number' ? { generation: updateObj.generation } : {}),
    };
  }

  private publicPart(part: Part): void {
    switch (part.type) {
      case 'text': case 'reasoning':
        part.content = this.publicText(part.content);
        if (part.type === 'text' && part.sessionMentions) for (const mention of part.sessionMentions) {
          if (mention.kind === 'session') mention.title = this.publicText(mention.title);
          else { mention.sessionTitle = this.publicText(mention.sessionTitle); mention.excerpt = this.publicText(mention.excerpt); }
        }
        if (part.type === 'reasoning' && part.signature !== undefined) part.signature = this.publicText(part.signature);
        break;
      case 'tool_call':
        part.toolCallId = this.publicText(part.toolCallId);
        part.toolName = this.publicText(part.toolName);
        part.input = this.publicJsonObject(part.input);
        if (part.editPreview !== undefined) {
          for (const file of part.editPreview.files) {
            file.path = this.publicText(file.path);
            if (file.diff) file.diff = this.publicText(file.diff);
            if (file.error) file.error = this.publicText(file.error);
            if (file.op) file.op = this.publicText(file.op);
            if (file.rename) file.rename = this.publicText(file.rename);
          }
        }
        break;
      case 'tool_result':
        part.toolCallId = this.publicText(part.toolCallId);
        part.toolName = this.publicText(part.toolName);
        if (part.output !== undefined) part.output = this.publicJson(part.output);
        if (part.error !== undefined) part.error = this.publicText(part.error);
        break;
      case 'attachment': part.name = this.publicText(part.name); part.mediaType = this.publicText(part.mediaType); break;
      case 'step_summary': part.title = this.publicText(part.title); break;
      case 'notice':
        if (part.title !== undefined) part.title = this.publicText(part.title);
        if (part.message !== undefined) part.message = this.publicText(part.message);
        if (part.details !== undefined) {
          part.details = this.publicJson(part.details as unknown as JsonValue) as unknown as typeof part.details;
        }
        break;
    }
  }

  private publicEvents(inputs: ProjectionInput[]): ProjectionInput[] {
    for (const { event } of inputs) {
      switch (event.type) {
        case 'part.started': case 'part.updated': case 'part.completed': this.publicPart(event.part); break;
        case 'tool.started': event.toolCallId = this.publicText(event.toolCallId); event.toolName = this.publicText(event.toolName); event.input = this.publicJsonObject(event.input); break;
        case 'tool.completed':
          event.toolCallId = this.publicText(event.toolCallId);
          if (event.output !== undefined) event.output = this.publicJson(event.output);
          if (event.error !== undefined) event.error = this.publicText(event.error);
          break;
        case 'run.failed': event.error = this.publicText(event.error); break;
        case 'message.created': case 'message.updated':
          if (event.providerId !== undefined) event.providerId = this.publicText(event.providerId);
          if (event.modelId !== undefined) event.modelId = this.publicText(event.modelId);
          break;
        case 'session.updated':
          if (event.todos !== undefined) event.todos = this.sanitizeTodoPhases(event.todos);
          break;
        case 'session.compacted':
          if (event.summary !== undefined) event.summary = this.publicText(event.summary);
          if (event.warning !== undefined) event.warning = this.publicText(event.warning);
          break;
        // Text deltas already carry bounded stream context; never reinterpret a chunk as a new path.
        default: break;
      }
    }
    return inputs;
  }

  private publicDelta(id: string, delta: string): string {
    const pending = this.textSuffixes.get(id);
    const context = pending?.context ?? '';
    const text = (pending?.suffix ?? '') + delta;
    let length = 0;
    for (const { root } of this.privateRoots) {
      for (let count = Math.min(root.length, text.length); count > length; count--) {
        if (text.endsWith(root.slice(0, count)) && startsPrivatePath(text, text.length - count, context)) { length = count; break; }
      }
    }
    const emitted = length ? text.slice(0, -length) : text;
    const preceding = emitted.length >= 7 ? emitted.slice(-7) : context.slice(-(7 - emitted.length)) + emitted;
    this.textSuffixes.set(id, { suffix: length ? text.slice(-length) : '', context: preceding });
    return this.publicText(emitted, context);
  }

  private sanitizeTodoPhases(phases: readonly NativeTodoPhaseInput[]): TodoPhase[] {
    return phases.map((phase) => ({
      name: this.publicText(phase.name),
      tasks: phase.tasks.map((task) => ({
        content: this.publicText(task.content),
        status: task.status,
        ...(task.blocker !== undefined ? { blocker: this.publicText(task.blocker) } : {}),
      })),
    }));
  }
  private toNativeTodoPhases(phases: readonly NativeTodoPhaseInput[]): TodoPhase[] {
    return phases.map((phase) => ({
      name: phase.name,
      tasks: phase.tasks.map((task) => ({
        content: task.content,
        status: task.status,
        ...(task.blocker !== undefined ? { blocker: task.blocker } : {}),
      })),
    }));
  }

  currentTodos(): TodoPhase[] {
    const raw = this.readLiveTodos
      ? this.readLiveTodos()
      : getLatestTodoPhasesFromEntries(this.manager.getBranch());
    if (raw.length > 0 && getTodoHudVisibility(this.manager.getBranch(), this.toNativeTodoPhases(raw)) === 'dismissed') {
      return [];
    }
    return this.sanitizeTodoPhases(raw);
  }

  hasPendingAutoClearTodos(): boolean {
    const todos = this.currentTodos();
    if (todos.length === 0) return false;
    const tasks = todos.flatMap((phase) => phase.tasks);
    return tasks.length > 0 && tasks.every(isClosedTodo);
  }

  syncTodosIfChanged(timestamp: number): ProjectionInput | undefined {
    const todos = this.currentTodos();
    const serialized = JSON.stringify(todos);
    if (serialized === this.lastProjectedTodosJson) return undefined;
    this.lastProjectedTodosJson = serialized;
    return { timestamp, event: { type: 'session.updated', todos } };
  }

  seed(): ProjectionSeed { return this.readHistory(); }
  resetSelection(): void {
    this.entryOffset = this.manager.getBranch().length;
    this.compactingState = null;
    this.manualCompactionMode = undefined;
    this.lastProjectedTodosJson = JSON.stringify(this.currentTodos());
  }
  activeRun(): Run | null { return this.run; }
  currentTurn(): { turnId: string } | undefined { return this.turn?.open ? { turnId: this.turn.turnId } : undefined; }
  admitQueuedPrompt(message: Extract<NativeMessage, { role: 'user' }>, attachments: PromptAttachment[], context: readonly PromptContext[] = []): string {
    const messageId = randomUUID();
    this.queuedPrompts.set(message, { messageId, attachments, sessionMentions: sessionMentions(context) });
    return messageId;
  }

  /** Abort intent is latched before the native abort await so a losing completion cannot overwrite it. */
  requestCancel(runId: string): void {
    if (this.run?.runId === runId) this.cancelRequestedRunId = runId;
  }

  beginRun(runId: string, timestamp: number, attachments: PromptAttachment[] = [], contextOrOrigin: readonly PromptContext[] | RunOrigin = [], explicitOrigin?: RunOrigin): ProjectionInput[] {
    if (this.run) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
    this.cancelRequestedRunId = undefined;
    const context = Array.isArray(contextOrOrigin) ? contextOrOrigin : [];
    const origin: RunOrigin = explicitOrigin ?? (typeof contextOrOrigin === 'string' ? contextOrOrigin : 'host');
    this.run = { runId, sessionId: this.sessionId, status: 'running', origin, createdAt: timestamp };
    this.turn = undefined;
    this.message = undefined;
    this.stopReason = undefined;
    this.liveToolCallOwners.clear();
    this.publishedResultParts.clear();
    this.completedResultParts.clear();
    this.toolCallPreviews.clear();
    this.attachments = attachments;
    this.sessionMentions = sessionMentions(context);
    const result: ProjectionInput[] = [{ timestamp, event: { type: 'run.started', runId, origin, createdAt: timestamp } }];
    if (origin !== 'host') {
      // The turn's opaque user identity is all a non-host run needs: the
      // native prompt OMP writes for a plan or goal turn is the turn's own
      // content, so OpenChamber must not author an empty user message beside it.
      const turnId = randomUUID(), userMessageId = randomUUID();
      this.turn = { turnId, userMessageId, open: true, startedAt: timestamp };
      this.manager.appendCustomEntry(WORKER_RUN_TYPE, { runId, origin, createdAt: timestamp, turnId, userMessageId });
      result.push({ timestamp, event: { type: 'turn.started', turnId, runId, userMessageId } });
    }
    return result;
  }

  private projectCompactionCommitted(
    method: CompactionMethod,
    compactionResult: NonNullable<Extract<AgentSessionEvent, { type: 'auto_compaction_end' }>['result']>,
    timestamp: number,
    emit: (event: ProjectionEvent) => void,
  ): void {
    const latestCompaction = this.manager.getBranch().findLast((entry) => entry.type === 'compaction');
    const matchedCompaction = latestCompaction
      && latestCompaction.firstKeptEntryId === compactionResult.firstKeptEntryId
      && latestCompaction.tokensBefore === compactionResult.tokensBefore
      ? latestCompaction
      : undefined;
    const parsedExtras = CompactionResultExtrasSchema.safeParse(compactionResult);
    const tokensAfter = (parsedExtras.success ? parsedExtras.data.tokensAfter : undefined) ?? matchedCompaction?.tokensAfter;
    const warning = (parsedExtras.success ? parsedExtras.data.warning : undefined) ?? matchedCompaction?.warning;
    emit({
      type: 'session.compacted',
      compactionId: randomUUID(),
      method,
      tokensBefore: compactionResult.tokensBefore,
      ...(tokensAfter !== undefined ? { tokensAfter } : {}),
      ...(compactionResult.summary ? { summary: this.publicText(compactionResult.summary) } : {}),
      ...(warning ? { warning: this.publicText(warning) } : {}),
      completedAt: timestamp,
    });
    const todoUpdate = this.syncTodosIfChanged(timestamp);
    if (todoUpdate) emit(todoUpdate.event);
  }

  consume(event: AgentSessionEvent): ProjectionInput[] {
    const queued = event.type === 'message_start' && event.message.role === 'user' ? this.queuedPrompts.get(event.message) : undefined;
    const timestamp = Date.now();
    const result: ProjectionInput[] = !this.run && queued ? this.beginRun(randomUUID(), timestamp) : [];
    const emit = (payload: ProjectionEvent): void => { result.push({ timestamp, event: payload }); };

    switch (event.type) {
      case 'auto_compaction_start': {
        const method = mapCompactionAction(event.action);
        this.compactingState = { method, reason: event.reason, startedAt: timestamp };
        emit({ type: 'session.updated', compacting: structuredClone(this.compactingState) });
        return this.publicEvents(result);
      }
      case 'manual_compaction_start': {
        this.manualCompactionMode = event.mode;
        const method = mapManualCompactionMode(event.mode);
        this.compactingState = { method, startedAt: timestamp };
        emit({ type: 'session.updated', compacting: structuredClone(this.compactingState) });
        return this.publicEvents(result);
      }
      case 'auto_compaction_end': {
        this.compactingState = null;
        if (event.result === undefined || event.aborted || event.willRetry || event.skipped === true) {
          emit({ type: 'session.updated', compacting: null });
          return this.publicEvents(result);
        }
        this.projectCompactionCommitted(mapCompactionAction(event.action), event.result, timestamp, emit);
        return this.publicEvents(result);
      }
      case 'manual_compaction_end': {
        this.compactingState = null;
        const mode = this.manualCompactionMode;
        this.manualCompactionMode = undefined;
        if (event.result === undefined || event.aborted || event.skipped === true) {
          emit({ type: 'session.updated', compacting: null });
          return this.publicEvents(result);
        }
        this.projectCompactionCommitted(mapManualCompactionMode(mode), event.result, timestamp, emit);
        return this.publicEvents(result);
      }
      case 'todo_auto_clear': {
        this.lastProjectedTodosJson = '[]';
        emit({ type: 'session.updated', todos: [] });
        return this.publicEvents(result);
      }
      case 'todo_reminder': {
        this.persistAndPublishNotice({
          type: 'notice',
          noticeType: 'todo_reminder',
          level: 'warning',
          details: {
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            todos: (event.todos ?? []).map(t => ({ content: t.content, status: t.status })),
          },
        }, timestamp, emit);
        return this.publicEvents(result);
      }
      case 'ttsr_triggered': {
        const rules = event.rules ?? [];
        this.persistAndPublishNotice({
          type: 'notice',
          noticeType: 'ttsr_triggered',
          level: 'warning',
          details: { rules: rules.map(r => ({ name: r.name, description: r.description })) },
        }, timestamp, emit);
        return this.publicEvents(result);
      }
      case 'auto_retry_start': {
        this.persistAndPublishNotice({
          type: 'notice',
          noticeType: 'auto_retry_start',
          level: 'warning',
          details: {
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
            delayMs: event.delayMs,
            errorMessage: this.publicText(event.errorMessage ?? ''),
          },
        }, timestamp, emit);
        return this.publicEvents(result);
      }
      case 'retry_fallback_applied': {
        this.persistAndPublishNotice({
          type: 'notice',
          noticeType: 'retry_fallback_applied',
          level: 'warning',
          details: {
            from: event.from,
            to: event.to,
            role: event.role,
            reason: event.reason ? this.publicText(event.reason) : undefined,
          },
        }, timestamp, emit);
        return this.publicEvents(result);
      }
    }

    const run = this.run;
    if (!run) return result;
    switch (event.type) {
      case 'message_start': {
        if (!visible(event.message)) break;
        const native = event.message;
        if (native.role === 'toolResult') {
          // A native result message is the same outcome `tool_execution_end`
          // already published as a part of the message that made the call; the
          // native message itself is never a row of its own.
          this.publishToolResult(resultPayload(native), true, emit);
          break;
        }
        if (native.role === 'user' || !this.turn?.open) {
          const turnId = randomUUID();
          const userMessageId = queued?.messageId ?? randomUUID();
          this.turn = { turnId, userMessageId, open: true, startedAt: timestamp };
          emit({ type: 'turn.started', turnId, runId: run.runId, userMessageId });
        }
        const turn = this.turn;
        if (!turn) throw new ProjectionError(503, 'INTERNAL_ERROR', 'Native message has no turn');
        const messageId = native.role === 'user' ? turn.userMessageId : randomUUID();
        const nativeMetadata = metadata(native);
        const current: LiveMessage = {
          messageId, turnId: turn.turnId, runId: run.runId,
          userMessageId: turn.userMessageId,
          nativeMessage: native,
          attachments: native.role === 'user' ? queued?.attachments ?? this.attachments : [], started: new Set(), ...nativeMetadata,
          sessionMentions: native.role === 'user' ? queued?.sessionMentions ?? this.sessionMentions : [],
          toolCallIndexById: new Map(),
          lastEmittedToolInputByCallId: new Map(),
          editPreviewsByToolCallId: new Map(),
        };
        if (native.role === 'user') { this.queuedPrompts.delete(native); this.attachments = []; this.sessionMentions = []; }
        this.message = current;
        this.pending.push(current);
        emit({ type: 'message.created', messageId, turnId: turn.turnId, role: native.role, ...nativeMetadata });
        for (const part of parts(native, messageId, current.attachments, current.sessionMentions)) {
          if (native.role === 'assistant' && (part.type === 'text' || part.type === 'reasoning')) {
            // A live assistant start may already carry the first streamed text. The
            // following text_delta authors that same text again, so seed an empty
            // part; non-stream starts are completed by message_end's full part.
            part.content = '';
          }
          emit({ type: 'part.started', messageId, part });
          const index = native.content instanceof Array
            ? native.content.findIndex((item, index) => part.partId === partId(messageId, index)) : 0;
          if (index >= 0) current.started.add(index);
        }
        if (this.deferredNotices.length > 0) {
          const deferred = this.deferredNotices.splice(0, this.deferredNotices.length);
          for (const notice of deferred) {
            emit({ type: 'part.started', messageId, part: notice });
            emit({ type: 'part.completed', part: notice });
          }
        }
        break;
      }
      case 'message_update': {
        const current = this.message;
        if (!current || current.nativeMessage.role !== 'assistant' || event.message.role !== 'assistant') break;
        current.nativeMessage = event.message;
        const update = event.assistantMessageEvent;
        switch (update.type) {
          case 'text_start': case 'thinking_start': {
            if (current.started.has(update.contentIndex)) break;
            const id = partId(current.messageId, update.contentIndex);
            const part: Part = update.type === 'text_start'
              ? { type: 'text', partId: id, content: '' } : { type: 'reasoning', partId: id, content: '' };
            current.started.add(update.contentIndex);
            emit({ type: 'part.started', messageId: current.messageId, part });
            break;
          }
          case 'text_delta': case 'thinking_delta': {
            const id = partId(current.messageId, update.contentIndex);
            const delta = this.publicDelta(id, update.delta);
            if (delta) emit({ type: 'part.delta', partId: id, delta });
            break;
          }
          case 'toolcall_start': {
            if (current.started.has(update.contentIndex)) break;
            const src = update.partial.content[update.contentIndex];
            if (src?.type !== 'toolCall' || !src.id || !src.name) break;
            const id = partId(current.messageId, update.contentIndex);
            const input = this.publicJsonObject(toolInput(JSON.parse(JSON.stringify(src.arguments))));
            current.lastEmittedToolInputByCallId.set(src.id, JSON.stringify(input));
            const part: Part = {
              type: 'tool_call',
              partId: id,
              toolCallId: this.publicText(src.id),
              toolName: this.publicText(src.name),
              input,
              status: 'running',
            };
            current.toolCallIndexById.set(src.id, update.contentIndex);
            this.ownToolCall(src.id, current.messageId, update.contentIndex);
            current.started.add(update.contentIndex);
            emit({ type: 'part.started', messageId: current.messageId, part });
            break;
          }
          case 'toolcall_delta': {
            const src = update.partial.content[update.contentIndex];
            if (src?.type !== 'toolCall' || !src.id || !src.name) break;
            const id = partId(current.messageId, update.contentIndex);
            this.ownToolCall(src.id, current.messageId, update.contentIndex);
            const input = this.publicJsonObject(toolInput(JSON.parse(JSON.stringify(src.arguments))));
            const serializedInput = JSON.stringify(input);
            const editPreview = current.editPreviewsByToolCallId.get(src.id) ?? this.toolCallPreviews.get(src.id);
            const part: Part = {
              type: 'tool_call',
              partId: id,
              toolCallId: this.publicText(src.id),
              toolName: this.publicText(src.name),
              input,
              status: 'running',
              ...(editPreview ? { editPreview } : {}),
            };
            if (!current.started.has(update.contentIndex)) {
              current.started.add(update.contentIndex);
              current.lastEmittedToolInputByCallId.set(src.id, serializedInput);
              emit({ type: 'part.started', messageId: current.messageId, part });
            } else {
              const lastEmitted = current.lastEmittedToolInputByCallId.get(src.id);
              if (lastEmitted === serializedInput) {
                // Skip part.updated when the redacted tool input equals the last emitted one
                break;
              }
              current.lastEmittedToolInputByCallId.set(src.id, serializedInput);
              emit({ type: 'part.updated', part });
            }
            break;
          }
          case 'toolcall_end': {
            const call = update.toolCall;
            if (!call.id || !call.name) break;
            const id = partId(current.messageId, update.contentIndex);
            const input = this.publicJsonObject(toolInput(JSON.parse(JSON.stringify(call.arguments))));
            const editPreview = current.editPreviewsByToolCallId.get(call.id) ?? this.toolCallPreviews.get(call.id);
            const part: Part = {
              type: 'tool_call',
              partId: id,
              toolCallId: this.publicText(call.id),
              toolName: this.publicText(call.name),
              input,
              status: 'running',
              ...(editPreview ? { editPreview } : {}),
            };
            current.toolCallIndexById.set(call.id, update.contentIndex);
            this.ownToolCall(call.id, current.messageId, update.contentIndex);
            if (!current.started.has(update.contentIndex)) {
              current.started.add(update.contentIndex);
              emit({ type: 'part.started', messageId: current.messageId, part });
            } else {
              emit({ type: 'part.completed', part });
            }
            break;
          }
          default: break;
        }
        break;
      }
      case 'message_end': {
        if (!visible(event.message)) break;
        // A result message ends after its call's message already closed; the
        // outcome is published on the call's message either way.
        if (event.message.role === 'toolResult') {
          this.publishToolResult(resultPayload(event.message), true, emit);
          break;
        }
        const current = this.message;
        if (!current) break;
        current.nativeMessage = event.message;
        for (const part of parts(event.message, current.messageId, current.attachments, current.sessionMentions)) {
          const index = Number(part.partId.slice(current.messageId.length + 1));
          this.textSuffixes.delete(part.partId);
          if (part.type === 'tool_call') {
            this.ownToolCall(part.toolCallId, current.messageId, index);
            const preview = this.toolCallPreviews.get(part.toolCallId) ?? current.editPreviewsByToolCallId.get(part.toolCallId);
            if (preview) part.editPreview = preview;
          }
          if (!current.started.has(index) && part.type !== 'attachment') {
            emit({ type: 'part.started', messageId: current.messageId, part });
          }
          emit({ type: 'part.completed', part });
        }
        if (event.message.role === 'assistant') {
          const finalMetadata = metadata(event.message);
          Object.assign(current, finalMetadata);
          emit({ type: 'message.updated', messageId: current.messageId, ...finalMetadata });

          const nativeAny = event.message as NativeMessage & { upstreamModel?: unknown; model?: unknown };
          if (typeof nativeAny.upstreamModel === 'string' && typeof nativeAny.model === 'string' && nativeAny.upstreamModel && nativeAny.upstreamModel !== nativeAny.model) {
            this.persistAndPublishNotice({
              type: 'notice',
              noticeType: 'served_model_mismatch',
              level: 'warning',
              details: {
                requested: nativeAny.upstreamModel,
                served: nativeAny.model,
                provider: typeof nativeAny.provider === 'string' ? nativeAny.provider : undefined,
                upstreamProvider: typeof nativeAny.upstreamProvider === 'string' ? nativeAny.upstreamProvider : undefined,
              },
            }, timestamp, emit);
          }

          const usage = current.usage;
          if (usage) {
            if (this.lastCacheRead >= 2048 && usage.cacheRead === 0 && usage.cacheWrite > 0) {
              const reprocessedTokens = usage.cacheWrite + usage.input;
              if (reprocessedTokens > 0) {
                this.persistAndPublishNotice({
                  type: 'notice',
                  noticeType: 'cache_invalidation',
                  level: 'info',
                  details: { reprocessedTokens },
                }, timestamp, emit);
              }
            }
            this.lastCacheRead = usage.cacheRead;
          }
        }
        if (event.message.role === 'assistant') {
          // The last assistant message decides the run outcome. A recovered
          // retry ends with a successful assistant message, which must clear
          // the earlier attempt's latched error.
          this.stopReason = event.message.stopReason === 'error' || event.message.stopReason === 'aborted'
            ? event.message.stopReason
            : undefined;
        }
        this.message = undefined;
        break;
      }
      case 'tool_execution_start':
        this.ownToolCall(event.toolCallId, this.message?.messageId, this.message?.toolCallIndexById.get(event.toolCallId));
        emit({ type: 'tool.started', toolCallId: event.toolCallId, toolName: event.toolName, input: toolInput(JSON.parse(JSON.stringify(event.args))) });
        break;
      case 'tool_execution_update': {
        // A long tool reports what it has produced so far. The live row reads
        // it from the result part, so a running call shows output instead of
        // waiting for its end.
        const payload = resultPayload(event.partialResult);
        this.publishToolResult({ ...payload, toolCallId: event.toolCallId, toolName: event.toolName }, false, emit);
        break;
      }
      case 'tool_execution_end': {
        const payload = resultPayload(event.result);
        const outcome = { ...payload, toolCallId: event.toolCallId, toolName: event.toolName, isError: event.isError === true || payload.isError === true };
        this.publishToolResult(outcome, true, emit);
        const part = toolResultPart(`bridge:${event.toolCallId}`, event.toolCallId, event.toolName, outcome);
        emit({
          type: 'tool.completed', toolCallId: event.toolCallId, status: outcome.isError ? 'failed' : 'completed',
          isError: outcome.isError === true,
          output: part.type === 'tool_result' ? part.output : undefined,
          ...(part.type === 'tool_result' && part.error !== undefined ? { error: part.error } : {}),
          ...(part.type === 'tool_result' && part.errorKind !== undefined ? { errorKind: part.errorKind } : {}),
        });
        this.toolCallPreviews.delete(event.toolCallId);
        if (event.toolName === 'todo' && !outcome.isError) {
          const details = TodoToolResultDetailsSchema.safeParse(outcome.details);
          if (!details.success || details.data.op !== 'view') {
            const phasesFromDetails = details.success && Array.isArray(details.data.phases)
              ? details.data.phases.filter(isTodoPhase)
              : undefined;
            const rawPhases = this.readLiveTodos
              ? this.readLiveTodos()
              : (phasesFromDetails ?? getLatestTodoPhasesFromEntries(this.manager.getBranch()));
            const todos = rawPhases.length > 0 && getTodoHudVisibility(this.manager.getBranch(), this.toNativeTodoPhases(rawPhases)) === 'dismissed'
              ? []
              : this.sanitizeTodoPhases(rawPhases);
            const serialized = JSON.stringify(todos);
            if (serialized !== this.lastProjectedTodosJson) {
              this.lastProjectedTodosJson = serialized;
              emit({ type: 'session.updated', todos });
            }
          }
        }
        break;
      }
      case 'tool_stream_update': {
        if (!event.toolCallId || !event.toolName) break;
        const editPreview = this.parseEditPreview(event.update);
        if (editPreview) {
          this.toolCallPreviews.set(event.toolCallId, editPreview);
          if (this.message) this.message.editPreviewsByToolCallId.set(event.toolCallId, editPreview);
        }
        const effectivePreview = editPreview ?? this.toolCallPreviews.get(event.toolCallId);
        const owner = this.liveToolCallOwners.get(event.toolCallId);
        const current = this.message;
        const contentIndex = current?.toolCallIndexById.get(event.toolCallId);
        const id = owner ? owner.callPartId : (current && contentIndex !== undefined ? partId(current.messageId, contentIndex) : undefined);
        if (!id) break;
        const src = current && current.nativeMessage.role === 'assistant' && Array.isArray(current.nativeMessage.content) && contentIndex !== undefined
          ? current.nativeMessage.content[contentIndex] : undefined;
        const rawArgs = src && src.type === 'toolCall' ? src.arguments : {};
        const input = this.publicJsonObject(toolInput(JSON.parse(JSON.stringify(rawArgs))));
        if (current) current.lastEmittedToolInputByCallId.set(event.toolCallId, JSON.stringify(input));
        const part: Part = {
          type: 'tool_call',
          partId: id,
          toolCallId: this.publicText(event.toolCallId),
          toolName: this.publicText(event.toolName),
          input,
          status: 'running',
          ...(effectivePreview ? { editPreview: effectivePreview } : {}),
        };
        emit({ type: 'part.updated', part });
        break;
      }
      case 'turn_end':
        if (!this.turn?.open) break;
        if (this.cancelRequestedRunId === run.runId) { this.recordTurn('cancelled', timestamp); break; }
        if (this.stopReason === undefined) {
          emit({ type: 'turn.completed', turnId: this.turn.turnId, runId: run.runId });
          this.recordTurn('completed', timestamp);
        }
        break;
      case 'agent_end':
        // An abort latched before the native await owns the outcome, including an end that loses its aborted message.
        if (this.cancelRequestedRunId === run.runId) { result.push(...this.cancelRun(timestamp)); break; }
        // The pinned SDK also marks completed requests yielded; isTerminal owns completion.
        if (event.isTerminal === false || event.awaitingAsyncWork === true) break;
        if (this.stopReason === 'error') result.push(...this.failRun('Agent execution failed', timestamp));
        else if (this.stopReason === 'aborted') result.push(...this.cancelRun(timestamp));
        else result.push(...this.completeRun(timestamp));
        break;
      default: break;
    }
    return this.publicEvents(result);
  }

  failRun(error: string, timestamp: number): ProjectionInput[] { this.textSuffixes.clear(); return this.publicEvents(this.finish('failed', timestamp, error)); }
  cancelRun(timestamp: number, runId?: string): ProjectionInput[] {
    if (runId !== undefined && this.run?.runId !== runId) return [];
    this.textSuffixes.clear();
    return this.publicEvents(this.finish('cancelled', timestamp));
  }
  completeRun(timestamp: number): ProjectionInput[] { this.textSuffixes.clear(); return this.publicEvents(this.finish('completed', timestamp)); }

  private recordTurn(status: 'completed' | 'failed' | 'cancelled', finishedAt: number, error?: string): void {
    if (!this.turn?.open || !this.run) return;
    this.manager.appendCustomEntry(TURN_TYPE, {
      turnId: this.turn.turnId, runId: this.run.runId,
      status, startedAt: this.turn.startedAt, finishedAt, error
    });
    this.turn.open = false;
  }

  private finish(status: 'completed' | 'failed' | 'cancelled', timestamp: number, error?: string): ProjectionInput[] {
    const run = this.run;
    if (!run) return [];
    const settled = status === 'completed' && this.cancelRequestedRunId === run.runId ? 'cancelled' : status;
    const result: ProjectionInput[] = [];
    if (settled === 'completed' && this.turn?.open) {
      result.push({ timestamp, event: { type: 'turn.completed', turnId: this.turn.turnId, runId: run.runId } });
    }
    this.recordTurn(settled, timestamp, error);
    const event: ProjectionEvent = settled === 'failed'
      ? { type: 'run.failed', runId: run.runId, finishedAt: timestamp, error: error ?? 'Agent execution failed' }
      : settled === 'cancelled' ? { type: 'run.cancelled', runId: run.runId, finishedAt: timestamp }
        : { type: 'run.completed', runId: run.runId, finishedAt: timestamp };
    result.push({ timestamp, event });
    run.status = settled;
    run.finishedAt = timestamp;
    if (error !== undefined) run.error = error;
    this.manager.appendCustomEntry(RUN_TYPE, { runId: run.runId, status: settled, origin: run.origin, finishedAt: timestamp, error });
    this.run = null;
    return result;
  }

  bindPending(): void {
    const entries = this.manager.getBranch();
    const end = entries.length;
    for (let index = this.entryOffset; index < end; index++) {
      const entry = entries[index];
      if (entry.type !== 'message' || !visible(entry.message)) continue;
      const pendingIndex = this.pending.findIndex(item => item.nativeMessage === entry.message);
      if (pendingIndex < 0) continue;
      const live = this.pending.splice(pendingIndex, 1)[0];
      const reference: Reference = {
        nativeEntryId: entry.id, messageId: live.messageId, turnId: live.turnId,
        runId: live.runId, userMessageId: live.userMessageId, virtualUser: false, attachments: live.attachments,
        ...(live.sessionMentions.length ? { sessionMentions: live.sessionMentions } : {})
      };
      this.manager.appendCustomEntry(REF_TYPE, reference);
    }
    this.entryOffset = end;
  }

  history(request: HistoryPageRequest): HistoryPage {
    const parsed = HistoryPageRequestSchema.parse(request);
    if (parsed.sessionId !== this.sessionId) throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'Session not found');
    const seed = this.readHistory();
    const leafIndex = parsed.leafTurnId === undefined ? seed.turns.length - 1 : seed.turns.findIndex(turn => turn.turnId === parsed.leafTurnId);
    if (parsed.leafTurnId !== undefined && leafIndex < 0) throw new ProjectionError(410, 'RESYNC_REQUIRED', 'History leaf is unavailable');
    const end = leafIndex + 1;
    let start = 0;
    if (parsed.cursor !== undefined) {
      let cursor: z.infer<typeof HistoryCursorSchema>;
      try { cursor = HistoryCursorSchema.parse(JSON.parse(Buffer.from(parsed.cursor, 'base64url').toString('utf8'))); }
      catch { throw new ProjectionError(400, 'INVALID_CURSOR', 'History cursor is invalid'); }
      if (cursor[0] !== seed.branch.branchId || cursor[1] !== seed.branch.branchVersion || cursor[2] !== seed.branch.leafMessageId
        || cursor[3] !== (parsed.leafTurnId ?? null) || cursor[4] > end) {
        throw new ProjectionError(410, 'RESYNC_REQUIRED', 'History selection has changed');
      }
      start = cursor[4];
    }
    const turns = seed.turns.slice(start, Math.min(start + (parsed.limit ?? 100), end));
    const selected = new Set(turns.map(turn => turn.turnId));
    const next = start + turns.length;
    return HistoryPageSchema.parse({
      sessionId: this.sessionId, branch: seed.branch, turns,
      messages: seed.messages.filter(message => selected.has(message.turnId)),
      nextCursor: next < end ? Buffer.from(JSON.stringify([seed.branch.branchId, seed.branch.branchVersion,
      seed.branch.leafMessageId, parsed.leafTurnId ?? null, next])).toString('base64url') : null,
    });
  }

  private readHistory(): ProjectionSeed {
    const mode = readSessionMode(this.manager);
    const entries = this.manager.getBranch();
    const references = new Map<string, Reference>();
    const terminals = new Map<string, z.infer<typeof TerminalSchema>>();
    const turnTerminals = new Map<string, z.infer<typeof TurnTerminalSchema>>();
    const toolResults = new Map<string, ToolResultPayload>();
    for (const entry of entries) if (entry.type === 'message' && entry.message.role === 'toolResult') {
      toolResults.set(entry.message.toolCallId, ToolResultPayloadSchema.parse(entry.message));
    }
    let version = 0n;
    let updatedAt = 0;
    const workerRuns = new Map<string, z.infer<typeof WorkerRunSchema>>();
    const noticesByMessageId = new Map<string, NoticePart[]>();
    const unassociatedNotices: NoticePart[] = [];
    for (const entry of this.manager.getEntries()) {
      if (entry.type === 'custom' && entry.customType === 'ohpichamber.notice.v1') {
        const payload = entry.data as { messageId?: string | null; part?: unknown };
        const parsed = NoticePartSchema.safeParse(payload?.part ?? entry.data);
        if (parsed.success) {
          if (payload?.messageId) {
            const list = noticesByMessageId.get(payload.messageId) ?? [];
            list.push(parsed.data);
            noticesByMessageId.set(payload.messageId, list);
          } else {
            unassociatedNotices.push(parsed.data);
          }
        }
      }
      const timestamp = Date.parse(entry.timestamp);
      if (Number.isFinite(timestamp)) updatedAt = Math.max(updatedAt, timestamp);
      // A tool result is a part of the message that made the call, not a
      // message of its own, so only messages that author a row count.
      if ((entry.type === 'message' && visible(entry.message) && entry.message.role !== 'toolResult')
        || (entry.type === 'custom_message' && entry.customType === 'rewind-report')
        || entry.type === 'compaction') version++;
      if (entry.type !== 'custom') continue;
      if (entry.customType === BRANCH_TYPE) version++;
      if (entry.customType === REF_TYPE) {
        const reference = ReferenceSchema.parse(entry.data);
        references.set(reference.nativeEntryId, reference);
      } else if (entry.customType === RUN_TYPE) {
        const terminal = TerminalSchema.parse(entry.data);
        terminals.set(terminal.runId, terminal);
      } else if (entry.customType === WORKER_RUN_TYPE) {
        const workerRun = WorkerRunSchema.parse(entry.data);
        workerRuns.set(workerRun.runId, workerRun);
      } else if (entry.customType === TURN_TYPE) {
        const terminal = TurnTerminalSchema.parse(entry.data);
        turnTerminals.set(terminal.turnId, terminal);
      }
    }
    for (const workerRun of workerRuns.values()) {
      if (workerRun.runId !== this.run?.runId && !terminals.has(workerRun.runId)) {
        terminals.set(workerRun.runId, {
          runId: workerRun.runId, status: 'failed', origin: workerRun.origin,
          finishedAt: workerRun.createdAt, error: 'Agent execution was interrupted'
        });
      }
    }
    const turns: Turn[] = [];
    const messages: Message[] = [];
    /** Where each call lives, so a native result joins that same message. */
    const toolCallMessages = new Map<string, { message: Message; callPartId: string }>();
    const turnById = new Map<string, Turn>();
    const liveTurnIds = new Set<string>();
    const activeRunId = this.run?.runId;
    let current: Turn | undefined;
    let leafMessageId: string | null = null;
    for (const [entryIndex, entry] of entries.entries()) {
      if (entry.type === 'custom_message' && entry.customType === 'rewind-report') {
        const details = entry.details;
        let report = '';
        if (details && typeof details === 'object' && 'report' in details && typeof details.report === 'string') {
          report = details.report.trim();
        } else if (typeof entry.content === 'string') {
          report = entry.content.trim();
        }
        const messageId = opaqueNativeId('message', this.sessionId, entry.id);
        const turnId = current?.turnId ?? opaqueNativeId('turn', this.sessionId, entry.id);
        const timestamp = new Date(entry.timestamp).getTime();
        messages.push({
          messageId, turnId, sessionId: this.sessionId, role: 'system',
          createdAt: timestamp,
          parts: [{ type: 'step_summary', partId: partId(messageId, 0), title: report ? `Rewind: ${report}` : 'Rewound to checkpoint' }],
        });
        leafMessageId = messageId;
        continue;
      }
      if (entry.type === 'compaction') {
        const method = mapCompactionAction(entry.method);
        const compactionPart: NoticePart = {
          type: 'notice',
          partId: `${entry.id}:compaction`,
          noticeType: 'compaction',
          level: 'info',
          details: {
            method,
            tokensBefore: entry.tokensBefore ?? 0,
            ...(entry.tokensAfter !== undefined ? { tokensAfter: entry.tokensAfter } : {}),
            ...(entry.summary ? { summary: entry.summary } : {}),
            ...(entry.warning ? { warning: entry.warning } : {}),
          },
        };
        const messageId = opaqueNativeId('message', this.sessionId, entry.id);
        const createdAt = Date.parse(entry.timestamp) || Date.now();
        let turn = current;
        if (!turn) {
          const turnId = opaqueNativeId('turn', this.sessionId, entry.id);
          turn = {
            turnId,
            sessionId: this.sessionId,
            runId: opaqueNativeId('run', this.sessionId, entry.id),
            userMessageId: messageId,
            assistantMessageIds: [],
            status: 'completed',
            startedAt: createdAt,
            finishedAt: createdAt,
          };
          turns.push(turn);
          turnById.set(turnId, turn);
          current = turn;
        }
        turn.assistantMessageIds.push(messageId);
        messages.push({
          messageId,
          turnId: turn.turnId,
          sessionId: this.sessionId,
          role: 'assistant',
          createdAt,
          parts: [compactionPart],
        });
        leafMessageId = messageId;
        continue;
      }
      if (entry.type !== 'message' || !visible(entry.message)) continue;
      if (entry.message.role === 'toolResult') {
        // The result belongs to the message that made the call, exactly as the
        // live stream publishes it. A transcript never grows a result row of
        // its own, so history and stream agree on where it lives.
        const owner = toolCallMessages.get(entry.message.toolCallId);
        if (owner) owner.message.parts.push(toolResultPart(`${owner.callPartId}:result`,
          entry.message.toolCallId, entry.message.toolName, resultPayload(entry.message)));
        continue;
      }
      const native = entry.message;
      const reference = references.get(entry.id);
      const messageId = reference?.messageId ?? opaqueNativeId('message', this.sessionId, entry.id);
      const turnId = reference?.turnId ?? (native.role === 'user' ? opaqueNativeId('turn', this.sessionId, entry.id) : current?.turnId);
      if (!turnId) continue;
      const timestamp = native.timestamp;
      let turn = turnById.get(turnId);
      if (!turn) {
        const userMessageId = reference?.userMessageId ?? messageId;
        const runId = reference?.runId ?? opaqueNativeId('run', this.sessionId, entry.id);
        const terminal = turnTerminals.get(turnId);
        const live = activeRunId !== undefined && (reference?.runId === activeRunId
          || (this.turn?.open === true && entryIndex >= this.entryOffset));
        if (live) liveTurnIds.add(turnId);
        turn = {
          turnId, sessionId: this.sessionId, runId, userMessageId, assistantMessageIds: [],
          status: terminal?.status ?? (live ? 'running' : 'completed'), startedAt: terminal?.startedAt ?? timestamp,
          ...(terminal?.finishedAt !== undefined ? { finishedAt: terminal.finishedAt } : live ? {} : { finishedAt: timestamp }),
          error: terminal?.error,
        };
        turns.push(turn);
        turnById.set(turnId, turn);
      }
      current = turn;
      const nativeMetadata = metadata(native);
      const message: Message = {
        messageId, turnId, sessionId: this.sessionId, role: native.role,
        createdAt: timestamp, parts: parts(native, messageId, reference?.attachments ?? [], reference?.sessionMentions ?? [], toolResults), ...nativeMetadata,
      };
      messages.push(message);
      for (const part of message.parts) if (part.type === 'tool_call') toolCallMessages.set(part.toolCallId, { message, callPartId: part.partId });
      if (native.role === 'assistant') turn.assistantMessageIds.push(messageId);
      if (!turnTerminals.has(turn.turnId)) {
        if (liveTurnIds.has(turn.turnId) || this.run?.runId === turn.runId) {
          turn.status = 'running';
          delete turn.finishedAt;
        } else {
          const recovered = native.role === 'assistant'
            && (native.retryRecovery?.status === 'recovered' || native.retryRecovery?.status === 'superseded');
          if (native.role === 'assistant' && native.stopReason === 'error' && !recovered) turn.status = 'failed';
          else if (native.role === 'assistant' && native.stopReason === 'aborted') turn.status = 'cancelled';
          else if (native.role === 'assistant' && native.stopReason !== 'toolUse') turn.status = 'completed';
          turn.finishedAt = timestamp;
        }
      }
      leafMessageId = messageId;
    }
    const firstVisibleMessage = messages.find((m) => m.role === 'user' || m.role === 'assistant');
    if (firstVisibleMessage && unassociatedNotices.length > 0) {
      firstVisibleMessage.parts.unshift(...unassociatedNotices);
    }
    for (const message of messages) {
      const persistedNotices = noticesByMessageId.get(message.messageId);
      if (persistedNotices) {
        for (const notice of persistedNotices) {
          if (!message.parts.some((p) => p.partId === notice.partId)) {
            message.parts.push(notice);
          }
        }
      }
    }
    const lastByRun = new Map<string, Turn>();
    for (const turn of turns) lastByRun.set(turn.runId, turn);
    for (const [runId, turn] of lastByRun) {
      const terminal = terminals.get(runId);
      if (!terminal || turnTerminals.has(turn.turnId)) continue;
      turn.status = terminal.status;
      turn.finishedAt = terminal.finishedAt;
      if (terminal.error !== undefined) turn.error = terminal.error;
    }
    const header = this.manager.getHeader();
    const createdAt = header ? Date.parse(header.timestamp) : Date.now();
    const selection = selectedBranchRevert(entries);
    let nativeSelection: ProjectionSeed['selection'] = { model: null, thinkingLevel: null };
    for (const entry of entries) {
      if (entry.type === 'model_change') {
        // A native persisted `model_change` names `provider/model`, and its
        // thinking level travels in a separate entry; the selector grammar
        // reads the pair without mistaking an id's own colon for a suffix.
        const parsed = parseModelString(entry.model);
        if (parsed) {
          nativeSelection = {
            ...nativeSelection,
            model: { providerId: parsed.providerId, modelId: parsed.modelId }
          };
        }
      } else if (entry.type === 'thinking_level_change') {
        nativeSelection = { ...nativeSelection, thinkingLevel: entry.configured ?? entry.thinkingLevel ?? null };
      }
    }
    for (const message of messages) {
      for (const part of message.parts) this.publicPart(part);
      if (message.providerId !== undefined) message.providerId = this.publicText(message.providerId);
      if (message.modelId !== undefined) message.modelId = this.publicText(message.modelId);
    }
    for (const turn of turns) if (turn.error !== undefined) turn.error = this.publicText(turn.error);
    const title = this.manager.getSessionName()?.trim();
    const todos = this.currentTodos();
    this.lastProjectedTodosJson = JSON.stringify(todos);
    const seed: ProjectionSeed = {
      createdAt, updatedAt: Math.max(createdAt, updatedAt, messages.at(-1)?.createdAt ?? createdAt), mode, selection: nativeSelection,
      compacting: this.compactingState ? structuredClone(this.compactingState) : null,
      todos,
      branch: {
        branchId: `branch:${this.sessionId}`, branchVersion: version.toString(), leafMessageId,
        ...(selection?.revertedMessageId ? { revert: { messageId: selection.revertedMessageId } } : undefined)
      }, turns, messages,
    };
    if (title) seed.title = title;
    return seed;
  }
}
