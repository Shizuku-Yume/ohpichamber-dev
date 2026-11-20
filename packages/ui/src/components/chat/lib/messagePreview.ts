import type { Part } from '@openchamber/agent-contract';
import type { I18nKey, I18nParams } from '@/lib/i18n';
import { extractTerminalContexts } from '@/lib/messages/terminalContext';

type Translate = (key: I18nKey, params?: I18nParams) => string;

/** Transcript text comes only from native text content, never tool output. */
export function getFullText(parts: readonly Part[]): string {
    const text: string[] = [];
    for (const part of parts) {
        if (part.type === 'text') text.push(part.content);
    }
    return text.join('\n');
}

/** Mirror the user renderer's terminal context without inventing part metadata. */
export function getPromptPreviewText(parts: readonly Part[], t?: Translate): string {
    const typed: string[] = [];
    const context: string[] = [];
    const attachments: string[] = [];
    for (const part of parts) {
        if (part.type === 'attachment') {
            attachments.push(part.name);
            continue;
        }
        if (part.type !== 'text') continue;
        const parsed = extractTerminalContexts(part.content);
        if (parsed.visibleText.trim()) typed.push(parsed.visibleText.trim());
        for (const item of parsed.contexts) {
            const label = t?.('chat.message.terminalContext', {
                terminal: item.terminalLabel,
                start: item.startLine,
                end: item.endLine,
            }) ?? `${item.terminalLabel} ${item.startLine}-${item.endLine}`;
            context.push(item.text.trim() ? `${label}: ${item.text.trim()}` : label);
        }
    }
    if (typed.length > 0) return typed.join('\n');
    if (context.length > 0) return context.join(' · ');
    return attachments.join(', ');
}

export function getMessagePreview(parts: readonly Part[], maxLength = 80, t?: Translate): string {
    const singleLine = getPromptPreviewText(parts, t).replace(/\n/g, ' ');
    return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}…` : singleLine;
}
