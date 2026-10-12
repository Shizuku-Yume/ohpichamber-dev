import { describe, expect, test } from 'bun:test';
import { CanonicalEventSchema, StreamInvalidatedSchema } from './events.ts';

const envelope = { sessionId: 'session_1', epoch: 'epoch_1', sequence: '9007199254740993', timestamp: 1 };

describe('canonical event boundaries', () => {
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
    const metadata = { ...envelope, type: 'session.updated', metadata: { title: 'Renamed' }, metadataRevision: '2' };
    expect(CanonicalEventSchema.parse(metadata)).toEqual(metadata);
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'session.updated', metadata: { title: 'Renamed' } }).success).toBe(false);
    expect(CanonicalEventSchema.safeParse({ ...metadata, metadataRevision: '0' }).success).toBe(false);
    expect(CanonicalEventSchema.parse({ ...envelope, type: 'session.updated', metadata: null, metadataRevision: '0' })).toEqual({ ...envelope, type: 'session.updated', metadata: null, metadataRevision: '0' });
    const archive = { ...envelope, type: 'session.updated', archivedAt: null, archiveRevision: '3' };
    expect(CanonicalEventSchema.parse(archive)).toEqual(archive);
    expect(CanonicalEventSchema.safeParse({ ...archive, archiveRevision: undefined }).success).toBe(false);
  });

  test('inner cycles do not imply outer completion and live status identifies the active run', () => {
    expect(CanonicalEventSchema.parse({ ...envelope, type: 'turn.completed', turnId: 'turn_1', runId: 'run_1' }).type).toBe('turn.completed');
    expect(CanonicalEventSchema.parse({ ...envelope, type: 'run.completed', runId: 'run_1', finishedAt: 2 }).type).toBe('run.completed');
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'run.completed', runId: 'run_1', turnId: 'turn_1', finishedAt: 2 }).success).toBe(false);
    expect(CanonicalEventSchema.parse({ ...envelope, type: 'session.status', runtimeStatus: 'running', activeRunId: 'run_1' }).type).toBe('session.status');
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'session.status', runtimeStatus: 'running', activeRunId: null }).success).toBe(false);
    expect(CanonicalEventSchema.safeParse({ ...envelope, type: 'tool.completed', toolCallId: 'tool_1', status: 'running', isError: false }).success).toBe(false);
  });
});
