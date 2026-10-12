import { z } from 'zod';
import {
  ApprovalReplySchema, ApprovalRequestSchema, EntityIdSchema, JsonValueSchema,
  QuestionReplySchema, QuestionRequestSchema,
} from '@openchamber/agent-contract';
import type {
  ApprovalReply, ApprovalRequest, ApprovalResolution, JsonValue, QuestionReply, QuestionRequest,
} from '@openchamber/agent-contract';
import { ProjectionInputSchema } from '../projection/protocol.ts';
import type { ProjectionInput } from '../projection/protocol.ts';
import type { WorkerInteraction, WorkerOperation } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';

type RequestKind = 'approval' | 'question';
type RecordState = { kind: RequestKind; request: ApprovalRequest | QuestionRequest; timer?: ReturnType<typeof setTimeout> };
type SessionState = { epoch: string; generation: string; workspaceId: string; dispatch: (operation: WorkerOperation) => Promise<void>; append: (input: ProjectionInput) => void };

export interface ApprovalPolicyWrite {
  sessionId: string;
  workspaceId: string;
  scope: 'session' | 'workspace';
  decision: 'allow' | 'deny';
  target: { toolName: string; pattern: string };
}
export interface ApprovalPolicyCommit {
  (request: ApprovalPolicyWrite): Promise<{ policyId: string; revision: string }>;
}
export interface ApprovalPolicyRecord {
  policyId: string;
  revision: string;
  scope: 'session' | 'workspace';
  decision: 'allow' | 'deny';
  target: ApprovalPolicyWrite['target'];
}
export interface ApprovalPolicyLoad {
  (request: { sessionId: string; workspaceId: string }): Promise<ApprovalPolicyRecord[]>;
}

const QuestionAnswerSchema = z.strictObject({
  results: z.array(z.strictObject({
    id: z.string().min(1), selectedOptions: z.array(z.string()), customInput: z.string().optional(), note: z.string().optional(),
  })),
});
function increment(version: string): string { return (BigInt(version) + 1n).toString(); }
function terminalResolution(decision: ApprovalReply['decision'], policy: { policyId: string; revision: string } | undefined): ApprovalResolution {
  if (decision === 'approve' || decision === 'reject') return { decision };
  if (!policy) throw new ProjectionError(503, 'APPROVAL_POLICY_WRITE_FAILED', 'Approval policy persistence did not return a committed revision');
  return decision === 'always-allow'
    ? { decision, policy: { ...policy, scope: 'session', persistence: 'committed' } }
    : { decision, policy: { ...policy, scope: 'workspace', persistence: 'committed' } };
}

export class InteractionManager {
  private readonly sessions = new Map<string, SessionState>();
  private readonly records = new Map<string, RecordState>();
  private readonly reservations = new Set<string>();
  private readonly policies = new Map<string, ApprovalPolicyRecord>();

  constructor(private readonly timeoutMs = 300_000, private readonly policyCommit?: ApprovalPolicyCommit) {}

  openSession(sessionId: string, epoch: string, generation: string, workspaceId: string, dispatch: SessionState['dispatch'], append: SessionState['append']): void {
    const prior = this.sessions.get(sessionId);
    if (prior && (prior.epoch !== epoch || prior.generation !== generation)) this.invalidate(sessionId, prior.generation);
    this.sessions.set(sessionId, { epoch, generation, workspaceId, dispatch, append });
  }
  loadPolicies(sessionId: string, workspaceId: string, policies: ApprovalPolicyRecord[]): void {
    for (const policy of policies) this.policies.set(this.policyKey(sessionId, workspaceId, policy.scope, policy.target), policy);
  }

  private policyKey(sessionId: string, workspaceId: string, scope: 'session' | 'workspace', target: ApprovalPolicyWrite['target']): string {
    return JSON.stringify([scope, scope === 'session' ? sessionId : workspaceId, target.toolName, target.pattern]);
  }

  private matchingPolicy(sessionId: string, workspaceId: string, target: ApprovalPolicyWrite['target']): ApprovalPolicyRecord | undefined {
    return this.policies.get(this.policyKey(sessionId, workspaceId, 'workspace', target)) ?? this.policies.get(this.policyKey(sessionId, workspaceId, 'session', target));
  }

  closeSession(sessionId: string): void {
    this.invalidate(sessionId);
    this.sessions.delete(sessionId);
  }

  invalidate(sessionId: string, generation?: string): void {
    const state = this.sessions.get(sessionId);
    if (!state || (generation !== undefined && state.generation !== generation)) return;
    for (const [id, record] of this.records) {
      if (record.request.sessionId !== sessionId || record.request.status !== 'pending') continue;
      clearTimeout(record.timer);
      const expired = this.expire(record.request);
      this.records.set(id, { ...record, request: expired, timer: undefined });
      state.append(ProjectionInputSchema.parse({ timestamp: expired.resolvedAt, event: 'approvalId' in expired ? { type: 'approval.resolved', approval: expired } : { type: 'question.resolved', question: expired } }));
    }
  }

  onRequest(sessionId: string, generation: string, interaction: WorkerInteraction): void {
    const state = this.sessions.get(sessionId);
    if (!state || state.generation !== generation) return;
    const now = Date.now();
    if (interaction.kind === 'approval') {
      const request: ApprovalRequest = ApprovalRequestSchema.parse({
        approvalId: interaction.approvalId, sessionId, turnId: interaction.turnId, toolCallId: interaction.toolCallId,
        toolName: interaction.toolName, actionType: interaction.actionType, commandSummary: interaction.commandSummary,
        details: interaction.details, policyTarget: interaction.policyTarget, status: 'pending', version: '1', epoch: state.epoch,
        workerGeneration: state.generation, requestedAt: now,
      });
      const timer = setTimeout(() => { void this.expirePending(sessionId, request.approvalId); }, this.timeoutMs);
      this.records.set(request.approvalId, { kind: 'approval', request, timer });
      state.append({ timestamp: now, event: { type: 'approval.requested', approval: request } });
      const policy = this.matchingPolicy(sessionId, state.workspaceId, interaction.policyTarget);
      if (policy) {
        const reply: ApprovalReply = policy.decision === 'allow'
          ? { decision: 'always-allow', policyScope: 'session', version: request.version, epoch: request.epoch, workerGeneration: generation }
          : { decision: 'always-deny', policyScope: 'workspace', version: request.version, epoch: request.epoch, workerGeneration: generation };
        void this.resolveApproval(sessionId, request.approvalId, reply).catch(() => {});
      }
      return;
    }
    const request: QuestionRequest = QuestionRequestSchema.parse({
      questionId: interaction.questionId, sessionId, turnId: interaction.turnId, prompt: interaction.prompt, schema: interaction.schema,
      status: 'pending', version: '1', epoch: state.epoch, workerGeneration: state.generation, requestedAt: now,
    });
    const timer = setTimeout(() => { void this.expirePending(sessionId, request.questionId); }, this.timeoutMs);
    this.records.set(request.questionId, { kind: 'question', request, timer });
    state.append({ timestamp: now, event: { type: 'question.requested', question: request } });
  }

  approvals(sessionId: string): ApprovalRequest[] {
    return [...this.records.values()].flatMap(record => record.request.sessionId === sessionId && record.kind === 'approval' && record.request.status === 'pending' ? [record.request as ApprovalRequest] : []);
  }
  questions(sessionId: string): QuestionRequest[] {
    return [...this.records.values()].flatMap(record => record.request.sessionId === sessionId && record.kind === 'question' && record.request.status === 'pending' ? [record.request as QuestionRequest] : []);
  }

  async resolveApproval(sessionId: string, approvalId: string, input: ApprovalReply, resolvedBy = 'agent-service'): Promise<ApprovalRequest> {
    const reply = ApprovalReplySchema.parse(input);
    const record = this.records.get(approvalId);
    if (!record) throw new ProjectionError(404, 'APPROVAL_NOT_FOUND', 'Request was not found');
    const state = this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, record, 'approval');
    const request = ApprovalRequestSchema.parse(record.request);
    this.assertCas(request, reply.version, 'approval');
    if (this.reservations.has(approvalId)) throw new ProjectionError(409, 'APPROVAL_CONFLICT', 'Approval request is being resolved');
    this.reservations.add(approvalId);
    clearTimeout(record.timer);
    try {
      let policy: { policyId: string; revision: string } | undefined;
      if (reply.decision === 'always-allow' || reply.decision === 'always-deny') {
        if (!request.policyTarget) throw new ProjectionError(503, 'APPROVAL_POLICY_WRITE_FAILED', 'Approval policy target is unavailable');
        const key = this.policyKey(sessionId, state.workspaceId, reply.policyScope, request.policyTarget);
        const existing = this.policies.get(key);
        const decision = reply.decision === 'always-allow' ? 'allow' : 'deny';
        if (existing?.decision === decision) policy = existing;
        else {
          if (!this.policyCommit) throw new ProjectionError(503, 'APPROVAL_POLICY_WRITE_FAILED', 'Approval policy persistence is unavailable');
          try {
            policy = await this.policyCommit({ sessionId, workspaceId: state.workspaceId, scope: reply.policyScope, decision, target: request.policyTarget });
            this.policies.set(key, { ...policy, scope: reply.policyScope, decision, target: request.policyTarget });
          } catch { throw new ProjectionError(503, 'APPROVAL_POLICY_WRITE_FAILED', 'Approval policy persistence failed'); }
        }
      }
      this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, this.records.get(approvalId), 'approval');
      this.assertCas(this.records.get(approvalId)!.request, reply.version, 'approval');
      await state.dispatch({ type: 'approval.resolve', approvalId, decision: reply.decision === 'reject' || reply.decision === 'always-deny' ? 'reject' : 'approve' });
      this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, this.records.get(approvalId), 'approval');
      this.assertCas(this.records.get(approvalId)!.request, reply.version, 'approval');
      clearTimeout(record.timer);
      const resolvedAt = Date.now();
      const terminal = ApprovalRequestSchema.parse({ ...request, status: reply.decision === 'approve' || reply.decision === 'always-allow' ? 'approved' : 'rejected', version: increment(request.version), resolvedAt, resolvedBy: EntityIdSchema.parse(resolvedBy), resolution: terminalResolution(reply.decision, policy) });
      this.records.set(approvalId, { ...record, request: terminal, timer: undefined });
      state.append({ timestamp: resolvedAt, event: { type: 'approval.resolved', approval: terminal } });
      return terminal;
    } finally {
      this.reservations.delete(approvalId);
      if (this.records.get(approvalId) === record) record.timer = setTimeout(() => { void this.expirePending(sessionId, approvalId); }, Math.max(0, request.requestedAt + this.timeoutMs - Date.now()));
    }
  }

  async resolveQuestion(sessionId: string, questionId: string, input: QuestionReply, resolvedBy = 'agent-service'): Promise<QuestionRequest> {
    const reply = QuestionReplySchema.parse(input);
    const record = this.records.get(questionId);
    if (!record) throw new ProjectionError(404, 'QUESTION_NOT_FOUND', 'Request was not found');
    const state = this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, record, 'question');
    const request = QuestionRequestSchema.parse(record.request);
    this.assertCas(request, reply.version, 'question');
    if (this.reservations.has(questionId)) throw new ProjectionError(409, 'QUESTION_CONFLICT', 'Question request is being resolved');
    this.reservations.add(questionId);
    clearTimeout(record.timer);
    try {
      let response: JsonValue | undefined;
      if (reply.action === 'answer') response = this.validateAnswer(request, reply.response);
      await state.dispatch({ type: 'question.resolve', questionId, action: reply.action, ...(response === undefined ? {} : { response }) });
      this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, this.records.get(questionId), 'question');
      this.assertCas(this.records.get(questionId)!.request, reply.version, 'question');
      clearTimeout(record.timer);
      const resolvedAt = Date.now();
      const terminal = QuestionRequestSchema.parse({ ...request, status: reply.action === 'answer' ? 'answered' : 'cancelled', version: increment(request.version), ...(response === undefined ? {} : { response, answeredAt: resolvedAt }), resolvedAt, resolvedBy: EntityIdSchema.parse(resolvedBy) });
      this.records.set(questionId, { ...record, request: terminal, timer: undefined });
      state.append({ timestamp: resolvedAt, event: { type: 'question.resolved', question: terminal } });
      return terminal;
    } finally {
      this.reservations.delete(questionId);
      if (this.records.get(questionId) === record) record.timer = setTimeout(() => { void this.expirePending(sessionId, questionId); }, Math.max(0, request.requestedAt + this.timeoutMs - Date.now()));
    }
  }

  private async expirePending(sessionId: string, id: string): Promise<void> {
    const record = this.records.get(id);
    const state = this.sessions.get(sessionId);
    if (!record || !state || record.request.status !== 'pending' || record.request.epoch !== state.epoch) return;
    clearTimeout(record.timer);
    const expired = this.expire(record.request);
    this.records.set(id, { ...record, request: expired, timer: undefined });
    state.append(ProjectionInputSchema.parse({ timestamp: expired.resolvedAt, event: record.kind === 'approval' ? { type: 'approval.resolved', approval: expired } : { type: 'question.resolved', question: expired } }));
    try {
      await state.dispatch(record.kind === 'approval' ? { type: 'approval.resolve', approvalId: id, decision: 'reject' } : { type: 'question.resolve', questionId: id, action: 'cancel' });
    } catch { this.invalidate(sessionId, state.generation); }
  }

  private expire(request: ApprovalRequest | QuestionRequest): ApprovalRequest | QuestionRequest {
    const terminal = { ...request, status: 'expired' as const, version: increment(request.version), resolvedAt: Date.now(), resolvedBy: 'agent-service' };
    return 'approvalId' in request ? ApprovalRequestSchema.parse(terminal) : QuestionRequestSchema.parse(terminal);
  }

  private assertOwner(sessionId: string, epoch: string, generation: string, record: RecordState | undefined, kind: RequestKind): SessionState {
    const state = this.sessions.get(sessionId);
    if (!state || state.epoch !== epoch || state.generation !== generation) throw new ProjectionError(410, kind === 'approval' ? 'APPROVAL_EXPIRED' : 'QUESTION_EXPIRED', 'Request belongs to an expired worker generation');
    if (!record || record.kind !== kind || record.request.sessionId !== sessionId) throw new ProjectionError(404, kind === 'approval' ? 'APPROVAL_NOT_FOUND' : 'QUESTION_NOT_FOUND', 'Request was not found');
    if (record.request.status === 'expired') throw new ProjectionError(410, kind === 'approval' ? 'APPROVAL_EXPIRED' : 'QUESTION_EXPIRED', 'Request has expired');
    if (record.request.epoch !== epoch || record.request.workerGeneration !== generation) throw new ProjectionError(410, kind === 'approval' ? 'APPROVAL_EXPIRED' : 'QUESTION_EXPIRED', 'Request belongs to an expired worker generation');
    return state;
  }

  private assertCas(request: ApprovalRequest | QuestionRequest, version: string, kind: RequestKind): void {
    if (request.status !== 'pending' || request.version !== version) throw new ProjectionError(409, kind === 'approval' ? 'APPROVAL_CONFLICT' : 'QUESTION_CONFLICT', 'Request version is no longer current');
  }

  private validateAnswer(request: QuestionRequest, response: JsonValue): JsonValue {
    const parsed = QuestionAnswerSchema.safeParse(response);
    if (!parsed.success) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response does not match the requested result shape');
    const schema = request.schema;
    const questions = schema && Array.isArray(schema.questions) ? schema.questions : [];
    if (parsed.data.results.length !== questions.length) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response count does not match the request');
    for (const [index, result] of parsed.data.results.entries()) {
      const question = questions[index];
      if (!question || typeof question !== 'object' || Array.isArray(question)) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question schema is invalid');
      if (!('id' in question) || question.id !== result.id) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response order does not match the request');
      const options = 'options' in question && Array.isArray(question.options) ? question.options : [];
      const labels = options.flatMap(option => option && typeof option === 'object' && !Array.isArray(option) && 'label' in option && typeof option.label === 'string' ? [option.label] : []);
      if (result.selectedOptions.some(option => !labels.includes(option))) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response contains an unknown option');
      const multi = 'multi' in question && question.multi === true;
      if (!multi && result.selectedOptions.length > 1) throw new ProjectionError(400, 'INVALID_REQUEST', 'Single-choice question has multiple selections');
      if (new Set(result.selectedOptions).size !== result.selectedOptions.length) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response contains duplicate selections');
      if (result.customInput !== undefined && result.customInput.trim().length === 0) throw new ProjectionError(400, 'INVALID_REQUEST', 'Custom question input must not be blank');
      if (result.selectedOptions.length === 0 && result.customInput === undefined) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response must contain a selection or custom input');
    }
    return JsonValueSchema.parse(parsed.data);
  }
}
