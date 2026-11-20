import { afterEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';

import { createGracefulShutdownRuntime } from './shutdown-runtime.js';

const createRuntime = (server, overrides = {}) => {
  const runtime = createGracefulShutdownRuntime({
    process: { exit: vi.fn() },
    shutdownTimeoutMs: 1000,
    getExitOnShutdown: () => false,
    getIsShuttingDown: () => false,
    setIsShuttingDown: vi.fn(),
    syncToHmrState: vi.fn(),
    hostAgentRuntime: { close: vi.fn() },
    hostSessionState: { close: vi.fn() },
    sessionRuntime: { dispose: vi.fn() },
    scheduledTasksRuntime: { stop: vi.fn() },
    getTerminalRuntime: () => null,
    setTerminalRuntime: vi.fn(),
    getMessageStreamRuntime: () => null,
    setMessageStreamRuntime: vi.fn(),
    getServer: () => server,
    getUiAuthController: () => null,
    setUiAuthController: vi.fn(),
    getActiveTunnelController: () => null,
    setActiveTunnelController: vi.fn(),
    tunnelAuthController: { clearActiveTunnel: vi.fn() },
    beginGuestServiceShutdown: vi.fn(),
    stopAllGuestServices: vi.fn(),
    getGuestSurfaceRuntime: () => null,
    getRealtimeProxyRuntime: () => null,
    getDictationRuntime: () => null,
    getRelayService: () => null,
    getRelayReconcileTimer: () => null,
    ...overrides,
  });
  if (server instanceof http.Server) runtime.trackServerConnections(server);
  return runtime;
};

describe('graceful shutdown runtime', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('discards prepared sessions before stopping the agent runtime', async () => {
    const order = [];
    const server = { close: vi.fn((callback) => { callback(); }) };
    const runtime = createRuntime(server, {
      chatDirectoryCleanupRuntime: { stop: vi.fn(async () => { order.push('chat-cleanup'); }) },
      openChamberSessionService: { close: vi.fn(async () => { order.push('session-service'); }) },
      hostAgentRuntime: { close: vi.fn(async () => { order.push('agent-runtime'); }) },
    });
    await runtime.gracefulShutdown({ exitProcess: false });
    // A prepared session owns a worker; closing the service first means the
    // speculative root is discarded rather than left for the runtime to kill.
    expect(order).toEqual(['chat-cleanup', 'session-service', 'agent-runtime']);
  });

  it('clears the server close timeout when the server closes first', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const server = {
      close: vi.fn((callback) => {
        callback();
      }),
    };
    const runtime = createRuntime(server);
    await runtime.gracefulShutdown({ exitProcess: false });
    expect(warnSpy).not.toHaveBeenCalledWith('Server close timeout reached, forcing shutdown');
  });

  it('closes an active HTTP stream instead of waiting for the shutdown deadline', async () => {
    const server = http.createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.write('data: fixture\n\n');
    });
    const runtime = createRuntime(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const request = http.get(`http://127.0.0.1:${server.address().port}`);
    request.on('error', () => {});
    const response = await new Promise((resolve) => request.once('response', resolve));
    response.resume();
    const closed = new Promise((resolve) => response.once('close', resolve));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await runtime.gracefulShutdown({ exitProcess: false });
      expect(warning).not.toHaveBeenCalledWith('Server close timeout reached, forcing shutdown');
      await closed;
    } finally {
      request.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it.each([false, true])('closes upgraded sockets without the HTTP timeout (handshake completed: %s)', async (completeHandshake) => {
    const server = http.createServer();
    const runtime = createRuntime(server);
    const sockets = new Set();
    server.on('upgrade', (_request, socket) => {
      sockets.add(socket);
      if (completeHandshake) {
        socket.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
      }
      // A listener for another WS route can leave the upgrade unanswered.
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const client = net.connect(server.address().port, '127.0.0.1');
    client.on('error', () => {});
    client.resume();
    const clientClosed = once(client, 'close');
    const upgraded = once(server, 'upgrade');
    client.write('GET /api/global/event/ws HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    await upgraded;
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await runtime.gracefulShutdown({ exitProcess: false });
      expect(warning).not.toHaveBeenCalledWith('Server close timeout reached, forcing shutdown');
      await clientClosed;
      const connections = await new Promise((resolve, reject) => {
        server.getConnections((error, count) => error ? reject(error) : resolve(count));
      });
      expect(connections).toBe(0);
    } finally {
      for (const socket of sockets) socket.destroy();
      client.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('drains host cleanup before closing sockets accepted during cleanup', async () => {
    const server = http.createServer();
    const cleanupStarted = Promise.withResolvers();
    const finishCleanup = Promise.withResolvers();
    const sockets = new Set();
    const clients = [];
    server.on('upgrade', (_request, socket) => sockets.add(socket));
    const terminalShutdown = vi.fn(async () => {
      expect([...sockets].every((socket) => !socket.destroyed)).toBe(true);
    });
    const runtime = createRuntime(server, {
      stopAllGuestServices: async () => {
        cleanupStarted.resolve();
        await finishCleanup.promise;
      },
      getTerminalRuntime: () => ({ shutdown: terminalShutdown }),
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const shutdown = runtime.gracefulShutdown({ exitProcess: false });
    expect(runtime.gracefulShutdown({ exitProcess: false })).toBe(shutdown);
    await cleanupStarted.promise;
    try {
      for (let index = 0; index < 2; index += 1) {
        const client = net.connect(server.address().port, '127.0.0.1');
        clients.push(client);
        client.on('error', () => {});
        client.resume();
        const upgraded = once(server, 'upgrade');
        client.write('GET /api/global/event/ws HTTP/1.1\r\nHost: localhost\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
        await upgraded;
      }
      finishCleanup.resolve();
      await shutdown;
      expect(terminalShutdown).toHaveBeenCalledOnce();
      expect(server.listening).toBe(false);
    } finally {
      finishCleanup.resolve();
      for (const socket of sockets) socket.destroy();
      for (const client of clients) client.destroy();
      await shutdown;
      if (server.listening) await new Promise((resolve) => server.close(resolve));
    }
  });

  it('stops guest services during shutdown', async () => {
    const server = {
      close: vi.fn((callback) => {
        callback();
      }),
    };
    const stopAllGuestServices = vi.fn(async () => {});

    const runtime = createRuntime(server, { stopAllGuestServices });
    await runtime.gracefulShutdown({ exitProcess: false });

    expect(stopAllGuestServices).toHaveBeenCalledTimes(1);
  });

  it('continues shutdown when stopping guest services fails', async () => {
    const server = {
      close: vi.fn((callback) => {
        callback();
      }),
    };
    const stopAllGuestServices = vi.fn(async () => {
      throw new Error('guest teardown failed');
    });
    const terminalRuntime = { shutdown: vi.fn(async () => {}) };

    const runtime = createRuntime(server, {
      stopAllGuestServices,
      getTerminalRuntime: () => terminalRuntime,
    });
    await runtime.gracefulShutdown({ exitProcess: false });

    expect(stopAllGuestServices).toHaveBeenCalledTimes(1);
    expect(terminalRuntime.shutdown).toHaveBeenCalledTimes(1);
    expect(server.close).toHaveBeenCalled();
  });

  it('closes guest admission synchronously and cleans every runtime once across repeated shutdown calls', async () => {
    const order = [];
    const cleanup = (name) => vi.fn(() => { order.push(name); });
    const viewers = { stop: cleanup('viewers') };
    const proxy = { stop: cleanup('proxy') };
    const dictation = { stop: cleanup('dictation') };
    const relay = { stop: cleanup('relay') };
    const gate = cleanup('gate');
    const guests = cleanup('guests');
    const reconcile = vi.fn();
    const timer = setInterval(reconcile, 100);
    const runtime = createRuntime(null, {
      beginGuestServiceShutdown: gate,
      stopAllGuestServices: guests,
      getGuestSurfaceRuntime: () => viewers,
      getRealtimeProxyRuntime: () => proxy,
      getDictationRuntime: () => dictation,
      getRelayService: () => relay,
      getRelayReconcileTimer: () => timer,
    });
    const first = runtime.gracefulShutdown();
    expect(gate).toHaveBeenCalledTimes(1);
    expect(runtime.gracefulShutdown()).toBe(first);
    await first;
    await runtime.gracefulShutdown();
    expect(order).toEqual(['gate', 'viewers', 'proxy', 'relay', 'dictation', 'guests']);
  });

  it('isolates failed viewer and relay cleanup and still drains guests and exits', async () => {
    const stop = vi.fn(() => { throw new Error('stop failed'); });
    const stopAllGuestServices = vi.fn(async () => {});
    const dictation = { stop: vi.fn() };
    const process = { exit: vi.fn() };
    const runtime = createRuntime(null, {
      process,
      getGuestSurfaceRuntime: () => ({ stop }),
      getRelayService: () => ({ stop }),
      getDictationRuntime: () => dictation,
      stopAllGuestServices,
    });
    await runtime.gracefulShutdown({ exitProcess: true });
    expect(stop).toHaveBeenCalledTimes(2);
    expect(dictation.stop).toHaveBeenCalledTimes(1);
    expect(stopAllGuestServices).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(0);
  });
});
