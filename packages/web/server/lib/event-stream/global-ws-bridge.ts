import { sendMessageStreamWsFrame, sendSerializedMessageStreamWsFrame } from './protocol.js';

export function createGlobalMessageStreamWsBridge({ globalHub, wsClients, heartbeatIntervalMs }) {
  const clients = new Set();
  const ready = new Set();
  const cursors = new Map();
  const heartbeats = new Map();
  const remove = (socket) => {
    clearInterval(heartbeats.get(socket)); heartbeats.delete(socket);
    clients.delete(socket); ready.delete(socket); cursors.delete(socket); wsClients.delete(socket);
  };
  const markReady = (socket, cursor) => {
    const replay = globalHub.replayAfter(cursor);
    if (!sendMessageStreamWsFrame(socket, { type: 'ready', scope: 'global', ...(replay === null ? { replayReset: true } : {}) })) { remove(socket); return; }
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
        else if (status.wasReady) sendMessageStreamWsFrame(socket, { type: 'ready', scope: 'global', ...(status.replayReset ? { replayReset: true } : {}) });
      }
    } else if (status.type === 'invalidated') {
      for (const socket of ready) sendMessageStreamWsFrame(socket, status.invalidation);
    } else if (status.type === 'error' || status.type === 'initial-error') {
      for (const socket of clients) sendMessageStreamWsFrame(socket, { type: 'error', sessionId: status.sessionId, code: status.error.code });
    }
  });
  return {
    accept(socket, { requestedLastEventId = '' } = {}) {
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
