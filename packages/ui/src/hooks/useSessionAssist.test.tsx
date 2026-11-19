import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import type { CanonicalClient } from '@/api/canonicalClient';
import { SyncProvider } from '@/sync/sync-context';
import { useSessionAssistState } from '@/hooks/useSessionAssist';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { nativeClient as createCanonicalClient } from '@/sync/session-message-loader-test-fixtures';

/**
 * A synthetic `draft_*` id is not a native session: the recap route answers
 * 403 for it. An unknown or child id answers 404. Only a settled root session
 * may read the journal route, and a failure must not be treated as "no recap".
 */
const directory = '/assist-repo';
const session = (sessionId: string, changes: Partial<Session> = {}): Session => ({
  ...createSession(sessionId), ...changes,
});
function createSession(sessionId: string): Session {
  return {
    sessionId, projectId: 'project-1', workspaceId: 'workspace-1', displayPath: '.', rootSessionId: sessionId,
    createdAt: 1, updatedAt: 1, epoch: 'epoch-1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    mode: { kind: 'main' }, metadata: null, metadataRevision: '0', archiveRevision: '0',
  };
}

let browser: Window;
let root: Root;
let host: HTMLDivElement;

const mountAssist = async (sessionId: string, client: CanonicalClient) => {
  let state: ReturnType<typeof useSessionAssistState> | undefined;
  const Probe = () => { state = useSessionAssistState(sessionId, directory); return null; };
  await act(async () => {
    root.render(
      <SyncProvider client={client} directory={directory}>
        <Probe />
      </SyncProvider>,
    );
  });
  return () => state!;
};

beforeEach(() => {
  browser = new Window({ url: 'http://localhost/' });
  Object.assign(globalThis, {
    window: browser, document: browser.document, navigator: browser.navigator,
    localStorage: browser.localStorage, Node: browser.Node, Element: browser.Element,
    HTMLElement: browser.HTMLElement, requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser), IS_REACT_ACT_ENVIRONMENT: true,
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  useUIStore.setState({ sessionRecapEnabled: true });
  useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null });
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  browser.close();
});

const client = (listed: Session[]) => {
  const native = createCanonicalClient();
  native.resolveWorkspace = async () => ({ workspaceId: 'workspace-1', projectId: 'project-1', name: 'Workspace' });
  native.listProjects = async () => ({ items: [], errors: {} });
  native.listWorkspaces = async () => ({ items: [], errors: {} });
  native.listSessions = async () => ({ items: listed, errors: {} });
  native.getModels = async (workspaceId: string) => ({ workspaceId, revision: '0', models: [], defaults: { model: null, thinkingLevel: null }, imageModels: [], planRoleAvailable: false });
  native.getProviders = async (workspaceId: string) => ({ workspaceId, revision: '0', providers: [] });
  native.getAgents = async (workspaceId: string) => ({ workspaceId, revision: '0', agents: [] });
  native.getShellSnapshot = async (scope) => {
    if (scope.kind !== 'workspace') throw new Error('Assist fixture only uses workspace shell scope');
    return { scope: { kind: 'workspace', workspaceId: scope.workspaceId }, epoch: 'e', revision: '0', running: [], ended: [], recovery: { priorEpochs: 'invalidated' } };
  };
  native.subscribeSessionEvents = () => () => { };
  return native;
};

const recapRoute = (requests: string[]) => spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  requests.push(new URL(input instanceof Request ? input.url : input.toString(), 'http://localhost/').pathname);
  return Response.json({ recaps: [] });
});

describe('useSessionAssist recap gating', () => {
  test('a draft session id never reaches the recap route', async () => {
    const requests: string[] = [];
    const route = recapRoute(requests);
    const listed: Session[] = [];
    const clientInstance = client(listed);
    const read = await mountAssist('draft_3', clientInstance);
    try {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(requests.filter((path) => path.includes('/recaps'))).toEqual([]);
      expect(read().visibleRecap).toBeNull();
      expect(read().sessionKnown).toBe(false);
    } finally { route.mockRestore(); }
  });

  test('an unknown or child session id never reaches the recap route', async () => {
    const requests: string[] = [];
    const route = recapRoute(requests);
    const child = session('child-session', { parentSessionId: 'root-session', rootSessionId: 'root-session' });
    const rootSession = session('root-session');
    const clientInstance = client([rootSession]);
    const read = await mountAssist(child.sessionId, clientInstance);
    try {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
      expect(requests.filter((path) => path.includes('/recaps'))).toEqual([]);
      expect(read().sessionKnown).toBe(false);
    } finally { route.mockRestore(); }
  });

  test('a settled root session does read the journal recap route', async () => {
    const requests: string[] = [];
    const route = recapRoute(requests);
    const listed = [session('root-ok')];
    const read = await mountAssist('root-ok', client(listed));
    try {
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 40)); });
      expect(requests.some((path) => path === `/api/agent/v1/sessions/root-ok/recaps`)).toBe(true);
      expect(read().sessionKnown).toBe(true);
    } finally { route.mockRestore(); }
  });
});
