import { useUIStore } from '@/stores/useUIStore';
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from '@/lib/shortcuts';
import { TooltipLabelWithShortcut } from '@/components/ui/action-toolbar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
/**
 * The composer's footer row.
 *
 * Desktop lays it out as attachments and toggles on the left, model controls
 * and send on the right. Mobile keeps everything on one line and swaps the
 * model controls for the compact buttons above the text, because the footer
 * has to stay reachable with one thumb.
 *
 * The dictation component is rendered here on desktop only: on mobile it lives
 * at the composer wrapper level so a recording started from the collapsed pill
 * survives the expand.
 */

import type { SourceControlProvider } from '@/lib/api/types';
import type { SessionMode } from '@openchamber/agent-contract';
import React from 'react';

import { ComposerDictation } from '@/components/dictation/ComposerDictation';
import { Icon } from '@/components/icon/Icon';
import type { GuestAttachItem } from '@/hooks/useGuestSurfaces';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { isDictationCaptureSupported } from '@/lib/dictation/use-dictation-audio-source';
import { ModelControls } from '../../ModelControls';
import { ComposerActionButtons } from './ComposerActionButtons';
import { ComposerAttachmentControls, type ComposerTrackerPicker } from './ComposerAttachmentControls';
import { FocusModeButton } from './FocusModeButton';
import { ComposerModeSelector, type ComposerModeValue } from './ComposerModeSelector';
import type { DraftGoalObjective, DraftSessionMode } from '@/sync/session-ui-store';
import { PermissionAutoAcceptButton } from './PermissionAutoAcceptButton';
import type { PermissionMode } from '@/stores/utils/permissionAutoAccept';
import type { ComposerModelSelection } from '@/components/chat/pinnedComposerSelection';

const MemoModelControls = React.memo(ModelControls);
const MemoComposerDictation = React.memo(ComposerDictation);

interface ComposerFooterProps {
    isMobile: boolean;
    sessionId: string | null;
    directory?: string;
    newSessionDraftOpen: boolean;
    draftMode?: DraftSessionMode;
    draftGoalObjective?: DraftGoalObjective | null;
    planRoleAvailable: boolean | undefined;
    sessionGoalEnabled: boolean;
    onDraftModeChange: (mode: ComposerModeValue, goalObjective?: DraftGoalObjective | null) => void;

    radius: string;
    footerPaddingClass: string;
    footerGapClass: string;
    footerIconButtonClass: string;
    iconSizeClass: string;
    sendIconSizeClass: string;
    stopIconSizeClass: string;

    canSend: boolean;
    canAbort: boolean;
    hasContent: boolean;
    isExpandedInput: boolean;
    mode?: SessionMode;
    runActive: boolean;
    permissionMode: PermissionMode;
    isPermissionAutoAcceptInteractive: boolean;
    dictationActive: boolean;

    onOpenSettings?: () => void;
    onPickLocalFiles: () => void;
    onOpenGitHubPicker: () => void;
    /** The host the project's issues and change requests come from. */
    repositoryProvider?: SourceControlProvider;
    /** The VS Code webview offers only local files, never the linked pickers. */
    isVSCode: boolean;
    /** One entry per signed-in tracker, in the server's order. */
    trackerPickers?: readonly ComposerTrackerPicker[];
    attachGuests?: readonly GuestAttachItem[];
    onOpenGuestAttach?: (guestId: string) => void;
    onOpenAttachSheet: () => void;
    onToggleExpandedInput: () => void;
    onCyclePermissionMode: () => void;
    onPrimaryAction: () => void;
    onQueueMessage: () => void;
    onAbort: () => void;
    onStartDictation: () => void;
    onDictationInsert: (text: string) => void;
    onDictationInsertAndSend: (text: string) => void;
    onDictationSendStart: () => void;
    onDictationStart: () => void;
    onDictationContentHeightChange: (height: number | null) => void;
    /** Desktop only: the composer box hides its other contents while the overlay is up. */
    onDictationActiveChange?: (active: boolean) => void;
    isBtw?: boolean;
    pinnedSelection?: ComposerModelSelection | null;
    /** The composer's double Escape stops the run (not in the mini chat). */
    escapeStops?: boolean;
    /** Offers "Run on several models" in the model picker (desktop). */
    onRunInParallel?: () => void;
    /** Set while the composer is in "Run in parallel" mode: the primary action launches the run. */
    parallelRun?: { runCount: number; launching: boolean; onLaunch: () => void } | null;
    /** A sent message is held until Agent Service's first connection. */
    waitingForAgent: boolean;
}

/** Quiet note beside the send button while a sent message waits for the Agent Service to start. */
function AgentStartupNote({ className }: { className?: string }) {
    const { t } = useI18n();
    return (
        <span
            role="status"
            className={cn('min-w-0 truncate self-center typography-micro text-muted-foreground', className)}
            title={t('chat.chatInput.waitingForAgentHint')}
        >
            {t('chat.chatInput.waitingForAgent')}
        </span>
    );
}

function ComposerFooterView(props: ComposerFooterProps) {
    const { t } = useI18n();
    const shortcutOverrides = useUIStore((state) => state.shortcutOverrides);
    const {
        isMobile,
        sessionId: currentSessionId,
        directory,
        newSessionDraftOpen,
        draftMode,
        draftGoalObjective,
        planRoleAvailable,
        sessionGoalEnabled,
        onDraftModeChange,
        radius: chatInputRadius,
        footerPaddingClass,
        footerGapClass,
        footerIconButtonClass,
        iconSizeClass,
        sendIconSizeClass,
        stopIconSizeClass,
        canSend,
        canAbort,
        hasContent,
        isExpandedInput,
        permissionMode,
        mode,
        runActive,
        isPermissionAutoAcceptInteractive,
        dictationActive,
        onOpenSettings,
        onPickLocalFiles,
        onOpenGitHubPicker,
        repositoryProvider,
        isVSCode,
        trackerPickers,
        attachGuests,
        onOpenGuestAttach,
        onOpenAttachSheet,
        onToggleExpandedInput,
        onCyclePermissionMode,
        onPrimaryAction,
        onQueueMessage,
        onAbort,
        onStartDictation,
        onDictationInsert,
        onDictationInsertAndSend,
        onDictationSendStart,
        onDictationStart,
        onDictationContentHeightChange,
        onDictationActiveChange,
        isBtw = false,
        pinnedSelection = null,
        onRunInParallel,
        parallelRun = null,
        waitingForAgent,
    } = props;

    const dictationEnabled = useConfigStore((state) => state.dictationEnabled);
    const [dictationSupported] = React.useState(isDictationCaptureSupported);
    const showDictation = dictationEnabled && dictationSupported;

    return (
        <div
            className={cn(
                'bg-transparent flex-shrink-0',
                footerPaddingClass,
                isMobile ? 'flex items-center gap-x-1.5' : cn('flex items-center justify-between', footerGapClass)
            )}
            style={{
                borderBottomLeftRadius: chatInputRadius,
                borderBottomRightRadius: chatInputRadius,
            }}
            data-chat-input-footer="true"
            // On the path from the composer box to the desktop dictation
            // overlay (see the .oc-dictation-overlay rule in design-system.css).
            data-dictation-chain={isMobile ? undefined : 'true'}
        >
            {isMobile ? (
                <>
                    <div className="flex w-full items-center justify-between gap-x-1.5">
                        <div className="composer-mobile-actions flex items-center gap-x-2 pl-1">
                            <ComposerAttachmentControls
                                footerIconButtonClass={footerIconButtonClass}
                                iconSizeClass={iconSizeClass}
                                handlePickLocalFiles={onPickLocalFiles}
                                openGitHubPicker={onOpenGitHubPicker}
                                repositoryProvider={repositoryProvider}
                                isVSCode={isVSCode}
                                trackerPickers={trackerPickers}
                                onOpenSettings={isBtw ? undefined : onOpenSettings}
                                onOpenMobileSheet={onOpenAttachSheet}
                                attachGuests={attachGuests}
                                onOpenGuestAttach={onOpenGuestAttach}
                                filesOnly={isBtw}
                            />
                            <PermissionAutoAcceptButton
                                footerIconButtonClass={footerIconButtonClass}
                                iconSizeClass={iconSizeClass}
                                isInteractive={isPermissionAutoAcceptInteractive}
                                permissionMode={permissionMode}
                                handlePermissionModeCycle={onCyclePermissionMode}
                            />
                        </div>
                        <div className="flex items-center min-w-0 gap-x-1 justify-end">
                            {waitingForAgent ? <AgentStartupNote /> : null}
                            <div className="flex items-center gap-x-1 flex-shrink-0">
                                {!isBtw && showDictation ? (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                className={footerIconButtonClass}
                                                onMouseDown={(event) => event.preventDefault()}
                                                onPointerDownCapture={(event) => {
                                                    if (event.pointerType === "touch") {
                                                        event.preventDefault();
                                                    }
                                                }}
                                                onClick={onStartDictation}
                                                disabled={dictationActive}
                                                aria-label={t("chat.dictation.start")}
                                            >
                                                <Icon name="mic" className={cn(iconSizeClass, "text-current")} />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                            <TooltipLabelWithShortcut
                                                label={t("chat.dictation.start")}
                                                shortcut={formatShortcutForDisplay(getEffectiveShortcutCombo("toggle_dictation", shortcutOverrides), "")}
                                            />
                                        </TooltipContent>
                                    </Tooltip>
                                ) : null}
                                <ComposerActionButtons
                                    isMobile={isMobile}
                                    footerIconButtonClass={footerIconButtonClass}
                                    sendIconSizeClass={sendIconSizeClass}
                                    stopIconSizeClass={stopIconSizeClass}
                                    canSend={canSend}
                                    canAbort={canAbort}
                                    hasContent={hasContent}
                                    currentSessionId={currentSessionId}
                                    newSessionDraftOpen={newSessionDraftOpen}
                                    onPrimaryAction={onPrimaryAction}
                                    onQueueMessage={onQueueMessage}
                                    onAbort={onAbort}
                                />
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    <div className={cn("flex items-center flex-shrink-0", footerGapClass)}>
                        <ComposerAttachmentControls
                            footerIconButtonClass={footerIconButtonClass}
                            iconSizeClass={iconSizeClass}
                            handlePickLocalFiles={onPickLocalFiles}
                            openGitHubPicker={onOpenGitHubPicker}
                            repositoryProvider={repositoryProvider}
                            isVSCode={isVSCode}
                            trackerPickers={trackerPickers}
                            onOpenSettings={isBtw ? undefined : onOpenSettings}
                            attachGuests={attachGuests}
                            onOpenGuestAttach={onOpenGuestAttach}
                            filesOnly={isBtw}
                        />
                        {!isBtw ? <FocusModeButton
                            footerIconButtonClass={footerIconButtonClass}
                            iconSizeClass={iconSizeClass}
                            isExpandedInput={isExpandedInput}
                            onToggle={onToggleExpandedInput}
                        /> : null}
                        <PermissionAutoAcceptButton
                            footerIconButtonClass={footerIconButtonClass}
                            iconSizeClass={iconSizeClass}
                            isInteractive={isPermissionAutoAcceptInteractive}
                            permissionMode={permissionMode}
                            handlePermissionModeCycle={onCyclePermissionMode}
                            withTooltip
                        />
                    </div>
                    <div className={cn('flex items-center flex-1 justify-end', footerGapClass, 'md:gap-x-3')} data-dictation-chain="true">
                        {waitingForAgent ? <AgentStartupNote className="flex-shrink-0" /> : null}
                        {parallelRun ? <div className="flex-1" /> : pinnedSelection ? <ModelControls className="flex-1 min-w-0 justify-end" sessionId={currentSessionId} selection={pinnedSelection} agentSelectable /> : <MemoModelControls className={cn('flex-1 min-w-0 justify-end')} onRunInParallel={onRunInParallel} />}
                        {!isBtw && !dictationActive ? <ComposerModeSelector
                            sessionId={currentSessionId}
                            draftOpen={newSessionDraftOpen}
                            mode={mode}
                            draftMode={draftMode}
                            draftGoalObjective={draftGoalObjective}
                            runActive={runActive}
                            planRoleAvailable={planRoleAvailable}
                            sessionGoalEnabled={sessionGoalEnabled}
                            directory={directory}
                            onDraftModeChange={onDraftModeChange}
                        /> : null}
                        {!isBtw ? <MemoComposerDictation
                            radius={chatInputRadius}
                            isMobile={isMobile}
                            footerIconButtonClass={footerIconButtonClass}
                            footerPaddingClass={footerPaddingClass}
                            iconSizeClass={iconSizeClass}
                            sendIconSizeClass={sendIconSizeClass}
                            onInsert={onDictationInsert}
                            onInsertAndSend={onDictationInsertAndSend}
                            onSendStart={onDictationSendStart}
                            onStart={onDictationStart}
                            onContentHeightChange={onDictationContentHeightChange}
                            onActiveChange={onDictationActiveChange}
                        /> : null}
                        {parallelRun ? (
                            // Parallel mode keeps the ordinary send button: the strip above
                            // already shows how many runs start, and submitting the form
                            // launches them (ChatInput routes the submit to the run).
                            <ComposerActionButtons
                                isMobile={isMobile}
                                footerIconButtonClass={footerIconButtonClass}
                                sendIconSizeClass={sendIconSizeClass}
                                stopIconSizeClass={stopIconSizeClass}
                                canSend={canSend && parallelRun.runCount >= 2 && !parallelRun.launching}
                                canAbort={false}
                                hasContent={hasContent}
                                currentSessionId={currentSessionId}
                                newSessionDraftOpen={newSessionDraftOpen}
                                onPrimaryAction={parallelRun.onLaunch}
                                onQueueMessage={onQueueMessage}
                                onAbort={onAbort}
                                sendLabel={t('chat.parallel.runAria', { count: parallelRun.runCount })}
                            />
                        ) : <ComposerActionButtons
                            isMobile={isMobile}
                            footerIconButtonClass={footerIconButtonClass}
                            sendIconSizeClass={sendIconSizeClass}
                            stopIconSizeClass={stopIconSizeClass}
                            canSend={canSend}
                            canAbort={canAbort}
                            hasContent={hasContent}
                            currentSessionId={currentSessionId}
                            newSessionDraftOpen={newSessionDraftOpen}
                            onPrimaryAction={onPrimaryAction}
                            onQueueMessage={onQueueMessage}
                            onAbort={onAbort}
                        />}
                    </div>
                </>
            )}
        </div>
    );
}

/** Memoized: the composer re-renders on every keystroke, and nothing here depends on the draft text. */
export const ComposerFooter = React.memo(ComposerFooterView);
