import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { createAgentServiceSupervisor } from './agent-service-supervisor.js';

const scenarios = [];
afterEach(async () => {
  for (const scenario of scenarios.splice(0)) {
    await scenario.service.stop();
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});
const ownerIds = { projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'agent' };
const unavailable = { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
const reconcile = { action: 'reconcile', ...ownerIds };
const reconciled = { status: 'reconciled', sources: { workspace: '0', agent: '0' } };

async function scenario(handleSkillSource, { beforeReady } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-source-supervisor-'));
  const agentDirectory = path.join(root, 'agent');
  await fs.mkdir(agentDirectory);
  const children = [];
  const fetches = [];
  let requestNumber = 0;
  const service = createAgentServiceSupervisor({
    entrypoint: '/unused-test-agent-service.js', handleSkillSource,
    registry: { registerManagedProcess: async () => {}, unregisterManagedProcess: async () => {}, reapOrphanedProcesses: async () => ({ inspected: 0, reaped: 0 }), terminateManagedProcess: async () => false },
    spawn: () => {
      const child = new EventEmitter();
      Object.assign(child, {
        pid: 10000 + children.length, connected: true, exitCode: null, signalCode: null,
        stdout: new PassThrough(), stderr: new PassThrough(), replies: [],
        send(value, callback) { this.replies.push(value); this.emit('reply', value); callback?.(); },
        kill(signal) {
          this.connected = false;
          this.signalCode = signal;
          queueMicrotask(() => { this.emit('exit', null, signal); this.emit('close'); });
          return true;
        },
      });
      children.push(child);
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ type: 'agent-service.listening', port: 41000 })}\n`));
      return child;
    },
    fetchImpl: async (url) => {
      const pathname = new URL(url).pathname;
      fetches.push(pathname);
      if (pathname === '/api/agent/v1/ready') {
        await beforeReady?.(children.at(-1));
        return Response.json({ ready: true, engine: 'omp', version: '1.0.0' });
      }
      if (pathname === '/internal/workspaces/workspace') return Response.json({ ...ownerIds, authorizationRootId: 'authorization-root', catalogRevision: '0' });
      throw new Error('Unexpected service request');
    },
  });
  const test = {
    service, root, agentDirectory, children, fetches,
    get child() { return children.at(-1); },
    admit: () => service.request('/internal/workspaces/workspace', {
      method: 'POST', body: JSON.stringify({ projectId: ownerIds.projectId, agentDirectoryId: ownerIds.agentDirectoryId, cwd: root, agentDirectory }),
    }),
    request(operation, child = children.at(-1), extra = {}) {
      const requestId = `request-${++requestNumber}`;
      const reply = new Promise(resolve => {
        const listener = value => {
          if (value.requestId !== requestId) return;
          child.removeListener('reply', listener);
          resolve(value);
        };
        child.on('reply', listener);
      });
      child.emit('message', { type: 'host.skill-source.request', requestId, operation, ...extra });
      return reply;
    },
  };
  scenarios.push(test);
  await service.start();
  return test;
}

describe('supervised private skill source IPC boundary', () => {
  it('admits new-root reconciliation only after Host workspace capture, with trusted filesystem scope', async () => {
    const received = [];
    const test = await scenario(async (operation, scope) => { received.push({ operation, scope }); return reconciled; });
    expect((await test.request(reconcile)).result).toEqual(unavailable);
    expect(received).toEqual([]);
    await test.admit();
    const operation = { ...reconcile };
    expect((await test.request(operation)).result).toEqual(reconciled);
    expect(received).toHaveLength(1);
    expect(received[0].operation).toEqual(operation);
    expect(received[0].operation).not.toBe(operation);
    expect(received[0].scope).toEqual({ ...ownerIds, cwd: await fs.realpath(test.root), agentDirectory: await fs.realpath(test.agentDirectory) });
    expect(Object.isFrozen(received[0].scope)).toBe(true);
    expect(test.fetches).toEqual(['/api/agent/v1/ready', '/internal/workspaces/workspace']);
  });
  it('refuses callbacks before the current service child is ready', async () => {
    let calls = 0;
    const test = await scenario(async () => { calls++; return reconciled; }, {
      beforeReady: child => child.emit('message', { type: 'host.skill-source.request', requestId: 'starting', operation: reconcile }),
    });
    expect(calls).toBe(0);
    expect(test.child.replies).toEqual([{ type: 'host.skill-source.result', requestId: 'starting', result: unavailable }]);
  });


  it('delivers opaque commit IDs and validated committed results without extra service calls', async () => {
    const received = [];
    const test = await scenario(async (operation, scope) => { received.push({ operation, scope }); return { status: 'committed', sourceRevision: '8' }; });
    await test.admit();
    const operation = { action: 'commit', ...ownerIds, scope: 'agent', expectedSourceRevision: '7', operationId: 'operation-opaque' };
    const reply = await test.request(operation);
    expect(reply).toMatchObject({ type: 'host.skill-source.result', result: { status: 'committed', sourceRevision: '8' } });
    expect(received).toHaveLength(1);
    expect(received[0].operation).toEqual(operation);
    expect(test.fetches).toHaveLength(2);
  });

  it.each(['projectId', 'workspaceId', 'agentDirectoryId'])('refuses mismatched %s before calling the disk owner', async field => {
    let calls = 0;
    const test = await scenario(async () => { calls++; return reconciled; });
    await test.admit();
    expect((await test.request({ ...reconcile, [field]: 'foreign' })).result).toEqual(unavailable);
    expect(calls).toBe(0);
  });

  it.each(['cwd', 'agentDirectory', 'path'])('rejects service-supplied %s instead of forwarding arbitrary paths', async field => {
    let calls = 0;
    const test = await scenario(async () => { calls++; return reconciled; });
    await test.admit();
    expect((await test.request({ ...reconcile, [field]: '/private/foreign' })).result).toEqual(unavailable);
    expect(calls).toBe(0);
  });

  it('rejects unrecognized envelope fields and invalid operation discriminators', async () => {
    let calls = 0;
    const test = await scenario(async () => { calls++; return reconciled; });
    await test.admit();
    expect((await test.request(reconcile, test.child, { cwd: '/private/foreign' })).result).toEqual(unavailable);
    expect((await test.request({ ...reconcile, action: 'delete' })).result).toEqual(unavailable);
    expect(calls).toBe(0);
  });

  it('does not execute operations from a disconnected current child', async () => {
    let calls = 0;
    const test = await scenario(async () => { calls++; return reconciled; });
    await test.admit();
    test.child.connected = false;
    test.child.emit('disconnect');
    test.child.emit('message', { type: 'host.skill-source.request', requestId: 'disconnected', operation: reconcile });
    await nextTurn();
    expect(calls).toBe(0);
    expect(test.child.replies).toEqual([]);
  });

  it('rejects queued messages from a retired child after service restart', async () => {
    let calls = 0;
    const test = await scenario(async () => { calls++; return reconciled; });
    await test.admit();
    const retired = test.child;
    const queuedDelivery = retired.listeners('message')[0];
    await test.service.restart();
    await test.admit();
    retired.connected = true;
    queuedDelivery({ type: 'host.skill-source.request', requestId: 'retired', operation: reconcile });
    await nextTurn();
    expect(calls).toBe(0);
    expect(retired.replies).toEqual([{ type: 'host.skill-source.result', requestId: 'retired', result: unavailable }]);
    expect((await test.request(reconcile)).result).toEqual(reconciled);
    expect(calls).toBe(1);
  });

  it.each(['throw', 'malformed'])('returns a safe failure for %s callback output without leaking private details', async kind => {
    const test = await scenario(async () => {
      if (kind === 'throw') throw new Error('/private/secret token=do-not-expose');
      return { status: 'reconciled', sources: { workspace: '0', agent: '0' }, secret: 'do-not-expose' };
    });
    await test.admit();
    const reply = await test.request(reconcile);
    expect(reply.result).toEqual(unavailable);
    expect(JSON.stringify(reply)).not.toContain('do-not-expose');
    expect(JSON.stringify(reply)).not.toContain('/private');
  });

  it('preserves typed conflict failures rather than replacing them with a success', async () => {
    const failure = { status: 'failed', code: 'CATALOG_CONFLICT', currentRevision: '9' };
    const test = await scenario(async () => failure);
    await test.admit();
    expect((await test.request(reconcile)).result).toEqual(failure);
  });

  it('never replies with stale success when the service stops during a disk operation', async () => {
    const entered = Promise.withResolvers();
    const release = Promise.withResolvers();
    const test = await scenario(async () => { entered.resolve(); await release.promise; return reconciled; });
    await test.admit();
    const child = test.child;
    child.emit('message', { type: 'host.skill-source.request', requestId: 'pending', operation: reconcile });
    await entered.promise;
    await test.service.stop();
    release.resolve();
    await nextTurn();
    expect(child.replies).toEqual([]);
  });
});
