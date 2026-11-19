
import { KEYBOARD_EASING_CSS, KEYBOARD_HIDE_MS, KEYBOARD_SHOW_MS, keyboardKeyframes } from '@/lib/mobileKeyboardTiming';
import { isCapacitorApp } from '@/lib/platform';
import { composerTailInsetFor } from './composerTailInset';
import type { ComposerMorphEventDetail } from '../../lib/scroll/keyboardFollowGlide';

export type ComposerMorphDirection = 'expand' | 'collapse';

const BOX_SELECTOR = '[data-composer-box]';
const PROMPT_SELECTOR = '[data-composer-morph-prompt]';
const FLOATING_SLOT_SELECTOR = '[data-composer-slot="floating"]';
const RIDERS_SELECTOR = '[data-composer-riders]';
const ARRIVING_CONTROLS_SELECTOR = '[data-chat-input-footer] .composer-mobile-actions > :not(:first-child)';

const MORPH_STATE_ATTR = 'data-composer-morph';

const KEYBOARD_EVENT_FALLBACK_MS = 120;

const FINISH_SLACK_MS = 40;

const ARRIVAL_DRIFT_PX = 4;

const morphTiming = (direction: ComposerMorphDirection) => ({
 durationMs: direction === 'expand' ? KEYBOARD_SHOW_MS : KEYBOARD_HIDE_MS,
 easing: KEYBOARD_EASING_CSS,
});

const composerMorphSupported = (): boolean => {
<<<<<<< HEAD
 // isCapacitorApp() is false outside a window, so the DOM is present past it.
 if (!isCapacitorApp()) return false;
 if (document.documentElement.classList.contains('oc-platform-android')) return false;
 if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
 return true;
||||||| bc50ba56aa
    // isCapacitorApp() is false outside a window, so the DOM is present past it.
    if (!isCapacitorApp()) return false;
    if (document.documentElement.classList.contains('oc-platform-android')) return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
    return true;
=======
    if (!isCapacitorApp()) return false;
    if (document.documentElement.classList.contains('oc-platform-android')) return false;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
    return true;
>>>>>>> upstream/main
};

const dispatchMorph = (detail: ComposerMorphEventDetail) => {
 window.dispatchEvent(new CustomEvent('oc:composer-morph', { detail }));
};

export interface ComposerMorphController {
<<<<<<< HEAD
 /**
  * Run `swap` (which must commit the pill ↔ composer change synchronously,
  * i.e. via flushSync) as a morph of the box found under `host`. Falls
  * back to a plain swap when the morph is unsupported or there is nothing
  * to measure.
  */
 run: (direction: ComposerMorphDirection, host: HTMLElement | null, swap: () => void) => void;
 /** Abort an in-flight morph and restore the natural layout. */
 cancel: () => void;
||||||| bc50ba56aa
    /**
     * Run `swap` (which must commit the pill ↔ composer change synchronously,
     * i.e. via flushSync) as a morph of the box found under `host`. Falls
     * back to a plain swap when the morph is unsupported or there is nothing
     * to measure.
     */
    run: (direction: ComposerMorphDirection, host: HTMLElement | null, swap: () => void) => void;
    /** Abort an in-flight morph and restore the natural layout. */
    cancel: () => void;
=======
    run: (direction: ComposerMorphDirection, host: HTMLElement | null, swap: () => void) => void;
    cancel: () => void;
>>>>>>> upstream/main
}

export function createComposerMorphController(): ComposerMorphController {
 let active: (() => void) | null = null;

 const cancel = () => {
  if (!active) return;
  const cleanup = active;
  active = null;
  cleanup();
 };

<<<<<<< HEAD
 const run: ComposerMorphController['run'] = (direction, host, swap) => {
  if (!host || !composerMorphSupported()) {
   cancel();
   swap();
   return;
  }
  // Measured before cancelling: a swap that interrupts the opposite
  // morph continues from the box's mid-tween geometry rather than
  // snapping to its resting size first.
  const outgoingBox = host.querySelector<HTMLElement>(BOX_SELECTOR);
  const outgoingPrompt = outgoingBox?.querySelector<HTMLElement>(PROMPT_SELECTOR) ?? null;
  const fromRect = outgoingBox?.getBoundingClientRect() ?? null;
  const fromPromptRect = outgoingPrompt?.getBoundingClientRect() ?? null;
  const slot = outgoingBox?.closest<HTMLElement>(FLOATING_SLOT_SELECTOR) ?? null;
  const fromSlotHeight = slot?.getBoundingClientRect().height ?? null;
  cancel();
  swap();
||||||| bc50ba56aa
    const run: ComposerMorphController['run'] = (direction, host, swap) => {
        if (!host || !composerMorphSupported()) {
            cancel();
            swap();
            return;
        }
        // Measured before cancelling: a swap that interrupts the opposite
        // morph continues from the box's mid-tween geometry rather than
        // snapping to its resting size first.
        const outgoingBox = host.querySelector<HTMLElement>(BOX_SELECTOR);
        const outgoingPrompt = outgoingBox?.querySelector<HTMLElement>(PROMPT_SELECTOR) ?? null;
        const fromRect = outgoingBox?.getBoundingClientRect() ?? null;
        const fromPromptRect = outgoingPrompt?.getBoundingClientRect() ?? null;
        const slot = outgoingBox?.closest<HTMLElement>(FLOATING_SLOT_SELECTOR) ?? null;
        const fromSlotHeight = slot?.getBoundingClientRect().height ?? null;
        cancel();
        swap();
=======
    const run: ComposerMorphController['run'] = (direction, host, swap) => {
        if (!host || !composerMorphSupported()) {
            cancel();
            swap();
            return;
        }
        const outgoingBox = host.querySelector<HTMLElement>(BOX_SELECTOR);
        const outgoingPrompt = outgoingBox?.querySelector<HTMLElement>(PROMPT_SELECTOR) ?? null;
        const fromRect = outgoingBox?.getBoundingClientRect() ?? null;
        const fromPromptRect = outgoingPrompt?.getBoundingClientRect() ?? null;
        const slot = outgoingBox?.closest<HTMLElement>(FLOATING_SLOT_SELECTOR) ?? null;
        const fromSlotHeight = slot?.getBoundingClientRect().height ?? null;
        cancel();
        swap();
>>>>>>> upstream/main

  const box = host.querySelector<HTMLElement>(BOX_SELECTOR);
  if (!box || !fromRect) return;
  const toRect = box.getBoundingClientRect();
  const delta = Math.abs(toRect.height - fromRect.height);
  if (delta < 1) return;
  const prompt = box.querySelector<HTMLElement>(PROMPT_SELECTOR);
  const arriving = direction === 'expand'
   ? Array.from(box.querySelectorAll<HTMLElement>(ARRIVING_CONTROLS_SELECTOR))
   : [];

  const phase = direction === 'expand' ? 'show' : 'hide';
  const timing = morphTiming(direction);
  const animations: Animation[] = [];
  let startTimer: number | null = null;
  let finishTimer: number | null = null;
  let started = false;
  let startedByKeyboard = false;

<<<<<<< HEAD
  // The transcript's inset comes from the slot: on expand it takes the
  // new height at once (the glide carries the viewport there); on
  // collapse it keeps the old height until the keyboard has landed.
  const pinSlot = (height: number) => {
   if (!slot) return;
   slot.style.height = `${height}px`;
   slot.style.alignItems = 'flex-end';
  };
  // The slot's natural height with the box at rest. The form's bottom
  // padding follows the keyboard's root class, which flips only when
  // the keyboard leg starts, so the natural height is re-read then.
  // Measured without the morph state too: its clip and non-shrinking
  // rows can size the box differently from rest, and any difference
  // shows up as a riders jump when the slot is unpinned at the end.
  const measureSlotNatural = (): number | null => {
   if (!slot) return null;
   const pinned = slot.style.height;
   const boxHeight = box.style.height;
   const morphState = box.getAttribute(MORPH_STATE_ATTR);
   slot.style.height = '';
   box.style.height = '';
   box.removeAttribute(MORPH_STATE_ATTR);
   const natural = slot.getBoundingClientRect().height;
   slot.style.height = pinned;
   box.style.height = boxHeight;
   if (morphState !== null) box.setAttribute(MORPH_STATE_ATTR, morphState);
   return natural;
  };
  if (slot && fromSlotHeight !== null) {
   pinSlot(direction === 'expand' ? slot.getBoundingClientRect().height : fromSlotHeight);
  }
  // The riders travel by the slot's delta, not the box's alone (the
  // form's own padding changes with the keyboard too). The transcript's
  // end moves by the change of the column's tail inset, which takes the
  // gap above the composer first (composerTailInset), so the glide is
  // told that amount.
  const column = slot?.parentElement ?? null;
  const transcriptDeltaFor = (toSlotHeight: number): number => (
   column && fromSlotHeight !== null
    ? Math.abs(composerTailInsetFor(column, toSlotHeight) - composerTailInsetFor(column, fromSlotHeight))
    : delta
  );
  const initialSlotHeight = slot?.getBoundingClientRect().height ?? null;
  let slotDelta = fromSlotHeight !== null && initialSlotHeight !== null
   ? Math.abs(initialSlotHeight - fromSlotHeight)
   : delta;
  let transcriptDelta = initialSlotHeight !== null ? transcriptDeltaFor(initialSlotHeight) : delta;
  // Freeze the box at the outgoing height with its rows on the bottom
  // edge; mobile.css supplies the clip and bottom anchoring.
  box.setAttribute(MORPH_STATE_ATTR, direction);
  box.style.height = `${fromRect.height}px`;
  void box.offsetHeight;
||||||| bc50ba56aa
        // The transcript's inset comes from the slot: on expand it takes the
        // new height at once (the glide carries the viewport there); on
        // collapse it keeps the old height until the keyboard has landed.
        const pinSlot = (height: number) => {
            if (!slot) return;
            slot.style.height = `${height}px`;
            slot.style.alignItems = 'flex-end';
        };
        // The slot's natural height with the box at rest. The form's bottom
        // padding follows the keyboard's root class, which flips only when
        // the keyboard leg starts, so the natural height is re-read then.
        // Measured without the morph state too: its clip and non-shrinking
        // rows can size the box differently from rest, and any difference
        // shows up as a riders jump when the slot is unpinned at the end.
        const measureSlotNatural = (): number | null => {
            if (!slot) return null;
            const pinned = slot.style.height;
            const boxHeight = box.style.height;
            const morphState = box.getAttribute(MORPH_STATE_ATTR);
            slot.style.height = '';
            box.style.height = '';
            box.removeAttribute(MORPH_STATE_ATTR);
            const natural = slot.getBoundingClientRect().height;
            slot.style.height = pinned;
            box.style.height = boxHeight;
            if (morphState !== null) box.setAttribute(MORPH_STATE_ATTR, morphState);
            return natural;
        };
        if (slot && fromSlotHeight !== null) {
            pinSlot(direction === 'expand' ? slot.getBoundingClientRect().height : fromSlotHeight);
        }
        // The riders travel by the slot's delta, not the box's alone (the
        // form's own padding changes with the keyboard too). The transcript's
        // end moves by the change of the column's tail inset, which takes the
        // gap above the composer first (composerTailInset), so the glide is
        // told that amount.
        const column = slot?.parentElement ?? null;
        const transcriptDeltaFor = (toSlotHeight: number): number => (
            column && fromSlotHeight !== null
                ? Math.abs(composerTailInsetFor(column, toSlotHeight) - composerTailInsetFor(column, fromSlotHeight))
                : delta
        );
        const initialSlotHeight = slot?.getBoundingClientRect().height ?? null;
        let slotDelta = fromSlotHeight !== null && initialSlotHeight !== null
            ? Math.abs(initialSlotHeight - fromSlotHeight)
            : delta;
        let transcriptDelta = initialSlotHeight !== null ? transcriptDeltaFor(initialSlotHeight) : delta;
        // Freeze the box at the outgoing height with its rows on the bottom
        // edge; mobile.css supplies the clip and bottom anchoring.
        box.setAttribute(MORPH_STATE_ATTR, direction);
        box.style.height = `${fromRect.height}px`;
        void box.offsetHeight;
=======
        const pinSlot = (height: number) => {
            if (!slot) return;
            slot.style.height = `${height}px`;
            slot.style.alignItems = 'flex-end';
        };
        const measureSlotNatural = (): number | null => {
            if (!slot) return null;
            const pinned = slot.style.height;
            const boxHeight = box.style.height;
            const morphState = box.getAttribute(MORPH_STATE_ATTR);
            slot.style.height = '';
            box.style.height = '';
            box.removeAttribute(MORPH_STATE_ATTR);
            const natural = slot.getBoundingClientRect().height;
            slot.style.height = pinned;
            box.style.height = boxHeight;
            if (morphState !== null) box.setAttribute(MORPH_STATE_ATTR, morphState);
            return natural;
        };
        if (slot && fromSlotHeight !== null) {
            pinSlot(direction === 'expand' ? slot.getBoundingClientRect().height : fromSlotHeight);
        }
        const column = slot?.parentElement ?? null;
        const transcriptDeltaFor = (toSlotHeight: number): number => (
            column && fromSlotHeight !== null
                ? Math.abs(composerTailInsetFor(column, toSlotHeight) - composerTailInsetFor(column, fromSlotHeight))
                : delta
        );
        const initialSlotHeight = slot?.getBoundingClientRect().height ?? null;
        let slotDelta = fromSlotHeight !== null && initialSlotHeight !== null
            ? Math.abs(initialSlotHeight - fromSlotHeight)
            : delta;
        let transcriptDelta = initialSlotHeight !== null ? transcriptDeltaFor(initialSlotHeight) : delta;
        box.setAttribute(MORPH_STATE_ATTR, direction);
        box.style.height = `${fromRect.height}px`;
        void box.offsetHeight;
>>>>>>> upstream/main

<<<<<<< HEAD
  // The prompt starts where the outgoing prompt was.
  let promptOffset = 0;
  let promptGainedHeight = 0;
  if (prompt && fromPromptRect) {
   const promptRect = prompt.getBoundingClientRect();
   promptOffset = fromPromptRect.top - promptRect.top;
   promptGainedHeight = promptRect.height - fromPromptRect.height;
   if (Math.abs(promptOffset) >= 0.5) prompt.style.transform = `translateY(${promptOffset}px)`;
   if (direction === 'expand' && promptGainedHeight >= 0.5) {
    prompt.style.clipPath = `inset(0 0 ${promptGainedHeight}px 0)`;
   }
  }
  for (const control of arriving) control.style.opacity = '0';
  // The riders' natural anchor is the pinned slot's top: the new box top
  // on expand (so they start displaced down to the old one), the old
  // box top on collapse (so they end displaced down to the new one,
  // where the unpin then puts them for real).
  // Their travel is the SLOT's delta (box plus the form's own padding
  // change), the same amount the unpin moves their anchor by.
  const riders = slot?.querySelector<HTMLElement>(RIDERS_SELECTOR) ?? null;
  const ridersTravel = () => ({
   from: direction === 'expand' ? slotDelta : 0,
   to: direction === 'expand' ? 0 : slotDelta,
  });
  if (riders) riders.style.translate = `0 ${ridersTravel().from}px`;
||||||| bc50ba56aa
        // The prompt starts where the outgoing prompt was.
        let promptOffset = 0;
        let promptGainedHeight = 0;
        if (prompt && fromPromptRect) {
            const promptRect = prompt.getBoundingClientRect();
            promptOffset = fromPromptRect.top - promptRect.top;
            promptGainedHeight = promptRect.height - fromPromptRect.height;
            if (Math.abs(promptOffset) >= 0.5) prompt.style.transform = `translateY(${promptOffset}px)`;
            if (direction === 'expand' && promptGainedHeight >= 0.5) {
                prompt.style.clipPath = `inset(0 0 ${promptGainedHeight}px 0)`;
            }
        }
        for (const control of arriving) control.style.opacity = '0';
        // The riders' natural anchor is the pinned slot's top: the new box top
        // on expand (so they start displaced down to the old one), the old
        // box top on collapse (so they end displaced down to the new one,
        // where the unpin then puts them for real).
        // Their travel is the SLOT's delta (box plus the form's own padding
        // change), the same amount the unpin moves their anchor by.
        const riders = slot?.querySelector<HTMLElement>(RIDERS_SELECTOR) ?? null;
        const ridersTravel = () => ({
            from: direction === 'expand' ? slotDelta : 0,
            to: direction === 'expand' ? 0 : slotDelta,
        });
        if (riders) riders.style.translate = `0 ${ridersTravel().from}px`;
=======
        let promptOffset = 0;
        let promptGainedHeight = 0;
        if (prompt && fromPromptRect) {
            const promptRect = prompt.getBoundingClientRect();
            promptOffset = fromPromptRect.top - promptRect.top;
            promptGainedHeight = promptRect.height - fromPromptRect.height;
            if (Math.abs(promptOffset) >= 0.5) prompt.style.transform = `translateY(${promptOffset}px)`;
            if (direction === 'expand' && promptGainedHeight >= 0.5) {
                prompt.style.clipPath = `inset(0 0 ${promptGainedHeight}px 0)`;
            }
        }
        for (const control of arriving) control.style.opacity = '0';
        const riders = slot?.querySelector<HTMLElement>(RIDERS_SELECTOR) ?? null;
        const ridersTravel = () => ({
            from: direction === 'expand' ? slotDelta : 0,
            to: direction === 'expand' ? 0 : slotDelta,
        });
        if (riders) riders.style.translate = `0 ${ridersTravel().from}px`;
>>>>>>> upstream/main

<<<<<<< HEAD
  const restore = () => {
   for (const animation of animations) animation.cancel();
   animations.length = 0;
   box.style.height = '';
   box.removeAttribute(MORPH_STATE_ATTR);
   if (prompt) {
    prompt.style.transform = '';
    prompt.style.clipPath = '';
   }
   for (const control of arriving) control.style.opacity = '';
   if (riders) riders.style.translate = '';
   if (slot) {
    slot.style.height = '';
    slot.style.alignItems = '';
   }
  };
  const cleanup = () => {
   if (startTimer !== null) window.clearTimeout(startTimer);
   if (finishTimer !== null) window.clearTimeout(finishTimer);
   window.removeEventListener('oc:keyboard-anim', handleKeyboardAnim);
   window.removeEventListener('oc:keyboard-settled', handleKeyboardSettled);
   restore();
  };
  const finish = () => {
   if (active !== cleanup) return;
   active = null;
   cleanup();
   if (!startedByKeyboard) {
    dispatchMorph({ phase: 'release', direction, delta: transcriptDelta, durationMs: timing.durationMs });
   }
  };
  const start = (byKeyboard: boolean) => {
   if (started) return;
   started = true;
   startedByKeyboard = byKeyboard;
   if (startTimer !== null) {
    window.clearTimeout(startTimer);
    startTimer = null;
   }
   window.removeEventListener('oc:keyboard-anim', handleKeyboardAnim);
   // Re-read the resting geometry now that the keyboard's root class
   // has flipped, so the pinned inset (expand) and the announced
   // delta (collapse) match what the slot will measure at release —
   // a stale value here is a few-pixel re-pin after the motion.
   if (slot && fromSlotHeight !== null) {
    const natural = measureSlotNatural();
    if (natural !== null) {
     slotDelta = Math.abs(natural - fromSlotHeight);
     transcriptDelta = transcriptDeltaFor(natural);
     if (direction === 'expand') pinSlot(natural);
     dispatchMorph({ phase: 'hold', direction, delta: transcriptDelta, durationMs: timing.durationMs });
    }
   }
   // A height and a clip run on the main thread whatever their easing;
   // transforms, translates and opacity take keyframes of the curve,
   // which Core Animation runs (keyboardKeyframes).
   const options: KeyframeAnimationOptions = { duration: timing.durationMs, easing: timing.easing, fill: 'forwards' };
   const compositorOptions: KeyframeAnimationOptions = { duration: timing.durationMs, easing: 'linear', fill: 'forwards' };
   animations.push(box.animate([{ height: `${fromRect.height}px` }, { height: `${toRect.height}px` }], options));
   if (prompt) {
    if (Math.abs(promptOffset) >= 0.5) {
     animations.push(prompt.animate(
      keyboardKeyframes((position: number) => ({ transform: `translateY(${promptOffset * (1 - position)}px)` })),
      compositorOptions,
     ));
    }
    if (direction === 'expand' && promptGainedHeight >= 0.5) {
     // Extra lines unfurl beneath the rising first line instead
     // of sliding up from under the footer as one block.
     animations.push(prompt.animate(
      [{ clipPath: `inset(0 0 ${promptGainedHeight}px 0)` }, { clipPath: 'inset(0 0 0 0)' }],
      options,
     ));
    }
   }
   if (riders) {
    // Re-read after the slot delta was refreshed above; the
    // keyframes carry it, so no inline update is needed.
    const travel = ridersTravel();
    animations.push(riders.animate(
     keyboardKeyframes((position: number) => ({ translate: `0 ${travel.from + (travel.to - travel.from) * position}px` })),
     compositorOptions,
    ));
   }
   for (const control of arriving) {
    // Hidden through the first half while the prompt still crosses
    // the footer row, then in along the direction of travel.
    animations.push(control.animate(
     keyboardKeyframes((position: number) => ({ opacity: position, transform: `translateY(${ARRIVAL_DRIFT_PX * (1 - position)}px)` })),
     { duration: timing.durationMs / 2, delay: timing.durationMs / 2, easing: 'linear', fill: 'both' },
    ));
   }
   if (!byKeyboard) {
    // No keyboard leg: the transcript glides on the morph alone.
    dispatchMorph({ phase: 'glide', direction, delta: transcriptDelta, durationMs: timing.durationMs });
    finishTimer = window.setTimeout(finish, timing.durationMs + FINISH_SLACK_MS);
   } else {
    // The keyboard's settled event ends the leg; the timer is a
    // backstop should it never arrive.
    finishTimer = window.setTimeout(finish, timing.durationMs + 4 * FINISH_SLACK_MS);
   }
  };
  function handleKeyboardAnim(event: Event) {
   // SAFETY: oc:keyboard-anim is dispatched only by useNativeMobileChrome
   // as a CustomEvent whose detail carries `phase: 'show' | 'hide'`.
   const detail = (event as CustomEvent<{ phase: 'show' | 'hide' }>).detail;
   if (detail.phase !== phase) return;
   start(true);
  }
  function handleKeyboardSettled(event: Event) {
   // SAFETY: oc:keyboard-settled is dispatched only by useNativeMobileChrome
   // as a CustomEvent whose detail carries `open`.
   const detail = (event as CustomEvent<{ open: boolean }>).detail;
   if (!started || !startedByKeyboard) return;
   if (detail.open !== (phase === 'show')) return;
   finish();
  }
||||||| bc50ba56aa
        const restore = () => {
            for (const animation of animations) animation.cancel();
            animations.length = 0;
            box.style.height = '';
            box.removeAttribute(MORPH_STATE_ATTR);
            if (prompt) {
                prompt.style.transform = '';
                prompt.style.clipPath = '';
            }
            for (const control of arriving) control.style.opacity = '';
            if (riders) riders.style.translate = '';
            if (slot) {
                slot.style.height = '';
                slot.style.alignItems = '';
            }
        };
        const cleanup = () => {
            if (startTimer !== null) window.clearTimeout(startTimer);
            if (finishTimer !== null) window.clearTimeout(finishTimer);
            window.removeEventListener('oc:keyboard-anim', handleKeyboardAnim);
            window.removeEventListener('oc:keyboard-settled', handleKeyboardSettled);
            restore();
        };
        const finish = () => {
            if (active !== cleanup) return;
            active = null;
            cleanup();
            if (!startedByKeyboard) {
                dispatchMorph({ phase: 'release', direction, delta: transcriptDelta, durationMs: timing.durationMs });
            }
        };
        const start = (byKeyboard: boolean) => {
            if (started) return;
            started = true;
            startedByKeyboard = byKeyboard;
            if (startTimer !== null) {
                window.clearTimeout(startTimer);
                startTimer = null;
            }
            window.removeEventListener('oc:keyboard-anim', handleKeyboardAnim);
            // Re-read the resting geometry now that the keyboard's root class
            // has flipped, so the pinned inset (expand) and the announced
            // delta (collapse) match what the slot will measure at release —
            // a stale value here is a few-pixel re-pin after the motion.
            if (slot && fromSlotHeight !== null) {
                const natural = measureSlotNatural();
                if (natural !== null) {
                    slotDelta = Math.abs(natural - fromSlotHeight);
                    transcriptDelta = transcriptDeltaFor(natural);
                    if (direction === 'expand') pinSlot(natural);
                    dispatchMorph({ phase: 'hold', direction, delta: transcriptDelta, durationMs: timing.durationMs });
                }
            }
            // A height and a clip run on the main thread whatever their easing;
            // transforms, translates and opacity take keyframes of the curve,
            // which Core Animation runs (keyboardKeyframes).
            const options: KeyframeAnimationOptions = { duration: timing.durationMs, easing: timing.easing, fill: 'forwards' };
            const compositorOptions: KeyframeAnimationOptions = { duration: timing.durationMs, easing: 'linear', fill: 'forwards' };
            animations.push(box.animate([{ height: `${fromRect.height}px` }, { height: `${toRect.height}px` }], options));
            if (prompt) {
                if (Math.abs(promptOffset) >= 0.5) {
                    animations.push(prompt.animate(
                        keyboardKeyframes((position) => ({ transform: `translateY(${promptOffset * (1 - position)}px)` })),
                        compositorOptions,
                    ));
                }
                if (direction === 'expand' && promptGainedHeight >= 0.5) {
                    // Extra lines unfurl beneath the rising first line instead
                    // of sliding up from under the footer as one block.
                    animations.push(prompt.animate(
                        [{ clipPath: `inset(0 0 ${promptGainedHeight}px 0)` }, { clipPath: 'inset(0 0 0 0)' }],
                        options,
                    ));
                }
            }
            if (riders) {
                // Re-read after the slot delta was refreshed above; the
                // keyframes carry it, so no inline update is needed.
                const travel = ridersTravel();
                animations.push(riders.animate(
                    keyboardKeyframes((position) => ({ translate: `0 ${travel.from + (travel.to - travel.from) * position}px` })),
                    compositorOptions,
                ));
            }
            for (const control of arriving) {
                // Hidden through the first half while the prompt still crosses
                // the footer row, then in along the direction of travel.
                animations.push(control.animate(
                    keyboardKeyframes((position) => ({ opacity: position, transform: `translateY(${ARRIVAL_DRIFT_PX * (1 - position)}px)` })),
                    { duration: timing.durationMs / 2, delay: timing.durationMs / 2, easing: 'linear', fill: 'both' },
                ));
            }
            if (!byKeyboard) {
                // No keyboard leg: the transcript glides on the morph alone.
                dispatchMorph({ phase: 'glide', direction, delta: transcriptDelta, durationMs: timing.durationMs });
                finishTimer = window.setTimeout(finish, timing.durationMs + FINISH_SLACK_MS);
            } else {
                // The keyboard's settled event ends the leg; the timer is a
                // backstop should it never arrive.
                finishTimer = window.setTimeout(finish, timing.durationMs + 4 * FINISH_SLACK_MS);
            }
        };
        function handleKeyboardAnim(event: Event) {
            // SAFETY: oc:keyboard-anim is dispatched only by useNativeMobileChrome
            // as a CustomEvent whose detail carries `phase: 'show' | 'hide'`.
            const detail = (event as CustomEvent<{ phase: 'show' | 'hide' }>).detail;
            if (detail.phase !== phase) return;
            start(true);
        }
        function handleKeyboardSettled(event: Event) {
            // SAFETY: oc:keyboard-settled is dispatched only by useNativeMobileChrome
            // as a CustomEvent whose detail carries `open`.
            const detail = (event as CustomEvent<{ open: boolean }>).detail;
            if (!started || !startedByKeyboard) return;
            if (detail.open !== (phase === 'show')) return;
            finish();
        }
=======
        const restore = () => {
            for (const animation of animations) animation.cancel();
            animations.length = 0;
            box.style.height = '';
            box.removeAttribute(MORPH_STATE_ATTR);
            if (prompt) {
                prompt.style.transform = '';
                prompt.style.clipPath = '';
            }
            for (const control of arriving) control.style.opacity = '';
            if (riders) riders.style.translate = '';
            if (slot) {
                slot.style.height = '';
                slot.style.alignItems = '';
            }
        };
        const cleanup = () => {
            if (startTimer !== null) window.clearTimeout(startTimer);
            if (finishTimer !== null) window.clearTimeout(finishTimer);
            window.removeEventListener('oc:keyboard-anim', handleKeyboardAnim);
            window.removeEventListener('oc:keyboard-settled', handleKeyboardSettled);
            restore();
        };
        const finish = () => {
            if (active !== cleanup) return;
            active = null;
            cleanup();
            if (!startedByKeyboard) {
                dispatchMorph({ phase: 'release', direction, delta: transcriptDelta, durationMs: timing.durationMs });
            }
        };
        const start = (byKeyboard: boolean) => {
            if (started) return;
            started = true;
            startedByKeyboard = byKeyboard;
            if (startTimer !== null) {
                window.clearTimeout(startTimer);
                startTimer = null;
            }
            window.removeEventListener('oc:keyboard-anim', handleKeyboardAnim);
            if (slot && fromSlotHeight !== null) {
                const natural = measureSlotNatural();
                if (natural !== null) {
                    slotDelta = Math.abs(natural - fromSlotHeight);
                    transcriptDelta = transcriptDeltaFor(natural);
                    if (direction === 'expand') pinSlot(natural);
                    dispatchMorph({ phase: 'hold', direction, delta: transcriptDelta, durationMs: timing.durationMs });
                }
            }
            const options: KeyframeAnimationOptions = { duration: timing.durationMs, easing: timing.easing, fill: 'forwards' };
            const compositorOptions: KeyframeAnimationOptions = { duration: timing.durationMs, easing: 'linear', fill: 'forwards' };
            animations.push(box.animate([{ height: `${fromRect.height}px` }, { height: `${toRect.height}px` }], options));
            if (prompt) {
                if (Math.abs(promptOffset) >= 0.5) {
                    animations.push(prompt.animate(
                        keyboardKeyframes((position) => ({ transform: `translateY(${promptOffset * (1 - position)}px)` })),
                        compositorOptions,
                    ));
                }
                if (direction === 'expand' && promptGainedHeight >= 0.5) {
                    animations.push(prompt.animate(
                        [{ clipPath: `inset(0 0 ${promptGainedHeight}px 0)` }, { clipPath: 'inset(0 0 0 0)' }],
                        options,
                    ));
                }
            }
            if (riders) {
                const travel = ridersTravel();
                animations.push(riders.animate(
                    keyboardKeyframes((position) => ({ translate: `0 ${travel.from + (travel.to - travel.from) * position}px` })),
                    compositorOptions,
                ));
            }
            for (const control of arriving) {
                animations.push(control.animate(
                    keyboardKeyframes((position) => ({ opacity: position, transform: `translateY(${ARRIVAL_DRIFT_PX * (1 - position)}px)` })),
                    { duration: timing.durationMs / 2, delay: timing.durationMs / 2, easing: 'linear', fill: 'both' },
                ));
            }
            if (!byKeyboard) {
                dispatchMorph({ phase: 'glide', direction, delta: transcriptDelta, durationMs: timing.durationMs });
                finishTimer = window.setTimeout(finish, timing.durationMs + FINISH_SLACK_MS);
            } else {
                finishTimer = window.setTimeout(finish, timing.durationMs + 4 * FINISH_SLACK_MS);
            }
        };
        function handleKeyboardAnim(event: Event) {
            // SAFETY: oc:keyboard-anim is dispatched only by useNativeMobileChrome
            // as a CustomEvent whose detail carries `phase: 'show' | 'hide'`.
            const detail = (event as CustomEvent<{ phase: 'show' | 'hide' }>).detail;
            if (detail.phase !== phase) return;
            start(true);
        }
        function handleKeyboardSettled(event: Event) {
            // SAFETY: oc:keyboard-settled is dispatched only by useNativeMobileChrome
            // as a CustomEvent whose detail carries `open`.
            const detail = (event as CustomEvent<{ open: boolean }>).detail;
            if (!started || !startedByKeyboard) return;
            if (detail.open !== (phase === 'show')) return;
            finish();
        }
>>>>>>> upstream/main

  dispatchMorph({ phase: 'hold', direction, delta: transcriptDelta, durationMs: timing.durationMs });
  window.addEventListener('oc:keyboard-anim', handleKeyboardAnim);
  window.addEventListener('oc:keyboard-settled', handleKeyboardSettled);
  startTimer = window.setTimeout(() => {
   startTimer = null;
   start(false);
  }, KEYBOARD_EVENT_FALLBACK_MS);
  active = cleanup;
 };

 return { run, cancel };
}
