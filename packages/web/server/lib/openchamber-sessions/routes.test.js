import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProjectDirectoryRuntime } from '../host/project-directory-runtime.js';

const createWorktreeMock = vi.fn(async () => ({
  head: 'abc123',
  name: 'side-task',
  branch: 'openchamber/side-task',
  path: '/repo/worktrees/side-task',
}));
const getWorktreeBootstrapStatusMock = vi.fn(async () => ({
  status: 'ready',
  phase: 'setup-ready',
  error: null,
  updatedAt: Date.now(),
}));
const worktreeBootstrapStore = { read: vi.fn(), write: vi.fn(), remove: vi.fn() };
const hydrateWorktreeCheckoutMock = vi.fn(async () => ({ status: 'not-needed', submodules: [], lfs: [] }));
// `@opencode/client` unwraps single-record responses, so these mocks return
// the record itself; only the paged/list endpoints keep a `{ data }` envelope.
const sessionCreateMock = vi.fn(async () => ({ id: 'ses_123' }));
const sessionForkMock = vi.fn(async () => ({ id: 'ses_fork', title: 'Forked session' }));
const sessionMessagesMock = vi.fn(async () => ({ data: [] }));
const sessionGetMock = vi.fn(async ({ sessionID }) => ({ id: sessionID, location: { directory: '/repo/app' } }));
const sessionUpdateMock = vi.fn(async () => undefined);
const sessionPromptMock = vi.fn(async () => ({ id: 'msg_dispatched' }));
const sessionSyntheticMock = vi.fn(async () => ({ id: 'msg_synthetic' }));
const sessionSwitchModelMock = vi.fn(async () => undefined);
const sessionSwitchAgentMock = vi.fn(async () => undefined);
const modelListMock = vi.fn(async () => ({ data: [] }));
const agentListMock = vi.fn(async () => ({ data: [] }));
const configGetMock = vi.fn(async () => ([]));

let existingSessionMessages = [];
let dispatchedUserMessageSeq = 0;

// The service confirms a prompt landed by watching for a new user message, so
// the default mock behaves like OpenCode recording each dispatched prompt.
const setSessionMessages = (messages) => {
  existingSessionMessages = messages;
};

const recordedSessionMessages = async () => {
  dispatchedUserMessageSeq += 1;
  return {
    data: [
      ...existingSessionMessages,
      {
        id: `msg_dispatched_${dispatchedUserMessageSeq}`,
        type: 'user',
        time: { created: 1000 + dispatchedUserMessageSeq },
      },
    ],
  };
};

// v2 serves one flat model catalogue and a flat agent list through the client,
// so the selection inputs are stubbed on the client mocks rather than on fetch.
const CATALOG_MODELS = [
  { id: 'gpt-5.5', modelID: 'gpt-5.5', providerID: 'openai', variants: [{ id: 'high' }] },
  { id: 'claude-sonnet-5', modelID: 'claude-sonnet-5', providerID: 'anthropic', variants: [{ id: 'high' }] },
];
const CATALOG_AGENTS = [
  { id: 'build', name: 'Build', mode: 'primary', hidden: false },
  { id: 'plan', name: 'plan', mode: 'primary', hidden: false },
];
const useCatalog = ({ models = CATALOG_MODELS, agents = CATALOG_AGENTS, config = [] } = {}) => {
  modelListMock.mockImplementation(async () => ({ data: models }));
  agentListMock.mockImplementation(async () => ({ data: agents }));
  configGetMock.mockImplementation(async () => config);
};

const sessionCommandMock = vi.fn(async () => undefined);
const commandListMock = vi.fn(async () => ({ data: [] }));
globalThis.__openchamberCreateWorktreeMock = createWorktreeMock;
globalThis.__openchamberGetWorktreeBootstrapStatusMock = getWorktreeBootstrapStatusMock;

let registerOpenChamberSessionRoutes;
let createSessionMetadataStore;

// Every `OpenCode.make` call is recorded so tests can assert on the scoping
// headers the routes build.
const clientOptions = [];

vi.mock('@opencode/client', () => ({
  OpenCode: {
    make: (options) => {
      clientOptions.push(options);
      return {
        session: {
          create: sessionCreateMock,
          fork: sessionForkMock,
          get: sessionGetMock,
          update: sessionUpdateMock,
          command: sessionCommandMock,
          prompt: sessionPromptMock,
          synthetic: sessionSyntheticMock,
          switchModel: sessionSwitchModelMock,
          switchAgent: sessionSwitchAgentMock,
        },
        message: { list: sessionMessagesMock },
        command: { list: commandListMock },
        model: { list: modelListMock },
        agent: { list: agentListMock },
        config: { get: configGetMock },
      };
    },
  },
}));

vi.mock('../git/index.js', () => ({
  createWorktree: (...args) => globalThis.__openchamberCreateWorktreeMock(...args),
  getWorktreeBootstrapStatus: (...args) => globalThis.__openchamberGetWorktreeBootstrapStatusMock(...args),
  resolvePrimaryWorktreeRoot: async (directory) => ({ root: directory === '/repo/worktrees/side-task' ? '/repo/app' : directory }),
}));

/**
 * Archive state is OpenChamber's own now, so the routes take a store rather
 * than talking to OpenCode. The tests use an in-memory one with the same
 * contract as `archive-store.js`.
 */
const createMemorySessionMetadataStore = () => {
  const entries = new Map();
  const revisions = new Map();
  const merge = (current, patch) => {
    const base = { ...(current ?? {}) };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) delete base[key];
      else if (value && typeof value === 'object' && !Array.isArray(value)) base[key] = merge(base[key], value);
      else base[key] = value;
    }
    return base;
  };
  return {
    entries,
    get: async (id) => entries.get(id) ?? null,
    getState: async (id) => entries.has(id) ? { metadata: entries.get(id), revision: String(revisions.get(id) ?? 1) } : null,
    setSessionMetadata: async (id, patch) => {
      const current = entries.get(id);
      const merged = merge(current, patch);
      const changed = JSON.stringify(current) !== JSON.stringify(merged);
      const revision = (revisions.get(id) ?? (entries.has(id) ? 1 : 0)) + (changed ? 1 : 0);
      entries.set(id, merged);
      revisions.set(id, revision);
      return { metadata: merged, revision: String(revision), changed };
    },
  };
};

const createMemoryArchiveStore = () => {
  const entries = new Map();
  let failFor = new Set();
  return {
    failIds: (ids) => { failFor = new Set(ids); },
    entries,
    getAll: async () => Object.fromEntries(entries),
    archive: async (ids, archivedAt) => {
      const stamp = Number.isSafeInteger(archivedAt) && archivedAt > 0 ? archivedAt : 1;
      const archived = [];
      const failedIds = [];
      for (const id of ids) {
        if (failFor.has(id)) { failedIds.push(id); continue; }
        entries.set(id, stamp);
        archived.push({ id, archivedAt: stamp });
      }
      return { archived, failedIds };
    },
    unarchive: async (ids) => {
      const restored = [];
      const failedIds = [];
      for (const id of ids) {
        if (failFor.has(id)) { failedIds.push(id); continue; }
        entries.delete(id);
        restored.push({ id, archivedAt: null });
      }
      return { restored, failedIds };
    },
  };
};

const createApp = (overrides = {}, options = {}) => {
  const app = express();
  if (options.globalJson !== false) {
    app.use(express.json());
  }
  const calls = [];
  const archiveStore = overrides.archiveStore ?? createMemoryArchiveStore();
  const sessionMetadataStore = overrides.sessionMetadataStore ?? createMemorySessionMetadataStore();
  const broadcastGlobalUiEvent = overrides.broadcastGlobalUiEvent ?? vi.fn();
  registerOpenChamberSessionRoutes(app, {
    archiveStore,
    sessionMetadataStore,
    broadcastGlobalUiEvent,
    isRequestOriginAllowed: overrides.isRequestOriginAllowed ?? vi.fn(async () => true),
    readSettingsFromDiskMigrated: async () => ({ projects: [{ id: 'proj_1', path: '/repo/app' }] }),
    sanitizeProjects: (projects) => projects,
    validateDirectoryPath: async (directory) => ({ ok: true, directory }),
    buildOpenCodeUrl: (route) => `http://opencode.test${route}`,
    getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer test' }),
    waitForOpenCodeReady: vi.fn(async () => undefined),
    worktreeBootstrapStore,
    hydrateWorktreeCheckout: hydrateWorktreeCheckoutMock,
    ...overrides,
  });
  return { app, calls, archiveStore, sessionMetadataStore, broadcastGlobalUiEvent };
};

describe('openchamber session routes', () => {
  beforeAll(async () => {
    ({ registerOpenChamberSessionRoutes } = await import('./routes.js'));
    ({ createSessionMetadataStore } = await import('./session-metadata-store.js'));
  });

  beforeEach(() => {
    createWorktreeMock.mockClear();
    hydrateWorktreeCheckoutMock.mockClear();
    getWorktreeBootstrapStatusMock.mockClear();
    getWorktreeBootstrapStatusMock.mockImplementation(async () => ({
      status: 'ready',
      phase: 'setup-ready',
      error: null,
      updatedAt: Date.now(),
    }));
    sessionCreateMock.mockClear();
    sessionUpdateMock.mockClear();
    sessionForkMock.mockClear();
    existingSessionMessages = [];
    dispatchedUserMessageSeq = 0;
    sessionMessagesMock.mockReset();
    sessionMessagesMock.mockImplementation(recordedSessionMessages);
    sessionCommandMock.mockReset();
    sessionCommandMock.mockResolvedValue({ data: {} });
    clientOptions.length = 0;
    commandListMock.mockReset();
    commandListMock.mockResolvedValue({ data: [] });
    sessionGetMock.mockReset();
    sessionGetMock.mockImplementation(async ({ sessionID }) => ({ id: sessionID, location: { directory: '/repo/app' } }));
    sessionPromptMock.mockReset();
    sessionPromptMock.mockImplementation(async () => ({ id: 'msg_dispatched' }));
    sessionSyntheticMock.mockReset();
    sessionSyntheticMock.mockImplementation(async () => ({ id: 'msg_synthetic' }));
    sessionSwitchModelMock.mockReset();
    sessionSwitchModelMock.mockImplementation(async () => undefined);
    sessionSwitchAgentMock.mockReset();
    sessionSwitchAgentMock.mockImplementation(async () => undefined);
    modelListMock.mockReset();
    modelListMock.mockImplementation(async () => ({ data: [] }));
    agentListMock.mockReset();
    agentListMock.mockImplementation(async () => ({ data: [] }));
    configGetMock.mockReset();
    useCatalog();
  });

  describe('archiving a batch of sessions', () => {
    it('archives every id and reports what it stored', async () => {
      const { app, archiveStore, broadcastGlobalUiEvent } = createApp();
      const response = await request(app)
        .post('/api/openchamber/sessions/archive')
        .send({ ids: ['ses_a', 'ses_b'], archivedAt: 1700 })
        .expect(200);

      expect(response.body.archived).toEqual([
        { id: 'ses_a', archivedAt: 1700 },
        { id: 'ses_b', archivedAt: 1700 },
      ]);
      expect(response.body.failedIds).toEqual([]);
      await expect(archiveStore.getAll()).resolves.toEqual({ ses_a: 1700, ses_b: 1700 });
      expect(broadcastGlobalUiEvent).toHaveBeenCalledWith({
        type: 'openchamber:session-archived',
        properties: { sessionID: 'ses_a', archivedAt: 1700 },
      });
    });

    it('keeps archiving after a failed session and reports it as failed', async () => {
      const archiveStore = createMemoryArchiveStore();
      archiveStore.failIds(['ses_b']);
      const { app } = createApp({ archiveStore });

      const response = await request(app)
        .post('/api/openchamber/sessions/archive')
        .send({ ids: ['ses_a', 'ses_b', 'ses_c'] })
        .expect(200);

      expect(response.body.archived.map((session) => session.id)).toEqual(['ses_a', 'ses_c']);
      expect(response.body.failedIds).toEqual(['ses_b']);
    });

    it('does not announce a session it failed to store', async () => {
      const archiveStore = createMemoryArchiveStore();
      archiveStore.failIds(['ses_b']);
      const { app, broadcastGlobalUiEvent } = createApp({ archiveStore });

      await request(app)
        .post('/api/openchamber/sessions/archive')
        .send({ ids: ['ses_a', 'ses_b'] })
        .expect(200);

      const announced = broadcastGlobalUiEvent.mock.calls.map(([event]) => event.properties.sessionID);
      expect(announced).toEqual(['ses_a']);
    });

    it('restores a batch and announces the cleared state', async () => {
      const { app, archiveStore, broadcastGlobalUiEvent } = createApp();
      await request(app).post('/api/openchamber/sessions/archive').send({ ids: ['ses_a'] }).expect(200);
      broadcastGlobalUiEvent.mockClear();

      const response = await request(app)
        .post('/api/openchamber/sessions/unarchive')
        .send({ ids: ['ses_a'] })
        .expect(200);

      expect(response.body.restored).toEqual([{ id: 'ses_a', archivedAt: null }]);
      expect(response.body.failedIds).toEqual([]);
      await expect(archiveStore.getAll()).resolves.toEqual({});
      expect(broadcastGlobalUiEvent).toHaveBeenCalledWith({
        type: 'openchamber:session-archived',
        properties: { sessionID: 'ses_a', archivedAt: null },
      });
    });

    it('rejects an empty batch, an oversized batch, and non-string ids', async () => {
      const { app, archiveStore } = createApp();

      await request(app).post('/api/openchamber/sessions/archive').send({ ids: [] }).expect(400);
      await request(app)
        .post('/api/openchamber/sessions/archive')
        .send({ ids: Array.from({ length: 501 }, (_, index) => `ses_${index}`) })
        .expect(400);
      await request(app)
        .post('/api/openchamber/sessions/archive')
        .send({ ids: ['ses_a', ''] })
        .expect(400);
      await request(app)
        .post('/api/openchamber/sessions/archive')
        .send({ ids: ['ses_a'], archivedAt: -1 })
        .expect(400);
      await request(app).post('/api/openchamber/sessions/unarchive').send({ ids: [] }).expect(400);

      await expect(archiveStore.getAll()).resolves.toEqual({});
    });
  });

  describe('session metadata OpenChamber owns', () => {
    it('persists a Host metadata patch in real SQLite with current state response', async () => {
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-routes-metadata-'));
      const store = createSessionMetadataStore({ dataDir });
      try {
        const { app } = createApp({ sessionMetadataStore: store });
        const response = await request(app).post('/api/openchamber/sessions/ses_v1/metadata')
          .send({ patch: { openchamber: { goal: { status: 'active' } } } }).expect(200);
        expect(response.body).toEqual({ metadata: { openchamber: { goal: { status: 'active' } } }, revision: '1', changed: true });
        expect(sessionUpdateMock).not.toHaveBeenCalled();
      } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
    });

    it('merge-patches metadata, returns the merged object, and announces it', async () => {
      const { app, sessionMetadataStore, broadcastGlobalUiEvent } = createApp();
      await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: { openchamber: { assist: { recap: 'first' } } } }).expect(200);
      const response = await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: { openchamber: { goal: { status: 'active' } } } }).expect(200);
      expect(response.body).toEqual({ metadata: { openchamber: { assist: { recap: 'first' }, goal: { status: 'active' } } }, revision: '2', changed: true });
      await expect(sessionMetadataStore.getState('ses_a')).resolves.toMatchObject({ metadata: response.body.metadata, revision: '2' });
      expect(broadcastGlobalUiEvent).toHaveBeenLastCalledWith({ type: 'openchamber:session-metadata', properties: { sessionID: 'ses_a', metadata: response.body.metadata, revision: '2' } });
    });

    it('deletes a key when the patch value is null', async () => {
      const { app } = createApp();
      await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: { openchamber: { goal: { id: 'g1' }, assist: { recap: 'r' } } } }).expect(200);
      const response = await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: { openchamber: { assist: null } } }).expect(200);
      expect(response.body).toMatchObject({ metadata: { openchamber: { goal: { id: 'g1' } } }, changed: true });
    });

    it('reads missing metadata as null revision zero', async () => {
      const { app } = createApp();
      await expect(request(app).get('/api/openchamber/sessions/ses_missing/metadata').expect(200)).resolves.toEqual(expect.objectContaining({ body: { metadata: null, revision: '0' } }));
    });
  });

  it('rejects metadata import without origin before conversion', async () => {
    const readLegacySessionProjection = vi.fn();
    const { app } = createApp({ isRequestOriginAllowed: vi.fn(async () => false), readLegacySessionProjection });
    await request(app).post('/api/openchamber/sessions/metadata/import').send({ intent: 'operational-metadata-conversion', consent: true, source: 'legacy', sessions: [{ id: 'old_1' }] }).expect(403);
    expect(readLegacySessionProjection).not.toHaveBeenCalled();
  });

  it('requires the origin gate before wiring any session route', () => {
    const app = express();
    const post = vi.spyOn(app, 'post');
    expect(() => registerOpenChamberSessionRoutes(app, { sessionService: {}, isRequestOriginAllowed: undefined }))
      .toThrow('Session routes require isRequestOriginAllowed');
    expect(post).not.toHaveBeenCalled();
  });

  it('refuses unauthorized or absent selected directories before reading and imports an unrelated sibling', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-import-scope-'));
    const sibling = path.join(root, 'sibling');
    const refused = path.join(root, 'refused');
    fs.mkdirSync(sibling); fs.mkdirSync(refused);
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(dataDir);
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createSessionMetadataStore({ dataDir, database: db, closeDatabase: true });
    const readLegacySessionProjection = vi.fn(async (id, { directory }) => ({
      id, location: { directory }, metadata: { openchamber: { assist: { recap: id } } },
    }));
    const { validateDirectoryPath } = createProjectDirectoryRuntime({
      fsPromises: fs.promises, path, normalizeDirectoryPath: (value) => value,
      refuseDirectory: (candidate) => candidate === refused ? 'Directory belongs to an isolated space' : null,
    });
    try {
      const { app } = createApp({ sessionMetadataStore: store, readLegacySessionProjection, validateDirectoryPath });
      const response = await request(app).post('/api/openchamber/sessions/metadata/import').send({
        intent: 'operational-metadata-conversion', consent: true, source: 'scope',
        sessions: [{ id: 'refused', directory: refused }, { id: 'nonexistent', directory: path.join(root, 'missing') }, { id: 'unscoped' }, { id: 'valid', directory: sibling }, { id: 'valid', directory: refused }],
      }).expect(200);
      expect(response.body).toEqual({
        complete: false, errors: { refused: 'METADATA_READ_FAILED', nonexistent: 'METADATA_READ_FAILED', unscoped: 'METADATA_READ_FAILED' },
        results: [{ id: 'valid', status: 'imported' }],
      });
      expect(readLegacySessionProjection).toHaveBeenCalledTimes(1);
      expect(readLegacySessionProjection).toHaveBeenCalledWith('valid', { directory: fs.realpathSync(sibling) });
      for (const id of ['refused', 'nonexistent', 'unscoped']) {
        expect(db.prepare('SELECT session_id FROM session_metadata WHERE session_id = ?').get(id)).toBeUndefined();
        expect(db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get(JSON.stringify(['selected', 'scope', id]))).toBeUndefined();
      }
      await expect(store.get('valid')).resolves.toEqual({ directory: fs.realpathSync(sibling), openchamber: { assist: { recap: 'valid' } } });
    } finally { await store.close(); fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('rechecks canonical selected aliases against Host refusal before reading', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-import-refused-alias-'));
    const refusedTarget = path.join(root, 'refused-target');
    const refusedAlias = path.join(root, 'refused-alias');
    const sibling = path.join(root, 'sibling');
    fs.mkdirSync(refusedTarget); fs.symlinkSync(refusedTarget, refusedAlias, 'dir'); fs.mkdirSync(sibling);
    const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir);
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createSessionMetadataStore({ dataDir, database: db, closeDatabase: true });
    const readLegacySessionProjection = vi.fn(async (id, { directory }) => ({ id, location: { directory }, metadata: { openchamber: { assist: { recap: id } } } }));
    const { validateDirectoryPath } = createProjectDirectoryRuntime({
      fsPromises: fs.promises, path, normalizeDirectoryPath: (value) => value,
      refuseDirectory: (candidate) => candidate === refusedTarget ? 'Directory belongs to an isolated space' : null,
    });
    try {
      const { app } = createApp({ sessionMetadataStore: store, readLegacySessionProjection, validateDirectoryPath });
      const response = await request(app).post('/api/openchamber/sessions/metadata/import').send({
        intent: 'operational-metadata-conversion', consent: true, source: 'refused-alias',
        sessions: [{ id: 'refused', directory: refusedAlias }, { id: 'sibling', directory: sibling }],
      }).expect(200);
      expect(response.body).toEqual({ complete: false, errors: { refused: 'METADATA_READ_FAILED' }, results: [{ id: 'sibling', status: 'imported' }] });
      expect(readLegacySessionProjection).toHaveBeenCalledTimes(1);
      expect(readLegacySessionProjection).toHaveBeenCalledWith('sibling', { directory: fs.realpathSync(sibling) });
      expect(db.prepare('SELECT session_id FROM session_metadata WHERE session_id = ?').get('refused')).toBeUndefined();
      expect(db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get(JSON.stringify(['selected', 'refused-alias', 'refused']))).toBeUndefined();
    } finally { await store.close(); fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('forwards and imports only the canonical selected directory when the request uses a symlink', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-import-realpath-'));
    const selected = path.join(root, 'selected');
    const alias = path.join(root, 'alias');
    fs.mkdirSync(selected); fs.symlinkSync(selected, alias, 'dir');
    const store = createSessionMetadataStore({ dataDir: path.join(root, 'data') });
    const readLegacySessionProjection = vi.fn(async (id) => ({
      id, location: { directory: alias }, directory: alias,
      metadata: { directory: alias, openchamber: { assist: { recap: 'canonical' }, unsupported: 'not retained' } },
    }));
    const { validateDirectoryPath } = createProjectDirectoryRuntime({ fsPromises: fs.promises, path, normalizeDirectoryPath: (value) => value });
    try {
      const { app } = createApp({ sessionMetadataStore: store, readLegacySessionProjection, validateDirectoryPath });
      const body = { intent: 'operational-metadata-conversion', consent: true, source: 'realpath', sessions: [{ id: 'canonical', directory: alias }] };
      await request(app).post('/api/openchamber/sessions/metadata/import').send(body)
        .expect(200, { complete: true, errors: {}, results: [{ id: 'canonical', status: 'imported' }] });
      expect(readLegacySessionProjection).toHaveBeenCalledWith('canonical', { directory: fs.realpathSync(selected) });
      await expect(store.getState('canonical')).resolves.toEqual({
        metadata: { directory: fs.realpathSync(selected), openchamber: { assist: { recap: 'canonical' } } }, revision: '1',
      });
      await request(app).post('/api/openchamber/sessions/metadata/import').send(body)
        .expect(200, { complete: true, errors: {}, results: [{ id: 'canonical', status: 'already-converted' }] });
    } finally { await store.close(); fs.rmSync(root, { recursive: true, force: true }); }
  });

  it.each([
    ['native sibling scope', (_selected, escaping) => ({ location: { directory: escaping } })],
    ['owning projected sibling scope', (_selected, escaping) => ({ directory: escaping })],
    ['conflicting projected scope', (selected, escaping) => ({ location: { directory: selected }, directory: escaping })],
    ['metadata override scope', (selected, escaping) => ({ location: { directory: selected }, metadata: { directory: escaping } })],
    ['symlink escape', (_selected, _escaping, escapeLink) => ({ location: { directory: escapeLink } })],
    ['missing owning scope', () => ({})],
    ['missing native directory', () => ({ location: {} })],
    ['malformed native directory', () => ({ location: { directory: null } })],
    ['malformed native location with owning directory', (selected) => ({ location: null, directory: selected })],
  ])('rejects %s before import or receipt while a valid sibling succeeds', async (_name, projectionFor) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-import-escape-'));
    const selected = path.join(root, 'selected');
    const escaping = path.join(root, 'selected-sibling');
    const escapeLink = path.join(selected, 'outside');
    fs.mkdirSync(selected); fs.mkdirSync(escaping); fs.symlinkSync(escaping, escapeLink, 'dir');
    const dataDir = path.join(root, 'data');
    fs.mkdirSync(dataDir);
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createSessionMetadataStore({ dataDir, database: db, closeDatabase: true });
    const readLegacySessionProjection = vi.fn(async (id, { directory }) => id === 'escape'
      ? { id, ...projectionFor(selected, escaping, escapeLink) }
      : { id, location: { directory }, metadata: { openchamber: { assist: { recap: id } } } });
    const { validateDirectoryPath } = createProjectDirectoryRuntime({ fsPromises: fs.promises, path, normalizeDirectoryPath: (value) => value });
    try {
      const { app } = createApp({ sessionMetadataStore: store, readLegacySessionProjection, validateDirectoryPath });
      const body = { intent: 'operational-metadata-conversion', consent: true, source: 'escape', sessions: [{ id: 'escape', directory: selected }, { id: 'sibling', directory: escaping }] };
      const response = await request(app).post('/api/openchamber/sessions/metadata/import').send(body).expect(200);
      expect(response.body).toEqual({ complete: false, errors: { escape: 'METADATA_READ_FAILED' }, results: [{ id: 'sibling', status: 'imported' }] });
      expect(db.prepare('SELECT session_id FROM session_metadata WHERE session_id = ?').get('escape')).toBeUndefined();
      expect(db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get(JSON.stringify(['selected', 'escape', 'escape']))).toBeUndefined();
      await expect(store.get('sibling')).resolves.toEqual({ directory: fs.realpathSync(escaping), openchamber: { assist: { recap: 'sibling' } } });
      expect(readLegacySessionProjection).toHaveBeenNthCalledWith(1, 'escape', { directory: fs.realpathSync(selected) });
      expect(readLegacySessionProjection).toHaveBeenNthCalledWith(2, 'sibling', { directory: fs.realpathSync(escaping) });
      readLegacySessionProjection.mockImplementation(async (id, { directory }) => ({ id, location: { directory } }));
      await request(app).post('/api/openchamber/sessions/metadata/import').send({ ...body, sessions: [{ id: 'escape', directory: selected }] })
        .expect(200, { complete: true, errors: {}, results: [{ id: 'escape', status: 'imported' }] });
    } finally { await store.close(); fs.rmSync(root, { recursive: true, force: true }); }
  });

  it('requires explicit import intent and consent', async () => {
    const { app } = createApp({ readLegacySessionProjection: vi.fn() });
    await request(app).post('/api/openchamber/sessions/metadata/import').send({ source: 'legacy', sessions: [{ id: 'old_1' }] }).expect(400);
  });

  it('returns per-session import errors without transcript access', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-import-partial-'));
    const store = createSessionMetadataStore({ dataDir });
    const readLegacySessionProjection = vi.fn(async (id, { directory }) => id === 'bad' ? null : { id, directory, metadata: { openchamber: { assist: { recap: id } } } });
    try {
      const { app } = createApp({ sessionMetadataStore: store, readLegacySessionProjection });
      const response = await request(app).post('/api/openchamber/sessions/metadata/import').send({ intent: 'operational-metadata-conversion', consent: true, source: 'legacy', sessions: [{ id: 'good', directory: '/repo/app' }, { id: 'bad', directory: '/repo/app' }, { id: 'good_2', directory: '/repo/app' }] }).expect(200);
      expect(response.body).toEqual({ complete: false, errors: { bad: 'METADATA_READ_FAILED' }, results: [{ id: 'good', status: 'imported' }, { id: 'good_2', status: 'imported' }] });
      await expect(store.get('good_2')).resolves.toEqual({ directory: '/repo/app', openchamber: { assist: { recap: 'good_2' } } });
      expect(readLegacySessionProjection).toHaveBeenCalledTimes(3);
      expect(sessionMessagesMock).not.toHaveBeenCalled();
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('creates a session for a directory', async () => {
    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', title: 'Side task' })
      .expect(200);

    expect(response.body.sessionId).toBe('ses_123');
    expect(response.body.directory).toBe('/repo/app');
    expect(response.body.promptDispatched).toBe(false);
    expect(sessionCreateMock).toHaveBeenCalledWith({
      location: { directory: '/repo/app' },
      title: 'Side task',
    });
  });
  it('persists create title, directory, and projectID in the real Host SQLite store before prompt work', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-create-host-'));
    const store = createSessionMetadataStore({ dataDir });
    try {
      const { app } = createApp({ sessionMetadataStore: store });
      await request(app).post('/api/openchamber/sessions').send({ projectId: 'proj_1', directory: '/repo/app', title: 'Durable title' }).expect(200);
      await expect(store.getState('ses_123')).resolves.toEqual({
        metadata: { title: 'Durable title', directory: '/repo/app', projectID: 'proj_1' }, revision: '1',
      });
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('returns a partial session-created response when real Host persistence fails', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-create-failure-'));
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createSessionMetadataStore({ dataDir, database: db, closeDatabase: true });
    await store.convertLegacy();
    db.exec('PRAGMA query_only = ON');
    try {
      const { app } = createApp({ sessionMetadataStore: store });
      const response = await request(app).post('/api/openchamber/sessions').send({ directory: '/repo/app', title: 'Partial' }).expect(500);
      expect(response.body).toMatchObject({ partial: true, partialAction: 'session-created', sessionId: 'ses_123', code: 'METADATA_WRITE_FAILED' });
      expect(sessionCreateMock).toHaveBeenCalledTimes(1);
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('lets an injected persistence callback own exactly one broadcast', async () => {
    const broadcastGlobalUiEvent = vi.fn();
    const persistSessionMetadata = vi.fn(async () => ({ metadata: { title: 'owned' }, revision: '7', changed: true }));
    const { app, sessionMetadataStore } = createApp({ persistSessionMetadata, broadcastGlobalUiEvent });
    await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: { title: 'owned' } }).expect(200);
    expect(persistSessionMetadata).toHaveBeenCalledTimes(1);
    expect(broadcastGlobalUiEvent).not.toHaveBeenCalled();
    await expect(sessionMetadataStore.get('ses_a')).resolves.toBeNull();
  });

  it('broadcasts exactly once for changed local SQLite writes and not for no-op writes', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-local-broadcast-'));
    const store = createSessionMetadataStore({ dataDir });
    try {
      const { app, broadcastGlobalUiEvent } = createApp({ sessionMetadataStore: store });
      await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: { title: 'local' } }).expect(200);
      await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: { title: 'local' } }).expect(200);
      expect(broadcastGlobalUiEvent).toHaveBeenCalledTimes(1);
      await expect(store.getState('ses_a')).resolves.toEqual({ metadata: { title: 'local' }, revision: '1' });
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('preserves revisions and broadcasts for semantically equal nested metadata with reordered object keys', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-semantic-noop-'));
    const store = createSessionMetadataStore({ dataDir });
    try {
      const { app, broadcastGlobalUiEvent } = createApp({ sessionMetadataStore: store });
      const first = await request(app).post('/api/openchamber/sessions/ses_a/metadata')
        .send({ patch: { openchamber: { goal: { id: 'g1' }, assist: { recap: 'known', tags: ['one', 'two'] } } } }).expect(200);
      const second = await request(app).post('/api/openchamber/sessions/ses_a/metadata')
        .send({ patch: { openchamber: { assist: { tags: ['one', 'two'], recap: 'known' }, goal: { id: 'g1' } } } }).expect(200);
      expect(second.body).toEqual({ metadata: first.body.metadata, revision: '1', changed: false });
      expect(broadcastGlobalUiEvent).toHaveBeenCalledTimes(1);
      await expect(store.getState('ses_a')).resolves.toEqual({ metadata: first.body.metadata, revision: '1' });
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('imports selected projections with durable per-ID receipts, including a new ID from the same source', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-import-host-'));
    const store = createSessionMetadataStore({ dataDir });
    const readLegacySessionProjection = vi.fn(async (id, options) => ({ id, directory: options.directory, title: `Title ${id}`, metadata: { openchamber: { assist: { recap: id } } } }));
    try {
      const { app } = createApp({ sessionMetadataStore: store, readLegacySessionProjection });
      const body = { intent: 'operational-metadata-conversion', consent: true, source: 'legacy-v1', sessions: [{ id: 'old_a', directory: '/a' }] };
      await request(app).post('/api/openchamber/sessions/metadata/import').send(body).expect(200, { results: [{ id: 'old_a', status: 'imported' }], errors: {}, complete: true });
      await request(app).post('/api/openchamber/sessions/metadata/import').send(body).expect(200, { results: [{ id: 'old_a', status: 'already-converted' }], errors: {}, complete: true });
      await request(app).post('/api/openchamber/sessions/metadata/import').send({ ...body, sessions: [{ id: 'old_b', directory: '/b' }] }).expect(200, { results: [{ id: 'old_b', status: 'imported' }], errors: {}, complete: true });
      await expect(store.get('old_b')).resolves.toMatchObject({ title: 'Title old_b', directory: '/b' });
      expect(readLegacySessionProjection).toHaveBeenNthCalledWith(1, 'old_a', { directory: '/a' });
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('percent-encodes the directory header for non-ASCII checkout paths', async () => {
    const { app } = createApp();
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/home/user/Masaüstü/projeler', title: 'Side task' })
      .expect(200);

    expect(clientOptions.at(-1)?.headers['x-opencode-directory'])
      .toBe(encodeURIComponent('/home/user/Masaüstü/projeler'));
  });

  it('parses JSON body without global middleware', async () => {
    const { app } = createApp({}, { globalJson: false });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app' })
      .expect(200);

    expect(response.body.sessionId).toBe('ses_123');
    expect(response.body.directory).toBe('/repo/app');
  });

  it('emits a session-created event after creating a session', async () => {
    const emitSessionCreatedEvent = vi.fn();
    const { app } = createApp({ emitSessionCreatedEvent });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', title: 'Side task' })
      .expect(200);

    expect(emitSessionCreatedEvent).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: 'ses_123',
      directory: '/repo/app',
      title: 'Side task',
      promptDispatched: false,
      dispatchedAsCommand: false,
    }));
  });

  it('resolves a default agent stored by v1 under its display name', async () => {
    useCatalog({ agents: [{ id: 'build', name: 'Build', mode: 'primary' }, { id: 'plan', name: 'Plan', mode: 'primary' }] });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultAgent: 'Plan',
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });

    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' })
      .expect(200);

    expect(response.body.agent).toBe('plan');
  });

  it('resolves default model and agent when prompt omits them', async () => {
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openai/gpt-5.5',
        defaultAgent: 'build',
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(response.body.agent).toBe('build');
    expect(modelListMock).toHaveBeenCalled();
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'gpt-5.5', providerID: 'openai' },
    });
    expect(sessionSwitchAgentMock).toHaveBeenCalledWith({ sessionID: 'ses_123', agent: 'build' });
  });

  it('skips a model hidden in the picker when nothing names a model (#1801)', async () => {
    useCatalog({
      models: [{ id: 'big-pickle', modelID: 'big-pickle', providerID: 'opencode', variants: [] }, ...CATALOG_MODELS],
    });
    const hiddenModels = [{ providerID: 'opencode', modelID: 'big-pickle' }];
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({ hiddenModels, projects: [{ id: 'proj_1', path: '/repo/app' }] }),
    });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' })
      .expect(200);
    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });

    // A default the user chose stays, hidden or not.
    const { app: configured } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'opencode/big-pickle',
        hiddenModels,
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    const configuredResponse = await request(configured)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' })
      .expect(200);
    expect(configuredResponse.body.model).toEqual({ providerID: 'opencode', modelID: 'big-pickle' });
  });

  it('starts on the model last picked in a chat when nothing names one (#1801)', async () => {
    useCatalog({
      models: [{ id: 'big-pickle', modelID: 'big-pickle', providerID: 'opencode', variants: [] }, ...CATALOG_MODELS],
    });
    const project = { projects: [{ id: 'proj_1', path: '/repo/app' }] };
    const create = async (settings, routing = {}) => {
      const { app } = createApp({ readSettingsFromDiskMigrated: async () => ({ ...project, ...settings }), ...routing });
      const response = await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/repo/app', prompt: 'Run this' })
        .expect(200);
      return response.body.model;
    };

    expect(await create({ lastSelectedModel: 'anthropic/claude-sonnet-5' }))
      .toEqual({ providerID: 'anthropic', modelID: 'claude-sonnet-5' });
    // Kept through a catalog gap, like a saved default.
    expect(await create({ lastSelectedModel: 'claude-code/opus' }))
      .toEqual({ providerID: 'claude-code', modelID: 'opus' });
    // A configured default outranks it.
    expect(await create({ lastSelectedModel: 'anthropic/claude-sonnet-5', defaultModel: 'openai/gpt-5.5' }))
      .toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    // Hidden since it was picked: skipped.
    expect(await create({
      lastSelectedModel: 'anthropic/claude-sonnet-5',
      hiddenModels: [{ providerID: 'anthropic', modelID: 'claude-sonnet-5' }],
    })).toEqual({ providerID: 'opencode', modelID: 'big-pickle' });
    // Auto on a server without routing, or with routing that cannot run it
    // now: skipped instead of refusing the request.
    expect(await create({ lastSelectedModel: 'openchamber/auto' }))
      .toEqual({ providerID: 'opencode', modelID: 'big-pickle' });
    const resolveAutoSelection = vi.fn(async () => ({ model: { providerID: 'openai', id: 'gpt-5.5' }, agent: 'build', decision: {} }));
    expect(await create({ lastSelectedModel: 'openchamber/auto' }, { resolveAutoSelection, isAutoReady: async () => false }))
      .toEqual({ providerID: 'opencode', modelID: 'big-pickle' });
    expect(resolveAutoSelection).not.toHaveBeenCalled();
    expect(await create({ lastSelectedModel: 'openchamber/auto' }, { resolveAutoSelection, isAutoReady: async () => true }))
      .toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
  });

  it('resolves an Auto default through the routing hook before switching the session', async () => {
    useCatalog();
    const resolveAutoSelection = vi.fn(async () => ({
      model: { providerID: 'openai', id: 'gpt-5.5', variant: 'high' },
      agent: 'plan',
      decision: {},
    }));
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openchamber/auto',
        defaultAgent: 'build',
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
      resolveAutoSelection,
    });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' })
      .expect(200);

    expect(resolveAutoSelection).toHaveBeenCalledWith({
      sessionId: 'ses_123',
      directory: '/repo/app',
      model: { providerID: 'openchamber', id: 'auto' },
      agent: 'build',
      requestText: 'Run this',
    });
    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(response.body.agent).toBe('plan');
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'gpt-5.5', providerID: 'openai', variant: 'high' },
    });
    expect(sessionSwitchAgentMock).toHaveBeenCalledWith({ sessionID: 'ses_123', agent: 'plan' });
  });

  it('refuses an Auto default when routing is not wired in', async () => {
    useCatalog();
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openchamber/auto',
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/not available/);
    expect(sessionSwitchModelMock).not.toHaveBeenCalled();
  });

  it.each([
    ['', { projectId: 'proj_1' }],
    ['', { directory: '/repo/app', worktree: { name: 'side-task' } }],
    ['', { directory: '/repo/worktrees/side-task' }],
    ['/ses_existing/send', { directory: '/repo/worktrees/side-task' }],
    ['/ses_existing/fork', { directory: '/repo/worktrees/side-task' }],
  ])('prefers project defaults for %s with %j', async (endpoint, scope) => {
    useCatalog();
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openai/gpt-5.5',
        defaultAgent: 'build',
        projects: [{ id: 'proj_1', path: '/repo/app', defaultAgent: 'plan' }],
      }),
    });

    const response = await request(app)
      .post(`/api/openchamber/sessions${endpoint}`)
      .send({ ...scope, prompt: 'Run this' })
      .expect(200);

    expect(response.body.agent).toBe('plan');
    // v2 puts the agent on the session, not in the prompt body.
    expect(sessionSwitchAgentMock).toHaveBeenCalledWith(expect.objectContaining({ agent: 'plan' }));
  });

  it('dispatches an initial prompt when model is provided', async () => {
    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5' })
      .expect(200);

    expect(response.body.sessionId).toBe('ses_123');
    expect(response.body.promptDispatched).toBe(true);
    expect(sessionPromptMock).toHaveBeenCalledWith({ sessionID: 'ses_123', text: 'Run this' });
  });

  it('rejects a successful HTML response instead of reporting the prompt as dispatched', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url) => {
      if (String(url).endsWith('/prompt')) {
        return new Response('<!doctype html><title>OpenChamber</title>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      throw new Error('Unexpected transport request');
    });
    sessionPromptMock.mockImplementationOnce(async () => {
      const options = clientOptions.at(-1);
      await options.fetch(`${options.baseUrl}/api/session/ses_123/prompt`, { method: 'POST', body: '{"text":"Run this"}' });
    });
    try {
      const { app } = createApp();
      await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5' })
        .expect(500);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('creates goal metadata before dispatching the initial goal prompt', async () => {
    const createSessionGoal = vi.fn(async () => undefined);
    const { app } = createApp({ createSessionGoal });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({
        directory: '/repo/app',
        prompt: 'Finish and verify the migration',
        model: 'openai/gpt-5.5',
        goal: true,
        goalTokenBudget: 200000,
      })
      .expect(200);

    expect(createSessionGoal).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: 'ses_123',
      directory: '/repo/app',
      objective: 'Finish and verify the migration',
      tokenBudget: 200000,
      providerID: 'openai',
      modelID: 'gpt-5.5',
    }));
    expect(createSessionGoal.mock.invocationCallOrder[0])
      .toBeLessThan(sessionPromptMock.mock.invocationCallOrder[0]);
    // v2 cannot append to a message, so the goal reminder follows the prompt as
    // its own synthetic message.
    expect(sessionPromptMock).toHaveBeenCalledWith({ sessionID: 'ses_123', text: 'Finish and verify the migration' });
    expect(sessionSyntheticMock).toHaveBeenCalledWith(expect.objectContaining({ sessionID: 'ses_123', resume: false }));
    expect(sessionPromptMock.mock.invocationCallOrder[0])
      .toBeLessThan(sessionSyntheticMock.mock.invocationCallOrder[0]);
    expect(response.body).toMatchObject({ goalEnabled: true, goalTokenBudget: 200000, promptDispatched: true });
  });

  it('rejects invalid goal requests before creating a session', async () => {
    const { app } = createApp();
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', goal: true })
      .expect(400, { error: 'prompt is required when goal is enabled' });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run', goalTokenBudget: 200000 })
      .expect(400, { error: 'goalTokenBudget requires goal' });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run', goal: true, goalTokenBudget: 999 })
      .expect(400, { error: 'goalTokenBudget must be an integer from 1000 to 100000000' });

    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('creates a worktree before creating a session', async () => {
    createWorktreeMock.mockImplementationOnce(async (_directory, _input, options) => {
      await options.hydrateCheckout({ directory: '/repo/worktrees/side-task', parentRemoteName: '' });
      return {
        head: 'abc123',
        name: 'side-task',
        branch: 'openchamber/side-task',
        path: '/repo/worktrees/side-task',
      };
    });
    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({
        directory: '/repo/app',
        worktree: { name: 'side-task', branchName: 'openchamber/side-task', startRef: 'main' },
        setUpstream: false,
        prompt: 'Run this',
        model: 'openai/gpt-5.5',
      })
      .expect(200);

    expect(createWorktreeMock).toHaveBeenCalledWith('/repo/app', {
      mode: 'new',
      name: 'side-task',
      branchName: 'openchamber/side-task',
      startRef: 'main',
      setUpstream: false,
    }, {
      bootstrapStore: worktreeBootstrapStore,
      hydrateCheckout: expect.any(Function),
    });
    expect(hydrateWorktreeCheckoutMock).toHaveBeenCalledWith({
      directory: '/repo/worktrees/side-task',
      parentDirectory: '/repo/app',
      parentRemoteName: '',
    });
    expect(getWorktreeBootstrapStatusMock).toHaveBeenCalledWith(
      '/repo/worktrees/side-task',
      { bootstrapStore: worktreeBootstrapStore },
    );
    expect(response.body.directory).toBe('/repo/worktrees/side-task');
    expect(response.body.worktree.path).toBe('/repo/worktrees/side-task');
    expect(sessionCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      location: { directory: '/repo/worktrees/side-task' },
    }));
    expect(sessionPromptMock).toHaveBeenCalledWith({ sessionID: 'ses_123', text: 'Run this' });
  });

  it('waits for the worktree bootstrap to complete before creating the session', async () => {
    const statuses = [
      { status: 'pending', phase: 'directory-created', error: null, updatedAt: 1 },
      { status: 'pending', phase: 'git-ready', error: null, updatedAt: 2 },
      { status: 'ready', phase: 'setup-ready', error: null, updatedAt: 3 },
    ];
    getWorktreeBootstrapStatusMock.mockImplementation(async () => statuses.shift() || statuses[statuses.length - 1]);

    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({
        directory: '/repo/app',
        worktree: { name: 'side-task' },
        prompt: 'Run this',
        model: 'openai/gpt-5.5',
      })
      .expect(200);

    expect(response.body.promptDispatched).toBe(true);
    expect(getWorktreeBootstrapStatusMock).toHaveBeenCalled();
    expect(getWorktreeBootstrapStatusMock.mock.invocationCallOrder[0])
      .toBeLessThan(sessionCreateMock.mock.invocationCallOrder[0]);
    expect(sessionCreateMock.mock.invocationCallOrder[0])
      .toBeLessThan(sessionPromptMock.mock.invocationCallOrder[0]);
  });

  it('fails the create when the worktree bootstrap failed', async () => {
    getWorktreeBootstrapStatusMock.mockImplementation(async () => ({
      status: 'failed',
      phase: 'directory-created',
      error: 'branch already exists',
      updatedAt: Date.now(),
    }));

    const { app } = createApp();
    await request(app)
      .post('/api/openchamber/sessions')
      .send({
        directory: '/repo/app',
        worktree: { name: 'side-task' },
        prompt: 'Run this',
        model: 'openai/gpt-5.5',
      })
      .expect(500, { error: 'Worktree bootstrap failed: branch already exists' });

    expect(sessionPromptMock).not.toHaveBeenCalled();
  });

  it('starts the session in a worktree made from a pull request', async () => {
    const createChangeRequestWorktree = vi.fn(async () => ({
      name: 'feature-fix', branch: 'feature/fix', path: '/repo/worktrees/feature-fix',
      provenance: { kind: 'contributor-fork' },
    }));
    const { app } = createApp({ createChangeRequestWorktree });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', pullRequest: 42, worktree: { name: 'review-42' }, prompt: 'Review it', model: 'openai/gpt-5.5' })
      .expect(200);

    expect(createChangeRequestWorktree).toHaveBeenCalledExactlyOnceWith({ directory: '/repo/app', number: 42, name: 'review-42' });
    expect(createWorktreeMock).not.toHaveBeenCalled();
    expect(getWorktreeBootstrapStatusMock.mock.invocationCallOrder[0])
      .toBeLessThan(sessionCreateMock.mock.invocationCallOrder[0]);
    expect(sessionCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      location: { directory: '/repo/worktrees/feature-fix' },
    }));
    expect(response.body.directory).toBe('/repo/worktrees/feature-fix');
    expect(response.body.worktree.branch).toBe('feature/fix');
  });

  it('refuses a pull request it cannot make a worktree for and creates no session', async () => {
    const notFound = Object.assign(new Error('Pull request #42 was not found in acme/app'), { status: 404 });
    const { app } = createApp({ createChangeRequestWorktree: vi.fn(async () => { throw notFound; }) });

    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', pullRequest: 42, prompt: 'Review it' })
      .expect(404, { error: 'Pull request #42 was not found in acme/app' });

    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(getWorktreeBootstrapStatusMock).not.toHaveBeenCalled();
  });

  it('refuses a pull request where contributor worktrees are not served, with no plain worktree instead', async () => {
    const { app } = createApp();

    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', pullRequest: 42 })
      .expect(501, { error: 'Worktrees from pull requests are not available here' });

    expect(createWorktreeMock).not.toHaveBeenCalled();
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed pull request number or a start ref beside it', async () => {
    const createChangeRequestWorktree = vi.fn();
    const { app } = createApp({ createChangeRequestWorktree });

    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', pullRequest: '#42' })
      .expect(400, { error: 'pullRequest must be a pull or merge request number, such as 42' });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', pullRequest: 42, worktree: { startRef: 'main' } })
      .expect(400, { error: 'pullRequest checks out the pull request\'s own branch; do not combine it with startRef or setUpstream' });

    expect(createChangeRequestWorktree).not.toHaveBeenCalled();
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('does not treat a missing bootstrap record as ready', async () => {
    getWorktreeBootstrapStatusMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        status: 'failed',
        phase: 'directory-created',
        error: 'Bootstrap state is missing',
        updatedAt: Date.now(),
      });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'ses_123' }) }));
    try {
      const { app } = createApp();
      await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/repo/app', worktree: { name: 'side-task' } })
        .expect(500, { error: 'Worktree bootstrap failed: Bootstrap state is missing' });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('sends a goal prompt to an existing session after creating goal metadata', async () => {
    const createSessionGoal = vi.fn(async () => undefined);
    setSessionMessages([{ id: 'msg_before', type: 'assistant', time: { created: 10, completed: 20 } }]);

    const { app } = createApp({ createSessionGoal });
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({
        directory: '/repo/app',
        prompt: 'Apply and verify the review feedback',
        model: 'openai/gpt-5.5',
        agent: 'build',
        variant: 'high',
        goal: true,
        goalTokenBudget: 200000,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      action: 'send',
      sessionId: 'ses_source',
      directory: '/repo/app',
      promptDispatched: true,
      goalEnabled: true,
      baselineAssistantMessageId: 'msg_before',
    });
    expect(createSessionGoal).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: 'ses_source',
      directory: '/repo/app',
      objective: 'Apply and verify the review feedback',
    }));
    expect(sessionPromptMock).toHaveBeenCalledWith({
      sessionID: 'ses_source',
      text: 'Apply and verify the review feedback',
    });
    expect(createSessionGoal.mock.invocationCallOrder[0])
      .toBeLessThan(sessionPromptMock.mock.invocationCallOrder[0]);
  });

  it('dispatches a slash command and keeps the typed prompt as the goal objective', async () => {
    // v2 no longer publishes a command's template (`CommandInfo` is just name
    // and description), so the objective is what the user typed.
    const createSessionGoal = vi.fn(async () => undefined);
    commandListMock.mockResolvedValue({ data: [{ name: 'issue--to-pr', description: 'Issue to PR' }] });

    const { app } = createApp({ createSessionGoal });
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({
        directory: '/repo/app',
        prompt: '/issue--to-pr LIN-123',
        model: 'openai/gpt-5.5',
        agent: 'build',
        goal: true,
      })
      .expect(200);

    expect(createSessionGoal).toHaveBeenCalledWith(expect.objectContaining({
      objective: '/issue--to-pr LIN-123',
    }));
    expect(sessionCommandMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'issue--to-pr',
      text: 'LIN-123',
    }));
    expect(createSessionGoal.mock.invocationCallOrder[0])
      .toBeLessThan(sessionCommandMock.mock.invocationCallOrder[0]);
    expect(response.body).toMatchObject({ goalEnabled: true, dispatchedAsCommand: true });
    expect(sessionPromptMock).not.toHaveBeenCalled();
  });

  it('admits standing project context ahead of a dispatched slash command', async () => {
    commandListMock.mockResolvedValue({ data: [{ name: 'review', description: 'Review' }] });
    const recordDelivered = vi.fn(async () => undefined);
    const sessionKnowledgeRuntime = {
      resolvePendingForSession: vi.fn(async () => ({ text: 'Memory guidance', signature: 'sig_1' })),
      recordDelivered,
    };

    const { app } = createApp({ sessionKnowledgeRuntime });
    await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: '/review', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);

    expect(sessionSyntheticMock).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Memory guidance',
      resume: false,
    }));
    expect(sessionSyntheticMock.mock.invocationCallOrder[0])
      .toBeLessThan(sessionCommandMock.mock.invocationCallOrder[0]);
    expect(recordDelivered).toHaveBeenCalledWith('ses_source', '/repo/app', 'sig_1');
  });

  it('reuses the previous session selection when send omits model, agent, and variant', async () => {
    // v2 keeps the selection on the session record, so the history is no longer
    // walked for it.
    sessionGetMock.mockImplementation(async ({ sessionID }) => ({
      id: sessionID,
      agent: 'plan',
      model: { providerID: 'anthropic', id: 'claude-sonnet-5', variant: 'high' },
      location: { directory: '/repo/app' },
    }));
    setSessionMessages([{ id: 'msg_before', type: 'assistant', time: { created: 10, completed: 20 } }]);

    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue where you left off' })
      .expect(200);

    expect(response.body).toMatchObject({
      action: 'send',
      sessionId: 'ses_source',
      model: { providerID: 'anthropic', modelID: 'claude-sonnet-5' },
      agent: 'plan',
      variant: 'high',
      promptDispatched: true,
    });
    // The default-selection catalogue must not be consulted.
    expect(modelListMock).not.toHaveBeenCalled();
    expect(agentListMock).not.toHaveBeenCalled();
  });

  it('forks from a message, dispatches the prompt, and emits the new session', async () => {
    const emitSessionCreatedEvent = vi.fn();
    const { app } = createApp({ emitSessionCreatedEvent });
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/fork')
      .send({
        directory: '/repo/app',
        messageId: 'msg_branch_point',
        prompt: 'Try the alternative implementation',
        model: 'openai/gpt-5.5',
        agent: 'build',
        variant: 'high',
      })
      .expect(200);

    expect(sessionForkMock).toHaveBeenCalledWith({
      sessionID: 'ses_source',
      before: 'msg_branch_point',
    });
    expect(response.body).toMatchObject({
      action: 'fork',
      sourceSessionId: 'ses_source',
      sessionId: 'ses_fork',
      directory: '/repo/app',
      promptDispatched: true,
    });
    expect(sessionPromptMock).toHaveBeenCalledWith({ sessionID: 'ses_fork', text: 'Try the alternative implementation' });
    expect(emitSessionCreatedEvent).toHaveBeenCalledWith(expect.objectContaining({
      sessionID: 'ses_fork',
      sourceSessionID: 'ses_source',
      directory: '/repo/app',
      promptDispatched: true,
    }));
  });
  it('forks Host metadata, ignores execution fork.metadata, strips source links, and pauses active goals', async () => {
    sessionForkMock.mockImplementationOnce(async () => ({ id: 'ses_fork', title: 'Execution title', metadata: { openchamber: { executionOnly: true } } }));
    const { app, sessionMetadataStore } = createApp();
    sessionMetadataStore.entries.set('ses_source', {
      title: 'Host source title', directory: '/repo/source', projectID: 'project-source',
      openchamber: { btwSessionID: 'ses_btw', reviewSessionID: 'ses_review', goal: { id: 'g1', objective: 'Ship', status: 'active' }, custom: 'keep' },
    });
    await request(app).post('/api/openchamber/sessions/ses_source/fork').send({ directory: '/repo/app', prompt: 'Carry on', model: 'openai/gpt-5.5', agent: 'build' }).expect(200);
    expect(sessionMetadataStore.entries.get('ses_fork')).toEqual({
      title: 'Host source title', directory: '/repo/app', projectID: 'project-source',
      openchamber: { goal: { id: 'g1', objective: 'Ship', status: 'paused', statusReason: 'paused in fork' }, custom: 'keep' },
    });
    expect(sessionMetadataStore.entries.get('ses_fork').openchamber.executionOnly).toBeUndefined();
  });


  it('strips source-owned links from a fork before dispatching', async () => {
    sessionForkMock.mockImplementationOnce(async () => ({
      id: 'ses_fork',
      title: 'Forked session',
      metadata: { openchamber: { btwSessionID: 'ses_btw', reviewSessionID: 'ses_review', assist: { recap: 'kept' } } },
    }));
    const { app, sessionMetadataStore } = createApp();
    sessionMetadataStore.entries.set('ses_source', {
      openchamber: { btwSessionID: 'ses_btw', reviewSessionID: 'ses_review', assist: { recap: 'kept' } },
    });
    await request(app)
      .post('/api/openchamber/sessions/ses_source/fork')
      .send({ directory: '/repo/app', prompt: 'Carry on', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);

    expect(sessionMetadataStore.entries.get('ses_fork')).toEqual({ directory: '/repo/app', openchamber: { assist: { recap: 'kept' } } });
  });

  it('rejects send and fork requests without a prompt before calling OpenCode', async () => {
    const { app } = createApp();
    await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app' })
      .expect(400, { error: 'prompt is required' });
    await request(app)
      .post('/api/openchamber/sessions/ses_source/fork')
      .send({ directory: '/repo/app' })
      .expect(400, { error: 'prompt is required' });

    expect(sessionForkMock).not.toHaveBeenCalled();
    expect(sessionPromptMock).not.toHaveBeenCalled();
  });

  it('reports the forked session when prompt dispatch fails', async () => {
    sessionPromptMock.mockRejectedValue(new Error('dispatch failed'));

    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/fork')
      .send({
        directory: '/repo/app',
        prompt: 'Try another approach',
        model: 'openai/gpt-5.5',
        agent: 'build',
        variant: 'high',
      })
      .expect(500);

    expect(response.body).toMatchObject({
      partial: true,
      partialAction: 'fork-created',
      sessionId: 'ses_fork',
      directory: '/repo/app',
    });
  });

  it('does not apply a default variant to an explicitly requested model', async () => {
    useCatalog({
      models: [
        { id: 'requested', modelID: 'requested', providerID: 'openai', variants: [] },
        { id: 'default', modelID: 'default', providerID: 'openai', variants: [{ id: 'high' }] },
      ],
    });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openai/default',
        defaultVariant: 'high',
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue', model: 'openai/requested', agent: 'build' })
      .expect(200);

    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_source',
      model: { id: 'requested', providerID: 'openai' },
    });
  });

  it('applies the config default model variant when the prompt omits a model', async () => {
    useCatalog({
      config: [{
        type: 'document',
        info: { model: { providerID: 'openai', model: 'gpt-5.5', variant: 'high' } },
      }],
    });
    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'gpt-5.5', providerID: 'openai', variant: 'high' },
    });
  });

  it('applies the config default model variant from the string spelling', async () => {
    useCatalog({
      config: [{
        type: 'document',
        info: { model: 'openai/gpt-5.5#high' },
      }],
    });
    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'gpt-5.5', providerID: 'openai', variant: 'high' },
    });
  });

  it('rejects an unknown agent before creating a session or worktree', async () => {
    const { app } = createApp();
    await request(app)
      .post('/api/openchamber/sessions')
      .send({
        directory: '/repo/app',
        prompt: 'Run this',
        agent: 'not-an-agent',
        worktree: { name: 'side-task' },
      })
      .expect(400, { error: "Unknown agent 'not-an-agent' for /repo/app" });

    expect(createWorktreeMock).not.toHaveBeenCalled();
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(sessionPromptMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown model and an unknown variant before dispatching', async () => {
    const { app } = createApp();
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-nope' })
      .expect(400, { error: "Unknown model 'openai/gpt-nope' for /repo/app" });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5', variant: 'ultra' })
      .expect(400, { error: "Unknown variant 'ultra' for model 'openai/gpt-5.5'" });

    expect(sessionPromptMock).not.toHaveBeenCalled();
  });

  it('reports promptDispatched false when the accepted prompt returns no queued message', async () => {
    // v2 answers a prompt with the inbox item it recorded; no id means nothing
    // is queued, so the dispatch must not be reported as done.
    sessionPromptMock.mockResolvedValue({});

    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5' })
      .expect(200);

    expect(response.body.sessionId).toBe('ses_123');
    expect(response.body.promptDispatched).toBe(false);
    expect(response.body.promptError).toBeTruthy();
  }, 20_000);

  it('does not retry a failed slash command as a normal prompt', async () => {
    commandListMock.mockResolvedValue({ data: [{ name: 'review' }] });
    sessionCommandMock.mockRejectedValue(new Error('command response failed'));

    const { app } = createApp();
    await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({
        directory: '/repo/app',
        prompt: '/review fix this',
        model: 'openai/gpt-5.5',
        agent: 'build',
        variant: 'high',
      })
      .expect(500);

    expect(sessionCommandMock).toHaveBeenCalledTimes(1);
    expect(sessionPromptMock).not.toHaveBeenCalled();
  });
});

describe('openchamber session service directory resolution', () => {
  const createService = async (overrides = {}) => {
    const { createOpenChamberSessionService } = await import('./routes.js');
    return createOpenChamberSessionService({
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
      readSettingsFromDiskMigrated: async () => ({ projects: [{ id: 'proj_1', path: '/repo/app' }] }),
      sanitizeProjects: (projects) => projects,
      validateDirectoryPath: async (directory) => ({ ok: true, directory }),
      buildOpenCodeUrl: (route) => `http://opencode.test${route}`,
      getOpenCodeAuthHeaders: () => ({}),
      ...overrides,
    });
  };

  it('resolves a registered project to its directory', async () => {
    const service = await createService();
    await expect(service.resolveDirectory({ projectId: 'proj_1' })).resolves.toBe('/repo/app');
  });

  it('fails for an unknown project, a missing project folder, or unreadable settings', async () => {
    await expect((await createService()).resolveDirectory({ projectId: 'missing' }))
      .rejects.toMatchObject({ statusCode: 404, message: 'Project not found' });
    const goneFolder = await createService({ validateDirectoryPath: async () => ({ ok: false, error: 'Directory not found' }) });
    await expect(goneFolder.resolveDirectory({ projectId: 'proj_1' }))
      .rejects.toMatchObject({ statusCode: 400, message: 'Directory not found' });
    const unreadable = await createService({ readSettingsFromDiskMigrated: async () => { throw new Error('settings unreadable'); } });
    await expect(unreadable.resolveDirectory({ projectId: 'proj_1' })).rejects.toThrow('settings unreadable');
  });

  it('rejects a slash command SDK failure without falling back to a prompt', async () => {
    sessionCommandMock.mockClear();
    sessionPromptMock.mockClear();
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url) => selectionInputResponse(url));
    commandListMock.mockResolvedValue({ data: [{ name: 'review' }] });
    sessionCommandMock.mockRejectedValueOnce(new Error('command rejected'));
    globalThis.fetch = fetchMock;
    try {
      const { app } = createApp();
      await request(app)
        .post('/api/openchamber/sessions/ses_source/send')
        .send({
          directory: '/repo/app',
          prompt: '/review fix this',
          model: 'openai/gpt-5.5',
          agent: 'build',
        })
        .expect(500);

      expect(sessionCommandMock).toHaveBeenCalledTimes(1);
      expect(sessionPromptMock).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
describe('Host operational session state independence', () => {
  it('keeps admitted metadata and archive operations available when native service is unavailable', async () => {
    const { createOpenChamberSessionService } = await import('./routes.js');
    const archiveStore = createMemoryArchiveStore();
    const sessionMetadataStore = createMemorySessionMetadataStore();
    const admitted = { sessionId: 'ses_admitted', projectId: 'proj_1', workspaceId: 'ws_1', cwd: '/repo/app', agentDirectoryId: 'agent-dir-1', agentDirectory: '/repo/app/.agents' };
    const resolveNativeSessionScope = async () => { throw new Error('native service unavailable'); };
    const service = createOpenChamberSessionService({
      service: { request: resolveNativeSessionScope },
      resolveWorkspaceScope: async () => ({ projectId: 'proj_1', workspaceId: 'ws_1', cwd: '/repo/app', agentDirectoryId: 'agent-dir-1', agentDirectory: '/repo/app/.agents' }),
      resolveSessionScope: resolveNativeSessionScope,
      resolveHostSessionScope: async (sessionId) => sessionId === admitted.sessionId ? admitted : null,
      registerSessionScope: async () => true,
      resolveAttachments: async () => [],
      capturePrompt: async (_scope, request) => request,
      beforeDispatch: async () => {},
      onPromptAccepted: async () => {},
      archiveStore,
      sessionMetadataStore,
    });

    await expect(service.setMetadata(admitted.sessionId, { changes: { notes: 'host-owned' } })).resolves.toMatchObject({ metadata: { notes: 'host-owned' } });
    await expect(service.getMetadata(admitted.sessionId)).resolves.toMatchObject({ metadata: { notes: 'host-owned' } });
    await expect(service.archive({ ids: [admitted.sessionId], archivedAt: 1700 })).resolves.toMatchObject({ archived: [{ id: admitted.sessionId, archivedAt: 1700 }] });
    await expect(service.unarchive({ ids: [admitted.sessionId] })).resolves.toMatchObject({ restored: [{ id: admitted.sessionId, archivedAt: null }] });
    await expect(service.getMetadata('ses_foreign')).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.archive({ ids: ['ses_foreign'] })).rejects.toMatchObject({ statusCode: 404 });
  });
});
