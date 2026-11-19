import { create } from 'zustand';
import type { UpdateInfo, UpdateProgress } from '@/lib/desktop';
import {
  checkForDesktopUpdates,
  downloadDesktopUpdate,
  restartToApplyUpdate,
  isElectronShell,
} from '@/lib/desktop';
import { formatMessage, useI18nStore } from '@/lib/i18n/store';
import { getUpdateInstallErrorMessage } from '@/lib/updateInstallError';
import { getUpdateCheckErrorMessage } from '@/lib/updateCheckError';

type UpdateState = {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  installing: boolean;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
  /** The desktop app is the only runtime that updates itself in place. */
  runtimeType: 'desktop' | null;
  lastChecked: number | null;
};

interface UpdateStore extends UpdateState {
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  restartToUpdate: () => Promise<void>;
  dismiss: () => void;
  reset: () => void;
}

const initialState: UpdateState = {
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  installing: false,
  info: null,
  progress: null,
  error: null,
  runtimeType: null,
  lastChecked: null,
};

/**
 * The desktop app's own update, checked against its GitHub Releases feed
 * through the Electron updater. Other runtimes install updates outside the
 * app, so they never set an update here.
 */
export const useUpdateStore = create<UpdateStore>()((set, get) => ({
  ...initialState,

  checkForUpdates: async () => {
    if (!isElectronShell()) return;

    set({ checking: true, error: null, runtimeType: 'desktop' });

    try {
      const info = await checkForDesktopUpdates();
      if (!info) {
        throw new Error(formatMessage(useI18nStore.getState().dictionary, 'updateDialog.error.restartUnavailable'));
      }
      const previousVersion = get().info?.version ?? null;
      const offeredVersion = info.version ?? null;
      const versionChanged =
        previousVersion !== null &&
        offeredVersion !== null &&
        previousVersion !== offeredVersion;
      set({
        checking: false,
        available: info.available,
        info,
        lastChecked: Date.now(),
        ...(!info.available || versionChanged
          ? { downloaded: false, progress: null }
          : {}),
      });
    } catch (error) {
      set({
        checking: false,
        error: error instanceof Error ? getUpdateCheckErrorMessage(error) : 'Failed to check for updates',
      });
    }
  },

  downloadUpdate: async () => {
    const { available, runtimeType, downloading } = get();

    if (runtimeType !== 'desktop' || !available || downloading) {
      return;
    }

    set({ downloading: true, error: null, progress: null });

    try {
      const desktopInfo = await checkForDesktopUpdates();
      if (!desktopInfo?.available) {
        throw new Error('Update detected, but desktop package is not ready yet. Retry in a moment.');
      }

      set((state) => ({
        info: state.info
          ? {
            ...state.info,
            ...desktopInfo,
            body: state.info.body || desktopInfo.body,
            available: state.info.available,
          }
          : desktopInfo,
      }));

      const ok = await downloadDesktopUpdate((progress) => {
        if (get().info?.version === desktopInfo.version && get().available) set({ progress });
      });
      if (!ok) {
        throw new Error('Desktop update only works on Local instance');
      }
      const stillOffered = get().available && get().info?.version === desktopInfo.version;
      set({ downloading: false, downloaded: stillOffered, ...(stillOffered ? {} : { progress: null }) });
    } catch (error) {
      set({
        downloading: false,
        error: error instanceof Error ? error.message : 'Failed to download update',
      });
    }
  },

  restartToUpdate: async () => {
    const { downloaded, installing, runtimeType } = get();

    if (runtimeType !== 'desktop' || !downloaded || installing) {
      return;
    }

    set({ error: null, installing: true });

    try {
      const ok = await restartToApplyUpdate();
      if (!ok) {
        throw new Error(formatMessage(useI18nStore.getState().dictionary, 'updateDialog.error.restartUnavailable'));
      }
    } catch (error) {
      set({ installing: false, error: getUpdateInstallErrorMessage(error instanceof Error ? error : new Error(String(error))) });
    }
  },

  dismiss: () => {
    set({ available: false, downloaded: false, installing: false, info: null });
  },

  reset: () => {
    set(initialState);
  },
}));
