<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
import fs from 'node:fs/promises';
import { ProblemCodeSchema } from '@openchamber/agent-contract';
import { asNonEmptyString, isBoolean } from '../shared/guards.js';
import { OpenChamberControlError, asControlError } from './error.js';
import {
 OPENCHAMBER_ALL_ACTIONS,
 OPENCHAMBER_AGENT_TOOL_ACTIONS,
 OPENCHAMBER_WEB_ACTIONS,
 OPENCHAMBER_KNOWLEDGE_ACTIONS,
 OPENCHAMBER_NOTIFY_ACTIONS,
 OPENCHAMBER_RENDER_ACTIONS,
 OPENCHAMBER_WORKFLOW_ACTIONS,
} from './actions.js';
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
import { asNonEmptyString, isBoolean } from '../shared/guards.js';
import path from 'node:path';
import nodeFsPromises from 'node:fs/promises';
import { OpenCode } from '@opencode/client';
import { OpenChamberControlError, asControlError } from './error.js';
import { OPENCHAMBER_ALL_ACTIONS, OPENCHAMBER_KNOWLEDGE_ACTIONS } from './actions.js';
import { writeScreenshot } from './screenshots.js';
=======
import { asNonEmptyString, isBoolean, isRecord } from '../shared/guards.js';
import path from 'node:path';
import nodeFsPromises from 'node:fs/promises';
import { OpenCode } from '@opencode/client';
import { OpenChamberControlError, asControlError, controlErrorFields } from './error.js';
import { OPENCHAMBER_ALL_ACTIONS, OPENCHAMBER_KNOWLEDGE_ACTIONS } from './actions.js';
import { writeScreenshot } from './screenshots.js';
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
import { createProjectKnowledgeActions } from './project-knowledge.js';
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
import { writeScreenshot } from './screenshots.js';
import { createPageAnswers, createRenderPageAction } from './render-page.js';
import { formatModelRef, modelRefKey, parseModelSelector, thinkingLevelToReasoningEffort } from '@openchamber/agent-contract';
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
import { createPageAnswers, createRenderPageAction } from './render-page.js';
import { completeFormAnswer } from './form-answer.js';
import { createImageGenerationAction } from './generate-image.js';
import { createSecretRequests } from './secret-request.js';
import { createUsageReadAction } from './usage-read.js';
import { createWorkNamer } from '../openchamber-sessions/work-naming.js';
import { CHATS_SCOPE_PUBLIC_ID } from '../scheduled-tasks/chats-scope.js';
import { createWorkMembership } from '../session-work/membership.js';
import { userStatePatch } from '../session-work/state.js';
=======
import { createPageAnswers, createRenderPageAction, isAgentPrompt } from './render-page.js';
import { completeFormAnswer } from './form-answer.js';
import { createImageGenerationAction } from './generate-image.js';
import { createSecretRequests } from './secret-request.js';
import { createUsageReadAction } from './usage-read.js';
import { createTerminalReadAction } from './terminal-read.js';
import { runWaitAction } from './waits.js';
import { createWorkNamer } from '../openchamber-sessions/work-naming.js';
import { CHATS_SCOPE_PUBLIC_ID } from '../scheduled-tasks/chats-scope.js';
import { createWorkMembership } from '../session-work/membership.js';
import { isListedAsChild, listedSession } from './listed-session.js';
import { isPinnedMetadata, userStatePatch } from '../session-work/state.js';
import { z } from 'zod';
import { resolveUploadFiles, UploadRefusedError } from '../browser-control/uploads.js';
import type { SessionInfo, ModelInfo, SessionListInput, PermissionReplyInput, SessionFormCancelInput, FormInfo } from '@opencode/client';
import type { ControlClient } from './opencode-client.js';
import type { FormValues } from './form-answer.js';
import type { PageAnswerInput } from './render-page.js';
import type { ControlInput, PendingPermission, PublicSessionStatus, SessionMessagesResult, SessionStatusResult, StoredSessionMetadata } from './contracts.js';
import type { ControlErrorFields } from './error.js';
import type { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';
import type { createScheduledTaskService } from '../scheduled-tasks/service.js';
import type { KnowledgeDependencies } from './project-knowledge.js';
import type { ImageGenerationDependencies } from './generate-image.js';
import type { TerminalReadDependencies } from './terminal-read.js';
import type { createUsageReadAction as usageAction } from './usage-read.js';
import type { createFileOpenRequester } from './file-open.js';
import type { createSessionLinker } from '../openchamber-sessions/session-link.js';
import type { createLaterPages } from './later-pages.js';
import type { WaitActionRequest } from './waits.js';
import type { createDispatchResultsRuntime } from '../dispatch-results/runtime.js';
import type { createBrowserControlRouter } from '../browser-control/provider.js';
import type { createUploadStore } from '../browser-control/uploads.js';
import type { ListedSession, ListedSessionRecord } from './listed-session.js';
import type { BrowserControlParameters } from '../browser-control/broker.js';
import type { createAgentMemoryActions } from '../agent-memory/actions.js';
import type { createWorkflowRuntime } from '../workflows/runtime.js';

interface ControlSettings {
  projects?: unknown;
  defaultModel?: unknown;
  defaultVariant?: unknown;
  defaultAgent?: unknown;
  favoriteModels?: unknown;
  recentModels?: unknown;
  hiddenModels?: unknown;
  sessionWorkEnabled?: unknown;
  agentImageToolEnabled?: unknown;
  agentImageModel?: unknown;
  agentUsageToolEnabled?: unknown;
  agentTerminalToolEnabled?: unknown;
}

export interface ControlOptions {
  signal?: AbortSignal | undefined;
  contextSessionId?: string;
  contextCallId?: string;
  startedByExtension?: string;
  secretRunAuthorized?: boolean;
}

export interface ControlDependencies {
  readSettingsFromDiskMigrated: () => Promise<ControlSettings | null>;
  sanitizeProjects: (projects: ControlSettings['projects']) => { id: string; path: string; label?: string }[];
  buildOpenCodeUrl: (route: string, query: string) => string | URL;
  getOpenCodeAuthHeaders: () => HeadersInit;
  waitForOpenCodeReady?: (timeout: number, interval: number) => Promise<void>;
  sessionService: ReturnType<typeof createOpenChamberSessionService>;
  scheduledTaskService: ReturnType<typeof createScheduledTaskService>;
  chatsScope?: { root: string } | null;
  chatRoots?: string[];
  updateSessionMetadata?: ((sessionId: string, update: (metadata: StoredSessionMetadata | undefined) => ReturnType<typeof userStatePatch>, options: { directory: string }) => Promise<{ changed: boolean }>) | null;
  isWorktreePinned?: (directory: string) => Promise<boolean>;
  browserControl?: ReturnType<typeof createBrowserControlRouter> | null;
  browserUploads?: ReturnType<typeof createUploadStore> | null;
  fileOpen?: ReturnType<typeof createFileOpenRequester> | null;
  notifyUser?: ((input: { title: unknown; body: unknown; showWhenFocused: unknown; sessionId: string | undefined; directory: string | undefined }) => Promise<{ status: number; body: { error?: string } }>) | null;
  agentMemoryActions?: { execute: (action: string, input: ControlInput, directory: ControlInput['directory']) => ReturnType<ReturnType<typeof createAgentMemoryActions>['execute']> } | null;
  sessionLinks?: ReturnType<typeof createSessionLinker> | null;
  workNaming?: Omit<Parameters<typeof createWorkNamer>[0], 'getSession' | 'createError'> | null;
  projectContextRuntime?: KnowledgeDependencies['projectContextRuntime'];
  resolveProjectContextId?: KnowledgeDependencies['resolveProjectContextId'];
  isKnowledgeToolEnabled?: () => Promise<boolean>;
  isRenderToolEnabled?: () => Promise<boolean>;
  isSecretToolEnabled?: () => Promise<boolean>;
  getTerminalRuntime?: TerminalReadDependencies['getTerminalRuntime'];
  secretFiles?: Parameters<typeof createSecretRequests>[0]['files'];
  onPageWaitChange?: NonNullable<Parameters<typeof createPageAnswers>[0]>['onWaitChange'];
  readPendingRequests?: () => { [sessionID: string]: { forms: object[]; pages: object[]; permissions: PendingPermission[] } };
  isPermissionAutoAnswered?: (sessionID: string | undefined, directory: PendingPermission['directory'], permissionID: PendingPermission['id']) => Promise<boolean>;
  showPlan?: KnowledgeDependencies['showPlan'];
  dispatchResults?: ReturnType<typeof createDispatchResultsRuntime> | null;
  prWatch?: WaitActionRequest['prWatch'];
  extensionWaits?: WaitActionRequest['extensionWaits'] | null;
  laterPages?: ReturnType<typeof createLaterPages> | null;
  workflowRuntime?: Pick<ReturnType<typeof createWorkflowRuntime>, 'executeAction'> | null;
  sharePages?: Parameters<typeof createRenderPageAction>[0]['sharePages'];
  archiveStore?: { entry: (sessionID: string) => Promise<number | null | undefined> } | null;
  isOpenCodeDirectoryTrusted?: ((directory: string) => Promise<boolean>) | null;
  createClient?: (options: Parameters<typeof OpenCode.make>[0]) => ControlClient;
  imageFsPromises?: ImageGenerationDependencies['fsPromises'];
  loadQuota?: Parameters<typeof usageAction>[0]['loadQuota'] | null;
  sleep?: (duration: number) => Promise<void>;
  now?: () => number;
  isHiddenSession?: (id: string | null, record?: ListedSessionRecord) => boolean;
}

const hasText = (value: unknown): value is string => Boolean(asNonEmptyString(value));
const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);
const isIntegerNumber = (value: unknown): value is number => Number.isInteger(value);
const isText = (value: unknown): value is string => typeof value === 'string';
type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };
type ControlSession = SessionInfo & { directory?: string; time: SessionInfo['time'] & { archived?: number } };
interface MessageRecord {
  id: string;
  type: string;
  text?: unknown;
  content?: { type: string; text?: unknown }[];
  model?: { providerID?: unknown; id?: unknown };
  time: { created: number; completed?: number };
}
export interface TextMessage {
  id: string;
  role: string;
  createdAt: number | null;
  completedAt: number | null;
  model: string | null;
  text: string;
}
interface TaskExecution {
  prompt: string;
  providerID?: string;
  modelID?: string;
  agent?: string;
  variant?: string;
  useDefaults?: boolean;
  goalEnabled?: boolean;
  goalTokenBudget?: number;
}
type TaskSchedule =
  | { kind: 'daily'; times: string[]; timezone?: string }
  | { kind: 'weekly'; times: string[]; weekdays: number[]; timezone?: string }
  | { kind: 'once'; date: string; time: string; timezone?: string }
  | { kind: 'cron'; cron: string | null; timezone?: string };
interface ControlTask {
  id?: string;
  loopFile?: string;
  name: string;
  enabled: boolean;
  schedule: TaskSchedule;
  execution: TaskExecution;
  targetSessionId?: unknown;
  runInWorktree?: unknown;
  cleanupWorktree?: unknown;
  baseBranch?: string | null;
}
interface SessionPayload {
  directory?: string;
  projectId?: string;
  title?: string;
  prompt?: string;
  model?: string;
  agent?: string;
  variant?: string;
  goal?: boolean;
  goalTokenBudget?: unknown;
  worktree?: { name?: string; branchName?: string; startRef?: string };
  setUpstream?: boolean;
  messageId?: string;
  pullRequest?: unknown;
  promptedBySessionId?: string;
}
export interface SessionActionResult {
  sessionId: string;
  directory: string;
  projectId?: string;
  title?: string;
  worktree?: object;
  promptDispatched: boolean;
  baselineAssistantMessageId?: string;
  baselineIdleRecordId?: string | null;
  lastAssistantMessage?: TextMessage | null;
}
interface RankPreferences { [rank: string]: string }
type PermissionReply = Mutable<PermissionReplyInput>;
type FormCancellation = Mutable<SessionFormCancelInput>;
interface SessionCreateOptions { startedByExtension?: string; operatorParentId?: string | null }
interface MoveWorktree { name: string | undefined; branchName?: string; startRef?: string; existingBranch?: string }
interface MovePayload { worktree: MoveWorktree; directory?: string; carry?: unknown }

const dialogAnswerSchema = z.object({ accept: z.boolean(), value: z.string().optional() });
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

const DEFAULT_WAIT_TIMEOUT_SECONDS = 600;
const MAX_WAIT_TIMEOUT_SECONDS = 86_400;
const WAIT_POLL_INTERVAL_MS = 500;
const CONTROL_ACTIONS = new Set(OPENCHAMBER_ALL_ACTIONS);
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
const TOOL_ACTIONS = new Map([
 ['openchamber', new Set(OPENCHAMBER_AGENT_TOOL_ACTIONS)],
 ['web', new Set(OPENCHAMBER_WEB_ACTIONS)],
 ['openchamber_knowledge', new Set(OPENCHAMBER_KNOWLEDGE_ACTIONS)],
 ['notify', new Set(OPENCHAMBER_NOTIFY_ACTIONS)],
 ['openchamber_render', new Set(OPENCHAMBER_RENDER_ACTIONS)],
 ['openchamber_workflow', new Set(OPENCHAMBER_WORKFLOW_ACTIONS)],
]);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
// models.search ranks a favorite 2 and a recent model 1.
const PREFERENCE_BY_RANK = { 2: 'favorite', 1: 'recent' };
=======
const PREFERENCE_BY_RANK: RankPreferences = { 2: 'favorite', 1: 'recent' };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
const SCHEDULE_TASK_ID_ACTIONS = new Set([
 'schedule.update',
 'schedule.run',
 'schedule.delete',
 'schedule.toggle',
]);

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
const positiveInteger = (value, fallback, field) => {
 if (value === undefined || value === null) return fallback;
 const number = Number(value);
 if (!Number.isSafeInteger(number) || number < 1) {
  throw new OpenChamberControlError(`${field} must be a positive integer`, 400);
 }
 return number;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
const positiveInteger = (value, fallback, field) => {
  if (value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new OpenChamberControlError(`${field} must be a positive integer`, 400);
  }
  return number;
=======
const positiveInteger = <Fallback extends number | null>(value: ControlInput['limit'], fallback: Fallback, field: string) => {
  if (value === undefined || value === null) return fallback;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new OpenChamberControlError(`${field} must be a positive integer`, 400);
  }
  return number;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
const normalizeWaitTimeoutMs = (value) => {
 const seconds = value === undefined || value === null ? DEFAULT_WAIT_TIMEOUT_SECONDS : Number(value);
 if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_WAIT_TIMEOUT_SECONDS) {
  throw new OpenChamberControlError(`timeout must be from 1 to ${MAX_WAIT_TIMEOUT_SECONDS} seconds`, 400);
 }
 return seconds * 1000;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
const normalizeWaitTimeoutMs = (value) => {
  const seconds = value === undefined || value === null ? DEFAULT_WAIT_TIMEOUT_SECONDS : Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_WAIT_TIMEOUT_SECONDS) {
    throw new OpenChamberControlError(`timeout must be from 1 to ${MAX_WAIT_TIMEOUT_SECONDS} seconds`, 400);
  }
  return seconds * 1000;
=======
const normalizeWaitTimeoutMs = (value: ControlInput['timeout']) => {
  const seconds = value === undefined || value === null ? DEFAULT_WAIT_TIMEOUT_SECONDS : Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_WAIT_TIMEOUT_SECONDS) {
    throw new OpenChamberControlError(`timeout must be from 1 to ${MAX_WAIT_TIMEOUT_SECONDS} seconds`, 400);
  }
  return seconds * 1000;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
// v2 messages are not { info, parts }: the record itself is the message, a
// user message carries `text`, and an assistant message carries `content[]`
// whose text items are the visible answer.
const messageText = (record) => {
 if (record.type === 'user') return typeof record.text === 'string' ? record.text.trim() : '';
 return (Array.isArray(record.content) ? record.content : [])
  .filter((item) => item?.type === 'text' && typeof item.text === 'string')
  .map((item) => item.text)
  .join('')
  .trim();
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
// v2 messages are not { info, parts }: the record itself is the message, a
// user message carries `text`, and an assistant message carries `content[]`
// whose text items are the visible answer.
const messageText = (record) => {
  if (record.type === 'user') return typeof record.text === 'string' ? record.text.trim() : '';
  return (Array.isArray(record.content) ? record.content : [])
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('')
    .trim();
=======
const messageText = (record: MessageRecord) => {
  if (record.type === 'user') return isText(record.text) ? record.text.trim() : '';
  return (Array.isArray(record.content) ? record.content : [])
    .filter((item) => item?.type === 'text' && isText(item.text))
    .map((item) => item.text)
    .join('')
    .trim();
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
const extractTextMessages = (messages, role = 'all') => {
 const result = [];
 for (const record of Array.isArray(messages) ? messages : []) {
  const messageRole = record?.type;
  if ((messageRole !== 'user' && messageRole !== 'assistant') || (role !== 'all' && role !== messageRole)) continue;
  const text = messageText(record);
  if (!text) continue;
  const providerID = asNonEmptyString(record.model?.providerID);
  const modelID = asNonEmptyString(record.model?.id);
  result.push({
   id: asNonEmptyString(record.id) || '',
   role: messageRole,
   createdAt: Number.isFinite(record?.time?.created) ? record.time.created : null,
   completedAt: Number.isFinite(record?.time?.completed) ? record.time.completed : null,
   model: modelRefKey(providerID, modelID) || null,
   text,
  });
 }
 return result.sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
const extractTextMessages = (messages, role = 'all') => {
  const result = [];
  for (const record of Array.isArray(messages) ? messages : []) {
    const messageRole = record?.type;
    if ((messageRole !== 'user' && messageRole !== 'assistant') || (role !== 'all' && role !== messageRole)) continue;
    const text = messageText(record);
    if (!text) continue;
    const providerID = asNonEmptyString(record.model?.providerID);
    const modelID = asNonEmptyString(record.model?.id);
    result.push({
      id: asNonEmptyString(record.id) || '',
      role: messageRole,
      createdAt: Number.isFinite(record?.time?.created) ? record.time.created : null,
      completedAt: Number.isFinite(record?.time?.completed) ? record.time.completed : null,
      model: providerID && modelID ? `${providerID}/${modelID}` : null,
      text,
    });
  }
  return result.sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));
=======
const extractTextMessages = (messages: MessageRecord[], role = 'all') => {
  const result: TextMessage[] = [];
  for (const record of Array.isArray(messages) ? messages : []) {
    const messageRole = record?.type;
    if ((messageRole !== 'user' && messageRole !== 'assistant') || (role !== 'all' && role !== messageRole)) continue;
    const text = messageText(record);
    if (!text) continue;
    const providerID = asNonEmptyString(record.model?.providerID);
    const modelID = asNonEmptyString(record.model?.id);
    result.push({
      id: asNonEmptyString(record.id) || '',
      role: messageRole,
      createdAt: isFiniteNumber(record?.time?.created) ? record.time.created : null,
      completedAt: isFiniteNumber(record?.time?.completed) ? record.time.completed : null,
      model: providerID && modelID ? `${providerID}/${modelID}` : null,
      text,
    });
  }
  return result.sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
const parseModel = (value) => {
 const model = asNonEmptyString(value);
 if (!model) throw new OpenChamberControlError('model is required', 400);
 const parsed = parseModelSelector(model);
 if (!parsed) throw new OpenChamberControlError('model must be in provider/model format', 400);
 return { providerID: parsed.providerId, modelID: parsed.modelId, thinkingLevel: parsed.thinkingLevel };
};
const sessionOptions = (input) => {
 const model = input.model === undefined ? null : parseModel(input.model);
 return {
  providerId: model?.providerID ?? null,
  modelId: model?.modelID ?? null,
  agentId: asNonEmptyString(input.agent) || null,
  variant: asNonEmptyString(input.variant) || null,
  // A `provider/model:high` selection is a reasoning request, not just a model.
  reasoningEffort: thinkingLevelToReasoningEffort(model?.thinkingLevel),
 };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
const parseModel = (value) => {
  const model = asNonEmptyString(value);
  if (!model) throw new OpenChamberControlError('model is required', 400);
  const slashIndex = model.indexOf('/');
  if (slashIndex <= 0 || slashIndex === model.length - 1) {
    throw new OpenChamberControlError('model must be in provider/model format', 400);
  }
  return { providerID: model.slice(0, slashIndex), modelID: model.slice(slashIndex + 1) };
=======
const parseModel = (value: ControlInput['model']) => {
  const model = asNonEmptyString(value);
  if (!model) throw new OpenChamberControlError('model is required', 400);
  const slashIndex = model.indexOf('/');
  if (slashIndex <= 0 || slashIndex === model.length - 1) {
    throw new OpenChamberControlError('model must be in provider/model format', 400);
  }
  return { providerID: model.slice(0, slashIndex), modelID: model.slice(slashIndex + 1) };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
const sessionPromptRequest = (input) => ({
 input: {
  text: typeof input.prompt === 'string' ? input.prompt.trim() : '',
  attachments: [],
  context: [],
 },
 options: sessionOptions(input),
});

const parseWeekdays = (value) => {
 const raw = asNonEmptyString(value);
 if (!raw) throw new OpenChamberControlError('weekly is required', 400);
 const weekdays = raw.split(',').map((entry) => Number.parseInt(entry.trim(), 10));
 if (weekdays.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 6)) {
  throw new OpenChamberControlError('weekly must contain weekdays from 0 to 6', 400);
 }
 return Array.from(new Set(weekdays)).sort((a, b) => a - b);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
const parseWeekdays = (value) => {
  const raw = asNonEmptyString(value);
  if (!raw) throw new OpenChamberControlError('weekly is required', 400);
  const weekdays = raw.split(',').map((entry) => Number.parseInt(entry.trim(), 10));
  if (weekdays.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 6)) {
    throw new OpenChamberControlError('weekly must contain weekdays from 0 to 6', 400);
  }
  return Array.from(new Set(weekdays)).sort((a, b) => a - b);
=======
const parseWeekdays = (value: ControlInput['weekly']) => {
  const raw = asNonEmptyString(value);
  if (!raw) throw new OpenChamberControlError('weekly is required', 400);
  const weekdays = raw.split(',').map((entry) => Number.parseInt(entry.trim(), 10));
  if (weekdays.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 6)) {
    throw new OpenChamberControlError('weekly must contain weekdays from 0 to 6', 400);
  }
  return Array.from(new Set(weekdays)).sort((a, b) => a - b);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
const buildSchedule = (input) => {
 const daily = asNonEmptyString(input.daily);
 const weekly = asNonEmptyString(input.weekly);
 const once = asNonEmptyString(input.once);
 const cron = asNonEmptyString(input.cron);
 const selectors = [daily, weekly, once, cron].filter(Boolean);
 if (selectors.length !== 1) {
  throw new OpenChamberControlError('Provide exactly one of daily, weekly, once, or cron', 400);
 }
 const timezone = asNonEmptyString(input.timezone);
 if (daily) return { kind: 'daily', times: [daily], ...(timezone ? { timezone } : {}) };
 if (weekly) {
  const time = asNonEmptyString(input.time);
  if (!time) throw new OpenChamberControlError('time is required with weekly', 400);
  return { kind: 'weekly', weekdays: parseWeekdays(weekly), times: [time], ...(timezone ? { timezone } : {}) };
 }
 if (once) {
  const time = asNonEmptyString(input.time);
  if (!time) throw new OpenChamberControlError('time is required with once', 400);
  return { kind: 'once', date: once, time, ...(timezone ? { timezone } : {}) };
 }
 return { kind: 'cron', cron, ...(timezone ? { timezone } : {}) };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
const buildSchedule = (input) => {
  const daily = asNonEmptyString(input.daily);
  const weekly = asNonEmptyString(input.weekly);
  const once = asNonEmptyString(input.once);
  const cron = asNonEmptyString(input.cron);
  const selectors = [daily, weekly, once, cron].filter(Boolean);
  if (selectors.length !== 1) {
    throw new OpenChamberControlError('Provide exactly one of daily, weekly, once, or cron', 400);
  }
  const timezone = asNonEmptyString(input.timezone);
  if (daily) return { kind: 'daily', times: [daily], ...(timezone ? { timezone } : {}) };
  if (weekly) {
    const time = asNonEmptyString(input.time);
    if (!time) throw new OpenChamberControlError('time is required with weekly', 400);
    return { kind: 'weekly', weekdays: parseWeekdays(weekly), times: [time], ...(timezone ? { timezone } : {}) };
  }
  if (once) {
    const time = asNonEmptyString(input.time);
    if (!time) throw new OpenChamberControlError('time is required with once', 400);
    return { kind: 'once', date: once, time, ...(timezone ? { timezone } : {}) };
  }
  return { kind: 'cron', cron, ...(timezone ? { timezone } : {}) };
};

/**
 * Isolation fields (git only), checked before a task is written. The control
 * route forwards raw JSON without the agent adapter's normalization, so a wrong
 * type must fail here: read as false it turns isolation off, and read as empty
 * it erases a stored branch. Empty and null stay the way to clear a branch.
 * An existing session's own directory wins, so naming any of these on a task
 * that runs there is refused instead of being stored and ignored.
 */
const assertWorktreeIsolation = (input, targetSessionId) => {
  for (const field of ['runInWorktree', 'cleanupWorktree']) {
    if (input[field] !== undefined && !isBoolean(input[field])) {
      throw new OpenChamberControlError(`${field} must be a boolean`, 400);
    }
  }
  const { baseBranch } = input;
  if (baseBranch !== undefined && baseBranch !== null && baseBranch !== '' && !asNonEmptyString(baseBranch)) {
    throw new OpenChamberControlError('baseBranch must be a branch name, or empty to clear it', 400);
  }
  const isolationNamed = ['runInWorktree', 'baseBranch', 'cleanupWorktree'].some((field) => input[field] !== undefined);
  if (isolationNamed && asNonEmptyString(targetSessionId)) {
    throw new OpenChamberControlError('runInWorktree, baseBranch and cleanupWorktree are not compatible with an existing session', 400);
  }
=======
const buildSchedule = (input: ControlInput): TaskSchedule => {
  const daily = asNonEmptyString(input.daily);
  const weekly = asNonEmptyString(input.weekly);
  const once = asNonEmptyString(input.once);
  const cron = asNonEmptyString(input.cron);
  const selectors = [daily, weekly, once, cron].filter(Boolean);
  if (selectors.length !== 1) {
    throw new OpenChamberControlError('Provide exactly one of daily, weekly, once, or cron', 400);
  }
  const timezone = asNonEmptyString(input.timezone);
  if (daily) {
    const schedule: TaskSchedule = { kind: 'daily', times: [daily] };
    if (timezone) schedule.timezone = timezone;
    return schedule;
  }
  if (weekly) {
    const time = asNonEmptyString(input.time);
    if (!time) throw new OpenChamberControlError('time is required with weekly', 400);
    const schedule: TaskSchedule = { kind: 'weekly', weekdays: parseWeekdays(weekly), times: [time] };
    if (timezone) schedule.timezone = timezone;
    return schedule;
  }
  if (once) {
    const time = asNonEmptyString(input.time);
    if (!time) throw new OpenChamberControlError('time is required with once', 400);
    const schedule: TaskSchedule = { kind: 'once', date: once, time };
    if (timezone) schedule.timezone = timezone;
    return schedule;
  }
  const schedule: TaskSchedule = { kind: 'cron', cron };
  if (timezone) schedule.timezone = timezone;
  return schedule;
};

const assertWorktreeIsolation = (input: ControlInput, targetSessionId: ControlInput['targetSessionId']) => {
  for (const field of ['runInWorktree', 'cleanupWorktree'] as const) {
    if (input[field] !== undefined && !isBoolean(input[field])) {
      throw new OpenChamberControlError(`${field} must be a boolean`, 400);
    }
  }
  const { baseBranch } = input;
  if (baseBranch !== undefined && baseBranch !== null && baseBranch !== '' && !asNonEmptyString(baseBranch)) {
    throw new OpenChamberControlError('baseBranch must be a branch name, or empty to clear it', 400);
  }
  const isolationNamed = (['runInWorktree', 'baseBranch', 'cleanupWorktree'] as const).some((field) => input[field] !== undefined);
  if (isolationNamed && asNonEmptyString(targetSessionId)) {
    throw new OpenChamberControlError('runInWorktree, baseBranch and cleanupWorktree are not compatible with an existing session', 400);
  }
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
const buildScheduledTask = (input) => {
 const name = asNonEmptyString(input.name);
 const prompt = asNonEmptyString(input.prompt);
 if (!name) throw new OpenChamberControlError('name is required', 400);
 if (!prompt) throw new OpenChamberControlError('prompt is required', 400);
 const targetSessionId = asNonEmptyString(input.targetSessionId);
 const model = targetSessionId && input.model === undefined ? { useDefaults: !asNonEmptyString(input.agent) } : parseModel(input.model);
 const goalTokenBudget = input.goalTokenBudget;
 if (goalTokenBudget !== undefined && input.goal !== true) {
  throw new OpenChamberControlError('goalTokenBudget requires goal', 400);
 }
 if (goalTokenBudget !== undefined && (!Number.isSafeInteger(goalTokenBudget) || goalTokenBudget < 1000 || goalTokenBudget > 100_000_000)) {
  throw new OpenChamberControlError('goalTokenBudget must be from 1000 to 100000000', 400);
 }
 const task = {
  name,
  enabled: input.disabled !== true,
  schedule: buildSchedule(input),
  execution: {
   prompt,
   ...model,
   ...(asNonEmptyString(input.agent) ? { agent: input.agent.trim() } : {}),
   ...(asNonEmptyString(input.variant) ? { variant: input.variant.trim() } : {}),
   ...(input.goal === true ? { goalEnabled: true } : {}),
   ...(goalTokenBudget !== undefined ? { goalTokenBudget } : {}),
  },
 };
 if (input.targetSessionId !== undefined) task.targetSessionId = targetSessionId ?? input.targetSessionId;
 return task;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
const buildScheduledTask = (input) => {
  const name = asNonEmptyString(input.name);
  const prompt = asNonEmptyString(input.prompt);
  if (!name) throw new OpenChamberControlError('name is required', 400);
  if (!prompt) throw new OpenChamberControlError('prompt is required', 400);
  const targetSessionId = asNonEmptyString(input.targetSessionId);
  const model = targetSessionId && input.model === undefined ? { useDefaults: !asNonEmptyString(input.agent) } : parseModel(input.model);
  const goalTokenBudget = input.goalTokenBudget;
  if (goalTokenBudget !== undefined && input.goal !== true) {
    throw new OpenChamberControlError('goalTokenBudget requires goal', 400);
  }
  if (goalTokenBudget !== undefined && (!Number.isSafeInteger(goalTokenBudget) || goalTokenBudget < 1000 || goalTokenBudget > 100_000_000)) {
    throw new OpenChamberControlError('goalTokenBudget must be from 1000 to 100000000', 400);
  }
  assertWorktreeIsolation(input, targetSessionId);
  const baseBranch = asNonEmptyString(input.baseBranch);
  const task = {
    name,
    enabled: input.disabled !== true,
    schedule: buildSchedule(input),
    execution: {
      prompt,
      ...model,
      ...(asNonEmptyString(input.agent) ? { agent: input.agent.trim() } : {}),
      ...(asNonEmptyString(input.variant) ? { variant: input.variant.trim() } : {}),
      ...(input.goal === true ? { goalEnabled: true } : {}),
      ...(goalTokenBudget !== undefined ? { goalTokenBudget } : {}),
    },
  };
  if (input.targetSessionId !== undefined) task.targetSessionId = targetSessionId ?? input.targetSessionId;
  if (input.runInWorktree === true) task.runInWorktree = true;
  if (input.cleanupWorktree === false) task.cleanupWorktree = false;
  if (baseBranch) task.baseBranch = baseBranch;
  return task;
=======
const buildScheduledTask = (input: ControlInput) => {
  const name = asNonEmptyString(input.name);
  const prompt = asNonEmptyString(input.prompt);
  if (!name) throw new OpenChamberControlError('name is required', 400);
  if (!prompt) throw new OpenChamberControlError('prompt is required', 400);
  const targetSessionId = asNonEmptyString(input.targetSessionId);
  const model = targetSessionId && input.model === undefined ? { useDefaults: !asNonEmptyString(input.agent) } : parseModel(input.model);
  const goalTokenBudget = input.goalTokenBudget;
  if (goalTokenBudget !== undefined && input.goal !== true) {
    throw new OpenChamberControlError('goalTokenBudget requires goal', 400);
  }
  if (goalTokenBudget !== undefined && (!isSafeInteger(goalTokenBudget) || goalTokenBudget < 1000 || goalTokenBudget > 100_000_000)) {
    throw new OpenChamberControlError('goalTokenBudget must be from 1000 to 100000000', 400);
  }
  assertWorktreeIsolation(input, targetSessionId);
  const baseBranch = asNonEmptyString(input.baseBranch);
  const task: ControlTask = {
    name,
    enabled: input.disabled !== true,
    schedule: buildSchedule(input),
    execution: {
      prompt,
      ...model,
    },
  };
  if (hasText(input.agent)) task.execution.agent = input.agent.trim();
  if (hasText(input.variant)) task.execution.variant = input.variant.trim();
  if (input.goal === true) task.execution.goalEnabled = true;
  if (goalTokenBudget !== undefined) task.execution.goalTokenBudget = goalTokenBudget;
  if (input.targetSessionId !== undefined) task.targetSessionId = targetSessionId ?? input.targetSessionId;
  if (input.runInWorktree === true) task.runInWorktree = true;
  if (input.cleanupWorktree === false) task.cleanupWorktree = false;
  if (baseBranch) task.baseBranch = baseBranch;
  return task;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
/**
 * `schedule.update`: the stored task with only the fields the call names
 * changed. The id and the run state stay, so history and references survive;
 * the scheduler re-arms from the new schedule on save.
 */
const patchScheduledTask = (existing, input) => {
 if (existing.loopFile) {
  throw new OpenChamberControlError(`This task comes from ${existing.loopFile}; change that file instead`, 409);
 }
 const execution = { ...existing.execution };
 if (input.prompt !== undefined) {
  const prompt = asNonEmptyString(input.prompt);
  if (!prompt) throw new OpenChamberControlError('prompt cannot be empty', 400);
  execution.prompt = prompt;
 }
 if (input.model !== undefined) {
  Object.assign(execution, parseModel(input.model));
  // A thinking level belongs to the model it was chosen for.
  delete execution.variant;
  delete execution.useDefaults;
 }
 for (const field of ['variant', 'agent']) {
  if (input[field] === undefined) continue;
  const value = asNonEmptyString(input[field]);
  if (value) execution[field] = value;
  else delete execution[field];
  if (field === 'agent' && value && (input.targetSessionId || existing.targetSessionId)) delete execution.useDefaults;
 }
 if (typeof input.goal === 'boolean') {
  if (input.goal) execution.goalEnabled = true;
  else {
   delete execution.goalEnabled;
   delete execution.goalTokenBudget;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
/**
 * `schedule.update`: the stored task with only the fields the call names
 * changed. The id and the run state stay, so history and references survive;
 * the scheduler re-arms from the new schedule on save.
 */
const patchScheduledTask = (existing, input) => {
  if (existing.loopFile) {
    throw new OpenChamberControlError(`This task comes from ${existing.loopFile}; change that file instead`, 409);
=======
const patchScheduledTask = (existing: ControlTask & { id: string }, input: ControlInput) => {
  if (existing.loopFile) {
    throw new OpenChamberControlError(`This task comes from ${existing.loopFile}; change that file instead`, 409);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
  }
 }
 if (input.goalTokenBudget !== undefined) {
  if (!execution.goalEnabled) throw new OpenChamberControlError('goalTokenBudget requires goal', 400);
  if (!Number.isSafeInteger(input.goalTokenBudget) || input.goalTokenBudget < 1000 || input.goalTokenBudget > 100_000_000) {
   throw new OpenChamberControlError('goalTokenBudget must be from 1000 to 100000000', 400);
  }
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
  execution.goalTokenBudget = input.goalTokenBudget;
 }
 let name = existing.name;
 if (input.name !== undefined) {
  name = asNonEmptyString(input.name);
  if (!name) throw new OpenChamberControlError('name cannot be empty', 400);
 }
 const replacesSchedule = ['daily', 'weekly', 'once', 'cron'].some((key) => asNonEmptyString(input[key]));
 const timezone = asNonEmptyString(input.timezone);
 const schedule = replacesSchedule
  ? buildSchedule(input)
  : (timezone ? { ...existing.schedule, timezone } : existing.schedule);
 return {
  id: existing.id,
  targetSessionId: input.targetSessionId === undefined ? existing.targetSessionId : input.targetSessionId,
  name,
  enabled: typeof input.disabled === 'boolean' ? !input.disabled : existing.enabled,
  schedule,
  execution,
 };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  if (input.model !== undefined) {
    Object.assign(execution, parseModel(input.model));
    // A thinking level belongs to the model it was chosen for.
    delete execution.variant;
    delete execution.useDefaults;
  }
  for (const field of ['variant', 'agent']) {
    if (input[field] === undefined) continue;
    const value = asNonEmptyString(input[field]);
    if (value) execution[field] = value;
    else delete execution[field];
    if (field === 'agent' && value && (input.targetSessionId || existing.targetSessionId)) delete execution.useDefaults;
  }
  if (typeof input.goal === 'boolean') {
    if (input.goal) execution.goalEnabled = true;
    else {
      delete execution.goalEnabled;
      delete execution.goalTokenBudget;
    }
  }
  if (input.goalTokenBudget !== undefined) {
    if (!execution.goalEnabled) throw new OpenChamberControlError('goalTokenBudget requires goal', 400);
    if (!Number.isSafeInteger(input.goalTokenBudget) || input.goalTokenBudget < 1000 || input.goalTokenBudget > 100_000_000) {
      throw new OpenChamberControlError('goalTokenBudget must be from 1000 to 100000000', 400);
    }
    execution.goalTokenBudget = input.goalTokenBudget;
  }
  let name = existing.name;
  if (input.name !== undefined) {
    name = asNonEmptyString(input.name);
    if (!name) throw new OpenChamberControlError('name cannot be empty', 400);
  }
  const selectors = ['daily', 'weekly', 'once', 'cron'].filter((key) => input[key] !== undefined);
  if (selectors.length > 1 || (selectors.length === 1 && !asNonEmptyString(input[selectors[0]]))) {
    throw new OpenChamberControlError('Provide exactly one nonempty daily, weekly, once, or cron selector', 400);
  }
  const timezone = asNonEmptyString(input.timezone);
  let schedule = selectors.length === 1
    ? buildSchedule(input)
    : (timezone ? { ...existing.schedule, timezone } : existing.schedule);
  if (input.time !== undefined) {
    const time = asNonEmptyString(input.time);
    if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new OpenChamberControlError('time must be HH:mm', 400);
    }
    if (schedule.kind === 'once') {
      schedule = { ...schedule, time };
    } else if (schedule.kind === 'weekly' && schedule.times.length === 1) {
      schedule = { ...schedule, times: [time] };
    } else {
      throw new OpenChamberControlError('time requires a once or single-time weekly schedule; provide an explicit schedule to replace other schedules', 400);
    }
  }

  assertWorktreeIsolation(
    input,
    input.targetSessionId === undefined ? existing.targetSessionId : input.targetSessionId,
  );
  const patch = {
    id: existing.id,
    targetSessionId: input.targetSessionId === undefined ? existing.targetSessionId : input.targetSessionId,
    name,
    enabled: typeof input.disabled === 'boolean' ? !input.disabled : existing.enabled,
    schedule,
    execution,
  };
  if (input.runInWorktree !== undefined) patch.runInWorktree = input.runInWorktree;
  if (input.cleanupWorktree !== undefined) patch.cleanupWorktree = input.cleanupWorktree;
  // Empty or null clears the stored branch; absent leaves it to the store.
  if (input.baseBranch !== undefined) patch.baseBranch = asNonEmptyString(input.baseBranch);
  return patch;
=======
  if (input.model !== undefined) {
    Object.assign(execution, parseModel(input.model));
    delete execution.variant;
    delete execution.useDefaults;
  }
  for (const field of ['variant', 'agent'] as const) {
    if (input[field] === undefined) continue;
    const value = asNonEmptyString(input[field]);
    if (value) execution[field] = value;
    else delete execution[field];
    if (field === 'agent' && value && (input.targetSessionId || existing.targetSessionId)) delete execution.useDefaults;
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
    if (!isSafeInteger(input.goalTokenBudget) || input.goalTokenBudget < 1000 || input.goalTokenBudget > 100_000_000) {
      throw new OpenChamberControlError('goalTokenBudget must be from 1000 to 100000000', 400);
    }
    execution.goalTokenBudget = input.goalTokenBudget;
  }
  let name: string | null = existing.name;
  if (input.name !== undefined) {
    name = asNonEmptyString(input.name);
    if (!name) throw new OpenChamberControlError('name cannot be empty', 400);
  }
  const selectors = (['daily', 'weekly', 'once', 'cron'] as const).filter((key) => input[key] !== undefined);
  if (selectors.length > 1 || (selectors.length === 1 && !asNonEmptyString(input[selectors[0] ?? 'daily']))) {
    throw new OpenChamberControlError('Provide exactly one nonempty daily, weekly, once, or cron selector', 400);
  }
  const timezone = asNonEmptyString(input.timezone);
  let schedule = selectors.length === 1
    ? buildSchedule(input)
    : (timezone ? { ...existing.schedule, timezone } : existing.schedule);
  if (input.time !== undefined) {
    const time = asNonEmptyString(input.time);
    if (!time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw new OpenChamberControlError('time must be HH:mm', 400);
    }
    if (schedule.kind === 'once') {
      schedule = { ...schedule, time };
    } else if (schedule.kind === 'weekly' && schedule.times.length === 1) {
      schedule = { ...schedule, times: [time] };
    } else {
      throw new OpenChamberControlError('time requires a once or single-time weekly schedule; provide an explicit schedule to replace other schedules', 400);
    }
  }

  assertWorktreeIsolation(
    input,
    input.targetSessionId === undefined ? existing.targetSessionId : input.targetSessionId,
  );
  const patch: ControlTask = {
    id: existing.id,
    targetSessionId: input.targetSessionId === undefined ? existing.targetSessionId : input.targetSessionId,
    name,
    enabled: isBoolean(input.disabled) ? !input.disabled : existing.enabled,
    schedule,
    execution,
  };
  if (input.runInWorktree !== undefined) patch.runInWorktree = input.runInWorktree;
  if (input.cleanupWorktree !== undefined) patch.cleanupWorktree = input.cleanupWorktree;
  if (input.baseBranch !== undefined) patch.baseBranch = asNonEmptyString(input.baseBranch);
  return patch;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
export const createOpenChamberControlService = (dependencies) => {
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
  fileOpen = null,
  notifyUser = null,
  // Notes, todos and plans behind the `openchamber_knowledge` tool.
  projectContextRuntime = null,
  // The resolver the knowledge tool and session knowledge share, so what an
  // agent writes is what the next session is given.
  resolveProjectContextId = null,
  // Every connected window hears this; the ones showing that project open
  // the plan (openchamber:plan-open-request).
  showPlan = null,
  isKnowledgeToolEnabled = async () => true,
  sessionLinks = null,
  isRenderToolEnabled = async () => true,
  // Hears when a page an agent shows starts and stops waiting for the
  // user's answer (render.page with awaitAnswer).
  onPageWaitChange = () => { },
  // Delivers a dispatched session's result back to the session that asked
  // (`returnResult`); absent means the server cannot offer it.
  dispatchResults = null,
  // Watches a pull request for a session and wakes the session on change
  // (`pr.watch`); absent where pull request watches are not available.
  prWatch = null,
  // Archive lives in OpenChamber's own store now.
  archiveStore = null,
  // Agent workflows (../workflows/runtime.js); absent where they are not
  // available, which is every build without OPENCHAMBER_WORKFLOWS_ENABLE.
  workflowRuntime = null,
  sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  now = Date.now,
 } = dependencies;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
export const createOpenChamberControlService = (dependencies) => {
  const {
    readSettingsFromDiskMigrated,
    sanitizeProjects,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    waitForOpenCodeReady,
    sessionService,
    chatsScope = null,
    // Roots of managed Chats, which are never in work (../session-work/membership.js).
    chatRoots = [],
    // `(sessionID, decide, { directory }) => { metadata, changed }`, the store
    // write the app's own Done goes through; absent means the server cannot
    // change In work.
    updateSessionMetadata = null,
    scheduledTaskService,
    browserControl = null,
    fileOpen = null,
    notifyUser = null,
    agentMemoryActions = null,
    sessionLinks = null,
    // Git and metadata access for `work.name`; absent means the server cannot name tasks.
    workNaming = null,
    projectContextRuntime = null,
    resolveProjectContextId = null,
    isKnowledgeToolEnabled = async () => true,
    isRenderToolEnabled = async () => true,
    isSecretToolEnabled = async () => true,
    // Where `secret.request` writes what the user saves
    // (`createSecretFiles`); absent means the server cannot take secrets.
    secretFiles = null,
    // Hears when a page an agent shows starts and stops waiting for the
    // user's answer (render.page with awaitAnswer, and secret.request).
    onPageWaitChange = () => {},
    // The requests each session waits on the user to answer, by session id
    // (`getPendingBlockingRequestsSnapshot`); an entry exists only while one is open.
    readPendingRequests = () => ({}),
    // Whether the server answers this permission for the user (auto-accept).
    isPermissionAutoAnswered = async () => false,
    // Puts a plan in front of the user; answers how many windows it reached.
    showPlan = null,
    // Delivers a dispatched session's result back to the session that asked
    // (`returnResult`); absent means the server cannot offer it.
    dispatchResults = null,
    // An agent waiting on its pull request (../pr-watch); absent means the
    // server cannot offer it.
    prWatch = null,
    // Agent workflows (../workflows/runtime.js); absent means the server
    // cannot offer them.
    workflowRuntime = null,
    // Archive lives in OpenChamber's own store now — v2 has no route that sets
    // Session.time.archived — so an unwired store simply means nothing is archived.
    archiveStore = null,
    // Whether OpenCode may open a folder (../opencode-trust); absent opens every folder.
    isOpenCodeDirectoryTrusted = null,
    createClient = OpenCode.make,
    // Reads an agent's reference images and writes the generated ones.
    imageFsPromises = nodeFsPromises,
    // Loads the quota module (`../quota/index.js`) for `usage.read`; absent
    // means the server cannot read usage.
    loadQuota = null,
    sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
    now = Date.now,
  } = dependencies;
=======
export const createOpenChamberControlService = (dependencies: ControlDependencies) => {
  const {
    readSettingsFromDiskMigrated,
    sanitizeProjects,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    waitForOpenCodeReady,
    sessionService,
    chatsScope = null,
    chatRoots = [],
    updateSessionMetadata = null,
    isWorktreePinned = async () => false,
    scheduledTaskService,
    browserControl = null,
    browserUploads = null,
    fileOpen = null,
    notifyUser = null,
    agentMemoryActions = null,
    sessionLinks = null,
    workNaming = null,
    projectContextRuntime = null,
    resolveProjectContextId = null,
    isKnowledgeToolEnabled = async () => true,
    isRenderToolEnabled = async () => true,
    isSecretToolEnabled = async () => true,
    getTerminalRuntime = null,
    secretFiles = null,
    onPageWaitChange = () => {},
    readPendingRequests = (): ReturnType<NonNullable<ControlDependencies['readPendingRequests']>> => ({}),
    isPermissionAutoAnswered = async () => false,
    showPlan = null,
    dispatchResults = null,
    prWatch = null,
    extensionWaits = null,
    laterPages = null,
    workflowRuntime = null,
    sharePages = null,
    archiveStore = null,
    isOpenCodeDirectoryTrusted = null,
    createClient = OpenCode.make,
    imageFsPromises = nodeFsPromises,
    loadQuota = null,
    sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
    now = Date.now,
    isHiddenSession = () => false,
  } = dependencies;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 if (!service || typeof service.request !== 'function') throw new Error('control service requires the Agent service');
 if (!sessionService || typeof sessionService.open !== 'function' || typeof sessionService.history !== 'function') {
  throw new Error('control service requires the canonical session service');
 }
 if (typeof resolveSessionScope !== 'function' || typeof resolveWorkspaceScope !== 'function') {
  throw new Error('control service requires Host session and workspace scope resolvers');
 }
 if (typeof listWorkspaceScopes !== 'function' || typeof listProjects !== 'function') {
  throw new Error('control service requires canonical workspace and project listings');
 }
 if (typeof readSettingsFromDiskMigrated !== 'function') throw new Error('control service requires settings for feature policy');
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  const wait = (duration, signal) => {
    if (!signal) return sleep(duration);
    if (signal.aborted) return Promise.reject(new OpenChamberControlError('OpenChamber action was cancelled', 499));
    return new Promise((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        reject(new OpenChamberControlError('OpenChamber action was cancelled', 499));
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
=======
  const wait = (duration: number, signal?: AbortSignal) => {
    if (!signal) return sleep(duration);
    if (signal.aborted) return Promise.reject(new OpenChamberControlError('OpenChamber action was cancelled', 499));
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        signal.removeEventListener('abort', onAbort);
        reject(new OpenChamberControlError('OpenChamber action was cancelled', 499));
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
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 const wait = (duration, signal) => {
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
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  // Every v2 route lives under /api and the client appends it, so it only
  // wants the origin. Per-directory scoping is a request header.
  const getClient = async (directory = '') => {
    // An agent can name any folder, a pull request checkout included. One whose
    // OpenCode configuration runs code waits until the user trusts it in the app.
    if (directory && isOpenCodeDirectoryTrusted && !(await isOpenCodeDirectoryTrusted(directory))) {
      throw new OpenChamberControlError(
        `OpenCode is paused for ${directory}: its configuration runs plugins or commands the user has not trusted. Ask the user to open the folder in OpenChamber and trust it.`,
        403,
      );
    }
    if (typeof waitForOpenCodeReady === 'function') await waitForOpenCodeReady(10_000, 250);
    return createClient({
      baseUrl: new URL(buildOpenCodeUrl('/api/info', '')).origin,
      headers: {
        ...getOpenCodeAuthHeaders(),
        ...(directory ? { 'x-opencode-directory': encodeURIComponent(directory) } : {}),
      },
      fetch,
    });
  };

  const workNamer = workNaming ? createWorkNamer({
    ...workNaming,
    getSession: async (sessionID) => {
      const client = await getClient();
      return client.session.get({ sessionID }).catch(() => null);
    },
    createError: (message, status) => new OpenChamberControlError(message, status),
  }) : null;

  // OpenCode holds archive state; the archive file holds it for sessions whose
  // directory is gone, and its entry wins: a timestamp archives, null restores.
  const withArchiveEntry = async (session) => {
    if (!archiveStore || !session?.id) return session;
    const entry = await archiveStore.entry(session.id);
    if (entry === undefined) return session;
    if (entry !== null) return { ...session, time: { ...session.time, archived: entry } };
    const { archived: _archived, ...time } = session.time ?? {};
    return { ...session, time };
  };

  const projects = async () => {
    const settings = await readSettingsFromDiskMigrated();
    const configured = sanitizeProjects(settings?.projects || []).map((project) => ({
      id: project.id,
      path: path.resolve(project.path),
      label: asNonEmptyString(project.label) || path.basename(project.path) || project.path,
    }));
    return chatsScope
      ? [...configured, { id: CHATS_SCOPE_PUBLIC_ID, path: chatsScope.root, label: 'Chats' }]
      : configured;
  };

  // projectId and directory are two names for one scope. Accepting both let
  // one silently win over the other, so every session action refuses the pair.
  const assertSingleScope = (input) => {
    if (asNonEmptyString(input.projectId) && asNonEmptyString(input.directory)) {
      throw new OpenChamberControlError('Provide only one of projectId or directory', 400);
    }
  };

  // An explicit projectId scopes a session read to that project's directory,
  // resolved the same way create/send/fork resolve it. An unknown project is
  // an error, never a silent read of the caller's directory or of every project.
  const resolveReadDirectory = async (input, contextDirectory) => {
    assertSingleScope(input);
    const projectID = asNonEmptyString(input.projectId);
    if (!projectID) return asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory);
    return sessionService.resolveDirectory({ projectId: projectID });
  };

  const knowledgeActions = createProjectKnowledgeActions({
    projectContextRuntime,
    resolveProjectContextId,
    isEnabled: isKnowledgeToolEnabled,
    showPlan,
    resolveDirectory: (input) => sessionService.resolveDirectory(input),
=======
  const getClient = async (directory: string | null = ''): Promise<ControlClient> => {
    if (directory && isOpenCodeDirectoryTrusted && !(await isOpenCodeDirectoryTrusted(directory))) {
      throw new OpenChamberControlError(
        `OpenCode is paused for ${directory}: its configuration runs plugins or commands the user has not trusted. Ask the user to open the folder in OpenChamber and trust it.`,
        403,
      );
    }
    if (waitForOpenCodeReady) await waitForOpenCodeReady(10_000, 250);
    const baseUrl = new URL(buildOpenCodeUrl('/api/info', '')).origin;
    const headers = { ...getOpenCodeAuthHeaders() };
    if (directory) Object.assign(headers, { 'x-opencode-directory': encodeURIComponent(directory) });
    return createClient({
      baseUrl,
      headers,
      fetch,
    });
  };

  const workNamer = workNaming ? createWorkNamer({
    ...workNaming,
    getSession: async (sessionID) => {
      const client = await getClient();
      return client.session.get({ sessionID }).catch(() => null);
    },
    createError: (message, status) => new OpenChamberControlError(message, status),
  }) : null;

  const withArchiveEntry = async (session: ControlSession): Promise<ControlSession> => {
    if (!archiveStore || !session?.id) return session;
    const entry = await archiveStore.entry(session.id);
    if (entry === undefined) return session;
    if (entry !== null) return { ...session, time: { ...session.time, archived: entry } };
    const { archived: _archived, ...time } = session.time ?? {};
    return { ...session, time };
  };

  const projects = async () => {
    const settings = await readSettingsFromDiskMigrated();
    const configured = sanitizeProjects(settings?.projects || []).map((project) => ({
      id: project.id,
      path: path.resolve(project.path),
      label: asNonEmptyString(project.label) || path.basename(project.path) || project.path,
    }));
    return chatsScope
      ? [...configured, { id: CHATS_SCOPE_PUBLIC_ID, path: chatsScope.root, label: 'Chats' }]
      : configured;
  };

  const assertSingleScope = (input: ControlInput) => {
    if (asNonEmptyString(input.projectId) && asNonEmptyString(input.directory)) {
      throw new OpenChamberControlError('Provide only one of projectId or directory', 400);
    }
  };

  const resolveReadDirectory = async (input: ControlInput, contextDirectory: ControlInput['directory']) => {
    assertSingleScope(input);
    const projectID = asNonEmptyString(input.projectId);
    if (!projectID) return asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory);
    return sessionService.resolveDirectory({ projectId: projectID });
  };

  const knowledgeActions = createProjectKnowledgeActions({
    projectContextRuntime,
    resolveProjectContextId,
    isEnabled: isKnowledgeToolEnabled,
    showPlan,
    resolveDirectory: (input) => sessionService.resolveDirectory(input),
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
  });
 };

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 const agentRequest = async (pathname, init = {}) => {
  const response = await service.request(pathname, {
   ...init,
   headers: { accept: 'application/json', ...(init.headers || {}) },
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  // A message the user steered into the turn stays in OpenCode's inbox until
  // a step ends. A queued one waits for the turn to end, so the page's call
  // returning would not deliver it. A failed read counts as none, so the page
  // waits as it did before this check.
  const hasUnreadChat = async (sessionID) => {
    try {
      const client = await getClient();
      const items = await client.session.inbox.list({ sessionID });
      return items.some((item) => item.type === 'user' && item.delivery === 'steer');
    } catch (error) {
      console.warn('[render.page] could not read the session inbox:', error?.message ?? error);
      return false;
    }
  };
  const pageAnswers = createPageAnswers({ onWaitChange: onPageWaitChange });
  const renderPage = createRenderPageAction({ isEnabled: isRenderToolEnabled, pageAnswers, hasUnreadChat });
  const secretRequests = createSecretRequests({ isEnabled: isSecretToolEnabled, files: secretFiles, onWaitChange: onPageWaitChange, hasUnreadChat });
  const generateImage = createImageGenerationAction({
    getClient,
    readSettings: readSettingsFromDiskMigrated,
    fsPromises: imageFsPromises,
=======
  const hasUnreadChat = async (sessionID: string) => {
    try {
      const client = await getClient();
      const items = await client.session.inbox.list({ sessionID });
      return items.some((item) => item.type === 'user' && item.delivery === 'steer' && !isAgentPrompt(item.payload?.metadata));
    } catch (error) {
      console.warn('[render.page] could not read the session inbox:', controlErrorFields(error)?.message ?? error);
      return false;
    }
  };
  const pageAnswers = createPageAnswers({ onWaitChange: onPageWaitChange });
  const readSession = async (sessionID: string) => (await getClient()).session.get({ sessionID });
  const renderPage = createRenderPageAction({ isEnabled: isRenderToolEnabled, pageAnswers, hasUnreadChat, readSession, laterPages, sharePages });
  const secretRequests = createSecretRequests({ isEnabled: isSecretToolEnabled, files: secretFiles, onWaitChange: onPageWaitChange, hasUnreadChat });
  const generateImage = createImageGenerationAction({
    getClient,
    readSettings: readSettingsFromDiskMigrated,
    fsPromises: imageFsPromises,
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
  });
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
  const body = await response.json().catch(() => null);
  if (!response.ok) {
   throw new OpenChamberControlError(body?.detail || body?.error || 'Agent service request failed', response.status);
  }
  return body;
 };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  const readUsage = loadQuota ? createUsageReadAction({ readSettings: readSettingsFromDiskMigrated, loadQuota }) : null;
=======
  const readUsage = loadQuota ? createUsageReadAction({ readSettings: readSettingsFromDiskMigrated, loadQuota }) : null;
  const readTerminal = createTerminalReadAction({ readSettings: readSettingsFromDiskMigrated, getTerminalRuntime });
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

 const archivedAt = async (sessionID) => {
  if (!archiveStore) return null;
  return (await archiveStore.archivedAt(sessionID)) ?? null;
 };

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 // projectId and directory are two names for one scope. A project resolves
 // to its first workspace's directory, the way session create and send do.
 const resolveProjectDirectory = async (projectId) => {
  const listed = await projects();
  const project = listed.items.find((entry) => entry.projectId === projectId);
  const workspaceId = project?.workspaceIds?.[0];
  if (!workspaceId) throw new OpenChamberControlError('Project not found', 404);
  return sessionService.resolveDirectory({ workspaceId });
 };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  /**
   * `models.search`: the catalog of the caller's directory, the way the model
   * picker sees it. Models the user hid in the picker stay out, favorites and
   * then recent models come first, and only the newest of a family shows
   * unless `all` asks for older versions. OpenCode's own `models` tool is
   * removed from the agent's list in favour of this one.
   */
  const searchModels = async (input, contextDirectory) => {
    const client = await getClient(asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory) || '');
    const [settings, catalog, providerList] = await Promise.all([
      readSettingsFromDiskMigrated(),
      client.model.list(),
      client.provider.list(),
    ]);
    const providerNames = new Map(providerList.data.map((provider) => [provider.id, provider.name]));
    const refKey = (ref) => `${ref?.providerID}/${ref?.modelID}`;
    const modelKey = (model) => `${model.providerID}/${model.id}`;
    const refs = (value) => new Set((Array.isArray(value) ? value : []).map(refKey));
    const hidden = refs(settings?.hiddenModels);
    // 2 for a favorite, 1 for a recent model, absent for the rest.
    const rank = new Map([
      ...[...refs(settings?.recentModels)].map((key) => [key, 1]),
      ...[...refs(settings?.favoriteModels)].map((key) => [key, 2]),
    ]);
    const provider = asNonEmptyString(input.provider)?.toLowerCase();
    const terms = (asNonEmptyString(input.query) ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const shownFamilies = new Set();
    const matching = catalog.data
      .filter((model) => !hidden.has(modelKey(model)))
      .filter((model) => !provider
        || model.providerID.toLowerCase() === provider
        || providerNames.get(model.providerID)?.toLowerCase() === provider)
      .filter((model) => {
        const text = `${modelKey(model)} ${model.name}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      })
      .toSorted((left, right) => (rank.get(modelKey(right)) ?? 0) - (rank.get(modelKey(left)) ?? 0)
        || left.providerID.localeCompare(right.providerID)
        || right.time.released - left.time.released)
      // Newest first within a provider, so the first of a family is its newest.
      .filter((model) => {
        if (input.all === true || !model.family || rank.has(modelKey(model))) return true;
        const family = `${model.providerID}/${model.family}`;
        if (shownFamilies.has(family)) return false;
        shownFamilies.add(family);
        return true;
      });
    const offset = Number.isSafeInteger(input.offset) && input.offset > 0 ? input.offset : 0;
    const limit = Number.isSafeInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, 100) : 10;
    const page = matching.slice(offset, offset + limit);
    return {
      models: page.map((model) => ({
        id: modelKey(model),
        name: model.name,
        provider: providerNames.get(model.providerID) ?? model.providerID,
        // Absent for a model the user has not picked; JSON drops the undefined.
        preference: PREFERENCE_BY_RANK[rank.get(modelKey(model))],
        released: model.time.released,
        variants: model.variants.map((variant) => variant.id),
        cost: model.cost,
        status: model.status,
      })),
      total: matching.length,
      next: offset + limit < matching.length ? offset + limit : null,
    };
  };
=======
  const searchModels = async (input: ControlInput, contextDirectory: ControlInput['directory']) => {
    const client = await getClient(asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory) || '');
    const [settings, catalog, providerList] = await Promise.all([
      readSettingsFromDiskMigrated(),
      client.model.list(),
      client.provider.list(),
    ]);
    const providerNames = new Map(providerList.data.map((provider) => [provider.id, provider.name]));
    const refKey = (ref: ControlSettings['recentModels']) => {
      const fields: { providerID?: unknown; modelID?: unknown } | undefined = ref == null ? undefined : Object(ref);
      return `${fields?.providerID}/${fields?.modelID}`;
    };
    const modelKey = (model: ModelInfo) => `${model.providerID}/${model.id}`;
    const refs = (value: ControlSettings['hiddenModels']) => new Set((Array.isArray(value) ? value : []).map(refKey));
    const hidden = refs(settings?.hiddenModels);
    const rank = new Map([
      ...[...refs(settings?.recentModels)].map((key) => [key, 1] as const),
      ...[...refs(settings?.favoriteModels)].map((key) => [key, 2] as const),
    ]);
    const provider = asNonEmptyString(input.provider)?.toLowerCase();
    const terms = (asNonEmptyString(input.query) ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const candidates = catalog.data
      .filter((model) => !hidden.has(modelKey(model)))
      .filter((model) => !provider
        || model.providerID.toLowerCase() === provider
        || providerNames.get(model.providerID)?.toLowerCase() === provider)
      .filter((model) => {
        const text = `${modelKey(model)} ${model.name}`.toLowerCase();
        return terms.every((term) => text.includes(term));
      });
    const familyOf = (model: ModelInfo) => `${model.providerID}/${model.family}`;
    const newestOfFamily = new Map<string, number>();
    for (const model of candidates) {
      if (!model.family || rank.has(modelKey(model))) continue;
      newestOfFamily.set(familyOf(model), Math.max(newestOfFamily.get(familyOf(model)) ?? 0, model.time.released));
    }
    const matching = candidates
      .toSorted((left, right) => (rank.get(modelKey(right)) ?? 0) - (rank.get(modelKey(left)) ?? 0)
        || left.providerID.localeCompare(right.providerID)
        || right.time.released - left.time.released)
      .filter((model) => input.all === true || !model.family || rank.has(modelKey(model))
        || model.time.released >= Number(newestOfFamily.get(familyOf(model))));
    const offset = isSafeInteger(input.offset) && input.offset > 0 ? input.offset : 0;
    const limit = isSafeInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, 100) : 10;
    const page = matching.slice(offset, offset + limit);
    return {
      models: page.map((model) => ({
        id: modelKey(model),
        name: model.name,
        provider: providerNames.get(model.providerID) ?? model.providerID,
        preference: PREFERENCE_BY_RANK[String(rank.get(modelKey(model)))],
        released: model.time.released,
        variants: model.variants.map((variant) => variant.id),
        cost: model.cost,
        status: model.status,
      })),
      total: matching.length,
      next: offset + limit < matching.length ? offset + limit : null,
    };
  };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 const knowledgeActions = createProjectKnowledgeActions({
  projectContextRuntime,
  resolveProjectContextId,
  isEnabled: isKnowledgeToolEnabled,
  showPlan,
  resolveDirectory: (input = {}) => (input.projectId
   ? resolveProjectDirectory(input.projectId)
   : sessionService.resolveDirectory(input)),
 });
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  // /api/session/active is global in v2 and reports only `{ type: 'running' }`.
  const activeSessions = async (client) => {
    const statuses = await client.session.active();
    if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) {
      throw new OpenChamberControlError('Invalid session status response', 500);
    }
    return statuses;
  };
=======
  const activeSessions = async (client: ControlClient) => {
    const statuses = await client.session.active();
    if (!isRecord(statuses)) {
      throw new OpenChamberControlError('Invalid session status response', 500);
    }
    return Object.fromEntries(Object.entries(statuses).filter(([id]) => !isHiddenSession(id)));
  };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 const projects = async () => {
  const result = await listProjects();
  if (!result || !Array.isArray(result.items) || !result.errors || typeof result.errors !== 'object') {
   throw new OpenChamberControlError('Invalid project listing', 500);
  }
  return result;
 };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  // A permission the server answers by itself never reaches the user.
  const isWaitingForUser = async (sessionID) => {
    const pending = readPendingRequests()[sessionID];
    if (!pending) return false;
    if (pending.forms.length > 0 || pending.pages.length > 0) return true;
    const answered = await Promise.all(pending.permissions.map((permission) =>
      isPermissionAutoAnswered(sessionID, permission.directory, permission.id)));
    return answered.includes(false);
  };
=======
  const isWaitingForUser = async (sessionID: string | undefined) => {
    const pending = readPendingRequests()[String(sessionID)];
    if (!pending) return false;
    if (pending.forms.length > 0 || pending.pages.length > 0) return true;
    const answered = await Promise.all(pending.permissions.map((permission) =>
      isPermissionAutoAnswered(sessionID, permission.directory, permission.id)));
    return answered.includes(false);
  };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 const workspaceScopes = async () => {
  const result = await listWorkspaceScopes();
  if (!result || !Array.isArray(result.items) || !result.errors || typeof result.errors !== 'object') {
   throw new OpenChamberControlError('Invalid workspace scope listing', 500);
  }
  return result;
 };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  // Only a running session can be waiting: the event that ends a stopped turn's
  // pending requests arrives after the active map has dropped the session.
  const asPublicStatus = async (statuses, sessionID) => {
    if (!statuses[sessionID]) return { type: 'idle' };
    return await isWaitingForUser(sessionID) ? { type: 'waiting' } : { type: 'busy' };
  };
=======
  const asPublicStatus = async (statuses: Awaited<ReturnType<typeof activeSessions>>, sessionID: string | undefined): Promise<PublicSessionStatus> => {
    if (!statuses[String(sessionID)]) return { type: 'idle' };
    return await isWaitingForUser(sessionID) ? { type: 'waiting' } : { type: 'busy' };
  };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 const resolveWorkspaceFor = async (input = {}, contextSessionId = '', contextDirectory = '') => {
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
  let workspaceIds = listed.items.map((item) => item.workspaceId).filter((id) => typeof id === 'string');
  if (explicitProjectId) {
   const projectListing = await projects();
   const project = projectListing?.items?.find((item) => item?.projectId === explicitProjectId);
   workspaceIds = Array.isArray(project?.workspaceIds) ? project.workspaceIds : [];
  }
  for (const workspaceId of workspaceIds) {
   const scope = await resolveWorkspaceScope(workspaceId);
   if (scope && (!explicitProjectId || scope.projectId === explicitProjectId) && (!directory || scope.cwd === directory)) return scope;
  }
  throw new OpenChamberControlError('Workspace scope was not found', 404);
 };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  const sessionStatus = async (client, sessionID) => asPublicStatus(await activeSessions(client), sessionID);
=======
  const sessionStatus = async (client: ControlClient, sessionID: string) => asPublicStatus(await activeSessions(client), sessionID);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 // Scope selectors are mutually exclusive so one cannot silently override another.
 const assertSingleScope = (input) => {
  const projectId = asNonEmptyString(input.projectId);
  const directory = asNonEmptyString(input.directory);
  const workspaceId = asNonEmptyString(input.workspaceId);
  if ((projectId && directory) || (workspaceId && (projectId || directory))) {
   throw new OpenChamberControlError('Provide only one workspaceId, projectId, or directory', 400);
  }
 };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  // The active map names only running sessions, so a session it does not name
  // is idle or does not exist. session.get tells them apart and starts no
  // location. An id OpenCode refuses as malformed cannot name a session. A
  // lookup that fails any other way says nothing about the session.
  const assertSessionExists = async (client, sessionID) => {
    try {
      return await client.session.get({ sessionID });
    } catch (error) {
      if (error?._tag === 'SessionNotFoundError' || error?._tag === 'InvalidRequestError') {
        throw new OpenChamberControlError(`Session not found: ${sessionID}`, 404);
      }
      throw new OpenChamberControlError(
        `Could not check whether session ${sessionID} exists: ${error instanceof Error ? error.message : String(error)}`,
        503,
      );
    }
  };
=======
  const assertSessionExists = async (client: ControlClient, sessionID: string) => {
    try {
      return await client.session.get({ sessionID });
    } catch (error) {
      if (controlErrorFields(error)?._tag === 'SessionNotFoundError' || controlErrorFields(error)?._tag === 'InvalidRequestError') {
        throw new OpenChamberControlError(`Session not found: ${sessionID}`, 404);
      }
      throw new OpenChamberControlError(
        `Could not check whether session ${sessionID} exists: ${error instanceof Error ? error.message : String(error)}`,
        503,
      );
    }
  };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 const resolveReadScope = async (input, contextDirectory, contextSessionId, sessionID = '') => {
  assertSingleScope(input);
  const actual = sessionID ? await resolveSessionScope(sessionID) : null;
  if (sessionID && !actual) throw new OpenChamberControlError('Session scope was not found', 404);
  if (sessionID && !asNonEmptyString(input.projectId) && !asNonEmptyString(input.directory) && !asNonEmptyString(input.workspaceId)) return actual;
  const requested = await resolveWorkspaceFor(input, contextSessionId, contextDirectory);
  if (!sessionID) return requested;
  if ((asNonEmptyString(input.projectId) && actual.projectId !== input.projectId)
   || (asNonEmptyString(input.directory) && actual.cwd !== input.directory)
   || (requested.workspaceId && actual.workspaceId !== requested.workspaceId)) {
   throw new OpenChamberControlError('Session is outside the requested scope', 403);
  }
  return actual;
 };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  const workMembership = createWorkMembership({ chatRoots });
  // On by default, read at every use like the session-work runtime reads it.
  const isSessionWorkEnabled = async () => {
    const settings = await readSettingsFromDiskMigrated().catch(() => null);
    return settings?.sessionWorkEnabled !== false;
  };
=======
  const workMembership = createWorkMembership({ chatRoots });
  const isSessionWorkEnabled = async () => {
    const settings = await readSettingsFromDiskMigrated().catch(() => null);
    return settings?.sessionWorkEnabled !== false;
  };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 const pageAnswers = createPageAnswers({ onWaitChange: onPageWaitChange });
 const renderPage = createRenderPageAction({ isEnabled: isRenderToolEnabled, pageAnswers });
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  // A filtered read walks every page, so it asks for big ones.
  const FILTERED_PAGE_SIZE = 200;
=======
  const FILTERED_PAGE_SIZE = 200;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
 // 2 for a favorite, 1 for a recent model, absent for the rest.
 const PREFERENCE_BY_RANK = { 2: 'favorite', 1: 'recent' };
 const modelRefKey = (ref) => `${ref?.providerId ?? ref?.providerID}/${ref?.modelId ?? ref?.modelID}`;

 /**
  * `models.search`: the catalog of the caller's workspace, the way the model
  * picker sees it. Models the user hid in the picker stay out, favorites and
  * then recent models come first, and only the newest of a family shows
  * unless `all` asks for older versions.
  */
 const searchModels = async (input, contextSessionId, contextDirectory) => {
  const scope = await resolveWorkspaceFor(input, contextSessionId, contextDirectory);
  const workspaceId = asNonEmptyString(scope?.workspaceId);
  if (!workspaceId) throw new OpenChamberControlError('Workspace scope is missing workspaceId', 500);
  const [modelCatalog, providerCatalog, settings] = await Promise.all([
   agentRequest(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/models`),
   agentRequest(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/providers`),
   readSettingsFromDiskMigrated(),
  ]);
  const providerNames = new Map((Array.isArray(providerCatalog?.providers) ? providerCatalog.providers : [])
   .map((provider) => [provider.providerId, provider.name]));
  const refs = (value) => new Set((Array.isArray(value) ? value : []).map(modelRefKey));
  const hidden = refs(settings?.hiddenModels);
  const rank = new Map([
   ...[...refs(settings?.recentModels)].map((key) => [key, 1]),
   ...[...refs(settings?.favoriteModels)].map((key) => [key, 2]),
  ]);
  const provider = asNonEmptyString(input.provider)?.toLowerCase();
  const terms = (asNonEmptyString(input.query) ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const shownFamilies = new Set();
  const models = (Array.isArray(modelCatalog?.models) ? modelCatalog.models : [])
   .filter((model) => !hidden.has(modelRefKey({ providerId: model.provider, modelId: model.modelId })))
   .filter((model) => !provider
    || model.provider.toLowerCase() === provider
    || providerNames.get(model.provider)?.toLowerCase() === provider)
   .filter((model) => {
    const text = `${modelRefKey({ providerId: model.provider, modelId: model.modelId })} ${model.name}`.toLowerCase();
    return terms.every((term) => text.includes(term));
   })
   .toSorted((left, right) => (rank.get(modelRefKey({ providerId: right.provider, modelId: right.modelId })) ?? 0)
    - (rank.get(modelRefKey({ providerId: left.provider, modelId: left.modelId })) ?? 0)
    || (providerNames.get(left.provider) ?? left.provider).localeCompare(providerNames.get(right.provider) ?? right.provider)
    || left.name.localeCompare(right.name));
  const offset = Number.isSafeInteger(input.offset) && input.offset > 0 ? input.offset : 0;
  const limit = Number.isSafeInteger(input.limit) && input.limit > 0 ? Math.min(input.limit, 100) : 10;
  const page = models.slice(offset, offset + limit);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
  /**
   * What `session.list` tells about one session. The OpenCode record runs to
   * about 750 characters (tokens, cost, permissions, every metadata
   * namespace), a session in work to about 1,700; this keeps what choosing a
   * session needs, about 210. `session.status` and `session.messages` read
   * one session in full.
   */
  const listedSession = (record, workEnabled) => {
    const session = {
      id: record.id,
      title: asNonEmptyString(record.title),
      directory: asNonEmptyString(record.location?.directory) ?? asNonEmptyString(record.directory),
      updated: record.time?.updated,
      archived: record.time?.archived,
      parentID: asNonEmptyString(record.parentID),
      agent: asNonEmptyString(record.agent),
      model: record.model,
      outcome: record.outcome,
    };
    if (workEnabled) {
      session.inWork = workMembership.isInWork(record);
      session.doneSuggested = workMembership.isDoneSuggested(record);
    }
    // A field the record lacks stays out of the answer.
    return Object.fromEntries(Object.entries(session).filter(([, value]) => value !== undefined && value !== null));
  };

  /**
   * `session.list`. Newest first, top-level sessions unless `children`, the
   * caller's directory unless scoped. `inWork` and `busy` read every project
   * when unscoped, as the sidebar and the session status do, and return every
   * match unless `limit` says otherwise; `query` matches every word in the
   * title, case-insensitively, which OpenCode's own `search` (SQLite LIKE)
   * does not do for non-ASCII titles. Each session says whether it is in work
   * while In work is on.
   */
  const listSessions = async (input, contextDirectory) => {
    assertSingleScope(input);
    const inWork = input.inWork === true;
    const busy = input.busy === true;
    const terms = (asNonEmptyString(input.query) ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const scoped = Boolean(asNonEmptyString(input.projectId) || asNonEmptyString(input.directory));
    const everywhere = (inWork || busy) && !scoped;
    const directory = everywhere ? null : await resolveReadDirectory(input, contextDirectory);
    const limit = positiveInteger(input.limit, inWork || busy ? null : 10, 'limit');
    const workEnabled = await isSessionWorkEnabled();
    if (inWork && !workEnabled) throw new OpenChamberControlError('In work is turned off in Settings', 409);

    const client = await getClient(directory ?? '');
    const wantStatus = busy || input.withStatus === true;
    const statuses = wantStatus ? await activeSessions(client).catch(() => null) : null;
    // A failed read is never an empty answer.
    if (busy && !statuses) throw new OpenChamberControlError('Could not read which sessions are running', 503);
    const runningCount = busy ? Object.keys(statuses).length : 0;

    // Session reads are cursor-paginated: one upstream page is not the
    // collection. Collect only until the limit is satisfied, skip ids a
    // repeated page already contributed, and stop on a cursor seen twice
    // so a pathological server cannot spin the walk.
    const collected = [];
    const full = () => limit !== null && collected.length >= limit;
    const seenCursors = new Set();
    const seenSessionIds = new Set();
    let runningSeen = 0;
    let cursor;
    while (!(busy && runningSeen >= runningCount)) {
      const listInput = {};
      if (directory) listInput.directory = directory;
      if (input.children !== true) listInput.parentID = null;
      if (inWork || busy || terms.length > 0) listInput.limit = FILTERED_PAGE_SIZE;
      if (cursor) listInput.cursor = cursor;
      const response = await client.session.list(listInput);
      const page = await Promise.all((Array.isArray(response?.data) ? response.data : []).map(withArchiveEntry));
      for (const record of page) {
        const id = asNonEmptyString(record?.id);
        if (id) {
          if (seenSessionIds.has(id)) continue;
          seenSessionIds.add(id);
        }
        const running = Boolean(id && statuses?.[id]);
        if (running) runningSeen += 1;
        if (input.all !== true && record?.time?.archived) continue;
        if (busy && !running) continue;
        if (terms.length > 0) {
          const title = (asNonEmptyString(record?.title) ?? '').toLowerCase();
          if (!terms.every((term) => title.includes(term))) continue;
        }
        const session = listedSession(record, workEnabled);
        if (inWork && !session.inWork) continue;
        collected.push(session);
        if (full()) break;
      }
      if (full()) break;
      const next = asNonEmptyString(response?.cursor?.next);
      if (!next || page.length === 0 || seenCursors.has(next)) break;
      seenCursors.add(next);
      cursor = next;
    }

    const sessions = wantStatus
      ? await Promise.all(collected.map(async (session) => ({
        ...session,
        status: statuses ? await asPublicStatus(statuses, session.id) : { type: 'unknown' },
      })))
      : collected;
    return { sessions, limit, directory, archived: input.all === true ? 'included' : 'excluded' };
  };

  /**
   * `session.markDone` and `session.track`: the record the app's Done and
   * Track write, through the same store, so every window updates.
   */
  const setWorkState = async (input, contextSessionId, state) => {
    if (!updateSessionMetadata) throw new OpenChamberControlError('Changing In work is not available on this server', 503);
    if (!(await isSessionWorkEnabled())) throw new OpenChamberControlError('In work is turned off in Settings', 409);
    const sessionID = asNonEmptyString(input.sessionId) || asNonEmptyString(contextSessionId);
    if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
    const session = await withArchiveEntry(await assertSessionExists(await getClient(), sessionID));
    if (state === 'open' && !workMembership.canBeInWork(session)) {
      throw new OpenChamberControlError(`${sessionID} cannot be in work: subsessions, Chats, reviews, /btw questions and scheduled runs never are`, 400);
    }
    if (state === 'open' && session?.time?.archived) {
      throw new OpenChamberControlError(`${sessionID} is archived; In work shows no archived sessions`, 409);
    }
    const directory = asNonEmptyString(session?.location?.directory) || '';
    const { changed } = await updateSessionMetadata(sessionID, (metadata) => userStatePatch(metadata, { state, now: now() }), { directory });
    return { sessionId: sessionID, directory, title: asNonEmptyString(session?.title), inWork: state === 'open', changed };
  };

  // The message list is cursor-paginated and `order: 'desc'` puts the newest
  // messages in the page, so a single call returns only the recent tail.
  // `all: true` walks `cursor.next` until the history is exhausted; a bounded
  // `limit` stops once enough text messages are collected. Later pages carry
  // the order inside the cursor, and OpenCode rejects a cursor combined with
  // `order`, so only the first page sends it. An empty page or a repeated
  // cursor ends the walk. `extractTextMessages` sorts the gathered records
  // oldest-first for the caller.
  const MESSAGE_PAGE_LIMIT = 200;
  const sessionMessages = async (client, sessionID, role, limit) => {
    const fetchLimit = limit === undefined ? undefined : Math.max(100, limit * 4);
    const collected = [];
    const seenCursors = new Set();
    let cursor;
    for (;;) {
      const response = await client.message.list({
        sessionID,
        limit: fetchLimit ?? MESSAGE_PAGE_LIMIT,
        ...(cursor ? { cursor } : fetchLimit ? { order: 'desc' } : {}),
      });
      const raw = Array.isArray(response?.data) ? response.data : [];
      collected.push(...raw);
      const next = asNonEmptyString(response?.cursor?.next);
      if (!next || raw.length === 0 || seenCursors.has(next)) break;
      // A bounded read only needs enough pages to project `limit` text messages.
      if (limit !== undefined && extractTextMessages(collected, role).length >= limit) break;
      seenCursors.add(next);
      cursor = next;
    }
    const messages = extractTextMessages(collected, role);
    return limit === undefined ? messages : messages.slice(-limit);
  };

  const waitForIdle = async ({ client, sessionID, directory, timeoutMs, requireActivity, baselineMessageID, startedAt, signal }) => {
    const deadline = now() + timeoutMs;
    let observedActivity = false;
    while (true) {
      if (signal?.aborted) throw new OpenChamberControlError('OpenChamber action was cancelled', 499);
      const status = await sessionStatus(client, sessionID);
      // Only the user can move this session on, so the caller hears it now.
      if (status.type === 'waiting') return status;
      if (status.type === 'busy') {
        observedActivity = true;
      } else if (!requireActivity || observedActivity) {
        return status;
      } else {
        const messages = await sessionMessages(client, sessionID, 'assistant', 1);
        const message = messages[0];
        if (message?.completedAt && (baselineMessageID ? message.id !== baselineMessageID : message.completedAt >= startedAt)) {
          return status;
        }
      }
      const remaining = deadline - now();
      if (remaining <= 0) {
        throw new OpenChamberControlError(`Session did not become idle within ${Math.ceil(timeoutMs / 1000)} seconds`, 500);
      }
      await wait(Math.min(WAIT_POLL_INTERVAL_MS, remaining), signal);
    }
  };

  // session.send/fork default the directory to the caller's context directory,
  // which is wrong for sessions living in other worktrees: the prompt then
  // targets an instance that does not hold the session and the run dies with
  // UnknownError. Resolve the target session's directory from the global
  // session list when the caller did not scope explicitly.
  const resolveSessionDirectory = async (sessionID) => {
    try {
      const client = await getClient();
      const seenCursors = new Set();
      let cursor;
      for (;;) {
        const response = await client.session.list(cursor ? { cursor } : {});
        const sessions = Array.isArray(response?.data) ? response.data : [];
        const session = sessions.find((item) => item?.id === sessionID);
        if (session) return asNonEmptyString(session?.location?.directory) || null;
        const next = asNonEmptyString(response?.cursor?.next);
        if (!next || seenCursors.has(next)) return null;
        seenCursors.add(next);
        cursor = next;
      }
    } catch {
      return null;
    }
  };

  // An extension's service acts on a session for the user (`../guests/service-host-api.js`):
  // the stop button, a permission card, a form. Each goes to the instance of the
  // session's own directory, since one sent elsewhere answers nothing and still succeeds.
  const sessionClient = async (sessionID) => {
    const directory = await resolveSessionDirectory(sessionID);
    if (!directory) throw new OpenChamberControlError(`Session not found: ${sessionID}`, 404);
    return getClient(directory);
  };

  const GONE_TAGS = new Set(['SessionNotFoundError', 'PermissionNotFoundError', 'FormNotFoundError', 'FormAlreadySettledError']);
  const asAnswerError = (error) => {
    if (GONE_TAGS.has(error?._tag)) return new OpenChamberControlError('This request is no longer waiting for an answer', 404);
    if (error?._tag === 'FormInvalidAnswerError' || error?._tag === 'InvalidRequestError') {
      return new OpenChamberControlError(`OpenCode refused the answer: ${error.message || error._tag}`, 400);
    }
    return asControlError(error, 'OpenCode did not take the answer');
  };

  const stopSession = async (sessionID) => {
    const client = await sessionClient(sessionID);
    try {
      const result = await client.session.interrupt({ sessionID });
      return result?.interrupted === true;
    } catch (error) {
      throw asAnswerError(error);
    }
  };

  const answerPermission = async ({ sessionID, requestID, decision, message }) => {
    const client = await sessionClient(sessionID);
    try {
      await client.permission.reply({ sessionID, requestID, decision, ...(message ? { message } : {}) });
    } catch (error) {
      throw asAnswerError(error);
    }
  };

  /** `answer` replies; `null` dismisses the form, as the composer does when the user writes instead. */
  const answerForm = async ({ sessionID, formID, answer, message }) => {
    const client = await sessionClient(sessionID);
    try {
      if (!answer) {
        await client.session.form.cancel({ sessionID, formID, ...(message ? { message } : {}) });
        return;
      }
      const form = await client.session.form.get({ sessionID, formID });
      await client.session.form.reply({ sessionID, formID, answer: completeFormAnswer(form?.fields, answer) });
    } catch (error) {
      throw asAnswerError(error);
    }
  };

  /**
   * A message the user writes while a form waits dismisses the form first, as
   * the composer does: OpenCode holds a prompt until the form settles, so the
   * message would otherwise wait behind a form nobody answers. The list comes
   * from OpenCode, since this server's pending map is empty after a restart.
   */
  const dismissOpenForms = async (sessionID) => {
    const client = await sessionClient(sessionID);
    let forms;
    try {
      forms = await client.session.form.list({ sessionID });
    } catch (error) {
      throw asAnswerError(error);
    }
    for (const form of Array.isArray(forms) ? forms : []) {
      if (!asNonEmptyString(form?.id) || (form.state && form.state.status !== 'pending')) continue;
      try {
        await client.session.form.cancel({ sessionID, formID: form.id });
      } catch (error) {
        // Answered meanwhile, elsewhere: nothing left to dismiss.
        if (!GONE_TAGS.has(error?._tag)) throw asAnswerError(error);
      }
    }
  };

  // Checked before anything is created or sent: a result nobody can deliver
  // must fail the call, not leave a dispatched session the agent waits on.
  const assertReturnResult = (action, input, parentSessionID) => {
    if (input.wait === true) throw new OpenChamberControlError('returnResult cannot be combined with wait', 400);
    if (!dispatchResults) throw new OpenChamberControlError('Returning a session result is not available on this server', 503);
    if (!parentSessionID) throw new OpenChamberControlError('returnResult needs a calling session to deliver the result to', 400);
    if (!asNonEmptyString(input.prompt)) throw new OpenChamberControlError('returnResult requires prompt', 400);
    // A fork is a new session, so only a send can target the caller itself.
    if (action === 'session.send' && asNonEmptyString(input.sessionId) === parentSessionID) {
      throw new OpenChamberControlError('returnResult cannot deliver a session\'s result to itself', 400);
    }
  };

  // What the agent is told when its result is on the way. It replaces a wait,
  // so it has to stop the agent from building one out of polls or sleeps.
  const RESULT_PENDING_NOTE = 'The session runs in the background. Its final answer will be delivered to you automatically as a message when it finishes, and you will continue from there. Do not poll, sleep, or call session.messages to wait for it; carry on with other work or end your turn.';

  /**
   * After the dispatch: the session is already running, so a failure here is
   * reported in the result rather than thrown, and the agent is told plainly
   * that no answer is coming instead of waiting for one.
   */
  const scheduleResultDelivery = async (result, parentSessionID, dispatchedAt) => {
    // The newest end-of-run record before the prompt went out (null: none yet).
    // Absent when the history could not be read; the runtime then compares times.
    const afterIdleId = result.baselineIdleRecordId;
    if (result.promptDispatched !== true) {
      return { status: 'not-scheduled', reason: 'The prompt was not dispatched, so there is no result to return.' };
    }
    try {
      await dispatchResults.register({
        parentSessionId: parentSessionID,
        sessionId: result.sessionId,
        dispatchedAt,
        ...(afterIdleId !== undefined ? { afterIdleId } : {}),
      });
      return { status: 'pending', note: RESULT_PENDING_NOTE };
    } catch (error) {
      return {
        status: 'not-scheduled',
        reason: `The session runs, but its result will not be delivered: ${error instanceof Error ? error.message : String(error)}. Read it later with session.messages if the user asks.`,
      };
    }
  };

  const executeSessionAction = async (action, input, contextDirectory, signal, contextSessionId, startedByExtension) => {
    // The tool path forwards raw JSON, so a boolean parameter can arrive as the
    // string "true". Both of these are compared with `=== true` below, which
    // would read a string as false and silently drop the behavior: a dispatch
    // whose result is never delivered, or a call that returns before the turn
    // it asked to wait for. Reject a non-boolean loudly instead.
    if (input.wait !== undefined && !isBoolean(input.wait)) {
      throw new OpenChamberControlError('wait must be a boolean', 400);
    }
    if (input.returnResult !== undefined && !isBoolean(input.returnResult)) {
      throw new OpenChamberControlError('returnResult must be a boolean', 400);
    }
    if (input.timeout !== undefined && input.wait !== true) throw new OpenChamberControlError('timeout requires wait', 400);
    if (input.lastAssistant === true && input.wait !== true) throw new OpenChamberControlError('lastAssistant requires wait', 400);
    assertSingleScope(input);
    // Only a new session gets a worktree; elsewhere the number would be ignored.
    if (input.pullRequest !== undefined && action !== 'session.create') {
      throw new OpenChamberControlError('pullRequest applies only to session.create', 400);
    }
    const sessionID = asNonEmptyString(input.sessionId);
    const parentSessionID = asNonEmptyString(contextSessionId);
    const returnResult = input.returnResult === true;
    if (returnResult) assertReturnResult(action, input, parentSessionID);
    let directory = asNonEmptyString(input.directory) || (!input.projectId ? asNonEmptyString(contextDirectory) : null);
    if (sessionID && action !== 'session.create' && !asNonEmptyString(input.directory) && !input.projectId) {
      const resolvedSessionDirectory = await resolveSessionDirectory(sessionID);
      if (resolvedSessionDirectory) directory = resolvedSessionDirectory;
    }
    const payload = {
      ...(directory ? { directory } : {}),
      ...(asNonEmptyString(input.projectId) ? { projectId: input.projectId.trim() } : {}),
      ...(asNonEmptyString(input.title) ? { title: input.title.trim() } : {}),
      ...(asNonEmptyString(input.prompt) ? { prompt: input.prompt.trim() } : {}),
      ...(asNonEmptyString(input.model) ? { model: input.model.trim() } : {}),
      ...(asNonEmptyString(input.agent) ? { agent: input.agent.trim() } : {}),
      ...(asNonEmptyString(input.variant) ? { variant: input.variant.trim() } : {}),
      ...(input.goal === true ? { goal: true } : {}),
      ...(input.goalTokenBudget !== undefined ? { goalTokenBudget: input.goalTokenBudget } : {}),
      ...(asNonEmptyString(input.worktree) ? { worktree: {
        name: input.worktree.trim(),
        ...(asNonEmptyString(input.branch) ? { branchName: input.branch.trim() } : {}),
        ...(asNonEmptyString(input.startRef) ? { startRef: input.startRef.trim() } : {}),
      } } : {}),
      ...(typeof input.setUpstream === 'boolean' ? { setUpstream: input.setUpstream } : {}),
      ...(asNonEmptyString(input.messageId) ? { messageId: input.messageId.trim() } : {}),
    };
    // A pull request makes a worktree of its own, so its branch name (and a
    // start ref the session service refuses) travel without a worktree name.
    if (input.pullRequest !== undefined) {
      payload.pullRequest = input.pullRequest;
      if (!payload.worktree) {
        payload.worktree = {};
        if (asNonEmptyString(input.branch)) payload.worktree.branchName = input.branch.trim();
        if (asNonEmptyString(input.startRef)) payload.worktree.startRef = input.startRef.trim();
      }
    }
    // The prompt's message names the session whose agent sent it, so the
    // receiving transcript can link back. A session prompting itself has
    // nothing to link to.
    if (parentSessionID && !(action === 'session.send' && sessionID === parentSessionID)) {
      payload.promptedBySessionId = parentSessionID;
    }
    const startedAt = now();
    let result;
    if (action === 'session.create') {
      result = await sessionService.create(payload, ...(startedByExtension ? [{ startedByExtension }] : []));
    } else {
      if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
      if (action === 'session.send') {
        result = await sessionService.send(sessionID, payload);
      } else {
        result = await sessionService.fork(sessionID, payload);
      }
    }
    if (returnResult) {
      const publicResult = { ...result, resultDelivery: await scheduleResultDelivery(result, parentSessionID, startedAt) };
      delete publicResult.baselineAssistantMessageId;
      delete publicResult.baselineIdleRecordId;
      return publicResult;
    }
    if (input.wait !== true) {
      const publicResult = { ...result };
      delete publicResult.baselineAssistantMessageId;
      delete publicResult.baselineIdleRecordId;
      return publicResult;
    }
    const client = await getClient(result.directory);
    const status = await waitForIdle({
      client,
      sessionID: result.sessionId,
      directory: result.directory,
      timeoutMs: normalizeWaitTimeoutMs(input.timeout),
      requireActivity: result.promptDispatched === true,
      baselineMessageID: result.baselineAssistantMessageId,
      startedAt,
      signal,
    });
    const publicResult = { ...result, sessionStatus: status };
    delete publicResult.baselineAssistantMessageId;
    delete publicResult.baselineIdleRecordId;
    if (input.lastAssistant === true) {
      publicResult.lastAssistantMessage = (await sessionMessages(client, result.sessionId, 'assistant', 1))[0] || null;
    }
    return publicResult;
  };

  /**
   * Validates browser inputs here rather than in the renderer: an invalid call
   * should come back as a usage error the agent can correct, without waking a
   * client or waiting for a round trip.
   */
  const browserAction = async (action, input, signal, contextDirectory, contextSessionId) => {
    const parameters = {};
    // Any action may name a tab; the browser that issued the id resolves it.
    const tabId = asNonEmptyString(input.tabId);
    if (tabId) {
      if (tabId.length > 128) throw new OpenChamberControlError('tabId must be an id from browser.snapshot tabs', 400);
      parameters.tabId = tabId;
    }

    const readViewport = (required) => {
      const viewport = asNonEmptyString(input.viewport);
      if (!viewport) {
        if (required) throw new OpenChamberControlError('viewport is required for browser.resize', 400);
        return;
      }
      if (!['mobile', 'tablet', 'desktop', 'fill'].includes(viewport)) {
        throw new OpenChamberControlError('viewport must be mobile, tablet, desktop, or fill', 400);
      }
      parameters.viewport = viewport;
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
      let parsed;
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
      if (typeof input.value !== 'string') {
        throw new OpenChamberControlError('value is required for browser.type', 400);
      }
      parameters.selector = selector;
      parameters.value = input.value;
      parameters.submit = input.submit === true;
    }

    if (action === 'browser.select') {
      const selector = asNonEmptyString(input.selector);
      if (!selector) throw new OpenChamberControlError('selector is required for browser.select', 400);
      const hasLabel = typeof input.label === 'string';
      const hasValue = typeof input.value === 'string';
      if (hasLabel === hasValue) {
        throw new OpenChamberControlError('browser.select requires exactly one of label or value', 400);
      }
      parameters.selector = selector;
      if (hasLabel) parameters.label = input.label;
      else parameters.value = input.value;
    }

    if (action === 'browser.scroll') {
      const selector = asNonEmptyString(input.selector);
      const direction = asNonEmptyString(input.direction);
      if (!selector && !direction) {
        throw new OpenChamberControlError('browser.scroll requires direction or selector', 400);
      }
      if (direction && !['up', 'down', 'top', 'bottom'].includes(direction)) {
        throw new OpenChamberControlError('direction must be up, down, top, or bottom', 400);
      }
      if (selector) parameters.selector = selector;
      if (direction) parameters.direction = direction;
    }

    // Opening a page waits for the navigation to settle, so its budget has to
    // exceed the client's own wait; sharing one timeout with the quick actions
    // made a slow page indistinguishable from an unreachable browser.
    const timeoutMs = action === 'browser.open' ? 45_000 : 20_000;
    // Where the call came from, for a provider that keeps one browser per
    // project or chat. Filled by the tool plugin, never by the model.
    const context = {
      directory: asNonEmptyString(contextDirectory),
      sessionId: asNonEmptyString(contextSessionId),
    };
    const result = await browserControl.request(action, parameters, { signal, timeoutMs, context });

    // The image is written here rather than in the renderer: the file belongs
    // beside the code it documents, and the client that took it may be on a
    // different machine than the repository.
    if (action === 'browser.capture') {
      const directory = asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory);
      if (!directory) {
        throw new OpenChamberControlError('directory is required to save a screenshot', 400);
      }
      const capture = result && typeof result === 'object' ? result : {};
      const saved = await writeScreenshot({
        directory,
        base64: capture.base64,
        mime: capture.mime,
        label: input.label,
      });
      // The base64 never goes back to the caller: it is large, and the path is
      // what an answer, a commit, or a review can actually use.
      return {
        path: saved.path,
        // Saving the file is only half of showing it. Chat collects the image
        // paths written in a finished answer and renders them below it, so the
        // agent is told the one thing it cannot infer: that writing the path is
        // what puts the picture in front of the user.
        hint: `Write ![](${saved.path}) in your reply to show this image to the user; it is rendered under your message.`,
        url: capture.url ?? null,
        title: capture.title ?? null,
        viewport: capture.viewport ?? null,
        width: capture.width ?? null,
        height: capture.height ?? null,
      };
    }

    return result;
  };

  const execute = async (action, input = {}, contextDirectory, options = {}) => {
    try {
      if (!CONTROL_ACTIONS.has(action)) {
        throw new OpenChamberControlError(`Unsupported OpenChamber action: ${action || 'missing'}`, 400);
      }
      if (OPENCHAMBER_KNOWLEDGE_ACTIONS.includes(action)) {
        return await knowledgeActions.execute(action, input, contextDirectory, options.contextSessionId);
      }
      if (action.startsWith('memory.')) {
        if (!agentMemoryActions) {
          throw new OpenChamberControlError('Agent memory is not available on this server', 503);
        }
        return agentMemoryActions.execute(action, input, contextDirectory);
      }
      if (action.startsWith('browser.')) {
        if (!browserControl) {
          throw new OpenChamberControlError('The in-app browser is not available on this server', 503);
        }
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
          throw new OpenChamberControlError(result.body.error, result.status);
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
      if (action === 'render.page') {
        return await renderPage(input, {
          sessionId: asNonEmptyString(options.contextSessionId),
          callId: asNonEmptyString(options.contextCallId),
          directory: asNonEmptyString(contextDirectory),
          signal: options.signal,
        });
      }
      if (action === 'image.generate') {
        return await generateImage(input, { directory: asNonEmptyString(contextDirectory), signal: options.signal });
      }
      if (action === 'usage.read') {
        if (!readUsage) throw new OpenChamberControlError('Usage is not available on this server', 503);
        return await readUsage(input, { signal: options.signal });
      }
      if (action === 'secret.request') {
        return await secretRequests.request(input, {
          sessionId: asNonEmptyString(options.contextSessionId),
          callId: asNonEmptyString(options.contextCallId),
          directory: asNonEmptyString(contextDirectory),
          signal: options.signal,
        });
      }
      if (action === 'secret.run') {
        return await secretRequests.run(input, {
          sessionId: asNonEmptyString(options.contextSessionId),
          callId: asNonEmptyString(options.contextCallId),
          directory: asNonEmptyString(contextDirectory),
          signal: options.signal,
          authorized: options.secretRunAuthorized === true,
        });
      }
      if (action === 'secret.forget') {
        return await secretRequests.forget(asNonEmptyString(options.contextSessionId));
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
      if (action === 'projects.list') return { projects: await projects() };
      if (action === 'models.list') return models();
      if (action === 'models.search') return searchModels(input, contextDirectory);
      if (action === 'schedule.status') return scheduledTaskService.status();
      if (action.startsWith('schedule.')) {
        const taskID = asNonEmptyString(input.taskId);
        if (SCHEDULE_TASK_ID_ACTIONS.has(action) && !taskID) {
          throw new OpenChamberControlError('taskId is required', 400);
        }
        const explicitProjectID = asNonEmptyString(input.projectId);
        const explicitDirectory = asNonEmptyString(input.directory);
        const contextDirectoryFallback = explicitProjectID
          ? undefined
          : asNonEmptyString(contextDirectory) || undefined;
        const projectID = await scheduledTaskService.resolveProjectID({
          projectId: explicitProjectID || undefined,
          directory: explicitDirectory || contextDirectoryFallback,
        });
        switch (action) {
          case 'schedule.list':
            return { scheduler: await scheduledTaskService.status(), tasks: await scheduledTaskService.list(projectID) };
          case 'schedule.create': {
            const task = buildScheduledTask(input);
            const result = await scheduledTaskService.upsert(projectID, task);
            return { task: result.task, created: result.created };
          }
          case 'schedule.update': {
            const existing = (await scheduledTaskService.list(projectID)).find((task) => task.id === taskID);
            if (!existing) throw new OpenChamberControlError(`Scheduled task not found: ${taskID}`, 404);
            const task = patchScheduledTask(existing, input);
            const result = await scheduledTaskService.upsert(projectID, task);
            return { task: result.task, updated: true };
          }
          case 'schedule.run':
            return scheduledTaskService.run(projectID, taskID);
          case 'schedule.delete':
            return { deleted: true, tasks: await scheduledTaskService.remove(projectID, taskID) };
          case 'schedule.toggle': {
            if (typeof input.disabled !== 'boolean') {
              throw new OpenChamberControlError('disabled is required for schedule.toggle', 400);
            }
            const task = await scheduledTaskService.setEnabled(projectID, taskID, input.disabled === false);
            // What was saved, which is what the scheduler acts on.
            return { task, enabled: task?.enabled === true };
          }
        }
      }
      if (action === 'session.create' || action === 'session.send' || action === 'session.fork') {
        return executeSessionAction(action, input, contextDirectory, options.signal, options.contextSessionId, options.startedByExtension);
      }
      if (action === 'session.link') {
        if (!sessionLinks) throw new OpenChamberControlError('Linking is not available on this server', 503);
        assertSingleScope(input);
        // An explicit session is linked where it lives; the calling session
        // uses the directory the tool call came from.
        const explicitSessionID = asNonEmptyString(input.sessionId);
        const sessionID = explicitSessionID || asNonEmptyString(options.contextSessionId);
        const directory = asNonEmptyString(input.directory)
          || (explicitSessionID ? await resolveSessionDirectory(explicitSessionID) : null)
          || asNonEmptyString(contextDirectory);
        // Models put the link's fields beside the action as often as inside
        // `link`; session.link has no other use for them, so both are read.
        const link = input.link ?? { url: input.url, title: input.title, kind: input.kind, identifier: input.identifier };
        return sessionLinks.link({ sessionId: sessionID, directory, link });
      }
      if (action === 'pr.watch' || action === 'pr.unwatch') {
        if (!prWatch) throw new OpenChamberControlError('Waiting on a pull request is not available on this server', 503);
        // Always the calling session: it is the one a change wakes.
        const sessionID = asNonEmptyString(options.contextSessionId);
        if (!sessionID) throw new OpenChamberControlError(`${action} must be called from a session`, 400);
        try {
          if (action === 'pr.unwatch') return await prWatch.unwatch(sessionID);
          const directory = (await resolveSessionDirectory(sessionID)) || asNonEmptyString(contextDirectory);
          return await prWatch.watch({ sessionID, directory, url: input.url });
        } catch (error) {
          throw new OpenChamberControlError(error?.message ?? String(error), Number.isInteger(error?.status) ? error.status : 500);
        }
      }
      if (action === 'work.name') {
        if (!workNamer) throw new OpenChamberControlError('Naming tasks is not available on this server', 503);
        const sessionID = asNonEmptyString(input.sessionId) || asNonEmptyString(options.contextSessionId);
        return workNamer.name({ sessionId: sessionID, title: input.title, branch: input.branch });
      }
      if (action === 'session.moveToWorktree') {
        assertSingleScope(input);
        // The calling session by default: the agent moves its own work.
        const explicitSessionID = asNonEmptyString(input.sessionId);
        const sessionID = explicitSessionID || asNonEmptyString(options.contextSessionId);
        if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
        // Where the session lives now, which is where the changes are taken
        // from; never a directory of the caller's choosing, so the action
        // cannot carry away another checkout's changes.
        const directory = (await resolveSessionDirectory(sessionID)) || asNonEmptyString(contextDirectory);
        const worktree = { name: asNonEmptyString(input.worktree)?.trim() };
        const branch = asNonEmptyString(input.branch);
        if (branch) worktree.branchName = branch.trim();
        const startRef = asNonEmptyString(input.startRef);
        if (startRef) worktree.startRef = startRef.trim();
        const existingBranch = asNonEmptyString(input.existingBranch);
        if (existingBranch) worktree.existingBranch = existingBranch.trim();
        const payload = { worktree };
        if (directory) payload.directory = directory;
        if (input.carry !== undefined) payload.carry = input.carry;
        const moved = await sessionService.moveToWorktree(sessionID, payload);
        // A new branch takes the task's name along; an existing branch keeps its own.
        if (workNamer && !existingBranch && moved?.worktree?.path) {
          await workNamer.carryToWorktree({ sessionId: sessionID, worktree: moved.worktree.path })
            .catch((error) => console.warn('Failed to carry the task name into the new worktree:', error instanceof Error ? error.message : String(error)));
        }
        return moved;
      }
      if (action === 'session.markDone' || action === 'session.track') {
        return setWorkState(input, options.contextSessionId, action === 'session.track' ? 'open' : 'done');
      }
      if (action === 'session.list') return listSessions(input, contextDirectory);
      if (action.startsWith('session.')) {
        const sessionID = asNonEmptyString(input.sessionId);
        if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
        const directory = await resolveReadDirectory(input, contextDirectory);
        const client = await getClient(directory);
        if (!directory) throw new OpenChamberControlError('directory is required', 400);
        if (action === 'session.status') {
          await assertSessionExists(client, sessionID);
          return { sessionId: sessionID, directory, sessionStatus: await sessionStatus(client, sessionID) };
        }
        if (action === 'session.messages') {
          if (input.timeout !== undefined && input.wait !== true) throw new OpenChamberControlError('timeout requires wait', 400);
          const role = input.lastAssistant === true ? 'assistant' : (asNonEmptyString(input.role) || 'all');
          if (!['all', 'user', 'assistant'].includes(role)) throw new OpenChamberControlError('role must be all, user, or assistant', 400);
          const last = input.last === true || input.lastAssistant === true;
          if (input.all === true && (last || input.limit !== undefined)) throw new OpenChamberControlError('all cannot be combined with last or limit', 400);
          if (last && input.limit !== undefined) throw new OpenChamberControlError('last cannot be combined with limit', 400);
          await assertSessionExists(client, sessionID);
          const currentStatus = input.wait === true
            ? await waitForIdle({ client, sessionID, directory, timeoutMs: normalizeWaitTimeoutMs(input.timeout), requireActivity: false, startedAt: now(), signal: options.signal })
            : await sessionStatus(client, sessionID);
          const limit = input.all === true ? undefined : (last ? 1 : positiveInteger(input.limit, 10, 'limit'));
          return { sessionId: sessionID, directory, role, sessionStatus: currentStatus, messages: await sessionMessages(client, sessionID, role, limit) };
        }
      }
      throw new OpenChamberControlError(`Unsupported OpenChamber action: ${action || 'missing'}`, 400);
    } catch (error) {
      throw asControlError(error, `Failed to execute ${action || 'OpenChamber action'}`);
    }
  };

  // The managed agent-tool plugin can no longer report the session's directory
  // (v2 dropped `context.directory` from a tool call), so it sends the session
  // id and the directory is resolved here, where it is authoritative.
  // `answerPage` is the chat's side of a page that waits (render.page with
  // awaitAnswer), `answerSecret` the chat's side of a secret.request card.
  const releaseAnswerWaits = (sessionId) => {
    pageAnswers.release(sessionId);
    secretRequests.release(sessionId);
  };
=======
  const listSessions = async (input: ControlInput, contextDirectory: ControlInput['directory']) => {
    assertSingleScope(input);
    const inWork = input.inWork === true;
    const busy = input.busy === true;
    const terms = (asNonEmptyString(input.query) ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const scoped = Boolean(asNonEmptyString(input.projectId) || asNonEmptyString(input.directory));
    const everywhere = (inWork || busy) && !scoped;
    const directory = everywhere ? null : await resolveReadDirectory(input, contextDirectory);
    const limit = positiveInteger(input.limit, inWork || busy ? null : 10, 'limit');
    const workEnabled = await isSessionWorkEnabled();
    if (inWork && !workEnabled) throw new OpenChamberControlError('In work is turned off in Settings', 409);

    const client = await getClient(directory ?? '');
    const wantStatus = busy || input.withStatus === true;
    const statuses = wantStatus ? await activeSessions(client).catch(() => null) : null;
    if (busy && !statuses) throw new OpenChamberControlError('Could not read which sessions are running', 503);
    const runningCount = busy ? Object.keys(statuses ?? {}).length : 0;

    const collected: ListedSession[] = [];
    const full = () => limit !== null && collected.length >= limit;
    const seenCursors = new Set();
    const seenSessionIds = new Set();
    let runningSeen = 0;
    let cursor;
    while (!(busy && runningSeen >= runningCount)) {
      const listInput: Mutable<SessionListInput> = {};
      if (directory) listInput.directory = directory;
      if (input.children !== true) listInput.parentID = null;
      if (inWork || busy || terms.length > 0) listInput.limit = FILTERED_PAGE_SIZE;
      if (cursor) listInput.cursor = cursor;
      const response = await client.session.list(listInput);
      const page = await Promise.all((Array.isArray(response?.data) ? response.data : []).map(withArchiveEntry));
      for (const record of page) {
        const id = asNonEmptyString(record?.id);
        if (isHiddenSession(id, record)) continue;
        if (input.children !== true && isListedAsChild(record)) continue;
        if (id) {
          if (seenSessionIds.has(id)) continue;
          seenSessionIds.add(id);
        }
        const running = Boolean(id && statuses?.[id]);
        if (running) runningSeen += 1;
        if (input.all !== true && record?.time?.archived) continue;
        if (busy && !running) continue;
        if (terms.length > 0) {
          const title = (asNonEmptyString(record?.title) ?? '').toLowerCase();
          if (!terms.every((term) => title.includes(term))) continue;
        }
        const session = listedSession(record, workEnabled ? workMembership : null);
        if (inWork && !session.inWork) continue;
        collected.push(session);
        if (full()) break;
      }
      if (full()) break;
      const next = asNonEmptyString(response?.cursor?.next);
      if (!next || page.length === 0 || seenCursors.has(next)) break;
      seenCursors.add(next);
      cursor = next;
    }

    const sessions = wantStatus
      ? await Promise.all(collected.map(async (session) => ({
        ...session,
        status: statuses ? await asPublicStatus(statuses, session.id) : { type: 'unknown' },
      })))
      : collected;
    return { sessions, limit, directory, archived: input.all === true ? 'included' : 'excluded' };
  };

  const setWorkState = async (input: ControlInput, contextSessionId: string | undefined, state: 'open' | 'done') => {
    if (!updateSessionMetadata) throw new OpenChamberControlError('Changing In work is not available on this server', 503);
    if (!(await isSessionWorkEnabled())) throw new OpenChamberControlError('In work is turned off in Settings', 409);
    const sessionID = asNonEmptyString(input.sessionId) || asNonEmptyString(contextSessionId);
    if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
    const session = await withArchiveEntry(await assertSessionExists(await getClient(), sessionID));
    if (state === 'open' && !workMembership.canBeInWork(session)) {
      throw new OpenChamberControlError(`${sessionID} cannot be in work: subsessions, Chats, reviews, /btw questions and scheduled runs never are`, 400);
    }
    if (state === 'open' && session?.time?.archived) {
      throw new OpenChamberControlError(`${sessionID} is archived; In work shows no archived sessions`, 409);
    }
    const directory = asNonEmptyString(session?.location?.directory) || '';
    if (state === 'open' && (isPinnedMetadata(session?.metadata) || (directory && await isWorktreePinned(directory)))) {
      throw new OpenChamberControlError(`${sessionID} is pinned, or its worktree is; a pinned session is never in work`, 409);
    }
    const { changed } = await updateSessionMetadata(sessionID, (metadata) => userStatePatch(metadata, { state, now: now() }), { directory });
    return { sessionId: sessionID, directory, title: asNonEmptyString(session?.title), inWork: state === 'open', changed };
  };

  const MESSAGE_PAGE_LIMIT = 200;
  const sessionMessages = async (client: ControlClient, sessionID: string, role: string, limit: number | undefined) => {
    const fetchLimit = limit === undefined ? undefined : Math.max(100, limit * 4);
    const collected: MessageRecord[] = [];
    const seenCursors = new Set();
    let cursor;
    for (;;) {
      const response = await client.message.list({
        sessionID,
        limit: fetchLimit ?? MESSAGE_PAGE_LIMIT,
        ...(cursor ? { cursor } : fetchLimit ? { order: 'desc' } : {}),
      });
      const raw = Array.isArray(response?.data) ? response.data : [];
      collected.push(...raw);
      const next = asNonEmptyString(response?.cursor?.next);
      if (!next || raw.length === 0 || seenCursors.has(next)) break;
      if (limit !== undefined && extractTextMessages(collected, role).length >= limit) break;
      seenCursors.add(next);
      cursor = next;
    }
    const messages = extractTextMessages(collected, role);
    return limit === undefined ? messages : messages.slice(-limit);
  };

  const waitForIdle = async ({ client, sessionID, timeoutMs, requireActivity, baselineMessageID, startedAt, signal }: { client: ControlClient; sessionID: string; directory: string; timeoutMs: number; requireActivity: boolean; baselineMessageID?: string | undefined; startedAt: number; signal: AbortSignal | undefined }) => {
    const deadline = now() + timeoutMs;
    let observedActivity = false;
    while (true) {
      if (signal?.aborted) throw new OpenChamberControlError('OpenChamber action was cancelled', 499);
      const status = await sessionStatus(client, sessionID);
      if (status.type === 'waiting') return status;
      if (status.type === 'busy') {
        observedActivity = true;
      } else if (!requireActivity || observedActivity) {
        return status;
      } else {
        const messages = await sessionMessages(client, sessionID, 'assistant', 1);
        const message = messages[0];
        if (message?.completedAt && (baselineMessageID ? message.id !== baselineMessageID : message.completedAt >= startedAt)) {
          return status;
        }
      }
      const remaining = deadline - now();
      if (remaining <= 0) {
        throw new OpenChamberControlError(`Session did not become idle within ${Math.ceil(timeoutMs / 1000)} seconds`, 500);
      }
      await wait(Math.min(WAIT_POLL_INTERVAL_MS, remaining), signal);
    }
  };

  const resolveSessionDirectory = async (sessionID: string) => {
    try {
      const client = await getClient();
      let detail: ControlSession | null = null;
      try {
        detail = await client.session.get({ sessionID }).catch(() => null);
      } catch {
        detail = null;
      }
      const direct = asNonEmptyString(detail?.location?.directory) || asNonEmptyString(detail?.directory);
      if (direct) return direct;

      const seenCursors = new Set();
      let cursor;
      for (;;) {
        const response = await client.session.list(cursor ? { cursor } : {});
        const sessions = Array.isArray(response?.data) ? response.data : [];
        const session = sessions.find((item) => item?.id === sessionID);
        if (session) return asNonEmptyString(session?.location?.directory) || null;
        const next = asNonEmptyString(response?.cursor?.next);
        if (!next || seenCursors.has(next)) return null;
        seenCursors.add(next);
        cursor = next;
      }
    } catch {
      return null;
    }
  };

  const sessionClient = async (sessionID: string) => {
    const directory = await resolveSessionDirectory(sessionID);
    if (!directory) throw new OpenChamberControlError(`Session not found: ${sessionID}`, 404);
    return getClient(directory);
  };

  const GONE_TAGS = new Set(['SessionNotFoundError', 'PermissionNotFoundError', 'FormNotFoundError', 'FormAlreadySettledError']);
  const isGoneTag = (value: ControlErrorFields['_tag']): value is string => isText(value) && GONE_TAGS.has(value);
  const asAnswerError = (error: Parameters<typeof controlErrorFields>[0]) => {
    const fields = controlErrorFields(error);
    if (isGoneTag(fields?._tag)) return new OpenChamberControlError('This request is no longer waiting for an answer', 404);
    if (fields?._tag === 'FormInvalidAnswerError' || fields?._tag === 'InvalidRequestError') {
      return new OpenChamberControlError(`OpenCode refused the answer: ${fields.message || fields._tag}`, 400);
    }
    return asControlError(error, 'OpenCode did not take the answer');
  };

  const stopSession = async (sessionID: string) => {
    const client = await sessionClient(sessionID);
    try {
      const result = await client.session.interrupt({ sessionID });
      return result?.interrupted === true;
    } catch (error) {
      throw asAnswerError(error);
    }
  };

  const answerPermission = async ({ sessionID, requestID, decision, message }: PermissionReplyInput) => {
    const client = await sessionClient(sessionID);
    try {
      const reply: PermissionReply = { sessionID, requestID, decision };
      if (message) reply.message = message;
      await client.permission.reply(reply);
    } catch (error) {
      throw asAnswerError(error);
    }
  };

  const answerForm = async ({ sessionID, formID, answer, message }: { sessionID: string; formID: string; answer?: FormValues | null; message?: string | undefined }) => {
    const client = await sessionClient(sessionID);
    try {
      if (!answer) {
        const cancellation: FormCancellation = { sessionID, formID };
        if (message) cancellation.message = message;
        await client.session.form.cancel(cancellation);
        return;
      }
      const form = await client.session.form.get({ sessionID, formID });
      await client.session.form.reply({ sessionID, formID, answer: completeFormAnswer(form?.fields, answer) });
    } catch (error) {
      throw asAnswerError(error);
    }
  };

  const dismissOpenForms = async (sessionID: string) => {
    const client = await sessionClient(sessionID);
    let forms: (FormInfo & { state?: { status?: string } })[];
    try {
      forms = await client.session.form.list({ sessionID });
    } catch (error) {
      throw asAnswerError(error);
    }
    for (const form of Array.isArray(forms) ? forms : []) {
      if (!asNonEmptyString(form?.id) || (form.state && form.state.status !== 'pending')) continue;
      try {
        await client.session.form.cancel({ sessionID, formID: form.id });
      } catch (error) {
        if (!isGoneTag(controlErrorFields(error)?._tag)) throw asAnswerError(error);
      }
    }
  };

  const assertReturnResult = (action: string, input: ControlInput, parentSessionID: string | null) => {
    if (input.wait === true) throw new OpenChamberControlError('returnResult cannot be combined with wait', 400);
    if (!dispatchResults) throw new OpenChamberControlError('Returning a session result is not available on this server', 503);
    if (!parentSessionID) throw new OpenChamberControlError('returnResult needs a calling session to deliver the result to', 400);
    if (!asNonEmptyString(input.prompt)) throw new OpenChamberControlError('returnResult requires prompt', 400);
    if (action === 'session.send' && asNonEmptyString(input.sessionId) === parentSessionID) {
      throw new OpenChamberControlError('returnResult cannot deliver a session\'s result to itself', 400);
    }
    return { dispatchResults, parentSessionID };
  };

  const RESULT_PENDING_NOTE = 'The session runs in the background. Its final answer will be delivered to you automatically as a message when it finishes, and you will continue from there. Do not poll, sleep, or call session.messages to wait for it; carry on with other work or end your turn.';

  const scheduleResultDelivery = async (result: SessionActionResult, delivery: ReturnType<typeof assertReturnResult>, dispatchedAt: number) => {
    const { dispatchResults, parentSessionID } = delivery;
    const afterIdleId = result.baselineIdleRecordId;
    if (result.promptDispatched !== true) {
      return { status: 'not-scheduled', reason: 'The prompt was not dispatched, so there is no result to return.' };
    }
    try {
      const registration: Parameters<typeof dispatchResults.register>[0] = {
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

  const executeSessionAction = async (action: string, input: ControlInput, contextDirectory: ControlInput['directory'], signal: AbortSignal | undefined, contextSessionId: string | undefined, startedByExtension: string | undefined) => {
    for (const name of ['wait', 'returnResult', 'ownWork'] as const) {
      if (input[name] !== undefined && !isBoolean(input[name])) throw new OpenChamberControlError(`${name} must be a boolean`, 400);
    }
    if (input.timeout !== undefined && input.wait !== true) throw new OpenChamberControlError('timeout requires wait', 400);
    if (input.lastAssistant === true && input.wait !== true) throw new OpenChamberControlError('lastAssistant requires wait', 400);
    assertSingleScope(input);
    if (input.pullRequest !== undefined && action !== 'session.create') {
      throw new OpenChamberControlError('pullRequest applies only to session.create', 400);
    }
    const sessionID = asNonEmptyString(input.sessionId);
    const parentSessionID = asNonEmptyString(contextSessionId);
    const ownWork = input.ownWork === true;
    if (ownWork && action !== 'session.create') throw new OpenChamberControlError('ownWork applies only to session.create', 400);
    if (ownWork && !parentSessionID) throw new OpenChamberControlError('ownWork needs a calling session to nest the new session under', 400);
    const returnResult = input.returnResult === true
      || (ownWork && input.returnResult === undefined && input.wait !== true && Boolean(dispatchResults) && Boolean(asNonEmptyString(input.prompt)));
    const delivery = returnResult ? assertReturnResult(action, input, parentSessionID) : null;
    let directory = asNonEmptyString(input.directory) || (!input.projectId ? asNonEmptyString(contextDirectory) : null);
    if (sessionID && action !== 'session.create' && !asNonEmptyString(input.directory) && !input.projectId) {
      const resolvedSessionDirectory = await resolveSessionDirectory(sessionID);
      if (resolvedSessionDirectory) directory = resolvedSessionDirectory;
    }
    const payload: SessionPayload = {};
    if (directory) payload.directory = directory;
    if (hasText(input.projectId)) payload.projectId = input.projectId.trim();
    if (hasText(input.title)) payload.title = input.title.trim();
    if (hasText(input.prompt)) payload.prompt = input.prompt.trim();
    if (hasText(input.model)) payload.model = input.model.trim();
    if (hasText(input.agent)) payload.agent = input.agent.trim();
    if (hasText(input.variant)) payload.variant = input.variant.trim();
    if (input.goal === true) payload.goal = true;
    if (input.goalTokenBudget !== undefined) payload.goalTokenBudget = input.goalTokenBudget;
    if (hasText(input.worktree)) {
      payload.worktree = { name: input.worktree.trim() };
      if (hasText(input.branch)) payload.worktree.branchName = input.branch.trim();
      if (hasText(input.startRef)) payload.worktree.startRef = input.startRef.trim();
    }
    if (isBoolean(input.setUpstream)) payload.setUpstream = input.setUpstream;
    if (hasText(input.messageId)) payload.messageId = input.messageId.trim();
    if (input.pullRequest !== undefined) {
      payload.pullRequest = input.pullRequest;
      if (!payload.worktree) {
        payload.worktree = {};
        if (hasText(input.branch)) payload.worktree.branchName = input.branch.trim();
        if (hasText(input.startRef)) payload.worktree.startRef = input.startRef.trim();
      }
    }
    if (parentSessionID && !(action === 'session.send' && sessionID === parentSessionID)) {
      payload.promptedBySessionId = parentSessionID;
    }
    const startedAt = now();
    let result: SessionActionResult;
    if (action === 'session.create') {
      const createOptions: SessionCreateOptions = {};
      if (startedByExtension) createOptions.startedByExtension = startedByExtension;
      if (ownWork) createOptions.operatorParentId = parentSessionID;
      result = await sessionService.create(payload, ...(Object.keys(createOptions).length > 0 ? [createOptions] : []));
    } else {
      if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
      if (action === 'session.send') {
        result = await sessionService.send(sessionID, payload);
      } else {
        result = await sessionService.fork(sessionID, payload);
      }
    }
    if (delivery) {
      const publicResult = { ...result, resultDelivery: await scheduleResultDelivery(result, delivery, startedAt) };
      delete publicResult.baselineAssistantMessageId;
      delete publicResult.baselineIdleRecordId;
      return publicResult;
    }
    if (input.wait !== true) {
      const publicResult = { ...result };
      delete publicResult.baselineAssistantMessageId;
      delete publicResult.baselineIdleRecordId;
      return publicResult;
    }
    const client = await getClient(result.directory);
    const status = await waitForIdle({
      client,
      sessionID: result.sessionId,
      directory: result.directory,
      timeoutMs: normalizeWaitTimeoutMs(input.timeout),
      requireActivity: result.promptDispatched === true,
      baselineMessageID: result.baselineAssistantMessageId,
      startedAt,
      signal,
    });
    const publicResult: SessionActionResult & { sessionStatus: typeof status } = { ...result, sessionStatus: status };
    delete publicResult.baselineAssistantMessageId;
    delete publicResult.baselineIdleRecordId;
    if (input.lastAssistant === true) {
      publicResult.lastAssistantMessage = (await sessionMessages(client, result.sessionId, 'assistant', 1))[0] || null;
    }
    return publicResult;
  };

  const browserAction = async (browserControl: NonNullable<ControlDependencies['browserControl']>, action: string, input: ControlInput, signal: AbortSignal | undefined, contextDirectory: ControlInput['directory'], contextSessionId: string | undefined) => {
    const parameters: BrowserControlParameters = {};
    const tabId = asNonEmptyString(input.tabId);
    if (tabId) {
      if (tabId.length > 128) throw new OpenChamberControlError('tabId must be an id from browser.snapshot tabs', 400);
      parameters.tabId = tabId;
    }

    const readViewport = (required: boolean) => {
      const viewport = asNonEmptyString(input.viewport);
      if (!viewport) {
        if (required) throw new OpenChamberControlError('viewport is required for browser.resize', 400);
        return;
      }
      const isViewport = (value: string): value is NonNullable<BrowserControlParameters['viewport']> => ['mobile', 'tablet', 'desktop', 'fill'].includes(value);
      if (!isViewport(viewport)) {
        throw new OpenChamberControlError('viewport must be mobile, tablet, desktop, or fill', 400);
      }
      parameters.viewport = viewport;
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
      let parsed;
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

    const readTarget = ({ required, allowText = false, refKey = 'ref', selectorKey = 'selector' }: { required: boolean; allowText?: boolean; refKey?: 'ref' | 'to'; selectorKey?: 'selector' | 'toSelector' }) => {
      const ref = asNonEmptyString(input[refKey]);
      const selector = asNonEmptyString(input[selectorKey]);
      const text = allowText ? asNonEmptyString(input.text) : '';
      if (ref) {
        if (!/^e\d{1,6}$/.test(ref)) throw new OpenChamberControlError(`${refKey} must be a ref from browser.snapshot, such as e12`, 400);
        parameters[refKey] = ref;
      }
      if (selector) parameters[selectorKey] = selector;
      if (text) parameters.text = text;
      if (required && !ref && !selector && !text) {
        const names = allowText ? `${refKey}, ${selectorKey} or text` : `${refKey} or ${selectorKey}`;
        throw new OpenChamberControlError(`${action} requires ${names}`, 400);
      }
    };

    if (input.dialog !== undefined && action !== 'browser.dialog') {
      if (input.dialog !== 'accept' && input.dialog !== 'dismiss') {
        throw new OpenChamberControlError('dialog must be accept or dismiss', 400);
      }
      parameters.dialog = input.dialog;
    }

    if (action === 'browser.click' || action === 'browser.hover') readTarget({ required: true, allowText: true });

    if (action === 'browser.snapshot') {
      const selector = asNonEmptyString(input.selector);
      if (selector) parameters.selector = selector;
    }

    if (action === 'browser.inspect') readTarget({ required: true });

    if (action === 'browser.type') {
      readTarget({ required: true });
      if (!isText(input.value)) {
        throw new OpenChamberControlError('value is required for browser.type', 400);
      }
      parameters.value = input.value;
      parameters.submit = input.submit === true;
    }

    if (action === 'browser.select') {
      readTarget({ required: true });
      const hasLabel = isText(input.label);
      const hasValue = isText(input.value);
      if (hasLabel === hasValue) {
        throw new OpenChamberControlError('browser.select requires exactly one of label or value', 400);
      }
      if (hasLabel) parameters.label = input.label;
      else if (hasValue) parameters.value = input.value;
    }

    if (action === 'browser.scroll') {
      const direction = asNonEmptyString(input.direction);
      readTarget({ required: !direction });
      const isDirection = (value: string): value is NonNullable<BrowserControlParameters['direction']> => ['up', 'down', 'top', 'bottom'].includes(value);
      if (direction) {
        if (!isDirection(direction)) {
          throw new OpenChamberControlError('direction must be up, down, top, or bottom', 400);
        }
        parameters.direction = direction;
      }
    }

    if (action === 'browser.drag') {
      readTarget({ required: true });
      readTarget({ required: true, refKey: 'to', selectorKey: 'toSelector' });
    }

    if (action === 'browser.press') {
      const key = asNonEmptyString(input.key);
      if (!key || key.length > 40) throw new OpenChamberControlError('key is required, such as Enter, Escape, Tab or Meta+a', 400);
      parameters.key = key;
      readTarget({ required: false });
    }

    if (action === 'browser.dialog') {
      const answer = dialogAnswerSchema.safeParse(input);
      if (!answer.success) {
        throw new OpenChamberControlError('accept is required for browser.dialog: true to accept, false to dismiss', 400);
      }
      parameters.accept = answer.data.accept;
      if (answer.data.value !== undefined) parameters.value = answer.data.value;
    }

    if (action === 'browser.wait') {
      const text = asNonEmptyString(input.text);
      if (text) parameters.text = text;
      else readTarget({ required: true });
      if (input.gone === true) parameters.gone = true;
      if (input.timeoutMs !== undefined) {
        const timeout = Number(input.timeoutMs);
        if (!Number.isFinite(timeout) || timeout < 0) throw new OpenChamberControlError('timeoutMs must be a number of milliseconds', 400);
        parameters.timeoutMs = Math.min(15_000, Math.round(timeout));
      }
    }

    if (action === 'browser.upload') {
      readTarget({ required: true });
      if (!browserUploads) throw new OpenChamberControlError('Uploads are not available on this server', 503);
      let files;
      try {
        files = await resolveUploadFiles({ paths: input.paths, directory: asNonEmptyString(contextDirectory) });
      } catch (error) {
        if (error instanceof UploadRefusedError) throw new OpenChamberControlError(error.message, 400);
        throw error;
      }
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
      const isCapture = (value: unknown): value is { base64?: unknown; mime?: unknown; url?: unknown; title?: unknown; viewport?: unknown; width?: unknown; height?: unknown } => Boolean(value) && typeof value === 'object';
      const capture = isCapture(result) ? result : {};
      const saved = await writeScreenshot({
        directory,
        base64: capture.base64,
        mime: capture.mime,
        label: input.label,
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

    return result;
  };

  const execute = async (action: string, input: ControlInput = {}, contextDirectory?: ControlInput['directory'], options: ControlOptions = {}) => {
    try {
      if (!CONTROL_ACTIONS.has(action)) {
        throw new OpenChamberControlError(`Unsupported OpenChamber action: ${action || 'missing'}`, 400);
      }
      if (OPENCHAMBER_KNOWLEDGE_ACTIONS.includes(action)) {
        return await knowledgeActions.execute(action, input, contextDirectory, options.contextSessionId);
      }
      if (action.startsWith('memory.')) {
        if (!agentMemoryActions) {
          throw new OpenChamberControlError('Agent memory is not available on this server', 503);
        }
        return agentMemoryActions.execute(action, input, contextDirectory);
      }
      if (action.startsWith('browser.')) {
        if (!browserControl) {
          throw new OpenChamberControlError('The in-app browser is not available on this server', 503);
        }
        return browserAction(browserControl, action, input, options.signal, contextDirectory, options.contextSessionId);
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
          throw new OpenChamberControlError(result.body.error, result.status);
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
      if (action === 'render.page') {
        return await renderPage(input, {
          sessionId: asNonEmptyString(options.contextSessionId),
          callId: asNonEmptyString(options.contextCallId),
          directory: asNonEmptyString(contextDirectory),
          signal: options.signal,
        });
      }
      if (action === 'image.generate') {
        return await generateImage(input, { directory: asNonEmptyString(contextDirectory), signal: options.signal });
      }
      if (action === 'usage.read') {
        if (!readUsage) throw new OpenChamberControlError('Usage is not available on this server', 503);
        return await readUsage(input, { signal: options.signal });
      }
      if (action.startsWith('terminal.')) {
        return await readTerminal(action, input, contextDirectory);
      }
      if (action === 'secret.request') {
        return await secretRequests.request(input, {
          sessionId: asNonEmptyString(options.contextSessionId),
          callId: asNonEmptyString(options.contextCallId),
          directory: asNonEmptyString(contextDirectory),
          signal: options.signal,
        });
      }
      if (action === 'secret.run') {
        return await secretRequests.run(input, {
          sessionId: asNonEmptyString(options.contextSessionId),
          callId: asNonEmptyString(options.contextCallId),
          directory: asNonEmptyString(contextDirectory),
          signal: options.signal,
          authorized: options.secretRunAuthorized === true,
        });
      }
      if (action === 'secret.forget') {
        return await secretRequests.forget(asNonEmptyString(options.contextSessionId));
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
      if (action === 'projects.list') return { projects: await projects() };
      if (action === 'models.list') return models();
      if (action === 'models.search') return searchModels(input, contextDirectory);
      if (action === 'schedule.status') return scheduledTaskService.status();
      if (action.startsWith('schedule.')) {
        const taskID = asNonEmptyString(input.taskId);
        if (SCHEDULE_TASK_ID_ACTIONS.has(action) && !taskID) {
          throw new OpenChamberControlError('taskId is required', 400);
        }
        const explicitProjectID = asNonEmptyString(input.projectId);
        const explicitDirectory = asNonEmptyString(input.directory);
        const contextDirectoryFallback = explicitProjectID
          ? undefined
          : asNonEmptyString(contextDirectory) || undefined;
        const projectID = await scheduledTaskService.resolveProjectID({
          projectId: explicitProjectID || undefined,
          directory: explicitDirectory || contextDirectoryFallback,
        });
        switch (action) {
          case 'schedule.list':
            return { scheduler: await scheduledTaskService.status(), tasks: await scheduledTaskService.list(projectID) };
          case 'schedule.create': {
            const task = buildScheduledTask(input);
            const result = await scheduledTaskService.upsert(projectID, task);
            return { task: result.task, created: result.created };
          }
          case 'schedule.update': {
            const existing = (await scheduledTaskService.list(projectID)).find((task: ControlTask & { id: string }) => task.id === taskID);
            if (!existing) throw new OpenChamberControlError(`Scheduled task not found: ${taskID}`, 404);
            const task = patchScheduledTask(existing, input);
            const result = await scheduledTaskService.upsert(projectID, task);
            return { task: result.task, updated: true };
          }
          case 'schedule.run':
            return scheduledTaskService.run(projectID, taskID);
          case 'schedule.delete':
            return { deleted: true, tasks: await scheduledTaskService.remove(projectID, taskID) };
          case 'schedule.toggle': {
            if (!isBoolean(input.disabled)) {
              throw new OpenChamberControlError('disabled is required for schedule.toggle', 400);
            }
            const task = await scheduledTaskService.setEnabled(projectID, taskID, input.disabled === false);
            return { task, enabled: task?.enabled === true };
          }
        }
      }
      if (action === 'session.create' || action === 'session.send' || action === 'session.fork') {
        return executeSessionAction(action, input, contextDirectory, options.signal, options.contextSessionId, options.startedByExtension);
      }
      if (action === 'session.link' || action === 'session.unlink') {
        if (!sessionLinks) throw new OpenChamberControlError('Linking is not available on this server', 503);
        assertSingleScope(input);
        const explicitSessionID = asNonEmptyString(input.sessionId);
        const sessionID = explicitSessionID || asNonEmptyString(options.contextSessionId);
        const directory = asNonEmptyString(input.directory)
          || (explicitSessionID ? await resolveSessionDirectory(explicitSessionID) : null)
          || asNonEmptyString(contextDirectory);
        const link = input.link ?? { url: input.url, title: input.title, kind: input.kind, identifier: input.identifier };
        if (action === 'session.unlink') {
          const target: Parameters<typeof sessionLinks.unlink>[0]['target'] = Object(link);
          return sessionLinks.unlink({ sessionId: sessionID, directory, target });
        }
        return sessionLinks.link({ sessionId: sessionID, directory, link });
      }
      if (action === 'pr.watch' || action === 'pr.unwatch') {
        if (!prWatch) throw new OpenChamberControlError('Waiting on a pull request is not available on this server', 503);
        const sessionID = asNonEmptyString(options.contextSessionId);
        if (!sessionID) throw new OpenChamberControlError(`${action} must be called from a session`, 400);
        try {
          if (action === 'pr.unwatch') return await prWatch.unwatch(sessionID, input.url);
          const directory = (await resolveSessionDirectory(sessionID)) || asNonEmptyString(contextDirectory);
          return await prWatch.watch({ sessionID, directory, url: input.url });
        } catch (error) {
          const fields = controlErrorFields(error);
          throw new OpenChamberControlError(`${fields?.message ?? String(error)}`, isIntegerNumber(fields?.status) ? fields.status : 500);
        }
      }
      if (action === 'wait.list' || action === 'wait.start' || action === 'wait.stop') {
        if (!extensionWaits) throw new OpenChamberControlError('Waits are not available on this server', 503);
        const sessionID = asNonEmptyString(options.contextSessionId);
        if (!sessionID) throw new OpenChamberControlError(`${action} must be called from a session`, 400);
        try {
          const resolveDirectory = async () => (await resolveSessionDirectory(sessionID)) || asNonEmptyString(contextDirectory);
          return await runWaitAction({ action, input, sessionID, extensionWaits, prWatch, resolveDirectory });
        } catch (error) {
          if (error instanceof OpenChamberControlError) throw error;
          const fields = controlErrorFields(error);
          throw new OpenChamberControlError(`${fields?.message ?? String(error)}`, isIntegerNumber(fields?.status) ? fields.status : 500);
        }
      }
      if (action === 'work.name') {
        if (!workNamer) throw new OpenChamberControlError('Naming tasks is not available on this server', 503);
        const sessionID = asNonEmptyString(input.sessionId) || asNonEmptyString(options.contextSessionId);
        return workNamer.name({ sessionId: sessionID, title: input.title, branch: input.branch });
      }
      if (action === 'session.moveToWorktree') {
        assertSingleScope(input);
        const explicitSessionID = asNonEmptyString(input.sessionId);
        const sessionID = explicitSessionID || asNonEmptyString(options.contextSessionId);
        if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
        const directory = (await resolveSessionDirectory(sessionID)) || asNonEmptyString(contextDirectory);
        const worktree: MoveWorktree = { name: asNonEmptyString(input.worktree)?.trim() };
        const branch = asNonEmptyString(input.branch);
        if (branch) worktree.branchName = branch.trim();
        const startRef = asNonEmptyString(input.startRef);
        if (startRef) worktree.startRef = startRef.trim();
        const existingBranch = asNonEmptyString(input.existingBranch);
        if (existingBranch) worktree.existingBranch = existingBranch.trim();
        const payload: MovePayload = { worktree };
        if (directory) payload.directory = directory;
        if (input.carry !== undefined) payload.carry = input.carry;
        const moved = await sessionService.moveToWorktree(sessionID, payload);
        if (workNamer && !existingBranch && moved?.worktree?.path) {
          await workNamer.carryToWorktree({ sessionId: sessionID, worktree: moved.worktree.path })
            .catch((error) => console.warn('Failed to carry the task name into the new worktree:', error instanceof Error ? error.message : String(error)));
        }
        return moved;
      }
      if (action === 'session.markDone' || action === 'session.track') {
        return setWorkState(input, options.contextSessionId, action === 'session.track' ? 'open' : 'done');
      }
      if (action === 'session.list') return listSessions(input, contextDirectory);
      if (action.startsWith('session.')) {
        const sessionID = asNonEmptyString(input.sessionId);
        if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
        const scoped = asNonEmptyString(input.projectId) || asNonEmptyString(input.directory);
        const directory = (!scoped && await resolveSessionDirectory(sessionID))
          || await resolveReadDirectory(input, contextDirectory);
        const client = await getClient(directory);
        if (!directory) throw new OpenChamberControlError('directory is required', 400);
        if (action === 'session.status') {
          await assertSessionExists(client, sessionID);
          return { sessionId: sessionID, directory, sessionStatus: await sessionStatus(client, sessionID) } satisfies SessionStatusResult;
        }
        if (action === 'session.messages') {
          if (input.timeout !== undefined && input.wait !== true) throw new OpenChamberControlError('timeout requires wait', 400);
          const role = input.lastAssistant === true ? 'assistant' : (asNonEmptyString(input.role) || 'all');
          if (!['all', 'user', 'assistant'].includes(role)) throw new OpenChamberControlError('role must be all, user, or assistant', 400);
          const last = input.last === true || input.lastAssistant === true;
          if (input.all === true && (last || input.limit !== undefined)) throw new OpenChamberControlError('all cannot be combined with last or limit', 400);
          if (last && input.limit !== undefined) throw new OpenChamberControlError('last cannot be combined with limit', 400);
          await assertSessionExists(client, sessionID);
          const currentStatus = input.wait === true
            ? await waitForIdle({ client, sessionID, directory, timeoutMs: normalizeWaitTimeoutMs(input.timeout), requireActivity: false, startedAt: now(), signal: options.signal })
            : await sessionStatus(client, sessionID);
          const limit = input.all === true ? undefined : (last ? 1 : positiveInteger(input.limit, 10, 'limit'));
          return { sessionId: sessionID, directory, role, sessionStatus: currentStatus, messages: await sessionMessages(client, sessionID, role, limit) } satisfies SessionMessagesResult;
        }
      }
      throw new OpenChamberControlError(`Unsupported OpenChamber action: ${action || 'missing'}`, 400);
    } catch (error) {
      throw asControlError(error, `Failed to execute ${action || 'OpenChamber action'}`);
    }
  };

  const releaseAnswerWaits = (sessionId: string) => {
    pageAnswers.release(sessionId);
    secretRequests.release(sessionId);
  };
  const answerPage = (input: PageAnswerInput) => {
    try {
      return pageAnswers.answer(input);
    } catch (error) {
      if (!laterPages || controlErrorFields(error)?.statusCode !== 404) throw error;
      return laterPages.answer(input);
    }
  };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
  return {
<<<<<<< HEAD:packages/web/server/lib/openchamber-control/service.js
   workspaceId,
   models: page.map((model) => ({
    id: formatModelRef({ provider: model.provider, modelId: model.modelId }),
    name: model.name,
    provider: providerNames.get(model.provider) ?? model.provider,
    preference: PREFERENCE_BY_RANK[rank.get(modelRefKey({ providerId: model.provider, modelId: model.modelId }))],
    status: model.status ?? null,
    variants: model.variants.map((variant) => variant.variant),
   })),
   total: models.length,
   next: offset + limit < models.length ? offset + limit : null,
||||||| bc50ba56aa:packages/web/server/lib/openchamber-control/service.js
    execute,
    resolveSessionDirectory,
    answerPage: pageAnswers.answer,
    answerSecret: secretRequests.answer,
    secretFields: secretRequests.fields,
    releaseAnswerWaits,
    stopSession,
    answerPermission,
    answerForm,
    dismissOpenForms,
=======
    execute,
    resolveSessionDirectory,
    answerPage,
    answerSecret: secretRequests.answer,
    secretFields: secretRequests.fields,
    releaseAnswerWaits,
    stopSession,
    answerPermission,
    answerForm,
    dismissOpenForms,
>>>>>>> upstream/main:packages/web/server/lib/openchamber-control/service.ts
  };
 };

 const models = async (input, contextSessionId, contextDirectory) => {
  const scope = await resolveWorkspaceFor(input, contextSessionId, contextDirectory);
  const workspaceId = asNonEmptyString(scope?.workspaceId);
  if (!workspaceId) throw new OpenChamberControlError('Workspace scope is missing workspaceId', 500);
  const [modelCatalog, providerCatalog] = await Promise.all([
   agentRequest(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/models`),
   agentRequest(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/providers`),
  ]);
  return { workspaceId, models: modelCatalog?.models ?? modelCatalog, providers: providerCatalog?.providers ?? providerCatalog };
 };

 const asPublicStatus = (runtimeStatus) => {
  if (runtimeStatus === 'running' || runtimeStatus === 'awaiting_approval' || runtimeStatus === 'awaiting_input') return { type: 'busy' };
  if (runtimeStatus === 'idle') return { type: 'idle' };
  return { type: 'unknown' };
 };

 const sessionStatus = async (sessionID) => {
  const snapshot = await sessionService.open(sessionID);
  return asPublicStatus(snapshot?.session?.runtimeStatus);
 };

 const messageText = (message) => (Array.isArray(message?.parts) ? message.parts : [])
  .filter((part) => part?.type === 'text' && typeof part.content === 'string')
  .map((part) => part.content)
  .join('')
  .trim();

 const MESSAGE_PAGE_LIMIT = 100;
 const sessionMessages = async (sessionID, role, limit) => {
  const collected = [];
  const turns = new Map();
  const seenCursors = new Set();
  let cursor;
  while (true) {
   const query = new URLSearchParams({ limit: String(MESSAGE_PAGE_LIMIT), ...(cursor ? { cursor } : {}) });
   const page = await sessionService.history(sessionID, query.toString());
   for (const turn of Array.isArray(page?.turns) ? page.turns : []) turns.set(turn.turnId, turn);
   const messages = Array.isArray(page?.messages) ? page.messages : [];
   collected.push(...messages);
   const next = asNonEmptyString(page?.nextCursor);
   if (!next) break;
   if (seenCursors.has(next)) throw new OpenChamberControlError('History cursor repeated', 500);
   seenCursors.add(next);
   cursor = next;
  }
  const result = collected
   .filter((message) => (message.role === 'user' || message.role === 'assistant') && (role === 'all' || message.role === role))
   .map((message) => {
    const turn = turns.get(message.turnId);
    return {
     id: asNonEmptyString(message.messageId) || '',
     role: message.role,
     createdAt: Number.isFinite(message.createdAt) ? message.createdAt : null,
     completedAt: Number.isFinite(turn?.finishedAt) ? turn.finishedAt : null,
     model: modelRefKey(message.providerId, message.modelId) || null,
     text: messageText(message),
    };
   })
   .filter((message) => message.text)
   .sort((left, right) => (left.createdAt || 0) - (right.createdAt || 0));
  return limit === undefined ? result : result.slice(-limit);
 };

 const waitForIdle = async ({ sessionID, timeoutMs, requireActivity, baselineMessageID, startedAt, signal }) => {
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

 const resolveSessionDirectory = async (sessionID) => {
  try {
   const scope = await resolveSessionScope(sessionID);
   return asNonEmptyString(scope?.cwd) || null;
  } catch {
   return null;
  }
 };

 // Checked before anything is created or sent: a result nobody can deliver
 // must fail the call, not leave a dispatched session the agent waits on.
 const assertReturnResult = (action, input, parentSessionID) => {
  if (input.wait === true) throw new OpenChamberControlError('returnResult cannot be combined with wait', 400);
  if (!dispatchResults) throw new OpenChamberControlError('Returning a session result is not available on this server', 503);
  if (!parentSessionID) throw new OpenChamberControlError('returnResult needs a calling session to deliver the result to', 400);
  if (!asNonEmptyString(input.prompt)) throw new OpenChamberControlError('returnResult requires prompt', 400);
  // A fork is a new session, so only a send can target the caller itself.
  if (action === 'session.send' && asNonEmptyString(input.sessionId) === parentSessionID) {
   throw new OpenChamberControlError('returnResult cannot deliver a session\'s result to itself', 400);
  }
 };

 // What the agent is told when its result is on the way. It replaces a wait,
 // so it has to stop the agent from building one out of polls or sleeps.
 const RESULT_PENDING_NOTE = 'The session runs in the background. Its final answer will be delivered to you automatically as a message when it finishes, and you will continue from there. Do not poll, sleep, or call session.messages to wait for it; carry on with other work or end your turn.';

 /**
  * After the dispatch: the session is already running, so a failure here is
  * reported in the result rather than thrown, and the agent is told plainly
  * that no answer is coming instead of waiting for one.
  */
 const scheduleResultDelivery = async (result, parentSessionID, dispatchedAt) => {
  // The newest end-of-run record before the prompt went out (null: none yet).
  // Absent when the history could not be read; the runtime then compares times.
  const afterIdleId = result.baselineIdleRecordId;
  if (result.promptDispatched !== true) {
   return { status: 'not-scheduled', reason: 'The prompt was not dispatched, so there is no result to return.' };
  }
  try {
   await dispatchResults.register({
    parentSessionId: parentSessionID,
    sessionId: result.sessionId,
    dispatchedAt,
    ...(afterIdleId !== undefined ? { afterIdleId } : {}),
   });
   return { status: 'pending', note: RESULT_PENDING_NOTE };
  } catch (error) {
   return {
    status: 'not-scheduled',
    reason: `The session runs, but its result will not be delivered: ${error instanceof Error ? error.message : String(error)}. Read it later with session.messages if the user asks.`,
   };
  }
 };

 const startSessionGoal = async (sessionID, input) => {
  if (input.goal !== true) return null;
  const objective = asNonEmptyString(input.prompt);
  if (!objective) throw new OpenChamberControlError('goal requires prompt', 400);
  if (typeof sessionService.control !== 'function') throw new OpenChamberControlError('Native goal control is unavailable', 503);
  const goalTokenBudget = input.goalTokenBudget;
  if (goalTokenBudget !== undefined && (!Number.isSafeInteger(goalTokenBudget) || goalTokenBudget < 1000 || goalTokenBudget > 100_000_000))
   throw new OpenChamberControlError('goalTokenBudget must be from 1000 to 100000000', 400);
  const settings = await readSettingsFromDiskMigrated();
  const tokenBudget = goalTokenBudget ?? (settings.sessionGoalDefaultBudgetEnabled === true ? settings.sessionGoalDefaultBudget : null);
  const options = sessionPromptRequest(input).options;
  const result = await sessionService.control(sessionID, {
   type: 'goal', op: 'create', objective, tokenBudget: tokenBudget ?? null,
   providerId: options.providerId ?? undefined, modelId: options.modelId ?? undefined, variant: options.variant, reasoningEffort: options.reasoningEffort
  });
  if (result?.type !== 'goal' || result.mode?.kind !== 'goal' || result.mode.status !== 'active') throw new OpenChamberControlError('Native goal acknowledgement is invalid', 502);
  return { goalEnabled: true, goalTokenBudget: tokenBudget ?? null };
 };

 const executeSessionAction = async (action, input, contextDirectory, signal, contextSessionId) => {
  // The tool path forwards raw JSON, so a boolean parameter can arrive as the
  // string "true". Both of these are compared with `=== true` below, which
  // would read a string as false and silently drop the behavior: a dispatch
  // whose result is never delivered, or a call that returns before the turn
  // it asked to wait for. Reject a non-boolean loudly instead.
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
  if (input.goalTokenBudget !== undefined && (!Number.isSafeInteger(input.goalTokenBudget) || input.goalTokenBudget < 1000 || input.goalTokenBudget > 100_000_000))
   throw new OpenChamberControlError('goalTokenBudget must be from 1000 to 100000000', 400);
  if (input.pullRequest !== undefined && action !== 'session.create') {
   throw new OpenChamberControlError('pullRequest applies only to session.create', 400);
  }
  const sessionID = asNonEmptyString(input.sessionId);
  const parentSessionID = asNonEmptyString(contextSessionId);
  const returnResult = input.returnResult === true;
  if (returnResult) assertReturnResult(action, input, parentSessionID);
  const startedAt = now();
  let result;
  if (action === 'session.create') {
   const scope = await resolveWorkspaceFor(input, contextSessionId, contextDirectory);
   if (input.worktree !== undefined || input.branch !== undefined || input.startRef !== undefined || input.setUpstream !== undefined || input.pullRequest !== undefined) {
    throw new OpenChamberControlError('Worktree and pull-request session creation are not supported by the native session manager', 400);
   }
   const created = await sessionService.create({
    projectId: scope.projectId,
    workspaceId: scope.workspaceId,
    options: sessionOptions(input),
    ...(asNonEmptyString(input.title) ? { title: input.title.trim() } : {}),
   });
   const canonicalSessionID = asNonEmptyString(created?.sessionId)
    || asNonEmptyString(created?.session?.sessionId)
    || asNonEmptyString(created?.session?.id)
    || asNonEmptyString(created?.id);
   result = { ...created, sessionId: canonicalSessionID, promptDispatched: false };
   const goal = await startSessionGoal(canonicalSessionID, input);
   if (goal) result = { ...result, ...goal };
   if (goal) result.promptDispatched = true;
   else if (asNonEmptyString(input.prompt)) {
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
    result = await sessionService.fork(sessionID, asNonEmptyString(input.messageId) ? { messageId: input.messageId.trim() } : {});
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
  result = { ...result, sessionId: canonicalSessionID, promptDispatched: result.promptDispatched === true };
  if (returnResult) {
   const publicResult = { ...result, resultDelivery: await scheduleResultDelivery(result, parentSessionID, startedAt) };
   delete publicResult.baselineAssistantMessageId;
   delete publicResult.baselineIdleRecordId;
   return publicResult;
  }
  if (input.wait !== true) {
   const publicResult = { ...result };
   delete publicResult.baselineAssistantMessageId;
   delete publicResult.baselineIdleRecordId;
   return publicResult;
  }
  const status = await waitForIdle({
   sessionID: canonicalSessionID,
   timeoutMs: normalizeWaitTimeoutMs(input.timeout),
   requireActivity: result.promptDispatched === true,
   baselineMessageID: result.baselineAssistantMessageId,
   startedAt,
   signal,
  });
  const publicResult = { ...result, sessionStatus: status };
  delete publicResult.baselineAssistantMessageId;
  delete publicResult.baselineIdleRecordId;
  if (input.lastAssistant === true) {
   publicResult.lastAssistantMessage = (await sessionMessages(canonicalSessionID, 'assistant', 1))[0] || null;
  }
  return publicResult;
 };

 /**
  * Validates browser inputs here rather than in the renderer: an invalid call
  * should come back as a usage error the agent can correct, without waking a
  * client or waiting for a round trip.
  */
 const browserAction = async (action, input, signal, contextDirectory, contextSessionId) => {
  const parameters = {};
  // Any action may name a tab; the browser that issued the id resolves it.
  const tabId = asNonEmptyString(input.tabId);
  if (tabId) {
   if (tabId.length > 128) throw new OpenChamberControlError('tabId must be an id from browser.snapshot tabs', 400);
   parameters.tabId = tabId;
  }

  const readViewport = (required) => {
   const viewport = asNonEmptyString(input.viewport);
   if (!viewport) {
    if (required) throw new OpenChamberControlError('viewport is required for browser.resize', 400);
    return;
   }
   if (!['mobile', 'tablet', 'desktop', 'fill'].includes(viewport)) {
    throw new OpenChamberControlError('viewport must be mobile, tablet, desktop, or fill', 400);
   }
   parameters.viewport = viewport;
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
   let parsed;
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
   if (typeof input.value !== 'string') {
    throw new OpenChamberControlError('value is required for browser.type', 400);
   }
   parameters.selector = selector;
   parameters.value = input.value;
   parameters.submit = input.submit === true;
  }

  if (action === 'browser.select') {
   const selector = asNonEmptyString(input.selector);
   if (!selector) throw new OpenChamberControlError('selector is required for browser.select', 400);
   const hasLabel = typeof input.label === 'string';
   const hasValue = typeof input.value === 'string';
   if (hasLabel === hasValue) {
    throw new OpenChamberControlError('browser.select requires exactly one of label or value', 400);
   }
   parameters.selector = selector;
   if (hasLabel) parameters.label = input.label;
   else parameters.value = input.value;
  }

  if (action === 'browser.scroll') {
   const selector = asNonEmptyString(input.selector);
   const direction = asNonEmptyString(input.direction);
   if (!selector && !direction) {
    throw new OpenChamberControlError('browser.scroll requires direction or selector', 400);
   }
   if (direction && !['up', 'down', 'top', 'bottom'].includes(direction)) {
    throw new OpenChamberControlError('direction must be up, down, top, or bottom', 400);
   }
   if (selector) parameters.selector = selector;
   if (direction) parameters.direction = direction;
  }

  // Opening a page waits for the navigation to settle, so its budget has to
  // exceed the client's own wait; sharing one timeout with the quick actions
  // made a slow page indistinguishable from an unreachable browser.
  const timeoutMs = action === 'browser.open' ? 45_000 : 20_000;
  // Where the call came from, for a provider that keeps one browser per
  // project or chat. Filled by the tool plugin, never by the model.
  const context = {
   directory: asNonEmptyString(contextDirectory),
   sessionId: asNonEmptyString(contextSessionId),
  };
  const result = await browserControl.request(action, parameters, { signal, timeoutMs, context });

  // The image is written here rather than in the renderer: the file belongs
  // beside the code it documents, and the client that took it may be on a
  // different machine than the repository.
  if (action === 'browser.capture') {
   const directory = asNonEmptyString(input.directory) || asNonEmptyString(contextDirectory);
   if (!directory) {
    throw new OpenChamberControlError('directory is required to save a screenshot', 400);
   }
   const capture = result && typeof result === 'object' ? result : {};
   const saved = await writeScreenshot({
    directory,
    base64: capture.base64,
    mime: capture.mime,
    label: input.label,
   });
   // The base64 never goes back to the caller: it is large, and the path is
   // what an answer, a commit, or a review can actually use.
   return {
    path: saved.path,
    // Saving the file is only half of showing it. Chat collects the image
    // paths written in a finished answer and renders them below it, so the
    // agent is told the one thing it cannot infer: that writing the path is
    // what puts the picture in front of the user.
    hint: `Write ![](${saved.path}) in your reply to show this image to the user; it is rendered under your message.`,
    url: capture.url ?? null,
    title: capture.title ?? null,
    viewport: capture.viewport ?? null,
    width: capture.width ?? null,
    height: capture.height ?? null,
   };
  }

  return result;
 };

 const execute = async (action, input = {}, contextDirectory, options = {}) => {
  try {
   if (!CONTROL_ACTIONS.has(action)) {
    throw new OpenChamberControlError(`Unsupported OhPiChamber action: ${action || "missing"}`, 400);
   }
   if (OPENCHAMBER_KNOWLEDGE_ACTIONS.includes(action)) {
    return await knowledgeActions.execute(action, input, contextDirectory, options.contextSessionId);
   }
   if (action.startsWith('browser.')) {
    if (!browserControl) {
     throw new OpenChamberControlError('The in-app browser is not available on this server', 503);
    }
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
     throw new OpenChamberControlError(result.body.error, result.status);
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
   if (action === 'schedule.status') return scheduledTaskService.status();
   if (action.startsWith('schedule.')) {
    const taskID = asNonEmptyString(input.taskId);
    if (SCHEDULE_TASK_ID_ACTIONS.has(action) && !taskID) {
     throw new OpenChamberControlError('taskId is required', 400);
    }
    assertSingleScope(input);
    const scope = await resolveWorkspaceFor(input, options.contextSessionId, contextDirectory);
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
      const existing = (await scheduledTaskService.list(projectID)).find((task) => task.id === taskID);
      if (!existing) throw new OpenChamberControlError(`Scheduled task not found: ${taskID}`, 404);
      const result = await scheduledTaskService.upsert(projectID, patchScheduledTask(existing, input));
      return { task: result.task, updated: true };
     }
     case 'schedule.run':
      return scheduledTaskService.run(projectID, taskID);
     case 'schedule.delete':
      return { deleted: true, tasks: await scheduledTaskService.remove(projectID, taskID) };
     case 'schedule.toggle': {
      if (typeof input.disabled !== 'boolean') {
       throw new OpenChamberControlError('disabled is required for schedule.toggle', 400);
      }
      const task = await scheduledTaskService.setEnabled(projectID, taskID, input.disabled === false);
      // What was saved, which is what the scheduler acts on.
      return { task, enabled: task?.enabled === true };
     }
    }
   }
   if (action === 'session.create' || action === 'session.send' || action === 'session.fork') {
    return executeSessionAction(action, input, contextDirectory, options.signal, options.contextSessionId);
   }
   if (action === 'session.moveToWorktree') {
    // The action list decides exposure; the Host service decides authorization.
    // `sessionId` defaults to the calling session, and only that session may
    // move itself: a sibling or child cannot be relocated by this tool.
    assertSingleScope(input);
    if (typeof sessionService?.moveToWorktree !== 'function') {
     throw new OpenChamberControlError('Moving a session into a worktree is unavailable on this server', 501);
    }
    const sessionID = asNonEmptyString(input.sessionId) || asNonEmptyString(options.contextSessionId);
    if (!sessionID) throw new OpenChamberControlError('sessionId is required', 400);
    const worktree = input.worktree && typeof input.worktree === 'object' && !Array.isArray(input.worktree) ? input.worktree : {};
    const carry = input.carry ?? [];
    return sessionService.moveToWorktree(sessionID, {
     worktree: {
      ...(asNonEmptyString(worktree.name) ? { name: asNonEmptyString(worktree.name) } : {}),
      ...(asNonEmptyString(worktree.branchName) ? { branchName: asNonEmptyString(worktree.branchName) } : {}),
      ...(asNonEmptyString(worktree.startRef) ? { startRef: asNonEmptyString(worktree.startRef) } : {}),
      ...(asNonEmptyString(worktree.existingBranch) ? { existingBranch: asNonEmptyString(worktree.existingBranch) } : {}),
     },
     carry: Array.isArray(carry) ? carry : [],
    }, { contextSessionId: options.contextSessionId });
   }
   if (action === 'pr.watch' || action === 'pr.unwatch') {
    if (!prWatch) throw new OpenChamberControlError('Pull request watches are not available on this server', 503);
    // The watched session is the explicit one, else the calling session.
    const explicitSessionID = asNonEmptyString(input.sessionId);
    const sessionID = explicitSessionID || asNonEmptyString(options.contextSessionId);
    if (action === 'pr.unwatch') return prWatch.unwatch(sessionID);
    const directory = asNonEmptyString(input.directory)
     || (explicitSessionID ? await resolveSessionDirectory(explicitSessionID) : null)
     || asNonEmptyString(contextDirectory);
    return prWatch.watch({ sessionID, directory, url: input.url });
   }
   if (action === 'session.link') {
    if (!sessionLinks) throw new OpenChamberControlError('Linking is not available on this server', 503);
    assertSingleScope(input);
    // An explicit session is linked where it lives; the calling session
    // uses the directory the tool call came from.
    const explicitSessionID = asNonEmptyString(input.sessionId);
    const sessionID = explicitSessionID || asNonEmptyString(options.contextSessionId);
    const directory = asNonEmptyString(input.directory)
     || (explicitSessionID ? await resolveSessionDirectory(explicitSessionID) : null)
     || asNonEmptyString(contextDirectory);
    // Models put the link's fields beside the action as often as inside
    // `link`; session.link has no other use for them, so both are read.
    const link = input.link ?? { url: input.url, title: input.title, kind: input.kind, identifier: input.identifier };
    return sessionLinks.link({ sessionId: sessionID, directory, link });
   }
   if (action.startsWith('session.')) {
    const sessionID = asNonEmptyString(input.sessionId);
    if (action !== 'session.list' && !sessionID) throw new OpenChamberControlError('sessionId is required', 400);
    if (action === 'session.list') {
     const limit = positiveInteger(input.limit, 10, 'limit');
     const scope = await resolveWorkspaceFor(input, options.contextSessionId, contextDirectory);
     const listing = await sessionService.list(scope.workspaceId);
     let sessions = Array.isArray(listing?.items) ? listing.items : [];
     sessions = await Promise.all(sessions.map(async (session) => {
      const archived = await archivedAt(session?.sessionId || session?.id);
      return archived ? { ...session, archivedAt: archived } : session;
     }));
     if (input.all !== true) sessions = sessions.filter((session) => !session?.archivedAt);
     sessions = sessions.slice(0, limit);
     if (input.withStatus === true) sessions = sessions.map((session) => ({
      ...session,
      status: asPublicStatus(session.runtimeStatus),
     }));
     return { sessions, limit, archived: input.all === true ? 'included' : 'excluded' };
    }
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
      ? await waitForIdle({ sessionID, timeoutMs: normalizeWaitTimeoutMs(input.timeout), requireActivity: false, startedAt: now(), signal: options.signal })
      : await sessionStatus(sessionID);
     const limit = input.all === true ? undefined : (last ? 1 : positiveInteger(input.limit, 10, 'limit'));
     return { sessionId: sessionID, role, sessionStatus: currentStatus, messages: await sessionMessages(sessionID, role, limit) };
    }
   }
   throw new OpenChamberControlError(`Unsupported OhPiChamber action: ${action || 'missing'}`, 400);
  } catch (error) {
   throw asControlError(error, `Failed to execute ${action || 'OhPiChamber action'}`);
  }
 };
 const featurePolicy = async (toolName, action) => {
  const actions = TOOL_ACTIONS.get(toolName);
  if (!actions || !actions.has(action)) return { code: 'INVALID_REQUEST', status: 400, detail: `Unsupported ${toolName} action: ${action}` };
  return null;
 };

 const invokeHostAction = async (scope, request, signal) => {
  const fail = (code, status, detail) => {
   const payload = { ok: false, code, status };
   if (detail) payload.detail = String(detail);
   return payload;
  };
  if (!scope || typeof scope !== 'object' || typeof scope.rootSessionId !== 'string' || !scope.rootSessionId
   || typeof scope.projectId !== 'string' || !scope.projectId || typeof scope.workspaceId !== 'string' || !scope.workspaceId
   || typeof scope.cwd !== 'string' || !scope.cwd || typeof scope.agentDirectory !== 'string' || !scope.agentDirectory
   || (scope.agentDirectoryId !== undefined && (typeof scope.agentDirectoryId !== 'string' || !scope.agentDirectoryId))) {
   return fail('INVALID_REQUEST', 400, 'Invalid session scope');
  }
  if (!request || typeof request !== 'object' || Array.isArray(request) || typeof request.toolName !== 'string' || !request.toolName
   || typeof request.action !== 'string' || !request.action || request.sessionId !== scope.rootSessionId
   || (request.input !== undefined && (typeof request.input !== 'object' || request.input === null || Array.isArray(request.input)))) {
   return fail('INVALID_REQUEST', 400, 'Invalid host action request');
  }
  const policy = await featurePolicy(request.toolName, request.action);
  if (policy) return fail(policy.code, policy.status, policy.detail);
  if (typeof resolveSessionScope !== 'function') return fail('INTERNAL_ERROR', 503, 'Session scope resolver unavailable');
  try {
   const resolved = await resolveSessionScope(request.sessionId);
   if (!resolved || resolved.rootSessionId !== scope.rootSessionId || resolved.projectId !== scope.projectId
    || resolved.workspaceId !== scope.workspaceId || resolved.cwd !== scope.cwd
    || resolved.agentDirectory !== scope.agentDirectory
    || (scope.agentDirectoryId !== undefined && resolved.agentDirectoryId !== scope.agentDirectoryId)) {
    return fail('UNAUTHORIZED', 403, 'Session is outside the authorized scope');
   }
   const input = request.input ?? {};
   // The call that asked travels with the request: a page that waits for the
   // user's answer is resolved by its own call, not by the session alone.
   const value = await execute(request.action, input, scope.cwd, {
    signal, contextSessionId: request.sessionId,
    contextCallId: typeof request.toolCallId === 'string' ? request.toolCallId : undefined,
   });
   return { ok: true, value: value === undefined ? null : value };
  } catch (error) {
   const status = Number.isInteger(error?.statusCode) ? error.statusCode : Number.isInteger(error?.status) ? error.status : 500;
   const validExplicitCode = typeof error?.code === 'string' && ProblemCodeSchema.safeParse(error.code).success ? error.code : null;
   const code = validExplicitCode
    ?? (status === 400 || status === 404 ? 'INVALID_REQUEST'
     : status === 403 ? 'UNAUTHORIZED'
      : status === 409 ? 'METADATA_CONFLICT'
       : status === 499 || status === 503 ? 'SERVICE_UNAVAILABLE'
        : 'INTERNAL_ERROR');
   return fail(code, status, error?.message);
  }
 };

 return { execute, invokeHostAction, resolveSessionDirectory, answerPage: pageAnswers.answer };
};
