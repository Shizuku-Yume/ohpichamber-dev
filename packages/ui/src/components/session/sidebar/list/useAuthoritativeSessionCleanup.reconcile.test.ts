import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import type { Session } from '@openchamber/agent-contract';
import { installHookTestDom } from '../test-utils/testDom';
import { ChildStoreManager } from '@/sync/child-store';
import { setActionRefs } from '@/sync/session-actions';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSpacesStore } from '@/lib/spaces/spaces-store';
const { useAuthoritativeSessionCleanup } = await import('./useAuthoritativeSessionCleanup');

// SAFETY: the cleanup identity path reads only canonical session identity fields.
const session = (sessionId: string, displayPath = '/repo'): Session => {
  const workspaceId = `workspace:${displayPath}`;
  registerWorkspaceDirectory(workspaceId, displayPath);
  return {
    sessionId, projectId: 'project', workspaceId, displayPath, rootSessionId: sessionId,
    createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    metadata: { title: sessionId }, metadataRevision: '1', archiveRevision: '0',
  };
};
resetWorkspaceDirectories();
const CleanupProbe: React.FC<{ sessions: Session[]; revision: number }> = ({ sessions, revision }) => {
  useAuthoritativeSessionCleanup({ enabled: true, hasAuthoritativeGlobalSessions: true, sessions });
  return React.createElement('span', null, revision);
};

describe('authoritative session cleanup reconciles the deletion', () => {
  let root: Root;
  let dom: ReturnType<typeof installHookTestDom>;
  let childStores: ChildStoreManager;

  beforeEach(() => {
    dom = installHookTestDom();
    root = createRoot(dom.container);
    childStores = new ChildStoreManager();
    setActionRefs(childStores, () => '/repo');
    const store = childStores.ensureChild('/repo', { bootstrap: false });
    store.setState({ session: [session('deleted'), session('retained')] });
    useGlobalSessionsStore.getState().applySnapshot([session('deleted'), session('retained')], [], 'ready');
    useSessionUIStore.getState().setCurrentSession('deleted', '/repo');
    useSpacesStore.getState().resetForRuntimeSwitch();
  });

  afterEach(() => {
    act(() => root.unmount());
    dom.restore();
    childStores.disposeAll();
    useGlobalSessionsStore.getState().resetForRuntimeSwitch();
    useSessionUIStore.getState().setCurrentSession(null);
  });

  test('a session omitted from a later complete snapshot leaves every live store and the active chat', () => {
    act(() => root.render(React.createElement(CleanupProbe, { sessions: [session('deleted'), session('retained')], revision: 0 })));
    act(() => root.render(React.createElement(CleanupProbe, { sessions: [session('retained')], revision: 1 })));

    const live = childStores.getChild('/repo')!.getState().session.map((item) => item.sessionId);
    const global = useGlobalSessionsStore.getState();
    const ui = useSessionUIStore.getState();

    expect(live).toEqual(['retained']);
    expect(global.entityById.has('deleted')).toBe(false);
    expect(global.activeSessions.some((item) => item.sessionId === 'deleted')).toBe(false);
    expect(ui.currentSessionId).toBe(null);
  });
});
