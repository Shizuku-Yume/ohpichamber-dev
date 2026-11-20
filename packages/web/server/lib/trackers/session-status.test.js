import { describe, expect, it, vi } from 'vitest';
import { createTrackerSessionStatus } from './session-status.js';
import { event } from '../event-stream/canonical-test-fixtures.js';

const ready = (sequence) => event(sequence, { type: 'session.status', runtimeStatus: 'idle', activeRunId: null });
const flush = () => new Promise((resolve) => setImmediate(resolve));
const consumer = () => ({ processPayload: vi.fn(), stop: vi.fn() });
const registry = (ids, implementation) => ({ list: () => ids, descriptor: () => ({ capabilities: { sessionComments: true } }), implementation });

describe('Canonical tracker status fan-out', () => {
  it('bounds pending events, loads once and replays in order', async () => {
    let resolve;
    const loading = new Promise((done) => { resolve = done; });
    const sink = consumer();
    const implementation = vi.fn(() => loading);
    const runtime = createTrackerSessionStatus({ registry: registry(['tracker'], implementation), maxPending: 2 });
    for (const sequence of [1, 2, 3]) runtime.processPayload(ready(sequence));
    expect(sink.processPayload).not.toHaveBeenCalled();
    resolve({ sessionStatus: { createRuntime: () => sink } });
    await flush();
    expect(sink.processPayload.mock.calls.map(([payload]) => payload.sequence)).toEqual(['2', '3']);
    runtime.processPayload(ready(4));
    expect(implementation).toHaveBeenCalledTimes(1);
    runtime.stop(); runtime.stop();
    expect(sink.stop).toHaveBeenCalledTimes(1);
  });

  it('retries failed loads after backoff without blocking another tracker', async () => {
    const sink = consumer(); const recovered = consumer(); const warn = vi.fn();
    let clock = 0; let failures = 0;
    const implementation = vi.fn(async (id) => {
      if (id === 'failing' && failures++ === 0) throw new Error('offline');
      return { sessionStatus: { createRuntime: () => id === 'failing' ? recovered : sink } };
    });
    const runtime = createTrackerSessionStatus({ registry: registry(['failing', 'healthy'], implementation), now: () => clock, warn });
    runtime.processPayload(ready(1)); await flush();
    runtime.processPayload(ready(2)); await flush();
    expect(implementation).toHaveBeenCalledTimes(2);
    clock = 30_001;
    runtime.processPayload(ready(3)); await flush();
    expect(implementation).toHaveBeenCalledTimes(3);
    expect(sink.processPayload).toHaveBeenCalledTimes(3);
    expect(recovered.processPayload).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
    runtime.stop();
  });

  it('ignores empty/unsupported registries and never starts a detached pending provider', async () => {
    const implementation = vi.fn(async () => ({}));
    const empty = createTrackerSessionStatus({ registry: registry([], implementation) });
    empty.processPayload(ready(1));
    const disabled = registry(['disabled'], implementation);
    disabled.descriptor = () => ({ capabilities: { sessionComments: false } });
    createTrackerSessionStatus({ registry: disabled }).processPayload(ready(1));
    expect(implementation).not.toHaveBeenCalled();
    let resolve;
    const pending = new Promise((done) => { resolve = done; });
    const createRuntime = vi.fn(consumer);
    const runtime = createTrackerSessionStatus({ registry: registry(['tracker'], async () => pending) });
    runtime.processPayload(ready(1)); runtime.forget('tracker'); runtime.stop();
    resolve({ sessionStatus: { createRuntime } }); await flush();
    runtime.processPayload(ready(2));
    expect(createRuntime).not.toHaveBeenCalled();
  });
});
