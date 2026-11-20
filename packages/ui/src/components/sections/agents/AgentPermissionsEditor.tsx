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
  categorizeTool,
  TOOL_PERMISSION_GROUPS,
  getToolOneLineDescription,
  toolPresentation,
} from '@/lib/toolPresentation';
import type { ToolPermissionGroupKey } from '@/lib/toolPresentation/groups';

interface AgentPermissionsEditorProps {
  allowedTools: string[] | null;
  toolsCatalog: ToolCatalogEntry[];
  onChange: (allowedTools: string[] | null) => void;
  disabled?: boolean;
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

  const toggleGroupExpand = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

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

  const isToolChecked = (tool: ToolCatalogEntry): boolean => {
    if (allowedTools === null) return Boolean(tool.availability);
    return allowedTools.includes(tool.name);
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

      <div>
        {TOOL_PERMISSION_GROUPS.map((groupKey) => {
          const groupToolList = groupedTools[groupKey];
          if (groupToolList.length === 0) return null;

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
      </div>
    </div>
  );
};
