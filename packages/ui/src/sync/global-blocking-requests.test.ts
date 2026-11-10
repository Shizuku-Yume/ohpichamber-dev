import { beforeEach, describe, expect, test } from 'bun:test';
import type { ApprovalRequest, CanonicalEvent, QuestionRequest } from '@openchamber/agent-contract';
import { applyGlobalBlockingRequestEvents, replaceGlobalBlockingRequestSnapshot, resetGlobalBlockingRequests, seedGlobalBlockingRequests, useGlobalBlockingRequestsStore } from './global-blocking-requests';
const approval = (approvalId: string, sessionId: string): ApprovalRequest => ({ version: '1', epoch: 'epoch_1', workerGeneration: 'worker_1', approvalId, sessionId, turnId: 'turn_1', toolCallId: `tool_${approvalId}`, toolName: 'bash', actionType: 'bash_command', commandSummary: 'ls', details: {}, status: 'pending', requestedAt: 1 });
const question = (questionId: string, sessionId: string): QuestionRequest => ({ version: '1', epoch: 'epoch_1', workerGeneration: 'worker_1', questionId, sessionId, turnId: 'turn_1', prompt: 'Continue?', status: 'pending', requestedAt: 1 });
const event = (type: CanonicalEvent['type'], fields: Record<string, unknown>): CanonicalEvent => ({ sessionId: String(fields.sessionId ?? 'session_1'), epoch: 'epoch_1', sequence: '1', timestamp: 1, type, ...fields } as CanonicalEvent);
const bySession = () => useGlobalBlockingRequestsStore.getState().bySession;
beforeEach(() => resetGlobalBlockingRequests());
describe('global native blocking requests', () => {
  test('tracks approval and question requests and settles by native IDs', () => {
    applyGlobalBlockingRequestEvents('/repo', [event('approval.requested', { sessionId: 'session_1', approval: approval('approval_1', 'session_1') }), event('question.requested', { sessionId: 'session_1', question: question('question_1', 'session_1') })]);
    expect(bySession().get('session_1')?.permissions[0].approvalId).toBe('approval_1');
    expect(bySession().get('session_1')?.forms[0].questionId).toBe('question_1');
    const resolvedApproval = { ...approval('approval_1', 'session_1'), version: '2' as const, status: 'approved' as const, resolvedAt: 2, resolution: { decision: 'approve' as const } };
    const resolvedQuestion = { ...question('question_1', 'session_1'), version: '2' as const, status: 'cancelled' as const, resolvedAt: 2 };
    applyGlobalBlockingRequestEvents('/repo', [event('approval.resolved', { sessionId: 'session_1', approval: resolvedApproval }), event('question.resolved', { sessionId: 'session_1', question: resolvedQuestion })]);
    expect(bySession().has('session_1')).toBe(false);
  });
  test('deletion clears a session without affecting siblings', () => {
    applyGlobalBlockingRequestEvents('/repo', [event('approval.requested', { sessionId: 'session_1', approval: approval('approval_1', 'session_1') }), event('approval.requested', { sessionId: 'session_2', approval: approval('approval_2', 'session_2') })]);
    applyGlobalBlockingRequestEvents('/repo', [event('session.deleted', { sessionId: 'session_1', deletedSessionIds: ['session_1'] })]);
    expect(bySession().has('session_1')).toBe(false); expect(bySession().has('session_2')).toBe(true);
  });
  test('seeding is additive and does not override live entries', () => {
    const first = approval('approval_1', 'session_1'); const second = approval('approval_2', 'session_2');
    seedGlobalBlockingRequests([{ sessionId: 'session_1', directory: '/repo', permissions: [first], forms: [] }]);
    seedGlobalBlockingRequests([{ sessionId: 'session_1', directory: '/other', permissions: [second], forms: [] }, { sessionId: 'session_2', directory: '/other', permissions: [second], forms: [] }]);
    expect(bySession().get('session_1')?.permissions[0].approvalId).toBe('approval_1'); expect(bySession().has('session_2')).toBe(true);
  });
  test('authoritative snapshot replaces pending scope and ignores prior epoch events', () => {
    const current = approval('approval_1', 'session_1');
    replaceGlobalBlockingRequestSnapshot('/repo', {
      session: { sessionId: 'session_1', projectId: 'project_1', workspaceId: 'workspace_1', displayPath: '.', rootSessionId: 'session_1', createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '4', runtimeStatus: 'awaiting_approval', activeRunId: 'run_1', mode: { kind: 'main' } },
      cursor: 'epoch_1:4', activeRun: null, branch: { branchId: 'branch_1', branchVersion: '0', leafMessageId: null },
      window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false }, turns: [], messages: [], approvals: [current], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
    });
    expect(bySession().get('session_1')?.permissions[0]?.approvalId).toBe('approval_1');
    const old = { ...current, epoch: 'epoch_0', version: '2' as const };
    applyGlobalBlockingRequestEvents('/repo', [event('approval.resolved', { sessionId: 'session_1', epoch: 'epoch_0', approval: old })]);
    expect(bySession().get('session_1')?.permissions[0]?.approvalId).toBe('approval_1');
    replaceGlobalBlockingRequestSnapshot('/repo', {
      session: { sessionId: 'session_1', projectId: 'project_1', workspaceId: 'workspace_1', displayPath: '.', rootSessionId: 'session_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '5', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' } },
      cursor: 'epoch_1:5', activeRun: null, branch: { branchId: 'branch_1', branchVersion: '0', leafMessageId: null },
      window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false }, turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
    });
    expect(bySession().has('session_1')).toBe(false);
  });
});
