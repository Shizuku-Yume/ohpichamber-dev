import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentServiceSupervisor } from './agent-service-supervisor.js';

const scenarios = [];
afterEach(async () => {
  for (const scenario of scenarios.splice(0)) {
    await scenario.service.stop();
    await fs.rm(scenario.root, { recursive: true, force: true });
  }
});

const parentId = 'parent-session';
const childId = 'child-session';
const runtime = (sessionId) => ({
  sessionId, rootSessionId: sessionId, projectId: 'project', workspaceId: 'workspace',
  displayPath: 'workspace', createdAt: 1, updatedAt: 2,
  epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
});
const forkAck = (overrides = {}) => ({
  sessionId: childId, rootSessionId: childId, sessionFile: '/tmp/child.jsonl',
  sourceSessionId: parentId, entryId: 'entry', mode: 'selected', ...overrides,
});
const policy = { policyId: 'policy', revision: '1', scope: 'workspace', decision: 'deny', target: { toolName: 'bash', pattern: '*' } };
const failed = { type: 'approval.policy.failed', code: 'APPROVAL_POLICY_WRITE_FAILED' };

async function scenario({ fork }) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'approval-policy-supervisor-'));
  const agentDirectory = path.join(root, 'agent');
  await fs.mkdir(agentDirectory);
  let requestNumber = 0;
  const policyStore = {
    list: vi.fn(() => [policy]),
    commit: vi.fn(() => ({ policyId: 'committed', revision: '2' })),
    close: vi.fn(),
  };
  const children = [];
  const test = {
    root, agentDirectory, policyStore, children,
    get child() { return children.at(-1); },
    policy(type, request, extra = {}, child = children.at(-1)) {
      const requestId = `request-${++requestNumber}`;
      const reply = new Promise((resolve) => {
        const listener = (value) => {
          if (value.requestId !== requestId) return;
          child.removeListener('reply', listener);
          resolve(value);
        };
        child.on('reply', listener);
      });
      child.emit('message', { type, requestId, request: { ...request, ...extra } });
      return reply;
    },
    async captureParent() {
      return test.service.request('/internal/sessions', {
        method: 'POST',
        body: JSON.stringify({
          rootSessionId: parentId, projectId: 'project', workspaceId: 'workspace',
          cwd: root, agentDirectory, agentDirectoryId: 'agent', displayPath: 'workspace',
        }),
      });
    },
    fork: (extra = {}) => test.service.request(`/internal/sessions/${parentId}/fork`, {
      method: 'POST', body: JSON.stringify({ sourceSessionId: parentId, entryId: 'entry', mode: 'selected', ...extra }),
    }),
  };
  test.service = createAgentServiceSupervisor({
    entrypoint: '/unused-test-agent-service.js', approvalPolicyStore: policyStore,
    registry: { registerManagedProcess: async () => {}, unregisterManagedProcess: async () => {}, reapOrphanedProcesses: async () => ({ inspected: 0, reaped: 0 }), terminateManagedProcess: async () => false },
    spawn: () => {
      const child = new EventEmitter();
      Object.assign(child, {
        pid: 20000 + children.length, connected: true, exitCode: null, signalCode: null,
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
    fetchImpl: async (url, init = {}) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/agent/v1/ready') return Response.json({ ready: true, engine: 'omp', version: '1.0.0' });
      if (pathname === '/internal/sessions' && init.method === 'POST') return Response.json(runtime(parentId), { status: 201 });
      if (pathname === `/internal/sessions/${parentId}/reopen`) return Response.json(runtime(parentId));
      if (pathname === `/internal/sessions/${parentId}/fork`) return fork({ test, child: children.at(-1), input: JSON.parse(init.body) });
      if (pathname === `/api/agent/v1/sessions/${childId}`) return Response.json(runtime(childId));
      throw new Error(`Unexpected service request ${pathname}`);
    },
  });
  scenarios.push(test);
  await test.service.start();
  return test;
}

const list = (sessionId, extra = {}) => ['approval.policy.list', { sessionId, workspaceId: 'workspace' }, extra];
const commit = (sessionId, extra = {}) => ['approval.policy.commit', { sessionId, workspaceId: 'workspace', scope: 'session', decision: 'allow', target: { toolName: 'bash', pattern: '*' } }, extra];

describe('fork-derived approval policy scope', () => {
  it('authorizes the child policy list and commit before the child worker starts', async () => {
    const observed = {};
    const test = await scenario({
      fork: async ({ test, child, input }) => {
        observed.list = await test.policy(...list(childId, { forkOf: parentId, forkTicketId: input.forkTicketId }), child);
        observed.commit = await test.policy(...commit(childId), child);
        return Response.json(forkAck(), { status: 201 });
      },
    });
    await test.captureParent();

    const response = await test.fork();
    expect(response.status).toBe(201);
    expect(observed.list).toEqual({ type: 'approval.policy.listed', requestId: expect.any(String), policies: [policy] });
    expect(observed.commit).toEqual({ type: 'approval.policy.committed', requestId: expect.any(String), policyId: 'committed', revision: '2' });
    expect(test.policyStore.list).toHaveBeenCalledWith({ sessionId: childId, rootSessionId: childId, projectId: 'project', workspaceId: 'workspace' });
    expect(test.policyStore.commit).toHaveBeenCalledWith(expect.objectContaining({ sessionId: childId, rootSessionId: childId, projectId: 'project', workspaceId: 'workspace', scope: 'session', decision: 'allow' }));

    // The captured child keeps its own scope after the fork ticket is gone.
    expect(await test.policy(...list(childId))).toMatchObject({ type: 'approval.policy.listed' });
  });

  it('refuses a fork-derived scope claim without an in-flight fork of that parent', async () => {
    const test = await scenario({ fork: async () => Response.json(forkAck(), { status: 201 }) });
    await test.captureParent();

    expect(await test.policy(...list(childId, { forkOf: parentId, forkTicketId: 'ticket-without-fork' }))).toMatchObject({ ...failed, requestId: expect.any(String) });
    expect(test.policyStore.list).not.toHaveBeenCalled();
  });

  it('refuses a fork-derived scope claim from another workspace', async () => {
    const test = await scenario({
      fork: async ({ test, child, input }) => {
        await test.policy('approval.policy.list', { sessionId: childId, workspaceId: 'foreign-workspace' }, { forkOf: parentId, forkTicketId: input.forkTicketId }, child);
        return Response.json(forkAck(), { status: 201 });
      },
    });
    await test.captureParent();

    await test.fork();
    expect(test.policyStore.list).not.toHaveBeenCalled();
  });

  it('rejects a fork for an uncaptured parent, and a mismatched acknowledgement leaves no scope behind', async () => {
    const test = await scenario({
      fork: async ({ test, child, input }) => {
        await test.policy(...list(childId, { forkOf: parentId, forkTicketId: input.forkTicketId }), child);
        return Response.json(forkAck({ sessionId: 'other-child', rootSessionId: 'other-child' }), { status: 201 });
      },
    });
    await expect(test.fork()).rejects.toThrow('authorized source session scope');
    await test.captureParent();
    await expect(test.fork()).rejects.toThrow('Invalid Host fork admission');
    expect(await test.policy(...list(childId))).toMatchObject({ type: 'approval.policy.failed' });
    // Only the in-flight load was authorized; the mismatched acknowledgement removed the scope.
    expect(test.policyStore.list).toHaveBeenCalledTimes(1);
  });

  it('preserves captured-scope authorization for non-fork sessions', async () => {
    const test = await scenario({ fork: async () => Response.json(forkAck(), { status: 201 }) });
    await test.captureParent();

    expect(await test.policy(...list(parentId))).toMatchObject({ type: 'approval.policy.listed' });
    expect(await test.policy(...list('unknown-session'))).toMatchObject({ type: 'approval.policy.failed' });
  });

  it('correlates overlapping forks of one source to their own ticket regardless of arrival order', async () => {
    const arrivals = [];
    const releases = [];
    const started = [];
    const test = await scenario({
      fork: async ({ test, child, input }) => {
        const index = started.length;
        started.push(input.forkTicketId);
        const childFor = index === 0 ? 'child-a' : 'child-b';
        while (started.length < 2) await new Promise((resolve) => setTimeout(resolve, 5));
        // The second request answers first, so order-based ticket matching would cross-claim.
        if (index === 0) await new Promise((resolve) => setTimeout(resolve, 25));
        const reply = await test.policy(...list(childFor, { forkOf: parentId, forkTicketId: input.forkTicketId }), child);
        expect(reply).toMatchObject({ type: 'approval.policy.listed' });
        arrivals.push(childFor);
        await new Promise((resolve) => releases.push(resolve));
        return Response.json(forkAck({ sessionId: childFor, rootSessionId: childFor }), { status: 201 });
      },
    });
    await test.captureParent();

    const first = test.fork();
    const second = test.fork();
    while (releases.length < 2) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(arrivals).toEqual(['child-b', 'child-a']);
    releases[1]();
    releases[0]();
    expect((await first).status).toBe(201);
    expect((await second).status).toBe(201);
    expect(await test.policy(...list('child-a'))).toMatchObject({ type: 'approval.policy.listed' });
    expect(await test.policy(...list('child-b'))).toMatchObject({ type: 'approval.policy.listed' });
  });
});
