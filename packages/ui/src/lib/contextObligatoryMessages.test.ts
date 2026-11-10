import { describe, expect, test } from 'bun:test';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { getContextObligatoryMessages, withContextObligatoryMessage } from './contextObligatoryMessages';

const sessionWith = (metadata: SessionMetadata): Session => ({
  sessionId: 'session_1', projectId: 'project_1', workspaceId: 'workspace_1', displayPath: 'repo', rootSessionId: 'session_1',
  createdAt: 1, updatedAt: 10, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
  metadata, metadataRevision: '1', archiveRevision: '0',
});

describe('context obligatory metadata', () => {
  test('sorts pinned messages chronologically with deterministic ID ties', () => {
    const session = sessionWith({ openchamber: { context_obligatory_messages: [
      { id: 'message_b', createdAt: 2, role: 'assistant' }, { id: 'message_a', createdAt: 2, role: 'user' }, { id: 'message_c', createdAt: 1, role: 'user' },
    ] } });
    expect(getContextObligatoryMessages(session).map((message) => message.id)).toEqual(['message_c', 'message_a', 'message_b']);
  });

  test('pins and unpins one message without disturbing other metadata', () => {
    const message = { id: 'message_1', createdAt: 1, role: 'user' as const };
    const metadata = withContextObligatoryMessage({ notes: 'Keep' }, message, true);
    expect(metadata).toEqual({ notes: 'Keep', openchamber: { context_obligatory_messages: [message] } });
    expect(withContextObligatoryMessage(metadata, message, false)).toEqual({ notes: 'Keep', openchamber: { context_obligatory_messages: [] } });
  });
});
