<<<<<<< HEAD
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Model, ModelCatalog } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { invalidateSettingsCache } from '@/lib/persistence';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useConfigStore } from './useConfigStore';
import { useSmallModelStore, selectSmallModelAvailability } from './useSmallModelStore';
||||||| bc50ba56aa
import { beforeEach, describe, expect, mock, test } from 'bun:test';
=======
import { beforeEach, describe, expect, test } from 'bun:test';
import { directoryEnvironment } from './test-support/directoryEnvironment';
import { getRuntimeKey } from '@/lib/runtime-switch';

const environment = directoryEnvironment();
>>>>>>> upstream/main

const model: Model = { provider: 'a', modelId: 'haiku', name: 'Haiku', modalities: ['text'], contextWindow: 8000, maxOutputTokens: 2000, reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null };
let restorers: Array<() => void>;
let models: Model[];
let fail: boolean;
beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://availability.test', runtimeKey: `availability-${crypto.randomUUID()}` });
  invalidateSettingsCache();
  useConfigStore.setState({ currentProviderId: 'a', currentModelId: 'haiku' });
  useSmallModelStore.getState().invalidate();
  models = [model]; fail = false;
  const scope = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async directory => ({ workspaceId: directory, projectId: 'p', name: directory }));
  const catalog = spyOn(canonicalClient, 'getModels').mockImplementation(async (workspaceId): Promise<ModelCatalog> => {
    if (fail) throw new Error('offline');
    return { workspaceId, revision: '0', models, imageModels: [], defaults: { model: null, thinkingLevel: null }, planRoleAvailable: false };
  });
  const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({}));
  restorers = [() => scope.mockRestore(), () => catalog.mockRestore(), () => fetcher.mockRestore()];
});
afterEach(() => { for (const restore of restorers.reverse()) restore(); invalidateSettingsCache(); });

<<<<<<< HEAD
describe('canonical small model availability', () => {
  test('authority is scoped by directory and current provider/model', async () => {
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a')).toBe('unknown');
    await useSmallModelStore.getState().ensureFresh('/a');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a')).toBe('available');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/b')).toBe('unknown');
    useConfigStore.setState({ currentProviderId: 'other', currentModelId: 'absent' });
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a')).toBe('unknown');
    await useSmallModelStore.getState().ensureFresh('/a');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a')).toBe('unavailable');
  });
  test('concurrent readers share discovery and fresh readers do no extra work', async () => {
    await Promise.all([useSmallModelStore.getState().ensureFresh('/a'), useSmallModelStore.getState().ensureFresh('/a')]);
    await useSmallModelStore.getState().ensureFresh('/a');
    expect(canonicalClient.getModels).toHaveBeenCalledTimes(1);
  });
  test('failed authoritative discovery preserves a stale valid answer', async () => {
    await useSmallModelStore.getState().ensureFresh('/a');
    useSmallModelStore.setState(state => ({ byKey: Object.fromEntries(Object.entries(state.byKey).map(([key, value]) => [key, { ...value, fetchedAt: 0 }])) }));
    fail = true;
    await useSmallModelStore.getState().ensureFresh('/a');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a')).toBe('available');
  });
  test('invalidation rejects an old response and permits independent fresh discovery', async () => {
    const delayed = Promise.withResolvers<ModelCatalog>();
    const entered = Promise.withResolvers<void>();
    const catalog = spyOn(canonicalClient, 'getModels').mockImplementationOnce(async () => { entered.resolve(); return delayed.promise; });
    restorers.push(() => catalog.mockRestore());
    const first = useSmallModelStore.getState().ensureFresh('/a');
    await entered.promise;
||||||| bc50ba56aa
mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: async (url: string) => {
    calls.push(url);
    const next = responses.shift() ?? { status: 200, body: { available: true } };
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { 'Content-Type': 'application/json' } });
  },
}));
mock.module('@/lib/runtime-switch', () => ({
  getRuntimeKey: () => 'runtime-a',
  subscribeRuntimeEndpointChanged: () => () => {},
}));
mock.module('@/lib/configSync', () => ({
  subscribeToConfigChanges: () => () => {},
}));

const { useSmallModelStore, selectSmallModelAvailability } = await import('./useSmallModelStore');

describe('useSmallModelStore', () => {
  beforeEach(() => {
    responses = [];
    calls = [];
=======
environment.respond(async (url) => {
  if (url.pathname !== '/api/small-model') throw new Error(`Unexpected request: ${url}`);
  calls.push(`${url.pathname}${url.search}`);
  const next = responses.shift() ?? { status: 200, body: { available: true } };
  return Response.json(next.body, { status: next.status });
});

const { useSmallModelStore, selectSmallModelAvailability } = await import('./useSmallModelStore');

describe('useSmallModelStore', () => {
  beforeEach(() => {
    responses = [];
    calls = [];
>>>>>>> upstream/main
    useSmallModelStore.getState().invalidate();
    models = [];
    await useSmallModelStore.getState().ensureFresh('/a');
    delayed.resolve({ workspaceId: '/a', revision: '0', models: [model], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false });
    await first;
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a')).toBe('unavailable');
  });
<<<<<<< HEAD
  test('prepared workspace and target model have independent answers from composer defaults', async () => {
    const target = { workspaceId: 'workspace-target', preferred: { providerId: 'target', modelId: 'target-model' } };
    const anotherWorkspace = { workspaceId: 'workspace-other', preferred: { providerId: 'a', modelId: 'haiku' } };
    await useSmallModelStore.getState().ensureFresh('/a');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a', target)).toBe('unknown');
    await useSmallModelStore.getState().ensureFresh('/a', target);
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a', target)).toBe('unavailable');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a')).toBe('available');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a', anotherWorkspace)).toBe('unknown');
    await useSmallModelStore.getState().ensureFresh('/a', anotherWorkspace);
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/a', anotherWorkspace)).toBe('available');
    expect(canonicalClient.getModels).toHaveBeenCalledWith('workspace-target');
    expect(canonicalClient.getModels).toHaveBeenCalledWith('workspace-other');
||||||| bc50ba56aa

  test('is unknown until fetched, then reports the server answer per directory', async () => {
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('unknown');
    responses = [{ status: 200, body: { available: false } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('unavailable');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/q')).toBe('unknown');
    expect(calls).toEqual(['/api/small-model?directory=%2Fp']);
  });

  test('a fresh answer is not fetched again, and concurrent callers share one request', async () => {
    responses = [{ status: 200, body: { available: true } }];
    await Promise.all([
      useSmallModelStore.getState().ensureFresh('/p'),
      useSmallModelStore.getState().ensureFresh('/p'),
    ]);
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(calls).toHaveLength(1);
  });

  test('a failed or malformed answer keeps what was known', async () => {
    responses = [{ status: 200, body: { available: true } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    useSmallModelStore.setState((state) => ({
      byKey: { ...state.byKey, 'runtime-a::/p': { availability: 'available', fetchedAt: 0 } },
    }));
    responses = [{ status: 500, body: { error: 'down' } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('available');
    responses = [{ status: 200, body: { available: 'yes' } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('available');
  });

  test('invalidate forgets every answer so the next reader fetches again', async () => {
    responses = [{ status: 200, body: { available: false } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    useSmallModelStore.getState().invalidate();
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('unknown');
    responses = [{ status: 200, body: { available: true } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('available');
    expect(calls).toHaveLength(2);
=======

  test('is unknown until fetched, then reports the server answer per directory', async () => {
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('unknown');
    responses = [{ status: 200, body: { available: false } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('unavailable');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/q')).toBe('unknown');
    expect(calls).toEqual(['/api/small-model?directory=%2Fp']);
  });

  test('a fresh answer is not fetched again, and concurrent callers share one request', async () => {
    responses = [{ status: 200, body: { available: true } }];
    await Promise.all([
      useSmallModelStore.getState().ensureFresh('/p'),
      useSmallModelStore.getState().ensureFresh('/p'),
    ]);
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(calls).toHaveLength(1);
  });

  test('a failed or malformed answer keeps what was known', async () => {
    responses = [{ status: 200, body: { available: true } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    useSmallModelStore.setState((state) => ({
      byKey: { ...state.byKey, [`${getRuntimeKey()}::/p`]: { availability: 'available', fetchedAt: 0 } },
    }));
    responses = [{ status: 500, body: { error: 'down' } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('available');
    responses = [{ status: 200, body: { available: 'yes' } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('available');
  });

  test('invalidate forgets every answer so the next reader fetches again', async () => {
    responses = [{ status: 200, body: { available: false } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    useSmallModelStore.getState().invalidate();
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('unknown');
    responses = [{ status: 200, body: { available: true } }];
    await useSmallModelStore.getState().ensureFresh('/p');
    expect(selectSmallModelAvailability(useSmallModelStore.getState(), '/p')).toBe('available');
    expect(calls).toHaveLength(2);
>>>>>>> upstream/main
  });
});
