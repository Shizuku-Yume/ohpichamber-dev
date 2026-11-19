import { CanonicalEventSchema } from '@openchamber/agent-contract';
import { postLinearSessionStatus } from './status.js';
import type { TrackerRuntimeEvent, TrackerSessionStatusRuntime } from '../trackers/tracker-contract.js';

<<<<<<< HEAD:packages/web/server/lib/linear/status-runtime.js
export function createLinearSessionStatusRuntime() {
||||||| bc50ba56aa:packages/web/server/lib/linear/status-runtime.js
function readProperties(payload) {
  if (!isPlainObject(payload)) return {};
  return isPlainObject(payload.properties) ? payload.properties : {};
}

function readNested(properties, key) {
  return isPlainObject(properties[key]) ? properties[key] : {};
}

function extractSessionId(payload) {
  const properties = readProperties(payload);
  const info = readNested(properties, 'info');
  return readTrimmedString(info.sessionID)
    || readTrimmedString(info.sessionId)
    || readTrimmedString(properties.sessionID)
    || readTrimmedString(properties.sessionId)
    || readTrimmedString(properties.session);
}

function extractStatusType(payload) {
  if (!isPlainObject(payload) || payload.type !== 'session.status') return '';
  const properties = readProperties(payload);
  const status = readNested(properties, 'status');
  const info = readNested(properties, 'info');
  return readTrimmedString(status.type) || readTrimmedString(info.type);
}

function extractErrorName(payload) {
  if (!isPlainObject(payload) || payload.type !== 'session.error') return '';
  const properties = readProperties(payload);
  return readTrimmedString(readNested(properties, 'error').name);
}

export function createLinearSessionStatusRuntime() {
=======
interface LinearEventFields {
  info?: unknown;
  status?: unknown;
  error?: unknown;
  sessionID?: unknown;
  sessionId?: unknown;
  session?: unknown;
  type?: unknown;
  name?: unknown;
}

function readProperties(payload: TrackerRuntimeEvent): LinearEventFields {
  if (!isPlainObject(payload)) return {};
  return isPlainObject(payload.properties) ? payload.properties : {};
}

function readNested(properties: LinearEventFields, key: 'info' | 'status' | 'error'): LinearEventFields {
  return isPlainObject(properties[key]) ? properties[key] : {};
}

function extractSessionId(payload: TrackerRuntimeEvent) {
  const properties = readProperties(payload);
  const info = readNested(properties, 'info');
  const sessionId: unknown = readTrimmedString(info.sessionID)
    || readTrimmedString(info.sessionId)
    || readTrimmedString(properties.sessionID)
    || readTrimmedString(properties.sessionId)
    || readTrimmedString(properties.session);
  return sessionId;
}

function extractStatusType(payload: TrackerRuntimeEvent) {
  if (!isPlainObject(payload) || payload.type !== 'session.status') return '';
  const properties = readProperties(payload);
  const status = readNested(properties, 'status');
  const info = readNested(properties, 'info');
  const type: unknown = readTrimmedString(status.type) || readTrimmedString(info.type);
  return type;
}

function extractErrorName(payload: TrackerRuntimeEvent) {
  if (!isPlainObject(payload) || payload.type !== 'session.error') return '';
  const properties = readProperties(payload);
  const name: unknown = readTrimmedString(readNested(properties, 'error').name);
  return name;
}

export function createLinearSessionStatusRuntime(): TrackerSessionStatusRuntime {
>>>>>>> upstream/main:packages/web/server/lib/linear/status-runtime.ts
  let stopped = false;

<<<<<<< HEAD:packages/web/server/lib/linear/status-runtime.js
  const processCanonicalEvent = (payload) => {
||||||| bc50ba56aa:packages/web/server/lib/linear/status-runtime.js
  const processPayload = (payload) => {
=======
  const processPayload = (payload: TrackerRuntimeEvent) => {
>>>>>>> upstream/main:packages/web/server/lib/linear/status-runtime.ts
    if (stopped) return;
    const parsed = CanonicalEventSchema.safeParse(payload);
    if (!parsed.success) return;
    const event = parsed.data;
    if (event.type === 'session.status') {
      if (event.runtimeStatus !== 'idle') return;
      void postLinearSessionStatus({ kind: 'completed', sessionId: event.sessionId }).catch((error) => {
        console.warn('[linear] failed to post session completed comment:', error?.message || error);
      });
      return;
    }
    if (event.type === 'run.failed') {
      void postLinearSessionStatus({ kind: 'failure', sessionId: event.sessionId }).catch((error) => {
        console.warn('[linear] failed to post session failure comment:', error?.message || error);
      });
    }
  };

  const stop = () => {
    stopped = true;
  };

  return { processCanonicalEvent, stop };
}
