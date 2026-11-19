<<<<<<< HEAD:packages/web/server/lib/session-folders/routes.js
import pathDefault from 'node:path';
import fsDefault from 'node:fs';
import { z } from 'zod';
import { isRecord as isObjectRecord } from '../shared/guards.js';
import { createLegacyMetadataConversion } from '../host/metadata-conversion.js';
import { applyFolderChanges, folderChangesBodySchema } from './folder-changes.js';
import {
  MetadataCorruptError,
  MetadataReadError,
  MetadataWriteError,
  createMetadataLifecycle,
  ensureHostMetadataSchema,
  openHostMetadataDatabase,
  readJsonObject,
  withTransaction,
} from '../host/metadata-sqlite.js';
||||||| bc50ba56aa:packages/web/server/lib/session-folders/routes.js
import { isRecord as isObjectRecord } from '../shared/guards.js';
import { TOMBSTONE_TTL_MS, applyFolderChanges, folderChangesBodySchema } from './folder-changes.js';
=======
import { isRecord } from '../shared/guards.js';
import { TOMBSTONE_TTL_MS, applyFolderChanges, folderChangesBodySchema } from './folder-changes.js';
import type { FolderSnapshot, FolderTombstones, SessionFolder, SessionFoldersApp, SessionFoldersDependencies, SessionFoldersMap, StoredFolderSnapshot } from './contracts.js';
>>>>>>> upstream/main:packages/web/server/lib/session-folders/routes.ts

const MAX_BODY_BYTES = 4 * 1024 * 1024;
<<<<<<< HEAD:packages/web/server/lib/session-folders/routes.js
const LEGACY_FILE_NAME = 'sessions-directories.json';
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_SNAPSHOT = { version: 1, foldersMap: {}, collapsedFolderIds: [] };
const FolderSchema = z.looseObject({
  id: z.string(), name: z.string(), sessionIds: z.array(z.string()), createdAt: z.number(),
  parentId: z.string().nullable().optional(),
});
const FolderListSchema = z.array(FolderSchema);
const SnapshotRequestSchema = z.looseObject({
  version: z.literal(1), foldersMap: z.record(z.string(), FolderListSchema),
  collapsedFolderIds: z.array(z.string()), deletedFolderIds: z.record(z.string(), z.number()).optional(),
});
const SnapshotSchema = SnapshotRequestSchema.extend({ updatedAt: z.number().positive() });
const HeaderSchema = SnapshotSchema.omit({ foldersMap: true });
const LegacySnapshotSchema = HeaderSchema.extend({ foldersMap: z.record(z.string(), z.unknown()) });
const RevisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
||||||| bc50ba56aa:packages/web/server/lib/session-folders/routes.js

const hasValidFolderShape = (folder) => (
  isObjectRecord(folder)
  && typeof folder.id === 'string'
  && typeof folder.name === 'string'
  && Array.isArray(folder.sessionIds)
  && folder.sessionIds.every((sessionId) => typeof sessionId === 'string')
  && typeof folder.createdAt === 'number'
  && Number.isFinite(folder.createdAt)
  && (folder.parentId === undefined || folder.parentId === null || typeof folder.parentId === 'string')
);

const hasValidFoldersMapShape = (foldersMap) => (
  isObjectRecord(foldersMap)
  && Object.values(foldersMap).every((folders) => (
    Array.isArray(folders) && folders.every(hasValidFolderShape)
  ))
);

// folderId -> deletedAt. Optional so snapshots written before tombstones
// existed stay valid.
const hasValidTombstonesShape = (tombstones) => (
  tombstones === undefined
  || (isObjectRecord(tombstones)
    && Object.values(tombstones).every((deletedAt) => typeof deletedAt === 'number' && Number.isFinite(deletedAt)))
);

const hasValidFolderSnapshotShape = (snapshot) => (
  isObjectRecord(snapshot)
  && snapshot.version === 1
  && hasValidFoldersMapShape(snapshot.foldersMap)
  && Array.isArray(snapshot.collapsedFolderIds)
  && snapshot.collapsedFolderIds.every((folderId) => typeof folderId === 'string')
  && hasValidTombstonesShape(snapshot.deletedFolderIds)
);

const EMPTY_SNAPSHOT = Object.freeze({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: 0 });
=======

const isObjectRecord = (value: unknown): value is object => isRecord(value);

const isSessionId = (value: unknown): value is string => typeof value === 'string';
const isDeletionTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPositiveRevision = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

const isSessionFolder = (folder: unknown): folder is SessionFolder => (
  isObjectRecord(folder)
  && 'id' in folder && typeof folder.id === 'string'
  && 'name' in folder && typeof folder.name === 'string'
  && 'sessionIds' in folder && Array.isArray(folder.sessionIds)
  && folder.sessionIds.every(isSessionId)
  && 'createdAt' in folder && typeof folder.createdAt === 'number'
  && Number.isFinite(folder.createdAt)
  && (!('parentId' in folder) || folder.parentId === undefined || folder.parentId === null || typeof folder.parentId === 'string')
);

const isSessionFolderList = (value: unknown): value is SessionFolder[] => (
  Array.isArray(value) && value.every(isSessionFolder)
);

const isSessionFoldersMap = (foldersMap: unknown): foldersMap is SessionFoldersMap => (
  isObjectRecord(foldersMap)
  && Object.values(foldersMap).every(isSessionFolderList)
);

const isFolderTombstones = (tombstones: unknown): tombstones is FolderTombstones | undefined => (
  tombstones === undefined
  || (isObjectRecord(tombstones)
    && Object.values(tombstones).every(isDeletionTime))
);

const isStoredFolderSnapshot = (snapshot: unknown): snapshot is StoredFolderSnapshot => (
  isObjectRecord(snapshot)
  && 'version' in snapshot && snapshot.version === 1
  && 'foldersMap' in snapshot && isSessionFoldersMap(snapshot.foldersMap)
  && 'collapsedFolderIds' in snapshot && Array.isArray(snapshot.collapsedFolderIds)
  && snapshot.collapsedFolderIds.every(isSessionId)
  && (!('deletedFolderIds' in snapshot) || isFolderTombstones(snapshot.deletedFolderIds))
);

const EMPTY_SNAPSHOT: FolderSnapshot = Object.freeze({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: 0 });
>>>>>>> upstream/main:packages/web/server/lib/session-folders/routes.ts

const mergeTombstones = (current: FolderTombstones | undefined, incoming: FolderTombstones | undefined, now: number) => {
  const merged: FolderTombstones = {};
  for (const source of [current, incoming]) {
<<<<<<< HEAD:packages/web/server/lib/session-folders/routes.js
    if (!isObjectRecord(source)) continue;
    for (const [id, deletedAt] of Object.entries(source)) {
||||||| bc50ba56aa:packages/web/server/lib/session-folders/routes.js
    if (!isObjectRecord(source)) continue;
    for (const [folderId, deletedAt] of Object.entries(source)) {
=======
    if (source === undefined) continue;
    for (const [folderId, deletedAt] of Object.entries(source)) {
>>>>>>> upstream/main:packages/web/server/lib/session-folders/routes.ts
      if (now - deletedAt > TOMBSTONE_TTL_MS) continue;
      merged[id] = Math.max(merged[id] ?? 0, deletedAt);
    }
  }
  return merged;
};

<<<<<<< HEAD:packages/web/server/lib/session-folders/routes.js
const mergeFolderSnapshots = (current, incoming, now) => {
||||||| bc50ba56aa:packages/web/server/lib/session-folders/routes.js
// POST bodies are whole-device maps from clients that may never have seen the
// current server state (bootstrap-only hydration, long-open tabs, clock skew),
// so absence of a scope or folder is not deletion. Merge per scope instead of
// replacing the file: keep what the writer never saw, let the incoming
// version win per folder id, and keep updatedAt monotonic. Deletion travels
// explicitly as tombstones: a tombstoned id is dropped from every scope even
// when a stale device sends it again.
const mergeSnapshots = (current, incoming, now) => {
=======
const hasFiniteRevision = (value: unknown): value is number => Number.isFinite(value);

const mergeSnapshots = (current: StoredFolderSnapshot, incoming: StoredFolderSnapshot, now: number): FolderSnapshot => {
>>>>>>> upstream/main:packages/web/server/lib/session-folders/routes.ts
  const deletedFolderIds = mergeTombstones(current.deletedFolderIds, incoming.deletedFolderIds, now);
  const currentMap = current.foldersMap;
  const incomingMap = incoming.foldersMap;
  const mergedScopes: SessionFoldersMap = {};
  for (const scope of new Set([...Object.keys(currentMap), ...Object.keys(incomingMap)])) {
    const currentFolders = currentMap[scope];
    const incomingFolders = incomingMap[scope];
    if (!Array.isArray(incomingFolders) || incomingFolders.length === 0) {
      if (Array.isArray(currentFolders) && currentFolders.length > 0) mergedScopes[scope] = currentFolders;
      continue;
    }
    if (!Array.isArray(currentFolders) || currentFolders.length === 0) { mergedScopes[scope] = incomingFolders; continue; }
    const foldersById = new Map(currentFolders.map((folder) => [folder.id, folder]));
    const idByName = new Map(currentFolders.map((folder) => [folder.name.toLowerCase(), folder.id]));
    for (const folder of incomingFolders) {
      const twinId = idByName.get(folder.name.toLowerCase());
      const twin = twinId !== undefined && twinId !== folder.id ? foldersById.get(twinId) : undefined;
      if (twinId !== undefined && twin !== undefined) {
        foldersById.delete(twinId);
        foldersById.set(folder.id, { ...folder, sessionIds: [...new Set([...twin.sessionIds, ...folder.sessionIds])] });
      } else foldersById.set(folder.id, folder);
    }
    mergedScopes[scope] = [...foldersById.values()];
  }
  for (const [scope, folders] of Object.entries(mergedScopes)) {
    const kept = folders.filter((folder) => deletedFolderIds[folder.id] === undefined);
    if (kept.length > 0) mergedScopes[scope] = kept;
    else delete mergedScopes[scope];
  }
<<<<<<< HEAD:packages/web/server/lib/session-folders/routes.js
  const incomingFolderIds = new Set(Object.values(incomingMap).flatMap((folders) => Array.isArray(folders) ? folders.map((folder) => folder.id) : []));
  const collapsedFolderIds = [...new Set([
    ...(Array.isArray(incoming.collapsedFolderIds) ? incoming.collapsedFolderIds : []),
    ...(Array.isArray(current.collapsedFolderIds) ? current.collapsedFolderIds.filter((id) => !incomingFolderIds.has(id)) : []),
  ])].filter((id) => deletedFolderIds[id] === undefined);
  return {
    version: 1,
    foldersMap: mergedScopes,
    collapsedFolderIds,
    deletedFolderIds,
    updatedAt: Math.max(Number.isFinite(current.updatedAt) ? current.updatedAt : 0, Number.isFinite(incoming.updatedAt) ? incoming.updatedAt : 0),
  };
};

const classifyRead = (error, label) => error instanceof MetadataCorruptError || error instanceof MetadataReadError
  ? error : new MetadataReadError(`${label}: ${error?.message ?? error}`, error);
const classifyWrite = (error, label) => error instanceof MetadataWriteError || error instanceof MetadataCorruptError
  ? error : new MetadataWriteError(`${label}: ${error?.message ?? error}`, error);

export const createSessionFoldersStore = ({ openchamberDataDir, fsPromises = fsDefault.promises, path = pathDefault, now = Date.now, database = null, closeDatabase = database === null } = {}) => {
  const opened = database ? { db: database, filePath: path.join(openchamberDataDir, 'host-metadata.sqlite') } : openHostMetadataDatabase({ dataDir: openchamberDataDir, path });
  if (database) ensureHostMetadataSchema(database);
  const { db, filePath } = opened;
  const lifecycle = createMetadataLifecycle(db, closeDatabase);
  let saveChain = Promise.resolve();
  const runExclusive = (work) => { const next = saveChain.then(work, work); saveChain = next.then(() => undefined, () => undefined); return next; };
  const conversion = createLegacyMetadataConversion({
    db, dataDir: openchamberDataDir, fsPromises, nodePath: path, fileName: LEGACY_FILE_NAME,
    parse: (parsed) => {
      const legacy = LegacySnapshotSchema.safeParse(parsed);
      if (!legacy.success) throw new MetadataCorruptError('Legacy folder header is corrupt');
      const foldersMap = {};
      const errors = {};
      for (const [scope, value] of Object.entries(legacy.data.foldersMap)) {
        const folders = FolderListSchema.safeParse(value);
        if (!folders.success) errors[scope] = 'METADATA_CORRUPT';
        else foldersMap[scope] = folders.data;
      }
      return { entries: { ...legacy.data, foldersMap }, errors };
    },
    insert: (snapshot) => {
      const current = readStored();
      const pendingScopes = {};
      const receipt = db.prepare('INSERT OR IGNORE INTO metadata_conversion (source, completed) VALUES (?, 1)');
      for (const [scope, folders] of Object.entries(snapshot.foldersMap)) {
        const key = JSON.stringify(['folder-scope', scope]);
        if (db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get(key)?.completed === 1) continue;
        if (current?.snapshot.foldersMap[scope] === undefined && !current?.errors[scope]) pendingScopes[scope] = folders;
        receipt.run(key);
      }
      const pendingIds = new Set(Object.values(pendingScopes).flatMap((folders) => folders.map((folder) => folder.id)));
      const incoming = { ...snapshot, foldersMap: pendingScopes,
        collapsedFolderIds: snapshot.collapsedFolderIds.filter((id) => !current || pendingIds.has(id)) };
      const outgoing = mergeFolderSnapshots(current?.snapshot ?? EMPTY_SNAPSHOT, incoming, now());
      const { foldersMap, ...header } = outgoing;
      const revision = Number(current?.revision ?? 0) + 1;
      db.prepare(`INSERT INTO session_folders (singleton, revision, payload) VALUES (1, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET revision = excluded.revision, payload = excluded.payload`).run(revision, JSON.stringify(header));
      const insert = db.prepare('INSERT OR IGNORE INTO session_folder_scopes (scope, payload) VALUES (?, ?)');
      for (const [scope, folders] of Object.entries(foldersMap)) insert.run(scope, JSON.stringify(folders));
    },
  });
  const readStored = () => {
    try {
      const headerRow = db.prepare('SELECT revision, payload FROM session_folders WHERE singleton = 1').get();
      if (!headerRow) return null;
      const parsedHeader = HeaderSchema.safeParse(readJsonObject(headerRow.payload, 'Stored folder header'));
      if (!parsedHeader.success || !RevisionSchema.safeParse(headerRow.revision).success) throw new MetadataCorruptError('Stored folder header is corrupt');
      const header = parsedHeader.data;
      const foldersMap = {};
      const errors = {};
      for (const row of db.prepare('SELECT scope, payload FROM session_folder_scopes').all()) {
        try {
          const folders = FolderListSchema.safeParse(JSON.parse(row.payload));
          if (!folders.success) throw new MetadataCorruptError('Stored folder scope is corrupt');
          foldersMap[row.scope] = folders.data;
        } catch { errors[row.scope] = 'METADATA_CORRUPT'; }
      }
      return { snapshot: { ...header, foldersMap }, revision: String(headerRow.revision), errors };
    } catch (error) { throw classifyRead(error, 'Could not read session folders'); }
  };
  const get = () => lifecycle.run(async () => {
    const converted = await conversion.convert();
    const state = readStored();
    if (!state) { if (converted.error) throw converted.error; return null; }
    const errors = { ...converted.errors, ...state.errors };
    for (const scope of Object.keys(state.snapshot.foldersMap)) delete errors[scope];
    const unresolvedScopes = Object.keys(converted.errors);
    if (unresolvedScopes.length > 0) {
      try {
        const receipt = db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?');
        for (const scope of unresolvedScopes) {
          const completed = receipt.get(JSON.stringify(['folder-scope', scope]));
          if (!state.errors[scope] && completed?.completed === 1) delete errors[scope];
        }
      } catch (error) { throw classifyRead(error, 'Could not read session folder conversion receipts'); }
    }
    const status = { status: converted.status };
    if (converted.error) status.code = converted.error.code;
    return { ...state, errors, conversion: status };
  });
  // The whole state after a write: one header row plus each scope's folders.
  // Runs inside the caller's transaction, so a revision never lands alone.
  const writeSnapshot = (outgoing, current, acknowledgedScopes = []) => {
    const { foldersMap, ...header } = outgoing;
    const revision = Number(current?.revision ?? 0) + 1;
    if (!RevisionSchema.safeParse(revision).success) throw new MetadataWriteError('Folder revision exhausted');
    db.prepare(`INSERT INTO session_folders (singleton, revision, payload) VALUES (1, ?, ?)
      ON CONFLICT(singleton) DO UPDATE SET revision = excluded.revision, payload = excluded.payload`).run(revision, JSON.stringify(header));
    const write = db.prepare('INSERT INTO session_folder_scopes (scope, payload) VALUES (?, ?) ON CONFLICT(scope) DO UPDATE SET payload = excluded.payload');
    for (const [scope, folders] of Object.entries(foldersMap)) write.run(scope, JSON.stringify(folders));
    for (const scope of Object.keys(current?.snapshot.foldersMap ?? {})) {
      if (foldersMap[scope] === undefined) db.prepare('DELETE FROM session_folder_scopes WHERE scope = ?').run(scope);
    }
    const receipt = db.prepare('INSERT OR IGNORE INTO metadata_conversion (source, completed) VALUES (?, 1)');
    for (const scope of acknowledgedScopes) {
      if (current?.errors[scope] && foldersMap[scope] === undefined) continue;
      receipt.run(JSON.stringify(['folder-scope', scope]));
    }
    return { snapshot: outgoing, revision: String(revision) };
  };
  const save = (incoming) => {
    const parsed = SnapshotSchema.safeParse(incoming);
    if (!parsed.success) return Promise.reject(new MetadataWriteError('Invalid session folders payload'));
    return lifecycle.run(() => runExclusive(async () => {
      const converted = await conversion.convert();
      try {
        return withTransaction(db, () => {
          const current = readStored();
          if (!current && converted.error) throw converted.error;
          const outgoing = mergeFolderSnapshots(current?.snapshot ?? EMPTY_SNAPSHOT, parsed.data, now());
          return writeSnapshot(outgoing, current, Object.keys(parsed.data.foldersMap));
        });
      } catch (error) { throw classifyWrite(error, 'Could not write session folders'); }
    }));
  };
  /**
   * Apply one client's changes to the stored state. The client sends intent,
   * never a copy of the map, so a stale tab cannot undo another client. The
   * answer is the stored state after the changes, which the writer shows.
   */
  const applyChanges = (changes) => lifecycle.run(() => runExclusive(async () => {
    const converted = await conversion.convert();
    try {
      return withTransaction(db, () => {
        const current = readStored();
        if (!current && converted.error) throw converted.error;
        const { snapshot, changed } = applyFolderChanges(current?.snapshot ?? EMPTY_SNAPSHOT, changes, now());
        if (!changed) return { snapshot: current?.snapshot ?? EMPTY_SNAPSHOT, revision: current?.revision ?? '0' };
        if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_BODY_BYTES) {
          throw new MetadataWriteError('Session folders too large');
        }
        return writeSnapshot(snapshot, current);
      });
    } catch (error) { throw classifyWrite(error, 'Could not write session folders'); }
  }));
  return {
    get, save, applyChanges, convertLegacy: () => lifecycle.run(conversion.convert), flush: lifecycle.flush, close: lifecycle.close, databasePath: filePath,
  };
||||||| bc50ba56aa:packages/web/server/lib/session-folders/routes.js
  // The writer's collapse state is authoritative for folders it knows; a
  // union would keep a folder it just expanded collapsed forever.
  const incomingFolderIds = new Set(
    Object.values(incomingMap).flatMap((folders) => (Array.isArray(folders) ? folders.map((folder) => folder.id) : [])),
  );
  const incomingCollapsed = Array.isArray(incoming.collapsedFolderIds) ? incoming.collapsedFolderIds : [];
  const currentCollapsed = Array.isArray(current.collapsedFolderIds) ? current.collapsedFolderIds : [];
  const collapsedFolderIds = [
    ...new Set([
      ...incomingCollapsed,
      ...currentCollapsed.filter((folderId) => !incomingFolderIds.has(folderId)),
    ]),
  ].filter((folderId) => deletedFolderIds[folderId] === undefined);
  const updatedAt = Math.max(
    Number.isFinite(current.updatedAt) ? current.updatedAt : 0,
    Number.isFinite(incoming.updatedAt) ? incoming.updatedAt : 0,
  );
  return { version: 1, foldersMap: mergedScopes, collapsedFolderIds, deletedFolderIds, updatedAt };
=======
  const incomingFolderIds = new Set(
    Object.values(incomingMap).flatMap((folders) => folders.map((folder) => folder.id)),
  );
  const incomingCollapsed = incoming.collapsedFolderIds;
  const currentCollapsed = current.collapsedFolderIds;
  const collapsedFolderIds = [
    ...new Set([
      ...incomingCollapsed,
      ...currentCollapsed.filter((folderId) => !incomingFolderIds.has(folderId)),
    ]),
  ].filter((folderId) => deletedFolderIds[folderId] === undefined);
  const updatedAt = Math.max(
    hasFiniteRevision(current.updatedAt) ? current.updatedAt : 0,
    hasFiniteRevision(incoming.updatedAt) ? incoming.updatedAt : 0,
  );
  return { version: 1, foldersMap: mergedScopes, collapsedFolderIds, deletedFolderIds, updatedAt };
>>>>>>> upstream/main:packages/web/server/lib/session-folders/routes.ts
};

<<<<<<< HEAD:packages/web/server/lib/session-folders/routes.js
export const registerSessionFoldersRoutes = (app, dependencies) => {
  const store = dependencies.sessionFoldersStore;
  if (!store) throw new Error('Folder routes require the Host-owned sessionFoldersStore');
||||||| bc50ba56aa:packages/web/server/lib/session-folders/routes.js
/**
 * `onChanged(updatedAt)` runs after a write that changed the stored folders,
 * so the server can tell every connected client to read them again.
 */
export const registerSessionFoldersRoutes = (app, dependencies) => {
  const {
    fsPromises,
    path,
    openchamberDataDir,
    onChanged = () => {},
    now = Date.now,
  } = dependencies;

  const filePath = path.join(openchamberDataDir, 'sessions-directories.json');
  let saveQueue = Promise.resolve();

  const ensureDir = async () => {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  };

  /** The stored snapshot; `null` when the file exists but cannot be read as one. */
  const readCurrent = async () => {
    const currentRaw = await fsPromises.readFile(filePath, 'utf8').catch((error) => {
      if (error && error.code === 'ENOENT') return null;
      throw error;
    });
    if (!currentRaw) return EMPTY_SNAPSHOT;
    try {
      const parsed = JSON.parse(currentRaw);
      return hasValidFolderSnapshotShape(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeSnapshot = async (snapshot) => {
    let tmp;
    try {
      await ensureDir();
      tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await fsPromises.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
      await fsPromises.rename(tmp, filePath);
    } catch (error) {
      if (tmp) await fsPromises.unlink(tmp).catch(() => {});
      throw error;
    }
  };

  const serialize = (task) => {
    const pending = saveQueue.then(task, task);
    saveQueue = pending.then(() => undefined, () => undefined);
    return pending;
  };

  const announce = (updatedAt) => {
    try {
      onChanged(updatedAt);
    } catch { /* A failed announcement leaves the write in place. */ }
  };

=======
const isMissingFileError = (error: unknown): error is { code: 'ENOENT' } => (
  error !== null
  && (typeof error === 'object' || typeof error === 'function')
  && 'code' in error
  && error.code === 'ENOENT'
);

export const registerSessionFoldersRoutes = (app: SessionFoldersApp, dependencies: SessionFoldersDependencies) => {
  const {
    fsPromises,
    path,
    openchamberDataDir,
    onChanged = () => {},
    now = Date.now,
  } = dependencies;

  const filePath = path.join(openchamberDataDir, 'sessions-directories.json');
  let saveQueue = Promise.resolve();

  const ensureDir = async () => {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  };

  const readCurrent = async () => {
    const currentRaw = await fsPromises.readFile(filePath, 'utf8').catch((error) => {
      if (isMissingFileError(error)) return null;
      throw error;
    });
    if (!currentRaw) return EMPTY_SNAPSHOT;
    try {
      const parsed: unknown = JSON.parse(currentRaw);
      return isStoredFolderSnapshot(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const writeSnapshot = async (snapshot: StoredFolderSnapshot) => {
    let tmp: string | undefined;
    try {
      await ensureDir();
      tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      await fsPromises.writeFile(tmp, JSON.stringify(snapshot, null, 2), 'utf8');
      await fsPromises.rename(tmp, filePath);
    } catch (error) {
      if (tmp) await fsPromises.unlink(tmp).catch(() => {});
      throw error;
    }
  };

  const serialize = <T,>(task: () => Promise<T>) => {
    const pending = saveQueue.then(task, task);
    saveQueue = pending.then(() => undefined, () => undefined);
    return pending;
  };

  const announce = (updatedAt: number) => {
    try {
      onChanged(updatedAt);
    } catch {
      return;
    }
  };

>>>>>>> upstream/main:packages/web/server/lib/session-folders/routes.ts
  app.get('/api/session-folders', async (_req, res) => {
    try {
<<<<<<< HEAD:packages/web/server/lib/session-folders/routes.js
      const state = await store.get();
      if (!state) return res.json({ ...EMPTY_SNAPSHOT, exists: false });
      return res.json({ ...state.snapshot, revision: state.revision, exists: true, errors: state.errors, conversion: state.conversion });
    } catch (error) { return res.status(500).json({ error: error?.message ?? 'Failed to read session folders', code: error?.code }); }
||||||| bc50ba56aa:packages/web/server/lib/session-folders/routes.js
      const raw = await fsPromises.readFile(filePath, 'utf8').catch((error) => {
        if (error && error.code === 'ENOENT') return null;
        throw error;
      });
      if (!raw) {
        return res.json({ version: 1, exists: false });
      }
      try {
        const parsed = JSON.parse(raw);
        if (
          !hasValidFolderSnapshotShape(parsed)
          || typeof parsed.updatedAt !== 'number'
          || !Number.isFinite(parsed.updatedAt)
          || parsed.updatedAt <= 0
        ) {
          return res.status(500).json({ error: 'Stored session folders have an invalid shape' });
        }
        return res.json({ ...parsed, exists: true });
      } catch {
        return res.status(500).json({ error: 'Stored session folders are malformed' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read session folders';
      return res.status(500).json({ error: message });
    }
=======
      const raw = await fsPromises.readFile(filePath, 'utf8').catch((error) => {
        if (isMissingFileError(error)) return null;
        throw error;
      });
      if (!raw) {
        return res.json({ version: 1, exists: false });
      }
      try {
        const parsed: unknown = JSON.parse(raw);
        if (
          !isStoredFolderSnapshot(parsed)
          || !isPositiveRevision(parsed.updatedAt)
        ) {
          return res.status(500).json({ error: 'Stored session folders have an invalid shape' });
        }
        return res.json({ ...parsed, exists: true });
      } catch {
        return res.status(500).json({ error: 'Stored session folders are malformed' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read session folders';
      return res.status(500).json({ error: message });
    }
>>>>>>> upstream/main:packages/web/server/lib/session-folders/routes.ts
  });
<<<<<<< HEAD:packages/web/server/lib/session-folders/routes.js
||||||| bc50ba56aa:packages/web/server/lib/session-folders/routes.js

  app.post('/api/session-folders', async (req, res) => {
    const body = req.body;
    if (!isObjectRecord(body)) {
      return res.status(400).json({ error: 'Body must be an object' });
    }
    if (!hasValidFolderSnapshotShape(body)) {
      return res.status(400).json({ error: 'Invalid session folders payload' });
    }
    const serialized = JSON.stringify(body, null, 2);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Payload too large' });
    }
    if (typeof body.updatedAt !== 'number' || !Number.isFinite(body.updatedAt) || body.updatedAt <= 0) {
      return res.status(400).json({ error: 'updatedAt must be a positive finite number' });
    }

    // The whole-copy write of clients from before shared folders; current
    // clients send changes to PATCH instead.
    return serialize(async () => {
      try {
        // A valid whole copy repairs a malformed file, as it always did.
        const current = await readCurrent() ?? EMPTY_SNAPSHOT;
        const merged = mergeSnapshots(current, body, now());
        const changed = JSON.stringify(merged.foldersMap) !== JSON.stringify(current.foldersMap ?? {});
        // The writer's clock is its own; a change still moves the revision
        // past the stored one, or clients that saw it would skip the read.
        const outgoing = changed
          ? { ...merged, updatedAt: Math.max(merged.updatedAt, now(), (Number.isFinite(current.updatedAt) ? current.updatedAt : 0) + 1) }
          : merged;
        await writeSnapshot(outgoing);
        if (changed) announce(outgoing.updatedAt);
        return res.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to write session folders';
        return res.status(500).json({ error: message });
      }
    });
  });

=======

  app.post('/api/session-folders', async (req, res) => {
    const body = req.body;
    if (!isObjectRecord(body)) {
      return res.status(400).json({ error: 'Body must be an object' });
    }
    if (!isStoredFolderSnapshot(body)) {
      return res.status(400).json({ error: 'Invalid session folders payload' });
    }
    const serialized = JSON.stringify(body, null, 2);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
      return res.status(413).json({ error: 'Payload too large' });
    }
    if (!isPositiveRevision(body.updatedAt)) {
      return res.status(400).json({ error: 'updatedAt must be a positive finite number' });
    }

    return serialize(async () => {
      try {
        const current = await readCurrent() ?? EMPTY_SNAPSHOT;
        const merged = mergeSnapshots(current, body, now());
        const changed = JSON.stringify(merged.foldersMap) !== JSON.stringify(current.foldersMap ?? {});
        const outgoing = changed
          ? { ...merged, updatedAt: Math.max(merged.updatedAt, now(), (hasFiniteRevision(current.updatedAt) ? current.updatedAt : 0) + 1) }
          : merged;
        await writeSnapshot(outgoing);
        if (changed) announce(outgoing.updatedAt);
        return res.json({ success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to write session folders';
        return res.status(500).json({ error: message });
      }
    });
  });

>>>>>>> upstream/main:packages/web/server/lib/session-folders/routes.ts
  app.patch('/api/session-folders', async (req, res) => {
<<<<<<< HEAD:packages/web/server/lib/session-folders/routes.js
    const request = folderChangesBodySchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ error: 'Invalid session folder changes' });
    const serialized = JSON.stringify(request.data);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Payload too large' });
    try {
      const state = await store.applyChanges(request.data.changes);
      return res.json({ ...state.snapshot, revision: state.revision, exists: true });
    } catch (error) { return res.status(500).json({ error: error?.message ?? 'Failed to write session folders', code: error?.code }); }
||||||| bc50ba56aa:packages/web/server/lib/session-folders/routes.js
    const parsed = folderChangesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid session folder changes' });
    }
    return serialize(async () => {
      try {
        const current = await readCurrent();
        // Changes on top of an unreadable file would replace every folder in it.
        if (!current) return res.status(500).json({ error: 'Stored session folders are malformed' });
        const { snapshot, changed } = applyFolderChanges(current, parsed.data.changes, now());
        if (changed) {
          if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_BODY_BYTES) {
            return res.status(413).json({ error: 'Session folders too large' });
          }
          await writeSnapshot(snapshot);
          announce(snapshot.updatedAt);
        }
        // The stored state after the changes, so the writer needs no extra read.
        return res.json({ ...snapshot, exists: changed || current !== EMPTY_SNAPSHOT });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to write session folders';
        return res.status(500).json({ error: message });
      }
    });
=======
    const parsed = folderChangesBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid session folder changes' });
    }
    return serialize(async () => {
      try {
        const current = await readCurrent();
        if (!current) return res.status(500).json({ error: 'Stored session folders are malformed' });
        const { snapshot, changed } = applyFolderChanges(current, parsed.data.changes, now());
        if (changed) {
          if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > MAX_BODY_BYTES) {
            return res.status(413).json({ error: 'Session folders too large' });
          }
          await writeSnapshot(snapshot);
          announce(snapshot.updatedAt);
        }
        return res.json({ ...snapshot, exists: changed || current !== EMPTY_SNAPSHOT });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to write session folders';
        return res.status(500).json({ error: message });
      }
    });
>>>>>>> upstream/main:packages/web/server/lib/session-folders/routes.ts
  });
  app.post('/api/session-folders', async (req, res) => {
    const request = SnapshotRequestSchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ error: 'Invalid session folders payload' });
    const serialized = JSON.stringify(request.data);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Payload too large' });
    const snapshot = SnapshotSchema.safeParse(request.data);
    if (!snapshot.success) return res.status(400).json({ error: 'updatedAt must be a positive finite number' });
    try { const state = await store.save(snapshot.data); return res.json({ success: true, revision: state.revision }); }
    catch (error) { return res.status(500).json({ error: error?.message ?? 'Failed to write session folders', code: error?.code }); }
  });
  return store;
};
