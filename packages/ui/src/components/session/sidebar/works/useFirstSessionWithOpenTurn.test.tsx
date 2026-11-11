import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import type { CanonicalEvent } from '@openchamber/agent-contract';
import { applyBackgroundShellEvents, resetBackgroundShells } from '@/sync/background-shells';
import { replaceGlobalSessionStatusById, setSessionParentResolver, useFirstSessionWithOpenTurn } from '@/sync/global-session-status';
import { applyPrWatch, resetPrWatchesForRuntimeSwitch } from '@/sync/pr-watch';
import { setWorkflowRunningSessions } from '@/sync/workflow-activity';
import { installHookTestDom } from '../test-utils/testDom';

// A worktree row counts time for this session: an idle one its background work
// holds must read as running, or the row pairs a busy mark with a finished time.
const SESSIONS = ['first', 'second'];

const reset = () => {
  replaceGlobalSessionStatusById(new Map());
  resetBackgroundShells();
  resetPrWatchesForRuntimeSwitch();
  setWorkflowRunningSessions([]);
  setSessionParentResolver(() => undefined);
};

let dom: ReturnType<typeof installHookTestDom>;
let root: ReturnType<typeof createRoot>;
let found: string | null;

const Harness = () => {
  found = useFirstSessionWithOpenTurn(SESSIONS);
  return null;
};

beforeEach(async () => {
  reset();
  dom = installHookTestDom();
  root = createRoot(dom.container);
  await act(async () => root.render(<Harness />));
  expect(found).toBeNull();
});

afterEach(async () => {
  await act(async () => root.unmount());
  dom.restore();
  reset();
});

test('a session running or holding a running subagent is found', async () => {
  await act(async () => replaceGlobalSessionStatusById(new Map([['second', { directory: '/repo', status: 'running' }]])));
  expect(found).toBe('second');

  await act(async () => {
    setSessionParentResolver((id) => (id === 'child' ? 'first' : undefined));
    replaceGlobalSessionStatusById(new Map([['child', { directory: '/repo', status: 'running' }]]));
  });
  expect(found).toBe('first');
});

test('an idle session waiting on a command, a workflow or a pull request is found', async () => {
  const runningShell: CanonicalEvent = {
    type: 'shell.updated',
    sessionId: 'second', epoch: '1', sequence: '1', timestamp: 1,
    job: {
      jobId: 'sh_1', sessionId: 'second', epoch: '1', workerGeneration: 'worker-1',
      workspaceId: 'workspace-repo', projectId: 'p', command: 'sleep 300', background: true,
      startedAt: 1, outputCursor: '0', status: 'running',
    },
  };
  await act(async () => applyBackgroundShellEvents('/repo', [runningShell]));
  expect(found).toBe('second');
  await act(async () => resetBackgroundShells());
  expect(found).toBeNull();

  await act(async () => setWorkflowRunningSessions(['first']));
  expect(found).toBe('first');
  await act(async () => setWorkflowRunningSessions([]));

  await act(async () => applyPrWatch(1, 'second', {
    sessionID: 'second', directory: '/repo', url: 'https://example.test/pr/1', number: 1, title: 'PR', status: 'pending', startedAt: 1,
  }));
  expect(found).toBe('second');
  await act(async () => applyPrWatch(2, 'second', null));
  expect(found).toBeNull();
});
