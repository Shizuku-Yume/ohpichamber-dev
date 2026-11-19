import { afterEach, describe, expect, mock, test } from 'bun:test';
import type { ModelCatalog, ProviderCatalog } from '@openchamber/agent-contract';
import { subscribeToConfigChanges, type ConfigChangeEvent } from '@/lib/configSync';
import { createProviderSettingsStore } from './useProviderSettingsStore';

const workspace = { workspaceId: 'workspace_test', projectId: 'project_test', name: 'Workspace' };
const subscriptions: Array<() => void> = [];
afterEach(() => { while (subscriptions.length) subscriptions.pop()?.(); });

const fixture = () => {
  let runtime = 'local';
  const providers: ProviderCatalog = { workspaceId: workspace.workspaceId, revision: '1', providers: [] };
  const models: ModelCatalog = {
    workspaceId: workspace.workspaceId, revision: '1', models: [], imageModels: [],
    defaults: { model: null, thinkingLevel: null }, planRoleAvailable: false,
  };
  const client = {
    resolveWorkspace: mock(async () => workspace),
    getProviders: mock(async () => providers),
    getModels: mock(async () => models),
  };
  const events: ConfigChangeEvent[] = [];
  subscriptions.push(subscribeToConfigChanges((event) => { events.push(event); }));
  return { client, providers, models, events, store: createProviderSettingsStore(client, () => runtime), switchRuntime: () => { runtime = 'remote'; } };
};

describe('provider settings catalog refresh', () => {
  test('ordinary page loads do not invalidate other catalog consumers', async () => {
    const { store, events } = fixture();
    await store.getState().load('/workspace');
    expect(events).toEqual([]);
  });

  test('post-save refresh notifies composer catalog consumers and loads the saved model', async () => {
    const { store, client, events } = fixture();
    await store.getState().load('/workspace');
    client.getProviders.mockResolvedValue({ workspaceId: workspace.workspaceId, revision: '2', providers: [{
      providerId: 'custom', name: 'Custom', endpoint: null, protocol: null, authMethods: [], auth: { status: 'missing' },
    }] });
    client.getModels.mockResolvedValue({
      ...store.getState().models!, revision: '2', models: [{
        provider: 'custom', modelId: 'chat', name: 'Chat', modalities: ['text'], contextWindow: 1000,
        maxOutputTokens: 100, reasoningEffortSupported: false, reasoningOptions: [], variants: [],
        toolsSupported: true, enabled: true, status: 'active', pricing: null,
      }],
    });
    await store.getState().refresh();
    expect(events).toHaveLength(1);
    expect(events[0]?.scopes).toEqual(['providers']);
    expect(store.getState().models?.models.map((model) => model.modelId)).toEqual(['chat']);
    expect(client.getModels).toHaveBeenCalledTimes(2);
  });

  test('an authoritative empty refresh still invalidates the picker catalog', async () => {
    const { store, events } = fixture();
    await store.getState().load('/workspace');
    await store.getState().refresh();
    expect(events.map((event) => event.scopes)).toEqual([['providers']]);
    expect(store.getState().models?.models).toEqual([]);
    expect(store.getState().error).toBeNull();
  });

  test('a failed settings reread cannot suppress notification of an already saved provider', async () => {
    const { store, client, events } = fixture();
    await store.getState().load('/workspace');
    const previous = store.getState().models;
    const failure = new Error('Catalog unavailable');
    client.getModels.mockRejectedValue(failure);
    await store.getState().refresh();
    expect(events.map((event) => event.scopes)).toEqual([['providers']]);
    expect(store.getState().models).toBe(previous);
    expect(store.getState().error).toBe(failure);
  });

  test('unloaded, reset and stale-runtime stores do not notify the replacement runtime', async () => {
    const { store, events, switchRuntime } = fixture();
    await store.getState().refresh();
    await store.getState().load('/workspace');
    switchRuntime();
    await store.getState().refresh();
    store.getState().reset();
    await store.getState().refresh();
    expect(events).toEqual([]);
  });
});
