import React from 'react';
import { formatModelRef, parseModelSelector } from '@openchamber/agent-contract';
import { useI18n } from '@/lib/i18n';
import { toast } from '@/components/ui';
import type { I18nKey } from '@/lib/i18n/store';
import { useUIStore } from '@/stores/useUIStore';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useSettingsImageModels, useSettingsModels } from '@/hooks/useSettingsModels';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsFieldRow,
  SettingsSection,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { ImageModelSelector } from './ImageModelSelector';
import { ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import { ModelRoleLinkRow } from '@/components/sections/shared/ModelRoleLinkRow';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { modelRoleChange, parseRolesRecord, roleSelector } from '@/components/sections/shared/modelRoleSelectors';
import { CHAT_ROLES, KIND_ROLES, LINKED_ROLES } from './modelRoleLayout';
export const ModelRolesPage: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const models = useSettingsModels(directory);
  const imageModels = useSettingsImageModels(directory);
  const { state, updateSettings, loading } = useOmpPageSettings('model-roles');

  const rolesValue = state?.settings.find((setting) => setting.id === 'modelRoles')?.value;
  const roleSelectors = React.useMemo(
    () => Object.fromEntries(Object.entries(parseRolesRecord(rolesValue)).map(([role, value]) => [role, roleSelector(value)])),
    [rolesValue],
  );
  const globalLevel = React.useMemo(() => {
    const value = state?.settings.find((setting) => setting.id === 'defaultThinkingLevel')?.value;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }, [state]);

  const setRole = React.useCallback(async (role: string, selector: string) => {
    const saved = await updateSettings((state) => [modelRoleChange(state, role, selector)]);
    if (!saved) toast.error(t('settings.omp.modelRoles.saveFailed'));
  }, [t, updateSettings]);

  const parsedImage = React.useMemo(() => parseModelSelector(roleSelectors.image ?? ''), [roleSelectors.image]);

  const renderRole = (role: string) => {
    const label = t(`settings.omp.modelRoles.role.${role}.label` as I18nKey);
    const info = t(`settings.omp.modelRoles.role.${role}.desc` as I18nKey);
    const linked = LINKED_ROLES[role];
    if (linked) {
      return (
        <ModelRoleLinkRow
          key={role}
          label={label}
          info={info}
          value={roleSelectors[role] || t('settings.omp.modelRoles.inheritFallback')}
          linkLabel={t(linked.linkKey)}
          onOpen={() => useUIStore.getState().requestSettingsJump(linked.page, linked.item ?? null)}
          settingsItem={`omp.modelRoles.${role}`}
        />
      );
    }
    if (role === 'image') {
      return (
        <SettingsFieldRow key={role} label={label} info={info} settingsItem={`omp.modelRoles.${role}`}>
          <ImageModelSelector
            providerId={parsedImage?.providerId ?? ''}
            modelId={parsedImage?.modelId ?? ''}
            imageModels={imageModels}
            directory={directory ?? undefined}
            disabled={loading || !state}
            loading={loading && !state}
            placeholder={t('settings.omp.modelRoles.inheritFallback')}
            ariaLabel={label}
            className={SETTINGS_WIDTH_SELECT_CLASS}
            onChange={(providerId, modelId) => {
              const selector = providerId && modelId ? formatModelRef({ provider: providerId, modelId }) : '';
              void setRole('image', selector);
            }}
          />
        </SettingsFieldRow>
      );
    }
    return (
      <ModelRoleEditor
        key={role}
        role={role}
        roles={roleSelectors}
        models={models}
        directory={directory ?? undefined}
        globalLevel={globalLevel}
        disabled={loading || !state}
        label={label}
        info={info}
        settingsItem={`omp.modelRoles.${role}`}
        onChange={(selector) => void setRole(role, selector)}
      />
    );
  };

  return (
    <SettingsPageLayout
      title={t('settings.page.modelRoles.title')}
      description={t('settings.page.modelRoles.description')}
      showSaveStatus
    >
      <SettingsSection
        title={t('settings.omp.modelRoles.section.chat.title')}
        description={t('settings.omp.modelRoles.section.chat.description')}
        divider={false}
        settingsItem="model-roles.section.chat"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>{CHAT_ROLES.map(renderRole)}</div>
      </SettingsSection>
      <SettingsSection
        title={t('settings.omp.modelRoles.section.kind.title')}
        description={t('settings.omp.modelRoles.section.kind.description')}
        settingsItem="model-roles.section.kind"
      >
        <div className={SETTINGS_SPACE_ROW_CLASS}>{KIND_ROLES.map(renderRole)}</div>
      </SettingsSection>
    </SettingsPageLayout>
  );
};
