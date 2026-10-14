import { describe, expect, test } from 'bun:test';
import type { Session, SessionMetadataState } from '@openchamber/agent-contract';
import { generateAndSaveSessionTitle, type NativeTitleContext } from './session-title-generation';
const session: Session = { sessionId: 'session_1', projectId: 'project_1', workspaceId: 'workspace_1', displayPath: 'repo', rootSessionId: 'session_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '2', runtimeStatus: 'idle', activeRunId: null, metadata: { title: 'Before' }, metadataRevision: '1', archiveRevision: '0' };
const metadata: SessionMetadataState = { sessionId: session.sessionId, revision: '1', metadata: session.metadata };
const prepared: NativeTitleContext = { session, metadata, turns: [{ user: { messageId: 'user_1', sessionId: session.sessionId, turnId: 'turn_1', role: 'user', createdAt: 1, parts: [{ type: 'text', partId: 'user_text', content: 'Question' }] }, assistant: { messageId: 'assistant_1', sessionId: session.sessionId, turnId: 'turn_1', role: 'assistant', createdAt: 2, parts: [{ type: 'text', partId: 'assistant_text', content: 'Answer' }] } }] };
describe('native title save guards', () => {
  test('saves against unchanged canonical execution and metadata identity', async () => {
    const saved: string[] = [];
    await generateAndSaveSessionTitle({ signal: new AbortController().signal, prepare: async () => prepared, generate: async () => 'Generated', readSession: async () => ({ session, metadata }), saveTitle: async (title) => { saved.push(title); } });
    expect(saved).toEqual(['Generated']);
  });
  test('epoch, cursor, archive, and metadata changes invalidate generated work', async () => {
    const cases = [
      { session: { ...session, epoch: 'epoch_2' }, metadata },
      { session: { ...session, headSequence: '3' }, metadata },
      { session: { ...session, archivedAt: 3, archiveRevision: '1' }, metadata },
      { session, metadata: { ...metadata, revision: '2', metadata: { title: 'Manual' } } },
      { session, metadata: { ...metadata, sessionId: 'other' } },
    ];
    for (const current of cases) {
      let saves = 0;
      await generateAndSaveSessionTitle({ signal: new AbortController().signal, prepare: async () => prepared, generate: async () => 'Generated', readSession: async () => current, saveTitle: async () => { saves += 1; } });
      expect(saves).toBe(0);
    }
  });
  test('aborting generation never submits a metadata save', async () => {
    const controller = new AbortController();
    let saves = 0;
    await expect(generateAndSaveSessionTitle({ signal: controller.signal, prepare: async () => prepared, generate: async () => { controller.abort(); return 'Generated'; }, readSession: async () => ({ session, metadata }), saveTitle: async () => { saves += 1; } })).rejects.toThrow();
    expect(saves).toBe(0);
  });
});
