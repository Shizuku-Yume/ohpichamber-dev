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

<<<<<<< HEAD
/** Mirror the user renderer's terminal context without inventing part metadata. */
export function getPromptPreviewText(parts: readonly Part[], t?: Translate): string {
    const typed: string[] = [];
    const context: string[] = [];
    const attachments: string[] = [];
    for (const part of parts) {
        if (part.type === 'attachment') {
            attachments.push(part.name);
            continue;
||||||| bc50ba56aa
const basename = (path: string): string => {
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? path;
};

/**
 * The caption a context attachment shows in the bubble, reused as a preview
 * prefix. `descriptorOf` names a change request's provider; a part without one
 * was written before providers other than GitHub existed and reads as a pull
 * request with `#`.
 */
const contextSummary = (payload: ContextPartPayload, t: Translate, descriptorOf: SourceControlDescriptorOf): string => {
    const changeRequestTermOf = (provider: string | undefined) => descriptorOf(provider).terminology.changeRequest;
    switch (payload.kind) {
        case 'code-comment': {
            const file = basename(payload.fileLabel);
            return payload.startLine === payload.endLine
                ? t('chat.message.context.codeCommentLine', { file, line: payload.startLine })
                : t('chat.message.context.codeComment', { file, start: payload.startLine, end: payload.endLine });
=======
const basename = (path: string): string => {
    const segments = path.split('/').filter(Boolean);
    return segments[segments.length - 1] ?? path;
};

const contextSummary = (payload: ContextPartPayload, t: Translate, descriptorOf: SourceControlDescriptorOf): string => {
    const changeRequestTermOf = (provider: string | undefined) => descriptorOf(provider).terminology.changeRequest;
    switch (payload.kind) {
        case 'code-comment': {
            const file = basename(payload.fileLabel);
            return payload.startLine === payload.endLine
                ? t('chat.message.context.codeCommentLine', { file, line: payload.startLine })
                : t('chat.message.context.codeComment', { file, start: payload.startLine, end: payload.endLine });
>>>>>>> upstream/main
        }
<<<<<<< HEAD
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
||||||| bc50ba56aa
        case 'terminal':
            return t('chat.message.terminalContext', {
                terminal: payload.terminalLabel,
                start: payload.startLine,
                end: payload.endLine,
            });
        case 'browser-annotation':
            return t('chat.message.context.browserAnnotation', { page: payload.pageUrl });
        case 'pr-comment':
            return t(changeRequestCopy('chat.message.context.prComment', changeRequestTermOf(payload.provider)), { label: payload.label });
        case 'pr-check':
            return t(changeRequestCopy('chat.message.context.prCheck', changeRequestTermOf(payload.provider)), { label: payload.label });
        case 'file-quote': {
            const file = basename(payload.fileLabel);
            if (payload.startLine == null || payload.endLine == null) {
                return t('chat.message.context.fileQuote', { file });
            }
            return payload.startLine === payload.endLine
                ? t('chat.message.context.codeCommentLine', { file, line: payload.startLine })
                : t('chat.message.context.codeComment', { file, start: payload.startLine, end: payload.endLine });
        }
        case 'chat-quote':
            return t('chat.message.context.chatQuote');
        case 'repository-issue':
        case 'repository-discussion':
            return `#${payload.number} ${payload.title}`;
        case 'change-request':
            return `${formatChangeRequestReference(descriptorOf(payload.provider), payload.number)} ${payload.title}`;
        case 'tracker-item':
            return `${payload.identifier} ${payload.title}`;
        case 'guest-issue':
        case 'guest-pr':
            return `${payload.id} ${payload.title}`;
        case 'session':
            return payload.title;
        case 'session-message':
            return payload.excerpt;
    }
};

/** The quoted material behind a context attachment. */
const contextBody = (payload: ContextPartPayload): string => {
    switch (payload.kind) {
        case 'code-comment':
            return payload.code;
        case 'terminal':
            return payload.output;
        case 'browser-annotation':
            return payload.prompt;
        case 'pr-comment':
            return payload.body;
        case 'pr-check':
            return payload.output;
        case 'file-quote':
        case 'chat-quote':
            return payload.quote;
        case 'repository-issue':
        case 'repository-discussion':
        case 'change-request':
        case 'tracker-item':
        case 'guest-issue':
        case 'guest-pr':
        case 'session':
        case 'session-message':
            return '';
    }
};

/**
 * One preview line for a context attachment, mirroring the collapsed bubble:
 * the caption, then the user's comment when there is one, otherwise the quote.
 */
const contextPreview = (payload: ContextPartPayload, t: Translate, descriptorOf: SourceControlDescriptorOf): string => {
    const summary = contextSummary(payload, t, descriptorOf);
    const comment = 'text' in payload ? payload.text.trim() : '';
    const detail = comment.length > 0 ? comment : contextBody(payload).trim();
    return detail.length > 0 ? `${summary}: ${detail}` : summary;
};

/**
 * The text a user prompt shows in navigators: what the user typed, and — for
 * messages that are only attached context (a quoted message, a terminal
 * selection) — a label derived from that context, so such turns are never
 * label-less. Without a translator it falls back to the raw part text.
 *
 * React callers pass `useSourceControlDescriptorOf()` and keep it in their memo
 * inputs, so change-request wording drawn before the provider list arrived is
 * redrawn when it does; the default reads the registry as it is now.
 */
export function getPromptPreviewText(parts: Part[], t?: Translate, descriptorOf: SourceControlDescriptorOf = readSourceControlProvider): string {
    const typed = parts
        .filter(isTextPart)
        .filter((p) => readContextPart(p) === null)
        .map((p) => p.text.trim())
        .filter((text) => text.length > 0);
    if (typed.length > 0) {
        return typed.join('\n');
    }

    if (t) {
        const contextLines = parts
            .map((part) => readContextPart(part))
            .filter((payload): payload is ContextPartPayload => payload !== null)
            .map((payload) => contextPreview(payload, t, descriptorOf))
            .filter((line) => line.length > 0);
        if (contextLines.length > 0) {
            return contextLines.join(' · ');
=======
        case 'terminal':
            return t('chat.message.terminalContext', {
                terminal: payload.terminalLabel,
                start: payload.startLine,
                end: payload.endLine,
            });
        case 'browser-annotation':
            return t('chat.message.context.browserAnnotation', { page: payload.pageUrl });
        case 'pr-comment':
            return t(changeRequestCopy('chat.message.context.prComment', changeRequestTermOf(payload.provider)), { label: payload.label });
        case 'pr-check':
            return t(changeRequestCopy('chat.message.context.prCheck', changeRequestTermOf(payload.provider)), { label: payload.label });
        case 'file-quote': {
            const file = basename(payload.fileLabel);
            if (payload.startLine == null || payload.endLine == null) {
                return t('chat.message.context.fileQuote', { file });
            }
            return payload.startLine === payload.endLine
                ? t('chat.message.context.codeCommentLine', { file, line: payload.startLine })
                : t('chat.message.context.codeComment', { file, start: payload.startLine, end: payload.endLine });
        }
        case 'chat-quote':
            return t('chat.message.context.chatQuote');
        case 'repository-issue':
        case 'repository-discussion':
            return `#${payload.number} ${payload.title}`;
        case 'change-request':
            return `${formatChangeRequestReference(descriptorOf(payload.provider), payload.number)} ${payload.title}`;
        case 'tracker-item':
            return `${payload.identifier} ${payload.title}`;
        case 'guest-issue':
        case 'guest-pr':
            return `${payload.id} ${payload.title}`;
        case 'session':
            return payload.title;
        case 'session-message':
            return payload.excerpt;
        case 'shared-page':
            return payload.title || payload.host;
    }
};

const contextBody = (payload: ContextPartPayload): string => {
    switch (payload.kind) {
        case 'code-comment':
            return payload.code;
        case 'terminal':
            return payload.output;
        case 'browser-annotation':
            return payload.prompt;
        case 'pr-comment':
            return payload.body;
        case 'pr-check':
            return payload.output;
        case 'file-quote':
        case 'chat-quote':
            return payload.quote;
        case 'repository-issue':
        case 'repository-discussion':
        case 'change-request':
        case 'tracker-item':
        case 'guest-issue':
        case 'guest-pr':
        case 'session':
        case 'session-message':
        case 'shared-page':
            return '';
    }
};

const contextPreview = (payload: ContextPartPayload, t: Translate, descriptorOf: SourceControlDescriptorOf): string => {
    const summary = contextSummary(payload, t, descriptorOf);
    const comment = 'text' in payload ? payload.text.trim() : '';
    const detail = comment.length > 0 ? comment : contextBody(payload).trim();
    return detail.length > 0 ? `${summary}: ${detail}` : summary;
};

export function getPromptPreviewText(parts: Part[], t?: Translate, descriptorOf: SourceControlDescriptorOf = readSourceControlProvider): string {
    const typed = parts
        .filter(isTextPart)
        .filter((p) => readContextPart(p) === null)
        .map((p) => p.text.trim())
        .filter((text) => text.length > 0);
    if (typed.length > 0) {
        return typed.join('\n');
    }

    if (t) {
        const contextLines = parts
            .map((part) => readContextPart(part))
            .filter((payload): payload is ContextPartPayload => payload !== null)
            .map((payload) => contextPreview(payload, t, descriptorOf))
            .filter((line) => line.length > 0);
        if (contextLines.length > 0) {
            return contextLines.join(' · ');
>>>>>>> upstream/main
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
