import fs from 'node:fs';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';

import { createSessionFoldersStore, registerSessionFoldersRoutes } from './routes.js';

const createRouteRegistry = () => {
  const routes = new Map();

  return {
    app: {
      get(routePath, handler) {
        routes.set(`GET ${routePath}`, handler);
      },
      post(routePath, handler) {
        routes.set(`POST ${routePath}`, handler);
      },
      patch(routePath, handler) {
        routes.set(`PATCH ${routePath}`, handler);
      },
    },
    getRoute(method, routePath) {
      return routes.get(`${method} ${routePath}`);
    },
  };
};

const createMockResponse = () => {
  let statusCode = 200;
  let body = null;

  return {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
  };
};

const dataDirs = [];

const makeDataDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-folders-'));
  dataDirs.push(dir);
  return dir;
};

const writeLegacyFolders = (dataDir, value) => fs.writeFileSync(
  path.join(dataDir, 'sessions-directories.json'),
  JSON.stringify(value),
  'utf8',
);

afterEach(() => {
  while (dataDirs.length > 0) fs.rmSync(dataDirs.pop(), { recursive: true, force: true });
});

const folderPayload = (updatedAt) => ({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt });

const folder = (id, name, sessionIds) => ({ id, name, sessionIds, createdAt: 1 });
const registerStore = (dataDir, options = {}) => {
  const routes = new Map();
  const app = {
    get(routePath, handler) { routes.set(`GET ${routePath}`, handler); },
    post(routePath, handler) { routes.set(`POST ${routePath}`, handler); },
    patch(routePath, handler) { routes.set(`PATCH ${routePath}`, handler); },
  };
  const store = createSessionFoldersStore({ openchamberDataDir: dataDir, ...options });
  registerSessionFoldersRoutes(app, { sessionFoldersStore: store });
  const post = async (body) => {
    const response = createMockResponse();
    await routes.get('POST /api/session-folders')({ body }, response);
    return response;
  };
  const get = async () => {
    const response = createMockResponse();
    await routes.get('GET /api/session-folders')({}, response);
    return response;
  };
  const patch = async (changes) => {
    const response = createMockResponse();
    await routes.get('PATCH /api/session-folders')({ body: { changes } }, response);
    return response;
  };
  return { store, post, get, patch };
};

describe('session folders routes backed by Host SQLite', () => {
  it('returns the missing-state route shape when no data exists', async () => {
    const { get, store } = registerStore(makeDataDir());
    await expect(get()).resolves.toMatchObject({ statusCode: 200, body: { version: 1, foldersMap: {}, collapsedFolderIds: [], exists: false } });
    await store.close();
  });

  it('converts legacy folders once, retains the original and survives a real reopen', async () => {
    const dataDir = makeDataDir();
    const legacy = { ...folderPayload(10), foldersMap: { project: [folder('f1', 'One', ['s1'])] } };
    writeLegacyFolders(dataDir, legacy);
    const first = registerStore(dataDir);
    await expect(first.get()).resolves.toMatchObject({
      body: { foldersMap: legacy.foldersMap, revision: '1', errors: {}, conversion: { status: 'complete' }, exists: true },
    });
    await first.store.close();
    expect(fs.readFileSync(path.join(dataDir, 'sessions-directories.json'), 'utf8')).toBe(JSON.stringify(legacy));
    writeLegacyFolders(dataDir, { ...folderPayload(20), foldersMap: { stale: [folder('f2', 'Stale', [])] } });
    const reopened = registerStore(dataDir);
    await expect(reopened.get()).resolves.toMatchObject({ body: { foldersMap: legacy.foldersMap, revision: '1', conversion: { status: 'complete' } } });
    await reopened.store.close();
  });

  it('merges stale snapshots while retaining independent scopes and folder members', async () => {
    const dataDir = makeDataDir();
    writeLegacyFolders(dataDir, { ...folderPayload(20), foldersMap: { a: [folder('f1', 'Keep', ['s1']), folder('f2', 'Drop', ['s2'])] } });
    const routes = registerStore(dataDir);
    await routes.get();
    await expect(routes.post({
      ...folderPayload(10),
      foldersMap: { b: [folder('f3', 'Other', ['s3'])], a: [folder('f1', 'Keep', ['s1', 's4'])] },
    })).resolves.toMatchObject({ statusCode: 200, body: { success: true, revision: '2' } });
    const saved = await routes.get();
    expect(saved.body.foldersMap.a.map(({ id }) => id).sort()).toEqual(['f1', 'f2']);
    expect(saved.body.foldersMap.a.find(({ id }) => id === 'f1').sessionIds).toEqual(['s1', 's4']);
    expect(saved.body.foldersMap.b).toEqual([folder('f3', 'Other', ['s3'])]);
    await routes.store.close();
  });

  it('honors folder deletion tombstones and preserves collapse state across stale writes', async () => {
    let clock = 100;
    const routes = registerStore(makeDataDir(), { now: () => clock });
    await routes.post({ ...folderPayload(10), foldersMap: { project: [folder('keep', 'Keep', []), folder('gone', 'Gone', [])] }, collapsedFolderIds: ['keep', 'gone'] });
    clock = 200;
    await routes.post({ ...folderPayload(20), foldersMap: { project: [folder('keep', 'Keep', [])] }, collapsedFolderIds: [], deletedFolderIds: { gone: clock } });
    await routes.post({ ...folderPayload(15), foldersMap: { project: [folder('keep', 'Keep', []), folder('gone', 'Gone', [])] }, collapsedFolderIds: ['gone'] });
    const saved = await routes.get();
    expect(saved.body.foldersMap.project.map(({ id }) => id)).toEqual(['keep']);
    expect(saved.body.deletedFolderIds).toEqual({ gone: 200 });
    await routes.store.close();
  });

  it('keeps valid scopes readable while reporting a corrupt SQLite scope', async () => {
    const dataDir = makeDataDir();
    const routes = registerStore(dataDir);
    await routes.post({ ...folderPayload(10), foldersMap: { good: [folder('f1', 'One', [])], bad: [folder('f2', 'Two', [])] } });
    await routes.store.close();
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    db.prepare('UPDATE session_folder_scopes SET payload = ? WHERE scope = ?').run('{broken', 'bad');
    db.close();
    const reopened = registerStore(dataDir);
    await expect(reopened.get()).resolves.toMatchObject({ body: { foldersMap: { good: [folder('f1', 'One', [])] }, errors: { bad: 'METADATA_CORRUPT' }, exists: true } });
    await reopened.store.close();
  });

  it('repairs only the incoming corrupt scope and preserves corruption elsewhere', async () => {
    const dataDir = makeDataDir();
    const routes = registerStore(dataDir);
    await routes.post({ ...folderPayload(10), foldersMap: { good: [folder('f1', 'One', [])], bad: [folder('f2', 'Two', [])], other: [folder('f3', 'Three', [])] } });
    await routes.store.close();
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    db.prepare('UPDATE session_folder_scopes SET payload = ? WHERE scope IN (?, ?)').run('{broken', 'bad', 'other');
    db.close();
    const reopened = registerStore(dataDir);
    await reopened.get();
    await expect(reopened.post({ ...folderPayload(20), foldersMap: { bad: [folder('f4', 'Repaired', [])] } })).resolves.toMatchObject({ statusCode: 200, body: { success: true } });
    const saved = await reopened.get();
    expect(saved.body.foldersMap).toEqual({ good: [folder('f1', 'One', [])], bad: [folder('f4', 'Repaired', [])] });
    expect(saved.body.errors).toEqual({ other: 'METADATA_CORRUPT' });
    await reopened.store.close();
  });

  it('preserves a corrupt scope when a client sends an empty scope without a deletion tombstone', async () => {
    const dataDir = makeDataDir();
    const first = registerStore(dataDir);
    await first.post({ ...folderPayload(10), foldersMap: { good: [folder('good', 'Good', [])], bad: [folder('bad', 'Bad', [])] } });
    await first.store.close();
    const databasePath = path.join(dataDir, 'host-metadata.sqlite');
    const db = new DatabaseSync(databasePath);
    db.prepare('UPDATE session_folder_scopes SET payload = ? WHERE scope = ?').run('{broken', 'bad');
    db.close();
    const reopened = registerStore(dataDir);
    try {
      await expect(reopened.post({ ...folderPayload(20), foldersMap: { good: [folder('good', 'Updated', [])], bad: [] } }))
        .resolves.toMatchObject({ statusCode: 200 });
      const state = await reopened.store.get();
      expect(state.snapshot.foldersMap.good).toEqual([folder('good', 'Updated', [])]);
      expect(state.errors).toEqual({ bad: 'METADATA_CORRUPT' });
    } finally {
      await reopened.store.close();
    }
    const retained = new DatabaseSync(databasePath);
    try {
      expect(retained.prepare('SELECT payload FROM session_folder_scopes WHERE scope = ?').get('bad').payload).toBe('{broken');
    } finally {
      retained.close();
    }
  });

  it('rolls back a failed SQLite save without changing revision or prior state', async () => {
    const dataDir = makeDataDir();
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const routes = registerStore(dataDir, { database: db, closeDatabase: false });
    await routes.post({ ...folderPayload(10), foldersMap: { a: [folder('f1', 'One', [])] } });
    db.exec('PRAGMA query_only = ON');
    await expect(routes.post({ ...folderPayload(20), foldersMap: { b: [folder('f2', 'Two', [])] } })).resolves.toMatchObject({ statusCode: 500 });
    await expect(routes.store.get()).resolves.toMatchObject({ snapshot: { foldersMap: { a: [folder('f1', 'One', [])] } }, revision: '1', errors: {} });
    await routes.store.close();
    db.close();
  });

  it('repairs a partial legacy scope after restart without replaying a deleted folder or replacing valid siblings', async () => {
    const dataDir = makeDataDir();
    const now = () => 100;
    const original = {
      ...folderPayload(10),
      foldersMap: { project: [folder('kept', 'Kept', []), folder('deleted', 'Deleted', [])], broken: 'not-an-array' },
    };
    writeLegacyFolders(dataDir, original);
    const first = registerStore(dataDir, { now });
    await first.store.save({ ...folderPayload(20), foldersMap: { project: [folder('kept', 'Kept', [])] }, deletedFolderIds: { deleted: 20 } });
    await first.store.close();
    writeLegacyFolders(dataDir, { ...original, foldersMap: { ...original.foldersMap, broken: [folder('repaired', 'Repaired', [])] } });
    const reopened = registerStore(dataDir, { now });
    const state = await reopened.store.get();
    expect(state.snapshot.foldersMap).toEqual({ project: [folder('kept', 'Kept', [])], broken: [folder('repaired', 'Repaired', [])] });
    expect(state.snapshot.deletedFolderIds).toEqual({ deleted: 20 });
    expect(state.errors).toEqual({});
    await reopened.store.close();
  });
});

describe('session folders change protocol', () => {
  it('applies changes in order and answers with the stored state', async () => {
    const routes = registerStore(makeDataDir(), { now: () => 100 });
    const created = await routes.patch([{
      type: 'create', scopeKey: 'project',
      folder: { id: 'archive', name: 'Archive', parentId: null, createdAt: 5 },
    }]);
    expect(created).toMatchObject({ statusCode: 200, body: { exists: true, revision: '1', foldersMap: { project: [{ id: 'archive', name: 'Archive', sessionIds: [], createdAt: 5, parentId: null }] } } });
    const assigned = await routes.patch([
      { type: 'assign', scopeKey: 'project', folderId: 'archive', sessionIds: ['s1', 's2'] },
      { type: 'rename', scopeKey: 'project', folderId: 'archive', name: 'Old work' },
    ]);
    expect(assigned).toMatchObject({ body: { revision: '2', foldersMap: { project: [{ id: 'archive', name: 'Old work', sessionIds: ['s1', 's2'] }] } } });
    const unassigned = await routes.patch([{ type: 'unassign', scopeKey: 'project', sessionIds: ['s1'] }]);
    expect(unassigned).toMatchObject({ body: { revision: '3', foldersMap: { project: [{ id: 'archive', sessionIds: ['s2'] }] } } });
    await routes.store.close();
  });

  it('keeps a deletion as a tombstone so a stale whole copy cannot bring the folder back', async () => {
    const routes = registerStore(makeDataDir(), { now: () => 100 });
    await routes.post({ ...folderPayload(10), foldersMap: { project: [folder('f1', 'One', ['s1']), folder('f2', 'Two', [])] } });
    await expect(routes.patch([{ type: 'delete', scopeKey: 'project', folderIds: ['f1'] }]))
      .resolves.toMatchObject({ body: { foldersMap: { project: [{ id: 'f2' }] } } });
    // A client from before shared folders writes its whole stale copy.
    await routes.post({ ...folderPayload(20), foldersMap: { project: [folder('f1', 'One', ['s1']), folder('f2', 'Two', [])] } });
    await expect(routes.get()).resolves.toMatchObject({ body: { foldersMap: { project: [{ id: 'f2' }] } } });
    await routes.store.close();
  });

  it('drops the folders of closed project scopes and keeps sibling scopes', async () => {
    const routes = registerStore(makeDataDir(), { now: () => 100 });
    await routes.post({
      ...folderPayload(10),
      foldersMap: { '/repo': [folder('a', 'A', ['s1'])], '/repo/wt': [folder('b', 'B', [])], '/other': [folder('c', 'C', [])] },
    });
    await expect(routes.patch([{ type: 'forget-scopes', scopeKeys: ['/repo', '/repo/wt'] }]))
      .resolves.toMatchObject({ body: { foldersMap: { '/other': [{ id: 'c' }] } } });
    await routes.store.close();
  });

  it('imports a device copy once, joining a same-name folder instead of duplicating it', async () => {
    const routes = registerStore(makeDataDir(), { now: () => 100 });
    await routes.patch([{ type: 'create', scopeKey: 'project', folder: { id: 'server', name: 'Work', parentId: null, createdAt: 5 } }]);
    await routes.patch([{ type: 'assign', scopeKey: 'project', folderId: 'server', sessionIds: ['keep'] }]);
    const imported = await routes.patch([{
      type: 'import',
      foldersMap: { project: [folder('device', 'Work', ['keep', 'local'])] },
    }]);
    expect(imported.body.foldersMap.project).toHaveLength(1);
    expect(imported.body.foldersMap.project[0]).toMatchObject({ id: 'server', name: 'Work', sessionIds: ['keep', 'local'] });
    await routes.store.close();
  });

  it('rejects a malformed change before touching the store', async () => {
    const routes = registerStore(makeDataDir());
    await expect(routes.patch([{ type: 'delete', scopeKey: 'project', folderIds: [] }])).resolves.toMatchObject({ statusCode: 400 });
    await routes.store.close();
  });

  it('does not bump the revision for a change with no effect', async () => {
    const routes = registerStore(makeDataDir(), { now: () => 100 });
    const created = await routes.patch([{ type: 'create', scopeKey: 'project', folder: { id: 'f1', name: 'One', parentId: null, createdAt: 5 } }]);
    expect(created.body.revision).toBe('1');
    const noop = await routes.patch([{ type: 'rename', scopeKey: 'project', folderId: 'f1', name: 'One' }]);
    expect(noop.body.revision).toBe('1');
    await routes.store.close();
  });
});
