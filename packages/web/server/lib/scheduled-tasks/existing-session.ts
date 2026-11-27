import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import { EntityIdSchema, PromptRequestSchema, QueueAppendRequestSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import type { PromptRequest, QueueAppendRequest, QueueState, RuntimeSession, SessionSnapshot } from '@openchamber/agent-contract';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { asNonEmptyString } from '../shared/guards.js';
import { parseJsonObject } from '../shared/json-values.js';
import type { JsonValue } from '../shared/json-values.js';
import type { ScheduledTask, ScheduledTaskStatePatch, ScheduledTaskStateResult, ScheduledTaskStatus } from '../projects/contracts.js';

export interface ScheduledTaskProvenance {
  projectId: string;
  taskId: string;
  sessionId: string;
  workspaceId: string;
  mode: 'new' | 'existing';
  triggeredAt?: number | undefined;
}

export interface ScheduledTaskSessionScope {
  sessionId: string;
  projectId: string;
  workspaceId: string;
  hostProjectId?: string;
  cwd: string;
  agentDirectory?: string;
  agentDirectoryId?: string;
}

export interface ScheduledTaskRunEvent {
  projectID: string;
  taskID: string;
  status: ScheduledTaskStatus;
  ranAt: number;
  sessionID?: string;
}

export interface ExistingSessionProjectConfigPort {
  listScheduledTasks: (projectID: string) => Promise<ScheduledTask[]>;
  updateScheduledTaskState: (projectID: string, taskID: string, patch: ScheduledTaskStatePatch) => Promise<ScheduledTaskStateResult>;
  updateScheduledTaskStateIf: (
    projectID: string,
    taskID: string,
    predicate: (task: ScheduledTask) => boolean,
    patch: ScheduledTaskStatePatch,
  ) => Promise<ScheduledTaskStateResult>;
}

export interface ExistingSessionMessageQueuePort {
  getState: (scope: ScheduledTaskSessionScope) => Promise<QueueState>;
  append: (scope: ScheduledTaskSessionScope, commandId: string, request: QueueAppendRequest) => Promise<QueueState>;
  hasScheduledTask?: (projectId: string, taskId: string) => Promise<boolean>;
  cancelScheduledTask?: (projectId: string, taskId: string) => Promise<JsonValue | object | void>;
}

export interface ExistingSessionTasksDependencies {
  projectConfigRuntime: ExistingSessionProjectConfigPort;
  messageQueueRuntime?: ExistingSessionMessageQueuePort | undefined;
  sessionService?: {
    open?: ((sessionId: string) => Promise<SessionSnapshot>) | undefined;
  } | undefined;
  resolveSessionScope?: ((sessionId: string) => Promise<ScheduledTaskSessionScope | null>) | undefined;
  isSessionArchived?: ((sessionId: string) => Promise<boolean>) | undefined;
  emitTaskRunEvent?: ((event: ScheduledTaskRunEvent) => void) | undefined;
  expandPrompt?: ((scope: ScheduledTaskSessionScope, input: PromptRequest) => Promise<PromptRequest>) | undefined;
}

export interface TargetCandidate {
  sessionId: string;
  directory: string;
}

export type ExistingSessionRunResult =
  | { ok: true; task: ScheduledTask | null; sessionID: string; directory: string }
  | { ok: false; queued?: boolean; skipped?: boolean; error?: string; statusCode?: number; task?: ScheduledTask | null };

const ErrorMetaSchema = z.object({
  message: z.string().optional(),
  status: z.number().optional(),
  statusCode: z.number().optional(),
});

export const createScheduledTaskContext = (provenance: ScheduledTaskProvenance) => ({
  kind: 'context' as const,
  text: '',
  metadata: { scheduledTask: provenance },
  deliveryReceiptId: randomUUID(),
});

const TARGET_CANDIDATE_LIMIT = 500;

const ProvenanceSchema = z.object({
  projectId: z.string(),
  taskId: z.string(),
  sessionId: z.string(),
  workspaceId: z.string(),
  mode: z.enum(['new', 'existing']),
  triggeredAt: z.number().optional(),
});

type ContextPart = Extract<PromptRequest['input']['context'][number], { kind: 'context' }>;

const scheduledProvenance = (capture: { request?: PromptRequest } | null | undefined): ScheduledTaskProvenance | undefined => {
  const entry = capture?.request?.input?.context?.find(
    (item): item is ContextPart => item.kind === 'context' && Boolean(item.metadata?.scheduledTask),
  );
  const parsed = ProvenanceSchema.safeParse(entry?.metadata?.scheduledTask);
  return parsed.success ? parsed.data : undefined;
};

export const createExistingSessionTasks = ({
  projectConfigRuntime,
  messageQueueRuntime,
  sessionService,
  resolveSessionScope,
  isSessionArchived,
  emitTaskRunEvent,
  expandPrompt,
}: ExistingSessionTasksDependencies) => {
  const admissions = new Set<string>();

  const validateTarget = async (
    projectId: string,
    targetSessionId: string | undefined,
  ): Promise<{ session: RuntimeSession; scope: ScheduledTaskSessionScope; directory: string }> => {
    if (!targetSessionId || !EntityIdSchema.safeParse(targetSessionId).success) {
      throw new OpenChamberControlError('targetSessionId is invalid', 400);
    }
    if (!resolveSessionScope || !sessionService?.open || !isSessionArchived) {
      throw new OpenChamberControlError('Scheduled target service is unavailable', 503);
    }
    const scope = await resolveSessionScope(targetSessionId);
    if (!scope || scope.sessionId !== targetSessionId) {
      throw new OpenChamberControlError('Scheduled target not found', 404);
    }
    if (scope.hostProjectId !== projectId) {
      throw new OpenChamberControlError('Scheduled target is outside the task project', 409);
    }
    if (await isSessionArchived(targetSessionId)) {
      throw new OpenChamberControlError('Scheduled target is archived', 409);
    }
    const snapshot = SessionSnapshotSchema.parse(await sessionService.open(targetSessionId));
    if (snapshot.session.sessionId !== targetSessionId
      || snapshot.session.projectId !== scope.projectId
      || snapshot.session.workspaceId !== scope.workspaceId) {
      throw new OpenChamberControlError('Scheduled target scope mismatch', 409);
    }
    return { session: snapshot.session, scope, directory: scope.cwd };
  };

  const listEligibleTargets = async (
    projectId: string,
    candidates: readonly JsonValue[] | undefined,
  ): Promise<TargetCandidate[]> => {
    const list = Array.isArray(candidates) ? candidates.slice(0, TARGET_CANDIDATE_LIMIT) : [];
    const eligible: TargetCandidate[] = [];
    for (const rawCandidate of list) {
      const candidate = parseJsonObject(rawCandidate);
      const sessionId = asNonEmptyString(candidate?.sessionId);
      const directory = asNonEmptyString(candidate?.directory);
      if (!sessionId || !directory || !EntityIdSchema.safeParse(sessionId).success) continue;
      if (!resolveSessionScope) throw new OpenChamberControlError('Scheduled target service is unavailable', 503);
      const scope = await resolveSessionScope(sessionId).catch(() => null);
      if (!scope || scope.sessionId !== sessionId || scope.hostProjectId !== projectId || !scope.cwd) continue;
      if (path.resolve(scope.cwd) !== path.resolve(directory)) continue;
      if (await isSessionArchived?.(sessionId)) continue;
      eligible.push({ sessionId, directory });
    }
    return eligible;
  };

  const record = async (
    projectId: string,
    taskId: string,
    status: ScheduledTaskStatus,
    error: string | undefined,
    lastRunAt?: number,
  ): Promise<ScheduledTask | null> => {
    const patch: ScheduledTaskStatePatch = {
      lastStatus: status,
      lastError: error || undefined,
      updatedAt: Date.now(),
    };
    if (lastRunAt !== undefined) patch.lastRunAt = lastRunAt;
    const result = await projectConfigRuntime.updateScheduledTaskState(projectId, taskId, patch);
    const event: ScheduledTaskRunEvent = {
      projectID: projectId,
      taskID: taskId,
      status,
      ranAt: Date.now(),
    };
    if (result.task?.state?.lastSessionId) event.sessionID = result.task.state.lastSessionId;
    emitTaskRunEvent?.(event);
    return result.task;
  };

  const run = async (
    projectId: string,
    task: ScheduledTask,
    reason: 'scheduled' | 'manual',
    scheduledFor: number | undefined,
    nextRunAt: number | null,
  ): Promise<ExistingSessionRunResult> => {
    const triggeredAt = Date.now();
    const key = JSON.stringify([projectId, task.id]);
    if (admissions.has(key)) {
      await record(projectId, task.id, 'skipped', 'task is already queued').catch(() => undefined);
      return { ok: false, queued: true, error: 'task is already queued', statusCode: 409 };
    }
    admissions.add(key);
    try {
      if (reason === 'scheduled') {
        const claim = await projectConfigRuntime.updateScheduledTaskStateIf(
          projectId,
          task.id,
          (candidate) => candidate.enabled && (
            scheduledFor === undefined
            || candidate.state?.lastScheduledFor === undefined
            || !Number.isFinite(candidate.state.lastScheduledFor)
            || Math.abs(candidate.state.lastScheduledFor - scheduledFor) > 5_000
          ),
          { lastScheduledFor: scheduledFor, nextRunAt: nextRunAt ?? undefined },
        );
        if (!claim.updated) return { ok: false, skipped: true };
      }
      const targetSessionId = task.targetSessionId;
      if (!targetSessionId) throw new OpenChamberControlError('targetSessionId is invalid', 400);
      const { scope, directory } = await validateTarget(projectId, targetSessionId);
      if (!messageQueueRuntime?.hasScheduledTask) {
        throw new OpenChamberControlError('Scheduled queue provenance service is unavailable', 503);
      }
      if (await messageQueueRuntime.hasScheduledTask(projectId, task.id)) {
        throw new OpenChamberControlError('task is already queued', 409);
      }
      const options = task.execution.useDefaults
        ? { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }
        : {
          providerId: task.execution.providerID ?? null,
          modelId: task.execution.modelID ?? null,
          agentId: null,
          variant: task.execution.variant ?? null,
          reasoningEffort: null,
        };
      const scheduledTask: ScheduledTaskProvenance = {
        projectId,
        taskId: task.id,
        sessionId: scope.sessionId,
        workspaceId: scope.workspaceId,
        mode: 'existing',
        triggeredAt,
      };
      if (!expandPrompt) throw new OpenChamberControlError('Native scheduled prompt capture is unavailable', 503);
      const request = PromptRequestSchema.parse(
        await expandPrompt(
          scope,
          PromptRequestSchema.parse({
            input: { text: task.execution.prompt, attachments: [], context: [createScheduledTaskContext(scheduledTask)] },
            options,
          }),
        ),
      );
      const result = await projectConfigRuntime.updateScheduledTaskState(projectId, task.id, {
        lastRunAt: triggeredAt,
        lastStatus: 'queued',
        lastError: undefined,
        lastSessionId: targetSessionId,
        updatedAt: Date.now(),
      });
      emitTaskRunEvent?.({
        projectID: projectId,
        taskID: task.id,
        status: 'queued',
        ranAt: Date.now(),
        sessionID: targetSessionId,
      });
      const queue = await messageQueueRuntime.getState(scope);
      await messageQueueRuntime.append(
        scope,
        randomUUID(),
        QueueAppendRequestSchema.parse({ expectedRevision: queue.revision, content: task.execution.prompt, request }),
      );
      return { ok: true, task: result.task, sessionID: targetSessionId, directory };
    } catch (error) {
      const parsedError = ErrorMetaSchema.safeParse(error);
      const message = parsedError.success && parsedError.data.message ? parsedError.data.message : 'Scheduled task failed';
      const statusCode = parsedError.success ? (parsedError.data.statusCode ?? parsedError.data.status) : undefined;
      const queued = statusCode === 409 && message === 'task is already queued';
      let updated: ScheduledTask | null = task;
      try {
        updated = await record(projectId, task.id, queued ? 'skipped' : 'failed', message, triggeredAt);
      } catch (persistError) {
        const parsedPersist = ErrorMetaSchema.safeParse(persistError);
        console.warn('[scheduled-tasks] admission failure state write failed:', parsedPersist.success ? parsedPersist.data.message : undefined);
      }
      const failure: ExistingSessionRunResult = { ok: false, queued, error: message, task: updated };
      if (statusCode !== undefined) failure.statusCode = statusCode;
      return failure;
    } finally {
      admissions.delete(key);
    }
  };

  const beforeSend = async (scope: ScheduledTaskSessionScope, capture: { request?: PromptRequest }): Promise<void> => {
    const provenance = scheduledProvenance(capture);
    if (!provenance) return;
    const { projectId, taskId } = provenance;
    const task = (await projectConfigRuntime.listScheduledTasks(projectId)).find((entry) => entry.id === taskId);
    if (!task) throw new OpenChamberControlError('Scheduled task was removed', 409);
    if (scope.hostProjectId !== projectId
      || (provenance.workspaceId && provenance.workspaceId !== scope.workspaceId)
      || (provenance.sessionId && provenance.sessionId !== scope.sessionId)) {
      throw new OpenChamberControlError('Scheduled target scope changed', 409);
    }
    if (provenance.mode === 'new') {
      if (task.targetSessionId) throw new OpenChamberControlError('Scheduled task target changed', 409);
      return;
    }
    if (task.targetSessionId !== scope.sessionId) throw new OpenChamberControlError('Scheduled task target changed', 409);
    const target = await validateTarget(projectId, scope.sessionId);
    if (target.scope.workspaceId !== scope.workspaceId || target.scope.cwd !== scope.cwd) {
      throw new OpenChamberControlError('Scheduled target moved', 409);
    }
  };

  return {
    validateTarget,
    listEligibleTargets,
    run,
    beforeSend,
    result: (provenance: ScheduledTaskProvenance, status: ScheduledTaskStatus, error?: string) =>
      provenance.mode === 'new' ? Promise.resolve(null) : record(provenance.projectId, provenance.taskId, status, error),
    cancel: (projectId: string, taskId: string) => messageQueueRuntime?.cancelScheduledTask?.(projectId, taskId),
  };
};
