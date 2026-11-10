import { recordStartupPerformance } from './startup-performance.js';
import { isExecutable } from './executable.js';

export const createStartupPipelineRuntime = (dependencies) => {
  const {
    createTerminalRuntime,
    createDictationRuntime,
    createMessageStreamWsRuntime,
    createServerStartupRuntime,
  } = dependencies;

  const run = async (options) => {
    const pipelineStartedAt = performance.now();
    recordStartupPerformance('web.pipeline.start');
    const {
      app,
      server,
      express,
      fs,
      path,
      uiAuthController,
      buildAugmentedPath,
      searchPathFor,
      isRequestOriginAllowed,
      rejectWebSocketUpgrade,
      globalEventHub,
      messageStreamWsClients,
      terminalHeartbeatIntervalMs,
      terminalRebindWindowMs,
      terminalMaxRebindsPerWindow,
      environmentRuntime = null,
<<<<<<< HEAD:packages/web/server/lib/host/startup-pipeline-runtime.js
      startAgentService,
=======
      broadcastUiEvent,
      setupProxy,
      scheduleOpenCodeApiDetection,
      bootstrapOpenCodeAtStartup,
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/startup-pipeline-runtime.js
      onListenerReady = null,
      staticRoutesRuntime,
      process,
      crypto,
      normalizeTunnelBootstrapTtlMs,
      readSettingsFromDiskMigrated,
      tunnelAuthController,
      startTunnelWithNormalizedRequest,
      gracefulShutdown,
      getSignalsAttached,
      setSignalsAttached,
      syncToHmrState,
      TUNNEL_MODE_QUICK,
      TUNNEL_MODE_MANAGED_LOCAL,
      TUNNEL_MODE_MANAGED_REMOTE,
      host,
      port,
      startupTunnelRequest,
      onTunnelReady,
      tunnelRuntimeContext,
      attachSignals,
      apiOnly,
      dictationModelsDir,
      broadcastUiEvent,
    } = options;

    const terminalRuntime = createTerminalRuntime({
      app,
      server,
      express,
      fs,
      path,
      uiAuthController,
      buildAugmentedPath,
      searchPathFor,
      isExecutable,
      isRequestOriginAllowed,
      rejectWebSocketUpgrade,
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: terminalHeartbeatIntervalMs,
      TERMINAL_INPUT_WS_REBIND_WINDOW_MS: terminalRebindWindowMs,
      TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW: terminalMaxRebindsPerWindow,
      environmentRuntime,
<<<<<<< HEAD:packages/web/server/lib/host/startup-pipeline-runtime.js
      // Session create/close/kill is authoritative on the Host, so the UI
      // hears about it instead of rediscovering terminals on the next focus.
=======
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/startup-pipeline-runtime.js
      broadcastUiEvent,
    });

    const dictationRuntime = createDictationRuntime({
      app,
      server,
      express,
      uiAuthController,
      isRequestOriginAllowed,
      rejectWebSocketUpgrade,
      modelsDir: dictationModelsDir,
    });

    const messageStreamRuntime = createMessageStreamWsRuntime({
      server,
      uiAuthController,
      isRequestOriginAllowed,
      rejectWebSocketUpgrade,
      globalEventHub,
      wsClients: messageStreamWsClients,
    });


    if (apiOnly) {
      staticRoutesRuntime.registerApiOnlyFallbackRoutes(app);
    } else {
      staticRoutesRuntime.registerStaticRoutes(app);
    }

    const serverStartupRuntime = createServerStartupRuntime({
      process,
      crypto,
      server,
      normalizeTunnelBootstrapTtlMs,
      readSettingsFromDiskMigrated,
      tunnelAuthController,
      startTunnelWithNormalizedRequest,
      gracefulShutdown,
      getSignalsAttached,
      setSignalsAttached,
      syncToHmrState,
      TUNNEL_MODE_QUICK,
      TUNNEL_MODE_MANAGED_LOCAL,
      TUNNEL_MODE_MANAGED_REMOTE,
    });

    const bindHost = serverStartupRuntime.resolveBindHost(host);
    const startupResult = await serverStartupRuntime.startListeningAndMaybeTunnel({
      port,
      bindHost,
      startupTunnelRequest,
      onTunnelReady,
    });
    recordStartupPerformance('web.listener.ready', {
      durationMs: performance.now() - pipelineStartedAt,
    });
    tunnelRuntimeContext.setActivePort(startupResult.activePort);
    if (onListenerReady) await onListenerReady();
    serverStartupRuntime.attachProcessHandlers({ attachSignals });
    void startAgentService();

    return {
      terminalRuntime,
      dictationRuntime,
      messageStreamRuntime,
    };
  };

  return {
    run,
  };
};
