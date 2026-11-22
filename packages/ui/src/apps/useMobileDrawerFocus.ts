import React from 'react';

export function useMobileDrawerFocus(ref: React.RefObject<HTMLElement | null>, open: boolean): void {
  React.useLayoutEffect(() => {
    if (!open) return;
    const drawer = ref.current;
    if (!drawer) return;
    const opener = document.activeElement;
    // Focus the surface, not its search field: opening a drawer must not raise the phone keyboard.
    const timer = window.setTimeout(() => {
      if (document.activeElement === opener || document.activeElement === document.body) {
        drawer.focus({ preventScroll: true });
      }
    }, 16);
    return () => {
      window.clearTimeout(timer);
      const active = document.activeElement;
      if (opener instanceof HTMLElement && opener.isConnected
        && (active === document.body || drawer.contains(active))) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [open, ref]);
}
