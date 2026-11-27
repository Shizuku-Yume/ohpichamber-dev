import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer } from 'ws';
import { isOpaqueOriginRequest, isPasswordlessSocketOriginAllowed } from '../security/request-security.js';
import type { RequestOriginChecker } from '../security/request-security.js';
import { isString } from '../shared/object-guards.js';
import { parseRequestPathname } from '../terminal/terminal-ws-protocol.js';
import type { createUiAuth } from '../ui-auth/ui-auth.js';
import type { EventRouting, StreamSocket } from './contracts.js';
import type { GlobalMessageStreamHub } from './global-hub.js';
import { createGlobalMessageStreamWsBridge } from './global-ws-bridge.js';
import {
  MESSAGE_STREAM_DIRECTORY_WS_PATH,
  MESSAGE_STREAM_GLOBAL_WS_PATH,
  MESSAGE_STREAM_WS_HEARTBEAT_INTERVAL_MS,
  sendSerializedMessageStreamWsFrame,
  serializeMessageStreamWsEvent,
} from './protocol.js';
import { acceptSessionMessageStreamWsConnection } from './session-ws-bridge.js';

export interface GlobalUiEventBroadcasterOptions<SseClient, EventPayload> {
  sseClients: Set<SseClient>;
  wsClients: Set<StreamSocket>;
  writeSseEvent: (res: SseClient, payload: EventPayload, serializedPayload?: string) => void;
}

export interface MessageStreamWsRuntimeOptions {
  server: Pick<Server, 'on' | 'off'>;
  uiAuthController?: Pick<ReturnType<typeof createUiAuth>, 'enabled' | 'ensureSessionToken'> | null | undefined;
  isRequestOriginAllowed: RequestOriginChecker;
  rejectWebSocketUpgrade: (socket: Duplex, code: number, reason: string) => void;
  wsClients: Set<StreamSocket>;
  heartbeatIntervalMs?: number;
  globalEventHub: GlobalMessageStreamHub;
}

export function createGlobalUiEventBroadcaster<SseClient, EventPayload>({
  sseClients,
  wsClients,
  writeSseEvent,
}: GlobalUiEventBroadcasterOptions<SseClient, EventPayload>) {
  return (payload: EventPayload, options: EventRouting = {}) => {
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
        directory: isString(options.directory) && options.directory.length > 0 ? options.directory : 'global',
        eventId: isString(options.eventId) && options.eventId.length > 0 ? options.eventId : undefined,
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
  globalEventHub,
}: MessageStreamWsRuntimeOptions) {
  if (!globalEventHub) throw new TypeError('Canonical global event hub is required');
  const wsServer = new WebSocketServer({
    noServer: true,
  });

  const globalHub = globalEventHub;

  const globalBridge = createGlobalMessageStreamWsBridge({
    globalHub,
    wsClients,
    heartbeatIntervalMs,
  });

  wsServer.on('connection', (socket, req) => {
    const rawUrl = isString(req?.url) ? req.url : MESSAGE_STREAM_GLOBAL_WS_PATH;
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

    acceptSessionMessageStreamWsConnection({ socket, sessionId, requestedLastEventId, globalHub, wsClients, heartbeatIntervalMs });
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
    async close() {
      server.off('upgrade', upgradeHandler);
      globalBridge.close();

      try {
        for (const client of wsServer.clients ?? []) {
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
