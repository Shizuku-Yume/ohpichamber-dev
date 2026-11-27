import path from 'node:path';
import { z } from 'zod';
import {
  ProblemCodeSchema,
  formatModelRef,
  modelRefKey as formatCanonicalModelRefKey,
  parseModelSelector,
  thinkingLevelToReasoningEffort,
} from '@openchamber/agent-contract';
import type {
  CapturedSendOptions,
  ProblemCode,
  PromptRequest,
  RuntimeSession,
} from '@openchamber/agent-contract';
import type { HostActionRequest, HostActionResult, HostAuthorizationScope } from '@openchamber/agent-service/private-protocol';
import { asNonEmptyString, isBoolean, isString } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';
import { OpenChamberControlError, asControlError } from './error.js';
import {
  OPENCHAMBER_ALL_ACTIONS,
  OPENCHAMBER_AGENT_TOOL_ACTIONS,
  OPENCHAMBER_WEB_ACTIONS,
  OPENCHAMBER_KNOWLEDGE_ACTIONS,
  OPENCHAMBER_NOTIFY_ACTIONS,
  OPENCHAMBER_RENDER_ACTIONS,
  OPENCHAMBER_USAGE_ACTIONS,
  OPENCHAMBER_SECRET_ACTIONS,
  OPENCHAMBER_WORKFLOW_ACTIONS,
} from './actions.js';
import { createProjectKnowledgeActions } from './project-knowledge.js';
import type { ProjectKnowledgeDependencies } from './project-knowledge.js';
import { writeScreenshot } from './screenshots.js';
import { resolveUploadFiles, UploadRefusedError } from '../browser-control/uploads.js';
import type { createUploadStore } from '../browser-control/uploads.js';
import type { BrowserControlParameters } from '../browser-control/broker.js';
import type { createBrowserControlRouter } from '../browser-control/provider.js';
import { createPageAnswers, createRenderPageAction } from './render-page.js';
import type { PageAnswerInput, PageAnswersOptions, RenderPageDependencies } from './render-page.js';
import { createSecretRequests } from './secret-request.js';
import { createTerminalReadAction } from './terminal-read.js';
import type { TerminalReadDependencies } from './terminal-read.js';
import { createUsageReadAction } from './usage-read.js';
import type { UsageReadDependencies } from './usage-read.js';
import { isPinnedMetadata, userStatePatch } from '../session-work/state.js';
import { redactGitText } from '../git/redaction.js';
import type { ControlInput, ControlOptions, PublicSessionStatus, SessionActionResult, SessionReadAction, SessionReadResults, TextMessage } from './contracts.js';
import type { WorkflowRuntime } from '../workflows/runtime.js';
import type { SessionMetadata } from '../openchamber-sessions/session-metadata-store.js';
import type { createFileOpenRequester } from './file-open.js';
import type { createArchiveStore } from '../openchamber-sessions/archive-store.js';
const DEFAULT_WAIT_TIMEOUT_SECONDS = 600;
const MAX_WAIT_TIMEOUT_SECONDS = 86_400;
const WAIT_POLL_INTERVAL_MS = 500;
const MESSAGE_PAGE_LIMIT = 100;
const RESULT_PENDING_NOTE = 'The session runs in the background. Its final answer will be delivered to you automatically as a message when it finishes, and you will continue from there. Do not poll, sleep, or call session.messages to wait for it; carry on with other work or end your turn.';

const CONTROL_ACTIONS = new Set(OPENCHAMBER_ALL_ACTIONS);
const TOOL_ACTIONS = new Map<string, Set<string>>([
  ['openchamber', new Set(OPENCHAMBER_AGENT_TOOL_ACTIONS)],
  ['web', new Set(OPENCHAMBER_WEB_ACTIONS)],
  ['openchamber_knowledge', new Set(OPENCHAMBER_KNOWLEDGE_ACTIONS)],
  ['notify', new Set(OPENCHAMBER_NOTIFY_ACTIONS)],
  ['openchamber_render', new Set(OPENCHAMBER_RENDER_ACTIONS)],
  ['openchamber_usage', new Set(OPENCHAMBER_USAGE_ACTIONS)],
  ['openchamber_secret', new Set(OPENCHAMBER_SECRET_ACTIONS)],
  ['openchamber_workflow', new Set(OPENCHAMBER_WORKFLOW_ACTIONS)],
]);
const SCHEDULE_TASK_ID_ACTIONS = new Set([
  'schedule.update',
  'schedule.run',
  'schedule.delete',
  'schedule.toggle',
]);

const PREFERENCE_BY_RANK = new Map<number, 'favorite' | 'recent'>([
  [2, 'favorite'],
  [1, 'recent'],
]);

const agentErrorSchema = z.object({
  detail: z.string().optional(),
  error: z.string().optional(),
});

const modelRefSchema = z.object({
  providerId: z.string().optional(),
  providerID: z.string().optional(),
  modelId: z.string().optional(),
  modelID: z.string().optional(),
});

const controlModelEntrySchema = z.looseObject({
  modelId: z.string(),
  provider: z.string().optional(),
  name: z.string().optional(),
  status: z.enum(['active', 'alpha', 'beta', 'deprecated']).nullable().optional(),
  variants: z.array(z.object({ variant: z.string() })).optional(),
});

const controlModelCatalogSchema = z.looseObject({
  models: z.array(controlModelEntrySchema),
});

const controlProviderCatalogSchema = z.looseObject({
  providers: z.array(z.looseObject({
    providerId: z.string(),
    name: z.string().optional(),
  })),
});

const browserCaptureSchema = z.object({
  base64: z.string().optional(),
  mime: z.string().optional(),
  url: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  viewport: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
});

const worktreeInputSchema = z.object({
  name: z.json().optional(),
  branchName: z.json().optional(),
  startRef: z.json().optional(),
  existingBranch: z.json().optional(),
});

const hostScopeSchema = z.object({
  rootSessionId: z.string().min(1),
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  cwd: z.string().min(1),
  agentDirectory: z.string().min(1),
  agentDirectoryId: z.string().min(1).optional(),
});

const hostRequestSchema = z.object({
  toolName: z.string().min(1),
  action: z.string().min(1),
  sessionId: z.string().min(1),
  toolCallId: z.string().optional(),
  input: z.record(z.string(), z.union([z.json(), z.undefined()])).optional(),
});

const hostErrorSchema = z.object({
  statusCode: z.number().int().optional(),
  status: z.number().int().optional(),
  code: z.string().optional(),
  message: z.string().optional(),
});

const positiveInteger = (value: ControlInput['limit'], fallback: number, field: string): number => {
  if (value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new OpenChamberControlError(`${field} must be a positive integer`, 400);
  }
  return number;
};

const normalizeWaitTimeoutMs = (value: ControlInput['timeout']): number => {
  const seconds = value === undefined || value === null ? DEFAULT_WAIT_TIMEOUT_SECONDS : Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_WAIT_TIMEOUT_SECONDS) {
    throw new OpenChamberControlError(`timeout must be from 1 to ${MAX_WAIT_TIMEOUT_SECONDS} seconds`, 400);
  }
  return seconds * 1000;
};

const parseModel = (value: ControlInput['model']) => {
  const model = asNonEmptyString(value);
  if (!model) throw new OpenChamberControlError('model is required', 400);
  const parsed = parseModelSelector(model);
  if (!parsed) throw new OpenChamberControlError('model must be in provider/model format', 400);
  return { providerID: parsed.providerId, modelID: parsed.modelId, thinkingLevel: parsed.thinkingLevel };
};

const sessionOptions = (input: ControlInput): CapturedSendOptions => {
  const model = input.model === undefined ? null : parseModel(input.model);
  return {
    providerId: model?.providerID ?? null,
    modelId: model?.modelID ?? null,
    agentId: asNonEmptyString(input.agent) || null,
    variant: asNonEmptyString(input.variant) || null,
    reasoningEffort: thinkingLevelToReasoningEffort(model?.thinkingLevel),
  };
};

const sessionPromptRequest = (input: ControlInput): PromptRequest => ({
  input: {
    text: isString(input.prompt) ? input.prompt.trim() : '',
    attachments: [],
    context: [],
  },
  options: sessionOptions(input),
});

const parseWeekdays = (value: ControlInput['weekly']): number[] => {
  const raw = asNonEmptyString(value);
  if (!raw) throw new OpenChamberControlError('weekly is required', 400);
  const weekdays = raw.split(',').map((entry) => Number.parseInt(entry.trim(), 10));
  if (weekdays.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 6)) {
    throw new OpenChamberControlError('weekly must contain weekdays from 0 to 6', 400);
  }
  return Array.from(new Set(weekdays)).sort((a, b) => a - b);
};

export interface ScheduledTaskScheduleInput {
  kind: 'daily' | 'weekly' | 'once' | 'cron';
  times?: string[];
  weekdays?: number[];
  date?: string;
  time?: string;
  cron?: string;
  timezone?: string;
}

export interface ScheduledTaskExecutionInput {
  prompt: string;
  providerID?: string;
  modelID?: string;
  useDefaults?: boolean;
  agent?: string;
  variant?: string;
  goalEnabled?: boolean;
  goalTokenBudget?: number;
}

export interface ScheduledTaskRecord {
  id?: string;
  targetSessionId?: JsonValue | undefined;
  name: string;
  enabled: boolean;
  loopFile?: string;
  schedule: ScheduledTaskScheduleInput;
  execution: ScheduledTaskExecutionInput;
}

const buildSchedule = (input: ControlInput): ScheduledTaskScheduleInput => {
  const daily = asNonEmptyString(input.daily);
  const weekly = asNonEmptyString(input.weekly);
  const once = asNonEmptyString(input.once);
  const cron = asNonEmptyString(input.cron);
  const selectors = [daily, weekly, once, cron].filter((value): value is string => Boolean(value));
  if (selectors.length !== 1) {
    throw new OpenChamberControlError('Provide exactly one of daily, weekly, once, or cron', 400);
  }
  const timezone = asNonEmptyString(input.timezone);
  if (daily) {
    const schedule: ScheduledTaskScheduleInput = { kind: 'daily', times: [daily] };
    if (timezone) schedule.timezone = timezone;
    return schedule;
  }
  if (weekly) {
    const time = asNonEmptyString(input.time);
    if (!time) throw new OpenChamberControlError('time is required with weekly', 400);
    const schedule: ScheduledTaskScheduleInput = { kind: 'weekly', weekdays: parseWeekdays(weekly), times: [time] };
    if (timezone) schedule.timezone = timezone;
    return schedule;
  }
  if (once) {
    const time = asNonEmptyString(input.time);
    if (!time) throw new OpenChamberControlError('time is required with once', 400);
    const schedule: ScheduledTaskScheduleInput = { kind: 'once', date: once, time };
    if (timezone) schedule.timezone = timezone;
    return schedule;
  }
  const schedule: ScheduledTaskScheduleInput = { kind: 'cron', cron: cron ?? '' };
  if (timezone) schedule.timezone = timezone;
  return schedule;
};

const parseGoalTokenBudget = (value: ControlInput['goalTokenBudget']): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = z.number().int().min(1000).max(100_000_000).safeParse(value);
  if (!parsed.success) {
    throw new OpenChamberControlError('goalTokenBudget must be from 1000 to 100000000', 400);
  }
  return parsed.data;
};

const buildScheduledTask = (input: ControlInput): ScheduledTaskRecord => {
  const name = asNonEmptyString(input.name);
  const prompt = asNonEmptyString(input.prompt);
  if (!name) throw new OpenChamberControlError('name is required', 400);
  if (!prompt) throw new OpenChamberControlError('prompt is required', 400);
  const targetSessionId = asNonEmptyString(input.targetSessionId);
  const agent = asNonEmptyString(input.agent);
  const variant = asNonEmptyString(input.variant);
  const goalTokenBudget = input.goalTokenBudget;
  if (goalTokenBudget !== undefined && input.goal !== true) {
    throw new OpenChamberControlError('goalTokenBudget requires goal', 400);
  }
  const validatedBudget = parseGoalTokenBudget(goalTokenBudget);
  const execution: ScheduledTaskExecutionInput = { prompt };
  if (targetSessionId && input.model === undefined) {
    execution.useDefaults = !agent;
  } else {
    const parsedModel = parseModel(input.model);
    execution.providerID = parsedModel.providerID;
    execution.modelID = parsedModel.modelID;
  }
  if (agent) execution.agent = agent;
  if (variant) execution.variant = variant;
  if (input.goal === true) execution.goalEnabled = true;
  if (validatedBudget !== undefined) execution.goalTokenBudget = validatedBudget;
  const task: ScheduledTaskRecord = {
    name,
    enabled: input.disabled !== true,
    schedule: buildSchedule(input),
    execution,
  };
  if (input.targetSessionId !== undefined) task.targetSessionId = targetSessionId ?? input.targetSessionId;
  return task;
};

const patchScheduledTask = (existing: ScheduledTaskRecord, input: ControlInput): ScheduledTaskRecord => {
  if (existing.loopFile) {
    throw new OpenChamberControlError(`This task comes from ${existing.loopFile}; change that file instead`, 409);
  }
  const execution: ScheduledTaskExecutionInput = { ...existing.execution };
  if (input.prompt !== undefined) {
    const prompt = asNonEmptyString(input.prompt);
    if (!prompt) throw new OpenChamberControlError('prompt cannot be empty', 400);
    execution.prompt = prompt;
  }
  if (input.model !== undefined) {
    const parsedModel = parseModel(input.model);
    execution.providerID = parsedModel.providerID;
    execution.modelID = parsedModel.modelID;
    delete execution.variant;
    delete execution.useDefaults;
  }
  if (input.variant !== undefined) {
    const value = asNonEmptyString(input.variant);
    if (value) execution.variant = value;
    else delete execution.variant;
  }
  if (input.agent !== undefined) {
    const value = asNonEmptyString(input.agent);
    if (value) execution.agent = value;
    else delete execution.agent;
    if (value && (input.targetSessionId || existing.targetSessionId)) delete execution.useDefaults;
  }
  if (isBoolean(input.goal)) {
    if (input.goal) execution.goalEnabled = true;
    else {
      delete execution.goalEnabled;
      delete execution.goalTokenBudget;
    }
  }
  if (input.goalTokenBudget !== undefined) {
    if (!execution.goalEnabled) throw new OpenChamberControlError('goalTokenBudget requires goal', 400);
    const budget = parseGoalTokenBudget(input.goalTokenBudget);
    if (budget !== undefined) execution.goalTokenBudget = budget;
  }
  let name = existing.name;
  if (input.name !== undefined) {
    const nextName = asNonEmptyString(input.name);
    if (!nextName) throw new OpenChamberControlError('name cannot be empty', 400);
    name = nextName;
  }
  const replacesSchedule = Boolean(
    asNonEmptyString(input.daily)
    || asNonEmptyString(input.weekly)
    || asNonEmptyString(input.once)
    || asNonEmptyString(input.cron),
  );
  const timezone = asNonEmptyString(input.timezone);
  const schedule = replacesSchedule
    ? buildSchedule(input)
    : (timezone ? { ...existing.schedule, timezone } : existing.schedule);
  const patched: ScheduledTaskRecord = {
    targetSessionId: input.targetSessionId === undefined ? existing.targetSessionId : input.targetSessionId,
    name,
    enabled: isBoolean(input.disabled) ? !input.disabled : existing.enabled,
    schedule,
    execution,
  };
  if (existing.id !== undefined) patched.id = existing.id;
  return patched;
};

const modelRefKeyFromUnknown = (ref: JsonValue | undefined): string => {
  const parsed = modelRefSchema.safeParse(ref);
  if (!parsed.success) return 'undefined/undefined';
  return `${parsed.data.providerId ?? parsed.data.providerID}/${parsed.data.modelId ?? parsed.data.modelID}`;
};

export interface ControlScope {
  projectId: string;
  hostProjectId?: string | null | undefined;
  workspaceId: string;
  cwd: string;
  agentDirectory: string;
  agentDirectoryId?: string | undefined;
  displayPath?: string | undefined;
  rootSessionId?: string | undefined;
}

export interface ControlSettings {
  agentTerminalToolEnabled?: JsonValue;
  agentUsageToolEnabled?: JsonValue;
  agentScheduleToolEnabled?: JsonValue;
  sessionWorkEnabled?: JsonValue;
  sessionGoalDefaultBudgetEnabled?: JsonValue;
  sessionGoalDefaultBudget?: number | null | undefined;
  hiddenModels?: JsonValue;
  recentModels?: JsonValue;
  favoriteModels?: JsonValue;
}

export interface ControlAgentService {
  request: (pathname: string, init?: RequestInit) => Promise<Response>;
}

export interface ControlHistoryMessage {
  messageId?: string;
  role: string;
  turnId: string;
  createdAt?: number;
  providerId?: string | null | undefined;
  modelId?: string | null | undefined;
  parts?: ReadonlyArray<{ type: string; content?: string }>;
}

export interface ControlHistoryTurn {
  turnId: string;
  finishedAt?: number | undefined;
}

export interface ControlSessionDispatchPayload {
  sessionId?: string | undefined;
  id?: string | undefined;
  session?: { sessionId?: string | undefined; id?: string | undefined; rootSessionId?: string | undefined; title?: string | undefined; runtimeStatus?: string | undefined } | null | undefined;
  run?: { runId?: string | undefined; sessionId?: string | undefined } | null | undefined;
  baselineAssistantMessageId?: string | undefined;
  baselineIdleRecordId?: string | null | undefined;
  promptDispatched?: boolean | undefined;
}

export interface ControlSessionService {
  open: (sessionId: string) => Promise<{
    session?: { sessionId?: string; rootSessionId?: string; title?: string | null | undefined; runtimeStatus?: string } | null;
  }>;
  getMetadata: (sessionId: string) => Promise<{
    sessionId?: string;
    revision?: string;
    metadata?: SessionMetadata | JsonValue | null;
  }>;
  history: (sessionId: string, query: string) => Promise<{
    turns?: readonly ControlHistoryTurn[];
    messages?: readonly ControlHistoryMessage[];
    nextCursor?: string | null | undefined;
  }>;
  list: (workspaceId: string) => Promise<{
    items?: ReadonlyArray<{ sessionId?: string; id?: string; runtimeStatus?: string }>;
  }>;
  create: (payload: {
    projectId: string;
    workspaceId: string;
    options: CapturedSendOptions;
    title?: string;
  }) => Promise<ControlSessionDispatchPayload>;
  send: (sessionId: string, payload: PromptRequest) => Promise<ControlSessionDispatchPayload>;
  fork: (sessionId: string, payload: { messageId?: string }) => Promise<ControlSessionDispatchPayload>;
  control?: ((sessionId: string, operation: {
    type: 'goal';
    op: 'create';
    objective: string;
    tokenBudget: number | null;
    providerId?: string;
    modelId?: string;
    variant: string | null;
    reasoningEffort: string | null;
  }) => Promise<{ type?: string; mode?: { kind?: string; status?: string } } | { run: { runId: string; sessionId: string } }>) | undefined;
  resolveDirectory: (input: { workspaceId?: string; projectId?: string }) => Promise<string>;
  moveToWorktree?: ((
    sessionId: string,
    payload: {
      worktree: { name?: string; branchName?: string; startRef?: string; existingBranch?: string };
      carry: JsonValue[];
    },
    options: { contextSessionId?: string | null | undefined },
  ) => Promise<JsonValue | object>) | undefined;
}

export interface ControlScheduledTaskService {
  status: () => Promise<JsonValue | object>;
  resolveProjectID: (input: { projectId?: string; workspaceId?: string }) => Promise<string>;
  list: (projectId: string) => Promise<readonly ScheduledTaskRecord[]>;
  upsert: (projectId: string, task: ScheduledTaskRecord) => Promise<{ task: ScheduledTaskRecord; created?: boolean }>;
  run: (projectId: string, taskId: string) => Promise<JsonValue | object>;
  remove: (projectId: string, taskId: string) => Promise<readonly ScheduledTaskRecord[]>;
  setEnabled: (projectId: string, taskId: string, enabled: boolean) => Promise<ScheduledTaskRecord | null | undefined>;
}

export interface ControlNotifyResult {
  status: number;
  body: { error?: string; ok?: boolean; delivered?: boolean; reason?: string };
}

export interface ControlProjectsListing {
  items: ReadonlyArray<{ projectId: string; name?: string; workspaceIds?: readonly string[] }>;
  errors: object;
}

export interface ControlWorkspaceScopesListing {
  items: ReadonlyArray<{ workspaceId: string }>;
  errors: object;
}

export interface ControlDispatchResults {
  register: (input: {
    parentSessionId: string;
    sessionId: string;
    dispatchedAt: number;
    afterIdleId?: string | null | undefined;
  }) => Promise<JsonValue | void | undefined>;
}

export interface ControlPrWatch {
  watch: (input: { sessionID: string | null; directory: string | null; url: JsonValue | undefined }) => Promise<JsonValue | object>;
  unwatch: (sessionID: string | null) => Promise<JsonValue | object>;
}

export interface ControlExtensionWaits {
  listWaits: (sessionId: string | null | undefined) => Promise<JsonValue | object>;
  stopWaits: (sessionId: string | null | undefined, waitId: ControlInput['waitId']) => Promise<JsonValue | object>;
  startWait: (input: { sessionID: string | null | undefined; directory: string | null; source: ControlInput['source']; args: ControlInput['args'] }) => Promise<JsonValue | object>;
}

export interface ControlSessionLinks {
  link: (input: { sessionId: string | null; directory: string | null; link: JsonValue | undefined }) => Promise<JsonValue | object>;
}

export interface OpenChamberControlDependencies {
  readSettingsFromDiskMigrated: () => Promise<ControlSettings | null | undefined>;
  service: ControlAgentService;
  sessionService: ControlSessionService;
  resolveSessionScope: (sessionId: string) => Promise<ControlScope | null | undefined>;
  resolveWorkspaceScope: (workspaceId: string) => Promise<ControlScope | null | undefined>;
  listWorkspaceScopes: () => Promise<ControlWorkspaceScopesListing>;
  listProjects: () => Promise<ControlProjectsListing>;
  scheduledTaskService: ControlScheduledTaskService;
  browserControl?: Pick<ReturnType<typeof createBrowserControlRouter>, 'request'> | null;
  browserUploads?: Pick<ReturnType<typeof createUploadStore>, 'put'> | null;
  getTerminalRuntime?: TerminalReadDependencies['getTerminalRuntime'];
  loadQuota?: ((scope: ControlScope) => ReturnType<UsageReadDependencies['loadQuota']>) | null;
  updateSessionMetadata?: ((
    sessionId: string,
    decide: (current: SessionMetadata | JsonValue | null) => JsonValue | null,
    options: { directory: string },
  ) => Promise<{ changed: boolean }>) | null;
  isWorktreePinned?: ((directory: string) => Promise<boolean>) | undefined;
  chatRoots?: readonly string[] | undefined;
  fileOpen?: Pick<ReturnType<typeof createFileOpenRequester>, 'request'> | null;
  notifyUser?: ((input: {
    title: JsonValue | undefined;
    body: JsonValue | undefined;
    showWhenFocused: JsonValue | undefined;
    sessionId?: string | undefined;
    directory?: string | undefined;
  }) => Promise<ControlNotifyResult>) | null;
  projectContextRuntime?: ProjectKnowledgeDependencies['projectContextRuntime'];
  resolveProjectContextId?: ProjectKnowledgeDependencies['resolveProjectContextId'];
  showPlan?: ProjectKnowledgeDependencies['showPlan'];
  isKnowledgeToolEnabled?: (() => Promise<boolean>) | undefined;
  sessionLinks?: ControlSessionLinks | null;
  isRenderToolEnabled?: (() => Promise<boolean>) | undefined;
  isSecretToolEnabled?: (() => Promise<boolean>) | undefined;
  hasUnreadChat?: ((sessionId: string) => Promise<boolean>) | undefined;
  onPageWaitChange?: PageAnswersOptions['onWaitChange'];
  dispatchResults?: ControlDispatchResults | null;
  prWatch?: ControlPrWatch | null;
  extensionWaits?: ControlExtensionWaits | null;
  laterPages?: (RenderPageDependencies['laterPages'] & { answer: (input: PageAnswerInput) => Promise<{ answered: boolean }> }) | null;
  sharePages?: RenderPageDependencies['sharePages'];
  archiveStore?: Pick<ReturnType<typeof createArchiveStore>, 'archivedAt'> | null;
  workflowRuntime?: WorkflowRuntime | null;
  sleep?: ((duration: number) => Promise<void>) | undefined;
  now?: (() => number) | undefined;
}

const sessionKindFromMetadata = (metadata: SessionMetadata | JsonValue | null | undefined): string | null => {
  const parsed = z.object({ openchamber: z.object({ kind: z.string() }) }).safeParse(metadata);
  return parsed.success ? parsed.data.openchamber.kind : null;
};

export const createOpenChamberControlService = (dependencies: OpenChamberControlDependencies) => {
  const {
    readSettingsFromDiskMigrated,
    service,
    sessionService,
    resolveSessionScope,
    resolveWorkspaceScope,
    listWorkspaceScopes,
    listProjects,
    scheduledTaskService,
    browserControl = null,
    browserUploads = null,
    getTerminalRuntime = null,
    loadQuota = null,
    updateSessionMetadata = null,
    isWorktreePinned = async () => false,
    chatRoots = [],
    fileOpen = null,
    notifyUser = null,
    projectContextRuntime = null,
    resolveProjectContextId = null,
    showPlan = null,
    isKnowledgeToolEnabled = async () => true,
    sessionLinks = null,
    isRenderToolEnabled = async () => true,
    isSecretToolEnabled = async () => true,
    hasUnreadChat = async () => false,
    onPageWaitChange = () => { },
    dispatchResults = null,
    prWatch = null,
    extensionWaits = null,
    laterPages = null,
    sharePages = null,
    archiveStore = null,
    workflowRuntime = null,
    sleep = (duration: number) => new Promise<void>((resolve) => setTimeout(resolve, duration)),
    now = Date.now,
  } = dependencies;

  if (!service?.request) throw new Error('control service requires the Agent service');
  if (!sessionService?.open || !sessionService?.history) {
    throw new Error('control service requires the canonical session service');
  }
  if (!resolveSessionScope || !resolveWorkspaceScope) {
    throw new Error('control service requires Host session and workspace scope resolvers');
  }
  if (!listWorkspaceScopes || !listProjects) {
    throw new Error('control service requires canonical workspace and project listings');
  }
  if (!readSettingsFromDiskMigrated) throw new Error('control service requires settings for feature policy');

  const wait = (duration: number, signal?: AbortSignal): Promise<void> => {
    if (!signal) return sleep(duration);
    if (signal.aborted) return Promise.reject(new OpenChamberControlError('OhPiChamber action was cancelled', 499));
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        reject(new OpenChamberControlError('OhPiChamber action was cancelled', 499));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      sleep(duration).then(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      });
    });
  };

  const agentRequest = async (pathname: string, init: RequestInit = {}): Promise<JsonValue> => {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    const response = await service.request(pathname, { ...init, headers });
    const rawBody = await response.json().catch(() => null);
    if (!response.ok) {
      const parsedError = agentErrorSchema.safeParse(rawBody);
      const message = parsedError.success
        ? (parsedError.data.detail || parsedError.data.error || 'Agent service request failed')
        : 'Agent service request failed';
      throw new OpenChamberControlError(message, response.status);
    }
    return z.json().parse(rawBody);
  };

  const archivedAt = async (sessionID: string | undefined): Promise<number | null> => {
    if (!archiveStore || !sessionID) return null;
    return (await archiveStore.archivedAt(sessionID)) ?? null;
  };

  const projects = async (): Promise<ControlProjectsListing> => {
    const result = await listProjects();
    if (!result || !Array.isArray(result.items) || !result.errors) {
      throw new OpenChamberControlError('Invalid project listing', 500);
    }
    return result;
  };

  const workspaceScopes = async (): Promise<ControlWorkspaceScopesListing> => {
    const result = await listWorkspaceScopes();
    if (!result || !Array.isArray(result.items) || !result.errors) {
      throw new OpenChamberControlError('Invalid workspace scope listing', 500);
    }
    return result;
  };

  const resolveProjectDirectory = async (projectId: string): Promise<string> => {
    const listed = await projects();
    const project = listed.items.find((entry) => entry.projectId === projectId);
    const workspaceId = project?.workspaceIds?.[0];
    if (!workspaceId) throw new OpenChamberControlError('Project not found', 404);
    return sessionService.resolveDirectory({ workspaceId });
  };

  const knowledgeActions = createProjectKnowledgeActions({
    projectContextRuntime,
    resolveProjectContextId,
    isEnabled: isKnowledgeToolEnabled,
    showPlan,
    resolveDirectory: (input: { projectId?: string } = {}) => (input.projectId
      ? resolveProjectDirectory(input.projectId)
      : sessionService.resolveDirectory(input)),
  });

  const assertSingleScope = (input: ControlInput): void => {
    const projectId = asNonEmptyString(input.projectId);
    const directory = asNonEmptyString(input.directory);
    const workspaceId = asNonEmptyString(input.workspaceId);
    if ((projectId && directory) || (workspaceId && (projectId || directory))) {
      throw new OpenChamberControlError('Provide only one workspaceId, projectId, or directory', 400);
    }
  };

  const resolveWorkspaceFor = async (
    input: ControlInput = {},
    contextSessionId = '',
    contextDirectory = '',
  ): Promise<ControlScope> => {
    assertSingleScope(input);
    const explicitWorkspaceId = asNonEmptyString(input.workspaceId);
    if (explicitWorkspaceId) {
      const scope = await resolveWorkspaceScope(explicitWorkspaceId);
      if (!scope) throw new OpenChamberControlError('Workspace was not found', 404);
      return scope;
    }
    const sessionId = asNonEmptyString(contextSessionId);
    const explicitProjectId = asNonEmptyString(input.projectId);
    const explicitDirectory = asNonEmptyString(input.directory);
    if (sessionId && !explicitProjectId && !explicitDirectory) {
      const scope = await resolveSessionScope(sessionId);
      if (!scope) throw new OpenChamberControlError('Session scope was not found', 404);
      return scope;
    }
    const directory = explicitDirectory || asNonEmptyString(contextDirectory);
    const listed = await workspaceScopes();
    let workspaceIds = listed.items.map((item) => item.workspaceId).filter((id) => isString(id));
    if (explicitProjectId) {
      const projectListing = await projects();
      const project = projectListing?.items?.find((item) => item?.projectId === explicitProjectId);
      workspaceIds = Array.isArray(project?.workspaceIds) ? [...project.workspaceIds] : [];
    }
    for (const workspaceId of workspaceIds) {
      const scope = await resolveWorkspaceScope(workspaceId);
      if (scope && (!explicitProjectId || scope.projectId === explicitProjectId) && (!directory || scope.cwd === directory)) {
        return scope;
      }
    }
    throw new OpenChamberControlError('Workspace scope was not found', 404);
  };

  const resolveReadScope = async (
    input: ControlInput,
    contextDirectory: ControlInput['directory'],
    contextSessionId: string | null | undefined,
    sessionID = '',
  ): Promise<ControlScope> => {
    assertSingleScope(input);
    const actual = sessionID ? await resolveSessionScope(sessionID) : null;
    if (sessionID && !actual) throw new OpenChamberControlError('Session scope was not found', 404);
    if (actual && !asNonEmptyString(input.projectId) && !asNonEmptyString(input.directory) && !asNonEmptyString(input.workspaceId)) {
      return actual;
    }
    const requested = await resolveWorkspaceFor(input, contextSessionId ?? '', asNonEmptyString(contextDirectory) ?? '');
    if (!actual) return requested;
    if ((asNonEmptyString(input.projectId) && actual.projectId !== input.projectId)
      || (asNonEmptyString(input.directory) && actual.cwd !== input.directory)
      || (requested.workspaceId && actual.workspaceId !== requested.workspaceId)) {
      throw new OpenChamberControlError('Session is outside the requested scope', 403);
    }
    return actual;
  };

  const setWorkState = async (
    input: ControlInput,
    contextDirectory: ControlInput['directory'],
    contextSessionId: string | null | undefined,
    state: 'open' | 'done',
  ) => {
    if (!updateSessionMetadata) throw new OpenChamberControlError('Changing In work is not available on this server', 503);
    const settings = await readSettingsFromDiskMigrated();
    if (settings?.sessionWorkEnabled === false) throw new OpenChamberControlError('In work is turned off in Settings', 409);
    const sessionId = asNonEmptyString(input.sessionId) || asNonEmptyString(contextSessionId);
    if (!sessionId) throw new OpenChamberControlError('sessionId is required', 400);
    const scope = await resolveReadScope(input, contextDirectory, contextSessionId, sessionId);
    const { session } = await sessionService.open(sessionId);
    const { metadata } = await sessionService.getMetadata(sessionId);
    if (state === 'open') {
      const directory = path.resolve(scope.cwd);
      const isChat = chatRoots.some((root) => directory === path.resolve(root) || directory.startsWith(`${path.resolve(root)}${path.sep}`));
      const kind = sessionKindFromMetadata(metadata);
      if (session?.sessionId !== sessionId || session.rootSessionId !== sessionId || isChat
        || (kind !== null && ['review', 'btw', 'scheduled'].includes(kind))) {
        throw new OpenChamberControlError('Only root project sessions can be In work', 400);
      }
      if (await archivedAt(sessionId)) throw new OpenChamberControlError('Archived sessions cannot be In work', 409);
      if (isPinnedMetadata(metadata) || await isWorktreePinned(scope.cwd)) {
        throw new OpenChamberControlError('Pinned sessions and worktrees cannot be In work', 409);
      }
    }
    const { changed } = await updateSessionMetadata(
      sessionId,
      (current) => userStatePatch(current, { state, now: now() }),
      { directory: scope.cwd },
    );
    return { sessionId, directory: scope.cwd, title: asNonEmptyString(session?.title), inWork: state === 'open', changed };
  };

  const pageAnswers = createPageAnswers({ onWaitChange: onPageWaitChange });
  const secretRequests = createSecretRequests({ isEnabled: isSecretToolEnabled, onWaitChange: onPageWaitChange, hasUnreadChat });
  const readTerminal = createTerminalReadAction({
    readSettings: async () => (await readSettingsFromDiskMigrated()) ?? null,
    getTerminalRuntime,
  });
  const renderPage = createRenderPageAction({
    isEnabled: isRenderToolEnabled,
    pageAnswers,
    hasUnreadChat,
    readSession: (sessionId) => sessionService.getMetadata(sessionId),
    laterPages,
    sharePages,
  });

  const answerPage = async (input: PageAnswerInput): Promise<{ answered: boolean }> => {
    try {
      return pageAnswers.answer(input);
    } catch (error) {
      const parsedError = hostErrorSchema.safeParse(error);
      if (!laterPages || !parsedError.success || parsedError.data.statusCode !== 404) throw error;
      return laterPages.answer(input);
    }
  };

  const searchModels = async (
    input: ControlInput,
    contextSessionId: string | null | undefined,
    contextDirectory: ControlInput['directory'],
  ) => {
    const scope = await resolveWorkspaceFor(input, contextSessionId ?? '', asNonEmptyString(contextDirectory) ?? '');
    const workspaceId = asNonEmptyString(scope?.workspaceId);
    if (!workspaceId) throw new OpenChamberControlError('Workspace scope is missing workspaceId', 500);
    const [rawModelCatalog, rawProviderCatalog, settings] = await Promise.all([
      agentRequest(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/models`),
      agentRequest(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/providers`),
      readSettingsFromDiskMigrated(),
    ]);
    const parsedModelCatalog = controlModelCatalogSchema.safeParse(rawModelCatalog);
    const parsedProviderCatalog = controlProviderCatalogSchema.safeParse(rawProviderCatalog);
    const providerNames = new Map(
      (parsedProviderCatalog.success ? parsedProviderCatalog.data.providers : [])
        .map((provider) => [provider.providerId, provider.name ?? provider.providerId]),
    );
    const refs = (value: JsonValue | undefined) => {
      const list = z.array(z.json()).safeParse(value);
      return new Set((list.success ? list.data : []).map(modelRefKeyFromUnknown));
    };
    const hidden = refs(z.json().optional().catch(undefined).parse(settings?.hiddenModels));
    const rank = new Map<string, number>([
      ...[...refs(z.json().optional().catch(undefined).parse(settings?.recentModels))].map((key): [string, number] => [key, 1]),
      ...[...refs(z.json().optional().catch(undefined).parse(settings?.favoriteModels))].map((key): [string, number] => [key, 2]),
    ]);
    const provider = asNonEmptyString(input.provider)?.toLowerCase();
    const terms = (asNonEmptyString(input.query) ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const models = (parsedModelCatalog.success ? parsedModelCatalog.data.models : [])
      .filter((model) => !hidden.has(modelRefKeyFromUnknown({ providerId: model.provider, modelId: model.modelId })))
      .filter((model) => {
        if (!provider) return true;
        const modelProvider = model.provider ?? '';
        return modelProvider.toLowerCase() === provider
          || providerNames.get(modelProvider)?.toLowerCase() === provider;
      })
      .filter((model) => {
        const text = `${modelRefKeyFromUnknown({ providerId: model.provider, modelId: model.modelId })} ${model.name ?? ''}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      })
      .toSorted((left, right) => {
        const rightRank = rank.get(modelRefKeyFromUnknown({ providerId: right.provider, modelId: right.modelId })) ?? 0;
        const leftRank = rank.get(modelRefKeyFromUnknown({ providerId: left.provider, modelId: left.modelId })) ?? 0;
        if (rightRank !== leftRank) return rightRank - leftRank;
        const leftProvider = providerNames.get(left.provider ?? '') ?? left.provider ?? '';
        const rightProvider = providerNames.get(right.provider ?? '') ?? right.provider ?? '';
        return leftProvider.localeCompare(rightProvider) || (left.name ?? '').localeCompare(right.name ?? '');
      });
    const rawOffset = Number(input.offset);
    const rawLimit = Number(input.limit);
    const offset = Number.isSafeInteger(rawOffset) && rawOffset > 0 ? rawOffset : 0;
    const limit = Number.isSafeInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 100) : 10;
    const page = models.slice(offset, offset + limit);
    return {
      workspaceId,
      models: page.map((model) => {
        const providerId = model.provider ?? '';
        const keyRank = rank.get(modelRefKeyFromUnknown({ providerId, modelId: model.modelId }));
        return {
          id: formatModelRef({ provider: providerId, modelId: model.modelId }),
          name: model.name ?? model.modelId,
          provider: providerNames.get(providerId) ?? providerId,
          preference: keyRank !== undefined ? PREFERENCE_BY_RANK.get(keyRank) : undefined,
          status: model.status ?? null,
          variants: (model.variants ?? []).map((variant) => variant.variant),
        };
      }),
      total: models.length,
      next: offset + limit < models.length ? offset + limit : null,
    };
  };

  const models = async (
    input: ControlInput,
    contextSessionId: string | null | undefined,
    contextDirectory: ControlInput['directory'],
  ) => {
    const scope = await resolveWorkspaceFor(input, contextSessionId ?? '', asNonEmptyString(contextDirectory) ?? '');
    const workspaceId = asNonEmptyString(scope?.workspaceId);
    if (!workspaceId) throw new OpenChamberControlError('Workspace scope is missing workspaceId', 500);
    const [modelCatalog, providerCatalog] = await Promise.all([
      agentRequest(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/models`),
      agentRequest(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/providers`),
    ]);
    const parsedModels = controlModelCatalogSchema.safeParse(modelCatalog);
    const parsedProviders = controlProviderCatalogSchema.safeParse(providerCatalog);
    return {
      workspaceId,
      models: parsedModels.success ? parsedModels.data.models : modelCatalog,
      providers: parsedProviders.success ? parsedProviders.data.providers : providerCatalog,
    };
  };

  const asPublicStatus = (runtimeStatus: RuntimeSession['runtimeStatus'] | string | undefined): PublicSessionStatus | { type: 'unknown' } => {
    if (runtimeStatus === 'running' || runtimeStatus === 'awaiting_approval' || runtimeStatus === 'awaiting_input') return { type: 'busy' };
    if (runtimeStatus === 'idle') return { type: 'idle' };
    return { type: 'unknown' };
  };

  const sessionStatus = async (sessionID: string) => {
    const snapshot = await sessionService.open(sessionID);
    return asPublicStatus(snapshot?.session?.runtimeStatus);
  };

  const messageText = (message: ControlHistoryMessage): string => (Array.isArray(message?.parts) ? message.parts : [])
    .filter((part) => part?.type === 'text' && isString(part.content))
    .map((part) => part.content ?? '')
    .join('')
    .trim();

  const sessionMessages = async (sessionID: string, role: string, limit: number | undefined): Promise<TextMessage[]> => {
    const collected: ControlHistoryMessage[] = [];
    const turns = new Map<string, ControlHistoryTurn>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    while (true) {
      const query = new URLSearchParams({ limit: String(MESSAGE_PAGE_LIMIT) });
      if (cursor) query.set('cursor', cursor);
      const page = await sessionService.history(sessionID, query.toString());
      for (const turn of Array.isArray(page?.turns) ? page.turns : []) turns.set(turn.turnId, turn);
      const pageMessages = Array.isArray(page?.messages) ? page.messages : [];
      collected.push(...pageMessages);
      const next = asNonEmptyString(page?.nextCursor);
      if (!next) break;
      if (seenCursors.has(next)) throw new OpenChamberControlError('History cursor repeated', 500);
      seenCursors.add(next);
      cursor = next;
    }
    const result: TextMessage[] = [];
    for (const message of collected) {
      if ((message.role !== 'user' && message.role !== 'assistant') || (role !== 'all' && message.role !== role)) continue;
      const text = messageText(message);
      if (!text) continue;
      const turn = turns.get(message.turnId);
      const finishedAt = turn?.finishedAt;
      result.push({
        id: asNonEmptyString(message.messageId) || '',
        role: message.role,
        createdAt: message.createdAt !== undefined && Number.isFinite(message.createdAt) ? message.createdAt : null,
        completedAt: finishedAt !== undefined && Number.isFinite(finishedAt) ? finishedAt : null,
        model: formatCanonicalModelRefKey(message.providerId, message.modelId) || null,
        text,
      });
    }
    result.sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));
    return limit === undefined ? result : result.slice(-limit);
  };

  const waitForIdle = async ({
    sessionID,
    timeoutMs,
    requireActivity,
    baselineMessageID,
    startedAt,
    signal,
  }: {
    sessionID: string;
    timeoutMs: number;
    requireActivity: boolean;
    baselineMessageID: string | undefined;
    startedAt: number;
    signal?: AbortSignal | undefined;
  }) => {
    const deadline = now() + timeoutMs;
    let observedActivity = false;
    while (true) {
      if (signal?.aborted) throw new OpenChamberControlError('OhPiChamber action was cancelled', 499);
      const status = await sessionStatus(sessionID);
      if (status.type === 'busy') {
        observedActivity = true;
      } else if (status.type === 'idle' && (!requireActivity || observedActivity)) {
        return status;
      } else if (status.type === 'idle') {
        const message = (await sessionMessages(sessionID, 'assistant', 1))[0];
        if (message?.completedAt && (baselineMessageID ? message.id !== baselineMessageID : message.completedAt >= startedAt)) return status;
      }
      const remaining = deadline - now();
      if (remaining <= 0) throw new OpenChamberControlError(`Session did not become idle within ${Math.ceil(timeoutMs / 1000)} seconds`, 500);
      await wait(Math.min(WAIT_POLL_INTERVAL_MS, remaining), signal);
    }
  };

  const resolveSessionDirectory = async (sessionID: string): Promise<string | null> => {
    try {
      const scope = await resolveSessionScope(sessionID);
      return asNonEmptyString(scope?.cwd) || null;
    } catch {
      return null;
    }
  };

  const assertReturnResult = (action: string, input: ControlInput, parentSessionID: string | null): void => {
    if (input.wait === true) throw new OpenChamberControlError('returnResult cannot be combined with wait', 400);
    if (!dispatchResults) throw new OpenChamberControlError('Returning a session result is not available on this server', 503);
    if (!parentSessionID) throw new OpenChamberControlError('returnResult needs a calling session to deliver the result to', 400);
    if (!asNonEmptyString(input.prompt)) throw new OpenChamberControlError('returnResult requires prompt', 400);
    if (action === 'session.send' && asNonEmptyString(input.sessionId) === parentSessionID) {
      throw new OpenChamberControlError('returnResult cannot deliver a session\'s result to itself', 400);
    }
  };

  const scheduleResultDelivery = async (
    result: ControlSessionDispatchPayload & { sessionId: string },
    parentSessionID: string,
    dispatchedAt: number,
  ) => {
    const afterIdleId = result.baselineIdleRecordId;
    if (!dispatchResults || result.promptDispatched !== true) {
      return { status: 'not-scheduled', reason: 'The prompt was not dispatched, so there is no result to return.' };
    }
    try {
      const registration: Parameters<ControlDispatchResults['register']>[0] = {
        parentSessionId: parentSessionID,
        sessionId: result.sessionId,
        dispatchedAt,
      };
      if (afterIdleId !== undefined) registration.afterIdleId = afterIdleId;
      await dispatchResults.register(registration);
      return { status: 'pending', note: RESULT_PENDING_NOTE };
    } catch (error) {
      return {
        status: 'not-scheduled',
        reason: `The session runs, but its result will not be delivered: ${error instanceof Error ? error.message : String(error)}. Read it later with session.messages if the user asks.`,
      };
    }
  };

  const startSessionGoal = async (sessionID: string, input: ControlInput) => {
    if (input.goal !== true) return null;
    const objective = asNonEmptyString(input.prompt);
    if (!objective) throw new OpenChamberControlError('goal requires prompt', 400);
    if (!sessionService.control) throw new OpenChamberControlError('Native goal control is unavailable', 503);
    const validatedBudget = parseGoalTokenBudget(input.goalTokenBudget);
    const settings = await readSettingsFromDiskMigrated();
    const tokenBudget = validatedBudget ?? (settings?.sessionGoalDefaultBudgetEnabled === true ? settings.sessionGoalDefaultBudget : null) ?? null;
    const options = sessionPromptRequest(input).options;
    const goalOp: Parameters<NonNullable<ControlSessionService['control']>>[1] = {
      type: 'goal',
      op: 'create',
      objective,
      tokenBudget,
      variant: options.variant,
      reasoningEffort: options.reasoningEffort,
    };
    if (options.providerId) goalOp.providerId = options.providerId;
    if (options.modelId) goalOp.modelId = options.modelId;
    const result = await sessionService.control(sessionID, goalOp);
    if (!('type' in result) || result.type !== 'goal' || result.mode?.kind !== 'goal' || result.mode.status !== 'active') {
      throw new OpenChamberControlError('Native goal acknowledgement is invalid', 502);
    }
    return { goalEnabled: true, goalTokenBudget: tokenBudget };
  };

  const executeSessionAction = async (
    action: string,
    input: ControlInput,
    contextDirectory: ControlInput['directory'],
    signal: AbortSignal | undefined,
    contextSessionId: string | null | undefined,
  ) => {
    if (input.wait !== undefined && !isBoolean(input.wait)) {
      throw new OpenChamberControlError('wait must be a boolean', 400);
    }
    if (input.returnResult !== undefined && !isBoolean(input.returnResult)) {
      throw new OpenChamberControlError('returnResult must be a boolean', 400);
    }
    if (input.timeout !== undefined && input.wait !== true) throw new OpenChamberControlError('timeout requires wait', 400);
    if (input.lastAssistant === true && input.wait !== true) throw new OpenChamberControlError('lastAssistant requires wait', 400);
    assertSingleScope(input);
    if (input.goalTokenBudget !== undefined && input.goal !== true) throw new OpenChamberControlError('goalTokenBudget requires goal', 400);
    if (input.goal === true && !asNonEmptyString(input.prompt)) throw new OpenChamberControlError('goal requires prompt', 400);
    if (input.goalTokenBudget !== undefined) parseGoalTokenBudget(input.goalTokenBudget);
    if (input.pullRequest !== undefined && action !== 'session.create') {
      throw new OpenChamberControlError('pullRequest applies only to session.create', 400);
    }
    const sessionID = asNonEmptyString(input.sessionId);
    const parentSessionID = asNonEmptyString(contextSessionId);
    const returnResult = input.returnResult === true;
    if (returnResult) assertReturnResult(action, input, parentSessionID);
    const startedAt = now();
    let result: ControlSessionDispatchPayload;
    if (action === 'session.create') {
      const scope = await resolveWorkspaceFor(input, contextSessionId ?? '', asNonEmptyString(contextDirectory) ?? '');
      if (input.worktree !== undefined || input.branch !== undefined || input.startRef !== undefined || input.setUpstream !== undefined || input.pullRequest !== undefined) {
        throw new OpenChamberControlError('Worktree and pull-request session creation are not supported by the native session manager', 400);
      }
      const createPayload: Parameters<ControlSessionService['create']>[0] = {
        projectId: scope.projectId,
        workspaceId: scope.workspaceId,
        options: sessionOptions(input),
      };
      const title = asNonEmptyString(input.title);
      if (title) createPayload.title = title;
      const created = await sessionService.create(createPayload);
      const canonicalSessionID = asNonEmptyString(created?.sessionId)
        || asNonEmptyString(created?.session?.sessionId)
        || asNonEmptyString(created?.session?.id)
        || asNonEmptyString(created?.id);
      if (!canonicalSessionID) throw new OpenChamberControlError('Agent service returned no session id', 502);
      result = { ...created, sessionId: canonicalSessionID, promptDispatched: false };
      const goal = await startSessionGoal(canonicalSessionID, input);
      if (goal) {
        result = { ...result, ...goal, promptDispatched: true };
      } else if (asNonEmptyString(input.prompt)) {
        const sent = await sessionService.send(canonicalSessionID, sessionPromptRequest(input));
        result = { ...result, ...sent, sessionId: canonicalSessionID, promptDispatched: true };
      }
    } else {
      if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
      await resolveReadScope(input, contextDirectory, contextSessionId, sessionID);
      if (action === 'session.send') {
        const goal = await startSessionGoal(sessionID, input);
        if (goal) result = { ...goal, sessionId: sessionID, promptDispatched: true };
        else result = { ...(await sessionService.send(sessionID, sessionPromptRequest(input))), sessionId: sessionID, promptDispatched: true };
      } else {
        const forkPayload: Parameters<ControlSessionService['fork']>[1] = {};
        const messageId = asNonEmptyString(input.messageId);
        if (messageId) forkPayload.messageId = messageId;
        result = await sessionService.fork(sessionID, forkPayload);
        const childSessionID = asNonEmptyString(result?.sessionId)
          || asNonEmptyString(result?.session?.sessionId)
          || asNonEmptyString(result?.session?.id)
          || asNonEmptyString(result?.id);
        if (!childSessionID) throw new OpenChamberControlError('Agent service returned no forked session id', 502);
        result = { ...result, sessionId: childSessionID, promptDispatched: false };
        const goal = await startSessionGoal(childSessionID, input);
        if (goal) {
          result = { ...result, ...goal, promptDispatched: true };
        } else if (asNonEmptyString(input.prompt)) {
          const sent = await sessionService.send(childSessionID, sessionPromptRequest(input));
          result = { ...result, ...sent, sessionId: childSessionID, promptDispatched: true };
        }
      }
    }
    const canonicalSessionID = asNonEmptyString(result?.sessionId)
      || asNonEmptyString(result?.run?.sessionId)
      || asNonEmptyString(result?.session?.sessionId)
      || asNonEmptyString(result?.session?.id);
    if (!canonicalSessionID) throw new OpenChamberControlError('Agent service returned no session id', 502);
    const { baselineAssistantMessageId, baselineIdleRecordId: _baselineIdle, ...cleanFields } = result;
    const normalizedResult = { ...cleanFields, sessionId: canonicalSessionID, promptDispatched: result.promptDispatched === true };
    if (returnResult && parentSessionID) {
      return {
        ...normalizedResult,
        resultDelivery: await scheduleResultDelivery({ ...result, sessionId: canonicalSessionID }, parentSessionID, startedAt),
      };
    }
    if (input.wait !== true) {
      return normalizedResult;
    }
    const status = await waitForIdle({
      sessionID: canonicalSessionID,
      timeoutMs: normalizeWaitTimeoutMs(input.timeout),
      requireActivity: result.promptDispatched === true,
      baselineMessageID: baselineAssistantMessageId,
      startedAt,
      signal,
    });
    const finalResult: typeof normalizedResult & { sessionStatus: typeof status; lastAssistantMessage?: TextMessage | null } = {
      ...normalizedResult,
      sessionStatus: status,
    };
    if (input.lastAssistant === true) {
      finalResult.lastAssistantMessage = (await sessionMessages(canonicalSessionID, 'assistant', 1))[0] || null;
    }
    return finalResult;
  };

  const browserAction = async (
    action: string,
    input: ControlInput,
    signal: AbortSignal | undefined,
    contextDirectory: ControlInput['directory'],
    contextSessionId: string | null | undefined,
  ) => {
    if (!browserControl) {
      throw new OpenChamberControlError('The in-app browser is not available on this server', 503);
    }
    const parameters: BrowserControlParameters = {};
    const tabId = asNonEmptyString(input.tabId);
    if (tabId) {
      if (tabId.length > 128) throw new OpenChamberControlError('tabId must be an id from browser.snapshot tabs', 400);
      parameters.tabId = tabId;
    }

    const viewportSchema = z.enum(['mobile', 'tablet', 'desktop', 'fill']);
    const readViewport = (required: boolean): void => {
      const viewport = asNonEmptyString(input.viewport);
      if (!viewport) {
        if (required) throw new OpenChamberControlError('viewport is required for browser.resize', 400);
        return;
      }
      const parsed = viewportSchema.safeParse(viewport);
      if (!parsed.success) {
        throw new OpenChamberControlError('viewport must be mobile, tablet, desktop, or fill', 400);
      }
      parameters.viewport = parsed.data;
    };

    if (action === 'browser.resize') readViewport(true);

    if (action === 'browser.capture') {
      const label = asNonEmptyString(input.label);
      if (label) parameters.label = label;
    }

    if (action === 'browser.open') {
      readViewport(false);
      const url = asNonEmptyString(input.url);
      if (!url) throw new OpenChamberControlError('url is required for browser.open', 400);
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        throw new OpenChamberControlError('url must be an absolute http(s) URL', 400);
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new OpenChamberControlError('url must use http or https', 400);
      }
      parameters.url = parsed.toString();
    }

    if (action === 'browser.click') {
      const selector = asNonEmptyString(input.selector);
      const text = asNonEmptyString(input.text);
      if (!selector && !text) {
        throw new OpenChamberControlError('browser.click requires selector or text', 400);
      }
      if (selector) parameters.selector = selector;
      if (text) parameters.text = text;
    }

    if (action === 'browser.snapshot') {
      const selector = asNonEmptyString(input.selector);
      if (selector) parameters.selector = selector;
    }

    if (action === 'browser.inspect') {
      const selector = asNonEmptyString(input.selector);
      if (!selector) throw new OpenChamberControlError('selector is required for browser.inspect', 400);
      parameters.selector = selector;
    }

    if (action === 'browser.type') {
      const selector = asNonEmptyString(input.selector);
      if (!selector) throw new OpenChamberControlError('selector is required for browser.type', 400);
      if (!isString(input.value)) {
        throw new OpenChamberControlError('value is required for browser.type', 400);
      }
      parameters.selector = selector;
      parameters.value = input.value;
      parameters.submit = input.submit === true;
    }

    if (action === 'browser.select') {
      const selector = asNonEmptyString(input.selector);
      if (!selector) throw new OpenChamberControlError('selector is required for browser.select', 400);
      const hasLabel = isString(input.label);
      const hasValue = isString(input.value);
      if (hasLabel === hasValue) {
        throw new OpenChamberControlError('browser.select requires exactly one of label or value', 400);
      }
      parameters.selector = selector;
      if (hasLabel && isString(input.label)) parameters.label = input.label;
      else if (isString(input.value)) parameters.value = input.value;
    }

    if (action === 'browser.scroll') {
      const selector = asNonEmptyString(input.selector);
      const direction = asNonEmptyString(input.direction);
      if (!selector && !direction) {
        throw new OpenChamberControlError('browser.scroll requires direction or selector', 400);
      }
      if (direction) {
        const parsedDirection = z.enum(['up', 'down', 'top', 'bottom']).safeParse(direction);
        if (!parsedDirection.success) {
          throw new OpenChamberControlError('direction must be up, down, top, or bottom', 400);
        }
        parameters.direction = parsedDirection.data;
      }
      if (selector) parameters.selector = selector;
    }

    if (action === 'browser.upload') {
      const selector = asNonEmptyString(input.selector);
      if (!selector) throw new OpenChamberControlError('selector is required for browser.upload', 400);
      if (!browserUploads) throw new OpenChamberControlError('Uploads are not available on this server', 503);
      const directory = asNonEmptyString(contextDirectory);
      let files;
      try {
        const uploadInput: Parameters<typeof resolveUploadFiles>[0] = { paths: input.paths, directory };
        if (directory) uploadInput.tempDirectory = directory;
        files = await resolveUploadFiles(uploadInput);
      } catch (error) {
        if (error instanceof UploadRefusedError) throw new OpenChamberControlError(error.message, 400);
        throw error;
      }
      parameters.selector = selector;
      parameters.upload = browserUploads.put(files);
    }

    const timeoutMs = action === 'browser.open' || action === 'browser.upload' ? 45_000 : 20_000;
    const context = {
      directory: asNonEmptyString(contextDirectory),
      sessionId: asNonEmptyString(contextSessionId),
    };
    const result = await browserControl.request(action, parameters, { signal, timeoutMs, context });

    if (action === 'browser.capture') {
      const directory = asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory);
      if (!directory) {
        throw new OpenChamberControlError('directory is required to save a screenshot', 400);
      }
      const parsedCapture = browserCaptureSchema.safeParse(result);
      const capture = parsedCapture.success ? parsedCapture.data : {};
      const saved = await writeScreenshot({
        directory,
        base64: capture.base64 ?? '',
        mime: capture.mime,
        label: isString(input.label) ? input.label : undefined,
      });
      return {
        path: saved.path,
        hint: `Write ![](${saved.path}) in your reply to show this image to the user; it is rendered under your message.`,
        url: capture.url ?? null,
        title: capture.title ?? null,
        viewport: capture.viewport ?? null,
        width: capture.width ?? null,
        height: capture.height ?? null,
      };
    }
    if (result === undefined) return undefined;
    const parsedResult = z.json().safeParse(result);
    return parsedResult.success ? parsedResult.data : z.json().parse(JSON.parse(JSON.stringify(result)));
  };

  function execute(action: 'session.create' | 'session.send', input?: ControlInput, contextDirectory?: ControlInput['directory'], options?: ControlOptions): Promise<SessionActionResult>;
  function execute<Action extends SessionReadAction>(action: Action, input?: ControlInput, contextDirectory?: ControlInput['directory'], options?: ControlOptions): Promise<SessionReadResults[Action]>;
  function execute(action: string, input?: ControlInput, contextDirectory?: ControlInput['directory'], options?: ControlOptions): Promise<JsonValue | object | undefined>;
  async function execute(
    action: string,
    input: ControlInput = {},
    contextDirectory?: ControlInput['directory'],
    options: ControlOptions = {},
  ): Promise<JsonValue | object | undefined> {
    try {
      if (action === 'secret.request') return await secretRequests.request();
      if (OPENCHAMBER_SECRET_ACTIONS.includes(action)) {
        throw new OpenChamberControlError('Secret execution requires the authenticated openchamber_secret worker tool and command approval', 403);
      }
      if (!CONTROL_ACTIONS.has(action)) {
        throw new OpenChamberControlError(`Unsupported OhPiChamber action: ${action || 'missing'}`, 400);
      }
      if (OPENCHAMBER_KNOWLEDGE_ACTIONS.includes(action)) {
        return await knowledgeActions.execute(action, input, contextDirectory, options.contextSessionId);
      }
      if (action === 'terminal.list' || action === 'terminal.read') {
        const scope = await resolveReadScope(input, contextDirectory, options.contextSessionId, options.contextSessionId ?? undefined);
        const result = await readTerminal(action, { ...input, directory: scope.cwd }, scope.cwd);
        const present = <Terminal extends { cwd?: string; text?: string }>({ cwd: _cwd, ...terminal }: Terminal) => {
          const presented = { ...terminal, directory: scope.displayPath ?? '.' };
          if (isString(terminal.text)) {
            presented.text = redactGitText(terminal.text, {
              secrets: [scope.cwd, scope.agentDirectory],
              maxChars: terminal.text.length,
            });
          }
          return presented;
        };
        return 'terminals' in result ? { terminals: result.terminals.map(present) } : present(result);
      }
      if (action.startsWith('browser.')) {
        return browserAction(action, input, options.signal, contextDirectory, options.contextSessionId);
      }
      if (action === 'notify.send') {
        if (!notifyUser) {
          throw new OpenChamberControlError('Notifications are not available on this server', 503);
        }
        const result = await notifyUser({
          title: input.title,
          body: input.body,
          showWhenFocused: input.showWhenFocused,
          sessionId: asNonEmptyString(options.contextSessionId) || undefined,
          directory: asNonEmptyString(contextDirectory) || undefined,
        });
        if (result.status !== 200) {
          throw new OpenChamberControlError(result.body.error ?? 'Notification failed', result.status);
        }
        return result.body;
      }
      if (action.startsWith('workflow.')) {
        if (!workflowRuntime) throw new OpenChamberControlError('Workflows are not available on this server', 503);
        return await workflowRuntime.executeAction(action, input, {
          sessionId: asNonEmptyString(options.contextSessionId),
          directory: asNonEmptyString(contextDirectory),
        });
      }
      if (action === 'usage.read') {
        if (!loadQuota) throw new OpenChamberControlError('Usage is not available on this server', 503);
        const scope = await resolveWorkspaceFor(input, options.contextSessionId ?? '', asNonEmptyString(contextDirectory) ?? '');
        return createUsageReadAction({
          readSettings: async () => (await readSettingsFromDiskMigrated()) ?? null,
          loadQuota: () => loadQuota(scope),
        })(input, { signal: options.signal });
      }
      if (action === 'session.track' || action === 'session.markDone') {
        return setWorkState(input, contextDirectory, options.contextSessionId, action === 'session.track' ? 'open' : 'done');
      }
      if (action === 'render.page') {
        return await renderPage(input, {
          sessionId: asNonEmptyString(options.contextSessionId),
          callId: asNonEmptyString(options.contextCallId),
          directory: asNonEmptyString(contextDirectory),
          signal: options.signal,
        });
      }
      if (action === 'file.open') {
        if (!fileOpen) {
          throw new OpenChamberControlError('The file viewer is not available on this server', 503);
        }
        return fileOpen.request({
          path: asNonEmptyString(input.path),
          directory: asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory),
          sessionId: asNonEmptyString(options.contextSessionId),
        });
      }
      if (action === 'projects.list') return projects();
      if (action === 'models.list') return models(input, options.contextSessionId, contextDirectory);
      if (action === 'models.search') return searchModels(input, options.contextSessionId, contextDirectory);
      if (action.startsWith('schedule.')) {
        const settings = await readSettingsFromDiskMigrated().catch(() => null);
        if (settings?.agentScheduleToolEnabled === false) {
          throw new OpenChamberControlError('The scheduled tasks tool is turned off in OpenChamber settings', 403);
        }
        if (action === 'schedule.status') return scheduledTaskService.status();
        const taskID = asNonEmptyString(input.taskId);
        if (SCHEDULE_TASK_ID_ACTIONS.has(action) && !taskID) {
          throw new OpenChamberControlError('taskId is required', 400);
        }
        assertSingleScope(input);
        const scope = await resolveWorkspaceFor(input, options.contextSessionId ?? '', asNonEmptyString(contextDirectory) ?? '');
        const hostProjectID = asNonEmptyString(scope.hostProjectId);
        if (!hostProjectID) throw new OpenChamberControlError('Workspace scope is missing hostProjectId', 500);
        const projectID = await scheduledTaskService.resolveProjectID({ projectId: hostProjectID });
        switch (action) {
          case 'schedule.list':
            return { scheduler: await scheduledTaskService.status(), tasks: await scheduledTaskService.list(projectID) };
          case 'schedule.create': {
            const result = await scheduledTaskService.upsert(projectID, buildScheduledTask(input));
            return { task: result.task, created: result.created };
          }
          case 'schedule.update': {
            if (!taskID) throw new OpenChamberControlError('taskId is required', 400);
            const existing = (await scheduledTaskService.list(projectID)).find((task) => task.id === taskID);
            if (!existing) throw new OpenChamberControlError(`Scheduled task not found: ${taskID}`, 404);
            const result = await scheduledTaskService.upsert(projectID, patchScheduledTask(existing, input));
            return { task: result.task, updated: true };
          }
          case 'schedule.run':
            if (!taskID) throw new OpenChamberControlError('taskId is required', 400);
            return scheduledTaskService.run(projectID, taskID);
          case 'schedule.delete':
            if (!taskID) throw new OpenChamberControlError('taskId is required', 400);
            return { deleted: true, tasks: await scheduledTaskService.remove(projectID, taskID) };
          case 'schedule.toggle': {
            if (!taskID) throw new OpenChamberControlError('taskId is required', 400);
            if (!isBoolean(input.disabled)) {
              throw new OpenChamberControlError('disabled is required for schedule.toggle', 400);
            }
            const task = await scheduledTaskService.setEnabled(projectID, taskID, input.disabled === false);
            return { task, enabled: task?.enabled === true };
          }
        }
      }
      if (action === 'session.create' || action === 'session.send' || action === 'session.fork') {
        return executeSessionAction(action, input, contextDirectory, options.signal, options.contextSessionId);
      }
      if (action === 'session.moveToWorktree') {
        assertSingleScope(input);
        if (!sessionService?.moveToWorktree) {
          throw new OpenChamberControlError('Moving a session into a worktree is unavailable on this server', 501);
        }
        const sessionID = asNonEmptyString(input.sessionId) || asNonEmptyString(options.contextSessionId);
        if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
        const parsedWorktree = worktreeInputSchema.safeParse(input.worktree);
        const worktree = parsedWorktree.success ? parsedWorktree.data : {};
        const worktreePayload: Parameters<NonNullable<ControlSessionService['moveToWorktree']>>[1]['worktree'] = {};
        const name = asNonEmptyString(worktree.name);
        const branchName = asNonEmptyString(worktree.branchName);
        const startRef = asNonEmptyString(worktree.startRef);
        const existingBranch = asNonEmptyString(worktree.existingBranch);
        if (name) worktreePayload.name = name;
        if (branchName) worktreePayload.branchName = branchName;
        if (startRef) worktreePayload.startRef = startRef;
        if (existingBranch) worktreePayload.existingBranch = existingBranch;
        const carry = Array.isArray(input.carry) ? input.carry : [];
        return sessionService.moveToWorktree(
          sessionID,
          { worktree: worktreePayload, carry },
          { contextSessionId: options.contextSessionId },
        );
      }
      if (action === 'wait.list' || action === 'wait.start' || action === 'wait.stop') {
        if (!extensionWaits) throw new OpenChamberControlError('Waits are not available on this server', 503);
        const sessionID = options.contextSessionId;
        if (action === 'wait.list') return extensionWaits.listWaits(sessionID);
        if (action === 'wait.stop') return extensionWaits.stopWaits(sessionID, input.waitId);
        return extensionWaits.startWait({ sessionID, directory: asNonEmptyString(contextDirectory), source: input.source, args: input.args });
      }
      if (action === 'pr.watch' || action === 'pr.unwatch') {
        if (!prWatch) throw new OpenChamberControlError('Pull request watches are not available on this server', 503);
        const explicitSessionID = asNonEmptyString(input.sessionId);
        const sessionID = explicitSessionID || asNonEmptyString(options.contextSessionId);
        if (action === 'pr.unwatch') return prWatch.unwatch(sessionID);
        const directory = asNonEmptyString(input.directory)
          || (explicitSessionID ? await resolveSessionDirectory(explicitSessionID) : null)
          || asNonEmptyString(contextDirectory);
        return prWatch.watch({ sessionID, directory, url: z.json().optional().catch(undefined).parse(input.url) });
      }
      if (action === 'session.link') {
        if (!sessionLinks) throw new OpenChamberControlError('Linking is not available on this server', 503);
        assertSingleScope(input);
        const explicitSessionID = asNonEmptyString(input.sessionId);
        const sessionID = explicitSessionID || asNonEmptyString(options.contextSessionId);
        const directory = asNonEmptyString(input.directory)
          || (explicitSessionID ? await resolveSessionDirectory(explicitSessionID) : null)
          || asNonEmptyString(contextDirectory);
        const link = input.link ?? { url: input.url, title: input.title, kind: input.kind, identifier: input.identifier };
        return sessionLinks.link({ sessionId: sessionID, directory, link });
      }
      if (action.startsWith('session.')) {
        const sessionID = asNonEmptyString(input.sessionId);
        if (action !== 'session.list' && !sessionID) throw new OpenChamberControlError('sessionId is required', 400);
        if (action === 'session.list') {
          const limit = positiveInteger(input.limit, 10, 'limit');
          const scope = await resolveWorkspaceFor(input, options.contextSessionId ?? '', asNonEmptyString(contextDirectory) ?? '');
          const listing = await sessionService.list(scope.workspaceId);
          const rawSessions = Array.isArray(listing?.items) ? listing.items : [];
          let sessions = await Promise.all(rawSessions.map(async (session) => {
            const archived = await archivedAt(session?.sessionId || session?.id);
            return archived ? { ...session, archivedAt: archived } : { ...session, archivedAt: undefined };
          }));
          if (input.all !== true) sessions = sessions.filter((session) => !session.archivedAt);
          const sliced = sessions.slice(0, limit);
          if (input.withStatus === true) {
            return {
              sessions: sliced.map((session) => ({ ...session, status: asPublicStatus(session.runtimeStatus) })),
              limit,
              archived: input.all === true ? 'included' : 'excluded',
            };
          }
          return { sessions: sliced, limit, archived: input.all === true ? 'included' : 'excluded' };
        }
        if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
        const scope = await resolveReadScope(input, contextDirectory, options.contextSessionId, sessionID);
        if (!scope?.cwd) throw new OpenChamberControlError('Session scope is missing cwd', 500);
        if (action === 'session.status') {
          return { sessionId: sessionID, sessionStatus: await sessionStatus(sessionID) };
        }
        if (action === 'session.messages') {
          if (input.timeout !== undefined && input.wait !== true) throw new OpenChamberControlError('timeout requires wait', 400);
          const role = input.lastAssistant === true ? 'assistant' : (asNonEmptyString(input.role) || 'all');
          if (!['all', 'user', 'assistant'].includes(role)) throw new OpenChamberControlError('role must be all, user, or assistant', 400);
          const last = input.last === true || input.lastAssistant === true;
          if (input.all === true && (last || input.limit !== undefined)) throw new OpenChamberControlError('all cannot be combined with last or limit', 400);
          if (last && input.limit !== undefined) throw new OpenChamberControlError('last cannot be combined with limit', 400);
          const currentStatus = input.wait === true
            ? await waitForIdle({ sessionID, timeoutMs: normalizeWaitTimeoutMs(input.timeout), requireActivity: false, startedAt: now(), baselineMessageID: undefined, signal: options.signal })
            : await sessionStatus(sessionID);
          const limit = input.all === true ? undefined : (last ? 1 : positiveInteger(input.limit, 10, 'limit'));
          return { sessionId: sessionID, role, sessionStatus: currentStatus, messages: await sessionMessages(sessionID, role, limit) };
        }
      }
      throw new OpenChamberControlError(`Unsupported OhPiChamber action: ${action || 'missing'}`, 400);
    } catch (error) {
      throw asControlError(error, `Failed to execute ${action || 'OhPiChamber action'}`);
    }
  }

  const featurePolicy = async (toolName: string, action: string) => {
    const actions = TOOL_ACTIONS.get(toolName);
    if (!actions || !actions.has(action)) {
      return { code: 'INVALID_REQUEST' as const, status: 400, detail: `Unsupported ${toolName} action: ${action}` };
    }
    return null;
  };

  const invokeHostAction = async (
    rawScope: HostAuthorizationScope | JsonValue,
    rawRequest: HostActionRequest | JsonValue,
    signal?: AbortSignal,
  ): Promise<HostActionResult> => {
    const fail = (
      code: ProblemCode,
      status: number,
      detail?: string,
    ): HostActionResult => {
      if (detail) return { ok: false, code, status, detail: String(detail) };
      return { ok: false, code, status };
    };
    const parsedScope = hostScopeSchema.safeParse(rawScope);
    if (!parsedScope.success) {
      return fail('INVALID_REQUEST', 400, 'Invalid session scope');
    }
    const scope = parsedScope.data;
    const parsedRequest = hostRequestSchema.safeParse(rawRequest);
    if (!parsedRequest.success || parsedRequest.data.sessionId !== scope.rootSessionId) {
      return fail('INVALID_REQUEST', 400, 'Invalid host action request');
    }
    const request = parsedRequest.data;
    const policy = await featurePolicy(request.toolName, request.action);
    if (policy) return fail(policy.code, policy.status, policy.detail);
    if (!resolveSessionScope) return fail('INTERNAL_ERROR', 503, 'Session scope resolver unavailable');
    try {
      const resolved = await resolveSessionScope(request.sessionId);
      if (!resolved || resolved.rootSessionId !== scope.rootSessionId || resolved.projectId !== scope.projectId
        || resolved.workspaceId !== scope.workspaceId || resolved.cwd !== scope.cwd
        || resolved.agentDirectory !== scope.agentDirectory
        || (scope.agentDirectoryId !== undefined && resolved.agentDirectoryId !== scope.agentDirectoryId)) {
        return fail('UNAUTHORIZED', 403, 'Session is outside the authorized scope');
      }
      const input: ControlInput = request.input ?? {};
      let value: JsonValue | object | undefined;
      if (request.toolName === 'openchamber_secret') {
        if (request.action === 'secret.run') {
          value = await secretRequests.run(input, {
            sessionId: request.sessionId,
            callId: request.toolCallId ?? null,
            directory: scope.cwd,
            signal,
          });
        } else if (request.action === 'secret.forget') {
          value = secretRequests.forget(request.sessionId);
        } else {
          value = await secretRequests.request();
        }
      } else {
        value = await execute(request.action, input, scope.cwd, {
          signal,
          contextSessionId: request.sessionId,
          contextCallId: request.toolCallId,
        });
      }
      const jsonValue = value === undefined ? null : z.json().parse(JSON.parse(JSON.stringify(value)));
      return { ok: true, value: jsonValue };
    } catch (error) {
      const parsedError = hostErrorSchema.safeParse(error);
      const status = parsedError.success
        ? (parsedError.data.statusCode ?? parsedError.data.status ?? 500)
        : 500;
      const parsedCode = parsedError.success && parsedError.data.code
        ? ProblemCodeSchema.safeParse(parsedError.data.code)
        : null;
      const code = (parsedCode?.success ? parsedCode.data : null)
        ?? (status === 400 || status === 404 ? 'INVALID_REQUEST'
          : status === 403 ? 'UNAUTHORIZED'
            : status === 409 ? 'METADATA_CONFLICT'
              : status === 499 || status === 503 ? 'SERVICE_UNAVAILABLE'
                : 'INTERNAL_ERROR');
      const message = parsedError.success ? parsedError.data.message : undefined;
      return fail(code, status, message);
    }
  };

  return {
    execute,
    invokeHostAction,
    resolveSessionDirectory,
    answerPage,
    answerSecret: secretRequests.answer,
    secretFields: secretRequests.fields,
  };
};

export type OpenChamberControlService = ReturnType<typeof createOpenChamberControlService>;
