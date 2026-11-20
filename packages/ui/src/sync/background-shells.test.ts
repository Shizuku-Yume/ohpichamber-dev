import { beforeEach, describe, expect, test } from 'bun:test';
import type { CanonicalEvent, ShellJob, ShellSnapshot } from '@openchamber/agent-contract';
import { ENDED_SHELLS_MAX, applyBackgroundShellEvents, backgroundShellRevision, backgroundShellsOfSessions, refreshBackgroundShells, replaceDirectoryShells, resetBackgroundShells, sessionsInTree, useBackgroundShellsStore, waitForShellSettle } from './background-shells';
import { deferred } from './session-message-loader-test-fixtures';
const running = (jobId: string, sessionId = 'session_1', background = true): Extract<ShellJob, { status: 'running' }> => ({ jobId, sessionId, epoch: 'epoch_1', workerGeneration: 'worker_1', workspaceId: 'workspace_1', projectId: 'project_1', command: `run ${jobId}`, background, startedAt: 1000, outputCursor: '0', status: 'running' });
const ended = (jobId: string, sessionId = 'session_1'): ShellJob => ({ ...running(jobId, sessionId), status: 'ended', endedAt: 2000, termination: { reason: 'exit', exitCode: 0 } });
const event = (job: ShellJob): CanonicalEvent => ({ sessionId: job.sessionId, epoch: job.epoch, sequence: '1', timestamp: 1, type: 'shell.updated', job });
const snapshot = (jobs: ShellJob[]): ShellSnapshot => ({ scope: { kind: 'workspace', workspaceId: 'workspace_1' }, epoch: 'epoch_1', revision: '1', running: jobs.filter((job): job is Extract<ShellJob, { status: 'running' }> => job.status === 'running'), ended: jobs.filter((job): job is Extract<ShellJob, { status: 'ended' }> => job.status === 'ended'), recovery: { priorEpochs: 'invalidated' } });
const ids = () => [...useBackgroundShellsStore.getState().byId.values()].map((job) => job.jobId).sort();
beforeEach(() => resetBackgroundShells());
describe('native background shell index', () => {
  test('tracks running jobs and native terminal observations', () => {
    applyBackgroundShellEvents('/repo', [event(running('job_1')), event(running('job_2', 'session_2'))]);
    expect(ids()).toEqual(['job_1', 'job_2']); expect(useBackgroundShellsStore.getState().sessionIds).toEqual(new Set(['session_1', 'session_2']));
    applyBackgroundShellEvents('/repo', [event(ended('job_1'))]);
    expect(ids()).toEqual(['job_2']); expect([...useBackgroundShellsStore.getState().ended.values()][0]?.termination.reason).toBe('exit');
  });
  test('snapshot replacement is scoped and preserves events after read start', () => {
    applyBackgroundShellEvents('/repo', [event(running('job_old'))]); applyBackgroundShellEvents('/other', [event(running('job_other', 'session_2'))]);
    const since = backgroundShellRevision(); applyBackgroundShellEvents('/repo', [event(running('job_new'))]);
    replaceDirectoryShells('/repo', snapshot([running('job_listed')]), since);
    expect(ids()).toEqual(['job_listed', 'job_new', 'job_other']);
  });
  test('failed refresh preserves prior state and stale refresh cannot commit after reset', async () => {
    applyBackgroundShellEvents('/repo', [event(running('job_1'))]);
    await expect(refreshBackgroundShells('/repo', async () => { throw new Error('offline'); })).rejects.toThrow('offline');
    expect(ids()).toEqual(['job_1']);
    const { promise, resolve } = deferred<ShellSnapshot>();
    const pending = refreshBackgroundShells('/repo', () => promise);
    resetBackgroundShells();
    resolve({ scope: { kind: 'global' }, epoch: 'epoch_1', revision: '0', running: [running('stale')], ended: [], recovery: { priorEpochs: 'invalidated' } });
    await pending;
    expect(ids()).toEqual([]);
  });
  test('sorts background jobs in a session tree', () => {
    applyBackgroundShellEvents('/repo', [event({ ...running('job_late', 'child'), startedAt: 3000 }), event({ ...running('job_early', 'root'), startedAt: 1000, background: true }), event({ ...running('job_other', 'other'), startedAt: 2000 })]);
    expect(sessionsInTree(['root', 'child', 'other'], 'root', (id) => id === 'child' ? 'root' : undefined)).toEqual(['child', 'root']);
    expect(backgroundShellsOfSessions(useBackgroundShellsStore.getState().byId, new Set(['root', 'child'])).map((job) => job.jobId)).toEqual(['job_early', 'job_late']);
  });
  test('keeps only the newest ended jobs', () => {
    const jobs = Array.from({ length: ENDED_SHELLS_MAX + 1 }, (_, index) => ended(`job_${index}`));
    applyBackgroundShellEvents('/repo', jobs.map(event));
    expect(useBackgroundShellsStore.getState().ended.size).toBe(ENDED_SHELLS_MAX);
  });
  test('worker-local job IDs cannot overwrite another session', () => {
    applyBackgroundShellEvents('/repo', [event(running('same_job', 'session_1')), event(running('same_job', 'session_2'))]);
    expect(useBackgroundShellsStore.getState().byId.size).toBe(2);
    applyBackgroundShellEvents('/repo', [event(ended('same_job', 'session_1'))]);
    expect([...useBackgroundShellsStore.getState().byId.values()].map((job) => job.sessionId)).toEqual(['session_2']);
  });
  test('a terminal observation wins over a running observation in the same batch', () => {
    applyBackgroundShellEvents('/repo', [event(ended('job_1')), event(running('job_1'))]);
    expect(ids()).toEqual([]);
    expect(useBackgroundShellsStore.getState().ended.size).toBe(1);
  });
  test('normalizes directory aliases during snapshot replacement', () => {
    applyBackgroundShellEvents('/repo/', [event(running('job_1'))]);
    replaceDirectoryShells('/repo', snapshot([]), backgroundShellRevision());
    expect(ids()).toEqual([]);
  });
  test('rejects an older same-epoch snapshot revision', () => {
    replaceDirectoryShells('/repo', { ...snapshot([running('fresh')]), revision: '2' }, 0);
    replaceDirectoryShells('/repo', { ...snapshot([running('stale')]), revision: '1' }, 0);
    expect(ids()).toEqual(['fresh']);
  });
  test('a newer refresh wins when reads complete out of order', async () => {
    const older = deferred<ShellSnapshot>();
    const newer = deferred<ShellSnapshot>();
    const first = refreshBackgroundShells('/repo', () => older.promise);
    const second = refreshBackgroundShells('/repo', () => newer.promise);
    newer.resolve(snapshot([running('newer')]));
    await second;
    older.resolve(snapshot([running('older')]));
    await first;
    expect(ids()).toEqual(['newer']);
  });
  test('retains all mutation tombstones for an in-flight recovery', async () => {
    const pending = deferred<ShellSnapshot>();
    const recovery = refreshBackgroundShells('/repo', () => pending.promise);
    applyBackgroundShellEvents('/repo', Array.from({ length: 650 }, (_, index) => event(ended(`job_${index}`))));
    pending.resolve(snapshot([running('job_0')]));
    await recovery;
    expect(ids()).toEqual([]);
  });
  test('new snapshot epochs invalidate prior ended observations', () => {
    applyBackgroundShellEvents('/repo', [event(ended('prior'))]);
    replaceDirectoryShells('/repo', { ...snapshot([]), epoch: 'epoch_2' }, backgroundShellRevision());
    expect(useBackgroundShellsStore.getState().ended.size).toBe(0);
  });
});

describe('waiting for a native shell to settle', () => {
  test('a matching background observation settles a foreground job', async () => {
    const job = running('job_1', 'session_1', false);
    applyBackgroundShellEvents('/repo', [event(job)]);
    const wait = waitForShellSettle(job, 1000);
    applyBackgroundShellEvents('/repo', [event({ ...job, background: true })]);
    expect(await wait.settled).toBe('background');
  });
  test('an observed terminal job settles as ended', async () => {
    const job = running('job_1', 'session_1', false);
    applyBackgroundShellEvents('/repo', [event(job)]);
    const wait = waitForShellSettle(job, 1000);
    applyBackgroundShellEvents('/repo', [event(ended('job_1'))]);
    expect(await wait.settled).toBe('ended');
  });
  test('absence from a snapshot is not evidence that the command ended', async () => {
    const job = running('job_1', 'session_1', false);
    applyBackgroundShellEvents('/repo', [event(job)]);
    const wait = waitForShellSettle(job, 1000);
    let settled = false;
    void wait.settled.then(() => { settled = true; });
    replaceDirectoryShells('/repo', snapshot([]), backgroundShellRevision());
    await Promise.resolve();
    expect(settled).toBe(false);
    applyBackgroundShellEvents('/repo', [event(ended('job_1'))]);
    expect(await wait.settled).toBe('ended');
  });
  test('another session or epoch cannot settle a worker-local job id', async () => {
    const job = running('same', 'session_1', false);
    const wait = waitForShellSettle(job, 1000);
    let settled = false;
    void wait.settled.then(() => { settled = true; });
    applyBackgroundShellEvents('/repo', [event(running('same', 'session_2')), event({ ...running('same'), epoch: 'epoch_2' })]);
    await Promise.resolve();
    expect(settled).toBe(false);
    applyBackgroundShellEvents('/repo', [event({ ...job, background: true })]);
    expect(await wait.settled).toBe('background');
  });
  test('a complete native snapshot can settle an already background job', async () => {
    const job = running('job_1');
    replaceDirectoryShells('/repo', snapshot([job]), backgroundShellRevision());
    expect(await waitForShellSettle(job, 1000).settled).toBe('background');
  });
  test('timeout, cancellation and reset reject rather than reporting success', async () => {
    const timedOut = waitForShellSettle(running('job_timeout'), 5);
    await expect(timedOut.settled).rejects.toThrow('in time');
    const cancelled = waitForShellSettle(running('job_cancel'), 1000);
    cancelled.cancel();
    await expect(cancelled.settled).rejects.toThrow('Cancelled');
    const reset = waitForShellSettle(running('job_reset'), 1000);
    resetBackgroundShells();
    await expect(reset.settled).rejects.toThrow('runtime changed');
  });
});
