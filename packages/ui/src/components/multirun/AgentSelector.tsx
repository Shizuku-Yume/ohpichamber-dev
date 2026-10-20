import React from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useI18n } from '@/lib/i18n';
interface AgentSelectorProps {
  /** Currently selected native agent ID (empty string for no agent). */
  value: string;
  /** Called when agent selection changes */
  onChange: (agentId: string) => void;
  /** Optional className for the trigger */
  className?: string;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** ID for accessibility */
  id?: string;
  /** Portal menu to body instead of nearest dialog. */
  portalToBody?: boolean;
}

/**
 * Agent selector dropdown for selecting an agent for multi-run sessions.
 * Uses the directory-scoped canonical Agent roster.
 */
export const AgentSelector: React.FC<AgentSelectorProps> = ({
  value,
  onChange,
  className,
  disabled,
  id,
  portalToBody,
}) => {
  const { t } = useI18n();
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const selectableAgents = useAgentsStore((state) => selectAgentsForDirectory(state, currentDirectory));
  const loadAgents = useAgentsStore((state) => state.loadAgents);
  const defaultAgentId = useAgentsStore((state) => state.selectedAgentName);

  // Load agents on mount.
  React.useEffect(() => {
    if (selectableAgents.length === 0) void loadAgents(currentDirectory);
  }, [currentDirectory, loadAgents, selectableAgents.length]);

  // Ensure we always have a valid selection (defaults to current default agent, then first selectable agent).
  React.useEffect(() => {
    if (disabled) return;

    const trimmedValue = value.trim();
    if (trimmedValue.length > 0 && selectableAgents.some((agent) => agent.agentId === trimmedValue)) return;

    const candidateDefault = defaultAgentId?.trim() ? defaultAgentId.trim() : null;
    if (candidateDefault && selectableAgents.some((agent) => agent.agentId === candidateDefault)) {
      onChange(candidateDefault);
      return;
    }

    const firstAgent = selectableAgents[0]?.agentId;
    if (firstAgent) onChange(firstAgent);
  }, [defaultAgentId, disabled, onChange, selectableAgents, value]);

  const selectValue = value.trim().length > 0 ? value : undefined;

  return (
    <Select
      value={selectValue}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        size="lg"
        className={cn('max-w-full', className)}
      >
        <SelectValue placeholder={t('multirun.agentSelector.placeholder')} />
      </SelectTrigger>
      <SelectContent fitContent portalToBody={portalToBody}>
        {selectableAgents.length > 0 && (
          <SelectGroup>
            {selectableAgents.map((agent) => (
              <SelectItem
                key={agent.agentId}
                value={agent.agentId}
                className="w-auto whitespace-nowrap"
              >
                {agent.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
      </SelectContent>
    </Select>
  );
};
