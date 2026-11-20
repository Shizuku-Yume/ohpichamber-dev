import type React from 'react';

export type SidebarPeekState = false | 'in' | 'out';

export interface SidebarPeek {
  state: SidebarPeekState;
  animationMs: number;
  overlayRef: React.RefObject<HTMLElement | null>;
  overlayHandlers: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onAnimationEnd: (event: React.AnimationEvent) => void;
  };
}
