import { z } from 'zod';
import { spaceApiPath } from '@/lib/spaces/space-route';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { getRuntimeUrlResolver, type RuntimeUrlResolver } from '@/lib/runtime-url';

const MAX_MARKDOWN_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PREPARE_CACHE_ENTRIES = 1024;
const NON_READY_CACHE_MS = 30_000;
const GRANT_ASSET_PATH = /^\/api\/openchamber\/sessions\/[^/]+\/markdown-image-grants\/[^/]+\/raw$/;
const GrantResponseSchema = z.object({
  results: z.array(z.object({
    sourceIndex: z.number().int().nonnegative(),
    status: z.string(),
    assetPath: z.string().optional(),
    expiresAt: z.number().optional(),
  })).optional(),
});
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

export type PreparedMarkdownImage =
  | { status: 'ready'; assetPath: string; expiresAt?: number }
  | { status: 'missing' | 'error' };

type PrepareCacheEntry = {
  result: Map<string, PreparedMarkdownImage>;
  expiresAt: number;
};

const prepareCaches = new WeakMap<RuntimeUrlResolver, Map<string, PrepareCacheEntry>>();

const throwIfAborted = (signal: AbortSignal): void => {
  if (signal.aborted) throw new DOMException('Image load aborted', 'AbortError');
};

const hasImageSignature = async (blob: Blob, mimeType: string): Promise<boolean> => {
  const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  switch (mimeType) {
    case 'image/png':
      return bytes[0] === 0x89 && ascii(1, 4) === 'PNG'
        && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/gif': {
      const gif = ascii(0, 6);
      return gif === 'GIF87a' || gif === 'GIF89a';
    }
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP';
    default:
      return false;
  }
};

const validateImageBlob = async (blob: Blob, mimeType: string): Promise<void> => {
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) throw new Error('Unsupported image type');
  if (blob.size > MAX_MARKDOWN_IMAGE_BYTES) throw new Error('Image is too large');
  if (!await hasImageSignature(blob, mimeType)) throw new Error('Unsupported image data');
};

const validateDataImage = async (source: string): Promise<void> => {
  const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([\s\S]*)$/i.exec(source);
  if (!match?.[1] || match[2] === undefined) throw new Error('Invalid image data URL');
  if (match[2].length > Math.ceil(MAX_MARKDOWN_IMAGE_BYTES * 4 / 3) + 4) throw new Error('Image is too large');
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    throw new Error('Invalid image data URL');
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  await validateImageBlob(new Blob([bytes]), match[1].toLowerCase());
};

export const isLocalMarkdownImageSource = (source: string): boolean => (
  !/^(?:https?:)?\/\//i.test(source)
  && !/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(source)
);

export const prepareLocalMarkdownImages = async ({
  sources,
  directory,
  sessionId,
  messageId,
  signal,
}: {
  sources: readonly string[];
  directory: string;
  sessionId: string;
  messageId: string;
  signal: AbortSignal;
}): Promise<Map<string, PreparedMarkdownImage>> => {
  const resolver = getRuntimeUrlResolver();
  let cache = prepareCaches.get(resolver);
  if (!cache) {
    cache = new Map();
    prepareCaches.set(resolver, cache);
  }
  const key = `${sessionId}\0${messageId}\0${directory}\0${sources.join('\0')}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, cached);
    return cached.result;
  }
  if (cached) cache.delete(key);

  const response = await runtimeFetch(
    `/api/openchamber/sessions/${encodeURIComponent(sessionId)}/markdown-image-grants`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ directory, messageId, sources }),
      // The grant is issued by the server that holds the file: a space's for a space directory.
      directory,
      signal,
    },
  );
  if (!response.ok) throw new Error(`Unable to prepare images (${response.status})`);
  const parsed = GrantResponseSchema.safeParse(await response.json());
  const results = parsed.success ? parsed.data.results ?? [] : [];
  const prepared = new Map<string, PreparedMarkdownImage>();
  for (const result of results) {
    const index = result.sourceIndex;
    if (index >= sources.length) continue;
    const source = sources[index];
    if (result.status === 'ready' && result.assetPath && GRANT_ASSET_PATH.test(result.assetPath)) {
      prepared.set(source, {
        status: 'ready',
        assetPath: result.assetPath,
        expiresAt: result.expiresAt,
      });
    } else if (result.status === 'missing') {
      prepared.set(source, { status: 'missing' });
    } else {
      prepared.set(source, { status: 'error' });
    }
  }
  for (const source of sources) {
    if (!prepared.has(source)) prepared.set(source, { status: 'error' });
  }
  while (cache.size >= MAX_PREPARE_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  const allReady = [...prepared.values()].every((value) => value.status === 'ready');
  const grantExpiry = Math.min(...[...prepared.values()]
    .filter((value): value is Extract<PreparedMarkdownImage, { status: 'ready' }> => value.status === 'ready')
    .map((value) => value.expiresAt ?? Number.POSITIVE_INFINITY));
  cache.set(key, {
    result: prepared,
    expiresAt: allReady ? grantExpiry : Date.now() + NON_READY_CACHE_MS,
  });
  return prepared;
};

export const resolveMarkdownImageSource = async (
  source: string,
  signal: AbortSignal,
): Promise<string> => {
  throwIfAborted(signal);
  if (/^(?:https?:)?\/\//i.test(source)) return source;
  if (/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(source)) {
    await validateDataImage(source);
    throwIfAborted(signal);
    return source;
  }
  throw new Error('Local image has not been prepared');
};

export const getPreparedMarkdownImageUrl = (
  image: Extract<PreparedMarkdownImage, { status: 'ready' }>,
  directory: string,
): string => getRuntimeUrlResolver().authenticatedAsset(spaceApiPath(image.assetPath, directory));
