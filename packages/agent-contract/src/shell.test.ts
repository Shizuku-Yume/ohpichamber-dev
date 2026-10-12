import { describe, expect, test } from 'bun:test';
import {
  ShellJobIdentitySchema,
  ShellJobSchema,
  ShellOutputRequestSchema,
  ShellOutputSchema,
  ShellScopeSchema,
  ShellSnapshotSchema,
  ShellStartRequestSchema,
  ShellStopRequestSchema,
  ShellStopResultSchema,
  ShellTerminationSchema,
} from './shell.ts';

const identity = { jobId: 'job_1', sessionId: 'session_1', epoch: 'shell_epoch_1', workerGeneration: 'worker_1' };
const running = {
  ...identity, workspaceId: 'workspace_1', projectId: 'project_1', command: 'printf hello', background: true,
  startedAt: 1000, outputCursor: '5', status: 'running',
};
const ended = { ...running, status: 'ended', endedAt: 2000, termination: { reason: 'exit', exitCode: 0 } };
const stopped = { ...ended, termination: { reason: 'stopped', exitCode: null } };
const snapshot = {
  scope: { kind: 'workspace', workspaceId: 'workspace_1' }, epoch: 'shell_epoch_1', revision: '2',
  running: [running], ended: [], recovery: { priorEpochs: 'invalidated' },
};
const output = {
  job: identity, requestedCursor: '0', startCursor: '3', cursor: '8', skippedBytes: '3', output: 'hello', ended: true,
};

const boundaries = [
  { name: 'ShellScope', schema: ShellScopeSchema, valid: snapshot.scope, invalid: [{ kind: 'session', sessionId: '' }, { kind: 'project', workspaceId: 'workspace_1' }, { kind: 'global', directory: '/private/project' }] },
  { name: 'ShellJobIdentity', schema: ShellJobIdentitySchema, valid: identity, invalid: [{ ...identity, epoch: 'bad:epoch' }, { ...identity, workerGeneration: '' }] },
  { name: 'ShellTermination', schema: ShellTerminationSchema, valid: ended.termination, invalid: [{ reason: 'exit', exitCode: null }, { reason: 'worker-lost', exitCode: 0 }, { reason: 'completed' }] },
  { name: 'ShellJob', schema: ShellJobSchema, valid: ended, invalid: [{ ...ended, endedAt: 999 }, { ...running, endedAt: 2000, termination: ended.termination }, { ...ended, termination: undefined }] },
  { name: 'ShellSnapshot', schema: ShellSnapshotSchema, valid: snapshot, invalid: [{ ...snapshot, epoch: 'other_epoch' }, { ...snapshot, scope: { kind: 'workspace', workspaceId: 'foreign_workspace' } }, { ...snapshot, running: [running, running] }] },
  { name: 'ShellStartRequest', schema: ShellStartRequestSchema, valid: { command: 'printf hello', background: true, timeoutMs: 1000 }, invalid: [{ command: '', background: true }, { command: 'printf hello', background: true, timeoutMs: 0 }, { command: 'printf hello', background: true, cwd: '/private/workspace' }] },
  { name: 'ShellOutputRequest', schema: ShellOutputRequestSchema, valid: { job: identity, cursor: '0', tailBytes: 65536 }, invalid: [{ job: identity, cursor: '0', tailBytes: 65537 }, { job: identity, cursor: 0, tailBytes: 1024 }] },
  { name: 'ShellOutput', schema: ShellOutputSchema, valid: output, invalid: [{ ...output, skippedBytes: '2' }, { ...output, cursor: '7' }, { ...output, startCursor: '0' }, { ...output, output: 'x'.repeat(65537), cursor: '65540' }] },
  { name: 'ShellStopRequest', schema: ShellStopRequestSchema, valid: { job: identity }, invalid: [{ job: { jobId: identity.jobId } }, { job: identity, pid: 42 }] },
  { name: 'ShellStopResult', schema: ShellStopResultSchema, valid: { job: stopped }, invalid: [{ job: running }, { job: ended }, { stopped: true }] },
];

describe('Canonical capability-scoped Shell records', () => {
  for (const boundary of boundaries) {
    test(`${boundary.name} accepts wire records and rejects lifecycle or bound contradictions`, () => {
      expect(boundary.schema.parse(JSON.parse(JSON.stringify(boundary.valid)))).toEqual(boundary.valid);
      for (const invalid of boundary.invalid) expect(boundary.schema.safeParse(invalid).success).toBe(false);
    });
  }

  test('exit status, stop and timeout are explicit independent terminal reasons', () => {
    expect(ShellJobSchema.parse(running).status).toBe('running');
    expect(ShellJobSchema.parse(ended)).toEqual(ended);
    expect(ShellJobSchema.parse({ ...ended, termination: { reason: 'exit', exitCode: 42 } })).toMatchObject({ termination: { reason: 'exit', exitCode: 42 } });
    for (const reason of ['stopped', 'timeout', 'signal', 'worker-lost']) {
      expect(ShellJobSchema.parse({ ...ended, termination: { reason, exitCode: null } })).toMatchObject({ status: 'ended', termination: { reason, exitCode: null } });
    }
    expect(ShellJobSchema.safeParse({ ...running, stdout: 'invented split' }).success).toBe(false);
    expect(ShellJobSchema.safeParse({ ...ended, stderr: 'invented split' }).success).toBe(false);
  });

  test('history retains newest 200 ended observations in oldest-end-first order independently of SDK expiry', () => {
    const history = Array.from({ length: 200 }, (_, index) => ({ ...ended, jobId: `job_${index}`, endedAt: 2000 + index }));
    expect(ShellSnapshotSchema.parse({ ...snapshot, running: [], ended: history }).ended).toHaveLength(200);
    expect(ShellSnapshotSchema.safeParse({ ...snapshot, running: [], ended: [...history, { ...ended, jobId: 'job_201', endedAt: 2200 }] }).success).toBe(false);
    expect(ShellSnapshotSchema.safeParse({ ...snapshot, running: [], ended: [...history].reverse() }).success).toBe(false);
    expect(ShellSnapshotSchema.safeParse({ ...snapshot, ended: [ended] }).success).toBe(false);
  });

  test('output cursor is UTF-8 bytes with exact skipped-byte recovery, not string length or SDK inline text offset', () => {
    const unicode = { ...output, requestedCursor: '5', startCursor: '7', cursor: '10', skippedBytes: '2', output: '界' };
    expect(ShellOutputSchema.parse(unicode).cursor).toBe('10');
    expect(ShellOutputSchema.safeParse({ ...unicode, cursor: '8' }).success).toBe(false);
    expect(ShellOutputSchema.parse({ ...output, startCursor: '0', cursor: '0', skippedBytes: '0', output: '', ended: false }).output).toBe('');
    expect(ShellOutputSchema.parse({ ...output, startCursor: '0', cursor: '65536', skippedBytes: '0', output: 'x'.repeat(65536) }).output).toHaveLength(65536);
    expect(ShellOutputSchema.safeParse({ ...output, startCursor: '0', cursor: '65538', skippedBytes: '0', output: '界'.repeat(21846) }).success).toBe(false);
    const high = { ...output, requestedCursor: '18446744073709551610', startCursor: '18446744073709551610', cursor: '18446744073709551615', skippedBytes: '0', output: 'hello' };
    expect(ShellOutputSchema.parse(high).cursor).toBe('18446744073709551615');
    expect(ShellOutputSchema.safeParse({ ...high, cursor: '18446744073709551616' }).success).toBe(false);
    expect(ShellOutputSchema.safeParse({ ...output, requestedCursor: 'not-a-counter' }).success).toBe(false);
  });

  test('restart invalidates prior epoch jobs instead of pretending old execution survived', () => {
    expect(ShellSnapshotSchema.parse({ ...snapshot, epoch: 'shell_epoch_2', revision: '0', running: [], ended: [] }).recovery.priorEpochs).toBe('invalidated');
    expect(ShellSnapshotSchema.safeParse({ ...snapshot, epoch: 'shell_epoch_2', revision: '0' }).success).toBe(false);
    expect(ShellSnapshotSchema.safeParse({ ...snapshot, ended: [{ ...ended, jobId: 'job_2', epoch: 'shell_epoch_0' }] }).success).toBe(false);
    expect(ShellOutputRequestSchema.parse({ job: { ...identity, workerGeneration: 'replacement_worker' }, cursor: '0', tailBytes: 1 }).job.workerGeneration).toBe('replacement_worker');
  });

  test('project, workspace, session-tree and global snapshots use IDs without publishing private directory mappings', () => {
    for (const scope of [
      { kind: 'project', projectId: 'project_1' },
      { kind: 'workspace', workspaceId: 'workspace_1' },
      { kind: 'session', sessionId: 'root_session' },
      { kind: 'global' },
    ]) expect(ShellSnapshotSchema.parse({ ...snapshot, scope }).scope).toEqual(scope);
    expect(ShellSnapshotSchema.safeParse({ ...snapshot, scope: { kind: 'project', projectId: 'foreign_project' } }).success).toBe(false);
    expect(ShellJobSchema.safeParse({ ...running, directory: '/private/workspace' }).success).toBe(false);
  });
});
