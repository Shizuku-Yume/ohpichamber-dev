import { describe, expect, test, vi } from 'bun:test';
import { ApprovalRequestSchema, QuestionRequestSchema } from '@openchamber/agent-contract';
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

const planReview: WorkerInteraction = {
  kind: 'question', questionId: 'plan-review', turnId: 'turn-1', prompt: 'Review plan',
  schema: { type: 'plan-review', title: 'Review plan', planReference: 'local://review-plan.md', planText: '# Plan\nImplement review.' }
};

test('plan reviews retain reconnect recovery and validate all actions under the existing CAS', async () => {
  for (const response of [{ action: 'approve' }, { action: 'approve-compact' }, { action: 'reject' }, { action: 'feedback', feedback: 'Revise step two' }]) {
    const { manager, events, operations } = sessionHarness();
    try {
      manager.onRequest('session-1', 'worker-1', planReview);
      manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => { operations.push(operation); }, event => { events.push(event); });
      expect(manager.questions('session-1')[0]?.schema).toEqual(planReview.schema);
      const cas = { version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
      for (const invalid of [{ action: 'feedback', feedback: ' ' }, { action: 'unknown' }, { results: [] }]) {
        await expect(manager.resolveQuestion('session-1', 'plan-review', { ...cas, action: 'answer', response: invalid })).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
      }
      const reply: QuestionReply = { ...cas, action: 'answer', response };
      const concurrent = await Promise.allSettled([manager.resolveQuestion('session-1', 'plan-review', reply), manager.resolveQuestion('session-1', 'plan-review', reply)]);
      expect(concurrent.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(concurrent.filter(result => result.status === 'rejected')).toMatchObject([{ reason: { code: 'QUESTION_CONFLICT' } }]);
      expect(operations).toEqual([{ type: 'question.resolve', questionId: 'plan-review', action: 'answer', response }]);
      expect(events.at(-1)?.event).toMatchObject({ type: 'question.resolved', question: { status: 'answered', version: '2', response } });
    } finally { manager.closeSession('session-1'); }
  }
});

test('plan review expires fail-closed and generation changes cannot revive it', async () => {
  const dispatched = Promise.withResolvers<WorkerOperation>();
  const manager = new InteractionManager(10);
  manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => { dispatched.resolve(operation); }, () => { });
  try {
    manager.onRequest('session-1', 'worker-1', planReview);
    expect(await dispatched.promise).toEqual({ type: 'question.resolve', questionId: 'plan-review', action: 'cancel' });
    expect(manager.questions('session-1')).toEqual([]);
    await expect(manager.resolveQuestion('session-1', 'plan-review', { action: 'answer', response: { action: 'approve' }, version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' })).rejects.toMatchObject({ code: 'QUESTION_EXPIRED' });
  } finally { manager.closeSession('session-1'); }
  const next = sessionHarness();
  try {
    next.manager.onRequest('session-1', 'worker-1', planReview);
    next.manager.openSession('session-1', 'epoch-2', 'worker-2', 'workspace-1', async () => { }, () => { });
    await expect(next.manager.resolveQuestion('session-1', 'plan-review', { action: 'answer', response: { action: 'approve' }, version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' })).rejects.toMatchObject({ code: 'QUESTION_EXPIRED' });
    expect(next.manager.questions('session-1')).toEqual([]);
    expect(next.operations).toEqual([]);
  } finally { next.manager.closeSession('session-1'); }
});

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
      })).rejects.toMatchObject({
        status: 409, code: 'APPROVAL_CONFLICT', details: {
          expectedVersion: '99', actualVersion: '1', currentRecord: {
            approvalId: 'approval-1', sessionId: 'session-1', version: '1', status: 'pending',
          },
        }
      });
      expect(manager.approvals('session-1')[0]?.status).toBe('pending');
    } finally { manager.closeSession('session-1'); }
  });
  test('steering cancel revokes pending approval, clears pending handles, and rejects later resolution', async () => {
    const { manager, events, operations } = sessionHarness();
    try {
      manager.onRequest('session-1', 'worker-1', approval);
      expect(manager.approvals('session-1')).toHaveLength(1);
      expect(manager.approvals('session-1')[0]?.status).toBe('pending');

      // Worker sends steering cancellation
      manager.onRequest('session-1', 'worker-1', { kind: 'cancel', approvalId: 'approval-1' });

      // Approval handle is removed from pending approvals
      expect(manager.approvals('session-1')).toHaveLength(0);

      // Event is published to the journal with revoked status
      expect(events.at(-1)?.event).toMatchObject({
        type: 'approval.resolved',
        approval: { approvalId: 'approval-1', status: 'revoked', version: '2' },
      });

      // No dispatch to worker
      expect(operations).toHaveLength(0);

      // Late resolution attempts fail-closed with APPROVAL_CONFLICT and reveal the revoked record
      const reply: ApprovalReply = { decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
      await expect(manager.resolveApproval('session-1', 'approval-1', reply)).rejects.toMatchObject({
        status: 409,
        code: 'APPROVAL_CONFLICT',
        details: {
          expectedVersion: '1',
          actualVersion: '2',
          currentRecord: { approvalId: 'approval-1', status: 'revoked', version: '2' },
        },
      });

      // Cannot consume execution grant
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', 'approval-1', 'call-1', 'bash', { command: 'bun test' })).toBeUndefined();
    } finally {
      manager.closeSession('session-1');
    }
  });


  test('a worker generation change expires old handles and rejects stale replies', async () => {
    const { manager, events } = sessionHarness();
    manager.onRequest('session-1', 'worker-1', approval);
    manager.openSession('session-1', 'epoch-2', 'worker-2', 'workspace-1', async () => { }, input => { events.push(input); });
    const stale: ApprovalReply = { decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
    await expect(manager.resolveApproval('session-1', 'approval-1', stale)).rejects.toMatchObject({ status: 410, code: 'APPROVAL_EXPIRED' });
    await expect(manager.resolveApproval('session-1', 'unknown-approval', stale)).rejects.toMatchObject({ status: 410, code: 'APPROVAL_EXPIRED' });
    expect(events.at(-1)?.event).toMatchObject({ type: 'approval.resolved', approval: { status: 'expired' } });
  });

  test('multi-question choice and freeform answers validate before resolving', async () => {
    const { manager, events } = sessionHarness();
    const question: WorkerInteraction = {
      kind: 'question', questionId: 'question-1', turnId: 'turn-1', prompt: 'Choose', timeout: 10, schema: {
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
  test('restart while a deny policy commit waits cannot revive the old native handle', async () => {
    const committed = Promise.withResolvers<{ policyId: string; revision: string }>();
    const events: ProjectionInput[] = [];
    const manager = new InteractionManager(60_000, () => committed.promise);
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async () => { throw new Error('Old handle must not be dispatched'); }, event => events.push(event));
    manager.onRequest('session-1', 'worker-1', approval);
    const reply: ApprovalReply = { decision: 'always-deny', policyScope: 'workspace', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
    const resolving = manager.resolveApproval('session-1', 'approval-1', reply);
    manager.openSession('session-1', 'epoch-2', 'worker-2', 'workspace-1', async () => { }, event => events.push(event));
    committed.resolve({ policyId: 'policy-1', revision: '1' });
    await expect(resolving).rejects.toMatchObject({ status: 410, code: 'APPROVAL_EXPIRED' });
    expect(events.filter(event => event.event.type === 'approval.resolved')).toHaveLength(1);
    expect(events.at(-1)?.event).toMatchObject({ type: 'approval.resolved', approval: { status: 'expired', version: '2' } });
    manager.closeSession('session-1');
  });

  test('policy persistence failure keeps the request pending for an ordinary decision', async () => {
    const manager = new InteractionManager(60_000, async () => { throw new Error('Disk full'); });
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async () => { }, () => { });
    manager.onRequest('session-1', 'worker-1', approval);
    await expect(manager.resolveApproval('session-1', 'approval-1', { decision: 'always-deny', policyScope: 'workspace', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' })).rejects.toMatchObject({ code: 'APPROVAL_POLICY_WRITE_FAILED' });
    expect(manager.approvals('session-1')[0]).toMatchObject({ status: 'pending', version: '1' });
    expect((await manager.resolveApproval('session-1', 'approval-1', { decision: 'reject', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' })).status).toBe('rejected');
    manager.closeSession('session-1');
  });

  test('another session cannot answer a question and cancellation is terminal', async () => {
    const { manager } = sessionHarness();
    manager.openSession('session-2', 'epoch-2', 'worker-2', 'workspace-1', async () => { }, () => { });
    manager.onRequest('session-1', 'worker-1', { kind: 'question', questionId: 'question-1', turnId: 'turn-1', prompt: 'Choose', schema: { type: 'omp.ask', questions: [{ id: 'q', question: 'Choose', options: [{ label: 'one' }] }] } });
    await expect(manager.resolveQuestion('session-2', 'question-1', { action: 'cancel', version: '1', epoch: 'epoch-2', workerGeneration: 'worker-2' })).rejects.toMatchObject({ code: 'QUESTION_NOT_FOUND' });
    expect(manager.questions('session-1')).toHaveLength(1);
    const cancel: QuestionReply = { action: 'cancel', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
    expect((await manager.resolveQuestion('session-1', 'question-1', cancel)).status).toBe('cancelled');
    await expect(manager.resolveQuestion('session-1', 'question-1', cancel)).rejects.toMatchObject({
      code: 'QUESTION_CONFLICT', details: {
        expectedVersion: '1', actualVersion: '2', currentRecord: { questionId: 'question-1', status: 'cancelled', version: '2' },
      }
    });
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
  test('expires a question at the forwarded native timeout and rejects its late answer', async () => {
    vi.useFakeTimers();
    try {
      const operations: WorkerOperation[] = [];
      const events: ProjectionInput[] = [];
      const manager = new InteractionManager(60_000);
      manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => { operations.push(operation); }, input => { events.push(input); });
      manager.onRequest('session-1', 'worker-1', { kind: 'question', questionId: 'question-short', turnId: 'turn-1', prompt: 'Choose', timeout: 10, schema: { type: 'omp.ask', questions: [{ id: 'q', options: [{ label: 'yes' }] }] } });
      vi.advanceTimersByTime(10);
      expect(operations).toContainEqual({ type: 'question.resolve', questionId: 'question-short', action: 'cancel' });
      expect(events.at(-1)?.event).toMatchObject({ type: 'question.resolved', question: { questionId: 'question-short', status: 'expired', version: '2' } });
      await expect(manager.resolveQuestion('session-1', 'question-short', { action: 'answer', response: { results: [{ id: 'q', selectedOptions: ['yes'] }] }, version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' })).rejects.toMatchObject({ status: 410, code: 'QUESTION_EXPIRED' });
      manager.closeSession('session-1');
    } finally {
      vi.useRealTimers();
    }
  });


  test('projects safe approval details and keeps always-allow as an ephemeral exact-granted session rule', async () => {
    let committedTarget: { toolName: string; pattern: string } | undefined;
    const events: ProjectionInput[] = [];
    const operations: WorkerOperation[] = [];
    const manager = new InteractionManager(60_000, async write => {
      committedTarget = write.target;
      return { policyId: 'policy-1', revision: '1' };
    });
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async op => {
      operations.push(op);
    }, input => { events.push(input); });

    const credentialMarker = 'super-secret-token-12345';
    const privateRootMarker = '/private/root/secret-workspace';
    const rawInput = {
      command: `bun test --token ${credentialMarker}`,
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
      commandSummary: rawInput.command,
      details: {
        reason: `Need access with ${credentialMarker}`,
        options: ['Approve', 'Deny'],
        approvalMode: 'prompt',
        input: rawInput,
      },
      policyTarget: privateTarget,
      sessionRuleKey: 'bash',
      turnId: 'turn-1',
    };

    manager.onRequest('session-1', 'worker-1', privateApproval);

    const list = manager.approvals('session-1');
    expect(list).toHaveLength(1);
    expect(list[0]?.toolName).toBe('bash');
    expect(list[0]?.commandSummary).toBe('bun test --token [REDACTED]');
    expect(list[0]?.policyTarget).toEqual({ toolName: 'bash', pattern: '*' });
    expect(list[0]?.details).toEqual({ reason: 'Need access with [REDACTED]', command: 'bun test --token [REDACTED]' });
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
    expect(resolved.policyTarget).toEqual({ toolName: 'bash', pattern: '*' });
    expect(resolved.resolution).toEqual({ decision: 'always-allow', policy: { scope: 'session', persistence: 'ephemeral' } });
    expect(committedTarget).toBeUndefined();
    expect(operations.at(-1)).toEqual({ type: 'approval.resolve', approvalId: 'approval-sec-1', decision: 'approve-always' });

    expect(events.length).toBeGreaterThanOrEqual(2);
    const serializedEvents = JSON.stringify(events);
    expect(serializedEvents.includes(credentialMarker)).toBe(false);
    expect(serializedEvents.includes(privateRootMarker)).toBe(false);

    const secondInput = { command: 'bun test' };
    const secondApproval: WorkerInteraction = {
      ...privateApproval,
      approvalId: 'approval-sec-2',
      toolCallId: 'call-sec-2',
      commandSummary: 'bun test',
      details: { options: ['Approve', 'Deny'] },
      policyTarget: { toolName: 'bash', pattern: JSON.stringify(secondInput) },
    };
    const eventCount = events.length;
    manager.onRequest('session-1', 'worker-1', secondApproval);
    // The worker owns the native allow_always cache; a request that reaches the
    // Host is always a fresh card, never an implicit approval.
    expect(manager.approvals('session-1')).toHaveLength(1);
    expect(events).toHaveLength(eventCount + 1);
    expect(committedTarget).toBeUndefined();

    manager.openSession('session-1', 'epoch-1', 'worker-2', 'workspace-1', async () => { }, input => { events.push(input); });
    manager.onRequest('session-1', 'worker-2', { ...secondApproval, approvalId: 'approval-sec-3', toolCallId: 'call-sec-3' });
    expect(manager.approvals('session-1')).toHaveLength(1);
    manager.closeSession('session-1');
  });

  test('ordinary approvals never permit a session allowance', async () => {
    const events: ProjectionInput[] = [];
    const manager = new InteractionManager(60_000);
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async () => { }, input => { events.push(input); });
    manager.onRequest('session-1', 'worker-1', {
      ...approval, approvalId: 'approval-plain', toolCallId: 'call-plain', sessionRuleKey: undefined,
    });
    await expect(manager.resolveApproval('session-1', 'approval-plain', {
      decision: 'always-allow', policyScope: 'session', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1',
    })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
    expect(manager.approvals('session-1')).toHaveLength(1);
    manager.closeSession('session-1');
  });

  test('an existing workspace deny closes an ordinary card without a policy target', async () => {
    const { manager, events, operations } = sessionHarness();
    const resolved = Promise.withResolvers<void>();
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => {
      operations.push(operation);
    }, input => {
      events.push(input);
      if (input.event.type === 'approval.resolved') resolved.resolve();
    });
    manager.loadPolicies('session-1', 'workspace-1', [{
      policyId: 'policy-deny', revision: '1', scope: 'workspace', decision: 'deny',
      target: { toolName: 'bash', pattern: 'run tests' },
    }]);
    manager.onRequest('session-1', 'worker-1', approval);
    await resolved.promise;
    expect(manager.approvals('session-1')).toHaveLength(0);
    expect(operations.at(-1)).toEqual({ type: 'approval.resolve', approvalId: 'approval-1', decision: 'reject' });
    expect(events.at(-1)?.event).toMatchObject({ type: 'approval.resolved', approval: { status: 'rejected', resolution: { decision: 'reject' } } });
    manager.closeSession('session-1');
  });

  test('an always-deny reply on an ordinary approval commits safely and terminates', async () => {
    const { manager, events, operations } = sessionHarness();
    manager.onRequest('session-1', 'worker-1', { ...approval, policyTarget: { toolName: 'bash', pattern: '{"command":"bun test"}' } });
    const resolved = await manager.resolveApproval('session-1', 'approval-1', {
      decision: 'always-deny', policyScope: 'workspace', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1',
    });
    expect(resolved.status).toBe('rejected');
    expect(resolved.policyTarget).toEqual({ toolName: 'bash', pattern: 'run tests' });
    expect(resolved.resolution).toMatchObject({ decision: 'always-deny', policy: { scope: 'workspace', persistence: 'committed' } });
    expect(operations.at(-1)).toEqual({ type: 'approval.resolve', approvalId: 'approval-1', decision: 'reject' });
    expect(JSON.stringify(events)).not.toContain('{"command":"bun test"}');
    manager.closeSession('session-1');
  });

  test('native always/once grants are exact, silent, and never persisted', async () => {
    const { manager, events, operations } = sessionHarness();
    const input = { command: 'printf native-grant' };
    const target = { toolName: 'bash', pattern: JSON.stringify(input) };
    const dispatched = Promise.withResolvers<WorkerOperation>();
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => {
      operations.push(operation);
      if (operation.type === 'approval.resolve') {
        expect(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-native', 'bash', input)).toEqual({
          approvalId: 'approval-native', toolCallId: 'call-native', rootSessionId: 'session-1', workerGeneration: 'worker-1', epoch: 'epoch-1', command: input.command, toolName: 'bash', input,
        });
        expect(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-native', 'bash', input)).toBeUndefined();
        dispatched.resolve(operation);
      }
    }, event => { events.push(event); });
    manager.onRequest('session-1', 'worker-1', {
      ...approval, approvalId: 'approval-native', toolCallId: 'call-native', nativeGrant: true,
      details: {}, policyTarget: target,
    });
    expect(events).toEqual([]);
    expect(manager.approvals('session-1')).toEqual([]);
    expect(await dispatched.promise).toEqual({ type: 'approval.resolve', approvalId: 'approval-native', decision: 'approve' });
    manager.closeSession('session-1');
  });

  test('an approved native command is available during dispatch, bound to exact input, and consumed once', async () => {
    const input = { command: 'printf approved' };
    const target = { toolName: 'bash', pattern: JSON.stringify(input) };
    const consumed: unknown[] = [];
    const manager = new InteractionManager(60_000);
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => {
      if (operation.type !== 'approval.resolve') throw new Error('Unexpected dispatch');
      expect(manager.consumeApprovalGrant('other-session', 'worker-1', operation.approvalId, 'call-1', 'bash', input)).toBeUndefined();
      expect(manager.consumeApprovalGrant('session-1', 'worker-2', operation.approvalId, 'call-1', 'bash', input)).toBeUndefined();
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'other-call', 'bash', input)).toBeUndefined();
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-1', 'bash', { command: 'printf other' })).toBeUndefined();
      consumed.push(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-1', 'bash', input));
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-1', 'bash', input)).toBeUndefined();
    }, () => { });
    try {
      manager.onRequest('session-1', 'worker-1', { ...approval, policyTarget: target });
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', 'approval-1', 'call-1', 'bash', input)).toBeUndefined();
      const resolved = await manager.resolveApproval('session-1', 'approval-1', { decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' });
      expect(resolved.status).toBe('approved');
      expect(consumed).toEqual([{ approvalId: 'approval-1', toolCallId: 'call-1', rootSessionId: 'session-1', workerGeneration: 'worker-1', epoch: 'epoch-1', command: input.command, toolName: 'bash', input }]);
    } finally { manager.closeSession('session-1'); }
  });
  test('an approved non-bash tool operation (e.g. eval) is consumed once with toolName and input', async () => {
    const input = { code: '1 + 2' };
    const target = { toolName: 'eval', pattern: JSON.stringify(input) };
    const consumed: unknown[] = [];
    const manager = new InteractionManager(60_000);
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => {
      if (operation.type !== 'approval.resolve') throw new Error('Unexpected dispatch');
      consumed.push(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-eval-1', 'eval', input));
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', operation.approvalId, 'call-eval-1', 'eval', input)).toBeUndefined();
    }, () => { });
    try {
      manager.onRequest('session-1', 'worker-1', {
        ...approval, approvalId: 'approval-eval-1', toolCallId: 'call-eval-1', toolName: 'eval', policyTarget: target,
      });
      expect(manager.consumeApprovalGrant('session-1', 'worker-1', 'approval-eval-1', 'call-eval-1', 'eval', input)).toBeUndefined();
      const resolved = await manager.resolveApproval('session-1', 'approval-eval-1', { decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' });
      expect(resolved.status).toBe('approved');
      expect(consumed).toEqual([{ approvalId: 'approval-eval-1', toolCallId: 'call-eval-1', rootSessionId: 'session-1', workerGeneration: 'worker-1', epoch: 'epoch-1', toolName: 'eval', input }]);
    } finally { manager.closeSession('session-1'); }
  });


  const permissionApproval: WorkerInteraction = {
    ...approval, approvalId: 'permission-1', toolCallId: 'permission-call-1', permissionRequest: true,
    sessionRuleKey: 'bash', policyTarget: { toolName: 'bash', pattern: '{"command":"rm -rf build"}' },
  };

  const authority = (modes: Record<string, 'ask' | 'safety' | 'auto'>, verdict: 'accept' | 'hold' | 'unavailable' = 'accept') => {
    const resolveMode = vi.fn(async (sessionId: string) => modes[sessionId] ?? 'ask');
    const evaluate = vi.fn(async () => verdict);
    return { resolveMode, evaluate };
  };
  const withAuthority = (authorityInput: ReturnType<typeof authority>) => {
    const operations: WorkerOperation[] = [];
    const events: ProjectionInput[] = [];
    const manager = new InteractionManager(60_000, undefined, authorityInput);
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => { operations.push(operation); }, input => { events.push(input); });
    return { manager, operations, events };
  };
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  const runWithSafety = (
    gate: Promise<'accept' | 'hold'>,
    verdict: 'accept' | 'hold' = 'accept',
    afterVerdictMode: 'safety' | 'ask' = 'safety',
  ) => {
    const decisions: { value: 'safety' | 'ask' } = { value: 'safety' };
    const resolveMode = vi.fn(async () => decisions.value);
    const evaluate = vi.fn(async () => {
      decisions.value = afterVerdictMode;
      return verdict === 'accept' ? gate : Promise.resolve('hold');
    });
    const { manager, operations, events } = withAuthority({ resolveMode, evaluate });
    manager.onRequest('session-1', 'worker-1', permissionApproval);
    return { manager, operations, events };
  };

  const settleSafety = async (run: ReturnType<typeof withAuthority>) => {
    await settle();
    return {
      approvals: run.manager.approvals('session-1'),
      requested: run.events.filter(input => input.event.type === 'approval.requested'),
      operations: run.operations,
    };
  };

  test('auto answers the execution gate through CAS and leaves every other card', async () => {
    const { manager, operations, events } = withAuthority(authority({ 'session-1': 'auto' }));
    try {
      manager.onRequest('session-1', 'worker-1', permissionApproval);
      await settle();
      expect(manager.approvals('session-1')).toHaveLength(0);
      expect(operations).toEqual([{ type: 'approval.resolve', approvalId: 'permission-1', decision: 'approve' }]);
      // A request the policy answers itself is never advertised as a user card.
      expect(events.filter(input => input.event.type === 'approval.requested' && input.event.approval.approvalId === 'permission-1')).toHaveLength(0);
      expect(events.filter(input => input.event.type === 'approval.resolved' && input.event.approval.approvalId === 'permission-1')).toHaveLength(0);

      // An extension dialog keeps its card even in auto mode.
      manager.onRequest('session-1', 'worker-1', { ...permissionApproval, approvalId: 'dialog-1', toolCallId: 'dialog-call-1', permissionRequest: undefined });
      // A question always keeps its card.
      manager.onRequest('session-1', 'worker-1', { kind: 'question', questionId: 'q1', turnId: 'turn-1', prompt: 'Pick', schema: { questions: [{ id: 'a', question: 'a', options: [{ label: 'A' }] }] } });
      await settle();
      expect(manager.approvals('session-1')).toHaveLength(1);
      expect(manager.questions('session-1')).toHaveLength(1);
      expect(events.filter(input => input.event.type === 'approval.requested' && input.event.approval.approvalId === 'dialog-1')).toHaveLength(1);
    } finally { manager.closeSession('session-1'); }
  });

  test('ask and a held or unavailable safety verdict keep the card', async () => {
    for (const [mode, verdict] of [['ask', 'accept'], ['safety', 'hold'], ['safety', 'unavailable']] as const) {
      const authorityInput = authority({ 'session-1': mode }, verdict);
      const { manager, operations, events } = withAuthority(authorityInput);
      try {
        manager.onRequest('session-1', 'worker-1', permissionApproval);
        await settle();
        expect(manager.approvals('session-1')).toHaveLength(1);
        // A held request is published exactly once, as the card the user acts on.
        expect(events.filter(input => input.event.type === 'approval.requested')).toHaveLength(1);
        if (mode === 'ask') expect(authorityInput.evaluate).not.toHaveBeenCalled();
        else expect(authorityInput.evaluate).toHaveBeenCalledTimes(1);
        expect(operations).toHaveLength(0);
      } finally { manager.closeSession('session-1'); }
    }
  });

  test('safety publishes only after a hold, and never accepts a downgraded mode', async () => {
    // A pending verdict hides the request: nothing is advertised as a card yet.
    const gate = Promise.withResolvers<'accept' | 'hold'>();
    const held = runWithSafety(gate);
    expect(held.manager.approvals('session-1')).toHaveLength(0);
    gate.resolve('hold');
    // A hold publishes the card the user must answer, exactly once.
    const afterHold = await settleSafety(held);
    expect(afterHold.approvals).toHaveLength(1);
    expect(afterHold.requested).toHaveLength(1);
    expect(afterHold.operations).toHaveLength(0);

    // Switching to ask while the safety net runs leaves the request unpublished.
    const downgraded = runWithSafety(Promise.withResolvers<'accept'>(), 'accept', 'ask');
    const afterDowngrade = await settleSafety(downgraded);
    expect(afterDowngrade.operations).toHaveLength(0);
    expect(afterDowngrade.approvals).toHaveLength(1);

    // A worker replacement during the evaluation cannot approve the stale record.
    const stale = Promise.withResolvers<'accept'>();
    const replacementOps: WorkerOperation[] = [];
    const replacement = new InteractionManager(60_000, undefined, { resolveMode: async () => 'safety', evaluate: async () => stale.promise });
    replacement.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => { replacementOps.push(operation); }, () => { });
    replacement.onRequest('session-1', 'worker-1', permissionApproval);
    replacement.openSession('session-1', 'epoch-2', 'worker-2', 'workspace-1', async operation => { replacementOps.push(operation); }, () => { });
    stale.resolve('accept');
    await settle();
    expect(replacementOps).toEqual([]);
    replacement.closeSession('session-1');
  });

  test('reconsidering pending approvals answers one already waiting on a mode switch', async () => {
    const authorityInput = authority({});
    const { manager, operations } = withAuthority(authorityInput);
    try {
      manager.onRequest('session-1', 'worker-1', permissionApproval);
      await settle();
      expect(manager.approvals('session-1')).toHaveLength(1);
      authorityInput.resolveMode.mockImplementation(async () => 'auto');
      manager.reconsiderPending('session-1');
      await settle();
      expect(operations).toEqual([{ type: 'approval.resolve', approvalId: 'permission-1', decision: 'approve' }]);
      expect(manager.approvals('session-1')).toHaveLength(0);
    } finally { manager.closeSession('session-1'); }
  });

  test('a mode switch and a user reply racing the safety net do not raise an unhandled rejection', async () => {
    const gate = Promise.withResolvers<'accept'>();
    const { manager, events, operations } = withAuthority({ resolveMode: async () => 'safety', evaluate: async () => gate.promise });
    try {
      manager.onRequest('session-1', 'worker-1', permissionApproval);
      // The user answers first; the pending verdict must not resolve twice.
      const userReply = manager.resolveApproval('session-1', 'permission-1', {
        decision: 'reject', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1',
      });
      manager.reconsiderPending('session-1');
      manager.reconsiderPending('session-1');
      gate.resolve('accept');
      await expect(userReply).resolves.toMatchObject({ status: 'rejected' });
      await settle();
      // Exactly one resolution reaches the worker, and the competing safety
      // verdict neither duplicates it nor rejects unhandled.
      expect(operations.filter(operation => operation.type === 'approval.resolve')).toHaveLength(1);
      // The reply landed before the card was announced, so nothing was published
      // and nothing is resolved on the wire; no duplicate CAS attempt either.
      expect(events.filter(input => input.event.type === 'approval.requested')).toHaveLength(0);
      expect(events.filter(input => input.event.type === 'approval.resolved')).toHaveLength(0);
    } finally { manager.closeSession('session-1'); }
  });

  test('a switch to auto supersedes an in-flight safety verdict for the same request', async () => {
    const verdict = Promise.withResolvers<'accept' | 'hold'>();
    const decisions: { value: 'ask' | 'safety' | 'auto' } = { value: 'safety' };
    const resolveMode = vi.fn(async () => decisions.value);
    const evaluate = vi.fn(async () => verdict.promise);
    const operations: WorkerOperation[] = [];
    const events: ProjectionInput[] = [];
    const manager = new InteractionManager(60_000, undefined, { resolveMode, evaluate });
    manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async operation => { operations.push(operation); }, input => { events.push(input); });
    try {
      manager.onRequest('session-1', 'worker-1', permissionApproval);
      await settle();
      // The safety net is still running when the Host switches the session to auto.
      decisions.value = 'auto';
      manager.reconsiderPending('session-1');
      await settle();
      // Auto wins immediately: the old verdict is not allowed to block it.
      expect(operations).toEqual([{ type: 'approval.resolve', approvalId: 'permission-1', decision: 'approve' }]);
      expect(manager.approvals('session-1')).toHaveLength(0);
      // The late verdict must be discarded, not publish or duplicate anything.
      verdict.resolve('hold');
      await settle();
      expect(operations).toHaveLength(1);
      expect(events.filter(input => input.event.type === 'approval.requested' && input.event.approval.approvalId === 'permission-1')).toHaveLength(0);
      expect(events.filter(input => input.event.type === 'approval.resolved' && input.event.approval.approvalId === 'permission-1')).toHaveLength(0);
    } finally { manager.closeSession('session-1'); }
  });

  test('an explicit workspace deny wins over every mode', async () => {
    const { manager, operations } = withAuthority(authority({ 'session-1': 'auto' }));
    manager.loadPolicies('session-1', 'workspace-1', [{
      policyId: 'policy-deny', revision: '1', scope: 'workspace', decision: 'deny',
      target: { toolName: 'bash', pattern: '{"command":"rm -rf build"}' },
    }]);
    try {
      manager.onRequest('session-1', 'worker-1', permissionApproval);
      await settle();
      expect(manager.approvals('session-1')).toHaveLength(0);
      expect(operations).toEqual([{ type: 'approval.resolve', approvalId: 'permission-1', decision: 'reject' }]);
    } finally { manager.closeSession('session-1'); }
  });

  test('rejection, invalidation and failed native dispatch never leave execution consent', async () => {
    const input = { command: 'printf denied' };
    for (const scenario of ['reject', 'invalidate', 'dispatch-failed'] as const) {
      const manager = new InteractionManager(60_000);
      manager.openSession('session-1', 'epoch-1', 'worker-1', 'workspace-1', async () => { if (scenario === 'dispatch-failed') throw new Error('Native handle disappeared'); }, () => { });
      try {
        manager.onRequest('session-1', 'worker-1', { ...approval, policyTarget: { toolName: 'bash', pattern: JSON.stringify(input) } });
        const resolving = manager.resolveApproval('session-1', 'approval-1', { decision: scenario === 'reject' ? 'reject' : 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' });
        if (scenario === 'dispatch-failed') await expect(resolving).rejects.toThrow('Native handle disappeared');
        else await resolving;
        if (scenario === 'invalidate') manager.openSession('session-1', 'epoch-2', 'worker-2', 'workspace-1', async () => { }, () => { });
        expect(manager.consumeApprovalGrant('session-1', 'worker-1', 'approval-1', 'call-1', 'bash', input)).toBeUndefined();
      } finally { manager.closeSession('session-1'); }
    }
  });


});

test('a session rekey moves a pending approval to the minted id it must be answered under', async () => {
  const { manager, operations } = sessionHarness();
  const previousSessionId = 'session-1';
  const sessionId = 'session-minted';
  try {
    manager.onRequest(previousSessionId, 'worker-1', approval);
    expect(manager.approvals(previousSessionId)[0]?.sessionId).toBe(previousSessionId);
    manager.rekey(previousSessionId, sessionId);
    // The Host and the worker only know the minted id after the native branch,
    // so a card left under the retired id is unreachable for the user.
    expect(manager.approvals(previousSessionId)).toEqual([]);
    expect(manager.approvals(sessionId)[0]).toMatchObject({ approvalId: 'approval-1', sessionId });
    const resolved = await manager.resolveApproval(sessionId, 'approval-1', {
      decision: 'approve', version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1',
    });
    // Resolving under the minted id succeeds and returns the request it closed,
    // which proves the card itself moved rather than only a lookup alias.
    expect(resolved).toMatchObject({ approvalId: 'approval-1', sessionId, status: 'approved' });
    expect(operations).toEqual([{ type: 'approval.resolve', approvalId: 'approval-1', decision: 'approve' }]);
  } finally { manager.closeSession(sessionId); }
});

test('a subagent-linked approval keeps its linkage on the canonical record', () => {
  const { manager } = sessionHarness();
  try {
    manager.onRequest('session-1', 'worker-1', {
      ...approval,
      approvalId: 'approval-child', toolCallId: 'call-child',
      subagentId: 'BetaWorker-2', childSessionId: 'child-session-uuid',
    });
    const pending = manager.approvals('session-1');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ approvalId: 'approval-child', sessionId: 'session-1', subagentId: 'BetaWorker-2', childSessionId: 'child-session-uuid' });
    expect(ApprovalRequestSchema.parse(pending[0])).toEqual(pending[0]);
  } finally { manager.closeSession('session-1'); }
});

test('a subagent-linked question keeps its linkage on the canonical record', () => {
  const { manager } = sessionHarness();
  try {
    manager.onRequest('session-1', 'worker-1', {
      kind: 'question', questionId: 'question-child', turnId: 'turn-1', prompt: 'Pick one',
      schema: { type: 'omp.ask', questions: [] },
      subagentId: 'BetaWorker-2', childSessionId: 'child-session-uuid',
    });
    const pending = manager.questions('session-1');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ questionId: 'question-child', sessionId: 'session-1', subagentId: 'BetaWorker-2', childSessionId: 'child-session-uuid' });
    expect(QuestionRequestSchema.parse(pending[0])).toEqual(pending[0]);
  } finally { manager.closeSession('session-1'); }
});
