import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import type * as nodeSqlite from 'node:sqlite';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema),
]));
const JsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), JsonValueSchema);
const DatabaseLocationSchema = z.object({ dataDir: z.string().optional(), databasePath: z.string().optional() })
  .refine((value) => value.dataDir !== undefined || value.databasePath !== undefined);
const UserVersionRowSchema = z.object({ user_version: z.union([z.number(), z.bigint()]) });

const require = createRequire(import.meta.url);

export type HostMetadataErrorCode =
  | 'METADATA_CORRUPT'
  | 'METADATA_READ_FAILED'
  | 'METADATA_WRITE_FAILED'
  | 'METADATA_SCHEMA_TOO_NEW';

export interface OpenHostMetadataDatabaseOptions {
  dataDir?: string | undefined;
  path?: typeof path;
  fsImpl?: typeof fs;
  databasePath?: string | undefined;
}

export interface OpenedHostMetadataDatabase {
  db: DatabaseSync;
  filePath: string;
}

export interface MetadataLifecycleDatabase {
  exec(sql: string): void;
  close(): void;
}

export interface MetadataLifecycle {
  run: <Result>(work: () => Result | Promise<Result>) => Promise<Result>;
  flush: () => Promise<void>;
  close: () => Promise<void>;
}

export class HostMetadataError extends Error {
  code: string;

  constructor(message: string, code: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'HostMetadataError';
    this.code = code;
  }
}

export class MetadataCorruptError extends HostMetadataError {
  constructor(message: string, cause?: unknown) { super(message, 'METADATA_CORRUPT', cause); this.name = 'MetadataCorruptError'; }
}

export class MetadataReadError extends HostMetadataError {
  constructor(message: string, cause?: unknown) { super(message, 'METADATA_READ_FAILED', cause); this.name = 'MetadataReadError'; }
}

export class MetadataWriteError extends HostMetadataError {
  constructor(message: string, cause?: unknown) { super(message, 'METADATA_WRITE_FAILED', cause); this.name = 'MetadataWriteError'; }
}

export class MetadataSchemaTooNewError extends HostMetadataError {
  constructor(message: string, cause?: unknown) { super(message, 'METADATA_SCHEMA_TOO_NEW', cause); this.name = 'MetadataSchemaTooNewError'; }
}
const loadDatabaseSync = (): typeof DatabaseSync => {
  try {
    const builtin = process.getBuiltinModule?.('node:sqlite');
    if (builtin) return builtin.DatabaseSync;
    const loaded: typeof nodeSqlite = require('node:sqlite');
    return loaded.DatabaseSync;
  } catch (error) {
    throw new MetadataWriteError('Host metadata requires the node:sqlite runtime', error);
  }
};

const metadataDatabasePath = (dataDir: string, nodePath: typeof path = path): string =>
  nodePath.join(dataDir, 'host-metadata.sqlite');

export const CURRENT_HOST_METADATA_VERSION = 9;

const HOST_METADATA_MIGRATIONS: Array<(db: DatabaseSync) => void> = [
  (db) => {
    db.exec(`
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
      CREATE TABLE IF NOT EXISTS prompt_queue_owner (
        session_id TEXT PRIMARY KEY, project_id TEXT NOT NULL, workspace_id TEXT NOT NULL, revision TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS prompt_queue_item (
        session_id TEXT NOT NULL, item_id TEXT NOT NULL, position INTEGER NOT NULL, created_at INTEGER NOT NULL,
        payload TEXT NOT NULL, lease_id TEXT, lease_expires_at INTEGER,
        PRIMARY KEY(session_id, item_id)
      );
      CREATE TABLE IF NOT EXISTS prompt_queue_delivery (
        lease_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, item_id TEXT NOT NULL, run_id TEXT NOT NULL UNIQUE,
        epoch TEXT NOT NULL, phase TEXT NOT NULL, updated_at INTEGER NOT NULL, error_code TEXT
      );
      CREATE TABLE IF NOT EXISTS prompt_queue_command (
        session_id TEXT NOT NULL, command_id TEXT NOT NULL, payload_hash TEXT NOT NULL, response TEXT NOT NULL,
        expires_at INTEGER NOT NULL, PRIMARY KEY(session_id, command_id)
      );
      CREATE TABLE IF NOT EXISTS prompt_queue_conversion (
        source_id TEXT PRIMARY KEY, source_hash TEXT NOT NULL, session_id TEXT
      );
    `);
  },
  (db) => {
    db.exec(`
      CREATE TABLE host_worktree_archives (
        host_project_id TEXT NOT NULL, archive_id TEXT NOT NULL,
        archive_ref TEXT NOT NULL, snapshot_commit TEXT NOT NULL,
        project_id TEXT NOT NULL, anchor_workspace_id TEXT NOT NULL,
        phase TEXT NOT NULL, revision INTEGER NOT NULL CHECK (revision > 0),
        claim_id TEXT, claim_generation TEXT, target_workspace_id TEXT,
        preapply_head TEXT, preapply_fingerprint TEXT, expected_fingerprint TEXT,
        apply_attempted INTEGER NOT NULL DEFAULT 0 CHECK (apply_attempted IN (0, 1)),
        branch_name TEXT, branch_oid TEXT,
        PRIMARY KEY (host_project_id, archive_id)
      );
      CREATE TABLE host_worktree_archive_sessions (
        host_project_id TEXT NOT NULL, archive_id TEXT NOT NULL,
        session_id TEXT NOT NULL, root_session_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL, agent_directory_id TEXT NOT NULL,
        original_archive_revision TEXT, original_archived_at INTEGER,
        expected_archive_revision TEXT, target_workspace_id TEXT,
        progress TEXT NOT NULL,
        PRIMARY KEY (host_project_id, archive_id, session_id),
        FOREIGN KEY (host_project_id, archive_id)
          REFERENCES host_worktree_archives (host_project_id, archive_id) ON DELETE CASCADE
      );
    `);
  },
  (db) => {
    db.exec('ALTER TABLE host_worktree_archive_sessions ADD COLUMN delete_operation_id TEXT');
  },
  (db) => {
    db.exec(`CREATE TABLE host_session_admissions (
      admission_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL,
      operation TEXT NOT NULL, root_session_id TEXT NOT NULL
    )`);
  },
  (db) => {
    db.exec('ALTER TABLE host_worktree_archives ADD COLUMN delete_branch_requested INTEGER NOT NULL DEFAULT 0 CHECK (delete_branch_requested IN (0, 1))');
  },
  (db) => {
    db.exec('ALTER TABLE host_worktree_archives ADD COLUMN delete_cas_completed INTEGER NOT NULL DEFAULT 0 CHECK (delete_cas_completed IN (0, 1))');
  },
  (db) => {
    db.exec('ALTER TABLE host_worktree_archives ADD COLUMN restore_cas_completed INTEGER NOT NULL DEFAULT 0 CHECK (restore_cas_completed IN (0, 1))');
  },
  (db) => {
    db.exec('ALTER TABLE host_worktree_archives ADD COLUMN restore_cas_started INTEGER NOT NULL DEFAULT 0 CHECK (restore_cas_started IN (0, 1))');
  },
  (db) => {
    db.exec('ALTER TABLE host_direct_command ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0');
  },
];

export const ensureHostMetadataSchema = (db: DatabaseSync): number => {
  const versionRow = UserVersionRowSchema.safeParse(db.prepare('PRAGMA user_version').get());
  const currentVersion = Number(versionRow.success ? versionRow.data.user_version : 0);
  if (currentVersion > CURRENT_HOST_METADATA_VERSION) {
    throw new MetadataSchemaTooNewError(
      `Host metadata database schema version ${currentVersion} is newer than supported version ${CURRENT_HOST_METADATA_VERSION}`,
    );
  }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;');
  if (currentVersion === CURRENT_HOST_METADATA_VERSION) {
    return currentVersion;
  }
  withTransaction(db, () => {
    const lockedVersionRow = UserVersionRowSchema.safeParse(db.prepare('PRAGMA user_version').get());
    const lockedVersion = Number(lockedVersionRow.success ? lockedVersionRow.data.user_version : 0);
    if (lockedVersion > CURRENT_HOST_METADATA_VERSION) {
      throw new MetadataSchemaTooNewError(
        `Host metadata database schema version ${lockedVersion} is newer than supported version ${CURRENT_HOST_METADATA_VERSION}`,
      );
    }
    for (let v = lockedVersion; v < CURRENT_HOST_METADATA_VERSION; v++) {
      const migration = HOST_METADATA_MIGRATIONS[v];
      if (!migration) throw new MetadataWriteError(`Missing Host metadata migration ${v}`);
      migration(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    }
  });
  return CURRENT_HOST_METADATA_VERSION;
};

export const openHostMetadataDatabase = ({
  dataDir,
  path: nodePath = path,
  fsImpl = fs,
  databasePath,
}: OpenHostMetadataDatabaseOptions = {}): OpenedHostMetadataDatabase => {
  const location = DatabaseLocationSchema.safeParse({ dataDir, databasePath });
  if (!location.success) {
    throw new MetadataWriteError('Host metadata data directory is required');
  }
  const filePath = location.data.databasePath ?? metadataDatabasePath(location.data.dataDir ?? '', nodePath);
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
    const DatabaseSyncCtor = loadDatabaseSync();
    const db = new DatabaseSyncCtor(filePath, { timeout: 5000 });
    try {
      ensureHostMetadataSchema(db);
      for (const sidecarPath of sidecarPaths) {
        if (fsImpl.existsSync(sidecarPath)) fsImpl.chmodSync(sidecarPath, 0o600);
      }
    } catch (error) {
      try { db.close(); } catch (ignored) { void ignored; }
      throw error;
    }
    return { db, filePath };
  } catch (error) {
    if (error instanceof HostMetadataError) throw error;
    throw new MetadataWriteError(`Could not open Host metadata database: ${error instanceof Error ? error.message : String(error)}`, error);
  }
};

export const withTransaction = <Result>(db: Pick<DatabaseSync, 'exec'>, work: () => Result): Result => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (ignored) { void ignored; }
    throw error;
  }
};

export const readJsonObject = (raw: string, label: string): JsonObject => {
  let parsed: JsonValue;
  try { parsed = JsonValueSchema.parse(JSON.parse(raw)); } catch (error) { throw new MetadataCorruptError(`${label} is malformed JSON`, error); }
  const object = JsonObjectSchema.safeParse(parsed);
  if (!object.success) throw new MetadataCorruptError(`${label} must be a JSON object`);
  return object.data;
};

export const createMetadataLifecycle = (db: MetadataLifecycleDatabase, closeDatabase: boolean): MetadataLifecycle => {
  const pending = new Set<Promise<void>>();
  let closing = false;
  let closePromise: Promise<void> | undefined;

  const run = <Result>(work: () => Result | Promise<Result>): Promise<Result> => {
    if (closing) return Promise.reject(new MetadataReadError('Host metadata store is closing or closed'));
    const operation = Promise.resolve().then(work);
    const settled = operation.then(() => undefined, () => undefined);
    pending.add(settled);
    void settled.then(() => pending.delete(settled));
    return operation;
  };
  const flush = async (): Promise<void> => { await Promise.all([...pending]); };
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => { await flush(); if (closeDatabase) db.close(); })();
    return closePromise;
  };
  return { run, flush, close };
};
