import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { runSearchQuery } from '@oh-my-pi/pi-coding-agent/web/search/index';
import { cfgWebSearchEnabled } from '@oh-my-pi/pi-coding-agent/tools/settings';
import { WebSearchConfigStateSchema } from '@openchamber/agent-contract';
import type { CompletionWorkerBootstrap } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { NativeWebSearch, installWebSearchAuthorization } from './catalog-websearch.ts';
import { openNativeRuntime } from './native-runtime.ts';
import { StatelessWorker } from './stateless.ts';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'native-web-search-'));
  const cwd = join(directory, 'workspace');
  const agentDirectory = join(directory, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const bootstrap: CompletionWorkerBootstrap = {
    type: 'completion.bootstrap', workerGeneration: 'search-generation', authorizationRootId: 'search-owner',
    workspaceId: 'search-workspace', projectId: 'search-project', agentDirectoryId: 'search-agent',
    cwd, agentDirectory, catalogRevision: '0',
  };
  return { directory, bootstrap };
}

test('native worker CAS serializes competing mutations and survives a cold settings/runtime reopen', async () => {
  const { directory, bootstrap } = await fixture();
  let worker = await StatelessWorker.open(bootstrap, async () => {});
  try {
    const initial = await worker.operation({ type: 'web-search', operation: { type: 'read' } });
    expect(initial).toMatchObject({ type: 'web-search', result: { type: 'state', state: { revision: '0' } } });
    const competing = await Promise.allSettled([
      worker.operation({ type: 'web-search', operation: { type: 'update', request: { expectedRevision: '0', enabled: false, timeoutSeconds: 37, selectedProviderId: 'web/google', fallbackProviderIds: ['web/duckduckgo'] } } }),
      worker.operation({ type: 'web-search', operation: { type: 'update', request: { expectedRevision: '0', timeoutSeconds: 38 } } }),
    ]);
    expect(competing.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(competing.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, code: 'CATALOG_CONFLICT' } });
    expect(competing.find(result => result.status === 'fulfilled')).toMatchObject({ value: { type: 'web-search', result: { type: 'mutated', result: {
      persistence: 'persisted', status: 'applied', state: { revision: '1', enabled: false, timeoutSeconds: 37, selectedProviderId: 'web/google', fallbackProviderIds: ['web/duckduckgo'] },
    } } } });
    await worker.close();
    resetSettingsForTest();
    worker = await StatelessWorker.open({ ...bootstrap, workerGeneration: 'cold-search-generation' }, async () => {});
    expect(await worker.operation({ type: 'web-search', operation: { type: 'read' } })).toMatchObject({ type: 'web-search', result: { type: 'state', state: {
      revision: '1', enabled: false, timeoutSeconds: 37, selectedProviderId: 'web/google', fallbackProviderIds: ['web/duckduckgo'],
    } } });
    await expect(worker.operation({ type: 'web-search', operation: { type: 'update', request: { expectedRevision: '0', enabled: true } } })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
  } finally { await worker.close(); await rm(directory, { recursive: true, force: true }); }
});

test('separate workspace native owners sharing the same directory cannot bypass CAS', async () => {
  const { directory, bootstrap } = await fixture();
  const runtime = await openNativeRuntime(bootstrap);
  try {
    const first = new NativeWebSearch(runtime, 'workspace-first', async () => {});
    const second = new NativeWebSearch(runtime, 'workspace-second', async () => {});
    const outcomes = await Promise.allSettled([
      first.operation({ type: 'update', request: { expectedRevision: '0', timeoutSeconds: 41 } }),
      second.operation({ type: 'update', request: { expectedRevision: '0', timeoutSeconds: 42 } }),
    ]);
    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, code: 'CATALOG_CONFLICT' } });
    expect(await first.operation({ type: 'read' })).toMatchObject({ type: 'state', state: { workspaceId: 'workspace-first', revision: '1' } });
    expect(await second.operation({ type: 'read' })).toMatchObject({ type: 'state', state: { workspaceId: 'workspace-second', revision: '1' } });
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

for (const [providerId, nativeCredentialProvider] of [['web/tavily', 'tavily'], ['web/kimi', 'kimi-code'], ['web/ollama', 'ollama-cloud']] as const) {
  test(`native credentials for ${providerId} are write-only, persist through reopen, and delete their exact native owner`, async () => {
    const { directory, bootstrap } = await fixture();
    const secret = `private-${nativeCredentialProvider}-fixture-key`;
    let worker = await StatelessWorker.open(bootstrap, async () => {});
    try {
      const written = await worker.operation({ type: 'web-search', operation: { type: 'credential.write', request: { expectedRevision: '0', providerId, key: secret } } });
      expect(written).toMatchObject({ type: 'web-search', result: { type: 'mutated', result: { persistence: 'persisted', state: { revision: '1' } } } });
      expect(JSON.stringify(written)).not.toContain(secret);
      if (written.type !== 'web-search' || written.result.type !== 'mutated') throw new Error('Expected native search mutation');
      expect(written.result.result.state.providers.find(provider => provider.providerId === providerId)).toMatchObject({ credentialConfigured: true, credentialWritable: true });
      expect(WebSearchConfigStateSchema.parse(written.result.result.state)).toEqual(written.result.result.state);
      await worker.close();
      resetSettingsForTest();
      const persisted = await openNativeRuntime(bootstrap);
      try { expect(await persisted.authStorage.keys.get(nativeCredentialProvider)).toBe(secret); }
      finally { persisted.authStorage.close(); }
      resetSettingsForTest();
      worker = await StatelessWorker.open({ ...bootstrap, workerGeneration: 'search-key-reopen' }, async () => {});
      const read = await worker.operation({ type: 'web-search', operation: { type: 'read' } });
      expect(JSON.stringify(read)).not.toContain(secret);
      const removed = await worker.operation({ type: 'web-search', operation: { type: 'credential.delete', request: { expectedRevision: '1', providerId } } });
      expect(removed).toMatchObject({ type: 'web-search', result: { type: 'mutated', result: { persistence: 'persisted', state: { revision: '2' } } } });
      if (removed.type !== 'web-search' || removed.result.type !== 'mutated') throw new Error('Expected native search credential deletion');
      expect(removed.result.result.state.providers.find(provider => provider.providerId === providerId)?.credentialConfigured).toBe(false);
      expect(JSON.stringify(removed)).not.toContain(secret);
    } finally { await worker.close(); await rm(directory, { recursive: true, force: true }); }
  });
}

test('failed durable revision reservation never commits a native credential or reports persistence success', async () => {
  const { directory, bootstrap } = await fixture();
  const revisionPath = join(bootstrap.agentDirectory, 'openchamber-web-search-revision');
  const runtime = await openNativeRuntime(bootstrap);
  let interrupt = true;
  const search = new NativeWebSearch(runtime, bootstrap.workspaceId, async request => {
    if (request.type === 'provider-entry' && interrupt) {
      interrupt = false;
      await mkdir(revisionPath);
    }
  });
  try {
    const result = await search.operation({ type: 'credential.write', request: { expectedRevision: '0', providerId: 'web/tavily', key: 'must-not-persist' } });
    expect(result).toMatchObject({ type: 'mutated', result: { persistence: 'failed', status: 'failed', state: { revision: '0' }, workers: [] } });
    expect(runtime.authStorage.credentials.has('tavily')).toBe(false);
    expect(JSON.stringify(result)).not.toContain('must-not-persist');
    await rm(revisionPath, { recursive: true });
    expect(await search.operation({ type: 'read' })).toMatchObject({ type: 'state', state: { revision: '0' } });
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('native credential-store failure consumes its reserved CAS token and fails closed without fake success', async () => {
  const { directory, bootstrap } = await fixture();
  let runtime = await openNativeRuntime(bootstrap);
  const search = new NativeWebSearch(runtime, bootstrap.workspaceId, async request => {
    if (request.type === 'provider-entry') runtime.authStorage.close();
  });
  try {
    await expect(search.operation({ type: 'credential.write', request: { expectedRevision: '0', providerId: 'web/tavily', key: 'closed-store-secret' } })).rejects.toThrow();
    expect(search.requiresRestart).toBe(true);
    expect((await readFile(join(bootstrap.agentDirectory, 'openchamber-web-search-revision'), 'utf8')).trim()).toBe('1');
    await expect(search.operation({ type: 'update', request: { expectedRevision: '1', timeoutSeconds: 51 } })).rejects.toMatchObject({ status: 503, code: 'SERVICE_UNAVAILABLE' });
    resetSettingsForTest();
    runtime = await openNativeRuntime(bootstrap);
    const reopened = new NativeWebSearch(runtime, bootstrap.workspaceId, async () => {});
    expect(await reopened.operation({ type: 'read' })).toMatchObject({ type: 'state', state: { revision: '1' } });
    expect(runtime.authStorage.credentials.has('tavily')).toBe(false);
    await expect(reopened.operation({ type: 'update', request: { expectedRevision: '0', timeoutSeconds: 52 } })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('native query execution checks live Host authorization and enabled state even for explicit selectors', async () => {
  const { directory, bootstrap } = await fixture();
  const runtime = await openNativeRuntime(bootstrap);
  let policyCalls = 0;
  const refusal = new ProjectionError(403, 'UNAUTHORIZED', 'Host search egress is disabled');
  try {
    await installWebSearchAuthorization(runtime, async request => {
      if (request.type === 'web-search') { policyCalls++; throw refusal; }
    });
    const denied = await runSearchQuery({ query: 'harmless search', model: 'web/google' }, { authStorage: runtime.authStorage, modelRegistry: runtime.modelRegistry });
    expect(policyCalls).toBeGreaterThan(0);
    expect(denied.details.response.sources).toEqual([]);
    expect(denied.details.error).toBeDefined();
    const beforeDisabled = policyCalls;
    cfgWebSearchEnabled.set(runtime.settings, false);
    await runtime.settings.flush();
    const disabled = await runSearchQuery({ query: 'harmless search', model: 'web/google' }, { authStorage: runtime.authStorage, modelRegistry: runtime.modelRegistry });
    expect(disabled.details.response.sources).toEqual([]);
    expect(disabled.details.error).toBeDefined();
    expect(policyCalls).toBe(beforeDisabled);
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('provider-entry refusal blocks only key entry, not native configuration updates or key removal', async () => {
  const { directory, bootstrap } = await fixture();
  const runtime = await openNativeRuntime(bootstrap);
  let providerEntryCalls = 0;
  const search = new NativeWebSearch(runtime, bootstrap.workspaceId, async request => {
    if (request.type === 'provider-entry') {
      providerEntryCalls++;
      throw new ProjectionError(403, 'UNAUTHORIZED', 'Provider entry is disabled');
    }
  });
  try {
    await runtime.authStorage.credentials.set('tavily', { type: 'api_key', key: 'already-connected-key', source: 'login' });
    expect(await search.operation({ type: 'update', request: { expectedRevision: '0', enabled: false, timeoutSeconds: 43 } })).toMatchObject({ type: 'mutated', result: {
      persistence: 'persisted', status: 'applied', state: { revision: '1', enabled: false, timeoutSeconds: 43 },
    } });
    expect(providerEntryCalls).toBe(0);
    await expect(search.operation({ type: 'credential.write', request: { expectedRevision: '1', providerId: 'web/tavily', key: 'forbidden-new-key' } })).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    expect(providerEntryCalls).toBe(1);
    expect(await runtime.authStorage.keys.get('tavily')).toBe('already-connected-key');
    expect(await search.operation({ type: 'credential.delete', request: { expectedRevision: '1', providerId: 'web/tavily' } })).toMatchObject({ type: 'mutated', result: {
      persistence: 'persisted', status: 'applied', state: { revision: '2' },
    } });
    expect(providerEntryCalls).toBe(1);
    expect(runtime.authStorage.credentials.has('tavily')).toBe(false);
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});
