import React from 'react';
import { normalizeContextPanelDirectoryKey, useUIStore } from '@/stores/useUIStore';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { sidebarPendingWidth } from '@/components/layout/sidebarPendingWidth';
import {
  CONTEXT_ZONE_DEFAULT_WIDTH,
  isZoneShown,
  resolveZoneActiveTab,
  showsFileTreeOnly,
  sideZoneWidth,
} from '@/lib/workspace/zones';

export const WORK_STATUS_PANEL_WIDTH = 300;

const WORK_STATUS_MIN_CHAT_WIDTH = 560;

const WORK_STATUS_PANEL_GUTTER = 8 + 16;

export const WORK_STATUS_COLUMN_WIDTH = WORK_STATUS_PANEL_WIDTH + WORK_STATUS_PANEL_GUTTER;

export const WORK_STATUS_REQUIRED_ROW_WIDTH = WORK_STATUS_COLUMN_WIDTH + WORK_STATUS_MIN_CHAT_WIDTH;

type Options = {
  isMobile: boolean;
};

type Result = {
  fits: boolean;
  roomy: boolean;
  roomyBesidePanel: boolean;
  rowRef: (node: HTMLDivElement | null) => void;
  visible: boolean;
};

export const useWorkStatusVisibility = ({ isMobile }: Options): Result => {
  const [rowNode, setRowNode] = React.useState<HTMLDivElement | null>(null);
  const [wideEnough, setWideEnough] = React.useState<boolean | null>(null);
  const rowRef = React.useCallback((node: HTMLDivElement | null) => { setRowNode(node); }, []);

  const effectiveDirectory = useEffectiveDirectory();
  const directoryKey = React.useMemo(
    () => (effectiveDirectory ? normalizeContextPanelDirectoryKey(effectiveDirectory) : ''),
    [effectiveDirectory],
  );

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

  const areaWidthRef = React.useRef<number | null>(null);
  const contextPanelWidthRef = React.useRef(contextPanelWidth);
  contextPanelWidthRef.current = contextPanelWidth;
  const applyAreaWidth = React.useCallback((measured: number) => {
    areaWidthRef.current = measured;
    const width = measured + sidebarPendingWidth();
    setWideEnough(width >= WORK_STATUS_REQUIRED_ROW_WIDTH);
    setWideEnoughBesidePanel(width >= WORK_STATUS_REQUIRED_ROW_WIDTH + contextPanelWidthRef.current);
  }, []);

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

  const sidebarOpen = useUIStore((state) => panelEnabled && state.isSidebarOpen);
  React.useLayoutEffect(() => {
    if (areaWidthRef.current !== null) applyAreaWidth(areaWidthRef.current);
  }, [applyAreaWidth, contextPanelWidth, sidebarOpen]);

  const roomy = !isMobile && wideEnough === true;
  const fits = layoutAllows && roomy;
  const visible = panelEnabled && fits;

  return { rowRef, visible, fits, roomy };
};
