import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostWorkerAuthorizationChannel } from './worker-authorization-channel.js';

const roots = [];
const channels = [];
afterEach(async () => { for (const channel of channels.splice(0)) channel.close(); for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

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
    authorizeWorkerOperation: async () => ({ allowed: false, code: 'UNAUTHORIZED', status: 403 }),
    invokeHostAction: (scope, request, signal) => invoke({ scope, request, signal, root }),
  }); channels.push(channel);
  const request = { type: 'worker.action.request', requestId: 'request', scope: live, request: { toolName: 'web', action: 'browser.capture', input: {}, sessionId: 'root' } };
  return { root, channel, child, request, reply, replies, changeGeneration: () => { live = { ...live, workerGeneration: 'replacement' }; }, closeChild: () => { current = false; channel.closeChild(child); } };
}

describe('private Host action authorization', () => {
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
