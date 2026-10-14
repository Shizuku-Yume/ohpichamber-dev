import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createProjectDirectoryRuntime } from '../host/project-directory-runtime.js';
import { createHostSessionState } from '../host/session-state.js';
import { runtimeSession } from '../event-stream/canonical-test-fixtures.js';
import { mergeMetadataPatch } from './session-metadata-store.js';

let routeFixture;
let routeFixtureDataDir;

const createMemorySessionMetadataStore = () => {
  const entries = new Map(); const revisions = new Map();
  const merge = mergeMetadataPatch;
  return { entries, get: async id => entries.get(id) ?? null, getState: async id => entries.has(id) ? { metadata: entries.get(id), revision: String(revisions.get(id) ?? 1) } : null, setSessionMetadata: async (id, patch) => { const current = entries.get(id); const metadata = merge(current, patch); const changed = JSON.stringify(current) !== JSON.stringify(metadata); const revision = (revisions.get(id) ?? (current ? 1 : 0)) + (changed ? 1 : 0); entries.set(id, metadata); revisions.set(id, revision); return { metadata, revision: String(revision), changed }; } };
};
const createMemoryArchiveStore = () => { const entries = new Map(); return { entries, getState: async id => entries.has(id) ? { archivedAt: entries.get(id), revision: '1' } : null, archive: async (ids, archivedAt) => ({ archived: ids.map(id => { entries.set(id, archivedAt ?? 1); return { id, archivedAt: archivedAt ?? 1 }; }), failedIds: [] }), unarchive: async ids => ({ restored: ids.map(id => { entries.delete(id); return { id, archivedAt: null }; }), failedIds: [] }) }; };
const validScope = (sessionId) => ({ sessionId, rootSessionId: sessionId, projectId: 'proj_1', workspaceId: 'ws_1', cwd: '/repo/app', agentDirectoryId: 'agent-dir-1', agentDirectory: '/repo/app/.agents', displayPath: 'app' });
const createApp = (overrides = {}) => {
  const app = express(); const archiveStore = overrides.archiveStore ?? createMemoryArchiveStore(); const sessionMetadataStore = overrides.sessionMetadataStore ?? createMemorySessionMetadataStore();
  const { registerOpenChamberSessionRoutes } = overrides.routes;
  registerOpenChamberSessionRoutes(app, { service: { request: vi.fn() }, resolveWorkspaceScope: async () => validScope('workspace'), resolveSessionScope: async id => validScope(id), resolveHostSessionScope: async id => id === 'ses_admitted' ? validScope(id) : null, registerSessionScope: async () => true, resolveAttachments: async () => [], capturePrompt: async (_scope, body) => body, beforeDispatch: async () => {}, onPromptAccepted: async () => {}, directCommandAdmissionStore: overrides.directCommandAdmissionStore ?? routeFixture.directCommandAdmissionStore, archiveStore, sessionMetadataStore, isRequestOriginAllowed: async () => true, ...overrides });
  return { app, archiveStore, sessionMetadataStore, hostSessionState: routeFixture };
};

describe('canonical session route contracts', () => {
  let routes;
  beforeAll(async () => {
    routes = await import('./routes.js');
    routeFixtureDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-routes-admission-'));
    routeFixture = createHostSessionState({ dataDir: routeFixtureDataDir });
    await routeFixture.initialize();
  });
  afterAll(async () => {
    await routeFixture.close();
    fs.rmSync(routeFixtureDataDir, { recursive: true, force: true });
  });
  it('requires the origin gate before wiring routes', () => { const app = express(); expect(() => routes.registerOpenChamberSessionRoutes(app, { sessionService: {} })).toThrow('Session routes require isRequestOriginAllowed'); });
  it('rejects SDK entry IDs and inferred fork modes at the public boundary', async () => {
    const { app } = createApp({ routes });
    await request(app).post('/api/openchamber/sessions/ses_admitted/fork').send({ entryId: 'native-entry', messageId: 'public-message', mode: 'selected' }).expect(400);
    await request(app).post('/api/openchamber/sessions/ses_admitted/fork').send({ messageId: 'public-message' }).expect(400);
    await request(app).post('/api/openchamber/sessions/ses_admitted/fork').send({ messageId: 'public-message', mode: 'full' }).expect(400);
  });
  it('rejects metadata and archive operations for an unauthorized Host session', async () => { const { app } = createApp({ routes }); await request(app).get('/api/openchamber/sessions/ses_foreign/metadata').expect(404); await request(app).post('/api/openchamber/sessions/archive').send({ ids: ['ses_foreign'] }).expect(404); });
  it('keeps admitted Host metadata and archive operations available when native service is unavailable', async () => { const archiveStore = createMemoryArchiveStore(); const sessionMetadataStore = createMemorySessionMetadataStore(); const { app } = createApp({ routes, archiveStore, sessionMetadataStore }); await request(app).patch('/api/openchamber/sessions/ses_admitted/metadata').send({ changes: { notes: 'host-owned' } }).expect(200); await request(app).get('/api/openchamber/sessions/ses_admitted/metadata').expect(200); await request(app).post('/api/openchamber/sessions/archive').send({ ids: ['ses_admitted'], archivedAt: 1700 }).expect(200); await request(app).post('/api/openchamber/sessions/unarchive').send({ ids: ['ses_admitted'] }).expect(200); });
  it('rejects malformed archive batches', async () => { const { app } = createApp({ routes }); await request(app).post('/api/openchamber/sessions/archive').send({ ids: [] }).expect(400); await request(app).post('/api/openchamber/sessions/archive').send({ ids: ['ses_admitted'], archivedAt: -1 }).expect(400); });
});

describe('canonical session list persistence', () => {
  const createService = async (state, sessions) => {
    const { createOpenChamberSessionService } = await import('./routes.js');
    return createOpenChamberSessionService({
      service: { request: async () => Response.json({ items: sessions, errors: [] }) },
      resolveWorkspaceScope: async () => ({ ...validScope('workspace'), projectId: 'project', workspaceId: 'workspace' }),
      resolveSessionScope: async id => validScope(id),
      resolveHostSessionScope: async id => validScope(id),
      registerSessionScope: async () => true,
      resolveAttachments: async () => [],
      capturePrompt: async (_scope, body) => body,
      beforeDispatch: async () => {},
      onPromptAccepted: async () => {},
      sessionMetadataStore: state.sessionMetadataStore,
      archiveStore: state.archiveStore,
      directCommandAdmissionStore: state.directCommandAdmissionStore,
    });
  };

  it('lists an unarchived session without losing its committed archive revision', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-unarchive-'));
    const state = createHostSessionState({ dataDir });
    try {
      await state.initialize();
      const service = await createService(state, [runtimeSession()]);
      await state.archiveStore.archive(['session'], 1700);
      const archived = await service.list('workspace');
      expect(archived.items[0]).toMatchObject({ sessionId: 'session', archivedAt: 1700, archiveRevision: '1' });
      await state.archiveStore.unarchive(['session']);
      const restored = await service.list('workspace');
      expect(restored.errors).toEqual({});
      expect(restored.items[0]).toMatchObject({ sessionId: 'session', archiveRevision: '2' });
      expect(Object.hasOwn(restored.items[0], 'archivedAt')).toBe(false);
    } finally {
      await state.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('retains healthy sessions when a sibling has corrupt persisted metadata', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-list-partial-'));
    const state = createHostSessionState({ dataDir });
    const connection = new DatabaseSync(state.databasePath);
    try {
      await state.initialize();
      await state.sessionMetadataStore.setSessionMetadata('healthy', { title: 'Preserved session' });
      connection.prepare('INSERT INTO session_metadata (session_id, revision, payload) VALUES (?, ?, ?)').run('corrupt', 1, '{');
      const service = await createService(state, [runtimeSession({ sessionId: 'corrupt', rootSessionId: 'corrupt' }), runtimeSession({ sessionId: 'healthy', rootSessionId: 'healthy' })]);
      const listed = await service.list('workspace');
      expect(listed.items.map(session => session.sessionId)).toEqual(['healthy']);
      expect(listed.items[0].metadata.title).toBe('Preserved session');
      expect(listed.errors).toEqual({ corrupt: 'METADATA_CORRUPT' });
    } finally {
      connection.close();
      await state.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });
});

describe('Host metadata conversion authorization', () => {
  it('canonicalizes selected directories and refuses isolated scopes before reading', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-scope-')); const selected = path.join(root, 'selected'); fs.mkdirSync(selected); const dataDir = path.join(root, 'data'); fs.mkdirSync(dataDir); const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite')); const store = (await import('./session-metadata-store.js')).createSessionMetadataStore({ dataDir, database: db, closeDatabase: true }); const runtime = createProjectDirectoryRuntime({ fsPromises: fs.promises, path, normalizeDirectoryPath: value => value, refuseDirectory: () => null }); expect(runtime).toBeTruthy(); await store.close(); fs.rmSync(root, { recursive: true, force: true });
  });
});
