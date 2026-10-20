import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodeMirrorEditor } from '@/components/ui/CodeMirrorEditor';
import { toast } from '@/components/ui';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { selectSkillsForDirectory, useSkillsStore, type PendingFile } from '@/stores/useSkillsStore';
import { useShallow } from 'zustand/react/shallow';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { useAutosave, AUTOSAVE_SAVED, AUTOSAVE_UNCHANGED, autosaveFailed, type AutosaveResult } from '@/components/sections/shared/SettingsAutosave';
import { SettingsSection, SettingsFieldRow } from '@/components/sections/shared/SettingsSection';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Icon } from '@/components/icon/Icon';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { PreviewToggleButton } from '@/components/views/PreviewToggleButton';
import { SkillsCatalogPage } from './catalog/SkillsCatalogPage';
import { useI18n } from '@/lib/i18n';
import { languageByExtension } from '@/lib/codemirror/languageByExtension';
import { createFlexokiCodeMirrorTheme } from '@/lib/codemirror/flexokiTheme';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useUIStore } from '@/stores/useUIStore';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

interface SkillsPageProps { view?: 'installed' | 'catalog' }
const SkillsInstalledPage: React.FC = () => {
  const { t } = useI18n();
  const { currentTheme } = useThemeSystem();
  const directory = useSettingsDirectory();
  const { selectedSkillName, skillDraft, setSkillDraft, setSelectedSkill, getSkillDetail, updateSkill, createSkill } = useSkillsStore(useShallow(state => ({
    selectedSkillName: state.selectedSkillName, skillDraft: state.skillDraft, setSkillDraft: state.setSkillDraft,
    setSelectedSkill: state.setSelectedSkill, getSkillDetail: state.getSkillDetail, updateSkill: state.updateSkill, createSkill: state.createSkill,
  })));
  const skills = useSkillsStore(state => selectSkillsForDirectory(state, directory));
  const selectedAuthoredSkill = useSkillsStore(state => state.selectedAuthoredSkill);
  const authoredFiles = useSkillsStore(state => state.filesByDirectory[directory ?? '__default__']);
  const reference = selectedAuthoredSkill ?? selectedSkillName;
  const applyFailed = useSkillsStore(state => state.lastMutationDirectory === directory && (state.lastMutationResult?.apply?.status === 'partial' || state.lastMutationResult?.apply?.status === 'failed'));
  const selectedNative = skills.find(skill => skill.skillId === selectedSkillName);
  const selectedAuthored = selectedAuthoredSkill && authoredFiles?.skills.find(skill => skill.skillId === selectedAuthoredSkill.authoredSkillId && skill.scope === selectedAuthoredSkill.scope);
  const selected = selectedNative ?? selectedAuthored;
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
  const [filePath, setFilePath] = React.useState<string | null>(null);
  const [fileContent, setFileContent] = React.useState('');
  const [fileName, setFileName] = React.useState('');
  const [filePending, setFilePending] = React.useState(false);
  const [deleteFile, setDeleteFile] = React.useState<string | null>(null);
  const saved = React.useRef({ key: '', content: '' });
  const current = React.useRef({ key: editorKey, content });
  current.current = { key: editorKey, content };

  React.useEffect(() => {
    let cancelled = false;
    setFilePath(null);
    setDeleteFile(null);
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
    const markdown = languageByExtension('SKILL.md');
    return [createFlexokiCodeMirrorTheme(currentTheme, { fontSize }), ...(markdown ? [markdown] : []), EditorView.lineWrapping];
  }, [currentTheme, fontSize]);
  const fileExtensions = React.useMemo<Extension[]>(() => {
    const language = languageByExtension(fileName);
    return [createFlexokiCodeMirrorTheme(currentTheme, { fontSize }), ...(language ? [language] : [])];
  }, [currentTheme, fileName, fontSize]);

  const create = async () => {
    const skillName = name.trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName) || skillName.length > 64) { toast.error(t('settings.skills.page.toast.invalidSkillName')); return; }
    if (skills.some(skill => skill.authoredSkillId === skillName && skill.scope === scope)) { toast.error(t('settings.skills.page.toast.skillExists')); return; }
    setCreating(true);
    try {
      const success = await createSkill({ name: skillName, scope, content, supportingFiles: files }, directory);
      if (success) toast.success(t('settings.skills.page.toast.skillCreated'));
      else toast.error(t('settings.skills.page.toast.createSkillFailed'));
    } finally { setCreating(false); }
  };
  const openFile = async (path: string) => {
    const owner = editorKey;
    setFileName(path);
    setFilePending(true);
    try {
      const text = isNew ? files.find(file => file.path === path)?.content ?? null : reference ? await useSkillsStore.getState().readSupportingFile(reference, path, directory) : null;
      if (current.current.key !== owner) return;
      if (text === null) { toast.error(t('settings.skills.page.toast.loadFileContentFailed')); return; }
      setFileContent(text);
      setFilePath(path);
    } finally { setFilePending(false); }
  };
  const saveFile = async () => {
    if (readOnly || filePending) return;
    const path = fileName.trim();
    if (!path) { toast.error(t('settings.skills.page.toast.fileNameRequired')); return; }
    if (path === 'SKILL.md') { toast.error(t('settings.skills.page.toast.fileExists')); return; }
    if (isNew) {
      setFiles(previous => [...previous.filter(file => file.path !== filePath), { path, content: fileContent }]);
      setFilePath(null);
      return;
    }
    if (!reference) return;
    setFilePending(true);
    try {
      const success = await useSkillsStore.getState().writeSupportingFile(reference, path, fileContent, directory);
      if (!success) { toast.error(t('settings.skills.page.toast.updateFileFailed')); return; }
      const detail = await getSkillDetail(reference, directory);
      if (detail) setFiles(detail.supportingFiles.map(file => ({ path: file.path, content: '' })));
      setFilePath(null);
    } finally { setFilePending(false); }
  };
  const confirmDelete = async () => {
    if (!deleteFile || readOnly) return;
    if (isNew) { setFiles(previous => previous.filter(file => file.path !== deleteFile)); setDeleteFile(null); return; }
    if (!reference) return;
    setFilePending(true);
    try {
      if (await useSkillsStore.getState().deleteSupportingFile(reference, deleteFile, directory)) {
        setFiles(previous => previous.filter(file => file.path !== deleteFile));
        setDeleteFile(null);
      } else toast.error(t('settings.skills.page.toast.deleteFileFailed'));
    } finally { setFilePending(false); }
  };

  if (!selected && !isNew) return <div className="p-6 text-muted-foreground">{t('settings.skills.page.empty.title')}</div>;
  if (loading) return <div className="p-6 text-muted-foreground">{t('settings.skills.page.loading.details')}</div>;
  if (loadFailed) return <div className="p-6 text-destructive">{t('settings.skills.page.toast.loadFileContentFailed')}</div>;
  return <>
    <SettingsPageLayout title={isNew ? t('settings.skills.page.title.newSkill') : selected?.name} description={selectedNative?.source} onBlurCapture={autosave.onBlurCapture}>
      {applyFailed && <p role="alert" className="text-sm text-[var(--status-warning)]">{t('settings.skills.page.status.sourceCommittedApplyFailed')}</p>}
      {isNew && <SettingsSection title={t('settings.skills.page.section.basicInformation')}>
        <SettingsFieldRow label={t('settings.skills.page.field.skillNameLocation')}>
          <Input value={name} onChange={event => setName(event.target.value)} placeholder={t('settings.skills.page.field.skillNamePlaceholder')} />
          <Select value={scope} onValueChange={value => { if (value === 'workspace' || value === 'agent') setScope(value); }}>
            <SelectTrigger>{scope === 'workspace' ? t('settings.skills.sidebar.section.project') : t('settings.skills.sidebar.section.user')}</SelectTrigger>
            <SelectContent><SelectItem value="workspace">{t('settings.skills.sidebar.section.project')}</SelectItem><SelectItem value="agent">{t('settings.skills.sidebar.section.user')}</SelectItem></SelectContent>
          </Select>
        </SettingsFieldRow>
      </SettingsSection>}
      <SettingsSection title={t('settings.skills.page.section.instructions')} headerAction={<PreviewToggleButton currentMode={preview ? 'preview' : 'edit'} onToggle={() => setPreview(value => !value)} />}>
        <div className="h-[clamp(320px,58dvh,680px)] overflow-hidden rounded-md border" onKeyDown={event => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); autosave.requestSave(); } }}>
          {preview ? <ScrollableOverlay outerClassName="h-full"><SimpleMarkdownRenderer content={content} stripFrontmatter enableFileReferences={false} /></ScrollableOverlay> : <CodeMirrorEditor value={content} onChange={setContent} readOnly={readOnly} extensions={extensions} className="h-full" enableSearch />}
        </div>
      </SettingsSection>
      <SettingsSection title={t('settings.skills.page.section.supportingFiles')} headerAction={<Button size="xs" variant="outline" disabled={readOnly} onClick={() => { setFilePath(''); setFileName(''); setFileContent(''); }}>{t('settings.skills.page.actions.addFile')}</Button>}>
        {files.length === 0 ? <p className="text-muted-foreground">{t('settings.skills.page.supportingFiles.empty')}</p> : files.map(file => <div key={file.path} className="flex items-center gap-2 py-2"><button onClick={() => void openFile(file.path)} className="flex-1 text-left">{file.path}</button><Button size="xs" variant="ghost" disabled={readOnly} onClick={() => setDeleteFile(file.path)}><Icon name="delete-bin" className="h-3.5 w-3.5" /></Button></div>)}
      </SettingsSection>
      {isNew && <SettingsSection><Button size="xs" disabled={creating || !name.trim() || !content.trim()} onClick={() => void create()}>{creating ? t('settings.common.actions.saving') : t('settings.skills.page.actions.createSkill')}</Button><Button size="xs" variant="ghost" disabled={creating} onClick={() => { setSkillDraft(null); setSelectedSkill(null); }}>{t('settings.common.actions.cancel')}</Button></SettingsSection>}
    </SettingsPageLayout>
    <Dialog open={filePath !== null} onOpenChange={open => { if (!open && !filePending) setFilePath(null); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{filePath ? t('settings.skills.page.fileDialog.titleEdit') : t('settings.skills.page.fileDialog.titleAdd')}</DialogTitle>
          <DialogDescription>{t('settings.skills.page.fileDialog.descriptionEdit')}</DialogDescription>
        </DialogHeader>
        <Input value={fileName} onChange={event => setFileName(event.target.value)} disabled={!!filePath || readOnly || filePending} placeholder={t('settings.skills.page.fileDialog.field.filePathPlaceholder')} />
        <div className="h-[45vh] overflow-hidden rounded-md border">
          <CodeMirrorEditor value={fileContent} onChange={setFileContent} readOnly={readOnly || filePending} extensions={fileExtensions} className="h-full" enableSearch />
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={filePending} onClick={() => setFilePath(null)}>{t('settings.common.actions.cancel')}</Button>
          <Button disabled={readOnly || filePending || !fileName.trim()} onClick={() => void saveFile()}>{t('settings.common.actions.saveChanges')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={deleteFile !== null} onOpenChange={open => { if (!open && !filePending) setDeleteFile(null); }}><DialogContent><DialogHeader><DialogTitle>{t('settings.skills.page.deleteFileDialog.title')}</DialogTitle><DialogDescription>{t('settings.skills.page.deleteFileDialog.description', { path: deleteFile ?? '' })}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" disabled={filePending} onClick={() => setDeleteFile(null)}>{t('settings.common.actions.cancel')}</Button><Button variant="destructive" disabled={filePending} onClick={() => void confirmDelete()}>{t('settings.common.actions.delete')}</Button></DialogFooter></DialogContent></Dialog>
  </>;
};
export const SkillsPage: React.FC<SkillsPageProps> = ({ view = 'installed' }) => view === 'catalog' ? <SkillsCatalogPage mode="external" onModeChange={() => {}} showModeTabs={false} /> : <SkillsInstalledPage />;
