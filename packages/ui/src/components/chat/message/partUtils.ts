import type { Part } from '@openchamber/agent-contract';
import { isInvisibleText } from '@/lib/invisibleText';
<<<<<<< HEAD
||||||| bc50ba56aa
import { readContextPart } from '@/lib/messages/contextParts';
import type { Part } from '@/lib/opencode/model';

const COLLAPSED_LINES = 2;

/**
 * The context parts a collapsed user message leaves out. The message gets two
 * lines: its own text takes what it needs and context rows get the rest, so
 * the text always stays. Session mentions draw no row and do not count.
 */
export const contextPartsPastCollapse = (parts: Part[], textLines: number): ReadonlySet<Part> => {
    const rows = parts.filter((part) => {
        const context = readContextPart(part);
        return context !== null && context.kind !== 'session' && context.kind !== 'session-message';
    });
    return new Set(rows.slice(Math.max(0, COLLAPSED_LINES - textLines)));
};
=======
import { readBrowserAnnotationPrompt } from '@/lib/browser/annotationPrompt';
import { readContextPart } from '@/lib/messages/contextParts';
import type { Part } from '@/lib/opencode/model';

const COLLAPSED_LINES = 2;

export const contextPartsPastCollapse = (parts: Part[], textLines: number): ReadonlySet<Part> => {
    const hidden = new Set<Part>();
    let linesLeft = COLLAPSED_LINES - textLines;
    for (const part of parts) {
        const context = readContextPart(part);
        if (context === null || context.kind === 'session' || context.kind === 'session-message') continue;
        const comment = context.kind === 'browser-annotation'
            ? context.text || readBrowserAnnotationPrompt(context.prompt).comment || ''
            : 'text' in context ? context.text : '';
        const lines = comment.trim().length > 0 ? 2 : 1;
        if (hidden.size === 0 && lines <= linesLeft) {
            linesLeft -= lines;
        } else {
            hidden.add(part);
        }
    }
    return hidden;
};
>>>>>>> upstream/main

const isValidPart = (part: unknown): part is Part => {
    return Boolean(part && typeof part === 'object' && typeof (part as { type?: unknown }).type === 'string');
};

export const normalizeParts = (parts: Part[]): Part[] => {
    return parts.filter(isValidPart);
};

export const extractTextContent = (part: Part): string => {
    return part.type === 'text' || part.type === 'reasoning' ? part.content : '';
};

export const isEmptyTextPart = (part: Part): boolean => {
    if (part.type !== 'text') {
        return false;
    }
    return isInvisibleText(part.content);
};

interface VisibleFilterOptions {
    includeReasoning?: boolean;
}

<<<<<<< HEAD
/**
 * The parts a message actually shows.
 *
 * Canonical parts have no synthetic display variants; the only choice here
 * is whether reasoning is on screen.
 */
||||||| bc50ba56aa
/**
 * The parts a message actually shows.
 *
 * OpenCode v2 no longer marks parts synthetic and no longer sends patch
 * parts, so the only choice left here is whether reasoning is on screen.
 */
=======
>>>>>>> upstream/main
export const filterVisibleParts = (parts: Part[], options: VisibleFilterOptions = {}): Part[] => {
    const { includeReasoning = true } = options;
    const validParts = normalizeParts(parts);
    if (includeReasoning) return validParts;
    return validParts.filter((part) => part.type !== 'reasoning');
};
