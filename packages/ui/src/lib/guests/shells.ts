import type { GuestEndedShell, GuestRunningShell, GuestRunningShellsSnapshot, GuestShellOutputResult, GuestShellsScope } from 'ohpichamber-sdk';
import { GUEST_SHELLS_MAX, HostRequestError } from 'ohpichamber-sdk';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { sessionsInTree, useBackgroundShellsStore, type EndedShell, type TrackedShell } from '@/sync/background-shells';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { normalizePath } from '@/lib/pathNormalization';
import { guestProject, guestProjectDirectories } from './workspace';

<<<<<<< HEAD
/**
 * A shell scope resolved to the identity it filters: every shell, the
 * sessions in a tree, or the Host directories of a project and its
 * registered worktrees. A project scope follows each shell's recorded
 * directory, the same set the workspace projection uses for membership.
 */
type ShellScope =
  | { kind: 'all' }
  | { kind: 'sessions'; ids: ReadonlySet<string> }
  | { kind: 'directories'; directories: ReadonlySet<string> };

const scopeShells = (scope: GuestShellsScope): ShellScope => {
  if (scope.kind === 'global') return { kind: 'all' };
  if (scope.kind === 'project') return { kind: 'directories', directories: guestProjectDirectories(scope.projectId) };
||||||| bc50ba56aa
/**
 * The sessions a scope covers, or null for every session. A project scope
 * covers the sessions that run in the project root or one of its worktrees,
 * the same membership the workspace projection reports.
 */
const scopeSessionIds = (scope: GuestShellsScope): ReadonlySet<string> | null => {
  if (scope.kind === 'global') return null;
=======
const scopeSessionIds = (scope: GuestShellsScope): ReadonlySet<string> | null => {
  if (scope.kind === 'global') return null;
>>>>>>> upstream/main
  const sessions = useGlobalSessionsStore.getState().entityById;
  const known = new Set<string>();
  const store = useBackgroundShellsStore.getState();
  for (const shell of store.byId.values()) known.add(shell.sessionId);
  for (const shell of store.ended.values()) known.add(shell.sessionId);
  return { kind: 'sessions', ids: new Set(sessionsInTree(known, scope.sessionId, (id) => sessions.get(id)?.parentSessionId ?? undefined)) };
};

const inShellScope = (scope: ShellScope, shell: { sessionId: string; directory: string }): boolean => {
  if (scope.kind === 'all') return true;
  if (scope.kind === 'sessions') return scope.ids.has(shell.sessionId);
  return scope.directories.has(normalizePath(shell.directory) ?? shell.directory);
};

const guestShell = (shell: Pick<TrackedShell, 'jobId' | 'sessionId' | 'command' | 'startedAt' | 'background'>): GuestRunningShell => ({
  id: shell.jobId, sessionID: shell.sessionId, command: shell.command, startedAt: shell.startedAt, background: shell.background,
});

const guestEndedShell = (shell: EndedShell): GuestEndedShell => {
  const reason = shell.termination.reason;
  const status: GuestEndedShell['status'] = reason === 'exit' ? 'exited' : reason === 'signal' ? 'killed' : reason === 'worker-lost' ? 'unknown' : reason;
  const ended: GuestEndedShell = { ...guestShell(shell), status, endedAt: shell.endedAt };
  if (shell.termination.exitCode !== null) ended.exit = shell.termination.exitCode;
  return ended;
};

export const readGuestShells = (scope: GuestShellsScope): GuestRunningShellsSnapshot => {
  const store = useBackgroundShellsStore.getState();
  const filter = scopeShells(scope);
  const shells: GuestRunningShell[] = [];
  for (const shell of store.byId.values()) {
    if (!inShellScope(filter, shell)) continue;
    shells.push(guestShell(shell));
  }
  shells.sort((left, right) => left.startedAt - right.startedAt || left.id.localeCompare(right.id));
  const ended: GuestEndedShell[] = [];
  for (const shell of store.ended.values()) {
    if (!inShellScope(filter, shell)) continue;
    ended.push(guestEndedShell(shell));
  }
  ended.sort((left, right) => left.endedAt - right.endedAt || left.id.localeCompare(right.id));
  return { kind: 'shells', scope, shells: shells.slice(0, GUEST_SHELLS_MAX), ended: ended.slice(-GUEST_SHELLS_MAX) };
};

<<<<<<< HEAD
/**
 * One page of a command's output, running or ended. OpenCode keeps an ended
 * command's output until it evicts the command (it retains the latest 25 per
 * directory); a stopped command's output goes with it at once.
 */
export const readGuestShellOutput = async (shellId: string, cursor?: number, tailBytes?: number, signal?: AbortSignal): Promise<GuestShellOutputResult> => {
||||||| bc50ba56aa
/**
 * One page of a command's output, running or ended. OpenCode keeps an ended
 * command's output until it evicts the command (it retains the latest 25 per
 * directory); a stopped command's output goes with it at once.
 */
export const readGuestShellOutput = async (shellId: string, cursor?: number, tailBytes?: number): Promise<GuestShellOutputResult> => {
=======
export const readGuestShellOutput = async (shellId: string, cursor?: number, tailBytes?: number): Promise<GuestShellOutputResult> => {
>>>>>>> upstream/main
  const store = useBackgroundShellsStore.getState();
  const shell = [...store.byId.values(), ...store.ended.values()].find((entry) => entry.jobId === shellId);
  if (!shell || ('termination' in shell && shell.termination.reason === 'stopped')) throw new HostRequestError('NOT_FOUND', 'OhPiChamber has not seen that shell.');
  try {
    const result = await canonicalClient.getShellOutput(shell.sessionId, { jobId: shell.jobId, epoch: shell.epoch, workerGeneration: shell.workerGeneration }, String(cursor ?? 0), tailBytes ?? 65536, signal);
    return { cursor: Number(result.cursor), output: result.output, skipped: false };
  } catch (error) {
    if (error instanceof CanonicalApiError && error.problem.status === 404) throw new HostRequestError('NOT_FOUND', 'The host no longer keeps that shell output.');
    throw error;
  }
};

const scopeKey = (scope: GuestShellsScope): string => {
  if (scope.kind === 'session') return `session:${scope.sessionId}`;
  if (scope.kind === 'project') return `project:${scope.projectId}`;
  return 'global';
};

type Observer = { listeners: Set<(snapshot: GuestRunningShellsSnapshot) => void>; snapshot: GuestRunningShellsSnapshot; dispose: () => void };
const observers = new Map<string, Observer>();

export const observeGuestShells = (scope: GuestShellsScope, listener: (snapshot: GuestRunningShellsSnapshot) => void): (() => void) => {
  if (scope.kind === 'project') guestProject(scope.projectId);
  const key = `${getRuntimeKey()}|${scopeKey(scope)}`;
  let observer = observers.get(key);
  if (!observer) {
    const listeners = new Set<(snapshot: GuestRunningShellsSnapshot) => void>();
    const current: Observer = { listeners, snapshot: readGuestShells(scope), dispose: () => {} };
    let queued = false;
    let disposed = false;
    let serialized = JSON.stringify(current.snapshot);
    const update = () => {
      if (queued || disposed) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        if (disposed) return;
        const next = readGuestShells(scope);
        const json = JSON.stringify(next);
        if (json === serialized) return;
        serialized = json;
        current.snapshot = next;
        for (const notify of listeners) notify(next);
      });
    };
    const unsubs = [
      useBackgroundShellsStore.subscribe(update),
      useGlobalSessionsStore.subscribe((state, previous) => { if (state.entityById !== previous.entityById) update(); }),
    ];
    if (scope.kind === 'project') {
      unsubs.push(useProjectsStore.subscribe((state, previous) => {
        if (state.projects !== previous.projects || state.hasServerSnapshot !== previous.hasServerSnapshot) update();
      }));
      unsubs.push(useSessionUIStore.subscribe((state, previous) => {
        if (state.availableWorktreesByProject !== previous.availableWorktreesByProject) update();
      }));
    }
    current.dispose = () => { disposed = true; for (const unsubscribe of unsubs) unsubscribe(); observers.delete(key); };
    unsubs.push(subscribeRuntimeEndpointChanged(current.dispose));
    observers.set(key, current);
    observer = current;
  }
  observer.listeners.add(listener);
  listener(observer.snapshot);
  const current = observer;
  return () => { current.listeners.delete(listener); if (current.listeners.size === 0) current.dispose(); };
};
