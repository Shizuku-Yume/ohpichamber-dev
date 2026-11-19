import { EventEmitter } from 'node:events';
import { expect, it } from 'vitest';
import { createGlobalMessageStreamHub } from './global-hub.js';
import { createMessageStreamWsRuntime } from './runtime.js';
import { deferred, encodeEvent, event, scope, snapshot, streamBoundary } from './canonical-test-fixtures.js';

it.each([['/api/global/event/ws', 'global'], ['/api/event/ws?sessionId=session', 'session']])('explicit service restart repairs an attached %s client from the replacement epoch', async (url, streamScope) => {
  const first = streamBoundary(); const second = streamBoundary(); let replacement = false;
  const service = { request(path, init) {
    if (replacement && path.endsWith('/snapshot')) return Promise.resolve(Response.json(snapshot([], [], { epoch: 'replacement' })));
    return (replacement ? second : first).service.request(path, init);
  } };
  const hub = createGlobalMessageStreamHub({ service, resolveSessionScope: async () => scope });
  const runtime = createMessageStreamWsRuntime({ server: new EventEmitter(), globalEventHub: hub, wsClients: new Set(),
    uiAuthController: null, isRequestOriginAllowed: async () => true, rejectWebSocketUpgrade() {} });
  const socket = new EventEmitter(); socket.readyState = 1; socket.bufferedAmount = 0; socket.sent = [];
  socket.send = (frame) => socket.sent.push(JSON.parse(frame)); socket.ping = () => {};
  const frames = [];
  try {
    await hub.start(['session']); runtime.wsServer.emit('connection', socket, { url });
    const received = deferred(); const unsubscribe = hub.subscribeFrame((frame) => { frames.push(frame); received.resolve(); });
    first.push(encodeEvent(event(1))); await received.promise; unsubscribe();
    const oldCursor = frames[0].eventId;
    await hub.stop(); expect(first.cancelled()).toBe(true);
    replacement = true; await hub.start(['session']);
    expect(hub.replayAfter(oldCursor)).toBeNull();
    expect(second.calls[0].init.headers['Last-Event-ID']).toBe('replacement:0');
    expect(socket.sent).toContainEqual({ type: 'ready', scope: streamScope, ...(streamScope === 'session' ? { sessionId: 'session' } : {}), replayReset: true });
    const next = deferred(); hub.subscribeFrame(next.resolve);
    second.push(encodeEvent(event(1, { epoch: 'replacement' }))); await next.promise;
    expect(socket.sent.at(-1).payload.epoch).toBe('replacement');
  } finally { socket.emit('close'); await hub.stop(); await runtime.close(); }
});
