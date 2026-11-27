import React from 'react';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import {
  SettingsSection,
  SETTINGS_HELPER_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';

export const AgentSpeechSettings: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const {
    state,
    form,
    loading,
    saving,
    getSectionSettings,
    updateSetting,
  } = useOmpPageSettings('voice');

  const ompStateFailed = Boolean(directory && !loading && !state);
  const rows = getSectionSettings('agent-speech');

  if (!ompStateFailed && rows.length === 0) {
    return null;
  }

  return (
    <SettingsSection
      title={t('settings.voice.page.section.agentSpeech')}
      info={t('settings.voice.page.section.agentSpeechInfo')}
      contentClassName={SETTINGS_SPACE_ROW_CLASS}
    >
      {ompStateFailed ? (
        <p className={SETTINGS_HELPER_CLASS} role="status">
          {t('settings.omp.loadFailed')}
        </p>
      ) : (
        rows.map((setting) => (
          <OmpRowControl
            key={setting.id}
            setting={setting}
            value={form[setting.id] ?? setting.value}
            disabled={(saving && setting.type !== 'string') || setting.conditionActive === false}
            onChange={(value) => void updateSetting(setting, value)}
          />
        ))
      )}
    </SettingsSection>
  );
};
