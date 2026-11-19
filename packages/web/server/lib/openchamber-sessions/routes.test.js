import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createProjectDirectoryRuntime } from '../host/project-directory-runtime.js';
import { createHostSessionState } from '../host/session-state.js';
import { history as historyFixture, runtimeSession, snapshot as snapshotFixture } from '../event-stream/canonical-test-fixtures.js';
import { mergeMetadataPatch } from './session-metadata-store.js';
import * as routes from './routes.js';


let routeFixture;
let routeFixtureDataDir;
let testWorkspaceDirectory;
let testAgentDirectory;

const createMemorySessionMetadataStore = () => {
  const entries = new Map(); const revisions = new Map();
  const merge = mergeMetadataPatch;
  return { entries, get: async id => entries.get(id) ?? null, getState: async id => entries.has(id) ? { metadata: entries.get(id), revision: String(revisions.get(id) ?? 1) } : null, setSessionMetadata: async (id, patch) => { const current = entries.get(id); const metadata = merge(current, patch); const changed = JSON.stringify(current) !== JSON.stringify(metadata); const revision = (revisions.get(id) ?? (current ? 1 : 0)) + (changed ? 1 : 0); entries.set(id, metadata); revisions.set(id, revision); return { metadata, revision: String(revision), changed }; }, updateSessionMetadata: async (id, decide) => { const current = entries.get(id) ?? {}; const patch = decide(current); if (!patch) return { metadata: current, revision: String(revisions.get(id) ?? (entries.has(id) ? 1 : 0)), changed: false }; const metadata = merge(current, patch); const revision = (revisions.get(id) ?? (entries.has(id) ? 1 : 0)) + 1; entries.set(id, metadata); revisions.set(id, revision); return { metadata, revision: String(revision), changed: true }; } };
};
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
  beforeAll(async () => {
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

  it('passes resolved host tools when reopening a cold session', async () => {
    let capturedReopenBody = null;
    const runtime = id => ({
      sessionId: id, rootSessionId: id, projectId: 'proj_1', workspaceId: 'ws_1', displayPath: 'app',
      createdAt: 1, updatedAt: 2, epoch: `epoch-${id}`, headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }
    });
    const service = {
      request: async (pathname, init = {}) => {
        if (pathname.endsWith('/reopen')) {
          capturedReopenBody = JSON.parse(init.body);
          return Response.json(runtime('ses_admitted'));
        }
        if (pathname.endsWith('/runs')) {
          const body = JSON.parse(init.body);
          return Response.json({ run: { runId: body.runId, sessionId: 'ses_admitted', status: 'running', origin: 'host', createdAt: 1 } });
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
      resolveHostTools: async () => ({ web: false, openchamber: true, notify: true }),
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
    await request(app).post('/api/agent/v1/sessions/ses_admitted/runs').send(prompt).expect(200);
    expect(capturedReopenBody).toMatchObject({
      rootSessionId: 'ses_admitted',
      hostTools: { web: false, openchamber: true, notify: true },
    });
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
    });
    expect(calls.filter(path => path.endsWith('/reopen'))).toHaveLength(0);
  });

  it('merges and announces workbench metadata patches and broadcasts each committed change', async () => {
    const sessionMetadataStore = createMemorySessionMetadataStore();
    const broadcastGlobalUiEvent = vi.fn();
    const { app } = createApp({ routes, sessionMetadataStore, broadcastGlobalUiEvent });

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
||||||| bc50ba56aa
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
>>>>>>> upstream/main
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
||||||| bc50ba56aa
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

  it('runs a named agent on the model it is bound to when the prompt omits one', async () => {
    useCatalog({
      agents: [
        { id: 'build', name: 'Build', mode: 'primary' },
        { id: 'plan', name: 'Plan', mode: 'primary', model: { providerID: 'anthropic', id: 'claude-sonnet-5', variant: 'high' } },
      ],
    });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openai/gpt-5.5',
        defaultAgent: 'build',
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', agent: 'plan' })
      .expect(200);

    // The binding outranks the settings default, and its effort comes with it.
    expect(response.body.model).toEqual({ providerID: 'anthropic', modelID: 'claude-sonnet-5' });
    expect(response.body.variant).toBe('high');
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'claude-sonnet-5', providerID: 'anthropic', variant: 'high' },
    });
    expect(sessionSwitchAgentMock).toHaveBeenCalledWith({ sessionID: 'ses_123', agent: 'plan' });
  });

  it('falls back to the defaults chain when the named agent binds no model', async () => {
    useCatalog({
      agents: [
        { id: 'build', name: 'Build', mode: 'primary' },
        { id: 'plan', name: 'Plan', mode: 'primary' },
      ],
    });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openai/gpt-5.5',
        defaultAgent: 'build',
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', agent: 'plan' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(response.body.agent).toBe('plan');
  });

  it('keeps an explicitly requested model over the named agent binding', async () => {
    useCatalog({
      agents: [
        { id: 'build', name: 'Build', mode: 'primary' },
        { id: 'plan', name: 'Plan', mode: 'primary', model: { providerID: 'anthropic', id: 'claude-sonnet-5' } },
      ],
    });
    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5', agent: 'plan' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(response.body.agent).toBe('plan');
  });

  it('keeps the session\'s previous model when send names an agent that binds one', async () => {
    useCatalog({
      agents: [
        { id: 'build', name: 'Build', mode: 'primary' },
        { id: 'plan', name: 'Plan', mode: 'primary', model: { providerID: 'anthropic', id: 'claude-sonnet-5', variant: 'high' } },
      ],
    });
    sessionGetMock.mockImplementation(async ({ sessionID }) => ({
      id: sessionID,
      agent: 'build',
      model: { providerID: 'openai', id: 'gpt-5.5' },
      location: { directory: '/repo/app' },
    }));
    setSessionMessages([{ id: 'msg_before', type: 'assistant', time: { created: 10, completed: 20 } }]);

    // Send/fork keep the session's own selection; the binding only fills a
    // dispatch that has no model to reuse.
    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue where you left off', agent: 'plan' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(response.body.agent).toBe('plan');
    // The binding did not take over: no switch to its model, no inherited effort.
    expect(response.body.variant).toBeUndefined();
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_source',
      model: { id: 'gpt-5.5', providerID: 'openai' },
    });
  });

  it('runs a sent-to session on the named agent binding when it has no model of its own', async () => {
    useCatalog({
      agents: [
        { id: 'build', name: 'Build', mode: 'primary' },
        { id: 'plan', name: 'Plan', mode: 'primary', model: { providerID: 'anthropic', id: 'claude-sonnet-5', variant: 'high' } },
      ],
    });
    sessionGetMock.mockImplementation(async ({ sessionID }) => ({
      id: sessionID,
      location: { directory: '/repo/app' },
    }));
    setSessionMessages([{ id: 'msg_before', type: 'assistant', time: { created: 10, completed: 20 } }]);

    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue where you left off', agent: 'plan' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'anthropic', modelID: 'claude-sonnet-5' });
    expect(response.body.variant).toBe('high');
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_source',
      model: { id: 'claude-sonnet-5', providerID: 'anthropic', variant: 'high' },
    });
  });

  it('falls back to the catalogue id when the picked model overrides its upstream name', async () => {
    useCatalog({
      models: [
        { id: 'derived-fast', modelID: 'vendor/base', providerID: 'custom-provider', variants: [] },
      ],
    });
    const { app } = createApp();

    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' })
      .expect(200);

    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'derived-fast', providerID: 'custom-provider' },
    });
  });

  it('resolves a reference to the exact catalogue id before a derived entry sharing its upstream name', async () => {
    useCatalog({
      models: [
        { id: 'derived-fast', modelID: 'base', providerID: 'vendor', variants: [{ id: 'high' }] },
        { id: 'base', modelID: 'base', providerID: 'vendor', variants: [] },
      ],
    });
    const { app } = createApp();

    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'vendor/base', variant: 'high' })
      .expect(400);

    // The level belongs to the derived entry, so the base model refuses it.
    expect(JSON.stringify(response.body)).toContain("Unknown variant 'high' for model 'vendor/base'");
  });

  it('accepts a provider/id reference whose catalogue id differs from its upstream modelID', async () => {
    // OpenCode model references are `provider/id` (Model.Ref.parse). A custom
    // provider may override the upstream name, so `modelID` differs from `id`;
    // lookups must use the id, not the wire name.
    useCatalog({
      models: [
        {
          id: 'deepseek-flash',
          modelID: 'deepseek/deepseek-flash',
          providerID: 'deepseek-litellm',
          variants: [{ id: 'high' }],
        },
      ],
    });
    const { app } = createApp();

    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'deepseek-litellm/deepseek-flash' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'deepseek-litellm', modelID: 'deepseek-flash' });
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'deepseek-flash', providerID: 'deepseek-litellm' },
    });
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
      const response = await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/repo/app', prompt: 'Run this' })
        .expect(200);
      return response.body.model;
    };

    expect(await create({ lastSelectedModel: 'anthropic/claude-sonnet-5' }))
      .toEqual({ providerID: 'anthropic', modelID: 'claude-sonnet-5' });
    // A model the catalog no longer lists (its provider was removed): skipped.
    expect(await create({ lastSelectedModel: 'claude-code/opus' }))
      .toEqual({ providerID: 'opencode', modelID: 'big-pickle' });
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

  it('skips a configured model whose provider the catalog no longer lists', async () => {
    useCatalog({
      models: [{ id: 'big-pickle', modelID: 'big-pickle', providerID: 'opencode', variants: [] }, ...CATALOG_MODELS],
    });
    const create = async (settings) => {
      const { app } = createApp({ readSettingsFromDiskMigrated: async () => settings });
      const response = await request(app)
        .post('/api/openchamber/sessions')
        .send({ directory: '/repo/app', prompt: 'Run this' })
        .expect(200);
      return response.body.model;
    };

    // The project's model is gone: the global default applies.
    expect(await create({
      defaultModel: 'openai/gpt-5.5',
      projects: [{ id: 'proj_1', path: '/repo/app', defaultModel: 'removed/chosen' }],
    })).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    // Both are gone: the fallback applies.
    expect(await create({
      defaultModel: 'removed/global',
      projects: [{ id: 'proj_1', path: '/repo/app', defaultModel: 'removed/chosen' }],
    })).toEqual({ providerID: 'opencode', modelID: 'big-pickle' });

    // An empty catalog says nothing about what exists: the project's model stands.
    useCatalog({ models: [] });
    expect(await create({
      defaultModel: 'openai/gpt-5.5',
      projects: [{ id: 'proj_1', path: '/repo/app', defaultModel: 'removed/chosen' }],
    })).toEqual({ providerID: 'removed', modelID: 'chosen' });
  });

  it('runs a named agent on the model it is bound to when the prompt omits one', async () => {
    useCatalog({
      agents: [
        { id: 'build', name: 'Build', mode: 'primary' },
        { id: 'plan', name: 'Plan', mode: 'primary', model: { providerID: 'anthropic', id: 'claude-sonnet-5', variant: 'high' } },
      ],
    });
    const { app } = createApp({
      readSettingsFromDiskMigrated: async () => ({
        defaultModel: 'openai/gpt-5.5',
        defaultAgent: 'build',
        projects: [{ id: 'proj_1', path: '/repo/app' }],
      }),
    });
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', agent: 'plan' })
      .expect(200);

    // The binding outranks the settings default, and its effort comes with it.
    expect(response.body.model).toEqual({ providerID: 'anthropic', modelID: 'claude-sonnet-5' });
    expect(response.body.variant).toBe('high');
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'claude-sonnet-5', providerID: 'anthropic', variant: 'high' },
    });
    expect(sessionSwitchAgentMock).toHaveBeenCalledWith({ sessionID: 'ses_123', agent: 'plan' });
  });

  it('keeps an explicitly requested model over the named agent binding', async () => {
    useCatalog({
      agents: [
        { id: 'build', name: 'Build', mode: 'primary' },
        { id: 'plan', name: 'Plan', mode: 'primary', model: { providerID: 'anthropic', id: 'claude-sonnet-5' } },
      ],
    });
    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'openai/gpt-5.5', agent: 'plan' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(response.body.agent).toBe('plan');
  });

  it('keeps the session\'s previous model when send names an agent that binds one', async () => {
    useCatalog({
      agents: [
        { id: 'build', name: 'Build', mode: 'primary' },
        { id: 'plan', name: 'Plan', mode: 'primary', model: { providerID: 'anthropic', id: 'claude-sonnet-5', variant: 'high' } },
      ],
    });
    sessionGetMock.mockImplementation(async ({ sessionID }) => ({
      id: sessionID,
      agent: 'build',
      model: { providerID: 'openai', id: 'gpt-5.5' },
      location: { directory: '/repo/app' },
    }));
    setSessionMessages([{ id: 'msg_before', type: 'assistant', time: { created: 10, completed: 20 } }]);

    // Send/fork keep the session's own selection; the binding only fills a
    // dispatch that has no model to reuse.
    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue where you left off', agent: 'plan' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'openai', modelID: 'gpt-5.5' });
    expect(response.body.agent).toBe('plan');
    // The binding did not take over: no switch to its model, no inherited effort.
    expect(response.body.variant).toBeUndefined();
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_source',
      model: { id: 'gpt-5.5', providerID: 'openai' },
    });
  });

  it('runs a sent-to session on the named agent binding when it has no model of its own', async () => {
    useCatalog({
      agents: [
        { id: 'build', name: 'Build', mode: 'primary' },
        { id: 'plan', name: 'Plan', mode: 'primary', model: { providerID: 'anthropic', id: 'claude-sonnet-5', variant: 'high' } },
      ],
    });
    sessionGetMock.mockImplementation(async ({ sessionID }) => ({
      id: sessionID,
      location: { directory: '/repo/app' },
    }));
    setSessionMessages([{ id: 'msg_before', type: 'assistant', time: { created: 10, completed: 20 } }]);

    const { app } = createApp();
    const response = await request(app)
      .post('/api/openchamber/sessions/ses_source/send')
      .send({ directory: '/repo/app', prompt: 'Continue where you left off', agent: 'plan' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'anthropic', modelID: 'claude-sonnet-5' });
    expect(response.body.variant).toBe('high');
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_source',
      model: { id: 'claude-sonnet-5', providerID: 'anthropic', variant: 'high' },
    });
  });

  it('falls back to the catalogue id when the picked model overrides its upstream name', async () => {
    useCatalog({
      models: [
        { id: 'derived-fast', modelID: 'vendor/base', providerID: 'custom-provider', variants: [] },
      ],
    });
    const { app } = createApp();

    await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this' })
      .expect(200);

    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'derived-fast', providerID: 'custom-provider' },
    });
  });

  it('resolves a reference to the exact catalogue id before a derived entry sharing its upstream name', async () => {
    useCatalog({
      models: [
        { id: 'derived-fast', modelID: 'base', providerID: 'vendor', variants: [{ id: 'high' }] },
        { id: 'base', modelID: 'base', providerID: 'vendor', variants: [] },
      ],
    });
    const { app } = createApp();

    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'vendor/base', variant: 'high' })
      .expect(400);

    // The level belongs to the derived entry, so the base model refuses it.
    expect(JSON.stringify(response.body)).toContain("Unknown variant 'high' for model 'vendor/base'");
  });

  it('accepts a provider/id reference whose catalogue id differs from its upstream modelID', async () => {
    // OpenCode model references are `provider/id` (Model.Ref.parse). A custom
    // provider may override the upstream name, so `modelID` differs from `id`;
    // lookups must use the id, not the wire name.
    useCatalog({
      models: [
        {
          id: 'deepseek-flash',
          modelID: 'deepseek/deepseek-flash',
          providerID: 'deepseek-litellm',
          variants: [{ id: 'high' }],
        },
      ],
    });
    const { app } = createApp();

    const response = await request(app)
      .post('/api/openchamber/sessions')
      .send({ directory: '/repo/app', prompt: 'Run this', model: 'deepseek-litellm/deepseek-flash' })
      .expect(200);

    expect(response.body.model).toEqual({ providerID: 'deepseek-litellm', modelID: 'deepseek-flash' });
    expect(sessionSwitchModelMock).toHaveBeenCalledWith({
      sessionID: 'ses_123',
      model: { id: 'deepseek-flash', providerID: 'deepseek-litellm' },
    });
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
>>>>>>> upstream/main
      };
      const { app } = createApp({
        routes,
        service,
        agentScopeStore: routeFixture.agentScopeStore,
        resolveSessionScope: async (id) => id === 'ses_parent' ? validScope('ses_parent') : null,
      });
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

  describe('prompt admission for root and child sessions', () => {
    it('refuses root prompt carrying agentId but admits child session prompt carrying agentId', async () => {
      const live = new Set();
      const calls = [];
      const runtime = id => ({
        sessionId: id, rootSessionId: id, projectId: 'proj_1', workspaceId: 'ws_1', displayPath: 'app',
        createdAt: 1, updatedAt: 2, epoch: `epoch-${id}`, headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }
      });
      const service = {
        request: async (pathname, init = {}) => {
          calls.push(pathname);
          const id = decodeURIComponent(pathname.split('/').at(-2));
          if (pathname.endsWith('/reopen')) {
            live.add(id);
            return Response.json(runtime(id));
          }
          if (pathname.endsWith('/runs')) {
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
        resolveSessionScope: async id => {
          if (id === 'ses_child') return { ...validScope('ses_child'), parentSessionId: 'ses_parent' };
          return validScope(id);
        },
        resolveHostSessionScope: async id => {
          if (id === 'ses_child') return { ...validScope('ses_child'), parentSessionId: 'ses_parent' };
          return validScope(id);
        },
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

      const promptWithAgent = {
        input: { text: 'with agent', attachments: [], context: [] },
        options: { providerId: null, modelId: null, agentId: 'task-agent-id', variant: null, reasoningEffort: null },
      };

      const rootRes = await request(app)
        .post('/api/agent/v1/sessions/ses_root/runs')
        .send(promptWithAgent)
        .expect(400);
      expect(rootRes.body.detail).toContain('Root prompt agentId must be null');

      const childRes = await request(app)
        .post('/api/agent/v1/sessions/ses_child/runs')
        .send(promptWithAgent)
        .expect(200);
      expect(childRes.body.run).toMatchObject({ sessionId: 'ses_child', status: 'running' });
    });

    it('admits child session prompt carrying agentId when parentSessionId is recovered via subagentSessions fallback', async () => {
      const calls = [];
      const live = new Set();
      let createdChildId = '';
      const runtime = id => ({
        sessionId: id, rootSessionId: id, projectId: 'proj_1', workspaceId: 'ws_1', displayPath: 'app',
        createdAt: 1, updatedAt: 2, epoch: `epoch-${id}`, headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }
      });
      const service = {
        request: async (pathname, init = {}) => {
          calls.push(pathname);
          if (pathname === '/internal/sessions' && init.method === 'POST') {
            const body = JSON.parse(init.body);
            createdChildId = body.rootSessionId;
            return Response.json({
              ...runtime(body.rootSessionId),
              projectId: body.projectId,
              workspaceId: body.workspaceId,
              parentSessionId: body.parentSessionId,
            });
          }
          const id = decodeURIComponent(pathname.split('/').at(-2));
          if (pathname.endsWith('/reopen')) {
            live.add(id);
            return Response.json(runtime(id));
          }
          if (pathname.endsWith('/runs')) {
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
        resolveWorkspaceScope: async () => validScope('ws_1'),
        resolveSessionScope: async id => ({ ...validScope(id), workspaceId: 'ws_1', projectId: 'proj_1' }),
        resolveHostSessionScope: async id => ({ ...validScope(id), workspaceId: 'ws_1', projectId: 'proj_1' }),
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

      const createRes = await request(app)
        .post('/api/agent/v1/sessions')
        .send({
          projectId: 'proj_1',
          workspaceId: 'ws_1',
          parentSessionId: 'ses_parent_root',
          options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
        })
        .expect(200);
      expect(createdChildId).toBeTruthy();

      const promptWithAgent = {
        input: { text: 'with agent', attachments: [], context: [] },
        options: { providerId: null, modelId: null, agentId: 'task-agent-id', variant: null, reasoningEffort: null },
      };

      const childRes = await request(app)
        .post(`/api/agent/v1/sessions/${encodeURIComponent(createdChildId)}/runs`)
        .send(promptWithAgent)
        .expect(200);
      expect(childRes.body.run).toMatchObject({ sessionId: createdChildId, status: 'running' });
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
<<<<<<< HEAD
||||||| bc50ba56aa
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
=======
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
        data: tree.filter((session) => (parentID === undefined || session.parentID === parentID) && (!archived || session.time.archived)),
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

    it("brings back the root's workflow agents, which only OpenChamber's metadata links to it", async () => {
      useTree([
        ...archivedTree,
        { id: 'ses_agent', metadata: { openchamber: { kind: 'workflow-agent', parentID: 'ses_root' } }, time: { created: 1, archived: 1700 } },
        { id: 'ses_agent_sub', parentID: 'ses_agent', time: { created: 1, archived: 1700 } },
      ]);
      const { app } = createApp();

      await send(app, 'ses_root');

      expect(restoredIds().sort()).toEqual(['ses_agent', 'ses_agent_sub', 'ses_child', 'ses_grandchild', 'ses_root']);
      // Every folder's archive: a subsession can stay behind when its parent moves to another worktree.
      expect(sessionListMock.mock.calls.every(([input]) => !('directory' in input))).toBe(true);
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
>>>>>>> upstream/main
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
        removeWorktree: async () => { },
        waitForWorktreeReady: async () => ({ setupStillRunning: false }),
        hydrateCheckout: async () => null,
        bootstrapStore: { read: async () => null, write: async () => null },
        stashPush: async () => ({ created: false }),
        stashApply: async () => { },
        stashDrop: async () => { },
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
        stashApply: async () => { },
        stashDrop: async () => { },
        listStashes: async () => [],
        getBranches: async () => ({ all: ['main'], defaultBranches: { origin: 'main' } }),
        resolvePrimaryWorktreeRoot: async () => ({ root: '/repo/app' }),
        moveSession: (id, directory) => { calls.push(['moveSession', id, directory]); return [{ sessionId: id }]; },
        warn: () => { },
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

describe('speculative session preparation', () => {
  let prepDataDir;
  let prepState;
  let prepWorkspace;

  beforeAll(async () => {
    prepDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'routes-prep-'));
    prepState = createHostSessionState({ dataDir: prepDataDir });
    await prepState.initialize();
    const appDir = path.join(prepDataDir, 'app');
    const agentDir = path.join(appDir, '.agents');
    fs.mkdirSync(agentDir, { recursive: true });
    prepWorkspace = await prepState.agentScopeStore.ensureWorkspace({
      hostProjectId: 'proj_prep',
      projectId: 'proj_prep',
      workspaceId: 'ws_prep',
      projectDirectory: appDir,
      workspaceDirectory: appDir,
      agentDirectory: agentDir,
      name: 'Prep Workspace',
    });
  });

  afterAll(async () => {
    await prepState?.close();
    if (prepDataDir) fs.rmSync(prepDataDir, { recursive: true, force: true });
  });

  let workspaceCounter = 0;
  const createTestWorkspace = async () => {
    workspaceCounter += 1;
    const workspaceId = `ws_prep_${workspaceCounter}`;
    const appDir = path.join(prepDataDir, `app_${workspaceCounter}`);
    const agentDir = path.join(appDir, '.agents');
    fs.mkdirSync(agentDir, { recursive: true });
    return await prepState.agentScopeStore.ensureWorkspace({
      hostProjectId: `proj_prep_${workspaceCounter}`,
      projectId: `proj_prep_${workspaceCounter}`,
      workspaceId,
      projectDirectory: appDir,
      workspaceDirectory: appDir,
      agentDirectory: agentDir,
      name: `Prep Workspace ${workspaceCounter}`,
    });
  };

  const setupApp = (serviceRequest, workspace) => {
    const app = express();
    const router = express.Router();
    const { createOpenChamberSessionService, registerCanonicalSessionRoutes } = routes;
    const sessionService = createOpenChamberSessionService({
      agentScopeStore: prepState.agentScopeStore,
      service: { request: serviceRequest },
      resolveWorkspaceScope: async (id) => (id === workspace.workspaceId ? workspace : null),
      resolveSessionScope: async (id) => {
        const bound = await prepState.agentScopeStore.getSession(id);
        if (!bound) return null;
        return {
          sessionId: bound.sessionId,
          rootSessionId: bound.rootSessionId,
          projectId: workspace.projectId,
          workspaceId: bound.workspaceId,
          cwd: workspace.cwd,
          agentDirectory: workspace.agentDirectory,
          agentDirectoryId: bound.agentDirectoryId,
          displayPath: 'app',
        };
      },
      resolveHostSessionScope: async (id) => {
        const bound = await prepState.agentScopeStore.getSession(id);
        if (!bound) return null;
        return {
          sessionId: bound.sessionId,
          rootSessionId: bound.rootSessionId,
          projectId: workspace.projectId,
          workspaceId: bound.workspaceId,
          cwd: workspace.cwd,
          agentDirectory: workspace.agentDirectory,
          agentDirectoryId: bound.agentDirectoryId,
          displayPath: 'app',
        };
      },
      registerSessionScope: async (runtime) => {
        await prepState.agentScopeStore.bindSession({
          sessionId: runtime.sessionId,
          rootSessionId: runtime.rootSessionId,
          workspaceId: runtime.workspaceId,
          agentDirectoryId: workspace.agentDirectoryId,
        });
        return true;
      },
      resolveAttachments: async () => [],
      capturePrompt: async (_scope, body) => body,
      beforeDispatch: async () => { },
      onPromptAccepted: async () => { },
      directCommandAdmissionStore: prepState.directCommandAdmissionStore,
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
    });
    registerCanonicalSessionRoutes(router, sessionService);
    app.use('/api/agent/v1/sessions', router);
    return { app, sessionService };
  };

  it('enforces auth and validation parity on prepare and discard endpoints', async () => {
    const ws = await createTestWorkspace();
    const { app, sessionService } = setupApp(async () => Response.json({}), ws);
    try {
      await request(app).post('/api/agent/v1/sessions/prepare').send({}).expect(400);
      await request(app).post('/api/agent/v1/sessions/prepare').send({ projectId: ws.projectId }).expect(400);
      await request(app).post('/api/agent/v1/sessions/prepare').send({ projectId: ws.projectId, workspaceId: 'ws_unknown' }).expect(404);
      const res = await request(app).delete('/api/agent/v1/sessions/prepare').send({}).expect(200);
      expect(res.body).toEqual({ ok: false });
    } finally {
      await sessionService.close();
    }
  });

  it('maintains at most 1 prepared session per workspace and reuses it on create', async () => {
    const ws = await createTestWorkspace();
    let createdCount = 0;
    const { app, sessionService } = setupApp(async (pathname, init) => {
      if (pathname === '/internal/sessions' && init.method === 'POST') {
        createdCount += 1;
        const body = JSON.parse(init.body);
        return Response.json(runtimeSession({ sessionId: body.rootSessionId, rootSessionId: body.rootSessionId, projectId: ws.projectId, workspaceId: ws.workspaceId }));
      }
      throw new Error(`Unexpected request: ${pathname}`);
    }, ws);
    try {
      const prep1 = await request(app).post('/api/agent/v1/sessions/prepare').send({ projectId: ws.projectId, workspaceId: ws.workspaceId }).expect(200);
      expect(prep1.body.ok).toBe(true);
      expect(prep1.body.sessionId).toBeDefined();
      expect(createdCount).toBe(1);

      const prep2 = await request(app).post('/api/agent/v1/sessions/prepare').send({ projectId: ws.projectId, workspaceId: ws.workspaceId }).expect(200);
      expect(prep2.body.ok).toBe(true);
      expect(prep2.body.sessionId).toBe(prep1.body.sessionId);
      expect(createdCount).toBe(1);

      const createRes = await request(app).post('/api/agent/v1/sessions').send({
        projectId: ws.projectId, workspaceId: ws.workspaceId, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }
      }).expect(200);
      expect(createRes.body.session.sessionId).toBe(prep1.body.sessionId);
      expect(createdCount).toBe(1);

      const createRes2 = await request(app).post('/api/agent/v1/sessions').send({
        projectId: ws.projectId, workspaceId: ws.workspaceId, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }
      }).expect(200);
      expect(createRes2.body.session.sessionId).not.toBe(prep1.body.sessionId);
      expect(createdCount).toBe(2);
    } finally {
      await sessionService.close();
    }
  });

  it('discards prepared session on DELETE /prepare', async () => {
    const ws = await createTestWorkspace();
    let deletedId = null;
    const { app, sessionService } = setupApp(async (pathname, init) => {
      if (pathname === '/internal/sessions' && init.method === 'POST') {
        const body = JSON.parse(init.body);
        return Response.json(runtimeSession({ sessionId: body.rootSessionId, rootSessionId: body.rootSessionId, projectId: ws.projectId, workspaceId: ws.workspaceId }));
      }
      if (pathname.startsWith('/internal/workers/') && init.method === 'DELETE') {
        deletedId = decodeURIComponent(pathname.split('/').pop());
        return Response.json({ ok: true });
      }
      if (pathname.startsWith('/api/agent/v1/sessions/') && init.method === 'DELETE') {
        deletedId = decodeURIComponent(pathname.split('/').pop());
        return Response.json({ sessionId: deletedId, deletedSessionIds: [deletedId] });
      }
      if (pathname.endsWith('/reopen') && init.method === 'POST') {
        const id = decodeURIComponent(pathname.split('/').at(-2));
        return Response.json(runtimeSession({ sessionId: id, rootSessionId: id, projectId: ws.projectId, workspaceId: ws.workspaceId }));
      }
      return Response.json({});
    }, ws);
    try {
      const prep = await request(app).post('/api/agent/v1/sessions/prepare').send({ projectId: ws.projectId, workspaceId: ws.workspaceId }).expect(200);
      const discarded = await request(app).delete('/api/agent/v1/sessions/prepare').send({ workspaceId: ws.workspaceId }).expect(200);
      expect(discarded.body).toEqual({ ok: true });
      expect(deletedId).toBe(prep.body.sessionId);
    } finally {
      await sessionService.close();
    }
  });

  it('reaps an idle prepared session after its timeout and spawns a new one next time', async () => {
    const ws = await createTestWorkspace();
    let createdCount = 0;
    const deleted = [];
    const { app, sessionService } = setupApp(async (pathname, init) => {
      if (pathname === '/internal/sessions' && init.method === 'POST') {
        createdCount += 1;
        const body = JSON.parse(init.body);
        return Response.json(runtimeSession({ sessionId: body.rootSessionId, rootSessionId: body.rootSessionId, projectId: ws.projectId, workspaceId: ws.workspaceId }));
      }
      if (pathname.endsWith('/reopen') && init.method === 'POST') {
        const id = decodeURIComponent(pathname.split('/').at(-2));
        return Response.json(runtimeSession({ sessionId: id, rootSessionId: id, projectId: ws.projectId, workspaceId: ws.workspaceId }));
      }
      if (pathname.startsWith('/internal/workers/') && init.method === 'DELETE') {
        deleted.push(decodeURIComponent(pathname.split('/').pop()));
        return Response.json({ ok: true });
      }
      if (pathname.startsWith('/api/agent/v1/sessions/') && init.method === 'DELETE') {
        const id = decodeURIComponent(pathname.split('/').pop());
        deleted.push(id);
        return Response.json({ sessionId: id, deletedSessionIds: [id] });
      }
      return Response.json({});
    }, ws);
    // Only the timer under test is faked: the HTTP request needs the real clock to
    // settle, so overriding everything would deadlock the request itself.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const prep = await request(app).post('/api/agent/v1/sessions/prepare').send({ projectId: ws.projectId, workspaceId: ws.workspaceId }).expect(200);
      expect(createdCount).toBe(1);
      // Nothing is reaped before the documented five minutes.
      await vi.advanceTimersByTimeAsync(299_000);
      expect(deleted).toEqual([]);
      await vi.advanceTimersByTimeAsync(1_500);
      expect(deleted).toEqual([prep.body.sessionId]);
      // The reaped session is gone from the pool: the next prepare spawns again
      // rather than handing back the session it just discarded.
      const again = await request(app).post('/api/agent/v1/sessions/prepare').send({ projectId: ws.projectId, workspaceId: ws.workspaceId }).expect(200);
      expect(createdCount).toBe(2);
      expect(again.body.sessionId).not.toBe(prep.body.sessionId);
    } finally {
      vi.useRealTimers();
      await sessionService.close();
    }
  });

  it('reaps idle prepared sessions via timer and falls back cleanly on prepare failure', async () => {
    const ws = await createTestWorkspace();
    let shouldFail = true;
    let createAttempts = 0;
    const { app, sessionService } = setupApp(async (pathname, init) => {
      if (pathname === '/internal/sessions' && init.method === 'POST') {
        createAttempts += 1;
        if (shouldFail) {
          return Response.json({ type: 'urn:ohpichamber:problem:INVALID_REQUEST', title: 'Refused', status: 400, code: 'INVALID_REQUEST', detail: 'Worker validation failed' }, { status: 400 });
        }
        const body = JSON.parse(init.body);
        return Response.json(runtimeSession({ sessionId: body.rootSessionId, rootSessionId: body.rootSessionId, projectId: ws.projectId, workspaceId: ws.workspaceId }));
      }
      return Response.json({});
    }, ws);
    try {
      await request(app).post('/api/agent/v1/sessions/prepare').send({ projectId: ws.projectId, workspaceId: ws.workspaceId }).expect(400);
      expect(createAttempts).toBe(1);

      shouldFail = false;
      const res = await request(app).post('/api/agent/v1/sessions').send({
        projectId: ws.projectId, workspaceId: ws.workspaceId, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }
      }).expect(200);
      expect(res.body.session.sessionId).toBeDefined();
      expect(createAttempts).toBe(2);
    } finally {
      await sessionService.close();
    }
  });

  it('prevents HTTP 409 collision when create races an in-flight prepare', async () => {
    const ws = await createTestWorkspace();
    let createdCount = 0;
    // Prepare resolves its workspace before it registers itself. Delaying that first
    // resolve holds prepare mid-body, so the create arrives while prepare is still
    // unregistered: the window the fix closes. Without the fix prepare registers too
    // late, create starts its own admission, and the supervisor refuses one of the
    // two — the 409 this test names. Both requests must end with the same session.
    let scopeResolves = 0;
    const app = express();
    const router = express.Router();
    const { createOpenChamberSessionService, registerCanonicalSessionRoutes } = routes;
    const sessionService = createOpenChamberSessionService({
      agentScopeStore: prepState.agentScopeStore,
      service: { request: async (pathname, init) => {
        if (pathname === '/internal/sessions' && init.method === 'POST') {
          createdCount += 1;
          const body = JSON.parse(init.body);
          return Response.json(runtimeSession({ sessionId: body.rootSessionId, rootSessionId: body.rootSessionId, projectId: ws.projectId, workspaceId: ws.workspaceId }));
        }
        return Response.json({});
      } },
      resolveWorkspaceScope: async (id) => {
        scopeResolves += 1;
        if (scopeResolves === 1) await new Promise(resolve => setTimeout(resolve, 150));
        return id === ws.workspaceId ? ws : null;
      },
      resolveSessionScope: async () => null,
      resolveHostSessionScope: async () => null,
      registerSessionScope: async (runtime) => {
        await prepState.agentScopeStore.bindSession({
          sessionId: runtime.sessionId, rootSessionId: runtime.rootSessionId,
          workspaceId: runtime.workspaceId, agentDirectoryId: ws.agentDirectoryId,
        });
        return true;
      },
      resolveAttachments: async () => [],
      capturePrompt: async (_scope, body) => body,
      beforeDispatch: async () => { },
      onPromptAccepted: async () => { },
      directCommandAdmissionStore: prepState.directCommandAdmissionStore,
      archiveStore: createMemoryArchiveStore(),
      sessionMetadataStore: createMemorySessionMetadataStore(),
    });
    registerCanonicalSessionRoutes(router, sessionService);
    app.use('/api/agent/v1/sessions', router);
    try {
      const prepReq = request(app).post('/api/agent/v1/sessions/prepare').send({ projectId: ws.projectId, workspaceId: ws.workspaceId });
      await new Promise(resolve => setTimeout(resolve, 20));
      const createReq = request(app).post('/api/agent/v1/sessions').send({
        projectId: ws.projectId, workspaceId: ws.workspaceId, options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }
      });
      const [prepRes, createRes] = await Promise.all([prepReq, createReq]);
      // Exactly one session, and neither request may be refused for colliding.
      expect(createdCount).toBe(1);
      expect(prepRes.status).toBe(200);
      expect(createRes.status).toBe(200);
      expect(createRes.body.session.sessionId).toBe(prepRes.body.sessionId);
    } finally {
      await sessionService.close?.();
    }
  });
});
