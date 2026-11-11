import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { sessionTabScopeFor, sessionTabSeedFor } from './sessionTabScope';

const session = (sessionId: string, extra: Partial<Session> = {}): Session => ({
  sessionId, projectId: 'project', workspaceId: sessionId === 'elsewhere' ? 'ws_repo' : 'ws_wt',
  displayPath: sessionId === 'elsewhere' ? '/repo' : '/wt',
  rootSessionId: sessionId, createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
  ...extra,
});

describe('session tab scopes', () => {
  test('a scope is the folder of one instance', () => {
    expect(sessionTabScopeFor('local', '/repo/')).toBe('local|/repo');
    expect(sessionTabScopeFor('remote', '/repo')).toBe('remote|/repo');
    expect(sessionTabScopeFor('local', null)).toBeNull();
  });

  test('a worktree opens with the sessions the user started there, newest first; a project root with none', () => {
    const sessions = [
      session('old', { updatedAt: 10 }),
      session('new', { updatedAt: 20 }),
      session('subagent', { parentSessionId: 'new' }),
      session('archived', { archivedAt: 5 }),
      session('elsewhere', { displayPath: '/repo', workspaceId: 'ws_repo' }),
    ];
    expect(sessionTabSeedFor('/wt', sessions, ['/repo'])).toEqual(['new', 'old']);
    expect(sessionTabSeedFor('/repo', sessions, ['/repo'])).toEqual([]);
    expect(sessionTabSeedFor(null, sessions, ['/repo'])).toEqual([]);
  });
});
