import React from 'react';
<<<<<<< HEAD
import type { Part } from '@openchamber/agent-contract';
=======
import { cn } from '@/lib/utils';
import type { Part } from '@/lib/opencode/model';
>>>>>>> bc50ba56a
import { MarkdownRenderer } from '../../MarkdownRenderer';
import type { StreamPhase, ToolPopupContent } from '../types';
import { useStreamingTextThrottle } from '../../hooks/useStreamingTextThrottle';
import { resolveAssistantDisplayText, resolveAssistantTextStreaming, shouldRenderAssistantText } from './assistantTextVisibility';
import { streamPerfCount, streamPerfObserve } from '@/stores/utils/streamDebug';
import { GeneratedJsonResultCard } from './GeneratedJsonResultCard';
import { parseGeneratedJsonResult } from './generatedJsonResult';
import { useGuestLinkRules } from '@/lib/guests/links';

interface AssistantTextPartProps {
    part: Part;
    sessionId?: string;
    messageId: string;
    streamPhase: StreamPhase;
    chatRenderMode?: 'sorted' | 'live';
    onShowPopup?: (content: ToolPopupContent) => void;
    /**
     * The stretch of a finished text this row draws, when a long answer spans
     * several transcript rows (`timelineRows.ts`).
     */
    range?: { start: number; end?: number };
}

const AssistantTextPart: React.FC<AssistantTextPartProps> = ({
    part,
    sessionId,
    messageId,
    streamPhase,
    chatRenderMode = 'live',
    onShowPopup,
    range,
}) => {
    // Use part directly from props — parent provides the latest version from the store.
    // No store subscription here to avoid re-render cascade from unrelated delta events.
<<<<<<< HEAD
    const textContent = part.type === 'text' || part.type === 'reasoning' ? part.content : '';
    // Canonical text parts have no per-part timing; completion comes from
    // the owning message's stream phase.
    const isFinalized = streamPhase !== 'streaming' && streamPhase !== 'cooldown';
=======
    // The extension catalog changes on install or pause, never per delta.
    const guestLinks = useGuestLinkRules();
    const partWithText = part as PartWithText;
    const rawText = typeof partWithText.text === 'string' ? partWithText.text : '';
    const contentText = typeof partWithText.content === 'string' ? partWithText.content : '';
    const valueText = typeof partWithText.value === 'string' ? partWithText.value : '';
    const fullText = [rawText, contentText, valueText].reduce((best, candidate) => {
        return candidate.length > best.length ? candidate : best;
    }, '');
    const textContent = range ? fullText.slice(range.start, range.end) : fullText;
    const time = partWithText.time;
    const isFinalized = Boolean(time && typeof time.end !== 'undefined');
>>>>>>> bc50ba56a
    const isStreaming = resolveAssistantTextStreaming({
        streamPhase,
        chatRenderMode,
        isFinalized,
    });

    streamPerfCount('ui.assistant_text_part.render');
    if (isStreaming) {
        streamPerfCount('ui.assistant_text_part.render.streaming');
    }

    const throttledTextContent = useStreamingTextThrottle({
        text: textContent,
        isStreaming,
        identityKey: `${messageId}:${part.partId}`,
    });

    const displayTextContent = resolveAssistantDisplayText({
        textContent,
        throttledTextContent,
        isStreaming,
    });

    streamPerfObserve('ui.assistant_text_part.display_len', displayTextContent.length);

    const isRenderableTextPart = part.type === 'text' || part.type === 'reasoning';
    if (!isRenderableTextPart) {
        return null;
    }

    if (!shouldRenderAssistantText({
        displayTextContent,
        isFinalized,
    })) {
        return null;
    }

    const generatedResult = !isStreaming && isFinalized && !range ? parseGeneratedJsonResult(displayTextContent) : null;
    if (generatedResult) {
        return (
            <div
                className={`group/assistant-text relative break-words ${chatRenderMode === 'live' ? 'my-1' : ''}`}
                key={part.partId || `${messageId}-text`}
            >
                <GeneratedJsonResultCard result={generatedResult} />
            </div>
        );
    }

    return (
        <div
<<<<<<< HEAD
            className={`group/assistant-text relative break-words ${chatRenderMode === 'live' ? 'my-1' : ''}`}
            key={part.partId || `${messageId}-text`}
=======
            className={cn(
                'group/assistant-text relative break-words',
                // Rows of one answer stack as the whole text did: only its
                // outer edges keep their spacing.
                range?.start ? null : 'mt-1',
                range?.end !== undefined ? null : 'mb-1',
            )}
            data-answer-continues={range?.start ? '' : undefined}
            // Its rows read as one text when a selection crosses them.
            data-answer-part={range ? `${messageId}:${part.id}` : undefined}
            key={part.id || `${messageId}-text`}
            // The chat scroll stops following once the start of the reply
            // being written would leave the screen (useChatTimelineScroll).
            data-streaming-reply={isStreaming && part.type === 'text' ? '' : undefined}
>>>>>>> bc50ba56a
        >
            <MarkdownRenderer
                content={displayTextContent}
                part={part}
                messageId={messageId}
                sessionId={sessionId}
                isAnimated={false}
                isStreaming={isStreaming}
                variant={part.type === 'reasoning' ? 'reasoning' : 'assistant'}
                enableFileReferences={isFinalized}
                onShowPopup={onShowPopup}
                guestLinks={part.type === 'text' ? guestLinks : null}
            />
        </div>
    );
};

export default React.memo(AssistantTextPart);
