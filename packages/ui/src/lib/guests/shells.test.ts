import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { GUEST_SHELLS_MAX, HostRequestError } from '@openchamber/sdk';
import type { Session } from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useBackgroundShellsStore, type EndedShell, type TrackedShell } from '@/sync/background-shells';
import { observeGuestShells, readGuestShellOutput, readGuestShells } from './shells';

const session = (sessionId: string, displayPath: string, projectId: string, workspaceId: string, parentSessionId?: string): Session => {
  const value: Session = {
    sessionId, projectId, workspaceId, displayPath, rootSessionId: parentSessionId ? 'root' : sessionId,
    createdAt: 1, updatedAt: 1, epoch: 'epoch-1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    metadata: { title: sessionId }, metadataRevision: '1', archiveRevision: '0',
  };
  return parentSessionId ? { ...value, parentSessionId } : value;
};
const shell = (jobId: string, sessionId: string, startedAt: number, background: boolean, directory: string): TrackedShell => ({
  jobId, sessionId, epoch: 'epoch-1', workerGeneration: 'worker-1', workspaceId: 'workspace-opencode-app', projectId: 'opencode-app',
  command: `run ${jobId}`, startedAt, outputCursor: '0', status: 'running', directory, background,
});
const ended = (jobId: string, sessionId: string, reason: 'exit' | 'stopped' | 'timeout', endedAt: number, exitCode: number | null = null, directory = '/repo'): EndedShell => ({
  ...shell(jobId, sessionId, 1, true, directory), status: 'ended', endedAt,
  termination: reason === 'exit' ? { reason, exitCode: exitCode ?? 0 } : { reason, exitCode },
});

beforeEach(() => {
  resetWorkspaceDirectories();
  useProjectsStore.setState({ hasServerSnapshot: true, serverSnapshotFailed: false, projects: [{ id: 'path_/repo', path: '/repo', label: 'Repo', addedAt: 1 }] });
  useSessionUIStore.setState({ availableWorktreesByProject: new Map([['/repo', [{ path: '/repo-tree', projectDirectory: '/repo', branch: 'fix', name: 'fix', label: 'fix', worktreeStatus: 'ready' }]]]) });
  registerWorkspaceDirectory('ws-repo', '/repo');
  registerWorkspaceDirectory('ws-tree', '/repo-tree');
  registerWorkspaceDirectory('ws-other', '/other');
  useGlobalSessionsStore.getState().applySnapshot([
    session('root', '.', 'pro_app', 'ws-repo'),
    session('child', '.', 'pro_app', 'ws-repo', 'root'),
    session('grandchild', '.', 'pro_app', 'ws-repo', 'child'),
    session('tree', 'fix', 'pro_app', 'ws-tree'),
    session('other', '.', 'pro_other', 'ws-other'),
  ], [], 'ready');
  useBackgroundShellsStore.setState({
    byId: new Map([
      ['sh_1', shell('sh_1', 'root', 2, true, '/repo')],
      ['sh_2', shell('sh_2', 'child', 1, true, '/repo')],
      ['sh_3', shell('sh_3', 'other', 3, true, '/other')],
      ['sh_4', shell('sh_4', 'root', 4, false, '/repo')],
      ['sh_5', shell('sh_5', 'ghost', 5, true, '/ghost')],
      ['sh_6', shell('sh_6', 'tree', 6, true, '/repo-tree')],
    ]),
    sessionIds: new Set(['root', 'child', 'tree', 'other', 'ghost']),
    ended: new Map([
      ['sh_done', ended('sh_done', 'grandchild', 'exit', 20, 1, '/repo')],
      ['sh_stopped', ended('sh_stopped', 'root', 'stopped', 10, null, '/repo')],
      ['sh_elsewhere', ended('sh_elsewhere', 'other', 'timeout', 30, null, '/other')],
    ]),
  });
});

describe('ended shells in the projection', () => {
  test('a session scope lists its tree\'s ended shells oldest end first', () => {
    const snapshot = readGuestShells({ kind: 'session', sessionId: 'root' });
    expect(snapshot.ended.map((entry) => [entry.id, entry.sessionID, entry.endedAt])).toEqual([
      ['sh_stopped', 'root', 10], ['sh_done', 'grandchild', 20],
    ]);
  });

  test('keeps the newest ends at the documented bound', () => {
    const many = new Map<string, EndedShell>();
    for (let index = 0; index < GUEST_SHELLS_MAX + 10; index += 1) {
      many.set(`sh_${index}`, ended(`sh_${index}`, 'root', 'exit', Math.max(1, index), index));
    }
    useBackgroundShellsStore.setState({ ended: many });
    const snapshot = readGuestShells({ kind: 'global' });
    expect(snapshot.ended).toHaveLength(GUEST_SHELLS_MAX);
    expect(snapshot.ended[0]?.id).toBe('sh_10');
  });
});

/** The host error code a read failed with, or the error's name for any other failure. */
const failureOf = async (read: Promise<unknown>): Promise<string> => {
  try {
    await read;
    return 'resolved';
  } catch (error) {
    if (error instanceof HostRequestError) return error.code;
    return error instanceof Error ? error.name : 'non-error';
  }
};

describe('extension shell output', () => {
  test('reads a running or ended shell with its canonical identity and cursor', async () => {
    const identity = { jobId: 'sh_done', sessionId: 'grandchild', epoch: 'epoch-1', workerGeneration: 'worker-1' };
    const read = spyOn(canonicalClient, 'getShellOutput').mockResolvedValue({ job: identity, requestedCursor: '0', startCursor: '0', cursor: '2', skippedBytes: '0', output: 'ok', ended: true });
    try {
      expect(await readGuestShellOutput('sh_done', undefined, 100)).toEqual({ output: 'ok', cursor: 2, skipped: false });
      expect(read.mock.calls[0]).toEqual(['grandchild', { jobId: 'sh_done', epoch: 'epoch-1', workerGeneration: 'worker-1' }, '0', 100]);
    } finally { read.mockRestore(); }
  });

  test('forwards the caller abort signal to the canonical read', async () => {
    const identity = { jobId: 'sh_done', sessionId: 'grandchild', epoch: 'epoch-1', workerGeneration: 'worker-1' };
    const controller = new AbortController();
    const read = spyOn(canonicalClient, 'getShellOutput').mockResolvedValue({ job: identity, requestedCursor: '0', startCursor: '0', cursor: '2', skippedBytes: '0', output: 'ok', ended: true });
    try {
      await readGuestShellOutput('sh_done', 0, 100, controller.signal);
      expect(read.mock.calls[0]?.[4]).toBe(controller.signal);
    } finally { read.mockRestore(); }
  });

  test('an unseen shell, a stopped one, and dropped output are NOT_FOUND', async () => {
    const read = spyOn(canonicalClient, 'getShellOutput').mockRejectedValue(new CanonicalApiError({
      type: 'urn:ohpichamber:problem:SESSION_NOT_FOUND', title: 'Not found', status: 404, detail: 'gone', code: 'SESSION_NOT_FOUND', retryable: false,
    }));
    try {
      expect(await failureOf(readGuestShellOutput('sh_nope'))).toBe('NOT_FOUND');
      expect(await failureOf(readGuestShellOutput('sh_stopped'))).toBe('NOT_FOUND');
      expect(await failureOf(readGuestShellOutput('sh_done'))).toBe('NOT_FOUND');
      expect(read.mock.calls).toHaveLength(1);
    } finally { read.mockRestore(); }
  });

  test('any other canonical failure is passed on, not reported as missing', async () => {
    const read = spyOn(canonicalClient, 'getShellOutput').mockRejectedValue(new CanonicalApiError({
      type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Unavailable', status: 500, detail: 'boom', code: 'SERVICE_UNAVAILABLE', retryable: true,
    }));
    try {
      expect(await failureOf(readGuestShellOutput('sh_1'))).toBe('CanonicalApiError');
    } finally { read.mockRestore(); }
  });
});

describe('extension shells projection', () => {
  test('a session scope lists the tree oldest first and keeps the background flag', () => {
    const snapshot = readGuestShells({ kind: 'session', sessionId: 'root' });
    expect(snapshot.kind).toBe('shells');
    expect(snapshot.scope).toEqual({ kind: 'session', sessionId: 'root' });
    expect(snapshot.shells.map((entry) => entry.id)).toEqual(['sh_2', 'sh_1', 'sh_4']);
    expect(snapshot.shells.find((entry) => entry.id === 'sh_4')?.background).toBe(false);
  });

  test('a project scope covers the project root and its worktrees, whatever the session project ids are', () => {
    const snapshot = readGuestShells({ kind: 'project', projectId: 'path_/repo' });
    expect(snapshot.scope).toEqual({ kind: 'project', projectId: 'path_/repo' });
    expect(snapshot.shells.map((entry) => entry.id)).toEqual(['sh_2', 'sh_1', 'sh_4', 'sh_6']);
    expect(readGuestShells({ kind: 'project', projectId: 'path_/nope' }).shells).toEqual([]);
    expect(() => observeGuestShells({ kind: 'project', projectId: 'path_/nope' }, () => {})).toThrow();
  });

  test('a project scope follows each shell\'s recorded directory', () => {
    useBackgroundShellsStore.setState((state) => ({
      byId: new Map(state.byId).set('sh_bg', shell('sh_bg', 'other', 7, true, '/repo-tree')),
    }));
    expect(readGuestShells({ kind: 'project', projectId: 'path_/repo' }).shells.map((entry) => entry.id)).toContain('sh_bg');
    expect(readGuestShells({ kind: 'project', projectId: 'path_/repo' }).shells.map((entry) => entry.id)).not.toContain('sh_3');
  });

  test('a global scope lists every shell, including sessions the store does not know', () => {
    expect(readGuestShells({ kind: 'global' }).shells.map((entry) => entry.id)).toEqual(['sh_2', 'sh_1', 'sh_3', 'sh_4', 'sh_5', 'sh_6']);
  });

  test('caps the projection at the documented shell bound', () => {
    const byId = new Map<string, TrackedShell>();
    for (let index = 0; index < GUEST_SHELLS_MAX + 50; index += 1) {
      byId.set(`sh_${index}`, shell(`sh_${index}`, 'root', index, true, '/repo'));
    }
    useBackgroundShellsStore.setState({ byId, sessionIds: new Set(['root']) });
    expect(readGuestShells({ kind: 'session', sessionId: 'root' }).shells).toHaveLength(GUEST_SHELLS_MAX);
  });

  test('observers replay the current snapshot and publish changes', async () => {
    const seen: string[][] = [];
    const stop = observeGuestShells({ kind: 'session', sessionId: 'root' }, (snapshot) => seen.push(snapshot.shells.map((entry) => entry.id)));
    try {
      expect(seen).toEqual([['sh_2', 'sh_1', 'sh_4']]);
      useBackgroundShellsStore.setState((state) => {
        const byId = new Map(state.byId);
        byId.delete('sh_1');
        return { byId, sessionIds: new Set(['root', 'child', 'tree', 'other', 'ghost']) };
      });
      await Promise.resolve();
      expect(seen.at(-1)).toEqual(['sh_2', 'sh_4']);
    } finally {
      stop();
    }
  });

  test('a project observer goes empty when the project leaves the registry', async () => {
    const seen: string[][] = [];
    const stop = observeGuestShells({ kind: 'project', projectId: 'path_/repo' }, (snapshot) => seen.push(snapshot.shells.map((entry) => entry.id)));
    try {
      expect(seen).toEqual([['sh_2', 'sh_1', 'sh_4', 'sh_6']]);
      useProjectsStore.setState({ hasServerSnapshot: true, serverSnapshotFailed: false, projects: [] });
      await Promise.resolve();
      expect(seen.at(-1)).toEqual([]);
    } finally {
      stop();
    }
  });
});
