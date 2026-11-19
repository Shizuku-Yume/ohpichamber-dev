import { useCallback } from 'react';
import { create } from 'zustand';
import type { CanonicalEvent } from '@openchamber/agent-contract';
import { getSafeStorage } from '@/stores/utils/safeStorage';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { countSyncPerformance } from './performance-diagnostics';

<<<<<<< HEAD
||||||| bc50ba56aa
// Per-session turn timing behind the sidebar activity readout.
//
// The OpenCode status contract carries no timestamps — `SessionStatus` is a
// bare `busy | retry | idle` union. The OpenChamber host keeps when each turn
// began (`session-runtime.js`) and reports it beside the status, so every
// client counts from the same moment. This module owns the count and is driven
// from the same two write paths as `global-session-status`, the index rows
// actually render their live state from, so a row can never count a turn that
// index calls idle.
//
// Where a start comes from, best first: the host's record; this device seeing
// the turn begin (`session.execution.started`, the only event that marks a
// start); a start persisted before a reload. The last two stand in until the
// host's arrives, and a session running with none of them shows no duration at
// all. Counting from the moment this client first looked, which is what it did
// before, made a phone joining a 20-minute turn read "12s".
//
// Two maps with deliberately different lifetimes:
//
// - `startedAt` — sessions observed active right now. Persisted, so reloading
//   the page resumes the same count instead of restarting it at zero.
// - `settledMs` — how long the turn that just finished took, as this page
//   measured it. In memory only: the server records the length on the session
//   itself (`lib/sessionTurnMetadata.ts`), and that record is what a row shows
//   after a reload, while the session stays unread.
//
// A persisted start is a lookup table, never a claim of activity. A busy
// status does not mark where a turn begins: the server calls
// `SessionStatus.set` with `busy` at every step of the agent loop and publishes
// an event each time, so a busy event means "still running", not "just
// started" — it cannot be read as a turn boundary, and reading it that way
// reset every counter on reload, because after a refresh one of those repeats
// almost always beats the first status snapshot.
//
// Turn *ends* are marked: `session.idle` and `session.error` events fire once,
// live, and retire the persisted record. Starts are marked too, but only by
// `session.execution.started`, which a reload or a late join never sees.
//
// That leaves the case with no observable answer at all: a turn that ended, and
// another that began, entirely while the tab was gone. Two bounds stand in for
// the evidence the client cannot have:
//
// - a liveness stamp beside the start, refreshed while the session is observed
//   active and stamped precisely as the page hides, compared against this page's
//   navigation start — how long the app was actually absent;
// - an adoption window after load, after which unclaimed records are discarded,
//   which backstops a runtime whose event stream is down and where snapshots are
//   therefore the only signal.
//
// Nothing else may drop a persisted start. Status snapshots legitimately arrive
// before they can see a session as busy — bootstrap fetches status and sessions
// in parallel, directory scopes resolve at different times — and treating one
// of those as "the turn ended" destroyed the start moments before the real busy
// snapshot arrived, which is exactly the reload-resets-to-zero bug. Absence of
// evidence is not evidence here; only the two bounds above expire a record.

=======

>>>>>>> upstream/main
type SessionActivityPhase = 'active' | 'settled';
export type SessionActivityTimingMutation =
<<<<<<< HEAD
  | { type: 'active'; sessionId: string; at?: number; runId?: string }
  | { type: 'settled'; sessionId: string; at?: number; runId?: string }
||||||| bc50ba56aa
  | { type: 'observe'; sessionId: string; phase: SessionActivityPhase; turnStart?: SessionTurnStart }
  // The session went idle while its subagent, background command or pull request keeps the turn open.
  | { type: 'hold'; sessionId: string }
=======
  | { type: 'observe'; sessionId: string; phase: SessionActivityPhase; turnStart?: SessionTurnStart }
  | { type: 'hold'; sessionId: string }
>>>>>>> upstream/main
  | { type: 'remove'; sessionId: string };
<<<<<<< HEAD
type ActivityTimingDraft = { startedAt: Map<string, number> | null; settledMs: Map<string, number> | null };
type SessionActivityTimingState = { startedAt: ReadonlyMap<string, number>; settledMs: ReadonlyMap<string, number> };
||||||| bc50ba56aa

type ActivityTimingDraft = {
  startedAt: Map<string, number> | null;
  settledMs: Map<string, number> | null;
};

type SessionActivityTimingState = {
  startedAt: ReadonlyMap<string, number>;
  settledMs: ReadonlyMap<string, number>;
};

/** Persisted per session: when this turn began, and when it was last alive. */
=======

type ActivityTimingDraft = {
  startedAt: Map<string, number> | null;
  settledMs: Map<string, number> | null;
};

type SessionActivityTimingState = {
  startedAt: ReadonlyMap<string, number>;
  settledMs: ReadonlyMap<string, number>;
};

>>>>>>> upstream/main
type PersistedStart = { start: number; seen: number };
<<<<<<< HEAD
||||||| bc50ba56aa

/** Finished turns worth remembering at once; each row only needs its own. */
=======

>>>>>>> upstream/main
const SETTLED_LIMIT = 200;
const MAX_TURN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_AWAY_MS = 30_000;
const LIVENESS_PERSIST_INTERVAL_MS = 15_000;
const RESTORE_ADOPTION_WINDOW_MS = 90_000;
<<<<<<< HEAD
const storageKey = (): string => `oc.session-activity.v2.${encodeURIComponent(getRuntimeKey())}`;
||||||| bc50ba56aa
/**
 * Host starts arrive moved onto this device's clock with the network delay in
 * them, so the same start differs a little each time. Only one at least this
 * much earlier than the host start already shown is news.
 */
const HOST_START_SLACK_MS = 1_000;
// One key, not one per runtime. These records live for seconds and are keyed by
// instance-unique session IDs, so runtime scoping bought nothing while adding a
// real failure mode: the runtime key is derived from injected globals and is not
// guaranteed stable across early startup, and a read under a key the previous
// page did not write to looks exactly like "no turn was running".
const STORAGE_KEY = 'oc.session-activity.v1';

=======
const HOST_START_SLACK_MS = 1_000;
const STORAGE_KEY = 'oc.session-activity.v1';

>>>>>>> upstream/main
const EMPTY_RESTORED: ReadonlyMap<string, PersistedStart> = new Map();
export const useSessionActivityTimingStore = create<SessionActivityTimingState>(() => ({ startedAt: new Map(), settledMs: new Map() }));
useSessionActivityTimingStore.subscribe(() => countSyncPerformance('timingPublications'));
<<<<<<< HEAD
||||||| bc50ba56aa

/** Last moment each live start was observed active, for the liveness stamp. */
=======

>>>>>>> upstream/main
const liveSeen = new Map<string, number>();
<<<<<<< HEAD
const runIdBySession = new Map<string, string>();
||||||| bc50ba56aa
let lastPersistAt = 0;

// ---------------------------------------------------------------------------
// Start sources
// ---------------------------------------------------------------------------

/** Running sessions whose start is the host's record. */
const hostStarted = new Set<string>();
/** Running sessions with no start known yet: they show no duration. */
const startUnknown = new Set<string>();
/** Sessions this page asked the host about during their current turn. */
const askedHost = new Set<string>();
/** Turns this device keeps open through an idle session's background work. */
const heldTurns = new Set<string>();
/** When this device learned a running turn's start, to tell a host answer that predates it. */
const turnBeganAt = new Map<string, number>();
let hostTurnStartRequester: (() => void) | null = null;

/**
 * How this page asks the host for the starts it lacks, wired by the sync
 * provider: the request lives above this module in the import graph. Called at
 * most once per turn of a session.
 */
export const setHostTurnStartRequester = (requester: (() => void) | null): void => {
  hostTurnStartRequester = requester;
};

/** Whether a running session still counts from a start the host has not confirmed. */
export const needsHostTurnStarts = (): boolean => {
  if (startUnknown.size > 0) return true;
  for (const sessionId of useSessionActivityTimingStore.getState().startedAt.keys()) {
    if (!hostStarted.has(sessionId)) return true;
  }
  return false;
};

type TimingPass = {
  currentStarted: () => ReadonlyMap<string, number>;
  draftStarted: () => Map<string, number>;
  askHost: boolean;
};

const isInTurn = (pass: TimingPass, sessionId: string): boolean => (
  pass.currentStarted().has(sessionId) || startUnknown.has(sessionId)
);

/** A session entering a turn takes the best start known now, or waits for the host's. */
const beginTurn = (
  pass: TimingPass,
  sessionId: string,
  turnStart: SessionTurnStart | undefined,
  restored: ReadonlyMap<string, PersistedStart>,
): void => {
  const at = turnStart?.at ?? restored.get(sessionId)?.start;
  // Only a start this device learned can make a host read that overlaps it
  // stale. A session this device merely joined from a status snapshot began
  // before the read, so the read still describes that turn.
  if (turnStart) turnBeganAt.set(sessionId, Date.now());
  if (at === undefined) startUnknown.add(sessionId);
  else pass.draftStarted().set(sessionId, at);
  if (turnStart?.source === 'host') {
    hostStarted.add(sessionId);
  } else if (!askedHost.has(sessionId)) {
    askedHost.add(sessionId);
    pass.askHost = true;
  }
};

/**
 * A host start for a session already in its turn. It replaces a start this
 * device stood in with, and fills a missing one. Against an earlier host start
 * the same start again differs only by network delay and is no news. A later
 * one in a turn this device holds open is the session running again after its
 * background work, inside the turn already counted; any other different start
 * means this device missed a turn change, and the host's is taken. A start
 * this device saw begin never replaces anything.
 */
const offerHostStart = (pass: TimingPass, sessionId: string, turnStart: SessionTurnStart): void => {
  if (turnStart.source !== 'host') return;
  const current = pass.currentStarted().get(sessionId);
  if (current !== undefined && hostStarted.has(sessionId)) {
    const later = turnStart.at - current;
    if (Math.abs(later) < HOST_START_SLACK_MS) return;
    if (later > 0 && heldTurns.has(sessionId)) return;
  }
  pass.draftStarted().set(sessionId, turnStart.at);
  startUnknown.delete(sessionId);
  hostStarted.add(sessionId);
};

const forgetTurnStart = (sessionId: string): void => {
  hostStarted.delete(sessionId);
  startUnknown.delete(sessionId);
  askedHost.delete(sessionId);
  heldTurns.delete(sessionId);
  turnBeganAt.delete(sessionId);
};

const finishPass = (pass: TimingPass): void => {
  if (pass.askHost) hostTurnStartRequester?.();
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

=======
let lastPersistAt = 0;


const hostStarted = new Set<string>();
const startUnknown = new Set<string>();
const askedHost = new Set<string>();
const heldTurns = new Set<string>();
const turnBeganAt = new Map<string, number>();
let hostTurnStartRequester: (() => void) | null = null;

export const setHostTurnStartRequester = (requester: (() => void) | null): void => {
  hostTurnStartRequester = requester;
};

export const needsHostTurnStarts = (): boolean => {
  if (startUnknown.size > 0) return true;
  for (const sessionId of useSessionActivityTimingStore.getState().startedAt.keys()) {
    if (!hostStarted.has(sessionId)) return true;
  }
  return false;
};

type TimingPass = {
  currentStarted: () => ReadonlyMap<string, number>;
  draftStarted: () => Map<string, number>;
  askHost: boolean;
};

const isInTurn = (pass: TimingPass, sessionId: string): boolean => (
  pass.currentStarted().has(sessionId) || startUnknown.has(sessionId)
);

const beginTurn = (
  pass: TimingPass,
  sessionId: string,
  turnStart: SessionTurnStart | undefined,
  restored: ReadonlyMap<string, PersistedStart>,
): void => {
  const at = turnStart?.at ?? restored.get(sessionId)?.start;
  if (turnStart) turnBeganAt.set(sessionId, Date.now());
  if (at === undefined) startUnknown.add(sessionId);
  else pass.draftStarted().set(sessionId, at);
  if (turnStart?.source === 'host') {
    hostStarted.add(sessionId);
  } else if (!askedHost.has(sessionId)) {
    askedHost.add(sessionId);
    pass.askHost = true;
  }
};

const offerHostStart = (pass: TimingPass, sessionId: string, turnStart: SessionTurnStart): void => {
  if (turnStart.source !== 'host') return;
  const current = pass.currentStarted().get(sessionId);
  if (current !== undefined && hostStarted.has(sessionId)) {
    const later = turnStart.at - current;
    if (Math.abs(later) < HOST_START_SLACK_MS) return;
    if (later > 0 && heldTurns.has(sessionId)) return;
  }
  pass.draftStarted().set(sessionId, turnStart.at);
  startUnknown.delete(sessionId);
  hostStarted.add(sessionId);
};

const forgetTurnStart = (sessionId: string): void => {
  hostStarted.delete(sessionId);
  startUnknown.delete(sessionId);
  askedHost.delete(sessionId);
  heldTurns.delete(sessionId);
  turnBeganAt.delete(sessionId);
};

const finishPass = (pass: TimingPass): void => {
  if (pass.askHost) hostTurnStartRequester?.();
};


>>>>>>> upstream/main
let restoredStarts: Map<string, PersistedStart> | null = null;
<<<<<<< HEAD
let lastPersistAt = 0;
const readPageLoadAt = (): number => typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin) ? performance.timeOrigin : Date.now();
||||||| bc50ba56aa

/** Epoch ms of this page's navigation start; the reference for "how long gone". */
const readPageLoadAt = (): number => {
  if (typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)) {
    return performance.timeOrigin;
  }
  return Date.now();
};

=======

const readPageLoadAt = (): number => {
  if (typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin)) {
    return performance.timeOrigin;
  }
  return Date.now();
};

>>>>>>> upstream/main
let pageLoadAt = readPageLoadAt();
<<<<<<< HEAD
const isResumable = (entry: PersistedStart, now: number): boolean => entry.start <= now && now - entry.start <= MAX_TURN_AGE_MS && entry.seen <= now && pageLoadAt - entry.seen <= MAX_AWAY_MS;
||||||| bc50ba56aa

const isResumable = (entry: PersistedStart, now: number): boolean => (
  entry.start <= now
  && now - entry.start <= MAX_TURN_AGE_MS
  && entry.seen <= now
  // Negative when this page wrote the stamp itself, which is trivially fresh.
  && pageLoadAt - entry.seen <= MAX_AWAY_MS
);

=======

const isResumable = (entry: PersistedStart, now: number): boolean => (
  entry.start <= now
  && now - entry.start <= MAX_TURN_AGE_MS
  && entry.seen <= now
  && pageLoadAt - entry.seen <= MAX_AWAY_MS
);

>>>>>>> upstream/main
const parseEntry = (value: unknown): PersistedStart | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { start, seen } = value as { start?: unknown; seen?: unknown };
  return typeof start === 'number' && Number.isFinite(start) && typeof seen === 'number' && Number.isFinite(seen) ? { start, seen } : null;
};
const readRestoredStarts = (): Map<string, PersistedStart> => {
  const restored = new Map<string, PersistedStart>();
  let raw: string | null = null;
  try { raw = getSafeStorage().getItem(storageKey()); } catch { return restored; }
  if (!raw) return restored;
  let parsed: unknown;
<<<<<<< HEAD
  try { parsed = JSON.parse(raw); } catch { return restored; }
||||||| bc50ba56aa
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed payload is a failed read, not authoritative "no turns were
    // running": live status re-seeds every counter from now either way.
    return restored;
  }
=======
  try {
    parsed = JSON.parse(raw);
  } catch {
    return restored;
  }
>>>>>>> upstream/main
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return restored;
  const now = Date.now();
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    const entry = parseEntry(value);
<<<<<<< HEAD
    if (entry && isResumable(entry, now)) restored.set(id, entry);
||||||| bc50ba56aa
    // Rejects stale turns, quiet stamps, and clock-skewed futures rather than
    // rendering a counter that reads days long or negative.
    if (entry && isResumable(entry, now)) restored.set(sessionId, entry);
=======
    if (entry && isResumable(entry, now)) restored.set(sessionId, entry);
>>>>>>> upstream/main
  }
  return restored;
};
<<<<<<< HEAD
const getRestoredStarts = (): Map<string, PersistedStart> => restoredStarts ??= readRestoredStarts();
||||||| bc50ba56aa

const getRestoredStarts = (): Map<string, PersistedStart> => {
  restoredStarts ??= readRestoredStarts();
  return restoredStarts;
};

/**
 * Restored records still eligible to be adopted. Past the adoption window they
 * are dropped for good, so a turn that starts later counts from zero instead of
 * inheriting the start of whatever ran before the reload.
 */
=======

const getRestoredStarts = (): Map<string, PersistedStart> => {
  restoredStarts ??= readRestoredStarts();
  return restoredStarts;
};

>>>>>>> upstream/main
const getAdoptableStarts = (now: number): ReadonlyMap<string, PersistedStart> => {
  if (now - pageLoadAt > RESTORE_ADOPTION_WINDOW_MS) { restoredStarts?.clear(); return EMPTY_RESTORED; }
  return getRestoredStarts();
};
<<<<<<< HEAD
||||||| bc50ba56aa

// Live starts merged over restored-but-unconfirmed ones, so a reload landing
// before the first authoritative snapshot does not drop the starts that
// snapshot is about to confirm. Restored entries whose stamp has gone quiet are
// dropped here, which is the only way they leave storage.
=======

>>>>>>> upstream/main
const persistStarts = (startedAt: ReadonlyMap<string, number>, now: number): void => {
  const payload: Record<string, PersistedStart> = {};
  for (const [id, entry] of getRestoredStarts()) if (isResumable(entry, now)) payload[id] = entry;
  for (const [id, start] of startedAt) payload[id] = { start, seen: liveSeen.get(id) ?? now };
  lastPersistAt = now;
  try {
    const storage = getSafeStorage();
    if (Object.keys(payload).length === 0) storage.removeItem(storageKey());
    else storage.setItem(storageKey(), JSON.stringify(payload));
  } catch { /* storage is optional */ }
};
<<<<<<< HEAD
||||||| bc50ba56aa

// The most accurate liveness stamp available: the page is going away and every
// running turn was still running as of now. Writes are immediate (not deferred)
// so this cannot lose the race against a deferred flush on the same event.
=======

>>>>>>> upstream/main
const stampLiveness = (): void => {
  const { startedAt } = useSessionActivityTimingStore.getState();
  if (startedAt.size === 0) return;
  const now = Date.now();
  for (const id of startedAt.keys()) liveSeen.set(id, now);
  persistStarts(startedAt, now);
};
let lifecycleHooked = false;
const ensureLivenessStampOnHide = (): void => {
  if (lifecycleHooked || typeof window === 'undefined') return;
  lifecycleHooked = true;
  try {
    window.addEventListener('pagehide', stampLiveness, { capture: true });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') stampLiveness(); });
      document.addEventListener('freeze', stampLiveness);
    }
  } catch { /* periodic persistence remains available */ }
};
<<<<<<< HEAD
||||||| bc50ba56aa

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

=======


>>>>>>> upstream/main
const trimSettled = (settled: Map<string, number>): void => {
  while (settled.size > SETTLED_LIMIT) { const first = settled.keys().next(); if (first.done) return; settled.delete(first.value); }
};
<<<<<<< HEAD
const applyTransitions = (activeSessionIds: ReadonlySet<string>, settle: { source: 'snapshot'; isCovered: (id: string) => boolean } | { source: 'event'; sessionId: string } | null): void => {
||||||| bc50ba56aa

/**
 * What ends a turn in this pass. An event names its session outright; a snapshot
 * only answers whether it covers a given one — deliberately the cheaper
 * question, since the settle loop walks running turns rather than session lists.
 * An `event` idle is a live, one-shot "this turn is over"; a snapshot omitting a
 * session is not, because it may simply not see it yet.
 */
type SettleInput =
  | { source: 'event'; sessionId: string }
  | { source: 'snapshot'; isCovered: (sessionId: string) => boolean };

const applyTransitions = (
  activeSessionIds: ReadonlySet<string>,
  settle: SettleInput | null,
  heldSessionIds: ReadonlySet<string>,
): void => {
=======

type SettleInput =
  | { source: 'event'; sessionId: string }
  | { source: 'snapshot'; isCovered: (sessionId: string) => boolean };

const applyTransitions = (
  activeSessionIds: ReadonlySet<string>,
  settle: SettleInput | null,
  heldSessionIds: ReadonlySet<string>,
): void => {
>>>>>>> upstream/main
  const now = Date.now();
  const restored = getAdoptableStarts(now);
  const state = useSessionActivityTimingStore.getState();
  const next: ActivityTimingDraft = { startedAt: null, settledMs: null };
  const draftStarted = (): Map<string, number> => next.startedAt ??= new Map(state.startedAt);
  const draftSettled = (): Map<string, number> => next.settledMs ??= new Map(state.settledMs);
  let sawActive = false;
  let restoredChanged = false;
<<<<<<< HEAD
  for (const id of activeSessionIds) {
    sawActive = true; liveSeen.set(id, now);
    if (state.startedAt.has(id)) continue;
    draftStarted().set(id, restored.get(id)?.start ?? now);
    if (state.settledMs.has(id)) draftSettled().delete(id);
||||||| bc50ba56aa

  const draftStarted = (): Map<string, number> => (next.started ??= new Map(state.startedAt));
  const draftSettled = (): Map<string, number> => (next.settled ??= new Map(state.settledMs));
  const pass: TimingPass = { currentStarted: () => next.started ?? state.startedAt, draftStarted, askHost: false };

  for (const sessionId of activeSessionIds) {
    sawActive = true;
    liveSeen.set(sessionId, now);
    if (isInTurn(pass, sessionId)) continue;
    // A snapshot carries no turn boundary: the session may have been running
    // for an hour. A persisted start is used when one survives; only the
    // bounds below expire it.
    beginTurn(pass, sessionId, undefined, restored);
    if ((next.settled ?? state.settledMs).has(sessionId)) draftSettled().delete(sessionId);
=======

  const draftStarted = (): Map<string, number> => (next.started ??= new Map(state.startedAt));
  const draftSettled = (): Map<string, number> => (next.settled ??= new Map(state.settledMs));
  const pass: TimingPass = { currentStarted: () => next.started ?? state.startedAt, draftStarted, askHost: false };

  for (const sessionId of activeSessionIds) {
    sawActive = true;
    liveSeen.set(sessionId, now);
    if (isInTurn(pass, sessionId)) continue;
    beginTurn(pass, sessionId, undefined, restored);
    if ((next.settled ?? state.settledMs).has(sessionId)) draftSettled().delete(sessionId);
>>>>>>> upstream/main
  }
<<<<<<< HEAD
  const settleTurn = (id: string, start: number): void => { draftStarted().delete(id); liveSeen.delete(id); runIdBySession.delete(id); draftSettled().set(id, Math.max(0, now - start)); };
  if (settle?.source === 'event') {
||||||| bc50ba56aa
  for (const sessionId of heldSessionIds) heldTurns.add(sessionId);

  const settleTurn = (sessionId: string, start: number): void => {
    draftStarted().delete(sessionId);
    liveSeen.delete(sessionId);
    forgetTurnStart(sessionId);
    draftSettled().set(sessionId, Math.max(0, now - start));
  };

  if (settle === null) {
    // Nothing ends this pass.
  } else if (settle.source === 'event') {
    // An idle/error event is a live, unambiguous end of turn, so it also retires
    // the persisted record. A snapshot's silence is not: it may simply not see
    // the session yet.
=======
  for (const sessionId of heldSessionIds) heldTurns.add(sessionId);

  const settleTurn = (sessionId: string, start: number): void => {
    draftStarted().delete(sessionId);
    liveSeen.delete(sessionId);
    forgetTurnStart(sessionId);
    draftSettled().set(sessionId, Math.max(0, now - start));
  };

  if (settle === null) {
    // Nothing ends this pass.
  } else if (settle.source === 'event') {
>>>>>>> upstream/main
    if (getRestoredStarts().delete(settle.sessionId)) restoredChanged = true;
    const start = state.startedAt.get(settle.sessionId);
    if (start !== undefined) settleTurn(settle.sessionId, start);
<<<<<<< HEAD
  } else if (settle?.source === 'snapshot') {
    for (const [id, start] of state.startedAt) if (!activeSessionIds.has(id) && settle.isCovered(id)) settleTurn(id, start);
    for (const id of getRestoredStarts().keys()) {
      if (!activeSessionIds.has(id) && settle.isCovered(id) && getRestoredStarts().delete(id)) restoredChanged = true;
||||||| bc50ba56aa
    else forgetTurnStart(settle.sessionId);
  } else {
    // Walk the running turns, not everything the snapshot covers. Only a live
    // start can settle, and there are a handful of those against a directory's
    // hundreds of sessions — asking "does this snapshot cover that one?" keeps
    // the pass proportional to the work instead of to the session list, and
    // allocates nothing per poll.
    for (const [sessionId, start] of state.startedAt) {
      if (activeSessionIds.has(sessionId)) continue;
      if (!settle.isCovered(sessionId)) continue;
      settleTurn(sessionId, start);
    }
    for (const sessionId of startUnknown) {
      if (!activeSessionIds.has(sessionId) && settle.isCovered(sessionId)) forgetTurnStart(sessionId);
=======
    else forgetTurnStart(settle.sessionId);
  } else {
    for (const [sessionId, start] of state.startedAt) {
      if (activeSessionIds.has(sessionId)) continue;
      if (!settle.isCovered(sessionId)) continue;
      settleTurn(sessionId, start);
    }
    for (const sessionId of startUnknown) {
      if (!activeSessionIds.has(sessionId) && settle.isCovered(sessionId)) forgetTurnStart(sessionId);
>>>>>>> upstream/main
    }
  }
<<<<<<< HEAD
  if (next.settledMs) trimSettled(next.settledMs);
  if (next.startedAt || next.settledMs) useSessionActivityTimingStore.setState({ startedAt: next.startedAt ?? state.startedAt, settledMs: next.settledMs ?? state.settledMs });
  if (next.startedAt) { if (next.startedAt.size > 0) ensureLivenessStampOnHide(); persistStarts(next.startedAt, now); return; }
  if (restoredChanged) { persistStarts(state.startedAt, now); return; }
  if (sawActive && state.startedAt.size > 0 && now - lastPersistAt >= LIVENESS_PERSIST_INTERVAL_MS) persistStarts(state.startedAt, now);
||||||| bc50ba56aa

  if (next.settled) trimSettled(next.settled);

  if (next.started || next.settled) {
    useSessionActivityTimingStore.setState({
      startedAt: next.started ?? state.startedAt,
      settledMs: next.settled ?? state.settledMs,
    });
  }

  finishPass(pass);

  if (next.started) {
    if (next.started.size > 0) ensureLivenessStampOnHide();
    persistStarts(next.started, now);
    return;
  }
  if (restoredChanged) {
    persistStarts(state.startedAt, now);
    return;
  }
  // Nothing structural changed, but a long-running turn still needs its stamp
  // refreshed so a reload can tell it apart from one that ended unobserved.
  if (sawActive && state.startedAt.size > 0 && now - lastPersistAt >= LIVENESS_PERSIST_INTERVAL_MS) {
    persistStarts(state.startedAt, now);
  }
=======

  if (next.settled) trimSettled(next.settled);

  if (next.started || next.settled) {
    useSessionActivityTimingStore.setState({
      startedAt: next.started ?? state.startedAt,
      settledMs: next.settled ?? state.settledMs,
    });
  }

  finishPass(pass);

  if (next.started) {
    if (next.started.size > 0) ensureLivenessStampOnHide();
    persistStarts(next.started, now);
    return;
  }
  if (restoredChanged) {
    persistStarts(state.startedAt, now);
    return;
  }
  if (sawActive && state.startedAt.size > 0 && now - lastPersistAt >= LIVENESS_PERSIST_INTERVAL_MS) {
    persistStarts(state.startedAt, now);
  }
>>>>>>> upstream/main
};

<<<<<<< HEAD
export const applySessionActivityTimingMutations = (mutations: readonly SessionActivityTimingMutation[]): void => {
||||||| bc50ba56aa
/**
 * Event-driven path: one session changed phase, live. Busy repeats throughout a
 * turn and carries no boundary; idle/error fire once and end it, which is why
 * only settling here retires the persisted record.
 */
export const observeSessionActivityTiming = (
  sessionId: string,
  phase: SessionActivityPhase,
  turnStart?: SessionTurnStart,
): void => {
  applySessionActivityTimingMutations([{ type: 'observe', sessionId, phase, turnStart }]);
};

export const applySessionActivityTimingMutations = (
  mutations: readonly SessionActivityTimingMutation[],
): void => {
=======
export const observeSessionActivityTiming = (
  sessionId: string,
  phase: SessionActivityPhase,
  turnStart?: SessionTurnStart,
): void => {
  applySessionActivityTimingMutations([{ type: 'observe', sessionId, phase, turnStart }]);
};

export const applySessionActivityTimingMutations = (
  mutations: readonly SessionActivityTimingMutation[],
): void => {
>>>>>>> upstream/main
  if (mutations.length === 0) return;
  const now = Date.now();
  const restored = getAdoptableStarts(now);
  const state = useSessionActivityTimingStore.getState();
  const next: ActivityTimingDraft = { startedAt: null, settledMs: null };
  let sawActive = false;
  let restoredChanged = false;
  const started = (): ReadonlyMap<string, number> => next.startedAt ?? state.startedAt;
  const settled = (): ReadonlyMap<string, number> => next.settledMs ?? state.settledMs;
  const draftStarted = (): Map<string, number> => next.startedAt ??= new Map(state.startedAt);
  const draftSettled = (): Map<string, number> => next.settledMs ??= new Map(state.settledMs);
  for (const mutation of mutations) {
    if (mutation.type === 'remove') {
      runIdBySession.delete(mutation.sessionId);
      if (getRestoredStarts().delete(mutation.sessionId)) restoredChanged = true;
      liveSeen.delete(mutation.sessionId);
      if (started().has(mutation.sessionId)) draftStarted().delete(mutation.sessionId);
      if (settled().has(mutation.sessionId)) draftSettled().delete(mutation.sessionId);
    } else if (mutation.type === 'active') {
      if (mutation.runId !== undefined) runIdBySession.set(mutation.sessionId, mutation.runId);
      sawActive = true; liveSeen.set(mutation.sessionId, now);
      const start = mutation.at ?? restored.get(mutation.sessionId)?.start ?? now;
      if (!started().has(mutation.sessionId) || (mutation.at !== undefined && started().get(mutation.sessionId) !== start)) draftStarted().set(mutation.sessionId, start);
      if (settled().has(mutation.sessionId)) draftSettled().delete(mutation.sessionId);
    } else {
      const runId = runIdBySession.get(mutation.sessionId);
      if (mutation.runId !== undefined && runId !== undefined && mutation.runId !== runId) continue;
      runIdBySession.delete(mutation.sessionId);
      if (getRestoredStarts().delete(mutation.sessionId)) restoredChanged = true;
      const start = started().get(mutation.sessionId);
      if (start === undefined) continue;
      draftStarted().delete(mutation.sessionId); liveSeen.delete(mutation.sessionId); draftSettled().set(mutation.sessionId, Math.max(0, (mutation.at ?? now) - start));
    }
<<<<<<< HEAD
||||||| bc50ba56aa

    if (mutation.phase === 'active') {
      sawActive = true;
      liveSeen.set(mutation.sessionId, now);
      // A busy event without a start means "still running", not "just
      // started": the server repeats it at every step of the agent loop.
      if (!isInTurn(pass, mutation.sessionId)) beginTurn(pass, mutation.sessionId, mutation.turnStart, restored);
      else if (mutation.turnStart) offerHostStart(pass, mutation.sessionId, mutation.turnStart);
      if (currentSettled().has(mutation.sessionId)) draftSettled().delete(mutation.sessionId);
      continue;
    }

    if (getRestoredStarts().delete(mutation.sessionId)) restoredChanged = true;
    const start = currentStarted().get(mutation.sessionId);
    forgetTurnStart(mutation.sessionId);
    if (start === undefined) continue;
    draftStarted().delete(mutation.sessionId);
    liveSeen.delete(mutation.sessionId);
    draftSettled().set(mutation.sessionId, Math.max(0, now - start));
=======

    if (mutation.phase === 'active') {
      sawActive = true;
      liveSeen.set(mutation.sessionId, now);
      if (!isInTurn(pass, mutation.sessionId)) beginTurn(pass, mutation.sessionId, mutation.turnStart, restored);
      else if (mutation.turnStart) offerHostStart(pass, mutation.sessionId, mutation.turnStart);
      if (currentSettled().has(mutation.sessionId)) draftSettled().delete(mutation.sessionId);
      continue;
    }

    if (getRestoredStarts().delete(mutation.sessionId)) restoredChanged = true;
    const start = currentStarted().get(mutation.sessionId);
    forgetTurnStart(mutation.sessionId);
    if (start === undefined) continue;
    draftStarted().delete(mutation.sessionId);
    liveSeen.delete(mutation.sessionId);
    draftSettled().set(mutation.sessionId, Math.max(0, now - start));
>>>>>>> upstream/main
  }
  if (next.settledMs) trimSettled(next.settledMs);
  if (next.startedAt || next.settledMs) useSessionActivityTimingStore.setState({ startedAt: next.startedAt ?? state.startedAt, settledMs: next.settledMs ?? state.settledMs });
  if (next.startedAt) { if (next.startedAt.size > 0) ensureLivenessStampOnHide(); persistStarts(next.startedAt, now); }
  else if (restoredChanged) persistStarts(state.startedAt, now);
  else if (sawActive && state.startedAt.size > 0 && now - lastPersistAt >= LIVENESS_PERSIST_INTERVAL_MS) persistStarts(state.startedAt, now);
};
export const observeSessionActivityTiming = (sessionId: string, phase: SessionActivityPhase): void => applySessionActivityTimingMutations([{ type: phase, sessionId }]);
export const applySessionActivityEvents = (_directory: string, events: readonly CanonicalEvent[]): void => {
  const mutations: SessionActivityTimingMutation[] = [];
  for (const event of events) {
    if (event.type === 'run.started') mutations.push({ type: 'active', sessionId: event.sessionId, at: event.createdAt, runId: event.runId });
    else if (event.type === 'turn.started') mutations.push({ type: 'active', sessionId: event.sessionId, runId: event.runId });
    else if (event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled') mutations.push({ type: 'settled', sessionId: event.sessionId, at: event.finishedAt, runId: event.runId });
    else if (event.type === 'session.deleted') for (const id of event.deletedSessionIds) mutations.push({ type: 'remove', sessionId: id });
  }
  applySessionActivityTimingMutations(mutations);
};
<<<<<<< HEAD
export const reconcileSessionActivityTiming = (activeSessionIds: ReadonlySet<string>, isCoveredBySnapshot: (sessionId: string) => boolean): void => applyTransitions(activeSessionIds, { source: 'snapshot', isCovered: isCoveredBySnapshot });
export const removeSessionActivityTiming = (sessionId: string): void => applySessionActivityTimingMutations([{ type: 'remove', sessionId }]);
export const resetSessionActivityTiming = (options: { pageLoadAt?: number } = {}): void => { restoredStarts = null; liveSeen.clear(); runIdBySession.clear(); lastPersistAt = 0; pageLoadAt = options.pageLoadAt ?? Date.now(); useSessionActivityTimingStore.setState({ startedAt: new Map(), settledMs: new Map() }); };
export const useSessionActivityStartedAt = (sessionId: string): number | undefined => useSessionActivityTimingStore(useCallback((state) => state.startedAt.get(sessionId), [sessionId]));
export const useSessionSettledDurationMs = (sessionId: string): number | undefined => useSessionActivityTimingStore(useCallback((state) => state.settledMs.get(sessionId), [sessionId]));
export const useHasSessionActivityDuration = (sessionId: string, running: boolean): boolean => useSessionActivityTimingStore(useCallback((state) => running ? state.startedAt.has(sessionId) : state.settledMs.has(sessionId), [running, sessionId]));
subscribeRuntimeEndpointChanged(() => resetSessionActivityTiming());
||||||| bc50ba56aa

/**
 * Authoritative path: a `/session/status` snapshot for one directory. Sessions
 * the snapshot covers but does not report active stop their live counters —
 * that is what recovers a turn whose end event this client missed — but their
 * persisted records survive, because a snapshot that cannot yet see a session
 * looks identical to one whose turn is over.
 */
export const reconcileSessionActivityTiming = (
  activeSessionIds: ReadonlySet<string>,
  isCoveredBySnapshot: (sessionId: string) => boolean,
  heldSessionIds: ReadonlySet<string> = EMPTY_IDS,
): void => {
  applyTransitions(activeSessionIds, { source: 'snapshot', isCovered: isCoveredBySnapshot }, heldSessionIds);
};

export const removeSessionActivityTiming = (sessionId: string): void => {
  applySessionActivityTimingMutations([{ type: 'remove', sessionId }]);
};

/**
 * Starts read from the host's status map, already on this device's clock.
 * A session in a turn here takes its start, unless this device learned the
 * start of a newer turn while the map was being read (`requestedAt` to
 * `answeredAt`): the map then describes the turn before it. A session this
 * device only joined from a status snapshot is not such a turn, because the
 * map still describes the turn that was already running. `heldHere` names
 * sessions the host reports idle while this device sees their turn kept open
 * by background work: their turn begins here with the
 * host's last start, since nothing else on this device would ever start
 * counting it.
 */
export const applyHostTurnStarts = (
  starts: ReadonlyMap<string, SessionTurnStart>,
  heldHere: ReadonlySet<string>,
  read: { requestedAt: number; answeredAt: number },
): void => {
  if (starts.size === 0) return;
  const state = useSessionActivityTimingStore.getState();
  let started: Map<string, number> | null = null;
  let settled: Map<string, number> | null = null;
  const pass: TimingPass = {
    currentStarted: () => started ?? state.startedAt,
    draftStarted: () => (started ??= new Map(state.startedAt)),
    askHost: false,
  };
  for (const [sessionId, turnStart] of starts) {
    const beganAt = turnBeganAt.get(sessionId);
    if (beganAt !== undefined && beganAt >= read.requestedAt && beganAt < read.answeredAt) continue;
    if (heldHere.has(sessionId)) heldTurns.add(sessionId);
    if (isInTurn(pass, sessionId)) {
      offerHostStart(pass, sessionId, turnStart);
    } else if (heldHere.has(sessionId)) {
      beginTurn(pass, sessionId, turnStart, EMPTY_RESTORED);
      if ((settled ?? state.settledMs).has(sessionId)) (settled ??= new Map(state.settledMs)).delete(sessionId);
    }
  }
  if (!started) return;
  useSessionActivityTimingStore.setState({ startedAt: started, settledMs: settled ?? state.settledMs });
  ensureLivenessStampOnHide();
  persistStarts(started, Date.now());
};

/**
 * Drops in-memory state and the cached restored-start snapshot — i.e. treats
 * what follows as a fresh page load. Called on a runtime switch, where the
 * previous instance's turns are no longer ours, and by tests. `pageLoadAt`
 * overrides the navigation-start reference so tests can place a load in the
 * past (slow bootstrap, expired window).
 */
export const resetSessionActivityTiming = (options: { pageLoadAt?: number } = {}): void => {
  restoredStarts = null;
  liveSeen.clear();
  hostStarted.clear();
  startUnknown.clear();
  askedHost.clear();
  heldTurns.clear();
  turnBeganAt.clear();
  lastPersistAt = 0;
  pageLoadAt = options.pageLoadAt ?? Date.now();
  useSessionActivityTimingStore.setState({ startedAt: new Map(), settledMs: new Map() });
};

// ---------------------------------------------------------------------------
// Leaf subscriptions
// ---------------------------------------------------------------------------

export const useSessionActivityStartedAt = (sessionId: string): number | undefined => (
  useSessionActivityTimingStore(useCallback((state) => state.startedAt.get(sessionId), [sessionId]))
);

export const useSessionSettledDurationMs = (sessionId: string): number | undefined => (
  useSessionActivityTimingStore(useCallback((state) => state.settledMs.get(sessionId), [sessionId]))
);

/**
 * Whether this page measured a duration to render, without subscribing the
 * caller to the value itself. Rows use `useHasSessionTurnDuration`
 * (`session-turn-duration.ts`), which also counts the length the server
 * recorded.
 */
export const useHasSessionActivityDuration = (sessionId: string, running: boolean): boolean => (
  useSessionActivityTimingStore(useCallback((state) => (
    running ? state.startedAt.has(sessionId) : state.settledMs.has(sessionId)
  ), [running, sessionId]))
);
=======

export const reconcileSessionActivityTiming = (
  activeSessionIds: ReadonlySet<string>,
  isCoveredBySnapshot: (sessionId: string) => boolean,
  heldSessionIds: ReadonlySet<string> = EMPTY_IDS,
): void => {
  applyTransitions(activeSessionIds, { source: 'snapshot', isCovered: isCoveredBySnapshot }, heldSessionIds);
};

export const removeSessionActivityTiming = (sessionId: string): void => {
  applySessionActivityTimingMutations([{ type: 'remove', sessionId }]);
};

export const applyHostTurnStarts = (
  starts: ReadonlyMap<string, SessionTurnStart>,
  heldHere: ReadonlySet<string>,
  read: { requestedAt: number; answeredAt: number },
): void => {
  if (starts.size === 0) return;
  const state = useSessionActivityTimingStore.getState();
  let started: Map<string, number> | null = null;
  let settled: Map<string, number> | null = null;
  const pass: TimingPass = {
    currentStarted: () => started ?? state.startedAt,
    draftStarted: () => (started ??= new Map(state.startedAt)),
    askHost: false,
  };
  for (const [sessionId, turnStart] of starts) {
    const beganAt = turnBeganAt.get(sessionId);
    if (beganAt !== undefined && beganAt >= read.requestedAt && beganAt < read.answeredAt) continue;
    if (heldHere.has(sessionId)) heldTurns.add(sessionId);
    if (isInTurn(pass, sessionId)) {
      offerHostStart(pass, sessionId, turnStart);
    } else if (heldHere.has(sessionId)) {
      beginTurn(pass, sessionId, turnStart, EMPTY_RESTORED);
      if ((settled ?? state.settledMs).has(sessionId)) (settled ??= new Map(state.settledMs)).delete(sessionId);
    }
  }
  if (!started) return;
  useSessionActivityTimingStore.setState({ startedAt: started, settledMs: settled ?? state.settledMs });
  ensureLivenessStampOnHide();
  persistStarts(started, Date.now());
};

export const resetSessionActivityTiming = (options: { pageLoadAt?: number } = {}): void => {
  restoredStarts = null;
  liveSeen.clear();
  hostStarted.clear();
  startUnknown.clear();
  askedHost.clear();
  heldTurns.clear();
  turnBeganAt.clear();
  lastPersistAt = 0;
  pageLoadAt = options.pageLoadAt ?? Date.now();
  useSessionActivityTimingStore.setState({ startedAt: new Map(), settledMs: new Map() });
};


export const useSessionActivityStartedAt = (sessionId: string): number | undefined => (
  useSessionActivityTimingStore(useCallback((state) => state.startedAt.get(sessionId), [sessionId]))
);

export const useSessionSettledDurationMs = (sessionId: string): number | undefined => (
  useSessionActivityTimingStore(useCallback((state) => state.settledMs.get(sessionId), [sessionId]))
);

export const useHasSessionActivityDuration = (sessionId: string, running: boolean): boolean => (
  useSessionActivityTimingStore(useCallback((state) => (
    running ? state.startedAt.has(sessionId) : state.settledMs.has(sessionId)
  ), [running, sessionId]))
);
>>>>>>> upstream/main
