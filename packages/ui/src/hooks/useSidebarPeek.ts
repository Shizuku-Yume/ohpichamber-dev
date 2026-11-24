import React from 'react';

import { isRightToLeft } from '@/lib/i18n';
import { isIMECompositionEvent } from '@/lib/ime';
import { debounce } from '@/lib/timing/debounce';
import type { SidebarPeek, SidebarPeekState } from '@/components/layout/useSidebarPeek';

const PEEK_DWELL_MS = 50;
const PEEK_EDGE_PX = 18;
const PEEK_LEAVE_MS = 300;

const POPUP_SELECTOR = '[role="menu"], [role="dialog"], [role="alertdialog"], [role="listbox"]';

const isPortalledPopup = (element: Element): boolean => !document.getElementById('root')?.contains(element);

const isOnStartEdge = (event: PointerEvent): boolean => {
  const fromStart = isRightToLeft(document.documentElement) ? window.innerWidth - event.clientX : event.clientX;
  if (fromStart > PEEK_EDGE_PX) return false;
  const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--oc-header-height')) || 48;
  return event.clientY >= headerHeight;
};

const isHeldOpen = (overlay: HTMLElement | null): boolean => {
  const active = document.activeElement;
  if (overlay && active instanceof HTMLElement && overlay.contains(active) && (active.isContentEditable || active.matches('input, textarea'))) {
    return true;
  }
  return Array.from(document.querySelectorAll(POPUP_SELECTOR)).some((element) => isPortalledPopup(element) && element.getClientRects().length > 0);
};

export const useSidebarPeek = ({ enabled, layoutAnimationMs }: { enabled: boolean; layoutAnimationMs: number }): SidebarPeek => {
  const [state, setState] = React.useState<SidebarPeekState>(false);
  const animationMs = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : layoutAnimationMs;
  const animated = animationMs > 0;
  const overlayRef = React.useRef<HTMLElement | null>(null);

  const showDwell = React.useMemo(() => debounce(() => setState('in'), PEEK_DWELL_MS), []);

  const hideRef = React.useRef<() => void>(() => undefined);

  const scheduleHide = React.useMemo(() => debounce(() => {
    if (isHeldOpen(overlayRef.current)) {
      scheduleHide();
      return;
    }
    hideRef.current();
  }, PEEK_LEAVE_MS), []);

  const hide = React.useCallback(() => {
    showDwell.cancel();
    scheduleHide.cancel();
    setState((current) => (current === 'in' && animated ? 'out' : false));
  }, [animated, scheduleHide, showDwell]);
  hideRef.current = hide;

  React.useEffect(() => {
    if (enabled) return;
    showDwell.cancel();
    scheduleHide.cancel();
    setState(false);
  }, [enabled, scheduleHide, showDwell]);

  React.useEffect(() => () => {
    showDwell.cancel();
    scheduleHide.cancel();
  }, [scheduleHide, showDwell]);

  React.useEffect(() => {
    if (state !== 'in') return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (overlayRef.current?.contains(target) || isPortalledPopup(target)) return;
      hide();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isIMECompositionEvent(event)) return;
      if (event.key !== 'Escape' || event.defaultPrevented || isHeldOpen(overlayRef.current)) return;
      hide();
    };
    // external: https://developer.mozilla.org/en-US/docs/Web/API/Element/mouseenter_event A sidebar moving under a stationary pointer needs document-exit tracking too.
    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) scheduleHide();
    };
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerout', handlePointerOut);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerout', handlePointerOut);
    };
  }, [hide, scheduleHide, state]);

  React.useEffect(() => {
    if (!enabled || state !== false) return;
    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.buttons !== 0 || !isOnStartEdge(event)) {
        showDwell.cancel();
        return;
      }
      showDwell();
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (event.relatedTarget === null) showDwell.cancel();
    };
    document.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('pointerout', handlePointerOut);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerout', handlePointerOut);
      showDwell.cancel();
    };
  }, [enabled, showDwell, state]);

  const overlayHandlers = React.useMemo<SidebarPeek['overlayHandlers']>(() => ({
    onPointerEnter: () => {
      scheduleHide.cancel();
      setState((current) => (current === 'out' ? 'in' : current));
    },
    onPointerLeave: () => {
      if (state === 'in') scheduleHide();
    },
    onAnimationEnd: (event) => {
      if (event.target !== event.currentTarget) return;
      setState((current) => (current === 'out' ? false : current));
    },
  }), [scheduleHide, state]);

  return { state: enabled ? state : false, animationMs, overlayRef, overlayHandlers };
};
