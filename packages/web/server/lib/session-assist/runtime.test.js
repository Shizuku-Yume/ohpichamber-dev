import { describe, expect, it } from 'vitest';

import { createSessionAssistRuntime } from './runtime.js';

const scope = { sessionId: 'ses_1', rootSessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', cwd: '/repo' };
const rootSession = { sessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', displayPath: '.', rootSessionId: 'ses_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null };
const childSession = { ...rootSession, sessionId: 'ses_child', rootSessionId: 'ses_1' };
const turn = { turnId: 'turn_1', sessionId: 'ses_1', runId: 'run_1', status: 'completed', userMessageId: 'user-1', assistantMessageIds: ['assistant-1'], startedAt: 1, finishedAt: 3 };
const messages = [
  { messageId: 'user-1', sessionId: 'ses_1', turnId: 'turn_1', role: 'user', createdAt: 1, parts: [{ type: 'text', partId: 'part-user', content: 'Please finish the work.' }] },
  { messageId: 'assistant-1', sessionId: 'ses_1', turnId: 'turn_1', role: 'assistant', createdAt: 2, providerId: 'provider-1', modelId: 'model-1', parts: [{ type: 'text', partId: 'part-assistant', content: 'Finished the work.' }] },
];

const makeRuntime = ({ persistSessionAssist, getSmallModelService, session = rootSession, quietMs = 0 } = {}) => createSessionAssistRuntime({
  sessionService: {
    open: async () => ({ session }),
    history: async () => ({ sessionId: session.sessionId, branch: { branchId: 'branch-1', branchVersion: '1', leafMessageId: 'assistant-1' }, turns: [turn], messages, nextCursor: null }),
  },
  resolveSessionScope: async () => ({ ...scope, sessionId: session.sessionId }),
  getSmallModelService: getSmallModelService || (async () => ({
    describeSmallModel: async ({ preferredProviderID, preferredModelID }) => ({ inputCharBudget: 20_000, providerID: preferredProviderID, modelID: preferredModelID }),
    generateSmallModelText: async ({ preferredProviderID, preferredModelID }) => ({ text: preferredProviderID === 'provider-1' && preferredModelID === 'model-1' ? '{"recap":"done","suggestion":"next"}' : '{}' }),
  })),
  getTargets: () => ({ recap: true, suggestion: true }),
  persistSessionAssist,
  quietMs,
});

describe('session-assist canonical consumer', () => {
  it('generates and persists assistance only after a canonical idle status', async () => {
    const persisted = [];
    const runtime = makeRuntime({ persistSessionAssist: async (...args) => persisted.push(args) });
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, runtimeStatus: 'idle', activeRunId: null }, scope);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(persisted).toHaveLength(1);
    expect(persisted[0][0]).toBe('ses_1');
    expect(persisted[0][2]).toMatchObject({ recap: 'done', suggestion: 'next', forMessageID: 'assistant-1' });
    runtime.stop();
  });

  it('skips a strict RuntimeSession child before consulting the small model', async () => {
    const calls = { describe: 0 };
    const model = { describeSmallModel: async () => { calls.describe += 1; return { inputCharBudget: 20_000 }; }, generateSmallModelText: async () => ({ text: '{}' }) };
    const runtime = makeRuntime({ session: childSession, getSmallModelService: async () => model, persistSessionAssist: async () => undefined });
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_child', epoch: 'epoch_1', sequence: '1', timestamp: 3, runtimeStatus: 'idle', activeRunId: null }, { ...scope, sessionId: 'ses_child' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls.describe).toBe(0);
    runtime.stop();
  });

  it('does not generate when the session scope belongs to another session', async () => {
    const calls = { describe: 0 };
    const model = { describeSmallModel: async () => { calls.describe += 1; return { inputCharBudget: 20_000 }; }, generateSmallModelText: async () => ({ text: '{}' }) };
    const runtime = makeRuntime({ getSmallModelService: async () => model, persistSessionAssist: async () => undefined });
    runtime.processCanonicalEvent({ type: 'session.status', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, runtimeStatus: 'idle', activeRunId: null }, { ...scope, sessionId: 'ses_other' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(calls.describe).toBe(0);
    runtime.stop();
  });
});
