import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const tagSchema = z.object({ tag: z.string().min(1).max(512), nativeTag: z.string().min(1).max(512), sessionId: z.string().max(128).nullable(), at: z.number().finite() });
type PushTag = z.infer<typeof tagSchema>;
interface PushTagsState { version: 1; tags: PushTag[]; }
interface PushTagsStore { read(): Promise<PushTagsState>; write(state: PushTagsState): Promise<void>; }
const MAX_TAGS = 500;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function createPushTagsStore(filePath: string): PushTagsStore {
  return {
    async read() {
      try {
        const state = z.object({ version: z.literal(1), tags: z.array(z.unknown()) }).parse(JSON.parse(await readFile(filePath, 'utf8')));
        const tags = state.tags.flatMap((value) => {
          const parsed = tagSchema.safeParse(value);
          if (parsed.success) return [parsed.data];
          console.warn('[notifications] Ignoring invalid persisted push tag');
          return [];
        });
        return { version: 1, tags };
      }
      catch (error) {
        if (z.object({ code: z.literal('ENOENT') }).safeParse(error).success) return { version: 1, tags: [] };
        throw error;
      }
    },
    async write(state) {
      await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
      const temporary = `${filePath}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
        await rename(temporary, filePath);
      } finally { await rm(temporary, { force: true }); }
    },
  };
}

export function createPushTagTracker({ store = null, now = Date.now, logger = console }: { store?: PushTagsStore | null; now?: () => number; logger?: Pick<Console, 'warn'> } = {}) {
  const tags = new Map<string, PushTag>();
  let readable = true;
  const prune = () => {
    for (const [key, value] of tags) if (now() - value.at > MAX_AGE_MS || value.at > now()) tags.delete(key);
    for (const key of tags.keys()) {
      if (tags.size <= MAX_TAGS) break;
      tags.delete(key);
    }
  };
  let queue = Promise.resolve().then(async () => {
    if (!store) return;
    try {
      const state = z.object({ version: z.literal(1), tags: z.array(z.unknown()) }).parse(await store.read());
      const valid = state.tags.flatMap((value) => {
        const parsed = tagSchema.safeParse(value);
        if (parsed.success) return [parsed.data];
        logger.warn('[notifications] Ignoring invalid persisted push tag');
        return [];
      }).sort((left, right) => left.at - right.at);
      for (const value of valid) tags.set(value.tag, value);
      prune();
    } catch {
      readable = false;
      logger.warn('[notifications] Push tags could not be restored; persistence disabled until restart');
    }
  });
  const mutate = <T>(update: () => T): Promise<T> => {
    const result = queue.then(async () => {
      prune();
      const value = update();
      prune();
      if (store && readable) {
        try { await store.write({ version: 1, tags: [...tags.values()] }); }
        catch { logger.warn('[notifications] Push tags could not be persisted'); }
      }
      return value;
    });
    queue = result.then(() => {}, () => {});
    return result;
  };
  return {
    add: (tag: string, nativeTag: string, sessionId: string | null) => mutate(() => {
      tags.delete(tag);
      tags.set(tag, { tag, nativeTag, sessionId, at: now() });
      prune();
      return tags.size;
    }),
    remove: (tag: string) => mutate(() => { tags.delete(tag); }),
    clearSession: (sessionId: string) => mutate(() => {
      const cleared = [...tags.values()].filter((value) => value.sessionId === sessionId);
      for (const value of cleared) tags.delete(value.tag);
      return { tags: cleared.map((value) => value.nativeTag), badge: tags.size };
    }),
    clearAll: () => mutate(() => { tags.clear(); }),
  };
}
