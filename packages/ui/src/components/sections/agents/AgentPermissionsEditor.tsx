import React from 'react';
import type { ToolCatalogEntry } from '@openchamber/agent-contract';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import {
  SettingsCheckboxRow,
  SettingsChipGroup,
  SettingsDisclosure,
  SettingsFieldRow,
  SETTINGS_SPACE_CHECKBOX_CLASS,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import {
<<<<<<< HEAD
  categorizeTool,
  TOOL_PERMISSION_GROUPS,
  getToolOneLineDescription,
  toolPresentation,
} from '@/lib/toolPresentation';
import type { ToolPermissionGroupKey } from '@/lib/toolPresentation/groups';
||||||| bc50ba56aa
  AUTOSAVE_SAVED,
  AUTOSAVE_UNCHANGED,
  autosaveFailed,
  type AutosaveResult,
} from '@/components/sections/shared/SettingsAutosave';
import {
  BUILTIN_ACTIONS,
  EFFECTS,
  OPENCHAMBER_ACTIONS,
  cloneModel,
  effectiveEffect,
  emptyModel,
  modelsEqual,
  parseRules,
  serializeRules,
  type KeyState,
  type PermissionModel,
} from './agentPermissionModel';

/**
 * Tool permissions for one agent.
 *
 * One row per tool: the tool's name, an arrow with what OpenCode will actually
 * do for it right now, and inherit / allow / ask / deny. "Inherit" means the
 * agent says nothing about the tool, so OpenCode's defaults and the global
 * config decide (that is what the arrow shows). A row expands to resource
 * patterns for that tool (`git push *` → deny).
 *
 * Under the hood v2 keeps an ordered rule list where the last match wins;
 * `agentPermissionModel.ts` translates this view to and from that list and
 * applies edits to the stored list in place, so what the user did not touch
 * keeps deciding exactly as before. Saving PATCHes only
 * `{ permissions }`. There is no Save button: a chip writes straight away, a
 * pattern writes when it loses focus. The write is its own request but the
 * page owns the autosave: `AgentsPage` registers this section's save routine
 * through `registerSave` and runs it as part of its own.
 */

const formatKeyLabel = (key: string): string =>
  key
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/** Tools whose rules commonly need resource patterns; others can still add them. */
const PATTERN_HINT_ACTIONS: ReadonlySet<string> = new Set([
  'shell',
  'edit',
  'read',
  'glob',
  'grep',
  'patch',
  'webfetch',
  'skill',
  'subagent',
  'external_directory',
]);

const EMPTY_KEY: KeyState = { effect: null, patterns: [] };
=======
  AUTOSAVE_SAVED,
  AUTOSAVE_UNCHANGED,
  autosaveFailed,
  type AutosaveResult,
} from '@/components/sections/shared/SettingsAutosave';
import {
  BUILTIN_ACTIONS,
  EFFECTS,
  OPENCHAMBER_ACTIONS,
  cloneModel,
  effectiveEffect,
  emptyModel,
  modelsEqual,
  parseRules,
  serializeRules,
  type KeyState,
  type PermissionModel,
} from './agentPermissionModel';


const formatKeyLabel = (key: string): string =>
  key
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const PATTERN_HINT_ACTIONS: ReadonlySet<string> = new Set([
  'shell',
  'edit',
  'read',
  'glob',
  'grep',
  'patch',
  'webfetch',
  'skill',
  'subagent',
  'external_directory',
]);

const EMPTY_KEY: KeyState = { effect: null, patterns: [] };
>>>>>>> upstream/main

interface AgentPermissionsEditorProps {
<<<<<<< HEAD
  allowedTools: string[] | null;
  toolsCatalog: ToolCatalogEntry[];
  onChange: (allowedTools: string[] | null) => void;
  disabled?: boolean;
||||||| bc50ba56aa
  agent: AgentWithExtras;
  /**
   * Hand the page this section's save routine. It is called on mount and
   * whenever the routine changes, and with `null` on unmount.
   */
  registerSave: (save: (() => Promise<AutosaveResult>) | null) => void;
  /** The page's autosave request; this section never runs its own. */
  requestSave: () => void;
=======
  agent: AgentWithExtras;
  registerSave: (save: (() => Promise<AutosaveResult>) | null) => void;
  requestSave: () => void;
>>>>>>> upstream/main
}

type ToolPermissionMode = 'inherit' | 'all' | 'none' | 'custom';

const GROUP_TITLE_KEYS: Record<
  ToolPermissionGroupKey,
  | 'settings.agents.page.toolPermissions.group.files_and_search'
  | 'settings.agents.page.toolPermissions.group.execution'
  | 'settings.agents.page.toolPermissions.group.web_and_external'
  | 'settings.agents.page.toolPermissions.group.planning_and_memory'
  | 'settings.agents.page.toolPermissions.group.multi_agent'
  | 'settings.agents.page.toolPermissions.group.openchamber'
  | 'settings.agents.page.toolPermissions.group.mcp_and_extensions'
> = {
  files_and_search: 'settings.agents.page.toolPermissions.group.files_and_search',
  execution: 'settings.agents.page.toolPermissions.group.execution',
  web_and_external: 'settings.agents.page.toolPermissions.group.web_and_external',
  planning_and_memory: 'settings.agents.page.toolPermissions.group.planning_and_memory',
  multi_agent: 'settings.agents.page.toolPermissions.group.multi_agent',
  openchamber: 'settings.agents.page.toolPermissions.group.openchamber',
  mcp_and_extensions: 'settings.agents.page.toolPermissions.group.mcp_and_extensions',
};

const TOOL_NAME_KEYS = {
  read: 'settings.agents.page.toolPermissions.toolName.read',
  write: 'settings.agents.page.toolPermissions.toolName.write',
  edit: 'settings.agents.page.toolPermissions.toolName.edit',
  apply_patch: 'settings.agents.page.toolPermissions.toolName.apply_patch',
  ast_grep: 'settings.agents.page.toolPermissions.toolName.ast_grep',
  ast_edit: 'settings.agents.page.toolPermissions.toolName.ast_edit',
  glob: 'settings.agents.page.toolPermissions.toolName.glob',
  grep: 'settings.agents.page.toolPermissions.toolName.grep',
  find: 'settings.agents.page.toolPermissions.toolName.find',
  bash: 'settings.agents.page.toolPermissions.toolName.bash',
  eval: 'settings.agents.page.toolPermissions.toolName.eval',
  debug: 'settings.agents.page.toolPermissions.toolName.debug',
  lsp: 'settings.agents.page.toolPermissions.toolName.lsp',
  ida: 'settings.agents.page.toolPermissions.toolName.ida',
  ask: 'settings.agents.page.toolPermissions.toolName.ask',
  security_scan: 'settings.agents.page.toolPermissions.toolName.security_scan',
  task: 'settings.agents.page.toolPermissions.toolName.task',
  wait: 'settings.agents.page.toolPermissions.toolName.wait',
  web_search: 'settings.agents.page.toolPermissions.toolName.web_search',
  web: 'settings.agents.page.toolPermissions.toolName.web',
  github: 'settings.agents.page.toolPermissions.toolName.github',
  todo: 'settings.agents.page.toolPermissions.toolName.todo',
  checkpoint: 'settings.agents.page.toolPermissions.toolName.checkpoint',
  rewind: 'settings.agents.page.toolPermissions.toolName.rewind',
  context_notes: 'settings.agents.page.toolPermissions.toolName.context_notes',
  new_context: 'settings.agents.page.toolPermissions.toolName.new_context',
  goal: 'settings.agents.page.toolPermissions.toolName.goal',
  think: 'settings.agents.page.toolPermissions.toolName.think',
  advise: 'settings.agents.page.toolPermissions.toolName.advise',
  memory_edit: 'settings.agents.page.toolPermissions.toolName.memory_edit',
  retain: 'settings.agents.page.toolPermissions.toolName.retain',
  recall: 'settings.agents.page.toolPermissions.toolName.recall',
  reflect: 'settings.agents.page.toolPermissions.toolName.reflect',
  learn: 'settings.agents.page.toolPermissions.toolName.learn',
  manage_skill: 'settings.agents.page.toolPermissions.toolName.manage_skill',
  notify: 'settings.agents.page.toolPermissions.toolName.notify',
  openchamber: 'settings.agents.page.toolPermissions.toolName.openchamber',
  openchamber_render: 'settings.agents.page.toolPermissions.toolName.openchamber_render',
  openchamber_knowledge: 'settings.agents.page.toolPermissions.toolName.openchamber_knowledge',
  openchamber_workflow: 'settings.agents.page.toolPermissions.toolName.openchamber_workflow',
} as const;

const TOOL_DESC_KEYS = {
  read: 'settings.agents.page.toolPermissions.toolDesc.read',
  write: 'settings.agents.page.toolPermissions.toolDesc.write',
  edit: 'settings.agents.page.toolPermissions.toolDesc.edit',
  apply_patch: 'settings.agents.page.toolPermissions.toolDesc.apply_patch',
  ast_grep: 'settings.agents.page.toolPermissions.toolDesc.ast_grep',
  ast_edit: 'settings.agents.page.toolPermissions.toolDesc.ast_edit',
  glob: 'settings.agents.page.toolPermissions.toolDesc.glob',
  grep: 'settings.agents.page.toolPermissions.toolDesc.grep',
  find: 'settings.agents.page.toolPermissions.toolDesc.find',
  bash: 'settings.agents.page.toolPermissions.toolDesc.bash',
  eval: 'settings.agents.page.toolPermissions.toolDesc.eval',
  debug: 'settings.agents.page.toolPermissions.toolDesc.debug',
  lsp: 'settings.agents.page.toolPermissions.toolDesc.lsp',
  ida: 'settings.agents.page.toolPermissions.toolDesc.ida',
  ask: 'settings.agents.page.toolPermissions.toolDesc.ask',
  security_scan: 'settings.agents.page.toolPermissions.toolDesc.security_scan',
  task: 'settings.agents.page.toolPermissions.toolDesc.task',
  wait: 'settings.agents.page.toolPermissions.toolDesc.wait',
  web_search: 'settings.agents.page.toolPermissions.toolDesc.web_search',
  web: 'settings.agents.page.toolPermissions.toolDesc.web',
  github: 'settings.agents.page.toolPermissions.toolDesc.github',
  todo: 'settings.agents.page.toolPermissions.toolDesc.todo',
  checkpoint: 'settings.agents.page.toolPermissions.toolDesc.checkpoint',
  rewind: 'settings.agents.page.toolPermissions.toolDesc.rewind',
  context_notes: 'settings.agents.page.toolPermissions.toolDesc.context_notes',
  new_context: 'settings.agents.page.toolPermissions.toolDesc.new_context',
  goal: 'settings.agents.page.toolPermissions.toolDesc.goal',
  think: 'settings.agents.page.toolPermissions.toolDesc.think',
  advise: 'settings.agents.page.toolPermissions.toolDesc.advise',
  memory_edit: 'settings.agents.page.toolPermissions.toolDesc.memory_edit',
  retain: 'settings.agents.page.toolPermissions.toolDesc.retain',
  recall: 'settings.agents.page.toolPermissions.toolDesc.recall',
  reflect: 'settings.agents.page.toolPermissions.toolDesc.reflect',
  learn: 'settings.agents.page.toolPermissions.toolDesc.learn',
  manage_skill: 'settings.agents.page.toolPermissions.toolDesc.manage_skill',
  notify: 'settings.agents.page.toolPermissions.toolDesc.notify',
  openchamber: 'settings.agents.page.toolPermissions.toolDesc.openchamber',
  openchamber_render: 'settings.agents.page.toolPermissions.toolDesc.openchamber_render',
  openchamber_knowledge: 'settings.agents.page.toolPermissions.toolDesc.openchamber_knowledge',
  openchamber_workflow: 'settings.agents.page.toolPermissions.toolDesc.openchamber_workflow',
} as const;

type KnownToolPermissionId = keyof typeof TOOL_NAME_KEYS;

const isKnownToolPermissionId = (name: string): name is KnownToolPermissionId =>
  Object.hasOwn(TOOL_NAME_KEYS, name);

const MAX_TOOL_DESCRIPTION_LENGTH = 280;

const sanitizeDescription = (raw: string): string => {
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized.length <= MAX_TOOL_DESCRIPTION_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_TOOL_DESCRIPTION_LENGTH - 1).trimEnd()}…`;
};

export const AgentPermissionsEditor: React.FC<AgentPermissionsEditorProps> = ({
  allowedTools,
  toolsCatalog,
  onChange,
  disabled = false,
}) => {
  const { t } = useI18n();

  const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});

<<<<<<< HEAD
  const toggleGroupExpand = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };
||||||| bc50ba56aa
  const agentName = agent.name;
  // Settings browses whichever project its own selector points at; the app
  // stays where it is.
  const settingsDirectory = useSettingsDirectory();
=======
  const agentName = agent.name;
  const settingsDirectory = useSettingsDirectory();
>>>>>>> upstream/main

<<<<<<< HEAD
  const tools = React.useMemo(() => {
    const list: ToolCatalogEntry[] = [...toolsCatalog];
    const catalogNames = new Set(toolsCatalog.map((tool) => tool.name));
    if (allowedTools) {
      for (const name of allowedTools) {
        if (!catalogNames.has(name)) {
          const presentation = toolPresentation(name);
          list.push({
            name,
            label: presentation.label || name,
            description: getToolOneLineDescription(name),
            tier: 'exec',
            availability: false,
          });
        }
||||||| bc50ba56aa
  // MCP servers from the config (not only the connected ones): a permission on
  // a server is worth setting even while it is disabled or failing. Each server
  // gets one row keyed `<server>_*`, which OpenCode matches against every tool
  // the server exposes (`<server>_<tool>`).
  const loadMcpConfigs = useMcpConfigStore((state) => state.loadMcpConfigs);
  const mcpServers = useMcpConfigStore((state) => selectMcpServersForDirectory(state, settingsDirectory));
  const mcpStatus = useMcpStore(
    React.useCallback((state) => state.getStatusForDirectory(settingsDirectory), [settingsDirectory]),
  );
  React.useEffect(() => {
    void loadMcpConfigs({ directory: settingsDirectory });
  }, [loadMcpConfigs, settingsDirectory]);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadFailed(false);
    void (async () => {
      const envelope = await fetchAgentPermissions(agentName, settingsDirectory);
      if (cancelled) return;
      if (!envelope) {
        setLoadFailed(true);
        setIsLoading(false);
        return;
=======
  const loadMcpConfigs = useMcpConfigStore((state) => state.loadMcpConfigs);
  const mcpServers = useMcpConfigStore((state) => selectMcpServersForDirectory(state, settingsDirectory));
  const mcpStatus = useMcpStore(
    React.useCallback((state) => state.getStatusForDirectory(settingsDirectory), [settingsDirectory]),
  );
  React.useEffect(() => {
    void loadMcpConfigs({ directory: settingsDirectory });
  }, [loadMcpConfigs, settingsDirectory]);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadFailed(false);
    void (async () => {
      const envelope = await fetchAgentPermissions(agentName, settingsDirectory);
      if (cancelled) return;
      if (!envelope) {
        setLoadFailed(true);
        setIsLoading(false);
        return;
>>>>>>> upstream/main
      }
    }
    return list;
  }, [toolsCatalog, allowedTools]);

  const availableTools = React.useMemo(
    () => tools.filter((tool) => Boolean(tool.availability)),
    [tools],
  );

  const groupedTools = React.useMemo(() => {
    const groups: Record<ToolPermissionGroupKey, ToolCatalogEntry[]> = {
      files_and_search: [],
      execution: [],
      web_and_external: [],
      planning_and_memory: [],
      multi_agent: [],
      openchamber: [],
      mcp_and_extensions: [],
    };
    for (const tool of tools) {
      groups[categorizeTool(tool.name)].push(tool);
    }
    return groups;
  }, [tools]);

<<<<<<< HEAD
  const quickActionValue: ToolPermissionMode = React.useMemo(() => {
    if (allowedTools === null) return 'inherit';
    if (allowedTools.length === 0) return 'none';
    const availableNames = availableTools.map((tool) => tool.name);
    if (
      availableNames.length > 0 &&
      availableNames.every((name) => allowedTools.includes(name)) &&
      allowedTools.every((name) => availableNames.includes(name))
    ) {
      return 'all';
||||||| bc50ba56aa
  React.useEffect(() => {
    registerSave(save);
    return () => registerSave(null);
  }, [registerSave, save]);

  // --- Rows: built-in and OpenChamber tools, then one row per MCP server, then
  // whatever else the agent already names (custom keys, single MCP tools). ---
  const mcpKeys = React.useMemo(
    () => mcpServers.map((server) => ({ key: `${server.name}_*`, server: server.name })),
    [mcpServers],
  );
  const toolKeys = React.useMemo(() => {
    const keys: string[] = [...BUILTIN_ACTIONS, ...OPENCHAMBER_ACTIONS];
    const mcp = new Set(mcpKeys.map((entry) => entry.key));
    for (const key of Object.keys(model.keys)) {
      if (!keys.includes(key) && !mcp.has(key)) keys.push(key);
=======
  React.useEffect(() => {
    registerSave(save);
    return () => registerSave(null);
  }, [registerSave, save]);

  const mcpKeys = React.useMemo(
    () => mcpServers.map((server) => ({ key: `${server.name}_*`, server: server.name })),
    [mcpServers],
  );
  const toolKeys = React.useMemo(() => {
    const keys: string[] = [...BUILTIN_ACTIONS, ...OPENCHAMBER_ACTIONS];
    const mcp = new Set(mcpKeys.map((entry) => entry.key));
    for (const key of Object.keys(model.keys)) {
      if (!keys.includes(key) && !mcp.has(key)) keys.push(key);
>>>>>>> upstream/main
    }
    return 'custom';
  }, [allowedTools, availableTools]);

  const handleQuickAction = (value: ToolPermissionMode) => {
    if (disabled) return;
    if (value === 'inherit') {
      onChange(null);
    } else if (value === 'all') {
      onChange(availableTools.map((tool) => tool.name));
    } else if (value === 'none') {
      onChange([]);
    }
  };

<<<<<<< HEAD
  const isToolChecked = (tool: ToolCatalogEntry): boolean => {
    if (allowedTools === null) return Boolean(tool.availability);
    return allowedTools.includes(tool.name);
||||||| bc50ba56aa
  const effectiveFor = React.useCallback(
    (key: string): PermissionEffect => effectiveEffect(key, { global: globalRules, agentGlobal: model.global }),
    [globalRules, model.global],
  );

  // --- Mutators. Chips save at once; patterns save on blur through the page. ---
  const setGlobal = (effect: PermissionEffect | null) => {
    setModel((current) => ({ ...current, global: effect }));
    requestSave();
=======
  const effectiveFor = React.useCallback(
    (key: string): PermissionEffect => effectiveEffect(key, { global: globalRules, agentGlobal: model.global }),
    [globalRules, model.global],
  );

  const setGlobal = (effect: PermissionEffect | null) => {
    setModel((current) => ({ ...current, global: effect }));
    requestSave();
>>>>>>> upstream/main
  };

  const toggleTool = (toolName: string, checked: boolean) => {
    if (disabled) return;
    const tool = tools.find((entry) => entry.name === toolName);
    if (checked && (!tool || !tool.availability)) return;
    const currentList = allowedTools === null ? availableTools.map((entry) => entry.name) : [...allowedTools];
    const nextList = checked
      ? [...new Set([...currentList, toolName])]
      : currentList.filter((name) => name !== toolName);
    onChange(nextList);
  };

  const toggleGroup = (groupTools: ToolCatalogEntry[], nextChecked: boolean) => {
    if (disabled) return;
    const currentList = new Set(
      allowedTools === null ? availableTools.map((entry) => entry.name) : allowedTools,
    );
    for (const tool of groupTools) {
      if (nextChecked) {
        if (tool.availability) currentList.add(tool.name);
      } else {
        currentList.delete(tool.name);
      }
    }
    onChange([...currentList]);
  };

  const enabledCount = tools.filter((tool) => isToolChecked(tool)).length;
  const summaryText =
    allowedTools === null
      ? t('settings.agents.page.toolPermissions.summary.default')
      : t('settings.agents.page.toolPermissions.summary.enabledCount', {
        enabled: enabledCount,
        total: tools.length,
      });

  return (
<<<<<<< HEAD
    <div data-settings-tools-editor className={SETTINGS_SPACE_ROW_CLASS}>
      <SettingsFieldRow
        label={t('settings.agents.page.toolPermissions.mode.label')}
        description={summaryText}
        settingsItem="agents.allowed-tools"
      >
        <SettingsChipGroup<ToolPermissionMode>
          value={quickActionValue}
          options={[
            {
              value: 'inherit',
              label: t('settings.agents.page.toolPermissions.quickActions.inherit'),
              disabled,
            },
            {
              value: 'all',
              label: t('settings.agents.page.toolPermissions.quickActions.all'),
              disabled,
            },
            {
              value: 'none',
              label: t('settings.agents.page.toolPermissions.quickActions.none'),
              disabled,
            },
          ]}
          onChange={handleQuickAction}
          aria-label={t('settings.agents.page.field.allowedTools')}
        />
      </SettingsFieldRow>
||||||| bc50ba56aa
    <SettingsSection
      title={t('settings.agents.page.section.toolPermissions')}
      settingsItem="agents.permissions"
      info={t('settings.agents.page.permissionsEditor.sectionInfo')}
      contentClassName="space-y-4"
    >
      {/* The agent's own fallback for every tool (its `*` rule). */}
      <div className="flex flex-col gap-2 pb-2 @xl:flex-row @xl:items-center @xl:justify-between">
        <div className="flex items-center gap-1.5">
          <span className={SETTINGS_FIELD_LABEL_CLASS}>
            {t('settings.agents.page.permissionsEditor.defaultLabel')}
          </span>
          <SettingsInfoHint>{t('settings.agents.page.permissionsEditor.defaultInfo')}</SettingsInfoHint>
          {model.global === null && (
            <span className="typography-micro text-muted-foreground">
              {t('settings.agents.page.permissionsEditor.effectiveHint', { action: effectLabel(effectiveFor('*')) })}
            </span>
          )}
        </div>
        {renderEffectChips(model.global, setGlobal, t('settings.agents.page.permissionsEditor.defaultAria'), defaultChipLabel)}
      </div>
=======
    <SettingsSection
      title={t('settings.agents.page.section.toolPermissions')}
      settingsItem="agents.permissions"
      info={t('settings.agents.page.permissionsEditor.sectionInfo')}
      contentClassName="space-y-4"
    >
      <div className="flex flex-col gap-2 pb-2 @xl:flex-row @xl:items-center @xl:justify-between">
        <div className="flex items-center gap-1.5">
          <span className={SETTINGS_FIELD_LABEL_CLASS}>
            {t('settings.agents.page.permissionsEditor.defaultLabel')}
          </span>
          <SettingsInfoHint>{t('settings.agents.page.permissionsEditor.defaultInfo')}</SettingsInfoHint>
          {model.global === null && (
            <span className="typography-micro text-muted-foreground">
              {t('settings.agents.page.permissionsEditor.effectiveHint', { action: effectLabel(effectiveFor('*')) })}
            </span>
          )}
        </div>
        {renderEffectChips(model.global, setGlobal, t('settings.agents.page.permissionsEditor.defaultAria'), defaultChipLabel)}
      </div>
>>>>>>> upstream/main

      <div>
        {TOOL_PERMISSION_GROUPS.map((groupKey) => {
          const groupToolList = groupedTools[groupKey];
          if (groupToolList.length === 0) return null;

<<<<<<< HEAD
          const expanded = Boolean(expandedGroups[groupKey]);
          const selectedCount = groupToolList.filter((tool) => isToolChecked(tool)).length;
          const availableGroupTools = groupToolList.filter((tool) => Boolean(tool.availability));
          const allAvailableChecked =
            availableGroupTools.length > 0 &&
            availableGroupTools.every((tool) => isToolChecked(tool));
          const isFullyChecked = groupToolList.length > 0 && selectedCount === groupToolList.length;
          const isIndeterminate = selectedCount > 0 && !isFullyChecked;

          const groupTitle = t(GROUP_TITLE_KEYS[groupKey]);
          const countLabel = t('settings.agents.page.toolPermissions.selectedCount', {
            selected: selectedCount,
            total: groupToolList.length,
          });

          return (
            <SettingsDisclosure
              key={groupKey}
              title={groupTitle}
              secondary={<span className="tabular-nums">{countLabel}</span>}
              accessory={(
                <Checkbox
                  checked={isFullyChecked}
                  indeterminate={isIndeterminate}
                  disabled={disabled || (availableGroupTools.length === 0 && selectedCount === 0)}
                  onChange={() => toggleGroup(groupToolList, !allAvailableChecked && availableGroupTools.length > 0)}
                  ariaLabel={t('settings.agents.page.toolPermissions.toggleGroupAria', { group: groupTitle })}
                />
              )}
              expanded={expanded}
              onToggle={() => toggleGroupExpand(groupKey)}
            >
              <div className={cn(SETTINGS_SPACE_CHECKBOX_CLASS, 'ps-6')}>
                {groupToolList.map((tool) => {
                  const knownId = isKnownToolPermissionId(tool.name) ? tool.name : null;
                  const presentationLabel = toolPresentation(tool.name).label;
                  const displayTitle = knownId
                    ? t(TOOL_NAME_KEYS[knownId])
                    : presentationLabel !== tool.name
                      ? presentationLabel
                      : tool.label && tool.label.toLowerCase() !== tool.name.toLowerCase()
                        ? tool.label
                        : tool.name;

                  const rawDesc = knownId
                    ? t(TOOL_DESC_KEYS[knownId])
                    : tool.description || getToolOneLineDescription(tool.name);
                  const description = rawDesc ? sanitizeDescription(rawDesc) : '';
                  const showInlineId = displayTitle.toLowerCase() !== tool.name.toLowerCase();

                  return (
                    <SettingsCheckboxRow
                      key={tool.name}
                      checked={isToolChecked(tool)}
                      disabled={disabled || !tool.availability}
                      onChange={(nextChecked) => toggleTool(tool.name, nextChecked)}
                      label={(
                        <span className="inline-flex min-w-0 items-baseline gap-1.5">
                          <span className={cn(displayTitle === tool.name && 'font-mono')}>
                            {displayTitle}
                          </span>
                          {showInlineId ? (
                            <span className="font-mono typography-meta text-muted-foreground">({tool.name})</span>
                          ) : null}
                        </span>
                      )}
                      ariaLabel={displayTitle}
                      labelAccessory={!tool.availability ? (
                        <span className="typography-meta text-muted-foreground">{`· ${t('common.unavailable')}`}</span>
                      ) : undefined}
                      info={description || undefined}
                    />
                  );
                })}
              </div>
            </SettingsDisclosure>
          );
        })}
||||||| bc50ba56aa
      {mcpKeys.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 border-t border-edge-muted pt-3 pb-1">
            <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.agents.page.permissionsEditor.mcpTitle')}</span>
            <SettingsInfoHint>{t('settings.agents.page.permissionsEditor.mcpInfo')}</SettingsInfoHint>
          </div>
          {mcpKeys.map((entry) => renderRow(entry.key, entry.server, mcpStatusLabel(entry.server)))}
        </div>
      )}
      {/* A tool the list does not know yet (an MCP or plugin tool). */}
      <div className="flex flex-wrap items-center gap-2 border-t border-edge-muted pt-3">
        <Input
          value={customKeyDraft}
          onChange={(event) => setCustomKeyDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCustomKey();
            }
          }}
          placeholder={t('settings.agents.page.permissionsEditor.customKeyPlaceholder')}
          className="h-8 w-full max-w-[16rem] font-mono text-xs"
        />
        <Button variant="outline" size="xs" className="!font-normal" onClick={addCustomKey} disabled={!customKeyDraft.trim()}>
          <Icon name="add" className="me-1 h-3.5 w-3.5" />
          {t('settings.agents.page.permissionsEditor.actions.addKey')}
        </Button>
=======
      {mcpKeys.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 border-t border-edge-muted pt-3 pb-1">
            <span className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.agents.page.permissionsEditor.mcpTitle')}</span>
            <SettingsInfoHint>{t('settings.agents.page.permissionsEditor.mcpInfo')}</SettingsInfoHint>
          </div>
          {mcpKeys.map((entry) => renderRow(entry.key, entry.server, mcpStatusLabel(entry.server)))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-edge-muted pt-3">
        <Input
          value={customKeyDraft}
          onChange={(event) => setCustomKeyDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addCustomKey();
            }
          }}
          placeholder={t('settings.agents.page.permissionsEditor.customKeyPlaceholder')}
          className="h-8 w-full max-w-[16rem] font-mono text-xs"
        />
        <Button variant="outline" size="xs" className="!font-normal" onClick={addCustomKey} disabled={!customKeyDraft.trim()}>
          <Icon name="add" className="me-1 h-3.5 w-3.5" />
          {t('settings.agents.page.permissionsEditor.actions.addKey')}
        </Button>
>>>>>>> upstream/main
      </div>
    </div>
  );
};
