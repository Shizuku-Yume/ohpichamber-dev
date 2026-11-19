import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { SessionJournal } from '../../../../agent-service/src/projection/journal.ts';
import { createOpenChamberControlService } from './service.js';
import { createPrWatchRuntime, parsePullRequestUrl } from '../pr-watch/runtime.js';
import { trackedItemKey } from '../tracked-items/items.js';

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

describe('OhPiChamber control service canonical consumers', () => {
  it('reads complete and most-recent messages through the canonical paginated journal across workspaces', async () => {
    const sessionId = 'session-other';
    const turns = Array.from({ length: 205 }, (_, index) => ({
      turnId: `turn-${index}`, runId: `run-${index}`, sessionId, status: 'completed',
      userMessageId: `message-${index}`, assistantMessageIds: [], startedAt: index + 1, finishedAt: index + 1,
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

describe('browser.close over the browser control bridge', () => {
  it('forwards the close and its tab to the browser control', async () => {
    const request = vi.fn(async () => ({ closed: true }));
    const { control } = createHarness(undefined, { browserControl: { request } });
    await expect(control.execute('browser.close', { tabId: 'tab-1' }, '/repo/app')).resolves.toEqual({ closed: true });
    expect(request).toHaveBeenCalledWith('browser.close', { tabId: 'tab-1' }, expect.objectContaining({ timeoutMs: 20_000 }));
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

  it('creates watch via Host action and wakes session on PR update', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-watch-action-'));
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
});
