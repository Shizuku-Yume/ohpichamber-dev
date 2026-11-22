import React from 'react';
import { toast } from 'sonner';
import type { SessionMode } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { SessionGoalDialog } from '@/components/chat/SessionGoalDialog';
import { DraftGoalDialog } from '@/components/chat/composer/ui/DraftGoalDialog';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getDropdownNavigationKey, handleDropdownNavigationKey } from '@/components/ui/dropdown-navigation';
import { isIMECompositionEvent } from '@/lib/ime';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { DraftGoalObjective, DraftSessionMode } from '@/sync/session-ui-store';
import {
    MODE_DESCRIPTION_KEYS,
    MODE_LABEL_KEYS,
    buildModeOptions,
    nextEnabledModeIndex,
    type ComposerModeValue,
    type ModeOption,
    type NavigationDirection,
} from './modePickerOptions';

export type { ComposerModeValue } from './modePickerOptions';

type ComposerModeSelectorProps = {
    sessionId: string | null;
    /** True while the composer is a new-session draft. */
    draftOpen: boolean;
    /** Authoritative snapshot mode; absent in a draft. */
    mode?: SessionMode;
    draftMode?: DraftSessionMode;
    draftGoalObjective?: DraftGoalObjective | null;
    runActive: boolean;
    /** The workspace model catalog's OMP `plan` role resolution. */
    planRoleAvailable: boolean | undefined;
    goalModeEnabled: boolean;
    directory?: string;
    isMobile?: boolean;
    /** Starts the picker open; the default is closed. */
    defaultOpen?: boolean;
    onDraftModeChange: (mode: ComposerModeValue, goalObjective?: DraftGoalObjective | null) => void;
};

const MODE_ICONS = {
    main: 'chat-3',
    plan: 'file-text',
    vibe: 'sparkling',
    goal: 'target',
} satisfies Record<ComposerModeValue, IconName>;

/**
 * The mode picker in the old agent-picker slot. Four modes fit one short menu,
 * so it lists them directly: no search field, no filter state. Main/Plan/Vibe
 * use the canonical mode control; Goal owns its objective through the native
 * goal control. A draft keeps its choice until the session exists.
 */
export const ComposerModeSelector = React.memo(function ComposerModeSelector({
    sessionId,
    draftOpen,
    mode,
    draftMode,
    draftGoalObjective,
    runActive,
    planRoleAvailable,
    goalModeEnabled,
    directory,
    isMobile = false,
    defaultOpen = false,
    onDraftModeChange,
}: ComposerModeSelectorProps) {
    const { t } = useI18n();
    const [open, setOpen] = React.useState(defaultOpen);
    const [pending, setPending] = React.useState(false);
    const [goalDialogOpen, setGoalDialogOpen] = React.useState(false);
    const [draftGoalDialogOpen, setDraftGoalDialogOpen] = React.useState(false);
    const itemRefs = React.useRef<Array<HTMLElement | null>>([]);

    // A cold chat's worker opens on the control request under a new epoch, so the
    // snapshot can lag the acknowledged mode by seconds; show the ack until it lands.
    const [acknowledged, setAcknowledged] = React.useState<{ sessionId: string; base: SessionMode | undefined; mode: SessionMode } | null>(null);
    const shownMode = acknowledged && acknowledged.sessionId === sessionId && acknowledged.base === mode ? acknowledged.mode : mode;
    const selectedKind: ComposerModeValue = sessionId ? shownMode?.kind ?? 'main' : draftMode ?? 'main';
    const triggerDisabled = pending || (sessionId ? !shownMode || runActive : !draftOpen);
    const selectedLabel = t(MODE_LABEL_KEYS[selectedKind]);
    const selectedDescription = t(MODE_DESCRIPTION_KEYS[selectedKind]);

    const options = React.useMemo(() => buildModeOptions({
        planRoleAvailable,
        goalModeEnabled,
        selectedKind,
        translate: (key) => t(key),
    }), [planRoleAvailable, selectedKind, goalModeEnabled, t]);

    const choose = React.useCallback((value: ComposerModeValue) => {
        if (value === 'goal') {
            setOpen(false);
            if (sessionId) setGoalDialogOpen(true);
            else if (draftOpen) setDraftGoalDialogOpen(true);
            return;
        }
        if (sessionId) {
            setOpen(false);
            if (pending || runActive || !shownMode || value === selectedKind) return;
            setPending(true);
            canonicalClient.setMode(sessionId, value)
                .then((result) => setAcknowledged({ sessionId, base: mode, mode: result.mode }))
                .catch((error) => {
                    toast.error(t('sessions.sidebar.session.work.updateFailed'), {
                        description: error instanceof Error ? error.message : undefined,
                    });
                })
                .finally(() => setPending(false));
            return;
        }
        if (!draftOpen) return;
        setOpen(false);
        onDraftModeChange(value, null);
    }, [draftOpen, mode, onDraftModeChange, pending, runActive, selectedKind, sessionId, shownMode, t]);

    const moveFrom = React.useCallback((from: number, direction: NavigationDirection) => {
        const index = nextEnabledModeIndex(options, from, direction);
        if (index < 0) return;
        itemRefs.current[index]?.focus();
    }, [options]);

    const handleNavigation = React.useCallback((event: React.KeyboardEvent, from: number): boolean => {
        if (isIMECompositionEvent(event)) return true;
        if (handleDropdownNavigationKey(event, (key) => moveFrom(from, key === 'ArrowDown' ? 1 : -1))) return true;
        const navigation = getDropdownNavigationKey(event) ?? (event.key === 'ArrowDown' || event.key === 'ArrowUp' ? event.key : null);
        if (!navigation) return false;
        event.preventDefault();
        event.stopPropagation();
        moveFrom(from, navigation === 'ArrowDown' ? 1 : -1);
        return true;
    }, [moveFrom]);

    const handleItemKeyDown = React.useCallback((event: React.KeyboardEvent, index: number) => {
        if (handleNavigation(event, index)) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const option = options[index];
        if (!option || option.disabledReason) return;
        event.preventDefault();
        event.stopPropagation();
        choose(option.value);
    }, [choose, handleNavigation, options]);

    const optionRow = (option: ModeOption) => (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex min-w-0 items-center gap-1.5">
                <Icon name={MODE_ICONS[option.value]} className="size-4 flex-shrink-0" />
                <span className={cn('truncate font-medium', option.value === selectedKind && 'text-foreground')}>{option.label}</span>
                {option.value === selectedKind ? <Icon name="check" className="ms-auto size-4 flex-shrink-0 text-primary" /> : null}
            </span>
            <span className="ps-[1.375rem] text-start typography-micro text-muted-foreground">{option.description}</span>
            {option.disabledReason ? <span className="ps-[1.375rem] text-start typography-micro text-muted-foreground">{option.disabledReason}</span> : null}
        </span>
    );

    const tooltip = (
        <TooltipContent side="top" sideOffset={6}>
            <div className="flex max-w-[240px] flex-col gap-0.5 text-center">
                <span className="font-medium">{selectedLabel}</span>
                <span className="typography-meta opacity-70">{selectedDescription}</span>
            </div>
        </TooltipContent>
    );

    const triggerClass = cn(
        'flex min-w-0 items-center gap-1.5 transition-colors focus-visible:outline-none',
        isMobile
            ? 'h-[26px] rounded-lg px-1 typography-micro font-medium'
            : 'h-6 typography-meta font-medium',
        triggerDisabled ? 'cursor-not-allowed opacity-60' : isMobile ? 'text-foreground/80 hover:bg-[var(--interactive-hover)]' : 'cursor-pointer hover:opacity-70',
    );


    const goalDialogs = (
        <>
            {sessionId ? <SessionGoalDialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen} sessionId={sessionId} directory={directory} /> : null}
            {sessionId ? null : <DraftGoalDialog open={draftGoalDialogOpen} onOpenChange={setDraftGoalDialogOpen} initialGoal={draftGoalObjective ?? null} onSave={(goal) => onDraftModeChange('goal', goal)} />}
        </>
    );

    if (isMobile) {
        return (
            <>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            disabled={triggerDisabled}
                            onClick={() => setOpen(true)}
                            onMouseDown={(event) => event.preventDefault()}
                            aria-label={selectedLabel}
                            aria-haspopup="dialog"
                            aria-expanded={open}
                            className={triggerClass}
                        >
                            <Icon name={MODE_ICONS[selectedKind]} className="size-4 flex-shrink-0" />
                            <span className="truncate">{selectedLabel}</span>
                            <Icon name="arrow-down-s" className="size-4 flex-shrink-0 opacity-60" />
                        </button>
                    </TooltipTrigger>
                    {tooltip}
                </Tooltip>
                {open ? (
                    <MobileOverlayPanel open title={t('chat.chatInput.mode.label')} onClose={() => setOpen(false)} contentMaxHeightClassName="max-h-[min(52dvh,360px)]">
                        <ScrollableOverlay outerClassName="min-h-0 flex-1">
                            <div id="composer-mode-options-mobile" role="listbox" aria-label={t('chat.chatInput.mode.label')} className="flex flex-col gap-1 p-1">
                                {options.map((option, index) => {
                                    const row = (
                                        <button
                                            ref={(node) => { itemRefs.current[index] = node; }}
                                            type="button"
                                            role="option"
                                            aria-selected={option.value === selectedKind}
                                            aria-disabled={option.disabledReason ? true : undefined}
                                            onClick={() => { if (!option.disabledReason) choose(option.value); }}
                                            onKeyDown={(event) => handleItemKeyDown(event, index)}
                                            className={cn(
                                                'flex w-full min-w-0 items-start rounded-lg px-2 py-1.5 text-start',
                                                option.disabledReason ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-interactive-hover',
                                                option.value === selectedKind && !option.disabledReason && 'bg-interactive-selection text-interactive-selection-foreground',
                                            )}
                                        >
                                            {optionRow(option)}
                                        </button>
                                    );
                                    if (!option.disabledReason) return <React.Fragment key={option.value}>{row}</React.Fragment>;
                                    return (
                                        <Tooltip key={option.value}>
                                            <TooltipTrigger asChild>
                                                <span tabIndex={0} aria-label={option.disabledReason} className="block rounded-lg focus-visible:ring-2 focus-visible:ring-ring" onKeyDown={(event) => handleItemKeyDown(event, index)}>
                                                    {row}
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent side="top" sideOffset={6}>{option.disabledReason}</TooltipContent>
                                        </Tooltip>
                                    );
                                })}
                            </div>
                        </ScrollableOverlay>
                    </MobileOverlayPanel>
                ) : null}
                {goalDialogs}
            </>
        );
    }

    return (
        <>
            <Tooltip delayDuration={300}>
                <DropdownMenu open={open} onOpenChange={setOpen}>
                    <TooltipTrigger asChild>
                        <span className="inline-flex min-w-0">
                            <DropdownMenuTrigger asChild nativeButton>
                                <button
                                    type="button"
                                    disabled={triggerDisabled}
                                    aria-label={t('chat.chatInput.mode.label')}
                                    aria-haspopup="menu"
                                    aria-expanded={open}
                                    data-mode-open={open ? true : undefined}
                                    className={triggerClass}
                                >
                                    <Icon name={MODE_ICONS[selectedKind]} className="size-3.5 flex-shrink-0" />
                                    <span className="truncate">{selectedLabel}</span>
                                    <Icon name="arrow-down-s" className="size-3.5 flex-shrink-0 opacity-60" />
                                </button>
                            </DropdownMenuTrigger>
                        </span>
                    </TooltipTrigger>
                    <DropdownMenuContent
                        side="top"
                        align="end"
                        alignOffset={-40}
                        constrainToMain
                        collisionAvoidance={{ side: 'none', align: 'shift' }}
                        className="flex w-[min(300px,calc(100vw-2rem))] flex-col overflow-hidden p-0"
                    >
                        <ScrollableOverlay outerClassName="max-h-[min(400px,calc(var(--available-height)-4rem))] flex-1">
                            <div id="composer-mode-options" className="flex flex-col gap-1 p-1">
                                {options.map((option, index) => {
                                    const item = (
                                        <DropdownMenuItem
                                            ref={(node) => { itemRefs.current[index] = node; }}
                                            aria-disabled={option.disabledReason ? true : undefined}
                                            data-mode-option={option.value}
                                            data-selected={option.value === selectedKind ? true : undefined}
                                            className={cn(
                                                'items-start px-2 py-1.5',
                                                option.disabledReason && 'cursor-not-allowed opacity-60',
                                                option.value === selectedKind && !option.disabledReason && 'bg-interactive-selection text-interactive-selection-foreground',
                                            )}
                                            onSelect={(event) => {
                                                if (option.disabledReason) { event.preventDefault(); return; }
                                                choose(option.value);
                                            }}
                                            onKeyDown={(event) => handleItemKeyDown(event, index)}
                                        >
                                            {optionRow(option)}
                                        </DropdownMenuItem>
                                    );
                                    if (!option.disabledReason) return <React.Fragment key={option.value}>{item}</React.Fragment>;
                                    return (
                                        <Tooltip key={option.value}>
                                            <TooltipTrigger asChild>{item}</TooltipTrigger>
                                            <TooltipContent side="right" sideOffset={6} className="max-w-[220px]">{option.disabledReason}</TooltipContent>
                                        </Tooltip>
                                    );
                                })}
                            </div>
                        </ScrollableOverlay>
                    </DropdownMenuContent>
                </DropdownMenu>
                {tooltip}
            </Tooltip>
            {goalDialogs}
        </>
    );
});
