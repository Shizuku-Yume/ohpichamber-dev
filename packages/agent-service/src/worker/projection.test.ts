import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import type { AgentSessionEvent } from '@oh-my-pi/pi-coding-agent/session/agent-session-events';
import { SessionJournal } from '../projection/journal.ts';
import { WorkerProjection } from './projection.ts';

type NativeMessage = Extract<AgentSessionEvent, { type: 'message_start' }>['message'];
type Assistant = Extract<NativeMessage, { role: 'assistant' }>;
function assistant(content: Assistant['content'], stopReason: Assistant['stopReason'], timestamp: number): Assistant {
  return { role: 'assistant', content, api: 'openai-completions', provider: 'fixture', model: 'fixture', stopReason, timestamp,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
}

for (const outcome of ['failed', 'cancelled'] as const) {
  test(`native history retains tool terminal state and completed cycles before a ${outcome} run`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'canonical-history-'));
    const manager = SessionManager.create(root, root);
    let reopened: SessionManager | undefined;
    try {
      await manager.ensureOnDisk();
      const projection = new WorkerProjection(manager, 'session');
      const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
      journal.append(projection.beginRun('run', Date.now()));
      let timestamp = Date.now();
      const deliver = (message: NativeMessage): void => {
        journal.append(projection.consume({ type: 'message_start', message }));
        manager.appendMessage(message);
        journal.append(projection.consume({ type: 'message_end', message }));
        projection.bindPending();
      };
      deliver({ role: 'user', content: 'Run a tool, then continue.', timestamp: timestamp++ });
      const call = assistant([{ type: 'toolCall', id: 'call', name: 'bash', arguments: { command: 'printf fixture' } }], 'toolUse', timestamp++);
      deliver(call);
      const result = { role: 'toolResult' as const, toolCallId: 'call', toolName: 'bash', content: [{ type: 'text' as const, text: 'fixture' }], isError: outcome === 'cancelled', timestamp: timestamp++ };
      journal.append(projection.consume({ type: 'tool_execution_end', toolCallId: 'call', toolName: 'bash', result: { content: result.content }, isError: result.isError }));
      deliver(result);
      journal.append(projection.consume({ type: 'turn_end', message: call, toolResults: [result] }));
      const terminal = assistant([{ type: 'text', text: 'Partial continuation' }], outcome === 'failed' ? 'error' : 'aborted', timestamp++);
      deliver(terminal);
      journal.append(outcome === 'failed' ? projection.failRun('Provider failed', Date.now()) : projection.cancelRun(Date.now()));
      projection.bindPending();
      await manager.flush();
      const live = journal.snapshot();
      const history = projection.history({ sessionId: 'session' });
      expect(history.messages.flatMap(message => message.parts).find(part => part.type === 'tool_call')?.status).toBe(result.isError ? 'failed' : 'completed');
      expect(history.turns.map(turn => ({ status: turn.status, finishedAt: turn.finishedAt }))).toEqual(live.turns.map(turn => ({ status: turn.status, finishedAt: turn.finishedAt })));
      const assistantHistory = history.messages.find(message => message.role === 'assistant');
      expect(assistantHistory).toMatchObject({ providerId: 'fixture', modelId: 'fixture', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 } });
      expect(assistantHistory?.usage?.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 });
      const file = manager.getSessionFile();
      if (!file) throw new Error('Native session file is required');
      await manager.close();
      reopened = await SessionManager.open(file, root, undefined, { initialCwd: root, throwIfMissing: true });
      const restored = new WorkerProjection(reopened, 'session').seed();
      expect(restored.turns).toEqual(history.turns);
      expect(restored.messages).toEqual(history.messages);
    } finally {
      await reopened?.close();
      await manager.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('completed native compaction emits opaque canonical transition only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-compaction-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    projection.beginRun('run', Date.now());
    const completed = projection.consume({ type: 'auto_compaction_end', action: 'context-full', result: { summary: 'native summary', firstKeptEntryId: 'native-entry', tokensBefore: 42 }, aborted: false, willRetry: false });
    expect(completed).toHaveLength(1);
    const compacted = completed[0]?.event;
    expect(compacted).toMatchObject({ type: 'session.compacted', tokensBefore: 42, completedAt: expect.any(Number) });
    if (compacted?.type !== 'session.compacted') throw new Error('Compaction event was not emitted');
    expect(compacted.compactionId).toEqual(expect.any(String));
    expect(projection.consume({ type: 'auto_compaction_end', action: 'context-full', result: { summary: 'retry', firstKeptEntryId: 'native-entry', tokensBefore: 40 }, aborted: false, willRetry: true })).toEqual([]);
    expect(projection.consume({ type: 'auto_compaction_end', action: 'context-full', result: undefined, aborted: false, willRetry: false })).toEqual([]);
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});
