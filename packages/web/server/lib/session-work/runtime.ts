<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
/**
 * "In work": Jev moves a session into work when real work starts in it, and
 * says when a turn looks like the end of that work, or handed over changes
 * worth a look. The user closes; this runtime never does. See
 * DOCUMENTATION.md.
 *
 * Two moments ask Jev:
 * - a user message was sent (`message.updated`, role user): only while the
 *   session is not in work, so an open session costs no call here;
 * - a turn ended: session assist calls `evaluateTurnEnd` before it arms its
 *   quiet window, and one call answers both this runtime's questions and
 *   whether the Small Model is worth waking.
 *
 * Every failure leaves things as they were: nothing opens, no hint appears,
 * and session assist behaves as it did without Jev.
 */
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
/**
 * "In work": a session goes into work when the user sends a message in it,
 * and Jev says when a turn looks like the end of that work, or handed over
 * changes worth a look. The user closes; this runtime never does. See
 * DOCUMENTATION.md.
 *
 * - A user message was sent (`message.updated`, role user): the session opens,
 *   or reopens if the user closed it before sending. No Jev. A shell command
 *   the user ran (`session.shell.started`) does the same. An open that failed
 *   is retried a bounded number of times, and one for a session archived at
 *   the time waits for `session.unarchived`.
 * - A turn ended: session assist calls `evaluateTurnEnd` before it arms its
 *   quiet window, and one Jev call answers both this runtime's questions and
 *   whether the Small Model is worth waking.
 *
 * Every failure leaves things as they were: nothing opens, no hint appears,
 * and session assist behaves as it did without Jev.
 */
=======
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
import fs from 'fs';
import os from 'os';
import path from 'path';
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
import { readMergedSettingsSync } from '../host/settings-files.js';
import { loadAssistContext, loadSettledTurns } from '../session-assist/context.js';
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
import { OpenCode } from '@opencode/client';
import { z } from 'zod';
import { readMergedSettingsSync } from '../opencode/settings-files.js';
import { loadAssistContext } from '../session-assist/context.js';
=======
import { OpenCode } from '@opencode/client';
import { z } from 'zod';
import { readMergedSettingsSync } from '../settings/settings-files.js';
import { loadAssistContext } from '../session-assist/context.js';
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
import { turnsToHistory, excerptHead, excerptHeadTail } from '../routing/history.js';
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
import {
  buildSendRequest,
  buildTurnEndRequest,
  decideAssist,
  decideOpen,
  decideReviewReady,
  decideWrapUp,
} from './questions.js';
import { clearSuggestionPatch, offerReviewPatch, openByJevPatch, readWork, suggestDonePatch } from './state.js';
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
import { buildTurnEndRequest, decideAssist, decideReviewReady, decideWrapUp } from './questions.js';
import { clearSuggestionPatch, offerReviewPatch, openPatch, readWork, suggestDonePatch } from './state.js';
import { createWorkMembership } from './membership.js';
=======
import { buildTurnEndRequest, decideAssist, decideReviewReady, decideWrapUp } from './questions.js';
import { clearSuggestionPatch, offerReviewPatch, openPatch, readWork, suggestDonePatch } from './state.js';
import { createWorkMembership } from './membership.js';
import { sessionParentId } from '../session-lineage.js';
import type { createSessionLineage } from '../session-lineage.js';
import type { SessionActivityProbe, RunningSessionJob } from '../opencode/session-activity.js';
import type { ClassifierEndpoint } from '../routing/classifier.js';
import type { createJevClient } from '../routing/jev.js';
import type { AssistTargets } from '../session-assist/contracts.js';
import type { WorkMetadataPatch } from './state.js';
import type { SessionMetadata } from '../openchamber-sessions/session-metadata-store.js';

type Client = ReturnType<typeof OpenCode.make>;
type Session = Awaited<ReturnType<Client['session']['get']>> & { directory?: string };

export interface SessionWorkOptions {
  buildOpenCodeUrl: (route: string, query: string) => string;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  getSettings?: () => { enabled: boolean; reviewOffer: boolean };
  classifierEndpoint: () => Promise<ClassifierEndpoint | null>;
  jev: Pick<ReturnType<typeof createJevClient>, 'ask'>;
  readMetadata: (sessionId: string, directory: string) => Promise<SessionMetadata | null | undefined>;
  updateMetadata: (
    sessionId: string,
    decide: (metadata: SessionMetadata | null | undefined) => WorkMetadataPatch | null,
    options: { directory: string | undefined },
  ) => Promise<{ changed: boolean }>;
  isSessionArchived?: (sessionId: string) => Promise<boolean>;
  isWorktreePinned?: (directory: string) => Promise<boolean>;
  chatRoots?: string[];
  lineage?: Pick<ReturnType<typeof createSessionLineage>, 'remember' | 'isChild'> | null;
  activityProbe?: SessionActivityProbe | null;
  now?: () => number;
  openRetryDelaysMs?: number[];
  doneHintDelayMs?: number;
}

interface OpenRequest {
  sessionId: string;
  directory: string;
  createdAt: number;
}

interface PendingOpen extends OpenRequest {
  failures: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  restored: boolean;
}

interface HintRequest {
  sessionId: string;
  directory: string;
  generation: number;
}

export interface WorkEvent {
  properties?: { directory?: string | undefined };
}

export interface TurnEndInput {
  sessionId: string;
  directory: string;
  assist: AssistTargets;
}

const isSessionNotFound = (error: unknown): error is { _tag: 'SessionNotFoundError' } =>
  error != null && (typeof error === 'object' || typeof error === 'function')
  && '_tag' in error && error._tag === 'SessionNotFoundError';
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts

const OPENCHAMBER_SETTINGS_FILE = path.join(
  process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'ohpichamber'),
  'settings.json',
);

<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
/** In work and auto-open default on, the review offer off; read at every use so a change applies without a restart. */
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
/** In work defaults on, the review offer off; read at every use so a change applies without a restart. */
=======
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
const readSessionWorkSettings = () => {
  const settings = readMergedSettingsSync({ fs, path, settingsFilePath: OPENCHAMBER_SETTINGS_FILE });
  return {
    enabled: settings.sessionWorkEnabled !== false,
    autoOpen: settings.sessionWorkAutoOpen !== false,
    reviewOffer: settings.sessionReviewOfferEnabled === true,
  };
};

const REQUEST_CHARS = 1_500;
const ANSWER_EDGE_CHARS = 500;
const SEEN_MESSAGES_LIMIT = 500;
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
/** Waits before each new try at an open that failed; after the last one it gives up. */
const OPEN_RETRY_DELAYS_MS = [2_000, 10_000, 60_000];

const errorMessage = (error) => (error instanceof Error ? error.message : String(error));
=======
const OPEN_RETRY_DELAYS_MS = [2_000, 10_000, 60_000];
const DONE_HINT_DELAY_MS = 10 * 60_000;
const BACKGROUND_SHELL_WAIT_MS = 30 * 60_000;
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts

<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
const userMessageSchema = z.object({
  type: z.literal('message.updated'),
  properties: z.object({
    sessionID: z.string().min(1),
    info: z.object({
      id: z.string().min(1),
      role: z.literal('user'),
      time: z.object({ created: z.number() }).partial().optional(),
    }),
  }),
});

/** A shell command the user ran from the composer; only the user starts one. */
const shellSchema = z.object({
  type: z.literal('session.shell.started'),
  id: z.string().min(1),
  created: z.number(),
  properties: z.object({ sessionID: z.string().min(1) }),
});

/** OpenCode restored an archived session (`event-stream/translate-v2.js`). */
const unarchivedSchema = z.object({
  type: z.literal('session.unarchived'),
  properties: z.object({ sessionID: z.string().min(1) }),
});

const busySchema = z.object({
  type: z.literal('session.status'),
  properties: z.object({ sessionID: z.string().min(1), status: z.object({ type: z.literal('busy') }) }),
});

=======
const userMessageSchema = z.object({
  type: z.literal('message.updated'),
  properties: z.object({
    sessionID: z.string().min(1),
    info: z.object({
      id: z.string().min(1),
      role: z.literal('user'),
      time: z.object({ created: z.number() }).partial().optional(),
    }),
  }),
});

const shellSchema = z.object({
  type: z.literal('session.shell.started'),
  id: z.string().min(1),
  created: z.number(),
  properties: z.object({ sessionID: z.string().min(1) }),
});

const unarchivedSchema = z.object({
  type: z.literal('session.unarchived'),
  properties: z.object({ sessionID: z.string().min(1) }),
});

const busySchema = z.object({
  type: z.literal('session.status'),
  properties: z.object({ sessionID: z.string().min(1), status: z.object({ type: z.literal('busy') }) }),
});

>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
export function createSessionWorkRuntime({
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
  sessionService,
  resolveSessionScope,
  /** `{ enabled, autoOpen, reviewOffer }` as currently saved. */
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  /** `{ enabled, reviewOffer }` as currently saved. */
=======
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
  getSettings = readSessionWorkSettings,
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
  /** `(workspaceId) => endpoint | null`, resolved within the session's Host workspace scope. */
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
  /** The classification provider's endpoint, or null when there is no Jev. */
=======
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
  classifierEndpoint,
  jev,
  readMetadata,
  updateMetadata,
  isSessionArchived = async () => false,
  isWorktreePinned = async () => false,
  chatRoots = [],
  lineage = null,
  activityProbe = null,
  now = Date.now,
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
}) {
  if (!sessionService || typeof sessionService.open !== 'function' || typeof sessionService.history !== 'function') {
    throw new Error('session-work requires the canonical session service');
  }
  if (typeof resolveSessionScope !== 'function') throw new Error('session-work requires a session scope resolver');
  const resolvedChatRoots = chatRoots.filter(Boolean).map((root) => path.resolve(root));
  const isChatDirectory = (directory) => {
    if (!directory) return false;
    const resolved = path.resolve(directory);
    return resolvedChatRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  };
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
  openRetryDelaysMs = OPEN_RETRY_DELAYS_MS,
}) {
  const { canBeInWork } = createWorkMembership({ chatRoots });
=======
  openRetryDelaysMs = OPEN_RETRY_DELAYS_MS,
  doneHintDelayMs = DONE_HINT_DELAY_MS,
}: SessionWorkOptions) {
  const { canBeInWork } = createWorkMembership({ chatRoots });
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
  let stopped = false;
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
  const seenMessages = new Set();
  // Sessions where this process wrote a hint, so a new turn can retire it
  // without reading every session's metadata at every turn start.
  const suggested = new Map();
  // A turn counter per session, moved by every turn start and every new user
  // message. A turn-end check captures it before asking Jev and writes the
  // hint only if no newer turn began in the meantime: a late answer about
  // the previous turn must not land on the next one.
  // Values come from one process-wide counter, so they never repeat: a session
  // evicted from the bounded map reads 0, which no pending check captured
  // after a turn start, and its late answer is dropped rather than accepted.
  const turnGenerations = new Map();
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
  // Messages already taken: each starts its turn and its open once, however
  // often the stream delivers it.
  const seenMessages = new Set();
  // An open a sent message still owes, at most one per session: the newest
  // message's. A failed try waits on a timer, a session archived at the time
  // waits for its restore. Neither starts another turn.
  const pendingOpens = new Map();
  // Sessions where this process wrote a hint, so a new turn can retire it
  // without reading every session's metadata at every turn start.
  const suggested = new Map();
  // A turn counter per session, moved by every turn start and every new user
  // message. A turn-end check captures it before asking Jev and writes the
  // hint only if no newer turn began in the meantime: a late answer about
  // the previous turn must not land on the next one.
  // Values come from one process-wide counter, so they never repeat: a session
  // evicted from the bounded map reads 0, which no pending check captured
  // after a turn start, and its late answer is dropped rather than accepted.
  const turnGenerations = new Map();
=======
  const seenMessages = new Set<string>();
  const pendingOpens = new Map<string, PendingOpen>();
  const suggested = new Map<string, string>();
  const turnGenerations = new Map<string, number>();
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
  let lastTurnGeneration = 0;
  const pendingDoneHints = new Map<string, ReturnType<typeof setTimeout>>();
  const cancelDoneHint = (sessionId: string) => {
    clearTimeout(pendingDoneHints.get(sessionId));
    pendingDoneHints.delete(sessionId);
  };
  const turnGeneration = (sessionId: string) => turnGenerations.get(sessionId) ?? 0;
  const advanceTurn = (sessionId: string) => {
    cancelDoneHint(sessionId);
    lastTurnGeneration += 1;
    turnGenerations.delete(sessionId);
    turnGenerations.set(sessionId, lastTurnGeneration);
    while (turnGenerations.size > SEEN_MESSAGES_LIMIT) {
      const oldest = turnGenerations.keys().next();
      if (!oldest.done) turnGenerations.delete(oldest.value);
    }
  };

<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
  const readPages = (sessionId, signal) => ({ limit, cursor }) => {
    signal?.throwIfAborted();
    const query = new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) });
    return sessionService.history(sessionId, query.toString());
  };
  const readMessageText = async (sessionId, messageId, signal) => {
    let cursor;
    for (let pageNumber = 0; pageNumber < 8; pageNumber += 1) {
      signal?.throwIfAborted();
      const page = await sessionService.history(sessionId, new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) }).toString());
      const message = page?.messages?.find((candidate) => candidate?.messageId === messageId);
      if (message) return (Array.isArray(message.parts) ? message.parts : [])
        .filter((part) => part?.type === 'text' && typeof part.content === 'string')
        .map((part) => part.content).join('\n\n');
      const next = typeof page?.nextCursor === 'string' ? page.nextCursor : null;
      if (!next || next === cursor) break;
      cursor = next;
    }
    return '';
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
  const openCodeClient = (directory) => {
    const headers = { ...getOpenCodeAuthHeaders() };
    // v2 scopes by header and rejects non-ASCII header values.
    if (directory) headers['x-opencode-directory'] = encodeURIComponent(directory);
    return OpenCode.make({ baseUrl: buildOpenCodeUrl('/', '').replace(/\/$/, ''), headers });
=======
  const openCodeClient = (directory: string) => {
    const headers = { ...getOpenCodeAuthHeaders() };
    if (directory) headers['x-opencode-directory'] = encodeURIComponent(directory);
    return OpenCode.make({ baseUrl: buildOpenCodeUrl('/', '').replace(/\/$/, ''), headers });
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
  };

<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
  const eligibleSession = async (sessionId, scope) => {
    const snapshot = await sessionService.open(sessionId);
    const session = snapshot?.session;
    if (!session || session.sessionId !== sessionId || session.rootSessionId !== sessionId) return null;
    if (isChatDirectory(scope.cwd)) return null;
    const metadata = await readMetadata(sessionId, scope.cwd);
    if (metadata?.openchamber?.kind === 'review') return null;
    if (await isSessionArchived(sessionId)) return null;
    lineage?.remember(session.sessionId, session.rootSessionId);
    return session;
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
  const readPages = (client, sessionId, signal) => ({ limit, cursor }) => client.message.list(
    { sessionID: sessionId, limit, ...(cursor ? { cursor } : { order: 'desc' }) },
    { signal },
  );

  /**
   * The session record when it is one this feature serves, archived or not: a
   * top-level project session that is not a review, a `/btw` side question or
   * a scheduled task's run. Chats are plain conversations and never in work.
   * Null otherwise.
   */
  const workSession = async (client, sessionId, signal) => {
    const session = await client.session.get({ sessionID: sessionId }, { signal });
    if (session?.id === sessionId) lineage?.remember(sessionId, session.parentID ?? null);
    return session?.id === sessionId && canBeInWork(session) ? session : null;
  };

  /** `workSession`, and only while it is not archived. */
  const eligibleSession = async (client, sessionId, signal) => {
    const session = await workSession(client, sessionId, signal);
    return session && !(await isSessionArchived(sessionId)) ? session : null;
=======
  const readPages = (client: Client, sessionId: string, signal: AbortSignal) => ({ limit, cursor }: { limit: number; cursor: string | undefined }) => client.message.list(
    { sessionID: sessionId, limit, ...(cursor ? { cursor } : { order: 'desc' }) },
    { signal },
  );

  const workSession = async (client: Client, sessionId: string, signal: AbortSignal) => {
    const session: Session = await client.session.get({ sessionID: sessionId }, { signal });
    if (session?.id === sessionId) lineage?.remember(sessionId, sessionParentId(session));
    return session?.id === sessionId && canBeInWork(session) ? session : null;
  };

  const eligibleSession = async (client: Client, sessionId: string, signal: AbortSignal) => {
    const session = await workSession(client, sessionId, signal);
    return session && !(await isSessionArchived(sessionId)) ? session : null;
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
  };

  const markSuggested = (sessionId: string, directory: string) => {
    suggested.delete(sessionId);
    suggested.set(sessionId, directory);
    while (suggested.size > SEEN_MESSAGES_LIMIT) {
      const oldest = suggested.keys().next();
      if (!oldest.done) suggested.delete(oldest.value);
    }
  };

<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
  const onUserMessage = async ({ sessionId, messageId, text = '', createdAt }) => {
    const settings = getSettings();
    if (!settings.enabled || !settings.autoOpen) return;
    if (seenMessages.has(messageId)) return;
    const scope = await resolveSessionScope(sessionId);
    if (!scope) return;
    const requestText = text.trim() || (await readMessageText(sessionId, messageId));
    if (!requestText.trim()) return;
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
  /** True the first time a message id is seen. */
  const takeMessage = (messageId) => {
    if (seenMessages.has(messageId)) return false;
=======
  const takeMessage = (messageId: string) => {
    if (seenMessages.has(messageId)) return false;
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
    seenMessages.add(messageId);
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
    while (seenMessages.size > SEEN_MESSAGES_LIMIT) seenMessages.delete(seenMessages.values().next().value);
    const endpoint = await classifierEndpoint(scope.workspaceId);
    if (!endpoint) return;
    const session = await eligibleSession(sessionId, scope);
    if (!session) return;
    if (readWork(await readMetadata(sessionId, scope.cwd))?.state === 'open') return;
    const turns = await loadSettledTurns({ readPage: readPages(sessionId), signal: undefined });
    const { answers } = await jev.ask(
      buildSendRequest({ history: turnsToHistory(turns), request: excerptHead(requestText.trim(), REQUEST_CHARS) }),
      endpoint,
    );
    if (stopped || !decideOpen(answers)) return;
    await updateMetadata(sessionId, (metadata) => openByJevPatch(metadata, { requestAt: createdAt, now: now() }), { directory: scope.cwd });
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
    while (seenMessages.size > SEEN_MESSAGES_LIMIT) seenMessages.delete(seenMessages.values().next().value);
    return true;
  };

  /**
   * One try at the open a message owes. `archived` when the session has to be
   * restored first, `settled` when nothing more is owed: it opened, was
   * already open, the user closed it after the message, it can never be in
   * work, or In work is off. Throws when a read or the write failed.
   */
  const tryOpen = async ({ sessionId, directory, createdAt }) => {
    if (stopped || !getSettings().enabled) return 'settled';
    // A session already in work costs no read of OpenCode.
    if (readWork(await readMetadata(sessionId, directory))?.state === 'open') return 'settled';
    const session = await workSession(openCodeClient(directory), sessionId, AbortSignal.timeout(READ_TIMEOUT_MS));
    if (!session) return 'settled';
    if (await isSessionArchived(sessionId)) return 'archived';
    if (stopped) return 'settled';
    await updateMetadata(sessionId, (metadata) => openPatch(metadata, { requestAt: createdAt, now: now() }), { directory });
    return 'settled';
  };

  const dropPending = (pending) => {
    clearTimeout(pending.timer);
    if (pendingOpens.get(pending.sessionId) === pending) pendingOpens.delete(pending.sessionId);
  };

  const attemptOpen = async (pending) => {
    pending.timer = null;
    pending.restored = false;
    pending.inFlight = true;
    let outcome;
    try {
      outcome = await tryOpen(pending);
    } catch (error) {
      outcome = error;
    }
    pending.inFlight = false;
    // A newer message for the session took over.
    if (pendingOpens.get(pending.sessionId) !== pending) return;
    if (outcome === 'settled') {
      dropPending(pending);
      return;
    }
    if (outcome === 'archived') {
      // The restore landed while this try still read the session as archived.
      if (pending.restored) void attemptOpen(pending);
      return;
    }
    // A session OpenCode no longer has will not come back.
    const gone = outcome?._tag === 'SessionNotFoundError';
    if (gone || pending.failures >= openRetryDelaysMs.length) {
      dropPending(pending);
      console.warn('[session-work] gave up opening a session for a sent message:', errorMessage(outcome));
      return;
    }
    const delay = openRetryDelaysMs[pending.failures];
    pending.failures += 1;
    pending.timer = setTimeout(() => void attemptOpen(pending), delay);
    pending.timer.unref?.();
  };

  // Any sent message counts: one with only files or attached context has empty
  // text. A shell command from the composer counts as one too.
  const onUserMessage = ({ sessionId, directory, createdAt }) => {
    if (!getSettings().enabled) return;
    const previous = pendingOpens.get(sessionId);
    if (previous) dropPending(previous);
    const pending = { sessionId, directory, createdAt, failures: 0, timer: null, inFlight: false, restored: false };
    pendingOpens.set(sessionId, pending);
    while (pendingOpens.size > SEEN_MESSAGES_LIMIT) dropPending(pendingOpens.values().next().value);
    void attemptOpen(pending);
  };

  const onSessionRestored = (sessionId) => {
    const pending = pendingOpens.get(sessionId);
    if (!pending || pending.timer) return;
    if (pending.inFlight) pending.restored = true;
    else void attemptOpen(pending);
=======
    while (seenMessages.size > SEEN_MESSAGES_LIMIT) {
      const oldest = seenMessages.values().next();
      if (!oldest.done) seenMessages.delete(oldest.value);
    }
    return true;
  };

  const tryOpen = async ({ sessionId, directory, createdAt }: OpenRequest) => {
    if (stopped || !getSettings().enabled) return 'settled';
    if (readWork(await readMetadata(sessionId, directory))?.state === 'open') return 'settled';
    const session = await workSession(openCodeClient(directory), sessionId, AbortSignal.timeout(READ_TIMEOUT_MS));
    if (!session) return 'settled';
    if (await isWorktreePinned(session.location?.directory ?? session.directory ?? directory)) return 'settled';
    if (await isSessionArchived(sessionId)) return 'archived';
    if (stopped) return 'settled';
    await updateMetadata(sessionId, (metadata) => openPatch(metadata, { requestAt: createdAt, now: now() }), { directory });
    return 'settled';
  };

  const dropPending = (pending: PendingOpen) => {
    clearTimeout(pending.timer ?? undefined);
    if (pendingOpens.get(pending.sessionId) === pending) pendingOpens.delete(pending.sessionId);
  };

  const attemptOpen = async (pending: PendingOpen) => {
    pending.timer = null;
    pending.restored = false;
    pending.inFlight = true;
    let outcome: unknown;
    try {
      outcome = await tryOpen(pending);
    } catch (error) {
      outcome = error;
    }
    pending.inFlight = false;
    if (pendingOpens.get(pending.sessionId) !== pending) return;
    if (outcome === 'settled') {
      dropPending(pending);
      return;
    }
    if (outcome === 'archived') {
      if (pending.restored) void attemptOpen(pending);
      return;
    }
    const gone = isSessionNotFound(outcome);
    if (gone || pending.failures >= openRetryDelaysMs.length) {
      dropPending(pending);
      console.warn('[session-work] gave up opening a session for a sent message:', outcome instanceof Error ? outcome.message : String(outcome));
      return;
    }
    const delay = openRetryDelaysMs[pending.failures];
    pending.failures += 1;
    pending.timer = setTimeout(() => void attemptOpen(pending), delay);
    pending.timer.unref?.();
  };

  const onUserMessage = ({ sessionId, directory, createdAt }: OpenRequest) => {
    if (!getSettings().enabled) return;
    const previous = pendingOpens.get(sessionId);
    if (previous) dropPending(previous);
    const pending: PendingOpen = { sessionId, directory, createdAt, failures: 0, timer: null, inFlight: false, restored: false };
    pendingOpens.set(sessionId, pending);
    while (pendingOpens.size > SEEN_MESSAGES_LIMIT) {
      const oldest = pendingOpens.values().next();
      if (!oldest.done) dropPending(oldest.value);
    }
    void attemptOpen(pending);
  };

  const onSessionRestored = (sessionId: string) => {
    const pending = pendingOpens.get(sessionId);
    if (!pending || pending.timer) return;
    if (pending.inFlight) pending.restored = true;
    else void attemptOpen(pending);
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
  };

  const retireSuggestion = (sessionId: string) => {
    if (!suggested.has(sessionId)) return;
    const directory = suggested.get(sessionId);
    suggested.delete(sessionId);
    Promise.resolve(updateMetadata(sessionId, clearSuggestionPatch, { directory }))
      .catch((error) => console.warn('[session-work] could not retire a hint:', error instanceof Error ? error.message : String(error)));
  };

<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
  const processCanonicalEvent = (event, scope) => {
    if (stopped || !event || typeof event.sessionId !== 'string' || (scope?.sessionId && scope.sessionId !== event.sessionId)) return;
    const sessionId = event.sessionId;
    if (event.type === 'session.status' && event.runtimeStatus !== 'idle') {
      advanceTurn(sessionId);
      retireSuggestion(sessionId);
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
  const processPayload = (payload, directoryHint = '') => {
    if (stopped) return;
    const busy = busySchema.safeParse(payload);
    if (busy.success) {
      advanceTurn(busy.data.properties.sessionID);
      retireSuggestion(busy.data.properties.sessionID);
=======
  const processPayload = (payload: WorkEvent, directoryHint = '') => {
    if (stopped) return;
    const busy = busySchema.safeParse(payload);
    if (busy.success) {
      advanceTurn(busy.data.properties.sessionID);
      retireSuggestion(busy.data.properties.sessionID);
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
      return;
    }
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
    if (event.type !== 'message.created' || event.role !== 'user' || typeof event.messageId !== 'string') return;
    if (lineage?.isChild(sessionId) === true) return;
    if (!seenMessages.has(event.messageId)) advanceTurn(sessionId);
    const text = (Array.isArray(event.parts) ? event.parts : [])
      .filter((part) => part?.type === 'text' && typeof part.content === 'string')
      .map((part) => part.content).join('\n\n');
    void onUserMessage({
      sessionId, messageId: event.messageId, text, createdAt: event.createdAt ?? now(),
    }).catch((error) => console.warn('[session-work] could not check a sent message:', errorMessage(error)));
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
    const unarchived = unarchivedSchema.safeParse(payload);
    if (unarchived.success) {
      onSessionRestored(unarchived.data.properties.sessionID);
      return;
    }
    const shell = shellSchema.safeParse(payload);
    if (shell.success) {
      const { sessionID } = shell.data.properties;
      if (lineage?.isChild(sessionID) === true || !takeMessage(shell.data.id)) return;
      onUserMessage({
        sessionId: sessionID,
        directory: payload.properties?.directory || directoryHint,
        createdAt: shell.data.created,
      });
      return;
    }
    const message = userMessageSchema.safeParse(payload);
    if (!message.success) return;
    const { sessionID, info } = message.data.properties;
    // A subsession is never in work: nothing to read.
    if (lineage?.isChild(sessionID) === true || !takeMessage(info.id)) return;
    advanceTurn(sessionID);
    onUserMessage({
      sessionId: sessionID,
      directory: payload.properties?.directory || directoryHint,
      createdAt: info.time?.created ?? now(),
    });
=======
    const unarchived = unarchivedSchema.safeParse(payload);
    if (unarchived.success) {
      onSessionRestored(unarchived.data.properties.sessionID);
      return;
    }
    const shell = shellSchema.safeParse(payload);
    if (shell.success) {
      const { sessionID } = shell.data.properties;
      if (lineage?.isChild(sessionID) === true || !takeMessage(shell.data.id)) return;
      onUserMessage({
        sessionId: sessionID,
        directory: payload.properties?.directory || directoryHint,
        createdAt: shell.data.created,
      });
      return;
    }
    const message = userMessageSchema.safeParse(payload);
    if (!message.success) return;
    const { sessionID, info } = message.data.properties;
    if (lineage?.isChild(sessionID) === true || !takeMessage(info.id)) return;
    advanceTurn(sessionID);
    onUserMessage({
      sessionId: sessionID,
      directory: payload.properties?.directory || directoryHint,
      createdAt: info.time?.created ?? now(),
    });
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
  };

  const writeHint = async ({ sessionId, directory, generation, patch }: HintRequest & { patch: typeof suggestDonePatch }) => {
    const { changed } = await updateMetadata(
      sessionId,
      (metadata) => (turnGeneration(sessionId) === generation ? patch(metadata, { now: now() }) : null),
      { directory },
    );
    if (changed) markSuggested(sessionId, directory);
  };

  const scheduleDoneHint = ({ sessionId, directory, generation }: HintRequest) => {
    if (turnGeneration(sessionId) !== generation) return;
    cancelDoneHint(sessionId);
    const timer = setTimeout(() => {
      pendingDoneHints.delete(sessionId);
      if (stopped) return;
      writeHint({ sessionId, directory, generation, patch: suggestDonePatch })
        .catch((error) => console.warn('[session-work] could not write a done hint:', error instanceof Error ? error.message : String(error)));
    }, doneHintDelayMs);
    timer.unref?.();
    pendingDoneHints.set(sessionId, timer);
  };

  const waitsOnBackground = async (sessionId: string, turnStartedAt: number) => {
    if (!activityProbe) return null;
    const jobs = await activityProbe.fetchRunningBackgroundJobs(sessionId);
    const waitedOn = (job: RunningSessionJob) => job.kind !== 'shell'
      || (job.startedAt >= turnStartedAt && now() - job.startedAt < BACKGROUND_SHELL_WAIT_MS);
    if (jobs?.some(waitedOn)) return true;
    const statuses = await activityProbe.fetchActiveSessionStatuses();
    const children = statuses ? await activityProbe.hasWorkingChildren(sessionId, statuses) : null;
    if (children === true) return true;
    return Array.isArray(jobs) && children === false ? false : null;
  };

  const evaluateTurnEnd = async ({ sessionId, directory, assist }: TurnEndInput) => {
    if (stopped || lineage?.isChild(sessionId) === true) return null;
    const settings = getSettings();
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
    if (!settings.enabled && !settings.reviewOffer && !assist?.recap) return null;
    // Never capture 0: an evicted session also reads 0.
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
    if (!settings.enabled && !settings.reviewOffer && !assist.recap && !assist.suggestion) return null;
    // Never capture 0: an evicted session also reads 0.
=======
    if (!settings.enabled && !settings.reviewOffer && !assist.recap && !assist.suggestion) return null;
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
    if (!turnGenerations.has(sessionId)) advanceTurn(sessionId);
    const generation = turnGeneration(sessionId);
    let background = null;
    try {
      const scope = await resolveSessionScope(sessionId);
      if (!scope) return null;
      const endpoint = await classifierEndpoint(scope.workspaceId);
      if (!endpoint) return null;
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
      const session = await eligibleSession(sessionId, scope);
      if (!session) return null;
      const work = settings.enabled ? readWork(await readMetadata(sessionId, scope.cwd)) : null;
      const ask = {
        open: settings.enabled && settings.autoOpen && work?.state !== 'open',
        wrapUp: settings.enabled && work?.state === 'open',
        reviewReady: settings.reviewOffer,
        recap: Boolean(assist?.recap),
      };
      const context = await loadAssistContext({ readPage: readPages(sessionId), signal: new AbortController().signal });
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
      const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
      const client = openCodeClient(directory);
      const session = await eligibleSession(client, sessionId, signal);
      if (!session || session.revert?.messageID) return null;
      const work = settings.enabled ? readWork(await readMetadata(sessionId, directory)) : null;
      const ask = {
        wrapUp: settings.enabled && work?.state === 'open',
        reviewReady: settings.reviewOffer,
        recap: assist.recap,
        nextStep: assist.suggestion,
      };
      const context = await loadAssistContext({ readPage: readPages(client, sessionId, signal), signal });
=======
      const signal = AbortSignal.timeout(READ_TIMEOUT_MS);
      const client = openCodeClient(directory);
      const session = await eligibleSession(client, sessionId, signal);
      if (!session || session.revert?.messageID) return null;
      const work = settings.enabled ? readWork(await readMetadata(sessionId, directory)) : null;
      const context = await loadAssistContext({ readPage: readPages(client, sessionId, signal), signal });
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
      if (!context) return null;
      const turn = context.turns.at(-1);
      const changedFiles = turn.changedFiles ? turn.changedFiles.size > 0 : null;
      const ask = {
        wrapUp: settings.enabled && work?.state === 'open',
        reviewReady: settings.reviewOffer && changedFiles !== false,
        recap: assist.recap,
        nextStep: assist.suggestion,
      };
      background = ask.wrapUp || ask.nextStep ? await waitsOnBackground(sessionId, turn.user.created ?? 0) : null;
      const request = buildTurnEndRequest({
        history: turnsToHistory(context.turns.slice(0, -1)),
        request: excerptHead(turn.user.text, REQUEST_CHARS),
        answer: excerptHeadTail(turn.assistant.text, ANSWER_EDGE_CHARS, ANSWER_EDGE_CHARS),
        ask,
      });
      if (!request) return null;
      const { answers } = await jev.ask(request, endpoint);
      if (stopped) return null;
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
      if (ask.open && decideOpen(answers)) {
        const requestAt = turn.user.created ?? now();
        await updateMetadata(sessionId, (metadata) => openByJevPatch(metadata, { requestAt, now: now() }), { directory: scope.cwd });
      }
      // Looks done wins over a review offer from the same turn.
      const suggest = ask.wrapUp && decideWrapUp(answers)
        ? suggestDonePatch
        : ask.reviewReady && decideReviewReady(answers) ? offerReviewPatch : null;
      if (suggest) {
        // Decided at write time: a turn that started while Jev was answering
        // makes this answer about an older turn.
        const { changed } = await updateMetadata(
          sessionId,
          (metadata) => (turnGeneration(sessionId) === generation ? suggest(metadata, { now: now() }) : null),
          { directory: scope.cwd },
        );
        if (changed) markSuggested(sessionId, scope.cwd);
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
      // Looks done wins over a review offer from the same turn.
      const suggest = ask.wrapUp && decideWrapUp(answers)
        ? suggestDonePatch
        : ask.reviewReady && decideReviewReady(answers) ? offerReviewPatch : null;
      if (suggest) {
        // Decided at write time: a turn that started while Jev was answering
        // makes this answer about an older turn.
        const { changed } = await updateMetadata(
          sessionId,
          (metadata) => (turnGeneration(sessionId) === generation ? suggest(metadata, { now: now() }) : null),
          { directory },
        );
        if (changed) markSuggested(sessionId, directory);
=======
      if (ask.reviewReady && decideReviewReady(answers)) {
        await writeHint({ sessionId, directory, generation, patch: offerReviewPatch });
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
      }
      if (ask.wrapUp && background !== true && decideWrapUp(answers)) scheduleDoneHint({ sessionId, directory, generation });
      if (!ask.recap && !ask.nextStep) return null;
      const gate = decideAssist(answers);
      return background === true ? { ...gate, suggestion: false } : gate;
    } catch (error) {
      console.warn('[session-work] turn-end check failed:', error instanceof Error ? error.message : String(error));
      return background === true && assist.suggestion ? { recap: true, suggestion: false } : null;
    }
  };

  const stop = () => {
    stopped = true;
    seenMessages.clear();
<<<<<<< HEAD:packages/web/server/lib/session-work/runtime.js
||||||| bc50ba56aa:packages/web/server/lib/session-work/runtime.js
    for (const pending of pendingOpens.values()) clearTimeout(pending.timer);
    pendingOpens.clear();
=======
    for (const pending of pendingOpens.values()) clearTimeout(pending.timer ?? undefined);
    pendingOpens.clear();
    for (const timer of pendingDoneHints.values()) clearTimeout(timer);
    pendingDoneHints.clear();
>>>>>>> upstream/main:packages/web/server/lib/session-work/runtime.ts
    suggested.clear();
    turnGenerations.clear();
  };

  return { processCanonicalEvent, evaluateTurnEnd, stop };
}
