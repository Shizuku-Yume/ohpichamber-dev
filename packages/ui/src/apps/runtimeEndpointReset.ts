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
import { resetPrWatchesForRuntimeSwitch } from '@/sync/pr-watch';
import { usePermissionStore } from '@/stores/permissionStore';
import { useMessageQueueStore } from '@/stores/messageQueueStore';
import { useFileSearchStore } from '@/stores/useFileSearchStore';
import { useGitStore } from '@/stores/useGitStore';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { useGitHubPrStatusStore } from '@/stores/useGitHubPrStatusStore';
import { useSourceControlAuthStore } from '@/stores/useSourceControlAuthStore';
import { repositoryBindingOwner } from '@/lib/source-control/repository-binding';
import { useChangeRequestContextStore } from '@/stores/useChangeRequestContextStore';
import { useSessionFoldersStore } from '@/stores/useSessionFoldersStore';
import { sessionEvents } from '@/lib/sessionEvents';
import { fileTreeChanges } from '@/lib/fileTreeChanges';
import { useTrackerAuthStore } from '@/stores/useTrackerAuthStore';
import { useSourceControlProviderRegistry } from '@/lib/source-control/providers/registry';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { useMcpStore } from '@/stores/useMcpStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { useSkillsCatalogStore } from '@/stores/useSkillsCatalogStore';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useAgentMemoryStore } from '@/stores/useAgentMemoryStore';
import { useUIStore } from '@/stores/useUIStore';
import { useFilesViewTabsStore } from '@/stores/useFilesViewTabsStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { useWalkthroughStore } from '@/stores/useWalkthroughStore';
import { usePullRequestSelectionStore } from '@/stores/usePullRequestSelectionStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { resetStreamingState } from '@/sync/streaming';
import { replaceGlobalSessionStatusById } from '@/sync/global-session-status';
import { resetGlobalBlockingRequests } from '@/sync/global-blocking-requests';
<<<<<<< HEAD
=======
import { resetPendingSessionAssists } from '@/sync/pending-session-assists';
import { resetRecoverableQuestions } from '@/sync/recoverable-questions';
>>>>>>> bc50ba56a
import { resetBackgroundShells } from '@/sync/background-shells';
import { resetBackgroundImages } from '@/sync/background-images';
import { useMultiRunStore } from '@/stores/useMultiRunStore';
import { resetSessionOrdering } from '@/sync/session-ordering';
import { resetSessionActivityTiming } from '@/sync/session-activity-timing';
import { syncDesktopSettings } from '@/lib/persistence';
import { useSessionMultiSelectStore } from '@/stores/useSessionMultiSelectStore';

// Transport-only switches preserve session state; SyncProvider reconnects canonical streams on the endpoint event.
export const reconnectAppForTransportSwitch = (): void => {
  disposeTerminalInputTransport();
  hostFilesystem.resetRequests();
  resetStreamingState();
};

export const resetAppForRuntimeEndpointChange = (detail: RuntimeEndpointChangedDetail): void => {
  useSessionUIStore.getState().prepareForRuntimeSwitch(detail.previousRuntimeKey);
  // The previous server keeps its runs going; this window shows the new one's.
  useAutoReviewStore.getState().resetForRuntimeSwitch();
  resetPrWatchesForRuntimeSwitch();
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
  // Notes, todos, plans and the pinned-context bookkeeping are keyed by a
  // path-derived project id, which two runtimes can collide on.
  useProjectContextStore.getState().reset();
  // Cross-project session list (mobile sessions sheet & co) belongs to the
  // previous instance — drop it so stale sessions can't linger after a switch.
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  useSpacesStore.getState().resetForRuntimeSwitch();
  useSpaceArchivesStore.getState().resetForRuntimeSwitch();
  resetSpaceModelAccess();
  resetSpaceCreationRequests();
  useMultiRunStore.getState().resetForRuntimeSwitch();
  useSessionMultiSelectStore.getState().disable();
  useCommandsStore.getState().resetForRuntimeSwitch();
  useAgentsStore.getState().resetForRuntimeSwitch();
  replaceGlobalSessionStatusById(new Map());
  resetGlobalBlockingRequests();
<<<<<<< HEAD
=======
  resetPendingSessionAssists();
  resetRecoverableQuestions();
>>>>>>> bc50ba56a
  resetBackgroundShells();
  resetBackgroundImages();
  resetSessionOrdering();
  // Turn timings belong to the previous instance's sessions, and the reset also
  // restarts the resume window so the switch is treated as a fresh load.
  resetSessionActivityTiming();
  usePermissionStore.getState().reset();
  useMessageQueueStore.getState().resetForRuntimeSwitch(detail.previousRuntimeKey);
  useFileSearchStore.getState().resetForRuntimeSwitch();
  useGitStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  sessionEvents.cancelPendingGitRefreshes();
  fileTreeChanges.reset();
  useGitIdentitiesStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  useSourceControlAuthStore.getState().resetForRuntimeSwitch();
  repositoryBindingOwner.reset();
  useChangeRequestContextStore.getState().resetForRuntimeSwitch();
  useGitHubPrStatusStore.getState().resetForRuntimeSwitch();
  useWalkthroughStore.getState().reset();
  usePullRequestSelectionStore.setState({ selections: new Map(), diffRequests: new Map(), diffContexts: new Map(), changesRepositories: new Map() });
  useSessionFoldersStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  useFilesViewTabsStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  // Guest rail icons are instance-owned. Keep the previous catalog and the
  // new instance mints icon URLs that 404: an invisible, still-clickable slot.
  useGuestsStore.getState().resetForRuntimeSwitch(detail.runtimeKey);
  // Guest OAuth status is answered by the instance too; a stale "connected"
  // would otherwise be pushed to a guest frame on the new instance.
  useGuestOauthStore.getState().resetForRuntimeSwitch();
  // Trackers and source control are authenticated on the instance, not in the
  // browser. Left in place, the previous instance's login stayed visible and
  // usable — its rail tab, its issue pickers, its work-status rows — against a
  // runtime that has no such integration. `App` re-asks once the new instance
  // answers.
  useTrackerAuthStore.getState().resetForRuntimeSwitch();
  useSourceControlAuthStore.getState().resetForRuntimeSwitch();
  useSourceControlProviderRegistry.getState().resetForRuntimeSwitch(detail.runtimeKey);
  // Work-status readouts served from the instance: quotas, MCP servers, skills
  // and agent memory. All were cached globally or by directory alone, so they
  // reported the previous instance until something happened to refetch.
  useQuotaStore.getState().resetForRuntimeSwitch();
  useMcpStore.getState().resetForRuntimeSwitch();
  useSkillsStore.getState().resetForRuntimeSwitch();
  useSkillsCatalogStore.getState().resetForRuntimeSwitch();
  useAgentMemoryStore.getState().reset();
  useSessionUIStore.getState().restoreForRuntimeSwitch(detail.runtimeKey, detail.previousRuntimeKey);
  useSessionUIStore.setState({ worktreeDiscoveryByProject: new Map() });
  useUIStore.getState().setOpenGuestPage(null);
  // Uploaded provider logos live on the instance; a server that never stored any
  // omits the key, and the sync below keeps an omitted key as it was.
  useUIStore.setState({ customProviderLogos: {} });
  resetStreamingState();
  queueMicrotask(() => void syncDesktopSettings());
};

/**
 * True when the endpoint event only replaced credentials for the runtime that
 * was already active, as the login gate does after a successful sign-in.
 */
export const isSameRuntimeEndpoint = (detail: RuntimeEndpointChangedDetail): boolean => (
  detail.runtimeKey === detail.previousRuntimeKey && detail.apiBaseUrl === detail.previousApiBaseUrl
);

// Web and desktop reset endpoint changes from the entrypoint because
// SessionAuthGate can unmount App while showing login or error states. A host
// switch from that gate must still clear runtime-scoped state before App mounts
// against the new host.
// A same-runtime credential change stays with App, which resets only while
// mounted: a sign-in on the login screen must keep the terminal tabs of the
// host being unlocked. Mobile keeps its own subscriber
// because it tells transport switches apart from runtime switches.
export const installRuntimeEndpointReset = (): (() => void) => (
  subscribeRuntimeEndpointChanged((detail) => {
    if (isSameRuntimeEndpoint(detail)) return;
    resetAppForRuntimeEndpointChange(detail);
  })
);
