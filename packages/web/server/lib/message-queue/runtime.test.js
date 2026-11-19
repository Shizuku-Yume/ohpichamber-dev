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
<<<<<<< HEAD
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
||||||| bc50ba56aa

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
  return {
    runtime,
    openCode,
    dataDir,
    broadcasts,
    promptSent,
    // The hub hands server-side subscribers already-translated events.
    emit: (payload, directory = DIRECTORY) => eventHandler({ payload, directory, translated: () => [payload] }),
    connect: () => statusHandler({ type: 'connect' }),
=======

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
  // The hub hands server-side subscribers already-translated events.
  const emit = (payload, directory = DIRECTORY) => eventHandler({ payload, directory, translated: () => [payload] });
  const connect = () => statusHandler({ type: 'connect' });

  // Runs the timers the runtime armed at its 0 ms quiet delay, then waits out
  // the requests and writes they started, until a pass starts nothing new.
  const drain = async () => {
    let calls;
    do {
      calls = openCode.fetchImpl.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 0));
      await runtime.flush();
    } while (openCode.fetchImpl.mock.calls.length !== calls);
>>>>>>> upstream/main
  };

  // Completion barrier for the exactly-once cases: once the queue is empty and
  // nothing is being sent, replay the triggers that start a send (an idle
  // status and a reconnect) and wait for that processing. A duplicate then
  // shows in the exact assertions that follow instead of arriving after them.
  const replayAfterSend = async (sessionId = SESSION) => {
    await vi.waitFor(() => expect(runtime.sessionSnapshot(sessionId)).toMatchObject({ items: [], sendingId: null }));
    await drain();
    emit({ type: 'session.status', properties: { sessionID: sessionId, status: { type: 'idle' } } });
    connect();
    await drain();
  };

  return { runtime, openCode, dataDir, broadcasts, promptSent, emit, connect, replayAfterSend };
};

<<<<<<< HEAD
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
||||||| bc50ba56aa
const settle = async (ms = 30) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe('scheduled task items', () => {
  const scheduled = (projectId = 'project-1', overrides = {}) => item({
    scheduledTask: { projectId, taskId: 'task-1' }, sendConfig: {}, ...overrides,
  });

  it('deduplicates project and task across sessions, but not across projects', async () => {
    const { runtime, openCode } = createRuntime();
    openCode.state.active = { [SESSION]: { type: 'running' } };
    await runtime.enqueue(SESSION, DIRECTORY, scheduled());
    await expect(runtime.enqueue('ses_other', DIRECTORY, scheduled())).rejects.toMatchObject({ status: 409 });
    await runtime.enqueue(SESSION, DIRECTORY, scheduled('project-2'));
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(2);
    runtime.stop();
    await runtime.flush();
  });

  it('inherits without a model POST and reports sent without waiting for completion', async () => {
    const results = [];
    const { runtime, openCode } = createRuntime({ onScheduledTaskResult: (task, status) => results.push({ task, status }) });
    await runtime.enqueue(SESSION, DIRECTORY, scheduled());
    await settle();
    expect(openCode.state.switched).toEqual([]);
    expect(openCode.state.sent).toHaveLength(1);
    expect(openCode.state.sent[0].body).toEqual({ text: 'follow up' });
    expect(runtime.sessionSnapshot(SESSION).items).toEqual([]);
    expect(results).toEqual([{ task: { projectId: 'project-1', taskId: 'task-1' }, status: 'sent' }]);
    runtime.stop();
    await runtime.flush();
  });

  it('applies explicit selection and keeps the existing directory query', async () => {
    const { runtime, openCode } = createRuntime();
    await runtime.enqueue(SESSION, DIRECTORY, scheduled('project-1', { sendConfig: { providerID: 'openai', modelID: 'chosen', agent: 'plan' } }));
    await settle();
    expect(openCode.state.switched.map((entry) => entry.body)).toEqual([{ model: { providerID: 'openai', id: 'chosen' } }, { agent: 'plan' }]);
    const promptCall = openCode.fetchImpl.mock.calls.find(([url]) => new URL(url).pathname.endsWith('/prompt'));
    expect(new URL(promptCall[0]).searchParams.get('directory')).toBe(DIRECTORY);
    runtime.stop();
    await runtime.flush();
  });

  it('supports an agent override without switching the target model', async () => {
    const { runtime, openCode } = createRuntime();
    await runtime.enqueue(SESSION, DIRECTORY, scheduled('project-1', { sendConfig: { agent: 'plan' } }));
    await settle();
    expect(openCode.state.switched.map((entry) => entry.body)).toEqual([{ agent: 'plan' }]);
    runtime.stop();
    await runtime.flush();
  });

  it('keeps an agent-only override across persistence and restart', async () => {
    const first = createRuntime();
    first.openCode.state.active = { [SESSION]: { type: 'running' } };
    await first.runtime.enqueue(SESSION, DIRECTORY, scheduled('project-1', { sendConfig: { agent: 'plan' } }));
    first.runtime.stop();
    await first.runtime.flush();
    const second = createRuntime({ dataDir: first.dataDir });
    await second.runtime.load();
    expect(second.runtime.sessionSnapshot(SESSION).items[0].sendConfig).toEqual({ agent: 'plan' });
    second.runtime.start();
    await settle();
    expect(second.openCode.state.switched.map((entry) => entry.body)).toEqual([{ agent: 'plan' }]);
    expect(second.openCode.state.sent).toHaveLength(1);
    second.runtime.stop();
    await second.runtime.flush();
  });

  it.each([404, 409])('drops a target refusal %s without holding ordinary items behind it', async (statusCode) => {
    const results = [];
    const { runtime, openCode } = createRuntime({
      beforeScheduledTaskSend: async () => { throw Object.assign(new Error('Scheduled target is unavailable'), { statusCode }); },
      onScheduledTaskResult: (_task, status) => results.push(status),
    });
    await runtime.enqueue(SESSION, DIRECTORY, scheduled());
    await runtime.enqueue(SESSION, DIRECTORY, item({ text: 'ordinary' }));
    await settle();
    expect(results).toEqual(['failed']);
    expect(openCode.state.sent[0].body.text).toBe('ordinary');
    runtime.stop();
    await runtime.flush();
  });

  it.each([
    { operation: 'prompt', status: 500 },
    { operation: 'model', status: 500 },
    { operation: 'model', status: 404 },
    { operation: 'model', status: 409 },
    { operation: 'target lookup', status: 503 },
  ])('uses the ordinary retry policy for scheduled $operation failure $status', async ({ operation, status }) => {
    const results = [];
    let checks = 0;
    const { runtime, openCode, emit } = createRuntime({
      retryDelayMs: () => 100,
      beforeScheduledTaskSend: async () => {
        checks += 1;
        if (operation === 'target lookup' && checks === 1) throw Object.assign(new Error('upstream unavailable'), { statusCode: 503 });
      },
      onScheduledTaskResult: (_task, status) => results.push(status),
    });
    runtime.start();
    openCode.state.failStatus = status;
    if (operation === 'prompt') openCode.state.failNext = /\/prompt$/;
    if (operation === 'model') openCode.state.failNext = /\/model$/;
    await runtime.enqueue(SESSION, DIRECTORY, operation === 'model'
      ? scheduled('project-1', { sendConfig: { providerID: 'openai', modelID: 'chosen' } })
      : scheduled());
    await runtime.enqueue(SESSION, DIRECTORY, item({ text: 'ordinary' }));
    await settle();
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(2);
    expect(results).toEqual([]);
    expect(openCode.state.sent).toEqual([]);
    await expect(runtime.enqueue(SESSION, DIRECTORY, scheduled())).rejects.toMatchObject({ status: 409 });
    await settle(130);
    expect(checks).toBe(2);
    expect(results).toEqual(['sent']);
    expect(openCode.state.sent.map((entry) => entry.body.text)).toEqual(['follow up']);
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent.map((entry) => entry.body.text)).toEqual(['follow up', 'ordinary']);
    runtime.stop();
    await runtime.flush();
  });

  it('rejects scheduled takes, leaves them in bulk take, and allows reorder and remove', async () => {
    const results = [];
    const { runtime, openCode } = createRuntime({ onScheduledTaskResult: (task, status) => results.push({ task, status }) });
    openCode.state.active = { [SESSION]: { type: 'running' } };
    const first = await runtime.enqueue(SESSION, DIRECTORY, scheduled());
    const ordinary = await runtime.enqueue(SESSION, DIRECTORY, item());
    const second = await runtime.enqueue(SESSION, DIRECTORY, scheduled('project-1', { scheduledTask: { projectId: 'project-1', taskId: 'task-2' } }));
    await runtime.reorder(SESSION, [second.itemId, ordinary.itemId, first.itemId]);
    await expect(runtime.take(SESSION, first.itemId)).rejects.toMatchObject({ status: 409 });
    expect((await runtime.takeAll(SESSION)).items.map((entry) => entry.id)).toEqual([ordinary.itemId]);
    expect(runtime.sessionSnapshot(SESSION).items.map((entry) => entry.id)).toEqual([second.itemId, first.itemId]);
    expect(results).toEqual([]);
    await runtime.remove(SESSION, second.itemId);
    expect(results).toEqual([{ task: { projectId: 'project-1', taskId: 'task-2' }, status: 'cancelled' }]);
    runtime.stop();
    await runtime.flush();
  });

  it('ignores creation-only policy fields on stored scheduled provenance', () => {
    const parsed = parseQueuedItemInput(scheduled('project-1', {
      scheduledTask: { projectId: 'project-1', taskId: 'task-1', goalEnabled: true, goalTokenBudget: 5000, permissionAutoAccept: true },
    }));
    expect(parsed.scheduledTask).toEqual({ projectId: 'project-1', taskId: 'task-1' });
  });

  it('cancels only the requested task and survives a restart with provenance', async () => {
    const results = [];
    const first = createRuntime({ onScheduledTaskResult: (_task, status) => results.push(status) });
    first.openCode.state.active = { [SESSION]: { type: 'running' } };
    await first.runtime.enqueue(SESSION, DIRECTORY, scheduled());
    await first.runtime.enqueue(SESSION, DIRECTORY, item());
    first.runtime.stop();
    await first.runtime.flush();
    const second = createRuntime({ dataDir: first.dataDir, onScheduledTaskResult: (_task, status) => results.push(status) });
    await second.runtime.load();
    expect(second.runtime.sessionSnapshot(SESSION).items[0].scheduledTask).toEqual({ projectId: 'project-1', taskId: 'task-1' });
    await second.runtime.cancelScheduledTask('project-1', 'task-1');
    expect(second.runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
    expect(results).toEqual(['cancelled']);
    second.runtime.stop();
    await second.runtime.flush();
  });
=======
/** Every send POST, landed or not: the fake keeps a repeated synthetic id out of `sent`, so `sent` alone hides a duplicate. */
const sendPosts = (openCode) => openCode.fetchImpl.mock.calls
  .filter(([url, init]) => init?.method === 'POST' && /\/(prompt|command|synthetic)$/.test(new URL(url).pathname))
  .map(([url, init]) => ({ path: new URL(url).pathname, body: JSON.parse(init.body) }));

const settle = async (ms = 30) => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

describe('scheduled task items', () => {
  const scheduled = (projectId = 'project-1', overrides = {}) => item({
    scheduledTask: { projectId, taskId: 'task-1' }, sendConfig: {}, ...overrides,
  });

  it('deduplicates project and task across sessions, but not across projects', async () => {
    const { runtime, openCode } = createRuntime();
    openCode.state.active = { [SESSION]: { type: 'running' } };
    await runtime.enqueue(SESSION, DIRECTORY, scheduled());
    await expect(runtime.enqueue('ses_other', DIRECTORY, scheduled())).rejects.toMatchObject({ status: 409 });
    await runtime.enqueue(SESSION, DIRECTORY, scheduled('project-2'));
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(2);
    runtime.stop();
    await runtime.flush();
  });

  it('inherits without a model POST and reports sent without waiting for completion', async () => {
    const results = [];
    const { runtime, openCode } = createRuntime({ onScheduledTaskResult: (task, status) => results.push({ task, status }) });
    await runtime.enqueue(SESSION, DIRECTORY, scheduled());
    await vi.waitFor(() => {
      expect(openCode.state.switched).toEqual([]);
      expect(openCode.state.sent).toHaveLength(1);
      expect(openCode.state.sent[0].body).toEqual({ text: 'follow up' });
      expect(runtime.sessionSnapshot(SESSION).items).toEqual([]);
      expect(results).toEqual([{ task: { projectId: 'project-1', taskId: 'task-1' }, status: 'sent' }]);
    });
    runtime.stop();
    await runtime.flush();
  });

  it('applies explicit selection and keeps the existing directory query', async () => {
    const { runtime, openCode } = createRuntime();
    await runtime.enqueue(SESSION, DIRECTORY, scheduled('project-1', { sendConfig: { providerID: 'openai', modelID: 'chosen', agent: 'plan' } }));
    await vi.waitFor(() => expect(openCode.state.switched.map((entry) => entry.body)).toEqual([{ model: { providerID: 'openai', id: 'chosen' } }, { agent: 'plan' }]));
    const promptCall = openCode.fetchImpl.mock.calls.find(([url]) => new URL(url).pathname.endsWith('/prompt'));
    expect(new URL(promptCall[0]).searchParams.get('directory')).toBe(DIRECTORY);
    runtime.stop();
    await runtime.flush();
  });

  it('supports an agent override without switching the target model', async () => {
    const { runtime, openCode } = createRuntime();
    await runtime.enqueue(SESSION, DIRECTORY, scheduled('project-1', { sendConfig: { agent: 'plan' } }));
    await vi.waitFor(() => expect(openCode.state.switched.map((entry) => entry.body)).toEqual([{ agent: 'plan' }]));
    runtime.stop();
    await runtime.flush();
  });

  it('keeps an agent-only override across persistence and restart', async () => {
    const first = createRuntime();
    first.openCode.state.active = { [SESSION]: { type: 'running' } };
    await first.runtime.enqueue(SESSION, DIRECTORY, scheduled('project-1', { sendConfig: { agent: 'plan' } }));
    first.runtime.stop();
    await first.runtime.flush();
    const second = createRuntime({ dataDir: first.dataDir });
    await second.runtime.load();
    expect(second.runtime.sessionSnapshot(SESSION).items[0].sendConfig).toEqual({ agent: 'plan' });
    second.runtime.start();
    await vi.waitFor(() => {
      expect(second.openCode.state.switched.map((entry) => entry.body)).toEqual([{ agent: 'plan' }]);
      expect(second.openCode.state.sent).toHaveLength(1);
    });
    second.runtime.stop();
    await second.runtime.flush();
  });

  it.each([404, 409])('drops a target refusal %s without holding ordinary items behind it', async (statusCode) => {
    const results = [];
    const { runtime, openCode } = createRuntime({
      beforeScheduledTaskSend: async () => { throw Object.assign(new Error('Scheduled target is unavailable'), { statusCode }); },
      onScheduledTaskResult: (_task, status) => results.push(status),
    });
    await runtime.enqueue(SESSION, DIRECTORY, scheduled());
    await runtime.enqueue(SESSION, DIRECTORY, item({ text: 'ordinary' }));
    await vi.waitFor(() => {
      expect(results).toEqual(['failed']);
      expect(openCode.state.sent[0].body.text).toBe('ordinary');
    });
    runtime.stop();
    await runtime.flush();
  });

  it.each([
    { operation: 'prompt', status: 500 },
    { operation: 'model', status: 500 },
    { operation: 'model', status: 404 },
    { operation: 'model', status: 409 },
    { operation: 'target lookup', status: 503 },
  ])('uses the ordinary retry policy for scheduled $operation failure $status', async ({ operation, status }) => {
    const results = [];
    let checks = 0;
    const { runtime, openCode, emit } = createRuntime({
      retryDelayMs: () => 100,
      beforeScheduledTaskSend: async () => {
        checks += 1;
        if (operation === 'target lookup' && checks === 1) throw Object.assign(new Error('upstream unavailable'), { statusCode: 503 });
      },
      onScheduledTaskResult: (_task, status) => results.push(status),
    });
    runtime.start();
    openCode.state.failStatus = status;
    if (operation === 'prompt') openCode.state.failNext = /\/prompt$/;
    if (operation === 'model') openCode.state.failNext = /\/model$/;
    await runtime.enqueue(SESSION, DIRECTORY, operation === 'model'
      ? scheduled('project-1', { sendConfig: { providerID: 'openai', modelID: 'chosen' } })
      : scheduled());
    await runtime.enqueue(SESSION, DIRECTORY, item({ text: 'ordinary' }));
    await settle();
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(2);
    expect(results).toEqual([]);
    expect(openCode.state.sent).toEqual([]);
    await expect(runtime.enqueue(SESSION, DIRECTORY, scheduled())).rejects.toMatchObject({ status: 409 });
    await vi.waitFor(() => {
      expect(checks).toBe(2);
      expect(results).toEqual(['sent']);
      expect(openCode.state.sent.map((entry) => entry.body.text)).toEqual(['follow up']);
    });
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => expect(openCode.state.sent.map((entry) => entry.body.text)).toEqual(['follow up', 'ordinary']));
    runtime.stop();
    await runtime.flush();
  });

  it('rejects scheduled takes, leaves them in bulk take, and allows reorder and remove', async () => {
    const results = [];
    const { runtime, openCode } = createRuntime({ onScheduledTaskResult: (task, status) => results.push({ task, status }) });
    openCode.state.active = { [SESSION]: { type: 'running' } };
    const first = await runtime.enqueue(SESSION, DIRECTORY, scheduled());
    const ordinary = await runtime.enqueue(SESSION, DIRECTORY, item());
    const second = await runtime.enqueue(SESSION, DIRECTORY, scheduled('project-1', { scheduledTask: { projectId: 'project-1', taskId: 'task-2' } }));
    await runtime.reorder(SESSION, [second.itemId, ordinary.itemId, first.itemId]);
    await expect(runtime.take(SESSION, first.itemId)).rejects.toMatchObject({ status: 409 });
    expect((await runtime.takeAll(SESSION)).items.map((entry) => entry.id)).toEqual([ordinary.itemId]);
    expect(runtime.sessionSnapshot(SESSION).items.map((entry) => entry.id)).toEqual([second.itemId, first.itemId]);
    expect(results).toEqual([]);
    await runtime.remove(SESSION, second.itemId);
    expect(results).toEqual([{ task: { projectId: 'project-1', taskId: 'task-2' }, status: 'cancelled' }]);
    runtime.stop();
    await runtime.flush();
  });

  it('ignores creation-only policy fields on stored scheduled provenance', () => {
    const parsed = parseQueuedItemInput(scheduled('project-1', {
      scheduledTask: { projectId: 'project-1', taskId: 'task-1', goalEnabled: true, goalTokenBudget: 5000, permissionAutoAccept: true },
    }));
    expect(parsed.scheduledTask).toEqual({ projectId: 'project-1', taskId: 'task-1' });
  });

  it('cancels only the requested task and survives a restart with provenance', async () => {
    const results = [];
    const first = createRuntime({ onScheduledTaskResult: (_task, status) => results.push(status) });
    first.openCode.state.active = { [SESSION]: { type: 'running' } };
    await first.runtime.enqueue(SESSION, DIRECTORY, scheduled());
    await first.runtime.enqueue(SESSION, DIRECTORY, item());
    first.runtime.stop();
    await first.runtime.flush();
    const second = createRuntime({ dataDir: first.dataDir, onScheduledTaskResult: (_task, status) => results.push(status) });
    await second.runtime.load();
    expect(second.runtime.sessionSnapshot(SESSION).items[0].scheduledTask).toEqual({ projectId: 'project-1', taskId: 'task-1' });
    await second.runtime.cancelScheduledTask('project-1', 'task-1');
    expect(second.runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
    expect(results).toEqual(['cancelled']);
    second.runtime.stop();
    await second.runtime.flush();
  });
>>>>>>> upstream/main
});

<<<<<<< HEAD
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
||||||| bc50ba56aa
describe('auto routing', () => {
  it('switches a queued prompt and a queued command onto the routed model and agent', async () => {
    const resolveAutoSelection = vi.fn(async ({ model }) => (model?.id === 'auto'
      ? { model: { providerID: 'openai', id: 'gpt-6-astra' }, agent: 'plan', decision: {} }
      : null));
    const { runtime, openCode, emit } = createRuntime({ resolveAutoSelection });
    runtime.start();
    openCode.state.statuses = { [SESSION]: { type: 'busy' } };
    openCode.state.commands = [{ name: 'review', template: 'Review $ARGUMENTS' }];
    const auto = { providerID: 'openchamber', modelID: 'auto', agent: 'build' };
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'plain', text: 'plain', sendConfig: auto }));
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: '/review src', text: '/review src', sendConfig: auto }));

    openCode.state.statuses = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    // v2 carries no model in a prompt body: the session is switched first.
    const switched = openCode.state.switched.filter((entry) => entry.path.endsWith('/model'));
    expect(switched.map((entry) => entry.body.model)).toEqual([
      { providerID: 'openai', id: 'gpt-6-astra' },
      { providerID: 'openai', id: 'gpt-6-astra' },
    ]);
    expect(openCode.state.switched.filter((entry) => entry.path.endsWith('/agent')).map((entry) => entry.body.agent))
      .toEqual(['plan', 'plan']);
    expect(resolveAutoSelection).toHaveBeenCalledTimes(2);
    expect(resolveAutoSelection.mock.calls[0][0]).toMatchObject({ sessionId: SESSION, directory: DIRECTORY, requestText: 'plain' });
  });

  it('tells the classifier about an image attached to a queued send', async () => {
    const resolveAutoSelection = vi.fn(async () => null);
    const { runtime, openCode, emit } = createRuntime({ resolveAutoSelection });
    runtime.start();
    openCode.state.statuses = { [SESSION]: { type: 'busy' } };
    const auto = { providerID: 'openchamber', modelID: 'auto', agent: 'build' };
    const image = { id: 'a', filename: 'shot.png', mimeType: 'image/png', size: 1, source: 'local', dataUrl: 'data:image/png;base64,AAAA' };
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: "what's wrong?", text: "what's wrong?", attachments: [image], sendConfig: auto }));

    openCode.state.statuses = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(resolveAutoSelection.mock.calls[0][0].requestText).toBe("what's wrong?\n\n[The user attached an image: shot.png]");
  });
});

describe('parseQueuedItemInput', () => {
  it('rejects an item the server could not deliver later', () => {
    expect(() => parseQueuedItemInput({ content: 'x' })).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ content: '', text: '' }))).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ attachments: [{ filename: 'a.png' }] }))).toThrow(TypeError);
  });

  it('keeps delivery fields and trims blank edges of the content', () => {
    const parsed = parseQueuedItemInput(item({ content: '\n\nhello\n', text: 'hello', agentMention: 'reviewer' }));
    expect(parsed).toEqual({
      content: 'hello',
      text: 'hello',
      agentMention: 'reviewer',
      attachments: [],
      context: [],
      sendConfig: { providerID: 'anthropic', modelID: 'claude', agent: 'build' },
=======
describe('auto routing', () => {
  it('switches a queued prompt and a queued command onto the routed model and agent', async () => {
    const resolveAutoSelection = vi.fn(async ({ model }) => (model?.id === 'auto'
      ? { model: { providerID: 'openai', id: 'gpt-6-astra' }, agent: 'plan', decision: {} }
      : null));
    const { runtime, openCode, emit, replayAfterSend } = createRuntime({ resolveAutoSelection });
    runtime.start();
    openCode.state.statuses = { [SESSION]: { type: 'busy' } };
    openCode.state.commands = [{ name: 'review', template: 'Review $ARGUMENTS' }];
    const auto = { providerID: 'openchamber', modelID: 'auto', agent: 'build' };
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'plain', text: 'plain', sendConfig: auto }));
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: '/review src', text: '/review src', sendConfig: auto }));

    openCode.state.statuses = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => expect(runtime.sessionSnapshot(SESSION)).toMatchObject({ items: [expect.anything()], sendingId: null }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => {
      // v2 carries no model in a prompt body: the session is switched first.
      const switched = openCode.state.switched.filter((entry) => entry.path.endsWith('/model'));
      expect(switched.map((entry) => entry.body.model)).toEqual([
        { providerID: 'openai', id: 'gpt-6-astra' },
        { providerID: 'openai', id: 'gpt-6-astra' },
      ]);
      expect(openCode.state.switched.filter((entry) => entry.path.endsWith('/agent')).map((entry) => entry.body.agent))
        .toEqual(['plan', 'plan']);
      expect(resolveAutoSelection).toHaveBeenCalledTimes(2);
      expect(resolveAutoSelection.mock.calls[0][0]).toMatchObject({ sessionId: SESSION, directory: DIRECTORY, requestText: 'plain' });
    });
    await replayAfterSend();
    expect(sendPosts(openCode).map((entry) => entry.path)).toEqual([`/api/session/${SESSION}/prompt`, `/api/session/${SESSION}/command`]);
    expect(resolveAutoSelection).toHaveBeenCalledTimes(2);
  });

  it('tells the classifier about an image attached to a queued send', async () => {
    const resolveAutoSelection = vi.fn(async () => null);
    const { runtime, openCode, emit } = createRuntime({ resolveAutoSelection });
    runtime.start();
    openCode.state.statuses = { [SESSION]: { type: 'busy' } };
    const auto = { providerID: 'openchamber', modelID: 'auto', agent: 'build' };
    const image = { id: 'a', filename: 'shot.png', mimeType: 'image/png', size: 1, source: 'local', dataUrl: 'data:image/png;base64,AAAA' };
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: "what's wrong?", text: "what's wrong?", attachments: [image], sendConfig: auto }));

    openCode.state.statuses = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => expect(resolveAutoSelection.mock.calls[0][0].requestText).toBe("what's wrong?\n\n[The user attached an image: shot.png]"));
  });
});

describe('parseQueuedItemInput', () => {
  it('rejects an item the server could not deliver later', () => {
    expect(() => parseQueuedItemInput({ content: 'x' })).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ content: '', text: '' }))).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ attachments: [{ filename: 'a.png' }] }))).toThrow(TypeError);
  });

  it('keeps delivery fields and trims blank edges of the content', () => {
    const parsed = parseQueuedItemInput(item({ content: '\n\nhello\n', text: 'hello', agentMention: 'reviewer' }));
    expect(parsed).toEqual({
      content: 'hello',
      text: 'hello',
      agentMention: 'reviewer',
      attachments: [],
      context: [],
      sendConfig: { providerID: 'anthropic', modelID: 'claude', agent: 'build' },
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
  it('keeps captured context and rejects a malformed part', () => {
    const context = [
      { kind: 'context', text: 'Comment on `a.ts`', metadata: { openchamberContext: { kind: 'code-comment' } }, instructions: '' },
      { kind: 'instruction', text: 'use the skill' },
      { kind: 'synthetic', text: 'conflict payload' },
    ];
    expect(parseQueuedItemInput(item({ context })).context).toEqual([
      { kind: 'context', text: 'Comment on `a.ts`', metadata: { openchamberContext: { kind: 'code-comment' } } },
      { kind: 'instruction', text: 'use the skill' },
      { kind: 'synthetic', text: 'conflict payload' },
    ]);
    expect(() => parseQueuedItemInput(item({ context: [{ kind: 'context', text: 'no metadata' }] }))).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ context: [{ kind: 'other', text: 'x' }] }))).toThrow(TypeError);
  });
=======
  it('keeps captured context and rejects a malformed part', () => {
    const context = [
      { kind: 'context', text: 'Comment on `a.ts`', metadata: { openchamberContext: { kind: 'code-comment' } }, instructions: '' },
      { kind: 'instruction', text: 'use the skill' },
      { kind: 'synthetic', text: 'conflict payload' },
    ];
    expect(parseQueuedItemInput(item({ context })).context).toEqual([
      { kind: 'context', text: 'Comment on `a.ts`', metadata: { openchamberContext: { kind: 'code-comment' } } },
      { kind: 'instruction', text: 'use the skill' },
      { kind: 'synthetic', text: 'conflict payload' },
    ]);
    expect(() => parseQueuedItemInput(item({ context: [{ kind: 'context', text: 'no metadata' }] }))).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ context: [{ kind: 'other', text: 'x' }] }))).toThrow(TypeError);
    expect(parseQueuedItemInput(item({ context })).context[0].metadata).toBe(context[0].metadata);
  });
>>>>>>> upstream/main

<<<<<<< HEAD
  it('repackages a private resolver result before strict store calls', async () => {
    const store = storeFor();
    const service = createService();
    const runtime = createCanonicalQueueRuntime({
      store,
      service,
      resolveAttachments: async () => [],
      publishQueue: () => {},
      reportFailure: () => {},
||||||| bc50ba56aa
  it('accepts an item that is only context', () => {
    const parsed = parseQueuedItemInput(item({ content: '', text: '', context: [{ kind: 'synthetic', text: 'just context' }] }));
    expect(parsed.text).toBe('');
    expect(parsed.context).toHaveLength(1);
  });

  it('keeps a goal captured with the message and rejects one it could not start', () => {
    expect(parseQueuedItemInput(item({ goal: { tokenBudget: null } })).goal).toEqual({ tokenBudget: null });
    expect(parseQueuedItemInput(item({ goal: { objective: ' the plan ', tokenBudget: 5000 } })).goal)
      .toEqual({ objective: 'the plan', tokenBudget: 5000 });
    expect(parseQueuedItemInput(item()).goal).toBeUndefined();
    expect(() => parseQueuedItemInput(item({ goal: { tokenBudget: -1 } }))).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ goal: 'yes' }))).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ content: '', text: '', context: [{ kind: 'synthetic', text: 'x' }], goal: { tokenBudget: null } }))).toThrow(TypeError);
  });
});

describe('a message queued as a goal', () => {
  const previousDataDir = process.env.OPENCHAMBER_DATA_DIR;
  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
    else process.env.OPENCHAMBER_DATA_DIR = previousDataDir;
  });

  it('starts the goal when that message goes out, not with the message before it', async () => {
    const goalsDataDir = makeDataDir();
    process.env.OPENCHAMBER_DATA_DIR = goalsDataDir;
    const persisted = [];
    const { runtime, openCode, emit } = createRuntime({
      persistSessionGoal: async (sessionID, directory, goal) => {
        persisted.push({ sessionID, directory, goal, sentBefore: openCode.state.sent.length });
      },
=======
  it('accepts an item that is only context', () => {
    const parsed = parseQueuedItemInput(item({ content: '', text: '', context: [{ kind: 'synthetic', text: 'just context' }] }));
    expect(parsed.text).toBe('');
    expect(parsed.context).toHaveLength(1);
  });

  it('keeps a goal captured with the message and rejects one it could not start', () => {
    expect(parseQueuedItemInput(item({ goal: { tokenBudget: null } })).goal).toEqual({ tokenBudget: null });
    expect(parseQueuedItemInput(item({ goal: { objective: ' the plan ', tokenBudget: 5000 } })).goal)
      .toEqual({ objective: 'the plan', tokenBudget: 5000 });
    expect(parseQueuedItemInput(item()).goal).toBeUndefined();
    expect(() => parseQueuedItemInput(item({ goal: { tokenBudget: -1 } }))).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ goal: 'yes' }))).toThrow(TypeError);
    expect(() => parseQueuedItemInput(item({ content: '', text: '', context: [{ kind: 'synthetic', text: 'x' }], goal: { tokenBudget: null } }))).toThrow(TypeError);
  });
});

describe('a message queued as a goal', () => {
  const previousDataDir = process.env.OPENCHAMBER_DATA_DIR;
  afterEach(() => {
    if (previousDataDir === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
    else process.env.OPENCHAMBER_DATA_DIR = previousDataDir;
  });

  it('starts the goal when that message goes out, not with the message before it', async () => {
    const goalsDataDir = makeDataDir();
    process.env.OPENCHAMBER_DATA_DIR = goalsDataDir;
    const persisted = [];
    const { runtime, openCode, emit, replayAfterSend } = createRuntime({
      persistSessionGoal: async (sessionID, directory, goal) => {
        persisted.push({ sessionID, directory, goal, sentBefore: openCode.state.sent.length });
      },
>>>>>>> upstream/main
    });
<<<<<<< HEAD
    const queue = await runtime.append({ ...scope, privateToken: 'must-not-reach-store' }, randomUUID(), {
      expectedRevision: '0', content: 'scope-safe', request: { input: { text: 'scope-safe', attachments: [], context: [] }, options },
||||||| bc50ba56aa
    runtime.start();
    openCode.state.active = { [SESSION]: { type: 'running' } };
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'plain first', text: 'plain first' }));
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'build the parser', text: 'build the parser', goal: { tokenBudget: 5000 } }));
    expect(runtime.sessionSnapshot(SESSION).items.map((entry) => entry.goal)).toEqual([undefined, { tokenBudget: 5000 }]);

    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent.map((entry) => entry.body.text)).toEqual(['plain first']);
    expect(persisted).toEqual([]);

    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'busy' } } });
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      sessionID: SESSION,
      directory: DIRECTORY,
      goal: { status: 'active', objectiveFile: true, tokenBudget: 5000 },
      sentBefore: 1,
=======
    runtime.start();
    openCode.state.active = { [SESSION]: { type: 'running' } };
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'plain first', text: 'plain first' }));
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'build the parser', text: 'build the parser', goal: { tokenBudget: 5000 } }));
    expect(runtime.sessionSnapshot(SESSION).items.map((entry) => entry.goal)).toEqual([undefined, { tokenBudget: 5000 }]);

    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    // The first send is done once only the goal message is left and nothing is in flight.
    await vi.waitFor(() => expect(runtime.sessionSnapshot(SESSION)).toMatchObject({ items: [expect.anything()], sendingId: null }));
    expect(openCode.state.sent.map((entry) => entry.body.text)).toEqual(['plain first']);
    expect(persisted).toEqual([]);

    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'busy' } } });
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    // Arming the goal writes its objective file first, which can outlast a fixed settle on a loaded machine.
    await vi.waitFor(() => expect(openCode.state.sent).toHaveLength(3), { timeout: 10_000 });
    await replayAfterSend();

    expect(sendPosts(openCode)).toHaveLength(3);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({
      sessionID: SESSION,
      directory: DIRECTORY,
      goal: { status: 'active', objectiveFile: true, tokenBudget: 5000 },
      sentBefore: 1,
>>>>>>> upstream/main
    });
    assert.equal(queue.sessionId, SESSION);
    await assert.doesNotReject(runtime.getState({ ...scope, privateToken: 'still-private' }));
    await runtime.stop();
  });

<<<<<<< HEAD
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
||||||| bc50ba56aa
  it('admits nothing when the goal cannot be saved, so a retry cannot duplicate the context', async () => {
    process.env.OPENCHAMBER_DATA_DIR = makeDataDir();
    const { runtime, openCode, emit } = createRuntime({
      retryDelayMs: () => 60_000,
      persistSessionGoal: async () => { throw new Error('metadata store down'); },
    });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item({ context: [{ kind: 'synthetic', text: 'attached' }], goal: { tokenBudget: null } }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toEqual([]);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
  });

  it('uses the objective the arming flow supplied', async () => {
    process.env.OPENCHAMBER_DATA_DIR = makeDataDir();
    const persisted = [];
    const { runtime, emit } = createRuntime({
      persistSessionGoal: async (_sessionID, _directory, goal) => { persisted.push(goal); },
    });
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

describe('message queue runtime', () => {
  it('delivers the head of the queue when the session goes idle, in order', async () => {
    const { runtime, openCode, emit, promptSent, broadcasts } = createRuntime();
    runtime.start();
    openCode.state.active = { [SESSION]: { type: 'running' } };

    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'first', text: 'first' }));
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'second', text: 'second' }));
    await settle();
    expect(openCode.state.sent).toHaveLength(0);

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
=======
  it('admits nothing when the goal cannot be saved, so a retry cannot duplicate the context', async () => {
    process.env.OPENCHAMBER_DATA_DIR = makeDataDir();
    const { runtime, openCode, emit } = createRuntime({
      retryDelayMs: () => 60_000,
      persistSessionGoal: async () => { throw new Error('metadata store down'); },
    });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item({ context: [{ kind: 'synthetic', text: 'attached' }], goal: { tokenBudget: null } }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toEqual([]);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
  });

  it('uses the objective the arming flow supplied', async () => {
    process.env.OPENCHAMBER_DATA_DIR = makeDataDir();
    const persisted = [];
    const { runtime, emit } = createRuntime({
      persistSessionGoal: async (_sessionID, _directory, goal) => { persisted.push(goal); },
    });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'Implement this plan: X', text: 'Implement this plan: X', goal: { objective: 'the whole plan', tokenBudget: null } }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => {
      expect(runtime.sessionSnapshot(SESSION).items).toEqual([]);
      expect(persisted).toHaveLength(1);
    }, { timeout: 10_000 });
    expect(fs.readFileSync(path.join(process.env.OPENCHAMBER_DATA_DIR, 'goals', `${SESSION}.md`), 'utf8')).toBe('the whole plan');
    runtime.stop();
    await runtime.flush();
  });
});

describe('message queue runtime', () => {
  it.each(['constructor', 'toString'])('delivers an idle session named %s despite inherited active-map members', async (sessionId) => {
    const { runtime, openCode } = createRuntime();
    runtime.start();
    await runtime.enqueue(sessionId, DIRECTORY, item());
    await vi.waitFor(() => {
      expect(openCode.state.sent).toHaveLength(1);
      expect(openCode.state.sent[0].path).toBe(`/api/session/${sessionId}/prompt`);
      expect(runtime.sessionSnapshot(sessionId).items).toEqual([]);
    });
    runtime.stop();
    await runtime.flush();
  });

  it('delivers the head of the queue when the session goes idle, in order', async () => {
    const { runtime, openCode, emit, promptSent, broadcasts, replayAfterSend } = createRuntime();
    runtime.start();
    openCode.state.active = { [SESSION]: { type: 'running' } };

    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'first', text: 'first' }));
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'second', text: 'second' }));
    await settle();
    expect(openCode.state.sent).toHaveLength(0);

    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => {
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
    });

    // The next turn: busy, then idle again — the second message goes out.
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'busy' } } });
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => {
      expect(openCode.state.sent).toHaveLength(2);
      expect(runtime.sessionSnapshot(SESSION).items).toEqual([]);
    });
    await replayAfterSend();
    expect(sendPosts(openCode).map((entry) => entry.body.text)).toEqual(['first', 'second']);
    expect(promptSent).toEqual([SESSION, SESSION]);
  });

  it('delivers a message queued while busy to the directory the session moved to, once', async () => {
    const { runtime, openCode, emit, broadcasts } = createRuntime();
    runtime.start();
    openCode.state.active = { [SESSION]: { type: 'running' } };
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'after the move', text: 'after the move' }));
    await settle();
    expect(openCode.state.sent).toHaveLength(0);

    emit({ type: 'session.updated', properties: { sessionID: SESSION, info: { id: SESSION, directory: '/repo/moved', projectID: 'project-1' } } });
    expect(runtime.sessionSnapshot(SESSION).directory).toBe('/repo/moved');
    expect(broadcasts.at(-1)).toMatchObject({
      properties: { session: { sessionId: SESSION, directory: '/repo/moved', items: [{ content: 'after the move' }] } },
    });

    openCode.state.active = {};
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();

    expect(openCode.state.sent).toHaveLength(1);
    expect(openCode.state.sent[0].body).toEqual({ text: 'after the move' });
    const promptUrls = openCode.fetchImpl.mock.calls
      .map(([url]) => new URL(url))
      .filter((url) => url.pathname === `/api/session/${SESSION}/prompt`);
    expect(promptUrls.map((url) => url.searchParams.get('directory'))).toEqual(['/repo/moved']);
    expect(runtime.sessionSnapshot(SESSION)).toMatchObject({ directory: '/repo/moved', items: [], sendingId: null });

    // A later idle finds nothing left to send.
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'busy' } } });
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(1);
  });

  it('a session update without a projectID does not move the queue', async () => {
    const { runtime, emit } = createRuntime();
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());

    emit({ type: 'session.updated', properties: { sessionID: SESSION, info: { id: SESSION, directory: '/repo/elsewhere', title: 'Renamed' } } });

    expect(runtime.sessionSnapshot(SESSION).directory).toBe(DIRECTORY);
    runtime.stop();
    await runtime.flush();
  });

  it('sends the queued message to an idle parent while its background subagents run', async () => {
    const { runtime, openCode, emit } = createRuntime();
    runtime.start();
    // The parent is idle while its subagent and that one's own subagent work.
    openCode.state.children = { [SESSION]: ['ses_child'], ses_child: ['ses_grandchild'] };
    openCode.state.active = { ses_child: { type: 'running' }, ses_grandchild: { type: 'running' } };

    await runtime.enqueue(SESSION, DIRECTORY, item({ content: 'next', text: 'next' }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => {
      expect(openCode.state.sent).toHaveLength(1);
      expect(openCode.state.sent[0].body).toEqual({ text: 'next' });
    });
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
    await vi.waitFor(() => expect(openCode.state.sent).toHaveLength(1));
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
    await vi.waitFor(() => {
      expect(openCode.state.sent).toHaveLength(1);
      expect(openCode.state.sent[0].path).toBe(`/api/session/${SESSION}/prompt`);
    });
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
    await vi.waitFor(() => expect(openCode.state.sent).toHaveLength(1));
  });

  it('keeps a failed item and retries with backoff', async () => {
    const { runtime, openCode, emit, broadcasts, replayAfterSend } = createRuntime({ retryDelayMs: () => 20 });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());
    openCode.state.failNext = /\/prompt$/;
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle(10);
    expect(openCode.state.sent).toHaveLength(0);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);
    expect(runtime.sessionSnapshot(SESSION).sendingId).toBeNull();
    expect(broadcasts.at(-1).properties.session.sendingId).toBeNull();
    await vi.waitFor(() => {
      expect(openCode.state.sent).toHaveLength(1);
      expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(0);
    });
    await replayAfterSend();
    // The failed attempt and the retry that landed; nothing after.
    expect(sendPosts(openCode)).toHaveLength(2);
    expect(openCode.state.sent).toHaveLength(1);
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
    await vi.waitFor(() => expect(openCode.state.sent).toHaveLength(1));
  });

  it('waits while an auto-review holds the session and delivers on release', async () => {
    let held = true;
    const { runtime, openCode, emit, replayAfterSend } = createRuntime({ isDeliveryHeld: (sessionId) => held && sessionId === SESSION });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item());
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await settle();
    expect(openCode.state.sent).toHaveLength(0);

    held = false;
    runtime.release(SESSION);
    await vi.waitFor(() => expect(openCode.state.sent).toHaveLength(1));
    await replayAfterSend();
    expect(sendPosts(openCode)).toHaveLength(1);
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
    await vi.waitFor(() => expect(second.openCode.state.sent).toHaveLength(1));
    await second.replayAfterSend();
    expect(sendPosts(second.openCode)).toHaveLength(1);
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
    await vi.waitFor(() => {
      expect(second.openCode.state.sent).toHaveLength(1);
      expect(second.openCode.state.sent[0].body).toEqual({ text: 'persisted' });
    });
    await second.replayAfterSend();
    expect(sendPosts(second.openCode)).toEqual([{ path: `/api/session/${SESSION}/prompt`, body: { text: 'persisted' } }]);
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
    // active map, message tail, model switch, then the prompt itself (held
    // open until released)
    openCode.fetchImpl.mockImplementationOnce(async () => Response.json({ location: {}, data: {} }))
      .mockImplementationOnce(async () => Response.json({ data: [], cursor: {} }))
      .mockImplementationOnce(async () => new Response(null, { status: 204 }))
      .mockImplementationOnce(() => new Promise((resolve) => { release = () => resolve(new Response(null, { status: 204 })); }));
    const { itemId } = await runtime.enqueue(SESSION, DIRECTORY, item());
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => expect(runtime.sessionSnapshot(SESSION).sendingId).toBe(itemId));

    await expect(runtime.remove(SESSION, itemId)).rejects.toMatchObject({ status: 409 });
    await expect(runtime.take(SESSION, itemId)).rejects.toMatchObject({ status: 409 });
    const taken = await runtime.takeAll(SESSION);
    expect(taken.items).toEqual([]);
    expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(1);

    release();
    await vi.waitFor(() => expect(runtime.sessionSnapshot(SESSION).items).toHaveLength(0));
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
    await vi.waitFor(() => {
      expect(openCode.state.sent).toHaveLength(1);
      expect(runtime.snapshot().sessions).toEqual([]);
      expect(broadcasts.at(-1).properties.session).toEqual({ sessionId: SESSION, directory: DIRECTORY, items: [], sendingId: null });
    });
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
    const { runtime, openCode, emit, replayAfterSend } = createRuntime();
    runtime.start();
    openCode.state.commands = [{ name: 'review' }];
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: '/review src', text: '/review src', sendConfig: { providerID: 'p', modelID: 'm', agent: 'build', variant: 'max' } }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => {
      expect(openCode.state.sent).toHaveLength(1);
      expect(openCode.state.sent[0].path).toBe(`/api/session/${SESSION}/command`);
      // v2's command route takes `text`, and the selection lives on the session.
      expect(openCode.state.sent[0].body).toEqual({ name: 'review', text: 'src' });
    });
    await replayAfterSend();
    expect(sendPosts(openCode)).toEqual([{ path: `/api/session/${SESSION}/command`, body: { name: 'review', text: 'src' } }]);
  });

  it('delivers captured context as synthetic messages, instructions first', async () => {
    const { runtime, openCode, emit, replayAfterSend } = createRuntime();
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
    await vi.waitFor(() => expect(openCode.state.sent).toHaveLength(5));
    await replayAfterSend();
    expect(sendPosts(openCode)).toHaveLength(5);

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
    const { runtime, openCode, emit, replayAfterSend } = createRuntime();
    runtime.start();
    openCode.state.revert = { messageID: 'msg_boundary' };
    await runtime.enqueue(SESSION, DIRECTORY, item({ context: [{ kind: 'synthetic', text: 'attached' }] }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => expect(openCode.state.sent).toHaveLength(3));
    await replayAfterSend();
    expect(sendPosts(openCode)).toHaveLength(2);

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
      vi.useFakeTimers();
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
      await vi.waitFor(() => expect(runtime.sessionSnapshot(SESSION).sendingId).toBeNull());
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
      await vi.waitFor(() => expect(synthetics(openCode)).toHaveLength(1));

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
    await vi.waitFor(() => {
      expect(openCode.state.sent[0].path).toBe(`/api/session/${SESSION}/command`);
      expect(openCode.state.sent[0].body).toEqual({
        name: 'review',
        text: '',
        files: [{ uri: 'data:text/plain,hi', name: 'f.txt' }],
      });
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
    await vi.waitFor(() => {
      expect(openCode.state.sent.at(-1).body).toEqual({
        text: 'follow up',
        files: [{ uri: 'data:text/plain,hi', name: '/Users/me/Documents/report.txt' }],
      });
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
    await vi.waitFor(() => {
      expect(openCode.state.sent.map((entry) => entry.path)).toEqual([
        `/api/session/${SESSION}/synthetic`,
        `/api/session/${SESSION}/command`,
      ]);
      expect(openCode.state.sent[0].body).toEqual({ id: expect.stringMatching(/^msg_/), text: 'quoted', resume: false, metadata });
      expect(openCode.state.sent[1].body).toEqual({ name: 'review', text: 'src "error handling"' });
    });
  });

  it('writes the project knowledge into the session before a queued command', async () => {
    const openCode = createOpenCode();
    const knowledge = {
      sync: async (sessionId, directory, responseStyleInstruction) => {
        openCode.state.sent.push({ path: 'knowledge', body: { sessionId, directory, responseStyleInstruction } });
>>>>>>> upstream/main
      },
    };
<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
    const { runtime, emit } = createRuntime({ openCode, knowledge });
    runtime.start();
    openCode.state.commands = [{ name: 'review' }];
    await runtime.enqueue(SESSION, DIRECTORY, item({ content: '/review', text: '/review' }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => {
      expect(openCode.state.sent).toEqual([
        { path: 'knowledge', body: { sessionId: SESSION, directory: DIRECTORY } },
        expect.objectContaining({ path: `/api/session/${SESSION}/command` }),
      ]);
    });
>>>>>>> upstream/main
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
<<<<<<< HEAD
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
||||||| bc50ba56aa
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
=======
    const { runtime, emit } = createRuntime({ openCode, knowledge });
    runtime.start();
    await runtime.enqueue(SESSION, DIRECTORY, item({ context: [{ kind: 'context', text: 'quoted', metadata: {} }] }));
    emit({ type: 'session.status', properties: { sessionID: SESSION, status: { type: 'idle' } } });
    await vi.waitFor(() => {
      expect(openCode.state.sent.map((entry) => entry.path)).toEqual([
        'knowledge',
        `/api/session/${SESSION}/synthetic`,
        `/api/session/${SESSION}/prompt`,
      ]);
      expect(openCode.state.sent[0].body).toEqual({ sessionId: SESSION, directory: DIRECTORY });
    });
>>>>>>> upstream/main
  });
});
