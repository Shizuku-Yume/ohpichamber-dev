import { type Model, parseModelSelector } from "@openchamber/agent-contract";
import { type ProviderWithModelList, type ProviderModelSelection, type DefaultAgentModelSelection, type GitModelSelection, type CurrentVariantSelection, type ConfigStore, type DirectoryScopedConfig } from "./types";
import { isAutoModel } from "@/lib/routing/autoModel";
import { selectAutoReady, useRoutingStore } from "@/stores/useRoutingStore";
import { isStaleAutoSelection } from "./selectors";
import { type ModelRef } from "@/lib/settings/parsers";
import { useUIStore } from "@/stores/useUIStore";

const FALLBACK_PROVIDER_ID = "opencode";
const FALLBACK_MODEL_ID = "big-pickle";
// Sentinel selectedProviderId used by the providers UI while the "Add provider"
// form is open. It is intentionally not a real provider id and must not be
// persisted as a stable provider selection.

const GIT_UTILITY_PROVIDER_ID = "zen";
const GIT_UTILITY_PREFERRED_MODEL_ID = "big-pickle";
export const normalizeOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
};
export const findProviderModel = (providers: ProviderWithModelList[], providerId: string, modelId: string): Model | undefined => providers.find(provider => provider.providerId === providerId)?.models.find(model => model.modelId === modelId);
export const modelVariantIds = (model: Model | undefined): string[] => model?.variants.map(variant => variant.variant) ?? [];
export const modelHasVariant = (model: Model | undefined, variant: string | null | undefined): boolean => typeof variant === "string" && modelVariantIds(model).includes(variant);
export const hasProviderModel = (providers: ProviderWithModelList[], providerId: string, modelId: string): boolean => {
    if (isAutoModel(providerId, modelId)) return selectAutoReady(useRoutingStore.getState());
    return findProviderModel(providers, providerId, modelId) !== undefined;
};

/**
  * An `openchamber/auto` selection that this server cannot honour. Auto is a
  * valid choice only while the server says routing is available and ready;
  * a selection saved under another build (or before the token was removed)
  * must not be kept, or the sentinel would be sent to OpenCode as a model.
  * Unknown readiness (settings or the routing state not loaded yet) keeps the
  * selection, so a real Auto choice survives startup.
  */
export const resolveProviderModelSelection = ({
    providers,
    currentProviderId,
    currentModelId,
    currentVariant,
    preserveCurrent = false,
    settingsDefaultModel,
    defaultVariant,
    allowFallback,
    fallbackPrefs
}: {
    providers: ProviderWithModelList[];
    currentProviderId?: string;
    currentModelId?: string;
    currentVariant?: string;
    preserveCurrent?: boolean;
    settingsDefaultModel?: string;
    defaultVariant?: string;
    allowFallback: boolean;
    fallbackPrefs: FallbackModelPrefs;
}): ProviderModelSelection => {
    const resolveVariant = (providerId: string, modelId: string, variant?: string): string | undefined => {
        if (!variant) {
            return undefined;
        }
        return modelHasVariant(findProviderModel(providers, providerId, modelId), variant) ? variant : undefined;
    };
    const preserveManual = preserveCurrent && !isStaleAutoSelection(currentProviderId, currentModelId);
    if (currentProviderId && currentModelId && (preserveManual || hasProviderModel(providers, currentProviderId, currentModelId))) {
        return {
            providerId: currentProviderId,
            modelId: currentModelId,
            variant: preserveCurrent ? currentVariant : resolveVariant(currentProviderId, currentModelId, currentVariant)
        };
    }
    if (settingsDefaultModel) {
        const parsed = parseModelSelector(settingsDefaultModel);
        if (parsed && !isStaleAutoSelection(parsed.providerId, parsed.modelId)) {
            return {
                providerId: parsed.providerId,
                modelId: parsed.modelId,
                variant: hasProviderModel(providers, parsed.providerId, parsed.modelId) ? resolveVariant(parsed.providerId, parsed.modelId, defaultVariant) : defaultVariant
            };
        }
    }
    if (!allowFallback) return null;
    return resolveLastSelectedModel(fallbackPrefs) ?? resolveFallbackModel(providers, fallbackPrefs.hiddenModels);
};

/** What the automatic pick reads from the user's model preferences. */
type FallbackModelPrefs = {
    hiddenModels: readonly ModelRef[];
    lastSelectedModel: string | undefined;
};
export const readFallbackModelPrefs = (): FallbackModelPrefs => {
    const {
        hiddenModels,
        lastSelectedModel
    } = useUIStore.getState();
    return {
        hiddenModels,
        lastSelectedModel
    };
};
const isModelHidden = (hiddenModels: readonly ModelRef[], providerId: string, modelId: string): boolean => hiddenModels.some(hidden => hidden.providerID === providerId && hidden.modelID === modelId);

// The model last picked in a chat composer, once nothing configured names one.
// Like a configured default it survives catalog gaps: a provider that has not
// registered yet must not move a new session onto Big Pickle. A model hidden
// since, or an Auto pick this server cannot honour, is skipped.
const resolveLastSelectedModel = ({
    hiddenModels,
    lastSelectedModel
}: FallbackModelPrefs): {
    providerId: string;
    modelId: string;
} | null => {
    const parsed = lastSelectedModel ? parseModelSelector(lastSelectedModel) : null;
    if (!parsed) return null;
    if (isModelHidden(hiddenModels, parsed.providerId, parsed.modelId)) return null;
    if (isStaleAutoSelection(parsed.providerId, parsed.modelId)) return null;
    return parsed;
};

// The pick when nothing is configured or remembered: Big Pickle, else the first
// model. A model the user hid in the picker is skipped; configured defaults never
// come through here, so they stay honoured even when hidden. With every model
// hidden the conversation still needs one to send with, so the unfiltered pick stands.
const resolveFallbackModel = (providers: ProviderWithModelList[], hiddenModels: readonly ModelRef[]): {
    providerId: string;
    modelId: string;
} | null => {
    const isVisible = (providerId: string, modelId: string) => !isModelHidden(hiddenModels, providerId, modelId);
    const hasBigPickle = hasProviderModel(providers, FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID);
    if (hasBigPickle && isVisible(FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID)) {
        return {
            providerId: FALLBACK_PROVIDER_ID,
            modelId: FALLBACK_MODEL_ID
        };
    }
    for (const provider of providers) {
        const visibleModel = provider.models.find(model => isVisible(provider.providerId, model.modelId));
        if (visibleModel) {
            return {
                providerId: provider.providerId,
                modelId: visibleModel.modelId
            };
        }
    }
    if (hasBigPickle) {
        return {
            providerId: FALLBACK_PROVIDER_ID,
            modelId: FALLBACK_MODEL_ID
        };
    }
    const firstProvider = providers[0];
    const firstModel = firstProvider?.models[0];
    if (firstProvider && firstModel) {
        return {
            providerId: firstProvider.providerId,
            modelId: firstModel.modelId
        };
    }
    return null;
};
// Root model preferences are independent of the subagent catalog.
// Discovery gaps preserve configured identifiers instead of choosing another model.
export const resolveDefaultAgentModelSelection = ({
    providers,
    projectDefaultModel,
    projectDefaultVariant,
    settingsDefaultModel,
    allowFallback = true,
    fallbackPrefs
}: {
    providers: ProviderWithModelList[];
    projectDefaultModel?: string;
    projectDefaultVariant?: string;
    settingsDefaultModel?: string;
    allowFallback?: boolean;
    fallbackPrefs: FallbackModelPrefs;
}): DefaultAgentModelSelection => {
    const resolveVariant = (providerId: string, modelId: string, variant?: string): string | undefined => {
        if (!variant) {
            return undefined;
        }
        return modelHasVariant(findProviderModel(providers, providerId, modelId), variant) ? variant : undefined;
    };

    // --- Model cascade ---
    let providerId: string | undefined;
    let modelId: string | undefined;
    let variant: string | undefined;
    const effectiveDefaultModel = projectDefaultModel || settingsDefaultModel;
    if (effectiveDefaultModel) {
        const parsed = parseModelSelector(effectiveDefaultModel);
        if (parsed && !isStaleAutoSelection(parsed.providerId, parsed.modelId)) {
            providerId = parsed.providerId;
            modelId = parsed.modelId;
            // A project default carries its own route; OMP's default model has none.
            const configuredVariant = projectDefaultModel ? projectDefaultVariant : undefined;
            variant = hasProviderModel(providers, providerId, modelId) ? resolveVariant(providerId, modelId, configuredVariant) : configuredVariant;
        }
    }
    if (providerId || !allowFallback) {
        return {
            agentName: undefined,
            providerId,
            modelId,
            variant
        };
    }
    if (!providerId) {
        const fallback = resolveLastSelectedModel(fallbackPrefs) ?? resolveFallbackModel(providers, fallbackPrefs.hiddenModels);
        providerId = fallback?.providerId;
        modelId = fallback?.modelId;
    }
    return {
        agentName: undefined,
        providerId,
        modelId,
        variant
    };
};
export const resolveGitGenerationModelSelection = ({
    providers,
    settingsZenModel
}: {
    providers: ProviderWithModelList[];
    settingsZenModel?: string;
}): GitModelSelection | null => {
    const zenModel = normalizeOptionalString(settingsZenModel);
    if (!Array.isArray(providers) || providers.length === 0) {
        if (zenModel) {
            return {
                providerId: GIT_UTILITY_PROVIDER_ID,
                modelId: zenModel
            };
        }
        return null;
    }
    if (zenModel && hasProviderModel(providers, GIT_UTILITY_PROVIDER_ID, zenModel)) {
        return {
            providerId: GIT_UTILITY_PROVIDER_ID,
            modelId: zenModel
        };
    }
    if (hasProviderModel(providers, GIT_UTILITY_PROVIDER_ID, GIT_UTILITY_PREFERRED_MODEL_ID)) {
        return {
            providerId: GIT_UTILITY_PROVIDER_ID,
            modelId: GIT_UTILITY_PREFERRED_MODEL_ID
        };
    }
    const zenProvider = providers.find(provider => provider.providerId === GIT_UTILITY_PROVIDER_ID);
    if (zenProvider?.models.length) {
        const randomIndex = Math.floor(Math.random() * zenProvider.models.length);
        const randomModelId = normalizeOptionalString(zenProvider.models[randomIndex]?.modelId);
        if (randomModelId) {
            return {
                providerId: GIT_UTILITY_PROVIDER_ID,
                modelId: randomModelId
            };
        }
    }
    return null;
};
/**
  * The effort configured next to a default model applies to that model only:
  * the project's for the project model, the settings one for the settings
  * model. Any other model starts on its own default, so an effort chosen for
  * one model never follows the user onto the next.
  */
export const resolveConfiguredDefaultVariant = (defaults: {
    projectDefaultModel?: string;
    projectDefaultVariant?: string;
    settingsDefaultModel?: string;
    settingsDefaultVariant?: string;
}, providerId: string, modelId: string): string | undefined => {
    const isThisModel = (model: string | undefined) => {
        const parsed = model ? parseModelSelector(model) : null;
        return parsed?.providerId === providerId && parsed.modelId === modelId;
    };
    if (isThisModel(defaults.projectDefaultModel)) return defaults.projectDefaultVariant;
    if (isThisModel(defaults.settingsDefaultModel)) return defaults.settingsDefaultVariant;
    return undefined;
};
export const resolveVariantFromSelection = (selection: CurrentVariantSelection): string | undefined => selection.override === null ? undefined : selection.override ?? selection.inherited;
/**
  * The effort the next send carries after a loader resolved `resolved` for the
  * model: a pick kept in `selection` wins. Loaders that kept the pick in
  * `currentVariantSelection` but wrote the resolved default to `currentVariant`
  * showed one effort in the picker and sent another.
  */
export const variantAfterResolve = (selection: CurrentVariantSelection | undefined, resolved: string | undefined): string | undefined => selection?.override === undefined ? resolved : resolveVariantFromSelection(selection);

/**
  * Lift the active directory's snapshot into the top-level fields the pickers
  * read (`providers` and selections). Persisted snapshots carry no
  * catalogs, so this restores selections; a blob from before that change still
  * has catalogs, and those paint instantly. Falls back to whatever top-level
  * data was persisted; handles legacy blobs that only stored directoryScoped.
  */
const SELECTION_FIELDS = ["currentProviderId", "currentModelId", "currentAgentName", "selectionSource", "agentSelectionSource"] as const;
type SelectionField = typeof SELECTION_FIELDS[number];

/**
  * Whether writing `next` would leave both the top-level selection and the
  * active directory's snapshot as they are. The persist middleware writes the
  * whole store after every `set()`, even one whose updater returns the same
  * state. A setter checks for a change before it calls `set()` to avoid an
  * unnecessary durable write. A missing snapshot is a change: the write would create it.
  */
export const isUnchangedSelection = (state: Pick<ConfigStore, "activeDirectoryKey" | "directoryScoped" | SelectionField>, next: Partial<Pick<DirectoryScopedConfig, SelectionField>>): boolean => {
    const snapshot = state.directoryScoped[state.activeDirectoryKey];
    if (!snapshot) return false;
    return SELECTION_FIELDS.every(field => !(field in next) || next[field] === state[field] && next[field] === snapshot[field]);
};

/**
  * An effort is chosen for one model, so a change of model drops it, an
  * explicit "Default" included. The composer then resolves the new model's own
  * effort: the one this session saved for it, else its configured default.
  */
export const variantResetForModelChange = (state: Pick<ConfigStore, "currentProviderId" | "currentModelId">, providerId: string, modelId: string): Partial<Pick<DirectoryScopedConfig, "currentVariant" | "currentVariantSelection">> => state.currentProviderId === providerId && state.currentModelId === modelId ? {} : {
    currentVariant: undefined,
    currentVariantSelection: {
        override: undefined,
        inherited: undefined
    }
};
