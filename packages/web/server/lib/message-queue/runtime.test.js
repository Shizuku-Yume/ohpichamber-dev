import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, it } from 'vitest';
import { createCanonicalQueueRuntime } from './canonical-runtime.js';
import { createPromptQueueStore } from './sqlite-store.js';

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
    agentMention: { agentId: 'reviewer' },
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
});
