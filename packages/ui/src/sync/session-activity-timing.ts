import { useCallback } from 'react';
import { create } from 'zustand';
import type { CanonicalEvent } from '@openchamber/agent-contract';
import { getSafeStorage } from '@/stores/utils/safeStorage';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { countSyncPerformance } from './performance-diagnostics';

type SessionActivityPhase = 'active' | 'settled';
export type SessionActivityTimingMutation =
  | { type: 'active'; sessionId: string; at?: number; runId?: string }
  | { type: 'settled'; sessionId: string; at?: number; runId?: string }
  | { type: 'remove'; sessionId: string };
type ActivityTimingDraft = { startedAt: Map<string, number> | null; settledMs: Map<string, number> | null };
type SessionActivityTimingState = { startedAt: ReadonlyMap<string, number>; settledMs: ReadonlyMap<string, number> };
type PersistedStart = { start: number; seen: number };
const SETTLED_LIMIT = 200;
const MAX_TURN_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_AWAY_MS = 30_000;
const LIVENESS_PERSIST_INTERVAL_MS = 15_000;
const RESTORE_ADOPTION_WINDOW_MS = 90_000;
const storageKey = (): string => `oc.session-activity.v2.${encodeURIComponent(getRuntimeKey())}`;
const EMPTY_RESTORED: ReadonlyMap<string, PersistedStart> = new Map();
export const useSessionActivityTimingStore = create<SessionActivityTimingState>(() => ({ startedAt: new Map(), settledMs: new Map() }));
useSessionActivityTimingStore.subscribe(() => countSyncPerformance('timingPublications'));
const liveSeen = new Map<string, number>();
const runIdBySession = new Map<string, string>();
let restoredStarts: Map<string, PersistedStart> | null = null;
let lastPersistAt = 0;
const readPageLoadAt = (): number => typeof performance !== 'undefined' && Number.isFinite(performance.timeOrigin) ? performance.timeOrigin : Date.now();
let pageLoadAt = readPageLoadAt();
const isResumable = (entry: PersistedStart, now: number): boolean => entry.start <= now && now - entry.start <= MAX_TURN_AGE_MS && entry.seen <= now && pageLoadAt - entry.seen <= MAX_AWAY_MS;
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
  try { parsed = JSON.parse(raw); } catch { return restored; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return restored;
  const now = Date.now();
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    const entry = parseEntry(value);
    if (entry && isResumable(entry, now)) restored.set(id, entry);
  }
  return restored;
};
const getRestoredStarts = (): Map<string, PersistedStart> => restoredStarts ??= readRestoredStarts();
const getAdoptableStarts = (now: number): ReadonlyMap<string, PersistedStart> => {
  if (now - pageLoadAt > RESTORE_ADOPTION_WINDOW_MS) { restoredStarts?.clear(); return EMPTY_RESTORED; }
  return getRestoredStarts();
};
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
const trimSettled = (settled: Map<string, number>): void => {
  while (settled.size > SETTLED_LIMIT) { const first = settled.keys().next(); if (first.done) return; settled.delete(first.value); }
};
const applyTransitions = (activeSessionIds: ReadonlySet<string>, settle: { source: 'snapshot'; isCovered: (id: string) => boolean } | { source: 'event'; sessionId: string } | null): void => {
  const now = Date.now();
  const restored = getAdoptableStarts(now);
  const state = useSessionActivityTimingStore.getState();
  const next: ActivityTimingDraft = { startedAt: null, settledMs: null };
  const draftStarted = (): Map<string, number> => next.startedAt ??= new Map(state.startedAt);
  const draftSettled = (): Map<string, number> => next.settledMs ??= new Map(state.settledMs);
  let sawActive = false;
  let restoredChanged = false;
  for (const id of activeSessionIds) {
    sawActive = true; liveSeen.set(id, now);
    if (state.startedAt.has(id)) continue;
    draftStarted().set(id, restored.get(id)?.start ?? now);
    if (state.settledMs.has(id)) draftSettled().delete(id);
  }
  const settleTurn = (id: string, start: number): void => { draftStarted().delete(id); liveSeen.delete(id); runIdBySession.delete(id); draftSettled().set(id, Math.max(0, now - start)); };
  if (settle?.source === 'event') {
    if (getRestoredStarts().delete(settle.sessionId)) restoredChanged = true;
    const start = state.startedAt.get(settle.sessionId);
    if (start !== undefined) settleTurn(settle.sessionId, start);
  } else if (settle?.source === 'snapshot') {
    for (const [id, start] of state.startedAt) if (!activeSessionIds.has(id) && settle.isCovered(id)) settleTurn(id, start);
    for (const id of getRestoredStarts().keys()) {
      if (!activeSessionIds.has(id) && settle.isCovered(id) && getRestoredStarts().delete(id)) restoredChanged = true;
    }
  }
  if (next.settledMs) trimSettled(next.settledMs);
  if (next.startedAt || next.settledMs) useSessionActivityTimingStore.setState({ startedAt: next.startedAt ?? state.startedAt, settledMs: next.settledMs ?? state.settledMs });
  if (next.startedAt) { if (next.startedAt.size > 0) ensureLivenessStampOnHide(); persistStarts(next.startedAt, now); return; }
  if (restoredChanged) { persistStarts(state.startedAt, now); return; }
  if (sawActive && state.startedAt.size > 0 && now - lastPersistAt >= LIVENESS_PERSIST_INTERVAL_MS) persistStarts(state.startedAt, now);
};

export const applySessionActivityTimingMutations = (mutations: readonly SessionActivityTimingMutation[]): void => {
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
export const reconcileSessionActivityTiming = (activeSessionIds: ReadonlySet<string>, isCoveredBySnapshot: (sessionId: string) => boolean): void => applyTransitions(activeSessionIds, { source: 'snapshot', isCovered: isCoveredBySnapshot });
export const removeSessionActivityTiming = (sessionId: string): void => applySessionActivityTimingMutations([{ type: 'remove', sessionId }]);
export const resetSessionActivityTiming = (options: { pageLoadAt?: number } = {}): void => { restoredStarts = null; liveSeen.clear(); runIdBySession.clear(); lastPersistAt = 0; pageLoadAt = options.pageLoadAt ?? Date.now(); useSessionActivityTimingStore.setState({ startedAt: new Map(), settledMs: new Map() }); };
export const useSessionActivityStartedAt = (sessionId: string): number | undefined => useSessionActivityTimingStore(useCallback((state) => state.startedAt.get(sessionId), [sessionId]));
export const useSessionSettledDurationMs = (sessionId: string): number | undefined => useSessionActivityTimingStore(useCallback((state) => state.settledMs.get(sessionId), [sessionId]));
export const useHasSessionActivityDuration = (sessionId: string, running: boolean): boolean => useSessionActivityTimingStore(useCallback((state) => running ? state.startedAt.has(sessionId) : state.settledMs.has(sessionId), [running, sessionId]));
subscribeRuntimeEndpointChanged(() => resetSessionActivityTiming());
