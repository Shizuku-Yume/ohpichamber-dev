import type { Message, Part } from '@openchamber/agent-contract';

import { filterVisibleParts } from './partUtils';

/**
 * A user message is hidden when none of its parts survive display
 * normalization (a prompt OpenChamber sent on the user's behalf, for
 * instance). Turns separated only by such messages should render as one
 * continuous flow.
 */
// Streaming recomputes turn projections often; cache by parts reference so
// unchanged messages resolve without re-running display normalization.
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
