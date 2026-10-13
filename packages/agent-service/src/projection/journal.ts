import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CanonicalEventSchema, CounterSchema, CursorSchema, EntityIdSchema, HistoryPageRequestSchema, HistoryPageSchema, RuntimeSessionSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import type { ApprovalRequest, CanonicalEvent, HistoryPage, HistoryPageRequest, JsonObject, Message, Part, ProblemCode, QuestionRequest, Run, RuntimeSession, SessionSnapshot, StreamInvalidated, Turn } from '@openchamber/agent-contract';
import type { ProjectionInput, ProjectionSeed } from './protocol.ts';

export class ProjectionError extends Error {
  constructor(readonly status: number, readonly code: ProblemCode, message: string, readonly details?: JsonObject) { super(message); }
}
type SessionIdentity = Pick<RuntimeSession, 'sessionId' | 'projectId' | 'workspaceId' | 'displayPath' | 'rootSessionId' | 'parentSessionId'>;
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
  private activeRunId: string | null = null;
  private runtimeStatus: RuntimeSession['runtimeStatus'] = 'idle';
  private closed = false;

  constructor(private readonly identity: SessionIdentity, seed: ProjectionSeed) {
    this.createdAt = seed.createdAt;
    this.updatedAt = seed.updatedAt;
    this.branch = structuredClone(seed.branch);
    this.turns = structuredClone(seed.turns);
    this.messages = structuredClone(seed.messages);
    this.rebuildIndexes();
  }

  append(inputs: readonly ProjectionInput[]): CanonicalEvent[] {
    this.ensureOpen();
    let next = this.head;
    const events: CanonicalEvent[] = [];
    // Parse the batch before granting any sequence or mutating authoritative state.
    for (const input of inputs) {
      if (next === U64_MAX) throw new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Event sequence is exhausted');
      events.push(CanonicalEventSchema.parse({ ...input.event, sessionId: this.identity.sessionId,
        epoch: this.epoch, sequence: (++next).toString(), timestamp: input.timestamp,
      }));
    }
    for (const event of events) {
      this.reduce(event);
      this.head = BigInt(event.sequence);
      this.updatedAt = event.timestamp;
      if (this.eventCount < REPLAY_LIMIT) this.events[(this.eventStart + this.eventCount++) % REPLAY_LIMIT] = event;
      else { this.events[this.eventStart] = event; this.eventStart = (this.eventStart + 1) % REPLAY_LIMIT; }
    }
    for (const event of events) for (const listener of this.listeners) listener(structuredClone(event));
    return structuredClone(events);
  }

  runtime(): RuntimeSession {
    return RuntimeSessionSchema.parse({ ...this.identity, createdAt: this.createdAt, updatedAt: this.updatedAt,
      epoch: this.epoch, headSequence: this.head.toString(), runtimeStatus: this.runtimeStatus, activeRunId: this.activeRunId,
    });
  }

  snapshot(): SessionSnapshot {
    const turns = this.turns.slice(-100);
    const messages: Message[] = [];
    for (const turn of turns) {
      const user = this.messageById.get(turn.userMessageId);
      if (user?.turnId === turn.turnId) messages.push(user);
      for (const messageId of turn.assistantMessageIds) {
        const message = this.messageById.get(messageId);
        if (message) messages.push(message);
      }
      // System/tool-result messages also belong to the addressed turn.
      for (const message of this.systemMessages(turn.turnId)) messages.push(message);
    }
    return SessionSnapshotSchema.parse({
      session: this.runtime(), cursor: `${this.epoch}:${this.head}`, activeRun: this.activeRunId ? this.runs.get(this.activeRunId) : null,
      branch: this.branch,
      window: { firstTurnId: turns[0]?.turnId ?? null, lastTurnId: turns.at(-1)?.turnId ?? null,
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
    return HistoryPageSchema.parse({ sessionId: this.identity.sessionId, branch: this.branch, turns, messages,
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

  replace(seed: ProjectionSeed): void {
    this.resetEpoch();
    this.createdAt = seed.createdAt; this.updatedAt = seed.updatedAt;
    this.branch = structuredClone(seed.branch); this.turns = structuredClone(seed.turns); this.messages = structuredClone(seed.messages);
    this.activeRunId = null; this.runtimeStatus = 'idle';
    this.runs.clear(); this.approvals.clear(); this.questions.clear();
    this.rebuildIndexes();
  }

  unavailable(): void {
    if (this.closed) return;
    if (this.activeRunId) this.settleRun(this.activeRunId, 'failed', Date.now(), 'SDK worker is unavailable');
    this.resetEpoch();
    this.runtimeStatus = 'unavailable'; this.activeRunId = null;
    this.approvals.clear(); this.questions.clear();
  }

  close(): void { if (this.closed) return; this.resetEpoch(); this.closed = true; }

  private resetEpoch(): void {
    const invalidated: StreamInvalidated = { type: 'stream.invalidated', sessionId: this.identity.sessionId, epoch: this.epoch, reason: 'EPOCH_CHANGED' };
    for (const listener of this.listeners) listener(invalidated);
    this.listeners.clear(); this.epoch = randomUUID(); this.head = 0n;
    this.events.fill(undefined); this.eventCount = 0; this.eventStart = 0;
  }

  private readonly systemByTurn = new Map<string, Message[]>();
  private systemMessages(turnId: string): readonly Message[] { return this.systemByTurn.get(turnId) ?? []; }

  private rebuildIndexes(): void {
    this.turnById.clear(); this.messageById.clear(); this.partById.clear(); this.toolPartByCall.clear(); this.systemByTurn.clear();
    for (const turn of this.turns) this.turnById.set(turn.turnId, turn);
    for (const message of this.messages) {
      this.messageById.set(message.messageId, message);
      if (message.role === 'system') this.addSystem(message);
      message.parts.forEach((part, index) => {
        this.partById.set(part.partId, { message, index });
        if (part.type === 'tool_call') this.toolPartByCall.set(part.toolCallId, part);
      });
    }
  }

  private addSystem(message: Message): void {
    const messages = this.systemByTurn.get(message.turnId);
    if (messages) messages.push(message); else this.systemByTurn.set(message.turnId, [message]);
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
        this.runs.set(event.runId, { runId: event.runId, sessionId: this.identity.sessionId, status: 'running', createdAt: event.createdAt });
        this.activeRunId = event.runId; this.runtimeStatus = 'running'; return;
      case 'run.completed': case 'run.cancelled': case 'run.failed':
        this.settleRun(event.runId, event.type === 'run.completed' ? 'completed' : event.type === 'run.cancelled' ? 'cancelled' : 'failed', event.finishedAt, event.type === 'run.failed' ? event.error : undefined); return;
      case 'session.status': this.runtimeStatus = event.runtimeStatus; this.activeRunId = event.activeRunId; return;
      case 'turn.started': {
        const turn: Turn = { turnId: event.turnId, sessionId: this.identity.sessionId, runId: event.runId, userMessageId: event.userMessageId,
          status: 'running', startedAt: event.timestamp, assistantMessageIds: [],
        };
        this.turns.push(turn); this.turnById.set(turn.turnId, turn); return;
      }
      case 'turn.completed': {
        const turn = this.turnById.get(event.turnId);
        if (turn) { turn.status = 'completed'; turn.finishedAt = event.timestamp; } return;
      }
      case 'message.created': {
        const message: Message = { messageId: event.messageId, sessionId: this.identity.sessionId, turnId: event.turnId, role: event.role, createdAt: event.timestamp, parts: [] };
        this.messages.push(message); this.messageById.set(message.messageId, message);
        const turn = this.turnById.get(message.turnId);
        if (turn && message.role === 'assistant') turn.assistantMessageIds.push(message.messageId);
        if (message.role === 'system') this.addSystem(message);
        this.branch.leafMessageId = message.messageId;
        this.branch.branchVersion = (BigInt(this.branch.branchVersion) + 1n).toString();
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
      case 'part.completed': {
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
