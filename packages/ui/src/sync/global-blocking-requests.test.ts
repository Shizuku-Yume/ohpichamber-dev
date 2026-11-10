import { beforeEach, describe, expect, test } from 'bun:test';
<<<<<<< HEAD
import type { ApprovalRequest, CanonicalEvent, QuestionRequest } from '@openchamber/agent-contract';
import { applyGlobalBlockingRequestEvents, replaceGlobalBlockingRequestSnapshot, resetGlobalBlockingRequests, seedGlobalBlockingRequests, useGlobalBlockingRequestsStore } from './global-blocking-requests';
const approval = (approvalId: string, sessionId: string): ApprovalRequest => ({ version: '1', epoch: 'epoch_1', workerGeneration: 'worker_1', approvalId, sessionId, turnId: 'turn_1', toolCallId: `tool_${approvalId}`, toolName: 'bash', actionType: 'bash_command', commandSummary: 'ls', details: {}, status: 'pending', requestedAt: 1 });
const question = (questionId: string, sessionId: string): QuestionRequest => ({ version: '1', epoch: 'epoch_1', workerGeneration: 'worker_1', questionId, sessionId, turnId: 'turn_1', prompt: 'Continue?', status: 'pending', requestedAt: 1 });
const event = (type: CanonicalEvent['type'], fields: Record<string, unknown>): CanonicalEvent => ({ sessionId: String(fields.sessionId ?? 'session_1'), epoch: 'epoch_1', sequence: '1', timestamp: 1, type, ...fields } as CanonicalEvent);
=======
import type { SyncEvent } from '@/lib/opencode/events';
import {
  applyGlobalBlockingRequestEvents,
  applyWaitingPageEvent,
  resetGlobalBlockingRequests,
  readHostBlockingRequestsSnapshot,
  settledPageKeys,
  useGlobalBlockingRequestsStore,
  type BlockingFormRequest,
  type BlockingPermissionRequest,
} from './global-blocking-requests';
import type { HostSessionStatusSnapshot } from '@/lib/opencode/session-status';

/** A host status read whose pending map is `pending`, as the poller and mobile sheet receive it. */
const hostSnapshot = (pending: NonNullable<HostSessionStatusSnapshot['pending']>) =>
  async (): Promise<HostSessionStatusSnapshot> => ({ sessions: {}, pending, serverTime: 0 });

const permission = (id: string, sessionID: string): BlockingPermissionRequest => ({
  id, sessionID, action: 'bash', resources: ['rm *'],
});
const form = (id: string, sessionID: string): BlockingFormRequest => ({ id, sessionID, title: 'Pick one' });
const permissionAsked = (request: BlockingPermissionRequest): SyncEvent => ({ type: 'permission.asked', properties: request });
const formCreated = (request: BlockingFormRequest): SyncEvent => ({
  type: 'form.created',
  properties: { form: { ...request, fields: [{ key: 'answer', type: 'boolean' }] } },
});
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
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
=======

  test('reports a page the host snapshot settled after its end event was missed, and only that one', async () => {
    const waiting = (sessionID: string, id: string) => ({ type: 'openchamber.page-waiting' as const, properties: { sessionID, directory: '/repo', page: { id, title: 'Pick' } } });
    applyWaitingPageEvent(waiting('s1', 'call_1'), () => null);
    applyWaitingPageEvent(waiting('s1', 'call_2'), () => null);
    applyWaitingPageEvent(waiting('s2', 'call_3'), () => null);
    const before = bySession();

    await readHostBlockingRequestsSnapshot(hostSnapshot({
      s1: { permissions: [], forms: [], pages: [{ id: 'call_2', sessionID: 's1', title: 'Pick' }] },
      s2: { permissions: [], forms: [], pages: [{ id: 'call_3', sessionID: 's2', title: 'Pick' }] },
    }), () => '/repo');

    expect(settledPageKeys(before, bySession())).toEqual(['s1:call_1']);
  });

  test('tracks asks per session and settles them by request id', () => {
    applyGlobalBlockingRequestEvents('/far/', [permissionAsked(permission('p1', 's1')), formCreated(form('q1', 's1')), permissionAsked(permission('p2', 's2'))]);

    expect(bySession().get('s1')).toEqual({ directory: '/far', permissions: [permission('p1', 's1')], forms: [form('q1', 's1')], pages: [] });
    expect(bySession().get('s2')?.permissions.map((p) => p.id)).toEqual(['p2']);

    applyGlobalBlockingRequestEvents('/far', [
      { type: 'permission.replied', properties: { sessionID: 's1', requestID: 'p1' } },
      { type: 'form.settled', properties: { sessionID: 's1', formID: 'q1' } },
    ]);
    expect(bySession().has('s1')).toBe(false);
    expect(bySession().has('s2')).toBe(true);
  });

  test('a reply without a request id settles that kind for the session, and deletion clears it', () => {
    applyGlobalBlockingRequestEvents('/far', [permissionAsked(permission('p1', 's1')), permissionAsked(permission('p2', 's1')), formCreated(form('q1', 's1'))]);
    // OpenCode may omit the request id on a reply; the reducer then settles the whole kind.
    applyGlobalBlockingRequestEvents('/far', [{ type: 'permission.replied', properties: { sessionID: 's1', requestID: '' } }]);
    expect(bySession().get('s1')?.permissions).toEqual([]);
    expect(bySession().get('s1')?.forms.map((q) => q.id)).toEqual(['q1']);

    applyGlobalBlockingRequestEvents('/far', [{ type: 'session.deleted', properties: { sessionID: 's1' } }]);
    expect(bySession().has('s1')).toBe(false);
  });

  // The tray decides whether to offer "Allow always" from this flag, so an ask
  // that carries save patterns must keep them across the index (#4698).
  test('carries the save patterns an ask arrives with, and omits them when it has none', () => {
    const savable: BlockingPermissionRequest = { id: 'p1', sessionID: 's1', action: 'bash', resources: ['git *'], save: ['git *'] };
    const oneOff: BlockingPermissionRequest = { id: 'p2', sessionID: 's2', action: 'bash', resources: ['rm *'] };
    applyGlobalBlockingRequestEvents('/far', [permissionAsked(savable), permissionAsked(oneOff)]);

    expect(bySession().get('s1')?.permissions[0]?.save).toEqual(['git *']);
    expect(bySession().get('s2')?.permissions[0]?.save).toBeUndefined();
  });

  test('repeated and unrelated events do not publish', () => {
    applyGlobalBlockingRequestEvents('/far', [permissionAsked(permission('p1', 's1'))]);
    const before = bySession();
    applyGlobalBlockingRequestEvents('/far', [
      { type: 'session.status', properties: { sessionID: 's1', status: { type: 'busy' } } },
      { type: 'permission.replied', properties: { sessionID: 'other', requestID: 'nope' } },
    ]);
    expect(bySession()).toBe(before);

    // OpenCode re-sends an unanswered ask; an identical repeat is a no-op.
    applyGlobalBlockingRequestEvents('/far', [permissionAsked(permission('p1', 's1')), formCreated(form('q1', 's1'))]);
    const withForm = bySession();
    applyGlobalBlockingRequestEvents('/far', [permissionAsked(permission('p1', 's1')), formCreated(form('q1', 's1'))]);
    expect(bySession()).toBe(withForm);
  });

  test('seeding adds only sessions without live entries and never clears', async () => {
    applyGlobalBlockingRequestEvents('/far', [permissionAsked(permission('p1', 's1'))]);
    applyGlobalBlockingRequestEvents('/far', [{ type: 'permission.replied', properties: { sessionID: 's1', requestID: 'p1' } }]);

    await readHostBlockingRequestsSnapshot(hostSnapshot({
      s2: { permissions: [permission('p2', 's2')], forms: [], pages: [] },
      s3: { permissions: [], forms: [], pages: [] },
    }), () => '/other');
    expect([...bySession().keys()]).toEqual(['s2']);

    // A later seed cannot resurrect a settled request or override a live entry.
    await readHostBlockingRequestsSnapshot(hostSnapshot({ s2: { permissions: [permission('p9', 's2')], forms: [], pages: [] } }), () => '/elsewhere');
    expect(bySession().get('s2')?.permissions.map((p) => p.id)).toEqual(['p2']);
    await readHostBlockingRequestsSnapshot(hostSnapshot({}), () => '/other');
    expect(bySession().has('s2')).toBe(true);
>>>>>>> bc50ba56a
  });
});
