import path from 'node:path';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { z } from 'zod';
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
import { assertRootPromptAdmission } from '../message-queue/prompt-admission.js';
import { SessionCreateAckSchema, SessionCreateRequestSchema, RuntimeSessionSchema, SessionSchema, RunSchema, RunAbortRequestSchema, SessionDeleteAckSchema, PromptRequestSchema, CapturedSendOptionsSchema, SessionSnapshotSchema, HistoryPageSchema, SessionMetadataStateSchema, SessionMetadataPatchSchema, SessionTitleRequestSchema, SteerRequestSchema, SteerAckSchema, FollowUpRequestSchema, FollowUpAckSchema, ProblemDetailsSchema, ProblemCodeSchema, SessionControlRequestSchema, SessionControlAckSchema, EntityIdSchema } from '@openchamber/agent-contract';
import { SessionBranchRequestSchema, SessionBranchResultSchema, SessionRelocateRequestSchema, SessionRelocateResultSchema } from '@openchamber/agent-contract';
import { HostSessionRelocationPrepareSchema, HostSessionRelocationPreparedSchema, HostSessionRelocationFinalizeSchema, HostSessionRelocationFinalizedSchema, HostSessionRelocationPendingSchema } from '@openchamber/agent-service/private-protocol';
import { OpenChamberControlError, asControlError } from '../openchamber-control/error.js';
import { asNonEmptyString } from '../shared/guards.js';
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
import path from 'node:path';
import {
  createWorktree as createWorktreeDefault,
  getBranches as getBranchesDefault,
  getPathsWithoutChanges as getPathsWithoutChangesDefault,
  getWorktreeBootstrapStatus as getWorktreeBootstrapStatusDefault,
  listStashes as listStashesDefault,
  removeWorktree as removeWorktreeDefault,
  resolvePrimaryWorktreeRoot,
  resolveWorktreeTopLevel as resolveWorktreeTopLevelDefault,
  stashApply as stashApplyDefault,
  stashDrop as stashDropDefault,
  stashPush as stashPushDefault,
  validateWorktreeDirectory as validateWorktreeDirectoryDefault,
  waitForActiveWorktreeBootstrap as waitForActiveWorktreeBootstrapDefault,
} from '../git/index.js';
import { parseModelSelection } from '../opencode/config-v2.js';
import { expandSnippets } from '../opencode/snippets.js';
import { AUTO_MODEL_REF, isAutoModel } from '../routing/defaults.js';
import { parseScheduledCommandPrompt } from '../scheduled-tasks/runtime.js';
import { CHATS_SCOPE_PUBLIC_ID } from '../scheduled-tasks/chats-scope.js';
import { buildGoalIntroText, createSessionGoal } from '../session-goal/create.js';
import { OpenChamberControlError, asControlError } from '../openchamber-control/error.js';
import { readObjective, writeObjective } from '../session-goal/objectives.js';
import { worktreeSetupOf } from '../projects/worktree-setup.js';
import { createArchiveStore } from './archive-store.js';
import { createOpenCodeSessionArchive, createSessionArchive } from './session-archive.js';
import { applyForkInheritance } from './fork-inheritance.js';
import { createOpenCodeClient as defaultCreateOpenCodeClient } from './opencode-client.js';
import { createSessionMetadataStore, createOpenCodeSessionMetadata } from './session-metadata-store.js';
=======
import path from 'node:path';
import {
  createWorktree as createWorktreeDefault,
  getBranches as getBranchesDefault,
  getPathsWithoutChanges as getPathsWithoutChangesDefault,
  getWorktreeBootstrapStatus as getWorktreeBootstrapStatusDefault,
  listStashes as listStashesDefault,
  removeWorktree as removeWorktreeDefault,
  resolvePrimaryWorktreeRoot,
  resolveWorktreeTopLevel as resolveWorktreeTopLevelDefault,
  stashApply as stashApplyDefault,
  stashDrop as stashDropDefault,
  stashPush as stashPushDefault,
  validateWorktreeDirectory as validateWorktreeDirectoryDefault,
  waitForActiveWorktreeBootstrap as waitForActiveWorktreeBootstrapDefault,
} from '../git/index.js';
import { expandSnippets } from '../snippets/snippets.js';
import { AUTO_MODEL_REF, isAutoModel } from '../routing/defaults.js';
import { parseScheduledCommandPrompt } from '../scheduled-tasks/runtime.js';
import { CHATS_SCOPE_PUBLIC_ID } from '../scheduled-tasks/chats-scope.js';
import { buildGoalIntroText, createSessionGoal } from '../session-goal/create.js';
import { OpenChamberControlError, asControlError, controlErrorFields } from '../openchamber-control/error.js';
import type { ControlErrorDetails } from '../openchamber-control/error.js';
import { readObjective, writeObjective } from '../session-goal/objectives.js';
import { worktreeSetupOf } from '../projects/worktree-setup.js';
import { createArchiveStore } from './archive-store.js';
import { createOpenCodeSessionArchive, createSessionArchive } from './session-archive.js';
import { applyForkInheritance } from './fork-inheritance.js';
import { createOpenCodeClient as defaultCreateOpenCodeClient } from './opencode-client.js';
import { createSessionMetadataStore, createOpenCodeSessionMetadata } from './session-metadata-store.js';
import { createSession } from './create-session.js';
import { fetchSelectionInputs, fetchWarmSelectionInputs } from './selection-inputs.js';
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
import { buildLinkedIssuesPatch, parseLinkOperation } from './session-linked-issues.js';
import { createSessionWorktreeMover } from './worktree-move.js';
import { sessionParentId } from '../session-lineage.js';
import { listArchivedSubsessions } from './archived-subsessions.js';
import { createStartDirectoryResolver } from './worktree-start-directory.js';
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
const SessionForkAckSchema = z.strictObject({ sessionId: z.string().min(1), rootSessionId: z.string().min(1), sessionFile: z.string().min(1), sourceSessionId: z.string().min(1), entryId: z.string().min(1).nullable(), mode: z.enum(['selected', 'full']) });
const SessionForkRequestSchema = z.strictObject({ messageId: EntityIdSchema.optional(), mode: z.enum(['selected', 'full']) }).refine(
  (input) => input.mode === 'selected' ? input.messageId !== undefined : input.messageId === undefined,
  { message: 'Selected forks require a public message ID; full forks do not accept one' },
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

const asList = (value) => (Array.isArray(value) ? value : []);

const splitModel = (value) => {
  const model = asNonEmptyString(value);
  if (!model) return null;
  const slashIndex = model.indexOf('/');
  if (slashIndex <= 0 || slashIndex === model.length - 1) return null;
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  };
};

const resolveRequestedModel = (payload) => {
  const model = splitModel(payload?.model);
  if (model) return model;

  const providerID = asNonEmptyString(payload?.providerID);
  const modelID = asNonEmptyString(payload?.modelID);
  return providerID && modelID ? { providerID, modelID } : null;
};

const FALLBACK_PROVIDER_ID = 'opencode';
const FALLBACK_MODEL_ID = 'big-pickle';
const MIN_GOAL_TOKEN_BUDGET = 1_000;
const MAX_GOAL_TOKEN_BUDGET = 100_000_000;


const resolveGoalInput = (payload, prompt) => {
  const enabled = payload?.goal === true;
  if (payload?.goalTokenBudget !== undefined && !enabled) {
    return { ok: false, error: 'goalTokenBudget requires goal' };
  }
  if (enabled && !prompt) {
    return { ok: false, error: 'prompt is required when goal is enabled' };
  }
  if (payload?.goalTokenBudget === undefined) {
    return { ok: true, enabled, tokenBudget: null };
  }
  const tokenBudget = payload.goalTokenBudget;
  if (!Number.isSafeInteger(tokenBudget)
    || tokenBudget < MIN_GOAL_TOKEN_BUDGET
    || tokenBudget > MAX_GOAL_TOKEN_BUDGET) {
    return { ok: false, error: `goalTokenBudget must be an integer from ${MIN_GOAL_TOKEN_BUDGET} to ${MAX_GOAL_TOKEN_BUDGET}` };
  }
  return { ok: true, enabled, tokenBudget };
};

const isPrimaryAgentMode = (mode) => !mode || mode === 'primary' || mode === 'all';

// OpenCode 2.x serves one flat model catalogue instead of models nested under
// providers: every entry already names its provider.
//
// A model reference is `providerID/<ref>`. The catalogue `id` is the selectable
// name that Model.Ref, the picker and the agent's model search carry; `modelID`
// is the name sent upstream and only differs for entries with an id override.
// An exact `id` match wins over a `modelID` match regardless of catalogue
// order, so a base model's id never lands on a derived entry whose upstream
// name happens to equal it. `modelID` still answers references that carry the
// provider's name (saved favourites/recents and the UI's model strings).
const findCatalogModel = (models, providerID, ref) => {
  const ofProvider = models.filter((model) => model?.providerID === providerID);
  return ofProvider.find((model) => model?.id === ref)
    || ofProvider.find((model) => model?.modelID === ref)
    || null;
};

const hasCatalogModel = (models, providerID, ref) => findCatalogModel(models, providerID, ref) !== null;

const resolveVariant = (models, providerID, modelID, variant) => {
  const normalized = asNonEmptyString(variant);
  if (!normalized) return undefined;
  const model = findCatalogModel(models, providerID, modelID);
  // A model the catalog does not know yet (cold or unreachable) keeps the
  // user's saved variant instead of losing it to a discovery gap.
  if (!model) return normalized;
  return asList(model.variants).some((entry) => entry?.id === normalized) ? normalized : undefined;
};

const findAgentBySetting = (agents, wantedName) => {
  const wanted = asNonEmptyString(wantedName)?.toLowerCase();
  if (!wanted) return null;
  return agents.find((agent) => agent?.id === wantedName)
    || agents.find((agent) => typeof agent?.name === 'string' && agent.name.toLowerCase() === wanted)
    || agents.find((agent) => typeof agent?.id === 'string' && agent.id.toLowerCase() === wanted)
    || null;
};

/**
 * The level a tool-created session should run on for `providerID/modelID`:
 * the agent's pin and the project or Settings default for that same model
 * win, then the level the model was last sent with, then Default. A model the
 * catalog does not list, or a level it no longer offers, is ignored.
 */
const resolveSelectionVariant = ({
  settings,
  projectDefaults,
  agents,
  agentName,
  models,
  providerID,
  modelID,
}) => {
  const model = findCatalogModel(models, providerID, modelID);
  if (!model) return undefined;
  const offered = asList(model.variants)
    .map((entry) => asNonEmptyString(entry?.id))
    .filter(Boolean);
  if (offered.length === 0) return undefined;

  const agent = findAgentBySetting(agents, agentName);
  const agentModel = agent?.model;
  const agentVariant = agentModel?.providerID === providerID && agentModel?.id === modelID
    ? agentModel.variant
    : undefined;
  const projectDefaultModel = splitModel(projectDefaults?.defaultModel);
  const settingsDefaultModel = splitModel(settings?.defaultModel);
  const configuredVariant = projectDefaultModel?.providerID === providerID && projectDefaultModel.modelID === modelID
    ? projectDefaults?.defaultVariant ?? undefined
    : settingsDefaultModel?.providerID === providerID && settingsDefaultModel.modelID === modelID
      ? settings?.defaultVariant ?? undefined
      : undefined;
  const remembered = settings?.lastUsedEfforts?.[`${providerID}/${modelID}`];

  for (const source of [agentVariant, configuredVariant, remembered]) {
    if (source === null) return null;
    const parsed = z.enum(offered).safeParse(source);
    if (parsed.success) return parsed.data;
  }
  return undefined;
};

const isModelHidden = (hiddenModels, providerID, modelID) => hiddenModels.some(
  (hidden) => hidden?.providerID === providerID && hidden?.modelID === modelID,
=======
import { hasMessage } from './contracts.js';
import type { AgentInfo, ModelInfo, SessionPromptInput, SessionForkInput, SessionSwitchModelInput } from '@opencode/client';
import type { SessionClient } from './opencode-client-contract.js';
import type { SessionMetadata, MetadataDecider } from './session-metadata-store.js';
import type { SelectionWarmUpOptions } from './selection-inputs.js';
import type { SessionMoveWorktree } from './worktree-move.js';
import type { StartDirectoryResult } from './worktree-start-directory.js';
import type { Application, Request, Response } from '../shared/http-contracts.js';
import type { WorktreeSetup, WorktreeSetupInput, DirectoryValidation } from '../projects/contracts.js';
import type { createChatsScope } from '../scheduled-tasks/chats-scope.js';
import type { createFeatureRoutesRuntime } from '../server-frame/feature-routes-runtime.js';
import type { createRoutingRuntime } from '../routing/runtime.js';
import type { createWorktreeBootstrapStore } from '../git/worktree-bootstrap-storage.js';

export interface SessionPayload {
  entries?: unknown;
  linked?: unknown;
  model?: unknown;
  providerID?: unknown;
  modelID?: unknown;
  goal?: unknown;
  goalTokenBudget?: unknown;
  ids?: unknown;
  archivedAt?: unknown;
  projectId?: unknown;
  projectID?: unknown;
  directory?: unknown;
  pullRequest?: unknown;
  worktree?: unknown;
  setUpstream?: unknown;
  patch?: unknown;
  title?: unknown;
  prompt?: unknown;
  agent?: unknown;
  variant?: unknown;
  promptedBySessionId?: unknown;
  messageId?: unknown;
  carry?: unknown;
}

interface WorktreeFields {
  name?: unknown;
  branchName?: unknown;
  startRef?: unknown;
  existingBranch?: unknown;
}

interface SessionSettings {
  projects?: unknown;
  defaultAgent?: unknown;
  defaultModel?: unknown;
  defaultVariant?: unknown;
  lastUsedEfforts?: unknown;
  hiddenModels?: unknown;
  lastSelectedModel?: unknown;
}

interface SessionProject { id: string; path: string }
type MetadataStore = ReturnType<typeof createSessionMetadataStore>;
type FeatureRoutesRuntime = ReturnType<typeof createFeatureRoutesRuntime>;
type BootstrapStore = ReturnType<typeof createWorktreeBootstrapStore>;
type Message = Awaited<ReturnType<SessionClient['message']['list']>>['data'][number];

export interface SessionServiceDependencies {
  chatsScope?: ReturnType<typeof createChatsScope> | null;
  readSettingsFromDiskMigrated: () => Promise<SessionSettings | null>;
  sanitizeProjects: (projects: SessionSettings['projects']) => SessionProject[];
  validateDirectoryPath: (directory: string | null) => Promise<DirectoryValidation>;
  buildOpenCodeUrl: (route: string, query: string) => string;
  getOpenCodeAuthHeaders: Parameters<typeof createOpenCodeSessionMetadata>[0]['getOpenCodeAuthHeaders'];
  waitForOpenCodeReady?: (timeout: number, interval: number) => Promise<void>;
  emitSessionCreatedEvent?: (event: SessionCreatedEvent) => void;
  broadcastGlobalUiEvent?: (event: { type: string; properties: { sessionID: string; archivedAt?: number | null; metadata?: SessionMetadata | undefined } }) => void;
  onSessionArchived?: ((sessionID: string, archivedAt: number | null) => void) | null;
  createSessionGoal?: typeof createSessionGoal;
  sessionKnowledgeRuntime?: { sync: (sessionID: string, directory: string, responseStyle?: string) => Promise<boolean | void> } | null;
  worktreeBootstrapStore: BootstrapStore;
  hydrateWorktreeCheckout: FeatureRoutesRuntime['hydrateBoundCheckout'];
  createChangeRequestWorktree?: ((input: { directory: string; number: number; name?: string; branchName?: string; startCommand?: string; createCommand?: string }) => Promise<SessionMoveWorktree>) | null;
  selectionWarmUp?: SelectionWarmUpOptions;
  dataDir?: string | null;
  archiveStore?: ReturnType<typeof createArchiveStore> | null;
  openCodeArchive?: Parameters<typeof createSessionArchive>[0]['openCode'] | null;
  sessionMetadataStore?: MetadataStore | null;
  persistSessionMetadata?: MetadataStore['setSessionMetadata'] | null;
  updateSessionMetadata?: MetadataStore['updateSessionMetadata'] | null;
  createOpenCodeClient?: typeof defaultCreateOpenCodeClient;
  createWorktree?: typeof createWorktreeDefault;
  getWorktreeBootstrapStatus?: typeof getWorktreeBootstrapStatusDefault;
  waitForActiveWorktreeBootstrap?: typeof waitForActiveWorktreeBootstrapDefault;
  removeWorktree?: typeof removeWorktreeDefault;
  getBranches?: typeof getBranchesDefault;
  stashPush?: typeof stashPushDefault;
  getPathsWithoutChanges?: typeof getPathsWithoutChangesDefault;
  stashApply?: typeof stashApplyDefault;
  stashDrop?: typeof stashDropDefault;
  listStashes?: typeof listStashesDefault;
  resolveWorktreeTopLevel?: typeof resolveWorktreeTopLevelDefault;
  validateWorktreeDirectory?: typeof validateWorktreeDirectoryDefault;
  resolveAutoSelection?: ReturnType<typeof createRoutingRuntime>['resolveAutoSelection'] | null;
  isAutoReady?: (() => Promise<boolean>) | null;
  readProjectSetup?: ((projectID: string) => Promise<WorktreeSetupInput>) | null;
}

export interface SessionCreatedEvent {
  sessionID: string;
  directory: string;
  projectID?: string;
  sourceSessionID?: string;
  title?: string;
  worktree?: SessionMoveWorktree;
  model?: ModelSelection;
  agent?: string;
  variant?: string;
  promptDispatched: boolean;
  dispatchedAsCommand: boolean;
  goalEnabled?: boolean;
  goalTokenBudget?: number;
  createdAt: number;
}

interface ModelSelection { providerID: string; modelID: string }
interface Selection {
  model: ModelSelection | null;
  agent: string | null | undefined;
  variant: string | null | undefined;
}
interface SelectionRequest {
  requestedModel: ModelSelection | null;
  requestedAgent: string | null | undefined;
  requestedVariant: string | null | undefined;
}
interface SessionSelectionInput extends SelectionRequest {
  client: SessionClient;
  sessionID?: string;
  directory: string;
  projectId: string | undefined;
  reuseSessionSelection?: boolean;
  warmUp?: boolean;
}
type GoalInput = { ok: true; enabled: boolean; tokenBudget: number | null } | { ok: false; error: string };
interface DispatchInput extends SessionSelectionInput {
  sessionID: string;
  baseUrl: string;
  authHeaders: ReturnType<SessionServiceDependencies['getOpenCodeAuthHeaders']>;
  prompt: string;
  goalInput: Extract<GoalInput, { ok: true }>;
  clearResponseStyle?: boolean;
  promptedBySessionId?: string | null;
}
interface DispatchResult extends Selection {
  model: ModelSelection;
  promptDispatched: boolean;
  dispatchedAsCommand: boolean;
  promptError?: string;
}
export interface CreateResult {
  sessionId: string;
  directory: string;
  projectId?: string;
  title?: string;
  worktree?: SessionMoveWorktree;
  model?: ModelSelection;
  agent?: string;
  variant?: string;
  promptDispatched: boolean;
  promptError?: string;
  dispatchedAsCommand: boolean;
  goalEnabled?: boolean;
  goalTokenBudget?: number;
  startDirectoryFallback?: NonNullable<StartDirectoryResult['fallback']>;
  untrustedSetupCommandsSkipped?: string[];
}
export interface ExistingResult extends CreateResult {
  action: 'send' | 'fork';
  sourceSessionId?: string;
  baselineAssistantMessageId?: string;
  baselineIdleRecordId?: string | null;
  model: ModelSelection;
}
interface CreateOptions {
  titleByUser?: boolean;
  startedByExtension?: string | null;
  operatorParentId?: string | null;
}
interface ProjectFields { id?: unknown; path?: unknown; defaultAgent?: unknown; defaultModel?: unknown; defaultVariant?: unknown }
interface ModelFields { providerID?: unknown; modelID?: unknown }
interface PullRequestInput { number: number; name?: string; branchName?: string }
interface ServiceErrorBody extends Pick<ControlErrorDetails, 'partial' | 'partialAction' | 'sessionId' | 'directory'> { error: string }
interface SetupInput { startCommand?: string; createCommand?: string }
interface WorktreeInput extends SetupInput { mode: 'new'; name: string; branchName?: string; startRef?: string; setUpstream?: boolean }
type PromptInput = { -readonly [Key in keyof SessionPromptInput]: SessionPromptInput[Key] };
type ForkInput = { -readonly [Key in keyof SessionForkInput]: SessionForkInput[Key] };
type SwitchModel = { -readonly [Key in keyof SessionSwitchModelInput['model']]: SessionSwitchModelInput['model'][Key] };

const isPayload = (value: unknown): value is SessionPayload => value !== null && typeof value === 'object';
const hasPayloadFields = (value: unknown): value is SessionPayload => value !== null && value !== undefined;
const payloadFields = ({ body }: Pick<Request, 'body'>): SessionPayload | null | undefined => hasPayloadFields(body) ? body : body === null ? null : undefined;
const hasWorktreeFields = (value: unknown): value is WorktreeFields => value !== null && value !== undefined;
const worktreeFields = ({ worktree }: Pick<SessionPayload, 'worktree'>) => hasWorktreeFields(worktree) ? worktree : undefined;
const isSafeInteger = (value: unknown): value is number => Number.isSafeInteger(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isText = (value: unknown): value is string => typeof value === 'string';
const isMetadata = (value: unknown): value is SessionMetadata => !!value && typeof value === 'object' && !Array.isArray(value);
const isGoalError = (value: unknown): value is { goalConfigured?: unknown } => !!value && typeof value === 'object';
const isList = (value: unknown): value is unknown[] => Array.isArray(value);
const asList = <T>(value: readonly T[] | null | undefined): readonly T[] => Array.isArray(value) ? value : [];
const hasProjectFields = (value: unknown): value is ProjectFields => value !== null && value !== undefined;
const hasModelFields = (value: unknown): value is ModelFields => value !== null && value !== undefined;
const hasEffortEntries = (value: unknown): value is Record<string, unknown> => value !== null && value !== undefined;
const hasText = (value: unknown): value is string => Boolean(asNonEmptyString(value));
const requiredDataDir = (value: string | null) => {
  if (value === null) throw new Error('openchamber session routes need either both stores or a dataDir');
  return value;
};

const splitModel = (value: string | null | undefined) => {
  const model = asNonEmptyString(value);
  if (!model) return null;
  const slashIndex = model.indexOf('/');
  if (slashIndex <= 0 || slashIndex === model.length - 1) return null;
  return {
    providerID: model.slice(0, slashIndex),
    modelID: model.slice(slashIndex + 1),
  };
};

const resolveRequestedModel = (payload: SessionPayload) => {
  const model = splitModel(asNonEmptyString(payload?.model));
  if (model) return model;

  const providerID = asNonEmptyString(payload?.providerID);
  const modelID = asNonEmptyString(payload?.modelID);
  return providerID && modelID ? { providerID, modelID } : null;
};

const FALLBACK_PROVIDER_ID = 'opencode';
const FALLBACK_MODEL_ID = 'big-pickle';
const MIN_GOAL_TOKEN_BUDGET = 1_000;
const MAX_GOAL_TOKEN_BUDGET = 100_000_000;


const resolveGoalInput = (payload: SessionPayload, prompt: string | null): GoalInput => {
  const enabled = payload?.goal === true;
  if (payload?.goalTokenBudget !== undefined && !enabled) {
    return { ok: false, error: 'goalTokenBudget requires goal' };
  }
  if (enabled && !prompt) {
    return { ok: false, error: 'prompt is required when goal is enabled' };
  }
  if (payload?.goalTokenBudget === undefined) {
    return { ok: true, enabled, tokenBudget: null };
  }
  const tokenBudget = payload.goalTokenBudget;
  if (!isSafeInteger(tokenBudget)
    || tokenBudget < MIN_GOAL_TOKEN_BUDGET
    || tokenBudget > MAX_GOAL_TOKEN_BUDGET) {
    return { ok: false, error: `goalTokenBudget must be an integer from ${MIN_GOAL_TOKEN_BUDGET} to ${MAX_GOAL_TOKEN_BUDGET}` };
  }
  return { ok: true, enabled, tokenBudget };
};

const isPrimaryAgentMode = (mode: AgentInfo['mode']) => !mode || mode === 'primary' || mode === 'all';

const findCatalogModel = (models: readonly ModelInfo[], providerID: string, ref: string) => {
  const ofProvider = models.filter((model) => model?.providerID === providerID);
  return ofProvider.find((model) => model?.id === ref)
    || ofProvider.find((model) => model?.modelID === ref)
    || null;
};

const hasCatalogModel = (models: readonly ModelInfo[], providerID: string, ref: string) => findCatalogModel(models, providerID, ref) !== null;

const isMissingFromCatalog = (models: readonly ModelInfo[], model: ModelSelection) => {
  if (models.length === 0 || isAutoModel(model)) return false;
  const entry = findCatalogModel(models, model.providerID, model.modelID);
  return !entry || entry.enabled === false;
};

const resolveVariant = (models: readonly ModelInfo[], providerID: string, modelID: string, variant: string | null | undefined) => {
  const normalized = asNonEmptyString(variant);
  if (!normalized) return undefined;
  const model = findCatalogModel(models, providerID, modelID);
  if (!model) return normalized;
  return asList(model.variants).some((entry) => entry?.id === normalized) ? normalized : undefined;
};

const findAgentBySetting = (agents: readonly AgentInfo[] | null, wantedName: string | null | undefined) => {
  const wanted = asNonEmptyString(wantedName)?.toLowerCase();
  if (!wanted) return null;
  if (agents === null) throw new TypeError("Cannot read properties of null (reading 'find')");
  return agents.find((agent) => agent?.id === wantedName)
    || agents.find((agent) => isText(agent?.name) && agent.name.toLowerCase() === wanted)
    || agents.find((agent) => isText(agent?.id) && agent.id.toLowerCase() === wanted)
    || null;
};

const resolveSelectionVariant = ({
  settings,
  projectDefaults,
  agents,
  agentName,
  models,
  providerID,
  modelID,
}: {
  settings: SessionSettings | null;
  projectDefaults: ReturnType<typeof resolveProjectDefaults>;
  agents: readonly AgentInfo[] | null;
  agentName: string | null | undefined;
  models: readonly ModelInfo[];
  providerID: string;
  modelID: string;
}) => {
  const model = findCatalogModel(models, providerID, modelID);
  if (!model) return undefined;
  const offered = asList(model.variants)
    .map((entry) => asNonEmptyString(entry?.id))
    .filter((value) => value !== null);
  if (offered.length === 0) return undefined;

  const agent = findAgentBySetting(agents, agentName);
  const agentModel = agent?.model;
  const agentVariant = agentModel?.providerID === providerID && agentModel?.id === modelID
    ? agentModel.variant
    : undefined;
  const projectDefaultModel = splitModel(projectDefaults?.defaultModel);
  const settingsDefaultModel = splitModel(asNonEmptyString(settings?.defaultModel));
  const configuredVariant = projectDefaultModel?.providerID === providerID && projectDefaultModel.modelID === modelID
    ? projectDefaults?.defaultVariant ?? undefined
    : settingsDefaultModel?.providerID === providerID && settingsDefaultModel.modelID === modelID
      ? settings?.defaultVariant ?? undefined
      : undefined;
  const remembered = hasEffortEntries(settings?.lastUsedEfforts) ? settings.lastUsedEfforts[`${providerID}/${modelID}`] : undefined;

  for (const source of [agentVariant, configuredVariant, remembered]) {
    if (source === null) return null;
    const parsed = z.enum(offered).safeParse(source);
    if (parsed.success) return parsed.data;
  }
  return undefined;
};

const isModelHidden = (hiddenModels: readonly unknown[], providerID: string, modelID: string) => hiddenModels.some(
  (hidden) => hasModelFields(hidden) && hidden.providerID === providerID && hidden.modelID === modelID,
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
);
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
const SessionReopenScopeSchema = z.strictObject({
  rootSessionId: z.string().min(1),
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  cwd: z.string().min(1),
  agentDirectory: z.string().min(1),
  agentDirectoryId: z.string().min(1),
  displayPath: z.string().min(1),
  env: z.record(z.string(), z.string()).optional(),
  hostTools: z.record(z.string(), z.boolean()).optional(),
});
const NativeSessionListSchema = z.strictObject({ items: z.array(RuntimeSessionSchema), errors: z.array(z.strictObject({ sessionId: z.string().min(1), code: ProblemCodeSchema })) });
const COLD_REFUSAL_CODES = new Set(['SESSION_NOT_FOUND', 'SERVICE_UNAVAILABLE', 'SESSION_RESTORE_FAILED']);
/**
 * A verified refusal that means the addressed root has no live worker, so a
 * reopen may fix it. Capacity exhaustion and in-flight runs name a service
 * that is up; retrying them would only repeat the same refusal.
 */
const isVerifiedColdRefusal = (error) => error?.refusalVerified === true
  && COLD_REFUSAL_CODES.has(error?.code)
  && !(error?.details && error.details.reason === 'worker_capacity');

const parseCommand = (schema, payload) => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new OpenChamberControlError('Session command is invalid', 400);
  return parsed.data;
};

||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

// The pick when nothing is configured or remembered: Big Pickle, else the first
// model. A model the user hid in the picker is skipped; configured defaults never
// come through here, so they stay honoured even when hidden. With every model
// hidden the session still needs one, so the unfiltered pick stands.
const resolveFallbackModel = (models, hiddenModels) => {
  // The picker stores hidden models by catalogue id, and the selection object
  // below carries the id in its `modelID` slot (see applySessionSelection).
  const isVisible = (providerID, modelID) => !isModelHidden(hiddenModels, providerID, modelID);
  const candidates = models.filter(
    (entry) => asNonEmptyString(entry?.providerID) && asNonEmptyString(entry?.id),
  );
  const bigPickle = findCatalogModel(candidates, FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID);
  const pick = (bigPickle && isVisible(bigPickle.providerID, bigPickle.id) ? bigPickle : null)
    || candidates.find((entry) => isVisible(entry.providerID, entry.id))
    || bigPickle
    || candidates[0];
  return pick ? { providerID: pick.providerID, modelID: pick.id } : null;
};

const resolveProjectDefaults = (settings, directory, projectId) => {
  const projects = Array.isArray(settings?.projects) ? settings.projects : [];
  const matchedProject = projectId
    ? projects.find((entry) => entry?.id === projectId) || null
    : projects.find((entry) => entry?.path === directory) || null;
  return {
    defaultAgent: asNonEmptyString(matchedProject?.defaultAgent),
    defaultModel: asNonEmptyString(matchedProject?.defaultModel),
    defaultVariant: asNonEmptyString(matchedProject?.defaultVariant),
  };
};

/**
 * One snapshot for this directory. Unknown catalogues can validate an explicit
 * choice permissively, but cannot establish the defaults for a new session.
 */
const fetchSelectionInputs = async ({ client, readSettingsFromDiskMigrated }) => {
  const settings = await readSettingsFromDiskMigrated();
  const options = { signal: AbortSignal.timeout(10_000) };
  const [models, agents, configEntries] = await Promise.all([
    client.model.list(undefined, options).then((response) => asList(response?.data)).catch(() => []),
    // v2 agents carry `id` (`build`, what prompts and sessions refer to) and a
    // display `name` (`Build`); every lookup here is by id.
    client.agent.list(undefined, options).then((response) => asList(response?.data)).catch(() => null),
    client.config.get(undefined, options).then((response) => asList(response)).catch(() => null),
  ]);
  if (configEntries === null) return { settings, models, agents, config: null };

  // Config entries arrive lowest priority first, so the last definition wins.
  const config = { defaultAgent: null, defaultModel: null };
  for (const entry of configEntries) {
    const info = entry?.info;
    if (!info) continue;
    const agent = asNonEmptyString(info.default_agent);
    if (agent) config.defaultAgent = agent;
    // Config `model` is the v2 selection spelling: "provider/model#variant" or
    // the expanded object form. The canonical parser folds both.
    const model = parseModelSelection(info.model);
    if (model) config.defaultModel = model;
  }

  return { settings, models, agents, config };
};

const resolveDefaultSelection = ({ agents, models, settings, projectDefaults, config, autoAvailable, requireDefaultAgent }) => {
  const primaryAgents = agents.filter((agent) => isPrimaryAgentMode(agent?.mode) && agent?.hidden !== true);
  let resolvedAgent = null;
  const projectDefaultAgent = asNonEmptyString(projectDefaults?.defaultAgent);
  const settingsDefaultAgent = asNonEmptyString(settings?.defaultAgent);
  const opencodeDefaultAgent = config.defaultAgent;
  const opencodeDefaultModel = config.defaultModel;
  // The project's default agent wins over the global one. v1 stored the agent's
  // display name; v2 agents are addressed by id (`build` vs `Build`), so a
  // setting saved before the upgrade still resolves.
  const configuredAgent = projectDefaultAgent || settingsDefaultAgent || opencodeDefaultAgent;
  if (requireDefaultAgent && configuredAgent && !findAgentBySetting(agents, configuredAgent)) {
    throw new OpenChamberControlError(`Configured agent '${configuredAgent}' is not available in this directory. Update the default agent in project/global settings or OpenCode config, or pass an explicit agent.`, 503);
  }
  if (projectDefaultAgent) resolvedAgent = findAgentBySetting(agents, projectDefaultAgent);
  if (!resolvedAgent && settingsDefaultAgent) resolvedAgent = findAgentBySetting(agents, settingsDefaultAgent);
  if (!resolvedAgent && opencodeDefaultAgent) {
    const candidate = agents.find((agent) => agent?.id === opencodeDefaultAgent) || null;
    if (candidate && isPrimaryAgentMode(candidate.mode) && candidate.hidden !== true) {
      resolvedAgent = candidate;
    }
  }
  if (!resolvedAgent) {
    resolvedAgent = primaryAgents.find((agent) => agent?.id === 'build') || primaryAgents[0] || agents[0] || null;
  }
=======

const resolveFallbackModel = (models: readonly ModelInfo[], hiddenModels: readonly unknown[]) => {
  const isVisible = (providerID: string, modelID: string) => !isModelHidden(hiddenModels, providerID, modelID);
  const candidates = models.filter(
    (entry) => asNonEmptyString(entry?.providerID) && asNonEmptyString(entry?.id),
  );
  const bigPickle = findCatalogModel(candidates, FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID);
  const pick = (bigPickle && isVisible(bigPickle.providerID, bigPickle.id) ? bigPickle : null)
    || candidates.find((entry) => isVisible(entry.providerID, entry.id))
    || bigPickle
    || candidates[0];
  return pick ? { providerID: pick.providerID, modelID: pick.id } : null;
};

const resolveProjectDefaults = (settings: SessionSettings | null, directory: string, projectId: string | undefined) => {
  const projects: readonly unknown[] = Array.isArray(settings?.projects) ? settings.projects : [];
  const matchedProject = projectId
    ? projects.find((entry) => hasProjectFields(entry) && entry.id === projectId) || null
    : projects.find((entry) => hasProjectFields(entry) && entry.path === directory) || null;
  const project = hasProjectFields(matchedProject) ? matchedProject : undefined;
  return {
    defaultAgent: asNonEmptyString(project?.defaultAgent),
    defaultModel: asNonEmptyString(project?.defaultModel),
    defaultVariant: asNonEmptyString(project?.defaultVariant),
  };
};

const resolveDefaultSelection = ({ agents, models, settings, projectDefaults, config, autoAvailable, requireDefaultAgent }: {
  agents: readonly AgentInfo[];
  models: readonly ModelInfo[];
  settings: SessionSettings | null;
  projectDefaults: ReturnType<typeof resolveProjectDefaults>;
  config: NonNullable<Awaited<ReturnType<typeof fetchSelectionInputs>>['config']>;
  autoAvailable: boolean;
  requireDefaultAgent: boolean;
}) => {
  const primaryAgents = agents.filter((agent) => isPrimaryAgentMode(agent?.mode) && agent?.hidden !== true);
  let resolvedAgent: AgentInfo | null = null;
  const projectDefaultAgent = asNonEmptyString(projectDefaults?.defaultAgent);
  const settingsDefaultAgent = asNonEmptyString(settings?.defaultAgent);
  const opencodeDefaultAgent = config.defaultAgent;
  const opencodeDefaultModel = config.defaultModel;
  const configuredAgent = projectDefaultAgent || settingsDefaultAgent || opencodeDefaultAgent;
  if (requireDefaultAgent && configuredAgent && !findAgentBySetting(agents, configuredAgent)) {
    throw new OpenChamberControlError(`Configured agent '${configuredAgent}' is not available in this directory. Update the default agent in project/global settings or OpenCode config, or pass an explicit agent.`, 503);
  }
  if (projectDefaultAgent) resolvedAgent = findAgentBySetting(agents, projectDefaultAgent);
  if (!resolvedAgent && settingsDefaultAgent) resolvedAgent = findAgentBySetting(agents, settingsDefaultAgent);
  if (!resolvedAgent && opencodeDefaultAgent) {
    const candidate = agents.find((agent) => agent?.id === opencodeDefaultAgent) || null;
    if (candidate && isPrimaryAgentMode(candidate.mode) && candidate.hidden !== true) {
      resolvedAgent = candidate;
    }
  }
  if (!resolvedAgent) {
    resolvedAgent = primaryAgents.find((agent) => agent?.id === 'build') || primaryAgents[0] || agents[0] || null;
  }
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
  let model = null;
  let variant;
  // Settings and project defaults store `provider/model` with the variant in
  // its own field, so these two stay a plain split; the OpenCode config model
  // can carry its variant and is parsed with the canonical parser.
  const projectDefaultModel = splitModel(projectDefaults?.defaultModel);
  const settingsDefaultModel = splitModel(settings?.defaultModel);
  // A saved choice is honoured even when the catalog has not listed it yet: a
  // discovery gap must not silently move the user onto another model.
  if (projectDefaultModel) {
    model = projectDefaultModel;
    variant = resolveVariant(models, model.providerID, model.modelID, projectDefaults?.defaultVariant);
  }
  if (!model && settingsDefaultModel) {
    model = settingsDefaultModel;
    variant = resolveVariant(models, model.providerID, model.modelID, settings?.defaultVariant);
  }
=======
  let model: ModelSelection | null = null;
  let variant: string | undefined;
  const projectDefaultModel = splitModel(projectDefaults?.defaultModel);
  const settingsDefaultModel = splitModel(asNonEmptyString(settings?.defaultModel));
  const runnable = (candidate: ModelSelection | null): candidate is ModelSelection => !!candidate && !isMissingFromCatalog(models, candidate);
  if (runnable(projectDefaultModel)) {
    model = projectDefaultModel;
    variant = resolveVariant(models, model.providerID, model.modelID, projectDefaults?.defaultVariant);
  }
  if (!model && runnable(settingsDefaultModel)) {
    model = settingsDefaultModel;
    variant = resolveVariant(models, model.providerID, model.modelID, asNonEmptyString(settings?.defaultVariant));
  }
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
  // An agent's model is a v2 `ModelRef`: `id` is the model id, not a composite.
  const agentModel = resolvedAgent?.model;
  if (!model && asNonEmptyString(agentModel?.providerID) && asNonEmptyString(agentModel?.id)) {
    model = { providerID: agentModel.providerID, modelID: agentModel.id };
    variant = resolveVariant(models, model.providerID, model.modelID, agentModel.variant);
  }

  if (!model && opencodeDefaultModel) {
    model = { providerID: opencodeDefaultModel.providerID, modelID: opencodeDefaultModel.modelID };
    variant = resolveVariant(models, model.providerID, model.modelID, opencodeDefaultModel.variant);
  }

  // The model last picked in a chat composer. Like a saved default it is kept
  // through catalog gaps; a model hidden since, or Auto on a server without
  // routing, is skipped.
  const hiddenModels = asList(settings?.hiddenModels);
  const lastSelectedModel = splitModel(settings?.lastSelectedModel);
  if (!model
    && lastSelectedModel
    && !isModelHidden(hiddenModels, lastSelectedModel.providerID, lastSelectedModel.modelID)
    && (autoAvailable || !isAutoModel(lastSelectedModel))) {
    model = lastSelectedModel;
  }

  if (!model) model = resolveFallbackModel(models, hiddenModels);

  return {
    agent: resolvedAgent?.id,
    model,
    variant,
  };
};

/**
 * The model an agent the caller named is bound to, if any. It outranks every
 * default: the binding is part of what running that agent means, and the
 * composer applies the same rule when the user picks an agent. The binding is
 * a v2 `ModelRef`, the shape `resolveDefaultSelection` reads for the
 * default-resolved agent.
 */
const resolveNamedAgentModel = (agents, agentID, models) => {
  const bound = agents.find((entry) => entry?.id === agentID)?.model;
  if (!asNonEmptyString(bound?.providerID) || !asNonEmptyString(bound?.id)) return null;
  const model = { providerID: bound.providerID, modelID: bound.id };
  return { model, variant: resolveVariant(models, model.providerID, model.modelID, bound.variant) };
};

/**
 * v2 selects model and agent per session, not per prompt: the choice is
 * switched once and then persists, so every dispatch sets it explicitly rather
 * than passing it alongside the prompt.
 */
const applySessionSelection = async ({ client, sessionID, model, agent, variant }) => {
  if (model) {
    await client.session.switchModel({
      sessionID,
      model: { id: model.modelID, providerID: model.providerID, ...(variant ? { variant } : {}) },
    });
  }
  if (agent) await client.session.switchAgent({ sessionID, agent });
};

const createSession = async ({ client, directory, title, titleByUser = false, startedByExtension = null }) => {
  const input = { location: { directory } };
  const openchamberMetadata = {};
  if (title) {
    input.title = title;
    if (titleByUser) openchamberMetadata.workTitle = { title, by: 'user' };
  }
  if (startedByExtension) openchamberMetadata.startedByExtension = startedByExtension;
  if (Object.keys(openchamberMetadata).length > 0) input.metadata = { openchamber: openchamberMetadata };
  const session = await client.session.create(input);
  const sessionID = asNonEmptyString(session?.id);
  if (!sessionID) throw new Error('failed to create session');
  return sessionID;
};

const forkSession = async ({ client, sessionID, messageID }) => {
  const session = await client.session.fork({
    sessionID,
    // OpenCode 2.0.8 replaced the SessionForkBoundary object with an optional
    // `before` message id. Omitting it carries the whole session over, which is
    // what the old `{ type: 'through' }` boundary meant.
    ...(messageID ? { before: messageID } : {}),
  });
  if (!asNonEmptyString(session?.id)) throw new Error('failed to fork session');
  return session;
};

/**
 * The session whose agent sent a prompt, as the prompt's message records it
 * (`metadata.openchamber.promptedBy`). The title is a fallback for a reader
 * that cannot see that session; a failed read records the id alone.
 */
const readPromptOrigin = async (client, sessionID) => {
  try {
    const title = asNonEmptyString((await client.session.get({ sessionID }))?.title);
    return title ? { sessionID, title } : { sessionID };
  } catch {
    return { sessionID };
  }
};

const listMessages = async ({ client, sessionID, limit }) => {
  const response = await client.message.list({ sessionID, limit, order: 'desc' });
  return asList(response?.data);
};

const latestCompletedAssistantMessageID = async ({ client, sessionID }) => {
  let messages;
  try {
    messages = await listMessages({ client, sessionID, limit: 100 });
  } catch {
    return null;
  }
  let latest = null;
  for (const message of messages) {
    if (message?.type !== 'assistant' || !Number.isFinite(message?.time?.completed)) continue;
    if (!latest || (message.time.created || 0) >= (latest.time?.created || 0)) latest = message;
  }
  return asNonEmptyString(latest?.id);
};

/**
 * The id of the newest `idle` record OpenCode appended to the session (it
 * marks the end of a run), null when the session has none, or undefined when
 * the history could not be read. A later delivery compares record ids, never
 * clock times, so a remote OpenCode with a skewed clock still matches.
 */
const latestIdleRecordID = async ({ client, sessionID }) => {
  let messages;
  try {
    messages = await listMessages({ client, sessionID, limit: 100 });
  } catch {
    return undefined;
  }
  let latest = null;
  for (const message of messages) {
    if (message?.type !== 'idle' || !asNonEmptyString(message?.id)) continue;
    if (!latest || (message.time?.created || 0) >= (latest.time?.created || 0)) latest = message;
  }
  return latest ? latest.id : null;
};
=======
  const agentModel = resolvedAgent?.model;
  if (!model && hasText(agentModel?.providerID) && hasText(agentModel?.id)
    && runnable({ providerID: agentModel.providerID, modelID: agentModel.id })) {
    model = { providerID: agentModel.providerID, modelID: agentModel.id };
    variant = resolveVariant(models, model.providerID, model.modelID, agentModel.variant);
  }

  if (!model && opencodeDefaultModel && runnable(opencodeDefaultModel)) {
    model = { providerID: opencodeDefaultModel.providerID, modelID: opencodeDefaultModel.modelID };
    variant = resolveVariant(models, model.providerID, model.modelID, opencodeDefaultModel.variant);
  }

  const hiddenModels = isList(settings?.hiddenModels) ? settings.hiddenModels : [];
  const lastSelectedModel = splitModel(asNonEmptyString(settings?.lastSelectedModel));
  if (!model
    && runnable(lastSelectedModel)
    && !isModelHidden(hiddenModels, lastSelectedModel.providerID, lastSelectedModel.modelID)
    && (autoAvailable || !isAutoModel(lastSelectedModel))) {
    model = lastSelectedModel;
  }

  if (!model) model = resolveFallbackModel(models, hiddenModels);

  return {
    agent: resolvedAgent?.id,
    model,
    variant,
  };
};

const resolveNamedAgentModel = (agents: readonly AgentInfo[], agentID: string, models: readonly ModelInfo[]) => {
  const bound = agents.find((entry) => entry?.id === agentID)?.model;
  if (!hasText(bound?.providerID) || !hasText(bound?.id)) return null;
  const model = { providerID: bound.providerID, modelID: bound.id };
  return { model, variant: resolveVariant(models, model.providerID, model.modelID, bound.variant) };
};

const applySessionSelection = async ({ client, sessionID, model, agent, variant }: Selection & { client: SessionClient; sessionID: string }) => {
  if (model) {
    const selected: SwitchModel = { id: model.modelID, providerID: model.providerID };
    if (variant) selected.variant = variant;
    await client.session.switchModel({
      sessionID,
      model: selected,
    });
  }
  if (agent) await client.session.switchAgent({ sessionID, agent });
};

const forkSession = async ({ client, sessionID, messageID }: { client: SessionClient; sessionID: string; messageID: string | undefined }) => {
  const input: ForkInput = { sessionID };
  if (messageID) input.before = messageID;
  const session = await client.session.fork(input);
  if (!asNonEmptyString(session?.id)) throw new Error('failed to fork session');
  return session;
};

const readPromptOrigin = async (client: SessionClient, sessionID: string) => {
  try {
    const title = asNonEmptyString((await client.session.get({ sessionID }))?.title);
    return title ? { sessionID, title } : { sessionID };
  } catch {
    return { sessionID };
  }
};

const listMessages = async ({ client, sessionID, limit }: { client: SessionClient; sessionID: string; limit: number }) => {
  const response = await client.message.list({ sessionID, limit, order: 'desc' });
  return asList(response?.data);
};

const latestCompletedAssistantMessageID = async ({ client, sessionID }: { client: SessionClient; sessionID: string }) => {
  let messages;
  try {
    messages = await listMessages({ client, sessionID, limit: 100 });
  } catch {
    return null;
  }
  let latest: Message | null = null;
  for (const message of messages) {
    if (message?.type !== 'assistant' || !Number.isFinite(message?.time?.completed)) continue;
    if (!latest || (message.time.created || 0) >= (latest.time?.created || 0)) latest = message;
  }
  return asNonEmptyString(latest?.id);
};

const latestIdleRecordID = async ({ client, sessionID }: { client: SessionClient; sessionID: string }) => {
  let messages;
  try {
    messages = await listMessages({ client, sessionID, limit: 100 });
  } catch {
    return undefined;
  }
  let latest: Message | null = null;
  for (const message of messages) {
    if (message?.type !== 'idle' || !asNonEmptyString(message?.id)) continue;
    if (!latest || (message.time?.created || 0) >= (latest.time?.created || 0)) latest = message;
  }
  return latest ? latest.id : null;
};
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts

const MAX_ARCHIVE_BATCH = 500;

const parseIdBatch = (payload: SessionPayload): { ok: true; ids: string[] } | { ok: false; error: string } => {
  const rawIds = payload?.ids;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return { ok: false, error: 'ids must be a non-empty array of session ids' };
  }
  if (rawIds.length > MAX_ARCHIVE_BATCH) {
    return { ok: false, error: `ids must contain at most ${MAX_ARCHIVE_BATCH} session ids` };
  }

  const ids = [];
  for (const value of rawIds) {
    const parsed = EntityIdSchema.safeParse(value);
    if (!parsed.success) return { ok: false, error: 'ids must contain valid session ids' };
    ids.push(parsed.data);
  }
  return { ok: true, ids };
};

const parseArchiveRequest = (payload: SessionPayload): { ok: true; ids: string[]; archivedAt: number } | { ok: false; error: string } => {
  const parsed = parseIdBatch(payload);
  if (!parsed.ok) return parsed;

  const archivedAt = payload?.archivedAt;
  if (archivedAt !== undefined && (!isSafeInteger(archivedAt) || archivedAt <= 0)) {
    return { ok: false, error: 'archivedAt must be a positive integer timestamp' };
  }

  return { ok: true, ids: parsed.ids, archivedAt: archivedAt ?? Date.now() };
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
const resolveRequestedDirectory = async ({ payload, readSettingsFromDiskMigrated, sanitizeProjects, validateDirectoryPath, chatsScope }) => {
  const projectID = asNonEmptyString(payload?.projectId) || asNonEmptyString(payload?.projectID);
  if (projectID) {
    const settings = await readSettingsFromDiskMigrated();
    const projects = sanitizeProjects(settings?.projects || []);
    const project = projects.find((entry) => entry.id === projectID) || null;
    if (!project?.path) {
      return { ok: false, status: 404, error: 'Project not found' };
    }
    const validated = await validateDirectoryPath(project.path);
    return validated.ok
      ? { ok: true, directory: validated.directory, projectId: projectID, projectPath: project.path }
      : { ok: false, status: 400, error: validated.error || 'Invalid project directory' };
  }
=======
type ResolvedDirectory =
  | { ok: true; directory: string; projectId?: string; projectPath?: string }
  | { ok: false; status?: number; error: string };

const resolveRequestedDirectory = async ({ payload, readSettingsFromDiskMigrated, sanitizeProjects, validateDirectoryPath, chatsScope }: Pick<SessionServiceDependencies, 'readSettingsFromDiskMigrated' | 'sanitizeProjects' | 'validateDirectoryPath' | 'chatsScope'> & { payload: SessionPayload }): Promise<ResolvedDirectory> => {
  const projectID = asNonEmptyString(payload?.projectId) || asNonEmptyString(payload?.projectID);
  if (projectID) {
    const settings = await readSettingsFromDiskMigrated();
    const projects = sanitizeProjects(settings?.projects || []);
    const project = projects.find((entry) => entry.id === projectID) || null;
    if (!project?.path) {
      return { ok: false, status: 404, error: 'Project not found' };
    }
    const validated = await validateDirectoryPath(project.path);
    return validated.ok
      ? { ok: true, directory: validated.directory, projectId: projectID, projectPath: project.path }
      : { ok: false, status: 400, error: validated.error || 'Invalid project directory' };
  }
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
const createCanonicalSessionService = (dependencies) => {
  const { service, resolveWorkspaceScope, resolveSessionScope, resolveHostSessionScope, listWorkspaceScopes, registerSessionScope, resolveAttachments, capturePrompt, beforeDispatch, onPromptAccepted, directCommandAdmissionStore, publishSessionEvent, archiveStore, sessionMetadataStore, persistSessionMetadata, updateSessionMetadata, broadcastGlobalUiEvent, onArchiveDeleted } = dependencies;
  const { agentScopeStore, resolveHostRelocationScope } = dependencies;
  const relocationControls = new Set();
  const worktreeArchiveGeneration = `host_${process.pid}_${randomUUID()}`;
  // The retained session-worktree move: same creation pipeline as the New
  // worktree dialog, one stash for the carried files, and `relocate` for the
  // move itself. Every dependency is injected so the decision stays testable
  // and the Host owns the Git and bootstrap authority.
  const worktreeMover = typeof dependencies.createSessionWorktreeMover === 'function'
    ? dependencies.createSessionWorktreeMover(dependencies.worktreeMove ?? {})
    : createSessionWorktreeMover(dependencies.worktreeMove ?? {});
  const requiredFunctions = [service?.request, resolveWorkspaceScope, resolveSessionScope, resolveHostSessionScope,
    registerSessionScope, resolveAttachments, capturePrompt, beforeDispatch, onPromptAccepted,
  directCommandAdmissionStore?.claim, directCommandAdmissionStore?.accept];
  if (!service || requiredFunctions.some((candidate) => !z.function().safeParse(candidate).success))
    throw new Error('session routes require the Agent service, Host scope resolvers, registration, attachment, delivery and direct command admission owners');
  const resolveHostTools = dependencies.resolveHostTools
    ? dependencies.resolveHostTools
    : async () => {
      const settings = typeof dependencies.readSettings === 'function'
        ? await dependencies.readSettings().catch(() => null)
        : null;
      if (!settings) return undefined;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
  const directory = asNonEmptyString(payload?.directory);
  const validated = await validateDirectoryPath(directory);
  if (!validated.ok) return { ok: false, status: 400, error: validated.error || 'Invalid directory' };
  if (chatsScope) {
    const chatsRoot = await validateDirectoryPath(chatsScope.root);
    if (chatsRoot.ok) {
      const relative = path.relative(chatsRoot.directory, validated.directory);
      if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
        return { ok: true, directory: validated.directory };
      }
    }
  }
  const settings = await readSettingsFromDiskMigrated();
  const projects = sanitizeProjects(settings?.projects || []);
  let project = projects.find((entry) => entry.path === validated.directory);
  if (!project && projects.length > 0) {
    const { root } = await resolvePrimaryWorktreeRoot(validated.directory);
    project = projects.find((entry) => entry.path === root);
  }
  return { ok: true, directory: validated.directory, ...(project ? { projectId: project.id, projectPath: project.path } : {}) };
};

// createWorktree returns while the worktree is still being populated in the
// background (git reset --hard after a --no-checkout add). Dispatching a
// prompt into a half-populated directory makes opencode's run die with
// UnknownError (agent and config files are not there yet), so wait until the
// bootstrap task completes before creating the session and dispatching. Its
// completion does not establish OpenCode's directory-scoped selection inputs.
// The first deadline covers git's part. The project's setup commands run after
// it (phase `git-ready`) and get their own, longer one: a dependency install
// often needs more than a minute. Both together stay well under the six
// minutes or so after which Bun's fetch, and with it the agent tool's request,
// gives up. Past it the caller gets a not-ready answer and no work starts in the
// worktree, rather than wait on a command that never exits.
const WORKTREE_BOOTSTRAP_TIMEOUT_MS = 60_000;
const WORKTREE_SETUP_TIMEOUT_MS = 3 * 60_000;
const NO_WORKTREE_SETUP = Object.freeze({ startCommand: '', untrustedSkipped: [] });

/**
 * A worktree from a pull or merge request: its number, and the folder and
 * branch names when the caller chose them. The head, the fork and its remote
 * come from the provider; a start ref or upstream would contradict them.
 */
const resolvePullRequestInput = (payload) => {
  if (payload?.pullRequest === undefined) return null;
  if (!Number.isSafeInteger(payload.pullRequest) || payload.pullRequest < 1) {
    throw new OpenChamberControlError('pullRequest must be a pull or merge request number, such as 42', 400);
  }
  if (payload.worktree?.startRef !== undefined || payload.setUpstream !== undefined) {
    throw new OpenChamberControlError('pullRequest checks out the pull request\'s own branch; do not combine it with startRef or setUpstream', 400);
  }
  const input = { number: payload.pullRequest };
  const name = asNonEmptyString(payload.worktree?.name);
  if (name) input.name = name;
  const branchName = asNonEmptyString(payload.worktree?.branchName);
  if (branchName) input.branchName = branchName;
  return input;
};

const resolveWorktreeInput = (payload) => {
  if (!payload?.worktree || typeof payload.worktree !== 'object') return null;
  const name = asNonEmptyString(payload.worktree.name);
  if (!name) return null;
  const branchName = asNonEmptyString(payload.worktree.branchName);
  const startRef = asNonEmptyString(payload.worktree.startRef);
  return {
    mode: 'new',
    name,
    ...(branchName ? { branchName } : {}),
    ...(startRef ? { startRef } : {}),
    ...(typeof payload.setUpstream === 'boolean' ? { setUpstream: payload.setUpstream } : {}),
  };
};

export const createOpenChamberSessionService = (dependencies) => {
  const {
    chatsScope = null,
    readSettingsFromDiskMigrated,
    sanitizeProjects,
    validateDirectoryPath,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    waitForOpenCodeReady,
    emitSessionCreatedEvent,
    broadcastGlobalUiEvent,
    onSessionArchived = null,
    createSessionGoal: createSessionGoalOverride,
    sessionKnowledgeRuntime = null,
    worktreeBootstrapStore,
    hydrateWorktreeCheckout,
    // Creates a worktree from a pull or merge request through the Git routes'
    // contributor pipeline. Absent where contributor worktrees are not served.
    createChangeRequestWorktree = null,
    dataDir = null,
    archiveStore: injectedArchiveStore = null,
    // Archive state on OpenCode; module tests pass a fake.
    openCodeArchive: injectedOpenCodeArchive = null,
    sessionMetadataStore: injectedSessionMetadataStore = null,
    // Injected by the server so every metadata write takes the same path:
    // store, broadcast, and tell the goal loop. Falls back to store+broadcast
    // when it is absent, which is what module tests use.
    persistSessionMetadata = null,
    // Same story for a write decided from the record at write time (the
    // session links the UI owns). Falls back to store+broadcast in module
    // tests.
    updateSessionMetadata = null,
    createOpenCodeClient = defaultCreateOpenCodeClient,
    createWorktree = createWorktreeDefault,
    getWorktreeBootstrapStatus = getWorktreeBootstrapStatusDefault,
    waitForActiveWorktreeBootstrap = waitForActiveWorktreeBootstrapDefault,
    // What moving a session into a new worktree needs from git beyond creation.
    removeWorktree = removeWorktreeDefault,
    getBranches = getBranchesDefault,
    stashPush = stashPushDefault,
    getPathsWithoutChanges = getPathsWithoutChangesDefault,
    stashApply = stashApplyDefault,
    stashDrop = stashDropDefault,
    listStashes = listStashesDefault,
    // A project opened on a folder of its repository starts the sessions of its
    // new worktrees in the same folder (`./worktree-start-directory.js`).
    resolveWorktreeTopLevel = resolveWorktreeTopLevelDefault,
    validateWorktreeDirectory = validateWorktreeDirectoryDefault,
    // Auto routing. Sessions dispatched here talk to OpenCode through the SDK,
    // not through the proxy that intercepts the Auto sentinel, so a default of
    // `openchamber/auto` (Session Defaults) is resolved here before the
    // session is switched onto it. Null when routing is not wired in.
    resolveAutoSelection = null,
    // Whether routing can run Auto right now (the composer's own test). Null
    // when routing is not wired in.
    isAutoReady = null,
    // A registered project's merged setup (`projectConfigRuntime.readProjectSetup`).
    // A new worktree runs its setup commands; without it, none.
    readProjectSetup = null,
  } = dependencies;

  if ((!injectedArchiveStore || !injectedSessionMetadataStore) && !dataDir) {
    throw new Error('openchamber session routes need either both stores or a dataDir');
  }
  const archiveStore = injectedArchiveStore || createArchiveStore({ dataDir });
  const sessionMetadataStore = injectedSessionMetadataStore || createSessionMetadataStore({
    dataDir,
    openCode: createOpenCodeSessionMetadata({
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      createOpenCodeClient,
    }),
  });

  const openCodeBaseUrl = () => buildOpenCodeUrl('/', '').replace(/\/$/, '');
  const clientFor = (directory) => createOpenCodeClient({
    baseUrl: openCodeBaseUrl(),
    headers: getOpenCodeAuthHeaders(),
    directory,
  });

  const broadcastArchived = (sessionID, archivedAt) => {
    broadcastGlobalUiEvent?.({
      type: 'openchamber:session-archived',
      properties: { sessionID, archivedAt },
    });
    onSessionArchived?.(sessionID, archivedAt);
  };
  const sessionArchive = createSessionArchive({
    store: archiveStore,
    openCode: injectedOpenCodeArchive || createOpenCodeSessionArchive({ clientFor }),
    announce: broadcastArchived,
  });

  const resolveStartDirectory = createStartDirectoryResolver({ resolveWorktreeTopLevel, validateWorktreeDirectory });

  const toPathKey = (value) => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const holdsPath = (outer, inner) => inner === outer || inner.startsWith(`${outer}/`);
  // The checkout root is the directory minus its folder, in the same spelling as
  // the project paths; git's own root has symlinks resolved. Null when unknown,
  // and then path containment alone decides.
  const checkoutRootOf = (directoryKey, folder) => {
    if (folder === null) return null;
    if (folder === '') return directoryKey;
    return directoryKey.endsWith(`/${folder}`) ? directoryKey.slice(0, -folder.length - 1) : null;
  };

  /**
   * A session in a linked worktree (`<wtA>/ai/src`) belongs to no registered
   * project path. Its folder inside that checkout (`ai/src`) names the project
   * the same way the UI does: the longest registered project in the primary
   * checkout whose folder holds that one, so `/repo/ai` wins over `/repo`.
   */
  const projectPathInPrimaryCheckout = async (directory, folder, projects) => {
    const primaryRoot = toPathKey((await resolvePrimaryWorktreeRoot(directory)).root);
    let best = null;
    for (const project of projects) {
      const projectKey = toPathKey(project.path);
      if (!holdsPath(primaryRoot, projectKey)) continue;
      const projectFolder = projectKey.slice(primaryRoot.length).replace(/^\/+/, '');
      if (projectFolder && !holdsPath(projectFolder, folder)) continue;
      if (!best || projectFolder.length > best.folder.length) best = { path: project.path, folder: projectFolder };
    }
    return best?.path ?? null;
  };

  /**
   * Best effort: the path of the project the directory belongs to. That is the
   * registered project whose path contains it (the longest one, so a session in
   * `/repo/ai/src` belongs to the project `/repo/ai`) inside the same checkout;
   * a project that only contains the checkout, such as `/repo` around a worktree
   * at `/repo/.worktrees/a`, does not count. Else the project whose folder holds
   * the directory's folder in the primary checkout, else the project resolved
   * the way a create request does, else the directory itself.
   */
  const projectPathFor = async (directory) => {
    const projects = await readSettingsFromDiskMigrated()
      .then((settings) => sanitizeProjects(settings?.projects || []))
      .catch(() => []);
    const directoryKey = toPathKey(directory);
    // `prefix` is absent when git could not read the directory.
    const prefix = (await resolveWorktreeTopLevel(directory).catch(() => null))?.prefix;
    const folder = prefix === undefined ? null : toPathKey(prefix);
    const checkoutRoot = checkoutRootOf(directoryKey, folder);
    let containing = null;
    for (const project of projects) {
      const projectKey = toPathKey(project.path);
      if (!holdsPath(projectKey, directoryKey)) continue;
      if (checkoutRoot && !holdsPath(checkoutRoot, projectKey)) continue;
      if (!containing || projectKey.length > toPathKey(containing).length) containing = project.path;
    }
    if (containing) return containing;
    if (folder !== null) {
      const inPrimaryCheckout = await projectPathInPrimaryCheckout(directory, folder, projects).catch(() => null);
      if (inPrimaryCheckout) return inPrimaryCheckout;
    }
    const resolved = await resolveRequestedDirectory({
      chatsScope,
      payload: { directory },
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      validateDirectoryPath,
    }).catch(() => null);
    return resolved?.ok ? resolved.projectPath ?? resolved.directory : directory;
  };

  /**
   * The setup commands a new worktree made from `directory` runs: those of
   * the registered project `projectPathFor` names, resolved here because no
   * client is there to ask about untrusted shared ones
   * (`../projects/worktree-setup.js`). A directory outside every registered
   * project has no setup, as in the UI.
   */
  const worktreeSetupForDirectory = async (directory) => {
    if (!(readProjectSetup instanceof Function)) return NO_WORKTREE_SETUP;
    const projectPath = await projectPathFor(directory);
    const settings = await readSettingsFromDiskMigrated();
    const project = sanitizeProjects(settings?.projects || []).find((entry) => entry.path === projectPath);
    if (!project) return NO_WORKTREE_SETUP;
    return worktreeSetupOf(await readProjectSetup(project.id), project.path);
  };

  /** Resolves `{ setupStillRunning }`: true when the setup deadline passed with git done. The caller starts no work then. */
  const waitForWorktreeBootstrapReady = async ({ directory, bootstrapStore }) => {
    const settled = waitForActiveWorktreeBootstrap(directory).then(() => true);
    const settledWithin = async (milliseconds) => {
      let timeout;
      try {
        return await Promise.race([settled, new Promise((resolve) => {
          timeout = setTimeout(() => resolve(false), milliseconds);
        })]);
      } finally {
        clearTimeout(timeout);
      }
    };
    if (!(await settledWithin(WORKTREE_BOOTSTRAP_TIMEOUT_MS))) {
      const running = await getWorktreeBootstrapStatus(directory, { bootstrapStore });
      if (running?.status === 'pending' && running.phase !== 'git-ready') {
        throw new OpenChamberControlError('Timed out waiting for the worktree bootstrap', 500);
      }
      // OpenCode's checkout gate opens at `git-ready`, so the session can start there.
      if (running?.status === 'pending' && !(await settledWithin(WORKTREE_SETUP_TIMEOUT_MS))) {
        return { setupStillRunning: true };
      }
    }
    const status = await getWorktreeBootstrapStatus(directory, { bootstrapStore });
    if (status?.status === 'failed') {
      throw new OpenChamberControlError(`Worktree bootstrap failed: ${status.error || 'unknown error'}`, 500);
    }
    if (status?.status !== 'ready') {
      throw new OpenChamberControlError('Worktree bootstrap has not completed', 503);
    }
    return { setupStillRunning: false };
  };

  /**
   * The selection an existing session already runs on. v2 keeps it on the
   * session record, so there is no need to walk the message history for it.
   */
  const fetchSessionSelection = async ({ client, sessionID }) => {
    try {
      const session = await client.session.get({ sessionID });
      const providerID = asNonEmptyString(session?.model?.providerID);
      const modelID = asNonEmptyString(session?.model?.id);
=======
  const directory = asNonEmptyString(payload?.directory);
  const validated = await validateDirectoryPath(directory);
  if (!validated.ok) return { ok: false, status: 400, error: validated.error || 'Invalid directory' };
  if (chatsScope) {
    const chatsRoot = await validateDirectoryPath(chatsScope.root);
    if (chatsRoot.ok) {
      const relative = path.relative(chatsRoot.directory, validated.directory);
      if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
        return { ok: true, directory: validated.directory };
      }
    }
  }
  const settings = await readSettingsFromDiskMigrated();
  const projects = sanitizeProjects(settings?.projects || []);
  let project = projects.find((entry) => entry.path === validated.directory);
  if (!project && projects.length > 0) {
    const { root } = await resolvePrimaryWorktreeRoot(validated.directory);
    project = projects.find((entry) => entry.path === root);
  }
  const result: Extract<ResolvedDirectory, { ok: true }> = { ok: true, directory: validated.directory };
  if (project) {
    result.projectId = project.id;
    result.projectPath = project.path;
  }
  return result;
};

const WORKTREE_BOOTSTRAP_TIMEOUT_MS = 60_000;
const WORKTREE_SETUP_TIMEOUT_MS = 3 * 60_000;
const NO_WORKTREE_SETUP: Readonly<WorktreeSetup> = Object.freeze({ startCommand: '', createCommand: '', untrustedSkipped: [] });

const resolvePullRequestInput = (payload: SessionPayload) => {
  if (payload?.pullRequest === undefined) return null;
  if (!isSafeInteger(payload.pullRequest) || payload.pullRequest < 1) {
    throw new OpenChamberControlError('pullRequest must be a pull or merge request number, such as 42', 400);
  }
  if (worktreeFields(payload)?.startRef !== undefined || payload.setUpstream !== undefined) {
    throw new OpenChamberControlError('pullRequest checks out the pull request\'s own branch; do not combine it with startRef or setUpstream', 400);
  }
  const input: PullRequestInput = { number: payload.pullRequest };
  const name = asNonEmptyString(worktreeFields(payload)?.name);
  if (name) input.name = name;
  const branchName = asNonEmptyString(worktreeFields(payload)?.branchName);
  if (branchName) input.branchName = branchName;
  return input;
};

const isWorktreeFields = (value: unknown): value is WorktreeFields => !!value && typeof value === 'object';
const resolveWorktreeInput = (payload: SessionPayload) => {
  if (!isWorktreeFields(payload?.worktree)) return null;
  const name = asNonEmptyString(payload.worktree.name);
  if (!name) return null;
  const branchName = asNonEmptyString(payload.worktree.branchName);
  const startRef = asNonEmptyString(payload.worktree.startRef);
  const input: WorktreeInput = { mode: 'new', name };
  if (branchName) input.branchName = branchName;
  if (startRef) input.startRef = startRef;
  if (isBoolean(payload.setUpstream)) input.setUpstream = payload.setUpstream;
  return input;
};

export const createOpenChamberSessionService = (dependencies: SessionServiceDependencies) => {
  const {
    chatsScope = null,
    readSettingsFromDiskMigrated,
    sanitizeProjects,
    validateDirectoryPath,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    waitForOpenCodeReady,
    emitSessionCreatedEvent,
    broadcastGlobalUiEvent,
    onSessionArchived = null,
    createSessionGoal: createSessionGoalOverride,
    sessionKnowledgeRuntime = null,
    worktreeBootstrapStore,
    hydrateWorktreeCheckout,
    createChangeRequestWorktree = null,
    selectionWarmUp = undefined,
    dataDir = null,
    archiveStore: injectedArchiveStore = null,
    openCodeArchive: injectedOpenCodeArchive = null,
    sessionMetadataStore: injectedSessionMetadataStore = null,
    persistSessionMetadata = null,
    updateSessionMetadata = null,
    createOpenCodeClient = defaultCreateOpenCodeClient,
    createWorktree = createWorktreeDefault,
    getWorktreeBootstrapStatus = getWorktreeBootstrapStatusDefault,
    waitForActiveWorktreeBootstrap = waitForActiveWorktreeBootstrapDefault,
    removeWorktree = removeWorktreeDefault,
    getBranches = getBranchesDefault,
    stashPush = stashPushDefault,
    getPathsWithoutChanges = getPathsWithoutChangesDefault,
    stashApply = stashApplyDefault,
    stashDrop = stashDropDefault,
    listStashes = listStashesDefault,
    resolveWorktreeTopLevel = resolveWorktreeTopLevelDefault,
    validateWorktreeDirectory = validateWorktreeDirectoryDefault,
    resolveAutoSelection = null,
    isAutoReady = null,
    readProjectSetup = null,
  } = dependencies;

  if ((!injectedArchiveStore || !injectedSessionMetadataStore) && !dataDir) {
    throw new Error('openchamber session routes need either both stores or a dataDir');
  }
  const archiveStore = injectedArchiveStore || createArchiveStore({ dataDir: requiredDataDir(dataDir) });
  const sessionMetadataStore = injectedSessionMetadataStore || createSessionMetadataStore({
    dataDir: requiredDataDir(dataDir),
    openCode: createOpenCodeSessionMetadata({
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      createOpenCodeClient,
    }),
  });

  const openCodeBaseUrl = () => buildOpenCodeUrl('/', '').replace(/\/$/, '');
  const clientFor = (directory?: string) => createOpenCodeClient({
    baseUrl: openCodeBaseUrl(),
    headers: getOpenCodeAuthHeaders(),
    directory,
  });

  const broadcastArchived = (sessionID: string, archivedAt: number | null) => {
    broadcastGlobalUiEvent?.({
      type: 'openchamber:session-archived',
      properties: { sessionID, archivedAt },
    });
    onSessionArchived?.(sessionID, archivedAt);
  };
  const sessionArchive = createSessionArchive({
    store: archiveStore,
    openCode: injectedOpenCodeArchive || createOpenCodeSessionArchive({ clientFor }),
    announce: broadcastArchived,
  });

  const resolveStartDirectory = createStartDirectoryResolver({ resolveWorktreeTopLevel, validateWorktreeDirectory });

  const toPathKey = (value: string | undefined) => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const holdsPath = (outer: string, inner: string) => inner === outer || inner.startsWith(`${outer}/`);
  const checkoutRootOf = (directoryKey: string, folder: string | null) => {
    if (folder === null) return null;
    if (folder === '') return directoryKey;
    return directoryKey.endsWith(`/${folder}`) ? directoryKey.slice(0, -folder.length - 1) : null;
  };

  const projectPathInPrimaryCheckout = async (directory: string, folder: string, projects: SessionProject[]) => {
    const primaryRoot = toPathKey((await resolvePrimaryWorktreeRoot(directory)).root);
    let best: { path: string; folder: string } | null = null;
    for (const project of projects) {
      const projectKey = toPathKey(project.path);
      if (!holdsPath(primaryRoot, projectKey)) continue;
      const projectFolder = projectKey.slice(primaryRoot.length).replace(/^\/+/, '');
      if (projectFolder && !holdsPath(projectFolder, folder)) continue;
      if (!best || projectFolder.length > best.folder.length) best = { path: project.path, folder: projectFolder };
    }
    return best?.path ?? null;
  };

  const projectPathFor = async (directory: string) => {
    const projects = await readSettingsFromDiskMigrated()
      .then((settings) => sanitizeProjects(settings?.projects || []))
      .catch(() => []);
    const directoryKey = toPathKey(directory);
    const prefix = (await resolveWorktreeTopLevel(directory).catch(() => null))?.prefix;
    const folder = prefix === undefined ? null : toPathKey(prefix);
    const checkoutRoot = checkoutRootOf(directoryKey, folder);
    let containing: string | null = null;
    for (const project of projects) {
      const projectKey = toPathKey(project.path);
      if (!holdsPath(projectKey, directoryKey)) continue;
      if (checkoutRoot && !holdsPath(checkoutRoot, projectKey)) continue;
      if (!containing || projectKey.length > toPathKey(containing).length) containing = project.path;
    }
    if (containing) return containing;
    if (folder !== null) {
      const inPrimaryCheckout = await projectPathInPrimaryCheckout(directory, folder, projects).catch(() => null);
      if (inPrimaryCheckout) return inPrimaryCheckout;
    }
    const resolved = await resolveRequestedDirectory({
      chatsScope,
      payload: { directory },
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      validateDirectoryPath,
    }).catch(() => null);
    return resolved?.ok ? resolved.projectPath ?? resolved.directory : directory;
  };

  const worktreeSetupForDirectory = async (directory: string) => {
    if (!(readProjectSetup instanceof Function)) return NO_WORKTREE_SETUP;
    const projectPath = await projectPathFor(directory);
    const settings = await readSettingsFromDiskMigrated();
    const project = sanitizeProjects(settings?.projects || []).find((entry) => entry.path === projectPath);
    if (!project) return NO_WORKTREE_SETUP;
    return worktreeSetupOf(await readProjectSetup(project.id), project.path);
  };

  const waitForWorktreeBootstrapReady = async ({ directory, bootstrapStore }: { directory: string; bootstrapStore: BootstrapStore }) => {
    const settled = waitForActiveWorktreeBootstrap(directory).then(() => true);
    const settledWithin = async (milliseconds: number) => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([settled, new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), milliseconds);
        })]);
      } finally {
        clearTimeout(timeout);
      }
    };
    if (!(await settledWithin(WORKTREE_BOOTSTRAP_TIMEOUT_MS))) {
      const running = await getWorktreeBootstrapStatus(directory, { bootstrapStore });
      if (running?.status === 'pending' && running.phase !== 'git-ready') {
        throw new OpenChamberControlError('Timed out waiting for the worktree bootstrap', 500);
      }
      if (running?.status === 'pending' && !(await settledWithin(WORKTREE_SETUP_TIMEOUT_MS))) {
        return { setupStillRunning: true };
      }
    }
    const status = await getWorktreeBootstrapStatus(directory, { bootstrapStore });
    if (status?.status === 'failed') {
      throw new OpenChamberControlError(`Worktree bootstrap failed: ${status.error || 'unknown error'}`, 500);
    }
    if (status?.status !== 'ready') {
      throw new OpenChamberControlError('Worktree bootstrap has not completed', 503);
    }
    return { setupStillRunning: false };
  };

  const fetchSessionSelection = async ({ client, sessionID }: { client: SessionClient; sessionID: string }) => {
    try {
      const session = await client.session.get({ sessionID });
      const providerID = asNonEmptyString(session?.model?.providerID);
      const modelID = asNonEmptyString(session?.model?.id);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      return {
        openchamber: settings.agentControlToolEnabled !== false,
        web: settings.agentWebToolEnabled !== false,
        openchamber_knowledge: settings.agentKnowledgeToolEnabled !== false,
        notify: settings.agentNotifyToolEnabled === true,
        openchamber_render: settings.agentRenderToolEnabled !== false,
        openchamber_workflow: settings.agentWorkflowToolEnabled !== false,
      };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
    } catch {
      return null;
    }
  };

  // An unknown agent or model makes the run fail after the prompt is accepted,
  // leaving a session with no answer. Reject them before any session, worktree,
  // or goal side effect happens.
  const validateRequestedSelection = async ({ directory, requestedModel, requestedAgent, requestedVariant }) => {
    if (!requestedModel && !requestedAgent && !requestedVariant) return;
    const { models, agents } = await fetchSelectionInputs({
      client: clientFor(directory),
      readSettingsFromDiskMigrated,
    });

    // An empty list means the lookup failed or returned nothing authoritative;
    // it must not turn a valid selection into a rejection.
    if (requestedAgent && agents?.length > 0) {
      const agent = agents.find((entry) => entry?.id === requestedAgent) || null;
      if (!agent) {
        throw new OpenChamberControlError(`Unknown agent '${requestedAgent}' for ${directory}`, 400);
      }
      if (!isPrimaryAgentMode(agent.mode)) {
        throw new OpenChamberControlError(`Agent '${requestedAgent}' is a subagent and cannot receive a prompt directly`, 400);
      }
    }

    if (requestedModel && models.length > 0) {
      if (!hasCatalogModel(models, requestedModel.providerID, requestedModel.modelID)) {
        throw new OpenChamberControlError(
          `Unknown model '${requestedModel.providerID}/${requestedModel.modelID}' for ${directory}`,
          400,
        );
      }
      if (requestedVariant
        && !resolveVariant(models, requestedModel.providerID, requestedModel.modelID, requestedVariant)) {
        throw new OpenChamberControlError(
          `Unknown variant '${requestedVariant}' for model '${requestedModel.providerID}/${requestedModel.modelID}'`,
          400,
        );
      }
    }
  };

  const selectForSession = async ({
    client,
    sessionID,
    directory,
    projectId,
    requestedModel,
    requestedAgent,
    requestedVariant,
    reuseSessionSelection = false,
  }) => {
    let model = requestedModel;
    let agent = requestedAgent;
    let variant = requestedVariant;
    let selectionInputs = null;
    const readSelectionInputs = async () => {
      if (!selectionInputs) {
        selectionInputs = await fetchSelectionInputs({ client, readSettingsFromDiskMigrated });
      }
      return selectionInputs;
=======
    } catch {
      return null;
    }
  };

  const validateRequestedSelection = async ({ directory, requestedModel, requestedAgent, requestedVariant }: SelectionRequest & { directory: string }) => {
    if (!requestedModel && !requestedAgent && !requestedVariant) return;
    const { models, agents } = await fetchSelectionInputs({
      client: clientFor(directory),
      readSettingsFromDiskMigrated,
    });

    if (requestedAgent && agents && agents.length > 0) {
      const agent = agents.find((entry) => entry?.id === requestedAgent) || null;
      if (!agent) {
        throw new OpenChamberControlError(`Unknown agent '${requestedAgent}' for ${directory}`, 400);
      }
      if (!isPrimaryAgentMode(agent.mode)) {
        throw new OpenChamberControlError(`Agent '${requestedAgent}' is a subagent and cannot receive a prompt directly`, 400);
      }
    }

    if (requestedModel && models.length > 0) {
      if (!hasCatalogModel(models, requestedModel.providerID, requestedModel.modelID)) {
        throw new OpenChamberControlError(
          `Unknown model '${requestedModel.providerID}/${requestedModel.modelID}' for ${directory}`,
          400,
        );
      }
      if (requestedVariant
        && !resolveVariant(models, requestedModel.providerID, requestedModel.modelID, requestedVariant)) {
        throw new OpenChamberControlError(
          `Unknown variant '${requestedVariant}' for model '${requestedModel.providerID}/${requestedModel.modelID}'`,
          400,
        );
      }
    }
  };

  const selectForSession = async ({
    client,
    sessionID,
    directory,
    projectId,
    requestedModel,
    requestedAgent,
    requestedVariant,
    reuseSessionSelection = false,
    warmUp = false,
  }: SessionSelectionInput) => {
    let model = requestedModel;
    let agent = requestedAgent;
    let variant = requestedVariant;
    let selectionInputs: Awaited<ReturnType<typeof fetchSelectionInputs<SessionSettings | null>>> | null = null;
    const readSelectionInputs = async ({ waitForAgents = false } = {}) => {
      if (!selectionInputs) {
        const read = () => fetchSelectionInputs({ client, readSettingsFromDiskMigrated });
        selectionInputs = await (warmUp && waitForAgents ? fetchWarmSelectionInputs(read, selectionWarmUp) : read());
      }
      return selectionInputs;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const request = async (pathname, init = {}) => {
    const response = await service.request(pathname, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const problem = ProblemDetailsSchema.safeParse(body);
      const error = new OpenChamberControlError(problem.success ? problem.data.detail : body?.detail || body?.error || 'Agent service request failed', response.status);
      error.code = problem.success ? problem.data.code : body?.code;
      // A well-formed problem proves the Agent Service refused the command, so
      // a caller may distinguish a cold worker from an uncertain transport loss.
      error.refusalVerified = problem.success;
      error.retryable = problem.success ? problem.data.retryable : false;
      if (problem.success && problem.data.details) error.details = problem.data.details;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
    if (reuseSessionSelection && (!model || !agent)) {
      const previous = await fetchSessionSelection({ client, sessionID });
      if (previous) {
        if (!model && previous.model) {
          model = previous.model;
          if (variant == null) variant = previous.variant ?? undefined;
        }
        if (!agent && previous.agent) agent = previous.agent;
      }
    }
    if (!model || !agent) {
      const inputs = await readSelectionInputs();
      if (!inputs.agents?.length || inputs.config === null) {
        throw new OpenChamberControlError('Session selection is not ready: agent configuration is unavailable', 503);
      }
      if (agent && !inputs.agents.some((entry) => entry?.id === agent)) {
        throw new OpenChamberControlError(`Agent '${agent}' is not available in this directory`, 503);
      }
      // A named agent runs on the model it is bound to, ahead of every
      // default; the chain below only fills what nothing else named.
      if (!model && agent) {
        const named = resolveNamedAgentModel(inputs.agents, agent, inputs.models);
        if (named) {
          model = named.model;
          if (variant == null) variant = named.variant;
        }
      }
      if (!model || !agent) {
        // Asked only when the last chat pick is Auto; an unanswerable question
        // skips that pick rather than refusing the request.
        const autoAvailable = isAutoModel(splitModel(inputs.settings?.lastSelectedModel))
          && isAutoReady !== null
          && await isAutoReady().catch(() => false);
        const defaults = resolveDefaultSelection({
          ...inputs,
          projectDefaults: resolveProjectDefaults(inputs.settings, directory, projectId),
          autoAvailable,
          requireDefaultAgent: !agent,
        });
        if (!model) {
          model = defaults.model;
          if (variant == null) variant = defaults.variant;
        }
        agent = agent || defaults.agent;
      }
    }
    if (!model) {
      const error = new Error('No model is configured or available for the requested directory');
      error.statusCode = 400;
=======
    if (reuseSessionSelection && (!model || !agent)) {
      if (sessionID === undefined) throw new Error('Session selection requires a session id');
      const previous = await fetchSessionSelection({ client, sessionID });
      if (previous) {
        if (!model && previous.model) {
          model = previous.model;
          if (variant == null) variant = previous.variant ?? undefined;
        }
        if (!agent && previous.agent) agent = previous.agent;
      }
    }
    if (!model || !agent) {
      const inputs = await readSelectionInputs({ waitForAgents: true });
      if (!inputs.agents || !inputs.agents.length || inputs.config === null) {
        throw new OpenChamberControlError('Session selection is not ready: agent configuration is unavailable', 503);
      }
      if (agent && !inputs.agents.some((entry) => entry?.id === agent)) {
        throw new OpenChamberControlError(`Agent '${agent}' is not available in this directory`, 503);
      }
      if (!model && agent) {
        const named = resolveNamedAgentModel(inputs.agents, agent, inputs.models);
        if (named) {
          model = named.model;
          if (variant == null) variant = named.variant;
        }
      }
      if (!model || !agent) {
        const autoAvailable = isAutoModel(splitModel(asNonEmptyString(inputs.settings?.lastSelectedModel)))
          && isAutoReady !== null
          && await isAutoReady().catch(() => false);
        const defaults = resolveDefaultSelection({
          ...inputs,
          agents: inputs.agents,
          projectDefaults: resolveProjectDefaults(inputs.settings, directory, projectId),
          autoAvailable,
          requireDefaultAgent: !agent,
        });
        if (!model) {
          model = defaults.model;
          if (variant == null) variant = defaults.variant;
        }
        agent = agent || defaults.agent;
      }
    }
    if (!model) {
      const error = Object.assign(new Error('No model is configured or available for the requested directory'), { statusCode: 400 });
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      throw error;
    }
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
    return body;
  };
  const scopeFor = async (sessionId) => {
    const owner = resolveHostRelocationScope ? await resolveHostRelocationScope(sessionId) : null;
    if (owner && agentScopeStore && await agentScopeStore.getRelocation(owner.rootSessionId)) {
      if (relocationControls.has(owner.rootSessionId)) throw new OpenChamberControlError('Session relocation is in progress', 409, { code: 'COMMAND_IN_FLIGHT' });
      relocationControls.add(owner.rootSessionId);
      try { await recoverRelocation(owner.rootSessionId); } finally { relocationControls.delete(owner.rootSessionId); }
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
    // A new session, or a send that names a model, has no saved session
    // choice for it. The same source order as the composer applies: the
    // model's configured level, then the level it was last sent with.
    if (variant == null && !isAutoModel(model) && (!reuseSessionSelection || requestedModel)) {
      try {
        const inputs = await readSelectionInputs();
        variant = resolveSelectionVariant({
          settings: inputs.settings,
          projectDefaults: resolveProjectDefaults(inputs.settings, directory, projectId),
          agents: inputs.agents,
          agentName: agent,
          models: inputs.models,
          providerID: model.providerID,
          modelID: model.modelID,
        });
      } catch {
        // The remembered level is an enhancement. A settings read that fails
        // must not turn a valid model-only dispatch into an error.
      }
=======
    if (variant == null && !isAutoModel(model) && (!reuseSessionSelection || requestedModel)) {
      try {
        const inputs = await readSelectionInputs();
        variant = resolveSelectionVariant({
          settings: inputs.settings,
          projectDefaults: resolveProjectDefaults(inputs.settings, directory, projectId),
          agents: inputs.agents,
          agentName: agent,
          models: inputs.models,
          providerID: model.providerID,
          modelID: model.modelID,
        });
      } catch {
        void 0;
      }
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    }
    const resolved = (owner && liveRootSessions.has(owner.rootSessionId)) ? await resolveHostSessionScope(sessionId) : await resolveSessionScope(sessionId);
    if (!resolved || resolved.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    const scope = subagentSessions.has(sessionId) && resolved.parentSessionId === undefined
      ? { ...resolved, parentSessionId: subagentSessions.get(sessionId) }
      : resolved;
    return scope;
  };
  const hostScopeFor = async (sessionId) => { const scope = await resolveHostSessionScope(sessionId); if (!scope || scope.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404); return scope; };
  const assertWritableScope = (scope) => {
    if (scope.workspaceId.startsWith('archive_')) throw new OpenChamberControlError('Deleted-space sessions are permanently read-only', 409, { code: 'SESSION_READ_ONLY', retryable: false });
  };
  const emit = (event) => { try { publishSessionEvent?.(event); } catch { } try { broadcastGlobalUiEvent?.(event); } catch { } };
  // Roots this process confirmed live through a successful reopen or run
  // acknowledgement. A warm send then dispatches without another reopen;
  // delete, relocation, unload and a failed reopen forget the confirmation.
  const liveRootSessions = new Set();
  const rememberLive = (rootSessionId) => { liveRootSessions.add(rootSessionId); };
  const forgetLive = (rootSessionId) => { liveRootSessions.delete(rootSessionId); };
  const subagentSessions = new Map();
  const metadata = {
    getState: (id) => sessionMetadataStore.getState(id), set: async (id, patch, directory = '') => {
      if (persistSessionMetadata) return persistSessionMetadata(id, patch, { directory });
      // The fallback owns the store for module tests and compositions without an
      // injected writer, so it announces the committed merge like that writer.
      const result = await sessionMetadataStore.setSessionMetadata(id, patch);
      if (result.changed) {
        try { broadcastGlobalUiEvent?.({ type: 'openchamber:session-metadata', properties: { sessionId: id, sessionID: id, metadata: result.metadata, revision: result.revision } }); } catch { }
      }
      return result;
    }
  };
  const admissionRecoveries = new Map();
  // A create admission stranded by an earlier Host process is settled by the
  // Agent Service's complete listing of its workspace. The Host chose the root
  // id, so a listed root is registered. An absent root left at most an empty
  // native file, which every listing hides; a native file with content is
  // listed and registered by ordinary discovery.
  const recoverPriorCreateAdmissions = (scope) => {
    const running = admissionRecoveries.get(scope.workspaceId);
    if (running) return running;
    const recovery = (async () => {
      for (const admission of await agentScopeStore.listPriorCreateAdmissions(scope.workspaceId)) {
        const owner = await resolveWorkspaceScope(admission.workspaceId);
        if (!owner) continue;
        const listed = NativeSessionListSchema.safeParse(await request(`/api/agent/v1/sessions?workspaceId=${encodeURIComponent(owner.workspaceId)}`).catch(() => null));
        if (!listed.success || listed.data.errors.length) continue;
        const roots = listed.data.items.filter((session) => session.rootSessionId === admission.rootSessionId);
        if (roots.some((session) => session.projectId !== owner.projectId || session.workspaceId !== owner.workspaceId)) continue;
        if (!(await Promise.all(roots.map(registerSessionScope))).every(Boolean)) continue;
        await agentScopeStore.releaseSessionAdmission(admission.id);
      }
    })().catch(() => {}).finally(() => admissionRecoveries.delete(scope.workspaceId));
    admissionRecoveries.set(scope.workspaceId, recovery);
    return recovery;
  };
  const withSessionAdmission = async (scope, operation, rootSessionId, work, readOnly = false) => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host session admission authority is unavailable', 503);
    await recoverPriorCreateAdmissions(scope);
    const admission = await agentScopeStore.reserveSessionAdmission(scope.workspaceId, operation, rootSessionId);
    let complete = false;
    try {
      const result = await work(() => { complete = true; });
      complete = true;
      return result;
    } catch (error) {
      // A validated supervisor refusal is authoritative: no native admission
      // was accepted, so it must not strand the Host scope fence.
      if (error instanceof OpenChamberControlError && error.statusCode >= 400 && error.statusCode < 500) complete = true;
      if (!complete && !readOnly) throw new OpenChamberControlError('Native session admission outcome is uncertain; the worktree archive remains blocked until the admission is reconciled', 409, { code: 'COMMAND_IN_FLIGHT', retryable: false, cause: error });
      throw error;
    } finally {
      if (complete || readOnly) await agentScopeStore.releaseSessionAdmission(admission);
      else agentScopeStore.markSessionAdmissionUncertain(admission);
    }
  };
  const speculativeSessions = new Map();

  const discardPrepared = async (payload = {}) => {
    const workspaceId = payload?.workspaceId;
    if (!workspaceId) return { ok: false };
    const existing = speculativeSessions.get(workspaceId);
    if (!existing) return { ok: true };
    speculativeSessions.delete(workspaceId);
    clearTimeout(existing.timer);
    try {
      const session = await existing.promise;
      await remove(session.sessionId);
    } catch { }
    return { ok: true };
  };

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const prepare = async (payload = {}) => {
    const { projectId, workspaceId } = payload ?? {};
    if (!projectId || !workspaceId) throw new OpenChamberControlError('Project and workspace identity required', 400);
    const existing = speculativeSessions.get(workspaceId);
    if (existing) {
      const session = await existing.promise;
      return { ok: true, sessionId: session.sessionId };
    }
    const timer = setTimeout(() => { void discardPrepared({ workspaceId }); }, 5 * 60 * 1000);
    timer.unref?.();
    const preparePromise = (async () => {
      const workspace = await resolveWorkspaceScope(workspaceId);
      if (!workspace || workspace.projectId !== projectId) throw new OpenChamberControlError('Workspace does not belong to project', 404);
      assertWritableScope(workspace);
      const rootSessionId = randomUUID();
      const workspaceDisplay = z.object({ displayPath: z.string().nullable().optional(), env: z.record(z.string(), z.string()).optional() }).passthrough().parse(workspace);
      const displayPath = workspaceDisplay.displayPath && !workspaceDisplay.displayPath.startsWith('/') && !workspaceDisplay.displayPath.startsWith('\\') && !/^[A-Za-z]:/.test(workspaceDisplay.displayPath) ? workspaceDisplay.displayPath : 'workspace';
      const hostTools = await resolveHostTools();
      const defaultOptions = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };
      const sessionBootstrap = {
        rootSessionId, projectId, workspaceId,
        cwd: workspace.cwd, agentDirectory: workspace.agentDirectory, agentDirectoryId: workspace.agentDirectoryId,
        displayPath, options: defaultOptions, deferred: false,
        ...(hostTools ? { hostTools } : {}),
      };
      if (workspaceDisplay.env) sessionBootstrap.env = workspaceDisplay.env;
      return await withSessionAdmission(workspace, 'create', rootSessionId, async (settled) => {
        const body = await request('/internal/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sessionBootstrap) });
        const runtime = RuntimeSessionSchema.parse(body);
        if (runtime.projectId !== projectId || runtime.workspaceId !== workspaceId || runtime.rootSessionId !== rootSessionId) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502);
        if (!await registerSessionScope(runtime)) throw new OpenChamberControlError('Session scope registration failed', 500);
        settled();
        rememberLive(runtime.sessionId);
        return runtime;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
  const dispatchPrompt = async ({
    client,
    baseUrl,
    authHeaders,
    sessionID,
    directory,
    projectId,
    prompt,
    goalInput,
    requestedModel,
    requestedAgent,
    requestedVariant,
    reuseSessionSelection = false,
    clearResponseStyle = true,
    promptedBySessionId = null,
  }) => {
    let { model, agent, variant } = await selectForSession({
      client, sessionID, directory, projectId, requestedModel, requestedAgent, requestedVariant, reuseSessionSelection,
    });
    const expandedPrompt = expandSnippets(prompt, directory);
    if (isAutoModel(model)) {
      // The sentinel must never reach OpenCode: neither the goal record nor the
      // session switch below may carry it.
      if (!resolveAutoSelection) {
        throw new OpenChamberControlError('Auto routing is not available on this server. Choose a model.', 400);
      }
      const routed = await resolveAutoSelection({
        sessionId: sessionID,
        directory,
        model: AUTO_MODEL_REF,
        agent: agent ?? null,
        requestText: expandedPrompt,
=======
  const dispatchPrompt = async ({
    client,
    baseUrl,
    authHeaders,
    sessionID,
    directory,
    projectId,
    prompt,
    goalInput,
    requestedModel,
    requestedAgent,
    requestedVariant,
    reuseSessionSelection = false,
    clearResponseStyle = true,
    promptedBySessionId = null,
  }: DispatchInput): Promise<DispatchResult> => {
    let { model, agent, variant } = await selectForSession({
      client, sessionID, directory, projectId, requestedModel, requestedAgent, requestedVariant, reuseSessionSelection,
    });
    const expandedPrompt = expandSnippets(prompt, directory);
    if (isAutoModel(model)) {
      if (!resolveAutoSelection) {
        throw new OpenChamberControlError('Auto routing is not available on this server. Choose a model.', 400);
      }
      const routed = await resolveAutoSelection({
        sessionId: sessionID,
        directory,
        model: AUTO_MODEL_REF,
        agent: agent ?? null,
        requestText: expandedPrompt,
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      });
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
    })();
    speculativeSessions.set(workspaceId, { promise: preparePromise, timer });
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
      model = { providerID: routed.model.providerID, modelID: routed.model.id };
      variant = routed.model.variant ?? undefined;
      agent = routed.agent || agent;
    }
    const parsedCommand = parseScheduledCommandPrompt(prompt);
    let resolvedCommand = null;
    if (parsedCommand) {
      try {
        const response = await client.command.list();
        const commands = asList(response?.data);
        if (commands.some((candidate) => candidate?.name === parsedCommand.command)) {
          resolvedCommand = parsedCommand;
        }
      } catch {
      }
    }
    if (goalInput.enabled) {
      // v2 no longer publishes a command's template, so a slash command's goal
      // objective is the prompt the user typed rather than the expanded body.
      await (createSessionGoalOverride || createSessionGoal)({
        baseUrl,
        authHeaders,
        sessionID,
        directory,
        objective: expandedPrompt,
        tokenBudget: goalInput.tokenBudget,
        providerID: model.providerID,
        modelID: model.modelID,
        onWarning: (message, error) => console.warn(`[OpenChamberSessions] ${message}:`, error?.message || error),
        // v2 has no session-metadata route, so the goal record goes to
        // OpenChamber's own store — the same one the proxy overlays back.
        persistSessionGoal: async (goalSessionID, goalDirectory, goal) => {
          await writeMetadata(goalSessionID, { openchamber: { goal } }, goalDirectory);
        },
      });
    }

    const markGoalPartial = (error) => {
      if (goalInput.enabled && error && typeof error === 'object') error.goalConfigured = true;
      return error;
    };

=======
      if (routed === null) throw new TypeError("Cannot read properties of null (reading 'model')");
      model = { providerID: routed.model.providerID, modelID: routed.model.id };
      variant = routed.model.variant ?? undefined;
      agent = routed.agent || agent;
    }
    const parsedCommand = parseScheduledCommandPrompt(prompt);
    let resolvedCommand = null;
    if (parsedCommand) {
      try {
        const response = await client.command.list();
        const commands = asList(response?.data);
        if (commands.some((candidate) => candidate?.name === parsedCommand.command)) {
          resolvedCommand = parsedCommand;
        }
      } catch {
        void 0;
      }
    }
    if (goalInput.enabled) {
      await (createSessionGoalOverride || createSessionGoal)({
        baseUrl,
        authHeaders,
        sessionID,
        directory,
        objective: expandedPrompt,
        tokenBudget: goalInput.tokenBudget,
        providerID: model.providerID,
        modelID: model.modelID,
        onWarning: (message: string, cause: unknown) => console.warn(`[OpenChamberSessions] ${message}:`, (hasMessage(cause) ? cause.message : undefined) || cause),
        persistSessionGoal: async (goalSessionID: string, goalDirectory: string, goal: Awaited<ReturnType<typeof createSessionGoal>>) => {
          await writeMetadata(goalSessionID, { openchamber: { goal } }, goalDirectory);
        },
      });
    }

    const markGoalPartial = (cause: unknown) => {
      if (goalInput.enabled && isGoalError(cause)) cause.goalConfigured = true;
      return cause;
    };

>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    try {
      const session = await preparePromise;
      return { ok: true, sessionId: session.sessionId };
    } catch (err) {
      if (speculativeSessions.get(workspaceId)?.promise === preparePromise) {
        speculativeSessions.delete(workspaceId);
        clearTimeout(timer);
      }
      throw err;
    }
  };

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const create = async (payload = {}) => {
    const parsed = SessionCreateRequestSchema.safeParse(payload);
    if (!parsed.success) throw new OpenChamberControlError('Session create request is invalid', 400);
    const { projectId, workspaceId, metadata: requestedMetadata, parentSessionId } = parsed.data;
    const options = CapturedSendOptionsSchema.parse(parsed.data.options);
    const workspace = await resolveWorkspaceScope(workspaceId);
    if (!workspace || workspace.projectId !== projectId) throw new OpenChamberControlError('Workspace does not belong to project', 404);
    assertWritableScope(workspace);
    if (parentSessionId !== undefined) {
      const parentScope = await resolveSessionScope(parentSessionId);
      if (!parentScope) throw new OpenChamberControlError('Parent session was not found', 404);
      if (parentScope.workspaceId !== workspaceId || parentScope.projectId !== projectId) {
        throw new OpenChamberControlError('Parent session is outside the authorized workspace and project', 403);
      }
      assertWritableScope(parentScope);
    }
    const speculative = (parentSessionId === undefined) ? speculativeSessions.get(workspaceId) : undefined;
    let session;
    if (speculative) {
      speculativeSessions.delete(workspaceId);
      clearTimeout(speculative.timer);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
    // A session the agent dispatched has no UI to write the project's
    // standing context into it, so it is written here. `sync` never throws:
    // a session that runs without its background beats one that never runs.
    if (sessionKnowledgeRuntime) {
=======
    if (sessionKnowledgeRuntime) {
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      try {
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
        session = await speculative.promise;
      } catch {
        session = null;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
        const session = await client.session.get({ sessionID });
        const sessionDirectory = asNonEmptyString(session?.location?.directory);
        if (sessionDirectory) {
          if (clearResponseStyle) await sessionKnowledgeRuntime.sync(sessionID, sessionDirectory, '');
          else await sessionKnowledgeRuntime.sync(sessionID, sessionDirectory);
        }
      } catch (error) {
        console.warn('[OpenChamberSessions] Failed to read session directory for knowledge sync:', error?.message || error);
=======
        const session = await client.session.get({ sessionID });
        const sessionDirectory = asNonEmptyString(session?.location?.directory);
        if (sessionDirectory) {
          if (clearResponseStyle) await sessionKnowledgeRuntime.sync(sessionID, sessionDirectory, '');
          else await sessionKnowledgeRuntime.sync(sessionID, sessionDirectory);
        }
      } catch (error) {
        console.warn('[OpenChamberSessions] Failed to read session directory for knowledge sync:', (hasMessage(error) ? error.message : undefined) || error);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      }
    }
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
    if (session) {
      rememberLive(session.sessionId);
      if (parsed.data.title) {
        const renamed = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(session.sessionId)}/title`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify(SessionTitleRequestSchema.parse({ workspaceId, title: parsed.data.title })),
        }));
        if (renamed.sessionId !== session.sessionId || renamed.workspaceId !== workspaceId) throw new OpenChamberControlError('Session title response was out of scope', 502);
        Object.assign(session, renamed);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

    if (resolvedCommand) {
      try {
        await client.session.command({
          sessionID,
          // OpenCode 2.0.8 renamed the command body field `command` to `name`.
          name: resolvedCommand.command,
          text: resolvedCommand.arguments || '',
        });
      } catch (error) {
        throw markGoalPartial(error);
=======

    if (resolvedCommand) {
      try {
        await client.session.command({
          sessionID,
          name: resolvedCommand.command,
          text: resolvedCommand.arguments || '',
        });
      } catch (error) {
        throw markGoalPartial(error);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      }
    } else {
      const rootSessionId = randomUUID();
      const workspaceDisplay = z.object({ displayPath: z.string().nullable().optional(), env: z.record(z.string(), z.string()).optional() }).passthrough().parse(workspace);
      const displayPath = workspaceDisplay.displayPath && !workspaceDisplay.displayPath.startsWith('/') && !workspaceDisplay.displayPath.startsWith('\\') && !/^[A-Za-z]:/.test(workspaceDisplay.displayPath) ? workspaceDisplay.displayPath : 'workspace';
      const hostTools = await resolveHostTools();
      const sessionBootstrap = {
        rootSessionId, projectId, workspaceId,
        cwd: workspace.cwd, agentDirectory: workspace.agentDirectory, agentDirectoryId: workspace.agentDirectoryId,
        displayPath, options, deferred: true,
        ...(hostTools ? { hostTools } : {}),
      };
      if (parentSessionId !== undefined) sessionBootstrap.parentSessionId = parentSessionId;
      if (workspaceDisplay.env) sessionBootstrap.env = workspaceDisplay.env;
      session = await withSessionAdmission(workspace, 'create', rootSessionId, async (settled) => {
        const body = await request('/internal/sessions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sessionBootstrap) });
        const runtime = RuntimeSessionSchema.parse(body);
        if (runtime.projectId !== projectId || runtime.workspaceId !== workspaceId || runtime.rootSessionId !== rootSessionId) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502);
        if (parentSessionId !== undefined && runtime.parentSessionId !== parentSessionId) throw new OpenChamberControlError('Agent service returned an out-of-scope parent linkage', 502);
        if (!await registerSessionScope(runtime)) throw new OpenChamberControlError('Session scope registration failed', 500);
        if (parentSessionId !== undefined) subagentSessions.set(runtime.sessionId, parentSessionId);
        if (parsed.data.title) {
          const renamed = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(runtime.sessionId)}/title`, {
            method: 'PATCH', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(SessionTitleRequestSchema.parse({ workspaceId, title: parsed.data.title })),
          }));
          if (renamed.sessionId !== runtime.sessionId || renamed.workspaceId !== workspaceId) throw new OpenChamberControlError('Session title response was out of scope', 502);
          Object.assign(runtime, renamed);
        }
        settled();
        rememberLive(runtime.sessionId);
        return runtime;
      });
    }
    if (requestedMetadata) await metadata.set(session.sessionId, requestedMetadata, workspace.cwd);
    const stored = await sessionMetadataStore.getState(session.sessionId);
    const result = SessionCreateAckSchema.parse({ session: SessionSchema.parse({ ...session, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: '0' }) });
    emit({ type: 'openchamber:session-created', properties: { sessionId: session.sessionId, projectId, workspaceId } });
    return result;
  };
  const prepareDelivery = async (scope, requestBody, identity = {}, capturedRequest = null) => {
    const isRoot = scope.parentSessionId === undefined;
    const captured = capturedRequest ?? await capturePrompt(scope, requestBody);
    const admitted = isRoot ? assertRootPromptAdmission(captured) : captured;
    const capture = { ...identity, request: admitted };
    await beforeDispatch(scope, capture);
    try {
      const attachments = await resolveAttachments(scope, admitted.input.attachments);
      return { ...capture, attachments };
    } catch (error) {
      if (error?.code === 'PAYLOAD_TOO_LARGE' || error?.code === 'INVALID_REQUEST') {
        throw new OpenChamberControlError(error.message, error.statusCode ?? (error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400), { code: error.code, retryable: false });
      }
      throw error;
    }
  };
  const deliver = async (operation, sessionId, payload, commandId) => {
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    const parsed = PromptRequestSchema.safeParse(operation === 'send' ? payload : payload?.request ?? payload);
    if (!parsed.success || (operation !== 'send' && payload?.sessionId !== undefined && payload.sessionId !== sessionId)) {
      throw new OpenChamberControlError('Prompt request is invalid', 400, { code: 'INVALID_REQUEST' });
    }
    const requestBody = operation === 'steer' ? SteerRequestSchema.parse({ sessionId, request: parsed.data }).request
      : operation === 'followUp' ? FollowUpRequestSchema.parse({ sessionId, request: parsed.data }).request : parsed.data;
    const isRoot = scope.parentSessionId === undefined;
    if (isRoot) assertRootPromptAdmission(requestBody);
    if (commandId !== undefined && !EntityIdSchema.safeParse(commandId).success) {
      throw new OpenChamberControlError('Command key is invalid', 400, { code: 'INVALID_REQUEST' });
    }
    const claim = commandId === undefined ? null : await directCommandAdmissionStore.claim(scope, commandId, operation, requestBody);
    if (claim?.state === 'accepted') return claim.acknowledgment;
    const captured = await capturePrompt(scope, requestBody);
    const capturedRequest = isRoot ? assertRootPromptAdmission(captured) : captured;
    const deliveryRunId = randomUUID();
    const deliveryIdentity = { deliveryRunId };
    if (operation === 'send') deliveryIdentity.runId = deliveryRunId;
    if (commandId !== undefined) deliveryIdentity.commandId = commandId;
    const capture = await prepareDelivery(scope, requestBody, deliveryIdentity, capturedRequest);
    // The Host owns the mutation boundary: a cold send must reopen its root
    // before Agent Service prompt admission sees an unavailable runtime. Capture
    // and validation stay ahead of this so an invalid prompt starts no worker.
    // Steer and follow-up need an already-live run, so they never reopen.
    // A root already confirmed live dispatches directly; only a verified cold
    // refusal reopens and retries that same dispatch once.
    if (operation === 'send' && !liveRootSessions.has(scope.rootSessionId)) await reopen(scope);
    let acknowledgment;
    let receipt;
    try {
      const pathname = operation === 'send' ? 'runs' : operation === 'steer' ? 'steer' : 'follow-up';
      const body = operation === 'send' ? { type: 'prompt', runId: deliveryRunId, request: capture.request, attachments: capture.attachments }
        : { request: capture.request, attachments: capture.attachments };
      const dispatch = () => request(`/internal/sessions/${encodeURIComponent(sessionId)}/${pathname}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      let response;
      try {
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
        response = await dispatch();
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
        const promptInput = { sessionID, text: expandedPrompt };
        if (promptedBySessionId) {
          promptInput.metadata = { openchamber: { promptedBy: await readPromptOrigin(client, promptedBySessionId) } };
        }
        const sent = await client.session.prompt(promptInput);
        landedMessageID = asNonEmptyString(sent?.id);
        if (goalInput.enabled) {
          // Goal mode's reminder refers to "the user message above", so it is
          // admitted after the prompt; v2 has no way to append to one message.
          await client.session.synthetic({
            sessionID,
            text: buildGoalIntroText(goalInput.tokenBudget),
            resume: false,
          });
        }
=======
        const promptInput: PromptInput = { sessionID, text: expandedPrompt };
        if (promptedBySessionId) {
          promptInput.metadata = { openchamber: { promptedBy: await readPromptOrigin(client, promptedBySessionId) } };
        }
        const sent = await client.session.prompt(promptInput);
        landedMessageID = asNonEmptyString(sent?.id);
        if (goalInput.enabled) {
          await client.session.synthetic({
            sessionID,
            text: buildGoalIntroText(goalInput.tokenBudget),
            resume: false,
          });
        }
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      } catch (error) {
        // Only a verified cold refusal retries: it proves native admission never
        // accepted this command, so resending cannot duplicate an admitted run.
        if (operation !== 'send' || !isVerifiedColdRefusal(error)) throw error;
        await reopen(scope);
        response = await dispatch();
      }
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
      if (operation === 'send') {
        const run = RunSchema.parse(response?.run);
        if (run.sessionId !== sessionId || run.runId !== deliveryRunId) throw new Error('Native run acknowledgement does not match the admitted command');
        acknowledgment = { run };
        receipt = { runId: run.runId, deliveryRunId, run };
        rememberLive(scope.rootSessionId);
      } else {
        acknowledgment = (operation === 'steer' ? SteerAckSchema : FollowUpAckSchema).parse(response);
        if (acknowledgment.sessionId !== sessionId) throw new Error('Native acknowledgement does not match the admitted session');
        receipt = operation === 'steer' ? { runId: acknowledgment.runId, deliveryRunId, ack: acknowledgment }
          : { deliveryRunId, followUpId: acknowledgment.followUpId, ack: acknowledgment };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
      if (!landedMessageID) {
        // v2 answers a prompt with the inbox item it recorded. No item id means
        // nothing is queued, so the dispatch must not be claimed as done.
        return {
          model,
          agent,
          variant,
          promptDispatched: false,
          dispatchedAsCommand: false,
          promptError: 'OpenCode accepted the prompt but returned no queued message',
        };
=======
      if (!landedMessageID) {
        return {
          model,
          agent,
          variant,
          promptDispatched: false,
          dispatchedAsCommand: false,
          promptError: 'OpenCode accepted the prompt but returned no queued message',
        };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      }
    } catch (error) {
      // Any failed send path voids the live confirmation — a failed dispatch, a
      // failed cold retry, or an acknowledgement that does not name this run.
      // A later prompt then verifies the worker again instead of trusting memory.
      if (operation === 'send') forgetLive(scope.rootSessionId);
      // A failed transport or malformed acknowledgement cannot prove that native execution did not accept the command.
      if (claim && !(error instanceof OpenChamberControlError && error.refusalVerified === true)) {
        throw new OpenChamberControlError('Command acceptance is uncertain; it will not be dispatched again', 409, { code: 'COMMAND_IN_FLIGHT', retryable: false });
      }
      throw error;
    }
    try {
      const acceptedCapture = { ...capture, receipt };
      if (receipt.runId) acceptedCapture.runId = receipt.runId;
      await onPromptAccepted(scope, acceptedCapture, receipt);
    } catch (error) {
      if (claim) throw new OpenChamberControlError('Command was accepted but its delivery receipt is incomplete', 409, { code: 'COMMAND_IN_FLIGHT', retryable: false });
      throw error;
    }
    // Keep the claim pending if this durable write fails, rather than authorizing an unsafe resend.
    if (claim) await directCommandAdmissionStore.accept(scope, commandId, claim.claimId, acknowledgment);
    return acknowledgment;
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const send = (sessionId, payload = {}, commandId) => deliver('send', sessionId, payload, commandId);
  const steer = (sessionId, payload = {}, commandId) => deliver('steer', sessionId, payload, commandId);
  const followUp = (sessionId, payload = {}, commandId) => deliver('followUp', sessionId, payload, commandId);
  const fork = async (sessionId, payload = {}) => {
    const source = await scopeFor(sessionId);
    assertWritableScope(source);
    const input = parseCommand(SessionForkRequestSchema, payload);
    const child = await withSessionAdmission(source, 'fork', source.rootSessionId, async (settled) => {
      await reopenNative(source);
      const entryId = input.mode === 'selected' ? asNonEmptyString((await request(`/internal/sessions/${encodeURIComponent(sessionId)}/native-entry/${encodeURIComponent(input.messageId)}`)).entryId) : null;
      if (input.mode === 'selected' && !entryId) { settled(); throw new OpenChamberControlError('Selected message is unavailable', 409); }
      const body = await request(`/internal/sessions/${encodeURIComponent(sessionId)}/fork`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sourceSessionId: sessionId, entryId, mode: input.mode }) });
      const ack = SessionForkAckSchema.parse(body);
      if (ack.sourceSessionId !== sessionId || ack.entryId !== entryId || ack.mode !== input.mode) throw new OpenChamberControlError('Fork acknowledgement does not match the requested source', 502);
      const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(ack.sessionId)}`));
      if (runtime.sessionId !== ack.sessionId || runtime.rootSessionId !== ack.rootSessionId || runtime.projectId !== source.projectId || runtime.workspaceId !== source.workspaceId) throw new OpenChamberControlError('Fork acknowledgement is outside the source scope', 502);
      if (!await registerSessionScope(runtime)) throw new OpenChamberControlError('Forked session scope registration failed', 500);
      settled();
      return runtime;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

  const broadcastMetadata = (sessionID, metadata) => {
    broadcastGlobalUiEvent?.({
      type: 'openchamber:session-metadata',
      properties: { sessionID, metadata },
=======

  const broadcastMetadata = (sessionID: string, metadata: SessionMetadata | undefined) => {
    broadcastGlobalUiEvent?.({
      type: 'openchamber:session-metadata',
      properties: { sessionID, metadata },
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    });
    const stored = await sessionMetadataStore.getState(child.sessionId);
    const archive = await archiveStore.getState(child.sessionId);
    const projected = { ...child, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: archive?.revision ?? '0' };
    if (archive?.archivedAt != null) projected.archivedAt = archive.archivedAt;
    return SessionCreateAckSchema.parse({ session: SessionSchema.parse(projected) });
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const reopenNative = async (scope) => {
    const hostTools = scope.hostTools ?? (typeof resolveHostTools === 'function' ? await resolveHostTools().catch(() => null) : null);
    const privateScope = {
      rootSessionId: scope.rootSessionId,
      projectId: scope.projectId,
      workspaceId: scope.workspaceId,
      cwd: scope.cwd,
      agentDirectory: scope.agentDirectory,
      agentDirectoryId: scope.agentDirectoryId,
      displayPath: scope.displayPath ?? 'workspace',
      ...(hostTools ? { hostTools } : {}),
    };
    if (scope.env) privateScope.env = scope.env;
    const bootstrap = SessionReopenScopeSchema.parse(privateScope);
    const runtime = RuntimeSessionSchema.parse(await request(`/internal/sessions/${encodeURIComponent(bootstrap.rootSessionId)}/reopen`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(bootstrap) }));
    if (runtime.sessionId !== bootstrap.rootSessionId || runtime.rootSessionId !== bootstrap.rootSessionId || runtime.projectId !== bootstrap.projectId || runtime.workspaceId !== bootstrap.workspaceId) throw new OpenChamberControlError('Session restore acknowledgement is outside the authorized scope', 502);
  };
  const reopen = async (scope) => {
    try {
      await withSessionAdmission(scope, 'reopen', scope.rootSessionId, () => reopenNative(scope));
      rememberLive(scope.rootSessionId);
    } catch (error) {
      forgetLive(scope.rootSessionId);
      throw error;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

  /**
   * Merge-patch a session's OpenChamber metadata on its OpenCode record: the
   * per-session state of goal mode, session assist, obligatory context and
   * pinned notes. The broadcast carries the full merged object, because a
   * client that missed an earlier patch must not have to reconstruct it.
   */
  const writeMetadata = async (sessionID, patch, directory = '') => {
    if (typeof persistSessionMetadata === 'function') {
      return persistSessionMetadata(sessionID, patch, { directory });
=======

  const writeMetadata = async (sessionID: string, patch: SessionMetadata, directory = '') => {
    if (persistSessionMetadata) {
      return persistSessionMetadata(sessionID, patch, { directory });
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    }
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const open = async (id) => { const scope = await scopeFor(id); const snapshot = SessionSnapshotSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/snapshot`)); if (snapshot.session.sessionId !== id || snapshot.session.projectId !== scope.projectId || snapshot.session.workspaceId !== scope.workspaceId) throw new OpenChamberControlError('Session snapshot is outside the authorized scope', 502); return snapshot; };
  const history = async (id, query = '') => { const scope = await scopeFor(id); const page = HistoryPageSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/history${query ? `?${query}` : ''}`)); if (page.sessionId !== id || page.turns.some(turn => turn.projectId !== undefined && turn.projectId !== scope.projectId) || page.messages.some(message => message.projectId !== undefined && message.projectId !== scope.projectId)) throw new OpenChamberControlError('Session history is outside the authorized scope', 502); return page; };
  const list = async (workspaceId) => {
    const scopePage = workspaceId ? { items: [{ workspaceId }], errors: {} } : await (listWorkspaceScopes instanceof Function ? listWorkspaceScopes() : Promise.reject(new OpenChamberControlError('Workspace enumeration is unavailable', 503)));
    const parsedScopes = z.strictObject({ items: z.array(z.strictObject({ workspaceId: z.string().min(1) })), errors: z.record(z.string(), ProblemCodeSchema) }).parse(scopePage);
    const pages = await Promise.all(parsedScopes.items.map(async ({ workspaceId: id }) => {
      try {
        const workspace = await resolveWorkspaceScope(id);
        if (!workspace) throw new OpenChamberControlError('Workspace scope is unavailable during global session listing', workspaceId ? 404 : 503, { code: workspaceId ? 'SESSION_NOT_FOUND' : 'SERVICE_UNAVAILABLE' });
        return await withSessionAdmission(workspace, 'discovery', id, async () => {
          const raw = NativeSessionListSchema.parse(await request(`/api/agent/v1/sessions?workspaceId=${encodeURIComponent(id)}`));
          const sessionResults = await Promise.all(raw.items.map(async session => {
            try {
              if (session.projectId !== workspace.projectId || session.workspaceId !== id) throw new OpenChamberControlError('Agent service returned an out-of-scope session', 502, { code: 'INTERNAL_ERROR' });
              const metadataState = await sessionMetadataStore.getState(session.sessionId);
              const archiveState = await archiveStore.getState(session.sessionId);
              if (!await registerSessionScope(session)) throw new OpenChamberControlError('Session scope registration failed', 500, { code: 'INTERNAL_ERROR' });
              const projected = { ...session, metadata: metadataState?.metadata ?? null, metadataRevision: metadataState?.revision ?? '0', archiveRevision: archiveState?.revision ?? '0' };
              if (archiveState?.archivedAt != null) projected.archivedAt = archiveState.archivedAt;
              return { item: SessionSchema.parse(projected) };
            } catch (error) {
              const code = ProblemCodeSchema.safeParse(error?.code);
              return { error: { sessionId: session.sessionId, code: code.success ? code.data : 'SERVICE_UNAVAILABLE' } };
            }
          }));
          const items = sessionResults.flatMap(result => result.item ? [result.item] : []);
          const sessionErrors = sessionResults.flatMap(result => result.error ? [result.error] : []);
          return { items, errors: Object.fromEntries([...raw.errors, ...sessionErrors].map(error => [error.sessionId, error.code])) };
        }, true);
      } catch (error) {
        const code = ProblemCodeSchema.safeParse(error?.code);
        return { items: [], errors: { [id]: code.success ? code.data : 'SERVICE_UNAVAILABLE' } };
      }
    }));
    return z.strictObject({ items: z.array(SessionSchema), errors: z.record(z.string(), ProblemCodeSchema) }).parse({ items: pages.flatMap(page => page.items), errors: Object.assign({}, parsedScopes.errors, ...pages.map(page => page.errors)) });
  };
  const captureWorktreeArchive = async ({ projectDirectory, worktreeDirectory, archiveId, archiveRef, snapshotCommit, claimId, branchName, branchOid, archivedAt }) => {
    if (!agentScopeStore || typeof dependencies.resolveWorkspaceDirectory !== 'function')
      throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const [project, workspace] = await Promise.all([
      dependencies.resolveWorkspaceDirectory(projectDirectory),
      dependencies.resolveWorkspaceDirectory(worktreeDirectory),
    ]);
    if (!project || !workspace || project.projectId !== workspace.projectId)
      throw new OpenChamberControlError('Worktree does not belong to the Host project', 403);
    const scope = await (dependencies.resolveHostWorkspaceScope ?? resolveWorkspaceScope)(workspace.workspaceId);
    if (!scope || scope.projectId !== project.projectId)
      throw new OpenChamberControlError('Worktree Host scope is unavailable', 503);
    const archiveState = await archiveStore.listAll();
    if (archiveState.conversion?.code || Object.keys(archiveState.errors).length > 0)
      throw new OpenChamberControlError('Host archive state is unavailable', 503);
    const key = { hostProjectId: scope.hostProjectId, archiveId };
    let binding = await agentScopeStore.createWorktreeArchive({
      ...key, archiveRef, snapshotCommit,
      anchorWorkspaceId: scope.workspaceId, claimId, claimGeneration: worktreeArchiveGeneration,
      branchName, branchOid
    });
    try {
      binding = await agentScopeStore.archiveWorktreeSessions(key, claimId, archivedAt);
      return { key, claimId, revision: binding.revision };
    } catch (error) {
      await agentScopeStore.rollbackWorktreeSessions(key, claimId, false);
      error.worktreeArchiveOwner = { key, claimId };
      throw error;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

  const setMetadata = async (sessionID, payload = {}) => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new OpenChamberControlError('a session id is required', 400);
    const patch = payload?.patch;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new OpenChamberControlError('patch must be an object', 400);
=======

  const setMetadata = async (sessionID: string | undefined, payload: SessionPayload = {}) => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new OpenChamberControlError('a session id is required', 400);
    const patch = payload?.patch;
    if (!isMetadata(patch)) {
      throw new OpenChamberControlError('patch must be an object', 400);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    }
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const prepareWorktreeArchiveRemoval = async (owner) => {
    const binding = await agentScopeStore.recheckWorktreeArchive(owner.key, owner.claimId);
    return agentScopeStore.setWorktreeArchivePhase(owner.key, owner.claimId, binding.revision, 'removal_pending');
  };
  const finishWorktreeArchive = (owner) => agentScopeStore.finishWorktreeArchive(owner.key, owner.claimId);
  const rollbackWorktreeArchive = (owner, partial) => agentScopeStore.rollbackWorktreeSessions(owner.key, owner.claimId, partial);
  const discardWorktreeArchive = (owner) => agentScopeStore.discardWorktreeArchive(owner.key);
  const archive = async (payload = {}) => { const parsed = parseArchiveRequest(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); const scopes = await Promise.all(parsed.ids.map((id) => hostScopeFor(id))); scopes.forEach(assertWritableScope); return archiveStore.archive(parsed.ids, parsed.archivedAt); };
  const unarchive = async (payload = {}) => { const parsed = parseIdBatch(payload); if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400); const scopes = await Promise.all(parsed.ids.map((id) => hostScopeFor(id))); scopes.forEach(assertWritableScope); return archiveStore.unarchive(parsed.ids); };
  const getMetadata = async (id) => { await hostScopeFor(id); const state = await sessionMetadataStore.getState(id); return SessionMetadataStateSchema.parse({ sessionId: id, revision: state?.revision ?? '0', metadata: state?.metadata ?? null }); };
  const setMetadata = async (id, payload = {}) => {
    const scope = await hostScopeFor(id);
    assertWritableScope(scope);
    // A client-supplied shape is invalid input, not a server failure.
    const parsed = SessionMetadataPatchSchema.safeParse(payload);
    if (!parsed.success) throw new OpenChamberControlError('Session metadata patch is invalid', 400, { code: 'INVALID_REQUEST' });
    const result = await metadata.set(id, parsed.data.changes, scope.cwd);
    return SessionMetadataStateSchema.parse({ sessionId: id, revision: result.revision, metadata: result.metadata });
  };
  const rename = async (id, payload = {}) => {
    const input = SessionTitleRequestSchema.parse(payload);
    const scope = await hostScopeFor(id);
    assertWritableScope(scope);
    if (scope.workspaceId !== input.workspaceId) throw new OpenChamberControlError('Session title request is outside its Host scope', 403);
    const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}/title`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    }));
    if (runtime.sessionId !== id || runtime.rootSessionId !== scope.rootSessionId
      || runtime.workspaceId !== scope.workspaceId || runtime.projectId !== scope.projectId)
      throw new OpenChamberControlError('Session title response was outside its Host scope', 502);
    const [stored, archive] = await Promise.all([sessionMetadataStore.getState(id), archiveStore.getState(id)]);
    const projected = { ...runtime, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: archive?.revision ?? '0' };
    if (archive?.archivedAt != null) projected.archivedAt = archive.archivedAt;
    return SessionSchema.parse(projected);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

  const getMetadata = async (sessionID, directory = '') => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new OpenChamberControlError('a session id is required', 400);
    return { metadata: await sessionMetadataStore.get(id, { directory }) };
=======

  const getMetadata = async (sessionID: string | undefined, directory = '') => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new OpenChamberControlError('a session id is required', 400);
    return { metadata: await sessionMetadataStore.get(id, { directory }) };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  /**
   * A metadata change decided from the record as it is when this session's
   * write turn comes. Like `metadata.set`, the injected writer owns the store
   * and the broadcast; the fallback is what module tests use.
   */
  const updateMetadata = async (sessionID, decide, directory = '') => {
    if (typeof updateSessionMetadata === 'function') {
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

  /**
   * A metadata change decided from the record as it is when this session's
   * write turn comes. Like `writeMetadata`, the injected writer owns the
   * store and the broadcast; the fallback is what module tests use.
   */
  const updateMetadata = async (sessionID, decide, directory = '') => {
    if (updateSessionMetadata !== null) {
=======

  const updateMetadata = async (sessionID: string, decide: MetadataDecider, directory = '') => {
    if (updateSessionMetadata !== null) {
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      return updateSessionMetadata(sessionID, decide, { directory });
    }
    const result = await sessionMetadataStore.updateSessionMetadata(sessionID, decide, { directory });
    if (result.changed) {
      broadcastGlobalUiEvent?.({
        type: 'openchamber:session-metadata',
        properties: { sessionID, metadata: result.metadata, revision: result.revision },
      });
    }
    return result;
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  /**
   * Link or unlink items on a session the way the UI does (`setLinkedIssue`
   * and `addLinkedIssues`): the list transform runs against the record as it
   * is when this session's write turn comes, so a link an agent made while
   * the request was in flight is read by the decide step instead of being
   * overwritten by a stale client snapshot. The whole `linked_issues` array
   * is never accepted from a client.
   */
  const setSessionLinks = async (sessionID, payload = {}) => {
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

  /**
   * Link or unlink items on a session the way the UI does (`setLinkedIssue`
   * and `addLinkedIssues`): the list transform runs against the record as it
   * is when this session's write turn comes, so a link an agent made while
   * the request was in flight is read by the decide step instead of being
   * overwritten by a stale client snapshot. The whole `linked_issues` array
   * is never accepted from a client. Answers the full metadata afterwards,
   * like the metadata route.
   */
  const setSessionLinks = async (sessionID, payload = {}) => {
=======

  const setSessionLinks = async (sessionID: string | undefined, payload: SessionPayload | null = {}) => {
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    const id = asNonEmptyString(sessionID);
    if (!id) throw new OpenChamberControlError('a session id is required', 400);
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
    const scope = await hostScopeFor(id);
    assertWritableScope(scope);
    // The schema decides what a link operation is; a body of any other shape
    // is a 400, not something to pre-narrow here.
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
    // The schema decides what a link operation is; a body of any other shape
    // is a 400, not something to pre-narrow here.
=======
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    const parsed = parseLinkOperation(payload);
    if (!parsed.ok) throw new OpenChamberControlError(parsed.error, 400);
    const { metadata } = await updateMetadata(
      id,
      (current) => buildLinkedIssuesPatch(current, parsed.entries, parsed.linked),
      scope.cwd,
    );
    return { metadata };
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const selectBranch = async (sessionId, payload = {}) => {
    const input = parseCommand(SessionBranchRequestSchema, payload);
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    await reopen(scope);
    const result = SessionBranchResultSchema.parse(await request(`/internal/sessions/${encodeURIComponent(sessionId)}/branch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) }));
    if (result.sessionId !== sessionId || result.branch.branchId !== input.branchId || BigInt(result.branch.branchVersion) <= BigInt(input.branchVersion)
      || (input.action === 'revert' ? result.branch.revert?.messageId !== input.messageId : result.branch.revert !== undefined))
      throw new OpenChamberControlError('Branch acknowledgement does not match its requested owner and selection', 502);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

  /**
   * Archive a batch of sessions in one request. OpenCode holds the state
   * (`session-archive.js`); a session whose directory is gone keeps it in the
   * archive file. Batching matters because the UI archives every session
   * linked to a worktree before removing it, and one request per session is
   * what made removing a busy worktree take tens of seconds.
   */
  const archive = async (payload = {}) => {
    const parsed = parseArchiveRequest(payload);
    if (!parsed.ok) {
      throw new OpenChamberControlError(parsed.error, 400);
    }
    return sessionArchive.archive(parsed.ids, parsed.archivedAt);
  };

  /** Clears the archive flag for a batch. Mirrors `archive`. */
  const unarchive = async (payload = {}) => {
    const parsed = parseIdBatch(payload);
    if (!parsed.ok) {
      throw new OpenChamberControlError(parsed.error, 400);
    }
    return sessionArchive.unarchive(parsed.ids);
  };

  // `options` come from this server, never from a request body.
  const createInDirectory = async (payload, { titleByUser = false, startedByExtension = null } = {}, onCreated = () => {}) => {
    const title = asNonEmptyString(payload.title);
    const prompt = asNonEmptyString(payload.prompt);
    const goalInput = resolveGoalInput(payload, prompt);
    if (!goalInput.ok) {
      throw new OpenChamberControlError(goalInput.error, 400);
    }
    const model = resolveRequestedModel(payload);
    const agent = asNonEmptyString(payload.agent);
    const variant = asNonEmptyString(payload.variant);

    // Explicit Chats stay projectless even when their root is inside a checkout.
    const resolvedDirectory = payload.projectId === CHATS_SCOPE_PUBLIC_ID
      ? await validateDirectoryPath(payload.directory)
      : await resolveRequestedDirectory({
        chatsScope,
        payload,
        readSettingsFromDiskMigrated,
        sanitizeProjects,
        validateDirectoryPath,
      });
    if (!resolvedDirectory.ok) {
      throw new OpenChamberControlError(resolvedDirectory.error, resolvedDirectory.status || 400);
    }

    const pullRequestInput = resolvePullRequestInput(payload);
    const worktreeInput = pullRequestInput ? null : resolveWorktreeInput(payload);
    let worktree = null;
    let sessionDirectory = resolvedDirectory.directory;
    if (payload?.worktree && !worktreeInput && !pullRequestInput) {
      throw new OpenChamberControlError('worktree.name is required when worktree is provided', 400);
    }

    if (typeof waitForOpenCodeReady === 'function') await waitForOpenCodeReady(10_000, 250);

    const projectPath = resolvedDirectory.projectPath ?? resolvedDirectory.directory;
    if (prompt) {
      // Validated where the request points, the project's own folder: a new
      // worktree does not exist yet, and its start folder mirrors this one.
      await validateRequestedSelection({
        directory: resolvedDirectory.directory,
        requestedModel: model,
        requestedAgent: agent,
        requestedVariant: variant,
      });
    }

    const setup = pullRequestInput || worktreeInput
      ? await worktreeSetupForDirectory(resolvedDirectory.directory)
      : NO_WORKTREE_SETUP;
    const setupInput = setup.startCommand ? { startCommand: setup.startCommand } : {};

    if (pullRequestInput) {
      // Never a plain branch worktree instead: without the contributor
      // pipeline the request is refused.
      if (!(createChangeRequestWorktree instanceof Function)
        || !(worktreeBootstrapStore?.read instanceof Function)
        || !(worktreeBootstrapStore?.write instanceof Function)) {
        throw new OpenChamberControlError('Worktrees from pull requests are not available here', 501);
      }
      try {
        worktree = await createChangeRequestWorktree({ directory: resolvedDirectory.directory, ...pullRequestInput, ...setupInput });
      } catch (error) {
        throw asControlError(error, `Failed to create a worktree from pull request ${pullRequestInput.number}`);
      }
      sessionDirectory = worktree.path;
    } else if (worktreeInput) {
      if (!(hydrateWorktreeCheckout instanceof Function)
        || !(worktreeBootstrapStore?.read instanceof Function)
        || !(worktreeBootstrapStore?.write instanceof Function)) {
        throw new OpenChamberControlError('Worktree checkout bootstrap is not available', 501);
      }
      const hydrateCheckout = ({ directory, parentRemoteName }) => hydrateWorktreeCheckout({
        directory,
        parentDirectory: resolvedDirectory.directory,
        parentRemoteName,
      });
      worktree = await createWorktree(resolvedDirectory.directory, { ...worktreeInput, ...setupInput }, {
        bootstrapStore: worktreeBootstrapStore,
        hydrateCheckout,
      });
      sessionDirectory = worktree.path;
    }

    let startDirectoryFallback = null;
    let client;
    let selection = { model, agent, variant };
    try {
      const checkoutRoot = worktree?.path || (await resolveWorktreeTopLevel(sessionDirectory))?.root || sessionDirectory;
      const { setupStillRunning } = await waitForWorktreeBootstrapReady({ directory: checkoutRoot, bootstrapStore: worktreeBootstrapStore });
      if (worktree) {
        ({ directory: sessionDirectory, fallback: startDirectoryFallback } = await resolveStartDirectory({
          projectPath,
          worktreeRoot: worktree.path,
        }));
      }
      if (setupStillRunning) {
        throw new OpenChamberControlError(`The project's setup commands are still running in ${checkoutRoot}, so no session started there. Retry in that folder once they finish`, 503);
      }
      client = clientFor(sessionDirectory);
      if (prompt) {
        selection = await selectForSession({
          client,
          directory: sessionDirectory,
          projectId: resolvedDirectory.projectId,
          requestedModel: model,
          requestedAgent: agent,
          requestedVariant: variant,
        });
      }
    } catch (error) {
      if (!worktree) throw error;
      const failure = asControlError(error, 'Session creation prerequisites failed');
      throw new OpenChamberControlError(failure.message, failure.statusCode, {
        partial: true,
        partialAction: 'worktree-created',
        directory: sessionDirectory,
      });
    }

    const baseUrl = openCodeBaseUrl();
    const authHeaders = getOpenCodeAuthHeaders();
    const sessionID = await createSession({
      client,
      directory: sessionDirectory,
      ...(title ? { title } : {}),
      titleByUser,
      startedByExtension,
    });
    onCreated();

    let dispatch = { model, agent, variant, promptDispatched: false, dispatchedAsCommand: false };
    if (prompt) {
      dispatch = await dispatchPrompt({
        client,
        baseUrl,
        authHeaders,
        sessionID,
        directory: sessionDirectory,
        projectId: resolvedDirectory.projectId,
        prompt,
        goalInput,
        requestedModel: selection.model,
        requestedAgent: selection.agent,
        requestedVariant: selection.variant,
        promptedBySessionId: asNonEmptyString(payload.promptedBySessionId),
      });
    }

    const result = {
      sessionId: sessionID,
      directory: sessionDirectory,
      ...(resolvedDirectory.projectId ? { projectId: resolvedDirectory.projectId } : {}),
      ...(title ? { title } : {}),
      ...(worktree ? { worktree } : {}),
      ...(prompt && dispatch.model ? { model: dispatch.model } : {}),
      ...(prompt && dispatch.agent ? { agent: dispatch.agent } : {}),
      ...(prompt && dispatch.variant ? { variant: dispatch.variant } : {}),
      promptDispatched: dispatch.promptDispatched,
      ...(dispatch.promptError ? { promptError: dispatch.promptError } : {}),
      dispatchedAsCommand: dispatch.dispatchedAsCommand,
      ...(goalInput.enabled ? { goalEnabled: true } : {}),
      ...(goalInput.tokenBudget ? { goalTokenBudget: goalInput.tokenBudget } : {}),
    };
    // Set when the project's folder could not be used and the session started at the worktree root.
    if (startDirectoryFallback) result.startDirectoryFallback = startDirectoryFallback;
    if (setup.untrustedSkipped.length > 0) result.untrustedSetupCommandsSkipped = setup.untrustedSkipped;

    try {
      emitSessionCreatedEvent?.({
        sessionID,
        directory: sessionDirectory,
        ...(resolvedDirectory.projectId ? { projectID: resolvedDirectory.projectId } : {}),
        ...(title ? { title } : {}),
        ...(worktree ? { worktree } : {}),
        ...(prompt && dispatch.model ? { model: dispatch.model } : {}),
        ...(prompt && dispatch.agent ? { agent: dispatch.agent } : {}),
        ...(prompt && dispatch.variant ? { variant: dispatch.variant } : {}),
        promptDispatched: dispatch.promptDispatched,
        dispatchedAsCommand: dispatch.dispatchedAsCommand,
        ...(goalInput.enabled ? { goalEnabled: true } : {}),
        ...(goalInput.tokenBudget ? { goalTokenBudget: goalInput.tokenBudget } : {}),
        createdAt: Date.now(),
      });
    } catch {
    }

=======

  const archive = async (payload: SessionPayload = {}) => {
    const parsed = parseArchiveRequest(payload);
    if (!parsed.ok) {
      throw new OpenChamberControlError(parsed.error, 400);
    }
    return sessionArchive.archive(parsed.ids, parsed.archivedAt);
  };

  const unarchive = async (payload: SessionPayload = {}) => {
    const parsed = parseIdBatch(payload);
    if (!parsed.ok) {
      throw new OpenChamberControlError(parsed.error, 400);
    }
    return sessionArchive.unarchive(parsed.ids);
  };

  const createInDirectory = async (payload: SessionPayload, { titleByUser = false, startedByExtension = null, operatorParentId = null }: CreateOptions = {}, onCreated = () => {}) => {
    const title = asNonEmptyString(payload.title);
    const prompt = asNonEmptyString(payload.prompt);
    const goalInput = resolveGoalInput(payload, prompt);
    if (!goalInput.ok) {
      throw new OpenChamberControlError(goalInput.error, 400);
    }
    const model = resolveRequestedModel(payload);
    const agent = asNonEmptyString(payload.agent);
    const variant = asNonEmptyString(payload.variant);

    const resolvedDirectory: ResolvedDirectory = payload.projectId === CHATS_SCOPE_PUBLIC_ID
      ? await validateDirectoryPath(asNonEmptyString(payload.directory))
      : await resolveRequestedDirectory({
        chatsScope,
        payload,
        readSettingsFromDiskMigrated,
        sanitizeProjects,
        validateDirectoryPath,
      });
    if (!resolvedDirectory.ok) {
      throw new OpenChamberControlError(resolvedDirectory.error, resolvedDirectory.status || 400);
    }

    const pullRequestInput = resolvePullRequestInput(payload);
    const worktreeInput = pullRequestInput ? null : resolveWorktreeInput(payload);
    let worktree: SessionMoveWorktree | null = null;
    let sessionDirectory = resolvedDirectory.directory;
    if (payload?.worktree && !worktreeInput && !pullRequestInput) {
      throw new OpenChamberControlError('worktree.name is required when worktree is provided', 400);
    }

    if (waitForOpenCodeReady) await waitForOpenCodeReady(10_000, 250);

    const projectPath = resolvedDirectory.projectPath ?? resolvedDirectory.directory;
    if (prompt) {
      await validateRequestedSelection({
        directory: resolvedDirectory.directory,
        requestedModel: model,
        requestedAgent: agent,
        requestedVariant: variant,
      });
    }

    const setup = pullRequestInput || worktreeInput
      ? await worktreeSetupForDirectory(resolvedDirectory.directory)
      : NO_WORKTREE_SETUP;
    const setupInput: SetupInput = {};
    if (setup.startCommand) setupInput.startCommand = setup.startCommand;
    if (setup.createCommand) setupInput.createCommand = setup.createCommand;

    if (pullRequestInput) {
      if (!(createChangeRequestWorktree instanceof Function)
        || !(worktreeBootstrapStore?.read instanceof Function)
        || !(worktreeBootstrapStore?.write instanceof Function)) {
        throw new OpenChamberControlError('Worktrees from pull requests are not available here', 501);
      }
      try {
        worktree = await createChangeRequestWorktree({ directory: resolvedDirectory.directory, ...pullRequestInput, ...setupInput });
      } catch (error) {
        throw asControlError(error, `Failed to create a worktree from pull request ${pullRequestInput.number}`);
      }
      sessionDirectory = worktree.path;
    } else if (worktreeInput) {
      if (!(hydrateWorktreeCheckout instanceof Function)
        || !(worktreeBootstrapStore?.read instanceof Function)
        || !(worktreeBootstrapStore?.write instanceof Function)) {
        throw new OpenChamberControlError('Worktree checkout bootstrap is not available', 501);
      }
      const hydrateCheckout = ({ directory, parentRemoteName }: { directory: string; parentRemoteName: string }) => hydrateWorktreeCheckout({
        directory,
        parentDirectory: resolvedDirectory.directory,
        parentRemoteName,
      });
      worktree = await createWorktree(resolvedDirectory.directory, { ...worktreeInput, ...setupInput }, {
        bootstrapStore: worktreeBootstrapStore,
        hydrateCheckout,
      });
      sessionDirectory = worktree.path;
    }

    let startDirectoryFallback: StartDirectoryResult['fallback'] = null;
    let client;
    let selection: Selection = { model, agent, variant };
    try {
      const checkoutRoot = worktree?.path || (await resolveWorktreeTopLevel(sessionDirectory))?.root || sessionDirectory;
      const { setupStillRunning } = await waitForWorktreeBootstrapReady({ directory: checkoutRoot, bootstrapStore: worktreeBootstrapStore });
      if (worktree) {
        ({ directory: sessionDirectory, fallback: startDirectoryFallback } = await resolveStartDirectory({
          projectPath,
          worktreeRoot: worktree.path,
        }));
      }
      if (setupStillRunning) {
        throw new OpenChamberControlError(`The project's setup commands are still running in ${checkoutRoot}, so no session started there. Retry in that folder once they finish`, 503);
      }
      client = clientFor(sessionDirectory);
      if (prompt) {
        selection = await selectForSession({
          client,
          directory: sessionDirectory,
          projectId: resolvedDirectory.projectId,
          requestedModel: model,
          requestedAgent: agent,
          requestedVariant: variant,
          warmUp: Boolean(worktree),
        });
      }
    } catch (error) {
      if (!worktree) throw error;
      const failure = asControlError(error, 'Session creation prerequisites failed');
      throw new OpenChamberControlError(failure.message, failure.statusCode, {
        partial: true,
        partialAction: 'worktree-created',
        directory: sessionDirectory,
      });
    }

    const baseUrl = openCodeBaseUrl();
    const authHeaders = getOpenCodeAuthHeaders();
    const createInput: Parameters<typeof createSession>[0] = {
      client,
      directory: sessionDirectory,
      titleByUser,
      startedByExtension,
      operatorParentId,
    };
    if (title) createInput.title = title;
    const sessionID = await createSession(createInput);
    onCreated();

    let dispatch: Selection & Omit<DispatchResult, 'model'> = { model, agent, variant, promptDispatched: false, dispatchedAsCommand: false };
    if (prompt) {
      dispatch = await dispatchPrompt({
        client,
        baseUrl,
        authHeaders,
        sessionID,
        directory: sessionDirectory,
        projectId: resolvedDirectory.projectId,
        prompt,
        goalInput,
        requestedModel: selection.model,
        requestedAgent: selection.agent,
        requestedVariant: selection.variant,
        promptedBySessionId: asNonEmptyString(payload.promptedBySessionId),
      });
    }

    const result: CreateResult = {
      sessionId: sessionID,
      directory: sessionDirectory,
      promptDispatched: dispatch.promptDispatched,
      dispatchedAsCommand: dispatch.dispatchedAsCommand,
    };
    if (resolvedDirectory.projectId) result.projectId = resolvedDirectory.projectId;
    if (title) result.title = title;
    if (worktree) result.worktree = worktree;
    if (prompt && dispatch.model) result.model = dispatch.model;
    if (prompt && dispatch.agent) result.agent = dispatch.agent;
    if (prompt && dispatch.variant) result.variant = dispatch.variant;
    if (dispatch.promptError) result.promptError = dispatch.promptError;
    if (goalInput.enabled) result.goalEnabled = true;
    if (goalInput.tokenBudget) result.goalTokenBudget = goalInput.tokenBudget;
    if (startDirectoryFallback) result.startDirectoryFallback = startDirectoryFallback;
    if (setup.untrustedSkipped.length > 0) result.untrustedSetupCommandsSkipped = setup.untrustedSkipped;

    try {
      if (emitSessionCreatedEvent) {
        const event: SessionCreatedEvent = {
          sessionID,
          directory: sessionDirectory,
          promptDispatched: dispatch.promptDispatched,
          dispatchedAsCommand: dispatch.dispatchedAsCommand,
          createdAt: Date.now(),
        };
        if (resolvedDirectory.projectId) event.projectID = resolvedDirectory.projectId;
        if (title) event.title = title;
        if (worktree) event.worktree = worktree;
        if (prompt && dispatch.model) event.model = dispatch.model;
        if (prompt && dispatch.agent) event.agent = dispatch.agent;
        if (prompt && dispatch.variant) event.variant = dispatch.variant;
        if (goalInput.enabled) event.goalEnabled = true;
        if (goalInput.tokenBudget) event.goalTokenBudget = goalInput.tokenBudget;
        emitSessionCreatedEvent(event);
      }
    } catch {
      void 0;
    }

>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    return result;
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const pendingRelocation = async (rootSessionId) => HostSessionRelocationPendingSchema.parse(await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/relocation`)).relocation;
  const sameIntent = (intent, pending) => pending && pending.transactionId === intent.transactionId
    && pending.sourceWorkspaceId === intent.sourceWorkspaceId && pending.destinationWorkspaceId === intent.destinationWorkspaceId;
  const familyOwner = async (intent) => {
    const family = await agentScopeStore.listSessionFamily(intent.rootSessionId);
    if (!family.some((member) => member.sessionId === intent.rootSessionId)) throw new OpenChamberControlError('Relocation family is unavailable', 503);
    if (family.every((member) => member.workspaceId === intent.sourceWorkspaceId)) return 'source';
    if (family.every((member) => member.workspaceId === intent.destinationWorkspaceId)) return 'destination';
    throw new OpenChamberControlError('Relocation Host ownership has changed', 503);
  };
  const assertRelocationRuntime = async (intent, runtime, workspaceId) => {
    const scope = await agentScopeStore.getWorkspace(workspaceId);
    if (!scope || runtime.sessionId !== intent.rootSessionId || runtime.rootSessionId !== intent.rootSessionId
      || runtime.workspaceId !== workspaceId || runtime.projectId !== scope.projectId || (workspaceId === intent.destinationWorkspaceId && runtime.activeRunId !== null))
      throw new OpenChamberControlError('Relocation acknowledgement is outside its captured Host owner', 502);
  };
  const finalizeRelocation = async (intent, action) => {
    const result = HostSessionRelocationFinalizedSchema.parse(await request(`/internal/sessions/${encodeURIComponent(intent.rootSessionId)}/relocation/finalize`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(HostSessionRelocationFinalizeSchema.parse({ transactionId: intent.transactionId, action })),
    }));
    await assertRelocationRuntime(intent, result.session, action === 'commit' ? intent.destinationWorkspaceId : intent.sourceWorkspaceId);
    return result.session;
  };
  const recoverRelocation = async (rootSessionId) => {
    const intent = await agentScopeStore.getRelocation(rootSessionId);
    if (!intent) return;
    const owner = await familyOwner(intent);
    const pending = await pendingRelocation(rootSessionId);
    if (pending && !sameIntent(intent, pending)) throw new OpenChamberControlError('Native relocation intent does not match its Host owner', 503);
    if (pending) await finalizeRelocation(intent, owner === 'destination' ? 'commit' : 'rollback');
    else {
      const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}`));
      await assertRelocationRuntime(intent, runtime, owner === 'destination' ? intent.destinationWorkspaceId : intent.sourceWorkspaceId);
    }
    await agentScopeStore.clearRelocation(intent);
  };
  const relocationResult = async (rootSessionId, workspaceId) => {
    const family = await agentScopeStore.listSessionFamily(rootSessionId);
    const sessions = await Promise.all(family.map(async (member) => {
      const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(member.sessionId)}`));
      if (member.workspaceId !== workspaceId || runtime.sessionId !== member.sessionId || runtime.rootSessionId !== rootSessionId || runtime.workspaceId !== workspaceId || runtime.projectId !== member.projectId)
        throw new OpenChamberControlError('Relocation family projection is outside its destination owner', 502);
      const [stored, archive] = await Promise.all([sessionMetadataStore.getState(member.sessionId), archiveStore.getState(member.sessionId)]);
      const session = { ...runtime, metadata: stored?.metadata ?? null, metadataRevision: stored?.revision ?? '0', archiveRevision: archive?.revision ?? '0' };
      if (archive?.archivedAt != null) session.archivedAt = archive.archivedAt;
      return SessionSchema.parse(session);
    }));
    return SessionRelocateResultSchema.parse({ sessions });
  };
  const relocate = async (sessionId, payload = {}, archiveClaimId) => {
    const input = parseCommand(SessionRelocateRequestSchema, payload);
    if (!agentScopeStore || !resolveHostRelocationScope) throw new OpenChamberControlError('Host relocation authority is unavailable', 503);
    let source = archiveClaimId ? await agentScopeStore.getSession(sessionId) : await resolveHostRelocationScope(sessionId);
    if (!source || source.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    assertWritableScope(source);
    await agentScopeStore.checkWorktreeScope(source.cwd, archiveClaimId);
    const rootSessionId = source.rootSessionId;
    if (relocationControls.has(rootSessionId)) throw new OpenChamberControlError('Session relocation is in progress', 409, { code: 'COMMAND_IN_FLIGHT' });
    // Relocation retires the source worker, so a later prompt must reopen it.
    forgetLive(rootSessionId);
    relocationControls.add(rootSessionId);
    try {
      await recoverRelocation(rootSessionId);
      source = archiveClaimId ? await agentScopeStore.getSession(sessionId) : await resolveHostRelocationScope(sessionId);
      if (!source) throw new OpenChamberControlError('Session scope was not found', 404);
      assertWritableScope(source);
      await agentScopeStore.checkWorktreeScope(source.cwd, archiveClaimId);
      const destination = await resolveWorkspaceScope(input.workspaceId, archiveClaimId);
      if (!destination || destination.projectId !== source.projectId || destination.agentDirectoryId !== source.agentDirectoryId)
        throw new OpenChamberControlError('Relocation destination is outside the source Host owner', 403);
      assertWritableScope(destination);
      await agentScopeStore.checkWorktreeScope(destination.cwd, archiveClaimId);
      if (destination.workspaceId === source.workspaceId) return relocationResult(rootSessionId, destination.workspaceId);
      const intent = { rootSessionId, transactionId: randomUUID(), sourceWorkspaceId: source.workspaceId, destinationWorkspaceId: destination.workspaceId };
      await agentScopeStore.createRelocation(intent, archiveClaimId);
      try {
        const destinationScope = {
          rootSessionId, projectId: destination.projectId, workspaceId: destination.workspaceId, cwd: destination.cwd, agentDirectory: destination.agentDirectory,
          agentDirectoryId: destination.agentDirectoryId, displayPath: destination.displayPath ?? 'workspace'
        };
        if (destination.env) destinationScope.env = destination.env;
        const prepared = HostSessionRelocationPreparedSchema.parse(await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/relocation/prepare`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(HostSessionRelocationPrepareSchema.parse({
            transactionId: intent.transactionId, sourceWorkspaceId: source.workspaceId,
            destination: destinationScope,
          })),
        }));
        if (prepared.transactionId !== intent.transactionId) throw new OpenChamberControlError('Relocation acknowledgement identified another transaction', 502);
        await assertRelocationRuntime(intent, prepared.session, destination.workspaceId);
        await agentScopeStore.rebindSessionFamily(intent, archiveClaimId);
        await finalizeRelocation(intent, 'commit');
        await agentScopeStore.clearRelocation(intent);
      } catch (error) {
        // An unreadable response is not proof of failure. Only a matching durable
        // native intent permits rollback; a completed destination is reconciled.
        const pending = await pendingRelocation(rootSessionId);
        if (pending && !sameIntent(intent, pending)) throw new OpenChamberControlError('Native relocation recovery owner has changed', 503);
        const owner = await familyOwner(intent);
        if (!pending && owner === 'destination') {
          const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}`));
          await assertRelocationRuntime(intent, runtime, destination.workspaceId);
          await agentScopeStore.clearRelocation(intent);
          return relocationResult(rootSessionId, destination.workspaceId);
        }
        if (pending) {
          if (owner === 'destination') await agentScopeStore.rollbackSessionFamily(intent, archiveClaimId);
          await finalizeRelocation(intent, 'rollback');
        } else {
          const runtime = RuntimeSessionSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}`));
          await assertRelocationRuntime(intent, runtime, source.workspaceId);
        }
        await agentScopeStore.clearRelocation(intent);
        throw error;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

  /** Archived subsessions under a session, each parent before its children. */
  const listArchivedSubsessions = async (client, rootID) => {
    const seen = new Set([rootID]);
    const seenCursors = new Set();
    const parents = [rootID];
    while (parents.length > 0) {
      const parentID = parents.shift();
      let cursor;
      do {
        const page = await client.session.list(cursor ? { cursor } : { parentID, archived: true });
        for (const child of page?.data ?? []) {
          if (!child?.id || !child.time?.archived || seen.has(child.id)) continue;
          seen.add(child.id);
          parents.push(child.id);
        }
        // A repeated cursor would spin the walk and hold the send open.
        cursor = page?.data?.length ? page.cursor?.next : undefined;
        if (cursor && seenCursors.has(cursor)) cursor = undefined;
        if (cursor) seenCursors.add(cursor);
      } while (cursor);
    }
    seen.delete(rootID);
    return [...seen];
  };

  /**
   * A prompt sent to an archived top-level session brings it back with its
   * archived subsessions, as a send from the composer does
   * (`packages/ui/src/sync/user-message-resume.ts`). The prompt is already
   * accepted, so a failed restore is logged and never fails the send.
   */
  const restoreAfterSend = async (client, sessionID) => {
    try {
      const session = await client.session.get({ sessionID });
      if (session?.parentID) return;
      const archivedAt = await sessionArchive.archivedAt(sessionID);
      if (!archivedAt) return;
      // Read before the root changes state, as the composer's tree restore does.
      const subsessionIDs = await listArchivedSubsessions(client, sessionID);
      // A newer archive or a restore by someone else supersedes this one.
      if (await sessionArchive.archivedAt(sessionID) !== archivedAt) return;
      const { failedIds } = await sessionArchive.unarchive([sessionID]);
      if (failedIds.length > 0) return;
      if (subsessionIDs.length > 0) await sessionArchive.unarchive(subsessionIDs);
    } catch (error) {
      console.warn(`[openchamber-sessions] could not restore ${sessionID} after a send:`, error?.message ?? error);
    }
  };

  const create = async (payload = {}, options = {}) => {
    const projectId = asNonEmptyString(payload.projectId) || asNonEmptyString(payload.projectID);
    if (projectId !== CHATS_SCOPE_PUBLIC_ID) return createInDirectory(payload, options);
    if (asNonEmptyString(payload.directory)) {
      throw new OpenChamberControlError('Provide only one of projectId or directory', 400);
    }
    if (payload.worktree !== undefined || payload.pullRequest !== undefined) {
      throw new OpenChamberControlError('Chats cannot create a worktree; choose a project', 400);
    }
    if (!chatsScope) throw new OpenChamberControlError('Chats are not available on this server', 503);
    const directory = await chatsScope.createChatDirectory();
    let created = false;
    try {
      return await createInDirectory({ ...payload, projectId: CHATS_SCOPE_PUBLIC_ID, directory }, options, () => { created = true; });
    } finally {
      // A prompt can fail after the session exists. Keep that session's folder.
      if (!created) await chatsScope.discardChatDirectory(directory);
    }
  };

  const runExisting = async (action, sourceSessionId, payload = {}) => {
    const sourceSessionID = asNonEmptyString(sourceSessionId);
    const prompt = asNonEmptyString(payload.prompt);
    if (!sourceSessionID) throw new OpenChamberControlError('sessionId is required', 400);
    if (!prompt) throw new OpenChamberControlError('prompt is required', 400);
    const goalInput = resolveGoalInput(payload, prompt);
    if (!goalInput.ok) throw new OpenChamberControlError(goalInput.error, 400);
    const requestedModel = resolveRequestedModel(payload);

    let targetSessionID = sourceSessionID;
    let targetSession = null;
    let directory = null;
    try {
      const resolvedDirectory = await resolveRequestedDirectory({
        chatsScope,
        payload,
        readSettingsFromDiskMigrated,
        sanitizeProjects,
        validateDirectoryPath,
      });
      if (!resolvedDirectory.ok) {
        throw new OpenChamberControlError(resolvedDirectory.error, resolvedDirectory.status || 400);
=======

  const restoreAfterSend = async (client: SessionClient, sessionID: string) => {
    try {
      const session = await client.session.get({ sessionID });
      if (sessionParentId(session)) return;
      const archivedAt = await sessionArchive.archivedAt(sessionID);
      if (!archivedAt) return;
      const subsessionIDs = await listArchivedSubsessions(client, sessionID);
      if (await sessionArchive.archivedAt(sessionID) !== archivedAt) return;
      const { failedIds } = await sessionArchive.unarchive([sessionID]);
      if (failedIds.length > 0) return;
      if (subsessionIDs.length > 0) await sessionArchive.unarchive(subsessionIDs);
    } catch (error) {
      console.warn(`[openchamber-sessions] could not restore ${sessionID} after a send:`, (hasMessage(error) ? error.message : undefined) ?? error);
    }
  };

  const create = async (payload: SessionPayload = {}, options: CreateOptions = {}) => {
    const projectId = asNonEmptyString(payload.projectId) || asNonEmptyString(payload.projectID);
    if (projectId !== CHATS_SCOPE_PUBLIC_ID) return createInDirectory(payload, options);
    if (asNonEmptyString(payload.directory)) {
      throw new OpenChamberControlError('Provide only one of projectId or directory', 400);
    }
    if (payload.worktree !== undefined || payload.pullRequest !== undefined) {
      throw new OpenChamberControlError('Chats cannot create a worktree; choose a project', 400);
    }
    if (!chatsScope) throw new OpenChamberControlError('Chats are not available on this server', 503);
    const directory = await chatsScope.createChatDirectory();
    let created = false;
    try {
      return await createInDirectory({ ...payload, projectId: CHATS_SCOPE_PUBLIC_ID, directory }, options, () => { created = true; });
    } finally {
      if (!created) await chatsScope.discardChatDirectory(directory);
    }
  };

  const runExisting = async (action: 'send' | 'fork', sourceSessionId: string | undefined, payload: SessionPayload | null = {}) => {
    const sourceSessionID = asNonEmptyString(sourceSessionId);
    if (payload === null) throw new TypeError("Cannot read properties of null (reading 'prompt')");
    const prompt = asNonEmptyString(payload.prompt);
    if (!sourceSessionID) throw new OpenChamberControlError('sessionId is required', 400);
    if (!prompt) throw new OpenChamberControlError('prompt is required', 400);
    const goalInput = resolveGoalInput(payload, prompt);
    if (!goalInput.ok) throw new OpenChamberControlError(goalInput.error, 400);
    const requestedModel = resolveRequestedModel(payload);

    let targetSessionID = sourceSessionID;
    let targetSession = null;
    let directory: string | null = null;
    try {
      const resolvedDirectory = await resolveRequestedDirectory({
        chatsScope,
        payload,
        readSettingsFromDiskMigrated,
        sanitizeProjects,
        validateDirectoryPath,
      });
      if (!resolvedDirectory.ok) {
        throw new OpenChamberControlError(resolvedDirectory.error, resolvedDirectory.status || 400);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      }
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
      return relocationResult(rootSessionId, destination.workspaceId);
    } finally { relocationControls.delete(rootSessionId); }
  };
  const resolveWorktreeArchivePinnedTarget = async ({ projectDirectory, archiveId, revision }) => {
    const project = await dependencies.resolveWorkspaceDirectory(projectDirectory);
    const scope = project && await agentScopeStore.getWorkspace(project.workspaceId);
    const binding = scope && await agentScopeStore.getWorktreeArchive({ hostProjectId: scope.hostProjectId, archiveId });
    if (!binding || binding.phase !== 'restoring' || binding.revision !== revision || !binding.targetWorkspaceId)
      throw new OpenChamberControlError('Restore target is unavailable or changed', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    const target = await agentScopeStore.getWorkspace(binding.targetWorkspaceId);
    if (!target || target.projectId !== binding.projectId) throw new OpenChamberControlError('Restore target is unavailable', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    return target.cwd;
  };
  const prepareWorktreeArchiveRestore = async ({ projectDirectory, targetDirectory, archiveId, recovery, expectedRevision }) => {
    const project = await dependencies.resolveWorkspaceDirectory(projectDirectory);
    if (!project) throw new OpenChamberControlError('Host project scope is unavailable', 503);
    const projectScope = await agentScopeStore.getWorkspace(project.workspaceId);
    if (!projectScope) throw new OpenChamberControlError('Host project scope is unavailable', 503);
    const key = { hostProjectId: projectScope.hostProjectId, archiveId };
    let binding = await agentScopeStore.getWorktreeArchive(key);
    if (!binding) return null;
    const recoveringRemoval = binding.phase === 'removal_pending';
    if (expectedRevision !== undefined && binding.revision !== expectedRevision)
      throw new OpenChamberControlError('Restore revision changed', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    const parsedRecovery = recovery === undefined ? null : z.strictObject({ mode: z.literal('new_checkout'), revision: z.number().int().positive() }).safeParse(recovery);
    const recovering = parsedRecovery?.success === true;
    if (recovery !== undefined && (!recovering || parsedRecovery.data.revision !== binding.revision
      || !binding.targetWorkspaceId || binding.sessions.some((item) => ['move_intent', 'restored'].includes(item.progress))))
      throw new OpenChamberControlError('Restore recovery intent is stale or sessions have moved', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    let target = !recovering && binding.targetWorkspaceId ? await agentScopeStore.getWorkspace(binding.targetWorkspaceId) : null;
    if (!target) {
      const found = await dependencies.resolveWorkspaceDirectory(targetDirectory);
      target = found && await agentScopeStore.getWorkspace(found.workspaceId);
    }
    if (recovering && target?.workspaceId === binding.targetWorkspaceId)
      throw new OpenChamberControlError('Recovery requires a different checkout', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    const previousTarget = recovering ? await agentScopeStore.getWorkspace(binding.targetWorkspaceId) : null;
    if (recovering && !previousTarget) throw new OpenChamberControlError('Previous restore target is unavailable', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    if (!target || target.cwd !== targetDirectory || target.projectId !== binding.projectId)
      throw new OpenChamberControlError('Restore target does not match the Host archive owner', 409, { code: 'WORKTREE_ARCHIVE_TARGET_CHANGED' });
    const claimId = randomUUID();
    binding = await agentScopeStore.claimWorktreeArchive(key, { claimId, claimGeneration: worktreeArchiveGeneration, revision: binding.revision, phase: 'restoring' });
    return { key, claimId, binding, targetWorkspaceId: target.workspaceId, recovering, recoveringRemoval, previousTargetDirectory: previousTarget?.cwd };
  };
  const finishWorktreeArchiveRestore = async (owner) => {
    let binding = await agentScopeStore.getWorktreeArchive(owner.key);
    for (const rootId of new Set(binding.sessions.map((item) => item.rootSessionId))) {
      const rows = binding.sessions.filter((item) => item.rootSessionId === rootId);
      if (rows.every((item) => item.progress === 'restored')) continue;
      for (const item of rows) {
        const scope = await agentScopeStore.getSession(item.sessionId);
        const state = await archiveStore.getState(item.sessionId);
        if (!scope || scope.projectId !== binding.projectId || scope.agentDirectoryId !== item.agentDirectoryId
          || ![item.workspaceId, binding.targetWorkspaceId].includes(scope.workspaceId)
          || state?.archivedAt == null || state.revision !== (item.expectedArchiveRevision ?? item.originalArchiveRevision))
          throw new OpenChamberControlError('Archived session scope or state changed', 409);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
      directory = resolvedDirectory.directory;
      if (typeof waitForOpenCodeReady === 'function') await waitForOpenCodeReady(10_000, 250);

      await validateRequestedSelection({
        directory,
        requestedModel,
        requestedAgent: asNonEmptyString(payload.agent),
        requestedVariant: asNonEmptyString(payload.variant),
      });

      const baseUrl = openCodeBaseUrl();
      const authHeaders = getOpenCodeAuthHeaders();
      const client = clientFor(directory);
      if (action === 'fork') {
        targetSession = await forkSession({
          client,
          sessionID: sourceSessionID,
          messageID: asNonEmptyString(payload.messageId) || undefined,
        });
        targetSessionID = targetSession.id;
        // Before the prompt goes out, so a goal armed by this dispatch writes
        // over the copied objective rather than the other way round.
        await applyForkInheritance({
          sourceSessionID,
          fork: targetSession,
          readObjective,
          writeObjective,
          writeMetadata: (sessionID, patch) => writeMetadata(sessionID, patch, directory),
        });
=======
      directory = resolvedDirectory.directory;
      if (waitForOpenCodeReady) await waitForOpenCodeReady(10_000, 250);

      await validateRequestedSelection({
        directory,
        requestedModel,
        requestedAgent: asNonEmptyString(payload.agent),
        requestedVariant: asNonEmptyString(payload.variant),
      });

      const baseUrl = openCodeBaseUrl();
      const authHeaders = getOpenCodeAuthHeaders();
      const client = clientFor(directory);
      if (action === 'fork') {
        targetSession = await forkSession({
          client,
          sessionID: sourceSessionID,
          messageID: asNonEmptyString(payload.messageId) || undefined,
        });
        targetSessionID = targetSession.id;
        await applyForkInheritance({
          sourceSessionID,
          fork: targetSession,
          readObjective,
          writeObjective,
          writeMetadata: (sessionID, patch) => writeMetadata(sessionID, patch, resolvedDirectory.directory),
          writePermissions: (sessionID, permissions) => client.session.update({ sessionID, permissions }),
        });
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      }
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
      binding = await agentScopeStore.markWorktreeRestoreMove(owner.key, owner.claimId, rootId);
      await relocate(rootId, { workspaceId: binding.targetWorkspaceId }, owner.claimId);
      binding = await agentScopeStore.completeWorktreeRestoreFamily(owner.key, owner.claimId, rootId);
    }
    return binding;
  };
  const pinWorktreeArchiveRestore = (owner, fingerprints) => agentScopeStore.pinWorktreeRestore(owner.key, { ...fingerprints, claimId: owner.claimId, revision: owner.binding.revision, targetWorkspaceId: owner.targetWorkspaceId, recovery: owner.recovering });
  const markWorktreeArchiveRestoreAttempted = (owner, revision) => agentScopeStore.markWorktreeRestoreAttempted(owner.key, owner.claimId, revision);
  const releaseWorktreeArchiveRestore = (owner) => agentScopeStore.releaseWorktreeArchiveClaim(owner.key, owner.claimId);
  const finalizeWorktreeArchiveRestore = (owner, revision) => agentScopeStore.setWorktreeArchivePhase(owner.key, owner.claimId, revision, 'finalizing');
  const cleanupWorktreeArchiveRestore = (owner) => agentScopeStore.discardWorktreeArchive(owner.key);
  const prepareWorktreeArchiveDelete = async ({ projectDirectory, archiveId }) => {
    const project = await dependencies.resolveWorkspaceDirectory(projectDirectory);
    const scope = project && await agentScopeStore.getWorkspace(project.workspaceId);
    if (!scope) throw new OpenChamberControlError('Host project scope is unavailable', 503);
    const key = { hostProjectId: scope.hostProjectId, archiveId };
    let binding = await agentScopeStore.getWorktreeArchive(key);
    if (!binding) return null;
    const recoveringRemoval = binding.phase === 'removal_pending';
    return { key, binding, recoveringRemoval };
  };
  const claimWorktreeArchiveDelete = async (owner) => {
    const claimId = randomUUID();
    const binding = await agentScopeStore.claimWorktreeArchive(owner.key, { claimId, claimGeneration: worktreeArchiveGeneration, revision: owner.binding.revision, phase: 'deleting' });
    return { ...owner, claimId, binding };
  };
  const deleteWorktreeArchiveSessions = async (owner) => {
    let binding = await agentScopeStore.getWorktreeArchive(owner.key);
    for (const rootId of new Set(binding.sessions.map((item) => item.rootSessionId))) {
      const reservation = await agentScopeStore.reserveWorktreeArchiveDeleteFamily(owner.key, owner.claimId, rootId);
      binding = reservation.binding;
      const rows = binding.sessions.filter((item) => item.rootSessionId === rootId);
      if (reservation.action === 'skip') continue;
      const operationId = reservation.operationId ?? rows[0]?.deleteOperationId;
      const root = rows.find((item) => item.sessionId === rootId);
      if (reservation.action === 'done' && !operationId) continue;
      if (!root || !operationId) throw new OpenChamberControlError('Archived root session is unavailable', 503);
      const nativeDelete = {
        operationId, projectId: binding.projectId, workspaceId: root.workspaceId,
        agentDirectoryId: root.agentDirectoryId, sessionIds: rows.map((item) => item.sessionId)
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

      const baselineAssistantMessageId = await latestCompletedAssistantMessageID({
        client,
        sessionID: targetSessionID,
      });
      const baselineIdleRecordId = await latestIdleRecordID({ client, sessionID: targetSessionID });

      const dispatch = await dispatchPrompt({
        client,
        baseUrl,
        authHeaders,
        sessionID: targetSessionID,
        directory,
        projectId: resolvedDirectory.projectId,
        prompt,
        goalInput,
        requestedModel,
        requestedAgent: asNonEmptyString(payload.agent),
        requestedVariant: asNonEmptyString(payload.variant),
        reuseSessionSelection: true,
        clearResponseStyle: action === 'fork',
        promptedBySessionId: asNonEmptyString(payload.promptedBySessionId),
      });
      if (action === 'send' && dispatch.promptDispatched) await restoreAfterSend(client, targetSessionID);
      const result = {
        action,
        sessionId: targetSessionID,
        directory,
        ...(action === 'fork' ? { sourceSessionId: sourceSessionID } : {}),
        ...(targetSession?.title ? { title: targetSession.title } : {}),
        ...(baselineAssistantMessageId ? { baselineAssistantMessageId } : {}),
        ...(baselineIdleRecordId !== undefined ? { baselineIdleRecordId } : {}),
        model: dispatch.model,
        ...(dispatch.agent ? { agent: dispatch.agent } : {}),
        ...(dispatch.variant ? { variant: dispatch.variant } : {}),
        promptDispatched: dispatch.promptDispatched,
        ...(dispatch.promptError ? { promptError: dispatch.promptError } : {}),
        dispatchedAsCommand: dispatch.dispatchedAsCommand,
        ...(goalInput.enabled ? { goalEnabled: true } : {}),
        ...(goalInput.tokenBudget ? { goalTokenBudget: goalInput.tokenBudget } : {}),
=======

      const baselineAssistantMessageId = await latestCompletedAssistantMessageID({
        client,
        sessionID: targetSessionID,
      });
      const baselineIdleRecordId = await latestIdleRecordID({ client, sessionID: targetSessionID });

      const dispatch = await dispatchPrompt({
        client,
        baseUrl,
        authHeaders,
        sessionID: targetSessionID,
        directory,
        projectId: resolvedDirectory.projectId,
        prompt,
        goalInput,
        requestedModel,
        requestedAgent: asNonEmptyString(payload.agent),
        requestedVariant: asNonEmptyString(payload.variant),
        reuseSessionSelection: true,
        clearResponseStyle: action === 'fork',
        promptedBySessionId: asNonEmptyString(payload.promptedBySessionId),
      });
      if (action === 'send' && dispatch.promptDispatched) await restoreAfterSend(client, targetSessionID);
      const result: ExistingResult = {
        action,
        sessionId: targetSessionID,
        directory,
        model: dispatch.model,
        promptDispatched: dispatch.promptDispatched,
        dispatchedAsCommand: dispatch.dispatchedAsCommand,
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
      if (reservation.action === 'done') {
        await request(`/internal/sessions/${encodeURIComponent(rootId)}/worktree-archive-delete/retire`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nativeDelete),
        });
        continue;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

      if (action === 'fork') {
        try {
          emitSessionCreatedEvent?.({
            sessionID: targetSessionID,
            directory,
            sourceSessionID,
            ...(targetSession?.title ? { title: targetSession.title } : {}),
            model: dispatch.model,
            ...(dispatch.agent ? { agent: dispatch.agent } : {}),
            ...(dispatch.variant ? { variant: dispatch.variant } : {}),
            promptDispatched: dispatch.promptDispatched,
            dispatchedAsCommand: dispatch.dispatchedAsCommand,
            ...(goalInput.enabled ? { goalEnabled: true } : {}),
            ...(goalInput.tokenBudget ? { goalTokenBudget: goalInput.tokenBudget } : {}),
            createdAt: Date.now(),
          });
        } catch {
        }
=======
      if (action === 'fork') result.sourceSessionId = sourceSessionID;
      if (targetSession?.title) result.title = targetSession.title;
      if (baselineAssistantMessageId) result.baselineAssistantMessageId = baselineAssistantMessageId;
      if (baselineIdleRecordId !== undefined) result.baselineIdleRecordId = baselineIdleRecordId;
      if (dispatch.agent) result.agent = dispatch.agent;
      if (dispatch.variant) result.variant = dispatch.variant;
      if (dispatch.promptError) result.promptError = dispatch.promptError;
      if (goalInput.enabled) result.goalEnabled = true;
      if (goalInput.tokenBudget) result.goalTokenBudget = goalInput.tokenBudget;

      if (action === 'fork') {
        try {
          if (emitSessionCreatedEvent) {
            const event: SessionCreatedEvent = {
              sessionID: targetSessionID,
              directory,
              sourceSessionID,
              model: dispatch.model,
              promptDispatched: dispatch.promptDispatched,
              dispatchedAsCommand: dispatch.dispatchedAsCommand,
              createdAt: Date.now(),
            };
            if (targetSession?.title) event.title = targetSession.title;
            if (dispatch.agent) event.agent = dispatch.agent;
            if (dispatch.variant) event.variant = dispatch.variant;
            if (goalInput.enabled) event.goalEnabled = true;
            if (goalInput.tokenBudget) event.goalTokenBudget = goalInput.tokenBudget;
            emitSessionCreatedEvent(event);
          }
        } catch {
          void 0;
        }
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      }
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
      const ack = z.strictObject({ operationId: EntityIdSchema, sessionId: EntityIdSchema, deletedSessionIds: z.array(EntityIdSchema) }).parse(await request(`/internal/sessions/${encodeURIComponent(rootId)}/worktree-archive-delete`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nativeDelete),
      }));
      if (ack.sessionId !== rootId || ack.operationId !== operationId) throw new OpenChamberControlError('Session deletion acknowledgement identified another operation', 502);
      binding = await agentScopeStore.completeWorktreeArchiveDeleteFamily(owner.key, owner.claimId, rootId, ack.deletedSessionIds);
      await request(`/internal/sessions/${encodeURIComponent(rootId)}/worktree-archive-delete/retire`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(nativeDelete),
      });
    }
    return binding;
  };
  const finalizeWorktreeArchiveDelete = (owner, revision, deleteBranch) => agentScopeStore.markWorktreeArchiveDeleteFinalizing(owner.key, owner.claimId, revision, deleteBranch);
  const control = async (sessionId, operation = {}) => {
    const scope = await scopeFor(sessionId);
    assertWritableScope(scope);
    const parsed = parseCommand(SessionControlRequestSchema, operation);
    if (parsed.type === 'abort') {
      const requestBody = RunAbortRequestSchema.parse({ sessionId, runId: parsed.runId });
      const body = await request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/runs/${encodeURIComponent(requestBody.runId)}/abort`, { method: 'POST' });
      return { run: RunSchema.parse(body?.run) };
    }
    // Mode, compact, goal, command and btw need a worker. Abort above does not:
    // a cold root has no active run, so reopening would only waste a slot.
    await reopen(scope);
    const body = await request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/control`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed) });
    const ack = SessionControlAckSchema.parse(body);
    // A completed /btw branch rekeys the Agent Service session to the id the
    // native branch minted. The Host binding the caller addressed is now that
    // old id, so it must follow the rekey here; otherwise every later
    // root-addressed read answers "Session scope was not found" for a live
    // session and the composer loses its chat.
    if (ack.type === 'btw.branch' && ack.sessionId !== undefined && ack.sessionId !== sessionId) {
      // The registry rekeys to a self-rooted identity: the minted id is its own
      // root, and the retired id names no session. Only the branch's session
      // file records the pre-branch file as its native lineage.
      if (ack.rootSessionId !== undefined && ack.rootSessionId !== ack.sessionId) throw new OpenChamberControlError('A BTW branch must stay its own root', 502);
      const rebound = await agentScopeStore.rebindSessionRoot(sessionId, ack.sessionId);
      if (!rebound || rebound.sessionId !== ack.sessionId) throw new OpenChamberControlError('Canonical session rekey was not persisted', 503);
      forgetLive(sessionId);
      rememberLive(ack.sessionId);
    }
    return ack;
  };
  const remove = async (id) => {
    const scope = await scopeFor(id);
    const reservation = await agentScopeStore.reserveSessionDelete(id);
    try {
      // Deleting retires the worker, so no send may treat this root as live. The
      // reopen below is a one-off restore for the DELETE itself, and the finally
      // clears the confirmation it publishes.
      forgetLive(scope.rootSessionId);
      if (!scope.workspaceId.startsWith('archive_')) await reopen(scope);
      const ack = SessionDeleteAckSchema.parse(await request(`/api/agent/v1/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }));
      if (ack.sessionId !== id) throw new OpenChamberControlError('Session deletion acknowledgement identified another session', 502);
      if (scope.workspaceId.startsWith('archive_')) await onArchiveDeleted?.(scope, ack);
      else await agentScopeStore.removeSessionFamily(scope.rootSessionId);
      return ack;
    } finally {
      // Deleting retires the worker whether or not the delete was acknowledged.
      forgetLive(scope.rootSessionId);
      agentScopeStore.releaseSessionDelete(reservation);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
      return result;
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      const forkCreated = action === 'fork' && targetSessionID !== sourceSessionID;
      const goalConfigured = error?.goalConfigured === true;
      throw new OpenChamberControlError(
        error instanceof Error ? error.message : `Failed to ${action} session`,
        statusCode,
        {
        ...(forkCreated || goalConfigured
          ? {
            partial: true,
            partialAction: forkCreated ? 'fork-created' : 'goal-configured',
            sessionId: targetSessionID,
            directory,
          }
          : {}),
        },
      );
=======
      return result;
    } catch (error) {
      const statusCode = Number(controlErrorFields(error)?.statusCode) || 500;
      const forkCreated = action === 'fork' && targetSessionID !== sourceSessionID;
      const goalConfigured = controlErrorFields(error)?.goalConfigured === true;
      const details: ControlErrorDetails = {};
      if (forkCreated || goalConfigured) {
        details.partial = true;
        details.partialAction = forkCreated ? 'fork-created' : 'goal-configured';
        details.sessionId = targetSessionID;
        details.directory = directory;
      }
      throw new OpenChamberControlError(
        error instanceof Error ? error.message : `Failed to ${action} session`,
        statusCode,
        details,
      );
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    }
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const listArchivedWorktreeSessions = async ({ projectDirectory, archiveId }) => {
    if (!agentScopeStore) throw new OpenChamberControlError('Host archive authority is unavailable', 503);
    const resolveProject = dependencies.resolveWorkspaceDirectory;
    const project = resolveProject ? await resolveProject(projectDirectory) : null;
    if (!project) throw new OpenChamberControlError('Project directory is unavailable', 404);
    const binding = await agentScopeStore.getWorktreeArchive({ hostProjectId: project.hostProjectId, archiveId });
    if (!binding) return { sessions: [] };
    const sessions = await Promise.all(binding.sessions.map(async (item) => {
      const metadataState = await sessionMetadataStore.getState(item.sessionId);
      const archiveState = await archiveStore.getState(item.sessionId);
      return {
        sessionId: item.sessionId,
        rootSessionId: item.rootSessionId,
        workspaceId: item.workspaceId,
        metadata: metadataState?.metadata ?? null,
        archivedAt: archiveState?.archivedAt ?? null,
        progress: item.progress,
      };
    }));
    return { sessions };
  };
  const unloadWorker = async (id) => { forgetLive(id); try { await request(`/internal/workers/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch { } };
  /**
   * A session's own folder name inside its checkout, or the worktree root:
   * the same rule the New worktree dialog applies (worktree-start-directory).
   */
  const resolveMoveStartDirectory = createStartDirectoryResolver({
    resolveWorktreeTopLevel: dependencies.resolveWorktreeTopLevel,
    validateWorktreeDirectory: dependencies.validateWorktreeDirectory,
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js

  const worktreeMover = createSessionWorktreeMover({
    createWorktree,
    removeWorktree,
    getBranches,
    stashPush,
    getPathsWithoutChanges,
    stashApply,
    stashDrop,
    listStashes,
    resolvePrimaryWorktreeRoot,
    bootstrapStore: worktreeBootstrapStore,
    waitForWorktreeReady: (directory) => waitForWorktreeBootstrapReady({ directory, bootstrapStore: worktreeBootstrapStore }),
    resolveStartDirectory: async ({ sourceDirectory, worktreeRoot }) => resolveStartDirectory({
      projectPath: await projectPathFor(sourceDirectory),
      worktreeRoot,
    }),
    hydrateCheckout: hydrateWorktreeCheckout,
    resolveWorktreeSetup: worktreeSetupForDirectory,
    // The move is global in v2: no directory header, the session id names it.
    moveSession: (sessionID, directory) => clientFor(undefined).session.move({ sessionID, directory }),
=======

  const worktreeMover = createSessionWorktreeMover({
    createWorktree,
    removeWorktree,
    getBranches,
    stashPush,
    getPathsWithoutChanges,
    stashApply,
    stashDrop,
    listStashes,
    resolvePrimaryWorktreeRoot,
    bootstrapStore: worktreeBootstrapStore,
    waitForWorktreeReady: (directory) => waitForWorktreeBootstrapReady({ directory, bootstrapStore: worktreeBootstrapStore }),
    resolveStartDirectory: async ({ sourceDirectory, worktreeRoot }) => resolveStartDirectory({
      projectPath: await projectPathFor(sourceDirectory),
      worktreeRoot,
    }),
    hydrateCheckout: hydrateWorktreeCheckout,
    resolveWorktreeSetup: worktreeSetupForDirectory,
    moveSession: (sessionID, directory) => clientFor(undefined).session.move({ sessionID, directory }),
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
  });

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  // The setup commands a server-made worktree runs, with no client to show the
  // trust prompt; the dialog resolves the same list and sends it as startCommand.
  const resolveMoveSetup = async (sourceDirectory) => {
    if (typeof dependencies.readWorktreeSetup !== 'function' || typeof dependencies.resolveProjectDirectory !== 'function') {
      return { startCommand: '', untrustedSkipped: [] };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
  /**
   * Move an existing session into a new worktree of its repository, carrying
   * the files the agent names along (`./worktree-move.js`). The worktree needs
   * the same bootstrap as `create` gives a new one.
   */
  const moveToWorktree = async (sessionID, payload = {}) => {
    if (!(hydrateWorktreeCheckout instanceof Function)
      || !(worktreeBootstrapStore?.read instanceof Function)
      || !(worktreeBootstrapStore?.write instanceof Function)) {
      throw new OpenChamberControlError('Worktree checkout bootstrap is not available', 501);
=======
  const moveToWorktree = async (sessionID: string, payload: SessionPayload = {}) => {
    if (!(hydrateWorktreeCheckout instanceof Function)
      || !(worktreeBootstrapStore?.read instanceof Function)
      || !(worktreeBootstrapStore?.write instanceof Function)) {
      throw new OpenChamberControlError('Worktree checkout bootstrap is not available', 501);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    }
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
    const project = await dependencies.resolveProjectDirectory(sourceDirectory).catch(() => null);
    if (!project?.projectId) return { startCommand: '', untrustedSkipped: [] };
    const setup = await dependencies.readWorktreeSetup(project.projectId);
    return dependencies.worktreeSetupOf(setup, project.projectDirectory ?? sourceDirectory);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
    await waitForOpenCodeReady?.(10_000, 250);
    return worktreeMover.move({
      sessionId: sessionID,
      directory: asNonEmptyString(payload.directory),
      name: asNonEmptyString(payload.worktree?.name),
      branchName: asNonEmptyString(payload.worktree?.branchName),
      startRef: asNonEmptyString(payload.worktree?.startRef),
      existingBranch: asNonEmptyString(payload.worktree?.existingBranch),
      carry: payload.carry,
    });
=======
    await waitForOpenCodeReady?.(10_000, 250);
    return worktreeMover.move({
      sessionId: sessionID,
      directory: asNonEmptyString(payload.directory),
      name: asNonEmptyString(worktreeFields(payload)?.name),
      branchName: asNonEmptyString(worktreeFields(payload)?.branchName),
      startRef: asNonEmptyString(worktreeFields(payload)?.startRef),
      existingBranch: asNonEmptyString(worktreeFields(payload)?.existingBranch),
      carry: payload.carry,
    });
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
  };

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  /**
   * Move a session into a new worktree of its repository, carrying the files
   * the agent names (`./worktree-move.js`). Authorization is decided here, on
   * the authenticated scope, before anything is created:
   * `agentScopeStore.checkWorktreeScope` refuses while an archive owns the
   * scope, and the destination workspace must exist and belong to the same
   * Host project before `relocate` is asked to move into it.
   */
  const moveToWorktree = async (sessionId, payload = {}, options = {}) => {
    const input = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const worktree = input.worktree && typeof input.worktree === 'object' && !Array.isArray(input.worktree) ? input.worktree : {};
    const name = asNonEmptyString(worktree.name);
    if (!name) throw new OpenChamberControlError('worktree.name is required', 400);
    // One relative folder name: no absolute path, traversal, or separator.
    if (name.length > 200 || name === '.' || name === '..' || /[\\/]/.test(name) || /[\x00-\x1f<>:"|?*]/.test(name)) {
      throw new OpenChamberControlError('worktree.name must be one folder name, relative to the worktree root', 400);
    }
    const existingBranch = asNonEmptyString(worktree.existingBranch);
    const branchName = asNonEmptyString(worktree.branchName);
    const startRef = asNonEmptyString(worktree.startRef);
    if (existingBranch && (branchName || startRef)) {
      throw new OpenChamberControlError('existingBranch checks out that branch as it is; do not combine it with branchName or startRef', 400);
    }
    const carryInput = input.carry ?? [];
    if (!Array.isArray(carryInput) || carryInput.some((entry) => !asNonEmptyString(entry))) {
      throw new OpenChamberControlError('carry is a list of file paths', 400);
    }

    // Authorization first: the source scope, its archive claim, and the
    // caller's relation to it. The agent tool may only move its own session.
    const source = await resolveHostRelocationScope(sessionId);
    if (!source || source.sessionId !== sessionId) throw new OpenChamberControlError('Session scope was not found', 404);
    assertWritableScope(source);
    if (agentScopeStore) await agentScopeStore.checkWorktreeScope(source.cwd);
    const caller = asNonEmptyString(options.contextSessionId);
    if (caller && caller !== source.rootSessionId) {
      throw new OpenChamberControlError('Only the session itself may move into a worktree', 403);
    }

    const carry = [...new Set(carryInput.map((entry) => entry.trim()))];
    // Carry paths name files in the session's own workspace: a relative path
    // that stays inside it, never an absolute path or a directory.
    for (const entry of carry) {
      if (path.isAbsolute(entry) || entry.startsWith('..')) {
        throw new OpenChamberControlError('carry entries are workspace-relative file paths', 400);
      }
      const resolved = path.resolve(source.cwd, entry);
      if (!resolved.startsWith(path.resolve(source.cwd) + path.sep)) {
        throw new OpenChamberControlError('carry entries stay inside the session workspace', 400);
      }
    }

    const setup = await resolveMoveSetup(source.cwd);
    // The destination workspace does not exist yet: the checkout is made first,
    // then admitted through the same Host scope owner every other route uses,
    // and only then is the session relocated. The mover keeps the ordering (and
    // the rollback) around this callback.
    const moveSession = async (_sessionId, _startDirectory, { worktreeRoot }) => {
      if (typeof dependencies.resolveWorkspaceDirectory !== 'function') throw new OpenChamberControlError('Host workspace discovery is unavailable', 503);
      const destination = await dependencies.resolveWorkspaceDirectory(worktreeRoot);
      if (!destination) throw new OpenChamberControlError('The new worktree was not admitted as a Host workspace', 503);
      if (destination.projectId !== source.projectId) throw new OpenChamberControlError('The new worktree belongs to another Host project', 403);
      const destinationScope = await (dependencies.resolveHostWorkspaceScope ?? resolveWorkspaceScope)(destination.workspaceId);
      // Discovery may answer a workspace for another directory; the scope's
      // cwd is what the relocation actually moves the session into.
      if (!destinationScope || destinationScope.projectId !== source.projectId
        || path.resolve(destinationScope.cwd) !== path.resolve(worktreeRoot)) {
        throw new OpenChamberControlError('The new worktree Host scope is unavailable', 503);
      }
      const relocated = await relocate(sessionId, { workspaceId: destination.workspaceId });
      return { workspaceId: destination.workspaceId, sessions: relocated.sessions };
    };

    const moved = await worktreeMover.move({
      sessionId,
      directory: source.cwd,
      name,
      ...(branchName ? { branchName } : {}),
      ...(startRef ? { startRef } : {}),
      ...(existingBranch ? { existingBranch } : {}),
      carry,
      startDirectory: async ({ worktreeRoot }) => {
        const start = await resolveMoveStartDirectory({ projectPath: source.cwd, worktreeRoot });
        return start;
      },
      setup,
      moveSession,
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
  // The control service's session reads resolve projectId through the same
  // lookup as create/send/fork, so an unknown project or a missing project
  // folder fails the same way everywhere.
  const resolveDirectory = async (payload) => {
    const resolved = await resolveRequestedDirectory({
      chatsScope,
      payload,
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      validateDirectoryPath,
=======
  const resolveDirectory = async (payload: SessionPayload) => {
    const resolved = await resolveRequestedDirectory({
      chatsScope,
      payload,
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      validateDirectoryPath,
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    });
    return moved;
  };

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
  const close = async () => {
    for (const [workspaceId, entry] of speculativeSessions.entries()) {
      clearTimeout(entry.timer);
      try {
        const session = await entry.promise;
        await remove(session.sessionId);
      } catch { }
    }
    speculativeSessions.clear();
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
  return {
    create,
    resolveDirectory,
    archive,
    unarchive,
    archiveStore,
    sessionArchive,
    sessionMetadataStore,
    setMetadata,
    getMetadata,
    setSessionLinks,
    send: (sessionID, payload) => runExisting('send', sessionID, payload),
    fork: (sessionID, payload) => runExisting('fork', sessionID, payload),
    moveToWorktree,
=======
  return {
    create,
    resolveDirectory,
    archive,
    unarchive,
    archiveStore,
    sessionArchive,
    sessionMetadataStore,
    setMetadata,
    getMetadata,
    setSessionLinks,
    send: (sessionID: string | undefined, payload: SessionPayload | null | undefined) => runExisting('send', sessionID, payload),
    fork: (sessionID: string | undefined, payload: SessionPayload | null | undefined) => runExisting('fork', sessionID, payload),
    moveToWorktree,
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
  };

  return { create, prepare, discardPrepared, close, send, steer, followUp, fork, selectBranch, relocate, moveToWorktree, delete: remove, open, history, list, listArchivedWorktreeSessions, control, rename, resolveDirectory: async (payload = {}) => { const scope = await resolveWorkspaceScope(payload.workspaceId); if (!scope) throw new OpenChamberControlError('Workspace was not found', 404); return scope.cwd; }, archive, unarchive, getMetadata, setMetadata, setSessionLinks, sessionMetadataStore, archiveStore, unloadWorker, captureWorktreeArchive, prepareWorktreeArchiveRemoval, finishWorktreeArchive, rollbackWorktreeArchive, discardWorktreeArchive, resolveWorktreeArchivePinnedTarget, prepareWorktreeArchiveRestore, pinWorktreeArchiveRestore, markWorktreeArchiveRestoreAttempted, finishWorktreeArchiveRestore, finalizeWorktreeArchiveRestore, releaseWorktreeArchiveRestore, cleanupWorktreeArchiveRestore, prepareWorktreeArchiveDelete, claimWorktreeArchiveDelete, deleteWorktreeArchiveSessions, finalizeWorktreeArchiveDelete, resolveAdmissionRecovery: (owner) => owner.recoveringRemoval, markWorktreeArchiveDeleteCasCompleted: (owner, revision) => agentScopeStore.markWorktreeArchiveDeleteCasCompleted(owner.key, owner.claimId, revision), markWorktreeArchiveRestoreCasStarted: (owner, revision) => agentScopeStore.markWorktreeArchiveRestoreCasStarted(owner.key, owner.claimId, revision), markWorktreeArchiveRestoreCasCompleted: (owner, revision) => agentScopeStore.markWorktreeArchiveRestoreCasCompleted(owner.key, owner.claimId, revision) };
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js


export const createOpenChamberSessionService = (dependencies) => createCanonicalSessionService(dependencies);
const sendServiceError = (res, error, fallback) => {
  const controlError = asControlError(error, fallback);
  const status = controlError.statusCode >= 400 && controlError.statusCode <= 599 ? controlError.statusCode : 500;
  const codeResult = ProblemCodeSchema.safeParse(error?.code);
  const code = codeResult.success ? codeResult.data : status === 404 ? 'SESSION_NOT_FOUND' : status === 400 ? 'INVALID_REQUEST' : status === 401 || status === 403 ? 'UNAUTHORIZED' : status === 503 ? 'SERVICE_UNAVAILABLE' : 'INTERNAL_ERROR';
  // Each caller names the operation it attempted; that sentence is the cause a
  // reader acts on, and it is the only fallback when the error carried none.
  const problem = ProblemDetailsSchema.parse({ type: `urn:ohpichamber:problem:${code}`, title: fallback, status, detail: controlError.message || fallback, code, retryable: error?.retryable ?? status >= 500 });
  return res.status(status).type('application/problem+json').json(problem);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
const sendServiceError = (res, error, fallback) => {
  const controlError = asControlError(error, fallback);
  const body = {
    error: controlError.message,
    ...(controlError.partial === true ? {
      partial: true,
      partialAction: controlError.partialAction,
      sessionId: controlError.sessionId,
      directory: controlError.directory,
    } : {}),
  };
  return res.status(controlError.statusCode).json(body);
=======
const sendServiceError = (res: Response, cause: unknown, fallback: string) => {
  const controlError = asControlError(cause, fallback);
  const body: ServiceErrorBody = {
    error: controlError.message,
  };
  if (controlError.partial === true) {
    body.partial = true;
    body.partialAction = controlError.partialAction;
    body.sessionId = controlError.sessionId;
    body.directory = controlError.directory;
  }
  return res.status(controlError.statusCode).json(body);
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
export const registerOpenChamberSessionRoutes = (app, dependencies) => {
  if (!dependencies.isRequestOriginAllowed) throw new Error('Session routes require isRequestOriginAllowed');
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
export const registerOpenChamberSessionRoutes = (app, dependencies) => {
=======
export const registerOpenChamberSessionRoutes = (app: Application, dependencies: SessionServiceDependencies & { sessionService?: ReturnType<typeof createOpenChamberSessionService> }) => {
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
  const service = dependencies.sessionService || createOpenChamberSessionService(dependencies);


  app.post('/api/openchamber/sessions', express.json({ limit: '1mb' }), async (req, res) => {
    try {
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
      return res.json(await service.create(req.body ?? {}));
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
      return res.json(await service.create(
        req.body && typeof req.body === 'object' ? req.body : {},
        { titleByUser: true },
      ));
=======
      return res.json(await service.create(
        isPayload(req.body) ? req.body : {},
        { titleByUser: true },
      ));
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    } catch (error) {
      console.error('[OpenChamberSessions] failed to create session:', error);
      return sendServiceError(res, error, 'Failed to create session');
    }
  });

  app.post('/api/openchamber/sessions/archive', express.json({ limit: '1mb' }), async (req, res) => {
    try {
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
      return res.json(await service.archive(req.body ?? {}));
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
      return res.json(await service.archive(req.body && typeof req.body === 'object' ? req.body : {}));
=======
      return res.json(await service.archive(isPayload(req.body) ? req.body : {}));
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    } catch (error) {
      console.error('[OpenChamberSessions] failed to archive sessions:', error);
      return sendServiceError(res, error, 'Failed to archive sessions');
    }
  });

  app.get('/api/openchamber/sessions/:sessionId/metadata', async (req, res) => {
    try {
      return res.json(await service.getMetadata(req.params.sessionId));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to read session metadata:', error);
      return sendServiceError(res, error, 'Failed to read session metadata');
    }
  });

  app.patch('/api/openchamber/sessions/:sessionId/metadata', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.setMetadata(
        req.params.sessionId,
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
        req.body ?? {},
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
        req.body && typeof req.body === 'object' ? req.body : {},
=======
        isPayload(req.body) ? req.body : {},
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      ));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to store session metadata:', error);
      return sendServiceError(res, error, 'Failed to store session metadata');
    }
  });

  app.patch('/api/openchamber/sessions/:sessionId/title', express.json({ limit: '64kb' }), async (req, res) => {
    try {
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
      return res.json(await service.rename(req.params.sessionId, req.body ?? {}));
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
      return res.json(await service.unarchive(req.body && typeof req.body === 'object' ? req.body : {}));
=======
      return res.json(await service.unarchive(isPayload(req.body) ? req.body : {}));
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    } catch (error) {
      return sendServiceError(res, error, 'Failed to rename session');
    }
  });
  app.post('/api/openchamber/sessions/:sessionId/links', express.json({ limit: '1mb' }), async (req, res) => {
    try {
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
      return res.json(await service.setSessionLinks(req.params.sessionId, req.body ?? {}));
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
      return res.json(await service.setSessionLinks(req.params.sessionId, req.body));
=======
      return res.json(await service.setSessionLinks(req.params.sessionId, payloadFields(req)));
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
    } catch (error) {
      console.error('[OpenChamberSessions] failed to update session links:', error);
      return sendServiceError(res, error, 'Failed to update session links');
    }
  });

  app.post('/api/openchamber/sessions/unarchive', express.json({ limit: '1mb' }), async (req, res) => {
    try {
      return res.json(await service.unarchive(req.body ?? {}));
    } catch (error) {
      console.error('[OpenChamberSessions] failed to unarchive sessions:', error);
      return sendServiceError(res, error, 'Failed to unarchive sessions');
    }
  });

  app.post(
    '/api/openchamber/sessions/:sessionId/send',
    express.json({ limit: '1mb' }),
    async (req, res) => {
      try {
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/routes.js
        return res.json(await service.send(req.params.sessionId, req.body, req.get('Idempotency-Key')));
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/routes.js
        return res.json(await service.send(req.params.sessionId, req.body));
=======
        return res.json(await service.send(req.params.sessionId, payloadFields(req)));
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/routes.ts
      } catch (error) {
        console.error('[OpenChamberSessions] failed to send session:', error);
        return sendServiceError(res, error, 'Failed to send session');
      }
    },
  );
  app.post('/api/openchamber/sessions/:sessionId/steer', express.json({ limit: '1mb' }), async (req, res) => { try { return res.json(await service.steer(req.params.sessionId, req.body || {}, req.get('Idempotency-Key'))); } catch (error) { return sendServiceError(res, error, 'Failed to steer session'); } });
  app.post('/api/openchamber/sessions/:sessionId/follow-up', express.json({ limit: '1mb' }), async (req, res) => { try { return res.json(await service.followUp(req.params.sessionId, req.body || {}, req.get('Idempotency-Key'))); } catch (error) { return sendServiceError(res, error, 'Failed to submit session follow-up'); } });
  app.post(
    '/api/openchamber/sessions/:sessionId/fork',
    express.json({ limit: '1mb' }),
    async (req, res) => {
      try {
        return res.json(await service.fork(req.params.sessionId, payloadFields(req)));
      } catch (error) {
        console.error('[OpenChamberSessions] failed to fork session:', error);
        return sendServiceError(res, error, 'Failed to fork session');
      }
    },
  );
  app.get('/api/openchamber/sessions/:sessionId', async (req, res) => {
    try { return res.json(await service.open(req.params.sessionId)); }
    catch (error) { return sendServiceError(res, error, 'Failed to open session'); }
  });
  app.get('/api/openchamber/sessions/:sessionId/history', async (req, res) => {
    try { return res.json(await service.history(req.params.sessionId, new URLSearchParams(req.query).toString())); }
    catch (error) { return sendServiceError(res, error, 'Failed to read session history'); }
  });
  app.post('/api/openchamber/sessions/:sessionId/control', express.json({ limit: '1mb' }), async (req, res) => {
    try { return res.json(await service.control(req.params.sessionId, req.body || {})); }
    catch (error) { return sendServiceError(res, error, 'Failed to control session'); }
  });
  app.get('/api/openchamber/worktrees/archives/sessions', async (req, res) => {
    try {
      const projectDirectory = req.query.projectDirectory;
      const archiveId = req.query.archiveId;
      if (typeof projectDirectory !== 'string' || typeof archiveId !== 'string') {
        return res.status(400).json({ error: 'projectDirectory and archiveId are required' });
      }
      return res.json(await service.listArchivedWorktreeSessions({ projectDirectory, archiveId }));
    } catch (error) {
      return sendServiceError(res, error, 'Failed to list archived worktree sessions');
    }
  });
};
export const registerCanonicalSessionRoutes = (router, service) => {
  const call = async (res, operation, fallback) => { try { res.json(await operation()); } catch (error) { sendServiceError(res, error, fallback); } };
  router.post('/', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.create(req.body || {}), 'Failed to create session'));
  router.post('/prepare', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.prepare(req.body || {}), 'Failed to prepare session'));
  router.delete('/prepare', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.discardPrepared(req.body || {}), 'Failed to discard prepared session'));
  router.get('/', (req, res) => call(res, () => {
    const workspace = EntityIdSchema.safeParse(req.query.workspaceId);
    return service.list(workspace.success ? workspace.data : undefined);
  }, 'Failed to list sessions'));
  router.get('/:sessionId/snapshot', (req, res) => call(res, () => service.open(req.params.sessionId), 'Failed to open session snapshot'));
  router.get('/:sessionId', (req, res) => call(res, () => service.open(req.params.sessionId), 'Failed to open session'));
  router.get('/:sessionId/history', (req, res) => call(res, () => service.history(req.params.sessionId, new URLSearchParams(req.query).toString()), 'Failed to read session history'));
  router.post('/:sessionId/runs', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.send(req.params.sessionId, req.body || {}, req.get('Idempotency-Key')), 'Failed to submit session run'));
  router.post('/:sessionId/steer', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.steer(req.params.sessionId, req.body || {}, req.get('Idempotency-Key')), 'Failed to steer session'));
  router.post('/:sessionId/follow-up', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.followUp(req.params.sessionId, req.body || {}, req.get('Idempotency-Key')), 'Failed to submit session follow-up'));
  router.post('/:sessionId/fork', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.fork(req.params.sessionId, req.body || {}), 'Failed to fork session'));
  router.post('/:sessionId/control', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.control(req.params.sessionId, req.body || {}), 'Failed to control session'));
  router.delete('/:sessionId', (req, res) => call(res, () => service.delete(req.params.sessionId), 'Failed to delete session'));
  router.get('/:sessionId/metadata', (req, res) => call(res, () => service.getMetadata(req.params.sessionId), 'Failed to read session metadata'));
  router.patch('/:sessionId/metadata', express.json({ limit: '1mb' }), (req, res) => call(res, () => service.setMetadata(req.params.sessionId, req.body || {}), 'Failed to write session metadata'));
  router.patch('/:sessionId/title', express.json({ limit: '64kb' }), (req, res) => call(res, () => service.rename(req.params.sessionId, req.body || {}), 'Failed to rename session'));
  router.post('/:sessionId/branch', express.json({ limit: '256kb' }), (req, res) => call(res, () => service.selectBranch(req.params.sessionId, req.body || {}), 'Failed to select session branch'));
  router.post('/:sessionId/relocate', express.json({ limit: '256kb' }), (req, res) => call(res, () => service.relocate(req.params.sessionId, req.body || {}), 'Failed to relocate session'));
  // A session's own move into a new worktree: create the checkout, carry the
  // named files, then relocate. The session id names the source scope, so no
  // client-supplied directory is trusted.
  router.post('/:sessionId/move-to-worktree', express.json({ limit: '256kb' }), (req, res) => call(res, () => service.moveToWorktree(req.params.sessionId, req.body || {}), 'Failed to move session into a worktree'));
};
