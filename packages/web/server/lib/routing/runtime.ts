import { z } from 'zod';
import {
  ApprovalRequestSchema,
  EntityIdSchema,
  HistoryPageSchema,
  ModelCatalogSchema,
  ProviderCatalogSchema,
  modelRefKey,
} from '@openchamber/agent-contract';
import type { ApprovalRequest, Model } from '@openchamber/agent-contract';
import { BUILTIN_CATEGORIES } from './defaults.js';
import { createRoutingStore, parseEffectiveConfig } from './store.js';
import type { CustomEndpoint, RoutingCategory, RoutingConfig, RoutingModel } from './store.js';
import {
  buildPermissionRequest,
  buildProbeRequest,
  buildRoutingRequest,
  createJevClient,
  decidePermission,
  decideRouting,
  isProbeAnswer,
} from './jev.js';
import type { AssistSourceMessage, AssistSourcePart } from '../session-assist/context.js';
import type { RoutingPermission } from './jev.js';
import {
  CLASSIFIER_SOURCES,
  classifierEndpoint,
  legacyClassifier,
  parseCustomEndpointUrl,
  readPinnedCustomEndpoint,
  resolveClassifier,
} from './classifier.js';
import type { Classifier, ClassifierEndpoint, ClassifierKeys, ClassifierSource } from './classifier.js';
import { turnsToHistory } from './history.js';
import type { HistoryEntry, RoutingHistory } from './history.js';
import { loadSettledTurns } from '../session-assist/context.js';
import { PROMPT_CACHE_TTL_MS, cacheHoldCategory } from './cache.js';
import { ENTERPRISE_MODE_ERROR, isEnterpriseMode } from '../enterprise-mode.js';
import type { JsonValue } from '../shared/json-values.js';
import type { QueryValue } from '../shared/http-contracts.js';

const HISTORY_TIMEOUT_MS = 2500;
const PERMISSION_DECISION_TTL_MS = 15 * 60 * 1000;

const errorMessage = (cause: unknown): string => (cause instanceof Error ? cause.message : String(cause));

const IMAGE_EXTENSIONS = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'ico', 'jpeg', 'jpg', 'png', 'svg', 'webp']);

export interface RoutingAttachmentLike {
  mediaType?: string | null | undefined;
  name?: string | null | undefined;
}

export interface RoutingTextInput {
  text?: string | null | undefined;
  attachments?: readonly RoutingAttachmentLike[] | JsonValue | undefined;
}

const attachmentInputSchema = z.object({
  mediaType: z.string().nullable().optional(),
  name: z.string().nullable().optional(),
});

const isImageAttachment = (attachment: z.infer<typeof attachmentInputSchema>): boolean => {
  const mediaType = attachment.mediaType ? attachment.mediaType.trim().toLowerCase() : '';
  if (mediaType.startsWith('image/')) return true;
  const name = attachment.name ? attachment.name.toLowerCase() : '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && IMAGE_EXTENSIONS.has(name.slice(dot + 1));
};

export const attachmentHint = (input: RoutingTextInput | null | undefined): string => {
  const parsed = z.array(attachmentInputSchema).safeParse(input?.attachments);
  if (!parsed.success) return '';
  const images = parsed.data.filter(isImageAttachment);
  if (images.length === 0) return '';
  const names = images.map((attachment) => (attachment.name ? attachment.name.trim() : '')).filter(Boolean).slice(0, 3);
  const count = images.length === 1 ? 'an image' : `${images.length} images`;
  return `\n\n[The user attached ${count}${names.length > 0 ? `: ${names.join(', ')}` : ''}]`;
};

export const routingRequestTextOf = (input: RoutingTextInput | null | undefined): string =>
  `${(input?.text ?? '').trim()}${attachmentHint(input)}`.trim();

const customEndpointInputSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  model: z.string().trim().min(1).max(200),
  key: z.string().trim().max(4000).nullable().optional(),
});

const agentErrorBodySchema = z.object({
  detail: z.string().optional(),
  code: z.string().optional(),
});

const resolvedCredentialSchema = z.object({
  type: z.literal('api_key'),
  key: z.string().min(1),
});

const routingAskErrorSchema = z.object({
  code: z.string().optional(),
  status: z.number().optional(),
});

export interface RoutingResolvedModel {
  providerId: string;
  modelId: string;
  reasoningEffort?: string | null;
  variant?: string | null;
}

export interface RoutingSelectionDecision {
  providerID: string;
  modelID: string;
  variant: string | null;
  reasoningEffort: string | null;
  agent: string | null;
}

export interface RoutingAttemptRecord {
  sessionId: string;
  at: number;
  category: string | null;
  confidence: number;
  reason: string;
  ms: number;
  cacheHold?: { requested: string };
  error?: string;
}

export type RoutingDecision = RoutingAttemptRecord & RoutingSelectionDecision;

export interface RoutingStateProperties {
  available: boolean;
  autoReady: boolean;
  jevAvailable: boolean;
  tokenPresent: boolean;
  jevSource: 'typesafe' | 'zen-free';
}

export type RoutingPermissionSkippedEvent = {
  permissionId: RoutingPermission['id'];
  sessionId: RoutingPermission['sessionID'];
  directory: JsonValue;
  error: string;
};

export type RoutingPermissionHeldEvent = {
  permissionId: RoutingPermission['id'];
  sessionId: RoutingPermission['sessionID'];
  directory: JsonValue;
  score: number;
  kind: string | null;
};

export type RoutingUiEvent =
  | { type: 'openchamber:routing.updated'; properties: RoutingStateProperties }
  | { type: 'openchamber:routing.decision'; properties: RoutingDecision }
  | { type: 'openchamber:routing.safety-skipped'; properties: RoutingPermissionSkippedEvent }
  | { type: 'openchamber:routing.permission-held'; properties: RoutingPermissionHeldEvent };

export interface RoutingAgentService {
  request: (path: string, init?: RequestInit) => Promise<Response>;
}

export interface RoutingWorkspaceScope {
  workspaceId: string;
  agentDirectoryId: string;
  projectId?: string;
  cwd?: string;
}

export interface RoutingSessionScope {
  sessionId?: string;
  workspaceId: string;
  projectId?: string;
  cwd?: string;
}

export interface RoutingCredentialSelection {
  workspaceId: string;
  agentDirectoryId: string;
  providerId: string;
  credentialRef: string;
  purpose: 'routing';
}

export interface RoutingCredential {
  type: string;
  key?: string | null;
}

export interface RoutingRuntimeOptions {
  dataDir: string;
  service: RoutingAgentService;
  resolveWorkspaceScope: (workspaceId: string) => Promise<RoutingWorkspaceScope | null | undefined>;
  resolveSessionScope: (sessionId: string) => Promise<RoutingSessionScope | null | undefined>;
  broadcastGlobalUiEvent?: ((event: RoutingUiEvent) => void) | undefined;
  fetchImpl?: typeof fetch;
  store?: ReturnType<typeof createRoutingStore>;
  jev?: Pick<ReturnType<typeof createJevClient>, 'ask'>;
  resolveCredential: (selection: RoutingCredentialSelection) => Promise<RoutingCredential | null | undefined>;
  enterpriseMode?: () => boolean;
  readPinnedEndpoint?: typeof readPinnedCustomEndpoint;
  listCatalogModels?: ((workspaceId: string) => Promise<Model[]>) | null;
  readSessionHistory?: ((scope: { sessionId: string; directory?: string | null | undefined }) => Promise<RoutingHistory>) | null;
  now?: () => number;
}

export interface RoutingDescribeResult {
  available: boolean;
  autoReady: boolean;
  jevAvailable: boolean;
  tokenPresent: boolean;
  geminiKeyPresent: boolean;
  customEndpoint: { url: string; model: string; keyPresent: boolean; pinned: boolean } | null;
  enterpriseMode: boolean;
  jevSource: 'typesafe' | 'zen-free';
  classifier: ReturnType<typeof legacyClassifier>;
  classification: Classifier;
  config: RoutingConfig;
  builtins: typeof BUILTIN_CATEGORIES;
}

export interface AutoSelectionRequest {
  sessionId: string;
  directory?: string | null | undefined;
  workspaceId?: string | undefined;
  model: { providerId: string; modelId: string } | null | undefined;
  agent?: string | null | undefined;
  requestText?: string | undefined;
}

export interface AutoSelectionResult {
  model: RoutingResolvedModel;
  agent: null;
  decision: RoutingDecision;
}

export type PermissionEvaluationResult =
  | { action: 'hold'; unavailable?: true; skipped?: string; score?: number; kind?: string | null }
  | { action: 'accept'; score: number; kind: string | null };

export interface HeldPermissionSummary {
  permissionId: string;
  score: number;
  kind: string | null;
}

export type ClassifierProbeResult =
  | { ok: true; source: Exclude<ClassifierSource, 'off'>; model: string; ms: number }
  | { ok: false; reason: 'unavailable' }
  | { ok: false; reason: 'unparsable' | 'timeout'; source: Exclude<ClassifierSource, 'off'>; model: string }
  | { ok: false; reason: 'http'; status: number; source: Exclude<ClassifierSource, 'off'>; model: string }
  | { ok: false; reason: 'network'; message: string; source: Exclude<ClassifierSource, 'off'>; model: string };

const toModelRef = (model: RoutingModel, variant: string | null): RoutingResolvedModel => {
  const ref: RoutingResolvedModel = { providerId: model.providerID, modelId: model.modelID };
  if (variant) {
    ref.reasoningEffort = variant;
    ref.variant = variant;
  }
  return ref;
};

const createProblem = (message: string, status: number, code?: string) => {
  const error = new Error(message);
  return code ? Object.assign(error, { status, code }) : Object.assign(error, { status });
};

type NativeSourceKey = 'openrouter' | 'vercel';

export interface RoutingRuntime {
  describe: (workspaceId?: QueryValue) => Promise<RoutingDescribeResult>;
  classifierEndpoint: (workspaceId: string) => Promise<ClassifierEndpoint | null>;
  resolveAutoSelection: (input: AutoSelectionRequest) => Promise<AutoSelectionResult | null>;
  evaluatePermission: (permission: RoutingPermission | ApprovalRequest | JsonValue, directory?: JsonValue) => Promise<PermissionEvaluationResult>;
  forgetPermission: (permissionId: string) => void;
  heldPermissions: () => HeldPermissionSummary[];
  legacySafetyNetEnabled: () => Promise<boolean>;
  updateConfig: (input: JsonValue | undefined) => Promise<RoutingDescribeResult>;
  setToken: (token: JsonValue | undefined) => Promise<RoutingDescribeResult>;
  clearToken: () => Promise<RoutingDescribeResult>;
  setGeminiKey: (key: JsonValue | undefined) => Promise<RoutingDescribeResult>;
  clearGeminiKey: () => Promise<RoutingDescribeResult>;
  setClassifierSource: (source: JsonValue | undefined) => Promise<RoutingDescribeResult>;
  setCustomEndpoint: (input: JsonValue | undefined) => Promise<RoutingDescribeResult>;
  clearCustomEndpoint: () => Promise<RoutingDescribeResult>;
  testClassifier: (draft?: JsonValue, workspaceId?: QueryValue) => Promise<ClassifierProbeResult>;
}

export function createRoutingRuntime({
  dataDir,
  service,
  resolveWorkspaceScope,
  resolveSessionScope,
  broadcastGlobalUiEvent,
  fetchImpl = fetch,
  store = createRoutingStore({ dataDir }),
  jev = createJevClient({ fetchImpl }),
  resolveCredential,
  enterpriseMode = isEnterpriseMode,
  readPinnedEndpoint = readPinnedCustomEndpoint,
  listCatalogModels = null,
  readSessionHistory = null,
  now = Date.now,
}: RoutingRuntimeOptions): RoutingRuntime {
  if (!service?.request) throw new Error('routing requires the Agent service');
  if (!resolveWorkspaceScope || !resolveSessionScope) throw new Error('routing requires Host scope resolvers');
  if (!resolveCredential) throw new Error('routing requires the selected credential resolver');

  const permissionDecisions = new Map<string, { at: number; identity: string; result: PermissionEvaluationResult }>();

  const broadcast = (event: RoutingUiEvent) => {
    try {
      broadcastGlobalUiEvent?.(event);
    } catch (error) {
      console.warn(`[routing] failed to broadcast ${event.type}:`, errorMessage(error));
    }
  };

  const enabledCategories = (config: RoutingConfig) => config.categories.filter((category) => category.enabled);

  const requestAgent = async (resourcePath: string, init: RequestInit = {}): Promise<JsonValue> => {
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    const response = await service.request(resourcePath, { ...init, headers });
    const rawBody = await response.json().catch(() => null);
    if (!response.ok) {
      const parsedError = agentErrorBodySchema.safeParse(rawBody);
      const detail = parsedError.success && parsedError.data.detail ? parsedError.data.detail : 'Agent service request failed';
      const code = parsedError.success ? parsedError.data.code : undefined;
      throw createProblem(detail, response.status, code);
    }
    return z.json().parse(rawBody);
  };

  const scopeForWorkspace = async (workspaceId: QueryValue | undefined): Promise<RoutingWorkspaceScope> => {
    const parsedId = EntityIdSchema.safeParse(workspaceId);
    if (!parsedId.success) throw createProblem('A workspace identity is required', 400, 'INVALID_REQUEST');
    const scope = await resolveWorkspaceScope(parsedId.data);
    if (!scope || scope.workspaceId !== parsedId.data || !EntityIdSchema.safeParse(scope.agentDirectoryId).success) {
      throw createProblem('Workspace scope was not found', 403, 'UNAUTHORIZED');
    }
    return scope;
  };

  const scopeForSession = async (sessionId: string): Promise<RoutingSessionScope> => {
    const scope = await resolveSessionScope(sessionId);
    if (!scope) throw createProblem('Session scope was not found', 404, 'SESSION_NOT_FOUND');
    return scope;
  };

  const nativeSources = {
    openrouter: { providerId: 'openrouter', keyField: 'openrouterKey' },
    vercel: { providerId: 'vercel-ai-gateway', keyField: 'vercelKey' },
  } as const;

  const isNativeSource = (source: ClassifierSource): source is NativeSourceKey =>
    source === 'openrouter' || source === 'vercel';

  const resolveAccess = async (scope: RoutingWorkspaceScope | null = null, useCredential = false) => {
    const [typesafeKey, stored, savedEndpoint, geminiKey] = await Promise.all([
      store.readToken(), store.readClassifierSource(), store.readCustomEndpoint(), store.readGeminiKey(),
    ]);
    const pinned = readPinnedEndpoint();
    const customEndpoint = pinned ?? savedEndpoint;
    const enterprise = enterpriseMode();
    const selected: ClassifierSource | 'zen-promo' | 'zen-key' | null = !enterprise
      ? stored
      : pinned && stored !== 'off' ? 'custom' : 'off';
    const keys: ClassifierKeys = { typesafeKey, customEndpoint, geminiKey };
    const selections: Partial<Record<NativeSourceKey, RoutingCredentialSelection>> = {};
    if (scope && !enterprise) {
      const catalog = ProviderCatalogSchema.parse(
        await requestAgent(`/api/agent/v1/workspaces/${encodeURIComponent(scope.workspaceId)}/providers`),
      );
      if (catalog.workspaceId !== scope.workspaceId) {
        throw createProblem('Provider catalog belongs to another workspace', 403, 'UNAUTHORIZED');
      }
      for (const source of ['openrouter', 'vercel'] as const) {
        const { providerId, keyField } = nativeSources[source];
        const provider = catalog.providers.find((entry) => entry.providerId === providerId);
        if (provider?.auth.status !== 'configured' || provider.auth.method !== 'api-key') continue;
        selections[source] = {
          workspaceId: scope.workspaceId,
          agentDirectoryId: scope.agentDirectoryId,
          providerId,
          credentialRef: provider.auth.credentialRef,
          purpose: 'routing',
        };
        keys[keyField] = 'present';
      }
    }
    const classifier = resolveClassifier({ selected, ...keys });
    let endpoint: ClassifierEndpoint | null = null;
    if (useCredential && classifier.effective) {
      const effective = classifier.effective;
      if (isNativeSource(effective)) {
        const selection = selections[effective];
        if (!selection) {
          throw createProblem('Selected routing credential is unavailable', 422, 'CREDENTIAL_UNAVAILABLE');
        }
        const credential = await resolveCredential(selection);
        const parsedCredential = resolvedCredentialSchema.safeParse(credential);
        if (!parsedCredential.success) {
          throw createProblem('Selected routing credential is unavailable', 422, 'CREDENTIAL_UNAVAILABLE');
        }
        keys[nativeSources[effective].keyField] = parsedCredential.data.key;
      }
      if (effective === 'custom') {
        if (!customEndpoint) {
          throw createProblem('Selected routing credential is unavailable', 422, 'CREDENTIAL_UNAVAILABLE');
        }
        endpoint = classifierEndpoint('custom', { ...keys, customEndpoint });
      } else if (effective === 'gemini') {
        if (!geminiKey) {
          throw createProblem('Selected routing credential is unavailable', 422, 'CREDENTIAL_UNAVAILABLE');
        }
        endpoint = classifierEndpoint('gemini', { ...keys, geminiKey });
      } else {
        endpoint = classifierEndpoint(effective, keys);
      }
    }
    return {
      classifier,
      endpoint,
      tokenPresent: Boolean(typesafeKey),
      geminiKeyPresent: Boolean(geminiKey),
      customEndpoint,
      pinned: pinned !== null,
    };
  };

  const describeCustomEndpoint = (endpoint: CustomEndpoint | null, pinned: boolean) => (endpoint
    ? { url: endpoint.url, model: endpoint.model, keyPresent: Boolean(endpoint.key), pinned }
    : null);

  const pinnedEndpointError = () => createProblem(
    'The custom endpoint is set by your administrator and cannot be changed here',
    409,
  );

  const describe = async (workspaceId?: QueryValue): Promise<RoutingDescribeResult> => {
    const scope = workspaceId === undefined ? null : await scopeForWorkspace(workspaceId);
    const [config, access] = await Promise.all([store.readConfig(), resolveAccess(scope)]);
    const jevAvailable = access.classifier.effective !== null;
    const autoReady = jevAvailable && config.enabled && Boolean(config.fallback) && enabledCategories(config).length >= 2;
    return {
      available: true,
      autoReady,
      jevAvailable,
      tokenPresent: access.tokenPresent,
      geminiKeyPresent: access.geminiKeyPresent,
      customEndpoint: describeCustomEndpoint(access.customEndpoint, access.pinned),
      enterpriseMode: enterpriseMode(),
      jevSource: access.classifier.effective === 'typesafe' ? 'typesafe' : 'zen-free',
      classifier: legacyClassifier(access.classifier),
      classification: access.classifier,
      config,
      builtins: BUILTIN_CATEGORIES,
    };
  };

  const publishUpdated = async (): Promise<RoutingDescribeResult> => {
    const state = await describe();
    broadcast({
      type: 'openchamber:routing.updated',
      properties: {
        available: state.available,
        autoReady: state.autoReady,
        jevAvailable: state.jevAvailable,
        tokenPresent: state.tokenPresent,
        jevSource: state.jevSource,
      },
    });
    return state;
  };

  const readHistory = readSessionHistory ?? (async ({ sessionId }): Promise<RoutingHistory> => {
    await scopeForSession(sessionId);
    const completedAtByMessage = new Map<string, number>();
    const turns = await loadSettledTurns({
      signal: AbortSignal.timeout(HISTORY_TIMEOUT_MS),
      readPage: async ({ limit, cursor }: { limit: number; cursor?: string }) => {
        const params = new URLSearchParams({ limit: String(limit) });
        if (cursor) params.set('cursor', cursor);
        const page = HistoryPageSchema.parse(
          await requestAgent(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/history?${params.toString()}`),
        );
        for (const turn of page.turns) {
          if (turn.status !== 'completed' || turn.finishedAt === undefined || !Number.isFinite(turn.finishedAt)) continue;
          for (const messageId of turn.assistantMessageIds) completedAtByMessage.set(messageId, turn.finishedAt);
        }
        return {
          turns: page.turns,
          nextCursor: page.nextCursor,
          messages: page.messages.map((message) => {
            const mappedMessage: AssistSourceMessage = {
              messageId: message.messageId,
              turnId: message.turnId,
              role: message.role,
              createdAt: message.createdAt,
              parts: message.parts.map((part) => {
                const mappedPart: AssistSourcePart = { type: part.type };
                if ('content' in part && part.content !== undefined) mappedPart.content = part.content;
                return mappedPart;
              }),
            };
            if (message.providerId !== undefined) mappedMessage.providerId = message.providerId;
            if (message.modelId !== undefined) mappedMessage.modelId = message.modelId;
            return mappedMessage;
          }),
        };
      },
    });
    const last = turns.at(-1)?.assistant;
    const completedAt = last ? completedAtByMessage.get(last.id) : undefined;
    return {
      history: turnsToHistory(turns),
      lastAnswer: last?.providerId && last.modelId && completedAt !== undefined && Number.isFinite(completedAt)
        ? { providerID: last.providerId, modelID: last.modelId, finishedAt: completedAt }
        : null,
    };
  });

  const cacheHold = async ({
    config,
    chosen,
    composerAgent,
    lastAnswer,
  }: {
    config: RoutingConfig;
    chosen: RoutingCategory | null;
    composerAgent: string | null;
    lastAnswer: RoutingHistory['lastAnswer'];
  }): Promise<RoutingCategory | null> => {
    if (!config.preserveCache || !lastAnswer || !config.fallback) return null;
    const held = cacheHoldCategory({
      categories: enabledCategories(config),
      fallback: config.fallback,
      composerAgent,
      chosen,
      current: lastAnswer,
    });
    if (!held) return null;
    const idle = now() - lastAnswer.finishedAt;
    if (idle < PROMPT_CACHE_TTL_MS) return held;
    return null;
  };

  const chooseSelection = (config: RoutingConfig, choice: RoutingCategory | null) => {
    const fallback = config.fallback;
    if (!fallback) throw createProblem('Auto routing is selected but no fallback model is configured', 400);
    const model = choice?.model ?? fallback.model;
    const variant = choice?.model ? choice.variant : fallback.variant;
    return {
      model: toModelRef(model, variant),
      agent: null,
      decision: {
        providerID: model.providerID,
        modelID: model.modelID,
        variant: variant ?? null,
        reasoningEffort: variant ?? null,
        agent: null,
      },
    };
  };

  const readCatalog = listCatalogModels ?? (async (workspaceId: string): Promise<Model[]> => {
    await scopeForWorkspace(workspaceId);
    const catalog = ModelCatalogSchema.parse(
      await requestAgent(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/models`),
    );
    if (catalog.workspaceId !== workspaceId) {
      throw createProblem('Model catalog belongs to another workspace', 403, 'UNAUTHORIZED');
    }
    return catalog.models;
  });

  const withKnownVariant = async (
    selection: { model: RoutingResolvedModel; agent: null; decision: RoutingSelectionDecision },
    workspaceId: string,
  ) => {
    const effort = selection.model.reasoningEffort ?? selection.model.variant;
    if (!effort) return selection;
    let models: Model[];
    try {
      models = await readCatalog(workspaceId);
    } catch (error) {
      console.warn('[routing] model catalog unavailable, keeping the saved thinking effort:', errorMessage(error));
      return selection;
    }
    const { providerId, modelId } = selection.model;
    const entry = models.find((model) => model.provider === providerId && model.modelId === modelId);
    if (!entry) return selection;
    const knownEfforts = Array.isArray(entry.reasoningOptions)
      ? entry.reasoningOptions.map((option) => option.reasoningEffort)
      : [];
    const knownVariants = Array.isArray(entry.variants)
      ? entry.variants.map((variant) => variant.variant)
      : [];
    if (effort === 'off' || knownEfforts.includes(effort) || knownVariants.includes(effort)) {
      return {
        ...selection,
        model: { ...selection.model, reasoningEffort: effort },
        decision: { ...selection.decision, reasoningEffort: effort },
      };
    }
    console.warn(`[routing] ${modelRefKey(providerId, modelId)} has no "${effort}" thinking level; using its default`);
    return {
      ...selection,
      model: { providerId, modelId, reasoningEffort: null, variant: null },
      decision: { ...selection.decision, variant: null, reasoningEffort: null },
    };
  };

  const resolveAutoSelection = async ({
    sessionId,
    directory,
    workspaceId: requestedWorkspaceId,
    model,
    agent: _agent,
    requestText,
  }: AutoSelectionRequest): Promise<AutoSelectionResult | null> => {
    if (model?.providerId !== 'openchamber' || model?.modelId !== 'auto') return null;
    const sessionScope = await scopeForSession(sessionId);
    const workspaceId = requestedWorkspaceId ?? sessionScope.workspaceId;
    if (sessionScope.workspaceId !== workspaceId) {
      throw createProblem('Session workspace does not match routing workspace', 403, 'UNAUTHORIZED');
    }
    const state = await describe(workspaceId);
    const config = state.config;
    if (!config?.fallback) {
      throw createProblem('Auto routing is selected but no fallback model is configured', 400);
    }
    const attempt: RoutingAttemptRecord = { sessionId, at: now(), category: null, confidence: 0, reason: 'not-ready', ms: 0 };
    let selection: { model: RoutingResolvedModel; agent: null; decision: RoutingSelectionDecision };
    if (state.autoReady) {
      let history: HistoryEntry[] = [];
      let lastAnswer: RoutingHistory['lastAnswer'] = null;
      try {
        ({ history, lastAnswer } = await readHistory({ sessionId, directory }));
      } catch (error) {
        console.warn('[routing] history unavailable, routing on the request alone:', errorMessage(error));
      }
      const { endpoint } = await resolveAccess(await scopeForWorkspace(workspaceId), true);
      try {
        if (!endpoint) throw new Error('No classification provider is available');
        const request = (requestText ?? '').trim();
        const { answers, ms } = await jev.ask(buildRoutingRequest({ categories: enabledCategories(config), history, request }), endpoint);
        const result = decideRouting(answers.category, { categories: enabledCategories(config), minConfidence: config.minConfidence });
        attempt.category = result.category?.id ?? null;
        attempt.confidence = result.confidence;
        attempt.reason = result.reason;
        attempt.ms = ms;
        const held = await cacheHold({ config, chosen: result.category, composerAgent: null, lastAnswer });
        if (held && result.category) {
          attempt.category = held.id;
          attempt.cacheHold = { requested: result.category.id };
        }
        selection = chooseSelection(config, held ?? result.category);
      } catch (error) {
        attempt.reason = 'error';
        attempt.error = errorMessage(error);
        selection = chooseSelection(config, null);
      }
    } else {
      selection = chooseSelection(config, null);
    }
    selection = await withKnownVariant(selection, workspaceId);
    const decision: RoutingDecision = { ...attempt, ...selection.decision };
    broadcast({ type: 'openchamber:routing.decision', properties: decision });
    return { model: selection.model, agent: null, decision };
  };

  const evaluatePermission = async (
    permission: RoutingPermission | ApprovalRequest | JsonValue,
    directory?: JsonValue,
  ): Promise<PermissionEvaluationResult> => {
    const parsed = ApprovalRequestSchema.safeParse(permission);
    if (!parsed.success || parsed.data.status !== 'pending') return { action: 'hold' };
    const approval = parsed.data;
    const scope = await scopeForSession(approval.sessionId);
    const workspaceScope = await scopeForWorkspace(scope.workspaceId);
    const [config, presence] = await Promise.all([store.readConfig(), resolveAccess(workspaceScope)]);
    if (!presence.classifier.effective) return { action: 'hold', unavailable: true };
    const identity = JSON.stringify([
      approval.sessionId,
      approval.epoch,
      approval.workerGeneration,
      approval.version,
      presence.classifier.effective,
      config.safetyNet.threshold,
    ]);
    const cached = permissionDecisions.get(approval.approvalId);
    if (cached?.identity === identity && now() - cached.at < PERMISSION_DECISION_TTL_MS) return cached.result;
    const access = await resolveAccess(workspaceScope, true);
    if (!access.endpoint) return { action: 'hold', unavailable: true };
    let result: PermissionEvaluationResult;
    try {
      const { answers } = await jev.ask(buildPermissionRequest(approval), access.endpoint);
      const verdict = decidePermission(answers, { threshold: config.safetyNet.threshold });
      result = verdict.hold
        ? { action: 'hold', score: verdict.score, kind: verdict.kind }
        : { action: 'accept', score: verdict.score, kind: verdict.kind };
    } catch (error) {
      const skipped = errorMessage(error);
      broadcast({
        type: 'openchamber:routing.safety-skipped',
        properties: {
          permissionId: approval.approvalId,
          sessionId: approval.sessionId,
          directory: directory ?? null,
          error: skipped,
        },
      });
      return { action: 'hold', skipped };
    }
    if (result.action === 'hold') {
      broadcast({
        type: 'openchamber:routing.permission-held',
        properties: {
          permissionId: approval.approvalId,
          sessionId: approval.sessionId,
          directory: directory ?? null,
          score: result.score ?? 0,
          kind: result.kind ?? null,
        },
      });
    }
    permissionDecisions.set(approval.approvalId, { at: now(), identity, result });
    return result;
  };

  const legacySafetyNetEnabled = async (): Promise<boolean> => {
    try {
      return (await store.readConfig()).safetyNet.enabled === true;
    } catch {
      return false;
    }
  };

  const forgetPermission = (permissionId: string): void => {
    permissionDecisions.delete(permissionId);
  };

  const updateConfig = async (input: JsonValue | undefined): Promise<RoutingDescribeResult> => {
    const config = parseEffectiveConfig(input);
    await store.writeConfig(config);
    return publishUpdated();
  };

  const setToken = async (token: JsonValue | undefined): Promise<RoutingDescribeResult> => {
    const parsed = z.string().trim().min(1).max(4000).safeParse(token);
    if (!parsed.success) throw createProblem('A Jev API key is required', 400);
    if (enterpriseMode()) throw createProblem(ENTERPRISE_MODE_ERROR, 403);
    await store.writeToken(parsed.data);
    await store.writeClassifierSource('typesafe');
    return publishUpdated();
  };

  const clearToken = async (): Promise<RoutingDescribeResult> => {
    await store.clearToken();
    return publishUpdated();
  };

  const setGeminiKey = async (key: JsonValue | undefined): Promise<RoutingDescribeResult> => {
    if (enterpriseMode()) throw createProblem(ENTERPRISE_MODE_ERROR, 403);
    const parsed = z.string().trim().min(1).max(4000).safeParse(key);
    if (!parsed.success) throw createProblem('A Gemini API key is required', 400);
    await store.writeGeminiKey(parsed.data);
    await store.writeClassifierSource('gemini');
    return publishUpdated();
  };

  const clearGeminiKey = async (): Promise<RoutingDescribeResult> => {
    await store.clearGeminiKey();
    return publishUpdated();
  };

  const setClassifierSource = async (source: JsonValue | undefined): Promise<RoutingDescribeResult> => {
    const parsed = z.enum(CLASSIFIER_SOURCES).safeParse(source);
    if (!parsed.success) throw createProblem(`Unknown classification provider: ${String(source)}`, 400);
    const allowedInEnterprise = parsed.data === 'off' || (parsed.data === 'custom' && readPinnedEndpoint() !== null);
    if (enterpriseMode() && !allowedInEnterprise) throw createProblem(ENTERPRISE_MODE_ERROR, 403);
    await store.writeClassifierSource(parsed.data);
    return publishUpdated();
  };

  const setCustomEndpoint = async (input: JsonValue | undefined): Promise<RoutingDescribeResult> => {
    if (readPinnedEndpoint()) throw pinnedEndpointError();
    if (enterpriseMode()) throw createProblem(ENTERPRISE_MODE_ERROR, 403);
    const parsed = customEndpointInputSchema.safeParse(input);
    if (!parsed.success) throw createProblem('A URL and a model are required', 400);
    const { model, key } = parsed.data;
    const url = parseCustomEndpointUrl(parsed.data.url);
    const keepKey = key === undefined || key === '';
    const savedKey = keepKey ? (await store.readCustomEndpoint())?.key : key;
    const endpoint: CustomEndpoint = { url, model };
    if (savedKey) endpoint.key = savedKey;
    await store.writeCustomEndpoint(endpoint);
    if (key !== null) await store.writeClassifierSource('custom');
    return publishUpdated();
  };

  const clearCustomEndpoint = async (): Promise<RoutingDescribeResult> => {
    if (readPinnedEndpoint()) throw pinnedEndpointError();
    await store.clearCustomEndpoint();
    return publishUpdated();
  };

  const testClassifier = async (draft?: JsonValue, workspaceId?: QueryValue): Promise<ClassifierProbeResult> => {
    const scope = workspaceId === undefined ? null : await scopeForWorkspace(workspaceId);
    let source: Exclude<ClassifierSource, 'off'> | null;
    let endpoint: ClassifierEndpoint | null;
    if (draft !== undefined) {
      if (readPinnedEndpoint()) throw pinnedEndpointError();
      if (enterpriseMode()) throw createProblem(ENTERPRISE_MODE_ERROR, 403);
      const parsed = customEndpointInputSchema.safeParse(draft);
      if (!parsed.success) throw createProblem('A URL and a model are required', 400);
      const key = parsed.data.key || (await store.readCustomEndpoint())?.key;
      source = 'custom';
      const draftEndpoint: CustomEndpoint = {
        url: parseCustomEndpointUrl(parsed.data.url),
        model: parsed.data.model,
      };
      if (key) draftEndpoint.key = key;
      endpoint = classifierEndpoint('custom', { customEndpoint: draftEndpoint });
    } else {
      const access = await resolveAccess(scope, true);
      source = access.classifier.effective;
      endpoint = access.endpoint;
    }
    if (!source || !endpoint) return { ok: false, reason: 'unavailable' };
    try {
      const { answers, ms } = await jev.ask(buildProbeRequest(), endpoint);
      if (!isProbeAnswer(answers.probe)) return { ok: false, reason: 'unparsable', source, model: endpoint.model };
      return { ok: true, source, model: endpoint.model, ms };
    } catch (error) {
      const parsedError = routingAskErrorSchema.safeParse(error);
      if (parsedError.success && parsedError.data.code === 'timeout') {
        return { ok: false, reason: 'timeout', source, model: endpoint.model };
      }
      if (parsedError.success && parsedError.data.status !== undefined) {
        return { ok: false, reason: 'http', status: parsedError.data.status, source, model: endpoint.model };
      }
      if (error instanceof SyntaxError || /no answers/.test(errorMessage(error))) {
        return { ok: false, reason: 'unparsable', source, model: endpoint.model };
      }
      return { ok: false, reason: 'network', message: errorMessage(error), source, model: endpoint.model };
    }
  };

  const currentClassifierEndpoint = async (workspaceId: string): Promise<ClassifierEndpoint | null> => {
    const scope = await scopeForWorkspace(workspaceId);
    return (await resolveAccess(scope, true)).endpoint;
  };

  const heldPermissions = (): HeldPermissionSummary[] => {
    const held: HeldPermissionSummary[] = [];
    for (const [permissionId, entry] of permissionDecisions) {
      if (entry.result.action === 'hold') {
        held.push({ permissionId, score: entry.result.score ?? 0, kind: entry.result.kind ?? null });
      }
    }
    return held;
  };

  return {
    describe,
    classifierEndpoint: currentClassifierEndpoint,
    resolveAutoSelection,
    evaluatePermission,
    forgetPermission,
    heldPermissions,
    legacySafetyNetEnabled,
    updateConfig,
    setToken,
    clearToken,
    setGeminiKey,
    clearGeminiKey,
    setClassifierSource,
    setCustomEndpoint,
    clearCustomEndpoint,
    testClassifier,
  };
}
