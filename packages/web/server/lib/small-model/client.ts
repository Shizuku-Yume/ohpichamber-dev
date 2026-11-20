import { ModelCatalogSchema, CompletionRequestSchema, CompletionResultSchema, CompletionCancelResultSchema } from '@openchamber/agent-contract';
import { z } from 'zod';

let service = null;
let resolveWorkspaceScope = null;

export function configureAgentService(next, options = {}) {
  if (!next || !(next.request instanceof Function)) throw new TypeError('Agent service is required');
  if (!(options.resolveWorkspaceScope instanceof Function)) throw new TypeError('Workspace scope resolver is required');
  service = next;
  resolveWorkspaceScope = options.resolveWorkspaceScope;
  modelCache.clear();
}

export function resetAgentService() {
  service = null;
  resolveWorkspaceScope = null;
  modelCache.clear();
}

export const getAgentService = () => service;

const modelCache = new Map();
const MODEL_CACHE_TTL_MS = 30_000;
const workspaceIdSchema = z.string().refine(value => value.trim().length > 0);

const workspace = async (workspaceId) => {
  if (!workspaceIdSchema.safeParse(workspaceId).success) throw Object.assign(new Error('workspaceId is required'), { statusCode: 400, code: 'INVALID_REQUEST' });
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

export async function getModelRoles(_service, workspaceId) {
  await workspace(workspaceId);
  try {
    const data = await request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/settings`);
    const setting = Array.isArray(data?.settings) ? data.settings.find((s) => s?.id === 'modelRoles') : null;
    return setting && typeof setting.value === 'object' && setting.value !== null ? setting.value : {};
  } catch {
    return {};
  }
}

export async function completeSmallModel(input, { signal } = {}) {
  const parsed = CompletionRequestSchema.parse(input);
  await workspace(parsed.workspaceId);
  signal?.throwIfAborted();
  const owner = service;
  if (!owner) throw Object.assign(new Error('Agent service is unavailable'), { statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
  const pathname = `/api/agent/v1/workspaces/${encodeURIComponent(parsed.workspaceId)}/completions`;
  let cancellation;
  const cancel = () => {
    if (cancellation) return;
    cancellation = owner.request(`${pathname}/${encodeURIComponent(parsed.completionId)}/cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completionId: parsed.completionId }),
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body?.detail || 'Completion cancellation failed');
      const result = CompletionCancelResultSchema.parse(body);
      if (result.completionId !== parsed.completionId) throw new Error('Completion cancellation identity mismatch');
    });
    void cancellation.catch(() => { });
  };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await owner.request(pathname, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(parsed),
    });
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body?.detail || 'Completion failed'), { statusCode: response.status, code: body?.code });
    const result = CompletionResultSchema.parse(body);
    if (result.completionId !== parsed.completionId || result.selection.providerId !== parsed.selection.providerId || result.selection.modelId !== parsed.selection.modelId) throw new Error('Completion identity mismatch');
    if (cancellation) await cancellation;
    return result;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

export function findModelInfo(models, providerID, modelID) {
  return models.find((model) => model?.provider === providerID && model?.modelId === modelID) ?? null;
}
