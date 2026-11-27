const REPLY_START_GAP_PX = 16;

interface FollowStop {
    readonly element: HTMLElement;
    readonly limit: number;
    readonly bottom: number;
}

const turnIdOf = (element: HTMLElement): string | undefined => (
    element.closest<HTMLElement>('[data-turn-row]')?.dataset.turnRow
    ?? element.closest<HTMLElement>('[data-turn-id]')?.dataset.turnId
);

const readFollowStop = (node: HTMLElement, element: HTMLElement): FollowStop => {
    const rect = element.getBoundingClientRect();
    const offset = node.scrollTop - node.getBoundingClientRect().top;
    const turnId = turnIdOf(element);
    const header = turnId
        ? node.querySelector<HTMLElement>(`[data-turn-id="${CSS.escape(turnId)}"] > [data-turn-sticky-header]`)
        : null;
    const headerHeight = header ? header.getBoundingClientRect().height : 0;
    return {
        element,
        limit: Math.max(0, rect.top + offset - headerHeight - REPLY_START_GAP_PX),
        bottom: rect.bottom + offset,
    };
};

const findLatestTurnId = (node: HTMLElement): string | undefined => {
    let latest: HTMLElement | null = null;
    let latestTop = Number.NEGATIVE_INFINITY;
    for (const row of node.querySelectorAll<HTMLElement>('[data-turn-id], [data-turn-row]')) {
        const top = row.getBoundingClientRect().top;
        if (top > latestTop) {
            latest = row;
            latestTop = top;
        }
    }
    return latest ? turnIdOf(latest) : undefined;
};

export const findStreamingReply = (node: HTMLElement): HTMLElement | null => {
    const matches = node.querySelectorAll<HTMLElement>('[data-streaming-reply]');
    return matches[matches.length - 1] ?? null;
};

export const findFollowStops = (node: HTMLElement, stopAfterUserMessage: boolean, reply: HTMLElement | null): FollowStop[] => {
    const stops: FollowStop[] = [];
    const turnId = stopAfterUserMessage ? findLatestTurnId(node) : undefined;
    let work: HTMLElement | null = null;
    let workBottom = Number.NEGATIVE_INFINITY;
    if (turnId) {
        for (const row of node.querySelectorAll<HTMLElement>(`[data-turn-row="${CSS.escape(turnId)}"]`)) {
            const rect = row.getBoundingClientRect();
            if (!work || rect.top < work.getBoundingClientRect().top) work = row;
            workBottom = Math.max(workBottom, rect.bottom);
        }
    }
    if (work) {
        const stop = readFollowStop(node, work);
        stops.push({ ...stop, bottom: workBottom + node.scrollTop - node.getBoundingClientRect().top });
    }
    if (reply) stops.push(readFollowStop(node, reply));
    return stops;
};
