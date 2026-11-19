import React from 'react';
import { normalizeContextPanelDirectoryKey, useUIStore } from '@/stores/useUIStore';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
<<<<<<< HEAD
||||||| bc50ba56aa
import {
  CONTEXT_ZONE_DEFAULT_WIDTH,
  isZoneShown,
  resolveZoneActiveTab,
  showsFileTreeOnly,
  sideZoneWidth,
} from '@/lib/workspace/zones';
=======
import { sidebarPendingWidth } from '@/components/layout/sidebarPendingWidth';
import {
  CONTEXT_ZONE_DEFAULT_WIDTH,
  isZoneShown,
  resolveZoneActiveTab,
  showsFileTreeOnly,
  sideZoneWidth,
} from '@/lib/workspace/zones';
>>>>>>> upstream/main

export const WORK_STATUS_PANEL_WIDTH = 300;

<<<<<<< HEAD
/**
 * Minimum width the message column must keep for itself. Below this the panel
 * yields — a squeezed transcript costs more than the status it displaces.
 */
||||||| bc50ba56aa
/**
 * Minimum width the message column must keep for itself. Below this the panel
 * yields, beside the context panel too: a squeezed transcript costs more than
 * the status it displaces.
 */
=======
>>>>>>> upstream/main
const WORK_STATUS_MIN_CHAT_WIDTH = 560;

<<<<<<< HEAD
/** The card's own horizontal margins (`ml-2` + `mr-4`). */
||||||| bc50ba56aa
/** The card's own horizontal margins (`ms-2` + `me-4`). */
=======
>>>>>>> upstream/main
const WORK_STATUS_PANEL_GUTTER = 8 + 16;

export const WORK_STATUS_COLUMN_WIDTH = WORK_STATUS_PANEL_WIDTH + WORK_STATUS_PANEL_GUTTER;

export const WORK_STATUS_REQUIRED_ROW_WIDTH = WORK_STATUS_COLUMN_WIDTH + WORK_STATUS_MIN_CHAT_WIDTH;

type Options = {
  isMobile: boolean;
};

type Result = {
  fits: boolean;
  roomy: boolean;
<<<<<<< HEAD
  /**
   * Attach to the flex row that contains the chat column and the panel.
   *
   * A callback ref, not an object ref: an object ref gives no signal when the
   * node attaches, so a measuring effect that reads `.current` would silently
   * observe nothing whenever the row mounts after the effect first ran, and
   * would only recover on the next unrelated dependency change.
   */
||||||| bc50ba56aa
  /**
   * The chat area is also wide enough for the panel's column beside the
   * context panel at the width it shows at, or will open at. Answered while
   * the context panel is closed too, so the commit that opens it already
   * knows whether the card stays.
   */
  roomyBesidePanel: boolean;
  /**
   * Attach to the flex row that contains the chat column and the panel.
   *
   * A callback ref, not an object ref: an object ref gives no signal when the
   * node attaches, so a measuring effect that reads `.current` would silently
   * observe nothing whenever the row mounts after the effect first ran, and
   * would only recover on the next unrelated dependency change.
   */
=======
  roomyBesidePanel: boolean;
>>>>>>> upstream/main
  rowRef: (node: HTMLDivElement | null) => void;
  visible: boolean;
};

<<<<<<< HEAD
/**
 * Decides whether the work-status panel may occupy space inside the chat.
 *
 * The width test measures the ROW (chat column + panel), never the chat column
 * alone. The chat column's width is an output of this decision: hiding the
 * panel widens it, which would re-satisfy a chat-width test and re-show the
 * panel, oscillating forever. The row width is independent of the panel, so it
 * is the only stable input.
 */
export const useWorkStatusVisibility = ({ isMobile }: Options): Result => {
||||||| bc50ba56aa
/**
 * Decides whether the work-status panel may occupy space inside the chat.
 *
 * The width test measures the ROW (chat column + panel), never the chat column
 * alone. The chat column's width is an output of this decision: hiding the
 * panel widens it, which would re-satisfy a chat-width test and re-show the
 * panel, oscillating forever. The row width is independent of the panel, so it
 * is the only stable input.
 */
export const useWorkStatusVisibility = ({ isMobile, isVSCode }: Options): Result => {
=======
export const useWorkStatusVisibility = ({ isMobile, isVSCode }: Options): Result => {
>>>>>>> upstream/main
  const [rowNode, setRowNode] = React.useState<HTMLDivElement | null>(null);
<<<<<<< HEAD
  // Only the threshold decision is state: the chat area's width changes on
  // every frame of a sidebar animation, and storing the width itself
  // re-rendered the whole chat on each of those frames.
||||||| bc50ba56aa
  // Only the threshold decisions are state: the chat area's width changes on
  // every frame of a sidebar animation, and storing the width itself
  // re-rendered the whole chat on each of those frames.
=======
>>>>>>> upstream/main
  const [wideEnough, setWideEnough] = React.useState<boolean | null>(null);
  const rowRef = React.useCallback((node: HTMLDivElement | null) => { setRowNode(node); }, []);

  const effectiveDirectory = useEffectiveDirectory();
  const directoryKey = React.useMemo(
    () => (effectiveDirectory ? normalizeContextPanelDirectoryKey(effectiveDirectory) : ''),
    [effectiveDirectory],
  );

<<<<<<< HEAD
  // Mirrors ContextPanel's own derivation: a panel with `isOpen` but no
  // resolvable active tab renders nothing, and must not displace this panel.
||||||| bc50ba56aa
  // Mirrors ContextPanel's own derivation: a zone with `isOpen` but no
  // resolvable tab of its own renders nothing, and must not displace this
  // panel. Only the right zone shares this card's slot; the left and bottom
  // zones leave it in place.
=======
>>>>>>> upstream/main
  const contextPanelOpen = useUIStore(
    React.useCallback(
<<<<<<< HEAD
||||||| bc50ba56aa
      (state) => isZoneShown(
        directoryKey ? state.contextPanelByDirectory[directoryKey] : undefined,
        state.contextSurfaceZones,
        'right',
      ),
      [directoryKey],
    ),
  );

  // The width the right zone shows at, or opens at: its tab's width even
  // while closed, so opening it changes no threshold. An expanded zone takes
  // everything but a narrow chat column, so the card never stays beside it;
  // Files showing only its tree never expands (ContextPanel's isTreeOnly).
  const contextPanelWidth = useUIStore(
    React.useCallback(
=======
      (state) => isZoneShown(
        directoryKey ? state.contextPanelByDirectory[directoryKey] : undefined,
        state.contextSurfaceZones,
        'right',
      ),
      [directoryKey],
    ),
  );

  const contextPanelWidth = useUIStore(
    React.useCallback(
>>>>>>> upstream/main
      (state) => {
        const panel = directoryKey ? state.contextPanelByDirectory[directoryKey] : undefined;
        if (!panel?.isOpen) return false;
        const activeTab = panel.tabs.find((tab) => tab.id === panel.activeTabId)
          ?? panel.tabs[panel.tabs.length - 1]
          ?? null;
        return Boolean(activeTab);
      },
      [directoryKey],
    ),
  );

  const panelEnabled = useUIStore((state) => state.workStatusPanelEnabled);

<<<<<<< HEAD
  // Split from the switch: a narrow chat is a layout fact, and the header needs
  // it to offer the panel as an overlay instead of pretending it is off.
  const layoutAllows = !isMobile && !contextPanelOpen;

  // Measures the chat AREA — the container holding the chat and the context
  // panel together — not the chat row inside it.
  //
  // The row is what the context panel squeezes, and it squeezes it over its
  // width animation. Measuring the row therefore reported a width that was
  // still catching up while the context panel collapsed, so this panel only
  // reappeared once that number crossed the threshold: the chat widened first
  // and narrowed again afterwards. The chat area's width does not move when
  // the context panel opens, so the reading is correct the instant it closes.
  //
  // It is also the stable input the oscillation argument needs: this panel's
  // own visibility cannot change the width being measured.
||||||| bc50ba56aa
  // Measures the chat AREA — the container holding the chat and the context
  // panel together — not the chat row inside it.
  //
  // The row is what the context panel squeezes, and it squeezes it over its
  // width animation. Measuring the row therefore reported a width that was
  // still catching up while the context panel collapsed, so this panel only
  // reappeared once that number crossed the threshold: the chat widened first
  // and narrowed again afterwards. The chat area's width does not move when
  // the context panel opens, so the reading is correct the instant it closes.
  //
  // It is also the stable input the oscillation argument needs: this panel's
  // own visibility cannot change the width being measured. Nor can the context
  // panel's: its width is the user's setting, read from the store.
  const areaWidthRef = React.useRef<number | null>(null);
  const contextPanelWidthRef = React.useRef(contextPanelWidth);
  contextPanelWidthRef.current = contextPanelWidth;
  const applyAreaWidth = React.useCallback((width: number) => {
    areaWidthRef.current = width;
    setWideEnough(width >= WORK_STATUS_REQUIRED_ROW_WIDTH);
    setWideEnoughBesidePanel(width >= WORK_STATUS_REQUIRED_ROW_WIDTH + contextPanelWidthRef.current);
  }, []);

=======
  const areaWidthRef = React.useRef<number | null>(null);
  const contextPanelWidthRef = React.useRef(contextPanelWidth);
  contextPanelWidthRef.current = contextPanelWidth;
  const applyAreaWidth = React.useCallback((measured: number) => {
    areaWidthRef.current = measured;
    const width = measured + sidebarPendingWidth();
    setWideEnough(width >= WORK_STATUS_REQUIRED_ROW_WIDTH);
    setWideEnoughBesidePanel(width >= WORK_STATUS_REQUIRED_ROW_WIDTH + contextPanelWidthRef.current);
  }, []);

>>>>>>> upstream/main
  React.useEffect(() => {
    if (!rowNode || typeof ResizeObserver === 'undefined') return undefined;

    const measured = rowNode.closest<HTMLElement>('[data-chat-area]') ?? rowNode;
    setWideEnough(measured.getBoundingClientRect().width >= WORK_STATUS_REQUIRED_ROW_WIDTH);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setWideEnough(entry.contentRect.width >= WORK_STATUS_REQUIRED_ROW_WIDTH);
    });
    observer.observe(measured);
    return () => observer.disconnect();
  }, [rowNode]);

<<<<<<< HEAD
  const roomy = !isMobile && wideEnough === true;
  const fits = layoutAllows && roomy;
||||||| bc50ba56aa
  // A resized context panel or another surface in it moves the threshold, not
  // the area: re-decided from the last reading, before paint, so the slot
  // animates once to the final width.
  React.useLayoutEffect(() => {
    if (areaWidthRef.current !== null) applyAreaWidth(areaWidthRef.current);
  }, [applyAreaWidth, contextPanelWidth]);

  const roomy = !isMobile && !isVSCode && wideEnough === true;
  const roomyBesidePanel = roomy && wideEnoughBesidePanel && !contextPanelExpanded;
  // Split from the switch: a narrow chat is a layout fact, and the header needs
  // it to offer the panel as an overlay instead of pretending it is off.
  const fits = contextPanelOpen ? roomyBesidePanel : roomy;
=======
  const sidebarOpen = useUIStore((state) => panelEnabled && state.isSidebarOpen);
  React.useLayoutEffect(() => {
    if (areaWidthRef.current !== null) applyAreaWidth(areaWidthRef.current);
  }, [applyAreaWidth, contextPanelWidth, sidebarOpen]);

  const roomy = !isMobile && wideEnough === true;
  const roomyBesidePanel = roomy && wideEnoughBesidePanel && !contextPanelExpanded;
  const fits = contextPanelOpen && !isVSCode ? roomyBesidePanel : roomy;
>>>>>>> upstream/main
  const visible = panelEnabled && fits;

  return { rowRef, visible, fits, roomy };
};
