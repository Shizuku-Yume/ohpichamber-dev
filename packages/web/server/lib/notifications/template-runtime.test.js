import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createNotificationTemplateRuntime } from './template-runtime.js';
import { createSessionMetadataStore } from '../openchamber-sessions/session-metadata-store.js';

const originalFetch = globalThis.fetch;

const createRuntime = (settings = {}, readSessionMetadata = async () => null) => createNotificationTemplateRuntime({
  readSettingsFromDisk: async () => settings,
  readSessionMetadata,
  persistSettings: vi.fn(async () => {}),
  buildOpenCodeUrl: (path) => path,
  getOpenCodeAuthHeaders: () => ({}),
  resolveGitBinaryForSpawn: () => 'git',
});

describe('notification template runtime zen models', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns no selectable zen models after provider retirement', async () => {
    const runtime = createRuntime();
    const models = await runtime.fetchFreeZenModels();

    expect(models).toEqual([]);
  });

  it('preserves stored zen model value for compatibility without validation', async () => {
    const runtime = createRuntime({ zenModel: 'trinity-large-preview-free' });

    await expect(runtime.resolveZenModel()).resolves.toBe('trinity-large-preview-free');
  });
});

describe('notification template message extraction', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('excludes reasoning parts from payload message text', () => {
    const runtime = createRuntime();

    expect(runtime.extractLastMessageText({
      properties: {
        info: {
          parts: [
            { type: 'reasoning', text: 'private chain of thought' },
            { type: 'text', text: 'final answer' },
          ],
        },
      },
    })).toBe('final answer');
  });

  it('ignores untyped parts even when they contain text', () => {
    const runtime = createRuntime();

    expect(runtime.extractLastMessageText({
      properties: {
        info: {
          parts: [
            { text: 'untyped text' },
            { content: 'untyped content' },
            { type: 'text', text: 'typed final answer' },
          ],
        },
      },
    })).toBe('typed final answer');
  });

  it('excludes reasoning parts when fetching assistant messages', async () => {
    const runtime = createRuntime();
    // v2 pages messages as `{ data, cursor }` and an assistant message is a
    // flat record carrying `content[]`.
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      data: [
        {
          id: 'msg-1',
          type: 'assistant',
          finish: 'stop',
          content: [
            { type: 'reasoning', text: 'private chain of thought' },
            { type: 'text', text: 'final answer' },
          ],
        },
      ],
      cursor: {},
    })));

    await expect(runtime.fetchLastAssistantMessageText('session-1', 'msg-1')).resolves.toBe('final answer');
  });
});

describe('notification template session info', () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends OpenCode auth headers when fetching the session title', async () => {
    const seenHeaders = [];
    globalThis.fetch = vi.fn(async (_url, init) => {
      seenHeaders.push(init?.headers ?? {});
      return new Response(JSON.stringify({ id: 'ses_1', title: 'Nightly cleanup' }), { status: 200 });
    });
    const runtime = createNotificationTemplateRuntime({
      readSettingsFromDisk: async () => ({}),
      readSessionMetadata: async () => null,
      buildOpenCodeUrl: (path) => path,
      getOpenCodeAuthHeaders: () => ({ Authorization: 'Basic dGVzdDp0ZXN0' }),
      resolveGitBinaryForSpawn: () => 'git',
    });

    const variables = await runtime.buildTemplateVariables({ properties: { info: {} } }, 'ses_1');

    expect(seenHeaders[0]).toMatchObject({ Authorization: 'Basic dGVzdDp0ZXN0' });
    expect(variables.session_name).toBe('Nightly cleanup');
  });

  it('reads renamed Host titles instead of stale payload and execution cache titles', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-notification-title-'));
    const store = createSessionMetadataStore({ dataDir });
    try {
      const runtime = createRuntime({}, store.get);
      runtime.maybeCacheSessionInfoFromEvent({ type: 'session.updated', properties: { info: { id: 'ses_host', title: 'Native default' } } });
      await store.setSessionMetadata('ses_host', { title: 'Host title' });
      const payload = { properties: { sessionTitle: 'Stale event title', info: {} } };
      expect((await runtime.buildTemplateVariables(payload, 'ses_host')).session_name).toBe('Host title');
      await store.setSessionMetadata('ses_host', { title: 'Renamed Host title' });
      expect((await runtime.buildTemplateVariables(payload, 'ses_host')).session_name).toBe('Renamed Host title');
      await store.setSessionMetadata('ses_host', { title: null });
      expect((await runtime.buildTemplateVariables({ properties: { info: {} } }, 'ses_host')).session_name).toBe('Native default');
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('does not replace unreadable Host title with an execution title', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-notification-corrupt-title-'));
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createSessionMetadataStore({ dataDir, database: db, closeDatabase: true });
    try {
      await store.setSessionMetadata('ses_host', { title: 'Host title' });
      db.prepare('UPDATE session_metadata SET payload = ? WHERE session_id = ?').run('[]', 'ses_host');
      const runtime = createRuntime({}, store.get);
      await expect(runtime.buildTemplateVariables({ properties: { sessionTitle: 'Native default', info: {} } }, 'ses_host')).rejects.toMatchObject({ code: 'METADATA_CORRUPT' });
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });
});
