import { type Model, type Provider, type ProviderAuthState, type OmpSettingsState } from "@openchamber/agent-contract";
import { type ModelMetadata } from "@/types";
import { type VoiceApiKeyState, type VoiceApiKeyKind } from "@/lib/voiceKeysApi";
import { type UseBoundStore, type StoreApi } from "zustand";

export type ProviderModel = Model;
/** Canonical providers with their workspace models grouped for picker consumers. */
export type ProviderWithModelList = Provider & {
    models: Model[];
    canonicalAuth?: ProviderAuthState;
};
export type GitModelSelection = {
    providerId: string;
    modelId: string;
};
export type ProviderModelSelection = {
    providerId: string;
    modelId: string;
    variant?: string;
} | null;
type DirectoryDefaultSelection = {
    agentName: string | undefined;
    providerId: string;
    modelId: string;
    variant: string | undefined;
};
export type DefaultAgentModelSelection = {
    agentName: string | undefined;
    providerId?: string;
    modelId?: string;
    variant?: string;
};

// Root model preferences are independent of the subagent catalog.
// Discovery gaps preserve configured identifiers instead of choosing another model.
export interface DirectoryScopedConfig {
    providersLoaded?: boolean;
    providers: ProviderWithModelList[];
    /**
      * The full canonical model catalog for this directory, including models a
      * provider disabled. Settings pages assign model roles and commit-message
      * models from the whole catalog, so they read it here instead of fetching
      * a second copy of the same catalog the loader already read.
      */
    models: Model[];
    currentProviderId: string;
    currentModelId: string;
    currentVariant?: string | undefined;
    currentVariantSelection?: CurrentVariantSelection;
    currentAgentName: string | undefined;
    selectedProviderId: string;
    agentModelSelections: {
        [agentName: string]: {
            providerId: string;
            modelId: string;
        };
    };
    defaultProviders: {
        [key: string]: string;
    };
    selectionSource?: "auto" | "manual";
    // Whether the current agent was chosen for this chat (`setAgent`) rather
    // than resolved from defaults. Separate from `selectionSource`, which is
    // about the model: an agent pick keeps an inherited model inherited.
    agentSelectionSource?: "auto" | "manual";
}

/**
  * The thinking-effort selection, split into what the user picked and what
  * applies when they picked nothing:
  *
  * - `override: string`    an effort chosen in the picker
  * - `override: null`      "Default" chosen in the picker — send no effort
  * - `override: undefined` nothing chosen — the inherited default applies
  *
  * `null` and `undefined` are not interchangeable: collapsing them makes the
  * "Default" entry unpickable, because the settings default silently takes
  * effect again and the next assistant reply echoes it back as an explicit
  * choice.
  */
export type CurrentVariantSelection = {
    override: string | null | undefined;
    inherited: string | undefined;
};
export interface ConfigStore {
    catalogReloadRevision: number;
    activeDirectoryKey: string;
    directoryScoped: Record<string, DirectoryScopedConfig>;
    configRuntimeKey: string;
    providers: ProviderWithModelList[];
    /** The active directory's full canonical model catalog; see `DirectoryScopedConfig.models`. */
    models: Model[];
    providersLoaded: boolean;
    /** Workspace whose catalogs `providers` describes; empty before the first live load. */
    workspaceId: string;
    currentProviderId: string;
    currentModelId: string;
    currentVariant: string | undefined;
    currentReasoningEffort: string | undefined;
    currentVariantSelection: CurrentVariantSelection;
    currentAgentName: string | undefined;
    selectedProviderId: string;
    agentModelSelections: {
        [agentName: string]: {
            providerId: string;
            modelId: string;
        };
    };
    defaultProviders: {
        [key: string]: string;
    };
    selectionSource: "auto" | "manual";
    agentSelectionSource: "auto" | "manual";
    isConnected: boolean;
    hasEverConnected: boolean;
    connectionPhase: "connecting" | "connected" | "reconnecting";
    lastDisconnectReason: string | null;
    /** Why the last initializeApp attempt did not finish. Runtime-only; cleared on success. */
    lastInitFailure: InitFailure | null;
    isInitialized: boolean;
    modelsMetadata: Map<string, ModelMetadata>;
    // OMP's resolved default model role, plus the app's own default agent.
    settingsDefaultModel: string | undefined; // format: "provider/model", from the model catalog
    settingsDefaultsLoaded: boolean;
    /** OMP's configured thinking level for a new session; `auto` stays unset on the wire. */
    settingsDefaultReasoningEffort: string | undefined;
    // OpenCode server's own global `model` config field ("provider/model"), used as a fallback
    // when neither our settingsDefaultModel nor the resolved agent pins a model.
    settingsAutoCreateWorktree: boolean;
    settingsGitmojiEnabled: boolean;
    settingsDefaultFileViewerPreview: boolean;
    settingsZenModel: string | undefined;
    // Voice provider preference ('browser', 'openai', 'openai-compatible', or 'say' for macOS)
    voiceProvider: 'browser' | 'local' | 'openai' | 'openai-compatible' | 'say';
    setVoiceProvider: (provider: 'browser' | 'local' | 'openai' | 'openai-compatible' | 'say') => void;
    // TTS settings
    speechRate: number;
    speechPitch: number;
    speechVolume: number;
    sayVoice: string;
    browserVoice: string;
    localTtsVoiceId: number;
    /** Local TTS model the chosen voice belongs to (catalog id). */
    localTtsModelId: string;
    /** Local and macOS voices follow the language of the text being read. */
    ttsFollowTextLanguage: boolean;
    openaiVoice: string;
    /** Which voice API keys the server holds; the keys never reach the browser. */
    voiceApiKeys: VoiceApiKeyState;
    openaiCompatibleUrl: string;
    openaiCompatibleVoice: string;
    openaiCompatibleTtsModel: string;
    /** Optional resource path for the OpenAI-compatible speech endpoint. */
    openaiCompatibleTtsEndpointPath: string;
    // STT (dictation) settings
    dictationEnabled: boolean;
    dictationAutoSend: boolean;
    sttProvider: 'local' | 'openai-compatible';
    sttServerUrl: string;
    sttEndpointPath: string;
    sttModel: string;
    sttLocalModel: string;
    sttLanguage: string;
    sttCorrectTranscript: boolean;
    showMessageTTSButtons: boolean;
    autoReadAloudEnabled: boolean;
    ttsInputMode: 'sanitized' | 'raw' | 'summarized';
    ttsChunkedMode: boolean;
    // Summarization settings
    summarizeMessageTTS: boolean;
    summarizeVoiceConversation: boolean;
    summarizeCharacterThreshold: number;
    summarizeMaxLength: number;
    setSpeechRate: (rate: number) => void;
    setSpeechPitch: (pitch: number) => void;
    setSpeechVolume: (volume: number) => void;
    setSayVoice: (voice: string) => void;
    setBrowserVoice: (voice: string) => void;
    setLocalTtsVoiceId: (voiceId: number) => void;
    setLocalTtsModelId: (modelId: string) => void;
    setTtsFollowTextLanguage: (enabled: boolean) => void;
    setOpenaiVoice: (voice: string) => void;
    /** Store (string) or remove (null) one voice key on the server. Resolves false when the server refused. */
    setVoiceApiKey: (kind: VoiceApiKeyKind, apiKey: string | null) => Promise<boolean>;
    /**
      * Read which keys the server holds, moving any a previous build left in
      * the browser first. Once per runtime unless `force` (the Settings page).
      */
    refreshVoiceApiKeys: (options?: {
        force?: boolean;
    }) => Promise<void>;
    setOpenaiCompatibleUrl: (url: string) => void;
    setOpenaiCompatibleVoice: (voice: string) => void;
    setOpenaiCompatibleTtsModel: (model: string) => void;
    setOpenaiCompatibleTtsEndpointPath: (path: string) => void;
    setDictationEnabled: (enabled: boolean) => void;
    setDictationAutoSend: (enabled: boolean) => void;
    setSttProvider: (provider: 'local' | 'openai-compatible') => void;
    setSttServerUrl: (url: string) => void;
    setSttEndpointPath: (path: string) => void;
    setSttModel: (model: string) => void;
    setSttLocalModel: (model: string) => void;
    setSttLanguage: (lang: string) => void;
    setSttCorrectTranscript: (enabled: boolean) => void;
    setShowMessageTTSButtons: (show: boolean) => void;
    setAutoReadAloudEnabled: (enabled: boolean) => void;
    setTtsInputMode: (mode: 'sanitized' | 'raw' | 'summarized') => void;
    setTtsChunkedMode: (enabled: boolean) => void;
    setSummarizeMessageTTS: (enabled: boolean) => void;
    setSummarizeVoiceConversation: (enabled: boolean) => void;
    setSummarizeCharacterThreshold: (threshold: number) => void;
    setSummarizeMaxLength: (maxLength: number) => void;
    ompSettings: OmpSettingsState | null;
    loadOmpSettings: (workspaceId?: string) => Promise<OmpSettingsState | null>;
    activateDirectory: (directory: string | null | undefined, options?: {
        preserveManualModel?: boolean;
    }) => Promise<void>;

    /** `fresh`: a request already in flight started before the caller's reason to reload, so it cannot answer it. */
    loadProviders: (options?: {
        directory?: string | null;
        source?: string;
        fresh?: boolean;
    }) => Promise<void>;
    loadSessionDefaults: () => Promise<boolean>;
    invalidateModelMetadataCache: () => void;
    invalidateProviderCache: (directory?: string | null) => void;
    setProvider: (providerId: string) => void;
    setModel: (modelId: string) => void;
    setCurrentVariant: (variant: string | undefined) => void;
    setCurrentVariantOverride: (override: string | null | undefined, inherited: string | undefined) => void;
    setCurrentReasoningEffort: (effort: string | undefined) => void;
    cycleCurrentVariant: () => string | undefined;
    getCurrentModelVariants: () => string[];
    /** The effort the active project or Settings configures for this model; `undefined` for any model that is not a configured default. */
    getDefaultVariantForModel: (providerId: string, modelId: string) => string | undefined;
    /**
      * What a new session in `directory` should send its first message with:
      * the same cascade the composer resolves, read against that directory's
      * own catalog. Returns null when nothing resolves a model.
      */
    resolveDirectoryDefaultSelection: (directory: string) => Promise<DirectoryDefaultSelection | null>;
    /**
      * `keepModel` switches the agent alone. It is for following a switch the
      * session already made: OpenCode keeps a session on its own model when the
      * agent changes, so resolving the agent's model would show one the session
      * does not run on (and would replace Auto).
      */
    setAgent: (agentName: string | undefined, options?: {
        keepModel?: boolean;
    }) => void;
    applyDefaultModelAgentSelection: (options?: {
        projectDefaultModel?: string;
        projectDefaultVariant?: string;
    }) => void;
    /** Replaces an `openchamber/auto` selection this server cannot honour with the default model. */
    dropStaleAutoSelection: () => void;
    setSelectedProvider: (providerId: string) => void;
    setSettingsAutoCreateWorktree: (enabled: boolean) => void;
    setSettingsGitmojiEnabled: (enabled: boolean) => void;
    setSettingsDefaultFileViewerPreview: (enabled: boolean) => void;
    setSettingsZenModel: (model: string | undefined) => void;
    getResolvedGitGenerationModel: () => {
        providerId: string;
        modelId: string;
    } | null;
    saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => void;
    getAgentModelSelection: (agentName: string) => {
        providerId: string;
        modelId: string;
    } | null;
    probeConnection: (options?: {
        timeoutMs?: number;
    }) => Promise<boolean>;
    checkConnection: () => Promise<boolean>;
    initializeApp: () => Promise<void>;
    getCurrentProvider: () => ProviderWithModelList | undefined;
    getCurrentModel: () => ProviderModel | undefined;
    getModelMetadata: (providerId: string, modelId: string) => ModelMetadata | undefined;
}
declare global {
    interface Window {
        __zustand_config_store__?: UseBoundStore<StoreApi<ConfigStore>>;
    }
}
export type ConfigStoreWithPersist = UseBoundStore<StoreApi<ConfigStore>> & {
    persist: {
        hasHydrated: () => boolean;
        onFinishHydration: (callback: (state: ConfigStore) => void) => () => void;
        rehydrate: () => void | Promise<void>;
    };
};

/** The startup step that failed, with the underlying error text when one exists. */
export type InitFailure = {
    step: 'serverUnreachable' | 'agentServiceUnavailable' | 'loadAgents' | 'unexpected';
    message: string | null;
};
export type ConfigSet = import('zustand').StoreApi<ConfigStore>['setState'];
export type ConfigGet = () => ConfigStore;
export type ConfigSlice<K extends keyof ConfigStore> = (set: ConfigSet, get: ConfigGet) => Pick<ConfigStore, K>;
