import { randomUUID } from 'node:crypto';
import { EntityIdSchema } from '@openchamber/agent-contract';
import type { StreamSocket } from './contracts.js';
import type { GlobalMessageStreamHub } from './global-hub.js';
import { sendMessageStreamWsFrame, sendSerializedMessageStreamWsFrame } from './protocol.js';

export type SessionMessageStreamHub = Pick<
  GlobalMessageStreamHub,
  'replayAfter' | 'subscribeFrame' | 'subscribeStatus' | 'isSessionConnected'
> & Partial<Pick<GlobalMessageStreamHub, 'retainSession' | 'releaseSession' | 'subscribeSession'>>;

export interface SessionMessageStreamWsOptions {
  socket: StreamSocket;
  sessionId: string;
  requestedLastEventId: string;
  globalHub: SessionMessageStreamHub;
  wsClients: Set<StreamSocket>;
  heartbeatIntervalMs: number;
}
interface SessionReadyFrame {
  type: 'ready';
  scope: 'session';
  sessionId: string;
  replayReset?: boolean;
}

export function acceptSessionMessageStreamWsConnection({
  socket,
  sessionId,
  requestedLastEventId,
  globalHub,
  wsClients,
  heartbeatIntervalMs,
}: SessionMessageStreamWsOptions): void {
  if (!EntityIdSchema.safeParse(sessionId).success) {
    sendMessageStreamWsFrame(socket, { type: 'error', code: 'INVALID_SESSION' });
    socket.close(1008, 'Session identity required');
    return;
  }
  let closed = false;
  let ready = false;
  const markReady = ({ reconnecting = false, replayReset = false }: { reconnecting?: boolean; replayReset?: boolean } = {}) => {
    if (closed) return;
    if (ready) {
      if (reconnecting) {
        const frame: SessionReadyFrame = {
          type: 'ready',
          scope: 'session',
          sessionId,
        };
        if (replayReset) frame.replayReset = true;
        if (!sendMessageStreamWsFrame(socket, frame)) socket.close();
      }
      return;
    }
    const replay = globalHub.replayAfter(requestedLastEventId, { sessionId });
    const readyFrame: SessionReadyFrame = {
      type: 'ready',
      scope: 'session',
      sessionId,
    };
    if (replay === null) readyFrame.replayReset = true;
    if (!sendMessageStreamWsFrame(socket, readyFrame)) {
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
  const leaseKey = `ws-${randomUUID()}`;
  socket.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
    unsubscribeFrame();
    unsubscribeStatus();
    wsClients.delete(socket);
    void globalHub.releaseSession?.(sessionId, leaseKey);
  });
  if (globalHub.isSessionConnected(sessionId)) markReady();
  const subscribePromise = globalHub.retainSession
    ? globalHub.retainSession(sessionId, leaseKey)
    : globalHub.subscribeSession?.(sessionId);
  void Promise.resolve(subscribePromise).then(() => markReady()).catch(() => {
    if (!closed) { sendMessageStreamWsFrame(socket, { type: 'error', code: 'STREAM_UNAVAILABLE', sessionId }); socket.close(1011, 'Agent Service unavailable'); }
  });
}
