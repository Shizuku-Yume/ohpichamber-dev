import { EventEmitter } from 'node:events';
import { expect, it } from 'vitest';
import { createGlobalMessageStreamHub } from './global-hub.js';
import { createMessageStreamWsRuntime } from './runtime.js';
import { deferred, encodeEvent, event, scope, snapshot, streamBoundary } from './canonical-test-fixtures.js';

<<<<<<< HEAD
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
||||||| bc50ba56aa
class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    this.closeCalls = [];
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  ping() {
    void 0;
  }

  close(code, reason) {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
    this.emit('close');
  }
}

function createSseResponse({ blocks = [], signal, holdOpen = false }) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index < blocks.length) {
              const next = blocks[index++];
              return { value: encoder.encode(next), done: false };
            }

            if (!holdOpen) {
              return { value: undefined, done: true };
            }

            return new Promise((resolve, reject) => {
              const onAbort = () => {
                signal.removeEventListener('abort', onAbort);
                const error = new Error('Aborted');
                error.name = 'AbortError';
                reject(error);
              };
              signal.addEventListener('abort', onAbort, { once: true });
            });
          },
        };
      },
    },
  };
}

describe('rebindUpstream (#2638)', () => {
  it('restarts the shared hub upstream so a connected client resumes receiving events on the new port', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let port = 4096;
    let fetchCalls = 0;

    // Port changes after a managed restart: buildOpenCodeUrl resolves the
    // CURRENT port on every attempt, exactly like production network-runtime.
    const buildOpenCodeUrl = vi.fn(() => `http://127.0.0.1:${port}/api/event`);
    const fetchImpl = vi.fn(async (_url, options) => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: ['data: {"id":"evt-1","type":"server.connected","properties":{}}\n\n'],
        });
      }
      return createSseResponse({
        signal: options.signal,
        holdOpen: true,
        blocks: ['data: {"id":"evt-2","type":"session.updated","properties":{"sessionID":"ses_1"}}\n\n'],
      });
    });

    const globalHub = createGlobalMessageStreamHub({
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl,
      upstreamReconnectDelayMs: 0,
    });

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      globalEventHub: globalHub,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      heartbeatIntervalMs: 5000,
      upstreamReconnectDelayMs: 0,
      fetchImpl,
    });

    const socket = new FakeSocket();
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchCalls).toBe(1);
    expect(socket.sent.some((frame) => frame.type === 'event' && frame.eventId === 'evt-1')).toBe(true);

    // The managed process was restarted onto a new port while the old
    // process's SSE stream stays open (orphaned survivor).
    port = 5000;
    runtime.rebindUpstream();
    await new Promise((resolve) => setTimeout(resolve, 20));

    // The hub dialed the new port and the connected client received events
    // from the new upstream without reconnecting its own socket.
    expect(fetchCalls).toBe(2);
    expect(fetchImpl.mock.calls[1][0]).toContain(':5000/api/event');
    expect(socket.sent.some((frame) => frame.type === 'event' && frame.eventId === 'evt-2')).toBe(true);

    socket.close();
    await runtime.close();
  });

  it('closes directory-scoped sockets so their pinned readers reconnect to the new port', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let port = 4096;
    let fetchCalls = 0;

    const buildOpenCodeUrl = vi.fn(() => `http://127.0.0.1:${port}/event`);
    const fetchImpl = vi.fn(async (_url, options) => {
      fetchCalls += 1;
      return createSseResponse({
        signal: options.signal,
        holdOpen: true,
        blocks: ['data: {"id":"evt-1","type":"server.connected","properties":{}}\n\n'],
      });
    });

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      heartbeatIntervalMs: 5000,
      upstreamReconnectDelayMs: 0,
      fetchImpl,
    });

    const directorySocket = new FakeSocket();
    runtime.wsServer.emit('connection', directorySocket, { url: '/api/event/ws?directory=%2Fproj' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(fetchCalls).toBe(1);

    port = 5000;
    runtime.rebindUpstream();

    expect(directorySocket.readyState).toBe(3);
    expect(directorySocket.closeCalls.length).toBeGreaterThan(0);

    directorySocket.close();
    await runtime.close();
  });
=======
class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.readyState = 1;
    this.sent = [];
    this.closeCalls = [];
  }

  send(payload) {
    const frame = JSON.parse(payload);
    this.sent.push(frame);
    this.emit('frame', frame);
  }

  waitForFrame(predicate) {
    if (this.sent.some(predicate)) return Promise.resolve();
    return new Promise(resolve => {
      const onFrame = frame => {
        if (!predicate(frame)) return;
        this.removeListener('frame', onFrame);
        resolve();
      };
      this.on('frame', onFrame);
    });
  }

  ping() {
    void 0;
  }

  close(code, reason) {
    if (this.readyState === 3) {
      return;
    }
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
    this.emit('close');
  }
}

function createSseResponse({ blocks = [], signal, holdOpen = false }) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index < blocks.length) {
              const next = blocks[index++];
              return { value: encoder.encode(next), done: false };
            }

            if (!holdOpen) {
              return { value: undefined, done: true };
            }

            return new Promise((resolve, reject) => {
              const onAbort = () => {
                signal.removeEventListener('abort', onAbort);
                const error = new Error('Aborted');
                error.name = 'AbortError';
                reject(error);
              };
              signal.addEventListener('abort', onAbort, { once: true });
            });
          },
        };
      },
    },
  };
}

describe('rebindUpstream (#2638)', () => {
  it('restarts the shared hub upstream so a connected client resumes receiving events on the new port', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let port = 4096;
    let fetchCalls = 0;

    // Port changes after a managed restart: buildOpenCodeUrl resolves the
    // CURRENT port on every attempt, exactly like production network-runtime.
    const buildOpenCodeUrl = vi.fn(() => `http://127.0.0.1:${port}/api/event`);
    const fetchImpl = vi.fn(async (_url, options) => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: ['data: {"id":"evt-1","type":"server.connected","properties":{}}\n\n'],
        });
      }
      return createSseResponse({
        signal: options.signal,
        holdOpen: true,
        blocks: ['data: {"id":"evt-2","type":"session.updated","properties":{"sessionID":"ses_1"}}\n\n'],
      });
    });

    const globalHub = createGlobalMessageStreamHub({
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl,
      upstreamReconnectDelayMs: 0,
    });

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      globalEventHub: globalHub,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      heartbeatIntervalMs: 5000,
      upstreamReconnectDelayMs: 0,
      fetchImpl,
    });

    const socket = new FakeSocket();
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });
    await socket.waitForFrame(frame => frame.eventId === 'evt-1');
    expect(fetchCalls).toBe(1);
    expect(socket.sent.some((frame) => frame.type === 'event' && frame.eventId === 'evt-1')).toBe(true);

    // The managed process was restarted onto a new port while the old
    // process's SSE stream stays open (orphaned survivor).
    port = 5000;
    runtime.rebindUpstream();
    await socket.waitForFrame(frame => frame.eventId === 'evt-2');

    // The hub dialed the new port and the connected client received events
    // from the new upstream without reconnecting its own socket.
    expect(fetchCalls).toBe(2);
    expect(fetchImpl.mock.calls[1][0]).toContain(':5000/api/event');
    expect(socket.sent.some((frame) => frame.type === 'event' && frame.eventId === 'evt-2')).toBe(true);

    socket.close();
    await runtime.close();
  });

  it('closes directory-scoped sockets so their pinned readers reconnect to the new port', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let port = 4096;
    let fetchCalls = 0;

    const buildOpenCodeUrl = vi.fn(() => `http://127.0.0.1:${port}/event`);
    const fetchImpl = vi.fn(async (_url, options) => {
      fetchCalls += 1;
      return createSseResponse({
        signal: options.signal,
        holdOpen: true,
        blocks: ['data: {"id":"evt-1","type":"server.connected","properties":{}}\n\n'],
      });
    });

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      heartbeatIntervalMs: 5000,
      upstreamReconnectDelayMs: 0,
      fetchImpl,
    });

    const directorySocket = new FakeSocket();
    runtime.wsServer.emit('connection', directorySocket, { url: '/api/event/ws?directory=%2Fproj' });
    await directorySocket.waitForFrame(frame => frame.eventId === 'evt-1');
    expect(fetchCalls).toBe(1);

    port = 5000;
    runtime.rebindUpstream();

    expect(directorySocket.readyState).toBe(3);
    expect(directorySocket.closeCalls.length).toBeGreaterThan(0);

    directorySocket.close();
    await runtime.close();
  });
>>>>>>> upstream/main
});
