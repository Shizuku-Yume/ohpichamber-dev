import { afterEach, describe, expect, it } from 'vitest';
import { loadSqliteOpener } from './sqlite.js';
import { openMessageSearchStore, toMatchExpression } from './store.js';
import { createMessageSearchIndexer } from './indexer.js';
import { deferred, event, history, message, runtimeSession, scope, snapshot, turn } from '../event-stream/canonical-test-fixtures.js';

const cleanups = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
const fixture = ({ records = [message()], turns = [turn()], includeReasoning = () => false } = {}) => {
  const store = openMessageSearchStore(loadSqliteOpener()(':memory:'));
  const service = {
    open: async () => snapshot(records, turns, { title: 'Host title' }), history: async () => history(records, turns),
    list: async () => ({ items: [{ ...runtimeSession(), metadata: null, metadataRevision: '0', archiveRevision: '0' }], errors: {} }),
  };
  const indexer = createMessageSearchIndexer({ store, sessionService: service, resolveSessionScope: async () => scope,
    includeReasoning, liveDebounceMs: 0, backfillPauseMs: 0, logger: { warn() {} } });
  cleanups.push(() => { indexer.stop(); store.close(); });
  const search = (query, options = {}) => store.search({ match: toMatchExpression(query), limit: 100, ...options });
  return { indexer, store, service, search };
};

describe('canonical search indexing', () => {
  it('indexes settled user/reply/reasoning text without tools, system context or active assistant text', async () => {
    const records = [
      message({ messageId: 'user', role: 'user', createdAt: 1, parts: [{ type: 'text', partId: 'u', content: 'User needle\n<terminal_context>\nnotindexed\n</terminal_context>' }] }),
      message({ parts: [{ type: 'reasoning', partId: 'r', content: 'Reasoning needle' }, { type: 'text', partId: 't', content: 'Reply needle' },
        { type: 'tool_result', partId: 'tool', toolCallId: 'call', toolName: 'bash', output: 'notindexed', isError: false }] }),
      message({ messageId: 'system', role: 'system', parts: [{ type: 'text', partId: 'sys', content: 'notindexed' }] }),
      message({ messageId: 'active', turnId: 'active-turn', parts: [{ type: 'text', partId: 'a', content: 'notindexed' }] }),
    ];
    const f = fixture({ records, turns: [turn(), turn({ turnId: 'active-turn', status: 'running', finishedAt: undefined })], includeReasoning: () => true });
    // Running turns have no terminal finishedAt member on the wire.
    f.service.history = async () => history(records, [turn(), { ...turn({ turnId: 'active-turn', status: 'running' }), finishedAt: undefined }]);
    await f.indexer.syncSession('session');
    expect(f.search('needle').map((row) => row.role).sort()).toEqual(['assistant', 'reasoning', 'user']);
    expect(f.search('notindexed')).toEqual([]);
    expect(f.search('needle')[0].sessionTitle).toBe('Host title');
    expect(f.search('needle')[0].directory).toBe(scope.cwd);
  });

  it('does not publish staged rows or erase prior results when a later history page fails', async () => {
    const f = fixture(); await f.indexer.syncSession('session');
    const prior = f.search('searchable');
    f.service.history = async (_id, query) => {
      if (new URLSearchParams(query).has('cursor')) throw new Error('service unavailable');
      return history([message({ parts: [{ type: 'text', partId: 't', content: 'replacement' }] })], [turn()], { nextCursor: 'next' });
    };
    await expect(f.indexer.syncSession('session')).rejects.toThrow('unavailable');
    expect(f.search('searchable')).toEqual(prior); expect(f.search('replacement')).toEqual([]);
  });

  it('replaces changed branches only after a complete selection and supports successful empty history', async () => {
    const f = fixture(); await f.indexer.syncSession('session');
    f.service.history = async () => history([message({ messageId: 'new', parts: [{ type: 'text', partId: 't', content: 'New branch answer' }] })]);
    await f.indexer.syncSession('session');
    expect(f.search('searchable')).toEqual([]); expect(f.search('branch')).toHaveLength(1);
    f.service.history = async () => history([], []);
    await f.indexer.syncSession('session'); expect(f.store.counts().messages).toBe(0);
  });

  it('cannot resurrect a session deleted while history is in flight', async () => {
    const f = fixture(); await f.indexer.syncSession('session'); const gate = deferred();
    f.service.history = () => gate.promise;
    const sync = f.indexer.syncSession('session');
    await Promise.resolve(); await Promise.resolve();
    await f.indexer.processCanonicalEvent(event(1, { type: 'session.deleted', partId: undefined, delta: undefined, deletedSessionIds: ['session'] }), scope);
    gate.resolve(history()); await sync;
    expect(f.store.counts()).toEqual({ sessions: 0, messages: 0 });
  });

  it('establishes an authoritative baseline and preserves failed scopes during later enumeration', async () => {
    const f = fixture(); await f.indexer.onConnected(); await f.indexer.idle();
    expect(f.search('searchable')).toHaveLength(1);
    f.service.list = async () => ({ items: [], errors: { session: 'SERVICE_UNAVAILABLE' } });
    await f.indexer.onConnected(); await f.indexer.idle(); expect(f.search('searchable')).toHaveLength(1);
    f.service.list = async () => { throw new Error('unavailable'); };
    await f.indexer.onConnected(); expect(f.search('searchable')).toHaveLength(1);
    f.service.list = async () => ({ items: [], errors: {} });
    await f.indexer.onConnected(); await f.indexer.idle(); expect(f.search('searchable')).toEqual([]);
  });
});
