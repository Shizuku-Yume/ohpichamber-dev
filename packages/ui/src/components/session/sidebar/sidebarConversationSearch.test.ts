import { expect, test } from 'bun:test';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import type { Session } from '@openchamber/agent-contract';
import { rankConversationMetadata } from '@/lib/search/conversationSearch';
import { resolveSidebarSearchScope, sidebarSearchMetadata } from './sidebarConversationSearch';

test('a Windows chat known by its raw path is found by ID and by title', () => {
  const session: Session = {
    sessionId: 'ses_0000000000aaWindowsChat01',
    projectId: 'chats', workspaceId: 'workspace', rootSessionId: 'ses_0000000000aaWindowsChat01', epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, metadataRevision: '0', archiveRevision: '0', metadata: null,
    displayPath: String.raw`C:\Users\example\.config\openchamber\chats\2026-10-13\session-1a2b3c4d`,
    title: 'Quarterly Notes',
    createdAt: 1, updatedAt: 2,
  };
  registerWorkspaceDirectory('workspace', session.displayPath);
  const scope = resolveSidebarSearchScope({
    projects: [], worktrees: new Map(), knownDirectories: new Set([session.displayPath]), isVSCode: false,
  });
  const metadata = sidebarSearchMetadata({
    sessions: [session], isAdmitted: scope.isAdmitted, owners: new Map(), projects: [], worktrees: new Map(),
  });

  expect(rankConversationMetadata(metadata, session.sessionId).map((match) => match.sessionId)).toEqual([session.sessionId]);
  expect(rankConversationMetadata(metadata, 'Quarterly').map((match) => match.sessionId)).toEqual([session.sessionId]);
});
