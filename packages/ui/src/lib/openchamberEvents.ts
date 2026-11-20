import { getRuntimeUrlResolver } from './runtime-url';
import { runtimeFetch } from './runtime-fetch';
import { getRuntimeExtraHeadersSync } from './runtime-auth';
import { useAuthSessionStore, waitForAuthSession } from './runtime-auth-expiry';
import { isRelayModeActive } from './relay/runtime-tunnel';
import { getRuntimeApiBaseUrl, subscribeRuntimeEndpointChanged } from './runtime-switch';
import { isCapacitorApp } from './platform';
import { canDriveBrowserPage } from './browser/hostCapability';
import { messageQueueUpdatedEventSchema, type MessageQueueUpdatedEvent } from '@/stores/messageQueueStore';
import { prWatchUpdatedEventSchema, type PrWatchUpdatedEvent } from '@/sync/pr-watch';
import { autoReviewUpdatedEventSchema, type AutoReviewUpdatedEvent } from '@/stores/useAutoReviewStore';
import { z } from 'zod';
import { trackedItemRecordsSchema } from './trackedItems/model';
import type { SyncEvent } from './opencode/events';
import { workflowRunSchema, type WorkflowRun } from './workflows/model';
import { classifyStreamPayload } from '@/sync/event-pipeline';
import { SessionMetadataStateSchema, type SessionMetadataState } from '@openchamber/agent-contract';

type ScheduledTaskRanEvent = {
 type: 'scheduled-task-ran';
 projectId: string;
 taskId: string;
 ranAt: number;
 status: 'running' | 'success' | 'error';
 sessionId?: string;
};

type SessionCreatedEvent = {
 type: 'session-created';
 sessionId: string;
 directory: string;
 projectId?: string;
 createdAt: number;
 promptDispatched: boolean;
 dispatchedAsCommand: boolean;
};

type WorktreeChangedEvent = {
 type: 'worktree-changed';
 directories: string[];
 changedAt: number;
};

type BrowserControlRequestEvent = {
 type: 'browser-control-request';
 requestId: string;
 action: string;
 parameters: Record<string, unknown>;
 context: BrowserControlRequestContext;
};

const browserControlRequestContextSchema = z.object({
 directory: z.string().min(1).nullable().catch(null),
 sessionId: z.string().min(1).nullable().catch(null),
});
export type BrowserControlRequestContext = z.infer<typeof browserControlRequestContextSchema>;
const UNKNOWN_BROWSER_CONTROL_CONTEXT: BrowserControlRequestContext = { directory: null, sessionId: null };

const fileOpenRequestSchema = z.object({
 path: z.string().min(1),
 directory: z.string().min(1).nullable(),
 sessionId: z.string().min(1).nullable(),
});
type FileOpenRequestEvent = { type: 'file-open-request' } & z.infer<typeof fileOpenRequestSchema>;

const planOpenRequestSchema = z.object({
 projectId: z.string().min(1),
 planId: z.string().min(1),
 title: z.string(),
 directory: z.string().min(1).nullable(),
 sessionId: z.string().min(1).nullable(),
});
type PlanOpenRequestEvent = { type: 'plan-open-request' } & z.infer<typeof planOpenRequestSchema>;

const projectContextChangedSchema = z.object({ projectId: z.string().min(1) });
type ProjectContextChangedEvent = { type: 'project-context-changed' } & z.infer<typeof projectContextChangedSchema>;

const sessionFoldersChangedSchema = z.object({ updatedAt: z.number().finite() });
type SessionFoldersChangedEvent = { type: 'session-folders-changed' } & z.infer<typeof sessionFoldersChangedSchema>;

const sessionDraftsChangedSchema = z.object({ updatedAt: z.number().finite() });
type SessionDraftsChangedEvent = { type: 'session-drafts-changed' } & z.infer<typeof sessionDraftsChangedSchema>;

const browserProviderResetSchema = z.object({
 guestId: z.string().min(1),
 guestName: z.string().min(1),
});
type BrowserProviderResetEvent = { type: 'browser-provider-reset' } & z.infer<typeof browserProviderResetSchema>;

type SourceControlProvidersChangedEvent = { type: 'source-control-providers-changed' };

/**
 * A usage limit stopped a session and the server moved on: the provider to
 * its next account (for every session), or this session to the fallback model.
 */
const limitFailoverSchema = z.discriminatedUnion('kind', [
 z.object({
  kind: z.literal('account'),
  sessionId: z.string().min(1),
  providerId: z.string().min(1),
  fromAccount: z.string().nullable(),
  toAccount: z.string().min(1),
 }),
 z.object({
  kind: z.literal('model'),
  sessionId: z.string().min(1),
  providerId: z.string().min(1),
  modelId: z.string().min(1),
  toProviderId: z.string().min(1),
  toModelId: z.string().min(1),
 }),
]);
type LimitFailoverEvent = { type: 'limit-failover'; failover: z.infer<typeof limitFailoverSchema> };

const routingUpdatedSchema = z.object({
  available: z.boolean(),
  autoReady: z.boolean(),
  jevAvailable: z.boolean().default(true),
  tokenPresent: z.boolean(),
  jevSource: z.enum(['typesafe', 'zen-free']),
});

const routingDecisionSchema = z.object({
 sessionId: z.string().min(1),
 at: z.number(),
 category: z.string().nullable(),
 confidence: z.number(),
 reason: z.enum(['routed', 'low-confidence', 'unknown-category', 'error', 'not-ready']),
 providerID: z.string().optional(),
 modelID: z.string().optional(),
 variant: z.string().nullable().optional(),
 agent: z.string().nullable().optional(),
 error: z.string().optional(),
});

const routingPermissionHeldSchema = z.object({
  permissionId: z.string().min(1),
  sessionId: z.string().min(1),
  directory: z.string().nullable().default(null),
  score: z.number(),
  kind: z.string().nullable(),
});

const routingSafetySkippedSchema = z.object({
 permissionId: z.string().min(1),
 sessionId: z.string().min(1),
 directory: z.string().nullable().default(null),
 error: z.string(),
});

type RoutingUpdatedEvent = { type: 'routing-updated' } & z.infer<typeof routingUpdatedSchema>;
type RoutingDecisionEvent = { type: 'routing-decision'; decision: z.infer<typeof routingDecisionSchema> };
type RoutingPermissionHeldEvent = { type: 'routing-permission-held' } & z.infer<typeof routingPermissionHeldSchema>;
type RoutingSafetySkippedEvent = { type: 'routing-safety-skipped' } & z.infer<typeof routingSafetySkippedSchema>;

export type PermissionPolicySyncEvent = Extract<SyncEvent, { type: 'openchamber.permission-auto-accept' | 'openchamber.permission-left-for-user' }>;
type PermissionPolicyEvent = { type: 'permission-policy'; event: PermissionPolicySyncEvent };

/** Followed pull requests, merge requests or issues whose state the server saw move. */
type TrackedItemsChangedEvent = { type: 'tracked-items-changed'; records: z.infer<typeof trackedItemRecordsSchema> };

const eventStreamReadySchema = z.object({ connectionId: z.string().min(1).optional() });
const sourceControlActivitySchema = z.object({ directory: z.string().min(1) });
const spaceStreamConnectedSchema = z.object({ spaceId: z.string().regex(/^[0-9a-f]{12}$/), status: z.literal('connected') });

const notificationPropertiesSchema = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  tag: z.string().optional(),
  kind: z.string().optional(),
  sessionId: z.string().optional(),
  directory: z.string().optional(),
  requireHidden: z.boolean().optional(),
  showWhenFocused: z.boolean().optional(),
  toastOnly: z.boolean().optional(),
});

type SessionMetadataEvent = { type: 'session-metadata'; state: SessionMetadataState };
type OpenChamberEvent =
 | { type: 'notification'; payload: z.infer<typeof notificationPropertiesSchema> }
 /** An extension was installed, updated, approved, paused or removed: the catalog changed. */
 | { type: 'guests-changed' }
 /** A terminal session was created, exited, restarted or removed. */
 | { type: 'terminal-sessions-changed' }
 /** A workflow run's state as the server last wrote it; the card and panel follow it. */
 | { type: 'workflow-run'; run: WorkflowRun }
 /** A workflow run the user deleted. */
 | { type: 'workflow-run-removed'; runId: string; parentSessionId: string }
 /** `connectionId` names this connection on the server; absent from servers before tracked items. */
 | { type: 'event-stream-ready'; connectionId: string | null }
 | TrackedItemsChangedEvent
 /** An agent turn finished in `directory`; its branches may have a new pull request. */
 | { type: 'source-control-activity'; directory: string }
 | RoutingUpdatedEvent
 | RoutingDecisionEvent
 | RoutingPermissionHeldEvent
 | RoutingSafetySkippedEvent
 | MessageQueueUpdatedEvent
 | PrWatchUpdatedEvent
 | AutoReviewUpdatedEvent
 | PermissionPolicyEvent
 /** The host follows this space's queue again; what changed in a gap is read from the space. */
 | { type: 'space-queue-stream'; spaceId: string }
 /** The host follows this space's permission modes again; what changed in a gap is read from the space. */
 | { type: 'space-permission-stream'; spaceId: string }
 | ScheduledTaskRanEvent
 | SessionCreatedEvent
 | WorktreeChangedEvent
 | BrowserControlRequestEvent
 | FileOpenRequestEvent
 | PlanOpenRequestEvent
 | BrowserProviderResetEvent
 | SourceControlProvidersChangedEvent
 | LimitFailoverEvent
 | ProjectContextChangedEvent
 | SessionFoldersChangedEvent
 | SessionDraftsChangedEvent
 | SessionMetadataEvent;
type Listener = (event: OpenChamberEvent) => void;

const worktreeChangedPropertiesSchema = z.object({
 directories: z.array(z.string().min(1)).min(1),
 at: z.number().optional(),
});

let eventSource: EventSource | null = null;
let streamAbortController: AbortController | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let authSessionWait: AbortController | null = null;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let runtimeChangeUnsubscribe: (() => void) | null = null;
const listeners = new Set<Listener>();
const connectionListeners = new Set<() => void>();
let reconnecting = false;

const MAX_RECONNECT_DELAY_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;

export const isOpenchamberEventsReconnecting = () => reconnecting;

export const subscribeOpenchamberEventsConnection = (listener: () => void): (() => void) => {
 connectionListeners.add(listener);
 return () => { connectionListeners.delete(listener); };
};

const setReconnecting = (next: boolean) => {
 if (reconnecting === next) return;
 reconnecting = next;
 for (const listener of connectionListeners) listener();
};

const clearReconnectTimer = () => {
 if (reconnectTimer) clearTimeout(reconnectTimer);
 reconnectTimer = null;
};

const clearHeartbeatTimer = () => {
 if (!heartbeatTimer) {
  return;
 }
 clearTimeout(heartbeatTimer);
 heartbeatTimer = null;
};

const cancelAuthSessionWait = () => {
 authSessionWait?.abort();
 authSessionWait = null;
};

const shouldSlowReconnect = () => (typeof navigator !== 'undefined' && navigator.onLine === false)
 || (typeof document !== 'undefined' && document.visibilityState === 'hidden');

const scheduleReconnect = (permanentFailure = false) => {
 if (listeners.size === 0) return;
 setReconnecting(true);
 if (reconnectTimer || authSessionWait) {
  return;
 }
 // An expired session answers every attempt with 401; wait for the login
 // instead and reconnect right after it.
 if (useAuthSessionStore.getState().state !== 'ok') {
  const wait = new AbortController();
  authSessionWait = wait;
  void waitForAuthSession(wait.signal).then(() => {
   if (wait.signal.aborted) return;
   authSessionWait = null;
   reconnectAttempt = 0;
   connect();
  });
  return;
 }
 const slow = permanentFailure || shouldSlowReconnect();
 const delay = slow
  ? MAX_RECONNECT_DELAY_MS
  : Math.min(1_000 * Math.pow(2, Math.min(reconnectAttempt, 5)), MAX_RECONNECT_DELAY_MS);
 reconnectTimer = setTimeout(() => {
  reconnectTimer = null;
  if (!slow && shouldSlowReconnect()) {
   scheduleReconnect();
   return;
  }
  reconnectAttempt += 1;
  connect();
 }, delay);
};

const cleanupSource = () => {
 clearHeartbeatTimer();
 streamAbortController?.abort();
 streamAbortController = null;
 if (eventSource) {
  eventSource.close();
 }
 eventSource = null;
};

// The native resume health probe may fail before a half-open stream notices.
export const markOpenchamberEventsUnreachable = () => {
 if (reconnecting || listeners.size === 0) return;
 cleanupSource();
 scheduleReconnect();
};

export const retryOpenchamberEventsNow = () => {
 if (!reconnectTimer) return;
 clearReconnectTimer();
 connect();
};

const wakeReconnect = () => {
 if (!shouldSlowReconnect()) retryOpenchamberEventsNow();
};

const connectFetchStream = (canControlBrowser: boolean, directNative: boolean) => {
 const controller = new AbortController();
 streamAbortController = controller;
 resetHeartbeatTimer();
 void (async () => {
  let permanentFailure = false;
  try {
   const response = await runtimeFetch('/api/openchamber/events', {
    query: canControlBrowser ? { browser: '1' } : undefined,
    headers: { Accept: 'text/event-stream' },
    redirect: directNative && Object.keys(getRuntimeExtraHeadersSync()).length ? 'error' : undefined,
    signal: controller.signal,
   });
   if (controller.signal.aborted) {
    await response.body?.cancel();
    return;
   }
   if (!response.ok || !response.body || !response.headers.get('content-type')?.startsWith('text/event-stream')) {
    const { status } = response;
    permanentFailure = status >= 400 && status < 500 && status !== 408 && status !== 429;
    await response.body?.cancel();
    throw new Error(`OhPiChamber events returned ${response.status}`);
   }
   const reader = response.body.getReader();
   const decoder = new TextDecoder();
   let pending = '';
   let data: string[] = [];
   resetHeartbeatTimer();
   try {
    while (!controller.signal.aborted) {
     const { value, done } = await reader.read();
     if (done) break;
     pending += decoder.decode(value, { stream: true });
     let newline = pending.indexOf('\n');
     while (newline !== -1) {
      const line = pending.slice(0, newline).replace(/\r$/, '');
      pending = pending.slice(newline + 1);
      if (line === '') {
       if (data.length && !controller.signal.aborted) {
        resetHeartbeatTimer();
        const envelope = parseEnvelope(data.join('\n'));
        if (envelope) dispatchFromEnvelope(envelope);
       }
       data = [];
      } else if (line === 'data' || line.startsWith('data:')) {
       data.push(line === 'data' ? '' : line.slice(5).replace(/^ /, ''));
      }
      newline = pending.indexOf('\n');
     }
    }
   } finally {
    if (!controller.signal.aborted) await reader.cancel();
    reader.releaseLock();
   }
  } catch {
   // A failed or ended stream follows the same reconnect path as EventSource.
  }
  if (streamAbortController !== controller) return;
  cleanupSource();
  scheduleReconnect(permanentFailure);
 })();
};

const resetHeartbeatTimer = () => {
 clearHeartbeatTimer();
 if (listeners.size === 0) {
  return;
 }
 heartbeatTimer = setTimeout(() => {
  cleanupSource();
  scheduleReconnect();
 }, HEARTBEAT_TIMEOUT_MS);
};

const parseEnvelope = (raw: string): { type: string; properties: unknown } | null => {
 if (!raw || raw.trim().length === 0) {
  return null;
 }

 try {
  const parsed = JSON.parse(raw);
  const type = typeof parsed?.type === 'string' ? parsed.type : '';
  const properties = parsed?.properties;
  if (!type) {
   return null;
  }
  return { type, properties };
 } catch {
  return null;
 }
};

const getEventProperties = (properties: unknown): Record<string, unknown> | null => {
 if (!properties || typeof properties !== 'object') {
  return null;
 }
 return properties as Record<string, unknown>;
};

const dispatchFromEnvelope = (envelope: { type: string; properties: unknown }) => {
 if (envelope.type === 'openchamber:session-metadata') {
  const raw = getEventProperties(envelope.properties);
  if (!raw) return;
  const sessionId = typeof raw.sessionId === 'string' && raw.sessionId.length > 0
   ? raw.sessionId
   : typeof raw.sessionID === 'string' && raw.sessionID.length > 0
    ? raw.sessionID
    : undefined;
  if (!sessionId) return;
  const parsed = SessionMetadataStateSchema.safeParse({
   sessionId,
   revision: raw.revision,
   metadata: raw.metadata ?? null,
  });
  if (parsed.success) {
   for (const listener of listeners) listener({ type: 'session-metadata', state: parsed.data });
  }
  return;
 }
 if (envelope.type === 'openchamber:notification') {
  const parsed = notificationPropertiesSchema.safeParse(envelope.properties);
  if (parsed.success) {
   for (const listener of listeners) listener({ type: 'notification', payload: parsed.data });
  }
  return;
 }

 if (envelope.type === 'openchamber:guests-changed') {
  for (const listener of listeners) listener({ type: 'guests-changed' });
  return;
 }
 if (envelope.type === 'openchamber:terminal-sessions-changed') {
  for (const listener of listeners) listener({ type: 'terminal-sessions-changed' });
  return;
 }
 if (envelope.type === 'openchamber:workflow-run') {
  const parsed = workflowRunSchema.safeParse(getEventProperties(envelope.properties)?.run);
  if (parsed.success) for (const listener of listeners) listener({ type: 'workflow-run', run: parsed.data });
  return;
 }
 if (envelope.type === 'openchamber:workflow-run-removed') {
  const raw = getEventProperties(envelope.properties);
  const runId = typeof raw?.runId === 'string' ? raw.runId : '';
  const parentSessionId = typeof raw?.parentSessionId === 'string' ? raw.parentSessionId : '';
  if (runId && parentSessionId) for (const listener of listeners) listener({ type: 'workflow-run-removed', runId, parentSessionId });
  return;
 }
 if (envelope.type === 'openchamber:event-stream-ready') {
  reconnectAttempt = 0;
  setReconnecting(false);
  const ready = eventStreamReadySchema.safeParse(envelope.properties);
  const connectionId = ready.success ? ready.data.connectionId ?? null : null;
  for (const listener of listeners) listener({ type: 'event-stream-ready', connectionId });
  return;
 }

 if (envelope.type === 'openchamber:source-control.activity') {
  const parsed = sourceControlActivitySchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'source-control-activity', directory: parsed.data.directory });
  return;
 }

 if (envelope.type === 'openchamber:tracked-items.changed') {
  const records = trackedItemRecordsSchema.parse(getEventProperties(envelope.properties)?.states);
  if (records.length > 0) for (const listener of listeners) listener({ type: 'tracked-items-changed', records });
  return;
 }

 if (envelope.type === 'openchamber:message-queue.updated') {
  const parsed = messageQueueUpdatedEventSchema.safeParse(envelope);
  if (parsed.success) {
   for (const listener of listeners) listener(parsed.data);
  }
  return;
 }
 if (envelope.type === 'openchamber:pr-watch.updated') {
  const parsed = prWatchUpdatedEventSchema.safeParse(envelope);
  if (parsed.success) {
   for (const listener of listeners) listener(parsed.data);
  }
  return;
 }

 if (envelope.type === 'openchamber:auto-review.updated') {
  const parsed = autoReviewUpdatedEventSchema.safeParse(envelope);
  if (parsed.success) {
   for (const listener of listeners) listener(parsed.data);
  }
  return;
 }

 if (envelope.type === 'openchamber:permission-auto-accept.updated' || envelope.type === 'openchamber:permission-auto-accept.left-for-user') {
  const classified = classifyStreamPayload(envelope, undefined);
  if (classified.kind !== 'events') return;
  for (const { event } of classified.events) {
   if (event.type !== 'openchamber.permission-auto-accept' && event.type !== 'openchamber.permission-left-for-user') continue;
   for (const listener of listeners) listener({ type: 'permission-policy', event: event as PermissionPolicySyncEvent });
  }
  return;
 }

 if (envelope.type === 'openchamber:space-queue-stream') {
  const parsed = spaceStreamConnectedSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'space-queue-stream', spaceId: parsed.data.spaceId });
  return;
 }

 if (envelope.type === 'openchamber:space-permission-stream') {
  const parsed = spaceStreamConnectedSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'space-permission-stream', spaceId: parsed.data.spaceId });
  return;
 }

 if (envelope.type === 'openchamber:heartbeat') {
  return;
 }

 if (envelope.type === 'openchamber:routing.updated') {
  const parsed = routingUpdatedSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'routing-updated', ...parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:routing.decision') {
  const parsed = routingDecisionSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'routing-decision', decision: parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:routing.permission-held') {
  const parsed = routingPermissionHeldSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'routing-permission-held', ...parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:routing.safety-skipped') {
  const parsed = routingSafetySkippedSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'routing-safety-skipped', ...parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:plan-open-request') {
  const parsed = planOpenRequestSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'plan-open-request', ...parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:file-open-request') {
  const parsed = fileOpenRequestSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'file-open-request', ...parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:browser-provider-reset') {
  const parsed = browserProviderResetSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'browser-provider-reset', ...parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:source-control-providers-changed') {
  for (const listener of listeners) listener({ type: 'source-control-providers-changed' });
  return;
 }

 if (envelope.type === 'openchamber:limit-failover') {
  const parsed = limitFailoverSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'limit-failover', failover: parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:project-context-changed') {
  const parsed = projectContextChangedSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'project-context-changed', ...parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:session-drafts-changed') {
  const parsed = sessionDraftsChangedSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'session-drafts-changed', ...parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:session-folders-changed') {
  const parsed = sessionFoldersChangedSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'session-folders-changed', ...parsed.data });
  return;
 }

 if (envelope.type === 'openchamber:session-created') {
  const properties = getEventProperties(envelope.properties);
  const sessionId = typeof properties?.sessionId === 'string' ? properties.sessionId : '';
  const directory = typeof properties?.directory === 'string' ? properties.directory : '';
  if (!sessionId || !directory) {
   return;
  }

  const nextEvent: SessionCreatedEvent = {
   type: 'session-created',
   sessionId,
   directory,
   createdAt: typeof properties?.createdAt === 'number' ? properties.createdAt : Date.now(),
   promptDispatched: properties?.promptDispatched === true,
   dispatchedAsCommand: properties?.dispatchedAsCommand === true,
   ...(typeof properties?.projectId === 'string' && properties.projectId.length > 0
    ? { projectId: properties.projectId }
    : {}),
  };
  for (const listener of listeners) {
   listener(nextEvent);
  }
  return;
 }

 if (envelope.type === 'openchamber:worktree-changed') {
  const parsed = worktreeChangedPropertiesSchema.safeParse(envelope.properties);
  if (!parsed.success) return;
  const nextEvent: WorktreeChangedEvent = {
   type: 'worktree-changed',
   directories: parsed.data.directories,
   changedAt: parsed.data.at ?? Date.now(),
  };
  for (const listener of listeners) listener(nextEvent);
  return;
 }

 if (envelope.type === 'openchamber:browser-control-request') {
  const properties = getEventProperties(envelope.properties);
  const requestId = typeof properties?.requestId === 'string' ? properties.requestId : '';
  const action = typeof properties?.action === 'string' ? properties.action : '';
  if (!requestId || !action) {
   return;
  }

  const rawParameters = properties?.parameters;
  const nextEvent: BrowserControlRequestEvent = {
   type: 'browser-control-request',
   requestId,
   action,
   parameters: rawParameters && typeof rawParameters === 'object' && !Array.isArray(rawParameters)
    ? rawParameters as Record<string, unknown>
    : {},
   context: browserControlRequestContextSchema.safeParse(properties?.context).data ?? UNKNOWN_BROWSER_CONTROL_CONTEXT,
  };
  for (const listener of listeners) {
   listener(nextEvent);
  }
  return;
 }

 if (envelope.type !== 'openchamber:scheduled-task-ran') {
  return;
 }

 const properties = getEventProperties(envelope.properties);
 const projectId = typeof properties?.projectId === 'string' ? properties.projectId : '';
 const taskId = typeof properties?.taskId === 'string' ? properties.taskId : '';
 const ranAt = typeof properties?.ranAt === 'number' ? properties.ranAt : Date.now();
 const rawStatus = properties?.status;
 const status = rawStatus === 'running' || rawStatus === 'error' ? rawStatus : 'success';
 if (!projectId || !taskId) {
  return;
 }

 const nextEvent: ScheduledTaskRanEvent = {
  type: 'scheduled-task-ran',
  projectId,
  taskId,
  ranAt,
  status,
  ...(typeof properties?.sessionId === 'string' && properties.sessionId.length > 0
   ? { sessionId: properties.sessionId }
   : {}),
 };
 for (const listener of listeners) {
  listener(nextEvent);
 }
};

const connect = () => {
 if (typeof window === 'undefined' || listeners.size === 0) {
  return;
 }
 if (reconnectTimer || authSessionWait) return;
 if (streamAbortController || (eventSource && eventSource.readyState !== EventSource.CLOSED)) {
  return;
 }

 cleanupSource();

 // Tell the server what this client can do while the connection lasts. Only a
 // Chromium host can drive a page; a browser tab can display one but not be
 // driven, and the agent tool needs to know which it is talking to without a
 // setting anyone has to remember to change.
 const canControlBrowser = canDriveBrowserPage();
 const native = isCapacitorApp();
 if (native && !getRuntimeApiBaseUrl()) return;
 const relay = isRelayModeActive();
 if (relay || native) {
  // Native direct connections can require both bearer auth and saved proxy
  // headers, neither of which can be attached to an EventSource request.
  connectFetchStream(canControlBrowser, native && !relay);
  return;
 }
 if (typeof EventSource !== 'function') return;
 const source = new EventSource(getRuntimeUrlResolver().sse(
  '/api/openchamber/events',
  canControlBrowser ? { browser: '1' } : undefined,
 ));
 source.onopen = () => {
  if (eventSource !== source) return;
  resetHeartbeatTimer();
 };
 source.onmessage = (event) => {
  if (eventSource !== source) return;
  resetHeartbeatTimer();
  const envelope = parseEnvelope(event.data);
  if (!envelope) {
   return;
  }
  dispatchFromEnvelope(envelope);
 };

 source.onerror = () => {
  if (eventSource !== source) return;
  cleanupSource();
  scheduleReconnect();
 };

 eventSource = source;
};

const ensureRuntimeChangeSubscription = () => {
 if (runtimeChangeUnsubscribe || typeof window === 'undefined') return;
 window.addEventListener('online', wakeReconnect);
 if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wakeReconnect);
 runtimeChangeUnsubscribe = subscribeRuntimeEndpointChanged((detail) => {
  cleanupSource();
  clearReconnectTimer();
  cancelAuthSessionWait();
  reconnectAttempt = 0;
  if (detail.runtimeKey !== detail.previousRuntimeKey) setReconnecting(false);
  connect();
 });
};

const cleanupRuntimeChangeSubscription = () => {
 if (typeof window !== 'undefined') window.removeEventListener('online', wakeReconnect);
 if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', wakeReconnect);
 runtimeChangeUnsubscribe?.();
 runtimeChangeUnsubscribe = null;
};

export const subscribeOpenchamberEvents = (listener: Listener): (() => void) => {
 listeners.add(listener);
 ensureRuntimeChangeSubscription();
 connect();

 return () => {
  listeners.delete(listener);
  if (listeners.size === 0) {
   clearReconnectTimer();
   cancelAuthSessionWait();
   reconnectAttempt = 0;
   cleanupSource();
   setReconnecting(false);
   cleanupRuntimeChangeSubscription();
  }
 };
};
