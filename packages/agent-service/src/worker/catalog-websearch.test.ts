import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modelKind } from '@oh-my-pi/pi-catalog/types';
import { getRoleInfo } from '@oh-my-pi/pi-coding-agent/config/model-roles';
import { cfgDisabledProviders } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { formatModelStringWithRouting as selector } from '@oh-my-pi/pi-coding-agent/config/model-resolver';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { cfgRetryFallbackChains } from '@oh-my-pi/pi-coding-agent/session/settings';
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
      worker.operation({ type: 'web-search', operation: { type: 'update', request: { expectedRevision: '0', enabled: false, timeoutSeconds: 37, selectedProviderId: 'web/google', fallbackProviderIds: ['web/duckduckgo'], providerOptions: { exa: { enabled: false } } } } }),
      worker.operation({ type: 'web-search', operation: { type: 'update', request: { expectedRevision: '0', timeoutSeconds: 38 } } }),
    ]);
    expect(competing.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(competing.find(result => result.status === 'rejected')).toMatchObject({ reason: { status: 409, code: 'CATALOG_CONFLICT' } });
    expect(competing.find(result => result.status === 'fulfilled')).toMatchObject({ value: { type: 'web-search', result: { type: 'mutated', result: {
      persistence: 'persisted', status: 'applied', state: { revision: '1', enabled: false, timeoutSeconds: 37, selectedProviderId: 'web/google', fallbackProviderIds: ['web/duckduckgo'] },
    } } } });
    const appliedRead = await worker.operation({ type: 'web-search', operation: { type: 'read' } });
    if (appliedRead.type !== 'web-search' || appliedRead.result.type !== 'state') throw new Error('Expected native search state');
    expect(appliedRead.result.state.providers.find(provider => provider.providerId === 'web/exa')?.options).toEqual({ exa: { enabled: false } });
    await worker.close();
    resetSettingsForTest();
    worker = await StatelessWorker.open({ ...bootstrap, workerGeneration: 'cold-search-generation' }, async () => {});
    const reopenedRead = await worker.operation({ type: 'web-search', operation: { type: 'read' } });
    if (reopenedRead.type !== 'web-search' || reopenedRead.result.type !== 'state') throw new Error('Expected reopened native search state');
    expect(reopenedRead.result.state.providers.find(provider => provider.providerId === 'web/exa')?.options).toEqual({ exa: { enabled: false } });
    await expect(worker.operation({ type: 'web-search', operation: { type: 'update', request: { expectedRevision: '0', enabled: true } } })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
  } finally { await worker.close(); await rm(directory, { recursive: true, force: true }); }
});

test('provider catalog equals the native search-model pool and excludes chat grounding selectors', async () => {
  const { directory, bootstrap } = await fixture();
  const runtime = await openNativeRuntime(bootstrap);
  try {
    const state = await new NativeWebSearch(runtime, bootstrap.workspaceId, async () => {}).operation({ type: 'read' });
    if (state.type !== 'state') throw new Error('Expected native search state');
    const providerIds = state.state.providers.map(provider => provider.providerId);
    expect(providerIds).toEqual([
      'web/brave', 'web/deepseek', 'web/duckduckgo', 'web/ecosia', 'web/exa', 'web/firecrawl', 'web/google', 'web/hackernews', 'web/hosted',
      'web/jina', 'web/kagi', 'web/keenable', 'web/kimi', 'web/mojeek', 'web/ollama', 'web/parallel', 'web/perplexity',
      'web/public', 'web/searxng', 'web/sofya', 'web/startpage', 'web/synthetic', 'web/tavily', 'web/tinyfish', 'web/zai',
    ]);
    expect(providerIds.every(id => id.startsWith('web/'))).toBe(true);

    // The web role still accepts grounded chat transports; they are execution
    // paths, not search-provider catalog entries.
    const webRoleModels = runtime.modelRegistry.getAll('all').filter(getRoleInfo('web', runtime.settings).accepts);
    const chatSelectors = webRoleModels.filter(model => modelKind(model) !== 'search').map(model => selector(model));
    expect(chatSelectors.some(id => id.startsWith('anthropic/'))).toBe(true);
    expect(chatSelectors.some(id => id.startsWith('openai/'))).toBe(true);
    expect(providerIds.filter(id => chatSelectors.includes(id))).toEqual([]);

    const providerSet = new Set(providerIds);
    if (state.state.selectedProviderId !== null) expect(providerSet.has(state.state.selectedProviderId)).toBe(true);
    expect(state.state.fallbackProviderIds.every(id => providerSet.has(id))).toBe(true);
    expect(WebSearchConfigStateSchema.parse(state.state)).toEqual(state.state);
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('legacy chat web-role selections survive non-selection updates and unknown replacements fail', async () => {
  const { directory, bootstrap } = await fixture();
  const runtime = await openNativeRuntime(bootstrap);
  const primary = 'anthropic/claude-sonnet-4-5';
  const fallback = 'anthropic/claude-haiku-4-5';
  const freshChat = 'anthropic/claude-opus-4-5';
  try {
    await runtime.authStorage.credentials.set('anthropic', { type: 'api_key', key: 'fixture-credential', source: 'login' });
    runtime.settings.setModelRole('web', primary);
    cfgRetryFallbackChains.setEntry(runtime.settings, 'web', [fallback]);
    await runtime.settings.flush();
    const search = new NativeWebSearch(runtime, bootstrap.workspaceId, async () => {});

    const initial = await search.operation({ type: 'read' });
    if (initial.type !== 'state') throw new Error('Expected native search state');
    expect(initial.state.selectedProviderId).toBe(primary);
    expect(initial.state.fallbackProviderIds).toEqual([fallback]);
    expect(initial.state.providers.map(provider => provider.providerId)).not.toContain(primary);
    expect(initial.state.providers.map(provider => provider.providerId)).not.toContain(fallback);

    const preserved = await search.operation({ type: 'update', request: { expectedRevision: '0', enabled: false, timeoutSeconds: 33 } });
    if (preserved.type !== 'mutated') throw new Error('Expected applied mutation');
    expect(preserved.result).toMatchObject({ persistence: 'persisted', status: 'applied', state: {
      revision: '1', enabled: false, timeoutSeconds: 33, selectedProviderId: primary, fallbackProviderIds: [fallback],
    } });

    const resubmitted = await search.operation({ type: 'update', request: { expectedRevision: '1', selectedProviderId: primary, fallbackProviderIds: [fallback] } });
    expect(resubmitted).toMatchObject({ type: 'mutated', result: { persistence: 'persisted', state: {
      revision: '2', selectedProviderId: primary, fallbackProviderIds: [fallback],
    } } });

    const switched = await search.operation({ type: 'update', request: { expectedRevision: '2', selectedProviderId: freshChat, fallbackProviderIds: [] } });
    expect(switched).toMatchObject({ type: 'mutated', result: { state: { revision: '3', selectedProviderId: freshChat, fallbackProviderIds: [] } } });
    const restoredFallback = await search.operation({ type: 'update', request: { expectedRevision: '3', fallbackProviderIds: [fallback] } });
    expect(restoredFallback).toMatchObject({ type: 'mutated', result: { state: {
      revision: '4', selectedProviderId: freshChat, fallbackProviderIds: [fallback],
    } } });
    await expect(search.operation({ type: 'update', request: { expectedRevision: '4', selectedProviderId: 'vendor/unknown-model', fallbackProviderIds: [fallback] } }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    await expect(search.operation({ type: 'update', request: { expectedRevision: '4', fallbackProviderIds: ['vendor/unknown-model'] } }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    await expect(search.operation({ type: 'update', request: { expectedRevision: '0', timeoutSeconds: 40 } }))
      .rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });

    // An empty native search catalog must not erase the persisted chat chain.
    cfgDisabledProviders.set(runtime.settings, ['web']);
    await runtime.settings.flush();
    await runtime.modelRegistry.refresh('offline');
    const disabled = await search.operation({ type: 'read' });
    if (disabled.type !== 'state') throw new Error('Expected disabled native search state');
    expect(disabled.state.providers).toEqual([]);
    expect(disabled.state.selectedProviderId).toBe(freshChat);
    expect(disabled.state.fallbackProviderIds).toEqual([fallback]);
    const disabledUpdate = await search.operation({ type: 'update', request: { expectedRevision: '4', timeoutSeconds: 34 } });
    expect(disabledUpdate).toMatchObject({ type: 'mutated', result: { persistence: 'persisted', state: {
      revision: '5', timeoutSeconds: 34, selectedProviderId: freshChat, fallbackProviderIds: [fallback], providers: [],
    } } });
    await expect(search.operation({ type: 'update', request: { expectedRevision: '5', selectedProviderId: 'vendor/unknown-model', fallbackProviderIds: [fallback] } }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('a fallback reorder with no selected primary reads back in the order the user set', async () => {
  // The page writes `retry.fallbackChains.web` and the next read used to
  // re-derive the list through `resolveRoleChain`, which starts at the implicit
  // `@web` primary and therefore promoted `web/parallel` back to the first row.
  // A user who never picked a primary saw a reorder snap back.
  const { directory, bootstrap } = await fixture();
  const runtime = await openNativeRuntime(bootstrap);
  try {
    const search = new NativeWebSearch(runtime, bootstrap.workspaceId, async () => {});
    const initial = await search.operation({ type: 'read' });
    if (initial.type !== 'state') throw new Error('Expected native search state');
    expect(initial.state.selectedProviderId).toBeNull();
    expect(initial.state.fallbackProviderIds.slice(0, 2)).toEqual(['web/parallel', 'web/hosted']);

    const reordered = ['web/hosted', 'web/parallel', 'web/exa'];
    const applied = await search.operation({ type: 'update', request: { expectedRevision: '0', fallbackProviderIds: reordered } });
    expect(applied).toMatchObject({ type: 'mutated', result: { persistence: 'persisted', status: 'applied', state: {
      selectedProviderId: null, fallbackProviderIds: reordered,
    } } });

    // The same state survives a cold read, so a reload keeps the user's order.
    const read = await search.operation({ type: 'read' });
    if (read.type !== 'state') throw new Error('Expected native search state');
    expect(read.state.selectedProviderId).toBeNull();
    expect(read.state.fallbackProviderIds).toEqual(reordered);
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('editing the projected fallback order retains unresolved and effort-bearing native selectors', async () => {
  const { directory, bootstrap } = await fixture();
  const runtime = await openNativeRuntime(bootstrap);
  try {
    const native = ['web/exa:high', 'vendor/unavailable-model', 'web/tavily', 'web/exa:low'];
    cfgRetryFallbackChains.setEntry(runtime.settings, 'web', native);
    await runtime.settings.flush();
    const search = new NativeWebSearch(runtime, bootstrap.workspaceId, async () => {});
    expect(await search.operation({ type: 'read' })).toMatchObject({ state: { fallbackProviderIds: ['web/exa', 'web/tavily'] } });
    await search.operation({ type: 'update', request: { expectedRevision: '0', fallbackProviderIds: ['web/exa', 'web/tavily'] } });
    expect(cfgRetryFallbackChains.get(runtime.settings).web).toEqual(native);
    const edited = ['web/tavily', 'web/exa', 'web/google'];
    expect(await search.operation({ type: 'update', request: { expectedRevision: '1', fallbackProviderIds: edited } }))
      .toMatchObject({ result: { status: 'applied', state: { fallbackProviderIds: edited } } });
    expect(cfgRetryFallbackChains.get(runtime.settings).web)
      .toEqual(['web/tavily', 'vendor/unavailable-model', 'web/exa:high', 'web/exa:low', 'web/google']);
    await search.operation({ type: 'update', request: { expectedRevision: '2', fallbackProviderIds: ['web/google'] } });
    expect(cfgRetryFallbackChains.get(runtime.settings).web).toEqual(['web/google', 'vendor/unavailable-model']);
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('an empty native web-role pool reports no selection and rejects new selectors', async () => {
  const { directory, bootstrap } = await fixture();
  const runtime = await openNativeRuntime(bootstrap);
  try {
    cfgDisabledProviders.set(runtime.settings, ['web']);
    await runtime.settings.flush();
    await runtime.modelRegistry.refresh('offline');
    const search = new NativeWebSearch(runtime, bootstrap.workspaceId, async () => {});
    const initial = await search.operation({ type: 'read' });
    if (initial.type !== 'state') throw new Error('Expected native search state');
    expect(initial.state.providers).toEqual([]);
    expect(initial.state.selectedProviderId).toBeNull();
    expect(initial.state.fallbackProviderIds).toEqual([]);

    const updated = await search.operation({ type: 'update', request: { expectedRevision: '0', timeoutSeconds: 30 } });
    expect(updated).toMatchObject({ type: 'mutated', result: { persistence: 'persisted', state: {
      revision: '1', timeoutSeconds: 30, selectedProviderId: null, fallbackProviderIds: [], providers: [],
    } } });
    await expect(search.operation({ type: 'update', request: { expectedRevision: '1', selectedProviderId: 'web/tavily', fallbackProviderIds: [] } }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    await expect(search.operation({ type: 'update', request: { expectedRevision: '1', fallbackProviderIds: ['vendor/unknown-model'] } }))
      .rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('reset restores the native web fallbacks without changing other chains', async () => {
  const { directory, bootstrap } = await fixture();
  const runtime = await openNativeRuntime(bootstrap);
  try {
    cfgRetryFallbackChains.setEntry(runtime.settings, 'default', ['openai/o3-mini:high']);
    await runtime.settings.flush();
    const search = new NativeWebSearch(runtime, bootstrap.workspaceId, async () => {});
    const before = await search.operation({ type: 'read' });
    if (before.type !== 'state') throw new Error('Expected native search state');
    expect(before.state.fallbackProviderIds.length).toBeGreaterThan(0);
    expect(await search.operation({ type: 'update', request: { expectedRevision: '0', fallbackProviderIds: [] } }))
      .toMatchObject({ result: { state: { fallbackProviderIds: [] } } });
    expect(cfgRetryFallbackChains.get(runtime.settings).web).toEqual([]);
    expect(await search.operation({ type: 'update', request: { expectedRevision: '1', fallbackProviderIds: null } }))
      .toMatchObject({ result: { status: 'applied', state: { fallbackProviderIds: before.state.fallbackProviderIds } } });
    expect(cfgRetryFallbackChains.get(runtime.settings)).toEqual({ default: ['openai/o3-mini:high'] });
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});

test('project settings remain authoritative when native search updates would override them', async () => {
  const { directory, bootstrap } = await fixture();
  await mkdir(join(bootstrap.cwd, '.omp'), { recursive: true });
  await writeFile(join(bootstrap.cwd, '.omp', 'config.yml'), 'exa:\n  enabled: true\nretry:\n  fallbackChains:\n    web: [web/exa]\n');
  const worker = await StatelessWorker.open(bootstrap, async () => {});
  try {
    const read = await worker.operation({ type: 'web-search', operation: { type: 'read' } });
    if (read.type !== 'web-search' || read.result.type !== 'state') throw new Error('Expected native search state');
    expect(read.result.state.providers.find(provider => provider.providerId === 'web/exa')?.options).toEqual({ exa: { enabled: true } });
    await expect(worker.operation({ type: 'web-search', operation: { type: 'update', request: { expectedRevision: '0', providerOptions: { exa: { enabled: false } } } } }))
      .rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
    await expect(worker.operation({ type: 'web-search', operation: { type: 'update', request: { expectedRevision: '0', fallbackProviderIds: null } } }))
      .rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
    expect(await readFile(join(bootstrap.agentDirectory, 'openchamber-web-search-revision'), 'utf8').catch(() => null)).toBeNull();
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
      const written = await worker.operation({ type: 'web-search', operation: { type: 'credential.write', request: { expectedRevision: '0', providerId, apiKey: secret } } });
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
    const result = await search.operation({ type: 'credential.write', request: { expectedRevision: '0', providerId: 'web/tavily', apiKey: 'must-not-persist' } });
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
    await expect(search.operation({ type: 'credential.write', request: { expectedRevision: '0', providerId: 'web/tavily', apiKey: 'closed-store-secret' } })).rejects.toThrow();
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
    await expect(search.operation({ type: 'credential.write', request: { expectedRevision: '1', providerId: 'web/tavily', apiKey: 'forbidden-new-key' } })).rejects.toMatchObject({ status: 403, code: 'UNAUTHORIZED' });
    expect(providerEntryCalls).toBe(1);
    expect(await runtime.authStorage.keys.get('tavily')).toBe('already-connected-key');
    expect(await search.operation({ type: 'credential.delete', request: { expectedRevision: '1', providerId: 'web/tavily' } })).toMatchObject({ type: 'mutated', result: {
      persistence: 'persisted', status: 'applied', state: { revision: '2' },
    } });
    expect(providerEntryCalls).toBe(1);
    expect(runtime.authStorage.credentials.has('tavily')).toBe(false);
  } finally { runtime.authStorage.close(); await rm(directory, { recursive: true, force: true }); }
});
