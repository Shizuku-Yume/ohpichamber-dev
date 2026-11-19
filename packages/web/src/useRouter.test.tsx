// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Session } from '@openchamber/agent-contract';
import { useRouter } from '@openchamber/ui/hooks/useRouter';
import { navigateFromNotification } from '@openchamber/ui/lib/router/notificationNavigation';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@openchamber/ui/stores/globalSessions';
import { useDirectoryStore } from '@openchamber/ui/stores/useDirectoryStore';
import { useGlobalSessionsStore } from '@openchamber/ui/stores/useGlobalSessionsStore';
import { useUIStore } from '@openchamber/ui/stores/useUIStore';
import { useSessionUIStore } from '@openchamber/ui/sync/session-ui-store';

vi.hoisted(() => {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.origin);
    if (url.pathname === '/api/fs/home') return Response.json({ home: '/home/test', chatsRoot: '/home/test/chats' });
    if (url.pathname === '/api/config/settings') return Response.json({});
    return new Response(null, { status: 404 });
  });
});

const initialGlobalSessions = useGlobalSessionsStore.getState();
const loadSessions = vi.fn<typeof initialGlobalSessions.loadSessions>();
const emptySnapshot = { activeSessions: [], archivedSessions: [] };
const otherSession: Session = {
  sessionId: 'ses_B', projectId: 'other-project', workspaceId: 'other-workspace', displayPath: '.',
  rootSessionId: 'ses_B', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
};

let root: Root;
let host: HTMLDivElement;

function Router() {
  useRouter();
  return <div>Mounted app</div>;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/?session=ses_A');
  registerWorkspaceDirectory(otherSession.workspaceId, '/other-project');
  useDirectoryStore.setState({ currentDirectory: '/project' });
  useUIStore.setState({ isSettingsDialogOpen: false });
  useSessionUIStore.setState({ currentSessionId: 'ses_A', currentSessionDirectory: '/project' });
  loadSessions.mockReset().mockResolvedValue(emptySnapshot);
  vi.spyOn(useGlobalSessionsStore.getState(), 'loadSessions').mockImplementation(loadSessions);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  useGlobalSessionsStore.setState(initialGlobalSessions, true);
  resetWorkspaceDirectories();
});

afterAll(() => vi.unstubAllGlobals());

test('notification navigation opens B through the session-link owner and keeps the document mounted', async () => {
  await act(async () => root.render(<Router />));
  const mounted = host.firstChild;
  const documentBefore = window.document;
  const assign = vi.spyOn(window.location, 'assign');
  const pushState = vi.spyOn(window.history, 'pushState');
  const loading = Promise.withResolvers<Awaited<ReturnType<typeof loadSessions>>>();
  loadSessions.mockImplementationOnce(() => {
    expect(window.location.search).toBe('?session=ses_B');
    return loading.promise;
  });

  expect(navigateFromNotification('/?session=ses_B')).toBe(true);
  expect(useSessionUIStore.getState().currentSessionId).toBe('ses_B');
  expect(pushState).toHaveBeenCalledOnce();
  expect(navigateFromNotification('/?session=ses_C')).toBe(false);
  expect(window.location.search).toBe('?session=ses_B');

  await act(async () => loading.resolve({
    activeSessions: [otherSession], archivedSessions: [],
  }));
  expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/other-project');
  expect(window.document).toBe(documentBefore);
  expect(host.firstChild).toBe(mounted);
  expect(assign).not.toHaveBeenCalled();

  await act(async () => root.render(null));
  expect(navigateFromNotification('/?session=ses_C')).toBe(false);
  expect(useSessionUIStore.getState().currentSessionId).toBe('ses_B');
  expect(pushState).toHaveBeenCalledOnce();
});

test('startup declines notification navigation until the initial route finishes', async () => {
  const loading = Promise.withResolvers<Awaited<ReturnType<typeof loadSessions>>>();
  loadSessions.mockReturnValueOnce(loading.promise);
  await act(async () => root.render(<Router />));
  expect(navigateFromNotification('/?session=ses_B')).toBe(false);
  expect(window.location.search).toBe('?session=ses_A');
  expect(useSessionUIStore.getState().currentSessionId).toBe('ses_A');
  await act(async () => loading.resolve(emptySnapshot));
  expect(navigateFromNotification('/?session=ses_B')).toBe(true);
  await act(async () => {});
  expect(useSessionUIStore.getState().currentSessionId).toBe('ses_B');
});

test('an accepted route failure releases the busy guard for the next click', async () => {
  await act(async () => root.render(<Router />));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const select = vi.spyOn(useSessionUIStore.getState(), 'setCurrentSession')
    .mockImplementationOnce(() => { throw new Error('selection failed'); });
  expect(navigateFromNotification('/?session=ses_B')).toBe(true);
  await act(async () => {});
  expect(log).toHaveBeenCalledWith('[PWA] notification navigation failed:', expect.any(Error));
  expect(useSessionUIStore.getState().currentSessionId).toBe('ses_A');
  select.mockRestore();
  expect(navigateFromNotification('/?session=ses_C')).toBe(true);
  await act(async () => {});
  expect(useSessionUIStore.getState().currentSessionId).toBe('ses_C');
});
