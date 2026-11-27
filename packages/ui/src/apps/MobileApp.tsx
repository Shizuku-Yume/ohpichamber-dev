import { connectMobileWorkspaceOpener } from '@/lib/mobileWorkspaceTabs';
import { PluginPane } from '@/components/layout/PluginPane';
import { flushSync } from 'react-dom';
import { useGuestPages } from '@/hooks/useGuestSurfaces';
import type { MobileChangesCommitRequest } from './mobileChangesCommitRequest';
import { pluginModeFromId } from '@/lib/surfaces/modes';
import { GuestHosts } from '@/components/layout/GuestHosts';
import React from 'react';

import { Button } from '@/components/ui/button';
import { OpenChamberLogo } from '@/components/ui/OpenChamberLogo';
import { AppStartupOverlay } from '@/components/ui/AppStartupOverlay';
import { LegacyDataNotice } from '@/components/onboarding/LegacyDataNotice';
import { ChatView } from '@/components/views/ChatView';
import { PlanView } from '@/components/views/PlanView';
import { SettingsView } from '@/components/views/SettingsView';
import { AppLinkConfirmDialog } from '@/components/chat/AppLinkConfirmDialog';
import { SharedTrustConfirmDialog } from '@/components/projects/SharedTrustConfirmDialog';
import { SpaceAccessDialog } from '@/components/session/spaces/SpaceAccessDialog';
import { SpaceActionsSheet, SpaceDeleteDialog } from '@/components/session/spaces/SpaceActions';
import { SpaceApplyDialog } from '@/components/session/spaces/SpaceApplyDialog';
import { SpaceSetupOutputDialog } from '@/components/session/spaces/SpaceSetupOutput';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { RunOverview } from '@/components/multirun/RunOverview';
import { RuntimeAPIProvider } from '@/contexts/RuntimeAPIProvider';
import { useAuthSessionStore } from '@/lib/runtime-auth-expiry';
import { registerRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MobileToaster } from './MobileToaster';
import { usePushVisibilityBeacon } from '@/hooks/usePushVisibilityBeacon';
import { useRouter } from '@/hooks/useRouter';
import { useTerminalSessionKeepalive } from '@/hooks/useTerminalSessionKeepalive';
import { useWindowTitle } from '@/hooks/useWindowTitle';
import { useEnterprisePolicySync } from '@/hooks/useEnterprisePolicySync';
import { bootServerStateStores, installServerStateBootEvents } from '@/stores/serverStateBoot';
import { useRoutingSync } from '@/hooks/useRoutingSync';
import { useHostInvalidationSync } from '@/hooks/useHostInvalidationSync';
import { useSourceControlProviderSync } from '@/hooks/useSourceControlProviderSync';
import { hostFilesystem } from '@/lib/host-filesystem';
import type { RuntimeAPIs } from '@/lib/api/types';
import type { ProjectRef } from '@/lib/projectContextApi';
import { readTabletLayout, useOrientation, useTabletLayout } from '@/lib/device';
import { useHardwareKeyboard } from '@/lib/hardwareKeyboard';
import { useI18n } from '@/lib/i18n';
import { isOpenchamberEventsReconnecting, markOpenchamberEventsUnreachable, retryOpenchamberEventsNow, subscribeOpenchamberEvents, subscribeOpenchamberEventsConnection } from '@/lib/openchamberEvents';
import { getRuntimeApiBaseUrl, getRuntimeKey, subscribeRuntimeEndpointChanged, switchRuntimeEndpoint, MOBILE_DISCONNECTED_RUNTIME_KEY } from '@/lib/runtime-switch';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useAuthoritativeSessionCleanup } from '@/components/session/sidebar/list/useAuthoritativeSessionCleanup';
import { beginLastSessionRestore } from '@/sync/last-session-restore';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { toast } from '@/components/ui';
import { canonicalClient } from '@/api/canonicalClient';
import { fileNameOf, sessionLineage } from './mobileFileRequest';
import { useSourceControlAuthStore } from '@/stores/useSourceControlAuthStore';
import { useSourceControlProviderRegistry } from '@/lib/source-control/providers/registry';
import { refreshTrackers } from '@/stores/useTrackerAuthStore';
import { useGitStore } from '@/stores/useGitStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import {
  listProjectWorktrees,
  partitionWorktreesByRegisteredProject,
  worktreeMapsEqual,
} from '@/lib/worktrees/worktreeManager';
import { refreshWorktreeTopologyForChange } from '@/lib/worktrees/worktreeTopologyRefresh';
import { useUIStore } from '@/stores/useUIStore';
import { useChatWidthAttribute } from '@/hooks/useChatWidthAttribute';
import { closeTopmostBackLayer } from '@/lib/mobileBackLayers';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { SyncProvider } from '@/sync/sync-context';

import { SyncAppEffects } from './AppEffects';
import type { MobileChangesInitialDiff } from '@/hooks/useMobileChangesNavigation';
import { BusyDots } from '@/components/chat/message/parts/BusyDots';
import { MobileConnectionWelcome, type MobileConnectionNotice } from './MobileConnectionWelcome';
import { MobileHeader } from './MobileHeader';
import { MobileInstancesSurface } from './MobileInstancesSurface';
import { MobileSessionsSheet } from './MobileSessionsSheet';
import { MobileFullscreenSurface } from './MobileFullscreenSurface';
import { UsageStatsView } from '@/components/views/usage/UsageStatsView';
import { ArchiveSessionsView } from '@/components/views/ArchiveView';
import { MobileSourceBoard } from '@/components/sourceBoard/SourceBoardView';
import { ScheduledTasksView, type ScheduledTasksLeaveReason } from '@/components/session/ScheduledTasksDialog';
import { MobileWorkspaceDrawer } from './MobileWorkspaceDrawer';
import { shownMobileWorkspaceTabs, type MobileWorkspaceTab } from '@/lib/mobileWorkspaceTabs';
import { DedicatedMobileAppProvider, useMobileSettingsSurfaceOpener, type MobileAppActions } from './mobileAppContext';
import { connectMobileSettingsNavigation, MOBILE_SETTINGS_PAGES } from './mobileSettingsNavigation';
import { autoConnectLastInstance, getAutoConnectTargetLabel, logMobileConnectEvent, reprobeActiveConnection, suppressAutoConnectUntilManualConnect, type AutoConnectOutcome } from './mobileConnections';
import { subscribeActiveRelayTunnelStatus } from '@/lib/relay/runtime-tunnel';
import { isRelayLimitReached } from '@/lib/relay/tunnel-client';
import { isCapacitorMobileApp, useMobileWebBackButton, useMobileBackHandlers, useAndroidParentSessionBack, useNativeMobileChrome, useNativeMobileLifecycle } from './mobileNativeChrome';
import { reconnectAppForTransportSwitch, resetAppForRuntimeEndpointChange } from './runtimeEndpointReset';
import { retryNativeResumeConnection } from './mobileResumeRetry';
import { useAppFontEffects } from './useAppFontEffects';
import { useFontsReady } from './useFontsReady';
import { useDeepLinkHandlers, useDeepLinkSource } from './deepLinkNavigation';
import { useMobilePairingConfirmation } from './useMobilePairingConfirmation';
import { useEdgeSwipe } from './useEdgeSwipe';
import { useNativeShellIntegration } from './useNativeShellIntegration';
import { IpadSidebarResizeHandle } from './IpadSidebarResizeHandle';
import {
  IPAD_LEFT_SIDEBAR_WIDTH,
  IPAD_RIGHT_SIDEBAR_WIDTH,
  IPAD_WORKSPACE_SIDEBAR_MAX_WIDTH,
  useIpadSidebarResize,
} from './ipadSidebarResize';

import { focusChatInput } from '@/components/chat/composer/editor/dom';

const ReceivedPagePanel = React.lazy(() => import('@/components/chat/sharePages/received/ReceivedPagePanel').then((module) => ({ default: module.ReceivedPagePanel })));

type MobileAppProps = {
  apis: RuntimeAPIs;
};

const NATIVE_RESUME_SYNC_EVENT_THROTTLE_MS = 1_000;

/** The fullscreen app-level surfaces, reachable from the sessions drawer
    footer. Exactly one can be open at a time — opening another replaces it,
    closing returns to the chat. The sessions drawer and the workspace drawer
    (Changes / Files / Terminal / Notes / MCP) are separate layers. */
type MobileSurface = 'archive' | 'board' | 'instances' | 'scheduled' | 'settings' | 'usage';

const MobileShell: React.FC<{ reconnecting: boolean; onActiveConnectionDeleted: () => void }> = ({ reconnecting, onActiveConnectionDeleted }) => {
  const { t } = useI18n();
  // The mobile root does not mount MainLayout, so it owns its own terminal
  // keepalive: without it, background PTYs (running project actions included)
  // are idle-reaped by the server while the workspace drawer is closed.
  useTerminalSessionKeepalive();
  const [sessionsSheetOpen, setSessionsSheetOpen] = React.useState(false);
  React.useEffect(() => useSessionUIStore.subscribe((state, prev) => {
    if (state.currentSessionId && state.currentSessionId !== prev.currentSessionId) {
      useUIStore.getState().setRunOverviewKey(null);
    }
  }), []);
  const runOverviewOpen = useUIStore((state) => state.runOverviewKey !== null);
  React.useEffect(() => {
    if (runOverviewOpen) setSessionsSheetOpen(false);
  }, [runOverviewOpen]);
  const [activeSurface, setActiveSurface] = React.useState<MobileSurface | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = React.useState(false);
  const [workspaceTab, setWorkspaceTab] = React.useState<MobileWorkspaceTab>(() => {
    const { mobileWorkspaceTabOrder, mobileWorkspaceHiddenTabs } = useUIStore.getState();
    return shownMobileWorkspaceTabs(mobileWorkspaceTabOrder, mobileWorkspaceHiddenTabs)[0];
  });
  // A plan opened from the workspace drawer's Notes tab, shown as a fullscreen
  // layer on top of it (back returns to the notes).
  const [openPlan, setOpenPlan] = React.useState<{ id: string; title: string; projectRef: ProjectRef } | null>(null);
  const [openReceivedPage, setOpenReceivedPage] = React.useState<{ receivedId: string; title: string } | null>(null);

  const [settingsInitialMobileStage, setSettingsInitialMobileStage] = React.useState<'nav' | 'page-content'>('nav');
  // When set, the Changes surface opens directly into the per-file diff for this path.
  const [changesRequest, setChangesRequest] = React.useState<
    { diff: { path: string; staged: boolean; scope?: 'turn' } } | { commit: MobileChangesCommitRequest } | null
  >(null);
  const pendingChangesDiff = changesRequest && 'diff' in changesRequest ? changesRequest.diff : null;
  const pendingChangesCommit = changesRequest && 'commit' in changesRequest ? changesRequest.commit : null;
  const openGuestPageId = useUIStore((state) => state.openGuestPageId);
  const guestPages = useGuestPages();
  const guestPage = guestPages.find((guest) => guest.id === openGuestPageId) ?? null;
  const closeGuestPage = React.useCallback(() => useUIStore.getState().setOpenGuestPage(null), []);
  React.useEffect(() => {
    if (openGuestPageId && !guestPage) closeGuestPage();
  }, [closeGuestPage, guestPage, openGuestPageId]);
  const setSettingsPage = useUIStore((state) => state.setSettingsPage);
  const showCapacitorOnlyFeatures = React.useMemo(() => isCapacitorMobileApp(), []);

  const closeSurface = React.useCallback(() => {
    setActiveSurface(null);
    setOpenPlan(null);
  }, []);

  const openSurface = React.useCallback((surface: MobileSurface) => {
    setActiveSurface(surface);
  }, []);

  const closeWorkspace = React.useCallback(() => {
    setWorkspaceOpen(false);
  }, []);

  const openSettingsSurface = useMobileSettingsSurfaceOpener(setSettingsInitialMobileStage, openSurface);

  // Shared entry points still ask for the Settings dialog; the phone opens its surface instead.
  React.useEffect(
    () => connectMobileSettingsNavigation(MOBILE_SETTINGS_PAGES, openSettingsSurface),
    [openSettingsSurface],
  );

  // Tablet: sessions live in a persistent full-height left sidebar instead of
  // the phone's drawer. Everything else — the workspace drawer, the header, the
  // app-level surfaces — is shared with phones.
  //
  // A SIZE class, not a device check: an unfolded book foldable is a tablet
  // until it is folded shut, and the shell keeps running across that change.
  const { enabled: isTabletLayout, roomyForPanels } = useTabletLayout();
  const orientation = useOrientation();
  const isPortrait = orientation === 'portrait';
  const hasHardwareKeyboard = useHardwareKeyboard();
  const [sidebarOpen, setSidebarOpen] = React.useState(() => readTabletLayout().roomyForPanels);

  const toggleSidebar = React.useCallback(() => {
    setSidebarOpen((current: boolean) => !current);
  }, []);

  // Folding shut (or losing the room for a side-by-side layout) must not leave
  // a sidebar open over a phone-width screen.
  React.useEffect(() => {
    if (!isTabletLayout) setSidebarOpen(false);
  }, [isTabletLayout]);

  const openFilesSurface = React.useCallback(() => {
    setChangesRequest(null);
    setWorkspaceTab('files');
    setWorkspaceOpen(true);
  }, []);

  React.useEffect(() => subscribeOpenchamberEvents((event) => {
    if (event.type !== 'file-open-request') return;
    const directory = event.directory ?? useDirectoryStore.getState().currentDirectory;
    if (!directory) return;
    const showFile = () => {
      useUIStore.getState().openContextFile(directory, event.path);
      openFilesSurface();
    };
    const sessionId = event.sessionId;
    if (!sessionId) {
      showFile();
      return;
    }
    const readSession = async (id: string) => useGlobalSessionsStore.getState().entityById.get(id)
      ?? (await canonicalClient.getSession(id).catch(() => null))?.session ?? null;
    void sessionLineage(sessionId, readSession).then((lineage) => {
      const isViewed = () => {
        const { currentSessionId } = useSessionUIStore.getState();
        return currentSessionId === sessionId || lineage.some((session) => session.sessionId === currentSessionId);
      };
      if (isViewed()) {
        showFile();
        return;
      }
      const title = lineage[0]?.title;
      toast.info(fileNameOf(event.path), {
        id: `file-open-${sessionId}:${event.path}`,
        description: title
          ? t('chat.fileOpenRequest.toast.description', { session: title })
          : t('chat.fileOpenRequest.toast.descriptionUntitled'),
        action: {
          label: t('chat.fileOpenRequest.toast.openSession'),
          onClick: () => {
            useUIStore.getState().closeMainSurfaces();
            if (isTabletLayout) setSidebarOpen(true);
            else setSessionsSheetOpen(true);
            void useSessionUIStore.getState().setCurrentSession(sessionId, directory);
            closeSurface();
            // A folder waiting for the user's trust switches later or never, and
            // the drawer of the session still on screen must not get the file.
            if (isViewed()) showFile();
          },
        },
      });
    });
  }), [closeSurface, isTabletLayout, openFilesSurface, t]);

  const openChangesSurface = React.useCallback((diff: MobileChangesInitialDiff | null = null) => {
    setChangesRequest(diff ? { diff } : null);
    setWorkspaceTab('changes');
    setWorkspaceOpen(true);
  }, []);

  React.useEffect(() => connectMobileWorkspaceOpener((request) => {
    useUIStore.getState().setOpenGuestPage(null);
    if (request.tab === 'changes' && request.commit) {
      setChangesRequest({ commit: { scope: 'commit', directory: request.commit.directory } });
    }
    setWorkspaceTab(request.tab);
    setWorkspaceOpen(true);
  }), []);

  const leftResize = useIpadSidebarResize('left', 'openchamber.ipad.leftSidebarWidth', IPAD_LEFT_SIDEBAR_WIDTH);
  const rightResize = useIpadSidebarResize(
    'right',
    'openchamber.ipad.rightSidebarWidth',
    IPAD_RIGHT_SIDEBAR_WIDTH,
    IPAD_WORKSPACE_SIDEBAR_MAX_WIDTH,
  );
  // The workspace becomes a real side panel only where the screen can host the
  // sidebar, the panel AND a readable chat at once. Everywhere else — a tablet
  // in portrait, and an unfolded foldable in EITHER orientation, since its long
  // side is barely wider than a tablet's short one — it stays the full-cover
  // drawer, which is the layout that actually works at that width.
  const workspaceAsPanel = roomyForPanels;
  const workspacePanelWidth = workspaceAsPanel && workspaceOpen ? rightResize.width : 0;
  const sidebarWidth = isTabletLayout && sidebarOpen ? leftResize.width : 0;

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--oc-chat-inset-left', `${sidebarWidth}px`);
    root.style.setProperty('--oc-chat-inset-right', `${workspacePanelWidth}px`);
    return () => {
      root.style.removeProperty('--oc-chat-inset-left');
      root.style.removeProperty('--oc-chat-inset-right');
    };
  }, [sidebarWidth, workspacePanelWidth]);

  useChatWidthAttribute();

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    const keep = isTabletLayout && (isPortrait || hasHardwareKeyboard);
    const root = document.documentElement;
    root.classList.toggle('oc-keep-draft-starters', keep);
    return () => root.classList.remove('oc-keep-draft-starters');
  }, [hasHardwareKeyboard, isTabletLayout, isPortrait]);

  const mobileActions = React.useMemo<MobileAppActions>(
    () => ({
      openChanges: ({ diffPath, staged, scope, turnId, sessionId, directory } = {}) => {
        openChangesSurface(diffPath ? { path: diffPath, staged: staged === true, scope, turnId, sessionId, directory } : null);
      },
      openFiles: () => openFilesSurface(),
      openPlan: setOpenPlan,
      openReceivedPage: setOpenReceivedPage,
      openSettings: () => openSettingsSurface('nav'),
      openSourceBoard: () => openSurface('board'),
    }),
    [openChangesSurface, openFilesSurface, openSettingsSurface, openSurface],
  );

  const deepLinkHandlers = React.useMemo(
    () => ({
      openSessions: () => {
        if (isTabletLayout) setSidebarOpen(true);
        else setSessionsSheetOpen(true);
      },
      openView: (target: 'files' | 'mcp' | 'instances') => {
        if (target === 'files') {
          openFilesSurface();
          return;
        }
        if (target === 'mcp') {
          setWorkspaceTab('status');
          setWorkspaceOpen(true);
          return;
        }
        openSurface(target);
      },
      openChanges: ({ path, staged }: { path?: string; staged?: boolean } = {}) => {
        openChangesSurface(path ? { path, staged: staged === true } : null);
      },
      openSettings: (section?: string) => {
        if (section) setSettingsPage(section as Parameters<typeof setSettingsPage>[0]);
        openSettingsSurface(section ? 'page-content' : 'nav');
      },
    }),
    [isTabletLayout, openChangesSurface, openFilesSurface, openSettingsSurface, openSurface, setSettingsPage],
  );
  useDeepLinkHandlers(deepLinkHandlers);

  const chatMainRef = React.useRef<HTMLElement>(null);
  useEdgeSwipe(chatMainRef, {
    onLeftEdgeSwipe: () => {
      if (isTabletLayout) setSidebarOpen(true);
      else setSessionsSheetOpen(true);
    },
    onRightEdgeSwipe: () => setWorkspaceOpen(true),
  });

  const { settingsBackRef, previewBackRef, parentSessionBackRef, registerSettingsBackHandler, registerPreviewBackHandler, registerParentSessionBack } = useMobileBackHandlers();
  const workspaceBackRef = React.useRef<(() => boolean) | null>(null);
  const registerWorkspaceBackHandler = React.useCallback((handler: (() => boolean) | null) => {
    workspaceBackRef.current = handler;
  }, []);


  const handleNativeBack = React.useCallback(() => {
    if (closeTopmostBackLayer()) {
      return true;
    }
    if (openReceivedPage) {
      setOpenReceivedPage(null);
      return true;
    }
    if (openPlan) {
      setOpenPlan(null);
      return true;
    }
    if (guestPage) {
      closeGuestPage();
      return true;
    }
    if (activeSurface === 'settings' && settingsBackRef.current?.()) {
      return true;
    }
    if (activeSurface) {
      closeSurface();
      return true;
    }
    if (workspaceOpen) {
      if (previewBackRef.current?.()) return true;
      if (workspaceBackRef.current?.()) return true;
      closeWorkspace();
      return true;
    }
    if (sessionsSheetOpen) {
      setSessionsSheetOpen(false);
      return true;
    }
    return false;
  }, [activeSurface, closeGuestPage, closeSurface, closeWorkspace, guestPage, openPlan, openReceivedPage, sessionsSheetOpen, workspaceOpen, settingsBackRef, previewBackRef]);

  useAndroidParentSessionBack(handleNativeBack, parentSessionBackRef);

  useMobileWebBackButton(handleNativeBack, Boolean(openPlan || openReceivedPage || guestPage || activeSurface || workspaceOpen || sessionsSheetOpen));

  // Tablets pack the app-level pages (settings, instances, a plan) into a
  // centered dialog instead of covering the whole screen.
  const surfaceVariant = isTabletLayout ? 'dialog' as const : 'fullscreen' as const;

  // App-level footer of the sessions list — the same on a phone drawer and a
  // tablet sidebar: connected instance, settings and the app-level pages.
  const sessionsFooter = React.useMemo(
    () => ({
      instanceLabel: showCapacitorOnlyFeatures ? getAutoConnectTargetLabel() : null,
      onOpenInstances: showCapacitorOnlyFeatures ? () => openSurface('instances') : undefined,
      onOpenSettings: () => openSettingsSurface('nav'),
      onOpenUsage: () => openSurface('usage'),
      onOpenScheduled: () => openSurface('scheduled'),
      onOpenArchive: () => openSurface('archive'),
      onOpenSourceBoard: () => openSurface('board'),
    }),
    [openSettingsSurface, openSurface, showCapacitorOnlyFeatures],
  );

  const leaveScheduledTasks = React.useCallback((reason: ScheduledTasksLeaveReason) => {
    closeSurface();
    setSessionsSheetOpen(false);
    if (reason === 'file') openFilesSurface();
  }, [closeSurface, openFilesSurface]);

  const leaveSourceBoard = React.useCallback(() => {
    closeSurface();
    setSessionsSheetOpen(false);
  }, [closeSurface]);

  // An opened archived session replaces the page: back to the chat, the same
  // way picking a session from the list gives the space back.
  const leaveArchive = React.useCallback(() => {
    closeSurface();
    setSessionsSheetOpen(false);
    if (isTabletLayout && !roomyForPanels) setSidebarOpen(false);
  }, [closeSurface, isTabletLayout, roomyForPanels]);

  const reconnectBanner = reconnecting ? (
    <p role="status" className="shrink-0 border-b border-border/60 bg-muted/40 px-3 py-2 text-center typography-ui-label text-status-warning">
      {t('contextPanel.surface.status.reconnecting')}
    </p>
  ) : null;
  const workspaceCoversChat = workspaceOpen && !workspaceAsPanel;

  return (
    <DedicatedMobileAppProvider actions={mobileActions}>
      <div
        className="oc-mobile-app-shell main-content-safe-area flex h-[100dvh] flex-row bg-background text-foreground"
        data-page-scroll-lock="true"
      >
        {/* The notice lives inside the shell: its Providers action must also switch
            the app-level surface, or SettingsView never mounts on mobile. */}
        <LegacyDataNotice onOpenSettings={openSettingsSurface} />
        {/* iPad: persistent full-height sessions sidebar; the chat column and
            its header butt against it (iPadOS-style split layout). Always
            mounted so open/close animates width, same as the desktop Sidebar. */}
        {isTabletLayout ? (
          <aside
            ref={leftResize.asideRef}
            className={cn(
              // bg-background, not bg-sidebar: the session/worktree/project
              // rows are opaque bg-background (the swipe actions live under
              // them), so a tinted sidebar would show through as row-shaped
              // bands. Same surface as the phone drawer.
              'relative flex h-full shrink-0 flex-col overflow-hidden border-r border-border/70 bg-background will-change-[width] motion-reduce:transition-none',
              !sidebarOpen && 'border-r-0',
            )}
            style={{
              width: sidebarOpen ? leftResize.width : 0,
              minWidth: sidebarOpen ? leftResize.width : 0,
              maxWidth: sidebarOpen ? leftResize.width : 0,
              ['--oc-ipad-sidebar-width' as string]: `${leftResize.width}px`,
              overflowX: 'clip',
              paddingTop: 'var(--oc-safe-area-top, 0px)',
              transitionProperty: leftResize.isResizing ? 'none' : 'width, min-width, max-width',
              transitionDuration: '200ms',
              transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            inert={!sidebarOpen}
            data-page-scroll-lock="true"
          >
            <div
              className={cn(
                'flex h-full shrink-0 flex-col transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                leftResize.isResizing && 'pointer-events-none',
                !sidebarOpen && 'pointer-events-none select-none opacity-0',
              )}
              style={{ width: 'var(--oc-ipad-sidebar-width)', overflowX: 'hidden' }}
            >
              <ErrorBoundary>
                <MobileSessionsSheet
                  open
                  variant="sidebar"
                  onOpenChange={(value) => {
                    if (!value && !roomyForPanels) setSidebarOpen(false);
                  }}
                  footer={sessionsFooter}
                />
              </ErrorBoundary>
            </div>
            {sidebarOpen ? (
              <IpadSidebarResizeHandle
                side="left"
                isResizing={leftResize.isResizing}
                ariaLabel={t('sidebar.resize.leftPanelAria')}
                handleProps={leftResize.handleProps}
              />
            ) : null}
          </aside>
        ) : null}

        <div className="flex h-full min-w-0 flex-1 flex-col" data-page-scroll-lock="true">
          <MobileHeader
            onOpenSessions={() => (isTabletLayout ? toggleSidebar() : setSessionsSheetOpen(true))}
            onOpenWorkspace={() => setWorkspaceOpen(true)}
            compactTitle={isTabletLayout}
          />
          {workspaceCoversChat ? null : reconnectBanner}
          <main ref={chatMainRef} className="relative min-h-0 flex-1 overflow-hidden" data-page-scroll-lock="true">
            <div className="h-full w-full">
              <ErrorBoundary>
                <ChatView registerParentSessionBack={registerParentSessionBack} />
              </ErrorBoundary>
            </div>
            <ErrorBoundary><RunOverview /></ErrorBoundary>
          </main>
        </div>

        {!isTabletLayout ? (
          <MobileSessionsSheet
            open={sessionsSheetOpen}
            onOpenChange={setSessionsSheetOpen}
            footer={sessionsFooter}
          />
        ) : null}

        <aside
          ref={rightResize.asideRef}
          className={cn(
            'relative flex h-full shrink-0 flex-col overflow-hidden border-l border-border/70 bg-background will-change-[width] motion-reduce:transition-none',
            !workspacePanelWidth && 'border-l-0',
          )}
          style={{
            width: workspacePanelWidth,
            minWidth: workspacePanelWidth,
            maxWidth: workspacePanelWidth,
            ['--oc-ipad-sidebar-width' as string]: `${rightResize.width}px`,
            overflowX: 'clip',
            paddingTop: 'var(--oc-safe-area-top, 0px)',
            transitionProperty: rightResize.isResizing ? 'none' : 'width, min-width, max-width',
            transitionDuration: '200ms',
            transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          inert={!workspacePanelWidth}
          data-page-scroll-lock="true"
        >
          <div
            className={cn(
              'flex h-full min-h-0 shrink-0 flex-col transition-opacity duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
              rightResize.isResizing && 'pointer-events-none',
              !workspacePanelWidth && 'pointer-events-none select-none opacity-0',
            )}
            style={{ width: 'var(--oc-ipad-sidebar-width)', overflowX: 'hidden' }}
          >
            <ErrorBoundary>
              <MobileWorkspaceDrawer
                open={workspaceOpen}
                onClose={closeWorkspace}
                registerBackHandler={registerWorkspaceBackHandler}
                tab={workspaceTab}
                onTabChange={setWorkspaceTab}
                registerPreviewBackHandler={registerPreviewBackHandler}
                pendingChangesDiff={pendingChangesDiff}
                pendingChangesCommit={pendingChangesCommit}
                onOpenPlan={setOpenPlan}
                onOpenReceivedPage={setOpenReceivedPage}
                variant={workspaceAsPanel ? 'panel' : 'drawer'}
                reconnectBanner={workspaceCoversChat ? reconnectBanner : null}
              />
            </ErrorBoundary>
          </div>
          {workspacePanelWidth ? (
            <IpadSidebarResizeHandle
              side="right"
              isResizing={rightResize.isResizing}
              ariaLabel={t('sidebar.resize.rightPanelAria')}
              handleProps={rightResize.handleProps}
            />
          ) : null}
        </aside>

        {openPlan ? (
          <MobileFullscreenSurface
            open
            variant={surfaceVariant}
            onClose={() => setOpenPlan(null)}
            ariaLabel={openPlan.title}
            title={openPlan.title}
          >
            <ErrorBoundary>
              <PlanView
                savedProjectPlan={{ projectRef: openPlan.projectRef, planId: openPlan.id }}
                onNavigatedToChat={() => {
                  closeSurface();
                  closeWorkspace();
                }}
              />
            </ErrorBoundary>
          </MobileFullscreenSurface>
        ) : null}

        {openReceivedPage ? (
          <MobileFullscreenSurface
            open
            variant={surfaceVariant}
            onClose={() => setOpenReceivedPage(null)}
            ariaLabel={openReceivedPage.title}
            title={openReceivedPage.title}
          >
            <ErrorBoundary>
              <React.Suspense fallback={null}>
                <ReceivedPagePanel
                  receivedId={openReceivedPage.receivedId}
                  onAddedToChat={() => {
                    flushSync(() => {
                      setOpenReceivedPage(null);
                      closeWorkspace();
                    });
                    const pill = document.querySelector<HTMLElement>('[data-composer-morph-prompt="true"]');
                    if (pill) pill.click();
                    else focusChatInput();
                  }}
                />
              </React.Suspense>
            </ErrorBoundary>
          </MobileFullscreenSurface>
        ) : null}

        {guestPage ? (
          <MobileFullscreenSurface
            open
            variant={surfaceVariant}
            dialogAlign="app"
            onClose={closeGuestPage}
            ariaLabel={guestPage.pageTitle ?? guestPage.name}
            title={guestPage.pageTitle ?? guestPage.name}
            disableEscapeDismiss
          >
            <ErrorBoundary>
              <React.Suspense fallback={null}>
                <PluginPane key={guestPage.id} mode={pluginModeFromId(guestPage.id)} surface="page" />
              </React.Suspense>
            </ErrorBoundary>
          </MobileFullscreenSurface>
        ) : null}

        <ErrorBoundary><GuestHosts /></ErrorBoundary>

        {activeSurface === 'instances' && showCapacitorOnlyFeatures ? (
          <MobileFullscreenSurface
            open
            variant={surfaceVariant}
            dialogAlign="app"
            onClose={closeSurface}
            ariaLabel={t('mobile.menu.instances')}
            title={t('mobile.menu.instances')}
          >
            <MobileInstancesSurface
              onConnect={closeSurface}
              onActiveConnectionDeleted={onActiveConnectionDeleted}
            />
          </MobileFullscreenSurface>
        ) : null}

        {activeSurface === 'settings' ? (
          <MobileFullscreenSurface
            open
            variant={surfaceVariant}
            dialogAlign="app"
            onClose={closeSurface}
            ariaLabel={t('mobile.menu.settings')}
            headerless
          >
            <ErrorBoundary>
              <SettingsView
                forceMobile
                isWindowed
                initialMobileStage={settingsInitialMobileStage}
                registerBackHandler={registerSettingsBackHandler}
                visiblePageSlugs={[...MOBILE_SETTINGS_PAGES]}
                onClose={closeSurface}
              />
            </ErrorBoundary>
          </MobileFullscreenSurface>
        ) : null}

        {activeSurface === 'usage' ? (
          <MobileFullscreenSurface
            open
            variant={surfaceVariant}
            dialogAlign="app"
            onClose={closeSurface}
            ariaLabel={t('usageStats.title')}
            title={t('usageStats.title')}
          >
            <ErrorBoundary>
              <UsageStatsView />
            </ErrorBoundary>
          </MobileFullscreenSurface>
        ) : null}

        {activeSurface === 'scheduled' ? (
          <MobileFullscreenSurface
            open
            variant={surfaceVariant}
            dialogAlign="app"
            onClose={closeSurface}
            ariaLabel={t('sessions.scheduledTasks.dialog.title')}
            title={t('sessions.scheduledTasks.dialog.title')}
          >
            <ErrorBoundary>
              <ScheduledTasksView layout="mobile" onLeave={leaveScheduledTasks} />
            </ErrorBoundary>
          </MobileFullscreenSurface>
        ) : null}

        {activeSurface === 'board' ? (
          <MobileFullscreenSurface
            open
            variant={surfaceVariant}
            dialogAlign="app"
            onClose={closeSurface}
            ariaLabel={t('sourceBoard.title')}
            title={t('sourceBoard.title')}
          >
            <ErrorBoundary>
              <MobileSourceBoard onLeave={leaveSourceBoard} onClose={closeSurface} />
            </ErrorBoundary>
          </MobileFullscreenSurface>
        ) : null}

        {activeSurface === 'archive' ? (
          <MobileFullscreenSurface
            open
            variant={surfaceVariant}
            dialogAlign="app"
            onClose={closeSurface}
            ariaLabel={t('sessions.archivePage.title')}
            title={t('sessions.archivePage.title')}
          >
            <ErrorBoundary>
              <ArchiveSessionsView layout="mobile" onLeave={leaveArchive} />
            </ErrorBoundary>
          </MobileFullscreenSurface>
        ) : null}

      </div>
    </DedicatedMobileAppProvider>
  );
};

type MobileAppContentProps = MobileAppProps & {
  connectionEpoch: number;
  setConnectionEpoch: React.Dispatch<React.SetStateAction<number>>;
  onPairing?: Parameters<typeof useDeepLinkSource>[0]['onPairing'];
};

function MobileAppContent({ apis, connectionEpoch, setConnectionEpoch, onPairing }: MobileAppContentProps) {
  const isolatedSpacesEnabled = useUIStore((state) => state.isolatedSpacesEnabled);
  const { t } = useI18n();
  const initializeApp = useConfigStore((state) => state.initializeApp);
  const isInitialized = useConfigStore((state) => state.isInitialized);
  const isConnected = useConfigStore((state) => state.isConnected);
  const connectionPhase = useConfigStore((state) => state.connectionPhase);
  const providersLoaded = useConfigStore((state) => state.providersLoaded);
  const loadProviders = useConfigStore((state) => state.loadProviders);
  const loadAgents = useAgentsStore((state) => state.loadAgents);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const error = useSessionUIStore((state) => state.error);
  const clearError = useSessionUIStore((state) => state.clearError);
  const setIsMobile = useUIStore((state) => state.setIsMobile);
  const refreshSourceControlAuth = useSourceControlAuthStore((state) => state.refreshAll);
  const refreshSourceControlProviders = useSourceControlProviderRegistry((state) => state.refresh);
  const projects = useProjectsStore((state) => state.projects);
  // The mobile shell has no layout-level session list sync, so a lost
  // `session.deleted` is reconciled here from the same complete global
  // active+archived snapshots, refreshed whenever the sessions sheet opens.
  const globalActiveSessions = useGlobalSessionsStore((state) => state.activeSessions);
  const globalArchivedSessions = useGlobalSessionsStore((state) => state.archivedSessions);
  const hasAuthoritativeGlobalSessions = useGlobalSessionsStore((state) => state.status === 'ready');
  const cleanupSessions = React.useMemo(
    () => [...globalActiveSessions, ...globalArchivedSessions],
    [globalActiveSessions, globalArchivedSessions],
  );
  useAuthoritativeSessionCleanup({ hasAuthoritativeGlobalSessions, sessions: cleanupSessions });
  const [runtimeEndpointEpoch, setRuntimeEndpointEpoch] = React.useState(0);
  const [showConnectionRecovery, setShowConnectionRecovery] = React.useState(false);
  const [autoConnectPhase, setAutoConnectPhase] = React.useState<'pending' | 'attempting' | 'done'>('pending');
  const [autoConnectNotice, setAutoConnectNotice] = React.useState<MobileConnectionNotice | null>(null);
  const autoConnectLabel = React.useMemo(() => getAutoConnectTargetLabel(), []);
  const [, bumpTransportSwitch] = React.useReducer((count: number) => count + 1, 0);
  const isNativeMobileApp = React.useMemo(() => isCapacitorMobileApp(), []);
  const eventStreamReconnecting = React.useSyncExternalStore(subscribeOpenchamberEventsConnection, isOpenchamberEventsReconnecting, () => false);
  const lastNativeResumeSyncEventAtRef = React.useRef(0);
  const nativeResumeValidationSeqRef = React.useRef(0);

  const handleNativeResume = React.useCallback(() => {
    const apiBaseUrl = getRuntimeApiBaseUrl();
    const runtimeKey = getRuntimeKey();
    const validationSeq = nativeResumeValidationSeqRef.current + 1;
    nativeResumeValidationSeqRef.current = validationSeq;
    const isCurrentValidation = () => nativeResumeValidationSeqRef.current === validationSeq
      && getRuntimeKey() === runtimeKey && getRuntimeApiBaseUrl() === apiBaseUrl;

    if (!apiBaseUrl) {
      logMobileConnectEvent('resume:auto-connect', {});
      void autoConnectLastInstance();
      return;
    }
    logMobileConnectEvent('resume:reprobe', {});

    const refreshInPlace = () => {
      retryOpenchamberEventsNow();
      void initializeApp();
      void refreshSourceControlProviders(apis.sourceControl);
      void refreshSourceControlAuth(apis.sourceControl, { force: true });
      void refreshTrackers(apis.trackers);
      if (!providersLoaded) void loadProviders({ source: 'mobileApp:nativeResume' });
      void loadAgents(useDirectoryStore.getState().currentDirectory);
    };
    const disconnect = (reason: string, noticeKind?: MobileConnectionNotice['kind']) => {
      if (noticeKind) setAutoConnectNotice({ kind: noticeKind, label: getAutoConnectTargetLabel() ?? '' });
      logMobileConnectEvent('resume:disconnect', { reason });
      switchRuntimeEndpoint({ apiBaseUrl: '', clientToken: null, runtimeKey: MOBILE_DISCONNECTED_RUNTIME_KEY });
      setConnectionEpoch((value) => value + 1);
    };

    void reprobeActiveConnection().then((outcome) => {
      if (!isCurrentValidation()) return;
      if (outcome === 'no-connection') {
        disconnect('no-connection');
        return;
      }
      if (outcome === 'needs-login') {
        // Token explicitly rejected (revoked/expired) — tell the user why they
        // land back on the connect screen instead of silently bouncing them.
        disconnect('needs-login', 'auth-expired');
        return;
      }
      if (outcome === 'relay-limit') {
        // The relay refused this device over its limits. The parked tunnel
        // makes no attempt of its own, so the grace ladder below would only
        // keep the user on a frozen session. The connect screen says why;
        // tapping the instance, or the next resume/online, tries again.
        disconnect('relay-limit', 'relay-limit');
        return;
      }
      if (outcome === 'unreachable') {
        markOpenchamberEventsUnreachable();
        void retryNativeResumeConnection({ reprobe: reprobeActiveConnection, isCurrent: isCurrentValidation, refreshInPlace, disconnect });
        return;
      }
      if (outcome === 'switched') return;

      refreshInPlace();
    });

    const now = Date.now();
    if (now - lastNativeResumeSyncEventAtRef.current >= NATIVE_RESUME_SYNC_EVENT_THROTTLE_MS) {
      lastNativeResumeSyncEventAtRef.current = now;
      window.dispatchEvent(new Event('openchamber:system-resume'));
    }
  }, [apis.sourceControl, apis.trackers, initializeApp, loadAgents, loadProviders, providersLoaded, refreshSourceControlAuth, refreshSourceControlProviders, setConnectionEpoch]);

  useNativeMobileChrome();
  useNativeMobileLifecycle(handleNativeResume);

  // The runtime tunnel can be refused over the relay's limits on a reconnect
  // while the app is in the foreground. It then parks without a resume to
  // wake it, and the shell would sit on "reconnecting" over a frozen session.
  // The resume re-probe settles it: a reachable LAN takes over, otherwise the
  // connect screen explains the refusal.
  React.useEffect(() => {
    if (!isNativeMobileApp) return;
    return subscribeActiveRelayTunnelStatus((status) => {
      if (isRelayLimitReached(status)) handleNativeResume();
    });
  }, [isNativeMobileApp, handleNativeResume]);

  // Network-change re-probe. The resume hook only fires on background→foreground,
  // but on Android switching Wi-Fi (quick-settings tile) does NOT background the
  // app — no visibility/appState event ever fires, so the app would sit on a dead
  // LAN transport instead of hot-switching to relay. The webview's `online` event
  // fires on connectivity changes (new Wi-Fi, cellular back, airplane off), so
  // run the same re-probe then. Debounced: the first seconds after `online` the
  // route is often not usable yet, and rapid offline/online flaps must collapse
  // into one probe. iOS also gets this (harmless — same seq-guarded operation the
  // resume path runs; a concurrent duplicate supersedes via the seq ref).
  React.useEffect(() => {
    if (!isNativeMobileApp) return;
    let timer: number | undefined;
    const handleOnline = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => handleNativeResume(), 1500);
    };
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.clearTimeout(timer);
    };
  }, [isNativeMobileApp, handleNativeResume]);

  React.useEffect(() => {
    if (!isNativeMobileApp) return;
    return useAuthSessionStore.subscribe((store, previous) => {
      if (store.state === 'expired' && previous.state !== 'expired') {
        handleNativeResume();
        useAuthSessionStore.getState().markAuthenticated();
      }
    });
  }, [isNativeMobileApp, handleNativeResume]);

  React.useEffect(() => {
    registerRuntimeAPIs(apis);
    return () => registerRuntimeAPIs(null);
  }, [apis]);

  React.useEffect(() => {
    return subscribeRuntimeEndpointChanged((detail) => {
      logMobileConnectEvent('endpoint:changed', {
        runtimeKey: detail.runtimeKey || 'none',
        previousRuntimeKey: detail.previousRuntimeKey || 'none',
        connected: Boolean(detail.apiBaseUrl),
      });
      const sameDevice = Boolean(detail.runtimeKey) && detail.runtimeKey === detail.previousRuntimeKey;
      if (sameDevice) {
        reconnectAppForTransportSwitch();
        bumpTransportSwitch();
        return;
      }
      resetAppForRuntimeEndpointChange(detail);
      setRuntimeEndpointEpoch((epoch) => epoch + 1);
      setConnectionEpoch((epoch) => epoch + 1);
    });
  }, [setConnectionEpoch]);

  React.useEffect(() => {
    if (!isNativeMobileApp || isConnected || getRuntimeApiBaseUrl()) {
      setAutoConnectPhase('done');
      return;
    }
    let cancelled = false;
    setAutoConnectPhase('attempting');
    void (async () => {
      const outcome = await autoConnectLastInstance()
        .catch((): AutoConnectOutcome => ({ status: 'no-candidate' }));
      if (cancelled) return;
      // Landing on the connect screen silently reads as data loss — say WHY
      // the saved instance didn't come back (unreachable vs revoked auth).
      if (outcome.status === 'unreachable') {
        setAutoConnectNotice({ kind: 'unreachable', label: outcome.label });
      } else if (outcome.status === 'relay-limit') {
        setAutoConnectNotice({ kind: 'relay-limit', label: outcome.label });
      } else if (outcome.status === 'needs-login') {
        setAutoConnectNotice({ kind: 'auth-expired', label: outcome.label });
      }
      setAutoConnectPhase('done');
      if (outcome.status === 'unreachable') {
        void autoConnectLastInstance({ fast: false, skipIfConnected: true }).catch(() => null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!isNativeMobileApp || !getRuntimeApiBaseUrl()) return;
    let cancelled = false;
    const dropToConnectScreen = (notice: MobileConnectionNotice | null) => {
      logMobileConnectEvent('cold-launch:drop', { kind: notice?.kind ?? 'unknown' });
      if (notice) setAutoConnectNotice(notice);
      switchRuntimeEndpoint({ apiBaseUrl: '', clientToken: null, runtimeKey: MOBILE_DISCONNECTED_RUNTIME_KEY });
      setConnectionEpoch((value) => value + 1);
    };
    void reprobeActiveConnection().then(async (outcome) => {
      if (cancelled) return;
      if (outcome === 'switched' || outcome === 'unchanged') return;
      const label = getAutoConnectTargetLabel();
      if (outcome === 'needs-login') {
        dropToConnectScreen({ kind: 'auth-expired', label: label ?? '' });
        return;
      }
      if (outcome === 'unreachable') {
        dropToConnectScreen(label ? { kind: 'unreachable', label } : null);
        void autoConnectLastInstance({ fast: false, skipIfConnected: true }).catch(() => null);
        return;
      }
      if (outcome === 'relay-limit') {
        dropToConnectScreen(label ? { kind: 'relay-limit', label } : null);
        return;
      }
      const fallback = await autoConnectLastInstance().catch((): AutoConnectOutcome => ({ status: 'no-candidate' }));
      if (cancelled || fallback.status === 'connected') return;
      if (fallback.status === 'needs-login') {
        dropToConnectScreen({ kind: 'auth-expired', label: fallback.label });
      } else if (fallback.status === 'unreachable') {
        dropToConnectScreen({ kind: 'unreachable', label: fallback.label });
      } else if (fallback.status === 'relay-limit') {
        dropToConnectScreen({ kind: 'relay-limit', label: fallback.label });
      } else {
        dropToConnectScreen(null);
      }
    });
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    setIsMobile(true);
  }, [setIsMobile]);

  React.useEffect(() => {
    if (isNativeMobileApp && !getRuntimeApiBaseUrl()) return;
    void initializeApp();
  }, [connectionEpoch, initializeApp, isNativeMobileApp]);

  React.useEffect(() => {
    if (!isNativeMobileApp) return;
    let cancelled = false;
    const unsubscribe = subscribeOpenchamberEvents((event) => {
      if (event.type !== 'event-stream-ready') return;
      const { isConnected, isInitialized, lastInitFailure } = useConfigStore.getState();
      if (isConnected && isInitialized) return;
      const runtimeKey = getRuntimeKey();
      const apiBaseUrl = getRuntimeApiBaseUrl();
      if (!apiBaseUrl) return;
      void initializeApp().then(() => {
        if (cancelled || runtimeKey !== getRuntimeKey() || apiBaseUrl !== getRuntimeApiBaseUrl()) return;
        const failure = useConfigStore.getState().lastInitFailure;
        // A ready stream can arrive while an earlier startup attempt is still failing.
        if (failure !== lastInitFailure && failure?.step === 'serverUnreachable') void initializeApp();
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [initializeApp, isNativeMobileApp]);

  React.useEffect(() => {
    if (!isConnected) return;
    if (!providersLoaded) void loadProviders({ source: 'mobileApp:recovery' });
    void loadAgents(currentDirectory);
  }, [currentDirectory, isConnected, loadAgents, loadProviders, providersLoaded]);

  const lastSessionRestoreDoneRef = React.useRef(false);
  const [lastSessionRestorePending, setLastSessionRestorePending] = React.useState(isNativeMobileApp);
  React.useEffect(() => {
    if (!isNativeMobileApp || !isConnected || lastSessionRestoreDoneRef.current) return;
    let cancelled = false;
    const overlayTimeoutId = window.setTimeout(() => setLastSessionRestorePending(false), 6000);
    const attempt = beginLastSessionRestore({ selectNow: true, refresh: true });
    const showSelectedSession = () => {
      if (useSessionUIStore.getState().currentSessionId) setLastSessionRestorePending(false);
    };
    const stopWatchingSelection = useSessionUIStore.subscribe(showSelectedSession);
    showSelectedSession();
    void (async () => {
      const result = await attempt();
      if (cancelled) return;
      if (result !== 'failed') lastSessionRestoreDoneRef.current = true;
      setLastSessionRestorePending(false);
    })();
    return () => {
      cancelled = true;
      stopWatchingSelection();
      window.clearTimeout(overlayTimeoutId);
    };
  }, [connectionEpoch, isConnected, isNativeMobileApp]);

  React.useEffect(() => {
    if (!isConnected) return;
    hostFilesystem.setDirectory(currentDirectory);
  }, [currentDirectory, isConnected]);

  React.useEffect(() => {
    if (!isConnected) return;
    void refreshSourceControlProviders(apis.sourceControl);
    void refreshSourceControlAuth(apis.sourceControl, { force: true });
    void refreshTrackers(apis.trackers);
  }, [apis.sourceControl, apis.trackers, isConnected, refreshSourceControlAuth, refreshSourceControlProviders, setConnectionEpoch]);

  // Discover all worktrees for every known project so the draft session's
  // worktree/branch dropdown can list every available branch — not only the
  // current one. Mirrors ElectronMiniChatApp + desktop SessionSidebar.
  // Gated on isConnected: running before the runtime is reachable made every
  // per-project probe fail silently, leaving the map empty until some later
  // projects-store update happened to re-run this effect (the "switch projects
  // back and forth to see worktrees" bug).
  React.useEffect(() => {
    if (!isConnected || projects.length === 0) return;
    let cancelled = false;

    const run = async () => {
      const worktreesByProject = new Map(useSessionUIStore.getState().availableWorktreesByProject);

      await Promise.all(
        projects.map(async (project) => {
          const projectPath = project.path.replace(/\\/g, '/').replace(/\/+$/, '');
          if (!projectPath) return;
          try {
            const cachedIsGitRepo = useGitStore.getState().directories.get(projectPath)?.isGitRepo;
            const isGitRepo =
              cachedIsGitRepo ?? (await import('@/lib/gitApi').then((m) => m.checkIsGitRepository(projectPath)));
            if (!isGitRepo) return;
            const worktrees = await listProjectWorktrees({ id: project.id, path: projectPath });
            if (cancelled) return;
            worktreesByProject.set(projectPath, worktrees);
          } catch {
            // Worktree discovery is best-effort per project: a failed probe keeps
            // that project's previously known (persisted) worktrees instead of
            // wiping the whole map.
          }
        }),
      );

      if (cancelled) return;

      const partitionedWorktreesByProject = partitionWorktreesByRegisteredProject(projects, worktreesByProject);

      // Skip update if nothing changed — see worktreeMapsEqual JSDoc.
      const currentByProject = useSessionUIStore.getState().availableWorktreesByProject;
      if (!worktreeMapsEqual(partitionedWorktreesByProject, currentByProject)) {
        useSessionUIStore.setState({
          availableWorktrees: [...partitionedWorktreesByProject.values()].flat(),
          availableWorktreesByProject: partitionedWorktreesByProject,
        });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [isConnected, projects]);

  // A worktree added or removed anywhere (another window, an agent, a
  // terminal) arrives as a server control event; refresh only the projects it
  // names so the draft's worktree picker stays current without polling.
  React.useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const unsubscribe = subscribeOpenchamberEvents((event) => {
      if (event.type !== 'worktree-changed') return;
      void refreshWorktreeTopologyForChange(projects, event.directories, () => cancelled);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isConnected, projects]);

  React.useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => clearError(), 5000);
    return () => window.clearTimeout(timeout);
  }, [clearError, error]);

  React.useEffect(() => {
    const waitingOnConnection = !isConnected && (isNativeMobileApp ? Boolean(getRuntimeApiBaseUrl()) : true);
    if (!waitingOnConnection) {
      setShowConnectionRecovery(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      setShowConnectionRecovery(true);
    }, isNativeMobileApp ? 4000 : 8000);
    return () => window.clearTimeout(timeout);
  }, [isConnected, isNativeMobileApp, connectionEpoch, runtimeEndpointEpoch]);

  useAppFontEffects();
  usePushVisibilityBeacon({ enabled: true });
  useWindowTitle();
  useRoutingSync();
  useEnterprisePolicySync();
  // The phone mounts the same server-owned stores as the desktop app; without
  // this it read the previous instance's values until a page happened to load.
  React.useEffect(() => {
    if (!isInitialized) return;
    void bootServerStateStores();
  }, [isInitialized]);
  React.useEffect(() => installServerStateBootEvents(), []);
  useRouter();
  useSourceControlProviderSync(apis.sourceControl);
  useHostInvalidationSync();
  useNativeShellIntegration({ native: isNativeMobileApp, connected: isConnected, initialized: isInitialized, onPairing });
  const fontsReady = useFontsReady();

  const isReconnecting = !isConnected && connectionPhase === 'reconnecting';
  const showReconnectBanner = isNativeMobileApp && (isReconnecting || eventStreamReconnecting);

  if (!fontsReady) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--splash-background,var(--surface-background))] text-foreground">
        <OpenChamberLogo width={120} height={120} isAnimated variant="splash" />
      </main>
    );
  }

  const hasRuntimeEndpoint = Boolean(getRuntimeApiBaseUrl());

  if (isNativeMobileApp && (!hasRuntimeEndpoint || (!isConnected && !isReconnecting))) {
    if (hasRuntimeEndpoint) {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-[var(--splash-background,var(--surface-background))] px-6 text-center text-foreground">
          <div className="flex max-w-sm flex-col items-center gap-4">
            <OpenChamberLogo width={120} height={120} isAnimated={!showConnectionRecovery} variant="splash" />
            {showConnectionRecovery ? (
              <>
                <div className="space-y-2">
                  <h1 className="typography-h3 text-foreground">{t('sessionAuth.error.networkTitle')}</h1>
                  {/* Native copy — the browser-oriented sessionAuth description
                      (Desktop Network Access etc.) reads as noise here. */}
                  <p className="text-muted-foreground">{t('mobile.connect.recovery.description')}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    switchRuntimeEndpoint({ apiBaseUrl: '', clientToken: null, runtimeKey: MOBILE_DISCONNECTED_RUNTIME_KEY });
                    setConnectionEpoch((value) => value + 1);
                  }}
                >
                  {t('mobile.connect.cancelPassword')}
                </Button>
              </>
            ) : null}
          </div>
        </main>
      );
    }
    if (autoConnectPhase !== 'done') {
      return (
        <main className="relative flex min-h-dvh items-center justify-center bg-[var(--splash-background,var(--surface-background))] text-foreground">
          <OpenChamberLogo width={120} height={120} isAnimated variant="splash" />
          {autoConnectLabel ? (
            <div className="absolute inset-x-0 top-[calc(50%+84px)] flex flex-col items-center gap-0.5 px-6 text-center">
              <p className="text-muted-foreground">{t('mobile.connect.splash.connectingTo')}</p>
              <p className="text-foreground">
                {autoConnectLabel}
                <BusyDots />
              </p>
            </div>
          ) : null}
        </main>
      );
    }
    return (
      <>
        <MobileConnectionWelcome
          onConnected={() => setConnectionEpoch((value) => value + 1)}
          notice={autoConnectNotice}
        />
      </>
    );
  }

  if (!isConnected && !isReconnecting) {
    if (!showConnectionRecovery) {
      return (
        <main className="flex min-h-dvh items-center justify-center bg-[var(--splash-background,var(--surface-background))] text-foreground">
          <OpenChamberLogo width={120} height={120} isAnimated variant="splash" />
        </main>
      );
    }
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-center text-foreground">
        <div className="max-w-sm space-y-3">
          <h1 className="typography-h3 text-foreground">{t('sessionAuth.error.networkTitle')}</h1>
          <p className="text-muted-foreground">{t('sessionAuth.error.networkDescription')}</p>
        </div>
      </main>
    );
  }

  return (
    <ErrorBoundary>
      <SyncProvider key={runtimeEndpointEpoch} directory={currentDirectory || ''}>
        <RuntimeAPIProvider apis={apis}>
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            <div className="h-full bg-background text-foreground">
              {/* Cold-launch continuity: keep the boot logo up over the shell
                  until the last-session restore decides between session and
                  draft — otherwise the auto-opened draft flashes first. The
                  shell (and sync) still mounts and warms up underneath. */}
              <AppStartupOverlay ready={!isNativeMobileApp || !lastSessionRestorePending || showReconnectBanner} animated />
              <SyncAppEffects backgroundWorkEnabled={isInitialized} />
              <MobileShell reconnecting={showReconnectBanner} onActiveConnectionDeleted={() => {
                suppressAutoConnectUntilManualConnect();
                switchRuntimeEndpoint({ apiBaseUrl: '', clientToken: null, runtimeKey: MOBILE_DISCONNECTED_RUNTIME_KEY });
                setConnectionEpoch((value) => value + 1);
              }} />
              <AppLinkConfirmDialog />
              <SharedTrustConfirmDialog />
              {isolatedSpacesEnabled ? <><SpaceAccessDialog /><SpaceActionsSheet /><SpaceApplyDialog /><SpaceDeleteDialog /><SpaceSetupOutputDialog /></> : null}
            </div>
          </TooltipProvider>
        </RuntimeAPIProvider>
      </SyncProvider>
    </ErrorBoundary>
  );
}

function NativeMobileApp(props: MobileAppContentProps) {
  const { setConnectionEpoch } = props;
  const onConnected = React.useCallback(() => setConnectionEpoch((epoch) => epoch + 1), [setConnectionEpoch]);
  const { onPairing, pairingConfirmation } = useMobilePairingConfirmation(onConnected);
  return <>
    <MobileAppContent {...props} onPairing={onPairing} />
    {pairingConfirmation}
  </>;
}

export function MobileApp(props: MobileAppProps) {
  const [connectionEpoch, setConnectionEpoch] = React.useState(0);
  const Root = isCapacitorMobileApp() ? NativeMobileApp : MobileAppContent;
  return <>
    <Root {...props} connectionEpoch={connectionEpoch} setConnectionEpoch={setConnectionEpoch} />
    <MobileToaster />
  </>;
}
