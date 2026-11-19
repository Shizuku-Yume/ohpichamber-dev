import { WebSocketServer } from 'ws';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocket } from '../shared/websocket-contracts.js';
import type { RequestOriginChecker, createRequestSecurityRuntime } from '../security/request-security.js';
import type { createUiAuth } from '../ui-auth/ui-auth.js';
import type { BridgeOptions, EventRouting, StreamSocket, UpstreamConnection } from './contracts.js';
import type { GlobalMessageStreamHub } from './global-hub.js';
import { isOpaqueOriginRequest, isPasswordlessSocketOriginAllowed } from '../security/request-security.js';

import { parseRequestPathname } from '../terminal/terminal-ws-protocol.js';
import {
  MESSAGE_STREAM_DIRECTORY_WS_PATH,
  MESSAGE_STREAM_GLOBAL_WS_PATH,
  MESSAGE_STREAM_WS_HEARTBEAT_INTERVAL_MS,
  serializeMessageStreamWsEvent,
  sendSerializedMessageStreamWsFrame,
} from './protocol.js';
import { createGlobalMessageStreamWsBridge } from './global-ws-bridge.js';
import { acceptSessionMessageStreamWsConnection } from './session-ws-bridge.js';

export interface GlobalUiEventBroadcasterOptions<SseClient> {
  sseClients: Set<SseClient>;
  wsClients: Set<StreamSocket>;
  writeSseEvent: <Payload>(res: SseClient, payload: Payload, serializedPayload: string | undefined) => void;
}

export interface MessageStreamWsRuntimeOptions extends UpstreamConnection, Omit<BridgeOptions, 'heartbeatIntervalMs'> {
  server: Pick<Server, 'on' | 'off'>;
  uiAuthController?: Partial<Pick<ReturnType<typeof createUiAuth>, 'enabled' | 'ensureSessionToken'>> | null;
  isRequestOriginAllowed: RequestOriginChecker;
  rejectWebSocketUpgrade: ReturnType<typeof createRequestSecurityRuntime>['rejectWebSocketUpgrade'];
  heartbeatIntervalMs?: number;
  globalEventHub?: GlobalMessageStreamHub | null;
}

const isRequestUrl = (value: unknown): value is string => typeof value === 'string';

export function createGlobalUiEventBroadcaster<SseClient>({
  sseClients,
  wsClients,
  writeSseEvent,
}: GlobalUiEventBroadcasterOptions<SseClient>) {
  return <Payload>(payload: Payload, options: EventRouting = {}) => {
    const hasSseClients = sseClients.size > 0;
    const hasWsClients = wsClients.size > 0;
    if (!hasSseClients && !hasWsClients) {
      return;
    }

    if (hasSseClients) {
      const serializedPayload = JSON.stringify(payload);
      for (const res of sseClients) {
        try {
          writeSseEvent(res, payload, serializedPayload);
        } catch {
          void 0;
        }
      }
    }

    if (hasWsClients) {
      const serializedFrame = serializeMessageStreamWsEvent(payload, {
        directory: options.directory && options.directory.length > 0 ? options.directory : 'global',
        eventId: options.eventId && options.eventId.length > 0 ? options.eventId : undefined,
      });
      for (const socket of Array.from(wsClients)) {
        const sent = sendSerializedMessageStreamWsFrame(socket, serializedFrame);
        if (!sent) {
          wsClients.delete(socket);
        }
      }
    }
  };
}

export function createMessageStreamWsRuntime({
  server,
  uiAuthController,
  isRequestOriginAllowed,
  rejectWebSocketUpgrade,
  wsClients,
  heartbeatIntervalMs = MESSAGE_STREAM_WS_HEARTBEAT_INTERVAL_MS,
<<<<<<< HEAD:packages/web/server/lib/event-stream/runtime.js
  globalEventHub,
}) {
  if (!globalEventHub) throw new TypeError('Canonical global event hub is required');
||||||| bc50ba56aa:packages/web/server/lib/event-stream/runtime.js
  upstreamStallTimeoutMs = DEFAULT_UPSTREAM_STALL_TIMEOUT_MS,
  upstreamReconnectDelayMs = DEFAULT_UPSTREAM_RECONNECT_DELAY_MS,
  fetchImpl = fetch,
  globalEventHub = null,
}) {
=======
  upstreamStallTimeoutMs = DEFAULT_UPSTREAM_STALL_TIMEOUT_MS,
  upstreamReconnectDelayMs = DEFAULT_UPSTREAM_RECONNECT_DELAY_MS,
  fetchImpl = fetch,
  globalEventHub = null,
}: MessageStreamWsRuntimeOptions) {
>>>>>>> upstream/main:packages/web/server/lib/event-stream/runtime.ts
  const wsServer = new WebSocketServer({
    noServer: true,
  });

<<<<<<< HEAD:packages/web/server/lib/event-stream/runtime.js
  const globalHub = globalEventHub;
||||||| bc50ba56aa:packages/web/server/lib/event-stream/runtime.js
  // Directory-scoped streams create one upstream reader per client
  // connection. Track those sockets so a managed OpenCode restart can close
  // them: each reader is pinned to the port it connected at and would
  // otherwise keep streaming from an orphaned process on the old port (#2638).
  const directorySockets = new Set();

  const ownsGlobalHub = !globalEventHub;
  const globalHub = globalEventHub ?? createGlobalMessageStreamHub({
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    fetchImpl,
    upstreamStallTimeoutMs,
    upstreamReconnectDelayMs,
  });
=======
  const directorySockets = new Set<WebSocket>();

  const ownsGlobalHub = !globalEventHub;
  const globalHub = globalEventHub ?? createGlobalMessageStreamHub({
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    fetchImpl,
    upstreamStallTimeoutMs,
    upstreamReconnectDelayMs,
  });
>>>>>>> upstream/main:packages/web/server/lib/event-stream/runtime.ts

  const globalBridge = createGlobalMessageStreamWsBridge({
    globalHub,
    wsClients,
    heartbeatIntervalMs,
  });

  wsServer.on('connection', (socket, req) => {
    const rawUrl = isRequestUrl(req?.url) ? req.url : MESSAGE_STREAM_GLOBAL_WS_PATH;
    const pathname = parseRequestPathname(rawUrl);
    const requestUrl = new URL(rawUrl, 'http://127.0.0.1');
    const isGlobalStream = pathname === MESSAGE_STREAM_GLOBAL_WS_PATH;
    const requestedLastEventId = requestUrl.searchParams.get('lastEventId')?.trim() || '';
    const sessionId = requestUrl.searchParams.get('sessionId')?.trim() || '';

    if (isGlobalStream) {
      globalBridge.accept(socket, {
        requestedLastEventId,
      });
      return;
    }

<<<<<<< HEAD:packages/web/server/lib/event-stream/runtime.js
    acceptSessionMessageStreamWsConnection({ socket, sessionId, requestedLastEventId, globalHub, wsClients, heartbeatIntervalMs });
||||||| bc50ba56aa:packages/web/server/lib/event-stream/runtime.js
    directorySockets.add(socket);
    socket.on('close', () => {
      directorySockets.delete(socket);
    });

    acceptDirectoryMessageStreamWsConnection({
      socket,
      requestedLastEventId,
      requestedDirectory,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      processForwardedEventPayload,
      wsClients,
      triggerHealthCheck,
      heartbeatIntervalMs,
      upstreamStallTimeoutMs,
      upstreamReconnectDelayMs,
      fetchImpl,
    });
=======
    directorySockets.add(socket);
    socket.on('close', () => {
      directorySockets.delete(socket);
    });

    acceptDirectoryMessageStreamWsConnection({
      socket,
      requestedLastEventId,
      requestedDirectory,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      processForwardedEventPayload,
      wsClients,
      triggerHealthCheck,
      heartbeatIntervalMs,
      upstreamStallTimeoutMs,
      upstreamReconnectDelayMs,
      fetchImpl,
      isHiddenPayload: globalHub.isHiddenPayload,
    });
>>>>>>> upstream/main:packages/web/server/lib/event-stream/runtime.ts
  });

  const upgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const pathname = parseRequestPathname(req.url);
    if (pathname !== MESSAGE_STREAM_GLOBAL_WS_PATH && pathname !== MESSAGE_STREAM_DIRECTORY_WS_PATH) {
      return;
    }

    const handleUpgrade = async () => {
      try {
        if (isOpaqueOriginRequest(req)) {
          rejectWebSocketUpgrade(socket, 403, 'Invalid origin');
          return;
        }
        if (!uiAuthController?.enabled && !await isPasswordlessSocketOriginAllowed(req, isRequestOriginAllowed)) {
          rejectWebSocketUpgrade(socket, 403, 'Invalid origin');
          return;
        }
        if (uiAuthController?.enabled) {
          const sessionToken = await uiAuthController?.ensureSessionToken?.(req, null);
          if (!sessionToken) {
            rejectWebSocketUpgrade(socket, 401, 'UI authentication required');
            return;
          }

          const originAllowed = await isRequestOriginAllowed(req);
          if (!originAllowed) {
            rejectWebSocketUpgrade(socket, 403, 'Invalid origin');
            return;
          }
        }

        wsServer.handleUpgrade(req, socket, head, (ws) => {
          wsServer.emit('connection', ws, req);
        });
      } catch {
        rejectWebSocketUpgrade(socket, 500, 'Upgrade failed');
      }
    };

    void handleUpgrade();
  };

  server.on('upgrade', upgradeHandler);

  return {
    wsServer,
<<<<<<< HEAD:packages/web/server/lib/event-stream/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/event-stream/runtime.js
    /**
     * Rebind all upstream readers to the current OpenCode port. Called after
     * a managed process restart: the restart can land on a NEW port while
     * the old process (or an orphaned survivor of it) still holds the
     * previous one, and a healthy-but-pinned SSE connection never notices —
     * so the UI would stop receiving events until the app restarts (#2638).
     * Restarting the shared hub re-dials `buildOpenCodeUrl` (which reads the
     * current port) on its next attempt; directory-scoped readers are
     * rebuilt by closing their client sockets, which reconnect with
     * `Last-Event-ID` and re-establish the stream against the new port.
     */
    rebindUpstream() {
      globalHub.stop();
      globalHub.start();
      for (const socket of Array.from(directorySockets)) {
        try {
          socket.close(1012, 'OpenCode upstream restarted');
        } catch {
        }
      }
    },
=======
    rebindUpstream() {
      globalHub.stop();
      globalHub.start();
      for (const socket of Array.from(directorySockets)) {
        try {
          socket.close(1012, 'OpenCode upstream restarted');
        } catch {
          void 0;
        }
      }
    },
>>>>>>> upstream/main:packages/web/server/lib/event-stream/runtime.ts
    async close() {
      server.off('upgrade', upgradeHandler);
      globalBridge.close();

      try {
        const clients = wsServer.clients;
        if (!clients) throw new TypeError('WebSocket client tracking is unavailable');
        for (const client of clients) {
          try {
            client.terminate();
          } catch {
            void 0;
          }
        }

        await new Promise<void>((resolve) => {
          wsServer.close(() => resolve());
        });
      } catch {
        void 0;
      } finally {
        wsClients.clear();
      }
    },
  };
}
