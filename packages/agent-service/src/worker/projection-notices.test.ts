import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssistantMessage } from '@oh-my-pi/pi-ai';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import type { AgentSessionEvent } from '@oh-my-pi/pi-coding-agent/session/agent-session-events';
import { createTodoHudStateData, TODO_HUD_STATE_CUSTOM_TYPE } from '@oh-my-pi/pi-coding-agent/tools/todo';
import type { CompactionNoticePart, NoticePart, TodoPhase } from '@openchamber/agent-contract';
import { SessionJournal } from '../projection/journal.ts';
import { WorkerProjection } from './projection.ts';

const cleanupDirs: string[] = [];
afterEach(async () => {
  await Promise.all(cleanupDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
});

async function createTestManager(): Promise<{ manager: SessionManager; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'omp-projection-notices-'));
  cleanupDirs.push(dir);
  const manager = SessionManager.create(dir, dir);
  await manager.ensureOnDisk();
  return { manager, dir };
}

function user(content: string, timestamp: number) {
  return { role: 'user' as const, content, timestamp };
}

function assistant(
  content: AssistantMessage['content'],
  stopReason: AssistantMessage['stopReason'],
  timestamp: number,
  options?: {
    model?: string;
    upstreamModel?: string;
    usage?: AssistantMessage['usage'];
  },
): AssistantMessage & { upstreamModel?: string } {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'fixture',
    model: options?.model ?? 'gpt-6.1-sol',
    upstreamModel: options?.upstreamModel,
    stopReason,
    timestamp,
    usage: options?.usage ?? {
      input: 10,
      output: 10,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 20,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
}

describe('WorkerProjection notices and compaction integration', () => {
  test('historical blocked snapshots and reminders restore as pending', async () => {
    const { manager } = await createTestManager();
    try {
      manager.appendMessage(user('Historical work', 1000));
      manager.appendCustomEntry('user_todo_edit', { phases: [{ name: 'Work', tasks: [{ content: 'Review', status: 'blocked', blocker: 'Waiting' }] }] });
      manager.appendCustomEntry('ohpichamber.notice.v1', {
        partId: 'legacy-notice', type: 'notice', noticeType: 'todo_reminder', level: 'warning',
        details: { attempt: 1, maxAttempts: 3, todos: [{ content: 'Review', status: 'blocked' }] },
      });
      const seed = new WorkerProjection(manager, manager.getSessionId()).seed();
      expect(seed.todos).toEqual([{ name: 'Work', tasks: [{ content: 'Review', status: 'pending' }] }]);
      expect(JSON.stringify(seed.messages)).toContain('legacy-notice');
      expect(JSON.stringify(seed.messages)).not.toContain('blocked');
    } finally { await manager.close(); }
  });

  test('projects todo_reminder live and survives cold restore from disk', async () => {
    const { manager, dir } = await createTestManager();
    const sessionId = manager.getSessionId();
    const projection = new WorkerProjection(manager, sessionId);

    projection.beginRun('run-1', 1000);
    const userMsg = user('task prompt', 1000);
    manager.appendMessage(userMsg);
    projection.consume({ type: 'message_start', message: userMsg });

    const assistantMsg = assistant([{ type: 'text', text: 'Working on task' }], 'stop', 1001);
    manager.appendMessage(assistantMsg);
    projection.consume({ type: 'message_start', message: assistantMsg });
    projection.consume({ type: 'message_end', message: assistantMsg });
    projection.consume({ type: 'turn_end', message: assistantMsg, toolResults: [] });
    projection.bindPending();

    // Ingest todo_reminder after turn_end
    const reminderEvent: AgentSessionEvent = {
      type: 'todo_reminder',
      attempt: 1,
      maxAttempts: 3,
      todos: [
        { content: 'Verify timeline notice cards', status: 'in_progress' },
        { content: 'Check compaction ratio', status: 'pending' },
      ],
    };

    const outputs = projection.consume(reminderEvent);
    const started = outputs.find(o => o.event.type === 'part.started' && o.event.part.type === 'notice');
    expect(started).toBeDefined();
    if (started?.event.type === 'part.started' && started.event.part.type === 'notice') {
      expect(started.event.part.noticeType).toBe('todo_reminder');
      expect(started.event.part.level).toBe('warning');
      if (started.event.part.noticeType === 'todo_reminder') {
        expect(started.event.part.details.todos).toHaveLength(2);
      }
    }

    await manager.flush();

    // Cold restore from disk via fresh SessionManager & WorkerProjection
    const file = manager.getSessionFile();
    expect(file).toBeDefined();
    const reopened = await SessionManager.open(file!, dir, undefined, { initialCwd: dir, throwIfMissing: true });
    try {
      const restored = new WorkerProjection(reopened, sessionId).seed();
      const assistantMessage = restored.messages.find(m => m.role === 'assistant');
      expect(assistantMessage).toBeDefined();
      const noticeParts = (assistantMessage?.parts.filter(p => p.type === 'notice') ?? []) as NoticePart[];
      expect(noticeParts.some(p => p.noticeType === 'todo_reminder')).toBe(true);
      const reminderPart = noticeParts.find(p => p.noticeType === 'todo_reminder');
      if (reminderPart && reminderPart.noticeType === 'todo_reminder') {
        expect(reminderPart.details.todos).toHaveLength(2);
        expect(reminderPart.details.todos[0]?.content).toBe('Verify timeline notice cards');
      }
    } finally {
      await reopened.close();
    }
  });

  test('pre-message notice buffers live and attaches to first message on disk reload', async () => {
    const { manager, dir } = await createTestManager();
    const sessionId = manager.getSessionId();
    const projection = new WorkerProjection(manager, sessionId);

    projection.beginRun('run-pre', 500);

    // Notice ingested before any message exists
    const preNoticeEvent: AgentSessionEvent = {
      type: 'auto_retry_start',
      attempt: 1,
      maxAttempts: 3,
      delayMs: 1000,
      errorMessage: 'Network blip before first prompt',
    };
    const preOutputs = projection.consume(preNoticeEvent);
    // Buffered: no active message to attach to yet
    expect(preOutputs.filter(o => o.event.type === 'part.started')).toHaveLength(0);

    // First user message arrives
    const userMsg = user('hello', 1000);
    manager.appendMessage(userMsg);
    const startOutputs = projection.consume({ type: 'message_start', message: userMsg });
    // Live flush: pre-message notice is emitted onto the newly admitted message
    const flushedNotice = startOutputs.find(o => o.event.type === 'part.started' && o.event.part.type === 'notice');
    expect(flushedNotice).toBeDefined();

    projection.consume({ type: 'message_end', message: userMsg });
    projection.bindPending();
    await manager.flush();

    // Cold restore from disk: unassociated notice is restored on the first admitted message
    const file = manager.getSessionFile();
    expect(file).toBeDefined();
    const reopened = await SessionManager.open(file!, dir, undefined, { initialCwd: dir, throwIfMissing: true });
    try {
      const restored = new WorkerProjection(reopened, sessionId).seed();
      const firstMessage = restored.messages[0];
      expect(firstMessage).toBeDefined();
      const noticePart = firstMessage?.parts.find((p): p is NoticePart => p.type === 'notice');
      expect(noticePart).toBeDefined();
      if (noticePart && noticePart.type === 'notice') {
        expect(noticePart.noticeType).toBe('auto_retry_start');
      }
    } finally {
      await reopened.close();
    }
  });

  test('interleaves notices with toolcalls without index collisions', async () => {
    const { manager } = await createTestManager();
    const sessionId = manager.getSessionId();
    const projection = new WorkerProjection(manager, sessionId);

    projection.beginRun('run-2', 2000);
    const userMsg = user('execute tools', 2000);
    manager.appendMessage(userMsg);
    projection.consume({ type: 'message_start', message: userMsg });

    const assistantMsg = assistant([], 'stop', 2001);
    manager.appendMessage(assistantMsg);
    projection.consume({ type: 'message_start', message: assistantMsg });

    // Tool call 1
    projection.consume({
      type: 'message_update',
      message: assistantMsg,
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 0,
        partial: {
          ...assistantMsg,
          content: [{ type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'a.txt' } }],
        },
      },
    });

    // Ingest auto_retry notice mid-message
    const retryEvent: AgentSessionEvent = {
      type: 'auto_retry_start',
      attempt: 2,
      maxAttempts: 3,
      delayMs: 1000,
      errorMessage: 'Rate limit encountered',
    };
    const noticeOutputs = projection.consume(retryEvent);
    const noticeStarted = noticeOutputs.find(o => o.event.type === 'part.started' && o.event.part.type === 'notice');
    expect(noticeStarted).toBeDefined();

    // Tool call 2
    const tool2Outputs = projection.consume({
      type: 'message_update',
      message: assistantMsg,
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 1,
        partial: {
          ...assistantMsg,
          content: [
            { type: 'toolCall', id: 'call_1', name: 'read', arguments: { path: 'a.txt' } },
            { type: 'toolCall', id: 'call_2', name: 'write', arguments: { path: 'b.txt' } },
          ],
        },
      },
    });

    const tool2Started = tool2Outputs.find(o => o.event.type === 'part.started');
    expect(tool2Started).toBeDefined();
    if (tool2Started?.event.type === 'part.started') {
      expect(tool2Started.event.part.type).toBe('tool_call');
    }
  });

  test('projects cache invalidation across disk when cacheRead drops and cacheWrite > 0', async () => {
    const { manager, dir } = await createTestManager();
    const sessionId = manager.getSessionId();
    const projection = new WorkerProjection(manager, sessionId);

    projection.beginRun('run-cache', 3000);
    const userMsg1 = user('first query', 3000);
    manager.appendMessage(userMsg1);
    projection.consume({ type: 'message_start', message: userMsg1 });
    projection.consume({ type: 'message_end', message: userMsg1 });

    // Assistant 1: establishes warm cache with cacheRead: 4096
    const assistantMsg1 = assistant([{ type: 'text', text: 'first answer' }], 'stop', 3001, {
      usage: {
        input: 100,
        output: 50,
        cacheRead: 4096,
        cacheWrite: 0,
        totalTokens: 4246,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    manager.appendMessage(assistantMsg1);
    projection.consume({ type: 'message_start', message: assistantMsg1 });
    projection.consume({ type: 'message_end', message: assistantMsg1 });
    projection.consume({ type: 'turn_end', message: assistantMsg1, toolResults: [] });

    const userMsg2 = user('second query after edit', 3002);
    manager.appendMessage(userMsg2);
    projection.consume({ type: 'message_start', message: userMsg2 });
    projection.consume({ type: 'message_end', message: userMsg2 });

    // Assistant 2: cache invalidated! cacheRead dropped from 4096 to 0, cacheWrite is 3500, input is 200
    const assistantMsg2 = assistant([{ type: 'text', text: 'second answer' }], 'stop', 3003, {
      usage: {
        input: 200,
        output: 50,
        cacheRead: 0,
        cacheWrite: 3500,
        totalTokens: 3750,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    });
    manager.appendMessage(assistantMsg2);
    projection.consume({ type: 'message_start', message: assistantMsg2 });
    const msg2EndOutputs = projection.consume({ type: 'message_end', message: assistantMsg2 });
    projection.consume({ type: 'turn_end', message: assistantMsg2, toolResults: [] });
    projection.bindPending();

    // Verify live emission
    const cacheNoticeLive = msg2EndOutputs.find(
      o => o.event.type === 'part.started' && o.event.part.type === 'notice' && (o.event.part as NoticePart).noticeType === 'cache_invalidation',
    );
    expect(cacheNoticeLive).toBeDefined();
    if (cacheNoticeLive?.event.type === 'part.started' && cacheNoticeLive.event.part.type === 'notice') {
      const part = cacheNoticeLive.event.part as NoticePart;
      if (part.noticeType === 'cache_invalidation') {
        expect(part.details.reprocessedTokens).toBe(3700);
      }
    }

    await manager.flush();

    // Verify cold reload from disk retains the cache_invalidation notice
    const file = manager.getSessionFile();
    expect(file).toBeDefined();
    const reopened = await SessionManager.open(file!, dir, undefined, { initialCwd: dir, throwIfMissing: true });
    try {
      const restored = new WorkerProjection(reopened, sessionId).seed();
      const assistantMessages = restored.messages.filter(m => m.role === 'assistant');
      expect(assistantMessages.length).toBeGreaterThanOrEqual(2);
      const secondAssistant = assistantMessages[1];
      expect(secondAssistant).toBeDefined();
      const cacheNotice = secondAssistant?.parts.find(
        (p): p is NoticePart => p.type === 'notice' && (p as NoticePart).noticeType === 'cache_invalidation',
      );
      expect(cacheNotice).toBeDefined();
      if (cacheNotice && cacheNotice.type === 'notice' && cacheNotice.noticeType === 'cache_invalidation') {
        expect(cacheNotice.details.reprocessedTokens).toBe(3700);
      }
    } finally {
      await reopened.close();
    }
  });

  test('projects served model mismatch notice live and across cold disk reload', async () => {
    const { manager, dir } = await createTestManager();
    const sessionId = manager.getSessionId();
    const projection = new WorkerProjection(manager, sessionId);

    projection.beginRun('run-mismatch', 4000);
    const userMsg = user('start', 4000);
    manager.appendMessage(userMsg);
    projection.consume({ type: 'message_start', message: userMsg });

    // Assistant message with served_model_mismatch (upstreamModel != model)
    const assistantMsg = assistant([{ type: 'text', text: 'response' }], 'stop', 4001, {
      model: 'gpt-6.1-sol',
      upstreamModel: 'gpt-6.1-terra',
    });
    manager.appendMessage(assistantMsg);
    projection.consume({ type: 'message_start', message: assistantMsg });
    const msgEndOutputs = projection.consume({ type: 'message_end', message: assistantMsg });
    const mismatchNotice = msgEndOutputs.find(
      o => o.event.type === 'part.started' && o.event.part.type === 'notice' && (o.event.part as NoticePart).noticeType === 'served_model_mismatch',
    );
    expect(mismatchNotice).toBeDefined();
    projection.bindPending();
    await manager.flush();

    // Cold reload from disk
    const file = manager.getSessionFile();
    expect(file).toBeDefined();
    const reopened = await SessionManager.open(file!, dir, undefined, { initialCwd: dir, throwIfMissing: true });
    try {
      const restored = new WorkerProjection(reopened, sessionId).seed();
      const assistantMessage = restored.messages.find(m => m.role === 'assistant');
      expect(assistantMessage).toBeDefined();
      const noticePart = assistantMessage?.parts.find(
        (p): p is NoticePart => p.type === 'notice' && (p as NoticePart).noticeType === 'served_model_mismatch',
      );
      expect(noticePart).toBeDefined();
      if (noticePart && noticePart.type === 'notice' && noticePart.noticeType === 'served_model_mismatch') {
        expect(noticePart.details.requested).toBe('gpt-6.1-terra');
        expect(noticePart.details.served).toBe('gpt-6.1-sol');
      }
    } finally {
      await reopened.close();
    }
  });

  test('restores compaction divider with method, tokensBefore/After, and summary from real manager.appendCompaction', async () => {
    const { manager, dir } = await createTestManager();
    const sessionId = manager.getSessionId();

    const userMsg = user('long conversation needing compaction', 5000);
    manager.appendMessage(userMsg);

    const assistantMsg = assistant([{ type: 'text', text: 'detailed multi-step plan' }], 'stop', 5001);
    const assistantEntryId = manager.appendMessage(assistantMsg);

    // Call real SessionManager.prototype.appendCompaction API
    manager.appendCompaction(
      'Summarized 120,000 tokens of past turns down to key decisions and current tasks.',
      'Compacted past context',
      assistantEntryId,
      120000,
      {
        tokensAfter: 32000,
        method: 'soft',
      },
    );

    const followUpUser = user('continue with next phase', 6000);
    manager.appendMessage(followUpUser);

    await manager.flush();

    // Cold reload from disk
    const file = manager.getSessionFile();
    expect(file).toBeDefined();
    const reopened = await SessionManager.open(file!, dir, undefined, { initialCwd: dir, throwIfMissing: true });
    try {
      const restored = new WorkerProjection(reopened, sessionId).seed();
      expect(restored.messages.length).toBeGreaterThanOrEqual(3);

      const compactionMessage = restored.messages.find(m =>
        m.parts.some(p => p.type === 'notice' && (p as NoticePart).noticeType === 'compaction'),
      );
      expect(compactionMessage).toBeDefined();

      const compactionPart = compactionMessage?.parts.find(
        (p): p is CompactionNoticePart => p.type === 'notice' && (p as NoticePart).noticeType === 'compaction',
      );
      expect(compactionPart).toBeDefined();
      expect(compactionPart?.details.tokensBefore).toBe(120000);
      expect(compactionPart?.details.tokensAfter).toBe(32000);
      expect(compactionPart?.details.method).toBe('soft-compacted');
      expect(compactionPart?.details.summary).toBe(
        'Summarized 120,000 tokens of past turns down to key decisions and current tasks.',
      );
    } finally {
      await reopened.close();
    }
  });

  test('projects auto_compaction_start/end and manual_compaction_start/end live state into SessionJournal', async () => {
    const { manager } = await createTestManager();
    const sessionId = manager.getSessionId();
    const projection = new WorkerProjection(manager, sessionId);
    const journal = new SessionJournal(
      { sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId },
      projection.seed(),
    );
    try {
      const startAuto = projection.consume({ type: 'auto_compaction_start', reason: 'threshold', action: 'context-full' });
      expect(startAuto).toMatchObject([{ event: { type: 'session.updated', compacting: { method: 'soft-compacted', reason: 'threshold' } } }]);
      journal.append(startAuto);
      expect(journal.snapshot().compacting).toMatchObject({ method: 'soft-compacted', reason: 'threshold', startedAt: expect.any(Number) });
      expect(projection.seed().compacting).toMatchObject({ method: 'soft-compacted', reason: 'threshold' });

      for (const failedEnd of [
        { type: 'auto_compaction_end' as const, action: 'context-full' as const, result: undefined, aborted: true, willRetry: false },
        { type: 'auto_compaction_end' as const, action: 'context-full' as const, result: undefined, aborted: false, willRetry: false, skipped: true },
        { type: 'auto_compaction_end' as const, action: 'context-full' as const, result: { summary: 'retry', firstKeptEntryId: 'e1', tokensBefore: 50 }, aborted: false, willRetry: true },
      ]) {
        journal.append(projection.consume({ type: 'auto_compaction_start', reason: 'overflow', action: 'remote' }));
        expect(journal.snapshot().compacting?.method).toBe('remote-compacted');
        const endEvents = projection.consume(failedEnd);
        expect(endEvents).toMatchObject([{ event: { type: 'session.updated', compacting: null } }]);
        journal.append(endEvents);
        expect(journal.snapshot().compacting).toBeNull();
      }

      journal.append(projection.consume({ type: 'manual_compaction_start', mode: 'shake' }));
      expect(journal.snapshot().compacting).toMatchObject({ method: 'shaken', startedAt: expect.any(Number) });
      const manualAborted = projection.consume({ type: 'manual_compaction_end', aborted: true });
      expect(manualAborted).toMatchObject([{ event: { type: 'session.updated', compacting: null } }]);
      journal.append(manualAborted);
      expect(journal.snapshot().compacting).toBeNull();

      journal.append(projection.consume({ type: 'manual_compaction_start', mode: 'snapcompact' }));
      expect(journal.snapshot().compacting?.method).toBe('snap-compacted');
      const manualCommitted = projection.consume({
        type: 'manual_compaction_end',
        aborted: false,
        result: { summary: 'compacted summary', firstKeptEntryId: 'entry-1', tokensBefore: 5000 },
      });
      expect(manualCommitted).toMatchObject([{
        event: { type: 'session.compacted', method: 'snap-compacted', tokensBefore: 5000, summary: 'compacted summary' },
      }]);
      journal.append(manualCommitted);
      expect(journal.snapshot().compacting).toBeNull();
      expect(projection.seed().compacting).toBeNull();
    } finally {
      journal.close();
      await manager.close();
    }
  });

  test('live compaction settles into SessionJournal snapshot and matches cold reload when compaction is the final branch entry', async () => {
    const { manager, dir } = await createTestManager();
    const sessionId = manager.getSessionId();
    const projection = new WorkerProjection(manager, sessionId);
    const journal = new SessionJournal(
      { sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId },
      projection.seed(),
    );
    try {
      journal.append(projection.beginRun('run-1', 1000));
      const userMsg = user('Explain discriminated unions', 1001);
      journal.append(projection.consume({ type: 'message_start', message: userMsg }));
      manager.appendMessage(userMsg);
      journal.append(projection.consume({ type: 'message_end', message: userMsg }));
      projection.bindPending();

      const assistantMsg = assistant([{ type: 'text', text: 'Here is the explanation.' }], 'stop', 1002);
      journal.append(projection.consume({ type: 'message_start', message: assistantMsg }));
      const assistantEntryId = manager.appendMessage(assistantMsg);
      journal.append(projection.consume({ type: 'message_end', message: assistantMsg }));
      journal.append(projection.consume({ type: 'turn_end', message: assistantMsg, toolResults: [] }));
      journal.append(projection.completeRun(1003));
      projection.bindPending();

      journal.append(projection.consume({ type: 'auto_compaction_start', reason: 'threshold', action: 'context-full' }));
      expect(journal.snapshot().compacting).toMatchObject({ method: 'soft-compacted', reason: 'threshold' });

      const compactionEntryId = manager.appendCompaction(
        `Summarized ${dir}/file.ts context`,
        'Compacted context',
        assistantEntryId,
        11300,
        {
          tokensAfter: 2400,
          method: 'soft',
        },
      );
      const compactionEntry = manager.getBranch().find((entry) => entry.id === compactionEntryId);
      if (compactionEntry?.type === 'compaction') {
        compactionEntry.warning = `Low headroom in ${dir}/file.ts`;
        await manager.rewriteEntries();
      }

      const endEvents = projection.consume({
        type: 'auto_compaction_end',
        action: 'context-full',
        result: {
          summary: `Summarized ${dir}/file.ts context`,
          firstKeptEntryId: assistantEntryId,
          tokensBefore: 11300,
        },
        aborted: false,
        willRetry: false,
      });
      journal.append(endEvents);

      const liveSnapshot = journal.snapshot();
      expect(liveSnapshot.compacting).toBeNull();
      const liveCompactionMessage = liveSnapshot.messages.at(-1);
      expect(liveCompactionMessage?.role).toBe('assistant');
      expect(liveSnapshot.branch.leafMessageId).toBe(liveCompactionMessage?.messageId ?? null);
      expect(liveSnapshot.turns.at(-1)?.assistantMessageIds).toContain(liveCompactionMessage?.messageId ?? '');
      const livePart = liveCompactionMessage?.parts.find(
        (part): part is CompactionNoticePart => part.type === 'notice' && part.noticeType === 'compaction',
      );
      expect(livePart?.details).toEqual({
        method: 'soft-compacted',
        tokensBefore: 11300,
        tokensAfter: 2400,
        summary: 'Summarized [workspace]/file.ts context',
        warning: 'Low headroom in [workspace]/file.ts',
      });

      await manager.flush();
      const file = manager.getSessionFile();
      expect(file).toBeDefined();
      const reopened = await SessionManager.open(file!, dir, undefined, { initialCwd: dir, throwIfMissing: true });
      try {
        const restoredSeed = new WorkerProjection(reopened, sessionId).seed();
        const restoredJournal = new SessionJournal(
          { sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId },
          restoredSeed,
        );
        try {
          const restoredSnapshot = restoredJournal.snapshot();
          const restoredCompactionMessage = restoredSnapshot.messages.at(-1);
          expect(restoredSnapshot.branch.leafMessageId).toBe(restoredCompactionMessage?.messageId ?? null);
          expect(restoredSnapshot.turns.at(-1)?.assistantMessageIds).toContain(restoredCompactionMessage?.messageId ?? '');
          const restoredPart = restoredCompactionMessage?.parts.find(
            (part): part is CompactionNoticePart => part.type === 'notice' && part.noticeType === 'compaction',
          );
          expect(restoredPart?.details).toEqual(livePart?.details);
        } finally {
          restoredJournal.close();
        }
      } finally {
        await reopened.close();
      }
    } finally {
      journal.close();
      await manager.close();
    }
  });

  test('cold reload handles compaction as the sole entry on the branch without failing SessionSnapshotSchema', async () => {
    const { manager, dir } = await createTestManager();
    const sessionId = manager.getSessionId();
    manager.appendCompaction('Initial compacted summary', 'Compacted', 'missing-entry', 8000, {
      tokensAfter: 1500,
      method: 'snapcompact',
    });
    await manager.flush();
    const file = manager.getSessionFile();
    expect(file).toBeDefined();
    const reopened = await SessionManager.open(file!, dir, undefined, { initialCwd: dir, throwIfMissing: true });
    try {
      const seed = new WorkerProjection(reopened, sessionId).seed();
      const journal = new SessionJournal(
        { sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId },
        seed,
      );
      try {
        const snapshot = journal.snapshot();
        expect(snapshot.turns).toHaveLength(1);
        expect(snapshot.messages).toHaveLength(1);
        expect(snapshot.branch.leafMessageId).toBe(snapshot.messages[0]!.messageId);
        expect(snapshot.turns[0]!.assistantMessageIds).toEqual([snapshot.messages[0]!.messageId]);
        expect(snapshot.messages[0]!.parts[0]).toMatchObject({
          type: 'notice',
          noticeType: 'compaction',
          details: { method: 'snap-compacted', tokensBefore: 8000, tokensAfter: 1500, summary: 'Initial compacted summary' },
        });
      } finally {
        journal.close();
      }
    } finally {
      await reopened.close();
      await manager.close();
    }
  });

  test('projects todo tool execution, user_todo_edit cold restore, ignores view/error, clears on todo_auto_clear, and sanitizes paths', async () => {
    const { manager, dir } = await createTestManager();
    const sessionId = manager.getSessionId();
    let livePhases: TodoPhase[] = [];
    const projection = new WorkerProjection(manager, sessionId, [], () => livePhases);
    const journal = new SessionJournal(
      { sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId },
      projection.seed(),
    );
    try {
      expect(journal.snapshot().todos).toEqual([]);
      journal.append(projection.beginRun('run-todo', 100));

      const initialPhases: TodoPhase[] = [
        {
          name: `Phase ${dir}/src`,
          tasks: [
            { content: `Inspect ${dir}/app.ts`, status: 'in_progress' },
            { content: 'Wait on dependency', status: 'pending' },
          ],
        },
      ];
      livePhases = initialPhases;
      manager.appendMessage({
        role: 'toolResult',
        toolCallId: 'call-init',
        toolName: 'todo',
        content: [{ type: 'text', text: 'ok' }],
        details: { op: 'init', phases: initialPhases, storage: 'session' },
        isError: false,
        timestamp: 101,
      });
      const initEvents = projection.consume({
        type: 'tool_execution_end',
        toolCallId: 'call-init',
        toolName: 'todo',
        result: { content: [{ type: 'text', text: 'ok' }], details: { op: 'init', phases: initialPhases } },
        isError: false,
      });
      const todoUpdated = initEvents.find(entry => entry.event.type === 'session.updated');
      expect(todoUpdated?.event).toEqual({
        type: 'session.updated',
        todos: [
          {
            name: 'Phase [workspace]/src',
            tasks: [
              { content: 'Inspect [workspace]/app.ts', status: 'in_progress' },
              { content: 'Wait on dependency', status: 'pending' },
            ],
          },
        ],
      });
      expect(JSON.stringify(todoUpdated)).not.toContain(dir);
      journal.append(initEvents);
      expect(journal.snapshot().todos).toEqual([
        {
          name: 'Phase [workspace]/src',
          tasks: [
            { content: 'Inspect [workspace]/app.ts', status: 'in_progress' },
            { content: 'Wait on dependency', status: 'pending' },
          ],
        },
      ]);

      // Pure view and error tool results must not replace canonical todos.
      manager.appendMessage({
        role: 'toolResult',
        toolCallId: 'call-view',
        toolName: 'todo',
        content: [{ type: 'text', text: 'view' }],
        details: { op: 'view', phases: [], storage: 'session' },
        isError: false,
        timestamp: 102,
      });
      const viewEvents = projection.consume({
        type: 'tool_execution_end',
        toolCallId: 'call-view',
        toolName: 'todo',
        result: { content: [{ type: 'text', text: 'view' }], details: { op: 'view', phases: [] } },
        isError: false,
      });
      expect(viewEvents.some(entry => entry.event.type === 'session.updated')).toBe(false);

      manager.appendMessage({
        role: 'toolResult',
        toolCallId: 'call-err',
        toolName: 'todo',
        content: [{ type: 'text', text: 'err' }],
        details: { op: 'done', phases: [], storage: 'session' },
        isError: true,
        timestamp: 103,
      });
      const errEvents = projection.consume({
        type: 'tool_execution_end',
        toolCallId: 'call-err',
        toolName: 'todo',
        result: { content: [{ type: 'text', text: 'err' }], details: { op: 'done', phases: [] } },
        isError: true,
      });
      expect(errEvents.some(entry => entry.event.type === 'session.updated')).toBe(false);

      // user_todo_edit custom entry overrides earlier toolResult on cold restore.
      const editedPhases: TodoPhase[] = [
        {
          name: `Phase ${dir}/src`,
          tasks: [{ content: `Inspect ${dir}/app.ts`, status: 'completed' }],
        },
      ];
      livePhases = editedPhases;
      manager.appendCustomEntry('user_todo_edit', { phases: editedPhases });
      const cmdSync = projection.syncTodosIfChanged(104);
      expect(cmdSync).toBeDefined();
      if (cmdSync) journal.append([cmdSync]);
      expect(journal.snapshot().todos).toEqual([
        {
          name: 'Phase [workspace]/src',
          tasks: [{ content: 'Inspect [workspace]/app.ts', status: 'completed' }],
        },
      ]);

      await manager.flush();
      const file = manager.getSessionFile();
      expect(file).toBeDefined();
      const reopened = await SessionManager.open(file!, dir, undefined, { initialCwd: dir, throwIfMissing: true });
      try {
        const restored = new WorkerProjection(reopened, sessionId).seed();
        expect(restored.todos).toEqual(journal.snapshot().todos);
        expect(JSON.stringify(restored.todos)).not.toContain(dir);
      } finally {
        await reopened.close();
      }

      // todo_auto_clear works even outside an active run and clears snapshot().todos.
      journal.append(projection.completeRun(105));
      livePhases = [];
      const cleared = projection.consume({ type: 'todo_auto_clear' });
      expect(cleared).toMatchObject([{ event: { type: 'session.updated', todos: [] } }]);
      journal.append(cleared);
      expect(journal.snapshot().todos).toEqual([]);
    } finally {
      journal.close();
      await manager.close();
    }
  });

  test('respects todo_hud_state dismissed across syncTodosIfChanged and cold disk reload, and reveals again on new todo tool result', async () => {
    const { manager, dir } = await createTestManager();
    const sessionId = manager.getSessionId();
    let livePhases: TodoPhase[] = [];
    const projection = new WorkerProjection(manager, sessionId, [], () => livePhases);
    const journal = new SessionJournal(
      { sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', rootSessionId: sessionId },
      projection.seed(),
    );
    try {
      const completedPhases: TodoPhase[] = [
        {
          name: `Phase ${dir}/done`,
          tasks: [
            { content: `Finish ${dir}/task-1`, status: 'completed' },
            { content: 'Drop optional task', status: 'abandoned' },
          ],
        },
      ];
      livePhases = completedPhases;
      manager.appendMessage({
        role: 'toolResult',
        toolCallId: 'call-done',
        toolName: 'todo',
        content: [{ type: 'text', text: 'done' }],
        details: { op: 'done', phases: completedPhases, storage: 'session' },
        isError: false,
        timestamp: 201,
      });
      const initialSync = projection.syncTodosIfChanged(201);
      expect(initialSync?.event).toEqual({
        type: 'session.updated',
        todos: [
          {
            name: 'Phase [workspace]/done',
            tasks: [
              { content: 'Finish [workspace]/task-1', status: 'completed' },
              { content: 'Drop optional task', status: 'abandoned' },
            ],
          },
        ],
      });
      if (initialSync) journal.append([initialSync]);
      expect(projection.hasPendingAutoClearTodos()).toBe(true);
      expect(projection.seed().todos).toEqual(journal.snapshot().todos);

      // Persist OMP's todo_hud_state dismissed entry for the latest canonical snapshot.
      const hudData = createTodoHudStateData(manager.getBranch(), completedPhases, 'dismissed');
      expect(hudData).toBeDefined();
      if (!hudData) throw new Error('Expected todo_hud_state payload');
      manager.appendCustomEntry(TODO_HUD_STATE_CUSTOM_TYPE, hudData);
      await manager.flush();

      expect(projection.hasPendingAutoClearTodos()).toBe(false);
      const dismissedSync = projection.syncTodosIfChanged(202);
      expect(dismissedSync).toMatchObject({ event: { type: 'session.updated', todos: [] } });
      if (dismissedSync) journal.append([dismissedSync]);
      expect(journal.snapshot().todos).toEqual([]);
      expect(projection.seed().todos).toEqual([]);

      // Dismissal survives cold reload from disk.
      const file = manager.getSessionFile();
      if (!file) throw new Error('Expected session file');
      const reopened = await SessionManager.open(file, dir, undefined, { initialCwd: dir, throwIfMissing: true });
      try {
        expect(new WorkerProjection(reopened, sessionId).seed().todos).toEqual([]);
      } finally {
        await reopened.close();
      }

      // A subsequent new todo tool result with an active task reveals todos again.
      const nextPhases: TodoPhase[] = [
        {
          name: 'Phase 2',
          tasks: [{ content: 'Follow-up task', status: 'in_progress' }],
        },
      ];
      livePhases = nextPhases;
      manager.appendMessage({
        role: 'toolResult',
        toolCallId: 'call-next',
        toolName: 'todo',
        content: [{ type: 'text', text: 'init' }],
        details: { op: 'init', phases: nextPhases, storage: 'session' },
        isError: false,
        timestamp: 203,
      });
      journal.append(projection.beginRun('run-next', 203));
      const nextEvents = projection.consume({
        type: 'tool_execution_end',
        toolCallId: 'call-next',
        toolName: 'todo',
        result: { content: [{ type: 'text', text: 'init' }], details: { op: 'init', phases: nextPhases } },
        isError: false,
      });
      const revealed = nextEvents.find(entry => entry.event.type === 'session.updated');
      expect(revealed?.event).toEqual({
        type: 'session.updated',
        todos: nextPhases,
      });
      journal.append(nextEvents);
      expect(journal.snapshot().todos).toEqual(nextPhases);
      expect(projection.seed().todos).toEqual(nextPhases);
      expect(projection.hasPendingAutoClearTodos()).toBe(false);
    } finally {
      journal.close();
      await manager.close();
    }
  });
});
