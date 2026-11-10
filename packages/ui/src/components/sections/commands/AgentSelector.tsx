import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Agent } from '@openchamber/agent-contract';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { useCatalogReadiness } from '@/hooks/useCatalogReadiness';
import { useI18n } from '@/lib/i18n';

interface AgentSelectorProps {
  agentName: string;
  onChange: (agentName: string) => void;
  className?: string;
  /** Narrow the offered profiles, e.g. to the ones whose tools suit the caller. */
  filter?: (agent: Agent) => boolean;
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
  // An omitted directory follows the active project, as the store resolves it;
  // an explicit null would be read as an unavailable workspace.
  const agents = useAgentsStore((state) => selectAgentsForDirectory(state, directory));
  const loadAgents = useAgentsStore((state) => state.loadAgents);
  const { isUnavailable } = useCatalogReadiness('agents', directory);
  const offered = React.useMemo(() => (filter ? agents.filter(filter) : agents), [agents, filter]);

  React.useEffect(() => {
    void loadAgents(directory);
  }, [loadAgents, directory]);

  return (
    <Select
      value={offered.some((agent) => agent.name === agentName) ? agentName : '__none__'}
      onValueChange={(value) => onChange(value === '__none__' ? '' : value)}
    >
      <SelectTrigger className={cn('w-full', className)}>
        <SelectValue placeholder={isUnavailable ? t('common.unavailable') : t('settings.commands.agentSelector.notSelected')}>
          {(value) => offered.find((agent) => agent.name === value)?.name ?? t('settings.commands.agentSelector.notSelected')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent portalToBody={dropdownPortalToBody}>
        <SelectItem value="__none__">{t('settings.commands.agentSelector.notSelected')}</SelectItem>
        {offered.map((agent) => (
          <SelectItem key={agent.agentId} value={agent.name}>{agent.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
