import path from 'node:path';
import { stat } from 'node:fs/promises';
import { DateTime } from 'luxon';
import { CronExpressionParser } from 'cron-parser';
import { z } from 'zod';
import { CapturedSendOptionsSchema, PromptRequestSchema, SessionCreateAckSchema } from '@openchamber/agent-contract';
import type { CapturedSendOptions, PromptRequest, SessionControlAck, SessionCreateAck, SessionSnapshot, Run } from '@openchamber/agent-contract';
import type { JsonValue } from '../shared/json-values.js';
import type {
  DiscoveredLoop,
  ScheduledTask,
  ScheduledTaskInput,
  ScheduledTaskStatePatch,
  ScheduledTaskStateResult,
  ScheduledTaskStatus,
  ScheduledWorktreeCleanup,
  SessionProject,
} from '../projects/contracts.js';
import type { ScheduledChatsScope } from './chats-scope.js';
import { discoverLoops } from './loops.js';
import { createExistingSessionTasks, createScheduledTaskContext } from './existing-session.js';
import type {
  ExistingSessionMessageQueuePort,
  ExistingSessionRunResult,
  ScheduledTaskProvenance,
  ScheduledTaskRunEvent,
  ScheduledTaskSessionScope,
} from './existing-session.js';
import { createScheduledPromptExpander } from './file-resource-prompt.js';
import { readProcessInstance } from './process-instance.js';
import type { CreateScheduledWorktreeInput, RemoveScheduledWorktreeInput } from './worktree-bridge.js';

const DEFAULT_GLOBAL_CONCURRENCY = 4;
const DEFAULT_PROJECT_CONCURRENCY = 2;
const DEFAULT_MAX_RUN_MS = 30 * 60 * 1000;
const JITTER_MAX_MS = 2_000;
const TASK_TITLE_MAX_LENGTH = 120;
const TASK_DUE_SLACK_MS = 5_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const PENDING_CLEANUP_POLL_MS = 1_000;

export interface ScheduledWorktreeResult {
  directory?: string;
  path?: string;
  branch?: string | null;
  name?: string | null;
}

export interface ScheduledTasksLogger {
  info?: (message: string, meta?: JsonValue | Record<string, JsonValue | undefined>) => void;
  warn?: (message: string, meta?: JsonValue | Record<string, JsonValue | undefined>, extra?: JsonValue) => void;
  error?: (message: string, meta?: JsonValue | Record<string, JsonValue | undefined>) => void;
}

export interface ScheduledTaskProjectConfigPort {
  listScheduledTasks: (projectID: string) => Promise<ScheduledTask[]>;
  updateScheduledTaskState: (projectID: string, taskID: string, patch: ScheduledTaskStatePatch) => Promise<ScheduledTaskStateResult>;
  updateScheduledTaskStateIf: (
    projectID: string,
    taskID: string,
    predicate: (task: ScheduledTask) => boolean,
    patch: ScheduledTaskStatePatch,
  ) => Promise<ScheduledTaskStateResult>;
  upsertScheduledTask: (projectID: string, input: ScheduledTaskInput) => Promise<{ task: ScheduledTask; tasks?: ScheduledTask[]; created?: boolean }>;
  reconcileLoopTasks: (projectID: string, loops: DiscoveredLoop[]) => Promise<ScheduledTask[]>;
  listScheduledWorktreeCleanups?: () => Promise<ScheduledWorktreeCleanup[]>;
  saveScheduledWorktreeCleanup?: (projectID: string, record: Omit<ScheduledWorktreeCleanup, 'projectID'>) => Promise<ScheduledWorktreeCleanup>;
  finishScheduledWorktreeCleanup?: (
    projectID: string,
    sessionID: string,
    remove: ((record: ScheduledWorktreeCleanup, resumingRemoval: boolean) => Promise<void>) | null,
    options?: { signal: AbortSignal },
  ) => Promise<boolean>;
  migrateProjectScheduledTasks?: (projectID: string) => Promise<number>;
}

export interface ScheduledTaskSessionServicePort {
  create?: (payload: JsonValue) => Promise<SessionCreateAck>;
  open?: (sessionId: string) => Promise<SessionSnapshot>;
  control?: (sessionId: string, operation: JsonValue) => Promise<{ run: Run } | SessionControlAck>;
  send?: (sessionId: string, payload: JsonValue) => Promise<{ run: Run }>;
}

export interface ScheduledTasksRuntimeDependencies {
  projectConfigRuntime: ScheduledTaskProjectConfigPort;
  listProjects: () => Promise<SessionProject[]>;
  sessionService?: ScheduledTaskSessionServicePort;
  service?: {
    request: (pathname: string, init?: RequestInit) => Promise<globalThis.Response>;
  };
  resolveWorkspaceScope?: (workspaceId: string) => Promise<Omit<ScheduledTaskSessionScope, 'sessionId'> | null>;
  resolveSessionScope?: (sessionId: string) => Promise<ScheduledTaskSessionScope | null>;
  listWorkspaceScopes?: () => Promise<{ items: { workspaceId: string }[]; errors: Record<string, string> }>;
  createChatWorkspace?: () => Promise<Omit<ScheduledTaskSessionScope, 'sessionId'>>;
  emitTaskRunEvent?: (event: ScheduledTaskRunEvent) => void;
  setSessionAutoAccept?: (sessionId: string, enabled: boolean, directory: string) => Promise<void>;
  chatsScope?: Pick<ScheduledChatsScope, 'id' | 'root' | 'discardChatDirectory'> | null;
  readSessionDefaults?: ((projectID: string) => Promise<CapturedSendOptions>) | null;
  messageQueueRuntime?: ExistingSessionMessageQueuePort;
  readDefaultGoalTokenBudget?: (projectID: string) => Promise<number | null>;
  isSessionArchived?: (sessionID: string) => Promise<boolean>;
  createTaskWorktree?: ((input: CreateScheduledWorktreeInput) => Promise<ScheduledWorktreeResult | null>) | null;
  removeTaskWorktree?: ((input: RemoveScheduledWorktreeInput) => Promise<void>) | null;
  isGitRepository?: ((directory: string) => boolean | Promise<boolean>) | null;
  readWorktreeIdentity?: (directory: string) => Promise<string | null>;
  readProcessIdentity?: (pid: number) => Promise<string | null>;
  logger?: ScheduledTasksLogger;
  maxGlobalConcurrency?: number;
  maxProjectConcurrency?: number;
  maxRunDurationMs?: number;
}

export interface ScheduleCalculationInput {
  enabled?: boolean;
  schedule?: {
    kind?: string;
    times?: string[];
    time?: string;
    weekdays?: number[];
    date?: string;
    cron?: string;
    timezone?: string;
  } | null;
}

export interface ScheduledTitleTaskInput {
  name?: string;
  schedule?: {
    timezone?: string;
  } | null;
}

export interface QueuedTaskRunItem {
  projectID: string;
  taskID: string;
  reason: 'scheduled' | 'manual';
  scheduledFor?: number;
}

export interface ScheduledTaskRunOutcome {
  ok: boolean;
  status?: ScheduledTaskStatus;
  sessionID?: string;
  directory?: string;
  task?: ScheduledTask | null;
  error?: string;
  persistError?: string;
  reason?: string;
  skipped?: boolean;
  running?: boolean;
  queued?: boolean;
  statusCode?: number;
}

interface IsolationRef {
  current: ScheduledWorktreeResult | null;
}

interface TaskStateHolder {
  task: ScheduledTask | null;
}
const FsErrorCodeSchema = z.object({
  code: z.string().optional(),
});

const ErrorMessageSchema = z.object({
  message: z.string().optional(),
  statusCode: z.number().optional(),
  status: z.number().optional(),
});

const readDirectoryIdentity = async (directory: string): Promise<string | null> => {
  try {
    const info = await stat(directory, { bigint: true });
    return info.isDirectory() ? `${info.dev}:${info.ino}` : null;
  } catch (error) {
    const parsed = FsErrorCodeSchema.safeParse(error);
    if (parsed.success && (parsed.data.code === 'ENOENT' || parsed.data.code === 'ENOTDIR')) return null;
    throw error;
  }
};

const buildTaskKey = (projectID: string, taskID: string): string => `${projectID}:${taskID}`;

const parseTimeParts = (time: string | undefined): { hour: number; minute: number } | null => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(z.string().safeParse(time).data ?? '');
  if (!match) return null;
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
};

const applyTimeToDate = (baseDateTime: DateTime, time: string | undefined): DateTime | null => {
  const parsed = parseTimeParts(time);
  if (!parsed) return null;
  return baseDateTime.set({
    hour: parsed.hour,
    minute: parsed.minute,
    second: 0,
    millisecond: 0,
  });
};

const resolveScheduleTimes = (schedule: NonNullable<ScheduleCalculationInput['schedule']>): string[] => {
  const times: string[] = [];
  if (Array.isArray(schedule.times)) {
    for (const candidate of schedule.times) {
      if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(candidate)) {
        times.push(candidate);
      }
    }
  }
  if (times.length === 0 && schedule.time && /^([01]\d|2[0-3]):([0-5]\d)$/.test(schedule.time)) {
    times.push(schedule.time);
  }
  return Array.from(new Set(times)).sort((a, b) => a.localeCompare(b));
};

const weekdayAsZeroBased = (dateTime: DateTime): number | null => {
  if (!Number.isFinite(dateTime.weekday)) return null;
  return dateTime.weekday % 7;
};

const safeErrorMessage = (cause: unknown, maxLength = 2_000): string => {
  const raw = cause instanceof Error
    ? (cause.message || String(cause))
    : String(cause ?? 'Unknown error');
  const trimmed = raw.trim();
  if (!trimmed) return 'Unknown error';
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

export const computeNextRunAt = (task: ScheduleCalculationInput | null | undefined, nowMs = Date.now()): number | null => {
  if (!task?.enabled) return null;
  const schedule = task.schedule;
  if (!schedule) return null;

  const zone = schedule.timezone && schedule.timezone.trim().length > 0
    ? schedule.timezone.trim()
    : DateTime.local().zoneName;

  const now = DateTime.fromMillis(nowMs, { zone });
  if (!now.isValid) return null;

  if (schedule.kind === 'daily') {
    const times = resolveScheduleTimes(schedule);
    if (times.length === 0) return null;
    const minAllowed = now.plus({ milliseconds: TASK_DUE_SLACK_MS });

    for (const time of times) {
      const candidateToday = applyTimeToDate(now, time);
      if (!candidateToday || !candidateToday.isValid) continue;
      if (candidateToday > minAllowed) return candidateToday.toMillis();
    }

    const tomorrow = now.plus({ days: 1 });
    const firstTomorrow = applyTimeToDate(tomorrow, times[0]);
    return firstTomorrow?.isValid ? firstTomorrow.toMillis() : null;
  }

  if (schedule.kind === 'weekly') {
    if (!Array.isArray(schedule.weekdays) || schedule.weekdays.length === 0) return null;
    const times = resolveScheduleTimes(schedule);
    if (times.length === 0) return null;
    const weekdaysSet = new Set(schedule.weekdays);
    const minAllowed = now.plus({ milliseconds: TASK_DUE_SLACK_MS });

    for (let dayOffset = 0; dayOffset <= 14; dayOffset += 1) {
      const dayCandidate = now.plus({ days: dayOffset });
      const zeroBasedWeekday = weekdayAsZeroBased(dayCandidate);
      if (zeroBasedWeekday === null || !weekdaysSet.has(zeroBasedWeekday)) continue;
      for (const time of times) {
        const withTime = applyTimeToDate(dayCandidate, time);
        if (!withTime || !withTime.isValid) continue;
        if (withTime > minAllowed) return withTime.toMillis();
      }
    }
    return null;
  }

  if (schedule.kind === 'once') {
    if (!schedule.date || !schedule.time) return null;

    const parsed = DateTime.fromFormat(
      `${schedule.date} ${schedule.time}`,
      'yyyy-LL-dd HH:mm',
      { zone },
    );
    if (!parsed.isValid) return null;

    const minAllowed = now.plus({ milliseconds: TASK_DUE_SLACK_MS });
    if (parsed <= minAllowed) return null;

    return parsed.toMillis();
  }

  if (schedule.kind === 'cron' && schedule.cron) {
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

export const formatScheduledSessionTitle = (task: ScheduledTitleTaskInput | null | undefined, nowMs = Date.now()): string => {
  const timezone = task?.schedule?.timezone && task.schedule.timezone.trim().length > 0
    ? task.schedule.timezone.trim()
    : DateTime.local().zoneName;
  const stamp = DateTime.fromMillis(nowMs, { zone: timezone }).toFormat('yyyy-LL-dd HH:mm');
  const taskName = task?.name && task.name.trim().length > 0
    ? task.name.trim()
    : 'Scheduled task';
  const suffix = ` ${stamp}`;
  const maxTaskNameLength = Math.max(1, TASK_TITLE_MAX_LENGTH - suffix.length);
  const trimmedName = taskName.length > maxTaskNameLength
    ? taskName.slice(0, maxTaskNameLength)
    : taskName;
  return `${trimmedName}${suffix}`;
};

export const createScheduledTasksRuntime = (deps: ScheduledTasksRuntimeDependencies) => {
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
    createTaskWorktree = null,
    removeTaskWorktree = null,
    isGitRepository = null,
    readWorktreeIdentity = readDirectoryIdentity,
    readProcessIdentity = readProcessInstance,
    logger = console,
    maxGlobalConcurrency = DEFAULT_GLOBAL_CONCURRENCY,
    maxProjectConcurrency = DEFAULT_PROJECT_CONCURRENCY,
    maxRunDurationMs = DEFAULT_MAX_RUN_MS,
  } = deps;

  const expandPrompt = createScheduledPromptExpander({ service, resolveWorkspaceScope });

  const existingSessionTasks = createExistingSessionTasks({
    projectConfigRuntime,
    messageQueueRuntime,
    sessionService,
    resolveSessionScope,
    isSessionArchived,
    emitTaskRunEvent,
    expandPrompt,
  });

  const resolveRunSelection = async (projectID: string, task: ScheduledTask): Promise<CapturedSendOptions> => {
    if (task.execution.useDefaults) {
      if (!readSessionDefaults) throw new Error('Session defaults are unavailable');
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
  const tasksByProject = new Map<string, Map<string, ScheduledTask>>();
  const projectPathByID = new Map<string, string>();
  const timersByTaskKey = new Map<string, ReturnType<typeof setTimeout>>();
  const queuedTaskKeys = new Set<string>();
  const runningTaskKeys = new Set<string>();
  const runningCountByProject = new Map<string, number>();
  let runningGlobalCount = 0;
  const queue: QueuedTaskRunItem[] = [];

  const clearTimerForKey = (taskKey: string): void => {
    const timer = timersByTaskKey.get(taskKey);
    if (timer) {
      clearTimeout(timer);
      timersByTaskKey.delete(taskKey);
    }
  };

  const clearProjectTimers = (projectID: string): void => {
    const tasks = tasksByProject.get(projectID);
    if (!tasks) return;
    for (const task of tasks.values()) {
      clearTimerForKey(buildTaskKey(projectID, task.id));
      queuedTaskKeys.delete(buildTaskKey(projectID, task.id));
    }
  };

  const setProjectTasks = (projectID: string, tasks: ScheduledTask[]): void => {
    clearProjectTimers(projectID);
    const taskMap = new Map<string, ScheduledTask>();
    for (const task of tasks) {
      taskMap.set(task.id, task);
    }
    tasksByProject.set(projectID, taskMap);
  };

  const scheduleTask = (projectID: string, taskID: string, nextRunAt: number | undefined | null): void => {
    const taskKey = buildTaskKey(projectID, taskID);
    clearTimerForKey(taskKey);

    if (!started) return;
    if (nextRunAt == null || !Number.isFinite(nextRunAt) || nextRunAt <= 0) return;

    const delayBase = Math.max(0, Math.round(nextRunAt - Date.now()));
    const jitter = Math.floor(Math.random() * (JITTER_MAX_MS + 1));
    const delay = delayBase + jitter;
    const boundedDelay = Math.min(delay, MAX_TIMER_DELAY_MS);

    const timer = setTimeout(() => {
      if (delay > MAX_TIMER_DELAY_MS) {
        scheduleTask(projectID, taskID, nextRunAt);
        return;
      }

      clearTimerForKey(taskKey);
      const taskMap = tasksByProject.get(projectID);
      const task = taskMap?.get(taskID);
      if (!task || !task.enabled) return;
      queueTaskRun(projectID, taskID, 'scheduled', nextRunAt);
      pumpQueue();
    }, boundedDelay);

    timersByTaskKey.set(taskKey, timer);
  };

  const updateInMemoryTask = (projectID: string, nextTask: ScheduledTask | null | undefined): void => {
    if (!nextTask) return;
    const taskMap = tasksByProject.get(projectID);
    if (!taskMap) return;
    taskMap.set(nextTask.id, nextTask);
  };

  const syncTaskSchedule = async (projectID: string, task: ScheduledTask | null | undefined): Promise<void> => {
    if (!task) return;
    const nextRunAt = computeNextRunAt(task, Date.now());
    const statePatch: ScheduledTaskStatePatch = {
      nextRunAt: nextRunAt !== null && Number.isFinite(nextRunAt) ? nextRunAt : undefined,
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

  const isChatsScope = (projectID: string): boolean => Boolean(chatsScope) && projectID === chatsScope?.id;

  const listScopes = async (): Promise<SessionProject[]> => {
    const projects = await listProjects();
    if (!chatsScope || projects.some((project) => project?.id === chatsScope.id)) {
      return projects;
    }
    return [...projects, { id: chatsScope.id, path: chatsScope.root }];
  };

  const ensureProjectPath = async (projectID: string): Promise<string | null> => {
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
      void 0;
    }

    return null;
  };

  const syncProject = async (projectID: string): Promise<ScheduledTask[]> => {
    await ensureProjectPath(projectID);
    const projectPath = projectPathByID.get(projectID) || null;

    let tasks: ScheduledTask[];
    if (projectPath && !isChatsScope(projectID)) {
      const loops = discoverLoops(projectPath);
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

  const syncAllProjects = async (): Promise<void> => {
    const projects = await listScopes();
    const activeProjectIDs = new Set<string>();
    projectPathByID.clear();
    for (const project of projects) {
      if (!project?.id || !project?.path) continue;
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
        const parsedError = ErrorMessageSchema.safeParse(error);
        logger.warn?.('[ScheduledTasks] failed to sync project', {
          projectID,
          error: parsedError.success && parsedError.data.message ? parsedError.data.message : String(error),
        });
      }
    }
  };

  const queueTaskRun = (
    projectID: string,
    taskID: string,
    reason: 'scheduled' | 'manual',
    scheduledFor?: number,
  ): void => {
    const taskKey = buildTaskKey(projectID, taskID);
    if (queuedTaskKeys.has(taskKey) || runningTaskKeys.has(taskKey)) return;
    queuedTaskKeys.add(taskKey);
    const item: QueuedTaskRunItem = { projectID, taskID, reason };
    if (scheduledFor !== undefined && Number.isFinite(scheduledFor)) item.scheduledFor = scheduledFor;
    queue.push(item);
  };

  const canRunTask = (projectID: string): boolean => {
    if (runningGlobalCount >= maxGlobalConcurrency) return false;
    const projectRunning = runningCountByProject.get(projectID) || 0;
    return projectRunning < maxProjectConcurrency;
  };

  const waitForRunSettled = async (sessionID: string, signal: AbortSignal): Promise<boolean> => {
    if (!sessionService?.open) return false;
    for (; ;) {
      signal.throwIfAborted();
      try {
        const snapshot = await sessionService.open(sessionID);
        const runtimeStatus = snapshot?.session?.runtimeStatus;
        if (runtimeStatus === 'idle') return true;
        if (runtimeStatus === 'unavailable') return false;
      } catch (error) {
        const parsedError = ErrorMessageSchema.safeParse(error);
        if (parsedError.success && (parsedError.data.statusCode === 404 || parsedError.data.status === 404)) {
          return true;
        }
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, PENDING_CLEANUP_POLL_MS));
    }
  };

  const pendingCleanups = new Map<string, AbortController>();
  const launchWorktreeCleanup = (record: ScheduledWorktreeCleanup): void => {
    if (!removeTaskWorktree || !projectConfigRuntime.finishScheduledWorktreeCleanup) return;
    const finishCleanup = projectConfigRuntime.finishScheduledWorktreeCleanup;
    if (pendingCleanups.has(record.sessionID)) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(maxRunDurationMs)]);
    pendingCleanups.set(record.sessionID, controller);
    void (async () => {
      try {
        let remove = record.phase === 'removing';
        if (!remove && await readWorktreeIdentity(record.worktreeDirectory) === record.directoryIdentity) {
          remove = await waitForRunSettled(record.sessionID, signal);
        }
        signal.throwIfAborted();
        await finishCleanup(
          record.projectID,
          record.sessionID,
          remove
            ? async (current, resumingRemoval) => {
              const matching = await readWorktreeIdentity(current.worktreeDirectory) === current.directoryIdentity;
              signal.throwIfAborted();
              if (!matching && !resumingRemoval) return;
              const input: RemoveScheduledWorktreeInput = {
                projectDirectory: current.projectDirectory,
                worktreeDirectory: current.worktreeDirectory,
                branch: current.branch,
                deleteLocalBranch: true,
              };
              if (!matching) input.removeDirectory = false;
              return removeTaskWorktree(input);
            }
            : null,
          { signal },
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        try {
          if (await readWorktreeIdentity(record.worktreeDirectory) !== record.directoryIdentity) {
            const discarded = await finishCleanup(record.projectID, record.sessionID, null, { signal });
            if (discarded) return;
          }
        } catch {
          void 0;
        }
        logger.warn?.('[ScheduledTasks] failed to clean up the isolated worktree', {
          projectID: record.projectID,
          sessionID: record.sessionID,
          worktree: record.worktreeDirectory,
          reason: signal.aborted ? 'cleanup-wait-budget-exceeded' : 'cleanup-failed',
          error: safeErrorMessage(error),
        });
      } finally {
        if (pendingCleanups.get(record.sessionID) === controller) pendingCleanups.delete(record.sessionID);
      }
    })();
  };

  const recordWorktreeCleanup = async (
    projectID: string,
    task: ScheduledTask,
    projectPath: string,
    isolation: ScheduledWorktreeResult | null,
    sessionID: string,
    startedAt: number,
  ): Promise<ScheduledWorktreeCleanup | null> => {
    if (!isolation || task.cleanupWorktree === false) return null;
    if (!projectConfigRuntime.saveScheduledWorktreeCleanup) return null;
    const worktreeDirectory = isolation.directory ?? isolation.path;
    if (!worktreeDirectory) throw new Error('Run worktree path is unavailable');
    const directoryIdentity = await readWorktreeIdentity(worktreeDirectory);
    if (!directoryIdentity) throw new Error('Run worktree no longer exists');
    const ownerInstance = await readProcessIdentity(process.pid);
    if (!ownerInstance) throw new Error('Cannot identify the worktree cleanup owner');
    const record = await projectConfigRuntime.saveScheduledWorktreeCleanup(projectID, {
      projectDirectory: projectPath,
      worktreeDirectory,
      sessionID,
      branch: isolation.branch ?? null,
      startedAt,
      directoryIdentity,
      ownerPID: process.pid,
      ownerInstance,
      phase: 'waiting',
    });
    launchWorktreeCleanup(record);
    return record;
  };

  const resolveProjectWorkspace = async (
    projectID: string,
    projectPath: string,
  ): Promise<Omit<ScheduledTaskSessionScope, 'sessionId'>> => {
    if (!listWorkspaceScopes || !resolveWorkspaceScope) {
      throw new Error('Workspace scope service is unavailable');
    }
    const page = await listWorkspaceScopes();
    if (!page || !Array.isArray(page.items) || !page.errors) {
      throw new Error('Workspace scope enumeration failed');
    }
    const scopes = await Promise.all(page.items.map(async ({ workspaceId }) => {
      try { return await resolveWorkspaceScope(workspaceId); }
      catch { return null; }
    }));
    const matches = scopes.filter((scope): scope is Omit<ScheduledTaskSessionScope, 'sessionId'> =>
      Boolean(scope && scope.hostProjectId === projectID && path.resolve(scope.cwd) === path.resolve(projectPath)));
    const match = matches[0];
    if (matches.length !== 1 || !match) {
      throw new Error('Scheduled project workspace is unavailable or ambiguous');
    }
    return match;
  };

  const runTaskWithWatchdog = async (
    projectID: string,
    task: ScheduledTask,
    reason: 'scheduled' | 'manual',
    onSessionCreated: (sessionID: string, isolation: ScheduledWorktreeResult | null) => Promise<void>,
  ): Promise<{
    sessionID: string;
    directory: string;
    durationMs: number;
    reason: 'scheduled' | 'manual';
    startedAt: number;
    finishedAt: number;
  }> => {
    const startedAt = Date.now();
    const projectPath = await ensureProjectPath(projectID);
    if (!projectPath) throw new Error('Project path is unavailable');

    const chatsRun = isChatsScope(projectID);
    let isolation: ScheduledWorktreeResult | null = null;
    if (!chatsRun && task.runInWorktree === true) {
      if (task.cleanupWorktree !== false && !projectConfigRuntime.saveScheduledWorktreeCleanup) {
        throw new Error('Durable worktree cleanup is unavailable');
      }
      const create = createTaskWorktree;
      let gitLike: boolean | null = null;
      if (isGitRepository) {
        try {
          gitLike = await isGitRepository(projectPath);
        } catch (error) {
          throw new Error(`failed to check whether the project is a git repository: ${safeErrorMessage(error)}`);
        }
      }
      if (!create) {
        throw new Error('failed to create isolated worktree: worktree creation is unavailable');
      }
      if (gitLike !== false) {
        try {
          const createInput: CreateScheduledWorktreeInput = { projectDirectory: projectPath };
          if (task.baseBranch) createInput.baseBranch = task.baseBranch;
          isolation = await create(createInput);
        } catch (error) {
          throw new Error(`failed to create isolated worktree: ${safeErrorMessage(error)}`);
        }
      }
      if (!isolation) {
        logger.warn?.('[ScheduledTasks] isolated run fell back to the project directory', {
          projectID,
          taskID: task.id,
          reason: gitLike === false
            ? 'project is not a git repository'
            : 'worktree creation returned no worktree',
        });
      }
    }

    const runDirectory = isolation?.directory ?? isolation?.path ?? projectPath;
    const discardIsolation = async (): Promise<void> => {
      if (!isolation) return;
      const worktreeDirectory = isolation.directory ?? isolation.path;
      if (!worktreeDirectory) return;
      try {
        await removeTaskWorktree?.({
          projectDirectory: projectPath,
          worktreeDirectory,
          branch: isolation.branch ?? null,
          deleteLocalBranch: true,
        });
      } catch (error) {
        logger.warn?.("[ScheduledTasks] failed to clean up the failed run's worktree", {
          projectID,
          taskID: task.id,
          worktree: worktreeDirectory,
          error: safeErrorMessage(error),
        });
      }
    };

    let sessionID: string;
    let cleanupRecord: ScheduledWorktreeCleanup | null = null;
    let prompt: PromptRequest;
    try {
      if (!sessionService?.create || (task.execution.goalEnabled ? !sessionService.control : !sessionService.send)) {
        throw new Error('Canonical session service is unavailable');
      }

      const options = await resolveRunSelection(projectID, task);
      const workspace = chatsRun
        ? await (createChatWorkspace
          ? createChatWorkspace()
          : Promise.reject(new Error('Managed chat workspace service is unavailable')))
        : await resolveProjectWorkspace(projectID, runDirectory);
      if (!workspace?.workspaceId || !workspace.projectId || !workspace.cwd || workspace.hostProjectId !== projectID) {
        throw new Error('Scheduled workspace is not authorized');
      }

      try {
        prompt = await expandPrompt(
          workspace,
          PromptRequestSchema.parse({ input: { text: task.execution.prompt, attachments: [], context: [] }, options }),
        );
        const created = SessionCreateAckSchema.parse(await sessionService.create({
          projectId: workspace.projectId,
          workspaceId: workspace.workspaceId,
          options: prompt.options,
          title: formatScheduledSessionTitle(task, startedAt),
        }));
        sessionID = created.session.sessionId;
        if (created.session.projectId !== workspace.projectId || created.session.workspaceId !== workspace.workspaceId) {
          throw new Error('Scheduled session scope mismatch');
        }
      } catch (error) {
        if (chatsRun && workspace?.cwd) await chatsScope?.discardChatDirectory(workspace.cwd);
        throw error;
      }

      await onSessionCreated(sessionID, isolation);
      emitTaskRunEvent?.({ projectID, taskID: task.id, ranAt: startedAt, status: 'running', sessionID });
      cleanupRecord = await recordWorktreeCleanup(projectID, task, projectPath, isolation, sessionID, startedAt);
      if (task.execution.permissionAutoAccept) {
        if (!setSessionAutoAccept) throw new Error('Permission policy service is unavailable');
        try {
          await setSessionAutoAccept(sessionID, true, workspace.cwd);
        } catch (error) {
          logger.warn?.(
            '[scheduled-tasks] permission auto-accept enrollment failed; approvals remain manual',
            sessionID,
            safeErrorMessage(error),
          );
        }
      }
      if (task.execution.goalEnabled && sessionService.control) {
        const tokenBudget = task.execution.goalTokenBudget ?? await readDefaultGoalTokenBudget(projectID);
        const result = await sessionService.control(sessionID, {
          type: 'goal',
          op: 'create',
          objective: prompt.input.text,
          tokenBudget: tokenBudget ?? null,
        });
        if (!('type' in result) || result.type !== 'goal' || result.mode.kind !== 'goal' || result.mode.status !== 'active') {
          throw new Error('Scheduled goal acknowledgement is invalid');
        }
      } else if (sessionService.send) {
        const context = [createScheduledTaskContext({
          projectId: projectID,
          taskId: task.id,
          sessionId: sessionID,
          workspaceId: workspace.workspaceId,
          mode: 'new',
          triggeredAt: startedAt,
        })];
        const result = await sessionService.send(
          sessionID,
          PromptRequestSchema.parse({ input: { ...prompt.input, context }, options: prompt.options }),
        );
        if (!result?.run || result.run.sessionId !== sessionID) {
          throw new Error('Scheduled prompt acknowledgement is invalid');
        }
      }
      const finishedAt = Date.now();
      return {
        sessionID,
        directory: workspace.cwd,
        durationMs: Math.max(0, finishedAt - startedAt),
        reason,
        startedAt,
        finishedAt,
      };
    } catch (error) {
      if (cleanupRecord) {
        pendingCleanups.get(cleanupRecord.sessionID)?.abort();
        pendingCleanups.delete(cleanupRecord.sessionID);
        try {
          await projectConfigRuntime.finishScheduledWorktreeCleanup?.(projectID, cleanupRecord.sessionID, null);
        } catch (discardError) {
          logger.warn?.('[ScheduledTasks] failed to discard the failed run cleanup record', {
            projectID,
            sessionID: cleanupRecord.sessionID,
            error: safeErrorMessage(discardError),
          });
        }
      }
      await discardIsolation();
      throw error;
    }
  };

  const releaseRunningSlot = (projectID: string, taskKey: string): void => {
    runningTaskKeys.delete(taskKey);
    runningGlobalCount = Math.max(0, runningGlobalCount - 1);
    const nextProjectCount = Math.max(0, (runningCountByProject.get(projectID) || 1) - 1);
    if (nextProjectCount === 0) {
      runningCountByProject.delete(projectID);
    } else {
      runningCountByProject.set(projectID, nextProjectCount);
    }
  };

  const scheduleFutureRun = (
    projectID: string,
    taskID: string,
    nextRunAt: number | null | undefined,
    fromMs = Date.now(),
  ): boolean => {
    if (nextRunAt == null || !Number.isFinite(nextRunAt)) return false;
    const base = Number.isFinite(fromMs) ? fromMs : Date.now();
    if (nextRunAt <= base) return false;
    scheduleTask(projectID, taskID, nextRunAt);
    return true;
  };

  const rearmFromTaskOrCompute = (
    projectID: string,
    taskID: string,
    fallbackTask: ScheduledTask,
    fromMs: number,
  ): void => {
    const latest = tasksByProject.get(projectID)?.get(taskID) || fallbackTask;
    if (!latest?.enabled) return;
    const base = Number.isFinite(fromMs) ? fromMs : Date.now();
    const persistedNext = latest.state?.nextRunAt;
    if (scheduleFutureRun(projectID, taskID, persistedNext, base)) return;
    const computedNext = computeNextRunAt(latest, base);
    scheduleFutureRun(projectID, taskID, computedNext, base);
  };

  const runTask = async (
    projectID: string,
    taskID: string,
    reason: 'scheduled' | 'manual',
    scheduledFor?: number,
  ): Promise<ScheduledTaskRunOutcome> => {
    const taskMap = tasksByProject.get(projectID);
    const task = taskMap?.get(taskID);
    if (!task || (reason !== 'manual' && !task.enabled)) {
      return { ok: false, skipped: true };
    }

    if (task.targetSessionId) {
      const nextRunAt = computeNextRunAt(task, Math.max(Date.now(), (scheduledFor ?? 0) + 1));
      const result: ExistingSessionRunResult = await existingSessionTasks.run(projectID, task, reason, scheduledFor, nextRunAt);
      if (reason === 'scheduled') {
        if (task.schedule.kind === 'once' && result.task && !(result.ok === false && result.skipped)) {
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
        } else {
          scheduleFutureRun(projectID, taskID, nextRunAt);
        }
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

    try {
      const runStartedAt = Date.now();

      if (reason === 'scheduled') {
        if (scheduledFor === undefined || !Number.isFinite(scheduledFor)) {
          return { ok: false, skipped: true, reason: 'missing-scheduled-for' };
        }

        const nextAfterClaim = computeNextRunAt(task, Math.max(runStartedAt, scheduledFor + 1));
        const claimPatch: ScheduledTaskStatePatch = {
          lastScheduledFor: Math.round(scheduledFor),
          lastRunAt: runStartedAt,
          lastStatus: 'running',
          lastError: undefined,
          lastSessionId: undefined,
          updatedAt: runStartedAt,
          nextRunAt: nextAfterClaim !== null && Number.isFinite(nextAfterClaim) ? nextAfterClaim : undefined,
        };

        const canClaimOccurrence = (candidate: ScheduledTask): boolean => {
          if (!candidate?.enabled) return false;
          const lastScheduledFor = candidate.state?.lastScheduledFor;
          if (lastScheduledFor !== undefined
            && Number.isFinite(lastScheduledFor)
            && Math.abs(lastScheduledFor - scheduledFor) <= TASK_DUE_SLACK_MS) {
            return false;
          }
          return true;
        };

        let claimResult: ScheduledTaskStateResult;
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

          const claimFailurePatch = {
            lastStatus: 'error' as const,
            lastError: `Scheduled claim failed: ${message}`,
            updatedAt: Date.now(),
          };
          try {
            const recorded = await projectConfigRuntime.updateScheduledTaskStateIf(
              projectID,
              taskID,
              (candidate) => candidate.state?.lastScheduledFor === undefined
                || !Number.isFinite(candidate.state.lastScheduledFor)
                || Math.abs(candidate.state.lastScheduledFor - scheduledFor) > TASK_DUE_SLACK_MS,
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

      let status: ScheduledTaskStatus = 'success';
      let sessionID: string | undefined;
      let sessionDirectory: string | undefined;
      let durationMs = 0;
      let errorMessage: string | undefined;
      let createdSessionID: string | undefined;
      const runIsolationRef: IsolationRef = { current: null };
      const recordCreatedSession = async (id: string, isolation: ScheduledWorktreeResult | null): Promise<void> => {
        createdSessionID = id;
        runIsolationRef.current = isolation ?? null;
        try {
          const recorded = await projectConfigRuntime.updateScheduledTaskState(projectID, taskID, {
            lastSessionId: id,
            lastRunIsolated: isolation ? true : undefined,
            lastRunBranch: isolation && task.cleanupWorktree === false && isolation.branch
              ? String(isolation.branch)
              : undefined,
          });
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
        let timeoutID: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          timeoutID = setTimeout(() => {
            reject(new Error('scheduled task run timed out'));
          }, maxRunDurationMs);
        });

        const result = await Promise.race([runPromise, timeoutPromise]).finally(() => {
          clearTimeout(timeoutID);
        });
        sessionID = result.sessionID;
        sessionDirectory = result.directory;
        durationMs = result.durationMs;
        status = 'success';
        logger.info?.(
          '[ScheduledTasks] run completed',
          { projectID, taskID, status, reason, sessionID, durationMs },
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
      let latestTask = tasksByProject.get(projectID)?.get(taskID) || task;
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

      const statePatch: ScheduledTaskStatePatch = {
        lastStatus: status,
        lastDurationMs: durationMs,
        lastError: status === 'error' ? errorMessage : undefined,
        lastSessionId: sessionID ?? createdSessionID,
        lastRunIsolated: runIsolationRef.current ? true : undefined,
        lastRunBranch: runIsolationRef.current && task.cleanupWorktree === false && runIsolationRef.current.branch
          ? String(runIsolationRef.current.branch)
          : undefined,
        nextRunAt: nextRunAt !== null && Number.isFinite(nextRunAt) ? nextRunAt : undefined,
        updatedAt: finishedAt,
      };

      let stateResult: TaskStateHolder = { task: null };
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

        const recoveredTask: ScheduledTask = {
          ...latestTask,
          state: {
            ...(latestTask.state || {}),
            lastStatus: status,
            lastDurationMs: durationMs,
            lastError: status === 'error' ? errorMessage : undefined,
            lastSessionId: sessionID ?? createdSessionID,
            nextRunAt: nextRunAt !== null && Number.isFinite(nextRunAt) ? nextRunAt : undefined,
            updatedAt: finishedAt,
          },
        };
        updateInMemoryTask(projectID, recoveredTask);

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

        const failedOutcome: ScheduledTaskRunOutcome = {
          ok: status === 'success',
          status,
          task: stateResult.task || recoveredTask,
          persistError: message,
          reason: 'completion-state-failed',
        };
        if (sessionID !== undefined) failedOutcome.sessionID = sessionID;
        if (sessionDirectory !== undefined) failedOutcome.directory = sessionDirectory;
        if (status === 'error' && errorMessage !== undefined) failedOutcome.error = errorMessage;
        return failedOutcome;
      }

      try {
        const event: ScheduledTaskRunEvent = {
          projectID,
          taskID,
          ranAt: finishedAt,
          status,
        };
        if (sessionID) event.sessionID = sessionID;
        emitTaskRunEvent?.(event);
      } catch {
        void 0;
      }

      const outcome: ScheduledTaskRunOutcome = {
        ok: status === 'success',
        status,
        task: stateResult.task || null,
      };
      if (sessionID !== undefined) outcome.sessionID = sessionID;
      if (sessionDirectory !== undefined) outcome.directory = sessionDirectory;
      if (errorMessage !== undefined) outcome.error = errorMessage;
      return outcome;
    } finally {
      releaseRunningSlot(projectID, taskKey);
    }
  };

  const pumpQueue = (): void => {
    if (!started) return;

    let consumed = false;
    for (let index = 0; index < queue.length; index += 1) {
      const item = queue[index];
      if (!item || !canRunTask(item.projectID)) continue;

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

    if (!consumed && queue.length > 0) return;
  };

  const runNow = async (projectID: string, taskID: string): Promise<ScheduledTaskRunOutcome> => {
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

  const ownsCleanup = async (record: ScheduledWorktreeCleanup): Promise<boolean> => {
    if (record.ownerPID === 0 || !record.ownerInstance) return false;
    try {
      return await readProcessIdentity(record.ownerPID) === record.ownerInstance;
    } catch {
      return false;
    }
  };

  const reconcileWorktreeCleanups = async (): Promise<void> => {
    if (!projectConfigRuntime.listScheduledWorktreeCleanups) return;
    let records: ScheduledWorktreeCleanup[];
    try {
      records = await projectConfigRuntime.listScheduledWorktreeCleanups();
    } catch (error) {
      logger.warn?.('[ScheduledTasks] failed to read worktree cleanup records', { error: safeErrorMessage(error) });
      return;
    }
    for (const record of records) {
      if (pendingCleanups.has(record.sessionID)) continue;
      if (record.phase === 'removing' && await ownsCleanup(record)) continue;
      launchWorktreeCleanup(record);
    }
  };

  const start = async (): Promise<void> => {
    if (started) return;
    const projects = await listScopes();
    let changed = 0;
    for (const project of projects) {
      if (!project?.id || !projectConfigRuntime.migrateProjectScheduledTasks) continue;
      try {
        changed += await projectConfigRuntime.migrateProjectScheduledTasks(project.id);
      } catch (error) {
        logger.warn?.('[scheduled-tasks] root agent migration failed', {
          projectId: project.id,
          error: safeErrorMessage(error),
        });
      }
    }
    logger.info?.(`[scheduled-tasks] root agent migration changed=${changed}`);
    started = true;
    await reconcileWorktreeCleanups();
    await syncAllProjects();
  };

  const stop = async (): Promise<void> => {
    if (!started) return;
    started = false;
    for (const timer of timersByTaskKey.values()) {
      clearTimeout(timer);
    }
    timersByTaskKey.clear();
    queuedTaskKeys.clear();
    queue.length = 0;
    for (const controller of pendingCleanups.values()) controller.abort();
    pendingCleanups.clear();
  };

  const getStatus = () => {
    let enabledCount = 0;
    for (const taskMap of tasksByProject.values()) {
      for (const task of taskMap.values()) {
        if (task?.enabled) enabledCount += 1;
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
    validateTarget: (projectID: string, sessionID: string) => existingSessionTasks.validateTarget(projectID, sessionID),
    listEligibleTargets: (projectID: string, candidates: readonly JsonValue[] | undefined) =>
      existingSessionTasks.listEligibleTargets(projectID, candidates),
    beforeScheduledTaskSend: (scope: ScheduledTaskSessionScope, capture: { request?: PromptRequest }) =>
      existingSessionTasks.beforeSend(scope, capture),
    onScheduledTaskResult: (provenance: ScheduledTaskProvenance, status: ScheduledTaskStatus, error?: string) =>
      existingSessionTasks.result(provenance, status, error),
    cancelWaitingPrompt: (projectID: string, taskID: string) => existingSessionTasks.cancel(projectID, taskID),
  };
};

export type ScheduledTasksRuntime = ReturnType<typeof createScheduledTasksRuntime>;
