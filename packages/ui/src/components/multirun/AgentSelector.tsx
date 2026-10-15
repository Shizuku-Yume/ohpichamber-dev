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
import { useConfigStore } from '@/stores/useConfigStore';
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
 * Uses getVisibleAgents from useConfigStore to show available agents.
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
  const getVisibleAgents = useConfigStore((state) => state.getVisibleAgents);
  const loadAgents = useConfigStore((state) => state.loadAgents);
  const defaultAgentId = useConfigStore((state) => state.currentAgentName);
  const selectableAgents = getVisibleAgents();

  // Load agents on mount
  React.useEffect(() => {
    if (selectableAgents.length === 0) void loadAgents();
  }, [selectableAgents.length, loadAgents]);

  // Ensure we always have a valid selection (defaults to current default agent, then first selectable agent).
  React.useEffect(() => {
    if (disabled) {
      return;
    }

    const trimmedValue = value.trim();
    if (trimmedValue.length > 0 && selectableAgents.some((agent) => agent.id === trimmedValue)) {
      return;
    }

    const candidateDefault =
      defaultAgentId?.trim()
        ? defaultAgentId.trim()
        : null;

    if (candidateDefault && selectableAgents.some((agent) => agent.id === candidateDefault)) {
      onChange(candidateDefault);
      return;
    }

    const firstAgent = selectableAgents[0]?.id;
    if (firstAgent) {
      onChange(firstAgent);
    }
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
                key={agent.id}
                value={agent.id}
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
