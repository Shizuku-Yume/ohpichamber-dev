import { describe, expect, it } from 'vitest';

import { createSessionWorkRuntime } from './runtime.js';

const scope = { sessionId: 'ses_1', rootSessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', agentDirectoryId: 'agent-1', cwd: '/repo' };
const endpoint = { url: 'https://jev.test', model: 'jev', headers: {} };
const rootSession = { sessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', displayPath: '.', rootSessionId: 'ses_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null };
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
  updateMetadata = async () => ({ changed: true, metadata: {} }) } = {}) => createSessionWorkRuntime({
  sessionService: {
    open: async () => ({ session }),
    history: async () => historyPage(session.sessionId, pending),
  },
  resolveSessionScope: async () => sessionScope,
  getSettings: () => ({ enabled: true, autoOpen: true, reviewOffer: false }),
  classifierEndpoint,
  jev: { ask: ask || (async () => ({ answers: { change: { noul: 1 }, toward_change: { noul: 1 } } })) },
  readMetadata: async () => ({}),
  updateMetadata,
});

const userEvent = (sessionId = 'ses_1') => ({ type: 'message.created', sessionId, messageId: 'new-user-1', role: 'user', createdAt: 4,
  parts: [{ partId: 'new-user-text', type: 'text', content: 'Please start the implementation.' }] });

describe('session-work canonical consumer', () => {
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
    const runtime = makeRuntime({ pending: false,
      classifierEndpoint: async (workspaceId) => { workspaces.push(workspaceId); return workspaceId === scope.workspaceId ? endpoint : null; },
      ask: async (request, selectedEndpoint) => {
        expect(selectedEndpoint).toBe(endpoint);
        expect(request.state).toEqual({ history: [], request: 'Implement the bounded fix.', answer: 'Ready.' });
        return { answers: { change: { noul: 1 }, recap: { noul: 1 } } };
      },
      updateMetadata: async (...args) => { writes.push(args); return { changed: true, metadata: {} }; },
    });
    expect(await runtime.evaluateTurnEnd({ sessionId: scope.sessionId, assist: { recap: true, suggestion: false } })).toEqual({ recap: true, suggestion: true });
    expect(workspaces).toEqual([scope.workspaceId]);
    expect(writes).toHaveLength(1);
    expect(writes[0][2]).toEqual({ directory: scope.cwd });
    runtime.stop();
  });

  it('never resolves an unscoped endpoint when the Host session scope is missing', async () => {
    const workspaces = [];
    const runtime = makeRuntime({ sessionScope: null,
      classifierEndpoint: async (workspaceId) => { workspaces.push(workspaceId); return endpoint; },
    });
    runtime.processCanonicalEvent(userEvent(), scope);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await runtime.evaluateTurnEnd({ sessionId: scope.sessionId, assist: { recap: true, suggestion: false } })).toBeNull();
    expect(workspaces).toEqual([]);
    runtime.stop();
  });
});
