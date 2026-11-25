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
import { selectCommandsForDirectory, useCommandsStore, type Command } from '@/stores/useCommandsStore';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useShallow } from 'zustand/react/shallow';
import { SettingsSidebarLayout } from '@/components/sections/shared/SettingsSidebarLayout';
import { cn } from '@/lib/utils';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { SettingsSidebarNoMatches, SettingsSidebarSearch } from '@/components/sections/shared/SettingsSidebarSearch';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';
import { SETTINGS_SECTION_TITLE_CLASS } from '@/components/sections/shared/SettingsSection';


interface CommandsSidebarProps {
  onItemSelect?: () => void;
}

export const CommandsSidebar: React.FC<CommandsSidebarProps> = ({ onItemSelect }) => {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [renameDialogCommand, setRenameDialogCommand] = React.useState<Command | null>(null);
  const [renameNewName, setRenameNewName] = React.useState('');
  const [confirmActionCommand, setConfirmActionCommand] = React.useState<Command | null>(null);
  const [isConfirmActionPending, setIsConfirmActionPending] = React.useState(false);
  const [openMenuCommand, setOpenMenuCommand] = React.useState<string | null>(null);

  const {
    selectedCommandId,
    selectedCommandName,
    setSelectedCommand,
    setSelectedCommandId,
    setCommandDraft,
    updateCommand,
    deleteCommand,
    loadCommands,
  } = useCommandsStore(useShallow((s) => ({
    selectedCommandId: s.selectedCommandId,
    selectedCommandName: s.selectedCommandName,
    setSelectedCommand: s.setSelectedCommand,
    setSelectedCommandId: s.setSelectedCommandId,
    setCommandDraft: s.setCommandDraft,
    updateCommand: s.updateCommand,
    deleteCommand: s.deleteCommand,
    loadCommands: s.loadCommands,
  })));
  const settingsDirectory = useSettingsDirectory();
  const commands = useCommandsStore((state) => selectCommandsForDirectory(state, settingsDirectory));
  React.useEffect(() => { void loadCommands(settingsDirectory); }, [loadCommands, settingsDirectory]);
  // Built-in OMP commands are chat autocomplete's; this page authors the
  // template files, so it lists only the entries a file owns.
  const templateItems = React.useMemo(() => commands.filter((command) => command.editable), [commands]);


  const handleCreateNew = () => {
    const baseName = 'new-command';
    let newName = baseName;
    let counter = 1;
    while (templateItems.some((c) => c.name === newName)) {
      newName = `${baseName}-${counter}`;
      counter++;
    }

    // Set draft and open the page for editing
    setCommandDraft({ name: newName, scope: 'agent' });
    setSelectedCommand(newName);
    onItemSelect?.();

  };

  const handleDeleteCommand = async (command: Command) => {
    setConfirmActionCommand(command);
  };

  const closeConfirmActionDialog = () => {
    setConfirmActionCommand(null);
  };

  const handleConfirmAction = async () => {
    if (!confirmActionCommand) {
      return;
    }

    setIsConfirmActionPending(true);
    const success = await deleteCommand(confirmActionCommand.name, settingsDirectory, confirmActionCommand.commandId);

    if (success) {
      toast.success(t('settings.commands.sidebar.toast.commandDeleted', { name: confirmActionCommand.name }));
      closeConfirmActionDialog();
    } else {
      toast.error(t('settings.commands.sidebar.toast.deleteFailed'));
    }

    setIsConfirmActionPending(false);
  };

  const handleDuplicateCommand = (command: Command) => {
    const baseName = command.name;
    let copyNumber = 1;
    let newName = `${baseName}-copy`;

    while (templateItems.some((c) => c.name === newName)) {
      copyNumber++;
      newName = `${baseName}-copy-${copyNumber}`;
    }

    setCommandDraft({
      name: newName,
      scope: command.scope === 'workspace' ? 'workspace' : 'agent',
      description: command.description,
      content: command.content,
      argumentHint: command.argumentHint,
      agentId: command.agentId,
      modelSelection: command.modelSelection,
      group: command.group,
    });
    setSelectedCommand(newName);

  };

  const handleOpenRenameDialog = (command: Command) => {
    setRenameNewName(command.name);
    setRenameDialogCommand(command);
  };

  const handleRenameCommand = async () => {
    if (!renameDialogCommand) return;

    const sanitizedName = renameNewName.trim().replace(/\s+/g, '-');

    if (!sanitizedName) {
      toast.error(t('settings.commands.sidebar.toast.commandNameRequired'));
      return;
    }

    if (sanitizedName === renameDialogCommand.name) {
      setRenameDialogCommand(null);
      return;
    }

    if (templateItems.some((cmd) => cmd.name === sanitizedName)) {
      toast.error(t('settings.commands.sidebar.toast.commandExists'));
      return;
    }

    const success = await updateCommand(renameDialogCommand.name, { name: sanitizedName }, settingsDirectory, renameDialogCommand.commandId);

    if (success) {
      toast.success(t('settings.common.status.saved'));
      setSelectedCommand(sanitizedName);
    } else {
      toast.error(t('settings.commands.sidebar.toast.renameFailed'));
    }

    setRenameDialogCommand(null);
  };

  const shownCommands = templateItems.filter((command) => matchesRankQuery([command.name, command.description], query));

  return (
    <>
      <SettingsSidebarLayout
        variant="background"
        header={(
          <div className="border-b px-3 pt-4 pb-3">
            <h2 className={`${SETTINGS_SECTION_TITLE_CLASS} mb-3`}>{t('settings.commands.sidebar.title')}</h2>
            <SettingsProjectSelector className="mb-3" />
            <div className="flex items-center justify-between gap-2">
              <span className="typography-meta text-muted-foreground">{t('settings.commands.sidebar.total', { count: templateItems.length })}</span>
              <Button size="sm"
                data-settings-item="commands.create"
                variant="ghost"
                className="h-7 w-7 px-0 -my-1 text-muted-foreground"
                onClick={handleCreateNew}
                aria-label={t('settings.common.actions.create')}
              >
                <Icon name="add" className="h-3.5 w-3.5" />
              </Button>
            </div>
            {templateItems.length > 0 ? <SettingsSidebarSearch value={query} onChange={setQuery} /> : null}
          </div>
        )}
      >
        {templateItems.length === 0 ? (
          <div className="py-12 px-4 text-center text-muted-foreground">
            <Icon name="terminal-box" className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="typography-ui-label font-medium">{t('settings.commands.sidebar.empty.title')}</p>
            <p className="typography-meta mt-1 opacity-75">{t('settings.commands.sidebar.empty.description')}</p>
          </div>
        ) : shownCommands.length === 0 ? (
          <SettingsSidebarNoMatches query={query} />
        ) : (
          [...shownCommands].sort((a, b) => a.name.localeCompare(b.name)).map((command) => (
            <CommandListItem
              key={command.commandId}
              command={command}
              isSelected={selectedCommandId ? selectedCommandId === command.commandId : selectedCommandName === command.name}
              onSelect={() => {
                setSelectedCommandId(command.commandId);
                onItemSelect?.();
              }}
              onRename={() => handleOpenRenameDialog(command)}
              onDelete={() => handleDeleteCommand(command)}
              onDuplicate={() => handleDuplicateCommand(command)}
              isMenuOpen={openMenuCommand === command.commandId}
              onMenuOpenChange={(open) => setOpenMenuCommand(open ? command.commandId : null)}
            />
          ))
        )}
      </SettingsSidebarLayout>

      {confirmActionCommand ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !isConfirmActionPending) {
              closeConfirmActionDialog();
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('settings.commands.sidebar.dialog.deleteTitle')}</DialogTitle>
              <DialogDescription>
                {t('settings.commands.sidebar.dialog.deleteDescription', { name: confirmActionCommand.name })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                size="sm"
                variant="ghost"
                onClick={closeConfirmActionDialog}
                disabled={isConfirmActionPending}
              >
                {t('settings.common.actions.cancel')}
              </Button>
              <Button size="sm" onClick={handleConfirmAction} disabled={isConfirmActionPending}>
                {t('settings.common.actions.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      <Dialog open={renameDialogCommand !== null} onOpenChange={(open) => !open && setRenameDialogCommand(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.commands.sidebar.renameDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('settings.commands.sidebar.renameDialog.description', { name: renameDialogCommand?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameNewName}
            onChange={(e) => setRenameNewName(e.target.value)}
            placeholder={t('settings.commands.sidebar.renameDialog.placeholder')}
            className="text-foreground placeholder:text-muted-foreground"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRenameCommand();
              }
            }}
          />
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRenameDialogCommand(null)}
            >
              {t('settings.common.actions.cancel')}
            </Button>
            <Button size="sm" onClick={handleRenameCommand}>
              {t('settings.common.actions.rename')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

interface CommandListItemProps {
  command: Command;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  onDuplicate: () => void;
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}

const CommandListItem: React.FC<CommandListItemProps> = ({
  command,
  isSelected,
  onSelect,
  onDelete,
  onRename,
  onDuplicate,
  isMenuOpen,
  onMenuOpenChange,
}) => {
  const { t } = useI18n();
  const isMobile = isMobileDeviceViaCSS();
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);
  const renderMenuItems = (Item: React.ElementType) => (
    <>
      {onRename && (
        <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRename(); }}>
          <Icon name="edit" className="h-4 w-4 mr-px" />
          {t('settings.common.actions.rename')}
        </Item>
      )}
      <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDuplicate(); }}>
        <Icon name="file-copy" className="h-4 w-4 mr-px" />
        {t('settings.common.actions.duplicate')}
      </Item>
      {onDelete && (
        <Item onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive">
          <Icon name="delete-bin" className="h-4 w-4 mr-px" />
          {t('settings.common.actions.delete')}
        </Item>
      )}
    </>
  );
  return (
    <ContextMenu open={isContextMenuOpen} onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger render={<div className={cn('group relative flex items-center rounded-md px-2 py-1.5 transition-[background-color,color] duration-150 ease-out motion-reduce:transition-none select-none', isSelected ? 'oc-selected' : 'hover:bg-interactive-hover')} onContextMenu={!isMobile ? (e) => { e.preventDefault(); setIsContextMenuOpen(true); } : undefined} />}>
        <div className="flex min-w-0 flex-1 items-center">
          <button
            onClick={onSelect}
            className="flex min-w-0 flex-1 flex-col gap-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
          >
            <div className="flex items-center gap-2">
              <span className="typography-ui-label font-normal truncate text-foreground">
                /{command.name}
              </span>
              <span className="typography-micro text-muted-foreground bg-muted px-1 rounded flex-shrink-0 leading-none pb-px border border-border/50">
                {t(command.scope === 'workspace' ? 'settings.common.scope.project' : 'settings.common.scope.global')}
                {command.group ? ` / ${command.group}` : ''}
              </span>
            </div>

            {command.description && (
              <div className="typography-micro text-muted-foreground truncate leading-tight">
                {command.description}
              </div>
            )}
          </button>

          <DropdownMenu open={isMenuOpen} onOpenChange={(open) => { if (open) setIsContextMenuOpen(false); onMenuOpenChange(open); }}>
            <DropdownMenuTrigger asChild>
              <Button size="sm"
                variant="ghost"
                className="h-6 w-6 px-0 flex-shrink-0 -mr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                aria-label={command.name}
              >
                <Icon name="more-2" className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit min-w-20">
              {renderMenuItems(DropdownMenuItem)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-fit min-w-20">
        {renderMenuItems(ContextMenuItem)}
      </ContextMenuContent>
    </ContextMenu>
  );
};
