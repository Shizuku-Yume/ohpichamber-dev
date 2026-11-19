import React from 'react';
import { SettingsCheckboxRow, SettingsInset, SettingsSection } from '@/components/sections/shared/SettingsSection';
import { JevAccessNote } from '@/components/sections/classification/JevAccessNote';
import { useI18n } from '@/lib/i18n';
import { useSessionDisplayStore } from '@/stores/useSessionDisplayStore';
import { useUIStore } from '@/stores/useUIStore';
<<<<<<< HEAD
import { selectSafetyNetAvailable, useRoutingStore } from '@/stores/useRoutingStore';
import { updateDesktopSettings } from '@/lib/persistence';
/**
 * "In work": the sidebar block and the Track / Done actions, and whether Jev
 * moves sessions in on its own. Jev runs on the OpenChamber server.
 */
||||||| bc50ba56aa

/**
 * What the sidebar lists: the Chats section and "In work" (the sidebar block,
 * the Track / Done actions, and sessions going in on a sent message). Jev
 * decides nothing here (it only hints that work looks done, which the info
 * explains), so no Jev access note.
 */
=======

>>>>>>> upstream/main
export const SessionWorkSettings: React.FC = () => {
  const { t } = useI18n();
  const enabled = useUIStore((state) => state.sessionWorkEnabled);
  const autoOpen = useUIStore((state) => state.sessionWorkAutoOpen);
  const keepInGroup = useSessionDisplayStore((state) => state.keepWorkInPlace);
  const setEnabled = useUIStore((state) => state.setSessionWorkEnabled);
  const setAutoOpen = useUIStore((state) => state.setSessionWorkAutoOpen);
  const setKeepInGroup = React.useCallback((value: boolean) => {
    useSessionDisplayStore.getState().setKeepWorkInPlace(value);
    void updateDesktopSettings({ sidebarKeepWorkInPlace: value });
  }, []);
  const jevAvailable = useRoutingStore(selectSafetyNetAvailable);

  return (
    <SettingsSection
      title={t('settings.openchamber.sessionWork.title')}
      info={t('settings.openchamber.sessionWork.info')}
      settingsItem="sessions.work"
    >
      <SettingsCheckboxRow
        settingsItem="sessions.work-enabled"
        checked={enabled}
        onChange={setEnabled}
        label={t('settings.openchamber.sessionWork.field.enabled')}
        ariaLabel={t('settings.openchamber.sessionWork.field.enabled')}
      />
      <SettingsCheckboxRow
        settingsItem="sessions.work-keep-in-group"
        checked={enabled && keepInGroup}
        onChange={setKeepInGroup}
        disabled={!enabled}
        label={t('settings.openchamber.sessionWork.field.keepInGroup')}
        ariaLabel={t('settings.openchamber.sessionWork.field.keepInGroup')}
        info={t('settings.openchamber.sessionWork.field.keepInGroupInfo')}
      />
      <SettingsInset className="space-y-0">
        <SettingsCheckboxRow
          settingsItem="sessions.work-auto-open"
          checked={enabled && jevAvailable && autoOpen}
          onChange={setAutoOpen}
          disabled={!enabled || !jevAvailable}
          label={t('settings.openchamber.sessionWork.field.autoOpen')}
          ariaLabel={t('settings.openchamber.sessionWork.field.autoOpen')}
          info={t('settings.openchamber.sessionWork.field.autoOpenInfo')}
        />
        <JevAccessNote />
      </SettingsInset>
    </SettingsSection>
  );
};
