import type { Server } from 'node:http';
import type { Socket } from 'node:net';
import type { createTerminalRuntime } from '../terminal/runtime.js';
import type { createDictationRuntime } from '../dictation/runtime.js';
import type { createMessageStreamWsRuntime } from '../event-stream/index.js';
import type { GlobalMessageStreamHub } from '../event-stream/global-hub.js';
import type { createUiAuth } from '../ui-auth/ui-auth.js';
import type { TunnelController } from '../tunnels/contracts.js';
import type { createTunnelAuth } from '../tunnels/tunnel-auth.js';

interface Stoppable {
  stop: () => void | Promise<void> | null;
}

interface Closeable {
  close: () => void | Promise<void>;
}

interface Disposable {
  dispose: () => void | Promise<void>;
}

export interface ShutdownOptions {
  exitProcess?: boolean;
}

export interface GracefulShutdownDependencies {
  process: Pick<NodeJS.Process, 'exit'>;
  shutdownTimeoutMs: number;
  getExitOnShutdown: () => boolean;
  getIsShuttingDown: () => boolean;
  setIsShuttingDown: (shuttingDown: boolean) => void;
  syncToHmrState: () => void;
  globalMessageStreamHub: Pick<GlobalMessageStreamHub, 'stop'>;
  hostAgentRuntime: Closeable;
  openChamberSessionService?: Closeable | null;
  chatDirectoryCleanupRuntime?: Stoppable | null;
  sessionRuntime: Disposable;
  sessionAssistRuntime?: Stoppable | null;
  sessionWorkRuntime?: Stoppable | null;
  contextObligatoryRuntime?: Stoppable | null;
  autoReviewRuntime?: Stoppable | null;
  prWatchRuntime?: Stoppable | null;
  extensionWaitsRuntime?: { stop: () => void; flush: () => void | Promise<void> } | null;
  messageQueueRuntime?: Stoppable | null;
  dispatchResultsRuntime?: Stoppable | null;
  messageSearchRuntime?: Stoppable | null;
  scheduledTasksRuntime?: Stoppable | null;
  hostSessionState: Closeable;
  getTerminalRuntime: () => Pick<ReturnType<typeof createTerminalRuntime>, 'shutdown'> | null;
  setTerminalRuntime: (runtime: ReturnType<typeof createTerminalRuntime> | null) => void;
  getMessageStreamRuntime: () => ReturnType<typeof createMessageStreamWsRuntime> | null;
  setMessageStreamRuntime: (runtime: ReturnType<typeof createMessageStreamWsRuntime> | null) => void;
  getServer: () => Server | null;
  getUiAuthController: () => Pick<ReturnType<typeof createUiAuth>, 'dispose'> | null;
  setUiAuthController: (controller: ReturnType<typeof createUiAuth> | null) => void;
  getActiveTunnelController: () => Pick<TunnelController, 'stop'> | null;
  setActiveTunnelController: (controller: TunnelController | null) => void;
  tunnelAuthController: Pick<ReturnType<typeof createTunnelAuth>, 'clearActiveTunnel'>;
  beginGuestServiceShutdown: () => void;
  stopAllGuestServices: () => void | Promise<void>;
  getGuestSurfaceRuntime: () => Stoppable | null;
  getRealtimeProxyRuntime: () => Stoppable | null;
  getDictationRuntime: () => ReturnType<typeof createDictationRuntime> | null;
  getRelayService: () => Stoppable | null;
  getRelayReconcileTimer: () => ReturnType<typeof setInterval> | null;
  getSpacesHost?: () => Closeable | null;
}

export const createGracefulShutdownRuntime = (dependencies: GracefulShutdownDependencies) => {
  const {
    process,
    shutdownTimeoutMs,
    getExitOnShutdown,
    getIsShuttingDown,
    setIsShuttingDown,
    syncToHmrState,
    globalMessageStreamHub,
    hostAgentRuntime,
    openChamberSessionService,
    chatDirectoryCleanupRuntime,
    sessionRuntime,
    sessionAssistRuntime,
    sessionWorkRuntime,
    contextObligatoryRuntime,
    autoReviewRuntime,
    prWatchRuntime,
    extensionWaitsRuntime,
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
    syncToHmrState();
    console.log('Starting graceful shutdown...');
    const exitProcess = options.exitProcess ?? getExitOnShutdown();

    const cleanupOperations: Array<() => void | Promise<void> | null | undefined> = [
      () => {
        const timer = getRelayReconcileTimer();
        if (timer) clearInterval(timer);
      },
      () => getGuestSurfaceRuntime()?.stop(),
      () => getRealtimeProxyRuntime()?.stop(),
      () => getSpacesHost()?.close(),
      () => getRelayService()?.stop(),
      () => getDictationRuntime()?.stop(),
      () => chatDirectoryCleanupRuntime?.stop(),
      () => openChamberSessionService?.close?.(),
      () => sessionRuntime.dispose(),
      () => sessionAssistRuntime?.stop?.(),
      () => sessionWorkRuntime?.stop?.(),
      () => contextObligatoryRuntime?.stop?.(),
      () => autoReviewRuntime?.stop?.(),
      () => prWatchRuntime?.stop?.(),
      () => {
        extensionWaitsRuntime?.stop();
        return extensionWaitsRuntime?.flush();
      },
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
      } catch { void 0; }
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

    await hostAgentRuntime.close();
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
