import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerGuestRoutes } from '../guests/routes.js';
import { buildStoreZip } from '../guests/extract-zip.test.js';

import { buildQuotaProvidersChangedEvent, quotaProvidersChangedPropertiesSchema } from './extension-registry.js';
import { quotaProvidersChangedPropertiesSchema as uiQuotaProvidersChangedPropertiesSchema } from '../../../../ui/src/lib/quota/extensionProviders.ts';

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

const manifest = (id, { quota = true, name = 'Quota Watch' } = {}) => JSON.stringify({
  version: '1.0.0',
  openchamber: {
    apiVersion: 1,
    contributes: quota
      ? {
        panel: { id, name, icon: 'gauge' },
        service: { entry: 'service/main.js', runtime: 'host', provides: ['quota'] },
        quota: { providers: ['teapot'] },
      }
      : {
        panel: { id, name, icon: 'gauge', entry: 'index.html' },
      },
  },
});

const writePackage = async (root, id, options = {}) => {
  const packageRoot = path.join(root, id);
  await fs.mkdir(path.join(packageRoot, 'service'), { recursive: true });
  await fs.writeFile(path.join(packageRoot, 'package.json'), manifest(id, options));
  await fs.writeFile(path.join(packageRoot, 'service/main.js'), 'console.log("service")');
  await fs.writeFile(path.join(packageRoot, 'index.html'), '<script src="main.js"></script>');
  await fs.writeFile(path.join(packageRoot, 'main.js'), 'void 0;');
  return packageRoot;
};

const fixture = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'oc-quota-events-'));
  roots.push(root);
  const app = express();
  const onQuotaProviderChanged = vi.fn();
  registerGuestRoutes(app, {
    openchamberDataDir: root,
    resolveGitBinaryForSpawn: () => 'git',
    onQuotaProviderChanged,
  });
  return { app, root, onQuotaProviderChanged };
};


const uploadGuest = async (app, id, { quota = true, replace = false } = {}) => {
  const zip = buildStoreZip([
    { name: 'package.json', data: JSON.stringify({
      version: '1.0.0',
      openchamber: {
        apiVersion: 1,
        contributes: quota
          ? {
            panel: { id, name: 'Quota Watch', icon: 'gauge' },
            service: { entry: 'service/main.js', runtime: 'host', provides: ['quota'] },
            quota: { providers: ['teapot'] },
          }
          : {
            panel: { id, name: 'Quota Watch', icon: 'gauge', entry: 'index.html' },
          },
      },
    }) },
    { name: 'service/main.js', data: 'console.log("service")' },
    { name: 'index.html', data: '<script src="main.js"></script>' },
    { name: 'main.js', data: 'void 0;' },
  ]);
  const response = await request(app)
    .post(`/api/guests/upload${replace ? '?replace=true' : ''}`)
    .set('content-type', 'application/octet-stream')
    .send(zip);
  expect([200, 201]).toContain(response.status);
  return response;
};

const announced = (onQuotaProviderChanged) => onQuotaProviderChanged.mock.calls.map(([event]) => event);

describe('quota providers change events', () => {
  it('announces the scoped provider for every committed write to a quota-declaring extension', async () => {
    const { app, root, onQuotaProviderChanged } = await fixture();
    const packageRoot = await writePackage(root, 'teapot-usage');

    // Install: the extension is not approved yet, but its provider scope moved.
    await request(app).post('/api/guests').send({ path: packageRoot }).expect(201);
    expect(announced(onQuotaProviderChanged)).toEqual([{ providerId: 'ext-teapot-usage' }]);
    expect(uiQuotaProvidersChangedPropertiesSchema.safeParse(announced(onQuotaProviderChanged)[0]).success).toBe(true);

    // Approval: the provider joins the list.
    await request(app).put('/api/guests/teapot-usage/capabilities').send({ granted: ['service'] }).expect(200);
    expect(announced(onQuotaProviderChanged)).toHaveLength(2);

    // Pause: the provider leaves the list.
    await request(app).put('/api/guests/teapot-usage/enabled').send({ enabled: false }).expect(200);
    expect(announced(onQuotaProviderChanged)).toHaveLength(3);

    // Resume.
    await request(app).put('/api/guests/teapot-usage/enabled').send({ enabled: true }).expect(200);
    expect(announced(onQuotaProviderChanged)).toHaveLength(4);

    // Withdrawn approval.
    await request(app).put('/api/guests/teapot-usage/capabilities').send({ granted: [] }).expect(200);
    expect(announced(onQuotaProviderChanged)).toHaveLength(5);

    // Removal: the record is gone from the catalog, and the event still names the provider.
    await request(app).delete('/api/guests/teapot-usage').expect(204);
    expect(announced(onQuotaProviderChanged)).toHaveLength(6);
    for (const event of announced(onQuotaProviderChanged)) {
      expect(event).toEqual({ providerId: 'ext-teapot-usage' });
      expect(quotaProvidersChangedPropertiesSchema.safeParse(event).success).toBe(true);
      expect(uiQuotaProvidersChangedPropertiesSchema.safeParse(event).success).toBe(true);
    }
    // The scope never carries credential material.
    expect(JSON.stringify(announced(onQuotaProviderChanged))).not.toContain('token');
  });


  it('announces when an update-in-place drops the quota declaration from a still-installed extension', async () => {
    const { app, onQuotaProviderChanged } = await fixture();

    await uploadGuest(app, 'teapot-usage', { quota: true });
    expect(announced(onQuotaProviderChanged)).toEqual([{ providerId: 'ext-teapot-usage' }]);
    onQuotaProviderChanged.mockClear();

    // The replacement declares quota still: the write is announced because the
    // provider implementation may have changed.
    await uploadGuest(app, 'teapot-usage', { quota: true, replace: true });
    expect(announced(onQuotaProviderChanged)).toEqual([{ providerId: 'ext-teapot-usage' }]);
    onQuotaProviderChanged.mockClear();

    // The replacement drops `contributes.quota`: the provider leaves the list,
    // and the announcement must still fire even though the post-write catalog
    // shows no declaration.
    await uploadGuest(app, 'teapot-usage', { quota: false, replace: true });
    expect(announced(onQuotaProviderChanged)).toEqual([{ providerId: 'ext-teapot-usage' }]);
    onQuotaProviderChanged.mockClear();

    // Once the declaration is gone on both sides, further reinstalls announce nothing.
    await uploadGuest(app, 'teapot-usage', { quota: false, replace: true });
    expect(onQuotaProviderChanged).not.toHaveBeenCalled();
  });

  it('announces when a reinstall adds the quota declaration to a plain extension', async () => {
    const { app, onQuotaProviderChanged } = await fixture();

    await uploadGuest(app, 'teapot-usage', { quota: false });
    expect(onQuotaProviderChanged).not.toHaveBeenCalled();

    await uploadGuest(app, 'teapot-usage', { quota: true, replace: true });
    expect(announced(onQuotaProviderChanged)).toEqual([{ providerId: 'ext-teapot-usage' }]);
  });

  it('announces nothing for extensions that never declare quota', async () => {
    const { app, root, onQuotaProviderChanged } = await fixture();
    const packageRoot = await writePackage(root, 'plain-panel', { quota: false, name: 'Plain Panel' });

    await request(app).post('/api/guests').send({ path: packageRoot }).expect(201);
    await request(app).put('/api/guests/plain-panel/enabled').send({ enabled: false }).expect(200);
    await request(app).put('/api/guests/plain-panel/enabled').send({ enabled: true }).expect(200);
    await request(app).delete('/api/guests/plain-panel').expect(204);
    expect(onQuotaProviderChanged).not.toHaveBeenCalled();
  });

  it('announces nothing for rejected or missing-target writes to a quota extension', async () => {
    const { app, root, onQuotaProviderChanged } = await fixture();
    const packageRoot = await writePackage(root, 'teapot-usage');
    await request(app).post('/api/guests').send({ path: packageRoot }).expect(201);
    expect(announced(onQuotaProviderChanged)).toHaveLength(1);
    onQuotaProviderChanged.mockClear();

    // Rejected writes: bad payloads, unknown ids, failed installs.
    await request(app).put('/api/guests/teapot-usage/enabled').send({ enabled: 'yes' }).expect(400);
    await request(app).put('/api/guests/teapot-usage/capabilities').send({ granted: ['transcript'] }).expect(400);
    await request(app).put('/api/guests/missing-guest/enabled').send({ enabled: false }).expect(404);
    await request(app).delete('/api/guests/missing-guest').expect(404);
    await request(app).post('/api/guests').send({ path: '/does/not/exist' }).expect(400);
    expect(onQuotaProviderChanged).not.toHaveBeenCalled();
  });

  it('server and UI consumer schemas accept and reject the same payloads', () => {
    const accepted = [
      { providerId: 'ext-teapot' },
      { providerId: 'ext-a' },
      { providerId: `ext-${'x'.repeat(28)}` },
      { providerId: 'claude' },
      { providerId: 'openrouter' },
      { providerId: 'minimax-cn-coding-plan' },
      { providerId: 'zai-coding-plan' },
    ];
    const rejected = [
      {},
      { providerId: '' },
      { providerId: 'ext-' },
      { providerId: 'ext-Teapot' },
      { providerId: 'Claude' },
      { providerId: 'anthropic provider' },
      { providerId: 'ext-teapot', extra: true },
    ];
    for (const payload of accepted) {
      expect(quotaProvidersChangedPropertiesSchema.safeParse(payload).success).toBe(true);
      expect(uiQuotaProvidersChangedPropertiesSchema.safeParse(payload).success).toBe(true);
    }
    for (const payload of rejected) {
      expect(quotaProvidersChangedPropertiesSchema.safeParse(payload).success).toBe(false);
      expect(uiQuotaProvidersChangedPropertiesSchema.safeParse(payload).success).toBe(false);
    }
  });

  it('the builder drops guest ids that cannot name a provider and validates what it emits', () => {
    expect(buildQuotaProvidersChangedEvent('teapot-usage')).toEqual({
      type: 'openchamber:quota-providers-changed',
      properties: { providerId: 'ext-teapot-usage' },
    });
    expect(buildQuotaProvidersChangedEvent('x'.repeat(40))).toBeNull();
    expect(buildQuotaProvidersChangedEvent('')).toBeNull();
  });
});
