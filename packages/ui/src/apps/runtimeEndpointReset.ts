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
import { resetServerStateStores } from '@/stores/serverStateBoot';
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
import { resetSessionLiveWork } from '@/sync/session-live-work';
import { useMultiRunStore } from '@/stores/useMultiRunStore';
import { resetSessionOrdering } from '@/sync/session-ordering';
import { resetSessionActivityTiming } from '@/sync/session-activity-timing';
import { syncDesktopSettings } from '@/lib/persistence';
import { useSessionMultiSelectStore } from '@/stores/useSessionMultiSelectStore';
import { useSessionWarmingStore } from '@/stores/useSessionWarmingStore';

// Same-device transport switch (LAN⇄relay for one paired canonical rebind the SDK
// to the new transport WITHOUT tearing down connection/session state or remounting
// the sync layer. `reconnectToRuntimeBaseUrl` swaps in a fresh SDK client; the
// caller then forces a re-render so SyncProvider receives it as a new `sdk` prop,
// which re-runs its event-pipeline + bootstrap effects (keyed on `sdk`) to
// reconnect over the new transport IN PLACE. Message-pagination refs, the open
// session, and the whole view are preserved — no reconnecting screen, no flash,
// no bounce back to the draft.
export const reconnectAppForTransportSwitch = (): void => {
  disposeTerminalInputTransport();
  hostFilesystem.resetRequests();
  resetStreamingState();
};

export const resetAppForRuntimeEndpointChange = (detail: RuntimeEndpointChangedDetail): void => {
  useSessionUIStore.getState().prepareForRuntimeSwitch(detail.previousRuntimeKey);
  useAutoReviewStore.getState().resetForRuntimeSwitch();
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
  resetBackgroundImages();
  resetSessionLiveWork();
  resetSessionOrdering();
  resetSessionActivityTiming();
  useMessageQueueStore.getState().resetForRuntimeSwitch(detail.previousRuntimeKey);
  useFileSearchStore.getState().resetForRuntimeSwitch();
  useGitStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  sessionEvents.cancelPendingGitRefreshes();
  fileTreeChanges.reset();
  useSourceControlAuthStore.getState().resetForRuntimeSwitch();
  repositoryBindingOwner.reset();
  useChangeRequestContextStore.getState().resetForRuntimeSwitch();
  useGitHubPrStatusStore.getState().resetForRuntimeSwitch();
  useWalkthroughStore.getState().reset();
  usePullRequestSelectionStore.setState({ selections: new Map(), diffRequests: new Map(), diffContexts: new Map(), changesRepositories: new Map() });
  useFilesViewTabsStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  useGuestsStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  useGuestOauthStore.getState().resetForRuntimeSwitch();
  useTrackerAuthStore.getState().resetForRuntimeSwitch();
  useSourceControlAuthStore.getState().resetForRuntimeSwitch();
  useSourceControlProviderRegistry.getState().resetForRuntimeSwitch(detail.runtimeKey);
  // Work-status readouts served from the instance: quotas, MCP servers, skills
  // and agent memory. All were cached globally or by directory alone, so they
  // reported the previous instance until something happened to refetch.
  // Every server-owned store drops the instance that just left. The registry
  // owns that list so a new one cannot be forgotten here.
  resetServerStateStores(detail.runtimeKey);
  useSessionUIStore.getState().restoreForRuntimeSwitch(detail.runtimeKey, detail.previousRuntimeKey);
  useSessionUIStore.setState({ worktreeDiscoveryByProject: new Map() });
  useUIStore.getState().setOpenGuestPage(null);
  useUIStore.setState({ customProviderLogos: {} });
  resetStreamingState();
  queueMicrotask(() => void syncDesktopSettings());
};

export const isSameRuntimeEndpoint = (detail: RuntimeEndpointChangedDetail): boolean => (
  detail.runtimeKey === detail.previousRuntimeKey && detail.apiBaseUrl === detail.previousApiBaseUrl
);

export const installRuntimeEndpointReset = (): (() => void) => (
  subscribeRuntimeEndpointChanged((detail) => {
    if (isSameRuntimeEndpoint(detail)) return;
    resetAppForRuntimeEndpointChange(detail);
  })
);
