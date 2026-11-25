import React from 'react';
import {
  type OmpSetting,
  type OmpSettingValue,
  type OmpSettingsChange,
  type OmpSettingsState,
} from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { SortableTabsStrip, type SortableTabsStripItem } from '@/components/ui/sortable-tabs-strip';
import {
  SettingsSection,
  SETTINGS_HELPER_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  AUTOSAVE_SAVED,
  AUTOSAVE_UNCHANGED,
  autosaveFailed,
  useAutosave,
  type AutosaveResult,
} from '@/components/sections/shared/SettingsAutosave';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { OmpReadSummaryPresetRow } from '@/components/sections/shared/OmpReadSummaryPresetRow';
import { Icon } from '@/components/icon/Icon';
import { OmpResetCreditSettings } from './OmpResetCreditSettings';
import {
  OMP_SETTINGS_LAYOUT,
  READ_SUMMARY_PRESET_SETTING_IDS,
  isPresetEntry,
  useOmpSettingsTabStore,
  type OmpLayoutEntry,
  type OmpSettingsTab,
} from './ompSettingsLayout';

type Values = Record<string, OmpSettingValue>;

/**
 * Settings → OMP. Four tabs split what used to be one 93-row wall: the switches
 * a session starts with, editing and reading, execution and tools, and the
 * internal tuning that used to be mixed in. `ompSettingsLayout.ts` owns the
 * order; the tab lives in its store, so a search result can open the tab that
 * holds its target before the page highlights it.
 */
export const OmpSettingsPage: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const files = useRuntimeAPIs().files;
  const tab = useOmpSettingsTabStore((state) => state.tab);
  const setTab = useOmpSettingsTabStore((state) => state.setTab);
  const [state, setState] = React.useState<OmpSettingsState | null>(null);
  const [form, setForm] = React.useState<Values>({});
  const [loading, setLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [reload, setReload] = React.useState(0);
  // The catalog loader already read this directory's models; fetching them
  // again here duplicated the slowest request the page made.
  const savedRef = React.useRef<OmpSettingsState | null>(null);
  const scopeGeneration = React.useRef(0);

  React.useEffect(() => {
    if (!directory) {
      savedRef.current = null;
      setState(null);
      setLoading(false);
      setLoadFailed(false);
      return;
    }
    const abort = new AbortController();
    const generation = ++scopeGeneration.current;
    savedRef.current = null;
    setState(null);
    setForm({});
    setLoading(true);
    setLoadFailed(false);

    const load = async () => {
      try {
        const workspace = await canonicalClient.resolveWorkspace(directory);
        if (abort.signal.aborted || generation !== scopeGeneration.current) return;
        const snapshot = await canonicalClient.getOmpSettings(workspace.workspaceId, abort.signal);
        if (abort.signal.aborted || generation !== scopeGeneration.current) return;
        savedRef.current = snapshot;
        setState(snapshot);

        const initialValues: Values = {};
        for (const setting of snapshot.settings) initialValues[setting.id] = setting.value;
        setForm(initialValues);
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') setLoadFailed(true);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };

    void load();
    return () => abort.abort();
  }, [directory, reload]);

  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    const saved = savedRef.current;
    const generation = scopeGeneration.current;
    if (!saved || loading) return AUTOSAVE_UNCHANGED;

    const changes: OmpSettingsChange[] = saved.settings.flatMap((setting) => {
      const val = form[setting.id];
      return JSON.stringify(val ?? null) === JSON.stringify(setting.value ?? null)
        ? []
        : [{ id: setting.id, value: val }];
    });
    if (changes.length === 0) return AUTOSAVE_UNCHANGED;

    try {
      let applied = changes;
      let next: OmpSettingsState;
      try {
        next = await canonicalClient.updateOmpSettings(saved.workspaceId, {
          expectedRevision: saved.revision,
          changes: applied,
        });
      } catch (error) {
        if (!(error instanceof CanonicalApiError) || error.problem.status !== 409) throw error;
        const latest = await canonicalClient.getOmpSettings(saved.workspaceId);
        if (generation !== scopeGeneration.current) return AUTOSAVE_SAVED;
        savedRef.current = latest;
        setState(latest);
        applied = changes.filter((change) => {
          const setting = latest.settings.find((candidate) => candidate.id === change.id);
          return setting !== undefined && JSON.stringify(setting.value ?? null) !== JSON.stringify(change.value ?? null);
        });
        if (applied.length === 0) return AUTOSAVE_SAVED;
        next = await canonicalClient.updateOmpSettings(latest.workspaceId, {
          expectedRevision: latest.revision,
          changes: applied,
        });
      }

      if (generation !== scopeGeneration.current) return AUTOSAVE_SAVED;
      savedRef.current = next;
      setState(next);

      const nextValues: Values = {};
      for (const setting of next.settings) nextValues[setting.id] = setting.value;
      setForm((current) => {
        const merged = { ...current };
        for (const change of applied) {
          if (JSON.stringify(current[change.id] ?? null) === JSON.stringify(change.value ?? null)) {
            merged[change.id] = nextValues[change.id];
          }
        }
        return merged;
      });
      return AUTOSAVE_SAVED;
    } catch (error) {
      return autosaveFailed(error instanceof Error ? error.message : t('settings.omp.saveFailed'));
    }
  }, [form, loading, t]);

  const autosave = useAutosave(save);

  const onChange = React.useCallback((setting: OmpSetting, value: OmpSettingValue) => {
    setForm((current) => ({ ...current, [setting.id]: value }));
  }, []);

  // A picker or a toggle is a decision the user has made: write it now instead
  // of waiting for blur, so a condition over that setting refreshes with it.
  const onImmediate = React.useCallback(
    (setting: OmpSetting, value: OmpSettingValue) => {
      setForm((current) => ({ ...current, [setting.id]: value }));
      autosave.requestSave();
    },
    [autosave]
  );

  // The preset writes all its keys in one PATCH: `save()` diffs the whole form
  // against the snapshot, so merging here is what makes it one request.
  const onPresetApply = React.useCallback((changes: Values) => {
    setForm((current) => ({ ...current, ...changes }));
    autosave.requestSave();
  }, [autosave]);

  /** Rows the page draws: engine placement, in the snapshot, and condition holds. */
  const drawn = React.useMemo(() => {
    if (!state) return null;
    return new Map(
      state.settings
        .filter((setting) => setting.placement.type === 'engine' && setting.conditionActive !== false)
        .map((setting) => [setting.id, setting] as const),
    );
  }, [state]);

  const presetValues = React.useMemo<Values | null>(() => {
    if (!drawn) return null;
    const values: Values = {};
    for (const id of READ_SUMMARY_PRESET_SETTING_IDS) {
      const setting = drawn.get(id);
      if (!setting) return null;
      values[id] = form[id] !== undefined ? form[id] : setting.value;
    }
    return values;
  }, [drawn, form]);

  const renderEntry = (entry: OmpLayoutEntry): React.ReactNode => {
    if (!isPresetEntry(entry)) {
      const setting = drawn?.get(entry);
      if (!setting) return null;
      return (
        <OmpRowControl
          key={setting.id}
          setting={setting}
          value={form[setting.id] !== undefined ? form[setting.id] : setting.value}
          disabled={loading}
          onChange={(value) => {
            const isSelectNumber = setting.type === 'number' && Boolean(setting.options && setting.options.length > 0);
            if (setting.type === 'number' && !isSelectNumber) {
              onChange(setting, value);
            } else {
              onImmediate(setting, value);
            }
          }}
        />
      );
    }
    if (!presetValues) {
      // A snapshot that omits one of the preset's thresholds cannot say what
      // the tuple is, and Custom would be a guess. The switch still owns its
      // own row, so it stays editable instead of disappearing with the preset.
      const setting = drawn?.get('read.summarize.enabled');
      if (!setting) return null;
      return (
        <OmpRowControl
          key={setting.id}
          setting={setting}
          value={form[setting.id] !== undefined ? form[setting.id] : setting.value}
          disabled={loading}
          onChange={(value) => onImmediate(setting, value)}
        />
      );
    }
    return (
      <OmpReadSummaryPresetRow
        key="read.summarize.enabled"
        values={presetValues}
        disabled={loading}
        onApply={onPresetApply}
      />
    );
  };

  const revealConfig = React.useCallback(() => {
    const path = state?.configPath;
    if (!path || !files.revealPath) return;
    void files.revealPath(path).catch(() => { });
  }, [files, state?.configPath]);

  const tabs = React.useMemo<Array<SortableTabsStripItem & { id: OmpSettingsTab }>>(() => (
    OMP_SETTINGS_LAYOUT.map((layoutTab) => ({
      id: layoutTab.id,
      label: t(`settings.omp.tab.${layoutTab.id}`),
    }))
  ), [t]);

  if (loading && !state) {
    return (
      <SettingsPageLayout title={t('settings.page.omp.title')} description={t('settings.page.omp.description')}>
        <div className="py-8 text-center text-sm text-muted-foreground">...</div>
      </SettingsPageLayout>
    );
  }
  if (loadFailed || !state) {
    return (
      <SettingsPageLayout
        title={t('settings.page.omp.title')}
        description={t('settings.page.omp.description')}
        headerEnd={!directory ? undefined : <Button variant="outline" size="sm" onClick={() => setReload((value) => value + 1)}>{t('settings.omp.retry')}</Button>}
      >
        <p className={SETTINGS_HELPER_CLASS}>{t('settings.omp.loadFailed')}</p>
      </SettingsPageLayout>
    );
  }

  const activeTab = OMP_SETTINGS_LAYOUT.find((layoutTab) => layoutTab.id === tab) ?? OMP_SETTINGS_LAYOUT[0];
  const resetSettings = state.settings.filter(
    (setting) => setting.placement.type === 'page' && setting.placement.page === 'omp' && setting.placement.section === 'resets',
  );
  // from the snapshot (or gated off by a condition) does not leave a heading.
  const activeGroups = activeTab.groups
    .map((group) => ({
      id: group.id,
      rows: group.entries.map(renderEntry).filter((row): row is React.ReactElement => row !== null),
    }))
    .filter((group) => group.rows.length > 0);

  return (
    <SettingsPageLayout
      title={t('settings.page.omp.title')}
      description={t('settings.page.omp.description')}
      onBlurCapture={autosave.onBlurCapture}
    >
      <div className="mb-8 flex min-w-0">
        <SortableTabsStrip
          items={tabs}
          activeId={activeTab.id}
          onSelect={(id) => {
            const next = tabs.find((item) => item.id === id);
            if (next) setTab(next.id);
          }}
          layoutMode="scrollable"
          intrinsicWidth
          variant="active-pill"
          pillSize="toolbar"
          className="flex-none max-w-full"
        />
      </div>
      {activeGroups.map((group, index) => (
        <SettingsSection
          key={group.id}
          title={t(`settings.omp.group.${group.id}`)}
          divider={index > 0}
        >
          <div className={SETTINGS_SPACE_ROW_CLASS}>{group.rows}</div>
        </SettingsSection>
      ))}
      {activeTab.id === 'advanced' && resetSettings.length > 0 ? (
        <OmpResetCreditSettings
          settings={resetSettings}
          form={form}
          disabled={loading}
          divider={activeGroups.length > 0}
          onChange={onChange}
          onImmediate={onImmediate}
        />
      ) : null}
      {activeTab.id === 'advanced' ? (
        <SettingsSection
          title={t('settings.omp.configFile.title')}
          settingsItem="omp.configFile"
          divider={activeGroups.length > 0 || resetSettings.length > 0}
          className="space-y-0"
          contentClassName="hidden"
          headerAction={
            state.configPath && files.revealPath ? (
              <Button variant="outline" size="sm" onClick={revealConfig}>
                <Icon name="file-text" className="size-3.5 me-1" />
                {t('settings.omp.openConfig')}
              </Button>
            ) : undefined
          }
        >
          {null}
        </SettingsSection>
      ) : null}
    </SettingsPageLayout>
  );
};
