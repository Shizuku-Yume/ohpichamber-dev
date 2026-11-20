import { useUIStore } from '@/stores/useUIStore';
import { Tooltip } from '@/components/ui/tooltip';
import { TooltipTrigger } from '@/components/ui/tooltip';
import { TooltipContent } from '@/components/ui/tooltip';
import { TooltipLabelWithShortcut } from '@/components/ui/action-toolbar';
import { formatShortcutForDisplay } from '@/lib/shortcuts/bindings';
import { getEffectiveShortcutCombo } from '@/lib/shortcuts/schema';

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
    goalModeEnabled: boolean;
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
    onDictationActiveChange?: (active: boolean) => void;
    isBtw?: boolean;
    escapeStops?: boolean;
    pinnedSelection?: ComposerModelSelection | null;
    onRunInParallel?: () => void;
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
        goalModeEnabled,
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
                !isMobile && !isVSCode && 'pe-2',
                isMobile && 'h-12 pe-3.5',
                isMobile ? 'flex items-center gap-x-1.5' : cn('flex items-center justify-between', footerGapClass)
            )}
            style={{
                borderBottomLeftRadius: chatInputRadius,
                borderBottomRightRadius: chatInputRadius,
            }}
            data-chat-input-footer="true"
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
                            {!isBtw ? <PermissionAutoAcceptButton
                                footerIconButtonClass={footerIconButtonClass}
                                iconSizeClass={iconSizeClass}
                                isInteractive={isPermissionAutoAcceptInteractive}
                                permissionMode={permissionMode}
                                handlePermissionModeCycle={onCyclePermissionMode}
                            /> : null}
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
                                    escapeStops={escapeStops}
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
                        {!isBtw ? <PermissionAutoAcceptButton
                            footerIconButtonClass={footerIconButtonClass}
                            iconSizeClass={iconSizeClass}
                            isInteractive={isPermissionAutoAcceptInteractive}
                            permissionMode={permissionMode}
                            handlePermissionModeCycle={onCyclePermissionMode}
                            withTooltip
                        /> : null}
                    </div>
                    <div className={cn('flex items-center flex-1 justify-end', isVSCode ? cn(footerGapClass, 'md:gap-x-3') : 'gap-x-2')} data-dictation-chain="true">
                        {waitingForAgent ? <AgentStartupNote className="flex-shrink-0" /> : null}
                        {parallelRun ? <div className="flex-1" /> : pinnedSelection ? <ModelControls className={cn('flex-1 min-w-0 justify-end')} sessionId={currentSessionId} selection={pinnedSelection} agentSelectable /> : <MemoModelControls className={cn('flex-1 min-w-0 justify-end')} onRunInParallel={onRunInParallel} />}
                        {!isBtw && !dictationActive ? <ComposerModeSelector
                            sessionId={currentSessionId}
                            draftOpen={newSessionDraftOpen}
                            mode={mode}
                            draftMode={draftMode}
                            draftGoalObjective={draftGoalObjective}
                            runActive={runActive}
                            planRoleAvailable={planRoleAvailable}
                            goalModeEnabled={goalModeEnabled}
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
                            escapeStops={escapeStops}
                        />}
                    </div>
                </>
            )}
        </div>
    );
}

export const ComposerFooter = React.memo(ComposerFooterView);
