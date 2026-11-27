import React from 'react';
import type { Part, ToolCallPart, ToolResultPart } from '@openchamber/agent-contract';
import { isReadTool, normalizeToolName, parseNativeReadPath, toolInputPath } from '@/lib/toolHelpers';
import { isInvisibleText } from '@/lib/invisibleText';
import type { StreamPhase, ToolPopupContent } from '../types';
import type { TurnActivityGroup, TurnActivityRecord, TurnGroupingContext } from '../../lib/turns/types';
import ToolPart from '../parts/ToolPart';
import AssistantTextPart from '../parts/AssistantTextPart';
import ReasoningPart from '../parts/ReasoningPart';
import { ReadToolGroup, type ReadToolGroupItem } from '../parts/ReadToolGroup';
import { normalizeWorkspaceToolPath } from '../parts/toolDiffUtils';
import { TimelineNoticeCard } from '../parts/TimelineNoticeCard';
import { CompactionDivider } from '../../SessionRecapSpacer';
import { ToolRevealOnMount } from '../parts/ToolRevealOnMount';
import { isEmptyTextPart } from '../partUtils';
import { FadeInOnReveal } from '../FadeInOnReveal';
import { StaticToolRow } from '../parts/ProgressiveGroup';
import { isExpandableTool, isStandaloneTool } from '../parts/toolRenderUtils';
import { ShownPartCard, ShownToolCard } from '../parts/ShownToolCard';
import { isShownInPlace } from '../parts/pageRenderView';
import { toToolView } from '../parts/toolView';
import TurnActivity from '../../components/TurnActivity';
import { LiveActivityCollapse } from '../../components/LiveActivityCollapse';
import { ActivityRowSkipContext, isActivityRowPart } from '../../lib/turns/activityRows';
import { LiveFinalActivityContext, LiveTurnHoistedPagesContext } from '../../components/liveActivityContext';
import { MessageSliceContext } from '../messageSliceContext';
import { MessageSelectionMark } from '../../messageSelection/MessageSelectionMark';
import { useUIStore } from '@/stores/useUIStore';
import { INLINE_MESSAGE_ACTIONS_CLASS_NAME } from './messageBodyStyles';

type ToolPartType = ToolCallPart | ToolResultPart;

const shouldShowTool = (toolPart: ToolPartType): boolean => {
    if (toolPart.type === 'tool_result') return true;
    return toolPart.status === 'pending_approval'
        || toolPart.status === 'approved'
        || toolPart.status === 'running'
        || toolPart.status === 'completed'
        || toolPart.status === 'failed'
        || toolPart.status === 'denied';
};

export const useAssistantRenderedParts = ({
    messageId,
    sessionId,
    effectiveDirectory,
    visibleParts,
    messageTextContentRef,
    messageActionButtons,
    answerSelectionKey,
    effectiveStreamPhase,
    isFinalAnswer,
    isLastAssistantInTurn,
    turnGroupingContext,
    showReasoningTraces,
    expandedTools,
    onToggleTool,
    onShowPopup,
    isMobile,
    alwaysShowMessageActions,
    shouldShowStandaloneMessageActions,
    lastRenderableTextPartIndex,
    chatRenderMode,
    isSortedRenderMode,
    isActivityOwnerMessage,
    shouldRenderActivityGroup,
    shouldDeferSortedInlineText,
    activityByPart,
    activityGroupSegmentsForMessage,
    toggleActivityGroup,
    animateActivityRows,
    renderJustificationActions,
}: {
    messageId: string;
    sessionId: string | undefined;
    effectiveDirectory: string | null | undefined;
    visibleParts: Part[];
    messageTextContentRef: React.RefObject<HTMLDivElement | null>;
    messageActionButtons: React.ReactNode;
    answerSelectionKey: string | null;
    effectiveStreamPhase: StreamPhase;
    isFinalAnswer: boolean;
    isLastAssistantInTurn: boolean;
    turnGroupingContext: TurnGroupingContext | undefined;
    showReasoningTraces: boolean;
    expandedTools: Set<string>;
    onToggleTool: (toolId: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    isMobile: boolean;
    alwaysShowMessageActions: boolean;
    shouldShowStandaloneMessageActions: boolean;
    lastRenderableTextPartIndex: number;
    chatRenderMode: 'live' | 'sorted';
    isSortedRenderMode: boolean;
    isActivityOwnerMessage: boolean;
    shouldRenderActivityGroup: boolean;
    shouldDeferSortedInlineText: boolean;
    activityByPart: { get: (part: Part) => TurnActivityRecord | undefined };
    activityGroupSegmentsForMessage: TurnActivityGroup[];
    toggleActivityGroup: (() => void) | undefined;
    animateActivityRows: boolean;
    renderJustificationActions: (activity: TurnActivityRecord) => React.ReactNode;
}) => {
    const collapsibleThinkingBlocks = useUIStore((state) => state.collapsibleThinkingBlocks);
    const liveFinalActivity = React.useContext(LiveFinalActivityContext);
    const activityRowSkip = React.useContext(ActivityRowSkipContext);
    const hoistedPages = React.useContext(LiveTurnHoistedPagesContext);
    const slice = React.useContext(MessageSliceContext);

    const callsForTurn = React.useMemo(() => {
        const calls = new Map<string, ToolCallPart>();
        for (const activity of turnGroupingContext?.activityParts ?? []) {
            if (activity.part.type === 'tool_call') calls.set(activity.part.toolCallId, activity.part);
        }
        for (const part of visibleParts) {
            if (part.type === 'tool_call') calls.set(part.toolCallId, part);
        }
        return calls;
    }, [turnGroupingContext?.activityParts, visibleParts]);

    const resultsForTurn = React.useMemo(() => {
        const results = new Map<string, ToolResultPart>();
        for (const part of visibleParts) {
            if (part.type === 'tool_result') results.set(part.toolCallId, part);
        }
        for (const activity of turnGroupingContext?.activityParts ?? []) {
            if (activity.part.type === 'tool_result') results.set(activity.part.toolCallId, activity.part);
        }
        return results;
    }, [turnGroupingContext?.activityParts, visibleParts]);

    const pairedResultKeys = React.useMemo(() => {
        const keys = new Set<string>();
        for (const part of visibleParts) {
            if (part.type === 'tool_result') {
                keys.add(`${turnGroupingContext?.turnId ?? ''}\n${part.toolCallId}\n${part.toolName}`);
            }
        }
        return keys;
    }, [turnGroupingContext?.turnId, visibleParts]);

    return React.useMemo(() => {
        const answerRendered: React.ReactNode[] = [];
        const activityRendered: React.ReactNode[] = [];
        let rendered = answerRendered;
        const splitLiveActivity = !isSortedRenderMode && liveFinalActivity?.messageId === messageId && isFinalAnswer;
        let hasRenderedAnswerText = false;
        const isFinalLiveAnswer = !isSortedRenderMode && isLastAssistantInTurn && isFinalAnswer;
        const hasEarlierVisibleActivity = isFinalLiveAnswer && Boolean(turnGroupingContext?.activityParts?.some((activity) => {
            if (activity.messageId === messageId) {
                return false;
            }
            if (activity.part.type === 'tool_call' || activity.part.type === 'tool_result') {
                return shouldShowTool(activity.part);
            }
            return (activity.kind !== 'reasoning' || showReasoningTraces) && !isEmptyTextPart(activity.part);
        }));

        const renderSegmentBlock = (segment: TurnActivityGroup): React.ReactNode | null => {
            if (!shouldRenderActivityGroup || !toggleActivityGroup) {
                return null;
            }
            const visibleSegmentParts = showReasoningTraces
                ? segment.parts
                : segment.parts.filter((activity) => activity.kind !== 'reasoning');
            if (visibleSegmentParts.length === 0) {
                return null;
            }
            return (
                <div key={`progressive-group-${segment.id}`} className="mb-3">
                    <TurnActivity
                        parts={visibleSegmentParts}
                        contextParts={turnGroupingContext?.activityParts}
                        sessionId={sessionId}
                        directory={effectiveDirectory}
                        isExpanded={turnGroupingContext?.isGroupExpanded === true}
                        collapsedPreviewCount={7}
                        onToggle={toggleActivityGroup}
                        isMobile={isMobile}
                        expandedTools={expandedTools}
                        onToggleTool={onToggleTool}
                        onShowPopup={onShowPopup}
                        streamPhase={effectiveStreamPhase}
                        showHeader={true}
                        animateRows={animateActivityRows}
                        diffStats={turnGroupingContext?.diffStats}
                        renderJustificationActions={renderJustificationActions}
                    />
                </div>
            );
        };

        const localToolPartIds = new Set<string>();
        const sliceToolPartIds = new Set<string>();
        let inSliceTools = !slice?.from;
        let sliceEndedTools = false;
        visibleParts.forEach((part, index) => {
            if (!inSliceTools && part.partId === slice?.from?.partId) {
                inSliceTools = true;
            }
            if (!sliceEndedTools && slice?.to && (
                slice.to.offset === 0
                    ? part.partId === slice.to.partId
                    : visibleParts[index - 1]?.partId === slice.to.partId
            )) {
                sliceEndedTools = true;
            }
            if (part.type === 'tool_call' || part.type === 'tool_result') {
                localToolPartIds.add(part.partId);
                if (inSliceTools && !sliceEndedTools) {
                    sliceToolPartIds.add(part.partId);
                }
            }
        });

        const segmentsAfterLocalTool = new Map<string, TurnActivityGroup[]>();
        if (shouldRenderActivityGroup && toggleActivityGroup) {
            activityGroupSegmentsForMessage.forEach((segment) => {
                if (segment.afterToolPartId && localToolPartIds.has(segment.afterToolPartId)) {
                    if (!sliceToolPartIds.has(segment.afterToolPartId)) {
                        return;
                    }
                    const list = segmentsAfterLocalTool.get(segment.afterToolPartId) ?? [];
                    list.push(segment);
                    segmentsAfterLocalTool.set(segment.afterToolPartId, list);
                    return;
                }
                if (slice?.from) {
                    return;
                }
                const block = renderSegmentBlock(segment);
                if (block) {
                    rendered.push(block);
                }
            });
        }

        const flushSegmentsAfterTool = (toolPartId: string) => {
            const segments = segmentsAfterLocalTool.get(toolPartId);
            if (!segments) {
                return;
            }
            segmentsAfterLocalTool.delete(toolPartId);
            segments.forEach((segment) => {
                const block = renderSegmentBlock(segment);
                if (block) {
                    rendered.push(block);
                }
            });
        };

        let rowsToSkip = activityRowSkip?.messageId === messageId ? activityRowSkip.rows : 0;
        let sliceStarted = !slice?.from;
        const firstTextPartId = visibleParts.find((candidate) => candidate.type === 'text')?.partId;
        let i = 0;
        while (i < visibleParts.length) {
            const part = visibleParts[i];
            if (!sliceStarted) {
                sliceStarted = part.partId === slice?.from?.partId;
                if (!sliceStarted) {
                    i += 1;
                    continue;
                }
            }
            if (slice?.to && (slice.to.offset === 0 ? part.partId === slice.to.partId : visibleParts[i - 1]?.partId === slice.to.partId)) break;
            if (rowsToSkip > 0 && isActivityRowPart(part) && !hoistedPages?.has(part.partId)) {
                rowsToSkip -= 1;
                i += 1;
                continue;
            }
            rendered = splitLiveActivity && part.type !== 'text' ? activityRendered : answerRendered;

            if (part.type === 'text') {
                if (hoistedPages?.has(part.partId)) {
                    i += 1;
                    continue;
                }
                const activity = activityByPart.get(part);
                if (shouldDeferSortedInlineText || activity?.kind === 'justification') {
                    i += 1;
                    continue;
                }
                const textStart = slice?.from?.partId === part.partId ? slice.from.offset : 0;
                const textEnd = slice?.to?.partId === part.partId && slice.to.offset > 0 ? slice.to.offset : undefined;
                if (textStart > 0 || (slice?.from && part.partId !== firstTextPartId)) {
                    hasRenderedAnswerText = true;
                }
                const divider = !hasRenderedAnswerText && isFinalLiveAnswer && (rendered.length > 0 || activityRendered.length > 0 || hasEarlierVisibleActivity || turnGroupingContext?.hasEarlierAssistantText) ? (
                    <div
                        key={`final-answer-divider-${messageId}`}
                        aria-hidden="true"
                        className="mt-1.5 mb-3 h-px w-full bg-muted-foreground/20"
                    />
                ) : null;
                const pages = splitLiveActivity && !hasRenderedAnswerText && textStart === 0
                    ? (liveFinalActivity?.pages ?? []).map((pagePart) => (
                        <ShownPartCard
                            key={`page-${pagePart.partId}`}
                            part={pagePart}
                            result={pagePart.type === 'tool_call' ? resultsForTurn.get(pagePart.toolCallId) : undefined}
                            sessionId={sessionId ?? ''}
                            messageId={messageId}
                            onShowPopup={onShowPopup}
                        />
                    ))
                    : [];
                const lead = liveFinalActivity?.keepText ? [...pages, divider] : [divider, ...pages];
                for (const node of lead) {
                    if (node) rendered.push(node);
                }
                hasRenderedAnswerText = true;
                rendered.push(
                    <div
                        key={`assistant-text-${messageId}-${i}`}
                        ref={messageTextContentRef}
                        data-message-text-export-source="true"
                        data-message-select-unit={answerSelectionKey ?? undefined}
                    >
                        <MessageSelectionMark
                            sessionId={sessionId}
                            unitKey={answerSelectionKey}
                            kind="answer"
                            showCheckbox={(turnGroupingContext?.opensAnswerText ?? true) && part.partId === firstTextPartId && textStart === 0}
                        />
                        <AssistantTextPart
                            part={part}
                            sessionId={sessionId}
                            messageId={messageId}
                            streamPhase={effectiveStreamPhase}
                            chatRenderMode={chatRenderMode}
                            onShowPopup={onShowPopup}
                            range={textStart > 0 || textEnd !== undefined ? { start: textStart, end: textEnd } : undefined}
                        />
                    </div>
                );
                if (shouldShowStandaloneMessageActions && i === lastRenderableTextPartIndex) {
                    rendered.push(
                        <div key={`message-actions-${messageId}`} className={INLINE_MESSAGE_ACTIONS_CLASS_NAME} data-message-actions="true">
                            <div className="flex items-center gap-1.5" data-message-action-group="true">
                                {messageActionButtons}
                            </div>
                        </div>
                    );
                }
                i += 1;
                continue;
            }

            if (part.type === 'reasoning') {
                const activity = activityByPart.get(part);
                if (isSortedRenderMode && activity?.kind === 'reasoning') {
                    i += 1;
                    continue;
                }
                const reasoningEnded = effectiveStreamPhase !== 'streaming';
                if (showReasoningTraces && !(reasoningEnded && isInvisibleText(part.content))) {
                    if (!collapsibleThinkingBlocks) {
                        rendered.push(
                            <AssistantTextPart
                                key={`reasoning-${messageId}-${i}`}
                                part={part}
                                sessionId={sessionId}
                                messageId={messageId}
                                streamPhase={effectiveStreamPhase}
                                chatRenderMode={chatRenderMode}
                                onShowPopup={onShowPopup}
                            />
                        );
                    } else {
                        rendered.push(
                            <ReasoningPart
                                key={`reasoning-${messageId}-${i}`}
                                part={part}
                                messageId={messageId}
                                streamPhase={effectiveStreamPhase}
                            />
                        );
                    }
                }
                i += 1;
                continue;
            }

            if (part.type === 'tool_call' || part.type === 'tool_result') {
                const toolPart = part;
                const toolName = toolPart.toolName.toLowerCase();
                const toolPartId = toolPart.partId;
                const pairedCall = toolPart.type === 'tool_result' ? callsForTurn.get(toolPart.toolCallId) : undefined;

                if (toolPart.type === 'tool_call' && pairedResultKeys.has(`${turnGroupingContext?.turnId ?? ''}\n${toolPart.toolCallId}\n${toolPart.toolName}`)) {
                    i += 1;
                    continue;
                }

                if (isSortedRenderMode && !isActivityOwnerMessage) {
                    flushSegmentsAfterTool(toolPartId);
                    i += 1;
                    continue;
                }

                const activity = activityByPart.get(part);
                if (activity?.kind === 'tool' && !isStandaloneTool(toolName)) {
                    flushSegmentsAfterTool(toolPartId);
                    i += 1;
                    continue;
                }

                if (!shouldShowTool(toolPart)) {
                    flushSegmentsAfterTool(toolPartId);
                    i += 1;
                    continue;
                }

                if (isReadTool(toolName)) {
                    const readItemsByCallId = new Map<string, ReadToolGroupItem>();
                    let j = i;
                    while (j < visibleParts.length) {
                        const candidate = visibleParts[j];
                        if (!candidate) break;
                        if (slice?.to && (slice.to.offset === 0 ? candidate.partId === slice.to.partId : visibleParts[j - 1]?.partId === slice.to.partId)) break;
                        if (candidate.type !== 'tool_call' && candidate.type !== 'tool_result') break;
                        if (!isReadTool(normalizeToolName(candidate.toolName))) break;
                        const candidatePaired = candidate.type === 'tool_result'
                            ? callsForTurn.get(candidate.toolCallId)
                            : undefined;
                        const candidateCall = candidate.type === 'tool_call' ? candidate : candidatePaired;
                        const readPath = toolInputPath(candidateCall?.input) ?? '';
                        const parsed = parseNativeReadPath(readPath);
                        const existing = readItemsByCallId.get(candidate.toolCallId);
                        if (existing && !existing.isRunning && candidate.type === 'tool_call') {
                            j += 1;
                            continue;
                        }
                        const isErr = candidate.type === 'tool_result' && candidate.isError;
                        const errMsg = isErr ? (candidate.error || 'Failed to read') : undefined;
                        readItemsByCallId.set(candidate.toolCallId, {
                            part: candidate,
                            pairedCall: candidatePaired,
                            path: normalizeWorkspaceToolPath(parsed.path),
                            line: parsed.line,
                            isError: isErr,
                            isRunning: candidate.type === 'tool_call',
                            errorMessage: errMsg,
                        });
                        j += 1;
                    }

                    const readItems = Array.from(readItemsByCallId.values());
                    if (readItems.length > 1) {
                        rendered.push(
                            <FadeInOnReveal key={`read-group-${toolPartId}`}>
                                <ReadToolGroup
                                    items={readItems}
                                    directory={effectiveDirectory ?? ''}
                                />
                            </FadeInOnReveal>
                        );
                        for (let k = i; k < j; k += 1) {
                            const pK = visibleParts[k];
                            if (pK && (pK.type === 'tool_call' || pK.type === 'tool_result')) {
                                flushSegmentsAfterTool(pK.partId);
                            }
                        }
                        i = j;
                        continue;
                    }
                }

                if (sessionId && toolPart.type === 'tool_call' && isShownInPlace(
                    toToolView(toolPart, resultsForTurn.get(toolPart.toolCallId), { sessionID: sessionId, messageID: messageId }),
                )) {
                    if (!hoistedPages?.has(toolPart.partId)) {
                        rendered.push(
                            <ShownToolCard
                                key={`shown-tool-${toolPart.partId}`}
                                part={toolPart}
                                result={resultsForTurn.get(toolPart.toolCallId)}
                                sessionId={sessionId}
                                messageId={messageId}
                                onShowPopup={onShowPopup}
                            />
                        );
                    }
                    flushSegmentsAfterTool(toolPartId);
                    i += 1;
                    continue;
                }

                if (toolPart.type === 'tool_result' || isExpandableTool(toolName)) {
                    rendered.push(
                        <FadeInOnReveal key={`tool-${pairedCall?.partId ?? toolPart.partId}`}>
                            <ToolRevealOnMount animate={false} wipe>
                                <ToolPart
                                    part={toolPart}
                                    pairedCall={pairedCall}
                                    sessionId={sessionId}
                                    directory={effectiveDirectory}
                                    isExpanded={expandedTools.has(toolPart.partId)}
                                    onToggle={onToggleTool}
                                    isMobile={isMobile}
                                    alwaysShowActions={alwaysShowMessageActions}
                                    onShowPopup={onShowPopup}
                                    animateTailText={false}
                                />
                            </ToolRevealOnMount>
                        </FadeInOnReveal>
                    );
                    flushSegmentsAfterTool(toolPartId);
                    if (pairedCall && pairedCall.partId !== toolPartId) {
                        flushSegmentsAfterTool(pairedCall.partId);
                    }
                    i += 1;
                    continue;
                }

                rendered.push(
                    <FadeInOnReveal key={`static-tools-${toolPart.partId}`}>
                        <ToolRevealOnMount animate={false} wipe>
                            <StaticToolRow
                                toolName={toolName}
                                activities={[
                                    {
                                        id: toolPart.partId,
                                        turnId: '',
                                        messageId,
                                        partIndex: 0,
                                        part: toolPart,
                                        kind: 'tool' as const,
                                    },
                                ]}
                                animateTailText={false}
                            />
                        </ToolRevealOnMount>
                    </FadeInOnReveal>
                );
                flushSegmentsAfterTool(toolPartId);
                i += 1;
                continue;
            }

            if (part.type === 'notice') {
                if (part.noticeType === 'compaction') {
                    rendered.push(
                        <FadeInOnReveal key={`compaction-${part.partId}`}>
                            <CompactionDivider
                                method={part.details.method}
                                tokensBefore={part.details.tokensBefore}
                                tokensAfter={part.details.tokensAfter}
                                summary={part.details.summary}
                                warning={part.details.warning}
                            />
                        </FadeInOnReveal>
                    );
                } else {
                    rendered.push(
                        <FadeInOnReveal key={`notice-${part.partId}`}>
                            <TimelineNoticeCard notice={part} sessionId={sessionId} directory={effectiveDirectory} />
                        </FadeInOnReveal>
                    );
                }
                i += 1;
                continue;
            }

            i += 1;
        }

        segmentsAfterLocalTool.forEach((segments) => {
            segments.forEach((segment) => {
                const block = renderSegmentBlock(segment);
                if (block) {
                    rendered.push(block);
                }
            });
        });

        if (splitLiveActivity && liveFinalActivity && (!slice?.from || activityRendered.length > 0)) {
            return [
                <LiveActivityCollapse
                    key="final-message-activity"
                    expanded={liveFinalActivity.expanded}
                    id={slice?.from ? undefined : liveFinalActivity.contentId}
                >
                    {activityRendered}
                </LiveActivityCollapse>,
                ...answerRendered,
            ];
        }
        return answerRendered;
    }, [
        activityByPart,
        activityGroupSegmentsForMessage,
        activityRowSkip,
        alwaysShowMessageActions,
        animateActivityRows,
        answerSelectionKey,
        callsForTurn,
        chatRenderMode,
        collapsibleThinkingBlocks,
        effectiveDirectory,
        effectiveStreamPhase,
        expandedTools,
        hoistedPages,
        isActivityOwnerMessage,
        isFinalAnswer,
        isLastAssistantInTurn,
        isMobile,
        isSortedRenderMode,
        lastRenderableTextPartIndex,
        liveFinalActivity,
        messageActionButtons,
        messageId,
        messageTextContentRef,
        onShowPopup,
        onToggleTool,
        pairedResultKeys,
        renderJustificationActions,
        resultsForTurn,
        sessionId,
        shouldDeferSortedInlineText,
        shouldRenderActivityGroup,
        shouldShowStandaloneMessageActions,
        showReasoningTraces,
        slice,
        toggleActivityGroup,
        turnGroupingContext,
        visibleParts,
    ]);
};
