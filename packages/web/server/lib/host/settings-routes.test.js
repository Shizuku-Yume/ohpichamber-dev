import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { registerSettingsRoutes } from './settings-routes.js';

const createApp = (overrides = {}) => {
  const reads = [];
  const writes = [];
  const app = express();
  app.use(express.json());
  registerSettingsRoutes(app, {
    readSettingsFromDiskMigrated: async (options) => {
      reads.push(options);
      return { fontSize: 100 };
    },
    formatSettingsResponse: (settings) => ({ ...settings, formatted: true }),
    persistSettings: async (changes, options) => {
      writes.push({ changes, options });
      return { ...changes, persisted: true };
    },
    ...overrides,
  });
  return { app, reads, writes };
};

describe('Host settings routes', () => {
  it('reads through the migrated settings owner for the requested surface', async () => {
    const { app, reads } = createApp();

    const response = await request(app).get('/api/config/settings?surface=desktop').expect(200);

    expect(reads).toEqual([{ surface: 'desktop' }]);
    expect(response.body).toEqual({ fontSize: 100, formatted: true });
  });

  it('accepts the surface header only when the query parameter does not name a known surface', async () => {
    const { app, reads } = createApp();

    await request(app).get('/api/config/settings').set('x-openchamber-surface', 'mobile').expect(200);
    await request(app).get('/api/config/settings?surface=desktop').set('x-openchamber-surface', 'mobile').expect(200);
    await request(app).get('/api/config/settings?surface=toaster').set('x-openchamber-surface', 'mobile').expect(200);
    await request(app).get('/api/config/settings?surface=toaster').set('x-openchamber-surface', 'toaster').expect(200);

    expect(reads).toEqual([
      { surface: 'mobile' },
      { surface: 'desktop' },
      { surface: 'mobile' },
      { surface: null },
    ]);
  });

  it('persists the submitted body for the requested surface and returns the owner result', async () => {
    const { app, writes } = createApp();

    const response = await request(app)
      .put('/api/config/settings?surface=desktop')
      .send({ fontSize: 120 })
      .expect(200);

    expect(writes).toEqual([{ changes: { fontSize: 120 }, options: { surface: 'desktop' } }]);
    expect(response.body).toEqual({ fontSize: 120, persisted: true });
  });

  it('persists an empty document when no body is sent', async () => {
    const { app, writes } = createApp();

    await request(app).put('/api/config/settings').expect(200);

    expect(writes).toEqual([{ changes: {}, options: { surface: null } }]);
  });

  it('reports read and write failures as the established 500 errors', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const readFailure = createApp({
        readSettingsFromDiskMigrated: async () => {
          throw new Error('read failed');
        },
      });
      const writeFailure = createApp({
        persistSettings: async () => {
          throw new Error('write failed');
        },
      });

      const readResponse = await request(readFailure.app).get('/api/config/settings').expect(500);
      const writeResponse = await request(writeFailure.app).put('/api/config/settings').send({}).expect(500);

      expect(readResponse.body).toEqual({ error: 'Failed to read settings' });
      expect(writeResponse.body).toEqual({ error: 'Failed to save settings' });
    } finally {
      consoleError.mockRestore();
    }
  });
});
