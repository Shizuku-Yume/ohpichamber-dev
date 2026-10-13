import { describe, expect, test } from 'bun:test';
import { ApprovalRequestSchema } from '@openchamber/agent-contract';
import type { ApprovalReply, QuestionReply } from '@openchamber/agent-contract';
import type { ProjectionInput } from '../projection/protocol.ts';
import type { WorkerInteraction, WorkerOperation } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
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

  test('a stale approval version returns the authorized current record without resolving it', async () => {
    const { manager } = sessionHarness();
    manager.onRequest('session-1', 'worker-1', approval);
    try {
      await expect(manager.resolveApproval('session-1', 'approval-1', {
        decision: 'approve', version: '99', epoch: 'epoch-1', workerGeneration: 'worker-1',
      })).rejects.toMatchObject({ status: 409, code: 'APPROVAL_CONFLICT', details: {
        expectedVersion: '99', actualVersion: '1', currentRecord: {
          approvalId: 'approval-1', sessionId: 'session-1', version: '1', status: 'pending',
        },
      } });
      expect(manager.approvals('session-1')[0]?.status).toBe('pending');
    } finally { manager.closeSession('session-1'); }
  });

  test('a worker generation change expires old handles and rejects stale replies', async () => {
    const { manager, events } = sessionHarness();
    manager.onRequest('session-1', 'worker-1', approval);
    manager.openSession('session-1', 'epoch-2', 'worker-2', 'workspace-1', async () => {}, input => { events.push(input); });
    const stale: ApprovalReply = { decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
    await expect(manager.resolveApproval('session-1', 'approval-1', stale)).rejects.toMatchObject({ status: 410, code: 'APPROVAL_EXPIRED' });
    await expect(manager.resolveApproval('session-1', 'unknown-approval', stale)).rejects.toMatchObject({ status: 410, code: 'APPROVAL_EXPIRED' });
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
    await expect(manager.resolveQuestion('session-1', 'question-1', {
      action: 'answer', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1', response: {
        results: [
          { id: 'colors', selectedOptions: [] },
          { id: 'note', selectedOptions: ['Other'], customInput: 'both' },
        ],
      },
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
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
    await expect(manager.resolveQuestion('session-1', 'question-1', cancel)).rejects.toMatchObject({ code: 'QUESTION_CONFLICT', details: {
      expectedVersion: '1', actualVersion: '2', currentRecord: { questionId: 'question-1', status: 'cancelled', version: '2' },
    } });
    manager.closeSession('session-1');
    manager.closeSession('session-2');
  });

  test('an unanswered request expires when its timeout elapses and rejects late replies', async () => {
    const dispatched = Promise.withResolvers<WorkerOperation>();
    const events: ProjectionInput[] = [];
    const manager = new InteractionManager(10);
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => { dispatched.resolve(operation); }, input => { events.push(input); });
    manager.onRequest('session-1', 'worker-1', approval);
    expect(await dispatched.promise).toEqual({ type: 'approval.resolve', approvalId: 'approval-1', decision: 'reject' });
    expect(manager.approvals('session-1')).toHaveLength(0);
    expect(events.at(-1)?.event).toMatchObject({ type: 'approval.resolved', approval: { approvalId: 'approval-1', status: 'expired', version: '2' } });
    await expect(manager.resolveApproval('session-1', 'approval-1', { decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' })).rejects.toMatchObject({ status: 410, code: 'APPROVAL_EXPIRED' });
    manager.closeSession('session-1');
  });

  test('projects public approval requests without exposing private paths, credentials, or raw native inputs', async () => {
    let committedTarget: { toolName: string; pattern: string } | undefined;
    const events: ProjectionInput[] = [];
    const operations: WorkerOperation[] = [];
    const secondDispatch = Promise.withResolvers<WorkerOperation>();
    const secondResolved = Promise.withResolvers<ProjectionInput>();
    const manager = new InteractionManager(60_000, async write => {
      committedTarget = write.target;
      return { policyId: 'policy-1', revision: '1' };
    });
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async op => {
      operations.push(op);
      if (op.type === 'approval.resolve' && op.approvalId === 'approval-sec-2') secondDispatch.resolve(op);
    }, input => {
      events.push(input);
      if (input.event.type === 'approval.resolved' && input.event.approval.approvalId === 'approval-sec-2') secondResolved.resolve(input);
    });

    const credentialMarker = 'super-secret-token-12345';
    const privateRootMarker = '/private/root/secret-workspace';
    const rawInput = {
      command: `${privateRootMarker}/bin/tool --token ${credentialMarker}`,
      token: credentialMarker,
      workspacePath: `${privateRootMarker}/config.json`,
    };
    const privateTarget = { toolName: 'bash', pattern: JSON.stringify(rawInput) };

    const privateApproval: WorkerInteraction = {
      kind: 'approval',
      approvalId: 'approval-sec-1',
      toolCallId: 'call-sec-1',
      toolName: 'bash',
      actionType: 'bash_command',
      commandSummary: `Execute ${privateRootMarker}/bin/tool --token ${credentialMarker}`,
      details: {
        reason: `Need access to ${privateRootMarker} with ${credentialMarker}`,
        options: ['Approve', 'Deny'],
        approvalMode: 'prompt',
        input: rawInput,
      },
      policyTarget: privateTarget,
      turnId: 'turn-1',
    };

    manager.onRequest('session-1', 'worker-1', privateApproval);

    const list = manager.approvals('session-1');
    expect(list).toHaveLength(1);
    const serializedList = JSON.stringify(list);
    expect(serializedList.includes(credentialMarker)).toBe(false);
    expect(serializedList.includes(privateRootMarker)).toBe(false);
    expect(list[0]?.details).not.toHaveProperty('input');

    let conflictError: ProjectionError | undefined;
    try {
      await manager.resolveApproval('session-1', 'approval-sec-1', {
        decision: 'approve',
        version: '99',
        epoch: 'epoch-1',
        workerGeneration: 'worker-1',
      });
      expect.unreachable('Should have thrown 409 conflict');
    } catch (err) {
      if (err instanceof ProjectionError) conflictError = err;
    }
    expect(conflictError).toBeDefined();
    expect(conflictError?.status).toBe(409);
    expect(conflictError?.code).toBe('APPROVAL_CONFLICT');
    const serializedConflict = JSON.stringify(conflictError?.details);
    expect(serializedConflict.includes(credentialMarker)).toBe(false);
    expect(serializedConflict.includes(privateRootMarker)).toBe(false);
    const currentRecord = ApprovalRequestSchema.parse(conflictError?.details?.currentRecord);
    expect(currentRecord.details).not.toHaveProperty('input');

    const resolved = await manager.resolveApproval('session-1', 'approval-sec-1', {
      decision: 'always-allow',
      policyScope: 'session',
      version: '1',
      epoch: 'epoch-1',
      workerGeneration: 'worker-1',
    });
    expect(resolved.status).toBe('approved');
    expect(committedTarget).toEqual(privateTarget);

    expect(events.length).toBeGreaterThanOrEqual(2);
    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents.includes(credentialMarker)).toBe(false);
    expect(serializedEvents.includes(privateRootMarker)).toBe(false);

    const secondApproval: WorkerInteraction = {
      ...privateApproval,
      approvalId: 'approval-sec-2',
      toolCallId: 'call-sec-2',
    };
    manager.onRequest('session-1', 'worker-1', secondApproval);
    expect(await secondDispatch.promise).toEqual({ type: 'approval.resolve', approvalId: 'approval-sec-2', decision: 'approve' });
    await secondResolved.promise;
    expect(manager.approvals('session-1')).toHaveLength(0);
    expect(events.at(-1)?.event).toMatchObject({ type: 'approval.resolved', approval: { approvalId: 'approval-sec-2', status: 'approved' } });
    expect(committedTarget).toEqual(privateTarget);
    manager.closeSession('session-1');
  });

  test('an approved native command is available during dispatch, bound to exact input, and consumed once', async () => {
    const input = { command: 'printf approved' };
    const target = { toolName: 'bash', pattern: JSON.stringify(input) };
    let manager: InteractionManager;
    const consumed: unknown[] = [];
    manager = new InteractionManager(60_000);
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => {
      if (operation.type !== 'approval.resolve') throw new Error('Unexpected dispatch');
      expect(manager.consumeApprovalGrant('other-session', 'worker-1', operation.approvalId, 'call-1', 'bash', input)).toBeUndefined();
      expect(manager.consumeApprovalGrant('session-1', 'worker-2', operation.approvalId, 'call-1', 'bash', input)).toBeUndefined();
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'other-call', 'bash', input)).toBeUndefined();
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-1', 'bash', { command: 'printf other' })).toBeUndefined();
      consumed.push(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-1', 'bash', input));
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-1', 'bash', input)).toBeUndefined();
    }, () => {});
    try {
      manager.onRequest('session-1', 'worker-1', { ...approval, policyTarget: target });
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', 'approval-1', 'call-1', 'bash', input)).toBeUndefined();
      const resolved = await manager.resolveApproval('session-1', 'approval-1', { decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' });
      expect(resolved.status).toBe('approved');
      expect(consumed).toEqual([{ approvalId: 'approval-1', toolCallId: 'call-1', rootSessionId: 'session-1', workerGeneration: 'worker-1', epoch: 'epoch-1', command: input.command }]);
    } finally { manager.closeSession('session-1'); }
  });

  test('rejection, invalidation and failed native dispatch never leave execution consent', async () => {
    const input = { command: 'printf denied' };
    for (const scenario of ['reject', 'invalidate', 'dispatch-failed'] as const) {
      const manager = new InteractionManager(60_000);
      manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async () => { if (scenario === 'dispatch-failed') throw new Error('Native handle disappeared'); }, () => {});
      try {
        manager.onRequest('session-1', 'worker-1', { ...approval, policyTarget: { toolName: 'bash', pattern: JSON.stringify(input) } });
        const resolving = manager.resolveApproval('session-1', 'approval-1', { decision: scenario === 'reject' ? 'reject' : 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' });
        if (scenario === 'dispatch-failed') await expect(resolving).rejects.toThrow('Native handle disappeared');
        else await resolving;
        if (scenario === 'invalidate') manager.openSession('session-1', 'epoch-2', 'worker-2', 'workspace-1', async () => {}, () => {});
        expect(manager.consumeApprovalGrant('session-1', 'worker-1', 'approval-1', 'call-1', 'bash', input)).toBeUndefined();
      } finally { manager.closeSession('session-1'); }
    }
  });


});
