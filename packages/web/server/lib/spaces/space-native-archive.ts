import fs from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { EntityIdSchema } from '@openchamber/agent-contract';
import { z } from 'zod';
import { SpaceError } from './errors.js';

const CHAT_EXPORT_MAX_BYTES = 256 * 1024 * 1024;
export const CHAT_EXPORT_TIMEOUT_MS = 5 * 60_000;
const ManifestSchema = z.object({
  chats: z.array(z.object({ id: EntityIdSchema, title: z.string().max(4096).nullable().optional(), parentSessionId: EntityIdSchema.optional() })),
  complete: z.boolean(),
});

export type SpaceNativeArchiveManifest = z.infer<typeof ManifestSchema>;

export interface SpaceNativeArchiveRequestOptions {
  path: string;
  headers: Record<string, string>;
  timeoutMs: number;
}

export type RequestInsideSpace = (
  spaceId: string,
  options: SpaceNativeArchiveRequestOptions,
) => Promise<IncomingMessage>;

export interface SpaceNativeArchiveSourceDependencies {
  requestInside: RequestInsideSpace;
  chatMaxBytes?: number | undefined;
  chatTimeoutMs?: number | undefined;
  now?: (() => number) | undefined;
}

export interface ExportChatOptions {
  deadline?: number | undefined;
}

export function createSpaceNativeArchiveSource({
  requestInside,
  chatMaxBytes = CHAT_EXPORT_MAX_BYTES,
  chatTimeoutMs = CHAT_EXPORT_TIMEOUT_MS,
  now = () => Date.now(),
}: SpaceNativeArchiveSourceDependencies) {
  const request = async (spaceId: string, suffix: string, timeoutMs: number, accept: string): Promise<IncomingMessage> => {
    const response = await requestInside(spaceId, { path: `/api/openchamber/space/archive/${suffix}`, headers: { accept }, timeoutMs });
    if (response.statusCode !== 200) {
      response.destroy();
      throw new SpaceError('chat_export_failed', `The space answered ${response.statusCode} for the native archive`);
    }
    return response;
  };
  const listChats = async (spaceId: string): Promise<SpaceNativeArchiveManifest> => {
    const response = await request(spaceId, 'manifest', chatTimeoutMs, 'application/json');
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => response.destroy(new SpaceError('chat_export_timed_out', 'The archive list did not arrive in time')), chatTimeoutMs);
    try {
      for await (const rawChunk of response) {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(String(rawChunk));
        size += chunk.length;
        if (size > chatMaxBytes) throw new SpaceError('chat_too_large', 'The native archive list is too large');
        chunks.push(chunk);
      }
      const manifest = ManifestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      if (new Set(manifest.chats.map((chat) => chat.id)).size !== manifest.chats.length) throw new SpaceError('chat_export_failed', 'The native archive list contains duplicate identities');
      return manifest;
    } finally { clearTimeout(timer); response.destroy(); }
  };
  const exportChat = async (spaceId: string, chatId: string, destination: string, { deadline = Infinity }: ExportChatOptions = {}): Promise<void> => {
    const id = EntityIdSchema.parse(chatId);
    const remaining = deadline - now();
    const timeoutMs = Math.min(chatTimeoutMs, remaining);
    if (timeoutMs <= 0) throw new SpaceError('chat_export_timed_out', 'The native archive deadline expired');
    const response = await request(spaceId, `sessions/${encodeURIComponent(id)}`, timeoutMs, 'application/x-tar');
    let size = 0;
    const bounded = new Transform({
      transform(rawChunk, _encoding, callback) {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(String(rawChunk));
        size += chunk.length;
        callback(size > chatMaxBytes ? new SpaceError('chat_too_large', `The native bundle exceeds ${chatMaxBytes} bytes`) : null, chunk);
      },
    });
    const bodyRemaining = deadline - now();
    if (bodyRemaining <= 0) { response.destroy(); throw new SpaceError('chat_export_timed_out', 'The native archive deadline expired'); }
    const timer = setTimeout(() => response.destroy(new SpaceError('chat_export_timed_out', 'The native bundle did not arrive in time')), bodyRemaining);
    try { await pipeline(response, bounded, fs.createWriteStream(destination, { flags: 'wx', mode: 0o600 })); }
    catch (error) { fs.rmSync(destination, { force: true }); throw error; }
    finally { clearTimeout(timer); }
  };
  return { listChats, exportChat };
}
