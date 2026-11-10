import { describe, expect, it } from 'vitest';

import { SessionCreateRequestSchema } from '@openchamber/agent-contract';
import { assertRootPromptAdmission } from '../message-queue/prompt-admission.js';
import { WorkflowAgentStopped, createWorkflowAgentSessions } from './agent-session.js';
const assistant = (messageId, turnId, text, extra = {}) => ({
  messageId, sessionId: 'ses_agent', turnId, role: 'assistant', createdAt: 1, parts: [{ type: 'text', partId: `p_${messageId}`, content: text }], ...extra,
});
const user = (messageId, turnId) => ({ messageId, sessionId: 'ses_agent', turnId, role: 'user', createdAt: 1, parts: [{ type: 'text', partId: `p_${messageId}`, content: 'work' }] });
const turn = (turnId, runId, status, assistantMessageIds, extra = {}) => ({
  turnId, sessionId: 'ses_agent', runId, status, userMessageId: `u_${turnId}`, assistantMessageIds, startedAt: 1,
  ...(status === 'completed' || status === 'failed' || status === 'cancelled' ? { finishedAt: 2 } : {}), ...extra,
});

/**
 * A canonical session service whose history is scripted per call. `pages`
 * holds the successive history answers of a session; the last one repeats.
 */
const fakeSessionService = ({ pages = [], snapshot = { session: { runtimeStatus: 'running' }, activeRun: { runId: 'run_1' } } } = {}) => {
  const calls = { created: [], sent: [], followed: [], controlled: [], unloaded: [], histories: 0 };
  let index = 0;
  return {
    calls,
    create: async (payload) => {
      SessionCreateRequestSchema.parse(payload);
      calls.created.push(payload);
      return { session: { sessionId: 'ses_agent' } };
    },
    send: async (sessionId, payload) => {
      assertRootPromptAdmission(payload);
      calls.sent.push({ sessionId, payload });
      return { run: { runId: 'run_1', sessionId, status: 'running', createdAt: 1 } };
    },
    followUp: async (sessionId, payload) => {
      calls.followed.push({ sessionId, payload });
      return { sessionId, followUpId: 'fu_1', acceptedAt: 2 };
    },
    history: async () => {
      calls.histories += 1;
      const page = pages[Math.min(index, pages.length - 1)];
      index += 1;
      return page;
    },
    open: async () => snapshot,
    control: async (sessionId, operation) => {
      calls.controlled.push({ sessionId, operation });
      return { run: { runId: operation.runId } };
    },
    unloadWorker: async (sessionId) => {
      calls.unloaded.push(sessionId);
    },
  };
};

const sessionsFor = (service, options = {}) => createWorkflowAgentSessions({
  sessionService: service,
  resolveWorkspace: async (directory) => ({ projectId: 'proj_1', workspaceId: `ws_${directory.split('/').at(-1)}`, cwd: directory }),
  sleep: async () => {},
  ...options,
});

const emptyPage = { sessionId: 'ses_agent', turns: [], messages: [] };

describe('workflow agent sessions', () => {
<<<<<<< HEAD
  it('creates a session in the run workspace, prompts it and returns the turn outcome', async () => {
    const page = {
      sessionId: 'ses_agent',
      turns: [turn('turn_1', 'run_1', 'completed', ['m_a'])],
      messages: [user('m_u', 'turn_1'), assistant('m_a', 'turn_1', 'the answer')],
    };
    const service = fakeSessionService({ pages: [emptyPage, page] });
    const seen = [];
    const result = await sessionsFor(service).start({
      directory: '/repo', parentSessionId: 'ses_parent', title: 'agent', model: 'openai/gpt-6-luna',
      text: 'work', signal: new AbortController().signal, onSession: (id) => seen.push(id),
=======
  it.each([false, true])('awaits the child-id checkpoint before prompting, rejection=%s', async (rejectCheckpoint) => {
    let release;
    let seen;
    const checkpoint = new Promise((resolve, reject) => { release = () => rejectCheckpoint ? reject(new Error('checkpoint failed')) : resolve(); });
    void checkpoint.catch(() => {});
    const created = new Promise((resolve) => { seen = resolve; });
    const prompts = [];
    const sessions = createWorkflowAgentSessions({
      buildOpenCodeUrl: (route) => `http://localhost:4096${route}`,
      getOpenCodeAuthHeaders: () => ({}),
      globalEventHub: { subscribeEvent: () => () => {} },
      createClient: () => ({
        session: {
          create: async () => ({ id: 'ses_empty_child' }),
          prompt: async ({ text }) => { prompts.push(text); throw new Error('prompt reached'); },
        },
        message: { list: async () => ({ data: [] }) },
      }),
    });
    const starting = sessions.start({
      directory: '/repo', parentSessionId: 'ses_parent', title: 'agent', model: 'test/model',
      text: 'work', signal: new AbortController().signal,
      onSession: (id) => { seen(id); return checkpoint; },
    });
    const ended = starting.then(() => null, (error) => error);
    expect(await created).toBe('ses_empty_child');
    await new Promise((resolve) => setImmediate(resolve));
    const prematurePrompts = [...prompts];
    release();
    expect((await ended)?.message).toBe(rejectCheckpoint ? 'checkpoint failed' : 'prompt reached');
    expect(prematurePrompts).toEqual([]);
    expect(prompts).toEqual(rejectCheckpoint ? [] : ['work']);
    sessions.stop();
  });

  it('marks the session as a workflow agent, so the sidebar leaves it out', async () => {
    const request = await createSessionRequest({ parent: null, allowTools: [], model: 'openai/gpt-6-luna' });
    expect(request).toMatchObject({ parentID: 'ses_parent', metadata: { openchamber: { kind: 'workflow-agent' } } });
  });

  it("allows the asked tools after the parent's own rules", async () => {
    const parentRule = { action: 'bash', resource: '*', effect: 'deny' };
    const request = await createSessionRequest({
      parent: { id: 'ses_parent', permissions: [parentRule] },
      allowTools: ['openchamber_workflow_answer'],
      model: 'openai/gpt-6-luna',
>>>>>>> bc50ba56a
    });
    expect(service.calls.created[0]).toMatchObject({
      projectId: 'proj_1',
      workspaceId: 'ws_repo',
      parentSessionId: 'ses_parent',
      title: 'agent',
    });
    expect(service.calls.created[0].options).toMatchObject({ providerId: 'openai', modelId: 'gpt-6-luna', agentId: null });
    expect(service.calls.sent[0].payload.input.text).toBe('work');
    expect(seen).toEqual(['ses_agent']);
    expect(result).toEqual({ sessionId: 'ses_agent', outcome: { state: 'completed', text: 'the answer', errorMessage: '' } });
  });

  it("inherits the proposing session's model when the call names none", async () => {
    const parentPage = { sessionId: 'ses_parent', turns: [], messages: [assistant('m_parent', 'turn_p', 'hi', { providerId: 'anthropic', modelId: 'claude' })] };
    const page = { sessionId: 'ses_agent', turns: [turn('turn_1', 'run_1', 'completed', ['m_a'])], messages: [assistant('m_a', 'turn_1', 'ok')] };
    const service = fakeSessionService({ pages: [parentPage, emptyPage, page] });
    await sessionsFor(service).start({
      directory: '/repo', parentSessionId: 'ses_parent', title: 'agent', text: 'work', signal: new AbortController().signal, onSession: () => {},
    });
    expect(service.calls.created[0].options).toMatchObject({ providerId: 'anthropic', modelId: 'claude' });
  });

  it('maps a failed turn to the error outcome the run records', async () => {
    const page = {
      sessionId: 'ses_agent',
      turns: [turn('turn_1', 'run_1', 'failed', ['m_a'], { error: 'provider refused' })],
      messages: [assistant('m_a', 'turn_1', 'partial')],
    };
    const service = fakeSessionService({ pages: [emptyPage, page] });
    const result = await sessionsFor(service).start({
      directory: '/repo', parentSessionId: 'ses_parent', title: 'agent', text: 'work', signal: new AbortController().signal, onSession: () => {},
    });
    expect(result.outcome).toEqual({ state: 'error', text: 'partial', errorMessage: 'provider refused' });
  });

  it('stops before prompting when the run was stopped during create', async () => {
    const controller = new AbortController();
    const service = fakeSessionService({ pages: [emptyPage] });
    await expect(sessionsFor(service).start({
      directory: '/repo', parentSessionId: 'ses_parent', title: 'agent', text: 'work',
      signal: controller.signal, onSession: () => controller.abort(),
    })).rejects.toBeInstanceOf(WorkflowAgentStopped);
    expect(service.calls.sent).toHaveLength(0);
  });

  it('follows up in the same session and waits for the next turn', async () => {
    const first = { sessionId: 'ses_agent', turns: [turn('turn_1', 'run_1', 'completed', ['m_a'])], messages: [assistant('m_a', 'turn_1', 'not json')] };
    const second = {
      sessionId: 'ses_agent',
      turns: [turn('turn_1', 'run_1', 'completed', ['m_a']), turn('turn_2', 'run_2', 'completed', ['m_b'])],
      messages: [assistant('m_b', 'turn_2', '{"files":["a.ts"]}')],
    };
    const service = fakeSessionService({ pages: [first, second] });
    const outcome = await sessionsFor(service).followUp({
      directory: '/repo', sessionId: 'ses_agent', text: 'fix it', signal: new AbortController().signal,
    });
    expect(service.calls.followed[0].payload.request.input.text).toBe('fix it');
    expect(outcome).toEqual({ state: 'completed', text: '{"files":["a.ts"]}', errorMessage: '' });
  });

  it('reads the model and spend from the last assistant message', async () => {
    const page = {
      sessionId: 'ses_agent', turns: [],
      messages: [assistant('m_a', 'turn_1', 'done', {
        providerId: 'openai', modelId: 'gpt-6-luna',
        usage: { input: 100, output: 20, cacheRead: 5, cacheWrite: 1, totalTokens: 126, cost: { input: 0.01, output: 0.02, cacheRead: 0, cacheWrite: 0, total: 0.03 } },
      })],
    };
    const service = fakeSessionService({ pages: [page] });
    expect(await sessionsFor(service).readUsage({ directory: '/repo', sessionId: 'ses_agent' })).toEqual({
      model: 'openai/gpt-6-luna',
      usage: { cost: 0.03, input: 100, output: 20, reasoning: 0, cacheRead: 5, cacheWrite: 1 },
    });
  });

  it('interrupts the active run of a stopped agent', async () => {
    const service = fakeSessionService();
    await sessionsFor(service).interrupt('/repo', 'ses_agent');
    expect(service.calls.controlled).toEqual([{ sessionId: 'ses_agent', operation: { type: 'abort', runId: 'run_1' } }]);
  });

  it('delivers a report as synthetic context and leaves a non-resuming report to the run record', async () => {
    const parentPage = { sessionId: 'ses_parent', turns: [], messages: [assistant('m_parent', 'turn_p', 'hi', { providerId: 'openai', modelId: 'gpt-6-luna' })] };
    const service = fakeSessionService({ pages: [parentPage] });
    const sessions = sessionsFor(service);
    await sessions.postSynthetic('ses_parent', { text: 'report', resume: true });
    expect(service.calls.sent.at(-1).payload).toMatchObject({
      input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: 'report' }] },
      options: { providerId: 'openai', modelId: 'gpt-6-luna' },
    });
    const before = service.calls.sent.length;
    await sessions.postSynthetic('ses_parent', { text: 'declined', resume: false });
    expect(service.calls.sent).toHaveLength(before);
  });

  it('unloads the worker when the agent turn completes', async () => {
    const page = {
      sessionId: 'ses_agent',
      turns: [turn('turn_1', 'run_1', 'completed', ['m_1'])],
      messages: [user('m_0', 'turn_1'), assistant('m_1', 'turn_1', '{"files":["alpha.ts"]}')],
    };
    const service = fakeSessionService({ pages: [page] });
    const sessions = sessionsFor(service);
    const { sessionId } = await sessions.start({
      directory: '/repo',
      text: 'do work',
      signal: new AbortController().signal,
      onSession: () => {},
    });
    expect(sessionId).toBe('ses_agent');
    await sessions.unloadWorker(sessionId);
    expect(service.calls.unloaded).toEqual(['ses_agent']);
  });

  it('surfaces capacity-full error immediately without retrying', async () => {
    const service = fakeSessionService();
    let attempts = 0;
    service.create = async () => {
      attempts += 1;
      throw new Error('Session capacity is full (5 of 5 active). Close another session or try again later.');
    };
    const sessions = sessionsFor(service);
    await expect(sessions.start({
      directory: '/repo',
      text: 'do work',
      signal: new AbortController().signal,
      onSession: () => {},
    })).rejects.toThrow('Session capacity is full (5 of 5 active). Close another session or try again later.');
    expect(attempts).toBe(1);
  });

  it('nests workflow branch session under parentSessionId and forces null agentId even when agent persona is specified', async () => {
    const page = {
      sessionId: 'ses_agent',
      turns: [turn('turn_1', 'run_1', 'completed', ['m_a'])],
      messages: [user('m_u', 'turn_1'), assistant('m_a', 'turn_1', 'review complete')],
    };
    const service = fakeSessionService({ pages: [emptyPage, page] });
    const result = await sessionsFor(service).start({
      directory: '/repo',
      parentSessionId: 'ses_parent_123',
      title: 'review',
      agent: 'reviewer',
      model: 'anthropic/claude-3-7-sonnet',
      text: 'review this diff',
      signal: new AbortController().signal,
      onSession: () => {},
    });

    expect(service.calls.created[0]).toMatchObject({
      projectId: 'proj_1',
      workspaceId: 'ws_repo',
      parentSessionId: 'ses_parent_123',
      title: 'review',
      options: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        agentId: null,
      },
    });
    expect(service.calls.sent[0].payload.options.agentId).toBeNull();
    expect(() => assertRootPromptAdmission(service.calls.sent[0].payload)).not.toThrow();
    expect(result.outcome.text).toBe('review complete');
  });
});
