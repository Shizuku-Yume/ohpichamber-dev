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

<<<<<<< HEAD
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
||||||| bc50ba56aa
    React.useEffect(() => {
        if (directory !== undefined) {
            void loadConfigAgents({ directory });
            return;
        }
        if (rawAgents.length > 0) return;
        void loadConfigAgents();
        void loadAgentsStore();
    }, [directory, rawAgents.length, loadConfigAgents, loadAgentsStore]);

    const closeMobilePanel = () => setIsMobilePanelOpen(false);

    const handleAgentChange = (newAgentName: string) => {
        onChange(newAgentName);
    };

    const renderMobileAgentPanel = () => {
        if (!isActuallyMobile) return null;

        return (
                <MobileOverlayPanel
                    open={isMobilePanelOpen}
                    onClose={closeMobilePanel}
                    title={t('settings.commands.agentSelector.title')}
                >
                <MobileSheetRow
                    selected={!agentName}
                    onClick={() => {
                        handleAgentChange('');
                        closeMobilePanel();
                    }}
                >
                    {t('settings.commands.agentSelector.notSelected')}
                </MobileSheetRow>
                {agents.map((agent) => (
                    <MobileSheetRow
                        key={agent.name}
                        selected={agent.name === agentName}
                        onClick={() => {
                            handleAgentChange(agent.name);
                            closeMobilePanel();
                        }}
                    >
                        {agentLabel(agent)}
                    </MobileSheetRow>
                ))}
            </MobileOverlayPanel>
        );
    };

    return (
        <>
            {isActuallyMobile ? (
                <button
                    type="button"
                    onClick={isReady ? () => setIsMobilePanelOpen(true) : undefined}
                    disabled={!isReady}
                    className={cn(
                        dropdownTriggerVariants({ size: 'mobile' }),
                        'w-fit max-w-full',
                        className
                    )}
                >
                    <div className="flex items-center gap-2">
                        {!isReady && !agentName ? (
                            <>
                                {isUnavailable ? <Icon name="error-warning" className="h-3.5 w-3.5 text-muted-foreground" /> : <Spinner className="h-3.5 w-3.5 text-muted-foreground" />}
                                <span className="typography-meta text-muted-foreground">{isUnavailable ? t('common.unavailable') : t('common.loading')}</span>
                            </>
                        ) : (
                            <>
                                <Icon name="robot-2" className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="typography-meta font-medium text-foreground">
                                    {selectedAgentLabel || t('settings.commands.agentSelector.selectAgentPlaceholder')}
                                </span>
                            </>
                        )}
                    </div>
                    <Icon name="arrow-down-s" className="h-3 w-3 text-muted-foreground" />
                </button>
            ) : !isReady ? (
                <div className={cn(
                    dropdownTriggerVariants(),
                    'w-fit opacity-60',
                    className
                )}>
                    {agentName ? (
                        <Icon name="robot-2" className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    ) : isUnavailable ? (
                        <Icon name="error-warning" className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    ) : (
                        <Spinner className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="typography-micro font-medium whitespace-nowrap text-muted-foreground">
                        {agentName || (isUnavailable ? t('common.unavailable') : t('common.loading'))}
                    </span>
                </div>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className={cn(
                            dropdownTriggerVariants(),
                            'w-fit cursor-pointer',
                            className
                        )}>
                            <Icon name="robot-2" className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                            <span className="typography-micro min-w-0 flex-1 truncate text-start font-medium">
                                {agentName || t('settings.commands.agentSelector.notSelected')}
                            </span>
                            <Icon name="arrow-down-s" className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-w-[300px]" portalToBody={dropdownPortalToBody}>
                        <DropdownMenuItem
                            className="typography-meta"
                            onSelect={() => handleAgentChange('')}
                        >
                            <span className="text-muted-foreground">{t('settings.commands.agentSelector.notSelected')}</span>
                        </DropdownMenuItem>
                        {agents.map((agent) => (
                            <DropdownMenuItem
                                key={agent.name}
                                className="typography-meta"
                                onSelect={() => handleAgentChange(agent.name)}
                            >
                                <span className="font-medium">{agentLabel(agent)}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {renderMobileAgentPanel()}
        </>
    );
=======
    React.useEffect(() => {
        if (directory !== undefined) {
            void loadConfigAgents({ directory });
            return;
        }
        if (rawAgents.length > 0) return;
        void loadConfigAgents();
        void loadAgentsStore();
    }, [directory, rawAgents.length, loadConfigAgents, loadAgentsStore]);

    const closeMobilePanel = () => setIsMobilePanelOpen(false);

    const handleAgentChange = (newAgentName: string) => {
        onChange(newAgentName);
    };

    const renderMobileAgentPanel = () => {
        if (!isActuallyMobile) return null;

        return (
                <MobileOverlayPanel
                    open={isMobilePanelOpen}
                    onClose={closeMobilePanel}
                    title={t('settings.commands.agentSelector.title')}
                >
                <MobileSheetRow
                    selected={!agentName}
                    onClick={() => {
                        handleAgentChange('');
                        closeMobilePanel();
                    }}
                >
                    {t('settings.commands.agentSelector.notSelected')}
                </MobileSheetRow>
                {agents.map((agent) => (
                    <MobileSheetRow
                        key={agent.name}
                        selected={agent.name === agentName}
                        onClick={() => {
                            handleAgentChange(agent.name);
                            closeMobilePanel();
                        }}
                    >
                        {agentLabel(agent)}
                    </MobileSheetRow>
                ))}
            </MobileOverlayPanel>
        );
    };

    return (
        <>
            {isActuallyMobile ? (
                <button
                    type="button"
                    onClick={isReady ? () => setIsMobilePanelOpen(true) : undefined}
                    disabled={!isReady}
                    className={cn(
                        dropdownTriggerVariants({ size: 'mobile' }),
                        'w-fit max-w-full',
                        className
                    )}
                >
                    <div className="flex items-center gap-2">
                        {!isReady && !agentName ? (
                            <>
                                {isUnavailable ? <Icon name="error-warning" className="h-3.5 w-3.5 text-muted-foreground" /> : <Spinner className="h-3.5 w-3.5 text-muted-foreground" />}
                                <span className="typography-meta text-muted-foreground">{isUnavailable ? t('common.unavailable') : t('common.loading')}</span>
                            </>
                        ) : (
                            <>
                                <Icon name="robot-2" className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="typography-meta font-medium text-foreground">
                                    {selectedAgentLabel || t('settings.commands.agentSelector.selectAgentPlaceholder')}
                                </span>
                            </>
                        )}
                    </div>
                    <Icon name="arrow-down-s" className="h-3 w-3 text-muted-foreground" />
                </button>
            ) : !isReady ? (
                <div className={cn(
                    dropdownTriggerVariants(),
                    'w-fit opacity-60',
                    className
                )}>
                    {agentName ? (
                        <Icon name="robot-2" className="size-3.5 text-muted-foreground flex-shrink-0" />
                    ) : isUnavailable ? (
                        <Icon name="error-warning" className="size-3.5 text-muted-foreground flex-shrink-0" />
                    ) : (
                        <Spinner className="size-3.5 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="typography-ui-label font-normal whitespace-nowrap text-muted-foreground">
                        {agentName || (isUnavailable ? t('common.unavailable') : t('common.loading'))}
                    </span>
                </div>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className={cn(
                            dropdownTriggerVariants(),
                            'w-fit cursor-pointer',
                            className
                        )}>
                            <Icon name="robot-2" className="size-3.5 flex-shrink-0 text-muted-foreground" />
                            <span className="typography-ui-label min-w-0 flex-1 truncate text-start font-normal text-foreground">
                                {agentName || t('settings.commands.agentSelector.notSelected')}
                            </span>
                            <Icon name="arrow-down-s" className="size-4 flex-shrink-0 text-muted-foreground" />
                        </div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="max-w-[300px]" portalToBody={dropdownPortalToBody}>
                        <DropdownMenuItem
                            className="typography-meta"
                            onSelect={() => handleAgentChange('')}
                        >
                            <span className="text-muted-foreground">{t('settings.commands.agentSelector.notSelected')}</span>
                        </DropdownMenuItem>
                        {agents.map((agent) => (
                            <DropdownMenuItem
                                key={agent.name}
                                className="typography-meta"
                                onSelect={() => handleAgentChange(agent.name)}
                            >
                                <span className="font-medium">{agentLabel(agent)}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {renderMobileAgentPanel()}
        </>
    );
>>>>>>> upstream/main
};
