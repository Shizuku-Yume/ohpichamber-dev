import { randomUUID } from 'node:crypto';
import { translateWireEvent } from './translate-v2.js';
import { CanonicalEventSchema, CursorSchema, EntityIdSchema, SessionSnapshotSchema, StreamInvalidatedSchema } from '@openchamber/agent-contract';

const REPLAY_LIMIT = 2048;
const REPLAY_BYTES = 8 * 1024 * 1024;

export function createGlobalMessageStreamHub({
  service, resolveSessionScope, now = Date.now, replayLimit = REPLAY_LIMIT, replayByteLimit = REPLAY_BYTES,
}) {
  if (typeof service?.request !== 'function' || typeof resolveSessionScope !== 'function') {
    throw new TypeError('Agent Service and Host session scope resolver are required');
  }
  if (!Number.isSafeInteger(replayLimit) || replayLimit < 0 || !Number.isSafeInteger(replayByteLimit) || replayByteLimit < 0) {
    throw new RangeError('Replay limits must be nonnegative safe integers');
  }
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
  let replayBytes = 0;
  let latestEventId;
  let started = false;
  let everConnected = false;
  let stopping = null;
  let replayNeedsReset = false;
  // All consumers see one committed order, including asynchronous handlers.
  let delivery = Promise.resolve();

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

  const injectEvent = ({ payload, directory, spaceId }) => {
    const record = {
      payload,
      directory,
      spaceId,
      translated: () => translateWireEvent(payload).map((event) => ({
        ...event,
        properties: { ...event.properties, directory: event.properties.directory || (directory === 'global' ? undefined : directory) },
      })),
    };
    const subscribers = spaceId === null ? eventSubscribers : spaceEventSubscribers;
    const run = delivery.then(() => notify(subscribers, record));
    delivery = run.catch(() => { });
    return run;
  };

  const open = (entry) => {
    entry.ready = (async () => {
      entry.scope = await resolveSessionScope(entry.sessionId);
      if (![entry.scope?.projectId, entry.scope?.workspaceId, entry.scope?.cwd, entry.scope?.agentDirectoryId,
      entry.scope?.agentDirectory, entry.scope?.rootSessionId].every((value) => typeof value === 'string' && value.length > 0)) {
        throw new Error('HOST_SCOPE_UNAVAILABLE');
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
    });
    return entry.ready;
  };

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
      }
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
