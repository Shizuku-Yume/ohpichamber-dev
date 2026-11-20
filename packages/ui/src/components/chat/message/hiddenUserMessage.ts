import type { Message, Part } from '@openchamber/agent-contract';

import { filterVisibleParts } from './partUtils';

const hiddenByParts = new WeakMap<Part[], boolean>();

export const isHiddenUserMessage = (
    entry: Message | null | undefined,
): boolean => {
    if (!entry) return false;
    if (entry.role !== 'user') return false;

    const cached = hiddenByParts.get(entry.parts);
    if (cached !== undefined) {
        return cached;
    }

    const hidden = filterVisibleParts(entry.parts, { includeReasoning: true }).length === 0;
    hiddenByParts.set(entry.parts, hidden);
    return hidden;
};
