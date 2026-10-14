import { describe, expect, test } from 'bun:test';
import { getRuntimeLiveStatusSeed, rememberRuntimeLiveStatus } from './runtime-live-memory';
describe('native runtime live status seeds', () => {
  test('isolates identical session identities by runtime', () => {
    rememberRuntimeLiveStatus({ runtimeKey: 'runtime_a', directory: '/repo', sessionId: 'session', status: 'running' });
    expect(getRuntimeLiveStatusSeed('runtime_b', '/repo')).toBeNull();
    expect(getRuntimeLiveStatusSeed('runtime_a', '/repo')?.status).toBe('running');
  });
  test('authoritative idle and unavailable invalidate the addressed live seed', () => {
    for (const status of ['idle', 'unavailable'] as const) {
      rememberRuntimeLiveStatus({ runtimeKey: 'runtime_clear', directory: '/repo', sessionId: 'session', status: 'running' });
      rememberRuntimeLiveStatus({ runtimeKey: 'runtime_clear', directory: '/repo', sessionId: 'session', status });
      expect(getRuntimeLiveStatusSeed('runtime_clear', '/repo')).toBeNull();
    }
  });
  test('settling another session never clears the directory seed', () => {
    rememberRuntimeLiveStatus({ runtimeKey: 'runtime_sibling', directory: '/repo', sessionId: 'live', status: 'awaiting_input' });
    rememberRuntimeLiveStatus({ runtimeKey: 'runtime_sibling', directory: '/repo', sessionId: 'other', status: 'idle' });
    expect(getRuntimeLiveStatusSeed('runtime_sibling', '/repo')?.sessionId).toBe('live');
  });
});
