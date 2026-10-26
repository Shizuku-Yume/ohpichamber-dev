import path from 'node:path';
import { DateTime } from 'luxon';
import { CronExpressionParser } from 'cron-parser';
import { CapturedSendOptionsSchema, PromptRequestSchema, SessionCreateAckSchema } from '@openchamber/agent-contract';

import { discoverLoops } from './loops.js';
import { createExistingSessionTasks, createScheduledTaskContext } from './existing-session.js';
import { createScheduledPromptExpander } from './file-resource-prompt.js';

const DEFAULT_GLOBAL_CONCURRENCY = 4;
const DEFAULT_PROJECT_CONCURRENCY = 2;
const DEFAULT_MAX_RUN_MS = 30 * 60 * 1000;
const JITTER_MAX_MS = 2_000;
const TASK_TITLE_MAX_LENGTH = 120;
const TASK_DUE_SLACK_MS = 5_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

const buildTaskKey = (projectID, taskID) => `${projectID}:${taskID}`;

const parseTimeParts = (time) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof time === 'string' ? time : '');
  if (!match) {
    return null;
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
};

const applyTimeToDate = (baseDateTime, time) => {
  const parsed = parseTimeParts(time);
  if (!parsed) {
    return null;
  }
  return baseDateTime.set({
    hour: parsed.hour,
    minute: parsed.minute,
    second: 0,
    millisecond: 0,
  });
};

const resolveScheduleTimes = (schedule) => {
  const times = [];
  if (Array.isArray(schedule?.times)) {
    for (const candidate of schedule.times) {
      if (typeof candidate === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(candidate)) {
        times.push(candidate);
      }
    }
  }
  if (times.length === 0 && typeof schedule?.time === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(schedule.time)) {
    times.push(schedule.time);
  }
  return Array.from(new Set(times)).sort((a, b) => a.localeCompare(b));
};

const weekdayAsZeroBased = (dateTime) => {
  if (!dateTime || typeof dateTime.weekday !== 'number') {
    return null;
  }
  return dateTime.weekday % 7;
};

const safeErrorMessage = (error, maxLength = 2_000) => {
  const raw = error instanceof Error
    ? (error.message || String(error))
    : String(error ?? 'Unknown error');
  const trimmed = raw.trim();
  if (!trimmed) {
    return 'Unknown error';
  }
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

export const computeNextRunAt = (task, nowMs = Date.now()) => {
  if (!task?.enabled) {
    return null;
  }

  const schedule = task.schedule;
  if (!schedule || typeof schedule !== 'object') {
    return null;
  }

  const zone = typeof schedule.timezone === 'string' && schedule.timezone.trim().length > 0
    ? schedule.timezone.trim()
    : DateTime.local().zoneName;

  const now = DateTime.fromMillis(nowMs, { zone });
  if (!now.isValid) {
    return null;
  }

  if (schedule.kind === 'daily') {
    const times = resolveScheduleTimes(schedule);
    if (times.length === 0) {
      return null;
    }
    const minAllowed = now.plus({ milliseconds: TASK_DUE_SLACK_MS });

    for (const time of times) {
      const candidateToday = applyTimeToDate(now, time);
      if (!candidateToday || !candidateToday.isValid) {
        continue;
      }
      if (candidateToday > minAllowed) {
        return candidateToday.toMillis();
      }
    }

    const tomorrow = now.plus({ days: 1 });
    const firstTomorrow = applyTimeToDate(tomorrow, times[0]);
    return firstTomorrow?.isValid ? firstTomorrow.toMillis() : null;
  }

  if (schedule.kind === 'weekly') {
    if (!Array.isArray(schedule.weekdays) || schedule.weekdays.length === 0) {
      return null;
    }
    const times = resolveScheduleTimes(schedule);
    if (times.length === 0) {
      return null;
    }
    const weekdaysSet = new Set(schedule.weekdays);
    const minAllowed = now.plus({ milliseconds: TASK_DUE_SLACK_MS });

    for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
      const dayCandidate = now.plus({ days: dayOffset });
      const zeroBasedWeekday = weekdayAsZeroBased(dayCandidate);
      if (zeroBasedWeekday === null || !weekdaysSet.has(zeroBasedWeekday)) {
        continue;
      }
      for (const time of times) {
        const withTime = applyTimeToDate(dayCandidate, time);
        if (!withTime || !withTime.isValid) {
          continue;
        }
        if (withTime > minAllowed) {
          return withTime.toMillis();
        }
      }
    }
    return null;
  }

  if (schedule.kind === 'once') {
    if (typeof schedule.date !== 'string' || typeof schedule.time !== 'string') {
      return null;
    }

    const parsed = DateTime.fromFormat(
      `${schedule.date} ${schedule.time}`,
      'yyyy-LL-dd HH:mm',
      { zone },
    );
    if (!parsed.isValid) {
      return null;
    }

    const minAllowed = now.plus({ milliseconds: TASK_DUE_SLACK_MS });
    if (parsed <= minAllowed) {
      return null;
    }

    return parsed.toMillis();
  }

  if (schedule.kind === 'cron') {
    try {
      const iterator = CronExpressionParser.parse(schedule.cron, {
        tz: zone,
        currentDate: new Date(nowMs),
      });
      return iterator.next().getTime();
    } catch {
      return null;
    }
  }

  return null;
};

export const formatScheduledSessionTitle = (task, nowMs = Date.now()) => {
  const timezone = typeof task?.schedule?.timezone === 'string' && task.schedule.timezone.trim().length > 0
    ? task.schedule.timezone.trim()
    : DateTime.local().zoneName;
  const stamp = DateTime.fromMillis(nowMs, { zone: timezone }).toFormat('yyyy-LL-dd HH:mm');
  const taskName = typeof task?.name === 'string' && task.name.trim().length > 0
    ? task.name.trim()
    : 'Scheduled task';
  const suffix = ` ${stamp}`;
  const maxTaskNameLength = Math.max(1, TASK_TITLE_MAX_LENGTH - suffix.length);
  const trimmedName = taskName.length > maxTaskNameLength
    ? taskName.slice(0, maxTaskNameLength)
    : taskName;
  return `${trimmedName}${suffix}`;
};

export const createScheduledTasksRuntime = (deps) => {
  const {
    projectConfigRuntime,
    listProjects,
    sessionService,
    service,
    resolveWorkspaceScope,
    resolveSessionScope,
    listWorkspaceScopes,
    createChatWorkspace,
    emitTaskRunEvent,
    setSessionAutoAccept,

    chatsScope = null,
    readSessionDefaults = null,
    messageQueueRuntime,
    readDefaultGoalTokenBudget = async () => null,
    isSessionArchived,
    logger = console,
    maxGlobalConcurrency = DEFAULT_GLOBAL_CONCURRENCY,
    maxProjectConcurrency = DEFAULT_PROJECT_CONCURRENCY,
    maxRunDurationMs = DEFAULT_MAX_RUN_MS,
  } = deps;
  const expandPrompt = createScheduledPromptExpander({ service, resolveWorkspaceScope });

  const existingSessionTasks = createExistingSessionTasks({
    projectConfigRuntime, messageQueueRuntime, sessionService, resolveSessionScope,
    isSessionArchived, emitTaskRunEvent, expandPrompt,
  });

  // A pinned task runs on what it stores; one that follows the session
  // defaults reads them now, so changing a default reaches it on its next run.
  const resolveRunSelection = async (projectID, task) => {
    if (task.execution.useDefaults) {
      if (typeof readSessionDefaults !== 'function') throw new Error('Session defaults are unavailable');
      return CapturedSendOptionsSchema.parse(await readSessionDefaults(projectID));
    }
    return CapturedSendOptionsSchema.parse({
      providerId: task.execution.providerID ?? null,
      modelId: task.execution.modelID ?? null,
      agentId: null,
      variant: task.execution.variant ?? null,
      reasoningEffort: null,
    });
  };

  let started = false;
  const tasksByProject = new Map();
  const projectPathByID = new Map();
  const timersByTaskKey = new Map();
  const queuedTaskKeys = new Set();
  const runningTaskKeys = new Set();
  const runningCountByProject = new Map();
  let runningGlobalCount = 0;
  const queue = [];

  const clearTimerForKey = (taskKey) => {
    const timer = timersByTaskKey.get(taskKey);
    if (timer) {
      clearTimeout(timer);
      timersByTaskKey.delete(taskKey);
    }
  };

  const clearProjectTimers = (projectID) => {
    const tasks = tasksByProject.get(projectID);
    if (!tasks) {
      return;
    }
    for (const task of tasks.values()) {
      clearTimerForKey(buildTaskKey(projectID, task.id));
      queuedTaskKeys.delete(buildTaskKey(projectID, task.id));
    }
  };

  const setProjectTasks = (projectID, tasks) => {
    clearProjectTimers(projectID);
    const taskMap = new Map();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }
    tasksByProject.set(projectID, taskMap);
  };

  const scheduleTask = (projectID, taskID, nextRunAt) => {
    const taskKey = buildTaskKey(projectID, taskID);
    clearTimerForKey(taskKey);

    if (!started) {
      return;
    }

    if (!Number.isFinite(nextRunAt) || nextRunAt <= 0) {
      return;
    }

    const delayBase = Math.max(0, Math.round(nextRunAt - Date.now()));
    const jitter = Math.floor(Math.random() * (JITTER_MAX_MS + 1));
    const delay = delayBase + jitter;
    const boundedDelay = Math.min(delay, MAX_TIMER_DELAY_MS);

    const timer = setTimeout(async () => {
      if (delay > MAX_TIMER_DELAY_MS) {
        scheduleTask(projectID, taskID, nextRunAt);
        return;
      }

      clearTimerForKey(taskKey);
      const taskMap = tasksByProject.get(projectID);
      const task = taskMap?.get(taskID);
      if (!task || !task.enabled) {
        return;
      }
      queueTaskRun(projectID, taskID, 'scheduled', nextRunAt);
      pumpQueue();
    }, boundedDelay);

    timersByTaskKey.set(taskKey, timer);
  };

  const updateInMemoryTask = (projectID, nextTask) => {
    if (!nextTask) {
      return;
    }
    const taskMap = tasksByProject.get(projectID);
    if (!taskMap) {
      return;
    }
    taskMap.set(nextTask.id, nextTask);
  };

  const syncTaskSchedule = async (projectID, task) => {
    if (!task) {
      return;
    }
    const nextRunAt = computeNextRunAt(task, Date.now());
    const statePatch = {
      nextRunAt: Number.isFinite(nextRunAt) ? nextRunAt : undefined,
      updatedAt: Date.now(),
    };
    const result = await projectConfigRuntime.updateScheduledTaskState(projectID, task.id, statePatch);
    if (result.task) {
      updateInMemoryTask(projectID, result.task);
      if (result.task.enabled && Number.isFinite(result.task.state?.nextRunAt)) {
        scheduleTask(projectID, result.task.id, result.task.state.nextRunAt);
      }
    }
  };

  const isChatsScope = (projectID) => Boolean(chatsScope) && projectID === chatsScope.id;

  const listScopes = async () => {
    const projects = await listProjects();
    if (!chatsScope || projects.some((project) => project?.id === chatsScope.id)) {
      return projects;
    }
    return [...projects, { id: chatsScope.id, path: chatsScope.root }];
  };

  const ensureProjectPath = async (projectID) => {
    if (projectPathByID.has(projectID)) {
      return projectPathByID.get(projectID) || null;
    }

    try {
      const projects = await listScopes();
      const project = projects.find((item) => item?.id === projectID && item?.path);
      if (project?.path) {
        projectPathByID.set(projectID, project.path);
        return project.path;
      }
    } catch {
    }

    return null;
  };

  const syncProject = async (projectID) => {
    await ensureProjectPath(projectID);
    const projectPath = projectPathByID.get(projectID) || null;

    let tasks;
    // The chats root is not a repository: user-scope loops already run once
    // per project, and discovering them here would add one more run each.
    if (projectPath && !isChatsScope(projectID)) {
      // Reconcile `.agents/loops` definitions with the persisted task list:
      // loop files are authoritative while present, removed files unschedule
      // their task, and runtime state is preserved (see loops.js).
      const loops = await discoverLoops(projectPath);
      tasks = await projectConfigRuntime.reconcileLoopTasks(projectID, loops);
    } else {
      tasks = await projectConfigRuntime.listScheduledTasks(projectID);
    }

    setProjectTasks(projectID, tasks);

    for (const task of tasks) {
      await syncTaskSchedule(projectID, task);
    }

    return tasks;
  };

  const syncAllProjects = async () => {
    const projects = await listScopes();
    const activeProjectIDs = new Set();
    projectPathByID.clear();
    for (const project of projects) {
      if (!project?.id || !project?.path) {
        continue;
      }
      activeProjectIDs.add(project.id);
      projectPathByID.set(project.id, project.path);
    }

    for (const existingProjectID of Array.from(tasksByProject.keys())) {
      if (!activeProjectIDs.has(existingProjectID)) {
        clearProjectTimers(existingProjectID);
        tasksByProject.delete(existingProjectID);
      }
    }

    for (const projectID of activeProjectIDs) {
      try {
        await syncProject(projectID);
      } catch (error) {
        // One project's config being unusable (a broken file, a lock timeout)
        // must not keep every other project's tasks from being scheduled.
        logger.warn?.('[ScheduledTasks] failed to sync project', {
          projectID,
          error: error?.message ?? String(error),
        });
      }
    }
  };

  const queueTaskRun = (projectID, taskID, reason, scheduledFor) => {
    const taskKey = buildTaskKey(projectID, taskID);
    if (queuedTaskKeys.has(taskKey) || runningTaskKeys.has(taskKey)) {
      return;
    }
    queuedTaskKeys.add(taskKey);
    queue.push({
      projectID,
      taskID,
      reason,
      ...(Number.isFinite(scheduledFor) ? { scheduledFor } : {}),
    });
  };

  const canRunTask = (projectID) => {
    if (runningGlobalCount >= maxGlobalConcurrency) {
      return false;
    }
    const projectRunning = runningCountByProject.get(projectID) || 0;
    return projectRunning < maxProjectConcurrency;
  };

  const resolveProjectWorkspace = async (projectID, projectPath) => {
    if (typeof listWorkspaceScopes !== 'function' || typeof resolveWorkspaceScope !== 'function') throw new Error('Workspace scope service is unavailable');
    const page = await listWorkspaceScopes();
    if (!page || !Array.isArray(page.items) || !page.errors) throw new Error('Workspace scope enumeration failed');
    const scopes = await Promise.all(page.items.map(async ({ workspaceId }) => {
      try { return await resolveWorkspaceScope(workspaceId); }
      catch { return null; }
    }));
    const matches = scopes.filter((scope) => scope?.hostProjectId === projectID && path.resolve(scope.cwd) === path.resolve(projectPath));
    if (matches.length !== 1) throw new Error('Scheduled project workspace is unavailable or ambiguous');
    return matches[0];
  };

  const runTaskWithWatchdog = async (projectID, task, reason, onSessionCreated) => {
    const startedAt = Date.now();
    const projectPath = await ensureProjectPath(projectID);
    if (!projectPath) throw new Error('Project path is unavailable');
    if (typeof sessionService?.create !== 'function' || (task.execution.goalEnabled
      ? typeof sessionService?.control !== 'function'
      : typeof sessionService?.send !== 'function')) throw new Error('Canonical session service is unavailable');
    const options = await resolveRunSelection(projectID, task);
    const workspace = isChatsScope(projectID)
      ? await (typeof createChatWorkspace === 'function' ? createChatWorkspace() : Promise.reject(new Error('Managed chat workspace service is unavailable')))
      : await resolveProjectWorkspace(projectID, projectPath);
    if (!workspace?.workspaceId || !workspace.projectId || !workspace.cwd || workspace.hostProjectId !== projectID) throw new Error('Scheduled workspace is not authorized');
    let sessionID;
    let prompt;
    try {
      prompt = await expandPrompt(workspace, PromptRequestSchema.parse({ input: { text: task.execution.prompt, attachments: [], context: [] }, options }));
      const created = SessionCreateAckSchema.parse(await sessionService.create({
        projectId: workspace.projectId, workspaceId: workspace.workspaceId, options: prompt.options,
        metadata: { title: formatScheduledSessionTitle(task, startedAt) },
      }));
      sessionID = created.session.sessionId;
      if (created.session.projectId !== workspace.projectId || created.session.workspaceId !== workspace.workspaceId) throw new Error('Scheduled session scope mismatch');
    } catch (error) {
      if (isChatsScope(projectID)) await chatsScope.discardChatDirectory(workspace.cwd);
      throw error;
    }
    await onSessionCreated?.(sessionID);
    emitTaskRunEvent?.({ projectID, taskID: task.id, ranAt: startedAt, status: 'running', sessionID });
    if (task.execution.permissionAutoAccept) {
      if (typeof setSessionAutoAccept !== 'function') throw new Error('Permission policy service is unavailable');
      try { await setSessionAutoAccept(sessionID, true, workspace.cwd); }
      catch (error) { logger.warn?.('[scheduled-tasks] permission auto-accept enrollment failed; approvals remain manual', sessionID, error?.message ?? error); }
    }
    if (task.execution.goalEnabled) {
      const tokenBudget = task.execution.goalTokenBudget ?? await readDefaultGoalTokenBudget(projectID);
      const result = await sessionService.control(sessionID, { type: 'goal', op: 'create', objective: prompt.input.text, tokenBudget: tokenBudget ?? null });
      if (result?.type !== 'goal' || result.mode?.kind !== 'goal' || result.mode.status !== 'active') throw new Error('Scheduled goal acknowledgement is invalid');
    } else {
      const context = [createScheduledTaskContext({ projectId: projectID, taskId: task.id, sessionId: sessionID, workspaceId: workspace.workspaceId, mode: 'new', triggeredAt: startedAt })];
      const result = await sessionService.send(sessionID, PromptRequestSchema.parse({ input: { ...prompt.input, context }, options: prompt.options }));
      if (!result?.run || result.run.sessionId !== sessionID) throw new Error('Scheduled prompt acknowledgement is invalid');
    }
    const finishedAt = Date.now();
    return { sessionID, directory: workspace.cwd, durationMs: Math.max(0, finishedAt - startedAt), reason, startedAt, finishedAt };
  };

  const releaseRunningSlot = (projectID, taskKey) => {
    runningTaskKeys.delete(taskKey);
    runningGlobalCount = Math.max(0, runningGlobalCount - 1);
    const nextProjectCount = Math.max(0, (runningCountByProject.get(projectID) || 1) - 1);
    if (nextProjectCount === 0) {
      runningCountByProject.delete(projectID);
    } else {
      runningCountByProject.set(projectID, nextProjectCount);
    }
  };

  /**
   * Arm a timer only for a future occurrence. Scheduling a past nextRunAt
   * (delay 0 + jitter) re-enters the claim path immediately and can spin —
   * especially for once tasks where the claim cannot advance nextRunAt.
   */
  const scheduleFutureRun = (projectID, taskID, nextRunAt, fromMs = Date.now()) => {
    if (!Number.isFinite(nextRunAt)) {
      return false;
    }
    const base = Number.isFinite(fromMs) ? fromMs : Date.now();
    if (nextRunAt <= base) {
      return false;
    }
    scheduleTask(projectID, taskID, nextRunAt);
    return true;
  };

  const rearmFromTaskOrCompute = (projectID, taskID, fallbackTask, fromMs) => {
    const latest = (tasksByProject.get(projectID)?.get(taskID)) || fallbackTask;
    if (!latest?.enabled) {
      return;
    }
    const base = Number.isFinite(fromMs) ? fromMs : Date.now();
    const persistedNext = latest.state?.nextRunAt;
    // Prefer a still-future persisted slot; never re-arm a past occurrence
    // (that created silent once-task loser loops and claim-failed retry spam).
    if (scheduleFutureRun(projectID, taskID, persistedNext, base)) {
      return;
    }
    const computedNext = computeNextRunAt(latest, base);
    scheduleFutureRun(projectID, taskID, computedNext, base);
  };

  const runTask = async (projectID, taskID, reason, scheduledFor) => {
    const taskMap = tasksByProject.get(projectID);
    const task = taskMap?.get(taskID);
    // Manual runNow runs paused tasks too; only scheduled dispatches skip them.
    if (!task || (reason !== 'manual' && !task.enabled)) {
      return { ok: false, skipped: true };
    }

    if (task.targetSessionId) {
      if (!existingSessionTasks) return { ok: false, error: 'Existing-session scheduling is unavailable', statusCode: 503 };
      const nextRunAt = computeNextRunAt(task, Math.max(Date.now(), (scheduledFor ?? 0) + 1));
      const result = await existingSessionTasks.run(projectID, task, reason, scheduledFor, nextRunAt);
      if (reason === 'scheduled') {
        if (task.schedule.kind === 'once' && result.task && !result.skipped) {
          try {
            const consumed = await projectConfigRuntime.upsertScheduledTask(projectID, { ...result.task, enabled: false });
            updateInMemoryTask(projectID, consumed.task);
          } catch (consumeError) {
            logger.warn?.('[ScheduledTasks] failed to consume one-time task', {
              projectID,
              taskID,
              error: safeErrorMessage(consumeError),
            });
          }
        } else scheduleFutureRun(projectID, taskID, nextRunAt);
      }
      return result;
    }

    const taskKey = buildTaskKey(projectID, taskID);
    if (runningTaskKeys.has(taskKey)) {
      return { ok: false, running: true };
    }

    runningTaskKeys.add(taskKey);
    runningGlobalCount += 1;
    runningCountByProject.set(projectID, (runningCountByProject.get(projectID) || 0) + 1);

    // Every path that holds the running slot must exit through this finally so
    // lock timeouts / fs errors on claim, manual-start, or completion writes
    // cannot permanently stuck-run the task in this process.
    try {
      const runStartedAt = Date.now();

      // Scheduled dispatches must claim the occurrence in shared project config
      // before creating a session. Two server instances (e.g. CLI serve + desktop)
      // each arm their own timer; without this claim both would run (#2710).
      if (reason === 'scheduled') {
        if (!Number.isFinite(scheduledFor)) {
          return { ok: false, skipped: true, reason: 'missing-scheduled-for' };
        }

        const nextAfterClaim = computeNextRunAt(task, Math.max(runStartedAt, scheduledFor + 1));
        const claimPatch = {
          lastScheduledFor: Math.round(scheduledFor),
          lastRunAt: runStartedAt,
          lastStatus: 'running',
          lastError: undefined,
          // Set again once this run creates its session.
          lastSessionId: undefined,
          updatedAt: runStartedAt,
          // Always set nextRunAt so a past once-slot is cleared when there is
          // no following occurrence (omitting the key would leave the past value).
          nextRunAt: Number.isFinite(nextAfterClaim) ? nextAfterClaim : undefined,
        };

        // Duplicate protection is solely lastScheduledFor within slack of this
        // occurrence. Do not reject on advanced disk nextRunAt: lastScheduledFor
        // persists across days, so a second-instance sync inside TASK_DUE_SLACK_MS
        // would otherwise suppress every armed occurrence after the first.
        const canClaimOccurrence = (candidate) => {
          if (!candidate?.enabled) {
            return false;
          }
          const lastScheduledFor = candidate.state?.lastScheduledFor;
          if (
            Number.isFinite(lastScheduledFor)
            && Math.abs(lastScheduledFor - scheduledFor) <= TASK_DUE_SLACK_MS
          ) {
            return false;
          }
          return true;
        };

        let claimResult;
        try {
          claimResult = await projectConfigRuntime.updateScheduledTaskStateIf(projectID, taskID, canClaimOccurrence, claimPatch);
        } catch (claimError) {
          const message = safeErrorMessage(claimError);
          logger.warn?.('[ScheduledTasks] occurrence claim failed', {
            projectID,
            taskID,
            error: message,
          });
          rearmFromTaskOrCompute(projectID, taskID, task, Math.max(runStartedAt, scheduledFor + 1));

          // Best-effort record so once tasks are not left enabled-but-inert with
          // no UI signal. Do not clobber a winner that claimed this occurrence.
          const claimFailurePatch = {
            lastStatus: 'error',
            lastError: `Scheduled claim failed: ${message}`,
            updatedAt: Date.now(),
          };
          try {
            const recorded = await projectConfigRuntime.updateScheduledTaskStateIf(
              projectID, taskID,
              (candidate) => !Number.isFinite(candidate.state?.lastScheduledFor) || Math.abs(candidate.state.lastScheduledFor - scheduledFor) > TASK_DUE_SLACK_MS,
              claimFailurePatch,
            );
            if (recorded.task) updateInMemoryTask(projectID, recorded.task);
          } catch {
            updateInMemoryTask(projectID, {
              ...task,
              state: {
                ...(task.state || {}),
                ...claimFailurePatch,
              },
            });
          }

          return { ok: false, skipped: true, reason: 'claim-failed', error: message };
        }

        if (!claimResult?.updated) {
          if (claimResult?.task) {
            updateInMemoryTask(projectID, claimResult.task);
            // Loser must not schedule a past nextRunAt (once-task spin).
            rearmFromTaskOrCompute(
              projectID,
              taskID,
              claimResult.task,
              Math.max(Date.now(), scheduledFor + 1),
            );
          }
          return { ok: false, skipped: true, reason: 'occurrence-claimed' };
        }

        if (claimResult.task) {
          updateInMemoryTask(projectID, claimResult.task);
        }
      } else {
        try {
          const startResult = await projectConfigRuntime.updateScheduledTaskState(projectID, taskID, {
            lastRunAt: runStartedAt,
            lastStatus: 'running',
            lastError: undefined,
            lastSessionId: undefined,
            updatedAt: runStartedAt,
          });
          if (startResult.task) {
            updateInMemoryTask(projectID, startResult.task);
          }
        } catch (startError) {
          const message = safeErrorMessage(startError);
          logger.warn?.('[ScheduledTasks] manual start state write failed', {
            projectID,
            taskID,
            error: message,
          });
          return { ok: false, error: message, reason: 'start-state-failed' };
        }
      }

      let status = 'success';
      let sessionID;
      let sessionDirectory;
      let durationMs = 0;
      let errorMessage;
      // Known as soon as the run creates its session, so a run that fails or
      // times out afterwards still points at the session it left behind.
      let createdSessionID;
      const recordCreatedSession = async (id) => {
        createdSessionID = id;
        try {
          const recorded = await projectConfigRuntime.updateScheduledTaskState(projectID, taskID, { lastSessionId: id });
          if (recorded.task) {
            updateInMemoryTask(projectID, recorded.task);
          }
        } catch (error) {
          logger.warn?.('[ScheduledTasks] failed to record the run session', {
            projectID,
            taskID,
            error: safeErrorMessage(error),
          });
        }
      };

      try {
        const runPromise = runTaskWithWatchdog(projectID, task, reason, recordCreatedSession);
        let timeoutID;
        const timeoutPromise = new Promise((_, reject) => {
          timeoutID = setTimeout(() => {
            reject(new Error('scheduled task run timed out'));
          }, maxRunDurationMs);
        });

        const result = await Promise.race([runPromise, timeoutPromise]).finally(() => {
          if (timeoutID) {
            clearTimeout(timeoutID);
          }
        });
        sessionID = result.sessionID;
        sessionDirectory = result.directory;
        durationMs = result.durationMs;
        status = 'success';
        logger.info?.(
          '[ScheduledTasks] run completed',
          { projectID, taskID, status, reason, sessionID, durationMs }
        );
      } catch (error) {
        status = 'error';
        errorMessage = safeErrorMessage(error);
        logger.warn?.('[ScheduledTasks] run failed', {
          projectID,
          taskID,
          reason,
          status,
          error: errorMessage,
        });
      }

      const finishedAt = Date.now();
      if (!durationMs) {
        durationMs = Math.max(0, finishedAt - runStartedAt);
      }
      let latestTask = (tasksByProject.get(projectID)?.get(taskID)) || task;
      const shouldConsumeOneTimeTask = latestTask?.schedule?.kind === 'once' && reason === 'scheduled';
      if (shouldConsumeOneTimeTask && latestTask?.enabled) {
        try {
          const consumed = await projectConfigRuntime.upsertScheduledTask(projectID, {
            ...latestTask,
            enabled: false,
          });
          latestTask = consumed.task || latestTask;
          updateInMemoryTask(projectID, latestTask);
        } catch (consumeError) {
          logger.warn?.('[ScheduledTasks] failed to consume one-time task', {
            projectID,
            taskID,
            error: safeErrorMessage(consumeError),
          });
        }
      }

      const nextRunAt = computeNextRunAt(latestTask, finishedAt);

      const statePatch = {
        lastStatus: status,
        lastDurationMs: durationMs,
        lastError: status === 'error' ? errorMessage : undefined,
        lastSessionId: sessionID ?? createdSessionID,
        nextRunAt: Number.isFinite(nextRunAt) ? nextRunAt : undefined,
        updatedAt: finishedAt,
      };

      let stateResult = { task: null };
      try {
        stateResult = await projectConfigRuntime.updateScheduledTaskState(projectID, taskID, statePatch);
        if (stateResult.task) {
          updateInMemoryTask(projectID, stateResult.task);
          if (stateResult.task.enabled) {
            scheduleFutureRun(
              projectID,
              taskID,
              stateResult.task.state?.nextRunAt,
              finishedAt,
            );
          }
        }
      } catch (persistError) {
        const message = safeErrorMessage(persistError);
        logger.warn?.('[ScheduledTasks] run completion state write failed', {
          projectID,
          taskID,
          reason,
          error: message,
        });

        // Keep in-memory status terminal so this process does not advertise
        // a stuck "running" task after the session already finished.
        const recoveredTask = {
          ...latestTask,
          state: {
            ...(latestTask.state || {}),
            lastStatus: status,
            lastDurationMs: durationMs,
            lastError: status === 'error' ? errorMessage : undefined,
            lastSessionId: sessionID ?? createdSessionID,
            nextRunAt: Number.isFinite(nextRunAt) ? nextRunAt : undefined,
            updatedAt: finishedAt,
          },
        };
        updateInMemoryTask(projectID, recoveredTask);

        // Best-effort single retry so persisted lastStatus does not stay 'running'.
        try {
          const retry = await projectConfigRuntime.updateScheduledTaskState(projectID, taskID, statePatch);
          if (retry.task) {
            updateInMemoryTask(projectID, retry.task);
            stateResult = retry;
            if (retry.task.enabled) {
              scheduleFutureRun(projectID, taskID, retry.task.state?.nextRunAt, finishedAt);
            }
          }
        } catch (retryError) {
          logger.warn?.('[ScheduledTasks] run completion state retry failed', {
            projectID,
            taskID,
            reason,
            error: safeErrorMessage(retryError),
          });
          stateResult = { task: recoveredTask };
          rearmFromTaskOrCompute(projectID, taskID, recoveredTask, finishedAt);
        }

        // The session already ran — surface persist failure without treating a
        // successful dispatch as a hard run failure (manual runNow would 500).
        return {
          ok: status === 'success',
          status,
          sessionID,
          directory: sessionDirectory,
          task: stateResult.task || recoveredTask,
          error: status === 'error' ? errorMessage : undefined,
          persistError: message,
          reason: 'completion-state-failed',
        };
      }

      try {
        emitTaskRunEvent?.({
          projectID,
          taskID,
          ranAt: finishedAt,
          status,
          ...(sessionID ? { sessionID } : {}),
        });
      } catch {
      }

      return {
        ok: status === 'success',
        status,
        sessionID,
        directory: sessionDirectory,
        task: stateResult.task || null,
        error: errorMessage,
      };
    } finally {
      releaseRunningSlot(projectID, taskKey);
    }
  };

  const pumpQueue = () => {
    if (!started) {
      return;
    }

    let consumed = false;
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (!canRunTask(item.projectID)) {
        continue;
      }

      queue.splice(index, 1);
      index -= 1;

      const taskKey = buildTaskKey(item.projectID, item.taskID);
      queuedTaskKeys.delete(taskKey);
      consumed = true;

      void runTask(item.projectID, item.taskID, item.reason, item.scheduledFor)
        .catch((error) => {
          logger.warn?.('[ScheduledTasks] queued run rejected', {
            projectID: item.projectID,
            taskID: item.taskID,
            reason: item.reason,
            error: safeErrorMessage(error),
          });
        })
        .finally(() => {
          pumpQueue();
        });
    }

    if (!consumed && queue.length > 0) {
      return;
    }
  };

  const runNow = async (projectID, taskID) => {
    const taskKey = buildTaskKey(projectID, taskID);
    if (runningTaskKeys.has(taskKey)) {
      return {
        ok: false,
        running: true,
        error: 'task is already running',
      };
    }
    if (queuedTaskKeys.has(taskKey)) {
      return {
        ok: false,
        queued: true,
        error: 'task is already queued',
      };
    }

    return runTask(projectID, taskID, 'manual');
  };

  const start = async () => {
    if (started) {
      return;
    }
    const projects = await listScopes();
    let changed = 0;
    for (const project of projects) {
      if (!project?.id || typeof projectConfigRuntime.migrateProjectScheduledTasks !== 'function') continue;
      try { changed += await projectConfigRuntime.migrateProjectScheduledTasks(project.id); }
      catch (error) { logger.warn?.('[scheduled-tasks] root agent migration failed', { projectId: project.id, error: error?.message ?? String(error) }); }
    }
    logger.info?.(`[scheduled-tasks] root agent migration changed=${changed}`);
    started = true;
    await syncAllProjects();
  };

  const stop = async () => {
    if (!started) {
      return;
    }
    started = false;
    for (const timer of timersByTaskKey.values()) {
      clearTimeout(timer);
    }
    timersByTaskKey.clear();
    queuedTaskKeys.clear();
    queue.length = 0;
  };

  const getStatus = () => {
    let enabledCount = 0;
    for (const taskMap of tasksByProject.values()) {
      for (const task of taskMap.values()) {
        if (task?.enabled) {
          enabledCount += 1;
        }
      }
    }

    const runningCount = runningTaskKeys.size;
    return {
      hasEnabledScheduledTasks: enabledCount > 0,
      hasRunningScheduledTasks: runningCount > 0,
      enabledScheduledTasksCount: enabledCount,
      runningScheduledTasksCount: runningCount,
    };
  };

  return {
    start,
    stop,
    syncAllProjects,
    syncProject,
    runNow,
    getStatus,
    validateTarget: (projectID, sessionID) => existingSessionTasks.validateTarget(projectID, sessionID),
    beforeScheduledTaskSend: (scope, capture) => existingSessionTasks.beforeSend(scope, capture),
    onScheduledTaskResult: (provenance, status, error) => existingSessionTasks.result(provenance, status, error),
    cancelWaitingPrompt: (projectID, taskID) => existingSessionTasks?.cancel(projectID, taskID),
  };
};
