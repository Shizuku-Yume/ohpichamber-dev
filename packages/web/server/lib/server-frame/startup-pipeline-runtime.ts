import type * as nodeCrypto from 'node:crypto';
import type { Server } from 'node:http';
import type * as nodePath from 'node:path';
import type { Duplex } from 'node:stream';
import type { createDictationRuntime as CreateDictationRuntime, DictationRuntimeDependencies } from '../dictation/runtime.js';
import { recordStartupPerformance } from '../diagnostics/startup-performance.js';
import type { createEnvironmentRuntime } from '../environment/runtime.js';
import type { createMessageStreamWsRuntime as CreateMessageStreamWsRuntime } from '../event-stream/index.js';
import type { GlobalMessageStreamHub } from '../event-stream/global-hub.js';
import type { StreamSocket } from '../event-stream/contracts.js';
import { isExecutable } from '../host/executable.js';
import type { RequestOriginChecker } from '../security/request-security.js';
import type { Application, ExpressFactory } from '../shared/http-contracts.js';
import type { createTerminalRuntime as CreateTerminalRuntime, TerminalRuntimeOptions } from '../terminal/runtime.js';
import type { createTunnelAuth } from '../tunnels/tunnel-auth.js';
import type { TunnelRoutesDependencies } from '../tunnels/routes.js';
import type { createUiAuth } from '../ui-auth/ui-auth.js';
import type { createServerStartupRuntime as CreateServerStartupRuntime, ListenOptions, ServerStartupDependencies } from './server-startup-runtime.js';
import type { createStaticRoutesRuntime } from './static-routes-runtime.js';

export interface StartupPipelineDependencies {
  createTerminalRuntime: typeof CreateTerminalRuntime;
  createDictationRuntime: typeof CreateDictationRuntime;
  createMessageStreamWsRuntime: typeof CreateMessageStreamWsRuntime;
  createServerStartupRuntime: typeof CreateServerStartupRuntime;
}

export interface StartupPipelineOptions {
  app: Application;
  server: Server;
  express: ExpressFactory;
  fs: TerminalRuntimeOptions['fs'];
  path: Pick<typeof nodePath, 'join' | 'resolve'>;
  uiAuthController?: ReturnType<typeof createUiAuth> | null;
  tunnelAuthController: ReturnType<typeof createTunnelAuth>;
  buildAugmentedPath: () => string;
  searchPathFor: TerminalRuntimeOptions['searchPathFor'];
  isRequestOriginAllowed: RequestOriginChecker;
  rejectWebSocketUpgrade: (socket: Duplex, statusCode: number, reason: string) => void;
  globalEventHub: GlobalMessageStreamHub;
  messageStreamWsClients: Set<StreamSocket>;
  terminalHeartbeatIntervalMs: number;
  environmentRuntime?: ReturnType<typeof createEnvironmentRuntime> | null;
  startAgentService: () => void | Promise<void>;
  onListenerReady?: (() => void | Promise<void>) | null;
  staticRoutesRuntime: ReturnType<typeof createStaticRoutesRuntime>;
  process: ServerStartupDependencies['process'];
  crypto: typeof nodeCrypto;
  normalizeTunnelBootstrapTtlMs: TunnelRoutesDependencies['normalizeTunnelBootstrapTtlMs'];
  readSettingsFromDiskMigrated: TunnelRoutesDependencies['readSettingsFromDiskMigrated'];
  startTunnelWithNormalizedRequest: ServerStartupDependencies['startTunnelWithNormalizedRequest'];
  gracefulShutdown: ServerStartupDependencies['gracefulShutdown'];
  getSignalsAttached: ServerStartupDependencies['getSignalsAttached'];
  setSignalsAttached: ServerStartupDependencies['setSignalsAttached'];
  syncToHmrState: ServerStartupDependencies['syncToHmrState'];
  TUNNEL_MODE_QUICK: string;
  TUNNEL_MODE_MANAGED_LOCAL: string;
  TUNNEL_MODE_MANAGED_REMOTE: string;
  host: string | undefined;
  port: number;
  startupTunnelRequest: ListenOptions['startupTunnelRequest'];
  onTunnelReady: ListenOptions['onTunnelReady'];
  tunnelRuntimeContext: { setActivePort: (port: number) => void };
  attachSignals: boolean;
  apiOnly: boolean;
  dictationModelsDir: DictationRuntimeDependencies['modelsDir'];
  broadcastUiEvent?: TerminalRuntimeOptions['broadcastUiEvent'];
}

export const createStartupPipelineRuntime = (dependencies: StartupPipelineDependencies) => {
  const {
    createTerminalRuntime,
    createDictationRuntime,
    createMessageStreamWsRuntime,
    createServerStartupRuntime,
  } = dependencies;

  const run = async (options: StartupPipelineOptions) => {
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
      environmentRuntime = null,
      startAgentService,
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
      fs,
      path,
      uiAuthController,
      tunnelAuthController,
      buildAugmentedPath,
      searchPathFor,
      isExecutable,
      isRequestOriginAllowed,
      rejectWebSocketUpgrade,
      TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS: terminalHeartbeatIntervalMs,
      environmentRuntime,
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
