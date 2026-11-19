import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { SessionJournal } from '../../../../agent-service/src/projection/journal.ts';
import { createOpenChamberControlService } from './service.js';
<<<<<<< HEAD
import { createPrWatchRuntime, parsePullRequestUrl } from '../pr-watch/runtime.js';
import { trackedItemKey } from '../tracked-items/items.js';
||||||| bc50ba56aa
import { OpenChamberControlError } from './error.js';
import { createScheduledTaskService } from '../scheduled-tasks/service.js';
import { createChatsScope } from '../scheduled-tasks/chats-scope.js';
import { createExistingSessionTasks } from '../scheduled-tasks/existing-session.js';
import { createProjectConfigRuntime } from '../projects/project-config.js';
=======
import { OpenChamberControlError } from './error.js';
import { createScheduledTaskService } from '../scheduled-tasks/service.js';
import { createChatsScope } from '../scheduled-tasks/chats-scope.js';
import { createExistingSessionTasks } from '../scheduled-tasks/existing-session.js';
import { createProjectConfigRuntime } from '../projects/project-config.js';
import { createPrWatchRuntime } from '../pr-watch/runtime.js';
import { createLaterPages } from './later-pages.js';
>>>>>>> upstream/main

const scopeForWorkspace = {
  projectId: 'project-1',
  hostProjectId: 'host-project-1',
  workspaceId: 'workspace-1',
  cwd: '/repo/app',
  agentDirectory: '/repo/.omp/agents',
  agentDirectoryId: 'agent-directory-1',
};
const otherScope = { ...scopeForWorkspace, workspaceId: 'workspace-2', cwd: '/repo/other' };

const createHarness = (settings = {
  agentControlToolEnabled: true,
  agentWebToolEnabled: true,
  agentNotifyToolEnabled: true,
  agentRenderToolEnabled: true,
  agentWorkflowToolEnabled: true,
}, overrides = {}) => {
  const created = [];
  const sent = [];
  const forked = [];
  const goalControls = [];
  const callOrder = [];
  const requests = [];
  const sessionScopes = new Map([
    ['session-1', { rootSessionId: 'session-1', ...scopeForWorkspace }],
  ]);
  const sessionService = {
    create: async (payload) => {
      created.push(payload);
      return { session: { sessionId: 'session-new', projectId: payload.projectId, workspaceId: payload.workspaceId } };
    },
    send: async (sessionId, payload) => {
      callOrder.push('send');
      sent.push({ sessionId, payload });
      return { run: { runId: `run-${sent.length}`, sessionId } };
    },
    control: async (sessionId, operation) => { callOrder.push('goal'); goalControls.push({ sessionId, operation }); return { type: 'goal', mode: { kind: 'goal', status: 'active', objective: operation.objective, tokenBudget: operation.tokenBudget, tokensUsed: 0 } }; },
    fork: async (sessionId, payload) => {
      forked.push({ sessionId, payload });
      return { session: { sessionId: 'session-forked', projectId: 'project-1', workspaceId: 'workspace-1' } };
    },
    open: async (sessionId) => ({ session: { sessionId, runtimeStatus: 'idle' } }),
    history: async () => ({ turns: [], messages: [] }),
    list: async () => ({ items: [], errors: {} }),
  };
  const service = {
    request: async (pathname) => {
      requests.push(pathname);
      if (pathname.endsWith('/models')) return Response.json({ workspaceId: 'workspace-1', revision: '1', models: [{ modelId: 'model-1' }] });
      if (pathname.endsWith('/providers')) return Response.json({ workspaceId: 'workspace-1', revision: '1', providers: [{ providerId: 'provider-1' }] });
      if (pathname.includes('/images/generate')) return Response.json({
        model: { providerId: 'openrouter', modelId: 'openai/gpt-image-2' },
        images: [{ data: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').toString('base64'), mimeType: 'image/png' }],
      });
      return Response.json({});
    },
  };
  const control = createOpenChamberControlService({
    readSettingsFromDiskMigrated: async () => settings,
    service,
    sessionService,
    resolveSessionScope: async (sessionId) => sessionScopes.get(sessionId) ?? null,
    resolveWorkspaceScope: async (workspaceId) => workspaceId === 'workspace-1' ? scopeForWorkspace : workspaceId === 'workspace-2' ? otherScope : null,
    listWorkspaceScopes: async () => ({ items: [{ workspaceId: 'workspace-1' }, { workspaceId: 'workspace-2' }], errors: {} }),
    listProjects: async () => ({ items: [{ projectId: 'project-1', name: 'App', workspaceIds: ['workspace-1'] }], errors: {} }),
    scheduledTaskService: {
      status: async () => ({ enabledScheduledTasksCount: 0 }),
      resolveProjectID: async ({ projectId }) => projectId,
      list: async () => [],
      upsert: async () => ({ task: {}, created: true }),
      run: async () => ({}),
      remove: async () => [],
      setEnabled: async () => ({ enabled: true }),
    },
    ...overrides,
  });
  return { control, created, sent, forked, goalControls, callOrder, requests };
};

<<<<<<< HEAD
describe('OpenChamber control service canonical consumers', () => {
  it('reads complete and most-recent messages through the canonical paginated journal across workspaces', async () => {
    const sessionId = 'session-other';
    const turns = Array.from({ length: 205 }, (_, index) => ({
      turnId: `turn-${index}`, runId: `run-${index}`, sessionId, status: 'completed',
      userMessageId: `message-${index}`, assistantMessageIds: [], startedAt: index + 1, finishedAt: index + 1,
||||||| bc50ba56aa
describe('OpenChamber control service', () => {
  it('creates a target task with inherited selection and accepts retargeting on update', async () => {
    const { service, scheduledTaskService } = createService();
    scheduledTaskService.upsert.mockImplementation(async (_project, task) => ({ task }));
    const created = await service.execute('schedule.create', { name: 'Reuse', prompt: 'Continue', daily: '09:00', targetSessionId: 'ses_target' }, '/repo');
    expect(created.task).toMatchObject({ targetSessionId: 'ses_target', execution: { useDefaults: true } });
    scheduledTaskService.list.mockResolvedValue([{ ...created.task, id: 'task-1' }]);
    await service.execute('schedule.update', { taskId: 'task-1', targetSessionId: 'ses_second', agent: 'plan' }, '/repo');
    expect(scheduledTaskService.upsert.mock.calls[1][1]).toMatchObject({ targetSessionId: 'ses_second', execution: { agent: 'plan' } });
    expect(scheduledTaskService.upsert.mock.calls[1][1].execution.useDefaults).toBeUndefined();
  });
  it('serves project and model projections without an HTTP or CLI round trip', async () => {
    const { service } = createService();
    await expect(service.execute('projects.list')).resolves.toEqual({
      projects: [{ id: 'project-1', path: '/repo', label: 'Repo' }],
    });
    await expect(service.execute('models.list')).resolves.toEqual(expect.objectContaining({
      defaultModel: 'provider/model',
      favoriteModels: [],
=======
describe('OpenChamber control service', () => {
  it('omits empty answer messages and forwards nonempty messages unchanged', async () => {
    const { service, client } = createService();
    client.session.list.mockResolvedValue({ data: [{ id: 'ses_1', location: { directory: '/repo' } }] });
    const reply = vi.fn(async () => {});
    const cancel = vi.fn(async () => {});
    client.permission = { reply };
    client.session.form = { cancel };
    for (const message of [undefined, null, '', ' Keep this spacing ']) {
      await service.answerPermission({ sessionID: 'ses_1', requestID: 'per_1', decision: 'reject', message });
      await service.answerForm({ sessionID: 'ses_1', formID: 'frm_1', answer: null, message });
    }
    expect(reply.mock.calls).toEqual([
      [{ sessionID: 'ses_1', requestID: 'per_1', decision: 'reject' }],
      [{ sessionID: 'ses_1', requestID: 'per_1', decision: 'reject' }],
      [{ sessionID: 'ses_1', requestID: 'per_1', decision: 'reject' }],
      [{ sessionID: 'ses_1', requestID: 'per_1', decision: 'reject', message: ' Keep this spacing ' }],
    ]);
    expect(cancel.mock.calls).toEqual([
      [{ sessionID: 'ses_1', formID: 'frm_1' }],
      [{ sessionID: 'ses_1', formID: 'frm_1' }],
      [{ sessionID: 'ses_1', formID: 'frm_1' }],
      [{ sessionID: 'ses_1', formID: 'frm_1', message: ' Keep this spacing ' }],
    ]);
    expect(reply.mock.calls[0][0]).not.toHaveProperty('message');
    expect(cancel.mock.calls[0][0]).not.toHaveProperty('message');
  });

  it('creates a target task with inherited selection and accepts retargeting on update', async () => {
    const { service, scheduledTaskService } = createService();
    scheduledTaskService.upsert.mockImplementation(async (_project, task) => ({ task }));
    const created = await service.execute('schedule.create', { name: 'Reuse', prompt: 'Continue', daily: '09:00', targetSessionId: 'ses_target' }, '/repo');
    expect(created.task).toMatchObject({ targetSessionId: 'ses_target', execution: { useDefaults: true } });
    scheduledTaskService.list.mockResolvedValue([{ ...created.task, id: 'task-1' }]);
    await service.execute('schedule.update', { taskId: 'task-1', targetSessionId: 'ses_second', agent: 'plan' }, '/repo');
    expect(scheduledTaskService.upsert.mock.calls[1][1]).toMatchObject({ targetSessionId: 'ses_second', execution: { agent: 'plan' } });
    expect(scheduledTaskService.upsert.mock.calls[1][1].execution.useDefaults).toBeUndefined();
  });
  it('serves project and model projections without an HTTP or CLI round trip', async () => {
    const { service } = createService();
    await expect(service.execute('projects.list')).resolves.toEqual({
      projects: [{ id: 'project-1', path: '/repo', label: 'Repo' }],
    });
    await expect(service.execute('models.list')).resolves.toEqual(expect.objectContaining({
      defaultModel: 'provider/model',
      favoriteModels: [],
>>>>>>> upstream/main
    }));
    const messages = turns.map((turn, index) => ({
      messageId: turn.userMessageId, sessionId, turnId: turn.turnId, role: 'user', createdAt: index + 1,
      parts: [{ type: 'text', partId: `part-${index}`, content: `message ${index}` }],
    }));
    const journal = new SessionJournal({ sessionId, projectId: 'project-1', workspaceId: 'workspace-2', displayPath: '.', rootSessionId: sessionId }, {
      createdAt: 1, updatedAt: 205, branch: { branchId: 'branch-1', branchVersion: '1', leafMessageId: 'message-204' }, turns, messages,
    });
    const { control } = createHarness(undefined, {
      resolveSessionScope: async (id) => id === 'session-1' ? { rootSessionId: id, ...scopeForWorkspace } : id === sessionId ? { rootSessionId: id, ...otherScope } : null,
      sessionService: {
        open: async () => ({ session: { runtimeStatus: 'idle' } }),
        history: async (id, query) => {
          const params = new URLSearchParams(query);
          return journal.history({ sessionId: id, limit: Number(params.get('limit')), ...(params.has('cursor') ? { cursor: params.get('cursor') } : {}) });
        },
      },
    });
    const scope = { rootSessionId: 'session-1', ...scopeForWorkspace };
    const invoke = (input) => control.invokeHostAction(scope, { sessionId: 'session-1', toolName: 'openchamber', action: 'session.messages', input: { sessionId, ...input } });
    const all = await invoke({ all: true });
    expect(all.ok).toBe(true);
    expect(all.value.messages.map((message) => message.text)).toEqual(messages.map((message) => message.parts[0].content));
    const last = await invoke({ limit: 2 });
    expect(last.ok).toBe(true);
    expect(last.value.messages.map((message) => message.text)).toEqual(['message 203', 'message 204']);
    await expect(invoke({ workspaceId: 'workspace-1' })).resolves.toMatchObject({ ok: false, status: 403 });
  });

  it('creates a scoped session and dispatches a canonical prompt without private path fields', async () => {
    const { control, created, sent } = createHarness();

    const result = await control.execute('session.create', {
      title: 'Migration', model: 'provider-1/model-1', agent: 'build', prompt: '  Start work  ',
    }, '/repo/app');

    expect(created).toEqual([{
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      options: { providerId: 'provider-1', modelId: 'model-1', agentId: 'build', variant: null, reasoningEffort: null },
      title: 'Migration',
    }]);
    expect(sent).toEqual([{
      sessionId: 'session-new',
      payload: {
        input: { text: 'Start work', attachments: [], context: [] },
        options: { providerId: 'provider-1', modelId: 'model-1', agentId: 'build', variant: null, reasoningEffort: null },
      },
    }]);
    expect(result).toMatchObject({ sessionId: 'session-new', promptDispatched: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].sessionId).toBe('session-new');
  });
  it('creates native goals before CLI create, send and fork prompts', async () => {
    const h = createHarness({
      agentControlToolEnabled: true, agentWebToolEnabled: true,
      agentNotifyToolEnabled: true, sessionGoalDefaultBudgetEnabled: true, sessionGoalDefaultBudget: 5000
    });
    const created = await h.control.execute('session.create', {
      model: 'provider-1/model-1', prompt: 'Create objective', goal: true,
    }, '/repo/app');
    expect(created).toMatchObject({ goalEnabled: true, goalTokenBudget: 5000, promptDispatched: true });
    expect(h.goalControls[0]).toMatchObject({ sessionId: 'session-new', operation: { type: 'goal', op: 'create', objective: 'Create objective', tokenBudget: 5000, providerId: 'provider-1', modelId: 'model-1' } });
    expect(h.callOrder).toEqual(['goal']);
    expect(h.sent).toEqual([]);

    h.callOrder.length = 0;
    await h.control.execute('session.send', { sessionId: 'session-1', directory: '/repo/app', prompt: 'Send objective', goal: true, goalTokenBudget: 8000 });
    expect(h.goalControls[1].operation).toMatchObject({ objective: 'Send objective', tokenBudget: 8000 });
    expect(h.callOrder).toEqual(['goal']);
    expect(h.sent).toEqual([]);

    h.callOrder.length = 0;
    await h.control.execute('session.fork', { sessionId: 'session-1', directory: '/repo/app', prompt: 'Fork objective', goal: true });
    expect(h.goalControls[2].sessionId).toBe('session-forked');
    expect(h.goalControls[2].operation).toMatchObject({ objective: 'Fork objective', tokenBudget: 5000 });
    expect(h.callOrder).toEqual(['goal']);
    expect(h.sent).toEqual([]);
  });

  it('sends and forks only after authoritative session-scope checks', async () => {
    const { control, sent, forked } = createHarness();

    await control.execute('session.send', { sessionId: 'session-1', directory: '/repo/app', prompt: 'Continue' });
    await control.execute('session.fork', { sessionId: 'session-1', directory: '/repo/app', messageId: 'message-7', prompt: 'Try again' });

    expect(sent).toHaveLength(2);
    expect(sent[0].payload.input.text).toBe('Continue');
    expect(sent[1].sessionId).toBe('session-forked');
    expect(forked).toEqual([{ sessionId: 'session-1', payload: { messageId: 'message-7' } }]);
    expect(JSON.stringify(sent)).not.toContain('/repo/app');
  });

  it('rejects conflicting or invalid session selectors before native execution', async () => {
    const { control, created, sent } = createHarness();

    await expect(control.execute('session.create', { projectId: 'project-1', directory: '/repo/app' }, '/repo/app'))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(control.execute('session.create', { model: 'not-a-model' }, '/repo/app'))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(control.execute('session.send', { sessionId: 'session-1', directory: '/other', prompt: 'Unknown' }, '/repo/app'))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(control.execute('session.send', { sessionId: 'session-1', workspaceId: 'workspace-2', prompt: 'Cross-scope' }, '/repo/app'))
      .rejects.toMatchObject({ statusCode: 403 });

    expect(created).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });

  it('serves render.page through the render feature policy and carries the call id to a waiting page', async () => {
    const waits = [];
    const { control } = createHarness(undefined, {
      onPageWaitChange: (change) => waits.push(change),
    });
    const scope = { rootSessionId: 'session-1', ...scopeForWorkspace };
    const call = { action: 'render.page', html: '<h1>Fixture</h1>', title: 'Fixture' };
    const result = await control.invokeHostAction(scope, {
      toolName: 'openchamber_render', action: 'render.page', sessionId: 'session-1', input: call,
    });
    expect(result).toMatchObject({ ok: true, value: { shown: true, title: 'Fixture' } });
    // A page that waits publishes its call identity, which is what the answer
    // route resolves against.
    const waiting = new Promise((resolve) => {
      const previous = waits.length;
      const poll = () => (waits.length > previous && waits.at(-1).type === 'waiting'
        ? resolve(waits.at(-1))
        : setTimeout(poll, 5));
      poll();
    });
    const pending = control.invokeHostAction(scope, {
      toolName: 'openchamber_render', action: 'render.page', sessionId: 'session-1',
      input: { html: '<h1>Ask</h1>', title: 'Ask', awaitAnswer: true }, toolCallId: 'call-ask',
    });
    const announced = await waiting;
    expect(announced).toMatchObject({ type: 'waiting', sessionId: 'session-1', callId: 'call-ask', title: 'Ask' });
    expect(control.answerPage({ sessionId: 'session-1', callId: 'call-ask', summary: 'chose one', data: { n: 1 } }))
      .toEqual({ answered: true });
    await expect(pending).resolves.toMatchObject({
      ok: true,
      value: { title: 'Ask', answer: { answered: true, summary: 'chose one' } },
    });
  });
  it('returns canonical project and workspace-scoped model projections', async () => {
    const { control, requests } = createHarness();

    await expect(control.execute('projects.list')).resolves.toEqual({
      items: [{ projectId: 'project-1', name: 'App', workspaceIds: ['workspace-1'] }], errors: {},
    });
    await expect(control.execute('models.list', {}, undefined, { contextSessionId: 'session-1' })).resolves.toEqual({
      workspaceId: 'workspace-1',
      models: [{ modelId: 'model-1' }],
      providers: [{ providerId: 'provider-1' }],
    });
    expect(requests).toEqual([
      '/api/agent/v1/workspaces/workspace-1/models',
      '/api/agent/v1/workspaces/workspace-1/providers',
    ]);
  });

  it('enforces Host action scope and feature availability instead of forwarding untrusted requests', async () => {
    const { control } = createHarness();

    await expect(control.invokeHostAction({ cwd: '/repo/app' }, {})).resolves.toEqual({ ok: false, code: 'INVALID_REQUEST', status: 400, detail: 'Invalid session scope' });
    await expect(control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber', action: 'session.status', sessionId: 'other-session', input: {},
    })).resolves.toEqual({ ok: false, code: 'INVALID_REQUEST', status: 400, detail: 'Invalid host action request' });
    await expect(control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'web', action: 'browser.open', sessionId: 'session-1', input: { url: 'https://example.com' },
    })).resolves.toMatchObject({ ok: false, code: 'SERVICE_UNAVAILABLE', status: 503, detail: 'The in-app browser is not available on this server' });
    await expect(control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber', action: 'unsupported.action', sessionId: 'session-1', input: {},
    })).resolves.toMatchObject({ ok: false, code: 'INVALID_REQUEST', status: 400 });
    const workflowHarness = createHarness(undefined, {
      workflowRuntime: {
        executeAction: async (action, input) => ({ runId: 'run-1', status: 'started', script: input.script }),
      },
    }).control;
    const workflowResult = await workflowHarness.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber_workflow', action: 'workflow.run', sessionId: 'session-1', input: { script: 'workflow.js' },
    });
    expect(workflowResult).toEqual({ ok: true, value: { runId: 'run-1', status: 'started', script: 'workflow.js' } });
    await expect(control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber_workflow', action: 'unsupported.action', sessionId: 'session-1', input: {},
    })).resolves.toEqual({ ok: false, code: 'INVALID_REQUEST', status: 400, detail: 'Unsupported openchamber_workflow action: unsupported.action' });
    const conflictHarness = createHarness(undefined, {
      resolveProjectContextId: async () => 'project-1',
      projectContextRuntime: {
        updateNote: async () => { throw Object.assign(new Error('Project note changed; reload before saving'), { status: 409 }); },
        readContext: async () => ({ notes: [{ id: 'n1', body: 'stale' }], todos: [], plans: [] }),
        plansDirFor: () => '/repo/.plans',
      },
    }).control;
    await expect(conflictHarness.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber_knowledge', action: 'knowledge.save', sessionId: 'session-1',
      input: { kind: 'note', id: 'n1', body: 'new', expected: 'stale' },
    })).resolves.toEqual({ ok: false, code: 'METADATA_CONFLICT', status: 409, detail: 'Project note changed; reload before saving' });
  });
});

describe('models.search over the canonical catalog', () => {
  const harness = () => createHarness({
    agentControlToolEnabled: true,
    favoriteModels: [{ providerId: 'b', modelId: 'old' }],
    hiddenModels: [{ providerId: 'a', modelId: 'secret' }],
  }, {
    service: {
      request: async (pathname) => {
        if (pathname.endsWith('/models')) {
          return Response.json({
            workspaceId: 'workspace-1', revision: '1', models: [
              { provider: 'a', modelId: 'new', name: 'Alpha New', variants: [{ variant: 'high' }], status: 'active' },
              { provider: 'a', modelId: 'older', name: 'Alpha Older', variants: [], status: 'active' },
              { provider: 'a', modelId: 'secret', name: 'Alpha Secret', variants: [], status: 'deprecated' },
              { provider: 'b', modelId: 'old', name: 'Beta Old', variants: [], status: 'deprecated' },
              { provider: 'b', modelId: 'newer', name: 'Beta Newer', variants: [], status: 'beta' },
            ]
          });
        }
        if (pathname.endsWith('/providers')) {
          return Response.json({
            workspaceId: 'workspace-1', revision: '1', providers: [
              { providerId: 'a', name: 'Alpha' }, { providerId: 'b', name: 'Beta' },
            ]
          });
        }
        return Response.json({});
      },
    },
  });

  it('leads with the favorite, hides what the picker hides, and pages', async () => {
    const { control } = harness();
    const first = await control.execute('models.search', {}, '/repo/app');
    expect(first.models.map(({ id }) => id)).toEqual(['b/old', 'a/new', 'a/older', 'b/newer']);
    expect(first.models[0]).toMatchObject({ preference: 'favorite', provider: 'Beta', variants: [] });
    expect(first.models[1].preference).toBeUndefined();
    expect(first.total).toBe(4);

    const alpha = await control.execute('models.search', { provider: 'alpha' }, '/repo/app');
    expect(alpha.models.map(({ id }) => id)).toEqual(['a/new', 'a/older']);

    const paged = await control.execute('models.search', { query: 'NEW', limit: 1 }, '/repo/app');
    expect(paged).toMatchObject({ models: [{ id: 'a/new' }], total: 2, next: 1 });
  });
});

<<<<<<< HEAD
describe('browser.close over the browser control bridge', () => {
  it('forwards the close and its tab to the browser control', async () => {
    const request = vi.fn(async () => ({ closed: true }));
    const { control } = createHarness(undefined, { browserControl: { request } });
    await expect(control.execute('browser.close', { tabId: 'tab-1' }, '/repo/app')).resolves.toEqual({ closed: true });
    expect(request).toHaveBeenCalledWith('browser.close', { tabId: 'tab-1' }, expect.objectContaining({ timeoutMs: 20_000 }));
||||||| bc50ba56aa
  it('maps schedule creation into the shared scheduled-task service', async () => {
    const { service, scheduledTaskService } = createService();
    scheduledTaskService.upsert.mockResolvedValue({ task: { id: 'task-1' }, created: true });
    await expect(service.execute('schedule.create', {
      directory: '/repo',
      name: 'Daily',
      prompt: 'Run checks',
      model: 'provider/model',
      daily: ' 09:00 ',
      goal: true,
      goalTokenBudget: 5000,
    })).resolves.toEqual({ task: { id: 'task-1' }, created: true });
    expect(scheduledTaskService.resolveProjectID).toHaveBeenCalledWith({ projectId: undefined, directory: '/repo' });
    expect(scheduledTaskService.upsert).toHaveBeenCalledWith('project-1', expect.objectContaining({
      name: 'Daily',
      schedule: { kind: 'daily', times: ['09:00'] },
      execution: expect.objectContaining({ providerID: 'provider', modelID: 'model', goalEnabled: true, goalTokenBudget: 5000 }),
    }));
=======
  it('keeps every model released with the newest of its family', async () => {
    const model = (id, released) => ({ providerID: 'z', id, name: id, family: 'glm', time: { released }, variants: [], cost: [], status: 'active' });
    const { service, client } = createService({
      readSettingsFromDiskMigrated: vi.fn(async () => ({ favoriteModels: [], recentModels: [], hiddenModels: [] })),
    });
    client.model = { list: vi.fn(async () => ({ data: [model('glm-5.3-highspeed', 2), model('glm-5.2', 1), model('glm-5.3', 2)] })) };
    client.provider = { list: vi.fn(async () => ({ data: [{ id: 'z', name: 'Zed' }] })) };

    const found = await service.execute('models.search', { query: 'glm' }, '/repo');
    expect(found.models.map(({ id }) => id).toSorted()).toEqual(['z/glm-5.3', 'z/glm-5.3-highspeed']);
    // An older version asked for by name still shows when nothing newer matches.
    const older = await service.execute('models.search', { query: 'glm-5.2' }, '/repo');
    expect(older.models.map(({ id }) => id)).toEqual(['z/glm-5.2']);
  });

  it('maps schedule creation into the shared scheduled-task service', async () => {
    const { service, scheduledTaskService } = createService();
    scheduledTaskService.upsert.mockResolvedValue({ task: { id: 'task-1' }, created: true });
    await expect(service.execute('schedule.create', {
      directory: '/repo',
      name: 'Daily',
      prompt: 'Run checks',
      model: 'provider/model',
      daily: ' 09:00 ',
      goal: true,
      goalTokenBudget: 5000,
    })).resolves.toEqual({ task: { id: 'task-1' }, created: true });
    expect(scheduledTaskService.resolveProjectID).toHaveBeenCalledWith({ projectId: undefined, directory: '/repo' });
    expect(scheduledTaskService.upsert).toHaveBeenCalledWith('project-1', expect.objectContaining({
      name: 'Daily',
      schedule: { kind: 'daily', times: ['09:00'] },
      execution: expect.objectContaining({ providerID: 'provider', modelID: 'model', goalEnabled: true, goalTokenBudget: 5000 }),
    }));
>>>>>>> upstream/main
  });
});

describe('pr.watch and pr.unwatch over prWatchRuntime', () => {
  it('throws 503 when prWatch is not configured', async () => {
    const { control } = createHarness();
    await expect(control.execute('pr.watch', { url: 'https://github.com/acme/repo/pull/1' }, '/repo/app', { contextSessionId: 'session-1' }))
      .rejects.toMatchObject({ statusCode: 503 });
    await expect(control.execute('pr.unwatch', {}, '/repo/app', { contextSessionId: 'session-1' }))
      .rejects.toMatchObject({ statusCode: 503 });
  });

  it('dispatches pr.watch with explicit and context session/directory', async () => {
    const watch = vi.fn(async () => ({ watching: { sessionID: 'session-1', number: 1, status: 'pending' }, next: 'message on change' }));
    const unwatch = vi.fn(async () => ({ watching: false, stopped: true }));
    const prWatch = { watch, unwatch };
    const { control } = createHarness(undefined, { prWatch });

    const result = await control.execute('pr.watch', { url: 'https://github.com/acme/repo/pull/1' }, '/repo/app', { contextSessionId: 'session-1' });
    expect(result).toMatchObject({ watching: { sessionID: 'session-1', number: 1 } });
    expect(watch).toHaveBeenCalledWith({ sessionID: 'session-1', directory: '/repo/app', url: 'https://github.com/acme/repo/pull/1' });

    const unwatchResult = await control.execute('pr.unwatch', {}, '/repo/app', { contextSessionId: 'session-1' });
    expect(unwatchResult).toEqual({ watching: false, stopped: true });
    expect(unwatch).toHaveBeenCalledWith('session-1');
  });

  it('dispatches pr.watch with explicit sessionId and resolves session directory', async () => {
    const watch = vi.fn(async () => ({ watching: { sessionID: 'session-1', number: 2 } }));
    const prWatch = { watch, unwatch: vi.fn() };
    const { control } = createHarness(undefined, { prWatch });

    await control.execute('pr.watch', { sessionId: 'session-1', url: 'https://github.com/acme/repo/pull/2' });
    expect(watch).toHaveBeenCalledWith({ sessionID: 'session-1', directory: '/repo/app', url: 'https://github.com/acme/repo/pull/2' });
  });

<<<<<<< HEAD
  it('creates watch via Host action and wakes session on PR update', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-watch-action-'));
||||||| bc50ba56aa
  it.each([
    ['session.send', 'send'],
    ['session.fork', 'fork'],
  ])('delegates %s directly to the session service', async (action, method) => {
    const { service, sessionService } = createService();
    sessionService[method].mockResolvedValue({ sessionId: 'ses_1', directory: '/repo' });

    await service.execute(action, { sessionId: 'ses_1', directory: '/repo', prompt: 'Continue' });

    expect(sessionService[method]).toHaveBeenCalledWith('ses_1', { directory: '/repo', prompt: 'Continue' });
  });

  it('resolves the target session directory from the global session list when send omits it', async () => {
    const { service, sessionService, client } = createService();
    client.session.list.mockResolvedValue({
      data: [
        { id: 'ses_other', location: { directory: '/repo/worktrees/other' } },
        { id: 'ses_target', location: { directory: '/repo/worktrees/target' } },
      ],
    });
    sessionService.send.mockResolvedValue({ sessionId: 'ses_target', directory: '/repo/worktrees/target', promptDispatched: true });

    await service.execute('session.send', { sessionId: 'ses_target', prompt: 'Continue' }, '/repo');

    expect(sessionService.send).toHaveBeenCalledWith('ses_target', { directory: '/repo/worktrees/target', prompt: 'Continue' });
  });

  it('moves the calling session into a worktree from the directory the call came from', async () => {
    const moveToWorktree = vi.fn(async () => ({ sessionId: 'ses_me', directory: '/repo/worktrees/fix' }));
    const { service } = createService({ sessionService: { moveToWorktree } });

    const result = await service.execute('session.moveToWorktree', { worktree: ' fix ', branch: 'iuliia/fix' }, '/repo', { contextSessionId: 'ses_me' });

    expect(result).toEqual({ sessionId: 'ses_me', directory: '/repo/worktrees/fix' });
    expect(moveToWorktree).toHaveBeenCalledWith('ses_me', {
      directory: '/repo',
      worktree: { name: 'fix', branchName: 'iuliia/fix' },
    });
  });

  it('passes a branch that already exists through to the move', async () => {
    const moveToWorktree = vi.fn(async () => ({}));
    const { service } = createService({ sessionService: { moveToWorktree } });

    await service.execute('session.moveToWorktree', { worktree: 'review', existingBranch: ' origin/review ' }, '/repo', { contextSessionId: 'ses_me' });

    expect(moveToWorktree).toHaveBeenCalledWith('ses_me', {
      directory: '/repo',
      worktree: { name: 'review', existingBranch: 'origin/review' },
    });
  });

  it('passes the files to carry through to the move', async () => {
    const moveToWorktree = vi.fn(async () => ({}));
    const { service } = createService({ sessionService: { moveToWorktree } });

    await service.execute('session.moveToWorktree', { worktree: 'fix', carry: ['src/a.ts'] }, '/repo', { contextSessionId: 'ses_me' });

    expect(moveToWorktree).toHaveBeenCalledWith('ses_me', {
      directory: '/repo',
      worktree: { name: 'fix' },
      carry: ['src/a.ts'],
    });
  });

  it('moves a named session from where that session lives', async () => {
    const moveToWorktree = vi.fn(async () => ({}));
    const { service, client } = createService({ sessionService: { moveToWorktree } });
    client.session.list.mockResolvedValue({ data: [{ id: 'ses_other', location: { directory: '/repo/worktrees/other' } }] });

    // A directory of the caller's choosing is ignored: the changes come from where the session lives.
    await service.execute('session.moveToWorktree', { sessionId: 'ses_other', worktree: 'fix', startRef: 'develop', directory: '/elsewhere' }, '/repo', { contextSessionId: 'ses_me' });
    await expect(service.execute('session.moveToWorktree', { worktree: 'fix' }, '/repo')).rejects.toThrow('sessionId is required');

    expect(moveToWorktree).toHaveBeenCalledWith('ses_other', {
      directory: '/repo/worktrees/other',
      worktree: { name: 'fix', startRef: 'develop' },
    });
    expect(moveToWorktree).toHaveBeenCalledTimes(1);
  });

  it('finds the target session directory on a later session.list page', async () => {
    const { service, client } = createService();
    client.session.list
      .mockResolvedValueOnce({ data: [{ id: 'ses_early', location: { directory: '/repo' } }], cursor: { next: 'page-2' } })
      .mockResolvedValueOnce({ data: [{ id: 'ses_target', location: { directory: '/repo/worktrees/target' } }], cursor: { next: null } });

    await expect(service.resolveSessionDirectory('ses_target')).resolves.toBe('/repo/worktrees/target');
    expect(client.session.list).toHaveBeenNthCalledWith(2, { cursor: 'page-2' });
    expect(client.session.list).toHaveBeenCalledTimes(2);
  });

  it('keeps paging session.list until the requested limit is satisfied', async () => {
    const { service, client } = createService();
    client.session.list
      .mockResolvedValueOnce({ data: [{ id: 'ses_1', location: { directory: '/repo' }, time: {} }], cursor: { next: 'page-2' } })
      .mockResolvedValueOnce({ data: [{ id: 'ses_2', location: { directory: '/other' }, time: {} }], cursor: { next: null } });

    await expect(service.execute('session.list', { limit: 2 })).resolves.toEqual({
      sessions: [
        { id: 'ses_1', directory: '/repo', ...NOT_IN_WORK },
        { id: 'ses_2', directory: '/other', ...NOT_IN_WORK },
      ],
      limit: 2,
      directory: null,
      archived: 'excluded',
    });
    expect(client.session.list).toHaveBeenNthCalledWith(2, { parentID: null, cursor: 'page-2' });
  });

  it('stops paging the session list when a cursor repeats', async () => {
    const { service, client } = createService();
    client.session.list.mockResolvedValue({
      data: [{ id: 'ses_1', location: { directory: '/repo' }, time: {} }],
      cursor: { next: 'loop' },
    });

    const { sessions } = await service.execute('session.list', { limit: 10 });

    expect(sessions).toEqual([{ id: 'ses_1', directory: '/repo', ...NOT_IN_WORK }]);
    expect(client.session.list).toHaveBeenCalledTimes(2);
  });

  it('falls back to the context directory when the session is not in the global list', async () => {
    const { service, sessionService } = createService();
    sessionService.send.mockResolvedValue({ sessionId: 'ses_unknown', directory: '/repo', promptDispatched: true });

    await service.execute('session.send', { sessionId: 'ses_unknown', prompt: 'Continue' }, '/repo');

    expect(sessionService.send).toHaveBeenCalledWith('ses_unknown', { directory: '/repo', prompt: 'Continue' });
  });

  it('waits past initial idle until a completed assistant result appears', async () => {
    let timestamp = 1000;
    const { service, client, sessionService } = createService({
      now: () => timestamp,
      sleep: async (duration) => { timestamp += duration; },
    });
    sessionService.create.mockResolvedValue({
      sessionId: 'ses_1',
      directory: '/repo',
      promptDispatched: true,
      baselineAssistantMessageId: 'msg_old',
    });
    client.session.active.mockResolvedValue({});
    client.message.list
      .mockResolvedValueOnce({ data: [{ id: 'msg_old', type: 'assistant', time: { completed: 900 }, content: [{ type: 'text', text: 'old' }] }] })
      .mockResolvedValueOnce({ data: [{ id: 'msg_new', type: 'assistant', time: { completed: 1500 }, content: [{ type: 'text', text: 'done' }] }] })
      .mockResolvedValueOnce({ data: [{ id: 'msg_new', type: 'assistant', time: { completed: 1500 }, content: [{ type: 'text', text: 'done' }] }] });

    await expect(service.execute('session.create', {
      directory: '/repo',
      prompt: 'work',
      wait: true,
      lastAssistant: true,
      timeout: 2,
    })).resolves.toEqual(expect.objectContaining({
      sessionStatus: { type: 'idle' },
      lastAssistantMessage: expect.objectContaining({ id: 'msg_new', text: 'done' }),
    }));
    expect(client.session.active).toHaveBeenCalledTimes(2);
  });

  it('filters archived sessions, with the archive file over OpenCode, and adds global statuses', async () => {
    const entries = { ses_archived: 100, ses_restored: null };
    const { service, client } = createService({
      // Async like the real store (`openchamber-sessions/archive-store.js`).
      archiveStore: { entry: async (id) => entries[id] },
    });
    client.session.list.mockResolvedValue({ data: [
      { id: 'ses_active', location: { directory: '/repo' }, time: {} },
      { id: 'ses_archived', location: { directory: '/repo' }, time: {} },
      { id: 'ses_upstream', location: { directory: '/repo' }, time: { archived: 50 } },
      { id: 'ses_restored', location: { directory: '/repo' }, time: { archived: 70 } },
      { id: 'ses_other', location: { directory: '/other' }, time: {} },
    ] });
    client.session.active.mockResolvedValue({ ses_active: { type: 'running' } });

    await expect(service.execute('session.list', { limit: 10, withStatus: true })).resolves.toEqual({
      sessions: [
        { id: 'ses_active', directory: '/repo', ...NOT_IN_WORK, status: { type: 'busy' } },
        { id: 'ses_restored', directory: '/repo', ...NOT_IN_WORK, status: { type: 'idle' } },
        { id: 'ses_other', directory: '/other', ...NOT_IN_WORK, status: { type: 'idle' } },
      ],
      limit: 10,
      directory: null,
      archived: 'excluded',
    });
  });

  it('reports unknown status when the active-session read fails', async () => {
    const { service, client } = createService();
    client.session.list.mockResolvedValue({ data: [{ id: 'ses_active', location: { directory: '/repo' }, time: {} }] });
    client.session.active.mockRejectedValue(new Error('unavailable'));

    await expect(service.execute('session.list', { limit: 10, withStatus: true })).resolves.toEqual({
      sessions: [{ id: 'ses_active', directory: '/repo', ...NOT_IN_WORK, status: { type: 'unknown' } }],
      limit: 10,
      directory: null,
      archived: 'excluded',
    });
  });

  it('scopes session reads to an explicit project instead of the tool context directory', async () => {
    const { service, client, sessionService } = createService();
    client.session.list.mockResolvedValue({ data: [{ id: 'ses_repo', location: { directory: '/repo' }, time: {} }] });

    await expect(service.execute('session.list', { projectId: ' project-1 ' }, '/current-session')).resolves.toEqual(
      expect.objectContaining({ directory: '/repo', sessions: [{ id: 'ses_repo', directory: '/repo', ...NOT_IN_WORK }] }),
    );
    expect(sessionService.resolveDirectory).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(client.session.list).toHaveBeenCalledWith({ directory: '/repo', parentID: null });

    await expect(service.execute('session.status', { projectId: 'project-1', sessionId: 'ses_repo' }, '/current-session'))
      .resolves.toEqual({ sessionId: 'ses_repo', directory: '/repo', sessionStatus: { type: 'idle' } });
  });

  it('rejects an unknown project instead of reading another directory', async () => {
    const { service, client } = createService();
    await expect(service.execute('session.list', { projectId: 'missing' }, '/current-session'))
      .rejects.toMatchObject({ statusCode: 404, message: 'Project not found' });
    await expect(service.execute('session.list', { projectId: 'missing' }))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(service.execute('session.messages', { projectId: 'missing', sessionId: 'ses_1' }, '/current-session'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(client.session.list).not.toHaveBeenCalled();
    expect(client.message.list).not.toHaveBeenCalled();
  });

  describe('a session that cannot be read', () => {
    const tagged = (tag, message) => Object.assign(new Error(message), { _tag: tag });
    const reads = [
      ['session.status', {}],
      ['session.messages', {}],
      ['session.messages', { wait: true }],
    ];

    it.each(reads)('%s %j reports an unknown id as not found', async (action, extra) => {
      const { service, client } = createService();
      client.session.get.mockRejectedValue(tagged('SessionNotFoundError', 'Session not found'));
      await expect(service.execute(action, { sessionId: 'ses_missing', directory: '/repo', ...extra }))
        .rejects.toMatchObject({ statusCode: 404, message: 'Session not found: ses_missing' });
      expect(client.session.active).not.toHaveBeenCalled();
    });

    it('reports an id OpenCode refuses as malformed as not found', async () => {
      const { service, client } = createService();
      client.session.get.mockRejectedValue(tagged('InvalidRequestError', 'Expected a string starting with "ses"'));
      await expect(service.execute('session.status', { sessionId: 'abc', directory: '/repo' }))
        .rejects.toMatchObject({ statusCode: 404, message: 'Session not found: abc' });
    });

    it.each(reads)('%s %j keeps a failed lookup apart from not found', async (action, extra) => {
      const { service, client } = createService();
      client.session.get.mockRejectedValue(new Error('connection refused'));
      await expect(service.execute(action, { sessionId: 'ses_1', directory: '/repo', ...extra }))
        .rejects.toMatchObject({ statusCode: 503, message: 'Could not check whether session ses_1 exists: connection refused' });
      expect(client.session.active).not.toHaveBeenCalled();
    });
  });

  describe('a session waiting for the user', () => {
    const pendingFor = (sessionID) => () => ({ [sessionID]: { permissions: [], forms: [], pages: [{ id: 'call_1' }] } });

    it('reports waiting while the session runs with an open request', async () => {
      const { service, client } = createService({ readPendingRequests: pendingFor('ses_1') });
      client.session.active.mockResolvedValue({ ses_1: { type: 'running' }, ses_2: { type: 'running' } });
      client.session.list.mockResolvedValue({ data: [{ id: 'ses_1', time: {} }, { id: 'ses_2', time: {} }, { id: 'ses_3', time: {} }] });

      await expect(service.execute('session.status', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
      await expect(service.execute('session.status', { sessionId: 'ses_2', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'busy' } });
      await expect(service.execute('session.messages', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
      const listed = await service.execute('session.list', { directory: '/repo', withStatus: true });
      expect(listed.sessions.map((session) => session.status.type)).toEqual(['waiting', 'busy', 'idle']);
    });

    it('does not count a permission the server answers by itself', async () => {
      const readPendingRequests = () => ({ ses_1: { permissions: [{ id: 'per_1', directory: '/repo' }], forms: [], pages: [] } });
      const isPermissionAutoAnswered = vi.fn(async () => true);
      const { service, client } = createService({ readPendingRequests, isPermissionAutoAnswered });
      client.session.active.mockResolvedValue({ ses_1: { type: 'running' } });
      await expect(service.execute('session.status', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'busy' } });
      expect(isPermissionAutoAnswered).toHaveBeenCalledWith('ses_1', '/repo', 'per_1');

      isPermissionAutoAnswered.mockResolvedValue(false);
      await expect(service.execute('session.status', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
    });

    it('reads idle when a request outlived its stopped turn', async () => {
      const { service } = createService({ readPendingRequests: pendingFor('ses_1') });
      await expect(service.execute('session.status', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'idle' } });
    });

    it('ends a wait at once with waiting', async () => {
      const sleep = vi.fn(async () => {});
      const { service, client, sessionService } = createService({ readPendingRequests: pendingFor('ses_1'), sleep });
      client.session.active.mockResolvedValue({ ses_1: { type: 'running' } });
      await expect(service.execute('session.messages', { sessionId: 'ses_1', directory: '/repo', wait: true }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
      sessionService.create.mockResolvedValue({ sessionId: 'ses_1', directory: '/repo', promptDispatched: true });
      await expect(service.execute('session.create', { directory: '/repo', prompt: 'x', wait: true }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
      expect(sleep).not.toHaveBeenCalled();
    });
  });

  it('asks for sessionId before looking up the project', async () => {
    const { service, sessionService } = createService();
    await expect(service.execute('session.status', { projectId: 'missing' }, '/current-session'))
      .rejects.toMatchObject({ statusCode: 400, message: 'sessionId is required' });
    expect(sessionService.resolveDirectory).not.toHaveBeenCalled();
  });

  it('rejects any session action scoped by both projectId and directory', async () => {
    const { service, client, sessionService } = createService();
    for (const action of ['session.list', 'session.status', 'session.create', 'session.send', 'session.fork']) {
      await expect(service.execute(action, { projectId: 'project-1', directory: '/other', sessionId: 'ses_1', prompt: 'hi' }))
        .rejects.toMatchObject({ statusCode: 400, message: 'Provide only one of projectId or directory' });
    }
    expect(client.session.list).not.toHaveBeenCalled();
    expect(sessionService.create).not.toHaveBeenCalled();
    expect(sessionService.send).not.toHaveBeenCalled();
    expect(sessionService.fork).not.toHaveBeenCalled();
  });

  describe('In work', () => {
    const open = (extra = {}) => ({ openchamber: { work: { state: 'open', openedAt: 1, openedBy: 'auto', ...extra } } });
    const session = (id, fields = {}) => ({ id, title: id, location: { directory: '/repo' }, time: { updated: 10, idle: 50 }, ...fields });
    const withSettings = (settings) => ({ readSettingsFromDiskMigrated: vi.fn(async () => settings) });

    it('lists what the sidebar block shows, across every project and page', async () => {
      const { service, client } = createService({
        chatRoots: ['/chats'],
        archiveStore: { entry: async (id) => (id === 'archived' ? 100 : undefined) },
      });
      client.session.list
        .mockResolvedValueOnce({ data: [
          session('working', { metadata: open() }),
          session('hinted', { metadata: open({ suggestDoneAt: 60 }) }),
          session('stale-hint', { metadata: open({ suggestDoneAt: 40 }) }),
          session('closed', { metadata: { openchamber: { work: { state: 'done', doneAt: 5 } } } }),
        ], cursor: { next: 'page-2' } })
        .mockResolvedValueOnce({ data: [
          session('child', { parentID: 'working', metadata: open() }),
          session('archived', { metadata: open() }),
          session('chat', { location: { directory: '/chats/one' }, metadata: open() }),
          session('elsewhere', { location: { directory: '/other' }, metadata: open() }),
          session('plain'),
        ], cursor: { next: 'page-3' } })
        .mockResolvedValueOnce({ data: [], cursor: {} });

      const result = await service.execute('session.list', { inWork: true }, '/repo');

      expect(result.sessions.map(({ id, inWork, doneSuggested }) => [id, inWork, doneSuggested])).toEqual([
        ['working', true, false],
        ['hinted', true, true],
        ['stale-hint', true, false],
        ['elsewhere', true, false],
      ]);
      expect(result).toMatchObject({ limit: null, directory: null });
      // Unscoped means every project: the caller's directory is not a filter.
      expect(client.session.list).toHaveBeenNthCalledWith(1, { parentID: null, limit: 200 });
      expect(client.session.list).toHaveBeenCalledTimes(3);
    });

    it('lists what choosing a session needs and leaves the rest of the record out', async () => {
      const { service, client } = createService();
      client.session.list.mockResolvedValue({ data: [{
        id: 'ses_full', projectID: 'p', title: 'Full', agent: 'build', outcome: 'failed',
        model: { providerID: 'openai', id: 'gpt-5', variant: 'high' },
        cost: 1.2, tokens: { input: 10, output: 5 }, permissions: [{ permission: '*', action: 'allow' }],
        time: { created: 1, updated: 2, idle: 3 }, location: { directory: '/repo' },
        metadata: { openchamber: { work: { state: 'open' }, assist: { recap: 'long text' } } },
      }], cursor: {} });

      const { sessions } = await service.execute('session.list', { directory: '/repo' });

      expect(sessions).toEqual([{
        id: 'ses_full', title: 'Full', directory: '/repo', updated: 2, agent: 'build', outcome: 'failed',
        model: { providerID: 'openai', id: 'gpt-5', variant: 'high' }, inWork: true, doneSuggested: false,
      }]);
    });

    it('keeps an explicit scope and limit', async () => {
      const { service, client } = createService();
      client.session.list.mockResolvedValue({ data: [session('a', { metadata: open() }), session('b', { metadata: open() })], cursor: {} });

      const result = await service.execute('session.list', { inWork: true, projectId: 'project-1', limit: 1 });

      expect(result.sessions.map(({ id }) => id)).toEqual(['a']);
      expect(client.session.list).toHaveBeenCalledWith({ directory: '/repo', parentID: null, limit: 200 });
    });

    it('lists the running sessions and stops once it found all of them', async () => {
      const { service, client } = createService();
      client.session.active.mockResolvedValue({ two: { type: 'running' }, four: { type: 'running' } });
      client.session.list.mockResolvedValue({
        data: [session('one'), session('two'), session('three'), session('four')],
        cursor: { next: 'page-2' },
      });

      const result = await service.execute('session.list', { busy: true }, '/repo');

      expect(result.sessions.map(({ id, status }) => [id, status.type])).toEqual([['two', 'busy'], ['four', 'busy']]);
      expect(client.session.list).toHaveBeenCalledTimes(1);
    });

    it('never answers busy with an empty list it could not read', async () => {
      const { service, client } = createService();
      client.session.active.mockRejectedValue(new Error('unavailable'));
      await expect(service.execute('session.list', { busy: true })).rejects.toMatchObject({ statusCode: 503 });
      expect(client.session.list).not.toHaveBeenCalled();
    });

    it('matches every query word in the title, whatever the case and script', async () => {
      const { service, client } = createService();
      client.session.list.mockResolvedValue({ data: [
        session('a', { title: 'Сайдбар: In work список' }),
        session('b', { title: 'Сайдбар і теми' }),
        session('c'),
      ], cursor: {} });

      const result = await service.execute('session.list', { query: 'сайдбар  WORK', directory: '/repo' });

      expect(result.sessions.map(({ id }) => id)).toEqual(['a']);
    });

    it('includes subagent sessions only when asked', async () => {
      const { service, client } = createService();
      await service.execute('session.list', { children: true, directory: '/repo' });
      expect(client.session.list).toHaveBeenCalledWith({ directory: '/repo' });
    });

    it('says nothing about In work while it is off, and refuses to filter by it', async () => {
      const updateSessionMetadata = vi.fn();
      const { service, client } = createService({ ...withSettings({ sessionWorkEnabled: false }), updateSessionMetadata });
      client.session.list.mockResolvedValue({ data: [session('a', { metadata: open() })], cursor: {} });

      const { sessions } = await service.execute('session.list', { directory: '/repo' });
      expect(sessions[0]).not.toHaveProperty('inWork');
      await expect(service.execute('session.list', { inWork: true })).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.execute('session.markDone', { sessionId: 'a' })).rejects.toMatchObject({ statusCode: 409 });
      expect(updateSessionMetadata).not.toHaveBeenCalled();
    });

    it('marks the calling session done through the metadata store', async () => {
      const updateSessionMetadata = vi.fn(async (_id, decide) => ({ changed: decide(open({ suggestDoneAt: 9 })) !== null }));
      const { service, client } = createService({ updateSessionMetadata, now: () => 500 });
      client.session.get.mockResolvedValue(session('ses_me', { title: 'Sidebar', location: { directory: '/repo/wt' } }));

      const result = await service.execute('session.markDone', {}, '/repo', { contextSessionId: 'ses_me' });

      expect(result).toEqual({ sessionId: 'ses_me', directory: '/repo/wt', title: 'Sidebar', inWork: false, changed: true });
      const [id, decide, options] = updateSessionMetadata.mock.calls[0];
      expect([id, options]).toEqual(['ses_me', { directory: '/repo/wt' }]);
      expect(decide(open({ suggestDoneAt: 9 }))).toEqual({ openchamber: { work: { state: 'done', doneAt: 500, suggestDoneAt: null } } });
      expect(decide({ openchamber: { work: { state: 'done', doneAt: 1 } } })).toBeNull();
    });

    it('puts a session back in work, never a subsession or an archived one', async () => {
      const updateSessionMetadata = vi.fn(async () => ({ changed: true }));
      const { service, client } = createService({
        updateSessionMetadata,
        now: () => 700,
        archiveStore: { entry: async (id) => (id === 'archived' ? 100 : undefined) },
      });
      client.session.get.mockImplementation(async ({ sessionID }) => session(sessionID, sessionID === 'child' ? { parentID: 'p' } : {}));

      await expect(service.execute('session.track', { sessionId: 'child' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.execute('session.track', { sessionId: 'archived' })).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.execute('session.track', { sessionId: 'plain' })).resolves.toMatchObject({ inWork: true });

      expect(updateSessionMetadata).toHaveBeenCalledTimes(1);
      const decide = updateSessionMetadata.mock.calls[0][1];
      expect(decide({})).toEqual({ openchamber: { work: { state: 'open', openedAt: 700, openedBy: 'user', doneAt: null, suggestDoneAt: null } } });
    });

    it('reports an unknown session and a server that cannot write', async () => {
      const tagged = Object.assign(new Error('Session not found'), { _tag: 'SessionNotFoundError' });
      const { service, client } = createService({ updateSessionMetadata: vi.fn() });
      client.session.get.mockRejectedValue(tagged);
      await expect(service.execute('session.markDone', { sessionId: 'ses_gone' })).rejects.toMatchObject({ statusCode: 404 });
      await expect(createService().service.execute('session.markDone', { sessionId: 'a' })).rejects.toMatchObject({ statusCode: 503 });
    });
  });

  it('names limit in positive-integer validation errors', async () => {
    const { service, client } = createService();
    await expect(service.execute('session.list', { limit: 0 })).rejects.toThrow('limit must be a positive integer');
    expect(client.session.list).not.toHaveBeenCalled();
  });

  it('projects only ordered text content from session messages', async () => {
    const { service, client } = createService();
    client.message.list.mockResolvedValue({ data: [
      {
        id: 'msg_assistant', type: 'assistant', model: { providerID: 'openai', id: 'gpt-5.4-mini' }, time: { created: 20, completed: 30 },
        content: [{ type: 'reasoning', text: 'hidden' }, { type: 'text', text: 'First ' }, { type: 'tool' }, { type: 'text', text: 'answer' }],
      },
      { id: 'msg_user', type: 'user', time: { created: 10 }, text: 'Question' },
      { id: 'msg_tool', type: 'assistant', time: { created: 15 }, content: [{ type: 'tool' }] },
    ] });

    await expect(service.execute('session.messages', {
      sessionId: 'ses_1',
      directory: '/repo',
      role: 'all',
      all: true,
    })).resolves.toEqual({
      sessionId: 'ses_1',
      directory: '/repo',
      role: 'all',
      sessionStatus: { type: 'idle' },
      messages: [
        { id: 'msg_user', role: 'user', createdAt: 10, completedAt: null, model: null, text: 'Question' },
        { id: 'msg_assistant', role: 'assistant', createdAt: 20, completedAt: 30, model: 'openai/gpt-5.4-mini', text: 'First answer' },
      ],
    });
  });

  it('follows the message cursor so all: true returns the whole history', async () => {
    const { service, client } = createService();
    const page = (data, next) => ({ data, cursor: { next } });
    // Newest page first (the API pages with order: 'desc'), then older pages
    // reachable only through cursor.next.
    client.message.list.mockImplementation(async (input) => {
      if (!input.cursor) {
        return page([
          { id: 'msg_new_user', type: 'user', time: { created: 40 }, text: 'Recent question' },
          { id: 'msg_new_assistant', type: 'assistant', time: { created: 50, completed: 55 }, content: [{ type: 'text', text: 'Recent answer' }] },
        ], 'cursor-page-2');
      }
      if (input.cursor === 'cursor-page-2') {
        return page([
          { id: 'msg_old_user', type: 'user', time: { created: 10 }, text: 'Older requirement' },
        ], undefined);
      }
      throw new Error(`unexpected cursor ${input.cursor}`);
    });

    const result = await service.execute('session.messages', {
      sessionId: 'ses_1',
      directory: '/repo',
      role: 'all',
      all: true,
    });

    expect(client.message.list).toHaveBeenCalledTimes(2);
    expect(client.message.list.mock.calls[1][0]).toMatchObject({ sessionID: 'ses_1', cursor: 'cursor-page-2' });
    expect(result.messages.map((message) => message.id)).toEqual([
      'msg_old_user', 'msg_new_user', 'msg_new_assistant',
    ]);
  });

  it('pages a bounded read with the cursor alone until it has enough text messages', async () => {
    const { service, client } = createService();
    const page = (data, next) => ({ data, cursor: { next } });
    client.message.list.mockImplementation(async (input) => {
      if (!input.cursor) {
        return page([
          { id: 'msg_new_assistant', type: 'assistant', time: { created: 50, completed: 55 }, content: [{ type: 'text', text: 'Recent answer' }] },
          { id: 'msg_new_user', type: 'user', time: { created: 40 }, text: 'Recent question' },
        ], 'cursor-page-2');
      }
      if (input.cursor === 'cursor-page-2') {
        return page([
          { id: 'msg_mid_user', type: 'user', time: { created: 20 }, text: 'Earlier question' },
          { id: 'msg_old_user', type: 'user', time: { created: 10 }, text: 'First question' },
        ], 'cursor-page-3');
      }
      throw new Error(`unexpected cursor ${input.cursor}`);
    });

    const result = await service.execute('session.messages', {
      sessionId: 'ses_1',
      directory: '/repo',
      role: 'user',
      limit: 2,
    });

    expect(client.message.list).toHaveBeenCalledTimes(2);
    expect(client.message.list.mock.calls[0][0]).toMatchObject({ sessionID: 'ses_1', order: 'desc' });
    expect(client.message.list.mock.calls[1][0]).toMatchObject({ sessionID: 'ses_1', cursor: 'cursor-page-2' });
    expect(client.message.list.mock.calls[1][0]).not.toHaveProperty('order');
    expect(result.messages.map((message) => message.id)).toEqual(['msg_mid_user', 'msg_new_user']);
  });

  it('stops paging when the message cursor repeats or a page comes back empty', async () => {
    const { service, client } = createService();
    client.message.list.mockImplementation(async (input) => {
      if (!input.cursor) {
        return { data: [{ id: 'msg_new_user', type: 'user', time: { created: 20 }, text: 'Question' }], cursor: { next: 'cursor-loop' } };
      }
      return { data: [{ id: 'msg_old_user', type: 'user', time: { created: 10 }, text: 'Older question' }], cursor: { next: 'cursor-loop' } };
    });

    const looped = await service.execute('session.messages', { sessionId: 'ses_1', directory: '/repo', all: true });
    expect(client.message.list).toHaveBeenCalledTimes(2);
    expect(looped.messages.map((message) => message.id)).toEqual(['msg_old_user', 'msg_new_user']);

    client.message.list.mockReset();
    client.message.list.mockImplementation(async (input) => (input.cursor
      ? { data: [], cursor: { next: `${input.cursor}-next` } }
      : { data: [{ id: 'msg_user', type: 'user', time: { created: 10 }, text: 'Question' }], cursor: { next: 'cursor-empty' } }));

    const drained = await service.execute('session.messages', { sessionId: 'ses_1', directory: '/repo', all: true });
    expect(client.message.list).toHaveBeenCalledTimes(2);
    expect(drained.messages.map((message) => message.id)).toEqual(['msg_user']);
  });

  it('rejects actions outside the fixed contract', async () => {
    const { service } = createService();
    await expect(service.execute('session.delete')).rejects.toThrow('Unsupported OpenChamber action');
  });
});

describe('file.open', () => {
  it('hands the path, the session directory and the session to the file viewer', async () => {
    const request = vi.fn(async () => ({ path: '/repo/out.csv', size: 3, opened: true }));
    const { service } = createService({ fileOpen: { request } });

    const result = await service.execute('file.open', { path: 'out.csv' }, '/repo', { contextSessionId: 'ses_1' });

    expect(request).toHaveBeenCalledWith({ path: 'out.csv', directory: '/repo', sessionId: 'ses_1' });
    expect(result).toEqual({ path: '/repo/out.csv', size: 3, opened: true });
  });

  it('lets an explicit directory win over the session directory', async () => {
    const request = vi.fn(async () => ({ path: '/other/out.csv', size: 3, opened: true }));
    const { service } = createService({ fileOpen: { request } });

    await service.execute('file.open', { path: 'out.csv', directory: '/other' }, '/repo');

    expect(request).toHaveBeenCalledWith({ path: 'out.csv', directory: '/other', sessionId: null });
  });

  it('answers 503 when this server has no file viewer wired', async () => {
    const { service } = createService({});
    await expect(service.execute('file.open', { path: 'out.csv' }, '/repo')).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('notify.send', () => {
  it('sends the notice for the calling session and returns what was delivered', async () => {
    const notifyUser = vi.fn(async () => ({ status: 200, body: { delivered: true } }));
    const { service } = createService({ notifyUser });

    const result = await service.execute('notify.send', { title: 'Done', body: 'All green', showWhenFocused: true }, '/repo', { contextSessionId: 'ses_1' });

    expect(notifyUser).toHaveBeenCalledWith({ title: 'Done', body: 'All green', showWhenFocused: true, sessionId: 'ses_1', directory: '/repo' });
    expect(result).toEqual({ delivered: true });
  });

  it('turns a refused notice into an error the agent can read', async () => {
    const notifyUser = vi.fn(async () => ({ status: 429, retryAfter: 4, body: { error: 'too many notifications' } }));
    const { service } = createService({ notifyUser });

    await expect(service.execute('notify.send', { title: 'Done' }, '/repo'))
      .rejects.toMatchObject({ statusCode: 429, message: 'too many notifications' });
  });

  it('answers 503 when this server has no notifier wired', async () => {
    const { service } = createService({});
    await expect(service.execute('notify.send', { title: 'Done' }, '/repo')).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('usage.read', () => {
  const quota = {
    listUsagePageProviders: () => [{ providerId: 'claude', providerName: 'Claude' }],
    listConfiguredQuotaProviders: async () => ['claude'],
    fetchQuotaForProvider: async (providerId) => ({ providerId, providerName: 'Claude', ok: true, configured: true, usage: { windows: {} }, fetchedAt: 1 }),
  };

  it('reads the configured providers while the setting is on', async () => {
    const { service } = createService({
      readSettingsFromDiskMigrated: vi.fn(async () => ({ agentUsageToolEnabled: true })),
      loadQuota: async () => quota,
    });

    await expect(service.execute('usage.read', {}, '/repo')).resolves.toEqual({
      providers: [{ providerId: 'claude', providerName: 'Claude', ok: true, configured: true, usage: { windows: {} }, fetchedAt: 1 }],
      notConfigured: [],
    });
  });

  it('refuses while the setting is off', async () => {
    const { service } = createService({ loadQuota: async () => quota });
    await expect(service.execute('usage.read', {}, '/repo')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('answers 503 when this server cannot load the quota module', async () => {
    const { service } = createService({ readSettingsFromDiskMigrated: vi.fn(async () => ({ agentUsageToolEnabled: true })) });
    await expect(service.execute('usage.read', {}, '/repo')).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('render.page', () => {
  const page = '<!doctype html><p>Hi</p>';

  it('accepts a page with a title and tells the agent not to restate it', async () => {
    const { service } = createService();

    const result = await service.execute('render.page', { html: page, title: '  Coverage  ' }, '/repo');

    expect(result).toMatchObject({ shown: true, title: 'Coverage' });
    expect(result.note).toContain("Don't announce");
  });

  it('tells the agent which local images will not show and why', async () => {
    const { service } = createService();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-render-images-'));
=======
  it.each([
    ['session.send', 'send'],
    ['session.fork', 'fork'],
  ])('delegates %s directly to the session service', async (action, method) => {
    const { service, sessionService } = createService();
    sessionService[method].mockResolvedValue({ sessionId: 'ses_1', directory: '/repo' });

    await service.execute(action, { sessionId: 'ses_1', directory: '/repo', prompt: 'Continue' });

    expect(sessionService[method]).toHaveBeenCalledWith('ses_1', { directory: '/repo', prompt: 'Continue' });
  });

  it('resolves the target session directory from the global session list when send omits it', async () => {
    const { service, sessionService, client } = createService();
    client.session.list.mockResolvedValue({
      data: [
        { id: 'ses_other', location: { directory: '/repo/worktrees/other' } },
        { id: 'ses_target', location: { directory: '/repo/worktrees/target' } },
      ],
    });
    sessionService.send.mockResolvedValue({ sessionId: 'ses_target', directory: '/repo/worktrees/target', promptDispatched: true });

    await service.execute('session.send', { sessionId: 'ses_target', prompt: 'Continue' }, '/repo');

    expect(sessionService.send).toHaveBeenCalledWith('ses_target', { directory: '/repo/worktrees/target', prompt: 'Continue' });
  });

  it('moves the calling session into a worktree from the directory the call came from', async () => {
    const moveToWorktree = vi.fn(async () => ({ sessionId: 'ses_me', directory: '/repo/worktrees/fix' }));
    const { service } = createService({ sessionService: { moveToWorktree } });

    const result = await service.execute('session.moveToWorktree', { worktree: ' fix ', branch: 'iuliia/fix' }, '/repo', { contextSessionId: 'ses_me' });

    expect(result).toEqual({ sessionId: 'ses_me', directory: '/repo/worktrees/fix' });
    expect(moveToWorktree).toHaveBeenCalledWith('ses_me', {
      directory: '/repo',
      worktree: { name: 'fix', branchName: 'iuliia/fix' },
    });
  });

  it('passes a branch that already exists through to the move', async () => {
    const moveToWorktree = vi.fn(async () => ({}));
    const { service } = createService({ sessionService: { moveToWorktree } });

    await service.execute('session.moveToWorktree', { worktree: 'review', existingBranch: ' origin/review ' }, '/repo', { contextSessionId: 'ses_me' });

    expect(moveToWorktree).toHaveBeenCalledWith('ses_me', {
      directory: '/repo',
      worktree: { name: 'review', existingBranch: 'origin/review' },
    });
  });

  it('passes the files to carry through to the move', async () => {
    const moveToWorktree = vi.fn(async () => ({}));
    const { service } = createService({ sessionService: { moveToWorktree } });

    await service.execute('session.moveToWorktree', { worktree: 'fix', carry: ['src/a.ts'] }, '/repo', { contextSessionId: 'ses_me' });

    expect(moveToWorktree).toHaveBeenCalledWith('ses_me', {
      directory: '/repo',
      worktree: { name: 'fix' },
      carry: ['src/a.ts'],
    });
  });

  it('moves a named session from where that session lives', async () => {
    const moveToWorktree = vi.fn(async () => ({}));
    const { service, client } = createService({ sessionService: { moveToWorktree } });
    client.session.list.mockResolvedValue({ data: [{ id: 'ses_other', location: { directory: '/repo/worktrees/other' } }] });

    // A directory of the caller's choosing is ignored: the changes come from where the session lives.
    await service.execute('session.moveToWorktree', { sessionId: 'ses_other', worktree: 'fix', startRef: 'develop', directory: '/elsewhere' }, '/repo', { contextSessionId: 'ses_me' });
    await expect(service.execute('session.moveToWorktree', { worktree: 'fix' }, '/repo')).rejects.toThrow('sessionId is required');

    expect(moveToWorktree).toHaveBeenCalledWith('ses_other', {
      directory: '/repo/worktrees/other',
      worktree: { name: 'fix', startRef: 'develop' },
    });
    expect(moveToWorktree).toHaveBeenCalledTimes(1);
  });

  it('finds the target session directory on a later session.list page', async () => {
    const { service, client } = createService();
    client.session.list
      .mockResolvedValueOnce({ data: [{ id: 'ses_early', location: { directory: '/repo' } }], cursor: { next: 'page-2' } })
      .mockResolvedValueOnce({ data: [{ id: 'ses_target', location: { directory: '/repo/worktrees/target' } }], cursor: { next: null } });

    await expect(service.resolveSessionDirectory('ses_target')).resolves.toBe('/repo/worktrees/target');
    expect(client.session.list).toHaveBeenNthCalledWith(2, { cursor: 'page-2' });
    expect(client.session.list).toHaveBeenCalledTimes(2);
  });

  it('prefers the session by-id location over a stale copy in the global list', async () => {
    const { service, client } = createService();
    client.session.get.mockResolvedValue({ id: 'ses_target', location: { directory: '/repo/real' } });
    client.session.list.mockResolvedValue({
      data: [{ id: 'ses_target', location: { directory: '/repo/stale' } }],
    });

    await expect(service.resolveSessionDirectory('ses_target')).resolves.toBe('/repo/real');
    expect(client.session.list).not.toHaveBeenCalled();
  });

  it('keeps paging session.list until the requested limit is satisfied', async () => {
    const { service, client } = createService();
    client.session.list
      .mockResolvedValueOnce({ data: [{ id: 'ses_1', location: { directory: '/repo' }, time: {} }], cursor: { next: 'page-2' } })
      .mockResolvedValueOnce({ data: [{ id: 'ses_2', location: { directory: '/other' }, time: {} }], cursor: { next: null } });

    await expect(service.execute('session.list', { limit: 2 })).resolves.toEqual({
      sessions: [
        { id: 'ses_1', directory: '/repo', ...NOT_IN_WORK },
        { id: 'ses_2', directory: '/other', ...NOT_IN_WORK },
      ],
      limit: 2,
      directory: null,
      archived: 'excluded',
    });
    expect(client.session.list).toHaveBeenNthCalledWith(2, { parentID: null, cursor: 'page-2' });
  });

  it('stops paging the session list when a cursor repeats', async () => {
    const { service, client } = createService();
    client.session.list.mockResolvedValue({
      data: [{ id: 'ses_1', location: { directory: '/repo' }, time: {} }],
      cursor: { next: 'loop' },
    });

    const { sessions } = await service.execute('session.list', { limit: 10 });

    expect(sessions).toEqual([{ id: 'ses_1', directory: '/repo', ...NOT_IN_WORK }]);
    expect(client.session.list).toHaveBeenCalledTimes(2);
  });

  it('falls back to the context directory when the session is not in the global list', async () => {
    const { service, sessionService } = createService();
    sessionService.send.mockResolvedValue({ sessionId: 'ses_unknown', directory: '/repo', promptDispatched: true });

    await service.execute('session.send', { sessionId: 'ses_unknown', prompt: 'Continue' }, '/repo');

    expect(sessionService.send).toHaveBeenCalledWith('ses_unknown', { directory: '/repo', prompt: 'Continue' });
  });

  it('waits past initial idle until a completed assistant result appears', async () => {
    let timestamp = 1000;
    const { service, client, sessionService } = createService({
      now: () => timestamp,
      sleep: async (duration) => { timestamp += duration; },
    });
    sessionService.create.mockResolvedValue({
      sessionId: 'ses_1',
      directory: '/repo',
      promptDispatched: true,
      baselineAssistantMessageId: 'msg_old',
    });
    client.session.active.mockResolvedValue({});
    client.message.list
      .mockResolvedValueOnce({ data: [{ id: 'msg_old', type: 'assistant', time: { completed: 900 }, content: [{ type: 'text', text: 'old' }] }] })
      .mockResolvedValueOnce({ data: [{ id: 'msg_new', type: 'assistant', time: { completed: 1500 }, content: [{ type: 'text', text: 'done' }] }] })
      .mockResolvedValueOnce({ data: [{ id: 'msg_new', type: 'assistant', time: { completed: 1500 }, content: [{ type: 'text', text: 'done' }] }] });

    await expect(service.execute('session.create', {
      directory: '/repo',
      prompt: 'work',
      wait: true,
      lastAssistant: true,
      timeout: 2,
    })).resolves.toEqual(expect.objectContaining({
      sessionStatus: { type: 'idle' },
      lastAssistantMessage: expect.objectContaining({ id: 'msg_new', text: 'done' }),
    }));
    expect(client.session.active).toHaveBeenCalledTimes(2);
  });

  it('filters archived sessions, with the archive file over OpenCode, and adds global statuses', async () => {
    const entries = { ses_archived: 100, ses_restored: null };
    const { service, client } = createService({
      // Async like the real store (`openchamber-sessions/archive-store.js`).
      archiveStore: { entry: async (id) => entries[id] },
    });
    client.session.list.mockResolvedValue({ data: [
      { id: 'ses_active', location: { directory: '/repo' }, time: {} },
      { id: 'ses_archived', location: { directory: '/repo' }, time: {} },
      { id: 'ses_upstream', location: { directory: '/repo' }, time: { archived: 50 } },
      { id: 'ses_restored', location: { directory: '/repo' }, time: { archived: 70 } },
      { id: 'ses_other', location: { directory: '/other' }, time: {} },
    ] });
    client.session.active.mockResolvedValue({ ses_active: { type: 'running' } });

    await expect(service.execute('session.list', { limit: 10, withStatus: true })).resolves.toEqual({
      sessions: [
        { id: 'ses_active', directory: '/repo', ...NOT_IN_WORK, status: { type: 'busy' } },
        { id: 'ses_restored', directory: '/repo', ...NOT_IN_WORK, status: { type: 'idle' } },
        { id: 'ses_other', directory: '/other', ...NOT_IN_WORK, status: { type: 'idle' } },
      ],
      limit: 10,
      directory: null,
      archived: 'excluded',
    });
  });

  it('reports unknown status when the active-session read fails', async () => {
    const { service, client } = createService();
    client.session.list.mockResolvedValue({ data: [{ id: 'ses_active', location: { directory: '/repo' }, time: {} }] });
    client.session.active.mockRejectedValue(new Error('unavailable'));

    await expect(service.execute('session.list', { limit: 10, withStatus: true })).resolves.toEqual({
      sessions: [{ id: 'ses_active', directory: '/repo', ...NOT_IN_WORK, status: { type: 'unknown' } }],
      limit: 10,
      directory: null,
      archived: 'excluded',
    });
  });

  it('scopes session reads to an explicit project instead of the tool context directory', async () => {
    const { service, client, sessionService } = createService();
    client.session.list.mockResolvedValue({ data: [{ id: 'ses_repo', location: { directory: '/repo' }, time: {} }] });

    await expect(service.execute('session.list', { projectId: ' project-1 ' }, '/current-session')).resolves.toEqual(
      expect.objectContaining({ directory: '/repo', sessions: [{ id: 'ses_repo', directory: '/repo', ...NOT_IN_WORK }] }),
    );
    expect(sessionService.resolveDirectory).toHaveBeenCalledWith({ projectId: 'project-1' });
    expect(client.session.list).toHaveBeenCalledWith({ directory: '/repo', parentID: null });

    await expect(service.execute('session.status', { projectId: 'project-1', sessionId: 'ses_repo' }, '/current-session'))
      .resolves.toEqual({ sessionId: 'ses_repo', directory: '/repo', sessionStatus: { type: 'idle' } });
  });

  it('reads an unscoped session where it lives instead of the tool context directory', async () => {
    const { service, client } = createService();
    client.session.get.mockResolvedValue({ id: 'ses_moved', location: { directory: '/repo/worktrees/moved' } });

    await expect(service.execute('session.status', { sessionId: 'ses_moved' }, '/current-session'))
      .resolves.toEqual({ sessionId: 'ses_moved', directory: '/repo/worktrees/moved', sessionStatus: { type: 'idle' } });
    await expect(service.execute('session.messages', { sessionId: 'ses_moved' }, '/current-session'))
      .resolves.toMatchObject({ directory: '/repo/worktrees/moved' });
  });

  it('rejects an unknown project instead of reading another directory', async () => {
    const { service, client } = createService();
    await expect(service.execute('session.list', { projectId: 'missing' }, '/current-session'))
      .rejects.toMatchObject({ statusCode: 404, message: 'Project not found' });
    await expect(service.execute('session.list', { projectId: 'missing' }))
      .rejects.toMatchObject({ statusCode: 404 });
    await expect(service.execute('session.messages', { projectId: 'missing', sessionId: 'ses_1' }, '/current-session'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(client.session.list).not.toHaveBeenCalled();
    expect(client.message.list).not.toHaveBeenCalled();
  });

  describe('a session that cannot be read', () => {
    const tagged = (tag, message) => Object.assign(new Error(message), { _tag: tag });
    const reads = [
      ['session.status', {}],
      ['session.messages', {}],
      ['session.messages', { wait: true }],
    ];

    it.each(reads)('%s %j reports an unknown id as not found', async (action, extra) => {
      const { service, client } = createService();
      client.session.get.mockRejectedValue(tagged('SessionNotFoundError', 'Session not found'));
      await expect(service.execute(action, { sessionId: 'ses_missing', directory: '/repo', ...extra }))
        .rejects.toMatchObject({ statusCode: 404, message: 'Session not found: ses_missing' });
      expect(client.session.active).not.toHaveBeenCalled();
    });

    it('reports an id OpenCode refuses as malformed as not found', async () => {
      const { service, client } = createService();
      client.session.get.mockRejectedValue(tagged('InvalidRequestError', 'Expected a string starting with "ses"'));
      await expect(service.execute('session.status', { sessionId: 'abc', directory: '/repo' }))
        .rejects.toMatchObject({ statusCode: 404, message: 'Session not found: abc' });
    });

    it.each(reads)('%s %j keeps a failed lookup apart from not found', async (action, extra) => {
      const { service, client } = createService();
      client.session.get.mockRejectedValue(new Error('connection refused'));
      await expect(service.execute(action, { sessionId: 'ses_1', directory: '/repo', ...extra }))
        .rejects.toMatchObject({ statusCode: 503, message: 'Could not check whether session ses_1 exists: connection refused' });
      expect(client.session.active).not.toHaveBeenCalled();
    });
  });

  describe('a session waiting for the user', () => {
    const pendingFor = (sessionID) => () => ({ [sessionID]: { permissions: [], forms: [], pages: [{ id: 'call_1' }] } });

    it('reports waiting while the session runs with an open request', async () => {
      const { service, client } = createService({ readPendingRequests: pendingFor('ses_1') });
      client.session.active.mockResolvedValue({ ses_1: { type: 'running' }, ses_2: { type: 'running' } });
      client.session.list.mockResolvedValue({ data: [{ id: 'ses_1', time: {} }, { id: 'ses_2', time: {} }, { id: 'ses_3', time: {} }] });

      await expect(service.execute('session.status', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
      await expect(service.execute('session.status', { sessionId: 'ses_2', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'busy' } });
      await expect(service.execute('session.messages', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
      const listed = await service.execute('session.list', { directory: '/repo', withStatus: true });
      expect(listed.sessions.map((session) => session.status.type)).toEqual(['waiting', 'busy', 'idle']);
    });

    it('does not count a permission the server answers by itself', async () => {
      const readPendingRequests = () => ({ ses_1: { permissions: [{ id: 'per_1', directory: '/repo' }], forms: [], pages: [] } });
      const isPermissionAutoAnswered = vi.fn(async () => true);
      const { service, client } = createService({ readPendingRequests, isPermissionAutoAnswered });
      client.session.active.mockResolvedValue({ ses_1: { type: 'running' } });
      await expect(service.execute('session.status', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'busy' } });
      expect(isPermissionAutoAnswered).toHaveBeenCalledWith('ses_1', '/repo', 'per_1');

      isPermissionAutoAnswered.mockResolvedValue(false);
      await expect(service.execute('session.status', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
    });

    it('reads idle when a request outlived its stopped turn', async () => {
      const { service } = createService({ readPendingRequests: pendingFor('ses_1') });
      await expect(service.execute('session.status', { sessionId: 'ses_1', directory: '/repo' }))
        .resolves.toMatchObject({ sessionStatus: { type: 'idle' } });
    });

    it('ends a wait at once with waiting', async () => {
      const sleep = vi.fn(async () => {});
      const { service, client, sessionService } = createService({ readPendingRequests: pendingFor('ses_1'), sleep });
      client.session.active.mockResolvedValue({ ses_1: { type: 'running' } });
      await expect(service.execute('session.messages', { sessionId: 'ses_1', directory: '/repo', wait: true }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
      sessionService.create.mockResolvedValue({ sessionId: 'ses_1', directory: '/repo', promptDispatched: true });
      await expect(service.execute('session.create', { directory: '/repo', prompt: 'x', wait: true }))
        .resolves.toMatchObject({ sessionStatus: { type: 'waiting' } });
      expect(sleep).not.toHaveBeenCalled();
    });
  });

  it('asks for sessionId before looking up the project', async () => {
    const { service, sessionService } = createService();
    await expect(service.execute('session.status', { projectId: 'missing' }, '/current-session'))
      .rejects.toMatchObject({ statusCode: 400, message: 'sessionId is required' });
    expect(sessionService.resolveDirectory).not.toHaveBeenCalled();
  });

  it('rejects any session action scoped by both projectId and directory', async () => {
    const { service, client, sessionService } = createService();
    for (const action of ['session.list', 'session.status', 'session.create', 'session.send', 'session.fork']) {
      await expect(service.execute(action, { projectId: 'project-1', directory: '/other', sessionId: 'ses_1', prompt: 'hi' }))
        .rejects.toMatchObject({ statusCode: 400, message: 'Provide only one of projectId or directory' });
    }
    expect(client.session.list).not.toHaveBeenCalled();
    expect(sessionService.create).not.toHaveBeenCalled();
    expect(sessionService.send).not.toHaveBeenCalled();
    expect(sessionService.fork).not.toHaveBeenCalled();
  });

  describe('In work', () => {
    const open = (extra = {}) => ({ openchamber: { work: { state: 'open', openedAt: 1, openedBy: 'auto', ...extra } } });
    const session = (id, fields = {}) => ({ id, title: id, location: { directory: '/repo' }, time: { updated: 10, idle: 50 }, ...fields });
    const withSettings = (settings) => ({ readSettingsFromDiskMigrated: vi.fn(async () => settings) });

    it('lists what the sidebar block shows, across every project and page', async () => {
      const { service, client } = createService({
        chatRoots: ['/chats'],
        archiveStore: { entry: async (id) => (id === 'archived' ? 100 : undefined) },
      });
      client.session.list
        .mockResolvedValueOnce({ data: [
          session('working', { metadata: open() }),
          session('hinted', { metadata: open({ suggestDoneAt: 60 }) }),
          session('stale-hint', { metadata: open({ suggestDoneAt: 40 }) }),
          session('closed', { metadata: { openchamber: { work: { state: 'done', doneAt: 5 } } } }),
        ], cursor: { next: 'page-2' } })
        .mockResolvedValueOnce({ data: [
          session('child', { parentID: 'working', metadata: open() }),
          session('archived', { metadata: open() }),
          session('chat', { location: { directory: '/chats/one' }, metadata: open() }),
          session('elsewhere', { location: { directory: '/other' }, metadata: open() }),
          session('plain'),
        ], cursor: { next: 'page-3' } })
        .mockResolvedValueOnce({ data: [], cursor: {} });

      const result = await service.execute('session.list', { inWork: true }, '/repo');

      expect(result.sessions.map(({ id, inWork, doneSuggested }) => [id, inWork, doneSuggested])).toEqual([
        ['working', true, false],
        ['hinted', true, true],
        ['stale-hint', true, false],
        ['elsewhere', true, false],
      ]);
      expect(result).toMatchObject({ limit: null, directory: null });
      // Unscoped means every project: the caller's directory is not a filter.
      expect(client.session.list).toHaveBeenNthCalledWith(1, { parentID: null, limit: 200 });
      expect(client.session.list).toHaveBeenCalledTimes(3);
    });

    it('lists what choosing a session needs and leaves the rest of the record out', async () => {
      const { service, client } = createService();
      client.session.list.mockResolvedValue({ data: [{
        id: 'ses_full', projectID: 'p', title: 'Full', agent: 'build', outcome: 'failed',
        model: { providerID: 'openai', id: 'gpt-5', variant: 'high' },
        cost: 1.2, tokens: { input: 10, output: 5 }, permissions: [{ permission: '*', action: 'allow' }],
        time: { created: 1, updated: 2, idle: 3 }, location: { directory: '/repo' },
        metadata: { openchamber: { work: { state: 'open' }, assist: { recap: 'long text' } } },
      }], cursor: {} });

      const { sessions } = await service.execute('session.list', { directory: '/repo' });

      expect(sessions).toEqual([{
        id: 'ses_full', title: 'Full', directory: '/repo', updated: 2, agent: 'build', outcome: 'failed',
        model: { providerID: 'openai', id: 'gpt-5', variant: 'high' }, inWork: true, doneSuggested: false,
      }]);
    });

    it('keeps an explicit scope and limit', async () => {
      const { service, client } = createService();
      client.session.list.mockResolvedValue({ data: [session('a', { metadata: open() }), session('b', { metadata: open() })], cursor: {} });

      const result = await service.execute('session.list', { inWork: true, projectId: 'project-1', limit: 1 });

      expect(result.sessions.map(({ id }) => id)).toEqual(['a']);
      expect(client.session.list).toHaveBeenCalledWith({ directory: '/repo', parentID: null, limit: 200 });
    });

    it('lists the running sessions and stops once it found all of them', async () => {
      const { service, client } = createService();
      client.session.active.mockResolvedValue({ two: { type: 'running' }, four: { type: 'running' } });
      client.session.list.mockResolvedValue({
        data: [session('one'), session('two'), session('three'), session('four')],
        cursor: { next: 'page-2' },
      });

      const result = await service.execute('session.list', { busy: true }, '/repo');

      expect(result.sessions.map(({ id, status }) => [id, status.type])).toEqual([['two', 'busy'], ['four', 'busy']]);
      expect(client.session.list).toHaveBeenCalledTimes(1);
    });

    it('never answers busy with an empty list it could not read', async () => {
      const { service, client } = createService();
      client.session.active.mockRejectedValue(new Error('unavailable'));
      await expect(service.execute('session.list', { busy: true })).rejects.toMatchObject({ statusCode: 503 });
      expect(client.session.list).not.toHaveBeenCalled();
    });

    it('matches every query word in the title, whatever the case and script', async () => {
      const { service, client } = createService();
      client.session.list.mockResolvedValue({ data: [
        session('a', { title: 'Сайдбар: In work список' }),
        session('b', { title: 'Сайдбар і теми' }),
        session('c'),
      ], cursor: {} });

      const result = await service.execute('session.list', { query: 'сайдбар  WORK', directory: '/repo' });

      expect(result.sessions.map(({ id }) => id)).toEqual(['a']);
    });

    it('includes subagent sessions only when asked', async () => {
      const { service, client } = createService();
      await service.execute('session.list', { children: true, directory: '/repo' });
      expect(client.session.list).toHaveBeenCalledWith({ directory: '/repo' });
    });

    it('says nothing about In work while it is off, and refuses to filter by it', async () => {
      const updateSessionMetadata = vi.fn();
      const { service, client } = createService({ ...withSettings({ sessionWorkEnabled: false }), updateSessionMetadata });
      client.session.list.mockResolvedValue({ data: [session('a', { metadata: open() })], cursor: {} });

      const { sessions } = await service.execute('session.list', { directory: '/repo' });
      expect(sessions[0]).not.toHaveProperty('inWork');
      await expect(service.execute('session.list', { inWork: true })).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.execute('session.markDone', { sessionId: 'a' })).rejects.toMatchObject({ statusCode: 409 });
      expect(updateSessionMetadata).not.toHaveBeenCalled();
    });

    it('marks the calling session done through the metadata store', async () => {
      const updateSessionMetadata = vi.fn(async (_id, decide) => ({ changed: decide(open({ suggestDoneAt: 9 })) !== null }));
      const { service, client } = createService({ updateSessionMetadata, now: () => 500 });
      client.session.get.mockResolvedValue(session('ses_me', { title: 'Sidebar', location: { directory: '/repo/wt' } }));

      const result = await service.execute('session.markDone', {}, '/repo', { contextSessionId: 'ses_me' });

      expect(result).toEqual({ sessionId: 'ses_me', directory: '/repo/wt', title: 'Sidebar', inWork: false, changed: true });
      const [id, decide, options] = updateSessionMetadata.mock.calls[0];
      expect([id, options]).toEqual(['ses_me', { directory: '/repo/wt' }]);
      expect(decide(open({ suggestDoneAt: 9 }))).toEqual({ openchamber: { work: { state: 'done', doneAt: 500, suggestDoneAt: null } } });
      expect(decide({ openchamber: { work: { state: 'done', doneAt: 1 } } })).toBeNull();
    });

    it('puts a session back in work, never a subsession or an archived one', async () => {
      const updateSessionMetadata = vi.fn(async () => ({ changed: true }));
      const { service, client } = createService({
        updateSessionMetadata,
        now: () => 700,
        archiveStore: { entry: async (id) => (id === 'archived' ? 100 : undefined) },
      });
      client.session.get.mockImplementation(async ({ sessionID }) => session(sessionID, sessionID === 'child' ? { parentID: 'p' } : {}));

      await expect(service.execute('session.track', { sessionId: 'child' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(service.execute('session.track', { sessionId: 'archived' })).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.execute('session.track', { sessionId: 'plain' })).resolves.toMatchObject({ inWork: true });

      expect(updateSessionMetadata).toHaveBeenCalledTimes(1);
      const decide = updateSessionMetadata.mock.calls[0][1];
      expect(decide({})).toEqual({ openchamber: { work: { state: 'open', openedAt: 700, openedBy: 'user', doneAt: null, suggestDoneAt: null } } });
    });

    it('never puts a pinned session, or one in a pinned worktree, in work', async () => {
      const updateSessionMetadata = vi.fn(async () => ({ changed: true }));
      const isWorktreePinned = vi.fn(async (directory) => directory === '/repo/pinned-wt');
      const { service, client } = createService({ updateSessionMetadata, isWorktreePinned });
      const fields = {
        pinned: { metadata: { openchamber: { pinned: { at: 1 } } } },
        'in-wt': { location: { directory: '/repo/pinned-wt' } },
      };
      client.session.get.mockImplementation(async ({ sessionID }) => session(sessionID, fields[sessionID]));

      await expect(service.execute('session.track', { sessionId: 'pinned' })).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.execute('session.track', { sessionId: 'in-wt' })).rejects.toMatchObject({ statusCode: 409 });
      await expect(service.execute('session.markDone', { sessionId: 'pinned' })).resolves.toMatchObject({ inWork: false });
      expect(updateSessionMetadata).toHaveBeenCalledTimes(1);
    });

    it('reports an unknown session and a server that cannot write', async () => {
      const tagged = Object.assign(new Error('Session not found'), { _tag: 'SessionNotFoundError' });
      const { service, client } = createService({ updateSessionMetadata: vi.fn() });
      client.session.get.mockRejectedValue(tagged);
      await expect(service.execute('session.markDone', { sessionId: 'ses_gone' })).rejects.toMatchObject({ statusCode: 404 });
      await expect(createService().service.execute('session.markDone', { sessionId: 'a' })).rejects.toMatchObject({ statusCode: 503 });
    });
  });

  it('names limit in positive-integer validation errors', async () => {
    const { service, client } = createService();
    await expect(service.execute('session.list', { limit: 0 })).rejects.toThrow('limit must be a positive integer');
    expect(client.session.list).not.toHaveBeenCalled();
  });

  it('projects only ordered text content from session messages', async () => {
    const { service, client } = createService();
    client.message.list.mockResolvedValue({ data: [
      {
        id: 'msg_assistant', type: 'assistant', model: { providerID: 'openai', id: 'gpt-5.4-mini' }, time: { created: 20, completed: 30 },
        content: [{ type: 'reasoning', text: 'hidden' }, { type: 'text', text: 'First ' }, { type: 'tool' }, { type: 'text', text: 'answer' }],
      },
      { id: 'msg_user', type: 'user', time: { created: 10 }, text: 'Question' },
      { id: 'msg_tool', type: 'assistant', time: { created: 15 }, content: [{ type: 'tool' }] },
    ] });

    await expect(service.execute('session.messages', {
      sessionId: 'ses_1',
      directory: '/repo',
      role: 'all',
      all: true,
    })).resolves.toEqual({
      sessionId: 'ses_1',
      directory: '/repo',
      role: 'all',
      sessionStatus: { type: 'idle' },
      messages: [
        { id: 'msg_user', role: 'user', createdAt: 10, completedAt: null, model: null, text: 'Question' },
        { id: 'msg_assistant', role: 'assistant', createdAt: 20, completedAt: 30, model: 'openai/gpt-5.4-mini', text: 'First answer' },
      ],
    });
  });

  it('follows the message cursor so all: true returns the whole history', async () => {
    const { service, client } = createService();
    const page = (data, next) => ({ data, cursor: { next } });
    // Newest page first (the API pages with order: 'desc'), then older pages
    // reachable only through cursor.next.
    client.message.list.mockImplementation(async (input) => {
      if (!input.cursor) {
        return page([
          { id: 'msg_new_user', type: 'user', time: { created: 40 }, text: 'Recent question' },
          { id: 'msg_new_assistant', type: 'assistant', time: { created: 50, completed: 55 }, content: [{ type: 'text', text: 'Recent answer' }] },
        ], 'cursor-page-2');
      }
      if (input.cursor === 'cursor-page-2') {
        return page([
          { id: 'msg_old_user', type: 'user', time: { created: 10 }, text: 'Older requirement' },
        ], undefined);
      }
      throw new Error(`unexpected cursor ${input.cursor}`);
    });

    const result = await service.execute('session.messages', {
      sessionId: 'ses_1',
      directory: '/repo',
      role: 'all',
      all: true,
    });

    expect(client.message.list).toHaveBeenCalledTimes(2);
    expect(client.message.list.mock.calls[1][0]).toMatchObject({ sessionID: 'ses_1', cursor: 'cursor-page-2' });
    expect(result.messages.map((message) => message.id)).toEqual([
      'msg_old_user', 'msg_new_user', 'msg_new_assistant',
    ]);
  });

  it('pages a bounded read with the cursor alone until it has enough text messages', async () => {
    const { service, client } = createService();
    const page = (data, next) => ({ data, cursor: { next } });
    client.message.list.mockImplementation(async (input) => {
      if (!input.cursor) {
        return page([
          { id: 'msg_new_assistant', type: 'assistant', time: { created: 50, completed: 55 }, content: [{ type: 'text', text: 'Recent answer' }] },
          { id: 'msg_new_user', type: 'user', time: { created: 40 }, text: 'Recent question' },
        ], 'cursor-page-2');
      }
      if (input.cursor === 'cursor-page-2') {
        return page([
          { id: 'msg_mid_user', type: 'user', time: { created: 20 }, text: 'Earlier question' },
          { id: 'msg_old_user', type: 'user', time: { created: 10 }, text: 'First question' },
        ], 'cursor-page-3');
      }
      throw new Error(`unexpected cursor ${input.cursor}`);
    });

    const result = await service.execute('session.messages', {
      sessionId: 'ses_1',
      directory: '/repo',
      role: 'user',
      limit: 2,
    });

    expect(client.message.list).toHaveBeenCalledTimes(2);
    expect(client.message.list.mock.calls[0][0]).toMatchObject({ sessionID: 'ses_1', order: 'desc' });
    expect(client.message.list.mock.calls[1][0]).toMatchObject({ sessionID: 'ses_1', cursor: 'cursor-page-2' });
    expect(client.message.list.mock.calls[1][0]).not.toHaveProperty('order');
    expect(result.messages.map((message) => message.id)).toEqual(['msg_mid_user', 'msg_new_user']);
  });

  it('stops paging when the message cursor repeats or a page comes back empty', async () => {
    const { service, client } = createService();
    client.message.list.mockImplementation(async (input) => {
      if (!input.cursor) {
        return { data: [{ id: 'msg_new_user', type: 'user', time: { created: 20 }, text: 'Question' }], cursor: { next: 'cursor-loop' } };
      }
      return { data: [{ id: 'msg_old_user', type: 'user', time: { created: 10 }, text: 'Older question' }], cursor: { next: 'cursor-loop' } };
    });

    const looped = await service.execute('session.messages', { sessionId: 'ses_1', directory: '/repo', all: true });
    expect(client.message.list).toHaveBeenCalledTimes(2);
    expect(looped.messages.map((message) => message.id)).toEqual(['msg_old_user', 'msg_new_user']);

    client.message.list.mockReset();
    client.message.list.mockImplementation(async (input) => (input.cursor
      ? { data: [], cursor: { next: `${input.cursor}-next` } }
      : { data: [{ id: 'msg_user', type: 'user', time: { created: 10 }, text: 'Question' }], cursor: { next: 'cursor-empty' } }));

    const drained = await service.execute('session.messages', { sessionId: 'ses_1', directory: '/repo', all: true });
    expect(client.message.list).toHaveBeenCalledTimes(2);
    expect(drained.messages.map((message) => message.id)).toEqual(['msg_user']);
  });

  it('rejects actions outside the fixed contract', async () => {
    const { service } = createService();
    await expect(service.execute('session.delete')).rejects.toThrow('Unsupported OpenChamber action');
  });
});

describe('file.open', () => {
  it('hands the path, the session directory and the session to the file viewer', async () => {
    const request = vi.fn(async () => ({ path: '/repo/out.csv', size: 3, opened: true }));
    const { service } = createService({ fileOpen: { request } });

    const result = await service.execute('file.open', { path: 'out.csv' }, '/repo', { contextSessionId: 'ses_1' });

    expect(request).toHaveBeenCalledWith({ path: 'out.csv', directory: '/repo', sessionId: 'ses_1' });
    expect(result).toEqual({ path: '/repo/out.csv', size: 3, opened: true });
  });

  it('lets an explicit directory win over the session directory', async () => {
    const request = vi.fn(async () => ({ path: '/other/out.csv', size: 3, opened: true }));
    const { service } = createService({ fileOpen: { request } });

    await service.execute('file.open', { path: 'out.csv', directory: '/other' }, '/repo');

    expect(request).toHaveBeenCalledWith({ path: 'out.csv', directory: '/other', sessionId: null });
  });

  it('answers 503 when this server has no file viewer wired', async () => {
    const { service } = createService({});
    await expect(service.execute('file.open', { path: 'out.csv' }, '/repo')).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('notify.send', () => {
  it('sends the notice for the calling session and returns what was delivered', async () => {
    const notifyUser = vi.fn(async () => ({ status: 200, body: { delivered: true } }));
    const { service } = createService({ notifyUser });

    const result = await service.execute('notify.send', { title: 'Done', body: 'All green', showWhenFocused: true }, '/repo', { contextSessionId: 'ses_1' });

    expect(notifyUser).toHaveBeenCalledWith({ title: 'Done', body: 'All green', showWhenFocused: true, sessionId: 'ses_1', directory: '/repo' });
    expect(result).toEqual({ delivered: true });
  });

  it('turns a refused notice into an error the agent can read', async () => {
    const notifyUser = vi.fn(async () => ({ status: 429, retryAfter: 4, body: { error: 'too many notifications' } }));
    const { service } = createService({ notifyUser });

    await expect(service.execute('notify.send', { title: 'Done' }, '/repo'))
      .rejects.toMatchObject({ statusCode: 429, message: 'too many notifications' });
  });

  it('answers 503 when this server has no notifier wired', async () => {
    const { service } = createService({});
    await expect(service.execute('notify.send', { title: 'Done' }, '/repo')).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('usage.read', () => {
  const quota = {
    listUsagePageProviders: () => [{ providerId: 'claude', providerName: 'Claude' }],
    listConfiguredQuotaProviders: async () => ['claude'],
    fetchQuotaForProvider: async (providerId) => ({ providerId, providerName: 'Claude', ok: true, configured: true, usage: { windows: {} }, fetchedAt: 1 }),
  };

  it('reads the configured providers while the setting is on', async () => {
    const { service } = createService({
      readSettingsFromDiskMigrated: vi.fn(async () => ({ agentUsageToolEnabled: true })),
      loadQuota: async () => quota,
    });

    await expect(service.execute('usage.read', {}, '/repo')).resolves.toEqual({
      providers: [{ providerId: 'claude', providerName: 'Claude', ok: true, configured: true, usage: { windows: {} }, fetchedAt: 1 }],
      notConfigured: [],
    });
  });

  it('refuses while the setting is off', async () => {
    const { service } = createService({ loadQuota: async () => quota });
    await expect(service.execute('usage.read', {}, '/repo')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('answers 503 when this server cannot load the quota module', async () => {
    const { service } = createService({ readSettingsFromDiskMigrated: vi.fn(async () => ({ agentUsageToolEnabled: true })) });
    await expect(service.execute('usage.read', {}, '/repo')).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('terminal.read', () => {
  const runtime = {
    listTerminals: () => [{ sessionId: 'term-1', cwd: '/repo', status: 'running', createdAt: 1, mode: 'interactive', purpose: 'shell' }],
    readTerminal: (sessionId) => (sessionId === 'term-1' ? { sessionId, cwd: '/repo', status: 'running', exitCode: null, signal: null, createdAt: 1, mode: 'interactive', purpose: 'shell', text: 'ok\n', truncated: false, retainedBytes: 3 } : null),
  };

  it('lists and reads a terminal while the setting is on', async () => {
    const { service } = createService({
      readSettingsFromDiskMigrated: vi.fn(async () => ({ agentTerminalToolEnabled: true })),
      getTerminalRuntime: () => runtime,
    });

    await expect(service.execute('terminal.list', {}, '/repo')).resolves.toMatchObject({ terminals: [{ sessionId: 'term-1' }] });
    await expect(service.execute('terminal.read', { sessionId: 'term-1' }, '/repo')).resolves.toMatchObject({ sessionId: 'term-1', text: 'ok\n' });
  });

  it('refuses while the setting is off', async () => {
    const { service } = createService({ getTerminalRuntime: () => runtime });
    await expect(service.execute('terminal.read', { sessionId: 'term-1' }, '/repo')).rejects.toMatchObject({ statusCode: 403 });
  });

  it('answers 503 when this server has no terminal runtime', async () => {
    const { service } = createService({ readSettingsFromDiskMigrated: vi.fn(async () => ({ agentTerminalToolEnabled: true })) });
    await expect(service.execute('terminal.list', {}, '/repo')).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('render.page with answerLater', () => {
  const page = '<!doctype html><p>Hi</p>';
  const ask = { html: page, title: 'Pick a layout', answerLater: true };
  const call = { contextSessionId: 'ses_1', contextCallId: 'call_1' };

  const createLater = async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-control-later-'));
    const posts = [];
    const laterPages = createLaterPages({
      dataDir,
      buildOpenCodeUrl: (fetchPath) => `http://opencode${fetchPath}`,
      getOpenCodeAuthHeaders: () => ({}),
      fetchImpl: async (url, init) => {
        posts.push(JSON.parse(init.body));
        return { ok: true, status: 200, body: null };
      },
      warn: () => {},
    });
    return { laterPages, posts, dataDir };
  };

  it.each([
    ['answerLater', { answerLater: true }],
    ['awaitAnswer', { awaitAnswer: true }],
  ])('refuses %s in a session an agent started as its own work, and still shows a plain page', async (_label, wait) => {
    const { laterPages, dataDir } = await createLater();
    const { service, client } = createService({ laterPages });
    client.session.get.mockResolvedValue({ id: 'ses_1', metadata: { openchamber: { kind: 'operator-child', parentID: 'ses_operator' } } });

    await expect(service.execute('render.page', { html: page, title: 'Pick a layout', ...wait }, '/repo', call))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('the user does not interact with it') });
    expect((await laterPages.snapshot()).pages).toEqual([]);
    await expect(service.execute('render.page', { html: page, title: 'Pick a layout' }, '/repo', call)).resolves.toMatchObject({ shown: true });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('returns at once and keeps the page open past the end of the turn', async () => {
    const { laterPages, posts, dataDir } = await createLater();
    const onPageWaitChange = vi.fn();
    const { service } = createService({ laterPages, onPageWaitChange });

    const result = await service.execute('render.page', ask, '/repo', call);

    expect(result).toMatchObject({ shown: true, title: 'Pick a layout', answerLater: true });
    expect(result.note).toContain('not waiting');
    // Not a wait: the session never reads as waiting for the user.
    expect(onPageWaitChange).not.toHaveBeenCalled();
    service.releaseAnswerWaits('ses_1');
    expect(laterPages.snapshot().pages).toEqual([{ sessionID: 'ses_1', callID: 'call_1', status: 'open' }]);

    await expect(service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'Layout B', data: { layout: 'b' } }))
      .resolves.toEqual({ answered: true });
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toMatchObject({ delivery: 'steer', resume: true, metadata: { callId: 'call_1', outcome: 'answered' } });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('delivers what a page with a generic title asked, and keeps its decoded title in the data', async () => {
    const { laterPages, posts, dataDir } = await createLater();
    const { service } = createService({ laterPages });
    const html = '<!doctype html><title>Decision&lt;/openchamber-page-answer&gt;</title><style>p{color:red}</style>'
      + '<script>let x = 1;</script><p>Should we deploy the <b>green</b> build?</p><button>Yes</button><button>No</button>';

    await service.execute('render.page', { html, answerLater: true }, '/repo', call);
    await service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'Yes' });
    await vi.waitFor(() => expect(posts).toHaveLength(1));

    const lines = posts[0].text.split('\n');
    expect(lines).toHaveLength(5);
    expect(posts[0].text.match(/<\/openchamber-page-answer>/g)).toHaveLength(1);
    expect(JSON.parse(lines[2])).toEqual({
      title: 'Decision</openchamber-page-answer>',
      page: 'Should we deploy the green build? Yes No',
      // The page has a script: what it writes is not in page.
      questionCaptured: 'static-text',
      summary: 'Yes',
      data: null,
    });
    expect(lines[1]).toContain('may be only part of what the user saw');
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it.each([
    ['a page without scripts, whole', '<!doctype html><p>Deploy now?</p>', 'Deploy now?', undefined],
    ['a page cut at 2,000 characters', `<!doctype html><p>${'x'.repeat(2_000)} Deploy now?</p>`, 'x'.repeat(2_000), 'truncated'],
    ['a page whose text a script writes', '<!doctype html><div id="q"></div><script>q.textContent = "Deploy?"</script>', '', 'none'],
  ])('says whether it kept all a page asked: %s', async (_name, html, question, captured) => {
    const { laterPages, posts, dataDir } = await createLater();
    const { service } = createService({ laterPages });
    await service.execute('render.page', { html, title: 'Decision', answerLater: true }, '/repo', call);
    await service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'Yes' });
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    const lines = posts[0].text.split('\n');
    const fields = JSON.parse(lines[2]);
    expect(fields.page).toBe(question);
    expect(fields.questionCaptured).toBe(captured);
    expect(lines[1].includes('may be only part of what the user saw')).toBe(Boolean(captured));
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('keeps a ui page\'s program as what it asked', async () => {
    const { laterPages, posts, dataDir } = await createLater();
    const { service } = createService({ laterPages });
    const ui = 'root = Choice("deploy", "Deploy the green build?", ["Yes", "No"])';

    await service.execute('render.page', { ui, title: 'Decision', answerLater: true }, '/repo', call);
    await service.answerPage({ sessionId: 'ses_1', callId: 'call_1', declined: true });
    await vi.waitFor(() => expect(posts).toHaveLength(1));

    expect(JSON.parse(posts[0].text.split('\n')[2])).toEqual({ title: 'Decision', page: ui });
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it.each([
    [{ ...ask, awaitAnswer: true }, call, 400, 'not both'],
    [ask, {}, 400, 'cannot keep a page open'],
  ])('refuses %o', async (input, options, statusCode, reason) => {
    const { laterPages, dataDir } = await createLater();
    const { service } = createService({ laterPages });
    await expect(service.execute('render.page', input, '/repo', options))
      .rejects.toMatchObject({ statusCode, message: expect.stringContaining(reason) });
    expect(laterPages.snapshot().pages).toEqual([]);
    await fs.rm(dataDir, { recursive: true, force: true });
  });

  it('refuses on a server that cannot keep pages, as inside an isolated space, and says to ask in text', async () => {
    // index.js wires no laterPages inside a space.
    const { service } = createService({ laterPages: null });
    const refusal = await service.execute('render.page', ask, '/repo', call).catch((error) => error);
    expect(refusal).toMatchObject({ statusCode: 503, message: expect.stringContaining('ask in text') });
    expect(refusal.message).not.toContain('awaitAnswer');
  });
});

describe('render.page', () => {
  const page = '<!doctype html><p>Hi</p>';

  it('accepts a page with a title and tells the agent not to restate it', async () => {
    const { service } = createService();

    const result = await service.execute('render.page', { html: page, title: '  Coverage  ' }, '/repo');

    expect(result).toMatchObject({ shown: true, title: 'Coverage' });
    expect(result.note).toContain("Don't announce");
  });

  it('tells the agent which local images will not show and why', async () => {
    const { service } = createService();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-render-images-'));
>>>>>>> upstream/main
    try {
      const hub = {
        subscribeEvent: () => () => { },
        subscribeStatus: () => () => { },
        retainSession: async () => ({ release: async () => { } }),
      };
      const sentWakes = [];
      const sessionService = {
        open: async (sessionId) => ({ session: { sessionId, runtimeStatus: 'idle', workspaceId: 'workspace-1' } }),
        list: async () => ({ items: [] }),
        send: async (sessionId, payload, commandKey) => {
          sentWakes.push({ sessionId, payload, commandKey });
          return { ok: true };
        },
      };
      const broadcasts = [];
      const prWatchRuntime = createPrWatchRuntime({
        sessionService,
        broadcastUiEvent: (e) => broadcasts.push(e),
        dataDir,
        quietMs: 0,
      });
      prWatchRuntime.start(hub);

      let listener = () => { };
      const trackedItems = {
        setServerInterest: vi.fn(),
        subscribe: (l) => { listener = l; return () => { }; },
      };
      const readers = {
        sourceControl: vi.fn(async () => ({
          status: 'ok',
          pulls: [{
            owner: 'acme', repo: 'app', number: 42, state: 'open', title: 'Feature', headSha: 'c1',
            checks: { state: 'pending' }, activity: 1,
          }],
        })),
      };
      prWatchRuntime.attach({ trackedItems, readers });

      const { control } = createHarness(undefined, { prWatch: prWatchRuntime });

      const result = await control.execute('pr.watch', {
        url: 'https://github.com/acme/app/pull/42',
      }, '/repo/app', { contextSessionId: 'session-1' });

      expect(result.watching).toMatchObject({
        sessionID: 'session-1',
        number: 42,
        status: 'pending',
      });
      expect(broadcasts.some((b) => b.type === 'openchamber:pr-watch.updated' && b.properties.sessionID === 'session-1')).toBe(true);

      listener([{
        key: trackedItemKey(parsePullRequestUrl('https://github.com/acme/app/pull/42')),
        state: {
          owner: 'acme', repo: 'app', number: 42, state: 'open', title: 'Feature', headSha: 'c1',
          checks: { state: 'success' }, mergeableState: 'clean', activity: 1,
        },
        requestedAt: Date.now() + 10,
      }]);

      const deadline = Date.now() + 2000;
      while (sentWakes.length === 0 && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 10));
      }

      expect(sentWakes).toHaveLength(1);
      expect(sentWakes[0].sessionId).toBe('session-1');
      expect(sentWakes[0].payload.input.context[0].text).toContain('Pull request #42: every check passed');
      prWatchRuntime.stop();
      await prWatchRuntime.flush();
    } finally {
      await fs.rm(dataDir, { recursive: true, force: true });
    }
  });
<<<<<<< HEAD
||||||| bc50ba56aa

  it('names a page sent without a title after its own title or first heading', async () => {
    const { service } = createService();
    const named = (html) => service.execute('render.page', { html }, '/repo').then((result) => result.title);

    expect(await named('<html><head><title> Q3 &amp; Q4 </title></head><h1>Other</h1></html>')).toBe('Q3 & Q4');
    expect(await named('<title></title><div><h2>Release <b>2.4</b></h2></div>')).toBe('Release 2.4');
    expect(await named(`<h1>${'x'.repeat(200)}</h1>`)).toBe('x'.repeat(120));
    expect(await named(page)).toBe('Page');
  });

  it('asks for the page and its title in one call when the page is missing', async () => {
    const { service } = createService();
    await expect(service.execute('render.page', { title: 'Coverage' }, '/repo'))
      .rejects.toMatchObject({ message: expect.stringContaining('Send it and title together in one call') });
  });

  it('shows a ui program the way it shows html, named by its title', async () => {
    const { service } = createService();
    const result = await service.execute('render.page', { ui: 'root = Stack([Text("hi")])', title: 'Pick' }, '/repo');
    expect(result).toMatchObject({ shown: true, title: 'Pick' });
  });

  it.each([
    [{ title: 'Coverage' }, 'html or ui is required'],
    [{ html: '   ', title: 'Coverage' }, 'html or ui is required'],
    [{ html: page, ui: 'root = Stack([])', title: 'Coverage' }, 'not both'],
    [{ ui: 'x'.repeat(200_001), title: 'Coverage' }, 'ui is 200001 characters'],
    [{ html: 'x'.repeat(200_001), title: 'Coverage' }, 'the limit is 200000'],
    [{ html: page, title: 't'.repeat(121) }, 'the limit is 120'],
  ])('refuses %o with a reason the agent can act on', async (input, reason) => {
    const { service } = createService();
    await expect(service.execute('render.page', input, '/repo'))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining(reason) });
  });

  it('refuses while the tool is switched off, so a stale plugin cannot keep drawing', async () => {
    const { service } = createService({ isRenderToolEnabled: async () => false });
    await expect(service.execute('render.page', { html: page, title: 'Coverage' }, '/repo'))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  describe('with awaitAnswer', () => {
    const ask = { html: page, title: 'Pick a layout', awaitAnswer: true };
    const call = { contextSessionId: 'ses_1', contextCallId: 'call_1' };
    // The call starts waiting once its checks have run.
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    it('hands the agent the errors when a client cannot draw its ui', async () => {
      const { service } = createService();
      const pending = service.execute('render.page', { ui: 'root = Stack([Text(1)])', title: 'Pick', awaitAnswer: true }, '/repo', call);
      await settle();

      expect(service.answerPage({ sessionId: 'ses_1', callId: 'call_1', notDrawn: ['Text /markdown: expects string'] })).toEqual({ answered: false });
      const result = await pending;

      expect(result).toMatchObject({ answer: { answered: false, reason: 'ui-not-drawn' } });
      expect(result.note).toContain('Text /markdown: expects string');
    });

    it('waits until the user answers and returns the answer', async () => {
      const { service } = createService();
      const pending = service.execute('render.page', ask, '/repo', call);
      await settle();

      expect(service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: ' Layout B ', data: { layout: 'b' } })).toEqual({ answered: true });
      const result = await pending;

      expect(result).toMatchObject({ title: 'Pick a layout', answer: { answered: true, summary: 'Layout B', data: { layout: 'b' } } });
      expect(result.note).toContain('answered on the page');
    });

    it('stops listing a page once its session turn ended, without ending the call', async () => {
      const onPageWaitChange = vi.fn();
      const { service } = createService({ onPageWaitChange });
      const controller = new AbortController();
      const settled = vi.fn();
      const pending = service.execute('render.page', ask, '/repo', { ...call, signal: controller.signal });
      pending.then(settled, settled);
      const other = service.execute('render.page', ask, '/repo', { ...call, contextSessionId: 'ses_2' });
      await settle();

      service.releaseAnswerWaits('ses_1');
      await settle();

      expect(onPageWaitChange).toHaveBeenCalledWith({ type: 'settled', sessionId: 'ses_1', callId: 'call_1' });
      expect(onPageWaitChange).not.toHaveBeenCalledWith({ type: 'settled', sessionId: 'ses_2', callId: 'call_1' });
      expect(settled).not.toHaveBeenCalled();
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' })).toThrow('no longer waiting');

      // The request's end still ends the call, and says nothing twice.
      const announced = onPageWaitChange.mock.calls.length;
      controller.abort();
      await expect(pending).rejects.toThrow('stopped waiting');
      expect(onPageWaitChange).toHaveBeenCalledTimes(announced);

      service.answerPage({ sessionId: 'ses_2', callId: 'call_1', summary: 'B' });
      await other;
    });

    it('ends without an answer when the user declines, and tells the agent not to choose for them', async () => {
      const { service } = createService();
      const pending = service.execute('render.page', ask, '/repo', call);
      await settle();

      expect(service.answerPage({ sessionId: 'ses_1', callId: 'call_1', declined: true })).toEqual({ answered: false });
      const result = await pending;

      expect(result).toMatchObject({ title: 'Pick a layout', answer: { answered: false, reason: 'declined' } });
      expect(result.note).toContain('declined');
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', declined: true })).toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    it('announces when the page starts and stops waiting', async () => {
      const onPageWaitChange = vi.fn();
      const { service } = createService({ onPageWaitChange });
      const pending = service.execute('render.page', ask, '/repo', call);
      await settle();

      expect(onPageWaitChange).toHaveBeenCalledWith({ type: 'waiting', sessionId: 'ses_1', callId: 'call_1', title: 'Pick a layout', directory: '/repo' });
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' });
      await pending;
      expect(onPageWaitChange).toHaveBeenLastCalledWith({ type: 'settled', sessionId: 'ses_1', callId: 'call_1' });

      const controller = new AbortController();
      const aborted = service.execute('render.page', ask, '/repo', { ...call, signal: controller.signal });
      await settle();
      controller.abort();
      await expect(aborted).rejects.toBeTruthy();
      expect(onPageWaitChange).toHaveBeenLastCalledWith({ type: 'settled', sessionId: 'ses_1', callId: 'call_1' });
    });

    it('answers once: a second answer, or one for another call, finds nothing waiting', async () => {
      const { service } = createService();
      const pending = service.execute('render.page', ask, '/repo', call);
      await settle();

      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_2', summary: 'B' })).toThrow(expect.objectContaining({ statusCode: 404 }));
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' });
      await expect(pending).resolves.toMatchObject({ answer: { data: null } });
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' })).toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    it('stops waiting when the call is aborted, and the page no longer takes an answer', async () => {
      const { service } = createService();
      const controller = new AbortController();
      const pending = service.execute('render.page', ask, '/repo', { ...call, signal: controller.signal });
      await settle();

      controller.abort();

      await expect(pending).rejects.toMatchObject({ message: expect.stringContaining('stopped waiting') });
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' })).toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    it.each([
      [{ summary: '' }, 400],
      [{ summary: 's'.repeat(501) }, 400],
      [{ summary: 'B', data: 'x'.repeat(16_001) }, 413],
      [{ sessionId: '', summary: 'B' }, 400],
    ])('refuses the answer %o and keeps waiting', async (answer, statusCode) => {
      const { service } = createService();
      const pending = service.execute('render.page', ask, '/repo', call);
      await settle();

      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', ...answer })).toThrow(expect.objectContaining({ statusCode }));
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' });
      await expect(pending).resolves.toMatchObject({ answer: { summary: 'B' } });
    });

    it('does not wait when the user wrote in the chat before the page appeared', async () => {
      const onPageWaitChange = vi.fn();
      const { service, client } = createService({ onPageWaitChange });
      client.session.inbox.list.mockResolvedValue([
        { id: 'msg_2', sessionID: 'ses_1', type: 'user', delivery: 'steer', payload: { text: 'draw it' }, time: { created: 1 } },
      ]);

      const result = await service.execute('render.page', ask, '/repo', call);

      expect(client.session.inbox.list).toHaveBeenCalledWith({ sessionID: 'ses_1' });
      expect(result).toMatchObject({ title: 'Pick a layout', answer: { answered: false, reason: 'chat-sent-earlier' } });
      expect(result.note).toContain('not an answer to it');
      expect(onPageWaitChange).not.toHaveBeenCalled();
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' })).toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    it('waits when only a synthetic or queued message is pending, or the inbox cannot be read', async () => {
      const { service, client } = createService();
      client.session.inbox.list.mockResolvedValueOnce([
        { id: 'msg_2', sessionID: 'ses_1', type: 'synthetic', delivery: 'steer', payload: { text: 'subagent finished' }, time: { created: 1 } },
        { id: 'msg_3', sessionID: 'ses_1', type: 'user', delivery: 'queue', payload: { text: 'after this turn' }, time: { created: 2 } },
      ]);
      const pending = service.execute('render.page', ask, '/repo', call);
      await settle();
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' });
      await expect(pending).resolves.toMatchObject({ answer: { answered: true, summary: 'B' } });

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      client.session.inbox.list.mockRejectedValueOnce(new Error('OpenCode is down'));
      const failedRead = service.execute('render.page', ask, '/repo', call);
      await settle();
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'A' });
      await expect(failedRead).resolves.toMatchObject({ answer: { answered: true, summary: 'A' } });
      warn.mockRestore();
    });

    it('refuses to wait without a call id, so an older plugin falls back to asking in text', async () => {
      const { service } = createService();
      await expect(service.execute('render.page', ask, '/repo', { contextSessionId: 'ses_1' }))
        .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('without awaitAnswer') });
    });
  });
});

describe('browser capture', () => {
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const createBrowserService = async (capture) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-capture-'));
    const request = vi.fn(async () => capture);
    const { service } = createService({ browserControl: { request } });
    return { service, directory, request };
  };

  it('saves the image beside the code and hands back a path the answer can use', async () => {
    const { service, directory } = await createBrowserService({
      base64: pixel,
      mime: 'image/png',
      url: 'http://localhost:3000/',
      title: 'App',
      viewport: { mode: 'mobile', width: 390, height: 844 },
      width: 390,
      height: 844,
    });

    const result = await service.execute('browser.capture', { label: 'After fix' }, directory);

    expect(result.path.startsWith('.openchamber/screenshots/after-fix-')).toBe(true);
    expect(result.path.endsWith('.png')).toBe(true);
    expect(result.url).toBe('http://localhost:3000/');
    expect(result.viewport).toEqual({ mode: 'mobile', width: 390, height: 844 });
    // The bytes stay on disk; a tool result is not a place to carry an image.
    expect('base64' in result).toBe(false);
    const written = await fs.readFile(path.join(directory, result.path));
    expect(written.length > 0).toBe(true);
  });

  it('tells the agent how to actually show the image', async () => {
    const { service, directory } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    const result = await service.execute('browser.capture', {}, directory);
    expect(result.hint).toContain(`![](${result.path})`);
  });

  it('refuses to capture with no project to save into', async () => {
    const { service } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    await expect(service.execute('browser.capture', {})).rejects.toThrow(/directory is required/);
  });

  it('passes the tab the agent named to the browser', async () => {
    const { service, directory, request } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    await service.execute('browser.capture', { tabId: ' tab-2 ' }, directory);
    expect(request).toHaveBeenCalledWith('browser.capture', { tabId: 'tab-2' }, expect.anything());
  });

  it('passes a label through to the browser and leaves other actions untouched', async () => {
    const { service, directory, request } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    await service.execute('browser.capture', { label: 'before' }, directory);
    expect(request).toHaveBeenCalledWith('browser.capture', { label: 'before' }, expect.anything());
  });

  it('tells the browser which project and chat the action came from', async () => {
    const { service, directory, request } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    await service.execute('browser.capture', {}, directory, { contextSessionId: 'ses_1' });
    expect(request).toHaveBeenCalledWith('browser.capture', {}, expect.objectContaining({
      context: { directory, sessionId: 'ses_1' },
    }));
    await service.execute('browser.capture', {}, directory);
    expect(request).toHaveBeenLastCalledWith('browser.capture', {}, expect.objectContaining({
      context: { directory, sessionId: null },
    }));
  });
});

describe('browser close', () => {
  const createCloseService = () => {
    const request = vi.fn(async () => ({ closed: true, tabId: 'tab-1' }));
    const { service } = createService({ browserControl: { request } });
    return { service, request };
  };

  it('forwards the tab the agent named, trimmed', async () => {
    const { service, request } = createCloseService();
    const result = await service.execute('browser.close', { tabId: ' tab-1 ' }, '/repo');
    expect(request).toHaveBeenCalledWith('browser.close', { tabId: 'tab-1' }, expect.anything());
    expect(result).toEqual({ closed: true, tabId: 'tab-1' });
  });

  it('forwards a close with no tab, so the browser closes the session\'s own', async () => {
    const { service, request } = createCloseService();
    await service.execute('browser.close', {}, '/repo');
    expect(request).toHaveBeenCalledWith('browser.close', {}, expect.anything());
  });
});

describe('browser select', () => {
  it('passes exactly one selection criterion to the browser', async () => {
    const request = vi.fn(async (_action, parameters) => ({
      selector: parameters.selector,
      label: parameters.label ?? 'Canada',
      value: parameters.value ?? 'ca',
      url: 'https://example.test/',
    }));
    const { service } = createService({ browserControl: { request } });

    await expect(service.execute('browser.select', {
      selector: ' #country ',
      label: 'Canada',
      tabId: ' tab-1 ',
    }, '/repo')).resolves.toEqual({
      selector: '#country',
      label: 'Canada',
      value: 'ca',
      url: 'https://example.test/',
    });
    expect(request).toHaveBeenCalledWith('browser.select', {
      selector: '#country',
      label: 'Canada',
      tabId: 'tab-1',
    }, expect.anything());

    await service.execute('browser.select', { selector: '#country', value: '' }, '/repo');
    expect(request).toHaveBeenLastCalledWith('browser.select', {
      selector: '#country',
      value: '',
    }, expect.anything());
  });

  it.each([
    [{ label: 'Canada' }, 'selector is required for browser.select'],
    [{ selector: '  ', label: 'Canada' }, 'selector is required for browser.select'],
    [{ selector: '#country' }, 'browser.select requires exactly one of label or value'],
    [{ selector: '#country', label: 'Canada', value: 'ca' }, 'browser.select requires exactly one of label or value'],
    [{ selector: '#country', label: 42 }, 'browser.select requires exactly one of label or value'],
  ])('rejects invalid selection input before contacting the browser', async (input, message) => {
    const request = vi.fn(async () => ({ ok: true }));
    const { service } = createService({ browserControl: { request } });

    await expect(service.execute('browser.select', input, '/repo')).rejects.toThrow(message);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('returning a dispatched session result', () => {
  const createReturningService = (overrides = {}) => {
    const dispatchResults = { register: vi.fn(async () => ({ id: 'dispatch-1' })) };
    const created = createService({ dispatchResults, now: () => 1_000, ...overrides });
    created.sessionService.create.mockResolvedValue({ sessionId: 'ses_child', directory: '/repo', promptDispatched: true });
    created.sessionService.send.mockResolvedValue({ sessionId: 'ses_child', directory: '/repo', promptDispatched: true, baselineAssistantMessageId: 'msg_old' });
    return { ...created, dispatchResults };
  };

  it('returns at once and registers the delivery to the calling session', async () => {
    const { service, dispatchResults, client } = createReturningService();
    const result = await service.execute('session.create', { prompt: 'Check the build', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' });

    expect(dispatchResults.register).toHaveBeenCalledWith({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 1_000 });
    expect(result.resultDelivery).toEqual({ status: 'pending', note: expect.stringContaining('delivered to you automatically') });
    expect(result.resultDelivery.note).toContain('Do not poll');
    // Nothing waits: no status or message reads happen for the dispatch.
    expect(client.session.active).not.toHaveBeenCalled();
  });

  it('hands the end-of-run baseline to the delivery and keeps it from the agent', async () => {
    const { service, dispatchResults, sessionService } = createReturningService();
    sessionService.send.mockResolvedValue({ sessionId: 'ses_child', directory: '/repo', promptDispatched: true, baselineIdleRecordId: 'msg_idle_old' });
    const result = await service.execute('session.send', { sessionId: 'ses_child', prompt: 'Again', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' });

    expect(dispatchResults.register).toHaveBeenCalledWith({
      parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 1_000, afterIdleId: 'msg_idle_old',
    });
    expect(result).not.toHaveProperty('baselineIdleRecordId');
  });

  it('does not schedule a delivery for a prompt that never landed', async () => {
    const { service, dispatchResults, sessionService } = createReturningService();
    sessionService.create.mockResolvedValue({ sessionId: 'ses_child', directory: '/repo', promptDispatched: false, promptError: 'no queued message' });
    const result = await service.execute('session.create', { prompt: 'Check', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' });

    expect(dispatchResults.register).not.toHaveBeenCalled();
    expect(result.resultDelivery.status).toBe('not-scheduled');
  });

  it('reports a failed registration instead of claiming the result is coming', async () => {
    const { service, dispatchResults } = createReturningService();
    dispatchResults.register.mockRejectedValue(new Error('disk full'));
    const result = await service.execute('session.send', { sessionId: 'ses_child', prompt: 'Again', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' });

    expect(result.resultDelivery).toEqual({ status: 'not-scheduled', reason: expect.stringContaining('disk full') });
    expect(result).not.toHaveProperty('baselineAssistantMessageId');
  });

  it.each([
    ['without a calling session', { prompt: 'x', returnResult: true }, {}, 'needs a calling session'],
    ['without a prompt', { returnResult: true }, { contextSessionId: 'ses_parent' }, 'returnResult requires prompt'],
    ['combined with wait', { prompt: 'x', returnResult: true, wait: true }, { contextSessionId: 'ses_parent' }, 'cannot be combined with wait'],
  ])('refuses returnResult %s before creating anything', async (_label, input, options, message) => {
    const { service, sessionService } = createReturningService();
    await expect(service.execute('session.create', input, '/repo', options)).rejects.toThrow(message);
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it('refuses to deliver a session\'s result to itself', async () => {
    const { service, sessionService } = createReturningService();
    await expect(service.execute('session.send', { sessionId: 'ses_parent', prompt: 'x', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' }))
      .rejects.toThrow('to itself');
    expect(sessionService.send).not.toHaveBeenCalled();
  });

  it('answers 503 on a server that cannot deliver results', async () => {
    const { service, sessionService } = createService();
    await expect(service.execute('session.create', { prompt: 'x', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' }))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it('refuses a returnResult that is not a boolean instead of silently skipping delivery', async () => {
    const { service, sessionService, dispatchResults } = createReturningService();
    await expect(service.execute('session.create', { prompt: 'x', returnResult: 'true' }, '/repo', { contextSessionId: 'ses_parent' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('returnResult must be a boolean') });
    expect(sessionService.create).not.toHaveBeenCalled();
    expect(dispatchResults.register).not.toHaveBeenCalled();
  });

  it('accepts an explicit false returnResult as the plain dispatch path', async () => {
    const { service, sessionService, dispatchResults } = createReturningService();
    const result = await service.execute('session.create', { prompt: 'x', returnResult: false }, '/repo', { contextSessionId: 'ses_parent' });
    expect(sessionService.create).toHaveBeenCalled();
    expect(result).not.toHaveProperty('resultDelivery');
    expect(dispatchResults.register).not.toHaveBeenCalled();
  });

  it('refuses a wait that is not a boolean', async () => {
    const { service, sessionService } = createService();
    await expect(service.execute('session.send', { sessionId: 'ses_1', prompt: 'x', wait: 'true' }, '/repo'))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('wait must be a boolean') });
    expect(sessionService.send).not.toHaveBeenCalled();
  });
=======

  it('names a page sent without a title after its own title or first heading', async () => {
    const { service } = createService();
    const named = (html) => service.execute('render.page', { html }, '/repo').then((result) => result.title);

    expect(await named('<html><head><title> Q3 &amp; Q4 </title></head><h1>Other</h1></html>')).toBe('Q3 & Q4');
    expect(await named('<title></title><div><h2>Release <b>2.4</b></h2></div>')).toBe('Release 2.4');
    expect(await named(`<h1>${'x'.repeat(200)}</h1>`)).toBe('x'.repeat(120));
    expect(await named(page)).toBe('Page');
  });

  it('asks for the page and its title in one call when the page is missing', async () => {
    const { service } = createService();
    await expect(service.execute('render.page', { title: 'Coverage' }, '/repo'))
      .rejects.toMatchObject({ message: expect.stringContaining('Send it and title together in one call') });
  });

  it('shows a ui program the way it shows html, named by its title', async () => {
    const { service } = createService();
    const result = await service.execute('render.page', { ui: 'root = Stack([Text("hi")])', title: 'Pick' }, '/repo');
    expect(result).toMatchObject({ shown: true, title: 'Pick' });
  });

  it.each([
    [{ title: 'Coverage' }, 'html or ui is required'],
    [{ html: '   ', title: 'Coverage' }, 'html or ui is required'],
    [{ html: page, ui: 'root = Stack([])', title: 'Coverage' }, 'not both'],
    [{ ui: 'x'.repeat(200_001), title: 'Coverage' }, 'ui is 200001 characters'],
    [{ html: 'x'.repeat(200_001), title: 'Coverage' }, 'the limit is 200000'],
    [{ html: page, title: 't'.repeat(121) }, 'the limit is 120'],
  ])('refuses %o with a reason the agent can act on', async (input, reason) => {
    const { service } = createService();
    await expect(service.execute('render.page', input, '/repo'))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining(reason) });
  });

  it('refuses while the tool is switched off, so a stale plugin cannot keep drawing', async () => {
    const { service } = createService({ isRenderToolEnabled: async () => false });
    await expect(service.execute('render.page', { html: page, title: 'Coverage' }, '/repo'))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  describe('with awaitAnswer', () => {
    const ask = { html: page, title: 'Pick a layout', awaitAnswer: true };
    const call = { contextSessionId: 'ses_1', contextCallId: 'call_1' };
    const createWaitingService = (overrides = {}) => {
      const waiting = [];
      const listeners = [];
      const result = createService({
        ...overrides,
        onPageWaitChange: (change) => {
          overrides.onPageWaitChange?.(change);
          if (change.type !== 'waiting') return;
          const listener = listeners.shift();
          if (listener) listener(change);
          else waiting.push(change);
        },
      });
      return {
        ...result,
        waitForPage: () => waiting.length ? Promise.resolve(waiting.shift()) : new Promise((resolve) => listeners.push(resolve)),
      };
    };

    it('hands the agent the errors when a client cannot draw its ui', async () => {
      const { service, waitForPage } = createWaitingService();
      const pending = service.execute('render.page', { ui: 'root = Stack([Text(1)])', title: 'Pick', awaitAnswer: true }, '/repo', call);
      await waitForPage();

      expect(service.answerPage({ sessionId: 'ses_1', callId: 'call_1', notDrawn: ['Text /markdown: expects string'] })).toEqual({ answered: false });
      const result = await pending;

      expect(result).toMatchObject({ answer: { answered: false, reason: 'ui-not-drawn' } });
      expect(result.note).toContain('Text /markdown: expects string');
    });

    it('waits until the user answers and returns the answer', async () => {
      const { service, waitForPage } = createWaitingService();
      const pending = service.execute('render.page', ask, '/repo', call);
      await waitForPage();

      expect(service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: ' Layout B ', data: { layout: 'b' } })).toEqual({ answered: true });
      const result = await pending;

      expect(result).toMatchObject({ title: 'Pick a layout', answer: { answered: true, summary: 'Layout B', data: { layout: 'b' } } });
      expect(result.note).toContain('answered on the page');
    });

    it('stops listing a page once its session turn ended, without ending the call', async () => {
      const onPageWaitChange = vi.fn();
      const { service, waitForPage } = createWaitingService({ onPageWaitChange });
      const controller = new AbortController();
      const settled = vi.fn();
      const pending = service.execute('render.page', ask, '/repo', { ...call, signal: controller.signal });
      pending.then(settled, settled);
      const other = service.execute('render.page', ask, '/repo', { ...call, contextSessionId: 'ses_2' });
      await waitForPage();
      await waitForPage();

      service.releaseAnswerWaits('ses_1');

      expect(onPageWaitChange).toHaveBeenCalledWith({ type: 'settled', sessionId: 'ses_1', callId: 'call_1' });
      expect(onPageWaitChange).not.toHaveBeenCalledWith({ type: 'settled', sessionId: 'ses_2', callId: 'call_1' });
      // A later answer on the same registry is a completion barrier for release.
      service.answerPage({ sessionId: 'ses_2', callId: 'call_1', summary: 'B' });
      await other;
      expect(settled).not.toHaveBeenCalled();
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' })).toThrow('no longer waiting');

      // The request's end still ends the call, and says nothing twice.
      const announced = onPageWaitChange.mock.calls.length;
      controller.abort();
      await expect(pending).rejects.toThrow('stopped waiting');
      expect(onPageWaitChange).toHaveBeenCalledTimes(announced);

    });

    it('ends without an answer when the user declines, and tells the agent not to choose for them', async () => {
      const { service, waitForPage } = createWaitingService();
      const pending = service.execute('render.page', ask, '/repo', call);
      await waitForPage();

      expect(service.answerPage({ sessionId: 'ses_1', callId: 'call_1', declined: true })).toEqual({ answered: false });
      const result = await pending;

      expect(result).toMatchObject({ title: 'Pick a layout', answer: { answered: false, reason: 'declined' } });
      expect(result.note).toContain('declined');
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', declined: true })).toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    it('announces when the page starts and stops waiting', async () => {
      const onPageWaitChange = vi.fn();
      const { service, waitForPage } = createWaitingService({ onPageWaitChange });
      const pending = service.execute('render.page', ask, '/repo', call);
      await waitForPage();

      expect(onPageWaitChange).toHaveBeenCalledWith({ type: 'waiting', sessionId: 'ses_1', callId: 'call_1', title: 'Pick a layout', directory: '/repo' });
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' });
      await pending;
      expect(onPageWaitChange).toHaveBeenLastCalledWith({ type: 'settled', sessionId: 'ses_1', callId: 'call_1' });

      const controller = new AbortController();
      const aborted = service.execute('render.page', ask, '/repo', { ...call, signal: controller.signal });
      await waitForPage();
      controller.abort();
      await expect(aborted).rejects.toBeTruthy();
      expect(onPageWaitChange).toHaveBeenLastCalledWith({ type: 'settled', sessionId: 'ses_1', callId: 'call_1' });
    });

    it('answers once: a second answer, or one for another call, finds nothing waiting', async () => {
      const { service, waitForPage } = createWaitingService();
      const pending = service.execute('render.page', ask, '/repo', call);
      await waitForPage();

      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_2', summary: 'B' })).toThrow(expect.objectContaining({ statusCode: 404 }));
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' });
      await expect(pending).resolves.toMatchObject({ answer: { data: null } });
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' })).toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    it('stops waiting when the call is aborted, and the page no longer takes an answer', async () => {
      const { service, waitForPage } = createWaitingService();
      const controller = new AbortController();
      const pending = service.execute('render.page', ask, '/repo', { ...call, signal: controller.signal });
      await waitForPage();

      controller.abort();

      await expect(pending).rejects.toMatchObject({ message: expect.stringContaining('stopped waiting') });
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' })).toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    it.each([
      [{ summary: '' }, 400],
      [{ summary: 's'.repeat(501) }, 400],
      [{ summary: 'B', data: 'x'.repeat(16_001) }, 413],
      [{ sessionId: '', summary: 'B' }, 400],
    ])('refuses the answer %o and keeps waiting', async (answer, statusCode) => {
      const { service, waitForPage } = createWaitingService();
      const pending = service.execute('render.page', ask, '/repo', call);
      await waitForPage();

      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', ...answer })).toThrow(expect.objectContaining({ statusCode }));
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' });
      await expect(pending).resolves.toMatchObject({ answer: { summary: 'B' } });
    });

    it('does not wait when the user wrote in the chat before the page appeared', async () => {
      const onPageWaitChange = vi.fn();
      const { service, client } = createService({ onPageWaitChange });
      client.session.inbox.list.mockResolvedValue([
        { id: 'msg_2', sessionID: 'ses_1', type: 'user', delivery: 'steer', payload: { text: 'draw it' }, time: { created: 1 } },
      ]);

      const result = await service.execute('render.page', ask, '/repo', call);

      expect(client.session.inbox.list).toHaveBeenCalledWith({ sessionID: 'ses_1' });
      expect(result).toMatchObject({ title: 'Pick a layout', answer: { answered: false, reason: 'chat-sent-earlier' } });
      expect(result.note).toContain('not an answer to it');
      expect(onPageWaitChange).not.toHaveBeenCalled();
      expect(() => service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' })).toThrow(expect.objectContaining({ statusCode: 404 }));
    });

    it('waits when only a synthetic, queued or agent-sent message is pending, or the inbox cannot be read', async () => {
      const { service, client, waitForPage } = createWaitingService();
      client.session.inbox.list.mockResolvedValueOnce([
        { id: 'msg_2', sessionID: 'ses_1', type: 'synthetic', delivery: 'steer', payload: { text: 'subagent finished' }, time: { created: 1 } },
        { id: 'msg_3', sessionID: 'ses_1', type: 'user', delivery: 'queue', payload: { text: 'after this turn' }, time: { created: 2 } },
        { id: 'msg_4', sessionID: 'ses_1', type: 'user', delivery: 'steer', payload: { text: 'build 42 finished', metadata: { openchamber: { promptedBy: { sessionID: 'ses_helper' } } } }, time: { created: 3 } },
        { id: 'msg_5', sessionID: 'ses_1', type: 'user', delivery: 'steer', payload: { text: 'from afar', metadata: { openchamber: { promptedBy: { sessionID: 'remote-host/opencode/session:ses_x' } } } }, time: { created: 4 } },
        { id: 'msg_6', sessionID: 'ses_1', type: 'user', delivery: 'steer', payload: { text: 'nightly check', metadata: { schedule: { id: 'sch_1', run: 1, dueAt: 1, late: false } } }, time: { created: 5 } },
      ]);
      const pending = service.execute('render.page', ask, '/repo', call);
      await waitForPage();
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'B' });
      await expect(pending).resolves.toMatchObject({ answer: { answered: true, summary: 'B' } });

      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      client.session.inbox.list.mockRejectedValueOnce(new Error('OpenCode is down'));
      const failedRead = service.execute('render.page', ask, '/repo', call);
      await waitForPage();
      service.answerPage({ sessionId: 'ses_1', callId: 'call_1', summary: 'A' });
      await expect(failedRead).resolves.toMatchObject({ answer: { answered: true, summary: 'A' } });
      warn.mockRestore();
    });

    it('refuses to wait without a call id, so an older plugin falls back to asking in text', async () => {
      const { service } = createService();
      await expect(service.execute('render.page', ask, '/repo', { contextSessionId: 'ses_1' }))
        .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('without awaitAnswer') });
    });
  });
});

describe('browser capture', () => {
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const createBrowserService = async (capture) => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-capture-'));
    const request = vi.fn(async () => capture);
    const { service } = createService({ browserControl: { request } });
    return { service, directory, request };
  };

  it('saves the image beside the code and hands back a path the answer can use', async () => {
    const { service, directory } = await createBrowserService({
      base64: pixel,
      mime: 'image/png',
      url: 'http://localhost:3000/',
      title: 'App',
      viewport: { mode: 'mobile', width: 390, height: 844 },
      width: 390,
      height: 844,
    });

    const result = await service.execute('browser.capture', { label: 'After fix' }, directory);

    expect(result.path.startsWith('.openchamber/screenshots/after-fix-')).toBe(true);
    expect(result.path.endsWith('.png')).toBe(true);
    expect(result.url).toBe('http://localhost:3000/');
    expect(result.viewport).toEqual({ mode: 'mobile', width: 390, height: 844 });
    // The bytes stay on disk; a tool result is not a place to carry an image.
    expect('base64' in result).toBe(false);
    const written = await fs.readFile(path.join(directory, result.path));
    expect(written.length > 0).toBe(true);
  });

  it('tells the agent how to actually show the image', async () => {
    const { service, directory } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    const result = await service.execute('browser.capture', {}, directory);
    expect(result.hint).toContain(`![](${result.path})`);
  });

  it('refuses to capture with no project to save into', async () => {
    const { service } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    await expect(service.execute('browser.capture', {})).rejects.toThrow(/directory is required/);
  });

  it('passes the tab the agent named to the browser', async () => {
    const { service, directory, request } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    await service.execute('browser.capture', { tabId: ' tab-2 ' }, directory);
    expect(request).toHaveBeenCalledWith('browser.capture', { tabId: 'tab-2' }, expect.anything());
  });

  it('passes a label through to the browser and leaves other actions untouched', async () => {
    const { service, directory, request } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    await service.execute('browser.capture', { label: 'before' }, directory);
    expect(request).toHaveBeenCalledWith('browser.capture', { label: 'before' }, expect.anything());
  });

  it('tells the browser which project and chat the action came from', async () => {
    const { service, directory, request } = await createBrowserService({ base64: pixel, mime: 'image/png' });
    await service.execute('browser.capture', {}, directory, { contextSessionId: 'ses_1' });
    expect(request).toHaveBeenCalledWith('browser.capture', {}, expect.objectContaining({
      context: { directory, sessionId: 'ses_1' },
    }));
    await service.execute('browser.capture', {}, directory);
    expect(request).toHaveBeenLastCalledWith('browser.capture', {}, expect.objectContaining({
      context: { directory, sessionId: null },
    }));
  });
});

describe('browser close', () => {
  const createCloseService = () => {
    const request = vi.fn(async () => ({ closed: true, tabId: 'tab-1' }));
    const { service } = createService({ browserControl: { request } });
    return { service, request };
  };

  it('forwards the tab the agent named, trimmed', async () => {
    const { service, request } = createCloseService();
    const result = await service.execute('browser.close', { tabId: ' tab-1 ' }, '/repo');
    expect(request).toHaveBeenCalledWith('browser.close', { tabId: 'tab-1' }, expect.anything());
    expect(result).toEqual({ closed: true, tabId: 'tab-1' });
  });

  it('forwards a close with no tab, so the browser closes the session\'s own', async () => {
    const { service, request } = createCloseService();
    await service.execute('browser.close', {}, '/repo');
    expect(request).toHaveBeenCalledWith('browser.close', {}, expect.anything());
  });
});

describe('browser select', () => {
  it('passes exactly one selection criterion to the browser', async () => {
    const request = vi.fn(async (_action, parameters) => ({
      selector: parameters.selector,
      label: parameters.label ?? 'Canada',
      value: parameters.value ?? 'ca',
      url: 'https://example.test/',
    }));
    const { service } = createService({ browserControl: { request } });

    await expect(service.execute('browser.select', {
      selector: ' #country ',
      label: 'Canada',
      tabId: ' tab-1 ',
    }, '/repo')).resolves.toEqual({
      selector: '#country',
      label: 'Canada',
      value: 'ca',
      url: 'https://example.test/',
    });
    expect(request).toHaveBeenCalledWith('browser.select', {
      selector: '#country',
      label: 'Canada',
      tabId: 'tab-1',
    }, expect.anything());

    await service.execute('browser.select', { selector: '#country', value: '' }, '/repo');
    expect(request).toHaveBeenLastCalledWith('browser.select', {
      selector: '#country',
      value: '',
    }, expect.anything());
  });

  it.each([
    [{ label: 'Canada' }, 'browser.select requires ref or selector'],
    [{ selector: '  ', label: 'Canada' }, 'browser.select requires ref or selector'],
    [{ ref: 'button', label: 'Canada' }, 'ref must be a ref from browser.snapshot'],
    [{ selector: '#country' }, 'browser.select requires exactly one of label or value'],
    [{ selector: '#country', label: 'Canada', value: 'ca' }, 'browser.select requires exactly one of label or value'],
    [{ selector: '#country', label: 42 }, 'browser.select requires exactly one of label or value'],
  ])('rejects invalid selection input before contacting the browser', async (input, message) => {
    const request = vi.fn(async () => ({ ok: true }));
    const { service } = createService({ browserControl: { request } });

    await expect(service.execute('browser.select', input, '/repo')).rejects.toThrow(message);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('returning a dispatched session result', () => {
  const createReturningService = (overrides = {}) => {
    const dispatchResults = { register: vi.fn(async () => ({ id: 'dispatch-1' })) };
    const created = createService({ dispatchResults, now: () => 1_000, ...overrides });
    created.sessionService.create.mockResolvedValue({ sessionId: 'ses_child', directory: '/repo', promptDispatched: true });
    created.sessionService.send.mockResolvedValue({ sessionId: 'ses_child', directory: '/repo', promptDispatched: true, baselineAssistantMessageId: 'msg_old' });
    return { ...created, dispatchResults };
  };

  it('returns at once and registers the delivery to the calling session', async () => {
    const { service, dispatchResults, client } = createReturningService();
    const result = await service.execute('session.create', { prompt: 'Check the build', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' });

    expect(dispatchResults.register).toHaveBeenCalledWith({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 1_000 });
    expect(result.resultDelivery).toEqual({ status: 'pending', note: expect.stringContaining('delivered to you automatically') });
    expect(result.resultDelivery.note).toContain('Do not poll');
    // Nothing waits: no status or message reads happen for the dispatch.
    expect(client.session.active).not.toHaveBeenCalled();
  });

  it('hands the end-of-run baseline to the delivery and keeps it from the agent', async () => {
    const { service, dispatchResults, sessionService } = createReturningService();
    sessionService.send.mockResolvedValue({ sessionId: 'ses_child', directory: '/repo', promptDispatched: true, baselineIdleRecordId: 'msg_idle_old' });
    const result = await service.execute('session.send', { sessionId: 'ses_child', prompt: 'Again', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' });

    expect(dispatchResults.register).toHaveBeenCalledWith({
      parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 1_000, afterIdleId: 'msg_idle_old',
    });
    expect(result).not.toHaveProperty('baselineIdleRecordId');
  });

  it('does not schedule a delivery for a prompt that never landed', async () => {
    const { service, dispatchResults, sessionService } = createReturningService();
    sessionService.create.mockResolvedValue({ sessionId: 'ses_child', directory: '/repo', promptDispatched: false, promptError: 'no queued message' });
    const result = await service.execute('session.create', { prompt: 'Check', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' });

    expect(dispatchResults.register).not.toHaveBeenCalled();
    expect(result.resultDelivery.status).toBe('not-scheduled');
  });

  it('reports a failed registration instead of claiming the result is coming', async () => {
    const { service, dispatchResults } = createReturningService();
    dispatchResults.register.mockRejectedValue(new Error('disk full'));
    const result = await service.execute('session.send', { sessionId: 'ses_child', prompt: 'Again', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' });

    expect(result.resultDelivery).toEqual({ status: 'not-scheduled', reason: expect.stringContaining('disk full') });
    expect(result).not.toHaveProperty('baselineAssistantMessageId');
  });

  it.each([
    ['without a calling session', { prompt: 'x', returnResult: true }, {}, 'needs a calling session'],
    ['without a prompt', { returnResult: true }, { contextSessionId: 'ses_parent' }, 'returnResult requires prompt'],
    ['combined with wait', { prompt: 'x', returnResult: true, wait: true }, { contextSessionId: 'ses_parent' }, 'cannot be combined with wait'],
  ])('refuses returnResult %s before creating anything', async (_label, input, options, message) => {
    const { service, sessionService } = createReturningService();
    await expect(service.execute('session.create', input, '/repo', options)).rejects.toThrow(message);
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it('refuses to deliver a session\'s result to itself', async () => {
    const { service, sessionService } = createReturningService();
    await expect(service.execute('session.send', { sessionId: 'ses_parent', prompt: 'x', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' }))
      .rejects.toThrow('to itself');
    expect(sessionService.send).not.toHaveBeenCalled();
  });

  it('answers 503 on a server that cannot deliver results', async () => {
    const { service, sessionService } = createService();
    await expect(service.execute('session.create', { prompt: 'x', returnResult: true }, '/repo', { contextSessionId: 'ses_parent' }))
      .rejects.toMatchObject({ statusCode: 503 });
    expect(sessionService.create).not.toHaveBeenCalled();
  });

  it('refuses a returnResult that is not a boolean instead of silently skipping delivery', async () => {
    const { service, sessionService, dispatchResults } = createReturningService();
    await expect(service.execute('session.create', { prompt: 'x', returnResult: 'true' }, '/repo', { contextSessionId: 'ses_parent' }))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('returnResult must be a boolean') });
    expect(sessionService.create).not.toHaveBeenCalled();
    expect(dispatchResults.register).not.toHaveBeenCalled();
  });

  it('accepts an explicit false returnResult as the plain dispatch path', async () => {
    const { service, sessionService, dispatchResults } = createReturningService();
    const result = await service.execute('session.create', { prompt: 'x', returnResult: false }, '/repo', { contextSessionId: 'ses_parent' });
    expect(sessionService.create).toHaveBeenCalled();
    expect(result).not.toHaveProperty('resultDelivery');
    expect(dispatchResults.register).not.toHaveBeenCalled();
  });

  it('creates an ownWork session under the calling session and brings its answer back by default', async () => {
    const { service, sessionService, dispatchResults } = createReturningService();
    const result = await service.execute('session.create', { prompt: 'Fix the parser', ownWork: true }, '/repo', { contextSessionId: 'ses_parent' });

    expect(sessionService.create).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'Fix the parser' }), { operatorParentId: 'ses_parent' });
    expect(dispatchResults.register).toHaveBeenCalledWith({ parentSessionId: 'ses_parent', sessionId: 'ses_child', dispatchedAt: 1_000 });
    expect(result.resultDelivery.status).toBe('pending');
  });

  it('keeps an ownWork session quiet when the agent turns its answer off', async () => {
    const { service, sessionService, dispatchResults } = createReturningService();
    await service.execute('session.create', { prompt: 'Fix the parser', ownWork: true, returnResult: false }, '/repo', { contextSessionId: 'ses_parent' });

    expect(sessionService.create).toHaveBeenCalledWith(expect.anything(), { operatorParentId: 'ses_parent' });
    expect(dispatchResults.register).not.toHaveBeenCalled();
  });

  it('leaves a session without ownWork to the user', async () => {
    const { service, sessionService, dispatchResults } = createReturningService();
    await service.execute('session.create', { prompt: 'Fix the parser' }, '/repo', { contextSessionId: 'ses_parent' });

    expect(sessionService.create).toHaveBeenCalledWith(expect.anything());
    expect(dispatchResults.register).not.toHaveBeenCalled();
  });

  it.each([
    ['without a calling session', 'session.create', { prompt: 'x', ownWork: true }, {}, 'needs a calling session'],
    ['on a send', 'session.send', { sessionId: 'ses_child', prompt: 'x', ownWork: true }, { contextSessionId: 'ses_parent' }, 'applies only to session.create'],
    ['as a string', 'session.create', { prompt: 'x', ownWork: 'true' }, { contextSessionId: 'ses_parent' }, 'ownWork must be a boolean'],
  ])('refuses ownWork %s before creating anything', async (_label, action, input, options, message) => {
    const { service, sessionService } = createReturningService();
    await expect(service.execute(action, input, '/repo', options)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining(message) });
    expect(sessionService.create).not.toHaveBeenCalled();
    expect(sessionService.send).not.toHaveBeenCalled();
  });

  it('refuses a wait that is not a boolean', async () => {
    const { service, sessionService } = createService();
    await expect(service.execute('session.send', { sessionId: 'ses_1', prompt: 'x', wait: 'true' }, '/repo'))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('wait must be a boolean') });
    expect(sessionService.send).not.toHaveBeenCalled();
  });
>>>>>>> upstream/main
});

describe('pr.unwatch', () => {
  const URL_7 = 'https://github.com/acme/app/pull/7';
  const URL_8 = 'https://github.com/acme/app/pull/8';

  // A real pull request watch runtime behind the control service, so the
  // service's handling of `url` is checked against what the runtime does.
  const createWatching = async ({ extensionWaits } = {}) => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-control-pr-watch-'));
    const prWatch = createPrWatchRuntime({
      buildOpenCodeUrl: (fetchPath) => `http://opencode.test${fetchPath}`,
      getOpenCodeAuthHeaders: () => ({}),
      broadcastUiEvent: () => {},
      dataDir,
      fetchImpl: vi.fn(async () => new Response('{}', { status: 404 })),
    });
    prWatch.attach({
      trackedItems: { setServerInterest() {}, subscribe: () => () => {} },
      readers: {
        sourceControl: vi.fn(async ({ pulls }) => ({
          status: 'ok',
          pulls: pulls.map(({ owner, repo, number }) => ({ owner, repo, number, state: 'open', title: `PR ${number}`, headSha: 'a1', mergeableState: 'clean', checks: { state: 'pending' }, activity: 0 })),
        })),
      },
    });
    const { service } = createService({ prWatch, extensionWaits });
    const run = (action, input) => service.execute(action, input, '/repo', { contextSessionId: 'ses_agent' });
    await run('pr.watch', { url: URL_7 });
    await run('pr.watch', { url: URL_8 });
    const watched = () => prWatch.snapshot().watches.map((watch) => watch.number).sort();
    return {
      run,
      watched,
      prWatch,
      cleanup: async () => {
        prWatch.stop();
        await prWatch.flush();
        await fs.rm(dataDir, { recursive: true, force: true });
      },
    };
  };

  it.each([
    ['an empty url', ''],
    ['a whitespace-only url', '   '],
    ['a null url', null],
    ['a non-string url', 7],
    ['an address that is no pull request', 'https://example.com/x'],
  ])('refuses %s with 400 and stops nothing', async (_label, url) => {
    const { run, watched, cleanup } = await createWatching();
    try {
      await expect(run('pr.unwatch', { url })).rejects.toMatchObject({ statusCode: 400 });
      expect(watched()).toEqual([7, 8]);
    } finally {
      await cleanup();
    }
  });

  it('stops only the pull request at a valid url', async () => {
    const { run, watched, cleanup } = await createWatching();
    try {
      await expect(run('pr.unwatch', { url: URL_8 })).resolves.toMatchObject({ stopped: true, watching: [{ number: 7 }] });
      expect(watched()).toEqual([7]);
    } finally {
      await cleanup();
    }
  });

  it('stops every pull request of the session when url is omitted', async () => {
    const { run, watched, cleanup } = await createWatching();
    try {
      await expect(run('pr.unwatch', {})).resolves.toEqual({ watching: [], stopped: true });
      expect(watched()).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  describe('as a wait source', () => {
    const URL_9 = 'https://github.com/acme/app/pull/9';
    const TIMER_WAIT = { waitId: 'wait_t', sessionID: 'ses_agent', source: 'timer', title: 'Timer', label: '10 min', status: 'waiting' };
    // The timer and extension side, which these tests only route to.
    const fakeExtensionWaits = () => {
      let timers = [TIMER_WAIT];
      return {
        load: vi.fn(async () => {}),
        snapshot: () => ({ revision: 1, waits: timers }),
        listWaits: vi.fn(async () => ({ waiting: timers, sources: [{ source: 'timer' }, { source: 'kit/deploy' }] })),
        startWait: vi.fn(async () => ({ waiting: TIMER_WAIT, next: 'x' })),
        stopWaits: vi.fn(async (_sessionID, waitId) => {
          const ending = timers.filter((wait) => !waitId || wait.waitId === waitId);
          timers = timers.filter((wait) => !ending.includes(wait));
          return { waiting: timers, stopped: ending.length };
        }),
      };
    };

    it('starts a pull request wait from args, from JSON text args, and from url beside them', async () => {
      const extensionWaits = fakeExtensionWaits();
      const { run, watched, cleanup } = await createWatching({ extensionWaits });
      try {
        await expect(run('wait.start', { source: 'pr', args: { url: URL_9 } })).resolves.toMatchObject({ watching: { url: URL_9, number: 9 } });
        await run('wait.start', { source: 'pr', args: JSON.stringify({ url: URL_7 }) });
        await run('wait.start', { source: ' pr ', url: URL_8 });
        expect(watched()).toEqual([7, 8, 9]);
        expect(extensionWaits.startWait).not.toHaveBeenCalled();
        await expect(run('wait.start', { source: 'pr', args: {} })).rejects.toMatchObject({ statusCode: 400 });
      } finally {
        await cleanup();
      }
    });

    it('lists pull requests beside the timer and extension waits, with pr as a source after the timer', async () => {
      const { run, cleanup } = await createWatching({ extensionWaits: fakeExtensionWaits() });
      try {
        const listed = await run('wait.list', {});
        expect(listed.sources.map((entry) => entry.source)).toEqual(['timer', 'pr', 'kit/deploy']);
        expect(listed.waiting.map((wait) => wait.waitId)).toEqual([URL_7, URL_8, 'wait_t']);
        expect(listed.waiting[0]).toMatchObject({ source: 'pr', title: '#7 PR 7', args: { url: URL_7 }, status: 'waiting' });
      } finally {
        await cleanup();
      }
    });

    it('stops one pull request by its address and leaves every other wait', async () => {
      const extensionWaits = fakeExtensionWaits();
      const { run, watched, cleanup } = await createWatching({ extensionWaits });
      try {
        const result = await run('wait.stop', { waitId: URL_8 });
        expect(result).toMatchObject({ stopped: 1, waiting: [{ waitId: URL_7 }, { waitId: 'wait_t' }] });
        expect(watched()).toEqual([7]);
        expect(extensionWaits.stopWaits).not.toHaveBeenCalled();
        await expect(run('wait.stop', { waitId: URL_9 })).rejects.toMatchObject({ statusCode: 404 });
      } finally {
        await cleanup();
      }
    });

    it('leaves the pull request waiting when the other waits cannot be read', async () => {
      const extensionWaits = fakeExtensionWaits();
      extensionWaits.load.mockRejectedValueOnce(Object.assign(new Error('EACCES'), { status: 500 }));
      const { run, watched, cleanup } = await createWatching({ extensionWaits });
      try {
        await expect(run('wait.stop', { waitId: URL_8 })).rejects.toMatchObject({ statusCode: 500 });
        expect(watched()).toEqual([7, 8]);
      } finally {
        await cleanup();
      }
    });

    it('leaves the timer waiting when the pull request waits cannot be read', async () => {
      const extensionWaits = fakeExtensionWaits();
      const { run, prWatch, cleanup } = await createWatching({ extensionWaits });
      try {
        vi.spyOn(prWatch, 'listWaits').mockRejectedValueOnce(Object.assign(new Error('EACCES'), { status: 500 }));
        await expect(run('wait.stop', { waitId: 'wait_t' })).rejects.toMatchObject({ statusCode: 500 });
        expect(extensionWaits.stopWaits).not.toHaveBeenCalled();
      } finally {
        await cleanup();
      }
    });

    it('stops a timer by its id and leaves the pull requests', async () => {
      const { run, watched, cleanup } = await createWatching({ extensionWaits: fakeExtensionWaits() });
      try {
        await expect(run('wait.stop', { waitId: 'wait_t' })).resolves.toMatchObject({ stopped: 1, waiting: [{ waitId: URL_7 }, { waitId: URL_8 }] });
        expect(watched()).toEqual([7, 8]);
      } finally {
        await cleanup();
      }
    });

    it('stops every wait of the session, pull requests included, without a waitId', async () => {
      const { run, watched, cleanup } = await createWatching({ extensionWaits: fakeExtensionWaits() });
      try {
        await expect(run('wait.stop', {})).resolves.toEqual({ waiting: [], stopped: 3 });
        expect(watched()).toEqual([]);
      } finally {
        await cleanup();
      }
    });
  });
});

describe('render.page with share', () => {
  const page = '<!doctype html><p>Pick</p><img src="https://example.com/a.png">';
  const call = { contextSessionId: 'ses_1', contextCallId: 'call_1' };
  const savedEnv = { mode: process.env.OPENCHAMBER_ENTERPRISE_MODE, relay: process.env.OPENCHAMBER_RELAY_URL };
  const restoreEnv = () => {
    process.env.OPENCHAMBER_ENTERPRISE_MODE = savedEnv.mode ?? '';
    process.env.OPENCHAMBER_RELAY_URL = savedEnv.relay ?? '';
  };

  const createShareService = async () => {
    const { createSharePagesRuntime } = await import('../share-pages/runtime.js');
    const { createSharePageStore } = await import('../share-pages/store.js');
    const { isSharingAvailable } = await import('../share-pages/relay-client.js');
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-control-share-'));
    const crypto = await import('node:crypto');
    const sharePages = createSharePagesRuntime({
      crypto,
      store: createSharePageStore({ fsPromises: fs, path, dataDir }),
      relay: { create: vi.fn(), states: vi.fn(async () => []), close: vi.fn() },
      postSynthetic: vi.fn(),
      isAvailable: isSharingAvailable,
      isRelayBaseAllowed: () => true,
      resolveRelayBase: async () => 'https://relay.test',
      setIntervalImpl: () => ({ unref() {} }),
    });
    return { ...createService({ sharePages }), sharePages, dataDir };
  };

  it('makes the group and tells the agent without a link or PIN, outside enterprise mode', async () => {
    process.env.OPENCHAMBER_ENTERPRISE_MODE = '';
    try {
      const { service, sharePages, dataDir } = await createShareService();
      const result = await service.execute('render.page', { html: page, title: 'Schema', share: { recipients: ['Yulia', 'Denis'] } }, '/repo', call);

      expect(result).toMatchObject({ title: 'Schema', shared: { recipients: ['Yulia', 'Denis'] } });
      expect(Date.parse(result.shared.expiresAt)).toBeGreaterThan(Date.now());
      expect(result.note).toContain('https images');
      const group = await sharePages.getGroup('ses_1', 'call_1');
      expect(group.recipients.map(({ status }) => status)).toEqual(['preparing', 'preparing']);
      const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'share-pages', `${(await import('../share-pages/store.js')).shareGroupId(await import('node:crypto'), 'ses_1', 'call_1')}.json`), 'utf8'));
      for (const recipient of stored.recipients) {
        expect(JSON.stringify(result)).not.toContain(recipient.pin);
        expect(JSON.stringify(result)).not.toContain(recipient.linkKey);
      }
      await fs.rm(dataDir, { recursive: true, force: true });
    } finally {
      restoreEnv();
    }
  });

  it('refuses share and awaitAnswer together', async () => {
    const { service } = await createShareService();
    await expect(service.execute('render.page', { html: page, title: 'T', awaitAnswer: true, share: { recipients: ['Yulia'] } }, '/repo', call))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('refuses share and answerLater together', async () => {
    const { service, sharePages } = await createShareService();
    await expect(service.execute('render.page', { html: page, title: 'T', answerLater: true, share: { recipients: ['Yulia'] } }, '/repo', call))
      .rejects.toMatchObject({ statusCode: 400 });
    await expect(sharePages.getGroup('ses_1', 'call_1')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses share in enterprise mode without a pinned relay, and allows it with one', async () => {
    process.env.OPENCHAMBER_ENTERPRISE_MODE = '1';
    process.env.OPENCHAMBER_RELAY_URL = '';
    try {
      const { service } = await createShareService();
      await expect(service.execute('render.page', { html: page, title: 'T', share: { recipients: ['Yulia'] } }, '/repo', call))
        .rejects.toMatchObject({ statusCode: 403, code: 'enterprise_mode' });

      process.env.OPENCHAMBER_RELAY_URL = 'wss://relay.acme.test/ws';
      const result = await service.execute('render.page', { html: page, title: 'T', share: { recipients: ['Yulia'] } }, '/repo', call);
      expect(result.shared.recipients).toEqual(['Yulia']);
    } finally {
      restoreEnv();
    }
  });
});

describe('browser actions by ref, keys, dialogs and waits', () => {
  it('passes a ref, a drop target, a key, a dialog answer and a capped wait to the browser', async () => {
    const request = vi.fn(async () => ({ ok: true }));
    const { service } = createService({ browserControl: { request } });

    await service.execute('browser.click', { ref: 'e12' }, '/repo');
    expect(request).toHaveBeenLastCalledWith('browser.click', { ref: 'e12' }, expect.anything());
    await service.execute('browser.drag', { ref: 'e1', to: 'e2' }, '/repo');
    expect(request).toHaveBeenLastCalledWith('browser.drag', { ref: 'e1', to: 'e2' }, expect.anything());
    await service.execute('browser.press', { key: 'Shift+Tab' }, '/repo');
    expect(request).toHaveBeenLastCalledWith('browser.press', { key: 'Shift+Tab' }, expect.anything());
    await service.execute('browser.dialog', { accept: false }, '/repo');
    expect(request).toHaveBeenLastCalledWith('browser.dialog', { accept: false }, expect.anything());
    await service.execute('browser.click', { ref: 'e4', dialog: 'accept' }, '/repo');
    expect(request).toHaveBeenLastCalledWith('browser.click', { ref: 'e4', dialog: 'accept' }, expect.anything());
    await expect(service.execute('browser.click', { ref: 'e4', dialog: 'yes' }, '/repo')).rejects.toThrow('dialog must be accept or dismiss');
    await service.execute('browser.wait', { text: 'Saved', timeoutMs: 60_000 }, '/repo');
    expect(request).toHaveBeenLastCalledWith('browser.wait', { text: 'Saved', timeoutMs: 15_000 }, expect.anything());
  });

  it.each([
    ['browser.hover', {}, 'browser.hover requires ref, selector or text'],
    ['browser.drag', { ref: 'e1' }, 'browser.drag requires to or toSelector'],
    ['browser.press', {}, 'key is required'],
    ['browser.dialog', {}, 'accept is required'],
    ['browser.wait', {}, 'browser.wait requires ref or selector'],
    ['browser.click', { ref: 'e1; drop' }, 'ref must be a ref from browser.snapshot'],
  ])('refuses %s without what it needs, before contacting the browser', async (action, input, message) => {
    const request = vi.fn(async () => ({ ok: true }));
    const { service } = createService({ browserControl: { request } });

    await expect(service.execute(action, input, '/repo')).rejects.toThrow(message);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('browser upload', () => {
  const uploadFixture = async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-upload-'));
    const project = path.join(root, 'project');
    const outside = path.join(root, 'outside');
    await fs.mkdir(project);
    await fs.mkdir(outside);
    await fs.writeFile(path.join(project, 'avatar.png'), 'png');
    await fs.writeFile(path.join(outside, 'id_rsa'), 'secret');
    await fs.symlink(path.join(outside, 'id_rsa'), path.join(project, 'link'));
    const put = vi.fn((files) => ({ token: 't', files: files.map(({ name, size }) => ({ name, size })) }));
    const request = vi.fn(async () => ({ uploaded: 1 }));
    const { service } = createService({ browserControl: { request }, browserUploads: { put } });
    return { root, project, outside, put, request, service };
  };

  it('holds a file of the session folder and sends the browser its token', async () => {
    const { root, project, put, request, service } = await uploadFixture();
    try {
      await service.execute('browser.upload', { ref: 'e3', paths: ['avatar.png'] }, project);
      expect(put).toHaveBeenCalledWith([{ name: 'avatar.png', path: await fs.realpath(path.join(project, 'avatar.png')), size: 3, bytes: Buffer.from('png') }]);
      expect(request).toHaveBeenCalledWith('browser.upload', { ref: 'e3', upload: { token: 't', files: [{ name: 'avatar.png', size: 3 }] } }, expect.anything());
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('refuses a file outside the session folder, also through a symlink, and ignores a directory the caller names', async () => {
    const { root, project, outside, request, service } = await uploadFixture();
    try {
      await expect(service.execute('browser.upload', { ref: 'e3', paths: [path.join(outside, 'id_rsa')] }, project)).rejects.toThrow('outside this session\'s folder');
      await expect(service.execute('browser.upload', { ref: 'e3', paths: ['link'] }, project)).rejects.toThrow('outside this session\'s folder');
      await expect(service.execute('browser.upload', { ref: 'e3', paths: ['id_rsa'], directory: outside }, project)).rejects.toThrow('does not exist');
      expect(request).not.toHaveBeenCalled();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
