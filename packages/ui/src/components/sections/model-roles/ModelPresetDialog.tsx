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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from '@/components/icon/Icon';
import { ModelRoleEditor } from '@/components/sections/shared/ModelRoleEditor';
import {
  SETTINGS_DIALOG_ICON_BUTTON_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SettingsStackedField,
} from '@/components/sections/shared/SettingsSection';
import { levelLabel } from '@/components/sections/shared/modelRoleSelectors';
import { useI18n } from '@/lib/i18n';
import type { I18nKey } from '@/lib/i18n/store';
import { cn } from '@/lib/utils';
import { CHAT_ROLES, KIND_ROLES, LINKED_ROLES, modelTagDisplayName } from './modelRoleLayout';
import {
  PRESET_THINKING_LEVELS,
  sanitizePresetRoles,
  validatePresetName,
  type ModelPresetEntry,
  type PresetNameValidation,
  type PresetRolesMap,
} from './modelPresetLayout';

export type ModelPresetDialogState =
  | { readonly mode: 'add' }
  | { readonly mode: 'edit'; readonly name: string }
  | null;

const PRESET_NAME_ERROR_KEYS = {
  required: 'settings.omp.modelRoles.presets.name.error.required',
  invalidFormat: 'settings.omp.modelRoles.presets.name.error.invalidFormat',
  duplicate: 'settings.omp.modelRoles.presets.name.error.duplicate',
} as const satisfies Record<Extract<PresetNameValidation, { valid: false }>['reason'], I18nKey>;

function roleLabelKey(role: string): I18nKey | undefined {
  switch (role) {
    case 'default': return 'settings.omp.modelRoles.role.default.label';
    case 'smol': return 'settings.omp.modelRoles.role.smol.label';
    case 'slow': return 'settings.omp.modelRoles.role.slow.label';
    case 'vision': return 'settings.omp.modelRoles.role.vision.label';
    case 'plan': return 'settings.omp.modelRoles.role.plan.label';
    case 'commit': return 'settings.omp.modelRoles.role.commit.label';
    case 'tiny': return 'settings.omp.modelRoles.role.tiny.label';
    case 'memory': return 'settings.omp.modelRoles.role.memory.label';
    case 'task': return 'settings.omp.modelRoles.role.task.label';
    case 'advisor': return 'settings.omp.modelRoles.role.advisor.label';
    case 'widget': return 'settings.omp.modelRoles.role.widget.label';
    case 'image': return 'settings.omp.modelRoles.role.image.label';
    case 'web': return 'settings.omp.modelRoles.role.web.label';
    case 'speech': return 'settings.omp.modelRoles.role.speech.label';
    case 'judge': return 'settings.omp.modelRoles.role.judge.label';
    default: return undefined;
  }
}

export interface ModelPresetSubmitInput {
  mode: 'add' | 'edit';
  name: string;
  originalName?: string;
  entry: ModelPresetEntry;
}

interface ModelPresetDialogProps {
  dialogState: ModelPresetDialogState;
  existingNames: readonly string[];
  initialEntry: ModelPresetEntry;
  models: readonly Model[];
  customRoleIds?: readonly string[];
  modelTags?: Readonly<Record<string, JsonObject>>;
  directory?: string;
  globalLevel?: string;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: ModelPresetSubmitInput) => Promise<boolean>;
}

interface ModelPresetDialogFormProps {
  activeState: Exclude<ModelPresetDialogState, null>;
  existingNames: readonly string[];
  initialEntry: ModelPresetEntry;
  models: readonly Model[];
  customRoleIds: readonly string[];
  modelTags: Readonly<Record<string, JsonObject>>;
  directory?: string;
  globalLevel?: string;
  saving: boolean;
  onCancel: () => void;
  onSubmit: ModelPresetDialogProps['onSubmit'];
}

const EMPTY_CUSTOM_ROLES: readonly string[] = [];
const EMPTY_MODEL_TAGS: Readonly<Record<string, JsonObject>> = {};

const ModelPresetDialogForm: React.FC<ModelPresetDialogFormProps> = ({
  activeState,
  existingNames,
  initialEntry,
  models,
  customRoleIds,
  modelTags,
  directory,
  globalLevel,
  saving,
  onCancel,
  onSubmit,
}) => {
  const { t } = useI18n();
  const isEdit = activeState.mode === 'edit';
  const originalName = isEdit ? activeState.name : undefined;
  const [name, setName] = React.useState(originalName ?? '');
  const [roles, setRoles] = React.useState<PresetRolesMap>(() => ({ ...initialEntry.modelRoles }));
  const [includeThinking, setIncludeThinking] = React.useState(initialEntry.defaultThinkingLevel !== undefined);
  const [thinkingLevel, setThinkingLevel] = React.useState(initialEntry.defaultThinkingLevel ?? 'high');
  const [submitted, setSubmitted] = React.useState(false);
  const [showAllRoles, setShowAllRoles] = React.useState(false);

  const validation = React.useMemo(
    () => validatePresetName(name, existingNames, originalName),
    [existingNames, name, originalName],
  );

  const showNameError = !validation.valid && (submitted || name.trim().length > 0);
  const nameErrorMessage = showNameError && !validation.valid
    ? t(PRESET_NAME_ERROR_KEYS[validation.reason])
    : null;

  const setRole = React.useCallback((role: string, selector: string) => {
    setRoles((current) => {
      const next = { ...current };
      if (selector.trim() === '') delete next[role];
      else next[role] = selector;
      return next;
    });
  }, []);

  const candidateRoles = React.useMemo(() => {
    const ordered: string[] = [
      ...CHAT_ROLES,
      ...KIND_ROLES.filter((role) => !(role in LINKED_ROLES)),
      ...customRoleIds,
    ];
    const seen = new Set<string>(ordered);
    for (const role of Object.keys(initialEntry.modelRoles)) {
      if (!seen.has(role) && (initialEntry.modelRoles[role] ?? '').trim() !== '') {
        ordered.push(role);
        seen.add(role);
      }
    }
    return ordered;
  }, [customRoleIds, initialEntry.modelRoles]);

  const visibleRoles = React.useMemo(
    () => (showAllRoles
      ? candidateRoles
      : candidateRoles.filter((role) => (roles[role] ?? '').trim() !== '')),
    [candidateRoles, roles, showAllRoles],
  );

  const resolveRoleLabel = React.useCallback((role: string): string => {
    const key = roleLabelKey(role);
    if (key) return t(key);
    return modelTagDisplayName(modelTags[role]) || role;
  }, [modelTags, t]);

  const handleSubmit = async () => {
    setSubmitted(true);
    if (!validation.valid || saving) return;
    const modelRoles = sanitizePresetRoles(roles);
    const entry: ModelPresetEntry = includeThinking
      ? { modelRoles, defaultThinkingLevel: thinkingLevel }
      : { modelRoles };
    const payload: ModelPresetSubmitInput = {
      mode: activeState.mode,
      name: validation.name,
      entry,
    };
    if (originalName !== undefined) {
      payload.originalName = originalName;
    }
    const ok = await onSubmit(payload);
    if (ok) onCancel();
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
            ? 'settings.omp.modelRoles.presets.editDialog.title'
            : 'settings.omp.modelRoles.presets.addDialog.title')}
        </DialogTitle>
        <DialogDescription>
          {t(isEdit
            ? 'settings.omp.modelRoles.presets.editDialog.description'
            : 'settings.omp.modelRoles.presets.addDialog.description')}
        </DialogDescription>
      </DialogHeader>

      <div className="my-4 space-y-4">
        <SettingsStackedField
          label={t('settings.omp.modelRoles.presets.name.label')}
          info={t('settings.omp.modelRoles.presets.name.info')}
          controlClassName="w-full max-w-none"
        >
          <div className="w-full space-y-1.5">
            <Input
              value={name}
              disabled={saving}
              aria-label={t('settings.omp.modelRoles.presets.name.label')}
              aria-invalid={Boolean(nameErrorMessage)}
              placeholder={t('settings.omp.modelRoles.presets.name.placeholder')}
              spellCheck={false}
              autoCapitalize="none"
              className="w-full font-mono"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleKeyDown}
            />
            {nameErrorMessage ? (
              <p role="alert" className="typography-meta text-[var(--status-error)]">
                {nameErrorMessage}
              </p>
            ) : null}
          </div>
        </SettingsStackedField>

        <SettingsStackedField
          label={t('settings.omp.modelRoles.presets.rolesLabel')}
          description={t('settings.omp.modelRoles.presets.rolesHint')}
          controlClassName="w-full max-w-none"
        >
          <div className="w-full space-y-4">
            {visibleRoles.length > 0 ? visibleRoles.map((role) => {
              const roleLabel = resolveRoleLabel(role);
              return (
                <div key={role} className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <ModelRoleEditor
                      role={role}
                      roles={roles}
                      models={models}
                      directory={directory}
                      globalLevel={globalLevel}
                      disabled={saving}
                      layout="stacked"
                      label={roleLabel}
                      effortLabel={t('settings.omp.modelRoles.effortAria', {
                        role: roleLabel,
                      })}
                      onChange={(selector) => setRole(role, selector)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={saving}
                    className={cn(SETTINGS_DIALOG_ICON_BUTTON_CLASS, 'shrink-0 hover:text-[var(--status-error)]')}
                    aria-label={t('settings.omp.modelRoles.presets.removeRoleAria', { role: roleLabel })}
                    title={t('settings.omp.modelRoles.presets.removeRoleAria', { role: roleLabel })}
                    onClick={() => setRole(role, '')}
                  >
                    <Icon name="close" className="size-3.5" />
                  </Button>
                </div>
              );
            }) : (
              <p className="typography-meta text-muted-foreground">
                {t('settings.omp.modelRoles.presets.rolesEmpty')}
              </p>
            )}
            {!showAllRoles && visibleRoles.length < candidateRoles.length ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => setShowAllRoles(true)}
              >
                <Icon name="add" className="size-3.5" />
                {t('settings.omp.modelRoles.presets.addRoleRow')}
              </Button>
            ) : null}
          </div>
        </SettingsStackedField>

        <SettingsStackedField
          label={t('settings.omp.modelRoles.presets.thinkingLabel')}
          info={t('settings.omp.modelRoles.presets.thinkingInfo')}
          controlClassName="w-full max-w-none"
        >
          <div className="w-full">
            <div className="flex items-center gap-2">
              <Select
                value={includeThinking ? thinkingLevel : '__unset__'}
                disabled={saving}
                onValueChange={(value) => {
                  if (value === '__unset__') {
                    setIncludeThinking(false);
                  } else {
                    setIncludeThinking(true);
                    setThinkingLevel(value);
                  }
                }}
              >
                <SelectTrigger
                  className={SETTINGS_WIDTH_SELECT_CLASS}
                  aria-label={t('settings.omp.modelRoles.presets.thinkingLabel')}
                >
                  <SelectValue>
                    {includeThinking ? levelLabel(t, thinkingLevel) : t('settings.omp.modelRoles.presets.thinkingUnset')}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unset__">{t('settings.omp.modelRoles.presets.thinkingUnset')}</SelectItem>
                  {PRESET_THINKING_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>{levelLabel(t, level)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </SettingsStackedField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onCancel}>
          {t('settings.common.actions.cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || (showNameError && !validation.valid) || (submitted && !validation.valid)}
          onClick={() => void handleSubmit()}
        >
          {t(isEdit
            ? 'settings.omp.modelRoles.presets.editDialog.submit'
            : 'settings.omp.modelRoles.presets.addDialog.submit')}
        </Button>
      </DialogFooter>
    </>
  );
};

export const ModelPresetDialog: React.FC<ModelPresetDialogProps> = ({
  dialogState,
  existingNames,
  initialEntry,
  models,
  customRoleIds = EMPTY_CUSTOM_ROLES,
  modelTags = EMPTY_MODEL_TAGS,
  directory,
  globalLevel,
  saving,
  onOpenChange,
  onSubmit,
}) => {
  const dialogKey = dialogState
    ? (dialogState.mode === 'edit' ? `edit:${dialogState.name}` : 'add')
    : 'closed';
  return (
    <Dialog open={dialogState !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {dialogState ? (
          <ModelPresetDialogForm
            key={dialogKey}
            activeState={dialogState}
            existingNames={existingNames}
            initialEntry={initialEntry}
            models={models}
            customRoleIds={customRoleIds}
            modelTags={modelTags}
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
