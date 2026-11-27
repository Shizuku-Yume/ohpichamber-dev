import { z } from 'zod';
import {
  EntityIdSchema,
  HistoryPageSchema,
  SessionSchema,
  SessionSnapshotSchema,
  type CanonicalEvent,
  type HistoryPage,
  type Message,
  type ProblemCode,
  type Session,
  type SessionSnapshot,
} from '@openchamber/agent-contract';
import { parseCanonicalEvent } from '../event-stream/validated-event.js';
import type { JsonValue } from '../shared/json-values.js';
import type { MessageSearchStore, StagedMessageRow } from './store.js';

const LIVE_DEBOUNCE_MS = 1500;

const joinParts = (message: Message, type: 'text' | 'reasoning'): string => {
  const chunks: string[] = [];
  for (const part of message.parts) {
    if ((type === 'text' && part.type === 'text') || (type === 'reasoning' && part.type === 'reasoning')) {
      const trimmed = part.content.trim();
      if (trimmed) chunks.push(trimmed);
    }
  }
  return chunks.join('\n\n');
};

const stripTerminalContext = (text: string): string =>
  text.replace(/\n*<terminal_context>\n[\s\S]*?\n<\/terminal_context>\s*$/, '');

export interface IndexerSessionScope {
  sessionId?: string;
  rootSessionId?: string;
  projectId?: string;
  workspaceId: string;
  cwd: string;
}

export interface IndexerSessionService {
  open: (sessionId: string) => Promise<SessionSnapshot>;
  history: (sessionId: string, query?: string) => Promise<HistoryPage>;
  list: () => Promise<{ items: Session[] | JsonValue[]; errors: Record<string, ProblemCode | string> }>;
}

export interface MessageSearchIndexerOptions {
  store: MessageSearchStore;
  sessionService: IndexerSessionService;
  resolveSessionScope: (sessionId: string) => Promise<IndexerSessionScope | null>;
  pageSize?: number;
  liveDebounceMs?: number;
  backfillPauseMs?: number;
  includeReasoning?: () => boolean;
  logger?: Pick<Console, 'warn'>;
}

export interface IndexerBackfillState {
  state: 'idle' | 'running' | 'done' | 'failed';
  total: number;
  done: number;
}

export interface IndexerStatus {
  backfill: IndexerBackfillState & { queued: number };
  sessions: number;
  messages: number;
}

export interface MessageSearchIndexer {
  processCanonicalEvent: (input: CanonicalEvent | JsonValue | undefined, scope?: IndexerSessionScope | null) => Promise<void>;
  onConnected: (sessionId?: string) => Promise<void> | undefined;
  status: () => IndexerStatus;
  idle: () => Promise<void>;
  syncSession: (sessionId: string) => Promise<void>;
  stop: () => void;
}

export const createMessageSearchIndexer = ({
  store,
  sessionService,
  resolveSessionScope,
  pageSize = 100,
  liveDebounceMs = LIVE_DEBOUNCE_MS,
  backfillPauseMs = 25,
  includeReasoning = () => false,
  logger = console,
}: MessageSearchIndexerOptions): MessageSearchIndexer => {
  const liveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const liveQueue = new Set<string>();
  const backfillQueue = new Set<string>();
  const revisions = new Map<string, number>();
  let draining: Promise<void> | null = null;
  let listing: Promise<void> | null = null;
  let baseline: Set<string> | null = null;
  let backfill: IndexerBackfillState = { state: 'idle', total: 0, done: 0 };
  let stopped = false;
  const revision = (id: string): number => revisions.get(id) ?? 0;

  const syncSession = async (sessionId: string): Promise<void> => {
    const before = revision(sessionId);
    const scope = await resolveSessionScope(sessionId);
    if (!scope) throw new Error('Host session scope is unavailable');
    const snapshot = SessionSnapshotSchema.parse(await sessionService.open(sessionId));
    const session = snapshot.session;
    if (session.sessionId !== sessionId || session.workspaceId !== scope.workspaceId || session.rootSessionId !== scope.rootSessionId) {
      throw new Error('Host session scope mismatch');
    }
    if (session.parentSessionId) { store.deleteSession(sessionId); return; }
    store.beginSessionSync();
    let cursor: string | null = null;
    let branchKey: string | undefined;
    do {
      const query = new URLSearchParams({ limit: String(pageSize) });
      if (cursor) query.set('cursor', cursor);
      const page = HistoryPageSchema.parse(await sessionService.history(sessionId, query.toString()));
      if (page.sessionId !== sessionId) throw new Error('Canonical history scope mismatch');
      const selectedBranch = JSON.stringify(page.branch);
      if (branchKey && selectedBranch !== branchKey) throw new Error('Canonical history selection changed');
      branchKey = selectedBranch;
      const settled = new Set(page.turns.filter((turn) => ['completed', 'failed', 'cancelled'].includes(turn.status)).map((turn) => turn.turnId));
      const rows: StagedMessageRow[] = [];
      for (const message of page.messages) {
        if (message.role === 'system' || (message.role === 'assistant' && !settled.has(message.turnId))) continue;
        const text = message.role === 'user' ? stripTerminalContext(joinParts(message, 'text')).trim() : joinParts(message, 'text');
        if (text) rows.push({ id: message.messageId, sessionId, role: message.role, createdAt: message.createdAt, text });
        const reasoning = message.role === 'assistant' && includeReasoning() ? joinParts(message, 'reasoning') : '';
        if (reasoning) {
          rows.push({
            id: `${message.messageId}:reasoning`,
            messageId: message.messageId,
            sessionId,
            role: 'reasoning',
            createdAt: message.createdAt,
            text: reasoning,
          });
        }
      }
      store.stageMessages(rows);
      if (stopped || revision(sessionId) !== before) return;
      cursor = page.nextCursor;
    } while (cursor);
    const currentScope = await resolveSessionScope(sessionId);
    if (!currentScope || stopped || revision(sessionId) !== before || currentScope.workspaceId !== scope.workspaceId || currentScope.cwd !== scope.cwd) return;
    store.commitSessionSync({
      id: sessionId,
      directory: scope.cwd,
      title: session.title ?? '',
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      includeReasoning: includeReasoning(),
    });
  };

  const takeNext = (): { id: string; fromBackfill: boolean } | null => {
    for (const queue of [liveQueue, backfillQueue]) {
      const id = queue.values().next().value;
      if (!id) continue;
      queue.delete(id); backfillQueue.delete(id);
      return { id, fromBackfill: queue === backfillQueue };
    }
    return null;
  };

  const drain = (): Promise<void> | null => {
    if (draining || stopped) return draining;
    draining = (async () => {
      for (let job = takeNext(); job && !stopped; job = takeNext()) {
        try { await syncSession(job.id); }
        catch { logger.warn?.('[message-search] canonical session indexing failed'); }
        if (job.fromBackfill) {
          backfill.done += 1;
          if (backfillPauseMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, backfillPauseMs));
        }
      }
      if (backfill.state === 'running' && backfillQueue.size === 0) backfill.state = 'done';
    })().finally(() => { draining = null; if (!stopped && (liveQueue.size || backfillQueue.size)) void drain(); });
    return draining;
  };

  const queueLive = (id: string): void => {
    if (stopped) return;
    clearTimeout(liveTimers.get(id));
    liveTimers.set(id, setTimeout(() => { liveTimers.delete(id); liveQueue.add(id); void drain(); }, liveDebounceMs));
  };

  const removeSession = (id: string): void => {
    revisions.set(id, revision(id) + 1);
    clearTimeout(liveTimers.get(id)); liveTimers.delete(id); liveQueue.delete(id); backfillQueue.delete(id);
    store.deleteSession(id);
  };

  const startBackfill = (): Promise<void> | null => {
    if (listing || stopped) return listing;
    listing = (async () => {
      const capturedRevisions = new Map(revisions);
      const result = await sessionService.list();
      const items = SessionSchema.array().parse(result.items);
      const failedIds = new Set(EntityIdSchema.array().parse(Object.keys(result.errors)));
      if (stopped) return;
      const listed = new Map(items.filter((session) => !session.parentSessionId
        && revision(session.sessionId) === (capturedRevisions.get(session.sessionId) ?? 0)).map((session) => [session.sessionId, session]));
      if (baseline) {
        for (const id of baseline) {
          if (!listed.has(id) && !failedIds.has(id) && revision(id) === (capturedRevisions.get(id) ?? 0)) {
            removeSession(id);
          }
        }
      }
      baseline = new Set([...listed.keys(), ...failedIds]);
      let queued = 0;
      for (const session of listed.values()) {
        const known = store.readSession(session.sessionId);
        const syncedUpdatedAt = z.number().safeParse(known?.synced_updated_at);
        if (syncedUpdatedAt.success && syncedUpdatedAt.data >= session.updatedAt) continue;
        backfillQueue.add(session.sessionId); queued += 1;
      }
      backfill = { state: queued ? 'running' : 'done', total: queued, done: 0 };
      void drain();
    })().catch(() => { backfill.state = 'failed'; logger.warn?.('[message-search] canonical session listing failed'); })
      .finally(() => { listing = null; });
    return listing;
  };

  return {
    async processCanonicalEvent(input, scope) {
      if (stopped) return;
      const event = parseCanonicalEvent(input);
      if (!scope?.workspaceId) throw new Error('Host event scope is required');
      if (event.type === 'session.deleted') { for (const id of event.deletedSessionIds) removeSession(id); return; }
      if (event.type === 'session.updated') {
        revisions.set(event.sessionId, revision(event.sessionId) + 1);
        if (event.title !== undefined) store.renameSession(event.sessionId, event.title);
        queueLive(event.sessionId); return;
      }
      if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled' || event.type === 'turn.completed') {
        revisions.set(event.sessionId, revision(event.sessionId) + 1); queueLive(event.sessionId);
      }
    },
    onConnected(sessionId) {
      if (sessionId) queueLive(sessionId);
      else return startBackfill() ?? undefined;
    },
    status: () => ({ backfill: { ...backfill, queued: backfillQueue.size }, ...store.counts() }),
    async idle() { await listing; await draining; },
    syncSession,
    stop() { stopped = true; for (const timer of liveTimers.values()) clearTimeout(timer); liveTimers.clear(); liveQueue.clear(); backfillQueue.clear(); },
  };
};
