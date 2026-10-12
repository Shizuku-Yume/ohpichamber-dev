import fs from 'node:fs';
import path from 'node:path';
import { asNonEmptyString } from '../shared/guards.js';
import { createLegacyMetadataConversion } from '../host/metadata-conversion.js';
import { HostMetadataError, MetadataCorruptError, MetadataReadError, MetadataWriteError, createMetadataLifecycle, ensureHostMetadataSchema, openHostMetadataDatabase, withTransaction } from '../host/metadata-sqlite.js';
import { z } from 'zod';

const TimestampSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const ArchiveRowSchema = z.object({ revision: TimestampSchema, archived_at: TimestampSchema.nullable() });
const asTimestamp = (value) => { const parsed = TimestampSchema.safeParse(value); return parsed.success ? parsed.data : null; };
const asIdList = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(asNonEmptyString).filter(Boolean))];

/** Host archive/retention sidecar. `null` is an explicit unarchive tombstone. */
export const createArchiveStore = ({ dataDir, fsPromises = fs.promises, path: nodePath = path, now = Date.now, database = null, closeDatabase = database === null } = {}) => {
  const opened = database ? { db: database, filePath: nodePath.join(dataDir, 'host-metadata.sqlite') } : openHostMetadataDatabase({ dataDir, path: nodePath });
  const { db, filePath } = opened;
  if (database) ensureHostMetadataSchema(db);
  const lifecycle = createMetadataLifecycle(db, closeDatabase);
  let transactionChain = Promise.resolve();
  const runExclusive = (work) => { const next = transactionChain.then(work, work); transactionChain = next.then(() => undefined, () => undefined); return next; };
  const conversion = createLegacyMetadataConversion({
    db, dataDir, fsPromises, nodePath, fileName: 'sessions-archive.json',
    parse: (parsed) => {
      const entries = [];
      const errors = {};
      for (const [key, value] of Object.entries(parsed)) {
        const id = asNonEmptyString(key);
        if (!id || (value !== null && !asTimestamp(value))) errors[key] = 'METADATA_CORRUPT';
        else entries.push([id, value]);
      }
      return { entries, errors };
    },
    insert: (entries) => {
      const insert = db.prepare('INSERT OR IGNORE INTO session_archive (session_id, revision, archived_at) VALUES (?, 1, ?)');
      for (const [id, archivedAt] of entries) insert.run(id, archivedAt);
    },
  });
  const readRow = (id) => {
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
  const resolveCurrent = async (id) => {
    const converted = await conversion.convert();
    const current = readRow(id);
    if (current) return current;
    if (converted.errors[id]) throw new MetadataCorruptError('Legacy archive state is corrupt');
    if (converted.error) throw converted.error;
    return null;
  };
  const getState = (id) => lifecycle.run(() => { const sessionID = asNonEmptyString(id); return sessionID ? resolveCurrent(sessionID) : null; });
  const listAll = () => lifecycle.run(async () => {
    const converted = await conversion.convert();
    let rows;
    try { rows = db.prepare('SELECT session_id FROM session_archive ORDER BY session_id').all(); }
    catch (error) { throw new MetadataReadError('Could not list Host archive state', error); }
    const entries = {};
    const errors = { ...converted.errors };
    for (const { session_id: id } of rows) {
      try { entries[id] = readRow(id); delete errors[id]; }
      catch (error) { errors[id] = error.code; }
    }
    const status = { status: converted.status };
    if (converted.error) status.code = converted.error.code;
    return { entries, errors, conversion: status };
  });
  const getAll = async () => {
    const result = await listAll();
    if (Object.keys(result.errors).length > 0) throw new MetadataCorruptError('Some session archive records are corrupt');
    if (result.conversion.code) throw new HostMetadataError('Legacy archive conversion is incomplete', result.conversion.code);
    return Object.fromEntries(Object.entries(result.entries).map(([id, entry]) => [id, entry.archivedAt]));
  };
  const apply = (ids, value) => {
    const targets = asIdList(ids);
    return lifecycle.run(() => runExclusive(async () => {
      const ready = [];
      const failedIds = [];
      for (const id of targets) {
        try { await resolveCurrent(id); ready.push(id); }
        catch { failedIds.push(id); }
      }
      if (ready.length === 0) return { applied: [], failedIds, revisions: {} };
      const revisions = {};
      try {
        withTransaction(db, () => {
          const statement = db.prepare(`INSERT INTO session_archive (session_id, revision, archived_at) VALUES (?, 1, ?)
            ON CONFLICT(session_id) DO UPDATE SET revision = session_archive.revision + 1, archived_at = excluded.archived_at`);
          for (const id of ready) { statement.run(id, value); revisions[id] = readRow(id).revision; }
        });
      } catch (error) { throw new MetadataWriteError('Could not write Host archive state', error); }
      return { applied: ready, failedIds, revisions };
    }));
  };
  return {
    getState, listAll, getAll, convertLegacy: () => lifecycle.run(conversion.convert),
    isArchived: async (id) => {
      const state = await getState(id);
      return state !== null && state.archivedAt !== null;
    },
    archivedAt: async (id) => (await getState(id))?.archivedAt ?? null,
    archive: async (ids, value) => {
      const stamp = asTimestamp(value) ?? now();
      const result = await apply(ids, stamp);
      return { archived: result.applied.map((id) => ({ id, archivedAt: stamp })), failedIds: result.failedIds };
    },
    unarchive: async (ids) => {
      const result = await apply(ids, null);
      return { restored: result.applied.map((id) => ({ id, archivedAt: null })), failedIds: result.failedIds };
    },
    flush: lifecycle.flush, close: lifecycle.close, databasePath: filePath,
  };
};
