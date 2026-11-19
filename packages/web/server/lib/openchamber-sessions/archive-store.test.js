import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createArchiveStore } from './archive-store.js';
const dataDirs = [];

const makeDataDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-archive-'));
  dataDirs.push(dir);
  return dir;
};

const writeLegacyArchive = (dataDir, value) => fs.writeFileSync(
  path.join(dataDir, 'sessions-archive.json'),
  JSON.stringify(value),
  'utf8',
);

afterEach(() => {
  while (dataDirs.length > 0) fs.rmSync(dataDirs.pop(), { recursive: true, force: true });
});

describe('createArchiveStore', () => {
  it('starts empty when no legacy file exists', async () => {
    const store = createArchiveStore({ dataDir: makeDataDir() });
    await expect(store.getAll()).resolves.toEqual({});
    await expect(store.isArchived('ses_1')).resolves.toBe(false);
    await expect(store.archivedAt('ses_1')).resolves.toBeNull();
    await store.close();
  });

  it('archives a batch with string revisions and survives a real close and reopen', async () => {
    const dataDir = makeDataDir();
    const store = createArchiveStore({ dataDir, now: () => 1_700_000 });
    const result = await store.archive(['ses_1', 'ses_2']);
    expect(result).toEqual({
      archived: [
        { id: 'ses_1', archivedAt: 1_700_000 },
        { id: 'ses_2', archivedAt: 1_700_000 },
      ],
      failedIds: [],
    });
    await expect(store.getState('ses_1')).resolves.toEqual({ archivedAt: 1_700_000, revision: '1' });
    await store.close();

    const reopened = createArchiveStore({ dataDir });
    await expect(reopened.getAll()).resolves.toEqual({ ses_1: 1_700_000, ses_2: 1_700_000 });
    await expect(reopened.isArchived('ses_2')).resolves.toBe(true);
    await expect(reopened.getState('ses_2')).resolves.toEqual({ archivedAt: 1_700_000, revision: '1' });
    await reopened.close();
  });

  it('honours an explicit archivedAt and ignores a nonsense one', async () => {
    const store = createArchiveStore({ dataDir: makeDataDir(), now: () => 42 });
    await expect(store.archive(['ses_1'], 999)).resolves.toMatchObject({ archived: [{ id: 'ses_1', archivedAt: 999 }] });
    await expect(store.archive(['ses_2'], -5)).resolves.toMatchObject({ archived: [{ id: 'ses_2', archivedAt: 42 }] });
    await expect(store.getState('ses_1')).resolves.toMatchObject({ revision: '1' });
    await expect(store.getState('ses_2')).resolves.toMatchObject({ revision: '1' });
    await store.close();
  });

  it('unarchives a batch and retains explicit unarchive tombstones in SQLite', async () => {
    const dataDir = makeDataDir();
    const store = createArchiveStore({ dataDir, now: () => 1 });
    await store.archive(['ses_1', 'ses_2']);
    await expect(store.unarchive(['ses_1'])).resolves.toEqual({ restored: [{ id: 'ses_1', archivedAt: null }], failedIds: [] });
    await expect(store.getState('ses_1')).resolves.toEqual({ archivedAt: null, revision: '2' });
    await expect(store.isArchived('ses_1')).resolves.toBe(false);
    await store.close();

    const reopened = createArchiveStore({ dataDir });
    await expect(reopened.getState('ses_1')).resolves.toEqual({ archivedAt: null, revision: '2' });
    await expect(reopened.archivedAt('ses_2')).resolves.toBe(1);
    await reopened.close();
  });

  it('ignores blank ids and collapses duplicates', async () => {
    const store = createArchiveStore({ dataDir: makeDataDir(), now: () => 7 });
    const result = await store.archive(['ses_1', ' ses_1 ', '', '   ', null, 5]);
    expect(result.archived).toEqual([{ id: 'ses_1', archivedAt: 7 }]);
    await expect(store.archive([])).resolves.toEqual({ archived: [], failedIds: [] });
    await store.close();
  });
  it('converts legacy archive records once, retains the source and preserves tombstones', async () => {
    const dataDir = makeDataDir();
    const legacy = { ses_archived: 5, ses_restored: null };
    writeLegacyArchive(dataDir, legacy);
    const store = createArchiveStore({ dataDir });
<<<<<<< HEAD
    await expect(store.listAll()).resolves.toMatchObject({
      entries: {
        ses_archived: { archivedAt: 5, revision: '1' },
        ses_restored: { archivedAt: null, revision: '1' },
      },
      errors: {},
      conversion: { status: 'complete' },
    });
    await store.close();
    expect(fs.readFileSync(path.join(dataDir, 'sessions-archive.json'), 'utf8')).toBe(JSON.stringify(legacy));
    const reopened = createArchiveStore({ dataDir });
    await expect(reopened.listAll()).resolves.toMatchObject({ conversion: { status: 'complete' } });
    await expect(reopened.getState('ses_archived')).resolves.toEqual({ archivedAt: 5, revision: '1' });
    await expect(reopened.getState('ses_restored')).resolves.toEqual({ archivedAt: null, revision: '1' });
    await reopened.close();
  });

  it('imports valid legacy entities while isolating corrupt entries and leaving the source repairable', async () => {
    const dataDir = makeDataDir();
    writeLegacyArchive(dataDir, { ses_good: 5, ses_bad: 'yesterday' });
||||||| bc50ba56aa

    await expect(store.getAll()).resolves.toEqual({ ses_1: 7, ses_3: null });
    await expect(store.entry('ses_1')).resolves.toBe(7);
    await expect(store.entry('ses_3')).resolves.toBeNull();
    await expect(store.entry('ses_4')).resolves.toBeUndefined();
  });

  it('drops entries that are not positive timestamps', async () => {
    const dataDir = makeDataDir();
    writeFile(dataDir, { ses_ok: 5, ses_zero: 0, ses_text: 'yesterday', ses_float: 1.5 });
    const store = createArchiveStore({ dataDir });
    await expect(store.getAll()).resolves.toEqual({ ses_ok: 5 });
  });

  it('treats a malformed file as empty and keeps a backup', async () => {
    const dataDir = makeDataDir();
    fs.writeFileSync(path.join(dataDir, 'sessions-archive.json'), '{ not json', 'utf8');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = createArchiveStore({ dataDir, now: () => 11 });
    await expect(store.getAll()).resolves.toEqual({});
    expect(fs.existsSync(path.join(dataDir, 'sessions-archive.json.corrupt-11'))).toBe(true);
  });

  it('forgets entries, ignoring blank and duplicate ids, and the file keeps the rest', async () => {
    const dataDir = makeDataDir();
    writeFile(dataDir, { ses_1: 7, ses_2: 7, ses_3: null });
    const store = createArchiveStore({ dataDir });

    await expect(store.forget(['ses_1', ' ses_1 ', '', null, 'ses_3', 'ses_4'])).resolves.toEqual({ failedIds: [] });
    expect(JSON.parse(readFile(dataDir))).toEqual({ ses_2: 7 });
    await expect(createArchiveStore({ dataDir }).getAll()).resolves.toEqual({ ses_2: 7 });
  });

  it('writes atomically: the visible file is the previous one until the rename', async () => {
    const dataDir = makeDataDir();
    writeFile(dataDir, { ses_1: 3, ses_2: 3 });
    const seen = [];
    const fsPromises = {
      ...fs.promises,
      writeFile: async (target, payload, encoding) => {
        seen.push(readFile(dataDir));
        return fs.promises.writeFile(target, payload, encoding);
      },
    };
    const store = createArchiveStore({ dataDir, fsPromises });

    await store.forget(['ses_1']);

    expect(seen).toEqual([JSON.stringify({ ses_1: 3, ses_2: 3 })]);
    expect(JSON.parse(readFile(dataDir))).toEqual({ ses_2: 3 });
  });

  it('refuses to write when the file could not be read, so unknown state is never overwritten', async () => {
    const dataDir = makeDataDir();
    writeFile(dataDir, { ses_1: 1 });
    const unreadable = Object.assign(new Error('EACCES'), { code: 'EACCES' });
    const fsPromises = {
      ...fs.promises,
      readFile: async () => { throw unreadable; },
      writeFile: async () => { throw new Error('must not write'); },
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = createArchiveStore({ dataDir, fsPromises });
    await expect(store.forget(['ses_1'])).resolves.toEqual({ failedIds: [] });
    expect(JSON.parse(readFile(dataDir))).toEqual({ ses_1: 1 });
  });

  it('writes nothing to forget a session it does not hold, and restores entries when the write fails', async () => {
    const dataDir = makeDataDir();
    writeFile(dataDir, { ses_1: 7 });
=======

    await expect(store.getAll()).resolves.toEqual({ ses_1: 7, ses_3: null });
    await expect(store.entry('ses_1')).resolves.toBe(7);
    await expect(store.entry('ses_3')).resolves.toBeNull();
    await expect(store.entry('ses_4')).resolves.toBeUndefined();
  });

  it('drops entries that are not positive timestamps', async () => {
    const dataDir = makeDataDir();
    writeFile(dataDir, { ses_ok: 5, ses_zero: 0, ses_text: 'yesterday', ses_float: 1.5 });
    const store = createArchiveStore({ dataDir });
    await expect(store.getAll()).resolves.toEqual({ ses_ok: 5 });
  });

  it('treats a malformed file as empty and keeps a backup', async () => {
    const dataDir = makeDataDir();
    fs.writeFileSync(path.join(dataDir, 'sessions-archive.json'), '{ not json', 'utf8');
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const store = createArchiveStore({ dataDir, now: () => 11 });
    await expect(store.getAll()).resolves.toEqual({});
    expect(fs.existsSync(path.join(dataDir, 'sessions-archive.json.corrupt-11'))).toBe(true);
  });

  it('forgets entries, ignoring blank and duplicate ids, and the file keeps the rest', async () => {
    const dataDir = makeDataDir();
    writeFile(dataDir, { ses_1: 7, ses_2: 7, ses_3: null });
    const store = createArchiveStore({ dataDir });

    await expect(store.forget(['ses_1', ' ses_1 ', '', null, 'ses_3', 'ses_4'])).resolves.toEqual({ failedIds: [] });
    expect(JSON.parse(readFile(dataDir))).toEqual({ ses_2: 7 });
    await expect(createArchiveStore({ dataDir }).getAll()).resolves.toEqual({ ses_2: 7 });
  });

  it('writes nothing to forget a session it does not hold, and restores entries when the write fails', async () => {
    const dataDir = makeDataDir();
    writeFile(dataDir, { ses_1: 7 });
>>>>>>> upstream/main
    const store = createArchiveStore({ dataDir });
    await expect(store.getState('ses_good')).resolves.toEqual({ archivedAt: 5, revision: '1' });
    await expect(store.getState('ses_bad')).rejects.toMatchObject({ code: 'METADATA_CORRUPT' });
    await expect(store.listAll()).resolves.toMatchObject({
      entries: { ses_good: { archivedAt: 5, revision: '1' } },
      errors: { ses_bad: 'METADATA_CORRUPT' },
      conversion: { status: 'partial' },
    });
    expect(fs.existsSync(path.join(dataDir, 'sessions-archive.json'))).toBe(true);
    await store.close();
  });

  it('preserves source-wide corruption when a bulk archive read cannot convert legacy JSON', async () => {
    const dataDir = makeDataDir();
    const sourcePath = path.join(dataDir, 'sessions-archive.json');
    fs.writeFileSync(sourcePath, '{', 'utf8');
    const store = createArchiveStore({ dataDir });
    try {
      await expect(store.getAll()).rejects.toMatchObject({ code: 'METADATA_CORRUPT' });
      expect(fs.readFileSync(sourcePath, 'utf8')).toBe('{');
    } finally {
      await store.close();
    }
  });

  it('distinguishes an unreadable legacy source from corrupt archive data', async () => {
    const dataDir = makeDataDir();
    fs.mkdirSync(path.join(dataDir, 'sessions-archive.json'));
    const store = createArchiveStore({ dataDir });
    try {
      await expect(store.getAll()).rejects.toMatchObject({ code: 'METADATA_READ_FAILED' });
    } finally {
      await store.close();
    }
  });

  it('preserves conversion write failure when a bulk archive read cannot commit legacy records', async () => {
    const dataDir = makeDataDir();
    writeLegacyArchive(dataDir, { ses_archived: 5 });
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createArchiveStore({ dataDir, database: db });
    db.exec('PRAGMA query_only = ON');
    try {
      await expect(store.getAll()).rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
      expect(db.prepare('SELECT session_id FROM session_archive').all()).toEqual([]);
    } finally {
      await store.close();
      db.close();
    }
  });

  it('isolates a corrupt SQLite archive row from unrelated valid rows', async () => {
    const dataDir = makeDataDir();
    const store = createArchiveStore({ dataDir });
    await store.archive(['ses_good'], 5);
    await store.close();

    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    db.prepare('INSERT INTO session_archive (session_id, revision, archived_at) VALUES (?, ?, ?)').run('ses_bad', 0, 5);
    db.close();
    const reopened = createArchiveStore({ dataDir });
    await expect(reopened.getState('ses_bad')).rejects.toMatchObject({ code: 'METADATA_CORRUPT' });
    await expect(reopened.getState('ses_good')).resolves.toEqual({ archivedAt: 5, revision: '1' });
    await expect(reopened.listAll()).resolves.toMatchObject({
      entries: { ses_good: { archivedAt: 5, revision: '1' } },
      errors: { ses_bad: 'METADATA_CORRUPT' },
    });
    await reopened.close();
  });

  it('rolls back a failed SQLite batch without damaging existing or unrelated rows', async () => {
    const dataDir = makeDataDir();
    const db = new DatabaseSync(path.join(dataDir, 'host-metadata.sqlite'));
    const store = createArchiveStore({ dataDir, database: db });
    await store.archive(['ses_a'], 10);
    await store.archive(['ses_b'], 20);
    db.exec('PRAGMA query_only = ON');

    await expect(store.archive(['ses_a', 'ses_c'], 30)).rejects.toMatchObject({ code: 'METADATA_WRITE_FAILED' });
    await expect(store.getState('ses_a')).resolves.toEqual({ archivedAt: 10, revision: '1' });
    await expect(store.getState('ses_b')).resolves.toEqual({ archivedAt: 20, revision: '1' });
    await expect(store.getState('ses_c')).resolves.toBeNull();
    await store.close();
    db.close();
  });

});
