import { ModelCatalogSchema, ProviderCatalogSchema, CompletionRequestSchema, CompletionResultSchema } from '@openchamber/agent-contract';

let service = null;
let resolveWorkspaceScope = null;

export function configureAgentService(next, options = {}) {
  if (!next || typeof next.request !== 'function') throw new TypeError('Agent service is required');
  if (typeof options.resolveWorkspaceScope !== 'function') throw new TypeError('Workspace scope resolver is required');
  service = next;
  resolveWorkspaceScope = options.resolveWorkspaceScope;
  modelCache.clear();
  providerCache.clear();
}

export function resetAgentService() {
  service = null;
  resolveWorkspaceScope = null;
  modelCache.clear();
  providerCache.clear();
}

export const getAgentService = () => service;

const modelCache = new Map();
const providerCache = new Map();
const MODEL_CACHE_TTL_MS = 30_000;

const workspace = async (workspaceId) => {
  if (typeof workspaceId !== 'string' || !workspaceId.trim()) throw Object.assign(new Error('workspaceId is required'), { statusCode: 400, code: 'INVALID_REQUEST' });
  if (!resolveWorkspaceScope) throw Object.assign(new Error('Workspace scope resolver is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  const scope = await resolveWorkspaceScope(workspaceId);
  if (!scope || scope.workspaceId !== workspaceId) throw Object.assign(new Error('Workspace scope is unavailable'), { statusCode: 404, code: 'SESSION_NOT_FOUND' });
  return scope;
};

const request = async (pathname, init = {}) => {
  if (!service) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  const response = await service.request(pathname, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.detail || 'Agent service request failed');
    error.statusCode = response.status;
    error.code = body?.code;
    throw error;
  }
  return body;
};

export async function listModelInfos(_service, workspaceId) {
  await workspace(workspaceId);
  const cached = modelCache.get(workspaceId);
  if (cached && Date.now() - cached.at < MODEL_CACHE_TTL_MS) return cached.models;
  const body = ModelCatalogSchema.parse(await request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/models`));
  modelCache.set(workspaceId, { models: body.models, at: Date.now() });
  return body.models;
}

export async function listProviderInfos(_service, workspaceId) {
  await workspace(workspaceId);
  const cached = providerCache.get(workspaceId);
  if (cached && Date.now() - cached.at < MODEL_CACHE_TTL_MS) return cached.providers;
  const body = ProviderCatalogSchema.parse(await request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/providers`));
  providerCache.set(workspaceId, { providers: body.providers, at: Date.now() });
  return body.providers;
}

export async function completeSmallModel(input, { signal } = {}) {
  const parsed = CompletionRequestSchema.parse(input);
  return CompletionResultSchema.parse(await request(
    `/api/agent/v1/workspaces/${encodeURIComponent(parsed.workspaceId)}/completions`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed), signal },
  ));
}

export function findModelInfo(models, providerID, modelID) {
  return models.find((model) => model?.provider === providerID && model?.modelId === modelID) ?? null;
}
