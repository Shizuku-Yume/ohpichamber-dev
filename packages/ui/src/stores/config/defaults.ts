import { type ConfigRuntimeContext, isSameConfigRuntimeContext, isConfigRuntimeContextCurrent, captureConfigRuntimeContext } from "./runtime";
import { type DesktopSettings } from "@/lib/desktop";
import { markStartupTrace } from "@/lib/startupTrace";
import { loadDesktopSettings } from "@/lib/persistence";
import { type ConfigSlice, type ConfigStore } from "./types";
import { getProjectDefaultsForConfigDirectory } from "./projectDefaults";
import { fromDirectoryKey } from "./directories";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { resolveGitGenerationModelSelection } from "./selectionResolution";
import { canonicalClient } from "@/api/canonicalClient";

interface OpenChamberDefaults {
    autoCreateWorktree?: boolean;
    gitmojiEnabled?: boolean;
    defaultFileViewerPreview?: boolean;
    zenModel?: string;
    dictationEnabled?: boolean;
    dictationAutoSend?: boolean;
    sttProvider?: 'local' | 'openai-compatible';
    sttServerUrl?: string;
    sttEndpointPath?: string;
    sttModel?: string;
    sttLocalModel?: string;
    sttLanguage?: string;
    sttCorrectTranscript?: boolean;
}

// Directory activation re-reads the OpenChamber defaults, which are global,
// not per directory: one request serves the switches that land inside this
// window, and concurrent activations share the in-flight one.
const OPENCHAMBER_DEFAULTS_FRESH_MS = 15_000;
let openChamberDefaultsCache: {
    at: number;
    context: ConfigRuntimeContext;
    request: Promise<OpenChamberDefaults | null>;
} | null = null;
export const invalidateOpenChamberDefaultsCache = (): void => {
    openChamberDefaultsCache = null;
};
const fetchOpenChamberDefaults = (context: ConfigRuntimeContext): Promise<OpenChamberDefaults | null> => {
    const now = Date.now();
    if (openChamberDefaultsCache && isSameConfigRuntimeContext(openChamberDefaultsCache.context, context) && now - openChamberDefaultsCache.at < OPENCHAMBER_DEFAULTS_FRESH_MS) {
        return openChamberDefaultsCache.request;
    }
    const request = requestOpenChamberDefaults(context);
    const cacheEntry = {
        at: now,
        context,
        request
    };
    openChamberDefaultsCache = cacheEntry;
    void request.then(result => {
        // A failed settings read must not become a 15-second authoritative
        // empty result. The next directory activation should retry it.
        if (result === null && openChamberDefaultsCache === cacheEntry) {
            openChamberDefaultsCache = null;
        }
    }).catch(() => {
        if (openChamberDefaultsCache === cacheEntry) openChamberDefaultsCache = null;
    });
    return request;
};
const toOpenChamberDefaults = (data: DesktopSettings): OpenChamberDefaults => {
    const zenModel = data.zenModel ?? '';
    return {
        autoCreateWorktree: data.autoCreateWorktree,
        gitmojiEnabled: data.gitmojiEnabled,
        defaultFileViewerPreview: data.defaultFileViewerPreview,
        zenModel: zenModel.length > 0 ? zenModel : undefined,
        dictationEnabled: data.dictationEnabled,
        dictationAutoSend: data.dictationAutoSend,
        sttProvider: data.sttProvider,
        sttServerUrl: data.sttServerUrl,
        sttEndpointPath: data.sttEndpointPath,
        sttModel: data.sttModel,
        sttLocalModel: data.sttLocalModel,
        sttLanguage: data.sttLanguage,
        sttCorrectTranscript: data.sttCorrectTranscript
    };
};
const requestOpenChamberDefaults = async (context: ConfigRuntimeContext): Promise<OpenChamberDefaults | null> => {
    markStartupTrace('config.defaults:start');
    const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const finish = (source: string, result: OpenChamberDefaults | null) => {
        const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
        markStartupTrace('config.defaults:end', {
            source,
            durationMs: Math.round(ended - started)
        });
        return result;
    };
    try {
        const data = await loadDesktopSettings();
        if (!isConfigRuntimeContextCurrent(context)) {
            return finish('stale', null);
        }
        if (!data) {
            return finish('settings-unavailable', null);
        }
        return finish('settings', toOpenChamberDefaults(data));
    } catch (error) {
        markStartupTrace('config.defaults:error', {
            error: error instanceof Error ? error.message : String(error)
        });
        return finish('error', null);
    }
};
export const createSettingsDefaults: ConfigSlice<"loadSessionDefaults" | "setSettingsAutoCreateWorktree" | "setSettingsGitmojiEnabled" | "setSettingsDefaultFileViewerPreview" | "setSettingsZenModel" | "getResolvedGitGenerationModel" | "loadOmpSettings"> = (set, get) => ({
    loadSessionDefaults: async () => {
        const runtimeContext = captureConfigRuntimeContext();
        const defaults = await fetchOpenChamberDefaults(runtimeContext);
        if (!isConfigRuntimeContextCurrent(runtimeContext) || !defaults) return false;
        set(state => {
            const next: Partial<ConfigStore> = {
                configRuntimeKey: runtimeContext.runtimeKey,
                settingsDefaultsLoaded: true,
                settingsAutoCreateWorktree: defaults.autoCreateWorktree ?? false,
                settingsGitmojiEnabled: defaults.gitmojiEnabled ?? false,
                settingsDefaultFileViewerPreview: defaults.defaultFileViewerPreview ?? true,
                settingsZenModel: defaults.zenModel,
                dictationEnabled: typeof defaults.dictationEnabled === 'boolean' ? defaults.dictationEnabled : state.dictationEnabled,
                dictationAutoSend: defaults.dictationAutoSend ?? state.dictationAutoSend,
                sttProvider: defaults.sttProvider ?? state.sttProvider,
                sttServerUrl: defaults.sttServerUrl ?? state.sttServerUrl,
                sttEndpointPath: defaults.sttEndpointPath ?? state.sttEndpointPath,
                sttModel: defaults.sttModel ?? state.sttModel,
                sttLocalModel: defaults.sttLocalModel ?? state.sttLocalModel,
                sttLanguage: defaults.sttLanguage ?? state.sttLanguage,
                sttCorrectTranscript: defaults.sttCorrectTranscript ?? state.sttCorrectTranscript
            };
            return next;
        });
        const state = get();
        const projectDefaults = getProjectDefaultsForConfigDirectory(fromDirectoryKey(state.activeDirectoryKey));
        // An effort picked while the settings document was still loading
        // is a choice too; re-applying the defaults would clear it.
        if (!useSessionUIStore.getState().currentSessionId && state.selectionSource === 'auto' && state.agentSelectionSource === 'auto' && state.currentVariantSelection.override === undefined) {
            state.applyDefaultModelAgentSelection(projectDefaults);
        }
        markStartupTrace('config.defaults:published');
        return true;
    },
    setSettingsAutoCreateWorktree: (enabled: boolean) => {
        set({
            settingsAutoCreateWorktree: enabled
        });
    },
    setSettingsGitmojiEnabled: (enabled: boolean) => {
        set({
            settingsGitmojiEnabled: enabled
        });
    },
    setSettingsDefaultFileViewerPreview: (enabled: boolean) => {
        set({
            settingsDefaultFileViewerPreview: enabled
        });
    },
    setSettingsZenModel: (model: string | undefined) => {
        set({
            settingsZenModel: model
        });
    },
    getResolvedGitGenerationModel: () => {
        const state = get();
        return resolveGitGenerationModelSelection({
            providers: state.providers,
            settingsZenModel: state.settingsZenModel
        });
    },
    loadOmpSettings: async (targetWorkspaceId?: string) => {
        const wid = targetWorkspaceId || get().workspaceId;
        if (!wid) return null;
        try {
            const settings = await canonicalClient.getOmpSettings(wid);
            set({
                ompSettings: settings
            });
            return settings;
        } catch {
            return null;
        }
    }
});
