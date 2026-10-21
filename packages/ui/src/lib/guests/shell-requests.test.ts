import { beforeEach, describe, expect, spyOn, test } from 'bun:test';
import {
  GUEST_REQUEST_TIMEOUT_MS, HostRequestError, OPENCHAMBER_SDK_API_VERSION, OPENCHAMBER_SDK_CHANNEL,
  type HostMessage,
} from '@openchamber/sdk';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { useBackgroundShellsStore, type TrackedShell } from '@/sync/background-shells';
import {
  GUEST_SHELL_REQUEST_DEADLINE_MS, createGuestShellRequests, postGuestShellReply,
} from './shell-requests';

const shell = (jobId: string, sessionId = 'root'): TrackedShell => ({
  jobId, sessionId, epoch: 'epoch-1', workerGeneration: 'worker-1', workspaceId: 'ws-repo', projectId: 'pro_app',
  command: `run ${jobId}`, startedAt: 1, outputCursor: '0', status: 'running', directory: '/repo', background: true,
});
const identity = (jobId: string, sessionId = 'root') => ({ jobId, sessionId, epoch: 'epoch-1', workerGeneration: 'worker-1' });

const failureOf = async (read: Promise<unknown>): Promise<Error | null> => {
  try {
    await read;
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
};
const codeOf = async (read: Promise<unknown>): Promise<string> => {
  const failure = await failureOf(read);
  if (failure === null) return 'resolved';
  return failure instanceof HostRequestError ? failure.code : failure.name;
};

beforeEach(() => {
  useBackgroundShellsStore.setState({
    byId: new Map([['sh_1', shell('sh_1')]]),
    sessionIds: new Set(['root']),
    ended: new Map(),
  });
});

describe('guest shell request deadline', () => {
  test('answers HOST_TIMEOUT inside the deadline when the canonical effect stalls', async () => {
    const read = spyOn(canonicalClient, 'getShellOutput').mockImplementation(() => new Promise(() => {}));
    try {
      const requests = createGuestShellRequests({ deadlineMs: 20 });
      const started = Date.now();
      const failure = await failureOf(requests.readOutput({ shellId: 'sh_1' }));
      expect(failure).toBeInstanceOf(HostRequestError);
      if (!(failure instanceof HostRequestError)) throw new Error('Expected a HostRequestError');
      expect(failure.code).toBe('HOST_TIMEOUT');
      expect(failure.message).toBe('Host did not answer in time.');
      expect(Date.now() - started).toBeLessThan(GUEST_REQUEST_TIMEOUT_MS);
      expect(GUEST_SHELL_REQUEST_DEADLINE_MS).toBeLessThan(GUEST_REQUEST_TIMEOUT_MS);
    } finally { read.mockRestore(); }
  });

  test('abortAll settles outstanding work, forwards the signal and cancels the deadline', async () => {
    let observed: AbortSignal | undefined;
    const read = spyOn(canonicalClient, 'getShellOutput').mockImplementation((...args) => {
      observed = args[4];
      return new Promise(() => {});
    });
    try {
      const requests = createGuestShellRequests({ deadlineMs: 60_000 });
      const pending = requests.readOutput({ shellId: 'sh_1' });
      await Promise.resolve();
      requests.abortAll();
      expect(await codeOf(pending)).toBe('HOST_TIMEOUT');
      expect(observed?.aborted).toBe(true);
    } finally { read.mockRestore(); }
  });

  test('a successful read and stop keep their result shapes and identity', async () => {
    const read = spyOn(canonicalClient, 'getShellOutput').mockResolvedValue({
      job: identity('sh_1'), requestedCursor: '0', startCursor: '0', cursor: '2', skippedBytes: '0', output: 'ok', ended: false,
    });
    const stop = spyOn(canonicalClient, 'stopShell').mockResolvedValue({
      ...shell('sh_1'), status: 'ended', endedAt: 2, termination: { reason: 'stopped', exitCode: null },
    });
    try {
      const requests = createGuestShellRequests();
      expect(await requests.readOutput({ shellId: 'sh_1', cursor: 0, tailBytes: 100 }))
        .toEqual({ cursor: 2, output: 'ok', skipped: false });
      expect(read.mock.calls[0]).toEqual(['root', { jobId: 'sh_1', epoch: 'epoch-1', workerGeneration: 'worker-1' }, '0', 100, expect.any(AbortSignal)]);
      expect(await requests.stop({ shellId: 'sh_1' })).toEqual({ stopped: true });
      expect(stop.mock.calls[0]).toEqual(['root', { job: identity('sh_1') }, expect.any(AbortSignal)]);
    } finally { read.mockRestore(); stop.mockRestore(); }
  });
});

describe('guest shell failures stay failures', () => {
  test('an unknown or already stopped shell is NOT_FOUND without a canonical read', async () => {
    const read = spyOn(canonicalClient, 'getShellOutput');
    try {
      const requests = createGuestShellRequests();
      expect(await codeOf(requests.readOutput({ shellId: 'sh_missing' }))).toBe('NOT_FOUND');
      useBackgroundShellsStore.setState({ ended: new Map([['sh_stopped', {
        ...shell('sh_stopped'), status: 'ended', endedAt: 2, termination: { reason: 'stopped', exitCode: null },
      }]]) });
      expect(await codeOf(requests.readOutput({ shellId: 'sh_stopped' }))).toBe('NOT_FOUND');
      expect(read.mock.calls).toHaveLength(0);
    } finally { read.mockRestore(); }
  });

  test('an unknown or ended shell cannot be stopped', async () => {
    const stop = spyOn(canonicalClient, 'stopShell');
    try {
      const requests = createGuestShellRequests();
      expect(await codeOf(requests.stop({ shellId: 'sh_missing' }))).toBe('NOT_FOUND');
      expect(stop.mock.calls).toHaveLength(0);
    } finally { stop.mockRestore(); }
  });

  test('a canonical failure is passed on instead of becoming empty success', async () => {
    const read = spyOn(canonicalClient, 'getShellOutput').mockRejectedValue(new CanonicalApiError({
      type: 'urn:ohpichamber:problem:SERVICE_UNAVAILABLE', title: 'Unavailable', status: 503, detail: 'boom', code: 'SERVICE_UNAVAILABLE', retryable: true,
    }));
    try {
      expect(await codeOf(createGuestShellRequests().readOutput({ shellId: 'sh_1' }))).toBe('CanonicalApiError');
    } finally { read.mockRestore(); }
  });
});

describe('guest shell reply delivery', () => {
  const reply: HostMessage = {
    channel: OPENCHAMBER_SDK_CHANNEL, v: OPENCHAMBER_SDK_API_VERSION, type: 'result', id: 'oc-1', ok: true,
  };
  const target = () => {
    const posted: HostMessage[] = [];
    const port = { postMessage: (message: HostMessage) => { posted.push(message); } };
    return { posted, port };
  };

  test('posts on the captured port after transient status changes', () => {
    const { posted, port } = target();
    expect(postGuestShellReply(reply, {
      port, expectedPort: port, runtimeKey: 'runtime-a', currentRuntimeKey: 'runtime-a', disposed: false,
    })).toBe(true);
    expect(posted).toEqual([reply]);
  });

  test('never posts into a replaced port, a disposed frame or another endpoint', () => {
    const { posted, port } = target();
    const replaced = target();
    expect(postGuestShellReply(reply, { port, expectedPort: replaced.port, runtimeKey: 'runtime-a', currentRuntimeKey: 'runtime-a', disposed: false })).toBe(false);
    expect(postGuestShellReply(reply, { port, expectedPort: port, runtimeKey: 'runtime-a', currentRuntimeKey: 'runtime-b', disposed: false })).toBe(false);
    expect(postGuestShellReply(reply, { port, expectedPort: port, runtimeKey: 'runtime-a', currentRuntimeKey: 'runtime-a', disposed: true })).toBe(false);
    expect(postGuestShellReply(null, { port, expectedPort: port, runtimeKey: 'runtime-a', currentRuntimeKey: 'runtime-a', disposed: false })).toBe(false);
    expect(posted).toEqual([]);
  });
});
