import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CanonicalEventSchema, CursorSchema, EntityIdSchema, SessionSnapshotSchema, StreamInvalidatedSchema } from '@openchamber/agent-contract';
import type { CanonicalEvent, SessionSnapshot } from '@openchamber/agent-contract';
import { isString } from '../shared/object-guards.js';
import type { JsonValue } from './contracts.js';
import { translateWireEvent } from './translate-v2.js';
import type { TranslatedWireEvent } from './translate-v2.js';
import { markValidatedCanonicalEvent } from './validated-event.js';

const REPLAY_LIMIT = 2048;
const REPLAY_BYTES = 8 * 1024 * 1024;

export interface HubSessionScope {
  sessionId?: string;
  hostProjectId?: string;
  projectId: string;
  workspaceId: string;
  cwd: string;
  projectDirectory?: string;
  name?: string;
  agentDirectoryId: string;
  agentDirectory: string;
  rootSessionId: string;
}

export interface HubServiceClient {
  request: (pathname: string, init?: RequestInit) => Promise<globalThis.Response>;
}

export interface GlobalHubDependencies {
  service: HubServiceClient;
  resolveSessionScope: (sessionId: string) => Promise<HubSessionScope | null>;
  now?: () => number;
  replayLimit?: number;
  replayByteLimit?: number;
}

export type StreamInvalidatedEvent = z.infer<typeof StreamInvalidatedSchema>;

export type GlobalHubStatus =
  | { type: 'connect'; sessionId: string; timestamp: number; wasReady: boolean; replayReset: boolean }
  | { type: 'invalidated'; sessionId: string; timestamp: number; invalidation: StreamInvalidatedEvent }
  | { type: 'error' | 'initial-error'; sessionId: string; timestamp: number; error: { code: string; status?: number | undefined } }
  | { type: 'disconnect'; sessionId: string; timestamp: number };

export interface GlobalHubFrame {
  eventId: string;
  serializedFrame: string;
  event: CanonicalEvent;
}

export interface ReplayEntry {
  eventId: string;
  sessionId: string;
  serializedFrame: string;
  bytes: number;
}

export interface InjectedSpaceEvent {
  payload: JsonValue;
  directory: string;
  spaceId: string | null;
  translated: () => TranslatedWireEvent[];
}

export type CanonicalEventSubscriber = (event: CanonicalEvent, scope: HubSessionScope) => void | Promise<void>;
export type SpaceEventSubscriber = (record: InjectedSpaceEvent) => void | Promise<void>;
export type SnapshotSubscriber = (snapshot: SessionSnapshot, scope: HubSessionScope) => void | Promise<void>;
export type FrameSubscriber = (frame: GlobalHubFrame) => void | Promise<void>;
export type StatusSubscriber = (status: GlobalHubStatus) => void | Promise<void>;

interface SessionEntry {
  sessionId: string;
  cursor: string | undefined;
  controller: AbortController;
  connected: boolean;
  connectedOnce: boolean;
  replayReset: boolean;
  scope?: HubSessionScope;
  ready?: Promise<void>;
  finished?: Promise<void>;
  reader?: ReadableStreamDefaultReader<Uint8Array> | null;
}

const hasHttpStatus = (value: unknown): value is { status?: number } => Boolean(value && typeof value === 'object');
const isJsonRecord = (value: unknown): value is { type?: unknown } => Boolean(value && typeof value === 'object');
const isCompleteScope = (scope: HubSessionScope | null | undefined): scope is HubSessionScope => Boolean(
  scope
  && [scope.projectId, scope.workspaceId, scope.cwd, scope.agentDirectoryId, scope.agentDirectory, scope.rootSessionId]
    .every((value) => isString(value) && value.length > 0),
);
const isCallable = (value: unknown): value is (...args: never[]) => void => typeof value === 'function';

export function createGlobalMessageStreamHub({
  service, resolveSessionScope, now = Date.now, replayLimit = REPLAY_LIMIT, replayByteLimit = REPLAY_BYTES,
}: GlobalHubDependencies) {
  if (!isCallable(service?.request) || !isCallable(resolveSessionScope)) {
    throw new TypeError('Agent Service and Host session scope resolver are required');
  }
  if (!Number.isSafeInteger(replayLimit) || replayLimit < 0 || !Number.isSafeInteger(replayByteLimit) || replayByteLimit < 0) {
    throw new RangeError('Replay limits must be nonnegative safe integers');
  }
  const sessions = new Map<string, SessionEntry>();
  const eventSubscribers = new Set<CanonicalEventSubscriber>();
  const spaceEventSubscribers = new Set<SpaceEventSubscriber>();
  const snapshotSubscribers = new Set<SnapshotSubscriber>();
  const frameSubscribers = new Set<FrameSubscriber>();
  const statusSubscribers = new Set<StatusSubscriber>();
  const replay: ReplayEntry[] = [];
  const sessionLeases = new Map<string, Map<string, number>>();
  const prefix = `hub-${randomUUID()}-`;
  let sequence = 0n;
  let replayBytes = 0;
  let latestEventId: string | undefined;
  let started = false;
  let everConnected = false;
  let stopping: Promise<void> | null = null;
  let replayNeedsReset = false;
  let delivery: Promise<void> = Promise.resolve();

  const notify = async <Args extends unknown[]>(subscribers: Set<(...args: Args) => void | Promise<void>>, ...args: Args) => {
    for (const subscriber of [...subscribers]) {
      if (!subscribers.has(subscriber)) continue;
      try { await subscriber(...args); }
      catch { console.warn('Canonical event subscriber failed'); }
    }
  };
  const emitStatus = (statusPayload: GlobalHubStatus) => notify(statusSubscribers, statusPayload);
  const clearReplay = () => { replay.length = 0; replayBytes = 0; latestEventId = undefined; };
  const commit = (entry: SessionEntry, event: CanonicalEvent, rawData?: string) => {
    const run = delivery.then(async () => {
      if (entry.controller.signal.aborted || sessions.get(entry.sessionId) !== entry) return;
      if (!entry.scope) return;
      await notify(eventSubscribers, event, entry.scope);
      if (entry.controller.signal.aborted || sessions.get(entry.sessionId) !== entry) return;
      const eventId = `${prefix}${++sequence}`;
      const serializedFrame = rawData === undefined
        ? JSON.stringify({ type: 'event', eventId, payload: event })
        : `{"type":"event","eventId":${JSON.stringify(eventId)},"payload":${rawData}}`;
      const bytes = Buffer.byteLength(serializedFrame);
      latestEventId = eventId;
      if (bytes > replayByteLimit) {
        replay.length = 0; replayBytes = 0;
      } else {
        replay.push({ eventId, sessionId: event.sessionId, serializedFrame, bytes });
        replayBytes += bytes;
        while (replay.length > replayLimit || replayBytes > replayByteLimit) {
          const shifted = replay.shift();
          if (!shifted) break;
          replayBytes -= shifted.bytes;
        }
      }
      for (const subscriber of [...frameSubscribers]) {
        if (!frameSubscribers.has(subscriber)) continue;
        try {
          void Promise.resolve(subscriber({ eventId, serializedFrame, event })).catch(() => console.warn('Canonical frame subscriber failed'));
        } catch { console.warn('Canonical frame subscriber failed'); }
      }
    });
    delivery = run.catch(() => { });
    return run;
  };

  const injectEvent = ({ payload, directory, spaceId }: { payload: JsonValue; directory: string; spaceId: string | null }) => {
    const record: InjectedSpaceEvent = {
      payload,
      directory,
      spaceId,
      translated: () => translateWireEvent(payload).map((event) => ({
        ...event,
        properties: { ...event.properties, directory: event.properties.directory || (directory === 'global' ? undefined : directory) },
      })),
    };
    const run = delivery.then(() => notify(spaceEventSubscribers, record));
    delivery = run.catch(() => { });
    return run;
  };

  const open = (entry: SessionEntry) => {
    entry.ready = (async () => {
      const scope = await resolveSessionScope(entry.sessionId);
      if (!isCompleteScope(scope)) {
        throw new Error('HOST_SCOPE_UNAVAILABLE');
      }
      entry.scope = scope;
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
      const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (!response.ok || !response.body || contentType !== 'text/event-stream') {
        await response.body?.cancel().catch(() => { });
        throw Object.assign(new Error('STREAM_UNAVAILABLE'), { status: response.status });
      }
      if (entry.controller.signal.aborted) { await response.body.cancel(); return; }
      entry.reader = response.body.getReader();
      entry.connected = true;
      const wasReady = entry.connectedOnce === true;
      entry.connectedOnce = true;
      everConnected = true;
      await emitStatus({ type: 'connect', sessionId: entry.sessionId, timestamp: now(), wasReady, replayReset: entry.replayReset === true });
      entry.finished = consume(entry);
    })().catch(async (error) => {
      const statusCode = hasHttpStatus(error) ? error.status : undefined;
      if (!entry.controller.signal.aborted) await emitStatus({
        type: everConnected ? 'error' : 'initial-error',
        sessionId: entry.sessionId,
        timestamp: now(),
        error: { code: statusCode === 410 ? 'RESYNC_REQUIRED' : 'STREAM_UNAVAILABLE', status: statusCode },
      });
      entry.connected = false;
      throw new Error('Canonical session stream unavailable');
    });
    return entry.ready;
  };

  const consume = async (entry: SessionEntry) => {
    const reader = entry.reader;
    if (!reader || !entry.cursor) return;
    const decoder = new TextDecoder();
    let buffer = '';
    let lines: string[] = [];
    const epoch = entry.cursor.slice(0, entry.cursor.lastIndexOf(':'));
    let head = BigInt(entry.cursor.slice(entry.cursor.lastIndexOf(':') + 1));
    const frame = async () => {
      let id: string | undefined;
      let name: string | undefined;
      const data: string[] = [];
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
      const dataText = data.join('\n');
      const raw: unknown = JSON.parse(dataText);
      if (name === 'stream.invalidated' || (isJsonRecord(raw) && raw.type === 'stream.invalidated')) {
        const invalidation = StreamInvalidatedSchema.parse(raw);
        if (invalidation.sessionId !== entry.sessionId || invalidation.epoch !== epoch) throw new Error('INVALID_STREAM_SCOPE');
        clearReplay();
        await emitStatus({ type: 'invalidated', sessionId: entry.sessionId, timestamp: now(), invalidation });
        entry.cursor = undefined;
        return false;
      }
      const event = markValidatedCanonicalEvent(CanonicalEventSchema.parse(raw));
      if (event.sessionId !== entry.sessionId || event.epoch !== epoch || name !== event.type || id !== `${event.epoch}:${event.sequence}`) {
        throw new Error('INVALID_STREAM_EVENT');
      }
      const next = BigInt(event.sequence);
      if (next <= head) return true;
      if (next !== head + 1n) throw new Error('STREAM_SEQUENCE_GAP');
      await commit(entry, event, dataText);
      if (entry.controller.signal.aborted) return false;
      head = next;
      entry.cursor = id;
      return true;
    };
    try {
      while (!entry.controller.signal.aborted) {
        const { done, value } = await reader.read();
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
    } catch {
      if (!entry.controller.signal.aborted) {
        clearReplay();
        await emitStatus({ type: 'error', sessionId: entry.sessionId, timestamp: now(), error: { code: 'STREAM_INTERRUPTED' } });
      }
    } finally {
      entry.connected = false;
      await reader.cancel().catch(() => { });
      reader.releaseLock();
      entry.reader = null;
      if (!entry.controller.signal.aborted) await emitStatus({ type: 'disconnect', sessionId: entry.sessionId, timestamp: now() });
    }
  };

  const subscribeSession = async (sessionId: string, { cursor }: { cursor?: string } = {}) => {
    EntityIdSchema.parse(sessionId);
    if (cursor !== undefined) CursorSchema.parse(cursor);
    if (stopping) await stopping;
    const existing = sessions.get(sessionId);
    if (existing?.connected || (existing && !existing.finished)) return existing.ready;
    if (existing) await unsubscribeSession(sessionId, { preserveLeases: true });
    const restarting = replayNeedsReset;
    if (replayNeedsReset) { clearReplay(); replayNeedsReset = false; }
    started = true;
    const entry: SessionEntry = {
      sessionId, cursor: cursor ?? existing?.cursor, controller: new AbortController(), connected: false,
      connectedOnce: existing?.connectedOnce === true || restarting, replayReset: restarting,
    };
    sessions.set(sessionId, entry);
    try { await open(entry); }
    catch (error) { if (sessions.get(sessionId) === entry) sessions.delete(sessionId); throw error; }
  };
  const unsubscribeSession = async (sessionId: string, { preserveLeases = false } = {}) => {
    if (!preserveLeases) sessionLeases.delete(sessionId);
    const entry = sessions.get(sessionId);
    if (!entry) return;
    sessions.delete(sessionId);
    entry.controller.abort();
    await entry.reader?.cancel().catch(() => { });
    await entry.ready?.catch(() => { });
    await entry.finished;
  };
  const retainSession = async (sessionId: string, leaseKey = 'default', options: { cursor?: string } = {}) => {
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
  const releaseSession = async (sessionId: string, leaseKey = 'default') => {
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
  const hasLeases = (sessionId: string) => (sessionLeases.get(sessionId)?.size ?? 0) > 0;
  const addSubscriber = <Subscriber>(set: Set<Subscriber>, subscriber: Subscriber) => {
    if (!isCallable(subscriber)) throw new TypeError('Subscriber must be a function');
    set.add(subscriber);
    return () => set.delete(subscriber);
  };
  function subscribeEvent(subscriber: CanonicalEventSubscriber, options?: { spaces?: false }): () => boolean;
  function subscribeEvent(subscriber: SpaceEventSubscriber, options: { spaces: true }): () => boolean;
  function subscribeEvent(subscriber: CanonicalEventSubscriber | SpaceEventSubscriber, { spaces = false }: { spaces?: boolean } = {}) {
    if (spaces) {
      // SAFETY: the overload signature guarantees a SpaceEventSubscriber when spaces is true.
      return addSubscriber(spaceEventSubscribers, subscriber as SpaceEventSubscriber);
    }
    // SAFETY: the overload signature guarantees a CanonicalEventSubscriber when spaces is omitted or false.
    return addSubscriber(eventSubscribers, subscriber as CanonicalEventSubscriber);
  }
  return {
    async start(sessionIds: string[] = []) { started = true; await Promise.all(sessionIds.map((id) => subscribeSession(id))); },
    subscribeSession,
    unsubscribeSession,
    retainSession,
    releaseSession,
    hasLeases,
    getSessionLeases: (sessionId: string) => Array.from(sessionLeases.get(sessionId)?.keys() ?? []),
    injectEvent,
    stop() {
      if (stopping) return stopping;
      started = false;
      sessionLeases.clear();
      replayNeedsReset = everConnected;
      stopping = Promise.all([...sessions.keys()].map((id) => unsubscribeSession(id))).then(() => delivery).finally(() => { stopping = null; });
      return stopping;
    },
    isStarted: () => started,
    isConnected() { for (const entry of sessions.values()) if (entry.connected) return true; return false; },
    isSessionConnected: (sessionId: string) => sessions.get(sessionId)?.connected === true,
    hasConnected: () => everConnected,
    subscribeEvent,
    subscribeSnapshot: (subscriber: SnapshotSubscriber) => addSubscriber(snapshotSubscribers, subscriber),
    subscribeFrame: (subscriber: FrameSubscriber) => addSubscriber(frameSubscribers, subscriber),
    subscribeStatus: (subscriber: StatusSubscriber) => addSubscriber(statusSubscribers, subscriber),
    replayAfter(eventId: string | undefined, { sessionId }: { sessionId?: string } = {}) {
      if (!eventId || eventId === latestEventId) return [];
      const index = replay.findIndex((entry) => entry.eventId === eventId);
      if (index === -1) return null;
      return replay.slice(index + 1).filter((entry) => !sessionId || entry.sessionId === sessionId);
    },
  };
}
export type GlobalMessageStreamHub = ReturnType<typeof createGlobalMessageStreamHub>;
