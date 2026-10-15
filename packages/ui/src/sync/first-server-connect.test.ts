import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CanonicalApiError, CanonicalClient, type SessionList } from '@/api/canonicalClient';
import type { ModelCatalog } from '@openchamber/agent-contract';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { ChildStoreManager } from './child-store';
import { notifyFirstCanonicalBootstrap, subscribeFirstServerConnect } from './first-server-connect';
import { SyncProvider, useChildStoreManager } from './sync-context';
import { installHookTestDom } from '../components/session/sidebar/test-utils/testDom';
import { deferred } from './session-message-loader-test-fixtures';
import { resetWorkspaceDirectories } from '@/stores/globalSessions';

const originalRuntime = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();
const cleanups: Array<() => void | Promise<void>> = [];
const nativeClient = (): CanonicalClient => Object.assign(new CanonicalClient(), {
  listProjects: async () => ({ items: [], errors: {} }),
  listWorkspaces: async () => ({ items: [], errors: {} }),
  resolveWorkspace: async () => ({ workspaceId: 'workspace-ready', projectId: 'project-ready', name: 'Workspace' }),
  listSessions: async () => ({ items: [], errors: {} }),
  getModels: async (workspaceId: string) => ({ workspaceId, revision: '0', models: [] }),
  getProviders: async (workspaceId: string) => ({ workspaceId, revision: '0', providers: [] }),
  getAgents: async (workspaceId: string) => ({ workspaceId, revision: '0', agents: [] }),
  getShellSnapshot: async () => ({ scope: { kind: 'workspace', workspaceId: 'workspace-ready' }, epoch: 'shell-epoch', revision: '0', running: [], ended: [], recovery: { priorEpochs: 'invalidated' } }),
});

beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://first-connect-a.test', runtimeKey: 'first-connect-a' });
});
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  mock.restore();
  resetWorkspaceDirectories();
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime });
});

async function mount(client: CanonicalClient) {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  let manager: ChildStoreManager | undefined;
  let retries = 0;
  const Probe = () => {
    const owner = useChildStoreManager();
    if (manager !== owner) {
      manager = owner;
      retries = 0;
      const retry = owner.retryFailedBootstraps.bind(owner);
      spyOn(owner, 'retryFailedBootstraps').mockImplementation(() => { retries += 1; return retry(); });
    }
    return null;
  };
  cleanups.push(async () => { await act(async () => root.unmount()); dom.restore(); });
  await act(async () => root.render(React.createElement(SyncProvider, { directory: '/repo', client, children: React.createElement(Probe) })));
  return { getManager: () => manager, getRetries: () => retries };
}

describe('first successful canonical bootstrap', () => {
  test('announces valid empty session authority once, before an independent environment read completes', async () => {
    const client = nativeClient();
    const sessions = deferred<SessionList>();
    const models = deferred<ModelCatalog>();
    client.listSessions = () => sessions.promise;
    client.getModels = () => models.promise;
    const notified: string[] = [];
    cleanups.push(subscribeFirstServerConnect((key) => notified.push(key)));
    const view = await mount(client);
    expect(notified).toEqual([]);
    await act(async () => { sessions.resolve({ items: [], errors: {} }); await Promise.resolve(); });
    expect(notified).toEqual(['first-connect-a']);
    expect(view.getRetries()).toBe(1);
    const owner = view.getManager();
    if (!owner) throw new Error('Native provider was not mounted');
    notifyFirstCanonicalBootstrap(owner, getRuntimeKey());
    expect(view.getRetries()).toBe(1);
    expect(notified).toEqual(['first-connect-a']);
    await act(async () => { models.resolve({ workspaceId: 'workspace-ready', revision: '0', models: [] }); });
  });

  test('announces the first admitted successful scope again after native provider runtime replacement', async () => {
    const notified: string[] = [];
    cleanups.push(subscribeFirstServerConnect((key) => notified.push(key)));
    const view = await mount(nativeClient());
    const firstOwner = view.getManager();
    expect(notified).toEqual(['first-connect-a']);
    await act(async () => switchRuntimeEndpoint({ apiBaseUrl: 'https://first-connect-b.test', runtimeKey: 'first-connect-b' }));
    expect(view.getManager()).not.toBe(firstOwner);
    expect(notified).toEqual(['first-connect-a', 'first-connect-b']);
    expect(view.getRetries()).toBe(1);
  });

  test('failed workspace admission never claims readiness and a later real bootstrap can recover', async () => {
    const client = nativeClient();
    const resolve = spyOn(client, 'resolveWorkspace').mockRejectedValue(new CanonicalApiError({
      type: 'urn:ohpichamber:problem:INVALID_REQUEST', title: 'Workspace unavailable', status: 400,
      detail: 'Workspace admission was rejected.', code: 'INVALID_REQUEST', retryable: false,
    }));
    const notified: string[] = [];
    cleanups.push(subscribeFirstServerConnect((key) => notified.push(key)));
    const view = await mount(client);
    expect(notified).toEqual([]);
    const owner = view.getManager();
    if (!owner) throw new Error('Native provider was not mounted');
    resolve.mockResolvedValue({ workspaceId: 'workspace-ready', projectId: 'project-ready', name: 'Workspace' });
    await act(async () => { owner.retryFailedBootstraps(); await Promise.resolve(); });
    expect(notified).toEqual(['first-connect-a']);
  });

  test('obsolete bootstrap responses and explicit obsolete owners cannot announce the active runtime', async () => {
    const client = nativeClient();
    const response = deferred<SessionList>();
    client.listSessions = () => response.promise;
    const notified: string[] = [];
    cleanups.push(subscribeFirstServerConnect((key) => notified.push(key)));
    const view = await mount(client);
    const owner = view.getManager();
    if (!owner) throw new Error('Native provider was not mounted');
    client.listSessions = async () => ({ items: [], errors: {} });
    await act(async () => switchRuntimeEndpoint({ apiBaseUrl: 'https://first-connect-b.test', runtimeKey: 'first-connect-b' }));
    await act(async () => { response.resolve({ items: [], errors: {} }); await Promise.resolve(); });
    notifyFirstCanonicalBootstrap(owner, 'first-connect-a');
    expect(notified).toEqual(['first-connect-b']);
  });

  test('unsubscribed consumers receive no readiness notifications', () => {
    const owner = new ChildStoreManager();
    cleanups.push(() => owner.disposeAll());
    let notifications = 0;
    const unsubscribe = subscribeFirstServerConnect(() => { notifications += 1; });
    unsubscribe();
    notifyFirstCanonicalBootstrap(owner, getRuntimeKey());
    expect(notifications).toBe(0);
  });
});
