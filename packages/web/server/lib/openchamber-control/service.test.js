import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { SessionJournal } from '../../../../agent-service/src/projection/journal.ts';
import { createOpenChamberControlService } from './service.js';
import { registerOpenChamberControlRoutes } from './routes.js';
import { createPrWatchRuntime, parsePullRequestUrl } from '../pr-watch/runtime.js';
import { trackedItemKey } from '../tracked-items/items.js';
import { createUploadStore } from '../browser-control/uploads.js';

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
    getMetadata: async (sessionId) => ({ sessionId, revision: '0', metadata: null }),
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
  return { control, created, sent, forked, goalControls, callOrder, requests, sessionService };
};

describe('OhPiChamber control service canonical consumers', () => {
  it('dispatches scoped usage.read only through its own Host tool and current setting', async () => {
    const scopes = [];
    const quota = { listUsagePageProviders: () => [], listConfiguredQuotaProviders: async () => [], fetchQuotaForProvider: async () => ({}) };
    const { control } = createHarness({ agentUsageToolEnabled: true }, { loadQuota: async (scope) => { scopes.push(scope); return quota; } });
    const scope = { ...scopeForWorkspace, rootSessionId: 'session-1' };
    const request = { toolName: 'openchamber_usage', sessionId: 'session-1', action: 'usage.read', input: {} };
    expect(await control.invokeHostAction(scope, request)).toEqual({ ok: true, value: { providers: [], notConfigured: [] } });
    expect(scopes).toEqual([{ rootSessionId: 'session-1', ...scopeForWorkspace }]);
    expect(await control.invokeHostAction(scope, { ...request, toolName: 'notify' })).toMatchObject({ ok: false, status: 400 });
    const disabled = createHarness({ agentUsageToolEnabled: false }, { loadQuota: async () => { throw new Error('Must not load quota'); } });
    await expect(disabled.control.execute('usage.read', {}, undefined, { contextSessionId: 'session-1' })).rejects.toMatchObject({ statusCode: 403 });
    await expect(createHarness().control.execute('usage.read', {}, undefined, { contextSessionId: 'session-1' })).rejects.toMatchObject({ statusCode: 503 });
  });

  it('tracks and marks done using Canonical eligibility and queued Host metadata patches', async () => {
    const patches = [];
    const { control, sessionService } = createHarness({}, { now: () => 100,
      updateSessionMetadata: async (id, decide, options) => { patches.push({ id, patch: decide({}), options }); return { changed: true }; },
    });
    sessionService.open = async () => ({ session: { sessionId: 'session-1', rootSessionId: 'session-1', title: 'Work' } });
    expect(await control.execute('session.track', {}, undefined, { contextSessionId: 'session-1' })).toMatchObject({ sessionId: 'session-1', inWork: true, changed: true });
    expect(await control.execute('session.markDone', { sessionId: 'session-1' })).toMatchObject({ sessionId: 'session-1', inWork: false });
    expect(patches).toEqual([
      { id: 'session-1', options: { directory: '/repo/app' }, patch: { openchamber: { work: { state: 'open', openedAt: 100, openedBy: 'user', doneAt: null, suggestDoneAt: null } } } },
      { id: 'session-1', options: { directory: '/repo/app' }, patch: { openchamber: { work: { state: 'done', doneAt: 100, suggestDoneAt: null } } } },
    ]);
  });

  it.each([
    ['pinned worktree', {}, { isWorktreePinned: async () => true }, 409],
    ['pinned session', { isPinned: true }, {}, 409],
    ['Host pin stamp', { openchamber: { pinned: { at: 1 } } }, {}, 409],
    ['review', { openchamber: { kind: 'review' } }, {}, 400],
    ['btw', { openchamber: { kind: 'btw' } }, {}, 400],
    ['scheduled', { openchamber: { kind: 'scheduled' } }, {}, 400],
    ['archived', {}, { archiveStore: { archivedAt: async () => 5 } }, 409],
    ['managed chat', {}, { chatRoots: ['/repo'] }, 400],
  ])('refuses tracking a %s but allows marking it done', async (_label, metadata, overrides, statusCode) => {
    let writes = 0;
    const { control, sessionService } = createHarness({}, { ...overrides, updateSessionMetadata: async () => { writes += 1; return { changed: true }; } });
    sessionService.open = async () => ({ session: { sessionId: 'session-1', rootSessionId: 'session-1' } });
    sessionService.getMetadata = async () => ({ metadata });
    await expect(control.execute('session.track', { sessionId: 'session-1' })).rejects.toMatchObject({ statusCode });
    expect(writes).toBe(0);
    await expect(control.execute('session.markDone', { sessionId: 'session-1' })).resolves.toMatchObject({ inWork: false });
    expect(writes).toBe(1);
  });

  it('refuses missing, child, out-of-scope and unreadable sessions before any work write', async () => {
    const { control, sessionService } = createHarness({}, { updateSessionMetadata: async () => { throw new Error('Unexpected write'); } });
    await expect(control.execute('session.track')).rejects.toMatchObject({ statusCode: 400 });
    sessionService.open = async () => ({ session: { sessionId: 'session-1', rootSessionId: 'parent' } });
    await expect(control.execute('session.track', { sessionId: 'session-1' })).rejects.toMatchObject({ statusCode: 400 });
    await expect(control.execute('session.track', { sessionId: 'session-1', workspaceId: 'workspace-2' })).rejects.toMatchObject({ statusCode: 403 });
    sessionService.getMetadata = async () => { throw new Error('Metadata unreadable'); };
    await expect(control.execute('session.track', { sessionId: 'session-1' })).rejects.toThrow('Metadata unreadable');
    const disabled = createHarness({ sessionWorkEnabled: false }, { updateSessionMetadata: async () => ({ changed: true }) });
    await expect(disabled.control.execute('session.track', { sessionId: 'session-1' })).rejects.toMatchObject({ statusCode: 409 });
    await expect(createHarness().control.execute('session.track', { sessionId: 'session-1' })).rejects.toMatchObject({ statusCode: 503 });
  });
  it('refuses public secret authority and runs only the scoped worker call with private card answers', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'secret-control-'));
    const scope = { rootSessionId: 'session-1', ...scopeForWorkspace, cwd: directory };
    const waiting = Promise.withResolvers();
    const changes = [];
    const { control, requests } = createHarness(undefined, {
      resolveSessionScope: async () => scope,
      onPageWaitChange: change => { changes.push(change); if (change.type === 'waiting') waiting.resolve(); },
    });
    const app = express();
    registerOpenChamberControlRoutes(app, { controlService: control });
    const input = {
      program: process.execPath, args: ['-e', 'console.log(process.env.TOKEN)'],
      reason: 'Sign in', inputs: [{ env: 'TOKEN', label: 'Token' }],
      authorized: true, sessionId: 'session-1', callId: 'call-secret',
    };
    try {
      await request(app).post('/api/openchamber/control').send({
        action: 'secret.run', input, authorized: true,
        contextSessionId: 'session-1', contextCallId: 'call-secret',
      }).expect(403);
      await expect(control.execute('secret.run', input, directory, { authorized: true })).rejects.toMatchObject({ statusCode: 403 });
      expect(changes).toEqual([]);
      const invocation = { toolName: 'openchamber_secret', action: 'secret.run', input, sessionId: 'session-1', toolCallId: 'call-secret' };
      await expect(control.invokeHostAction({ ...scope, workspaceId: 'other' }, invocation)).resolves.toMatchObject({ ok: false, status: 403 });
      const pending = control.invokeHostAction(scope, invocation);
      await waiting.promise;
      const fields = await request(app).get('/api/openchamber/secret/fields').query({ sessionId: 'session-1', callId: 'call-secret' }).expect(200);
      expect(fields.body).toEqual({ fields: ['TOKEN'], reused: [] });
      expect(fields.headers['cache-control']).toBe('no-store');
      const malformed = await request(app).post('/api/openchamber/secret/answer').set('Content-Type', 'application/json').send('{"values":"private-value"').expect(400);
      expect(JSON.stringify(malformed.body)).not.toContain('private-value');
      await request(app).post('/api/openchamber/secret/answer').send({ sessionId: 'other', callId: 'call-secret', values: { TOKEN: 'private-value' } }).expect(404);
      const answer = await request(app).post('/api/openchamber/secret/answer').send({ sessionId: 'session-1', callId: 'call-secret', values: { TOKEN: 'private-value' }, remember: ['TOKEN'] }).expect(200);
      const result = await pending;
      expect(result).toMatchObject({ ok: true, value: { stdout: '[secret:TOKEN]\n', remembered: ['TOKEN'] } });
      expect(JSON.stringify([result, answer.body, changes])).not.toContain('private-value');
      expect(await fs.readdir(directory)).toEqual([]);
      expect(requests).toEqual([]);
      await request(app).get('/api/openchamber/secret/fields').query({ sessionId: 'session-1', callId: 'call-secret' }).expect(404);
      await expect(control.invokeHostAction(scope, { ...invocation, action: 'secret.forget', input: {} })).resolves.toMatchObject({ ok: true, value: { forgotten: 1 } });
      await request(app).post('/api/openchamber/control').send({ action: 'secret.request', input: { label: 'Token', reason: 'Sign in' } }).expect(403);
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('reads opted-in terminal output only within the captured workspace and hides Host directory fields', async () => {
    const runtime = {
      listTerminals: vi.fn(() => [{ sessionId: 'terminal-1', cwd: scopeForWorkspace.cwd, status: 'running' }]),
      readTerminal: vi.fn(() => ({ sessionId: 'terminal-1', cwd: scopeForWorkspace.cwd, text: `output in ${scopeForWorkspace.cwd}`, status: 'running' })),
    };
    const { control } = createHarness({ agentTerminalToolEnabled: true }, { getTerminalRuntime: () => runtime });
    const scope = { rootSessionId: 'session-1', ...scopeForWorkspace };
    const invoke = (action, input = {}) => control.invokeHostAction(scope, { sessionId: 'session-1', toolName: 'openchamber', action, input });
    const listed = await invoke('terminal.list');
    expect(listed).toMatchObject({ ok: true, value: { terminals: [{ sessionId: 'terminal-1', directory: '.' }] } });
    const read = await invoke('terminal.read', { sessionId: 'terminal-1' });
    expect(read.ok).toBe(true);
    expect(JSON.stringify(read)).not.toContain(scopeForWorkspace.cwd);
    expect(read.value.cwd).toBeUndefined();
    await expect(invoke('terminal.list', { workspaceId: 'workspace-2' })).resolves.toMatchObject({ ok: false, status: 403 });
    runtime.listTerminals.mockReturnValue([]);
    runtime.readTerminal.mockClear();
    await expect(invoke('terminal.read', { sessionId: 'foreign' })).resolves.toMatchObject({ ok: false, status: 404 });
    expect(runtime.readTerminal).not.toHaveBeenCalled();
    await expect(invoke('terminal.list')).resolves.toMatchObject({ ok: true, value: { terminals: [] } });
  });

  it('keeps terminal reads off by default and reports an unavailable panel explicitly', async () => {
    const scope = { rootSessionId: 'session-1', ...scopeForWorkspace };
    const call = { sessionId: 'session-1', toolName: 'openchamber', action: 'terminal.list' };
    await expect(createHarness().control.invokeHostAction(scope, call)).resolves.toMatchObject({ ok: false, status: 403 });
    await expect(createHarness({ agentTerminalToolEnabled: true }).control.invokeHostAction(scope, call)).resolves.toMatchObject({ ok: false, status: 503 });
  });
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

  it('refuses to wait for human input in a Host-metadata operator child', async () => {
    const { control, sessionService } = createHarness();
    sessionService.getMetadata = async (sessionId) => ({ sessionId, revision: '1', metadata: { openchamber: { kind: 'operator-child', parentID: 'operator-root' } } });
    const result = await control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber_render', action: 'render.page', sessionId: 'session-1',
      input: { html: '<p>Choose</p>', title: 'Choose', awaitAnswer: true }, toolCallId: 'child-call',
    });
    expect(result).toMatchObject({ ok: false, status: 403 });
  });

  it('does not treat failed Host metadata reads as permission to wait for a human', async () => {
    const { control, sessionService } = createHarness();
    sessionService.getMetadata = async () => { throw new Error('/host/private/metadata.db is unreadable'); };
    const result = await control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber_render', action: 'render.page', sessionId: 'session-1',
      input: { html: '<p>Choose</p>', title: 'Choose', awaitAnswer: true }, toolCallId: 'unavailable-call',
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(JSON.stringify(result)).not.toContain('/host/private');
  });

  it('does not wait on a page when a user message is already queued', async () => {
    const hasUnreadChat = vi.fn(async () => true);
    const onPageWaitChange = vi.fn();
    const { control } = createHarness(undefined, { hasUnreadChat, onPageWaitChange });
    const result = await control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber_render', action: 'render.page', sessionId: 'session-1', toolCallId: 'queued-page',
      input: { html: '<p>Choose</p>', title: 'Choose', awaitAnswer: true },
    });
    expect(result).toMatchObject({ ok: true, value: { answer: { answered: false, reason: 'chat-sent-earlier' } } });
    expect(hasUnreadChat).toHaveBeenCalledWith('session-1');
    expect(onPageWaitChange).not.toHaveBeenCalled();
  });

  it('does not wait on a page after an unavailable queued-message read', async () => {
    const onPageWaitChange = vi.fn();
    const { control } = createHarness(undefined, {
      hasUnreadChat: async () => { throw new Error('queue unavailable'); }, onPageWaitChange,
    });
    const result = await control.invokeHostAction({ rootSessionId: 'session-1', ...scopeForWorkspace }, {
      toolName: 'openchamber_render', action: 'render.page', sessionId: 'session-1', toolCallId: 'unavailable-queue-page',
      input: { html: '<p>Choose</p>', title: 'Choose', awaitAnswer: true },
    });
    expect(result).toMatchObject({ ok: false });
    expect(onPageWaitChange).not.toHaveBeenCalled();
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
    await expect(control.answerPage({ sessionId: 'session-1', callId: 'call-ask', summary: 'chose one', data: { n: 1 } }))
      .resolves.toEqual({ answered: true });
    await expect(pending).resolves.toMatchObject({
      ok: true,
      value: { title: 'Ask', answer: { answered: true, summary: 'chose one' } },
    });
  });
  it('keeps an answerLater page with its owner and routes the later answer there', async () => {
    const laterPages = { open: vi.fn(async () => undefined), answer: vi.fn(async () => ({ answered: true })) };
    const { control } = createHarness(undefined, { laterPages });
    const scope = { rootSessionId: 'session-1', ...scopeForWorkspace };
    const result = await control.invokeHostAction(scope, {
      toolName: 'openchamber_render', action: 'render.page', sessionId: 'session-1',
      input: { html: '<p>Which layout?</p>', title: 'Later', answerLater: true }, toolCallId: 'call-later',
    });
    expect(result).toMatchObject({ ok: true, value: { shown: true, title: 'Later', answerLater: true } });
    expect(laterPages.open).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1', callId: 'call-later', title: 'Later', question: 'Which layout?' }));
    const answer = { sessionId: 'session-1', callId: 'call-later', summary: 'B' };
    await expect(control.answerPage(answer)).resolves.toEqual({ answered: true });
    expect(laterPages.answer).toHaveBeenCalledWith(answer);
  });

  it('creates a share group for a shared page without handing the agent its links', async () => {
    const sharePages = {
      isAvailable: () => true,
      parseRequest: vi.fn((share) => share),
      createGroup: vi.fn(async () => ({ recipients: [{ recipientId: 'r1', label: 'Ana', status: 'preparing' }], expiresAt: Date.UTC(2030, 0, 1) })),
    };
    const { control } = createHarness(undefined, { sharePages });
    const scope = { rootSessionId: 'session-1', ...scopeForWorkspace };
    const call = (input) => control.invokeHostAction(scope, {
      toolName: 'openchamber_render', action: 'render.page', sessionId: 'session-1', input, toolCallId: 'call-share',
    });
    const result = await call({ html: '<p>Approve?</p>', title: 'Review', share: { recipients: ['Ana'] } });
    expect(result).toMatchObject({ ok: true, value: { title: 'Review', shared: { recipients: [{ label: 'Ana' }], expiresAt: '2030-01-01T00:00:00.000Z' } } });
    expect(result.value.shared.recipients[0]).not.toHaveProperty('url');
    expect(result.value.shared.recipients[0]).not.toHaveProperty('pin');
    expect(sharePages.createGroup).toHaveBeenCalledWith({ sessionId: 'session-1', callId: 'call-share', title: 'Review', share: { recipients: ['Ana'] } });
    await expect(call({ html: '<p>Approve?</p>', share: { recipients: ['Ana'] }, awaitAnswer: true })).resolves.toMatchObject({ ok: false });
    expect(sharePages.createGroup).toHaveBeenCalledTimes(1);
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

describe('browser.upload over the browser control bridge', () => {
  it('stages session files in the same store the download route reads', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-upload-'));
    try {
      await fs.writeFile(path.join(directory, 'a.txt'), 'hello');
      const browserUploads = createUploadStore();
      const request = vi.fn(async () => ({ uploaded: true }));
      const { control } = createHarness(undefined, { browserControl: { request }, browserUploads });
      await expect(control.execute('browser.upload', { selector: '#file', paths: ['a.txt'], directory: '/ignored' }, directory))
        .resolves.toEqual({ uploaded: true });
      const [action, parameters, options] = request.mock.calls[0];
      expect(action).toBe('browser.upload');
      expect(parameters.selector).toBe('#file');
      expect(parameters.upload.files).toEqual([{ name: 'a.txt', size: 5 }]);
      expect(browserUploads.get(parameters.upload.token, 0).bytes.toString()).toBe('hello');
      expect(options).toMatchObject({ timeoutMs: 45_000, context: { directory } });
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });

  it('refuses empty paths, missing context and escaping files before dispatch', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'browser-upload-'));
    try {
      await fs.mkdir(path.join(directory, 'session'));
      await fs.writeFile(path.join(directory, 'outside.txt'), 'private');
      await fs.symlink(path.join(directory, 'outside.txt'), path.join(directory, 'session', 'link.txt'));
      const request = vi.fn();
      const { control } = createHarness(undefined, { browserControl: { request }, browserUploads: createUploadStore() });
      for (const paths of [[], ['../outside.txt'], ['link.txt'], ['absent']]) {
        await expect(control.execute('browser.upload', { selector: '#file', paths }, path.join(directory, 'session')))
          .rejects.toMatchObject({ statusCode: 400 });
      }
      await expect(control.execute('browser.upload', { paths: ['outside.txt'] }, directory)).rejects.toMatchObject({ statusCode: 400 });
      await expect(control.execute('browser.upload', { selector: '#file', paths: ['outside.txt'] })).rejects.toMatchObject({ statusCode: 400 });
      expect(request).not.toHaveBeenCalled();
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
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
