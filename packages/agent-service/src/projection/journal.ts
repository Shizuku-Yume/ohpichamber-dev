import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CanonicalEventSchema, CounterSchema, CursorSchema, EntityIdSchema, HistoryPageRequestSchema, HistoryPageSchema, RuntimeSessionSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import type { ApprovalRequest, CanonicalEvent, HistoryPage, HistoryPageRequest, JsonObject, Message, Part, ProblemCode, QuestionRequest, Run, RuntimeSession, SessionMode, SessionSnapshot, StreamInvalidated, TodoPhase, Turn } from '@openchamber/agent-contract';
import type { ProjectionInput, ProjectionSeed } from './protocol.ts';

export class ProjectionError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, message: string, readonly details?: JsonObject) { super(message); }
}
type SessionIdentity = { sessionId: string; projectId: string; workspaceId: string; displayPath: string; rootSessionId: string; parentSessionId?: string };
type Listener = (event: CanonicalEvent | StreamInvalidated) => void;
const REPLAY_LIMIT = 1000;
const U64_MAX = 18_446_744_073_709_551_615n;
const HistoryCursorSchema = z.tuple([EntityIdSchema, CounterSchema, EntityIdSchema.nullable(), EntityIdSchema.nullable(), z.number().int().nonnegative()]);

export class SessionJournal {
  private epoch = randomUUID();
  private head = 0n;
  private readonly events: (CanonicalEvent | undefined)[] = new Array(REPLAY_LIMIT);
  private eventStart = 0;
  private eventCount = 0;
  private readonly listeners = new Set<Listener>();
  private readonly runs = new Map<string, Run>();
  private readonly turnById = new Map<string, Turn>();
  private readonly messageById = new Map<string, Message>();
  private readonly partById = new Map<string, { message: Message; index: number }>();
  private readonly toolPartByCall = new Map<string, Extract<Part, { type: 'tool_call' }>>();
  private readonly approvals = new Map<string, ApprovalRequest>();
  private readonly questions = new Map<string, QuestionRequest>();
  private createdAt: number;
  private updatedAt: number;
  private branch: ProjectionSeed['branch'];
  private turns: Turn[];
  private messages: Message[];
  private mode: SessionMode;
  private loop: RuntimeSession['loop'];
  private selection: ProjectionSeed['selection'];
  private compacting: SessionSnapshot['compacting'] = null;
  private todos: TodoPhase[] = [];
  private activeRunId: string | null = null;
  private runtimeStatus: RuntimeSession['runtimeStatus'] = 'idle';
  private title: string | undefined;
  private continuationPending = false;
  private closed = false;

  constructor(private readonly identity: SessionIdentity, seed: ProjectionSeed) {
    this.createdAt = seed.createdAt;
    this.updatedAt = seed.updatedAt;
    this.branch = structuredClone(seed.branch);
    this.turns = structuredClone(seed.turns);
    this.mode = structuredClone(seed.mode);
    this.loop = structuredClone(seed.loop);
    this.selection = structuredClone(seed.selection ?? { model: null, thinkingLevel: null });
    this.messages = structuredClone(seed.messages);
    this.compacting = seed.compacting ? structuredClone(seed.compacting) : null;
    this.todos = structuredClone(seed.todos ?? []);
    this.title = seed.title;
    this.rebuildIndexes();
  }

  append(inputs: readonly ProjectionInput[]): CanonicalEvent[] {
    this.ensureOpen();
    const persistent = inputs.filter(input => !input.transient);
    const transient = inputs.filter(input => input.transient);
    let next = this.head;
    const events: CanonicalEvent[] = [];
    // Parse the batch before granting any sequence or mutating authoritative state.
    for (const input of persistent) {
      if (next === U64_MAX) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Event sequence is exhausted');
      events.push(CanonicalEventSchema.parse({
        ...input.event, sessionId: this.identity.sessionId,
        epoch: this.epoch, sequence: (++next).toString(), timestamp: input.timestamp,
      }));
    }
    const transientEvents = transient.map(input => {
      if (next === U64_MAX) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Event sequence is exhausted');
      return CanonicalEventSchema.parse({
        ...input.event, sessionId: this.identity.sessionId,
        epoch: this.epoch, sequence: (++next).toString(), timestamp: input.timestamp,
      });
    });
    for (const event of events) {
      this.reduce(event);
      this.head = BigInt(event.sequence);
      if (this.eventCount < REPLAY_LIMIT) this.events[(this.eventStart + this.eventCount++) % REPLAY_LIMIT] = event;
      else { this.events[this.eventStart] = event; this.eventStart = (this.eventStart + 1) % REPLAY_LIMIT; }
    }
    if (transientEvents.length > 0) this.head = BigInt(transientEvents.at(-1)!.sequence);
    for (const event of [...events, ...transientEvents]) for (const listener of this.listeners) listener(structuredClone(event));
    return structuredClone(events);
  }

  runtime(): RuntimeSession {
    const runtime = {
      ...this.identity, createdAt: this.createdAt, updatedAt: this.updatedAt,
      epoch: this.epoch, headSequence: this.head.toString(), runtimeStatus: this.runtimeStatus, activeRunId: this.activeRunId, mode: this.mode,
      continuationPending: this.continuationPending,
    };
    return RuntimeSessionSchema.parse(this.title === undefined ? runtime : { ...runtime, title: this.title });
  }

  snapshot(): SessionSnapshot {
    const turns = this.turns.slice(-100);
    const messages: Message[] = [];
    for (const turn of turns) {
      for (const message of this.messagesByTurn.get(turn.turnId) ?? []) messages.push(message);
    }
    return SessionSnapshotSchema.parse({
      session: { ...this.runtime(), ...(this.loop && { loop: this.loop }) },
      cursor: `${this.epoch}:${this.head}`, activeRun: this.activeRunId ? this.runs.get(this.activeRunId) : null,
      branch: this.branch, selection: this.selection, compacting: this.compacting, todos: this.todos,
      window: {
        firstTurnId: turns[0]?.turnId ?? null, lastTurnId: turns.at(-1)?.turnId ?? null,
        firstMessageId: messages[0]?.messageId ?? null, lastMessageId: messages.at(-1)?.messageId ?? null,
        hasEarlier: this.turns.length > turns.length,
      }, turns, messages, approvals: [...this.approvals.values()], questions: [...this.questions.values()],
      requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
    });
  }

  history(request: HistoryPageRequest): HistoryPage {
    const parsed = HistoryPageRequestSchema.parse(request);
    if (parsed.sessionId !== this.identity.sessionId) throw new ProjectionError(404, 'SESSION_NOT_FOUND', 'Session not found');
    const leafIndex = parsed.leafTurnId === undefined ? this.turns.length - 1 : this.turns.findIndex(turn => turn.turnId === parsed.leafTurnId);
    if (parsed.leafTurnId !== undefined && leafIndex < 0) throw new ProjectionError(410, 'RESYNC_REQUIRED', 'History leaf is unavailable');
    const end = leafIndex + 1;
    let start = 0;
    if (parsed.cursor !== undefined) {
      let cursor: z.infer<typeof HistoryCursorSchema>;
      try { cursor = HistoryCursorSchema.parse(JSON.parse(Buffer.from(parsed.cursor, 'base64url').toString('utf8'))); }
      catch { throw new ProjectionError(400, 'INVALID_CURSOR', 'History cursor is invalid'); }
      if (cursor[0] !== this.branch.branchId || cursor[1] !== this.branch.branchVersion
        || cursor[2] !== this.branch.leafMessageId || cursor[3] !== (parsed.leafTurnId ?? null) || cursor[4] > end) {
        throw new ProjectionError(410, 'RESYNC_REQUIRED', 'History selection has changed');
      }
      start = cursor[4];
    }
    const turns = this.turns.slice(start, Math.min(start + (parsed.limit ?? 100), end));
    const turnIds = new Set(turns.map(turn => turn.turnId));
    const messages = this.messages.filter(message => turnIds.has(message.turnId));
    const next = start + turns.length;
    return HistoryPageSchema.parse({
      sessionId: this.identity.sessionId, branch: this.branch, turns, messages,
      nextCursor: next < end ? Buffer.from(JSON.stringify([this.branch.branchId, this.branch.branchVersion,
      this.branch.leafMessageId, parsed.leafTurnId ?? null, next])).toString('base64url') : null,
    });
  }

  subscribe(cursor: string | undefined, onEvent: Listener) {
    this.ensureOpen();
    if (cursor === undefined) throw new ProjectionError(410, 'RESYNC_REQUIRED', 'A replay cursor is required');
    if (!CursorSchema.safeParse(cursor).success) throw new ProjectionError(400, 'INVALID_CURSOR', 'Replay cursor is invalid');
    const separator = cursor.indexOf(':');
    const sequence = BigInt(cursor.slice(separator + 1));
    if (cursor.slice(0, separator) !== this.epoch || sequence > this.head || sequence < this.head - BigInt(this.eventCount)) {
      throw new ProjectionError(410, 'RESYNC_REQUIRED', 'Replay is unavailable for this cursor');
    }
    const replay: CanonicalEvent[] = [];
    for (let index = 0; index < this.eventCount; index++) {
      const event = this.events[(this.eventStart + index) % REPLAY_LIMIT];
      if (event && BigInt(event.sequence) > sequence) replay.push(structuredClone(event));
    }
    this.listeners.add(onEvent);
    return { replay, unsubscribe: () => { this.listeners.delete(onEvent); } };
  }
  rekey(sessionId: string, rootSessionId = sessionId): void {
    this.identity.sessionId = sessionId;
    this.identity.rootSessionId = rootSessionId;
  }

  replaceInitialSeed(seed: ProjectionSeed): void {
    this.createdAt = seed.createdAt; this.updatedAt = seed.updatedAt; this.mode = structuredClone(seed.mode);
    this.loop = structuredClone(seed.loop);
    this.branch = structuredClone(seed.branch); this.turns = structuredClone(seed.turns); this.messages = structuredClone(seed.messages);
    this.selection = structuredClone(seed.selection ?? { model: null, thinkingLevel: null });
    this.compacting = seed.compacting ? structuredClone(seed.compacting) : null;
    this.todos = structuredClone(seed.todos ?? []);
    this.rebuildIndexes();
  }

  replace(seed: ProjectionSeed): void {
    this.resetEpoch();
    this.createdAt = seed.createdAt; this.updatedAt = seed.updatedAt; this.mode = structuredClone(seed.mode);
    this.loop = structuredClone(seed.loop);
    this.branch = structuredClone(seed.branch); this.turns = structuredClone(seed.turns); this.messages = structuredClone(seed.messages);
    this.selection = structuredClone(seed.selection ?? { model: null, thinkingLevel: null });
    this.compacting = seed.compacting ? structuredClone(seed.compacting) : null;
    this.todos = structuredClone(seed.todos ?? []);
    this.runs.clear(); this.approvals.clear(); this.questions.clear();
    this.activeRunId = null; this.runtimeStatus = 'idle';
    this.continuationPending = false;
    this.rebuildIndexes();
  }

  private unavailableReason?: string;

  unavailable(reason = 'SDK worker is unavailable'): void {
    if (this.closed) return;
    if (!this.unavailableReason || reason !== 'SDK worker is unavailable') {
      this.unavailableReason = reason;
    }
    if (this.activeRunId) this.settleRun(this.activeRunId, 'failed', Date.now(), this.unavailableReason);
    this.resetEpoch();
    this.runtimeStatus = 'unavailable'; this.activeRunId = null;
    this.continuationPending = false;
    this.approvals.clear(); this.questions.clear();
    this.compacting = null;
    this.loop = undefined;
  }

  reasonUnavailable(): string | undefined {
    return this.unavailableReason;
  }

  close(): void { if (this.closed) return; this.resetEpoch(); this.closed = true; }

  private resetEpoch(): void {
    const invalidated: StreamInvalidated = { type: 'stream.invalidated', sessionId: this.identity.sessionId, epoch: this.epoch, reason: 'EPOCH_CHANGED' };
    for (const listener of this.listeners) listener(invalidated);
    this.listeners.clear(); this.epoch = randomUUID(); this.head = 0n;
    this.events.fill(undefined); this.eventCount = 0; this.eventStart = 0;
  }

  private readonly messagesByTurn = new Map<string, Message[]>();

  private rebuildIndexes(): void {
    this.turnById.clear(); this.messageById.clear(); this.partById.clear(); this.toolPartByCall.clear(); this.messagesByTurn.clear();
    for (const turn of this.turns) this.turnById.set(turn.turnId, turn);
    for (const message of this.messages) {
      this.messageById.set(message.messageId, message);
      this.indexMessage(message);
      message.parts.forEach((part, index) => {
        this.partById.set(part.partId, { message, index });
        if (part.type === 'tool_call') this.toolPartByCall.set(part.toolCallId, part);
      });
    }
  }

  private indexMessage(message: Message): void {
    const messages = this.messagesByTurn.get(message.turnId);
    if (messages) messages.push(message); else this.messagesByTurn.set(message.turnId, [message]);
  }

  private settleRun(runId: string, status: 'completed' | 'failed' | 'cancelled', finishedAt: number, error?: string): void {
    const run = this.runs.get(runId);
    if (run) { run.status = status; run.finishedAt = finishedAt; if (error !== undefined) run.error = error; }
    for (let index = this.turns.length - 1; index >= 0; index--) {
      const turn = this.turns[index];
      if (!turn || turn.runId !== runId) break;
      if (turn.status === 'pending' || turn.status === 'running' || turn.status === 'awaiting_approval' || turn.status === 'awaiting_input') {
        turn.status = status; turn.finishedAt = finishedAt; if (error !== undefined) turn.error = error;
      }
    }
    if (this.activeRunId === runId) { this.activeRunId = null; this.runtimeStatus = 'idle'; }
  }

  private reduce(event: CanonicalEvent): void {
    switch (event.type) {
      case 'run.started':
        this.runs.set(event.runId, { runId: event.runId, sessionId: this.identity.sessionId, status: 'running', origin: event.origin ?? 'host', createdAt: event.createdAt });
        this.activeRunId = event.runId; this.runtimeStatus = 'running'; return;
      case 'run.completed': case 'run.cancelled': case 'run.failed':
        this.settleRun(event.runId, event.type === 'run.completed' ? 'completed' : event.type === 'run.cancelled' ? 'cancelled' : 'failed', event.finishedAt, event.type === 'run.failed' ? event.error : undefined); return;
      case 'session.updated':
        if (event.mode !== undefined) this.mode = structuredClone(event.mode);
        if (event.loop !== undefined) this.loop = structuredClone(event.loop);
        if (event.title !== undefined) this.title = event.title;
        if (event.continuationPending !== undefined) this.continuationPending = event.continuationPending;
        if (event.selection !== undefined) this.selection = structuredClone(event.selection);
        if (event.compacting !== undefined) this.compacting = event.compacting ? structuredClone(event.compacting) : null;
        if (event.todos !== undefined) this.todos = structuredClone(event.todos);
        return;
      case 'session.compacted': {
        this.compacting = null;
        const turn = this.turns.at(-1);
        if (turn && !this.messageById.has(event.compactionId)) {
          const compactionPart: Part = {
            type: 'notice',
            partId: `${event.compactionId}:compaction`,
            noticeType: 'compaction',
            level: 'info',
            details: {
              method: event.method ?? 'compacted',
              tokensBefore: event.tokensBefore,
              ...(event.tokensAfter !== undefined ? { tokensAfter: event.tokensAfter } : {}),
              ...(event.summary !== undefined ? { summary: event.summary } : {}),
              ...(event.warning !== undefined ? { warning: event.warning } : {}),
            },
          };
          const message: Message = {
            messageId: event.compactionId,
            sessionId: this.identity.sessionId,
            turnId: turn.turnId,
            role: 'assistant',
            createdAt: event.completedAt,
            parts: [compactionPart],
          };
          this.messages.push(message);
          this.messageById.set(message.messageId, message);
          turn.assistantMessageIds.push(message.messageId);
          this.indexMessage(message);
          this.partById.set(compactionPart.partId, { message, index: 0 });
          this.branch.leafMessageId = message.messageId;
          this.branch.branchVersion = (BigInt(this.branch.branchVersion) + 1n).toString();
        }
        return;
      }
      case 'session.status': this.runtimeStatus = event.runtimeStatus; this.activeRunId = event.activeRunId; return;
      case 'turn.started': {
        const turn: Turn = {
          turnId: event.turnId, sessionId: this.identity.sessionId, runId: event.runId, userMessageId: event.userMessageId,
          status: 'running', startedAt: event.timestamp, assistantMessageIds: [],
        };
        this.turns.push(turn); this.turnById.set(turn.turnId, turn); return;
      }
      case 'turn.completed': {
        const turn = this.turnById.get(event.turnId);
        if (turn) { turn.status = 'completed'; turn.finishedAt = event.timestamp; } return;
      }
      case 'message.updated': {
        const message = this.messageById.get(event.messageId);
        if (!message) return;
        if (event.providerId !== undefined) message.providerId = event.providerId;
        if (event.modelId !== undefined) message.modelId = event.modelId;
        if (event.usage !== undefined) message.usage = structuredClone(event.usage);
        return;
      }
      case 'message.created': {
        const message: Message = { messageId: event.messageId, sessionId: this.identity.sessionId, turnId: event.turnId, role: event.role, createdAt: event.timestamp, parts: [] };
        if (event.providerId !== undefined) message.providerId = event.providerId;
        if (event.modelId !== undefined) message.modelId = event.modelId;
        if (event.usage !== undefined) message.usage = structuredClone(event.usage);
        this.messages.push(message); this.messageById.set(message.messageId, message);
        const turn = this.turnById.get(message.turnId);
        if (turn && message.role === 'assistant') turn.assistantMessageIds.push(message.messageId);
        this.indexMessage(message);
        this.branch.leafMessageId = message.messageId;
        this.branch.branchVersion = (BigInt(this.branch.branchVersion) + 1n).toString();
        delete this.branch.revert;
        return;
      }
      case 'part.started': {
        const message = this.messageById.get(event.messageId);
        if (!message) return;
        const part = structuredClone(event.part);
        message.parts.push(part); this.partById.set(part.partId, { message, index: message.parts.length - 1 });
        if (part.type === 'tool_call') this.toolPartByCall.set(part.toolCallId, part); return;
      }
      case 'part.delta': {
        const ref = this.partById.get(event.partId);
        const part = ref?.message.parts[ref.index];
        if (part?.type === 'text' || part?.type === 'reasoning') part.content += event.delta; return;
      }
      case 'part.updated': case 'part.completed': {
        const ref = this.partById.get(event.part.partId);
        if (!ref) return;
        const part = structuredClone(event.part);
        ref.message.parts[ref.index] = part;
        if (part.type === 'tool_call') this.toolPartByCall.set(part.toolCallId, part);
        return;
      }
      case 'tool.started': {
        const part = this.toolPartByCall.get(event.toolCallId);
        if (part) { part.status = 'running'; part.input = structuredClone(event.input); } return;
      }
      case 'tool.completed': {
        const part = this.toolPartByCall.get(event.toolCallId);
        if (part) part.status = event.status; return;
      }
      case 'approval.requested': this.approvals.set(event.approval.approvalId, structuredClone(event.approval)); return;
      case 'approval.resolved': this.approvals.delete(event.approval.approvalId); return;
      case 'question.requested': this.questions.set(event.question.questionId, structuredClone(event.question)); return;
      case 'question.resolved': this.questions.delete(event.question.questionId); return;
      default: return;
    }
  }

  private ensureOpen(): void { if (this.closed) throw new ProjectionError(410, 'RESYNC_REQUIRED', 'Session stream is closed'); }
}
