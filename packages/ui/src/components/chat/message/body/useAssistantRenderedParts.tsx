import React from 'react';
import type { Part, ToolCallPart as NativeToolCallPart, ToolResultPart as NativeToolResultPart } from '@openchamber/agent-contract';
type ToolPartType = NativeToolCallPart | NativeToolResultPart;
import type { StreamPhase, ToolPopupContent } from '../types';
import type { TurnGroupingContext } from '../../lib/turns/types';
import ToolPart from '../parts/ToolPart';
import AssistantTextPart from '../parts/AssistantTextPart';
import ReasoningPart from '../parts/ReasoningPart';
import { isEmptyTextPart } from '../partUtils';
import { isInvisibleText } from '@/lib/invisibleText';
import { FadeInOnReveal } from '../FadeInOnReveal';
import { SessionNoticeBlock } from '../SessionNoticeBlock';
import { readSessionNoticePart } from '@/lib/opencode/session-notices';
import { StaticToolRow } from '../parts/ProgressiveGroup';
import { isExpandableTool } from '../parts/toolRenderUtils';
import { ShownPartCard, ShownToolCard } from '../parts/ShownToolCard';
import { isShownInPlace } from '@/lib/opencode/tools';
import { LiveActivityCollapse } from '../../components/LiveActivityCollapse';
import { ActivityRowSkipContext, isActivityRowPart, isToolRowShown } from '../../lib/turns/activityRows';
import { LiveFinalActivityContext, LiveTurnHoistedPagesContext } from '../../components/liveActivityContext';
import { MessageSliceContext } from '../messageSliceContext';
import { MessageSelectionMark } from '../../messageSelection/MessageSelectionMark';
import { useUIStore } from '@/stores/useUIStore';
import { INLINE_MESSAGE_ACTIONS_CLASS_NAME } from './messageBodyStyles';

export const useAssistantRenderedParts = ({
    messageId,
    sessionId,
    visibleParts,
    messageTextContentRef,
    messageActionButtons,
    answerSelectionKey,
    effectiveStreamPhase,
    hasStopFinish,
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
}: {
    messageId: string;
    sessionId: string | undefined;
    visibleParts: Part[];
    messageTextContentRef: React.RefObject<HTMLDivElement | null>;
    messageActionButtons: React.ReactNode;
    answerSelectionKey: string | null;
    effectiveStreamPhase: StreamPhase;
    hasStopFinish: boolean;
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
}) => {
    const collapsibleThinkingBlocks = useUIStore((state) => state.collapsibleThinkingBlocks);
    const liveFinalActivity = React.useContext(LiveFinalActivityContext);
    const activityRowSkip = React.useContext(ActivityRowSkipContext);
    const hoistedPages = React.useContext(LiveTurnHoistedPagesContext);
    const slice = React.useContext(MessageSliceContext);

    return React.useMemo(() => {
        const answerRendered: React.ReactNode[] = [];
        const activityRendered: React.ReactNode[] = [];
        let rendered = answerRendered;
        const splitLiveActivity = liveFinalActivity?.messageId === messageId && hasStopFinish;
        let hasRenderedAnswerText = false;
        const isFinalLiveAnswer = isLastAssistantInTurn && hasStopFinish;
        const hasEarlierVisibleActivity = isFinalLiveAnswer && Boolean(turnGroupingContext?.activityParts?.some((activity) => {
            if (activity.messageId === messageId) {
                return false;
            }
            if (activity.part.type === 'tool') {
                return isToolRowShown(activity.part);
            }
            return showReasoningTraces && !isEmptyTextPart(activity.part);
        }));

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
            if (rowsToSkip > 0 && isActivityRowPart(part)) {
                rowsToSkip -= 1;
                i += 1;
                continue;
            }
            rendered = splitLiveActivity && part.type !== 'text' ? activityRendered : answerRendered;

            if (part.type === 'text') {
                if (part.partId && hoistedPages?.has(part.partId)) {
                    i++;
                    continue;
                }
                const textStart = slice?.from?.partId === part.partId ? slice.from.offset : 0;
                const textEnd = slice?.to?.partId === part.partId && slice.to.offset > 0 ? slice.to.offset : undefined;
                if (textStart > 0 || (slice?.from && part.partId !== firstTextPartId)) {
                    hasRenderedAnswerText = true;
                } else if (isFinalLiveAnswer && !hasRenderedAnswerText && (rendered.length > 0 || activityRendered.length > 0 || hasEarlierVisibleActivity || turnGroupingContext?.earlierAssistantText)) {
                    rendered.push(
                        <div
                            key={`final-answer-divider-${messageId}`}
                            aria-hidden="true"
                            className="mt-1.5 mb-3 h-px w-full bg-muted-foreground/20"
                        />
                    );
                }
                if (splitLiveActivity && !hasRenderedAnswerText && textStart === 0) {
                    for (const pagePart of liveFinalActivity?.pages ?? []) {
                        rendered.push(<ShownPartCard key={`page-${pagePart.id}`} part={pagePart} onShowPopup={onShowPopup} />);
                    }
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
                            showCheckbox={Boolean(turnGroupingContext?.opensAnswerText) && part.partId === firstTextPartId && textStart === 0}
                        />
                        <AssistantTextPart
                            part={part}
                            sessionId={sessionId}
                            messageId={messageId}
                            streamPhase={effectiveStreamPhase}
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
                i++;
                continue;
            }

            if (part.type === 'reasoning') {
                const reasoningEnded = part.time?.end !== undefined
                    || (effectiveStreamPhase !== 'streaming' && effectiveStreamPhase !== 'cooldown');
                if (showReasoningTraces && !(reasoningEnded && isInvisibleText(part.content))) {
                    if (!collapsibleThinkingBlocks) {
                        rendered.push(
                            <AssistantTextPart
                                key={`reasoning-${messageId}-${i}`}
                                part={part}
                                sessionId={sessionId}
                                messageId={messageId}
                                streamPhase={effectiveStreamPhase}
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
                i++;
                continue;
            }

            if (part.type === 'tool') {
                const toolPart = part as ToolPartType;
                const toolName = toolPart.toolName?.toLowerCase() ?? '';

                const notice = readSessionNoticePart(toolPart);
                if (notice) {
                    rendered.push(
                        <FadeInOnReveal key={`notice-${toolPart.partId}`}>
                            <SessionNoticeBlock notice={notice} blockId={toolPart.partId} />
                        </FadeInOnReveal>
                    );
                    i++;
                    continue;
                }

                if (!isToolRowShown(toolPart)) {
                    i++;
                    continue;
                }

                if (isShownInPlace(toolPart.toolName, toolPart.state)) {
                    if (!hoistedPages?.has(toolPart.partId)) {
                        rendered.push(<ShownToolCard key={`page-${toolPart.partId}`} part={toolPart} onShowPopup={onShowPopup} />);
                    }
                    i++;
                    continue;
                }

                if (isExpandableTool(toolName)) {
                    rendered.push(
                        <FadeInOnReveal key={`tool-${toolPart.partId}`}>
                            <ToolPart
                                part={toolPart}
                                isExpanded={expandedTools.has(toolPart.partId)}
                                onToggle={onToggleTool}
                                isMobile={isMobile}
                                alwaysShowActions={alwaysShowMessageActions}
                                onShowPopup={onShowPopup}
                                animateTailText={false}
                            />
                        </FadeInOnReveal>
                    );
                    i++;
                    continue;
                }

                rendered.push(
                    <FadeInOnReveal key={`static-tools-${toolPart.partId}`}>
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
                    </FadeInOnReveal>
                );
                i++;
                continue;
            }

            i++;
        }

        if (splitLiveActivity && liveFinalActivity && (!slice?.from || activityRendered.length > 0)) {
            return [
                <LiveActivityCollapse key="final-message-activity" expanded={liveFinalActivity.expanded}
                    id={slice?.from ? undefined : liveFinalActivity.contentId}>
                    {activityRendered}
                </LiveActivityCollapse>,
                ...answerRendered,
            ];
        }
        return answerRendered;
    }, [
        activityRowSkip,
        alwaysShowMessageActions,
        hoistedPages,
        collapsibleThinkingBlocks,
        expandedTools,
        isMobile,
        liveFinalActivity,
        isLastAssistantInTurn,
        hasStopFinish,
        lastRenderableTextPartIndex,
        messageId,
        messageActionButtons,
        messageTextContentRef,
        sessionId,
        onShowPopup,
        onToggleTool,
        shouldShowStandaloneMessageActions,
        effectiveStreamPhase,
        showReasoningTraces,
        slice,
        turnGroupingContext,
        visibleParts,
        answerSelectionKey,
    ]);
};
