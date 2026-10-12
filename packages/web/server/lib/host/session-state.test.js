import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { createHostSessionState } from './session-state.js';
import { createSessionMetadataStore } from '../openchamber-sessions/session-metadata-store.js';

const roots = [];
const makeDataDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-host-state-'));
  roots.push(dir);
  return dir;
};
afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true }); });

const snapshot = { version: 1, foldersMap: { '/workspace': [{ id: 'folder', name: 'Work', sessionIds: ['legacy'], createdAt: 1 }] }, collapsedFolderIds: ['folder'], updatedAt: 1 };

describe('Host session-state ownership', () => {
  it('fences new admissions and drains conversion, reads, selected imports and writes before closing', async () => {
    const dataDir = makeDataDir();
    fs.writeFileSync(path.join(dataDir, 'sessions-metadata.json'), JSON.stringify({ legacy: { title: 'Legacy' } }));
    const gate = Promise.withResolvers();
    const entered = Promise.withResolvers();
    const fsPromises = {
      ...fs.promises,
      readFile: async (file, options) => {
        if (path.basename(file) === 'sessions-metadata.json') { entered.resolve(); await gate.promise; }
        return fs.promises.readFile(file, options);
      },
    };
    const owner = createHostSessionState({ dataDir, fsPromises });
    const initialization = owner.initialize();
    const read = owner.sessionMetadataStore.get('legacy');
    const imported = owner.sessionMetadataStore.importOperationalSessions([{ id: 'selected', title: 'Selected' }], 'user-selection');
    const metadataWrite = owner.sessionMetadataStore.setSessionMetadata('legacy', { notes: 'Durable' });
    const archived = owner.archiveStore.archive(['legacy'], 42);
    const folders = owner.sessionFoldersStore.save(snapshot);
    await entered.promise;
    const closed = owner.close();
    expect(owner.close()).toBe(closed);
    await expect(owner.sessionMetadataStore.get('later')).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
    await expect(owner.archiveStore.getState('later')).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
    await expect(owner.sessionFoldersStore.get()).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
    gate.resolve();
    await initialization;
    await expect(read).resolves.toEqual({ title: 'Legacy' });
    await expect(imported).resolves.toMatchObject({ results: { selected: 'imported' } });
    await metadataWrite;
    await archived;
    await folders;
    await closed;

    const reopened = createHostSessionState({ dataDir });
    await expect(reopened.sessionMetadataStore.get('legacy')).resolves.toEqual({ title: 'Legacy', notes: 'Durable' });
    await expect(reopened.sessionMetadataStore.get('selected')).resolves.toEqual({ title: 'Selected' });
    await expect(reopened.archiveStore.getState('legacy')).resolves.toEqual({ archivedAt: 42, revision: '1' });
    await expect(reopened.sessionFoldersStore.get()).resolves.toMatchObject({ snapshot, revision: '1' });
    await reopened.close();
  });

  it('initializes domains independently when one legacy record is corrupt', async () => {
    const dataDir = makeDataDir();
    fs.writeFileSync(path.join(dataDir, 'sessions-metadata.json'), JSON.stringify({ good: { title: 'Good' }, bad: 'invalid' }));
    fs.writeFileSync(path.join(dataDir, 'sessions-archive.json'), JSON.stringify({ good: 42 }));
    fs.writeFileSync(path.join(dataDir, 'sessions-directories.json'), JSON.stringify(snapshot));
    const owner = createHostSessionState({ dataDir });
    await expect(owner.initialize()).resolves.toMatchObject({ metadata: { status: 'partial', errors: { bad: 'METADATA_CORRUPT' } }, archive: { status: 'complete' }, folders: { status: 'complete' } });
    await expect(owner.sessionMetadataStore.get('good')).resolves.toEqual({ title: 'Good' });
    await expect(owner.archiveStore.getState('good')).resolves.toMatchObject({ archivedAt: 42 });
    await expect(owner.sessionFoldersStore.get()).resolves.toMatchObject({ snapshot });
    await owner.close();
  });

  it('does not convert a real SQLite read failure into missing or an empty bulk result', async () => {
    const dataDir = makeDataDir();
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createSessionMetadataStore({ dataDir, database: db });
    await store.setSessionMetadata('known', { title: 'Known' });
    db.close();
    await expect(store.get('known')).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
    await expect(store.listAll()).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
    await store.close();
  });
});
