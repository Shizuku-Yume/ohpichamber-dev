import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { Model } from '@openchamber/agent-contract';
import {
  type CachedProvider,
  CATALOG_CACHE_MAX_RECORDS,
  CATALOG_PERSIST_SETTLE_MS,
  CATALOG_CACHE_SCHEMA,
  readCachedCatalog,
  resetCatalogCacheForTests,
  writeCachedCatalog,
  writeCachedCatalogWhenSettled,
} from './configCatalogCache';

// A minimal in-memory IndexedDB covering what the cache uses: one object store
// keyed by `key`, get/put/delete/count, and a key cursor over `savedAt`.
// Seeded fields are loose on purpose: corrupt-record tests store shapes the
// cache must reject.
type SeedCatalog = {
  schema?: number;
  providers?: ReadonlyArray<{ providerId: string | number; name?: string; headers?: { [name: string]: string }; models?: ReadonlyArray<{ modelId: string; provider: string; name?: string }> }>;
  defaultProviders?: { [providerId: string]: string };
  agents?: ReadonlyArray<{ name: string }>;
};
type StoredRecord = SeedCatalog & { key: string; savedAt?: number; runtimeKey?: string; directoryKey?: string };

class FakeRequest<T> {
  result: T | undefined = undefined;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

class FakeOpenRequest<T> extends FakeRequest<T> {
  onupgradeneeded: (() => void) | null = null;
  onblocked: (() => void) | null = null;
}

class FakeTransaction {
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  error: Error | null = null;
  private pending = 0;

  constructor(private readonly records: Map<string, StoredRecord>) {}

  objectStore() {
    const records = this.records;
    const respond = <T>(compute: () => T, request = new FakeRequest<T>(), then?: () => void) => {
      this.pending += 1;
      setTimeout(() => {
        request.result = compute();
        request.onsuccess?.();
        then?.();
        this.settle();
      }, 0);
      return request;
    };
    return {
      get: (key: string) => respond(() => (records.has(key) ? structuredClone(records.get(key)) : undefined)),
      put: (record: StoredRecord) => respond(() => { records.set(record.key, structuredClone(record)); return record.key; }),
      delete: (key: string) => respond(() => { records.delete(key); return undefined; }),
      count: () => respond(() => records.size),
      index: () => ({
        openKeyCursor: () => {
          const keys = [...records.values()]
            .filter((record) => record.savedAt !== undefined)
            .sort((left, right) => (left.savedAt ?? 0) - (right.savedAt ?? 0))
            .map((record) => record.key);
          const request = new FakeRequest<{ primaryKey: string; continue: () => void } | null>();
          let position = 0;
          const step = () => respond(() => (position < keys.length
            ? { primaryKey: keys[position], continue: () => { position += 1; step(); } }
            : null), request);
          step();
          return request;
        },
      }),
    };
  }

  private settle() {
    this.pending -= 1;
    setTimeout(() => { if (this.pending === 0) this.oncomplete?.(); }, 0);
  }
}

const installFakeIndexedDB = () => {
  const records = new Map<string, StoredRecord>();
  const database = {
    transaction: () => new FakeTransaction(records),
    createObjectStore: () => ({ createIndex: () => undefined }),
  };
  const factory = {
    open: () => {
      const request = new FakeOpenRequest<typeof database>();
      setTimeout(() => {
        request.result = database;
        request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    },
  };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory });
  return records;
};

const indexedDBDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
let records: Map<string, StoredRecord>;

beforeEach(() => {
  resetCatalogCacheForTests();
  records = installFakeIndexedDB();
});

afterEach(() => {
  if (indexedDBDescriptor) Object.defineProperty(globalThis, 'indexedDB', indexedDBDescriptor);
  else Reflect.deleteProperty(globalThis, 'indexedDB');
});

// Records are seeded raw, the way an earlier session or build left them.
const seed = (runtimeKey: string, directoryKey: string, catalog: SeedCatalog) => {
  const key = `${runtimeKey}\n${directoryKey}`;
  records.set(key, { key, schema: CATALOG_CACHE_SCHEMA, runtimeKey, directoryKey, savedAt: 1, ...catalog });
};

const SECRET = 'sk-live-secret';

const bigPickle: Model = {
  modelId: 'big-pickle', provider: 'zen', name: 'Big Pickle', modalities: ['text', 'image'],
  contextWindow: 200_000, maxOutputTokens: 32_000, reasoningEffortSupported: true,
  reasoningOptions: [{ reasoningEffort: 'high', label: 'High', budgetTokens: null }],
  variants: [{ variant: 'high', label: 'High', reasoningEffort: 'high' }], toolsSupported: true, enabled: true, status: 'active',
  pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 2, cacheReadPerMillionTokens: 0.1, cacheWritePerMillionTokens: 0.2 },
};

const zen: CachedProvider = {
  providerId: 'zen', name: 'Zen', endpoint: null, protocol: 'chat-completions', authMethods: ['api-key'], auth: { status: 'missing' }, models: [bigPickle],
};


describe('configCatalogCache', () => {
  test('a directory with nothing cached reads as missing', async () => {
    expect(await readCachedCatalog('runtime-a', '/project')).toBeNull();
  });

  test('a written catalog reads back with what the pickers show', async () => {
    await writeCachedCatalog('runtime-a', '/project', { providers: [zen], defaultProviders: { zen: 'big-pickle' } });
    const cached = await readCachedCatalog('runtime-a', '/project');
    expect(cached?.providers?.map((entry) => entry.providerId)).toEqual(['zen']);
    const model = cached?.providers?.[0]?.models[0];
    expect(model?.name).toBe('Big Pickle');
    expect(model?.variants.map((variant) => variant.variant)).toEqual(['high']);
    expect(model?.reasoningEffortSupported).toBe(true);
    expect(model?.contextWindow).toBe(200_000);
    expect(cached?.defaultProviders).toEqual({ zen: 'big-pickle' });
    expect(cached).not.toHaveProperty('agents');
  });

  test('credentials, headers, request bodies and system prompts are never stored', async () => {
    await writeCachedCatalog('runtime-a', '/project', { providers: [zen] });
    const stored = records.get('runtime-a\n/project');
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain(SECRET);
    for (const key of ['settings', 'headers', 'body', 'request', 'system', 'apiKey', 'api_key', 'Authorization']) {
      expect(serialized).not.toContain(`"${key}"`);
    }
  });

  test('provider models and defaults written separately are kept together', async () => {
    await writeCachedCatalog('runtime-a', '/project', { providers: [zen] });
    await writeCachedCatalog('runtime-a', '/project', { defaultProviders: { zen: 'big-pickle' } });
    const cached = await readCachedCatalog('runtime-a', '/project');
    expect(cached?.providers?.map((entry) => entry.providerId)).toEqual(['zen']);
    expect(cached?.defaultProviders).toEqual({ zen: 'big-pickle' });
  });

  test('another runtime or directory never sees the record', async () => {
    await writeCachedCatalog('runtime-a', '/project', { providers: [zen] });
    expect(await readCachedCatalog('runtime-b', '/project')).toBeNull();
    expect(await readCachedCatalog('runtime-a', '/other')).toBeNull();
  });

  test('a corrupt record is not shown and is deleted', async () => {
    seed('runtime-a', '/project', { providers: [{ providerId: 7 }] });
    expect(await readCachedCatalog('runtime-a', '/project')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(records.has('runtime-a\n/project')).toBe(false);
  });

  test('a record holding fields outside the allowlist is dropped', async () => {
    await writeCachedCatalog('runtime-a', '/project', { providers: [zen] });
    const stored = records.get('runtime-a\n/project');
    const provider = stored?.providers?.[0];
    if (!stored || !provider) throw new Error('expected a stored provider');
    records.set(stored.key, { ...stored, providers: [{ ...provider, headers: { Authorization: SECRET } }] });
    expect(await readCachedCatalog('runtime-a', '/project')).toBeNull();
  });

  test('a record from an earlier schema version is dropped', async () => {
    seed('runtime-a', '/project', { schema: CATALOG_CACHE_SCHEMA - 1, agents: [{ name: 'build' }] });
    expect(await readCachedCatalog('runtime-a', '/project')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(records.has('runtime-a\n/project')).toBe(false);
  });

  test('without IndexedDB the cache is absent and writes do nothing', async () => {
    Reflect.deleteProperty(globalThis, 'indexedDB');
    resetCatalogCacheForTests();
    await writeCachedCatalog('runtime-a', '/project', { defaultProviders: { zen: 'big-pickle' } });
    expect(await readCachedCatalog('runtime-a', '/project')).toBeNull();
  });

  test('only the most recently saved directories are kept', async () => {
    for (let index = 0; index < CATALOG_CACHE_MAX_RECORDS + 3; index += 1) {
      await writeCachedCatalog('runtime-a', `/project-${index}`, { defaultProviders: { zen: 'big-pickle' } });
      // Distinct save times, so the oldest are well defined.
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(records.size).toBe(CATALOG_CACHE_MAX_RECORDS);
    expect(await readCachedCatalog('runtime-a', '/project-0')).toBeNull();
    expect(await readCachedCatalog('runtime-a', `/project-${CATALOG_CACHE_MAX_RECORDS + 2}`)).not.toBeNull();
  });
});

describe('writeCachedCatalogWhenSettled', () => {
  const manualSchedule = () => {
    const pending: Array<{ callback: () => void; delayMs: number }> = [];
    return {
      pending,
      schedule: (callback: () => void, delayMs: number) => { pending.push({ callback, delayMs }); },
    };
  };
  const settleWrites = () => new Promise((resolve) => setTimeout(resolve, 10));

  test('stores a catalog no catalog event superseded once the delay has passed', async () => {
    const { pending, schedule } = manualSchedule();
    writeCachedCatalogWhenSettled('runtime-a', '/project', { providers: [zen] }, () => false, schedule);
    await settleWrites();
    expect(records.size).toBe(0);
    expect(pending[0]?.delayMs).toBe(CATALOG_PERSIST_SETTLE_MS);
    pending[0]?.callback();
    await settleWrites();
    expect((await readCachedCatalog('runtime-a', '/project'))?.providers?.map((provider) => provider.providerId)).toEqual(['zen']);
  });

  test('never stores the partial first answer of a starting location', async () => {
    const { pending, schedule } = manualSchedule();
    let superseded = false;
    writeCachedCatalogWhenSettled('runtime-a', '/project', { providers: [zen] }, () => superseded, schedule);
    // OpenCode announces the full catalog before the delay ends.
    superseded = true;
    pending[0]?.callback();
    await settleWrites();
    expect(records.size).toBe(0);
  });
});

