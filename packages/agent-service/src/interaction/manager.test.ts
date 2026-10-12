import { describe, expect, test } from 'bun:test';
import type { ApprovalReply, QuestionReply } from '@openchamber/agent-contract';
import type { ProjectionInput } from '../projection/protocol.ts';
import type { WorkerInteraction, WorkerOperation } from '../protocol.ts';
import { InteractionManager } from './manager.ts';

function sessionHarness() {
  const events: ProjectionInput[] = [];
  const operations: WorkerOperation[] = [];
  const manager = new InteractionManager(60_000, async () => ({ policyId: 'policy-1', revision: '1' }));
  manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => { operations.push(operation); }, input => { events.push(input); });
  return { manager, events, operations };
}

const approval: WorkerInteraction = {
  kind: 'approval', approvalId: 'approval-1', toolCallId: 'call-1', toolName: 'bash', actionType: 'bash_command',
  commandSummary: 'run tests', details: { command: 'bun test' }, policyTarget: { toolName: 'bash', pattern: 'run tests' }, turnId: 'turn-1',
};

describe('service-owned interaction CAS', () => {
  test('one concurrent approval reply wins and the loser cannot mutate the terminal record', async () => {
    const { manager, events } = sessionHarness();
    manager.onRequest('session-1', 'worker-1', approval);
    const replies: ApprovalReply[] = [
      { decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' },
      { decision: 'reject', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' },
    ];
    const results = await Promise.allSettled(replies.map(reply => manager.resolveApproval('session-1', 'approval-1', reply)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect(manager.approvals('session-1')).toHaveLength(0);
    expect(events.at(-1)?.event).toMatchObject({ type: 'approval.resolved' });
  });

  test('a worker generation change expires old handles and rejects stale replies', async () => {
    const { manager, events } = sessionHarness();
    manager.onRequest('session-1', 'worker-1', approval);
    manager.openSession('session-1', 'epoch-2', 'worker-2', 'workspace-1', async () => {}, input => { events.push(input); });
    const stale: ApprovalReply = { decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
    await expect(manager.resolveApproval('session-1', 'approval-1', stale)).rejects.toMatchObject({ status: 410, code: 'APPROVAL_EXPIRED' });
    expect(events.at(-1)?.event).toMatchObject({ type: 'approval.resolved', approval: { status: 'expired' } });
  });

  test('multi-question choice and freeform answers validate before resolving', async () => {
    const { manager, events } = sessionHarness();
    const question: WorkerInteraction = {
      kind: 'question', questionId: 'question-1', turnId: 'turn-1', prompt: 'Choose', schema: {
        type: 'omp.ask', questions: [
          { id: 'colors', question: 'Colors', options: [{ label: 'red' }, { label: 'blue' }], multi: true },
          { id: 'note', question: 'Note', options: [{ label: 'Other' }] },
        ],
      },
    };
    manager.onRequest('session-1', 'worker-1', question);
    const reply: QuestionReply = {
      action: 'answer', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1', response: {
        results: [
          { id: 'colors', selectedOptions: ['red', 'blue'] },
          { id: 'note', selectedOptions: [], customInput: 'freeform' },
        ],
      },
    };
    const resolved = await manager.resolveQuestion('session-1', 'question-1', reply);
    expect(resolved.status).toBe('answered');
    expect(events.at(-1)?.event).toMatchObject({ type: 'question.resolved' });
  });
  test('restart while a policy commit waits cannot revive the old native handle', async () => {
    const committed = Promise.withResolvers<{ policyId: string; revision: string }>();
    const events: ProjectionInput[] = [];
    const manager = new InteractionManager(60_000, () => committed.promise);
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async () => { throw new Error('Old handle must not be dispatched'); }, event => events.push(event));
    manager.onRequest('session-1', 'worker-1', approval);
    const reply: ApprovalReply = { decision: 'always-allow', policyScope: 'session', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
    const resolving = manager.resolveApproval('session-1', 'approval-1', reply);
    manager.openSession('session-1', 'epoch-2', 'worker-2', 'workspace-1', async () => {}, event => events.push(event));
    committed.resolve({ policyId: 'policy-1', revision: '1' });
    await expect(resolving).rejects.toMatchObject({ status: 410, code: 'APPROVAL_EXPIRED' });
    expect(events.filter(event => event.event.type === 'approval.resolved')).toHaveLength(1);
    expect(events.at(-1)?.event).toMatchObject({ type: 'approval.resolved', approval: { status: 'expired', version: '2' } });
    manager.closeSession('session-1');
  });

  test('policy persistence failure keeps the request pending for an ordinary decision', async () => {
    const manager = new InteractionManager(60_000, async () => { throw new Error('Disk full'); });
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async () => {}, () => {});
    manager.onRequest('session-1', 'worker-1', approval);
    await expect(manager.resolveApproval('session-1', 'approval-1', { decision: 'always-deny', policyScope: 'workspace', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' })).rejects.toMatchObject({ code: 'APPROVAL_POLICY_WRITE_FAILED' });
    expect(manager.approvals('session-1')[0]).toMatchObject({ status: 'pending', version: '1' });
    expect((await manager.resolveApproval('session-1', 'approval-1', { decision: 'reject', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' })).status).toBe('rejected');
    manager.closeSession('session-1');
  });

  test('another session cannot answer a question and cancellation is terminal', async () => {
    const { manager } = sessionHarness();
    manager.openSession('session-2', 'epoch-2', 'worker-2', 'workspace-1', async () => {}, () => {});
    manager.onRequest('session-1', 'worker-1', { kind: 'question', questionId: 'question-1', turnId: 'turn-1', prompt: 'Choose', schema: { type: 'omp.ask', questions: [{ id: 'q', question: 'Choose', options: [{ label: 'one' }] }] } });
    await expect(manager.resolveQuestion('session-2', 'question-1', { action: 'cancel', version: '1', epoch: 'epoch-2', workerGeneration: 'worker-2' })).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    expect(manager.questions('session-1')).toHaveLength(1);
    const cancel: QuestionReply = { action: 'cancel', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
    expect((await manager.resolveQuestion('session-1', 'question-1', cancel)).status).toBe('cancelled');
    await expect(manager.resolveQuestion('session-1', 'question-1', cancel)).rejects.toMatchObject({ code: 'QUESTION_CONFLICT' });
    manager.closeSession('session-1');
    manager.closeSession('session-2');
  });
});
