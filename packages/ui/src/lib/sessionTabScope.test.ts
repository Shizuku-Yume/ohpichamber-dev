import { afterEach, describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { sessionTabScopeFor, sessionTabSeedFor } from './sessionTabScope';

// Canonical sessions carry a project-relative `displayPath`; the folder a
// session runs in comes from its workspace, bound here the way discovery binds it.
const session = (sessionId: string, workspaceId: string, extra: Partial<Session> = {}): Session => ({
  sessionId, projectId: 'project', workspaceId,
  displayPath: sessionId === 'elsewhere' ? 'repo' : 'wt',
  rootSessionId: sessionId, createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
  ...extra,
});

afterEach(() => resetWorkspaceDirectories());

describe('session tab scopes', () => {
  test('a scope is the folder of one instance', () => {
    expect(sessionTabScopeFor('local', '/repo/')).toBe('local|/repo');
    expect(sessionTabScopeFor('remote', '/repo')).toBe('remote|/repo');
    expect(sessionTabScopeFor('local', null)).toBeNull();
  });

  test('a worktree opens with the sessions the user started there, newest first; a project root with none', () => {
    registerWorkspaceDirectory('ws_wt', '/wt');
    registerWorkspaceDirectory('ws_repo', '/repo');
    const sessions = [
      session('old', 'ws_wt', { updatedAt: 10 }),
      session('new', 'ws_wt', { updatedAt: 20 }),
      session('subagent', 'ws_wt', { parentSessionId: 'new', updatedAt: 30 }),
      session('archived', 'ws_wt', { archivedAt: 5, updatedAt: 40 }),
      session('elsewhere', 'ws_repo', { updatedAt: 50 }),
    ];
    expect(sessionTabSeedFor('/wt', sessions, ['/repo'])).toEqual(['new', 'old']);
    expect(sessionTabSeedFor('/repo', sessions, ['/repo'])).toEqual([]);
    expect(sessionTabSeedFor(null, sessions, ['/repo'])).toEqual([]);
  });

  test('a session whose workspace the client does not know stays out of the seed', () => {
    const orphan = session('orphan', 'ws_unknown', { updatedAt: 99 });
    expect(sessionTabSeedFor('/wt', [orphan], [])).toEqual([]);
  });
});
