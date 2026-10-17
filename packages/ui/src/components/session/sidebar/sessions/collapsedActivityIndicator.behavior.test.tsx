import { describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@openchamber/agent-contract';
import { replaceGlobalSessionStatusById } from '@/sync/global-session-status';
import { applyGlobalBlockingRequestEvents, resetGlobalBlockingRequests } from '@/sync/global-blocking-requests';
import { useNotificationStore } from '@/sync/notification-store';
import { useCollapsedSessionActivityState } from './collapsedActivityState';
import type { SessionNode } from '../types';
import { installHookTestDom } from '../test-utils/testDom';

const node = (sessionId: string): SessionNode => ({
  session: {
    sessionId,
    rootSessionId: sessionId,
    projectId: 'project-a',
    workspaceId: 'workspace-a',
    displayPath: '.',
    createdAt: 1,
    updatedAt: 1,
    epoch: '1',
    headSequence: '0',
    runtimeStatus: 'idle',
    activeRunId: null,
    metadata: null,
    metadataRevision: '0',
    archiveRevision: '0',
  } satisfies Session,
  children: [],
  worktree: null,
});

describe('collapsed activity scalar selector', () => {
  test('does not rerender for unrelated updates and rerenders for relevant scalar changes', async () => {
    const dom = installHookTestDom();
    const root = createRoot(dom.container);
    replaceGlobalSessionStatusById(new Map());
    useNotificationStore.setState({
      list: [],
      index: { session: { unseenCount: {}, unseenHasError: {} }, project: { unseenCount: {}, unseenHasError: {} } },
    });
    type ActivityCapture = { renders: number; state: string | null };
    const capture: ActivityCapture = { renders: 0, state: null };
    const Harness = () => {
      capture.renders += 1;
      capture.state = useCollapsedSessionActivityState({ nodes: [node('relevant')], includeUnreadSubtasks: true });
      return null;
    };
    try {
      await act(async () => root.render(React.createElement(Harness)));
      const initialRenders = capture.renders;
      await act(async () => replaceGlobalSessionStatusById(new Map([['unrelated', { status: 'running', directory: '/other' }]])));
      await act(async () => useNotificationStore.getState().append({
        type: 'turn-complete', session: 'unrelated', time: Date.now(), viewed: false,
      }));
      expect(capture.renders).toBe(initialRenders);

      await act(async () => useNotificationStore.getState().append({
        type: 'turn-complete', session: 'relevant', time: Date.now(), viewed: false,
      }));
      expect(capture.state).toBe('unread');
      const unreadRenders = capture.renders;
      await act(async () => replaceGlobalSessionStatusById(new Map([['relevant', { status: 'running', directory: '/workspace' }]])));
      expect(capture.state).toBe('active');
      expect(capture.renders).toBe(unreadRenders + 1);

      // A pending request outranks a running turn, and a request elsewhere is ignored.
      const activeRenders = capture.renders;
      await act(async () => applyGlobalBlockingRequestEvents('/other', [{
        sessionId: 'unrelated', epoch: 'epoch-1', sequence: '1', timestamp: 1, type: 'question.requested',
        question: { questionId: 'q-other', sessionId: 'unrelated', turnId: 'turn-1', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1', prompt: 'Pick', status: 'pending', requestedAt: 1 },
      }]));
      expect(capture.state).toBe('active');
      expect(capture.renders).toBe(activeRenders);
      await act(async () => applyGlobalBlockingRequestEvents('/workspace', [{
        sessionId: 'relevant', epoch: 'epoch-1', sequence: '1', timestamp: 1, type: 'question.requested',
        question: { questionId: 'q1', sessionId: 'relevant', turnId: 'turn-1', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1', prompt: 'Pick', status: 'pending', requestedAt: 1 },
      }]));
      expect(capture.state).toBe('form');
      await act(async () => applyGlobalBlockingRequestEvents('/workspace', [{
        sessionId: 'relevant', epoch: 'epoch-1', sequence: '2', timestamp: 2, type: 'approval.requested',
        approval: { approvalId: 'p1', sessionId: 'relevant', turnId: 'turn-1', toolCallId: 'call-1', toolName: 'bash', actionType: 'bash_command', commandSummary: 'bash', details: {}, version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1', status: 'pending', requestedAt: 2 },
      }, {
        sessionId: 'relevant', epoch: 'epoch-1', sequence: '3', timestamp: 3, type: 'approval.resolved',
        approval: { approvalId: 'p1', sessionId: 'relevant', turnId: 'turn-1', toolCallId: 'call-1', toolName: 'bash', actionType: 'bash_command', commandSummary: 'bash', details: {}, version: '2', epoch: 'epoch-1', workerGeneration: 'worker-1', status: 'rejected', requestedAt: 2, resolvedAt: 3, resolution: { decision: 'reject' } },
      }, {
        sessionId: 'relevant', epoch: 'epoch-1', sequence: '4', timestamp: 4, type: 'question.resolved',
        question: { questionId: 'q1', sessionId: 'relevant', turnId: 'turn-1', version: '2', epoch: 'epoch-1', workerGeneration: 'worker-1', prompt: 'Pick', status: 'cancelled', requestedAt: 1, resolvedAt: 4 },
      }]));
      expect(capture.state).toBe('active');
    } finally {
      await act(async () => root.unmount());
      replaceGlobalSessionStatusById(new Map());
      resetGlobalBlockingRequests();
      useNotificationStore.setState({
        list: [],
        index: { session: { unseenCount: {}, unseenHasError: {} }, project: { unseenCount: {}, unseenHasError: {} } },
      });
      dom.restore();
    }
  });

  test('counts a request from a session that is listed only as blocking, such as a hidden subagent', async () => {
    const dom = installHookTestDom();
    const root = createRoot(dom.container);
    replaceGlobalSessionStatusById(new Map());
    const capture: { state: string | null } = { state: null };
    const Harness = () => {
      capture.state = useCollapsedSessionActivityState({
        nodes: [node('lane')],
        blockingSessionIds: ['lane', 'lane-subagent'],
        includeUnreadSubtasks: true,
      });
      return null;
    };
    try {
      await act(async () => root.render(React.createElement(Harness)));
      expect(capture.state).toBeNull();
      await act(async () => applyGlobalBlockingRequestEvents('/workspace', [{
        sessionId: 'lane-subagent', epoch: 'epoch-1', sequence: '1', timestamp: 1, type: 'approval.requested',
        approval: { approvalId: 'p-sub', sessionId: 'lane-subagent', turnId: 'turn-1', toolCallId: 'call-sub', toolName: 'bash', actionType: 'bash_command', commandSummary: 'bash', details: {}, version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1', status: 'pending', requestedAt: 1 },
      }]));
      expect(capture.state).toBe('permission');
    } finally {
      await act(async () => root.unmount());
      resetGlobalBlockingRequests();
      dom.restore();
    }
  });
});
