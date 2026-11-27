import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { asNonEmptyString, isRecord as isPlainObject, isString } from '../shared/guards.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';
import { createLegacyMetadataConversion } from '../host/metadata-conversion.js';
import {
  HostMetadataError,
  MetadataCorruptError,
  MetadataReadError,
  MetadataWriteError,
  createMetadataLifecycle,
  ensureHostMetadataSchema,
  openHostMetadataDatabase,
  readJsonObject,
  withTransaction,
} from '../host/metadata-sqlite.js';

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(JsonValueSchema),
  z.record(z.string(), JsonValueSchema),
]));
const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
const MetadataSchema = z.object({
  openchamber: JsonObjectSchema.optional(),
  title: z.string().optional(),
  directory: z.string().optional(),
  projectID: z.string().optional(),
}).catchall(JsonValueSchema);

export type SessionMetadata = z.infer<typeof MetadataSchema>;

const errorCodeSchema = z.object({ code: z.string() });
const RevisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const MetadataRowSchema = z.object({ revision: z.unknown(), payload: z.unknown() });
const SessionIdRowSchema = z.object({ session_id: z.string() });
const CompletedRowSchema = z.object({ completed: z.number() });
const SelectedProjectionSchema = z.object({
  id: z.string().trim().min(1),
  title: z.string().optional(),
  directory: z.string().optional(),
  projectID: z.string().optional(),
  metadata: MetadataSchema.optional(),
});
const SelectionSchema = z.object({ sessions: z.array(z.json()), source: z.string().trim().min(1) });
const SelectedIdentitySchema = z.object({ id: z.string().trim().min(1) });

export const mergeMetadataPatch = (current: JsonObject | undefined, patch: JsonObject | undefined): JsonObject => {
  const base: JsonObject = isPlainObject(current) ? { ...current } : {};
  if (!isPlainObject(patch)) return base;
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete base[key];
    } else {
      const existing = base[key];
      const next = isPlainObject(value)
        ? mergeMetadataPatch(isPlainObject(existing) ? existing : undefined, value)
        : value;
      Object.defineProperty(base, key, { value: next, enumerable: true, writable: true, configurable: true });
    }
  }
  return base;
};

const readFailure = (cause: unknown): HostMetadataError =>
(cause instanceof MetadataCorruptError || cause instanceof MetadataReadError
  ? cause
  : new MetadataReadError('Could not read Host session metadata', cause));

const writeFailure = (cause: unknown): HostMetadataError =>
(cause instanceof MetadataCorruptError || cause instanceof MetadataWriteError
  ? cause
  : new MetadataWriteError('Could not write Host session metadata', cause));

const OPENCHAMBER_KEYS = new Set([
  'goal', 'assist', 'knowledge_context_delivered', 'context_obligatory_last_compaction_message_id',
  'project_context_pins', 'context_obligatory_messages', 'linked_issues', 'work', 'reviewOffer',
  'pinned', 'workbench', 'turn',
  'reviewSessionID', 'kind', 'originalSessionID', 'multirun',
]);

export interface SessionMetadataRecord {
  metadata: SessionMetadata;
  revision: string;
}

export interface MetadataConversionStatus {
  status: string;
  code?: string;
}

export interface SessionMetadataMutationResult {
  metadata: SessionMetadata;
  revision: string;
  changed: boolean;
}

export interface SessionMetadataStoreOptions {
  dataDir?: string | undefined;
  fsPromises?: typeof fs.promises;
  path?: typeof path;
  database?: ReturnType<typeof openHostMetadataDatabase>['db'] | null;
  closeDatabase?: boolean;
}

export const createSessionMetadataStore = ({
  dataDir = '',
  fsPromises = fs.promises,
  path: nodePath = path,
  database = null,
  closeDatabase = database === null,
}: SessionMetadataStoreOptions = {}) => {
  const opened = database
    ? { db: database, filePath: nodePath.join(dataDir, 'host-metadata.sqlite') }
    : openHostMetadataDatabase({ dataDir, path: nodePath });
  const { db, filePath } = opened;
  if (database) ensureHostMetadataSchema(db);
  const lifecycle = createMetadataLifecycle(db, closeDatabase);
  const sessionChains = new Map<string, Promise<void>>();
  const runForSession = <Result>(id: string, work: () => Promise<Result>): Promise<Result> => {
    const previous = sessionChains.get(id) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.then(() => undefined, () => undefined);
    sessionChains.set(id, settled);
    void settled.then(() => { if (sessionChains.get(id) === settled) sessionChains.delete(id); });
    return next;
  };
  const conversion = createLegacyMetadataConversion({
    db,
    dataDir,
    fsPromises,
    nodePath,
    fileName: 'sessions-metadata.json',
    parse: (parsed: Record<string, JsonValue | undefined>) => {
      const entries: [string, SessionMetadata][] = [];
      const errors: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const id = asNonEmptyString(key);
        const metadata = MetadataSchema.safeParse(value);
        if (!id || !metadata.success) errors[key] = 'METADATA_CORRUPT';
        else entries.push([id, metadata.data]);
      }
      return { entries, errors };
    },
    insert: (entries: [string, SessionMetadata][]) => {
      const insert = db.prepare('INSERT OR IGNORE INTO session_metadata (session_id, revision, payload) VALUES (?, 1, ?)');
      for (const [id, metadata] of entries) insert.run(id, JSON.stringify(metadata));
    },
  });

  const withoutLegacyTitle = (metadata: SessionMetadata): SessionMetadata => {
    if (!Object.hasOwn(metadata, 'title')) return metadata;
    const { title: _title, ...rest } = metadata;
    return rest;
  };

  const readRow = (id: string): SessionMetadataRecord | null => {
    try {
      const rawRow = db.prepare('SELECT revision, payload FROM session_metadata WHERE session_id = ?').get(id);
      if (!rawRow) return null;
      const row = MetadataRowSchema.parse(rawRow);
      if (!isString(row.payload)) throw new MetadataCorruptError('Session operational metadata has an invalid shape');
      const metadata = MetadataSchema.safeParse(readJsonObject(row.payload, 'Session metadata'));
      if (!metadata.success) throw new MetadataCorruptError('Session operational metadata has an invalid shape');
      if (!RevisionSchema.safeParse(row.revision).success) throw new MetadataCorruptError('Session metadata revision is invalid');
      return { metadata: withoutLegacyTitle(metadata.data), revision: String(row.revision) };
    } catch (error) {
      throw readFailure(error);
    }
  };

  const resolveCurrent = async (id: string): Promise<SessionMetadataRecord | null> => {
    const converted = await conversion.convert();
    const current = readRow(id);
    if (current) return current;
    if (converted.errors[id]) throw new MetadataCorruptError('Legacy session metadata is corrupt');
    if (converted.error) throw converted.error;
    return null;
  };

  const getState = (sessionID: string): Promise<SessionMetadataRecord | null> => lifecycle.run(async () => {
    const id = asNonEmptyString(sessionID);
    return id ? resolveCurrent(id) : null;
  });

  const get = async (id: string): Promise<SessionMetadata | null> => (await getState(id))?.metadata ?? null;

  const getStates = (sessionIds: readonly string[]) => lifecycle.run(async () => {
    const ids = [...new Set((Array.isArray(sessionIds) ? sessionIds : []).map(asNonEmptyString).filter((id): id is string => id !== null))];
    const entries = new Map<string, SessionMetadataRecord | null>();
    const errors = new Map<string, string>();
    if (ids.length === 0) return { entries, errors };
    const converted = await conversion.convert();
    if (converted.error) throw converted.error;
    let rawRows: unknown[];
    try {
      rawRows = db.prepare(`SELECT session_id, revision, payload FROM session_metadata WHERE session_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
    } catch (error) {
      throw readFailure(error);
    }
    const BulkRowSchema = z.object({ session_id: z.string(), revision: z.unknown(), payload: z.unknown() });
    const rows = z.array(BulkRowSchema).parse(rawRows);
    const rowById = new Map(rows.map((row) => [row.session_id, row]));
    for (const id of ids) {
      const row = rowById.get(id);
      if (!row) {
        if (converted.errors[id]) errors.set(id, 'METADATA_CORRUPT');
        else entries.set(id, null);
        continue;
      }
      try {
        if (!isString(row.payload)) {
          errors.set(id, 'METADATA_CORRUPT');
          continue;
        }
        const parsed = readJsonObject(row.payload, 'Session metadata');
        const metadata = MetadataSchema.safeParse(parsed);
        if (!metadata.success || !RevisionSchema.safeParse(row.revision).success) {
          errors.set(id, 'METADATA_CORRUPT');
          continue;
        }
        entries.set(id, { metadata: withoutLegacyTitle(metadata.data), revision: String(row.revision) });
      } catch {
        errors.set(id, 'METADATA_CORRUPT');
      }
    }
    return { entries, errors };
  });

  const mutate = (
    sessionID: string,
    decide: (metadata: SessionMetadata, revision: string) => JsonValue | null,
  ): Promise<SessionMetadataMutationResult> => {
    const id = asNonEmptyString(sessionID);
    if (!id) return Promise.reject(new MetadataWriteError('A session id is required'));
    return lifecycle.run(() => runForSession(id, async () => {
      await resolveCurrent(id);
      try {
        return withTransaction(db, () => {
          const current = readRow(id);
          const metadata = current?.metadata ?? {};
          const patch = decide(metadata, current?.revision ?? '0');
          if (patch === null) return { metadata, revision: current?.revision ?? '0', changed: false };
          const parsedPatch = JsonObjectSchema.safeParse(patch);
          if (!parsedPatch.success) throw new MetadataWriteError('A metadata patch must be a JSON object');
          const merged = MetadataSchema.safeParse(mergeMetadataPatch(metadata, parsedPatch.data));
          if (!merged.success) throw new MetadataWriteError('Operational metadata has an invalid shape');
          if (current && isDeepStrictEqual(metadata, merged.data)) {
            return { metadata, revision: current.revision, changed: false };
          }
          const revision = Number(current?.revision ?? 0) + 1;
          if (!RevisionSchema.safeParse(revision).success) throw new MetadataWriteError('Metadata revision exhausted');
          db.prepare(`INSERT INTO session_metadata (session_id, revision, payload) VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET revision = excluded.revision, payload = excluded.payload`)
            .run(id, revision, JSON.stringify(merged.data));
          return { metadata: merged.data, revision: String(revision), changed: true };
        });
      } catch (error) {
        throw writeFailure(error);
      }
    }));
  };

  const setSessionMetadata = (id: string, patch: JsonValue | null) => mutate(id, () => patch);
  const updateSessionMetadata = (id: string, decide: (metadata: SessionMetadata, revision: string) => JsonValue | null) => mutate(id, decide);

  const listAll = () => lifecycle.run(async () => {
    const converted = await conversion.convert();
    let rawRows: unknown[];
    try {
      rawRows = db.prepare('SELECT session_id FROM session_metadata ORDER BY session_id').all();
    } catch (error) {
      throw readFailure(error);
    }
    const rows = z.array(SessionIdRowSchema).parse(rawRows);
    const entries: Record<string, SessionMetadataRecord | null> = {};
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
    const status: MetadataConversionStatus = { status: converted.status };
    if (converted.error) status.code = String(converted.error.code);
    return { entries, errors, conversion: status };
  });

  const importOperationalSessions = (sessions: readonly JsonValue[], source: string) => lifecycle.run(async () => {
    const selection = SelectionSchema.safeParse({ sessions, source });
    if (!selection.success) throw new MetadataWriteError('A selected metadata source and session projections are required');
    const entries: [string, SessionMetadata][] = [];
    const results: Record<string, 'already-converted' | 'existing' | 'imported'> = {};
    const errors: Record<string, string> = {};
    for (const value of selection.data.sessions) {
      const parsed = SelectedProjectionSchema.safeParse(value);
      const identity = SelectedIdentitySchema.safeParse(value);
      if (!parsed.success) {
        errors[identity.success ? identity.data.id : 'invalid'] = 'METADATA_CORRUPT';
        continue;
      }
      const session = parsed.data;
      const id = session.id;
      const metadata: SessionMetadata = {};
      if (session.directory !== undefined) metadata.directory = session.directory;
      if (session.projectID !== undefined) metadata.projectID = session.projectID;
      const operational = session.metadata?.openchamber;
      if (operational) {
        metadata.openchamber = Object.fromEntries(Object.entries(operational).filter(([key]) => OPENCHAMBER_KEYS.has(key)));
      }
      const sourceMetadata = session.metadata;
      if (sourceMetadata) {
        if (sourceMetadata.directory !== undefined) metadata.directory = sourceMetadata.directory;
        if (sourceMetadata.projectID !== undefined) metadata.projectID = sourceMetadata.projectID;
        if (sourceMetadata.folder !== undefined) metadata.folder = sourceMetadata.folder;
        if (sourceMetadata.isPinned !== undefined) metadata.isPinned = sourceMetadata.isPinned;
        if (sourceMetadata.color !== undefined) metadata.color = sourceMetadata.color;
        if (sourceMetadata.icon !== undefined) metadata.icon = sourceMetadata.icon;
        if (sourceMetadata.notes !== undefined) metadata.notes = sourceMetadata.notes;
      }
      entries.push([id, metadata]);
    }
    await conversion.convert();
    try {
      withTransaction(db, () => {
        const insert = db.prepare('INSERT OR IGNORE INTO session_metadata (session_id, revision, payload) VALUES (?, 1, ?)');
        const receipt = db.prepare('INSERT OR IGNORE INTO metadata_conversion (source, completed) VALUES (?, 1)');
        for (const [id, metadata] of entries) {
          const key = JSON.stringify(['selected', selection.data.source, id]);
          try {
            const current = readRow(id);
            const rawCompleted = db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get(key);
            const completedRow = CompletedRowSchema.safeParse(rawCompleted);
            if (completedRow.success && completedRow.data.completed === 1) {
              results[id] = 'already-converted';
              continue;
            }
            const inserted = insert.run(id, JSON.stringify(metadata));
            receipt.run(key);
            results[id] = current || inserted.changes === 0 ? 'existing' : 'imported';
          } catch (error) {
            if (!(error instanceof MetadataCorruptError)) throw error;
            const parsedError = errorCodeSchema.safeParse(error);
            errors[id] = parsedError.success ? parsedError.data.code : 'METADATA_CORRUPT';
          }
        }
      });
    } catch (error) {
      throw writeFailure(error);
    }
    return { results, errors, complete: Object.keys(errors).length === 0 };
  });

  return {
    get,
    getState,
    getStates,
    listAll,
    setSessionMetadata,
    updateSessionMetadata,
    importOperationalSessions,
    convertLegacy: () => lifecycle.run(conversion.convert),
    flush: lifecycle.flush,
    close: lifecycle.close,
    databasePath: filePath,
  };
};

export { MetadataCorruptError, MetadataWriteError };
export type SessionMetadataStore = ReturnType<typeof createSessionMetadataStore>;
