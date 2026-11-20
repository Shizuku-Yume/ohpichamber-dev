import React from 'react';
import type { CacheWarmingApplyResult, CacheWarmingState } from '@openchamber/agent-contract';
import { CacheWarmingPartialWriteDetailsSchema } from '@openchamber/agent-contract';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { SettingsCheckboxRow, SETTINGS_HELPER_CLASS } from '@/components/sections/shared/SettingsSection';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';
import { reportSettingsSaveState } from '@/lib/persistence';
import { getRuntimeKey, subscribeRuntimeEndpointChanged, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { useSessionWarmingStore } from '@/stores/useSessionWarmingStore';

const modeKeys = {
  off: 'settings.openchamber.defaults.warming.off',
  idle: 'settings.openchamber.defaults.warming.idle',
  streaming: 'settings.openchamber.defaults.warming.streaming',
} as const;
const outcomeKeys = {
  applied: 'settings.openchamber.defaults.warming.applied',
  partial: 'settings.openchamber.defaults.warming.partial',
  failed: 'settings.openchamber.defaults.warming.failed',
  'no-active-workers': 'settings.openchamber.defaults.warming.noActiveWorkers',
} as const;

const WorkspaceWarming: React.FC<{ directory: string | null }> = ({ directory }) => {
  const { t } = useI18n();
  const [persisted, setPersisted] = React.useState<CacheWarmingState | null>(null);
  const [outcome, setOutcome] = React.useState<CacheWarmingApplyResult['status'] | null>(null);
  const [error, setError] = React.useState(false);
  const [partialWriteMode, setPartialWriteMode] = React.useState<CacheWarmingState['mode'] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const owner = React.useRef<AbortController | null>(null);
  const writing = React.useRef(false);

  React.useEffect(() => {
    const controller = new AbortController();
    const runtimeKey = getRuntimeKey();
    owner.current = controller;
    const unsubscribe = subscribeRuntimeEndpointWillChange(() => controller.abort());
    const current = () => !controller.signal.aborted && getRuntimeKey() === runtimeKey;
    if (directory) {
      void (async () => {
        try {
          const workspace = await canonicalClient.resolveWorkspace(directory);
          if (!current()) return;
          const state = await canonicalClient.readCacheWarming(workspace.workspaceId, controller.signal);
          if (current()) setPersisted(state);
        } catch {
          if (current()) setError(true);
        }
      })();
    }
    return () => { controller.abort(); unsubscribe(); };
  }, [directory]);

  const handleChange = async (checked: boolean) => {
    const controller = owner.current;
    if (!persisted || partialWriteMode !== null || !controller || controller.signal.aborted || writing.current) return;
    const runtimeKey = getRuntimeKey();
    const current = () => !controller.signal.aborted && owner.current === controller && getRuntimeKey() === runtimeKey;
    writing.current = true;
    setSaving(true);
    setError(false);
    setOutcome(null);
    reportSettingsSaveState('saving');
    try {
      const result = await canonicalClient.updateCacheWarming(persisted.workspaceId, {
        expectedRevision: persisted.revision, mode: checked ? 'idle' : 'off',
      }, controller.signal);
      if (!current()) return;
      setPersisted(result.persisted);
      setOutcome(result.status);
      useSessionWarmingStore.getState().invalidateWorkspaceSessions(
        result.persisted.workspaceId,
        result.persisted.mode,
      );
      reportSettingsSaveState(result.status === 'failed' || result.status === 'partial' ? 'error' : 'saved');
    } catch (failure) {
      if (!current()) return;
      if (failure instanceof CanonicalApiError && failure.problem.code === 'SERVICE_UNAVAILABLE') {
        const details = CacheWarmingPartialWriteDetailsSchema.safeParse(failure.problem.details);
        if (details.success && details.data.workspaceId === persisted.workspaceId) {
          setPartialWriteMode(details.data.configuredMode);
          useSessionWarmingStore.getState().invalidateWorkspaceSessions(
            details.data.workspaceId,
            details.data.configuredMode,
          );
        }
      }
      setError(true);
      reportSettingsSaveState('error');
    } finally {
      if (current()) { writing.current = false; setSaving(false); }
    }
  };

  return (
    <div className="space-y-1">
      <SettingsCheckboxRow
        settingsItem="sessions.warming"
        checked={partialWriteMode !== null ? partialWriteMode !== 'off' : persisted !== null && persisted.mode !== 'off'}
        disabled={!persisted || partialWriteMode !== null || saving || owner.current?.signal.aborted}
        onChange={(checked) => { void handleChange(checked); }}
        label={t('settings.openchamber.defaults.field.sessionWarming')}
        info={t('settings.openchamber.defaults.field.sessionWarmingInfo')}
        description={partialWriteMode !== null ? t(modeKeys[partialWriteMode]) : persisted ? t(modeKeys[persisted.mode]) : error ? undefined : t(directory ? 'settings.openchamber.defaults.warming.loading' : 'settings.openchamber.defaults.warming.noWorkspace')}
      />
      <div className={SETTINGS_HELPER_CLASS} role="status" aria-live="polite">
        {partialWriteMode !== null ? t('settings.openchamber.defaults.warming.partialWrite') : error ? t('settings.openchamber.defaults.warming.error') : outcome ? t(outcomeKeys[outcome]) : null}
      </div>
    </div>
  );
};

export const SessionWarmingCheckbox: React.FC = () => {
  const directory = useSettingsDirectory();
  const [runtimeEpoch, setRuntimeEpoch] = React.useState(0);
  React.useEffect(() => subscribeRuntimeEndpointChanged(() => setRuntimeEpoch(epoch => epoch + 1)), []);
  return <WorkspaceWarming key={JSON.stringify([runtimeEpoch, directory])} directory={directory} />;
};
