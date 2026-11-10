import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { useCatalogReadiness } from '@/hooks/useCatalogReadiness';
import { useI18n } from '@/lib/i18n';

interface AgentSelectorProps {
  agentName: string;
  onChange: (agentName: string) => void;
  className?: string;
  filter?: (agent: { name: string }) => boolean;
  dropdownPortalToBody?: boolean;
  directory?: string;
}

/** Select a named agent profile by name, as the routing and project configuration stores it. */
export const AgentSelector: React.FC<AgentSelectorProps> = ({
  agentName,
  onChange,
  className,
  filter,
  dropdownPortalToBody = false,
  directory,
}) => {
  const { t } = useI18n();
  const workspaceDirectory = directory ?? null;
  const agents = useAgentsStore((state) => selectAgentsForDirectory(state, workspaceDirectory));
  const loadAgents = useAgentsStore((state) => state.loadAgents);
  const { isUnavailable } = useCatalogReadiness('agents', workspaceDirectory);

  React.useEffect(() => {
    void loadAgents(workspaceDirectory);
  }, [loadAgents, workspaceDirectory]);

  const selectable = React.useMemo(
    () => (filter ? agents.filter((agent) => filter({ name: agent.name })) : agents),
    [agents, filter],
  );

  return (
    <Select
      value={selectable.some((agent) => agent.name === agentName) ? agentName : '__none__'}
      onValueChange={(value) => onChange(value === '__none__' ? '' : value)}
    >
      <SelectTrigger className={cn('w-full', className)}>
        <SelectValue placeholder={isUnavailable ? t('common.unavailable') : t('settings.commands.agentSelector.notSelected')}>
          {(value) => selectable.find((agent) => agent.name === value)?.name ?? t('settings.commands.agentSelector.notSelected')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent portalToBody={dropdownPortalToBody}>
        <SelectItem value="__none__">{t('settings.commands.agentSelector.notSelected')}</SelectItem>
        {selectable.map((agent) => (
          <SelectItem key={agent.agentId} value={agent.name}>{agent.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
