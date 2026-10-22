// The chats of deleted isolated spaces, kept on the Archive page and read-only (DESIGN.md,
// decision 9 and journey step 7). The host names each archive by the directory that holds its
// chats; this store answers, for a chat's directory, which deleted space it came from. It stays
// filled while the feature's switch is off, because those chats stay; it is runtime-scoped and
// reset when the runtime endpoint changes. The server refuses to run an archived chat whatever
// this store says; the store only lets the screen say so first.

import { create } from 'zustand';

import { normalizePath } from '@/lib/pathNormalization';

import { listSpaceArchives, type SpaceArchive } from './spaces-api';

type SpaceArchivesState = {
  /** Opaque Host-issued identity for path-free canonical sessions. */
  byWorkspaceId: ReadonlyMap<string, SpaceArchive> | null;
  /** Legacy noncanonical session fallback. */
  byDirectory: ReadonlyMap<string, SpaceArchive> | null;
  resetForRuntimeSwitch: () => void;
};

let generation = 0;
let reading: Promise<void> | null = null;

export const useSpaceArchivesStore = create<SpaceArchivesState>()((set) => ({
  byWorkspaceId: null,
  byDirectory: null,
  resetForRuntimeSwitch: () => {
    generation += 1;
    reading = null;
    set({ byWorkspaceId: null, byDirectory: null });
  },
}));

/**
 * Reads the archives again. A read that fails leaves the last answer in place, so a chat known
 * to be archived never reads as live; one a runtime switch overtook is dropped.
 */
export const refreshSpaceArchives = (): Promise<void> => {
  if (reading) return reading;
  const started = generation;
  const read = listSpaceArchives()
    .then((archives) => {
      if (started !== generation) return;
      const byDirectory = new Map<string, SpaceArchive>();
      const byWorkspaceId = new Map<string, SpaceArchive>();
      for (const archive of archives) {
        byWorkspaceId.set(archive.workspaceId, archive);
        const directory = normalizePath(archive.directory);
        if (directory) byDirectory.set(directory, archive);
      }
      useSpaceArchivesStore.setState({ byWorkspaceId, byDirectory });
    })
    .finally(() => {
      if (reading === read) reading = null;
    });
  reading = read;
  return read;
};

  if (useSpaceArchivesStore.getState().byWorkspaceId !== null) return;
export const ensureSpaceArchives = (): void => {
  if (useSpaceArchivesStore.getState().byWorkspaceId !== null) return;
};
/** The deleted space whose chats belong to a workspace or directory, or null. */
export const useSpaceArchiveOf = (directory: string | null | undefined, workspaceId?: string | null): SpaceArchive | null => {
  const key = normalizePath(directory);
  return useSpaceArchivesStore((state) =>
    (workspaceId ? state.byWorkspaceId?.get(workspaceId) : undefined) ?? (key ? state.byDirectory?.get(key) : undefined) ?? null);
};
