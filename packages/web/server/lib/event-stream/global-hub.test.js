<<<<<<< HEAD
import { describe, expect, it, vi } from 'vitest';
||||||| bc50ba56aa
import { describe, expect, it, vi } from 'vitest';

=======
import { afterEach, describe, expect, it, vi } from 'vitest';

>>>>>>> upstream/main
import { createGlobalMessageStreamHub } from './global-hub.js';
<<<<<<< HEAD
import { deferred, encodeEvent, event, scope, snapshot, streamBoundary } from './canonical-test-fixtures.js';
||||||| bc50ba56aa
=======
import { DELTA_COALESCE_WINDOW_MS } from './delta-coalescer.js';

afterEach(() => vi.useRealTimers());
>>>>>>> upstream/main

<<<<<<< HEAD
const fixture = (options = {}) => {
  const boundary = streamBoundary();
  const hub = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: async () => scope, ...options });
  return { hub, ...boundary };
||||||| bc50ba56aa
it('bounds a contiguous replay suffix by UTF-8 bytes and event count', async () => {
  // v2 carries the event id inside the payload; there are no `id:` SSE lines.
  const blocks = Array.from({ length: 8 }, (_, i) => `data: ${JSON.stringify({ id: `e${i}`, type: 'message', properties: { text: '界'.repeat(40) } })}\n\n`);
  const received = [];
  const hub = createGlobalMessageStreamHub({
    buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}), replayLimit: 3, replayByteLimit: 600,
    upstreamReconnectDelayMs: 60_000,
    fetchImpl: async () => createSseResponse({ blocks }),
  });
  hub.subscribeEvent(event => received.push(event.eventId));
  try {
    hub.start();
    await waitForAssertion(() => expect(received).toHaveLength(8));
    expect(hub.replayAfter('e0')).toBeNull();
    expect(hub.replayAfter('e5')).toBeNull();
    const tail = hub.replayAfter('e6');
    expect(tail.map(entry => entry.eventId)).toEqual(['e7']);
    expect(Buffer.byteLength(tail[0].serializedFrame) * 2).toBeLessThanOrEqual(600);
    expect(Buffer.byteLength(tail[0].serializedFrame) * 3).toBeGreaterThan(600);
  } finally { hub.stop(); }
});

function createSseResponse({ blocks = [] } = {}) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index < blocks.length) {
              return { value: encoder.encode(blocks[index++]), done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
    },
  };
}

async function waitForAssertion(assertion) {
  const deadline = Date.now() + 1000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

const deltaBlock = (id, text, ordinal = 1) => `id: ${id}\ndata: ${JSON.stringify({
  id, type: 'session.text.delta',
  data: { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal, delta: text },
})}\n\n`;

const createDeltaHub = ({ blocks, deltaCoalesceWindowMs }) => createGlobalMessageStreamHub({
  buildOpenCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
  getOpenCodeAuthHeaders: () => ({}),
  upstreamReconnectDelayMs: 60_000,
  deltaCoalesceWindowMs,
  fetchImpl: async () => createSseResponse({ blocks }),
});

// What a browser holds after applying frames in order: text per stream
// ordinal, and the text each stream had when a snapshot barrier passed.
const applyFrames = (frames) => {
  const text = {};
  const barriers = [];
  for (const frame of frames) {
    const payload = frame.payload;
    if (payload.type === 'session.text.delta') {
      text[payload.data.ordinal] = (text[payload.data.ordinal] ?? '') + payload.data.delta;
    } else {
      barriers.push({ id: payload.id, seen: { ...text } });
    }
  }
  return { text, barriers };
=======
it('bounds a contiguous replay suffix by UTF-8 bytes and event count', async () => {
  // v2 carries the event id inside the payload; there are no `id:` SSE lines.
  const blocks = Array.from({ length: 8 }, (_, i) => `data: ${JSON.stringify({ id: `e${i}`, type: 'message', properties: { text: '界'.repeat(40) } })}\n\n`);
  const received = [];
  const hub = createGlobalMessageStreamHub({
    buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}), replayLimit: 3, replayByteLimit: 600,
    upstreamReconnectDelayMs: 60_000,
    fetchImpl: async () => createSseResponse({ blocks }),
  });
  hub.subscribeEvent(event => received.push(event.eventId));
  try {
    await readUpstream(hub);
    expect(received).toHaveLength(8);
    expect(hub.replayAfter('e0')).toBeNull();
    expect(hub.replayAfter('e5')).toBeNull();
    const tail = hub.replayAfter('e6');
    expect(tail.map(entry => entry.eventId)).toEqual(['e7']);
    expect(Buffer.byteLength(tail[0].serializedFrame) * 2).toBeLessThanOrEqual(600);
    expect(Buffer.byteLength(tail[0].serializedFrame) * 3).toBeGreaterThan(600);
  } finally { hub.stop(); }
});

function createSseResponse({ blocks = [] } = {}) {
  const encoder = new TextEncoder();
  let index = 0;

  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index < blocks.length) {
              return { value: encoder.encode(blocks[index++]), done: false };
            }
            return { value: undefined, done: true };
          },
        };
      },
    },
  };
}

function readUpstream(hub) {
  const disconnected = new Promise(resolve => {
    const unsubscribe = hub.subscribeStatus(status => {
      if (status.type !== 'disconnect') return;
      unsubscribe();
      resolve();
    });
  });
  hub.start();
  return disconnected;
}

const deltaBlock = (id, text, ordinal = 1) => `id: ${id}\ndata: ${JSON.stringify({
  id, type: 'session.text.delta',
  data: { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal, delta: text },
})}\n\n`;

const createDeltaHub = ({ blocks, deltaCoalesceWindowMs }) => createGlobalMessageStreamHub({
  buildOpenCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
  getOpenCodeAuthHeaders: () => ({}),
  upstreamReconnectDelayMs: 60_000,
  deltaCoalesceWindowMs,
  fetchImpl: async () => createSseResponse({ blocks }),
});

// What a browser holds after applying frames in order: text per stream
// ordinal, and the text each stream had when a snapshot barrier passed.
const applyFrames = (frames) => {
  const text = {};
  const barriers = [];
  for (const frame of frames) {
    const payload = frame.payload;
    if (payload.type === 'session.text.delta') {
      text[payload.data.ordinal] = (text[payload.data.ordinal] ?? '') + payload.data.delta;
    } else {
      barriers.push({ id: payload.id, seen: { ...text } });
    }
  }
  return { text, barriers };
>>>>>>> upstream/main
};

<<<<<<< HEAD
describe('canonical global event hub', () => {
  it('resolves Host scope before private access and starts from the captured snapshot cursor', async () => {
    const gate = deferred(); const boundary = streamBoundary();
    const hub = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: () => gate.promise });
    const opened = hub.subscribeSession('session');
    expect(boundary.calls).toEqual([]);
    gate.resolve(scope); await opened;
    expect(boundary.calls.map((call) => call.path)).toEqual(['/api/agent/v1/sessions/session/snapshot', '/api/agent/v1/sessions/session/events']);
    expect(boundary.calls[1].init.headers['Last-Event-ID']).toBe('epoch:0');
    await hub.stop(); expect(boundary.cancelled()).toBe(true);
||||||| bc50ba56aa
describe('delta coalescing in the global hub', () => {
  it('delivers the same text in far fewer frames', async () => {
    const words = Array.from({ length: 120 }, (_, index) => `w${index} `);
    const hub = createDeltaHub({ blocks: words.map((word, index) => deltaBlock(`e${String(index).padStart(4, '0')}`, word)) });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    try {
      hub.start();
      await waitForAssertion(() => expect(applyFrames(received).text[1]).toBe(words.join('')));
      expect(received.length).toBeLessThanOrEqual(3);
      expect(received.at(-1).eventId).toBe('e0119');
    } finally { hub.stop(); }
=======
describe('delta coalescing in the global hub', () => {
  it('delivers the same text in far fewer frames', async () => {
    vi.useFakeTimers();
    const words = Array.from({ length: 120 }, (_, index) => `w${index} `);
    const hub = createDeltaHub({ blocks: words.map((word, index) => deltaBlock(`e${String(index).padStart(4, '0')}`, word)) });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    try {
      await readUpstream(hub);
      await vi.advanceTimersByTimeAsync(DELTA_COALESCE_WINDOW_MS);
      expect(applyFrames(received).text[1]).toBe(words.join(''));
      expect(received.length).toBeLessThanOrEqual(3);
      expect(received.at(-1).eventId).toBe('e0119');
    } finally { hub.stop(); }
>>>>>>> upstream/main
  });

<<<<<<< HEAD
  it('hydrates parsed snapshot consumers before opening the cursor stream or announcing ready', async () => {
    const { hub, calls } = fixture(); const entered = deferred(); const release = deferred();
    hub.subscribeSnapshot(async (captured, resolved) => {
      expect(captured.cursor).toBe('epoch:0'); expect(resolved).toBe(scope);
      entered.resolve(); await release.promise;
    });
    const opened = hub.start(['session']); await entered.promise;
    expect(calls.map((call) => call.path)).toEqual(['/api/agent/v1/sessions/session/snapshot']);
    expect(hub.hasConnected()).toBe(false);
    release.resolve(); await opened;
    expect(calls[1].init.headers['Last-Event-ID']).toBe('epoch:0');
    await hub.stop();
  });
||||||| bc50ba56aa
  it('resumes from any cursor without losing or repeating text', async () => {
    const blocks = [];
    let id = 0;
    const nextId = () => `e${String(id++).padStart(4, '0')}`;
    for (let index = 0; index < 40; index += 1) blocks.push(deltaBlock(nextId(), `a${index}.`, index % 3 === 0 ? 2 : 1));
    const snapshotId = nextId();
    blocks.push(`id: ${snapshotId}\ndata: ${JSON.stringify({ id: snapshotId, type: 'session.text.ended', data: { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal: 1, text: '' } })}\n\n`);
    for (let index = 0; index < 40; index += 1) blocks.push(deltaBlock(nextId(), `b${index}.`));
=======
  it('resumes from any cursor without losing or repeating text', async () => {
    vi.useFakeTimers();
    const blocks = [];
    let id = 0;
    const nextId = () => `e${String(id++).padStart(4, '0')}`;
    for (let index = 0; index < 40; index += 1) blocks.push(deltaBlock(nextId(), `a${index}.`, index % 3 === 0 ? 2 : 1));
    const snapshotId = nextId();
    blocks.push(`id: ${snapshotId}\ndata: ${JSON.stringify({ id: snapshotId, type: 'session.text.ended', data: { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal: 1, text: '' } })}\n\n`);
    for (let index = 0; index < 40; index += 1) blocks.push(deltaBlock(nextId(), `b${index}.`));
>>>>>>> upstream/main

<<<<<<< HEAD
  it('delivers parsed events and private scopes in order even while a consumer awaits', async () => {
    const { hub, push } = fixture(); const gate = deferred(); const seen = [];
    const complete = deferred();
    const seenFirst = deferred();
    hub.subscribeEvent(async (record, resolved) => {
      seen.push([record.sequence, resolved.cwd]);
      if (record.sequence === '1') {
        seenFirst.resolve();
        await gate.promise;
||||||| bc50ba56aa
    const hub = createDeltaHub({ blocks });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    try {
      hub.start();
      const expectedA = [...Array(40).keys()].filter((index) => index % 3 !== 0).map((index) => `a${index}.`).join('')
        + [...Array(40).keys()].map((index) => `b${index}.`).join('');
      await waitForAssertion(() => expect(applyFrames(received).text[1]).toBe(expectedA));
      expect(received.length).toBeLessThan(blocks.length / 4);

      const complete = applyFrames(received);
      // The snapshot barrier saw exactly the text that arrived before it.
      expect(complete.barriers).toHaveLength(1);
      expect(complete.barriers[0].seen[1]).toBe([...Array(40).keys()].filter((index) => index % 3 !== 0).map((index) => `a${index}.`).join(''));

      // A socket that drops after any frame reconnects with that frame's id.
      for (let cut = 0; cut < received.length; cut += 1) {
        const tail = hub.replayAfter(received[cut].eventId);
        expect(tail).not.toBeNull();
        const replayed = tail.map((entry) => JSON.parse(entry.serializedFrame));
        expect(applyFrames([...received.slice(0, cut + 1), ...replayed])).toEqual(complete);
=======
    const hub = createDeltaHub({ blocks });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    try {
      await readUpstream(hub);
      await vi.advanceTimersByTimeAsync(DELTA_COALESCE_WINDOW_MS);
      const expectedA = [...Array(40).keys()].filter((index) => index % 3 !== 0).map((index) => `a${index}.`).join('')
        + [...Array(40).keys()].map((index) => `b${index}.`).join('');
      expect(applyFrames(received).text[1]).toBe(expectedA);
      expect(received.length).toBeLessThan(blocks.length / 4);

      const complete = applyFrames(received);
      // The snapshot barrier saw exactly the text that arrived before it.
      expect(complete.barriers).toHaveLength(1);
      expect(complete.barriers[0].seen[1]).toBe([...Array(40).keys()].filter((index) => index % 3 !== 0).map((index) => `a${index}.`).join(''));

      // A socket that drops after any frame reconnects with that frame's id.
      for (let cut = 0; cut < received.length; cut += 1) {
        const tail = hub.replayAfter(received[cut].eventId);
        expect(tail).not.toBeNull();
        const replayed = tail.map((entry) => JSON.parse(entry.serializedFrame));
        expect(applyFrames([...received.slice(0, cut + 1), ...replayed])).toEqual(complete);
>>>>>>> upstream/main
      }
    });
    hub.subscribeEvent((record) => { if (record.sequence === '2') complete.resolve(); });
    await hub.start(['session']);
    const frame = encodeEvent(event(1)); push(frame.slice(0, 9)); push(frame.slice(9) + encodeEvent(event(2)));
    await seenFirst.promise;
    expect(seen).toEqual([['1', scope.cwd]]);
    gate.resolve(); await complete.promise;
    expect(seen).toEqual([['1', scope.cwd], ['2', scope.cwd]]);
    await hub.stop();
  });

<<<<<<< HEAD
  it('retains a count/UTF-8 byte-bounded contiguous suffix without dropping oversized live events', async () => {
    const { hub, push } = fixture({ replayLimit: 2, replayByteLimit: 800 }); const frames = []; const done = deferred();
    hub.subscribeFrame((frame) => { frames.push(frame); if (frames.length === 5) done.resolve(); });
    await hub.start(['session']);
    push([event(1), event(2), event(3, { delta: '界'.repeat(1024) }), event(4), event(5)].map(encodeEvent).join(''));
    await done.promise;
    expect(frames[2].event.delta).toHaveLength(1024);
    expect(hub.replayAfter(frames[0].eventId)).toBeNull();
    expect(hub.replayAfter(frames[3].eventId).map((entry) => entry.eventId)).toEqual([frames[4].eventId]);
    expect(hub.replayAfter(frames[4].eventId)).toEqual([]);
    await hub.stop();
    expect(hub.replayAfter(frames[3].eventId)).toHaveLength(1);
||||||| bc50ba56aa
  // OpenCode sends no SSE ids at all. Before the hub numbered such events
  // itself the replay buffer stayed empty and every reconnect lost its gap.
  it('numbers id-less upstream events so a reconnect resumes from any cursor', async () => {
    const idless = (type, data) => `data: ${JSON.stringify({ type, data })}\n\n`;
    const blocks = [];
    for (let index = 0; index < 30; index += 1) {
      blocks.push(idless('session.text.delta', { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal: 1, delta: `a${index}.` }));
    }
    blocks.push(idless('session.text.ended', { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal: 1, text: '' }));
    for (let index = 0; index < 30; index += 1) {
      blocks.push(idless('session.text.delta', { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal: 1, delta: `b${index}.` }));
    }

    const hub = createDeltaHub({ blocks });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    try {
      hub.start();
      const expected = [...Array(30).keys()].map((index) => `a${index}.`).join('') + [...Array(30).keys()].map((index) => `b${index}.`).join('');
      await waitForAssertion(() => expect(applyFrames(received).text[1]).toBe(expected));

      const ids = received.map((event) => event.eventId);
      expect(ids.every((eventId) => typeof eventId === 'string' && eventId.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([...ids].sort());

      const complete = applyFrames(received);
      for (let cut = 0; cut < received.length; cut += 1) {
        const tail = hub.replayAfter(received[cut].eventId);
        expect(tail).not.toBeNull();
        const replayed = tail.map((entry) => JSON.parse(entry.serializedFrame));
        expect(replayed.every((frame) => typeof frame.eventId === 'string')).toBe(true);
        expect(applyFrames([...received.slice(0, cut + 1), ...replayed])).toEqual(complete);
      }

      // A cursor minted by another server process must miss, never match by
      // sequence number: the bridge then reports replayReset and the client
      // repairs from HTTP instead of trusting a wrong tail.
      const foreign = ids[0].replace(/^oc-[^-]+-/, 'oc-00000000-');
      expect(foreign).not.toBe(ids[0]);
      expect(hub.replayAfter(foreign)).toBeNull();
    } finally { hub.stop(); }
=======
  // OpenCode sends no SSE ids at all. Before the hub numbered such events
  // itself the replay buffer stayed empty and every reconnect lost its gap.
  it('numbers id-less upstream events so a reconnect resumes from any cursor', async () => {
    vi.useFakeTimers();
    const idless = (type, data) => `data: ${JSON.stringify({ type, data })}\n\n`;
    const blocks = [];
    for (let index = 0; index < 30; index += 1) {
      blocks.push(idless('session.text.delta', { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal: 1, delta: `a${index}.` }));
    }
    blocks.push(idless('session.text.ended', { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal: 1, text: '' }));
    for (let index = 0; index < 30; index += 1) {
      blocks.push(idless('session.text.delta', { sessionID: 'ses_1', assistantMessageID: 'msg_1', ordinal: 1, delta: `b${index}.` }));
    }

    const hub = createDeltaHub({ blocks });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    try {
      await readUpstream(hub);
      await vi.advanceTimersByTimeAsync(DELTA_COALESCE_WINDOW_MS);
      const expected = [...Array(30).keys()].map((index) => `a${index}.`).join('') + [...Array(30).keys()].map((index) => `b${index}.`).join('');
      expect(applyFrames(received).text[1]).toBe(expected);

      const ids = received.map((event) => event.eventId);
      expect(ids.every((eventId) => typeof eventId === 'string' && eventId.length > 0)).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual([...ids].sort());

      const complete = applyFrames(received);
      for (let cut = 0; cut < received.length; cut += 1) {
        const tail = hub.replayAfter(received[cut].eventId);
        expect(tail).not.toBeNull();
        const replayed = tail.map((entry) => JSON.parse(entry.serializedFrame));
        expect(replayed.every((frame) => typeof frame.eventId === 'string')).toBe(true);
        expect(applyFrames([...received.slice(0, cut + 1), ...replayed])).toEqual(complete);
      }

      // A cursor minted by another server process must miss, never match by
      // sequence number: the bridge then reports replayReset and the client
      // repairs from HTTP instead of trusting a wrong tail.
      const foreign = ids[0].replace(/^oc-[^-]+-/, 'oc-00000000-');
      expect(foreign).not.toBe(ids[0]);
      expect(hub.replayAfter(foreign)).toBeNull();
    } finally { hub.stop(); }
>>>>>>> upstream/main
  });

<<<<<<< HEAD
  it('resumes only after its delivered canonical cursor and ignores same-epoch duplicates', async () => {
    const boundary = streamBoundary(); const hub = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: async () => scope });
    const seen = []; const done = deferred();
    hub.subscribeEvent((record) => { seen.push(record.sequence); done.resolve(); });
    await hub.subscribeSession('session', { cursor: 'epoch:7' });
    boundary.push(encodeEvent(event(7)) + encodeEvent(event(8))); await done.promise;
    expect(seen).toEqual(['8']); expect(boundary.calls).toHaveLength(1);
    expect(boundary.calls[0].init.headers['Last-Event-ID']).toBe('epoch:7');
    await hub.stop();
||||||| bc50ba56aa
  it('keeps pending text for replay when the hub stops', async () => {
    const hub = createDeltaHub({
      deltaCoalesceWindowMs: 60_000,
      blocks: ['one ', 'two ', 'three'].map((text, index) => deltaBlock(`e${index}`, text)),
    });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    hub.start();
    // The window is a minute, so only the leading delta has been delivered.
    await waitForAssertion(() => expect(received).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 20));

    hub.stop();

    const tail = hub.replayAfter('e0').map((entry) => JSON.parse(entry.serializedFrame));
    expect(applyFrames(tail).text[1]).toBe('two three');
    expect(tail.at(-1).eventId).toBe('e2');
=======
  it('keeps pending text for replay when the hub stops', async () => {
    const hub = createDeltaHub({
      deltaCoalesceWindowMs: 60_000,
      blocks: ['one ', 'two ', 'three'].map((text, index) => deltaBlock(`e${index}`, text)),
    });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    // The window is a minute, so only the leading delta has been delivered.
    await readUpstream(hub);
    expect(received).toHaveLength(1);

    hub.stop();

    const tail = hub.replayAfter('e0').map((entry) => JSON.parse(entry.serializedFrame));
    expect(applyFrames(tail).text[1]).toBe('two three');
    expect(tail.at(-1).eventId).toBe('e2');
>>>>>>> upstream/main
  });

<<<<<<< HEAD
  it('invalidates replay and stops applying the stream after a control invalidation or sequence gap', async () => {
    for (const bad of [
      'event: stream.invalidated\ndata: {"type":"stream.invalidated","sessionId":"session","epoch":"epoch","reason":"EPOCH_CHANGED"}\n\n',
      encodeEvent(event(3)),
    ]) {
      const { hub, push } = fixture(); const seen = []; const done = deferred();
      hub.subscribeEvent((record) => seen.push(record.sequence));
      hub.subscribeStatus((status) => { if (status.type === 'disconnect') done.resolve(); });
      await hub.start(['session']); push(encodeEvent(event(1)) + bad + encodeEvent(event(4))); await done.promise;
      expect(seen).toEqual(['1']); expect(hub.replayAfter('unknown')).toBeNull(); expect(hub.isConnected()).toBe(false);
      await hub.stop();
||||||| bc50ba56aa
  it('commits pending text on demand, so a client readied later starts after it', async () => {
    const hub = createDeltaHub({
      deltaCoalesceWindowMs: 60_000,
      blocks: ['one ', 'two ', 'three'].map((text, index) => deltaBlock(`e${index}`, text)),
    });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    try {
      hub.start();
      await waitForAssertion(() => expect(received).toHaveLength(1));
      await new Promise((resolve) => setTimeout(resolve, 20));

      hub.flushPending();

      expect(applyFrames(received).text[1]).toBe('one two three');
      expect(hub.replayAfter('e2')).toEqual([]);
    } finally { hub.stop(); }
  });
});

describe('createGlobalMessageStreamHub', () => {
  it('continues fanout when an event subscriber throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const received = [];
    const hub = createGlobalMessageStreamHub({
      buildOpenCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getOpenCodeAuthHeaders: () => ({}),
      upstreamReconnectDelayMs: 100,
      fetchImpl: async () => createSseResponse({
        blocks: [
          'data: {"id":"evt-1","type":"session.updated","properties":{}}\n\n',
        ],
      }),
    });

    hub.subscribeEvent(() => {
      throw new Error('subscriber failed');
    });
    hub.subscribeEvent((event) => {
      received.push(event.eventId);
    });

    try {
      hub.start();
      await waitForAssertion(() => {
        expect(received).toEqual(['evt-1']);
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      hub.stop();
      warnSpy.mockRestore();
=======
  it('commits pending text on demand, so a client readied later starts after it', async () => {
    const hub = createDeltaHub({
      deltaCoalesceWindowMs: 60_000,
      blocks: ['one ', 'two ', 'three'].map((text, index) => deltaBlock(`e${index}`, text)),
    });
    const received = [];
    hub.subscribeEvent((event) => received.push(event));
    try {
      await readUpstream(hub);
      expect(received).toHaveLength(1);

      hub.flushPending();

      expect(applyFrames(received).text[1]).toBe('one two three');
      expect(hub.replayAfter('e2')).toEqual([]);
    } finally { hub.stop(); }
  });
});

describe('createGlobalMessageStreamHub', () => {
  it('ignores incidental synchronous subscriber return values', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const hub = createGlobalMessageStreamHub({
      buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      deltaCoalesceWindowMs: 0,
    });
    const received = [];
    hub.subscribeEvent(event => received.push(event.eventId));
    try {
      hub.injectEvent({ payload: { type: 'server.connected' }, directory: 'global', spaceId: null });
      expect(received).toHaveLength(1);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      hub.stop();
      warnSpy.mockRestore();
    }
  });

  it('continues fanout when an event subscriber throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const received = [];
    const hub = createGlobalMessageStreamHub({
      buildOpenCodeUrl: (pathname) => `http://127.0.0.1:4096${pathname}`,
      getOpenCodeAuthHeaders: () => ({}),
      upstreamReconnectDelayMs: 100,
      fetchImpl: async () => createSseResponse({
        blocks: [
          'data: {"id":"evt-1","type":"session.updated","properties":{}}\n\n',
        ],
      }),
    });

    hub.subscribeEvent(() => {
      throw new Error('subscriber failed');
    });
    hub.subscribeEvent((event) => {
      received.push(event.eventId);
    });

    try {
      await readUpstream(hub);
      expect(received).toEqual(['evt-1']);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      hub.stop();
      warnSpy.mockRestore();
>>>>>>> upstream/main
    }
  });

  it('cancels subscriptions without retries or applying buffered events after unsubscribe', async () => {
    const { hub, push, calls, cancelled } = fixture(); const seen = []; const entered = deferred(); const gate = deferred();
    hub.subscribeEvent(async (record) => { seen.push(record.sequence); entered.resolve(); await gate.promise; });
    await hub.start(['session']); push(encodeEvent(event(1)) + encodeEvent(event(2))); await entered.promise;
    const stopped = hub.unsubscribeSession('session'); gate.resolve(); await stopped;
    expect(seen).toEqual(['1']); expect(cancelled()).toBe(true); expect(calls).toHaveLength(2);
    await hub.stop();
  });

  it('does not announce readiness for an incomplete scope or a successful non-stream response', async () => {
    const boundary = streamBoundary();
    const incomplete = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: async () => ({ workspaceId: 'workspace', cwd: '/private', rootSessionId: 'session' }) });
    await expect(incomplete.subscribeSession('session')).rejects.toThrow('unavailable');
    expect(boundary.calls).toEqual([]); expect(incomplete.hasConnected()).toBe(false);
    await incomplete.stop();
    const statuses = [];
    const service = { request: async () => new Response('{"ready":true}', { headers: { 'Content-Type': 'application/json' } }) };
    const hub = createGlobalMessageStreamHub({ service, resolveSessionScope: async () => scope });
    hub.subscribeStatus((status) => statuses.push(status));
    await expect(hub.subscribeSession('session', { cursor: 'epoch:0' })).rejects.toThrow('unavailable');
    expect(hub.isConnected()).toBe(false); expect(hub.hasConnected()).toBe(false);
    expect(statuses.map((status) => status.type)).toEqual(['initial-error']);
    await hub.stop();
  });

  it('reports unavailable scope/service truthfully without exposing private errors', async () => {
    const statuses = [];
    const service = { request: vi.fn(async () => new Response('/private/path credential=secret', { status: 410 })) };
    const hub = createGlobalMessageStreamHub({ service, resolveSessionScope: async () => scope });
    hub.subscribeStatus((status) => statuses.push(status));
    await expect(hub.subscribeSession('session', { cursor: 'epoch:0' })).rejects.toThrow('unavailable');
    expect(statuses).toMatchObject([{ type: 'initial-error', error: { code: 'RESYNC_REQUIRED', status: 410 } }]);
    expect(JSON.stringify(statuses)).not.toContain('credential');
    await hub.stop();
  });

  it('tracks session leases, shares the active stream, and tears down only when the last lease is released', async () => {
    const { hub, calls, cancelled } = fixture();
    const firstLease = await hub.retainSession('session', 'lease-1');
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-1']);
    expect(calls).toHaveLength(2); // snapshot + events

    // Second lease shares the active stream without duplicate connection calls
    const secondLease = await hub.retainSession('session', 'lease-2');
    expect(hub.getSessionLeases('session')).toEqual(['lease-1', 'lease-2']);
    expect(calls).toHaveLength(2);

    // Releasing first lease keeps stream connected
    await firstLease.release();
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-2']);
    expect(cancelled()).toBe(false);

    // Releasing final lease triggers teardown
    await secondLease.release();
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(hub.hasLeases('session')).toBe(false);
    expect(cancelled()).toBe(true);

    await hub.stop();
  });

  it('ref-counts multiple retains of the same lease key and unsubscribes only when all instances are released', async () => {
    const { hub, calls, cancelled } = fixture();
    const run1 = await hub.retainSession('session', 'run');
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['run']);

    // Second retain with the same lease key (repeat subscribe / concurrent run)
    const run2 = await hub.retainSession('session', 'run');
    expect(hub.getSessionLeases('session')).toEqual(['run']);
    expect(calls).toHaveLength(2); // shared connection, no duplicate network calls

    // Retain a different lease key as well
    const wsClient = await hub.retainSession('session', 'ws-client');
    expect(hub.getSessionLeases('session')).toEqual(['run', 'ws-client']);

    // First run releases: stream remains active because second 'run' and 'ws-client' are active
    await run1.release();
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['run', 'ws-client']);
    expect(cancelled()).toBe(false);

    // wsClient releases: stream remains active because second 'run' is still active
    await wsClient.release();
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['run']);
    expect(cancelled()).toBe(false);

    // Final run releases: triggers teardown and unsubscription
    await run2.release();
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.getSessionLeases('session')).toEqual([]);
    expect(cancelled()).toBe(true);

    await hub.stop();
  });

  it('guards against underflow and premature teardown on duplicate or unacquired releaseSession calls', async () => {
    const { hub, cancelled } = fixture();

    // Releasing an unacquired lease is a safe no-op with no underflow
    await hub.releaseSession('session', 'nonexistent');
    expect(hub.hasLeases('session')).toBe(false);

    const lease = await hub.retainSession('session', 'active-lease');
    expect(hub.hasLeases('session')).toBe(true);

    // Releasing a different nonexistent lease does not affect active leases
    await hub.releaseSession('session', 'other');
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['active-lease']);

    // Releasing the active lease triggers teardown
    await lease.release();
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(cancelled()).toBe(true);

    // Calling releaseSession again on already-released lease does not throw or underflow
    await hub.releaseSession('session', 'active-lease');
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.getSessionLeases('session')).toEqual([]);

    await hub.stop();
  });

  it('cleans up leases without leak when retainSession fails', async () => {
    const boundary = streamBoundary();
    boundary.service.request = async () => new Response('Unavailable', { status: 503 });
    const hub = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: async () => scope });

    await expect(hub.retainSession('session', 'lease-failing')).rejects.toThrow();
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.getSessionLeases('session')).toEqual([]);
    expect(hub.isSessionConnected('session')).toBe(false);

    await hub.stop();
  });

  it('preserves active leases across connection drops and reconnects', async () => {
    let controller;
    const service = {
      async request(path) {
        if (path.endsWith('/snapshot')) return Response.json(snapshot());
        const body = new ReadableStream({ start(c) { controller = c; } });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      },
    };
    const hub = createGlobalMessageStreamHub({ service, resolveSessionScope: async () => scope });
    const lease = await hub.retainSession('session', 'lease-reconnect');
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.isSessionConnected('session')).toBe(true);

    // Terminate stream
    const disconnected = deferred();
    hub.subscribeStatus((status) => {
      if (status.type === 'disconnect') disconnected.resolve();
    });
    controller.close();
    await disconnected.promise;

<<<<<<< HEAD
    expect(hub.isSessionConnected('session')).toBe(false);
    // Active lease is still tracked while disconnected
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-reconnect']);

    // Reconnect: subscribeSession reconnects while preserving existing leases
    await hub.subscribeSession('session');
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-reconnect']);

    // Releasing lease after reconnect properly tears down the stream
    await lease.release();
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(hub.hasLeases('session')).toBe(false);

    await hub.stop();
||||||| bc50ba56aa
    try {
      hub.start();
      await waitForAssertion(() => {
        expect(received).toContain('connect');
      });
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      hub.stop();
      warnSpy.mockRestore();
    }
=======
    try {
      await readUpstream(hub);
      expect(received).toContain('connect');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      hub.stop();
      warnSpy.mockRestore();
    }
>>>>>>> upstream/main
  });

  it('cleans up all leases and tears down stream when unsubscribeSession is called directly on deletion/archive', async () => {
    const { hub, cancelled } = fixture();
    await hub.retainSession('session', 'lease-1');
    await hub.retainSession('session', 'lease-2');
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-1', 'lease-2']);

    // Simulating session.deleted or archive deletion
    await hub.unsubscribeSession('session');
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.getSessionLeases('session')).toEqual([]);
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(cancelled()).toBe(true);

<<<<<<< HEAD
    await hub.stop();
||||||| bc50ba56aa
    try {
      hub.start();
      await waitForAssertion(() => {
        expect(received).toEqual(['evt-1']);
      });
      await waitForAssertion(() => {
        expect(warnSpy).toHaveBeenCalled();
      });
    } finally {
      hub.stop();
      warnSpy.mockRestore();
    }
  });
});

describe('events of isolated spaces in the global hub', () => {
  const makeHub = () => createGlobalMessageStreamHub({
    buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}),
    deltaCoalesceWindowMs: 0,
    fetchImpl: async () => createSseResponse({ blocks: [] }),
  });

  it('delivers an injected space event to subscribers that asked for spaces only, numbered and replayable like the host\'s', () => {
    const hub = makeHub();
    const plain = [];
    const withSpaces = [];
    hub.subscribeEvent(event => plain.push(event));
    hub.subscribeEvent(event => withSpaces.push(event), { spaces: true });
    hub.injectEvent({ payload: { type: 'session.execution.started', data: { sessionID: 's1' } }, directory: '/spaces/a1b2c3d4e5f6/repo', spaceId: 'a1b2c3d4e5f6' });
    expect(plain).toHaveLength(0);
    expect(withSpaces).toHaveLength(1);
    expect(withSpaces[0]).toMatchObject({ spaceId: 'a1b2c3d4e5f6', directory: '/spaces/a1b2c3d4e5f6/repo' });
    expect(withSpaces[0].eventId).toMatch(/^oc-/);
    expect(withSpaces[0].translated()).toEqual([expect.objectContaining({ type: 'session.status' })]);
    expect(JSON.parse(withSpaces[0].serialize())).toMatchObject({ type: 'event', directory: '/spaces/a1b2c3d4e5f6/repo', payload: { type: 'session.execution.started' } });
    hub.injectEvent({ payload: { type: 'session.execution.succeeded', data: { sessionID: 's1' } }, directory: '/spaces/a1b2c3d4e5f6/repo', spaceId: 'a1b2c3d4e5f6' });
    expect(hub.replayAfter(withSpaces[0].eventId).map(entry => entry.eventId)).toEqual([withSpaces[1].eventId]);
  });

  it('marks a host event with no space, so every subscriber sees it', () => {
    const hub = makeHub();
    const seen = [];
    hub.subscribeEvent(event => seen.push(event.spaceId));
    hub.subscribeEvent(event => seen.push(event.spaceId), { spaces: true });
    hub.injectEvent({ payload: { type: 'session.execution.started', data: { sessionID: 's1' } }, directory: '/home/me', spaceId: null });
    expect(seen).toEqual([null, null]);
=======
    try {
      await readUpstream(hub);
      expect(received).toEqual(['evt-1']);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      hub.stop();
      warnSpy.mockRestore();
    }
  });
});

describe('events of isolated spaces in the global hub', () => {
  const makeHub = () => createGlobalMessageStreamHub({
    buildOpenCodeUrl: path => `http://127.0.0.1:4096${path}`,
    getOpenCodeAuthHeaders: () => ({}),
    deltaCoalesceWindowMs: 0,
    fetchImpl: async () => createSseResponse({ blocks: [] }),
  });

  it('delivers an injected space event to subscribers that asked for spaces only, numbered and replayable like the host\'s', () => {
    const hub = makeHub();
    const plain = [];
    const withSpaces = [];
    hub.subscribeEvent(event => plain.push(event));
    hub.subscribeEvent(event => withSpaces.push(event), { spaces: true });
    hub.injectEvent({ payload: { type: 'session.execution.started', data: { sessionID: 's1' } }, directory: '/spaces/a1b2c3d4e5f6/repo', spaceId: 'a1b2c3d4e5f6' });
    expect(plain).toHaveLength(0);
    expect(withSpaces).toHaveLength(1);
    expect(withSpaces[0]).toMatchObject({ spaceId: 'a1b2c3d4e5f6', directory: '/spaces/a1b2c3d4e5f6/repo' });
    expect(withSpaces[0].eventId).toMatch(/^oc-/);
    expect(withSpaces[0].translated()).toEqual([expect.objectContaining({ type: 'session.status' })]);
    expect(JSON.parse(withSpaces[0].serialize())).toMatchObject({ type: 'event', directory: '/spaces/a1b2c3d4e5f6/repo', payload: { type: 'session.execution.started' } });
    hub.injectEvent({ payload: { type: 'session.execution.succeeded', data: { sessionID: 's1' } }, directory: '/spaces/a1b2c3d4e5f6/repo', spaceId: 'a1b2c3d4e5f6' });
    expect(hub.replayAfter(withSpaces[0].eventId).map(entry => entry.eventId)).toEqual([withSpaces[1].eventId]);
  });

  it('marks a host event with no space, so every subscriber sees it', () => {
    const hub = makeHub();
    const seen = [];
    hub.subscribeEvent(event => seen.push(event.spaceId));
    hub.subscribeEvent(event => seen.push(event.spaceId), { spaces: true });
    hub.injectEvent({ payload: { type: 'session.execution.started', data: { sessionID: 's1' } }, directory: '/home/me', spaceId: null });
    expect(seen).toEqual([null, null]);
>>>>>>> upstream/main
  });
});
