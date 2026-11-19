import { z } from 'zod';
import {
  ApprovalReplySchema, ApprovalRequestSchema, EntityIdSchema, JsonObjectSchema, JsonValueSchema,
  QuestionReplySchema, QuestionRequestSchema, PlanReviewResponseSchema,
  AskAnswerSchema, AskQuestionSchema,
} from '@openchamber/agent-contract';
import type {
  ApprovalReply, ApprovalRequest, ApprovalResolution, JsonObject, JsonValue, QuestionReply, QuestionRequest,
} from '@openchamber/agent-contract';
import { ProjectionInputSchema } from '../projection/protocol.ts';
import type { ProjectionInput } from '../projection/protocol.ts';
import type { WorkerInteraction, WorkerOperation } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import type { NativeApprovalGrant } from '../native-policy-protocol.ts';
import type { HostApprovalPolicyListRequestSchema } from '../supervisor/host-authorization-protocol.ts';
import { oneLineApprovalText, publicApprovalDetails } from './approval-summary.ts';

type RequestKind = 'approval' | 'question';
type ApprovalRequestInput = z.input<typeof ApprovalRequestSchema>;
type ApprovalRecordState = {
  kind: 'approval'; request: ApprovalRequest; target: ApprovalPolicyWrite['target']; sessionRuleKey?: string;
  timer?: NodeJS.Timeout; permissionRequest?: boolean; unpublished?: boolean;
  /** Publishes this record as a card; kept so a later mode switch can still show it. */
  publish?: () => void;
};
type RecordState = ApprovalRecordState | { kind: 'question'; request: QuestionRequest; timer?: NodeJS.Timeout; timeoutMs?: number };
type SessionState = {
  epoch: string; generation: string; workspaceId: string;
  dispatch: (operation: WorkerOperation) => Promise<void>; append: (input: ProjectionInput) => void;
};

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
export type ApprovalPolicyLoadRequest = z.infer<typeof HostApprovalPolicyListRequestSchema>;

/** A session's execution-permission mode, owned by the Host policy runtime. */
export type SessionPermissionMode = 'ask' | 'safety' | 'auto';
/**
 * The Host policy runtime owns both the mode and the safety net; the service
 * asks and never keeps a second copy. `unavailable` and a failed read both mean
 * the request waits for the user.
 */
export interface PermissionAuthority {
  resolveMode: (sessionId: string, approval: ApprovalRequest) => Promise<SessionPermissionMode>;
  evaluate: (sessionId: string, approval: ApprovalRequest) => Promise<'accept' | 'hold' | 'unavailable'>;
}
export interface ApprovalPolicyLoad {
  (request: ApprovalPolicyLoadRequest): Promise<ApprovalPolicyRecord[]>;
}

function increment(version: string): string { return (BigInt(version) + 1n).toString(); }
function terminalResolution(decision: ApprovalReply['decision'], policy: { policyId: string; revision: string } | undefined): ApprovalResolution {
  if (decision === 'approve' || decision === 'reject') return { decision };
  if (decision === 'always-allow' && policy === undefined) return { decision, policy: { scope: 'session', persistence: 'ephemeral' } };
  if (!policy) throw new ProjectionError(503, 'APPROVAL_POLICY_WRITE_FAILED', 'Approval policy persistence did not return a committed revision');
  return decision === 'always-allow'
    ? { decision, policy: { policyId: policy.policyId, revision: policy.revision, scope: 'session', persistence: 'committed' } }
    : { decision, policy: { policyId: policy.policyId, revision: policy.revision, scope: 'workspace', persistence: 'committed' } };
}

export class InteractionManager {
  private readonly sessions = new Map<string, SessionState>();
  private readonly records = new Map<string, RecordState>();
  private readonly reservations = new Set<string>();
  private readonly executionGrants = new Map<string, {
    sessionId: string; workerGeneration: string; epoch: string; toolCallId: string;
    target: ApprovalPolicyWrite['target']; expiresAt: number; timer: NodeJS.Timeout;
  }>();
  private readonly policies = new Map<string, ApprovalPolicyRecord>();
  constructor(
    private readonly timeoutMs = 300_000,
    private readonly policyCommit?: ApprovalPolicyCommit,
    private readonly permission?: PermissionAuthority,
  ) { }

  openSession(sessionId: string, epoch: string, generation: string, workspaceId: string, dispatch: SessionState['dispatch'], append: SessionState['append']): void {
    const prior = this.sessions.get(sessionId);
    if (prior && (prior.epoch !== epoch || prior.generation !== generation)) this.invalidate(sessionId, prior.generation);
    this.sessions.set(sessionId, { epoch, generation, workspaceId, dispatch, append });
  }

  /**
   * Reconsider every execution approval still waiting in this session, after
   * the Host says its mode changed. The mode is read from the Host again, so
   * this holds no second copy of it.
   */
  reconsiderPending(sessionId: string): void {
    for (const record of [...this.records.values()]) {
      if (record.kind !== 'approval' || record.permissionRequest !== true || record.request.sessionId !== sessionId || record.request.status !== 'pending') continue;
      this.scheduleReconsider(record.request, record.publish);
    }
  }

  /**
   * Start one attempt per mode change. Attempts may overlap, and that is the
   * point: a slow `safety` verdict for an old mode must not delay the `auto`
   * switch that supersedes it. CAS makes exactly one attempt win and the rest
   * report `409/410/404`, which is expected coordination rather than failure.
   */
  private scheduleReconsider(request: ApprovalRequest, publish?: () => void): void {
    void this.reconsider(request.sessionId, request.approvalId, request.epoch, request.workerGeneration, publish)
      .catch(error => {
        if (error instanceof ProjectionError && (error.status === 409 || error.status === 410 || error.status === 404)) return;
        console.warn('[interaction] permission reconsideration failed:', error?.message ?? error);
      });
  }

  /**
   * Answer one pending execution approval through the same CAS path a user
   * reply takes. `auto` accepts at once; `safety` asks the Host safety net
   * first, and a hold or an unavailable verdict leaves the request on screen.
   * Questions, plan review, native grants and capability prompts never reach
   * here.
   */
  private async reconsider(sessionId: string, approvalId: string, epoch: string, generation: string, publishPending?: () => void): Promise<void> {
    // Every path that leaves the request waiting for the user publishes it; an
    // answer the policy gives itself never publishes, so no card is advertised
    // for a request the user never has to see.
    let publish = publishPending;
    // Publishing is only meaningful while this exact record is still pending: a
    // concurrent approval or revocation must not leave a card behind.
    const ensurePublished = (): void => {
      const live = this.pendingExecutionApproval(sessionId, approvalId, epoch, generation);
      if (!live) return;
      (publish ?? live.publish)?.();
      publish = undefined;
    };
    const current = this.pendingExecutionApproval(sessionId, approvalId, epoch, generation);
    publish ??= current?.publish;
    // A request that was revoked while its answer was computed has no card to show.
    if (!current) return;
    if (!this.permission) { ensurePublished(); return; }
    let mode: SessionPermissionMode;
    try {
      mode = await this.permission.resolveMode(sessionId, current.request);
    } catch {
      ensurePublished();
      setTimeout(() => {
        const live = this.pendingExecutionApproval(sessionId, approvalId, epoch, generation);
        if (live && live.request.status === 'pending') {
          this.scheduleReconsider(live.request);
        }
      }, 250).unref?.();
      return;
    }
    if (mode === 'ask') { ensurePublished(); return; }
    const pending = this.pendingExecutionApproval(sessionId, approvalId, epoch, generation);
    if (!pending) return;
    const state = this.sessions.get(sessionId);
    if (!state) return;
    // An explicit policy deny is the last word: no mode may approve its target.
    if (this.matchingPolicy(sessionId, state.workspaceId, pending.record.target)?.decision === 'deny') { ensurePublished(); return; }
    if (mode === 'safety') {
      const verdict = await this.permission.evaluate(sessionId, pending.request).catch(() => 'unavailable' as const);
      if (verdict !== 'accept') { ensurePublished(); return; }
      // The mode, the record and the worker may all have changed while the
      // safety net ran; only a still-pending, still-current record is approved.
      const latest = this.pendingExecutionApproval(sessionId, approvalId, epoch, generation);
      if (!latest) return;
      const reread = await this.permission.resolveMode(sessionId, latest.request).catch(() => 'ask' as const);
      if (reread !== mode) { ensurePublished(); return; }
      if (this.matchingPolicy(sessionId, latest.state.workspaceId, latest.record.target)?.decision === 'deny') { ensurePublished(); return; }
      // The policy answers the request it just accepted; there was never a card.
      await this.resolveApproval(sessionId, approvalId, {
        decision: 'approve', version: latest.request.version, epoch, workerGeneration: generation,
      });
      return;
    }
    // `auto` answers before publication: no card is ever advertised or resolved.
    await this.resolveApproval(sessionId, approvalId, {
      decision: 'approve', version: pending.request.version, epoch, workerGeneration: generation,
    });
  }

  /** The record when it is still the pending execution gate of the current worker generation. */
  private pendingExecutionApproval(sessionId: string, approvalId: string, epoch: string, generation: string): { record: ApprovalRecordState; request: ApprovalRequest; state: SessionState; publish?: () => void } | undefined {
    const state = this.sessions.get(sessionId);
    if (!state || state.epoch !== epoch || state.generation !== generation) return undefined;
    const record = this.records.get(approvalId);
    if (!record || record.kind !== 'approval' || record.permissionRequest !== true) return undefined;
    const request = record.request;
    if (request.status !== 'pending' || request.sessionId !== sessionId
      || request.epoch !== epoch || request.workerGeneration !== generation) return undefined;
    return { record, request, state, publish: record.publish };
  }
  loadPolicies(sessionId: string, workspaceId: string, policies: ApprovalPolicyRecord[]): void {
    for (const policy of policies) this.policies.set(this.policyKey(sessionId, workspaceId, policy.scope, policy.target), policy);
  }

  private policyKey(sessionId: string, workspaceId: string, scope: 'session' | 'workspace', target: ApprovalPolicyWrite['target']): string {
    return JSON.stringify([scope, scope === 'session' ? sessionId : workspaceId, target.toolName, target.pattern]);
  }

  private matchingPolicy(sessionId: string, workspaceId: string, target: ApprovalPolicyWrite['target']): ApprovalPolicyRecord | undefined {
    return this.policies.get(this.policyKey(sessionId, workspaceId, 'workspace', target))
      ?? this.policies.get(this.policyKey(sessionId, workspaceId, 'session', target));
  }

  /**
   * Move a session's pending approvals, questions and session-scoped policies
   * to the id a completed `/btw` branch minted. The worker kept answering the
   * old request ids, so only the addressed session id moves; the requests
   * themselves are re-addressed so a pending approval is still actionable.
   */
  rekey(previousSessionId: string, sessionId: string): void {
    if (previousSessionId === sessionId) return;
    const prior = this.sessions.get(previousSessionId);
    if (prior) { this.sessions.delete(previousSessionId); this.sessions.set(sessionId, prior); }
    for (const [id, grant] of this.executionGrants) if (grant.sessionId === previousSessionId) this.executionGrants.set(id, { ...grant, sessionId });
    for (const [id, record] of this.records) {
      if (record.request.sessionId !== previousSessionId) continue;
      if (record.kind === 'approval') {
        const request: ApprovalRequest = { ...record.request, sessionId };
        this.records.set(id, { ...record, request });
      } else {
        const request: QuestionRequest = { ...record.request, sessionId };
        this.records.set(id, { ...record, request });
      }
    }
    const workspaceId = this.sessions.get(sessionId)?.workspaceId;
    for (const [key, policy] of this.policies) {
      if (policy.scope !== 'session') continue;
      if (this.policyKey(previousSessionId, workspaceId ?? '', 'session', policy.target) !== key) continue;
      this.policies.delete(key);
      if (workspaceId === undefined) continue;
      this.policies.set(this.policyKey(sessionId, workspaceId, 'session', policy.target), policy);
    }
  }

  closeSession(sessionId: string): void {
    this.invalidate(sessionId);
    this.sessions.delete(sessionId);
  }

  invalidate(sessionId: string, generation?: string): void {
    const state = this.sessions.get(sessionId);
    if (!state || (generation !== undefined && state.generation !== generation)) return;
    for (const [id, grant] of this.executionGrants) {
      if (grant.sessionId !== sessionId) continue;
      clearTimeout(grant.timer);
      this.executionGrants.delete(id);
    }
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
    if (interaction.kind === 'cancel') {
      this.cancelPending(sessionId, interaction.approvalId ?? interaction.questionId!);
      return;
    }
    if (interaction.kind === 'approval') {
      const privateTarget = interaction.policyTarget;
      if (interaction.nativeGrant) {
        if (interaction.toolName !== 'bash') return;
        const timer = setTimeout(() => this.executionGrants.delete(interaction.approvalId), this.timeoutMs);
        this.executionGrants.set(interaction.approvalId, {
          sessionId, workerGeneration: state.generation, epoch: state.epoch,
          toolCallId: interaction.toolCallId, target: privateTarget, expiresAt: now + this.timeoutMs, timer,
        });
        void state.dispatch({ type: 'approval.resolve', approvalId: interaction.approvalId, decision: 'approve' }).catch(() => { });
        return;
      }
      const sessionRuleKey = interaction.sessionRuleKey;
      const summary = oneLineApprovalText(interaction.commandSummary);
      const reason = z.string().safeParse(interaction.details.reason).data;
      const approvalDraft: ApprovalRequestInput = {
        approvalId: interaction.approvalId, sessionId, turnId: interaction.turnId, toolCallId: interaction.toolCallId,
        toolName: interaction.toolName, actionType: interaction.actionType,
        commandSummary: summary,
        details: publicApprovalDetails(interaction.actionType, summary, reason),
        status: 'pending', version: '1', epoch: state.epoch,
        workerGeneration: state.generation, requestedAt: now,
      };
      if (sessionRuleKey) approvalDraft.policyTarget = { toolName: interaction.toolName, pattern: '*' };
      const request: ApprovalRequest = ApprovalRequestSchema.parse(approvalDraft);
      const record: ApprovalRecordState = { kind: 'approval', request, target: privateTarget, sessionRuleKey, permissionRequest: interaction.permissionRequest === true, unpublished: interaction.permissionRequest === true };
      this.records.set(request.approvalId, record);
      // Publication is a decision, not a reflex: a request the policy answers
      // itself is never shown as a waiting card. `publish` runs once, immediately
      // before the card would stay (or before the answer that closes it), so the
      // requested event never advertises a manual approval that no longer exists.
      // Announcement happens at most once per record; an approval answered before
      // it was announced keeps `unpublished` set and is never shown.
      let announced = false;
      const publish = (): void => {
        if (announced) return;
        announced = true;
        record.unpublished = false;
        record.publish = undefined;
        record.timer = setTimeout(() => { void this.expirePending(sessionId, request.approvalId); }, this.timeoutMs);
        state.append({ timestamp: now, event: { type: 'approval.requested', approval: request } });
      };
      record.publish = publish;
      const policy = this.matchingPolicy(sessionId, state.workspaceId, privateTarget);
      if (policy?.decision === 'deny') {
        // The workspace deny already exists; a one-shot reject closes the request
        // without requiring a public policyTarget that ordinary approvals omit.
        // It is answered before any card exists, so nothing is published.
        void this.resolveApproval(sessionId, request.approvalId, {
          decision: 'reject', version: request.version,
          epoch: request.epoch, workerGeneration: generation,
        }).catch(() => { });
        return;
      }
      // Only the native ACP execution-permission gate is answered for the
      // user. Extension dialogs, native-grant re-authorizations, questions and
      // capability prompts always keep their card. An explicit deny above wins.
      if (interaction.permissionRequest === true) {
        this.scheduleReconsider(request, publish);
        return;
      }
      publish();
      return;
    }
    const request: QuestionRequest = QuestionRequestSchema.parse({
      questionId: interaction.questionId, sessionId, turnId: interaction.turnId, prompt: interaction.prompt, schema: interaction.schema,
      status: 'pending', version: '1', epoch: state.epoch, workerGeneration: state.generation, requestedAt: now,
    });
    const timeoutMs = interaction.schema.form === true ? interaction.timeout : Math.min(this.timeoutMs, interaction.timeout ?? this.timeoutMs);
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => { void this.expirePending(sessionId, request.questionId); }, timeoutMs);
    this.records.set(request.questionId, { kind: 'question', request, timer, timeoutMs });
    state.append({ timestamp: now, event: { type: 'question.requested', question: request } });
  }

  /** The public approval list: a request the policy has not published is not a card. */
  approvals(sessionId: string): ApprovalRequest[] {
    return [...this.records.values()].flatMap(record => record.request.sessionId === sessionId && record.kind === 'approval'
      && record.request.status === 'pending' && record.unpublished !== true ? [record.request] : []);
  }
  questions(sessionId: string): QuestionRequest[] {
    return [...this.records.values()].flatMap(record => record.request.sessionId === sessionId && record.kind === 'question' && record.request.status === 'pending' ? [record.request] : []);
  }

  consumeApprovalGrant(sessionId: string, generation: string, approvalId: string, toolCallId: string, toolName: string, input: JsonObject): NativeApprovalGrant | undefined {
    const grant = this.executionGrants.get(approvalId);
    const state = this.sessions.get(sessionId);
    const command = typeof input.command === 'string' && input.command.length > 0 ? input.command : undefined;
    if (!grant || !state || grant.expiresAt <= Date.now() || state.generation !== generation
      || grant.sessionId !== sessionId || grant.workerGeneration !== generation || grant.epoch !== state.epoch
      || grant.toolCallId !== toolCallId || grant.target.toolName !== toolName
      || grant.target.pattern !== JSON.stringify(input)
      || this.matchingPolicy(sessionId, state.workspaceId, grant.target)?.decision === 'deny') return undefined;
    clearTimeout(grant.timer);
    this.executionGrants.delete(approvalId);
    return {
      approvalId,
      toolCallId,
      rootSessionId: sessionId,
      workerGeneration: generation,
      epoch: state.epoch,
      ...(command !== undefined ? { command } : {}),
      toolName,
      input,
    };
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
      if (reply.decision === 'always-allow') {
        if (!record.sessionRuleKey) throw new ProjectionError(400, 'INVALID_REQUEST', 'This approval has no session allowance');
      } else if (reply.decision === 'always-deny') {
        const target = record.target;
        const key = this.policyKey(sessionId, state.workspaceId, reply.policyScope, target);
        const existing = this.policies.get(key);
        if (existing?.decision === 'deny') policy = existing;
        else {
          if (!this.policyCommit) throw new ProjectionError(503, 'APPROVAL_POLICY_WRITE_FAILED', 'Approval policy persistence is unavailable');
          try {
            policy = await this.policyCommit({ sessionId, workspaceId: state.workspaceId, scope: reply.policyScope, decision: 'deny', target });
            this.policies.set(key, { ...policy, scope: reply.policyScope, decision: 'deny', target });
          } catch { throw new ProjectionError(503, 'APPROVAL_POLICY_WRITE_FAILED', 'Approval policy persistence failed'); }
        }
      }
      this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, this.records.get(approvalId), 'approval');
      this.assertCas(this.records.get(approvalId)!.request, reply.version, 'approval');
      if ((reply.decision === 'approve' || reply.decision === 'always-allow')
        && this.matchingPolicy(sessionId, state.workspaceId, record.target)?.decision !== 'deny') {
        const expiresAt = Date.now() + this.timeoutMs;
        this.executionGrants.set(approvalId, {
          sessionId, workerGeneration: state.generation, epoch: state.epoch, toolCallId: request.toolCallId,
          target: record.target, expiresAt, timer: setTimeout(() => this.executionGrants.delete(approvalId), this.timeoutMs),
        });
      }
      await state.dispatch({
        type: 'approval.resolve', approvalId,
        decision: reply.decision === 'reject' || reply.decision === 'always-deny' ? 'reject' : reply.decision === 'always-allow' ? 'approve-always' : 'approve',
      });
      this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, this.records.get(approvalId), 'approval');
      this.assertCas(this.records.get(approvalId)!.request, reply.version, 'approval');
      clearTimeout(record.timer);
      const resolvedAt = Date.now();
      const terminalPolicyTarget = request.policyTarget ?? (reply.decision === 'always-deny'
        ? { toolName: record.target.toolName, pattern: request.commandSummary } : undefined);
      const terminalDraft = {
        ...request,
        status: reply.decision === 'approve' || reply.decision === 'always-allow' ? 'approved' as const : 'rejected' as const,
        version: increment(request.version), resolvedAt, resolvedBy: EntityIdSchema.parse(resolvedBy),
        resolution: terminalResolution(reply.decision, policy),
      };
      if (terminalPolicyTarget) terminalDraft.policyTarget = terminalPolicyTarget;
      const terminal = ApprovalRequestSchema.parse(terminalDraft);
      this.records.set(approvalId, { kind: 'approval', request: terminal, target: record.target, sessionRuleKey: record.sessionRuleKey, timer: undefined, permissionRequest: record.permissionRequest, unpublished: record.unpublished, publish: record.publish });
      // A request the policy answered before the user ever saw it emits no
      // canonical events: there was no card to publish or to resolve.
      if (!record.unpublished) state.append({ timestamp: resolvedAt, event: { type: 'approval.resolved', approval: terminal } });
      return terminal;
    } finally {
      this.reservations.delete(approvalId);
      if (this.records.get(approvalId) === record) record.timer = setTimeout(() => { void this.expirePending(sessionId, approvalId); }, Math.max(0, request.requestedAt + this.timeoutMs - Date.now()));
      if (this.records.get(approvalId)?.request.status !== 'approved') {
        const grant = this.executionGrants.get(approvalId);
        clearTimeout(grant?.timer);
        this.executionGrants.delete(approvalId);
      }
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
      if (reply.action === 'update') {
        if (request.schema?.form !== true) throw new ProjectionError(400, 'INVALID_REQUEST', 'Only native forms accept draft updates');
        const response = this.validateAnswer(request, reply.response, true);
        await state.dispatch({ type: 'question.resolve', questionId, action: 'update', response });
        this.assertOwner(sessionId, reply.epoch, reply.workerGeneration, this.records.get(questionId), 'question');
        this.assertCas(this.records.get(questionId)!.request, reply.version, 'question');
        record.request = QuestionRequestSchema.parse({ ...request, timeoutResetAt: Date.now() });
        state.append({ timestamp: record.request.timeoutResetAt!, event: { type: 'question.requested', question: record.request } });
        return record.request;
      }
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
      this.records.set(questionId, { kind: 'question', request: terminal, timer: undefined, timeoutMs: record.timeoutMs });
      state.append({ timestamp: resolvedAt, event: { type: 'question.resolved', question: terminal } });
      return terminal;
    } finally {
      this.reservations.delete(questionId);
      if (this.records.get(questionId) === record && record.timeoutMs !== undefined) record.timer = setTimeout(() => { void this.expirePending(sessionId, questionId); }, Math.max(0, (record.request.timeoutResetAt ?? request.requestedAt) + record.timeoutMs - Date.now()));
    }
  }

  private async expirePending(sessionId: string, id: string): Promise<void> {
    const record = this.records.get(id);
    const state = this.sessions.get(sessionId);
    if (!record || !state || record.request.status !== 'pending' || record.request.epoch !== state.epoch) return;
    clearTimeout(record.timer);
    const expired = this.expire(record);
    this.records.set(id, expired);
    if (record.kind === 'approval' ? !record.unpublished : true) state.append(ProjectionInputSchema.parse({
      timestamp: expired.request.resolvedAt,
      event: expired.kind === 'approval'
        ? { type: 'approval.resolved', approval: expired.request }
        : { type: 'question.resolved', question: expired.request },
    }));
    try {
      await state.dispatch(record.kind === 'approval' ? { type: 'approval.resolve', approvalId: id, decision: 'reject' } : { type: 'question.resolve', questionId: id, action: record.request.schema?.form === true ? 'timeout' : 'cancel' });
    } catch { this.invalidate(sessionId, state.generation); }
  }
  cancelPending(sessionId: string, id: string): void {
    const record = this.records.get(id);
    const state = this.sessions.get(sessionId);
    if (!record || !state || record.request.status !== 'pending' || record.request.epoch !== state.epoch) return;
    clearTimeout(record.timer);
    this.reservations.delete(id);
    const resolvedAt = Date.now();
    if (record.kind === 'approval') {
      const terminal = ApprovalRequestSchema.parse({
        ...record.request,
        status: 'revoked' as const,
        version: increment(record.request.version),
        resolvedAt,
        resolvedBy: 'agent-service',
      });
      this.records.set(id, { ...record, request: terminal, timer: undefined });
      if (!record.unpublished) state.append(ProjectionInputSchema.parse({
        timestamp: resolvedAt,
        event: { type: 'approval.resolved', approval: terminal },
      }));
      const grant = this.executionGrants.get(id);
      clearTimeout(grant?.timer);
      this.executionGrants.delete(id);
    } else {
      const terminal = QuestionRequestSchema.parse({
        ...record.request,
        status: 'cancelled' as const,
        version: increment(record.request.version),
        resolvedAt,
        resolvedBy: 'agent-service',
      });
      this.records.set(id, { ...record, request: terminal, timer: undefined });
      state.append(ProjectionInputSchema.parse({
        timestamp: resolvedAt,
        event: { type: 'question.resolved', question: terminal },
      }));
    }
  }

  private expire(record: RecordState): RecordState {
    const terminal = { ...record.request, status: 'expired' as const, version: increment(record.request.version), resolvedAt: Date.now(), resolvedBy: 'agent-service' };
    return record.kind === 'approval'
      ? { kind: 'approval', request: ApprovalRequestSchema.parse(terminal), target: record.target, timer: undefined, permissionRequest: record.permissionRequest, unpublished: record.unpublished, publish: record.publish }
      : { kind: 'question', request: QuestionRequestSchema.parse(terminal), timer: undefined, timeoutMs: record.timeoutMs };
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

  private validateAnswer(request: QuestionRequest, response: JsonValue, draft = false): JsonValue {
    if (request.schema?.type === 'plan-review') {
      const parsed = PlanReviewResponseSchema.safeParse(response);
      if (!parsed.success) throw new ProjectionError(400, 'INVALID_REQUEST', 'Plan review response is invalid');
      return parsed.data;
    }
    const parsed = AskAnswerSchema.safeParse(response);
    if (!parsed.success) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response does not match the requested result shape');
    const schema = request.schema;
    const questions = schema && Array.isArray(schema.questions) ? schema.questions : [];
    if (parsed.data.results.length !== questions.length) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response count does not match the request');
    for (const [index, result] of parsed.data.results.entries()) {
      const parsedQuestion = AskQuestionSchema.safeParse(questions[index]);
      if (!parsedQuestion.success) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question schema is invalid');
      const question = parsedQuestion.data;
      if (question.id !== result.id) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response order does not match the request');
      const labels = question.options.map(option => option.label);
      if (result.selectedOptions.some(option => !labels.includes(option))) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response contains an unknown option');
      if (result.selectedOptions.some(label => question.options.find(option => option.label === label)?.disabled)) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response contains a disabled option');
      if (new Set(result.selectedOptions).size !== result.selectedOptions.length) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question response contains duplicate selections');
      if (question.allowCustom === false && result.customInput !== undefined) throw new ProjectionError(400, 'INVALID_REQUEST', 'Question does not accept custom input');
      if (request.schema?.form !== true && result.customInput !== undefined && result.customInput.trim().length === 0) throw new ProjectionError(400, 'INVALID_REQUEST', 'Custom question input must not be blank');
      const count = result.selectedOptions.length + (result.customInput === undefined ? 0 : 1);
      if (!question.multi && (count > 1 || (!draft && question.required !== false && count !== 1))) {
        throw new ProjectionError(400, 'INVALID_REQUEST', result.selectedOptions.length === 0 ? 'Question response must contain a selection or custom input' : 'Single-choice question has multiple selections');
      }
    }
    return JsonValueSchema.parse(parsed.data);
  }
}
