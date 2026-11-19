import { useSpacesStore } from '@/lib/spaces/spaces-store';
import { useSpaceArchivesStore } from '@/lib/spaces/space-archives';
import { resetSpaceModelAccess } from '@/lib/spaces/space-model-access';
import { resetSpaceCreationRequests } from '@/lib/spaces/space-creation';
import { useGuestsStore } from '@/lib/guests/store';
import { useGuestOauthStore } from '@/lib/guests/oauth-store';
import { hostFilesystem } from '@/lib/host-filesystem';
import { subscribeRuntimeEndpointChanged, type RuntimeEndpointChangedDetail } from '@/lib/runtime-switch';
import { disposeTerminalInputTransport } from '@/lib/terminalApi';
import { useConfigStore } from '@/stores/useConfigStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useProjectContextStore } from '@/stores/useProjectContextStore';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useAutoReviewStore } from '@/stores/useAutoReviewStore';
<<<<<<< HEAD
import { resetServerStateStores } from '@/stores/serverStateBoot';
||||||| bc50ba56aa
import { resetPrWatchesForRuntimeSwitch } from '@/sync/pr-watch';
import { usePermissionStore } from '@/stores/permissionStore';
=======
import { resetPrWatchesForRuntimeSwitch } from '@/sync/pr-watch';
import { resetExtensionWaitsForRuntimeSwitch } from '@/sync/extension-waits';
import { resetLaterPagesForRuntimeSwitch } from '@/sync/later-pages';
import { usePermissionStore } from '@/stores/permissionStore';
>>>>>>> upstream/main
import { useMessageQueueStore } from '@/stores/messageQueueStore';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { useGitStore } from '@/stores/useGitStore';
import { useGitHubPrStatusStore } from '@/stores/useGitHubPrStatusStore';
import { useSourceControlAuthStore } from '@/stores/useSourceControlAuthStore';
import { repositoryBindingOwner } from '@/lib/source-control/repository-binding';
import { useChangeRequestContextStore } from '@/stores/useChangeRequestContextStore';
import { sessionEvents } from '@/lib/sessionEvents';
import { fileTreeChanges } from '@/lib/fileTreeChanges';
import { useTrackerAuthStore } from '@/stores/useTrackerAuthStore';
import { useSourceControlProviderRegistry } from '@/lib/source-control/providers/registry';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { useWalkthroughStore } from '@/stores/useWalkthroughStore';
import { usePullRequestSelectionStore } from '@/stores/usePullRequestSelectionStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { resetStreamingState } from '@/sync/streaming';
import { replaceGlobalSessionStatusById } from '@/sync/global-session-status';
import { resetGlobalBlockingRequests } from '@/sync/global-blocking-requests';
import { resetBackgroundShells } from '@/sync/background-shells';
<<<<<<< HEAD
||||||| bc50ba56aa
import { resetBackgroundImages } from '@/sync/background-images';
=======
import { resetBackgroundImages } from '@/sync/background-images';
import { resetSessionLiveWork } from '@/sync/session-live-work';
>>>>>>> upstream/main
import { useMultiRunStore } from '@/stores/useMultiRunStore';
import { resetSessionOrdering } from '@/sync/session-ordering';
import { resetSessionActivityTiming } from '@/sync/session-activity-timing';
import { syncDesktopSettings } from '@/lib/persistence';
import { useSessionMultiSelectStore } from '@/stores/useSessionMultiSelectStore';
import { useSessionWarmingStore } from '@/stores/useSessionWarmingStore';

<<<<<<< HEAD
// Transport-only switches preserve session state; SyncProvider reconnects canonical streams on the endpoint event.
||||||| bc50ba56aa
// Same-device transport switch (LAN⇄relay for one paired device): rebind the SDK
// to the new transport WITHOUT tearing down connection/session state or remounting
// the sync layer. `reconnectToRuntimeBaseUrl` swaps in a fresh SDK client; the
// caller then forces a re-render so SyncProvider receives it as a new `sdk` prop,
// which re-runs its event-pipeline + bootstrap effects (keyed on `sdk`) to
// reconnect over the new transport IN PLACE. Message-pagination refs, the open
// session, and the whole view are preserved — no reconnecting screen, no flash,
// no bounce back to the draft.
=======
>>>>>>> upstream/main
export const reconnectAppForTransportSwitch = (): void => {
  disposeTerminalInputTransport();
  hostFilesystem.resetRequests();
  resetStreamingState();
};

export const resetAppForRuntimeEndpointChange = (detail: RuntimeEndpointChangedDetail): void => {
  useSessionUIStore.getState().prepareForRuntimeSwitch(detail.previousRuntimeKey);
  useAutoReviewStore.getState().resetForRuntimeSwitch();
<<<<<<< HEAD
||||||| bc50ba56aa
  resetPrWatchesForRuntimeSwitch();
=======
  resetPrWatchesForRuntimeSwitch();
  resetExtensionWaitsForRuntimeSwitch();
  resetLaterPagesForRuntimeSwitch();
>>>>>>> upstream/main
  disposeTerminalInputTransport();
  useTerminalStore.getState().clearAll();
  hostFilesystem.resetRequests();
  useConfigStore.setState({
    providers: [],
    isConnected: false,
    isInitialized: false,
    connectionPhase: 'connecting',
    lastDisconnectReason: null,
  });
  useProjectsStore.getState().resetForRuntimeSwitch();
  useProjectContextStore.getState().reset();
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  useSpacesStore.getState().resetForRuntimeSwitch();
  useSpaceArchivesStore.getState().resetForRuntimeSwitch();
  resetSpaceModelAccess();
  resetSpaceCreationRequests();
  useMultiRunStore.getState().resetForRuntimeSwitch();
  useSessionWarmingStore.getState().reset();
  useSessionMultiSelectStore.getState().disable();
  useCommandsStore.getState().resetForRuntimeSwitch();
  useAgentsStore.getState().resetForRuntimeSwitch();
  replaceGlobalSessionStatusById(new Map());
  resetGlobalBlockingRequests();
  resetBackgroundShells();
<<<<<<< HEAD
||||||| bc50ba56aa
  resetBackgroundImages();
=======
  resetBackgroundImages();
  resetSessionLiveWork();
>>>>>>> upstream/main
  resetSessionOrdering();
  resetSessionActivityTiming();
  useMessageQueueStore.getState().resetForRuntimeSwitch(detail.previousRuntimeKey);
  useFileSearchStore.getState().resetForRuntimeSwitch();
  useGitStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  sessionEvents.cancelPendingGitRefreshes();
  fileTreeChanges.reset();
  useSourceControlAuthStore.getState().resetForRuntimeSwitch();
<<<<<<< HEAD
||||||| bc50ba56aa
  // Another server may serve other providers; its own remembered list stands in until it answers.
  useSourceControlProviderRegistry.getState().resetForRuntimeSwitch(detail.runtimeKey);
=======
  useSourceControlProviderRegistry.getState().resetForRuntimeSwitch(detail.runtimeKey);
>>>>>>> upstream/main
  repositoryBindingOwner.reset();
  useChangeRequestContextStore.getState().resetForRuntimeSwitch();
  useGitHubPrStatusStore.getState().resetForRuntimeSwitch();
  useWalkthroughStore.getState().reset();
  usePullRequestSelectionStore.setState({ selections: new Map(), diffRequests: new Map(), diffContexts: new Map(), changesRepositories: new Map() });
  useFilesViewTabsStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  useGuestsStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  useGuestOauthStore.getState().resetForRuntimeSwitch();
<<<<<<< HEAD
  // Trackers and source control are authenticated on the instance, not in the
  // browser. Left in place, the previous instance's login stayed visible and
  // usable — its rail tab, its issue pickers, its work-status rows — against a
  // runtime that has no such integration. `App` re-asks once the new instance
  // answers.
||||||| bc50ba56aa
  // Trackers and source control are authenticated on the instance, not in the browser.
  // Left in place, the previous instance's login stayed visible and usable —
  // its rail tab, its issue pickers, its work-status rows — against a runtime
  // that has no such integration. `App` re-asks once the new instance answers.
=======
>>>>>>> upstream/main
  useTrackerAuthStore.getState().resetForRuntimeSwitch();
<<<<<<< HEAD
||||||| bc50ba56aa
  // Another server may serve other trackers; its own remembered list stands in until it answers.
  useTrackerRegistry.getState().resetForRuntimeSwitch(detail.runtimeKey);
=======
  useTrackerRegistry.getState().resetForRuntimeSwitch(detail.runtimeKey);
>>>>>>> upstream/main
  useSourceControlAuthStore.getState().resetForRuntimeSwitch();
<<<<<<< HEAD
  useSourceControlProviderRegistry.getState().resetForRuntimeSwitch(detail.runtimeKey);
  // Work-status readouts served from the instance: quotas, MCP servers, skills
  // and agent memory. All were cached globally or by directory alone, so they
  // reported the previous instance until something happened to refetch.
  // Every server-owned store drops the instance that just left. The registry
  // owns that list so a new one cannot be forgotten here.
  resetServerStateStores(detail.runtimeKey);
||||||| bc50ba56aa
  // Work-status readouts served from the instance: quotas, MCP servers, skills
  // and agent memory. All were cached globally or by directory alone, so they
  // reported the previous instance until something happened to refetch.
  useQuotaStore.getState().resetForRuntimeSwitch();
  useMcpStore.getState().resetForRuntimeSwitch();
  useSkillsStore.getState().resetForRuntimeSwitch();
  useAgentMemoryStore.getState().reset();
  useWorkflowRunsStore.getState().reset();
=======
  useQuotaStore.getState().resetForRuntimeSwitch();
  useMcpStore.getState().resetForRuntimeSwitch();
  useSkillsStore.getState().resetForRuntimeSwitch();
  useAgentMemoryStore.getState().reset();
  useWorkflowRunsStore.getState().reset();
>>>>>>> upstream/main
  useSessionUIStore.getState().restoreForRuntimeSwitch(detail.runtimeKey, detail.previousRuntimeKey);
  useSessionUIStore.setState({ worktreeDiscoveryByProject: new Map() });
  useUIStore.getState().setOpenGuestPage(null);
<<<<<<< HEAD
||||||| bc50ba56aa
  // Uploaded provider logos live on the instance; a server that never stored any
  // omits the key, and the sync below keeps an omitted key as it was.
  useUIStore.setState({ customProviderLogos: {} });
=======
  useUIStore.setState({ customProviderLogos: {} });
>>>>>>> upstream/main
  resetStreamingState();
  queueMicrotask(() => void syncDesktopSettings());
};

export const isSameRuntimeEndpoint = (detail: RuntimeEndpointChangedDetail): boolean => (
  detail.runtimeKey === detail.previousRuntimeKey && detail.apiBaseUrl === detail.previousApiBaseUrl
);

<<<<<<< HEAD
// Web and desktop reset endpoint changes from the entrypoint because
// SessionAuthGate can unmount App while showing login or error states. A host
// switch from that gate must still clear runtime-scoped state before App mounts
// against the new host.
// A same-runtime credential change stays with App, which resets only while
// mounted: a sign-in on the login screen must keep the terminal tabs and
// auto-review runs of the host being unlocked. Mobile keeps its own subscriber
// because it tells transport switches apart from runtime switches.
||||||| bc50ba56aa
// Web and desktop reset for a change of runtime from the entry point, not from
// App: the auth and compatibility gates unmount App while they show the login,
// error, or version screen, and a host switch made from their switcher would
// otherwise leave the SDK client and stores on the previous runtime. App then
// mounts against the new runtime with an SDK that still calls the old one, so
// initialization never completes and the startup overlay never lifts.
// A same-runtime credential change stays with App, which resets only while
// mounted: a sign-in on the login screen must keep the terminal tabs of the
// host being unlocked. Mobile keeps its own subscriber
// because it tells transport switches apart from runtime switches.
=======
>>>>>>> upstream/main
export const installRuntimeEndpointReset = (): (() => void) => (
  subscribeRuntimeEndpointChanged((detail) => {
    if (isSameRuntimeEndpoint(detail)) return;
    resetAppForRuntimeEndpointChange(detail);
  })
);
