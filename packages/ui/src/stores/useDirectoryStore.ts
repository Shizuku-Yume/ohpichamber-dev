import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { hostFilesystem } from '@/lib/host-filesystem';
import { getNormalizedParentDirectory, normalizePath } from '@/lib/pathNormalization';
import { getDesktopHomeDirectory } from '@/lib/desktop';
import { getRuntimeKey, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { updateDesktopSettings } from '@/lib/persistence';
import { getChatsRoot, resolveChatsRootDirectory } from '@/lib/chatDirectories';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { streamDebugEnabled } from '@/stores/utils/streamDebug';
import { getDeferredSafeStorage } from './utils/safeStorage';

interface DirectoryStore {

  currentDirectory: string;
  directoryHistory: string[];
  historyIndex: number;
  homeDirectory: string;
  hasPersistedDirectory: boolean;
  isHomeReady: boolean;
  isSwitchingDirectory: boolean;

  setDirectory: (path: string, options?: { showOverlay?: boolean }) => void;
  goBack: () => void;
  goForward: () => void;
  goToParent: () => void;
  goToNoProjectDirectory: () => Promise<void>;
  synchronizeHomeDirectory: (path: string, chatsRoot?: string | null) => void;
  resetForRuntimeSwitch: () => void;
}

export const isDirectoryUnknown = (state: Pick<DirectoryStore, 'currentDirectory' | 'isHomeReady'>): boolean =>
  !state.isHomeReady && (state.currentDirectory === '/' || state.currentDirectory === '');

const noProjectDirectory = (home: string, chatsRoot: string | null | undefined): string =>
  chatsRoot || home;

/** The chats root the server names; null when it does not answer. */
const resolveChatsRoot = (): Promise<string | null> => (
  resolveChatsRootDirectory().catch(() => null)
);

let cachedHomeDirectory: string | null = null;
let homeResolveGeneration = 0;
let bootHomeFallbacksApply = true;
const safeStorage = getDeferredSafeStorage();
const persistedLastDirectory = safeStorage.getItem('lastDirectory');
const initialHasPersistedDirectory =
  typeof persistedLastDirectory === 'string' && persistedLastDirectory.length > 0;


const invalidateFileSearchCache = (scope?: string | null) => {
  try {
    useFileSearchStore.getState().invalidateDirectory(scope);
  } catch (error) {
    console.warn('Failed to invalidate file search cache:', error);
  }
};

const normalizeDirectoryPath = (value: string): string => normalizePath(value) ?? '';

const resolveTildePath = (path: string, homeDir?: string | null): string => {
  const trimmed = path.trim();
  if (!trimmed.startsWith('~')) {
    return trimmed;
  }
  if (trimmed === '~') {
    return homeDir || trimmed;
  }
  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return homeDir ? `${homeDir}${trimmed.slice(1)}` : trimmed;
  }
  return trimmed;
};

const resolveDirectoryPath = (path: string, homeDir?: string | null): string => {
  const expanded = resolveTildePath(path, homeDir);
  return normalizeDirectoryPath(expanded);
};

const getStoredHomeDirectory = (): string | null => {
  const raw = safeStorage.getItem('homeDirectory');
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  const normalized = normalizeDirectoryPath(raw);
  return normalized.length > 0 ? normalized : null;
};

const getStoredLastDirectory = (): string | null => {
  const raw = safeStorage.getItem('lastDirectory');
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }
  const normalized = normalizeDirectoryPath(raw);
  return normalized.length > 0 ? normalized : null;
};

const getProcessHomeDirectory = (): string | null => {
  if (typeof process === 'undefined') {
    return null;
  }

  const env = process?.env;
  const nodeHome = env?.HOME || env?.USERPROFILE || ((env?.HOMEDRIVE && env?.HOMEPATH) ? `${env.HOMEDRIVE}${env.HOMEPATH}` : undefined);
  if (typeof nodeHome === 'string' && nodeHome.trim().length > 0) {
    const normalized = normalizeDirectoryPath(nodeHome);
    return normalized.length > 0 ? normalized : null;
  }

  const cwd = process?.cwd?.();
  if (typeof cwd === 'string' && cwd.trim().length > 0) {
    const normalized = normalizeDirectoryPath(cwd);
    return normalized.length > 0 ? normalized : null;
  }

  return null;
};

const getHomeDirectory = () => {

  if (typeof window !== 'undefined') {
    if (cachedHomeDirectory) return cachedHomeDirectory;

    const desktopHome =
      (typeof window.__OPENCHAMBER_HOME__ === 'string' && window.__OPENCHAMBER_HOME__.length > 0
        ? window.__OPENCHAMBER_HOME__
        : null);

    if (desktopHome && desktopHome.length > 0) {
      cachedHomeDirectory = desktopHome;
      safeStorage.setItem('homeDirectory', desktopHome);
      return desktopHome;
    }

    const storedHome = getStoredHomeDirectory();
    if (storedHome) {
      cachedHomeDirectory = storedHome;
      return storedHome;
    }
  }

  const processHome = getProcessHomeDirectory();
  if (processHome) {
    return processHome;
  }
  return '/';
};


const normalizeHomeCandidate = (value?: string | null) => {
  const normalized = normalizePath(value);
  return normalized && normalized !== '/' ? normalized : null;
};

const persistResolvedHome = (resolved: string) => {
  cachedHomeDirectory = resolved;
  if (typeof window !== 'undefined') {
    safeStorage.setItem('homeDirectory', resolved);
  }
  void updateDesktopSettings({ homeDirectory: resolved });
  return resolved;
};

const initializeHomeDirectory = async () => {
  const acceptCandidate = (candidate?: string | null) => {
    const normalized = normalizeHomeCandidate(candidate);
    return normalized ? persistResolvedHome(normalized) : null;
  };

  try {
    const fsHome = await hostFilesystem.getFilesystemHome();
    const resolved = acceptCandidate(fsHome);
    if (resolved) {
      return resolved;
    }
  } catch (filesystemError) {
    console.warn('Failed to obtain filesystem home directory:', filesystemError);
  }

  if (!bootHomeFallbacksApply) {
    return '/';
  }

  try {
    const info = await hostFilesystem.getSystemInfo();
    const resolved = acceptCandidate(info?.homeDirectory);
    if (resolved) {
      return resolved;
    }
  } catch (error) {
    console.warn('Failed to get home directory from system info:', error);
  }

  try {
    const desktopHome = await getDesktopHomeDirectory();
    const resolved = acceptCandidate(desktopHome);
    if (resolved) {
      return resolved;
    }
  } catch (desktopError) {
    console.warn('Failed to obtain desktop-integrated home directory:', desktopError);
  }

  const fallback = getHomeDirectory();
  const resolvedFallback = acceptCandidate(fallback);
  if (resolvedFallback) {
    return resolvedFallback;
  }

  return fallback;
};

const initialHomeDirectory = getHomeDirectory();
const initialCurrentDirectory = (() => {
  const persisted = getStoredLastDirectory();
  if (persisted) {
    return resolveDirectoryPath(persisted, initialHomeDirectory);
  }
  // No project open: no directory until the server names the chats root
  // (noProjectDirectory). Nothing is read for an empty directory, and the app
  // stays unmounted until then because the home is not ready either.
  return '';
})();

if (initialCurrentDirectory) {
  hostFilesystem.setDirectory(initialCurrentDirectory);
}
const initialIsHomeReady = Boolean(initialHomeDirectory && initialHomeDirectory !== '/' && initialCurrentDirectory);

export const useDirectoryStore = create<DirectoryStore>()(
  devtools(
    (set, get) => ({

      currentDirectory: initialCurrentDirectory,
      directoryHistory: [initialCurrentDirectory],
      historyIndex: 0,
      homeDirectory: initialHomeDirectory,
      hasPersistedDirectory: initialHasPersistedDirectory,
      isHomeReady: initialIsHomeReady,
      isSwitchingDirectory: false,

      setDirectory: (path: string, options?: { showOverlay?: boolean }) => {
        void options;
        const homeDir = cachedHomeDirectory || get().homeDirectory || safeStorage.getItem('homeDirectory');
        const resolvedPath = resolveDirectoryPath(path, homeDir);
        if (streamDebugEnabled()) {
          console.log('[DirectoryStore] setDirectory called with path:', resolvedPath);
        }

        hostFilesystem.setDirectory(resolvedPath);
        invalidateFileSearchCache();

        set((state) => {
          const alreadyCurrent = state.directoryHistory[state.historyIndex] === resolvedPath;
          const newHistory = alreadyCurrent ? state.directoryHistory : [...state.directoryHistory.slice(0, state.historyIndex + 1), resolvedPath];

          safeStorage.setItem('lastDirectory', resolvedPath);
          void updateDesktopSettings({ lastDirectory: resolvedPath });

          return {
            currentDirectory: resolvedPath,
            directoryHistory: newHistory,
            historyIndex: alreadyCurrent ? state.historyIndex : newHistory.length - 1,
            hasPersistedDirectory: true,
            isHomeReady: true,
            isSwitchingDirectory: false,
          };
        });
      },

      goBack: () => {
        const state = get();
        if (state.historyIndex > 0) {
          const newIndex = state.historyIndex - 1;
          const newDirectory = state.directoryHistory[newIndex];

          hostFilesystem.setDirectory(newDirectory);
          invalidateFileSearchCache();

          safeStorage.setItem('lastDirectory', newDirectory);

          void updateDesktopSettings({ lastDirectory: newDirectory });

          set({
            currentDirectory: newDirectory,
            historyIndex: newIndex,
            hasPersistedDirectory: true,
            isHomeReady: true,
            isSwitchingDirectory: false,
          });
        }
      },

      goForward: () => {
        const state = get();
        if (state.historyIndex < state.directoryHistory.length - 1) {
          const newIndex = state.historyIndex + 1;
          const newDirectory = state.directoryHistory[newIndex];

          hostFilesystem.setDirectory(newDirectory);
          invalidateFileSearchCache();

          safeStorage.setItem('lastDirectory', newDirectory);

          void updateDesktopSettings({ lastDirectory: newDirectory });

          set({
            currentDirectory: newDirectory,
            historyIndex: newIndex,
            hasPersistedDirectory: true,
            isHomeReady: true,
            isSwitchingDirectory: false,
          });
        }
      },

      goToParent: () => {
        const { currentDirectory, setDirectory } = get();
        const homeDir = cachedHomeDirectory || get().homeDirectory || getHomeDirectory();

        if (currentDirectory === homeDir) {
          return;
        }
        const parent = getNormalizedParentDirectory(currentDirectory);
        if (parent) setDirectory(parent);
      },

      goToNoProjectDirectory: async () => {
        const runtimeKey = getRuntimeKey();
        const leaving = get().currentDirectory;
        const [homeDir, chatsRoot] = await Promise.all([
          cachedHomeDirectory || get().homeDirectory || initializeHomeDirectory(),
          resolveChatsRoot(),
        ]);
        if (getRuntimeKey() !== runtimeKey || get().currentDirectory !== leaving) return;
        const directory = noProjectDirectory(homeDir, chatsRoot);
        hostFilesystem.setDirectory(directory);
        invalidateFileSearchCache();
        safeStorage.removeItem('lastDirectory');
        void updateDesktopSettings({ lastDirectory: '' });
        set((state) => {
          const alreadyCurrent = state.directoryHistory[state.historyIndex] === directory;
          const newHistory = alreadyCurrent ? state.directoryHistory : [...state.directoryHistory.slice(0, state.historyIndex + 1), directory];
          return {
            currentDirectory: directory,
            directoryHistory: newHistory,
            historyIndex: alreadyCurrent ? state.historyIndex : newHistory.length - 1,
            hasPersistedDirectory: false,
            isHomeReady: true,
            isSwitchingDirectory: false,
          };
        });
      },

      synchronizeHomeDirectory: (homePath: string, chatsRoot?: string | null) => {
        const state = get();
        const resolvedHome = homePath;
        cachedHomeDirectory = resolvedHome;
        const needsUpdate = state.homeDirectory !== resolvedHome;
        const savedLastDirectory = safeStorage.getItem('lastDirectory');
        const hasSavedLastDirectory = typeof savedLastDirectory === 'string' && savedLastDirectory.length > 0;
        const fallbackDirectory = noProjectDirectory(resolvedHome, chatsRoot);
        const shouldReplaceCurrent =
          isDirectoryUnknown(state) ||
          (!hasSavedLastDirectory &&
          (
            state.currentDirectory === '/' ||
            state.currentDirectory === state.homeDirectory ||
            state.currentDirectory === getChatsRoot() ||
            !state.currentDirectory
          ));

        if (!needsUpdate && !shouldReplaceCurrent) {
          if (!state.isHomeReady) {
            set({ isHomeReady: true });
          }
          return;
        }

        const resolvedReady = typeof resolvedHome === 'string' && resolvedHome !== '' && resolvedHome !== '/';

        const resolvedCurrent = state.currentDirectory
          ? resolveDirectoryPath(state.currentDirectory, resolvedHome)
          : state.currentDirectory;
        const resolvedHistory = state.directoryHistory.map((entry) => resolveDirectoryPath(entry, resolvedHome));
        const historyChanged = resolvedHistory.some((entry, index) => entry !== state.directoryHistory[index]);
        const currentChanged = Boolean(resolvedCurrent && resolvedCurrent !== state.currentDirectory);

        // No project and no chats root: the server did not answer, as before
        // login on a server with a UI password while the home is known from
        // storage. It stays not ready, so the session gate resolves again after
        // login; marked ready, the app would work in the home all session.
        const awaitingChatsRoot = shouldReplaceCurrent && !chatsRoot;
        const updates: Partial<DirectoryStore> = {
          homeDirectory: resolvedHome,
          hasPersistedDirectory: hasSavedLastDirectory,
          isHomeReady: resolvedReady && !awaitingChatsRoot,
        };

        if (shouldReplaceCurrent) {
          updates.currentDirectory = fallbackDirectory;
          updates.directoryHistory = [fallbackDirectory];
          updates.historyIndex = 0;
          updates.isSwitchingDirectory = false;
        } else if (currentChanged || historyChanged) {
          updates.currentDirectory = resolvedCurrent as string;
          updates.directoryHistory = resolvedHistory;
          updates.historyIndex = Math.min(state.historyIndex, resolvedHistory.length - 1);
          updates.isSwitchingDirectory = false;
        }

        set(() => updates as Partial<DirectoryStore>);

        if ((shouldReplaceCurrent || currentChanged) && resolvedReady) {
          const nextDirectory = shouldReplaceCurrent ? fallbackDirectory : (resolvedCurrent as string);
          hostFilesystem.setDirectory(nextDirectory);
          invalidateFileSearchCache();
          if (!shouldReplaceCurrent) {
            safeStorage.setItem('lastDirectory', nextDirectory);
            void updateDesktopSettings({ lastDirectory: nextDirectory });
          }
        }

        void updateDesktopSettings({ homeDirectory: resolvedHome });
      },

      resetForRuntimeSwitch: () => {
        // Nothing is stored or sent: the stored last directory is the previous
        // host's to keep, and the new host's settings are not this path's.
        hostFilesystem.setDirectory(undefined);
        invalidateFileSearchCache();
        set({
          currentDirectory: '/',
          directoryHistory: ['/'],
          historyIndex: 0,
          homeDirectory: '/',
          hasPersistedDirectory: false,
          isHomeReady: false,
          isSwitchingDirectory: false,
        });
      }
    }),
    {
      name: 'directory-store'
    }
  )
);

let pendingHomeResolution: Promise<void> | null = null;

const resolveHomeDirectory = (): Promise<void> => {
  const generation = ++homeResolveGeneration;
  const resolution: Promise<void> = Promise.all([initializeHomeDirectory(), resolveChatsRoot()])
    .then(([home, chatsRoot]) => {
      if (generation !== homeResolveGeneration) return;
      useDirectoryStore.getState().synchronizeHomeDirectory(home, chatsRoot);
    })
    .finally(() => {
      if (pendingHomeResolution === resolution) pendingHomeResolution = null;
    });
  pendingHomeResolution = resolution;
  return resolution;
};

export const ensureHomeDirectoryResolved = async (): Promise<void> => {
  if (pendingHomeResolution) await pendingHomeResolution;
  if (useDirectoryStore.getState().isHomeReady) return;
  await resolveHomeDirectory();
};

if (typeof window !== 'undefined') {
  void resolveHomeDirectory();

  subscribeRuntimeEndpointChanged((detail) => {
    if (detail.runtimeKey !== detail.previousRuntimeKey) bootHomeFallbacksApply = false;
    cachedHomeDirectory = null;
    homeResolveGeneration += 1;
    queueMicrotask(() => void resolveHomeDirectory());
  });
}
