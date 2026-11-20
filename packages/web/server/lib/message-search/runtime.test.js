import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { history, message, runtimeSession, scope, snapshot, turn } from '../event-stream/canonical-test-fixtures.js';

import { createMessageSearchRuntime } from './runtime.js';

// Subscriber lifetime is exercised independently of private stream transport.
const createHub = () => {
  const listeners = { event: 0, status: 0 };
  return {
    listeners,
    subscribeEvent: () => {
      listeners.event += 1;
      return () => { listeners.event -= 1; };
    },
    subscribeStatus: () => {
      listeners.status += 1;
      return () => { listeners.status -= 1; };
    },
    isConnected: () => false,
  };
};

describe('message search runtime', () => {
  let dataDir;
  let hub;
  const indexFile = () => path.join(dataDir, 'message-search.sqlite');
  const create = (enabled, reasoning = false, overrides = {}) => createMessageSearchRuntime({
    dataDir,
    sessionService: { list: async () => ({ items: [], errors: {} }), open: async () => { throw new Error('No session'); }, history: async () => { throw new Error('No session'); } },
    resolveSessionScope: async () => { throw new Error('No session'); },
    readSessionMetadata: async () => null,
    readArchiveStates: async () => ({ entries: {}, errors: {} }),
    globalEventHub: hub,
    readSettings: async () => ({ enabled, reasoning }),
    logger: { warn: () => {} },
    ...overrides,
  });
  const createIndexed = async (readArchiveStates) => {
    const messages = (id) => [message({ messageId: `answer-${id}`, sessionId: id, turnId: `turn-${id}` })];
    const turns = (id) => [turn({ turnId: `turn-${id}`, sessionId: id, assistantMessageIds: [`answer-${id}`] })];
    const session = (id) => ({ sessionId: id, rootSessionId: id });
    const runtime = create(true, false, {
      readArchiveStates,
      resolveSessionScope: async (id) => ({ ...scope, rootSessionId: id }),
      sessionService: {
        list: async () => ({ items: ['a', 'b'].map((id) => ({ ...runtimeSession(session(id)), metadata: null, metadataRevision: '0', archiveRevision: '0' })), errors: {} }),
        open: async (id) => snapshot(messages(id), turns(id), session(id)),
        history: async (id) => history(messages(id), turns(id), { sessionId: id }),
      },
    });
    await vi.waitFor(async () => expect((await runtime.status()).index.backfill.done).toBe(2));
    return runtime;
  };

  it('uses current Host archive metadata for grouped and per-message search', async () => {
    let archive = { entries: {}, errors: {} };
    const runtime = await createIndexed(async () => archive);
    try {
      expect((await runtime.searchSessions({ query: 'searchable', lifecycle: 'active', directories: [scope.cwd], limit: 10 })).hits).toHaveLength(2);
      archive = { entries: { a: { archivedAt: 123 } }, errors: {} };
      expect((await runtime.searchSessions({ query: 'searchable', lifecycle: 'active', limit: 10 })).hits.map((hit) => hit.sessionId)).toEqual(['b']);
      expect((await runtime.search({ query: 'searchable', lifecycle: 'archived', limit: 10 })).hits.map((hit) => hit.sessionId)).toEqual(['a']);
    } finally { await runtime.stop(); }
  });

  it('isolates corrupt archive records without claiming complete totals', async () => {
    const runtime = await createIndexed(async () => ({ entries: {}, errors: { a: 'METADATA_CORRUPT' } }));
    try {
      const result = await runtime.searchSessions({ query: 'searchable', lifecycle: 'active', limit: 10 });
      expect(result.hits.map((hit) => hit.sessionId)).toEqual(['b']);
      expect(result.errors).toEqual({ a: 'METADATA_CORRUPT' });
      expect(result.totals).toBeNull();
    } finally { await runtime.stop(); }
  });

  it('propagates archive-read failures instead of presenting an empty search', async () => {
    let failed = true;
    const runtime = await createIndexed(async () => {
      if (failed) throw new Error('Archive unavailable');
      return { entries: {}, errors: {} };
    });
    try {
      await expect(runtime.searchSessions({ query: 'searchable', limit: 10 })).rejects.toThrow('Archive unavailable');
      failed = false;
      expect((await runtime.searchSessions({ query: 'searchable', lifecycle: 'active', limit: 10 })).hits).toHaveLength(2);
    } finally { await runtime.stop(); }
  });

  it('keeps complete entities searchable during incomplete archive conversion', async () => {
    const runtime = await createIndexed(async () => ({ entries: { b: { archivedAt: null } }, errors: {}, conversion: { code: 'LEGACY_ARCHIVE_CORRUPT' } }));
    try {
      const result = await runtime.searchSessions({ query: 'searchable', lifecycle: 'active', limit: 10 });
      expect(result.hits.map((hit) => hit.sessionId)).toEqual(['b']);
      expect(result.archiveError).toBe('LEGACY_ARCHIVE_CORRUPT');
      expect(result.totals).toBeNull();
    } finally { await runtime.stop(); }
  });

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'message-search-runtime-'));
    hub = createHub();
  });
  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('does nothing while the setting is off: no file, no listener, no answers', async () => {
    const runtime = create(false);
    const status = await runtime.status();
    expect(status).toEqual({ state: 'off', sizeBytes: 0, index: null });
    expect(fs.existsSync(indexFile())).toBe(false);
    expect(hub.listeners).toEqual({ event: 0, status: 0 });
    expect(await runtime.search({ query: 'anything', limit: 5 })).toBeNull();
  });

  it('starts from the saved setting and follows it afterwards, keeping the file when switched off', async () => {
    const runtime = create(true);
    expect((await runtime.status()).state).toBe('on');
    expect(hub.listeners).toEqual({ event: 1, status: 1 });
    expect(await runtime.search({ query: 'anything', limit: 5 })).toMatchObject({ status: 'ok', hits: [] });

    await runtime.setEnabled(false);
    const off = await runtime.status();
    expect(off.state).toBe('off');
    expect(off.sizeBytes).toBeGreaterThan(0);
    expect(hub.listeners).toEqual({ event: 0, status: 0 });
    expect(await runtime.search({ query: 'anything', limit: 5 })).toBeNull();

    await runtime.setEnabled(true);
    expect((await runtime.status()).state).toBe('on');
    expect(hub.listeners).toEqual({ event: 1, status: 1 });
    await runtime.stop();
  });

  it('deletes the file while off, and starts a fresh index when deleted while on', async () => {
    const runtime = create(true);
    await runtime.setEnabled(false);
    expect(fs.existsSync(indexFile())).toBe(true);
    await runtime.deleteIndex();
    expect(fs.existsSync(indexFile())).toBe(false);
    expect(await runtime.status()).toEqual({ state: 'off', sizeBytes: 0, index: null });

    await runtime.setEnabled(true);
    await runtime.deleteIndex();
    const rebuilt = await runtime.status();
    expect(rebuilt.state).toBe('on');
    expect(rebuilt.index).toMatchObject({ sessions: 0, messages: 0 });
    expect(hub.listeners).toEqual({ event: 1, status: 1 });
    await runtime.stop();
    expect(hub.listeners).toEqual({ event: 0, status: 0 });
  });
});
