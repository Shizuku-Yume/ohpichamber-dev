import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AgentSessionEvent } from '@oh-my-pi/pi-coding-agent/session/agent-session-events';
import type { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { CounterSchema, EntityIdSchema, HistoryPageRequestSchema, HistoryPageSchema, JsonObjectSchema, JsonValueSchema, PromptAttachmentSchema, TokenUsageSchema } from '@openchamber/agent-contract';
import type { HistoryPage, HistoryPageRequest, Message, Part, PromptAttachment, Run, TokenUsage, Turn } from '@openchamber/agent-contract';
import type { ProjectionEvent, ProjectionInput, ProjectionSeed } from '../projection/protocol.ts';
import { ProjectionError } from '../projection/journal.ts';

type NativeMessage = Extract<AgentSessionEvent, { type: 'message_start' }>['message'];
type VisibleMessage = Extract<NativeMessage, { role: 'user' | 'assistant' | 'toolResult' }>;
const REF_TYPE = 'ohpichamber.canonical.v1';
const RUN_TYPE = 'ohpichamber.run.v1';
const TURN_TYPE = 'ohpichamber.turn.v1';
const ReferenceSchema = z.strictObject({
  nativeEntryId: EntityIdSchema, messageId: EntityIdSchema, turnId: EntityIdSchema,
  runId: EntityIdSchema, userMessageId: EntityIdSchema, virtualUser: z.boolean(),
  attachments: z.array(PromptAttachmentSchema),
});
type Reference = z.infer<typeof ReferenceSchema>;
const TerminalSchema = z.strictObject({
  runId: EntityIdSchema, status: z.enum(['completed', 'failed', 'cancelled']),
  finishedAt: z.number().finite().nonnegative(), error: z.string().optional(),
});
const TurnTerminalSchema = TerminalSchema.extend({ turnId: EntityIdSchema, startedAt: z.number().finite().nonnegative() });
const HistoryCursorSchema = z.tuple([EntityIdSchema, CounterSchema, EntityIdSchema.nullable(), EntityIdSchema.nullable(), z.number().int().nonnegative()]);
interface LiveMessage {
  messageId: string; turnId: string; runId: string; userMessageId: string;
  virtualUser: boolean; nativeRole: VisibleMessage['role']; timestamp: number;
  attachments: PromptAttachment[]; started: Set<number>; providerId?: string; modelId?: string; usage?: TokenUsage;
}

function metadata(message: VisibleMessage): Pick<LiveMessage, 'providerId' | 'modelId' | 'usage'> {
  if (message.role !== 'assistant') return {};
  return { providerId: message.provider, modelId: message.model, usage: TokenUsageSchema.parse(message.usage) };
}

function visible(message: NativeMessage): message is VisibleMessage {
  return message.role === 'assistant' || message.role === 'toolResult' || (message.role === 'user' && message.synthetic !== true);
}
function partId(messageId: string, index: number): string { return `${messageId}:${index}`; }
function parts(message: VisibleMessage, messageId: string, attachments: PromptAttachment[], toolResults?: ReadonlyMap<string, boolean>): Part[] {
  const result: Part[] = [];
  if (message.role === 'toolResult') {
    result.push({ type: 'tool_result', partId: partId(messageId, 0), toolCallId: message.toolCallId,
      toolName: message.toolName, isError: message.isError, output: JsonValueSchema.parse(message.content),
      error: message.isError ? 'Tool execution failed' : undefined,
    });
  } else if (Array.isArray(message.content)) {
    for (const [index, item] of message.content.entries()) {
      if (item.type === 'text') result.push({ type: 'text', partId: partId(messageId, index), content: item.text });
      else if (item.type === 'thinking') result.push({ type: 'reasoning', partId: partId(messageId, index), content: item.thinking,
        signature: item.thinkingSignature,
      });
      else if (item.type === 'toolCall') result.push({ type: 'tool_call', partId: partId(messageId, index), toolCallId: item.id,
        toolName: item.name, input: JsonObjectSchema.parse(item.arguments),
        status: toolResults?.has(item.id) ? toolResults.get(item.id) ? 'failed' : 'completed' : 'running',
      });
    }
  } else {
    result.push({ type: 'text', partId: partId(messageId, 0), content: message.content });
  }
  for (const [index, attachment] of attachments.entries()) result.push({ type: 'attachment', partId: `${messageId}:attachment:${index}`, ...attachment });
  return result;
}

/** Native transcript owns content; custom entries retain canonical identity and lifecycle times. */
export class WorkerProjection {
  private run: Run | null = null;
  private turn: { turnId: string; userMessageId: string; virtualUser: boolean; open: boolean; startedAt: number } | undefined;
  private message: LiveMessage | undefined;
  private readonly pending: LiveMessage[] = [];
  private attachments: PromptAttachment[] = [];
  private readonly queuedPrompts = new WeakMap<NativeMessage, { messageId: string; attachments: PromptAttachment[] }>();
  private entryOffset: number;
  private stopReason: 'error' | 'aborted' | undefined;

  constructor(private readonly manager: SessionManager, private readonly sessionId: string) {
    this.entryOffset = manager.getBranch().length;
  }

  seed(): ProjectionSeed { return this.readHistory(); }
  activeRun(): Run | null { return this.run; }
  currentTurn(): { turnId: string } | undefined { return this.turn?.open ? { turnId: this.turn.turnId } : undefined; }
  admitQueuedPrompt(message: Extract<NativeMessage, { role: 'user' }>, attachments: PromptAttachment[]): string {
    const messageId = randomUUID();
    this.queuedPrompts.set(message, { messageId, attachments });
    return messageId;
  }

  beginRun(runId: string, timestamp: number, attachments: PromptAttachment[] = []): ProjectionInput[] {
    if (this.run) throw new ProjectionError(409, 'RUN_ACTIVE', 'A run is already active');
    this.run = { runId, sessionId: this.sessionId, status: 'running', createdAt: timestamp };
    this.turn = undefined;
    this.message = undefined;
    this.stopReason = undefined;
    this.attachments = attachments;
    return [{ timestamp, event: { type: 'run.started', runId, createdAt: timestamp } }];
  }

  consume(event: AgentSessionEvent): ProjectionInput[] {
    const queued = event.type === 'message_start' && event.message.role === 'user' ? this.queuedPrompts.get(event.message) : undefined;
    const timestamp = Date.now();
    const result: ProjectionInput[] = !this.run && queued ? this.beginRun(randomUUID(), timestamp) : [];
    const run = this.run;
    if (!run) return result;
    const emit = (payload: ProjectionEvent): void => { result.push({ timestamp, event: payload }); };
    switch (event.type) {
      case 'message_start': {
        if (!visible(event.message)) break;
        const native = event.message;
        if (native.role === 'user' || !this.turn?.open) {
          const turnId = randomUUID();
          const userMessageId = queued?.messageId ?? randomUUID();
          const virtualUser = native.role !== 'user';
          this.turn = { turnId, userMessageId, virtualUser, open: true, startedAt: timestamp };
          emit({ type: 'turn.started', turnId, runId: run.runId, userMessageId });
          if (virtualUser) emit({ type: 'message.created', messageId: userMessageId, turnId, role: 'user' });
        }
        const turn = this.turn;
        if (!turn) throw new ProjectionError(503, 'INTERNAL_ERROR', 'Native message has no turn');
        const messageId = native.role === 'user' ? turn.userMessageId : randomUUID();
        const nativeMetadata = metadata(native);
        const current: LiveMessage = { messageId, turnId: turn.turnId, runId: run.runId,
          userMessageId: turn.userMessageId, virtualUser: turn.virtualUser,
          nativeRole: native.role, timestamp: native.timestamp,
          attachments: native.role === 'user' ? queued?.attachments ?? this.attachments : [], started: new Set(), ...nativeMetadata,
        };
        if (native.role === 'user') { this.queuedPrompts.delete(native); this.attachments = []; }
        this.message = current;
        this.pending.push(current);
        emit({ type: 'message.created', messageId, turnId: turn.turnId,
          role: native.role === 'toolResult' ? 'system' : native.role, ...nativeMetadata });
        for (const part of parts(native, messageId, current.attachments)) {
          emit({ type: 'part.started', messageId, part });
          const index = native.role === 'toolResult' ? 0 : native.content instanceof Array
            ? native.content.findIndex((item, index) => part.partId === partId(messageId, index)) : 0;
          if (index >= 0) current.started.add(index);
        }
        break;
      }
      case 'message_update': {
        const current = this.message;
        if (!current || current.nativeRole !== 'assistant') break;
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
          case 'text_delta': case 'thinking_delta':
            emit({ type: 'part.delta', partId: partId(current.messageId, update.contentIndex), delta: update.delta });
            break;
          case 'toolcall_end': {
            const call = update.toolCall;
            const part: Part = { type: 'tool_call', partId: partId(current.messageId, update.contentIndex),
              toolCallId: call.id, toolName: call.name, input: JsonObjectSchema.parse(call.arguments), status: 'running' };
            if (!current.started.has(update.contentIndex)) {
              current.started.add(update.contentIndex);
              emit({ type: 'part.started', messageId: current.messageId, part });
            }
            break;
          }
          default: break;
        }
        break;
      }
      case 'message_end': {
        const current = this.message;
        if (!current || !visible(event.message)) break;
        for (const part of parts(event.message, current.messageId, current.attachments)) {
          const index = Number(part.partId.slice(current.messageId.length + 1));
          if (!current.started.has(index) && part.type !== 'attachment') {
            emit({ type: 'part.started', messageId: current.messageId, part });
          }
          emit({ type: 'part.completed', part });
        }
        if (event.message.role === 'assistant') {
          const finalMetadata = metadata(event.message);
          Object.assign(current, finalMetadata);
          emit({ type: 'message.updated', messageId: current.messageId, ...finalMetadata });
        }
        if (event.message.role === 'assistant' && (event.message.stopReason === 'error' || event.message.stopReason === 'aborted')) {
          this.stopReason = event.message.stopReason;
        }
        this.message = undefined;
        break;
      }
      case 'tool_execution_start':
        emit({ type: 'tool.started', toolCallId: event.toolCallId, toolName: event.toolName, input: JsonObjectSchema.parse(event.args) });
        break;
      case 'tool_execution_end':
        emit({ type: 'tool.completed', toolCallId: event.toolCallId, status: event.isError ? 'failed' : 'completed',
          // SDK tool details contain optional undefined fields; IPC carries their JSON representation.
          isError: event.isError === true, output: JsonValueSchema.parse(JSON.parse(JSON.stringify(event.result))),
          error: event.isError ? 'Tool execution failed' : undefined,
        });
        break;
      case 'auto_compaction_end':
        if (event.result === undefined || event.aborted || event.willRetry || event.skipped === true) break;
        emit({ type: 'session.compacted', compactionId: randomUUID(), tokensBefore: event.result.tokensBefore, completedAt: timestamp });
        break;
      case 'turn_end':
        if (this.turn?.open && this.stopReason === undefined) {
          emit({ type: 'turn.completed', turnId: this.turn.turnId, runId: run.runId });
          this.recordTurn('completed', timestamp);
        }
        break;
      case 'agent_end':
        // The pinned SDK also marks completed requests yielded; isTerminal owns completion.
        if (event.isTerminal === false || event.awaitingAsyncWork === true) break;
        if (this.stopReason === 'error') result.push(...this.failRun('Agent execution failed', timestamp));
        else if (this.stopReason === 'aborted') result.push(...this.cancelRun(timestamp));
        else result.push(...this.completeRun(timestamp));
        break;
      default: break;
    }
    return result;
  }

  failRun(error: string, timestamp: number): ProjectionInput[] { return this.finish('failed', timestamp, error); }
  cancelRun(timestamp: number): ProjectionInput[] { return this.finish('cancelled', timestamp); }
  completeRun(timestamp: number): ProjectionInput[] { return this.finish('completed', timestamp); }

  private recordTurn(status: 'completed' | 'failed' | 'cancelled', finishedAt: number, error?: string): void {
    if (!this.turn?.open || !this.run) return;
    this.manager.appendCustomEntry(TURN_TYPE, { turnId: this.turn.turnId, runId: this.run.runId,
      status, startedAt: this.turn.startedAt, finishedAt, error });
    this.turn.open = false;
  }

  private finish(status: 'completed' | 'failed' | 'cancelled', timestamp: number, error?: string): ProjectionInput[] {
    const run = this.run;
    if (!run) return [];
    const result: ProjectionInput[] = [];
    if (status === 'completed' && this.turn?.open) {
      result.push({ timestamp, event: { type: 'turn.completed', turnId: this.turn.turnId, runId: run.runId } });
    }
    this.recordTurn(status, timestamp, error);
    const event: ProjectionEvent = status === 'failed'
      ? { type: 'run.failed', runId: run.runId, finishedAt: timestamp, error: error ?? 'Agent execution failed' }
      : status === 'cancelled' ? { type: 'run.cancelled', runId: run.runId, finishedAt: timestamp }
      : { type: 'run.completed', runId: run.runId, finishedAt: timestamp };
    result.push({ timestamp, event });
    run.status = status;
    run.finishedAt = timestamp;
    if (error !== undefined) run.error = error;
    this.manager.appendCustomEntry(RUN_TYPE, { runId: run.runId, status, finishedAt: timestamp, error });
    this.run = null;
    return result;
  }

  bindPending(): void {
    const entries = this.manager.getBranch();
    const end = entries.length;
    for (let index = this.entryOffset; index < end; index++) {
      const entry = entries[index];
      if (entry.type !== 'message' || !visible(entry.message)) continue;
      const pendingIndex = this.pending.findIndex(item => item.nativeRole === entry.message.role && item.timestamp === entry.message.timestamp);
      if (pendingIndex < 0) continue;
      const live = this.pending.splice(pendingIndex, 1)[0];
      const reference: Reference = { nativeEntryId: entry.id, messageId: live.messageId, turnId: live.turnId,
        runId: live.runId, userMessageId: live.userMessageId, virtualUser: live.virtualUser, attachments: live.attachments };
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
    return HistoryPageSchema.parse({ sessionId: this.sessionId, branch: seed.branch, turns,
      messages: seed.messages.filter(message => selected.has(message.turnId)),
      nextCursor: next < end ? Buffer.from(JSON.stringify([seed.branch.branchId, seed.branch.branchVersion,
        seed.branch.leafMessageId, parsed.leafTurnId ?? null, next])).toString('base64url') : null,
    });
  }

  private readHistory(): ProjectionSeed {
    const entries = this.manager.getBranch();
    const references = new Map<string, Reference>();
    const terminals = new Map<string, z.infer<typeof TerminalSchema>>();
    const turnTerminals = new Map<string, z.infer<typeof TurnTerminalSchema>>();
    const toolResults = new Map<string, boolean>();
    for (const entry of entries) {
      if (entry.type === 'message' && entry.message.role === 'toolResult') toolResults.set(entry.message.toolCallId, entry.message.isError);
      if (entry.type !== 'custom') continue;
      if (entry.customType === REF_TYPE) {
        const reference = ReferenceSchema.parse(entry.data);
        references.set(reference.nativeEntryId, reference);
      } else if (entry.customType === RUN_TYPE) {
        const terminal = TerminalSchema.parse(entry.data);
        terminals.set(terminal.runId, terminal);
      } else if (entry.customType === TURN_TYPE) {
        const terminal = TurnTerminalSchema.parse(entry.data);
        turnTerminals.set(terminal.turnId, terminal);
      }
    }
    const turns: Turn[] = [];
    const messages: Message[] = [];
    const turnById = new Map<string, Turn>();
    let current: Turn | undefined;
    let leafMessageId: string | null = null;
    for (const entry of entries) {
      if (entry.type !== 'message' || !visible(entry.message)) continue;
      const native = entry.message;
      const reference = references.get(entry.id);
      const messageId = reference?.messageId ?? `native-message:${entry.id}`;
      const turnId = reference?.turnId ?? (native.role === 'user' ? `native-turn:${entry.id}` : current?.turnId);
      if (!turnId) continue;
      const timestamp = native.timestamp;
      let turn = turnById.get(turnId);
      if (!turn) {
        const userMessageId = reference?.userMessageId ?? messageId;
        const runId = reference?.runId ?? `native-run:${entry.id}`;
        const terminal = turnTerminals.get(turnId);
        turn = { turnId, sessionId: this.sessionId, runId, userMessageId, assistantMessageIds: [],
          status: terminal?.status ?? 'completed', startedAt: terminal?.startedAt ?? timestamp, finishedAt: terminal?.finishedAt ?? timestamp,
          error: terminal?.error,
        };
        turns.push(turn);
        turnById.set(turnId, turn);
        if (native.role !== 'user') messages.push({ messageId: userMessageId, turnId, sessionId: this.sessionId, role: 'user', createdAt: timestamp, parts: [] });
      }
      current = turn;
      const nativeMetadata = metadata(native);
      messages.push({ messageId, turnId, sessionId: this.sessionId, role: native.role === 'toolResult' ? 'system' : native.role,
        createdAt: timestamp, parts: parts(native, messageId, reference?.attachments ?? [], toolResults), ...nativeMetadata,
      });
      if (native.role === 'assistant') turn.assistantMessageIds.push(messageId);
      if (!turnTerminals.has(turn.turnId)) {
        if (native.role === 'assistant' && native.stopReason === 'error') turn.status = 'failed';
        else if (native.role === 'assistant' && native.stopReason === 'aborted') turn.status = 'cancelled';
        turn.finishedAt = timestamp;
      }
      leafMessageId = messageId;
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
    return { createdAt, updatedAt: messages.at(-1)?.createdAt ?? createdAt,
      branch: { branchId: `branch:${this.sessionId}`, branchVersion: String(messages.length), leafMessageId }, turns, messages,
    };
  }
}
