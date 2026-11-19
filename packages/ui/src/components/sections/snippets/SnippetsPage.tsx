import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { useSnippetsStore, type SnippetScope } from '@/stores/useSnippetsStore';
import { useShallow } from 'zustand/react/shallow';
import { Icon } from '@/components/icon/Icon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsSection,
  SettingsFieldRow,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_WIDTH_LONG_TEXT_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';
<<<<<<< HEAD
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
||||||| bc50ba56aa
import { SnippetAliasesField } from './SnippetAliasesField';
import type { Snippet } from '@/types/snippet';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

interface SnippetForm {
  name: string;
  scope: SnippetScope;
  description: string;
  aliases: string[];
  content: string;
}

const sameForm = (a: SnippetForm, b: SnippetForm): boolean => (
  a.name === b.name
  && a.scope === b.scope
  && a.description === b.description
  && a.content === b.content
  && a.aliases.join('\n') === b.aliases.join('\n')
);

// Each draft is its own editor, also when a discarded one is followed by a
// new draft under the same free name.
const draftKeys = new WeakMap<SnippetDraft, number>();
let lastDraftKey = 0;
const draftKey = (draft: SnippetDraft): number => {
  let key = draftKeys.get(draft);
  if (key === undefined) {
    lastDraftKey += 1;
    key = lastDraftKey;
    draftKeys.set(draft, key);
  }
  return key;
};

type ContentMode = 'edit' | 'preview';
type PreviewState = { status: 'loading' } | { status: 'ready'; text: string } | { status: 'failed' };
=======
import { SnippetAliasesField } from './SnippetAliasesField';
import type { Snippet } from '@/types/snippet';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

interface SnippetForm {
  name: string;
  scope: SnippetScope;
  description: string;
  aliases: string[];
  content: string;
}

const sameForm = (a: SnippetForm, b: SnippetForm): boolean => (
  a.name === b.name
  && a.scope === b.scope
  && a.description === b.description
  && a.content === b.content
  && a.aliases.join('\n') === b.aliases.join('\n')
);

const draftKeys = new WeakMap<SnippetDraft, number>();
let lastDraftKey = 0;
const draftKey = (draft: SnippetDraft): number => {
  let key = draftKeys.get(draft);
  if (key === undefined) {
    lastDraftKey += 1;
    key = lastDraftKey;
    draftKeys.set(draft, key);
  }
  return key;
};

type ContentMode = 'edit' | 'preview';
type PreviewState = { status: 'loading' } | { status: 'ready'; text: string } | { status: 'failed' };
>>>>>>> upstream/main

export const SnippetsPage: React.FC = () => {
  const { t } = useI18n();
  const { selectedSnippetName, snippets, snippetDraft, setSnippetDraft, updateSnippet, createSnippet } = useSnippetsStore(useShallow((s) => ({
    selectedSnippetName: s.selectedSnippetName,
    snippets: s.snippets,
    snippetDraft: s.snippetDraft,
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
<<<<<<< HEAD
  const isNew = Boolean(snippetDraft && snippetDraft.name === selectedSnippetName && !selectedSnippet);
  const [draftName, setDraftName] = React.useState('');
  const [draftScope, setDraftScope] = React.useState<SnippetScope>('agent');
  const [description, setDescription] = React.useState('');
  const [content, setContent] = React.useState('');
||||||| bc50ba56aa
  const draft = snippetDraft && snippetDraft.name === selectedSnippetName && !selectedSnippet ? snippetDraft : null;

  if (!selectedSnippetName || (!selectedSnippet && !draft)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Icon name="file-text" className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-ui-label">{t('settings.snippets.page.empty.title')}</p>
          <p className="typography-meta mt-1 opacity-75">{t('settings.snippets.page.empty.description')}</p>
        </div>
      </div>
    );
  }

  // The form starts over only when another snippet or draft opens; a list
  // reload for the same file keeps the edits in progress.
  const initial: SnippetForm = selectedSnippet
    ? {
      name: selectedSnippet.name,
      scope: selectedSnippet.source,
      description: selectedSnippet.description ?? '',
      aliases: selectedSnippet.aliases,
      content: selectedSnippet.content,
    }
    : {
      name: draft?.name ?? '',
      scope: draft?.scope ?? 'global',
      description: draft?.description ?? '',
      aliases: draft?.aliases ?? [],
      content: draft?.content ?? '',
    };
  return (
    <SnippetEditor
      key={selectedSnippet ? selectedSnippet.filePath : `draft:${draft ? draftKey(draft) : ''}`}
      snippet={selectedSnippet}
      draft={draft}
      initial={initial}
    />
  );
};

const SnippetEditor: React.FC<{ snippet: Snippet | null; draft: SnippetDraft | null; initial: SnippetForm }> = ({ snippet, draft, initial: initialForm }) => {
  const { t } = useI18n();
  const {
    snippets,
    setSnippetDraft,
    setSelectedSnippet,
    setHasUnsavedChanges,
    updateSnippet,
    createSnippet,
    previewSnippet,
  } = useSnippetsStore(useShallow((s) => ({
    snippets: s.snippets,
    setSnippetDraft: s.setSnippetDraft,
    setSelectedSnippet: s.setSelectedSnippet,
    setHasUnsavedChanges: s.setHasUnsavedChanges,
    updateSnippet: s.updateSnippet,
    createSnippet: s.createSnippet,
    previewSnippet: s.previewSnippet,
  })));
  const isNew = snippet === null;

  const [initial, setInitial] = React.useState(initialForm);
  const [form, setForm] = React.useState(initialForm);
=======
  const draft = snippetDraft && snippetDraft.name === selectedSnippetName && !selectedSnippet ? snippetDraft : null;

  if (!selectedSnippetName || (!selectedSnippet && !draft)) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <Icon name="file-text" className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-ui-label">{t('settings.snippets.page.empty.title')}</p>
          <p className="typography-meta mt-1 opacity-75">{t('settings.snippets.page.empty.description')}</p>
        </div>
      </div>
    );
  }

  const initial: SnippetForm = selectedSnippet
    ? {
      name: selectedSnippet.name,
      scope: selectedSnippet.source,
      description: selectedSnippet.description ?? '',
      aliases: selectedSnippet.aliases,
      content: selectedSnippet.content,
    }
    : {
      name: draft?.name ?? '',
      scope: draft?.scope ?? 'global',
      description: draft?.description ?? '',
      aliases: draft?.aliases ?? [],
      content: draft?.content ?? '',
    };
  return (
    <SnippetEditor
      key={selectedSnippet ? selectedSnippet.filePath : `draft:${draft ? draftKey(draft) : ''}`}
      snippet={selectedSnippet}
      draft={draft}
      initial={initial}
    />
  );
};

const SnippetEditor: React.FC<{ snippet: Snippet | null; draft: SnippetDraft | null; initial: SnippetForm }> = ({ snippet, draft, initial: initialForm }) => {
  const { t } = useI18n();
  const {
    snippets,
    setSnippetDraft,
    setSelectedSnippet,
    setHasUnsavedChanges,
    updateSnippet,
    createSnippet,
    previewSnippet,
  } = useSnippetsStore(useShallow((s) => ({
    snippets: s.snippets,
    setSnippetDraft: s.setSnippetDraft,
    setSelectedSnippet: s.setSelectedSnippet,
    setHasUnsavedChanges: s.setHasUnsavedChanges,
    updateSnippet: s.updateSnippet,
    createSnippet: s.createSnippet,
    previewSnippet: s.previewSnippet,
  })));
  const isNew = snippet === null;

  const [initial, setInitial] = React.useState(initialForm);
  const [form, setForm] = React.useState(initialForm);
>>>>>>> upstream/main
  const [isSaving, setIsSaving] = React.useState(false);
<<<<<<< HEAD
  const initialStateRef = React.useRef<{ draftName: string; draftScope: SnippetScope; description: string; content: string } | null>(null);
||||||| bc50ba56aa
  const [contentMode, setContentMode] = React.useState<ContentMode>('edit');
  const [preview, setPreview] = React.useState<PreviewState>({ status: 'loading' });

  const isChanged = !sameForm(form, initial);
  // A new draft saves as it is; only real edits ask before being dropped.
  const canSave = !isSaving && (isNew || isChanged);
=======
  const [contentMode, setContentMode] = React.useState<ContentMode>('edit');
  const [preview, setPreview] = React.useState<PreviewState>({ status: 'loading' });

  const isChanged = !sameForm(form, initial);
  const canSave = !isSaving && (isNew || isChanged);
>>>>>>> upstream/main

  React.useEffect(() => {
    if (isNew && snippetDraft) {
      const next = {
        draftName: snippetDraft.name || '',
        draftScope: snippetDraft.scope,
        description: snippetDraft.description || '',
        content: snippetDraft.content || '',
      };
      setDraftName(next.draftName);
      setDraftScope(next.draftScope);
      setDescription(next.description);
      setContent(next.content);
      initialStateRef.current = next;
    } else if (selectedSnippet) {
      const next = {
        draftName: '',
        draftScope: selectedSnippet.scope === 'workspace' ? 'workspace' as const : 'agent' as const,
        description: selectedSnippet.description,
        content: selectedSnippet.content,
      };
      setDescription(next.description);
      setContent(next.content);
      initialStateRef.current = next;
    }
  }, [selectedSnippet, isNew, selectedSnippetName, snippetDraft]);

  const isDirty = React.useMemo(() => {
    const initial = initialStateRef.current;
    if (!initial) return false;
    if (isNew && draftName !== initial.draftName) return true;
    if (isNew && draftScope !== initial.draftScope) return true;
    return description !== initial.description || content !== initial.content;
  }, [content, description, draftName, draftScope, isNew]);

  const handleSave = async () => {
    const snippetName = isNew ? draftName.trim().replace(/\s+/g, '-') : selectedSnippetName?.trim();
    if (!snippetName) {
      toast.error(t('settings.snippets.page.toast.nameRequired'));
      return;
    }

    if (!content.trim()) {
      toast.error(t('settings.snippets.page.toast.contentRequired'));
      return;
    }


    setIsSaving(true);
    try {
      const success = isNew
        ? await createSnippet(snippetName, content, { description, scope: draftScope })
        : await updateSnippet(snippetName, { content, description });
      if (!success) {
        toast.error(t('settings.snippets.page.toast.saveFailed'));
        return;
      }
      toast.success(t('settings.snippets.page.toast.saved'));
<<<<<<< HEAD
      if (isNew) setSnippetDraft(null);
||||||| bc50ba56aa
      // The saved fields are the new baseline; a rename or a move reopens the
      // snippet under its new file (the store moves the selection).
      setInitial(form);
      // A new snippet opens once saved, unless the user went on to another
      // one while the save was in flight.
      if (isNew && useSnippetsStore.getState().snippetDraft === draft) {
        setSnippetDraft(null);
        setSelectedSnippet(name);
      }
=======
      setInitial(form);
      if (isNew && useSnippetsStore.getState().snippetDraft === draft) {
        setSnippetDraft(null);
        setSelectedSnippet(name);
      }
>>>>>>> upstream/main
    } finally {
      setIsSaving(false);
    }
  };

  if (!selectedSnippetName) {
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
      showSaveStatus={false}
    >
<<<<<<< HEAD
      <SettingsSection divider={false}>
        {isNew ? (
          <SettingsFieldRow label="/">
||||||| bc50ba56aa
      <SettingsSection divider={false} contentClassName="space-y-4">
        <SettingsStackedField label={t('snippets.field.name')}>
          <div className="flex w-full max-w-sm min-w-0 items-center gap-2">
=======
      <SettingsSection contentClassName="space-y-4">
        <SettingsStackedField label={t('snippets.field.name')}>
          <div className="flex w-full max-w-sm min-w-0 items-center gap-2">
>>>>>>> upstream/main
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder={t('settings.snippets.page.field.namePlaceholder')}
              inputSize="compact"
              className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
            />
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
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.snippets.page.field.content')}</span>
            <SettingsInfoHint>{t('settings.snippets.page.hint')}</SettingsInfoHint>
          </div>
          <Textarea readOnly={!isNew && !selectedSnippet?.editable} value={content} onChange={(e) => setContent(e.target.value)} placeholder={t('settings.snippets.page.field.contentPlaceholder')} rows={12} className="w-full font-mono typography-meta min-h-[160px] max-h-[60vh] bg-transparent" />
        </div>
        <div className="pt-3">
          <Button onClick={handleSave} disabled={isSaving || !isDirty || (!isNew && !selectedSnippet?.editable)} size="xs" className="!font-normal">
            {isSaving ? t('settings.common.actions.saving') : t('settings.common.actions.saveChanges')}
          </Button>
        </div>
      </SettingsSection>
    </SettingsPageLayout>
  );
};
