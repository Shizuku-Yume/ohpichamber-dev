import path from 'node:path';
import fsPromises from 'node:fs/promises';

import { createMessageSearchIndexer } from './indexer.js';
import type { IndexerClient, IndexerOptions } from './indexer.js';
import { loadSqliteOpener } from './sqlite.js';
import type { SqliteOpener } from './sqlite.js';
import { buildSnippet, openMessageSearchStore, toMatchExpression, toSearchTerms } from './store.js';
import type { GlobalMessageStreamHub } from '../event-stream/global-hub.js';
import type { SearchOptions, SessionSearchOptions } from './contracts.js';

const INDEX_FILE = 'message-search.sqlite';
const REASONING_META_KEY = 'reasoning';
const INDEX_FILE_SUFFIXES = ['', '-wal', '-shm'];
const MAX_LIMIT = 200;


interface MessageSearchRuntimeOptions extends Pick<IndexerOptions, 'getArchivedSessions' | 'applyOwnedArchiveState' | 'logger'> {
  dataDir: string;
  buildOpenCodeUrl: (path: string, prefixOverride: string) => string;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  globalEventHub: Pick<GlobalMessageStreamHub, 'subscribeEvent' | 'subscribeStatus'> & Partial<Pick<GlobalMessageStreamHub, 'isConnected'>>;
  readSettings: () => Promise<{ enabled: boolean; reasoning: boolean }>;
}

const hasMessage = (error: unknown): error is { message: unknown } =>
  error != null && 'message' in Object(error);

export const createMessageSearchRuntime = ({
  dataDir,
  sessionService,
  resolveSessionScope,
  globalEventHub,
  getArchivedSessions = async () => null,
  applyOwnedArchiveState = (session) => session,
  readSettings,
  logger = console,
}: MessageSearchRuntimeOptions) => {
  const indexPath = path.join(dataDir, INDEX_FILE);
  const open = loadSqliteOpener();
  let enabled = false;
  let reasoning = false;
  let engine: ReturnType<typeof startEngine> | null = null;
  let failed = false;
  let transition = Promise.resolve();
  const enqueue = (work: () => Promise<void>) => {
    const run = transition.then(work);
    transition = run.catch((error) => {
      logger.warn?.('[message-search]', (hasMessage(error) ? error.message : undefined) ?? error);
    });
    return run;
  };


  const reconcileReasoning = (store: ReturnType<typeof openMessageSearchStore>) => {
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

  const startEngine = (open: SqliteOpener) => {
    const store = openMessageSearchStore(open(indexPath));
    reconcileReasoning(store);
    const indexer = createMessageSearchIndexer({ store, sessionService, resolveSessionScope, includeReasoning: () => reasoning, logger });
    const unsubscribeEvents = globalEventHub.subscribeEvent((event, scope) => indexer.processCanonicalEvent(event, scope));
    const unsubscribeStatus = globalEventHub.subscribeStatus((status) => {
      if (status.type === 'connect') return indexer.onConnected(status.sessionId);
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

  const apply = async () => {
    if (enabled && !engine && open) {
      try {
        engine = startEngine(open);
        failed = false;
      } catch (error) {
        failed = true;
        logger.warn?.('[message-search] index unavailable:', (hasMessage(error) ? error.message : undefined) ?? error);
      }
    } else if (!enabled && engine) {
      const running = engine;
      engine = null;
      await running.stop();
    }
  };

  const indexSize = async () => {
    let bytes = 0;
    for (const suffix of INDEX_FILE_SUFFIXES) {
      const stat = await fsPromises.stat(`${indexPath}${suffix}`).catch(() => null);
      if (stat) bytes += stat.size;
    }
    return bytes;
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

    search: ({ query, sessionId, directories, role, includeReasoning, lifecycle = 'all', before, limit, order }: SearchOptions) => {
      if (!engine) return null;
      const match = toMatchExpression(query);
      if (!match) return { status: 'query-too-short' as const, hits: [] };
      const size = Math.min(Math.max(1, limit), MAX_LIMIT);
      const hits = engine.store.search({
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
      const terms = toSearchTerms(query);
      const page = hits.slice(0, size);
      const last = page[page.length - 1];
      return {
        status: 'ok' as const,
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
      };
    },

    searchSessions: ({ query, directories, role, includeReasoning, lifecycle = 'all', before, limit, exclude = [] }: SessionSearchOptions) => {
      if (!engine) return null;
      const match = toMatchExpression(query);
      if (!match) return { status: 'query-too-short' as const, hits: [] };
      const size = Math.min(Math.max(1, limit), 100);
      const result = engine.store.searchSessions({ match, directories, role, includeReasoning: reasoning && includeReasoning !== false, lifecycle, before, limit: size + 1, exclude, withTotals: !before });
      const terms = toSearchTerms(query);
      const page = result.hits.slice(0, size);
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
        next: result.hits.length > size && last ? { createdAt: last.createdAt, sessionId: last.sessionId } : null,
        totals: result.totals,
        index: engine.indexer.status(),
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
