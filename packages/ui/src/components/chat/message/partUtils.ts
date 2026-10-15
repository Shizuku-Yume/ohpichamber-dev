import type { Part } from '@openchamber/agent-contract';

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
    return part.content.trim().length === 0;
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
