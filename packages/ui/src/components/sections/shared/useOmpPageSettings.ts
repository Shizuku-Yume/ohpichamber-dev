import React from 'react';
import type {
  OmpSetting,
  OmpSettingsChange,
  OmpSettingsState,
  OmpSettingValue,
} from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';

export interface UseOmpPageSettingsResult {
  readonly state: OmpSettingsState | null;
  readonly form: Record<string, OmpSettingValue>;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly pageSettings: readonly OmpSetting[];
  readonly getSectionSettings: (section: string) => readonly OmpSetting[];
  readonly updateSetting: (settingOrId: OmpSetting | string, value: OmpSettingValue) => Promise<void>;
  readonly updateSettings: (changes: (state: OmpSettingsState) => OmpSettingsChange[]) => Promise<boolean>;
}

type SettingsScope = {
  directory: string;
  abort: AbortController;
  state: OmpSettingsState | null;
  tail: Promise<unknown>;
  pending: number;
};

type PendingValue = { scope: SettingsScope; value: OmpSettingValue };

/**
 * Loads, filters and updates OMP settings placed on a specific OpenChamber page.
 * Serializes writes and reapplies their intent to the latest snapshot on a CAS conflict.
 */
export function useOmpPageSettings(page: string): UseOmpPageSettingsResult {
  const directory = useSettingsDirectory();
  const [loaded, setLoaded] = React.useState<{ directory: string; state: OmpSettingsState | null } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [pendingValues, setPendingValues] = React.useState<Record<string, PendingValue>>({});
  const scopeRef = React.useRef<SettingsScope | null>(null);
  const state = loaded?.directory === directory ? loaded.state : null;
  const loading = Boolean(directory && loaded?.directory !== directory);
  const form = React.useMemo(() => {
    const values = Object.fromEntries(state?.settings.map((setting) => [setting.id, setting.value]) ?? []);
    for (const [id, pending] of Object.entries(pendingValues)) {
      if (pending.scope.directory === directory && !pending.scope.abort.signal.aborted) values[id] = pending.value;
    }
    return values;
  }, [directory, pendingValues, state]);

  React.useEffect(() => {
    setLoaded(null);
    setSaving(false);
    setPendingValues({});
    if (!directory) return;
    const abort = new AbortController();
    const scope: SettingsScope = { directory, abort, state: null, tail: Promise.resolve(), pending: 0 };
    scopeRef.current = scope;
    void (async () => {
      try {
        const workspace = await canonicalClient.resolveWorkspace(directory, { signal: abort.signal });
        if (abort.signal.aborted) return;
        const snapshot = await canonicalClient.getOmpSettings(workspace.workspaceId, abort.signal);
        if (abort.signal.aborted) return;
        scope.state = snapshot;
        setLoaded({ directory, state: snapshot });
      } catch (err) {
        if (abort.signal.aborted) return;
        console.warn(`Failed to load OMP settings for page ${page}:`, err);
        setLoaded({ directory, state: null });
      }
    })();
    return () => {
      scopeRef.current = null;
      abort.abort();
    };
  }, [directory, page]);

  const updateSettings = React.useCallback(
    async (makeChanges: (state: OmpSettingsState) => OmpSettingsChange[]) => {
      const scope = scopeRef.current;
      if (!scope?.state || scope.directory !== directory) return false;
      const { signal } = scope.abort;
      scope.pending += 1;
      setSaving(true);
      const publish = (next: OmpSettingsState) => {
        scope.state = next;
        if (!signal.aborted) setLoaded({ directory: scope.directory, state: next });
      };
      const write = (source: OmpSettingsState) => canonicalClient.updateOmpSettings(source.workspaceId, {
        expectedRevision: source.revision,
        changes: makeChanges(source),
      });
      const result = scope.tail.then(async () => {
        const current = scope.state;
        if (!current) return false;
        try {
          let next: OmpSettingsState;
          try {
            next = await write(current);
          } catch (error) {
            if (!(error instanceof CanonicalApiError) || error.problem.status !== 409) throw error;
            const latest = await canonicalClient.getOmpSettings(current.workspaceId);
            publish(latest);
            next = await write(latest);
          }
          publish(next);
          return !signal.aborted;
        } catch (error) {
          if (!signal.aborted) console.warn('Failed to persist OMP settings:', error);
          return false;
        }
      }).finally(() => {
        scope.pending -= 1;
        if (scope.pending === 0 && !signal.aborted) setSaving(false);
      });
      scope.tail = result;
      return result;
    },
    [directory],
  );

  const updateSetting = React.useCallback(async (settingOrId: OmpSetting | string, value: OmpSettingValue) => {
    const scope = scopeRef.current;
    if (!scope?.state || scope.directory !== directory) return;
    const id = typeof settingOrId === 'string' ? settingOrId : settingOrId.id;
    const pending = { scope, value };
    setPendingValues((values) => ({ ...values, [id]: pending }));
    await updateSettings(() => [{ id, value }]);
    if (!scope.abort.signal.aborted) {
      setPendingValues((values) => {
        if (values[id] !== pending) return values;
        const next = { ...values };
        delete next[id];
        return next;
      });
    }
  }, [directory, updateSettings]);

  const pageSettings = React.useMemo(() => {
    if (!state) return [];
    return state.settings.filter(
      (s) => s.placement?.type === 'page' && s.placement.page === page,
    );
  }, [state, page]);

  const getSectionSettings = React.useCallback(
    (section: string) => {
      return pageSettings.filter((s) => s.placement.type === 'page' && s.placement.section === section);
    },
    [pageSettings],
  );

  return {
    state,
    form,
    loading,
    saving,
    pageSettings,
    getSectionSettings,
    updateSetting,
    updateSettings,
  };
}
