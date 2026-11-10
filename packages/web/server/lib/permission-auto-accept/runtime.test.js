import { describe, expect, it, vi } from 'vitest';
import { createPermissionAutoAcceptRuntime, registerPermissionAutoAcceptRoutes } from './runtime.js';

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
    routes,
    get: (path, handler) => routes.set(`GET ${path}`, handler),
    // Express handlers run left to right; the JSON parser is already satisfied
    // by the body the test hands the route.
    put: (path, ...handlers) => routes.set(`PUT ${path}`, handlers.at(-1)),
  };
};

const respond = () => {
  const res = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  return res;
};

describe('permission auto-accept runtime', () => {
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
});
