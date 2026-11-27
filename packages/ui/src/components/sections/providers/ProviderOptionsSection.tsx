import React from 'react';
import { useI18n } from '@/lib/i18n';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import {
  SETTINGS_HELPER_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SettingsSection,
} from '@/components/sections/shared/SettingsSection';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { providerOptionSettingIds, selectProviderOptionSettings } from './providerOptionRows';

interface ProviderOptionsSectionProps {
  providerId: string;
}

export const ProviderOptionsSection: React.FC<ProviderOptionsSectionProps> = ({ providerId }) => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const {
    state: ompState,
    form: ompForm,
    loading,
    saving,
    updateSetting,
    getSectionSettings,
  } = useOmpPageSettings('providers');

  const expectedIds = providerOptionSettingIds(providerId);
  const serviceTierSettings = getSectionSettings('service-tier');
  const protocolSettings = getSectionSettings('protocol');
  const rows = React.useMemo(
    () => selectProviderOptionSettings(providerId, [...serviceTierSettings, ...protocolSettings]),
    [providerId, serviceTierSettings, protocolSettings],
  );
  const ompStateFailed = Boolean(directory && !loading && !ompState);

  if (expectedIds.length === 0) return null;
  if (!directory) return null;

  if (ompStateFailed) {
    return (
      <SettingsSection
        title={t('settings.providers.page.section.options')}
        info={t('settings.providers.page.section.optionsInfo')}
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <p className={SETTINGS_HELPER_CLASS} role="status">
          {t('settings.omp.loadFailed')}
        </p>
      </SettingsSection>
    );
  }

  if (loading && !ompState) {
    return (
      <SettingsSection
        title={t('settings.providers.page.section.options')}
        info={t('settings.providers.page.section.optionsInfo')}
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        <p className={SETTINGS_HELPER_CLASS} role="status">
          {t('settings.providers.page.state.loading')}
        </p>
      </SettingsSection>
    );
  }

  if (rows.length === 0) return null;

  return (
    <SettingsSection
      title={t('settings.providers.page.section.options')}
      info={t('settings.providers.page.section.optionsInfo')}
      contentClassName={SETTINGS_SPACE_ROW_CLASS}
    >
      {rows.map((setting) => (
        <OmpRowControl
          key={setting.id}
          setting={setting}
          value={ompForm[setting.id] !== undefined ? ompForm[setting.id] : setting.value}
          disabled={loading || (saving && setting.type !== 'string')}
          onChange={(value) => void updateSetting(setting.id, value)}
        />
      ))}
    </SettingsSection>
  );
};
