import { sendMessageStreamWsFrame, sendSerializedMessageStreamWsFrame } from './protocol.js';
import { EntityIdSchema } from '@openchamber/agent-contract';

export function acceptSessionMessageStreamWsConnection({ socket, sessionId, requestedLastEventId, globalHub, wsClients, heartbeatIntervalMs }) {
  if (!EntityIdSchema.safeParse(sessionId).success) {
    sendMessageStreamWsFrame(socket, { type: 'error', code: 'INVALID_SESSION' });
    socket.close(1008, 'Session identity required');
    return;
  }
  let closed = false;
  let ready = false;
  const markReady = ({ reconnecting = false, replayReset = false } = {}) => {
    if (closed) return;
    if (ready) {
      if (reconnecting && !sendMessageStreamWsFrame(socket, { type: 'ready', scope: 'session', sessionId, ...(replayReset ? { replayReset: true } : {}) })) socket.close();
      return;
    }
    const replay = globalHub.replayAfter(requestedLastEventId, { sessionId });
    if (!sendMessageStreamWsFrame(socket, { type: 'ready', scope: 'session', sessionId, ...(replay === null ? { replayReset: true } : {}) })) {
      socket.close(); return;
    }
    ready = true; wsClients.add(socket);
    if (replay) for (const entry of replay) if (!sendSerializedMessageStreamWsFrame(socket, entry.serializedFrame)) { socket.close(); break; }
  };
  const unsubscribeFrame = globalHub.subscribeFrame((frame) => {
    if (ready && frame.event.sessionId === sessionId && !sendSerializedMessageStreamWsFrame(socket, frame.serializedFrame)) socket.close();
  });
  const unsubscribeStatus = globalHub.subscribeStatus((status) => {
    if (status.sessionId !== sessionId) return;
    if (status.type === 'connect') markReady({ reconnecting: status.wasReady, replayReset: status.replayReset });
    if (status.type === 'invalidated') sendMessageStreamWsFrame(socket, status.invalidation);
    if (status.type === 'error' || status.type === 'initial-error') sendMessageStreamWsFrame(socket, { type: 'error', code: status.error.code, sessionId });
  });
  const heartbeat = setInterval(() => { if (socket.readyState === 1) { try { socket.ping(); } catch { socket.close(); } } }, heartbeatIntervalMs);
  socket.on('close', () => { closed = true; clearInterval(heartbeat); unsubscribeFrame(); unsubscribeStatus(); wsClients.delete(socket); });
  if (globalHub.isSessionConnected(sessionId)) markReady();
  void globalHub.subscribeSession(sessionId).then(markReady).catch(() => {
    if (!closed) { sendMessageStreamWsFrame(socket, { type: 'error', code: 'STREAM_UNAVAILABLE', sessionId }); socket.close(1011, 'Agent Service unavailable'); }
  });
}
