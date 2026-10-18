import React from 'react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { dropdownTriggerVariants } from '@/components/ui/dropdown-trigger';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';
import { useCatalogReadiness } from '@/hooks/useCatalogReadiness';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
interface AgentSelectorProps {
    agentId: string;
    onChange: (agentId: string) => void;
    className?: string;
    dropdownPortalToBody?: boolean;
    directory?: string;
}

export const AgentSelector: React.FC<AgentSelectorProps> = ({
    agentId,
    onChange,
    className,
    dropdownPortalToBody = false,
    directory,
}) => {
    const { t } = useI18n();
    const effectiveDirectory = useEffectiveDirectory();
    const workspaceDirectory = directory ?? effectiveDirectory ?? null;
    const agents = useAgentsStore((state) => selectAgentsForDirectory(state, workspaceDirectory));
    const loadAgents = useAgentsStore((state) => state.loadAgents);
    const { isReady, isUnavailable } = useCatalogReadiness('agents', workspaceDirectory);
    const selectedAgent = agents.find((agent) => agent.agentId === agentId);
    const selectedAgentLabel = selectedAgent ? selectedAgent.name : agentId;
    const isMobile = useUIStore(state => state.isMobile);
    const { isMobile: deviceIsMobile } = useDeviceInfo();
    const isActuallyMobile = isMobile || deviceIsMobile;
    const [isMobilePanelOpen, setIsMobilePanelOpen] = React.useState(false);
    React.useEffect(() => {
        if (workspaceDirectory) void loadAgents(workspaceDirectory);
    }, [loadAgents, workspaceDirectory]);
    const closeMobilePanel = () => setIsMobilePanelOpen(false);
    const handleAgentChange = (newAgentId: string) => onChange(newAgentId);

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
                            !agentId ? 'bg-interactive-selection text-interactive-selection-foreground' : 'text-foreground hover:bg-interactive-hover'
                        )}
                        onClick={() => {
                            handleAgentChange('');
                            closeMobilePanel();
                        }}
                    >
                        <span className={cn('typography-meta', !agentId ? 'font-medium' : 'text-muted-foreground')}>
                            {t('settings.commands.agentSelector.notSelected')}
                        </span>
                        {!agentId && <div className="h-2 w-2 rounded-full bg-current" />}
                    </button>
                    {agents.map((agent) => {
                        const isSelected = agent.agentId === agentId;

                        return (
                            <button
                                key={agent.agentId}
                                type="button"
                                className={cn(
                                    'flex w-full items-center justify-between rounded-lg border border-border/40 px-2 py-1.5 text-left',
                                    isSelected ? 'bg-interactive-selection text-interactive-selection-foreground' : 'text-foreground hover:bg-interactive-hover'
                                )}
                                onClick={() => {
                                    handleAgentChange(agent.agentId);
                                    closeMobilePanel();
                                }}
                            >
                                <div className="flex flex-col">
                                    <span className="typography-meta font-medium">{agent.name}</span>
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
                        {!isReady && !agentId ? (
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
                    <Icon name={agentId ? 'robot-2' : 'loader-4'} className={cn('h-3 w-3 text-muted-foreground flex-shrink-0', !agentId && 'animate-spin')} />
                    <span className="typography-micro font-medium whitespace-nowrap text-muted-foreground">
                        {selectedAgentLabel || (isUnavailable ? t('common.unavailable') : t('common.loading'))}
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
                                {selectedAgentLabel || t('settings.commands.agentSelector.notSelected')}
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
                                key={agent.agentId}
                                className="typography-meta"
                                onSelect={() => handleAgentChange(agent.agentId)}
                            >
                                <span className="font-medium">{agent.name}</span>
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
            )}
            {renderMobileAgentPanel()}
        </>
    );
};
