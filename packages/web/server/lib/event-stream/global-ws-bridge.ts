<<<<<<< HEAD:packages/web/server/lib/event-stream/global-ws-bridge.js
import { sendMessageStreamWsFrame, sendSerializedMessageStreamWsFrame } from './protocol.js';
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-ws-bridge.js
import { sendMessageStreamWsEvent, sendMessageStreamWsFrame, sendSerializedMessageStreamWsFrame, serializeMessageStreamWsEvent } from './protocol.js';
=======
import { sendMessageStreamWsEvent, sendMessageStreamWsFrame, sendSerializedMessageStreamWsFrame, serializeMessageStreamWsEvent } from './protocol.js';
import type { BridgeOptions, GlobalReadyFrame, InitialStreamError, StreamSocket } from './contracts.js';
import type { GlobalMessageStreamHub, ReplayEntry } from './global-hub.js';
import type { UpstreamResponse } from './upstream-reader.js';
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-ws-bridge.ts

<<<<<<< HEAD:packages/web/server/lib/event-stream/global-ws-bridge.js
export function createGlobalMessageStreamWsBridge({ globalHub, wsClients, heartbeatIntervalMs }) {
  const clients = new Set();
  const ready = new Set();
  const cursors = new Map();
  const heartbeats = new Map();
  const remove = (socket) => {
    clearInterval(heartbeats.get(socket)); heartbeats.delete(socket);
    clients.delete(socket); ready.delete(socket); cursors.delete(socket); wsClients.delete(socket);
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-ws-bridge.js
function shouldTriggerUpstreamHealthCheck(upstream) {
  if (!upstream) {
    return true;
  }

  if (!upstream.body) {
    return upstream.ok || upstream.status >= 500;
  }

  return upstream.status >= 500;
}

export function createGlobalMessageStreamWsBridge({
  globalHub,
  ownsGlobalHub,
  wsClients,
  processForwardedEventPayload,
  triggerHealthCheck,
  heartbeatIntervalMs,
}) {
  const clients = new Set();
  const clientLastEventIds = new Map();
  const readyClients = new Set();

  const removeClient = (socket) => {
    clients.delete(socket);
    clientLastEventIds.delete(socket);
    readyClients.delete(socket);
    wsClients.delete(socket);
=======
interface GlobalBridgeOptions extends BridgeOptions {
  globalHub: GlobalMessageStreamHub;
  ownsGlobalHub: boolean;
}

function shouldTriggerUpstreamHealthCheck(upstream: UpstreamResponse | null) {
  if (!upstream) {
    return true;
  }

  if (!upstream.body) {
    return upstream.ok || upstream.status >= 500;
  }

  return upstream.status >= 500;
}

export function createGlobalMessageStreamWsBridge({
  globalHub,
  ownsGlobalHub,
  wsClients,
  processForwardedEventPayload,
  triggerHealthCheck,
  heartbeatIntervalMs,
}: GlobalBridgeOptions) {
  const clients = new Set<StreamSocket>();
  const clientLastEventIds = new Map<StreamSocket, string>();
  const readyClients = new Set<StreamSocket>();

  const removeClient = (socket: StreamSocket) => {
    clients.delete(socket);
    clientLastEventIds.delete(socket);
    readyClients.delete(socket);
    wsClients.delete(socket);
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-ws-bridge.ts
  };
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-ws-bridge.js
  const markReady = (socket, cursor) => {
    const replay = globalHub.replayAfter(cursor);
    if (!sendMessageStreamWsFrame(socket, { type: 'ready', scope: 'global', ...(replay === null ? { replayReset: true } : {}) })) { remove(socket); return; }
    ready.add(socket); wsClients.add(socket);
    if (replay) for (const entry of replay) {
      if (!sendSerializedMessageStreamWsFrame(socket, entry.serializedFrame)) { remove(socket); break; }
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-ws-bridge.js

  const replayEvents = (socket, entries) => {
    for (const entry of entries) {
      const sent = sendSerializedMessageStreamWsFrame(socket, entry.serializedFrame);
      if (!sent) {
        removeClient(socket);
        return;
      }
=======

  const replayEvents = (socket: StreamSocket, entries: ReplayEntry[]) => {
    for (const entry of entries) {
      const sent = sendSerializedMessageStreamWsFrame(socket, entry.serializedFrame);
      if (!sent) {
        removeClient(socket);
        return;
      }
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-ws-bridge.ts
    }
  };
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-ws-bridge.js
  const unsubscribeFrame = globalHub.subscribeFrame((frame) => {
    for (const socket of [...ready]) if (!sendSerializedMessageStreamWsFrame(socket, frame.serializedFrame)) remove(socket);
  });
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-ws-bridge.js

  const markReady = (socket, requestedLastEventId) => {
    if (socket.readyState !== 1) {
      return;
    }

    globalHub.flushPending();
    const replay = globalHub.replayAfter(requestedLastEventId);
    const ready = { type: 'ready', scope: 'global' };
    if (replay === null) ready.replayReset = true;
    const sent = sendMessageStreamWsFrame(socket, ready);
    if (!sent) {
      removeClient(socket);
      return;
    }

    readyClients.add(socket);
    wsClients.add(socket);
    if (replay !== null) replayEvents(socket, replay);
  };

  const stopHubIfUnused = () => {
    if (ownsGlobalHub && clients.size === 0) {
      globalHub.stop();
    }
  };

  const closeClientsWithInitialError = ({ message, closeReason = message, triggerHealthCheckFor = null }) => {
    for (const socket of Array.from(clients)) {
      sendMessageStreamWsFrame(socket, { type: 'error', message });
      try {
        socket.close(1011, closeReason);
      } catch {
      }
      removeClient(socket);
    }

    if (triggerHealthCheckFor === true || (triggerHealthCheckFor && shouldTriggerUpstreamHealthCheck(triggerHealthCheckFor))) {
      triggerHealthCheck?.();
    }

    if (ownsGlobalHub) {
      globalHub.stop();
    }
  };

  // Browser clients take the events of isolated spaces too: each frame carries its directory,
  // and a space's directory is one more project directory to the UI.
  const unsubscribeEvent = globalHub.subscribeEvent((event) => {
    const { payload } = event;
    for (const socket of Array.from(clients)) {
      if (!readyClients.has(socket)) {
        continue;
      }
      const sent = sendSerializedMessageStreamWsFrame(socket, event.serialize());
      if (!sent) {
        removeClient(socket);
      }
    }

    processForwardedEventPayload(payload, (syntheticPayload) => {
      if (readyClients.size === 0) return;
      const serializedFrame = serializeMessageStreamWsEvent(syntheticPayload, { directory: 'global' });
      for (const socket of Array.from(clients)) {
        if (!readyClients.has(socket)) {
          continue;
        }
        const sent = sendSerializedMessageStreamWsFrame(socket, serializedFrame);
        if (!sent) {
          removeClient(socket);
        }
      }
    }, { spaceId: event.spaceId });
  }, { spaces: true });

=======

  const markReady = (socket: StreamSocket, requestedLastEventId: string) => {
    if (socket.readyState !== 1) {
      return;
    }

    globalHub.flushPending();
    const replay = globalHub.replayAfter(requestedLastEventId);
    const ready: GlobalReadyFrame = { type: 'ready', scope: 'global' };
    if (replay === null) ready.replayReset = true;
    else if (requestedLastEventId) ready.replayed = true;
    if (!ready.replayed) ready.cursor = globalHub.cursor();
    const sent = sendMessageStreamWsFrame(socket, ready);
    if (!sent) {
      removeClient(socket);
      return;
    }

    readyClients.add(socket);
    wsClients.add(socket);
    if (replay !== null) replayEvents(socket, replay);
  };

  const stopHubIfUnused = () => {
    if (ownsGlobalHub && clients.size === 0) {
      globalHub.stop();
    }
  };

  const closeClientsWithInitialError = ({ message, closeReason = message, triggerHealthCheckFor = null }: InitialStreamError) => {
    for (const socket of Array.from(clients)) {
      sendMessageStreamWsFrame(socket, { type: 'error', message });
      try {
        socket.close(1011, closeReason);
      } catch {
        void 0;
      }
      removeClient(socket);
    }

    if (triggerHealthCheckFor === true || (triggerHealthCheckFor && shouldTriggerUpstreamHealthCheck(triggerHealthCheckFor))) {
      triggerHealthCheck?.();
    }

    if (ownsGlobalHub) {
      globalHub.stop();
    }
  };

  const unsubscribeEvent = globalHub.subscribeEvent((event) => {
    const { payload } = event;
    for (const socket of Array.from(clients)) {
      if (!readyClients.has(socket)) {
        continue;
      }
      const sent = sendSerializedMessageStreamWsFrame(socket, event.serialize());
      if (!sent) {
        removeClient(socket);
      }
    }

    processForwardedEventPayload(payload, (syntheticPayload) => {
      if (readyClients.size === 0) return;
      const serializedFrame = serializeMessageStreamWsEvent(syntheticPayload, { directory: 'global' });
      for (const socket of Array.from(clients)) {
        if (!readyClients.has(socket)) {
          continue;
        }
        const sent = sendSerializedMessageStreamWsFrame(socket, serializedFrame);
        if (!sent) {
          removeClient(socket);
        }
      }
    }, { spaceId: event.spaceId });
  }, { spaces: true });

>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-ws-bridge.ts
  const unsubscribeStatus = globalHub.subscribeStatus((status) => {
    if (status.type === 'connect') {
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-ws-bridge.js
      for (const socket of clients) {
        if (!ready.has(socket)) markReady(socket, cursors.get(socket));
        else if (status.wasReady) sendMessageStreamWsFrame(socket, { type: 'ready', scope: 'global', ...(status.replayReset ? { replayReset: true } : {}) });
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-ws-bridge.js
      for (const socket of Array.from(clients)) {
        if (!readyClients.has(socket)) {
          markReady(socket, clientLastEventIds.get(socket) ?? '');
          continue;
        }

        if (status.wasReady) {
          const sent = sendMessageStreamWsFrame(socket, {
            type: 'ready',
            scope: 'global',
          });
          if (!sent) {
            removeClient(socket);
          }
        }
=======
      for (const socket of Array.from(clients)) {
        if (!readyClients.has(socket)) {
          markReady(socket, clientLastEventIds.get(socket) ?? '');
          continue;
        }

        if (status.wasReady) {
          const sent = sendMessageStreamWsFrame(socket, {
            type: 'ready',
            scope: 'global',
            cursor: globalHub.cursor(),
          });
          if (!sent) {
            removeClient(socket);
          }
        }
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-ws-bridge.ts
      }
    } else if (status.type === 'invalidated') {
      for (const socket of ready) sendMessageStreamWsFrame(socket, status.invalidation);
    } else if (status.type === 'error' || status.type === 'initial-error') {
      for (const socket of clients) sendMessageStreamWsFrame(socket, { type: 'error', sessionId: status.sessionId, code: status.error.code });
    }
  });
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-ws-bridge.js
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-ws-bridge.js

  const accept = (socket, { requestedLastEventId = '' } = {}) => {
    const pingInterval = setInterval(() => {
      if (socket.readyState !== 1) {
        return;
      }

      try {
        socket.ping();
      } catch {
      }
    }, heartbeatIntervalMs);

    const heartbeatInterval = setInterval(() => {
      if (!globalHub.isConnected()) {
        return;
      }

      sendMessageStreamWsEvent(socket, { type: 'openchamber:heartbeat', timestamp: Date.now() }, { directory: 'global' });
    }, heartbeatIntervalMs);

    socket.on('close', () => {
      clearInterval(pingInterval);
      clearInterval(heartbeatInterval);
      removeClient(socket);
      stopHubIfUnused();
    });

    socket.on('error', () => {
      void 0;
    });

    clients.add(socket);
    clientLastEventIds.set(socket, requestedLastEventId);
    globalHub.start();
    if (globalHub.isConnected()) {
      markReady(socket, requestedLastEventId);
    }
  };

  const close = () => {
    unsubscribeEvent();
    unsubscribeStatus();
    if (ownsGlobalHub) {
      globalHub.stop();
    }
    for (const socket of Array.from(clients)) {
      removeClient(socket);
    }
  };

=======

  const accept = (socket: StreamSocket, { requestedLastEventId = '' } = {}) => {
    const pingInterval = setInterval(() => {
      if (socket.readyState !== 1) {
        return;
      }

      try {
        socket.ping();
      } catch {
        void 0;
      }
    }, heartbeatIntervalMs);

    const heartbeatInterval = setInterval(() => {
      if (!globalHub.isConnected()) {
        return;
      }

      sendMessageStreamWsEvent(socket, { type: 'openchamber:heartbeat', timestamp: Date.now() }, { directory: 'global' });
    }, heartbeatIntervalMs);

    socket.on('close', () => {
      clearInterval(pingInterval);
      clearInterval(heartbeatInterval);
      removeClient(socket);
      stopHubIfUnused();
    });

    socket.on('error', () => {
      void 0;
    });

    clients.add(socket);
    clientLastEventIds.set(socket, requestedLastEventId);
    globalHub.start();
    if (globalHub.isConnected()) {
      markReady(socket, requestedLastEventId);
    }
  };

  const close = () => {
    unsubscribeEvent();
    unsubscribeStatus();
    if (ownsGlobalHub) {
      globalHub.stop();
    }
    for (const socket of Array.from(clients)) {
      removeClient(socket);
    }
  };

>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-ws-bridge.ts
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
