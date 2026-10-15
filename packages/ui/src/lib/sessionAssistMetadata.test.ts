import { describe, expect, test } from 'bun:test';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { getCurrentSessionAssist } from './sessionAssistMetadata';

const session = (updatedAt: number, assist: { forMessageID: string; recap: string; suggestion: string; generatedAt: number }): Session => ({
  sessionId: 'ses_1', projectId: 'prj', workspaceId: 'ws', displayPath: 'repo', rootSessionId: 'ses_1',
  createdAt: 1, updatedAt, epoch: 'e', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: { openchamber: { assist } } satisfies SessionMetadata, metadataRevision: '1', archiveRevision: '0',
});

describe('getCurrentSessionAssist', () => {
  test('returns the assist generated after the last turn ended', () => {
    expect(getCurrentSessionAssist(session(200, { forMessageID: 'msg_1', recap: 'r', suggestion: 'Run the tests', generatedAt: 160 }))?.suggestion)
      .toBe('Run the tests');
  });

  test('a later turn retires it', () => {
    expect(getCurrentSessionAssist(session(300, { forMessageID: 'msg_1', recap: 'r', suggestion: 'Run the tests', generatedAt: 160 })))
      .toBeNull();
  });

  test('a recap alone is still an assist', () => {
    expect(getCurrentSessionAssist(session(200, { forMessageID: 'msg_1', recap: 'r', suggestion: '', generatedAt: 160 }))?.recap)
      .toBe('r');
  });

  test('an assist generated at the session update timestamp remains current', () => {
    expect(getCurrentSessionAssist(session(200, { forMessageID: 'msg_1', recap: 'r', suggestion: 'Run the tests', generatedAt: 200 }))?.suggestion).toBe('Run the tests');
  });
});
