import { afterEach, describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { withSessionsNowInWorktree } from './worktreeUse';

const session = (sessionId: string, workspaceId: string): Session => ({
  sessionId, projectId: 'project', workspaceId, displayPath: 'session',
  rootSessionId: sessionId, createdAt: 1, updatedAt: 1, epoch: 'epoch_1', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
});

afterEach(() => resetWorkspaceDirectories());

describe('withSessionsNowInWorktree', () => {
  test('keeps the first attempt\'s sessions and adds the ones started in the worktree since, once each', () => {
    registerWorkspaceDirectory('ws_feature', '/repo-feature');
    registerWorkspaceDirectory('ws_subdir', '/repo-feature/packages/app');
    registerWorkspaceDirectory('ws_root', '/repo');
    useGlobalSessionsStore.setState({
      activeSessions: [
        session('ses_first', 'ws_feature'),
        session('ses_later', 'ws_subdir'),
        session('ses_elsewhere', 'ws_root'),
      ],
    });

    expect(withSessionsNowInWorktree(['ses_first', 'ses_gone'], '/repo-feature')).toEqual(['ses_first', 'ses_gone', 'ses_later']);
  });
});
