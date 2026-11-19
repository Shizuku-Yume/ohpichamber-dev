import { randomUUID } from 'node:crypto';
import { translateWireEvent } from './translate-v2.js';
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
import { CanonicalEventSchema, CursorSchema, EntityIdSchema, SessionSnapshotSchema, StreamInvalidatedSchema } from '@openchamber/agent-contract';
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
import { createDeltaCoalescer, DELTA_COALESCE_WINDOW_MS } from './delta-coalescer.js';
=======
import { createDeltaCoalescer, DELTA_COALESCE_WINDOW_MS } from './delta-coalescer.js';
import type { JsonValue, StreamEvent, UpstreamConnection } from './contracts.js';
import type { UpstreamDisconnect, UpstreamError } from './upstream-reader.js';
import type { TranslatedEvent } from './translate-v2.js';

interface HubOptions extends UpstreamConnection {
  replayLimit?: number;
  replayByteLimit?: number;
  deltaCoalesceWindowMs?: number;
  isHiddenPayload?: (payload: JsonValue) => boolean;
}

export interface ReplayEntry {
  eventId: string;
  serializedFrame: string;
  bytes: number;
}

export interface GlobalStreamEvent extends StreamEvent {
  directory: string;
  eventId: string;
  spaceId: string | null;
  serialize: () => string;
  translated: () => TranslatedEvent[];
}

export type GlobalStreamStatus =
  | { type: 'connect'; wasReady: boolean }
  | { type: 'disconnect'; reason: UpstreamDisconnect['reason'] }
  | { type: 'error' | 'initial-error'; error: UpstreamError; buildUrlFailed: boolean };

type Subscriber<T> = ((event: T) => void) | ((event: T) => Promise<void>);

const hasRejectionHandler = (value: unknown): value is Pick<Promise<void>, 'catch'> =>
  value !== null && (typeof value === 'object' || typeof value === 'function')
  && 'catch' in value && typeof value.catch === 'function';
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts

<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
const REPLAY_LIMIT = 2048;
const REPLAY_BYTES = 8 * 1024 * 1024;
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
// Raised from 512 → 2048 to improve recovery after brief disconnects during
// long-running agent sessions where many events accumulate quickly.
const MESSAGE_STREAM_GLOBAL_REPLAY_LIMIT = 2048;
const MESSAGE_STREAM_GLOBAL_REPLAY_BYTES = 8 * 1024 * 1024;
=======
const MESSAGE_STREAM_GLOBAL_REPLAY_LIMIT = 2048;
const MESSAGE_STREAM_GLOBAL_REPLAY_BYTES = 8 * 1024 * 1024;
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts

export function createGlobalMessageStreamHub({
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
  service, resolveSessionScope, now = Date.now, replayLimit = REPLAY_LIMIT, replayByteLimit = REPLAY_BYTES,
}) {
  if (typeof service?.request !== 'function' || typeof resolveSessionScope !== 'function') {
    throw new TypeError('Agent Service and Host session scope resolver are required');
  }
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  fetchImpl = fetch,
  upstreamStallTimeoutMs,
  upstreamReconnectDelayMs,
  replayLimit = MESSAGE_STREAM_GLOBAL_REPLAY_LIMIT,
  replayByteLimit = MESSAGE_STREAM_GLOBAL_REPLAY_BYTES,
  deltaCoalesceWindowMs = DELTA_COALESCE_WINDOW_MS,
}) {
=======
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  fetchImpl = fetch,
  upstreamStallTimeoutMs,
  upstreamReconnectDelayMs,
  replayLimit = MESSAGE_STREAM_GLOBAL_REPLAY_LIMIT,
  replayByteLimit = MESSAGE_STREAM_GLOBAL_REPLAY_BYTES,
  deltaCoalesceWindowMs = DELTA_COALESCE_WINDOW_MS,
  isHiddenPayload = () => false,
}: HubOptions) {
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts
  if (!Number.isSafeInteger(replayLimit) || replayLimit < 0 || !Number.isSafeInteger(replayByteLimit) || replayByteLimit < 0) {
    throw new RangeError('Replay limits must be nonnegative safe integers');
  }
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
  const sessions = new Map();
  const eventSubscribers = new Set();
  const spaceEventSubscribers = new Set();
  const snapshotSubscribers = new Set();
  const frameSubscribers = new Set();
  const statusSubscribers = new Set();
  const replay = [];
  const sessionLeases = new Map();
  const prefix = `hub-${randomUUID()}-`;
  let sequence = 0n;
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
  const eventSubscribers = new Set();
  // The event subscribers that also take the events of isolated spaces.
  const spaceSubscribers = new Set();
  const statusSubscribers = new Set();
  const replay = [];
=======
  const eventSubscribers = new Set<Subscriber<GlobalStreamEvent>>();
  const spaceSubscribers = new Set<Subscriber<GlobalStreamEvent>>();
  const statusSubscribers = new Set<Subscriber<GlobalStreamStatus>>();
  const replay: ReplayEntry[] = [];
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts
  let replayBytes = 0;
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
  let latestEventId;
  let started = false;
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
  let latestEventId;
  // OpenCode's event stream carries no SSE ids (verified on 1.18.30: not one
  // frame in a full response), and an event without an id never entered the
  // replay buffer, so a reconnecting browser had no cursor and every event in
  // the gap was gone. The replay log is this hub's own, so the hub numbers
  // what upstream leaves unnumbered. The per-process prefix makes a cursor
  // from before a restart miss instead of matching an unrelated sequence
  // number, which reports `replayReset` and sends the client to repair.
  const replayIdPrefix = `oc-${randomUUID().slice(0, 8)}-`;
  let replaySequence = 0;

  let controller = null;
  let reader = null;
  let connected = false;
=======
  let latestEventId: string | undefined;
  let upstreamConnectedBefore = false;
  const replayIdPrefix = `oc-${randomUUID().slice(0, 8)}-`;
  let replaySequence = 0;
  let replayEpoch = 0;
  let replayStartId = `${replayIdPrefix}start-${replayEpoch}`;
  let replayTrimmed = false;

  let controller: AbortController | null = null;
  let reader: ReturnType<typeof createUpstreamSseReader> | null = null;
  let connected = false;
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts
  let everConnected = false;
  let stopping = null;
  let replayNeedsReset = false;
  // All consumers see one committed order, including asynchronous handlers.
  let delivery = Promise.resolve();

<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
  const notify = async (subscribers, ...args) => {
    for (const subscriber of [...subscribers]) {
      if (!subscribers.has(subscriber)) continue;
      try { await subscriber(...args); }
      catch { console.warn('Canonical event subscriber failed'); }
    }
  };
  const status = (entry, type, extra = {}) => notify(statusSubscribers, {
    type, sessionId: entry.sessionId, timestamp: now(), ...extra,
  });
  const clearReplay = () => { replay.length = 0; replayBytes = 0; latestEventId = undefined; };
  const commit = (entry, event) => {
    const run = delivery.then(async () => {
      if (entry.controller.signal.aborted || sessions.get(entry.sessionId) !== entry) return;
      await notify(eventSubscribers, event, entry.scope);
      if (entry.controller.signal.aborted || sessions.get(entry.sessionId) !== entry) return;
      const eventId = `${prefix}${++sequence}`;
      const serializedFrame = JSON.stringify({ type: 'event', eventId, payload: event });
      const bytes = Buffer.byteLength(serializedFrame);
      latestEventId = eventId;
      if (bytes > replayByteLimit) {
        replay.length = 0; replayBytes = 0;
      } else {
        replay.push({ eventId, sessionId: event.sessionId, serializedFrame, bytes });
        replayBytes += bytes;
        while (replay.length > replayLimit || replayBytes > replayByteLimit) replayBytes -= replay.shift().bytes;
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
  const notifySubscriber = (kind, subscriber, payload) => {
    try {
      const result = subscriber(payload);
      if (result && typeof result.catch === 'function') {
        result.catch((error) => {
          console.warn(`Global message stream ${kind} subscriber failed:`, error);
        });
=======
  const notifySubscriber = <T>(kind: 'event' | 'status', subscriber: Subscriber<T>, payload: T) => {
    try {
      const result = subscriber(payload);
      if (result && hasRejectionHandler(result)) {
        result.catch((error) => {
          console.warn(`Global message stream ${kind} subscriber failed:`, error);
        });
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts
      }
      // Replay insertion and synchronous transport fanout are one boundary:
      // a client cannot replay an event whose live fanout is still pending.
      for (const subscriber of [...frameSubscribers]) {
        if (!frameSubscribers.has(subscriber)) continue;
        try {
          const result = subscriber({ eventId, serializedFrame, event });
          if (result?.catch) result.catch(() => console.warn('Canonical frame subscriber failed'));
        } catch { console.warn('Canonical frame subscriber failed'); }
      }
    });
    delivery = run.catch(() => { });
    return run;
  };

<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
  const injectEvent = ({ payload, directory, spaceId }) => {
    const record = {
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
  const notifyStatus = (status) => {
    for (const subscriber of Array.from(statusSubscribers)) {
      notifySubscriber('status', subscriber, status);
    }
  };

  const normalizeEvent = ({ envelope, payload }) => {
    const directory =
      typeof envelope?.directory === 'string' && envelope.directory.length > 0 ? envelope.directory : 'global';
    const eventId = typeof envelope?.eventId === 'string' && envelope.eventId.length > 0
      ? envelope.eventId
      : `${replayIdPrefix}${String(++replaySequence).padStart(12, '0')}`;
    // An event of an isolated space carries the space's id; subscribers see it only when they
    // asked for space events, because a consumer that acts on the host's OpenCode by
    // directory must never act on a space's directory.
    const spaceId = typeof envelope?.spaceId === 'string' && envelope.spaceId.length > 0 ? envelope.spaceId : null;
    let serializedFrame;
    let translated;
    return {
      envelope,
=======
  const notifyStatus = (status: GlobalStreamStatus) => {
    for (const subscriber of Array.from(statusSubscribers)) {
      notifySubscriber('status', subscriber, status);
    }
  };

  const normalizeEvent = ({ envelope, payload }: StreamEvent): GlobalStreamEvent => {
    const directory =
      envelope?.directory && envelope.directory.length > 0 ? envelope.directory : 'global';
    const eventId = envelope?.eventId && envelope.eventId.length > 0
      ? envelope.eventId
      : `${replayIdPrefix}${String(++replaySequence).padStart(12, '0')}`;
    const spaceId = envelope?.spaceId && envelope.spaceId.length > 0 ? envelope.spaceId : null;
    let serializedFrame: string | undefined;
    let translated: TranslatedEvent[] | undefined;
    return {
      envelope,
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts
      payload,
      directory,
      spaceId,
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
      translated: () => translateWireEvent(payload).map((event) => ({
        ...event,
        properties: { ...event.properties, directory: event.properties.directory || (directory === 'global' ? undefined : directory) },
      })),
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
      serialize() {
        serializedFrame ??= serializeMessageStreamWsEvent(payload, { directory, eventId });
        return serializedFrame;
      },
      // Browser clients receive the raw wire payload and translate it
      // themselves; server-side subscribers read this instead. Translating
      // lazily keeps the cost off the WS fan-out path when nothing listens.
      translated() {
        translated ??= translateWireEvent(payload);
        return translated;
      },
=======
      serialize() {
        serializedFrame ??= serializeMessageStreamWsEvent(payload, { directory, eventId });
        return serializedFrame;
      },
      translated() {
        translated ??= translateWireEvent(payload);
        return translated;
      },
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts
    };
    const subscribers = spaceId === null ? eventSubscribers : spaceEventSubscribers;
    const run = delivery.then(() => notify(subscribers, record));
    delivery = run.catch(() => { });
    return run;
  };

<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
  const open = (entry) => {
    entry.ready = (async () => {
      entry.scope = await resolveSessionScope(entry.sessionId);
      if (![entry.scope?.projectId, entry.scope?.workspaceId, entry.scope?.cwd, entry.scope?.agentDirectoryId,
      entry.scope?.agentDirectory, entry.scope?.rootSessionId].every((value) => typeof value === 'string' && value.length > 0)) {
        throw new Error('HOST_SCOPE_UNAVAILABLE');
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
  // Replay and fan-out see the same committed sequence: an event enters the
  // replay buffer in the same step that delivers it, so a client's cursor
  // always names a frame the buffer can find.
  const commitEvent = (event) => {
    const normalized = normalizeEvent(event);
    latestEventId = normalized.eventId;
    const serializedFrame = normalized.serialize();
    const bytes = Buffer.byteLength(serializedFrame);
    if (bytes > replayByteLimit) {
      // An oversized live event creates a hole: retain only a contiguous
      // suffix after it, never replay an older prefix across the gap.
      replay.length = 0;
      replayBytes = 0;
    } else {
      replay.push({ eventId: normalized.eventId, serializedFrame, bytes });
      replayBytes += bytes;
      while (replay.length > replayLimit || replayBytes > replayByteLimit) {
        replayBytes -= replay.shift().bytes;
=======
  const commitEvent = (event: StreamEvent) => {
    const normalized = normalizeEvent(event);
    latestEventId = normalized.eventId;
    const serializedFrame = normalized.serialize();
    const bytes = Buffer.byteLength(serializedFrame);
    if (bytes > replayByteLimit) {
      replay.length = 0;
      replayBytes = 0;
      replayTrimmed = true;
    } else {
      replay.push({ eventId: normalized.eventId, serializedFrame, bytes });
      replayBytes += bytes;
      while (replay.length > replayLimit || replayBytes > replayByteLimit) {
        const oldest = replay.shift();
        if (!oldest) throw new Error('Replay entry missing');
        replayBytes -= oldest.bytes;
        replayTrimmed = true;
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts
      }
      if (entry.controller.signal.aborted) return;
      const base = `/api/agent/v1/sessions/${encodeURIComponent(entry.sessionId)}`;
      if (!entry.cursor) {
        const response = await service.request(`${base}/snapshot`, { signal: entry.controller.signal });
        if (!response.ok) throw Object.assign(new Error('SNAPSHOT_UNAVAILABLE'), { status: response.status });
        const snapshot = SessionSnapshotSchema.parse(await response.json());
        if (snapshot.session.sessionId !== entry.sessionId || snapshot.session.projectId !== entry.scope.projectId
          || snapshot.session.workspaceId !== entry.scope.workspaceId || snapshot.session.rootSessionId !== entry.scope.rootSessionId) {
          throw new Error('HOST_SCOPE_MISMATCH');
        }
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
        entry.cursor = snapshot.cursor;
        if (entry.controller.signal.aborted) return;
        await notify(snapshotSubscribers, snapshot, entry.scope);
      }
      if (entry.controller.signal.aborted) return;
      const response = await service.request(`${base}/events`, {
        method: 'GET', headers: { Accept: 'text/event-stream', 'Last-Event-ID': entry.cursor }, signal: entry.controller.signal,
      });
      if (!response.ok || !response.body || response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'text/event-stream') {
        await response.body?.cancel().catch(() => { });
        throw Object.assign(new Error('STREAM_UNAVAILABLE'), { status: response.status });
      }
      if (entry.controller.signal.aborted) { await response.body.cancel(); return; }
      entry.reader = response.body.getReader();
      entry.connected = true;
      const wasReady = entry.connectedOnce === true;
      entry.connectedOnce = true;
      everConnected = true;
      await status(entry, 'connect', { wasReady, replayReset: entry.replayReset === true });
      entry.finished = consume(entry);
    })().catch(async (error) => {
      if (!entry.controller.signal.aborted) await status(entry, everConnected ? 'error' : 'initial-error', {
        error: { code: error?.status === 410 ? 'RESYNC_REQUIRED' : 'STREAM_UNAVAILABLE', status: error?.status },
      });
      entry.connected = false;
      throw new Error('Canonical session stream unavailable');
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
      },
      getHeaders: getOpenCodeAuthHeaders,
      onConnect() {
        connected = true;
        const wasReady = everConnected;
        everConnected = true;
        notifyStatus({ type: 'connect', wasReady });
      },
      onDisconnect({ reason }) {
        connected = false;
        notifyStatus({ type: 'disconnect', reason });
      },
      onEvent(event) {
        coalescer.push(event);
      },
      onError(error) {
        if (controller?.signal.aborted) {
          return;
        }

        notifyStatus({
          type: everConnected ? 'error' : 'initial-error',
          error,
          buildUrlFailed,
        });
      },
=======
      },
      getHeaders: getOpenCodeAuthHeaders,
      onConnect() {
        connected = true;
        const wasReady = everConnected;
        everConnected = true;
        if (upstreamConnectedBefore) {
          replay.length = 0;
          replayBytes = 0;
          latestEventId = undefined;
          replayStartId = `${replayIdPrefix}start-${++replayEpoch}`;
          replayTrimmed = false;
        }
        upstreamConnectedBefore = true;
        notifyStatus({ type: 'connect', wasReady });
      },
      onDisconnect({ reason }) {
        connected = false;
        notifyStatus({ type: 'disconnect', reason });
      },
      onEvent(event) {
        if (isHiddenPayload(event?.payload)) return;
        coalescer.push(event);
      },
      onError(error) {
        if (controller?.signal.aborted) {
          return;
        }

        notifyStatus({
          type: everConnected ? 'error' : 'initial-error',
          error,
          buildUrlFailed,
        });
      },
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts
    });
    return entry.ready;
  };

<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
  const consume = async (entry) => {
    const decoder = new TextDecoder();
    let buffer = '';
    let lines = [];
    let epoch = entry.cursor.slice(0, entry.cursor.lastIndexOf(':'));
    let head = BigInt(entry.cursor.slice(entry.cursor.lastIndexOf(':') + 1));
    const frame = async () => {
      let id; let name; const data = [];
      for (const line of lines) {
        if (line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon < 0 ? line : line.slice(0, colon);
        const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'id') id = value;
        else if (field === 'event') name = value;
        else if (field === 'data') data.push(value);
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
  const stop = () => {
    connected = false;
    // Text that already arrived belongs in the retained replay suffix.
    coalescer.flush();
    reader?.stop();
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    reader = null;
    controller = null;
    everConnected = false;
    buildUrlFailed = false;
  };

  return {
    start,
    stop,
    isConnected() {
      return connected;
    },
    hasConnected() {
      return everConnected;
    },
    /**
     * `spaces: true` also delivers the events of isolated spaces, which carry `spaceId`.
     * Without it a subscriber sees the host's events only, as every consumer did before spaces.
     */
    subscribeEvent(subscriber, { spaces = false } = {}) {
      eventSubscribers.add(subscriber);
      if (spaces) spaceSubscribers.add(subscriber);
      return () => {
        eventSubscribers.delete(subscriber);
        spaceSubscribers.delete(subscriber);
      };
    },
    /**
     * One event of an isolated space, from that space's own connection, entered here as if it
     * had arrived upstream: numbered, coalesced, replayed and fanned out with the host's, so
     * a client keeps one cursor for everything. `directory` is the space's, `spaceId` marks it.
     */
    injectEvent({ payload, directory, spaceId }) {
      coalescer.push({ envelope: { directory, spaceId }, payload });
    },
    subscribeStatus(subscriber) {
      statusSubscribers.add(subscriber);
      return () => {
        statusSubscribers.delete(subscriber);
      };
    },
    // A client that becomes ready must not receive text from before it was
    // ready merged into its first live delta, so the bridge commits pending
    // deltas before it reads the replay tail.
    flushPending() {
      coalescer.flush();
    },
    replayAfter(eventId) {
      if (!eventId) {
        return [];
=======
  const stop = () => {
    connected = false;
    coalescer.flush();
    reader?.stop();
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    reader = null;
    controller = null;
    everConnected = false;
    buildUrlFailed = false;
  };

  return {
    start,
    stop,
    isConnected() {
      return connected;
    },
    isHiddenPayload,
    hasConnected() {
      return everConnected;
    },
    subscribeEvent(subscriber: Subscriber<GlobalStreamEvent>, { spaces = false } = {}) {
      eventSubscribers.add(subscriber);
      if (spaces) spaceSubscribers.add(subscriber);
      return () => {
        eventSubscribers.delete(subscriber);
        spaceSubscribers.delete(subscriber);
      };
    },
    injectEvent({ payload, directory, spaceId }: { payload: JsonValue; directory: string; spaceId: string | null }) {
      coalescer.push({ envelope: { directory, spaceId }, payload });
    },
    subscribeStatus(subscriber: Subscriber<GlobalStreamStatus>) {
      statusSubscribers.add(subscriber);
      return () => {
        statusSubscribers.delete(subscriber);
      };
    },
    flushPending() {
      coalescer.flush();
    },
    cursor() {
      return latestEventId ?? replayStartId;
    },
    replayAfter(eventId: string) {
      if (!eventId) {
        return [];
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts
      }
<<<<<<< HEAD:packages/web/server/lib/event-stream/global-hub.js
      lines = [];
      if (data.length === 0) return true;
      const raw = JSON.parse(data.join('\n'));
      if (name === 'stream.invalidated' || raw?.type === 'stream.invalidated') {
        const invalidation = StreamInvalidatedSchema.parse(raw);
        if (invalidation.sessionId !== entry.sessionId || invalidation.epoch !== epoch) throw new Error('INVALID_STREAM_SCOPE');
        clearReplay();
        await status(entry, 'invalidated', { invalidation });
        entry.cursor = undefined;
        return false;
      }
      const event = CanonicalEventSchema.parse(raw);
      if (event.sessionId !== entry.sessionId || event.epoch !== epoch || name !== event.type || id !== `${event.epoch}:${event.sequence}`) {
        throw new Error('INVALID_STREAM_EVENT');
      }
      const next = BigInt(event.sequence);
      if (next <= head) return true;
      if (next !== head + 1n) throw new Error('STREAM_SEQUENCE_GAP');
      await commit(entry, event);
      if (entry.controller.signal.aborted) return false;
      head = next;
      entry.cursor = id;
      return true;
    };
    try {
      while (!entry.controller.signal.aborted) {
        const { done, value } = await entry.reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newline).replace(/\r$/, '');
          buffer = buffer.slice(newline + 1);
          if (line) lines.push(line);
          else if (!await frame()) return;
          if (entry.controller.signal.aborted) return;
        }
      }
      // An incomplete final frame is not an authoritative event.
    } catch {
      if (!entry.controller.signal.aborted) {
        clearReplay();
        await status(entry, 'error', { error: { code: 'STREAM_INTERRUPTED' } });
      }
    } finally {
      entry.connected = false;
      await entry.reader.cancel().catch(() => { });
      entry.reader.releaseLock();
      entry.reader = null;
      if (!entry.controller.signal.aborted) await status(entry, 'disconnect');
    }
  };
||||||| bc50ba56aa:packages/web/server/lib/event-stream/global-hub.js
=======
      if (eventId === replayStartId) return replayTrimmed ? null : replay.slice();
>>>>>>> upstream/main:packages/web/server/lib/event-stream/global-hub.ts

  const subscribeSession = async (sessionId, { cursor } = {}) => {
    EntityIdSchema.parse(sessionId);
    if (cursor !== undefined) CursorSchema.parse(cursor);
    if (stopping) await stopping;
    const existing = sessions.get(sessionId);
    if (existing?.connected || (existing && !existing.finished)) return existing.ready;
    if (existing) await unsubscribeSession(sessionId, { preserveLeases: true });
    const restarting = replayNeedsReset;
    if (replayNeedsReset) { clearReplay(); replayNeedsReset = false; }
    started = true;
    const entry = {
      sessionId, cursor: cursor ?? existing?.cursor, controller: new AbortController(), connected: false,
      connectedOnce: existing?.connectedOnce === true || restarting, replayReset: restarting
    };
    sessions.set(sessionId, entry);
    try { await open(entry); }
    catch (error) { if (sessions.get(sessionId) === entry) sessions.delete(sessionId); throw error; }
  };
  const unsubscribeSession = async (sessionId, { preserveLeases = false } = {}) => {
    if (!preserveLeases) sessionLeases.delete(sessionId);
    const entry = sessions.get(sessionId);
    if (!entry) return;
    sessions.delete(sessionId);
    entry.controller.abort();
    await entry.reader?.cancel().catch(() => { });
    await entry.ready?.catch(() => { });
    await entry.finished;
  };
  const retainSession = async (sessionId, leaseKey = 'default', options = {}) => {
    EntityIdSchema.parse(sessionId);
    let leases = sessionLeases.get(sessionId);
    if (!leases) {
      leases = new Map();
      sessionLeases.set(sessionId, leases);
    }
    const current = leases.get(leaseKey) ?? 0;
    leases.set(leaseKey, current + 1);
    try {
      await subscribeSession(sessionId, options);
    } catch (error) {
      const remaining = (leases.get(leaseKey) ?? 1) - 1;
      if (remaining <= 0) leases.delete(leaseKey);
      else leases.set(leaseKey, remaining);
      if (leases.size === 0) sessionLeases.delete(sessionId);
      throw error;
    }
    let released = false;
    const release = async () => {
      if (released) return;
      released = true;
      await releaseSession(sessionId, leaseKey);
    };
    return { release };
  };
  const releaseSession = async (sessionId, leaseKey = 'default') => {
    const leases = sessionLeases.get(sessionId);
    if (!leases) return;
    const current = leases.get(leaseKey);
    if (current === undefined || current <= 0) return;
    if (current <= 1) {
      leases.delete(leaseKey);
    } else {
      leases.set(leaseKey, current - 1);
    }
    if (leases.size === 0) {
      sessionLeases.delete(sessionId);
      await unsubscribeSession(sessionId).catch(() => { });
    }
  };
  const hasLeases = (sessionId) => (sessionLeases.get(sessionId)?.size ?? 0) > 0;
  const subscribe = (set, subscriber) => {
    if (typeof subscriber !== 'function') throw new TypeError('Subscriber must be a function');
    set.add(subscriber);
    return () => set.delete(subscriber);
  };
  return {
    async start(sessionIds = []) { started = true; await Promise.all(sessionIds.map((id) => subscribeSession(id))); },
    subscribeSession,
    unsubscribeSession,
    retainSession,
    releaseSession,
    hasLeases,
    getSessionLeases: (sessionId) => Array.from(sessionLeases.get(sessionId)?.keys() ?? []),
    injectEvent,
    stop() {
      if (stopping) return stopping;
      started = false;
      sessionLeases.clear();
      replayNeedsReset = everConnected;
      stopping = Promise.all([...sessions.keys()].map(unsubscribeSession)).then(() => delivery).finally(() => { stopping = null; });
      return stopping;
    },
    isStarted: () => started,
    isConnected() { for (const entry of sessions.values()) if (entry.connected) return true; return false; },
    isSessionConnected: (sessionId) => sessions.get(sessionId)?.connected === true,
    hasConnected: () => everConnected,
    subscribeEvent: (subscriber, { spaces = false } = {}) => subscribe(spaces ? spaceEventSubscribers : eventSubscribers, subscriber),
    subscribeSnapshot: (subscriber) => subscribe(snapshotSubscribers, subscriber),
    subscribeFrame: (subscriber) => subscribe(frameSubscribers, subscriber),
    subscribeStatus: (subscriber) => subscribe(statusSubscribers, subscriber),
    replayAfter(eventId, { sessionId } = {}) {
      if (!eventId || eventId === latestEventId) return [];
      const index = replay.findIndex((entry) => entry.eventId === eventId);
      if (index === -1) return null;
      return replay.slice(index + 1).filter((entry) => !sessionId || entry.sessionId === sessionId);
    },
  };
}

export type GlobalMessageStreamHub = ReturnType<typeof createGlobalMessageStreamHub>;
