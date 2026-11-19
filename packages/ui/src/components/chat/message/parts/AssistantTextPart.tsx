import React from 'react';
import { cn } from '@/lib/utils';
import type { Part } from '@openchamber/agent-contract';
import { MarkdownRenderer } from '../../MarkdownRenderer';
import type { StreamPhase, ToolPopupContent } from '../types';
import { useStreamingTextThrottle } from '../../hooks/useStreamingTextThrottle';
import { resolveAssistantDisplayText, resolveAssistantTextStreaming, shouldRenderAssistantText } from './assistantTextVisibility';
import { streamPerfCount, streamPerfObserve } from '@/stores/utils/streamDebug';
import { GeneratedJsonResultCard } from './GeneratedJsonResultCard';
import { parseGeneratedJsonResult } from './generatedJsonResult';
<<<<<<< HEAD
||||||| bc50ba56aa
import { useGuestLinkRules } from '@/lib/guests/links';

type PartWithText = Part & { text?: string; content?: string; value?: string; time?: { start?: number; end?: number } };

// A streaming reply is read a block at a time (see streamTextCommit.ts); taking
// new text at most this often lets the blocks finished in between land, and
// move the chat, together.
const REPLY_REVEAL_INTERVAL_MS = 400;
=======
import { useGuestLinkRules } from '@/lib/guests/links';

type PartWithText = Part & { text?: string; content?: string; value?: string; time?: { start?: number; end?: number } };

const REPLY_REVEAL_INTERVAL_MS = 400;
>>>>>>> upstream/main

interface AssistantTextPartProps {
    part: Part;
    sessionId?: string;
    messageId: string;
    streamPhase: StreamPhase;
    chatRenderMode?: 'sorted' | 'live';
    onShowPopup?: (content: ToolPopupContent) => void;
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
<<<<<<< HEAD
    // Use part directly from props — parent provides the latest version from the store.
    // No store subscription here to avoid re-render cascade from unrelated delta events.
    const fullText = part.type === 'text' || part.type === 'reasoning' ? part.content : '';
||||||| bc50ba56aa
    // Use part directly from props — parent provides the latest version from the store.
    // No store subscription here to avoid re-render cascade from unrelated delta events.
    // The extension catalog changes on install or pause, never per delta.
    const guestLinks = useGuestLinkRules();
    const partWithText = part as PartWithText;
    const rawText = typeof partWithText.text === 'string' ? partWithText.text : '';
    const contentText = typeof partWithText.content === 'string' ? partWithText.content : '';
    const valueText = typeof partWithText.value === 'string' ? partWithText.value : '';
    const fullText = [rawText, contentText, valueText].reduce((best, candidate) => {
        return candidate.length > best.length ? candidate : best;
    }, '');
=======
    const guestLinks = useGuestLinkRules();
    const partWithText = part as PartWithText;
    const rawText = typeof partWithText.text === 'string' ? partWithText.text : '';
    const contentText = typeof partWithText.content === 'string' ? partWithText.content : '';
    const valueText = typeof partWithText.value === 'string' ? partWithText.value : '';
    const fullText = [rawText, contentText, valueText].reduce((best, candidate) => {
        return candidate.length > best.length ? candidate : best;
    }, '');
>>>>>>> upstream/main
    const textContent = range ? fullText.slice(range.start, range.end) : fullText;
    // Canonical text parts have no per-part timing; completion comes from
    // the owning message's stream phase.
    const isFinalized = streamPhase !== 'streaming';
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
        identityKey: range ? `${messageId}:${part.partId}:${range.start}:${range.end ?? ''}` : `${messageId}:${part.partId}`,
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
            className={cn(
                'group/assistant-text relative break-words',
<<<<<<< HEAD
                // Rows of one answer stack as the whole text did: only its
                // outer edges keep their spacing.
                chatRenderMode === 'live' && !range?.start ? 'mt-1' : null,
                chatRenderMode === 'live' && range?.end === undefined ? 'mb-1' : null,
||||||| bc50ba56aa
                // Rows of one answer stack as the whole text did: only its
                // outer edges keep their spacing.
                range?.start ? null : 'mt-1',
                range?.end !== undefined ? null : 'mb-1',
=======
                range?.start ? null : 'mt-1',
                range?.end !== undefined ? null : 'mb-1',
>>>>>>> upstream/main
            )}
            data-answer-continues={range?.start ? '' : undefined}
<<<<<<< HEAD
            // The rows of one answer read as one text when a selection crosses them.
            data-answer-part={range ? `${messageId}:${part.partId}` : undefined}
            // The chat scroll stops following once the start of the reply
            // being written would leave the screen (useChatTimelineScroll).
||||||| bc50ba56aa
            // Its rows read as one text when a selection crosses them.
            data-answer-part={range ? `${messageId}:${part.id}` : undefined}
            key={part.id || `${messageId}-text`}
            // The chat scroll stops following once the start of the reply
            // being written would leave the screen (useChatTimelineScroll).
=======
            data-answer-part={range ? `${messageId}:${part.id}` : undefined}
            key={part.id || `${messageId}-text`}
>>>>>>> upstream/main
            data-streaming-reply={isStreaming && part.type === 'text' ? '' : undefined}
            key={part.partId || `${messageId}-text`}
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
            />
        </div>
    );
};

export default React.memo(AssistantTextPart);
