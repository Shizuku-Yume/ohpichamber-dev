import React from 'react';
import type { Agent } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { isMobileDeviceViaCSS } from '@/lib/device';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { SettingsSidebarNoMatches, SettingsSidebarSearch } from '@/components/sections/shared/SettingsSidebarSearch';
import { matchesRankQuery } from '@/lib/search/fuzzySearch';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { SETTINGS_SECTION_TITLE_CLASS } from '@/components/sections/shared/SettingsSection';
import { problemMessage } from '@/lib/problemMessage';

interface AgentsSidebarProps { onItemSelect?: () => void }
interface AgentAction { agent: Agent; revision: string; directory: string | null }

export const AgentsSidebar: React.FC<AgentsSidebarProps> = ({ onItemSelect }) => {
  const { t } = useI18n();
<<<<<<< HEAD
||||||| bc50ba56aa
  const [query, setQuery] = React.useState('');
  const [renameDialogAgent, setRenameDialogAgent] = React.useState<Agent | null>(null);
  const [renameNewName, setRenameNewName] = React.useState('');
  const [confirmDeleteAgent, setConfirmDeleteAgent] = React.useState<Agent | null>(null);
  const [isConfirmDeletePending, setIsConfirmDeletePending] = React.useState(false);
  const [openMenuAgent, setOpenMenuAgent] = React.useState<string | null>(null);

  const {
    selectedAgentName,
    setSelectedAgent,
    setAgentDraft,
    createAgent,
    deleteAgent,
    loadAgents,
    loadDisabledAgents,
    updateAgent,
    fetchAgentEntity,
  } = useAgentsStore(useShallow((s) => ({
    selectedAgentName: s.selectedAgentName,
    setSelectedAgent: s.setSelectedAgent,
    setAgentDraft: s.setAgentDraft,
    createAgent: s.createAgent,
    deleteAgent: s.deleteAgent,
    loadAgents: s.loadAgents,
    loadDisabledAgents: s.loadDisabledAgents,
    updateAgent: s.updateAgent,
    fetchAgentEntity: s.fetchAgentEntity,
  })));

  // Settings browses whichever project its own selector points at; the app
  // stays where it is.
=======
  const [query, setQuery] = React.useState('');
  const [renameDialogAgent, setRenameDialogAgent] = React.useState<Agent | null>(null);
  const [renameNewName, setRenameNewName] = React.useState('');
  const [confirmDeleteAgent, setConfirmDeleteAgent] = React.useState<Agent | null>(null);
  const [isConfirmDeletePending, setIsConfirmDeletePending] = React.useState(false);
  const [openMenuAgent, setOpenMenuAgent] = React.useState<string | null>(null);

  const {
    selectedAgentName,
    setSelectedAgent,
    setAgentDraft,
    createAgent,
    deleteAgent,
    loadAgents,
    loadDisabledAgents,
    updateAgent,
    fetchAgentEntity,
  } = useAgentsStore(useShallow((s) => ({
    selectedAgentName: s.selectedAgentName,
    setSelectedAgent: s.setSelectedAgent,
    setAgentDraft: s.setAgentDraft,
    createAgent: s.createAgent,
    deleteAgent: s.deleteAgent,
    loadAgents: s.loadAgents,
    loadDisabledAgents: s.loadDisabledAgents,
    updateAgent: s.updateAgent,
    fetchAgentEntity: s.fetchAgentEntity,
  })));

>>>>>>> upstream/main
  const settingsDirectory = useSettingsDirectory();
  const key = settingsDirectory?.trim() || '__default__';
  const agents = useAgentsStore((state) => selectAgentsForDirectory(state, settingsDirectory));
  const revision = useAgentsStore((state) => state.revisionsByDirectory[key]);
  const error = useAgentsStore((state) => state.errorsByDirectory[key]);
  const { selectedAgentName, setSelectedAgent, setAgentDraft, loadAgents, updateAgent, deleteAgent } = useAgentsStore(useShallow((state) => ({
    selectedAgentName: state.selectedAgentName, setSelectedAgent: state.setSelectedAgent,
    setAgentDraft: state.setAgentDraft, loadAgents: state.loadAgents,
    updateAgent: state.updateAgent, deleteAgent: state.deleteAgent,
  })));
  const [query, setQuery] = React.useState('');
  const [renameAction, setRenameAction] = React.useState<AgentAction | null>(null);
  const [renameNewName, setRenameNewName] = React.useState('');
  const [deleteAction, setDeleteAction] = React.useState<AgentAction | null>(null);
  const [pendingAction, setPendingAction] = React.useState(false);
  const [openMenuAgent, setOpenMenuAgent] = React.useState<string | null>(null);
  const directoryRef = React.useRef(settingsDirectory);
  directoryRef.current = settingsDirectory;

  React.useEffect(() => {
    setRenameAction(null);
    setDeleteAction(null);
    setOpenMenuAgent(null);
    void loadAgents(settingsDirectory);
<<<<<<< HEAD
  }, [loadAgents, settingsDirectory]);
||||||| bc50ba56aa
    void loadDisabledAgents(settingsDirectory);
  }, [loadAgents, loadDisabledAgents, settingsDirectory]);

  // Disabling keeps the agent's file; OpenCode just stops loading it. The last
  // agent a chat can run as is never offered, so the composer keeps one.
  const selectablePrimaryCount = agents.filter((agent) => isPrimaryMode(agent.mode) && !isAgentHidden(agent)).length;
  const canDisable = (agent: Agent) => !(isPrimaryMode(agent.mode) && !isAgentHidden(agent) && selectablePrimaryCount <= 1);

  const setAgentDisabled = async (name: string, disabled: boolean) => {
    setPendingToggleAgent(name);
    try {
      // Throws when the write fails; a write whose list refresh lags still landed.
      await updateAgent(name, { disabled }, settingsDirectory);
      if (disabled && selectedAgentName === name) setSelectedAgent(null);
      toast.success(disabled
        ? t('settings.agents.sidebar.toast.agentDisabled', { name })
        : t('settings.agents.sidebar.toast.agentEnabled', { name }));
    } catch {
      toast.error(disabled
        ? t('settings.agents.sidebar.toast.disableFailed')
        : t('settings.agents.sidebar.toast.enableFailed'));
    } finally {
      setPendingToggleAgent(null);
    }
  };
  const shownDisabledAgents = disabledAgents.filter((agent) => matchesRankQuery([agent.name, agent.description], query));

  const bgClass = 'bg-background';
=======
    void loadDisabledAgents(settingsDirectory);
  }, [loadAgents, loadDisabledAgents, settingsDirectory]);

  const selectablePrimaryCount = agents.filter((agent) => isPrimaryMode(agent.mode) && !isAgentHidden(agent)).length;
  const canDisable = (agent: Agent) => !(isPrimaryMode(agent.mode) && !isAgentHidden(agent) && selectablePrimaryCount <= 1);

  const setAgentDisabled = async (name: string, disabled: boolean) => {
    setPendingToggleAgent(name);
    try {
      await updateAgent(name, { disabled }, settingsDirectory);
      if (disabled && selectedAgentName === name) setSelectedAgent(null);
      toast.success(disabled
        ? t('settings.agents.sidebar.toast.agentDisabled', { name })
        : t('settings.agents.sidebar.toast.agentEnabled', { name }));
    } catch {
      toast.error(disabled
        ? t('settings.agents.sidebar.toast.disableFailed')
        : t('settings.agents.sidebar.toast.enableFailed'));
    } finally {
      setPendingToggleAgent(null);
    }
  };
  const shownDisabledAgents = disabledAgents.filter((agent) => matchesRankQuery([agent.name, agent.description], query));

  const bgClass = 'bg-background';
>>>>>>> upstream/main

  const handleCreateNew = () => {
<<<<<<< HEAD
    let name = 'new-agent';
||||||| bc50ba56aa
    // Generate unique name
    const baseName = 'new-agent';
    let newName = baseName;
=======
    const baseName = 'new-agent';
    let newName = baseName;
>>>>>>> upstream/main
    let counter = 1;
<<<<<<< HEAD
    while (agents.some((agent) => agent.name === name)) name = `new-agent-${counter++}`;
    setAgentDraft({ agentId: crypto.randomUUID(), name, description: '', model: null, allowedTools: null });
    setSelectedAgent(name);
||||||| bc50ba56aa
    while (agents.some((a) => a.name === newName)) {
      newName = `${baseName}-${counter}`;
      counter++;
    }

    // Set draft and open the page for editing
    setAgentDraft({ name: newName, scope: 'user' });
    setSelectedAgent(newName);
=======
    while (agents.some((a) => a.name === newName)) {
      newName = `${baseName}-${counter}`;
      counter++;
    }

    setAgentDraft({ name: newName, scope: 'user' });
    setSelectedAgent(newName);
>>>>>>> upstream/main
    onItemSelect?.();
  };

  const handleDuplicate = (agent: Agent) => {
    let name = `${agent.name}-copy`;
    let counter = 2;
    while (agents.some((entry) => entry.name === name)) name = `${agent.name}-copy-${counter++}`;
    setAgentDraft({ ...agent, agentId: crypto.randomUUID(), name, allowedTools: agent.allowedTools === null ? null : [...agent.allowedTools], model: agent.model ? { ...agent.model } : null });
    setSelectedAgent(name);
    onItemSelect?.();
  };

  const handleRename = async () => {
    if (!renameAction || pendingAction) return;
    const name = renameNewName.trim().replace(/\s+/g, '-');
    if (!name) { toast.error(t('settings.agents.sidebar.toast.agentNameRequired')); return; }
    if (name === renameAction.agent.name) { setRenameAction(null); return; }
    if (agents.some((agent) => agent.name === name)) { toast.error(t('settings.agents.sidebar.toast.agentExists')); return; }
    const action = renameAction;
    setPendingAction(true);
    try {
      const result = await updateAgent({ ...action.agent, name }, action.directory, action.revision);
      if (directoryRef.current !== action.directory) return;
      if (!result.ok) { toast.error(problemMessage(result.error, t('settings.agents.sidebar.toast.renameFailed'))); return; }
      if (selectedAgentName === action.agent.name) setSelectedAgent(name);
      toast.success(t('settings.agents.sidebar.toast.agentRenamed', { name }));
      setRenameAction(null);
    } catch (error) {
      toast.error(problemMessage(error, t('settings.agents.sidebar.toast.renameFailed')));
    } finally { setPendingAction(false); }
  };

<<<<<<< HEAD
  const handleDelete = async () => {
    if (!deleteAction || pendingAction) return;
    const action = deleteAction;
    setPendingAction(true);
    try {
      const result = await deleteAgent(action.agent.agentId, action.directory, action.revision);
      if (directoryRef.current !== action.directory) return;
      if (!result.ok) { toast.error(problemMessage(result.error, t('settings.agents.sidebar.toast.deleteFailed'))); return; }
      if (selectedAgentName === action.agent.name) setSelectedAgent(null);
      toast.success(t('settings.agents.sidebar.toast.agentDeleted', { name: action.agent.name }));
      setDeleteAction(null);
    } catch (error) {
      toast.error(problemMessage(error, t('settings.agents.sidebar.toast.deleteFailed')));
    } finally { setPendingAction(false); }
||||||| bc50ba56aa
  const handleDuplicateAgent = async (agent: Agent) => {
    const baseName = agent.name;
    let copyNumber = 1;
    let newName = `${baseName}-copy`;

    while (agents.some((a) => a.name === newName)) {
      copyNumber++;
      newName = `${baseName}-copy-${copyNumber}`;
    }

    // Copy the agent's OWN stored entry, not the resolved `AgentInfo`: the
    // resolved view merges global config and built-in defaults, and baking
    // those into a new file would silently widen the copy's permissions.
    // SAFETY: the agents store attaches `scope` to every entry it loads.
    const extAgent = agent as AgentWithExtras & { scope?: AgentScope };
    const envelope = await fetchAgentEntity(agent.name, settingsDirectory);
    if (!envelope) {
      toast.error(t('settings.agents.sidebar.toast.renameFailed'));
      return;
    }
    const body = envelope.config.request?.body;
    setAgentDraft({
      name: newName,
      scope: envelope.scope ?? extAgent.scope ?? 'user',
      description: envelope.config.description ?? undefined,
      model: envelope.config.model ?? null,
      system: envelope.config.system ?? undefined,
      steps: envelope.config.steps ?? undefined,
      temperature: body?.temperature,
      top_p: body?.top_p,
      mode: envelope.config.mode ?? extAgent.mode,
      permissions: envelope.config.permissions ?? undefined,
      hidden: envelope.config.hidden,
    });
    setSelectedAgent(newName);
    onItemSelect?.();

=======
  const handleDuplicateAgent = async (agent: Agent) => {
    const baseName = agent.name;
    let copyNumber = 1;
    let newName = `${baseName}-copy`;

    while (agents.some((a) => a.name === newName)) {
      copyNumber++;
      newName = `${baseName}-copy-${copyNumber}`;
    }

    // SAFETY: the agents store attaches `scope` to every entry it loads.
    const extAgent = agent as AgentWithExtras & { scope?: AgentScope };
    const envelope = await fetchAgentEntity(agent.name, settingsDirectory);
    if (!envelope) {
      toast.error(t('settings.agents.sidebar.toast.renameFailed'));
      return;
    }
    const body = envelope.config.request?.body;
    setAgentDraft({
      name: newName,
      scope: envelope.scope ?? extAgent.scope ?? 'user',
      description: envelope.config.description ?? undefined,
      model: envelope.config.model ?? null,
      system: envelope.config.system ?? undefined,
      steps: envelope.config.steps ?? undefined,
      temperature: body?.temperature,
      top_p: body?.top_p,
      mode: envelope.config.mode ?? extAgent.mode,
      permissions: envelope.config.permissions ?? undefined,
      hidden: envelope.config.hidden,
    });
    setSelectedAgent(newName);
    onItemSelect?.();

>>>>>>> upstream/main
  };

<<<<<<< HEAD
  const shownAgents = agents.filter((agent) => matchesRankQuery([agent.name, agent.description], query));
||||||| bc50ba56aa
  const handleOpenRenameDialog = (agent: Agent) => {
    setRenameNewName(agent.name);
    setRenameDialogAgent(agent);
  };

  const handleRenameAgent = async () => {
    if (!renameDialogAgent) return;

    const sanitizedName = renameNewName.trim().replace(/\s+/g, '-');

    if (!sanitizedName) {
      toast.error(t('settings.agents.sidebar.toast.agentNameRequired'));
      return;
    }

    if (sanitizedName === renameDialogAgent.name) {
      setRenameDialogAgent(null);
      return;
    }

    if (agents.some((a) => a.name === sanitizedName)) {
      toast.error(t('settings.agents.sidebar.toast.agentExists'));
      return;
    }

    // A rename is a copy under a new name plus a delete, so it reads the
    // agent's OWN stored entry for the same reason duplicating does.
    // SAFETY: the agents store attaches `scope` to every entry it loads.
    const renameExt = renameDialogAgent as AgentWithExtras & { scope?: AgentScope };
    const renameEnvelope = await fetchAgentEntity(renameDialogAgent.name, settingsDirectory);
    if (!renameEnvelope) {
      toast.error(t('settings.agents.sidebar.toast.renameFailed'));
      return;
    }
    const createResult = await createAgent({
      ...renameEnvelope.config,
      name: sanitizedName,
      scope: renameEnvelope.scope ?? renameExt.scope,
    }, settingsDirectory);

    if (createResult.ok) {
      // Delete old agent
      const deleteResult = await deleteAgent(renameDialogAgent.name, renameExt.scope, settingsDirectory);
      if (deleteResult.ok) {
        toast.success(t('settings.agents.sidebar.toast.agentRenamed', { name: sanitizedName }));
        setSelectedAgent(sanitizedName);
      } else {
        toast.error(t('settings.agents.sidebar.toast.removeOldAfterRenameFailed'));
      }
    } else {
      toast.error(t('settings.agents.sidebar.toast.renameFailed'));
    }

    setRenameDialogAgent(null);
  };

  const getAgentModeIcon = (mode?: string) => {
    switch (mode) {
      case 'primary':
        return <Icon name="ai-agent" className="h-3 w-3 text-primary" />;
      case 'all':
        return <Icon name="ai-agent-fill" className="h-3 w-3 text-primary" />;
      case 'subagent':
        return <Icon name="robot" className="h-3 w-3 text-primary" />;
      default:
        return null;
    }
  };

  // Hidden custom agents stay manageable here even though pickers exclude them.
  // OpenCode drops a disabled agent once it re-reads its config; until then
  // the agent's own file already says disabled, so it shows only there.
  const disabledNames = new Set(disabledAgents.map((agent) => agent.name));
  const manageableAgents = agents.filter((agent) => isAgentManageable(agent) && !disabledNames.has(agent.name));
  const shownAgents = manageableAgents.filter((agent) => matchesRankQuery([agent.name, agent.description], query));
  const builtInAgents = shownAgents.filter(isAgentBuiltIn);
  const customAgents = shownAgents.filter((agent) => !isAgentBuiltIn(agent));

  // Group custom agents by subfolder
  const { groupedCustomAgents, ungroupedCustomAgents } = useMemo(() => {
    const groups: Record<string, typeof customAgents> = {};
    const ungrouped: typeof customAgents = [];
    for (const agent of customAgents) {
      const ext = agent as { group?: string };
      if (ext.group) {
        if (!groups[ext.group]) groups[ext.group] = [];
        groups[ext.group].push(agent);
      } else {
        ungrouped.push(agent);
      }
    }
    const sortedGroups = Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, agents: groups[name] }));
    return { groupedCustomAgents: sortedGroups, ungroupedCustomAgents: ungrouped };
  }, [customAgents]);

=======
  const handleOpenRenameDialog = (agent: Agent) => {
    setRenameNewName(agent.name);
    setRenameDialogAgent(agent);
  };

  const handleRenameAgent = async () => {
    if (!renameDialogAgent) return;

    const sanitizedName = renameNewName.trim().replace(/\s+/g, '-');

    if (!sanitizedName) {
      toast.error(t('settings.agents.sidebar.toast.agentNameRequired'));
      return;
    }

    if (sanitizedName === renameDialogAgent.name) {
      setRenameDialogAgent(null);
      return;
    }

    if (agents.some((a) => a.name === sanitizedName)) {
      toast.error(t('settings.agents.sidebar.toast.agentExists'));
      return;
    }

    // SAFETY: the agents store attaches `scope` to every entry it loads.
    const renameExt = renameDialogAgent as AgentWithExtras & { scope?: AgentScope };
    const renameEnvelope = await fetchAgentEntity(renameDialogAgent.name, settingsDirectory);
    if (!renameEnvelope) {
      toast.error(t('settings.agents.sidebar.toast.renameFailed'));
      return;
    }
    const createResult = await createAgent({
      ...renameEnvelope.config,
      name: sanitizedName,
      scope: renameEnvelope.scope ?? renameExt.scope,
    }, settingsDirectory);

    if (createResult.ok) {
      const deleteResult = await deleteAgent(renameDialogAgent.name, renameExt.scope, settingsDirectory);
      if (deleteResult.ok) {
        toast.success(t('settings.agents.sidebar.toast.agentRenamed', { name: sanitizedName }));
        setSelectedAgent(sanitizedName);
      } else {
        toast.error(t('settings.agents.sidebar.toast.removeOldAfterRenameFailed'));
      }
    } else {
      toast.error(t('settings.agents.sidebar.toast.renameFailed'));
    }

    setRenameDialogAgent(null);
  };

  const getAgentModeIcon = (mode?: string) => {
    switch (mode) {
      case 'primary':
        return <Icon name="ai-agent" className="h-3 w-3 text-primary" />;
      case 'all':
        return <Icon name="ai-agent-fill" className="h-3 w-3 text-primary" />;
      case 'subagent':
        return <Icon name="robot" className="h-3 w-3 text-primary" />;
      default:
        return null;
    }
  };

  const disabledNames = new Set(disabledAgents.map((agent) => agent.name));
  const manageableAgents = agents.filter((agent) => isAgentManageable(agent) && !disabledNames.has(agent.name));
  const shownAgents = manageableAgents.filter((agent) => matchesRankQuery([agent.name, agent.description], query));
  const builtInAgents = shownAgents.filter(isAgentBuiltIn);
  const customAgents = shownAgents.filter((agent) => !isAgentBuiltIn(agent));

  const { groupedCustomAgents, ungroupedCustomAgents } = useMemo(() => {
    const groups: Record<string, typeof customAgents> = {};
    const ungrouped: typeof customAgents = [];
    for (const agent of customAgents) {
      const ext = agent as { group?: string };
      if (ext.group) {
        if (!groups[ext.group]) groups[ext.group] = [];
        groups[ext.group].push(agent);
      } else {
        ungrouped.push(agent);
      }
    }
    const sortedGroups = Object.keys(groups)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ name, agents: groups[name] }));
    return { groupedCustomAgents: sortedGroups, ungroupedCustomAgents: ungrouped };
  }, [customAgents]);

>>>>>>> upstream/main
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="border-b px-3 pt-4 pb-3">
        <h2 className={`${SETTINGS_SECTION_TITLE_CLASS} mb-3`}>{t('settings.agents.sidebar.title')}</h2>
        <SettingsProjectSelector className="mb-3" />
        <div className="flex items-center justify-between gap-2">
          <span className="typography-meta text-muted-foreground">{t('settings.agents.sidebar.total', { count: agents.length })}</span>
          <Button size="sm" data-settings-item="agents.create" variant="ghost" className="h-7 w-7 px-0 -my-1 text-muted-foreground" onClick={handleCreateNew} disabled={revision === undefined || Boolean(error)} aria-label={t('settings.common.actions.create')}>
            <Icon name="add" className="h-3.5 w-3.5" />
          </Button>
        </div>
        {agents.length > 0 && <SettingsSidebarSearch value={query} onChange={setQuery} />}
      </div>
      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2 overflow-x-hidden">
        <button
          type="button"
          onClick={() => { setSelectedAgent(null); onItemSelect?.(); }}
          data-settings-item="agents.global-settings"
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-start mb-2',
            selectedAgentName === null
              ? 'bg-[var(--interactive-active)] text-foreground font-medium'
              : 'hover:bg-[var(--interactive-hover)] text-muted-foreground'
          )}
        >
          <Icon name="ai-agent" className="size-4 shrink-0" />
          <span className="truncate">{t('settings.agents.sidebar.globalSettings')}</span>
        </button>
        {error ? (
          <div role="alert" className="space-y-2 py-3 typography-meta text-destructive">
            <p>{error}</p>
            <Button size="xs" variant="outline" onClick={() => void loadAgents(settingsDirectory)}>{t('settings.agents.page.permissionsEditor.actions.retry')}</Button>
          </div>
        ) : revision === undefined ? <p className="py-3 typography-meta text-muted-foreground">{t('common.loading')}</p> : null}
        {revision !== undefined && agents.length === 0 && !error ? (
          <div className="py-12 px-4 text-center text-muted-foreground">
            <Icon name="robot-2" className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="typography-ui-label font-medium">{t('settings.agents.sidebar.empty.title')}</p>
            <p className="typography-meta mt-1 opacity-75">{t('settings.agents.sidebar.empty.description')}</p>
          </div>
<<<<<<< HEAD
        ) : agents.length > 0 && shownAgents.length === 0 ? <SettingsSidebarNoMatches query={query} /> : shownAgents.map((agent) => (
          <AgentListItem
            key={agent.agentId} agent={agent} isSelected={selectedAgentName === agent.name}
            onSelect={() => { setSelectedAgent(agent.name); onItemSelect?.(); }}
            onDuplicate={() => handleDuplicate(agent)}
            onRename={revision === undefined || error ? undefined : () => {
              setRenameNewName(agent.name);
              setRenameAction({ agent, revision, directory: settingsDirectory });
            }}
            onDelete={revision === undefined || error ? undefined : () => setDeleteAction({ agent, revision, directory: settingsDirectory })}
            isMenuOpen={openMenuAgent === agent.agentId}
            onMenuOpenChange={(open) => setOpenMenuAgent(open ? agent.agentId : null)}
          />
        ))}
||||||| bc50ba56aa
        ) : shownAgents.length === 0 ? (
          <SettingsSidebarNoMatches query={query} />
        ) : (
          <>
            {builtInAgents.length > 0 && (
              <>
                <div className="px-2 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('settings.agents.sidebar.section.builtIn')}
                </div>
                {builtInAgents.map((agent) => (
                  <AgentListItem
                    key={agent.name}
                    agent={agent}
                    isSelected={selectedAgentName === agent.name}
                    onSelect={() => {
                      setSelectedAgent(agent.name);
                      onItemSelect?.();

                    }}
                    onDuplicate={() => void handleDuplicateAgent(agent)}
                    onDisable={canDisable(agent) ? () => void setAgentDisabled(agent.name, true) : undefined}
                    getAgentModeIcon={getAgentModeIcon}
                    isMenuOpen={openMenuAgent === agent.name}
                    onMenuOpenChange={(open) => setOpenMenuAgent(open ? agent.name : null)}
                  />
                ))}
              </>
            )}

            {customAgents.length > 0 && (
              <>
                <div className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('settings.agents.sidebar.section.custom')}
                </div>

                {/* Grouped agents by subfolder */}
                {groupedCustomAgents.map(({ name: groupName, agents: groupAgents }) => (
                  <SidebarGroup
                    key={groupName}
                    label={groupName}
                    count={groupAgents.length}
                    storageKey="agents"
                  >
                    {groupAgents.map((agent) => (
                      <AgentListItem
                        key={agent.name}
                        agent={agent}
                        isSelected={selectedAgentName === agent.name}
                        onSelect={() => {
                          setSelectedAgent(agent.name);
                          onItemSelect?.();

                        }}
                        onRename={() => handleOpenRenameDialog(agent)}
                        onDelete={() => handleDeleteAgent(agent)}
                        onDuplicate={() => void handleDuplicateAgent(agent)}
                        onDisable={canDisable(agent) ? () => void setAgentDisabled(agent.name, true) : undefined}
                        getAgentModeIcon={getAgentModeIcon}
                        isMenuOpen={openMenuAgent === agent.name}
                        onMenuOpenChange={(open) => setOpenMenuAgent(open ? agent.name : null)}
                      />
                    ))}
                  </SidebarGroup>
                ))}

                {/* Ungrouped agents (flat in root agents dir) */}
                {ungroupedCustomAgents.map((agent) => (
                  <AgentListItem
                    key={agent.name}
                    agent={agent}
                    isSelected={selectedAgentName === agent.name}
                    onSelect={() => {
                      setSelectedAgent(agent.name);
                      onItemSelect?.();

                    }}
                    onRename={() => handleOpenRenameDialog(agent)}
                    onDelete={() => handleDeleteAgent(agent)}
                    onDuplicate={() => void handleDuplicateAgent(agent)}
                    onDisable={canDisable(agent) ? () => void setAgentDisabled(agent.name, true) : undefined}
                    getAgentModeIcon={getAgentModeIcon}
                    isMenuOpen={openMenuAgent === agent.name}
                    onMenuOpenChange={(open) => setOpenMenuAgent(open ? agent.name : null)}
                  />
                ))}
              </>
            )}
          </>
        )}

        {shownDisabledAgents.length > 0 && (
          <>
            <div className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('settings.agents.sidebar.section.disabled')}
            </div>
            {shownDisabledAgents.map((agent) => (
              <div key={agent.name} className="flex items-center gap-2 rounded-md px-1.5 py-1">
                <div className="min-w-0 flex-1">
                  <div className="typography-ui-label truncate text-muted-foreground">{agent.name}</div>
                  {agent.description ? (
                    <div className="typography-micro truncate leading-tight text-muted-foreground">{agent.description}</div>
                  ) : null}
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pendingToggleAgent === agent.name}
                  onClick={() => void setAgentDisabled(agent.name, false)}
                  aria-label={t('settings.agents.sidebar.actions.enableAria', { name: agent.name })}
                >
                  {t('settings.agents.sidebar.actions.enable')}
                </Button>
              </div>
            ))}
          </>
        )}
=======
        ) : shownAgents.length === 0 ? (
          <SettingsSidebarNoMatches query={query} />
        ) : (
          <>
            {builtInAgents.length > 0 && (
              <>
                <div className="px-2 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('settings.agents.sidebar.section.builtIn')}
                </div>
                {builtInAgents.map((agent) => (
                  <AgentListItem
                    key={agent.name}
                    agent={agent}
                    isSelected={selectedAgentName === agent.name}
                    onSelect={() => {
                      setSelectedAgent(agent.name);
                      onItemSelect?.();

                    }}
                    onDuplicate={() => void handleDuplicateAgent(agent)}
                    onDisable={canDisable(agent) ? () => void setAgentDisabled(agent.name, true) : undefined}
                    getAgentModeIcon={getAgentModeIcon}
                    isMenuOpen={openMenuAgent === agent.name}
                    onMenuOpenChange={(open) => setOpenMenuAgent(open ? agent.name : null)}
                  />
                ))}
              </>
            )}

            {customAgents.length > 0 && (
              <>
                <div className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('settings.agents.sidebar.section.custom')}
                </div>

                {groupedCustomAgents.map(({ name: groupName, agents: groupAgents }) => (
                  <SidebarGroup
                    key={groupName}
                    label={groupName}
                    count={groupAgents.length}
                    storageKey="agents"
                  >
                    {groupAgents.map((agent) => (
                      <AgentListItem
                        key={agent.name}
                        agent={agent}
                        isSelected={selectedAgentName === agent.name}
                        onSelect={() => {
                          setSelectedAgent(agent.name);
                          onItemSelect?.();

                        }}
                        onRename={() => handleOpenRenameDialog(agent)}
                        onDelete={() => handleDeleteAgent(agent)}
                        onDuplicate={() => void handleDuplicateAgent(agent)}
                        onDisable={canDisable(agent) ? () => void setAgentDisabled(agent.name, true) : undefined}
                        getAgentModeIcon={getAgentModeIcon}
                        isMenuOpen={openMenuAgent === agent.name}
                        onMenuOpenChange={(open) => setOpenMenuAgent(open ? agent.name : null)}
                      />
                    ))}
                  </SidebarGroup>
                ))}

                {ungroupedCustomAgents.map((agent) => (
                  <AgentListItem
                    key={agent.name}
                    agent={agent}
                    isSelected={selectedAgentName === agent.name}
                    onSelect={() => {
                      setSelectedAgent(agent.name);
                      onItemSelect?.();

                    }}
                    onRename={() => handleOpenRenameDialog(agent)}
                    onDelete={() => handleDeleteAgent(agent)}
                    onDuplicate={() => void handleDuplicateAgent(agent)}
                    onDisable={canDisable(agent) ? () => void setAgentDisabled(agent.name, true) : undefined}
                    getAgentModeIcon={getAgentModeIcon}
                    isMenuOpen={openMenuAgent === agent.name}
                    onMenuOpenChange={(open) => setOpenMenuAgent(open ? agent.name : null)}
                  />
                ))}
              </>
            )}
          </>
        )}

        {shownDisabledAgents.length > 0 && (
          <>
            <div className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('settings.agents.sidebar.section.disabled')}
            </div>
            {shownDisabledAgents.map((agent) => (
              <div key={agent.name} className="flex items-center gap-2 rounded-md px-1.5 py-1">
                <div className="min-w-0 flex-1">
                  <div className="typography-ui-label truncate text-muted-foreground">{agent.name}</div>
                  {agent.description ? (
                    <div className="typography-micro truncate leading-tight text-muted-foreground">{agent.description}</div>
                  ) : null}
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pendingToggleAgent === agent.name}
                  onClick={() => void setAgentDisabled(agent.name, false)}
                  aria-label={t('settings.agents.sidebar.actions.enableAria', { name: agent.name })}
                >
                  {t('settings.agents.sidebar.actions.enable')}
                </Button>
              </div>
            ))}
          </>
        )}
>>>>>>> upstream/main
      </ScrollableOverlay>
      <Dialog open={deleteAction !== null} onOpenChange={(open) => { if (!open && !pendingAction) setDeleteAction(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.agents.sidebar.dialog.deleteTitle')}</DialogTitle>
            <DialogDescription>{t('settings.agents.sidebar.dialog.deleteDescription', { name: deleteAction?.agent.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setDeleteAction(null)} disabled={pendingAction}>{t('settings.common.actions.cancel')}</Button>
            <Button size="sm" onClick={() => void handleDelete()} disabled={pendingAction}>{t('settings.common.actions.delete')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
<<<<<<< HEAD
      <Dialog open={renameAction !== null} onOpenChange={(open) => { if (!open && !pendingAction) setRenameAction(null); }}>
||||||| bc50ba56aa

      {/* Rename Dialog */}
      <Dialog open={renameDialogAgent !== null} onOpenChange={(open) => !open && setRenameDialogAgent(null)}>
=======

      <Dialog open={renameDialogAgent !== null} onOpenChange={(open) => !open && setRenameDialogAgent(null)}>
>>>>>>> upstream/main
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.agents.sidebar.renameDialog.title')}</DialogTitle>
            <DialogDescription>{t('settings.agents.sidebar.renameDialog.description', { name: renameAction?.agent.name ?? '' })}</DialogDescription>
          </DialogHeader>
          <Input value={renameNewName} onChange={(event) => setRenameNewName(event.target.value)} disabled={pendingAction} placeholder={t('settings.agents.sidebar.renameDialog.placeholder')} className="text-foreground placeholder:text-muted-foreground" onKeyDown={(event) => { if (event.key === 'Enter') void handleRename(); }} />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setRenameAction(null)} disabled={pendingAction}>{t('settings.common.actions.cancel')}</Button>
            <Button size="sm" onClick={() => void handleRename()} disabled={pendingAction}>{t('settings.common.actions.rename')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

interface AgentListItemProps {
  agent: Agent;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  onDuplicate: () => void;
<<<<<<< HEAD
||||||| bc50ba56aa
  /** Absent when this agent cannot be switched off (the last one a chat can use). */
  onDisable?: () => void;
  getAgentModeIcon: (mode?: string) => React.ReactNode;
=======
  onDisable?: () => void;
  getAgentModeIcon: (mode?: string) => React.ReactNode;
>>>>>>> upstream/main
  isMenuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}

const AgentListItem: React.FC<AgentListItemProps> = ({ agent, isSelected, onSelect, onDelete, onRename, onDuplicate, isMenuOpen, onMenuOpenChange }) => {
  const { t } = useI18n();
  const isMobile = isMobileDeviceViaCSS();
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false);
  const renderMenuItems = (Item: React.ElementType) => (
    <>
      {onRename && <Item onClick={(event: React.MouseEvent) => { event.stopPropagation(); onRename(); }}><Icon name="edit" className="h-4 w-4 mr-px" />{t('settings.common.actions.rename')}</Item>}
      <Item onClick={(event: React.MouseEvent) => { event.stopPropagation(); onDuplicate(); }}><Icon name="file-copy" className="h-4 w-4 mr-px" />{t('settings.common.actions.duplicate')}</Item>
      {onDelete && <Item onClick={(event: React.MouseEvent) => { event.stopPropagation(); onDelete(); }} className="text-destructive focus:text-destructive"><Icon name="delete-bin" className="h-4 w-4 mr-px" />{t('settings.common.actions.delete')}</Item>}
    </>
  );
  return (
    <ContextMenu open={isContextMenuOpen} onOpenChange={setIsContextMenuOpen}>
      <ContextMenuTrigger render={<div className={cn('group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200 select-none', isSelected ? 'bg-interactive-selection' : 'hover:bg-interactive-hover')} onContextMenu={!isMobile ? (event) => { event.preventDefault(); setIsContextMenuOpen(true); } : undefined} />}>
        <div className="flex min-w-0 flex-1 items-center">
          <button
            type="button"
            onClick={onSelect}
            className="flex min-w-0 flex-1 flex-col gap-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={0}
          >
            <div className="flex items-center gap-1.5">
              <Icon name="ai-agent" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="typography-ui-label font-normal truncate text-foreground">{agent.name}</span>
            </div>
            {agent.description && (
              <div className="typography-micro text-muted-foreground truncate leading-tight">{agent.description}</div>
            )}
          </button>
          <DropdownMenu open={isMenuOpen} onOpenChange={(open) => { if (open) setIsContextMenuOpen(false); onMenuOpenChange(open); }}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 w-6 px-0 flex-shrink-0 -mr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100" aria-label={agent.name}>
                <Icon name="more-2" className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit min-w-20">{renderMenuItems(DropdownMenuItem)}</DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-fit min-w-20">{renderMenuItems(ContextMenuItem)}</ContextMenuContent>
    </ContextMenu>
  );
};
