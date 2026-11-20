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
 OPENCHAMBER_SECRET_ACTIONS,
 OPENCHAMBER_WORKFLOW_ACTIONS,
} from './actions.js';
import { createProjectKnowledgeActions } from './project-knowledge.js';
import { writeScreenshot } from './screenshots.js';
import { resolveUploadFiles, UploadRefusedError } from '../browser-control/uploads.js';
import { createPageAnswers, createRenderPageAction } from './render-page.js';
import { createSecretRequests } from './secret-request.js';
import { createTerminalReadAction } from './terminal-read.js';
import { redactGitText } from '../git/redaction.js';
import type { PageAnswerInput } from './render-page.js';
import { formatModelRef, modelRefKey, parseModelSelector, thinkingLevelToReasoningEffort } from '@openchamber/agent-contract';

const DEFAULT_WAIT_TIMEOUT_SECONDS = 600;
const MAX_WAIT_TIMEOUT_SECONDS = 86_400;
const WAIT_POLL_INTERVAL_MS = 500;
// One service, both capabilities: which tool asked is the caller's concern.
const CONTROL_ACTIONS = new Set(OPENCHAMBER_ALL_ACTIONS);
const TOOL_ACTIONS = new Map([
 ['openchamber', new Set(OPENCHAMBER_AGENT_TOOL_ACTIONS)],
 ['web', new Set(OPENCHAMBER_WEB_ACTIONS)],
 ['openchamber_knowledge', new Set(OPENCHAMBER_KNOWLEDGE_ACTIONS)],
 ['notify', new Set(OPENCHAMBER_NOTIFY_ACTIONS)],
 ['openchamber_render', new Set(OPENCHAMBER_RENDER_ACTIONS)],
 ['openchamber_secret', new Set(OPENCHAMBER_SECRET_ACTIONS)],
 ['openchamber_workflow', new Set(OPENCHAMBER_WORKFLOW_ACTIONS)],
]);
const SCHEDULE_TASK_ID_ACTIONS = new Set([
 'schedule.update',
 'schedule.run',
 'schedule.delete',
 'schedule.toggle',
]);

const positiveInteger = (value, fallback, field) => {
 if (value === undefined || value === null) return fallback;
 const number = Number(value);
 if (!Number.isSafeInteger(number) || number < 1) {
  throw new OpenChamberControlError(`${field} must be a positive integer`, 400);
 }
 return number;
};

const normalizeWaitTimeoutMs = (value) => {
 const seconds = value === undefined || value === null ? DEFAULT_WAIT_TIMEOUT_SECONDS : Number(value);
 if (!Number.isSafeInteger(seconds) || seconds < 1 || seconds > MAX_WAIT_TIMEOUT_SECONDS) {
  throw new OpenChamberControlError(`timeout must be from 1 to ${MAX_WAIT_TIMEOUT_SECONDS} seconds`, 400);
 }
 return seconds * 1000;
};

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
};

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
};

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
};

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
};

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
};

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
};

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
  browserUploads = null,
  getTerminalRuntime = null,
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
  isSecretToolEnabled = async () => true,
  hasUnreadChat = async () => false,
  // Hears when a page an agent shows starts and stops waiting for the
  // user's answer (render.page with awaitAnswer).
  onPageWaitChange = () => { },
  // Delivers a dispatched session's result back to the session that asked
  // (`returnResult`); absent means the server cannot offer it.
  dispatchResults = null,
  // Watches a pull request for a session and wakes the session on change
  // (`pr.watch`); absent where pull request watches are not available.
  prWatch = null,
  extensionWaits = null,
  laterPages = null,
  sharePages = null,
  // Archive lives in OpenChamber's own store now.
  archiveStore = null,
  // Agent workflows (../workflows/runtime.js); absent where they are not
  // available, which is every build without OPENCHAMBER_WORKFLOWS_ENABLE.
  workflowRuntime = null,
  sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  now = Date.now,
 } = dependencies;

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
  });
 };

 const agentRequest = async (pathname, init = {}) => {
  const response = await service.request(pathname, {
   ...init,
   headers: { accept: 'application/json', ...(init.headers || {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
   throw new OpenChamberControlError(body?.detail || body?.error || 'Agent service request failed', response.status);
  }
  return body;
 };

 const archivedAt = async (sessionID) => {
  if (!archiveStore) return null;
  return (await archiveStore.archivedAt(sessionID)) ?? null;
 };

 // projectId and directory are two names for one scope. A project resolves
 // to its first workspace's directory, the way session create and send do.
 const resolveProjectDirectory = async (projectId) => {
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
  resolveDirectory: (input = {}) => (input.projectId
   ? resolveProjectDirectory(input.projectId)
   : sessionService.resolveDirectory(input)),
 });

 const projects = async () => {
  const result = await listProjects();
  if (!result || !Array.isArray(result.items) || !result.errors || typeof result.errors !== 'object') {
   throw new OpenChamberControlError('Invalid project listing', 500);
  }
  return result;
 };

 const workspaceScopes = async () => {
  const result = await listWorkspaceScopes();
  if (!result || !Array.isArray(result.items) || !result.errors || typeof result.errors !== 'object') {
   throw new OpenChamberControlError('Invalid workspace scope listing', 500);
  }
  return result;
 };

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

 // Scope selectors are mutually exclusive so one cannot silently override another.
 const assertSingleScope = (input) => {
  const projectId = asNonEmptyString(input.projectId);
  const directory = asNonEmptyString(input.directory);
  const workspaceId = asNonEmptyString(input.workspaceId);
  if ((projectId && directory) || (workspaceId && (projectId || directory))) {
   throw new OpenChamberControlError('Provide only one workspaceId, projectId, or directory', 400);
  }
 };

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

 const pageAnswers = createPageAnswers({ onWaitChange: onPageWaitChange });
 const secretRequests = createSecretRequests({ isEnabled: isSecretToolEnabled, onWaitChange: onPageWaitChange, hasUnreadChat });
 const readTerminal = createTerminalReadAction({ readSettings: readSettingsFromDiskMigrated, getTerminalRuntime });
 const renderPage = createRenderPageAction({ isEnabled: isRenderToolEnabled, pageAnswers, readSession: (sessionId) => sessionService.getMetadata(sessionId), laterPages, sharePages });
 const answerPage = async (input: PageAnswerInput) => {
  try {
   return pageAnswers.answer(input);
  } catch (error) {
   if (!laterPages || error?.statusCode !== 404) throw error;
   return laterPages.answer(input);
  }
 };

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
  return {
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

  if (action === 'browser.upload') {
   const selector = asNonEmptyString(input.selector);
   if (!selector) throw new OpenChamberControlError('selector is required for browser.upload', 400);
   if (!browserUploads) throw new OpenChamberControlError('Uploads are not available on this server', 503);
   const directory = asNonEmptyString(contextDirectory);
   let files;
   try {
    files = await resolveUploadFiles({ paths: input.paths, directory, tempDirectory: directory ?? undefined });
   } catch (error) {
    if (error instanceof UploadRefusedError) throw new OpenChamberControlError(error.message, 400);
    throw error;
   }
   parameters.selector = selector;
   parameters.upload = browserUploads.put(files);
  }

  // Opening a page waits for the navigation to settle, so its budget has to
  // exceed the client's own wait; sharing one timeout with the quick actions
  // made a slow page indistinguishable from an unreachable browser.
  const timeoutMs = action === 'browser.open' || action === 'browser.upload' ? 45_000 : 20_000;
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
   if (action === 'secret.request') return await secretRequests.request();
   if (OPENCHAMBER_SECRET_ACTIONS.includes(action)) throw new OpenChamberControlError('Secret execution requires the authenticated openchamber_secret worker tool and command approval', 403);
   if (!CONTROL_ACTIONS.has(action)) {
    throw new OpenChamberControlError(`Unsupported OhPiChamber action: ${action || "missing"}`, 400);
   }
   if (OPENCHAMBER_KNOWLEDGE_ACTIONS.includes(action)) {
    return await knowledgeActions.execute(action, input, contextDirectory, options.contextSessionId);
   }
   if (action === 'terminal.list' || action === 'terminal.read') {
    const scope = await resolveReadScope(input, contextDirectory, options.contextSessionId, options.contextSessionId);
    const result = await readTerminal(action, { ...input, directory: scope.cwd }, scope.cwd);
    const present = ({ cwd: _cwd, ...terminal }) => ({
     ...terminal,
     directory: scope.displayPath ?? '.',
     ...(typeof terminal.text === 'string' ? {
      text: redactGitText(terminal.text, { secrets: [scope.cwd, scope.agentDirectory], maxChars: terminal.text.length }),
     } : {}),
    });
    return 'terminals' in result ? { terminals: result.terminals.map(present) } : present(result);
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
   if (action === 'wait.list' || action === 'wait.start' || action === 'wait.stop') {
    if (!extensionWaits) throw new OpenChamberControlError('Waits are not available on this server', 503);
    const sessionID = options.contextSessionId;
    if (action === 'wait.list') return extensionWaits.listWaits(sessionID);
    if (action === 'wait.stop') return extensionWaits.stopWaits(sessionID, input.waitId);
    return extensionWaits.startWait({ sessionID, directory: asNonEmptyString(contextDirectory), source: input.source, args: input.args });
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
   const value = request.toolName === 'openchamber_secret'
    ? request.action === 'secret.run'
     ? await secretRequests.run(input, { sessionId: request.sessionId, callId: request.toolCallId, directory: scope.cwd, signal })
     : request.action === 'secret.forget' ? secretRequests.forget(request.sessionId) : await secretRequests.request()
    : await execute(request.action, input, scope.cwd, {
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

 return { execute, invokeHostAction, resolveSessionDirectory, answerPage, answerSecret: secretRequests.answer, secretFields: secretRequests.fields };
};
