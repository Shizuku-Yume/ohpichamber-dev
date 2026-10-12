import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { Location } from '@opencode/schema/location';
import express from 'express';
import { describe, expect, it } from 'vitest';

import { registerOpenCodeProxy } from './proxy.js';

const emptyBulk = () => ({ entries: {}, errors: {}, conversion: { status: 'ok' } });

const listen = (server) => new Promise((resolve, reject) => {
  const onError = (error) => reject(error);
  server.once('error', onError);
  server.listen(0, '127.0.0.1', () => {
    server.off('error', onError);
    resolve(server.address().port);
  });
});

const trackedServer = (app) => {
  const server = http.createServer(app);
  const sockets = new Set();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  return {
    server,
    close: () => new Promise((resolve, reject) => {
      if (!server.listening) {
        resolve();
        return;
      }
      server.close((error) => error ? reject(error) : resolve());
      for (const socket of sockets) socket.destroy();
    }),
  };
};

const jsonRequest = (port, method, route, body) => new Promise((resolve, reject) => {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const headers = { connection: 'close' };
  if (payload !== undefined) headers['content-type'] = 'application/json';
  const request = http.request({
    host: '127.0.0.1', port, method, path: route, agent: false,
    headers,
  }, (response) => {
    let text = '';
    response.setEncoding('utf8');
    response.on('data', (chunk) => { text += chunk; });
    response.on('error', reject);
    response.on('aborted', () => reject(new Error('Proxy response was aborted')));
    response.on('end', () => {
      try {
        resolve({ status: response.statusCode, body: JSON.parse(text) });
      } catch (error) {
        reject(error);
      }
    });
  });
  request.setTimeout(5000, () => request.destroy(new Error('Timed out waiting for proxy response')));
  request.on('error', reject);
  request.end(payload);
});

// Host callbacks commit to disk, so response projection must reread committed state,
// not echo a request patch or rely on a callback's return value alone.
const createFixture = async ({ upstreamHandler, metadata = emptyBulk(), archive = emptyBulk(), writeError = null }) => {
  const dataDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'host-metadata-proxy-'));
  const metadataFile = path.join(dataDir, 'metadata.json');
  const host = { metadataReadError: null, archive, writeError };
  const persistCalls = [];
  const inheritCalls = [];
  const requests = [];
  const readCommitted = async () => JSON.parse(await fs.promises.readFile(metadataFile, 'utf8'));
  const persistSessionMetadata = async (id, patch, options = {}) => {
    persistCalls.push({ id, patch, options });
    if (host.writeError) throw host.writeError;
    const bulk = await readCommitted();
    const previous = bulk.entries[id];
    const next = {
      metadata: { ...previous?.metadata, ...patch },
      revision: (BigInt(previous?.revision ?? '0') + 1n).toString(),
    };
    bulk.entries[id] = next;
    await fs.promises.writeFile(metadataFile, JSON.stringify(bulk));
    return { ...next, changed: true };
  };
  const inheritForkMetadata = async (sourceId, fork, directory = '') => {
    inheritCalls.push({ sourceId, fork, directory });
    const bulk = await readCommitted();
    const source = bulk.entries[sourceId];
    if (!source) throw new Error(`Missing Host source ${sourceId}`);
    const metadata = { ...source.metadata };
    if (fork.title !== undefined) metadata.title = fork.title;
    if (directory) metadata.directory = directory;
    return persistSessionMetadata(fork.id, metadata, { directory: directory || source.metadata.directory });
  };

  const upstreamApp = express();
  upstreamApp.use(express.json());
  upstreamApp.use((req, res) => {
    requests.push({ method: req.method, path: req.path, body: req.body });
    upstreamHandler(req, res);
  });
  const upstream = trackedServer(upstreamApp);
  const app = express();
  app.use(express.json());
  const proxy = trackedServer(app);
  const cleanup = async () => {
    try {
      await Promise.all([proxy.close(), upstream.close()]);
    } finally {
      await fs.promises.rm(dataDir, { recursive: true, force: true });
    }
  };

  try {
    await fs.promises.writeFile(metadataFile, JSON.stringify(metadata));
    const upstreamPort = await listen(upstream.server);
    let prefixChecks = 0;
    registerOpenCodeProxy(app, {
      fs,
      getRuntime: () => ({ openCodePort: upstreamPort, isOpenCodeReady: true, isRestartingOpenCode: false, openCodeNotReadySince: 0 }),
      buildOpenCodeUrl: (route) => `http://127.0.0.1:${upstreamPort}${route}`,
      getOpenCodeAuthHeaders: () => ({ Authorization: 'Bearer test' }),
      ensureOpenCodeApiPrefix: () => { prefixChecks += 1; },
      OPEN_CODE_READY_GRACE_MS: 0,
      listSessionMetadata: async () => {
        if (host.metadataReadError) throw host.metadataReadError;
        return readCommitted();
      },
      listArchivedSessions: async () => host.archive,
      persistSessionMetadata,
      inheritForkMetadata,
    });
    const port = await listen(proxy.server);
    return { port, requests, persistCalls, inheritCalls, readCommitted, metadataFile, host, cleanup, prefixChecks: () => prefixChecks };
  } catch (error) {
    await cleanup();
    throw error;
  }
};

describe('registered Host metadata session routes', () => {
  it('commits a pure Host title update with a strict revision without forwarding an execution mutation', async () => {
    const fixture = await createFixture({
      metadata: {
        entries: { existing: { metadata: { title: 'Old Host title', directory: '/host/repo', projectID: 'host-project' }, revision: '9007199254740992' } },
        errors: {}, conversion: { status: 'ok' },
      },
      upstreamHandler: (req, res) => {
        if (req.path === '/api/session/existing') {
          return res.json({ id: 'existing', title: 'Execution title', metadata: { title: 'Execution metadata' }, model: { id: 'runtime-model' }, time: { created: 10 } });
        }
        return res.status(404).json({ error: 'Unexpected upstream request' });
      },
    });
    try {
      const update = await jsonRequest(fixture.port, 'PATCH', '/api/session/existing', { title: 'New Host title' });
      expect(update.status).toBe(200);
      expect(update.body).toMatchObject({ id: 'existing', title: 'New Host title', directory: '/host/repo', location: { directory: '/host/repo' }, projectID: 'host-project', metadataRevision: '9007199254740993' });
      expect(update.body).not.toHaveProperty('metadata');
      expect(fixture.persistCalls).toEqual([{ id: 'existing', patch: { title: 'New Host title' }, options: expect.any(Object) }]);
      expect((await fixture.readCommitted()).entries.existing).toEqual({
        metadata: { title: 'New Host title', directory: '/host/repo', projectID: 'host-project' }, revision: '9007199254740993',
      });
      await expect(jsonRequest(fixture.port, 'GET', '/api/session/existing')).resolves.toEqual({
        status: 200,
        body: { id: 'existing', title: 'New Host title', directory: '/host/repo', location: { directory: '/host/repo' }, projectID: 'host-project', metadataRevision: '9007199254740993', model: { id: 'runtime-model' }, time: { created: 10 } },
      });
      expect(fixture.requests.length).toBeGreaterThan(0);
      expect(fixture.requests.every((request) => request.method === 'GET')).toBe(true);
      for (const request of fixture.requests) {
        expect(request.body ?? {}).not.toHaveProperty('title');
        expect(request.body ?? {}).not.toHaveProperty('metadata');
      }
      expect(fixture.prefixChecks()).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  it('commits create and fork response IDs, inherits Host state, and preserves only execution runtime fields', async () => {
    const runtimeFields = { model: { id: 'runtime-model' }, cost: 0.25, tokens: { input: 21 }, time: { created: 12, updated: 15 } };
    const records = {
      created: { id: 'created', ...runtimeFields, title: 'Execution-created', directory: '/execution/repo', projectID: 'execution-project', metadata: { title: 'Injected metadata', directory: '/execution/metadata' } },
      forked: { id: 'forked', parentID: 'created', ...runtimeFields, title: 'Execution-fork', directory: '/execution/fork', projectID: 'execution-project', metadata: { title: 'Injected fork metadata' } },
    };
    const fixture = await createFixture({
      upstreamHandler: (req, res) => {
        if (req.method === 'POST' && req.path === '/api/session') return res.json(records.created);
        if (req.method === 'POST' && req.path === '/api/session/created/fork') return res.json({ data: records.forked });
        if (req.method === 'GET' && req.path === '/api/session') return res.json(Object.values(records));
        if (req.method === 'GET' && records[req.path.split('/').pop()]) return res.json(records[req.path.split('/').pop()]);
        return res.status(404).json({ error: 'Unexpected upstream request' });
      },
    });
    try {
      const created = await jsonRequest(fixture.port, 'POST', '/api/session', { title: 'Host title', directory: '/host/repo', projectID: 'host-project', prompt: 'run', metadata: { title: 'Untrusted request metadata' } });
      const expectedCreated = { id: 'created', ...runtimeFields, title: 'Host title', directory: '/host/repo', location: { directory: '/host/repo' }, projectID: 'host-project', metadataRevision: '1' };
      expect(created).toEqual({ status: 200, body: expectedCreated });
      expect(fixture.persistCalls).toEqual([{ id: 'created', patch: { title: 'Host title', directory: '/host/repo', projectID: 'host-project' }, options: { directory: '/host/repo' } }]);
      expect((await fixture.readCommitted()).entries.created).toEqual({ metadata: { title: 'Host title', directory: '/host/repo', projectID: 'host-project' }, revision: '1' });

      const forked = await jsonRequest(fixture.port, 'POST', '/api/session/created/fork', { messageID: 'message-7' });
      const expectedForked = { id: 'forked', parentID: 'created', ...runtimeFields, title: 'Host title', directory: '/host/repo', location: { directory: '/host/repo' }, projectID: 'host-project', metadataRevision: '1' };
      expect(forked).toEqual({ status: 200, body: expectedForked });
      expect(fixture.inheritCalls).toHaveLength(1);
      expect(fixture.inheritCalls[0]).toMatchObject({ sourceId: 'created', fork: { id: 'forked' } });
      expect(fixture.inheritCalls[0].fork.title).not.toBe('Execution-fork');
      expect((await fixture.readCommitted()).entries).toEqual({
        created: { metadata: { title: 'Host title', directory: '/host/repo', projectID: 'host-project' }, revision: '1' },
        forked: { metadata: { title: 'Host title', directory: '/host/repo', projectID: 'host-project' }, revision: '1' },
      });
      expect(fixture.requests.filter((request) => request.method === 'POST')).toEqual([
        { method: 'POST', path: '/api/session', body: { prompt: 'run' } },
        { method: 'POST', path: '/api/session/created/fork', body: { messageID: 'message-7' } },
      ]);
      await expect(jsonRequest(fixture.port, 'GET', '/api/session/created')).resolves.toEqual({ status: 200, body: expectedCreated });
      await expect(jsonRequest(fixture.port, 'GET', '/api/session/forked')).resolves.toEqual({ status: 200, body: expectedForked });
      await expect(jsonRequest(fixture.port, 'GET', '/api/session')).resolves.toEqual({ status: 200, body: [expectedCreated, expectedForked] });
    } finally {
      await fixture.cleanup();
    }
  });

  it('returns the exact partial creation failure after Host persistence throws without creating upstream twice', async () => {
    let creations = 0;
    const fixture = await createFixture({
      writeError: new Error('write failed'),
      upstreamHandler: (req, res) => {
        if (req.method !== 'POST' || req.path !== '/api/session') return res.status(404).json({ error: 'Unexpected upstream request' });
        creations += 1;
        return res.json({ id: 'created', title: 'Execution title', model: { id: 'runtime-model' } });
      },
    });
    try {
      await expect(jsonRequest(fixture.port, 'POST', '/api/session', { title: 'Host title', prompt: 'run' })).resolves.toEqual({
        status: 500,
        body: { error: 'Host metadata write failed', code: 'METADATA_WRITE_FAILED', partial: true, partialAction: 'session-created', sessionId: 'created' },
      });
      expect(creations).toBe(1);
      expect(fixture.requests).toEqual([{ method: 'POST', path: '/api/session', body: { prompt: 'run' } }]);
      expect(fixture.persistCalls).toEqual([{ id: 'created', patch: { title: 'Host title' }, options: expect.any(Object) }]);
      expect(fixture.inheritCalls).toEqual([]);
      expect((await fixture.readCommitted()).entries).toEqual({});
    } finally {
      await fixture.cleanup();
    }
  });

  it('preserves valid bulk siblings and scoped errors, distinguishing empty Host state from a thrown read', async () => {
    const records = [
      { id: 'good', title: 'Execution good', directory: '/execution/good', projectID: 'execution-project', metadata: { title: 'Execution metadata', openchamber: { goal: { id: 'execution-goal' } } }, model: { id: 'runtime-model' }, time: { created: 10, archived: 999 } },
      { id: 'bad', title: 'Execution bad', directory: '/execution/bad', metadata: { title: 'Execution fallback' }, tokens: { input: 3 }, time: { created: 20, archived: 999 } },
    ];
    const fixture = await createFixture({
      upstreamHandler: (_req, res) => res.json({ data: records, cursor: 'next-page' }),
      metadata: {
        entries: { good: { metadata: { title: 'Good', directory: '/host/good', projectID: 'host-project', openchamber: { goal: { id: 'host-goal' } } }, revision: '9007199254740993' } },
        errors: { bad: 'READ_FAILED' }, conversion: { status: 'partial' },
      },
      archive: { entries: { good: { archivedAt: 700, revision: '9' } }, errors: { bad: 'ARCHIVE_READ_FAILED' }, conversion: { status: 'partial' } },
    });
    try {
      await expect(jsonRequest(fixture.port, 'GET', '/api/session')).resolves.toEqual({ status: 200, body: {
        cursor: 'next-page',
        data: [
          { id: 'good', title: 'Good', directory: '/host/good', location: { directory: '/host/good' }, projectID: 'host-project', openchamber: { goal: { id: 'host-goal' } }, metadataRevision: '9007199254740993', model: { id: 'runtime-model' }, time: { created: 10, archived: 700 }, archiveRevision: '9' },
          { id: 'bad', location: { directory: '' }, tokens: { input: 3 }, time: { created: 20 }, hostMetadataError: 'READ_FAILED', hostArchiveError: 'ARCHIVE_READ_FAILED' },
        ],
      } });

      await fs.promises.writeFile(fixture.metadataFile, JSON.stringify(emptyBulk()));
      fixture.host.archive = emptyBulk();
      const expectedEmptyProjection = { status: 200, body: {
        cursor: 'next-page',
        data: [
          { id: 'good', location: { directory: '' }, metadataRevision: '0', model: { id: 'runtime-model' }, time: { created: 10 } },
          { id: 'bad', location: { directory: '' }, metadataRevision: '0', tokens: { input: 3 }, time: { created: 20 } },
        ],
      } };
      await expect(jsonRequest(fixture.port, 'GET', '/api/session')).resolves.toEqual(expectedEmptyProjection);

      fixture.host.metadataReadError = new Error('Host bulk read failed');
      await expect(jsonRequest(fixture.port, 'GET', '/api/session')).resolves.toEqual({ status: 503, body: { error: 'OpenCode service unavailable' } });
      fixture.host.metadataReadError = null;
      await expect(jsonRequest(fixture.port, 'GET', '/api/session')).resolves.toEqual(expectedEmptyProjection);
      expect(fixture.requests).toHaveLength(4);
      expect(fixture.requests.every((request) => request.method === 'GET')).toBe(true);
      expect(fixture.persistCalls).toEqual([]);
      expect(fixture.inheritCalls).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('drops malformed upstream list records without leaking raw fields or losing valid siblings', async () => {
    const malformed = { id: 123, permissions: { secret: true }, metadata: { secret: 'untrusted' } };
    const records = [
      { id: 'good', title: 'Execution title', cost: 0.25, model: { id: 'runtime-model' }, permissions: { secret: true }, metadata: { secret: 'untrusted' } },
      malformed,
      { id: 'invalid-cost', cost: 'not-a-number', permissions: { secret: true }, metadata: { secret: 'untrusted' } },
      { id: 'invalid-location', location: '/execution/raw-string', permissions: { secret: true }, metadata: { secret: 'untrusted' } },
      null,
    ];
    const fixture = await createFixture({
      upstreamHandler: (req, res) => res.json(req.path === '/api/session/malformed'
        ? malformed : { data: records, cursor: 'next-page' }),
      metadata: {
        entries: { good: { metadata: { title: 'Host title' }, revision: '1' } },
        errors: {}, conversion: { status: 'ok' },
      },
    });
    try {
      await expect(jsonRequest(fixture.port, 'GET', '/api/session')).resolves.toEqual({
        status: 200,
        body: { data: [{ id: 'good', title: 'Host title', location: { directory: '' }, metadataRevision: '1', cost: 0.25, model: { id: 'runtime-model' } }], cursor: 'next-page' },
      });
      await expect(jsonRequest(fixture.port, 'GET', '/api/session/malformed')).resolves.toEqual({
        status: 503, body: { error: 'OpenCode service unavailable' },
      });
      records.splice(0, 1);
      await expect(jsonRequest(fixture.port, 'GET', '/api/session')).resolves.toEqual({
        status: 503, body: { error: 'OpenCode service unavailable' },
      });
      expect(fixture.persistCalls).toEqual([]);
      expect(fixture.inheritCalls).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });

  it('projects official object-wire Host locations and marks failed scopes without execution workspace fallback', async () => {
    const hostDirectory = '/host/新 work';
    const records = [
      { id: 'good', title: 'Execution title', location: { directory: '/execution/good', workspaceID: 'execution-private' }, projectID: 'execution-project', cost: 0.25, time: { created: 10, updated: 15 } },
      { id: 'failed', title: 'Execution title', location: { directory: '/execution/failed' }, projectID: 'execution-project', tokens: { input: 3 }, time: { created: 20, updated: 25 } },
      { id: 'missing', title: 'Execution title', location: { directory: '/execution/missing' }, projectID: 'execution-project', model: { id: 'runtime-model' }, time: { created: 30, updated: 35 } },
    ];
    const expected = [
      { id: 'good', title: 'Host title', directory: hostDirectory, location: { directory: hostDirectory }, projectID: 'host-project', metadataRevision: '9007199254740993', cost: 0.25, time: { created: 10, updated: 15 } },
      { id: 'failed', location: { directory: '' }, hostMetadataError: 'METADATA_READ_FAILED', tokens: { input: 3 }, time: { created: 20, updated: 25 } },
      { id: 'missing', location: { directory: '' }, metadataRevision: '0', model: { id: 'runtime-model' }, time: { created: 30, updated: 35 } },
    ];
    const fixture = await createFixture({
      upstreamHandler: (req, res) => res.json(req.path === '/api/session'
        ? { data: records, cursor: 'next-page' }
        : records.find((record) => req.path === `/api/session/${record.id}`)),
      metadata: {
        entries: { good: { metadata: { title: 'Host title', directory: hostDirectory, projectID: 'host-project' }, revision: '9007199254740993' } },
        errors: { failed: 'METADATA_READ_FAILED' }, conversion: { status: 'partial' },
      },
    });
    try {
      const listed = await jsonRequest(fixture.port, 'GET', '/api/session');
      expect(listed).toEqual({ status: 200, body: { data: expected, cursor: 'next-page' } });
      for (const record of expected) {
        const detail = await jsonRequest(fixture.port, 'GET', `/api/session/${record.id}`);
        expect(detail).toEqual({ status: 200, body: record });
        expect(Location.PublicRef.make(detail.body.location)).toEqual(record.location);
      }
      // A failed Host scope carries the UI cached-workspace preservation marker;
      // confirmed missing Host state instead remains authoritative and unmarked.
      expect(listed.body.data[1].hostMetadataError).toBe('METADATA_READ_FAILED');
      expect(listed.body.data[2]).not.toHaveProperty('hostMetadataError');
      expect(fixture.persistCalls).toEqual([]);
      expect(fixture.inheritCalls).toEqual([]);
    } finally {
      await fixture.cleanup();
    }
  });
});
