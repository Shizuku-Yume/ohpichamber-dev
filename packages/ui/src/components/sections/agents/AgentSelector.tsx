import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { useCatalogReadiness } from '@/hooks/useCatalogReadiness';
import { useI18n } from '@/lib/i18n';

interface AgentSelectorProps {
  agentId: string;
  onChange: (agentId: string) => void;
  className?: string;
  dropdownPortalToBody?: boolean;
  directory?: string;
}

/** Select a named agent profile for project/routing configuration. */
export const AgentSelector: React.FC<AgentSelectorProps> = ({
  agentId,
  onChange,
  className,
  dropdownPortalToBody = false,
  directory,
}) => {
  const { t } = useI18n();
  // An omitted directory follows the active project, as the store resolves it;
  // an explicit null would be read as an unavailable workspace.
  const agents = useAgentsStore((state) => selectAgentsForDirectory(state, directory));
  const loadAgents = useAgentsStore((state) => state.loadAgents);
  const { isUnavailable } = useCatalogReadiness('agents', directory);

  React.useEffect(() => {
    void loadAgents(directory);
  }, [loadAgents, directory]);

  return (
    <Select
      value={agents.some((agent) => agent.agentId === agentId) ? agentId : '__none__'}
      onValueChange={(value) => onChange(value === '__none__' ? '' : value)}
    >
      <SelectTrigger className={cn('w-full', className)}>
        <SelectValue placeholder={isUnavailable ? t('common.unavailable') : t('settings.commands.agentSelector.notSelected')}>
          {(value) => agents.find((agent) => agent.agentId === value)?.name ?? t('settings.commands.agentSelector.notSelected')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent portalToBody={dropdownPortalToBody}>
        <SelectItem value="__none__">{t('settings.commands.agentSelector.notSelected')}</SelectItem>
        {agents.map((agent) => (
          <SelectItem key={agent.agentId} value={agent.agentId}>{agent.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
