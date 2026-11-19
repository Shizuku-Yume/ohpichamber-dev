<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
import fs from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { asNonEmptyString, isRecord as isPlainObject } from '../shared/guards.js';
import { createLegacyMetadataConversion } from '../host/metadata-conversion.js';
import { MetadataCorruptError, MetadataReadError, MetadataWriteError, createMetadataLifecycle, ensureHostMetadataSchema, openHostMetadataDatabase, readJsonObject, withTransaction } from '../host/metadata-sqlite.js';
import { z } from 'zod';

const JsonValueSchema = z.lazy(() => z.union([
  z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema),
]));
const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
const MetadataSchema = z.object({
  openchamber: JsonObjectSchema.optional(), title: z.string().optional(), directory: z.string().optional(), projectID: z.string().optional(),
}).catchall(JsonValueSchema);
const RevisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const SelectedProjectionSchema = z.object({
  id: z.string().trim().min(1), title: z.string().optional(), directory: z.string().optional(), projectID: z.string().optional(),
  metadata: MetadataSchema.optional(),
});
const SelectionSchema = z.object({ sessions: z.array(z.unknown()), source: z.string().trim().min(1) });
const SelectedIdentitySchema = z.object({ id: z.string().trim().min(1) });
export const mergeMetadataPatch = (current, patch) => {
  const base = isPlainObject(current) ? { ...current } : {};
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
/**
 * OpenChamber per-session metadata, held by OpenCode.
 *
 * Goal mode, session assist, obligatory context re-injection and pinned
 * notes/plans keep their per-session state in the session's `metadata`, under
 * the `openchamber` namespace. OpenCode 2.0.15 added `PATCH /api/session/{id}`
 * with `metadata`, so the OpenCode record is the single authority and every
 * client reading `session.metadata` sees the same thing.
 *
 * OpenCode replaces the whole object on PATCH. Writers here send a JSON Merge
 * Patch (RFC 7386): nested objects merge key by key and a `null` deletes. The
 * store reads the record, merges, and writes the result back, one write per
 * session at a time, so goal mode saving progress cannot drop an assist recap
 * that was written a moment earlier.
 *
 * Before 2.0.15 the state lived in `sessions-metadata.json` under the data dir.
 * Entries still in that file are the newest metadata their sessions have: they
 * are served from the file and pushed to OpenCode, lazily on the session's
 * first write and in one sweep once OpenCode is up. A pushed entry leaves the
 * file; an empty file is renamed to `sessions-metadata.json.migrated` and kept
 * so nothing is lost if a migration turns out wrong.
 */

import { asNonEmptyString } from '../shared/guards.js';
import fsDefault from 'node:fs';
import pathDefault from 'node:path';

import { createOpenCodeClient as createOpenCodeClientDefault } from './opencode-client.js';

const LEGACY_FILE_NAME = 'sessions-metadata.json';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * RFC 7386 merge. Returns a new object; `null` in the patch removes the key,
 * and a non-object patch value replaces whatever was there.
 */
export const mergeMetadataPatch = (current, patch) => {
  const base = isPlainObject(current) ? { ...current } : {};
=======
import { asNonEmptyString } from '../shared/guards.js';
import fsDefault from 'node:fs';
import pathDefault from 'node:path';
import { z } from 'zod';

import { createOpenCodeClient as createOpenCodeClientDefault } from './opencode-client.js';
import { hasCode, hasMessage, hasTag } from './contracts.js';
import type { FileStoreOptions } from './contracts.js';
import type { JsonValue } from '@opencode/client';

const LEGACY_FILE_NAME = 'sessions-metadata.json';

const metadataSchema = z.looseObject({});
export type SessionMetadata = z.infer<typeof metadataSchema>;

const isPlainObject = (value: unknown): value is SessionMetadata => value !== null && typeof value === 'object' && !Array.isArray(value);

export const mergeMetadataPatch = (current: SessionMetadata | JsonValue | undefined, patch: SessionMetadata | JsonValue): SessionMetadata => {
  const base: SessionMetadata = isPlainObject(current) ? { ...current } : {};
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts
  if (!isPlainObject(patch)) return base;
  for (const [key, value] of Object.entries(patch)) {
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
    if (value === null) delete base[key];
    else Object.defineProperty(base, key, { value: isPlainObject(value) ? mergeMetadataPatch(base[key], value) : value, enumerable: true, writable: true, configurable: true });
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
    if (value === null) {
      delete base[key];
      continue;
    }
    base[key] = isPlainObject(value) ? mergeMetadataPatch(base[key], value) : value;
=======
    if (value === null) {
      delete base[key];
      continue;
    }
    if (isPlainObject(value)) {
      const previous = base[key];
      base[key] = mergeMetadataPatch(isPlainObject(previous) ? previous : undefined, value);
    } else {
      base[key] = value;
    }
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts
  }
  return base;
};

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
const readFailure = (error) => error instanceof MetadataCorruptError || error instanceof MetadataReadError ? error : new MetadataReadError('Could not read Host session metadata', error);
const writeFailure = (error) => error instanceof MetadataCorruptError || error instanceof MetadataWriteError ? error : new MetadataWriteError('Could not write Host session metadata', error);
const OPENCHAMBER_KEYS = new Set([
  'goal', 'assist', 'knowledge_context_delivered', 'context_obligatory_last_compaction_message_id',
  'project_context_pins', 'context_obligatory_messages', 'linked_issues', 'work', 'reviewOffer',
  'pinned', 'workbench', 'turn',
  'reviewSessionID', 'kind', 'originalSessionID', 'multirun',
]);
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
const isSessionNotFound = (error) => error?._tag === 'SessionNotFoundError';
=======
const isSessionNotFound = (error: unknown): error is { _tag: 'SessionNotFoundError' } =>
  hasTag(error) && error._tag === 'SessionNotFoundError';

export interface MetadataReadOptions {
  directory?: string;
  signal?: AbortSignal | undefined;
}

export interface OpenCodeSessionMetadata {
  read: (sessionID: string, options?: MetadataReadOptions) => Promise<SessionMetadata | null>;
  write: (sessionID: string, metadata: SessionMetadata | undefined, options?: { directory?: string }) => Promise<void>;
}

interface OpenCodeMetadataOptions {
  buildOpenCodeUrl: (route: string, query: string) => string;
  getOpenCodeAuthHeaders: () => NonNullable<Parameters<typeof createOpenCodeClientDefault>[0]['headers']>;
  createOpenCodeClient?: typeof createOpenCodeClientDefault;
}
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
/** Sole durable authority for operational metadata; never reads an execution endpoint. */
export const createSessionMetadataStore = ({ dataDir, fsPromises = fs.promises, path: nodePath = path, database = null, closeDatabase = database === null } = {}) => {
  const opened = database ? { db: database, filePath: nodePath.join(dataDir, 'host-metadata.sqlite') } : openHostMetadataDatabase({ dataDir, path: nodePath });
  const { db, filePath } = opened;
  if (database) ensureHostMetadataSchema(db);
  const lifecycle = createMetadataLifecycle(db, closeDatabase);
  const sessionChains = new Map();
  const runForSession = (id, work) => {
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
/**
 * Reads and writes one session's metadata on OpenCode. `read` resolves `null`
 * when OpenCode does not know the session; any other failure throws, because
 * "could not ask" must not become "empty".
 */
export const createOpenCodeSessionMetadata = ({
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  createOpenCodeClient = createOpenCodeClientDefault,
}) => {
  const clientFor = (directory) => createOpenCodeClient({
    baseUrl: buildOpenCodeUrl('/', '').replace(/\/$/, ''),
    headers: getOpenCodeAuthHeaders(),
    directory,
  });
  return {
    read: async (sessionID, { directory = '', signal } = {}) => {
      let session;
      try {
        // The 2.x client unwraps the `{ data }` envelope: this is the record itself.
        session = await clientFor(directory).session.get({ sessionID }, { signal });
      } catch (error) {
        if (isSessionNotFound(error)) return null;
        throw error;
      }
      return isPlainObject(session?.metadata) ? session.metadata : {};
    },
    write: (sessionID, metadata, { directory = '' } = {}) =>
      clientFor(directory).session.update({ sessionID, metadata }),
  };
};

/**
 * @param {object} options
 * @param {string} options.dataDir OpenChamber data directory; holds the legacy file.
 * @param {{ read: Function, write: Function }} options.openCode See {@link createOpenCodeSessionMetadata}.
 * @param {typeof fsDefault.promises} [options.fsPromises]
 * @param {typeof pathDefault} [options.path]
 * @param {() => number} [options.now]
 */
export const createSessionMetadataStore = ({
  dataDir,
  openCode,
  fsPromises = fsDefault.promises,
  path = pathDefault,
  now = Date.now,
}) => {
  const legacyPath = path.join(dataDir, LEGACY_FILE_NAME);

  /** sessionID → metadata from the legacy file that OpenCode does not hold yet. */
  const unmigrated = new Map();
  let legacyLoad = null;

  /**
   * One chain per session: read, merge and write cannot interleave with another
   * write to the same session. Different sessions proceed in parallel.
   */
  const sessionChains = new Map();
  const runForSession = (id, work) => {
=======
export const createOpenCodeSessionMetadata = ({
  buildOpenCodeUrl,
  getOpenCodeAuthHeaders,
  createOpenCodeClient = createOpenCodeClientDefault,
}: OpenCodeMetadataOptions): OpenCodeSessionMetadata => {
  const clientFor = (directory: string) => createOpenCodeClient({
    baseUrl: buildOpenCodeUrl('/', '').replace(/\/$/, ''),
    headers: getOpenCodeAuthHeaders(),
    directory,
  });
  return {
    read: async (sessionID, { directory = '', signal } = {}) => {
      let session;
      try {
        session = await clientFor(directory).session.get({ sessionID }, { signal });
      } catch (error) {
        if (isSessionNotFound(error)) return null;
        throw error;
      }
      return isPlainObject(session?.metadata) ? session.metadata : {};
    },
    write: (sessionID, metadata, { directory = '' } = {}) =>
      clientFor(directory).session.update({ sessionID, metadata }),
  };
};

interface SessionMetadataStoreOptions extends FileStoreOptions {
  openCode: OpenCodeSessionMetadata;
}

export type MetadataDecider = (current: SessionMetadata | undefined) => SessionMetadata | null;

export const createSessionMetadataStore = ({
  dataDir,
  openCode,
  fsPromises = fsDefault.promises,
  path = pathDefault,
  now = Date.now,
}: SessionMetadataStoreOptions) => {
  const legacyPath = path.join(dataDir, LEGACY_FILE_NAME);

  const unmigrated = new Map<string, SessionMetadata>();
  let legacyLoad: Promise<void> | null = null;

  const sessionChains = new Map<string, Promise<void>>();
  const runForSession = <Result>(id: string, work: () => Promise<Result>) => {
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts
    const previous = sessionChains.get(id) ?? Promise.resolve();
    const next = previous.then(work, work);
    const settled = next.then(() => undefined, () => undefined);
    sessionChains.set(id, settled);
    void settled.then(() => { if (sessionChains.get(id) === settled) sessionChains.delete(id); });
    return next;
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
  const conversion = createLegacyMetadataConversion({
    db, dataDir, fsPromises, nodePath, fileName: 'sessions-metadata.json',
    parse: (parsed) => {
      const entries = [];
      const errors = {};
      for (const [key, value] of Object.entries(parsed)) {
        const id = asNonEmptyString(key);
        const metadata = MetadataSchema.safeParse(value);
        if (!id || !metadata.success) errors[key] = 'METADATA_CORRUPT';
        else entries.push([id, metadata.data]);
      }
      return { entries, errors };
    },
    insert: (entries) => {
      const insert = db.prepare('INSERT OR IGNORE INTO session_metadata (session_id, revision, payload) VALUES (?, 1, ?)');
      for (const [id, metadata] of entries) insert.run(id, JSON.stringify(metadata));
    },
  });
  // OMP owns session titles. A title left by the old Host-owned field is not
  // exposed through the canonical metadata contract; it is dropped on read so
  // existing payloads keep their other operational fields.
  const withoutLegacyTitle = (metadata) => {
    if (!Object.hasOwn(metadata, 'title')) return metadata;
    const { title: _title, ...rest } = metadata;
    return rest;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js

  /** Legacy file rewrites, one at a time so an older snapshot never lands last. */
  let fileChain = Promise.resolve();
  const runFileWrite = (work) => {
    const next = fileChain.then(work, work);
    fileChain = next.then(() => undefined, () => undefined);
    return next;
=======

  let fileChain = Promise.resolve();
  const runFileWrite = <Result>(work: () => Promise<Result>) => {
    const next = fileChain.then(work, work);
    fileChain = next.then(() => undefined, () => undefined);
    return next;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
  const readRow = (id) => {
    try {
      const row = db.prepare('SELECT revision, payload FROM session_metadata WHERE session_id = ?').get(id);
      if (!row) return null;
      const metadata = MetadataSchema.safeParse(readJsonObject(row.payload, 'Session metadata'));
      if (!metadata.success) throw new MetadataCorruptError('Session operational metadata has an invalid shape');
      if (!RevisionSchema.safeParse(row.revision).success) throw new MetadataCorruptError('Session metadata revision is invalid');
      return { metadata: withoutLegacyTitle(metadata.data), revision: String(row.revision) };
    } catch (error) { throw readFailure(error); }
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js

  const parseLegacy = (raw) => {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) throw new Error('session metadata file is not a JSON object');
    const result = new Map();
    for (const [sessionID, value] of Object.entries(parsed)) {
      const id = asNonEmptyString(sessionID);
      if (id && isPlainObject(value)) result.set(id, value);
    }
    return result;
=======

  const parseLegacy = (raw: string) => {
    const parsed: unknown = JSON.parse(raw);
    if (!metadataSchema.safeParse(parsed).success || !isPlainObject(parsed)) throw new Error('session metadata file is not a JSON object');
    const result = new Map<string, SessionMetadata>();
    for (const [sessionID, value] of Object.entries(parsed)) {
      const id = asNonEmptyString(sessionID);
      if (id && isPlainObject(value)) result.set(id, value);
    }
    return result;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts
  };
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
  const resolveCurrent = async (id) => {
    const converted = await conversion.convert();
    const current = readRow(id);
    // Existing SQLite rows remain authoritative even when an old source fails.
    if (current) return current;
    if (converted.errors[id]) throw new MetadataCorruptError('Legacy session metadata is corrupt');
    if (converted.error) throw converted.error;
    return null;
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js

  /**
   * Resolves once the legacy file has been read. A read failure rejects and
   * lets the next call retry: writing while the file is unknown could push an
   * older record over one the file still holds, or the file's older record over
   * a newer write later on.
   */
  const loadLegacy = () => {
    if (!legacyLoad) {
      legacyLoad = (async () => {
        let raw;
        try {
          raw = await fsPromises.readFile(legacyPath, 'utf8');
        } catch (error) {
          if (error?.code === 'ENOENT') return;
          throw new Error(`session metadata is unavailable: ${error?.message ?? error}`);
        }
        try {
          for (const [id, metadata] of parseLegacy(raw)) unmigrated.set(id, metadata);
        } catch (error) {
          // Unreadable bytes are kept for the user; there is nothing to migrate.
          const backup = `${legacyPath}.corrupt-${now()}`;
          await fsPromises.rename(legacyPath, backup).catch(() => undefined);
          console.warn(`[openchamber-sessions] legacy session metadata was unreadable and was moved to ${backup}: ${error?.message ?? error}`);
        }
      })().catch((error) => {
        legacyLoad = null;
        throw error;
      });
    }
    return legacyLoad;
=======

  const loadLegacy = () => {
    if (!legacyLoad) {
      legacyLoad = (async () => {
        let raw;
        try {
          raw = await fsPromises.readFile(legacyPath, 'utf8');
        } catch (error) {
          if (hasCode(error) && error.code === 'ENOENT') return;
          throw new Error(`session metadata is unavailable: ${(hasMessage(error) ? error.message : undefined) ?? error}`);
        }
        try {
          for (const [id, metadata] of parseLegacy(raw)) unmigrated.set(id, metadata);
        } catch (error) {
          const backup = `${legacyPath}.corrupt-${now()}`;
          await fsPromises.rename(legacyPath, backup).catch(() => undefined);
          console.warn(`[openchamber-sessions] legacy session metadata was unreadable and was moved to ${backup}: ${(hasMessage(error) ? error.message : undefined) ?? error}`);
        }
      })().catch((error) => {
        legacyLoad = null;
        throw error;
      });
    }
    return legacyLoad;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts
  };
  const getState = (sessionID) => lifecycle.run(() => {
    const id = asNonEmptyString(sessionID);
    return id ? resolveCurrent(id) : null;
  });
  const get = async (id) => (await getState(id))?.metadata ?? null;

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
  const mutate = (sessionID, decide) => {
    const id = asNonEmptyString(sessionID);
    if (!id) return Promise.reject(new MetadataWriteError('A session id is required'));
    return lifecycle.run(() => runForSession(id, async () => {
      await resolveCurrent(id);
      try {
        return withTransaction(db, () => {
          // Read and decision are inside the SQLite write transaction as well as
          // the per-session queue: separate Host connections cannot lose a patch.
          const current = readRow(id);
          const metadata = current?.metadata ?? {};
          const patch = decide(metadata);
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
      } catch (error) { throw writeFailure(error); }
    }));
  };
  const setSessionMetadata = (id, patch) => mutate(id, () => patch);
  const updateSessionMetadata = (id, decide) => mutate(id, decide);
  const listAll = () => lifecycle.run(async () => {
    const converted = await conversion.convert();
    let rows;
    try { rows = db.prepare('SELECT session_id FROM session_metadata ORDER BY session_id').all(); }
    catch (error) { throw readFailure(error); }
    const entries = {};
    const errors = { ...converted.errors };
    for (const { session_id: id } of rows) {
      try { entries[id] = readRow(id); delete errors[id]; }
      catch (error) { errors[id] = error.code; }
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
  /** Writes what is left to migrate, or retires the file once nothing is. */
  const persistLegacy = () => runFileWrite(async () => {
    if (unmigrated.size === 0) {
      await fsPromises.rename(legacyPath, `${legacyPath}.migrated`).catch((error) => {
        if (error?.code !== 'ENOENT') throw error;
      });
      return;
=======
  const persistLegacy = () => runFileWrite(async () => {
    if (unmigrated.size === 0) {
      await fsPromises.rename(legacyPath, `${legacyPath}.migrated`).catch((error) => {
        if (!hasCode(error) || error.code !== 'ENOENT') throw error;
      });
      return;
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts
    }
    const status = { status: converted.status };
    if (converted.error) status.code = converted.error.code;
    return { entries, errors, conversion: status };
  });

<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
  /** Explicit one-time selected operational projections from the inherited runtime.
   * A caller supplies session list/detail projections, not transcript records.
   * SQLite rows always win; no ongoing OpenCode accessor or fallback exists.
   */
  const importOperationalSessions = (sessions, source) => lifecycle.run(async () => {
    const selection = SelectionSchema.safeParse({ sessions, source });
    if (!selection.success) throw new MetadataWriteError('A selected metadata source and session projections are required');
    const entries = [];
    const results = {};
    const errors = {};
    for (const value of selection.data.sessions) {
      const parsed = SelectedProjectionSchema.safeParse(value);
      const identity = SelectedIdentitySchema.safeParse(value);
      if (!parsed.success) { errors[identity.success ? identity.data.id : 'invalid'] = 'METADATA_CORRUPT'; continue; }
      const session = parsed.data;
      const id = session.id;
      const metadata = {};
      for (const key of ['directory', 'projectID']) if (session[key] !== undefined) metadata[key] = session[key];
      const operational = session.metadata?.openchamber;
      if (operational) metadata.openchamber = Object.fromEntries(Object.entries(operational).filter(([key]) => OPENCHAMBER_KEYS.has(key)));
      for (const key of ['directory', 'projectID', 'folder', 'isPinned', 'color', 'icon', 'notes']) {
        if (session.metadata?.[key] !== undefined) metadata[key] = session.metadata[key];
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
  /**
   * Drops a pushed entry from the legacy file. OpenCode already holds the
   * record, so a failed rewrite does not fail the write that caused it. The
   * entry then stays on disk and the next start pushes that older copy again;
   * the next rewrite of the file (any other migrated session) clears it first.
   */
  const forgetLegacy = async (id) => {
    unmigrated.delete(id);
    await persistLegacy().catch((error) => {
      console.warn('[openchamber-sessions] could not update the legacy session metadata file:', error?.message ?? error);
    });
  };

  // Cancelling one reader must not cancel the shared legacy load for others.
  const loadLegacyForReader = async (signal) => {
    if (!signal) return loadLegacy();
    signal.throwIfAborted();
    let onAbort;
    const cancelled = new Promise((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      await Promise.race([loadLegacy(), cancelled]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };

  /**
   * The session's full metadata: the legacy entry while it is still waiting to
   * be migrated, OpenCode's record otherwise. `{}` for a session OpenCode does
   * not know. Throws when OpenCode could not be asked. A caller's signal cancels
   * its legacy-load wait and travels to the SDK read, leaving other readers alone.
   */
  const get = async (sessionID, { directory = '', signal } = {}) => {
    signal?.throwIfAborted();
    const id = asNonEmptyString(sessionID);
    if (!id) return {};
    await loadLegacyForReader(signal);
    signal?.throwIfAborted();
    if (unmigrated.has(id)) return unmigrated.get(id);
    return (await openCode.read(id, { directory, signal })) ?? {};
  };

  /**
   * Applies a merge patch on OpenCode and returns the full metadata afterwards.
   * Nothing is written when the current record cannot be read, so a patch never
   * replaces fields it could not see.
   */
  const setSessionMetadata = async (sessionID, patch, { directory = '' } = {}) => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new Error('a session id is required to store session metadata');
    if (!isPlainObject(patch)) throw new Error('a session metadata patch must be an object');
    await loadLegacy();

    return runForSession(id, async () => {
      const fromLegacy = unmigrated.has(id);
      const current = fromLegacy ? unmigrated.get(id) : await openCode.read(id, { directory });
      if (current === null) throw new Error(`session ${id} was not found`);
      const merged = mergeMetadataPatch(current, patch);
      await openCode.write(id, merged, { directory });
      if (fromLegacy) await forgetLegacy(id);
      return merged;
    });
  };

  /**
   * Like `setSessionMetadata`, but the patch is decided from the record as it
   * is when this session's turn in the write queue comes: `decide(current)`
   * returns a merge patch, or null to leave the record alone. A writer whose
   * change depends on the current value (open only when not closed after the
   * request) cannot be overtaken between its read and its write this way.
   * Resolves `{ metadata, changed }`.
   */
  const updateSessionMetadata = async (sessionID, decide, { directory = '' } = {}) => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new Error('a session id is required to store session metadata');
    await loadLegacy();

    return runForSession(id, async () => {
      const fromLegacy = unmigrated.has(id);
      const current = fromLegacy ? unmigrated.get(id) : await openCode.read(id, { directory });
      if (current === null) throw new Error(`session ${id} was not found`);
      const patch = decide(current);
      if (!isPlainObject(patch)) return { metadata: current, changed: false };
      const merged = mergeMetadataPatch(current, patch);
      await openCode.write(id, merged, { directory });
      if (fromLegacy) await forgetLegacy(id);
      return { metadata: merged, changed: true };
    });
  };

  /**
   * Pushes every legacy entry to OpenCode. A session OpenCode no longer knows
   * has nothing to receive its metadata, so its entry is dropped. Any other
   * failure keeps the entry for the next sweep. Resolves the number of entries
   * still waiting.
   */
  const migrateLegacy = async () => {
    await loadLegacy();
    const pending = [...unmigrated.keys()];
    if (pending.length === 0) return 0;
    let changed = false;
    await Promise.all(pending.map((id) => runForSession(id, async () => {
      // A write that ran first already migrated it.
      if (!unmigrated.has(id)) return;
      try {
        await openCode.write(id, unmigrated.get(id));
      } catch (error) {
        if (!isSessionNotFound(error)) {
          console.warn(`[openchamber-sessions] could not migrate metadata for ${id}:`, error?.message ?? error);
          return;
        }
=======
  const forgetLegacy = async (id: string) => {
    unmigrated.delete(id);
    await persistLegacy().catch((error) => {
      console.warn('[openchamber-sessions] could not update the legacy session metadata file:', (hasMessage(error) ? error.message : undefined) ?? error);
    });
  };

  const loadLegacyForReader = async (signal: AbortSignal | undefined) => {
    if (!signal) return loadLegacy();
    signal.throwIfAborted();
    let onAbort = () => {};
    const cancelled = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      await Promise.race([loadLegacy(), cancelled]);
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  };

  const get = async (sessionID: string | null, { directory = '', signal }: MetadataReadOptions = {}) => {
    signal?.throwIfAborted();
    const id = asNonEmptyString(sessionID);
    if (!id) return {};
    await loadLegacyForReader(signal);
    signal?.throwIfAborted();
    if (unmigrated.has(id)) return unmigrated.get(id);
    return (await openCode.read(id, { directory, signal })) ?? {};
  };

  const setSessionMetadata = async (sessionID: string, patch: SessionMetadata, { directory = '' }: MetadataReadOptions = {}) => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new Error('a session id is required to store session metadata');
    if (!isPlainObject(patch)) throw new Error('a session metadata patch must be an object');
    await loadLegacy();

    return runForSession(id, async () => {
      const fromLegacy = unmigrated.has(id);
      const current = fromLegacy ? unmigrated.get(id) : await openCode.read(id, { directory });
      if (current === null) throw new Error(`session ${id} was not found`);
      const merged = mergeMetadataPatch(current, patch);
      await openCode.write(id, merged, { directory });
      if (fromLegacy) await forgetLegacy(id);
      return merged;
    });
  };

  const updateSessionMetadata = async (sessionID: string, decide: MetadataDecider, { directory = '' }: MetadataReadOptions = {}) => {
    const id = asNonEmptyString(sessionID);
    if (!id) throw new Error('a session id is required to store session metadata');
    await loadLegacy();

    return runForSession(id, async () => {
      const fromLegacy = unmigrated.has(id);
      const current = fromLegacy ? unmigrated.get(id) : await openCode.read(id, { directory });
      if (current === null) throw new Error(`session ${id} was not found`);
      const patch = decide(current);
      if (!isPlainObject(patch)) return { metadata: current, changed: false };
      const merged = mergeMetadataPatch(current, patch);
      await openCode.write(id, merged, { directory });
      if (fromLegacy) await forgetLegacy(id);
      return { metadata: merged, changed: true };
    });
  };

  const migrateLegacy = async () => {
    await loadLegacy();
    const pending = [...unmigrated.keys()];
    if (pending.length === 0) return 0;
    let changed = false;
    await Promise.all(pending.map((id) => runForSession(id, async () => {
      if (!unmigrated.has(id)) return;
      try {
        await openCode.write(id, unmigrated.get(id));
      } catch (error) {
        if (!isSessionNotFound(error)) {
          console.warn(`[openchamber-sessions] could not migrate metadata for ${id}:`, (hasMessage(error) ? error.message : undefined) ?? error);
          return;
        }
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts
      }
<<<<<<< HEAD:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
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
            if (db.prepare('SELECT completed FROM metadata_conversion WHERE source = ?').get(key)?.completed === 1) {
              results[id] = 'already-converted';
              continue;
            }
            const inserted = insert.run(id, JSON.stringify(metadata));
            receipt.run(key);
            results[id] = current || inserted.changes === 0 ? 'existing' : 'imported';
          } catch (error) {
            if (!(error instanceof MetadataCorruptError)) throw error;
            errors[id] = error.code;
          }
        }
      });
    } catch (error) { throw writeFailure(error); }
    return { results, errors, complete: Object.keys(errors).length === 0 };
  });
  return { get, getState, listAll, setSessionMetadata, updateSessionMetadata, importOperationalSessions,
    convertLegacy: () => lifecycle.run(conversion.convert), flush: lifecycle.flush, close: lifecycle.close, databasePath: filePath };
||||||| bc50ba56aa:packages/web/server/lib/openchamber-sessions/session-metadata-store.js
      unmigrated.delete(id);
      changed = true;
    })));
    if (changed) await persistLegacy();
    return unmigrated.size;
  };

  /**
   * `{ [sessionID]: metadata }` for sessions whose metadata still lives in the
   * legacy file. The proxy lays these over OpenCode's records until they are
   * migrated; empty once migration is done.
   */
  const listUnmigrated = async () => {
    await loadLegacy();
    return Object.fromEntries(unmigrated);
  };

  return {
    get,
    setSessionMetadata,
    updateSessionMetadata,
    migrateLegacy,
    listUnmigrated,
    legacyPath,
  };
=======
      unmigrated.delete(id);
      changed = true;
    })));
    if (changed) await persistLegacy();
    return unmigrated.size;
  };

  const listUnmigrated = async () => {
    await loadLegacy();
    return Object.fromEntries(unmigrated);
  };

  return {
    get,
    setSessionMetadata,
    updateSessionMetadata,
    migrateLegacy,
    listUnmigrated,
    legacyPath,
  };
>>>>>>> upstream/main:packages/web/server/lib/openchamber-sessions/session-metadata-store.ts
};
export { MetadataCorruptError, MetadataWriteError };
