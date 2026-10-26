import { describe, expect, it, vi } from 'vitest';
import os from 'os';
import path from 'path';
import { mkdtemp, rm, mkdir, writeFile, stat, readdir, symlink } from 'fs/promises';
import {
  computeNextRunAt,
  formatScheduledSessionTitle,
  createScheduledTasksRuntime,
} from './runtime.js';
import { createProjectConfigRuntime } from '../projects/project-config.js';
import { createChatsScope } from './chats-scope.js';
import { loopFingerprint, parseLoopDefinition } from './loops.js';

describe('scheduled-tasks runtime helpers', () => {
  it.each([
    ['*/15 * * * *', 'UTC', '2026-09-18T08:07:00Z', '2026-09-18T08:15:00Z'],
    ['30 */5 * * * *', 'UTC', '2026-09-18T08:07:00Z', '2026-09-18T08:10:30Z'],
    ['0 9 * * MON-FRI', 'Europe/Kyiv', '2026-09-18T07:00:00Z', '2026-09-21T06:00:00Z'],
    ['0 9 * * *', 'Europe/Kyiv', '2026-03-28T08:00:00Z', '2026-03-29T06:00:00Z'],
    ['0 9 * * *', 'Europe/Kyiv', '2026-10-24T08:00:00Z', '2026-10-25T07:00:00Z'],
    ['0 0 L * *', 'UTC', '2026-02-01T00:00:00Z', '2026-02-28T00:00:00Z'],
  ])('computes cron %s in %s from %s', (cron, timezone, now, expected) => {
    expect(computeNextRunAt({
      enabled: true,
      schedule: { kind: 'cron', cron, timezone },
    }, Date.parse(now))).toBe(Date.parse(expected));
  });

  it('computes next daily run in timezone', () => {
    const nowUtc = Date.UTC(2025, 0, 1, 8, 0, 0);
    const next = computeNextRunAt({
      enabled: true,
      schedule: {
        kind: 'daily',
        times: ['09:30'],
        timezone: 'UTC',
      },
    }, nowUtc);

    expect(next).toBe(Date.UTC(2025, 0, 1, 9, 30, 0));
  });

  it('computes weekly next run using weekdays', () => {
    // Monday 2025-01-06 10:00:00 UTC
    const nowUtc = Date.UTC(2025, 0, 6, 10, 0, 0);
    const next = computeNextRunAt({
      enabled: true,
      schedule: {
        kind: 'weekly',
        times: ['09:00'],
        weekdays: [1, 3],
        timezone: 'UTC',
      },
    }, nowUtc);

    // Wednesday 2025-01-08 09:00:00 UTC
    expect(next).toBe(Date.UTC(2025, 0, 8, 9, 0, 0));
  });

  it('picks nearest time from multiple daily times', () => {
    const nowUtc = Date.UTC(2025, 0, 1, 9, 20, 0);
    const next = computeNextRunAt({
      enabled: true,
      schedule: {
        kind: 'daily',
        times: ['09:15', '09:45', '18:00'],
        timezone: 'UTC',
      },
    }, nowUtc);

    expect(next).toBe(Date.UTC(2025, 0, 1, 9, 45, 0));
  });

  it('computes one-time next run for future date', () => {
    const nowUtc = Date.UTC(2026, 3, 15, 10, 0, 0);
    const next = computeNextRunAt({
      enabled: true,
      schedule: {
        kind: 'once',
        date: '2026-04-16',
        time: '13:30',
        timezone: 'UTC',
      },
    }, nowUtc);

    expect(next).toBe(Date.UTC(2026, 3, 16, 13, 30, 0));
  });

  it('returns null for past one-time schedule', () => {
    const nowUtc = Date.UTC(2026, 3, 16, 14, 0, 0);
    const next = computeNextRunAt({
      enabled: true,
      schedule: {
        kind: 'once',
        date: '2026-04-16',
        time: '13:30',
        timezone: 'UTC',
      },
    }, nowUtc);

    expect(next).toBeNull();
  });

  it('formats session title with timestamp suffix', () => {
    const title = formatScheduledSessionTitle({
      name: 'Morning Sync',
      schedule: { timezone: 'UTC' },
    }, Date.UTC(2025, 2, 10, 7, 5, 0));

    expect(title).toBe('Morning Sync 2025-03-10 07:05');
  });

});

describe('scheduled-tasks runtime syncProject wiring', () => {
  const createTempProject = async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'oc-runtime-loop-'));
    const repoPath = path.join(tempRoot, 'repo');
    await mkdir(path.join(repoPath, '.agents', 'loops'), { recursive: true });
    return {
      tempRoot,
      repoPath,
      cleanup: async () => {
        await rm(tempRoot, { recursive: true, force: true });
      },
    };
  };

  const createProjectConfig = async (tempRoot) => createProjectConfigRuntime({
    fsPromises: await import('fs/promises'),
    path,
    projectsDirPath: path.join(tempRoot, 'config'),
    createTaskID: () => 'task-fixed-id',
  });

  const createRuntimeDeps = (overrides = {}) => overrides;

  it('reconciles discovered loops when the project path is known', async () => {
    const { tempRoot, repoPath, cleanup } = await createTempProject();
    try {
      await writeFile(path.join(repoPath, '.agents', 'loops', 'daily.md'), `---
name: daily
schedule: "0 9 * * *"
enabled: true
model: openai/gpt-5
---
Run daily.
`, 'utf8');

      const projectConfigRuntime = await createProjectConfig(tempRoot);
      const runtime = createScheduledTasksRuntime({
        ...createRuntimeDeps(),
        projectConfigRuntime,
        listProjects: async () => [{ id: 'proj', path: repoPath }],
      });

      const loopFile = path.join(repoPath, '.agents', 'loops', 'daily.md');
      await runtime.syncProject('proj');

      // `enabled: true` came with the repository: listed, not scheduled.
      let tasks = await projectConfigRuntime.listScheduledTasks('proj');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('loop:project:daily');
      expect(tasks[0].loopFile).toBe(loopFile);
      expect(tasks[0].enabled).toBe(false);

      // Approved on this machine, this version runs.
      await projectConfigRuntime.setLoopApproval('proj', loopFile, loopFingerprint(parseLoopDefinition(loopFile)));
      await runtime.syncProject('proj');
      tasks = await projectConfigRuntime.listScheduledTasks('proj');
      expect(tasks[0].enabled).toBe(true);
      // syncTaskSchedule computed and persisted the next run for the enabled task.
      expect(tasks[0].state.nextRunAt).toBeGreaterThan(0);

      // A changed prompt is a new version and waits for a new approval.
      await writeFile(loopFile, `---
name: daily
schedule: "0 9 * * *"
enabled: true
model: openai/gpt-5
---
Run something else.
`, 'utf8');
      await runtime.syncProject('proj');
      tasks = await projectConfigRuntime.listScheduledTasks('proj');
      expect(tasks[0].enabled).toBe(false);
    } finally {
      await cleanup();
    }
  });

  it('falls back to plain listing when the project path cannot be resolved', async () => {
    const { tempRoot, cleanup } = await createTempProject();
    try {
      const projectConfigRuntime = await createProjectConfig(tempRoot);
      const reconcileSpy = vi.spyOn(projectConfigRuntime, 'reconcileLoopTasks');
      const listSpy = vi.spyOn(projectConfigRuntime, 'listScheduledTasks');

      const runtime = createScheduledTasksRuntime({
        ...createRuntimeDeps(),
        projectConfigRuntime,
        // Project not registered -> ensureProjectPath cannot resolve a path.
        listProjects: async () => [],
      });

      await runtime.syncProject('proj');

      expect(reconcileSpy).not.toHaveBeenCalled();
      expect(listSpy).toHaveBeenCalledWith('proj');
      expect(await projectConfigRuntime.listScheduledTasks('proj')).toEqual([]);
      reconcileSpy.mockRestore();
      listSpy.mockRestore();
    } finally {
      await cleanup();
    }
  });
});

describe('scheduled-tasks runtime syncAllProjects', () => {
  it('keeps scheduling the other projects when one project cannot be synced', async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'oc-runtime-sync-all-'));
    try {
      const brokenPath = path.join(tempRoot, 'broken');
      const healthyPath = path.join(tempRoot, 'healthy');
      await mkdir(path.join(healthyPath, '.agents', 'loops'), { recursive: true });
      await mkdir(brokenPath, { recursive: true });
      await writeFile(path.join(healthyPath, '.agents', 'loops', 'daily.md'), `---
name: daily
schedule: "0 9 * * *"
enabled: true
model: openai/gpt-5
---
Run daily.
`, 'utf8');

      const projectConfigRuntime = createProjectConfigRuntime({
        fsPromises: await import('fs/promises'),
        path,
        projectsDirPath: path.join(tempRoot, 'config'),
        createTaskID: () => 'task-fixed-id',
      });
      await mkdir(path.join(tempRoot, 'config'), { recursive: true });
      await writeFile(projectConfigRuntime.resolveProjectConfigPath('broken'), '{ not json', 'utf8');
      const healthyLoop = path.join(healthyPath, '.agents', 'loops', 'daily.md');
      await projectConfigRuntime.setLoopApproval('healthy', healthyLoop, loopFingerprint(parseLoopDefinition(healthyLoop)));

      const warnings = [];
      const runtime = createScheduledTasksRuntime({
        projectConfigRuntime,
        messageQueueRuntime: { hasScheduledTask: async () => false, getState: async () => ({ revision: '0', items: [] }), append: async () => {}, cancelScheduledTask: async () => {} },
        listProjects: async () => [
          { id: 'broken', path: brokenPath },
          { id: 'healthy', path: healthyPath },
        ],
        logger: { warn: (...args) => warnings.push(args) },
      });

      await expect(runtime.start()).resolves.toBeUndefined();

      expect(runtime.getStatus().enabledScheduledTasksCount).toBe(1);
      const healthyTasks = await projectConfigRuntime.listScheduledTasks('healthy');
      expect(healthyTasks.map((task) => task.id)).toEqual(['loop:project:daily']);
      expect(warnings).toHaveLength(2);
      expect(warnings[0][1]).toMatchObject({ projectId: 'broken' });
      expect(warnings[1][1]).toMatchObject({ projectID: 'broken' });
      runtime.stop();
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

describe('canonical scheduled execution', () => {
  const workspace = { hostProjectId: 'host-project', projectId: 'opaque-project', workspaceId: 'opaque-workspace', cwd: '/repo' };
  const session = (scope, id = 'session') => ({ sessionId: id, rootSessionId: id, projectId: scope.projectId, workspaceId: scope.workspaceId,
    displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
    mode: { kind: 'main' }, metadata: null, metadataRevision: '0', archiveRevision: '0' });
  const setup = (execution = {}, extra = {}) => {
    let task = { id: 'task', name: 'Daily', enabled: false, schedule: { kind: 'daily', times: ['09:00'], timezone: 'UTC' },
      execution: { prompt: 'Do the work', providerID: 'provider', modelID: 'model', agent: 'agent', variant: 'high', ...execution }, state: {} };
    const sent = [];
    const created = [];
    const controls = [];
    const callOrder = [];
    const messageQueueRuntime = { hasScheduledTask: async () => false, getState: async () => ({ revision: '0', items: [] }),
      append: async () => {}, cancelScheduledTask: async () => {} };
    const projectConfigRuntime = {
      listScheduledTasks: async () => [task], reconcileLoopTasks: async () => [task],
      updateScheduledTaskState: async (_project, _task, patch) => { task = { ...task, state: { ...task.state, ...patch } }; return { task }; },
    };
    const sessionService = {
      create: async request => { created.push(request); return { session: session(workspace) }; },
      control: async (sessionId, operation) => { callOrder.push('goal'); controls.push({ sessionId, operation }); return { type: 'goal', mode: { kind: 'goal', status: 'active', objective: operation.objective, tokenBudget: operation.tokenBudget, tokensUsed: 0 } }; },
      send: async (sessionId, request) => { callOrder.push('send'); sent.push(request); return { run: { sessionId, runId: 'run', status: 'running', createdAt: 1 } }; },
    };
    const runtime = createScheduledTasksRuntime({ projectConfigRuntime, listProjects: async () => [{ id: 'host-project', path: '/repo' }],
      listWorkspaceScopes: async () => ({ items: [{ workspaceId: workspace.workspaceId }], errors: {} }),
      resolveWorkspaceScope: async () => workspace, sessionService, messageQueueRuntime, logger: { warn() {}, info() {} }, ...extra });
    return { runtime, sessionService, created, sent, controls, callOrder, stored: () => task };
  };

  it('uses opaque scopes and captures pinned selection without treating acknowledgement as transcript completion', async () => {
    const h = setup();
    await h.runtime.syncProject('host-project');
    const result = await h.runtime.runNow('host-project', 'task');
    expect(result).toMatchObject({ ok: true, sessionID: 'session' });
    expect(h.created[0]).toMatchObject({ projectId: 'opaque-project', workspaceId: 'opaque-workspace',
      options: { providerId: 'provider', modelId: 'model', agentId: null, variant: 'high', reasoningEffort: null } });
    expect(h.sent[0].input.context[0]).toMatchObject({ kind: 'context', metadata: { scheduledTask: { projectId: 'host-project', taskId: 'task', mode: 'new' } } });
    expect(h.stored().state.lastStatus).toBe('success');
    h.runtime.stop();
  });
  it('creates an OMP goal before the prompt and applies the default budget', async () => {
    const h = setup({ goalEnabled: true }, { readDefaultGoalTokenBudget: async () => 12000 });
    await h.runtime.syncProject('host-project');
    expect(await h.runtime.runNow('host-project', 'task')).toMatchObject({ ok: true });
    expect(h.controls).toEqual([{ sessionId: 'session', operation: { type: 'goal', op: 'create', objective: 'Do the work', tokenBudget: 12000 } }]);
    expect(h.callOrder).toEqual(['goal']);
    expect(h.sent).toEqual([]);
    h.runtime.stop();
  });

  it('expands native input before creation and sends its captured bindings without changing task text', async () => {
    const raw = '/deploy "release one"  trailing  ';
    const service = { request: vi.fn(async () => Response.json({ kind: 'template', content: '# Expanded\n\n  Markdown\n',
      modelSelection: { providerId: 'bound-provider', modelId: 'bound-model' }, agentId: 'bound-agent' })) };
    const h = setup({ prompt: raw }, { service });
    await h.runtime.syncProject('host-project');
    try {
      expect(await h.runtime.runNow('host-project', 'task')).toMatchObject({ ok: true });
      expect(service.request).toHaveBeenCalledTimes(1);
      expect(service.request.mock.calls[0][0]).toBe('/api/agent/v1/workspaces/opaque-workspace/commands/expand-text');
      expect(JSON.parse(service.request.mock.calls[0][1].body)).toEqual({ text: raw });
      const captured = { providerId: 'bound-provider', modelId: 'bound-model', agentId: null, variant: 'high', reasoningEffort: null };
      expect(h.created[0].options).toEqual(captured);
      expect(h.sent[0].options).toEqual(captured);
      expect(h.sent[0].input.text).toBe('# Expanded\n\n  Markdown\n');
      expect(h.sent[0].input.context[0].metadata.scheduledTask.mode).toBe('new');
      expect(h.stored().execution.prompt).toBe(raw);
    } finally { h.runtime.stop(); }
  });

  it('does not create or send a session when native expansion fails', async () => {
    const h = setup({ prompt: '/deploy args' }, { service: { request: vi.fn(async () => { throw new Error('Worker expansion unavailable'); }) } });
    await h.runtime.syncProject('host-project');
    try {
      expect(await h.runtime.runNow('host-project', 'task')).toMatchObject({ ok: false, error: 'Worker expansion unavailable' });
      expect(h.created).toEqual([]);
      expect(h.sent).toEqual([]);
      expect(h.stored().execution.prompt).toBe('/deploy args');
    } finally { h.runtime.stop(); }
  });

  it('reports unavailable defaults instead of switching to invented model defaults', async () => {
    const h = setup({ useDefaults: true }, { readSessionDefaults: async () => { throw new Error('Settings read failed'); } });
    await h.runtime.syncProject('host-project');
    expect(await h.runtime.runNow('host-project', 'task')).toMatchObject({ ok: false, error: 'Settings read failed' });
    expect(h.created).toEqual([]);
    expect(h.sent).toEqual([]);
  });

  it('rejects foreign or ambiguous workspaces before session creation', async () => {
    const h = setup({}, { resolveWorkspaceScope: async () => ({ ...workspace, hostProjectId: 'foreign' }) });
    await h.runtime.syncProject('host-project');
    expect(await h.runtime.runNow('host-project', 'task')).toMatchObject({ ok: false });
    expect(h.created).toEqual([]);
  });

  it('keeps the created session identity when provider dispatch fails', async () => {
    const h = setup();
    h.sessionService.send = async () => { throw new Error('Provider unavailable'); };
    await h.runtime.syncProject('host-project');
    expect(await h.runtime.runNow('host-project', 'task')).toMatchObject({ ok: false, status: 'error' });
    expect(h.stored().state).toMatchObject({ lastSessionId: 'session', lastStatus: 'error' });
  });

  it('uses each real managed-chat workspace and cleans only an empty failed creation directory', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'scheduled-chats-'));
    const chatsScope = createChatsScope(path.join(temp, 'chats'));
    const scopes = [];
    const h = setup({}, { chatsScope, createChatWorkspace: async () => {
      const scope = { ...workspace, hostProjectId: chatsScope.id, cwd: await chatsScope.createChatDirectory(), workspaceId: `chat-${scopes.length}` };
      scopes.push(scope); return scope;
    } });
    h.sessionService.create = async (request) => ({ session: session(scopes.find((scope) => scope.workspaceId === request.workspaceId)) });
    try {
      await h.runtime.syncProject(chatsScope.id);
      const first = await h.runtime.runNow(chatsScope.id, 'task');
      const second = await h.runtime.runNow(chatsScope.id, 'task');
      expect(first.ok).toBe(true);
      expect(second.directory).not.toBe(first.directory);
      await expect(stat(first.directory)).resolves.toBeTruthy();
      h.sessionService.create = async () => { throw new Error('Service unavailable'); };
      expect(await h.runtime.runNow(chatsScope.id, 'task')).toMatchObject({ ok: false });
      await expect(stat(scopes.at(-1).cwd)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(stat(first.directory)).resolves.toBeTruthy();
    } finally { h.runtime.stop(); await rm(temp, { recursive: true, force: true }); }
  });

  it('cleans an empty managed-chat directory when native expansion fails before creation', async () => {
    const temp = await mkdtemp(path.join(os.tmpdir(), 'scheduled-chat-expansion-'));
    const chatsScope = createChatsScope(path.join(temp, 'chats'));
    let admitted;
    const h = setup({ prompt: '/deploy args' }, {
      chatsScope,
      service: { request: vi.fn(async () => { throw new Error('Native expansion unavailable'); }) },
      resolveWorkspaceScope: async () => admitted,
      createChatWorkspace: async () => {
        admitted = { ...workspace, hostProjectId: chatsScope.id, workspaceId: 'new-chat', cwd: await chatsScope.createChatDirectory() };
        return admitted;
      },
    });
    try {
      await h.runtime.syncProject(chatsScope.id);
      expect(await h.runtime.runNow(chatsScope.id, 'task')).toMatchObject({ ok: false, error: 'Native expansion unavailable' });
      expect(h.created).toEqual([]);
      expect(h.sent).toEqual([]);
      await expect(stat(admitted.cwd)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { h.runtime.stop(); await rm(temp, { recursive: true, force: true }); }
  });
});
describe('managed chat directory authority', () => {
  it('rejects a date-directory alias before creating any child outside the managed root', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'scheduled-chat-boundary-'));
    const chats = path.join(root, 'chats');
    const outside = path.join(root, 'outside');
    await mkdir(chats);
    await mkdir(outside);
    const scope = createChatsScope(chats);
    try {
      await symlink(outside, path.join(chats, '2026-10-14'), process.platform === 'win32' ? 'junction' : 'dir');
      await expect(scope.createChatDirectory(new Date(2026, 9, 14))).rejects.toThrow('not authorized');
      expect(await readdir(outside)).toEqual([]);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
