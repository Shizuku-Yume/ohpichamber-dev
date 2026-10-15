import React from 'react';
import type { Message, Part } from '@openchamber/agent-contract';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useUIStore } from '@/stores/useUIStore';
import { useCopyMessageLink } from './message/useCopyMessageLink';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import type { StreamPhase } from './message/types';
import { copyTextToClipboard } from '@/lib/clipboard';

interface ChatMessageProps {
    message: Message;
    previousMessage?: Message;
    nextMessage?: Message;
    scrollToBottom?: () => void;
    isInActiveTurn?: boolean;
    activeStreamingPhase?: StreamPhase | null;
}

const renderPart = (part: Part, messageId: string, showReasoning: boolean): React.ReactNode => {
    switch (part.type) {
        case 'text': return <MarkdownRenderer key={part.partId} content={part.content} messageId={messageId} />;
        case 'reasoning': return showReasoning ? <MarkdownRenderer key={part.partId} content={part.content} messageId={messageId} variant="reasoning" /> : null;
        case 'tool_call': return <details key={part.partId} className="rounded border border-border p-2"><summary>{part.toolName} · {part.status}</summary><pre className="overflow-x-auto whitespace-pre-wrap">{JSON.stringify(part.input, null, 2)}</pre></details>;
        case 'tool_result': return <details key={part.partId} className="rounded border border-border p-2" open={part.isError}><summary>{part.toolName}</summary><pre className="overflow-x-auto whitespace-pre-wrap">{part.error ?? (typeof part.output === 'string' ? part.output : JSON.stringify(part.output, null, 2))}</pre></details>;
        // Host attachment URIs are identities, not browser-download URLs.
        case 'attachment': return <span key={part.partId} className="typography-meta">{part.name}</span>;
        case 'step_summary': return <div key={part.partId} className="typography-meta text-muted-foreground">{part.title}</div>;
    }
};

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
    const { t } = useI18n();
    const showReasoning = useUIStore((state) => state.showReasoningTraces);
    const copyLink = useCopyMessageLink(message.sessionId, message.messageId);
    // Agent/variant, completed timestamps, injected-context and legacy tool
    // popups have no canonical message representation. Do not infer them.
    return <article data-message-id={message.messageId} data-turn-id={message.turnId} className="min-w-0 space-y-3 py-3">
        {message.role === 'assistant' && message.modelId ? <div className="typography-meta text-muted-foreground">{message.modelId}</div> : null}
        {message.parts.map((part) => renderPart(part, message.messageId, showReasoning))}
        <Button variant="ghost" size="sm" onClick={() => { void copyTextToClipboard(message.parts.filter((part) => part.type === 'text').map((part) => part.content).join('\n')); }}>{t('chat.messageBody.actions.copyMessage')}</Button>
        <Button variant="ghost" size="sm" onClick={copyLink}>{t('chat.messageBody.actions.copyLink')}</Button>
    </article>;
};

export default React.memo(ChatMessage);
