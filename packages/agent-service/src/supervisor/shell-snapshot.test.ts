import { expect, test } from 'bun:test';
import type { IncomingMessage } from 'node:http';
import { ShellSnapshotSchema, type RunningShell, type ShellSnapshot } from '@openchamber/agent-contract';
import type { WorkerOperationResult } from '../protocol.ts';
import { ShellCoordinator, type ShellWorkerPort } from './shell.ts';
import type { RegisteredWorkerInfo } from './workers.ts';

/**
 * A workspace snapshot reports the shells of the sessions that are currently
 * live. A session worker that is still booting holds nothing yet, so including
 * it failed the whole scope with 503 `No shell owner is available` and blocked
 * every other session's shells (audit receipts en_13/en_15/en_16/en_19).
 */

type WorkerRecord = {
  info: RegisteredWorkerInfo;
  captured: boolean;
  jobs: string[];
};

const epoch = '1';
const workspaceId = 'workspace-id';
const projectId = 'project-id';

const runningJob = (rootSessionId: string, jobId: string, index: number): RunningShell => ({
  jobId, sessionId: rootSessionId, workerGeneration: `generation-${rootSessionId}`,
  epoch, workspaceId, projectId, command: 'sleep 1', background: false,
  startedAt: 1000 + index, outputCursor: '0', status: 'running',
});

const shellWorkerPort = (records: WorkerRecord[]): ShellWorkerPort => ({
  list: () => records.map(record => record.info),
  bootstrap: rootSessionId => {
    const record = records.find(candidate => candidate.info.rootSessionId === rootSessionId);
    if (!record?.captured) return undefined;
    return {
      rootSessionId, projectId, workspaceId, cwd: '/tmp', agentDirectory: '/tmp/agent',
      displayPath: '/tmp', observationEpoch: epoch,
    };
  },
  authorizationScope: rootSessionId => {
    const record = records.find(candidate => candidate.info.rootSessionId === rootSessionId);
    if (!record) return undefined;
    return { rootSessionId, workerGeneration: record.info.workerGeneration, projectId, workspaceId, cwd: '/tmp', agentDirectory: '/tmp/agent', agentDirectoryId: 'directory' };
  },
  requestSerialized: async (rootSessionId): Promise<WorkerOperationResult> => {
    const record = records.find(candidate => candidate.info.rootSessionId === rootSessionId);
    if (!record) throw new Error(`No record for ${rootSessionId}`);
    const snapshot: ShellSnapshot = {
      scope: { kind: 'session', sessionId: rootSessionId }, epoch,
      revision: String(record.jobs.length),
      running: record.jobs.map((jobId, index) => runningJob(rootSessionId, jobId, index)),
      ended: [], recovery: { priorEpochs: 'invalidated' },
    };
    return { type: 'shell', result: { type: 'snapshot', snapshot } };
  },
});

const ready = (rootSessionId: string, jobIds: string[]): WorkerRecord => ({
  info: { rootSessionId, workerGeneration: `generation-${rootSessionId}`, projectId, workspaceId, state: 'ready', kind: 'session' },
  captured: true,
  jobs: jobIds,
});

// SAFETY: `handle` reads only `method` for the GET routes under test; no body is parsed.
const get = (shell: ShellCoordinator, path: string) => shell.handle(
  { method: 'GET' } as IncomingMessage,
  new URL(`http://127.0.0.1:4100/api/agent/v1${path}`),
  async () => { throw new Error('GET reads no body'); },
);

const coordinator = (records: WorkerRecord[]) => new ShellCoordinator(
  shellWorkerPort(records),
  { runtime: () => ({ rootSessionId: records[0]?.info.rootSessionId ?? 'none' }) },
  epoch,
  rootSessionId => records.some(record => record.info.rootSessionId === rootSessionId),
);

test('a workspace snapshot reports ready session shells', async () => {
  const shell = coordinator([ready('session-one', ['job-a', 'job-b']), ready('session-two', ['job-c'])]);
  const response = await get(shell, `/workspaces/${workspaceId}/shell/jobs`);
  expect(response?.status).toBe(200);
  const snapshot = ShellSnapshotSchema.parse(response?.body);
  expect(snapshot.scope).toEqual({ kind: 'workspace', workspaceId });
  expect(snapshot.running.map(job => job.sessionId)).toEqual(['session-one', 'session-one', 'session-two']);
});

test('a booting session does not fail the workspace snapshot its siblings answer', async () => {
  const booting = ready('session-booting', ['job-booting']);
  booting.info.state = 'starting';
  const shell = coordinator([ready('session-ready', ['job-ready']), booting]);
  const response = await get(shell, `/workspaces/${workspaceId}/shell/jobs`);
  expect(response?.status).toBe(200);
  const snapshot = ShellSnapshotSchema.parse(response?.body);
  expect(snapshot.running.map(job => job.sessionId)).toEqual(['session-ready']);
});

test('a workspace with no live session answers an empty snapshot', async () => {
  const shell = coordinator([]);
  const response = await get(shell, `/workspaces/${workspaceId}/shell/jobs`);
  expect(response?.status).toBe(200);
  const snapshot = ShellSnapshotSchema.parse(response?.body);
  expect(snapshot.scope).toEqual({ kind: 'workspace', workspaceId });
  expect(snapshot.running).toEqual([]);
  expect(snapshot.ended).toEqual([]);
});

test('a session whose capture was retired drops out of the workspace scope', async () => {
  const retired = ready('session-retired', ['job-retired']);
  retired.captured = false;
  const shell = coordinator([ready('session-live', ['job-live']), retired]);
  const response = await get(shell, `/workspaces/${workspaceId}/shell/jobs`);
  expect(response?.status).toBe(200);
  const snapshot = ShellSnapshotSchema.parse(response?.body);
  expect(snapshot.running.map(job => job.sessionId)).toEqual(['session-live']);
});
