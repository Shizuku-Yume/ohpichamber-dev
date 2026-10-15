// Host-owned deleted-space catalog and opaque native transfer orchestration. The Bun Agent
// Service owns transcript packaging, import, cold projection and immutable provenance.

import fs from 'node:fs';
import path from 'node:path';

import { z } from 'zod';

import { SpaceError } from './errors.js';
import { EntityIdSchema as chatIdSchema } from '@openchamber/agent-contract';

// The maintainer's call of 2026-09-30: at most this many chats of one space go to the archive.
export const ARCHIVE_MAX_CHATS = 1000;
// All the chats of one space are taken out within this, however slowly the space answers; the
// rest counts as not saved, so a space cannot hold its own delete.
const SAVE_TIMEOUT_MS = 30 * 60_000;
// A title from a space is shown as text; this much of it is enough to name the chat.
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

// A request that would run or change a chat, by the session id in its path. Reads pass, and so
// does `DELETE /api/session/<id>`, which is how the user deletes an archived chat.
const CHAT_ROUTES = [
  /^\/api\/session\/([^/]+)(\/.*)?$/i,
  /^\/api\/agent\/v1\/sessions\/([^/]+)(\/.*)?$/i,
  /^\/api\/experimental\/session\/([^/]+)\/.+$/i,
  /^\/api\/openchamber\/sessions\/([^/]+)\/.+$/i,
  /^\/api\/message-queue\/sessions\/([^/]+)(\/.*)?$/i,
  /^\/api\/goals\/objective\/([^/]+)$/i,
  /^\/api\/permission-auto-accept\/sessions\/([^/]+)$/i,
];
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SESSION_DELETE = /^\/api\/(?:agent\/v1\/sessions|session)\/[^/]+$/i;

const listedTitleSchema = z.string().trim().min(1);
/** A listed chat's title, from the space, cut to what names it; null when it has none. */
const titleShown = (title) => {
  const parsed = listedTitleSchema.safeParse(title);
  return parsed.success ? parsed.data.slice(0, TITLE_SHOWN_CHARACTERS) : null;
};

/** nativeArchive owns service import plus Host scope/metadata registration atomically. */
export function createSpaceArchive({ dataDir, nativeArchive, logger = console, now = () => Date.now() }) {
  const root = path.join(dataDir, 'spaces', 'archive');
  const directoryOf = (spaceId) => path.join(root, spaceId);
  const entryFileOf = (spaceId) => path.join(root, `${spaceId}.json`);

  /** Every archive the data directory holds; a file that cannot be read is skipped and logged. */
  const readEntries = () => {
    let names = [];
    try {
      names = fs.readdirSync(root);
    } catch (error) {
      if (error?.code !== 'ENOENT') logger.warn?.(`[spaces] the chat archive could not be read: ${error?.code ?? error?.message ?? error}`);
      return new Map();
    }
    const entries = new Map();
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      try {
        const entry = archiveEntrySchema.parse(JSON.parse(fs.readFileSync(path.join(root, name), 'utf8')));
        entries.set(entry.spaceId, entry);
      } catch (error) {
        logger.warn?.(`[spaces] an archive entry could not be read: ${name}: ${error?.code ?? 'malformed'}`);
      }
    }
    return entries;
  };

  const entries = readEntries();
  let locked = new Set();
  const relock = () => { locked = new Set([...entries.values()].flatMap((entry) => entry.chats)); };
  relock();

  /** Keeps an archive's entry, or drops it when it holds no chat, and the guard follows at once. */
  const writeEntry = (entry) => {
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

  /** Path-free public archive DTO; only an opaque workspace identity crosses the Host boundary. */
  const listArchives = () => [...entries.values()].map((entry) => ({
    spaceId: entry.spaceId,
    name: entry.name,
    workspaceId: `archive_${entry.spaceId}`,
    archivedAt: entry.archivedAt,
  }));

  /** Private Host admission catalog; never return this object from an HTTP route. */
  const listArchiveCatalog = () => [...entries.values()].map((entry) => ({
    spaceId: entry.spaceId,
    name: entry.name,
    workspaceId: `archive_${entry.spaceId}`,
    projectDirectory: entry.projectDirectory,
    directory: directoryOf(entry.spaceId),
    archivedAt: entry.archivedAt,
  }));

  const isArchivedChat = (id) => locked.has(id);

  /**
   * Express middleware, before every route that acts on a session: an archived chat is read-only.
   * The id is compared decoded, as the route behind it decodes it, so `ses%5F...` is the same chat.
   */
  const guard = (req, res, next) => {
    if (locked.size === 0 || READ_METHODS.has(req.method)) return next();
    if (req.method === 'DELETE' && SESSION_DELETE.test(req.path)) return next();
    for (const pattern of CHAT_ROUTES) {
      const match = pattern.exec(req.path);
      if (!match) continue;
      let id = match[1];
      try {
        id = decodeURIComponent(id);
      } catch {
        // Not a valid encoding: the route behind refuses it as well, and it names no chat here.
      }
      if (locked.has(id)) {
        const detail = 'This chat belongs to a deleted space and is read-only.';
        res.status(409).json(req.path.startsWith('/api/agent/v1/')
          ? { type: 'urn:ohpichamber:problem:SESSION_READ_ONLY', title: 'Session is read-only', status: 409, detail, code: 'SESSION_READ_ONLY', retryable: false }
          : { code: 'archived_chat_read_only', message: detail });
        return undefined;
      }
    }
    return next();
  };

  /** Save opaque native bundles; no container teardown is authorized on an unsaved refusal. */
  const saveChats = async ({ spaceId, name, projectDirectory, source, allowUnsaved }) => {
    spaceIdSchema.parse(spaceId);
    const deadline = now() + SAVE_TIMEOUT_MS;
    const earlierEntry = entries.get(spaceId);
    const earlier = earlierEntry?.chats ?? [];
    const tooLarge = [];
    let failed = 0;
    let listed = null;
    const refuse = () => new SpaceError('chats_not_saved', `The chats of "${name}" could not be saved.`, { name, tooLarge, failed, listed: listed !== null });
    try { listed = await source.listChats(); }
    catch (error) { logger.warn?.(`[spaces] native archive list failed: ${error?.code ?? error?.message ?? error}`); }
    if (listed === null) {
      if (!allowUnsaved) throw refuse();
      return { saved: 0, tooLarge, failed, listed: false };
    }
    const valid = listed.chats.filter(chat => chatIdSchema.safeParse(chat.id).success);
    failed += listed.chats.length - valid.length + Math.max(0, valid.length - ARCHIVE_MAX_CHATS);
    if (!listed.complete || new Set(valid.map(chat => chat.id)).size !== valid.length) failed += 1;
    if (!allowUnsaved && failed) throw refuse();
    const chosen = [...new Map(valid.slice(0, ARCHIVE_MAX_CHATS).map(chat => [chat.id, chat])).values()];
    const incoming = path.join(root, `.incoming-${spaceId}`);
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    // A stale or concurrent save is not permission to destroy another transfer's files.
    fs.mkdirSync(incoming, { mode: 0o700 });
    const saved = [];
    const added = [];
    const directory = directoryOf(spaceId);
    const archivedAt = earlierEntry?.archivedAt ?? now();
    const entry = { version: 1, spaceId, name, projectDirectory, archivedAt, chats: earlier };
    const withChats = chats => ({ ...entry, chats: [...new Set([...earlier, ...chats])] });
    const rollback = async () => {
      const errors = [];
      for (const id of [...added].reverse()) {
        try { await nativeArchive.removeChat(id); }
        catch (error) { errors.push(error); }
      }
      writeEntry(earlierEntry ?? withChats([]));
      if (errors.length) throw new AggregateError(errors, 'Native archive rollback failed; the space is retained');
    };
    try {
      const taken = new Map();
      for (const chat of chosen) {
        if (earlier.includes(chat.id)) { saved.push(chat.id); continue; }
        if (now() >= deadline) { failed += 1; continue; }
        try {
          const bundlePath = path.join(incoming, `${taken.size}.tar`);
          await source.exportChat(chat.id, bundlePath, { deadline });
          taken.set(chat.id, { ...chat, bundlePath });
        } catch (error) {
          if (error?.code === 'chat_too_large') tooLarge.push(titleShown(chat.title) ?? chat.id);
          else failed += 1;
          logger.warn?.(`[spaces] native export ${chat.id} failed: ${error?.code ?? error?.message ?? error}`);
        }
      }
      if (!allowUnsaved && (failed || tooLarge.length)) throw refuse();
      // Catalog admission precedes service registration; only this Host-selected root is admitted.
      writeEntry(withChats([...taken.keys()]));
      for (const [id, chat] of taken) {
        if (now() >= deadline) { failed += 1; if (!allowUnsaved) throw refuse(); continue; }
        try {
          await nativeArchive.importChat({ sessionId: id, bundlePath: chat.bundlePath, directory, spaceId, archivedAt, title: titleShown(chat.title), parentSessionId: chat.parentSessionId, deadline });
          // Record ownership immediately, before the Host catalog commit can fail.
          added.push(id);
          saved.push(id);
        } catch (error) {
          failed += 1;
          logger.warn?.(`[spaces] native import ${id} failed: ${error?.code ?? error?.message ?? error}`);
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

  const entryForChat = id => [...entries.values()].find(entry => entry.chats.includes(id)) ?? null;
  const ownsDirectory = directory => [...entries.keys()].some(id => directoryOf(id) === directory);
  const forgetChat = id => {
    const entry = entryForChat(id);
    if (!entry) return;
    writeEntry({ ...entry, chats: entry.chats.filter(chat => chat !== id) });
    if (!entries.has(entry.spaceId)) fs.rmSync(directoryOf(entry.spaceId), { recursive: true, force: true });
  };
  return { guard, listArchives, listArchiveCatalog, isArchivedChat, saveChats, directoryOf, entryForChat, ownsDirectory, forgetChat };
}
