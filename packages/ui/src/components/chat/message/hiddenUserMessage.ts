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

<<<<<<< HEAD
    const hidden = filterVisibleParts(entry.parts, { includeReasoning: true }).length === 0;
||||||| bc50ba56aa
    // Only whether anything is left counts here, not a chip's label.
    const parts = normalizeUserDisplayParts(normalizeParts(entry.parts), readSourceControlProvider);
    const hidden = filterVisibleParts(parts, { includeReasoning: true }).length === 0;
=======
    const parts = normalizeUserDisplayParts(normalizeParts(entry.parts), readSourceControlProvider);
    const hidden = filterVisibleParts(parts, { includeReasoning: true }).length === 0;
>>>>>>> upstream/main
    hiddenByParts.set(entry.parts, hidden);
    return hidden;
};
