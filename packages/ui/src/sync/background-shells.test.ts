import { beforeEach, describe, expect, test } from 'bun:test';
import type { CanonicalEvent, ShellJob, ShellSnapshot } from '@openchamber/agent-contract';
import { ENDED_SHELLS_MAX, applyBackgroundShellEvents, backgroundShellRevision, backgroundShellsOfSessions, refreshBackgroundShells, replaceDirectoryShells, resetBackgroundShells, sessionsInTree, useBackgroundShellsStore } from './background-shells';
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

describe('waiting for a call to settle in the background', () => {
  const outcome = async (settled: Promise<string>): Promise<string> => settled.catch((error: Error) => `rejected: ${error.message}`);

  test('resolves on the call settling, not on the flag a list sets', async () => {
    replaceDirectoryShells('/repo', [shell('sh_1')], backgroundShellRevision());
    expect(isBackground('sh_1')).toBe(true);
    const wait = waitForShellSettle('sh_1', 1000);
    let result: string | undefined;
    void wait.settled.then((value) => { result = value; });
    await Promise.resolve();
    expect(result).toBeUndefined();

    applyBackgroundShellEvents('/repo', [settledInBackground('sh_1')]);
    expect(await wait.settled).toBe('background');
  });

  test('resolves ended when the command ends first', async () => {
    applyBackgroundShellEvents('/repo', [started(shell('sh_1'))]);
    const wait = waitForShellSettle('sh_1', 1000);
    applyBackgroundShellEvents('/repo', [ended('sh_1')]);
    expect(await wait.settled).toBe('ended');
  });

  test('resolves ended when a list read no longer has the command', async () => {
    applyBackgroundShellEvents('/repo', [started(shell('sh_1'))]);
    const wait = waitForShellSettle('sh_1', 1000);
    replaceDirectoryShells('/repo', [], backgroundShellRevision());
    expect(await wait.settled).toBe('ended');
  });

  test('a settle and an end in one batch resolve background, with the command already gone from the index', async () => {
    applyBackgroundShellEvents('/repo', [started(shell('sh_1'))]);
    const wait = waitForShellSettle('sh_1', 1000);
    applyBackgroundShellEvents('/repo', [settledInBackground('sh_1'), ended('sh_1')]);
    expect(await wait.settled).toBe('background');
    expect(ids()).toEqual([]);
  });

  test('rejects after the timeout, on a cancel and on a runtime switch, and a later event changes nothing', async () => {
    applyBackgroundShellEvents('/repo', [started(shell('sh_1')), started(shell('sh_2')), started(shell('sh_3'))]);
    const timedOut = waitForShellSettle('sh_1', 5);
    expect(await outcome(timedOut.settled)).toBe('rejected: The command did not move to the background in time.');
    const cancelled = waitForShellSettle('sh_2', 1000);
    cancelled.cancel();
    expect(await outcome(cancelled.settled)).toBe('rejected: Cancelled.');
    const switched = waitForShellSettle('sh_3', 1000);
    resetBackgroundShells();
    expect(await outcome(switched.settled)).toBe('rejected: The runtime changed.');

    // Nothing is left waiting: the events of a new wait resolve only that wait.
    const next = waitForShellSettle('sh_1', 1000);
    applyBackgroundShellEvents('/repo', [settledInBackground('sh_1'), settledInBackground('sh_2')]);
    expect(await next.settled).toBe('background');
  });
});
