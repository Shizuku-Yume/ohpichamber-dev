import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { CanonicalEvent, PromptRequest, Run, SessionRuntimeStatus } from '@openchamber/agent-contract';
import { escapeAttribute } from '../dispatch-results/runtime.js';
import { createCanonicalSessionState, retainSessions } from '../canonical-session-state.js';
import { isTrackedItemInput, parseTrackedItem, threadInstance, trackedItemKey } from '../tracked-items/items.js';
import type { ServerTrackedItemState, TrackedItem, TrackedItemReaders, TrackedThread } from '../tracked-items/contracts.js';
import { controlErrorFields } from '../openchamber-control/error.js';
import { isString } from '../shared/guards.js';
import type { Application, Response } from '../shared/http-contracts.js';
import type { JsonValue } from '../shared/json-values.js';

const FILE_NAME = 'pr-watch.json';
const FILE_VERSION = 1;
const INTEREST_OWNER = 'pr-watch';
const MAX_WATCHES = 200;
const QUIET_MS = 500;
const SUBAGENT_RECHECK_MS = 5_000;
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
} as const;

export type PrWatchEvent = keyof typeof EVENT_TEXT;
const EVENTS = ['merged', 'closed', 'checks-failed', 'checks-passed', 'conflict', 'behind', 'activity'] as const satisfies readonly PrWatchEvent[];

const sessionIdSchema = z.string().regex(/^[A-Za-z0-9_-]{4,128}$/);
const snapshotSchema = z.object({
  state: z.enum(['open', 'closed', 'merged']),
  headSha: z.string().nullable(),
  checks: z.enum(['success', 'failure', 'pending', 'unknown']).nullable(),
  merge: z.string().nullable(),
  activity: z.number().int().nonnegative().nullable(),
  title: z.string(),
});
const wakeSchema = z.object({
  events: z.array(z.enum(EVENTS)).min(1),
  commandKey: z.string().nullish(),
  failedChecks: z.array(z.string()).catch([]),
  authors: z.array(z.string()).catch([]),
});
const watchSchema = z.object({
  sessionID: sessionIdSchema,
  directory: z.string().min(1),
  url: z.string().min(1),
  item: z.unknown(),
  startedAt: z.number().finite().nonnegative(),
  baselineAt: z.number().finite().nonnegative().catch(0),
  last: snapshotSchema.nullable(),
  wake: wakeSchema.nullable(),
});
const detailsSchema = z.object({
  failedChecks: z.array(z.string()).catch([]),
  recentActivity: z.array(z.object({ author: z.string() })).catch([]),
});
const storedFileSchema = z.object({ revision: z.number().int().nonnegative().optional(), watches: z.array(z.unknown()) });
const errorCodeSchema = z.object({ code: z.string() });
const pullStateSchema = z.object({
  state: z.enum(['open', 'closed', 'merged']),
  title: z.string().optional(),
  headSha: z.string().optional(),
  mergeableState: z.string().nullable().optional(),
  checks: z.object({ state: z.enum(['success', 'failure', 'pending', 'unknown']) }).nullable().optional(),
  activity: z.number().int().nonnegative().optional(),
});

export type PrWatchPullSnapshot = z.output<typeof snapshotSchema>;
type PrWatchWake = z.output<typeof wakeSchema>;
type PrWatchRecord = Omit<z.output<typeof watchSchema>, 'item'> & { item: TrackedThread };

export type PrWatchStatus = 'unknown' | 'pending' | 'passed' | 'failed' | 'open' | 'waking';

export interface PublicPrWatch {
  sessionID: string;
  directory: string;
  url: string;
  number: number;
  title: string;
  status: PrWatchStatus;
  startedAt: number;
}

export interface PrWatchSnapshot {
  revision: number;
  watches: PublicPrWatch[];
}

export interface PrWatchUpdatedEvent {
  type: 'openchamber:pr-watch.updated';
  properties: {
    revision: number;
    sessionID: string;
    watch: PublicPrWatch | null;
  };
}

export interface PrWatchEventHub {
  subscribeEvent: (listener: (event: CanonicalEvent) => void) => () => void;
  subscribeStatus: (listener: (status: { type: string; sessionId?: string }) => void) => () => void;
  retainSession: (sessionId: string, leaseKey: string) => Promise<{ release: () => Promise<void> | void }>;
}

export interface PrWatchSessionService {
  open: (sessionId: string) => Promise<{
    session?: { sessionId: string; runtimeStatus: SessionRuntimeStatus | string; workspaceId: string } | null;
  }>;
  list: (workspaceId?: string) => Promise<{
    items: Array<{ sessionId: string; parentSessionId?: string | null | undefined; runtimeStatus: SessionRuntimeStatus | string }>;
  }>;
  send: (sessionId: string, request: PromptRequest, commandKey?: string) => Promise<{ run: Run } | { ok: boolean } | void>;
}

export interface PrWatchTrackedItemsService {
  setServerInterest: (owner: string, items: Map<string, TrackedItem>) => void;
  subscribe: (listener: (states: ServerTrackedItemState[]) => void) => () => void;
}

export interface PrWatchAttachInput {
  trackedItems: PrWatchTrackedItemsService;
  readers: Pick<TrackedItemReaders, 'sourceControl'>;
}

export interface StartPrWatchInput {
  sessionID: string | null | undefined;
  directory: string | null | undefined;
  url: JsonValue | undefined;
}

export interface PrWatchStartResult {
  watching: PublicPrWatch;
  next: string;
}

export interface PrWatchStopResult {
  watching: false;
  stopped: boolean;
}

export interface PrWatchDependencies {
  sessionService: PrWatchSessionService;
  broadcastUiEvent?: ((event: PrWatchUpdatedEvent) => void) | null;
  dataDir: string;
  readCleanupOnMerge?: () => Promise<boolean>;
  isSessionArchived?: (sessionID: string) => boolean | Promise<boolean>;
  insideSpace?: boolean;
  now?: () => number;
  quietMs?: number;
  retryDelayMs?: (failures: number) => number;
  subagentRecheckMs?: number;
}

export interface PrWatchRoutesRuntime {
  load: () => Promise<void>;
  snapshot: () => PrWatchSnapshot;
  unwatch: (rawSessionID: string | null | undefined) => Promise<PrWatchStopResult>;
}

export interface PrWatchRuntime extends PrWatchRoutesRuntime {
  watch: (input: StartPrWatchInput) => Promise<PrWatchStartResult>;
  attach: (input: PrWatchAttachInput) => void;
  processCanonicalEvent: (event: CanonicalEvent) => void;
  start: (globalEventHub?: PrWatchEventHub | null) => () => void;
  stop: () => void;
  flush: () => Promise<void>;
}

const parse = <S extends z.ZodType>(schema: S, value: Parameters<S['safeParse']>[0]): z.output<S> | null => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const isInteger = (value: unknown): value is number => Number.isInteger(value);

const errorMessageOf = (cause: Parameters<typeof controlErrorFields>[0]): string | undefined => {
  const message = controlErrorFields(cause)?.message;
  return isString(message) ? message : undefined;
};

const httpStatusOf = (cause: Parameters<typeof controlErrorFields>[0]): number | null => {
  const fields = controlErrorFields(cause);
  const raw = fields?.statusCode ?? fields?.status;
  return isInteger(raw) ? raw : null;
};

const KEEP_SESSION_MODEL: PromptRequest['options'] = { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null };

const httpError = (message: string, status: number): Error & { status: number } =>
  Object.assign(new Error(message), { status });

const retryDelay = (failures: number): number =>
  Math.min(RETRY_BASE_DELAY_MS * 2 ** Math.max(failures - 1, 0), RETRY_MAX_DELAY_MS);

const GITHUB_PULL = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/;
const GITLAB_MERGE_REQUEST = /^\/(.+)\/([^/]+)\/-\/merge_requests\/(\d+)(?:\/|$)/;

export const parsePullRequestUrl = (value: JsonValue | undefined): TrackedThread | null => {
  const address = parse(z.string().trim().min(1), value);
  if (!address || !URL.canParse(address)) return null;
  const url = new URL(address);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const github = GITHUB_PULL.exec(url.pathname);
  if (github) {
    const [, owner, repo, number] = github;
    return parseTrackedItem({ provider: 'github', instance: host === 'github.com' ? undefined : host, kind: 'pull', owner, repo, number: Number(number) });
  }
  const gitlab = GITLAB_MERGE_REQUEST.exec(url.pathname);
  if (gitlab) {
    const [, owner, repo, number] = gitlab;
    return parseTrackedItem({ provider: 'gitlab', instance: url.origin, kind: 'pull', owner, repo, number: Number(number) });
  }
  return null;
};

const snapshotOf = (value: Parameters<typeof pullStateSchema.safeParse>[0]): PrWatchPullSnapshot | null => {
  const state = parse(pullStateSchema, value);
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

export const changesBetween = (previous: PrWatchPullSnapshot | null | undefined, next: PrWatchPullSnapshot | null | undefined): PrWatchEvent[] => {
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

const MAX_NAMES = 8;

const cleanNames = (names: string[]): string[] =>
  Array.from(new Set(names.map((name) => name.replace(/[<>\s]+/g, ' ').trim().slice(0, 80)).filter(Boolean)));

const nameList = (names: string[]): string => {
  const clean = cleanNames(names);
  if (clean.length === 0) return '';
  const shown = clean.slice(0, MAX_NAMES).join(', ');
  return clean.length > MAX_NAMES ? `${shown} and ${clean.length - MAX_NAMES} more` : shown;
};

const describeEvent = (event: PrWatchEvent, wake: PrWatchWake): string => {
  const names = event === 'checks-failed' ? nameList(wake.failedChecks) : event === 'activity' ? nameList(wake.authors) : '';
  return names ? `${EVENT_TEXT[event]} (${names})` : EVENT_TEXT[event];
};

const buildWakeMessage = (watch: PrWatchRecord, wake: PrWatchWake): string => {
  const number = watch.item.number;
  const changes = wake.events.map((event) => describeEvent(event, wake));
  const finished = wake.events.some((event) => event === 'merged' || event === 'closed');
  const next = finished
    ? 'There is nothing more to wait for.'
    : 'You are no longer watching it. Read what changed and act on it; call pr.watch again when you need to wait for it once more.';
  return `<openchamber-pull-request url="${escapeAttribute(watch.url)}" number="${number}">\nPull request #${number}: ${changes.join('; ')}.\n${next}\n</openchamber-pull-request>`;
};

const statusOf = (watch: PrWatchRecord): PrWatchStatus => {
  if (watch.wake) return 'waking';
  if (!watch.last) return 'unknown';
  if (watch.last.checks === 'pending') return 'pending';
  if (watch.last.checks === 'success') return 'passed';
  if (watch.last.checks === 'failure') return 'failed';
  return 'open';
};

const toPublicWatch = (watch: PrWatchRecord): PublicPrWatch => ({
  sessionID: watch.sessionID,
  directory: watch.directory,
  url: watch.url,
  number: watch.item.number,
  title: watch.last?.title ?? '',
  status: statusOf(watch),
  startedAt: watch.startedAt,
});

export function createPrWatchRuntime({
  sessionService,
  broadcastUiEvent = null,
  dataDir,
  readCleanupOnMerge = async () => false,
  isSessionArchived = () => false,
  insideSpace = false,
  now = Date.now,
  quietMs = QUIET_MS,
  retryDelayMs = retryDelay,
  subagentRecheckMs = SUBAGENT_RECHECK_MS,
}: PrWatchDependencies): PrWatchRuntime {
  const filePath = path.join(dataDir, FILE_NAME);
  const watches = new Map<string, PrWatchRecord>();
  let revision = 0;
  let loadPromise: Promise<void> | null = null;
  let writePromise: Promise<void> = Promise.resolve();
  let stopped = false;
  let trackedItems: PrWatchTrackedItemsService | null = null;
  let readers: Pick<TrackedItemReaders, 'sourceControl'> | null = null;
  let unsubscribeTracked: (() => void) | null = null;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const failures = new Map<string, number>();
  const delivering = new Set<string>();
  const deferred = new Set<string>();
  const enriching = new Map<string, PrWatchRecord>();

  const readFile = async (): Promise<{ watches: PrWatchRecord[]; revision: number }> => {
    let raw: string;
    try {
      raw = await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      if (parse(errorCodeSchema, error)?.code === 'ENOENT') return { watches: [], revision: 0 };
      throw error;
    }
    let stored: z.output<typeof storedFileSchema> | null = null;
    try {
      stored = parse(storedFileSchema, JSON.parse(raw));
    } catch {
      stored = null;
    }
    if (!stored) {
      const backup = `${filePath}.corrupt-${now()}`;
      await fs.promises.rename(filePath, backup).catch(() => undefined);
      console.warn(`[pr-watch] file was unreadable and moved to ${backup}`);
      return { watches: [], revision: 0 };
    }
    const restored: PrWatchRecord[] = [];
    for (const value of stored.watches) {
      const parsed = parse(watchSchema, value);
      const item = parsed && isTrackedItemInput(parsed.item) ? parseTrackedItem(parsed.item) : null;
      if (parsed && item && item.kind === 'pull') restored.push({ ...parsed, item });
    }
    return { watches: restored, revision: stored.revision ?? 0 };
  };

  const load = (): Promise<void> => {
    if (!loadPromise) {
      loadPromise = readFile()
        .then((stored) => {
          for (const watch of stored.watches) if (!watches.has(watch.sessionID)) watches.set(watch.sessionID, watch);
          revision = Math.max(revision, stored.revision);
        })
        .catch((error) => {
          loadPromise = null;
          throw error;
        });
    }
    return loadPromise;
  };

  const persist = (): Promise<void> => {
    const payload = JSON.stringify({ version: FILE_VERSION, revision, watches: Array.from(watches.values()) });
    const write = writePromise.then(async () => {
      await fs.promises.mkdir(dataDir, { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmpPath, payload, { encoding: 'utf8', mode: 0o600 });
      await fs.promises.rename(tmpPath, filePath);
    });
    writePromise = write.catch((error) => {
      console.warn('[pr-watch] failed to persist watches:', errorMessageOf(error) ?? error);
    });
    return write;
  };

  const commit = (sessionID: string): Promise<void> => {
    revision += 1;
    const watch = watches.get(sessionID) ?? null;
    broadcastUiEvent?.({
      type: 'openchamber:pr-watch.updated',
      properties: { revision, sessionID, watch: watch ? toPublicWatch(watch) : null },
    });
    return persist();
  };

  const snapshot = (): PrWatchSnapshot => ({ revision, watches: Array.from(watches.values(), toPublicWatch) });

  const syncInterest = (): void => {
    if (!trackedItems) return;
    const items = new Map<string, TrackedItem>();
    for (const watch of watches.values()) {
      if (!watch.wake) items.set(trackedItemKey(watch.item), watch.item);
    }
    trackedItems.setServerInterest(INTEREST_OWNER, items);
  };

  const sessionState = createCanonicalSessionState({ sessionService });

  let eventHub: PrWatchEventHub | null = null;
  const observed = new Map<string, () => Promise<void>>();
  const observing = new Set<string>();

  const observe = (sessionID: string): void => {
    if (!eventHub || stopped || observed.has(sessionID) || observing.has(sessionID)) return;
    observing.add(sessionID);
    retainSessions(eventHub, `pr-watch:${sessionID}`, [sessionID])
      .then((release) => {
        if (stopped || !watches.has(sessionID)) {
          void release();
          return;
        }
        observed.set(sessionID, release);
        arm(sessionID, 0);
      })
      .catch((error) => console.warn('[pr-watch] could not observe a watched session:', errorMessageOf(error) ?? error))
      .finally(() => observing.delete(sessionID));
  };

  const unobserve = (sessionID: string): Promise<void> | undefined => {
    const release = observed.get(sessionID);
    observed.delete(sessionID);
    return release?.();
  };

  const clearTimer = (sessionID: string): void => {
    clearTimeout(timers.get(sessionID));
    timers.delete(sessionID);
  };

  const arm = (sessionID: string, delayMs = quietMs): void => {
    if (stopped || !watches.get(sessionID)?.wake) return;
    clearTimer(sessionID);
    const timer = setTimeout(() => {
      timers.delete(sessionID);
      deliver(sessionID).catch((error) => console.warn('[pr-watch] wake failed:', errorMessageOf(error) ?? error));
    }, Math.max(0, delayMs));
    timer.unref?.();
    timers.set(sessionID, timer);
  };

  const isCurrent = (watch: PrWatchRecord): boolean => !stopped && watches.get(watch.sessionID) === watch;

  const drop = async (watch: PrWatchRecord): Promise<void> => {
    if (!isCurrent(watch)) return;
    watches.delete(watch.sessionID);
    clearTimer(watch.sessionID);
    void unobserve(watch.sessionID);
    failures.delete(watch.sessionID);
    syncInterest();
    await commit(watch.sessionID);
  };

  const retry = (watch: PrWatchRecord, reason: string): Promise<void> | undefined => {
    if (!isCurrent(watch)) return undefined;
    const count = (failures.get(watch.sessionID) ?? 0) + 1;
    failures.set(watch.sessionID, count);
    if (count >= MAX_DELIVERY_FAILURES) {
      console.warn(`[pr-watch] giving up waking ${watch.sessionID}: ${reason}`);
      return drop(watch);
    }
    arm(watch.sessionID, retryDelayMs(count));
    return undefined;
  };

  async function deliver(sessionID: string): Promise<void> {
    if (delivering.has(sessionID)) {
      deferred.add(sessionID);
      return;
    }
    const watch = watches.get(sessionID);
    if (stopped || !watch?.wake || enriching.get(sessionID) === watch) return;
    delivering.add(sessionID);
    try {
      await attemptWake(watch);
    } finally {
      delivering.delete(sessionID);
      if (deferred.delete(sessionID)) arm(sessionID, 0);
    }
  }

  async function attemptWake(watch: PrWatchRecord): Promise<void> {
    const { sessionID } = watch;
    const wake = watch.wake;
    if (!wake) return;
    observe(sessionID);
    const state = await sessionState.read(sessionID);
    if (!isCurrent(watch)) return;
    if (state === null) return retry(watch, 'the session could not be read');
    if (state.kind === 'deleted') return drop(watch);
    if (state.kind === 'running') return;
    if (state.kind === 'subagents') return arm(sessionID, subagentRecheckMs);
    const archived = await Promise.resolve(isSessionArchived(sessionID)).catch(() => false) === true;
    if (!isCurrent(watch)) return;
    if (archived) return drop(watch);
    if (!wake.commandKey) {
      wake.commandKey = randomUUID();
      await persist();
      if (!isCurrent(watch)) return;
    }
    try {
      await sessionService.send(sessionID, {
        input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: buildWakeMessage(watch, wake) }] },
        options: KEEP_SESSION_MODEL,
      }, wake.commandKey);
    } catch (error) {
      if (httpStatusOf(error) !== 404) return retry(watch, errorMessageOf(error) ?? String(error));
    }
    return drop(watch);
  }

  async function addDetails(watch: PrWatchRecord, newActivity: number): Promise<void> {
    if (!readers) return;
    const { item } = watch;
    const result = await readers.sourceControl({
      provider: item.provider,
      instance: threadInstance(item),
      accountId: null,
      pulls: [{ owner: item.owner, repo: item.repo, number: item.number }],
      issues: [],
      details: true,
    }).catch(() => null);
    const summary = result?.status === 'ok' ? (result.pulls ?? []).find((pull) => pull?.number === item.number) : null;
    const details = parse(detailsSchema, summary);
    if (!details || !isCurrent(watch) || !watch.wake || watch.wake.commandKey) return;
    if (watch.wake.events.includes('checks-failed')) watch.wake.failedChecks = details.failedChecks;
    if (watch.wake.events.includes('activity')) {
      watch.wake.authors = details.recentActivity.slice(0, Math.max(1, newActivity)).map((entry) => entry.author);
    }
    await persist().catch(() => undefined);
  }

  const onStatesChanged = (states: ServerTrackedItemState[]): void => {
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
          watch.wake = { events, commandKey: null, failedChecks: [], authors: [] };
          const withDetails = events.includes('checks-failed') || events.includes('activity');
          if (withDetails) enriching.set(watch.sessionID, watch);
          try {
            syncInterest();
            await commit(watch.sessionID);
            if (withDetails) await addDetails(watch, newActivity);
          } finally {
            if (enriching.get(watch.sessionID) === watch) enriching.delete(watch.sessionID);
          }
          arm(watch.sessionID, 0);
        }
      }
    })().catch((error) => console.warn('[pr-watch] could not apply a change:', errorMessageOf(error) ?? error));
  };

  const watch = async ({ sessionID: rawSessionID, directory, url }: StartPrWatchInput): Promise<PrWatchStartResult> => {
    if (insideSpace) throw httpError('Watching a pull request is not available inside an isolated space', 400);
    const sessionID = parse(sessionIdSchema, rawSessionID);
    if (!sessionID) throw httpError('pr.watch must be called from a session', 400);
    if (!directory) throw httpError('The session\'s directory is unknown', 400);
    const item = parsePullRequestUrl(url);
    if (!item) throw httpError('url must be the address of a GitHub pull request or a GitLab merge request', 400);
    if (!trackedItems || !readers) throw httpError('Pull request status is not available on this server yet', 503);
    await load();

    let last: PrWatchPullSnapshot | null = null;
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
        const summary = (result.pulls ?? []).find((pull) => pull?.number === item.number);
        if (!summary) throw httpError('The pull request could not be read: it does not exist, or the connected account cannot see it', 404);
        last = snapshotOf(summary);
      }
    } catch (error) {
      if (httpStatusOf(error) !== null) throw error;
    }
    if (last?.state === 'merged' || last?.state === 'closed') {
      throw httpError(`The pull request is already ${last.state}: there is nothing to wait for`, 409);
    }

    const cleanUrl = parse(z.string().trim().min(1), url) ?? '';
    const record: PrWatchRecord = { sessionID, directory, url: cleanUrl, item, startedAt: now(), baselineAt, last, wake: null };
    watches.delete(sessionID);
    clearTimer(sessionID);
    failures.delete(sessionID);
    watches.set(sessionID, record);
    if (watches.size > MAX_WATCHES) {
      const oldest = Array.from(watches.values()).sort((left, right) => left.startedAt - right.startedAt)[0];
      if (oldest && oldest !== record) watches.delete(oldest.sessionID);
    }
    syncInterest();
    await commit(sessionID);
    observe(sessionID);
    return {
      watching: toPublicWatch(record),
      next: 'A message arrives in this session when a check fails, every check passes, someone comments or reviews, the branch conflicts or falls behind, or the pull request is merged or closed.',
    };
  };

  const unwatch = async (rawSessionID: string | null | undefined): Promise<PrWatchStopResult> => {
    const sessionID = parse(sessionIdSchema, rawSessionID);
    if (!sessionID) throw httpError('sessionID is invalid', 400);
    await load();
    const current = watches.get(sessionID);
    if (current) await drop(current);
    return { watching: false, stopped: Boolean(current) };
  };

  const processCanonicalEvent = (event: CanonicalEvent): void => {
    if (stopped) return;
    if (event.type === 'session.deleted') {
      for (const deletedID of event.deletedSessionIds) {
        const current = watches.get(deletedID);
        if (current) void drop(current).catch(() => undefined);
      }
      return;
    }
    const isIdle = (event.type === 'session.status' && event.runtimeStatus === 'idle')
      || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled';
    if (!isIdle) return;
    if (watches.get(event.sessionId)?.wake) arm(event.sessionId);
  };

  const attach = ({ trackedItems: service, readers: itemReaders }: PrWatchAttachInput): void => {
    trackedItems = service;
    readers = itemReaders;
    unsubscribeTracked?.();
    unsubscribeTracked = service.subscribe(onStatesChanged);
    void load().then(syncInterest).catch(() => undefined);
  };

  let unsubscribeEvent: (() => void) | null | undefined = null;
  let unsubscribeStatus: (() => void) | null | undefined = null;

  const start = (globalEventHub: PrWatchEventHub | null = null): (() => void) => {
    eventHub = globalEventHub ?? null;
    unsubscribeEvent?.();
    unsubscribeStatus?.();
    unsubscribeEvent = globalEventHub?.subscribeEvent(processCanonicalEvent);
    unsubscribeStatus = globalEventHub?.subscribeStatus((hubStatus) => {
      if (hubStatus?.type !== 'connect') return;
      for (const [sessionID, entry] of watches) {
        observe(sessionID);
        if (entry.wake) arm(sessionID);
      }
    });
    void load()
      .then(() => {
        syncInterest();
        for (const [sessionID, entry] of watches) {
          observe(sessionID);
          if (entry.wake) arm(sessionID);
        }
      })
      .catch((error) => console.warn('[pr-watch] failed to load watches:', errorMessageOf(error) ?? error));
    return () => {
      unsubscribeEvent?.();
      unsubscribeStatus?.();
      unsubscribeEvent = null;
      unsubscribeStatus = null;
    };
  };

  const stop = (): void => {
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
        void 0;
      }
    }
    observed.clear();
  };

  return {
    load,
    snapshot,
    watch,
    unwatch,
    attach,
    processCanonicalEvent,
    start,
    stop,
    flush: () => writePromise,
  };
}

export function registerPrWatchRoutes(app: Application, runtime: PrWatchRoutesRuntime): void {
  const respondError = (res: Response, cause: Parameters<typeof controlErrorFields>[0], fallback: string): void => {
    const status = httpStatusOf(cause);
    res.status(status !== null ? status : 500).json({ error: errorMessageOf(cause) ?? fallback });
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
      res.json(await runtime.unwatch(req.params.sessionID ?? ''));
    } catch (error) {
      respondError(res, error, 'Failed to stop watching the pull request');
    }
  });
}
