import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerNotificationChannelRoutes } from './channel-routes.js';

describe('registerNotificationChannelRoutes', () => {
  it('serves GET, PUT, and DELETE for notification channels', async () => {
    const app = express();
    const channels = {
      list: async () => [{ providerId: 'test-chan', name: 'Test' }],
      connect: async ({ providerId, token }) => ({ providerId, connected: Boolean(token) }),
      disconnect: async ({ providerId }) => ({ removed: true, providerId }),
    };
    registerNotificationChannelRoutes(app, { channels });

    const getRes = await request(app).get('/api/notifications/channels').expect(200);
    expect(getRes.body).toEqual({ channels: [{ providerId: 'test-chan', name: 'Test' }] });

    const putRes = await request(app)
      .put('/api/notifications/channels/test-chan/account')
      .send({ token: 'tok_123' })
      .expect(200);
    expect(putRes.body).toEqual({ channel: { providerId: 'test-chan', connected: true } });

    const delRes = await request(app)
      .delete('/api/notifications/channels/test-chan/account')
      .expect(200);
    expect(delRes.body).toEqual({ removed: true, providerId: 'test-chan' });
  });

  it('translates errors to proper status and code', async () => {
    const app = express();
    const channels = {
      list: async () => {
        throw Object.assign(new Error('Unknown channel'), { status: 404, code: 'CHANNEL_UNKNOWN' });
      },
    };
    registerNotificationChannelRoutes(app, { channels });

    const res = await request(app).get('/api/notifications/channels').expect(404);
    expect(res.body).toEqual({ error: 'Unknown channel', code: 'CHANNEL_UNKNOWN' });
  });
});
