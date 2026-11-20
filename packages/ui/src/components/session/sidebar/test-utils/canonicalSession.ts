import type { Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';

export function canonicalSession(sessionId: string, directory = '/repo', overrides: Partial<Session> = {}): Session {
  const workspaceId = overrides.workspaceId ?? `workspace:${directory}`;
  registerWorkspaceDirectory(workspaceId, directory);
  return {
    sessionId, projectId: 'project-a', workspaceId, displayPath: directory,
    rootSessionId: sessionId, title: sessionId, createdAt: 1, updatedAt: 1,
    epoch: 'epoch-a', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    mode: { kind: 'main' }, metadata: null, metadataRevision: '0', archiveRevision: '0',
    ...overrides,
  };
}
