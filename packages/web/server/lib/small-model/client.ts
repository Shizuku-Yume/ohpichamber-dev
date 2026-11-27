import {
  ModelCatalogSchema,
  CompletionRequestSchema,
  CompletionResultSchema,
  CompletionCancelResultSchema,
  type CompletionRequest,
  type CompletionResult,
  type Model,
  type ModelRoleValues,
} from '@openchamber/agent-contract';
import { z } from 'zod';

export interface SmallModelAgentService {
  request: (pathname: string, init?: RequestInit) => Promise<Response>;
}

export interface WorkspaceScope {
  workspaceId: string;
  cwd?: string | undefined;
  projectId?: string | undefined;
  agentDirectoryId?: string | undefined;
}

export type WorkspaceScopeResolver = (workspaceId: string) => Promise<WorkspaceScope | null | undefined>;

export interface ConfigureAgentServiceOptions {
  resolveWorkspaceScope?: WorkspaceScopeResolver | undefined;
}

export type SmallModelServiceError = Error & {
  statusCode: number;
  code?: string | undefined;
};

interface ModelCacheEntry {
  models: Model[];
  at: number;
}

const jsonSchema = z.json();

const ErrorBodySchema = z.object({
  detail: z.string().optional(),
  code: z.string().optional(),
});

const SettingsResponseSchema = z.object({
  settings: z.array(z.object({
    id: z.string(),
    value: z.record(z.string(), z.json()).optional(),
  })).optional(),
});

let service: SmallModelAgentService | null = null;
let resolveWorkspaceScope: WorkspaceScopeResolver | null = null;

export function configureAgentService(next: SmallModelAgentService, options: ConfigureAgentServiceOptions = {}): void {
  if (!next || !(next.request instanceof Function)) throw new TypeError('Agent service is required');
  if (!(options.resolveWorkspaceScope instanceof Function)) throw new TypeError('Workspace scope resolver is required');
  service = next;
  resolveWorkspaceScope = options.resolveWorkspaceScope;
  modelCache.clear();
}

export function resetAgentService(): void {
  service = null;
  resolveWorkspaceScope = null;
  modelCache.clear();
}

export const getAgentService = (): SmallModelAgentService | null => service;

const modelCache = new Map<string, ModelCacheEntry>();
const MODEL_CACHE_TTL_MS = 30_000;
const workspaceIdSchema = z.string().refine((value) => value.trim().length > 0);

const serviceError = (message: string, statusCode: number, code?: string): SmallModelServiceError => {
  const error: SmallModelServiceError = Object.assign(new Error(message), { statusCode });
  if (code !== undefined) error.code = code;
  return error;
};

const workspace = async (workspaceId: string): Promise<WorkspaceScope> => {
  if (!workspaceIdSchema.safeParse(workspaceId).success) throw serviceError('workspaceId is required', 400, 'INVALID_REQUEST');
  if (!resolveWorkspaceScope) throw serviceError('Workspace scope resolver is unavailable', 503, 'SERVICE_UNAVAILABLE');
  const scope = await resolveWorkspaceScope(workspaceId);
  if (!scope || scope.workspaceId !== workspaceId) throw serviceError('Workspace scope is unavailable', 404, 'SESSION_NOT_FOUND');
  return scope;
};

const request = async (pathname: string, init: RequestInit = {}): Promise<z.infer<typeof jsonSchema> | null> => {
  if (!service) throw serviceError('Agent service is unavailable', 503, 'SERVICE_UNAVAILABLE');
  const response = await service.request(pathname, { ...init, headers: { accept: 'application/json', ...(init.headers || {}) } });
  const rawBody = await response.json().catch(() => null);
  if (!response.ok) {
    const errorBody = ErrorBodySchema.safeParse(rawBody);
    const detail = errorBody.success ? errorBody.data.detail : undefined;
    const code = errorBody.success ? errorBody.data.code : undefined;
    throw serviceError(detail || 'Agent service request failed', response.status, code);
  }
  const parsedBody = jsonSchema.safeParse(rawBody);
  return parsedBody.success ? parsedBody.data : null;
};

export async function listModelInfos(_service: SmallModelAgentService | null | undefined, workspaceId: string): Promise<Model[]> {
  await workspace(workspaceId);
  const cached = modelCache.get(workspaceId);
  if (cached && Date.now() - cached.at < MODEL_CACHE_TTL_MS) return cached.models;
  const body = ModelCatalogSchema.parse(await request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/models`));
  modelCache.set(workspaceId, { models: body.models, at: Date.now() });
  return body.models;
}

export async function getModelRoles(_service: SmallModelAgentService | null | undefined, workspaceId: string): Promise<ModelRoleValues> {
  await workspace(workspaceId);
  try {
    const parsed = SettingsResponseSchema.safeParse(await request(`/api/agent/v1/workspaces/${encodeURIComponent(workspaceId)}/settings`));
    if (!parsed.success) return {};
    const setting = parsed.data.settings?.find((entry) => entry.id === 'modelRoles');
    return setting?.value ?? {};
  } catch {
    return {};
  }
}

export async function completeSmallModel(
  input: CompletionRequest,
  { signal }: { signal?: AbortSignal | undefined } = {},
): Promise<CompletionResult> {
  const parsed = CompletionRequestSchema.parse(input);
  await workspace(parsed.workspaceId);
  signal?.throwIfAborted();
  const owner = service;
  if (!owner) throw serviceError('Agent service is unavailable', 503, 'SERVICE_UNAVAILABLE');
  const pathname = `/api/agent/v1/workspaces/${encodeURIComponent(parsed.workspaceId)}/completions`;
  let cancellation: Promise<void> | undefined;
  const cancel = (): void => {
    if (cancellation) return;
    cancellation = owner.request(`${pathname}/${encodeURIComponent(parsed.completionId)}/cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ completionId: parsed.completionId }),
    }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) {
        const errorBody = ErrorBodySchema.safeParse(body);
        throw new Error((errorBody.success ? errorBody.data.detail : undefined) || 'Completion cancellation failed');
      }
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
    if (!response.ok) {
      const errorBody = ErrorBodySchema.safeParse(body);
      throw serviceError(
        (errorBody.success ? errorBody.data.detail : undefined) || 'Completion failed',
        response.status,
        errorBody.success ? errorBody.data.code : undefined,
      );
    }
    const result = CompletionResultSchema.parse(body);
    if (result.completionId !== parsed.completionId || result.selection.providerId !== parsed.selection.providerId || result.selection.modelId !== parsed.selection.modelId) {
      throw new Error('Completion identity mismatch');
    }
    if (cancellation) await cancellation;
    return result;
  } finally {
    signal?.removeEventListener('abort', cancel);
  }
}

export function findModelInfo(models: readonly Model[], providerID: string, modelID: string): Model | null {
  return models.find((model) => model.provider === providerID && model.modelId === modelID) ?? null;
}
