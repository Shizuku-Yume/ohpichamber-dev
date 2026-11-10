/**
 * Highlights for chat quotes inside the transcript, painted with the CSS
 * Custom Highlight API so the rendered markdown is never touched.
 *
 * - Marks: every quote waiting in the composer's context chips stays softly
 *   highlighted in its message, so the reader sees where they left off. The
 *   mark the user hovers in the chip preview is drawn stronger.
 * - Reveal: clicking a quote (a chip entry, or a sent quote card) scrolls to
 *   its message and briefly flashes the fragment.
 * - Popover: hovering a mark (desktop) or tapping it (touch) opens its
 *   comment with edit and remove, acting on the draft through the publisher.
 *
 * The column owns a store (`hooks/chatQuoteHighlightStore.ts`) that publishers
 * write to, and renders `ChatQuoteHighlightLayer`, which subscribes to it and holds
 * all hover, popover and scroll-follow state. Highlight activity therefore
 * re-renders only the layer, never the chat column.
 *
 * Ranges are re-resolved from their anchors whenever a marked message
 * re-renders or remounts in the virtualized list. Runtimes without
 * `CSS.highlights` get the scroll without the highlight.
<<<<<<< HEAD
=======
 *
 * A quote taken inside a page the agent showed (`openchamber_render`) has a
 * `page` in its anchor. A UI page is found in the chat by its source message
 * and render part; a framed page paints, scrolls and hit-tests through
 * `pageQuoteBridge.ts`. A frame's popover opens on click only because the
 * pointer over it is invisible to the app.
>>>>>>> bc50ba56a
 */

import React from 'react';

import {
    findChatQuoteRoots,
    findUiRenderQuoteRoot,
    resolveChatQuoteRanges,
    type ChatQuoteAnchor,
} from '@/lib/chatQuoteAnchor';

import type { ChatQuoteHighlightStore } from '../hooks/chatQuoteHighlightStore';
import { ChatColumnSessionContext } from '../chatColumnSession';
import { ChatQuoteMarkPopover } from './ChatQuoteMarkPopover';
<<<<<<< HEAD
=======
import type { HtmlRenderMark } from './parts/htmlRender';
import { onPageMarkClick, revealPageMark, setPageMarks } from './pageQuoteBridge';
import { dispatchNavigationRelease } from '../lib/scroll/timelineScrollIntent';
>>>>>>> bc50ba56a

const MARK_HIGHLIGHT = 'oc-chat-quote';
const FOCUS_HIGHLIGHT = 'oc-chat-quote-focus';
const FLASH_DURATION_MS = 1600;
// Hover must rest on a mark before its popover opens, so reading across the
// text does not flicker popovers; leaving gets a grace period to reach it.
const POPOVER_OPEN_DELAY_MS = 400;
const POPOVER_CLOSE_DELAY_MS = 250;
const CORRIDOR_PADDING_PX = 6;
<<<<<<< HEAD
// Frames a scrolled-to row may take to mount, and a renderer to settle.
const ROW_MOUNT_FRAMES = 20;
// Anything that moves the view by hand, including a page frame scrolling itself.
const REVEAL_CANCEL_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'openchamber:frame-scroll'] as const;
=======
// Page frames may mount after scrolling.
const REVEAL_ATTEMPTS = 10;
>>>>>>> bc50ba56a

const supportsHighlights = (): boolean => 'Highlight' in window && 'highlights' in CSS;

/** Who painted a set of ranges; each owner replaces only its own. */
type PaintOwner = { readonly layer: 'marks' | 'focus' | 'flash' };

// One registry entry per highlight name, merged across owners: several chat
// columns can be on screen, and CSS.highlights holds one Highlight per name.
const paintedRanges = new Map<string, Map<PaintOwner, Range[]>>();

function paint(name: string, owner: PaintOwner, ranges: Range[]): void {
    if (!supportsHighlights()) return;
    const owners = paintedRanges.get(name) ?? new Map<PaintOwner, Range[]>();
    if (ranges.length > 0) {
        owners.set(owner, ranges);
    } else {
        owners.delete(owner);
    }
    paintedRanges.set(name, owners);

    const all = [...owners.values()].flat();
    if (all.length === 0) {
        CSS.highlights.delete(name);
        return;
    }
    const highlight = new Highlight(...all);
    highlight.priority = name === FOCUS_HIGHLIGHT ? 1 : 0;
    CSS.highlights.set(name, highlight);
}

interface ChatQuoteHighlightLayerProps {
    store: ChatQuoteHighlightStore;
    scrollNode: HTMLElement | null;
<<<<<<< HEAD
    /** Loads older history until the quoted message is in the timeline. */
    loadHistoryUntilMessage: (messageId: string) => Promise<boolean>;
    scrollToMessage: (messageId: string, options?: { behavior?: ScrollBehavior }) => Promise<boolean>;
    /** Asks the list for a page row that mounts without a message element. */
    scrollToUiPageRow?: (messageId: string) => boolean;
}

/** The box spanning every row a mark's quote crosses; empty when not painted. */
const unionOf = (ranges: readonly Range[]): DOMRect | null => {
    if (ranges.length === 0) return null;
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const range of ranges) {
        for (const rect of range.getClientRects()) {
            left = Math.min(left, rect.left);
            top = Math.min(top, rect.top);
            right = Math.max(right, rect.right);
            bottom = Math.max(bottom, rect.bottom);
        }
    }
    return left === Infinity ? null : new DOMRect(left, top, right - left, bottom - top);
};

function markAtPoint(ranges: Map<string, Range[]>, x: number, y: number): string | null {
    for (const [id, painted] of ranges) {
        for (const range of painted) {
=======
    loadHistoryUntilMessage: (messageId: string) => Promise<boolean>;
    scrollToMessage: (messageId: string, options?: { behavior?: ScrollBehavior }) => Promise<boolean>;
    resolveUiPageMessageId?: (messageId: string, partId: string) => string;
    scrollToUiPageRow?: (messageId: string) => boolean;
}

function markAtPoint(ranges: Map<string, Range[]>, x: number, y: number): string | null {
    for (const [id, parts] of ranges) {
        for (const range of parts) {
>>>>>>> bc50ba56a
            for (const rect of range.getClientRects()) {
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return id;
            }
        }
    }
    return null;
}

<<<<<<< HEAD
type PopoverState = { markId: string; rect: DOMRect };
=======
// The box around a quote; one that crosses a long answer's rows has a Range per row.
const boundsOf = (parts: Range[]): DOMRect => {
    const [first, ...rest] = parts.map((range) => range.getBoundingClientRect());
    let { left, top, right, bottom } = first;
    for (const rect of rest) {
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
    }
    return new DOMRect(left, top, right - left, bottom - top);
};

// A mark inside a page's frame has no Range here: its popover opens from the
// frame's click report, follows the frame through `measure`, and renders in
// `portal` (the open full-screen dialog) when the page is shown in one.
type PopoverState = {
    markId: string;
    rect: DOMRect;
    measure?: () => DOMRect;
    portal?: HTMLElement | null;
};
>>>>>>> bc50ba56a


// A long answer's rows: the lowest one drawn says whether the message goes
// on below it (`data-message-continues`); scrolling past it mounts the next.
const lowestRowOf = (scrollNode: HTMLElement, messageId: string): Element | null => {
    let lowest: Element | null = null;
    for (const message of scrollNode.querySelectorAll(`[data-message-id="${CSS.escape(messageId)}"]`)) {
        if (!lowest || message.getBoundingClientRect().bottom > lowest.getBoundingClientRect().bottom) lowest = message;
    }
    return lowest;
};

const messageContinuesBelow = (scrollNode: HTMLElement, messageId: string): boolean => (
    lowestRowOf(scrollNode, messageId)?.hasAttribute('data-message-continues') === true
);

const scrollToNextSlice = (scrollNode: HTMLElement, messageId: string): void => {
    const lowest = lowestRowOf(scrollNode, messageId);
    if (lowest) scrollNode.scrollTop += lowest.getBoundingClientRect().bottom - scrollNode.getBoundingClientRect().top;
};

export const ChatQuoteHighlightLayer = React.memo(function ChatQuoteHighlightLayer({
    store,
    scrollNode,
    loadHistoryUntilMessage,
    scrollToMessage,
<<<<<<< HEAD
=======
    resolveUiPageMessageId,
>>>>>>> bc50ba56a
    scrollToUiPageRow,
}: ChatQuoteHighlightLayerProps) {
    const session = React.useContext(ChatColumnSessionContext);
    const marks = React.useSyncExternalStore(store.subscribe, store.getMarks);
    const chipFocusedMarkId = React.useSyncExternalStore(store.subscribe, store.getChipFocus);
    const [popover, setPopover] = React.useState<PopoverState | null>(null);
    const [editing, setEditing] = React.useState(false);
    const focusedMarkId = chipFocusedMarkId ?? popover?.markId ?? null;
    // Resolved ranges of the marks currently mounted, for hit-testing.
    const rangesRef = React.useRef(new Map<string, Range[]>());
    const [owners] = React.useState(() => ({
        marks: { layer: 'marks' } satisfies PaintOwner,
        focus: { layer: 'focus' } satisfies PaintOwner,
        flash: { layer: 'flash' } satisfies PaintOwner,
    }));
    const scrollNodeRef = React.useRef(scrollNode);
    scrollNodeRef.current = scrollNode;
    const scrollToMessageRef = React.useRef(scrollToMessage);
    scrollToMessageRef.current = scrollToMessage;
<<<<<<< HEAD
    const loadHistoryUntilMessageRef = React.useRef(loadHistoryUntilMessage);
    loadHistoryUntilMessageRef.current = loadHistoryUntilMessage;
    const scrollToUiPageRowRef = React.useRef(scrollToUiPageRow);
    scrollToUiPageRowRef.current = scrollToUiPageRow;
    const revealGenerationRef = React.useRef(0);
    const cancelRevealRef = React.useRef<(() => void) | null>(null);
=======
    const resolveUiPageMessageIdRef = React.useRef(resolveUiPageMessageId);
    resolveUiPageMessageIdRef.current = resolveUiPageMessageId;
    const scrollToUiPageRowRef = React.useRef(scrollToUiPageRow);
    scrollToUiPageRowRef.current = scrollToUiPageRow;
    const loadHistoryUntilMessageRef = React.useRef(loadHistoryUntilMessage);
    loadHistoryUntilMessageRef.current = loadHistoryUntilMessage;
    const revealGenerationRef = React.useRef(0);
>>>>>>> bc50ba56a
    const flashTimerRef = React.useRef<number | null>(null);
    const cancelRevealRef = React.useRef<(() => void) | null>(null);

    React.useEffect(() => () => {
        revealGenerationRef.current += 1;
        cancelRevealRef.current?.();
    }, [scrollNode, store, session?.sessionId, session?.directory]);

    React.useEffect(() => {
        if (!scrollNode || marks.length === 0) return;
        const markedMessageIds = new Set(marks.map((mark) => mark.messageId));
        const ranges = rangesRef.current;

        let frame: number | null = null;
        const repaint = () => {
            frame = null;
            const marked: Range[] = [];
            const focused: Range[] = [];
            ranges.clear();
            for (const mark of marks) {
<<<<<<< HEAD
                // A quote inside a shown page resolves against that page's row;
                // otherwise a long answer is several rows, and the mark spans
                // whichever are mounted.
                const pageRoot = mark.anchor.page && mark.anchor.page.kind === 'ui'
                    ? findUiRenderQuoteRoot(scrollNode, mark.messageId, mark.anchor.page.partId)
                    : null;
                const parts = resolveChatQuoteRanges(
                    mark.anchor.page ? pageRoot ? [pageRoot] : [] : findChatQuoteRoots(scrollNode, mark.messageId),
                    mark.anchor,
                );
=======
                if (mark.anchor.page && mark.anchor.page.kind !== 'ui') continue;
                const root = mark.anchor.page ? findUiRenderQuoteRoot(scrollNode, mark.messageId, mark.anchor.page.partId) : null;
                const parts = resolveChatQuoteRanges(mark.anchor.page ? root ? [root] : [] : findChatQuoteRoots(scrollNode, mark.messageId), mark.anchor);
>>>>>>> bc50ba56a
                if (!parts) continue;
                ranges.set(mark.id, parts);
                marked.push(...parts);
                if (mark.id === focusedMarkId) focused.push(...parts);
            }
            paint(MARK_HIGHLIGHT, owners.marks, marked);
            paint(FOCUS_HIGHLIGHT, owners.focus, focused);
        };

        // Streaming rewrites the live message many times a second; only
        // mutations inside a marked message, or above every message (rows
        // mounting and unmounting), can move a mark.
        const observer = new MutationObserver((records) => {
            if (frame !== null) return;
            const relevant = records.some((record) => {
                const element = record.target instanceof Element ? record.target : record.target.parentElement;
                const messageId = element?.closest('[data-message-id]')?.getAttribute('data-message-id');
                const pageMessageId = element?.closest('[data-ui-render-message]')?.getAttribute('data-ui-render-message');
<<<<<<< HEAD
                return messageId === undefined || messageId === null
                    || markedMessageIds.has(messageId)
                    || (pageMessageId !== null && pageMessageId !== undefined && markedMessageIds.has(pageMessageId));
=======
                return messageId === undefined || messageId === null || markedMessageIds.has(messageId) || (pageMessageId != null && markedMessageIds.has(pageMessageId));
>>>>>>> bc50ba56a
            });

            if (relevant) frame = window.requestAnimationFrame(repaint);
        });
        observer.observe(scrollNode, { childList: true, subtree: true, characterData: true });
        repaint();

        return () => {
            observer.disconnect();
            if (frame !== null) window.cancelAnimationFrame(frame);
            ranges.clear();
            paint(MARK_HIGHLIGHT, owners.marks, []);
            paint(FOCUS_HIGHLIGHT, owners.focus, []);
        };
    }, [focusedMarkId, marks, owners, scrollNode]);

<<<<<<< HEAD
=======
    // The marks inside pages go to those pages' frames, which paint them.
    React.useEffect(() => {
        const byPart = new Map<string, HtmlRenderMark[]>();
        for (const mark of marks) {
            const partId = mark.anchor.page?.partId;
            if (!partId || mark.anchor.page?.kind === 'ui') continue;
            const forPart = byPart.get(partId) ?? [];
            forPart.push({ id: mark.id, anchor: mark.anchor, focused: mark.id === focusedMarkId });
            byPart.set(partId, forPart);
        }
        setPageMarks(pageOwner, byPart);
    }, [focusedMarkId, marks, pageOwner]);

    React.useEffect(() => () => setPageMarks(pageOwner, new Map()), [pageOwner]);

>>>>>>> bc50ba56a
    // A flash paints both layers, so it reads as strong as a hovered mark.
    const paintFlash = React.useCallback((ranges: Range[]) => {
        paint(MARK_HIGHLIGHT, owners.flash, ranges);
        paint(FOCUS_HIGHLIGHT, owners.flash, ranges);
    }, [owners]);

    // Leaving a session ends every reveal in flight: its flash belonged to
    // rows of an answer the reader is no longer looking at.
    React.useEffect(() => () => {
        if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
        paintFlash([]);
    }, [paintFlash, session?.sessionId, session?.directory, scrollNode, store]);

    React.useEffect(() => () => {
        revealGenerationRef.current += 1;
        cancelRevealRef.current?.();
    }, [scrollNode, store, session?.sessionId, session?.directory]);

    const reveal = React.useCallback((messageId: string, anchor: ChatQuoteAnchor) => {
        cancelRevealRef.current?.();
<<<<<<< HEAD
=======
        const scrollToMessage = scrollToMessageRef.current;
>>>>>>> bc50ba56a
        const scrollNode = scrollNodeRef.current;
        const generation = ++revealGenerationRef.current;
        let cancelled = false;
        let observer: MutationObserver | null = null;
        let frame: number | null = null;
<<<<<<< HEAD
        const isCurrent = () => !cancelled
            && generation === revealGenerationRef.current
            && scrollNode === scrollNodeRef.current;
        const cancelOnKey = (event: KeyboardEvent) => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancel();
        };
        function cancel() {
=======
        const isCurrent = () => !cancelled && generation === revealGenerationRef.current && scrollNode === scrollNodeRef.current;
        const cancel = () => {
>>>>>>> bc50ba56a
            cancelled = true;
            observer?.disconnect();
            if (frame !== null) window.cancelAnimationFrame(frame);
            frame = null;
<<<<<<< HEAD
            // A flash already painted belongs to this reveal too; leaving it
            // up would mark text the reader no longer asked about.
            if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
            flashTimerRef.current = null;
            paintFlash([]);
            for (const event of REVEAL_CANCEL_EVENTS) scrollNode?.removeEventListener(event, cancel);
            scrollNode?.removeEventListener('keydown', cancelOnKey);
            if (cancelRevealRef.current === cancel) cancelRevealRef.current = null;
        }
        cancelRevealRef.current = cancel;
        // A wheel, swipe or press means the reader took over: the reveal stops
        // moving the view rather than fighting them.
        for (const event of REVEAL_CANCEL_EVENTS) {
            scrollNode?.addEventListener(event, cancel, { passive: true });
        }
        scrollNode?.addEventListener('keydown', cancelOnKey);

        void (async () => {
            // A quote can point into history this client has not loaded, so the
            // message has to be there before scrolling to it means anything.
            const loaded = await loadHistoryUntilMessageRef.current(messageId).catch(() => false);
            if (!loaded || !isCurrent() || !scrollNode) return;

            // Scrolling through the timeline controller releases live follow
            // and mounts the row when the virtualized list dropped it.
            const uiRoot = anchor.page && anchor.page.kind === 'ui'
                ? findUiRenderQuoteRoot(scrollNode, messageId, anchor.page.partId)
                : null;
            const mounted = uiRoot !== null || findChatQuoteRoots(scrollNode, messageId).length > 0;
            // An expanded page row mounts without a message element; the list
            // has to be asked for it directly.
            let pageRowRequested = anchor.page?.kind === 'ui' && uiRoot === null
                && scrollToUiPageRowRef.current?.(messageId) === true;
            const scrolled = uiRoot !== null || pageRowRequested
                || await scrollToMessageRef.current(messageId, { behavior: 'auto' }).catch(() => false);
            if (!isCurrent()) return;
            if (!scrolled && !mounted) return;

            let misses = 0;
            const tryReveal = () => {
                frame = null;
                if (!isCurrent() || !scrollNode) { cancel(); return; }

                const pageRoot = anchor.page?.kind === 'ui'
                    ? findUiRenderQuoteRoot(scrollNode, messageId, anchor.page.partId)
                    : null;
                const roots = anchor.page ? pageRoot ? [pageRoot] : [] : findChatQuoteRoots(scrollNode, messageId);



                if (anchor.page?.kind === 'ui' && roots.length === 0 && !pageRowRequested
                    && scrollToUiPageRowRef.current?.(messageId)) {
                    pageRowRequested = true;
                    return;
                }
                // A row mounts on the frame after the scroll request, and a lazy
                // renderer draws raw source first; an absent row or one still
                // settling says nothing yet.
                const pendingRenderer = roots.some((root) => root.querySelector('[data-chat-quote-pending]'));
                if (roots.length === 0 || pendingRenderer) {
                    // A missing row is a mount timing question, so frames answer
                    // it; a pending renderer settles on its own mutation.
                    if (!pendingRenderer && misses < ROW_MOUNT_FRAMES) {
                        misses += 1;
                        frame = window.requestAnimationFrame(tryReveal);
                    }
                    return;
                }
                const parts = resolveChatQuoteRanges(roots, anchor);
                // An ambiguous or changed quote is final: the mounted text is
                // what it is, so retrying cannot change the answer.
                cancel();
                if (!parts) return;
                parts[0]?.startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' });
=======
            for (const event of ['wheel', 'touchstart', 'pointerdown', 'openchamber:frame-scroll']) {
                scrollNode?.removeEventListener(event, cancel);
            }
            scrollNode?.removeEventListener('keydown', cancelOnKey);
            if (cancelRevealRef.current === cancel) cancelRevealRef.current = null;
        };
        const cancelOnKey = (event: KeyboardEvent) => {
            if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancel();
        };
        cancelRevealRef.current = cancel;
        for (const event of ['wheel', 'touchstart', 'pointerdown', 'openchamber:frame-scroll']) {
            scrollNode?.addEventListener(event, cancel, { passive: true });
        }
        scrollNode?.addEventListener('keydown', cancelOnKey);
        void (async () => {
            const loaded = await loadHistoryUntilMessageRef.current(messageId).catch(() => false);
            if (!loaded || !isCurrent()) return;

            if (anchor.page && anchor.page.kind !== 'ui') {
                // Scroll to the frame before revealing the quote inside it.
                // The row may still be mounting after the scroll request.
                const { partId } = anchor.page;
                await scrollToMessage(messageId, { behavior: 'auto' }).catch(() => false);
                for (let attempt = 0; attempt < REVEAL_ATTEMPTS; attempt += 1) {
                    await nextFrame();
                    if (!isCurrent()) return;
                    if (revealPageMark(partId, anchor)) return;
                }
                return;
            }
            const targetMessageId = anchor.page?.kind === 'ui'
                ? resolveUiPageMessageIdRef.current?.(messageId, anchor.page.partId) ?? messageId
                : messageId;
            // Scrolling through the timeline controller releases live follow
            // and mounts the row when the virtualized list dropped it.
            const uiRoot = anchor.page && scrollNode ? findUiRenderQuoteRoot(scrollNode, messageId, anchor.page.partId) : null;
            const mounted = uiRoot !== null || (scrollNodeRef.current ? findChatQuoteRoots(scrollNodeRef.current, messageId).length > 0 : false);
            let pageRowRequested = anchor.page?.kind === 'ui' && uiRoot === null && scrollToUiPageRowRef.current?.(messageId) === true;
            const scrolled = uiRoot !== null || pageRowRequested
                || await scrollToMessage(targetMessageId, { behavior: 'auto' }).catch(() => false);
            if (!isCurrent() || !scrollNode) return;
            if (!scrolled && !mounted) return;
            let steps = 0;
            const tryReveal = () => {
                frame = null;
                if (!isCurrent()) { cancel(); return; }
                const pageRoot = anchor.page ? findUiRenderQuoteRoot(scrollNode, messageId, anchor.page.partId) : null;
                const roots = anchor.page ? pageRoot ? [pageRoot] : [] : findChatQuoteRoots(scrollNode, messageId);
                if (anchor.page?.kind === 'ui' && roots.length === 0 && !pageRowRequested && scrollToUiPageRowRef.current?.(messageId)) {
                    pageRowRequested = true;
                    return;
                }
                // A lazy fallback can contain raw Markdown on mobile. Wait for
                // the renderer before treating a failed match as final.
                if (roots.length === 0 || roots.some((root) => root.querySelector('[data-chat-quote-pending]'))) return;
                const parts = resolveChatQuoteRanges(roots, anchor);
                // A long answer's later rows mount as they near the view: step
                // down past the lowest one drawn while the message continues.
                if (!parts && steps < REVEAL_ATTEMPTS && messageContinuesBelow(scrollNode, targetMessageId)) {
                    // Navigation holds the message's first row in place
                    // (`settleNavigationTarget`); it lets go first, or the
                    // two would fight.
                    dispatchNavigationRelease(scrollNode);
                    scrollToNextSlice(scrollNode, targetMessageId);
                    steps += 1;
                    return;
                }
                cancel();
                if (!parts) return;
                parts[0].startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' });
>>>>>>> bc50ba56a
                if (flashTimerRef.current !== null) window.clearTimeout(flashTimerRef.current);
                paintFlash(parts);
                flashTimerRef.current = window.setTimeout(() => {
                    flashTimerRef.current = null;
                    paintFlash([]);
                }, FLASH_DURATION_MS);
            };
<<<<<<< HEAD
            const messageSelector = `[data-message-id="${CSS.escape(messageId)}"]`;
=======
            const selector = `[data-message-id="${CSS.escape(targetMessageId)}"]`;
>>>>>>> bc50ba56a
            const pageSelector = anchor.page?.kind === 'ui'
                ? `[data-ui-render-message="${CSS.escape(messageId)}"][data-ui-render-part="${CSS.escape(anchor.page.partId)}"]`
                : null;
            observer = new MutationObserver((records) => {
                if (frame !== null) return;
                const relevant = records.some((record) => {
                    const element = record.target instanceof Element ? record.target : record.target.parentElement;
<<<<<<< HEAD
                    if (!element) return false;
                    // Only a mutation inside the quoted message (or the page that
                    // quoted it), or one that adds it, can make the quote resolvable.
                    const owner = element.closest('[data-message-id]')?.getAttribute('data-message-id');
                    if (owner === messageId) return true;
                    if (pageSelector) {
                        const page = element.closest('[data-ui-render-message]');
                        if (page?.getAttribute('data-ui-render-message') === messageId
                            && page.getAttribute('data-ui-render-part') === anchor.page?.partId) return true;
                    }
                    return [...record.addedNodes].some((node) => node instanceof Element
                        && (node.matches(messageSelector) || node.querySelector(messageSelector) !== null
                            || (pageSelector !== null
                                && (node.matches(pageSelector) || node.querySelector(pageSelector) !== null))));
                });

                if (relevant) frame = window.requestAnimationFrame(tryReveal);


            });
            observer.observe(scrollNode, { childList: true, subtree: true, characterData: true });
            // Anything queued before this reveal is not a change it waits for.
            observer.takeRecords();
=======
                    if (pageSelector && element?.closest(pageSelector)) return true;
                    const message = element?.closest('[data-message-id]');
                    if (message?.getAttribute('data-message-id') === targetMessageId) return true;
                    return [...record.addedNodes].some((node) => node instanceof Element
                        && (node.matches(selector) || node.querySelector(selector)
                            || (pageSelector && (node.matches(pageSelector) || node.querySelector(pageSelector)))));
                });
                if (relevant) frame = window.requestAnimationFrame(tryReveal);
            });
            observer.observe(scrollNode, { childList: true, subtree: true, characterData: true });
>>>>>>> bc50ba56a
            tryReveal();
        })().finally(() => { if (!observer) cancel(); });
    }, [paintFlash]);

    React.useEffect(() => {
        store.setRevealHandler(reveal);
        return () => {
            revealGenerationRef.current += 1;
<<<<<<< HEAD
            cancelRevealRef.current?.();
=======
>>>>>>> bc50ba56a
            store.setRevealHandler(null);
        };
    }, [reveal, store]);

    const openMark = popover ? marks.find((mark) => mark.id === popover.markId) ?? null : null;
    const editingRef = React.useRef(editing);
    editingRef.current = editing;
    const popoverRef = React.useRef(popover);
    popoverRef.current = popover;
    const openTimerRef = React.useRef<number | null>(null);
    const closeTimerRef = React.useRef<number | null>(null);
    const popoverElementRef = React.useRef<HTMLDivElement>(null);

    // The box spanning the open mark and its popover. A pointer crossing it is
    // on its way to the popover's buttons, however slowly or diagonally, so it
    // must not start the close.
    const isInPopoverCorridor = React.useCallback((x: number, y: number): boolean => {
        const open = popoverRef.current;
<<<<<<< HEAD
        const painted = open ? rangesRef.current.get(open.markId) : null;
        const box = popoverElementRef.current?.getBoundingClientRect();
        const mark = painted ? unionOf(painted) : null;
        if (!mark || !box) return false;
=======
        const parts = open ? rangesRef.current.get(open.markId) : null;
        const box = popoverElementRef.current?.getBoundingClientRect();
        if (!parts || !box) return false;
        const mark = boundsOf(parts);
>>>>>>> bc50ba56a
        return x >= Math.min(mark.left, box.left) - CORRIDOR_PADDING_PX
            && x <= Math.max(mark.right, box.right) + CORRIDOR_PADDING_PX
            && y >= Math.min(mark.top, box.top) - CORRIDOR_PADDING_PX
            && y <= Math.max(mark.bottom, box.bottom) + CORRIDOR_PADDING_PX;
    }, []);

    const clearTimers = React.useCallback(() => {
        if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
        if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
        openTimerRef.current = null;
        closeTimerRef.current = null;
    }, []);

    const closePopover = React.useCallback(() => {
        clearTimers();
        setPopover(null);
        setEditing(false);
    }, [clearTimers]);

    const showPopover = React.useCallback((markId: string) => {
<<<<<<< HEAD
        const painted = rangesRef.current.get(markId);
        const rect = painted ? unionOf(painted) : null;
        if (!rect) return;
        setPopover({ markId, rect });
=======
        const parts = rangesRef.current.get(markId);
        if (!parts) return;
        setPopover({ markId, rect: boundsOf(parts) });
>>>>>>> bc50ba56a
    }, []);

    const scheduleClose = React.useCallback(() => {
        if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
        openTimerRef.current = null;
        if (editingRef.current || !popoverRef.current || closeTimerRef.current !== null) return;
        closeTimerRef.current = window.setTimeout(() => {
            closeTimerRef.current = null;
            if (!editingRef.current) setPopover(null);
        }, POPOVER_CLOSE_DELAY_MS);
    }, []);

    const cancelClose = React.useCallback(() => {
        if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
    }, []);

    // A mark that was sent, removed or dropped from the list closes its popover.
    React.useEffect(() => {
        if (popover && !openMark) closePopover();
    }, [closePopover, openMark, popover]);

    React.useEffect(() => clearTimers, [clearTimers]);

    React.useEffect(() => {
        if (!scrollNode || marks.length === 0) return;
        let lastPointerType = 'mouse';

        const handlePointerDown = (event: PointerEvent) => {
            lastPointerType = event.pointerType;
        };

        // Desktop: a resting mouse opens the mark under it. Keeping it open
        // is decided by position alone while it is open (below).
        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse' || event.buttons !== 0 || editingRef.current) return;
            const hit = markAtPoint(rangesRef.current, event.clientX, event.clientY);
            if (!hit || popoverRef.current?.markId === hit) {
                if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
                openTimerRef.current = null;
                return;
            }
            if (openTimerRef.current !== null) window.clearTimeout(openTimerRef.current);
            openTimerRef.current = window.setTimeout(() => {
                openTimerRef.current = null;
                showPopover(hit);
            }, POPOVER_OPEN_DELAY_MS);
        };

        // Touch: a single tap on a mark toggles its popover. A tap that ends a
        // text selection is left to the selection menu.
        const handleClick = (event: MouseEvent) => {
            if (lastPointerType === 'mouse') return;
            if (window.getSelection()?.isCollapsed === false) return;
            const hit = markAtPoint(rangesRef.current, event.clientX, event.clientY);
            if (!hit) return;
            if (popoverRef.current?.markId === hit) {
                closePopover();
            } else {
                setEditing(false);
                showPopover(hit);
            }
        };

        scrollNode.addEventListener('pointerdown', handlePointerDown);
        scrollNode.addEventListener('pointermove', handlePointerMove);
        scrollNode.addEventListener('click', handleClick);
        return () => {
            scrollNode.removeEventListener('pointerdown', handlePointerDown);
            scrollNode.removeEventListener('pointermove', handlePointerMove);
            scrollNode.removeEventListener('click', handleClick);
        };
    }, [closePopover, marks.length, scrollNode, showPopover]);

    // While open: stay open while the mouse is on the mark, the popover or the
    // corridor between them (enter/leave events do not cross the portal
    // reliably, so position decides), follow the mark as the chat scrolls,
    // and close on a press anywhere but the popover or the mark itself.
    const openMarkId = popover?.markId ?? null;
    React.useEffect(() => {
        if (!openMarkId) return;
        let frame: number | null = null;
        const follow = () => {
            if (frame !== null) return;
            frame = window.requestAnimationFrame(() => {
                frame = null;
<<<<<<< HEAD
                const painted = rangesRef.current.get(openMarkId);
                const rect = painted ? unionOf(painted) : null;
=======
                const parts = rangesRef.current.get(openMarkId);
                const rect = parts ? boundsOf(parts) : popoverRef.current?.measure?.();
>>>>>>> bc50ba56a
                if (!rect) {
                    closePopover();
                    return;
                }
                setPopover((current) => (current && current.markId === openMarkId ? { ...current, rect } : current));
            });
        };
        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerType !== 'mouse' || editingRef.current) return;
            if (isInPopoverCorridor(event.clientX, event.clientY)
                || markAtPoint(rangesRef.current, event.clientX, event.clientY) === openMarkId) {
                cancelClose();
            } else {
                scheduleClose();
            }
        };
        const handlePressOutside = (event: PointerEvent) => {
            // SAFETY: a pointer event target inside the document is always a
            // Node; `contains` only needs that.
            if (popoverElementRef.current?.contains(event.target as Node)) return;
            if (markAtPoint(rangesRef.current, event.clientX, event.clientY) === openMarkId) return;
            closePopover();
        };
        document.addEventListener('scroll', follow, { capture: true, passive: true });
        window.addEventListener('resize', follow);
        document.addEventListener('pointerdown', handlePressOutside);
        document.addEventListener('pointermove', handlePointerMove, { capture: true, passive: true });
        return () => {
            if (frame !== null) window.cancelAnimationFrame(frame);
            document.removeEventListener('scroll', follow, { capture: true });
            window.removeEventListener('resize', follow);
            document.removeEventListener('pointerdown', handlePressOutside);
            document.removeEventListener('pointermove', handlePointerMove, { capture: true });
        };
    }, [cancelClose, closePopover, isInPopoverCorridor, openMarkId, scheduleClose]);

    return popover && openMark ? (
        <ChatQuoteMarkPopover
            ref={popoverElementRef}
            anchorRect={popover.rect}
            comment={openMark.comment}
            editing={editing}
            onEditingChange={setEditing}
            onSave={openMark.updateComment}
            onRemove={() => {
                openMark.remove();
                closePopover();
            }}
        />
    ) : null;
});
