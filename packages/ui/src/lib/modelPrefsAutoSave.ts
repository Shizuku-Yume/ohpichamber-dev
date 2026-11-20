import { useUIStore } from '@/stores/useUIStore';
import { isApplyingServerSettings, updateDesktopSettings } from '@/lib/persistence';
import { subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import type { CustomProviderIcon } from '@/lib/customProviderIcons';

type ModelRef = { providerID: string; modelID: string };
type ModelPrefsPayload = {
  favoriteModels: ModelRef[];
  hiddenModels: ModelRef[];
  recentModels: ModelRef[];
  favoriteAgents: string[];
  lastUsedEfforts: Record<string, string | null>;
  customProviderIcons: Record<string, CustomProviderIcon>;
};

const refsEqual = (a: ModelRef[], b: ModelRef[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.providerID !== b[i]?.providerID) return false;
    if (a[i]?.modelID !== b[i]?.modelID) return false;
  }
  return true;
};

const stringsEqual = (a: string[], b: string[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const lastUsedEffortsEqual = (a: Record<string, string | null>, b: Record<string, string | null>): boolean => {
  if (a === b) return true;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && a[key] === b[key]);
};

const customProviderIconsEqual = (a: Record<string, CustomProviderIcon>, b: Record<string, CustomProviderIcon>): boolean => {
  if (a === b) return true;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

const snapshotModelPrefs = (): ModelPrefsPayload => {
  const state = useUIStore.getState();
  return {
    favoriteModels: state.favoriteModels,
    hiddenModels: state.hiddenModels,
    recentModels: state.recentModels,
    favoriteAgents: state.favoriteAgents,
    lastUsedEfforts: state.lastUsedEfforts,
    customProviderIcons: state.customProviderIcons,
  };
};

const modelPrefsEqual = (a: ModelPrefsPayload, b: ModelPrefsPayload): boolean => (
  refsEqual(a.favoriteModels, b.favoriteModels) &&
  refsEqual(a.hiddenModels, b.hiddenModels) &&
  refsEqual(a.recentModels, b.recentModels) &&
  stringsEqual(a.favoriteAgents, b.favoriteAgents) &&
  lastUsedEffortsEqual(a.lastUsedEfforts, b.lastUsedEfforts) &&
  customProviderIconsEqual(a.customProviderIcons, b.customProviderIcons)
);

const cloneModelPrefs = (prefs: ModelPrefsPayload): ModelPrefsPayload => ({
  favoriteModels: prefs.favoriteModels.slice(),
  hiddenModels: prefs.hiddenModels.slice(),
  recentModels: prefs.recentModels.slice(),
  favoriteAgents: prefs.favoriteAgents.slice(),
  lastUsedEfforts: { ...prefs.lastUsedEfforts },
  customProviderIcons: { ...prefs.customProviderIcons },
});

export const startModelPrefsAutoSave = () => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let lastSent: ModelPrefsPayload | null = null;

  const flush = () => {
    const payload = snapshotModelPrefs();

    if (lastSent && modelPrefsEqual(lastSent, payload)) {
      return;
    }

    lastSent = cloneModelPrefs(payload);

    void updateDesktopSettings(payload).catch(() => {});
  };

  const unsubscribeRuntime = subscribeRuntimeEndpointWillChange(() => {
    lastSent = null;
  });

  const unsubscribe = useUIStore.subscribe((state, prevState) => {
    const next = {
      favoriteModels: state.favoriteModels,
      hiddenModels: state.hiddenModels,
      recentModels: state.recentModels,
      favoriteAgents: state.favoriteAgents,
      lastUsedEfforts: state.lastUsedEfforts,
      customProviderIcons: state.customProviderIcons,
    };
    const prev = {
      favoriteModels: prevState.favoriteModels,
      hiddenModels: prevState.hiddenModels,
      recentModels: prevState.recentModels,
      favoriteAgents: prevState.favoriteAgents,
      lastUsedEfforts: prevState.lastUsedEfforts,
      customProviderIcons: prevState.customProviderIcons,
    };
    if (modelPrefsEqual(next, prev)) {
      return;
    }
    if (isApplyingServerSettings()) {
      lastSent = cloneModelPrefs(next);
      return;
    }
    flush();
  });

  return () => {
    unsubscribe();
    unsubscribeRuntime();
  };
};
