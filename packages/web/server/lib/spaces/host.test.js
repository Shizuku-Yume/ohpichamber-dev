// The host of the feature: what `server/index.js` builds when the switch is on.

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';

import { createSpacesHost, readOrCreateOwner } from './host.js';
import { createMemoryPlace } from './places/memory-place.js';

const folders = [];
const servers = [];
const hosts = [];
const temporary = () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-spaces-host-test-'));
  folders.push(folder);
  return folder;
};

afterEach(async () => {
  for (const host of hosts.splice(0)) host.close();
  for (const server of servers.splice(0)) await new Promise((resolve) => server.close(() => resolve()));
  for (const folder of folders.splice(0)) fs.rmSync(folder, { recursive: true, force: true });
});

describe('readOrCreateOwner', () => {
  it('makes a random owner once, readable by the user only, and keeps it', () => {
    const dataDir = temporary();
    const owner = readOrCreateOwner(dataDir);
    expect(owner).toMatch(/^[0-9a-f]{24}$/);
    expect(readOrCreateOwner(dataDir)).toBe(owner);
    const file = path.join(dataDir, 'spaces', 'owner');
    expect(fs.readFileSync(file, 'utf8')).toBe(`${owner}\n`);
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
  });

  it('replaces a file that does not hold an owner', () => {
    const dataDir = temporary();
    fs.mkdirSync(path.join(dataDir, 'spaces'));
    fs.writeFileSync(path.join(dataDir, 'spaces', 'owner'), 'not an owner\n');
    expect(readOrCreateOwner(dataDir)).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe('createSpacesHost', () => {
  it('starts no process of its own when it is made, and answers through the place it was given', async () => {
    let started = 0;
    const place = createMemoryPlace();
    const host = createSpacesHost({
      dataDir: temporary(),
      place,
      requireReleased: () => {},
      runCommand: async () => { started += 1; throw new Error('no process here'); },
      openCommandStream: () => { started += 1; throw new Error('no process here'); },
      logger: { warn: () => {} },
    });
    hosts.push(host);
    const { id } = await host.manager.createSpace({ placeId: 'memory', projectDirectory: '/home/me/project', name: 'Host test' });

    const app = express();
    app.use(host.middleware);
    app.get('/api/host', (req, res) => res.json({ directory: req.query.directory ?? null }));
    const server = http.createServer(app);
    servers.push(server);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const url = (suffix) => `http://127.0.0.1:${server.address().port}${suffix}`;

    // The memory place has no token file to read, so the login step stops there: what this
    // shows is the wiring, from the prefix through the manager's list to the space's channel.
    const forwarded = await fetch(url(`/api/spaces/${id}/health`));
    expect(forwarded.status).toBe(502);
    expect(await forwarded.json()).toMatchObject({ code: 'space_setup_failed' });
    const unknown = await fetch(url('/api/spaces/0f0f0f0f0f0f/health'));
    expect(unknown.status).toBe(404);
    const guarded = await fetch(url(`/api/host?directory=/spaces/${id}/repo`));
    expect(guarded.status).toBe(400);
    expect((await fetch(url('/api/host?directory=/home/me'))).status).toBe(200);

    expect(host.skipsBodyParsing({ path: `/api/spaces/${id}/fs/raw` })).toBe(true);
    expect(host.skipsBodyParsing({ path: '/api/fs/raw' })).toBe(false);
    expect(host.refuseDirectory(`/spaces/${id}/repo`)).toMatch(/isolated space/);
    expect(host.refuseDirectory('/home/me/spaces')).toBeNull();
    expect(started).toBe(0);
    await place.remove(id);
  });

  it('carries the journey and its places, and takes no upgrade before the forwarder is made', async () => {
    const place = createMemoryPlace();
    const host = createSpacesHost({ dataDir: temporary(), place, requireReleased: () => {}, listProjectDirectories: async () => ['/home/me/project'], logger: { warn: () => {} } });
    hosts.push(host);
    expect(host.places().map((entry) => entry.id)).toEqual(['memory']);
    expect(await host.journey.listSpaces()).toEqual([]);
    // The slot in index.js calls this whether or not the forwarder exists yet.
    expect(() => host.upgradeHandler({ url: '/api/spaces/a1b2c3d4e5f6/api/event/ws', headers: {} }, { destroy: () => {} }, Buffer.alloc(0))).not.toThrow();
    // The middleware is the dispatcher's: a request outside the prefix passes through.
    let passed = false;
    host.middleware({ path: '/api/host', url: '/api/host', headers: {}, query: {}, method: 'GET' }, {}, () => { passed = true; });
    expect(passed).toBe(true);
  });

  it('refuses to be built while the release gate is closed', () => {
    let error = null;
    try {
      createSpacesHost({ dataDir: temporary(), place: createMemoryPlace(), logger: { warn: () => {} } });
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: 'isolated_spaces_unreleased' });
  });
});
