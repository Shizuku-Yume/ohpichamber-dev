import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import { isBoolean } from '../shared/object-guards.js';

type Cleanup = () => void | Promise<void | object>;
type Stop = { stop: Cleanup };
type OptionalStop = Partial<Stop> | null;
type Close = { close: Cleanup };
type Timer = ReturnType<typeof setInterval>;

export interface ShutdownOptions {
  exitProcess?: boolean;
}

interface ShutdownDependencies {
  process: Pick<NodeJS.Process, 'exit'>;
  shutdownTimeoutMs: number;
  getExitOnShutdown: () => boolean;
  getIsShuttingDown: () => boolean;
  setIsShuttingDown: (value: boolean) => void;
  syncToHmrState: Cleanup;
  openCodeWatcherRuntime: Stop;
  chatDirectoryCleanupRuntime?: Stop | null;
  sessionRuntime: { dispose: Cleanup };
  sessionAssistRuntime?: OptionalStop;
  sessionWorkRuntime?: OptionalStop;
  sessionGoalRuntime?: OptionalStop;
  contextObligatoryRuntime?: OptionalStop;
  sessionWarmingRuntime?: OptionalStop;
  sessionTodosRuntime?: OptionalStop;
  autoReviewRuntime?: OptionalStop;
  prWatchRuntime?: OptionalStop;
  extensionWaitsRuntime?: OptionalStop;
  mergeFollowRuntime?: OptionalStop;
  messageQueueRuntime?: OptionalStop;
  dispatchResultsRuntime?: OptionalStop;
  workflowRuntime?: { shutdown: Cleanup } | null;
  messageSearchRuntime?: OptionalStop;
  scheduledTasksRuntime?: OptionalStop;
  getHealthCheckInterval: () => Timer | null;
  clearHealthCheckInterval: (value: Timer) => void;
  getTerminalRuntime: () => { shutdown: Cleanup } | null;
  setTerminalRuntime: (value: null) => void;
  getMessageStreamRuntime: () => Close | null;
  setMessageStreamRuntime: (value: null) => void;
  shouldSkipOpenCodeStop: () => boolean;
  getOpenCodePort: () => number | null;
  getOpenCodeProcess: () => Close | null;
  setOpenCodeProcess: (value: null) => void;
  killProcessOnPort: (port: number | null) => void;
  waitForPortRelease: (port: number | null, timeoutMs: number) => Promise<boolean>;
  getServer: () => Server | null;
  getUiAuthController: () => { dispose: Cleanup } | null;
  setUiAuthController: (value: null) => void;
  getActiveTunnelController: () => Stop | null;
  setActiveTunnelController: (value: null) => void;
  tunnelAuthController: { clearActiveTunnel: Cleanup };
  beginGuestServiceShutdown: Cleanup;
  stopAllGuestServices: Cleanup;
  extensionServiceLifetime?: OptionalStop;
  extensionSessionEvents?: OptionalStop;
  getGuestSurfaceRuntime: () => Stop | null;
  getRealtimeProxyRuntime: () => Stop | null;
  getDictationRuntime: () => Stop | null;
  getRelayService: () => Stop | null;
  getRelayReconcileTimer: () => Timer | null;
  getSpacesHost?: () => Close | null;
  stopFolderWatches?: Cleanup;
}

export const createGracefulShutdownRuntime = (dependencies: ShutdownDependencies) => {
  const {
    process,
    shutdownTimeoutMs,
    getExitOnShutdown,
    getIsShuttingDown,
    setIsShuttingDown,
    syncToHmrState,
<<<<<<<< HEAD:packages/web/server/lib/host/shutdown-runtime.js
    globalMessageStreamHub,
    hostAgentRuntime,
    openChamberSessionService,
|||||||| bc50ba56aa:packages/web/server/lib/opencode/shutdown-runtime.js
    openCodeWatcherRuntime,
========
    openCodeWatcherRuntime,
    chatDirectoryCleanupRuntime,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/shutdown-runtime.ts
    sessionRuntime,
    sessionAssistRuntime,
    sessionWorkRuntime,
    contextObligatoryRuntime,
<<<<<<<< HEAD:packages/web/server/lib/host/shutdown-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/shutdown-runtime.js
    sessionWarmingRuntime,
========
    sessionWarmingRuntime,
    sessionTodosRuntime,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/shutdown-runtime.ts
    autoReviewRuntime,
    prWatchRuntime,
<<<<<<<< HEAD:packages/web/server/lib/host/shutdown-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/shutdown-runtime.js
    mergeFollowRuntime,
========
    extensionWaitsRuntime = null,
    mergeFollowRuntime,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/shutdown-runtime.ts
    messageQueueRuntime,
    dispatchResultsRuntime,
    messageSearchRuntime,
    scheduledTasksRuntime,
    hostSessionState,
    getTerminalRuntime,
    setTerminalRuntime,
    getMessageStreamRuntime,
    setMessageStreamRuntime,
    getServer,
    getUiAuthController,
    setUiAuthController,
    getActiveTunnelController,
    setActiveTunnelController,
    tunnelAuthController,
    beginGuestServiceShutdown,
    stopAllGuestServices,
    getGuestSurfaceRuntime,
    getRealtimeProxyRuntime,
    getDictationRuntime,
    getRelayService,
    getRelayReconcileTimer,
    getSpacesHost = () => null,
  } = dependencies;

  let shutdownPromise: Promise<void> | null = null;
  const serverConnections = new Set<Socket>();
  let closingHttpServer = false;

  const trackServerConnections = (server: Server) => {
    const onConnection = (socket: Socket) => {
      if (closingHttpServer) {
        socket.destroy();
        return;
      }
      serverConnections.add(socket);
      socket.once('close', () => serverConnections.delete(socket));
    };
    server.on('connection', onConnection);
    server.once('close', () => server.off('connection', onConnection));
  };

  const runShutdown = async (options: ShutdownOptions = {}) => {
    if (getIsShuttingDown()) return;

    setIsShuttingDown(true);
    beginGuestServiceShutdown();
<<<<<<<< HEAD:packages/web/server/lib/host/shutdown-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/shutdown-runtime.js
    // Admission to guest services closed above; stop the session-event
    // subscriber in the same tick, so no event reaches a service's refusal
    // ("the host is shutting down") and reads as a broken service entry.
    extensionSessionEvents?.stop?.();
    extensionServiceLifetime?.stop?.();
========
    extensionSessionEvents?.stop?.();
    extensionServiceLifetime?.stop?.();
    extensionWaitsRuntime?.stop?.();
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/shutdown-runtime.ts
    syncToHmrState();
    console.log('Starting graceful shutdown...');
    const exitProcess = isBoolean(options.exitProcess) ? options.exitProcess : getExitOnShutdown();

    const cleanupOperations = [
      () => clearInterval(getRelayReconcileTimer() ?? undefined),
      () => getGuestSurfaceRuntime()?.stop(),
      () => getRealtimeProxyRuntime()?.stop(),
      () => getSpacesHost()?.close(),
      () => getRelayService()?.stop(),
      () => getDictationRuntime()?.stop(),
<<<<<<<< HEAD:packages/web/server/lib/host/shutdown-runtime.js
      // Discard prepared-but-unused sessions before their workers are stopped, so a
      // speculative prepare never outlives the Host.
      () => openChamberSessionService?.close?.(),
|||||||| bc50ba56aa:packages/web/server/lib/opencode/shutdown-runtime.js
      stopFolderWatches,
      () => openCodeWatcherRuntime.stop(),
========
      stopFolderWatches,
      () => chatDirectoryCleanupRuntime?.stop(),
      () => openCodeWatcherRuntime.stop(),
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/shutdown-runtime.ts
      () => sessionRuntime.dispose(),
      () => sessionAssistRuntime?.stop?.(),
      () => sessionWorkRuntime?.stop?.(),
      () => contextObligatoryRuntime?.stop?.(),
<<<<<<<< HEAD:packages/web/server/lib/host/shutdown-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/shutdown-runtime.js
      () => sessionWarmingRuntime?.stop?.(),
========
      () => sessionWarmingRuntime?.stop?.(),
      () => sessionTodosRuntime?.stop?.(),
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/shutdown-runtime.ts
      () => autoReviewRuntime?.stop?.(),
      () => prWatchRuntime?.stop?.(),
      () => messageQueueRuntime?.stop?.(),
      () => dispatchResultsRuntime?.stop?.(),
      () => messageSearchRuntime?.stop?.(),
      () => scheduledTasksRuntime?.stop?.(),
      () => globalMessageStreamHub.stop(),
      stopAllGuestServices,
    ];
    for (const cleanup of cleanupOperations) {
      try {
        await cleanup();
      } catch {
        continue;
      }
    }

    const terminalRuntime = getTerminalRuntime();
    if (terminalRuntime) {
      try {
        await terminalRuntime.shutdown();
      } catch {
        void 0;
      } finally {
        setTerminalRuntime(null);
      }
    }

    const messageStreamRuntime = getMessageStreamRuntime();
    if (messageStreamRuntime) {
      try {
        await messageStreamRuntime.close();
      } catch {
        void 0;
      } finally {
        setMessageStreamRuntime(null);
      }
    }

    // The OMP Agent Service owns agent execution. The Host never starts, stops, or probes an OpenCode process.

    const server = getServer();
    if (server) {
      closingHttpServer = true;
      let closeTimeout: ReturnType<typeof setTimeout> | null = null;
      try {
        await Promise.race([
          new Promise<void>((resolve) => {
            server.close(() => {
              console.log('HTTP server closed');
              resolve();
            });
            server.closeAllConnections?.();
            for (const socket of serverConnections) socket.destroy();
          }),
          new Promise<void>((resolve) => {
            closeTimeout = setTimeout(() => {
              console.warn('Server close timeout reached, forcing shutdown');
              resolve();
            }, shutdownTimeoutMs);
          }),
        ]);
      } finally {
        if (closeTimeout) {
          clearTimeout(closeTimeout);
        }
      }
    }

    // Stop SDK workers and drain private Host callbacks before closing their operational state.
    await hostAgentRuntime.close();

    // No producer or HTTP admission remains; drain accepted metadata operations
    // before the sole owner closes its shared SQLite connection.
    await hostSessionState.close();

    const uiAuthController = getUiAuthController();
    if (uiAuthController) {
      uiAuthController.dispose();
      setUiAuthController(null);
    }

    const activeTunnelController = getActiveTunnelController();
    if (activeTunnelController) {
      console.log('Stopping active tunnel...');
      activeTunnelController.stop();
      setActiveTunnelController(null);
      tunnelAuthController.clearActiveTunnel();
    }

    console.log('Graceful shutdown complete');
    if (exitProcess) {
      process.exit(0);
    }
  };

  const gracefulShutdown = (options: ShutdownOptions = {}) => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = runShutdown(options);
    return shutdownPromise;
  };

  return {
    gracefulShutdown,
    trackServerConnections,
  };
};
