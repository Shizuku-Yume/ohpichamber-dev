import { z } from 'zod';

import { runtimeFetch } from '@/lib/runtime-fetch';

import { normalizeFilePath } from '@/lib/path-utils';

const FILE_REFERENCE_STAT_CONCURRENCY = 4;
const FILE_REFERENCE_STAT_CACHE_MAX = 1000;

const FILE_REFERENCE_STAT_CACHE = new Map<string, Promise<boolean>>();
let activeFileReferenceStatCount = 0;
const pendingFileReferenceStats: Array<() => void> = [];


const statCacheKey = (directory: string, normalizedPath: string): string => `${directory}\u0000${normalizedPath}`;

export const fileReferenceExists = (resolvedPath: string, effectiveDirectory: string): Promise<boolean> => {
  // The path is already resolved: edge spaces belong to the file's name.
  const normalizedPath = normalizeFilePath(resolvedPath, { preserveWhitespace: true });
  if (!normalizedPath) {
    return Promise.resolve(false);
  }

  const cacheKey = statCacheKey(effectiveDirectory, normalizedPath);
  const cached = FILE_REFERENCE_STAT_CACHE.get(cacheKey);
  if (cached) {
    FILE_REFERENCE_STAT_CACHE.delete(cacheKey);
    FILE_REFERENCE_STAT_CACHE.set(cacheKey, cached);
    return cached;
  }

  const request = new Promise<boolean>((resolve) => {
    const run = () => {
      activeFileReferenceStatCount += 1;
      void runtimeFetch('/api/fs/stat', {
        method: 'GET',
        query: {
          path: normalizedPath,
          optional: 'true',
          // The stat route resolves the workspace from this directory. Without
          // it the server falls back to the browsed lastDirectory, which
          // rejects session-local files with 400 whenever the two differ.
          directory: effectiveDirectory || undefined,
        },
        cache: 'no-store',
<<<<<<< HEAD
||||||| bc50ba56aa
        // The stat route resolves the workspace from this header. Without it
        // the server falls back to the browsed lastDirectory, which rejects
        // session-local files with 400 whenever the two directories differ.
        headers: effectiveDirectory ? { 'x-opencode-directory': effectiveDirectory } : undefined,
=======
        headers: effectiveDirectory ? { 'x-opencode-directory': effectiveDirectory } : undefined,
>>>>>>> upstream/main
      })
        .then(async (response) => {
          if (!response.ok) {
            resolve(false);
            return;
          }
          const payload = await response.json().catch(() => null) as { exists?: unknown } | null;
          resolve(payload?.exists !== false);
        })
        .catch(() => resolve(false))
        .finally(() => {
          activeFileReferenceStatCount = Math.max(0, activeFileReferenceStatCount - 1);
          pendingFileReferenceStats.shift()?.();
        });
    };

    if (activeFileReferenceStatCount < FILE_REFERENCE_STAT_CONCURRENCY) {
      run();
      return;
    }

    pendingFileReferenceStats.push(run);
  });

  while (FILE_REFERENCE_STAT_CACHE.size >= FILE_REFERENCE_STAT_CACHE_MAX) {
    const oldest = FILE_REFERENCE_STAT_CACHE.keys().next().value;
    if (typeof oldest !== 'string') {
      break;
    }
    FILE_REFERENCE_STAT_CACHE.delete(oldest);
  }
  FILE_REFERENCE_STAT_CACHE.set(cacheKey, request);
  return request;
};


const fileStatSchema = z.object({ exists: z.boolean().optional() });

export const checkFileReference = async (resolvedPath: string, effectiveDirectory: string): Promise<'exists' | 'missing' | 'failed'> => {
  const normalizedPath = normalizeFilePath(resolvedPath, { preserveWhitespace: true });
  try {
    const response = await runtimeFetch('/api/fs/stat', {
      method: 'GET',
      query: {
        path: normalizedPath,
        optional: 'true',
        directory: effectiveDirectory || undefined,
      },
      cache: 'no-store',
    });
    if (!response.ok) return 'failed';
    const parsed = fileStatSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) return 'failed';
    return parsed.data.exists === false ? 'missing' : 'exists';
  } catch {
    return 'failed';
  }
};

<<<<<<< HEAD
||||||| bc50ba56aa
const fileNameLookupSchema = z.object({ paths: z.array(z.string()) });

const FILE_NAME_LOOKUP_CACHE = new Map<string, Promise<string | null>>();
const FILE_NAME_LOOKUP_CACHE_MAX = 200;

/** Every workspace file called `name`; null when the request fails. */
=======
const fileNameLookupSchema = z.object({ paths: z.array(z.string()) });

const FILE_NAME_LOOKUP_CACHE = new Map<string, Promise<string | null>>();
const FILE_NAME_LOOKUP_CACHE_MAX = 200;

>>>>>>> upstream/main
export const lookupFilesByName = (name: string, effectiveDirectory: string): Promise<string[] | null> => (
  runtimeFetch('/api/fs/find-by-name', {
    method: 'GET',
    query: { name, directory: effectiveDirectory },
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const parsed = fileNameLookupSchema.safeParse(await response.json().catch(() => null));
      return parsed.success ? parsed.data.paths : null;
    })
    .catch(() => null)
);

<<<<<<< HEAD
const fileNameLookupSchema = z.object({ paths: z.array(z.string()) });

const FILE_NAME_LOOKUP_CACHE = new Map<string, Promise<string | null>>();
const FILE_NAME_LOOKUP_CACHE_MAX = 200;

/**
 * The one workspace file called `name`, for a reference an agent wrote
 * without its folder (`Renderer.tsx:42`). Answered from git's index in one
 * call per name; null when no file or several files carry the name, so an
 * ambiguous reference stays plain text instead of opening a guess.
 */
||||||| bc50ba56aa
/**
 * The one workspace file called `name`, for a reference an agent wrote
 * without its folder (`Renderer.tsx:42`). Answered from git's index in one
 * call per name; null when no file or several files carry the name, so an
 * ambiguous reference stays plain text instead of opening a guess.
 */
=======
>>>>>>> upstream/main
export const findUniqueFileByName = (name: string, effectiveDirectory: string): Promise<string | null> => {
  if (!name || !effectiveDirectory) return Promise.resolve(null);
  const cacheKey = statCacheKey(effectiveDirectory, name);
  const cached = FILE_NAME_LOOKUP_CACHE.get(cacheKey);
  if (cached) return cached;

  const request = runtimeFetch('/api/fs/find-by-name', {
    method: 'GET',
    query: { name, directory: effectiveDirectory },
    cache: 'no-store',
  })
    .then(async (response) => {
      if (!response.ok) return null;
      const parsed = fileNameLookupSchema.safeParse(await response.json().catch(() => null));
      const paths = parsed.success ? parsed.data.paths : [];
      return paths.length === 1 ? paths[0] : null;
    })
    .catch(() => null);

  while (FILE_NAME_LOOKUP_CACHE.size >= FILE_NAME_LOOKUP_CACHE_MAX) {
    const oldest = FILE_NAME_LOOKUP_CACHE.keys().next();
    if (oldest.done) break;
    FILE_NAME_LOOKUP_CACHE.delete(oldest.value);
  }
  FILE_NAME_LOOKUP_CACHE.set(cacheKey, request);
  return request;
};
