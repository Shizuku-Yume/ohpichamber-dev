import { describe, expect, it, vi } from 'vitest';
import { createGlobalMessageStreamHub } from './global-hub.js';
import { deferred, encodeEvent, event, scope, snapshot, streamBoundary } from './canonical-test-fixtures.js';

const fixture = (options = {}) => {
  const boundary = streamBoundary();
  const hub = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: async () => scope, ...options });
  return { hub, ...boundary };
};

describe('canonical global event hub', () => {
  it('resolves Host scope before private access and starts from the captured snapshot cursor', async () => {
    const gate = deferred(); const boundary = streamBoundary();
    const hub = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: () => gate.promise });
    const opened = hub.subscribeSession('session');
    expect(boundary.calls).toEqual([]);
    gate.resolve(scope); await opened;
    expect(boundary.calls.map((call) => call.path)).toEqual(['/api/agent/v1/sessions/session/snapshot', '/api/agent/v1/sessions/session/events']);
    expect(boundary.calls[1].init.headers['Last-Event-ID']).toBe('epoch:0');
    await hub.stop(); expect(boundary.cancelled()).toBe(true);
  });

  it('hydrates parsed snapshot consumers before opening the cursor stream or announcing ready', async () => {
    const { hub, calls } = fixture(); const entered = deferred(); const release = deferred();
    hub.subscribeSnapshot(async (captured, resolved) => {
      expect(captured.cursor).toBe('epoch:0'); expect(resolved).toBe(scope);
      entered.resolve(); await release.promise;
    });
    const opened = hub.start(['session']); await entered.promise;
    expect(calls.map((call) => call.path)).toEqual(['/api/agent/v1/sessions/session/snapshot']);
    expect(hub.hasConnected()).toBe(false);
    release.resolve(); await opened;
    expect(calls[1].init.headers['Last-Event-ID']).toBe('epoch:0');
    await hub.stop();
  });

  it('delivers parsed events and private scopes in order even while a consumer awaits', async () => {
    const { hub, push } = fixture(); const gate = deferred(); const seen = [];
    const complete = deferred();
    const seenFirst = deferred();
    hub.subscribeEvent(async (record, resolved) => {
      seen.push([record.sequence, resolved.cwd]);
      if (record.sequence === '1') {
        seenFirst.resolve();
        await gate.promise;
      }
    });
    hub.subscribeEvent((record) => { if (record.sequence === '2') complete.resolve(); });
    await hub.start(['session']);
    const frame = encodeEvent(event(1)); push(frame.slice(0, 9)); push(frame.slice(9) + encodeEvent(event(2)));
    await seenFirst.promise;
    expect(seen).toEqual([['1', scope.cwd]]);
    gate.resolve(); await complete.promise;
    expect(seen).toEqual([['1', scope.cwd], ['2', scope.cwd]]);
    await hub.stop();
  });

  it('retains a count/UTF-8 byte-bounded contiguous suffix without dropping oversized live events', async () => {
    const { hub, push } = fixture({ replayLimit: 2, replayByteLimit: 800 }); const frames = []; const done = deferred();
    hub.subscribeFrame((frame) => { frames.push(frame); if (frames.length === 5) done.resolve(); });
    await hub.start(['session']);
    push([event(1), event(2), event(3, { delta: '界'.repeat(1024) }), event(4), event(5)].map(encodeEvent).join(''));
    await done.promise;
    expect(frames[2].event.delta).toHaveLength(1024);
    expect(hub.replayAfter(frames[0].eventId)).toBeNull();
    expect(hub.replayAfter(frames[3].eventId).map((entry) => entry.eventId)).toEqual([frames[4].eventId]);
    expect(hub.replayAfter(frames[4].eventId)).toEqual([]);
    await hub.stop();
    expect(hub.replayAfter(frames[3].eventId)).toHaveLength(1);
  });

  it('resumes only after its delivered canonical cursor and ignores same-epoch duplicates', async () => {
    const boundary = streamBoundary(); const hub = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: async () => scope });
    const seen = []; const done = deferred();
    hub.subscribeEvent((record) => { seen.push(record.sequence); done.resolve(); });
    await hub.subscribeSession('session', { cursor: 'epoch:7' });
    boundary.push(encodeEvent(event(7)) + encodeEvent(event(8))); await done.promise;
    expect(seen).toEqual(['8']); expect(boundary.calls).toHaveLength(1);
    expect(boundary.calls[0].init.headers['Last-Event-ID']).toBe('epoch:7');
    await hub.stop();
  });

  it('invalidates replay and stops applying the stream after a control invalidation or sequence gap', async () => {
    for (const bad of [
      'event: stream.invalidated\ndata: {"type":"stream.invalidated","sessionId":"session","epoch":"epoch","reason":"EPOCH_CHANGED"}\n\n',
      encodeEvent(event(3)),
    ]) {
      const { hub, push } = fixture(); const seen = []; const done = deferred();
      hub.subscribeEvent((record) => seen.push(record.sequence));
      hub.subscribeStatus((status) => { if (status.type === 'disconnect') done.resolve(); });
      await hub.start(['session']); push(encodeEvent(event(1)) + bad + encodeEvent(event(4))); await done.promise;
      expect(seen).toEqual(['1']); expect(hub.replayAfter('unknown')).toBeNull(); expect(hub.isConnected()).toBe(false);
      await hub.stop();
    }
  });

  it('cancels subscriptions without retries or applying buffered events after unsubscribe', async () => {
    const { hub, push, calls, cancelled } = fixture(); const seen = []; const entered = deferred(); const gate = deferred();
    hub.subscribeEvent(async (record) => { seen.push(record.sequence); entered.resolve(); await gate.promise; });
    await hub.start(['session']); push(encodeEvent(event(1)) + encodeEvent(event(2))); await entered.promise;
    const stopped = hub.unsubscribeSession('session'); gate.resolve(); await stopped;
    expect(seen).toEqual(['1']); expect(cancelled()).toBe(true); expect(calls).toHaveLength(2);
    await hub.stop();
  });

  it('does not announce readiness for an incomplete scope or a successful non-stream response', async () => {
    const boundary = streamBoundary();
    const incomplete = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: async () => ({ workspaceId: 'workspace', cwd: '/private', rootSessionId: 'session' }) });
    await expect(incomplete.subscribeSession('session')).rejects.toThrow('unavailable');
    expect(boundary.calls).toEqual([]); expect(incomplete.hasConnected()).toBe(false);
    await incomplete.stop();
    const statuses = [];
    const service = { request: async () => new Response('{"ready":true}', { headers: { 'Content-Type': 'application/json' } }) };
    const hub = createGlobalMessageStreamHub({ service, resolveSessionScope: async () => scope });
    hub.subscribeStatus((status) => statuses.push(status));
    await expect(hub.subscribeSession('session', { cursor: 'epoch:0' })).rejects.toThrow('unavailable');
    expect(hub.isConnected()).toBe(false); expect(hub.hasConnected()).toBe(false);
    expect(statuses.map((status) => status.type)).toEqual(['initial-error']);
    await hub.stop();
  });

  it('reports unavailable scope/service truthfully without exposing private errors', async () => {
    const statuses = [];
    const service = { request: vi.fn(async () => new Response('/private/path credential=secret', { status: 410 })) };
    const hub = createGlobalMessageStreamHub({ service, resolveSessionScope: async () => scope });
    hub.subscribeStatus((status) => statuses.push(status));
    await expect(hub.subscribeSession('session', { cursor: 'epoch:0' })).rejects.toThrow('unavailable');
    expect(statuses).toMatchObject([{ type: 'initial-error', error: { code: 'RESYNC_REQUIRED', status: 410 } }]);
    expect(JSON.stringify(statuses)).not.toContain('credential');
    await hub.stop();
  });

  it('tracks session leases, shares the active stream, and tears down only when the last lease is released', async () => {
    const { hub, calls, cancelled } = fixture();
    const firstLease = await hub.retainSession('session', 'lease-1');
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-1']);
    expect(calls).toHaveLength(2); // snapshot + events

    // Second lease shares the active stream without duplicate connection calls
    const secondLease = await hub.retainSession('session', 'lease-2');
    expect(hub.getSessionLeases('session')).toEqual(['lease-1', 'lease-2']);
    expect(calls).toHaveLength(2);

    // Releasing first lease keeps stream connected
    await firstLease.release();
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-2']);
    expect(cancelled()).toBe(false);

    // Releasing final lease triggers teardown
    await secondLease.release();
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(hub.hasLeases('session')).toBe(false);
    expect(cancelled()).toBe(true);

    await hub.stop();
  });

  it('ref-counts multiple retains of the same lease key and unsubscribes only when all instances are released', async () => {
    const { hub, calls, cancelled } = fixture();
    const run1 = await hub.retainSession('session', 'run');
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['run']);

    // Second retain with the same lease key (repeat subscribe / concurrent run)
    const run2 = await hub.retainSession('session', 'run');
    expect(hub.getSessionLeases('session')).toEqual(['run']);
    expect(calls).toHaveLength(2); // shared connection, no duplicate network calls

    // Retain a different lease key as well
    const wsClient = await hub.retainSession('session', 'ws-client');
    expect(hub.getSessionLeases('session')).toEqual(['run', 'ws-client']);

    // First run releases: stream remains active because second 'run' and 'ws-client' are active
    await run1.release();
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['run', 'ws-client']);
    expect(cancelled()).toBe(false);

    // wsClient releases: stream remains active because second 'run' is still active
    await wsClient.release();
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['run']);
    expect(cancelled()).toBe(false);

    // Final run releases: triggers teardown and unsubscription
    await run2.release();
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.getSessionLeases('session')).toEqual([]);
    expect(cancelled()).toBe(true);

    await hub.stop();
  });

  it('guards against underflow and premature teardown on duplicate or unacquired releaseSession calls', async () => {
    const { hub, cancelled } = fixture();

    // Releasing an unacquired lease is a safe no-op with no underflow
    await hub.releaseSession('session', 'nonexistent');
    expect(hub.hasLeases('session')).toBe(false);

    const lease = await hub.retainSession('session', 'active-lease');
    expect(hub.hasLeases('session')).toBe(true);

    // Releasing a different nonexistent lease does not affect active leases
    await hub.releaseSession('session', 'other');
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['active-lease']);

    // Releasing the active lease triggers teardown
    await lease.release();
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(cancelled()).toBe(true);

    // Calling releaseSession again on already-released lease does not throw or underflow
    await hub.releaseSession('session', 'active-lease');
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.getSessionLeases('session')).toEqual([]);

    await hub.stop();
  });

  it('cleans up leases without leak when retainSession fails', async () => {
    const boundary = streamBoundary();
    boundary.service.request = async () => new Response('Unavailable', { status: 503 });
    const hub = createGlobalMessageStreamHub({ service: boundary.service, resolveSessionScope: async () => scope });

    await expect(hub.retainSession('session', 'lease-failing')).rejects.toThrow();
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.getSessionLeases('session')).toEqual([]);
    expect(hub.isSessionConnected('session')).toBe(false);

    await hub.stop();
  });

  it('preserves active leases across connection drops and reconnects', async () => {
    let controller;
    const service = {
      async request(path) {
        if (path.endsWith('/snapshot')) return Response.json(snapshot());
        const body = new ReadableStream({ start(c) { controller = c; } });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      },
    };
    const hub = createGlobalMessageStreamHub({ service, resolveSessionScope: async () => scope });
    const lease = await hub.retainSession('session', 'lease-reconnect');
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.isSessionConnected('session')).toBe(true);

    // Terminate stream
    const disconnected = deferred();
    hub.subscribeStatus((status) => {
      if (status.type === 'disconnect') disconnected.resolve();
    });
    controller.close();
    await disconnected.promise;

    expect(hub.isSessionConnected('session')).toBe(false);
    // Active lease is still tracked while disconnected
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-reconnect']);

    // Reconnect: subscribeSession reconnects while preserving existing leases
    await hub.subscribeSession('session');
    expect(hub.isSessionConnected('session')).toBe(true);
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-reconnect']);

    // Releasing lease after reconnect properly tears down the stream
    await lease.release();
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(hub.hasLeases('session')).toBe(false);

    await hub.stop();
  });

  it('cleans up all leases and tears down stream when unsubscribeSession is called directly on deletion/archive', async () => {
    const { hub, cancelled } = fixture();
    await hub.retainSession('session', 'lease-1');
    await hub.retainSession('session', 'lease-2');
    expect(hub.hasLeases('session')).toBe(true);
    expect(hub.getSessionLeases('session')).toEqual(['lease-1', 'lease-2']);

    // Simulating session.deleted or archive deletion
    await hub.unsubscribeSession('session');
    expect(hub.hasLeases('session')).toBe(false);
    expect(hub.getSessionLeases('session')).toEqual([]);
    expect(hub.isSessionConnected('session')).toBe(false);
    expect(cancelled()).toBe(true);

    await hub.stop();
  });
});
