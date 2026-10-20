import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CanonicalClient } from '@/api/canonicalClient';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useConfigStore } from '@/stores/useConfigStore';
import { ChildStoreManager } from './child-store';
import { SyncProvider, useChildStoreManager } from './sync-context';
import { installHookTestDom } from '../components/session/sidebar/test-utils/testDom';

const originalRuntime = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();
const originalConnected = useConfigStore.getState().isConnected;
const cleanups: Array<() => void | Promise<void>> = [];
let sequence = 0;

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
  sequence += 1;
  switchRuntimeEndpoint({ apiBaseUrl: `https://connection-resume-${sequence}.test`, runtimeKey: `connection-resume-${sequence}` });
  useConfigStore.setState({ isConnected: originalConnected });
});

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  mock.restore();
  resetWorkspaceDirectories();
  useConfigStore.setState({ isConnected: originalConnected });
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime });
});

type ResumeCounts = { retries: number; restarts: number };

const countsOf = new Map<ChildStoreManager, ResumeCounts>();

function observe(manager: ChildStoreManager, counts: ResumeCounts) {
  const retry = manager.retryFailedBootstraps.bind(manager);
  spyOn(manager, 'retryFailedBootstraps').mockImplementation(() => { counts.retries += 1; return retry(); });
  const restart = manager.refreshAfterStreamRestart.bind(manager);
  spyOn(manager, 'refreshAfterStreamRestart').mockImplementation((directory) => { counts.restarts += 1; return restart(directory); });
}

async function mount() {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  let manager: ChildStoreManager | undefined;
  let unmounted = false;
  const Probe = () => {
    const owner = useChildStoreManager();
    if (!countsOf.has(owner)) {
      const counts = { retries: 0, restarts: 0 };
      countsOf.set(owner, counts);
      observe(owner, counts);
    }
    manager = owner;
    return null;
  };
  const unmount = async () => {
    if (unmounted) return;
    unmounted = true;
    await act(async () => root.unmount());
    dom.restore();
  };
  cleanups.push(unmount);
  await act(async () => root.render(React.createElement(SyncProvider, { directory: '/repo', client: nativeClient(), children: React.createElement(Probe) })));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return {
    unmount,
    getManager: () => manager,
    counts: (owner: ChildStoreManager | undefined = manager): ResumeCounts => owner ? { ...countsOf.get(owner)! } : { retries: 0, restarts: 0 },
  };
}

async function setConnected(isConnected: boolean) {
  await act(async () => { useConfigStore.setState({ isConnected }); await Promise.resolve(); });
}

describe('connection-triggered recovery resume', () => {
  test('a false-to-true connection transition resumes failed-bootstrap retry and stream restart once', async () => {
    const view = await mount();
    await setConnected(false);
    const before = view.counts();

    await setConnected(true);
    expect(view.counts()).toEqual({ retries: before.retries + 1, restarts: before.restarts + 1 });

    // Reasserting an already-true connection is not a resume signal.
    await setConnected(true);
    expect(view.counts()).toEqual({ retries: before.retries + 1, restarts: before.restarts + 1 });
  });

  test('a true-to-false transition does not resume recovery', async () => {
    const view = await mount();
    await setConnected(true);
    const before = view.counts();

    await setConnected(false);
    expect(view.counts()).toEqual(before);
  });

  test('unmount removes the connection subscription and no later transition resumes the old owner', async () => {
    const view = await mount();
    expect(view.getManager()).toBeDefined();
    await view.unmount();
    const owner = view.getManager();
    const before = view.counts();

    await setConnected(false);
    await setConnected(true);
    expect(view.counts(owner)).toEqual(before);
  });

  test('runtime replacement resumes only the new owner', async () => {
    const view = await mount();
    const previous = view.getManager();
    if (!previous) throw new Error('Native provider was not mounted');
    const previousCounts = view.counts(previous);

    await act(async () => switchRuntimeEndpoint({ apiBaseUrl: `https://connection-resume-${sequence}-next.test`, runtimeKey: `connection-resume-${sequence}-next` }));
    const next = view.getManager();
    expect(next).not.toBe(previous);
    if (!next) throw new Error('Replacement native provider was not mounted');
    const nextBefore = view.counts(next);

    await setConnected(false);
    await setConnected(true);
    expect(view.counts(next)).toEqual({ retries: nextBefore.retries + 1, restarts: nextBefore.restarts + 1 });
    expect(view.counts(previous)).toEqual(previousCounts);
  });
});
