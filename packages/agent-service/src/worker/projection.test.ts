import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import type { AgentSessionEvent } from '@oh-my-pi/pi-coding-agent/session/agent-session-events';
import { SessionJournal } from '../projection/journal.ts';
import { nativePrivateRootContext, rememberPrivateRoots, WorkerProjection } from './projection.ts';

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
      const result = { role: 'toolResult' as const, toolCallId: 'call', toolName: 'bash', content: [{ type: 'text' as const, text: 'fixture' }], details: { diff: { path: 'fixture.txt', oldText: 'before', newText: 'after' } }, isError: outcome === 'cancelled', timestamp: timestamp++ };
      journal.append(projection.consume({ type: 'tool_execution_end', toolCallId: 'call', toolName: 'bash', result: { content: result.content, details: result.details }, isError: result.isError }));
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
      const restoredTool = restored.messages.flatMap(message => message.parts).find(part => part.type === 'tool_result');
      expect(restoredTool).toMatchObject({ output: { details: result.details } });
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

test('configured private roots are withheld across split native deltas without changing other paths or native inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-private-projection-'));
  const cwd = join(root, 'workspace');
  const storage = join(root, 'storage');
  const agentDirectory = join(cwd, '.omp');
  const manager = SessionManager.create(cwd, storage);
  try {
    await manager.ensureOnDisk();
    await rememberPrivateRoots(manager, { cwd, agentDirectory });
    const projection = new WorkerProjection(manager, 'session');
    projection.beginRun('run', 1);
    const prefix = `Read ${cwd.slice(0, 5)}`;
    const native = assistant([{ type: 'text', text: prefix }], 'stop', 2);
    const started = projection.consume({ type: 'message_start', message: native });
    let streamed = started.flatMap(({ event }) => event.type === 'part.started' && event.part.type === 'text' ? [event.part.content] : []).join('');
    const remaining = `${cwd.slice(5)}/secret.txt; /usr/share/public.txt`;
    for (const delta of remaining) {
      const events = projection.consume({ type: 'message_update', message: native,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta, partial: native } });
      streamed += events.flatMap(({ event }) => event.type === 'part.delta' ? [event.delta] : []).join('');
      expect(streamed).not.toContain(cwd);
    }
    expect(streamed).toBe('Read [workspace]/secret.txt; /usr/share/public.txt');
    expect(native.content).toEqual([{ type: 'text', text: prefix }]);
    expect(projection.publicText(`${cwd}-other/file /unrelated${cwd}/file`)).toBe(`${cwd}-other/file /unrelated${cwd}/file`);
    const unrelated = `${cwd}-other/file /unrelated${cwd}/file`;
    let unchanged = '';
    for (const delta of [` ${cwd}-other/file /unrelated`, `${cwd}/file`]) {
      unchanged += projection.consume({ type: 'message_update', message: native,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta, partial: native } })
        .flatMap(({ event }) => event.type === 'part.delta' ? [event.delta] : []).join('');
    }
    expect(unchanged).toBe(` ${unrelated}`);
    const toolInput = { path: `${agentDirectory}/settings.json`, other: '/usr/share/public.txt' };
    const nativeToolStarted = { type: 'tool_execution_start' as const, toolCallId: `${cwd}/call`, toolName: 'read', args: toolInput };
    const toolStarted = projection.consume(nativeToolStarted);
    expect(toolStarted[0]?.event).toMatchObject({ type: 'tool.started', toolCallId: '[workspace]/call', input: { path: '[agent-directory]/settings.json', other: '/usr/share/public.txt' } });
    expect(nativeToolStarted.toolCallId).toBe(`${cwd}/call`);
    expect(toolInput.path).toBe(`${agentDirectory}/settings.json`);
    const toolResult = { content: [{ type: 'text' as const, text: `${storage}/private.json` }], details: { path: `${cwd}/file` } };
    const nativeToolCompleted = { type: 'tool_execution_end' as const, toolCallId: `${cwd}/call`, toolName: 'read', result: toolResult, isError: false };
    const toolCompleted = projection.consume(nativeToolCompleted);
    expect(nativeToolCompleted.toolCallId).toBe(`${cwd}/call`);
    expect(toolCompleted[0]?.event).toMatchObject({ type: 'tool.completed', toolCallId: '[workspace]/call', output: {
      content: [{ type: 'text', text: '[session-storage]/private.json' }], details: { path: '[workspace]/file' },
    } });
    expect(toolResult.details.path).toBe(`${cwd}/file`);
    const failure = projection.failRun(`Cannot read ${cwd}/file`, 3);
    expect(failure.find(({ event }) => event.type === 'run.failed')?.event).toMatchObject({ type: 'run.failed', error: 'Cannot read [workspace]/file' });
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('native custom root context survives relocation, branch selection and cold reopen without rewriting native messages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-private-history-'));
  const source = join(root, 'source');
  const destination = join(root, 'destination');
  const sourceStorage = join(root, 'source-storage');
  const destinationStorage = join(root, 'destination-storage');
  const agentDirectory = join(root, 'agent');
  await mkdir(source, { recursive: true });
  await mkdir(destination, { recursive: true });
  const manager = SessionManager.create(source, sourceStorage);
  let reopened: SessionManager | undefined;
  try {
    await manager.ensureOnDisk();
    await rememberPrivateRoots(manager, { cwd: source, agentDirectory });
    const input = { role: 'user' as const, content: `Read ${source}/file`, timestamp: 1 };
    const userId = manager.appendMessage(input);
    manager.appendMessage(assistant([{ type: 'text', text: `Wrote ${source}/file` }], 'stop', 2));
    await manager.flush();
    await manager.moveTo(destination, destinationStorage);
    await rememberPrivateRoots(manager, { cwd: destination, agentDirectory });
    manager.branch(userId);
    await manager.appendEntriesAtomically(() => manager.appendCustomEntry('privacy-test.selected-branch', null));
    const file = manager.getSessionFile();
    if (!file) throw new Error('Native session file is required');
    await manager.close();
    reopened = await SessionManager.open(file, destinationStorage, undefined, { initialCwd: destination, throwIfMissing: true });
    const projection = new WorkerProjection(reopened, 'session');
    expect(projection.seed().messages[0]?.parts).toMatchObject([{ type: 'text', content: 'Read [workspace]/file' }]);
    expect(projection.publicText(`${source}/old ${destination}/new ${sourceStorage}/old ${destinationStorage}/new ${agentDirectory}/settings /usr/share/public.txt`))
      .toBe('[workspace]/old [workspace]/new [session-storage]/old [session-storage]/new [agent-directory]/settings /usr/share/public.txt');
    expect(reopened.getEntries().find((entry) => entry.type === 'message' && entry.id === userId)).toMatchObject({ message: input });
  } finally {
    await reopened?.close();
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('selected fork of legacy history inherits later tree-wide private roots before its first public seed and cold reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-private-fork-'));
  const source = join(root, 'source');
  const destination = join(root, 'destination');
  const sourceStorage = join(root, 'source-storage');
  const destinationStorage = join(root, 'destination-storage');
  const agentDirectory = join(root, 'agent');
  await mkdir(source, { recursive: true });
  await mkdir(destination, { recursive: true });
  const manager = SessionManager.create(source, sourceStorage);
  let reopened: SessionManager | undefined;
  try {
    await manager.ensureOnDisk();
    manager.appendMessage({ role: 'user', content: 'Legacy request', timestamp: 1 });
    const native = assistant([{ type: 'text', text: `${source}/old ${destination}/new /usr/share/public.txt` }], 'stop', 2);
    const selected = manager.appendMessage(native);
    await manager.flush();
    // The legacy messages precede both root markers, so SDK branchPath alone cannot carry them.
    await rememberPrivateRoots(manager, { cwd: source, agentDirectory });
    await manager.moveTo(destination, destinationStorage);
    await rememberPrivateRoots(manager, { cwd: destination, agentDirectory });
    const context = nativePrivateRootContext(manager);
    const childFile = manager.createBranchedSession(selected, { copyArtifacts: true });
    if (!childFile) throw new Error('Native fork file is required');
    await rememberPrivateRoots(manager, { cwd: destination, agentDirectory }, context);
    const childSessionId = manager.getSessionId();
    const seed = new WorkerProjection(manager, childSessionId).seed();
    expect(seed.messages[1]?.parts).toMatchObject([{ type: 'text', content: '[workspace]/old [workspace]/new /usr/share/public.txt' }]);
    expect(manager.getBranch().find((entry) => entry.type === 'message' && entry.id === selected)).toMatchObject({ message: native });
    await manager.close();
    reopened = await SessionManager.open(childFile, destinationStorage, undefined, { initialCwd: destination, throwIfMissing: true });
    const projection = new WorkerProjection(reopened, childSessionId);
    expect(projection.seed().messages).toEqual(seed.messages);
    expect(projection.publicText(`${source}/file ${destination}/file ${source}-other/file`))
      .toBe(`[workspace]/file [workspace]/file ${source}-other/file`);
  } finally {
    await reopened?.close();
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('SDK symbol-keyed edit arguments project to the exact canonical tool input', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-symbol-input-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    projection.beginRun('run', 1);
    const input = { path: 'fixture-diff.txt', old_string: "export const greeting = 'hello';",
      new_string: "export const greeting = 'hello, restored UI';\nexport const mood = 'warm';" };
    const marker = Symbol('sdk.validation');
    const marked = Object.assign({}, input, { [marker]: true });
    const toolCall = { type: 'toolCall' as const, id: 'call_fixture_edit', name: 'edit', arguments: marked };

    const startedPart = projection.consume({ type: 'message_start', message: assistant([toolCall], 'toolUse', 2) })
      .flatMap(({ event }) => event.type === 'part.started' && event.part.type === 'tool_call' ? [event.part.input] : []);
    expect(startedPart).toEqual([input]);

    const streamed = assistant([], 'toolUse', 3);
    projection.consume({ type: 'message_start', message: streamed });
    const endedPart = projection.consume({ type: 'message_update', message: streamed,
      assistantMessageEvent: { type: 'toolcall_end', contentIndex: 0, toolCall, partial: streamed } })
      .flatMap(({ event }) => event.type === 'part.started' && event.part.type === 'tool_call' ? [event.part.input] : []);
    expect(endedPart).toEqual([input]);

    const started = projection.consume({ type: 'tool_execution_start', toolCallId: toolCall.id, toolName: toolCall.name, args: marked });
    expect(started).toHaveLength(1);
    expect(started[0]?.event).toEqual({ type: 'tool.started', toolCallId: toolCall.id, toolName: toolCall.name, input });
    expect(Reflect.ownKeys(marked)).toContainEqual(marker);
    expect(toolCall.arguments).toHaveProperty('old_string', input.old_string);
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a recovered retry clears the failed attempt and completes the run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-retry-live-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', Date.now()));
    const deliver = (message: NativeMessage): void => {
      journal.append(projection.consume({ type: 'message_start', message }));
      manager.appendMessage(message);
      journal.append(projection.consume({ type: 'message_end', message }));
      projection.bindPending();
    };
    deliver({ role: 'user', content: 'Ask a question.', timestamp: 1 });
    deliver(assistant([], 'error', 2));
    deliver(assistant([{ type: 'text', text: 'Answered after retry.' }], 'stop', 3));
    const terminal = projection.consume({ type: 'agent_end', isTerminal: true });
    journal.append(terminal);
    expect(terminal.map(({ event }) => event.type)).toContain('run.completed');
    expect(terminal.map(({ event }) => event.type)).not.toContain('run.failed');
    const snapshot = journal.snapshot();
    expect(snapshot.turns).toHaveLength(1);
    expect(snapshot.turns[0]).toMatchObject({ status: 'completed' });
    expect(snapshot.activeRun).toBeNull();
    await manager.flush();
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('an unrecovered live assistant error fails the run at agent_end', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-error-live-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', Date.now()));
    const deliver = (message: NativeMessage): void => {
      journal.append(projection.consume({ type: 'message_start', message }));
      manager.appendMessage(message);
      journal.append(projection.consume({ type: 'message_end', message }));
      projection.bindPending();
    };
    deliver({ role: 'user', content: 'Ask a question.', timestamp: 1 });
    deliver(assistant([], 'error', 2));
    const terminal = projection.consume({ type: 'agent_end', isTerminal: true });
    journal.append(terminal);
    expect(terminal.map(({ event }) => event.type)).toContain('run.failed');
    expect(terminal.map(({ event }) => event.type)).not.toContain('run.completed');
    expect(journal.snapshot().turns[0]).toMatchObject({ status: 'failed' });
    await manager.flush();
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('live history reports an unsettled active turn running and a recorded terminal afterwards', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-live-history-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', 1));
    const user = { role: 'user' as const, content: 'Hold this turn open.', timestamp: 1 };
    journal.append(projection.consume({ type: 'message_start', message: user }));
    manager.appendMessage(user);
    journal.append(projection.consume({ type: 'message_end', message: user }));
    projection.bindPending();
    const live = projection.history({ sessionId: 'session' });
    expect(live.turns).toHaveLength(1);
    expect(live.turns[0]).toMatchObject({ runId: 'run', status: 'running' });
    expect(live.turns[0]?.finishedAt).toBeUndefined();
    const terminal = projection.cancelRun(2);
    journal.append(terminal);
    expect(terminal.map(({ event }) => event.type)).toContain('run.cancelled');
    expect(terminal.map(({ event }) => event.type)).not.toContain('run.completed');
    expect(projection.history({ sessionId: 'session' }).turns[0]).toMatchObject({ status: 'cancelled', finishedAt: 2 });
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('an abort latch settles turn_end and agent_end cancelled without an aborted assistant message_end', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-live-abort-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    const deliver = (message: NativeMessage): void => {
      journal.append(projection.consume({ type: 'message_start', message }));
      manager.appendMessage(message);
      journal.append(projection.consume({ type: 'message_end', message }));
      projection.bindPending();
    };
    journal.append(projection.beginRun('run', 1));
    deliver({ role: 'user', content: 'Hold this turn open.', timestamp: 1 });
    projection.requestCancel('run');
    const turnEnd = projection.consume({ type: 'turn_end', message: assistant([{ type: 'text', text: 'Partial' }], 'stop', 2), toolResults: [] });
    journal.append(turnEnd);
    expect(turnEnd.map(({ event }) => event.type)).not.toContain('turn.completed');
    const end = projection.consume({ type: 'agent_end', isTerminal: true });
    journal.append(end);
    expect(end.map(({ event }) => event.type)).toContain('run.cancelled');
    expect(end.map(({ event }) => event.type)).not.toContain('run.completed');
    expect(end.filter(({ event }) => event.type === 'run.cancelled')).toHaveLength(1);
    const snapshot = journal.snapshot();
    expect(snapshot.turns.at(-1)).toMatchObject({ status: 'cancelled' });
    expect(snapshot.activeRun).toBeNull();
    expect(snapshot.session).toMatchObject({ runtimeStatus: 'idle', activeRunId: null });
    expect(projection.history({ sessionId: 'session' }).turns.at(-1)).toMatchObject({ status: 'cancelled' });
    expect(projection.settledRun('run')).toMatchObject({ runId: 'run', status: 'cancelled' });
    expect(projection.consume({ type: 'agent_end', isTerminal: true })).toEqual([]);

    journal.append(projection.beginRun('next', 10));
    expect(projection.settledRun('run')).toBeNull();
    projection.requestCancel('run');
    deliver({ role: 'user', content: 'A later run.', timestamp: 10 });
    const reply = assistant([{ type: 'text', text: 'Done.' }], 'stop', 11);
    deliver(reply);
    const nextTurnEnd = projection.consume({ type: 'turn_end', message: reply, toolResults: [] });
    journal.append(nextTurnEnd);
    expect(nextTurnEnd.map(({ event }) => event.type)).toContain('turn.completed');
    const nextEnd = projection.consume({ type: 'agent_end', isTerminal: true });
    journal.append(nextEnd);
    expect(nextEnd.map(({ event }) => event.type)).toContain('run.completed');
    expect(nextEnd.map(({ event }) => event.type)).not.toContain('run.cancelled');
    expect(journal.snapshot().turns.at(-1)).toMatchObject({ status: 'completed' });
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a latched cancellation turns a late completed settlement into cancelled exactly once', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-live-complete-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', 1));
    const user = { role: 'user' as const, content: 'Hold this turn open.', timestamp: 1 };
    journal.append(projection.consume({ type: 'message_start', message: user }));
    manager.appendMessage(user);
    journal.append(projection.consume({ type: 'message_end', message: user }));
    projection.bindPending();
    projection.requestCancel('run');
    const settled = projection.completeRun(2);
    journal.append(settled);
    expect(settled.map(({ event }) => event.type)).toContain('run.cancelled');
    expect(settled.map(({ event }) => event.type)).not.toContain('run.completed');
    expect(settled.map(({ event }) => event.type)).not.toContain('turn.completed');
    expect(journal.snapshot().turns.at(-1)).toMatchObject({ status: 'cancelled' });
    expect(journal.snapshot().activeRun).toBeNull();
    expect(projection.history({ sessionId: 'session' }).turns[0]).toMatchObject({ status: 'cancelled' });
    expect(projection.completeRun(3)).toEqual([]);
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('native history applies recovered retries and terminal outcomes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-retry-history-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const recovery = { kind: 'auto-retry' as const, status: 'recovered' as const, attempt: 1, recoveredAt: new Date(3).toISOString(),
      recovery: 'plain' as const, note: 'error; retried' };
    manager.appendMessage({ role: 'user', content: 'Ask a question.', timestamp: 1 });
    manager.appendMessage({ ...assistant([], 'error', 2), retryRecovery: recovery });
    manager.appendMessage(assistant([{ type: 'text', text: 'Answered after retry.' }], 'stop', 3));
    const recovered = new WorkerProjection(manager, 'session').seed();
    expect(recovered.turns).toHaveLength(1);
    expect(recovered.turns[0]).toMatchObject({ status: 'completed' });
    manager.appendMessage({ role: 'user', content: 'Retry again.', timestamp: 4 });
    manager.appendMessage({ ...assistant([], 'error', 5), retryRecovery: { kind: 'auto-retry', status: 'superseded', attempt: 2, recovery: 'plain', note: 'error; retried' } });
    manager.appendMessage(assistant([], 'error', 6));
    const failed = new WorkerProjection(manager, 'session').seed();
    expect(failed.turns.at(-1)).toMatchObject({ status: 'failed' });
    manager.appendMessage({ role: 'user', content: 'Abort this.', timestamp: 7 });
    manager.appendMessage(assistant([], 'aborted', 8));
    const aborted = new WorkerProjection(manager, 'session').seed();
    expect(aborted.turns.at(-1)).toMatchObject({ status: 'cancelled' });
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
