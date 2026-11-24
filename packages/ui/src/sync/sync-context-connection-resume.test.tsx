import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CanonicalClient } from '@/api/canonicalClient';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useConfigStore } from '@/stores/useConfigStore';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import type { SessionSnapshot, Subagent } from '@openchamber/agent-contract';
import { useSubagentsStore } from '@/stores/useSubagentsStore';
import { useSessionUIStore } from './session-ui-store';
import { ChildStoreManager } from './child-store';
import type { SessionMessageLoader } from './session-message-loader';
import { SyncProvider, useChildStoreManager, useSessionMessageLoader } from './sync-context';
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
  getModels: async (workspaceId: string) => ({ workspaceId, revision: '0', models: [], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false }),
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

async function mount(client: CanonicalClient = nativeClient()) {
  const dom = installHookTestDom();
  const root = createRoot(dom.container);
  let manager: ChildStoreManager | undefined;
  let loader: SessionMessageLoader | undefined;
  let unmounted = false;
  const Probe = () => {
    const owner = useChildStoreManager();
    loader = useSessionMessageLoader();
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
  await act(async () => root.render(React.createElement(SyncProvider, { directory: '/repo', client, children: React.createElement(Probe) })));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return {
    unmount,
    getManager: () => manager,
    getLoader: () => loader,
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

describe('snapshot recovery subagent re-hydration', () => {
  test('SSE 410 Gone snapshot recovery force-rehydrates already-hydrated subagents and leaves non-subagent sessions untouched', async () => {
    useSubagentsStore.getState().resetForRuntimeSwitch();
    const baseSnapshot = (cursor: string, headSequence: string): SessionSnapshot => ({
      session: {
        sessionId: 'session-recover', projectId: 'project-ready', workspaceId: 'workspace-ready', displayPath: '.',
        rootSessionId: 'session-recover', createdAt: 1, updatedAt: 2, epoch: 'epoch-1', headSequence,
        runtimeStatus: 'running', activeRunId: 'run-1', mode: { kind: 'main' },
      },
      cursor, activeRun: { runId: 'run-1', sessionId: 'session-recover', status: 'running', origin: 'host', createdAt: 1 },
      branch: { branchId: 'branch-1', branchVersion: '0', leafMessageId: null },
      window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
      turns: [], messages: [], approvals: [], questions: [],
      requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
    });

    let snapshotCalls = 0;
    let emitStreamError: ((error: unknown) => void) | undefined;
    const client = Object.assign(nativeClient(), {
      getSnapshot: async (sessionId: string) => {
        if (sessionId === 'session-no-subagents') {
          return { ...baseSnapshot('other:1', '1'), session: { ...baseSnapshot('other:1', '1').session, sessionId: 'session-no-subagents', rootSessionId: 'session-no-subagents' } };
        }
        snapshotCalls += 1;
        return snapshotCalls === 1 ? baseSnapshot('epoch-1:0', '0') : baseSnapshot('epoch-1:2', '2');
      },
      getHistory: async (sessionId: string) => ({ sessionId, items: [], hasEarlier: false, hasLater: false, firstTurnId: null, lastTurnId: null }),
      getQueue: async (sessionId: string) => ({ sessionId, revision: '0', items: [] }),
      getSessionMetadata: async (sessionId: string) => ({ sessionId, revision: '0', metadata: {} }),
      subscribeSessionEvents: (_sessionId: string, _cursor: string, _onEvent: unknown, _onInvalidated: unknown, onError?: (error: unknown) => void) => {
        emitStreamError = onError;
        return () => { };
      },
    });

    let listCalls = 0;
    const spawnedDuringGap: Subagent = {
      subagentId: 'GammaBlocker',
      parentSessionId: 'session-recover',
      childSessionId: 'child-gamma',
      toolCallId: 'call-gamma',
      name: 'GammaBlocker',
      role: 'task',
      status: 'running',
    };
    const listSpy = spyOn(client, 'listSubagents');
    const rehydrated = Promise.withResolvers<void>();
    const canonicalListSpy = spyOn(canonicalClient, 'listSubagents').mockImplementation(async () => {
      listCalls += 1;
      if (listCalls >= 2) rehydrated.resolve();
      return listCalls === 1 ? [] : [spawnedDuringGap];
    });

    const prevSession = useSessionUIStore.getState();
    useSessionUIStore.setState({ currentSessionId: 'session-recover', currentSessionDirectory: '/repo' });
    try {
      const view = await mount(client);
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      await act(async () => {
        await useSubagentsStore.getState().hydrateParent('session-recover');
      });
      expect(listCalls).toBe(1);
      expect(useSubagentsStore.getState().byParent['session-recover']).toEqual([]);
      expect(useSubagentsStore.getState().hydratedByParent['session-recover']).toBe(getRuntimeKey());

      await act(async () => {
        await view.getLoader()?.ensure({ directory: '/repo', sessionId: 'session-recover' });
      });
      expect(emitStreamError).toBeDefined();

      await act(async () => {
        emitStreamError?.(new CanonicalApiError({
          type: 'urn:test:gone', title: 'Gone', status: 410, detail: 'Cursor expired', code: 'RESYNC_REQUIRED', retryable: true,
        }));
        await rehydrated.promise;
        await Promise.resolve();
      });

      expect(snapshotCalls).toBeGreaterThanOrEqual(2);
      expect(listCalls).toBe(2);
      expect(useSubagentsStore.getState().byParent['session-recover']).toEqual([spawnedDuringGap]);
      expect(listSpy).not.toHaveBeenCalled();

      // Recovering a session with no subagent state does not trigger extra listSubagents fetches.
      const priorCalls = listCalls;
      await act(async () => {
        await view.getLoader()?.refresh({ directory: '/repo', sessionId: 'session-no-subagents' }, undefined, { recovered: true });
      });
      expect(listCalls).toBe(priorCalls);
    } finally {
      canonicalListSpy.mockRestore();
      useSubagentsStore.getState().resetForRuntimeSwitch();
      useSessionUIStore.setState(prevSession);
    }
  });
});
