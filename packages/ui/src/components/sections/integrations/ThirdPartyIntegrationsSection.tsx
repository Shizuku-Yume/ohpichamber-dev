import React from 'react';
import { Button } from '@/components/ui/button';
import { SettingsSection } from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';

/** Native agent plugins are managed separately from OpenChamber Guest extensions. */
export const ThirdPartyIntegrationsSection: React.FC<{ divider?: boolean }> = ({ divider = true }) => {
  const { t } = useI18n();
  return (
    <SettingsSection title={t('settings.page.plugins.title')} divider={divider}>
      <Button variant="outline" onClick={() => useUIStore.getState().requestSettingsJump('plugins')}>
        {t('settings.integrations.thirdParty.actions.managePlugins')}
      </Button>
    </SettingsSection>
  );
};
