import { expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { SessionRegistry } from '../sessions/registry.ts';
import { WorkerRegistry, WORKER_CAPACITY_POLICY } from './workers.ts';

const workerEntrypoint = fileURLToPath(new URL('../worker/index.ts', import.meta.url));
type RegistryAccess = { registry?: SessionRegistry };

const waitFor = async (predicate: () => boolean, timeoutMs = 8_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await Bun.sleep(20);
  }
  throw new Error('Timed out waiting for the worker lifecycle');
};

test('an idle root is evicted and reopens cold with native history; a turn and approval are never evicted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-eviction-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'Retained eviction prompt', timestamp: Date.now() });
  manager.appendMessage({
    role: 'assistant', content: [{ type: 'text' as const, text: 'Retained eviction reply' }],
    api: 'openai-completions' as const, provider: 'fixture', model: 'fixture', stopReason: 'stop' as const,
    timestamp: Date.now(), usage: {
      input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    }
  });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  await manager.close();
  if (!sessionFile) throw new Error('Native session file is required');

  // The workers call back into the registry that is built from them.
  const sessionAccess: RegistryAccess = {};
  const workers = new WorkerRegistry({
    workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 30_000, stopTimeoutMs: 3_000,
    capacityPolicy: { ...WORKER_CAPACITY_POLICY, idleEvictionTimeoutMs: 150, reapIntervalMs: 20 },
    policyCheck: async () => ({ allowed: true }),
    isSessionIdle: rootSessionId => sessionAccess.registry?.isIdleForEviction(rootSessionId) ?? false,
    callbacks: {
      onOpened: (...args) => sessionAccess.registry!.onOpened(...args),
      onEvents: (...args) => sessionAccess.registry!.onEvents(...args),
      onInteraction: (...args) => sessionAccess.registry!.onInteraction(...args),
      onExit: (...args) => sessionAccess.registry!.onExit(...args),
    },
  });
  const registry = new SessionRegistry(join(root, 'service-state'), workers);
  sessionAccess.registry = registry;
  const source = {
    rootSessionId: 'root-eviction', projectId: 'project', workspaceId: 'workspace',
    cwd, agentDirectory, agentDirectoryId: 'agent-owner', displayPath: 'workspace',
    sessionFile, sessionsDirectory,
    env: {
      HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
      OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
      XDG_STATE_HOME: join(root, 'state'), XDG_CACHE_HOME: join(root, 'cache')
    },
  };
  try {
    await registry.initialize();
    await registry.open(source);
    expect(registry.isIdleForEviction(source.rootSessionId)).toBe(true);
    await waitFor(() => workers.info(source.rootSessionId) === undefined);
    expect(registry.runtime(source.rootSessionId).runtimeStatus).toBe('unavailable');

    await registry.reopen(source);
    const reopened = await registry.history({ sessionId: source.rootSessionId });
    expect(JSON.stringify(reopened.messages)).toContain('Retained eviction prompt');
    expect(JSON.stringify(reopened.messages)).toContain('Retained eviction reply');

    const generation = workers.authorizationScope(source.rootSessionId)?.workerGeneration;
    if (!generation) throw new Error('A live worker generation is required');
    registry.onEvents(source.rootSessionId, generation, [{
      timestamp: Date.now(),
      event: { type: 'session.status', runtimeStatus: 'running', activeRunId: 'run-active' }
    }]);
    expect(registry.isIdleForEviction(source.rootSessionId)).toBe(false);
    await Bun.sleep(400);
    expect(workers.info(source.rootSessionId)?.state).toBe('ready');

    registry.onEvents(source.rootSessionId, generation, [{
      timestamp: Date.now(),
      event: { type: 'session.status', runtimeStatus: 'idle', activeRunId: null }
    }]);
    await waitFor(() => workers.info(source.rootSessionId) === undefined);

    await registry.reopen(source);
    const approvalGeneration = workers.authorizationScope(source.rootSessionId)?.workerGeneration;
    if (!approvalGeneration) throw new Error('A live worker generation is required');
    registry.onInteraction(source.rootSessionId, approvalGeneration, {
      kind: 'approval', approvalId: 'approval-pending', toolCallId: 'tool-pending', toolName: 'bash',
      actionType: 'bash_command', commandSummary: 'run a command', details: {},
      policyTarget: { toolName: 'bash', pattern: 'native-input' }, turnId: 'turn-pending',
    });
    expect(registry.approvals(source.rootSessionId)).toHaveLength(1);
    expect(registry.isIdleForEviction(source.rootSessionId)).toBe(false);
    await Bun.sleep(400);
    expect(workers.info(source.rootSessionId)?.state).toBe('ready');
    expect(registry.approvals(source.rootSessionId)).toHaveLength(1);
    registry.onInteraction(source.rootSessionId, approvalGeneration, {
      kind: 'cancel', approvalId: 'approval-pending',
    });
    expect(registry.approvals(source.rootSessionId)).toHaveLength(0);
    expect(registry.isIdleForEviction(source.rootSessionId)).toBe(true);
  } finally {
    try { await registry.close(); } finally {
      try { await workers.close(); } finally {
        if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
        await rm(root, { recursive: true, force: true });
      }
    }
  }
}, 60_000);

test('an idle workspace catalog worker is stopped and starts again on the next catalog request', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-eviction-stateless-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const workers = new WorkerRegistry({
    workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 30_000, stopTimeoutMs: 3_000,
    capacityPolicy: { ...WORKER_CAPACITY_POLICY, reapIntervalMs: 20 },
    statelessIdleTimeoutMs: 150,
  });
  const input = {
    rootSessionId: 'catalog-root', projectId: 'project', workspaceId: 'workspace', cwd,
    agentDirectory, agentDirectoryId: 'agent-owner', catalogRevision: '0',
  };
  try {
    const first = await workers.startStateless(input);
    await waitFor(() => workers.info(input.rootSessionId) === undefined);
    const second = await workers.startStateless(input);
    expect(second.state).toBe('ready');
    expect(second.workerGeneration).not.toBe(first.workerGeneration);
  } finally {
    try { await workers.close(); } finally { await rm(root, { recursive: true, force: true }); }
  }
}, 60_000);

test('a running subagent blocks eviction and worker stop settles it to cancelled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-eviction-subagent-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'Parent prompt', timestamp: Date.now() });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  if (!sessionFile) throw new Error('Native session file is required');
  const artifacts = manager.getArtifactsDir();
  if (!artifacts) throw new Error('Native artifacts are required');
  const childDirectory = join(artifacts, 'task', 'detached-child');
  await mkdir(childDirectory, { recursive: true });
  const child = await SessionManager.open(join(childDirectory, 'child.jsonl'), childDirectory, undefined,
    { initialCwd: cwd, parentSession: sessionFile });
  child.appendMessage({ role: 'user', content: 'Detached child task', timestamp: Date.now() });
  await child.ensureOnDisk();
  await child.flush();
  const childFile = child.getSessionFile();
  await child.close();
  await manager.close();
  if (!childFile) throw new Error('Native child session file is required');

  const sessionAccess: RegistryAccess = {};
  const workers = new WorkerRegistry({
    workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 30_000, stopTimeoutMs: 3_000,
    capacityPolicy: { ...WORKER_CAPACITY_POLICY, idleEvictionTimeoutMs: 150, reapIntervalMs: 20 },
    policyCheck: async () => ({ allowed: true }),
    isSessionIdle: rootSessionId => sessionAccess.registry?.isIdleForEviction(rootSessionId) ?? false,
    callbacks: {
      onOpened: (...args) => sessionAccess.registry!.onOpened(...args),
      onEvents: (...args) => sessionAccess.registry!.onEvents(...args),
      onInteraction: (...args) => sessionAccess.registry!.onInteraction(...args),
      onExit: (...args) => sessionAccess.registry!.onExit(...args),
      onSubagent: (...args) => { void sessionAccess.registry!.onSubagent(...args).catch(() => { }); },
    },
  });
  const registry = new SessionRegistry(join(root, 'service-state'), workers);
  sessionAccess.registry = registry;
  const source = {
    rootSessionId: 'root-subagent-eviction', projectId: 'project', workspaceId: 'workspace',
    cwd, agentDirectory, agentDirectoryId: 'agent-owner', displayPath: 'workspace',
    sessionFile, sessionsDirectory,
    env: {
      HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
      OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
      XDG_STATE_HOME: join(root, 'state'), XDG_CACHE_HOME: join(root, 'cache')
    },
  };
  try {
    await registry.initialize();
    await registry.open(source);
    let scope = workers.authorizationScope(source.rootSessionId);
    if (!scope) throw new Error('A live worker generation is required');

    // A `running` subagent is live detached work: it defeats the idle timeout.
    await registry.onSubagent(source.rootSessionId, scope.workerGeneration, {
      subagentId: 'detached-child', status: 'started', role: 'scout', sessionFile: childFile,
    });
    expect(registry.listSubagents(source.rootSessionId)[0]?.status).toBe('running');
    expect(registry.isIdleForEviction(source.rootSessionId)).toBe(false);
    // Real delay: the reaper's idle timeout is a wall-clock contract, so the
    // proof that a running subagent blocks eviction needs a genuine scan window.
    await Bun.sleep(400);
    expect(workers.info(source.rootSessionId)?.state).toBe('ready');

    // A terminal record frees the root; the reaper evicts it normally.
    await registry.onSubagent(source.rootSessionId, scope.workerGeneration, {
      subagentId: 'detached-child', status: 'completed', role: 'scout', sessionFile: childFile,
    });
    expect(registry.isIdleForEviction(source.rootSessionId)).toBe(true);
    await waitFor(() => workers.info(source.rootSessionId) === undefined);

    // Stopping the worker settles a `running` record to `cancelled` instead of
    // leaving a phantom running row behind.
    await registry.reopen(source);
    scope = workers.authorizationScope(source.rootSessionId);
    if (!scope) throw new Error('A live worker generation is required');
    await registry.onSubagent(source.rootSessionId, scope.workerGeneration, {
      subagentId: 'detached-child', status: 'started', role: 'scout', sessionFile: childFile,
    });
    expect(registry.listSubagents(source.rootSessionId)[0]?.status).toBe('running');
    await workers.stop(source.rootSessionId);
    expect(registry.listSubagents(source.rootSessionId)[0]?.status).toBe('cancelled');
    await registry.reopen(source);
    expect(registry.listSubagents(source.rootSessionId)[0]?.status).toBe('cancelled');
  } finally {
    try { await registry.close(); } finally {
      try { await workers.close(); } finally {
        if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
        await rm(root, { recursive: true, force: true });
      }
    }
  }
}, 60_000);

test('killing the worker while a subagent runs leaves a settled hub roster the registry answers without a worker', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-hub-settle-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'Parent prompt', timestamp: Date.now() });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  if (!sessionFile) throw new Error('Native session file is required');
  const artifacts = manager.getArtifactsDir();
  if (!artifacts) throw new Error('Native artifacts are required');
  const childDirectory = join(artifacts, 'task', 'hub-child');
  await mkdir(childDirectory, { recursive: true });
  const child = await SessionManager.open(join(childDirectory, 'child.jsonl'), childDirectory, undefined,
    { initialCwd: cwd, parentSession: sessionFile });
  child.appendMessage({ role: 'user', content: 'Detached child task', timestamp: Date.now() });
  await child.ensureOnDisk();
  await child.flush();
  const childFile = child.getSessionFile();
  await child.close();
  await manager.close();
  if (!childFile) throw new Error('Native child session file is required');

  const sessionAccess: RegistryAccess = {};
  const workers = new WorkerRegistry({
    workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 30_000, stopTimeoutMs: 3_000,
    policyCheck: async () => ({ allowed: true }),
    isSessionIdle: rootSessionId => sessionAccess.registry?.isIdleForEviction(rootSessionId) ?? false,
    callbacks: {
      onOpened: (...args) => sessionAccess.registry!.onOpened(...args),
      onEvents: (...args) => sessionAccess.registry!.onEvents(...args),
      onInteraction: (...args) => sessionAccess.registry!.onInteraction(...args),
      onExit: (...args) => sessionAccess.registry!.onExit(...args),
      onSubagent: (...args) => { void sessionAccess.registry!.onSubagent(...args).catch(() => { }); },
    },
  });
  const registry = new SessionRegistry(join(root, 'service-state'), workers);
  sessionAccess.registry = registry;
  const source = {
    rootSessionId: 'root-hub-settle', projectId: 'project', workspaceId: 'workspace',
    cwd, agentDirectory, agentDirectoryId: 'agent-owner', displayPath: 'workspace',
    sessionFile, sessionsDirectory,
    env: {
      HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
      OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
      XDG_STATE_HOME: join(root, 'state'), XDG_CACHE_HOME: join(root, 'cache')
    },
  };
  try {
    await registry.initialize();
    await registry.open(source);
    const scope = workers.authorizationScope(source.rootSessionId);
    if (!scope) throw new Error('A live worker generation is required');
    await registry.onSubagent(source.rootSessionId, scope.workerGeneration, {
      subagentId: 'hub-child', status: 'started', role: 'scout', sessionFile: childFile,
    });
    expect(registry.listSubagents(source.rootSessionId)[0]?.status).toBe('running');

    // The worker leaves with the child still running; the hub list must answer
    // from the settled persisted record rather than waiting on a worker that no
    // longer exists.
    await workers.stop(source.rootSessionId);
    const startedAt = Date.now();
    const roster = await registry.listHubSubagents(source.rootSessionId);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
    expect(roster.map(row => row.subagentId)).toEqual(['hub-child']);
    expect(roster[0]?.status).toBe('cancelled');

    // The settled record survives a cold service restart: the repopulated
    // index reads `cancelled` out of the persisted child index.
    await registry.close();
    await workers.close();
    const workers2 = new WorkerRegistry({
      workerEntrypoint, workerRuntime: process.execPath,
      startupTimeoutMs: 30_000, stopTimeoutMs: 3_000,
      policyCheck: async () => ({ allowed: true }),
      isSessionIdle: rootSessionId => sessionAccess.registry?.isIdleForEviction(rootSessionId) ?? false,
      callbacks: {
        onOpened: (...args) => sessionAccess.registry!.onOpened(...args),
        onEvents: (...args) => sessionAccess.registry!.onEvents(...args),
        onInteraction: (...args) => sessionAccess.registry!.onInteraction(...args),
        onExit: (...args) => sessionAccess.registry!.onExit(...args),
        onSubagent: (...args) => { void sessionAccess.registry!.onSubagent(...args).catch(() => { }); },
      },
    });
    const registry2 = new SessionRegistry(join(root, 'service-state'), workers2);
    sessionAccess.registry = registry2;
    try {
      await registry2.initialize();
      const cold = await registry2.listHubSubagents(source.rootSessionId);
      expect(cold.map(row => row.subagentId)).toEqual(['hub-child']);
      expect(cold[0]?.status).toBe('cancelled');

      // Re-attaching a new worker must preserve the persisted settled roster
      // rather than returning an empty live AgentRegistry or hanging.
      await registry2.open(source);
      const reattachedStart = Date.now();
      const reattached = await registry2.listHubSubagents(source.rootSessionId);
      expect(Date.now() - reattachedStart).toBeLessThan(5_000);
      expect(reattached.map(row => row.subagentId)).toEqual(['hub-child']);
      expect(reattached[0]?.status).toBe('cancelled');
      expect(registry2.isIdleForEviction(source.rootSessionId)).toBe(true);
    } finally {
      try { await registry2.close(); } finally { await workers2.close(); }
    }

    // Hard-kill case: `session-references.json` still had `running` on disk
    // when the replacement service starts. `initialize()` + re-attach must
    // settle it to `cancelled` and clear eviction blocking.
    const refsPath = join(root, 'service-state', 'session-references.json');
    const PersistedRefsSchema = z.object({
      subagents: z.record(z.string(), z.array(z.looseObject({ status: z.string() }))),
    }).passthrough();
    const rawRefs = PersistedRefsSchema.parse(JSON.parse(await readFile(refsPath, 'utf8')));
    rawRefs.subagents[source.rootSessionId] = (rawRefs.subagents[source.rootSessionId] ?? []).map(row => ({ ...row, status: 'running' }));
    await writeFile(refsPath, JSON.stringify(rawRefs), 'utf8');
    const workers3 = new WorkerRegistry({
      workerEntrypoint, workerRuntime: process.execPath,
      startupTimeoutMs: 30_000, stopTimeoutMs: 3_000,
      policyCheck: async () => ({ allowed: true }),
      isSessionIdle: rootSessionId => sessionAccess.registry?.isIdleForEviction(rootSessionId) ?? false,
      callbacks: {
        onOpened: (...args) => sessionAccess.registry!.onOpened(...args),
        onEvents: (...args) => sessionAccess.registry!.onEvents(...args),
        onInteraction: (...args) => sessionAccess.registry!.onInteraction(...args),
        onExit: (...args) => sessionAccess.registry!.onExit(...args),
        onSubagent: (...args) => { void sessionAccess.registry!.onSubagent(...args).catch(() => { }); },
      },
    });
    const registry3 = new SessionRegistry(join(root, 'service-state'), workers3);
    sessionAccess.registry = registry3;
    try {
      await registry3.initialize();
      await registry3.open(source);
      const settledStart = Date.now();
      const settled = await registry3.listHubSubagents(source.rootSessionId);
      expect(Date.now() - settledStart).toBeLessThan(5_000);
      expect(settled.map(row => row.subagentId)).toEqual(['hub-child']);
      expect(settled[0]?.status).toBe('cancelled');
      expect(registry3.isIdleForEviction(source.rootSessionId)).toBe(true);
    } finally {
      try { await registry3.close(); } finally { await workers3.close(); }
    }
  } finally {
    try { await registry.close(); } finally {
      try { await workers.close(); } finally {
        if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
        await rm(root, { recursive: true, force: true });
      }
    }
  }
}, 60_000);

test('listHubSubagents never inherits stale metrics or childSessionId onto a fresh live subagent with a reused id', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-hub-merge-'));
  const stateDir = join(root, 'service-state');
  await mkdir(stateDir, { recursive: true });
  const rootSessionId = 'root-hub-merge';
  const refsPath = join(stateDir, 'session-references.json');
  await writeFile(refsPath, JSON.stringify({
    references: {
      [rootSessionId]: {
        rootSessionId, projectId: 'project', workspaceId: 'workspace',
        cwd: root, agentDirectory: join(root, 'agent'), displayPath: 'workspace',
        sessionFile: join(root, 'root.jsonl'), sessionsDirectory: root,
        createdAt: 1000, updatedAt: 2000,
      },
    },
    relocations: {},
    subagents: {
      [rootSessionId]: [
        {
          subagentId: 'AlphaScout', parentSessionId: rootSessionId, childSessionId: 'stale-child-uuid',
          toolCallId: 'call-old', name: 'AlphaScout', role: 'scout',
          solutionSpace: 'old brief', description: 'old desc',
          status: 'completed', tokens: 450, cost: 0.12, durationMs: 9000,
          rootSessionId, workspaceId: 'workspace', projectId: 'project',
          sessionFile: join(root, 'AlphaScout.jsonl'),
        },
      ],
    },
  }), 'utf8');

  const workers = new WorkerRegistry({
    workerEntrypoint, workerRuntime: process.execPath,
    startupTimeoutMs: 5_000, stopTimeoutMs: 1_000,
    policyCheck: async () => ({ allowed: true }),
  });
  const registry = new SessionRegistry(stateDir, workers);
  try {
    await registry.initialize();
    const requestSpy = spyOn(workers, 'request');

    // Fresh live run reusing `AlphaScout` (`persisted` absent): must not inherit stale prior fields.
    requestSpy.mockResolvedValueOnce({
      type: 'subagents.list',
      subagents: [{
        subagentId: 'AlphaScout',
        parentSessionId: rootSessionId,
        name: 'AlphaScout',
        role: 'scout',
        status: 'running',
      }],
    });
    const fresh = await registry.listHubSubagents(rootSessionId);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]).toMatchObject({ subagentId: 'AlphaScout', status: 'running', role: 'scout' });
    expect(fresh[0]?.childSessionId).toBeUndefined();
    expect(fresh[0]?.durationMs).toBeUndefined();
    expect(fresh[0]?.tokens).toBeUndefined();
    expect(fresh[0]?.cost).toBeUndefined();
    expect(fresh[0]?.solutionSpace).toBeUndefined();
    expect(fresh[0]?.toolCallId).toBeUndefined();

    // Disk-revived entry (`persisted: true`): must retain pre-restart settled metadata.
    requestSpy.mockResolvedValueOnce({
      type: 'subagents.list',
      subagents: [{
        subagentId: 'AlphaScout',
        parentSessionId: rootSessionId,
        name: 'AlphaScout',
        role: 'AlphaScout',
        status: 'parked',
        persisted: true,
      }],
    });
    const revived = await registry.listHubSubagents(rootSessionId);
    expect(revived).toHaveLength(1);
    expect(revived[0]).toMatchObject({
      subagentId: 'AlphaScout',
      status: 'completed',
      childSessionId: 'stale-child-uuid',
      role: 'scout',
      solutionSpace: 'old brief',
      toolCallId: 'call-old',
      durationMs: 9000,
      tokens: 450,
      cost: 0.12,
      persisted: true,
    });
  } finally {
    try { await registry.close(); } finally {
      try { await workers.close(); } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  }
});
