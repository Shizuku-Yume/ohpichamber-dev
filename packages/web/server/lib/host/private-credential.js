import { z } from 'zod';
import {
  PrivateCredentialResolveRequestSchema, PrivateCredentialResolveResultSchema,
  PrivateCredentialHandoffRequestSchema, PrivateCredentialHandoffResultSchema,
  SelectedCredentialHandoffRequestSchema, SelectedCredentialHandoffResultSchema,
} from '@openchamber/agent-service/private-protocol';
import { ProviderCatalogSchema, EntityIdSchema } from '@openchamber/agent-contract';

const SAFE_CODES = {
  SERVICE_UNAVAILABLE: true, UNAUTHORIZED: true, CREDENTIAL_UNAVAILABLE: true,
  OAUTH_REAUTH_REQUIRED: true, CREDENTIAL_WRITE_FAILED: true, CATALOG_CONFLICT: true,
  PROVIDER_UNAVAILABLE: true, INVALID_REQUEST: true, enterprise_mode: true,
};

function credentialFailure(code = 'SERVICE_UNAVAILABLE', status = 503) {
  return Object.assign(new Error('Selected credential operation failed'), { code, status });
}

async function readPrivateResponse(response, schema) {
  if (!response.ok) {
    let failure;
    try { failure = await response.json(); } catch {}
    const code = SAFE_CODES[failure?.code] === true ? failure.code : 'SERVICE_UNAVAILABLE';
    throw credentialFailure(code, response.status);
  }
  try { return schema.parse(await response.json()); }
  catch { throw credentialFailure(); }
}

function requireDependencies(service, resolveWorkspaceScope) {
  const valid = service && resolveWorkspaceScope
    && z.function().safeParse(service.request).success && z.function().safeParse(service.getState).success
    && z.function().safeParse(resolveWorkspaceScope).success;
  if (!valid) throw new TypeError('Selected credentials require the real service and Host scope resolver');
}

async function selectedScope(service, resolveWorkspaceScope, workspaceId, agentDirectoryId) {
  if (service.getState().phase !== 'ready') throw credentialFailure();
  const scope = await resolveWorkspaceScope(EntityIdSchema.parse(workspaceId));
  if (!scope || scope.workspaceId !== workspaceId || !EntityIdSchema.safeParse(scope.agentDirectoryId).success
    || (agentDirectoryId !== undefined && scope.agentDirectoryId !== agentDirectoryId)) throw credentialFailure('UNAUTHORIZED', 403);
  return { workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId };
}

/** Selected secrets are private Node consumers' inputs, never a browser route result. */
export function createSelectedCredentialResolver({ service, resolveWorkspaceScope }) {
  requireDependencies(service, resolveWorkspaceScope);
  return async input => {
    let request;
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
      throw credentialFailure(SAFE_CODES[error?.code] === true ? error.code : 'SERVICE_UNAVAILABLE',
        Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503);
    }
  };
}

/** Explicit browser-selected file handoff is distinct from native credential lookup. */
export function createSelectedCredentialHandoff({ service, resolveWorkspaceScope }) {
  requireDependencies(service, resolveWorkspaceScope);
  return async input => {
    let request;
    try { request = SelectedCredentialHandoffRequestSchema.parse(input); }
    catch { throw credentialFailure('UNAUTHORIZED', 403); }
    const scope = await selectedScope(service, resolveWorkspaceScope, request.workspaceId);
    const results = [];
    for (const selection of request.selections) {
      const descriptor = { providerId: selection.providerId, source: selection.source, credentialType: selection.credentialType };
      // These outcomes require no selected-secret reads or guessed OAuth conversion.
      if (selection.providerId === 'opencode') {
        results.push({ ...descriptor, status: 'unsupported', code: 'CONSOLE_CREDENTIAL_UNSUPPORTED' });
        continue;
      }
      if (selection.credentialType === 'oauth') {
        const reauth = selection.source === 'stored-credential'
          && ['anthropic', 'openai-codex', 'github-copilot', 'google-gemini-cli'].includes(selection.providerId);
        results.push({ ...descriptor, status: reauth ? 're-auth-required' : 'unsupported',
          code: reauth ? 'OAUTH_REAUTH_REQUIRED' : 'CREDENTIAL_FORMAT_UNSUPPORTED' });
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
        const catalog = await readPrivateResponse(await service.request(`/api/agent/v1/workspaces/${encodeURIComponent(scope.workspaceId)}/providers`), ProviderCatalogSchema);
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
        results.push({ ...descriptor, status: 'unavailable', code: SAFE_CODES[error?.code] === true ? error.code : 'SERVICE_UNAVAILABLE' });
      }
    }
    return SelectedCredentialHandoffResultSchema.parse({ workspaceId: scope.workspaceId, results });
  };
}

// Logical quota products are not interchangeable native authentication providers.
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
};
const QUOTA_IDS_BY_NATIVE_PROVIDER = new Map();
for (const [logicalId, relation] of Object.entries(QUOTA_PROVIDER_RELATIONS)) {
  for (const nativeId of relation.providers) {
    const logicalIds = QUOTA_IDS_BY_NATIVE_PROVIDER.get(nativeId) ?? [];
    logicalIds.push(logicalId);
    QUOTA_IDS_BY_NATIVE_PROVIDER.set(nativeId, logicalIds);
  }
}

function catalogSelectionRequest(req, requireProvider = false) {
  const selection = {};
  for (const field of ['workspaceId', 'agentDirectoryId', 'providerId', 'credentialRef']) {
    const queryValue = req?.query && Object.hasOwn(req.query, field) ? req.query[field] : undefined;
    const bodyValue = req?.body && Object.hasOwn(req.body, field) ? req.body[field] : undefined;
    if (queryValue !== undefined && bodyValue !== undefined && queryValue !== bodyValue)
      throw credentialFailure('INVALID_REQUEST', 400);
    const value = bodyValue !== undefined ? bodyValue : queryValue;
    if (value === undefined && (field === 'agentDirectoryId' || field === 'credentialRef'
      || (field === 'providerId' && !requireProvider))) continue;
    const parsed = EntityIdSchema.safeParse(value);
    if (!parsed.success) throw credentialFailure('INVALID_REQUEST', 400);
    selection[field] = parsed.data;
  }
  return selection;
}

function publicCredentialSelection(scope, provider) {
  return { ...scope, providerId: provider.providerId, credentialRef: provider.auth.credentialRef };
}

/** Public catalogs select exact native records; these callbacks never read or return secret material. */
export function createCatalogCredentialSelections({ service, resolveWorkspaceScope, getQuotaProviders }) {
  requireDependencies(service, resolveWorkspaceScope);
  if (!z.function().safeParse(getQuotaProviders).success) throw new TypeError('Catalog selections require the quota registry owner');

  const readCatalog = async (req, requireProvider = false) => {
    try {
      const request = catalogSelectionRequest(req, requireProvider);
      const scope = await selectedScope(service, resolveWorkspaceScope, request.workspaceId, request.agentDirectoryId);
      const catalog = await readPrivateResponse(await service.request(
        `/api/agent/v1/workspaces/${encodeURIComponent(scope.workspaceId)}/providers`), ProviderCatalogSchema);
      if (catalog.workspaceId !== scope.workspaceId) throw credentialFailure('UNAUTHORIZED', 403);
      return { request, scope, catalog };
    } catch (error) {
      throw credentialFailure(SAFE_CODES[error?.code] === true ? error.code : 'SERVICE_UNAVAILABLE',
        Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 503);
    }
  };

  const quotaSelections = async ({ request, scope, catalog }) => {
    const selections = [];
    for (const provider of catalog.providers) {
      if (provider.auth.status !== 'configured' || (request.providerId && request.providerId !== provider.providerId)) continue;
      if (request.credentialRef && request.credentialRef !== provider.auth.credentialRef) continue;
      const logicalIds = QUOTA_IDS_BY_NATIVE_PROVIDER.get(provider.providerId) ?? [];
      if (!Object.hasOwn(QUOTA_PROVIDER_RELATIONS, provider.providerId)) {
        selections.push({ ...publicCredentialSelection(scope, provider), quotaProviderId: provider.providerId });
      }
      for (const logicalId of logicalIds) {
        const relation = QUOTA_PROVIDER_RELATIONS[logicalId];
        if (!relation.methods || relation.methods.includes(provider.auth.method))
          selections.push({ ...publicCredentialSelection(scope, provider), quotaProviderId: logicalId });
      }
    }
    if ((request.providerId || request.credentialRef) && selections.length === 0) throw credentialFailure('CREDENTIAL_UNAVAILABLE', 422);
    try {
      const registry = await getQuotaProviders();
      if (!registry || !z.function().safeParse(registry.listConfiguredQuotaProviders).success) throw credentialFailure();
      const supportedIds = await registry.listConfiguredQuotaProviders({ selections });
      if (!Array.isArray(supportedIds) || supportedIds.some(id => !EntityIdSchema.safeParse(id).success)) throw credentialFailure();
      const supported = new Set(supportedIds);
      return selections.filter(selection => supported.has(selection.quotaProviderId));
    } catch { throw credentialFailure(); }
  };

  return {
    async resolveQuotaSelection(req, logicalQuotaProviderId) {
      if (!EntityIdSchema.safeParse(logicalQuotaProviderId).success) throw credentialFailure('INVALID_REQUEST', 400);
      const candidates = (await quotaSelections(await readCatalog(req)))
        .filter(selection => selection.quotaProviderId === logicalQuotaProviderId);
      if (candidates.length === 0) throw credentialFailure('CREDENTIAL_UNAVAILABLE', 422);
      if (candidates.length !== 1) throw credentialFailure('INVALID_REQUEST', 400);
      const { workspaceId, agentDirectoryId, providerId, credentialRef } = candidates[0];
      return { workspaceId, agentDirectoryId, providerId, credentialRef };
    },
    async listQuotaSelections(req) {
      return quotaSelections(await readCatalog(req));
    },
    async resolveTtsSelection(req) {
      const { request, scope, catalog } = await readCatalog(req, true);
      const provider = catalog.providers.find(candidate => candidate.providerId === request.providerId);
      if (!provider || provider.auth.status !== 'configured' || provider.auth.method !== 'api-key'
        || !['chat-completions', 'responses'].includes(provider.protocol) || !provider.endpoint
        || (request.credentialRef && request.credentialRef !== provider.auth.credentialRef))
        throw credentialFailure('CREDENTIAL_UNAVAILABLE', 422);
      return { ...publicCredentialSelection(scope, provider), baseURL: provider.endpoint };
    },
  };
}
