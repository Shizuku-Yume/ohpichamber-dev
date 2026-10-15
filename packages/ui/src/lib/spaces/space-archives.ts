// The chats of deleted isolated spaces, kept on the Archive page and read-only (DESIGN.md,
// decision 9 and journey step 7). The host identifies each archive by workspace ID; this store
// answers which deleted space a chat belongs to. It stays filled while the feature's switch is off,
// because those chats stay; it is runtime-scoped and reset when the runtime endpoint changes. The
// server refuses to run an archived chat whatever this store says; the store only lets the screen
// say so first.

import { create } from 'zustand';

import { listSpaceArchives, type SpaceArchive } from './spaces-api';

type SpaceArchivesState = {
  /** By stable workspace identity; null until the host answered once for this runtime. */
  byWorkspaceId: ReadonlyMap<string, SpaceArchive> | null;
  resetForRuntimeSwitch: () => void;
};

let generation = 0;
let reading: Promise<void> | null = null;

export const useSpaceArchivesStore = create<SpaceArchivesState>()((set) => ({
  byWorkspaceId: null,
  resetForRuntimeSwitch: () => {
    generation += 1;
    reading = null;
    set({ byWorkspaceId: null });
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
      const byWorkspaceId = new Map<string, SpaceArchive>();
      for (const archive of archives) byWorkspaceId.set(archive.workspaceId, archive);
      useSpaceArchivesStore.setState({ byWorkspaceId });
    })
    .finally(() => {
      if (reading === read) reading = null;
    });
  reading = read;
  return read;
};

/** Reads the archives once for this runtime, when nothing has been read yet; a failure is left for the next call. */
export const ensureSpaceArchives = (): void => {
  if (useSpaceArchivesStore.getState().byWorkspaceId !== null) return;
  void refreshSpaceArchives().catch(() => {});
};

/** The deleted space that owns this workspace's chats, or null. */
export const useSpaceArchiveOf = (workspaceId: string | null | undefined): SpaceArchive | null =>
  useSpaceArchivesStore((state) => (workspaceId ? state.byWorkspaceId?.get(workspaceId) ?? null : null));
