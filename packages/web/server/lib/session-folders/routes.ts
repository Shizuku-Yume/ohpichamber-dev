import pathDefault from 'node:path';
import fsDefault from 'node:fs';
import { z } from 'zod';
import { isRecord as isObjectRecord, isString } from '../shared/guards.js';
import { createLegacyMetadataConversion } from '../host/metadata-conversion.js';
import { controlErrorFields } from '../openchamber-control/error.js';
import { applyFolderChanges, folderChangesBodySchema } from './folder-changes.js';
import type {
  FolderChange,
  FolderConversionStatus,
  FolderSnapshot,
  FolderTombstones,
  SessionFolder,
  SessionFoldersApp,
  SessionFoldersDependencies,
  SessionFoldersMap,
  SessionFoldersState,
  SessionFoldersStore,
  StoredFolderSnapshot,
  WrittenFolderSnapshot,
} from './contracts.js';
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

const MAX_BODY_BYTES = 4 * 1024 * 1024;
const LEGACY_FILE_NAME = 'sessions-directories.json';
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EMPTY_SNAPSHOT: StoredFolderSnapshot = { version: 1, foldersMap: {}, collapsedFolderIds: [] };
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

const errorMessageOf = (cause: Parameters<typeof controlErrorFields>[0]): string | undefined => {
  const message = controlErrorFields(cause)?.message;
  return isString(message) ? message : undefined;
};

const errorCodeOf = (cause: Parameters<typeof controlErrorFields>[0]): string | undefined => {
  const code = controlErrorFields(cause)?.code;
  return isString(code) ? code : undefined;
};

const mergeTombstones = (
  current: FolderTombstones | undefined,
  incoming: FolderTombstones | undefined,
  now: number,
): FolderTombstones => {
  const merged: FolderTombstones = {};
  for (const source of [current, incoming]) {
    if (!isObjectRecord(source)) continue;
    for (const [id, deletedAt] of Object.entries(source)) {
      if (now - deletedAt > TOMBSTONE_TTL_MS) continue;
      merged[id] = Math.max(merged[id] ?? 0, deletedAt);
    }
  }
  return merged;
};

const mergeFolderSnapshots = (
  current: StoredFolderSnapshot,
  incoming: StoredFolderSnapshot,
  now: number,
): FolderSnapshot => {
  const deletedFolderIds = mergeTombstones(current.deletedFolderIds, incoming.deletedFolderIds, now);
  const currentMap = isObjectRecord(current.foldersMap) ? current.foldersMap : {};
  const incomingMap = isObjectRecord(incoming.foldersMap) ? incoming.foldersMap : {};
  const mergedScopes: SessionFoldersMap = {};
  for (const scope of new Set([...Object.keys(currentMap), ...Object.keys(incomingMap)])) {
    const currentFolders = currentMap[scope];
    const incomingFolders = incomingMap[scope];
    if (!Array.isArray(incomingFolders) || incomingFolders.length === 0) {
      if (Array.isArray(currentFolders) && currentFolders.length > 0) mergedScopes[scope] = currentFolders;
      continue;
    }
    if (!Array.isArray(currentFolders) || currentFolders.length === 0) { mergedScopes[scope] = incomingFolders; continue; }
    const foldersById = new Map<string, SessionFolder>(currentFolders.map((folder) => [folder.id, folder]));
    const idByName = new Map<string, string>(currentFolders.map((folder) => [folder.name.toLowerCase(), folder.id]));
    for (const folder of incomingFolders) {
      const twinId = idByName.get(folder.name.toLowerCase());
      const twin = twinId !== undefined && twinId !== folder.id ? foldersById.get(twinId) : undefined;
      if (twin && twinId !== undefined) {
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
  const incomingFolderIds = new Set(Object.values(incomingMap).flatMap((folders) => Array.isArray(folders) ? folders.map((folder) => folder.id) : []));
  const collapsedFolderIds = [...new Set([
    ...(Array.isArray(incoming.collapsedFolderIds) ? incoming.collapsedFolderIds : []),
    ...(Array.isArray(current.collapsedFolderIds) ? current.collapsedFolderIds.filter((id) => !incomingFolderIds.has(id)) : []),
  ])].filter((id) => deletedFolderIds[id] === undefined);
  const currentUpdatedAt = current.updatedAt !== undefined && Number.isFinite(current.updatedAt) ? current.updatedAt : 0;
  const incomingUpdatedAt = incoming.updatedAt !== undefined && Number.isFinite(incoming.updatedAt) ? incoming.updatedAt : 0;
  return {
    version: 1,
    foldersMap: mergedScopes,
    collapsedFolderIds,
    deletedFolderIds,
    updatedAt: Math.max(currentUpdatedAt, incomingUpdatedAt),
  };
};

const classifyRead = (error: Parameters<typeof controlErrorFields>[0], label: string): Error => error instanceof MetadataCorruptError || error instanceof MetadataReadError
  ? error : new MetadataReadError(`${label}: ${errorMessageOf(error) ?? error}`, error);
const classifyWrite = (error: Parameters<typeof controlErrorFields>[0], label: string): Error => error instanceof MetadataWriteError || error instanceof MetadataCorruptError
  ? error : new MetadataWriteError(`${label}: ${errorMessageOf(error) ?? error}`, error);

interface StoredSnapshotRecord {
  snapshot: FolderSnapshot;
  revision: string;
  errors: Record<string, string>;
}

export const createSessionFoldersStore = ({
  openchamberDataDir,
  fsPromises = fsDefault.promises,
  path = pathDefault,
  now = Date.now,
  database = null,
  closeDatabase = database === null,
}: SessionFoldersDependencies): SessionFoldersStore => {
  const opened = database ? { db: database, filePath: path.join(openchamberDataDir, 'host-metadata.sqlite') } : openHostMetadataDatabase({ dataDir: openchamberDataDir, path });
  if (database) ensureHostMetadataSchema(database);
  const { db, filePath } = opened;
  const lifecycle = createMetadataLifecycle(db, closeDatabase);
  let saveChain: Promise<void> = Promise.resolve();
  const runExclusive = <T>(work: () => Promise<T>): Promise<T> => {
    const next = saveChain.then(work, work);
    saveChain = next.then(() => undefined, () => undefined);
    return next;
  };
  const readStored = (): StoredSnapshotRecord | null => {
    try {
      const headerRow = db.prepare('SELECT revision, payload FROM session_folders WHERE singleton = 1').get();
      if (!headerRow) return null;
      if (!isString(headerRow.payload)) throw new MetadataCorruptError('Stored folder header is corrupt');
      const parsedHeader = HeaderSchema.safeParse(readJsonObject(headerRow.payload, 'Stored folder header'));
      if (!parsedHeader.success || !RevisionSchema.safeParse(headerRow.revision).success) throw new MetadataCorruptError('Stored folder header is corrupt');
      const header = parsedHeader.data;
      const foldersMap: SessionFoldersMap = {};
      const errors: Record<string, string> = {};
      for (const row of db.prepare('SELECT scope, payload FROM session_folder_scopes').all()) {
        if (!isString(row.scope)) continue;
        try {
          if (!isString(row.payload)) throw new MetadataCorruptError('Stored folder scope is corrupt');
          const folders = FolderListSchema.safeParse(JSON.parse(row.payload));
          if (!folders.success) throw new MetadataCorruptError('Stored folder scope is corrupt');
          foldersMap[row.scope] = folders.data;
        } catch { errors[row.scope] = 'METADATA_CORRUPT'; }
      }
      return { snapshot: { ...header, foldersMap }, revision: String(headerRow.revision), errors };
    } catch (error) { throw classifyRead(error, 'Could not read session folders'); }
  };
  const conversion = createLegacyMetadataConversion({
    db, dataDir: openchamberDataDir, fsPromises, nodePath: path, fileName: LEGACY_FILE_NAME,
    parse: (parsed: Parameters<typeof LegacySnapshotSchema.safeParse>[0]) => {
      const legacy = LegacySnapshotSchema.safeParse(parsed);
      if (!legacy.success) throw new MetadataCorruptError('Legacy folder header is corrupt');
      const foldersMap: SessionFoldersMap = {};
      const errors: Record<string, string> = {};
      for (const [scope, value] of Object.entries(legacy.data.foldersMap)) {
        const folders = FolderListSchema.safeParse(value);
        if (!folders.success) errors[scope] = 'METADATA_CORRUPT';
        else foldersMap[scope] = folders.data;
      }
      return { entries: { ...legacy.data, foldersMap }, errors };
    },
    insert: (snapshot: FolderSnapshot) => {
      const current = readStored();
      const pendingScopes: SessionFoldersMap = {};
      const receipt = db.prepare('INSERT OR IGNORE INTO metadata_conversion (source, completed) VALUES (?, 1)');
      for (const [scope, folders] of Object.entries(snapshot.foldersMap)) {
        const key = JSON.stringify(['folder-scope', scope]);
        if (db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get(key)?.completed === 1) continue;
        if (current?.snapshot.foldersMap[scope] === undefined && !current?.errors[scope]) pendingScopes[scope] = folders;
        receipt.run(key);
      }
      const pendingIds = new Set(Object.values(pendingScopes).flatMap((folders) => folders.map((folder) => folder.id)));
      const incoming: FolderSnapshot = {
        ...snapshot,
        foldersMap: pendingScopes,
        collapsedFolderIds: snapshot.collapsedFolderIds.filter((id) => !current || pendingIds.has(id)),
      };
      const outgoing = mergeFolderSnapshots(current?.snapshot ?? EMPTY_SNAPSHOT, incoming, now());
      const { foldersMap, ...header } = outgoing;
      const revision = Number(current?.revision ?? 0) + 1;
      db.prepare(`INSERT INTO session_folders (singleton, revision, payload) VALUES (1, ?, ?)
        ON CONFLICT(singleton) DO UPDATE SET revision = excluded.revision, payload = excluded.payload`).run(revision, JSON.stringify(header));
      const insert = db.prepare('INSERT OR IGNORE INTO session_folder_scopes (scope, payload) VALUES (?, ?)');
      for (const [scope, folders] of Object.entries(foldersMap)) insert.run(scope, JSON.stringify(folders));
    },
  });
  const get = (): Promise<SessionFoldersState | null> => lifecycle.run(async () => {
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
    const status: FolderConversionStatus = { status: converted.status };
    if (converted.error) status.code = converted.error.code;
    return { ...state, errors, conversion: status };
  });
  const writeSnapshot = (
    outgoing: StoredFolderSnapshot,
    current: StoredSnapshotRecord | null,
    acknowledgedScopes: string[] = [],
  ): WrittenFolderSnapshot => {
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
  const save = (incoming: FolderSnapshot): Promise<WrittenFolderSnapshot> => {
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
  const applyChanges = (changes: FolderChange[]): Promise<WrittenFolderSnapshot> =>
    lifecycle.run(() => runExclusive(async () => {
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
};

export interface SessionFoldersRouteDependencies {
  sessionFoldersStore: SessionFoldersStore;
  openchamberDataDir?: string;
}

export const registerSessionFoldersRoutes = (
  app: SessionFoldersApp,
  dependencies: SessionFoldersRouteDependencies,
): SessionFoldersStore => {
  const store = dependencies.sessionFoldersStore;
  if (!store) throw new Error('Folder routes require the Host-owned sessionFoldersStore');
  app.get('/api/session-folders', async (_req, res) => {
    try {
      const state = await store.get();
      if (!state) return res.json({ ...EMPTY_SNAPSHOT, exists: false });
      return res.json({ ...state.snapshot, revision: state.revision, exists: true, errors: state.errors, conversion: state.conversion });
    } catch (error) { return res.status(500).json({ error: errorMessageOf(error) ?? 'Failed to read session folders', code: errorCodeOf(error) }); }
  });
  app.patch('/api/session-folders', async (req, res) => {
    const request = folderChangesBodySchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ error: 'Invalid session folder changes' });
    const serialized = JSON.stringify(request.data);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Payload too large' });
    try {
      const state = await store.applyChanges(request.data.changes);
      return res.json({ ...state.snapshot, revision: state.revision, exists: true });
    } catch (error) { return res.status(500).json({ error: errorMessageOf(error) ?? 'Failed to write session folders', code: errorCodeOf(error) }); }
  });
  app.post('/api/session-folders', async (req, res) => {
    const request = SnapshotRequestSchema.safeParse(req.body);
    if (!request.success) return res.status(400).json({ error: 'Invalid session folders payload' });
    const serialized = JSON.stringify(request.data);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) return res.status(413).json({ error: 'Payload too large' });
    const snapshot = SnapshotSchema.safeParse(request.data);
    if (!snapshot.success) return res.status(400).json({ error: 'updatedAt must be a positive finite number' });
    try { const state = await store.save(snapshot.data); return res.json({ success: true, revision: state.revision }); }
    catch (error) { return res.status(500).json({ error: errorMessageOf(error) ?? 'Failed to write session folders', code: errorCodeOf(error) }); }
  });
  return store;
};
