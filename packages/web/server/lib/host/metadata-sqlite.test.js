import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openHostMetadataDatabase, ensureHostMetadataSchema, MetadataSchemaTooNewError, CURRENT_HOST_METADATA_VERSION } from './metadata-sqlite.js';

const roots = [];
const makeRoot = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-metadata-')); roots.push(root); return root; };
afterEach(() => { while (roots.length) fs.rmSync(roots.pop(), { recursive: true, force: true }); });
const mode = (file) => fs.statSync(file).mode & 0o777;

const posixTest = process.platform === 'win32' ? it.skip : it;

describe('host metadata database permissions', () => {
  posixTest('creates private durable database and WAL sidecars under umask 022', () => {
    const parent = makeRoot();
    const root = path.join(parent, 'data');
    const previous = process.umask(0o022);
    let db;
    let reopened;
    let dbPath;
    try {
      ({ db, filePath: dbPath } = openHostMetadataDatabase({ dataDir: root }));
      db.exec("INSERT INTO session_metadata VALUES ('session', 1, '{\"title\":\"durable\"}')");
      db.exec('BEGIN IMMEDIATE');
      db.exec("UPDATE session_metadata SET payload = '{\"title\":\"durable-2\"}' WHERE session_id = 'session'");
      expect(mode(root)).toBe(0o700);
      expect(mode(dbPath)).toBe(0o600);
      for (const suffix of ['-wal', '-shm']) {
        expect(fs.existsSync(`${dbPath}${suffix}`)).toBe(true);
        expect(mode(`${dbPath}${suffix}`)).toBe(0o600);
      }
      db.exec('COMMIT');
      db.close(); db = undefined;
      ({ db: reopened } = openHostMetadataDatabase({ dataDir: root }));
      expect(reopened.prepare('SELECT payload FROM session_metadata WHERE session_id = ?').get('session').payload).toBe('{"title":"durable-2"}');
    } finally {
      if (db) db.close();
      if (reopened) reopened.close();
      process.umask(previous);
    }
  });

  posixTest('tightens pre-existing database and sidecars without changing existing root mode', () => {
    const root = makeRoot();
    fs.chmodSync(root, 0o755);
    const filePath = path.join(root, 'host-metadata.sqlite');
    let seed;
    let db;
    let reopened;
    try {
      seed = new DatabaseSync(filePath);
      seed.exec("PRAGMA journal_mode = WAL; CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO records(value) VALUES ('durable');");
      fs.chmodSync(filePath, 0o644);
      expect(fs.existsSync(`${filePath}-wal`)).toBe(true);
      expect(fs.existsSync(`${filePath}-shm`)).toBe(true);
      fs.chmodSync(`${filePath}-wal`, 0o644); fs.chmodSync(`${filePath}-shm`, 0o644);
      ({ db } = openHostMetadataDatabase({ dataDir: root, databasePath: filePath }));
      expect(mode(root)).toBe(0o755);
      expect(mode(filePath)).toBe(0o600);
      expect(mode(`${filePath}-wal`)).toBe(0o600);
      expect(mode(`${filePath}-shm`)).toBe(0o600);
      expect(db.prepare('SELECT value FROM records').get().value).toBe('durable');
      db.close(); db = undefined;
      seed.close(); seed = undefined;
      ({ db: reopened } = openHostMetadataDatabase({ dataDir: root, databasePath: filePath }));
      expect(reopened.prepare('SELECT value FROM records').get().value).toBe('durable');
    } finally {
      if (seed) seed.close();
      if (db) db.close();
      if (reopened) reopened.close();
    }
  });
});
describe('host metadata schema versioning and migrations', () => {
  it('fresh database gets the current user_version and creates all tables', () => {
    const root = makeRoot();
    const { db, filePath } = openHostMetadataDatabase({ dataDir: root });
    try {
      const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
      expect(version).toBe(CURRENT_HOST_METADATA_VERSION);

      // Verify metadata tables and queue tables exist
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      expect(tables).toContain('session_metadata');
      expect(tables).toContain('prompt_queue_owner');
      expect(tables).toContain('prompt_queue_item');
      expect(tables).toContain('host_attachments');
    } finally {
      db.close();
    }
  });

  it('old-version fixture with legacy data migrates once and preserves existing data', () => {
    const root = makeRoot();
    const filePath = path.join(root, 'host-metadata.sqlite');

    // Create a legacy database (user_version = 0) with pre-existing data
    const seed = new DatabaseSync(filePath);
    seed.exec(`
      CREATE TABLE session_metadata (session_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL);
      INSERT INTO session_metadata VALUES ('legacy-sess', 1, '{"title":"legacy-title"}');
      PRAGMA user_version = 0;
    `);
    expect(Number(seed.prepare('PRAGMA user_version').get()?.user_version)).toBe(0);
    seed.close();

    // Opening it through openHostMetadataDatabase runs migration to CURRENT_HOST_METADATA_VERSION
    const { db } = openHostMetadataDatabase({ dataDir: root });
    try {
      const version = Number(db.prepare('PRAGMA user_version').get()?.user_version);
      expect(version).toBe(CURRENT_HOST_METADATA_VERSION);

      // Data in pre-existing table was preserved
      const row = db.prepare("SELECT payload FROM session_metadata WHERE session_id = 'legacy-sess'").get();
      expect(row.payload).toBe('{"title":"legacy-title"}');

      // Newly added tables (like prompt_queue_owner) were created
      const queueTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'prompt_queue_owner'").get();
      expect(queueTable).toBeDefined();
    } finally {
      db.close();
    }
  });

  it('reopening an already-migrated database is idempotent and does not re-run migrations', () => {
    const root = makeRoot();
    const { db: first } = openHostMetadataDatabase({ dataDir: root });
    first.close();

    const { db: second } = openHostMetadataDatabase({ dataDir: root });
    try {
      const version = Number(second.prepare('PRAGMA user_version').get()?.user_version);
      expect(version).toBe(CURRENT_HOST_METADATA_VERSION);

      // ensureHostMetadataSchema is safe to call repeatedly
      expect(ensureHostMetadataSchema(second)).toBe(CURRENT_HOST_METADATA_VERSION);
    } finally {
      second.close();
    }
  });

  it('newer schema version is refused with an explicit error and no write', () => {
    const root = makeRoot();
    const filePath = path.join(root, 'host-metadata.sqlite');

    // Create a database with user_version higher than current
    const seed = new DatabaseSync(filePath);
    seed.exec(`
      PRAGMA user_version = 999;
      CREATE TABLE future_table (id TEXT PRIMARY KEY, data TEXT);
      INSERT INTO future_table VALUES ('key1', 'future-data');
    `);
    seed.close();

    // Opening it throws MetadataSchemaTooNewError
    expect(() => openHostMetadataDatabase({ dataDir: root })).toThrow(MetadataSchemaTooNewError);

    // Verify no write occurred: future table intact, user_version unchanged, host tables not added
    const verify = new DatabaseSync(filePath);
    try {
      const version = Number(verify.prepare('PRAGMA user_version').get()?.user_version);
      expect(version).toBe(999);
      expect(verify.prepare("SELECT data FROM future_table WHERE id = 'key1'").get()?.data).toBe('future-data');
      const hostTable = verify.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'session_metadata'").get();
      expect(hostTable).toBeUndefined();
    } finally {
      verify.close();
    }
  });
});
