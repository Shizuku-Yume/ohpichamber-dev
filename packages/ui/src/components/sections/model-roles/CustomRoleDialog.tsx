import React from 'react';
import type { JsonObject, Model } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import { SettingsStackedField } from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import {
  modelTagDisplayName,
  validateCustomRoleId,
  type CustomRoleIdValidation,
} from './modelRoleLayout';

export type CustomRoleDialogState =
  | { readonly mode: 'add' }
  | { readonly mode: 'edit'; readonly roleId: string }
  | null;

interface CustomRoleDialogProps {
  dialogState: CustomRoleDialogState;
  existingCustomIds: readonly string[];
  roleSelectors: Readonly<Record<string, string>>;
  modelTags: Readonly<Record<string, JsonObject>>;
  models: readonly Model[];
  directory?: string;
  globalLevel?: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    mode: 'add' | 'edit';
    roleId: string;
    displayName: string;
    selector: string;
  }) => Promise<boolean>;
}

const VALIDATION_ERROR_KEYS = {
  required: 'settings.omp.modelRoles.custom.field.id.error.required',
  invalidFormat: 'settings.omp.modelRoles.custom.field.id.error.invalidFormat',
  builtinCollision: 'settings.omp.modelRoles.custom.field.id.error.builtinCollision',
  duplicate: 'settings.omp.modelRoles.custom.field.id.error.duplicate',
} as const satisfies Record<Extract<CustomRoleIdValidation, { valid: false }>['reason'], string>;

interface CustomRoleDialogFormProps {
  activeState: Exclude<CustomRoleDialogState, null>;
  existingCustomIds: readonly string[];
  initialDisplayName: string;
  initialSelector: string;
  models: readonly Model[];
  directory?: string;
  globalLevel?: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: CustomRoleDialogProps['onSubmit'];
}

const CustomRoleDialogForm: React.FC<CustomRoleDialogFormProps> = ({
  activeState,
  existingCustomIds,
  initialDisplayName,
  initialSelector,
  models,
  directory,
  globalLevel,
  saving,
  onCancel,
  onSubmit,
}) => {
  const { t } = useI18n();
  const isEdit = activeState.mode === 'edit';
  const [roleId, setRoleId] = React.useState(isEdit ? activeState.roleId : '');
  const [displayName, setDisplayName] = React.useState(initialDisplayName);
  const [selector, setSelector] = React.useState(initialSelector);
  const [submitted, setSubmitted] = React.useState(false);

  const validation = React.useMemo(
    () => (isEdit
      ? ({ valid: true, id: activeState.roleId } as const)
      : validateCustomRoleId(roleId, existingCustomIds)),
    [activeState, existingCustomIds, isEdit, roleId],
  );

  const showIdError = !isEdit && !validation.valid && (submitted || roleId.trim().length > 0);
  const idErrorMessage = showIdError && !validation.valid
    ? t(VALIDATION_ERROR_KEYS[validation.reason])
    : null;

  const effectiveRoleId = validation.valid ? validation.id : 'custom';
  const draftRoles = React.useMemo(
    () => (selector ? { [effectiveRoleId]: selector } : {}),
    [effectiveRoleId, selector],
  );

  const handleSubmit = async () => {
    setSubmitted(true);
    if (!validation.valid || saving) return;
    const ok = await onSubmit({
      mode: activeState.mode,
      roleId: validation.id,
      displayName,
      selector,
    });
    if (ok) {
      onCancel();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t(isEdit
            ? 'settings.omp.modelRoles.custom.editDialog.title'
            : 'settings.omp.modelRoles.custom.addDialog.title')}
        </DialogTitle>
        <DialogDescription>
          {t(isEdit
            ? 'settings.omp.modelRoles.custom.editDialog.description'
            : 'settings.omp.modelRoles.custom.addDialog.description')}
        </DialogDescription>
      </DialogHeader>

      <div className="my-4 space-y-4">
        <SettingsStackedField
          label={t('settings.omp.modelRoles.custom.field.id.label')}
          info={t('settings.omp.modelRoles.custom.field.id.info')}
          controlClassName="w-full max-w-none"
        >
          <div className="w-full space-y-1.5">
            <Input
              value={roleId}
              disabled={isEdit || saving}
              aria-label={t('settings.omp.modelRoles.custom.field.id.label')}
              aria-invalid={Boolean(idErrorMessage)}
              placeholder={t('settings.omp.modelRoles.custom.field.id.placeholder')}
              spellCheck={false}
              autoCapitalize="none"
              className="w-full font-mono"
              onChange={(event) => setRoleId(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            {idErrorMessage ? (
              <p role="alert" className="typography-meta text-[var(--status-error)]">
                {idErrorMessage}
              </p>
            ) : null}
          </div>
        </SettingsStackedField>

        <SettingsStackedField
          label={t('settings.omp.modelRoles.custom.field.displayName.label')}
          info={t('settings.omp.modelRoles.custom.field.displayName.info')}
          controlClassName="w-full max-w-none"
        >
          <Input
            value={displayName}
            disabled={saving}
            aria-label={t('settings.omp.modelRoles.custom.field.displayName.label')}
            placeholder={roleId.trim() || t('settings.omp.modelRoles.custom.field.displayName.placeholder')}
            className="w-full"
            onChange={(event) => setDisplayName(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </SettingsStackedField>

        <ModelRoleEditor
          role={effectiveRoleId}
          roles={draftRoles}
          models={models}
          directory={directory}
          globalLevel={globalLevel}
          disabled={saving}
          layout="stacked"
          label={t('settings.omp.modelRoles.custom.field.model.label')}
          effortLabel={t('settings.omp.modelRoles.effortAria', {
            role: displayName.trim() || (validation.valid ? validation.id : t('settings.omp.modelRoles.custom.field.id.label')),
          })}
          onChange={setSelector}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>
          {t('settings.common.actions.cancel')}
        </Button>
        <Button type="button" size="sm" disabled={saving || (showIdError && !validation.valid)} onClick={() => void handleSubmit()}>
          {t(isEdit
            ? 'settings.omp.modelRoles.custom.editDialog.submit'
            : 'settings.omp.modelRoles.custom.addDialog.submit')}
        </Button>
      </DialogFooter>
    </>
  );
};

export const CustomRoleDialog: React.FC<CustomRoleDialogProps> = ({
  dialogState,
  existingCustomIds,
  roleSelectors,
  modelTags,
  models,
  directory,
  globalLevel,
  saving,
  onOpenChange,
  onSubmit,
}) => {
  const dialogKey = dialogState
    ? (dialogState.mode === 'edit' ? `edit:${dialogState.roleId}` : 'add')
    : 'closed';
  const editRoleId = dialogState?.mode === 'edit' ? dialogState.roleId : null;
  const initialDisplayName = editRoleId ? modelTagDisplayName(modelTags[editRoleId]) : '';
  const initialSelector = editRoleId ? (roleSelectors[editRoleId] ?? '') : '';

  return (
    <Dialog open={dialogState !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {dialogState ? (
          <CustomRoleDialogForm
            key={dialogKey}
            activeState={dialogState}
            existingCustomIds={existingCustomIds}
            initialDisplayName={initialDisplayName}
            initialSelector={initialSelector}
            models={models}
            directory={directory}
            globalLevel={globalLevel}
            saving={saving}
            onCancel={() => onOpenChange(false)}
            onSubmit={onSubmit}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
