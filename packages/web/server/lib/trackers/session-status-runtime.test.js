import { describe, expect, it, vi } from 'vitest';
import { createSessionStatusRuntime } from './session-status-runtime.js';
import { event } from '../event-stream/canonical-test-fixtures.js';

const idle = (sessionId) => event(1, { type: 'session.status', sessionId, runtimeStatus: 'idle', activeRunId: null });
const failed = (sessionId) => event(2, { type: 'run.failed', sessionId, runId: 'run', finishedAt: 2, error: 'ProviderError' });

describe('session status event decoding', () => {
  it('uses Canonical session IDs and only completed or failed transitions', () => {
    const post = vi.fn(async () => ({ connected: false }));
    const runtime = createSessionStatusRuntime({ label: 'test', post });
    runtime.processPayload(idle('first'));
    runtime.processPayload(event(2, { type: 'session.status', runtimeStatus: 'running', activeRunId: 'run' }));
    runtime.processPayload(failed('second'));
    expect(post.mock.calls.map(([input]) => input)).toEqual([
      { kind: 'completed', sessionId: 'first' },
      { kind: 'failure', sessionId: 'second' },
    ]);
  });

  it('ignores malformed objects, boxed strings, aborted turns and inexact event types', () => {
    const post = vi.fn(async () => ({ connected: false }));
    const runtime = createSessionStatusRuntime({ label: 'test', post });
    for (const payload of [null, [], 42, { type: 'session.status', properties: [] }]) runtime.processPayload(payload);
    runtime.processPayload({ type: ' session.status ', properties: { sessionID: 's', status: { type: 'idle' } } });
    runtime.processPayload({ type: 'session.status', properties: { sessionID: Object('s'), status: { type: 'idle' } } });
    runtime.processPayload({ type: 'session.error', properties: { sessionID: 's', error: { name: ' MessageAbortedError ' } } });
    runtime.processPayload(event(2, { type: 'run.cancelled', runId: 'run', finishedAt: 2 }));
    expect(post).not.toHaveBeenCalled();
    runtime.processPayload(failed('s'));
    expect(post).toHaveBeenCalledWith({ kind: 'failure', sessionId: 's' });
    runtime.stop();
    runtime.processPayload(failed('other'));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('warns about a failed post without retrying', async () => {
    const post = vi.fn(() => Promise.reject({ message: 'unavailable' }));
    const warn = vi.fn();
    const runtime = createSessionStatusRuntime({ label: 'test', post, warn });
    runtime.processPayload(failed('s'));
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith('[trackers] test: failed to post the session failure comment:', 'unavailable');
    expect(post).toHaveBeenCalledTimes(1);
  });
});
