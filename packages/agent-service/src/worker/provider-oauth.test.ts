import { expect, jest, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthStorage, SqliteAuthCredentialStore, registerOAuthProvider, unregisterOAuthProvider, type OAuthLoginCallbacks, type OAuthCredentials } from '@oh-my-pi/pi-ai';
import type { ProviderOAuthResult } from '@openchamber/agent-contract';
import { NativeProviderOAuth } from './provider-oauth.ts';

const methodId = 'task49-local-login';
const providerId = 'task49-local-models';
const tokens: OAuthCredentials = { access: 'local-access-secret', refresh: 'local-refresh-secret', expires: 4102444800000, email: 'local@example.test', accountId: 'local-account' };

function openStorage(path: string): AuthStorage {
  return new AuthStorage(new SqliteAuthCredentialStore(new Database(path)));
}

async function fixture(login: (callbacks: OAuthLoginCallbacks) => Promise<OAuthCredentials | string>) {
  const root = await mkdtemp(join(tmpdir(), 'provider-oauth-'));
  const path = join(root, 'credentials.db');
  const storage = openStorage(path);
  await storage.credentials.reload();
  registerOAuthProvider({ id: methodId, name: 'Local controlled login', storeCredentialsAs: providerId, login });
  const oauth = new NativeProviderOAuth(storage, 'generation-local');
  let storageClosed = false;
  const closeStorage = () => {
    if (!storageClosed) { storage.close(); storageClosed = true; }
  };
  return { storage, oauth, path, closeStorage, async close() {
    await oauth.close();
    closeStorage();
    unregisterOAuthProvider(methodId);
    await rm(root, { recursive: true, force: true });
  } };
}

function identity(flow: ProviderOAuthResult) {
  return { flowId: flow.flowId, generation: flow.generation };
}

async function ready(oauth: NativeProviderOAuth, flow: ProviderOAuthResult, revision = '7') {
  // Bounded microtask turns let the registered native callback finish without sleeps or network.
  let result = flow;
  for (let turn = 0; turn < 20 && result.status === 'pending'; turn++) {
    result = await oauth.execute(methodId, { action: 'status', ...identity(flow) }, revision);
  }
  expect(result.status).toBe('ready');
  return result;
}

function expectNoSecrets(value: ProviderOAuthResult) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toContain(tokens.access);
  expect(serialized).not.toContain(tokens.refresh);
}

test('native manual login remains private through pending/status/ready and persists only after CAS commit under storeCredentialsAs', async () => {
  let receivedInput: string | undefined;
  const f = await fixture(async callbacks => {
    callbacks.onAuth({ url: 'http://127.0.0.1:18080/authorize?state=local', instructions: 'Paste the local callback code' });
    receivedInput = await callbacks.onPrompt({ message: 'Callback code' });
    return tokens;
  });
  try {
    expect(f.oauth.methods().methods).toContainEqual({ methodId, providerId, storeCredentialsAs: providerId, name: 'Local controlled login' });
    const pending = await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7');
    expect(pending).toMatchObject({ providerId, status: 'pending', manualInput: true, prompt: 'Callback code', revision: '7' });
    expect(pending.authorizationUrl).toBe('http://127.0.0.1:18080/authorize?state=local');
    expect(f.storage.credentials.list(providerId)).toEqual([]);
    expect(await f.oauth.execute(methodId, { action: 'status', ...identity(pending) }, '7')).toEqual(pending);
    await expect(f.oauth.execute(methodId, { action: 'commit', ...identity(pending), expectedRevision: '7' }, '8')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    const entered = await f.oauth.execute(methodId, { action: 'input', ...identity(pending), input: 'local-callback-code' }, '7');
    const grant = await ready(f.oauth, entered);
    expect(receivedInput).toBe('local-callback-code');
    expect(grant.manualInput).toBe(false);
    expectNoSecrets(grant);
    expect(f.storage.credentials.list(providerId)).toEqual([]);
    const beforeCommit = openStorage(f.path);
    try {
      await beforeCommit.credentials.reload();
      expect(beforeCommit.credentials.list(providerId)).toEqual([]);
    } finally { beforeCommit.close(); }
    await expect(f.oauth.execute(methodId, { action: 'commit', ...identity(grant), expectedRevision: '7' }, '9')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    await expect(f.oauth.execute(methodId, { action: 'commit', ...identity(grant), expectedRevision: '8' }, '9')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    expect(f.storage.credentials.list(providerId)).toEqual([]);
    const committed = await f.oauth.execute(methodId, { action: 'commit', ...identity(grant), expectedRevision: '7' }, '8');
    expect(committed).toMatchObject({ status: 'authenticated', revision: '8', providerId, manualInput: false });
    expectNoSecrets(committed);
    expect(f.storage.credentials.list(methodId)).toEqual([]);
    expect(f.storage.credentials.list(providerId)).toHaveLength(1);
    await expect(f.oauth.execute(methodId, { action: 'commit', ...identity(grant), expectedRevision: '7' }, '8')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    await f.oauth.close();
    f.closeStorage();
    const reopened = openStorage(f.path);
    try {
      await reopened.credentials.reload();
      expect(reopened.credentials.list(providerId)).toHaveLength(1);
      expect(reopened.credentials.list(providerId)[0]?.credential).toMatchObject({ type: 'oauth', ...tokens });
      expect(reopened.credentials.list(methodId)).toEqual([]);
    } finally { reopened.close(); }
  } finally { await f.close(); }
});

test('stale revisions, wrong methods, and stale generations cannot operate or persist a native grant', async () => {
  const f = await fixture(async () => tokens);
  try {
    await expect(f.oauth.execute(methodId, { action: 'start', expectedRevision: '6' }, '7')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    const flow = await ready(f.oauth, await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7'));
    for (const action of ['status', 'cancel', 'input', 'commit'] as const) {
      const request = { action, ...identity(flow), generation: 'retired-generation', input: 'code', expectedRevision: '7' };
      // Build each strict action shape rather than passing unrelated fields.
      const stale = action === 'input' ? { action, flowId: request.flowId, generation: request.generation, input: request.input }
        : action === 'commit' ? { action, flowId: request.flowId, generation: request.generation, expectedRevision: request.expectedRevision }
          : { action, flowId: request.flowId, generation: request.generation };
      await expect(f.oauth.execute(methodId, stale, '8')).rejects.toMatchObject({ code: 'WORKER_GENERATION_CONFLICT' });
    }
    await expect(f.oauth.execute(providerId, { action: 'status', ...identity(flow) }, '7')).rejects.toMatchObject({ code: 'WORKER_GENERATION_CONFLICT' });
    await expect(f.oauth.execute(methodId, { action: 'status', flowId: 'unknown-flow', generation: flow.generation }, '7')).rejects.toMatchObject({ code: 'WORKER_GENERATION_CONFLICT' });
    expect(f.storage.credentials.list(providerId)).toEqual([]);
  } finally { await f.close(); }
});

test('cancel, replacement login, provider cancellation, and worker close dispose prompts without persistence', async () => {
  const signals: AbortSignal[] = [];
  const f = await fixture(async callbacks => {
    if (callbacks.signal) signals.push(callbacks.signal);
    await callbacks.onManualCodeInput?.(callbacks.signal);
    return tokens;
  });
  try {
    const first = await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7');
    expect(first.manualInput).toBe(true);
    const second = await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7');
    expect(second.flowId).not.toBe(first.flowId);
    await expect(f.oauth.execute(methodId, { action: 'status', ...identity(first) }, '7')).rejects.toMatchObject({ code: 'WORKER_GENERATION_CONFLICT' });
    const cancelled = await f.oauth.execute(methodId, { action: 'cancel', ...identity(second) }, '7');
    expect(cancelled).toMatchObject({ status: 'cancelled', manualInput: false });
    await expect(f.oauth.execute(methodId, { action: 'input', ...identity(second), input: 'late-code' }, '7')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    const third = await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7');
    f.oauth.cancelProvider(providerId);
    expect((await f.oauth.execute(methodId, { action: 'status', ...identity(third) }, '7')).status).toBe('cancelled');
    const fourth = await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7');
    await f.oauth.close();
    expect(signals).toHaveLength(4);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    await expect(f.oauth.execute(methodId, { action: 'status', ...identity(fourth) }, '7')).rejects.toMatchObject({ code: 'WORKER_GENERATION_CONFLICT' });
    expect(f.storage.credentials.list(providerId)).toEqual([]);
  } finally { await f.close(); }
});

test('cancelling a ready native grant discards tokens and provider failures expose only sanitized status', async () => {
  const f = await fixture(async () => tokens);
  try {
    const flow = await ready(f.oauth, await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7'));
    expect((await f.oauth.execute(methodId, { action: 'cancel', ...identity(flow) }, '7')).status).toBe('cancelled');
    await expect(f.oauth.execute(methodId, { action: 'commit', ...identity(flow), expectedRevision: '7' }, '8')).rejects.toMatchObject({ code: 'CATALOG_CONFLICT' });
    registerOAuthProvider({ id: methodId, name: 'Local failure', storeCredentialsAs: providerId, async login() { throw new Error(`private provider failure ${tokens.access}`); } });
    let failed = await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7');
    for (let turn = 0; turn < 20 && failed.status === 'pending'; turn++) failed = await f.oauth.execute(methodId, { action: 'status', ...identity(failed) }, '7');
    expect(failed).toMatchObject({ status: 'failed', error: 'OAUTH_FAILED', manualInput: false });
    expectNoSecrets(failed);
    expect(JSON.stringify(failed)).not.toContain('private provider failure');
    expect(f.storage.credentials.list(providerId)).toEqual([]);
  } finally { await f.close(); }
});

test('browser-session authorization rejects malformed and credential-bearing URLs without reflecting secrets', async () => {
  for (const url of ['not-a-url', 'javascript:alert(1)', 'https://user:browser-private-secret@example.test/login']) {
    const f = await fixture(async callbacks => {
      await callbacks.onBrowserSession?.({ url, cookieNames: ['session'] }, callbacks.signal);
      return tokens;
    });
    try {
      let flow = await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7');
      for (let turn = 0; turn < 20 && flow.status === 'pending'; turn++) {
        flow = await f.oauth.execute(methodId, { action: 'status', ...identity(flow) }, '7');
      }
      expect(flow).toMatchObject({ status: 'failed', error: 'OAUTH_FAILED', manualInput: false });
      expect(flow.authorizationUrl).toBeUndefined();
      expect(JSON.stringify(flow)).not.toContain('browser-private-secret');
      expectNoSecrets(flow);
      expect(f.storage.credentials.list(providerId)).toEqual([]);
    } finally { await f.close(); }
  }
});

for (const state of ['pending', 'ready'] as const) {
  test(`native ${state} flow lease renews on status and expires abandoned grants without persistence`, async () => {
    let signal: AbortSignal | undefined;
    const f = await fixture(async callbacks => {
      signal = callbacks.signal;
      if (state === 'pending') await callbacks.onPrompt({ message: 'Local code' });
      return tokens;
    });
    jest.useFakeTimers();
    try {
      let flow = await f.oauth.execute(methodId, { action: 'start', expectedRevision: '7' }, '7');
      if (state === 'ready') flow = await ready(f.oauth, flow);
      expect(flow.status).toBe(state);
      jest.advanceTimersByTime(59_999);
      expect(signal?.aborted).toBe(false);
      flow = await f.oauth.execute(methodId, { action: 'status', ...identity(flow) }, '7');
      expect(flow.status).toBe(state);
      jest.advanceTimersByTime(59_999);
      expect(signal?.aborted).toBe(false);
      jest.advanceTimersByTime(1);
      expect(signal?.aborted).toBe(true);
      await expect(f.oauth.execute(methodId, { action: 'status', ...identity(flow) }, '7')).rejects.toMatchObject({ code: 'WORKER_GENERATION_CONFLICT' });
      await expect(f.oauth.execute(methodId, { action: 'commit', ...identity(flow), expectedRevision: '7' }, '8')).rejects.toMatchObject({ code: 'WORKER_GENERATION_CONFLICT' });
      expect(f.storage.credentials.list(providerId)).toEqual([]);
    } finally {
      await f.oauth.close();
      jest.useRealTimers();
      await f.close();
    }
  });
}
