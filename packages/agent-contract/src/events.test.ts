import { describe, expect, test } from 'bun:test';
import { CanonicalEventSchema, StreamInvalidatedSchema } from './events.ts';

const envelope = { sessionId: 'session_1', epoch: 'epoch_1', sequence: '9007199254740993', timestamp: 1 };

describe('canonical event boundaries', () => {
  test('session updates preserve authoritative plan state and reject Host paths', () => {
    const session = {
      sessionId: envelope.sessionId, rootSessionId: envelope.sessionId, projectId: 'project_1', workspaceId: 'workspace_1',
      displayPath: '.', createdAt: 1, updatedAt: 1, epoch: envelope.epoch, headSequence: envelope.sequence,
      runtimeStatus: 'idle', activeRunId: null,
      mode: { kind: 'plan', status: 'active', planReference: 'local://PLAN.md' },
    };
    const event = { ...envelope, type: 'session.updated', session };
    expect(CanonicalEventSchema.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
    expect(CanonicalEventSchema.safeParse({ ...event, session: { ...session, mode: { ...session.mode, planReference: '/host/PLAN.md' } } }).success).toBe(false);
    const modeOnly = { ...envelope, type: 'session.updated', mode: session.mode };
    expect(CanonicalEventSchema.parse(modeOnly)).toEqual(modeOnly);
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'session.updated' }).success).toBe(false);
  });
  test('data events retain exact uint64 sequences; invalidation never advances a cursor', () => {
    const delta = { ...envelope, type: 'part.delta', partId: 'part_1', delta: 'hello' };
    expect(CanonicalEventSchema.parse(JSON.parse(JSON.stringify(delta)))).toEqual(delta);
    expect(CanonicalEventSchema.safeParse({ ...delta, sequence: '0' }).success).toBe(false);
    expect(CanonicalEventSchema.safeParse({ ...delta, sequence: 9007199254740992 }).success).toBe(false);
    const invalidated = { type: 'stream.invalidated', sessionId: 'session_1', epoch: 'epoch_2', reason: 'EPOCH_CHANGED' };
    expect(StreamInvalidatedSchema.parse(invalidated)).toEqual(invalidated);
    expect(StreamInvalidatedSchema.safeParse({ ...invalidated, sequence: '1' }).success).toBe(false);
    expect(CanonicalEventSchema.safeParse(invalidated).success).toBe(false);
  });

  test('Host metadata and archive carry separate exact revisions', () => {
    const metadata = { ...envelope, type: 'session.updated', metadata: { folder: 'Renamed' }, metadataRevision: '2' };
    expect(CanonicalEventSchema.parse(metadata)).toEqual(metadata);
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'session.updated', metadata: { folder: 'Renamed' } }).success).toBe(false);
    expect(CanonicalEventSchema.safeParse({ ...metadata, metadataRevision: '0' }).success).toBe(false);
    expect(CanonicalEventSchema.parse({ ...envelope, type: 'session.updated', metadata: null, metadataRevision: '0' })).toEqual({ ...envelope, type: 'session.updated', metadata: null, metadataRevision: '0' });
    const archive = { ...envelope, type: 'session.updated', archivedAt: null, archiveRevision: '3' };
    expect(CanonicalEventSchema.parse(archive)).toEqual(archive);
    expect(CanonicalEventSchema.safeParse({ ...archive, archiveRevision: undefined }).success).toBe(false);
    const selection = { ...envelope, type: 'session.updated', selection: { model: { providerId: 'provider_1', modelId: 'model_1' }, thinkingLevel: 'off' } };
    expect(CanonicalEventSchema.parse(selection)).toEqual(selection);
    expect(CanonicalEventSchema.safeParse({ ...selection, selection: { model: null, thinkingLevel: null } }).success).toBe(true);
    expect(CanonicalEventSchema.safeParse({ ...selection, selection: { model: null, thinkingLevel: '' } }).success).toBe(false);
  });

  test('inner cycles do not imply outer completion and live status identifies the active run', () => {
    expect(CanonicalEventSchema.parse({ ...envelope, type: 'turn.completed', turnId: 'turn_1', runId: 'run_1' }).type).toBe('turn.completed');
    expect(CanonicalEventSchema.parse({ ...envelope, type: 'run.completed', runId: 'run_1', finishedAt: 2 }).type).toBe('run.completed');
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'run.completed', runId: 'run_1', turnId: 'turn_1', finishedAt: 2 }).success).toBe(false);
    expect(CanonicalEventSchema.parse({ ...envelope, type: 'session.status', runtimeStatus: 'running', activeRunId: 'run_1' }).type).toBe('session.status');
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'session.status', runtimeStatus: 'running', activeRunId: null }).success).toBe(false);
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'tool.completed', toolCallId: 'tool_1', status: 'running', isError: false }).success).toBe(false);
    const failed = { ...envelope, type: 'tool.completed', toolCallId: 'tool_1', status: 'failed', isError: true, error: 'Command failed', errorKind: 'timeout' };
    expect(CanonicalEventSchema.parse(failed)).toEqual(failed);
    expect(CanonicalEventSchema.safeParse({ ...failed, errorKind: '' }).success).toBe(false);
  });

  test('a step timing rides the message lifecycle events and restores with the message', () => {
    const timing = { startedAt: 1, firstTokenAt: 40, completedAt: 900 };
    const created = { ...envelope, type: 'message.created', messageId: 'm1', turnId: 't1', role: 'assistant', providerId: 'p', modelId: 'm', timing };
    expect(CanonicalEventSchema.parse(JSON.parse(JSON.stringify(created)))).toEqual(created);
    const updated = { ...envelope, type: 'message.updated', messageId: 'm1', providerId: 'p', modelId: 'm', timing };
    expect(CanonicalEventSchema.parse(JSON.parse(JSON.stringify(updated)))).toEqual(updated);
    // A user or notice row carries no timing, and an untimed creation stays valid.
    const untimed = { ...envelope, type: 'message.created', messageId: 'm2', turnId: 't1', role: 'user' };
    expect(CanonicalEventSchema.parse(untimed)).toEqual(untimed);
    expect(CanonicalEventSchema.safeParse({ ...created, timing: { startedAt: 0.5 } }).success).toBe(false);
  });

  test('session suggestions carry non-empty text and envelope metadata', () => {
    const suggestion = { ...envelope, type: 'session.suggestion', suggestion: 'Run tests next.', createdAt: 2 };
    expect(CanonicalEventSchema.parse(suggestion)).toEqual(suggestion);
    expect(CanonicalEventSchema.safeParse({ ...suggestion, suggestion: '' }).success).toBe(false);
  });

  test('session.updated accepts compacting and todos updates and validates method/status bounds', () => {
    const compactingStart = {
      ...envelope,
      type: 'session.updated',
      compacting: { method: 'soft-compacted', reason: 'threshold', startedAt: 10 },
    };
    expect(CanonicalEventSchema.parse(compactingStart)).toEqual(compactingStart);
    const compactingClear = { ...envelope, type: 'session.updated', compacting: null };
    expect(CanonicalEventSchema.parse(compactingClear)).toEqual(compactingClear);
    expect(CanonicalEventSchema.safeParse({ ...compactingStart, compacting: { method: 'unknown', startedAt: 10 } }).success).toBe(false);
    expect(CanonicalEventSchema.safeParse({ ...compactingStart, compacting: { method: 'shaken', reason: 'other', startedAt: 10 } }).success).toBe(false);

    const todosUpdate = {
      ...envelope,
      type: 'session.updated',
      todos: [
        {
          name: 'Phase 1',
          tasks: [
            { content: 'Write tests', status: 'in_progress' },
            { content: 'Deploy', status: 'pending' },
          ],
        },
      ],
    };
    expect(CanonicalEventSchema.parse(todosUpdate)).toEqual(todosUpdate);
    expect(CanonicalEventSchema.parse({ ...envelope, type: 'session.updated', todos: [] })).toEqual({
      ...envelope,
      type: 'session.updated',
      todos: [],
    });
    expect(CanonicalEventSchema.safeParse({
      ...todosUpdate,
      todos: [{ name: 'Phase 1', tasks: [{ content: 'Bad', status: 'done' }] }],
    }).success).toBe(false);
    expect(CanonicalEventSchema.safeParse({
      ...todosUpdate,
      todos: [{ name: 'Phase 1', tasks: [{ content: 'Legacy', status: 'blocked', blocker: 'Waiting' }] }],
    }).success).toBe(false);
    expect(CanonicalEventSchema.safeParse({
      ...todosUpdate,
      todos: [{ name: 'Phase 1', tasks: [{ content: 'Extra', status: 'pending', details: 'nope' }] }],
    }).success).toBe(false);

    for (const method of ['soft-compacted', 'snap-compacted', 'shaken', 'remote-compacted', 'handed-off', 'compacted']) {
      const compacted = { ...envelope, type: 'session.compacted', compactionId: 'c1', method, tokensBefore: 100, completedAt: 12 };
      expect(CanonicalEventSchema.parse(compacted)).toEqual(compacted);
    }
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'session.compacted', compactionId: 'c1', method: 'invalid', tokensBefore: 100, completedAt: 12 }).success).toBe(false);
  });
});
