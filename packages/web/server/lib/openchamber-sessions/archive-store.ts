import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { asNonEmptyString } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';
import { createLegacyMetadataConversion } from '../host/metadata-conversion.js';
import {
  HostMetadataError,
  MetadataCorruptError,
  MetadataReadError,
  MetadataWriteError,
  createMetadataLifecycle,
  ensureHostMetadataSchema,
  openHostMetadataDatabase,
  withTransaction,
} from '../host/metadata-sqlite.js';

const errorCodeSchema = z.object({ code: z.string() });
const TimestampSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const ArchiveRowSchema = z.object({ revision: TimestampSchema, archived_at: TimestampSchema.nullable() });
const ArchiveBulkRowSchema = z.object({
  session_id: z.string(),
  revision: z.unknown(),
  archived_at: z.unknown(),
});
const SessionIdRowSchema = z.object({ session_id: z.string() });

const asTimestamp = (value: JsonValue | number | undefined): number | null => {
  const parsed = TimestampSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const asIdList = (ids: readonly string[]): string[] =>
  [...new Set((Array.isArray(ids) ? ids : []).map(asNonEmptyString).filter((id): id is string => id !== null))];

export interface ArchiveState {
  archivedAt: number | null;
  revision: string;
}

export interface ArchiveApplyResult {
  applied: string[];
  failedIds: string[];
  revisions: Record<string, string>;
}

export interface ConversionStatusSummary {
  status: string;
  code?: string;
}

export interface ArchiveStoreOptions {
  dataDir?: string | undefined;
  fsPromises?: typeof fs.promises;
  path?: typeof path;
  now?: () => number;
  database?: ReturnType<typeof openHostMetadataDatabase>['db'] | null;
  closeDatabase?: boolean;
  assertSessionWritable?: (id: string) => void;
}

export const createArchiveStore = ({
  dataDir = '',
  fsPromises = fs.promises,
  path: nodePath = path,
  now = Date.now,
  database = null,
  closeDatabase = database === null,
  assertSessionWritable = () => { },
}: ArchiveStoreOptions = {}) => {
  const opened = database
    ? { db: database, filePath: nodePath.join(dataDir, 'host-metadata.sqlite') }
    : openHostMetadataDatabase({ dataDir, path: nodePath });
  const { db, filePath } = opened;
  if (database) ensureHostMetadataSchema(db);
  const lifecycle = createMetadataLifecycle(db, closeDatabase);
  let transactionChain: Promise<void> = Promise.resolve();
  const runExclusive = <Result>(work: () => Promise<Result>): Promise<Result> => {
    const next = transactionChain.then(work, work);
    transactionChain = next.then(() => undefined, () => undefined);
    return next;
  };
  const conversion = createLegacyMetadataConversion({
    db,
    dataDir,
    fsPromises,
    nodePath,
    fileName: 'sessions-archive.json',
    parse: (parsed: Record<string, JsonValue | undefined>) => {
      const entries: [string, number | null][] = [];
      const errors: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const id = asNonEmptyString(key);
        if (!id || (value !== null && !asTimestamp(value))) errors[key] = 'METADATA_CORRUPT';
        else entries.push([id, value === null ? null : asTimestamp(value)]);
      }
      return { entries, errors };
    },
    insert: (entries: [string, number | null][]) => {
      const insert = db.prepare('INSERT OR IGNORE INTO session_archive (session_id, revision, archived_at) VALUES (?, 1, ?)');
      for (const [id, archivedAt] of entries) insert.run(id, archivedAt);
    },
  });

  const readRow = (id: string): ArchiveState | null => {
    try {
      const row = db.prepare('SELECT revision, archived_at FROM session_archive WHERE session_id = ?').get(id);
      if (!row) return null;
      const parsed = ArchiveRowSchema.safeParse(row);
      if (!parsed.success) throw new MetadataCorruptError('Session archive state is corrupt');
      return { archivedAt: parsed.data.archived_at, revision: String(parsed.data.revision) };
    } catch (error) {
      if (error instanceof MetadataCorruptError) throw error;
      throw new MetadataReadError('Could not read Host archive state', error);
    }
  };

  const resolveCurrent = async (id: string): Promise<ArchiveState | null> => {
    const converted = await conversion.convert();
    const current = readRow(id);
    if (current) return current;
    if (converted.errors[id]) throw new MetadataCorruptError('Legacy archive state is corrupt');
    if (converted.error) throw converted.error;
    return null;
  };

  const getState = (id: string): Promise<ArchiveState | null> => lifecycle.run(async () => {
    const sessionID = asNonEmptyString(id);
    return sessionID ? resolveCurrent(sessionID) : null;
  });

  const getStates = (sessionIds: readonly string[]) => lifecycle.run(async () => {
    const ids = asIdList(sessionIds);
    const entries = new Map<string, ArchiveState | null>();
    const errors = new Map<string, string>();
    if (ids.length === 0) return { entries, errors };
    const converted = await conversion.convert();
    if (converted.error) throw converted.error;
    let rawRows: unknown[];
    try {
      rawRows = db.prepare(`SELECT session_id, revision, archived_at FROM session_archive WHERE session_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    } catch (error) {
      throw new MetadataReadError('Could not read Host archive state', error);
    }
    const rows = z.array(ArchiveBulkRowSchema).parse(rawRows);
    const rowById = new Map(rows.map((row) => [row.session_id, row]));
    for (const id of ids) {
      const row = rowById.get(id);
      if (!row) {
        if (converted.errors[id]) errors.set(id, 'METADATA_CORRUPT');
        else entries.set(id, null);
        continue;
      }
      const parsed = ArchiveRowSchema.safeParse({ revision: row.revision, archived_at: row.archived_at });
      if (!parsed.success) {
        errors.set(id, 'METADATA_CORRUPT');
        continue;
      }
      entries.set(id, { archivedAt: parsed.data.archived_at, revision: String(parsed.data.revision) });
    }
    return { entries, errors };
  });

  const listAll = () => lifecycle.run(async () => {
    const converted = await conversion.convert();
    let rawRows: unknown[];
    try {
      rawRows = db.prepare('SELECT session_id FROM session_archive ORDER BY session_id').all();
    } catch (error) {
      throw new MetadataReadError('Could not list Host archive state', error);
    }
    const rows = z.array(SessionIdRowSchema).parse(rawRows);
    const entries: Record<string, ArchiveState | null> = {};
    const errors = { ...converted.errors };
    for (const { session_id: id } of rows) {
      try {
        entries[id] = readRow(id);
        delete errors[id];
      } catch (error) {
        const parsedError = errorCodeSchema.safeParse(error);
        errors[id] = parsedError.success ? parsedError.data.code : 'METADATA_READ_FAILED';
      }
    }
    const status: ConversionStatusSummary = { status: converted.status };
    if (converted.error) status.code = String(converted.error.code);
    return { entries, errors, conversion: status };
  });

  const getAll = async (): Promise<Record<string, number | null>> => {
    const result = await listAll();
    if (Object.keys(result.errors).length > 0) throw new MetadataCorruptError('Some session archive records are corrupt');
    if (result.conversion.code) throw new HostMetadataError('Legacy archive conversion is incomplete', result.conversion.code);
    return Object.fromEntries(
      Object.entries(result.entries).map(([id, entry]) => [id, entry ? entry.archivedAt : null]),
    );
  };

  const apply = (ids: readonly string[], value: number | null): Promise<ArchiveApplyResult> => {
    const targets = asIdList(ids);
    return lifecycle.run(() => runExclusive(async (): Promise<ArchiveApplyResult> => {
      const ready: string[] = [];
      const failedIds: string[] = [];
      for (const id of targets) {
        try {
          await resolveCurrent(id);
          ready.push(id);
        } catch {
          failedIds.push(id);
        }
      }
      if (ready.length === 0) return { applied: [], failedIds, revisions: {} };
      const revisions: Record<string, string> = {};
      try {
        withTransaction(db, () => {
          const statement = db.prepare(`INSERT INTO session_archive (session_id, revision, archived_at) VALUES (?, 1, ?)
            ON CONFLICT(session_id) DO UPDATE SET revision = session_archive.revision + 1, archived_at = excluded.archived_at`);
          for (const id of ready) {
            assertSessionWritable(id);
            statement.run(id, value);
            const row = readRow(id);
            if (row) revisions[id] = row.revision;
          }
        });
      } catch (error) {
        if (error instanceof HostMetadataError) throw error;
        throw new MetadataWriteError('Could not write Host archive state', error);
      }
      return { applied: ready, failedIds, revisions };
    }));
  };

  return {
    getState,
    getStates,
    listAll,
    getAll,
    convertLegacy: () => lifecycle.run(conversion.convert),
    isArchived: async (id: string): Promise<boolean> => {
      const state = await getState(id);
      return state !== null && state.archivedAt !== null;
    },
    archivedAt: async (id: string): Promise<number | null> => (await getState(id))?.archivedAt ?? null,
    archive: async (ids: readonly string[], value?: number) => {
      const stamp = asTimestamp(value) ?? now();
      const result = await apply(ids, stamp);
      return { archived: result.applied.map((id) => ({ id, archivedAt: stamp })), failedIds: result.failedIds };
    },
    unarchive: async (ids: readonly string[]) => {
      const result = await apply(ids, null);
      return { restored: result.applied.map((id) => ({ id, archivedAt: null })), failedIds: result.failedIds };
    },
    flush: lifecycle.flush,
    close: lifecycle.close,
    databasePath: filePath,
  };
};

export type ArchiveStore = ReturnType<typeof createArchiveStore>;
