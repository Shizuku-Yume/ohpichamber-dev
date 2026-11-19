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

<<<<<<< HEAD
describe('canonical WS delivery', () => {
  it('shares Host-watched streams across browser sockets without starting an execution reader per socket', async () => {
    const f = fixture(); const first = new Socket(); const second = new Socket();
||||||| bc50ba56aa
it('delivers oversized events live, but reports a replay gap instead of replaying across it', async () => {
  const hub = createGlobalMessageStreamHub({
    buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}),
    replayByteLimit: 512,
    fetchImpl: async (_url, options) => createSseResponse({
      signal: options.signal, holdOpen: true,
      blocks: [
        'data: {"id":"first","type":"first","properties":{}}\n\n',
        `data: ${JSON.stringify({ id: 'large', type: 'large', properties: { text: '界'.repeat(1024) } })}\n\n`,
        'data: {"id":"last","type":"last","properties":{}}\n\n',
      ],
    }),
  });
  const runtime = createMessageStreamWsRuntime({
    server: new EventEmitter(), globalEventHub: hub, wsClients: new Set(),
    uiAuthController: null, isRequestOriginAllowed: async () => true,
    rejectWebSocketUpgrade() {}, buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}), processForwardedEventPayload() {},
  });
  const first = new FakeSocket();
  const reconnect = new FakeSocket();
  try {
    runtime.wsServer.emit('connection', first, { url: '/api/global/event/ws' });
    await expect.poll(() => first.sent.filter(frame => frame.type === 'event').length).toBe(3);
    expect(first.sent.find(frame => frame.eventId === 'large').payload.properties.text).toHaveLength(1024);
    expect(hub.replayAfter('first')).toBeNull();
    expect(hub.replayAfter('last')).toEqual([]);
    runtime.wsServer.emit('connection', reconnect, { url: '/api/global/event/ws?lastEventId=first' });
    await expect.poll(() => reconnect.sent.length).toBeGreaterThan(0);
    expect(reconnect.sent).toEqual([{ type: 'ready', scope: 'global', replayReset: true }]);
  } finally {
    first.close(); reconnect.close(); hub.stop(); await runtime.close();
  }
});

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

describe('event stream broadcaster', () => {
  it('fans out synthetic events to SSE and WS clients', () => {
    const sseEvents = [];
    const wsPayloads = [];
    const sseClient = { id: 'sse-1' };
    const wsClient = {
      readyState: 1,
      send(payload) {
        wsPayloads.push(JSON.parse(payload));
      },
    };

    const broadcast = createGlobalUiEventBroadcaster({
      sseClients: new Set([sseClient]),
      wsClients: new Set([wsClient]),
      writeSseEvent(res, payload) {
        sseEvents.push({ res, payload });
      },
    });

    broadcast({ type: 'openchamber:session-status' }, { eventId: 'evt-1', directory: '/tmp/project' });

    expect(sseEvents).toEqual([
      {
        res: sseClient,
        payload: { type: 'openchamber:session-status' },
      },
    ]);
    expect(wsPayloads).toEqual([
      {
        type: 'event',
        payload: { type: 'openchamber:session-status' },
        eventId: 'evt-1',
        directory: '/tmp/project',
      },
    ]);
  });

  it('removes websocket clients that fail to receive a payload', () => {
    const wsClients = new Set([
      {
        readyState: 1,
        send() {
          throw new Error('socket write failed');
        },
      },
    ]);

    const broadcast = createGlobalUiEventBroadcaster({
      sseClients: new Set(),
      wsClients,
      writeSseEvent() {
        throw new Error('should not be called');
      },
    });

    broadcast({ type: 'openchamber:notification' });

    expect(wsClients.size).toBe(0);
  });
});

describe('message stream websocket runtime', () => {
  it('shares one global upstream SSE reader across multiple websocket clients', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let fetchCalls = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        fetchCalls += 1;
        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [
            'data: {"id":"evt-1","type":"server.connected","data":{}}\n\n',
          ],
        });
      },
    });

    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    runtime.wsServer.emit('connection', firstSocket, { url: '/api/global/event/ws' });
    runtime.wsServer.emit('connection', secondSocket, { url: '/api/global/event/ws' });

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(fetchCalls).toBe(1);
    expect(firstSocket.sent).toContainEqual({ type: 'ready', scope: 'global' });
    expect(secondSocket.sent).toContainEqual({ type: 'ready', scope: 'global' });
    expect(firstSocket.sent).toContainEqual({
      type: 'event',
      payload: { id: 'evt-1', type: 'server.connected', data: {} },
      eventId: 'evt-1',
      directory: 'global',
    });
    expect(secondSocket.sent).toContainEqual({
      type: 'event',
      payload: { id: 'evt-1', type: 'server.connected', data: {} },
      eventId: 'evt-1',
      directory: 'global',
    });

    firstSocket.close();
    secondSocket.close();
    await runtime.close();
  });

  it('replays buffered global events after a reconnecting client Last-Event-ID', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let fetchCalls = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          return createSseResponse({
            signal: options.signal,
            holdOpen: true,
            blocks: [
              'data: {"id":"evt-1","type":"server.connected","data":{}}\n\n',
              'data: {"id":"evt-2","type":"session.renamed","location":{"directory":"/tmp/project"},"data":{"sessionID":"s1","title":"t"}}\n\n',
            ],
          });
        }

        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [],
        });
      },
    });

    const firstSocket = new FakeSocket();
    runtime.wsServer.emit('connection', firstSocket, { url: '/api/global/event/ws' });

    await new Promise((resolve) => setTimeout(resolve, 5));
    firstSocket.close();

    const secondSocket = new FakeSocket();
    runtime.wsServer.emit('connection', secondSocket, { url: '/api/global/event/ws?lastEventId=evt-1' });

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(secondSocket.sent).toContainEqual({ type: 'ready', scope: 'global' });
    expect(secondSocket.sent).toContainEqual({
      type: 'event',
      payload: { id: 'evt-2', type: 'session.renamed', location: { directory: '/tmp/project' }, data: { sessionID: 's1', title: 't' } },
      eventId: 'evt-2',
      directory: '/tmp/project',
    });

    secondSocket.close();
    await runtime.close();
  });

  it('keeps directory websocket streams on separate upstream readers', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    const fetchUrls = [];

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (url, options) => {
        fetchUrls.push(url);
        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [
            'data: {"id":"evt-1","type":"server.connected","data":{}}\n\n',
          ],
        });
      },
    });

    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    runtime.wsServer.emit('connection', firstSocket, { url: '/api/event/ws?directory=/tmp/one' });
    runtime.wsServer.emit('connection', secondSocket, { url: '/api/event/ws?directory=/tmp/two' });

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(fetchUrls).toHaveLength(2);
    expect(new URL(fetchUrls[0]).searchParams.get('directory')).toBe('/tmp/one');
    expect(new URL(fetchUrls[1]).searchParams.get('directory')).toBe('/tmp/two');
    expect(firstSocket.sent).toContainEqual({ type: 'ready', scope: 'directory' });
    expect(secondSocket.sent).toContainEqual({ type: 'ready', scope: 'directory' });

    firstSocket.close();
    secondSocket.close();
    await runtime.close();
  });

  it('closes the websocket and triggers health check on initial upstream unavailable response', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let triggerHealthCheckCalls = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      triggerHealthCheck: () => {
        triggerHealthCheckCalls += 1;
      },
      upstreamReconnectDelayMs: 0,
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        body: null,
      }),
    });

    const socket = new FakeSocket();
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(socket.sent).toEqual([
      {
        type: 'error',
        message: 'OpenCode event stream unavailable (503)',
      },
    ]);
    expect(socket.closeCalls).toEqual([
      {
        code: 1011,
        reason: 'OpenCode event stream unavailable',
      },
    ]);
    expect(triggerHealthCheckCalls).toBe(1);
    expect(wsClients.size).toBe(0);

    await runtime.close();
  });

  it('closes the websocket without health check when OpenCode URL cannot be built', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let triggerHealthCheckCalls = 0;
    let fetchCalls = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl() {
        throw new Error('missing OpenCode port');
      },
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      triggerHealthCheck: () => {
        triggerHealthCheckCalls += 1;
      },
      upstreamReconnectDelayMs: 0,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error('fetch should not be called');
      },
    });

    const socket = new FakeSocket();
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(socket.sent).toEqual([
      {
        type: 'error',
        message: 'OpenCode service unavailable',
      },
    ]);
    expect(socket.closeCalls).toEqual([
      {
        code: 1011,
        reason: 'OpenCode service unavailable',
      },
    ]);
    expect(fetchCalls).toBe(0);
    expect(triggerHealthCheckCalls).toBe(0);

    await runtime.close();
  });

  it('reconnects a stalled upstream SSE stream and resumes from the last event id', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let triggerHealthCheckCalls = 0;
    const fetchCalls = [];
    let upstreamAttempt = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      triggerHealthCheck: () => {
        triggerHealthCheckCalls += 1;
      },
      heartbeatIntervalMs: 50,
      upstreamStallTimeoutMs: 20,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        const lastEventId = options?.headers?.['Last-Event-ID'] ?? null;
        fetchCalls.push(lastEventId);
        upstreamAttempt += 1;

        if (upstreamAttempt === 1) {
          return createSseResponse({
            signal: options.signal,
            holdOpen: true,
            blocks: [
              'data: {"id":"evt-1","type":"server.connected","data":{}}\n\n',
            ],
          });
        }

        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [
            'data: {"id":"evt-2","type":"server.connected","data":{}}\n\n',
          ],
        });
      },
    });

    const socket = new FakeSocket();
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });

=======
it('delivers oversized events live, but reports a replay gap instead of replaying across it', async () => {
  const hub = createGlobalMessageStreamHub({
    buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}),
    replayByteLimit: 512,
    fetchImpl: async (_url, options) => createSseResponse({
      signal: options.signal, holdOpen: true,
      blocks: [
        'data: {"id":"first","type":"first","properties":{}}\n\n',
        `data: ${JSON.stringify({ id: 'large', type: 'large', properties: { text: '界'.repeat(1024) } })}\n\n`,
        'data: {"id":"last","type":"last","properties":{}}\n\n',
      ],
    }),
  });
  const runtime = createMessageStreamWsRuntime({
    server: new EventEmitter(), globalEventHub: hub, wsClients: new Set(),
    uiAuthController: null, isRequestOriginAllowed: async () => true,
    rejectWebSocketUpgrade() {}, buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}), processForwardedEventPayload() {},
  });
  const first = new FakeSocket();
  const reconnect = new FakeSocket();
  try {
    runtime.wsServer.emit('connection', first, { url: '/api/global/event/ws' });
    await expect.poll(() => first.sent.filter(frame => frame.type === 'event').length).toBe(3);
    expect(first.sent.find(frame => frame.eventId === 'large').payload.properties.text).toHaveLength(1024);
    expect(hub.replayAfter('first')).toBeNull();
    expect(hub.replayAfter('last')).toEqual([]);
    runtime.wsServer.emit('connection', reconnect, { url: '/api/global/event/ws?lastEventId=first' });
    await expect.poll(() => reconnect.sent.length).toBeGreaterThan(0);
    expect(reconnect.sent).toEqual([{ type: 'ready', scope: 'global', replayReset: true, cursor: 'last' }]);
  } finally {
    first.close(); reconnect.close(); hub.stop(); await runtime.close();
  }
});

it('reports a complete replay, and resets a cursor from before an upstream reconnect', async () => {
  let reads = 0;
  const hub = createGlobalMessageStreamHub({
    buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}),
    upstreamReconnectDelayMs: 1,
    fetchImpl: async (_url, options) => {
      reads += 1;
      return reads === 1
        ? createSseResponse({ signal: options.signal, blocks: ['data: {"id":"before","type":"before","properties":{}}\n\n'] })
        : createSseResponse({
          signal: options.signal, holdOpen: true,
          blocks: ['data: {"id":"after","type":"after","properties":{}}\n\n', 'data: {"id":"last","type":"last","properties":{}}\n\n'],
        });
    },
  });
  const runtime = createMessageStreamWsRuntime({
    server: new EventEmitter(), globalEventHub: hub, wsClients: new Set(),
    uiAuthController: null, isRequestOriginAllowed: async () => true,
    rejectWebSocketUpgrade() {}, buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}), processForwardedEventPayload() {},
  });
  const first = new FakeSocket();
  const acrossGap = new FakeSocket();
  const current = new FakeSocket();
  const idle = new FakeSocket();
  const idleAgain = new FakeSocket();
  try {
    runtime.wsServer.emit('connection', first, { url: '/api/global/event/ws' });
    await expect.poll(() => first.sent.filter(frame => frame.type === 'event').map(frame => frame.eventId)).toEqual(['before', 'after', 'last']);
    runtime.wsServer.emit('connection', acrossGap, { url: '/api/global/event/ws?lastEventId=before' });
    await expect.poll(() => acrossGap.sent.length).toBeGreaterThan(0);
    expect(acrossGap.sent).toEqual([{ type: 'ready', scope: 'global', replayReset: true, cursor: 'last' }]);
    runtime.wsServer.emit('connection', current, { url: '/api/global/event/ws?lastEventId=after' });
    await expect.poll(() => current.sent.length).toBe(2);
    expect(current.sent[0]).toEqual({ type: 'ready', scope: 'global', replayed: true });
    expect(current.sent[1].eventId).toBe('last');
    // A client that received no event resumes from the cursor its ready frame named.
    runtime.wsServer.emit('connection', idle, { url: '/api/global/event/ws' });
    await expect.poll(() => idle.sent.length).toBe(1);
    expect(idle.sent[0]).toEqual({ type: 'ready', scope: 'global', cursor: 'last' });
    runtime.wsServer.emit('connection', idleAgain, { url: '/api/global/event/ws?lastEventId=last' });
    await expect.poll(() => idleAgain.sent.length).toBe(1);
    expect(idleAgain.sent).toEqual([{ type: 'ready', scope: 'global', replayed: true }]);
  } finally {
    first.close(); acrossGap.close(); current.close(); idle.close(); idleAgain.close(); hub.stop(); await runtime.close();
  }
});

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

describe('event stream broadcaster', () => {
  it('fans out synthetic events to SSE and WS clients', () => {
    const sseEvents = [];
    const wsPayloads = [];
    const sseClient = { id: 'sse-1' };
    const wsClient = {
      readyState: 1,
      send(payload) {
        wsPayloads.push(JSON.parse(payload));
      },
    };

    const broadcast = createGlobalUiEventBroadcaster({
      sseClients: new Set([sseClient]),
      wsClients: new Set([wsClient]),
      writeSseEvent(res, payload) {
        sseEvents.push({ res, payload });
      },
    });

    broadcast({ type: 'openchamber:session-status' }, { eventId: 'evt-1', directory: '/tmp/project' });

    expect(sseEvents).toEqual([
      {
        res: sseClient,
        payload: { type: 'openchamber:session-status' },
      },
    ]);
    expect(wsPayloads).toEqual([
      {
        type: 'event',
        payload: { type: 'openchamber:session-status' },
        eventId: 'evt-1',
        directory: '/tmp/project',
      },
    ]);
  });

  it('removes websocket clients that fail to receive a payload', () => {
    const wsClients = new Set([
      {
        readyState: 1,
        send() {
          throw new Error('socket write failed');
        },
      },
    ]);

    const broadcast = createGlobalUiEventBroadcaster({
      sseClients: new Set(),
      wsClients,
      writeSseEvent() {
        throw new Error('should not be called');
      },
    });

    broadcast({ type: 'openchamber:notification' });

    expect(wsClients.size).toBe(0);
  });
});

describe('message stream websocket runtime', () => {
  it('shares one global upstream SSE reader across multiple websocket clients', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let fetchCalls = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        fetchCalls += 1;
        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [
            'data: {"id":"evt-1","type":"server.connected","data":{}}\n\n',
          ],
        });
      },
    });

    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    runtime.wsServer.emit('connection', firstSocket, { url: '/api/global/event/ws' });
    runtime.wsServer.emit('connection', secondSocket, { url: '/api/global/event/ws' });

    await Promise.all([firstSocket, secondSocket].map(socket => socket.waitForFrame(frame => frame.eventId === 'evt-1')));

    expect(fetchCalls).toBe(1);
    expect(firstSocket.sent).toContainEqual(expect.objectContaining({ type: 'ready', scope: 'global' }));
    expect(secondSocket.sent).toContainEqual(expect.objectContaining({ type: 'ready', scope: 'global' }));
    expect(firstSocket.sent).toContainEqual({
      type: 'event',
      payload: { id: 'evt-1', type: 'server.connected', data: {} },
      eventId: 'evt-1',
      directory: 'global',
    });
    expect(secondSocket.sent).toContainEqual({
      type: 'event',
      payload: { id: 'evt-1', type: 'server.connected', data: {} },
      eventId: 'evt-1',
      directory: 'global',
    });

    firstSocket.close();
    secondSocket.close();
    await runtime.close();
  });

  it('resets a reconnecting client whose cursor predates a hub restart', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let fetchCalls = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          return createSseResponse({
            signal: options.signal,
            holdOpen: true,
            blocks: [
              'data: {"id":"evt-1","type":"server.connected","data":{}}\n\n',
              'data: {"id":"evt-2","type":"session.renamed","location":{"directory":"/tmp/project"},"data":{"sessionID":"s1","title":"t"}}\n\n',
            ],
          });
        }

        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [],
        });
      },
    });

    const firstSocket = new FakeSocket();
    runtime.wsServer.emit('connection', firstSocket, { url: '/api/global/event/ws' });

    await firstSocket.waitForFrame(frame => frame.eventId === 'evt-2');
    firstSocket.close();

    const secondSocket = new FakeSocket();
    runtime.wsServer.emit('connection', secondSocket, { url: '/api/global/event/ws?lastEventId=evt-1' });

    await secondSocket.waitForFrame(frame => frame.type === 'ready');

    // The hub read nothing between the two sockets, so the suffix it kept
    // cannot stand for what the client missed.
    expect(secondSocket.sent).toEqual([{ type: 'ready', scope: 'global', replayReset: true, cursor: expect.any(String) }]);

    secondSocket.close();
    await runtime.close();
  });

  it('keeps directory websocket streams on separate upstream readers', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    const fetchUrls = [];

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (url, options) => {
        fetchUrls.push(url);
        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [
            'data: {"id":"evt-1","type":"server.connected","data":{}}\n\n',
          ],
        });
      },
    });

    const firstSocket = new FakeSocket();
    const secondSocket = new FakeSocket();
    runtime.wsServer.emit('connection', firstSocket, { url: '/api/event/ws?directory=/tmp/one' });
    runtime.wsServer.emit('connection', secondSocket, { url: '/api/event/ws?directory=/tmp/two' });

    await Promise.all([firstSocket, secondSocket].map(socket => socket.waitForFrame(frame => frame.eventId === 'evt-1')));

    expect(fetchUrls).toHaveLength(2);
    expect(new URL(fetchUrls[0]).searchParams.get('directory')).toBe('/tmp/one');
    expect(new URL(fetchUrls[1]).searchParams.get('directory')).toBe('/tmp/two');
    expect(firstSocket.sent).toContainEqual({ type: 'ready', scope: 'directory' });
    expect(secondSocket.sent).toContainEqual({ type: 'ready', scope: 'directory' });

    firstSocket.close();
    secondSocket.close();
    await runtime.close();
  });

  it('closes the websocket and triggers health check on initial upstream unavailable response', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let triggerHealthCheckCalls = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      triggerHealthCheck: () => {
        triggerHealthCheckCalls += 1;
      },
      upstreamReconnectDelayMs: 0,
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        body: null,
      }),
    });

    const socket = new FakeSocket();
    const closed = new Promise(resolve => socket.once('close', resolve));
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });

    await closed;

    expect(socket.sent).toEqual([
      {
        type: 'error',
        message: 'OpenCode event stream unavailable (503)',
      },
    ]);
    expect(socket.closeCalls).toEqual([
      {
        code: 1011,
        reason: 'OpenCode event stream unavailable',
      },
    ]);
    expect(triggerHealthCheckCalls).toBe(1);
    expect(wsClients.size).toBe(0);

    await runtime.close();
  });

  it('closes the websocket without health check when OpenCode URL cannot be built', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let triggerHealthCheckCalls = 0;
    let fetchCalls = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl() {
        throw new Error('missing OpenCode port');
      },
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      triggerHealthCheck: () => {
        triggerHealthCheckCalls += 1;
      },
      upstreamReconnectDelayMs: 0,
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error('fetch should not be called');
      },
    });

    const socket = new FakeSocket();
    const closed = new Promise(resolve => socket.once('close', resolve));
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });

    await closed;

    expect(socket.sent).toEqual([
      {
        type: 'error',
        message: 'OpenCode service unavailable',
      },
    ]);
    expect(socket.closeCalls).toEqual([
      {
        code: 1011,
        reason: 'OpenCode service unavailable',
      },
    ]);
    expect(fetchCalls).toBe(0);
    expect(triggerHealthCheckCalls).toBe(0);

    await runtime.close();
  });

  it('reconnects a stalled upstream SSE stream and resumes from the last event id', async () => {
    const server = new EventEmitter();
    const wsClients = new Set();
    let triggerHealthCheckCalls = 0;
    const fetchCalls = [];
    let upstreamAttempt = 0;

    const runtime = createMessageStreamWsRuntime({
      server,
      uiAuthController: null,
      isRequestOriginAllowed: async () => true,
      rejectWebSocketUpgrade() {
        throw new Error('upgrade should not be used in this test');
      },
      buildOpenCodeUrl: (path) => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      processForwardedEventPayload() {},
      wsClients,
      triggerHealthCheck: () => {
        triggerHealthCheckCalls += 1;
      },
      heartbeatIntervalMs: 50,
      upstreamStallTimeoutMs: 20,
      upstreamReconnectDelayMs: 0,
      fetchImpl: async (_url, options) => {
        const lastEventId = options?.headers?.['Last-Event-ID'] ?? null;
        fetchCalls.push(lastEventId);
        upstreamAttempt += 1;

        if (upstreamAttempt === 1) {
          return createSseResponse({
            signal: options.signal,
            holdOpen: true,
            blocks: [
              'data: {"id":"evt-1","type":"server.connected","data":{}}\n\n',
            ],
          });
        }

        return createSseResponse({
          signal: options.signal,
          holdOpen: true,
          blocks: [
            'data: {"id":"evt-2","type":"server.connected","data":{}}\n\n',
          ],
        });
      },
    });

    const socket = new FakeSocket();
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });

>>>>>>> upstream/main
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

<<<<<<< HEAD
  it('cannot lose the first event while a session socket becomes ready', async () => {
    const f = fixture(); const socket = new Socket();
    try {
      f.push(encodeEvent(event(1)));
      const done = deferred(); f.hub.subscribeFrame(done.resolve);
      f.runtime.wsServer.emit('connection', socket, { url: '/api/event/ws?sessionId=session' }); await done.promise;
      expect(socket.sent[0]).toMatchObject({ type: 'ready', scope: 'session', sessionId: 'session' });
      expect(socket.sent[1].payload.sequence).toBe('1');
    } finally { socket.close(); await f.hub.stop(); await f.runtime.close(); }
||||||| bc50ba56aa
    const socket = new FakeSocket();
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(socket.sent).toContainEqual({
      type: 'event',
      payload: { id: 'evt-1', type: 'session.renamed', location: { directory: '/tmp/project' }, data: { sessionID: 's1', title: 't' } },
      eventId: 'evt-1',
      directory: '/tmp/project',
    });
    expect(socket.sent).toContainEqual({
      type: 'event',
      payload: { type: 'openchamber:session-status', sessionID: 'ses_1' },
      directory: 'global',
    });

    socket.close();
    await runtime.close();
=======
    const socket = new FakeSocket();
    runtime.wsServer.emit('connection', socket, { url: '/api/global/event/ws' });

    await socket.waitForFrame(frame => frame.payload?.type === 'openchamber:session-status');

    expect(socket.sent).toContainEqual({
      type: 'event',
      payload: { id: 'evt-1', type: 'session.renamed', location: { directory: '/tmp/project' }, data: { sessionID: 's1', title: 't' } },
      eventId: 'evt-1',
      directory: '/tmp/project',
    });
    expect(socket.sent).toContainEqual({
      type: 'event',
      payload: { type: 'openchamber:session-status', sessionID: 'ses_1' },
      directory: 'global',
    });

    socket.close();
    await runtime.close();
>>>>>>> upstream/main
  });
});
