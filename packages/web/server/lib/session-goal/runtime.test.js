import { describe, expect, it } from 'vitest';

import { createSessionGoalRuntime } from './runtime.js';

const scope = { sessionId: 'ses_1', rootSessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', cwd: '/repo' };
const rootSession = { sessionId: 'ses_1', projectId: 'project-1', workspaceId: 'workspace-1', displayPath: '.', rootSessionId: 'ses_1', createdAt: 1, updatedAt: 2, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'idle', activeRunId: null };
const activeGoal = { id: 'goal_1', objective: 'Finish the task', status: 'active', turnsUsed: 0, createdAt: 1, updatedAt: 1 };

const makeRuntime = ({ metadata = { openchamber: { goal: activeGoal } }, persistSessionGoal = async () => undefined } = {}) => createSessionGoalRuntime({
  sessionService: {
    open: async () => ({ session: rootSession }),
    history: async () => ({ messages: [], nextCursor: null }),
    list: async () => ({ items: [], errors: [] }),
    send: async () => undefined,
  },
  resolveSessionScope: async () => scope,
  getSmallModelService: async () => ({ generateSmallModelText: async () => ({ text: '{"verdict":"complete"}' }) }),
  getChecker: () => 'small-model',
  isEnabled: () => true,
  getMaxAutoTurns: () => 3,
  persistSessionGoal,
  readSessionMetadata: async () => metadata,
  idleQuietMs: 60_000,
  kickoffQuietMs: 60_000,
});

describe('session-goal canonical consumer', () => {
  it('pauses an active goal on a canonical user interruption', async () => {
    const writes = [];
    const runtime = makeRuntime({ persistSessionGoal: async (...args) => writes.push(args) });
    runtime.processCanonicalEvent({ type: 'run.cancelled', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '1', timestamp: 3, runId: 'run_1', finishedAt: 3 }, scope);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(writes[0][0]).toBe('ses_1');
    expect(writes[0][2]).toMatchObject({ id: 'goal_1', status: 'paused', statusReason: 'paused after abort' });
    runtime.stop();
  });

  it('ignores events outside the supplied session scope', async () => {
    let writes = 0;
    const runtime = makeRuntime({ persistSessionGoal: async () => { writes += 1; } });
    runtime.processCanonicalEvent({ type: 'session.execution.interrupted', sessionId: 'ses_1' }, { ...scope, sessionId: 'ses_other' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(writes).toBe(0);
    runtime.stop();
  });
});
