import { z } from 'zod';
import type { Model, Provider } from '@openchamber/agent-contract';
export type CachedProvider = Provider & { models: Model[] };

export type CachedCatalog = {
  providers?: CachedProvider[];
  defaultProviders?: Record<string, string>;
};

const DATABASE = 'openchamber-config-catalog';
const DATABASE_VERSION = 1;
const STORE = 'catalogs';
const SAVED_AT_INDEX = 'savedAt';
/** Bump when the stored provider/model shape changes; older records are dropped. */
export const CATALOG_CACHE_SCHEMA = 4;

/** Display-only provider/model continuity, scoped by runtime and directory. */

export const CATALOG_CACHE_MAX_RECORDS = 24;

const recordKey = (runtimeKey: string, directoryKey: string): string => `${runtimeKey}\n${directoryKey}`;

let databasePromise: Promise<IDBDatabase | null> | null = null;

const openDatabase = (): Promise<IDBDatabase | null> => {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase | null>((resolve) => {
    const factory = globalThis.indexedDB;
    if (!factory) {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(DATABASE, DATABASE_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: 'key' }).createIndex(SAVED_AT_INDEX, 'savedAt');
    };
    request.onsuccess = () => resolve(request.result);
    // Private modes and restricted browser storage can refuse IndexedDB; the cache is
    // then simply absent and the pickers wait for the live load as before.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return databasePromise;
};

const storedModelSchema = z.strictObject({
  modelId: z.string(), provider: z.string(), name: z.string(),
  modalities: z.array(z.enum(['text', 'image', 'audio', 'embedding'])), contextWindow: z.number(), maxOutputTokens: z.number(),
  reasoningEffortSupported: z.boolean(),
  reasoningOptions: z.array(z.strictObject({ reasoningEffort: z.string(), label: z.string(), budgetTokens: z.number().nullable() })),
  variants: z.array(z.strictObject({ variant: z.string(), label: z.string(), reasoningEffort: z.string().nullable() })),
  toolsSupported: z.boolean().optional(), enabled: z.boolean().optional(), status: z.enum(['alpha', 'beta', 'deprecated', 'active']).optional(),
  pricing: z.strictObject({ inputPerMillionTokens: z.number(), outputPerMillionTokens: z.number(), cacheReadPerMillionTokens: z.number().nullable(), cacheWritePerMillionTokens: z.number().nullable() }).nullable(),
});

const storedProviderSchema = z.strictObject({
  providerId: z.string(), name: z.string(), endpoint: z.string().url().nullable(),
  protocol: z.enum(['chat-completions', 'responses', 'messages', 'generate-content']).nullable(),
  authMethods: z.array(z.enum(['api-key', 'oauth'])),
  auth: z.discriminatedUnion('status', [
    z.strictObject({ status: z.literal('missing') }),
    z.strictObject({ status: z.literal('configured'), credentialRef: z.string(), method: z.enum(['api-key', 'oauth']), source: z.enum(['stored-credential', 'managed-environment', 'external-environment']) }),
  ]),
  models: z.array(storedModelSchema),
});


const storedRecordSchema = z.strictObject({ key: z.string(), schema: z.number(), runtimeKey: z.string(), directoryKey: z.string(), savedAt: z.number(), providers: z.array(storedProviderSchema).optional(), defaultProviders: z.record(z.string(), z.string()).optional() });
type StoredRecord = z.infer<typeof storedRecordSchema>;
type StoredProvider = z.infer<typeof storedProviderSchema>;
type StoredModel = z.infer<typeof storedModelSchema>;
type StoredCatalog = Pick<StoredRecord, 'providers' | 'defaultProviders'>;

const toStoredModel = (model: Model): StoredModel => ({
  modelId: model.modelId, provider: model.provider, name: model.name, modalities: [...model.modalities], contextWindow: model.contextWindow, maxOutputTokens: model.maxOutputTokens,
  reasoningEffortSupported: model.reasoningEffortSupported, reasoningOptions: model.reasoningOptions.map((option) => ({ ...option })), variants: model.variants.map((variant) => ({ ...variant })),
  toolsSupported: model.toolsSupported, enabled: model.enabled, status: model.status, pricing: model.pricing && { ...model.pricing },
});

const toStoredProvider = (provider: CachedProvider): StoredProvider => ({
  providerId: provider.providerId, name: provider.name, endpoint: provider.endpoint, protocol: provider.protocol, authMethods: [...provider.authMethods], auth: { ...provider.auth }, models: provider.models.map(toStoredModel),
});


const toStoredCatalog = (catalog: CachedCatalog): StoredCatalog => {
  const stored: StoredCatalog = {};
  if (catalog.providers) stored.providers = catalog.providers.map(toStoredProvider);
  if (catalog.defaultProviders) stored.defaultProviders = { ...catalog.defaultProviders };
  return stored;
};

/**
 * A record is trusted only when it carries the current schema and the identity
 * it was asked for. Anything else is from another build or another place and
 * is dropped, never shown.
 */
const isRecordFor = (record: StoredRecord, runtimeKey: string, directoryKey: string): boolean =>
  record.schema === CATALOG_CACHE_SCHEMA && record.runtimeKey === runtimeKey && record.directoryKey === directoryKey;

const toCachedCatalog = (record: StoredRecord): CachedCatalog => {
  const catalog: CachedCatalog = {};
  if (record.providers) catalog.providers = record.providers;
  if (record.defaultProviders) catalog.defaultProviders = record.defaultProviders;
  return catalog;
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('Catalog cache request failed.'));
});

/** Reads one record, parsed at the IndexedDB boundary. */
const readStoredRecord = async (database: IDBDatabase, key: string): Promise<StoredRecord | 'missing' | 'corrupt'> => {
  const stored = await requestResult(database.transaction(STORE, 'readonly').objectStore(STORE).get(key));
  if (stored === undefined) return 'missing';
  const parsed = storedRecordSchema.safeParse(stored);
  return parsed.success ? parsed.data : 'corrupt';
};

/**
 * The cached catalog for a runtime and directory; null when there is none,
 * IndexedDB is unavailable, or the record is corrupt (corrupt records are
 * deleted).
 */
export const readCachedCatalog = async (runtimeKey: string, directoryKey: string): Promise<CachedCatalog | null> => {
  const database = await openDatabase();
  if (!database) return null;
  try {
    const key = recordKey(runtimeKey, directoryKey);
    const stored = await readStoredRecord(database, key);
    if (stored === 'missing') return null;
    if (stored === 'corrupt' || !isRecordFor(stored, runtimeKey, directoryKey)) {
      void requestResult(database.transaction(STORE, 'readwrite').objectStore(STORE).delete(key)).catch(() => undefined);
      return null;
    }
    return toCachedCatalog(stored);
  } catch {
    return null;
  }
};

// Serialize writes so newer provider/model snapshots cannot be overtaken.
let writeChain: Promise<void> = Promise.resolve();

/**
 * Stores the part of a catalog a live load just produced, keeping the other
 * part of the record. Callers write only authoritative, non-empty catalogs.
 */
export const writeCachedCatalog = (runtimeKey: string, directoryKey: string, update: CachedCatalog): Promise<void> => {
  writeChain = writeChain.then(async () => {
    const database = await openDatabase();
    if (!database) return;
    const key = recordKey(runtimeKey, directoryKey);
    const stored = await readStoredRecord(database, key).catch(() => 'missing' as const);
    const previous: StoredCatalog = stored === 'missing' || stored === 'corrupt' || !isRecordFor(stored, runtimeKey, directoryKey)
      ? {}
      : { providers: stored.providers, defaultProviders: stored.defaultProviders };
    const record: StoredRecord = {
      ...previous,
      ...toStoredCatalog(update),
      key,
      schema: CATALOG_CACHE_SCHEMA,
      runtimeKey,
      directoryKey,
      savedAt: Date.now(),
    };
    await requestResult(database.transaction(STORE, 'readwrite').objectStore(STORE).put(record));
    await pruneCachedCatalogs(database);
  }).catch(() => undefined);
  return writeChain;
};

/**
 * How long a loaded catalog must go without a newer catalog event before it is
 * stored. OpenCode announces a starting location's full catalog about two
 * seconds after its first, partial answer.
 */
export const CATALOG_PERSIST_SETTLE_MS = 3_000;

/**
 * Stores a loaded catalog after the settle delay, unless `isSuperseded` says a
 * newer load replaces it by then (a catalog event, a runtime switch).
 */
export const writeCachedCatalogWhenSettled = (
  runtimeKey: string,
  directoryKey: string,
  update: CachedCatalog,
  isSuperseded: () => boolean,
  schedule: (callback: () => void, delayMs: number) => void = (callback, delayMs) => { setTimeout(callback, delayMs); },
): void => {
  schedule(() => {
    if (isSuperseded()) return;
    void writeCachedCatalog(runtimeKey, directoryKey, update);
  }, CATALOG_PERSIST_SETTLE_MS);
};

/** Deletes the least recently saved records beyond the limit, reading keys only. */
const pruneCachedCatalogs = (database: IDBDatabase): Promise<void> => new Promise((resolve, reject) => {
  const transaction = database.transaction(STORE, 'readwrite');
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('Catalog cache prune failed.'));
  transaction.onabort = () => reject(transaction.error ?? new Error('Catalog cache prune aborted.'));
  const store = transaction.objectStore(STORE);
  const countRequest = store.count();
  countRequest.onsuccess = () => {
    let excess = countRequest.result - CATALOG_CACHE_MAX_RECORDS;
    if (excess <= 0) return;
    const cursorRequest = store.index(SAVED_AT_INDEX).openKeyCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor || excess <= 0) return;
      store.delete(cursor.primaryKey);
      excess -= 1;
      cursor.continue();
    };
  };
});


export const resetCatalogCacheForTests = (): void => {
  databasePromise = null;
  writeChain = Promise.resolve();
};
