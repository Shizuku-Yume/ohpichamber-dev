import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { selectSkillsForDirectory, useSkillsStore } from '@/stores/useSkillsStore';
import type { SkillReference, DiscoveredSkill } from '@/stores/useSkillsStore';
import type { SkillFileCatalogState } from '@openchamber/agent-contract';
import { FileResourcePathSchema } from '@openchamber/agent-contract';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useShallow } from 'zustand/react/shallow';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { SettingsSidebarNoMatches, SettingsSidebarSearch } from '@/components/sections/shared/SettingsSidebarSearch';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { SETTINGS_SECTION_TITLE_CLASS } from '@/components/sections/shared/SettingsSection';

interface SkillsSidebarProps { onItemSelect?: () => void }
type SettingsSkill = { kind: 'native'; skill: DiscoveredSkill } | { kind: 'authored-only'; skill: SkillFileCatalogState['skills'][number] };
interface SkillAction { name: string; reference: SkillReference }
export const SkillsSidebar: React.FC<SkillsSidebarProps> = ({ onItemSelect }) => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const [query, setQuery] = React.useState('');
  const [deleting, setDeleting] = React.useState<SkillAction | null>(null);
  const [renaming, setRenaming] = React.useState<SkillAction | null>(null);
  const [name, setName] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const { selectedSkillName, setSelectedSkill, setSkillDraft, loadSkills, getSkillDetail, deleteSkill, renameSkill } = useSkillsStore(useShallow(state => ({
    selectedSkillName: state.selectedSkillName, setSelectedSkill: state.setSelectedSkill, setSkillDraft: state.setSkillDraft,
    loadSkills: state.loadSkills, getSkillDetail: state.getSkillDetail, deleteSkill: state.deleteSkill, renameSkill: state.renameSkill,
  })));
  const skills = useSkillsStore(state => selectSkillsForDirectory(state, directory));
  const fileCatalog = useSkillsStore(state => state.filesByDirectory[directory ?? '__default__']);
  const authoredSelection = useSkillsStore(state => state.selectedAuthoredSkill);
  const setSelectedAuthoredSkill = useSkillsStore(state => state.setSelectedAuthoredSkill);
  const settingsSkills: SettingsSkill[] = [
    ...skills.map(skill => ({ kind: 'native' as const, skill })),
    ...(fileCatalog?.skills ?? []).filter(file => !skills.some(skill => skill.authoredSkillId === file.skillId && skill.scope === file.scope)).map(skill => ({ kind: 'authored-only' as const, skill })),
  ];
  const applyFailed = useSkillsStore(state => state.lastMutationDirectory === directory && (state.lastMutationResult?.apply?.status === 'partial' || state.lastMutationResult?.apply?.status === 'failed'));
  React.useEffect(() => { void loadSkills(directory); }, [directory, loadSkills]);
  const draftName = (base: string) => {
    let candidate = base;
    let count = 1;
    while (settingsSkills.some(entry => entry.skill.name === candidate)) candidate = `${base}-${count++}`;
    return candidate;
  };
  const create = () => {
    const name = draftName('new-skill');
    setSkillDraft({ name, scope: 'agent', content: `---\nname: ${name}\ndescription: ""\n---\n\n` });
    setSelectedSkill(name);
    onItemSelect?.();
  };
  const duplicate = async (reference: SkillReference, skillName: string, scope: string) => {
    const ownerDirectory = directory;
    const detail = await getSkillDetail(reference, ownerDirectory);
    if (!detail) { toast.error(t('settings.skills.sidebar.toast.duplicateLoadFailed')); return; }
    const pendingFiles = [];
    for (const file of detail.supportingFiles) {
      const content = await useSkillsStore.getState().readSupportingFile(reference, file.path, ownerDirectory);
      if (content === null) { toast.error(t('settings.skills.sidebar.toast.duplicateLoadFailed')); return; }
      pendingFiles.push({ path: file.path, content });
    }
    const name = draftName(`${skillName}-copy`);
    setSkillDraft({ name, scope: scope === 'workspace' ? 'workspace' : 'agent', content: detail.content, pendingFiles });
    setSelectedSkill(name);
    onItemSelect?.();
  };
  const remove = async () => {
    if (!deleting || pending) return;
    setPending(true);
    try {
      if (await deleteSkill(deleting.reference, directory)) {
        toast.success(t('settings.skills.sidebar.toast.skillDeleted', { name: deleting.name }));
        setDeleting(null);
      } else toast.error(t('settings.skills.sidebar.toast.deleteSkillFailed'));
    } finally { setPending(false); }
  };
  const rename = async () => {
    if (!renaming || pending) return;
    const nextName = name.trim();
    if (!FileResourcePathSchema.safeParse(nextName).success) { toast.error(t('settings.skills.page.toast.invalidSkillName')); return; }
    setPending(true);
    try {
      if (await renameSkill(renaming.reference, nextName, directory)) {
        toast.success(t('settings.skills.sidebar.toast.skillRenamed', { name: nextName }));
        setRenaming(null);
      } else toast.error(t('settings.skills.sidebar.toast.renameFailed'));
    } finally { setPending(false); }
  };
  const shown = settingsSkills.filter(entry => matchesRankQuery([entry.skill.name, entry.kind === 'native' ? entry.skill.description : entry.skill.skillId], query));
  return <div className="flex h-full flex-col bg-background">
    <div className="border-b px-3 pt-4 pb-3">
      <h2 className={`${SETTINGS_SECTION_TITLE_CLASS} mb-3`}>{t('settings.skills.sidebar.title')}</h2>
      <SettingsProjectSelector className="mb-3" />
      <div className="flex items-center justify-between">
        <span className="typography-meta text-muted-foreground">{t('settings.skills.sidebar.total', { count: settingsSkills.length })}</span>
        <Button data-settings-item="skills.create" size="sm" variant="ghost" onClick={create}><Icon name="add" className="h-3.5 w-3.5" /></Button>
      </div>
      <SettingsSidebarSearch value={query} onChange={setQuery} />
    </div>
    {applyFailed && <p role="alert" className="px-3 py-2 text-sm text-[var(--status-warning)]">{t('settings.skills.page.status.sourceCommittedApplyFailed')}</p>}
    <ScrollableOverlay outerClassName="flex-1 min-h-0" className="px-3 py-2">
      {shown.length === 0 && <SettingsSidebarNoMatches query={query} />}
      {(['workspace', 'agent', 'inherited'] as const).map(scope => {
        const entries = shown.filter(entry => entry.skill.scope === scope);
        if (!entries.length) return null;
        return <React.Fragment key={scope}>
          <div className="px-2 pt-3 pb-1 text-xs font-semibold uppercase text-muted-foreground">{scope === 'workspace' ? t('settings.skills.sidebar.section.project') : scope === 'agent' ? t('settings.skills.sidebar.section.user') : t('settings.skills.sidebar.title')}</div>
          {entries.map(entry => {
            const reference: SkillReference = entry.kind === 'native' ? entry.skill.skillId : { scope: entry.skill.scope, authoredSkillId: entry.skill.skillId };
            const editable = entry.kind === 'authored-only' || (!entry.skill.readOnly && !!entry.skill.authoredSkillId);
            const isSelected = typeof reference === 'string' ? selectedSkillName === reference : authoredSelection?.scope === reference.scope && authoredSelection.authoredSkillId === reference.authoredSkillId;
            return <div key={`${entry.kind}:${entry.skill.scope}:${entry.skill.skillId}`} className={`flex items-center rounded-md px-2 py-1 ${isSelected ? 'bg-interactive-selection' : 'hover:bg-interactive-hover'}`}>
              <button className="min-w-0 flex-1 truncate text-left" onClick={() => { if (typeof reference === 'string') setSelectedSkill(reference); else setSelectedAuthoredSkill(reference); onItemSelect?.(); }}>{entry.skill.name}</button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button size="sm" variant="ghost"><Icon name="more-2" className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => void duplicate(reference, entry.skill.name, entry.skill.scope)}>{t('settings.common.actions.duplicate')}</DropdownMenuItem>
                  {editable && <>
                    <DropdownMenuItem onClick={() => { setName(entry.kind === 'authored-only' ? entry.skill.skillId : entry.skill.authoredSkillId ?? entry.skill.name); setRenaming({ name: entry.skill.name, reference }); }}>{t('settings.common.actions.rename')}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setDeleting({ name: entry.skill.name, reference })} className="text-destructive">{t('settings.common.actions.delete')}</DropdownMenuItem>
                  </>}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>;
          })}
        </React.Fragment>;
      })}
    </ScrollableOverlay>
    <Dialog open={deleting !== null} onOpenChange={open => { if (!open && !pending) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>{t('settings.skills.sidebar.deleteDialog.title')}</DialogTitle><DialogDescription>{t('settings.skills.sidebar.deleteDialog.description', { name: deleting?.name ?? '' })}</DialogDescription></DialogHeader><DialogFooter><Button variant="ghost" disabled={pending} onClick={() => setDeleting(null)}>{t('settings.common.actions.cancel')}</Button><Button disabled={pending} onClick={() => void remove()}>{t('settings.common.actions.delete')}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={renaming !== null} onOpenChange={open => { if (!open && !pending) setRenaming(null); }}><DialogContent><DialogHeader><DialogTitle>{t('settings.skills.sidebar.renameDialog.title')}</DialogTitle><DialogDescription>{t('settings.skills.sidebar.renameDialog.description', { name: renaming?.name ?? '' })}</DialogDescription></DialogHeader><Input value={name} onChange={event => setName(event.target.value)} disabled={pending} placeholder={t('settings.skills.sidebar.renameDialog.placeholder')} /><DialogFooter><Button variant="ghost" disabled={pending} onClick={() => setRenaming(null)}>{t('settings.common.actions.cancel')}</Button><Button disabled={pending} onClick={() => void rename()}>{t('settings.common.actions.rename')}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
};
