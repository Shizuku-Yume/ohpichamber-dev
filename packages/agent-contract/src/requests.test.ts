import { describe, expect, test } from 'bun:test';
import { ApprovalDecisionSchema, ApprovalGrantSchema, ApprovalReplySchema, ApprovalRequestSchema, ApprovalResolutionSchema, QuestionReplySchema, QuestionRequestSchema, RequestCASSchema, PlanReviewSchema, PlanReviewResponseSchema } from './requests.ts';

const cas = { version: '1', epoch: 'epoch-1', workerGeneration: 'worker-1' };
const pendingApproval = {
  ...cas,
  approvalId: 'approval-1',
  sessionId: 'session-1',
  turnId: 'turn-1',
  toolCallId: 'call-1',
  toolName: 'bash',
  actionType: 'bash_command',
  commandSummary: 'ls -la',
  details: { command: 'ls', args: ['-la'] },
  status: 'pending',
  requestedAt: 1,
};
const pendingQuestion = {
  ...cas,
  questionId: 'question-1',
  sessionId: 'session-1',
  turnId: 'turn-1',
  prompt: 'Pick a color',
  schema: { type: 'string', enum: ['red', 'blue'] },
  status: 'pending',
  requestedAt: 1,
};

describe('request wire schemas', () => {
  test('accepts a nonterminal form draft reply and inactivity reset without changing terminal invariants', () => {
    expect(QuestionReplySchema.parse({ ...cas, action: 'update', response: { results: [] } })).toMatchObject({ action: 'update' });
    expect(() => QuestionReplySchema.parse({ ...cas, action: 'update' })).toThrow();
    expect(QuestionRequestSchema.parse({ ...pendingQuestion, timeoutResetAt: 2 })).toMatchObject({ status: 'pending', version: '1', timeoutResetAt: 2 });
    expect(() => QuestionRequestSchema.parse({ ...pendingQuestion, timeoutResetAt: -1 })).toThrow();
    expect(() => QuestionRequestSchema.parse({ ...pendingQuestion, response: {} })).toThrow();
  });
  test('form draft revisions advance pending CAS without admitting revised ordinary questions or resolved drafts', () => {
    const revised = { ...pendingQuestion, schema: { type: 'omp.ask', form: true, questions: [] }, version: '2', timeoutResetAt: 2 };
    expect(QuestionRequestSchema.parse(revised)).toEqual(revised);
    expect(() => QuestionRequestSchema.parse({ ...pendingQuestion, version: '2' })).toThrow();
    expect(() => QuestionRequestSchema.parse({ ...revised, timeoutResetAt: undefined })).toThrow();
    expect(() => QuestionRequestSchema.parse({ ...revised, response: {} })).toThrow();
    expect(() => QuestionRequestSchema.parse({ ...revised, resolvedAt: 2 })).toThrow();
    expect(QuestionRequestSchema.parse({ ...revised, status: 'answered', version: '3', response: {}, answeredAt: 3, resolvedAt: 3 })).toMatchObject({ status: 'answered', version: '3' });
  });
  test('round-trips CAS and rejects a non-positive version', () => {
    expect(RequestCASSchema.parse(cas)).toEqual(cas);
    expect(() => RequestCASSchema.parse({ ...cas, version: '0' })).toThrow();
  });

  test('round-trips exactly the four approval decisions and replies', () => {
    const decisions = [
      { decision: 'approve' },
      { decision: 'reject' },
      { decision: 'always-allow', policyScope: 'session' },
      { decision: 'always-deny', policyScope: 'workspace' },
    ] as const;
    for (const decision of decisions) {
      expect(ApprovalDecisionSchema.parse(decision)).toEqual(decision);
      const reply = { ...cas, ...decision };
      expect(ApprovalReplySchema.parse(reply)).toEqual(reply);
    }
    expect(() => ApprovalDecisionSchema.parse({ decision: 'always-allow', policyScope: 'workspace' })).toThrow();
    expect(() => ApprovalReplySchema.parse({ ...cas, decision: 'always-deny', policyScope: 'session' })).toThrow();
  });

  test('round-trips committed approval resolutions with their fixed scopes', () => {
    const resolutions = [
      { decision: 'approve' },
      { decision: 'reject' },
      { decision: 'always-allow', policy: { policyId: 'policy-allow', revision: '1', persistence: 'committed', scope: 'session' } },
      { decision: 'always-deny', policy: { policyId: 'policy-deny', revision: '1', persistence: 'committed', scope: 'workspace' } },
    ] as const;
    for (const resolution of resolutions) {
      expect(ApprovalResolutionSchema.parse(resolution)).toEqual(resolution);
    }
    expect(() => ApprovalResolutionSchema.parse({
      decision: 'always-allow',
      policy: { policyId: 'policy-allow', revision: '1', persistence: 'committed', scope: 'workspace' },
    })).toThrow();
    expect(() => ApprovalResolutionSchema.parse({
      decision: 'always-deny',
      policy: { policyId: 'policy-deny', revision: '1', persistence: 'pending', scope: 'workspace' },
    })).toThrow();
  });

  test('round-trips pending and terminal approval requests with matching resolution', () => {
    expect(ApprovalRequestSchema.parse(pendingApproval)).toEqual(pendingApproval);
    expect(() => ApprovalRequestSchema.parse({ ...pendingApproval, version: '2' })).toThrow();
    expect(() => ApprovalRequestSchema.parse({ ...pendingApproval, resolution: { decision: 'approve' } })).toThrow();

    const terminalApproval = {
      ...pendingApproval,
      version: '2',
      status: 'approved',
      resolvedAt: 2,
      resolvedBy: 'user-1',
      policyTarget: { toolName: 'bash', pattern: 'ls -la' },
      resolution: {
        decision: 'always-allow',
        policy: { policyId: 'policy-allow', revision: '1', persistence: 'committed', scope: 'session' },
      },
    };
    expect(ApprovalRequestSchema.parse(terminalApproval)).toEqual(terminalApproval);
    expect(ApprovalResolutionSchema.parse(terminalApproval.resolution)).toEqual(terminalApproval.resolution);
    expect(() => ApprovalRequestSchema.parse({ ...terminalApproval, status: 'rejected' })).toThrow();
    expect(() => ApprovalRequestSchema.parse({ ...terminalApproval, status: 'approved', resolution: { decision: 'reject' } })).toThrow();
    expect(() => ApprovalRequestSchema.parse({ ...terminalApproval, policyTarget: undefined })).toThrow();
  });

  test('round-trips question answers including null and forbids response on cancel', () => {
    const cancel = { ...cas, action: 'cancel' };
    const answer = { ...cas, action: 'answer', response: null };
    expect(QuestionReplySchema.parse(cancel)).toEqual(cancel);
    expect(QuestionReplySchema.parse(answer)).toEqual(answer);
    expect(() => QuestionReplySchema.parse({ ...cancel, response: null })).toThrow();
    expect(() => QuestionReplySchema.parse({ ...cas, action: 'respond', response: null })).toThrow();

    expect(QuestionRequestSchema.parse(pendingQuestion)).toEqual(pendingQuestion);
    const answeredQuestion = {
      ...pendingQuestion,
      version: '2',
      status: 'answered',
      response: null,
      answeredAt: 2,
      resolvedAt: 3,
      resolvedBy: 'user-1',
    };
    expect(QuestionRequestSchema.parse(answeredQuestion)).toEqual(answeredQuestion);
    expect(() => QuestionRequestSchema.parse({ ...answeredQuestion, status: 'cancelled' })).toThrow();
    expect(() => QuestionRequestSchema.parse({ ...pendingQuestion, status: 'waiting' })).toThrow();
  });
});

const review = { type: 'plan-review', title: 'Implement review', planReference: 'local://review-plan.md', planText: '# Review\nImplement the plan.' };
const pending = {
  questionId: 'question', sessionId: 'session', turnId: 'turn', prompt: review.title, schema: review,
  status: 'pending', version: '1', epoch: 'epoch', workerGeneration: 'worker', requestedAt: 1
};

test('plan review is a reconnectable canonical question containing only a local plan reference', () => {
  expect(PlanReviewSchema.parse(review)).toEqual(review);
  expect(QuestionRequestSchema.parse(pending)).toEqual(pending);
  for (const planReference of ['/host/plan.md', 'file:///host/plan.md', 'local://', 'local://../plan.md', 'local://bad\\plan.md', 'local://bad path']) {
    expect(QuestionRequestSchema.safeParse({ ...pending, schema: { ...review, planReference } }).success).toBe(false);
  }
  expect(QuestionRequestSchema.safeParse({ ...pending, schema: { ...review, hostPath: '/host/plan.md' } }).success).toBe(false);
});

test('plan review actions reject malformed feedback and preserve terminal question invariants', () => {
  for (const response of [{ action: 'approve' }, { action: 'approve-compact' }, { action: 'reject' }, { action: 'feedback', feedback: 'Revise step two' }]) {
    expect(PlanReviewResponseSchema.parse(response)).toEqual(response);
    expect(QuestionRequestSchema.safeParse({ ...pending, status: 'answered', version: '2', response, answeredAt: 2, resolvedAt: 2 }).success).toBe(true);
  }
  for (const response of [{ action: 'feedback' }, { action: 'feedback', feedback: '  ' }, { action: 'approve', feedback: 'extra' }, { action: 'execute' }, { results: [] }]) {
    expect(PlanReviewResponseSchema.safeParse(response).success).toBe(false);
    expect(QuestionRequestSchema.safeParse({ ...pending, status: 'answered', version: '2', response, answeredAt: 2, resolvedAt: 2 }).success).toBe(false);
  }
  expect(QuestionRequestSchema.safeParse({ ...pending, status: 'expired', version: '2', resolvedAt: 2 }).success).toBe(true);
});

test('approval grant schema validates tool grants with toolName and input or legacy command', () => {
  const grant = {
    approvalId: 'app-1',
    toolCallId: 'call-1',
    rootSessionId: 'session-1',
    workerGeneration: 'gen-1',
    epoch: 'epoch-1',
    command: 'echo hi',
    toolName: 'bash',
    input: { command: 'echo hi' },
  };
  expect(ApprovalGrantSchema.parse(grant)).toEqual(grant);
  const toolGrant = {
    approvalId: 'app-2',
    toolCallId: 'call-2',
    rootSessionId: 'session-1',
    workerGeneration: 'gen-1',
    epoch: 'epoch-1',
    toolName: 'eval',
    input: { code: '1 + 1' },
  };
  expect(ApprovalGrantSchema.parse(toolGrant)).toEqual(toolGrant);
});
