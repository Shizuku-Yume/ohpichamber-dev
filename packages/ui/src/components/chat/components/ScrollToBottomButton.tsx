import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentStatusLabel } from '@/hooks/useAgentStatusLabel';
import React from 'react';

import { Icon } from "@/components/icon/Icon";
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useAssistantStatus } from '@/hooks/useAssistantStatus';
import { useConfigStore } from '@/stores/useConfigStore';
import { getProviderModelDisplayName } from '@/lib/modelDisplay';
import { registerFloatingPanelClearanceReader } from '@/components/chat/composer/state/composerInsetReaders';

const ScrollAction: React.FC<{ onClick: () => void; children?: React.ReactNode }> = ({ onClick, children }) => {
    const { t } = useI18n();
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    type="button"
                    onClick={onClick}
                    aria-label={t('chat.scrollToBottom.aria')}
                    className="inline-flex h-8 min-w-0 max-w-full flex-1 items-center rounded-full [corner-shape:round] text-left"
                >
                    <span className="flex h-8 w-8 flex-1 shrink-0 basis-8 items-center justify-center text-muted-foreground">
                        <Icon name="arrow-down" className="h-4 w-4" />
                    </span>
                    {children}
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{t('chat.scrollToBottom.aria')}</TooltipContent>
        </Tooltip>
    );
};

const WorkingPillBody: React.FC<{ onClick: () => void }> = ({ onClick }) => {
    const { activeModel, working } = useAssistantStatus();
    const providers = useConfigStore((state) => state.providers);

    const modelName = React.useMemo(() => {
        if (!activeModel) return null;
        const provider = providers.find((candidate) => candidate.providerId === activeModel.providerId);
        return getProviderModelDisplayName(provider, activeModel.modelId) || null;
    }, [activeModel, providers]);

    const label = useAgentStatusLabel(working.isWorking ? working.status : null, modelName);
    if (!label) return <ScrollAction onClick={onClick} />;

    return (
        <ScrollAction onClick={onClick}>
                <span className="-ml-px min-w-0 truncate text-sm text-muted-foreground pr-3">
                {label}
            </span>
        </ScrollAction>
    );
};

interface ScrollToBottomButtonProps {
    visible: boolean;
    working?: boolean;
    onClick: () => void;
}

const ScrollToBottomButton: React.FC<ScrollToBottomButtonProps> = ({ visible, working = false, onClick }) => {
    return (
        <div
            ref={registerFloatingPanelClearanceReader}
            className={cn(
                'pointer-events-none absolute bottom-full inset-x-0 mb-2 transition-opacity duration-100',
                visible ? 'opacity-100' : 'opacity-0',
            )}
            style={{ transform: 'translateY(calc(-1 * var(--chat-floating-panel-clearance, 0px)))' }}
        >
            <div className="chat-input-column">
                <div className="inline-flex max-w-full rounded-full shadow-[0_2px_6px_-2px_rgb(0_0_0_/_0.10)] dark:shadow-[0_2px_6px_-2px_rgb(0_0_0_/_0.35)]">
                <div
                    className={cn(
                        'oc-glass-popover inline-flex min-h-8 max-w-full items-center rounded-full [corner-shape:round]',
                        'border border-black/[0.06] dark:border-white/[0.08]',
                        visible ? 'pointer-events-auto' : 'pointer-events-none',
                    )}
                >
                    {working && visible ? <WorkingPillBody onClick={onClick} /> : <ScrollAction onClick={onClick} />}
                </div>
                </div>
            </div>
        </div>
    );
};

export default React.memo(ScrollToBottomButton);
