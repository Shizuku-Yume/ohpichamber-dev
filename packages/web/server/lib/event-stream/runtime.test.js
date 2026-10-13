import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createGlobalUiEventBroadcaster, createMessageStreamWsRuntime } from './runtime.js';
import { createGlobalMessageStreamHub } from './global-hub.js';
import { createNotificationEmitterRuntime } from '../notifications/emitter-runtime.js';
import { deferred, encodeEvent, event, scope, streamBoundary } from './canonical-test-fixtures.js';

class Socket extends EventEmitter {
  readyState = 1; bufferedAmount = 0; sent = [];
  send(text) { this.sent.push(JSON.parse(text)); }
  ping() {}
  close() { if (this.readyState === 3) return; this.readyState = 3; this.emit('close'); }
}
const fixture = () => {
  const boundary = streamBoundary();
  const hub = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: async () => scope });
  const runtime = createMessageStreamWsRuntime({ server: new EventEmitter(), globalEventHub: hub, wsClients: new Set(),
    uiAuthController: null, isRequestOriginAllowed: async () => true, rejectWebSocketUpgrade() {} });
  return { hub, runtime, ...boundary };
};

it('serializes a synthetic Host broadcast once per wire format and isolates failed clients', () => {
  let serializations = 0;
  const payload = { toJSON() { serializations += 1; return { type: 'openchamber:test', properties: { value: 'same' } }; } };
  const writes = [];
  const sseClients = new Set(Array.from({ length: 4 }, () => ({ write: (text) => writes.push(text) })));
  const sockets = Array.from({ length: 4 }, () => ({ readyState: 1, bufferedAmount: 0, send: (text) => writes.push(text) }));
  const failed = { readyState: 1, bufferedAmount: 0, send() { throw new Error('closed'); } };
  const wsClients = new Set([...sockets, failed]);
  const { writeSseEvent } = createNotificationEmitterRuntime({});
  createGlobalUiEventBroadcaster({ sseClients, wsClients, writeSseEvent })(payload);
  expect(serializations).toBe(2); expect(writes).toHaveLength(8); expect(wsClients.has(failed)).toBe(false);
});

describe('canonical WS delivery', () => {
  it('shares Host-watched streams across browser sockets without starting an execution reader per socket', async () => {
    const f = fixture(); const first = new Socket(); const second = new Socket();
    try {
      f.runtime.wsServer.emit('connection', first, { url: '/api/global/event/ws' });
      f.runtime.wsServer.emit('connection', second, { url: '/api/global/event/ws' });
      expect(first.sent).toEqual([]); expect(f.calls).toEqual([]);
      await f.hub.start(['session']);
      const done = deferred(); f.hub.subscribeFrame(done.resolve);
      f.push(encodeEvent(event(1))); await done.promise;
      expect(f.calls).toHaveLength(2);
      for (const socket of [first, second]) {
        expect(socket.sent[0]).toMatchObject({ type: 'ready', scope: 'global' });
        expect(socket.sent[1].payload).toEqual(event(1));
        expect(JSON.stringify(socket.sent)).not.toContain(scope.cwd);
      }
    } finally { first.close(); second.close(); await f.hub.stop(); await f.runtime.close(); }
  });

  it('replays exactly the retained suffix and reports a missing cursor without partial history', async () => {
    const f = fixture(); const socket = new Socket(); const reconnect = new Socket(); const missing = new Socket();
    try {
      await f.hub.start(['session']); f.runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });
      const done = deferred(); f.hub.subscribeFrame((frame) => { if (frame.event.sequence === '3') done.resolve(); });
      f.push([event(1), event(2), event(3)].map(encodeEvent).join('')); await done.promise;
      const cursor = socket.sent[1].eventId;
      f.runtime.wsServer.emit('connection', reconnect, { url: `/api/global/event/ws?lastEventId=${encodeURIComponent(cursor)}` });
      expect(reconnect.sent.slice(1).map((frame) => frame.payload.sequence)).toEqual(['2', '3']);
      f.runtime.wsServer.emit('connection', missing, { url: '/api/global/event/ws?lastEventId=retired-cursor' });
      expect(missing.sent).toEqual([{ type: 'ready', scope: 'global', replayReset: true }]);
    } finally { socket.close(); reconnect.close(); missing.close(); await f.hub.stop(); await f.runtime.close(); }
  });

  it('requires an opaque session identity on scoped sockets instead of treating a client directory as Host authority', async () => {
    const f = fixture(); const socket = new Socket();
    try {
      f.runtime.wsServer.emit('connection', socket, { url: '/api/event/ws?directory=/private/other' });
      expect(socket.readyState).toBe(3); expect(f.calls).toEqual([]);
      expect(socket.sent).toEqual([{ type: 'error', code: 'INVALID_SESSION' }]);
    } finally { socket.close(); await f.hub.stop(); await f.runtime.close(); }
  });

  it('cannot lose the first event while a session socket becomes ready', async () => {
    const f = fixture(); const socket = new Socket();
    try {
      f.push(encodeEvent(event(1)));
      const done = deferred(); f.hub.subscribeFrame(done.resolve);
      f.runtime.wsServer.emit('connection', socket, { url: '/api/event/ws?sessionId=session' }); await done.promise;
      expect(socket.sent[0]).toMatchObject({ type: 'ready', scope: 'session', sessionId: 'session' });
      expect(socket.sent[1].payload.sequence).toBe('1');
    } finally { socket.close(); await f.hub.stop(); await f.runtime.close(); }
  });
});
