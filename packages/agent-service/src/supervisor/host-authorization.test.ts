import { afterEach, beforeEach, expect, jest, test } from 'bun:test';
import { HostWorkerAuthorization } from './host-authorization.ts';
import type { HostActionRequest, HostAuthorizationScope } from './host-authorization-protocol.ts';

const descriptors = new Map(['send', 'connected'].map(key => [key, Object.getOwnPropertyDescriptor(process, key)]));
const scope: HostAuthorizationScope = { rootSessionId: 'root', projectId: 'project', workspaceId: 'workspace', cwd: '/project', agentDirectory: '/agent', workerGeneration: 'generation' };
const secret: HostActionRequest = {
  toolName: 'openchamber_secret', action: 'secret.run', sessionId: 'root', toolCallId: 'call',
  input: { program: 'node', reason: 'Authenticate', inputs: [{ env: 'TOKEN', label: 'API key' }], timeoutMs: 300_000 },
};
let sent: { type: string; requestId: string }[];
let authorization: HostWorkerAuthorization;
beforeEach(() => {
  jest.useFakeTimers();
  sent = [];
  Object.defineProperty(process, 'connected', { configurable: true, value: true });
  Object.defineProperty(process, 'send', { configurable: true, value: (message: { type: string; requestId: string }, callback: (error: Error | null) => void) => { sent.push(message); callback(null); return true; } });
  authorization = new HostWorkerAuthorization(() => scope);
});
afterEach(() => {
  authorization.close();
  jest.useRealTimers();
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(process, key, descriptor);
    else Reflect.deleteProperty(process, key);
  }
});

test('interactive secret invocation survives entry beyond two minutes plus the full command budget', async () => {
  const result = authorization.invoke('root', secret, new AbortController().signal);
  jest.advanceTimersByTime(180_000);
  expect(sent).toHaveLength(1);
  jest.advanceTimersByTime(300_000);
  expect(sent).toHaveLength(1);
  process.emit('message', { type: 'worker.action.result', requestId: sent[0]!.requestId, result: { ok: true, value: { answer: { status: 'ran' } } } });
  expect(await result).toEqual({ ok: true, value: { answer: { status: 'ran' } } });
});

for (const kind of ['abort', 'disconnect', 'shutdown'] as const) {
  test(`interactive secret invocation still cancels on ${kind}`, async () => {
    const controller = new AbortController();
    const result = authorization.invoke('root', secret, controller.signal);
    jest.advanceTimersByTime(180_000);
    if (kind === 'abort') controller.abort();
    else if (kind === 'disconnect') process.emit('disconnect');
    else authorization.close();
    expect(await result).toEqual({ ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 });
    expect(sent.map(message => message.type)).toEqual(['worker.action.request', 'worker.action.cancel']);
  });
}

test('ordinary actions and non-interactive secret actions keep the two-minute deadline', async () => {
  const requests: HostActionRequest[] = [
    { toolName: 'web', action: 'browser.capture', sessionId: 'root', input: {} },
    { toolName: 'openchamber_secret', action: 'secret.forget', sessionId: 'root', toolCallId: 'forget', input: {} },
  ];
  for (const request of requests) {
    const before = sent.length;
    const result = authorization.invoke('root', request, new AbortController().signal);
    jest.advanceTimersByTime(119_999);
    expect(sent).toHaveLength(before + 1);
    jest.advanceTimersByTime(1);
    expect(await result).toEqual({ ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 });
    expect(sent.at(-1)?.type).toBe('worker.action.cancel');
  }
});

test('invalid and already-aborted requests never open an unbounded action', async () => {
  expect(await authorization.invoke('foreign', secret, new AbortController().signal)).toEqual({ ok: false, code: 'UNAUTHORIZED', status: 403 });
  expect(await authorization.invoke('root', secret, AbortSignal.abort())).toEqual({ ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 });
  expect(sent).toEqual([]);
});
