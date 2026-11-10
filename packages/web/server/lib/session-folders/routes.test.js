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
<<<<<<< HEAD
  const store = createSessionFoldersStore({ openchamberDataDir: dataDir, ...options });
  registerSessionFoldersRoutes(app, { sessionFoldersStore: store });
  const post = async (body) => {
=======

  describe('changes', () => {
    const create = (scopeKey, id, name, parentId = null) => ({ type: 'create', scopeKey, folder: { id, name, parentId, createdAt: 1 } });

    it('applies a create, a move and a rename, and announces each write once', async () => {
      const onChanged = vi.fn();
      const routes = createPersistingRoutes(undefined, { onChanged, now: () => 1_000 });

      const response = await routes.patch([
        create('/repo', 'f1', 'Work'),
        { type: 'assign', scopeKey: '/repo', folderId: 'f1', sessionIds: ['s1', 's2'] },
        { type: 'rename', scopeKey: '/repo', folderId: 'f1', name: 'Done' },
      ]);

      expect(response.statusCode).toBe(200);
      expect(response.body.foldersMap['/repo']).toEqual([{ id: 'f1', name: 'Done', parentId: null, createdAt: 1, sessionIds: ['s1', 's2'] }]);
      expect(response.body.updatedAt).toBe(1_000);
      expect(onChanged).toHaveBeenCalledTimes(1);
      expect(onChanged).toHaveBeenCalledWith(1_000);
      expect((await routes.get()).foldersMap).toEqual(response.body.foldersMap);
    });

    it('moves a chat out of its old folder and keeps a revision that only grows', async () => {
      const routes = createPersistingRoutes({
        ...folderPayload(5_000),
        foldersMap: { '/repo': [folder('a', 'A', ['s1', 's2']), folder('b', 'B', [])] },
      }, { now: () => 10 });

      const response = await routes.patch([{ type: 'assign', scopeKey: '/repo', folderId: 'b', sessionIds: ['s1'] }]);

      expect(response.body.foldersMap['/repo'].map((entry) => [entry.id, entry.sessionIds])).toEqual([['a', ['s2']], ['b', ['s1']]]);
      // The server clock is behind the stored revision; the revision still grows.
      expect(response.body.updatedAt).toBe(5_001);
    });

    describe('a move with the place it started from', () => {
      const stored = (holding) => ({
        ...folderPayload(20),
        foldersMap: { '/repo': Object.entries(holding).map(([id, sessionIds]) => folder(id, id, sessionIds)) },
      });
      const holding = (response) => Object.fromEntries(response.body.foldersMap['/repo'].map((entry) => [entry.id, entry.sessionIds]));

      it('applies while the chat is still there', async () => {
        const routes = createPersistingRoutes(stored({ p: ['s1'], x: [] }), { now: () => 1_000 });
        const response = await routes.patch([{ type: 'assign', scopeKey: '/repo', folderId: 'x', sessionIds: ['s1'], from: { s1: 'p' } }]);
        expect(holding(response)).toEqual({ p: [], x: ['s1'] });
      });

      it('leaves a chat another client moved since, writes nothing and announces nothing', async () => {
        const onChanged = vi.fn();
        const routes = createPersistingRoutes(stored({ p: [], x: [], y: ['s1'] }), { onChanged });
        const response = await routes.patch([
          { type: 'assign', scopeKey: '/repo', folderId: 'x', sessionIds: ['s1'], from: { s1: 'p' } },
          { type: 'unassign', scopeKey: '/repo', sessionIds: ['s1'], from: { s1: 'x' } },
        ]);
        expect(holding(response)).toEqual({ p: [], x: [], y: ['s1'] });
        expect(onChanged).not.toHaveBeenCalled();
      });

      it('sent twice, the second one changes nothing', async () => {
        const onChanged = vi.fn();
        const routes = createPersistingRoutes(stored({ p: [], x: ['s1'] }), { onChanged });
        await routes.patch([{ type: 'assign', scopeKey: '/repo', folderId: 'x', sessionIds: ['s1'], from: { s1: 'p' } }]);
        expect(onChanged).not.toHaveBeenCalled();
      });

      it('moves only the chats of a batch that are still in place', async () => {
        const routes = createPersistingRoutes(stored({ p: ['s1'], x: [], y: ['s2'] }), { now: () => 1_000 });
        const response = await routes.patch([{ type: 'assign', scopeKey: '/repo', folderId: 'x', sessionIds: ['s1', 's2'], from: { s1: 'p', s2: 'p' } }]);
        expect(holding(response)).toEqual({ p: [], x: ['s1'], y: ['s2'] });
      });

      it('moves a chat whose folder another client deleted', async () => {
        const routes = createPersistingRoutes(stored({ x: [] }), { now: () => 1_000 });
        const response = await routes.patch([{ type: 'assign', scopeKey: '/repo', folderId: 'x', sessionIds: ['s1'], from: { s1: 'deleted' } }]);
        expect(holding(response)).toEqual({ x: ['s1'] });
      });

      it('takes a chat that was in no folder only while it is in none', async () => {
        const routes = createPersistingRoutes(stored({ x: [], y: ['s1'] }), { now: () => 1_000 });
        const response = await routes.patch([
          { type: 'assign', scopeKey: '/repo', folderId: 'x', sessionIds: ['s1', 's2'], from: { s1: null, s2: null } },
        ]);
        expect(holding(response)).toEqual({ x: ['s2'], y: ['s1'] });
      });
    });

    it('writes nothing and announces nothing for a change that is already in place', async () => {
      const onChanged = vi.fn();
      const routes = createPersistingRoutes({
        ...folderPayload(20),
        foldersMap: { '/repo': [folder('a', 'A', ['s1'])] },
      }, { onChanged });

      const response = await routes.patch([
        { type: 'assign', scopeKey: '/repo', folderId: 'a', sessionIds: ['s1'] },
        { type: 'rename', scopeKey: '/repo', folderId: 'a', name: 'A' },
        create('/repo', 'a', 'Again'),
      ]);

      expect(response.statusCode).toBe(200);
      expect(response.body.updatedAt).toBe(20);
      expect(routes.fsPromises.writeFile).not.toHaveBeenCalled();
      expect(onChanged).not.toHaveBeenCalled();
    });

    it('ignores a move into a folder another client deleted meanwhile', async () => {
      const routes = createPersistingRoutes({
        ...folderPayload(20),
        foldersMap: { '/repo': [folder('a', 'A', ['s1'])] },
      });

      await routes.patch([{ type: 'delete', scopeKey: '/repo', folderIds: ['a'] }]);
      const response = await routes.patch([
        { type: 'assign', scopeKey: '/repo', folderId: 'a', sessionIds: ['s2'] },
        { type: 'rename', scopeKey: '/repo', folderId: 'a', name: 'Back' },
      ]);

      expect(response.body.foldersMap).toEqual({});
      expect(Object.keys(response.body.deletedFolderIds)).toEqual(['a']);
    });

    it('deletes sub-folders with their folder and leaves a tombstone for older clients', async () => {
      const routes = createPersistingRoutes({
        ...folderPayload(20),
        foldersMap: { '/repo': [folder('a', 'A', []), { ...folder('b', 'B', ['s1']), parentId: 'a' }, folder('c', 'C', [])] },
        collapsedFolderIds: ['b', 'c'],
      }, { now: () => 100 });

      await routes.patch([{ type: 'delete', scopeKey: '/repo', folderIds: ['a'] }]);
      // An older client still holding the deleted folders writes its whole copy.
      await routes.post({
        ...folderPayload(30),
        foldersMap: { '/repo': [folder('a', 'A', []), { ...folder('b', 'B', ['s1']), parentId: 'a' }, folder('c', 'C', [])] },
      });

      const snapshot = await routes.get();
      expect(snapshot.foldersMap['/repo'].map((entry) => entry.id)).toEqual(['c']);
      expect(snapshot.deletedFolderIds).toEqual({ a: 100, b: 100 });
    });

    it('takes a deleted chat out of every folder on the server', async () => {
      const routes = createPersistingRoutes({
        ...folderPayload(20),
        foldersMap: { '/repo': [folder('a', 'A', ['s1', 's2'])], '/wt': [folder('b', 'B', ['s1'])] },
      });

      const response = await routes.patch([{ type: 'forget-sessions', sessionIds: ['s1'] }]);

      expect(response.body.foldersMap).toEqual({ '/repo': [folder('a', 'A', ['s2'])] , '/wt': [folder('b', 'B', [])] });
    });

    it('removes every folder of a closed project', async () => {
      const routes = createPersistingRoutes({
        ...folderPayload(20),
        foldersMap: { '/repo': [folder('a', 'A', ['s1'])], '__archived__:/repo': [folder('z', 'main', ['s9'])], '/other': [folder('o', 'O', [])] },
      }, { now: () => 50 });

      const response = await routes.patch([{ type: 'forget-scopes', scopeKeys: ['/repo', '__archived__:/repo'] }]);

      expect(Object.keys(response.body.foldersMap)).toEqual(['/other']);
      expect(response.body.deletedFolderIds).toEqual({ a: 50, z: 50 });
    });

    it('lets a fixed-id folder be created again after it was deleted', async () => {
      const routes = createPersistingRoutes(undefined);
      await routes.patch([create('/repo', 'archived:main', 'main')]);
      await routes.patch([{ type: 'delete', scopeKey: '/repo', folderIds: ['archived:main'] }]);
      const response = await routes.patch([create('/repo', 'archived:main', 'main')]);
      expect(response.body.foldersMap['/repo'].map((entry) => entry.id)).toEqual(['archived:main']);
      expect(response.body.deletedFolderIds).toEqual({});
    });

    it('rejects a malformed change without writing', async () => {
      const routes = createPersistingRoutes(undefined);
      const response = await routes.patch([{ type: 'assign', scopeKey: '/repo', folderId: 'a', sessionIds: [] }]);
      expect(response.statusCode).toBe(400);
      expect(routes.fsPromises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('import of folders a device kept on its own', () => {
    const imported = (foldersMap, deletedFolderIds) => [{ type: 'import', foldersMap, deletedFolderIds }];

    it('adds local folders the server does not have and keeps the server ones', async () => {
      const routes = createPersistingRoutes({
        ...folderPayload(20),
        foldersMap: { '/repo': [folder('s', 'Server', ['s1'])] },
      });

      const response = await routes.patch(imported({ '/repo': [folder('l', 'Local', ['s2'])], '/wt': [folder('w', 'Wt', ['s3'])] }));

      expect(response.body.foldersMap['/repo'].map((entry) => [entry.id, entry.name, entry.sessionIds])).toEqual([
        ['s', 'Server', ['s1']],
        ['l', 'Local', ['s2']],
      ]);
      expect(response.body.foldersMap['/wt'].map((entry) => entry.id)).toEqual(['w']);
    });

    it('joins a local folder with a same-name server folder instead of making a duplicate', async () => {
      const routes = createPersistingRoutes({
        ...folderPayload(20),
        foldersMap: { '/repo': [folder('s', 'Bugs', ['s1'])] },
      });

      const response = await routes.patch(imported({ '/repo': [folder('l', 'bugs ', ['s1', 's2'])] }));

      expect(response.body.foldersMap['/repo']).toEqual([folder('s', 'Bugs', ['s1', 's2'])]);
    });

    it('keeps a chat where the server files it and places sub-folders under the joined parent', async () => {
      const routes = createPersistingRoutes({
        ...folderPayload(20),
        foldersMap: { '/repo': [folder('sp', 'Parent', []), folder('other', 'Other', ['s1'])] },
      });

      const response = await routes.patch(imported({
        '/repo': [
          { ...folder('lc', 'Child', ['s1', 's2']), parentId: 'lp' },
          folder('lp', 'parent', []),
        ],
      }));

      const folders = response.body.foldersMap['/repo'];
      expect(folders.find((entry) => entry.id === 'other').sessionIds).toEqual(['s1']);
      expect(folders.find((entry) => entry.id === 'lc')).toEqual({ ...folder('lc', 'Child', ['s2']), parentId: 'sp' });
      expect(folders.some((entry) => entry.id === 'lp')).toBe(false);
    });

    it('is a no-op when the same device imports twice', async () => {
      const onChanged = vi.fn();
      const routes = createPersistingRoutes(undefined, { onChanged });
      const local = { '/repo': [folder('l', 'Local', ['s1'])] };

      await routes.patch(imported(local));
      await routes.patch(imported(local));

      expect(onChanged).toHaveBeenCalledTimes(1);
      expect((await routes.get()).foldersMap).toEqual({ '/repo': [{ ...folder('l', 'Local', ['s1']), parentId: null }] });
    });

    it('drops local folders deleted elsewhere and records the device\'s own deletions', async () => {
      const now = Date.now();
      const routes = createPersistingRoutes({
        ...folderPayload(20),
        foldersMap: { '/repo': [folder('keep', 'Keep', [])] },
        deletedFolderIds: { gone: now - 1_000 },
      });

      const response = await routes.patch(imported(
        { '/repo': [folder('gone', 'Gone', ['s1']), folder('keep', 'Keep', [])] },
        { keep: now },
      ));

      expect(response.body.foldersMap).toEqual({});
      expect(Object.keys(response.body.deletedFolderIds).sort()).toEqual(['gone', 'keep']);
    });
  });

  it('keeps a deleted folder deleted when a stale device sends it again', async () => {
    const now = Date.now();
    const routes = createPersistingRoutes({
      ...folderPayload(10),
      foldersMap: { '/home/ai': [folder('f1', 'Keep', ['s1']), folder('fx', 'Gone', ['s2'])] },
    });

    await routes.post({
      ...folderPayload(20),
      foldersMap: { '/home/ai': [folder('f1', 'Keep', ['s1'])] },
      deletedFolderIds: { fx: now },
    });
    await routes.post({
      ...folderPayload(15),
      foldersMap: { '/home/ai': [folder('f1', 'Keep', ['s1']), folder('fx', 'Gone', ['s2'])] },
      collapsedFolderIds: ['fx'],
    });

    const snapshot = await routes.get();
    expect(snapshot.foldersMap['/home/ai'].map((entry) => entry.id)).toEqual(['f1']);
    expect(snapshot.collapsedFolderIds).toEqual([]);
    expect(snapshot.deletedFolderIds).toEqual({ fx: now });
  });

  it('forgets tombstones older than thirty days', async () => {
    const routes = createPersistingRoutes({
      ...folderPayload(10),
      deletedFolderIds: { old: Date.now() - 31 * 24 * 60 * 60 * 1000 },
    });
    await routes.post({ ...folderPayload(20) });
    expect((await routes.get()).deletedFolderIds).toEqual({});
  });

  it('takes collapse state for a known folder from the writer', async () => {
    const routes = createPersistingRoutes({
      ...folderPayload(10),
      foldersMap: { '/home/ai': [folder('f1', 'One', []), folder('f2', 'Two', [])] },
      collapsedFolderIds: ['f1', 'f2'],
    });
    await routes.post({
      ...folderPayload(20),
      foldersMap: { '/home/ai': [folder('f1', 'One', [])] },
      collapsedFolderIds: [],
    });
    // f1 was expanded by the writer; f2 is unknown to it, so its state stays.
    expect((await routes.get()).collapsedFolderIds).toEqual(['f2']);
  });

  it('rejects a tombstone map with a non-numeric timestamp', async () => {
    const routes = createPersistingRoutes();
    const response = await routes.post({ ...folderPayload(20), deletedFolderIds: { fx: 'yesterday' } });
    expect(response.statusCode).toBe(400);
  });

  it('lets the incoming version win for the same folder id', async () => {
    const { app, getRoute } = createRouteRegistry();
    let persisted = JSON.stringify({
      ...folderPayload(20),
      foldersMap: { '/home/ai': [folder('f1', 'Old name', ['s1'])] },
    });
    const fsPromises = {
      readFile: vi.fn(async () => persisted),
      mkdir: vi.fn(async () => {}),
      writeFile: vi.fn(async (_tempPath, value) => {
        persisted = value;
      }),
      rename: vi.fn(async () => {}),
      unlink: vi.fn(async () => {}),
    };
    registerSessionFoldersRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir: '/tmp/openchamber-test',
    });

>>>>>>> bc50ba56a
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
