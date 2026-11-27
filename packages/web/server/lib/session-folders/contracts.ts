import type { DatabaseSync } from 'node:sqlite';
import type nodeFsPromises from 'node:fs/promises';
import type nodePath from 'node:path';
import type { folderChangesBodySchema } from './folder-changes.js';
import type { Response } from '../shared/http-contracts.js';
import type { z } from 'zod';
export interface SessionFolder {
  id: string;
  name: string;
  sessionIds: string[];
  createdAt: number;
  parentId?: string | null | undefined;
}

export type SessionFoldersMap = Record<string, SessionFolder[]>;
export type FolderTombstones = Record<string, number>;
export type FolderChange = z.infer<typeof folderChangesBodySchema>['changes'][number];

export interface FolderConversionStatus {
  status: string;
  code?: string;
}

export interface StoredFolderSnapshot {
  version: 1;
  foldersMap: SessionFoldersMap;
  collapsedFolderIds: string[];
  deletedFolderIds?: FolderTombstones | undefined;
  updatedAt?: number | undefined;
}

export interface FolderSnapshot extends StoredFolderSnapshot {
  updatedAt: number;
}

export type FolderChangesResult =
  | { snapshot: StoredFolderSnapshot; changed: false }
  | { snapshot: FolderSnapshot; changed: true };

export type SessionFoldersResponse =
  | (StoredFolderSnapshot & {
    exists: boolean;
    revision?: string;
    errors?: Record<string, string>;
    conversion?: FolderConversionStatus;
  })
  | { version: 1; exists: false }
  | { error: string; code?: string | undefined }
  | { success: true; revision?: string };

type RouteResponse = Response<SessionFoldersResponse>;

type RouteHandler = (req: { body: unknown }, res: RouteResponse) => Promise<RouteResponse>;

export interface SessionFoldersApp {
  get: (path: string, handler: RouteHandler) => void;
  post: (path: string, handler: RouteHandler) => void;
  patch: (path: string, handler: RouteHandler) => void;
}

export interface SessionFoldersDependencies {
  fsPromises?: typeof nodeFsPromises;
  path?: typeof nodePath;
  openchamberDataDir: string;
  onChanged?: ((updatedAt: number) => void) | undefined;
  now?: (() => number) | undefined;
  database?: DatabaseSync | null;
  closeDatabase?: boolean;
}

export interface WrittenFolderSnapshot {
  snapshot: StoredFolderSnapshot;
  revision: string;
}

export interface SessionFoldersState {
  snapshot: StoredFolderSnapshot;
  revision: string;
  errors: Record<string, string>;
  conversion: FolderConversionStatus;
}

export interface SessionFoldersStore {
  get: () => Promise<SessionFoldersState | null>;
  save: (incoming: FolderSnapshot) => Promise<WrittenFolderSnapshot>;
  applyChanges: (changes: FolderChange[]) => Promise<WrittenFolderSnapshot>;
  convertLegacy: () => Promise<{ status: string; errors: Record<string, string>; error?: { code: string } }>;
  flush: () => Promise<void>;
  close: () => Promise<void>;
  databasePath: string;
}
