import React from 'react';
import { formatModelRef } from '@openchamber/agent-contract';
import { useI18n } from '@/lib/i18n';
import { reportSettingsSaveState } from '@/lib/persistence';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import { ModelRoleLinkRow } from '@/components/sections/shared/ModelRoleLinkRow';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { modelRoleChange, parseRolesRecord, roleSelector } from '@/components/sections/shared/modelRoleSelectors';
import { CHAT_ROLES, KIND_ROLES, LINKED_ROLES } from './modelRoleLayout';

const INHERIT = '__inherit__';

export const ModelRolesPage: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const models = useSettingsModels(directory);
  const imageModels = useSettingsImageModels(directory);
  const { state, updateSettings, loading, saving } = useOmpPageSettings('model-roles');

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
    reportSettingsSaveState('saving');
    const saved = await updateSettings((state) => [modelRoleChange(state, role, selector)]);
    reportSettingsSaveState(saved ? 'saved' : 'error');
  }, [updateSettings]);

  const imageRole = roleSelectors.image ?? '';
  const imageOptions = React.useMemo(
    () => imageModels?.filter((model) => model.enabled !== false)
      .map((model) => ({ value: formatModelRef(model), label: `${model.name} (${model.provider})` })) ?? [],
    [imageModels],
  );
  const selectedImage = imageOptions.find((option) => option.value === imageRole);

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
          <Select
            value={imageRole || INHERIT}
            disabled={!state || saving || imageModels === undefined}
            onValueChange={(value) => void setRole('image', value === INHERIT ? '' : value)}
          >
            <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS} aria-label={label}>
              <SelectValue>
                {selectedImage?.label ?? (imageRole || t('settings.omp.modelRoles.inheritFallback'))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={INHERIT}>{t('settings.omp.modelRoles.inheritFallback')}</SelectItem>
              {imageRole && !selectedImage && <SelectItem value={imageRole} disabled>{imageRole}</SelectItem>}
              {imageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
