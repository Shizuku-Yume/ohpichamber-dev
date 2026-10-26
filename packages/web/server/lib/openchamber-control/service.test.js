import { describe, expect, it } from 'vitest';

import { createOpenChamberControlService } from './service.js';

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
  agentMemoryToolEnabled: true,
  agentNotifyToolEnabled: true,
}) => {
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
  });
  return { control, created, sent, forked, goalControls, callOrder, requests };
};

describe('OpenChamber control service canonical consumers', () => {
  it('creates a scoped session and dispatches a canonical prompt without private path fields', async () => {
    const { control, created, sent } = createHarness();

    const result = await control.execute('session.create', {
      title: 'Migration', model: 'provider-1/model-1', agent: 'build', prompt: '  Start work  ',
    }, '/repo/app');

    expect(created).toEqual([{
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      options: { providerId: 'provider-1', modelId: 'model-1', agentId: 'build', variant: null, reasoningEffort: null },
      metadata: { title: 'Migration' },
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
    const h = createHarness({ agentControlToolEnabled: true, agentWebToolEnabled: true, agentMemoryToolEnabled: true,
      agentNotifyToolEnabled: true, sessionGoalDefaultBudgetEnabled: true, sessionGoalDefaultBudget: 5000 });
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

    await expect(control.invokeHostAction({ cwd: '/repo/app' }, {})).resolves.toEqual({ ok: false, code: 'INVALID_SCOPE', status: 400 });
    await expect(control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber', action: 'session.status', sessionId: 'other-session', input: {},
    })).resolves.toEqual({ ok: false, code: 'INVALID_REQUEST', status: 400 });
    await expect(control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'web', action: 'browser.open', sessionId: 'session-1', input: { url: 'https://example.com' },
    })).resolves.toMatchObject({ ok: false, code: 'UNAVAILABLE', status: 503 });
    await expect(control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber', action: 'unsupported.action', sessionId: 'session-1', input: {},
    })).resolves.toMatchObject({ ok: false, status: 400 });
    const disabled = createHarness({ agentControlToolEnabled: false, agentWebToolEnabled: true, agentMemoryToolEnabled: true, agentNotifyToolEnabled: false }).control;
    await expect(disabled.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber', action: 'session.status', sessionId: 'session-1', input: { sessionId: 'session-1' },
    })).resolves.toEqual({ ok: false, code: 'FEATURE_DISABLED', status: 403 });
    await expect(disabled.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'notify', action: 'notify.send', sessionId: 'session-1', input: { title: 't' },
    })).resolves.toEqual({ ok: false, code: 'FEATURE_DISABLED', status: 403 });
  });
});
