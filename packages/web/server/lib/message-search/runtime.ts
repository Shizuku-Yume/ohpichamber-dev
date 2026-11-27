import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { z } from 'zod';
import type { CanonicalEvent } from '@openchamber/agent-contract';

import { createMessageSearchIndexer } from './indexer.js';
import type { IndexerSessionScope, IndexerSessionService, IndexerStatus, MessageSearchIndexer } from './indexer.js';
import { loadSqliteOpener } from './sqlite.js';
import type { SqliteOpener } from './sqlite.js';
import { buildSnippet, openMessageSearchStore, toMatchExpression, toSearchTerms } from './store.js';
import type { ArchiveSnapshot, MessageSearchStore, SessionSearchTotals } from './store.js';
import type { MessageCursor, SearchOptions, SessionCursor, SessionSearchOptions } from './contracts.js';
import { controlErrorFields } from '../openchamber-control/error.js';
import { isString } from '../shared/guards.js';

const INDEX_FILE = 'message-search.sqlite';
const REASONING_META_KEY = 'reasoning';
const INDEX_FILE_SUFFIXES = ['', '-wal', '-shm'];
const MAX_LIMIT = 200;

const StoreSearchHitSchema = z.object({
  rowId: z.string(),
  id: z.string(),
  sessionId: z.string(),
  role: z.enum(['user', 'assistant', 'reasoning']),
  createdAt: z.number(),
  sessionTitle: z.string(),
  directory: z.string(),
  archivedAt: z.number().nullable(),
  text: z.string(),
});

const StoreSessionSearchHitSchema = z.object({
  sessionId: z.string(),
  sessionTitle: z.string(),
  directory: z.string(),
  archivedAt: z.number().nullable(),
  messageId: z.string(),
  role: z.enum(['user', 'assistant', 'reasoning']),
  createdAt: z.number(),
  text: z.string(),
  matchCount: z.number(),
});

export interface MessageSearchEventHub {
  subscribeEvent: (listener: (event: CanonicalEvent, scope?: IndexerSessionScope) => void | Promise<void>) => () => void;
  subscribeStatus: (listener: (status: { type: string; sessionId?: string }) => void) => () => void;
  isConnected?: () => boolean;
}

export interface MessageSearchRuntimeOptions {
  dataDir: string;
  sessionService: IndexerSessionService;
  resolveSessionScope: (sessionId: string) => Promise<IndexerSessionScope | null>;
  readArchiveStates: () => Promise<ArchiveSnapshot>;
  logger?: Pick<Console, 'warn'>;
  globalEventHub: MessageSearchEventHub;
  readSettings: () => Promise<{ enabled: boolean; reasoning: boolean }>;
}

export interface MessageSearchHit {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'reasoning';
  createdAt: number;
  sessionTitle: string;
  directory: string;
  archived: boolean;
  snippet: string;
}

export interface SessionSearchHit {
  sessionId: string;
  sessionTitle: string;
  directory: string;
  archived: boolean;
  messageId: string;
  role: 'user' | 'assistant' | 'reasoning';
  createdAt: number;
  snippet: string;
  matchCount: number;
}

export type MessageSearchResult =
  | { status: 'query-too-short'; hits: [] }
  | {
    status: 'ok';
    hits: MessageSearchHit[];
    next: MessageCursor | null;
    index: IndexerStatus;
    errors: Record<string, string>;
    archiveError: string | null;
  };

export type SessionSearchResult =
  | { status: 'query-too-short'; hits: [] }
  | {
    status: 'ok';
    hits: SessionSearchHit[];
    next: SessionCursor | null;
    totals: SessionSearchTotals | null;
    index: IndexerStatus;
    errors: Record<string, string>;
    archiveError: string | null;
  };

export interface MessageSearchStatus {
  state: 'unsupported' | 'on' | 'off' | 'failed';
  sizeBytes: number;
  index: IndexerStatus | null;
}

export interface MessageSearchRuntime {
  supported: boolean;
  setEnabled: (next: boolean) => Promise<void>;
  setReasoningEnabled: (next: boolean) => Promise<void>;
  deleteIndex: () => Promise<void>;
  search: (options: SearchOptions) => Promise<MessageSearchResult | null>;
  searchSessions: (options: SessionSearchOptions) => Promise<SessionSearchResult | null>;
  status: () => Promise<MessageSearchStatus>;
  stop: () => Promise<void>;
}

interface RunningEngine {
  store: MessageSearchStore;
  indexer: MessageSearchIndexer;
  stop: () => Promise<void>;
}

const errorMessageOf = (cause: Parameters<typeof controlErrorFields>[0]): string | undefined => {
  const message = controlErrorFields(cause)?.message;
  return isString(message) ? message : undefined;
};

export const createMessageSearchRuntime = ({
  dataDir,
  sessionService,
  resolveSessionScope,
  globalEventHub,
  readArchiveStates,
  readSettings,
  logger = console,
}: MessageSearchRuntimeOptions): MessageSearchRuntime => {
  const indexPath = path.join(dataDir, INDEX_FILE);
  const open = loadSqliteOpener();
  let enabled = false;
  let reasoning = false;
  let engine: RunningEngine | null = null;
  let failed = false;
  let transition: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>): Promise<void> => {
    const run = transition.then(work);
    transition = run.catch((error) => {
      logger.warn?.('[message-search]', errorMessageOf(error) ?? error);
    });
    return run;
  };

  const reconcileReasoning = (store: MessageSearchStore): boolean => {
    const indexed = store.readMeta(REASONING_META_KEY) === '1';
    if (reasoning && !indexed) {
      store.rereadAssistantRecords();
      store.writeMeta(REASONING_META_KEY, '1');
      return true;
    }
    if (!reasoning) {
      store.deleteRole('reasoning');
      store.writeMeta(REASONING_META_KEY, '0');
    }
    return false;
  };

  const startEngine = (openDb: SqliteOpener): RunningEngine => {
    const store = openMessageSearchStore(openDb(indexPath));
    reconcileReasoning(store);
    const indexer = createMessageSearchIndexer({ store, sessionService, resolveSessionScope, includeReasoning: () => reasoning, logger });
    const unsubscribeEvents = globalEventHub.subscribeEvent((event, scope) => indexer.processCanonicalEvent(event, scope));
    const unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
      if (status.type === 'connect') return indexer.onConnected(status.sessionId);
      return undefined;
    });
    void indexer.onConnected();
    return {
      store,
      indexer,
      stop: async () => {
        unsubscribeEvents?.();
        unsubscribeStatus?.();
        indexer.stop();
        await indexer.idle();
        store.close();
      },
    };
  };

  const apply = async (): Promise<void> => {
    if (enabled && !engine && open) {
      try {
        engine = startEngine(open);
        failed = false;
      } catch (error) {
        failed = true;
        logger.warn?.('[message-search] index unavailable:', errorMessageOf(error) ?? error);
      }
    } else if (!enabled && engine) {
      const running = engine;
      engine = null;
      await running.stop();
    }
  };

  const indexSize = async (): Promise<number> => {
    let bytes = 0;
    for (const suffix of INDEX_FILE_SUFFIXES) {
      const stat = await fsPromises.stat(`${indexPath}${suffix}`).catch(() => null);
      if (stat) bytes += stat.size;
    }
    return bytes;
  };

  const refreshArchiveStates = async (active: RunningEngine): Promise<ArchiveSnapshot | null> => {
    const snapshot = await readArchiveStates();
    if (active !== engine) return null;
    active.store.applyArchiveSnapshot(snapshot);
    return snapshot;
  };

  if (open) {
    void enqueue(async () => {
      const settings = await readSettings();
      enabled = settings.enabled === true;
      reasoning = settings.reasoning === true;
      await apply();
    });
  }

  return {
    supported: Boolean(open),

    setEnabled: (next: boolean) => enqueue(async () => {
      enabled = next === true;
      await apply();
    }),

    setReasoningEnabled: (next: boolean) => enqueue(async () => {
      reasoning = next === true;
      if (engine && reconcileReasoning(engine.store) && globalEventHub.isConnected?.()) engine.indexer.onConnected();
    }),

    deleteIndex: () => enqueue(async () => {
      if (engine) {
        const running = engine;
        engine = null;
        await running.stop();
      }
      for (const suffix of INDEX_FILE_SUFFIXES) {
        await fsPromises.rm(`${indexPath}${suffix}`, { force: true });
      }
      await apply();
    }),

    search: async ({ query, sessionId, directories, role, includeReasoning, lifecycle = 'all', before, limit, order }: SearchOptions) => {
      if (!engine) return null;
      const active = engine;
      const match = toMatchExpression(query);
      if (!match) return { status: 'query-too-short', hits: [] };
      const archive = await refreshArchiveStates(active);
      if (!archive) return null;
      const size = Math.min(Math.max(1, limit), MAX_LIMIT);
      const rawHits = active.store.search({
        match,
        sessionId,
        directories,
        role,
        includeReasoning: reasoning && includeReasoning !== false,
        lifecycle,
        before,
        limit: size + 1,
        order,
      });
      const hits = rawHits.map((row) => StoreSearchHitSchema.parse(row));
      const terms = toSearchTerms(query);
      const page = hits.slice(0, size);
      const last = page[page.length - 1];
      return {
        status: 'ok',
        hits: page.map((hit) => ({
          id: hit.id,
          sessionId: hit.sessionId,
          role: hit.role,
          createdAt: hit.createdAt,
          sessionTitle: hit.sessionTitle,
          directory: hit.directory,
          archived: hit.archivedAt !== null,
          snippet: buildSnippet(hit.text, terms),
        })),
        next: hits.length > size && last ? { createdAt: last.createdAt, id: last.rowId } : null,
        index: engine.indexer.status(),
        errors: archive.errors,
        archiveError: archive.conversion?.code ?? null,
      };
    },

    searchSessions: async ({ query, directories, role, includeReasoning, lifecycle = 'all', before, limit, exclude = [] }: SessionSearchOptions) => {
      if (!engine) return null;
      const active = engine;
      const match = toMatchExpression(query);
      if (!match) return { status: 'query-too-short', hits: [] };
      const archive = await refreshArchiveStates(active);
      if (!archive) return null;
      const size = Math.min(Math.max(1, limit), 100);
      const result = active.store.searchSessions({ match, directories, role, includeReasoning: reasoning && includeReasoning !== false, lifecycle, before, limit: size + 1, exclude, withTotals: !before });
      const parsedHits = result.hits.map((row) => StoreSessionSearchHitSchema.parse(row));
      const terms = toSearchTerms(query);
      const page = parsedHits.slice(0, size);
      const last = page.at(-1);
      return {
        status: 'ok',
        hits: page.map((hit) => ({
          sessionId: hit.sessionId,
          sessionTitle: hit.sessionTitle,
          directory: hit.directory,
          archived: hit.archivedAt !== null,
          messageId: hit.messageId,
          role: hit.role,
          createdAt: hit.createdAt,
          snippet: buildSnippet(hit.text, terms),
          matchCount: hit.matchCount,
        })),
        next: parsedHits.length > size && last ? { createdAt: last.createdAt, sessionId: last.sessionId } : null,
        totals: Object.keys(archive.errors).length > 0 || archive.conversion?.code ? null : result.totals,
        index: engine.indexer.status(),
        errors: archive.errors,
        archiveError: archive.conversion?.code ?? null,
      };
    },

    status: async () => {
      if (!open) return { state: 'unsupported', sizeBytes: 0, index: null };
      await transition;
      const sizeBytes = await indexSize();
      if (engine) return { state: 'on', sizeBytes, index: engine.indexer.status() };
      return { state: enabled && failed ? 'failed' : 'off', sizeBytes, index: null };
    },

    stop: () => enqueue(async () => {
      enabled = false;
      await apply();
    }),
  };
};
