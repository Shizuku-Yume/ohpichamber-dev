<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
// An agent waiting on its pull request.
//
// The agent opens a pull request (or a merge request), asks to watch it with
// the `openchamber` tool's `pr.watch`, and goes on with whatever it does,
// ending its turn when it has nothing else. From then on this runtime follows
// the pull request through the tracked-items service, whether or not any
// window is open, and wakes the session with one synthetic message
// when something the agent has to act on happens: a check failed, every check
// passed, someone commented or reviewed, it conflicts with or fell behind its
// base, it was merged or closed. A wake ends the watch; the agent watches
// again when it needs to wait once more.
//
// Delivery follows `../dispatch-results`: the message waits until the session is
// not running, and its command key is minted and saved before the first attempt,
// so a retry repeats the same command and the Host never admits it twice.

||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
// An agent waiting on its pull request.
//
// The agent opens a pull request (or a merge request), asks to watch it with
// the `openchamber` tool's `pr.watch`, and goes on with whatever it does,
// ending its turn when it has nothing else. From then on this runtime follows
// the pull request through the tracked-items service, whether or not any
// window is open, and wakes the session with one synthetic message
// when something the agent has to act on happens: a check failed, every check
// passed, someone commented or reviewed, it conflicts with or fell behind its
// base, it was merged or closed. A wake ends the watch; the agent watches
// again when it needs to wait once more.
//
// Delivery follows `../dispatch-results`: the message waits until the session
// is not running, its id is minted and saved before the first attempt, and
// OpenCode refusing a second admission of that id counts as delivered.

=======
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
import { escapeAttribute } from '../dispatch-results/runtime.js';
import { createCanonicalSessionState, retainSessions } from '../canonical-session-state.js';
import { parseTrackedItem, threadInstance, trackedItemKey } from '../tracked-items/items.js';
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
import { assertOpenCodeApiResponse } from '../opencode/prompt-response.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import { createSessionActivityProbe } from '../opencode/session-activity.js';
import { createMessageId, escapeAttribute } from '../dispatch-results/runtime.js';
import { parseTrackedItem, threadInstance, trackedItemKey } from '../tracked-items/items.js';
=======
import { assertOpenCodeApiResponse } from '../opencode/prompt-response.js';
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import { createSessionActivityProbe } from '../opencode/session-activity.js';
import { createMessageId, escapeAttribute } from '../dispatch-results/runtime.js';
import { isTrackedItemInput, parseTrackedItem, threadInstance, trackedItemKey } from '../tracked-items/items.js';
import type { createTrackedItemReaders } from '../tracked-items/readers.js';
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts

const FILE_NAME = 'pr-watch.json';
const FILE_VERSION = 1;
const INTEREST_OWNER = 'pr-watch';
const MAX_WATCHES = 200;
const QUIET_MS = 500;
const RETRY_BASE_DELAY_MS = 2_000;
const RETRY_MAX_DELAY_MS = 60_000;
const MAX_DELIVERY_FAILURES = 8;

const EVENT_TEXT = {
  merged: 'it was merged',
  closed: 'it was closed without merging',
  'checks-failed': 'a check failed',
  'checks-passed': 'every check passed',
  conflict: 'it conflicts with its base branch',
  behind: 'its branch is behind the base branch',
  activity: 'someone commented or reviewed',
};
export type PrWatchEvent = keyof typeof EVENT_TEXT;
const EVENTS: PrWatchEvent[] = ['merged', 'closed', 'checks-failed', 'checks-passed', 'conflict', 'behind', 'activity'];

const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,128}$/);
const snapshotSchema = z.object({
  state: z.enum(['open', 'closed', 'merged']),
  headSha: z.string().nullable(),
  checks: z.enum(['success', 'failure', 'pending', 'unknown']).nullable(),
  merge: z.string().nullable(),
  activity: z.number().int().nonnegative().nullable(),
  title: z.string(),
});
const watchSchema = z.object({
  sessionID: sessionIdSchema,
  directory: z.string().min(1),
  url: z.string().min(1),
  item: z.unknown(),
  startedAt: z.number().finite().nonnegative(),
  baselineAt: z.number().finite().nonnegative().catch(0),
  last: snapshotSchema.nullable(),
  wake: z.object({
    events: z.array(z.enum(EVENTS)).min(1),
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
    commandKey: z.string().nullish(),
    // Read when the wake was decided; a file from before them has none.
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
    messageID: z.string().nullable(),
    // Read when the wake was decided; a file from before them has none.
=======
    messageID: z.string().nullable(),
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
    failedChecks: z.array(z.string()).catch([]),
    authors: z.array(z.string()).catch([]),
  }).nullable(),
});
const detailsSchema = z.object({
  failedChecks: z.array(z.string()).catch([]),
  recentActivity: z.array(z.object({ author: z.string() })).catch([]),
});
const storedFileSchema = z.object({ revision: z.number().int().nonnegative().optional(), watches: z.array(z.unknown()) });
const errorCodeSchema = z.object({ code: z.string() });
const isFailureObject = (value: unknown): value is object => value !== null
  && (typeof value === 'object' || typeof value === 'function');
const hasFailureMessage = (value: unknown): value is { message: unknown } => isFailureObject(value) && 'message' in value;
const hasHttpStatus = (value: unknown): value is { status: number } => isFailureObject(value)
  && 'status' in value && Number.isInteger(value.status);
const failureMessage = (cause: unknown) => hasFailureMessage(cause) ? cause.message : undefined;
const pullStateSchema = z.object({
  state: z.enum(['open', 'closed', 'merged']),
  title: z.string().optional(),
  headSha: z.string().optional(),
  mergeableState: z.string().nullable().optional(),
  checks: z.object({ state: z.enum(['success', 'failure', 'pending', 'unknown']) }).nullable().optional(),
  activity: z.number().int().nonnegative().optional(),
});

const httpError = (message: string, status: number) => Object.assign(new Error(message), { status });

<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
const httpStatusOf = (error) => error?.statusCode ?? error?.status;
// A wake sends no model: the session keeps its own selection, or its Auto routing.
const KEEP_SESSION_MODEL = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };

const httpError = (message, status) => Object.assign(new Error(message), { status });
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
const httpError = (message, status) => Object.assign(new Error(message), { status });
=======
const retryDelay = (failures: number) => Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts

export type PrWatchSnapshot = z.infer<typeof snapshotSchema>;
type Wake = NonNullable<z.infer<typeof watchSchema>['wake']>;
type ThreadItem = Extract<NonNullable<ReturnType<typeof parseTrackedItem>>, { number: number }>;
type Watch = Omit<z.infer<typeof watchSchema>, 'item'> & { item: ThreadItem };
type WakingWatch = Watch & { wake: Wake };
type Readers = Pick<ReturnType<typeof createTrackedItemReaders>, 'sourceControl'>;
type PullSummaryReference = { number: number };
type OpenCodeRequestHeaders = { Accept: string; 'Content-Type'?: string };

export interface PrWatchEventHub {
  subscribeEvent: (listener: (event: { translated?: () => unknown[] } | null) => void) => () => void;
  subscribeStatus: (listener: (status: { type: string } | null) => void) => () => void;
}

const isPullItem = (item: ReturnType<typeof parseTrackedItem>): item is ThreadItem => item?.kind === 'pull';

export interface PrWatchInput {
  sessionID: unknown;
  directory: string | null;
  url: unknown;
}

export interface TrackedWatchState {
  key: string;
  state: unknown;
  requestedAt?: number;
}

export interface PrWatchTrackedItems {
  setServerInterest: (owner: string, items: Map<string, ThreadItem>) => void;
  subscribe: (listener: (states: TrackedWatchState[]) => void) => () => void;
}

export interface PrWatchOptions {
  buildOpenCodeUrl: (route: string, query: string) => string | URL;
  getOpenCodeAuthHeaders: () => Record<string, string>;
  broadcastUiEvent?: (event: {
    type: 'openchamber:pr-watch.updated';
    properties: { revision: number; sessionID: string; watches: PublicPrWatch[]; watch: PublicPrWatch | null };
  }) => void;
  dataDir: string;
  readCleanupOnMerge?: () => Promise<boolean>;
  isSessionArchived?: (sessionID: string) => boolean | Promise<boolean>;
  insideSpace?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  quietMs?: number;
  retryDelayMs?: (failures: number) => number;
}

export interface PublicPrWatch {
  sessionID: string;
  directory: string;
  url: string;
  number: number;
  title: string;
  status: 'waking' | 'unknown' | 'pending' | 'passed' | 'failed' | 'open';
  startedAt: number;
}

export interface PublicPrWatchSnapshot {
  revision: number;
  watches: PublicPrWatch[];
}

export interface PublicPrWait {
  waitId: string;
  sessionID: string;
  directory: string;
  source: 'pr';
  extension: string;
  title: string;
  label: PublicPrWatch['status'];
  args: { url: string };
  startedAt: number;
  status: 'waking' | 'waiting';
}

export interface PrWatchStartResult {
  watching: PublicPrWatch;
  next: string;
}

export interface PrWatchStopResult {
  watching: PublicPrWatch[];
  stopped: boolean;
}

const GITHUB_PULL = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/;
const GITLAB_MERGE_REQUEST = /^\/(.+)\/([^/]+)\/-\/merge_requests\/(\d+)(?:\/|$)/;

export const parsePullRequestUrl = (value: PrWatchInput['url']) => {
  const parsed = z.string().trim().min(1).safeParse(value);
  const address = parsed.success ? parsed.data : null;
  if (!address || !URL.canParse(address)) return null;
  const url = new URL(address);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const github = GITHUB_PULL.exec(url.pathname);
  if (github) {
    const [, owner, repo, number] = github;
    const item = parseTrackedItem({ provider: 'github', instance: host === 'github.com' ? undefined : host, kind: 'pull', owner, repo, number: Number(number) });
    return isPullItem(item) ? item : null;
  }
  const gitlab = GITLAB_MERGE_REQUEST.exec(url.pathname);
  if (gitlab) {
    const [, owner, repo, number] = gitlab;
    const item = parseTrackedItem({ provider: 'gitlab', instance: url.origin, kind: 'pull', owner, repo, number: Number(number) });
    return isPullItem(item) ? item : null;
  }
  return null;
};

const snapshotOf = (value: TrackedWatchState['state']) => {
  const parsed = pullStateSchema.safeParse(value);
  const state = parsed.success ? parsed.data : null;
  if (!state) return null;
  return {
    state: state.state,
    headSha: state.headSha ?? null,
    checks: state.checks?.state ?? null,
    merge: state.mergeableState ?? null,
    activity: state.activity ?? null,
    title: state.title ?? '',
  };
};

export const changesBetween = (previous: PrWatchSnapshot | null, next: PrWatchSnapshot | null): PrWatchEvent[] => {
  if (!next) return [];
  if (next.state === 'merged') return ['merged'];
  if (next.state === 'closed') return ['closed'];
  if (!previous) return [];
  const events: PrWatchEvent[] = [];
  const newHead = Boolean(previous.headSha && next.headSha && previous.headSha !== next.headSha);
  if (next.checks === 'failure' && (previous.checks !== 'failure' || newHead)) events.push('checks-failed');
  if (next.checks === 'success' && (previous.checks !== 'success' || newHead)) events.push('checks-passed');
  if (next.merge === 'dirty' && previous.merge !== 'dirty') events.push('conflict');
  if (next.merge === 'behind' && previous.merge !== 'behind') events.push('behind');
  if (next.activity !== null && previous.activity !== null && next.activity > previous.activity) events.push('activity');
  return events;
};

const numberOf = (watch: Watch) => z.object({ number: z.number().int().positive() }).safeParse(watch.item).data?.number ?? 0;

const MAX_NAMES = 8;

const cleanNames = (names: string[]) => Array.from(new Set(names.map((name) => name.replace(/[<>\s]+/g, ' ').trim().slice(0, 80)).filter(Boolean)));

const nameList = (names: string[]) => {
  const clean = cleanNames(names);
  if (clean.length === 0) return '';
  const shown = clean.slice(0, MAX_NAMES).join(', ');
  return clean.length > MAX_NAMES ? `${shown} and ${clean.length - MAX_NAMES} more` : shown;
};

const describeEvent = (event: PrWatchEvent, wake: Wake) => {
  const names = event === 'checks-failed' ? nameList(wake.failedChecks) : event === 'activity' ? nameList(wake.authors) : '';
  return names ? `${EVENT_TEXT[event]} (${names})` : EVENT_TEXT[event];
};

const buildWakeMessage = (watch: WakingWatch) => {
  const number = numberOf(watch);
  const changes = watch.wake.events.map((event) => describeEvent(event, watch.wake));
  const finished = watch.wake.events.some((event) => event === 'merged' || event === 'closed');
  const next = finished
    ? 'There is nothing more to wait for.'
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
    : 'You are no longer watching it. Read what changed and act on it; call pr.watch again when you need to wait for it once more.';
  return `<openchamber-pull-request url="${escapeAttribute(watch.url)}" number="${number}">\nPull request #${number}: ${changes.join('; ')}.\n${next}\n</openchamber-pull-request>`;
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
    : 'You are no longer watching it. Read what changed and act on it; call pr.watch again when you need to wait for it once more.';
  return {
    text: `<openchamber-pull-request url="${escapeAttribute(watch.url)}" number="${number}">\nPull request #${number}: ${changes.join('; ')}.\n${next}\n</openchamber-pull-request>`,
    description: `Pull request #${number}: ${changes.join(', ')}`,
    metadata: {
      source: PR_WATCH_SOURCE,
      url: watch.url,
      events: watch.wake.events,
      failedChecks: cleanNames(watch.wake.failedChecks),
      authors: cleanNames(watch.wake.authors),
    },
  };
=======
    : 'You are no longer watching it. Read what changed and act on it; call wait.start with source "pr" again when you need to wait for it once more.';
  return {
    text: `<openchamber-pull-request url="${escapeAttribute(watch.url)}" number="${number}">\nPull request #${number}: ${changes.join('; ')}.\n${next}\n</openchamber-pull-request>`,
    description: `Pull request #${number}: ${changes.join(', ')}`,
    metadata: {
      source: PR_WATCH_SOURCE,
      url: watch.url,
      events: watch.wake.events,
      failedChecks: cleanNames(watch.wake.failedChecks),
      authors: cleanNames(watch.wake.authors),
    },
  };
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
};

const statusOf = (watch: Watch): PublicPrWatch['status'] => {
  if (watch.wake) return 'waking';
  if (!watch.last) return 'unknown';
  if (watch.last.checks === 'pending') return 'pending';
  if (watch.last.checks === 'success') return 'passed';
  if (watch.last.checks === 'failure') return 'failed';
  return 'open';
};

const toPublicWatch = (watch: Watch): PublicPrWatch => ({
  sessionID: watch.sessionID,
  directory: watch.directory,
  url: watch.url,
  number: numberOf(watch),
  title: watch.last?.title ?? '',
  status: statusOf(watch),
  startedAt: watch.startedAt,
});

const PR_WAIT_SOURCE = 'pr';
const PR_WAIT = {
  source: PR_WAIT_SOURCE,
  extension: 'OpenChamber',
  title: 'Pull request',
  description: 'Wakes the session when a check fails or every check passes, someone comments or reviews, the branch conflicts or falls behind, or it is merged or closed. Each pull request is its own wait; starting one again starts it over',
  params: { url: { type: 'string', description: 'Address of a GitHub pull request or GitLab merge request', required: true } },
};

const toPublicWait = (watch: Watch): PublicPrWait => ({
  waitId: watch.url,
  sessionID: watch.sessionID,
  directory: watch.directory,
  source: PR_WAIT_SOURCE,
  extension: PR_WAIT.extension,
  title: [`#${numberOf(watch)}`, watch.last?.title].filter(Boolean).join(' '),
  label: statusOf(watch),
  args: { url: watch.url },
  startedAt: watch.startedAt,
  status: watch.wake ? 'waking' : 'waiting',
});

const keyOf = (watch: Watch) => `${watch.sessionID} ${trackedItemKey(watch.item)}`;

export function createPrWatchRuntime({
  sessionService,
  broadcastUiEvent,
  dataDir,
  readCleanupOnMerge = async () => false,
  isSessionArchived = () => false,
  insideSpace = false,
  now = Date.now,
  quietMs = QUIET_MS,
  retryDelayMs = retryDelay,
}: PrWatchOptions) {
  const filePath = path.join(dataDir, FILE_NAME);
  const watches = new Map<string, Watch>();
  let revision = 0;
  let loadPromise: Promise<void> | null = null;
  let writePromise = Promise.resolve();
  let stopped = false;
  let trackedItems: PrWatchTrackedItems | null = null;
  let readers: Readers;
  let unsubscribeTracked: (() => void) | null = null;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const delivering = new Set<string>();
  const deferred = new Set<string>();
  const failures = new Map<string, number>();
  const enriching = new Set<Watch>();

  const watchesOf = (sessionID: string) => Array.from(watches.values()).filter((watch) => watch.sessionID === sessionID);
  const hasWake = (sessionID: string) => watchesOf(sessionID).some((watch) => watch.wake);

  const readFile = async () => {
    let raw;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (errorCodeSchema.safeParse(error).data?.code === 'ENOENT') return { watches: [], revision: 0 };
      throw error;
    }
    let stored = null;
    try {
      stored = storedFileSchema.safeParse(JSON.parse(raw)).data ?? null;
    } catch {
      stored = null;
    }
    if (!stored) {
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[pr-watch] file was unreadable and moved to ${backup}`);
      return { watches: [], revision: 0 };
    }
    const restored: Watch[] = [];
    for (const value of stored.watches) {
      const watch = watchSchema.safeParse(value).data ?? null;
      const item = watch && isTrackedItemInput(watch.item) ? parseTrackedItem(watch.item) : null;
      if (watch && isPullItem(item)) restored.push({ ...watch, item });
    }
    return { watches: restored, revision: stored.revision ?? 0 };
  };

  const load = () => {
    if (!loadPromise) {
      loadPromise = readFile()
        .then((stored) => {
          for (const watch of stored.watches) if (!watches.has(keyOf(watch))) watches.set(keyOf(watch), watch);
          revision = Math.max(revision, stored.revision);
        })
        .catch((error) => {
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  };

  const persist = () => {
    const payload = JSON.stringify({ version: FILE_VERSION, revision, watches: Array.from(watches.values()) });
    const write = writePromise.then(async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
    });
    writePromise = write.catch((error) => {
      console.warn('[pr-watch] failed to persist watches:', failureMessage(error) ?? error);
    });
    return write;
  };

  const commit = (sessionID: string) => {
    revision += 1;
    const current = watchesOf(sessionID).map(toPublicWatch);
    broadcastUiEvent?.({
      type: 'openchamber:pr-watch.updated',
      properties: { revision, sessionID, watches: current, watch: current.at(-1) ?? null },
    });
    return persist();
  };

  const snapshot = (): PublicPrWatchSnapshot => ({ revision, watches: Array.from(watches.values(), toPublicWatch) });

  const syncInterest = () => {
    if (!trackedItems) return;
    const items = new Map<string, ThreadItem>();
    for (const watch of watches.values()) {
      if (!watch.wake) items.set(trackedItemKey(watch.item), watch.item);
    }
    trackedItems.setServerInterest(INTEREST_OWNER, items);
  };

<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
  // --- canonical session access -------------------------------------------

  const sessionState = createCanonicalSessionState({ sessionService });

  // --- observation ---------------------------------------------------------

  // The hub delivers a session's events only while it is observed, and a wake
  // that waited for a turn to end is delivered by that session's idle event.
  let eventHub = null;
  /** sessionID → release of the lease that keeps a watched session observed. */
  const observed = new Map();
  const observing = new Set();

  const observe = (sessionID) => {
    if (!eventHub || stopped || observed.has(sessionID) || observing.has(sessionID)) return;
    observing.add(sessionID);
    retainSessions(eventHub, `pr-watch:${sessionID}`, [sessionID])
      .then((release) => {
        if (stopped || !watches.has(sessionID)) {
          void release();
          return;
        }
        observed.set(sessionID, release);
        // Events before the lease were not delivered: check the session now.
        arm(sessionID, 0);
      })
      .catch((error) => console.warn('[pr-watch] could not observe a watched session:', error?.message ?? error))
      .finally(() => observing.delete(sessionID));
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
  // --- OpenCode ------------------------------------------------------------

  const openCodeRequest = async (fetchPath, { method = 'GET', body } = {}) => {
    const headers = { Accept: 'application/json', ...getOpenCodeAuthHeaders() };
    const init = { method, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetchImpl(buildOpenCodeUrl(fetchPath, ''), init);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw httpError(`OpenCode ${method} ${fetchPath} failed with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, response.status);
    }
    assertOpenCodeApiResponse(response, `OpenCode ${method} ${fetchPath}`);
    return unwrapOpenCodeResponse(await response.json().catch(() => null));
=======
  const openCodeRequest = async (fetchPath: string, { method = 'GET', body }: { method?: 'GET' | 'POST'; body?: ReturnType<typeof buildWakeMessage> & { id: string; delivery: 'steer'; resume: true } } = {}) => {
    const headers: OpenCodeRequestHeaders = { Accept: 'application/json', ...getOpenCodeAuthHeaders() };
    const init: RequestInit = { method, headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
    if (body) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const response = await fetchImpl(buildOpenCodeUrl(fetchPath, ''), init);
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw httpError(`OpenCode ${method} ${fetchPath} failed with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, response.status);
    }
    assertOpenCodeApiResponse(response, `OpenCode ${method} ${fetchPath}`);
    return unwrapOpenCodeResponse(await response.json().catch(() => null));
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
  };

<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
  const unobserve = (sessionID) => {
    const release = observed.get(sessionID);
    observed.delete(sessionID);
    return release?.();
  };
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
  const activityProbe = createSessionActivityProbe({ buildOpenCodeUrl, getOpenCodeAuthHeaders, timeoutMs: FETCH_TIMEOUT_MS, fetchImpl });
=======
  const activityProbe = createSessionActivityProbe({ buildOpenCodeUrl, getOpenCodeAuthHeaders, timeoutMs: FETCH_TIMEOUT_MS, fetchImpl, signal: undefined });
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts

  const clearTimer = (sessionID: string) => {
    const timer = timers.get(sessionID);
    if (timer) clearTimeout(timer);
    timers.delete(sessionID);
  };

  const arm = (sessionID: string, delayMs = quietMs) => {
    if (stopped || !hasWake(sessionID)) return;
    clearTimer(sessionID);
    const timer = setTimeout(() => {
      timers.delete(sessionID);
      deliver(sessionID).catch((error) => console.warn('[pr-watch] wake failed:', failureMessage(error) ?? error));
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(sessionID, timer);
  };

  const isCurrent = (watch: Watch) => !stopped && watches.get(keyOf(watch)) === watch;

<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
  /** Ends `watch`, and only it: a newer watch of the same session stays. */
  const drop = async (watch) => {
    if (!isCurrent(watch)) return;
    watches.delete(watch.sessionID);
    clearTimer(watch.sessionID);
    void unobserve(watch.sessionID);
    failures.delete(watch.sessionID);
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
  /** Ends `watch`, and only it: a newer watch of the same session stays. */
  const drop = async (watch) => {
    if (!isCurrent(watch)) return;
    watches.delete(watch.sessionID);
    clearTimer(watch.sessionID);
    failures.delete(watch.sessionID);
=======
  const drop = async (...ending: Watch[]) => {
    const current = ending.filter(isCurrent);
    const first = current[0];
    if (!first) return;
    const { sessionID } = first;
    for (const watch of current) {
      watches.delete(keyOf(watch));
      failures.delete(keyOf(watch));
    }
    if (!hasWake(sessionID)) clearTimer(sessionID);
    else if (!timers.has(sessionID)) arm(sessionID);
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
    syncInterest();
    await commit(sessionID);
  };

  const retry = (watch: Watch, cause: unknown) => {
    if (!isCurrent(watch)) return undefined;
    const count = (failures.get(keyOf(watch)) ?? 0) + 1;
    failures.set(keyOf(watch), count);
    if (count >= MAX_DELIVERY_FAILURES) {
      console.warn(`[pr-watch] giving up waking ${watch.sessionID}: ${cause}`);
      return drop(watch);
    }
    arm(watch.sessionID, retryDelayMs(count));
    return undefined;
  };

  async function deliver(sessionID: string) {
    if (delivering.has(sessionID)) {
      deferred.add(sessionID);
      return;
    }
    const watch = watchesOf(sessionID).find((entry): entry is WakingWatch => Boolean(entry.wake && !enriching.has(entry)));
    if (stopped || !watch) return;
    delivering.add(sessionID);
    try {
      await attemptWake(watch);
    } finally {
      delivering.delete(sessionID);
      if (deferred.delete(sessionID)) arm(sessionID);
    }
  }

  async function attemptWake(watch: WakingWatch) {
    const { sessionID } = watch;
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
    observe(sessionID);
    // Never into a running turn: the user may be talking to the agent.
    const state = await sessionState.read(sessionID);
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
    // Never into a running turn: the user may be talking to the agent.
    const statuses = await activityProbe.fetchActiveSessionStatuses();
=======
    const statuses = await activityProbe.fetchActiveSessionStatuses();
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
    if (!isCurrent(watch)) return undefined;
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
    if (state === null) return retry(watch, 'the session could not be read');
    if (state.kind === 'deleted') return drop(watch);
    if (state.kind === 'running') return undefined; // its idle event arms the next attempt
    if (state.kind === 'subagents') return arm(sessionID, subagentRecheckMs);
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
    if (!statuses) return retry(watch, 'OpenCode could not be asked');
    if (statuses[sessionID]) return undefined; // its idle event arms the next attempt
    const subagents = await activityProbe.hasWorkingChildren(sessionID, statuses);
    if (!isCurrent(watch)) return undefined;
    if (subagents === null) return retry(watch, 'OpenCode could not be asked');
    if (subagents) return arm(sessionID, subagentRecheckMs);
=======
    if (!statuses) return retry(watch, 'OpenCode could not be asked');
    if (statuses[sessionID]) return undefined;
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
    const archived = await Promise.resolve(isSessionArchived(sessionID)).catch(() => false) === true;
    if (!isCurrent(watch)) return undefined;
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
    if (archived) return drop(watch);
    if (!watch.wake.commandKey) {
      watch.wake.commandKey = randomUUID();
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
    if (archived) return drop(watch);
    if (!watch.wake.messageID) {
      watch.wake.messageID = createMessageId(now());
=======
    if (archived) return drop(...watchesOf(sessionID));
    if (!watch.wake.messageID) {
      watch.wake.messageID = createMessageId(now());
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
      await persist();
      if (!isCurrent(watch)) return undefined;
    }
    try {
      await sessionService.send(sessionID, {
        input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: buildWakeMessage(watch) }] },
        options: KEEP_SESSION_MODEL,
      }, watch.wake.commandKey);
    } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
      // 404: nobody is left to wake. Anything else retries under the same key.
      if (httpStatusOf(error) !== 404) return retry(watch, error?.message ?? String(error));
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
      // 409: an earlier attempt landed. 404: nobody is left to wake.
      if (error?.status !== 409 && error?.status !== 404) return retry(watch, error?.message ?? String(error));
=======
      const status = hasHttpStatus(error) ? error.status : undefined;
      if (status !== 409 && status !== 404) return retry(watch, failureMessage(error) ?? String(error));
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
    }
    return drop(watch);
  }

  async function addDetails(watch: Watch, newActivity: number) {
    const { item } = watch;
    const result = await readers.sourceControl({
      provider: item.provider,
      instance: threadInstance(item),
      accountId: null,
      pulls: [{ owner: item.owner, repo: item.repo, number: item.number }],
      issues: [],
      details: true,
    }).catch(() => null);
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
    const summary = result?.status === 'ok' ? (result.pulls ?? []).find((pull) => pull?.number === item.number) : null;
    const details = parse(detailsSchema, summary);
    if (!details || !isCurrent(watch) || !watch.wake || watch.wake.commandKey) return;
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
    const summary = result?.status === 'ok' ? (result.pulls ?? []).find((pull) => pull?.number === item.number) : null;
    const details = parse(detailsSchema, summary);
    if (!details || !isCurrent(watch) || !watch.wake || watch.wake.messageID) return;
=======
    const summary = result?.status === 'ok' ? (result.pulls ?? []).find((pull: PullSummaryReference | null) => pull?.number === item.number) : null;
    const details = detailsSchema.safeParse(summary).data ?? null;
    if (!details || !isCurrent(watch) || !watch.wake || watch.wake.messageID) return;
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
    if (watch.wake.events.includes('checks-failed')) watch.wake.failedChecks = details.failedChecks;
    if (watch.wake.events.includes('activity')) {
      watch.wake.authors = details.recentActivity.slice(0, Math.max(1, newActivity)).map((entry) => entry.author);
    }
    await persist().catch(() => undefined);
  }

  const onStatesChanged = (states: TrackedWatchState[]) => {
    void (async () => {
      for (const { key, state, requestedAt = 0 } of states) {
        const next = snapshotOf(state);
        if (!next) continue;
        for (const watch of Array.from(watches.values())) {
          if (watch.wake || trackedItemKey(watch.item) !== key || !isCurrent(watch)) continue;
          if (requestedAt < watch.baselineAt) continue;
          const events = changesBetween(watch.last, next);
          const newActivity = (next.activity ?? 0) - (watch.last?.activity ?? 0);
          watch.last = next;
          if (events.length === 0) {
            await commit(watch.sessionID);
            continue;
          }
          if (events.includes('merged')) {
            const cleanup = await readCleanupOnMerge().catch(() => false) === true;
            if (!isCurrent(watch)) continue;
            if (cleanup) {
              await drop(watch);
              continue;
            }
          }
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
          watch.wake = { events, commandKey: null, failedChecks: [], authors: [] };
          // Held from here on: an idle event during the write below must not
          // deliver the wake before its details are in.
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
          watch.wake = { events, messageID: null, failedChecks: [], authors: [] };
          // Held from here on: an idle event during the write below must not
          // deliver the wake before its details are in.
=======
          watch.wake = { events, messageID: null, failedChecks: [], authors: [] };
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
          const withDetails = events.includes('checks-failed') || events.includes('activity');
          if (withDetails) enriching.add(watch);
          try {
            syncInterest();
            await commit(watch.sessionID);
            if (withDetails) await addDetails(watch, newActivity);
          } finally {
            enriching.delete(watch);
          }
          arm(watch.sessionID, 0);
        }
      }
    })().catch((error) => console.warn('[pr-watch] could not apply a change:', failureMessage(error) ?? error));
  };

  const watch = async ({ sessionID: rawSessionID, directory, url }: PrWatchInput): Promise<PrWatchStartResult> => {
    if (insideSpace) throw httpError('Watching a pull request is not available inside an isolated space', 400);
    const parsedSessionID = sessionIdSchema.safeParse(rawSessionID);
    const sessionID = parsedSessionID.success ? parsedSessionID.data : null;
    if (!sessionID) throw httpError('pr.watch must be called from a session', 400);
    if (!directory) throw httpError('The session\'s directory is unknown', 400);
    const item = parsePullRequestUrl(url);
    if (!item) throw httpError('url must be the address of a GitHub pull request or a GitLab merge request', 400);
    if (!trackedItems || !readers) throw httpError('Pull request status is not available on this server yet', 503);
    await load();

    let last: PrWatchSnapshot | null = null;
    const baselineAt = now();
    try {
      const result = await readers.sourceControl({
        provider: item.provider,
        instance: threadInstance(item),
        accountId: null,
        pulls: [{ owner: item.owner, repo: item.repo, number: item.number }],
        issues: [],
      });
      if (result?.status === 'disconnected') {
        throw httpError(`OhPiChamber has no ${item.provider === 'gitlab' ? 'GitLab' : 'GitHub'} account connected for ${threadInstance(item)}, so it cannot follow this pull request`, 400);
      }
      if (result?.status === 'ok') {
        const summary = (result.pulls ?? []).find((pull: PullSummaryReference | null) => pull?.number === item.number);
        if (!summary) throw httpError('The pull request could not be read: it does not exist, or the connected account cannot see it', 404);
        last = snapshotOf(summary);
      }
    } catch (error) {
      if (hasHttpStatus(error)) throw error;
    }
    if (last?.state === 'merged' || last?.state === 'closed') {
      throw httpError(`The pull request is already ${last.state}: there is nothing to wait for`, 409);
    }

    const record: Watch = { sessionID, directory, url: String(url).trim(), item, startedAt: now(), baselineAt, last, wake: null };
    watches.delete(keyOf(record));
    failures.delete(keyOf(record));
    watches.set(keyOf(record), record);
    if (!hasWake(sessionID)) clearTimer(sessionID);
    if (watches.size > MAX_WATCHES) {
      const oldest = Array.from(watches.values()).sort((left, right) => left.startedAt - right.startedAt)[0];
      if (oldest && oldest !== record) watches.delete(keyOf(oldest));
    }
    syncInterest();
    await commit(sessionID);
    observe(sessionID);
    return {
      watching: toPublicWatch(record),
      next: 'A message arrives in this session when a check fails, every check passes, someone comments or reviews, the branch conflicts or falls behind, or the pull request is merged or closed.',
    };
  };

  const unwatch = async (rawSessionID: PrWatchInput['sessionID'], url?: PrWatchInput['url']): Promise<PrWatchStopResult> => {
    const parsedSessionID = sessionIdSchema.safeParse(rawSessionID);
    const sessionID = parsedSessionID.success ? parsedSessionID.data : null;
    if (!sessionID) throw httpError('sessionID is invalid', 400);
    const every = url === undefined;
    const item = every ? null : parsePullRequestUrl(url);
    if (!every && !item) throw httpError('url must be the address of a GitHub pull request or a GitLab merge request', 400);
    await load();
    const ending = watchesOf(sessionID).filter((watch) => every || (item !== null && trackedItemKey(watch.item) === trackedItemKey(item)));
    await drop(...ending);
    return { watching: watchesOf(sessionID).map(toPublicWatch), stopped: ending.length > 0 };
  };

<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
  /**
   * A canonical hub event. A deleted session ends its watch, and an idle one
   * delivers the wake that waited for its turn to end.
   */
  const processCanonicalEvent = (event) => {
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
  const processPayload = (payload) => {
=======
  const waitSource = () => (insideSpace ? null : { ...PR_WAIT, params: { ...PR_WAIT.params } });
  const listWaits = async (sessionID: string) => {
    await load();
    return watchesOf(sessionID).map(toPublicWait);
  };

  const processPayload = (payload: TrackedWatchState['state']) => {
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
    if (stopped) return;
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
    if (event.type === 'session.deleted') {
      for (const deletedID of event.deletedSessionIds) {
        const current = watches.get(deletedID);
        if (current) void drop(current).catch(() => undefined);
      }
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
    const deleted = parse(deletedEventSchema, payload);
    if (deleted) {
      const current = watches.get(deleted.properties.sessionID);
      if (current) void drop(current).catch(() => undefined);
=======
    const deleted = deletedEventSchema.safeParse(payload).data ?? null;
    if (deleted) {
      void drop(...watchesOf(deleted.properties.sessionID)).catch(() => undefined);
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
      return;
    }
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
    const isIdle = (event.type === 'session.status' && event.runtimeStatus === 'idle')
      || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled';
    if (!isIdle) return;
    if (watches.get(event.sessionId)?.wake) arm(event.sessionId);
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
    const status = parse(statusEventSchema, payload);
    if (!status || status.properties.status.type !== 'idle') return;
    if (watches.get(status.properties.sessionID)?.wake) arm(status.properties.sessionID);
=======
    const status = statusEventSchema.safeParse(payload).data ?? null;
    if (!status || status.properties.status.type !== 'idle') return;
    if (hasWake(status.properties.sessionID)) arm(status.properties.sessionID);
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
  };

  const attach = ({ trackedItems: service, readers: itemReaders }: { trackedItems: PrWatchTrackedItems; readers: Readers }) => {
    trackedItems = service;
    readers = itemReaders;
    unsubscribeTracked?.();
    unsubscribeTracked = service.subscribe(onStatesChanged);
    void load().then(syncInterest).catch(() => undefined);
  };

<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
  let unsubscribeEvent = null;
  let unsubscribeStatus = null;

  const start = (globalEventHub) => {
    eventHub = globalEventHub ?? null;
    unsubscribeEvent?.();
    unsubscribeStatus?.();
    unsubscribeEvent = globalEventHub?.subscribeEvent(processCanonicalEvent);
    unsubscribeStatus = globalEventHub?.subscribeStatus((hubStatus) => {
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
  const start = (globalEventHub) => {
    const unsubscribeEvent = globalEventHub?.subscribeEvent((event) => {
      for (const payload of event?.translated?.() ?? []) processPayload(payload);
    });
    const unsubscribeStatus = globalEventHub?.subscribeStatus((hubStatus) => {
=======
  const start = (globalEventHub?: PrWatchEventHub | null) => {
    const unsubscribeEvent = globalEventHub?.subscribeEvent((event) => {
      for (const payload of event?.translated?.() ?? []) processPayload(payload);
    });
    const unsubscribeStatus = globalEventHub?.subscribeStatus((hubStatus) => {
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
      if (hubStatus?.type !== 'connect') return;
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
      for (const [sessionID, entry] of watches) {
        observe(sessionID);
        if (entry.wake) arm(sessionID);
      }
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
      for (const [sessionID, entry] of watches) if (entry.wake) arm(sessionID);
=======
      for (const entry of watches.values()) if (entry.wake) arm(entry.sessionID);
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
    });
    void load()
      .then(() => {
        syncInterest();
<<<<<<< HEAD:packages/web/server/lib/pr-watch/runtime.js
        for (const [sessionID, entry] of watches) {
          observe(sessionID);
          if (entry.wake) arm(sessionID);
        }
||||||| bc50ba56aa:packages/web/server/lib/pr-watch/runtime.js
        for (const [sessionID, entry] of watches) if (entry.wake) arm(sessionID);
=======
        for (const entry of watches.values()) if (entry.wake) arm(entry.sessionID);
>>>>>>> upstream/main:packages/web/server/lib/pr-watch/runtime.ts
      })
      .catch((error) => console.warn('[pr-watch] failed to load watches:', failureMessage(error) ?? error));
    return () => {
      unsubscribeEvent?.();
      unsubscribeStatus?.();
      unsubscribeEvent = null;
      unsubscribeStatus = null;
    };
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    unsubscribeTracked?.();
    unsubscribeTracked = null;
    unsubscribeEvent?.();
    unsubscribeStatus?.();
    unsubscribeEvent = null;
    unsubscribeStatus = null;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    for (const release of observed.values()) {
      try {
        void release?.();
      } catch {
        // Ignored on teardown
      }
    }
    observed.clear();
  };

  return {
    load,
    snapshot,
    watch,
    unwatch,
    waitSource,
    listWaits,
    attach,
    processCanonicalEvent,
    start,
    stop,
    flush: () => writePromise,
  };
}

type PrWatchRuntime = ReturnType<typeof createPrWatchRuntime>;
type PrWatchRouteBody = PublicPrWatchSnapshot | PrWatchStopResult | { error: unknown };

export interface PrWatchRouteResponse {
  status: (status: number) => PrWatchRouteResponse;
  json: (body: PrWatchRouteBody) => void;
}

export interface PrWatchRouteApp {
  get: (route: string, handler: (req: { params: { sessionID?: string }; query: { url?: unknown } }, res: PrWatchRouteResponse) => Promise<void>) => void;
  delete: PrWatchRouteApp['get'];
}

export function registerPrWatchRoutes(app: PrWatchRouteApp, runtime: PrWatchRuntime) {
  const respondError = (res: PrWatchRouteResponse, cause: unknown, fallback: string) => {
    res.status(hasHttpStatus(cause) ? cause.status : 500).json({ error: failureMessage(cause) ?? fallback });
  };

  app.get('/api/pr-watch', async (_req, res) => {
    try {
      await runtime.load();
      res.json(runtime.snapshot());
    } catch (error) {
      respondError(res, error, 'Failed to load pull request watches');
    }
  });

  app.delete('/api/pr-watch/sessions/:sessionID', async (req, res) => {
    try {
      res.json(await runtime.unwatch(req.params.sessionID, req.query.url));
    } catch (error) {
      respondError(res, error, 'Failed to stop watching the pull request');
    }
  });
}
