import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { CanonicalEvent } from '@openchamber/agent-contract';
import type { Session } from '@openchamber/agent-contract';

import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import { applyBackgroundShellEvents, resetBackgroundShells } from '@/sync/background-shells';
import { replaceGlobalSessionStatusById, setSessionParentResolver } from '@/sync/global-session-status';
import { applyPrWatches, resetPrWatchesForRuntimeSwitch } from '@/sync/pr-watch';
import { setWorkflowRunningSessions } from '@/sync/workflow-activity';
import { installHookTestDom } from '../test-utils/testDom';
import { useSidebarLiveFacts } from './useSidebarLiveFacts';
import type { SidebarLiveFacts } from './workFacts';

/**
 * A session whose last turn ended (`workbench.lastIdleAt`) however much work
 * it left running.
 */
const finished = (sessionId: string, parentSessionId?: string): Session => {
  registerWorkspaceDirectory('workspace-repo', '/repo');
  return {
    sessionId,
    parentSessionId,
    rootSessionId: parentSessionId ?? sessionId,
    projectId: 'p',
    workspaceId: 'workspace-repo',
    displayPath: '/repo',
    createdAt: 1,
    updatedAt: 2,
    epoch: '1',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    mode: { kind: 'main' },
    title: sessionId,
    metadata: { openchamber: { workbench: { lastIdleAt: 2 } } },
    metadataRevision: '1',
    archiveRevision: '0',
  };
};

const shellIdentity = { jobId: 'sh_1', sessionId: 'waiting', epoch: '1', workerGeneration: 'worker-1' };
const shellStarted: CanonicalEvent = {
  type: 'shell.updated',
  sessionId: 'waiting', epoch: '1', sequence: '1', timestamp: 1,
  job: {
    ...shellIdentity, workspaceId: 'workspace-repo', projectId: 'p', command: 'sleep 300', background: true,
    startedAt: 1, outputCursor: '0', status: 'running',
  },
};
const shellEnded: CanonicalEvent = {
  type: 'shell.updated',
  sessionId: 'waiting', epoch: '1', sequence: '2', timestamp: 2,
  job: {
    ...shellIdentity, workspaceId: 'workspace-repo', projectId: 'p', command: 'sleep 300', background: true,
    startedAt: 1, outputCursor: '0', status: 'ended', endedAt: 2, termination: { reason: 'exit', exitCode: 0 },
  },
};

const reset = () => {
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  replaceGlobalSessionStatusById(new Map());
  resetBackgroundShells();
  resetPrWatchesForRuntimeSwitch();
  setWorkflowRunningSessions([]);
  setSessionParentResolver(() => undefined);
};

let dom: ReturnType<typeof installHookTestDom>;
let root: ReturnType<typeof createRoot>;
let facts: SidebarLiveFacts;

const Harness = () => {
  facts = useSidebarLiveFacts(true);
  return null;
};

const expectWaiting = () => {
  expect(facts.unreadIds.has('waiting')).toBe(false);
  expect(facts.activeIds.has('waiting')).toBe(true);
  // A finished session beside it stays unread.
  expect(facts.unreadIds.has('finished')).toBe(true);
};

beforeEach(async () => {
  reset();
  dom = installHookTestDom();
  root = createRoot(dom.container);
  useGlobalSessionsStore.getState().upsertSessions([finished('waiting'), finished('finished')]);
  await act(async () => root.render(<Harness />));
  expect([...facts.unreadIds].sort()).toEqual(['finished', 'waiting']);
  expect(facts.activeIds.size).toBe(0);
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.restore();
  reset();
});

test('a session idling on a background command is running until it ends, then unread', async () => {
  await act(async () => applyBackgroundShellEvents('/repo', [shellStarted]));
  expectWaiting();

  await act(async () => applyBackgroundShellEvents('/repo', [shellEnded]));
  expect(facts.unreadIds.has('waiting')).toBe(true);
  expect(facts.activeIds.has('waiting')).toBe(false);
});

test('a session idling on a background subagent is running until it ends, then unread', async () => {
  await act(async () => {
    useGlobalSessionsStore.getState().upsertSessions([finished('child', 'waiting')]);
    setSessionParentResolver((id) => (id === 'child' ? 'waiting' : undefined));
    replaceGlobalSessionStatusById(new Map([['child', { directory: '/repo', status: 'running' }]]));
  });
  expectWaiting();

  await act(async () => replaceGlobalSessionStatusById(new Map()));
  expect(facts.unreadIds.has('waiting')).toBe(true);
});

test('a session idling on a workflow run or its pull request is running', async () => {
  await act(async () => setWorkflowRunningSessions(['waiting']));
  expectWaiting();
  await act(async () => setWorkflowRunningSessions([]));
  expect(facts.unreadIds.has('waiting')).toBe(true);

  await act(async () => applyPrWatches(1, 'waiting', [{
    sessionID: 'waiting', directory: '/repo', url: 'https://example.test/pr/1', number: 1, title: 'PR', status: 'pending', startedAt: 1,
  }]));
  expectWaiting();
});
