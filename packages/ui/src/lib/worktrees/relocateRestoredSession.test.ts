import { describe, expect, mock, test } from 'bun:test';
mock.module('@/stores/useGlobalSessionsStore', () => ({
  resolveGlobalSessionDirectory: () => null,
  useGlobalSessionsStore: () => undefined,
}));
import type { Session } from '@openchamber/agent-contract';
import { relocateRestoredSessionIfDirectoryMissing } from './relocateRestoredSession';

const WORKTREE = '/worktrees/feature';
const PROJECT = '/projects/app';

const session = (sessionId: string, overrides: Partial<Session> = {}): Session => ({
  sessionId,
  projectId: 'app',
  workspaceId: 'workspace',
  displayPath: WORKTREE,
  rootSessionId: 'root',
  createdAt: 1,
  updatedAt: 1,
  epoch: 'epoch-1',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' as const },
  title: sessionId, metadata: {},
  metadataRevision: '1',
  archiveRevision: '0',
  ...overrides,
});

const setup = (options: {
  sessions: Session[];
  availability: Record<string, 'available' | 'missing' | 'unknown'>;
  projectRoot?: string | null;
  directory?: string | null;
  directories?: Record<string, string>;
  failMove?: boolean;
}) => {
  const moves: Array<{ sessionId: string; from: string; to: string }> = [];
  const byId = new Map(options.sessions.map((entry) => [entry.sessionId, entry]));
  return {
    moves,
    deps: {
      getSession: (sessionId: string) => byId.get(sessionId),
      getActiveSessions: () => options.sessions,
      resolveSessionDirectory: (entry: Session) => options.directory === undefined ? options.directories?.[entry.sessionId] ?? WORKTREE : options.directory,
      getDirectoryAvailability: async (directory: string) => options.availability[directory] ?? 'unknown',
      resolveProjectRoot: () => (options.projectRoot === undefined ? PROJECT : options.projectRoot),
      moveSession: async (moved: Session, from: string, to: string) => {
        if (options.failMove) throw new Error('move rejected');
        moves.push({ sessionId: moved.sessionId, from, to });
      },
    },
  };
};

describe('relocateRestoredSessionIfDirectoryMissing', () => {
  test('a restored workspace uses its admitted directory, not its relative display path', async () => {
    const { deps, moves } = setup({
      sessions: [session('root', { displayPath: '../worktrees/feature' })],
      availability: { '../worktrees/feature': 'missing', [WORKTREE]: 'available', [PROJECT]: 'available' },
    });
    expect(await relocateRestoredSessionIfDirectoryMissing('root', deps)).toEqual({ outcome: 'kept' });
    expect(moves).toEqual([]);
  });

  test('an unregistered workspace is not relocated using its display path', async () => {
    const { deps, moves } = setup({ sessions: [session('root')], directory: null, availability: { [WORKTREE]: 'missing', [PROJECT]: 'available' } });
    expect(await relocateRestoredSessionIfDirectoryMissing('root', deps)).toEqual({ outcome: 'kept' });
    expect(moves).toEqual([]);
  });

  test('a session whose folder still exists stays where it is', async () => {
    const { deps, moves } = setup({ sessions: [session('root')], availability: { [WORKTREE]: 'available', [PROJECT]: 'available' } });
    expect(await relocateRestoredSessionIfDirectoryMissing('root', deps)).toEqual({ outcome: 'kept' });
    expect(moves).toEqual([]);
  });

  test('an unknown answer is not proof the folder is gone', async () => {
    const { deps, moves } = setup({ sessions: [session('root')], availability: { [PROJECT]: 'available' } });
    expect(await relocateRestoredSessionIfDirectoryMissing('root', deps)).toEqual({ outcome: 'kept' });
    expect(moves).toEqual([]);
  });

  test('moves the session and its subsessions in that folder to the project root, deepest first', async () => {
    const sessions = [
      session('root'),
      session('child', { parentSessionId: 'root', rootSessionId: 'root' }),
      session('grandchild', { parentSessionId: 'child', rootSessionId: 'root' }),
      session('elsewhere', { parentSessionId: 'root', rootSessionId: 'root', displayPath: '/other' }),
    ];
    const { deps, moves } = setup({ sessions, directories: { elsewhere: '/other' }, availability: { [WORKTREE]: 'missing', [PROJECT]: 'available' } });
    expect(await relocateRestoredSessionIfDirectoryMissing('root', deps)).toEqual({ outcome: 'moved', projectRoot: PROJECT });
    expect(moves).toEqual([
      { sessionId: 'grandchild', from: WORKTREE, to: PROJECT },
      { sessionId: 'child', from: WORKTREE, to: PROJECT },
      { sessionId: 'root', from: WORKTREE, to: PROJECT },
    ]);
  });

  test('without a known, existing project root nothing moves', async () => {
    const noProject = setup({ sessions: [session('root')], availability: { [WORKTREE]: 'missing' }, projectRoot: null });
    expect(await relocateRestoredSessionIfDirectoryMissing('root', noProject.deps)).toEqual({ outcome: 'kept' });

    const goneProject = setup({ sessions: [session('root')], availability: { [WORKTREE]: 'missing', [PROJECT]: 'missing' } });
    expect(await relocateRestoredSessionIfDirectoryMissing('root', goneProject.deps)).toEqual({ outcome: 'kept' });
    expect([...noProject.moves, ...goneProject.moves]).toEqual([]);
  });

  test('a rejected move is reported, not swallowed', async () => {
    const { deps } = setup({ sessions: [session('root')], availability: { [WORKTREE]: 'missing', [PROJECT]: 'available' }, failMove: true });
    const result = await relocateRestoredSessionIfDirectoryMissing('root', deps);
    expect(result.outcome).toBe('failed');
  });
});
