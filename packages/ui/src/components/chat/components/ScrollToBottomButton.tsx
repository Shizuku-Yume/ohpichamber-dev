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
<<<<<<< HEAD
                    <span className="flex h-8 w-8 flex-1 shrink-0 basis-8 items-center justify-center text-muted-foreground">
||||||| bc50ba56aa
                    {/* flex-1 so the icon stays centred when the mobile
                        touch-target floor widens the bare button past 28px;
                        with the status label present it collapses back to
                        its 28px basis. */}
                    <span className="flex h-full w-7 flex-1 shrink-0 basis-7 items-center justify-center text-muted-foreground">
=======
                    <span className="flex h-full w-7 flex-1 shrink-0 basis-7 items-center justify-center text-muted-foreground">
>>>>>>> upstream/main
                        <Icon name="arrow-down" className="h-4 w-4" />
                    </span>
                    {children}
                </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={6}>{t('chat.scrollToBottom.aria')}</TooltipContent>
        </Tooltip>
    );
};

<<<<<<< HEAD
/**
 * Compact one-line mirror of the status row for the pill: same label, none of
 * the status row's animation machinery (which does not survive being squeezed
 * into a 32px chip).
 */
||||||| bc50ba56aa
/**
 * Compact one-line mirror of the status row for the pill: same label and
 * background action, none of the status row's animation machinery (which does
 * not survive being squeezed into a 28px chip). The action is a sibling of the
 * scroll button, never inside it.
 */
=======
>>>>>>> upstream/main
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
<<<<<<< HEAD
        <ScrollAction onClick={onClick}>
            <span className="-ml-px min-w-0 truncate text-sm text-muted-foreground pr-3">
                {label}
            </span>
        </ScrollAction>
||||||| bc50ba56aa
        <>
            <ScrollAction onClick={onClick}>
                {/* leading-5: `truncate` clips at the line box, and a 16px one
                    cut off descenders in fonts with taller metrics. */}
                <span className={cn('-ms-px min-w-0 truncate text-[0.8125rem] leading-5 text-muted-foreground', working.canBackground ? 'pe-1' : 'pe-2')}>
                    {label}
                </span>
            </ScrollAction>
            {working.canBackground ? <BackgroundWorkButton onClick={backgroundWork} className="me-0.5 h-6 w-6" /> : null}
        </>
=======
        <>
            <ScrollAction onClick={onClick}>
                <span className={cn('-ms-px min-w-0 truncate text-[0.8125rem] leading-5 text-muted-foreground', working.canBackground ? 'pe-1' : 'pe-2')}>
                    {label}
                </span>
            </ScrollAction>
            {working.canBackground ? <BackgroundWorkButton onClick={backgroundWork} className="me-0.5 h-6 w-6" /> : null}
        </>
>>>>>>> upstream/main
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
<<<<<<< HEAD
                {/* The soft shadow lives on this wrapper, away from the glass
                    pill's backdrop-filter: sharing one element made the
                    shadow intermittently drop after hide/show cycles. */}
||||||| bc50ba56aa
                {/* The soft shadow lives on this wrapper, apart from the
                    pill itself. */}
=======
>>>>>>> upstream/main
                <div className="inline-flex max-w-full rounded-full shadow-[0_2px_6px_-2px_rgb(0_0_0_/_0.10)] dark:shadow-[0_2px_6px_-2px_rgb(0_0_0_/_0.35)]">
                <div
                    className={cn(
<<<<<<< HEAD
                        // Glass material with a hairline real border — much
                        // lighter than the oc-glass-floating stack.
                        // min-h, not h: the mobile touch-target floor grows
                        // the buttons inside to 36px, and the pill with them.
                        'oc-glass-popover inline-flex min-h-8 max-w-full items-center rounded-full [corner-shape:round]',
||||||| bc50ba56aa
                        // Opaque surface with a hairline border, much lighter
                        // than the oc-glass-floating shadow stack.
                        // min-h, not h: the mobile touch-target floor grows
                        // the buttons inside to 36px, and the pill with them.
                        'oc-surface-floating inline-flex min-h-7 max-w-full items-center rounded-full [corner-shape:round]',
=======
                        'oc-surface-floating inline-flex min-h-7 max-w-full items-center rounded-full [corner-shape:round]',
>>>>>>> upstream/main
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
