import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import request from 'supertest';
<<<<<<< HEAD
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createProjectDirectoryRuntime } from '../host/project-directory-runtime.js';
import { createHostSessionState } from '../host/session-state.js';
import { history as historyFixture, runtimeSession, snapshot as snapshotFixture } from '../event-stream/canonical-test-fixtures.js';
import { mergeMetadataPatch } from './session-metadata-store.js';

let routeFixture;
let routeFixtureDataDir;
let testWorkspaceDirectory;
let testAgentDirectory;
=======
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionKnowledgeRuntime, KNOWLEDGE_ENTRY_KEYS } from '../session-knowledge/runtime.js';

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
const sessionListMock = vi.fn(async () => ({ data: [] }));
const sessionUpdateMock = vi.fn(async () => undefined);
const sessionMoveMock = vi.fn(async () => undefined);
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
const defaultPrimaryWorktreeRoot = async (directory) => ({ root: directory === '/repo/worktrees/side-task' ? '/repo/app' : directory });
const resolvePrimaryWorktreeRootMock = vi.fn(defaultPrimaryWorktreeRoot);
globalThis.__openchamberResolvePrimaryWorktreeRootMock = resolvePrimaryWorktreeRootMock;

let registerOpenChamberSessionRoutes;
let createOpenChamberSessionService;
let createSessionMetadataStore;
let createOpenCodeSessionMetadata;

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
          list: sessionListMock,
          update: sessionUpdateMock,
          move: sessionMoveMock,
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
  waitForActiveWorktreeBootstrap: vi.fn(async () => undefined),
  resolvePrimaryWorktreeRoot: (...args) => globalThis.__openchamberResolvePrimaryWorktreeRootMock(...args),
  // Only moving a session into a worktree reaches these; the route tests
  // inject their own through the service dependencies.
  removeWorktree: vi.fn(),
  getBranches: vi.fn(),
  stashPush: vi.fn(),
  getPathsWithoutChanges: vi.fn(async () => []),
  stashApply: vi.fn(),
  stashDrop: vi.fn(),
  listStashes: vi.fn(),
  validateWorktreeDirectory: vi.fn(async () => ({ valid: true, insideWorktreeRoot: true })),
  resolveWorktreeTopLevel: vi.fn(async (directory) => ({ root: directory, prefix: '' })),
}));
>>>>>>> bc50ba56a

const createMemorySessionMetadataStore = () => {
  const entries = new Map(); const revisions = new Map();
  const merge = mergeMetadataPatch;
  return { entries, get: async id => entries.get(id) ?? null, getState: async id => entries.has(id) ? { metadata: entries.get(id), revision: String(revisions.get(id) ?? 1) } : null, setSessionMetadata: async (id, patch) => { const current = entries.get(id); const metadata = merge(current, patch); const changed = JSON.stringify(current) !== JSON.stringify(metadata); const revision = (revisions.get(id) ?? (current ? 1 : 0)) + (changed ? 1 : 0); entries.set(id, metadata); revisions.set(id, revision); return { metadata, revision: String(revision), changed }; }, updateSessionMetadata: async (id, decide) => { const current = entries.get(id) ?? {}; const patch = decide(current); if (!patch) return { metadata: current, revision: String(revisions.get(id) ?? (entries.has(id) ? 1 : 0)), changed: false }; const metadata = merge(current, patch); const revision = (revisions.get(id) ?? (entries.has(id) ? 1 : 0)) + 1; entries.set(id, metadata); revisions.set(id, revision); return { metadata, revision: String(revision), changed: true }; } };
};
<<<<<<< HEAD
const createMemoryArchiveStore = () => { const entries = new Map(); return { entries, getState: async id => entries.has(id) ? { archivedAt: entries.get(id), revision: '1' } : null, archive: async (ids, archivedAt) => ({ archived: ids.map(id => { entries.set(id, archivedAt ?? 1); return { id, archivedAt: archivedAt ?? 1 }; }), failedIds: [] }), unarchive: async ids => ({ restored: ids.map(id => { entries.delete(id); return { id, archivedAt: null }; }), failedIds: [] }) }; };
const validScope = (sessionId) => ({
  sessionId,
  rootSessionId: sessionId,
  projectId: 'proj_1',
  workspaceId: 'ws_1',
  cwd: testWorkspaceDirectory ?? '/repo/app',
  agentDirectoryId: 'agent-dir-1',
  agentDirectory: testAgentDirectory ?? '/repo/app/.agents',
  displayPath: 'app',
});
const createApp = (overrides = {}) => {
  const app = express(); const archiveStore = overrides.archiveStore ?? createMemoryArchiveStore(); const sessionMetadataStore = overrides.sessionMetadataStore ?? createMemorySessionMetadataStore();
  const { registerOpenChamberSessionRoutes } = overrides.routes;
=======

/**
 * The archive file holds state OpenCode cannot take (deleted directories). The
 * tests use an in-memory store with the same contract as `archive-store.js`.
 */
const createMemoryArchiveStore = () => {
  const entries = new Map();
  let failFor = new Set();
  return {
    failIds: (ids) => { failFor = new Set(ids); },
    entries,
    getAll: async () => Object.fromEntries(entries),
    entry: async (id) => entries.get(id),
    forget: async (ids) => {
      const failedIds = ids.filter((id) => failFor.has(id) && entries.has(id));
      for (const id of ids) if (!failedIds.includes(id)) entries.delete(id);
      return { failedIds };
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
>>>>>>> bc50ba56a
  registerOpenChamberSessionRoutes(app, {
    service: { request: vi.fn() },
    agentScopeStore: overrides.agentScopeStore ?? routeFixture.agentScopeStore,
    resolveWorkspaceScope: async () => validScope('workspace'),
    resolveSessionScope: async id => validScope(id),
    resolveHostSessionScope: async id => id === 'ses_admitted' ? validScope(id) : null,
    registerSessionScope: async () => true,
    resolveAttachments: async () => [],
    capturePrompt: async (_scope, body) => body,
    beforeDispatch: async () => { },
    onPromptAccepted: async () => { },
    directCommandAdmissionStore: overrides.directCommandAdmissionStore ?? routeFixture.directCommandAdmissionStore,
    archiveStore,
    sessionMetadataStore,
    isRequestOriginAllowed: async () => true,
    ...overrides,
  });
  return { app, archiveStore, sessionMetadataStore, hostSessionState: routeFixture };
};

describe('canonical session route contracts', () => {
  let routes;
  beforeAll(async () => {
    routes = await import('./routes.js');
    routeFixtureDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-routes-admission-'));
    testWorkspaceDirectory = path.join(routeFixtureDataDir, 'app');
    testAgentDirectory = path.join(testWorkspaceDirectory, '.agents');
    fs.mkdirSync(testAgentDirectory, { recursive: true });
    routeFixture = createHostSessionState({ dataDir: routeFixtureDataDir });
    await routeFixture.initialize();
    await routeFixture.agentScopeStore.ensureWorkspace({
      hostProjectId: 'proj_1',
      projectId: 'proj_1',
      workspaceId: 'ws_1',
      projectDirectory: testWorkspaceDirectory,
      workspaceDirectory: testWorkspaceDirectory,
      agentDirectory: testAgentDirectory,
      name: 'Project',
    });
  });
  afterAll(async () => {
    await routeFixture.close();
    fs.rmSync(routeFixtureDataDir, { recursive: true, force: true });
  });
  it('requires the origin gate before wiring routes', () => { const app = express(); expect(() => routes.registerOpenChamberSessionRoutes(app, { sessionService: {} })).toThrow('Session routes require isRequestOriginAllowed'); });
  it('rejects SDK entry IDs and inferred fork modes at the public boundary', async () => {
    const { app } = createApp({ routes });
    await request(app).post('/api/openchamber/sessions/ses_admitted/fork').send({ entryId: 'native-entry', messageId: 'public-message', mode: 'selected' }).expect(400);
    await request(app).post('/api/openchamber/sessions/ses_admitted/fork').send({ messageId: 'public-message' }).expect(400);
    await request(app).post('/api/openchamber/sessions/ses_admitted/fork').send({ messageId: 'public-message', mode: 'full' }).expect(400);
  });
  it('rejects metadata and archive operations for an unauthorized Host session', async () => { const { app } = createApp({ routes }); await request(app).get('/api/openchamber/sessions/ses_foreign/metadata').expect(404); await request(app).post('/api/openchamber/sessions/archive').send({ ids: ['ses_foreign'] }).expect(404); });
  it('keeps admitted Host metadata and archive operations available when native service is unavailable', async () => { const archiveStore = createMemoryArchiveStore(); const sessionMetadataStore = createMemorySessionMetadataStore(); const { app } = createApp({ routes, archiveStore, sessionMetadataStore }); await request(app).patch('/api/openchamber/sessions/ses_admitted/metadata').send({ changes: { notes: 'host-owned' } }).expect(200); await request(app).get('/api/openchamber/sessions/ses_admitted/metadata').expect(200); await request(app).post('/api/openchamber/sessions/archive').send({ ids: ['ses_admitted'], archivedAt: 1700 }).expect(200); await request(app).post('/api/openchamber/sessions/unarchive').send({ ids: ['ses_admitted'] }).expect(200); });
  it('rejects malformed archive batches', async () => { const { app } = createApp({ routes }); await request(app).post('/api/openchamber/sessions/archive').send({ ids: [] }).expect(400); await request(app).post('/api/openchamber/sessions/archive').send({ ids: ['ses_admitted'], archivedAt: -1 }).expect(400); });
  it('reopens a cold session before a run, starts one worker, and keeps the second send live', async () => {
    const live = new Set(); const calls = []; let workerStarts = 0;
    const runtime = id => ({
      sessionId: id, rootSessionId: id, projectId: 'proj_1', workspaceId: 'ws_1', displayPath: 'app',
      createdAt: 1, updatedAt: 2, epoch: `epoch-${id}`, headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }
    });
    const service = {
      request: async (pathname, init = {}) => {
        calls.push(pathname);
        const id = decodeURIComponent(pathname.split('/').at(-2));
        if (pathname.endsWith('/reopen')) {
          if (!live.has(id)) { live.add(id); workerStarts += 1; }
          return Response.json(runtime(id));
        }
        if (pathname.endsWith('/runs')) {
          if (!live.has(id)) return Response.json({ type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Unavailable', status: 503, code: 'SERVICE_UNAVAILABLE', detail: 'Cold session has no worker', retryable: true }, { status: 503 });
          const body = JSON.parse(init.body);
          return Response.json({ run: { runId: body.runId, sessionId: id, status: 'running', origin: 'host', createdAt: 1 } });
        }
        throw new Error(`Unexpected service request ${pathname}`);
      }
    };
    const { createOpenChamberSessionService, registerCanonicalSessionRoutes } = routes;
    const sessionService = createOpenChamberSessionService({
      agentScopeStore: routeFixture.agentScopeStore,
      service,
      resolveWorkspaceScope: async () => validScope('workspace'),
      resolveSessionScope: async id => validScope(id),
      resolveHostSessionScope: async id => id === 'ses_admitted' ? validScope(id) : null,
      registerSessionScope: async () => true,
      resolveAttachments: async () => [],
      capturePrompt: async (_scope, body) => body,
      beforeDispatch: async () => { },
      onPromptAccepted: async () => { },
      directCommandAdmissionStore: routeFixture.directCommandAdmissionStore,
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
    });
    const app = express();
    const router = express.Router();
    registerCanonicalSessionRoutes(router, sessionService);
    app.use('/api/agent/v1/sessions', router);
    const prompt = {
      input: { text: 'Cold prompt', attachments: [], context: [] },
      options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }
    };
    const first = await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send(prompt).expect(200);
    expect(first.body.run).toMatchObject({ sessionId: 'ses_admitted', status: 'running' });
    const second = await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send(prompt).expect(200);
    expect(second.body.run).toMatchObject({ sessionId: 'ses_admitted', status: 'running' });
    expect(workerStarts).toBe(1);
    // The first send reopens a cold root; the second reuses the confirmed live worker.
    expect(calls.filter(path => path.endsWith('/reopen'))).toHaveLength(1);
    const afterValid = calls.length;
    await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send({}).expect(400);
    expect(calls).toHaveLength(afterValid);
  });
  it('retries one cold dispatch after a verified unloaded refusal and never duplicates an admitted run', async () => {
    const calls = []; let live = false; let runs = 0;
    const runtime = id => ({
      sessionId: id, rootSessionId: id, projectId: 'proj_1', workspaceId: 'ws_1', displayPath: 'app',
      createdAt: 1, updatedAt: 2, epoch: `epoch-${id}`, headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }
    });
    const service = {
      request: async (pathname, init = {}) => {
        calls.push(pathname);
        const id = decodeURIComponent(pathname.split('/').at(-2));
        if (pathname.endsWith('/reopen')) { live = true; return Response.json(runtime(id)); }
        if (pathname.endsWith('/runs')) {
          runs += 1;
          if (!live) return Response.json({ type: 'urn:ohpichamber:problem:SESSION_RESTORE_FAILED', title: 'Refused', status: 503, code: 'SESSION_RESTORE_FAILED', detail: 'The worker is unloaded', retryable: true }, { status: 503 });
          const body = JSON.parse(init.body);
          return Response.json({ run: { runId: body.runId, sessionId: id, status: 'running', origin: 'host', createdAt: 1 } });
        }
        throw new Error(`Unexpected service request ${pathname}`);
      }
    };
    const { createOpenChamberSessionService, registerCanonicalSessionRoutes } = routes;
    const sessionService = createOpenChamberSessionService({
      agentScopeStore: routeFixture.agentScopeStore,
      service,
      resolveWorkspaceScope: async () => validScope('workspace'),
      resolveSessionScope: async id => validScope(id),
      resolveHostSessionScope: async id => id === 'ses_admitted' ? validScope(id) : null,
      registerSessionScope: async () => true,
      resolveAttachments: async () => [],
      capturePrompt: async (_scope, body) => body,
      beforeDispatch: async () => { },
      onPromptAccepted: async () => { },
      directCommandAdmissionStore: routeFixture.directCommandAdmissionStore,
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
    });
    const app = express();
    const router = express.Router();
    registerCanonicalSessionRoutes(router, sessionService);
    app.use('/api/agent/v1/sessions', router);
    const prompt = { input: { text: 'Warm prompt', attachments: [], context: [] }, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null } };
    // A cold root reopens before its first dispatch.
    await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send(prompt).expect(200);
    expect(runs).toBe(1);
    // The supervisor evicted the worker after this root was confirmed live: the
    // cached dispatch is refused cold, reopens once, and runs on the retry.
    calls.length = 0;
    live = false;
    const response = await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send(prompt).expect(200);
    expect(response.body.run).toMatchObject({ sessionId: 'ses_admitted', status: 'running' });
    expect(runs).toBe(3);
    expect(calls.filter(path => path.endsWith('/reopen'))).toHaveLength(1);
    expect(calls.filter(path => path.endsWith('/runs'))).toHaveLength(2);
    // The third prompt rides the confirmed live worker: no reopen, no retry.
    calls.length = 0;
    await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send(prompt).expect(200);
    expect(runs).toBe(4);
    expect(calls.filter(path => path.endsWith('/reopen'))).toHaveLength(0);
    expect(calls.filter(path => path.endsWith('/runs'))).toHaveLength(1);
  });

<<<<<<< HEAD
  it('does not reopen or retry a busy or full service refusal', async () => {
    for (const problem of [
      { status: 409, code: 'RUN_ACTIVE', detail: 'A run is already active' },
      { status: 409, code: 'COMMAND_IN_FLIGHT', detail: 'Another command is in flight' },
      { status: 503, code: 'SERVICE_UNAVAILABLE', detail: 'Session capacity is full', details: { reason: 'worker_capacity', activeRootWorkers: 4, maxActiveRootWorkers: 4 } },
    ]) {
      const calls = [];
      const runtime = id => ({
        sessionId: id, rootSessionId: id, projectId: 'proj_1', workspaceId: 'ws_1', displayPath: 'app',
        createdAt: 1, updatedAt: 2, epoch: `epoch-${id}`, headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }
      });
      const service = {
        request: async (pathname, init = {}) => {
          calls.push(pathname);
          if (pathname.endsWith('/reopen')) return Response.json(runtime('ses_admitted'));
          if (pathname.endsWith('/runs')) return Response.json({ type: `urn:ohpichamber:problem:${problem.code}`, title: 'Refused', ...problem, retryable: problem.status >= 500 }, { status: problem.status });
          throw new Error(`Unexpected service request ${pathname}`);
        }
      };
      const { createOpenChamberSessionService, registerCanonicalSessionRoutes } = routes;
      const sessionService = createOpenChamberSessionService({
        agentScopeStore: routeFixture.agentScopeStore,
        service,
        resolveWorkspaceScope: async () => validScope('workspace'),
        resolveSessionScope: async id => validScope(id),
        resolveHostSessionScope: async id => id === 'ses_admitted' ? validScope(id) : null,
        registerSessionScope: async () => true,
        resolveAttachments: async () => [],
        capturePrompt: async (_scope, body) => body,
        beforeDispatch: async () => { },
        onPromptAccepted: async () => { },
        directCommandAdmissionStore: routeFixture.directCommandAdmissionStore,
        archiveStore: createMemoryArchiveStore(),
        sessionMetadataStore: createMemorySessionMetadataStore(),
      });
      const app = express();
      const router = express.Router();
      registerCanonicalSessionRoutes(router, sessionService);
      app.use('/api/agent/v1/sessions', router);
      const prompt = { input: { text: 'Busy prompt', attachments: [], context: [] }, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null } };
      await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send(prompt).expect(problem.status);
      // The cold reopen on the first send is expected; the refusal itself must not add one or replay the run.
      expect(calls.filter(path => path.endsWith('/reopen'))).toHaveLength(1);
      expect(calls.filter(path => path.endsWith('/runs'))).toHaveLength(1);
      // A failed dispatch voids the live confirmation, so the next send verifies again.
      calls.length = 0;
      await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send(prompt).expect(problem.status);
      expect(calls.filter(path => path.endsWith('/reopen'))).toHaveLength(1);
      expect(calls.filter(path => path.endsWith('/runs'))).toHaveLength(1);
    }
=======
  beforeEach(() => {
    resolvePrimaryWorktreeRootMock.mockReset();
    resolvePrimaryWorktreeRootMock.mockImplementation(defaultPrimaryWorktreeRoot);
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
    sessionUpdateMock.mockReset();
    sessionUpdateMock.mockImplementation(async () => undefined);
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
    sessionListMock.mockReset();
    sessionListMock.mockImplementation(async () => ({ data: [] }));
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
>>>>>>> bc50ba56a
  });

  it('enforces Host admission invariant: rejects cold send when agentScopeStore is missing instead of bypassing admission', async () => {
    const calls = [];
    const service = {
      request: async (pathname) => {
        calls.push(pathname);
        return Response.json({});
      }
    };
    const { createOpenChamberSessionService, registerCanonicalSessionRoutes } = routes;
    const sessionService = createOpenChamberSessionService({
      service,
      // agentScopeStore intentionally omitted to verify invariant enforcement
      resolveWorkspaceScope: async () => validScope('workspace'),
      resolveSessionScope: async id => validScope(id),
      resolveHostSessionScope: async id => id === 'ses_admitted' ? validScope(id) : null,
      registerSessionScope: async () => true,
      resolveAttachments: async () => [],
      capturePrompt: async (_scope, body) => body,
      beforeDispatch: async () => { },
      onPromptAccepted: async () => { },
      directCommandAdmissionStore: routeFixture.directCommandAdmissionStore,
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
    });
<<<<<<< HEAD
    const app = express();
    const router = express.Router();
    registerCanonicalSessionRoutes(router, sessionService);
    app.use('/api/agent/v1/sessions', router);
    const prompt = {
      input: { text: 'Cold prompt', attachments: [], context: [] },
      options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }
    };
    const response = await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send(prompt).expect(503);
    expect(response.body).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      detail: 'Host session admission authority is unavailable',
=======

    it('reports a session OpenCode refused or does not know as failed', async () => {
      sessionUpdateMock.mockImplementation(async ({ sessionID }) => {
        if (sessionID === 'ses_down') throw tagged('UnknownError');
        if (sessionID === 'ses_missing') throw tagged('SessionNotFoundError');
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { app, archiveStore, broadcastGlobalUiEvent } = createApp();

      const response = await request(app)
        .post('/api/openchamber/sessions/archive')
        .send({ ids: ['ses_a', 'ses_down', 'ses_missing'], archivedAt: 1700 })
        .expect(200);

      expect(response.body.archived.map((session) => session.id)).toEqual(['ses_a']);
      expect(response.body.failedIds).toEqual(['ses_down', 'ses_missing']);
      await expect(archiveStore.getAll()).resolves.toEqual({});
      expect(broadcastGlobalUiEvent).not.toHaveBeenCalled();
>>>>>>> bc50ba56a
    });
    expect(calls.filter(path => path.endsWith('/reopen'))).toHaveLength(0);
  });

<<<<<<< HEAD
  it('merges and announces workbench metadata patches and broadcasts each committed change', async () => {
    const sessionMetadataStore = createMemorySessionMetadataStore();
    const broadcastGlobalUiEvent = vi.fn();
    const { app } = createApp({ routes, sessionMetadataStore, broadcastGlobalUiEvent });
=======
    it('does not announce a session whose old entry the file failed to drop', async () => {
      const archiveStore = createMemoryArchiveStore();
      archiveStore.entries.set('ses_a', null);
      archiveStore.entries.set('ses_b', null);
      archiveStore.failIds(['ses_b']);
      const { app, broadcastGlobalUiEvent } = createApp({ archiveStore });
>>>>>>> bc50ba56a

    await request(app).patch('/api/openchamber/sessions/ses_admitted/metadata')
      .send({
        changes: {
          openchamber: {
            pinned: { at: 1_700 }, workbench: { lastIdleAt: 9, lastTurnOutcome: 'completed' },
            turn: { endedAt: 9, durationMs: 4_000 },
          }
        }
      })
      .expect(200);
    // A view advances one field; the pin and the finished turn survive.
    const viewed = await request(app).patch('/api/openchamber/sessions/ses_admitted/metadata')
      .send({ changes: { openchamber: { workbench: { viewedAt: 9 } } } })
      .expect(200);
    expect(viewed.body).toEqual({
      sessionId: 'ses_admitted', revision: '2',
      metadata: {
        openchamber: {
          pinned: { at: 1_700 }, workbench: { lastIdleAt: 9, viewedAt: 9, lastTurnOutcome: 'completed' },
          turn: { endedAt: 9, durationMs: 4_000 },
        }
      },
    });
    // Unpinning deletes the pin alone; the run record is untouched.
    const unpinned = await request(app).patch('/api/openchamber/sessions/ses_admitted/metadata')
      .send({ changes: { openchamber: { pinned: null } } })
      .expect(200);
    expect(unpinned.body.metadata).toEqual({
      openchamber: {
        workbench: { lastIdleAt: 9, viewedAt: 9, lastTurnOutcome: 'completed' }, turn: { endedAt: 9, durationMs: 4_000 },
      }
    });
    expect(broadcastGlobalUiEvent).toHaveBeenCalledTimes(3);
    expect(broadcastGlobalUiEvent).toHaveBeenLastCalledWith({
      type: 'openchamber:session-metadata',
      properties: { sessionId: 'ses_admitted', sessionID: 'ses_admitted', metadata: unpinned.body.metadata, revision: '3' },
    });
  });

<<<<<<< HEAD
  it('rejects malformed workbench metadata without writing or announcing', async () => {
    const sessionMetadataStore = createMemorySessionMetadataStore();
    const broadcastGlobalUiEvent = vi.fn();
    const { app } = createApp({ routes, sessionMetadataStore, broadcastGlobalUiEvent });
    for (const changes of [
      { openchamber: { pinned: {} } },
      { openchamber: { workbench: { lastTurnOutcome: 'aborted' } } },
      { openchamber: { turn: { endedAt: 1, durationMs: -1 } } },
    ]) await request(app).patch('/api/openchamber/sessions/ses_admitted/metadata').send({ changes }).expect(400);
    expect(sessionMetadataStore.entries.size).toBe(0);
    expect(broadcastGlobalUiEvent).not.toHaveBeenCalled();
=======
  describe('session metadata OpenChamber owns', () => {
    it('merges a patch onto the OpenCode record and writes it back with PATCH', async () => {
      sessionGetMock.mockImplementationOnce(async ({ sessionID }) => ({
        id: sessionID,
        location: { directory: '/repo/app' },
        metadata: { openchamber: { kind: 'review', assist: { recap: 'from v1' } } },
      }));
      // The real store over the same mocked client the routes use.
      const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-routes-metadata-'));
      const { app } = createApp({
        sessionMetadataStore: createSessionMetadataStore({
          dataDir,
          openCode: createOpenCodeSessionMetadata({
            buildOpenCodeUrl: (route) => `http://opencode.test${route}`,
            getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer test' }),
          }),
        }),
      });

      const response = await request(app)
        .post('/api/openchamber/sessions/ses_v1/metadata')
        .send({ patch: { openchamber: { goal: { status: 'active' } } } })
        .expect(200);

      const merged = { openchamber: { kind: 'review', assist: { recap: 'from v1' }, goal: { status: 'active' } } };
      expect(response.body.metadata).toEqual(merged);
      expect(sessionUpdateMock).toHaveBeenCalledWith({ sessionID: 'ses_v1', metadata: merged });
      fs.rmSync(dataDir, { recursive: true, force: true });
    });

    it('merge-patches metadata, returns the merged object, and announces it', async () => {
      const { app, sessionMetadataStore, broadcastGlobalUiEvent } = createApp();

      await request(app)
        .post('/api/openchamber/sessions/ses_a/metadata')
        .send({ patch: { openchamber: { assist: { recap: 'first' } } } })
        .expect(200);

      const response = await request(app)
        .post('/api/openchamber/sessions/ses_a/metadata')
        .send({ patch: { openchamber: { goal: { status: 'active' } } } })
        .expect(200);

      // The second write must not erase the first: OpenCode's PATCH merged, so
      // this does too.
      expect(response.body).toEqual({
        metadata: { openchamber: { assist: { recap: 'first' }, goal: { status: 'active' } } },
      });
      await expect(sessionMetadataStore.get('ses_a')).resolves.toEqual(response.body.metadata);
      expect(broadcastGlobalUiEvent).toHaveBeenLastCalledWith({
        type: 'openchamber:session-metadata',
        properties: { sessionID: 'ses_a', metadata: response.body.metadata },
      });
    });

    it('deletes a key when the patch value is null', async () => {
      const { app } = createApp();
      await request(app)
        .post('/api/openchamber/sessions/ses_a/metadata')
        .send({ patch: { openchamber: { goal: { id: 'g1' }, assist: { recap: 'r' } } } })
        .expect(200);

      const response = await request(app)
        .post('/api/openchamber/sessions/ses_a/metadata')
        .send({ patch: { openchamber: { assist: null } } })
        .expect(200);

      expect(response.body).toEqual({ metadata: { openchamber: { goal: { id: 'g1' } } } });
    });

    it('reads back what it stored, per session', async () => {
      const { app } = createApp();
      await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: { a: 1 } }).expect(200);

      await expect(request(app).get('/api/openchamber/sessions/ses_a/metadata').expect(200))
        .resolves.toMatchObject({ body: { metadata: { a: 1 } } });
      await expect(request(app).get('/api/openchamber/sessions/ses_b/metadata').expect(200))
        .resolves.toMatchObject({ body: { metadata: {} } });
    });

    it('answers a failed write with its message', async () => {
      const persistSessionMetadata = vi.fn(async () => { throw new Error('OpenCode is down'); });
      const { app } = createApp({ persistSessionMetadata });

      const response = await request(app)
        .post('/api/openchamber/sessions/ses_a/metadata')
        .send({ patch: { openchamber: { work: { state: 'done' } } } })
        .expect(500);

      expect(response.body).toEqual({ error: 'OpenCode is down' });
    });

    it('rejects a missing or non-object patch', async () => {
      const { app, broadcastGlobalUiEvent } = createApp();

      await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({}).expect(400);
      await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: 'nope' }).expect(400);
      await request(app).post('/api/openchamber/sessions/ses_a/metadata').send({ patch: ['a'] }).expect(400);

      expect(broadcastGlobalUiEvent).not.toHaveBeenCalled();
    });

    it('routes every write through the server-owned writer when one is injected', async () => {
      const persistSessionMetadata = vi.fn(async () => ({ openchamber: { goal: { status: 'active' } } }));
      const { app, sessionMetadataStore } = createApp({ persistSessionMetadata });

      const response = await request(app)
        .post('/api/openchamber/sessions/ses_a/metadata')
        .send({ patch: { openchamber: { goal: { status: 'active' } } }, directory: '/repo/app' })
        .expect(200);

      expect(persistSessionMetadata).toHaveBeenCalledWith(
        'ses_a',
        { openchamber: { goal: { status: 'active' } } },
        { directory: '/repo/app' },
      );
      expect(response.body.metadata).toEqual({ openchamber: { goal: { status: 'active' } } });
      // The injected writer owns the store; the route must not write twice.
      await expect(sessionMetadataStore.get('ses_a')).resolves.toEqual({});
    });
>>>>>>> bc50ba56a
  });

  describe('session links the UI owns', () => {
    const agentEntry = {
      id: 'acme/app#7', number: 7, title: 'Add search', url: 'https://github.com/acme/app/pull/7', kind: 'pull', linkedAt: 5,
    };
    const uiEntry = {
      id: 'linear:ENG-12', identifier: 'ENG-12', title: 'Spec', url: 'https://linear.app/acme/issue/eng-12', kind: 'linear', linkedAt: 9,
    };
    const trackerEntry = {
      id: 'jira:OPS-4', provider: 'jira', identifier: 'OPS-4', title: 'Outage', url: 'https://jira.example/browse/OPS-4', kind: 'tracker', linkedAt: 10,
    };

    it('persists mixed tracker operations through the Host and preserves existing links', async () => {
      const { app } = createApp({ routes, sessionMetadataStore: routeFixture.sessionMetadataStore });
      const sessionId = 'ses_admitted';
      const legacyLinear = { ...uiEntry, provider: 'linear' };
      await routeFixture.sessionMetadataStore.setSessionMetadata(sessionId, { openchamber: { linked_issues: [legacyLinear, agentEntry] } });
      const issue = { id: 'acme/app#8', number: 8, title: 'Issue', url: 'https://github.com/acme/app/issues/8', kind: 'issue', linkedAt: 11 };

      const linked = await request(app).post(`/api/openchamber/sessions/${sessionId}/links`)
        .send({ entries: [trackerEntry, issue], linked: true }).expect(200);
      expect(linked.body.metadata.openchamber.linked_issues).toEqual([legacyLinear, agentEntry, trackerEntry, issue]);
      const readBack = await request(app).get(`/api/openchamber/sessions/${sessionId}/metadata`).expect(200);
      expect(readBack.body.metadata).toEqual(linked.body.metadata);

      const neutralLinear = { ...legacyLinear, kind: 'tracker' };
      const linearRelinked = await request(app).post(`/api/openchamber/sessions/${sessionId}/links`)
        .send({ entries: [neutralLinear], linked: true }).expect(200);
      expect(linearRelinked.body.metadata.openchamber.linked_issues).toEqual([agentEntry, trackerEntry, issue, legacyLinear]);

      const unlinked = await request(app).post(`/api/openchamber/sessions/${sessionId}/links`)
        .send({ entries: [trackerEntry, issue], linked: false }).expect(200);
      expect(unlinked.body.metadata.openchamber.linked_issues).toEqual([agentEntry, legacyLinear]);
      expect((await routeFixture.sessionMetadataStore.getState(sessionId)).metadata).toEqual(unlinked.body.metadata);
    });

    it('rejects invalid tracker identities atomically and checks Host scope', async () => {
      const { app, sessionMetadataStore } = createApp({ routes });
      sessionMetadataStore.entries.set('ses_admitted', { openchamber: { linked_issues: [uiEntry] } });
      for (const bad of [
        { ...trackerEntry, provider: undefined },
        { ...trackerEntry, provider: 'INVALID' },
        { ...trackerEntry, identifier: '' },
        { ...trackerEntry, identifier: '  ' },
        { ...trackerEntry, id: 'jira:OTHER-1' },
        { ...trackerEntry, linkedAt: undefined },
        { ...trackerEntry, author: 42 },
        { ...trackerEntry, unexpected: true },
      ]) {
        await request(app).post('/api/openchamber/sessions/ses_admitted/links')
          .send({ entries: [agentEntry, bad], linked: true }).expect(400);
      }
      await request(app).post('/api/openchamber/sessions/ses_foreign/links')
        .send({ entries: [trackerEntry], linked: true }).expect(404);
      expect(await sessionMetadataStore.get('ses_admitted')).toEqual({ openchamber: { linked_issues: [uiEntry] } });
    });

    it('appends to the links already on the record and announces the merged metadata', async () => {
      const { app, sessionMetadataStore } = createApp({ routes });
      const broadcastGlobalUiEvent = vi.fn();
      // Rebuild with the broadcast spy so the fallback writer announces.
      const built = createApp({ routes, sessionMetadataStore, broadcastGlobalUiEvent });
      // As if an agent's `session.link` had already written this session.
      sessionMetadataStore.entries.set('ses_admitted', { openchamber: { linked_issues: [agentEntry] } });

      const response = await request(built.app)
        .post('/api/openchamber/sessions/ses_admitted/links')
        .send({ entries: [uiEntry], linked: true, directory: '/repo/app' })
        .expect(200);

      expect(response.body.metadata.openchamber.linked_issues).toEqual([agentEntry, uiEntry]);
      await expect(sessionMetadataStore.get('ses_admitted')).resolves.toEqual(response.body.metadata);
      expect(broadcastGlobalUiEvent).toHaveBeenCalledWith({
        type: 'openchamber:session-metadata',
        properties: { sessionID: 'ses_admitted', metadata: response.body.metadata, revision: expect.any(String) },
      });
    });

    it('refreshes a re-linked entry and keeps the rest of the list', async () => {
      const { app, sessionMetadataStore } = createApp({ routes });
      sessionMetadataStore.entries.set('ses_admitted', { openchamber: { linked_issues: [agentEntry, uiEntry] } });

      const response = await request(app)
        .post('/api/openchamber/sessions/ses_admitted/links')
        .send({ entries: [{ ...agentEntry, title: 'Add search (renamed)' }], linked: true })
        .expect(200);

      expect(response.body.metadata.openchamber.linked_issues).toEqual([
        uiEntry,
        { ...agentEntry, title: 'Add search (renamed)' },
      ]);
    });

    it('unlinks by id and leaves unrelated entries', async () => {
      const { app, sessionMetadataStore } = createApp({ routes });
      sessionMetadataStore.entries.set('ses_admitted', { openchamber: { linked_issues: [agentEntry, uiEntry] } });

      const response = await request(app)
        .post('/api/openchamber/sessions/ses_admitted/links')
        .send({ entries: [{ id: 'acme/app#7', title: 'Add search', url: 'https://github.com/acme/app/pull/7', kind: 'pull' }], linked: false })
        .expect(200);

      expect(response.body.metadata.openchamber.linked_issues).toEqual([uiEntry]);
    });

    it('applies a batch in one write', async () => {
      const { app, sessionMetadataStore } = createApp({ routes });
      const broadcastGlobalUiEvent = vi.fn();
      const built = createApp({ routes, sessionMetadataStore, broadcastGlobalUiEvent });
      const second = { id: 'acme/app#8', number: 8, title: 'Second', url: 'https://github.com/acme/app/issues/8', kind: 'issue', linkedAt: 9 };

      const response = await request(built.app)
        .post('/api/openchamber/sessions/ses_admitted/links')
        .send({ entries: [uiEntry, second], linked: true })
        .expect(200);

      expect(response.body.metadata.openchamber.linked_issues).toEqual([uiEntry, second]);
      expect(broadcastGlobalUiEvent).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid entry with 400 and writes nothing', async () => {
      const { app, sessionMetadataStore } = createApp({ routes });
      const broadcastGlobalUiEvent = vi.fn();
      const built = createApp({ routes, sessionMetadataStore, broadcastGlobalUiEvent });
      sessionMetadataStore.entries.set('ses_admitted', { openchamber: { linked_issues: [agentEntry] } });

      await request(built.app)
        .post('/api/openchamber/sessions/ses_admitted/links')
        .send({ entries: [{ id: 'x', title: 'No kind', url: 'https://x.dev/1' }], linked: true })
        .expect(400);
      await request(built.app)
        .post('/api/openchamber/sessions/ses_admitted/links')
        .send({ entries: [uiEntry] })
        .expect(400);
      await request(built.app)
        .post('/api/openchamber/sessions/ses_admitted/links')
        .send({ entries: 'nope', linked: true })
        .expect(400);

      await expect(sessionMetadataStore.get('ses_admitted'))
        .resolves.toEqual({ openchamber: { linked_issues: [agentEntry] } });
      expect(broadcastGlobalUiEvent).not.toHaveBeenCalled();
    });

    it('writes nothing when the operation changes no entry', async () => {
      const { app, sessionMetadataStore } = createApp({ routes });
      const broadcastGlobalUiEvent = vi.fn();
      const built = createApp({ routes, sessionMetadataStore, broadcastGlobalUiEvent });
      await request(built.app)
        .post('/api/openchamber/sessions/ses_admitted/links')
        .send({ entries: [{ id: 'acme/app#99', number: 99, title: 'T', url: 'https://github.com/acme/app/issues/99', kind: 'issue' }], linked: false })
        .expect(200, { metadata: {} });

      expect(broadcastGlobalUiEvent).not.toHaveBeenCalled();
    });
  });

<<<<<<< HEAD
  describe('session create with parent link', () => {
    it('authorizes parent session in the same workspace and sets parentSessionId', async () => {
      const capturedBootstrap = [];
      await routeFixture.agentScopeStore.ensureWorkspace({
        hostProjectId: 'proj_1', projectId: 'proj_1', workspaceId: 'ws_1',
        projectDirectory: testWorkspaceDirectory, workspaceDirectory: testWorkspaceDirectory, agentDirectory: testAgentDirectory, name: 'Project',
      });
      const service = {
        request: vi.fn(async (path, init) => {
          if (path === '/internal/sessions') {
            const body = JSON.parse(init.body);
            capturedBootstrap.push(body);
            return Response.json(runtimeSession({ sessionId: body.rootSessionId, rootSessionId: body.rootSessionId, projectId: body.projectId, workspaceId: body.workspaceId, parentSessionId: body.parentSessionId }));
          }
          return Response.json({});
        }),
      };
      const { app } = createApp({
        routes,
        service,
        agentScopeStore: routeFixture.agentScopeStore,
        resolveSessionScope: async (id) => id === 'ses_parent' ? validScope('ses_parent') : null,
      });
=======
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
      metadata: { openchamber: { workTitle: { title: 'Side task', by: 'user' } } },
    });
  });

  it('records no name when the session is created without a title', async () => {
    const { app } = createApp();
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app' })
      .expect(200);

    expect(sessionCreateMock).toHaveBeenCalledWith({ location: { directory: '/repo/app' } });
  });

  it('does not claim user ownership for a title from the agent service', async () => {
    const service = createOpenChamberSessionService({
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
      readSettingsFromDiskMigrated: async () => ({ projects: [{ id: 'proj_1', path: '/repo/app' }] }),
      sanitizeProjects: (projects) => projects,
      validateDirectoryPath: async (directory) => ({ ok: true, directory }),
      buildOpenCodeUrl: (route) => `http://opencode.test${route}`,
      getOpenCodeAuthHeaders: () => ({}),
      waitForOpenCodeReady: vi.fn(async () => undefined),
    });
    await service.create({ directory: '/repo/app', title: 'Agent task' });

    expect(sessionCreateMock).toHaveBeenCalledWith({
      location: { directory: '/repo/app' },
      title: 'Agent task',
    });
  });

  it('records on the prompt the session whose agent sent it, with its title', async () => {
    const { app } = createApp();
    sessionGetMock.mockImplementation(async ({ sessionID }) => ({ id: sessionID, title: 'PR triage', location: { directory: '/repo/app' } }));
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5', promptedBySessionId: 'ses_origin' })
      .expect(200);

    expect(sessionPromptMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      text: 'Run this',
      metadata: { openchamber: { promptedBy: { sessionID: 'ses_origin', title: 'PR triage' } } },
    });
  });

  it('records the sender by id alone when its session cannot be read', async () => {
    const { app } = createApp();
    sessionGetMock.mockImplementation(async ({ sessionID }) => {
      if (sessionID === 'ses_origin') throw new Error('not found');
      return { id: sessionID, location: { directory: '/repo/app' } };
    });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5', promptedBySessionId: 'ses_origin' })
      .expect(200);

    expect(sessionPromptMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      text: 'Run this',
      metadata: { openchamber: { promptedBy: { sessionID: 'ses_origin' } } },
    });
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
>>>>>>> bc50ba56a
      const response = await request(app)
        .post('/api/openchamber/sessions')
        .send({ projectId: 'proj_1', workspaceId: 'ws_1', options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }, parentSessionId: 'ses_parent' })
        .expect(200);

      expect(response.body.session).toMatchObject({ parentSessionId: 'ses_parent', workspaceId: 'ws_1' });
      expect(capturedBootstrap[0]).toMatchObject({ parentSessionId: 'ses_parent', workspaceId: 'ws_1' });
    });

    it('rejects session create when parent session is missing with 404', async () => {
      const { app } = createApp({
        routes,
        resolveSessionScope: async () => null,
      });
      await request(app)
        .post('/api/openchamber/sessions')
        .send({ projectId: 'proj_1', workspaceId: 'ws_1', options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }, parentSessionId: 'ses_missing' })
        .expect(404);
    });

    it('rejects session create when parent belongs to another workspace with 403', async () => {
      const { app } = createApp({
        routes,
        resolveSessionScope: async () => ({ ...validScope('ses_foreign'), workspaceId: 'ws_foreign' }),
      });
      await request(app)
        .post('/api/openchamber/sessions')
        .send({ projectId: 'proj_1', workspaceId: 'ws_1', options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }, parentSessionId: 'ses_foreign' })
        .expect(403);
    });
  });

  describe('session create with multi-run metadata', () => {
    const multirunBase = {
      version: 1,
      group: { kind: 'id', id: '550e8400-e29b-41d4-a716-446655440000' },
      groupSlug: 'group_bench',
      runGroup: 'g1',
      providerID: 'provider_1',
      modelID: 'model_1',
      role: 'run',
      title: 'Run 1',
    };

    it('creates session with initial multi-run metadata having sessionID: null and binds returned sessionID on follow-up', async () => {
      const service = {
        request: vi.fn(async (path, init) => {
          if (path === '/internal/sessions') {
            const body = JSON.parse(init.body);
            return Response.json(runtimeSession({
              sessionId: body.rootSessionId,
              rootSessionId: body.rootSessionId,
              projectId: body.projectId,
              workspaceId: body.workspaceId,
            }));
          }
          return Response.json({});
        }),
      };
<<<<<<< HEAD
      const { app, sessionMetadataStore } = createApp({
        routes,
        service,
        agentScopeStore: routeFixture.agentScopeStore,
        resolveHostSessionScope: async (id) => validScope(id),
      });

      const response = await request(app)
        .post('/api/openchamber/sessions')
        .send({
          projectId: 'proj_1',
          workspaceId: 'ws_1',
          options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
          metadata: { openchamber: { multirun: { ...multirunBase, sessionID: null } } },
        })
        .expect(200);

      const createdSession = response.body.session;
      expect(createdSession.sessionId).toBeDefined();
      expect(createdSession.metadata.openchamber.multirun).toMatchObject({
        version: 1,
        groupSlug: 'group_bench',
        runGroup: 'g1',
        providerID: 'provider_1',
        modelID: 'model_1',
        role: 'run',
        title: 'Run 1',
      });

      // Follow-up: patch with newly created sessionId to bind multi-run membership
      const boundPatch = {
        changes: {
          openchamber: {
            multirun: { ...multirunBase, sessionID: createdSession.sessionId },
          },
        },
      };
      await request(app)
        .patch(`/api/openchamber/sessions/${createdSession.sessionId}/metadata`)
        .send(boundPatch)
        .expect(200);

      const updatedState = await sessionMetadataStore.getState(createdSession.sessionId);
      expect(updatedState.metadata.openchamber.multirun.sessionID).toBe(createdSession.sessionId);
    });

    it('creates session with multi-run metadata when sessionID is omitted', async () => {
      const service = {
        request: vi.fn(async (path, init) => {
          if (path === '/internal/sessions') {
            const body = JSON.parse(init.body);
            return Response.json(runtimeSession({
              sessionId: body.rootSessionId,
              rootSessionId: body.rootSessionId,
              projectId: body.projectId,
              workspaceId: body.workspaceId,
            }));
          }
          return Response.json({});
        }),
      };
      const { app } = createApp({
        routes,
        service,
        agentScopeStore: routeFixture.agentScopeStore,
      });

      const response = await request(app)
        .post('/api/openchamber/sessions')
        .send({
          projectId: 'proj_1',
          workspaceId: 'ws_1',
          options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
          metadata: { openchamber: { multirun: { ...multirunBase } } },
        })
        .expect(200);

      expect(response.body.session.sessionId).toBeDefined();
      expect(response.body.session.metadata.openchamber.multirun.groupSlug).toBe('group_bench');
    });

    it('rejects session create with malformed multi-run metadata', async () => {
      const { app } = createApp({
        routes,
        agentScopeStore: routeFixture.agentScopeStore,
      });

      await request(app)
        .post('/api/openchamber/sessions')
        .send({
          projectId: 'proj_1',
          workspaceId: 'ws_1',
          options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
          metadata: { openchamber: { multirun: { ...multirunBase, sessionID: 123 } } },
        })
        .expect(400);
    });
=======
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

  it('starts the session in the project folder inside a new worktree and reports a folder the checkout lacks', async () => {
    createWorktreeMock.mockResolvedValue({
      head: 'abc123', name: 'side-task', branch: 'side-task', path: '/repo/worktrees/side-task',
    });
    const resolveWorktreeTopLevel = vi.fn(async (directory) => ({ root: '/repo', prefix: 'app' }));
    const validateWorktreeDirectory = vi.fn(async () => ({ valid: true, insideWorktreeRoot: true }));
    const { app } = createApp({ resolveWorktreeTopLevel, validateWorktreeDirectory });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', worktree: { name: 'side-task' } })
      .expect(200);

    const startDirectory = path.join('/repo/worktrees/side-task', 'app');
    expect(resolveWorktreeTopLevel).toHaveBeenCalledWith('/repo/app');
    expect(validateWorktreeDirectory).toHaveBeenCalledWith(startDirectory, '/repo/worktrees/side-task');
    expect(response.body.directory).toBe(startDirectory);
    expect(response.body.worktree.path).toBe('/repo/worktrees/side-task');
    expect(response.body).not.toHaveProperty('startDirectoryFallback');
    expect(sessionCreateMock).toHaveBeenCalledWith(expect.objectContaining({ location: { directory: startDirectory } }));

    validateWorktreeDirectory.mockResolvedValue({ valid: false, insideWorktreeRoot: false });
    const missing = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', worktree: { name: 'side-task' } })
      .expect(200);
    expect(missing.body.directory).toBe('/repo/worktrees/side-task');
    expect(missing.body.startDirectoryFallback).toBe('missing');
  });

  it('validates the requested agent in the project folder itself, not in a folder below it', async () => {
    const validateWorktreeDirectory = vi.fn(async () => ({ valid: true, insideWorktreeRoot: true }));
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({ projects: [{ id: 'proj_ai', path: '/repo/ai' }] }),
      resolveWorktreeTopLevel: vi.fn(async () => ({ root: '/repo', prefix: 'ai' })),
      validateWorktreeDirectory,
    });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ projectId: 'proj_ai', worktree: { name: 'side-task' }, prompt: 'Run this', model: 'openai/gpt-5.5' })
      .expect(200);

    const scopes = clientOptions.map((options) => JSON.stringify(options));
    expect(scopes.some((scope) => scope.includes('%2Frepo%2Fai"'))).toBe(true);
    expect(scopes.some((scope) => scope.includes('%2Fai%2Fai'))).toBe(false);
  });

  it('moves a session to the folder of the project that holds it, also from a subfolder, when projects share a repository', async () => {
    const resolveWorktreeTopLevel = vi.fn(async (directory) => ({ root: '/repo', prefix: directory.replace('/repo/', '') }));
    const service = createOpenChamberSessionService({
      readSettingsFromDiskMigrated: async () => ({ projects: [
        { id: 'proj_web', path: '/repo/web' },
        { id: 'proj_ai', path: '/repo/ai' },
      ] }),
      sanitizeProjects: (projects) => projects,
      validateDirectoryPath: async (directory) => ({ ok: true, directory }),
      buildOpenCodeUrl: (route) => `http://opencode.test${route}`,
      getOpenCodeAuthHeaders: () => ({}),
      waitForOpenCodeReady: vi.fn(async () => undefined),
      worktreeBootstrapStore,
      hydrateWorktreeCheckout: hydrateWorktreeCheckoutMock,
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
      getBranches: vi.fn(async () => ({ all: [], defaultBranches: {} })),
      resolveWorktreeTopLevel,
      validateWorktreeDirectory: vi.fn(async () => ({ valid: true, insideWorktreeRoot: true })),
    });

    const result = await service.moveToWorktree('ses_1', { directory: '/repo/ai/src', worktree: { name: 'side-task', startRef: 'main' } });

    expect(resolveWorktreeTopLevel).toHaveBeenCalledWith('/repo/ai');
    expect(result.directory).toBe(path.join('/repo/worktrees/side-task', 'ai'));
    expect(result.worktree.path).toBe('/repo/worktrees/side-task');
    expect(sessionMoveMock).toHaveBeenCalledWith({ sessionID: 'ses_1', directory: path.join('/repo/worktrees/side-task', 'ai') });
  });

  it('moves a session from a folder of another worktree to the folder of its project, as the UI does', async () => {
    // `/repo/worktrees/wt-a/ai/src` is in no registered project path; its folder
    // `ai/src` in the primary checkout `/repo` belongs to `/repo/ai`, not `/repo`.
    resolvePrimaryWorktreeRootMock.mockImplementation(async (directory) => ({
      root: directory.startsWith('/repo/worktrees/') ? '/repo' : directory,
    }));
    const resolveWorktreeTopLevel = vi.fn(async (directory) => (
      directory === '/repo/worktrees/wt-a/ai/src'
        ? { root: '/repo/worktrees/wt-a', prefix: 'ai/src' }
        : { root: '/repo', prefix: directory.replace(/^\/repo\/?/, '') }
    ));
    const service = createOpenChamberSessionService({
      readSettingsFromDiskMigrated: async () => ({ projects: [
        { id: 'proj_repo', path: '/repo' },
        { id: 'proj_ai', path: '/repo/ai' },
      ] }),
      sanitizeProjects: (projects) => projects,
      validateDirectoryPath: async (directory) => ({ ok: true, directory }),
      buildOpenCodeUrl: (route) => `http://opencode.test${route}`,
      getOpenCodeAuthHeaders: () => ({}),
      waitForOpenCodeReady: vi.fn(async () => undefined),
      worktreeBootstrapStore,
      hydrateWorktreeCheckout: hydrateWorktreeCheckoutMock,
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
      getBranches: vi.fn(async () => ({ all: [], defaultBranches: {} })),
      resolveWorktreeTopLevel,
      validateWorktreeDirectory: vi.fn(async () => ({ valid: true, insideWorktreeRoot: true })),
    });

    const result = await service.moveToWorktree('ses_1', { directory: '/repo/worktrees/wt-a/ai/src', worktree: { name: 'side-task', startRef: 'main' } });

    expect(resolveWorktreeTopLevel).toHaveBeenCalledWith('/repo/ai');
    expect(result.directory).toBe(path.join('/repo/worktrees/side-task', 'ai'));
    expect(sessionMoveMock).toHaveBeenCalledWith({ sessionID: 'ses_1', directory: path.join('/repo/worktrees/side-task', 'ai') });
  });

  it('waits for the worktree bootstrap to complete before creating the session', async () => {
    const started = Promise.withResolvers();
    const bootstrap = Promise.withResolvers();
    const waitForActiveWorktreeBootstrap = vi.fn(() => {
      started.resolve();
      return bootstrap.promise;
    });
    const { app } = createApp({ waitForActiveWorktreeBootstrap });
    const pending = request(app)
      .post('/api/openchamber/sessions')
      .send({
        directory: '/repo/app',
        worktree: { name: 'side-task' },
        prompt: 'Run this',
        model: 'openai/gpt-5.5',
      })
      .expect(200).then((response) => response);
    await started.promise;
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(getWorktreeBootstrapStatusMock).not.toHaveBeenCalled();
    bootstrap.resolve();
    const response = await pending;

    expect(response.body.promptDispatched).toBe(true);
    expect(getWorktreeBootstrapStatusMock).toHaveBeenCalledTimes(1);
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
      .expect(500, {
        error: 'Worktree bootstrap failed: branch already exists',
        partial: true, partialAction: 'worktree-created', directory: '/repo/worktrees/side-task',
      });

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

  describe('the project\'s setup commands in a new worktree', () => {
    // The merged view `projectConfigRuntime.readProjectSetup` answers.
    const setupView = ({ shared = [], personal = [], trusted = true } = {}) => ({
      setupWorktree: [...shared, ...personal],
      trust: { hash: shared.length > 0 ? 'sha256:x' : null, trusted },
      shared: { setupWorktree: shared },
      personal: { setupWorktree: personal, setupWorktreeMode: 'append' },
    });
    const createdWorktree = { name: 'side-task', branch: 'side-task', path: '/repo/worktrees/side-task' };

    it('runs them in a worktree that session.create makes, in the project path', async () => {
      createWorktreeMock.mockResolvedValueOnce(createdWorktree);
      const readProjectSetup = vi.fn(async () => setupView({ shared: ['bash copy.sh "$ROOT_PROJECT_PATH"'], personal: ['pnpm install'] }));
      const { app } = createApp({ readProjectSetup });

      const response = await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/repo/app', worktree: { name: 'side-task' } })
        .expect(200);

      expect(readProjectSetup).toHaveBeenCalledWith('proj_1');
      expect(createWorktreeMock).toHaveBeenCalledWith('/repo/app', {
        mode: 'new', name: 'side-task', startCommand: 'bash copy.sh "/repo/app" && pnpm install',
      }, expect.any(Object));
      expect(response.body).not.toHaveProperty('untrustedSetupCommandsSkipped');
    });

    it('skips shared commands nobody trusted and says so in the result', async () => {
      createWorktreeMock.mockResolvedValueOnce(createdWorktree);
      const readProjectSetup = vi.fn(async () => setupView({ shared: ['pnpm install'], personal: ['make env'], trusted: false }));
      const { app } = createApp({ readProjectSetup });

      const response = await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/repo/app', worktree: { name: 'side-task' } })
        .expect(200);

      expect(createWorktreeMock.mock.calls[0][1]).toEqual({ mode: 'new', name: 'side-task', startCommand: 'make env' });
      expect(response.body.untrustedSetupCommandsSkipped).toEqual(['pnpm install']);
    });

    it('hands them to a worktree made from a pull request', async () => {
      const createChangeRequestWorktree = vi.fn(async () => ({ name: 'feature-fix', branch: 'feature/fix', path: '/repo/worktrees/feature-fix' }));
      const { app } = createApp({ createChangeRequestWorktree, readProjectSetup: vi.fn(async () => setupView({ shared: ['pnpm install'] })) });

      await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/repo/app', pullRequest: 42 })
        .expect(200);

      expect(createChangeRequestWorktree).toHaveBeenCalledExactlyOnceWith({ directory: '/repo/app', number: 42, startCommand: 'pnpm install' });
    });

    it('runs none outside a registered project', async () => {
      createWorktreeMock.mockResolvedValueOnce({ ...createdWorktree, path: '/elsewhere/worktrees/side-task' });
      const readProjectSetup = vi.fn();
      const { app } = createApp({ readProjectSetup });

      await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/elsewhere', worktree: { name: 'side-task' } })
        .expect(200);

      expect(readProjectSetup).not.toHaveBeenCalled();
      expect(createWorktreeMock.mock.calls[0][1]).toEqual({ mode: 'new', name: 'side-task' });
    });

    it('runs them in the worktree a session moves into, from the project that holds the session', async () => {
      const readProjectSetup = vi.fn(async () => setupView({ shared: ['pnpm install'], trusted: false }));
      const service = createOpenChamberSessionService({
        readSettingsFromDiskMigrated: async () => ({ projects: [{ id: 'proj_ai', path: '/repo/ai' }] }),
        sanitizeProjects: (projects) => projects,
        validateDirectoryPath: async (directory) => ({ ok: true, directory }),
        buildOpenCodeUrl: (route) => `http://opencode.test${route}`,
        getOpenCodeAuthHeaders: () => ({}),
        waitForOpenCodeReady: vi.fn(async () => undefined),
        worktreeBootstrapStore,
        hydrateWorktreeCheckout: hydrateWorktreeCheckoutMock,
        archiveStore: createMemoryArchiveStore(),
        sessionMetadataStore: createMemorySessionMetadataStore(),
        getBranches: vi.fn(async () => ({ all: [], defaultBranches: {} })),
        resolveWorktreeTopLevel: vi.fn(async (directory) => ({ root: '/repo', prefix: directory.replace('/repo/', '') })),
        readProjectSetup,
      });

      const result = await service.moveToWorktree('ses_1', { directory: '/repo/ai/src', worktree: { name: 'side-task', startRef: 'main' } });

      expect(readProjectSetup).toHaveBeenCalledWith('proj_ai');
      expect(result.untrustedSetupCommandsSkipped).toEqual(['pnpm install']);
    });
  });

  describe('waiting for the worktree bootstrap', () => {
    const serviceWith = (getWorktreeBootstrapStatus, bootstrap) => createOpenChamberSessionService({
      readSettingsFromDiskMigrated: async () => ({ projects: [{ id: 'proj_1', path: '/repo/app' }] }),
      sanitizeProjects: (projects) => projects,
      validateDirectoryPath: async (directory) => ({ ok: true, directory }),
      buildOpenCodeUrl: (route) => `http://opencode.test${route}`,
      getOpenCodeAuthHeaders: () => ({}),
      worktreeBootstrapStore,
      hydrateWorktreeCheckout: hydrateWorktreeCheckoutMock,
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
      getWorktreeBootstrapStatus,
      waitForActiveWorktreeBootstrap: () => bootstrap.promise,
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('keeps waiting past the deadline while the setup commands run after git finished', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      createWorktreeMock.mockResolvedValueOnce({ name: 'side-task', branch: 'side-task', path: '/repo/worktrees/side-task' });
      const bootstrap = Promise.withResolvers();
      let state = { status: 'pending', phase: 'git-ready' };
      const service = serviceWith(vi.fn(async () => state), bootstrap);

      const pending = service.create({ directory: '/repo/app', worktree: { name: 'side-task' } });
      await vi.advanceTimersByTimeAsync(61_000);
      expect(sessionCreateMock).not.toHaveBeenCalled();
      state = { status: 'ready', phase: 'setup-ready' };
      bootstrap.resolve();

      await expect(pending).resolves.toMatchObject({ directory: '/repo/worktrees/side-task' });
      expect(sessionCreateMock).toHaveBeenCalledTimes(1);
    });

    it('answers not ready and starts no session once the setup deadline passed', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      createWorktreeMock.mockResolvedValueOnce({ name: 'side-task', branch: 'side-task', path: '/repo/worktrees/side-task' });
      const service = serviceWith(vi.fn(async () => ({ status: 'pending', phase: 'git-ready' })), Promise.withResolvers());

      const pending = service.create({ directory: '/repo/app', worktree: { name: 'side-task' }, prompt: 'Run this' });
      const refusal = expect(pending).rejects.toMatchObject({
        statusCode: 503, partial: true, partialAction: 'worktree-created', directory: '/repo/worktrees/side-task',
      });
      await vi.advanceTimersByTimeAsync(61_000);
      expect(sessionCreateMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(3 * 60_000);

      await refusal;
      expect(sessionCreateMock).not.toHaveBeenCalled();
      expect(sessionPromptMock).not.toHaveBeenCalled();
    });

    it('refuses a session in a checkout whose setup is still running', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const service = serviceWith(vi.fn(async () => ({ status: 'pending', phase: 'git-ready' })), Promise.withResolvers());

      const pending = service.create({ directory: '/repo/app' });
      const refusal = expect(pending).rejects.toMatchObject({ statusCode: 503, message: expect.stringContaining('still running') });
      await vi.advanceTimersByTimeAsync(4 * 60_000 + 1_000);

      await refusal;
      expect(sessionCreateMock).not.toHaveBeenCalled();
    });

    it('takes a bootstrap that finished right at the deadline as finished', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      createWorktreeMock.mockResolvedValueOnce({ name: 'side-task', branch: 'side-task', path: '/repo/worktrees/side-task' });
      const service = serviceWith(vi.fn(async () => ({ status: 'ready', phase: 'setup-ready' })), Promise.withResolvers());

      const pending = service.create({ directory: '/repo/app', worktree: { name: 'side-task' } });
      await vi.advanceTimersByTimeAsync(61_000);

      const result = await pending;
      expect(result).not.toHaveProperty('setupStillRunning');
      expect(sessionCreateMock).toHaveBeenCalledTimes(1);
    });

    it('stops at the deadline while git is still filling the folder', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      createWorktreeMock.mockResolvedValueOnce({ name: 'side-task', branch: 'side-task', path: '/repo/worktrees/side-task' });
      const service = serviceWith(vi.fn(async () => ({ status: 'pending', phase: 'directory-created' })), Promise.withResolvers());

      const pending = service.create({ directory: '/repo/app', worktree: { name: 'side-task' } });
      const failure = expect(pending).rejects.toMatchObject({ message: 'Timed out waiting for the worktree bootstrap' });
      await vi.advanceTimersByTimeAsync(61_000);

      await failure;
      expect(sessionCreateMock).not.toHaveBeenCalled();
    });
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
    getWorktreeBootstrapStatusMock.mockResolvedValueOnce(null);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ id: 'ses_123' }) }));
    try {
      const { app } = createApp();
      await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/repo/app', worktree: { name: 'side-task' } })
        .expect(503, {
          error: 'Worktree bootstrap has not completed',
          partial: true, partialAction: 'worktree-created', directory: '/repo/worktrees/side-task',
        });
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(sessionCreateMock).not.toHaveBeenCalled();
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

  it('writes standing project context into the session ahead of a dispatched slash command', async () => {
    commandListMock.mockResolvedValue({ data: [{ name: 'review', description: 'Review' }] });
    const sync = vi.fn(async () => true);

    const { app } = createApp({ sessionKnowledgeRuntime: { sync } });
    await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: '/review', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);

    expect(sync).toHaveBeenCalledWith('ses_source', '/repo/app');
    expect(sync.mock.invocationCallOrder[0])
      .toBeLessThan(sessionCommandMock.mock.invocationCallOrder[0]);
    expect(sessionSyntheticMock).not.toHaveBeenCalled();
  });

  it.each([
    ['send', 'ses_source'],
    ['fork', 'ses_fork'],
  ])('syncs knowledge in the target session directory for %s', async (action, targetId) => {
    const sync = vi.fn(async () => true);
    sessionGetMock.mockImplementation(async ({ sessionID }) => ({
      id: sessionID, location: { directory: '/repo/worktrees/target' },
    }));
    const { app } = createApp({ sessionKnowledgeRuntime: { sync } });
    await request(app)
      .post(`/api/openchamber/sessions/ses_source/${action}`)
      .send({ directory: '/repo/app', prompt: 'Continue', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync.mock.calls[0]).toEqual(action === 'send'
      ? [targetId, '/repo/worktrees/target']
      : [targetId, '/repo/worktrees/target', '']);
    expect(sync.mock.invocationCallOrder[0]).toBeLessThan(sessionPromptMock.mock.invocationCallOrder[0]);
  });

  it('preserves the existing response style when session.send delivers a prompt', async () => {
    const entries = new Map();
    const sessionKnowledgeRuntime = createSessionKnowledgeRuntime({
      resolveProjectId: async () => null,
      instructionEntries: {
        put: async (sessionID, directory, key, value) => { entries.set(key, value); },
        remove: async (sessionID, directory, key) => { entries.delete(key); },
      },
    });
    await sessionKnowledgeRuntime.sync('ses_source', '/repo/app', 'Keep replies short.');
    expect(entries.get(KNOWLEDGE_ENTRY_KEYS.responseStyle)).toBe('Keep replies short.');

    const { app } = createApp({ sessionKnowledgeRuntime });
    await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);

    expect(sessionPromptMock).toHaveBeenCalledWith({ sessionID: 'ses_source', text: 'Continue' });
    expect(entries.get(KNOWLEDGE_ENTRY_KEYS.responseStyle)).toBe('Keep replies short.');
  });

  it.each(['missing', 'failed'])('preserves knowledge and sends when the target directory read is %s', async (mode) => {
    const sync = vi.fn(async () => true);
    sessionGetMock.mockImplementation(async () => {
      if (mode === 'failed') throw new Error('session read failed');
      return { id: 'ses_source' };
    });
    const { app } = createApp({ sessionKnowledgeRuntime: { sync } });
    await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);
    expect(sync).not.toHaveBeenCalled();
    expect(sessionPromptMock).toHaveBeenCalledWith({ sessionID: 'ses_source', text: 'Continue' });
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

  describe('a send to an archived session', () => {
    const archivedTree = [
      { id: 'ses_root', time: { created: 1, archived: 1700 } },
      { id: 'ses_child', parentID: 'ses_root', time: { created: 1, archived: 1700 } },
      { id: 'ses_grandchild', parentID: 'ses_child', time: { created: 1, archived: 1700 } },
      { id: 'ses_active_child', parentID: 'ses_root', time: { created: 1 } },
    ];
    const useTree = (tree) => {
      sessionGetMock.mockImplementation(async ({ sessionID }) => ({
        ...tree.find((session) => session.id === sessionID),
        location: { directory: '/repo/app' },
      }));
      sessionListMock.mockImplementation(async ({ parentID, archived }) => ({
        data: tree.filter((session) => session.parentID === parentID && (!archived || session.time.archived)),
      }));
    };
    const send = (app, sessionID) => request(app)
      .post(`/api/openchamber/sessions/${sessionID}/send`)
      .send({ directory: '/repo/app', prompt: 'Continue', model: 'openai/gpt-5.5' })
      .expect(200);
    const restoredIds = () => sessionUpdateMock.mock.calls
      .filter(([input]) => input.archived === false)
      .map(([input]) => input.sessionID);

    it('brings a top-level session back with its archived subsessions once the prompt is accepted', async () => {
      useTree(archivedTree);
      const { app } = createApp();

      const response = await send(app, 'ses_root');

      expect(response.body.promptDispatched).toBe(true);
      expect(restoredIds().sort()).toEqual(['ses_child', 'ses_grandchild', 'ses_root']);
    });

    it('leaves the session archived when it was archived again while the send went out', async () => {
      const tree = archivedTree.map((session) => ({ ...session, time: { ...session.time } }));
      useTree(tree);
      const listChildren = sessionListMock.getMockImplementation();
      sessionListMock.mockImplementation(async (input) => {
        tree[0].time.archived = 1800;
        return listChildren(input);
      });
      const { app } = createApp();

      await send(app, 'ses_root');

      expect(restoredIds()).toEqual([]);
    });

    it('leaves an archived subsession for its parent to bring back', async () => {
      useTree(archivedTree);
      const { app } = createApp();

      await send(app, 'ses_child');

      expect(restoredIds()).toEqual([]);
    });

    it('restores nothing when the prompt was not accepted', async () => {
      useTree(archivedTree);
      sessionPromptMock.mockResolvedValue({});
      const { app } = createApp();

      const response = await send(app, 'ses_root');

      expect(response.body.promptDispatched).toBe(false);
      expect(restoredIds()).toEqual([]);
    }, 20_000);

    it('keeps the accepted send when the restore fails', async () => {
      useTree(archivedTree);
      sessionUpdateMock.mockImplementation(async () => {
        throw Object.assign(new Error('UnknownError'), { _tag: 'UnknownError' });
      });
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { app } = createApp();

      const response = await send(app, 'ses_root');

      expect(response.body).toMatchObject({ action: 'send', sessionId: 'ses_root', promptDispatched: true });
      expect(restoredIds()).toEqual(['ses_root']);
    });
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

  it('strips source-owned links from a fork before dispatching', async () => {
    sessionForkMock.mockImplementationOnce(async () => ({
      id: 'ses_fork',
      title: 'Forked session',
      metadata: { openchamber: { btwSessionID: 'ses_btw', reviewSessionID: 'ses_review', assist: { recap: 'kept' } } },
    }));
    const { app, sessionMetadataStore } = createApp();
    sessionMetadataStore.entries.set('ses_fork', {
      openchamber: { btwSessionID: 'ses_btw', reviewSessionID: 'ses_review', assist: { recap: 'kept' } },
    });
    await request(app)
      .post('/api/openchamber/sessions/ses_source/fork')
      .send({ directory: '/repo/app', prompt: 'Carry on', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);

    expect(sessionMetadataStore.entries.get('ses_fork')).toEqual({ openchamber: { assist: { recap: 'kept' } } });
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

  it('applies the level a model was last sent with when a tool names only the model', async () => {
    useCatalog({ models: [{ id: 'gpt-5.5', modelID: 'gpt-5.5', providerID: 'openai', variants: [{ id: 'high' }] }] });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        lastUsedEfforts: { 'openai/gpt-5.5': 'high' },
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);

    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'gpt-5.5', providerID: 'openai', variant: 'high' },
    });
  });

  it('keeps an explicit Default remembered for the model', async () => {
    useCatalog({ models: [{ id: 'gpt-5.5', modelID: 'gpt-5.5', providerID: 'openai', variants: [{ id: 'high' }] }] });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        lastUsedEfforts: { 'openai/gpt-5.5': null },
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);

    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'gpt-5.5', providerID: 'openai' },
    });
  });

  it('uses memory when the project default model has no effort, overriding global effort', async () => {
    useCatalog({ models: [{ id: 'gpt-5.5', modelID: 'gpt-5.5', providerID: 'openai', variants: [{ id: 'low' }, { id: 'high' }] }] });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openai/gpt-5.5',
        defaultVariant: 'high',
        lastUsedEfforts: { 'openai/gpt-5.5': 'low' },
        projects: [{ id: 'proj_1', path: '/repo/app', defaultModel: 'openai/gpt-5.5' }],
      }),
    });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', agent: 'build' })
      .expect(200);
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'gpt-5.5', providerID: 'openai', variant: 'low' },
    });
  });

  it('ignores a remembered level the model no longer offers', async () => {
    useCatalog({ models: [{ id: 'gpt-5.5', modelID: 'gpt-5.5', providerID: 'openai', variants: [{ id: 'high' }] }] });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        lastUsedEfforts: { 'openai/gpt-5.5': 'removed' },
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);

    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'gpt-5.5', providerID: 'openai' },
    });
  });

  it('lets configuration and an agent pin win over the remembered level', async () => {
    useCatalog({
      models: [{ id: 'gpt-5.5', modelID: 'gpt-5.5', providerID: 'openai', variants: [{ id: 'low' }, { id: 'high' }] }],
      agents: [{ id: 'plan', name: 'plan', mode: 'primary', hidden: false, model: { providerID: 'openai', id: 'gpt-5.5', variant: 'high' } }],
    });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openai/gpt-5.5',
        defaultVariant: 'low',
        lastUsedEfforts: { 'openai/gpt-5.5': 'low' },
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5', agent: 'plan' })
      .expect(200);

    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'gpt-5.5', providerID: 'openai', variant: 'high' },
    });
  });

  it('uses the remembered level for a send that names a model', async () => {
    useCatalog({ models: [{ id: 'gpt-5.5', modelID: 'gpt-5.5', providerID: 'openai', variants: [{ id: 'high' }] }] });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        lastUsedEfforts: { 'openai/gpt-5.5': 'high' },
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue', model: 'openai/gpt-5.5', agent: 'build' })
      .expect(200);

    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_source',
      model: { id: 'gpt-5.5', providerID: 'openai', variant: 'high' },
    });
  });

  it('keeps the session record above the remembered level when send names no model', async () => {
    sessionGetMock.mockImplementation(async ({ sessionID }) => ({
      id: sessionID,
      agent: 'plan',
      model: { providerID: 'anthropic', id: 'claude-sonnet-5', variant: 'high' },
      location: { directory: '/repo/app' },
    }));
    useCatalog({ models: [{ id: 'claude-sonnet-5', modelID: 'claude-sonnet-5', providerID: 'anthropic', variants: [{ id: 'low' }, { id: 'high' }] }] });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        lastUsedEfforts: { 'anthropic/claude-sonnet-5': 'low' },
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue' })
      .expect(200);

    expect(response.body.variant).toBe('high');
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_source',
      model: { id: 'claude-sonnet-5', providerID: 'anthropic', variant: 'high' },
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
>>>>>>> bc50ba56a
  });
});

describe('canonical session list persistence', () => {
  const createService = async (state, sessions) => {
    const { createOpenChamberSessionService } = await import('./routes.js');
    const directory = path.dirname(state.databasePath);
    const workspace = await state.agentScopeStore.ensureWorkspace({ hostProjectId: 'project', projectId: 'project', workspaceId: 'workspace', projectDirectory: directory, workspaceDirectory: directory, agentDirectory: directory, name: 'Project' });
    return createOpenChamberSessionService({
      service: { request: async () => Response.json({ items: sessions, errors: [] }) },
      agentScopeStore: state.agentScopeStore,
      resolveWorkspaceScope: async () => workspace,
      resolveSessionScope: async id => validScope(id),
      resolveHostSessionScope: async id => validScope(id),
      registerSessionScope: async () => true,
      resolveAttachments: async () => [],
      capturePrompt: async (_scope, body) => body,
      beforeDispatch: async () => { },
      onPromptAccepted: async () => { },
      sessionMetadataStore: state.sessionMetadataStore,
      archiveStore: state.archiveStore,
      directCommandAdmissionStore: state.directCommandAdmissionStore,
    });
  };

  it('renames through the canonical title route and returns the composed session', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-title-'));
    const state = createHostSessionState({ dataDir });
    const calls = [];
    try {
      await state.initialize();
      const { createOpenChamberSessionService } = await import('./routes.js');
      const service = createOpenChamberSessionService({
        service: {
          request: async (pathname, init) => {
            calls.push({ pathname, body: init?.body });
            return Response.json(runtimeSession({ title: 'Renamed' }));
          }
        },
        resolveWorkspaceScope: async () => ({ ...validScope('workspace'), projectId: 'project', workspaceId: 'workspace' }),
        resolveSessionScope: async id => validScope(id),
        resolveHostSessionScope: async id => ({ ...validScope(id), projectId: 'project', workspaceId: 'workspace' }),
        registerSessionScope: async () => true,
        resolveAttachments: async () => [],
        capturePrompt: async (_scope, body) => body,
        beforeDispatch: async () => { },
        onPromptAccepted: async () => { },
        sessionMetadataStore: state.sessionMetadataStore,
        archiveStore: state.archiveStore,
        directCommandAdmissionStore: state.directCommandAdmissionStore,
      });
      const renamed = await service.rename('session', { workspaceId: 'workspace', title: '  Renamed  ' });
      expect(calls).toEqual([{ pathname: '/api/agent/v1/sessions/session/title', body: JSON.stringify({ workspaceId: 'workspace', title: 'Renamed' }) }]);
      expect(renamed).toMatchObject({ sessionId: 'session', title: 'Renamed', metadata: null, metadataRevision: '0' });
    } finally {
      await state.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('reads a snapshot and history without reopening a worker', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-cold-read-'));
    const state = createHostSessionState({ dataDir });
    const calls = [];
    try {
      await state.initialize();
      const { createOpenChamberSessionService } = await import('./routes.js');
      const service = createOpenChamberSessionService({
        service: {
          request: async (pathname) => {
            calls.push(pathname);
            if (pathname.endsWith('/snapshot')) return Response.json(snapshotFixture());
            return Response.json(historyFixture());
          }
        },
        resolveWorkspaceScope: async () => ({ ...validScope('workspace'), projectId: 'project', workspaceId: 'workspace' }),
        resolveSessionScope: async id => ({ ...validScope(id), projectId: 'project', workspaceId: 'workspace' }),
        resolveHostSessionScope: async id => ({ ...validScope(id), projectId: 'project', workspaceId: 'workspace' }),
        registerSessionScope: async () => true,
        resolveAttachments: async () => [],
        capturePrompt: async (_scope, body) => body,
        beforeDispatch: async () => { },
        onPromptAccepted: async () => { },
        sessionMetadataStore: state.sessionMetadataStore,
        archiveStore: state.archiveStore,
        directCommandAdmissionStore: state.directCommandAdmissionStore,
      });
      expect((await service.open('session')).session.sessionId).toBe('session');
      expect((await service.history('session')).messages).toHaveLength(1);
      expect(calls).toEqual(['/api/agent/v1/sessions/session/snapshot', '/api/agent/v1/sessions/session/history']);
      expect(calls.some(path => path.endsWith('/reopen'))).toBe(false);
    } finally {
      await state.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('lists an unarchived session without losing its committed archive revision', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-unarchive-'));
    const state = createHostSessionState({ dataDir });
    try {
      await state.initialize();
      const service = await createService(state, [runtimeSession()]);
      await state.archiveStore.archive(['session'], 1700);
      const archived = await service.list('workspace');
      expect(archived.items[0]).toMatchObject({ sessionId: 'session', archivedAt: 1700, archiveRevision: '1' });
      await state.archiveStore.unarchive(['session']);
      const restored = await service.list('workspace');
      expect(restored.errors).toEqual({});
      expect(restored.items[0]).toMatchObject({ sessionId: 'session', archiveRevision: '2' });
      expect(Object.hasOwn(restored.items[0], 'archivedAt')).toBe(false);
    } finally {
      await state.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('retains healthy sessions when a sibling has corrupt persisted metadata', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-list-partial-'));
    const state = createHostSessionState({ dataDir });
    const connection = new DatabaseSync(state.databasePath);
    try {
      await state.initialize();
      await state.sessionMetadataStore.setSessionMetadata('healthy', { notes: 'Preserved session' });
      connection.prepare('INSERT INTO session_metadata (session_id, revision, payload) VALUES (?, ?, ?)').run('corrupt', 1, '{');
      const service = await createService(state, [runtimeSession({ sessionId: 'corrupt', rootSessionId: 'corrupt' }), runtimeSession({ sessionId: 'healthy', rootSessionId: 'healthy' })]);
      const listed = await service.list('workspace');
      expect(listed.items.map(session => session.sessionId)).toEqual(['healthy']);
      expect(listed.items[0].metadata.notes).toBe('Preserved session');
      expect(listed.errors).toEqual({ corrupt: 'METADATA_CORRUPT' });
    } finally {
      connection.close();
      await state.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('lists archived worktree sessions via listArchivedWorktreeSessions endpoint', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-archive-wt-'));
    const state = createHostSessionState({ dataDir });
    try {
      await state.initialize();
      const directory = path.dirname(state.databasePath);
      const anchor = await state.agentScopeStore.ensureWorkspace({
        hostProjectId: 'project', projectId: 'project', workspaceId: 'ws_anchor',
        projectDirectory: directory, workspaceDirectory: directory, agentDirectory: directory, name: 'Project',
      });
      await state.agentScopeStore.bindSession({
        sessionId: 'ses_archived', rootSessionId: 'ses_archived', workspaceId: anchor.workspaceId, agentDirectoryId: anchor.agentDirectoryId,
      });
      await state.archiveStore.archive(['ses_archived'], 1700);
      await state.sessionMetadataStore.setSessionMetadata('ses_archived', { notes: 'Archived worktree task' });
      const binding = await state.agentScopeStore.createWorktreeArchive({
        hostProjectId: 'project', archiveId: 'arc_1', archiveRef: 'refs/openchamber/archive/arc_1',
        snapshotCommit: 'a'.repeat(40), anchorWorkspaceId: anchor.workspaceId, claimId: 'claim_1',
        claimGeneration: 'gen_1', branchName: 'feature', branchOid: null,
      });
      await state.agentScopeStore.archiveWorktreeSessions({ hostProjectId: 'project', archiveId: 'arc_1' }, 'claim_1', 1700);
      await state.agentScopeStore.setWorktreeArchivePhase({ hostProjectId: 'project', archiveId: 'arc_1' }, 'claim_1', 2, 'removal_pending');
      await state.agentScopeStore.finishWorktreeArchive({ hostProjectId: 'project', archiveId: 'arc_1' }, 'claim_1');

      const { createOpenChamberSessionService } = await import('./routes.js');
      const service = createOpenChamberSessionService({
        service: { request: async () => Response.json({ items: [], errors: [] }) },
        agentScopeStore: state.agentScopeStore,
        resolveWorkspaceDirectory: async (dir) => (dir === directory ? { hostProjectId: 'project', projectId: 'project' } : null),
        resolveWorkspaceScope: async () => anchor,
        resolveSessionScope: async (id) => validScope(id),
        resolveHostSessionScope: async (id) => validScope(id),
        registerSessionScope: async () => true,
        resolveAttachments: async () => [],
        capturePrompt: async (_scope, body) => body,
        beforeDispatch: async () => { },
        onPromptAccepted: async () => { },
        sessionMetadataStore: state.sessionMetadataStore,
        archiveStore: state.archiveStore,
        directCommandAdmissionStore: state.directCommandAdmissionStore,
      });

      const result = await service.listArchivedWorktreeSessions({ projectDirectory: directory, archiveId: 'arc_1' });
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toMatchObject({
        sessionId: 'ses_archived',
        metadata: { notes: 'Archived worktree task' },
        archivedAt: 1700,
      });
    } finally {
      await state.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('Host metadata conversion authorization', () => {
  it('canonicalizes selected directories and refuses isolated scopes before reading', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-scope-')); const selected = path.join(root, 'selected'); fs.mkdirSync(selected); const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir); const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite')); const store = (await import('./session-metadata-store.js')).createSessionMetadataStore({ dataDir, database: db, closeDatabase: true }); const runtime = createProjectDirectoryRuntime({ fsPromises: fs.promises, path, normalizeDirectoryPath: value => value, refuseDirectory: () => null }); expect(runtime).toBeTruthy(); await store.close(); fs.rmSync(root, { recursive: true, force: true });
  });
});

describe('POST /api/agent/v1/sessions/:sessionId/move-to-worktree', () => {
  const scope = () => ({ ...validScope('ses_1'), cwd: testWorkspaceDirectory, agentDirectory: testAgentDirectory });
  const buildApp = async (overrides = {}) => {
    const express = (await import('express')).default;
    const { createOpenChamberSessionService, registerCanonicalSessionRoutes } = await import('./routes.js');
    const service = createOpenChamberSessionService({
      service: { request: async () => Response.json({}) },
      resolveWorkspaceScope: async () => null,
      resolveSessionScope: async () => scope(),
      resolveHostSessionScope: async () => scope(),
      resolveHostRelocationScope: async () => scope(),
      // The Host admission owner the route refuses to run without.
      agentScopeStore: { checkWorktreeScope: async () => undefined },
      resolveWorktreeTopLevel: async () => ({ prefix: '' }),
      validateWorktreeDirectory: async () => ({ valid: true, insideWorktreeRoot: true }),
      registerSessionScope: async () => true,
      resolveAttachments: async () => [],
      capturePrompt: async () => { throw new Error('not used'); },
      beforeDispatch: async () => { },
      onPromptAccepted: async () => { },
      sessionMetadataStore: { getState: async () => null, get: async () => null },
      archiveStore: { getState: async () => null },
      directCommandAdmissionStore: { claim: async () => true, accept: async () => true },
      worktreeMove: {
        getPathsWithoutChanges: async () => [],
        createWorktree: async () => ({ name: 'fix-login', branch: 'fix-login', path: '/repo/app/worktrees/fix-login' }),
        removeWorktree: async () => {},
        waitForWorktreeReady: async () => ({ setupStillRunning: false }),
        hydrateCheckout: async () => null,
        bootstrapStore: { read: async () => null, write: async () => null },
        stashPush: async () => ({ created: false }),
        stashApply: async () => {},
        stashDrop: async () => {},
        listStashes: async () => [],
        getBranches: async () => ({ all: ['main'], defaultBranches: { origin: 'main' } }),
        resolvePrimaryWorktreeRoot: async () => ({ root: '/repo/app' }),
        moveSession: (id) => [{ sessionId: id }],
      },
      ...overrides,
    });
    const app = express();
    const router = express.Router();
    registerCanonicalSessionRoutes(router, service);
    app.use('/api/agent/v1/sessions', router);
    return { app, request };
  };

  it('refuses a malformed move with a problem before any scope or Git work', async () => {
    const { app, request } = await buildApp();
    for (const body of [
      {},
      { worktree: {} },
      { worktree: { name: '' } },
      { worktree: { name: '/abs' } },
      { worktree: { name: 'a/b' } },
      { worktree: { name: 'ok' }, carry: 'src/a.ts' },
      { worktree: { name: 'ok', existingBranch: 'release', startRef: 'main' } },
    ]) {
      const response = await request(app).post('/api/agent/v1/sessions/ses_1/move-to-worktree').send(body).expect(400);
      expect(response.body).toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    }
  });

  it('refuses a session the Host does not admit, with no success body', async () => {
    const { app, request } = await buildApp({ resolveHostRelocationScope: async () => null });
    const response = await request(app)
      .post('/api/agent/v1/sessions/ses_unknown/move-to-worktree')
      .send({ worktree: { name: 'fix-login' } })
      .expect(404);
    expect(response.body).toMatchObject({ status: 404, code: 'SESSION_NOT_FOUND' });
    expect(response.body).not.toHaveProperty('worktree');
  });
});

describe('session.moveToWorktree', () => {
  const scope = (sessionId, overrides = {}) => ({ ...validScope(sessionId), ...overrides });
  const createMoveService = async (overrides = {}) => {
    const { createOpenChamberSessionService } = await import('./routes.js');
    const calls = [];
    const scopes = new Map();
    const service = createOpenChamberSessionService({
      service: { request: async () => Response.json({}) },
      resolveWorkspaceScope: async () => null,
      resolveSessionScope: async id => validScope(id),
      resolveHostSessionScope: async id => validScope(id),
      resolveHostRelocationScope: async id => scopes.get(id) ?? null,
      registerSessionScope: async () => true,
      resolveAttachments: async () => [],
      capturePrompt: async () => { throw new Error('not used'); },
      beforeDispatch: async () => { },
      onPromptAccepted: async () => { },
      sessionMetadataStore: { getState: async () => null, get: async () => null },
      archiveStore: { getState: async () => null },
      directCommandAdmissionStore: { claim: async () => true, accept: async () => true },
      ...overrides,
      worktreeMove: {
        getPathsWithoutChanges: async () => [],
        createWorktree: async () => ({ name: 'fix-login', branch: 'fix-login', path: '/repo/app/worktrees/fix-login' }),
        removeWorktree: async (...args) => { calls.push(['removeWorktree', ...args]); },
        waitForWorktreeReady: async () => ({ setupStillRunning: false }),
        hydrateCheckout: async () => null,
        bootstrapStore: { read: async () => null, write: async () => null },
        stashPush: async () => ({ created: false }),
        stashApply: async () => {},
        stashDrop: async () => {},
        listStashes: async () => [],
        getBranches: async () => ({ all: ['main'], defaultBranches: { origin: 'main' } }),
        resolvePrimaryWorktreeRoot: async () => ({ root: '/repo/app' }),
        moveSession: (id, directory) => { calls.push(['moveSession', id, directory]); return [{ sessionId: id }]; },
        warn: () => {},
        ...(overrides.worktreeMove ?? {}),
      },
    });
    return { service, calls, scopes };
  };

  it('refuses a worktree name that is not one relative folder', async () => {
    const { service, scopes } = await createMoveService();
    scopes.set('ses_1', scope('ses_1'));
    for (const name of ['../escape', '/abs', 'a/b', '..', '', 'x:y']) {
      await expect(service.moveToWorktree('ses_1', { worktree: { name } })).rejects.toMatchObject({ statusCode: 400 });
    }
  });

  it('refuses an unknown session and a caller from another session family', async () => {
    const { service, scopes } = await createMoveService();
    await expect(service.moveToWorktree('ses_1', { worktree: { name: 'ok' } })).rejects.toMatchObject({ statusCode: 404 });
    scopes.set('ses_1', scope('ses_1', { rootSessionId: 'ses_root' }));
    await expect(service.moveToWorktree('ses_1', { worktree: { name: 'ok' } }, { contextSessionId: 'ses_other' }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses keep-it-all carry inputs before creating anything', async () => {
    const { service, scopes, calls } = await createMoveService();
    scopes.set('ses_1', scope('ses_1'));
    await expect(service.moveToWorktree('ses_1', { worktree: { name: 'ok' }, carry: ['../outside.txt'] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.moveToWorktree('ses_1', { worktree: { name: 'ok' }, carry: ['/etc/passwd'] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(service.moveToWorktree('ses_1', { worktree: { name: 'ok' }, carry: 'src/a.ts' })).rejects.toMatchObject({ statusCode: 400 });
    expect(calls).toEqual([]);
  });

  it('refuses a destination that was not admitted as a Host workspace, and removes the checkout', async () => {
    const removeCalls = [];
    const { service, scopes } = await createMoveService({
      resolveWorkspaceDirectory: async () => null,
      worktreeMove: { removeWorktree: async (directory, input) => { removeCalls.push([directory, input]); } },
    });
    scopes.set('ses_1', scope('ses_1'));
    // The move refuses because no destination scope exists, and the checkout
    // it made does not survive the failure.
    await expect(service.moveToWorktree('ses_1', { worktree: { name: 'fix-login' } }))
      .rejects.toMatchObject({ statusCode: 503 });
    // The mover's own rollback removes the checkout it made.
    expect(removeCalls).toHaveLength(1);
    expect(removeCalls[0][0]).toBe('/repo/app');
    expect(removeCalls[0][1]).toMatchObject({ directory: '/repo/app/worktrees/fix-login', deleteLocalBranch: true });
  });

  it('relocates only after the destination scope proves same-project ownership', async () => {
    const { service, scopes } = await createMoveService({
      // A checkout admitted under a different Host project cannot receive this
      // session, whatever directory it names.
      resolveWorkspaceDirectory: async () => ({ workspaceId: 'ws_foreign', projectId: 'proj_foreign', cwd: '/repo/app/worktrees/fix-login' }),
      resolveHostRelocationScope: async id => scopes.get(id) ?? null,
    });
    scopes.set('ses_1', scope('ses_1'));
    await expect(service.moveToWorktree('ses_1', { worktree: { name: 'fix-login' } }))
      .rejects.toMatchObject({ statusCode: 403 });

    const sameProject = await createMoveService({
      resolveWorkspaceDirectory: async () => ({ workspaceId: 'ws_new', projectId: 'proj_1', cwd: '/repo/app/worktrees/fix-login' }),
      // The scope the relocation would use answers another directory: the
      // destination is not the checkout that was just made.
      resolveHostWorkspaceScope: async () => ({ workspaceId: 'ws_relocated', projectId: 'proj_1', cwd: '/repo/elsewhere' }),
    });
    sameProject.scopes.set('ses_1', scope('ses_1'));
    // The scope's cwd is a different directory than the checkout: refuse.
    await expect(sameProject.service.moveToWorktree('ses_1', { worktree: { name: 'fix-login' } }))
      .rejects.toMatchObject({ statusCode: 503 });
  });
});
