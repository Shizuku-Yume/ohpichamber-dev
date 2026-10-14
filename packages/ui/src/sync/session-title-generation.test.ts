import { describe, expect, test } from 'bun:test';
import type { Session, SessionMetadataState } from '@openchamber/agent-contract';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { deferred } from './session-message-loader-test-fixtures';
import { cancelSessionTitleGeneration, generateAndSaveSessionTitle, runSessionTitleGeneration, type NativeTitleContext } from './session-title-generation';
const session: Session = { sessionId: 'session_1', projectId: 'project_1', workspaceId: 'workspace_1', displayPath: 'repo', rootSessionId: 'session_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '2', runtimeStatus: 'idle', activeRunId: null, metadata: { title: 'Before' }, metadataRevision: '1', archiveRevision: '0' };
const metadata: SessionMetadataState = { sessionId: session.sessionId, revision: '1', metadata: session.metadata };
const prepared: NativeTitleContext = { session, metadata, turns: [{ user: { messageId: 'user_1', sessionId: session.sessionId, turnId: 'turn_1', role: 'user', createdAt: 1, parts: [{ type: 'text', partId: 'user_text', content: 'Question' }] }, assistant: { messageId: 'assistant_1', sessionId: session.sessionId, turnId: 'turn_1', role: 'assistant', createdAt: 2, parts: [{ type: 'text', partId: 'assistant_text', content: 'Answer' }] } }] };
describe('native title save guards', () => {
  test('saves against unchanged canonical execution and metadata identity', async () => {
    const saved: string[] = [];
    await generateAndSaveSessionTitle({ signal: new AbortController().signal, prepare: async () => prepared, generate: async () => 'Generated', readSession: async () => ({ session, metadata }), saveTitle: async (title) => { saved.push(title); } });
    expect(saved).toEqual(['Generated']);
  });
  test('epoch, sequence, archive, and metadata changes invalidate generated work', async () => {
    const cases = [
      { session: { ...session, epoch: 'epoch_2' }, metadata },
      { session: { ...session, headSequence: '3' }, metadata },
      { session: { ...session, archivedAt: 3, archiveRevision: '1' }, metadata },
      { session, metadata: { ...metadata, revision: '2', metadata: { title: 'Manual' } } },
      { session, metadata: { ...metadata, sessionId: 'other' } },
      { session: { ...session, sessionId: 'other' }, metadata },
      { session: { ...session, updatedAt: 3 }, metadata },
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
  test('rejects failed preparation and empty completed-turn context without generating or saving', async () => {
    for (const prepare of [
      async (): Promise<NativeTitleContext> => { throw new Error('history unavailable'); },
      async () => ({ ...prepared, turns: [] }),
      async () => ({ ...prepared, metadata: { ...metadata, sessionId: 'another' } }),
    ]) {
      let generations = 0;
      let saves = 0;
      await expect(generateAndSaveSessionTitle({ signal: new AbortController().signal, prepare, generate: async () => { generations += 1; return 'Generated'; }, readSession: async () => ({ session, metadata }), saveTitle: async () => { saves += 1; } })).rejects.toThrow();
      expect(generations).toBe(0);
      expect(saves).toBe(0);
    }
  });
  test('propagates generation and save failures instead of claiming success', async () => {
    const failed = async (): Promise<string> => { throw new Error('generation unavailable'); };
    await expect(generateAndSaveSessionTitle({ signal: new AbortController().signal, prepare: async () => prepared, generate: failed, readSession: async () => ({ session, metadata }), saveTitle: async () => {} })).rejects.toThrow('generation unavailable');
    await expect(generateAndSaveSessionTitle({ signal: new AbortController().signal, prepare: async () => prepared, generate: async () => 'Generated', readSession: async () => ({ session, metadata }), saveTitle: async () => { throw new Error('metadata unavailable'); } })).rejects.toThrow('metadata unavailable');
  });
});

describe('native title operation ownership', () => {
  test('deduplicates the same normalized target and releases ownership after completion', async () => {
    const target = { runtimeKey: getRuntimeKey(), directory: '/repo', sessionId: session.sessionId };
    const gate = deferred<void>();
    let calls = 0;
    const pending = runSessionTitleGeneration(target, async () => { calls += 1; await gate.promise; });
    try {
      await runSessionTitleGeneration({ ...target, directory: '/repo/' }, async () => { calls += 1; });
      expect(calls).toBe(1);
    } finally { gate.resolve(); await pending; }
    await runSessionTitleGeneration(target, async () => { calls += 1; });
    expect(calls).toBe(2);
  });
  test('manual cancellation is scoped to the target session and runtime', async () => {
    const target = { runtimeKey: getRuntimeKey(), directory: '/repo', sessionId: session.sessionId };
    const gate = deferred<void>();
    const signals: AbortSignal[] = [];
    const pending = runSessionTitleGeneration(target, async current => { signals.push(current); await gate.promise; current.throwIfAborted(); });
    try {
      cancelSessionTitleGeneration(target.sessionId, `${target.runtimeKey}-obsolete`);
      expect(signals[0]?.aborted).toBe(false);
      cancelSessionTitleGeneration('another', target.runtimeKey);
      expect(signals[0]?.aborted).toBe(false);
      cancelSessionTitleGeneration(target.sessionId, target.runtimeKey);
      expect(signals[0]?.aborted).toBe(true);
    } finally { gate.resolve(); await pending; }
    let restarted = false;
    await runSessionTitleGeneration(target, async () => { restarted = true; });
    expect(restarted).toBe(true);
  });
  test('failed operations release ownership and stale runtimes never start work', async () => {
    const target = { runtimeKey: getRuntimeKey(), directory: '/repo', sessionId: session.sessionId };
    await expect(runSessionTitleGeneration(target, async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    let calls = 0;
    await runSessionTitleGeneration(target, async () => { calls += 1; });
    await runSessionTitleGeneration({ ...target, runtimeKey: `${target.runtimeKey}-obsolete` }, async () => { calls += 1; });
    expect(calls).toBe(1);
  });
});
