import { afterEach, describe, expect, it, vi } from 'vitest';
import * as modelsMetadata from '../host/models-metadata.js';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';

const { registerOpenChamberRoutes } = await import('./openchamber-routes.js');

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const newestRelease = JSON.parse(fs.readFileSync(path.join(repoRoot, 'changelog', 'index.json'), 'utf8'))[0];

const createApp = () => {
  const app = express();
  registerOpenChamberRoutes(app, {
    modelsDevApiUrl: 'https://models.example.test',
    modelsMetadataCacheTtl: 0,
  });
  return { app };
};

afterEach(() => vi.restoreAllMocks());

describe('native Host model metadata routes', () => {
  it('does not register the retired Zen catalog reader', async () => {
    await request(createApp().app).get('/api/zen/models').expect(404);
  });

  it('returns a successfully read empty metadata catalog', async () => {
    vi.spyOn(modelsMetadata, 'getModelsMetadata').mockResolvedValue({ metadata: {}, fromCache: false, stale: false });
    const response = await request(createApp().app).get('/api/openchamber/models-metadata').expect(200);
    expect(response.body).toEqual({});
  });

  it.each([
    [new DOMException('deadline', 'TimeoutError'), 504],
    [{ name: 'AbortError' }, 504],
    [new Error('unavailable'), 502],
    [null, 502],
  ])('classifies metadata failure %s as %s', async (error, status) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(modelsMetadata, 'getModelsMetadata').mockRejectedValue(error);
    const response = await request(createApp().app).get('/api/openchamber/models-metadata').expect(status);
    expect(response.body).toEqual({ error: 'Failed to retrieve model metadata' });
  });
});

describe('OhPiChamber release notes route', () => {
  it('serves the bundled notes of the requested version', async () => {
    const { app } = createApp();

    const response = await request(app)
      .get(`/api/openchamber/release-notes?version=${newestRelease.version}`)
      .expect(200);

    expect(response.body.releases).toHaveLength(1);
    expect(response.body.releases[0]).toMatchObject({ version: newestRelease.version, date: newestRelease.date });
  });

  it('serves the range an offered update brings', async () => {
    const { app } = createApp();

    const response = await request(app)
      .get(`/api/openchamber/release-notes?version=${newestRelease.version}&since=0.0.0`)
      .expect(200);

    expect(response.body.releases[0].version).toBe(newestRelease.version);
  });

  it('answers an empty list for a version the bundle does not have', async () => {
    const { app } = createApp();

    const response = await request(app).get('/api/openchamber/release-notes?version=0.0.1').expect(200);

    expect(response.body).toEqual({ releases: [] });
  });

  it('rejects versions that are not releases', async () => {
    const { app } = createApp();

    await request(app).get('/api/openchamber/release-notes?version=latest').expect(400);
    await request(app).get('/api/openchamber/release-notes?version=1.2.3&since=latest').expect(400);
  });
});

describe('removed update routes', () => {
  it('no longer serves an update check or an update install', async () => {
    const { app } = createApp();

    await request(app).get('/api/openchamber/update-check?appType=web').expect(404);
    await request(app).post('/api/openchamber/update-install').expect(404);
  });
});
