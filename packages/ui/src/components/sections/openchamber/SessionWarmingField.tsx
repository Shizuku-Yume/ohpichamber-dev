import React from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';
import type { CacheWarmingMode } from '@openchamber/agent-contract';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SettingsFieldRow,
  SETTINGS_HELPER_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { reportSettingsSaveState } from '@/lib/persistence';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useSessionWarmingStore, type SessionWarmingStoreState } from '@/stores/useSessionWarmingStore';
import { useSessionUIStore } from '@/sync/session-ui-store';

type SessionWarmingSelectValue = 'inherit' | CacheWarmingMode;

const MODE_LABEL_KEYS = {
  off: 'settings.openchamber.defaults.sessionWarming.off',
  idle: 'settings.openchamber.defaults.sessionWarming.idle',
  streaming: 'settings.openchamber.defaults.sessionWarming.streaming',
} as const;

interface SessionWarmingFieldProps {
  /** Explicit session ID override (used in tests; defaults to the open unarchived root session). */
  sessionId?: string | null;
  /** Store hook override (used in tests; defaults to `useSessionWarmingStore`). */
  store?: UseBoundStore<StoreApi<SessionWarmingStoreState>>;
  /** Save-state callback override (used in tests; defaults to `reportSettingsSaveState`). */
  onReportSaveState?: (state: 'saving' | 'saved' | 'error') => void;
}

const useResolvedActiveRootSessionId = (): string | null => {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  return useGlobalSessionsStore((state) => {
    if (!currentSessionId || currentSessionId.startsWith('draft_')) {
      return null;
    }
    const entity = state.entityById.get(currentSessionId) ?? null;
    // The warming route answers 404 for an id the Host has not listed, so the
    // field waits for the record instead of asking early.
    if (!entity) {
      return null;
    }
    if (entity.archivedAt !== undefined) {
      return null;
    }
    const rootId = entity.parentSessionId ? entity.rootSessionId : entity.sessionId;
    const rootEntity = rootId === entity.sessionId ? entity : (state.entityById.get(rootId) ?? null);
    if (rootEntity?.archivedAt !== undefined) {
      return null;
    }
    return rootId;
  });
};

export const SessionWarmingField: React.FC<SessionWarmingFieldProps> = ({
  sessionId,
  store,
  onReportSaveState,
}) => {
  const { t } = useI18n();
  const resolvedSessionId = useResolvedActiveRootSessionId();
  const targetSessionId = sessionId === undefined ? resolvedSessionId : sessionId;
  const storeHook = store ?? useSessionWarmingStore;
  const reportSaveState = onReportSaveState ?? reportSettingsSaveState;

  const warmingState = storeHook((state) => (targetSessionId ? state.entries[targetSessionId]?.state ?? null : null));
  const loading = storeHook((state) => (targetSessionId ? state.loadingBySession[targetSessionId] === true : false));
  const saving = storeHook((state) => (targetSessionId ? state.savingBySession[targetSessionId] === true : false));
  const error = storeHook((state) => (targetSessionId ? state.errorBySession[targetSessionId] ?? null : null));
  const outcome = storeHook((state) => (targetSessionId ? state.entries[targetSessionId]?.lastOutcome ?? null : null));
  const loadSessionWarming = storeHook((state) => state.loadSessionWarming);
  const setSessionWarmingMode = storeHook((state) => state.setSessionWarmingMode);

  React.useEffect(() => {
    if (!targetSessionId) {
      return;
    }
    void loadSessionWarming(targetSessionId, { force: true });
  }, [loadSessionWarming, targetSessionId]);

  const selectedValue: SessionWarmingSelectValue = warmingState?.mode ?? 'inherit';
  const workspaceModeLabel = warmingState
    ? t(MODE_LABEL_KEYS[warmingState.workspaceMode])
    : t('settings.openchamber.defaults.sessionWarming.off');
  const inheritLabel = t('settings.openchamber.defaults.sessionWarming.inherit', {
    mode: workspaceModeLabel,
  });
  const selectedLabel = selectedValue === 'inherit'
    ? inheritLabel
    : t(MODE_LABEL_KEYS[selectedValue]);

  const handleValueChange = async (value: SessionWarmingSelectValue) => {
    if (!targetSessionId || !warmingState || saving) {
      return;
    }
    const nextMode: CacheWarmingMode | null = value === 'inherit' ? null : value;
    reportSaveState('saving');
    try {
      const result = await setSessionWarmingMode(targetSessionId, nextMode);
      reportSaveState(result.status === 'failed' ? 'error' : 'saved');
    } catch {
      reportSaveState('error');
    }
  };

  const statusText = !targetSessionId
    ? null
    : error === 'write' || error === 'read'
      ? t('settings.openchamber.defaults.sessionWarming.error')
      : outcome === 'applied'
        ? t('settings.openchamber.defaults.sessionWarming.applied')
        : outcome === 'failed'
          ? t('settings.openchamber.defaults.sessionWarming.failed')
          : outcome === 'no-active-worker'
            ? t('settings.openchamber.defaults.sessionWarming.noActiveWorker')
            : null;

  return (
    <div className="space-y-1">
      <SettingsFieldRow
        settingsItem="sessions.session-warming"
        label={t('settings.openchamber.defaults.sessionWarming.label')}
        info={t('settings.openchamber.defaults.sessionWarming.info')}
        description={
          !targetSessionId
            ? t('settings.openchamber.defaults.sessionWarming.noSession')
            : !warmingState && loading
              ? t('settings.openchamber.defaults.sessionWarming.loading')
              : undefined
        }
      >
        <Select<SessionWarmingSelectValue>
          value={selectedValue}
          onValueChange={(value) => {
            void handleValueChange(value);
          }}
        >
          <SelectTrigger
            className={SETTINGS_WIDTH_SELECT_CLASS}
            aria-label={t('settings.openchamber.defaults.sessionWarming.aria')}
            disabled={!targetSessionId || !warmingState || saving}
          >
            <SelectValue>{selectedLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inherit">{inheritLabel}</SelectItem>
            <SelectItem value="idle">{t(MODE_LABEL_KEYS.idle)}</SelectItem>
            <SelectItem value="streaming">{t(MODE_LABEL_KEYS.streaming)}</SelectItem>
            <SelectItem value="off">{t(MODE_LABEL_KEYS.off)}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsFieldRow>
      <div className={SETTINGS_HELPER_CLASS} role="status" aria-live="polite">
        {statusText}
      </div>
    </div>
  );
};
