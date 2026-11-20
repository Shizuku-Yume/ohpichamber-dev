import {
  parseModelSelector,
  isRoleConfigured,
  resolveRoleSelector,
  thinkingLevelToReasoningEffort,
  type CompletionRequest,
  type CompletionResult,
  type ConfiguredThinkingLevel,
  type Model,
  type ModelSelection,
} from '@openchamber/agent-contract';
import { toast } from 'sonner';
import { canonicalClient } from '@/api/canonicalClient';
import { formatMessage, useI18nStore } from '@/lib/i18n';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { getDirectoryState, getSyncSessionDirectory } from '@/sync/sync-refs';
import { selectModelsForDirectory, useConfigStore } from '@/stores/useConfigStore';
export type SmallModelRequest = Pick<CompletionRequest, 'prompt'> & Partial<Pick<CompletionRequest, 'system' | 'format' | 'maxOutputTokens' | 'timeoutMs' | 'overflow'>> & {
  directory?: string | null;
  workspaceId?: string;
  sessionId?: string | null;
  selection?: ModelSelection;
  preferred?: ModelSelection;
  role?: 'commit' | 'smol' | 'default' | string;
  /**
   * Ask the resolved model to reason. The effort comes from the model's own
   * advertised levels (`medium` when it offers one, otherwise the first it
   * advertises); a model that reports no reasoning support keeps a null
   * effort, so the toggle never invents a capability the model lacks.
   */
  reasoning?: boolean;
  signal?: AbortSignal;
};

const families = ['luna', 'flash-lite', 'flash', 'haiku'];
const usable = (model: Model): boolean => model.enabled !== false && model.status !== 'deprecated' && model.modalities.includes('text');

/** What a role or preference resolved to: the selection, its catalogue row, and the level it asked for. */
interface ResolvedSmallModel {
  workspaceId: string;
  selection: ModelSelection | null;
  model: Model | null;
  /** The thinking level the resolved selector carried, if any. */
  thinkingLevel: ConfiguredThinkingLevel | undefined;
  /** The variant the resolved selector carried, if any. */
  variant: string | null;
}

export async function resolveSmallModel(input: Pick<SmallModelRequest, 'directory' | 'workspaceId' | 'sessionId' | 'selection' | 'preferred' | 'role'> = {}): Promise<ResolvedSmallModel> {
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
    const targetRole = input.role ?? 'smol';
    // The config loader already read this directory's catalog and the OMP
    // settings roles resolve from; asking again made every background
    // completion pay two catalog reads for data the app already held. A cold
    // store (a background job that ran before the first load settled) still
    // reads them, so the resolver never depends on load order.
    const store = useConfigStore.getState();
    const cachedModels = selectModelsForDirectory(store, directory);
    const cachedSettings = store.ompSettings;
    let models = cachedModels;
    let ompSettings = cachedSettings;
    if (cachedModels.length === 0 || cachedSettings === null) {
      const [catalog, settings] = await Promise.all([
        cachedModels.length === 0 ? canonicalClient.getModels(workspace.workspaceId) : Promise.resolve(null),
        cachedSettings === null ? canonicalClient.getOmpSettings(workspace.workspaceId).catch(() => null) : Promise.resolve(null),
      ]);
      check();
      if (catalog !== null) models = catalog.models;
      if (settings !== null) ompSettings = settings;
    }
    // The catalog entry travels with the selection: a reasoning-enabled request
    // must ask only for an effort the model actually advertises.
    const catalogModel = (selection: ModelSelection | null): Model | null => (
      selection
        ? models.find((model) => model.provider === selection.providerId && model.modelId === selection.modelId) ?? null
        : null
    );
    if (input.selection) {
      return { workspaceId: workspace.workspaceId, selection: input.selection, model: catalogModel(input.selection), thinkingLevel: undefined, variant: null };
    }
    // A role value may carry a `:thinkingLevel` suffix; the level is the role's
    // own request for reasoning and must reach the completion as its effort,
    // not be dropped when the selector is split into provider and model.
    const rolesValue = ompSettings?.settings.find((s) => s.id === 'modelRoles')?.value;
    const modelRoles = rolesValue && typeof rolesValue === 'object' ? (rolesValue as Record<string, string>) : null;
    const roleConfigured = modelRoles ? isRoleConfigured(targetRole, modelRoles) || isRoleConfigured('default', modelRoles) : false;
    const roleSelector = modelRoles ? resolveRoleSelector(targetRole, modelRoles) : undefined;
    if (roleConfigured) {
      // A configured role that does not resolve (a cycle, a value that is not
      // a selector) fails here. It must not fall through to the composer's
      // model, which is a different model than the one the user configured.
      const parsed = roleSelector ? parseModelSelector(roleSelector) : null;
      if (!parsed) return { workspaceId: workspace.workspaceId, selection: null, model: null, thinkingLevel: undefined, variant: null };
      const selection = { providerId: parsed.providerId, modelId: parsed.modelId };
      const available = models.some((model) => usable(model) && model.provider === selection.providerId && model.modelId === selection.modelId);
      return {
        workspaceId: workspace.workspaceId,
        selection: available ? selection : null,
        model: available ? catalogModel(selection) : null,
        thinkingLevel: parsed.thinkingLevel,
        variant: parsed.variant ?? null,
      };
    }
    const candidates = models.filter(model => usable(model) && (!preferred || model.provider === preferred.providerId));
    // A default utility selection may use a smaller model, but only within
    // the provider captured when the operation started.
    let small: Model | undefined;
    for (const family of families) {
      small = candidates.find(model => model.modelId.toLowerCase().replaceAll('_', '-').includes(family));
      if (small) break;
    }
    const chosen = small ?? (preferred ? candidates.find(model => model.modelId === preferred.modelId) : undefined);
    return {
      workspaceId: workspace.workspaceId,
      selection: chosen ? { providerId: chosen.provider, modelId: chosen.modelId } : null,
      model: chosen ?? null,
      thinkingLevel: undefined,
      variant: null,
    };
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

/**
 * The effort a reasoning-enabled utility completion asks for. `null` keeps the
 * request exactly as it is today (no reasoning). A model whose catalog entry
 * advertises no reasoning support, or none of the efforts it does advertise,
 * also stays at `null`: asking for an effort the model cannot serve would make
 * `complete` refuse the request outright instead of answering it.
 */
function resolveReasoningEffort(
  reasoning: boolean | undefined,
  model: Model | null,
  thinkingLevel: ConfiguredThinkingLevel | undefined,
): string | null {
  // A selector's `:thinkingLevel` is the caller's own request for reasoning,
  // so it survives even without the toggle.
  const requested = thinkingLevelToReasoningEffort(thinkingLevel);
  if (!model?.reasoningEffortSupported) return null;
  if (!requested && !reasoning) return null;
  const efforts = model.reasoningOptions
    .map((option) => option.reasoningEffort)
    .filter((effort) => effort !== 'off');
  if (efforts.length === 0) return null;
  const wanted = requested ?? PREFERRED_REASONING_EFFORT;
  return efforts.includes(wanted) ? wanted : efforts[0];
}

/** The effort a reasoning-enabled generation asks for when the model offers it. */
const PREFERRED_REASONING_EFFORT = 'medium';

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
    const { workspaceId, selection, model, thinkingLevel, variant } = await resolveSmallModel(input);
    if (changed || getRuntimeKey() !== runtimeKey) throw new DOMException('Runtime changed', 'AbortError');
    input.signal?.throwIfAborted();
    if (!selection) throw new SmallModelUnavailableError('No background model available in the selected provider');
    owner = { workspaceId, completionId: crypto.randomUUID() };
    const request: CompletionRequest = {
      ...owner, selection, prompt: input.prompt, format: input.format ?? { kind: 'text' },
      overflow: input.overflow ?? 'truncate', variant, reasoningEffort: resolveReasoningEffort(input.reasoning, model, thinkingLevel),
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
