import { readContextPart } from '@/lib/messages/contextParts';
import { readBrowserAnnotationPrompt } from '@/lib/browser/annotationPrompt';
import type { Part } from '@openchamber/agent-contract';
import { isInvisibleText } from '@/lib/invisibleText';

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

/**
 * The parts a message actually shows.
 *
 * Canonical parts have no synthetic display variants; the only choice here
 * is whether reasoning is on screen.
 */
export const filterVisibleParts = (parts: Part[], options: VisibleFilterOptions = {}): Part[] => {
    const { includeReasoning = true } = options;
    const validParts = normalizeParts(parts);
    if (includeReasoning) return validParts;
    return validParts.filter((part) => part.type !== 'reasoning');
};

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
