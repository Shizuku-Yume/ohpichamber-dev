import { describe, expect, test } from 'bun:test';
import {
  TurnDiffFileProvenanceSchema,
  TurnDiffFileSchema,
  TurnDiffFileStatusSchema,
  TurnDiffProvenanceAgentSchema,
  TurnDiffSchema,
  TurnDiffStateSchema,
} from './turn-diff.ts';

const provenance = { tool: 'edit', agent: 'session', at: 1774201002000 };
const subagentProvenance = { tool: 'write', agent: 'subagent', subagentId: 'subagent_1', at: 1774201002100 };

const readyFile = {
  path: 'src/a.ts',
  status: 'modified',
  before: 'const a = 1;\n',
  after: 'const a = 2;\n',
  patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-const a = 1;\n+const a = 2;\n',
  additions: 1,
  deletions: 1,
  provenance: [provenance],
  truncated: false,
  incomplete: false,
};

const readyDiff = {
  sessionId: 'session_1',
  turnId: 'turn_1',
  state: 'ready',
  files: [readyFile],
};

describe('turn-diff wire schemas', () => {
  test('round-trips every file status and provenance agent value', () => {
    for (const status of ['added', 'modified', 'deleted', 'renamed'] as const) {
      expect(TurnDiffFileStatusSchema.parse(status)).toBe(status);
    }
    expect(TurnDiffFileStatusSchema.safeParse('copied').success).toBe(false);
    for (const agent of ['session', 'subagent'] as const) {
      expect(TurnDiffProvenanceAgentSchema.parse(agent)).toBe(agent);
    }
    expect(TurnDiffProvenanceAgentSchema.safeParse('root').success).toBe(false);
    for (const state of ['ready', 'empty', 'unsupported', 'failed'] as const) {
      expect(TurnDiffStateSchema.parse(state)).toBe(state);
    }
    expect(TurnDiffStateSchema.safeParse('loading').success).toBe(false);
  });

  test('round-trips provenance and enforces the subagent identity pairing', () => {
    expect(TurnDiffFileProvenanceSchema.parse(provenance)).toEqual(provenance);
    expect(TurnDiffFileProvenanceSchema.parse(subagentProvenance)).toEqual(subagentProvenance);
    // A subagent write without its id cannot be attributed; a session write
    // carrying one contradicts the attribution rule.
    expect(TurnDiffFileProvenanceSchema.safeParse({ tool: 'edit', agent: 'subagent', at: 1 }).success).toBe(false);
    expect(TurnDiffFileProvenanceSchema.safeParse({ ...provenance, subagentId: 'subagent_1' }).success).toBe(false);
    expect(TurnDiffFileProvenanceSchema.safeParse({ ...provenance, tool: '' }).success).toBe(false);
    expect(TurnDiffFileProvenanceSchema.safeParse({ ...provenance, at: -1 }).success).toBe(false);
    expect(TurnDiffFileProvenanceSchema.safeParse({ ...provenance, extra: true }).success).toBe(false);
  });

  test('round-trips a ready file with full replayed content', () => {
    expect(TurnDiffFileSchema.parse(readyFile)).toEqual(readyFile);
  });

  test('round-trips added, deleted and renamed file shapes', () => {
    const added = {
      ...readyFile,
      status: 'added',
      before: null,
      patch: '--- /dev/null\n+++ b/src/a.ts\n@@ -0,0 +1 @@\n+const a = 2;\n',
    };
    expect(TurnDiffFileSchema.parse(added)).toEqual(added);
    const deleted = {
      ...readyFile,
      status: 'deleted',
      after: null,
      patch: '--- a/src/a.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-const a = 1;\n',
    };
    expect(TurnDiffFileSchema.parse(deleted)).toEqual(deleted);
    const renamed = { ...readyFile, status: 'renamed', previousPath: 'src/old-a.ts' };
    expect(TurnDiffFileSchema.parse(renamed)).toEqual(renamed);
  });

  test('enforces the rename pairing in both directions', () => {
    expect(TurnDiffFileSchema.safeParse({ ...readyFile, status: 'renamed' }).success).toBe(false);
    expect(TurnDiffFileSchema.safeParse({ ...readyFile, previousPath: 'src/old.ts' }).success).toBe(false);
  });

  test('an incomplete file carries no replayed content but stays listed', () => {
    const incomplete = {
      path: 'assets/big.bin-ish',
      status: 'modified',
      additions: 0,
      deletions: 0,
      provenance: [{ tool: 'write', agent: 'session', at: 1774201003000 }],
      truncated: false,
      incomplete: true,
    };
    expect(TurnDiffFileSchema.parse(incomplete)).toEqual(incomplete);
    // Content fields contradict the replay failure they report.
    expect(TurnDiffFileSchema.safeParse({ ...incomplete, before: 'x' }).success).toBe(false);
    expect(TurnDiffFileSchema.safeParse({ ...incomplete, after: 'x' }).success).toBe(false);
    expect(TurnDiffFileSchema.safeParse({ ...incomplete, patch: '--- a/x\n' }).success).toBe(false);
    // Line counts only exist against replayed content.
    expect(TurnDiffFileSchema.safeParse({ ...incomplete, additions: 3 }).success).toBe(false);
    expect(TurnDiffFileSchema.safeParse({ ...incomplete, deletions: 2 }).success).toBe(false);
  });

  test('a truncated file may keep its patch while content is dropped', () => {
    const truncated = {
      ...readyFile,
      before: undefined,
      after: undefined,
      truncated: true,
    };
    expect(TurnDiffFileSchema.parse(truncated)).toEqual(truncated);
    const truncatedWithoutPatch = { ...truncated, patch: undefined };
    expect(TurnDiffFileSchema.parse(truncatedWithoutPatch)).toEqual(truncatedWithoutPatch);
  });

  test('requires provenance, integer counts and strict keys', () => {
    expect(TurnDiffFileSchema.safeParse({ ...readyFile, provenance: [] }).success).toBe(false);
    expect(TurnDiffFileSchema.safeParse({ ...readyFile, additions: -1 }).success).toBe(false);
    expect(TurnDiffFileSchema.safeParse({ ...readyFile, deletions: 1.5 }).success).toBe(false);
    expect(TurnDiffFileSchema.safeParse({ ...readyFile, path: '' }).success).toBe(false);
    expect(TurnDiffFileSchema.safeParse({ ...readyFile, diff: 'legacy' }).success).toBe(false);
    const multiProvenance = { ...readyFile, provenance: [provenance, subagentProvenance] };
    expect(TurnDiffFileSchema.parse(multiProvenance)).toEqual(multiProvenance);
  });

  test('round-trips the ready state with its files', () => {
    expect(TurnDiffSchema.parse(readyDiff)).toEqual(readyDiff);
  });

  test('round-trips empty and unsupported states without files or error', () => {
    for (const state of ['empty', 'unsupported'] as const) {
      const diff = { sessionId: 'session_1', turnId: 'turn_1', state, files: [] };
      expect(TurnDiffSchema.parse(diff)).toEqual(diff);
    }
  });

  test('round-trips the failed state with sanitized detail', () => {
    const diff = { sessionId: 'session_1', turnId: 'turn_1', state: 'failed', files: [], error: 'journal unreadable' };
    expect(TurnDiffSchema.parse(diff)).toEqual(diff);
  });

  test('files belong to the ready state alone', () => {
    // Empty/unsupported/failed states are authoritative: they never carry rows.
    for (const state of ['empty', 'unsupported', 'failed'] as const) {
      expect(TurnDiffSchema.safeParse({ ...readyDiff, state, error: state === 'failed' ? 'x' : undefined }).success).toBe(false);
    }
    // A ready read with no rows is not a valid representation of a turn that changed files.
    expect(TurnDiffSchema.safeParse({ ...readyDiff, files: [] }).success).toBe(false);
  });

  test('error detail belongs to the failed state alone', () => {
    expect(TurnDiffSchema.safeParse({ sessionId: 'session_1', turnId: 'turn_1', state: 'failed', files: [] }).success).toBe(false);
    expect(TurnDiffSchema.safeParse({ ...readyDiff, error: 'x' }).success).toBe(false);
    expect(TurnDiffSchema.safeParse({ sessionId: 'session_1', turnId: 'turn_1', state: 'empty', files: [], error: 'x' }).success).toBe(false);
    expect(TurnDiffSchema.safeParse({ sessionId: 'session_1', turnId: 'turn_1', state: 'failed', files: [], error: '' }).success).toBe(false);
  });

  test('rejects unknown keys and missing identity', () => {
    expect(TurnDiffSchema.safeParse({ ...readyDiff, workspaceId: 'workspace_1' }).success).toBe(false);
    expect(TurnDiffSchema.safeParse({ state: 'ready', files: [readyFile] }).success).toBe(false);
    expect(TurnDiffSchema.safeParse({ ...readyDiff, turnId: '' }).success).toBe(false);
    expect(TurnDiffSchema.safeParse(null).success).toBe(false);
  });
});
