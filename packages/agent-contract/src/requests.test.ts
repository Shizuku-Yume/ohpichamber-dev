import { describe, expect, test } from 'bun:test';
import { ApprovalDecisionSchema, ApprovalReplySchema, ApprovalRequestSchema, ApprovalResolutionSchema, QuestionReplySchema, QuestionRequestSchema, RequestCASSchema } from './requests.ts';

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
