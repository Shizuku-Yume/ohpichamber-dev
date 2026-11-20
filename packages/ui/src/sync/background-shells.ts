import { useCallback } from 'react';

import { create } from 'zustand';
import type { CanonicalEvent, ShellJob, ShellJobIdentity, ShellSnapshot } from '@openchamber/agent-contract';
import { normalizePath } from '@/lib/pathNormalization';
import { compareCounters } from './event-reducer';

export type RunningShell = Extract<ShellJob, { status: 'running' }>;
export type TrackedShell = RunningShell & { directory: string };
export type EndedShell = Extract<ShellJob, { status: 'ended' }> & { directory: string };
type BackgroundShellsState = { byId: ReadonlyMap<string, TrackedShell>; sessionIds: ReadonlySet<string>; ended: ReadonlyMap<string, EndedShell> };
const EMPTY_SESSION_IDS: ReadonlySet<string> = new Set();
export const ENDED_SHELLS_MAX = 200;
export const useBackgroundShellsStore = create<BackgroundShellsState>(() => ({ byId: new Map(), sessionIds: EMPTY_SESSION_IDS, ended: new Map() }));
const keyFor = (job: Pick<ShellJobIdentity, 'sessionId' | 'workerGeneration' | 'jobId'>): string => JSON.stringify([job.sessionId, job.workerGeneration, job.jobId]);
let revision = 0;
const touchedAt = new Map<string, number>();
const MAX_TOUCHED = 500;
let generation = 0;
let pendingRefreshes = 0;
const snapshotByDirectory = new Map<string, { scope: string; epoch: string; revision: string }>();
const latestRefreshByDirectory = new Map<string, object>();
const touch = (jobId: string): void => { revision += 1; touchedAt.delete(jobId); touchedAt.set(jobId, revision); if (pendingRefreshes === 0 && touchedAt.size > MAX_TOUCHED) { const id = touchedAt.keys().next().value; if (id !== undefined) touchedAt.delete(id); } };
const touchedSince = (jobId: string, since: number): boolean => (touchedAt.get(jobId) ?? 0) > since;
const sessionIdsOf = (byId: ReadonlyMap<string, TrackedShell>, previous: ReadonlySet<string>): ReadonlySet<string> => {
  const next = new Set<string>(); for (const shell of byId.values()) next.add(shell.sessionId);
  return next.size === previous.size && [...next].every((id) => previous.has(id)) ? previous : next;
};
const sameShell = (left: TrackedShell | undefined, right: TrackedShell): boolean => left !== undefined && left.directory === right.directory && left.jobId === right.jobId && left.sessionId === right.sessionId && left.epoch === right.epoch && left.workerGeneration === right.workerGeneration && left.workspaceId === right.workspaceId && left.projectId === right.projectId && left.command === right.command && left.background === right.background && left.startedAt === right.startedAt && left.outputCursor === right.outputCursor && left.caption === right.caption && left.intent === right.intent && JSON.stringify(left.widget) === JSON.stringify(right.widget) && JSON.stringify(left.streams) === JSON.stringify(right.streams);
const sameIdentity = (left: ShellJobIdentity, right: ShellJobIdentity): boolean => left.sessionId === right.sessionId && left.jobId === right.jobId && left.epoch === right.epoch && left.workerGeneration === right.workerGeneration;
const shouldIgnoreRunning = (existing: TrackedShell | undefined, ended: EndedShell | undefined, next: RunningShell): boolean => {
  if (ended && sameIdentity(ended, next)) return true;
  return existing !== undefined && sameIdentity(existing, next) && compareCounters(next.outputCursor, existing.outputCursor) < 0;
};
const withEnded = (ended: ReadonlyMap<string, EndedShell>, added: readonly EndedShell[]): ReadonlyMap<string, EndedShell> => {
  const next = new Map(ended); for (const shell of added) { const key = keyFor(shell); next.delete(key); next.set(key, shell); }
  while (next.size > ENDED_SHELLS_MAX) { const id = next.keys().next().value; if (id === undefined) break; next.delete(id); }
  return next;
};
const publish = (byId: Map<string, TrackedShell>, ended: ReadonlyMap<string, EndedShell> | null): void => {
  const state = useBackgroundShellsStore.getState(); useBackgroundShellsStore.setState({ byId, sessionIds: sessionIdsOf(byId, state.sessionIds), ended: ended ?? state.ended });
};
export const applyBackgroundShellEvents = (rawDirectory: string, payloads: readonly CanonicalEvent[]): void => {
  const directory = normalizePath(rawDirectory);
  if (!directory) return;
  let draft: Map<string, TrackedShell> | null = null;
  const ended = new Map<string, EndedShell>();
  const current = (): ReadonlyMap<string, TrackedShell> => draft ?? useBackgroundShellsStore.getState().byId;
  for (const event of payloads) {
    if (event.type !== 'shell.updated') continue;
    const job = event.job;
    const key = keyFor(job);
    touch(key);
    const tracked = current().get(key);
    if (job.status === 'running') {
      if (shouldIgnoreRunning(tracked, ended.get(key) ?? useBackgroundShellsStore.getState().ended.get(key), job)) continue;
      const shell: TrackedShell = { ...job, directory };
      if (sameShell(tracked, shell)) continue;
      draft ??= new Map(current());
      draft.set(key, shell);
      continue;
    }
    if (tracked && !sameIdentity(tracked, job)) continue;
    draft ??= new Map(current());
    draft.delete(key);
    ended.set(key, { ...job, directory: tracked?.directory ?? directory });
  }
  if (draft) publish(draft, ended.size ? withEnded(useBackgroundShellsStore.getState().ended, [...ended.values()]) : null);
};
export const replaceDirectoryShells = (rawDirectory: string, input: ShellSnapshot, since: number): void => {
  const directory = normalizePath(rawDirectory);
  if (!directory) return;
  const scope = JSON.stringify(input.scope);
  const previous = snapshotByDirectory.get(directory);
  if (previous?.scope === scope && previous.epoch === input.epoch && compareCounters(input.revision, previous.revision) < 0) return;
  snapshotByDirectory.set(directory, { scope, epoch: input.epoch, revision: input.revision });
  const jobs: ShellJob[] = [...input.running, ...input.ended];
  const state = useBackgroundShellsStore.getState();
  let draft: Map<string, TrackedShell> | null = null;
  const ended: EndedShell[] = [];
  const incomingIds = new Set(jobs.map(keyFor));
  for (const job of jobs) {
    const key = keyFor(job);
    if (touchedSince(key, since)) continue;
    const current = (draft ?? state.byId).get(key);
    if (job.status === 'running') {
      if (shouldIgnoreRunning(current, state.ended.get(key), job)) continue;
      const shell: TrackedShell = { ...job, directory };
      if (sameShell(current, shell)) continue;
      draft ??= new Map(state.byId);
      draft.set(key, shell);
      continue;
    }
    if (current && !sameIdentity(current, job)) continue;
    draft ??= new Map(state.byId);
    draft.delete(key);
    ended.push({ ...job, directory: current?.directory ?? directory });
  }
  for (const [jobId, shell] of state.byId) {
    if (shell.directory !== directory || incomingIds.has(jobId) || touchedSince(jobId, since)) continue;
    draft ??= new Map(state.byId);
    draft.delete(jobId);
  }
  let priorEnded: Map<string, EndedShell> | null = null;
  for (const [key, shell] of state.ended) {
    if (shell.directory !== directory || shell.epoch === input.epoch || touchedSince(key, since)) continue;
    priorEnded ??= new Map(state.ended);
    priorEnded.delete(key);
  }
  if (draft || ended.length || priorEnded) publish(draft ?? new Map(state.byId), ended.length ? withEnded(priorEnded ?? state.ended, ended) : priorEnded);
};
export const backgroundShellRevision = (): number => revision;
export const refreshBackgroundShells = async (rawDirectory: string, listShells: (directory: string) => Promise<ShellSnapshot>): Promise<void> => {
  const directory = normalizePath(rawDirectory);
  if (!directory) return;
  const startedGeneration = generation;
  const since = revision;
  const request = {};
  latestRefreshByDirectory.set(directory, request);
  pendingRefreshes += 1;
  try {
    const snapshot = await listShells(directory);
    if (startedGeneration !== generation || latestRefreshByDirectory.get(directory) !== request) return;
    replaceDirectoryShells(directory, snapshot, since);
  } finally {
    if (startedGeneration === generation) {
      if (latestRefreshByDirectory.get(directory) === request) latestRefreshByDirectory.delete(directory);
      pendingRefreshes -= 1;
      if (pendingRefreshes === 0) while (touchedAt.size > MAX_TOUCHED) {
        const key = touchedAt.keys().next().value;
        if (key === undefined) break;
        touchedAt.delete(key);
      }
    }
  }
};
export const directoriesWithRunningShells = (): string[] => [...new Set([...useBackgroundShellsStore.getState().byId.values()].map((shell) => shell.directory))];
export const hasRunningShell = (sessionId: string): boolean => useBackgroundShellsStore.getState().sessionIds.has(sessionId);
export const resetBackgroundShells = (): void => { generation += 1; revision = 0; pendingRefreshes = 0; touchedAt.clear(); snapshotByDirectory.clear(); latestRefreshByDirectory.clear(); useBackgroundShellsStore.setState({ byId: new Map(), sessionIds: EMPTY_SESSION_IDS, ended: new Map() }); };
export const sessionsInTree = (sessionIds: Iterable<string>, rootId: string, parentOf: (sessionId: string) => string | undefined): string[] => {
  const result: string[] = [];
  for (const sessionId of sessionIds) { const seen = new Set<string>(); let current: string | undefined = sessionId; while (current && !seen.has(current)) { if (current === rootId) { result.push(sessionId); break; } seen.add(current); current = parentOf(current); } }
  return result.sort();
};
export const backgroundShellsOfSessions = (byId: ReadonlyMap<string, TrackedShell>, sessionIds: ReadonlySet<string>): TrackedShell[] => [...byId.values()].filter((shell) => shell.background && sessionIds.has(shell.sessionId)).sort((left, right) => left.startedAt - right.startedAt || left.jobId.localeCompare(right.jobId));

const settleWaiters = new Map<string, SettleWaiter>();

export const waitForShellSettle = (shellID: string, timeoutMs: number): ShellSettleWait => {
  settleWaiters.get(shellID)?.reject(new Error('Replaced by a newer wait for the same command.'));
  let cancel = (): void => {};
  const settled = new Promise<SettleOutcome>((resolve, reject) => {
    const finish = (settle: () => void) => {
      clearTimeout(timer);
      if (settleWaiters.get(shellID) === waiter) settleWaiters.delete(shellID);
      settle();
    };
    const waiter: SettleWaiter = {
      resolve: (outcome) => finish(() => resolve(outcome)),
      reject: (error) => finish(() => reject(error)),
    };
    const timer = setTimeout(() => waiter.reject(new Error('The command did not move to the background in time.')), timeoutMs);
    settleWaiters.set(shellID, waiter);
    cancel = () => waiter.reject(new Error('Cancelled.'));
  });
  return { settled, cancel };
};

export const useRunningShell = (shellID: string | undefined): TrackedShell | undefined => (
  useBackgroundShellsStore(useCallback((state) => (shellID ? state.byId.get(shellID) : undefined), [shellID]))
);
