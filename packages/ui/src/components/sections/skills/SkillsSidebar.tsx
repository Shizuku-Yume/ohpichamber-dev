import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { isMobileDeviceViaCSS } from '@/lib/device';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { selectAvailableSkillsForDirectory, useSkillsStore, type AuthoredSkillReference, type PendingFile } from '@/stores/useSkillsStore';
import { FileResourcePathSchema } from '@openchamber/agent-contract';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { SettingsSidebarNoMatches, SettingsSidebarSearch } from '@/components/sections/shared/SettingsSidebarSearch';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { SETTINGS_SECTION_TITLE_CLASS } from '@/components/sections/shared/SettingsSection';

interface SkillsSidebarProps {
  onItemSelect?: () => void;
}

type SettingsSkillBase = {
  key: string;
  name: string;
  description: string;
  scope: 'workspace' | 'agent' | 'inherited';
  editable: boolean;
};

type NativeSettingsSkillEntry = SettingsSkillBase & { kind: 'native'; reference: string };
type AuthoredSettingsSkillEntry = SettingsSkillBase & { kind: 'authored'; reference: AuthoredSkillReference; editable: true };
type SettingsSkillListEntry = NativeSettingsSkillEntry | AuthoredSettingsSkillEntry;

export const SkillsSidebar: React.FC<SkillsSidebarProps> = ({ onItemSelect }) => {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [renameDialogSkill, setRenameDialogSkill] = React.useState<SettingsSkillListEntry | null>(null);
  const [renameNewName, setRenameNewName] = React.useState('');
  const [deleteDialogSkill, setDeleteDialogSkill] = React.useState<SettingsSkillListEntry | null>(null);
  const [isDeletePending, setIsDeletePending] = React.useState(false);
  const [openMenuSkill, setOpenMenuSkill] = React.useState<string | null>(null);

  const {
    selectedSkillName,
    setSelectedSkill,
    setSelectedAuthoredSkill,
    setSkillDraft,
    loadSkills,
    getSkillDetail,
    deleteSkill,
    renameSkill,
  } = useSkillsStore(useShallow(state => ({
    selectedSkillName: state.selectedSkillName,
    setSelectedSkill: state.setSelectedSkill,
    setSelectedAuthoredSkill: state.setSelectedAuthoredSkill,
    setSkillDraft: state.setSkillDraft,
    loadSkills: state.loadSkills,
    getSkillDetail: state.getSkillDetail,
    deleteSkill: state.deleteSkill,
    renameSkill: state.renameSkill,
  })));
  const directory = useSettingsDirectory();
  const skills = useSkillsStore(state => selectAvailableSkillsForDirectory(state, directory));
  const fileCatalog = useSkillsStore(state => state.filesByDirectory[directory ?? '__default__']);
  const selectedAuthoredSkill = useSkillsStore(state => state.selectedAuthoredSkill);
  const applyFailed = useSkillsStore(state => state.lastMutationDirectory === directory && (state.lastMutationResult?.apply?.status === 'partial' || state.lastMutationResult?.apply?.status === 'failed'));

  React.useEffect(() => {
    void loadSkills(directory);
  }, [directory, loadSkills]);

  const entries: SettingsSkillListEntry[] = [
    ...skills.map(skill => ({
      kind: 'native' as const,
      key: `native:${skill.scope}:${skill.skillId}`,
      name: skill.name,
      description: skill.description,
      scope: skill.scope,
      reference: skill.skillId,
      editable: !skill.readOnly
        && skill.scope !== 'inherited'
        && Boolean(skill.authoredSkillId)
        && Boolean(fileCatalog?.skills.some(file => file.skillId === skill.authoredSkillId && file.scope === skill.scope)),
    }) satisfies NativeSettingsSkillEntry),
    ...(fileCatalog?.skills ?? [])
      .filter(file => !skills.some(skill => skill.authoredSkillId === file.skillId && skill.scope === file.scope))
      .map(file => ({
        kind: 'authored' as const,
        key: `authored:${file.scope}:${file.skillId}`,
        name: file.name,
        description: '',
        scope: file.scope,
        reference: { scope: file.scope, authoredSkillId: file.skillId },
        editable: true as const,
      }) satisfies AuthoredSettingsSkillEntry),
  ];

  const uniqueDraftName = (base: string): string => {
    let candidate = base;
    let count = 1;
    while (entries.some(entry => entry.name === candidate)) {
      candidate = `${base}-${count++}`;
    }
    return candidate;
  };

  const create = () => {
    const name = uniqueDraftName('new-skill');
    setSkillDraft({ name, scope: 'agent', content: `---\nname: ${name}\ndescription: ""\n---\n\n` });
    setSelectedSkill(name);
    onItemSelect?.();
  };

  const duplicate = async (entry: SettingsSkillListEntry) => {
    const detail = await getSkillDetail(entry.reference, directory);
    if (!detail) {
      toast.error(t('settings.skills.sidebar.toast.duplicateLoadFailed'));
      return;
    }
    const pendingFiles: PendingFile[] = [];
    for (const file of detail.supportingFiles) {
      const content = await useSkillsStore.getState().readSupportingFile(entry.reference, file.path, directory);
      if (content === null) {
        toast.error(t('settings.skills.sidebar.toast.duplicateLoadFailed'));
        return;
      }
      pendingFiles.push({ path: file.path, content });
    }
    const name = uniqueDraftName(`${entry.name}-copy`);
    setSkillDraft({
      name,
      scope: entry.scope === 'workspace' ? 'workspace' : 'agent',
      content: detail.content,
      pendingFiles,
    });
    setSelectedSkill(name);
    onItemSelect?.();
  };

  const openRenameDialog = (entry: SettingsSkillListEntry) => {
    if (!entry.editable) return;
    const authoredId = entry.kind === 'native'
      ? skills.find(skill => skill.skillId === entry.reference)?.authoredSkillId ?? entry.name
      : entry.reference.authoredSkillId;
    setRenameNewName(authoredId);
    setRenameDialogSkill(entry);
  };

  const confirmRename = async () => {
    if (!renameDialogSkill) return;
    const nextName = renameNewName.trim().replace(/\s+/g, '-').toLowerCase();
    const currentName = renameDialogSkill.kind === 'native'
      ? skills.find(skill => skill.skillId === renameDialogSkill.reference)?.authoredSkillId
      : renameDialogSkill.reference.authoredSkillId;
    if (!nextName) {
      toast.error(t('settings.skills.page.toast.skillNameRequired'));
      return;
    }
    if (nextName === currentName) {
      setRenameDialogSkill(null);
      return;
    }
    if (entries.some(entry => entry.key !== renameDialogSkill.key && entry.name === nextName)) {
      toast.error(t('settings.skills.page.toast.skillExists'));
      return;
    }
    if (!FileResourcePathSchema.safeParse(nextName).success) {
      toast.error(t('settings.skills.page.toast.invalidSkillName'));
      return;
    }
    const success = await renameSkill(renameDialogSkill.reference, nextName, directory);
    if (success) {
      toast.success(t('settings.skills.sidebar.toast.skillRenamed', { name: nextName }));
    } else {
      toast.error(t('settings.skills.sidebar.toast.renameFailed'));
    }
    setRenameDialogSkill(null);
  };

  const confirmDelete = async () => {
    if (!deleteDialogSkill) return;
    setIsDeletePending(true);
    try {
      if (await deleteSkill(deleteDialogSkill.reference, directory)) {
        toast.success(t('settings.skills.sidebar.toast.skillDeleted', { name: deleteDialogSkill.name }));
        setDeleteDialogSkill(null);
      } else {
        toast.error(t('settings.skills.sidebar.toast.deleteSkillFailed'));
      }
    } finally {
      setIsDeletePending(false);
    }
  };

  const shownEntries = entries.filter(entry => matchesRankQuery([entry.name, entry.description], query));
  const groups: { scope: SettingsSkillBase['scope']; label: string }[] = [
    { scope: 'workspace', label: t('settings.skills.sidebar.section.project') },
    { scope: 'agent', label: t('settings.skills.sidebar.section.user') },
    // Native `inherited` skills are discovered outside the authored roots.
    // The catalogue has no dedicated heading key yet; fall back to the
    // existing sidebar title rather than rendering an English literal.
    { scope: 'inherited', label: t('settings.skills.sidebar.title') },
  ];

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b px-3 pt-4 pb-3">
        <h2 className={`${SETTINGS_SECTION_TITLE_CLASS} mb-3`}>{t('settings.skills.sidebar.title')}</h2>
        <SettingsProjectSelector className="mb-3" />
        <div className="flex items-center justify-between gap-2">
          <span className="typography-meta text-muted-foreground">{t('settings.skills.sidebar.total', { count: entries.length })}</span>
          <Button
            size="sm"
            data-settings-item="skills.create"
            variant="ghost"
            className="h-7 w-7 px-0 -my-1 text-muted-foreground"
            onClick={create}
            aria-label={t('settings.common.actions.create')}
          >
            <Icon name="add" className="h-3.5 w-3.5" />
          </Button>
        </div>
        {entries.length > 0 ? <SettingsSidebarSearch value={query} onChange={setQuery} /> : null}
      </div>

      {applyFailed ? (
        <p role="alert" className="px-3 py-2 typography-meta text-[var(--status-warning)]">
          {t('settings.skills.page.status.sourceCommittedApplyFailed')}
        </p>
      ) : null}

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2 overflow-x-hidden">
        {entries.length === 0 ? (
          <div className="py-12 px-4 text-center text-muted-foreground">
            <Icon name="book-open" className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="typography-ui-label font-medium">{t('settings.skills.sidebar.empty.title')}</p>
            <p className="typography-meta mt-1 opacity-75">{t('settings.skills.sidebar.empty.description')}</p>
          </div>
        ) : shownEntries.length === 0 ? (
          <SettingsSidebarNoMatches query={query} />
        ) : (
          <>
            {groups.map(({ scope, label }) => {
              const groupEntries = shownEntries
                .filter(entry => entry.scope === scope)
                .sort((a, b) => a.name.localeCompare(b.name));
              if (groupEntries.length === 0) return null;
              return (
                <React.Fragment key={scope}>
                  <div className="px-2 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {label}
                  </div>
                  {groupEntries.map(entry => {
                    return (
                      <SkillListItem
                        key={entry.key}
                        entry={entry}
                        isSelected={entry.kind === 'native'
                          ? selectedSkillName === entry.reference
                          : selectedAuthoredSkill?.scope === entry.reference.scope
                            && selectedAuthoredSkill.authoredSkillId === entry.reference.authoredSkillId}
                        onSelect={() => {
                          if (entry.kind === 'native') setSelectedSkill(entry.reference);
                          else setSelectedAuthoredSkill(entry.reference);
                          onItemSelect?.();
                        }}
                        onRename={() => openRenameDialog(entry)}
                        onDelete={() => setDeleteDialogSkill(entry)}
                        onDuplicate={() => void duplicate(entry)}
                        isMenuOpen={openMenuSkill === entry.key}
                        onMenuOpenChange={open => setOpenMenuSkill(open ? entry.key : null)}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
          </>
        )}
      </ScrollableOverlay>

      <Dialog
        open={deleteDialogSkill !== null}
        onOpenChange={open => {
          if (!open && !isDeletePending) setDeleteDialogSkill(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.skills.sidebar.deleteDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.skills.sidebar.deleteDialog.description', { name: deleteDialogSkill?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              size="sm"
              className="text-foreground hover:bg-interactive-hover hover:text-foreground"
              variant="ghost"
              onClick={() => setDeleteDialogSkill(null)}
              disabled={isDeletePending}
            >
              {t('settings.common.actions.cancel')}
            </Button>
            <Button size="sm" onClick={() => void confirmDelete()} disabled={isDeletePending}>
              {t('settings.common.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameDialogSkill !== null} onOpenChange={open => { if (!open) setRenameDialogSkill(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.skills.sidebar.renameDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.skills.sidebar.renameDialog.description', { name: renameDialogSkill?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameNewName}
            onChange={event => setRenameNewName(event.target.value)}
            placeholder={t('settings.skills.sidebar.renameDialog.placeholder')}
            className="text-foreground placeholder:text-muted-foreground"
            onKeyDown={event => {
              if (event.key === 'Enter') void confirmRename();
            }}
          />
          <DialogFooter>
            <Button
              size="sm"
              className="text-foreground hover:bg-interactive-hover hover:text-foreground"
              variant="ghost"
              onClick={() => setRenameDialogSkill(null)}
            >
              {t('settings.common.actions.cancel')}
            </Button>
            <Button size="sm" onClick={() => void confirmRename()}>
              {t('settings.common.actions.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface SkillListItemProps {
  entry: SettingsSkillListEntry;
  isSelected: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}

const SkillListItem: React.FC<SkillListItemProps> = ({
  entry,
  isSelected,
  onSelect,
  onRename,
  onDelete,
  onDuplicate,
  isMenuOpen,
  onMenuOpenChange,
}) => {
  const { t } = useI18n();
  const isMobile = isMobileDeviceViaCSS();
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);
  const renderMenuItems = (Item: React.ElementType) => (
    <>
      {entry.editable ? (
        <Item onClick={(event: React.MouseEvent) => { event.stopPropagation(); onRename(); }}>
          <Icon name="edit" className="h-4 w-4 mr-px" />
          {t('settings.common.actions.rename')}
        </Item>
      ) : null}
      <Item onClick={(event: React.MouseEvent) => { event.stopPropagation(); onDuplicate(); }}>
        <Icon name="file-copy" className="h-4 w-4 mr-px" />
        {t('settings.common.actions.duplicate')}
      </Item>
      {entry.editable ? (
        <Item onClick={(event: React.MouseEvent) => { event.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive">
          <Icon name="delete-bin" className="h-4 w-4 mr-px" />
          {t('settings.common.actions.delete')}
        </Item>
      ) : null}
    </>
  );
  return (
    <ContextMenu open={isContextMenuOpen} onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger render={<div className={cn('group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200 select-none', isSelected ? 'bg-interactive-selection' : 'hover:bg-interactive-hover')} onContextMenu={!isMobile ? event => { event.preventDefault(); setIsContextMenuOpen(true); } : undefined} />}>
        <div className="flex min-w-0 flex-1 items-center">
          <button
            onClick={onSelect}
            className="flex min-w-0 flex-1 flex-col gap-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
          >
            <div className="flex items-center gap-2">
              <span className="typography-ui-label font-normal truncate text-foreground">{entry.name}</span>
            </div>
            {entry.description ? (
              <div className="typography-micro text-muted-foreground/60 truncate leading-tight">{entry.description}</div>
            ) : null}
          </button>

<<<<<<< HEAD
          <DropdownMenu open={isMenuOpen} onOpenChange={open => { if (open) setIsContextMenuOpen(false); onMenuOpenChange(open); }}>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 px-0 flex-shrink-0 -mr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                aria-label={entry.name}
              >
                <Icon name="more-2" className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit min-w-20">
              {renderMenuItems(DropdownMenuItem)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
=======
        {!isBuiltIn ? <DropdownMenu open={isMenuOpen} onOpenChange={(open) => { if (open) setIsContextMenuOpen(false); onMenuOpenChange(open); }}>
          <DropdownMenuTrigger asChild>
            <Button size="sm"
              variant="ghost"
              className="h-6 w-6 px-0 flex-shrink-0 -me-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 pointer-fine:hidden"
            >
              <Icon name="more" className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-fit min-w-20">
            {renderMenuItems(DropdownMenuItem)}
          </DropdownMenuContent>
        </DropdownMenu> : null}
      </div>
>>>>>>> bc50ba56a
      </ContextMenuTrigger>
      <ContextMenuContent className="w-fit min-w-20">
        {renderMenuItems(ContextMenuItem)}
      </ContextMenuContent>
    </ContextMenu>
  );
};
