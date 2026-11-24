import React from 'react';
import type { BehaviorFileEntry, FileResourceScope } from '@openchamber/agent-contract';
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
import {
  SettingsChipGroup,
  SettingsStackedField,
} from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import {
  isValidInstructionFilename,
  isValidRuleFilename,
  normalizeCreateFilename,
  type BehaviorDraftTarget,
} from './behaviorTypes';

interface BehaviorCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableScopes: readonly FileResourceScope[];
  existingFiles: readonly BehaviorFileEntry[];
  onCreateDraft: (target: BehaviorDraftTarget) => void;
}

export const BehaviorCreateDialog: React.FC<BehaviorCreateDialogProps> = ({
  open,
  onOpenChange,
  availableScopes,
  existingFiles,
  onCreateDraft,
}) => {
  const { t } = useI18n();
  const defaultScope: FileResourceScope = availableScopes.includes('workspace') ? 'workspace' : 'agent';
  const [kind, setKind] = React.useState<'rule' | 'instruction'>('rule');
  const [scope, setScope] = React.useState<FileResourceScope>(defaultScope);
  const [fileName, setFileName] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setKind('rule');
    setScope(availableScopes.includes('workspace') ? 'workspace' : 'agent');
    setFileName('');
    setError(null);
  }, [open, availableScopes]);

  const handleSubmit = () => {
    const normalized = normalizeCreateFilename(fileName, kind);
    if (!normalized) {
      setError(t('settings.behavior.files.createDialog.error.nameRequired'));
      return;
    }
    const valid = kind === 'rule' ? isValidRuleFilename(normalized) : isValidInstructionFilename(normalized);
    if (!valid) {
      setError(
        t(
          kind === 'rule'
            ? 'settings.behavior.files.createDialog.error.invalidRuleName'
            : 'settings.behavior.files.createDialog.error.invalidInstructionName',
        ),
      );
      return;
    }
    if (existingFiles.some((entry) => entry.scope === scope && entry.kind === kind && entry.name === normalized)) {
      setError(t('settings.behavior.files.createDialog.error.duplicate', { name: normalized }));
      return;
    }

    onCreateDraft({ kind, scope, name: normalized });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('settings.behavior.files.createDialog.title')}</DialogTitle>
          <DialogDescription>{t('settings.behavior.files.createDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <SettingsStackedField
            label={t('settings.behavior.files.createDialog.kindLabel')}
            controlClassName="w-full max-w-none"
          >
            <SettingsChipGroup<'rule' | 'instruction'>
              value={kind}
              onChange={(next) => {
                setKind(next);
                setError(null);
              }}
              options={[
                { value: 'rule', label: t('settings.behavior.files.createDialog.kindRule') },
                { value: 'instruction', label: t('settings.behavior.files.createDialog.kindInstruction') },
              ]}
              aria-label={t('settings.behavior.files.createDialog.kindLabel')}
            />
          </SettingsStackedField>

          <SettingsStackedField
            label={t('settings.behavior.files.createDialog.scopeLabel')}
            controlClassName="w-full max-w-none"
          >
            <SettingsChipGroup<FileResourceScope>
              value={scope}
              onChange={(next) => {
                setScope(next);
                setError(null);
              }}
              options={[
                { value: 'agent', label: t('settings.common.scope.global') },
                {
                  value: 'workspace',
                  label: t('settings.common.scope.project'),
                  disabled: !availableScopes.includes('workspace'),
                },
              ]}
              aria-label={t('settings.behavior.files.createDialog.scopeLabel')}
            />
          </SettingsStackedField>

          <SettingsStackedField
            label={t('settings.plugins.page.field.fileName')}
            info={t(
              kind === 'rule'
                ? 'settings.behavior.files.createDialog.fileNameInfoRule'
                : 'settings.behavior.files.createDialog.fileNameInfoInstruction',
            )}
            controlClassName="w-full max-w-none"
          >
            <Input
              value={fileName}
              onChange={(event) => {
                setFileName(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder={t(
                kind === 'rule'
                  ? 'settings.behavior.files.createDialog.fileNamePlaceholderRule'
                  : 'settings.behavior.files.createDialog.fileNamePlaceholderInstruction',
              )}
              aria-label={t('settings.plugins.page.field.fileName')}
              className="w-full font-mono typography-meta"
              autoFocus
            />
          </SettingsStackedField>

          {error ? (
            <p role="alert" className="typography-meta text-[var(--status-error)]">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('settings.common.actions.cancel')}
          </Button>
          <Button type="button" size="sm" onClick={handleSubmit}>
            {t('settings.common.actions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
