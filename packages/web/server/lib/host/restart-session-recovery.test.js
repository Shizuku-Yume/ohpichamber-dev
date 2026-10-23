import { describe, expect, it } from 'vitest';
import { createSessionRuntime } from './session-runtime.js';
import { createGlobalMessageStreamHub } from '../event-stream/global-hub.js';
import { deferred, encodeEvent, event, scope, snapshot, streamBoundary } from '../event-stream/canonical-test-fixtures.js';

describe('canonical Agent Service restart activity recovery', () => {
  it('reports Host interruption once and replaces activity from the new snapshot/epoch before live events', async () => {
    const events = []; const before = streamBoundary(); const after = streamBoundary();
    let boundary = before;
    const service = { request: (path, init) => boundary === after && path.endsWith('/snapshot')
      ? Promise.resolve(Response.json(snapshot([], [], { epoch: 'replacement' }))) : boundary.service.request(path, init) };
    const runtime = createSessionRuntime({ broadcastEvent: (payload) => events.push(payload) });
    const hub = createGlobalMessageStreamHub({ service, resolveSessionScope: async () => scope });
    hub.subscribeSnapshot(runtime.applySnapshot); hub.subscribeEvent(runtime.processCanonicalEvent);
    const first = deferred(); const resumed = deferred();
    hub.subscribeFrame(({ event: record }) => (record.epoch === 'epoch' ? first : resumed).resolve());
    try {
      await hub.start(['session']);
      before.push(encodeEvent(event(1, { type: 'run.started', runId: 'run', createdAt: 1 })));
      await first.promise; expect(runtime.getActiveSessionCount()).toBe(1);
      await hub.stop(); expect(before.cancelled()).toBe(true);
      events.length = 0;
      expect(runtime.interruptBusySessionsAfterRestart()).toEqual({ sessionIds: ['session'] });
      expect(runtime.getSessionState('session')).toMatchObject({ status: 'unavailable', activeRunId: null, metadata: { reason: 'agent-service-restart' } });
      expect(runtime.getActiveSessionCount()).toBe(0);
      expect(events.filter((record) => record.type === 'openchamber:session-interrupted')).toEqual([
        { type: 'openchamber:session-interrupted', properties: { sessionId: 'session', reason: 'agent-service-restart' } },
      ]);
      expect(events.some((record) => record.type === 'session.error')).toBe(false);
      const count = events.length;
      expect(runtime.interruptBusySessionsAfterRestart()).toEqual({ sessionIds: [] }); expect(events).toHaveLength(count);
      boundary = after; await hub.start(['session']);
      expect(after.calls[0].init.headers['Last-Event-ID']).toBe('replacement:0');
      expect(runtime.getSessionState('session')).toMatchObject({ status: 'idle', metadata: {} });
      after.push(encodeEvent(event(1, { type: 'run.started', epoch: 'replacement', runId: 'new-run', createdAt: 2 })));
      await resumed.promise;
      expect(runtime.getActiveSessionCount()).toBe(1);
      expect(runtime.getSessionState('session')).toMatchObject({ status: 'running', activeRunId: 'new-run', lastEventId: 'replacement:1' });
      expect(JSON.stringify(events)).not.toContain(scope.cwd);
    } finally { await hub.stop(); runtime.dispose(); }
  });
});
