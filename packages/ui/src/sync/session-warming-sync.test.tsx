import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';

import { useConfigStore } from '@/stores/useConfigStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionWarmingStore, type SessionWarmingStoreState } from '@/stores/useSessionWarmingStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { isHydratableRootSession, useSessionWarmingSync } from './session-warming-sync';

const makeSession = (overrides: Partial<Session> & Pick<Session, 'sessionId'>): Session => ({
  projectId: 'proj-1',
  workspaceId: 'ws-1',
  displayPath: 'repo',
  rootSessionId: overrides.sessionId,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  epoch: '0',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
  ...overrides,
});

const SyncHarness: React.FC = () => {
  useSessionWarmingSync();
  return null;
};

describe('useSessionWarmingSync', () => {
  let root: Root;
  const globals = new Map<string, PropertyDescriptor | undefined>();
  let loadCalls: Array<{ sessionId: string; options: { force?: boolean } | undefined }> = [];
  let removedBatches: string[][] = [];
  let originalLoadSessionWarming: SessionWarmingStoreState['loadSessionWarming'];
  let originalRemoveSessions: SessionWarmingStoreState['removeSessions'];
  let originalIsConnected: boolean;
  let originalCurrentSessionId: string | null;
  let restoreGlobalState: (() => void) | null = null;

  const renderHarness = async (): Promise<void> => {
    await act(async () => {
      root.render(<SyncHarness />);
    });
  };

  beforeEach(() => {
    loadCalls = [];
    removedBatches = [];

    const window = new Window({ url: 'http://localhost/' });
    for (const [key, value] of Object.entries({
      window,
      document: window.document,
      navigator: window.navigator,
      IS_REACT_ACT_ENVIRONMENT: true,
    })) {
      globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, { configurable: true, value });
    }
    const container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);

    const warmingState = useSessionWarmingStore.getState();
    originalLoadSessionWarming = warmingState.loadSessionWarming;
    originalRemoveSessions = warmingState.removeSessions;
    useSessionWarmingStore.setState({
      loadSessionWarming: async (sessionId, options) => {
        loadCalls.push({ sessionId, options });
        return null;
      },
      removeSessions: (sessionIds) => {
        removedBatches.push(Array.from(sessionIds));
      },
    });

    originalIsConnected = useConfigStore.getState().isConnected;
    useConfigStore.setState({ isConnected: false });

    originalCurrentSessionId = useSessionUIStore.getState().currentSessionId;
    useSessionUIStore.setState({ currentSessionId: null });

    const globalState = useGlobalSessionsStore.getState();
    const globalSnapshot = {
      hasLoaded: globalState.hasLoaded,
      status: globalState.status,
      globalRefreshFailed: globalState.globalRefreshFailed,
      discoveryErrors: globalState.discoveryErrors,
      entityById: globalState.entityById,
    };
    restoreGlobalState = () => {
      useGlobalSessionsStore.setState(globalSnapshot);
    };
    useGlobalSessionsStore.setState({
      hasLoaded: false,
      status: 'idle',
      globalRefreshFailed: false,
      discoveryErrors: new Map(),
      entityById: new Map(),
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });

    useSessionWarmingStore.setState({
      loadSessionWarming: originalLoadSessionWarming,
      removeSessions: originalRemoveSessions,
    });
    useConfigStore.setState({ isConnected: originalIsConnected });
    useSessionUIStore.setState({ currentSessionId: originalCurrentSessionId });
    restoreGlobalState?.();
    restoreGlobalState = null;

    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    globals.clear();
  });

  test('a session the Host has not listed yet is not hydrated', async () => {
    // The active id arrives from a deep link or a just-created session before
    // the discovery snapshot carries it; the warming route answers 404 then.
    useGlobalSessionsStore.setState({ entityById: new Map() });
    expect(isHydratableRootSession('ses-unlisted', undefined)).toBe(false);

    useConfigStore.setState({ isConnected: true });
    useSessionUIStore.setState({ currentSessionId: 'ses-unlisted' });
    await renderHarness();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    expect(loadCalls).toEqual([]);

    // Once discovery lists it, the read is safe and happens. The effect samples
    // the listing once, so the appearance must re-run it (cold load order).
    const listed = makeSession({ sessionId: 'ses-unlisted' });
    await act(async () => {
      useGlobalSessionsStore.setState({ entityById: new Map([[listed.sessionId, listed]]) });
    });
    expect(isHydratableRootSession('ses-unlisted', listed)).toBe(true);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    // The connection did not flap; discovery merely finished listing it.
    expect(loadCalls).toEqual([{ sessionId: 'ses-unlisted', options: undefined }]);
  });

  test('draft_* session IDs do not hydrate or call loadSessionWarming', async () => {
    expect(isHydratableRootSession(null, undefined)).toBe(false);
    expect(isHydratableRootSession('draft_1', undefined)).toBe(false);
    expect(isHydratableRootSession('draft_42', undefined)).toBe(false);
    expect(isHydratableRootSession('draft_1', makeSession({ sessionId: 'draft_1' }))).toBe(false);

    useConfigStore.setState({ isConnected: true });
    useSessionUIStore.setState({ currentSessionId: 'draft_1' });
    await renderHarness();

    await act(async () => {
      useSessionUIStore.setState({ currentSessionId: 'draft_2' });
    });

    expect(loadCalls).toEqual([]);
  });

  test('archived and child sessions do not call loadSessionWarming', async () => {
    const archivedRoot = makeSession({
      sessionId: 'ses-archived',
      archivedAt: 1700000001000,
    });
    const childSession = makeSession({
      sessionId: 'ses-child',
      parentSessionId: 'ses-parent',
      rootSessionId: 'ses-parent',
    });

    useGlobalSessionsStore.setState({
      entityById: new Map([
        [archivedRoot.sessionId, archivedRoot],
        [childSession.sessionId, childSession],
      ]),
    });

    expect(isHydratableRootSession('ses-archived', archivedRoot)).toBe(false);
    expect(isHydratableRootSession('ses-child', childSession)).toBe(false);

    useConfigStore.setState({ isConnected: true });
    useSessionUIStore.setState({ currentSessionId: 'ses-archived' });
    await renderHarness();

    await act(async () => {
      useSessionUIStore.setState({ currentSessionId: 'ses-child' });
    });

    expect(loadCalls).toEqual([]);
  });

  test('hydrates real root session when connected and force-rehydrates on false -> true reconnect', async () => {
    const rootOne = makeSession({ sessionId: 'ses-root-1' });
    const rootTwo = makeSession({ sessionId: 'ses-root-2' });
    useGlobalSessionsStore.setState({
      entityById: new Map([
        [rootOne.sessionId, rootOne],
        [rootTwo.sessionId, rootTwo],
      ]),
    });

    useSessionUIStore.setState({ currentSessionId: 'ses-root-1' });
    await renderHarness();
    expect(loadCalls).toEqual([]);

    await act(async () => {
      useConfigStore.setState({ isConnected: true });
    });
    expect(loadCalls).toEqual([{ sessionId: 'ses-root-1', options: { force: true } }]);

    await act(async () => {
      useSessionUIStore.setState({ currentSessionId: 'ses-root-2' });
    });
    expect(loadCalls).toEqual([
      { sessionId: 'ses-root-1', options: { force: true } },
      { sessionId: 'ses-root-2', options: undefined },
    ]);

    await act(async () => {
      useConfigStore.setState({ isConnected: false });
    });
    await act(async () => {
      useConfigStore.setState({ isConnected: true });
    });
    expect(loadCalls).toEqual([
      { sessionId: 'ses-root-1', options: { force: true } },
      { sessionId: 'ses-root-2', options: undefined },
      { sessionId: 'ses-root-2', options: { force: true } },
    ]);
  });

  test('evicts deleted sessions on authoritative snapshot while preserving discovery-errored scopes', async () => {
    const kept = makeSession({ sessionId: 'ses-kept', projectId: 'proj-ok', workspaceId: 'ws-ok' });
    const deleted = makeSession({ sessionId: 'ses-deleted', projectId: 'proj-ok', workspaceId: 'ws-ok' });
    const erroredWorkspace = makeSession({
      sessionId: 'ses-ws-err',
      projectId: 'proj-ok',
      workspaceId: 'ws-errored',
    });
    const erroredProject = makeSession({
      sessionId: 'ses-proj-err',
      projectId: 'proj-errored',
      workspaceId: 'ws-other',
    });
    const erroredSession = makeSession({
      sessionId: 'ses-self-err',
      projectId: 'proj-ok',
      workspaceId: 'ws-ok',
    });

    useGlobalSessionsStore.setState({
      hasLoaded: true,
      status: 'ready',
      globalRefreshFailed: false,
      discoveryErrors: new Map(),
      entityById: new Map([
        [kept.sessionId, kept],
        [deleted.sessionId, deleted],
        [erroredWorkspace.sessionId, erroredWorkspace],
        [erroredProject.sessionId, erroredProject],
        [erroredSession.sessionId, erroredSession],
      ]),
    });

    await renderHarness();
    expect(removedBatches).toEqual([]);

    await act(async () => {
      useGlobalSessionsStore.setState({
        hasLoaded: true,
        status: 'ready',
        globalRefreshFailed: false,
        discoveryErrors: new Map([
          ['ws-errored', 'DiscoveryFailed'],
          ['proj-errored', 'DiscoveryFailed'],
          ['ses-self-err', 'DiscoveryFailed'],
        ]),
        entityById: new Map([[kept.sessionId, kept]]),
      });
    });

    expect(removedBatches).toEqual([['ses-deleted']]);
  });
});
