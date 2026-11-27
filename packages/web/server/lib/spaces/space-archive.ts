import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { SpaceError } from './errors.js';
import { EntityIdSchema as chatIdSchema } from '@openchamber/agent-contract';
import type { NextFunction, Request, Response } from '../shared/http-contracts.js';

export const ARCHIVE_MAX_CHATS = 1000;
const SAVE_TIMEOUT_MS = 30 * 60_000;
const TITLE_SHOWN_CHARACTERS = 200;

const spaceIdSchema = z.string().regex(/^[a-f0-9]{12}$/);

const archiveEntrySchema = z.object({
  version: z.literal(1),
  spaceId: spaceIdSchema,
  name: z.string().max(200),
  projectDirectory: z.string().nullable(),
  archivedAt: z.number().int().nonnegative(),
  chats: z.array(chatIdSchema),
});

const CHAT_ROUTES = [
  /^\/api\/session\/([^/]+)(\/.*)?$/i,
  /^\/api\/agent\/v1\/sessions\/([^/]+)(\/.*)?$/i,
  /^\/api\/experimental\/session\/([^/]+)\/.+$/i,
  /^\/api\/openchamber\/sessions\/([^/]+)\/.+$/i,
  /^\/api\/message-queue\/sessions\/([^/]+)(\/.*)?$/i,
  /^\/api\/goals\/objective\/([^/]+)$/i,
];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SESSION_DELETE = /^\/api\/(?:agent\/v1\/sessions|session)\/[^/]+$/i;

const listedTitleSchema = z.string().trim().min(1);
const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export type SpaceArchiveEntry = z.infer<typeof archiveEntrySchema>;

export interface PublicSpaceArchive {
  spaceId: string;
  name: string;
  workspaceId: string;
  archivedAt: number;
}

export interface HostSpaceArchiveCatalogEntry extends PublicSpaceArchive {
  projectDirectory: string | null;
  directory: string;
}

export interface SpaceArchiveListedChat {
  id: string;
  title?: string | null | undefined;
  parentSessionId?: string | undefined;
}

export interface SpaceArchiveListedManifest {
  chats: SpaceArchiveListedChat[];
  complete: boolean;
}

export interface SpaceArchiveChatSource {
  listChats: () => Promise<SpaceArchiveListedManifest>;
  exportChat: (chatId: string, destination: string, options: { deadline: number }) => Promise<void>;
}

export interface SpaceNativeArchiveImportInput {
  sessionId: string;
  bundlePath: string;
  directory: string;
  spaceId: string;
  archivedAt: number;
  title: string | null;
  parentSessionId: string | undefined;
  deadline: number;
}

export interface SpaceNativeArchiveClient {
  importChat: (input: SpaceNativeArchiveImportInput) => Promise<void>;
  removeChat: (sessionId: string) => Promise<void>;
}

export interface SpaceArchiveLogger {
  warn?: ((message: string) => void) | undefined;
}

export interface SpaceArchiveDependencies {
  dataDir: string;
  nativeArchive: SpaceNativeArchiveClient;
  logger?: SpaceArchiveLogger | undefined;
  now?: (() => number) | undefined;
}

export interface SaveSpaceChatsInput {
  spaceId: string;
  name: string;
  projectDirectory: string | null;
  source: SpaceArchiveChatSource;
  allowUnsaved?: boolean | undefined;
}

export interface SaveSpaceChatsResult {
  saved: number;
  tooLarge: string[];
  failed: number;
  listed: boolean;
}

const titleShown = (title: string | null | undefined): string | null => {
  const parsed = listedTitleSchema.safeParse(title);
  return parsed.success ? parsed.data.slice(0, TITLE_SHOWN_CHARACTERS) : null;
};

export function createSpaceArchive({ dataDir, nativeArchive, logger = console, now = () => Date.now() }: SpaceArchiveDependencies) {
  const root = path.join(dataDir, 'spaces', 'archive');
  const directoryOf = (spaceId: string): string => path.join(root, spaceId);
  const entryFileOf = (spaceId: string): string => path.join(root, `${spaceId}.json`);

  const readEntries = (): Map<string, SpaceArchiveEntry> => {
    let names: string[] = [];
    try {
      names = fs.readdirSync(root);
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      if (detail?.code !== 'ENOENT') logger.warn?.(`[spaces] the chat archive could not be read: ${detail?.code ?? detail?.message ?? error}`);
      return new Map();
    }
    const entries = new Map<string, SpaceArchiveEntry>();
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const entry = archiveEntrySchema.parse(JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')));
        entries.set(entry.spaceId, entry);
      } catch (error) {
        const detail = errorDetailSchema.safeParse(error).data;
        logger.warn?.(`[spaces] an archive entry could not be read: ${name}: ${detail?.code ?? 'malformed'}`);
      }
    }
    return entries;
  };

  const entries = readEntries();
  let locked = new Set<string>();
  const relock = (): void => { locked = new Set([...entries.values()].flatMap((entry) => entry.chats)); };
  relock();

  const writeEntry = (entry: SpaceArchiveEntry): void => {
    const file = entryFileOf(entry.spaceId);
    if (entry.chats.length === 0) {
      fs.rmSync(file, { force: true });
      entries.delete(entry.spaceId);
    } else {
      fs.mkdirSync(root, { recursive: true, mode: 0o700 });
      const temporary = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(entry, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, file);
      entries.set(entry.spaceId, entry);
    }
    relock();
  };

  const listArchives = (): PublicSpaceArchive[] => [...entries.values()].map((entry) => ({
    spaceId: entry.spaceId,
    name: entry.name,
    workspaceId: `archive_${entry.spaceId}`,
    archivedAt: entry.archivedAt,
  }));

  const listArchiveCatalog = (): HostSpaceArchiveCatalogEntry[] => [...entries.values()].map((entry) => ({
    spaceId: entry.spaceId,
    name: entry.name,
    workspaceId: `archive_${entry.spaceId}`,
    projectDirectory: entry.projectDirectory,
    directory: directoryOf(entry.spaceId),
    archivedAt: entry.archivedAt,
  }));

  const isArchivedChat = (id: string): boolean => locked.has(id);

  const guard = (req: Request, res: Response, next: NextFunction): void => {
    if (locked.size === 0 || READ_METHODS.has(req.method ?? '')) {
      next();
      return;
    }
    if (req.method === 'DELETE' && SESSION_DELETE.test(req.path)) {
      next();
      return;
    }
    for (const pattern of CHAT_ROUTES) {
      const match = pattern.exec(req.path);
      if (!match?.[1]) continue;
      let id = match[1];
      try {
        id = decodeURIComponent(id);
      } catch {
        id = match[1];
      }
      if (locked.has(id)) {
        const detail = 'This chat belongs to a deleted space and is read-only.';
        res.status(409).json(req.path.startsWith('/api/agent/v1/')
          ? { type: 'urn:ohpichamber:problem:SESSION_READ_ONLY', title: 'Session is read-only', status: 409, detail, code: 'SESSION_READ_ONLY', retryable: false }
          : { code: 'archived_chat_read_only', message: detail });
        return;
      }
    }
    next();
  };

  const saveChats = async ({ spaceId, name, projectDirectory, source, allowUnsaved }: SaveSpaceChatsInput): Promise<SaveSpaceChatsResult> => {
    spaceIdSchema.parse(spaceId);
    const deadline = now() + SAVE_TIMEOUT_MS;
    const earlierEntry = entries.get(spaceId);
    const earlier = earlierEntry?.chats ?? [];
    const tooLarge: string[] = [];
    let failed = 0;
    let listed: SpaceArchiveListedManifest | null = null;
    const refuse = (): SpaceError => new SpaceError('chats_not_saved', `The chats of "${name}" could not be saved.`, { name, tooLarge, failed, listed: listed !== null });
    try { listed = await source.listChats(); }
    catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      logger.warn?.(`[spaces] native archive list failed: ${detail?.code ?? detail?.message ?? error}`);
    }
    if (listed === null) {
      if (!allowUnsaved) throw refuse();
      return { saved: 0, tooLarge, failed, listed: false };
    }
    const valid = listed.chats.filter((chat) => chatIdSchema.safeParse(chat.id).success);
    failed += listed.chats.length - valid.length + Math.max(0, valid.length - ARCHIVE_MAX_CHATS);
    if (!listed.complete || new Set(valid.map((chat) => chat.id)).size !== valid.length) failed += 1;
    if (!allowUnsaved && failed) throw refuse();
    const chosen = [...new Map(valid.slice(0, ARCHIVE_MAX_CHATS).map((chat) => [chat.id, chat])).values()];
    const incoming = path.join(root, `.incoming-${spaceId}`);
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    fs.mkdirSync(incoming, { mode: 0o700 });
    const saved: string[] = [];
    const added: string[] = [];
    const directory = directoryOf(spaceId);
    const archivedAt = earlierEntry?.archivedAt ?? now();
    const entry: SpaceArchiveEntry = { version: 1, spaceId, name, projectDirectory, archivedAt, chats: earlier };
    const withChats = (chats: readonly string[]): SpaceArchiveEntry => ({ ...entry, chats: [...new Set([...earlier, ...chats])] });
    const rollback = async (): Promise<void> => {
      const errors: unknown[] = [];
      for (const id of [...added].reverse()) {
        try { await nativeArchive.removeChat(id); }
        catch (error) { errors.push(error); }
      }
      writeEntry(earlierEntry ?? withChats([]));
      if (errors.length) throw new AggregateError(errors, 'Native archive rollback failed; the space is retained');
    };
    try {
      const taken = new Map<string, SpaceArchiveListedChat & { bundlePath: string }>();
      for (const chat of chosen) {
        if (earlier.includes(chat.id)) { saved.push(chat.id); continue; }
        if (now() >= deadline) { failed += 1; continue; }
        try {
          const bundlePath = path.join(incoming, `${taken.size}.tar`);
          await source.exportChat(chat.id, bundlePath, { deadline });
          taken.set(chat.id, { ...chat, bundlePath });
        } catch (error) {
          const detail = errorDetailSchema.safeParse(error).data;
          if (detail?.code === 'chat_too_large') tooLarge.push(titleShown(chat.title) ?? chat.id);
          else failed += 1;
          logger.warn?.(`[spaces] native export ${chat.id} failed: ${detail?.code ?? detail?.message ?? error}`);
        }
      }
      if (!allowUnsaved && (failed || tooLarge.length)) throw refuse();
      writeEntry(withChats([...taken.keys()]));
      for (const [id, chat] of taken) {
        if (now() >= deadline) { failed += 1; if (!allowUnsaved) throw refuse(); continue; }
        try {
          await nativeArchive.importChat({ sessionId: id, bundlePath: chat.bundlePath, directory, spaceId, archivedAt, title: titleShown(chat.title), parentSessionId: chat.parentSessionId, deadline });
          added.push(id);
          saved.push(id);
        } catch (error) {
          failed += 1;
          const detail = errorDetailSchema.safeParse(error).data;
          logger.warn?.(`[spaces] native import ${id} failed: ${detail?.code ?? detail?.message ?? error}`);
          if (!allowUnsaved) throw refuse();
        }
      }
      writeEntry(withChats(saved));
      return { saved: saved.length, tooLarge, failed, listed: true };
    } catch (error) {
      await rollback();
      throw error;
    } finally { fs.rmSync(incoming, { recursive: true, force: true }); }
  };

  const entryForChat = (id: string): SpaceArchiveEntry | null =>
    [...entries.values()].find((entry) => entry.chats.includes(id)) ?? null;
  const ownsDirectory = (directory: string): boolean =>
    [...entries.keys()].some((id) => directoryOf(id) === directory);
  const forgetChat = (id: string): void => {
    const entry = entryForChat(id);
    if (!entry) return;
    writeEntry({ ...entry, chats: entry.chats.filter((chat) => chat !== id) });
    if (!entries.has(entry.spaceId)) fs.rmSync(directoryOf(entry.spaceId), { recursive: true, force: true });
  };
  return { guard, listArchives, listArchiveCatalog, isArchivedChat, saveChats, directoryOf, entryForChat, ownsDirectory, forgetChat };
}

export type SpaceArchive = ReturnType<typeof createSpaceArchive>;
