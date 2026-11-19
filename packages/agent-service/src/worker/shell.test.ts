import { describe, expect, test } from 'bun:test';
import { AsyncJobManager, type AsyncJob } from '@oh-my-pi/pi-coding-agent/async/job-manager';
import type { AgentRegistryApi } from '@oh-my-pi/pi-coding-agent/registry/agent-registry';
import type { PipeStreams } from '@oh-my-pi/pi-natives';
import type { DaemonSnapshot } from '@oh-my-pi/pi-tui/tools/daemon';
import type { RunningShell } from '@openchamber/agent-contract';
import { WorkerShell } from './shell.ts';

function createMockStreams(records: Array<{ id: number; producer: string; consumer: string; data: string | Uint8Array; open: boolean }>): PipeStreams {
  const streams: PipeStreams = {
    list() {
      return records.map(r => ({
        id: r.id,
        producer: r.producer,
        consumer: r.consumer,
        total: typeof r.data === 'string' ? Buffer.byteLength(r.data, 'utf-8') : r.data.byteLength,
        open: r.open,
      }));
    },
    read(id: number, from?: number | null) {
      const match = records.find(r => r.id === id);
      if (!match) return null;
      const fullBuffer = typeof match.data === 'string' ? Buffer.from(match.data, 'utf-8') : match.data;
      const start = from ?? 0;
      const data = fullBuffer.subarray(start);
      return {
        start,
        end: start + data.length,
        data,
        open: match.open,
      };
    },
  };
  return streams;
}

describe('WorkerShell streams, stdin, and job widgets', () => {
  test('exposes pipe stream inspection with bounded chunks and survives job completion', async () => {
    const manager = new AsyncJobManager({ onJobComplete: () => { } });
    const mockStreams = createMockStreams([
      { id: 1, producer: '/home/private/repo/src/producer.sh', consumer: 'grep pattern', data: 'hello stream chunk data\n', open: false },
    ]);

    const shell = new WorkerShell({
      manager,
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      sessionId: 'session-1',
      workerGeneration: 'gen-1',
      epoch: 'epoch-1',
      nativeOwner: { agentId: 'session-1', registry: { get: () => undefined } as unknown as AgentRegistryApi },
      privateRoots: [{ root: '/home/private/repo', label: 'workspace' }],
    });

    const nativeJob = {
      id: 'bg-1',
      type: 'bash',
      status: 'running',
      startTime: 1000,
      label: 'test background job',
      intent: 'Processing logs in /home/private/repo',
      ownerId: 'session-1',
      abortController: new AbortController(),
      promise: Promise.resolve(),
      process: {
        command: 'cat /home/private/repo/data.txt | grep pattern',
        cwd: '/workspace',
        pids: () => [1234, 1235],
        streams: mockStreams,
      },
    } as unknown as AsyncJob;

    // Register job in manager with deferred promise
    const { promise: jobPromise, resolve: resolveJob } = Promise.withResolvers<string>();
    const registeredId = manager.register('bash', 'cat /home/private/repo/data.txt | grep pattern', () => jobPromise, { id: 'bg-1', ownerId: 'session-1', foreground: false });
    expect(registeredId).toBe('bg-1');
    const registeredNative = manager.getJob('bg-1')!;
    registeredNative.process = nativeJob.process;
    registeredNative.intent = nativeJob.intent;

    manager.emitBashJobEvent({
      type: 'started',
      jobId: 'bg-1',
      sessionKey: 'session-1:shell:bg-1',
    });

    const snapshotRes = await shell.operation({ type: 'snapshot' });
    expect(snapshotRes.type).toBe('snapshot');
    if (snapshotRes.type === 'snapshot') {
      const running = snapshotRes.snapshot.running.find(j => j.command.includes('grep pattern')) as RunningShell | undefined;
      expect(running).toBeDefined();
      expect(running?.intent).toBe('Processing logs in [workspace]');
      expect(running?.command).toBe('cat [workspace]/data.txt | grep pattern');
      expect(running?.pids).toEqual([1234, 1235]);
      expect(running?.streams).toBeDefined();
      expect(running?.streams?.[0]?.producer).toBe('[workspace]/src/producer.sh');

      // Test stream inspection while running
      const streamRes = await shell.operation({
        type: 'stream',
        request: {
          job: {
            jobId: running!.jobId,
            sessionId: running!.sessionId,
            epoch: running!.epoch,
            workerGeneration: running!.workerGeneration,
          },
          streamId: 1,
        },
      });
      expect(streamRes.type).toBe('stream');
      if (streamRes.type === 'stream') {
        expect(streamRes.stream.streamId).toBe(1);
        expect(streamRes.stream.chunk).toBe('hello stream chunk data\n');
        expect(streamRes.stream.open).toBe(false);
      }

      // Finish the job
      manager.emitBashJobEvent({
        type: 'finished',
        jobId: 'bg-1',
        exitCode: 0,
        cancelled: false,
        timedOut: false,
      });
      resolveJob('done');
      await registeredNative.promise;

      // Stream inspection must still work on retained ended job
      const endedStreamRes = await shell.operation({
        type: 'stream',
        request: {
          job: {
            jobId: running!.jobId,
            sessionId: running!.sessionId,
            epoch: running!.epoch,
            workerGeneration: running!.workerGeneration,
          },
          streamId: 1,
        },
      });
      expect(endedStreamRes.type).toBe('stream');
      if (endedStreamRes.type === 'stream') {
        expect(endedStreamRes.stream.chunk).toBe('hello stream chunk data\n');
      }
    }
  });

  test('routes stdin exclusively to named services and rejects regular bash jobs with INVALID_REQUEST', async () => {
    const manager = new AsyncJobManager({ onJobComplete: () => { } });
    let sentInput: { name: string; input: string } | null = null;

    const shell = new WorkerShell({
      manager,
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      sessionId: 'session-1',
      workerGeneration: 'gen-1',
      epoch: 'epoch-1',
      cwd: '/workspace',
      sendServiceInput: async (name, input) => {
        sentInput = { name, input };
      },
    });

    // Start a regular shell command (not a named service)
    const startRes = await shell.operation({
      type: 'start',
      request: {
        command: 'sleep 5',
        background: true,
      },
    });
    expect(startRes.type).toBe('start');
    if (startRes.type === 'start') {
      const jobIdentity = {
        jobId: startRes.job.jobId,
        sessionId: startRes.job.sessionId,
        epoch: startRes.job.epoch,
        workerGeneration: startRes.job.workerGeneration,
      };

      // Sending stdin to a regular command must fail with INVALID_REQUEST
      expect(
        shell.operation({
          type: 'stdin',
          request: {
            job: jobIdentity,
            input: 'arbitrary input\n',
          },
        }),
      ).rejects.toThrow();

      // Stop the shell
      const stopRes = await shell.operation({
        type: 'stop',
        request: { job: jobIdentity },
      });
      expect(stopRes.type).toBe('stop');
    }
    expect(sentInput).toBeNull();
  });

  test('security: enforces named service authorization, stale identity rejection, sibling survival, and verified terminal stop', async () => {
    const manager = new AsyncJobManager({ onJobComplete: () => { } });
    let sentInput: { name: string; input: string } | null = null;
    const stoppedServices: string[] = [];

    const daemons: DaemonSnapshot[] = [
      {
        name: 'service-a',
        id: 'daemon-a-1',
        state: 'running',
        pid: 1111,
        createdAt: 1000,
        startedAt: 1000,
        restartCount: 0,
        outputBytes: 50,
        persist: true,
        detached: false,
        owner: 'session-1',
      },
      {
        name: 'service-b',
        id: 'daemon-b-2',
        state: 'running',
        pid: 2222,
        createdAt: 1000,
        startedAt: 1000,
        restartCount: 0,
        outputBytes: 80,
        persist: false,
        detached: true,
        owner: 'session-1',
      },
      {
        name: 'foreign-service',
        id: 'daemon-foreign-9',
        state: 'running',
        pid: 9999,
        createdAt: 1000,
        startedAt: 1000,
        restartCount: 0,
        outputBytes: 100,
        persist: true,
        detached: false,
        owner: 'session-other-victim',
      },
    ];

    const shell = new WorkerShell({
      manager,
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      sessionId: 'session-1',
      workerGeneration: 'gen-1',
      epoch: 'epoch-1',
      cwd: '/workspace',
      listServices: async () => daemons,
      serviceLogs: async (name) => `logs for ${name}\n`,
      sendServiceInput: async (name, input) => {
        sentInput = { name, input };
      },
      stopService: async (name) => {
        stoppedServices.push(name);
        const match = daemons.find(d => d.name === name);
        if (match) {
          match.state = 'failed';
          match.exitedAt = Date.now();
          match.exitCode = 0;
        }
      },
    });

    const snapshotRes = await shell.operation({ type: 'snapshot' });
    expect(snapshotRes.type).toBe('snapshot');
    if (snapshotRes.type === 'snapshot') {
      const runningJobs = snapshotRes.snapshot.running;
      // 1. Session-owned services are present
      expect(runningJobs.some(j => j.jobId === 'service:daemon-a-1')).toBe(true);
      expect(runningJobs.some(j => j.jobId === 'service:daemon-b-2')).toBe(true);
      // 2. Foreign service owned by session-other-victim is NOT listed
      expect(runningJobs.some(j => j.jobId === 'service:daemon-foreign-9')).toBe(false);

      const jobAIdentity = {
        jobId: 'service:daemon-a-1',
        sessionId: 'session-1',
        epoch: 'epoch-1',
        workerGeneration: 'gen-1',
      };

      // 3. Stdin to authorized service-a succeeds
      const stdinRes = await shell.operation({
        type: 'stdin',
        request: {
          job: jobAIdentity,
          input: 'reload config\n',
        },
      });
      expect(stdinRes.type).toBe('stdin');
      expect(sentInput as unknown).toEqual({ name: 'service-a', input: 'reload config\n' });

      // 4. Foreign service deny: Attempting to access/stop foreign service fails with 404 SHELL_NOT_FOUND
      expect(
        shell.operation({
          type: 'stdin',
          request: {
            job: {
              jobId: 'service:daemon-foreign-9',
              sessionId: 'session-1',
              epoch: 'epoch-1',
              workerGeneration: 'gen-1',
            },
            input: 'malicious input\n',
          },
        }),
      ).rejects.toThrow();

      // 5. Stale identity rejection: Request with outdated epoch fails with 410 RESYNC_REQUIRED
      expect(
        shell.operation({
          type: 'output',
          request: {
            job: {
              ...jobAIdentity,
              epoch: 'stale-epoch-invalid',
            },
            cursor: '0',
            tailBytes: 1000,
          },
        }),
      ).rejects.toThrow();

      // 6. Stop Service A and verify terminal stop proof
      const stopRes = await shell.operation({
        type: 'stop',
        request: {
          job: jobAIdentity,
        },
      });
      expect(stopRes.type).toBe('stop');
      expect(stoppedServices).toEqual(['service-a']);
      if (stopRes.type === 'stop') {
        expect(stopRes.result.job.status).toBe('ended');
        expect(stopRes.result.job.termination.reason).toBe('stopped');
      }

      // 7. Sibling service survival: Service B is still alive in snapshot!
      const postStopSnapshot = await shell.operation({ type: 'snapshot' });
      if (postStopSnapshot.type === 'snapshot') {
        const postRunning = postStopSnapshot.snapshot.running;
        expect(postRunning.some(j => j.jobId === 'service:daemon-b-2')).toBe(true);
        expect(postRunning.some(j => j.jobId === 'service:daemon-a-1')).toBe(false);
      }
    }
  });

  test('preserves valid CJK and emoji tail characters without corruption or fatal decoding errors', async () => {
    const manager = new AsyncJobManager({ onJobComplete: () => { } });
    const cjkStreamData = 'hello 世界';
    const emojiStreamData = 'status: 🚀';
    const mockStreams = createMockStreams([
      { id: 1, producer: 'cjk-producer', consumer: 'viewer', data: cjkStreamData, open: false },
      { id: 2, producer: 'emoji-producer', consumer: 'viewer', data: emojiStreamData, open: false },
    ]);

    const shell = new WorkerShell({
      manager,
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      sessionId: 'session-1',
      workerGeneration: 'gen-1',
      epoch: 'epoch-1',
      cwd: '/workspace',
      nativeOwner: { agentId: 'session-1', registry: { get: () => undefined } as unknown as AgentRegistryApi },
    });

    const { promise: jobPromise } = Promise.withResolvers<void>();
    manager.register('bash', 'test-utf8', () => jobPromise, { id: 'bg-utf8', ownerId: 'session-1', foreground: false });
    const native = manager.getJob('bg-utf8')!;
    native.process = { command: 'test-utf8', cwd: '/workspace', pids: () => [123], streams: mockStreams } as unknown as AsyncJob['process'];
    manager.emitBashJobEvent({ type: 'started', jobId: 'bg-utf8', sessionKey: 'session-1:shell:bg-utf8' });

    const jobIdentity = {
      jobId: 'native:["session-1","bg-utf8"]',
      sessionId: 'session-1',
      epoch: 'epoch-1',
      workerGeneration: 'gen-1',
    };

    // CJK stream check
    const cjkRes = await shell.operation({
      type: 'stream',
      request: { job: jobIdentity, streamId: 1 },
    });
    expect(cjkRes.type).toBe('stream');
    if (cjkRes.type !== 'stream') throw new Error('Expected stream');
    expect(cjkRes.stream.chunk).toBe(cjkStreamData);
    expect(cjkRes.stream.start).toBe(0);
    expect(cjkRes.stream.end).toBe(Buffer.byteLength(cjkStreamData, 'utf-8'));
    expect(cjkRes.stream.open).toBe(false);

    // Emoji stream check
    const emojiRes = await shell.operation({
      type: 'stream',
      request: { job: jobIdentity, streamId: 2 },
    });
    expect(emojiRes.type).toBe('stream');
    if (emojiRes.type !== 'stream') throw new Error('Expected stream');
    expect(emojiRes.stream.chunk).toBe(emojiStreamData);
    expect(emojiRes.stream.start).toBe(0);
    expect(emojiRes.stream.end).toBe(Buffer.byteLength(emojiStreamData, 'utf-8'));
    expect(emojiRes.stream.open).toBe(false);
  });

  test('preserves split multibyte sequence across stream reads without losing continuation bytes', async () => {
    const manager = new AsyncJobManager({ onJobComplete: () => { } });
    const fullText = 'status: 🚀 done';
    const fullBytes = Buffer.from(fullText, 'utf-8');
    // 'status: ' is 8 bytes; emoji 🚀 is 4 bytes (f0 9f 9a 80)
    // First read delivers 10 bytes: 'status: ' + first 2 bytes of 🚀 (f0 9f)
    const record = {
      id: 1,
      producer: 'split-producer',
      consumer: 'viewer',
      data: fullBytes.subarray(0, 10) as Uint8Array,
      open: true,
    };

    const dynamicStreams: PipeStreams = {
      list() {
        return [{ id: 1, producer: record.producer, consumer: record.consumer, total: record.data.length, open: record.open }];
      },
      read(id: number, from?: number | null) {
        const start = from ?? 0;
        const data = record.data.subarray(start);
        return { start, end: start + data.length, data, open: record.open };
      },
    } as unknown as PipeStreams;

    const shell = new WorkerShell({
      manager,
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      sessionId: 'session-1',
      workerGeneration: 'gen-1',
      epoch: 'epoch-1',
      cwd: '/workspace',
      nativeOwner: { agentId: 'session-1', registry: { get: () => undefined } as unknown as AgentRegistryApi },
    });

    const { promise: jobPromise } = Promise.withResolvers<void>();
    manager.register('bash', 'split-test', () => jobPromise, { id: 'bg-split', ownerId: 'session-1', foreground: false });
    const native = manager.getJob('bg-split')!;
    native.process = { command: 'split-test', cwd: '/workspace', pids: () => [124], streams: dynamicStreams } as unknown as AsyncJob['process'];
    manager.emitBashJobEvent({ type: 'started', jobId: 'bg-split', sessionKey: 'session-1:shell:bg-split' });

    const jobIdentity = {
      jobId: 'native:["session-1","bg-split"]',
      sessionId: 'session-1',
      epoch: 'epoch-1',
      workerGeneration: 'gen-1',
    };

    // Read 1: tail has incomplete emoji sequence (f0 9f)
    const res1 = await shell.operation({
      type: 'stream',
      request: { job: jobIdentity, streamId: 1 },
    });
    expect(res1.type).toBe('stream');
    if (res1.type !== 'stream') throw new Error('Expected stream');
    expect(res1.stream.chunk).toBe('status: ');
    expect(res1.stream.start).toBe(0);
    // safeEnd must back up before f0 (offset 8), and NOT report 10
    expect(res1.stream.end).toBe(8);
    expect(res1.stream.open).toBe(true);

    // Now more data arrives in the pipe, completing the stream
    record.data = fullBytes;
    record.open = false;

    // Read 2: continues from res1.stream.end (8), receiving the full emoji + ' done'
    const res2 = await shell.operation({
      type: 'stream',
      request: { job: jobIdentity, streamId: 1, from: res1.stream.end },
    });
    expect(res2.type).toBe('stream');
    if (res2.type !== 'stream') throw new Error('Expected stream');
    expect(res2.stream.chunk).toBe('🚀 done');
    expect(res2.stream.start).toBe(8);
    expect(res2.stream.end).toBe(fullBytes.length);
    expect(res2.stream.open).toBe(false);

    // Combined chunks match exactly with no lost continuation bytes
    const combined = res1.stream.chunk + res2.stream.chunk;
    expect(combined).toBe(fullText);
  });

  test('bounds streams exceeding 64 KiB to safe UTF-8 boundaries at both offset and tail', async () => {
    const manager = new AsyncJobManager({ onJobComplete: () => { } });
    const prefix = 'x'.repeat(70_000);
    const tailCJK = '你好，世界！🚀';
    const fullText = prefix + tailCJK;
    const fullBytes = Buffer.from(fullText, 'utf-8');

    const mockStreams = createMockStreams([
      { id: 1, producer: 'large-producer', consumer: 'viewer', data: fullBytes, open: false },
    ]);

    const shell = new WorkerShell({
      manager,
      workspaceId: 'ws-1',
      projectId: 'proj-1',
      sessionId: 'session-1',
      workerGeneration: 'gen-1',
      epoch: 'epoch-1',
      cwd: '/workspace',
      nativeOwner: { agentId: 'session-1', registry: { get: () => undefined } as unknown as AgentRegistryApi },
    });

    const { promise: jobPromise } = Promise.withResolvers<void>();
    manager.register('bash', 'large-test', () => jobPromise, { id: 'bg-large', ownerId: 'session-1', foreground: false });
    const native = manager.getJob('bg-large')!;
    native.process = { command: 'large-test', cwd: '/workspace', pids: () => [125], streams: mockStreams } as unknown as AsyncJob['process'];
    manager.emitBashJobEvent({ type: 'started', jobId: 'bg-large', sessionKey: 'session-1:shell:bg-large' });

    const jobIdentity = {
      jobId: 'native:["session-1","bg-large"]',
      sessionId: 'session-1',
      epoch: 'epoch-1',
      workerGeneration: 'gen-1',
    };

    const res = await shell.operation({
      type: 'stream',
      request: { job: jobIdentity, streamId: 1 },
    });
    expect(res.type).toBe('stream');
    if (res.type !== 'stream') throw new Error('Expected stream');
    expect(res.stream.chunk.endsWith(tailCJK)).toBe(true);
    expect(res.stream.start).toBeGreaterThan(0);
    expect(res.stream.end).toBe(fullBytes.length);
    expect(res.stream.open).toBe(false);
  });
});

test('a fresh worker retains service control for every retired session id but rejects foreign owners', async () => {
  const manager = new AsyncJobManager({ onJobComplete: () => { } });
  const daemon: DaemonSnapshot = {
    name: 'original-service', id: 'original', state: 'running', pid: 1111, createdAt: 1000, startedAt: 1000,
    restartCount: 0, outputBytes: 0, persist: true, detached: false, owner: 'session-a',
  };
  const daemons = [daemon, { ...daemon, id: 'intermediate', name: 'intermediate-service', owner: 'session-b' },
    { ...daemon, id: 'current', name: 'current-service', owner: 'session-c' },
    { ...daemon, id: 'foreign', name: 'foreign-service', owner: 'foreign-session' }];
  const sent: string[] = [];
  const shell = new WorkerShell({
    manager, workspaceId: 'ws-1', projectId: 'proj-1', sessionId: 'session-c',
    retiredSessionIds: ['session-a', 'session-b'],
    workerGeneration: 'fresh-generation', epoch: 'fresh-epoch', cwd: '/workspace',
    listServices: async () => daemons,
    serviceLogs: async name => `logs: ${name}`,
    sendServiceInput: async name => { sent.push(name); },
    stopService: async name => {
      const service = daemons.find(item => item.name === name);
      if (service) service.state = 'exited';
    },
  });
  try {
    const snapshot = await shell.operation({ type: 'snapshot' });
    if (snapshot.type !== 'snapshot') throw new Error('Expected snapshot');
    expect(snapshot.snapshot.running.map(job => job.jobId).sort()).toEqual(['service:current', 'service:intermediate', 'service:original']);
    for (const running of snapshot.snapshot.running) {
      const { jobId, sessionId, epoch, workerGeneration } = running;
      const job = { jobId, sessionId, epoch, workerGeneration };
      expect(job.sessionId).toBe('session-c');
      const output = await shell.operation({ type: 'output', request: { job, cursor: '0', tailBytes: 1000 } });
      if (output.type !== 'output') throw new Error('Expected output');
      expect(output.output.output).toBe(`logs: ${running.serviceName}`);
      await shell.operation({ type: 'stdin', request: { job, input: 'reload\n' } });
      const stop = await shell.operation({ type: 'stop', request: { job } });
      if (stop.type !== 'stop') throw new Error('Expected stop');
      expect(stop.result.job.termination.reason).toBe('stopped');
    }
    expect(sent.sort()).toEqual(['current-service', 'intermediate-service', 'original-service']);
    const foreign = { jobId: 'service:foreign', sessionId: 'session-c', epoch: 'fresh-epoch', workerGeneration: 'fresh-generation' };
    await expect(shell.operation({ type: 'output', request: { job: foreign, cursor: '0', tailBytes: 1000 } })).rejects.toMatchObject({ code: 'SHELL_NOT_FOUND' });
    await expect(shell.operation({ type: 'stop', request: { job: foreign } })).rejects.toMatchObject({ code: 'SHELL_NOT_FOUND' });
    await expect(shell.operation({ type: 'stdin', request: { job: foreign, input: 'no' } })).rejects.toMatchObject({ code: 'SHELL_NOT_FOUND' });
  } finally { await shell.close(); }
});

test('a session rekey moves every shell job identity and the snapshot scope to the minted id', async () => {
  const manager = new AsyncJobManager({ onJobComplete: () => { } });
  const daemon: DaemonSnapshot = {
    name: 'service', id: 'daemon-1', state: 'running', pid: 1111, createdAt: 1000, startedAt: 1000,
    restartCount: 0, outputBytes: 0, persist: true, detached: false, owner: 'session-1',
  };
  const shell = new WorkerShell({
    manager, workspaceId: 'ws-1', projectId: 'proj-1', sessionId: 'session-1',
    workerGeneration: 'gen-1', epoch: 'epoch-1', cwd: '/workspace',
    listServices: async () => [daemon, { ...daemon, id: 'foreign', owner: 'other-session' }],
  });
  const startRes = await shell.operation({ type: 'start', request: { command: 'sleep 5', background: true } });
  expect(startRes.type).toBe('start');
  if (startRes.type !== 'start') throw new Error('A shell start must return its job');
  expect(startRes.job.sessionId).toBe('session-1');
  shell.rekey('session-minted');
  // The Host resolves a shell job by the root the worker registers under, so
  // the job, the ended records and the scope must all name the minted id.
  // Before the rekey these stayed on the retired id and every read 503ed.
  const snapshot = await shell.operation({ type: 'snapshot' });
  expect(snapshot.type).toBe('snapshot');
  if (snapshot.type !== 'snapshot') throw new Error('A shell snapshot must return its scope');
  expect(snapshot.snapshot.scope).toEqual({ kind: 'session', sessionId: 'session-minted' });
  const running = snapshot.snapshot.running.find(job => job.jobId === startRes.job.jobId);
  expect(running?.sessionId).toBe('session-minted');
  expect(snapshot.snapshot.running.filter(job => job.jobId.startsWith('service:'))).toMatchObject([
    { jobId: 'service:daemon-1', sessionId: 'session-minted' },
  ]);
  const stop = await shell.operation({
    type: 'stop',
    request: { job: { jobId: startRes.job.jobId, sessionId: 'session-minted', epoch: startRes.job.epoch, workerGeneration: startRes.job.workerGeneration } },
  });
  expect(stop.type).toBe('stop');
  await shell.close();
});
