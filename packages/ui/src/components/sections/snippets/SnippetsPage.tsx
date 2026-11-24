import React from 'react';
import { FileResourceNameSchema } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { useSnippetsStore, type SnippetScope } from '@/stores/useSnippetsStore';
import { useShallow } from 'zustand/react/shallow';
import { Icon } from '@/components/icon/Icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  useAutosave,
  AUTOSAVE_SAVED,
  AUTOSAVE_UNCHANGED,
  autosaveFailed,
  type AutosaveResult,
} from '@/components/sections/shared/SettingsAutosave';
import {
  SettingsSection,
  SettingsFieldRow,
  SettingsStackedField,
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';

interface SnippetBaseline {
  description: string;
  content: string;
}

export const SnippetsPage: React.FC = () => {
  const { t } = useI18n();
  const {
    directory,
    selectedSnippetName,
    snippets,
    snippetDraft,
    setSelectedSnippet,
    setSnippetDraft,
    updateSnippet,
    createSnippet,
  } = useSnippetsStore(useShallow((s) => ({
    directory: s.directory,
    selectedSnippetName: s.selectedSnippetName,
    snippets: s.snippets,
    snippetDraft: s.snippetDraft,
    setSelectedSnippet: s.setSelectedSnippet,
    setSnippetDraft: s.setSnippetDraft,
    updateSnippet: s.updateSnippet,
    createSnippet: s.createSnippet,
  })));

  const selectedSnippet = React.useMemo(
    () => selectedSnippetName
      ? snippets.find((snippet) => snippet.templateId === selectedSnippetName) ?? null
      : null,
    [selectedSnippetName, snippets],
  );
  const isNew = Boolean(snippetDraft && snippetDraft.name === selectedSnippetName && !selectedSnippet);
  const [draftName, setDraftName] = React.useState('');
  const [draftFolder, setDraftFolder] = React.useState('');
  const [draftScope, setDraftScope] = React.useState<SnippetScope>('agent');
  const [description, setDescription] = React.useState('');
  const [content, setContent] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);

  const identity = JSON.stringify([directory, isNew ? selectedSnippetName : selectedSnippet?.templateId ?? selectedSnippetName, isNew]);
  const identityRef = React.useRef(identity);
  identityRef.current = identity;
  const savedRef = React.useRef<SnippetBaseline | null>(null);
  const loadedIdentityRef = React.useRef<string | null>(null);
  const loadedDraftRef = React.useRef<typeof snippetDraft>(null);
  const echoRef = React.useRef<{ identity: string; form: SnippetBaseline } | null>(null);
  const savingRef = React.useRef(false);
  const descriptionRef = React.useRef(description);
  descriptionRef.current = description;
  const contentRef = React.useRef(content);
  contentRef.current = content;

  React.useEffect(() => {
    if (isNew && snippetDraft) {
      if (loadedIdentityRef.current === identity && loadedDraftRef.current === snippetDraft) return;
      loadedIdentityRef.current = identity;
      loadedDraftRef.current = snippetDraft;
      savedRef.current = null;
      setDraftName(snippetDraft.name || '');
      setDraftFolder('');
      setDraftScope(snippetDraft.scope);
      setDescription(snippetDraft.description || '');
      setContent(snippetDraft.content || '');
      return;
    }
    if (!selectedSnippet) return;
    loadedDraftRef.current = null;
    const next: SnippetBaseline = {
      description: selectedSnippet.description,
      content: selectedSnippet.content,
    };
    const sameIdentity = loadedIdentityRef.current === identity;
    loadedIdentityRef.current = identity;
    if (sameIdentity) {
      const baseline = savedRef.current;
      const dirty = baseline !== null
        && (descriptionRef.current !== baseline.description || contentRef.current !== baseline.content);
      const baselineMatches = baseline !== null
        && baseline.description === next.description
        && baseline.content === next.content;
      const echoMatches = echoRef.current?.identity === identity
        && echoRef.current.form.description === next.description
        && echoRef.current.form.content === next.content;
      if (savingRef.current || dirty || baselineMatches || echoMatches) return;
    }
    setDescription(next.description);
    setContent(next.content);
    savedRef.current = next;
  }, [identity, isNew, selectedSnippet, snippetDraft]);

  const folder = draftFolder.trim();
  const invalidFolder = folder !== '' && !FileResourceNameSchema.safeParse(`${folder}/template`).success;

  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    if (isNew || !selectedSnippet || !selectedSnippet.editable) return AUTOSAVE_UNCHANGED;
    const baseline = savedRef.current;
    if (!baseline || loadedIdentityRef.current !== identity) return AUTOSAVE_UNCHANGED;
    if (description === baseline.description && content === baseline.content) return AUTOSAVE_UNCHANGED;
    if (!content.trim()) return autosaveFailed(t('settings.snippets.page.toast.contentRequired'));

    const pending = { identity, form: { description, content } };
    echoRef.current = pending;
    savingRef.current = true;
    try {
      const success = await updateSnippet(selectedSnippet.templateId, { content, description });
      if (!success) return autosaveFailed(t('settings.snippets.page.toast.saveFailed'));
      if (identityRef.current === identity) savedRef.current = pending.form;
      return AUTOSAVE_SAVED;
    } finally {
      savingRef.current = false;
      if (echoRef.current === pending) echoRef.current = null;
    }
  }, [content, description, identity, isNew, selectedSnippet, t, updateSnippet]);
  const autosave = useAutosave(save);

  const handleCreate = async () => {
    const snippetName = draftName.trim().replace(/\s+/g, '-');
    if (!snippetName) {
      toast.error(t('settings.snippets.page.toast.nameRequired'));
      return;
    }
    if (!content.trim()) {
      toast.error(t('settings.snippets.page.toast.contentRequired'));
      return;
    }
    if (invalidFolder) return;

    setIsCreating(true);
    try {
      const success = await createSnippet(folder ? `${folder}/${snippetName}` : snippetName, content, {
        description,
        scope: draftScope,
      });
      if (!success) {
        toast.error(t('settings.snippets.page.toast.saveFailed'));
        return;
      }
      setSnippetDraft(null);
    } finally {
      setIsCreating(false);
    }
  };

  const cancelCreate = () => {
    setSnippetDraft(null);
    setSelectedSnippet(null);
  };

  if (!selectedSnippetName || (!isNew && !selectedSnippet)) {
    // Nothing to edit yet; the heading stays so the pane is titled and
    // SettingsView's focus target exists.
    return (
      <SettingsPageLayout title={t('settings.page.snippets.title')} showSaveStatus={false}>
        <div className="flex items-center justify-center py-16">
          <div className="max-w-sm text-center text-muted-foreground">
            <Icon name="file-text" className="mx-auto mb-3 h-12 w-12 opacity-50" />
            <p className="typography-ui-label">{t('settings.snippets.page.empty.title')}</p>
            <p className="typography-meta mt-1 opacity-75">{t('settings.snippets.page.empty.description')}</p>
          </div>
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <SettingsPageLayout
      title={isNew ? t('settings.snippets.page.title.new') : `/${selectedSnippet?.name ?? ''}`}
      description={selectedSnippet?.source}
      onBlurCapture={autosave.onBlurCapture}
      showSaveStatus={false}
    >
      <SettingsSection divider={false}>
        {isNew ? (
          <SettingsFieldRow label={t('settings.promptTemplates.page.field.name')}>
            <div className={cn('relative min-w-0', SETTINGS_WIDTH_SHORT_TEXT_CLASS)}>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-s-2.5 top-1/2 -translate-y-1/2 typography-ui-label text-muted-foreground"
              >
                /
              </span>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder={t('settings.snippets.page.field.namePlaceholder')}
                aria-label={t('settings.promptTemplates.page.field.name')}
                inputSize="compact"
                className="w-full ps-5"
              />
            </div>
            <Select value={draftScope} onValueChange={(value) => setDraftScope(value as SnippetScope)}>
              <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS}>
                <SelectValue>
                  {draftScope === 'agent' ? t('settings.common.scope.global') : t('settings.common.scope.project')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="agent">{t('settings.common.scope.global')}</SelectItem>
                <SelectItem value="workspace">{t('settings.common.scope.project')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsFieldRow>
        ) : null}
        {isNew ? (
          <SettingsFieldRow label={t('settings.omp.discovery.promptFolder.label')}
            info={t('settings.omp.discovery.promptFolder.description')}>
            <Input
              aria-label={t('settings.omp.discovery.promptFolder.label')}
              aria-invalid={invalidFolder}
              value={draftFolder}
              onChange={(event) => setDraftFolder(event.target.value)}
              inputSize="compact"
              className={SETTINGS_WIDTH_LONG_TEXT_CLASS}
            />
          </SettingsFieldRow>
        ) : null}
        <SettingsFieldRow label={t('settings.common.field.description')}>
          <Input
            value={description}
            readOnly={!isNew && !selectedSnippet?.editable}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('settings.snippets.page.field.descriptionPlaceholder')}
            inputSize="compact"
            className={SETTINGS_WIDTH_LONG_TEXT_CLASS}
          />
        </SettingsFieldRow>
      </SettingsSection>

      <SettingsSection settingsItem="snippets.content">
        <SettingsStackedField
          label={t('settings.snippets.page.field.content')}
          info={t('settings.snippets.page.hint')}
          controlClassName="w-full max-w-none"
        >
          <Textarea
            readOnly={!isNew && !selectedSnippet?.editable}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('settings.snippets.page.field.contentPlaceholder')}
            rows={12}
            className="w-full font-mono typography-meta min-h-[160px] max-h-[60vh] bg-transparent"
          />
        </SettingsStackedField>
        {isNew ? (
          <div className="flex items-center gap-2 pt-3">
            <Button
              onClick={() => void handleCreate()}
              disabled={isCreating || !draftName.trim() || !content.trim() || invalidFolder}
              size="xs"
            >
              {isCreating ? t('settings.common.actions.saving') : t('settings.common.actions.create')}
            </Button>
            <Button
              variant="ghost"
              onClick={cancelCreate}
              disabled={isCreating}
              size="xs"
            >
              {t('settings.common.actions.cancel')}
            </Button>
          </div>
        ) : null}
      </SettingsSection>
    </SettingsPageLayout>
  );
};
