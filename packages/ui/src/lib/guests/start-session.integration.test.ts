import { afterEach, expect, mock, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useUIStore } from '@/stores/useUIStore';
import * as sessionActions from '@/sync/session-actions';
import { startGuestSession } from './start-session';
import * as worktreeCreate from '@/lib/worktrees/worktreeCreate';
import * as worktreeBootstrap from '@/lib/worktrees/worktreeBootstrap';
import * as projectConfig from '@/lib/openchamberConfig';
import * as sharedTrust from '@/lib/sharedTrustConfirmation';

const created: Session = {
  sessionId: 'background-session', projectId: 'b', workspaceId: 'workspace-b', displayPath: '.', rootSessionId: 'background-session',
  createdAt: 1, updatedAt: 1, epoch: '0', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: { title: 'Task' }, metadataRevision: '1', archiveRevision: '0',
};
const originalRuntime = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();
afterEach(() => {
  mock.restore();
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime });
});
const setup = () => {
  const resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async (directory) => ({
    workspaceId: directory === '/project-b' || directory === '/existing' ? 'workspace-b' : 'workspace-a',
    projectId: directory === '/project-b' || directory === '/existing' ? 'b' : 'a', name: directory === '/project-b' || directory === '/existing' ? 'Project B' : 'Project A',
  }));
  const create = spyOn(canonicalClient, 'createSession').mockImplementation(async (input) => ({
    session: { ...created, projectId: input.projectId, workspaceId: input.workspaceId, displayPath: '.' },
  }));
  spyOn(sessionActions, 'setLinkedIssue').mockResolvedValue(created);
  useProjectsStore.setState({ hasServerSnapshot: true, projects: [{ id: 'a', path: '/project-a', addedAt: 1 }, { id: 'b', path: '/project-b', addedAt: 1 }], activeProjectId: 'a' });
  useSessionUIStore.setState({ currentSessionId: 'existing-chat', currentSessionDirectory: '/project-a' });
  useUIStore.getState().setOpenGuestPage('board');
  return { create, resolveWorkspace };
};

test('a guest session in another project registers without changing the open page or chat', async () => {
  const { create, resolveWorkspace } = setup();
  const result = await startGuestSession({ directory: '/project-a', t: (key) => key, assertAuthorized: () => {},
    request: { providerId: 'board', id: 'TASK-1', title: 'Task', url: 'https://example.com/task', projectId: 'b' } });
  expect(resolveWorkspace).toHaveBeenCalledWith('/project-b');
  expect(create.mock.calls[0]?.[0].workspaceId).toBe('workspace-b');
  expect(result).toMatchObject({ sessionId: created.sessionId, directory: '.', sent: 'skipped', linked: true });
  expect(useSessionUIStore.getState().currentSessionId).toBe('existing-chat');
  expect(useSessionUIStore.getState().currentSessionDirectory).toBe('/project-a');
  expect(useProjectsStore.getState().activeProjectId).toBe('a');
  expect(useUIStore.getState().openGuestPageId).toBe('board');
  expect(useGlobalSessionsStore.getState().entityById.get(created.sessionId)).toMatchObject({ projectId: 'b', displayPath: '.' });
});

test('named worktrees forward the base ref through existing creation and keep bootstrap failures explicit', async () => {
  const { create } = setup();
  const createTree = spyOn(worktreeCreate, 'createWorktreeWithDefaults').mockResolvedValue({
    path: '/isolated-fix', projectDirectory: '/project-b', branch: 'fix-login', label: 'fix-login', name: 'fix-login', worktreeStatus: 'pending',
  });
  spyOn(sharedTrust, 'resolveWorktreeSetupCommands').mockResolvedValue([]);
  spyOn(projectConfig, 'getWorktreeSetupWaitEnabled').mockResolvedValue(true);
  spyOn(worktreeBootstrap, 'waitForWorktreeBootstrap').mockRejectedValue(new Error('Setup failed'));
  const result = await startGuestSession({ directory: '/project-a', t: (key) => key, assertAuthorized: () => {},
    request: { providerId: 'board', id: 'TASK-2', title: 'Task', url: 'https://example.com/task', projectId: 'b', worktree: { kind: 'new', name: 'fix-login', baseBranch: 'release' } } });
  expect(createTree.mock.calls[0]?.[0]).toMatchObject({ id: 'b', path: '/project-b' });
  expect(createTree.mock.calls[0]?.[1]).toMatchObject({ branchName: 'fix-login', worktreeName: 'fix-login', startRef: 'release' });
  expect(create.mock.calls.length).toBe(0);
  expect(result).toMatchObject({ sessionId: null, failure: 'bootstrap-failed', directory: '/isolated-fix', worktree: { branch: 'fix-login' } });
  expect(useUIStore.getState().openGuestPageId).toBe('board');
});

test('existing worktrees create sessions in their directory without creating or scanning worktrees', async () => {
  const { create } = setup();
  useSessionUIStore.setState({ availableWorktreesByProject: new Map([['/project-b', [{
    path: '/existing', projectDirectory: '/project-b', branch: 'existing', label: 'existing', worktreeStatus: 'ready',
  }]]]) });
  const tree = spyOn(worktreeCreate, 'createWorktreeWithDefaults');
  spyOn(projectConfig, 'getWorktreeSetupWaitEnabled').mockResolvedValue(false);
  const result = await startGuestSession({ directory: '/project-a', t: (key) => key, assertAuthorized: () => {},
    request: { providerId: 'board', id: 'TASK-3', title: 'Task', url: 'https://example.com/task', projectId: 'b', worktree: { kind: 'existing', directory: '/existing' } } });
  expect(create.mock.calls[0]?.[0].workspaceId).toBe('workspace-b');
  expect(tree.mock.calls.length).toBe(0);
  expect(result).toMatchObject({ sessionId: created.sessionId, directory: '.', worktree: { directory: '/existing', branch: 'existing' } });
  expect(useSessionUIStore.getState().currentSessionId).toBe('existing-chat');
});

test('a late canonical create response cannot publish after the runtime changes', async () => {
  const { create } = setup();
  const { promise: response, resolve } = Promise.withResolvers<{ session: Session }>();
  const { promise: started, resolve: markStarted } = Promise.withResolvers<void>();
  create.mockImplementation(() => { markStarted(); return response; });
  const pending = sessionActions.createSession('Late', '/project-b', undefined, undefined, undefined, 'preserve');
  await started;
  switchRuntimeEndpoint({ apiBaseUrl: 'https://guest-next.test', runtimeKey: 'guest-next' });
  resolve({ session: { ...created, sessionId: 'late-session' } });
  expect(await pending).toBeNull();
  expect(useGlobalSessionsStore.getState().entityById.has('late-session')).toBe(false);
  expect(useSessionUIStore.getState().currentSessionId).toBe('existing-chat');
});
