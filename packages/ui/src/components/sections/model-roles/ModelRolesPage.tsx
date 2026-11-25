import React from 'react';
import type { ProblemDetails } from '@openchamber/agent-contract';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { Icon } from '@/components/icon/Icon';
import type { I18nKey } from '@/lib/i18n/store';
import { useUIStore } from '@/stores/useUIStore';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useSettingsModels } from '@/hooks/useSettingsModels';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsSection,
  SETTINGS_HELPER_CLASS,
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { CustomRoleDialog, type CustomRoleDialogState } from './CustomRoleDialog';
import { ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import { ModelRoleLinkRow } from '@/components/sections/shared/ModelRoleLinkRow';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
import { modelRoleChange, parseRolesRecord, reportModelRoleSaveProblem, roleSelector } from '@/components/sections/shared/modelRoleSelectors';
import {
  CHAT_ROLES,
  KIND_ROLES,
  LINKED_ROLES,
  deriveCustomRoleIds,
  modelTagDisplayName,
  parseModelTagsRecord,
  removeCustomRoleTag,
  saveCustomRoleTag,
} from './modelRoleLayout';
import { cn } from '@/lib/utils';

export const ModelRolesPage: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const models = useSettingsModels(directory);
  const { state, updateSettings, loading, saving } = useOmpPageSettings('model-roles');
  const [customDialog, setCustomDialog] = React.useState<CustomRoleDialogState>(null);
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const rolesValue = state?.settings.find((setting) => setting.id === 'modelRoles')?.value;
  const modelTagsValue = state?.settings.find((setting) => setting.id === 'modelTags')?.value;

  const roleSelectors = React.useMemo(
    () => Object.fromEntries(Object.entries(parseRolesRecord(rolesValue)).map(([role, value]) => [role, roleSelector(value)])),
    [rolesValue],
  );
  const modelTags = React.useMemo(() => parseModelTagsRecord(modelTagsValue), [modelTagsValue]);
  const customRoleIds = React.useMemo(
    () => deriveCustomRoleIds(rolesValue, modelTagsValue),
    [rolesValue, modelTagsValue],
  );

  const globalLevel = React.useMemo(() => {
    const value = state?.settings.find((setting) => setting.id === 'defaultThinkingLevel')?.value;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }, [state]);

  const reportSaveProblem = React.useCallback((problem: ProblemDetails | null) => {
    reportModelRoleSaveProblem(problem, t);
  }, [t]);

  const setRole = React.useCallback(async (role: string, selector: string) => {
    let observedProblem: ProblemDetails | null = null;
    const saved = await updateSettings((state) => [modelRoleChange(state, role, selector)], {
      onProblem: (problem) => { observedProblem = problem; },
    });
    if (!saved) reportSaveProblem(observedProblem);
  }, [reportSaveProblem, updateSettings]);

  const handleSaveCustomRole = React.useCallback(async (input: {
    mode: 'add' | 'edit';
    roleId: string;
    displayName: string;
    selector: string;
  }): Promise<boolean> => {
    let observedProblem: ProblemDetails | null = null;
    const saved = await updateSettings(
      (latest) => {
        const latestTags = latest.settings.find((setting) => setting.id === 'modelTags')?.value;
        const roleUpdate = modelRoleChange(latest, input.roleId, input.selector);
        const hasAssignment = input.selector.trim().length > 0;
        const nextTags = saveCustomRoleTag(latestTags, input.roleId, input.displayName, hasAssignment);
        return [
          roleUpdate,
          { id: 'modelTags', value: nextTags },
        ];
      },
      { onProblem: (problem) => { observedProblem = problem; } },
    );
    if (!saved) reportSaveProblem(observedProblem);
    return saved;
  }, [reportSaveProblem, updateSettings]);

  const handleDeleteCustomRole = React.useCallback(async (roleId: string) => {
    const displayName = modelTagDisplayName(modelTags[roleId]);
    const confirmed = await confirm({
      title: t('settings.omp.modelRoles.custom.deleteConfirm.title', { role: displayName || roleId }),
      message: t('settings.omp.modelRoles.custom.deleteConfirm.message', { role: roleId }),
      action: t('settings.common.actions.delete'),
      destructive: true,
    });
    if (!confirmed) return;

    let observedProblem: ProblemDetails | null = null;
    const saved = await updateSettings(
      (latest) => {
        const latestTags = latest.settings.find((setting) => setting.id === 'modelTags')?.value;
        return [
          modelRoleChange(latest, roleId, ''),
          { id: 'modelTags', value: removeCustomRoleTag(latestTags, roleId) },
        ];
      },
      { onProblem: (problem) => { observedProblem = problem; } },
    );
    if (!saved) reportSaveProblem(observedProblem);
  }, [confirm, modelTags, reportSaveProblem, t, updateSettings]);

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
      <SettingsSection
        title={t('settings.omp.modelRoles.section.custom.title')}
        description={t('settings.omp.modelRoles.section.custom.description')}
        settingsItem="model-roles.section.custom"
        headerAction={(
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || !state || saving}
            onClick={() => setCustomDialog({ mode: 'add' })}
          >
            <Icon name="add" className="size-3.5" />
            {t('settings.omp.modelRoles.custom.addButton')}
          </Button>
        )}
      >
        {customRoleIds.length > 0 ? (
          <div className={SETTINGS_SPACE_ROW_CLASS}>
            {customRoleIds.map((roleId) => {
              const displayName = modelTagDisplayName(modelTags[roleId]);
              const rowLabel = displayName || roleId;
              return (
                <ModelRoleEditor
                  key={roleId}
                  role={roleId}
                  roles={roleSelectors}
                  models={models}
                  directory={directory ?? undefined}
                  globalLevel={globalLevel}
                  disabled={loading || !state}
                  label={rowLabel}
                  labelAccessory={displayName && displayName !== roleId ? (
                    <span className="typography-micro shrink-0 font-mono text-muted-foreground">
                      @{roleId}
                    </span>
                  ) : undefined}
                  settingsItem={`omp.modelRoles.${roleId}`}
                  onChange={(selector) => void setRole(roleId, selector)}
                  trailingAccessory={(
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={loading || !state || saving}
                        className={cn(SETTINGS_ICON_BUTTON_CLASS, 'shrink-0')}
                        aria-label={t('settings.omp.modelRoles.custom.editAria', { role: rowLabel })}
                        title={t('settings.omp.modelRoles.custom.editAria', { role: rowLabel })}
                        onClick={() => setCustomDialog({ mode: 'edit', roleId })}
                      >
                        <Icon name="pencil" className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={loading || !state || saving}
                        className={cn(SETTINGS_ICON_BUTTON_CLASS, 'shrink-0 hover:text-[var(--status-error)]')}
                        aria-label={t('settings.omp.modelRoles.custom.deleteAria', { role: rowLabel })}
                        title={t('settings.omp.modelRoles.custom.deleteAria', { role: rowLabel })}
                        onClick={() => void handleDeleteCustomRole(roleId)}
                      >
                        <Icon name="delete-bin" className="size-3.5" />
                      </Button>
                    </>
                  )}
                />
              );
            })}
          </div>
        ) : (
          <p className={SETTINGS_HELPER_CLASS}>{t('settings.omp.modelRoles.custom.empty')}</p>
        )}
      </SettingsSection>
      <CustomRoleDialog
        dialogState={customDialog}
        existingCustomIds={customRoleIds}
        roleSelectors={roleSelectors}
        modelTags={modelTags}
        models={models}
        directory={directory ?? undefined}
        globalLevel={globalLevel}
        saving={saving}
        onOpenChange={(open) => {
          if (!open) setCustomDialog(null);
        }}
        onSubmit={handleSaveCustomRole}
      />
      {confirmDialog}
    </SettingsPageLayout>
  );
};
