import React from 'react';
import {
  GUEST_POPOVER_HEIGHT_MAX,
  GUEST_POPOVER_HEIGHT_MIN,
  HostRequestError,
  OPENCHAMBER_SDK_API_VERSION,
  OPENCHAMBER_SDK_CHANNEL,
  type GuestPopoverClosedEvent,
  type GuestPopoverContext,
  type GuestPopoverRequest,
  type HostMessage,
} from 'ohpichamber-sdk';

import {
  getGuestPopoverController,
  guestPopoverOwnerBlocked,
  positionGuestPopover,
  type GuestPopoverActivation,
  type GuestPopoverPosition,
} from '@/lib/guests/popovers';
import { isMobileSurfaceRuntime } from '@/lib/runtimeSurface';

type ActivePluginPopover = {
  request: GuestPopoverRequest;
  position: GuestPopoverPosition;
  entry: string;
  directory: string;
  activation: GuestPopoverActivation;
};

type PluginPanePopoverProps = {
  popover?: GuestPopoverContext;
  popoverHost?: { entry: string; directory: string; context: GuestPopoverContext; activation: GuestPopoverActivation; focus: boolean };
  onPopoverClosed?: (event: GuestPopoverClosedEvent) => void;
  onPopoverActivity?: (active: boolean) => void;
};

const popoverOpensAsSheet = (): boolean => isMobileSurfaceRuntime();

/**
 * The popover one frame owns: activation claim, anchor/overlay hover tracking
 * and the deferred close both hover reports share. A sheet on a phone modal
 * tracks no hover, because its dialog owns dismissal.
 */
export const usePluginPanePopover = ({ iframeRef, postToGuest, popover, popoverHost, directory, frameKey }: {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  postToGuest: (message: HostMessage) => void;
  popover: GuestPopoverContext | undefined;
  popoverHost: PluginPanePopoverProps['popoverHost'];
  directory: string | undefined;
  frameKey: string;
}) => {
  const [activePopover, setActivePopover] = React.useState<ActivePluginPopover | null>(null);
  const activePopoverRef = React.useRef<typeof activePopover>(null);
  const popoverCloseTimerRef = React.useRef<number | null>(null);
  const popoverAnchorActiveRef = React.useRef(false);
  const popoverOverlayActiveRef = React.useRef(false);
  const closeActivePopoverRef = React.useRef<(reason: GuestPopoverClosedEvent['reason']) => void>(() => { });

  const clearPopoverCloseTimer = React.useCallback(() => {
    if (popoverCloseTimerRef.current != null) {
      window.clearTimeout(popoverCloseTimerRef.current);
      popoverCloseTimerRef.current = null;
    }
  }, []);
  const schedulePopoverClose = React.useCallback((activation: GuestPopoverActivation, reason: GuestPopoverClosedEvent['reason']) => {
    clearPopoverCloseTimer();
    popoverCloseTimerRef.current = window.setTimeout(() => {
      if (activePopoverRef.current?.activation !== activation || popoverAnchorActiveRef.current || popoverOverlayActiveRef.current) return;
      closeActivePopoverRef.current(reason);
    }, 250);
  }, [clearPopoverCloseTimer]);
  const closeActivePopover = React.useCallback((reason: GuestPopoverClosedEvent['reason']) => {
    clearPopoverCloseTimer();
    const active = activePopoverRef.current;
    if (!active) return;
    getGuestPopoverController(document).release(active.activation);
    activePopoverRef.current = null;
    popoverAnchorActiveRef.current = false;
    popoverOverlayActiveRef.current = false;
    setActivePopover(null);
    if (reason === 'escape') iframeRef.current?.focus();
    postToGuest({
      channel: OPENCHAMBER_SDK_CHANNEL,
      v: OPENCHAMBER_SDK_API_VERSION,
      type: 'popover-closed',
      payload: { id: active.request.id, reason },
    });
  }, [clearPopoverCloseTimer, iframeRef, postToGuest]);
  closeActivePopoverRef.current = closeActivePopover;
  React.useEffect(() => () => closeActivePopover('owner'), [closeActivePopover]);
  React.useLayoutEffect(() => {
    if (!popoverHost && !popover) closeActivePopover('owner');
  }, [closeActivePopover, directory, frameKey, popover, popoverHost]);

  const sheet = popoverOpensAsSheet();

  const resizePopover = React.useCallback((popoverActivation: GuestPopoverActivation, opensAsSheet: boolean, height: number) => {
    const current = activePopoverRef.current;
    const frame = iframeRef.current;
    if (!current || current.activation !== popoverActivation || !frame
      || !getGuestPopoverController(document).authorize(current.activation)) return;
    const nextHeight = Math.max(GUEST_POPOVER_HEIGHT_MIN, Math.min(GUEST_POPOVER_HEIGHT_MAX, height + (opensAsSheet ? 0 : 2)));
    if (current.request.height === nextHeight) return;
    const request = { ...current.request, height: nextHeight };
    if (opensAsSheet) {
      const next = { ...current, request };
      activePopoverRef.current = next;
      setActivePopover(next);
      return;
    }
    const bounds = frame.getBoundingClientRect();
    const position = positionGuestPopover({
      ...request,
      frame: {
        left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height,
        clientWidth: frame.clientWidth, clientHeight: frame.clientHeight
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    if (!position) { closeActivePopover('anchor'); return; }
    const next = { ...current, request, position };
    activePopoverRef.current = next;
    setActivePopover(next);
  }, [closeActivePopover, iframeRef]);

  const childPopoverClosed = React.useCallback((event: GuestPopoverClosedEvent) => {
    if (activePopoverRef.current?.request.id === event.id) closeActivePopover(event.reason);
  }, [closeActivePopover]);

  const childPopoverActivity = React.useCallback((popoverActivation: GuestPopoverActivation, opensAsSheet: boolean, active: boolean) => {
    if (opensAsSheet || activePopoverRef.current?.activation !== popoverActivation) return;
    popoverOverlayActiveRef.current = active;
    if (active) clearPopoverCloseTimer();
    else schedulePopoverClose(popoverActivation, 'outside');
  }, [clearPopoverCloseTimer, schedulePopoverClose]);

  const overlayEnter = React.useCallback(() => {
    popoverOverlayActiveRef.current = true;
    clearPopoverCloseTimer();
  }, [clearPopoverCloseTimer]);

  const overlayLeave = React.useCallback((popoverActivation: GuestPopoverActivation) => {
    popoverOverlayActiveRef.current = false;
    schedulePopoverClose(popoverActivation, 'outside');
  }, [schedulePopoverClose]);

  const overlayOutsideHover = React.useCallback((popoverActivation: GuestPopoverActivation) => {
    if (!popoverAnchorActiveRef.current && !popoverOverlayActiveRef.current && popoverCloseTimerRef.current !== null) return;
    popoverAnchorActiveRef.current = false;
    popoverOverlayActiveRef.current = false;
    schedulePopoverClose(popoverActivation, 'outside');
  }, [schedulePopoverClose]);

  const bridge = React.useMemo<PluginPanePopoverBridge>(() => ({
    activePopoverRef,
    setActivePopover,
    popoverAnchorActiveRef,
    popoverOverlayActiveRef,
    closeActivePopoverRef,
    clearPopoverCloseTimer,
    schedulePopoverClose,
    closeActivePopover,
  }), [clearPopoverCloseTimer, schedulePopoverClose, closeActivePopover]);

  return {
    activePopover,
    bridge,
    popoverCloseTimerRef,
    sheet,
    clearPopoverCloseTimer,
    schedulePopoverClose,
    closeActivePopover,
    resizePopover,
    childPopoverClosed,
    childPopoverActivity,
    overlayEnter,
    overlayLeave,
    overlayOutsideHover,
  };
};

type PluginPanePopoverBridge = {
  activePopoverRef: React.RefObject<ActivePluginPopover | null>;
  setActivePopover: React.Dispatch<React.SetStateAction<ActivePluginPopover | null>>;
  popoverAnchorActiveRef: React.RefObject<boolean>;
  popoverOverlayActiveRef: React.RefObject<boolean>;
  closeActivePopoverRef: React.RefObject<(reason: GuestPopoverClosedEvent['reason']) => void>;
  clearPopoverCloseTimer: () => void;
  schedulePopoverClose: (activation: GuestPopoverActivation, reason: GuestPopoverClosedEvent['reason']) => void;
  closeActivePopover: (reason: GuestPopoverClosedEvent['reason']) => void;
};

/**
 * The bridge handlers of one effect attachment. They close over that
 * attachment's frame ownership and entry, because a re-attached document may
 * answer for neither.
 */
export const createPluginPanePopoverHandlers = ({ bridge, ownsFrame, childPopover, popover, headless, surface, iframeRef, guestEntry, directoryRef, onPopoverClosedRef, onPopoverActivityRef }: {
  bridge: PluginPanePopoverBridge;
  ownsFrame: () => boolean;
  childPopover: PluginPanePopoverProps['popoverHost'] | undefined;
  popover: GuestPopoverContext | undefined;
  headless: boolean;
  surface: string;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  guestEntry: string | null;
  directoryRef: React.RefObject<string | undefined>;
  onPopoverClosedRef: React.RefObject<PluginPanePopoverProps['onPopoverClosed']>;
  onPopoverActivityRef: React.RefObject<PluginPanePopoverProps['onPopoverActivity']>;
}) => {
  const {
    activePopoverRef, setActivePopover, popoverAnchorActiveRef, popoverOverlayActiveRef,
    closeActivePopoverRef, clearPopoverCloseTimer, schedulePopoverClose, closeActivePopover,
  } = bridge;

  const openPopover = (request: GuestPopoverRequest) => {
    if (childPopover || popover || headless
      || !(surface === 'panel' || surface === 'page' || surface === 'status')) {
      throw new HostRequestError('UNSUPPORTED', 'This frame cannot open a popover.');
    }
    const frameBounds = iframeRef.current?.getBoundingClientRect();
    const frame = iframeRef.current;
    if (!frameBounds || !frame) throw new HostRequestError('HOST_REJECTED', 'The popover owner is unavailable.');
    if (guestPopoverOwnerBlocked(frame)) {
      throw new HostRequestError('HOST_REJECTED', 'A host dialog is active.');
    }
    const ownerFocused = document.activeElement === frame;
    if (request.focus && !ownerFocused) {
      throw new HostRequestError('HOST_REJECTED', 'Popover focus requires keyboard interaction with its owner.');
    }
    const position = positionGuestPopover({
      anchor: request.anchor,
      width: request.width,
      height: request.height,
      side: request.side,
      frame: {
        left: frameBounds.left, top: frameBounds.top, width: frameBounds.width, height: frameBounds.height,
        clientWidth: frame.clientWidth, clientHeight: frame.clientHeight,
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    if (!position) throw new HostRequestError('HOST_REJECTED', 'The popover anchor is not visible.');
    if (!guestEntry) throw new HostRequestError('UNSUPPORTED', 'This extension has no entry for a popover.');
    const capturedDirectory = directoryRef.current ?? '';
    const activation = getGuestPopoverController(document).claim({
      id: request.id,
      authorize: () => ownsFrame() && directoryRef.current === capturedDirectory && !guestPopoverOwnerBlocked(frame),
      close: (reason) => closeActivePopoverRef.current(reason),
    });
    const next = { request, position, entry: guestEntry, directory: capturedDirectory, activation };
    popoverAnchorActiveRef.current = true;
    popoverOverlayActiveRef.current = false;
    activePopoverRef.current = next;
    setActivePopover(next);
  };

  const closePopover = (id: string, reason: 'closed' | 'escape' | undefined) => {
    if (childPopover || popover) {
      const context = childPopover?.context ?? popover;
      if (id !== context?.id) throw new HostRequestError('HOST_REJECTED', 'A popover may close only itself.');
      onPopoverClosedRef.current?.({ id, reason: reason ?? 'closed' });
      return;
    }
    if (activePopoverRef.current?.request.id === id) closeActivePopover(reason ?? 'closed');
  };

  const setPopoverAnchorActive = (id: string, active: boolean) => {
    if (childPopover || popover) {
      const context = childPopover?.context ?? popover;
      if (id !== context?.id) throw new HostRequestError('HOST_REJECTED', 'A popover may report only its own activity.');
      onPopoverActivityRef.current?.(active);
      return;
    }
    if (activePopoverRef.current?.request.id !== id || popoverOpensAsSheet()) return;
    clearPopoverCloseTimer();
    popoverAnchorActiveRef.current = active;
    if (!active) {
      schedulePopoverClose(activePopoverRef.current.activation, 'anchor');
    }
  };

  return { openPopover, closePopover, setPopoverAnchorActive };
};
