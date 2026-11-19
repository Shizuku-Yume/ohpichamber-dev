import { describe, expect, it, vi } from 'vitest';
import { PromptRequestSchema } from '@openchamber/agent-contract';
import { createExistingSessionTasks, createScheduledTaskContext } from './existing-session.js';
import { createScheduledTaskService } from './service.js';
import { createScheduledPromptExpander } from './file-resource-prompt.js';

const task = { id: 'task', name: 'Follow up', enabled: true, targetSessionId: 'target', schedule: { kind: 'daily', time: '09:00' },
  execution: { prompt: 'Continue', useDefaults: true }, state: {} };
const scope = { sessionId: 'target', rootSessionId: 'target', projectId: 'opaque-project', workspaceId: 'opaque-workspace', hostProjectId: 'host-project', cwd: '/worktree' };
const snapshot = (sessionId = 'target') => ({ session: { sessionId, rootSessionId: sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId, displayPath: '.',
  createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' } }, cursor: 'epoch:0', activeRun: null,
  branch: { branchId: 'branch', branchVersion: '1', leafMessageId: null }, window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
  turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' } });
const setup = (extra = {}) => {
  let stored = structuredClone(task);
  const projectConfigRuntime = {
    listScheduledTasks: async () => stored ? [stored] : [],
    updateScheduledTaskState: async (_project, _task, patch) => { if (stored) stored.state = { ...stored.state, ...patch }; return { task: stored }; },
    updateScheduledTaskStateIf: async (_project, _task, predicate, patch) => { if (!predicate(stored)) return { task: stored, updated: false }; stored.state = { ...stored.state, ...patch }; return { task: stored, updated: true }; },
  };
  const appended = [];
  const messageQueueRuntime = {
    hasScheduledTask: vi.fn(async () => false), getState: async () => ({ revision: '3', items: [] }),
    append: vi.fn(async (owner, commandId, request) => { appended.push({ owner, commandId, request }); }),
    cancelScheduledTask: vi.fn(async () => {}),
  };
  const dependencies = { projectConfigRuntime, messageQueueRuntime, sessionService: { open: async () => snapshot() },
    resolveSessionScope: async () => scope, resolveWorkspaceScope: async () => scope,
    service: { request: vi.fn(async () => Response.json({ kind: 'template', content: 'Expanded native prompt' })) },
    isSessionArchived: async () => false, ...extra };
  const expandPrompt = createScheduledPromptExpander(dependencies);
  return { runtime: createExistingSessionTasks({ ...dependencies, expandPrompt }), dependencies, messageQueueRuntime, appended, stored: () => stored,
    replace: (value) => { stored = value; } };
};

describe('canonical existing-session scheduling', () => {
  it('captures durable scheduled identity and nullable options that retain the target selection', async () => {
    const h = setup();
    expect(await h.runtime.run('host-project', task, 'manual')).toMatchObject({ ok: true, sessionID: 'target', directory: '/worktree' });
    const capture = h.appended[0];
    expect(capture.owner).toEqual(scope);
    expect(capture.request.expectedRevision).toBe('3');
    expect(PromptRequestSchema.parse(capture.request.request).options).toEqual({ providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null });
    expect(capture.request.request.input.context[0]).toMatchObject({ metadata: { scheduledTask: { projectId: 'host-project', taskId: 'task', sessionId: 'target', workspaceId: 'opaque-workspace', mode: 'existing' } } });
    expect(h.stored().state).toMatchObject({ lastStatus: 'queued', lastSessionId: 'target' });
    await h.runtime.result(capture.request.request.input.context[0].metadata.scheduledTask, 'sent');
    expect(h.stored().state.lastStatus).toBe('sent');
  });

  it('captures pinned model, agent and variant at admission', async () => {
    const h = setup();
    await h.runtime.run('host-project', { ...task, execution: { prompt: 'Pinned', providerID: 'provider', modelID: 'model', agent: 'agent', variant: 'high' } }, 'manual');
    expect(h.appended[0].request.request.options).toEqual({ providerId: 'provider', modelId: 'model', agentId: null, variant: 'high', reasoningEffort: null });
  });

  it('captures worker expansion once before queue persistence while keeping raw task display', async () => {
    const h = setup({ service: { request: vi.fn(async () => Response.json({ kind: 'command', content: '# Native\n\n  raw body\n',
      modelSelection: { providerId: 'bound-provider', modelId: 'bound-model' }, agentId: 'bound-agent' })) } });
    const prompt = '/deploy "quoted release"  trailing  ';
    const scheduled = { ...task, execution: { prompt, providerID: 'pinned-provider', modelID: 'pinned-model', agent: 'pinned-agent', variant: 'high' } };
    expect(await h.runtime.run('host-project', scheduled, 'manual')).toMatchObject({ ok: true });
    expect(h.dependencies.service.request).toHaveBeenCalledTimes(1);
    expect(h.dependencies.service.request.mock.calls[0][0]).toBe('/api/agent/v1/workspaces/opaque-workspace/commands/expand-text');
    expect(JSON.parse(h.dependencies.service.request.mock.calls[0][1].body)).toEqual({ text: prompt });
    const queued = h.appended[0].request;
    expect(queued.content).toBe(prompt);
    expect(queued.request.input.text).toBe('# Native\n\n  raw body\n');
    expect(queued.request.options).toEqual({ providerId: 'bound-provider', modelId: 'bound-model', agentId: null, variant: 'high', reasoningEffort: null });
    await h.runtime.beforeSend(scope, { request: queued.request });
    expect(h.dependencies.service.request).toHaveBeenCalledTimes(1);
    expect(scheduled.execution.prompt).toBe(prompt);
  });

  it('fails admission when worker expansion fails without queueing unexpanded text', async () => {
    const h = setup({ service: { request: vi.fn(async () => { throw new Error('Worker unavailable'); }) } });
    const scheduled = { ...task, execution: { ...task.execution, prompt: '/deploy args' } };
    expect(await h.runtime.run('host-project', scheduled, 'manual')).toMatchObject({ ok: false, error: 'Worker unavailable' });
    expect(h.appended).toEqual([]);
    expect(h.stored().state.lastStatus).toBe('failed');
  });

  it('keeps target goal and permission policies untouched', async () => {
    const h = setup();
    await h.runtime.run('host-project', { ...task, execution: { ...task.execution, goalEnabled: true, permissionAutoAccept: true } }, 'manual');
    expect(h.appended[0].request.request.input.context).toHaveLength(1);
    expect(h.appended[0].request.request.input.context[0].text).toBe('');
  });

  it('reports durable duplicates as queued busy and preserves the waiting prompt', async () => {
    const h = setup();
    h.messageQueueRuntime.hasScheduledTask.mockResolvedValue(true);
    expect(await h.runtime.run('host-project', task, 'manual')).toMatchObject({ ok: false, queued: true, statusCode: 409 });
    expect(h.stored().state.lastStatus).toBe('skipped');
    expect(h.appended).toEqual([]);
    expect(h.messageQueueRuntime.cancelScheduledTask).not.toHaveBeenCalled();
  });

  it.each(['archived', 'foreign', 'missing', 'service'])('refuses %s targets without queue admission', async (kind) => {
    const h = setup({
      isSessionArchived: async () => kind === 'archived',
      resolveSessionScope: async () => kind === 'missing' ? null : { ...scope, hostProjectId: kind === 'foreign' ? 'other' : 'host-project' },
      sessionService: { open: async () => { if (kind === 'service') throw new Error('Service unavailable'); return snapshot(); } },
    });
    const result = await h.runtime.run('host-project', task, 'manual');
    expect(result.ok).toBe(false);
    expect(h.appended).toEqual([]);
    expect(h.stored().state.lastStatus).toBe('failed');
  });

  it.each(['removed', 'retargeted', 'moved'])('revalidates a %s target before dispatch', async (change) => {
    const h = setup({ resolveSessionScope: async () => change === 'moved' ? { ...scope, cwd: '/moved', workspaceId: 'moved-workspace' } : scope });
    if (change === 'removed') h.replace(null);
    if (change === 'retargeted') h.replace({ ...task, targetSessionId: 'different' });
    const capture = { request: { input: { context: [createScheduledTaskContext({ projectId: 'host-project', taskId: 'task', mode: 'existing', sessionId: 'target', workspaceId: scope.workspaceId })] } } };
    await expect(h.runtime.beforeSend(scope, capture)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('claims a scheduled occurrence before admission and skips a second claim', async () => {
    const h = setup();
    expect(await h.runtime.run('host-project', task, 'scheduled', 1000, 2000)).toMatchObject({ ok: true });
    expect(await h.runtime.run('host-project', h.stored(), 'scheduled', 1000, 2000)).toMatchObject({ ok: false, skipped: true });
    expect(h.appended).toHaveLength(1);
  });

  it('returns a queue persistence failure as failed rather than successful empty admission', async () => {
    const h = setup();
    h.messageQueueRuntime.append.mockRejectedValue(new Error('Queue storage failed'));
    expect(await h.runtime.run('host-project', task, 'manual')).toMatchObject({ ok: false, error: 'Queue storage failed' });
    expect(h.stored().state.lastStatus).toBe('failed');
  });

  it('lets a paused unchanged stale target remain editable but cancels on retarget', async () => {
    let current = { ...task, enabled: false };
    const cancelWaitingPrompt = vi.fn();
    const validateTarget = vi.fn();
    const config = { listScheduledTasks: async () => [current], upsertScheduledTask: async (_id, value) => { current = value; return { task: current, created: false }; } };
    const service = createScheduledTaskService({ readSettingsFromDiskMigrated: async () => ({ projects: [{ id: 'host-project', path: '/repo' }] }), sanitizeProjects: (value) => value,
      projectConfigRuntime: config, scheduledTasksRuntime: { validateTarget, cancelWaitingPrompt, syncProject: async () => [current] } });
    await service.upsert('host-project', { ...current, name: 'Edited' });
    expect(validateTarget).not.toHaveBeenCalled();
    expect(cancelWaitingPrompt).not.toHaveBeenCalled();
    await service.upsert('host-project', { ...current, targetSessionId: 'new' });
    expect(validateTarget).toHaveBeenCalledWith('host-project', 'new');
    expect(cancelWaitingPrompt).toHaveBeenCalledWith('host-project', 'task');
  });
});

describe('eligible target discovery', () => {
  it('accepts only candidates whose session scope is this project and that directory', async () => {
    const scopes = {
      ses_root: { rootSessionId: 'ses_root', sessionId: 'ses_root', projectId: 'opaque-project', workspaceId: 'opaque-workspace', hostProjectId: 'host-project', cwd: '/repo' },
      ses_wt: { rootSessionId: 'ses_wt', sessionId: 'ses_wt', projectId: 'opaque-project', workspaceId: 'opaque-worktree', hostProjectId: 'host-project', cwd: '/repo/worktrees/feature' },
      ses_foreign: { rootSessionId: 'ses_foreign', sessionId: 'ses_foreign', projectId: 'other-project', workspaceId: 'other-workspace', hostProjectId: 'other-host', cwd: '/other' },
    };
    const { runtime } = setup({ resolveSessionScope: async (sessionId) => scopes[sessionId] ?? null,
      isSessionArchived: async (sessionId) => sessionId === 'ses_archived' });
    const eligible = await runtime.listEligibleTargets('host-project', [
      { sessionId: 'ses_root', directory: '/repo' },
      { sessionId: 'ses_wt', directory: '/repo/worktrees/feature' },
      { sessionId: 'ses_foreign', directory: '/other' },
      { sessionId: 'ses_archived', directory: '/repo' },
      { sessionId: 'ses_root', directory: '/repo/elsewhere' },
      { sessionId: 'ses_nodir', directory: '' },
    ]);
    expect(eligible).toEqual([
      { sessionId: 'ses_root', directory: '/repo' },
      { sessionId: 'ses_wt', directory: '/repo/worktrees/feature' },
    ]);
  });
});
