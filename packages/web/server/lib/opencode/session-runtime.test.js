import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionRuntime } from './session-runtime.js';
import { event, message, scope, snapshot, turn } from '../event-stream/canonical-test-fixtures.js';

const runtimes = [];
afterEach(() => { for (const runtime of runtimes.splice(0)) runtime.dispose(); vi.useRealTimers(); });
const fixture = () => {
  const events = [];
  const runtime = createSessionRuntime({ broadcastEvent: (payload) => events.push(payload) });
  runtimes.push(runtime);
  return { runtime, events, process: (fields, sequence = 1) => runtime.processCanonicalEvent(event(sequence, fields), scope) };
};
const approval = (overrides = {}) => ({ approvalId: 'approval', sessionId: 'session', turnId: 'turn', toolCallId: 'call',
  epoch: 'epoch', workerGeneration: 'generation', version: '1', toolName: 'bash', actionType: 'bash_command',
  commandSummary: 'Read an image', details: {}, status: 'pending', requestedAt: 1, ...overrides });
const question = (overrides = {}) => ({ questionId: 'question', sessionId: 'session', turnId: 'turn', epoch: 'epoch',
  workerGeneration: 'generation', version: '1', prompt: 'Choose a result', status: 'pending', requestedAt: 1, ...overrides });
const activeSnapshot = () => ({
  ...snapshot([message({ messageId: 'user', role: 'user', createdAt: 1 })], [turn({ status: 'running', finishedAt: undefined, assistantMessageIds: [] })],
    { runtimeStatus: 'awaiting_approval', activeRunId: 'run', headSequence: '4' }),
  activeRun: { runId: 'run', sessionId: 'session', status: 'running', createdAt: 1 }, approvals: [approval()], questions: [question()],
});

describe('canonical Host session activity', () => {
  it('replaces pending snapshot state and hydrates live activity without synthesizing unread completion', () => {
    const { runtime } = fixture();
    runtime.applySnapshot(activeSnapshot(), scope);
    expect(runtime.getActiveSessionCount()).toBe(1);
    expect(runtime.getSessionState('session')).toMatchObject({ status: 'awaiting_approval', activeRunId: 'run', lastEventId: 'epoch:4' });
    expect(runtime.getPendingBlockingRequestsSnapshot()).toEqual({ session: { approvals: [approval()], questions: [question()] } });
    expect(runtime.getSessionAttentionState('session').needsAttention).toBe(false);
    runtime.applySnapshot({ ...activeSnapshot(), approvals: [], questions: [] }, scope);
    expect(runtime.getPendingBlockingRequestsSnapshot()).toEqual({});
    runtime.applySnapshot(snapshot([], [], { epoch: 'replacement' }), scope);
    expect(runtime.getActiveSessionCount()).toBe(0); expect(runtime.getSessionState('session').status).toBe('idle');
    expect(runtime.getSessionAttentionState('session').needsAttention).toBe(false);
  });

  it('stores canonical requests by exact ID and settles only the matching request', () => {
    const f = fixture();
    f.process({ type: 'approval.requested', approval: approval() });
    f.process({ type: 'approval.requested', approval: approval() }, 2);
    f.process({ type: 'approval.requested', approval: approval({ approvalId: 'second' }) }, 3);
    f.process({ type: 'question.requested', question: question() }, 4);
    f.process({ type: 'approval.resolved', approval: approval({ version: '2', status: 'approved', resolvedAt: 5, resolution: { decision: 'approve' } }) }, 5);
    expect(f.runtime.getPendingBlockingRequestsSnapshot()).toEqual({ session: { approvals: [approval({ approvalId: 'second' })], questions: [question()] } });
    f.process({ type: 'question.resolved', question: question({ version: '2', status: 'answered', response: 'A', answeredAt: 6, resolvedAt: 6 }) }, 6);
    f.process({ type: 'approval.resolved', approval: approval({ approvalId: 'second', version: '2', status: 'expired', resolvedAt: 7 }) }, 7);
    expect(f.runtime.getPendingBlockingRequestsSnapshot()).toEqual({});
  });

  it('marks unviewed outer completion as attention and broadcasts its clear through the Host broadcaster', () => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    const f = fixture();
    f.process({ type: 'run.started', runId: 'run', createdAt: 0 });
    f.runtime.markUserMessageSent('session');
    f.process({ type: 'run.completed', runId: 'run', finishedAt: 2 }, 2);
    expect(f.runtime.getSessionAttentionState('session').needsAttention).toBe(true);
    expect(f.events).toContainEqual({ type: 'openchamber:session-status', properties: expect.objectContaining({ sessionId: 'session', status: 'idle', needsAttention: true }) });
    f.runtime.markSessionViewed('session', 'client');
    expect(f.events.at(-1)).toMatchObject({ type: 'openchamber:session-status', properties: { sessionId: 'session', needsAttention: false } });
    expect(f.runtime.getSessionAttentionState('session').isViewed).toBe(true);
    expect(JSON.stringify(f.events)).not.toContain(scope.cwd);
    f.process({ type: 'run.started', runId: 'next', createdAt: 3 }, 3);
    f.process({ type: 'run.completed', runId: 'next', finishedAt: 4 }, 4);
    expect(f.runtime.getSessionAttentionState('session').needsAttention).toBe(false);
    f.runtime.markSessionUnviewed('session', 'client');
    expect(f.runtime.getSessionAttentionState('session').isViewed).toBe(false);
  });

  it('ignores inner completion and a terminal event for another outer run', () => {
    const f = fixture(); f.process({ type: 'run.started', runId: 'run', createdAt: 1 });
    f.process({ type: 'turn.completed', turnId: 'turn', runId: 'run' }, 2);
    f.process({ type: 'tool.completed', toolCallId: 'call', status: 'denied', isError: true }, 3);
    f.process({ type: 'run.completed', runId: 'previous', finishedAt: 4 }, 4);
    expect(f.runtime.getActiveSessionCount()).toBe(1); expect(f.runtime.getSessionState('session').status).toBe('running');
    f.process({ type: 'session.status', runtimeStatus: 'awaiting_input', activeRunId: 'run' }, 5);
    expect(f.runtime.getActiveSessionCount()).toBe(1);
    f.process({ type: 'run.cancelled', runId: 'run', finishedAt: 6 }, 6);
    expect(f.runtime.getActiveSessionCount()).toBe(0);
  });

  it('keeps the two-second cooldown, cancels it when work resumes and counts activity idempotently', () => {
    vi.useFakeTimers(); const f = fixture();
    f.process({ type: 'run.started', runId: 'run', createdAt: 1 });
    f.process({ type: 'session.status', runtimeStatus: 'running', activeRunId: 'run' }, 2);
    expect(f.runtime.getActiveSessionCount()).toBe(1);
    f.process({ type: 'run.completed', runId: 'run', finishedAt: 3 }, 3);
    expect(f.runtime.getSessionActivitySnapshot()).toEqual({ session: { type: 'cooldown' } });
    vi.advanceTimersByTime(1999);
    f.process({ type: 'run.started', runId: 'next', createdAt: 4 }, 4);
    vi.advanceTimersByTime(1);
    expect(f.runtime.getActiveSessionCount()).toBe(1); expect(f.runtime.getSessionActivitySnapshot().session.type).toBe('busy');
    f.process({ type: 'run.completed', runId: 'next', finishedAt: 5 }, 5);
    vi.advanceTimersByTime(2000);
    expect(f.runtime.getSessionActivitySnapshot().session.type).toBe('idle');
    expect(f.events.filter((payload) => payload.type === 'openchamber:session-activity').map((payload) => payload.properties.phase))
      .toEqual(['busy', 'cooldown', 'busy', 'cooldown', 'idle']);
  });

  it('removes every cascaded deleted session, pending request and cooldown without resurrection', () => {
    vi.useFakeTimers(); const f = fixture();
    f.process({ type: 'run.started', runId: 'run', createdAt: 1 });
    f.process({ type: 'approval.requested', approval: approval() }, 2);
    f.runtime.processCanonicalEvent(event(1, { type: 'run.started', sessionId: 'child', runId: 'child-run', createdAt: 1 }), scope);
    f.runtime.processCanonicalEvent(event(2, { type: 'run.completed', sessionId: 'child', runId: 'child-run', finishedAt: 2 }), scope);
    f.process({ type: 'session.deleted', deletedSessionIds: ['session', 'child'] }, 3);
    const count = f.events.length; vi.advanceTimersByTime(2000);
    expect(f.events).toHaveLength(count); expect(f.runtime.getActiveSessionCount()).toBe(0);
    expect(f.runtime.getSessionStateSnapshot()).toEqual({}); expect(f.runtime.getSessionActivitySnapshot()).toEqual({});
    expect(f.runtime.getPendingBlockingRequestsSnapshot()).toEqual({}); expect(f.runtime.getSessionAttentionSnapshot()).toEqual({});
  });

  it('rejects foreign snapshot/request scope and does not accept legacy engine-shaped events', () => {
    const f = fixture();
    expect(() => f.runtime.applySnapshot(snapshot(), { ...scope, workspaceId: 'foreign' })).toThrow('scope mismatch');
    expect(() => f.process({ type: 'approval.requested', approval: approval({ sessionId: 'foreign' }) })).toThrow('scope mismatch');
    expect(() => f.runtime.processCanonicalEvent({ type: 'session.status', properties: { sessionID: 'session', status: { type: 'busy' } } }, scope)).toThrow();
    expect(f.runtime.getPendingBlockingRequestsSnapshot()).toEqual({}); expect(f.events).toEqual([]);
  });

  it('expires old retained state and releases all timers/state on disposal', () => {
    vi.useFakeTimers(); const f = fixture();
    f.process({ type: 'run.started', runId: 'run', createdAt: 1 });
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    expect(f.runtime.getSessionStateSnapshot()).toEqual({}); expect(f.runtime.getActiveSessionCount()).toBe(0);
    f.process({ type: 'run.started', runId: 'next', createdAt: 2 }, 2);
    f.runtime.dispose(); f.process({ type: 'run.started', runId: 'later', createdAt: 3 }, 3);
    expect(f.runtime.getSessionStateSnapshot()).toEqual({}); expect(f.runtime.getSessionAttentionSnapshot()).toEqual({});
    expect(vi.getTimerCount()).toBe(0);
  });
});
