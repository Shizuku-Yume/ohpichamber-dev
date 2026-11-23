import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { registerNotificationRoutes } from '../notifications/routes.js';
import { createBootstrapRuntime } from './bootstrap-runtime.js';

vi.mock('../host/canonical-routes.js', () => ({ registerCanonicalHostRoutes: vi.fn() }));

const setup = ({ context = {}, clearSessionPushNotifications, getContext = () => context } = {}) => {
  const app = express();
  const clearPendingPushBadge = vi.fn();
  createBootstrapRuntime({
    express,
    createUiAuth: () => ({ enabled: false }),
    registerServerStatusRoutes: vi.fn(),
    registerCommonRequestMiddleware: vi.fn(),
    registerAuthAndAccessRoutes: vi.fn(),
    registerTtsRoutes: vi.fn(),
    registerOpenChamberRoutes: vi.fn(),
    registerNotificationRoutes,
  }).setupBaseRoutes(app, {
    ensureGlobalWatcherStarted: async () => {},
    clearPendingPushBadge,
    clearSessionPushNotifications,
    sessionRuntime: {
      getSessionActivitySnapshot: () => ({}),
      getSessionStateSnapshot: () => ({}),
      getPendingBlockingRequestsSnapshot: () => ({}),
      getSessionState: () => null,
      getSessionContextSnapshot: getContext,
    },
  });
  app.use((_error, _req, res, _next) => res.status(500).json({ error: 'context unavailable' }));
  return { app, clearPendingPushBadge };
};

describe('notification bootstrap composition', () => {
  it('exposes the captured context and clears the viewed or answered session through its owner', async () => {
    const clear = vi.fn(async () => {});
    const context = { session: { used: 42 } };
    const { app, clearPendingPushBadge } = setup({ context, clearSessionPushNotifications: clear });
    const response = await request(app).get('/api/sessions/status').expect(200);
    expect(response.body.context).toEqual(context);
    await request(app).post('/api/sessions/session/view').expect(200);
    await request(app).post('/api/sessions/session/message-sent').expect(200);
    expect(clear.mock.calls).toEqual([['session', { viewed: true }], ['session']]);
    expect(clearPendingPushBadge).toHaveBeenCalledTimes(2);
  });

  it('preserves an empty authoritative context and permits absent optional push cleanup', async () => {
    const { app } = setup();
    expect((await request(app).get('/api/sessions/status').expect(200)).body.context).toEqual({});
    await request(app).post('/api/sessions/session/view').expect(200);
  });

  it('does not turn a context read failure into an empty snapshot', async () => {
    const { app } = setup({ getContext: () => { throw new Error('unavailable'); } });
    await request(app).get('/api/sessions/status').expect(500);
  });
});
