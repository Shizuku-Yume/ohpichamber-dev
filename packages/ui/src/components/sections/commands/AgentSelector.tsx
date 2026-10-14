import React from 'react';
import type { Agent } from '@openchamber/agent-contract';
import { agentLabel } from '@/lib/agentLabel';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { dropdownTriggerVariants } from '@/components/ui/dropdown-trigger';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';
import { canonicalClient } from '@/api/canonicalClient';
import { getConfigDirectory } from '@/stores/useAgentsStore';
interface AgentSelectorProps {
    agentName: string;
    onChange: (agentName: string) => void;
    className?: string;
    filter?: (agent: Agent & { readonly mode?: string }) => boolean;
    dropdownPortalToBody?: boolean;
    directory?: string;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
    agentName,
    onChange,
    className,
    filter,
    dropdownPortalToBody = false,
    directory,
}) => {
    const { t } = useI18n();
    const [agents, setAgents] = React.useState<Agent[]>([]);
    const [isLoading, setIsLoading] = React.useState(true);
    const [isUnavailable, setIsUnavailable] = React.useState(false);
    const workspaceDirectory = directory ?? getConfigDirectory();
    const isReady = !isLoading && !isUnavailable;
    const selectedAgent = agents.find((agent) => agent.name === agentName);
    const selectedAgentLabel = selectedAgent ? agentLabel(selectedAgent) : agentName;
    const filteredAgents = React.useMemo(() => (
        filter ? agents.filter(filter) : agents
    ), [agents, filter]);
    const isMobile = useUIStore(state => state.isMobile);
    const { isMobile: deviceIsMobile } = useDeviceInfo();
    const isActuallyMobile = isMobile || deviceIsMobile;

    const [isMobilePanelOpen, setIsMobilePanelOpen] = React.useState(false);

    React.useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        setIsUnavailable(false);
        if (!workspaceDirectory) {
            setAgents([]);
            setIsLoading(false);
            return;
        }
        void canonicalClient.resolveWorkspace(workspaceDirectory)
            .then((workspace) => canonicalClient.getAgents(workspace.workspaceId))
            .then((catalog) => {
                if (cancelled) return;
                setAgents(catalog.agents);
                setIsLoading(false);
            })
            .catch(() => {
                if (cancelled) return;
                setAgents([]);
                setIsUnavailable(true);
                setIsLoading(false);
            });
        return () => { cancelled = true; };
    }, [workspaceDirectory]);

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
                <div className="space-y-1">
                    <button
                        type="button"
                        className={cn(
                            'flex w-full items-center justify-between rounded-lg border border-border/40 px-2 py-1.5 text-left',
                            !agentName ? 'bg-interactive-selection text-interactive-selection-foreground' : 'text-foreground hover:bg-interactive-hover'
                        )}
                        onClick={() => {
                            handleAgentChange('');
                            closeMobilePanel();
                        }}
                    >
                        <span className={cn('typography-meta', !agentName ? 'font-medium' : 'text-muted-foreground')}>
                            {t('settings.commands.agentSelector.notSelected')}
                        </span>
                        {!agentName && <div className="h-2 w-2 rounded-full bg-current" />}
                    </button>
                    {filteredAgents.map((agent) => {
                        const isSelected = agent.name === agentName;

                        return (
                            <button
                                key={agent.name}
                                type="button"
                                className={cn(
                                    'flex w-full items-center justify-between rounded-lg border border-border/40 px-2 py-1.5 text-left',
                                    isSelected ? 'bg-interactive-selection text-interactive-selection-foreground' : 'text-foreground hover:bg-interactive-hover'
                                )}
                                onClick={() => {
                                    handleAgentChange(agent.name);
                                    closeMobilePanel();
                                }}
                            >
                                <div className="flex flex-col">
                                    <span className="typography-meta font-medium">{agentLabel(agent)}</span>
                                    {agent.description && (
                                        <span className="typography-micro text-muted-foreground">
                                            {agent.description}
                                        </span>
                                    )}
                                </div>
                                {isSelected && (
                                    <div className="h-2 w-2 rounded-full bg-current" />
                                )}
                            </button>
                        );
                    })}
                </div>
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
                        dropdownTriggerVariants(),
                        'w-full',
                        className
                    )}
                >
                    <div className="flex items-center gap-2">
                        {!isReady && !agentName ? (
                            <>
                                <Icon name="loader-4" className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
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
                    dropdownTriggerVariants({ size: 'sm' }),
                    'w-fit opacity-60',
                    className
                )}>
                    <Icon name={agentName ? 'robot-2' : 'loader-4'} className={cn('h-3 w-3 text-muted-foreground flex-shrink-0', !agentName && 'animate-spin')} />
                    <span className="typography-micro font-medium whitespace-nowrap text-muted-foreground">
                        {agentName || (isUnavailable ? t('common.unavailable') : t('common.loading'))}
                    </span>
                </div>
            ) : (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <div className={cn(
                            dropdownTriggerVariants({ size: 'sm' }),
                            'w-fit cursor-pointer',
                            className
                        )}>
                            <Icon name="robot-2" className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                            <span className="typography-micro min-w-0 flex-1 truncate text-left font-medium">
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
                        {filteredAgents.map((agent) => (
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
};
