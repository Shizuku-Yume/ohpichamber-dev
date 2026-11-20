import { canonicalClient } from "@/api/canonicalClient";
import { type ConfigSlice } from "./types";
import { captureConfigRuntimeContext, isConfigRuntimeContextCurrent } from "./runtime";
import { markStartupTrace, measureStartupTrace } from "@/lib/startupTrace";
import { streamDebugEnabled } from "@/stores/utils/streamDebug";
import { hostFilesystem } from "@/lib/host-filesystem";
import { useDirectoryStore } from "@/stores/useDirectoryStore";
import { fromDirectoryKey, resolveConfigDirectory, toDirectoryKey } from "./directories";
import { resolveProjectForSessionDirectory } from "@/lib/projectResolution";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { resolveProjectDirectory } from "./worktreeProjects";
import { getFallbackProjectDirectory } from "./projectDefaults";
import { hydrateConfigCatalogFromCache } from "./catalogHydration";
import { useAgentsStore, selectAgentsForDirectory } from "@/stores/useAgentsStore";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const CONNECTION_PROBE_TIMEOUT_MS = 800;
// The Agent Service readiness route can wait for the supervised worker to settle.
const CONNECTION_HEALTH_WAIT_MS = 3_000;
type AgentServiceReadiness = 'ready' | 'unavailable' | 'unreachable';
const probeAgentServiceReadiness = async (timeoutMs = CONNECTION_PROBE_TIMEOUT_MS): Promise<AgentServiceReadiness> => {
    return Promise.race([canonicalClient.checkReady().then(ready => ready ? 'ready' : 'unavailable').catch(() => 'unreachable' as const), sleep(Math.max(1, timeoutMs)).then(() => 'unreachable' as const)]);
};
let _initializeAppInFlight: Promise<void> | null = null;

/**
  * Providers of one project. Returns a stored array, so components can select it
  * directly and re-render only when that project's list is replaced.
  *
  * Settings pages browse a project the app is not on; everything else wants the
  * active one, which is what a missing directory resolves to, as in
  * `loadProviders`. Settings has none when no project is added, and nothing
  * loads a catalog without a directory.
  */
/**
  * The configured model pair that describes one directory's sessions. Only the
  * active directory's pair is the live composer pair; a cached snapshot's pair
  * is that directory's own, so a readout never borrows another directory's
  * configuration. The boolean lets a caller tell those two sources apart.
  */
export const resetConfigInitialization = (): void => {
    _initializeAppInFlight = null;
};
export const createConfigConnection: ConfigSlice<"probeConnection" | "checkConnection" | "initializeApp"> = (set, get) => ({
    probeConnection: async (options?: {
        timeoutMs?: number;
    }) => {
        const isHealthy = (await probeAgentServiceReadiness(options?.timeoutMs)) === 'ready';
        if (isHealthy) {
            set({
                isConnected: true,
                hasEverConnected: true,
                connectionPhase: "connected"
            });
            return true;
        }
        const state = get();
        if (state.isConnected) {
            return true;
        }
        set({
            isConnected: false,
            connectionPhase: state.hasEverConnected ? "reconnecting" : "connecting",
            lastDisconnectReason: 'health_probe_unhealthy'
        });
        return false;
    },
    checkConnection: async () => {
        const runtimeContext = captureConfigRuntimeContext();
        markStartupTrace('checkConnection:start');
        const maxAttempts = 5;
        let attempt = 0;
        let lastError: unknown = null;
        let lastProbe: AgentServiceReadiness = 'unreachable';
        while (attempt < maxAttempts) {
            if (!isConfigRuntimeContextCurrent(runtimeContext)) return false;
            try {
                markStartupTrace('checkConnection:attempt', {
                    attempt: attempt + 1
                });
                const probeStarted = Date.now();
                lastProbe = await measureStartupTrace('checkConnection:agent-service', () => probeAgentServiceReadiness(CONNECTION_HEALTH_WAIT_MS), {
                    attempt: attempt + 1
                });
                const isHealthy = lastProbe === 'ready';
                if (!isConfigRuntimeContextCurrent(runtimeContext)) return false;
                if (!isHealthy && attempt < maxAttempts - 1) {
                    const hasEverConnected = get().hasEverConnected;
                    set({
                        isConnected: false,
                        connectionPhase: hasEverConnected ? "reconnecting" : "connecting",
                        lastDisconnectReason: 'health_check_unhealthy'
                    });
                    attempt += 1;
                    // A host that held the answer has already waited; one that
                    // answered at once (an older host or an unreachable
                    // server) keeps the old pacing.
                    await sleep(Math.max(0, 400 * attempt - (Date.now() - probeStarted)));
                    continue;
                }
                const hasEverConnected = get().hasEverConnected;
                set(isHealthy ? {
                    isConnected: true,
                    hasEverConnected: true,
                    connectionPhase: "connected"
                } : {
                    isConnected: false,
                    connectionPhase: hasEverConnected ? "reconnecting" : "connecting",
                    lastDisconnectReason: lastProbe === 'unreachable' ? 'health_check_failed' : 'health_check_unhealthy'
                });
                markStartupTrace('checkConnection:end', {
                    healthy: isHealthy,
                    attempts: attempt + 1
                });
                return isHealthy;
            } catch (error) {
                lastError = error;
                attempt += 1;
                const delay = 400 * attempt;
                await sleep(delay);
            }
        }
        if (!isConfigRuntimeContextCurrent(runtimeContext)) return false;
        if (lastError) {
            console.warn("[ConfigStore] Failed to reach Agent Service after retrying:", lastError);
        }
        set({
            isConnected: false,
            connectionPhase: get().hasEverConnected ? "reconnecting" : "connecting",
            lastDisconnectReason: 'health_check_failed'
        });
        markStartupTrace('checkConnection:end', {
            healthy: false,
            attempts: maxAttempts
        });
        return false;
    },
    initializeApp: async () => {
        if (_initializeAppInFlight) {
            markStartupTrace('initializeApp:deduped');
            return _initializeAppInFlight;
        }
        const runtimeContext = captureConfigRuntimeContext();
        const run = (async () => {
            const initStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
            markStartupTrace('initializeApp:start');
            try {
                const debug = streamDebugEnabled();
                if (debug) console.log("Starting app initialization...");

                // OpenChamber preferences do not depend on OpenCode health
                // or project discovery. Publish a known choice immediately.
                void get().loadSessionDefaults();
                const isConnected = await get().checkConnection();
                if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                if (debug) console.log("Connection check result:", isConnected);
                if (!isConnected) {
                    if (debug) console.log("Server not connected");
                    // checkConnection already set lastDisconnectReason; do not overwrite.
                    set({
                        isConnected: false,
                        connectionPhase: get().hasEverConnected ? "reconnecting" : "connecting",
                        lastInitFailure: {
                            step: get().lastDisconnectReason === 'health_check_unhealthy' ? 'agentServiceUnavailable' : 'serverUnreachable',
                            message: null
                        }
                    });
                    return;
                }
                if (debug) console.log("Initializing app...");
                markStartupTrace('initApp:skipped', {
                    reason: 'checkConnection already verified health'
                });

                // Catalog owners preserve their last valid workspace snapshot on failure.
                const initialDirectory = hostFilesystem.getDirectory() ?? useDirectoryStore.getState().currentDirectory ?? fromDirectoryKey(get().activeDirectoryKey);
                const resolvedProject = resolveProjectForSessionDirectory(useProjectsStore.getState().projects, useSessionUIStore.getState().availableWorktreesByProject, initialDirectory ?? null);
                const resolvedInitialDirectory = resolvedProject || resolveProjectDirectory(initialDirectory) ? resolveConfigDirectory(initialDirectory) : null;
                const configDirectory = resolvedInitialDirectory ?? getFallbackProjectDirectory();
                if (!configDirectory) {
                    markStartupTrace('initializeApp:noProjectConfigDirectory');
                    set({
                        isInitialized: true,
                        isConnected: true,
                        hasEverConnected: true,
                        connectionPhase: "connected",
                        lastInitFailure: null
                    });
                    return;
                }
                if (!resolvedInitialDirectory && initialDirectory !== configDirectory) {
                    markStartupTrace('initializeApp:normalizedUnknownDirectoryToProject', {
                        initialDirectory,
                        configDirectory
                    });
                    hostFilesystem.setDirectory(configDirectory);
                    useDirectoryStore.getState().setDirectory(configDirectory, {
                        showOverlay: false
                    });
                }
                const configDirectoryKey = toDirectoryKey(configDirectory);
                if (get().activeDirectoryKey !== configDirectoryKey) {
                    set({
                        activeDirectoryKey: configDirectoryKey,
                        workspaceId: ""
                    });
                    void hydrateConfigCatalogFromCache(configDirectoryKey);
                }
                if (debug) console.log("Loading providers and agents...");
                await Promise.all([get().loadProviders({
                    directory: configDirectory,
                    source: 'initializeApp'
                }), useAgentsStore.getState().loadAgents(configDirectory)]);
                if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                if (!useSessionUIStore.getState().currentSessionId && get().selectionSource === 'auto' && get().agentSelectionSource === 'auto' && get().currentVariantSelection.override === undefined) {
                    get().applyDefaultModelAgentSelection();
                }
                set({
                    isInitialized: true,
                    isConnected: true,
                    hasEverConnected: true,
                    connectionPhase: "connected",
                    lastInitFailure: null
                });
                const initEnded = typeof performance !== 'undefined' ? performance.now() : Date.now();
                markStartupTrace('initializeApp:end', {
                    durationMs: Math.round(initEnded - initStarted),
                    providers: get().providers.length,
                    agents: selectAgentsForDirectory(useAgentsStore.getState(), configDirectory).length
                });
                if (debug) console.log("App initialized successfully");
            } catch (error) {
                if (!isConfigRuntimeContextCurrent(runtimeContext)) return;
                console.error("Failed to initialize app:", error);
                set({
                    isInitialized: false,
                    isConnected: false,
                    connectionPhase: get().hasEverConnected ? "reconnecting" : "connecting",
                    lastDisconnectReason: 'init_error',
                    lastInitFailure: {
                        step: 'unexpected',
                        message: (error instanceof Error ? error.message : String(error)) || null
                    }
                });
                markStartupTrace('initializeApp:error', {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        })().finally(() => {
            if (_initializeAppInFlight === run) _initializeAppInFlight = null;
        });
        _initializeAppInFlight = run;
        return run;
    }
});
