import {
  PrivateCredentialResolveRequestSchema, PrivateCredentialResolveResultSchema,
  PrivateCredentialHandoffRequestSchema, PrivateCredentialHandoffResultSchema,
  SelectedCredentialHandoffRequestSchema, SelectedCredentialHandoffResultSchema,
} from '@openchamber/agent-service/private-protocol';
import { ProviderCatalogSchema, EntityIdSchema } from '@openchamber/agent-contract';

const SAFE_CODES = {
  SERVICE_UNAVAILABLE: true, UNAUTHORIZED: true, CREDENTIAL_UNAVAILABLE: true,
  OAUTH_REAUTH_REQUIRED: true, CREDENTIAL_WRITE_FAILED: true, CATALOG_CONFLICT: true,
  PROVIDER_UNAVAILABLE: true, enterprise_mode: true,
};

function credentialFailure(code = 'SERVICE_UNAVAILABLE', status = 503) {
  return Object.assign(new Error('Selected credential operation failed'), { code, status });
}

async function readPrivateResponse(response, schema) {
  if (!response.ok) {
    let failure;
    try { failure = await response.json(); } catch {}
    const code = typeof failure?.code === 'string' && SAFE_CODES[failure.code] === true ? failure.code : 'SERVICE_UNAVAILABLE';
    throw credentialFailure(code, response.status);
  }
  try { return schema.parse(await response.json()); }
  catch { throw credentialFailure(); }
}

function requireDependencies(service, resolveWorkspaceScope) {
  if (!service || typeof service.request !== 'function' || typeof service.getState !== 'function'
    || typeof resolveWorkspaceScope !== 'function') throw new TypeError('Selected credentials require the real service and Host scope resolver');
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
