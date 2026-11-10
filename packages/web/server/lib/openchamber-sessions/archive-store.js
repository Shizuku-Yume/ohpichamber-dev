<<<<<<< HEAD
import fs from 'node:fs';
import path from 'node:path';
=======
/**
 * Session archive state OpenChamber kept before OpenCode held it.
 *
 * OpenCode archives sessions itself (`PATCH /api/session/{id}` with
 * `archived`), and `session-archive.js` sends every archive there. This file
 * only drains: it holds entries written before 2.1, and for sessions of
 * deleted directories before 2.2, until the migration pushes them.
 *
 * One JSON file per data dir, `{ [sessionID]: archivedAt | null }`, folded onto
 * the session records the proxy serves: a number archives, `null` is an
 * explicit unarchive that overrides what OpenCode carries, and a session the
 * file does not mention keeps whatever OpenCode says. An entry leaves the file
 * once OpenCode holds the session's state.
 */

>>>>>>> bc50ba56a
import { asNonEmptyString } from '../shared/guards.js';
import { createLegacyMetadataConversion } from '../host/metadata-conversion.js';
import { HostMetadataError, MetadataCorruptError, MetadataReadError, MetadataWriteError, createMetadataLifecycle, ensureHostMetadataSchema, openHostMetadataDatabase, withTransaction } from '../host/metadata-sqlite.js';
import { z } from 'zod';

const TimestampSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const ArchiveRowSchema = z.object({ revision: TimestampSchema, archived_at: TimestampSchema.nullable() });
const asTimestamp = (value) => { const parsed = TimestampSchema.safeParse(value); return parsed.success ? parsed.data : null; };
const asIdList = (ids) => [...new Set((Array.isArray(ids) ? ids : []).map(asNonEmptyString).filter(Boolean))];

/** Host archive/retention sidecar. `null` is an explicit unarchive tombstone. */
export const createArchiveStore = ({ dataDir, fsPromises = fs.promises, path: nodePath = path, now = Date.now, database = null, closeDatabase = database === null, assertSessionWritable = () => {} } = {}) => {
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
<<<<<<< HEAD
    const status = { status: converted.status };
    if (converted.error) status.code = converted.error.code;
    return { entries, errors, conversion: status };
  });
=======
    return loadPromise;
  };

  /** Only ever called inside `runExclusive`, so two batches cannot interleave their renames. */
  const persist = async () => {
    const payload = JSON.stringify(snapshot());
    await fsPromises.mkdir(dataDir, { recursive: true });
    // Temp file in the same directory so the rename is atomic on one device:
    // a reader sees either the previous file or the complete new one.
    const tmpPath = `${filePath}.${process.pid}.tmp`;
    await fsPromises.writeFile(tmpPath, payload, 'utf8');
    await fsPromises.rename(tmpPath, filePath);
  };

  /**
   * Drops entries OpenCode now holds the state for. Writes only when one of
   * the ids had an entry; a failed write restores them and reports them.
   */
  const forgetExclusive = async (targets) => {
    const loadResult = await load();
    if (!loadResult.ok || !writable) return { failedIds: targets.filter((id) => entries.has(id)) };
    const removed = targets.filter((id) => entries.has(id)).map((id) => [id, entries.get(id)]);
    if (removed.length === 0) return { failedIds: [] };
    for (const [id] of removed) entries.delete(id);
    try {
      await persist();
    } catch (error) {
      for (const [id, value] of removed) entries.set(id, value);
      console.warn('[openchamber-sessions] failed to persist archive state:', error?.message ?? error);
      return { failedIds: removed.map(([id]) => id) };
    }
    return { failedIds: [] };
  };

>>>>>>> bc50ba56a
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
          for (const id of ready) { assertSessionWritable(id); statement.run(id, value); revisions[id] = readRow(id).revision; }
        });
      } catch (error) { if (error instanceof HostMetadataError) throw error; throw new MetadataWriteError('Could not write Host archive state', error); }
      return { applied: ready, failedIds, revisions };
    }));
  };
  return {
    getState, listAll, getAll, convertLegacy: () => lifecycle.run(conversion.convert),
    isArchived: async (id) => {
      const state = await getState(id);
      return state !== null && state.archivedAt !== null;
    },
<<<<<<< HEAD
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
=======
    forget: async (ids) => {
      const targets = asIdList(ids);
      if (targets.length === 0) return { failedIds: [] };
      return runExclusive(() => forgetExclusive(targets));
    },
    filePath,
>>>>>>> bc50ba56a
  };
};
