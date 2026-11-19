import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createSessionMetadataStore,
  mergeMetadataPatch,
  MetadataCorruptError,
  MetadataWriteError,
} from './session-metadata-store.js';

const roots = [];
const makeDataDir = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-host-metadata-')); roots.push(dir); return dir; };
afterEach(() => { while (roots.length > 0) fs.rmSync(roots.pop(), { recursive: true, force: true }); });

const writeJson = (dir, name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));

describe('mergeMetadataPatch', () => {
  it('preserves unrelated nested values, replaces arrays, and deletes null keys', () => {
    expect(mergeMetadataPatch(
      { openchamber: { goal: { id: 'g1', status: 'active' }, assist: { recap: 'r' } }, pins: ['a'] },
      { openchamber: { goal: { status: 'done' }, assist: null }, pins: ['b'] },
    )).toEqual({ openchamber: { goal: { id: 'g1', status: 'done' } }, pins: ['b'] });
  });

  it('keeps unchecked retained values and merges dictionary names without treating inherited members as records', () => {
    const retained = new Map([['key', 'value']]);
    const merged = mergeMetadataPatch({ retained }, { constructor: { active: true }, toString: { active: true } });
    expect(merged.retained).toBe(retained);
    expect(merged.constructor).toEqual({ active: true });
    expect(merged.toString).toEqual({ active: true });
  });
});

describe('createSessionMetadataStore Host SQLite persistence', () => {
  it('persists operational metadata across a real close and reopen with independent revisions', async () => {
    const dataDir = makeDataDir();
    const first = createSessionMetadataStore({ dataDir });
    await expect(first.get('missing')).resolves.toBeNull();
    await expect(first.setSessionMetadata('ses_a', { openchamber: { goal: { status: 'active' }, assist: { recap: 'r' } } }))
      .resolves.toMatchObject({ revision: '1' });
    await expect(first.setSessionMetadata('ses_a', { openchamber: { goal: { turnCount: 2 } } }))
      .resolves.toMatchObject({ revision: '2' });
    await expect(first.setSessionMetadata('ses_b', { openchamber: { linked_issues: [{ id: 'i1' }] } }))
      .resolves.toMatchObject({ revision: '1' });
    await first.close();

<<<<<<< HEAD
    const reopened = createSessionMetadataStore({ dataDir });
    await expect(reopened.getState('ses_a')).resolves.toEqual({
      metadata: { openchamber: { goal: { status: 'active', turnCount: 2 }, assist: { recap: 'r' } } },
      revision: '2',
||||||| bc50ba56aa
const notFound = () => Object.assign(new Error('Session not found'), { _tag: 'SessionNotFoundError' });

/**
 * OpenCode's side: records by session id. A `write` replaces the whole object,
 * which is what `PATCH /api/session/{id}` does with `metadata`.
 */
const createFakeOpenCode = (records = {}) => {
  const sessions = new Map(Object.entries(records));
  const fake = {
    sessions,
    writes: [],
    failRead: null,
    failWrite: null,
    read: vi.fn(async (id) => {
      if (fake.failRead) throw fake.failRead;
      return sessions.has(id) ? structuredClone(sessions.get(id)) : null;
    }),
    write: vi.fn(async (id, metadata) => {
      // Yield first so concurrent writers really overlap.
      await Promise.resolve();
      if (fake.failWrite) throw fake.failWrite;
      if (!sessions.has(id)) throw notFound();
      fake.writes.push([id, metadata]);
      sessions.set(id, structuredClone(metadata));
    }),
  };
  return fake;
};

const makeStore = (openCode, dataDir = makeDataDir()) => ({
  dataDir,
  store: createSessionMetadataStore({ dataDir, openCode }),
});

describe('createSessionMetadataStore', () => {
  it('cancels one reader while shared legacy loading continues for another', async () => {
    const load = Promise.withResolvers();
    const openCode = createFakeOpenCode({ ses_1: { ready: true } });
    const store = createSessionMetadataStore({
      dataDir: makeDataDir(), openCode,
      fsPromises: { ...fs.promises, readFile: async () => load.promise },
=======
const notFound = () => Object.assign(new Error('Session not found'), { _tag: 'SessionNotFoundError' });

/**
 * OpenCode's side: records by session id. A `write` replaces the whole object,
 * which is what `PATCH /api/session/{id}` does with `metadata`.
 */
const createFakeOpenCode = (records = {}) => {
  const sessions = new Map(Object.entries(records));
  const fake = {
    sessions,
    writes: [],
    failRead: null,
    failWrite: null,
    read: vi.fn(async (id) => {
      if (fake.failRead) throw fake.failRead;
      return sessions.has(id) ? structuredClone(sessions.get(id)) : null;
    }),
    write: vi.fn(async (id, metadata) => {
      // Yield first so concurrent writers really overlap.
      await Promise.resolve();
      if (fake.failWrite) throw fake.failWrite;
      if (!sessions.has(id)) throw notFound();
      fake.writes.push([id, metadata]);
      sessions.set(id, structuredClone(metadata));
    }),
  };
  return fake;
};

const makeStore = (openCode, dataDir = makeDataDir()) => ({
  dataDir,
  store: createSessionMetadataStore({ dataDir, openCode }),
});

describe('createSessionMetadataStore', () => {
  it('keeps legacy session ids that name object prototype members', async () => {
    const dataDir = makeDataDir();
    writeLegacy(dataDir, '{"__proto__":{"kept":true},"constructor":{"kept":true}}');
    const store = createSessionMetadataStore({ dataDir, openCode: createFakeOpenCode() });
    expect(await store.get('__proto__')).toEqual({ kept: true });
    expect(await store.get('constructor')).toEqual({ kept: true });
  });
  it('cancels one reader while shared legacy loading continues for another', async () => {
    const load = Promise.withResolvers();
    const openCode = createFakeOpenCode({ ses_1: { ready: true } });
    const store = createSessionMetadataStore({
      dataDir: makeDataDir(), openCode,
      fsPromises: { ...fs.promises, readFile: async () => load.promise },
>>>>>>> upstream/main
    });
    await expect(reopened.get('ses_b')).resolves.toEqual({ openchamber: { linked_issues: [{ id: 'i1' }] } });
    await reopened.close();
  });

  it('serializes same-session merge patches without losing either ordered write', async () => {
    const store = createSessionMetadataStore({ dataDir: makeDataDir() });
    const [first, second] = await Promise.all([
      store.setSessionMetadata('ses_a', { openchamber: { goal: { status: 'active' } } }),
      store.setSessionMetadata('ses_a', { openchamber: { assist: { recap: 'r' } } }),
    ]);
    expect(new Set([first.revision, second.revision])).toEqual(new Set(['1', '2']));
    await expect(store.get('ses_a')).resolves.toEqual({ openchamber: { goal: { status: 'active' }, assist: { recap: 'r' } } });
    await store.close();
  });

<<<<<<< HEAD
  it('keeps previous and unrelated rows after a real SQLite failed write', async () => {
    const dataDir = makeDataDir();
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createSessionMetadataStore({ dataDir, database: db });
    await store.setSessionMetadata('ses_a', { openchamber: { assist: { recap: 'valid' } } });
    await store.setSessionMetadata('ses_b', { openchamber: { goal: { id: 'g1' } } });
    db.exec('PRAGMA query_only = ON');
    await expect(store.setSessionMetadata('ses_a', { openchamber: { assist: { recap: 'unwritten' } } }))
      .rejects.toBeInstanceOf(MetadataWriteError);
    await expect(store.get('ses_a')).resolves.toEqual({ openchamber: { assist: { recap: 'valid' } } });
    await expect(store.get('ses_b')).resolves.toEqual({ openchamber: { goal: { id: 'g1' } } });
    await store.close();
    db.close();
  });

  it('distinguishes a corrupt row from unrelated usable rows', async () => {
    const dataDir = makeDataDir();
    const store = createSessionMetadataStore({ dataDir });
    await store.setSessionMetadata('ses_good', { openchamber: { goal: { id: 'g1' } } });
    await store.close();
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    db.prepare('INSERT INTO session_metadata (session_id, revision, payload) VALUES (?, ?, ?)').run('ses_bad', 1, '{broken');
    db.close();
||||||| bc50ba56aa
  it('rejects a missing id or a non-object patch', async () => {
    const { store } = makeStore(createFakeOpenCode());
    await expect(store.setSessionMetadata('', { a: 1 })).rejects.toThrow();
    await expect(store.setSessionMetadata('ses_1', ['a'])).rejects.toThrow();
  });

  describe('legacy sessions-metadata.json', () => {
    it('serves a legacy entry over the OpenCode record until it is migrated', async () => {
      const openCode = createFakeOpenCode({ ses_1: { openchamber: { kind: 'review' } } });
      const dataDir = makeDataDir();
      writeLegacy(dataDir, { ses_1: { openchamber: { kind: 'review', goal: { id: 'g1' } } } });
      const { store } = makeStore(openCode, dataDir);
=======
  describe('legacy sessions-metadata.json', () => {
    it('serves and migrates only object entries from a mixed legacy file', async () => {
      const openCode = createFakeOpenCode({
        ses_ok: {}, ses_list: { keep: true }, ses_text: { keep: true }, ses_null: { keep: true },
      });
      const dataDir = makeDataDir();
      writeLegacy(dataDir, { ses_ok: { a: 1 }, ses_list: ['a'], ses_text: 'nope', ses_null: null });
      const { store } = makeStore(openCode, dataDir);

      await expect(store.listUnmigrated()).resolves.toEqual({ ses_ok: { a: 1 } });
      await expect(store.migrateLegacy()).resolves.toBe(0);
      expect(Object.fromEntries(openCode.sessions)).toEqual({
        ses_ok: { a: 1 }, ses_list: { keep: true }, ses_text: { keep: true }, ses_null: { keep: true },
      });
    });

    it('serves a legacy entry over the OpenCode record until it is migrated', async () => {
      const openCode = createFakeOpenCode({ ses_1: { openchamber: { kind: 'review' } } });
      const dataDir = makeDataDir();
      writeLegacy(dataDir, { ses_1: { openchamber: { kind: 'review', goal: { id: 'g1' } } } });
      const { store } = makeStore(openCode, dataDir);
>>>>>>> upstream/main

    const reopened = createSessionMetadataStore({ dataDir });
    await expect(reopened.get('ses_bad')).rejects.toBeInstanceOf(MetadataCorruptError);
    await expect(reopened.get('ses_good')).resolves.toEqual({ openchamber: { goal: { id: 'g1' } } });
    await reopened.close();
  });

  it('converts valid legacy records once without overwriting newer SQLite rows', async () => {
    const dataDir = makeDataDir();
    writeJson(dataDir, 'sessions-metadata.json', {
      ses_a: { openchamber: { goal: { id: 'legacy' } } },
      ses_b: { openchamber: { assist: { recap: 'legacy' } } },
    });
    const first = createSessionMetadataStore({ dataDir });
    await expect(first.get('ses_a')).resolves.toEqual({ openchamber: { goal: { id: 'legacy' } } });
    await first.close();
    expect(fs.existsSync(path.join(dataDir, 'sessions-metadata.json'))).toBe(true);
    const receipts = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    expect(receipts.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get('sessions-metadata.json')).toEqual({ completed: 1 });
    receipts.close();

    writeJson(dataDir, 'sessions-metadata.json', { ses_a: { openchamber: { goal: { id: 'stale' } } } });
    const second = createSessionMetadataStore({ dataDir });
    await expect(second.get('ses_a')).resolves.toEqual({ openchamber: { goal: { id: 'legacy' } } });
    await second.close();
  });

  it('keeps a partially corrupt legacy source while importing unrelated valid records', async () => {
    const dataDir = makeDataDir();
    writeJson(dataDir, 'sessions-metadata.json', {
      ses_good: { openchamber: { goal: { id: 'g1' } } },
      ses_bad: 'not-an-object',
    });
    const store = createSessionMetadataStore({ dataDir });
    await expect(store.get('ses_good')).resolves.toEqual({ openchamber: { goal: { id: 'g1' } } });
    await expect(store.get('ses_bad')).rejects.toBeInstanceOf(MetadataCorruptError);
    expect(fs.existsSync(path.join(dataDir, 'sessions-metadata.json'))).toBe(true);
    await store.close();
  });
});

describe('Host metadata conversion and admission boundaries', () => {
  it('keeps valid SQL usable when the entire legacy source is corrupt', async () => {
    const dataDir = makeDataDir();
    const first = createSessionMetadataStore({ dataDir });
    await first.setSessionMetadata('good', { notes: 'Host note' });
    await first.close();
    fs.writeFileSync(path.join(dataDir, 'sessions-metadata.json'), '{broken');
    const reopened = createSessionMetadataStore({ dataDir });
    await expect(reopened.get('good')).resolves.toEqual({ notes: 'Host note' });
    await expect(reopened.get('unknown')).rejects.toBeInstanceOf(MetadataCorruptError);
    await expect(reopened.listAll()).resolves.toMatchObject({
      entries: { good: { metadata: { notes: 'Host note' }, revision: '1' } },
      conversion: { status: 'corrupt', code: 'METADATA_CORRUPT' },
    });
    await reopened.close();
  });

  it('commits conversion rows and receipt together, retaining original bytes on failed writes', async () => {
    const dataDir = makeDataDir();
    const source = '{"good":{"openchamber":{"goal":{"id":"g"}}}}';
    fs.writeFileSync(path.join(dataDir, 'sessions-metadata.json'), source);
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createSessionMetadataStore({ dataDir, database: db });
    db.exec('PRAGMA query_only = ON');
    await expect(store.convertLegacy()).resolves.toMatchObject({ status: 'failed', error: { code: 'METADATA_WRITE_FAILED' } });
    expect(db.prepare('SELECT COUNT(*) AS count FROM session_metadata').get().count).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS count FROM metadata_conversion').get().count).toBe(0);
    expect(fs.readFileSync(path.join(dataDir, 'sessions-metadata.json'), 'utf8')).toBe(source);
    await store.close();
    db.close();
    const reopened = createSessionMetadataStore({ dataDir });
    await expect(reopened.get('good')).resolves.toEqual({ openchamber: { goal: { id: 'g' } } });
    await reopened.close();
  });

  it('keeps per-selected-ID receipts and copies only operational projections', async () => {
    const dataDir = makeDataDir();
    const store = createSessionMetadataStore({ dataDir });
    const operational = {
      goal: { id: 'g', status: 'paused' }, assist: { recap: 'r' },
      knowledge_context_delivered: ['k'], context_obligatory_last_compaction_message_id: 'm',
      project_context_pins: ['p'], context_obligatory_messages: ['c'], linked_issues: [{ id: 'i' }],
      work: { id: 'w', sourceSessionID: 'parent' }, reviewOffer: { offered: true },
      reviewSessionID: 'review', kind: 'review', originalSessionID: 'original',
    };
    await expect(store.importOperationalSessions([{ id: 'a', directory: '/workspace',
      metadata: { openchamber: { ...operational, transcript: 'must not copy' }, notes: 'note', messages: ['never'] },
      messages: [{ role: 'user', text: 'never' }], }], 'selected')).resolves.toMatchObject({ results: { a: 'imported' }, complete: true });
    await expect(store.get('a')).resolves.toEqual({ directory: '/workspace', notes: 'note', openchamber: operational });
    await store.close();
    const reopened = createSessionMetadataStore({ dataDir });
    await expect(reopened.importOperationalSessions([
      { id: 'a', title: 'Stale' }, { id: 'b', metadata: { openchamber: { assist: { recap: 'new' } } } },
      { id: 'bad', metadata: { openchamber: 'corrupt' } },
    ], 'selected')).resolves.toMatchObject({ results: { a: 'already-converted', b: 'imported' }, errors: { bad: 'METADATA_CORRUPT' }, complete: false });
    await expect(reopened.get('a')).resolves.toMatchObject({ notes: 'note' });
    await expect(reopened.get('b')).resolves.toEqual({ openchamber: { assist: { recap: 'new' } } });
    await reopened.close();
  });

  it('serializes conditional decisions against the current committed metadata', async () => {
    const store = createSessionMetadataStore({ dataDir: makeDataDir() });
    const [first, second] = await Promise.all([
      store.updateSessionMetadata('a', () => ({ count: 1 })),
      store.updateSessionMetadata('a', (metadata) => ({ count: metadata.count + 1 })),
    ]);
    expect(first.revision).toBe('1');
    expect(second).toEqual({ metadata: { count: 2 }, revision: '2', changed: true });
    await expect(store.updateSessionMetadata('a', () => null)).resolves.toEqual({ metadata: { count: 2 }, revision: '2', changed: false });
    await store.close();
  });
});

describe('workbench metadata persistence', () => {
  it('round-trips a pin, the unread watermark and the last turn', async () => {
    const store = createSessionMetadataStore({ dataDir: makeDataDir() });
    await store.setSessionMetadata('ses_a', {
      openchamber: {
        pinned: { at: 1_700_000_000_000 },
        workbench: { lastIdleAt: 1_700_000_000_000, lastTurnOutcome: 'completed' },
        turn: { endedAt: 1_700_000_000_000, durationMs: 4_250 },
      },
    });
    await expect(store.get('ses_a')).resolves.toEqual({
      openchamber: {
        pinned: { at: 1_700_000_000_000 },
        workbench: { lastIdleAt: 1_700_000_000_000, lastTurnOutcome: 'completed' },
        turn: { endedAt: 1_700_000_000_000, durationMs: 4_250 },
      },
    });
    await store.close();
  });

  it('advances the view watermark and clears a pin without disturbing the turn', async () => {
    const store = createSessionMetadataStore({ dataDir: makeDataDir() });
    await store.setSessionMetadata('ses_a', {
      openchamber: { pinned: { at: 1 }, workbench: { lastIdleAt: 9 }, turn: { endedAt: 9, durationMs: 500 } },
    });
    await expect(store.setSessionMetadata('ses_a', { openchamber: { workbench: { viewedAt: 9 }, pinned: null } }))
      .resolves.toEqual({
        metadata: { openchamber: { workbench: { lastIdleAt: 9, viewedAt: 9 }, turn: { endedAt: 9, durationMs: 500 } } },
        revision: '2', changed: true,
      });
    await store.close();
  });

  it('keeps the three workbench keys when importing selected legacy projections', async () => {
    const store = createSessionMetadataStore({ dataDir: makeDataDir() });
    await store.importOperationalSessions([{
      id: 'ses_legacy',
      metadata: { openchamber: { pinned: { at: 2 }, workbench: { lastIdleAt: 3, viewedAt: 3 }, turn: { endedAt: 3, durationMs: 1_000 }, transcript: 'dropped' } },
    }], 'selected');
    await expect(store.get('ses_legacy')).resolves.toEqual({
      openchamber: { pinned: { at: 2 }, workbench: { lastIdleAt: 3, viewedAt: 3 }, turn: { endedAt: 3, durationMs: 1_000 } },
    });
    await store.close();
  });
});
