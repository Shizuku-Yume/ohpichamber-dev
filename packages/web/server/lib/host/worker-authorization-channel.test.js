import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHostWorkerAuthorizationChannel } from './worker-authorization-channel.js';
import { createSecretRequests } from '../openchamber-control/secret-request.js';

const roots = [];
const channels = [];
afterEach(async () => { for (const channel of channels.splice(0)) channel.close(); vi.useRealTimers(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

async function scenario(invoke) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'host-action-channel-')); roots.push(root);
  const captured = Object.freeze({ rootSessionId: 'root', projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'agent', cwd: root, agentDirectory: root });
  let live = { ...captured, workerGeneration: 'generation' };
  let current = true;
  const replies = [];
  const { promise: reply, resolve: complete } = Promise.withResolvers();
  const child = { connected: true, send: (value, callback) => { replies.push(value); complete(value); callback?.(); } };
  const channel = createHostWorkerAuthorizationChannel({
    isCurrentChild: candidate => candidate === child && current,
    capturedScope: () => captured,
    readLiveScope: async () => live,
    authorizeWorkerOperation: async () => ({ allowed: false, code: 'UNAUTHORIZED', status: 403, detail: 'The fixture refuses this operation' }),
    invokeHostAction: (scope, request, signal) => invoke({ scope, request, signal, root }),
  }); channels.push(channel);
  const request = { type: 'worker.action.request', requestId: 'request', scope: live, request: { toolName: 'web', action: 'browser.capture', input: {}, sessionId: 'root' } };
  return { root, channel, child, request, reply, replies, changeGeneration: () => { live = { ...live, workerGeneration: 'replacement' }; }, closeChild: () => { current = false; channel.closeChild(child); } };
}

describe('private Host action authorization', () => {
  it('allows more than two minutes of secret entry followed by a five-minute command', async () => {
    const waiting = Promise.withResolvers();
    let commandSignal;
    const run = vi.fn(async (_program, _args, options) => {
      commandSignal = options.signal;
      expect(options.timeoutMs).toBe(300_000);
      return new Promise(resolve => setTimeout(() => resolve({ code: 0, stdout: 'finished', stderr: '' }), options.timeoutMs));
    });
    const secrets = createSecretRequests({
      isEnabled: async () => true, run,
      onWaitChange: change => { if (change.type === 'waiting') waiting.resolve(); },
    });
    const test = await scenario(async ({ scope, request, signal }) => ({ ok: true, value: await secrets.run(request.input, { sessionId: request.sessionId, callId: request.toolCallId, directory: scope.cwd, signal }) }));
    test.request.request = {
      sessionId: 'root', toolName: 'openchamber_secret', action: 'secret.run', toolCallId: 'call',
      input: { program: process.execPath, reason: 'Authenticate', inputs: [{ env: 'TOKEN', label: 'API key' }], timeoutMs: 300_000 },
    };
    vi.useFakeTimers();
    test.channel.handleMessage(test.child, test.request);
    await waiting.promise;
    await vi.advanceTimersByTimeAsync(180_000);
    expect(secrets.fields({ sessionId: 'root', callId: 'call' })).toEqual({ fields: ['TOKEN'], reused: [] });
    expect(test.replies).toEqual([]);
    await secrets.answer({ sessionId: 'root', callId: 'call', values: { TOKEN: 'private-fixture-value' }, remember: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledOnce();
    expect(commandSignal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(commandSignal.aborted).toBe(false);
    expect(test.replies).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await test.reply).toMatchObject({ result: { ok: true, value: { answer: { status: 'ran', outcome: 'exited', exitCode: 0 }, stdout: 'finished' } } });
    expect(JSON.stringify(test.replies)).not.toContain('private-fixture-value');
  });
  it.each(['cancel', 'disconnect', 'shutdown'])('cancels an interactive secret action after two minutes on %s', async kind => {
    const entered = Promise.withResolvers(); const release = Promise.withResolvers(); const ended = Promise.withResolvers();
    const test = await scenario(async ({ signal }) => {
      entered.resolve(signal);
      try { await release.promise; return { ok: true, value: 'late-result' }; }
      finally { ended.resolve(); }
    });
    test.request.request = { sessionId: 'root', toolName: 'openchamber_secret', action: 'secret.run', toolCallId: 'call', input: {} };
    vi.useFakeTimers();
    test.channel.handleMessage(test.child, test.request);
    const signal = await entered.promise;
    await vi.advanceTimersByTimeAsync(180_000);
    expect(signal.aborted).toBe(false);
    if (kind === 'cancel') test.channel.handleMessage(test.child, { type: 'worker.action.cancel', requestId: 'request' });
    else if (kind === 'disconnect') test.closeChild();
    else test.channel.close();
    expect(signal.aborted).toBe(true);
    release.resolve(); await ended.promise;
    expect(test.replies).toEqual([]);
  });
  it.each(['browser.capture', 'secret.forget'])('keeps the two-minute deadline for %s', async action => {
    const entered = Promise.withResolvers();
    const test = await scenario(({ signal }) => {
      entered.resolve(signal);
      return new Promise(resolve => signal.addEventListener('abort', () => resolve({ ok: true, value: 'late-result' }), { once: true }));
    });
    if (action === 'secret.forget') test.request.request = { sessionId: 'root', toolName: 'openchamber_secret', action, toolCallId: 'forget', input: {} };
    vi.useFakeTimers();
    test.channel.handleMessage(test.child, test.request);
    const signal = await entered.promise;
    await vi.advanceTimersByTimeAsync(119_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(signal.aborted).toBe(true);
    expect(await test.reply).toMatchObject({ result: { ok: false, code: 'SERVICE_UNAVAILABLE', status: 503 } });
  });
  it('returns actual authorized capability results and preserves trusted captured scope', async () => {
    const test = await scenario(async ({ scope, request, signal, root }) => {
      expect(scope.workerGeneration).toBe('generation'); expect(scope.workspaceId).toBe('workspace'); expect(request.sessionId).toBe('root');
      signal.throwIfAborted(); await fs.writeFile(path.join(root, 'result'), 'actual-capability-result');
      return { ok: true, value: await fs.readFile(path.join(root, 'result'), 'utf8') };
    });
    test.channel.handleMessage(test.child, test.request);
    expect(await test.reply).toEqual({ type: 'worker.action.result', requestId: 'request', result: { ok: true, value: 'actual-capability-result' } });
  });
  it('denies a foreign session before invoking any Node capability', async () => {
    let calls = 0;
    const test = await scenario(async () => { calls++; throw new Error('Must not execute'); });
    test.channel.handleMessage(test.child, { ...test.request, request: { ...test.request.request, sessionId: 'foreign' } });
    expect(await test.reply).toMatchObject({ result: { ok: false, code: 'UNAUTHORIZED', status: 403 } }); expect(calls).toBe(0);
  });
  it('denies a retired worker generation before its side effect', async () => {
    let calls = 0;
    const test = await scenario(async () => { calls++; throw new Error('Must not execute'); });
    test.changeGeneration(); test.channel.handleMessage(test.child, test.request);
    expect(await test.reply).toMatchObject({ result: { ok: false, code: 'UNAUTHORIZED', status: 403 } }); expect(calls).toBe(0);
  });
  it('returns real capability denial instead of a successful tool payload', async () => {
    const test = await scenario(async () => ({ ok: false, code: 'UNAUTHORIZED', status: 403 }));
    test.channel.handleMessage(test.child, test.request);
    expect(await test.reply).toMatchObject({ result: { ok: false, code: 'UNAUTHORIZED', status: 403 } });
  });
  it('preserves canonical failure codes and detail message in worker action result', async () => {
    const test = await scenario(async () => ({
      ok: false,
      code: 'METADATA_CONFLICT',
      status: 409,
      detail: 'Project note changed; reload before saving',
    }));
    test.channel.handleMessage(test.child, test.request);
    expect(await test.reply).toEqual({
      type: 'worker.action.result',
      requestId: 'request',
      result: {
        ok: false,
        code: 'METADATA_CONFLICT',
        status: 409,
        detail: 'Project note changed; reload before saving',
      },
    });
  });
  it.each(['cancel', 'disconnect'])('aborts the actual pending capability on %s without writing or returning stale success', async kind => {
    const entered = Promise.withResolvers(); const release = Promise.withResolvers(); const ended = Promise.withResolvers();
    const test = await scenario(async ({ signal, root }) => {
      entered.resolve(signal);
      try { await release.promise; signal.throwIfAborted(); await fs.writeFile(path.join(root, 'forbidden'), 'side effect'); return { ok: true, value: true }; }
      finally { ended.resolve(); }
    });
    test.channel.handleMessage(test.child, test.request);
    const signal = await entered.promise;
    if (kind === 'cancel') test.channel.handleMessage(test.child, { type: 'worker.action.cancel', requestId: 'request' });
    else test.closeChild();
    expect(signal.aborted).toBe(true); release.resolve(); await ended.promise;
    expect(await fs.access(path.join(test.root, 'forbidden')).then(() => true, () => false)).toBe(false);
    expect(test.replies).toEqual([]);
  });
});
