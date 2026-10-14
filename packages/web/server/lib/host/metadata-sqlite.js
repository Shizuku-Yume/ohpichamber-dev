import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const JsonObjectSchema = z.record(z.string(), z.unknown());
const DatabaseLocationSchema = z.object({ dataDir: z.string().optional(), databasePath: z.string().optional() })
  .refine((value) => value.dataDir !== undefined || value.databasePath !== undefined);

const require = createRequire(import.meta.url);

export class HostMetadataError extends Error {
  constructor(message, code, cause) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'HostMetadataError';
    this.code = code;
  }
}

export class MetadataCorruptError extends HostMetadataError {
  constructor(message, cause) { super(message, 'METADATA_CORRUPT', cause); this.name = 'MetadataCorruptError'; }
}

export class MetadataReadError extends HostMetadataError {
  constructor(message, cause) { super(message, 'METADATA_READ_FAILED', cause); this.name = 'MetadataReadError'; }
}

export class MetadataWriteError extends HostMetadataError {
  constructor(message, cause) { super(message, 'METADATA_WRITE_FAILED', cause); this.name = 'MetadataWriteError'; }
}

const loadDatabaseSync = () => {
  try {
    const { DatabaseSync } = process.getBuiltinModule?.('node:sqlite') ?? require('node:sqlite');
    return DatabaseSync;
  } catch (error) {
    throw new MetadataWriteError('Host metadata requires the node:sqlite runtime', error);
  }
};

const metadataDatabasePath = (dataDir, nodePath = path) => nodePath.join(dataDir, 'host-metadata.sqlite');

export const ensureHostMetadataSchema = (db) => {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    CREATE TABLE IF NOT EXISTS host_direct_command (
      session_id TEXT NOT NULL, command_id TEXT NOT NULL,
      project_id TEXT NOT NULL, workspace_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK (operation IN ('send', 'steer', 'followUp')),
      payload_hash TEXT NOT NULL, claim_id TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('pending', 'accepted')),
      acknowledgment TEXT,
      PRIMARY KEY (session_id, command_id),
      CHECK ((state = 'pending' AND acknowledgment IS NULL) OR (state = 'accepted' AND acknowledgment IS NOT NULL))
    );
    CREATE TABLE IF NOT EXISTS session_metadata (
      session_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_archive (
      session_id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      archived_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS session_folders (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      revision INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS session_folder_scopes (
      scope TEXT PRIMARY KEY,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS host_agent_projects (
      project_id TEXT PRIMARY KEY,
      host_project_id TEXT NOT NULL,
      directory TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      display_path TEXT
    );
    CREATE TABLE IF NOT EXISTS host_agent_directories (
      agent_directory_id TEXT PRIMARY KEY,
      directory TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS host_agent_workspaces (
      workspace_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      cwd TEXT NOT NULL,
      agent_directory_id TEXT NOT NULL,
      UNIQUE (project_id, cwd)
    );
    CREATE TABLE IF NOT EXISTS host_agent_sessions (
      session_id TEXT PRIMARY KEY,
      root_session_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      agent_directory_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS host_agent_relocations (
      root_session_id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL UNIQUE,
      source_workspace_id TEXT NOT NULL,
      destination_workspace_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS host_attachments (
      attachment_id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      agent_directory_id TEXT NOT NULL,
      name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      storage_name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS metadata_conversion (
      source TEXT PRIMARY KEY,
      completed INTEGER NOT NULL CHECK (completed IN (0, 1))
    );
  `);
};

export const openHostMetadataDatabase = ({ dataDir, path: nodePath = path, fsImpl = fs, databasePath } = {}) => {
  if (!DatabaseLocationSchema.safeParse({ dataDir, databasePath }).success) {
    throw new MetadataWriteError('Host metadata data directory is required');
  }
  const filePath = databasePath ?? metadataDatabasePath(dataDir, nodePath);
  const directoryPath = nodePath.dirname(filePath);
  const sidecarPaths = [`${filePath}-wal`, `${filePath}-shm`];
  try {
    fsImpl.mkdirSync(directoryPath, { recursive: true, mode: 0o700 });
    if (!fsImpl.existsSync(filePath)) {
      const descriptor = fsImpl.openSync(filePath, 'a', 0o600);
      fsImpl.closeSync(descriptor);
    }
    fsImpl.chmodSync(filePath, 0o600);
    for (const sidecarPath of sidecarPaths) {
      if (fsImpl.existsSync(sidecarPath)) fsImpl.chmodSync(sidecarPath, 0o600);
    }
    const DatabaseSync = loadDatabaseSync();
    const db = new DatabaseSync(filePath, { timeout: 5000 });
    try {
      ensureHostMetadataSchema(db);
      for (const sidecarPath of sidecarPaths) {
        if (fsImpl.existsSync(sidecarPath)) fsImpl.chmodSync(sidecarPath, 0o600);
      }
    } catch (error) {
      try { db.close(); } catch { /* preserve the schema failure */ }
      throw error;
    }
    return { db, filePath };
  } catch (error) {
    if (error instanceof HostMetadataError) throw error;
    throw new MetadataWriteError(`Could not open Host metadata database: ${error?.message ?? error}`, error);
  }
};

export const withTransaction = (db, work) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch { /* preserve the original failure */ }
    throw error;
  }
};

export const readJsonObject = (raw, label) => {
  let parsed;
  try { parsed = JSON.parse(raw); } catch (error) { throw new MetadataCorruptError(`${label} is malformed JSON`, error); }
  const object = JsonObjectSchema.safeParse(parsed);
  if (!object.success) throw new MetadataCorruptError(`${label} must be a JSON object`);
  return object.data;
};

/** Fence new operations and drain every admitted read, conversion and write. */
export const createMetadataLifecycle = (db, closeDatabase) => {
  const pending = new Set();
  let closing = false;
  let closePromise;
  const run = (work) => {
    if (closing) return Promise.reject(new MetadataReadError('Host metadata store is closing or closed'));
    const operation = Promise.resolve().then(work);
    const settled = operation.then(() => undefined, () => undefined);
    pending.add(settled);
    void settled.then(() => pending.delete(settled));
    return operation;
  };
  const flush = async () => { await Promise.all([...pending]); };
  const close = () => {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => { await flush(); if (closeDatabase) db.close(); })();
    return closePromise;
  };
  return { run, flush, close };
};
