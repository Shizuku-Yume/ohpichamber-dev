import { describe, expect, test } from 'bun:test';
import type { ApprovalRequest, Session } from '@openchamber/agent-contract';
import { areRequestArraysReferentiallyEqual, collectScopedBlockingRequests } from './scoped-blocking-requests';
const session = (sessionId: string, parentSessionId?: string): Session => ({ sessionId, projectId: 'project_1', workspaceId: 'workspace_1', displayPath: 'session', parentSessionId, rootSessionId: parentSessionId ?? sessionId, createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, metadata: null, metadataRevision: '0', archiveRevision: '0' });
const approval = (approvalId: string, sessionId: string): ApprovalRequest => ({ approvalId, sessionId, turnId: 'turn_1', toolCallId: 'tool_1', toolName: 'bash', actionType: 'bash_command', commandSummary: 'pwd', details: {}, status: 'pending', requestedAt: 1, epoch: 'epoch_1', workerGeneration: 'worker_1', version: '1' });
describe('scoped native blocking requests', () => {
  test('collects a session subtree', () => {
    const root = approval('approval_root', 'root'); const child = approval('approval_child', 'child'); const other = approval('approval_other', 'other'); const empty: ApprovalRequest[] = [];
    expect(collectScopedBlockingRequests([session('root'), session('child', 'root'), session('other')], { root: [root], child: [child], other: [other] }, 'root', empty)).toEqual([root, child]);
  });
  test('returns the provided empty array when no requests exist', () => {
    const empty: ApprovalRequest[] = [];
    expect(collectScopedBlockingRequests([session('root')], {}, 'root', empty)).toBe(empty);
    expect(collectScopedBlockingRequests([session('root')], {}, null, empty)).toBe(empty);
  });
  test('compares request identity', () => {
    const first = approval('approval_1', 'root'); const second = approval('approval_2', 'root');
    expect(areRequestArraysReferentiallyEqual([first, second], [first, second])).toBe(true);
    expect(areRequestArraysReferentiallyEqual([first, second], [second, first])).toBe(false);
  });
  test('filters terminal and misfiled requests and preserves worker-local identities', () => {
    const first = approval('same', 'root'); const child = approval('same', 'child');
    const resolved: ApprovalRequest = { ...approval('resolved', 'root'), status: 'rejected', version: '2', resolvedAt: 2, resolution: { decision: 'reject' } };
    expect(collectScopedBlockingRequests([session('root'), session('child', 'root')], { root: [first, first, child, resolved], child: [child] }, 'root', [])).toEqual([first, child]);
  });
});
