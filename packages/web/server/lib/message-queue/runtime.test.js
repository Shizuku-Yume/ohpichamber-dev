import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, it } from 'vitest';
import express from 'express';
import supertest from 'supertest';
import { createCanonicalQueueRuntime } from './canonical-runtime.js';
import { createPromptQueueStore } from './sqlite-store.js';
import { registerCanonicalQueueRoutes, registerMessageQueueRoutes } from './runtime.js';

const roots = [];
const stores = [];
const SESSION = randomUUID();
const PROJECT = randomUUID();
const WORKSPACE = randomUUID();
const EPOCH = randomUUID();
const scope = {
  sessionId: SESSION,
  projectId: PROJECT,
  workspaceId: WORKSPACE,
  cwd: '/private/worktree',
  agentDirectory: '/private/agent-directory',
};
const options = {
  providerId: 'provider', modelId: 'model', agentId: null, variant: null, reasoningEffort: null,
};
const request = {
  input: {
    text: 'captured prompt',
    attachments: [{ attachmentId: randomUUID(), name: 'note.txt', mediaType: 'text/plain', size: 4, uri: '' }],
    context: [{ kind: 'context', text: 'captured context', metadata: { issue: 7 }, instructions: 'read first' }],
  },
  options,
};
request.input.attachments[0].uri = `attachment://${request.input.attachments[0].attachmentId}`;

const runtimeSession = {
  sessionId: SESSION,
  projectId: PROJECT,
  workspaceId: WORKSPACE,
  displayPath: 'worktree',
  rootSessionId: SESSION,
  createdAt: 1,
  updatedAt: 1,
  epoch: EPOCH,
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
};
const run = {
  runId: randomUUID(), sessionId: SESSION, status: 'pending', createdAt: 2,
};

const directory = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-canonical-queue-'));
  roots.push(root);
  return root;
};
const storeFor = () => {
  const store = createPromptQueueStore({ dataDir: directory() });
  stores.push(store);
  return store;
};
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});
const createService = () => {
  const calls = [];
  return {
    calls,
    request: async (pathname, init = {}) => {
      calls.push({ pathname, init });
      if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(runtimeSession);
      if (pathname === `/internal/sessions/${SESSION}/runs`) return response({ run }, 202);
      throw new Error(`Unexpected service path: ${pathname}`);
    },
  };
};

afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('canonical queue runtime', () => {
  it('captures canonical request data and publishes no private scope fields', async () => {
    const store = storeFor();
    const service = createService();
    const published = [];
    const failures = [];
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [{ attachmentId: request.input.attachments[0].attachmentId, path: '/private/upload/note.txt' }],
      publishQueue: (event) => published.push(event),
      reportFailure: (failure) => failures.push(failure),
    });
    const commandId = randomUUID();
    const queued = await runtime.append(scope, commandId, { expectedRevision: '0', content: 'editable content', request });
    assert.equal(JSON.stringify(published).includes(PROJECT), false);
    assert.equal(JSON.stringify(published).includes(WORKSPACE), false);
    assert.equal(queued.items[0].status, 'queued');
    assert.equal(queued.items[0].options.providerId, 'provider');
    assert.equal(queued.items[0].context[0].hasInstructions, true);
    assert.equal(queued.items[0].context[0].deliveryReceiptId, undefined);
    assert.deepEqual(published.at(-1), { sessionId: SESSION, queue: queued });
    assert.deepEqual(failures, []);
    await runtime.stop();
  });


  it('repackages a private resolver result before strict store calls', async () => {
    const store = storeFor();
    const service = createService();
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });
    const queue = await runtime.append({ ...scope, privateToken: 'must-not-reach-store' }, randomUUID(), {
      expectedRevision: '0', content: 'scope-safe', request: { input: { text: 'scope-safe', attachments: [], context: [] }, options },
    });
    assert.equal(queue.sessionId, SESSION);
    await assert.doesNotReject(runtime.getState({ ...scope, privateToken: 'still-private' }));
    await runtime.stop();
  });

  it('keeps a canonical service problem and does not acknowledge a rejected delivery', async () => {
    const store = storeFor();
    const calls = [];
    const service = {
      request: async (pathname) => {
        calls.push(pathname);
        if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(runtimeSession);
        return response({
          type: 'urn:ohpichamber:problem:RUN_ACTIVE', title: 'Run active', status: 409,
          detail: 'A run is already active', code: 'RUN_ACTIVE', retryable: false,
        }, 409);
      },
    };
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });
    await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'retry me', request: { input: { text: 'retry me', attachments: [], context: [] }, options } });
    await runtime.dispatch(scope);
    assert.deepEqual(calls, [`/api/agent/v1/sessions/${SESSION}`, `/internal/sessions/${SESSION}/runs`]);
    assert.equal((await runtime.getState(scope)).items.length, 1);
    assert.equal((await runtime.getState(scope)).items[0].status, 'queued');
    await runtime.stop();
  });
  it('holds queued items until an active worker-originated run ends', async () => {
    const store = storeFor();
    const activeSession = { ...runtimeSession, runtimeStatus: 'running', activeRunId: randomUUID() };
    const runCalls = [];
    const service = {
      request: async (pathname) => {
        if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(activeSession);
        runCalls.push(pathname);
        return response({ run: { ...run, runId: (await store.getState({ sessionId: SESSION, projectId: PROJECT, workspaceId: WORKSPACE })).items[0].delivery.runId, origin: 'goal' } }, 202);
      },
    };
    const runtime = createCanonicalQueueRuntime({ store, service, resolveAttachments: async () => [], publishQueue: () => {}, reportFailure: () => {} });
    await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'wait for goal', request: { input: { text: 'wait for goal', attachments: [], context: [] }, options } });
    await runtime.dispatch(scope);
    assert.deepEqual(runCalls, []);
    activeSession.runtimeStatus = 'idle';
    activeSession.activeRunId = null;
    await runtime.dispatch(scope);
    assert.deepEqual(runCalls, [`/internal/sessions/${SESSION}/runs`]);
    assert.equal((await runtime.getState(scope)).items.length, 1);
    assert.equal((await runtime.getState(scope)).items[0].status, 'leased');
    await runtime.stop();
  });
  it('does not lease or send queued work while a continuation is pending, then resumes when it clears', async () => {
    const store = storeFor();
    const calls = [];
    const session = { ...runtimeSession, continuationPending: true };
    const service = {
      request: async (pathname, init) => {
        calls.push(pathname);
        if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(session);
        return response({ run: { ...run, runId: JSON.parse(init.body).runId, origin: 'host' } }, 202);
      },
    };
    const accepted = Promise.withResolvers();
    const runtime = createCanonicalQueueRuntime({ store, service, resolveAttachments: async () => [], publishQueue: () => {}, reportFailure: () => {}, onPromptAccepted: async () => accepted.resolve() });
    await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'wait for continuation', request: { input: { text: 'wait for continuation', attachments: [], context: [] }, options } });

    await runtime.dispatch(scope);
    assert.deepEqual(calls, [`/api/agent/v1/sessions/${SESSION}`]);
    assert.equal((await runtime.getState(scope)).items[0].status, 'queued');

    session.continuationPending = false;
    await runtime.observe(scope, { type: 'session.updated', sessionId: SESSION, epoch: runtimeSession.epoch, sequence: '1', timestamp: Date.now(), continuationPending: false });
    await accepted.promise;
    assert.deepEqual(calls, [`/api/agent/v1/sessions/${SESSION}`, `/api/agent/v1/sessions/${SESSION}`, `/internal/sessions/${SESSION}/runs`]);
    assert.equal((await runtime.getState(scope)).items[0].status, 'leased');
    await runtime.stop();
  });

  it('does not treat an actual active goal run as a pending continuation', async () => {
    const store = storeFor();
    const goalRunId = randomUUID();
    const session = { ...runtimeSession, runtimeStatus: 'running', activeRunId: goalRunId, continuationPending: true };
    const calls = [];
    const service = {
      request: async (pathname) => {
        calls.push(pathname);
        if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(session);
        throw new Error('A queued send must not reach an active goal run');
      },
    };
    const runtime = createCanonicalQueueRuntime({ store, service, resolveAttachments: async () => [], publishQueue: () => {}, reportFailure: () => {} });
    await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'respect active goal', request: { input: { text: 'respect active goal', attachments: [], context: [] }, options } });
    await runtime.dispatch(scope);
    assert.deepEqual(calls, [`/api/agent/v1/sessions/${SESSION}`]);
    assert.equal((await runtime.getState(scope)).items[0].status, 'queued');
    assert.equal(session.activeRunId, goalRunId);
    await runtime.stop();
  });


  it('leaves a submitting capture when acceptance hooks fail', async () => {
    const store = storeFor();
    const service = createService();
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      onPromptAccepted: async () => { throw new Error('receipt unavailable'); },
      publishQueue: () => {},
      reportFailure: () => {},
    });
    await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'receipt first', request: { input: { text: 'receipt first', attachments: [], context: [] }, options } });
    await runtime.dispatch(scope).catch(() => undefined);
    const state = await runtime.getState(scope);
    const privateScope = { sessionId: SESSION, projectId: PROJECT, workspaceId: WORKSPACE };
    const pending = await store.pendingDeliveries(privateScope);
    assert.equal(pending[0].phase, 'submitting');
    assert.deepEqual((await store.getDeliveryCapture(privateScope, pending[0].leaseId)).request.input.text, 'receipt first');
    await runtime.stop();
  });

  it('rejects the old UI shape with 400', async () => {
    const store = storeFor();
    const service = createService();
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });
    const app = express();
    app.use(express.json());
    registerMessageQueueRoutes(app, runtime, {
      resolveSessionScope: async () => scope,
      listQueueScopes: async () => ({ items: [scope], errors: [] }),
    });

    const oldUiPayload = {
      directory: '/private/worktree',
      item: {
        content: 'old format prompt',
        sendConfig: { providerID: 'provider', modelID: 'model' },
        attachments: [{ filename: 'note.txt', mimeType: 'text/plain', serverPath: 'file:///path' }],
      },
    };

    const res = await supertest(app)
      .post(`/api/message-queue/sessions/${SESSION}/items`)
      .send(oldUiPayload);

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_REQUEST');
    await runtime.stop();
  });

  it('subscribes session observation on append and start', async () => {
    const store = storeFor();
    const observed = [];
    const runtime = createCanonicalQueueRuntime({
      store,
      service: createService(),
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
      ensureSessionObserved: async (sessionScope) => {
        observed.push(sessionScope.sessionId);
      },
    });
    await runtime.append(scope, randomUUID(), {
      expectedRevision: '0',
      content: 'observe prompt',
      request,
    });
    assert.deepEqual(observed, [SESSION]);
    await runtime.start();
    assert.deepEqual(observed, [SESSION, SESSION]);
    await runtime.stop();
  });

  it('re-schedules delivery while the runtime session is busy with an active run', async () => {
    const store = storeFor();
    let runStatus = 'running';
    let activeRunId = 'run-busy';
    let dispatchCalled = false;
    const busyService = {
      request: async (requestPath, init) => {
        if (init?.method === 'POST') {
          dispatchCalled = true;
          const body = JSON.parse(init.body);
          return Response.json({ run: { ...run, runId: body.runId, sessionId: SESSION } });
        }
        return Response.json({
          ...runtimeSession,
          runtimeStatus: runStatus,
          activeRunId,
        });
      },
    };
    const runtime = createCanonicalQueueRuntime({
      store,
      service: busyService,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });

    await runtime.append(scope, randomUUID(), {
      expectedRevision: '0',
      content: 'busy prompt',
      request,
    });

    // Let the initial tick run; activeRunId is busy so it should schedule retry
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(dispatchCalled, false);

    // Now the run finishes
    runStatus = 'idle';
    activeRunId = null;

    // Trigger dispatch directly once idle
    await runtime.dispatch(scope);
    assert.equal(dispatchCalled, true);
    await runtime.stop();
  });
  it('refuses a root prompt carrying agentId and admits the same prompt on a child session', async () => {
    const store = storeFor();
    const service = createService();
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });
    const delegated = { input: { text: 'delegate', attachments: [], context: [] }, options: { ...options, agentId: 'task-subagent' } };
    await assert.rejects(
      () => runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'delegate', request: delegated }),
      /Root prompt agentId must be null/,
    );
    const child = await runtime.append({ ...scope, parentSessionId: 'ses_parent' }, randomUUID(), { expectedRevision: '0', content: 'delegate', request: delegated });
    assert.equal(child.items[0].options.agentId, 'task-subagent');
    await runtime.stop();
  });

  it('takes an item back through both route families with the preserved draft and refusals', async () => {
    const store = storeFor();
    const busy = { ...runtimeSession, runtimeStatus: 'running', activeRunId: 'busy-run' };
    const service = {
      calls: [],
      request: async (pathname) => {
        service.calls.push({ pathname });
        if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(busy);
        throw new Error(`Unexpected service path: ${pathname}`);
      },
    };
    const published = [];
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: (event) => published.push(event),
      reportFailure: () => {},
    });
    const app = express();
    app.use(express.json());
    registerMessageQueueRoutes(app, runtime, {
      resolveSessionScope: async () => scope,
      listQueueScopes: async () => ({ items: [scope], errors: [] }),
    });
    const draft = {
      content: 'editable content', text: 'editable content',
      attachments: [],
      context: [{ kind: 'context', text: 'user chip', metadata: { issue: 7 } }],
      options,
    };
    const queued = await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'editable content', request, draft });
    assert.equal(queued.items[0].originalAvailable, true);
    const queueItemId = queued.items[0].queueItemId;
    const publishedBefore = published.length;

    const taken = await supertest(app)
      .post(`/api/message-queue/sessions/${SESSION}/items/${queueItemId}/take`)
      .send({ expectedRevision: '1' });
    assert.equal(taken.status, 200);
    assert.deepEqual(taken.body.draft, draft);
    assert.equal(taken.body.text, 'captured prompt');
    assert.equal(taken.body.content, 'editable content');
    assert.equal(taken.body.createdAt, queued.items[0].createdAt);
    assert.equal(taken.body.queue.items.length, 0);
    assert.equal(published.length > publishedBefore, true);
    assert.equal((await runtime.getState(scope)).items.length, 0);

    // A replay after a successful take is a clean 404 carrying the current queue.
    const replay = await supertest(app)
      .post(`/api/message-queue/sessions/${SESSION}/items/${queueItemId}/take`)
      .send({ expectedRevision: taken.body.queue.revision });
    assert.equal(replay.status, 404);
    assert.equal(replay.body.code, 'SESSION_NOT_FOUND');
    assert.equal(replay.body.details.queue.items.length, 0);
    await runtime.stop();
  });

  it('refuses a take with a stale revision, a route/body mismatch, a leased item and an unknown item', async () => {
    const store = storeFor();
    const service = createService();
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });
    const app = express();
    app.use(express.json());
    registerMessageQueueRoutes(app, runtime, {
      resolveSessionScope: async () => scope,
      listQueueScopes: async () => ({ items: [scope], errors: [] }),
    });
    const activeSession = { ...runtimeSession, runtimeStatus: 'running', activeRunId: 'busy-run' };
    service.request = async (pathname) => {
      if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(activeSession);
      throw new Error(`Unexpected service path: ${pathname}`);
    };
    const queued = await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'held', request });
    const queueItemId = queued.items[0].queueItemId;

    const stale = await supertest(app)
      .post(`/api/message-queue/sessions/${SESSION}/items/${queueItemId}/take`)
      .send({ expectedRevision: '0' });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'QUEUE_CONFLICT');
    assert.equal(stale.body.details.queue.items.length, 1);

    const mismatch = await supertest(app)
      .post(`/api/message-queue/sessions/${SESSION}/items/${queueItemId}/take`)
      .send({ expectedRevision: '1', queueItemId: randomUUID() });
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.code, 'INVALID_REQUEST');

    const missing = await supertest(app)
      .post(`/api/message-queue/sessions/${SESSION}/items/${randomUUID()}/take`)
      .send({ expectedRevision: '1' });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'SESSION_NOT_FOUND');

    assert.equal((await runtime.getState(scope)).items.length, 1);

    // Lease the head through the store, then the take must be refused while delivery proceeds.
    const privateScope = { sessionId: SESSION, projectId: PROJECT, workspaceId: WORKSPACE };
    const claim = await store.claimHead(privateScope, '1', { epoch: EPOCH, expiresAt: Date.now() + 30_000 });
    const leased = await supertest(app)
      .post(`/api/message-queue/sessions/${SESSION}/items/${queueItemId}/take`)
      .send({ expectedRevision: '2' });
    assert.equal(leased.status, 409);
    assert.equal(leased.body.code, 'QUEUE_CONFLICT');
    assert.equal((await runtime.getState(scope)).items[0].status, 'leased');
    await store.markSubmitting(privateScope, claim.capture.leaseId);
    await store.acknowledge(privateScope, claim.capture.leaseId);
    assert.equal((await runtime.getState(scope)).items.length, 0);
    await runtime.stop();
  });

  it('serves the canonical take route with the same draft and refuse semantics', async () => {
    const store = storeFor();
    const service = createService();
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });
    const router = express.Router();
    router.use(express.json());
    registerCanonicalQueueRoutes(router, runtime, { resolveSessionScope: async () => scope });
    const app = express();
    app.use('/api/agent/v1', router);
    const draft = {
      content: 'canonical content', text: 'canonical content',
      attachments: [],
      context: [],
      options,
    };
    const queued = await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'canonical content', request, draft });
    const queueItemId = queued.items[0].queueItemId;
    const taken = await supertest(app)
      .post(`/api/agent/v1/sessions/${SESSION}/queue/${queueItemId}/take`)
      .send({ expectedRevision: '1' });
    assert.equal(taken.status, 200);
    assert.deepEqual(taken.body.draft, draft);
    assert.equal(taken.body.queue.sessionId, SESSION);
    // A stale replay is a conflict; a replay at the current revision is a clean 404.
    const stale = await supertest(app)
      .post(`/api/agent/v1/sessions/${SESSION}/queue/${queueItemId}/take`)
      .send({ expectedRevision: '1' });
    assert.equal(stale.status, 409);
    const replay = await supertest(app)
      .post(`/api/agent/v1/sessions/${SESSION}/queue/${queueItemId}/take`)
      .send({ expectedRevision: taken.body.queue.revision });
    assert.equal(replay.status, 404);
    await runtime.stop();
  });

  it('an old record without a draft takes with the partial-restore shape', async () => {
    const store = storeFor();
    const busy = { ...runtimeSession, runtimeStatus: 'running', activeRunId: 'busy-run' };
    const service = {
      calls: [],
      request: async (pathname) => {
        service.calls.push({ pathname });
        if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(busy);
        throw new Error(`Unexpected service path: ${pathname}`);
      },
    };
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });
    // No draft on append: the take response is the partial-restore shape.
    const queued = await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'legacy record', request });
    assert.equal(queued.items[0].originalAvailable, false);
    const taken = await runtime.take(scope, { expectedRevision: '1', queueItemId: queued.items[0].queueItemId });
    assert.equal(taken.stored.draft, undefined);
    assert.equal(taken.stored.content, 'legacy record');
    assert.equal(taken.stored.request.input.text, 'captured prompt');
    assert.equal(taken.queue.items.length, 0);
    await runtime.stop();
  });

  it('a take that beats the delivery claim leaves nothing to admit and nothing lost', async () => {
    const store = storeFor();
    const session = { ...runtimeSession, runtimeStatus: 'running', activeRunId: 'busy-run' };
    const service = {
      calls: [],
      request: async (pathname) => {
        service.calls.push({ pathname });
        if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(session);
        if (pathname === `/internal/sessions/${SESSION}/runs`) return response({ run }, 202);
        throw new Error(`Unexpected service path: ${pathname}`);
      },
    };
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });
    const queued = await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'raced', request });
    const taken = await runtime.take(scope, { expectedRevision: '1', queueItemId: queued.items[0].queueItemId });
    assert.equal(taken.queue.items.length, 0);
    // The session goes idle after the take: the dispatch the take re-armed must
    // admit nothing, because the item is already gone.
    session.runtimeStatus = 'idle';
    session.activeRunId = null;
    await runtime.dispatch(scope);
    assert.equal(service.calls.filter((entry) => entry.pathname === `/internal/sessions/${SESSION}/runs`).length, 0);
    assert.equal((await runtime.getState(scope)).items.length, 0);
    await runtime.stop();
  });

  it('take while a delivery is in flight is refused and the delivery completes undisturbed', async () => {
    const store = storeFor();
    const admissions = Promise.withResolvers();
    const admissionStarted = Promise.withResolvers();
    const service = {
      calls: [],
      request: async (pathname, init) => {
        service.calls.push({ pathname, init });
        if (pathname === `/api/agent/v1/sessions/${SESSION}`) return response(runtimeSession);
        if (pathname === `/internal/sessions/${SESSION}/runs`) {
          admissionStarted.resolve();
          await admissions.promise;
          return response({ run: { ...run, runId: JSON.parse(init.body).runId } }, 202);
        }
        throw new Error(`Unexpected service path: ${pathname}`);
      },
    };
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
    });
    const queued = await runtime.append(scope, randomUUID(), { expectedRevision: '0', content: 'in flight', request });
    const queueItemId = queued.items[0].queueItemId;
    const dispatched = runtime.dispatch(scope);
    // The admission request only starts after the head lease is written, so its
    // arrival proves the lease exists; the take must lose to it.
    await admissionStarted.promise;
    await assert.rejects(runtime.take(scope, { expectedRevision: '2', queueItemId }), { code: 'QUEUE_CONFLICT' });
    admissions.resolve();
    await dispatched;
    assert.equal(service.calls.filter((entry) => entry.pathname === `/internal/sessions/${SESSION}/runs`).length, 1);
    assert.equal((await runtime.getState(scope)).items.length, 0);
    await runtime.stop();
  });

  describe('canonical gateway queue take authorization', () => {
    const gateway = async ({ authenticate }) => {
      const { registerCanonicalHostRoutes } = await import('../host/canonical-routes.js');
      const store = storeFor();
      const service = {
        getState: () => ({ phase: 'ready' }),
        request: async () => {
          throw new Error('The take must not reach the Agent Service proxy');
        },
      };
      const runtime = createCanonicalQueueRuntime({
        store,
        service,
        resolveAttachments: async () => [],
        publishQueue: () => {},
        reportFailure: () => {},
      });
      const app = express();
      registerCanonicalHostRoutes(app, {
        express,
        service,
        uiAuthController: { resolveAuthContext: async () => (authenticate ? { type: 'client' } : null) },
        tunnelAuthController: { classifyRequestScope: () => 'local', getTunnelSessionFromRequest: () => null },
        isRequestOriginAllowed: () => true,
        enterprisePolicyOptions: {},
        resolveWorkspaceScope: async () => null,
        resolveWorkspaceDirectory: async () => null,
        resolveSessionScope: async () => scope,
        resolveHostSessionScope: async () => scope,
        listProjects: async () => ({ items: [], errors: {} }),
        listWorkspaces: async () => ({ items: [], errors: {} }),
        resolveCredentialHandoff: async () => { throw new Error('no credentials'); },
        queueRoutes: (router) => registerCanonicalQueueRoutes(router, runtime, { resolveSessionScope: async () => scope }),
        sessionRoutes: (router) => router,
        attachmentRoutes: (router) => router,
        skillFileOwner: {},
        getSkillRepositoryDependencies: () => ({}),
      });
      return { app, runtime };
    };

    it('rejects an unauthenticated canonical take before it can touch the queue', async () => {
      const { app, runtime } = await gateway({ authenticate: false });
      const res = await supertest(app)
        .post(`/api/agent/v1/sessions/${SESSION}/queue/${randomUUID()}/take`)
        .set('Authorization', 'Bearer fixture-client')
        .send({ expectedRevision: '0' });
      assert.equal(res.status, 401);
      assert.equal(res.body.code, 'UNAUTHORIZED');
      await runtime.stop();
    });

    it('serves an authenticated canonical take through the gateway middleware', async () => {
      const { app, runtime } = await gateway({ authenticate: true });
      const queued = await runtime.append(scope, randomUUID(), {
        expectedRevision: '0',
        content: 'gateway take',
        request: { input: { text: 'gateway take', attachments: [], context: [] }, options },
        draft: { content: 'gateway take', text: 'gateway take', attachments: [], context: [], options },
      });
      const res = await supertest(app)
        .post(`/api/agent/v1/sessions/${SESSION}/queue/${queued.items[0].queueItemId}/take`)
        .set('Authorization', 'Bearer fixture-client')
        .send({ expectedRevision: '1' });
      assert.equal(res.status, 200);
      assert.equal(res.body.content, 'gateway take');
      assert.equal(res.body.draft.text, 'gateway take');
      await runtime.stop();
    });
  });
});
