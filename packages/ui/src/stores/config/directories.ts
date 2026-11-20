import { hostFilesystem } from "@/lib/host-filesystem";
import { useDirectoryStore } from "@/stores/useDirectoryStore";
import { normalizePath } from "@/lib/pathNormalization";

export const DIRECTORY_KEY_GLOBAL = "__global__";
export const toDirectoryKey = (directory: string | null | undefined): string => {
    const trimmed = typeof directory === 'string' ? directory.trim() : '';
    return trimmed.length > 0 ? trimmed : DIRECTORY_KEY_GLOBAL;
};
export const fromDirectoryKey = (key: string): string | null => key === DIRECTORY_KEY_GLOBAL ? null : key;

/**
  * The synchronous catalog the first render may paint. It is derived from the
  * same runtime identity and active directory key the store starts with, so a
  * smoke test that prepopulates storage sees the picker filled on the first
  * render instead of one loading frame.
  */
export const resolveInitialDirectoryKey = (): string => {
    if (typeof window === 'undefined') {
        return DIRECTORY_KEY_GLOBAL;
    }
    const directory = hostFilesystem.getDirectory() ?? useDirectoryStore.getState().currentDirectory;
    return toConfigDirectoryKey(directory);
};

// Persisted worktree→project mapping for project-level defaults. Config catalogs
// themselves are scoped to the worktree's own directory.
export const normalizeConfigPath = (value: string | null | undefined): string | null => {
    const result = normalizePath(value);
    if (result === null) return null;
    return result || '/';
};
export const resolveConfigDirectory = normalizeConfigPath;
export const toConfigDirectoryKey = (directory: string | null | undefined): string => toDirectoryKey(resolveConfigDirectory(directory));

// Runtime freshness tracking (NOT persisted) for the stale-while-revalidate
// background refresh, keyed by config-directory key. Prevents re-fetching
// catalogs we just loaded for the same project or worktree.
