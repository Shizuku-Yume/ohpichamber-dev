import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { EntityIdSchema, PromptRequestSchema, QueueAppendRequestSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { asNonEmptyString } from '../shared/guards.js';

export const createScheduledTaskContext = (provenance) => ({
  kind: 'context', text: '', metadata: { scheduledTask: provenance }, deliveryReceiptId: randomUUID(),
});

// The picker may offer a whole session list; the route caps its own body too.
const TARGET_CANDIDATE_LIMIT = 500;

const scheduledProvenance = (capture) => capture?.request?.input?.context?.find((entry) => entry.kind === 'context' && entry.metadata?.scheduledTask)?.metadata.scheduledTask;

export const createExistingSessionTasks = ({ projectConfigRuntime, messageQueueRuntime, sessionService, resolveSessionScope, isSessionArchived, emitTaskRunEvent, expandPrompt }) => {
  const admissions = new Set();

  const validateTarget = async (projectId, targetSessionId) => {
    if (!EntityIdSchema.safeParse(targetSessionId).success) throw new OpenChamberControlError('targetSessionId is invalid', 400);
    if (typeof resolveSessionScope !== 'function' || typeof sessionService?.open !== 'function' || typeof isSessionArchived !== 'function') throw new OpenChamberControlError('Scheduled target service is unavailable', 503);
    const scope = await resolveSessionScope(targetSessionId);
    if (!scope || scope.sessionId !== targetSessionId) throw new OpenChamberControlError('Scheduled target not found', 404);
    if (scope.hostProjectId !== projectId) throw new OpenChamberControlError('Scheduled target is outside the task project', 409);
    if (await isSessionArchived(targetSessionId)) throw new OpenChamberControlError('Scheduled target is archived', 409);
    const snapshot = SessionSnapshotSchema.parse(await sessionService.open(targetSessionId));
    if (snapshot.session.sessionId !== targetSessionId || snapshot.session.projectId !== scope.projectId || snapshot.session.workspaceId !== scope.workspaceId) throw new OpenChamberControlError('Scheduled target scope mismatch', 409);
    return { session: snapshot.session, scope, directory: scope.cwd };
  };

  /**
   * Discovery half of the same rule `validateTarget` applies: a candidate is
   * eligible when its session resolves to an authorized scope in this project
   * and the directory the client already knows is that scope's own path. The
   * session's existence and scope are Host authority; the client's directory
   * is only a hint until it matches. Archived sessions never qualify.
   */
  const listEligibleTargets = async (projectId, candidates) => {
    const list = Array.isArray(candidates) ? candidates.slice(0, TARGET_CANDIDATE_LIMIT) : [];
    const eligible = [];
    for (const candidate of list) {
      const sessionId = asNonEmptyString(candidate?.sessionId);
      const directory = asNonEmptyString(candidate?.directory);
      if (!sessionId || !directory || !EntityIdSchema.safeParse(sessionId).success) continue;
      if (typeof resolveSessionScope !== 'function') throw new OpenChamberControlError('Scheduled target service is unavailable', 503);
      const scope = await resolveSessionScope(sessionId).catch(() => null);
      if (!scope || scope.sessionId !== sessionId || scope.hostProjectId !== projectId || !scope.cwd) continue;
      if (path.resolve(scope.cwd) !== path.resolve(directory)) continue;
      if (await isSessionArchived?.(sessionId)) continue;
      eligible.push({ sessionId, directory });
    }
    return eligible;
  };

  const record = async (projectId, taskId, status, error, lastRunAt) => {
    const patch = { lastStatus: status, lastError: error || undefined, updatedAt: Date.now() };
    if (lastRunAt !== undefined) patch.lastRunAt = lastRunAt;
    const result = await projectConfigRuntime.updateScheduledTaskState(projectId, taskId, patch);
    emitTaskRunEvent?.({ projectID: projectId, taskID: taskId, status, ranAt: Date.now(), sessionID: result.task?.state?.lastSessionId });
    return result.task;
  };

  const run = async (projectId, task, reason, scheduledFor, nextRunAt) => {
    const triggeredAt = Date.now();
    const key = JSON.stringify([projectId, task.id]);
    if (admissions.has(key)) {
      await record(projectId, task.id, 'skipped', 'task is already queued').catch(() => undefined);
      return { ok: false, queued: true, error: 'task is already queued', statusCode: 409 };
    }
    admissions.add(key);
    try {
      if (reason === 'scheduled') {
        const claim = await projectConfigRuntime.updateScheduledTaskStateIf(projectId, task.id,
          (candidate) => candidate.enabled && (!Number.isFinite(candidate.state?.lastScheduledFor) || Math.abs(candidate.state.lastScheduledFor - scheduledFor) > 5_000),
          { lastScheduledFor: scheduledFor, nextRunAt: nextRunAt ?? undefined });
        if (!claim.updated) return { ok: false, skipped: true };
      }
      const { scope, directory } = await validateTarget(projectId, task.targetSessionId);
      if (typeof messageQueueRuntime?.hasScheduledTask !== 'function') throw new OpenChamberControlError('Scheduled queue provenance service is unavailable', 503);
      if (await messageQueueRuntime.hasScheduledTask(projectId, task.id)) throw new OpenChamberControlError('task is already queued', 409);
      const options = task.execution.useDefaults
        ? { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }
        : { providerId: task.execution.providerID ?? null, modelId: task.execution.modelID ?? null, agentId: null, variant: task.execution.variant ?? null, reasoningEffort: null };
      const scheduledTask = { projectId, taskId: task.id, sessionId: scope.sessionId, workspaceId: scope.workspaceId, mode: 'existing', triggeredAt };
      if (typeof expandPrompt !== 'function') throw new OpenChamberControlError('Native scheduled prompt capture is unavailable', 503);
      const request = PromptRequestSchema.parse(await expandPrompt(scope, PromptRequestSchema.parse({ input: { text: task.execution.prompt, attachments: [], context: [createScheduledTaskContext(scheduledTask)] }, options })));
      const result = await projectConfigRuntime.updateScheduledTaskState(projectId, task.id, {
        lastRunAt: triggeredAt, lastStatus: 'queued', lastError: undefined, lastSessionId: task.targetSessionId, updatedAt: Date.now(),
      });
      emitTaskRunEvent?.({ projectID: projectId, taskID: task.id, status: 'queued', ranAt: Date.now(), sessionID: task.targetSessionId });
      const queue = await messageQueueRuntime.getState(scope);
      await messageQueueRuntime.append(scope, randomUUID(), QueueAppendRequestSchema.parse({ expectedRevision: queue.revision, content: task.execution.prompt, request }));
      return { ok: true, task: result.task, sessionID: task.targetSessionId, directory };
    } catch (error) {
      const queued = (error?.status === 409 || error?.statusCode === 409) && error.message === 'task is already queued';
      let updated = task;
      try { updated = await record(projectId, task.id, queued ? 'skipped' : 'failed', error.message, triggeredAt); }
      catch (persistError) { console.warn('[scheduled-tasks] admission failure state write failed:', persistError?.message); }
      return { ok: false, queued, error: error.message, statusCode: error.statusCode ?? error.status, task: updated };
    } finally { admissions.delete(key); }
  };

  const beforeSend = async (scope, capture) => {
    const provenance = scheduledProvenance(capture);
    if (!provenance) return;
    const { projectId, taskId } = provenance;
    const task = (await projectConfigRuntime.listScheduledTasks(projectId)).find((entry) => entry.id === taskId);
    if (!task) throw new OpenChamberControlError('Scheduled task was removed', 409);
    if (scope.hostProjectId !== projectId || (provenance.workspaceId && provenance.workspaceId !== scope.workspaceId) || (provenance.sessionId && provenance.sessionId !== scope.sessionId)) throw new OpenChamberControlError('Scheduled target scope changed', 409);
    if (provenance.mode === 'new') {
      if (task.targetSessionId) throw new OpenChamberControlError('Scheduled task target changed', 409);
      return;
    }
    if (task.targetSessionId !== scope.sessionId) throw new OpenChamberControlError('Scheduled task target changed', 409);
    const target = await validateTarget(projectId, scope.sessionId);
    if (target.scope.workspaceId !== scope.workspaceId || target.scope.cwd !== scope.cwd) throw new OpenChamberControlError('Scheduled target moved', 409);
  };

  return {
    validateTarget, listEligibleTargets, run, beforeSend,
    result: (provenance, status, error) => provenance.mode === 'new' ? Promise.resolve() : record(provenance.projectId, provenance.taskId, status, error),
    cancel: (projectId, taskId) => messageQueueRuntime.cancelScheduledTask(projectId, taskId),
  };
};
