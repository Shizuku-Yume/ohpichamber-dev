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

<<<<<<< HEAD
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
=======
afterEach(() => {
  vi.useRealTimers();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * A fake OpenCode: status map, message tail, command list, and a log of every
 * prompt/command it received.
 */
const createOpenCode = () => {
  const state = {
    // `/api/session/active` lists only running sessions; an absent id is idle.
    active: {},
    // Subagent sessions per parent, as `GET /api/session?parentID=` lists them.
    children: {},
    tail: [],
    commands: [],
    sent: [],
    switched: [],
    failNext: null,
    failStatus: 500,
    htmlNext: null,
    // A revert staged on the session; committing it clears it.
    revert: null,
    // Admitted synthetic ids: as OpenCode, a second admission keeps the first.
    admitted: new Set(),
  };
  // v2 wraps `/api/*` payloads in `{ location, data }`; a message page is
  // `{ data, cursor }` and lists newest first.
  const wrapped = (data) => Response.json({ location: { directory: DIRECTORY }, data });
  const fetchImpl = vi.fn(async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method ?? 'GET';
    if (state.failNext && state.failNext.test(pathname)) {
      state.failNext = null;
      return new Response('boom', { status: state.failStatus });
    }
    if (method === 'POST' && state.htmlNext?.test(pathname)) {
      state.htmlNext = null;
      return new Response('<!doctype html><title>OpenChamber</title>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    // Real shape: `{ data }` without a `location`, unlike directory-scoped routes.
    if (pathname === '/api/session/active') return Response.json({ data: state.active });
    if (pathname === '/api/session' && method === 'GET') {
      const parentID = new URL(url).searchParams.get('parentID');
      return Response.json({ data: (state.children[parentID] ?? []).map((id) => ({ id, parentID })), cursor: {} });
    }
    if (/^\/api\/session\/[^/]+$/.test(pathname) && method === 'GET') {
      const id = decodeURIComponent(pathname.split('/').at(-1));
      const parentID = Object.keys(state.children).find((parent) => state.children[parent].includes(id));
      return wrapped({ id, parentID, ...(state.revert && { revert: state.revert }) });
    }
    if (method === 'POST' && pathname.endsWith('/revert/commit')) {
      state.sent.push({ path: pathname });
      state.revert = null;
      return new Response(null, { status: 204 });
    }
    if (pathname.endsWith('/message')) return Response.json({ data: state.tail, cursor: {} });
    if (pathname === '/api/command') return wrapped(state.commands);
    if (method === 'POST' && (pathname.endsWith('/model') || pathname.endsWith('/agent'))) {
      // Kept apart from `sent`: switching the session is not a message.
      state.switched.push({ path: pathname, body: JSON.parse(init.body) });
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && (pathname.endsWith('/prompt') || pathname.endsWith('/command') || pathname.endsWith('/synthetic'))) {
      const body = JSON.parse(init.body);
      if (pathname.endsWith('/synthetic') && state.admitted.has(body.id)) return wrapped({ id: body.id });
      if (pathname.endsWith('/synthetic')) state.admitted.add(body.id);
      state.sent.push({ path: pathname, body });
      return wrapped({ id: `msg_${state.sent.length}` });
    }
    return new Response('not found', { status: 404 });
  });
  return { state, fetchImpl };
};

const createRuntime = ({ dataDir = makeDataDir(), openCode = createOpenCode(), knowledge = null, retryDelayMs, resolveAutoSelection, now, beforeScheduledTaskSend, onScheduledTaskResult, persistSessionGoal, isDeliveryHeld, deliveryHoldReady } = {}) => {
  let eventHandler = () => {};
  let statusHandler = () => {};
  const broadcasts = [];
  const promptSent = [];
  const options = {
    globalEventHub: {
      subscribeEvent(handler) { eventHandler = handler; return () => {}; },
      subscribeStatus(handler) { statusHandler = handler; return () => {}; },
    },
    buildOpenCodeUrl: (fetchPath) => `http://opencode.test${fetchPath}`,
    getOpenCodeAuthHeaders: () => ({}),
    sessionKnowledgeRuntime: knowledge,
    broadcastGlobalUiEvent: (event) => broadcasts.push(event),
    onPromptSent: (sessionId) => promptSent.push(sessionId),
    dataDir,
    fetchImpl: openCode.fetchImpl,
    dispatchQuietMs: 0,
    abortHoldMs: 50,
    beforeScheduledTaskSend,
    onScheduledTaskResult,
  };
  if (retryDelayMs) options.retryDelayMs = retryDelayMs;
  if (resolveAutoSelection) options.resolveAutoSelection = resolveAutoSelection;
  if (now) options.now = now;
  if (persistSessionGoal) options.persistSessionGoal = persistSessionGoal;
  if (isDeliveryHeld) options.isDeliveryHeld = isDeliveryHeld;
  if (deliveryHoldReady) options.deliveryHoldReady = deliveryHoldReady;
  const runtime = createMessageQueueRuntime(options);
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
    assert.deepEqual(observed, [SESSION]);
    await runtime.start();
    assert.deepEqual(observed, [SESSION, SESSION]);
    await runtime.stop();
=======
    expect(fs.readFileSync(path.join(goalsDataDir, 'goals', `${SESSION}.md`), 'utf8')).toBe('build the parser');
    // The briefing goes ahead of the message, as for a scheduled goal.
    expect(openCode.state.sent.slice(1).map((entry) => [entry.path, entry.body])).toEqual([
      [`/api/session/${SESSION}/synthetic`, { id: expect.stringMatching(/^msg_/), text: expect.stringContaining('Goal mode is active'), resume: false }],
      [`/api/session/${SESSION}/prompt`, { text: 'build the parser' }],
    ]);
    expect(openCode.state.sent[1].body.text).toContain('A token budget of 5000 tokens');
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
=======
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'Implement this plan: X', text: 'Implement this plan: X', goal: { objective: 'the whole plan', tokenBudget: null } }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => {
      expect(runtime.sessionSnapshot(SESSION).items).toEqual([]);
      expect(persisted).toHaveLength(1);
    });
    expect(fs.readFileSync(path.join(process.env.OPENCHAMBER_DATA_DIR, 'goals', `${SESSION}.md`), 'utf8')).toBe('the whole plan');
    runtime.stop();
    await runtime.flush();
  });
});
>>>>>>> bc50ba56a

    // Let the initial tick run; activeRunId is busy so it should schedule retry
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(dispatchCalled, false);

    // Now the run finishes
    runStatus = 'idle';
    activeRunId = null;

<<<<<<< HEAD
    // Trigger dispatch directly once idle
    await runtime.dispatch(scope);
    assert.equal(dispatchCalled, true);
    await runtime.stop();
=======
    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent).toHaveLength(1);
    expect(openCode.state.sent[0].path).toBe(`/api/session/${SESSION}/prompt`);
    // v2 selects model and agent on the session, so the prompt carries text
    // and attachments only.
    expect(openCode.state.sent[0].body).toEqual({ text: 'first' });
    expect(promptSent).toEqual([SESSION]);
    expect(runtime.sessionSnapshot(SESSION).items.map((entry) => entry.content)).toEqual(['second']);
    // Clients learned about the in-flight item and then the removal.
    expect(broadcasts.at(-1)).toMatchObject({
      type: 'openchamber:message-queue.updated',
      properties: { session: { sessionId: SESSION, sendingId: null } },
    });

    // The next turn: busy, then idle again — the second message goes out.
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'busy' } } });
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(2);
    expect(runtime.sessionSnapshot(SESSION).items).toEqual([]);
  });

  it('waits for a background subagent before sending the queued message', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    // The parent paused: it is idle while its background subagent works.
    openCode.state.children = { [SESSION]: ['ses_child'] };
    openCode.state.active = { ses_child: { type: 'running' } };

    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'next', text: 'next' }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(0);

    // The subagent finished and OpenCode ran the parent again with its result.
    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'busy' } } });
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(1);
    expect(openCode.state.sent[0].body).toEqual({ text: 'next' });
  });

  it('keeps queued messages until a nested background subagent finishes', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    openCode.state.children = { [SESSION]: ['ses_child'], ses_child: ['ses_grandchild'] };
    openCode.state.active = { ses_grandchild: { type: 'running' } };
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'first', text: 'first' }));
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'second', text: 'second' }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(0);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(2);

    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent.map((entry) => entry.body.text)).toEqual(['first']);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'busy' } } });
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent.map((entry) => entry.body.text)).toEqual(['first', 'second']);
    runtime.stop();
  });

  it('keeps the queue intact when a nested lineage read fails', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    openCode.state.children = { [SESSION]: ['ses_child'], ses_child: ['ses_grandchild'] };
    openCode.state.active = { ses_grandchild: { type: 'running' } };
    openCode.state.failNext = /\/api\/session\/ses_child$/;
    await runtime.enqueue(SESSION, DIRECTORY, item());
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(0);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(1);
    runtime.stop();
  });

  it('does not send into a running turn even when the status event says idle', async () => {
    const { runtime, openCode, emit } = createRuntime({ now: () => 10_000 });
    runtime.start();
    // Live unfinished turn: created after this runtime started.
    openCode.state.tail = [{ type: 'assistant', time: { created: 10_001 } }];
    await runtime.enqueue(SESSION, DIRECTORY, item());
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(0);

    // The reply completes: that alone drains the queue (a missed idle event
    // must not strand it).
    openCode.state.tail = [{ type: 'assistant', time: { created: 10_001, completed: 10_002 } }];
    emit({ type: 'message.updated', properties: { info: { role: 'assistant', sessionID: SESSION, time: { created: 10_001, completed: 10_002 } } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(1);
  });

  it('delivers past an unfinished tail that predates this runtime (dead pre-restart run)', async () => {
    const { runtime, openCode, emit } = createRuntime({ now: () => 10_000 });
    runtime.start();
    // Assistant reply interrupted by a server restart: unfinished, but older
    // than this runtime — no completion event will ever arrive for it, so it
    // must not block a restored queue forever.
    openCode.state.tail = [{ type: 'assistant', time: { created: 1 } }];
    await runtime.enqueue(SESSION, DIRECTORY, item());
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(1);
    expect(openCode.state.sent[0].path).toBe(`/api/session/${SESSION}/prompt`);
  });

  it('treats an unreachable OpenCode as unknown, not idle', async () => {
    const { runtime, openCode, emit } = createRuntime({ retryDelayMs: () => 10 });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());
    openCode.state.failNext = /\/api\/session\/active$/;
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle(5);
    expect(openCode.state.sent).toHaveLength(0);
    // Retried after the status fetch recovers.
    await settle(40);
    expect(openCode.state.sent).toHaveLength(1);
  });

  it('keeps a failed item and retries with backoff', async () => {
    const { runtime, openCode, emit, broadcasts } = createRuntime({ retryDelayMs: () => 20 });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());
    openCode.state.failNext = /\/prompt$/;
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle(10);
    expect(openCode.state.sent).toHaveLength(0);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
    expect(runtime.sessionSnapshot(SESSION).sendingId).toBeNull();
    expect(broadcasts.at(-1).properties.session.sendingId).toBeNull();
    await settle(40);
    expect(openCode.state.sent).toHaveLength(1);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(0);
  });

  it('keeps a queued prompt when the runtime returns an HTML app shell', async () => {
    const { runtime, openCode, emit, promptSent } = createRuntime({ retryDelayMs: () => 1_000 });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());
    openCode.state.htmlNext = /prompt$/;
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent).toHaveLength(0);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
    expect(promptSent).toEqual([]);
    runtime.stop();
  });

  it('keeps a queued command when the runtime returns an HTML app shell', async () => {
    const { runtime, openCode, emit, promptSent } = createRuntime({ retryDelayMs: () => 1_000 });
    runtime.start();
    openCode.state.commands = [{ name: 'review' }];
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: '/review src', text: '/review src' }));
    openCode.state.htmlNext = /command$/;
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent).toHaveLength(0);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
    expect(promptSent).toEqual([]);
    runtime.stop();
  });

  it('holds delivery briefly after a user abort', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());
    // v2 reports a user abort as `session.execution.interrupted`, which the
    // translator turns into an aborted `session.idle`.
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    emit({ type: 'session.idle', properties: { sessionID: SESSION, aborted: true, reason: 'user' } });
    await settle(10);
    expect(openCode.state.sent).toHaveLength(0);
    await settle(80);
    expect(openCode.state.sent).toHaveLength(1);
  });

  it('waits while an auto-review holds the session and delivers on release', async () => {
    let held = true;
    const { runtime, openCode, emit } = createRuntime({ isDeliveryHeld: (sessionId) => held && sessionId === SESSION });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(0);

    held = false;
    runtime.release(SESSION);
    await settle();
    expect(openCode.state.sent).toHaveLength(1);
  });

  it('delivers a restored queue only once the hold owner has loaded', async () => {
    const dataDir = makeDataDir();
    const first = createRuntime({ dataDir });
    first.openCode.state.active = { [SESSION]: { type: 'running' } };
    first.runtime.start();
    await first.runtime.enqueue(SESSION, DIRECTORY, item());
    await first.runtime.flush();
    first.runtime.stop();

    let ready = () => {};
    let held = true;
    const second = createRuntime({
      dataDir,
      isDeliveryHeld: () => held,
      deliveryHoldReady: new Promise((resolve) => { ready = resolve; }),
    });
    second.runtime.start();
    await settle();
    expect(second.openCode.state.sent).toHaveLength(0);

    held = false;
    ready();
    await settle();
    expect(second.openCode.state.sent).toHaveLength(1);
    second.runtime.stop();
  });

  it('survives a restart and delivers once OpenCode reconnects', async () => {
    const dataDir = makeDataDir();
    const first = createRuntime({ dataDir });
    first.runtime.start();
    first.openCode.state.active = { [SESSION]: { type: 'running' } };
    await first.runtime.enqueue(SESSION, DIRECTORY, item({ content: 'persisted', text: 'persisted', contextPreview: 'Saved context preview' }));
    await first.runtime.flush();
    first.runtime.stop();

    const second = createRuntime({ dataDir });
    second.runtime.start();
    await second.runtime.load();
    expect(second.runtime.sessionSnapshot(SESSION).items.map((entry) => entry.content)).toEqual(['persisted']);
    expect(second.runtime.sessionSnapshot(SESSION).items[0].contextPreview).toBe('Saved context preview');
    second.connect();
    await settle();
    expect(second.openCode.state.sent).toHaveLength(1);
    expect(second.openCode.state.sent[0].body).toEqual({ text: 'persisted' });
  });

  it('moves an unreadable queue file aside instead of treating it as empty', async () => {
    const dataDir = makeDataDir();
    fs.writeFileSync(path.join(dataDir, 'message-queue.json'), '{ not json');
    const { runtime } = createRuntime({ dataDir });
    await runtime.load();
    expect(runtime.snapshot().sessions).toEqual([]);
    expect(fs.readdirSync(dataDir).some((name) => name.startsWith('message-queue.json.corrupt-'))).toBe(true);
  });

  it('refuses to remove or take the item currently being sent', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    let release;
    // active map, message tail, the subagent check (empty active map),
    // model switch, then the prompt itself (held open until released)
    openCode.fetchImpl.mockImplementationOnce(async () => Response.json({ location: {}, data: {} }))
      .mockImplementationOnce(async () => Response.json({ data: [], cursor: {} }))
      .mockImplementationOnce(async () => Response.json({ data: {} }))
      .mockImplementationOnce(async () => new Response(null, { status: 204 }))
      .mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(new Response(null, { status: 204 })); }));
    const { itemId } = await runtime.enqueue(SESSION, DIRECTORY, item());
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(runtime.sessionSnapshot(SESSION).sendingId).toBe(itemId);

    await expect(runtime.remove(SESSION, itemId)).rejects.toMatchObject({ status: 409 });
    await expect(runtime.take(SESSION, itemId)).rejects.toMatchObject({ status: 409 });
    const taken = await runtime.takeAll(SESSION);
    expect(taken.items).toEqual([]);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);

    release();
    await settle();
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(0);
  });

  it('take hands back the full payload and leaves the rest queued', async () => {
    const { runtime } = createRuntime();
    runtime.start();
    const attachment = { id: 'a1', filename: 'shot.png', mimeType: 'image/png', size: 3, source: 'local', dataUrl: 'data:image/png;base64,AAA=' };
    const first = await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'with image', attachments: [attachment] }));
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'plain' }));

    expect(runtime.sessionSnapshot(SESSION).items[0].attachments[0]).not.toHaveProperty('dataUrl');
    const taken = await runtime.take(SESSION, first.itemId);
    expect(taken.item.attachments[0].dataUrl).toBe(attachment.dataUrl);
    expect(runtime.sessionSnapshot(SESSION).items.map((entry) => entry.content)).toEqual(['plain']);

    const all = await runtime.takeAll(SESSION);
    expect(all.items.map((entry) => entry.content)).toEqual(['plain']);
    expect(runtime.snapshot().sessions).toEqual([]);
  });

  it('retains a bounded context preview in snapshots and broadcasts without exposing the full payload', async () => {
    const { runtime, broadcasts } = createRuntime();
    runtime.start();
    const context = [{ kind: 'context', text: 'Full quoted content', metadata: { openchamberContext: { kind: 'chat-quote', quote: 'Original answer', text: 'Explain this' } } }];
    const { itemId } = await runtime.enqueue(SESSION, DIRECTORY, item({ content: '', text: '', context, contextPreview: 'Explain this' }));
    const projected = runtime.sessionSnapshot(SESSION).items[0];
    expect(projected.contextPreview).toBe('Explain this');
    expect(projected.content).toBe('');
    expect(projected.text).toBe('');
    expect(projected).not.toHaveProperty('context');
    expect(broadcasts.at(-1).properties.session.items[0].contextPreview).toBe('Explain this');
    const taken = await runtime.take(SESSION, itemId);
    expect(taken.item.context).toEqual(context);
    expect(taken.item.content).toBe('');

    await runtime.enqueue(SESSION, DIRECTORY, item({ content: '', text: '', context, contextPreview: 'a'.repeat(5000) }));
    expect(runtime.sessionSnapshot(SESSION).items[0].contextPreview).toBe('a'.repeat(100) + '...');
  });

  it('derives a preview for older queued annotations without a saved summary', async () => {
    const { runtime } = createRuntime();
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: '', text: '', context: [
      { kind: 'instruction', text: 'Use the skill' },
      { kind: 'context', text: 'Model-facing wrapper', metadata: { openchamberContext: { kind: 'browser-annotation', text: 'Fix the button\nMore detail' } } },
    ] }));
    expect(runtime.sessionSnapshot(SESSION).items[0].contextPreview).toBe('Fix the button...');
  });

  it('names the directory in the broadcast that empties a queue', async () => {
    // The UI keys its projection by directory; without it the client cannot
    // tell which queue just delivered its last message and keeps showing it.
    const { runtime, emit, broadcasts, openCode } = createRuntime();
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());
    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent).toHaveLength(1);
    expect(runtime.snapshot().sessions).toEqual([]);
    expect(broadcasts.at(-1).properties.session).toEqual({ sessionId: SESSION, directory: DIRECTORY, items: [], sendingId: null });
  });

  it('reorders only with a complete permutation', async () => {
    const { runtime } = createRuntime();
    runtime.start();
    const a = await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'a' }));
    const b = await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'b' }));
    await expect(runtime.reorder(SESSION, [b.itemId])).rejects.toThrow(TypeError);
    await runtime.reorder(SESSION, [b.itemId, a.itemId]);
    expect(runtime.sessionSnapshot(SESSION).items.map((entry) => entry.content)).toEqual(['b', 'a']);
  });

  it('drops the queue of a deleted session', async () => {
    const { runtime, emit, broadcasts } = createRuntime();
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());
    emit({ type: 'session.deleted', properties: { info: { id: SESSION } } });
    expect(runtime.snapshot().sessions).toEqual([]);
    expect(broadcasts.at(-1).properties.session).toMatchObject({ sessionId: SESSION, items: [] });
  });

  it('dispatches a queued slash command through the command endpoint', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    openCode.state.commands = [{ name: 'review' }];
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: '/review src', text: '/review src', sendConfig: { providerID: 'p', modelID: 'm', agent: 'build', variant: 'max' } }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(1);
    expect(openCode.state.sent[0].path).toBe(`/api/session/${SESSION}/command`);
    // v2's command route takes `text`, and the selection lives on the session.
    expect(openCode.state.sent[0].body).toEqual({ name: 'review', text: 'src' });
  });

  it('delivers captured context as synthetic messages, instructions first', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    const metadata = { openchamberContext: { kind: 'github-pr', number: 7, title: 'PR', url: 'https://x/pr/7' } };
    await runtime.enqueue(SESSION, DIRECTORY, item({
      agentMention: 'reviewer',
      attachments: [{ id: 'a', filename: 'f.txt', mimeType: 'text/plain', size: 1, source: 'local', dataUrl: 'data:text/plain,hi' }],
      context: [
        { kind: 'context', text: 'the diff', metadata, instructions: 'how to read it' },
        { kind: 'synthetic', text: 'conflict payload' },
        { kind: 'instruction', text: 'use the skill' },
      ],
    }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    // v2 has no inline synthetic parts: everything attached to the message is
    // admitted as its own synthetic message, before the prompt.
    expect(openCode.state.sent.map((entry) => entry.path)).toEqual([
      `/api/session/${SESSION}/synthetic`,
      `/api/session/${SESSION}/synthetic`,
      `/api/session/${SESSION}/synthetic`,
      `/api/session/${SESSION}/synthetic`,
      `/api/session/${SESSION}/prompt`,
    ]);
    expect(openCode.state.sent.slice(0, 4).map((entry) => entry.body)).toMatchObject([
      { text: 'how to read it', resume: false },
      { text: 'the diff', resume: false, metadata },
      { text: 'conflict payload', resume: false },
      { text: 'use the skill', resume: false },
    ]);
    expect(openCode.state.sent.at(-1).body).toEqual({
      text: 'follow up',
      files: [{ uri: 'data:text/plain,hi', name: 'f.txt' }],
      agents: [{ name: 'reviewer' }],
    });
  });

  // OpenCode's commit deletes everything admitted past the revert's boundary (#6244).
  it('commits a staged revert before admitting captured context', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    openCode.state.revert = { messageID: 'msg_boundary' };
    await runtime.enqueue(SESSION, DIRECTORY, item({ context: [{ kind: 'synthetic', text: 'attached' }] }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent.map((entry) => entry.path)).toEqual([
      `/api/session/${SESSION}/revert/commit`,
      `/api/session/${SESSION}/synthetic`,
      `/api/session/${SESSION}/prompt`,
    ]);
  });

  it('commits no revert when reading the session fails, and admits nothing', async () => {
    const { runtime, openCode, emit } = createRuntime({ retryDelayMs: () => 60_000 });
    runtime.start();
    openCode.state.revert = { messageID: 'msg_boundary' };
    openCode.state.failNext = new RegExp(`^/api/session/${SESSION}$`);
    await runtime.enqueue(SESSION, DIRECTORY, item({ context: [{ kind: 'synthetic', text: 'attached' }] }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent).toEqual([]);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
  });

  // A failure after admission used to send every synthetic record again (#6253).
  describe('retry after the context was admitted', () => {
    const queuedWithGoal = () => item({
      context: [{ kind: 'context', text: 'quoted', metadata: {}, instructions: 'read it' }],
      goal: { tokenBudget: null },
    });
    const idle = (emit) => emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    const synthetics = (openCode) => openCode.state.sent.filter((entry) => entry.path.endsWith('/synthetic'));
    const prompts = (openCode) => openCode.state.sent.filter((entry) => entry.path.endsWith('/prompt'));
    const expectDeliveredOnce = (openCode) => {
      expect(synthetics(openCode).map((entry) => entry.body.text)).toEqual(['read it', 'quoted', expect.stringContaining('Goal mode is active')]);
      expect(prompts(openCode).map((entry) => entry.body.text)).toEqual(['follow up']);
    };

    it('admits the context and the goal briefing once and keeps the prompt', async () => {
      process.env.OPENCHAMBER_DATA_DIR = makeDataDir();
      const { runtime, openCode, emit } = createRuntime({ retryDelayMs: () => 10, persistSessionGoal: async () => {} });
      runtime.start();
      openCode.state.failNext = /\/prompt$/;
      await runtime.enqueue(SESSION, DIRECTORY, queuedWithGoal());
      idle(emit);

      await vi.waitFor(() => expect(runtime.sessionSnapshot(SESSION).items).toEqual([]));
      expectDeliveredOnce(openCode);
      const ids = synthetics(openCode).map((entry) => entry.body.id);
      expect(ids).toEqual([...ids].sort());
      runtime.stop();
      await runtime.flush();
    });

    it('reuses the saved ids after a restart', async () => {
      process.env.OPENCHAMBER_DATA_DIR = makeDataDir();
      const dataDir = makeDataDir();
      const openCode = createOpenCode();
      const first = createRuntime({ dataDir, openCode, retryDelayMs: () => 60_000, persistSessionGoal: async () => {} });
      first.runtime.start();
      openCode.state.failNext = /\/prompt$/;
      await first.runtime.enqueue(SESSION, DIRECTORY, queuedWithGoal());
      idle(first.emit);
      await vi.waitFor(() => expect(synthetics(openCode)).toHaveLength(3));
      await settle();
      expect(prompts(openCode)).toEqual([]);
      first.runtime.stop();
      await first.runtime.flush();

      const second = createRuntime({ dataDir, openCode, persistSessionGoal: async () => {} });
      second.runtime.start();
      await vi.waitFor(() => expect(prompts(openCode)).toHaveLength(1));
      expectDeliveredOnce(openCode);
      second.runtime.stop();
      await second.runtime.flush();
    });

    it('sends nothing while the ids cannot be saved, since a crash would mint them again', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { runtime, openCode, emit } = createRuntime({ retryDelayMs: () => 60_000 });
      runtime.start();
      openCode.state.active = { [SESSION]: { type: 'running' } };
      await runtime.enqueue(SESSION, DIRECTORY, item({ context: [{ kind: 'synthetic', text: 'attached' }] }));
      await runtime.flush();
      openCode.state.active = {};
      const rename = vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('disk full'));
      idle(emit);
      await vi.waitFor(() => expect(rename).toHaveBeenCalled());
      await settle();
      expect(openCode.state.sent).toEqual([]);
      expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
      rename.mockRestore();
      warn.mockRestore();
      runtime.stop();
      await runtime.flush();
    });

    it('takes no ids from a client and shows none in snapshots', async () => {
      const { runtime, openCode, emit, broadcasts } = createRuntime({ retryDelayMs: () => 60_000 });
      runtime.start();
      openCode.state.failNext = /\/prompt$/;
      await runtime.enqueue(SESSION, DIRECTORY, item({ context: [{ kind: 'synthetic', text: 'attached' }], syntheticIds: ['msg_fromclient'] }));
      idle(emit);
      await settle();

      expect(synthetics(openCode)[0].body.id).not.toBe('msg_fromclient');
      expect(JSON.stringify(broadcasts)).not.toContain('syntheticIds');
      expect(JSON.stringify(runtime.snapshot())).not.toContain('syntheticIds');
      runtime.stop();
      await runtime.flush();
    });
  });

  it('keeps files on the command route, which is all that route accepts', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    openCode.state.commands = [{ name: 'review' }];
    await runtime.enqueue(SESSION, DIRECTORY, item({
      content: '/review',
      text: '/review',
      attachments: [{ id: 'a', filename: 'f.txt', mimeType: 'text/plain', size: 1, source: 'local', dataUrl: 'data:text/plain,hi' }],
    }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent[0].path).toBe(`/api/session/${SESSION}/command`);
    expect(openCode.state.sent[0].body).toEqual({
      name: 'review',
      text: '',
      files: [{ uri: 'data:text/plain,hi', name: 'f.txt' }],
    });
  });

  it('hands the model an attachment\'s resolved on-disk path as its name', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item({
      attachments: [{
        id: 'a', filename: 'report.txt', mimeType: 'text/plain', size: 1, source: 'local',
        dataUrl: 'data:text/plain,hi', agentPath: '/Users/me/Documents/report.txt',
      }],
    }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent.at(-1).body).toEqual({
      text: 'follow up',
      files: [{ uri: 'data:text/plain,hi', name: '/Users/me/Documents/report.txt' }],
    });
  });

  it('admits captured context as synthetic messages and still runs a queued command through the command route', async () => {
    // The command route takes attachments only, so the context goes ahead as
    // synthetic messages; the command itself keeps its route, because sending
    // "/review ..." as a prompt would skip the template OpenCode expands there.
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    openCode.state.commands = [{ name: 'review', description: 'Review' }];
    const metadata = { openchamberContext: { kind: 'chat-quote', quote: 'q', text: 'why?' } };
    await runtime.enqueue(SESSION, DIRECTORY, item({
      content: '/review src "error handling"',
      text: '/review src "error handling"',
      context: [{ kind: 'context', text: 'quoted', metadata }],
    }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent.map((entry) => entry.path)).toEqual([
      `/api/session/${SESSION}/synthetic`,
      `/api/session/${SESSION}/command`,
    ]);
    expect(openCode.state.sent[0].body).toEqual({ id: expect.stringMatching(/^msg_/), text: 'quoted', resume: false, metadata });
    expect(openCode.state.sent[1].body).toEqual({ name: 'review', text: 'src "error handling"' });
  });

  it('writes the project knowledge into the session before a queued command', async () => {
    const openCode = createOpenCode();
    const knowledge = {
      sync: async (sessionId, directory, responseStyleInstruction) => {
        openCode.state.sent.push({ path: 'knowledge', body: { sessionId, directory, responseStyleInstruction } });
      },
    };
    const { runtime, emit } = createRuntime({ openCode, knowledge });
    runtime.start();
    openCode.state.commands = [{ name: 'review' }];
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: '/review', text: '/review' }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent).toEqual([
      { path: 'knowledge', body: { sessionId: SESSION, directory: DIRECTORY } },
      expect.objectContaining({ path: `/api/session/${SESSION}/command` }),
    ]);
  });

  it('admits nothing when the command lookup fails, so a retry cannot duplicate the context', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    openCode.state.failNext = /^\/api\/command$/;
    await runtime.enqueue(SESSION, DIRECTORY, item({
      content: '/review',
      text: '/review',
      context: [{ kind: 'context', text: 'quoted', metadata: {} }],
    }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent).toEqual([]);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
  });

  it('keeps captured context out of snapshots and broadcasts, and hands it back on take', async () => {
    const { runtime, broadcasts } = createRuntime();
    runtime.start();
    const context = [{ kind: 'synthetic', text: 'a large diff' }];
    const { itemId } = await runtime.enqueue(SESSION, DIRECTORY, item({ context }));
    expect(runtime.sessionSnapshot(SESSION).items[0]).not.toHaveProperty('context');
    expect(runtime.sessionSnapshot(SESSION).items[0].text).toBe('follow up');
    expect(broadcasts.at(-1).properties.session.items[0]).not.toHaveProperty('context');
    const taken = await runtime.take(SESSION, itemId);
    expect(taken.item.context).toEqual(context);
  });

  it('writes the project knowledge into the session before the prompt, and sends anyway when that fails', async () => {
    const openCode = createOpenCode();
    const knowledge = {
      // `sync` reports failure by resolving false; it never throws.
      sync: async (sessionId, directory, responseStyleInstruction) => {
        openCode.state.sent.push({ path: 'knowledge', body: { sessionId, directory, responseStyleInstruction } });
        return false;
      },
    };
    const { runtime, emit } = createRuntime({ openCode, knowledge });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item({ context: [{ kind: 'context', text: 'quoted', metadata: {} }] }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent.map((entry) => entry.path)).toEqual([
      'knowledge',
      `/api/session/${SESSION}/synthetic`,
      `/api/session/${SESSION}/prompt`,
    ]);
    expect(openCode.state.sent[0].body).toEqual({ sessionId: SESSION, directory: DIRECTORY });
>>>>>>> bc50ba56a
  });
});
