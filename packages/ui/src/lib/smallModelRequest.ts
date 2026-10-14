import type { CompletionRequest, CompletionResult, Model, ModelSelection } from '@openchamber/agent-contract';
import { toast } from 'sonner';
import { canonicalClient } from '@/api/canonicalClient';
import { formatMessage, useI18nStore } from '@/lib/i18n';
import { loadDesktopSettings } from '@/lib/persistence';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { getDirectoryState, getSyncSessionDirectory } from '@/sync/sync-refs';
import { useConfigStore } from '@/stores/useConfigStore';

export type SmallModelRequest = Pick<CompletionRequest, 'prompt'> & Partial<Pick<CompletionRequest, 'system' | 'format' | 'maxOutputTokens' | 'timeoutMs' | 'overflow'>> & {
  directory?: string | null;
  workspaceId?: string;
  sessionId?: string | null;
  selection?: ModelSelection;
  preferred?: ModelSelection;
  signal?: AbortSignal;
};

const families = ['luna', 'flash-lite', 'flash', 'haiku'];
const usable = (model: Model): boolean => model.enabled !== false && model.status !== 'deprecated' && model.modalities.includes('text');

/** Explicit selections and profile overrides are intent; provider-local discovery never crosses subscriptions. */
export async function resolveSmallModel(input: Pick<SmallModelRequest, 'directory' | 'workspaceId' | 'sessionId' | 'selection' | 'preferred'> = {}): Promise<{ workspaceId: string; selection: ModelSelection | null }> {
  const config = useConfigStore.getState();
  const preferred = input.preferred ?? (config.currentProviderId && config.currentModelId ? { providerId: config.currentProviderId, modelId: config.currentModelId } : null);
  const runtimeKey = getRuntimeKey();
  let changed = false;
  const unsubscribe = subscribeRuntimeEndpointWillChange(() => { changed = true; });
  const check = () => { if (changed || getRuntimeKey() !== runtimeKey) throw new DOMException('Runtime changed', 'AbortError'); };
  try {
    const directory = input.directory?.trim() || (input.sessionId ? getSyncSessionDirectory(input.sessionId) : getDirectoryState()?.path.directory);
    if (!directory && !input.workspaceId) throw new Error('No workspace directory for background generation');
    const workspace = input.workspaceId ? { workspaceId: input.workspaceId } : await canonicalClient.resolveWorkspace(directory!);
    check();
    if (input.selection) return { workspaceId: workspace.workspaceId, selection: input.selection };
    const [catalog, settings] = await Promise.all([canonicalClient.getModels(workspace.workspaceId), loadDesktopSettings()]);
    check();
    if (!settings) throw new Error('Background model settings are unavailable');
    const override = settings.smallModelUseDefault === false ? settings.smallModelOverride?.trim() : undefined;
    const slash = override?.indexOf('/') ?? -1;
    if (override && (slash <= 0 || slash === override.length - 1)) return { workspaceId: workspace.workspaceId, selection: null };
    if (override && slash > 0 && slash < override.length - 1) {
      const selection = { providerId: override.slice(0, slash), modelId: override.slice(slash + 1) };
      const available = catalog.models.some(model => usable(model) && model.provider === selection.providerId && model.modelId === selection.modelId);
      return { workspaceId: workspace.workspaceId, selection: available ? selection : null };
    }
    const models = catalog.models.filter(model => usable(model) && (!preferred || model.provider === preferred.providerId));
    // A default utility selection may use a smaller model, but only within
    // the provider captured when the operation started.
    let small: Model | undefined;
    for (const family of families) {
      small = models.find(model => model.modelId.toLowerCase().replaceAll('_', '-').includes(family));
      if (small) break;
    }
    const chosen = small ?? (preferred ? models.find(model => model.modelId === preferred.modelId) : undefined);
    return { workspaceId: workspace.workspaceId, selection: chosen ? { providerId: chosen.provider, modelId: chosen.modelId } : null };
  } finally {
    unsubscribe();
  }
}
class SmallModelUnavailableError extends Error {}

export class SmallModelCompletionError extends Error {
  constructor(readonly result: Exclude<CompletionResult, { status: 'completed' }>) {
    super(result.status === 'failed' ? result.error.detail : `Completion ${result.reason}`);
    this.name = 'SmallModelCompletionError';
  }
}

export function completionText(result: CompletionResult): string {
  if (result.status !== 'completed') throw new SmallModelCompletionError(result);
  if (result.output.kind !== 'text') throw new Error('Completion did not return text');
  return result.output.text;
}

/** Cancellation is sent to the completion owner, not implemented by abandoning HTTP delivery. */
export async function requestSmallModel(input: SmallModelRequest, options: { notifyOnError?: boolean; silentUnavailable?: boolean } = {}): Promise<CompletionResult> {
  const runtimeKey = getRuntimeKey();
  let changed = false;
  let owner: { workspaceId: string; completionId: string } | undefined;
  let cancel: Promise<unknown> | undefined;
  const abort = () => {
    if (owner && !changed && getRuntimeKey() === runtimeKey && !cancel) cancel = canonicalClient.cancelCompletion(owner.workspaceId, owner.completionId);
    // Observe rejection immediately while the completion response is pending.
    void cancel?.catch(() => {});
  };
  const unsubscribe = subscribeRuntimeEndpointWillChange(() => { abort(); changed = true; });
  input.signal?.addEventListener('abort', abort, { once: true });
  try {
    input.signal?.throwIfAborted();
    const { workspaceId, selection } = await resolveSmallModel(input);
    if (changed || getRuntimeKey() !== runtimeKey) throw new DOMException('Runtime changed', 'AbortError');
    input.signal?.throwIfAborted();
    if (!selection) throw new SmallModelUnavailableError('No background model available in the selected provider');
    owner = { workspaceId, completionId: crypto.randomUUID() };
    const request: CompletionRequest = {
      ...owner, selection, prompt: input.prompt, format: input.format ?? { kind: 'text' },
      overflow: input.overflow ?? 'truncate', variant: null, reasoningEffort: null,
      timeoutMs: input.timeoutMs ?? 60_000,
    };
    if (input.system !== undefined) request.system = input.system;
    if (input.maxOutputTokens !== undefined) request.maxOutputTokens = input.maxOutputTokens;
    const result = await canonicalClient.complete(workspaceId, request);
    if (changed || getRuntimeKey() !== runtimeKey) throw new DOMException('Runtime changed', 'AbortError');
    if (cancel) await cancel;
    input.signal?.throwIfAborted();
    if (result.status === 'failed' && !(options.silentUnavailable && ['MODEL_UNAVAILABLE', 'PROVIDER_UNAVAILABLE'].includes(result.error.code))) notify(options);
    return result;
  } catch (error) {
    if (!changed && !input.signal?.aborted && !(options.silentUnavailable && error instanceof SmallModelUnavailableError)) notify(options);
    throw error;
  } finally {
    unsubscribe();
    input.signal?.removeEventListener('abort', abort);
  }
}

function notify(options: { notifyOnError?: boolean }): void {
  if (options.notifyOnError === false) return;
  const dictionary = useI18nStore.getState().dictionary;
  toast.error(formatMessage(dictionary, 'smallModel.toast.unavailable.title'), {
    id: 'small-model-unavailable',
    description: formatMessage(dictionary, 'smallModel.toast.unavailable.description'),
  });
}
