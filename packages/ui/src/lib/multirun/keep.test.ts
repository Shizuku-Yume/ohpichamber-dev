import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import * as runtime from '@/lib/runtime-switch';
import * as worktrees from '@/lib/worktrees/worktreeManager';
import * as git from '@/lib/gitApi';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { withMultiRunMembership } from './identity';
import { keepRunMember } from './keep';
import { buildMultiRunIndex } from './runs';

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
function sessionFixture(sessionId: string): Session {
  const session: Session = { sessionId, rootSessionId: sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.',
    createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    metadata: {}, metadataRevision: '1', archiveRevision: '0' };
  session.metadata = withMultiRunMembership(session, { version: 1, sessionID: sessionId, group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' }, groupSlug: 'run', role: 'run', providerID: 'provider', modelID: 'model' });
  return session;
}
function fixture() {
  resetWorkspaceDirectories();
  registerWorkspaceDirectory('workspace', '/repo');
  useProjectsStore.setState({ projects: [{ id: 'project', path: '/repo' }] });
  const sessions = ['a', 'b', 'c'].map(sessionFixture);
  const run = [...buildMultiRunIndex(sessions, (session) => session.projectId).runs.values()][0];
  const archive = spyOn(useSessionUIStore.getState(), 'archiveSessions').mockImplementation(async (ids) => ({ archivedIds: ids, failedIds: [] }));
  const remove = spyOn(worktrees, 'removeProjectWorktree');
  spies.push(archive, remove);
  return { sessions, run, archive, remove, sessionById: new Map(sessions.map((session) => [session.sessionId, session])) };
}

describe('canonical keep member cleanup', () => {
  test('failed authoritative member read is isolated and project root is never removed', async () => {
    const api = fixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions, errors: { b: 'read_failed' } }));
    expect(await keepRunMember(api.run, 'a', api.sessionById)).toEqual({ keptSessionId: 'a', archivedIds: ['c'], failures: [{ sessionId: 'b', reason: 'membership-changed' }] });
    expect(api.archive.mock.calls.map(([ids]) => ids)).toEqual([['c']]);
    expect(api.remove.mock.calls.length).toBe(0);
  });
  test('runtime switch after discovery prevents archive and removal', async () => {
    const api = fixture();
    let key = 'first';
    spies.push(spyOn(runtime, 'getRuntimeKey').mockImplementation(() => key));
    spies.push(spyOn(canonicalClient, 'listSessions').mockImplementation(async () => { key = 'next'; return { items: api.sessions, errors: {} }; }));
    await expect(keepRunMember(api.run, 'a', api.sessionById)).rejects.toThrow('Runtime changed');
    expect(api.archive.mock.calls.length).toBe(0);
    expect(api.remove.mock.calls.length).toBe(0);
  });
  test('changed archived membership retains its worktree and still cleans a sibling', async () => {
    const api = fixture();
    const member = api.sessions[1];
    member.workspaceId = 'worktree-workspace';
    registerWorkspaceDirectory(member.workspaceId, '/worktree');
    spies.push(spyOn(useSessionUIStore.getState(), 'getWorktreeMetadata').mockImplementation((sessionId) => sessionId === 'b'
      ? { path: '/worktree', projectDirectory: '/repo', branch: 'lane', label: 'lane' } : undefined));
    spies.push(spyOn(git, 'snapshotGitWorktree').mockResolvedValue({ head: 'head', commit: 'snapshot', ref: 'ref' }));
    spies.push(spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ projectId: 'project', workspaceId: member.workspaceId, name: 'lane' }));
    let worktreeReads = 0;
    spies.push(spyOn(canonicalClient, 'listSessions').mockImplementation(async (workspaceId) => ({
      items: workspaceId === member.workspaceId ? [++worktreeReads === 1 ? member : { ...member, archivedAt: 2, metadata: null }] : api.sessions.filter((session) => session.workspaceId === workspaceId), errors: {},
    })));
    expect(await keepRunMember(api.run, 'a', api.sessionById)).toEqual({ keptSessionId: 'a', archivedIds: ['b', 'c'], failures: [{ sessionId: 'b', reason: 'membership-changed' }] });
    expect(api.remove.mock.calls.length).toBe(0);
  });
});
