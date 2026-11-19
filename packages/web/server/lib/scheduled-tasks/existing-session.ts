import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { EntityIdSchema, PromptRequestSchema, QueueAppendRequestSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { asNonEmptyString } from '../shared/guards.js';
<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/existing-session.js
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/existing-session.js
import { expandSnippets } from '../opencode/snippets.js';
=======
import { expandSnippets } from '../snippets/snippets.js';
import type { OpenCode } from '@opencode/client';
import type { ScheduledTask, ScheduledTaskConfig, ScheduledTaskInput, ScheduledTaskStatePatch, ScheduledTaskStatus, SessionProject } from '../projects/contracts.js';
import type { createMessageQueueRuntime } from '../message-queue/runtime.js';
import type { createChatsScope } from './chats-scope.js';
import type { resolvePrimaryWorktreeRoot } from '../git/service.js';
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/existing-session.ts

<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/existing-session.js
export const createScheduledTaskContext = (provenance) => ({
  kind: 'context', text: '', metadata: { scheduledTask: provenance }, deliveryReceiptId: randomUUID(),
});

// The picker may offer a whole session list; the route caps its own body too.
const TARGET_CANDIDATE_LIMIT = 500;

const scheduledProvenance = (capture) => capture?.request?.input?.context?.find((entry) => entry.kind === 'context' && entry.metadata?.scheduledTask)?.metadata.scheduledTask;

export const createExistingSessionTasks = ({ projectConfigRuntime, messageQueueRuntime, sessionService, resolveSessionScope, isSessionArchived, emitTaskRunEvent, expandPrompt }) => {
  const admissions = new Set();
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/existing-session.js
export const createExistingSessionTasks = ({ projectConfigRuntime, messageQueueRuntime, createClient, listProjects, chatsScope, resolvePrimaryWorktreeRoot, isSessionArchived, emitTaskRunEvent }) => {
  const admissions = new Set();
=======
export interface ExistingSessionDependencies {
  projectConfigRuntime: ScheduledTaskConfig;
  messageQueueRuntime: Pick<ReturnType<typeof createMessageQueueRuntime>, 'enqueue' | 'cancelScheduledTask'>;
  createClient: (directory: string) => Pick<ReturnType<typeof OpenCode.make>, 'session'>;
  listProjects: () => Promise<SessionProject[]>;
  chatsScope?: ReturnType<typeof createChatsScope> | null;
  resolvePrimaryWorktreeRoot?: typeof resolvePrimaryWorktreeRoot | null;
  isSessionArchived?: (sessionID: string) => boolean | Promise<boolean>;
  emitTaskRunEvent?: (event: ExistingSessionTaskRunEvent) => void;
}
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/existing-session.ts

<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/existing-session.js
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
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/existing-session.js
  // The membership rule, in one place: a save or run and the picker's
  // discovery both ask this, so the two can never disagree about whether a
  // directory belongs to a project. Ownership comes from Git through
  // `resolvePrimaryWorktreeRoot`, never from the renderer's worktree topology.
  const ownsDirectory = async (project, directory) => {
    if (!project || !directory) return false;
    if (path.resolve(directory) === path.resolve(project.path)) return true;
    if (!resolvePrimaryWorktreeRoot) return false;
    const owner = await resolvePrimaryWorktreeRoot(directory);
    return Boolean(owner?.root) && path.resolve(owner.root) === path.resolve(project.path);
  };

  const validateTarget = async (projectId, targetSessionId) => {
    if (!z.string().regex(/^[A-Za-z0-9_-]{4,128}$/).safeParse(targetSessionId).success) {
      throw new OpenChamberControlError('targetSessionId is invalid', 400);
    }
    if (await isSessionArchived?.(targetSessionId)) throw new OpenChamberControlError('Scheduled target is archived', 409);
    let session;
    try {
      session = await createClient('').session.get({ sessionID: targetSessionId });
    } catch (error) {
      if (error?.name === 'NotFoundError' || error?.status === 404 || error?.statusCode === 404) throw new OpenChamberControlError('Scheduled target not found', 404);
      throw error;
    }
    if (!session?.id) throw new OpenChamberControlError('Scheduled target not found', 404);
    if (session.id !== targetSessionId) throw new OpenChamberControlError('Scheduled target identity mismatch', 409);
    if (session.time?.archived) throw new OpenChamberControlError('Scheduled target is archived', 409);
    const projects = await listProjects();
    const project = projects.find((entry) => entry.id === projectId);
    const directory = session.location?.directory;
    if (!directory) throw new OpenChamberControlError('Scheduled target has no directory', 409);
    if (projects.some((entry) => entry.id !== projectId && path.resolve(entry.path) === path.resolve(directory))) {
      throw new OpenChamberControlError('Scheduled target belongs to another project', 409);
    }
    let belongs = false;
    if (chatsScope && projectId === chatsScope.id) belongs = chatsScope.contains(directory);
    else if (project && directory) belongs = await ownsDirectory(project, directory);
    if (!belongs) throw new OpenChamberControlError('Scheduled target is outside the task project', 409);
    return { session, directory };
=======
export interface ExistingSessionTaskRunEvent {
  projectID: string;
  taskID: string;
  status: ScheduledTaskStatus;
  ranAt: number;
  sessionID?: string | undefined;
}

export interface ScheduledTaskProvenance {
  projectId: string;
  taskId: string;
}

export interface EligibleScheduledTarget {
  sessionId: string;
  directory: string;
}

const hasReadableError = (value: unknown): value is {
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
  message?: unknown;
} => value !== null && value !== undefined;

const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);
const isTargetCandidate = (value: unknown): value is { sessionId?: unknown; directory?: unknown } => value !== null && value !== undefined;

export const createExistingSessionTasks = ({ projectConfigRuntime, messageQueueRuntime, createClient, listProjects, chatsScope, resolvePrimaryWorktreeRoot, isSessionArchived, emitTaskRunEvent }: ExistingSessionDependencies) => {
  const admissions = new Set<string>();

  const ownsDirectory = async (project: SessionProject | undefined, directory: string) => {
    if (!project || !directory) return false;
    if (path.resolve(directory) === path.resolve(project.path)) return true;
    if (!resolvePrimaryWorktreeRoot) return false;
    const owner = await resolvePrimaryWorktreeRoot(directory);
    return Boolean(owner?.root) && path.resolve(owner.root) === path.resolve(project.path);
  };

  const validateTarget = async (projectId: string, targetSessionId: ScheduledTaskInput['targetSessionId']) => {
    const parsed = z.string().regex(/^[A-Za-z0-9_-]{4,128}$/).safeParse(targetSessionId);
    if (!parsed.success) {
      throw new OpenChamberControlError('targetSessionId is invalid', 400);
    }
    if (await isSessionArchived?.(parsed.data)) throw new OpenChamberControlError('Scheduled target is archived', 409);
    let session;
    try {
      session = await createClient('').session.get({ sessionID: parsed.data });
    } catch (error) {
      if (hasReadableError(error) && (error.name === 'NotFoundError' || error.status === 404 || error.statusCode === 404)) throw new OpenChamberControlError('Scheduled target not found', 404);
      throw error;
    }
    if (!session?.id) throw new OpenChamberControlError('Scheduled target not found', 404);
    if (session.id !== targetSessionId) throw new OpenChamberControlError('Scheduled target identity mismatch', 409);
    if (session.time?.archived) throw new OpenChamberControlError('Scheduled target is archived', 409);
    const projects = await listProjects();
    const project = projects.find((entry) => entry.id === projectId);
    const directory = session.location?.directory;
    if (!directory) throw new OpenChamberControlError('Scheduled target has no directory', 409);
    if (projects.some((entry) => entry.id !== projectId && path.resolve(entry.path) === path.resolve(directory))) {
      throw new OpenChamberControlError('Scheduled target belongs to another project', 409);
    }
    let belongs = false;
    if (chatsScope && projectId === chatsScope.id) belongs = chatsScope.contains(directory);
    else if (project && directory) belongs = await ownsDirectory(project, directory);
    if (!belongs) throw new OpenChamberControlError('Scheduled target is outside the task project', 409);
    return { session, directory };
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/existing-session.ts
  };

<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/existing-session.js
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
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/existing-session.js
  /**
   * The discovery half of the same rule: which candidates a save or run would
   * accept by their directory. Candidates arrive with the directory the client
   * already knows; ownership is resolved here, and a session offered without a
   * directory, or one that is archived or foreign, is never eligible. Whether
   * the session still exists is left to `validateTarget` on save.
   */
  const listEligibleTargets = async (projectId, candidates) => {
    const projects = await listProjects();
    const scopeId = chatsScope ? chatsScope.toStorageID(projectId) : projectId;
    const project = projects.find((entry) => entry.id === scopeId);
    // Many sessions share a few directories, so membership is resolved once
    // per directory: a Git lookup per session would run hundreds of processes.
    const membership = new Map();
    const belongsToTask = (directory) => {
      const key = path.resolve(directory);
      if (!membership.has(key)) {
        membership.set(key, (async () => {
          if (projects.some((entry) => entry.id !== scopeId && path.resolve(entry.path) === key)) return false;
          if (chatsScope && scopeId === chatsScope.id) return chatsScope.contains(directory);
          return project ? ownsDirectory(project, directory) : false;
        })());
      }
      return membership.get(key);
    };
    const eligible = [];
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const sessionId = asNonEmptyString(candidate?.sessionId);
      const directory = asNonEmptyString(candidate?.directory);
      if (!sessionId || !directory) continue;
=======
  const listEligibleTargets = async (projectId: string, candidates: unknown[]) => {
    const projects = await listProjects();
    const scopeId = chatsScope ? chatsScope.toStorageID(projectId) : projectId;
    const project = projects.find((entry) => entry.id === scopeId);
    const membership = new Map<string, Promise<boolean>>();
    const belongsToTask = (directory: string) => {
      const key = path.resolve(directory);
      if (!membership.has(key)) {
        membership.set(key, (async () => {
          if (projects.some((entry) => entry.id !== scopeId && path.resolve(entry.path) === key)) return false;
          if (chatsScope && scopeId === chatsScope.id) return chatsScope.contains(directory);
          return project ? ownsDirectory(project, directory) : false;
        })());
      }
      return membership.get(key);
    };
    const eligible: EligibleScheduledTarget[] = [];
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const sessionId = asNonEmptyString(isTargetCandidate(candidate) ? candidate.sessionId : undefined);
      const directory = asNonEmptyString(isTargetCandidate(candidate) ? candidate.directory : undefined);
      if (!sessionId || !directory) continue;
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/existing-session.ts
      if (await isSessionArchived?.(sessionId)) continue;
      eligible.push({ sessionId, directory });
    }
    return eligible;
  };

<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/existing-session.js
  const record = async (projectId, taskId, status, error, lastRunAt) => {
    const patch = { lastStatus: status, lastError: error || undefined, updatedAt: Date.now() };
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/existing-session.js
  const record = async (projectId, taskId, status, error, lastRunAt) => {
    const patch = {
      lastStatus: status, lastError: error || undefined, updatedAt: Date.now(),
    };
=======
  const record = async (projectId: string, taskId: string, status: ScheduledTaskStatus, cause?: unknown, lastRunAt?: number) => {
    const patch: ScheduledTaskStatePatch = {
      lastStatus: status, lastError: cause || undefined, updatedAt: Date.now(),
    };
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/existing-session.ts
    if (lastRunAt !== undefined) patch.lastRunAt = lastRunAt;
    const result = await projectConfigRuntime.updateScheduledTaskState(projectId, taskId, patch);
    emitTaskRunEvent?.({ projectID: projectId, taskID: taskId, status, ranAt: Date.now(), sessionID: result.task?.state?.lastSessionId });
    return result.task;
  };

  const run = async (projectId: string, task: ScheduledTask, reason: 'manual' | 'scheduled', scheduledFor?: number, nextRunAt?: number | null) => {
    const triggeredAt = Date.now();
    const key = JSON.stringify([projectId, task.id]);
    if (admissions.has(key)) {
<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/existing-session.js
      await record(projectId, task.id, 'skipped', 'task is already queued').catch(() => undefined);
      return { ok: false, queued: true, error: 'task is already queued', statusCode: 409 };
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/existing-session.js
      try {
        await record(projectId, task.id, 'skipped', 'task is already queued');
      } catch (persistError) {
        console.warn('[scheduled-tasks] admission failure state write failed:', persistError?.message);
      }
      return { ok: false, queued: true, error: 'task is already queued' };
=======
      try {
        await record(projectId, task.id, 'skipped', 'task is already queued');
      } catch (persistError) {
        console.warn('[scheduled-tasks] admission failure state write failed:', hasReadableError(persistError) ? persistError.message : undefined);
      }
      return { ok: false, queued: true, error: 'task is already queued' };
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/existing-session.ts
    }
    admissions.add(key);
    try {
      if (reason === 'scheduled') {
        const claim = await projectConfigRuntime.updateScheduledTaskStateIf(projectId, task.id,
          (candidate) => candidate.enabled && (!isFiniteNumber(candidate.state?.lastScheduledFor) || Math.abs(candidate.state.lastScheduledFor - (scheduledFor === undefined ? Number.NaN : scheduledFor)) > 5_000),
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
<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/existing-session.js
      const queued = (error?.status === 409 || error?.statusCode === 409) && error.message === 'task is already queued';
      let updated = task;
      try { updated = await record(projectId, task.id, queued ? 'skipped' : 'failed', error.message, triggeredAt); }
      catch (persistError) { console.warn('[scheduled-tasks] admission failure state write failed:', persistError?.message); }
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/existing-session.js
      if (admitted) await messageQueueRuntime.cancelScheduledTask(projectId, task.id);
      const queued = error?.status === 409 && error.message === 'task is already queued';
      let updated = task;
      try {
        updated = await record(projectId, task.id, queued ? 'skipped' : 'failed', error.message, triggeredAt);
      } catch (persistError) {
        console.warn('[scheduled-tasks] admission failure state write failed:', persistError?.message);
      }
=======
      if (admitted) await messageQueueRuntime.cancelScheduledTask(projectId, task.id);
      const queued = hasReadableError(error) && error.status === 409 && error.message === 'task is already queued';
      let updated: ScheduledTask | null = task;
      try {
        if (!hasReadableError(error)) throw new TypeError(`Cannot read properties of ${error} (reading 'message')`);
        updated = await record(projectId, task.id, queued ? 'skipped' : 'failed', error.message, triggeredAt);
      } catch (persistError) {
        console.warn('[scheduled-tasks] admission failure state write failed:', hasReadableError(persistError) ? persistError.message : undefined);
      }
      if (!hasReadableError(error)) throw new TypeError(`Cannot read properties of ${error} (reading 'message')`);
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/existing-session.ts
      return { ok: false, queued, error: error.message, statusCode: error.statusCode ?? error.status, task: updated };
    } finally { admissions.delete(key); }
  };

<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/existing-session.js
  const beforeSend = async (scope, capture) => {
    const provenance = scheduledProvenance(capture);
    if (!provenance) return;
    const { projectId, taskId } = provenance;
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/existing-session.js
  const beforeSend = async (sessionId, directory, item) => {
    const { projectId, taskId } = item.scheduledTask;
=======
  const beforeSend = async (sessionId: string, directory: string, item: { scheduledTask: ScheduledTaskProvenance }) => {
    const { projectId, taskId } = item.scheduledTask;
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/existing-session.ts
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
<<<<<<< HEAD:packages/web/server/lib/scheduled-tasks/existing-session.js
    result: (provenance, status, error) => provenance.mode === 'new' ? Promise.resolve() : record(provenance.projectId, provenance.taskId, status, error),
    cancel: (projectId, taskId) => messageQueueRuntime.cancelScheduledTask(projectId, taskId),
||||||| bc50ba56aa:packages/web/server/lib/scheduled-tasks/existing-session.js
    result: ({ projectId, taskId }, status, error) => record(projectId, taskId, status, error),
    cancel: (projectId, taskId) => messageQueueRuntime.cancelScheduledTask(projectId, taskId),
=======
    result: ({ projectId, taskId }: ScheduledTaskProvenance, status: ScheduledTaskStatus, cause?: unknown) => record(projectId, taskId, status, cause),
    cancel: (projectId: string, taskId: ScheduledTaskInput['id']) => messageQueueRuntime.cancelScheduledTask(projectId, taskId),
>>>>>>> upstream/main:packages/web/server/lib/scheduled-tasks/existing-session.ts
  };
};
