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
<<<<<<< HEAD
import { autoReviewUpdatedEventSchema, type AutoReviewUpdatedEvent } from '@/stores/useAutoReviewStore';
||||||| bc50ba56aa
import { sessionWarmingSnapshotSchema, type SessionWarmingSnapshot } from '@/stores/useSessionWarmingStore';
import { isJsonValue, type JsonValue } from '@openchamber/sdk';
=======
import { extensionWaitsUpdatedEventSchema, type ExtensionWaitsUpdatedEvent } from '@/sync/extension-waits';
import { laterPagesUpdatedEventSchema, type LaterPagesUpdatedEvent } from '@/sync/later-pages';
import { sessionWarmingSnapshotSchema, type SessionWarmingSnapshot } from '@/stores/useSessionWarmingStore';
import { sessionTodosEventSchema, type SessionTodosEvent } from '@/stores/useSessionTodosStore';
import { isJsonValue, type JsonValue } from '@openchamber/sdk';
>>>>>>> upstream/main
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

<<<<<<< HEAD
/**
 * The agent asked for a file to be shown in the user's file panel. Every
 * client receives it; one showing that project opens the file.
 */
||||||| bc50ba56aa
/**
 * The agent asked for a file to be shown in the user's file panel. Every
 * client receives it; the desktop file panel opens the file, and the mobile
 * shell opens it only for the session on screen and announces the others.
 */
=======
>>>>>>> upstream/main
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

<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * The agent changed what it remembers. Carries only which store moved, not the
 * entries: listeners re-read from the server, so the event cannot go stale
 * between being sent and being handled.
 */
type AgentMemoryChangedEvent = {
  type: 'agent-memory-changed';
  scope: 'global' | 'project';
  projectId?: string;
};

=======
type AgentMemoryChangedEvent = {
  type: 'agent-memory-changed';
  scope: 'global' | 'project';
  projectId?: string;
};

>>>>>>> upstream/main
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

<<<<<<< HEAD
/**
 * A usage limit stopped a session and the server moved on: the provider to
 * its next account (for every session), or this session to the fallback model.
 */
||||||| bc50ba56aa
/**
 * The set of trackers the server serves changed: an extension that acts as a
 * tracker was approved, enabled, updated, paused or removed, or connected its
 * server. Carries nothing; listeners re-read the tracker list.
 */
type TrackerProvidersChangedEvent = { type: 'tracker-providers-changed' };

/**
 * The set of usage providers the server serves changed: an extension that
 * reports usage was approved, enabled, updated, paused or removed. Carries
 * nothing; listeners re-read the provider list.
 */
type QuotaProvidersChangedEvent = { type: 'quota-providers-changed' };

/**
 * The extension catalog changed: an extension was installed, updated, approved,
 * paused, enabled or removed, or a folder install's files changed. Carries
 * nothing; listeners re-read the catalog.
 */
type GuestsChangedEvent = { type: 'guests-changed' };

/** An extension's service sent its open frames something (`emit`). */
type GuestServiceEvent = { type: 'guest-service-event'; guestId: string; topic: string; data: JsonValue };

/**
 * A theme file in the server's custom themes folder was added, removed or
 * rewritten. Carries nothing; listeners re-read the custom themes.
 */
type ThemesChangedEvent = { type: 'themes-changed' };

/**
 * A usage limit stopped a session and the server moved on: the provider to
 * its next account (for every session), or this session to the fallback model.
 */
=======
type TrackerProvidersChangedEvent = { type: 'tracker-providers-changed' };

type QuotaProvidersChangedEvent = { type: 'quota-providers-changed' };

type GuestsChangedEvent = { type: 'guests-changed' };

type GuestMarksChangedEvent = { type: 'guest-marks-changed' };

type GuestServiceEvent = { type: 'guest-service-event'; guestId: string; topic: string; data: JsonValue };

type ThemesChangedEvent = { type: 'themes-changed' };

>>>>>>> upstream/main
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
<<<<<<< HEAD
 available: z.boolean(),
 autoReady: z.boolean(),
 // Absent from servers before the classifier pick, where Jev always answered.
 jevAvailable: z.boolean().default(true),
 tokenPresent: z.boolean(),
 jevSource: z.enum(['typesafe', 'zen-free']),
||||||| bc50ba56aa
  available: z.boolean(),
  autoReady: z.boolean(),
  // Absent from servers before the classifier pick, where Jev always answered.
  jevAvailable: z.boolean().default(true),
  tokenPresent: z.boolean(),
  jevSource: z.enum(['typesafe', 'zen-free']),
=======
  available: z.boolean(),
  autoReady: z.boolean(),
  jevAvailable: z.boolean().default(true),
  tokenPresent: z.boolean(),
  jevSource: z.enum(['typesafe', 'zen-free']),
>>>>>>> upstream/main
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
<<<<<<< HEAD
 permissionId: z.string().min(1),
 sessionId: z.string().min(1),
 // Where the request lives, so the held request can be announced from its directory's store.
 directory: z.string().nullable().default(null),
 score: z.number(),
 kind: z.string().nullable(),
||||||| bc50ba56aa
  permissionId: z.string().min(1),
  sessionId: z.string().min(1),
  // Where the request lives, so the held request can be announced from its directory's store.
  directory: z.string().nullable().default(null),
  score: z.number(),
  kind: z.string().nullable(),
=======
  permissionId: z.string().min(1),
  sessionId: z.string().min(1),
  directory: z.string().nullable().default(null),
  score: z.number(),
  kind: z.string().nullable(),
>>>>>>> upstream/main
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

<<<<<<< HEAD
/** Followed pull requests, merge requests or issues whose state the server saw move. */
||||||| bc50ba56aa
/**
 * OpenChamber's own session announcements the sync layer applies: a page
 * waiting for an answer, a pending recap, a workflow run, an archive. The main
 * event stream carries them only over the WebSocket; over SSE it is OpenCode's
 * own stream, so this stream is where every transport hears them.
 */
const CONTROL_STREAM_SYNC_TYPES = new Set([
  'openchamber:page-waiting',
  'openchamber:page-settled',
  'openchamber:session-assist',
  'openchamber:session-archived',
  'openchamber:workflow-run',
  'openchamber:workflow-run-removed',
]);
export type ControlStreamSyncEvent = Extract<SyncEvent, {
  type: 'openchamber.page-waiting' | 'openchamber.page-settled' | 'openchamber.session-assist' | 'session.patched'
    | 'openchamber.workflow-run' | 'openchamber.workflow-run-removed';
}>;
type ControlStreamSyncEnvelope = { type: 'control-sync'; event: ControlStreamSyncEvent };

const isControlStreamSyncEvent = (event: SyncEvent): event is ControlStreamSyncEvent => (
  event.type === 'openchamber.page-waiting' || event.type === 'openchamber.page-settled'
  || event.type === 'openchamber.session-assist' || event.type === 'session.patched'
  || event.type === 'openchamber.workflow-run' || event.type === 'openchamber.workflow-run-removed'
);

/** Followed pull requests, merge requests or issues whose state the server saw move. */
=======
const CONTROL_STREAM_SYNC_TYPES = new Set([
  'openchamber:page-waiting',
  'openchamber:page-settled',
  'openchamber:session-assist',
  'openchamber:session-archived',
  'openchamber:workflow-run',
  'openchamber:workflow-run-removed',
]);
export type ControlStreamSyncEvent = Extract<SyncEvent, {
  type: 'openchamber.page-waiting' | 'openchamber.page-settled' | 'openchamber.session-assist' | 'session.patched'
    | 'openchamber.workflow-run' | 'openchamber.workflow-run-removed';
}>;
type ControlStreamSyncEnvelope = { type: 'control-sync'; event: ControlStreamSyncEvent };

const isControlStreamSyncEvent = (event: SyncEvent): event is ControlStreamSyncEvent => (
  event.type === 'openchamber.page-waiting' || event.type === 'openchamber.page-settled'
  || event.type === 'openchamber.session-assist' || event.type === 'session.patched'
  || event.type === 'openchamber.workflow-run' || event.type === 'openchamber.workflow-run-removed'
);

const sharePageChangedSchema = z.object({ sessionId: z.string().min(1), callId: z.string().min(1) });
type SharePageChangedEvent = { type: 'share-page-changed' } & z.infer<typeof sharePageChangedSchema>;

const receivedPageChangedSchema = z.object({ receivedId: z.string().min(1) });
type ReceivedPageChangedEvent = { type: 'received-page-changed' } & z.infer<typeof receivedPageChangedSchema>;

>>>>>>> upstream/main
type TrackedItemsChangedEvent = { type: 'tracked-items-changed'; records: z.infer<typeof trackedItemRecordsSchema> };

const eventStreamReadySchema = z.object({ connectionId: z.string().min(1).optional() });
const sourceControlActivitySchema = z.object({ directory: z.string().min(1) });
const spaceStreamConnectedSchema = z.object({ spaceId: z.string().regex(/^[0-9a-f]{12}$/), status: z.literal('connected') });

const notificationPropertiesSchema = z.object({
<<<<<<< HEAD
 title: z.string().optional(),
 body: z.string().optional(),
 tag: z.string().optional(),
 kind: z.string().optional(),
 sessionId: z.string().optional(),
 directory: z.string().optional(),
 requireHidden: z.boolean().optional(),
 showWhenFocused: z.boolean().optional(),
||||||| bc50ba56aa
  title: z.string().optional(),
  body: z.string().optional(),
  tag: z.string().optional(),
  kind: z.string().optional(),
  sessionId: z.string().optional(),
  directory: z.string().optional(),
  requireHidden: z.boolean().optional(),
  showWhenFocused: z.boolean().optional(),
=======
  title: z.string().optional(),
  body: z.string().optional(),
  tag: z.string().optional(),
  kind: z.string().optional(),
  sessionId: z.string().optional(),
  directory: z.string().optional(),
  requireHidden: z.boolean().optional(),
  showWhenFocused: z.boolean().optional(),
  toastOnly: z.boolean().optional(),
>>>>>>> upstream/main
});

type SessionMetadataEvent = { type: 'session-metadata'; state: SessionMetadataState };
type OpenChamberEvent =
<<<<<<< HEAD
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
||||||| bc50ba56aa
  | { type: 'terminal-sessions-changed' }
  | { type: 'notification'; payload: z.infer<typeof notificationPropertiesSchema> }
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
  | AutoReviewUpdatedEvent
  | PrWatchUpdatedEvent
  | PermissionPolicyEvent
  | ControlStreamSyncEnvelope
  /** Which sessions the server keeps warm, as a full snapshot. */
  | { type: 'session-warming'; snapshot: SessionWarmingSnapshot }
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
  | TrackerProvidersChangedEvent
  | QuotaProvidersChangedEvent
  | GuestsChangedEvent
  | GuestServiceEvent
  | ThemesChangedEvent
  | LimitFailoverEvent
  | ProjectContextChangedEvent
  | SessionFoldersChangedEvent
  | SessionDraftsChangedEvent
  | AgentMemoryChangedEvent;
=======
  | { type: 'terminal-sessions-changed' }
  | { type: 'notification'; payload: z.infer<typeof notificationPropertiesSchema> }
  | { type: 'event-stream-ready'; connectionId: string | null }
  | TrackedItemsChangedEvent
  | { type: 'source-control-activity'; directory: string }
  | RoutingUpdatedEvent
  | RoutingDecisionEvent
  | RoutingPermissionHeldEvent
  | RoutingSafetySkippedEvent
  | MessageQueueUpdatedEvent
  | AutoReviewUpdatedEvent
  | PrWatchUpdatedEvent
  | ExtensionWaitsUpdatedEvent
  | LaterPagesUpdatedEvent
  | PermissionPolicyEvent
  | ControlStreamSyncEnvelope
  | { type: 'session-warming'; snapshot: SessionWarmingSnapshot }
  | { type: 'session-todos'; event: SessionTodosEvent }
  | { type: 'space-queue-stream'; spaceId: string }
  | { type: 'space-permission-stream'; spaceId: string }
  | ScheduledTaskRanEvent
  | SessionCreatedEvent
  | WorktreeChangedEvent
  | BrowserControlRequestEvent
  | FileOpenRequestEvent
  | PlanOpenRequestEvent
  | BrowserProviderResetEvent
  | SourceControlProvidersChangedEvent
  | TrackerProvidersChangedEvent
  | QuotaProvidersChangedEvent
  | GuestsChangedEvent
  | GuestMarksChangedEvent
  | GuestServiceEvent
  | ThemesChangedEvent
  | LimitFailoverEvent
  | ProjectContextChangedEvent
  | SharePageChangedEvent
  | ReceivedPageChangedEvent
  | SessionFoldersChangedEvent
  | SessionDraftsChangedEvent
  | AgentMemoryChangedEvent;
>>>>>>> upstream/main
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
<<<<<<< HEAD
const connectionListeners = new Set<() => void>();
let reconnecting = false;
||||||| bc50ba56aa
// The ready event of the open connection. A listener that subscribes after it
// arrived gets it replayed, since the server sends it once per connection and
// some listeners (tracked-items interest) cannot act until they have it.
let readyEvent: Extract<OpenChamberEvent, { type: 'event-stream-ready' }> | null = null;
=======
let readyEvent: Extract<OpenChamberEvent, { type: 'event-stream-ready' }> | null = null;
>>>>>>> upstream/main

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
<<<<<<< HEAD
  reconnectAttempt += 1;
  connect();
 }, delay);
||||||| bc50ba56aa
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
  const delay = Math.min(1_000 * Math.pow(2, Math.min(reconnectAttempt, 5)), MAX_RECONNECT_DELAY_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempt += 1;
    connect();
  }, delay);
=======
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
  const delay = Math.min(1_000 * Math.pow(2, Math.min(reconnectAttempt, 5)), MAX_RECONNECT_DELAY_MS);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectAttempt += 1;
    connect();
  }, delay);
>>>>>>> upstream/main
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

<<<<<<< HEAD
 if (envelope.type === 'openchamber:space-permission-stream') {
  const parsed = spaceStreamConnectedSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'space-permission-stream', spaceId: parsed.data.spaceId });
  return;
 }
||||||| bc50ba56aa
  if (envelope.type === 'openchamber:auto-review.updated') {
    const parsed = autoReviewUpdatedEventSchema.safeParse(envelope);
    if (parsed.success) {
      for (const listener of listeners) listener(parsed.data);
    }
    return;
  }
=======
  if (envelope.type === 'openchamber:extension-waits.updated') {
    const parsed = extensionWaitsUpdatedEventSchema.safeParse(envelope);
    if (parsed.success) {
      for (const listener of listeners) listener(parsed.data);
    }
    return;
  }

  if (envelope.type === 'openchamber:render-later.updated') {
    const parsed = laterPagesUpdatedEventSchema.safeParse(envelope);
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
>>>>>>> upstream/main

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

<<<<<<< HEAD
 if (envelope.type === 'openchamber:routing.permission-held') {
  const parsed = routingPermissionHeldSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'routing-permission-held', ...parsed.data });
  return;
 }
||||||| bc50ba56aa
  if (envelope.type === 'openchamber:space-queue-stream') {
    const parsed = spaceStreamConnectedSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'space-queue-stream', spaceId: parsed.data.spaceId });
    return;
  }
=======
  if (envelope.type === 'openchamber:session-todos') {
    const parsed = sessionTodosEventSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'session-todos', event: parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:space-queue-stream') {
    const parsed = spaceStreamConnectedSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'space-queue-stream', spaceId: parsed.data.spaceId });
    return;
  }
>>>>>>> upstream/main

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

<<<<<<< HEAD
 if (envelope.type === 'openchamber:session-folders-changed') {
  const parsed = sessionFoldersChangedSchema.safeParse(envelope.properties);
  if (parsed.success) for (const listener of listeners) listener({ type: 'session-folders-changed', ...parsed.data });
  return;
 }
||||||| bc50ba56aa
  if (envelope.type === 'openchamber:browser-provider-reset') {
    const parsed = browserProviderResetSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'browser-provider-reset', ...parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:source-control-providers-changed') {
    for (const listener of listeners) listener({ type: 'source-control-providers-changed' });
    return;
  }

  if (envelope.type === 'openchamber:tracker-providers-changed') {
    for (const listener of listeners) listener({ type: 'tracker-providers-changed' });
    return;
  }

  if (envelope.type === 'openchamber:quota-providers-changed') {
    for (const listener of listeners) listener({ type: 'quota-providers-changed' });
    return;
  }

  if (envelope.type === 'openchamber:guests-changed') {
    for (const listener of listeners) listener({ type: 'guests-changed' });
    return;
  }

  if (envelope.type === 'openchamber:guest-service-event') {
    const parsed = guestServiceEventSchema.safeParse(envelope.properties);
    if (!parsed.success || !isJsonValue(parsed.data.data)) return;
    for (const listener of listeners) listener({ type: 'guest-service-event', ...parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:themes-changed') {
    for (const listener of listeners) listener({ type: 'themes-changed' });
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

  if (envelope.type === 'openchamber:agent-memory-changed') {
    const properties = getEventProperties(envelope.properties);
    const scope = properties?.scope === 'project' ? 'project' : 'global';
    const nextEvent: AgentMemoryChangedEvent = {
      type: 'agent-memory-changed',
      scope,
      ...(typeof properties?.projectId === 'string' && properties.projectId.length > 0
        ? { projectId: properties.projectId }
        : {}),
    };
    for (const listener of listeners) {
      listener(nextEvent);
    }
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
=======
  if (envelope.type === 'openchamber:browser-provider-reset') {
    const parsed = browserProviderResetSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'browser-provider-reset', ...parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:source-control-providers-changed') {
    for (const listener of listeners) listener({ type: 'source-control-providers-changed' });
    return;
  }

  if (envelope.type === 'openchamber:tracker-providers-changed') {
    for (const listener of listeners) listener({ type: 'tracker-providers-changed' });
    return;
  }

  if (envelope.type === 'openchamber:quota-providers-changed') {
    for (const listener of listeners) listener({ type: 'quota-providers-changed' });
    return;
  }

  if (envelope.type === 'openchamber:guests-changed') {
    for (const listener of listeners) listener({ type: 'guests-changed' });
    return;
  }

  if (envelope.type === 'openchamber:guest-marks-changed') {
    for (const listener of listeners) listener({ type: 'guest-marks-changed' });
    return;
  }

  if (envelope.type === 'openchamber:guest-service-event') {
    const parsed = guestServiceEventSchema.safeParse(envelope.properties);
    if (!parsed.success || !isJsonValue(parsed.data.data)) return;
    for (const listener of listeners) listener({ type: 'guest-service-event', ...parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:themes-changed') {
    for (const listener of listeners) listener({ type: 'themes-changed' });
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

  if (envelope.type === 'openchamber:share-page') {
    const parsed = sharePageChangedSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'share-page-changed', ...parsed.data });
    return;
  }

  if (envelope.type === 'openchamber:received-page') {
    const parsed = receivedPageChangedSchema.safeParse(envelope.properties);
    if (parsed.success) for (const listener of listeners) listener({ type: 'received-page-changed', ...parsed.data });
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

  if (envelope.type === 'openchamber:agent-memory-changed') {
    const properties = getEventProperties(envelope.properties);
    const scope = properties?.scope === 'project' ? 'project' : 'global';
    const nextEvent: AgentMemoryChangedEvent = {
      type: 'agent-memory-changed',
      scope,
      ...(typeof properties?.projectId === 'string' && properties.projectId.length > 0
        ? { projectId: properties.projectId }
        : {}),
    };
    for (const listener of listeners) {
      listener(nextEvent);
    }
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
>>>>>>> upstream/main

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

<<<<<<< HEAD
 eventSource = source;
||||||| bc50ba56aa
  // Tell the server what this client can do while the connection lasts. Only a
  // Chromium host can drive a page; a browser tab can display one but not be
  // driven, and the agent tool needs to know which it is talking to without a
  // setting anyone has to remember to change.
  const canControlBrowser = canDriveBrowserPage();
  // Native mobile has no desktop realtime proxy. Fetch can attach the saved
  // instance headers to SSE; EventSource cannot.
  if (isRelayModeActive() || (Object.keys(getRuntimeExtraHeadersSync()).length > 0 && isCapacitorApp())) {
    connectFetchStream(canControlBrowser);
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
=======
  const canControlBrowser = canDriveBrowserPage();
  if (isRelayModeActive() || (Object.keys(getRuntimeExtraHeadersSync()).length > 0 && isCapacitorApp())) {
    connectFetchStream(canControlBrowser);
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
>>>>>>> upstream/main
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
<<<<<<< HEAD
 listeners.add(listener);
 ensureRuntimeChangeSubscription();
 connect();
||||||| bc50ba56aa
  // VS Code runs OpenCode through its bridge, not the OpenChamber server that
  // owns this stream. Opening it here retries against vscode-webview:// forever.
  if (isVSCodeRuntime()) return () => undefined;
=======
  if (isVSCodeRuntime()) return () => undefined;
>>>>>>> upstream/main

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
