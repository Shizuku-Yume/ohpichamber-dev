import { describe, expect, it, vi } from 'vitest';
<<<<<<< HEAD
import { createPermissionAutoAcceptRuntime, registerPermissionAutoAcceptRoutes } from './runtime.js';
=======
import { createPermissionAutoAcceptRuntime } from './runtime.js';
import { translateWireEvent, wireEventDirectory } from '../event-stream/translate-v2.js';
>>>>>>> bc50ba56a

const createRuntime = ({ stored, evaluatePermission, broadcastGlobalUiEvent, resolveSessionParent, onSessionPolicyChanged, beforePersist } = {}) => {
  let settings = stored ?? { permissionAutoAccept: { sessions: {} } };
  const runtime = createPermissionAutoAcceptRuntime({
    readSettingsFromDiskMigrated: async () => settings,
    persistSettings: async (changes) => {
      await beforePersist?.(changes);
      settings = { ...settings, ...changes };
    },
    broadcastGlobalUiEvent,
    evaluatePermission,
    resolveSessionParent,
    onSessionPolicyChanged,
  });
  return { runtime, getSettings: () => settings, observe: (session) => runtime.observeSession(session) };
};

const fakeApp = () => {
  const routes = new Map();
  return {
<<<<<<< HEAD
    routes,
    get: (path, handler) => routes.set(`GET ${path}`, handler),
    // Express handlers run left to right; the JSON parser is already satisfied
    // by the body the test hands the route.
    put: (path, ...handlers) => routes.set(`PUT ${path}`, handlers.at(-1)),
=======
    runtime,
    getSettings: () => settings,
    // The hub hands server-side subscribers already-translated events.
    emit: (payload, directory = '/project') => eventHandler({ payload, directory, translated: () => [payload] }),
    emitWire: (payload) => eventHandler({ payload, directory: wireEventDirectory(payload), translated: () => translateWireEvent(payload) }),
    connect: () => statusHandler({ type: 'connect' }),
>>>>>>> bc50ba56a
  };
};

const respond = () => {
  const res = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return res;
};

describe('permission auto-accept runtime', () => {
<<<<<<< HEAD
  it('persists explicit session modes and answers the pre-modes on/off shape', async () => {
    const { runtime, getSettings } = createRuntime();
    const first = await runtime.setSessionPolicy('root', 'safety');
    expect(first).toMatchObject({ modes: { root: 'safety' }, sessions: { root: true }, revision: 1 });
    const second = await runtime.setSessionPolicy('manual', 'ask');
    expect(second).toMatchObject({ modes: { root: 'safety', manual: 'ask' }, sessions: { root: true, manual: false }, revision: 2 });
    expect(getSettings().permissionAutoAccept).toEqual({ sessions: { root: 'safety', manual: 'ask' }, revision: 2 });
    // A restarted runtime reads the same policy.
    const restarted = createRuntime({ stored: getSettings() });
    await expect(restarted.runtime.load()).resolves.toEqual(second);
=======
  it.each(['ask', 'safety', 'auto'])('inherits %s through the real wire-event translator', async (mode) => {
    const broadcastGlobalUiEvent = vi.fn();
    const { runtime, emitWire } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { source: mode } }, permissionDefaultMode: 'auto' },
      broadcastGlobalUiEvent,
    });
    emitWire({
      id: 'evt_fork', created: 1000, type: 'session.forked',
      data: { sessionID: 'fork', parentID: 'source' },
      location: { directory: '/project' },
    });
    await expect(runtime.resolveSessionMode('fork', '/project')).resolves.toBe(mode);
    expect((await runtime.load()).modes.fork).toBe(mode);
    expect(broadcastGlobalUiEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'openchamber:permission-auto-accept.updated',
      properties: expect.objectContaining({ modes: { source: mode, fork: mode } }),
    }));
  });

  it('persists explicit session modes across runtime restarts', async () => {
    const first = createRuntime();
    await first.runtime.setSessionPolicy('root', 'safety');
    await first.runtime.setSessionPolicy('manual', 'ask');

    const second = createRuntime({ stored: first.getSettings() });
    // `sessions` keeps the on/off shape older clients read.
    await expect(second.runtime.load()).resolves.toEqual({
      sessions: { root: true, manual: false },
      modes: { root: 'safety', manual: 'ask' },
      revision: 2,
    });
>>>>>>> bc50ba56a
  });

  it('takes on/off callers as auto and ask and rejects anything else', async () => {
    const { runtime } = createRuntime();
    await runtime.setSessionPolicy('on', true);
    await runtime.setSessionPolicy('off', false);
    expect((await runtime.load()).modes).toEqual({ on: 'auto', off: 'ask' });
    await expect(runtime.setSessionPolicy('bad', 'always')).rejects.toThrow(TypeError);
  });

  it('fails closed to ask when the policy cannot be read', async () => {
    const runtime = createPermissionAutoAcceptRuntime({
      readSettingsFromDiskMigrated: async () => { throw new Error('unreadable'); },
      persistSettings: async () => { },
    });
    await expect(runtime.resolveSessionMode('root', '/repo')).resolves.toBe('ask');
    await expect(runtime.evaluateSessionPermission('root', { approvalId: 'p' }, '/repo')).resolves.toMatchObject({ mode: 'ask', action: 'hold' });
  });

  it('inherits the nearest explicit ancestor mode and fails closed on a failed lookup', async () => {
    const { runtime } = createRuntime({ stored: { permissionAutoAccept: { sessions: { root: 'auto', child: 'ask' } } } });
    await expect(runtime.resolveSessionMode('child', '/repo')).resolves.toBe('ask');
    await expect(runtime.resolveSessionMode('grandchild', '/repo')).resolves.toBe('ask');
    const failing = createRuntime({ stored: { permissionAutoAccept: { sessions: { root: 'auto' } } }, resolveSessionParent: async () => { throw new Error('unavailable'); } });
    await expect(failing.runtime.resolveSessionMode('unknown-child', '/repo')).resolves.toBe('ask');
  });

  it('accepts automatically in auto and only on a classifier accept in safety', async () => {
    const broadcastGlobalUiEvent = vi.fn();
    const { runtime } = createRuntime({ stored: { permissionAutoAccept: { sessions: { auto: 'auto', safe: 'safety' } } }, broadcastGlobalUiEvent });
    await expect(runtime.evaluateSessionPermission('auto', { approvalId: 'a1' }, '/repo')).resolves.toEqual({ mode: 'auto', action: 'accept' });
    // No classifier configured: safety holds rather than guessing.
    await expect(runtime.evaluateSessionPermission('safe', { approvalId: 's1' }, '/repo')).resolves.toEqual({ mode: 'safety', action: 'hold' });
    expect(broadcastGlobalUiEvent).toHaveBeenCalledWith({
      type: 'openchamber:permission-auto-accept.left-for-user',
      properties: { permissionId: 's1', sessionId: 'safe', directory: '/repo' },
    });
    const accept = createRuntime({ stored: { permissionAutoAccept: { sessions: { safe: 'safety' } } }, evaluatePermission: async () => ({ action: 'accept' }) });
    await expect(accept.runtime.evaluateSessionPermission('safe', { approvalId: 's2' }, '/repo')).resolves.toEqual({ mode: 'safety', action: 'accept' });
    // A throwing or holding classifier never accepts.
    const throwing = createRuntime({ stored: { permissionAutoAccept: { sessions: { safe: 'safety' } } }, evaluatePermission: async () => { throw new Error('jev down'); } });
    await expect(throwing.runtime.evaluateSessionPermission('safe', { approvalId: 's3' }, '/repo')).resolves.toMatchObject({ action: 'hold' });
    const holding = createRuntime({ stored: { permissionAutoAccept: { sessions: { safe: 'safety' } } }, evaluatePermission: async () => ({ action: 'hold' }) });
    await expect(holding.runtime.evaluateSessionPermission('safe', { approvalId: 's4' }, '/repo')).resolves.toMatchObject({ action: 'hold' });
  });

  it('never answers for an ask session', async () => {
    const { runtime } = createRuntime({ stored: { permissionAutoAccept: { sessions: { manual: 'ask' } } }, evaluatePermission: async () => ({ action: 'accept' }) });
    await expect(runtime.evaluateSessionPermission('manual', { approvalId: 'm1' }, '/repo')).resolves.toEqual({ mode: 'ask', action: 'hold' });
    await expect(runtime.isSessionAutoAccepting('manual', '/repo')).resolves.toBe(false);
  });

  it('reports whether a notification may skip a request', async () => {
    const { runtime } = createRuntime({ stored: { permissionAutoAccept: { sessions: { auto: 'auto' } } } });
    await expect(runtime.isPermissionAutoAnswered('auto', 'unseen', '/repo')).resolves.toBe(true);
    await expect(runtime.isPermissionAutoAnswered('manual', 'unseen', '/repo')).resolves.toBe(false);
  });

  it('writes the default mode onto a new top-level session only', async () => {
    const { runtime, getSettings } = createRuntime({ resolveSessionParent: async () => null });
    getSettings().permissionDefaultMode = 'safety';
    await runtime.applyDefaultMode('root');
    await expect(runtime.load()).resolves.toMatchObject({ modes: { root: 'safety' } });
    // A subagent inherits instead of receiving its own default.
    runtime.observeSession({ sessionId: 'child', parentSessionId: 'root', rootSessionId: 'root' });
    await runtime.applyDefaultMode('child');
    await expect(runtime.load()).resolves.toMatchObject({ modes: { root: 'safety' } });
    // A creating flow that already set a mode wins.
    await runtime.setSessionPolicy('explicit', 'ask');
    await runtime.applyDefaultMode('explicit');
    await expect(runtime.load()).resolves.toMatchObject({ modes: { root: 'safety', explicit: 'ask' } });
  });

  it('asks a session owner for lineage when no event has arrived', async () => {
    const resolveSessionParent = vi.fn(async () => 'parent');
    const { runtime, getSettings } = createRuntime({ resolveSessionParent, stored: { permissionAutoAccept: { sessions: { parent: 'auto' } } } });
    getSettings().permissionDefaultMode = 'auto';
    await runtime.applyDefaultMode('late-child');
    await expect(runtime.load()).resolves.toMatchObject({ modes: { parent: 'auto' } });
    await expect(runtime.resolveSessionMode('late-child', '/repo')).resolves.toBe('auto');
  });

  it('broadcasts the policy and reconsiders pending approvals on a mode change', async () => {
    const broadcastGlobalUiEvent = vi.fn();
    const onSessionPolicyChanged = vi.fn(async () => { });
    const { runtime } = createRuntime({ broadcastGlobalUiEvent, onSessionPolicyChanged });
    await runtime.setSessionPolicy('root', 'auto', '/repo');
    expect(broadcastGlobalUiEvent).toHaveBeenCalledWith({
      type: 'openchamber:permission-auto-accept.updated',
      properties: expect.objectContaining({ modes: { root: 'auto' }, sessions: { root: true }, revision: 1 }),
    });
    expect(onSessionPolicyChanged).toHaveBeenCalledWith('root', 'auto', '/repo');
  });

  it('serves GET and PUT with the exact wire shape', async () => {
    const { runtime } = createRuntime();
    const app = fakeApp();
    registerPermissionAutoAcceptRoutes(app, runtime);

    const getHandler = app.routes.get('GET /api/permission-auto-accept');
    const getRes = respond();
    await getHandler({}, getRes);
    expect(getRes.statusCode).toBe(200);
    expect(getRes.body).toEqual({ sessions: {}, modes: {}, revision: 0 });

    const putHandler = app.routes.get('PUT /api/permission-auto-accept/sessions/:sessionId');
    const putRes = respond();
    await putHandler({ params: { sessionId: 'root' }, body: { mode: 'safety', enabled: true, directory: '/repo' } }, putRes);
    expect(putRes.statusCode).toBe(200);
    expect(putRes.body).toEqual({ sessions: { root: true }, modes: { root: 'safety' }, revision: 1 });

    const legacyRes = respond();
    await putHandler({ params: { sessionId: 'legacy' }, body: { enabled: true } }, legacyRes);
    expect(legacyRes.body.modes.legacy).toBe('auto');

    const badRes = respond();
    await putHandler({ params: { sessionId: 'bad' }, body: { mode: 'always' } }, badRes);
    expect(badRes.statusCode).toBe(400);
  });

  it('keeps writing after one failed save', async () => {
    let failNext = true;
    const { runtime, getSettings } = createRuntime({
      beforePersist: async () => {
        if (!failNext) return;
        failNext = false;
        throw new Error('ENOSPC');
      },
    });
    await expect(runtime.setSessionPolicy('root', 'auto')).rejects.toThrow('ENOSPC');
    await expect(runtime.setSessionPolicy('root', 'safety')).resolves.toMatchObject({ modes: { root: 'safety' }, revision: 1 });
    expect(getSettings().permissionAutoAccept).toEqual({ sessions: { root: 'safety' }, revision: 1 });
  });
<<<<<<< HEAD
=======

  it('increments the authoritative policy revision', async () => {
    const { runtime, getSettings } = createRuntime();

    await expect(runtime.setSessionPolicy('root', true)).resolves.toMatchObject({ revision: 1 });
    await expect(runtime.setSessionPolicy('child', false)).resolves.toMatchObject({ revision: 2 });
    expect(getSettings().permissionAutoAccept.revision).toBe(2);
  });

  it.each(['ask', 'safety', 'auto'])('copies %s onto a fork independently of the default and later source changes', async (mode) => {
    const { runtime, emit, getSettings } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { source: mode } }, permissionDefaultMode: 'auto' },
    });
    emit({ type: 'session.forked', properties: { sessionID: 'fork', parentID: 'source' } });
    await expect(runtime.resolveSessionMode('fork', '/project')).resolves.toBe(mode);
    expect((await runtime.load()).modes.fork).toBe(mode);
    await runtime.setSessionPolicy('source', mode === 'ask' ? 'auto' : 'ask');
    emit({ type: 'session.forked', properties: { sessionID: 'fork', parentID: 'source' } });
    await expect(runtime.resolveSessionMode('fork', '/project')).resolves.toBe(mode);
    const restarted = createRuntime({ stored: getSettings() });
    await expect(restarted.runtime.resolveSessionMode('fork', '/project')).resolves.toBe(mode);
  });

  it('resolves the source lineage before answering the first permission in a fork', async () => {
    let release;
    const sourceRecord = new Promise((resolve) => { release = resolve; });
    const fetchImpl = vi.fn(async (url) => {
      if (new URL(url).pathname === '/api/session/source') return sourceRecord;
      return Response.json([]);
    });
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { ancestor: 'auto' } } }, fetchImpl,
    });
    emit({ type: 'session.forked', properties: { sessionID: 'fork', parentID: 'source' } });
    const firstPermission = runtime.processPermission({ id: 'first', sessionID: 'fork' }, '/project');
    await flush();
    expect(fetchImpl.mock.calls.some(([url]) => new URL(url).pathname.endsWith('/reply'))).toBe(false);
    release(Response.json({ id: 'source', parentID: 'ancestor', location: { directory: '/project' } }));
    await expect(firstPermission).resolves.toBe(true);
    expect((await runtime.load()).modes.fork).toBe('auto');
  });

  it('preserves an explicit fork choice made while source lineage is loading', async () => {
    let release;
    const sourceRecord = new Promise((resolve) => { release = resolve; });
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { ancestor: 'auto' } } },
      fetchImpl: async (url) => new URL(url).pathname === '/api/session/source' ? sourceRecord : Response.json([]),
    });
    emit({ type: 'session.forked', properties: { sessionID: 'fork', parentID: 'source' } });
    await flush();
    await runtime.setSessionPolicy('fork', 'ask');
    release(Response.json({ id: 'source', parentID: 'ancestor' }));
    await expect(runtime.resolveSessionMode('fork', '/project')).resolves.toBe('ask');
    expect((await runtime.load()).modes.fork).toBe('ask');
  });

  it('leaves a fork unconfigured when its source cannot be read', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { runtime, emit } = createRuntime({
        stored: { permissionAutoAccept: { sessions: {} }, permissionDefaultMode: 'auto' },
        fetchImpl: async () => new Response('', { status: 503 }),
      });
      emit({ type: 'session.forked', properties: { sessionID: 'fork', parentID: 'source' } });
      await expect(runtime.resolveSessionMode('fork', '/project')).resolves.toBe('ask');
      expect((await runtime.load()).modes).toEqual({});
      expect(warning).toHaveBeenCalled();
    } finally {
      warning.mockRestore();
    }
  });

  it('copies the source fallback ask even when new sessions default to auto', async () => {
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { sessions: {} }, permissionDefaultMode: 'auto' },
      fetchImpl: async (url) => Response.json(new URL(url).pathname === '/api/session/source' ? { id: 'source' } : []),
    });
    emit({ type: 'session.forked', properties: { sessionID: 'fork', parentID: 'source' } });
    await expect(runtime.resolveSessionMode('fork', '/project')).resolves.toBe('ask');
    expect((await runtime.load()).modes.fork).toBe('ask');
  });

  it('waits for inheritance when forking a newly forked session', async () => {
    const { runtime, emit } = createRuntime({ stored: { permissionAutoAccept: { sessions: { source: 'safety' } } } });
    emit({ type: 'session.forked', properties: { sessionID: 'first', parentID: 'source' } });
    emit({ type: 'session.forked', properties: { sessionID: 'second', parentID: 'first' } });
    await expect(runtime.resolveSessionMode('second', '/project')).resolves.toBe('safety');
    expect((await runtime.load()).modes).toEqual({ source: 'safety', first: 'safety', second: 'safety' });
  });

  it('keeps persisted policy after a failed fork write and allows later writes', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const beforePersist = vi.fn().mockRejectedValueOnce(new Error('disk unavailable'));
    try {
      const { runtime, emit, getSettings } = createRuntime({
        stored: { permissionAutoAccept: { sessions: { source: 'auto' } } }, beforePersist,
      });
      emit({ type: 'session.forked', properties: { sessionID: 'fork', parentID: 'source' } });
      await expect(runtime.resolveSessionMode('fork', '/project')).resolves.toBe('ask');
      expect(getSettings().permissionAutoAccept.sessions).toEqual({ source: 'auto' });
      await runtime.setSessionPolicy('other', 'ask');
      expect((await runtime.load()).modes).toEqual({ source: 'auto', other: 'ask' });
    } finally {
      warning.mockRestore();
    }
  });

  it('uses nearest explicit ancestor policy for subagents', async () => {
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: true, child: false } } },
    });
    emit({ type: 'session.created', properties: { info: { id: 'child', parentID: 'root' } } });
    emit({ type: 'session.created', properties: { info: { id: 'grandchild', parentID: 'child' } } });
    await expect(runtime.isSessionAutoAccepting('grandchild', '/project')).resolves.toBe(false);
    await runtime.setSessionPolicy('child', true);
    await expect(runtime.isSessionAutoAccepting('grandchild', '/project')).resolves.toBe(true);
  });

  it('keeps a subagent\'s lineage when a later partial update names only its title', async () => {
    const fetchImpl = vi.fn(async () => Response.json({}));
    const { runtime, emit } = createRuntime({ fetchImpl });
    await runtime.setSessionPolicy('root', true);
    emit({ type: 'session.created', properties: { info: { id: 'child', parentID: 'root', directory: '/project' } } });
    // v2 renames arrive as partial session records without parentID.
    emit({ type: 'session.updated', properties: { info: { id: 'child', title: 'Subagent' } } });
    emit({ type: 'permission.asked', properties: { id: 'p1', sessionID: 'child', permission: 'bash', metadata: {} } });
    await flush();
    const replies = fetchImpl.mock.calls.map(([url]) => new URL(url).pathname).filter((path) => path.endsWith('/reply'));
    expect(replies).toEqual(['/api/session/child/permission/p1/reply']);
  });

  it('fetches missing subagent lineage before replying', async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/api/permission/request') return new Response('[]');
      if (path === '/api/session/child') return Response.json({ id: 'child', parentID: 'root', directory: '/project' });
      if (init.method === 'POST') return Response.json({});
      return new Response('', { status: 404 });
    });
    const { runtime } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: true } } },
      fetchImpl,
    });
    await expect(runtime.processPermission({ id: 'perm', sessionID: 'child' }, '/project')).resolves.toBe(true);
    // v2 scopes a permission reply under its session.
    expect(fetchImpl.mock.calls.some(([url, init]) => new URL(url).pathname === '/api/session/child/permission/perm/reply' && init.method === 'POST')).toBe(true);
  });

  it('fetches the lineage of a subagent first seen through a partial update', async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/api/session/child') return Response.json({ data: { id: 'child', parentID: 'root', location: { directory: '/project' } } });
      if (init.method === 'POST') return Response.json({});
      return new Response('[]');
    });
    const { runtime, emit } = createRuntime({ stored: { permissionAutoAccept: { sessions: { root: 'auto' } } }, fetchImpl });
    // After a restart, a running subagent's first event is its usage update,
    // which carries no parentID.
    emit({ type: 'session.updated', properties: { info: { id: 'child', cost: 0.1 } } });
    await expect(runtime.processPermission({ id: 'perm', sessionID: 'child' }, '/project')).resolves.toBe(true);
    await expect(runtime.isPermissionAutoAnswered('child', '/project', 'perm')).resolves.toBe(true);
    expect(fetchImpl.mock.calls.some(([url, init]) => new URL(url).pathname === '/api/session/child/permission/perm/reply' && init.method === 'POST')).toBe(true);
  });

  it('trusts a created session without a parent as top-level', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]'));
    const { runtime, emit } = createRuntime({ fetchImpl });
    emit({ type: 'session.created', properties: { info: { id: 'root' } } });
    emit({ type: 'session.updated', properties: { info: { id: 'root', title: 'Renamed' } } });
    await expect(runtime.resolveSessionMode('root', '/project')).resolves.toBe('ask');
    expect(fetchImpl.mock.calls.some(([url]) => new URL(url).pathname === '/api/session/root')).toBe(false);
  });

  it('retries a failed lineage lookup before leaving the request for the user', async () => {
    let lookups = 0;
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/api/session/child') {
        lookups += 1;
        return lookups === 1 ? new Response('', { status: 503 }) : Response.json({ id: 'child', parentID: 'root' });
      }
      if (init.method === 'POST') return Response.json({});
      return new Response('[]');
    });
    const { runtime } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: 'auto' } } },
      fetchImpl,
      retryDelaysMs: [0, 0],
    });
    await expect(runtime.processPermission({ id: 'perm', sessionID: 'child' }, '/project')).resolves.toBe(true);
    expect(lookups).toBe(2);
    expect(fetchImpl.mock.calls.some(([url, init]) => new URL(url).pathname === '/api/session/child/permission/perm/reply' && init.method === 'POST')).toBe(true);
  });

  it('lets notifications wait for the retried reply when their own lineage lookup fails', async () => {
    let replyLookups = 0;
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/api/session/child') {
        // The notification asks with another directory; its lookup always fails.
        if (directoryHeader(init) === '/notify') return new Response('', { status: 503 });
        replyLookups += 1;
        return replyLookups === 1 ? new Response('', { status: 503 }) : Response.json({ id: 'child', parentID: 'root' });
      }
      if (init.method === 'POST') return Response.json({});
      return new Response('[]');
    });
    const { runtime } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: 'auto' } } },
      fetchImpl,
      retryDelaysMs: [0, 0],
    });
    const replied = runtime.processPermission({ id: 'perm', sessionID: 'child' }, '/project');
    await expect(runtime.isPermissionAutoAnswered('child', '/notify', 'perm')).resolves.toBe(true);
    await expect(replied).resolves.toBe(true);
  });

  it('retries a transient reply failure and deduplicates concurrent events', async () => {
    let replyAttempts = 0;
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/api/permission/request') return new Response('[]');
      if (path === '/api/session/root/permission/perm/reply' && init.method === 'POST') {
        replyAttempts += 1;
        return replyAttempts === 1 ? new Response('', { status: 503 }) : Response.json({});
      }
      return Response.json({ id: 'root' });
    });
    const { runtime } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: true } } },
      fetchImpl,
      retryDelaysMs: [0, 0],
    });
    const permission = { id: 'perm', sessionID: 'root' };
    const first = runtime.processPermission(permission, '/project');
    const second = runtime.processPermission(permission, '/project');
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(replyAttempts).toBe(2);
  });

  it('reconciles pending permissions after reconnect in the directories of running sessions', async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/api/session/active') return Response.json({ data: { root: { type: 'running' } } });
      if (path === '/api/session/root') return Response.json({ data: { id: 'root', location: { directory: '/project' } } });
      if (path === '/api/permission/request') {
        return Response.json(directoryHeader(init) === '/project' ? [{ id: 'pending', sessionID: 'root' }] : []);
      }
      if (path === '/api/session/root/permission/pending/reply' && init.method === 'POST') return Response.json({});
      return new Response('', { status: 404 });
    });
    const { connect } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: true } } },
      fetchImpl,
    });
    connect();
    // The reconcile chain reads settings and response bodies, so its length in
    // microtasks is not fixed; wait for the reply instead of counting ticks.
    await vi.waitFor(() => {
      expect(fetchImpl.mock.calls.some(([url]) => new URL(url).pathname === '/api/session/root/permission/pending/reply')).toBe(true);
    });
  });

  // A list without a directory answers for OpenCode's working directory only
  // and makes OpenCode start it, MCP servers included.
  it('never lists pending permissions without a directory', async () => {
    const fetchImpl = vi.fn(async (url) => {
      const path = new URL(url).pathname;
      if (path === '/api/session/active') return Response.json({ data: {} });
      return Response.json([]);
    });
    const { runtime, connect } = createRuntime({ fetchImpl });
    connect();
    await runtime.reconcilePending();

    const lists = fetchImpl.mock.calls.filter(([url]) => new URL(url).pathname === '/api/permission/request');
    expect(lists).toEqual([]);
  });

  it('accepts existing pending permissions when a session policy is enabled', async () => {
    const fetchImpl = vi.fn(async (url, init = {}) => {
      const parsed = new URL(url);
      const path = parsed.pathname;
      if (path === '/api/permission/request') {
        return directoryHeader(init) === '/project'
          ? Response.json([
            { id: 'root-pending', sessionID: 'root' },
            { id: 'other-pending', sessionID: 'other' },
          ])
          : Response.json([]);
      }
      if (path === '/api/session/root/permission/root-pending/reply' && init.method === 'POST') return Response.json({});
      if (path === '/api/session/other') return Response.json({ id: 'other' });
      return new Response('', { status: 404 });
    });
    const { runtime } = createRuntime({ fetchImpl });

    await runtime.setSessionPolicy('root', true, '/project');

    const replyPaths = fetchImpl.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([url]) => new URL(url).pathname);
    expect(replyPaths).toEqual(['/api/session/root/permission/root-pending/reply']);
    // OpenCode 2.x scopes the pending list by header, not by query.
    expect(fetchImpl.mock.calls.some(([, init]) => directoryHeader(init) === '/project')).toBe(true);
    expect(await runtime.load()).toEqual({ sessions: { root: true }, modes: { root: 'auto' }, revision: 1 });
  });

  it('leaves a request held by the safety net unanswered and forgets it once replied', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]'));
    const verdicts = { held: { action: 'hold', score: 0.9, kind: 'git_history' }, safe: { action: 'accept', score: 0.1 } };
    const evaluatePermission = vi.fn(async (permission) => verdicts[permission.id]);
    const onPermissionReplied = vi.fn();
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: 'safety' } } },
      fetchImpl,
      evaluatePermission,
      onPermissionReplied,
    });
    await runtime.load();

    emit({ type: 'permission.asked', properties: { id: 'held', sessionID: 'root', permission: 'bash', metadata: {} } });
    emit({ type: 'permission.asked', properties: { id: 'safe', sessionID: 'root', permission: 'bash', metadata: {} } });
    await flush();

    const replies = fetchImpl.mock.calls.filter(([url]) => String(url).includes('/reply'));
    expect(replies.map(([url]) => String(url))).toEqual(['http://opencode.test/api/session/root/permission/safe/reply']);
    expect(directoryHeader(replies[0]?.[1])).toBe('/project');
    expect(evaluatePermission).toHaveBeenCalledTimes(2);

    // Notifications skip only the request that was answered.
    await expect(runtime.isPermissionAutoAnswered('root', '/project', 'safe')).resolves.toBe(true);
    await expect(runtime.isPermissionAutoAnswered('root', '/project', 'held')).resolves.toBe(false);

    emit({ type: 'permission.replied', properties: { sessionID: 'root', requestID: 'held', reply: 'once' } });
    expect(onPermissionReplied).toHaveBeenCalledWith('held');
  });

  it('tells clients about every request it left for the user, and only those', async () => {
    const fetchImpl = vi.fn(async (url) => (
      String(url).endsWith('/permission/broken/reply') ? new Response('', { status: 500 }) : Response.json({})
    ));
    const verdicts = { held: { action: 'hold' }, safe: { action: 'accept' }, broken: { action: 'accept' } };
    const broadcastGlobalUiEvent = vi.fn();
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: 'safety', manual: 'ask' } } },
      fetchImpl,
      evaluatePermission: async (permission) => verdicts[permission.id],
      broadcastGlobalUiEvent,
    });
    await runtime.load();

    for (const [id, sessionID] of [['held', 'root'], ['safe', 'root'], ['broken', 'root'], ['asked', 'manual']]) {
      emit({ type: 'permission.asked', properties: { id, sessionID } });
    }
    await flush();

    const leftForUser = broadcastGlobalUiEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === 'openchamber:permission-auto-accept.left-for-user');
    expect(leftForUser).toEqual([
      { type: 'openchamber:permission-auto-accept.left-for-user', properties: { permissionId: 'held', sessionId: 'root', directory: '/project' } },
      { type: 'openchamber:permission-auto-accept.left-for-user', properties: { permissionId: 'broken', sessionId: 'root', directory: '/project' } },
    ]);
  });

  it('never consults the safety net in an auto session', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]'));
    const evaluatePermission = vi.fn(async () => ({ action: 'hold' }));
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: 'auto' } } },
      fetchImpl,
      evaluatePermission,
    });
    await runtime.load();
    emit({ type: 'permission.asked', properties: { id: 'p', sessionID: 'root', permission: 'bash', metadata: {} } });
    await flush();
    expect(evaluatePermission).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith('/permission/p/reply'))).toBe(true);
    await expect(runtime.isPermissionAutoAnswered('root', '/project', 'p')).resolves.toBe(true);
  });

  it('leaves a safety request for the user when the safety net gives no verdict', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]'));
    const { runtime, emit } = createRuntime({
      stored: { permissionAutoAccept: { sessions: { root: 'safety' } } },
      fetchImpl,
      evaluatePermission: async () => ({ action: 'hold', skipped: 'Jev timed out' }),
    });
    await runtime.load();
    emit({ type: 'permission.asked', properties: { id: 'p', sessionID: 'root', permission: 'bash', metadata: {} } });
    await flush();
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/reply'))).toBe(false);
  });

  it('does not consult the safety net for sessions that are not auto-accepting', async () => {
    const evaluatePermission = vi.fn(async () => ({ action: 'hold' }));
    const { runtime, emit } = createRuntime({ evaluatePermission });
    await runtime.load();
    emit({ type: 'permission.asked', properties: { id: 'p', sessionID: 'manual', permission: 'bash', metadata: {} } });
    await flush();
    expect(evaluatePermission).not.toHaveBeenCalled();
  });
>>>>>>> bc50ba56a
});
