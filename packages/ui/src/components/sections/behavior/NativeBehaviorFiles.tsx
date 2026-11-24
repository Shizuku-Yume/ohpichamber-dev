import React from 'react';
import {
  type BehaviorFileCatalog,
  type BehaviorFileEntry,
  type BehaviorFileWrite,
  type FileResourceScope,
} from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { reportSettingsSaveState } from '@/lib/persistence';
import { Icon } from '@/components/icon/Icon';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AUTOSAVE_SAVED,
  AUTOSAVE_UNCHANGED,
  autosaveFailed,
  useAutosave,
  type AutosaveResult,
} from '@/components/sections/shared/SettingsAutosave';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SETTINGS_ICON_BUTTON_CLASS,
  SETTINGS_SPACE_CHECKBOX_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SettingsCheckboxRow,
  SettingsFieldRow,
  SettingsSection,
  SettingsStackedField,
} from '@/components/sections/shared/SettingsSection';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { BehaviorListField } from './BehaviorListField';
import {
  INTERRUPT_MODES,
  REPEAT_MODES,
  buildFieldPatch,
  buildFieldPatchFromStructured,
  isNewRuleUsable,
  structuredFieldsEqual,
  structuredFieldsFromEntry,
  type BehaviorSelection,
  type InterruptMode,
  type RepeatMode,
  type StructuredBehaviorFields,
} from './behaviorTypes';

interface NativeBehaviorFilesProps {
  directory: string;
  selection: Extract<BehaviorSelection, { type: 'native-file' | 'new-draft' }>;
  catalog: BehaviorFileCatalog | undefined;
  error: string | null;
  unavailable: boolean;
  onCatalogChange: (next: BehaviorFileCatalog) => void;
  onSelect: (next: BehaviorSelection) => void;
  onClearDraft: () => void;
  titleLeading?: React.ReactNode;
}

const INTERRUPT_MODE_LABEL_KEY = {
  never: 'settings.behavior.files.field.interruptMode.never',
  'prose-only': 'settings.behavior.files.field.interruptMode.proseOnly',
  'tool-only': 'settings.behavior.files.field.interruptMode.toolOnly',
  always: 'settings.behavior.files.field.interruptMode.always',
} satisfies Record<InterruptMode, I18nKey>;

const REPEAT_MODE_LABEL_KEY = {
  once: 'settings.behavior.files.field.repeatMode.once',
  'after-gap': 'settings.behavior.files.field.repeatMode.afterGap',
  always: 'settings.behavior.files.field.repeatMode.always',
} satisfies Record<RepeatMode, I18nKey>;

const isInterruptMode = (value: string): value is InterruptMode =>
  INTERRUPT_MODES.some((mode) => mode === value);

const isRepeatMode = (value: string): value is RepeatMode =>
  REPEAT_MODES.some((mode) => mode === value);
type FormBaseline = {
  key: string;
  content: string;
  fields: StructuredBehaviorFields;
};

export const NativeBehaviorFiles: React.FC<NativeBehaviorFilesProps> = ({
  directory,
  selection,
  catalog,
  error,
  unavailable,
  onCatalogChange,
  onSelect,
  onClearDraft,
  titleLeading,
}) => {
  const { t } = useI18n();
  const isDraft = selection.type === 'new-draft';
  const scope: FileResourceScope = selection.scope;
  const kind = selection.kind;
  const name = selection.name;

  const isFixedStandardFile = kind === 'sticky-rules' || kind === 'system';
  const existingEntry: BehaviorFileEntry | undefined = React.useMemo(
    () =>
      isDraft
        ? undefined
        : catalog?.files.find((entry) => entry.scope === scope && entry.kind === kind && entry.name === name),
    [catalog, isDraft, kind, name, scope],
  );

  const entityKey = JSON.stringify([
    directory,
    selection.type,
    scope,
    kind,
    name,
    existingEntry?.version ?? null,
  ]);
  const identityKey = `${directory}:${selection.type}:${scope}:${kind}:${name}`;

  const [content, setContent] = React.useState('');
  const [fields, setFields] = React.useState<StructuredBehaviorFields>(() => structuredFieldsFromEntry());
  const [draftError, setDraftError] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  const baselineRef = React.useRef<FormBaseline | null>(null);
  const hydratedIdentityRef = React.useRef<string | null>(null);
  const savingRef = React.useRef(false);
  const currentRef = React.useRef({
    identityKey,
    content,
    fields,
  });
  currentRef.current = { identityKey, content, fields };

  React.useEffect(() => {
    setConfirmDeleteOpen(false);
    setDraftError(null);

    const sameIdentity = hydratedIdentityRef.current === identityKey;
    const isDirty = Boolean(
      baselineRef.current &&
      baselineRef.current.key === identityKey &&
      (currentRef.current.content !== baselineRef.current.content ||
        !structuredFieldsEqual(currentRef.current.fields, baselineRef.current.fields)),
    );

    if (sameIdentity && (savingRef.current || isDirty)) {
      return;
    }

    const nextContent = existingEntry?.content ?? '';
    const nextFields = structuredFieldsFromEntry(existingEntry?.fields);
    baselineRef.current = { key: identityKey, content: nextContent, fields: nextFields };
    hydratedIdentityRef.current = identityKey;
    setContent(nextContent);
    setFields(nextFields);
  }, [entityKey, existingEntry, identityKey]);

  const mutateWithRevisionRetry = React.useCallback(
    async (
      currentCatalog: BehaviorFileCatalog,
      run: (expectedRevision: string) => Promise<BehaviorFileCatalog>,
    ): Promise<BehaviorFileCatalog> => {
      try {
        return await run(currentCatalog.revision);
      } catch (failure) {
        if (!(failure instanceof CanonicalApiError) || failure.problem.code !== 'CATALOG_CONFLICT') {
          throw failure;
        }
        const latest = await canonicalClient.fileResources.getBehaviorFiles(currentCatalog.workspaceId);
        if (latest.revision === currentCatalog.revision) throw failure;
        onCatalogChange(latest);
        return await run(latest.revision);
      }
    },
    [onCatalogChange],
  );

  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    if (isDraft || !catalog) return AUTOSAVE_UNCHANGED;
    const baseline = baselineRef.current;
    if (!baseline || baseline.key !== identityKey) return AUTOSAVE_UNCHANGED;

    const patch = buildFieldPatchFromStructured(kind, fields, baseline.fields);
    if (content === baseline.content && patch === undefined) {
      return AUTOSAVE_UNCHANGED;
    }

    savingRef.current = true;
    reportSettingsSaveState('saving');
    try {
      const nextCatalog = await mutateWithRevisionRetry(catalog, (expectedRevision) => {
        const writeInput: BehaviorFileWrite = {
          kind,
          name,
          scope,
          expectedRevision,
          expectedVersion: existingEntry?.version ?? null,
          content,
        };
        if (patch) writeInput.fields = patch;
        return canonicalClient.fileResources.writeBehaviorFile(catalog.workspaceId, writeInput);
      });
      onCatalogChange(nextCatalog);
      if (currentRef.current.identityKey === identityKey) {
        baselineRef.current = { key: identityKey, content, fields };
      }
      reportSettingsSaveState('saved');
      return AUTOSAVE_SAVED;
    } catch (failure) {
      reportSettingsSaveState('error');
      return autosaveFailed(
        failure instanceof Error ? failure.message : t('settings.common.status.saveFailed'),
      );
    } finally {
      savingRef.current = false;
    }
  }, [
    catalog,
    content,
    existingEntry,
    fields,
    identityKey,
    isDraft,
    kind,
    mutateWithRevisionRetry,
    name,
    onCatalogChange,
    scope,
    t,
  ]);

  const autosave = useAutosave(save);

  const updateFields = (
    updater: (prev: StructuredBehaviorFields) => StructuredBehaviorFields,
    commitImmediately = false,
  ) => {
    setFields((prev) => updater(prev));
    setDraftError(null);
    if (!isDraft && commitImmediately) {
      autosave.requestSave();
    }
  };

  const handleCreateDraft = async () => {
    if (!isDraft || !catalog || creating) return;
    if (kind === 'rule' && !isNewRuleUsable(fields)) {
      setDraftError(t('settings.behavior.files.rule.newUsabilityError'));
      return;
    }
    const patch = buildFieldPatch(kind, fields);
    setCreating(true);
    setDraftError(null);
    try {
      const nextCatalog = await mutateWithRevisionRetry(catalog, (expectedRevision) => {
        const writeInput: BehaviorFileWrite = {
          kind,
          name,
          scope,
          expectedRevision,
          expectedVersion: null,
          content,
        };
        if (patch) writeInput.fields = patch;
        return canonicalClient.fileResources.writeBehaviorFile(catalog.workspaceId, writeInput);
      });
      onCatalogChange(nextCatalog);
      onClearDraft();
      onSelect({ type: 'native-file', scope, kind, name });
    } catch (failure) {
      setDraftError(
        failure instanceof Error ? failure.message : t('settings.common.status.saveFailed'),
      );
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!catalog || !existingEntry || deleting) return;
    setDeleting(true);
    try {
      const nextCatalog = await mutateWithRevisionRetry(catalog, (expectedRevision) =>
        canonicalClient.fileResources.deleteBehaviorFile(catalog.workspaceId, {
          kind,
          name,
          scope,
          expectedRevision,
          expectedVersion: existingEntry.version,
        }),
      );
      onCatalogChange(nextCatalog);
      setConfirmDeleteOpen(false);
      baselineRef.current = null;
      if (isFixedStandardFile) {
        hydratedIdentityRef.current = null;
      } else {
        onSelect({ type: 'agents-md', scope: scope === 'workspace' ? 'project' : 'global' });
      }
    } catch (failure) {
      setDraftError(
        failure instanceof Error ? failure.message : t('settings.common.status.saveFailed'),
      );
    } finally {
      setDeleting(false);
    }
  };

  const scopeLabel =
    scope === 'workspace'
      ? t('settings.behavior.files.subtitle.projectFile')
      : t('settings.behavior.files.subtitle.globalFile');
  const kindLabel =
    kind === 'rule'
      ? t('settings.behavior.files.subtitle.rule')
      : kind === 'instruction'
        ? t('settings.behavior.files.subtitle.instruction')
        : null;
  const subtitle = [
    scopeLabel,
    kindLabel,
    isDraft ? t('settings.behavior.files.subtitle.newDraft') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const fixedDescription =
    kind === 'sticky-rules'
      ? t('settings.behavior.files.rulesMd.description')
      : kind === 'system'
        ? t('settings.behavior.files.systemMd.description')
        : null;

  if (unavailable || (!catalog && !error)) {
    return (
      <SettingsPageLayout title={name} titleLeading={titleLeading} description={subtitle}>
        <p className="typography-meta text-muted-foreground">{t('common.loading')}</p>
      </SettingsPageLayout>
    );
  }

  if (!isDraft && catalog && !existingEntry && !isFixedStandardFile) {
    return (
      <SettingsPageLayout title={name} titleLeading={titleLeading} description={subtitle}>
        <p role="alert" className="mb-4 typography-meta text-[var(--status-error)]">
          {t('settings.behavior.files.missing')}
        </p>
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() => onSelect({ type: 'agents-md', scope: scope === 'workspace' ? 'project' : 'global' })}
        >
          {t('settings.behavior.files.sidebar.back')}
        </Button>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout
      title={name}
      titleLeading={titleLeading}
      description={subtitle}
      showSaveStatus
      onBlurCapture={isDraft ? undefined : autosave.onBlurCapture}
      headerEnd={
        !isDraft && existingEntry ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(SETTINGS_ICON_BUTTON_CLASS, 'hover:text-[var(--status-error)]')}
            disabled={deleting}
            onClick={() => setConfirmDeleteOpen(true)}
            aria-label={t('settings.common.actions.delete')}
            title={t('settings.common.actions.delete')}
          >
            <Icon name="delete-bin" className="size-4" />
          </Button>
        ) : undefined
      }
    >
      {error ? (
        <p role="alert" className="mb-4 typography-meta text-[var(--status-error)]">
          {t('settings.behavior.files.loadFailed')}
        </p>
      ) : null}

      {draftError ? (
        <p role="alert" className="mb-4 typography-meta text-[var(--status-error)]">
          {draftError}
        </p>
      ) : null}

      {kind === 'instruction' ? (
        <SettingsSection divider={false} contentClassName={SETTINGS_SPACE_ROW_CLASS}>
          <SettingsFieldRow
            label={t('settings.behavior.files.field.applyTo.label')}
            info={t('settings.behavior.files.field.applyTo.info')}
          >
            <Input
              value={fields.applyTo}
              aria-label={t('settings.behavior.files.field.applyTo.label')}
              placeholder={t('settings.behavior.files.field.applyTo.placeholder')}
              inputSize="compact"
              onChange={(event) => updateFields((prev) => ({ ...prev, applyTo: event.target.value }))}
              className={cn(SETTINGS_WIDTH_LONG_TEXT_CLASS, 'font-mono typography-meta')}
            />
          </SettingsFieldRow>
        </SettingsSection>
      ) : null}

      {kind === 'rule' ? (
        <>
          <SettingsSection
            title={t('settings.behavior.files.section.activation')}
            divider={false}
            contentClassName={SETTINGS_SPACE_ROW_CLASS}
          >
            <div className={SETTINGS_SPACE_CHECKBOX_CLASS}>
              <SettingsCheckboxRow
                checked={fields.enabled !== false}
                onChange={(checked) =>
                  updateFields((prev) => ({ ...prev, enabled: checked ? null : false }), true)
                }
                label={t('settings.behavior.files.field.enabled.label')}
                ariaLabel={t('settings.behavior.files.field.enabled.label')}
                info={t('settings.behavior.files.field.enabled.info')}
              />
              <SettingsCheckboxRow
                checked={fields.alwaysApply === true}
                onChange={(checked) =>
                  updateFields((prev) => ({ ...prev, alwaysApply: checked ? true : null }), true)
                }
                label={t('settings.behavior.files.field.alwaysApply.label')}
                ariaLabel={t('settings.behavior.files.field.alwaysApply.label')}
                info={t('settings.behavior.files.field.alwaysApply.info')}
              />
            </div>

            <SettingsFieldRow
              label={t('settings.behavior.files.field.description.label')}
              info={t('settings.behavior.files.field.description.info')}
            >
              <Input
                value={fields.description}
                aria-label={t('settings.behavior.files.field.description.label')}
                placeholder={t('settings.behavior.files.field.description.placeholder')}
                inputSize="compact"
                onChange={(event) => updateFields((prev) => ({ ...prev, description: event.target.value }))}
                className={SETTINGS_WIDTH_LONG_TEXT_CLASS}
              />
            </SettingsFieldRow>

            <SettingsFieldRow
              label={t('settings.behavior.files.field.globs.label')}
              info={t('settings.behavior.files.field.globs.info')}
              controlClassName={SETTINGS_WIDTH_LONG_TEXT_CLASS}
            >
              <BehaviorListField
                values={fields.globs}
                ariaLabel={t('settings.behavior.files.field.globs.label')}
                placeholder={t('settings.behavior.files.field.globs.placeholder')}
                mono
                onChange={(next, immediate) =>
                  updateFields((prev) => ({ ...prev, globs: next }), Boolean(immediate))
                }
              />
            </SettingsFieldRow>

            <SettingsFieldRow
              label={t('settings.behavior.files.field.agents.label')}
              info={t('settings.behavior.files.field.agents.info')}
              controlClassName={SETTINGS_WIDTH_LONG_TEXT_CLASS}
            >
              <BehaviorListField
                values={fields.agents}
                ariaLabel={t('settings.behavior.files.field.agents.label')}
                placeholder={t('settings.behavior.files.field.agents.placeholder')}
                onChange={(next, immediate) =>
                  updateFields((prev) => ({ ...prev, agents: next }), Boolean(immediate))
                }
              />
            </SettingsFieldRow>

            <SettingsFieldRow
              label={t('settings.behavior.files.field.scope.label')}
              info={t('settings.behavior.files.field.scope.info')}
              controlClassName={SETTINGS_WIDTH_LONG_TEXT_CLASS}
            >
              <BehaviorListField
                values={fields.scope}
                ariaLabel={t('settings.behavior.files.field.scope.label')}
                placeholder={t('settings.behavior.files.field.scope.placeholder')}
                mono
                onChange={(next, immediate) =>
                  updateFields((prev) => ({ ...prev, scope: next }), Boolean(immediate))
                }
              />
            </SettingsFieldRow>
          </SettingsSection>

          <SettingsSection
            title={t('settings.behavior.files.section.triggers')}
            contentClassName={SETTINGS_SPACE_ROW_CLASS}
          >
            <SettingsFieldRow
              label={t('settings.behavior.files.field.condition.label')}
              info={t('settings.behavior.files.field.condition.info')}
              controlClassName={SETTINGS_WIDTH_LONG_TEXT_CLASS}
            >
              <BehaviorListField
                values={fields.condition}
                ariaLabel={t('settings.behavior.files.field.condition.label')}
                placeholder={t('settings.behavior.files.field.condition.placeholder')}
                mono
                onChange={(next, immediate) =>
                  updateFields((prev) => ({ ...prev, condition: next }), Boolean(immediate))
                }
              />
            </SettingsFieldRow>

            <SettingsFieldRow
              label={t('settings.behavior.files.field.astCondition.label')}
              info={t('settings.behavior.files.field.astCondition.info')}
              controlClassName={SETTINGS_WIDTH_LONG_TEXT_CLASS}
            >
              <BehaviorListField
                values={fields.astCondition}
                ariaLabel={t('settings.behavior.files.field.astCondition.label')}
                placeholder={t('settings.behavior.files.field.astCondition.placeholder')}
                mono
                onChange={(next, immediate) =>
                  updateFields((prev) => ({ ...prev, astCondition: next }), Boolean(immediate))
                }
              />
            </SettingsFieldRow>

            <SettingsFieldRow
              label={t('settings.behavior.files.field.question.label')}
              info={t('settings.behavior.files.field.question.info')}
            >
              <Input
                value={fields.question}
                aria-label={t('settings.behavior.files.field.question.label')}
                placeholder={t('settings.behavior.files.field.question.placeholder')}
                inputSize="compact"
                onChange={(event) => updateFields((prev) => ({ ...prev, question: event.target.value }))}
                className={SETTINGS_WIDTH_LONG_TEXT_CLASS}
              />
            </SettingsFieldRow>

            <SettingsFieldRow
              label={t('settings.behavior.files.field.interruptMode.label')}
              info={t('settings.behavior.files.field.interruptMode.info')}
            >
              <Select
                value={fields.interruptMode ?? 'default'}
                onValueChange={(next) =>
                  updateFields(
                    (prev) => ({
                      ...prev,
                      interruptMode: isInterruptMode(next) ? next : null,
                    }),
                    true,
                  )
                }
              >
                <SelectTrigger
                  className={SETTINGS_WIDTH_SELECT_CLASS}
                  aria-label={t('settings.behavior.files.field.interruptMode.label')}
                >
                  <SelectValue>
                    {(value) => {
                      if (!value || value === 'default') return t('settings.openchamber.defaults.option.default');
                      return isInterruptMode(value) ? t(INTERRUPT_MODE_LABEL_KEY[value]) : value;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('settings.openchamber.defaults.option.default')}</SelectItem>
                  {INTERRUPT_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(INTERRUPT_MODE_LABEL_KEY[mode])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsFieldRow>

            <SettingsFieldRow
              label={t('settings.behavior.files.field.repeatMode.label')}
              info={t('settings.behavior.files.field.repeatMode.info')}
            >
              <Select
                value={fields.repeatMode ?? 'default'}
                onValueChange={(next) =>
                  updateFields(
                    (prev) => ({
                      ...prev,
                      repeatMode: isRepeatMode(next) ? next : null,
                    }),
                    true,
                  )
                }
              >
                <SelectTrigger
                  className={SETTINGS_WIDTH_SELECT_CLASS}
                  aria-label={t('settings.behavior.files.field.repeatMode.label')}
                >
                  <SelectValue>
                    {(value) => {
                      if (!value || value === 'default') return t('settings.openchamber.defaults.option.default');
                      return isRepeatMode(value) ? t(REPEAT_MODE_LABEL_KEY[value]) : value;
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">{t('settings.openchamber.defaults.option.default')}</SelectItem>
                  {REPEAT_MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {t(REPEAT_MODE_LABEL_KEY[mode])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingsFieldRow>
          </SettingsSection>
        </>
      ) : null}

      <SettingsSection
        title={t('settings.behavior.files.section.content')}
        description={fixedDescription ?? undefined}
        divider={kind === 'rule' || kind === 'instruction'}
        contentClassName={SETTINGS_SPACE_ROW_CLASS}
      >
        {isFixedStandardFile && catalog && !existingEntry ? (
          <p className="typography-meta text-muted-foreground">
            {t('settings.behavior.files.fixed.notCreated')}
          </p>
        ) : null}
        <SettingsStackedField
          label={t('settings.snippets.page.field.content')}
          controlClassName="w-full max-w-none flex-col items-stretch"
        >
          <Textarea
            aria-label={t('settings.snippets.page.field.content')}
            placeholder={t('settings.behavior.files.field.content.placeholder')}
            rows={12}
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              setDraftError(null);
            }}
            className="w-full font-mono typography-meta min-h-[160px] bg-transparent"
          />
        </SettingsStackedField>

        {isDraft ? (
          <div className="flex items-center gap-2 pt-2">
            <Button
              type="button"
              size="xs"
              disabled={creating}
              onClick={() => void handleCreateDraft()}
            >
              {creating ? t('settings.common.actions.saving') : t('settings.common.actions.create')}
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              disabled={creating}
              onClick={() => {
                onClearDraft();
                onSelect({ type: 'agents-md', scope: scope === 'workspace' ? 'project' : 'global' });
              }}
            >
              {t('settings.common.actions.cancel')}
            </Button>
          </div>
        ) : null}
      </SettingsSection>

      <Dialog open={confirmDeleteOpen} onOpenChange={(open) => { if (!deleting) setConfirmDeleteOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.behavior.files.deleteDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.behavior.files.deleteDialog.description', { name })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={deleting}
              onClick={() => setConfirmDeleteOpen(false)}
            >
              {t('settings.common.actions.cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleDelete()}
            >
              {t('settings.common.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageLayout>
  );
};
