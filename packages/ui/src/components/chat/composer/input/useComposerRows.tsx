import type { useI18n } from '@/lib/i18n';
import type { useComposerSessionScope } from './useComposerSessionScope';
import type { useComposerSessionLifecycle } from './useComposerSessionLifecycle';
import type { useComposerSendAvailability } from './useComposerSendAvailability';
import type { useComposerReferenceActions } from './useComposerReferenceActions';
import type { useComposerQueueState } from './useComposerQueueState';
import type { useComposerQueueActions } from './useComposerQueueActions';
import type { useComposerPreferences } from './useComposerPreferences';
import type { useComposerMobileShell } from './useComposerMobileShell';
import type { useComposerInlineContext } from './useComposerInlineContext';
import type { useComposerEditorState } from './useComposerEditorState';
import type { useComposerEditorActions } from './useComposerEditorActions';
import type { useComposerDraftText } from './useComposerDraftText';
import type { useComposerDraftTarget } from './useComposerDraftTarget';
import type { ChatInputProps } from './chatInputProps';
import type { useComposerFooterModes } from './useComposerFooterModes';
import React from 'react';
import { QueuedMessagesStrip } from '../../QueuedMessagesStrip';
import { AutoReviewStrip } from '../../AutoReviewStrip';
import { PullRequestWatchStrip } from '../../PullRequestWatchStrip';
import { ExtensionWaitStrip } from '../../ExtensionWaitStrip';
import { ComposerContextRows } from '../../composer/ui/ComposerContextRows';
import { RevertedMessagesStrip } from '../../RevertedMessagesStrip';
import { SessionFolderMissingRow } from '../../SessionFolderMissingRow';
import { SessionSuggestionChip } from '@/components/chat/SessionSuggestionChip';
import { SessionDoneHintRow } from '@/components/chat/SessionDoneHintRow';
import { SessionReviewHintRow } from '@/components/chat/SessionReviewHintRow';
import { BackgroundShellsStrip } from '@/components/chat/BackgroundShellsStrip';
import { ComposerStatusStrip } from '@/components/chat/ComposerStatusStrip';
import { useWorktreeBootstrapPending } from '@/hooks/useWorktreeBootstrapPending';
import { useShownAfter } from '@/hooks/useShownAfter';
import { SessionGoalRow } from '@/components/chat/SessionGoalRow';
import { SubagentHudTray } from '../../SubagentHudTray';
import { TodoTray } from '../../TodoTray';
import { LoopRow } from './LoopRow';
import { MemoMobileModelButton, MemoMobileEffortButton } from './memoComposerControls';
import { ComposerModeSelector } from '../ui/ComposerModeSelector';

const CREATING_SESSION_LINE_DELAY_MS = 300;

type Dependencies = {
    props: Pick<ChatInputProps, 'active'>;
    draftText: Pick<ReturnType<typeof useComposerDraftText>, 'setMessage'>;
    editorState: Pick<ReturnType<typeof useComposerEditorState>, 'composerRef'>;
    i18n: Pick<ReturnType<typeof useI18n>, 't'>;
    preferences: Pick<ReturnType<typeof useComposerPreferences>, 'isMobile'>;
    mobileShell: Pick<ReturnType<typeof useComposerMobileShell>, 'mobileComposerExpanded' | 'mobileShell'>;
    inlineContext: Pick<ReturnType<typeof useComposerInlineContext>, 'hasDrafts' | 'inlineDraftTarget'>;
    referenceActions: Pick<ReturnType<typeof useComposerReferenceActions>, 'openAttachmentByName'>;
    sendAvailability: Pick<ReturnType<typeof useComposerSendAvailability>, 'hasContent' | 'pendingFirstSend'>;
    sessionScope: Pick<ReturnType<typeof useComposerSessionScope>, 'newSessionDraftOpen' | 'isBtwActive' | 'isBtwPanelVisible' | 'hasPendingForm' | 'currentSessionId' | 'currentSessionDirectoryForSync' | 'currentDirectory' | 'setReviewDialogOpen' | 'sessionFolder' | 'btwComposerSessionId'>;
    queueState: Pick<ReturnType<typeof useComposerQueueState>, 'queuedMessages' | 'parentMessageQueueTarget'>;
    draftTarget: Pick<ReturnType<typeof useComposerDraftTarget>, 'showDraftTargetSelectors' | 'messageWaitsForSpace'>;
    queueActions: Pick<ReturnType<typeof useComposerQueueActions>, 'handleQueuedMessageEdit' | 'handleQueuedMessageSend'>;
    sessionLifecycle: Pick<ReturnType<typeof useComposerSessionLifecycle>, 'sessionPhase' | 'handleOpenMobilePanel'>;
    editorActions: Pick<ReturnType<typeof useComposerEditorActions>, 'handleCycleThinking' | 'handleOpenThinkingPanel'>;
    footerModes: Pick<ReturnType<typeof useComposerFooterModes>, 'runOrigin' | 'mode' | 'draftMode' | 'draftGoalObjective' | 'runActive' | 'planRoleAvailable' | 'goalModeEnabled' | 'handleDraftModeChange'>;
};

export function useComposerRows({
    props, draftText, editorState, i18n, preferences, mobileShell: mobile, inlineContext, referenceActions,
    sendAvailability, sessionScope, queueState, draftTarget, queueActions, sessionLifecycle,
    editorActions, footerModes,
}: Dependencies) {
    const { setMessage } = draftText;
    const { composerRef } = editorState;
    const { t } = i18n;
    const { isMobile } = preferences;
    const { mobileComposerExpanded, mobileShell } = mobile;
    const { hasDrafts, inlineDraftTarget } = inlineContext;
    const { openAttachmentByName } = referenceActions;
    const { hasContent, pendingFirstSend } = sendAvailability;
    const {
        newSessionDraftOpen, isBtwActive, isBtwPanelVisible, hasPendingForm, currentSessionId,
        currentSessionDirectoryForSync, currentDirectory, setReviewDialogOpen, sessionFolder,
    } = sessionScope;
    const { queuedMessages, parentMessageQueueTarget } = queueState;
    const { showDraftTargetSelectors, messageWaitsForSpace } = draftTarget;
    const { handleQueuedMessageEdit, handleQueuedMessageSend } = queueActions;
    const { sessionPhase, handleOpenMobilePanel } = sessionLifecycle;
    const { handleCycleThinking, handleOpenThinkingPanel } = editorActions;

    const applyAssistSuggestion = React.useCallback((text: string) => {
        setMessage(text);
        if (isMobile && !mobileComposerExpanded) {
            mobileShell.expand();
        } else {
            requestAnimationFrame(() => composerRef.current?.focus());
        }
    }, [isMobile, mobileComposerExpanded, mobileShell, setMessage, composerRef]);

    const contextRows = hasDrafts ? (
        <ComposerContextRows draftTarget={inlineDraftTarget} isMobile={isMobile} onOpenAttachment={openAttachmentByName} surfaceActive={props.active ?? true} />
    ) : null;

    const suggestionHidden = hasContent || newSessionDraftOpen || isBtwActive || isBtwPanelVisible || queuedMessages.length > 0 || hasPendingForm;

    const suggestionRow = !isBtwActive ? (
        <SessionSuggestionChip
            sessionId={currentSessionId}
            directory={currentSessionDirectoryForSync ?? currentDirectory}
            hidden={suggestionHidden}
            onApply={applyAssistSuggestion}
        />
    ) : null;

    const doneHintRow = !isBtwActive && !newSessionDraftOpen ? (
        <SessionDoneHintRow
            sessionId={currentSessionId}
        />
    ) : null;

    const openReviewDialog = React.useCallback(() => setReviewDialogOpen(true), [setReviewDialogOpen]);

    const reviewHintRow = !isBtwActive && !newSessionDraftOpen && !isMobile ? (
        <SessionReviewHintRow
            sessionId={currentSessionId}
            directory={currentSessionDirectoryForSync ?? currentDirectory}
            onAIReview={openReviewDialog}
        />
    ) : null;

    const backgroundShellsRow = !isBtwActive && !newSessionDraftOpen ? (
        <BackgroundShellsStrip
            key={currentSessionId ?? ''}
            sessionId={currentSessionId}
        />
    ) : null;

    const worktreeSetupDirectory = currentSessionDirectoryForSync ?? currentDirectory ?? null;

    const worktreeSetupPending = useWorktreeBootstrapPending(isBtwActive ? null : worktreeSetupDirectory);

    const worktreeSetupRow = worktreeSetupPending
        ? <ComposerStatusStrip icon="loader-4" spin text={t('chat.worktreeSetup.running')} />
        : null;

    const creatingSession = Boolean(pendingFirstSend && !pendingFirstSend.sessionCreated && !worktreeSetupPending);

    const creatingSessionRow = useShownAfter(creatingSession, CREATING_SESSION_LINE_DELAY_MS)
        ? <ComposerStatusStrip icon="loader-4" spin text={t('chat.draft.creatingSession')} />
        : null;

    const spaceWaitRow = showDraftTargetSelectors && messageWaitsForSpace
        ? <ComposerStatusStrip icon="time" text={t('spaces.draft.queued')} />
        : null;

    const autoReviewRow = !isBtwActive && !newSessionDraftOpen ? <AutoReviewStrip /> : null;

    const prWatchRow = !isBtwActive && !newSessionDraftOpen ? <PullRequestWatchStrip key={`pr-watch:${currentSessionId ?? ''}`} sessionId={currentSessionId} /> : null;

    const extensionWaitRow = !isBtwActive && !newSessionDraftOpen ? <ExtensionWaitStrip sessionId={currentSessionId} /> : null;

    const goalRow = !isBtwActive ? (
        <SessionGoalRow
            sessionId={currentSessionId}
            directory={currentSessionDirectoryForSync ?? currentDirectory}
        />
    ) : null;

    const revertRow = !isBtwActive && !newSessionDraftOpen ? (
        <RevertedMessagesStrip
            sessionId={currentSessionId}
            directory={currentSessionDirectoryForSync ?? currentDirectory}
        />
    ) : null;

    const queueRow = !isBtwActive && !newSessionDraftOpen ? (
        <QueuedMessagesStrip
            target={parentMessageQueueTarget}
            onEditMessage={handleQueuedMessageEdit}
            onSendMessage={handleQueuedMessageSend}
        />
    ) : null;

    const folderMissingRow = sessionFolder.missing && currentSessionId && currentSessionDirectoryForSync && !isBtwActive && !newSessionDraftOpen
        ? <SessionFolderMissingRow sessionId={currentSessionId} directory={currentSessionDirectoryForSync} busy={sessionPhase !== 'idle'} />
        : null;

    const liveSessionId = !isBtwActive && !newSessionDraftOpen ? currentSessionId : null;
    const sessionDirectory = currentSessionDirectoryForSync ?? currentDirectory ?? undefined;
    const workerRunRow = liveSessionId && (footerModes.runOrigin === 'plan' || footerModes.runOrigin === 'goal')
        ? <ComposerStatusStrip icon="loader-4" spin text={t(footerModes.runOrigin === 'plan' ? 'chat.run.origin.plan' : 'chat.run.origin.goal')} />
        : null;

    const hasTopRows = folderMissingRow || worktreeSetupRow || creatingSessionRow || spaceWaitRow
        || liveSessionId || goalRow || autoReviewRow || prWatchRow || extensionWaitRow || backgroundShellsRow
        || revertRow || queueRow || doneHintRow || reviewHintRow || suggestionRow;
    const composerTopRows = hasTopRows ? (
        <>
            {folderMissingRow}
            {worktreeSetupRow}
            {creatingSessionRow}
            {spaceWaitRow}
            {liveSessionId && <TodoTray key={`todo:${liveSessionId}`} sessionId={liveSessionId} directory={sessionDirectory} />}
            {goalRow}
            {workerRunRow}
            {autoReviewRow}
            {prWatchRow}
            {extensionWaitRow}
            {liveSessionId && <LoopRow key={`loop:${liveSessionId}`} sessionId={liveSessionId} directory={sessionDirectory} />}
            {liveSessionId && <SubagentHudTray key={`subagent:${liveSessionId}`} sessionId={liveSessionId} />}
            {backgroundShellsRow}
            {revertRow}
            {queueRow}
            {doneHintRow}
            {reviewHintRow}
            {suggestionRow}
        </>
    ) : null;

    const mobileModelAgentRow = isMobile ? (
        <div className="flex items-center justify-between gap-x-2 px-3.5 pb-2 pt-0.5">
            <div className="flex min-w-0 items-center gap-0.5">
                <MemoMobileModelButton onOpenModel={() => handleOpenMobilePanel('model')} className="min-w-0 px-0" />
                <MemoMobileEffortButton onCycleThinking={handleCycleThinking} onOpenThinking={handleOpenThinkingPanel} />
            </div>
            {!isBtwActive ? <ComposerModeSelector
                sessionId={currentSessionId}
                draftOpen={newSessionDraftOpen}
                mode={footerModes.mode}
                draftMode={footerModes.draftMode}
                draftGoalObjective={footerModes.draftGoalObjective}
                runActive={footerModes.runActive}
                planRoleAvailable={footerModes.planRoleAvailable}
                goalModeEnabled={footerModes.goalModeEnabled}
                directory={currentSessionDirectoryForSync ?? currentDirectory}
                isMobile
                onDraftModeChange={footerModes.handleDraftModeChange}
            /> : null}
        </div>
    ) : null;

    return {
        composerTopRows, contextRows, mobileModelAgentRow,
    };
}
