import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodeMirrorEditor } from '@/components/ui/CodeMirrorEditor';
import { toast } from '@/components/ui';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { invalidateSkillsLoadCache, selectAvailableSkillsForDirectory, useSkillsStore, type PendingFile } from '@/stores/useSkillsStore';
import { useShallow } from 'zustand/react/shallow';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { OmpRowControl } from '@/components/sections/shared/OmpRowControl';
import { useOmpPageSettings } from '@/components/sections/shared/useOmpPageSettings';
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
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_WIDTH_SELECT_CLASS,
  SETTINGS_WIDTH_SHORT_TEXT_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Icon } from '@/components/icon/Icon';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { PreviewToggleButton } from '@/components/views/PreviewToggleButton';
import { SkillsCatalogPage } from './catalog/SkillsCatalogPage';
import { useI18n } from '@/lib/i18n';
import { languageByExtension } from '@/lib/codemirror/languageByExtension';
import { createFlexokiCodeMirrorTheme } from '@/lib/codemirror/flexokiTheme';
import { codeHighlightExtension } from '@/lib/codemirror/codeHighlight';
import { getCodeTokenTheme } from '@/lib/shiki/appThemeRegistry';
import { getLanguageFromExtension } from '@/lib/toolHelpers';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

interface SkillsPageProps {
  view?: 'installed' | 'catalog';
}

const SKILL_DOCUMENT_PATH = 'SKILL.md';
const SKILL_EDITOR_HEIGHT_CLASS = 'h-[clamp(320px,58dvh,680px)] min-h-[260px] max-h-[calc(100dvh-220px)]';
const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

const SkillsInstalledPage: React.FC = () => {
  const { t } = useI18n();
  const { currentTheme } = useThemeSystem();
  const directory = useSettingsDirectory();
  const { getSectionSettings, updateSettings, saving } = useOmpPageSettings('skills');
  const discoverySettings = getSectionSettings('discovery');
  const discoverySection = discoverySettings.length > 0 ? (
    <SettingsSection title={t('settings.omp.discovery.title')}>
      {discoverySettings.map(setting => (
        <React.Fragment key={setting.id}>
          <OmpRowControl setting={setting} value={setting.value} disabled={saving || setting.conditionActive === false}
            onChange={async value => {
              if (!await updateSettings(() => [{ id: setting.id, value }])) {
                toast.error(t('settings.common.status.saveFailed'));
                return;
              }
              invalidateSkillsLoadCache(directory);
              await useSkillsStore.getState().loadSkills(directory);
            }} />
          {setting.conditionActive === false && (
            <p className="typography-meta text-muted-foreground">{t('settings.omp.sharedConfig.overridden')}</p>
          )}
        </React.Fragment>
      ))}
    </SettingsSection>
  ) : null;
  const {
    selectedSkillName,
    skillDraft,
    setSkillDraft,
    setSelectedSkill,
    getSkillDetail,
    updateSkill,
    createSkill,
  } = useSkillsStore(useShallow(state => ({
    selectedSkillName: state.selectedSkillName,
    skillDraft: state.skillDraft,
    setSkillDraft: state.setSkillDraft,
    setSelectedSkill: state.setSelectedSkill,
    getSkillDetail: state.getSkillDetail,
    updateSkill: state.updateSkill,
    createSkill: state.createSkill,
  })));
  const skills = useSkillsStore(state => selectAvailableSkillsForDirectory(state, directory));
  const selectedAuthoredSkill = useSkillsStore(state => state.selectedAuthoredSkill);
  const authoredFiles = useSkillsStore(state => state.filesByDirectory[directory ?? '__default__']);
  const applyFailed = useSkillsStore(state => state.lastMutationDirectory === directory && (state.lastMutationResult?.apply?.status === 'partial' || state.lastMutationResult?.apply?.status === 'failed'));

  const selectedNative = skills.find(skill => skill.skillId === selectedSkillName);
  const selectedAuthored = selectedAuthoredSkill && authoredFiles?.skills.find(skill => skill.skillId === selectedAuthoredSkill.authoredSkillId && skill.scope === selectedAuthoredSkill.scope);
  const selected = selectedNative ?? selectedAuthored;
  const reference = selectedAuthoredSkill ?? selectedSkillName;
  const isNew = !!skillDraft && selectedSkillName === skillDraft.name && !selected;
  const readOnly = !isNew && !selectedAuthored && (!selectedNative || selectedNative.readOnly || !selectedNative.authoredSkillId);

  const editorKey = JSON.stringify([directory, selectedNative?.authoredSkillId ? { scope: selectedNative.scope, authoredSkillId: selectedNative.authoredSkillId } : reference, isNew]);

  const [name, setName] = React.useState('');
  const [scope, setScope] = React.useState<'workspace' | 'agent'>('agent');
  const [content, setContent] = React.useState('');
  const [files, setFiles] = React.useState<PendingFile[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [preview, setPreview] = React.useState(false);

  // `filePath` doubles as the dialog state: null = closed, '' = adding a new
  // supporting file, any other value = editing that file.
  const [filePath, setFilePath] = React.useState<string | null>(null);
  const [fileContent, setFileContent] = React.useState('');
  const [originalFileContent, setOriginalFileContent] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [filePending, setFilePending] = React.useState(false);
  const [fileError, setFileError] = React.useState(false);
  const [deleteFile, setDeleteFile] = React.useState<string | null>(null);
  const [deletingFile, setDeletingFile] = React.useState(false);

  const saved = React.useRef({ key: '', content: '' });
  const current = React.useRef({ key: editorKey, content });
  current.current = { key: editorKey, content };

  React.useEffect(() => {
    setFilePath(null);
    setFileError(false);
    setFilePending(false);
    setDeleteFile(null);
  }, [editorKey]);

  React.useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    if (isNew && skillDraft) {
      setName(skillDraft.name);
      setScope(skillDraft.scope);
      setContent(skillDraft.content);
      setFiles(skillDraft.pendingFiles ?? []);
      saved.current = { key: editorKey, content: skillDraft.content };
      setLoading(false);
      return;
    }
    if (!reference || !selected) return;
    setLoading(saved.current.key !== editorKey);
    void getSkillDetail(reference, directory).then(detail => {
      if (cancelled || current.current.key !== editorKey) return;
      if (!detail) { setLoadFailed(true); return; }
      const dirty = saved.current.key === editorKey && current.current.content !== saved.current.content;
      saved.current = { key: editorKey, content: detail.content };
      if (!dirty) setContent(detail.content);
      // File content is read only when the user opens it; the list is metadata.
      setFiles(detail.supportingFiles.map(file => ({ path: file.path, content: '' })));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [directory, editorKey, getSkillDetail, isNew, selected, reference, skillDraft]);

  // A committed source revision is written by the store; the page only decides
  // when the editor is dirty and which reference owns the draft.
  const save = React.useCallback(async (): Promise<AutosaveResult> => {
    if (isNew || readOnly || loading || loadFailed || !reference || saved.current.key !== editorKey || saved.current.content === content) return AUTOSAVE_UNCHANGED;
    const success = await updateSkill(reference, content, directory);
    if (!success) return autosaveFailed(t('settings.skills.page.toast.updateSkillFailed'));
    if (current.current.key === editorKey) saved.current = { key: editorKey, content };
    return AUTOSAVE_SAVED;
  }, [content, directory, editorKey, isNew, loadFailed, loading, readOnly, reference, t, updateSkill]);
  const autosave = useAutosave(save);

  const fontSize = useUIStore(state => state.editorFontSize);
  const extensions = React.useMemo<Extension[]>(() => {
    const markdown = languageByExtension(SKILL_DOCUMENT_PATH);
    return [createFlexokiCodeMirrorTheme(currentTheme, { fontSize }), ...(markdown ? [markdown] : []), EditorView.lineWrapping];
  }, [currentTheme, fontSize]);

  const fileExtensions = React.useMemo<Extension[]>(() => {
    const path = fileName.trim() || 'supporting-file.md';
    // Shiki token colors for code supporting files; markdown stays on lezer.
    const shikiLanguage = getLanguageFromExtension(path);
    const useShiki = Boolean(shikiLanguage) && shikiLanguage !== 'markdown';
    const language = languageByExtension(path);
    return [
      createFlexokiCodeMirrorTheme(currentTheme, useShiki ? { syntaxColors: false, fontSize } : { fontSize }),
      ...(language ? [language] : []),
      ...(useShiki && shikiLanguage ? [codeHighlightExtension({
        language: shikiLanguage,
        theme: getCodeTokenTheme(currentTheme).zed,
      })] : []),
      EditorView.lineWrapping,
    ];
  }, [currentTheme, fileName, fontSize]);

  const title = isNew ? t('settings.skills.page.title.newSkill') : selected?.name;

  const description = React.useMemo(() => {
    if (isNew) return t('settings.skills.page.subtitle.newSkill');
    if (selectedNative) {
      const scopeLabel = selectedNative.scope === 'workspace'
        ? t('settings.common.scope.project')
        : selectedNative.scope === 'agent' ? t('settings.common.scope.global') : '';
      return [scopeLabel, selectedNative.source].filter(Boolean).join(' · ');
    }
    if (selectedAuthored) {
      return selectedAuthored.scope === 'workspace' ? t('settings.common.scope.project') : t('settings.common.scope.global');
    }
    return t('settings.skills.page.subtitle.newSkill');
  }, [isNew, selectedAuthored, selectedNative, t]);

  const create = async () => {
    const skillName = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!skillName) { toast.error(t('settings.skills.page.toast.skillNameRequired')); return; }
    if (!SKILL_NAME_PATTERN.test(skillName) || skillName.length > 64) {
      toast.error(t('settings.skills.page.toast.invalidSkillName'));
      return;
    }
    const exists = skills.some(skill => (skill.authoredSkillId === skillName || skill.name === skillName) && skill.scope === scope)
      || (authoredFiles?.skills ?? []).some(file => file.name === skillName && file.scope === scope);
    if (exists) { toast.error(t('settings.skills.page.toast.skillExists')); return; }
    setCreating(true);
    try {
      const success = await createSkill({ name: skillName, scope, content, supportingFiles: files }, directory);
      if (success) {
        setSkillDraft(null);
        toast.success(t('settings.skills.page.toast.skillCreated'));
      } else {
        toast.error(t('settings.skills.page.toast.createSkillFailed'));
      }
    } finally { setCreating(false); }
  };

  const cancelCreate = () => {
    setSkillDraft(null);
    setSelectedSkill(null);
  };

  const openFile = async (path: string) => {
    const owner = editorKey;
    setFileName(path);
    setFilePath(path);
    setFileContent('');
    setOriginalFileContent('');
    setFileError(false);
    if (isNew) {
      const pendingFile = files.find(file => file.path === path);
      setFileContent(pendingFile?.content ?? '');
      setOriginalFileContent(pendingFile?.content ?? '');
      return;
    }
    if (!reference) { setFileError(true); return; }
    setFilePending(true);
    try {
      const text = await useSkillsStore.getState().readSupportingFile(reference, path, directory);
      if (current.current.key !== owner) return;
      if (text === null) {
        setFileError(true);
        toast.error(t('settings.skills.page.toast.loadFileContentFailed'));
        return;
      }
      setFileContent(text);
      setOriginalFileContent(text);
    } finally { setFilePending(false); }
  };

  const addFile = () => {
    setFilePath('');
    setFileName('');
    setFileContent('');
    setOriginalFileContent('');
    setFileError(false);
  };

  const saveFile = async () => {
    if (readOnly || filePending) return;
    const path = fileName.trim();
    if (!path) { toast.error(t('settings.skills.page.toast.fileNameRequired')); return; }
    if (path === SKILL_DOCUMENT_PATH) { toast.error(t('settings.skills.page.toast.fileExists')); return; }
    if (isNew) {
      if (files.some(file => file.path === path && file.path !== filePath)) {
        toast.error(t('settings.skills.page.toast.fileExists'));
        return;
      }
      if (filePath) {
        setFiles(previous => previous.map(file => file.path === filePath ? { path, content: fileContent } : file));
        toast.success(t('settings.skills.page.toast.fileUpdated', { path }));
      } else {
        setFiles(previous => [...previous, { path, content: fileContent }]);
        toast.success(t('settings.skills.page.toast.fileAdded', { path }));
      }
      setFilePath(null);
      return;
    }
    if (!reference) { toast.error(t('settings.skills.page.toast.noSkillSelected')); return; }
    setFilePending(true);
    const editing = Boolean(filePath);
    try {
      const success = await useSkillsStore.getState().writeSupportingFile(reference, path, fileContent, directory);
      if (!success) {
        toast.error(editing ? t('settings.skills.page.toast.updateFileFailed') : t('settings.skills.page.toast.createFileFailed'));
        return;
      }
      toast.success(editing
        ? t('settings.skills.page.toast.fileUpdated', { path })
        : t('settings.skills.page.toast.fileCreated', { path }));
      const detail = await getSkillDetail(reference, directory);
      if (detail) setFiles(detail.supportingFiles.map(file => ({ path: file.path, content: '' })));
      setFilePath(null);
    } finally { setFilePending(false); }
  };

  // Editing an existing supporting file has no Save button: closing the dialog
  // writes it. A brand-new file is only created on confirm.
  const closeFileDialog = async () => {
    if (filePending) return;
    if (filePath && !readOnly && !fileError && fileContent !== originalFileContent) {
      await saveFile();
      return;
    }
    setFilePath(null);
  };

  const deleteFileEntry = (path: string) => {
    if (readOnly) return;
    if (isNew) {
      setFiles(previous => previous.filter(file => file.path !== path));
      toast.success(t('settings.skills.page.toast.fileRemoved', { path }));
      return;
    }
    setDeleteFile(path);
  };

  const confirmDeleteFile = async () => {
    if (!deleteFile || !reference || readOnly || deletingFile) return;
    setDeletingFile(true);
    try {
      if (await useSkillsStore.getState().deleteSupportingFile(reference, deleteFile, directory)) {
        toast.success(t('settings.skills.page.toast.fileDeleted', { path: deleteFile }));
        setFiles(previous => previous.filter(file => file.path !== deleteFile));
        setDeleteFile(null);
      } else {
        toast.error(t('settings.skills.page.toast.deleteFileFailed'));
      }
    } finally { setDeletingFile(false); }
  };

  // Both the empty and the waiting pane carry the page title: it is the heading
  // SettingsView focuses on navigation, so a branch without it left the pane
  // untitled. This is the installed view; the catalog has its own page.
  const pageTitle = t('settings.page.skills.title');

  if (!selected && !isNew) {
    // The page title is the heading SettingsView focuses on navigation, so the
    // empty pane keeps it instead of centring a message with no title.
    return (
      <SettingsPageLayout title={pageTitle} showSaveStatus={false}>
        {discoverySection}
        <div className="flex items-center justify-center py-16">
          <div className="max-w-sm text-center text-muted-foreground">
            <Icon name="book-open" className="mx-auto mb-3 h-10 w-10 @xl:h-12 @xl:w-12 opacity-50" />
            <p>{t('settings.skills.page.empty.title')}</p>
            <p className="typography-meta mt-1 opacity-75">{t('settings.skills.page.empty.description')}</p>
          </div>
        </div>
      </SettingsPageLayout>
    );
  }

  if (loading || loadFailed) {
    return (
      <SettingsPageLayout title={pageTitle} showSaveStatus={false}>
        {discoverySection}
        <div className="flex items-center justify-center py-16">
          <div className={loadFailed ? 'text-center text-[var(--status-error)]' : 'text-center text-muted-foreground'}>
            <p role={loadFailed ? 'alert' : undefined}>
              {t(loadFailed ? 'settings.skills.page.toast.loadFileContentFailed' : 'settings.skills.page.loading.details')}
            </p>
          </div>
        </div>
      </SettingsPageLayout>
    );
  }

  return (
    <>
      <SettingsPageLayout
        title={title}
        description={description}
        onBlurCapture={autosave.onBlurCapture}
      >
        {discoverySection}
        {applyFailed ? (
          <p role="alert" className="typography-meta text-[var(--status-warning)] pb-4">
            {t('settings.skills.page.status.sourceCommittedApplyFailed')}
          </p>
        ) : null}

        {isNew ? (
          <SettingsSection
            title={t('settings.skills.page.section.basicInformation')}
            divider={false}
            settingsItem="skills.basic-information"
          >
            <SettingsFieldRow
              label={t('settings.skills.page.field.skillNameLocation')}
              info={t('settings.skills.page.field.skillNameHint')}
            >
              <Input
                value={name}
                onChange={event => setName(event.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder={t('settings.skills.page.field.skillNamePlaceholder')}
                inputSize="compact"
                className={SETTINGS_WIDTH_SHORT_TEXT_CLASS}
              />
              <Select
                value={scope}
                onValueChange={value => {
                  if (value === 'workspace' || value === 'agent') setScope(value);
                }}
              >
                <SelectTrigger className={SETTINGS_WIDTH_SELECT_CLASS}>
                  {scope === 'agent'
                    ? <Icon name="user-3" className="h-3.5 w-3.5" />
                    : <Icon name="folder" className="h-3.5 w-3.5" />}
                  <span>{scope === 'agent' ? t('settings.common.scope.global') : t('settings.common.scope.project')}</span>
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="agent">
                    <div className="flex items-center gap-2">
                      <Icon name="user-3" className="h-3.5 w-3.5" />
                      <span>{t('settings.common.scope.global')}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="workspace">
                    <div className="flex items-center gap-2">
                      <Icon name="folder" className="h-3.5 w-3.5" />
                      <span>{t('settings.common.scope.project')}</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingsFieldRow>
          </SettingsSection>
        ) : null}

        <SettingsSection
          title={t('settings.skills.page.section.instructions')}
          headerAction={(
            <PreviewToggleButton
              currentMode={preview ? 'preview' : 'edit'}
              onToggle={() => setPreview(value => !value)}
            />
          )}
          settingsItem="skills.instructions"
          divider={isNew}
        >
          <div
            className={cn(
              'overflow-hidden rounded-md border border-[var(--surface-subtle)] bg-background',
              SKILL_EDITOR_HEIGHT_CLASS,
            )}
            onKeyDown={event => {
              // The editor fills the section, so leaving it to save is a
              // chore; the usual shortcut writes it where you are.
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                autosave.requestSave();
              }
            }}
          >
            {preview ? (
              <ScrollableOverlay outerClassName="h-full" className="h-full">
                <div className="min-h-full px-4 py-3">
                  <SimpleMarkdownRenderer
                    content={content}
                    className="typography-markdown-body"
                    frontmatter="hide"
                    enableFileReferences={false}
                  />
                </div>
              </ScrollableOverlay>
            ) : (
              <CodeMirrorEditor
                value={content}
                onChange={setContent}
                readOnly={readOnly}
                extensions={extensions}
                className="h-full"
                enableSearch
              />
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title={t('settings.skills.page.section.supportingFiles')}
          headerAction={(
            <Button
              variant="outline"
              size="xs"
              className="!font-normal gap-1"
              onClick={addFile}
              disabled={readOnly}
            >
              <Icon name="add" className="h-3.5 w-3.5" /> {t('settings.skills.page.actions.addFile')}
            </Button>
          )}
          settingsItem="skills.supporting-files"
        >
          {files.length === 0 ? (
            <p className="typography-meta text-muted-foreground py-1.5">
              {t('settings.skills.page.supportingFiles.empty')}
            </p>
          ) : (
            <div className="divide-y divide-[var(--surface-subtle)]">
              {files.map(file => (
                <div
                  key={file.path}
                  className="flex items-center gap-2 py-1.5 cursor-pointer group"
                  onClick={() => void openFile(file.path)}
                >
                  <Icon name="file" className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="typography-ui-label text-foreground truncate">{file.path}</span>
                  {isNew ? (
                    <span className="typography-micro text-[var(--status-warning)] bg-[var(--status-warning)]/10 px-1.5 py-0.5 rounded flex-shrink-0">
                      {t('settings.skills.page.badge.pending')}
                    </span>
                  ) : null}
                  {!readOnly ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 w-5 px-0 flex-shrink-0 text-muted-foreground hover:text-[var(--status-error)] opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={event => {
                        event.stopPropagation();
                        deleteFileEntry(file.path);
                      }}
                    >
                      <Icon name="delete-bin" className="h-3 w-3" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </SettingsSection>

        {isNew ? (
          <SettingsSection>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => void create()}
                disabled={creating || !name.trim() || !content.trim()}
                size="xs"
                className="!font-normal"
              >
                {creating ? t('settings.common.actions.saving') : t('settings.skills.page.actions.createSkill')}
              </Button>
              <Button
                variant="ghost"
                onClick={cancelCreate}
                disabled={creating}
                size="xs"
                className="!font-normal"
              >
                {t('settings.common.actions.cancel')}
              </Button>
            </div>
          </SettingsSection>
        ) : null}
      </SettingsPageLayout>

      <Dialog
        open={deleteFile !== null}
        onOpenChange={open => {
          if (!open && !deletingFile) setDeleteFile(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.skills.page.deleteFileDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.skills.page.deleteFileDialog.description', { path: deleteFile ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setDeleteFile(null)} disabled={deletingFile}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => void confirmDeleteFile()} disabled={deletingFile}>
              {t('settings.common.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={filePath !== null}
        onOpenChange={open => {
          if (!open) void closeFileDialog();
        }}
      >
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {filePath ? t('settings.skills.page.fileDialog.titleEdit') : t('settings.skills.page.fileDialog.titleAdd')}
            </DialogTitle>
            <DialogDescription>
              {filePath ? t('settings.skills.page.fileDialog.descriptionEdit') : t('settings.skills.page.fileDialog.descriptionAdd')}
            </DialogDescription>
          </DialogHeader>
          {filePending ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <span className="typography-meta text-muted-foreground">{t('settings.skills.page.loading.fileContent')}</span>
            </div>
          ) : (
            <div className="space-y-4 flex-1 min-h-0 flex flex-col pt-2">
              <div className="space-y-2 flex-shrink-0">
                <div className="flex items-center gap-1">
                  <label className={SETTINGS_FIELD_LABEL_CLASS}>
                    {t('settings.skills.page.fileDialog.field.filePath')}
                  </label>
                  {!filePath ? (
                    <SettingsInfoHint>{t('settings.skills.page.fileDialog.field.filePathHint')}</SettingsInfoHint>
                  ) : null}
                </div>
                <Input
                  value={fileName}
                  onChange={event => setFileName(event.target.value)}
                  placeholder={t('settings.skills.page.fileDialog.field.filePathPlaceholder')}
                  className="text-foreground placeholder:text-muted-foreground focus-visible:ring-ring"
                  disabled={!!filePath || readOnly}
                />
              </div>
              <div className="space-y-2 flex-1 min-h-0 flex flex-col">
                <label className={`${SETTINGS_FIELD_LABEL_CLASS} flex-shrink-0`}>
                  {t('settings.skills.page.fileDialog.field.content')}
                </label>
                {fileError ? (
                  <p role="alert" className="typography-meta text-[var(--status-error)] py-8 text-center">
                    {t('settings.skills.page.toast.loadFileContentFailed')}
                  </p>
                ) : (
                  <div className="h-[45vh] min-h-[250px] max-h-[55vh] overflow-hidden rounded-md border border-[var(--surface-subtle)] bg-background">
                    <CodeMirrorEditor
                      value={fileContent}
                      onChange={setFileContent}
                      readOnly={readOnly}
                      extensions={fileExtensions}
                      className="h-full"
                      enableSearch
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            {filePath ? (
              <Button size="sm" onClick={() => void closeFileDialog()} disabled={filePending}>
                {t('settings.common.actions.close')}
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilePath(null)}
                  disabled={filePending}
                >
                  {t('settings.common.actions.cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void saveFile()}
                  disabled={readOnly || filePending || !fileName.trim() || Boolean(fileError)}
                >
                  {t('settings.skills.page.actions.createFile')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const SkillsPage: React.FC<SkillsPageProps> = ({ view = 'installed' }) => (
  view === 'catalog'
    ? <SkillsCatalogPage mode="external" onModeChange={() => { }} showModeTabs={false} />
    : <SkillsInstalledPage />
);
