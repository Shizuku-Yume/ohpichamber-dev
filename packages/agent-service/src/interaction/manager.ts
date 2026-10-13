import { z } from 'zod';
import {
  ApprovalReplySchema, ApprovalRequestSchema, EntityIdSchema, JsonObjectSchema, JsonValueSchema,
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
type ApprovalRecordState = { kind: 'approval'; request: ApprovalRequest; target: ApprovalPolicyWrite['target']; timer?: NodeJS.Timeout };
type RecordState = ApprovalRecordState | { kind: 'question'; request: QuestionRequest; timer?: NodeJS.Timeout };
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
const QuestionOptionSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  preview: z.string().optional(),
});
const QuestionItemSchema = z.object({
  id: z.string(),
  question: z.string().optional(),
  header: z.string().optional(),
  options: z.array(QuestionOptionSchema),
  multi: z.boolean().optional(),
  recommended: z.number().optional(),
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
      const expired = this.expire(record);
      this.records.set(id, expired);
      state.append(ProjectionInputSchema.parse({
        timestamp: expired.request.resolvedAt,
        event: expired.kind === 'approval'
          ? { type: 'approval.resolved', approval: expired.request }
          : { type: 'question.resolved', question: expired.request },
      }));
    }
  }

  onRequest(sessionId: string, generation: string, interaction: WorkerInteraction): void {
    const state = this.sessions.get(sessionId);
    if (!state || state.generation !== generation) return;
    const now = Date.now();
    if (interaction.kind === 'approval') {
      const privateTarget = interaction.policyTarget;
      const request: ApprovalRequest = ApprovalRequestSchema.parse({
        approvalId: interaction.approvalId, sessionId, turnId: interaction.turnId, toolCallId: interaction.toolCallId,
        toolName: interaction.toolName, actionType: interaction.actionType,
        commandSummary: 'Native tool operation requires approval',
        details: { reason: 'The native tool operation requires approval.', options: ['Approve', 'Reject'] },
        policyTarget: { toolName: interaction.toolName, pattern: 'native-input' }, status: 'pending', version: '1', epoch: state.epoch,
        workerGeneration: state.generation, requestedAt: now,
      });
      const timer = setTimeout(() => { void this.expirePending(sessionId, request.approvalId); }, this.timeoutMs);
      this.records.set(request.approvalId, { kind: 'approval', request, target: privateTarget, timer });
      state.append({ timestamp: now, event: { type: 'approval.requested', approval: request } });
      const policy = this.matchingPolicy(sessionId, state.workspaceId, privateTarget);
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
    return [...this.records.values()].flatMap(record => record.request.sessionId === sessionId && record.kind === 'approval' && record.request.status === 'pending' ? [record.request] : []);
  }
  questions(sessionId: string): QuestionRequest[] {
    return [...this.records.values()].flatMap(record => record.request.sessionId === sessionId && record.kind === 'question' && record.request.status === 'pending' ? [record.request] : []);
  }

  async resolveApproval(sessionId: string, approvalId: string, input: ApprovalReply, resolvedBy = 'agent-service'): Promise<ApprovalRequest> {
    const reply = ApprovalReplySchema.parse(input);
    const record = this.records.get(approvalId);
    const state = this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, record, 'approval');
    if (!record || record.kind !== 'approval') throw new ProjectionError(404, 'APPROVAL_NOT_FOUND', 'Request was not found');
    const request = ApprovalRequestSchema.parse(record.request);
    this.assertCas(request, reply.version, 'approval');
    if (this.reservations.has(approvalId)) throw this.conflict(request, reply.version, 'approval', 'Approval request is being resolved');
    this.reservations.add(approvalId);
    clearTimeout(record.timer);
    try {
      let policy: { policyId: string; revision: string } | undefined;
      if (reply.decision === 'always-allow' || reply.decision === 'always-deny') {
        const target = record.target;
        const key = this.policyKey(sessionId, state.workspaceId, reply.policyScope, target);
        const existing = this.policies.get(key);
        const decision = reply.decision === 'always-allow' ? 'allow' : 'deny';
        if (existing?.decision === decision) policy = existing;
        else {
          if (!this.policyCommit) throw new ProjectionError(503, 'APPROVAL_POLICY_WRITE_FAILED', 'Approval policy persistence is unavailable');
          try {
            policy = await this.policyCommit({ sessionId, workspaceId: state.workspaceId, scope: reply.policyScope, decision, target });
            this.policies.set(key, { ...policy, scope: reply.policyScope, decision, target });
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
      this.records.set(approvalId, { kind: 'approval', request: terminal, target: record.target, timer: undefined });
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
    const state = this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, record, 'question');
    if (!record || record.kind !== 'question') throw new ProjectionError(404, 'QUESTION_NOT_FOUND', 'Request was not found');
    const request = QuestionRequestSchema.parse(record.request);
    this.assertCas(request, reply.version, 'question');
    if (this.reservations.has(questionId)) throw this.conflict(request, reply.version, 'question', 'Question request is being resolved');
    this.reservations.add(questionId);
    clearTimeout(record.timer);
    try {
      const answered = reply.action === 'answer' ? { response: this.validateAnswer(request, reply.response) } : undefined;
      await state.dispatch(
        answered
          ? { type: 'question.resolve', questionId, action: 'answer', response: answered.response }
          : { type: 'question.resolve', questionId, action: 'cancel' },
      );
      this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, this.records.get(questionId), 'question');
      this.assertCas(this.records.get(questionId)!.request, reply.version, 'question');
      clearTimeout(record.timer);
      const resolvedAt = Date.now();
      const resolvedById = EntityIdSchema.parse(resolvedBy);
      const terminal = QuestionRequestSchema.parse(
        answered
          ? { ...request, status: 'answered', version: increment(request.version), response: answered.response, answeredAt: resolvedAt, resolvedAt, resolvedBy: resolvedById }
          : { ...request, status: 'cancelled', version: increment(request.version), resolvedAt, resolvedBy: resolvedById },
      );
      this.records.set(questionId, { kind: 'question', request: terminal, timer: undefined });
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
    const expired = this.expire(record);
    this.records.set(id, expired);
    state.append(ProjectionInputSchema.parse({
      timestamp: expired.request.resolvedAt,
      event: expired.kind === 'approval'
        ? { type: 'approval.resolved', approval: expired.request }
        : { type: 'question.resolved', question: expired.request },
    }));
    try {
      await state.dispatch(record.kind === 'approval' ? { type: 'approval.resolve', approvalId: id, decision: 'reject' } : { type: 'question.resolve', questionId: id, action: 'cancel' });
    } catch { this.invalidate(sessionId, state.generation); }
  }

  private expire(record: RecordState): RecordState {
    const terminal = { ...record.request, status: 'expired' as const, version: increment(record.request.version), resolvedAt: Date.now(), resolvedBy: 'agent-service' };
    return record.kind === 'approval'
      ? { kind: 'approval', request: ApprovalRequestSchema.parse(terminal), target: record.target, timer: undefined }
      : { kind: 'question', request: QuestionRequestSchema.parse(terminal), timer: undefined };
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
    if (request.status !== 'pending' || request.version !== version) throw this.conflict(request, version, kind, 'Request version is no longer current');
  }

  private conflict(request: ApprovalRequest | QuestionRequest, version: string, kind: RequestKind, detail: string): ProjectionError {
    return new ProjectionError(409, kind === 'approval' ? 'APPROVAL_CONFLICT' : 'QUESTION_CONFLICT', detail, {
      expectedVersion: version, actualVersion: request.version, currentRecord: JsonObjectSchema.parse(request),
    });
  }

  private validateAnswer(request: QuestionRequest, response: JsonValue): JsonValue {
    const parsed = QuestionAnswerSchema.safeParse(response);
    if (!parsed.success) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response does not match the requested result shape');
    const schema = request.schema;
    const questions = schema && Array.isArray(schema.questions) ? schema.questions : [];
    if (parsed.data.results.length !== questions.length) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response count does not match the request');
    for (const [index, result] of parsed.data.results.entries()) {
      const parsedQuestion = QuestionItemSchema.safeParse(questions[index]);
      if (!parsedQuestion.success) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question schema is invalid');
      const question = parsedQuestion.data;
      if (question.id !== result.id) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response order does not match the request');
      const labels = question.options.map(option => option.label);
      if (result.selectedOptions.some(option => !labels.includes(option))) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response contains an unknown option');
      if (new Set(result.selectedOptions).size !== result.selectedOptions.length) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response contains duplicate selections');
      if (result.customInput !== undefined && result.customInput.trim().length === 0) throw new ProjectionError(400, 'INVALID_REQUEST', 'Custom question input must not be blank');
      if (!question.multi && result.selectedOptions.length + (result.customInput === undefined ? 0 : 1) !== 1) {
        throw new ProjectionError(400, 'INVALID_REQUEST', result.selectedOptions.length === 0 ? 'Question response must contain a selection or custom input' : 'Single-choice question has multiple selections');
      }
    }
    return JsonValueSchema.parse(parsed.data);
  }
}
