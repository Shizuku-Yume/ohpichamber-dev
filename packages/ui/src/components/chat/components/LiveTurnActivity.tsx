import React from 'react';
import { Icon } from '@/components/icon/Icon';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n';
import { useUIStore } from '@/stores/useUIStore';
import {
    ActivityRowSkipContext,
    LIVE_ACTIVITY_VISIBLE_ROWS,
    activityRowParts,
    planActivityTrim,
} from '../lib/turns/activityRows';
import type { ChatMessageEntry, TurnRecord } from '../lib/turns/types';
import { getLiveFinalMessage, getShownPages, messageOwningPart, toolResultsByCall } from '../lib/turns/liveActivity';
import { summarizeLiveActivity } from '../lib/turns/liveActivitySummary';
import { LiveActivityCollapse } from './LiveActivityCollapse';
import { LiveFinalActivityContext, LiveTurnHoistedPagesContext } from './liveActivityContext';
import { TurnMessageWindow } from './TurnMessageWindow';
import { useActivityRowGlide } from './useActivityRowGlide';
import { TurnMessageWindowContext, openedFoldMessageWindow } from '../lib/turns/turnMessageWindow';
import { ShownPartCard } from '../message/parts/ShownToolCard';
import { dispatchRowExpand } from '../lib/scroll/timelineScrollIntent';
<<<<<<< HEAD
import { finalActivityContentId, foldContentId } from './useTurnFold';
||||||| bc50ba56aa
import { renderedPage } from '@/lib/opencode/tools';
import type { ShownPart } from '../lib/turns/liveActivity';
=======
import { renderedPage } from '@/lib/opencode/tools';
import type { ShownPart } from '../lib/turns/liveActivity';
import { DiffCount } from '@/components/ui/diff-count';
>>>>>>> upstream/main

interface LiveTurnActivityProps {
    turn: TurnRecord;
    hasLaterAssistant: boolean;
    expanded: boolean;
    onToggle: () => void;
    renderMessage: (message: ChatMessageEntry) => React.ReactNode;
}

<<<<<<< HEAD
/**
 * The fold's header. Folded, it also draws what stays in view: a working
 * turn's latest steps, then the pages it showed and the steps after them.
 */
function LiveTurnActivity({ turn, hasLaterAssistant, expanded, onToggle, renderMessage }: LiveTurnActivityProps) {
||||||| bc50ba56aa
/**
 * The fold's header. Folded, it also draws what stays in view: a working
 * turn's latest steps, then the pages it showed and the steps after them.
 */
export function TurnFold({ turn, hasLaterAssistant, expanded, finalMessageId, onToggle, renderMessage }: TurnFoldProps) {
=======
export function TurnFold({ turn, hasLaterAssistant, expanded, finalMessageId, onToggle, renderMessage }: TurnFoldProps) {
>>>>>>> upstream/main
    const { t } = useI18n();
<<<<<<< HEAD
    const finalMessage = getLiveFinalMessage(turn.assistantMessages);
    const activityMessages = React.useMemo(
        () => (finalMessage ? turn.assistantMessages.filter((message) => message !== finalMessage) : turn.assistantMessages),
        [finalMessage, turn.assistantMessages],
    );
    const settled = Boolean(finalMessage) || hasLaterAssistant;
    // A settled fold is open by default; a working turn's fold is open only
    // when the reader opened it.
    const isExpanded = !settled || expanded;
    // Opened, every step is a row of its own (`timelineRows.ts`), so this row
    // draws the header alone. Folded, it draws the rows that stay in view.
    const drawsRows = !expanded;
    // One toggle for the whole turn. Folded, a working turn shows only its
    // latest rows (the header counts the earlier ones) and a settled one shows
    // none; opened, both show every row. The trim also stays while a settled
    // fold closes, so its content does not change under the animation.
||||||| bc50ba56aa
    const { finalMessage, activityMessages, settled, isExpanded, pages } = useTurnFold(turn, hasLaterAssistant, expanded, finalMessageId);
    // Folded, a working turn shows only its latest rows (the header counts
    // the earlier ones) and a settled one shows none.
=======
    const { finalMessage, activityMessages, settled, isExpanded, pages } = useTurnFold(turn, hasLaterAssistant, expanded, finalMessageId);
>>>>>>> upstream/main
    const showReasoningTraces = useUIStore((state) => state.showReasoningTraces);
    const trimRows = true;
    const trim = React.useMemo(() => (trimRows
        ? planActivityTrim(
            activityMessages.map((message) => activityRowParts(message.parts, showReasoningTraces).length),
            LIVE_ACTIVITY_VISIBLE_ROWS,
        )
        : null), [activityMessages, showReasoningTraces, trimRows]);
    const shownMessages = React.useMemo(
        () => (trim && trim.hiddenMessages > 0 ? activityMessages.slice(trim.hiddenMessages) : activityMessages),
        [activityMessages, trim],
    );
    const skippedMessageId = trim && trim.skipRows > 0 ? shownMessages[0]?.messageId : undefined;
    const skippedRows = trim?.skipRows ?? 0;
    const rowSkip = React.useMemo(
        () => (skippedMessageId ? { messageId: skippedMessageId, rows: skippedRows } : null),
        [skippedMessageId, skippedRows],
    );
    const hiddenRows = trim?.hiddenRows ?? 0;
    const rowsRef = React.useRef<HTMLDivElement>(null);
    useActivityRowGlide(rowsRef, hiddenRows, !settled && !expanded);
<<<<<<< HEAD
    // A page the agent showed is never folded away: it sits below the fold,
    // above the answer once one arrives, and stays there in a turn that ended
    // without one. The fold no longer holds it, so it moves at most from the
    // bottom of the fold to the top of the answer.
    const shownPages = React.useMemo(() => getShownPages(turn.assistantMessages, finalMessage), [finalMessage, turn.assistantMessages]);
    const hoistedPages = React.useMemo(() => new Set(shownPages.map((part) => part.partId)), [shownPages]);
    const finalContext = React.useMemo(() => finalMessage ? {
        messageId: finalMessage.messageId, expanded: isExpanded, contentId: finalActivityContentId(turn.turnId), pages: shownPages,
    } : null, [finalMessage, isExpanded, shownPages, turn.turnId]);
    // No diff parsing at token frequency. The report is only shown once the
    // turn settles; later authoritative tool metadata can refine it.
||||||| bc50ba56aa
    useLiveRowsFloor(previewFloorRef, previewRef, !settled && !expanded);
    // While the turn works, what the agent does after its last page (more
    // steps, the reply it is still writing) is drawn below the page, in the
    // order it happened.
    const lastPageMessageId = !finalMessage && pages.length > 0 ? pages[pages.length - 1]?.messageID : undefined;
    const [messagesAbovePages, messagesBelowPages] = React.useMemo(() => {
        const pageIndex = lastPageMessageId ? activityMessages.findIndex((message) => message.info.id === lastPageMessageId) : -1;
        if (pageIndex < 0) return [shownMessages, NO_MESSAGES];
        // The fold shows the tail of the turn, so the page's message may
        // already be trimmed away; everything still shown then came after it.
        const split = Math.max(0, pageIndex + 1 - (activityMessages.length - shownMessages.length));
        return [shownMessages.slice(0, split), shownMessages.slice(split)];
    }, [activityMessages, lastPageMessageId, shownMessages]);
    // No diff parsing at token frequency. The report is only shown once the
    // turn settles; later authoritative tool metadata can refine it.
=======
    useLiveRowsFloor(previewFloorRef, previewRef, !settled && !expanded);
    const lastPageMessageId = !finalMessage && pages.length > 0 ? pages[pages.length - 1]?.messageID : undefined;
    const [messagesAbovePages, messagesBelowPages] = React.useMemo(() => {
        const pageIndex = lastPageMessageId ? activityMessages.findIndex((message) => message.info.id === lastPageMessageId) : -1;
        if (pageIndex < 0) return [shownMessages, NO_MESSAGES];
        const split = Math.max(0, pageIndex + 1 - (activityMessages.length - shownMessages.length));
        return [shownMessages.slice(0, split), shownMessages.slice(split)];
    }, [activityMessages, lastPageMessageId, shownMessages]);
>>>>>>> upstream/main
    const summary = React.useMemo(() => settled ? summarizeLiveActivity(turn.assistantMessages) : null,
        [settled, turn.assistantMessages]);
    const fileLabel = summary && summary.files > 0
        ? t(summary.files === 1 ? 'chat.liveActivity.changedFile' : 'chat.liveActivity.changedFiles', { count: summary.files })
        : null;
    const details = summary ? [
        summary.explored ? t('chat.liveActivity.explored') : null,
        summary.commands > 0 ? t(summary.commands === 1 ? 'chat.liveActivity.ranCommand' : 'chat.liveActivity.ranCommands', { count: summary.commands }) : null,
        summary.researched ? t('chat.liveActivity.researched') : null,
        summary.subagents > 0 ? t(summary.subagents === 1 ? 'chat.liveActivity.usedSubagent' : 'chat.liveActivity.usedSubagents', { count: summary.subagents }) : null,
    ].filter(Boolean).join(' · ') : '';
    const label = (
        <>
            <Icon name="stack" className="size-3.5 shrink-0 text-[var(--tools-icon)]" />
            <span className="shrink-0 font-semibold text-[var(--tools-title)]">{t('chat.liveActivity.title')}</span>
            <Icon name={expanded ? 'arrow-down-s' : 'arrow-right-s'} className="size-3 shrink-0" />
            {fileLabel ? (
                <span className="flex min-w-0 items-center gap-1 typography-meta @min-[560px]:shrink-0">
                    <span className="truncate">{fileLabel}</span>
                    {summary?.hasCompleteDiff && (summary.additions > 0 || summary.deletions > 0) ? (
                        <DiffCount added={summary.additions} removed={summary.deletions} />
                    ) : null}
                </span>
            ) : null}
            {details ? <span className="hidden min-w-0 flex-1 truncate text-start typography-meta @min-[560px]:inline" title={details}>{fileLabel ? '· ' : ''}{details}</span> : null}
            {!settled && hiddenRows > 0 ? (
                <span className="shrink-0 typography-meta">{t('chat.liveActivity.moreRows', { count: hiddenRows })}</span>
            ) : null}
        </>
    );
<<<<<<< HEAD
    const windowStore = React.useContext(TurnMessageWindowContext);
    // The fold opens below its header, which stays where the reader clicked
    // it, and mounts its first steps (see openedFoldMessageWindow), so a very
    // long turn opens at once.
||||||| bc50ba56aa
    // The fold opens below its header, which stays where the reader clicked it.
=======
>>>>>>> upstream/main
    const handleToggle = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
        if (!expanded) {
            dispatchRowExpand(event.currentTarget);
            if (windowStore) {
                const rowCount = activityMessages.reduce(
                    (total, message) => total + activityRowParts(message.parts, showReasoningTraces).length,
                    0,
                );
                windowStore.setRange(turn.turnId, openedFoldMessageWindow(rowCount));
            }
        }
        onToggle();
    }, [activityMessages, expanded, onToggle, showReasoningTraces, turn.turnId, windowStore]);
    const headerClass = 'w-full justify-start normal-case !ps-px !pe-2 text-[var(--tools-description)] hover:!bg-transparent active:!bg-transparent';
    const contentId = foldContentId(turn.turnId);
    return (
<<<<<<< HEAD
        <LiveTurnHoistedPagesContext.Provider value={hoistedPages}>
            <div className="relative z-0" data-live-turn-activity={turn.turnId}>
                <div className="chat-message-column @container">
                    <div className="mt-1">
                        <Button variant="ghost" size="sm" className={headerClass} onClick={handleToggle}
                            aria-expanded={expanded} aria-controls={finalMessage ? `${contentId} ${finalActivityContentId(turn.turnId)}` : contentId}>
                            {label}
                        </Button>
||||||| bc50ba56aa
        <div className="relative z-0" data-live-turn-activity={turn.turnId}>
            <div className="chat-message-column @container">
                <div className="mt-1">
                    <Button variant="ghost" size="sm" className={headerClass} onClick={handleToggle}
                        aria-expanded={expanded} aria-controls={finalMessage ? `${contentId} ${finalActivityContentId(turn.turnId)}` : contentId}>
                        {label}
                    </Button>
                </div>
            </div>
            {expanded ? null : (
                // What stays in view, its rows above and below the pages, as
                // one window: the latest rows of the turn.
                <div ref={previewFloorRef}>
                    <div ref={previewRef}>
                        <LiveActivityCollapse expanded={isExpanded} id={contentId}>
                            <div ref={rowsRef}>
                                <ActivityRowSkipContext.Provider value={rowSkip}>
                                    {messagesAbovePages.map((message) => (
                                        <React.Fragment key={message.info.id}>{renderMessage(message)}</React.Fragment>
                                    ))}
                                </ActivityRowSkipContext.Provider>
                            </div>
                        </LiveActivityCollapse>
                        {!finalMessage && pages.length > 0 ? <TurnPages pages={pages} /> : null}
                        {messagesBelowPages.length > 0 ? (
                            <ActivityRowSkipContext.Provider value={rowSkip}>
                                {messagesBelowPages.map((message) => (
                                    <React.Fragment key={message.info.id}>{renderMessage(message)}</React.Fragment>
                                ))}
                            </ActivityRowSkipContext.Provider>
                        ) : null}
=======
        <div className="relative z-0" data-live-turn-activity={turn.turnId}>
            <div className="chat-message-column @container">
                <div className="mt-1">
                    <Button variant="ghost" size="sm" className={headerClass} onClick={handleToggle}
                        aria-expanded={expanded} aria-controls={finalMessage ? `${contentId} ${finalActivityContentId(turn.turnId)}` : contentId}>
                        {label}
                    </Button>
                </div>
            </div>
            {expanded ? null : (
                <div ref={previewFloorRef}>
                    <div ref={previewRef}>
                        <LiveActivityCollapse expanded={isExpanded} id={contentId}>
                            <div ref={rowsRef}>
                                <ActivityRowSkipContext.Provider value={rowSkip}>
                                    {messagesAbovePages.map((message) => (
                                        <React.Fragment key={message.info.id}>{renderMessage(message)}</React.Fragment>
                                    ))}
                                </ActivityRowSkipContext.Provider>
                            </div>
                        </LiveActivityCollapse>
                        {!finalMessage && pages.length > 0 ? <TurnPages pages={pages} /> : null}
                        {messagesBelowPages.length > 0 ? (
                            <ActivityRowSkipContext.Provider value={rowSkip}>
                                {messagesBelowPages.map((message) => (
                                    <React.Fragment key={message.info.id}>{renderMessage(message)}</React.Fragment>
                                ))}
                            </ActivityRowSkipContext.Provider>
                        ) : null}
>>>>>>> upstream/main
                    </div>
                </div>
                {drawsRows ? (
                    <LiveActivityCollapse expanded={isExpanded} id={contentId}>
                        <div ref={rowsRef}>
                            <ActivityRowSkipContext.Provider value={rowSkip}>
                                <TurnMessageWindow turnId={turn.turnId} messages={shownMessages} renderMessage={renderMessage} />
                            </ActivityRowSkipContext.Provider>
                        </div>
                    </LiveActivityCollapse>
                ) : null}
                {drawsRows ? (
                    <LiveFinalActivityContext.Provider value={finalContext}>
                        {finalMessage ? renderMessage(finalMessage) : null}
                    </LiveFinalActivityContext.Provider>
                ) : null}
            </div>
        </LiveTurnHoistedPagesContext.Provider>
    );
}

<<<<<<< HEAD
export interface TurnFoldProps {
    turn: TurnRecord;
    hasLaterAssistant: boolean;
    expanded: boolean;
    finalMessageId: string | undefined;
    onToggle: () => void;
    renderMessage: (message: ChatMessageEntry) => React.ReactNode;
||||||| bc50ba56aa
/** The pages a turn's agent showed, while the turn has no answer to draw them above. */
function TurnPages({ pages }: { pages: ReturnType<typeof getShownPages> }) {
    return (
        <div className="chat-message-column">
            {pages.map((part) => <TurnPage key={part.id} part={part} />)}
        </div>
    );
=======
function TurnPages({ pages }: { pages: ReturnType<typeof getShownPages> }) {
    return (
        <div className="chat-message-column">
            {pages.map((part) => <TurnPage key={part.id} part={part} />)}
        </div>
    );
>>>>>>> upstream/main
}

/** The fold row of a turn: its header, and the steps the fold keeps in view. */
export function TurnFold({ turn, hasLaterAssistant, expanded, onToggle, renderMessage }: TurnFoldProps) {
    return <LiveTurnActivity turn={turn} hasLaterAssistant={hasLaterAssistant} expanded={expanded} onToggle={onToggle} renderMessage={renderMessage} />;
}

<<<<<<< HEAD
/**
 * The pages a turn showed, drawn outside the fold and above the answer: the
 * `openchamber_render` page, the run a `workflow.run` call proposed, the images
 * an `image.generate` call saved, the card a secret request asks on, and the
 * text of an earlier step that carries a UI block.
 */
||||||| bc50ba56aa
/** The pages row of an opened fold. */
=======
>>>>>>> upstream/main
export function TurnPagesRow({ turn }: { turn: TurnRecord }) {
    const pages = React.useMemo(() => getShownPages(turn.assistantMessages), [turn.assistantMessages]);
    const results = React.useMemo(() => toolResultsByCall(turn.assistantMessages), [turn.assistantMessages]);
    if (pages.length === 0) return null;
    return (
        <div className="chat-message-column">
            {pages.map((part) => {
                // A page is drawn with the identity of the step that showed it.
                const owner = messageOwningPart(turn.assistantMessages, part.partId);
                if (!owner) return null;
                return (
                    <ShownPartCard
                        key={part.partId}
                        part={part}
                        result={part.type === 'tool_call' ? results.get(part.toolCallId) : undefined}
                        sessionId={owner.sessionId}
                        messageId={owner.messageId}
                    />
                );
            })}
        </div>
    );
}
