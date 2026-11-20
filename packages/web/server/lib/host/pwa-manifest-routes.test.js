import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { registerPwaManifestRoute } from '../appearance/pwa-manifest-routes.js';

const canonicalSession = (sessionId, title, updatedAt, extra = {}) => ({
  sessionId,
  projectId: 'pro_1',
  workspaceId: 'ws_1',
  displayPath: 'app',
  rootSessionId: sessionId,
  createdAt: 1,
  updatedAt,
  epoch: 'epoch-1',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  title: title === null ? undefined : title,
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
  ...extra,
});

const createApp = (overrides = {}) => {
  const app = express();
  registerPwaManifestRoute(app, {
    resolveProjectDirectory: async () => ({ directory: '/workspace/app' }),
    listSessions: async () => ({ items: [], errors: {} }),
    readSettingsFromDiskMigrated: async () => ({}),
    normalizePwaAppName: (value, fallback) => value?.trim() || fallback,
    normalizePwaOrientation: (value, fallback) => value?.trim() || fallback,
    isRequestAuthorized: async () => true,
    ...overrides,
  });
  return app;
};

describe('PWA manifest route', () => {
  it('reads canonical sessions for the preferred directory once and keeps recent order/limit', async () => {
    const calls = [];
    const app = createApp({
      listSessions: async (directory) => {
        calls.push(directory);
        return {
          items: [
            canonicalSession('session-old', 'Older', 100),
            canonicalSession('session-new', 'Newest', 300),
            canonicalSession('session-middle', 'Middle', 200),
            canonicalSession('session-fourth', 'Fourth', 50),
          ],
          errors: { 'session-fourth': 'SERVICE_UNAVAILABLE' },
        };
      },
    });

    const response = await request(app).get('/manifest.webmanifest').set('authorization', 'Bearer test');
    expect(response.status).toBe(200);
    const manifest = JSON.parse(response.text);

    expect(calls).toEqual(['/workspace/app']);
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual([
      '/?settings=appearance',
      '/?session=session-new',
      '/?session=session-middle',
      '/?session=session-old',
    ]);
    expect(manifest.shortcuts[1]).toMatchObject({ name: 'Newest', short_name: 'Newest', description: 'Open recent session' });
  });

  it('uses the global canonical list when no directory is preferred', async () => {
    const calls = [];
    const app = createApp({
      resolveProjectDirectory: async () => ({ directory: null }),
      listSessions: async (directory) => {
        calls.push(directory);
        return { items: [canonicalSession('root-child', 'Root child', 2)], errors: {} };
      },
    });

    const response = await request(app).get('/manifest.webmanifest').set('authorization', 'Bearer test');
    const manifest = JSON.parse(response.text);

    expect(calls).toEqual([null]);
    expect(manifest.shortcuts).toContainEqual({
      name: 'Root child',
      short_name: 'Root child',
      description: 'Open recent session',
      url: '/?session=root-child',
      icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }],
    });
  });

  it('keeps the root-scoped manifest on the canonical all-session list', async () => {
    const calls = [];
    const app = createApp({
      resolveProjectDirectory: async () => ({ directory: '/' }),
      listSessions: async (directory) => {
        calls.push(directory);
        return {
          items: [
            canonicalSession('root-session', 'Root', 2),
            canonicalSession('child-session', 'Child', 1, { parentSessionId: 'root-session' }),
          ],
          errors: {},
        };
      },
    });

    const response = await request(app).get('/manifest.webmanifest').set('authorization', 'Bearer test');
    const manifest = JSON.parse(response.text);

    expect(calls).toEqual(['/']);
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual([
      '/?settings=appearance',
      '/?session=root-session',
      '/?session=child-session',
    ]);
  });

  it('does not fall back to unrelated global sessions when the preferred directory has none', async () => {
    const calls = [];
    const app = createApp({
      listSessions: async (directory) => {
        calls.push(directory);
        return { items: [], errors: {} };
      },
    });

    const response = await request(app).get('/manifest.webmanifest').set('authorization', 'Bearer test');
    const manifest = JSON.parse(response.text);

    expect(calls).toEqual(['/workspace/app']);
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(['/?settings=appearance']);
  });

  it('serves the product name as the default install name', async () => {
    const app = createApp();
    const response = await request(app).get('/manifest.webmanifest');
    const manifest = JSON.parse(response.text);

    expect(manifest.name).toBe('OhPiChamber');
    expect(manifest.short_name).toBe('OhPiChamber');
    expect(manifest.description).toBe('Web interface for the OhPiChamber native agent');
  });

  it('uses a neutral fallback title for canonical metadata without a title', async () => {
    const app = createApp({
      listSessions: async () => ({ items: [canonicalSession('session-untitled', null, 25)], errors: {} }),
    });

    const response = await request(app).get('/manifest.webmanifest').set('authorization', 'Bearer test');
    const manifest = JSON.parse(response.text);

    expect(manifest.shortcuts).toContainEqual({
      name: 'Session 1',
      short_name: 'Session 1',
      description: 'Open recent session',
      url: '/?session=session-untitled',
      icons: [{ src: '/pwa-192.png', sizes: '192x192', type: 'image/png' }],
    });
  });

  it('leaves session titles out for a caller without credentials and never resolves or lists sessions', async () => {
    const calls = [];
    const app = createApp({
      resolveProjectDirectory: async () => {
        calls.push('resolve');
        return { directory: '/workspace/app' };
      },
      listSessions: async () => {
        calls.push('list');
        return { items: [canonicalSession('secret', 'Private', 1)], errors: {} };
      },
      isRequestAuthorized: async () => false,
    });

    const response = await request(app).get('/manifest.webmanifest');
    const manifest = JSON.parse(response.text);

    expect(calls).toEqual([]);
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(['/?settings=appearance']);
  });

  it('keeps manifest generation working when the canonical session read fails', async () => {
    const app = createApp({ listSessions: async () => { throw new Error('service unavailable'); } });

    const response = await request(app).get('/manifest.webmanifest').set('authorization', 'Bearer test');
    const manifest = JSON.parse(response.text);

    expect(response.status).toBe(200);
    expect(manifest.shortcuts.map((shortcut) => shortcut.url)).toEqual(['/?settings=appearance']);
  });
});
