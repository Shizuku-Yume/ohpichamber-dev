import { TIMELINE_FOLLOW_REARM_THRESHOLD_PX } from './timelineScrollAnchoring';

interface PinnedScrollTop {
    current: number | null;
}

interface OffsetList {
    scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
}

export const recordPinnedScrollTop = (pinned: PinnedScrollTop, node: HTMLElement | null): void => {
    if (!node) return;
    const end = node.scrollHeight - node.clientHeight;
    if (end - node.scrollTop <= TIMELINE_FOLLOW_REARM_THRESHOLD_PX) pinned.current = node.scrollTop;
};

export const scrollMovedUpFromPinnedEnd = (
    pinned: PinnedScrollTop,
    node: HTMLElement | null,
    isLive: () => boolean,
): boolean => {
    if (!node || isLive() || pinned.current === null) return false;
    const end = node.scrollHeight - node.clientHeight;
    return end - node.scrollTop > TIMELINE_FOLLOW_REARM_THRESHOLD_PX
        && node.scrollTop < pinned.current - 2;
};

export const releaseExternalScrollUp = (
    node: HTMLElement | null,
    list: { readonly current: OffsetList | null },
    release: () => void,
): void => {
    if (!node) return;
    release();
    list.current?.scrollToOffset({ offset: node.scrollTop, animated: false });
};
