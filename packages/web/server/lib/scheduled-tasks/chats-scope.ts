import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createProjectIdFromPath } from '../projects/project-id.js';

export const CHATS_SCOPE_PUBLIC_ID = 'openchamber:chats';

export const createChatsScope = (chatsRoot: string) => {
  const root = path.resolve(chatsRoot);
  const id = createProjectIdFromPath(root);

  const contains = (directory: string): boolean => {
    const relative = path.relative(root, path.resolve(directory));
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  };

  const createChatDirectory = async (now: Date = new Date()): Promise<string> => {
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    await fs.mkdir(root, { recursive: true });
    const realRoot = await fs.realpath(root);
    const day = path.join(realRoot, date);
    await fs.mkdir(day, { recursive: true });
    const realDay = await fs.realpath(day);
    if (realDay !== day) throw new Error('Managed chat date directory is not authorized');
    const directory = path.join(realDay, `session-${crypto.randomUUID()}`);
    await fs.mkdir(directory);
    return directory;
  };

  const discardChatDirectory = (directory: string): Promise<void> => fs.rmdir(directory).catch(() => undefined);

  return {
    id,
    root,
    toStorageID: (projectID: string): string => (projectID === CHATS_SCOPE_PUBLIC_ID ? id : projectID),
    toPublicID: (projectID: string): string => (projectID === id ? CHATS_SCOPE_PUBLIC_ID : projectID),
    contains,
    createChatDirectory,
    discardChatDirectory,
  };
};

export type ScheduledChatsScope = ReturnType<typeof createChatsScope>;
