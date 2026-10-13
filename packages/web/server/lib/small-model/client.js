let service = null;

export function configureAgentService(next) {
  if (!next || typeof next.request !== 'function') throw new TypeError('Agent service is required');
  service = next;
}
export function resetAgentService() { service = null; modelCache = null; modelCacheKey = ''; modelCacheAt = 0; }
export const getAgentService = () => service;

const MODEL_CACHE_TTL_MS = 30_000;
let modelCache = null;
let modelCacheKey = '';
let modelCacheAt = 0;

const request = async (path, init = {}) => {
  if (!service) return null;
  const response = await service.request(path, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
  const body = await response.json().catch(() => null);
  if (!response.ok) { const error = new Error(body?.detail || body?.error || 'Agent service request failed'); error.statusCode = response.status; error.code = body?.code; throw error; }
  return body;
};

export async function listModelInfos(_service, workspaceId) {
  const key = typeof workspaceId === 'string' ? workspaceId : '';
  if (modelCache && modelCacheKey === key && Date.now() - modelCacheAt < MODEL_CACHE_TTL_MS) return modelCache;
  try {
    const body = await request(`/api/agent/v1/catalog/models${key ? `?workspaceId=${encodeURIComponent(key)}` : ''}`);
    const models = Array.isArray(body?.items) ? body.items : Array.isArray(body?.data) ? body.data : [];
    modelCache = models; modelCacheKey = key; modelCacheAt = Date.now(); return models;
  } catch { return modelCacheKey === key && modelCache ? modelCache : []; }
}
export async function listProviderInfos() {
  try { const body = await request('/api/agent/v1/catalog/providers'); return Array.isArray(body?.items) ? body.items : Array.isArray(body?.data) ? body.data : []; } catch { return []; }
}
export async function getDefaultModelInfo() {
  try { const body = await request('/api/agent/v1/catalog/default'); const info = body?.model || body?.data || body; return info && typeof info.id === 'string' ? info : null; } catch { return null; }
}
export async function getConfiguredSmallModelRef() {
  try { const body = await request('/api/agent/v1/settings/small-model'); const model = body?.model || body; return model?.providerID && (model.modelID || model.id) ? { providerID: model.providerID, modelID: model.modelID || model.id } : null; } catch { return null; }
}
export async function completeSmallModel(input, { signal } = {}) {
  const body = await request('/api/agent/v1/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal });
  return body?.completion || body;
}
export function findModelInfo(models, providerID, modelID) {
  const ofProvider = models.filter((model) => model?.providerID === providerID);
  return ofProvider.find((model) => model.id === modelID) ?? ofProvider.find((model) => model.modelID === modelID) ?? null;
}
