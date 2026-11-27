import type { StreamSocket } from './contracts.js';
import type { GlobalMessageStreamHub } from './global-hub.js';
import { sendMessageStreamWsFrame, sendSerializedMessageStreamWsFrame } from './protocol.js';

export interface GlobalMessageStreamWsBridgeOptions {
  globalHub: Pick<GlobalMessageStreamHub, 'replayAfter' | 'subscribeFrame' | 'subscribeStatus' | 'isConnected'>;
  wsClients: Set<StreamSocket>;
  heartbeatIntervalMs: number;
}

export function createGlobalMessageStreamWsBridge({ globalHub, wsClients, heartbeatIntervalMs }: GlobalMessageStreamWsBridgeOptions) {
  const clients = new Set<StreamSocket>();
  const ready = new Set<StreamSocket>();
  const cursors = new Map<StreamSocket, string>();
  const heartbeats = new Map<StreamSocket, ReturnType<typeof setInterval>>();
  const remove = (socket: StreamSocket) => {
    clearInterval(heartbeats.get(socket)); heartbeats.delete(socket);
    clients.delete(socket); ready.delete(socket); cursors.delete(socket); wsClients.delete(socket);
  };
  const markReady = (socket: StreamSocket, cursor: string | undefined) => {
    const replay = globalHub.replayAfter(cursor);
    const readyFrame = replay === null
      ? { type: 'ready' as const, scope: 'global' as const, replayReset: true }
      : { type: 'ready' as const, scope: 'global' as const };
    if (!sendMessageStreamWsFrame(socket, readyFrame)) { remove(socket); return; }
    ready.add(socket); wsClients.add(socket);
    if (replay) for (const entry of replay) {
      if (!sendSerializedMessageStreamWsFrame(socket, entry.serializedFrame)) { remove(socket); break; }
    }
  };
  const unsubscribeFrame = globalHub.subscribeFrame((frame) => {
    for (const socket of [...ready]) if (!sendSerializedMessageStreamWsFrame(socket, frame.serializedFrame)) remove(socket);
  });
  const unsubscribeStatus = globalHub.subscribeStatus((status) => {
    if (status.type === 'connect') {
      for (const socket of clients) {
        if (!ready.has(socket)) markReady(socket, cursors.get(socket));
        else if (status.wasReady) {
          const readyFrame = status.replayReset
            ? { type: 'ready' as const, scope: 'global' as const, replayReset: true }
            : { type: 'ready' as const, scope: 'global' as const };
          sendMessageStreamWsFrame(socket, readyFrame);
        }
      }
    } else if (status.type === 'invalidated') {
      for (const socket of ready) sendMessageStreamWsFrame(socket, status.invalidation);
    } else if (status.type === 'error' || status.type === 'initial-error') {
      for (const socket of clients) sendMessageStreamWsFrame(socket, { type: 'error', sessionId: status.sessionId, code: status.error.code });
    }
  });
  return {
    accept(socket: StreamSocket, { requestedLastEventId = '' }: { requestedLastEventId?: string } = {}) {
      clients.add(socket); cursors.set(socket, requestedLastEventId);
      const heartbeat = setInterval(() => {
        if (socket.readyState !== 1 || !globalHub.isConnected()) return;
        try { socket.ping(); } catch { remove(socket); }
      }, heartbeatIntervalMs);
      heartbeats.set(socket, heartbeat);
      socket.on('close', () => remove(socket));
      if (globalHub.isConnected()) markReady(socket, requestedLastEventId);
    },
    close() { unsubscribeFrame(); unsubscribeStatus(); for (const socket of [...clients]) remove(socket); },
  };
}
