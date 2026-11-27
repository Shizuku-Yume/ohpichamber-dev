import { describe, expect, test } from 'bun:test';
import type { CanonicalEvent, StreamInvalidated } from '@openchamber/agent-contract';
import { ProjectionError, SessionJournal } from './journal.ts';
import type { ProjectionEvent, ProjectionInput, ProjectionSeed } from './protocol.ts';
import { ProjectionInputSchema, ProjectionSeedSchema } from './protocol.ts';

const session = { sessionId: 's', projectId: 'p', workspaceId: 'w', displayPath: '.', rootSessionId: 's' };
const seed: ProjectionSeed = { createdAt: 1, updatedAt: 1, mode: { kind: 'main' }, branch: { branchId: 'branch:opaque', branchVersion: '1', leafMessageId: null }, turns: [], messages: [] };
const input = (event: ProjectionEvent, timestamp = 2): ProjectionInput => ({ timestamp, event });
function cursorFailure(journal: SessionJournal, cursor?: string) {
  try { journal.subscribe(cursor, () => { }); }
  catch (error) { if (error instanceof ProjectionError) return { status: error.status, code: error.code }; throw error; }
  throw new Error('Cursor was accepted');
}
function begin(journal: SessionJournal): void {
  journal.append([
    input({ type: 'run.started', runId: 'r', createdAt: 2 }),
    input({ type: 'turn.started', turnId: 't', runId: 'r', userMessageId: 'u' }),
    input({ type: 'message.created', messageId: 'u', turnId: 't', role: 'user' }),
    input({ type: 'part.started', messageId: 'u', part: { type: 'text', partId: 'up', content: 'hello' } }),
    input({ type: 'message.created', messageId: 'm', turnId: 't', role: 'assistant' }),
    input({ type: 'part.started', messageId: 'm', part: { type: 'text', partId: 'mp', content: '' } }),
  ]);
}

describe('SessionJournal consumer boundary', () => {
  test('unstamped projections retain Canonical payload refinements and reject envelopes', () => {
    const parse = (event: unknown) => ProjectionInputSchema.safeParse({ timestamp: 1, event });
    expect(parse({ type: 'session.updated', title: 'Renamed' }).success).toBe(true);
    expect(parse({ type: 'session.updated', metadata: null, metadataRevision: '0' }).success).toBe(true);
    expect(parse({ type: 'session.updated' }).success).toBe(false);
    expect(parse({ type: 'session.updated', metadata: null }).success).toBe(false);
    expect(parse({ type: 'session.updated', metadata: null, metadataRevision: '1' }).success).toBe(false);
    expect(parse({ type: 'session.updated', archivedAt: null }).success).toBe(false);
    expect(parse({ type: 'session.updated', title: 'Renamed', sessionId: 'forged' }).success).toBe(false);
    expect(parse({ type: 'session.status', runtimeStatus: 'idle', activeRunId: null }).success).toBe(true);
    expect(parse({ type: 'session.status', runtimeStatus: 'running', activeRunId: 'run' }).success).toBe(true);
    expect(parse({ type: 'session.status', runtimeStatus: 'idle', activeRunId: 'run' }).success).toBe(false);
    expect(parse({ type: 'session.status', runtimeStatus: 'running', activeRunId: null }).success).toBe(false);
    expect(ProjectionSeedSchema.parse(seed)).toEqual(seed);
    expect(ProjectionSeedSchema.safeParse({ ...seed, branch: undefined }).success).toBe(false);
  });

  test('mode changes reach two subscribers and recovery snapshots without Host state', () => {
    const journal = new SessionJournal(session, seed);
    const first: (CanonicalEvent | StreamInvalidated)[] = [];
    const second: (CanonicalEvent | StreamInvalidated)[] = [];
    const unsubscribeFirst = journal.subscribe(journal.snapshot().cursor, event => first.push(event)).unsubscribe;
    const unsubscribeSecond = journal.subscribe(journal.snapshot().cursor, event => second.push(event)).unsubscribe;
    const mode = { kind: 'plan', status: 'active', planReference: 'local://PLAN.md' } as const;
    journal.append([input({ type: 'session.updated', mode })]);
    expect(journal.snapshot().session.mode).toEqual(mode);
    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ type: 'session.updated', mode });
    expect(journal.subscribe(`${journal.runtime().epoch}:0`, () => { }).replay).toEqual(first);
    journal.replace({ ...seed, mode: { ...mode, status: 'paused' } });
    expect(journal.snapshot().session.mode).toEqual({ ...mode, status: 'paused' });
    unsubscribeFirst();
    unsubscribeSecond();
    journal.close();
  });
  test('projects continuation pending updates through live journal events', () => {
    const journal = new SessionJournal(session, seed);
    const live: (CanonicalEvent | StreamInvalidated)[] = [];
    const subscription = journal.subscribe(journal.snapshot().cursor, event => live.push(event));
    expect(journal.runtime()).toMatchObject({ runtimeStatus: 'idle', activeRunId: null, continuationPending: false });

    journal.append([input({ type: 'session.updated', continuationPending: true })]);
    expect(journal.runtime()).toMatchObject({ runtimeStatus: 'idle', activeRunId: null, continuationPending: true });
    expect(live.at(-1)).toMatchObject({ type: 'session.updated', continuationPending: true });

    journal.append([input({ type: 'session.updated', continuationPending: false })]);
    expect(journal.runtime()).toMatchObject({ runtimeStatus: 'idle', activeRunId: null, continuationPending: false });
    expect(live.at(-1)).toMatchObject({ type: 'session.updated', continuationPending: false });
    subscription.unsubscribe();
    journal.close();
  });
  test('snapshots reflect loop updates without replaying events and drop the loop when the worker exits', () => {
    const journal = new SessionJournal(session, seed);
    expect(journal.snapshot().session.loop).toBeUndefined();

    const loop = { active: true, iteration: 1, maxIterations: 4 };
    journal.append([input({ type: 'session.updated', loop })]);
    expect(journal.snapshot().session.loop).toEqual(loop);
    expect(journal.subscribe(journal.snapshot().cursor, () => { }).replay).toEqual([]);

    const next = { ...loop, iteration: 2 };
    journal.replace({ ...seed, loop: next });
    expect(journal.snapshot().session.loop).toEqual(next);
    journal.append([input({ type: 'session.updated', title: 'Renamed' })]);
    expect(journal.snapshot().session.loop).toEqual(next);

    const stopped = { active: false, iteration: 0 };
    journal.append([input({ type: 'session.updated', loop: stopped })]);
    expect(journal.snapshot().session.loop).toEqual(stopped);

    journal.append([input({ type: 'session.updated', loop })]);
    journal.unavailable();
    expect(journal.snapshot().session.loop).toBeUndefined();
    journal.replace(seed);
    expect(journal.snapshot().session.loop).toBeUndefined();
  });
  test('transient events never advance or collide with the first durable cursor', () => {
    const journal = new SessionJournal(session, seed);
    const transient: CanonicalEvent[] = [];
    const subscription = journal.subscribe(journal.snapshot().cursor, event => {
      if (event.type !== 'stream.invalidated') transient.push(event);
    });
    journal.append([{ ...input({ type: 'btw.delta', recordId: 'record', delta: 'ephemeral' }), transient: true }]);
    const durable = journal.append([input({ type: 'session.updated', mode: { kind: 'main' } })]);
    expect(transient[0]).toMatchObject({ type: 'btw.delta', sequence: '1' });
    expect(durable[0]).toMatchObject({ type: 'session.updated', sequence: '2' });
    expect(subscription.replay).toEqual([]);
    expect(journal.subscribe(`${journal.runtime().epoch}:1`, () => { }).replay).toEqual(durable);
  });
  test('replay covers its exact ring boundary and distinguishes invalid from unavailable cursors', () => {
    const journal = new SessionJournal(session, seed);
    const events = journal.append(Array.from({ length: 1001 }, (_, index) => input({ type: 'tool.started', toolCallId: `tool${index}`, toolName: 'bash', input: {} })));
    const epoch = journal.runtime().epoch;
    const replay = journal.subscribe(`${epoch}:1`, () => { }).replay;
    expect(replay.map(event => event.sequence)).toEqual(events.slice(1).map(event => event.sequence));
    expect(cursorFailure(journal, `${epoch}:0`)).toEqual({ status: 410, code: 'RESYNC_REQUIRED' });
    expect(cursorFailure(journal)).toEqual({ status: 410, code: 'RESYNC_REQUIRED' });
    for (const cursor of [`${epoch}:01`, `${epoch}:18446744073709551616`, 'broken']) {
      expect(cursorFailure(journal, cursor)).toEqual({ status: 400, code: 'INVALID_CURSOR' });
    }
    expect(cursorFailure(journal, `${epoch}:1002`)).toEqual({ status: 410, code: 'RESYNC_REQUIRED' });
  });

  test('snapshot is immutable and a failed tool does not terminate the outer run', () => {
    const journal = new SessionJournal(session, seed);
    begin(journal);
    journal.append([
      input({ type: 'part.started', messageId: 'm', part: { type: 'tool_call', partId: 'tp', toolCallId: 'call', toolName: 'bash', input: { arguments: ['first'] }, status: 'approved' } }),
      input({ type: 'part.completed', part: { type: 'tool_call', partId: 'tp', toolCallId: 'call', toolName: 'bash', input: { arguments: ['first'] }, status: 'approved' } }),
      input({ type: 'tool.started', toolCallId: 'call', toolName: 'bash', input: { arguments: ['first'] } }),
      input({ type: 'part.delta', partId: 'mp', delta: 'partial' }),
    ]);
    const snapshot = journal.snapshot();
    const argumentsPart = snapshot.messages.flatMap(message => message.parts).find(part => part.type === 'tool_call');
    if (!argumentsPart || !Array.isArray(argumentsPart.input.arguments)) throw new Error('Tool arguments missing');
    argumentsPart.input.arguments[0] = 'changed';
    journal.append([input({ type: 'tool.completed', toolCallId: 'call', status: 'failed', isError: true, error: 'Command failed' })]);
    const current = journal.snapshot();
    expect(current.activeRun?.runId).toBe('r');
    expect(current.messages.flatMap(message => message.parts).find(part => part.type === 'tool_call')).toMatchObject({ status: 'failed', input: { arguments: ['first'] } });
    expect(snapshot.messages.flatMap(message => message.parts).find(part => part.type === 'tool_call')?.status).toBe('running');
    journal.append([input({ type: 'run.failed', runId: 'r', finishedAt: 3, error: 'Provider request failed' }, 3)]);
    expect(journal.snapshot()).toMatchObject({ activeRun: null, session: { runtimeStatus: 'idle' }, turns: [{ status: 'failed' }] });
    expect(journal.snapshot().messages.flatMap(message => message.parts).find(part => part.type === 'text' && part.partId === 'mp')?.content).toBe('partial');
  });

  test('tool results stay between assistant messages in live and restored snapshots', () => {
    const journal = new SessionJournal(session, seed);
    begin(journal);
    journal.append([
      input({ type: 'part.started', messageId: 'm', part: { type: 'tool_call', partId: 'call-part', toolCallId: 'edit-call', toolName: 'edit', input: { path: 'example.ts' }, status: 'running' } }),
      input({ type: 'message.created', messageId: 'result', turnId: 't', role: 'system' }),
      input({ type: 'part.started', messageId: 'result', part: { type: 'tool_result', partId: 'result-part', toolCallId: 'edit-call', toolName: 'edit', output: { content: [{ type: 'text', text: 'Edited example.ts' }] }, isError: false } }),
      input({ type: 'tool.completed', toolCallId: 'edit-call', status: 'completed', isError: false }),
      input({ type: 'message.created', messageId: 'answer', turnId: 't', role: 'assistant' }),
      input({ type: 'part.started', messageId: 'answer', part: { type: 'text', partId: 'answer-part', content: 'The file is updated.' } }),
      input({ type: 'turn.completed', turnId: 't', runId: 'r' }),
      input({ type: 'run.completed', runId: 'r', finishedAt: 3 }, 3),
    ]);
    const snapshot = journal.snapshot();
    expect(snapshot.messages.map(message => message.messageId)).toEqual(['u', 'm', 'result', 'answer']);
    expect(snapshot.branch.leafMessageId).toBe('answer');
    expect(snapshot.window.lastMessageId).toBe('answer');
    expect(snapshot.messages).toEqual(journal.history({ sessionId: 's' }).messages);
    expect(snapshot.messages[1]?.parts.find(part => part.type === 'tool_call')).toMatchObject({ status: 'completed' });
    journal.replace({ ...seed, branch: snapshot.branch, turns: snapshot.turns, messages: snapshot.messages });
    const restored = journal.snapshot();
    expect(restored.messages).toEqual(snapshot.messages);
    expect(restored.window).toEqual(snapshot.window);
    expect(restored.activeRun).toBeNull();
  });

  test('replay/live handoff is contiguous; restart retains partial output but expires old activity', () => {
    const journal = new SessionJournal(session, seed);
    begin(journal);
    const captured = journal.snapshot();
    const live: (CanonicalEvent | StreamInvalidated)[] = [];
    const subscription = journal.subscribe(captured.cursor, event => live.push(event));
    journal.append([input({ type: 'part.delta', partId: 'mp', delta: 'kept' })]);
    expect(subscription.replay).toEqual([]);
    expect(live).toMatchObject([{ type: 'part.delta', sequence: '7', delta: 'kept' }]);
    journal.unavailable();
    expect(live.at(-1)).toMatchObject({ type: 'stream.invalidated', epoch: captured.session.epoch, reason: 'EPOCH_CHANGED' });
    expect(cursorFailure(journal, captured.cursor)).toEqual({ status: 410, code: 'RESYNC_REQUIRED' });
    const interrupted = journal.snapshot();
    expect(interrupted).toMatchObject({ session: { runtimeStatus: 'unavailable', activeRunId: null }, activeRun: null, turns: [{ status: 'failed' }] });
    expect(interrupted.messages.flatMap(message => message.parts).find(part => part.type === 'text' && part.partId === 'mp')?.content).toBe('kept');
    journal.replace({ ...seed, branch: interrupted.branch, turns: interrupted.turns, messages: interrupted.messages });
    expect(journal.runtime()).toMatchObject({ runtimeStatus: 'idle', activeRunId: null, headSequence: '0' });
  });

  test('history cursors bind opaque branch identity and the selected leaf', () => {
    const journal = new SessionJournal(session, seed);
    begin(journal);
    journal.append([
      input({ type: 'turn.completed', turnId: 't', runId: 'r' }),
      input({ type: 'turn.started', turnId: 't2', runId: 'r', userMessageId: 'u' }),
      input({ type: 'message.created', messageId: 'm2', turnId: 't2', role: 'assistant' }),
    ]);
    const first = journal.history({ sessionId: 's', limit: 1 });
    if (!first.nextCursor) throw new Error('History continuation missing');
    const second = journal.history({ sessionId: 's', limit: 1, cursor: first.nextCursor });
    expect(second.turns.map(turn => turn.turnId)).toEqual(['t2']);
    expect(second.messages.map(message => message.messageId)).toEqual(['m2']);
    expect(() => journal.history({ sessionId: 's', limit: 1, cursor: first.nextCursor, leafTurnId: 't' })).toThrow(ProjectionError);
    journal.append([input({ type: 'message.created', messageId: 'm3', turnId: 't2', role: 'assistant' })]);
    expect(() => journal.history({ sessionId: 's', cursor: first.nextCursor })).toThrow(ProjectionError);
  });

  test('projects live compacting state, clears it on session.compacted/unavailable, and tracks todos across updates and seeds', () => {
    const todos = [{ name: 'Build', tasks: [{ content: 'Wire projection', status: 'in_progress' as const }] }];
    const compacting = { method: 'soft-compacted' as const, reason: 'threshold' as const, startedAt: 10 };
    const journal = new SessionJournal(session, { ...seed, compacting, todos });
    expect(journal.snapshot().compacting).toEqual(compacting);
    expect(journal.snapshot().todos).toEqual(todos);

    journal.append([input({ type: 'session.compacted', compactionId: 'c1', method: 'soft-compacted', tokensBefore: 100, completedAt: 20 })]);
    expect(journal.snapshot().compacting).toBeNull();
    expect(journal.snapshot().todos).toEqual(todos);

    const nextCompacting = { method: 'shaken' as const, startedAt: 30 };
    const nextTodos = [{ name: 'Build', tasks: [{ content: 'Wire projection', status: 'completed' as const }] }];
    journal.append([
      input({ type: 'session.updated', compacting: nextCompacting }),
      input({ type: 'session.updated', todos: nextTodos }),
    ]);
    expect(journal.snapshot().compacting).toEqual(nextCompacting);
    expect(journal.snapshot().todos).toEqual(nextTodos);

    journal.append([input({ type: 'session.updated', compacting: null }), input({ type: 'session.updated', todos: [] })]);
    expect(journal.snapshot().compacting).toBeNull();
    expect(journal.snapshot().todos).toEqual([]);

    journal.append([input({ type: 'session.updated', compacting: nextCompacting })]);
    journal.unavailable('worker exited');
    expect(journal.snapshot().compacting).toBeNull();

    journal.replace({ ...seed, todos });
    expect(journal.snapshot().compacting).toBeNull();
    expect(journal.snapshot().todos).toEqual(todos);
    journal.close();
  });

  test('session.compacted clears compacting and materializes settled compaction notice message valid under SessionSnapshotSchema', () => {
    const journal = new SessionJournal(session, seed);
    begin(journal);
    const initialBranchVersion = BigInt(journal.snapshot().branch.branchVersion);

    journal.append([input({ type: 'session.updated', compacting: { method: 'soft-compacted', reason: 'threshold', startedAt: 10 } }, 10)]);
    expect(journal.snapshot().compacting).toEqual({ method: 'soft-compacted', reason: 'threshold', startedAt: 10 });

    journal.append([input({
      type: 'session.compacted',
      compactionId: 'c-live',
      method: 'soft-compacted',
      tokensBefore: 11300,
      tokensAfter: 2400,
      summary: 'Compacted summary',
      warning: 'Low headroom',
      completedAt: 25,
    }, 25)]);

    const snapshot = journal.snapshot();
    expect(snapshot.compacting).toBeNull();
    expect(snapshot.branch.leafMessageId).toBe('c-live');
    expect(BigInt(snapshot.branch.branchVersion)).toBe(initialBranchVersion + 1n);
    expect(snapshot.turns.at(-1)?.assistantMessageIds).toEqual(['m', 'c-live']);
    expect(snapshot.messages.at(-1)).toEqual({
      messageId: 'c-live',
      sessionId: 's',
      turnId: 't',
      role: 'assistant',
      createdAt: 25,
      parts: [{
        type: 'notice',
        partId: 'c-live:compaction',
        noticeType: 'compaction',
        level: 'info',
        details: {
          method: 'soft-compacted',
          tokensBefore: 11300,
          tokensAfter: 2400,
          summary: 'Compacted summary',
          warning: 'Low headroom',
        },
      }],
    });
    expect(snapshot.window.lastMessageId).toBe('c-live');
    expect(journal.history({ sessionId: 's' }).messages.at(-1)?.messageId).toBe('c-live');

    // Duplicate compactionId does not double-materialize
    journal.append([input({
      type: 'session.compacted',
      compactionId: 'c-live',
      method: 'soft-compacted',
      tokensBefore: 11300,
      completedAt: 25,
    }, 26)]);
    expect(journal.snapshot().messages.filter(m => m.messageId === 'c-live')).toHaveLength(1);
    journal.close();
  });

  test('reconstructs run records from seeded turns so a cold replay reports the settled truth', () => {
    const turn = (overrides) => ({
      turnId: 't1', sessionId: 's', runId: 'r1', userMessageId: 'u1', assistantMessageIds: [],
      status: 'completed', startedAt: 100, finishedAt: 160, ...overrides,
    });
    const seeded = (turns) => ({ ...seed, turns, messages: [] });
    // A run whose last turn settled terminally replays that terminal state:
    // the cold journal never fabricates 'running' for a run the transcript
    // already settled.
    const settled = new SessionJournal(session, seeded([turn({})]));
    expect(settled.run('r1')).toMatchObject({ runId: 'r1', status: 'completed', createdAt: 100, finishedAt: 160 });
    settled.close();
    const failed = new SessionJournal(session, seeded([turn({ status: 'failed', error: 'interrupted' })]));
    expect(failed.run('r1')).toMatchObject({ status: 'failed', error: 'interrupted', finishedAt: 160 });
    failed.close();
    // A multi-turn run takes its state from the last turn and its creation
    // from the first: intermediate settled turns do not close the run early.
    const multi = new SessionJournal(session, seeded([
      turn({ turnId: 't1', startedAt: 100, finishedAt: 120 }),
      turn({ turnId: 't2', status: 'running', startedAt: 130, finishedAt: undefined }),
    ]));
    expect(multi.run('r1')).toMatchObject({ runId: 'r1', status: 'running', createdAt: 100 });
    expect(multi.run('r1')?.finishedAt).toBeUndefined();
    multi.close();
    // Event-sourced records win over reconstruction: a live run.started that
    // the seed's turns do not know stays the authority across a reseed.
    const live = new SessionJournal(session, seeded([turn({})]));
    live.append([input({ type: 'run.started', runId: 'r-live', createdAt: 300 }, 300)]);
    live.replaceInitialSeed(seeded([turn({})]));
    expect(live.run('r-live')).toMatchObject({ status: 'running', createdAt: 300 });
    expect(live.run('r1')).toMatchObject({ status: 'completed' });
    live.close();
  });
});
