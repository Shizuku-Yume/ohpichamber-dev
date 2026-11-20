import { describe, expect, it } from 'vitest';

import { createSessionWorkRuntime } from './runtime.js';

const scope = { sessionId: 'ses_1', rootSessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', agentDirectoryId: 'agent-1', cwd: '/repo' };
const endpoint = { url: 'https://jev.test', model: 'jev', headers: {} };
const rootSession = { sessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', displayPath: '.', rootSessionId: 'ses_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' } };
const childSession = { ...rootSession, sessionId: 'ses_child', rootSessionId: 'ses_1' };
const historyPage = (sessionId, pending = true) => {
  const messages = [
    { messageId: 'user-1', sessionId, turnId: 'turn-1', role: 'user', createdAt: 1, parts: [{ partId: 'user-text', type: 'text', content: 'Implement the bounded fix.' }] },
    { messageId: 'assistant-1', sessionId, turnId: 'turn-1', role: 'assistant', createdAt: 2, providerId: 'provider-1', modelId: 'model-1', parts: [{ partId: 'answer-text', type: 'text', content: 'Ready.' }] },
  ];
  const turns = [{ turnId: 'turn-1', sessionId, runId: 'run-1', status: 'completed', userMessageId: 'user-1', assistantMessageIds: ['assistant-1'], startedAt: 1, finishedAt: 3 }];
  if (pending) {
    messages.push({ messageId: 'new-user-1', sessionId, turnId: 'turn-2', role: 'user', createdAt: 4, parts: [{ partId: 'new-user-text', type: 'text', content: 'Please start the implementation.' }] });
    turns.push({ turnId: 'turn-2', sessionId, runId: 'run-2', status: 'running', userMessageId: 'new-user-1', assistantMessageIds: [], startedAt: 4 });
  }
  return { sessionId, branch: { branchId: 'branch-1', branchVersion: '1', leafMessageId: messages.at(-1).messageId }, messages, turns, nextCursor: null };
};

const makeRuntime = ({ ask, session = rootSession, sessionScope = { ...scope, sessionId: session.sessionId }, pending = true,
  classifierEndpoint = async (workspaceId) => { expect(workspaceId).toBe(scope.workspaceId); return endpoint; },
  updateMetadata = async () => ({ changed: true, metadata: {} }), isWorktreePinned = async () => false,
  readMetadata = async () => ({}), activityProbe = null, now = Date.now, getSettings = () => ({ enabled: true, autoOpen: true, reviewOffer: false }) } = {}) => createSessionWorkRuntime({
    sessionService: {
      open: async () => ({ session }),
      history: async () => historyPage(session.sessionId, pending),
    },
    resolveSessionScope: async () => sessionScope,
    getSettings,
    classifierEndpoint,
    jev: { ask: ask || (async () => ({ answers: { change: { noul: 1 }, toward_change: { noul: 1 } } })) },
    readMetadata,
    activityProbe,
    now,
    updateMetadata,
    isWorktreePinned,
  });

const userEvent = (sessionId = 'ses_1') => ({
  type: 'message.created', sessionId, messageId: 'new-user-1', role: 'user', createdAt: 4,
  parts: [{ partId: 'new-user-text', type: 'text', content: 'Please start the implementation.' }]
});

describe('session-work canonical consumer', () => {
  it.each([
    ['new shell', [{ kind: 'shell', startedAt: 2 }], false, false],
    ['older shell', [{ kind: 'shell', startedAt: 0 }], false, true],
    ['long-running shell', [{ kind: 'shell', startedAt: 2 - 30 * 60_000 }], false, true],
    ['async job', [{ kind: 'async', startedAt: 0 }], false, false],
    ['working child', [], true, false],
    ['working child with unknown jobs', null, true, false],
    ['no activity', [], false, true],
    ['unknown jobs', null, false, true],
    ['unknown children', [], null, true],
    ['unknown activity', null, null, true],
  ])('preserves background tri-state for %s', async (_label, jobs, children, suggestsDone) => {
    const writes = [];
    const runtime = makeRuntime({
      pending: false, now: () => 10,
      readMetadata: async () => ({ openchamber: { work: { state: 'open' } } }),
      activityProbe: {
        fetchRunningBackgroundJobs: async () => jobs,
        fetchActiveSessionStatuses: async () => children === null ? null : [],
        hasWorkingChildren: async () => children,
      },
      ask: async () => ({ answers: { wrap_up: { noul: 1 }, recap: { noul: 1 } } }),
      updateMetadata: async (_id, decide) => { writes.push(decide({ openchamber: { work: { state: 'open' } } })); return { changed: true }; },
    });
    const gate = await runtime.evaluateTurnEnd({ sessionId: scope.sessionId, assist: { recap: true, suggestion: true } });
    expect(writes.length > 0).toBe(suggestsDone);
    expect(gate).toEqual(suggestsDone ? { recap: true } : { recap: true, suggestion: false });
    runtime.stop();
  });

  it('suppresses next-step suggestions even when no classifier questions are needed', async () => {
    const runtime = makeRuntime({ pending: false,
      getSettings: () => ({ enabled: false, reviewOffer: false }),
      activityProbe: { fetchRunningBackgroundJobs: async () => [{ kind: 'async', startedAt: 0 }] },
      ask: async () => { throw new Error('No classifier call expected'); },
    });
    expect(await runtime.evaluateTurnEnd({ sessionId: scope.sessionId, assist: { recap: false, suggestion: true } }))
      .toEqual({ recap: true, suggestion: false });
    runtime.stop();
  });

  it('keeps the background gate when classification fails', async () => {
    const runtime = makeRuntime({ pending: false,
      activityProbe: { fetchRunningBackgroundJobs: async () => [{ kind: 'async', startedAt: 0 }] },
      ask: async () => { throw new Error('Classifier unavailable'); },
    });
    expect(await runtime.evaluateTurnEnd({ sessionId: scope.sessionId, assist: { recap: true, suggestion: true } }))
      .toEqual({ recap: true, suggestion: false });
    runtime.stop();
  });
  it('does not classify or open work in a pinned worktree', async () => {
    let asks = 0;
    let writes = 0;
    const runtime = makeRuntime({
      isWorktreePinned: async (directory) => { expect(directory).toBe('/repo'); return true; },
      ask: async () => { asks += 1; return { answers: { change: { noul: 1 } } }; },
      updateMetadata: async () => { writes += 1; return { changed: true }; },
    });
    runtime.processCanonicalEvent(userEvent(), scope);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect({ asks, writes }).toEqual({ asks: 0, writes: 0 });
    runtime.stop();
  });
  it('opens work only from a canonical user message and a workspace-scoped positive classifier answer', async () => {
    const writes = [];
    const workspaces = [];
    const runtime = makeRuntime({
      classifierEndpoint: async (workspaceId) => { workspaces.push(workspaceId); return workspaceId === scope.workspaceId ? endpoint : null; },
      ask: async (request, selectedEndpoint) => {
        expect(selectedEndpoint).toBe(endpoint);
        expect(request.state.history).toEqual([{ role: 'user', text: 'Implement the bounded fix.' }, { role: 'assistant', text: 'Ready.' }]);
        return { answers: { change: { noul: 1 } } };
      },
      updateMetadata: async (...args) => { writes.push(args); return { changed: true, metadata: {} }; },
    });
    runtime.processCanonicalEvent(userEvent(), scope);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(workspaces).toEqual([scope.workspaceId]);
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe('ses_1');
    expect(writes[0][2]).toEqual({ directory: '/repo' });
    runtime.stop();
  });

  it('skips a strict RuntimeSession child even when its user event is otherwise eligible', async () => {
    let asks = 0;
    const runtime = makeRuntime({ session: childSession, ask: async () => { asks += 1; return { answers: { change: { noul: 1 } } }; } });
    runtime.processCanonicalEvent({ ...userEvent('ses_child'), parts: [] }, { ...scope, sessionId: 'ses_child' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(asks).toBe(0);
    runtime.stop();
  });

  it('ignores a user event from another session scope', async () => {
    let asks = 0;
    const runtime = makeRuntime({ ask: async () => { asks += 1; return { answers: { change: { noul: 1 } } }; } });
    runtime.processCanonicalEvent(userEvent(), { ...scope, sessionId: 'ses_other' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(asks).toBe(0);
    runtime.stop();
  });

  it('resolves the Host workspace before classifying a canonical completed turn', async () => {
    const workspaces = [];
    const writes = [];
    const runtime = makeRuntime({
      pending: false,
      classifierEndpoint: async (workspaceId) => { workspaces.push(workspaceId); return workspaceId === scope.workspaceId ? endpoint : null; },
      ask: async (request, selectedEndpoint) => {
        expect(selectedEndpoint).toBe(endpoint);
        expect(request.state).toEqual({ history: [], request: 'Implement the bounded fix.', answer: 'Ready.' });
        return { answers: { change: { noul: 1 }, recap: { noul: 1 } } };
      },
      updateMetadata: async (...args) => { writes.push(args); return { changed: true, metadata: {} }; },
    });
    expect(await runtime.evaluateTurnEnd({ sessionId: scope.sessionId, assist: { recap: true } })).toEqual({ recap: true });
    expect(workspaces).toEqual([scope.workspaceId]);
    expect(writes).toHaveLength(1);
    expect(writes[0][2]).toEqual({ directory: scope.cwd });
    runtime.stop();
  });

  it('never resolves an unscoped endpoint when the Host session scope is missing', async () => {
    const workspaces = [];
    const runtime = makeRuntime({
      sessionScope: null,
      classifierEndpoint: async (workspaceId) => { workspaces.push(workspaceId); return endpoint; },
    });
    runtime.processCanonicalEvent(userEvent(), scope);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await runtime.evaluateTurnEnd({ sessionId: scope.sessionId, assist: { recap: true, suggestion: false } })).toBeNull();
    expect(workspaces).toEqual([]);
    runtime.stop();
  });
});
