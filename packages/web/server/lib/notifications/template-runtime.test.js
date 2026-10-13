import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createNotificationTemplateRuntime } from './template-runtime.js';
import { createSessionMetadataStore } from '../openchamber-sessions/session-metadata-store.js';
import { history, message, scope, snapshot, turn } from '../event-stream/canonical-test-fixtures.js';

const create = ({ readSessionMetadata = async () => null, sessionService = { open: async () => snapshot(), history: async () => history() } } = {}) => createNotificationTemplateRuntime({
  sessionService, resolveSessionScope: async () => ({ ...scope, cwd: '/does-not-exist/private-workspace' }), readSessionMetadata,
  readSettingsFromDisk: async () => ({ projects: [{ id: 'project', label: 'Project label' }] }), resolveGitBinaryForSpawn: () => 'git',
});

describe('canonical notification templates', () => {
  it('extracts only canonical text, not reasoning/tool output', () => {
    const runtime = create();
    expect(runtime.extractLastMessageText(message({ parts: [{ type: 'reasoning', partId: 'r', content: 'private thought' },
      { type: 'text', partId: 't', content: 'final answer' }] }))).toBe('final answer');
    expect(runtime.shouldApplyResolvedTemplateMessage('{last_message}', ' ', { last_message: '' })).toBe(false);
  });

  it('gets the most recent settled assistant text from a canonical snapshot, not a history activity heuristic', async () => {
    const records = [message({ parts: [{ type: 'reasoning', partId: 'r', content: 'private thought' }, { type: 'text', partId: 't', content: 'final answer' }] })];
    const runtime = create({ sessionService: { open: async () => snapshot(records, [turn()]), history: async () => { throw new Error('must not read history'); } } });
    expect(await runtime.fetchLastAssistantMessageText('session')).toBe('final answer');
  });

  it('distinguishes successful missing text from a failed snapshot/history load', async () => {
    const empty = create(); expect(await empty.fetchLastAssistantMessageText('session')).toBe('');
    const failed = create({ sessionService: { open: async () => snapshot(), history: async () => { throw new Error('unavailable'); } } });
    await expect(failed.fetchLastAssistantMessageText('session', 'old-message')).rejects.toThrow('unavailable');
  });

  it('uses current Host custom titles after rename and never puts an absolute cwd into template variables', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-notification-title-'));
    const store = createSessionMetadataStore({ dataDir });
    try {
      const runtime = create({ readSessionMetadata: store.get });
      await store.setSessionMetadata('session', { title: 'Host title' });
      expect((await runtime.buildTemplateVariables(null, 'session')).session_name).toBe('Host title');
      await store.setSessionMetadata('session', { title: 'Renamed title' });
      const variables = await runtime.buildTemplateVariables(null, 'session');
      expect(variables.session_name).toBe('Renamed title'); expect(variables.worktree).toBe('.');
      expect(JSON.stringify(variables)).not.toContain('/does-not-exist');
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });

  it('does not substitute another owner title after a corrupt Host metadata read', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'canonical-notification-corrupt-'));
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createSessionMetadataStore({ dataDir, database: db, closeDatabase: true });
    try {
      await store.setSessionMetadata('session', { title: 'Host title' });
      db.prepare('UPDATE session_metadata SET payload = ? WHERE session_id = ?').run('[]', 'session');
      await expect(create({ readSessionMetadata: store.get }).buildTemplateVariables(null, 'session')).rejects.toMatchObject({ code: 'METADATA_CORRUPT' });
    } finally { await store.close(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  });
});
