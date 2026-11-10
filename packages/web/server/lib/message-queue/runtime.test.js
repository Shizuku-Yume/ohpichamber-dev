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
import { registerMessageQueueRoutes } from './runtime.js';

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
});
