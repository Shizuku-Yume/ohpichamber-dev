import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import type { AgentSessionEvent } from '@oh-my-pi/pi-coding-agent/session/agent-session-events';
import { SessionJournal } from '../projection/journal.ts';
import { nativePrivateRootContext, rememberPrivateRoots, WorkerProjection } from './projection.ts';
import type { Subagent } from '@openchamber/agent-contract';
import type { ProjectionInput } from '../projection/protocol.ts';
import { SubagentProjector, type SubagentEventObservation } from './subagent-projection.ts';

type NativeMessage = Extract<AgentSessionEvent, { type: 'message_start' }>['message'];
type Assistant = Extract<NativeMessage, { role: 'assistant' }>;
function assistant(content: Assistant['content'], stopReason: Assistant['stopReason'], timestamp: number): Assistant {
  return {
    role: 'assistant', content, api: 'openai-completions', provider: 'fixture', model: 'fixture', stopReason, timestamp,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }
  };
}

test('a run stays running across pauses, async wakes and queued prompts until its single end', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-run-wake-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', 1));
    const events: ReturnType<WorkerProjection['consume']> = [];
    const deliver = (event: AgentSessionEvent) => {
      const projected = projection.consume(event);
      events.push(...projected);
      journal.append(projected);
    };
    deliver({ type: 'agent_start' });
    deliver({ type: 'agent_pause', messages: [], yielded: true, awaiting: true });
    expect(projection.activeRun()?.runId).toBe('run');
    expect(journal.snapshot().session.runtimeStatus).toBe('running');
    // A background completion wakes the same run; it is not a second run.
    deliver({ type: 'agent_start' });
    const resumed = assistant([{ type: 'text', text: 'Background work finished' }], 'stop', 3);
    deliver({ type: 'message_start', message: resumed });
    deliver({ type: 'message_end', message: resumed });
    deliver({ type: 'agent_pause', messages: [resumed], yielded: true, awaiting: false });
    const queued = { role: 'user' as const, content: 'Follow up', timestamp: 4 };
    projection.admitQueuedPrompt(queued, []);
    deliver({ type: 'agent_start' });
    deliver({ type: 'message_start', message: queued });
    deliver({ type: 'message_end', message: queued });
    expect(projection.activeRun()?.runId).toBe('run');
    expect(events.filter(item => item.event.type === 'run.completed')).toHaveLength(0);
    deliver({ type: 'agent_end', messages: [resumed, queued] });
    deliver({ type: 'agent_end', messages: [] });
    expect(events.filter(item => item.event.type === 'run.completed')).toHaveLength(1);
    expect(events.filter(item => item.event.type === 'run.started')).toHaveLength(0);
    expect(projection.activeRun()).toBeNull();
    expect(journal.snapshot().session.runtimeStatus).toBe('idle');
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('binds queued mention provenance to its native entry even when timestamps collide', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-mention-identity-'));
  const manager = SessionManager.create(root, root);
  let reopened: SessionManager | undefined;
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    projection.beginRun('run', 1);
    const first = { role: 'user' as const, content: 'first', timestamp: 7 };
    const second = { role: 'user' as const, content: 'second', timestamp: 7 };
    const firstMention = { kind: 'session' as const, sessionId: 'first-session', title: 'First' };
    const secondMention = { kind: 'session' as const, sessionId: 'second-session', title: 'Second' };
    projection.admitQueuedPrompt(first, [], [{ kind: 'context', text: 'first context', metadata: { openchamberContext: firstMention } }]);
    projection.admitQueuedPrompt(second, [], [{ kind: 'context', text: 'second context', metadata: { openchamberContext: secondMention } }]);
    for (const message of [first, second]) {
      projection.consume({ type: 'message_start', message });
      projection.consume({ type: 'message_end', message });
    }
    manager.appendMessage(second);
    manager.appendMessage(first);
    projection.bindPending();
    await manager.flush();
    const history = projection.history({ sessionId: 'session' });
    const byContent = (text: string) => history.messages.find(message => message.parts.some(part => part.type === 'text' && part.content === text));
    expect(byContent('first')?.parts).toContainEqual(expect.objectContaining({ sessionMentions: [firstMention] }));
    expect(byContent('second')?.parts).toContainEqual(expect.objectContaining({ sessionMentions: [secondMention] }));
    const file = manager.getSessionFile();
    if (!file) throw new Error('Native session file is required');
    await manager.close();
    reopened = await SessionManager.open(file, root, undefined, { initialCwd: root, throwIfMissing: true });
    expect(new WorkerProjection(reopened, 'session').seed().messages).toEqual(history.messages);
  } finally {
    await reopened?.close();
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

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
    expect(projection.consume({ type: 'auto_compaction_end', action: 'context-full', result: { summary: 'retry', firstKeptEntryId: 'native-entry', tokensBefore: 40 }, aborted: false, willRetry: true }))
      .toMatchObject([{ event: { type: 'session.updated', compacting: null } }]);
    expect(projection.consume({ type: 'auto_compaction_end', action: 'context-full', result: undefined, aborted: false, willRetry: false }))
      .toMatchObject([{ event: { type: 'session.updated', compacting: null } }]);
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('manual and background handoff compaction project completion, cancellation and error authoritatively', async () => {
  const manager = SessionManager.inMemory('.');
  const projection = new WorkerProjection(manager, 'session');
  const started = projection.consume({ type: 'manual_compaction_start', mode: 'handoff' });
  expect(started).toMatchObject([{ event: { type: 'session.updated', compacting: { method: 'handed-off' } } }]);
  const success = projection.consume({ type: 'manual_compaction_end', aborted: false, result: { summary: 'handoff', firstKeptEntryId: 'native', tokensBefore: 42 } });
  expect(success.some(input => input.event.type === 'session.compacted')).toBe(true);
  for (const end of [{ aborted: true }, { aborted: false, errorMessage: 'fixture failure' }, { aborted: false, skipped: true }]) {
    projection.consume({ type: 'manual_compaction_start', mode: 'handoff' });
    expect(projection.consume({ type: 'manual_compaction_end', ...end })).toMatchObject([{ event: { type: 'session.updated', compacting: null } }]);
  }
  await manager.close();
});

test('historical secret placeholders are replayed literally without resolving changed labels', async () => {
  const manager = SessionManager.inMemory('.');
  const text = '$$0123456789ab$$ $$0123456789ab:U$$ $$OLDNAME_0123456789ab:L$$ $$RENAMED_abcdefgh1234:M$$';
  manager.appendMessage({ role: 'user', content: 'Historical transcript', timestamp: Date.now() });
  manager.appendMessage(assistant([{ type: 'text', text }], 'stop', Date.now()));
  const projection = new WorkerProjection(manager, 'session');
  expect(projection.seed().messages.flatMap(message => message.parts)).toContainEqual(expect.objectContaining({ type: 'text', content: text }));
  await manager.close();
});

test('a projected attachment part publishes its name and media type, never the private Host path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-attachment-projection-'));
  const manager = SessionManager.create(join(root, 'workspace'), join(root, 'storage'));
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const attachment = { attachmentId: 'att_projection', name: 'report.pdf', mediaType: 'application/pdf', size: 4096, uri: 'attachment://att_projection' };
    const privatePath = join(manager.getArtifactsDir() ?? root, 'host-attachments', 'att_projection.bin');
    // The Host-resolved absolute path reaches the worker (and so the projection);
    // it must not survive into any canonical part a client can read.
    const user: NativeMessage = { role: 'user', content: 'Summarize the report.', timestamp: 1, attribution: 'user' };
    projection.beginRun('run', 2, [attachment], [], 'user');
    const events = projection.consume({ type: 'message_start', message: user });
    const parts = events.flatMap(({ event }) => event.type === 'part.started' ? [event.part] : []);
    const attachmentPart = parts.find(part => part.type === 'attachment');
    expect(attachmentPart).toEqual({ type: 'attachment', partId: expect.stringContaining(':attachment:0'), ...attachment });
    expect(JSON.stringify(parts)).not.toContain(root);
    expect(JSON.stringify(parts)).not.toContain(privatePath);
  } finally { await manager.close(); await rm(root, { recursive: true, force: true }); }
});

test('a seeded live assistant start does not duplicate the first text delta', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-seed-projection-'));
  const manager = SessionManager.create(join(root, 'workspace'), join(root, 'storage'));
  try {
    await manager.ensureOnDisk();
    const seed = assistant([{ type: 'text', text: 'w8' }], 'stop', 2);
    const projection = new WorkerProjection(manager, 'session');
    projection.beginRun('run', 1);
    const started = projection.consume({ type: 'message_start', message: seed });
    expect(started.flatMap(({ event }) => event.type === 'part.started' && event.part.type === 'text' ? [event.part.content] : []).join('')).toBe('');
    let streamed = '';
    for (const delta of ['w8', ' snapshot']) {
      streamed += projection.consume({
        type: 'message_update', message: seed,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta, partial: seed }
      })
        .flatMap(({ event }) => event.type === 'part.delta' ? [event.delta] : []).join('');
    }
    expect(streamed).toBe('w8 snapshot');
  } finally { await manager.close(); await rm(root, { recursive: true, force: true }); }
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
    expect(started.flatMap(({ event }) => event.type === 'part.started' && event.part.type === 'text' ? [event.part.content] : []).join('')).toBe('');
    let streamed = '';
    const remaining = `${cwd.slice(5)}/secret.txt; /usr/share/public.txt`;
    for (const delta of [prefix, remaining]) {
      const events = projection.consume({
        type: 'message_update', message: native,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta, partial: native }
      });
      streamed += events.flatMap(({ event }) => event.type === 'part.delta' ? [event.delta] : []).join('');
      expect(streamed).not.toContain(cwd);
    }
    expect(streamed).toBe('Read [workspace]/secret.txt; /usr/share/public.txt');
    expect(native.content).toEqual([{ type: 'text', text: prefix }]);
    expect(projection.publicText(`${cwd}-other/file /unrelated${cwd}/file`)).toBe(`${cwd}-other/file /unrelated${cwd}/file`);
    const unrelated = `${cwd}-other/file /unrelated${cwd}/file`;
    let unchanged = '';
    for (const delta of [` ${cwd}-other/file /unrelated`, `${cwd}/file`]) {
      unchanged += projection.consume({
        type: 'message_update', message: native,
        assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta, partial: native }
      })
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
    expect(toolCompleted[0]?.event).toMatchObject({
      type: 'tool.completed', toolCallId: '[workspace]/call', output: {
        content: [{ type: 'text', text: '[session-storage]/private.json' }], details: { path: '[workspace]/file' },
      }
    });
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
    const input = {
      path: 'fixture-diff.txt', old_string: "export const greeting = 'hello';",
      new_string: "export const greeting = 'hello, restored UI';\nexport const mood = 'warm';"
    };
    const marker = Symbol('sdk.validation');
    const marked = Object.assign({}, input, { [marker]: true });
    const toolCall = { type: 'toolCall' as const, id: 'call_fixture_edit', name: 'edit', arguments: marked };

    const startedPart = projection.consume({ type: 'message_start', message: assistant([toolCall], 'toolUse', 2) })
      .flatMap(({ event }) => event.type === 'part.started' && event.part.type === 'tool_call' ? [event.part.input] : []);
    expect(startedPart).toEqual([input]);

    const streamed = assistant([], 'toolUse', 3);
    projection.consume({ type: 'message_start', message: streamed });
    const endedPart = projection.consume({
      type: 'message_update', message: streamed,
      assistantMessageEvent: { type: 'toolcall_end', contentIndex: 0, toolCall, partial: streamed }
    })
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
    deliver({ ...assistant([], 'error', 2), errorMessage: '401 Invalid API key' });
    deliver(assistant([{ type: 'text', text: 'Answered after retry.' }], 'stop', 3));
    const terminal = projection.consume({ type: 'agent_end', messages: [] });
    journal.append(terminal);
    expect(terminal.map(({ event }) => event.type)).toContain('run.completed');
    expect(terminal.map(({ event }) => event.type)).not.toContain('run.failed');
    const snapshot = journal.snapshot();
    expect(snapshot.turns).toHaveLength(1);
    expect(snapshot.turns[0]).toMatchObject({ status: 'completed' });
    expect(snapshot.turns[0]?.error).toBeUndefined();
    expect(snapshot.activeRun).toBeNull();
    await manager.flush();
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test.each([
  ['401 Invalid API key', '401 Invalid API key'],
  ['', 'Agent execution failed'],
  ['   ', 'Agent execution failed'],
  [undefined, 'Agent execution failed'],
])('an unrecovered assistant error preserves detail %p at agent_end', async (errorMessage, expectedError) => {
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
    deliver({ ...assistant([], 'error', 2), errorMessage });
    const terminal = projection.consume({ type: 'agent_end', messages: [] });
    journal.append(terminal);
    expect(terminal.map(({ event }) => event.type)).toContain('run.failed');
    expect(terminal.map(({ event }) => event.type)).not.toContain('run.completed');
    expect(terminal.find(({ event }) => event.type === 'run.failed')?.event).toMatchObject({ error: expectedError });
    expect(journal.snapshot().turns[0]).toMatchObject({ status: 'failed', error: expectedError });
    await manager.flush();
    expect(new WorkerProjection(manager, 'session').seed().turns[0]).toMatchObject({ status: 'failed', error: expectedError });
    projection.beginRun('next-run', Date.now());
    expect(projection.consume({ type: 'agent_end', messages: [] }).map(({ event }) => event.type)).toContain('run.completed');
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
    const end = projection.consume({ type: 'agent_end', messages: [] });
    journal.append(end);
    expect(end.map(({ event }) => event.type)).toContain('run.cancelled');
    expect(end.map(({ event }) => event.type)).not.toContain('run.completed');
    expect(end.filter(({ event }) => event.type === 'run.cancelled')).toHaveLength(1);
    const snapshot = journal.snapshot();
    expect(snapshot.turns.at(-1)).toMatchObject({ status: 'cancelled' });
    expect(snapshot.activeRun).toBeNull();
    expect(snapshot.session).toMatchObject({ runtimeStatus: 'idle', activeRunId: null });
    expect(projection.history({ sessionId: 'session' }).turns.at(-1)).toMatchObject({ status: 'cancelled' });
    expect(projection.activeRun()).toBeNull();
    expect(projection.consume({ type: 'agent_end', messages: [] })).toEqual([]);

    journal.append(projection.beginRun('next', 10));
    projection.requestCancel('run');
    deliver({ role: 'user', content: 'A later run.', timestamp: 10 });
    const reply = assistant([{ type: 'text', text: 'Done.' }], 'stop', 11);
    deliver(reply);
    const nextTurnEnd = projection.consume({ type: 'turn_end', message: reply, toolResults: [] });
    journal.append(nextTurnEnd);
    expect(nextTurnEnd.map(({ event }) => event.type)).toContain('turn.completed');
    const nextEnd = projection.consume({ type: 'agent_end', messages: [] });
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
    const recovery = {
      kind: 'auto-retry' as const, status: 'recovered' as const, attempt: 1, recoveredAt: new Date(3).toISOString(),
      recovery: 'plain' as const, note: 'error; retried'
    };
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

test('a scoped cancellation cannot settle a newer run', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-scoped-cancel-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('old', 1));
    const oldUser = { role: 'user' as const, content: 'First run.', timestamp: 1 };
    journal.append(projection.consume({ type: 'message_start', message: oldUser }));
    manager.appendMessage(oldUser);
    journal.append(projection.consume({ type: 'message_end', message: oldUser }));
    projection.bindPending();
    projection.requestCancel('old');
    const oldTerminal = projection.cancelRun(2, 'old');
    journal.append(oldTerminal);
    expect(oldTerminal.map(({ event }) => event.type)).toContain('run.cancelled');

    journal.append(projection.beginRun('new', 10));
    const newUser = { role: 'user' as const, content: 'Second run.', timestamp: 10 };
    journal.append(projection.consume({ type: 'message_start', message: newUser }));
    manager.appendMessage(newUser);
    journal.append(projection.consume({ type: 'message_end', message: newUser }));
    projection.bindPending();
    expect(projection.cancelRun(11, 'old')).toEqual([]);
    expect(projection.activeRun()).toMatchObject({ runId: 'new', status: 'running' });
    expect(projection.history({ sessionId: 'session' }).turns.at(-1)).toMatchObject({ runId: 'new', status: 'running' });
    expect(projection.completeRun(12).map(({ event }) => event.type)).toContain('run.completed');
    expect(projection.history({ sessionId: 'session' }).turns.at(-1)).toMatchObject({ runId: 'new', status: 'completed' });
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('history keeps an earlier terminal-less turn untouched when a new run opens before binding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-live-offset-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    manager.appendMessage({ role: 'user', content: 'Legacy open turn.', timestamp: 1 });
    const projection = new WorkerProjection(manager, 'session');
    expect(projection.history({ sessionId: 'session' }).turns[0]).toMatchObject({ status: 'completed' });

    projection.beginRun('next', 10);
    const nextUser = { role: 'user' as const, content: 'New run.', timestamp: 11 };
    projection.consume({ type: 'message_start', message: nextUser });
    const openedOnly = projection.history({ sessionId: 'session' });
    expect(openedOnly.turns).toHaveLength(1);
    expect(openedOnly.turns[0]).toMatchObject({ status: 'completed' });

    manager.appendMessage(nextUser);
    const unbound = projection.history({ sessionId: 'session' });
    expect(unbound.turns).toHaveLength(2);
    expect(unbound.turns[0]).toMatchObject({ status: 'completed' });
    expect(unbound.turns[1]).toMatchObject({ status: 'running' });
    expect(unbound.turns[1]?.finishedAt).toBeUndefined();

    projection.bindPending();
    const bound = projection.history({ sessionId: 'session' });
    expect(bound.turns[0]).toMatchObject({ status: 'completed' });
    expect(bound.turns[1]).toMatchObject({ runId: 'next', status: 'running' });
    projection.cancelRun(12, 'next');
    const settled = projection.history({ sessionId: 'session' });
    expect(settled.turns[0]).toMatchObject({ status: 'completed' });
    expect(settled.turns[1]).toMatchObject({ runId: 'next', status: 'cancelled' });
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('projection seed and snapshot carry the persisted model and thinking level', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-selection-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    manager.appendModelChange('fixture/model');
    manager.appendThinkingLevelChange('high', 'high');
    const projection = new WorkerProjection(manager, 'session');
    const seed = projection.seed();
    expect(seed.selection).toEqual({ model: { providerId: 'fixture', modelId: 'model' }, thinkingLevel: 'high' });
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, seed);
    expect(journal.snapshot().selection).toEqual(seed.selection);
    manager.appendThinkingLevelChange('medium', 'auto');
    expect(projection.seed().selection?.thinkingLevel).toBe('auto');
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('reopening a native session maps reasoningTokens usage into the canonical shape', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-usage-'));
  const manager = SessionManager.create(root, root);
  let reopened: SessionManager | undefined;
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', 1));
    let timestamp = 2;
    const deliver = (message: NativeMessage): void => {
      journal.append(projection.consume({ type: 'message_start', message }));
      manager.appendMessage(message);
      journal.append(projection.consume({ type: 'message_end', message }));
      projection.bindPending();
    };
    deliver({ role: 'user', content: 'ping', timestamp: timestamp++ });
    const answer: Assistant = {
      ...assistant([{ type: 'text', text: 'pong' }], 'stop', timestamp++),
      usage: {
        input: 7, output: 5, cacheRead: 2, cacheWrite: 1, totalTokens: 12,
        cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 }
      },
    };
    deliver(answer);
    journal.append(projection.completeRun(timestamp++));
    await manager.flush();
    const file = manager.getSessionFile();
    if (!file) throw new Error('Native session file is required');
    await manager.close();
    // The SDK writes provider-only counters into native usage; the canonical
    // wire contract publishes only the shared token fields.
    const rewritten = (await readFile(file, 'utf8')).trimEnd().split('\n').map((line) => {
      const entry: { type?: string; message?: { role?: string; usage?: Record<string, unknown> } } = JSON.parse(line);
      if (entry.type === 'message' && entry.message?.role === 'assistant' && entry.message.usage) entry.message.usage.reasoningTokens = 3;
      return JSON.stringify(entry);
    });
    await writeFile(file, `${rewritten.join('\n')}\n`);
    reopened = await SessionManager.open(file, root, undefined, { initialCwd: root, throwIfMissing: true });
    const restored = new WorkerProjection(reopened, 'session');
    // `reasoning` is the projected provider reasoning counter; it stays separate
    // from totalTokens, which the provider already counts in full.
    const expected = {
      input: 7, output: 5, cacheRead: 2, cacheWrite: 1, totalTokens: 12, reasoning: 3,
      cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 }
    };
    const seeded = restored.seed().messages.find((message) => message.role === 'assistant');
    expect(seeded?.usage).toEqual(expected);
    const page = restored.history({ sessionId: 'session' }).messages.find((message) => message.role === 'assistant');
    expect(page?.usage).toEqual(expected);
    expect(seeded?.usage).not.toHaveProperty('reasoningTokens');
    expect(seeded?.usage?.totalTokens).toBe(12);
  } finally {
    await reopened?.close();
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a tool result is a part of the message that made the call, live and restored', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-result-owner-'));
  const manager = SessionManager.create(root, root);
  let reopened: SessionManager | undefined;
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', 1));
    const deliver = (message: NativeMessage): void => {
      journal.append(projection.consume({ type: 'message_start', message }));
      manager.appendMessage(message);
      journal.append(projection.consume({ type: 'message_end', message }));
      projection.bindPending();
    };
    deliver({ role: 'user', content: 'Run the command.', timestamp: 2 });
    const call = assistant([{ type: 'toolCall', id: 'call', name: 'bash', arguments: { command: 'printf fixture' } }], 'toolUse', 3);
    deliver(call);
    journal.append(projection.consume({ type: 'tool_execution_start', toolCallId: 'call', toolName: 'bash', args: { command: 'printf fixture' } }));
    const result = { role: 'toolResult' as const, toolCallId: 'call', toolName: 'bash', content: [{ type: 'text' as const, text: 'fixture' }], details: { exitCode: 0 }, isError: false, timestamp: 4 };
    journal.append(projection.consume({ type: 'tool_execution_end', toolCallId: 'call', toolName: 'bash', result: { content: result.content, details: result.details } }));
    deliver(result);
    journal.append(projection.consume({ type: 'turn_end', message: call, toolResults: [result] }));
    journal.append(projection.completeRun(5));
    await manager.flush();
    const history = projection.history({ sessionId: 'session' });

    const assistantMessage = history.messages.find(message => message.role === 'assistant');
    expect(assistantMessage?.parts.map(part => part.type)).toEqual(['tool_call', 'tool_result']);
    const resultPart = assistantMessage?.parts.find(part => part.type === 'tool_result');
    expect(resultPart).toMatchObject({ partId: `${assistantMessage?.parts[0]?.partId}:result`, toolCallId: 'call', isError: false });
    expect(history.messages.some(message => message.role === 'system')).toBe(false);
    expect(journal.snapshot().messages.some(message => message.role === 'system')).toBe(false);

    const file = manager.getSessionFile();
    if (!file) throw new Error('Native session file is required');
    await manager.close();
    reopened = await SessionManager.open(file, root, undefined, { initialCwd: root, throwIfMissing: true });
    const restored = new WorkerProjection(reopened, 'session').seed();
    expect(restored.messages).toEqual(history.messages);
    expect(restored.messages.flatMap(message => message.parts).filter(part => part.type === 'tool_result')).toHaveLength(1);
  } finally {
    await reopened?.close();
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a partial tool result reaches the call while it runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-partial-result-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', 1));
    const deliver = (message: NativeMessage): void => {
      journal.append(projection.consume({ type: 'message_start', message }));
      manager.appendMessage(message);
      journal.append(projection.consume({ type: 'message_end', message }));
      projection.bindPending();
    };
    deliver({ role: 'user', content: 'Run a long command.', timestamp: 2 });
    const call = assistant([{ type: 'toolCall', id: 'call', name: 'bash', arguments: { command: 'sleep 5' } }], 'toolUse', 3);
    deliver(call);
    journal.append(projection.consume({ type: 'tool_execution_start', toolCallId: 'call', toolName: 'bash', args: { command: 'sleep 5' } }));

    const first = projection.consume({
      type: 'tool_execution_update', toolCallId: 'call', toolName: 'bash', args: {},
      partialResult: { content: [{ type: 'text', text: 'line one' }], details: {} }
    });
    const firstPart = journal.append(first).find(event => event.type === 'part.started');
    expect(firstPart).toMatchObject({ type: 'part.started', part: { type: 'tool_result', toolCallId: 'call', isError: false } });
    journal.append(projection.consume({
      type: 'tool_execution_update', toolCallId: 'call', toolName: 'bash', args: {},
      partialResult: { content: [{ type: 'text', text: 'line one\nline two' }], details: {} }
    }));
    const live = journal.snapshot().messages.find(message => message.role === 'assistant');
    const liveResult = live?.parts.find(part => part.type === 'tool_result');
    expect(liveResult).toMatchObject({ output: { content: [{ type: 'text', text: 'line one\nline two' }] } });

    const outcome = { content: [{ type: 'text' as const, text: 'line one\nline two\ndone' }], details: { exitCode: 0 } };
    journal.append(projection.consume({ type: 'tool_execution_end', toolCallId: 'call', toolName: 'bash', result: outcome }));
    deliver({ role: 'toolResult', toolCallId: 'call', toolName: 'bash', content: outcome.content, details: outcome.details, isError: false, timestamp: 4 });
    const finished = journal.snapshot().messages.find(message => message.role === 'assistant')
      ?.parts.find(part => part.type === 'tool_result');
    expect(finished).toMatchObject({ output: { content: outcome.content, details: outcome.details } });
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a failed tool reports the kind and the detail the tool gave', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-tool-error-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', 1));
    const call = assistant([{ type: 'toolCall', id: 'call', name: 'bash', arguments: { command: 'slow' } }], 'toolUse', 2);
    journal.append(projection.consume({ type: 'message_start', message: call }));
    manager.appendMessage(call);
    journal.append(projection.consume({ type: 'message_end', message: call }));
    journal.append(projection.consume({
      type: 'tool_execution_end', toolCallId: 'call', toolName: 'bash',
      result: { content: [{ type: 'text', text: 'Command timed out after 30s' }], details: { timedOut: true, exitCode: 124 } }, isError: true
    }));
    const completed = journal.snapshot().messages.flatMap(message => message.parts).find(part => part.type === 'tool_result');
    expect(completed).toMatchObject({ isError: true, errorKind: 'timeout', error: 'Command timed out after 30s' });
    const editor = assistant([{ type: 'toolCall', id: 'edit-call', name: 'edit', arguments: { path: 'a.ts' } }], 'toolUse', 3);
    journal.append(projection.consume({ type: 'message_start', message: editor }));
    manager.appendMessage(editor);
    journal.append(projection.consume({ type: 'message_end', message: editor }));
    journal.append(projection.consume({
      type: 'tool_execution_end', toolCallId: 'edit-call', toolName: 'edit',
      result: { content: [{ type: 'text', text: 'Not unique' }], details: { errorKind: 'not-unique' } }, isError: true
    }));
    const editResult = journal.snapshot().messages.flatMap(message => message.parts).filter(part => part.type === 'tool_result')[1];
    expect(editResult).toMatchObject({ errorKind: 'not-unique', error: 'Not unique' });
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('an assistant step carries its own start, first token and completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-step-timing-'));
  const manager = SessionManager.create(root, root);
  let reopened: SessionManager | undefined;
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', 1));
    const user = { role: 'user' as const, content: 'ping', timestamp: 1000 };
    journal.append(projection.consume({ type: 'message_start', message: user }));
    manager.appendMessage(user);
    journal.append(projection.consume({ type: 'message_end', message: user }));
    projection.bindPending();
    const step = { ...assistant([{ type: 'text' as const, text: 'pong' }], 'stop', 1000), ttft: 250, duration: 1400, completedAt: 2400 };
    journal.append(projection.consume({ type: 'message_start', message: step }));
    manager.appendMessage(step);
    const created = projection.consume({ type: 'message_end', message: step });
    journal.append(created);
    projection.bindPending();
    journal.append(projection.completeRun(2400));
    const expected = { startedAt: 1000, firstTokenAt: 1250, completedAt: 2400 };
    const history = projection.history({ sessionId: 'session' });
    const live = history.messages.find(message => message.role === 'assistant');
    expect(live?.timing).toEqual(expected);
    expect(created).toContainEqual({ timestamp: expect.any(Number), event: expect.objectContaining({ type: 'message.updated', timing: expected }) });
    await manager.flush();
    const file = manager.getSessionFile();
    if (!file) throw new Error('Native session file is required');
    await manager.close();
    reopened = await SessionManager.open(file, root, undefined, { initialCwd: root, throwIfMissing: true });
    const restored = new WorkerProjection(reopened, 'session').seed();
    expect(restored.messages.find(message => message.role === 'assistant')?.timing).toEqual(expected);
  } finally {
    await reopened?.close();
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('an assistant step derives completedAt from duration when completedAt is omitted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-step-timing-duration-'));
  const manager = SessionManager.create(root, root);
  let reopened: SessionManager | undefined;
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    journal.append(projection.beginRun('run', 1));
    const user = { role: 'user' as const, content: 'ping', timestamp: 1000 };
    journal.append(projection.consume({ type: 'message_start', message: user }));
    manager.appendMessage(user);
    journal.append(projection.consume({ type: 'message_end', message: user }));
    projection.bindPending();
    const step = { ...assistant([{ type: 'text' as const, text: 'pong' }], 'stop', 1000), ttft: 250, duration: 1400 };
    journal.append(projection.consume({ type: 'message_start', message: step }));
    manager.appendMessage(step);
    const created = projection.consume({ type: 'message_end', message: step });
    journal.append(created);
    projection.bindPending();
    journal.append(projection.completeRun(2400));
    const expected = { startedAt: 1000, firstTokenAt: 1250, completedAt: 2400 };
    const history = projection.history({ sessionId: 'session' });
    const live = history.messages.find(message => message.role === 'assistant');
    expect(live?.timing).toEqual(expected);
    expect(created).toContainEqual({ timestamp: expect.any(Number), event: expect.objectContaining({ type: 'message.updated', timing: expected }) });
    await manager.flush();
    const file = manager.getSessionFile();
    if (!file) throw new Error('Native session file is required');
    await manager.close();
    reopened = await SessionManager.open(file, root, undefined, { initialCwd: root, throwIfMissing: true });
    const restored = new WorkerProjection(reopened, 'session').seed();
    expect(restored.messages.find(message => message.role === 'assistant')?.timing).toEqual(expected);
  } finally {
    await reopened?.close();
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a run OMP prompts itself opens a turn without an empty user message', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-worker-turn-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    const journal = new SessionJournal({ sessionId: 'session', rootSessionId: 'session', projectId: 'project', workspaceId: 'workspace', displayPath: '.' }, projection.seed());
    const begun = journal.append(projection.beginRun('plan-run', 1, [], 'plan'));
    expect(begun.map(event => event.type)).toEqual(['run.started', 'turn.started']);
    expect(begun.some(event => event.type === 'message.created')).toBe(false);
    journal.append(projection.consume({ type: 'message_start', message: assistant([{ type: 'text', text: 'Working on it.' }], 'stop', 2) }));
    expect(journal.snapshot().messages.some(message => message.role === 'user')).toBe(false);
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('emits no part.updated for an unchanged tool input and forwards tool_stream_update edit previews', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-tool-stream-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    projection.beginRun('run-1', 1);

    const userMsg = { role: 'user' as const, content: 'Edit this file', timestamp: 10 };
    projection.consume({ type: 'message_start', message: userMsg });
    projection.consume({ type: 'message_end', message: userMsg });

    const assistantMsg = {
      role: 'assistant' as const,
      content: [],
      api: 'openai-completions', provider: 'fixture', model: 'fixture',
      stopReason: 'toolUse', timestamp: 20,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    };

    // 1. message_start for assistant
    projection.consume({ type: 'message_start', message: assistantMsg });

    // 2. toolcall_start: emits part.started
    const startEvents = projection.consume({
      type: 'message_update',
      message: assistantMsg,
      assistantMessageEvent: {
        type: 'toolcall_start',
        contentIndex: 0,
        partial: { role: 'assistant', content: [{ type: 'toolCall', id: 'edit-1', name: 'edit', arguments: { path: 'src/main.ts', text: '' } }] } as unknown as Assistant,
      },
    });
    expect(startEvents.map(e => e.event.type)).toEqual(['part.started']);
    const startedPart = (startEvents[0].event as Extract<typeof startEvents[0]['event'], { type: 'part.started' }>).part;
    expect(startedPart.type).toBe('tool_call');
    if (startedPart.type === 'tool_call') {
      expect(startedPart.toolCallId).toBe('edit-1');
      expect(startedPart.input).toEqual({ path: 'src/main.ts', text: '' });
    }

    // 3. toolcall_delta with UNCHANGED input: emits NO part.updated!
    const unchangedDeltaEvents = projection.consume({
      type: 'message_update',
      message: assistantMsg,
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 0,
        delta: '',
        partial: { role: 'assistant', content: [{ type: 'toolCall', id: 'edit-1', name: 'edit', arguments: { path: 'src/main.ts', text: '' } }] } as unknown as Assistant,
      },
    });
    expect(unchangedDeltaEvents).toHaveLength(0);

    // 4. toolcall_delta with CHANGED input: emits part.updated
    const changedDeltaEvents = projection.consume({
      type: 'message_update',
      message: assistantMsg,
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 0,
        delta: 'some code',
        partial: { role: 'assistant', content: [{ type: 'toolCall', id: 'edit-1', name: 'edit', arguments: { path: 'src/main.ts', text: 'some code' } }] } as unknown as Assistant,
      },
    });
    expect(changedDeltaEvents.map(e => e.event.type)).toEqual(['part.updated']);
    const changedPart = (changedDeltaEvents[0].event as Extract<typeof changedDeltaEvents[0]['event'], { type: 'part.updated' }>).part;
    if (changedPart.type === 'tool_call') {
      expect(changedPart.input).toEqual({ path: 'src/main.ts', text: 'some code' });
    }

    // 5. Another identical toolcall_delta: emits NO part.updated!
    const secondUnchangedEvents = projection.consume({
      type: 'message_update',
      message: assistantMsg,
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 0,
        delta: '',
        partial: { role: 'assistant', content: [{ type: 'toolCall', id: 'edit-1', name: 'edit', arguments: { path: 'src/main.ts', text: 'some code' } }] } as unknown as Assistant,
      },
    });
    expect(secondUnchangedEvents).toHaveLength(0);

    // 6. tool_stream_update forwards edit previews into part.updated
    const streamUpdateEvents = projection.consume({
      type: 'tool_stream_update',
      toolCallId: 'edit-1',
      toolName: 'edit',
      update: {
        files: [{ path: 'src/main.ts', diff: '-1|old\n+1|new', firstChangedLine: 1 }],
        streaming: true,
        generation: 1,
      },
    });
    expect(streamUpdateEvents.map(e => e.event.type)).toEqual(['part.updated']);
    const streamUpdatedPart = (streamUpdateEvents[0].event as Extract<typeof streamUpdateEvents[0]['event'], { type: 'part.updated' }>).part;
    if (streamUpdatedPart.type === 'tool_call' && streamUpdatedPart.editPreview) {
      expect(streamUpdatedPart.editPreview.files).toEqual([
        { path: 'src/main.ts', diff: '-1|old\n+1|new', firstChangedLine: 1 },
      ]);
      expect(streamUpdatedPart.editPreview.streaming).toBe(true);
    } else {
      expect(streamUpdatedPart.type).toBe('tool_call');
    }

    // 7. Following toolcall_delta retains the edit preview
    const followingDeltaEvents = projection.consume({
      type: 'message_update',
      message: assistantMsg,
      assistantMessageEvent: {
        type: 'toolcall_delta',
        contentIndex: 0,
        delta: ' more',
        partial: { role: 'assistant', content: [{ type: 'toolCall', id: 'edit-1', name: 'edit', arguments: { path: 'src/main.ts', text: 'some code more' } }] } as unknown as Assistant,
      },
    });
    expect(followingDeltaEvents.map(e => e.event.type)).toEqual(['part.updated']);
    const followingPart = (followingDeltaEvents[0].event as Extract<typeof followingDeltaEvents[0]['event'], { type: 'part.updated' }>).part;
    if (followingPart.type === 'tool_call' && followingPart.editPreview) {
      expect(followingPart.input).toEqual({ path: 'src/main.ts', text: 'some code more' });
      expect(followingPart.editPreview.files).toEqual([
        { path: 'src/main.ts', diff: '-1|old\n+1|new', firstChangedLine: 1 },
      ]);
    } else {
      expect(followingPart.type).toBe('tool_call');
    }

    // 8. message_end preserves editPreview on the completed tool_call part
    const completedMsg: Assistant = {
      role: 'assistant',
      content: [{ type: 'toolCall', id: 'edit-1', name: 'edit', arguments: { path: 'src/main.ts', text: 'some code more' } }],
      api: 'openai-completions', provider: 'fixture', model: 'fixture',
      stopReason: 'toolUse', timestamp: 30,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    };
    const endEvents = projection.consume({ type: 'message_end', message: completedMsg });
    const completedEntry = endEvents.find(e => e.event.type === 'part.completed');
    if (!completedEntry || completedEntry.event.type !== 'part.completed') throw new Error('Expected part.completed');
    const completedPart = completedEntry.event.part;
    expect(completedPart.type).toBe('tool_call');
    if (completedPart.type === 'tool_call' && completedPart.editPreview) {
      expect(completedPart.editPreview.files).toEqual([
        { path: 'src/main.ts', diff: '-1|old\n+1|new', firstChangedLine: 1 },
      ]);
    } else {
      expect(completedPart.type).toBe('tool_call');
    }
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('an async-result custom message projects a system row with structured job reports', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-async-result-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    projection.beginRun('run', 1);
    const prompt = { role: 'user' as const, content: 'Go', timestamp: 2 };
    projection.consume({ type: 'message_start', message: prompt });
    projection.consume({ type: 'message_end', message: prompt });
    const report = [
      '<system-notice>',
      '2 background jobs have completed. Resume your work using the results below.',
      '',
      '── Job SettingsAuditScout ──',
      '<task-result id="SettingsAuditScout" agent="scout" status="completed" duration="1.2s">',
      '<output>',
      '## Findings',
      'All clear.',
      '</output>',
      '</task-result>',
      '',
      'Agent: agent://SettingsAuditScout, history://SettingsAuditScout',
      '',
      '── Job job-2 ──',
      'raw bash output line',
      '</system-notice>',
    ].join('\n');
    const custom = {
      role: 'custom' as const,
      customType: 'async-result',
      content: report,
      display: true,
      details: {
        jobs: [
          { jobId: 'SettingsAuditScout', type: 'task', status: 'completed', agentId: 'SettingsAuditScout', label: 'Audit settings', durationMs: 1250 },
          { jobId: 'job-2', type: 'bash', status: 'completed', durationMs: 80 },
        ],
      },
      timestamp: 3,
    };
    projection.consume({ type: 'message_start', message: custom });
    const events = projection.consume({ type: 'message_end', message: custom });
    const created = events.find(e => e.event.type === 'message.created');
    if (!created || created.event.type !== 'message.created') throw new Error('Expected message.created');
    expect(created.event.role).toBe('system');
    const completed = events.find(e => e.event.type === 'part.completed');
    if (!completed || completed.event.type !== 'part.completed') throw new Error('Expected part.completed');
    const part = completed.event.part;
    expect(part).toMatchObject({ type: 'notice', noticeType: 'async_job_result', level: 'info' });
    if (part.type !== 'notice' || part.noticeType !== 'async_job_result') throw new Error('Expected async_job_result notice');
    const jobs = part.details.jobs;
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ jobId: 'SettingsAuditScout', subagentId: 'SettingsAuditScout', type: 'task', status: 'completed', label: 'Audit settings', durationMs: 1250 });
    expect(jobs[0]?.reportText).toBe('## Findings\nAll clear.');
    expect(jobs[0]?.reportText).not.toContain('task-result');
    expect(jobs[0]?.reportText).not.toContain('system-notice');
    expect(jobs[1]).toMatchObject({ jobId: 'job-2', type: 'bash', status: 'completed', durationMs: 80 });
    expect(jobs[1]?.reportText).toBe('raw bash output line');
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a persisted async-result entry rebuilds the same structured row on reload', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-async-history-'));
  const manager = SessionManager.create(root, root);
  let reopened: SessionManager | undefined;
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    projection.beginRun('run', 1);
    const prompt = { role: 'user' as const, content: 'Go', timestamp: 2 };
    projection.consume({ type: 'message_start', message: prompt });
    projection.consume({ type: 'message_end', message: prompt });
    manager.appendMessage(prompt);
    projection.bindPending();
    const report = [
      '<system-notice>',
      'Background job ScoutOne has completed. Resume your work using the result below.',
      '',
      '<task-result id="ScoutOne" agent="scout" status="failed (exit 1)" duration="4s">',
      '<error>provider exploded &lt;system-notice></error>',
      '<output>',
      'half-written report',
      '</output>',
      '</task-result>',
      '',
      'Agent: agent://ScoutOne, history://ScoutOne',
      '</system-notice>',
    ].join('\n');
    manager.appendCustomMessageEntry('async-result', report, true, {
      jobs: [{ jobId: 'ScoutOne', type: 'task', status: 'failed', agentId: 'ScoutOne', durationMs: 4000 }],
    }, 'agent', 3);
    await manager.flush();
    const file = manager.getSessionFile();
    if (!file) throw new Error('Native session file is required');
    await manager.close();
    reopened = await SessionManager.open(file, root, undefined, { initialCwd: root, throwIfMissing: true });
    const seed = new WorkerProjection(reopened, 'session').seed();
    const row = seed.messages.find(message => message.role === 'system');
    if (!row) throw new Error('Expected a system row for the async delivery');
    const part = row.parts.find(candidate => candidate.type === 'notice');
    if (!part || part.type !== 'notice' || part.noticeType !== 'async_job_result') throw new Error('Expected async_job_result notice');
    expect(part.level).toBe('error');
    expect(part.details.jobs).toHaveLength(1);
    expect(part.details.jobs[0]).toMatchObject({ jobId: 'ScoutOne', subagentId: 'ScoutOne', type: 'task', status: 'failed', durationMs: 4000 });
    expect(part.details.jobs[0]?.reportText).toBe('provider exploded <system-notice>\n\nhalf-written report');
  } finally {
    await reopened?.close();
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('a single non-task async job report drops the delivery headline and resume cue', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-async-bash-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const projection = new WorkerProjection(manager, 'session');
    projection.beginRun('run', 1);
    const prompt = { role: 'user' as const, content: 'Go', timestamp: 2 };
    projection.consume({ type: 'message_start', message: prompt });
    projection.consume({ type: 'message_end', message: prompt });
    const report = [
      '<system-notice>',
      'Background job bg-1 (npm test) has completed.',
      'Resume your work using the result below.',
      '',
      '12 tests passed, 0 failed',
      '</system-notice>',
    ].join('\n');
    const custom = {
      role: 'custom' as const,
      customType: 'async-result',
      content: report,
      display: true,
      details: { jobs: [{ jobId: 'bg-1', type: 'bash', status: 'completed', durationMs: 900 }] },
      timestamp: 3,
    };
    projection.consume({ type: 'message_start', message: custom });
    const events = projection.consume({ type: 'message_end', message: custom });
    const completed = events.find(e => e.event.type === 'part.completed');
    if (!completed || completed.event.type !== 'part.completed') throw new Error('Expected part.completed');
    const part = completed.event.part;
    if (part.type !== 'notice' || part.noticeType !== 'async_job_result') throw new Error('Expected async_job_result notice');
    expect(part.details.jobs[0]?.reportText).toBe('12 tests passed, 0 failed');
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('vibe_spawn correlates toolCallId, task, and concise description across tool_execution_start, update, and end', async () => {
  const root = await mkdtemp(join(tmpdir(), 'canonical-vibe-spawn-'));
  const manager = SessionManager.create(root, root);
  try {
    await manager.ensureOnDisk();
    const liveSubagents = new Map<string, Subagent>();
    const pendingEvents = new Map<string, SubagentEventObservation[]>();
    const toolCallToSubagentId = new Map<string, string>();
    const subagentFrames: ProjectionInput[] = [];
    const projector = new SubagentProjector(
      'session',
      liveSubagents,
      pendingEvents,
      toolCallToSubagentId,
      inputs => subagentFrames.push(...inputs),
      inputs => subagentFrames.push(...inputs),
    );
    const projection = new WorkerProjection(manager, 'session', [], undefined, text => text);
    const observe = (event: AgentSessionEvent) => {
      projection.consume(event);
      projector.observeSessionEvent(event, text => projection.publicText(text));
    };
    projection.beginRun('run', 1);
    const prompt = { role: 'user' as const, content: 'Run vibe worker', timestamp: 2 };
    observe({ type: 'message_start', message: prompt });
    observe({ type: 'message_end', message: prompt });

    observe({
      type: 'tool_execution_start',
      toolCallId: 'call-vibe-update',
      toolName: 'vibe_spawn',
      args: { cli: 'fast', name: 'disk-check', prompt: `Check disk usage in ${root}\nSummarize top directories` },
    });
    observe({
      type: 'tool_execution_update',
      toolCallId: 'call-vibe-update',
      toolName: 'vibe_spawn',
      args: { cli: 'fast', name: 'disk-check', prompt: `Check disk usage in ${root}\nSummarize top directories` },
      partialResult: {
        content: [{ type: 'text', text: 'Spawning...' }],
        details: { op: 'spawn', spawned: { id: 'disk-check', cli: 'fast', jobId: 'job-1' } },
      },
    });
    projector.handleSubagentLifecycle({
      id: 'disk-check',
      agent: 'sonic',
      agentSource: 'bundled',
      description: 'vibe fast session',
      status: 'started',
      index: 0,
      detached: true,
    });
    observe({
      type: 'tool_execution_end',
      toolCallId: 'call-vibe-update',
      toolName: 'vibe_spawn',
      result: {
        content: [{ type: 'text', text: 'Spawned fast session `disk-check`.' }],
        details: { op: 'spawn', spawned: { id: 'disk-check', cli: 'fast', jobId: 'job-1' } },
      },
      isError: false,
    });

    expect(liveSubagents.get('disk-check')).toMatchObject({
      subagentId: 'disk-check',
      toolCallId: 'call-vibe-update',
      description: 'Check disk usage in [workspace]',
      task: 'Check disk usage in [workspace]\nSummarize top directories',
    });
    expect(subagentFrames).toHaveLength(1);

    projector.handleSubagentLifecycle({
      id: 'late-worker',
      agent: 'task',
      agentSource: 'bundled',
      description: 'vibe good session',
      status: 'started',
      index: 1,
      detached: true,
    });
    observe({
      type: 'tool_execution_start',
      toolCallId: 'call-vibe-late',
      toolName: 'vibe_spawn',
      args: { cli: 'good', prompt: 'Refactor parser module\nKeep public types stable' },
    });
    observe({
      type: 'tool_execution_end',
      toolCallId: 'call-vibe-late',
      toolName: 'vibe_spawn',
      result: {
        content: [{ type: 'text', text: 'Spawned good session `late-worker`.' }],
        details: { op: 'spawn', spawned: { id: 'late-worker', cli: 'good', jobId: 'job-2' } },
      },
      isError: false,
    });

    expect(liveSubagents.get('late-worker')).toMatchObject({
      subagentId: 'late-worker',
      toolCallId: 'call-vibe-late',
      description: 'Refactor parser module',
      task: 'Refactor parser module\nKeep public types stable',
    });
    expect(subagentFrames).toHaveLength(3);

    observe({
      type: 'tool_execution_start',
      toolCallId: 'call-vibe-err',
      toolName: 'vibe_spawn',
      args: { cli: 'fast', prompt: 'Should fail' },
    });
    observe({
      type: 'tool_execution_end',
      toolCallId: 'call-vibe-err',
      toolName: 'vibe_spawn',
      result: {
        content: [{ type: 'text', text: 'Spawn failed' }],
        details: { op: 'spawn', spawned: { id: 'failed-worker', cli: 'fast', jobId: 'job-3' } },
      },
      isError: true,
    });
    projector.handleSubagentLifecycle({
      id: 'failed-worker',
      agent: 'sonic',
      agentSource: 'bundled',
      description: 'vibe fast session',
      status: 'started',
      index: 2,
      detached: true,
    });
    expect(liveSubagents.get('failed-worker')?.toolCallId).toBeUndefined();
    expect(liveSubagents.get('failed-worker')?.description).toBe('vibe fast session');
  } finally {
    await manager.close();
    await rm(root, { recursive: true, force: true });
  }
});
