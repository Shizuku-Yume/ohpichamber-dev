import React from 'react';
import { normalizeContextPanelDirectoryKey, useUIStore } from '@/stores/useUIStore';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { sidebarPendingWidth } from '@/components/layout/sidebarPendingWidth';
import { useChatAreaWidth } from '@/hooks/useChatAreaWidth';
import {
  CONTEXT_ZONE_DEFAULT_WIDTH,
  isZoneShown,
  resolveZoneActiveTab,
  showsFileTreeOnly,
  sideZoneWidth,
} from '@/lib/workspace/zones';

/**
 * Fixed panel width. The panel is not user-resizable: it is an object inside
 * the chat rather than a docked pane, so it has no resizer and no persisted
 * width.
 */
export const WORK_STATUS_PANEL_WIDTH = 300;

/**
 * Minimum width the message column must keep for itself. Below this the panel
 * yields — a squeezed transcript costs more than the status it displaces.
 */
const WORK_STATUS_MIN_CHAT_WIDTH = 560;

/** The card's own horizontal margins (`ml-2` + `mr-4`). */
const WORK_STATUS_PANEL_GUTTER = 8 + 16;

/** The card's column in the right slot: the card and its margins. */
export const WORK_STATUS_COLUMN_WIDTH = WORK_STATUS_PANEL_WIDTH + WORK_STATUS_PANEL_GUTTER;

/** Row width below which the panel gives its space back to the transcript. */
export const WORK_STATUS_REQUIRED_ROW_WIDTH = WORK_STATUS_COLUMN_WIDTH + WORK_STATUS_MIN_CHAT_WIDTH;

type Options = {
  isMobile: boolean;
};

type Result = {
  /** Layout can host the panel inline, regardless of the user's switch. */
  fits: boolean;
  /**
   * The chat area is wide enough for the panel's column, whether or not the
   * context panel is open. The right slot keeps the column for the card on
   * this, so closing the context panel goes straight back to it.
   */
  roomy: boolean;
  roomyBesidePanel: boolean;
  /**
   * Attach to the flex row that contains the chat column and the panel.
   *
   * A callback ref, not an object ref: an object ref gives no signal when the
   * node attaches, so a measuring effect that reads `.current` would silently
   * observe nothing whenever the row mounts after the effect first ran, and
   * would only recover on the next unrelated dependency change.
   */
  rowRef: (node: HTMLDivElement | null) => void;
  visible: boolean;
};

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

  // Keyed exactly like the rail and the panel itself: whichever directory the
  // app is effectively on, not the directory this panel reports about. A chat
  // with no project reports on nothing, and looking the context panel up under
  // that empty key answered "closed" while it was plainly open on screen.
  const effectiveDirectory = useEffectiveDirectory();
  const directoryKey = React.useMemo(
    () => (effectiveDirectory ? normalizeContextPanelDirectoryKey(effectiveDirectory) : ''),
    [effectiveDirectory],
  );

  // Mirrors ContextPanel's own derivation: a panel with `isOpen` but no
  // resolvable active tab renders nothing, and must not displace this panel.
  const contextPanelOpen = useUIStore(
    React.useCallback(
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
      (state) => {
        const panel = directoryKey ? state.contextPanelByDirectory[directoryKey] : undefined;
        const tab = panel ? resolveZoneActiveTab(panel, state.contextSurfaceZones, 'right') : null;
        return panel && tab ? sideZoneWidth(panel, tab, 'right', state) : CONTEXT_ZONE_DEFAULT_WIDTH;
      },
      [directoryKey],
    ),
  );
  const contextPanelExpanded = useUIStore(
    React.useCallback(
      (state) => {
        const panel = directoryKey ? state.contextPanelByDirectory[directoryKey] : undefined;
        if (!panel?.expanded) return false;
        const tab = isZoneShown(panel, state.contextSurfaceZones, 'right')
          ? resolveZoneActiveTab(panel, state.contextSurfaceZones, 'right')
          : null;
        return tab !== null && !showsFileTreeOnly(panel, tab, state);
      },
      [directoryKey],
    ),
  );

  // The user's own switch, persisted to server settings, gates everything
  // before layout is even measured.
  const panelEnabled = useUIStore((state) => state.workStatusPanelEnabled);

  const sidebarOpen = useUIStore((state) => panelEnabled && state.isSidebarOpen);

  // Only the threshold decision is state: the chat area's width changes on
  // every frame of a sidebar animation, and storing the width itself
  // re-rendered the whole chat on each of those frames. `pick` re-arms the
  // measurement when the context panel width or the sidebar's pending width
  // changes, so the recompute lands on the store update, not the next resize.
  const { rowRef, width: areaFit } = useChatAreaWidth(
    React.useCallback(
      (measured) => {
        const width = measured + sidebarPendingWidth();
        return {
          wideEnough: width >= WORK_STATUS_REQUIRED_ROW_WIDTH,
          wideEnoughBesidePanel: width >= WORK_STATUS_REQUIRED_ROW_WIDTH + contextPanelWidth,
        };
      },
      [contextPanelWidth],
    ),
    React.useCallback((a, b) => a.wideEnough === b.wideEnough && a.wideEnoughBesidePanel === b.wideEnoughBesidePanel, []),
    sidebarOpen,
  );

  const wideEnough = areaFit?.wideEnough === true;
  const wideEnoughBesidePanel = areaFit?.wideEnoughBesidePanel === true;
  const roomy = !isMobile && wideEnough;
  const roomyBesidePanel = roomy && wideEnoughBesidePanel && !contextPanelExpanded;
  const fits = contextPanelOpen ? roomyBesidePanel : roomy;
  const visible = panelEnabled && fits;

  return { rowRef, visible, fits, roomy, roomyBesidePanel };
};
