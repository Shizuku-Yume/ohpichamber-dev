import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openHostMetadataDatabase } from './metadata-sqlite.js';

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
