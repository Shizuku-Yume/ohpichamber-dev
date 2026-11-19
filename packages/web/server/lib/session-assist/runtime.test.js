import { describe, expect, it } from 'vitest';

import { createSessionAssistRuntime } from './runtime.js';

const scope = { sessionId: 'ses_1', rootSessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', cwd: '/repo' };
const rootSession = { sessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', displayPath: '.', rootSessionId: 'ses_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' } };
const childSession = { ...rootSession, sessionId: 'ses_child', rootSessionId: 'ses_1' };
const turn = { turnId: 'turn_1', sessionId: 'ses_1', runId: 'run_1', status: 'completed', userMessageId: 'user-1', assistantMessageIds: ['assistant-1'], startedAt: 1, finishedAt: 3 };
const messages = [
  { messageId: 'user-1', sessionId: 'ses_1', turnId: 'turn_1', role: 'user', createdAt: 1, parts: [{ type: 'text', partId: 'part-user', content: 'Please finish the work.' }] },
  { messageId: 'assistant-1', sessionId: 'ses_1', turnId: 'turn_1', role: 'assistant', createdAt: 2, providerId: 'provider-1', modelId: 'model-1', parts: [{ type: 'text', partId: 'part-assistant', content: 'Finished the work.' }] },
];

const makeRuntime = ({ session = rootSession, onTurnSettled, lineage } = {}) => createSessionAssistRuntime({
  sessionService: {
    open: async () => ({ session }),
    history: async () => ({ sessionId: session.sessionId, branch: { branchId: 'branch-1', branchVersion: '1', leafMessageId: 'assistant-1' }, turns: [turn], messages, nextCursor: null }),
  },
  resolveSessionScope: async () => ({ ...scope, sessionId: session.sessionId }),
  onTurnSettled,
  lineage,
});

describe('session-assist canonical consumer', () => {
  it('settles only after a canonical idle status with suggestion path removed', async () => {
    const settled = [];
    const runtime = makeRuntime({ onTurnSettled: (id) => settled.push(id) });
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, runtimeStatus: 'idle', activeRunId: null }, scope);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toEqual(['ses_1']);
    runtime.stop();
  });

  it('settles after canonical run.completed event with suggestion path removed', async () => {
    const settled = [];
    const runtime = makeRuntime({ onTurnSettled: (id) => settled.push(id) });
    runtime.processCanonicalEvent({ type: 'run.completed', sessionId: 'ses_1', runId: 'run_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, finishedAt: 3 }, scope);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toEqual(['ses_1']);
    runtime.stop();
  });

  it('does not duplicate onTurnSettled when both run.completed and session.status idle arrive', async () => {
    const settled = [];
    const runtime = makeRuntime({
      onTurnSettled: (id) => settled.push(id),
    });
    runtime.processCanonicalEvent({ type: 'run.completed', sessionId: 'ses_1', runId: 'run_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, finishedAt: 3 }, scope);
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '2', timestamp: 4, runtimeStatus: 'idle', activeRunId: null }, scope);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(settled).toEqual(['ses_1']);
    runtime.stop();
  });

  it('does not duplicate onTurnSettled when session.status idle arrives before run.completed', async () => {
    const settled = [];
    const runtime = makeRuntime({
      onTurnSettled: (id) => settled.push(id),
    });
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, runtimeStatus: 'idle', activeRunId: null }, scope);
    runtime.processCanonicalEvent({ type: 'run.completed', sessionId: 'ses_1', runId: 'run_1', epoch: 'epoch_1', sequence: '2', timestamp: 4, finishedAt: 4 }, scope);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(settled).toEqual(['ses_1']);
    runtime.stop();
  });

  it('skips a child session when lineage indicates a child', async () => {
    const settled = [];
    const runtime = makeRuntime({
      session: childSession,
      lineage: { isChild: (id) => id === 'ses_child' },
      onTurnSettled: (id) => settled.push(id),
    });
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_child', epoch: 'epoch_1', sequence: '1', timestamp: 3, runtimeStatus: 'idle', activeRunId: null }, { ...scope, sessionId: 'ses_child' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toEqual([]);
    runtime.stop();
  });

  it('does not settle when the session scope belongs to another session', async () => {
    const settled = [];
    const runtime = makeRuntime({ onTurnSettled: (id) => settled.push(id) });
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, runtimeStatus: 'idle', activeRunId: null }, { ...scope, sessionId: 'other' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toEqual([]);
    runtime.stop();
  });

  it('notifies onTurnSettled when assistance generation settles', async () => {
    const settled = [];
    const runtime = makeRuntime({
      onTurnSettled: (id) => settled.push(id),
    });
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, runtimeStatus: 'idle', activeRunId: null }, scope);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(settled).toEqual(['ses_1']);
    runtime.stop();
  });

  it('never writes a recap or suggestion, because worker owns predictions and IdleMaintenance owns recaps', async () => {
    const settled = [];
    const runtime = createSessionAssistRuntime({
      sessionService: {
        open: async () => ({ session: rootSession }),
        history: async () => ({ sessionId: rootSession.sessionId, branch: { branchId: 'branch-1', branchVersion: '1', leafMessageId: 'assistant-1' }, turns: [turn], messages, nextCursor: null }),
      },
      resolveSessionScope: async () => ({ ...scope, sessionId: rootSession.sessionId }),
      onTurnSettled: (id) => settled.push(id),
    });
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, runtimeStatus: 'idle', activeRunId: null }, scope);
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(settled).toEqual(['ses_1']);
    runtime.stop();
  });
});
