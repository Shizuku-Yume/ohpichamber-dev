<<<<<<< HEAD
/**
 * Where an autocomplete popup goes in focus mode.
 *
 * In the normal composer each picker anchors to the composer's own edge, which
 * is close enough to the text. In focus mode the composer fills the surface,
 * so an edge-anchored picker would sit far from what the user is typing —
 * there it follows the caret instead.
 *
 * The editor reports the caret's viewport position directly, so this only has
 * to decide whether the popup fits below the caret or has to flip above it,
 * and keep it inside the composer horizontally.
 */
||||||| bc50ba56aa
/**
 * Where the composer's autocomplete popup goes: at the caret, as every text
 * field's suggestions are (`components/inline-picker`). It rises right above
 * the line being typed, starting at the trigger, inside the composer's width,
 * and may reach up over the transcript; below the line only when there is
 * clearly more room there, as near the top of the screen.
 *
 * On the phone the list takes the composer's whole width, as the screen is
 * narrow and rows are tapped, still right above the line being typed: it covers
 * the composer's earlier lines rather than leaving them between the list and
 * the text.
 */
=======
>>>>>>> upstream/main

import React from 'react';

import type { ComposerEditorHandle } from '../editor/ComposerEditor';
import type { AutocompleteKind } from '../language/triggers';
import type { AutocompleteOverlayPosition } from '../ui/ComposerAutocompletePopups';
import type { ComposerText } from './composerText';

<<<<<<< HEAD
||||||| bc50ba56aa
/** The `@` list's width, which also shows file paths; `/` shares it so command descriptions fit. */
const MENTION_LIST_WIDTH = 560;

/**
 * Widths each picker asks for when placed at the caret; a narrower composer
 * narrows them. One width for every list, so they read as one family; the
 * mention and command lists are wider, and the emoji list, whose rows are a
 * glyph and a short name, narrower.
 */
const CARET_PLACED_WIDTH = {
    mention: MENTION_LIST_WIDTH,
    command: MENTION_LIST_WIDTH,
    snippet: 420,
    skill: 420,
    emoji: 280,
} as const satisfies Record<AutocompleteKind, number>;

=======
const MENTION_LIST_WIDTH = 560;

const CARET_PLACED_WIDTH = {
    mention: MENTION_LIST_WIDTH,
    command: MENTION_LIST_WIDTH,
    snippet: 420,
    skill: 420,
    emoji: 280,
} as const satisfies Record<AutocompleteKind, number>;

>>>>>>> upstream/main
export interface AutocompletePositionOptions {
<<<<<<< HEAD
    /** Only focus mode places popups at the caret. */
    enabled: boolean;
||||||| bc50ba56aa
    /** The phone: the list takes the composer's whole width. */
    fullWidth: boolean;
=======
    fullWidth: boolean;
>>>>>>> upstream/main
    openAutocomplete: AutocompleteKind | null;
<<<<<<< HEAD
    /** Recompute whenever the text changes, since the caret moves with it. */
    message: string;
||||||| bc50ba56aa
    /** The text after the trigger, which places the trigger before the caret. */
    query: string;
    /** Recompute whenever the text changes, since the caret moves with it. */
    message: string;
=======
    query: string;
    text: ComposerText;
>>>>>>> upstream/main
    editorRef: React.RefObject<ComposerEditorHandle | null>;
    containerRef: React.RefObject<HTMLElement | null>;
}

export function useAutocompletePosition(options: AutocompletePositionOptions) {
<<<<<<< HEAD
    const { enabled, openAutocomplete, message, editorRef, containerRef } = options;
||||||| bc50ba56aa
    const { fullWidth, openAutocomplete, query, message, editorRef, containerRef } = options;
=======
    const { fullWidth, openAutocomplete, query, text, editorRef, containerRef } = options;
>>>>>>> upstream/main
    const [position, setPosition] = React.useState<AutocompleteOverlayPosition | null>(null);

const update = React.useCallback(() => {
    if (!enabled) {
        setPosition(null);
        return;
    }

<<<<<<< HEAD
    if (openAutocomplete === null) {
        setPosition(null);
        return;
    }
||||||| bc50ba56aa
        // Anchored at the trigger, the popup stays put while its query grows.
        const caret = editor.getSelection().start;
        const caretCoords = editor.caretCoords(Math.max(0, caret - query.length - 1)) ?? editor.caretCoords();
        if (!caretCoords) return;
        // Below, the list clears the line the caret is on now: a long query may have wrapped.
        const caretBottom = editor.caretCoords()?.bottom ?? caretCoords.bottom;
=======
        const caret = editor.getSelection().start;
        const caretCoords = editor.caretCoords(Math.max(0, caret - query.length - 1)) ?? editor.caretCoords();
        if (!caretCoords) return;
        const caretBottom = editor.caretCoords()?.bottom ?? caretCoords.bottom;
>>>>>>> upstream/main

<<<<<<< HEAD
    const editor = editorRef.current;
    const container = containerRef.current;
    if (!editor || !container) return;
||||||| bc50ba56aa
        const box = container.getBoundingClientRect();
        // Up to the top of the chat area, never under the app header; down to
        // the top of the phone's keyboard, which covers the page without
        // shrinking the window, so the window's height would count room
        // under it and drop a list there out of sight.
        const visible = viewportLimits();
        const limits = { top: Math.max(container.closest('main')?.getBoundingClientRect().top ?? 0, visible.top), bottom: visible.bottom };
        const placement = placeCaretPopup({
            caret: caretCoords,
            caretBottom,
            bounds: box,
            limits,
            width: fullWidth ? box.width : CARET_PLACED_WIDTH[openAutocomplete],
            rightToLeft: isRightToLeft(container),
        });
        const next = {
            top: placement.top - box.top,
            place: placement.place,
            left: placement.left - box.left,
            width: placement.width,
            maxHeight: placement.maxHeight,
        };
        // Scrolls anywhere land here (a streaming reply scrolls all the time);
        // one that moved nothing must not re-render the composer.
        setPosition((current) => (current && samePlacement(current, next) ? current : next));
    }, [containerRef, editorRef, fullWidth, openAutocomplete, query]);
=======
        const box = container.getBoundingClientRect();
        const visible = viewportLimits();
        const limits = { top: Math.max(container.closest('main')?.getBoundingClientRect().top ?? 0, visible.top), bottom: visible.bottom };
        const placement = placeCaretPopup({
            caret: caretCoords,
            caretBottom,
            bounds: box,
            limits,
            width: fullWidth ? box.width : CARET_PLACED_WIDTH[openAutocomplete],
            rightToLeft: isRightToLeft(container),
        });
        const next = {
            top: placement.top - box.top,
            place: placement.place,
            left: placement.left - box.left,
            width: placement.width,
            maxHeight: placement.maxHeight,
        };
        setPosition((current) => (current && samePlacement(current, next) ? current : next));
    }, [containerRef, editorRef, fullWidth, openAutocomplete, query]);
>>>>>>> upstream/main

<<<<<<< HEAD
    // The editor reports the caret's viewport position directly, so the
    // popup no longer has to be placed from a hand-measured text mirror.
    const caret = editor.caretCoords();
    if (!caret) return;
||||||| bc50ba56aa
    React.useLayoutEffect(() => {
        update();
    }, [update, message]);
=======
    React.useLayoutEffect(() => {
        update();
        if (openAutocomplete === null) return;
        return text.subscribe(update);
    }, [openAutocomplete, text, update]);
>>>>>>> upstream/main

<<<<<<< HEAD
    const containerRect = container.getBoundingClientRect();
    const caretY = caret.top - containerRect.top;
    const caretX = caret.left - containerRect.left;

    const popupMargin = 8;
    const estimatedPopupHeight = 260;
    const spaceAbove = caretY - popupMargin;
    const spaceBelow = containerRect.height - caretY - popupMargin;
    const place: 'above' | 'below' = spaceBelow >= estimatedPopupHeight || spaceBelow >= spaceAbove ? 'below' : 'above';

    const desiredWidth = openAutocomplete === 'mention' ? 520 : openAutocomplete === 'skill' ? 360 : 450;
    const clampedLeft = Math.max(
        popupMargin,
        Math.min(caretX - 24, containerRect.width - desiredWidth - popupMargin)
    );

    const maxHeight = Math.max(120, Math.min(estimatedPopupHeight, place === 'below' ? spaceBelow : spaceAbove));

    setPosition({
        top: place === 'below' ? caretY + 22 : caretY - 6,
        left: clampedLeft,
        place,
        maxHeight,
    });
}, [containerRef, editorRef, enabled, openAutocomplete]);

React.useLayoutEffect(() => {
    update();
}, [
    update,
    message,
    openAutocomplete,
    enabled,
]);

React.useEffect(() => {
    if (!enabled) return;
    const onResize = () => update();
    window.addEventListener('resize', onResize);
    return () => {
        window.removeEventListener('resize', onResize);
    };
}, [enabled, update]);
||||||| bc50ba56aa
    React.useEffect(() => {
        if (openAutocomplete === null) return;
        // The phone's keyboard moves the visual viewport, not the window.
        window.visualViewport?.addEventListener('resize', update);
        window.visualViewport?.addEventListener('scroll', update);
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.visualViewport?.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [openAutocomplete, update]);
=======
    React.useEffect(() => {
        if (openAutocomplete === null) return;
        window.visualViewport?.addEventListener('resize', update);
        window.visualViewport?.addEventListener('scroll', update);
        window.addEventListener('resize', update);
        window.addEventListener('scroll', update, true);
        return () => {
            window.visualViewport?.removeEventListener('resize', update);
            window.visualViewport?.removeEventListener('scroll', update);
            window.removeEventListener('resize', update);
            window.removeEventListener('scroll', update, true);
        };
    }, [openAutocomplete, update]);
>>>>>>> upstream/main

    return { position, update };
}
