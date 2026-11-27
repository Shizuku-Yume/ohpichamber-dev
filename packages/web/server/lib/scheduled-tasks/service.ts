import fs from 'node:fs';
import { z } from 'zod';
import { asNonEmptyString } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';
import { assertTaskTextWithinLimits } from '../projects/task-text-limits.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { discoverLoopFiles, loopFingerprint, parseLoopDefinition, setLoopFileEnabled } from './loops.js';
import type { ScheduledTask, ScheduledTaskInput, SessionProject } from '../projects/contracts.js';
import type { createProjectConfigRuntime } from '../projects/project-config.js';
import type { SettingsDocument } from '../settings/settings-helpers.js';
import type { createChatsScope } from './chats-scope.js';
import type { createScheduledTasksRuntime } from './runtime.js';

export interface ScheduledTaskServiceDependencies {
  readSettingsFromDiskMigrated: () => Promise<SettingsDocument | null | undefined>;
  sanitizeProjects: (projects: SettingsDocument[string]) => SessionProject[];
  projectConfigRuntime: ReturnType<typeof createProjectConfigRuntime>;
  scheduledTasksRuntime: ReturnType<typeof createScheduledTasksRuntime>;
  resolveWorkspaceScope?: (workspaceId: string) => Promise<{ workspaceId: string; hostProjectId?: string | null } | null>;
  chatsScope?: Pick<ReturnType<typeof createChatsScope>, 'id' | 'root' | 'toStorageID'> | null;
}

export interface ScheduledTaskRunResponse {
  task: ScheduledTask | null | undefined;
  sessionId: string | undefined;
  directory?: string;
  persistError?: string;
}

export interface ResolveProjectIdInput {
  projectId?: string | null;
  workspaceId?: string | null;
  directory?: string | null;
}

const TaskInputObjectSchema = z.looseObject({});

const isRepositoryLoop = (projectPath: string, loopFile: string): boolean => discoverLoopFiles(projectPath)
  .some((entry) => entry.scope === 'project' && entry.filePath === loopFile);

export const createScheduledTaskService = (dependencies: ScheduledTaskServiceDependencies) => {
  const {
    readSettingsFromDiskMigrated,
    sanitizeProjects,
    projectConfigRuntime,
    scheduledTasksRuntime,
    resolveWorkspaceScope,
    chatsScope = null,
  } = dependencies;

  const listProjects = async (): Promise<SessionProject[]> => {
    const settings = await readSettingsFromDiskMigrated();
    return sanitizeProjects(settings?.projects || []);
  };

  const findProjectByID = async (projectID: string): Promise<SessionProject> => {
    const requested = asNonEmptyString(projectID);
    if (!requested) throw new OpenChamberControlError('projectId is required', 400);
    const normalized = chatsScope ? chatsScope.toStorageID(requested) : requested;
    const projects = await listProjects();
    const project = projects.find((entry) => entry.id === normalized) || null;
    if (project) return project;
    if (chatsScope && normalized === chatsScope.id) return { id: chatsScope.id, path: chatsScope.root };
    throw new OpenChamberControlError('Project not found', 404);
  };

  const resolveProjectID = async ({ projectId, workspaceId }: ResolveProjectIdInput = {}): Promise<string> => {
    const requestedProjectID = asNonEmptyString(projectId);
    const requestedWorkspaceID = asNonEmptyString(workspaceId);
    if (Boolean(requestedProjectID) === Boolean(requestedWorkspaceID)) {
      throw new OpenChamberControlError('Provide exactly one of projectId or workspaceId', 400);
    }
    if (requestedProjectID) return (await findProjectByID(requestedProjectID)).id;
    if (!requestedWorkspaceID) throw new OpenChamberControlError('Provide exactly one of projectId or workspaceId', 400);
    if (!resolveWorkspaceScope) throw new OpenChamberControlError('Workspace scope service is unavailable', 503);
    const scope = await resolveWorkspaceScope(requestedWorkspaceID);
    if (!scope || scope.workspaceId !== requestedWorkspaceID || !scope.hostProjectId) {
      throw new OpenChamberControlError('Workspace is not authorized', 404);
    }
    return (await findProjectByID(scope.hostProjectId)).id;
  };

  const list = async (projectID: string): Promise<ScheduledTask[]> => {
    const { id } = await findProjectByID(projectID);
    return scheduledTasksRuntime.syncProject(id);
  };

  const findLoopTask = async (projectID: string, taskID: string): Promise<{ id: string; task: ScheduledTask & { loopFile: string } }> => {
    const { id } = await findProjectByID(projectID);
    const normalizedTaskID = asNonEmptyString(taskID);
    if (!normalizedTaskID) throw new OpenChamberControlError('taskId is required', 400);
    const tasks = await scheduledTasksRuntime.syncProject(id);
    const task = tasks.find((entry) => entry?.id === normalizedTaskID) || null;
    if (!task) throw new OpenChamberControlError('Task not found', 404);
    if (!task.loopFile) throw new OpenChamberControlError('Task is not managed by a loop file', 400);
    if (!fs.existsSync(task.loopFile)) throw new OpenChamberControlError('Loop file not found', 404);
    return { id, task: { ...task, loopFile: task.loopFile } };
  };

  const setLoopEnabled = async (projectID: string, taskID: string, enabled: JsonValue | undefined): Promise<ScheduledTask | null> => {
    const parsedEnabled = z.boolean().safeParse(enabled);
    if (!parsedEnabled.success) {
      throw new OpenChamberControlError('enabled must be a boolean', 400);
    }
    const { id, task } = await findLoopTask(projectID, taskID);
    try {
      if (!setLoopFileEnabled(task.loopFile, parsedEnabled.data)) {
        throw new OpenChamberControlError('Loop file must be valid before changing its enabled state', 400);
      }
    } catch (error) {
      if (error instanceof OpenChamberControlError) throw error;
      const message = error instanceof Error ? error.message : 'Failed to update loop file';
      throw new OpenChamberControlError(message, 500);
    }
    const definition = parsedEnabled.data ? parseLoopDefinition(task.loopFile) : null;
    await projectConfigRuntime.setLoopApproval(id, task.loopFile, definition ? loopFingerprint(definition) : null);
    const tasks = await scheduledTasksRuntime.syncProject(id);
    return tasks.find((entry) => entry.id === taskID) || null;
  };

  const removeLoopFile = async (projectID: string, taskID: string): Promise<ScheduledTask[]> => {
    const { id, task } = await findLoopTask(projectID, taskID);
    try {
      fs.unlinkSync(task.loopFile);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete loop file';
      throw new OpenChamberControlError(message, 500);
    }
    return scheduledTasksRuntime.syncProject(id);
  };

  const upsert = async (
    projectID: string,
    taskInput: ScheduledTaskInput,
  ): Promise<{ tasks: ScheduledTask[]; task: ScheduledTask; created: boolean }> => {
    const { id } = await findProjectByID(projectID);
    const parsedInput = TaskInputObjectSchema.safeParse(taskInput);
    if (!parsedInput.success) {
      throw new OpenChamberControlError('task payload is required', 400);
    }
    try {
      assertTaskTextWithinLimits(taskInput);
    } catch (error) {
      throw new OpenChamberControlError(error instanceof Error ? error.message : 'Task text is too long', 400);
    }
    const inputId = asNonEmptyString(taskInput.id);
    const previous = inputId ? (await projectConfigRuntime.listScheduledTasks(id)).find((task) => task.id === inputId) : null;
    const targetSessionId = asNonEmptyString(taskInput.targetSessionId);
    if (targetSessionId && (taskInput.enabled !== false || previous?.targetSessionId !== targetSessionId)) {
      await scheduledTasksRuntime.validateTarget(id, targetSessionId);
    }
    let upserted: { task: ScheduledTask; tasks: ScheduledTask[]; created: boolean };
    try {
      upserted = await projectConfigRuntime.upsertScheduledTask(id, taskInput);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save scheduled task';
      const invalid = message.toLowerCase().includes('required') || message.toLowerCase().includes('invalid');
      throw new OpenChamberControlError(message, invalid ? 400 : 500);
    }
    if (previous?.targetSessionId
      && inputId
      && ((previous.enabled && upserted.task.enabled === false) || previous.targetSessionId !== upserted.task.targetSessionId)) {
      await scheduledTasksRuntime.cancelWaitingPrompt(id, inputId);
    }
    await scheduledTasksRuntime.syncProject(id);
    const tasks = await projectConfigRuntime.listScheduledTasks(id);
    return {
      tasks,
      task: tasks.find((task) => task.id === upserted.task.id) || upserted.task,
      created: upserted.created,
    };
  };

  const remove = async (projectID: string, taskID: string): Promise<ScheduledTask[]> => {
    const { id } = await findProjectByID(projectID);
    const normalizedTaskID = asNonEmptyString(taskID);
    if (!normalizedTaskID) throw new OpenChamberControlError('taskId is required', 400);
    const current = await projectConfigRuntime.listScheduledTasks(id);
    const existing = current.find((task) => task.id === normalizedTaskID) || null;
    if (existing?.loopFile && fs.existsSync(existing.loopFile)) {
      throw new OpenChamberControlError(
        'Loop task is managed by its .agents/loops markdown file; delete the file to remove the task',
        400,
      );
    }
    const result = await projectConfigRuntime.deleteScheduledTask(id, normalizedTaskID);
    if (!result.deleted) throw new OpenChamberControlError('Task not found', 404);
    await scheduledTasksRuntime.cancelWaitingPrompt?.(id, normalizedTaskID);
    await scheduledTasksRuntime.syncProject(id);
    return projectConfigRuntime.listScheduledTasks(id);
  };

  const run = async (projectID: string, taskID: string): Promise<ScheduledTaskRunResponse> => {
    const { id } = await findProjectByID(projectID);
    const normalizedTaskID = asNonEmptyString(taskID);
    if (!normalizedTaskID) throw new OpenChamberControlError('taskId is required', 400);
    const result = await scheduledTasksRuntime.runNow(id, normalizedTaskID);
    if (result.running || result.queued) {
      throw new OpenChamberControlError(result.error || 'Task already running', 409, { busy: result.queued ? 'queued' : 'running' });
    }
    if (result.skipped) throw new OpenChamberControlError('Task not found or disabled', 404);
    if (!result.ok) {
      throw new OpenChamberControlError(result.error || 'Task run failed', result.statusCode || 500, { task: result.task });
    }
    const response: ScheduledTaskRunResponse = {
      task: result.task,
      sessionId: result.sessionID,
    };
    if (result.persistError && result.persistError.trim()) {
      response.persistError = result.persistError.trim();
    }
    if (result.directory) response.directory = result.directory;
    return response;
  };

  const setEnabled = async (projectID: string, taskID: string, enabled: boolean): Promise<ScheduledTask | null> => {
    const project = await findProjectByID(projectID);
    const tasks = await scheduledTasksRuntime.syncProject(project.id);
    const task = tasks.find((entry) => entry?.id === taskID);
    if (!task) throw new OpenChamberControlError('Task not found', 404);
    if (!task.loopFile) {
      const result = await upsert(project.id, { ...task, enabled });
      return result.task;
    }
    if (enabled === task.enabled) return task;
    if (enabled && isRepositoryLoop(project.path, task.loopFile)) {
      throw new OpenChamberControlError(`"${task.name}" comes from this repository. Enable it in Scheduled tasks.`, 409);
    }
    return setLoopEnabled(project.id, task.id, enabled);
  };

  const status = async () => {
    if (scheduledTasksRuntime.getStatus) {
      return scheduledTasksRuntime.getStatus();
    }
    const projects = await listProjects();
    let enabledCount = 0;
    let runningCount = 0;
    for (const project of projects) {
      try {
        const tasks = await projectConfigRuntime.listScheduledTasks(project.id);
        for (const task of tasks) {
          if (task?.enabled) enabledCount += 1;
          if (task?.state?.lastStatus === 'running') runningCount += 1;
        }
      } catch {
        continue;
      }
    }
    return {
      hasEnabledScheduledTasks: enabledCount > 0,
      hasRunningScheduledTasks: runningCount > 0,
      enabledScheduledTasksCount: enabledCount,
      runningScheduledTasksCount: runningCount,
    };
  };

  return {
    listProjects,
    resolveProjectID,
    list,
    upsert,
    remove,
    run,
    setEnabled,
    setLoopEnabled,
    removeLoopFile,
    status,
  };
};

export type ScheduledTaskService = ReturnType<typeof createScheduledTaskService>;
