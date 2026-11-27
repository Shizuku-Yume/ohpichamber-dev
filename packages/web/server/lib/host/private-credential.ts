import { z } from 'zod';
import {
  PrivateCredentialResolveRequestSchema, PrivateCredentialResolveResultSchema,
  PrivateCredentialHandoffRequestSchema, PrivateCredentialHandoffResultSchema,
  SelectedCredentialHandoffRequestSchema, SelectedCredentialHandoffResultSchema,
  type PrivateCredentialResolveRequest,
  type PrivateCredentialResolveResult,
  type SelectedCredentialHandoffOutcome,
} from '@openchamber/agent-service/private-protocol';
import { ProviderCatalogSchema, EntityIdSchema } from '@openchamber/agent-contract';
import type { JsonValue } from '../shared/json-values.js';
import type { Query, Request } from '../shared/http-contracts.js';

export type SelectedCredentialHandoffRequest = z.infer<typeof SelectedCredentialHandoffRequestSchema>;
export type SelectedCredentialHandoffResult = z.infer<typeof SelectedCredentialHandoffResultSchema>;

export interface PrivateCredentialServicePort {
  getState: () => { phase: string };
  request: (path: string, init?: RequestInit) => Promise<Response>;
}

export interface WorkspaceCredentialScope {
  workspaceId: string;
  agentDirectoryId: string;
}

export interface PrivateCredentialDependencies {
  service: PrivateCredentialServicePort;
  resolveWorkspaceScope: (workspaceId: string) => Promise<WorkspaceCredentialScope | null>;
}

export interface QuotaCredentialSelection extends WorkspaceCredentialScope {
  providerId: string;
  credentialRef: string;
  quotaProviderId?: string | undefined;
}

export interface TtsCredentialSelection extends WorkspaceCredentialScope {
  providerId: string;
  credentialRef: string;
  baseURL: string;
}

export interface QuotaProvidersRegistry {
  listConfiguredQuotaProviders: (options: { selections: QuotaCredentialSelection[] }) => Promise<string[]>;
}

export interface CatalogCredentialSelectionsDependencies extends PrivateCredentialDependencies {
  getQuotaProviders: () => Promise<QuotaProvidersRegistry>;
}

export interface SelectionFields {
  workspaceId?: unknown;
  agentDirectoryId?: unknown;
  providerId?: unknown;
  credentialRef?: unknown;
}

export type CatalogSelectionRequest =
  | Pick<Request, 'query' | 'body'>
  | { query?: Query | undefined; body?: unknown };

export interface CatalogCredentialSelections {
  resolveQuotaSelection: (req: CatalogSelectionRequest, logicalQuotaProviderId: string) => Promise<QuotaCredentialSelection>;
  listQuotaSelections: (req: CatalogSelectionRequest) => Promise<Array<QuotaCredentialSelection & { quotaProviderId: string }>>;
  resolveTtsSelection: (req: CatalogSelectionRequest) => Promise<TtsCredentialSelection>;
}

const SAFE_CODES = new Set([
  'SERVICE_UNAVAILABLE',
  'UNAUTHORIZED',
  'CREDENTIAL_UNAVAILABLE',
  'OAUTH_REAUTH_REQUIRED',
  'CREDENTIAL_WRITE_FAILED',
  'CATALOG_CONFLICT',
  'PROVIDER_UNAVAILABLE',
  'INVALID_REQUEST',
  'enterprise_mode',
]);

const ErrorDetailsSchema = z.object({
  code: z.string().optional(),
  status: z.number().optional(),
});

const SelectionFieldsPresenceSchema = z.looseObject({
  workspaceId: z.unknown().optional(),
  agentDirectoryId: z.unknown().optional(),
  providerId: z.unknown().optional(),
  credentialRef: z.unknown().optional(),
});


export interface SelectedCredentialError extends Error {
  code: string;
  status: number;
}

function credentialFailure(code = 'SERVICE_UNAVAILABLE', status = 503): SelectedCredentialError {
  return Object.assign(new Error('Selected credential operation failed'), { code, status });
}

function extractFailureCode(error: Error | JsonValue | undefined): string {
  const parsed = ErrorDetailsSchema.safeParse(error);
  const code = parsed.success ? parsed.data.code : undefined;
  return code !== undefined && SAFE_CODES.has(code) ? code : 'SERVICE_UNAVAILABLE';
}

function extractFailureStatus(error: Error | JsonValue | undefined): number {
  const parsed = ErrorDetailsSchema.safeParse(error);
  const status = parsed.success ? parsed.data.status : undefined;
  return status !== undefined && Number.isInteger(status) && status >= 400 && status <= 599 ? status : 503;
}

async function readPrivateResponse<Output>(response: Response, schema: z.ZodType<Output>): Promise<Output> {
  if (!response.ok) {
    let failure: JsonValue | undefined;
    try { failure = z.json().parse(await response.json()); } catch { failure = undefined; }
    throw credentialFailure(extractFailureCode(failure), response.status);
  }
  try { return schema.parse(await response.json()); }
  catch { throw credentialFailure(); }
}

function requireDependencies(
  service: PrivateCredentialServicePort,
  resolveWorkspaceScope: PrivateCredentialDependencies['resolveWorkspaceScope'],
): void {
  const valid = service && resolveWorkspaceScope
    && z.function().safeParse(service.request).success && z.function().safeParse(service.getState).success
    && z.function().safeParse(resolveWorkspaceScope).success;
  if (!valid) throw new TypeError('Selected credentials require the real service and Host scope resolver');
}

async function selectedScope(
  service: PrivateCredentialServicePort,
  resolveWorkspaceScope: PrivateCredentialDependencies['resolveWorkspaceScope'],
  workspaceId: string,
  agentDirectoryId?: string,
): Promise<WorkspaceCredentialScope> {
  if (service.getState().phase !== 'ready') throw credentialFailure();
  const scope = await resolveWorkspaceScope(EntityIdSchema.parse(workspaceId));
  if (!scope || scope.workspaceId !== workspaceId || !EntityIdSchema.safeParse(scope.agentDirectoryId).success
    || (agentDirectoryId !== undefined && scope.agentDirectoryId !== agentDirectoryId)) throw credentialFailure('UNAUTHORIZED', 403);
  return { workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId };
}

export interface SelectedCredentialResolveInput {
  workspaceId: string;
  agentDirectoryId: string;
  providerId: string;
  credentialRef: string;
  purpose: string;
}

export function createSelectedCredentialResolver({
  service,
  resolveWorkspaceScope,
}: PrivateCredentialDependencies): (input: SelectedCredentialResolveInput) => Promise<PrivateCredentialResolveResult['credential']> {
  requireDependencies(service, resolveWorkspaceScope);
  return async (input) => {
    let request: PrivateCredentialResolveRequest;
    try { request = PrivateCredentialResolveRequestSchema.parse(input); }
    catch { throw credentialFailure('UNAUTHORIZED', 403); }
    try {
      const scope = await selectedScope(service, resolveWorkspaceScope, request.workspaceId, request.agentDirectoryId);
      const response = await service.request(`/internal/workspaces/${encodeURIComponent(scope.workspaceId)}/credentials/resolve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
      });
      const result = await readPrivateResponse(response, PrivateCredentialResolveResultSchema);
      if (result.workspaceId !== request.workspaceId || result.agentDirectoryId !== request.agentDirectoryId
        || result.providerId !== request.providerId || result.credentialRef !== request.credentialRef || result.purpose !== request.purpose)
        throw credentialFailure('UNAUTHORIZED', 403);
      return result.credential;
    } catch (error) {
      const normalized = error instanceof Error ? error : undefined;
      throw credentialFailure(extractFailureCode(normalized), extractFailureStatus(normalized));
    }
  };
}

export function createSelectedCredentialHandoff({
  service,
  resolveWorkspaceScope,
}: PrivateCredentialDependencies): (input: SelectedCredentialHandoffRequest) => Promise<SelectedCredentialHandoffResult> {
  requireDependencies(service, resolveWorkspaceScope);
  return async (input) => {
    let request: SelectedCredentialHandoffRequest;
    try { request = SelectedCredentialHandoffRequestSchema.parse(input); }
    catch { throw credentialFailure('UNAUTHORIZED', 403); }
    const scope = await selectedScope(service, resolveWorkspaceScope, request.workspaceId);
    const results: SelectedCredentialHandoffOutcome[] = [];
    for (const selection of request.selections) {
      const descriptor = { providerId: selection.providerId, source: selection.source, credentialType: selection.credentialType };
      if (selection.providerId === 'opencode') {
        results.push({ ...descriptor, status: 'unsupported', code: 'CONSOLE_CREDENTIAL_UNSUPPORTED' });
        continue;
      }
      if (selection.credentialType === 'oauth') {
        const reauth = selection.source === 'stored-credential'
          && ['anthropic', 'openai-codex', 'github-copilot', 'google-gemini-cli'].includes(selection.providerId);
        results.push({
          ...descriptor, status: reauth ? 're-auth-required' : 'unsupported',
          code: reauth ? 'OAUTH_REAUTH_REQUIRED' : 'CREDENTIAL_FORMAT_UNSUPPORTED',
        });
        continue;
      }
      if (selection.source === 'external-environment') {
        results.push({ ...descriptor, status: 'unavailable', code: 'LEGACY_ENVIRONMENT_UNAVAILABLE' });
        continue;
      }
      if (['anthropic', 'openai', 'google'].includes(selection.providerId)) {
        results.push({ ...descriptor, status: 'unavailable', code: 'PROVIDER_CONVERSION_UNVERIFIED' });
        continue;
      }
      if (selection.source !== 'selected-file') {
        results.push({ ...descriptor, status: 'unavailable', code: 'SELECTED_SOURCE_UNAVAILABLE' });
        continue;
      }
      try {
        if (service.getState().phase !== 'ready') throw credentialFailure();
        const catalog = await readPrivateResponse(
          await service.request(`/api/agent/v1/workspaces/${encodeURIComponent(scope.workspaceId)}/providers`),
          ProviderCatalogSchema,
        );
        if (catalog.workspaceId !== scope.workspaceId) throw credentialFailure('UNAUTHORIZED', 403);
        const privateRequest = PrivateCredentialHandoffRequestSchema.parse({ ...scope, expectedRevision: catalog.revision, selection });
        const response = await service.request(`/internal/workspaces/${encodeURIComponent(scope.workspaceId)}/credentials/handoff`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(privateRequest),
        });
        const result = await readPrivateResponse(response, PrivateCredentialHandoffResultSchema);
        if (result.workspaceId !== scope.workspaceId || result.agentDirectoryId !== scope.agentDirectoryId
          || result.outcome.providerId !== selection.providerId || result.outcome.source !== selection.source
          || result.outcome.credentialType !== selection.credentialType) throw credentialFailure('UNAUTHORIZED', 403);
        results.push(result.outcome);
      } catch (error) {
        const normalized = error instanceof Error ? error : undefined;
        results.push({ ...descriptor, status: 'unavailable', code: extractFailureCode(normalized) });
      }
    }
    return SelectedCredentialHandoffResultSchema.parse({ workspaceId: scope.workspaceId, results });
  };
}

interface QuotaProviderRelation {
  providers: readonly string[];
  methods?: readonly string[];
}

const QUOTA_PROVIDER_RELATIONS = {
  claude: { providers: ['anthropic'], methods: ['oauth'] },
  codex: { providers: ['openai-codex'], methods: ['oauth'] },
  google: { providers: ['google-gemini-cli', 'google-antigravity'], methods: ['oauth'] },
  'github-copilot-addon': { providers: ['github-copilot'] },
  hyper: { providers: ['charm-hyper'] },
  'zai-coding-plan': { providers: ['zai'] },
  'zhipuai-coding-plan': { providers: ['zhipu-coding-plan'] },
  'kimi-for-coding': { providers: ['kimi-code'] },
  'nano-gpt': { providers: ['nanogpt'] },
  'minimax-coding-plan': { providers: ['minimax-code'] },
  'minimax-cn-coding-plan': { providers: ['minimax-code-cn'] },
  wafer: { providers: ['wafer-serverless'] },
  xai: { providers: ['xai-oauth'], methods: ['oauth'] },
} satisfies Record<string, QuotaProviderRelation>;

const QUOTA_RELATIONS_BY_LOGICAL_ID = new Map<string, QuotaProviderRelation>(Object.entries(QUOTA_PROVIDER_RELATIONS));
const QUOTA_IDS_BY_NATIVE_PROVIDER = new Map<string, string[]>();
for (const [logicalId, relation] of QUOTA_RELATIONS_BY_LOGICAL_ID) {
  for (const nativeId of relation.providers) {
    const logicalIds = QUOTA_IDS_BY_NATIVE_PROVIDER.get(nativeId) ?? [];
    logicalIds.push(logicalId);
    QUOTA_IDS_BY_NATIVE_PROVIDER.set(nativeId, logicalIds);
  }
}

export function quotaProviderIdsForNativeProvider(nativeId: string): string[] {
  const logicalIds = [...(QUOTA_IDS_BY_NATIVE_PROVIDER.get(nativeId) ?? [])];
  if (!Object.hasOwn(QUOTA_PROVIDER_RELATIONS, nativeId) && !logicalIds.includes(nativeId)) logicalIds.push(nativeId);
  return logicalIds;
}

interface ParsedCatalogSelectionRequest {
  workspaceId: string;
  agentDirectoryId?: string;
  providerId?: string;
  credentialRef?: string;
}

const SELECTION_FIELD_KEYS = ['workspaceId', 'agentDirectoryId', 'providerId', 'credentialRef'] as const;

function catalogSelectionRequest(req: CatalogSelectionRequest, requireProvider = false): ParsedCatalogSelectionRequest {
  const queryFields = SelectionFieldsPresenceSchema.safeParse(req?.query);
  const bodyFields = SelectionFieldsPresenceSchema.safeParse(req?.body);
  const selection: Partial<ParsedCatalogSelectionRequest> = {};
  for (const field of SELECTION_FIELD_KEYS) {
    const queryValue = queryFields.success && Object.hasOwn(queryFields.data, field) ? queryFields.data[field] : undefined;
    const bodyValue = bodyFields.success && Object.hasOwn(bodyFields.data, field) ? bodyFields.data[field] : undefined;
    if (queryValue !== undefined && bodyValue !== undefined && queryValue !== bodyValue) {
      throw credentialFailure('INVALID_REQUEST', 400);
    }
    const value = bodyValue !== undefined ? bodyValue : queryValue;
    if (value === undefined && (field === 'agentDirectoryId' || field === 'credentialRef'
      || (field === 'providerId' && !requireProvider))) continue;
    const parsed = EntityIdSchema.safeParse(value);
    if (!parsed.success) throw credentialFailure('INVALID_REQUEST', 400);
    selection[field] = parsed.data;
  }
  if (!selection.workspaceId) throw credentialFailure('INVALID_REQUEST', 400);
  const resolved: ParsedCatalogSelectionRequest = { workspaceId: selection.workspaceId };
  if (selection.agentDirectoryId !== undefined) resolved.agentDirectoryId = selection.agentDirectoryId;
  if (selection.providerId !== undefined) resolved.providerId = selection.providerId;
  if (selection.credentialRef !== undefined) resolved.credentialRef = selection.credentialRef;
  return resolved;
}

function publicCredentialSelection(
  scope: WorkspaceCredentialScope,
  provider: z.infer<typeof ProviderCatalogSchema>['providers'][number],
): QuotaCredentialSelection {
  const credentialRef = provider.auth.status === 'configured' ? provider.auth.credentialRef : '';
  return { ...scope, providerId: provider.providerId, credentialRef };
}

export function createCatalogCredentialSelections({
  service,
  resolveWorkspaceScope,
  getQuotaProviders,
}: CatalogCredentialSelectionsDependencies): CatalogCredentialSelections {
  requireDependencies(service, resolveWorkspaceScope);
  if (!z.function().safeParse(getQuotaProviders).success) throw new TypeError('Catalog selections require the quota registry owner');

  const readCatalog = async (req: CatalogSelectionRequest, requireProvider = false) => {
    try {
      const request = catalogSelectionRequest(req, requireProvider);
      const scope = await selectedScope(service, resolveWorkspaceScope, request.workspaceId, request.agentDirectoryId);
      const catalog = await readPrivateResponse(
        await service.request(`/api/agent/v1/workspaces/${encodeURIComponent(scope.workspaceId)}/providers`),
        ProviderCatalogSchema,
      );
      if (catalog.workspaceId !== scope.workspaceId) throw credentialFailure('UNAUTHORIZED', 403);
      return { request, scope, catalog };
    } catch (error) {
      const normalized = error instanceof Error ? error : undefined;
      throw credentialFailure(extractFailureCode(normalized), extractFailureStatus(normalized));
    }
  };

  const quotaSelections = async ({
    request,
    scope,
    catalog,
  }: Awaited<ReturnType<typeof readCatalog>>): Promise<Array<QuotaCredentialSelection & { quotaProviderId: string }>> => {
    const selections: Array<QuotaCredentialSelection & { quotaProviderId: string }> = [];
    for (const provider of catalog.providers) {
      if (provider.auth.status !== 'configured' || (request.providerId && request.providerId !== provider.providerId)) continue;
      if (request.credentialRef && request.credentialRef !== provider.auth.credentialRef) continue;
      const logicalIds = QUOTA_IDS_BY_NATIVE_PROVIDER.get(provider.providerId) ?? [];
      if (!Object.hasOwn(QUOTA_PROVIDER_RELATIONS, provider.providerId)) {
        selections.push({ ...publicCredentialSelection(scope, provider), quotaProviderId: provider.providerId });
      }
      for (const logicalId of logicalIds) {
        const relation = QUOTA_RELATIONS_BY_LOGICAL_ID.get(logicalId);
        if (relation && (!relation.methods || relation.methods.includes(provider.auth.method))) {
          selections.push({ ...publicCredentialSelection(scope, provider), quotaProviderId: logicalId });
        }
      }
    }
    if ((request.providerId || request.credentialRef) && selections.length === 0) throw credentialFailure('CREDENTIAL_UNAVAILABLE', 422);
    try {
      const registry = await getQuotaProviders();
      if (!registry || !z.function().safeParse(registry.listConfiguredQuotaProviders).success) throw credentialFailure();
      const supportedIds = await registry.listConfiguredQuotaProviders({ selections });
      if (!Array.isArray(supportedIds) || supportedIds.some((id) => !EntityIdSchema.safeParse(id).success)) throw credentialFailure();
      const supported = new Set(supportedIds);
      return selections.filter((selection) => supported.has(selection.quotaProviderId));
    } catch { throw credentialFailure(); }
  };

  return {
    async resolveQuotaSelection(req, logicalQuotaProviderId) {
      if (!EntityIdSchema.safeParse(logicalQuotaProviderId).success) throw credentialFailure('INVALID_REQUEST', 400);
      const candidates = (await quotaSelections(await readCatalog(req)))
        .filter((selection) => selection.quotaProviderId === logicalQuotaProviderId);
      if (candidates.length === 0) throw credentialFailure('CREDENTIAL_UNAVAILABLE', 422);
      if (candidates.length !== 1) throw credentialFailure('INVALID_REQUEST', 400);
      const [candidate] = candidates;
      if (!candidate) throw credentialFailure('CREDENTIAL_UNAVAILABLE', 422);
      const { workspaceId, agentDirectoryId, providerId, credentialRef } = candidate;
      return { workspaceId, agentDirectoryId, providerId, credentialRef };
    },
    async listQuotaSelections(req) {
      return quotaSelections(await readCatalog(req));
    },
    async resolveTtsSelection(req) {
      const { request, scope, catalog } = await readCatalog(req, true);
      const provider = catalog.providers.find((candidate) => candidate.providerId === request.providerId);
      const endpoint = provider?.endpoint;
      if (!provider || provider.auth.status !== 'configured' || provider.auth.method !== 'api-key'
        || (provider.protocol !== 'chat-completions' && provider.protocol !== 'responses') || !endpoint
        || (request.credentialRef && request.credentialRef !== provider.auth.credentialRef))
        throw credentialFailure('CREDENTIAL_UNAVAILABLE', 422);
      return { ...publicCredentialSelection(scope, provider), baseURL: endpoint };
    },
  };
}
