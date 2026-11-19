import { createRipgrepResolver } from '../fs/ripgrep.js';
import { registerFsRoutes } from '../fs/routes.js';
import { registerEnvironmentRoutes } from '../environment/routes.js';
import { registerQuotaRoutes } from '../quota/routes.js';
import { registerWalkthroughRoutes } from '../walkthrough/routes.js';
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
import { registerSessionGoalRoutes } from '../session-goal/routes.js';
import { registerSessionWarmingRoutes } from '../session-warming/routes.js';
import { setWarmingDuration, setWarmingEnabled } from './websearch-config.js';
========
import { registerSessionGoalRoutes } from '../session-goal/routes.js';
import { registerSessionWarmingRoutes } from '../session-warming/routes.js';
import { registerSessionTodosRoutes } from '../session-todos/routes.js';
import { setWarmingDuration, setWarmingEnabled } from '../opencode/websearch-config.js';
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
import { registerSourceControlRoutes } from '../source-control/routes.js';
import { registerLinearRoutes } from '../linear/routes.js';
import { registerGuestRoutes, settleGuestDeactivationListeners } from '../guests/routes.js';
import { listInstalledGuests, registerBuiltInGuests } from '../guests/catalog.js';
import { proxyGuestServiceRequest } from '../guests/service.js';
import { extensionsPersistPath } from '../guests/persist.js';
import { registerGitRoutes } from '../git/routes.js';
import { registerDevServerRoutes } from '../dev-servers/routes.js';
import { registerMagicPromptRoutes } from '../magic-prompts/routes.js';
import { registerSessionFoldersRoutes } from '../session-folders/routes.js';
import { registerSessionDraftRoutes } from '../session-drafts/routes.js';
import { registerProjectContextRoutes } from '../project-context/routes.js';
import { registerProjectDirectoryRoutes, registerProjectSetupRoutes } from '../projects/routes.js';
import { registerSessionKnowledgeRoutes } from '../session-knowledge/routes.js';
import { registerBehaviorRoutes } from './behavior-routes.js';
import { registerMessageSearchRoutes } from '../message-search/routes.js';
import { registerMessageQueueRoutes } from '../message-queue/runtime.js';
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
import { registerRoutingRoutes } from '../routing/routes.js';
import { registerPermissionAutoAcceptRoutes } from '../permission-auto-accept/runtime.js';
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
import { registerAutoReviewRoutes } from '../auto-review/runtime.js';
import { registerPrWatchRoutes } from '../pr-watch/runtime.js';
import { registerWorkflowRoutes } from '../workflows/routes.js';
import { registerRoutingPromptRewrite, registerRoutingRoutes } from '../routing/routes.js';
import { registerConfigEntityRoutes } from './config-entity-routes.js';
import { createThemeFolderWatch } from './theme-watch.js';
========
import { registerAutoReviewRoutes } from '../auto-review/runtime.js';
import { registerPrWatchRoutes } from '../pr-watch/runtime.js';
import { registerExtensionWaitsRoutes } from '../extension-waits/runtime.js';
import { registerWorkflowRoutes } from '../workflows/routes.js';
import { registerRoutingPromptRewrite, registerRoutingRoutes } from '../routing/routes.js';
import { registerConfigEntityRoutes } from '../opencode/config-entity-routes.js';
import { createThemeFolderWatch } from '../appearance/theme-watch.js';
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
import { registerSettingsUtilityRoutes } from './core-routes.js';
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
import { createThemeFolderWatch } from './theme-watch.js';
import { registerProjectIconRoutes } from './project-icon-routes.js';
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
import { registerProjectIconRoutes } from './project-icon-routes.js';
import { registerProviderLogoRoutes } from './provider-logo-routes.js';
========
import { registerProjectIconRoutes } from '../appearance/project-icon-routes.js';
import { registerProviderLogoRoutes } from '../appearance/provider-logo-routes.js';
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
import { registerScheduledTaskRoutes } from '../scheduled-tasks/routes.js';
import { fillScheduledWorktreeBridge } from '../scheduled-tasks/worktree-bridge.js';
import { createTrackedItemsService } from '../tracked-items/service.js';
import { createProviderReadCache } from '../provider-read-cache/index.js';
import { createTrackedItemReaders } from '../tracked-items/readers.js';
import { createTrackedItemsPersistence } from '../tracked-items/persistence.js';
import { registerTrackedItemsRoutes } from '../tracked-items/routes.js';
import { registerOpenChamberSessionRoutes } from '../openchamber-sessions/routes.js';
import { registerOpenChamberControlRoutes } from '../openchamber-control/routes.js';
import { registerMarkdownImageGrantRoutes } from '../markdown-image-grants/routes.js';
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
import { createSkillRepositoryIdentityResolver } from './skill-repository-identity.js';
import fs from 'node:fs';
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
import { registerSkillRoutes } from './skill-routes.js';
import { registerPluginRoutes } from './plugin-routes.js';
import { getNpmInfo, clearCache as clearNpmCache } from './npm-registry.js';
import { parseNpmSpec, parsePathSpec, isExactSemver } from './plugin-spec.js';
import { registerOpenCodeRoutes } from './routes.js';
import { getProviderSources, removeProviderConfig, upsertProviderConfig } from './providers.js';
import { getAgentSources, getAgentConfig, getAgentPermissions, createAgent, updateAgent, deleteAgent, listDisabledAgents } from './agents.js';
import { getCommandSources, getCommandConfig, createCommand, updateCommand, deleteCommand } from './commands.js';
import { listMcpConfigs, getMcpConfig, createMcpConfig, updateMcpConfig, deleteMcpConfig } from './mcp.js';
import { listSnippets, getSnippet, createSnippet, updateSnippet, deleteSnippet, expandSnippets, previewSnippet } from './snippets.js';
import {
  listPluginEntries,
  getPluginEntry,
  readGlobalPluginEntries,
  addGlobalPluginEntry,
  createPluginEntry,
  updatePluginEntry,
  deletePluginEntry,
  setPluginEntryEnabled,
  setPluginFileEnabled,
  listPluginDirFiles,
  readPluginDirFile,
  writePluginDirFile,
  deletePluginDirFile,
  encodePluginId,
  decodePluginId,
} from './plugins.js';
import { SKILL_DIR, SKILL_SCOPE, readSkillSupportingFile, writeSkillSupportingFile, deleteSkillSupportingFile } from './shared.js';
import { getSkillSources, discoverSkills, mergeDiscoveredSkills, createSkill, updateSkill, deleteSkill, renameSkill, isManagedSkillPath } from './skills.js';
import { getCuratedSkillsSources } from '../skills-catalog/curated-sources.js';
import { getCacheKey, scanWithCache } from '../skills-catalog/cache.js';
import { parseSkillRepoSource } from '../skills-catalog/source.js';
import { scanSkillsRepository } from '../skills-catalog/scan.js';
import { installSkillsFromRepository } from '../skills-catalog/install.js';
import { fetchGitHubRepoMetas } from '../skills-catalog/github-meta.js';
========
import { registerSkillRoutes } from '../opencode/skill-routes.js';
import { registerPluginRoutes } from '../opencode/plugin-routes.js';
import { getNpmInfo } from '../npm/npm-registry.js';
import { parseNpmSpec, parsePathSpec, isExactSemver } from '../opencode/plugin-spec.js';
import { registerOpenCodeRoutes } from '../opencode/routes.js';
import { getProviderSources, removeProviderConfig, upsertProviderConfig } from '../opencode/providers.js';
import { getAgentSources, getAgentConfig, getAgentPermissions, createAgent, updateAgent, deleteAgent, listDisabledAgents } from '../opencode/agents.js';
import { getCommandSources, getCommandConfig, createCommand, updateCommand, deleteCommand } from '../opencode/commands.js';
import { listMcpConfigs, getMcpConfig, createMcpConfig, updateMcpConfig, deleteMcpConfig } from '../opencode/mcp.js';
import { listSnippets, getSnippet, createSnippet, updateSnippet, deleteSnippet, expandSnippets, previewSnippet } from '../snippets/snippets.js';
import {
  listPluginEntries,
  getPluginEntry,
  readGlobalPluginEntries,
  addGlobalPluginEntry,
  createPluginEntry,
  updatePluginEntry,
  deletePluginEntry,
  setPluginEntryEnabled,
  setPluginFileEnabled,
  listPluginDirFiles,
  readPluginDirFile,
  writePluginDirFile,
  deletePluginDirFile,
  encodePluginId,
  decodePluginId,
} from '../opencode/plugins.js';
import { SKILL_DIR, SKILL_SCOPE } from '../opencode/config-files.js';
import { readSkillSupportingFile, writeSkillSupportingFile, deleteSkillSupportingFile } from '../opencode/skill-files.js';
import { getSkillSources, discoverSkills, mergeDiscoveredSkills, createSkill, updateSkill, deleteSkill, renameSkill, isManagedSkillPath } from '../opencode/skills.js';
import { getCuratedSkillsSources } from '../skills-catalog/curated-sources.js';
import { getCacheKey, scanWithCache } from '../skills-catalog/cache.js';
import { parseSkillRepoSource } from '../skills-catalog/source.js';
import { scanSkillsRepository } from '../skills-catalog/scan.js';
import { installSkillsFromRepository } from '../skills-catalog/install.js';
import { fetchGitHubRepoMetas } from '../skills-catalog/github-meta.js';
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
import crypto from 'node:crypto';
import { createSourceControlAuthStore } from '../source-control/auth-storage.js';
import { createSourceControlProviders } from '../source-control/provider-registry.js';
import { createOutboundHandles } from '../source-control/outbound-handles.js';
import { createExtensionProviders } from '../source-control/extension-providers.js';
import { createTrackerRegistry } from '../trackers/registry.js';
import { registerTrackerRoutes } from '../trackers/routes.js';
import { SOURCE_CONTROL_OUTBOUND_PATH, TRACKER_OUTBOUND_PATH } from 'ohpichamber-sdk';
import { createExtensionTrackers } from '../trackers/extension-trackers.js';
import { createTrackerAccounts, trackerAccountsPersistPath } from '../trackers/extension-accounts.js';
import { createTrackerOAuth } from '../trackers/extension-oauth.js';
import { registerNotificationChannelRoutes } from '../notifications/channel-routes.js';
import { registerAutoReviewRoutes } from '../auto-review/runtime.js';
import { registerPrWatchRoutes } from '../pr-watch/runtime.js';
import { registerProviderLogoRoutes } from './provider-logo-routes.js';
import { createSshPassphraseStore } from '../git/ssh-passphrases.js';
import { setHostCallbackRoute } from '../guests/host-callback.js';
import { createGitCredentialResolver, createHttpsCredentialReference, parseGitCredentialReference } from '../git/credential-resolver.js';
import { createGitRepositoryCredentialRuntime } from '../git/repository-credential-runtime.js';
import { managedSshCommand } from '../git/network-operations.js';
import { createNetworkOperations, createTrustedDirectoriesConfig } from '../git/network-operations.js';
import { createManagedSshCredentialStore } from '../git/ssh-credential-storage.js';
import { createManagedSshInventory } from '../git/credentials.js';
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
import { createSshPassphraseStore } from '../git/ssh-passphrases.js';
import { openCodeCredentialSource } from './auth.js';
========
import { createSshPassphraseStore } from '../git/ssh-passphrases.js';
import { openCodeCredentialSource } from '../opencode/auth.js';
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
import { createContributorProvenanceStore } from '../git/contributor-provenance-storage.js';
import { createGitNetworkOperationStore } from '../git/network-operation-storage.js';
import { readEffectiveGitTransportRevision } from '../git/transport-config.js';
import {
  completeWorktreeCheckoutHydration, configureRepositoryTransport,
  deleteBranch as deleteBranchService, isGitRepository as isGitRepositoryService,
  removeWorktree as removeWorktreeService, waitForActiveWorktreeBootstrap, getWorktreeBootstrapStatus,
  stashPush as gitStashPushService, getPathsWithoutChanges as gitPathsWithoutChangesService,
  stashApply as gitStashApplyService, stashDrop as gitStashDropService,
  listStashes as gitListStashesService, getBranches as gitBranchesService,
} from '../git/service.js';
import { fillSessionWorktreeMoveBridge } from '../openchamber-sessions/worktree-move-bridge.js';
import { OpenChamberControlError } from '../openchamber-control/error.js';
import { worktreeSetupOf } from '../projects/worktree-setup.js';
import { createPrivateRepositoryIdentityResolver } from '../source-control/repository-identity.js';
import { createSourceControlAuditStore } from '../source-control/audit-storage.js';
import type { Application } from '../shared/http-contracts.js';
import type { WalkthroughRouteService, PullRequestOptions } from '../walkthrough/routes.js';
import type { createTrackerRegistry } from '../trackers/registry.js';
import type { createTrackerSessionStatus } from '../trackers/session-status.js';
import type { createNotificationEmitterRuntime } from '../notifications/emitter-runtime.js';
import type { SseWriter } from '../notifications/contracts.js';
import type { GlobalMessageStreamHub } from '../event-stream/global-hub.js';
import type { createSettingsRuntime } from '../settings/settings-runtime.js';
import type { createSettingsHelpers } from '../settings/settings-helpers.js';
import type { createProjectDirectoryRuntime } from '../projects/project-directory-runtime.js';
import type { createOpenCodeNetworkRuntime } from '../opencode/network-runtime.js';
import type { createExtensionNotificationChannels } from '../notifications/extension-channels.js';
import type { createWorktreeBootstrapStore } from '../git/worktree-bootstrap-storage.js';
import type { HydrationRequirement, ProviderAccount, TransportAuthority } from '../git/network-plan-contracts.js';
import { isString } from '../shared/object-guards.js';
import type { createMergeFollowRuntime } from '../github/merge-follow.js';

<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
export const createFeatureRoutesRuntime = () => {
  let skillRepositoryDependencies = null;
  let themeFolderWatch = null;
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
export const createFeatureRoutesRuntime = (dependencies) => {
  // `trackers` is the tracker registry the server builds once (`index.js`):
  // routes, tracked-item readers, the read cache and guest host access.
  // `trackerSessionStatus` is its session-comment fan-out, told when an
  // extension's tracker leaves.
  const {
    clientReloadDelayMs,
    trackers,
    trackerSessionStatus,
    pluginSwitchStore,
    isPluginSwitchAvailable,
    refreshPluginSwitches,
  } = dependencies;
========
type PluginRouteOptions = Parameters<typeof registerPluginRoutes>[1];
type FeatureRuntimeDependencies = Required<Pick<PluginRouteOptions, 'pluginSwitchStore' | 'isPluginSwitchAvailable' | 'refreshPluginSwitches'>> & {
  clientReloadDelayMs: number;
  trackers: ReturnType<typeof createTrackerRegistry>;
  trackerSessionStatus: Pick<ReturnType<typeof createTrackerSessionStatus>, 'forget'> | null;
};

type FsOptions = Parameters<typeof registerFsRoutes>[1];
type IconOptions = Parameters<typeof registerProjectIconRoutes>[1];
type SessionOptions = Parameters<typeof registerOpenChamberSessionRoutes>[1];
type GuestOptions = Parameters<typeof registerGuestRoutes>[1];
type SettingsRuntime = ReturnType<typeof createSettingsRuntime>;
interface ChangeRequestWorktreeInput<Source> {
  mode: 'existing';
  branchName: string;
  worktreeName: string;
  changeRequestSource: Source;
  startCommand?: string;
  createCommand?: string;
}
type ScheduledTaskOptions = Parameters<typeof registerScheduledTaskRoutes>[1];
type EventClient = ReturnType<ScheduledTaskOptions['getOpenChamberEventClients']> extends Set<infer Client> ? Client & SseWriter & { openchamberConnectionId?: string } : never;
type RouteDependencies =
  & Pick<FsOptions, 'os' | 'path' | 'fsPromises' | 'spawn' | 'normalizeDirectoryPath' | 'buildAugmentedPath' | 'resolveGitBinaryForSpawn' | 'openchamberUserConfigRoot'>
  & Required<Pick<FsOptions, 'managedChatsRoot'>>
  & Pick<IconOptions, 'createFsSearchRuntime' | 'openchamberDataDir'>
  & Required<Pick<SessionOptions, 'validateDirectoryPath' | 'waitForOpenCodeReady' | 'emitSessionCreatedEvent'>>
  & Required<Pick<GuestOptions, 'onGuestDeactivated' | 'surfaceViewerHeaders' | 'openchamberVersion'>>
  & Pick<SettingsRuntime, 'readSettingsFromDisk' | 'readSettingsFromDiskMigrated' | 'persistSettings' | 'persistResolvedSettings'>
  & Pick<ReturnType<typeof createProjectDirectoryRuntime>, 'resolveProjectDirectory' | 'resolveOptionalProjectDirectory'>
  & Pick<Parameters<typeof registerSettingsUtilityRoutes>[1], 'readCustomThemesFromDisk' | 'saveImportedTheme' | 'deleteImportedTheme' | 'refreshOpenCodeAfterConfigChange'>
  & Pick<Parameters<typeof registerOpenCodeRoutes>[1], 'crypto' | 'getOpenCodeResolutionSnapshot' | 'getOpenCodeUpgradeCapability' | 'upgradeOpenCodeCli' | 'getOpenCodeCompatibility' | 'installOpenCodeV2'>
  & Pick<ScheduledTaskOptions, 'projectConfigRuntime' | 'scheduledTasksRuntime' | 'sanitizeProjects'>
  & Required<Pick<ScheduledTaskOptions, 'scheduledTaskService'>>
  & Pick<Parameters<typeof registerSkillRoutes>[1], 'sanitizeSkillCatalogs' | 'isUnsafeSkillRelativePath' | 'getOpenCodePort'>
  & {
    fs: typeof import('node:fs');
    formatSettingsResponse: ReturnType<typeof createSettingsHelpers>['formatSettingsResponse'];
    buildOpenCodeUrl: ReturnType<typeof createOpenCodeNetworkRuntime>['buildOpenCodeUrl'];
    getOpenCodeAuthHeaders: () => Record<string, string>;
    messageSearchRuntime: Parameters<typeof registerMessageSearchRoutes>[1]['messageSearchRuntime'];
    sessionWarmingRuntime: Parameters<typeof registerSessionWarmingRoutes>[1]['sessionWarmingRuntime'];
    sessionTodosRuntime: Parameters<typeof registerSessionTodosRoutes>[1]['sessionTodosRuntime'];
    onExtensionSessionEventsChanged?: () => void | Promise<void>;
    onExtensionWaitsChanged?: () => void | Promise<void>;
    extensionNotificationChannels?: ReturnType<typeof createExtensionNotificationChannels> | null;
    getOpenCodePluginDelivery?: NonNullable<NonNullable<GuestOptions['opencodePlugins']>['delivery']>;
    builtInExtensionsDir?: string | undefined;
    customThemesDir?: string | null;
    getOwnPorts: Parameters<typeof registerDevServerRoutes>[1]['getOwnPorts'];
    getActivePort?: () => number | null;
    getActiveHost?: () => string | null;
    devServerScanner: Parameters<typeof registerDevServerRoutes>[1]['scanner'];
    environmentStore: Parameters<typeof registerEnvironmentRoutes>[1]['store'];
    environmentRuntime: NonNullable<FsOptions['environmentRuntime']>;
    listConfiguredProjects: Parameters<typeof registerEnvironmentRoutes>[1]['listProjects'];
    projectContextRuntime: Parameters<typeof registerProjectContextRoutes>[1]['projectContextRuntime'];
    agentMemoryRuntime: Parameters<typeof registerAgentMemoryRoutes>[1]['agentMemoryRuntime'];
    isAgentMemoryEnabled: NonNullable<Parameters<typeof registerAgentMemoryRoutes>[1]['isAgentMemoryEnabled']>;
    sessionKnowledgeRuntime: Parameters<typeof registerSessionKnowledgeRoutes>[1]['sessionKnowledgeRuntime'];
    openChamberSessionService: NonNullable<SessionOptions['sessionService']>;
    openChamberControlService: Parameters<typeof registerOpenChamberControlRoutes>[1]['controlService'];
    getOpenChamberEventClients: () => Set<EventClient>;
    writeSseEvent: ReturnType<typeof createNotificationEmitterRuntime>['writeSseEvent'];
    permissionAutoAcceptRuntime: Parameters<typeof registerPermissionAutoAcceptRoutes>[1];
    worktreeBootstrapStore: ReturnType<typeof createWorktreeBootstrapStore>;
    scheduledWorktreeBridge: Parameters<typeof fillScheduledWorktreeBridge>[0];
    messageQueueRuntime: Parameters<typeof registerMessageQueueRoutes>[1];
    autoReviewRuntime: Parameters<typeof registerAutoReviewRoutes>[1];
    prWatchRuntime?: Parameters<typeof registerPrWatchRoutes>[1] | null;
    extensionWaitsRuntime?: Parameters<typeof registerExtensionWaitsRoutes>[1] | null;
    laterPagesRuntime?: Parameters<typeof registerOpenChamberControlRoutes>[1]['laterPages'];
    mergeFollowRuntime?: ReturnType<typeof createMergeFollowRuntime> | null;
    routingRuntime: Parameters<typeof registerRoutingRoutes>[1];
    globalEventHub: GlobalMessageStreamHub | null;
    workflowRuntime?: Parameters<typeof registerWorkflowRoutes>[1] | null;
  };

export const createFeatureRoutesRuntime = (dependencies: FeatureRuntimeDependencies) => {
  const {
    clientReloadDelayMs,
    trackers,
    trackerSessionStatus,
    pluginSwitchStore,
    isPluginSwitchAvailable,
    refreshPluginSwitches,
  } = dependencies;
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
  const gitRuntimeIdentity = Object.freeze({
    id: `server_${crypto.randomUUID()}`,
    platform: process.env.OPENCHAMBER_RUNTIME === 'desktop' ? 'desktop' : 'web',
  });
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js

  let quotaProviders = null;
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js

  let themeFolderWatch = null;
  let stopGuestPackageWatch = () => {};
  let quotaProviders = null;
========
  let themeFolderWatch: ReturnType<typeof createThemeFolderWatch> | null = null;
  let stopGuestPackageWatch: () => void = () => {};
  let quotaProviders: typeof import('../quota/index.js') | null = null;
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
  const getQuotaProviders = async () => {
    if (!quotaProviders) {
      quotaProviders = await import('../quota/index.js');
    }
    return quotaProviders;
  };

  let smallModelService: typeof import('../small-model/index.js') | null = null;
  const getSmallModelService = async () => {
    if (!smallModelService) {
      smallModelService = await import('../small-model/index.js');
    }
    return smallModelService;
  };

<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
  let walkthroughService = null;
  let magicPromptOverridesForDirectory;
  let walkthroughBindingService = null;
  let gitRepositoryCredentialRuntime = null;
  let networkOperations = null;
  let gitWorktreeCreation = null;
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
  let walkthroughService = null;
  let walkthroughBindingService = null;
  let magicPrompts = null;
  let gitRepositoryCredentialRuntime = null;
  let networkOperations = null;
  let gitWorktreeCreation = null;
========
  let walkthroughService: WalkthroughRouteService | null = null;
  let walkthroughBindingService: ReturnType<typeof registerSourceControlRoutes> | null = null;
  let magicPrompts: ReturnType<typeof registerMagicPromptRoutes> | null = null;
  let gitRepositoryCredentialRuntime: ReturnType<typeof createGitRepositoryCredentialRuntime> | null = null;
  let networkOperations: ReturnType<typeof createNetworkOperations> | null = null;
  let gitWorktreeCreation: ReturnType<typeof registerGitRoutes> | null = null;
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
  const getWalkthroughService = async () => {
    if (!walkthroughService) {
      const [service, pullRequest] = await Promise.all([
        import('../walkthrough/index.js'),
        import('../walkthrough/pull-request.js'),
      ]);
      walkthroughService = {
        ...service,
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
        // Forward only the request options by name: the remaining slots are
        // dependency overrides and must not be reachable from a route.
        getPullRequestDiff: (directory, number, readContext, { allowEmpty, sourceRepo, revision } = {}) => pullRequest.getPullRequestDiff(
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
        // The reader's preferences, the Walkthrough Magic Prompt as the
        // directory's project or global overrides set it. It has no built-in
        // text, so no override means none.
        readWalkthroughInstructions: async (directory) => (
          magicPrompts ? (await magicPrompts.overridesForDirectory(directory))['walkthrough.instructions'] ?? '' : ''
        ),
        // Forward only the request options by name: the remaining slots are
        // dependency overrides and must not be reachable from a route.
        getPullRequestDiff: (directory, number, readContext, { allowEmpty, sourceRepo, revision } = {}) => pullRequest.getPullRequestDiff(
========
        readWalkthroughInstructions: async (directory) => (
          magicPrompts ? (await magicPrompts.overridesForDirectory(directory))['walkthrough.instructions'] ?? '' : ''
        ),
        getPullRequestDiff: (directory, number, readContext, { allowEmpty, sourceRepo, revision }: Partial<PullRequestOptions> = {}) => pullRequest.getPullRequestDiff(
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
          directory,
          number,
          readContext,
          {
            allowEmpty,
            sourceRepo,
            revision,
            onAccountUnavailable: walkthroughBindingService?.accountUnavailable,
            readChangeRequestPatch: walkthroughBindingService?.readChangeRequestPatch,
          },
        ),
        getPullRequestFileContents: (directory, number, readContext, { path, previousPath, status, sourceRepo, revision }) => pullRequest.getPullRequestFileContents(
          directory,
          number,
          readContext,
          {
            path,
            previousPath,
            status,
            sourceRepo,
            revision,
            onAccountUnavailable: walkthroughBindingService?.accountUnavailable,
            readChangeRequestFile: walkthroughBindingService?.readChangeRequestFile,
          },
        ),
        readWalkthroughInstructions: async (directory) => {
          if (!magicPromptOverridesForDirectory) throw new Error('Magic prompt reader is unavailable');
          const overrides = await magicPromptOverridesForDirectory(directory);
          return overrides['walkthrough.instructions'] ?? '';
        },
      };
    }
    return walkthroughService;
  };

<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
  const hydrateBoundCheckout = async ({ directory, parentDirectory, parentRemoteName }) => {
    if (!(networkOperations?.hydrateBoundCheckout instanceof Function)
      || !(walkthroughBindingService?.get instanceof Function)) {
      throw Object.assign(new Error('Worktree checkout hydration is unavailable'), {
        code: 'RUNTIME_UNSUPPORTED',
      });
    }
    // An unbound repository hydrates through the machine's own Git for every
    // remote, the same way it pushes; its authority is the unbound revision.
    const bindingRead = await walkthroughBindingService.get(parentDirectory);
    const repositoryAuthority = {
      repositoryId: bindingRead.repository.repositoryId,
      bindingRevision: bindingRead.revision,
      configRevision: bindingRead.repository.configRevision,
    };
    return networkOperations.hydrateBoundCheckout({
      directory,
      parentRemoteName,
      repositoryAuthority,
    });
  };

  /**
   * A worktree from a pull or merge request given by number, the same kind
   * the New worktree dialog makes: the server reads the change request with
   * the project's own account and creates the worktree through the Git
   * routes' contributor pipeline. `name` and `branchName` default to the
   * change request's head branch. `startCommand` holds the project's setup
   * commands, as the dialog sends them; a contributor fork's worktree
   * records them without running them (`../git/DOCUMENTATION.md`).
   */
  const createChangeRequestWorktree = async ({ directory, number, name, branchName, startCommand }) => {
    if (!(gitWorktreeCreation?.createWorktree instanceof Function)
      || !(walkthroughBindingService?.resolveChangeRequestWorktreeSource instanceof Function)) {
      throw Object.assign(new Error('Worktrees from pull requests are unavailable'), {
        code: 'RUNTIME_UNSUPPORTED', status: 501,
      });
    }
    const { headBranch, sourceRequest } = await walkthroughBindingService.resolveChangeRequestWorktreeSource({ directory, number });
    const branch = branchName || headBranch;
    const input = {
      mode: 'existing',
      branchName: branch,
      worktreeName: name || branch,
      changeRequestSource: sourceRequest,
    };
    if (startCommand) input.startCommand = startCommand;
    return gitWorktreeCreation.createWorktree(directory, input);
  };
========
  const hydrateBoundCheckout = async ({ directory, parentDirectory, parentRemoteName }: { directory: string; parentDirectory: string; parentRemoteName: string }) => {
    if (!(networkOperations?.hydrateBoundCheckout instanceof Function)
      || !(walkthroughBindingService?.get instanceof Function)) {
      throw Object.assign(new Error('Worktree checkout hydration is unavailable'), {
        code: 'RUNTIME_UNSUPPORTED',
      });
    }
    const bindingRead = await walkthroughBindingService.get(parentDirectory);
    const repositoryAuthority = {
      repositoryId: bindingRead.repository.repositoryId,
      bindingRevision: bindingRead.revision,
      configRevision: bindingRead.repository.configRevision,
    };
    return networkOperations.hydrateBoundCheckout({
      directory,
      parentRemoteName,
      repositoryAuthority,
    });
  };

  const createChangeRequestWorktree = async ({ directory, number, name, branchName, startCommand, createCommand }: {
    directory: string; number: number; name?: string; branchName?: string; startCommand?: string; createCommand?: string;
  }) => {
    if (!(gitWorktreeCreation?.createWorktree instanceof Function)
      || !(walkthroughBindingService?.resolveChangeRequestWorktreeSource instanceof Function)) {
      throw Object.assign(new Error('Worktrees from pull requests are unavailable'), {
        code: 'RUNTIME_UNSUPPORTED', status: 501,
      });
    }
    const { headBranch, sourceRequest } = await walkthroughBindingService.resolveChangeRequestWorktreeSource({ directory, number });
    const branch = branchName || headBranch;
    const input: ChangeRequestWorktreeInput<typeof sourceRequest> = {
      mode: 'existing',
      branchName: branch,
      worktreeName: name || branch,
      changeRequestSource: sourceRequest,
    };
    if (startCommand) input.startCommand = startCommand;
    if (createCommand) input.createCommand = createCommand;
    return gitWorktreeCreation.createWorktree(directory, input);
  };
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts

  const registerRoutes = async (app: Application, routeDependencies: RouteDependencies) => {
    const {
      messageSearchRuntime,
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      sessionWarmingRuntime,
========
      sessionWarmingRuntime,
      sessionTodosRuntime,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      crypto,
      os,
      path,
      fsPromises,
      spawn,
      resolveGitBinaryForSpawn,
      createFsSearchRuntime,
      openchamberDataDir,
      onGuestDeactivated,
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      onExtensionSessionEventsChanged = () => {},
      extensionNotificationChannels = null,
========
      onExtensionSessionEventsChanged = () => {},
      onExtensionWaitsChanged = () => {},
      extensionNotificationChannels = null,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      surfaceViewerHeaders,
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      // How an extension's OpenCode plugin reaches OpenCode right now (`guests/opencode-plugin.js`).
      getOpenCodePluginDelivery = () => 'file',
========
      getOpenCodePluginDelivery = () => 'file',
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      openchamberUserConfigRoot,
      managedChatsRoot,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      validateDirectoryPath,
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      // Absent in tests; without it the themes folder is not watched.
      customThemesDir = null,
========
      customThemesDir = null,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      readCustomThemesFromDisk,
      saveImportedTheme,
      deleteImportedTheme,
      readSettingsFromDisk,
      readSettingsFromDiskMigrated,
      persistSettings,
      sanitizeProjects,
      sanitizeSkillCatalogs,
      getOwnPorts,
      devServerScanner,
      buildAugmentedPath,
      environmentStore,
      environmentRuntime,
      listConfiguredProjects,
      projectConfigRuntime,
      projectContextRuntime,
      sessionKnowledgeRuntime,
      scheduledTasksRuntime,
      scheduledTaskService,
      openChamberSessionService,
      openChamberControlService,
      getOpenChamberEventClients,
      writeSseEvent,
      worktreeBootstrapStore,
      messageQueueRuntime,
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      autoReviewRuntime,
      prWatchRuntime = null,
      mergeFollowRuntime = null,
========
      autoReviewRuntime,
      prWatchRuntime = null,
      extensionWaitsRuntime = null,
      laterPagesRuntime = null,
      mergeFollowRuntime = null,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      routingRuntime,
      permissionAutoAcceptRuntime,
      globalEventHub,
      resolveWorkspaceScope,
      resolveWorkspaceDirectory,
      resolveRepositoryWorkspace,
      resolveSessionScope,
      resolveHostSessionScope,
      listQueueScopes,
      resolveQuotaSelection,
      listQuotaSelections,
      resolveCredential,
      resolvePrimaryWorktreeRoot,
      resolveWorktreeTopLevel,
      sessionWorktreeMoveBridge,
      readWorktreeSetup,
      openchamberVersion,
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      // Absent in builds without workflows; their routes are then not served.
      workflowRuntime = null,
========
      workflowRuntime = null,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    } = routeDependencies;

    registerSettingsUtilityRoutes(app, {
      readCustomThemesFromDisk,
      saveImportedTheme,
      deleteImportedTheme,
    });

<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    const customThemesDir = routeDependencies.themesDir ?? (openchamberUserConfigRoot ? path.join(openchamberUserConfigRoot, 'themes') : null);
    themeFolderWatch?.stop();
    themeFolderWatch = customThemesDir
      ? createThemeFolderWatch({
        fsPromises,
        path,
        themesDir: customThemesDir,
        onChange: () => {
          const clients = getOpenChamberEventClients();
          for (const client of clients) {
            try {
              writeSseEvent(client, { type: 'openchamber:themes-changed', properties: {} });
            } catch {
              clients.delete(client);
            }
          }
        },
      })
      : null;

    registerMessageQueueRoutes(app, messageQueueRuntime, { resolveSessionScope: resolveHostSessionScope, listQueueScopes });
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    registerPermissionAutoAcceptRoutes(app, permissionAutoAcceptRuntime);
    registerMessageQueueRoutes(app, messageQueueRuntime);
    registerAutoReviewRoutes(app, autoReviewRuntime);
    if (prWatchRuntime) registerPrWatchRoutes(app, prWatchRuntime);
========
    registerPermissionAutoAcceptRoutes(app, permissionAutoAcceptRuntime);
    registerMessageQueueRoutes(app, messageQueueRuntime);
    registerAutoReviewRoutes(app, autoReviewRuntime);
    if (prWatchRuntime) registerPrWatchRoutes(app, prWatchRuntime);
    if (extensionWaitsRuntime) registerExtensionWaitsRoutes(app, extensionWaitsRuntime);
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    registerRoutingRoutes(app, routingRuntime);
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    registerPermissionAutoAcceptRoutes(app, permissionAutoAcceptRuntime);
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // Before the generic OpenCode proxy: swallows the `openchamber/auto` model
    // switch and routes the sends that follow it.
    registerRoutingPromptRewrite(app, routingRuntime);
========
    registerRoutingPromptRewrite(app, routingRuntime);
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts

<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    registerOpenCodeRoutes(app, {
      crypto,
      clientReloadDelayMs,
      getOpenCodeResolutionSnapshot,
      getOpenCodeUpgradeCapability,
      upgradeOpenCodeCli,
      getOpenCodeCompatibility,
      installOpenCodeV2,
      formatSettingsResponse,
      readSettingsFromDiskMigrated,
      persistSettings,
      resolveProjectDirectory,
      getProviderSources,
      removeProviderConfig,
      upsertProviderConfig,
      refreshOpenCodeAfterConfigChange,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
    });
========
    registerOpenCodeRoutes(app, {
      crypto,
      getOpenCodeResolutionSnapshot,
      getOpenCodeUpgradeCapability,
      upgradeOpenCodeCli,
      getOpenCodeCompatibility,
      installOpenCodeV2,
      formatSettingsResponse,
      readSettingsFromDiskMigrated,
      persistSettings,
      resolveProjectDirectory,
      getProviderSources,
      removeProviderConfig,
      upsertProviderConfig,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
    });
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts

    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir,
      sanitizeProjects,
      readSettingsFromDiskMigrated,
      persistSettings,
      createFsSearchRuntime,
      spawn,
      resolveGitBinaryForSpawn,
    });

    registerScheduledTaskRoutes(app, {
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      projectConfigRuntime,
      scheduledTasksRuntime,
      scheduledTaskService,
      getOpenChamberEventClients,
      writeSseEvent,
    });

    registerOpenChamberSessionRoutes(app, {
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
      isRequestOriginAllowed: routeDependencies.isRequestOriginAllowed,
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      validateDirectoryPath,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      waitForOpenCodeReady,
      emitSessionCreatedEvent,
========
      readSettingsFromDiskMigrated,
      sanitizeProjects,
      validateDirectoryPath,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      waitForOpenCodeReady,
      emitSessionCreatedEvent,
      worktreeBootstrapStore,
      hydrateWorktreeCheckout: hydrateBoundCheckout,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      sessionService: openChamberSessionService,
    });

<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    registerOpenChamberControlRoutes(app, { controlService: openChamberControlService });
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    registerOpenChamberControlRoutes(app, { controlService: openChamberControlService });
    if (workflowRuntime) registerWorkflowRoutes(app, workflowRuntime);
========
    registerOpenChamberControlRoutes(app, { controlService: openChamberControlService, laterPages: laterPagesRuntime });
    if (workflowRuntime) registerWorkflowRoutes(app, workflowRuntime);
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts

    // Agent workflows, present only in a build with OPENCHAMBER_WORKFLOWS_ENABLE.
    routeDependencies.workflows?.register(app);

    if (routeDependencies.autoReviewRuntime) registerAutoReviewRoutes(app, routeDependencies.autoReviewRuntime);
    if (routeDependencies.prWatchRuntime) registerPrWatchRoutes(app, routeDependencies.prWatchRuntime);
    registerProviderLogoRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir,
      readSettingsFromDiskMigrated,
      persistResolvedSettings: routeDependencies.persistResolvedSettings ?? persistSettings,
    });
    registerMarkdownImageGrantRoutes(app, {
      fsPromises,
      path,
      crypto,
      sessionService: openChamberSessionService,
      resolveSessionScope,
      approvedTempRoot: os.tmpdir(),
    });

<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js


    const { getProfile, getGlobalIdentity, resolveRepositoryGitPaths } = await import('../git/index.js');

    // Extension usage providers read their own service; the catalog row is
    // re-read per request, so pause, removal or a withdrawn grant drops the
    // provider without a second registry to keep in step.
    const extensionQuotaGuests = () => listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) });
    registerQuotaRoutes(app, {
      getQuotaProviders, resolveQuotaSelection, listQuotaSelections, resolveCredential,
      listExtensionQuotaGuests: extensionQuotaGuests,
      // The extension's approved provider list, never the whole credential store.
      readExtensionCredential: async (req, guest, nativeProviderId) => {
        const selections = await listQuotaSelections(req).catch(() => []);
        const selection = selections.find((entry) => entry.providerId === nativeProviderId) ?? null;
        if (!selection) return null;
        // The resolver takes exactly its request fields; a selection also
        // carries public catalog fields it would reject as unknown keys.
        const { workspaceId, agentDirectoryId, providerId, credentialRef } = selection;
        return resolveCredential({ workspaceId, agentDirectoryId, providerId, credentialRef, purpose: 'quota' }).catch(() => null);
      },
      requestExtensionService: (guest, params) => proxyGuestServiceRequest({
        guestId: guest.id,
        guestName: guest.name,
        packageRoot: guest.packageRoot,
        service: guest.service,
        granted: guest.capabilityGrants,
        persistPath: extensionsPersistPath(openchamberDataDir),
        // One process per extension a panel ever touched otherwise stays for good.
        idleStopMs: guest.service.keepRunning ? undefined : 10 * 60_000,
        ...params,
      }),
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    registerConfigEntityRoutes(app, {
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      refreshOpenCodeAfterConfigChange,
      clientReloadDelayMs,
      getAgentSources,
      getAgentConfig,
      getAgentPermissions,
      listDisabledAgents,
      createAgent,
      updateAgent,
      deleteAgent,
      getCommandSources,
      getCommandConfig,
      createCommand,
      updateCommand,
      deleteCommand,
      listMcpConfigs,
      getMcpConfig,
      createMcpConfig,
      updateMcpConfig,
      deleteMcpConfig,
      listSnippets,
      getSnippet,
      createSnippet,
      updateSnippet,
      deleteSnippet,
      expandSnippets,
      previewSnippet,
========
    registerConfigEntityRoutes(app, {
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      getAgentSources,
      getAgentConfig,
      getAgentPermissions,
      listDisabledAgents,
      createAgent,
      updateAgent,
      deleteAgent,
      getCommandSources,
      getCommandConfig,
      createCommand,
      updateCommand,
      deleteCommand,
      listMcpConfigs,
      getMcpConfig,
      createMcpConfig,
      updateMcpConfig,
      deleteMcpConfig,
      listSnippets,
      getSnippet,
      createSnippet,
      updateSnippet,
      deleteSnippet,
      expandSnippets,
      previewSnippet,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    });
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js

    registerPluginRoutes(app, {
      resolveOptionalProjectDirectory,
      refreshOpenCodeAfterConfigChange,
      clientReloadDelayMs,
      listPluginEntries,
      getPluginEntry,
      createPluginEntry,
      updatePluginEntry,
      deletePluginEntry,
      setPluginEntryEnabled,
      setPluginFileEnabled,
      listPluginDirFiles,
      readPluginDirFile,
      writePluginDirFile,
      deletePluginDirFile,
      encodePluginId,
      decodePluginId,
      getNpmInfo,
      parseNpmSpec,
      parsePathSpec,
      isExactSemver,
      pluginSwitchStore,
      isPluginSwitchAvailable,
      refreshPluginSwitches,
    });

    const { getProfiles, getProfile, getGlobalIdentity, resolveRepositoryGitPaths } = await import('../git/index.js');

    registerQuotaRoutes(app, { getQuotaProviders });
    registerSmallModelRoutes(app, { getSmallModelService });
    registerSessionGoalRoutes(app);
========

    registerPluginRoutes(app, {
      resolveOptionalProjectDirectory,
      listPluginEntries,
      getPluginEntry,
      createPluginEntry,
      updatePluginEntry,
      deletePluginEntry,
      setPluginEntryEnabled,
      setPluginFileEnabled,
      listPluginDirFiles,
      readPluginDirFile,
      writePluginDirFile,
      deletePluginDirFile,
      encodePluginId,
      decodePluginId,
      getNpmInfo,
      parseNpmSpec,
      parsePathSpec,
      isExactSemver,
      pluginSwitchStore,
      isPluginSwitchAvailable,
      refreshPluginSwitches,
    });

    const { getProfiles, getProfile, getGlobalIdentity, resolveRepositoryGitPaths } = await import('../git/index.js');

    registerQuotaRoutes(app, { getQuotaProviders });
    registerSmallModelRoutes(app, { getSmallModelService });
    registerSessionGoalRoutes(app);
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    const gitBinary = resolveGitBinaryForSpawn();
    const sourceControlAuthStore = createSourceControlAuthStore({
      filePath: path.join(openchamberDataDir, 'source-control-auth.json'),
      refreshOAuthToken: async ({ provider, origin, refreshToken }) => {
        const impl = await sourceControlProviders.implementation(provider);
        if (!(impl?.auth.refreshOAuthToken instanceof Function)) throw new Error('Source control OAuth renewal is unavailable');
        return impl.auth.refreshOAuthToken({ instance: origin, refreshToken });
      },
    });
    const sourceControlOutboundHandles = createOutboundHandles();
    setHostCallbackRoute(SOURCE_CONTROL_OUTBOUND_PATH, {
      refusal: sourceControlOutboundHandles.refusal,
      serve: sourceControlOutboundHandles.serve,
    });
    const sourceControlProviders = createSourceControlProviders({
      authStore: sourceControlAuthStore,
      extensionServices: {
        handles: sourceControlOutboundHandles,
        persistPath: extensionsPersistPath(openchamberDataDir),
        currentGuest: async (guestId) => (await listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }))
          .find((guest) => guest.id === guestId) ?? null,
        reconcile: () => extensionSourceControlProviders.reconcile(),
      },
      readSettings: readSettingsFromDisk,
      configRoot: openchamberDataDir,
      hostServices: {
        github: {
          readContributorProvenance: (directory: string) => contributorProvenance.read(directory),
        },
      },
    });
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    // Tracker ids share the provider-id namespace with source control, so an
    // overlap fails at startup instead of shadowing a provider.
    const trackers = createTrackerRegistry(undefined, {
      foreignIds: sourceControlProviders.list().map((descriptor) => descriptor.id),
    });
    // The exact credential behind an account reference, as a neutral Git
    // transport credential: a stored account, or a CLI login the user
    // switched to, so Git transport accepts what reads do.
    const resolveSourceControlAccount = ({ provider, instance, accountId, credentialRevision }) => sourceControlProviders
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // The exact credential behind an account reference, as a neutral transport
    // credential (`secret`): a stored account, or a CLI login the user switched
    // to, so Git transport (fork PR worktrees, clones) accepts what reads do.
    const resolveSourceControlAccount = ({ provider, instance, accountId, credentialRevision }) => sourceControlProviders
========
    const resolveSourceControlAccount = ({ provider, instance, accountId, credentialRevision }: ProviderAccount & { credentialRevision?: number }) => sourceControlProviders
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      .readTransportCredential({ provider, instance, credentialId: accountId, credentialRevision });
    const resolveTransportRepository = createPrivateRepositoryIdentityResolver({
      getTransportRevision: (directory) => readEffectiveGitTransportRevision(directory, { gitBinary }),
    });
    const contributorProvenance = createContributorProvenanceStore({
      filePath: path.join(openchamberDataDir, 'git-contributor-provenance.json'),
      resolveRepositoryIdentity: resolveTransportRepository,
      resolveGitPaths: resolveRepositoryGitPaths,
      fsImpl: fsPromises,
    });
    const sourceControlAuditStore = createSourceControlAuditStore({
      filePath: path.join(openchamberDataDir, 'source-control-audit.json'),
      fsImpl: fsPromises,
    });
    const sshCredentialStore = createManagedSshCredentialStore({
      filePath: path.join(openchamberDataDir, 'git-ssh-credentials.json'),
      fsImpl: fsPromises,
    });
    const sshPassphraseSource = {
      list: async () => {
        try {
          const raw = await fsPromises.readFile(path.join(openchamberDataDir, 'git-ssh-passphrases.json'), 'utf8');
          const parsed = JSON.parse(raw);
          return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
          if (err?.code === 'ENOENT') return [];
          throw err;
        }
      },
      create: async (entry) => {
        const p = path.join(openchamberDataDir, 'git-ssh-passphrases.json');
        let list = [];
        try {
          const raw = await fsPromises.readFile(p, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list = parsed;
        } catch (err) {
          if (err?.code !== 'ENOENT') throw err;
        }
        const idx = list.findIndex((e) => e.id === entry.id);
        if (idx >= 0) list[idx] = entry;
        else list.push(entry);
        const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
        await fsPromises.writeFile(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
        await fsPromises.rename(tmp, p);
      },
      remove: async (id) => {
        const p = path.join(openchamberDataDir, 'git-ssh-passphrases.json');
        let list = [];
        try {
          const raw = await fsPromises.readFile(p, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list = parsed;
        } catch (err) {
          if (err?.code !== 'ENOENT') throw err;
        }
        list = list.filter((e) => e.id !== id);
        const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
        await fsPromises.writeFile(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
        await fsPromises.rename(tmp, p);
      },
    };
    const sshPassphrases = createSshPassphraseStore(sshPassphraseSource);
    const managedSshInventory = createManagedSshInventory({
      passphrases: sshPassphrases,
      store: sshCredentialStore,
      snapshotRoot: path.join(openchamberDataDir, 'git-ssh-operation-keys'),
      discoveryRoot: path.join(os.homedir(), '.ssh'),
      managedKeyRoot: path.join(openchamberDataDir, 'git-ssh-private-keys'),
      fsImpl: fsPromises,
    });
    const syncRepositoryTransport = async (directory: import('../source-control/binding-service-contracts.js').BindingIntentRequest['directory'], read: Awaited<ReturnType<ReturnType<typeof import('../source-control/binding-service.js').createBindingService>['get']>>) => {
      if (!isString(directory) || !directory.trim() || !gitRepositoryCredentialRuntime) return;
      const grants = (read?.binding?.remotes ?? []).filter((grant) => grant.readiness === 'ready' && grant.mode === 'managed' && grant.credentialId);
      let credentialHelper = null;
      let sshCommand = null;
      for (const grant of grants) {
        let reference;
        try { reference = parseGitCredentialReference(grant.credentialId); } catch { continue; }
        if (reference.transport === 'https') credentialHelper = gitRepositoryCredentialRuntime.helperCommand();
        if (reference.transport === 'ssh' && !sshCommand) {
          const key = await sshCredentialStore.lookup(reference.keyId);
          if (key?.privateKeyPath) sshCommand = managedSshCommand(key.privateKeyPath);
        }
      }
      await configureRepositoryTransport(directory, { credentialHelper, sshCommand });
    };
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    // Shared short-lived answers for provider reads; registered before the
    // source-control and tracker routes it fronts. A change made through them,
    // or a refresh the user asked for, also reads the followed items again.
    let trackedItemsService = null;
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // Shared short-lived answers for provider reads; registered before the
    // source-control and tracker routes it fronts. A change made through them,
    // or a refresh the user asked for, also reads the followed items again;
    // the tracked items service is created further down.
    let trackedItemsService = null;
========
    let trackedItemsService: ReturnType<typeof createTrackedItemsService> | null = null;
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    const providerReadCache = createProviderReadCache({
      sourceControlProviderIds: sourceControlProviders.list().map((descriptor) => descriptor.id),
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
      trackerIds: trackers.list(),
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      // Extension trackers attach and detach while the server runs.
      trackerIds: () => trackers.list(),
========
      trackerIds: () => trackers.list(),
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      onChange: (provider) => trackedItemsService?.refreshProvider(provider),
      onItemRefresh: (provider, item) => trackedItemsService?.refreshItem(provider, item),
    });
    app.use((req, res, next) => { providerReadCache.middleware(req, res, next); });
    walkthroughBindingService = registerSourceControlRoutes(app, {
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      onMutationSucceeded: (mutation) => mergeFollowRuntime?.onMutationSucceeded(mutation),
      onMutationStarting: (mutation) => mergeFollowRuntime?.onMutationStarting(mutation) ?? null,
========
      onMutationSucceeded: (mutation: Parameters<NonNullable<RouteDependencies['mergeFollowRuntime']>['onMutationSucceeded']>[0]) => mergeFollowRuntime?.onMutationSucceeded(mutation),
      onMutationStarting: (mutation: Parameters<NonNullable<RouteDependencies['mergeFollowRuntime']>['onMutationStarting']>[0]) => mergeFollowRuntime?.onMutationStarting(mutation) ?? null,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      onRepositoryTransportChanged: syncRepositoryTransport,
      validateManagedSshCredential: managedSshInventory.assertAvailable,
      readManagedSshCredentialPresentation: managedSshInventory.presentation,
      configRoot: openchamberDataDir,
      resolveTransportRepository,
      auditStore: sourceControlAuditStore,
      runtimeIdentity: gitRuntimeIdentity,
      providers: sourceControlProviders,
      readTransportAccount: resolveSourceControlAccount,
      resolveCheckoutAuxiliary: async ({ directory, parentEndpoint, parentRemoteName, kind, path: checkoutPath }: Pick<HydrationRequirement, 'kind' | 'path'> & {
        directory: string;
        parentEndpoint: TransportAuthority['endpoint'];
        parentRemoteName: string;
      }) => {
        if (!(networkOperations?.inspectCheckoutHydration instanceof Function)) return null;
        const inspection = await networkOperations.inspectCheckoutHydration({
          directory, parentEndpoint, parentRemoteName,
        });
        return inspection.requirements.find((entry) => entry.kind === kind && entry.path === checkoutPath) ?? null;
      },
    });
    registerWalkthroughRoutes(app, {
      getWalkthroughService,
      resolveWorkspaceDirectory,
      resolveRepositoryWorkspace,
      validateReadContext: walkthroughBindingService.validateReadContext,
    });
    const findEventClient = (connectionId: string) => {
      for (const client of getOpenChamberEventClients()) {
        if (client.openchamberConnectionId === connectionId) return client;
      }
      return null;
    };
    const trackedItemReaders = createTrackedItemReaders({ readLiveSummaries: walkthroughBindingService.readLiveSummaries, trackers });
    trackedItemsService = createTrackedItemsService({
      readers: trackedItemReaders,
      persistence: createTrackedItemsPersistence({ dataDir: openchamberDataDir }),
      isConnectionOpen: (connectionId) => findEventClient(connectionId) !== null,
      send: (connectionId, event) => {
        const client = findEventClient(connectionId);
        if (!client) return false;
        try {
          writeSseEvent(client, event);
          return true;
        } catch {
          getOpenChamberEventClients().delete(client);
          return false;
        }
      },
    });
    const TURN_SETTLE_MS = 3000;
    const settlingDirectories = new Map<string, ReturnType<typeof setTimeout>>();
    const announceTurnFinished = (directory: string) => {
      if (settlingDirectories.has(directory)) return;
      settlingDirectories.set(directory, setTimeout(() => {
        settlingDirectories.delete(directory);
        const clients = getOpenChamberEventClients();
        for (const client of clients) {
          try {
            writeSseEvent(client, { type: 'openchamber:source-control.activity', properties: { directory } });
          } catch {
            clients.delete(client);
          }
        }
      }, TURN_SETTLE_MS));
    };
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    // A session's turn ended: a followed pull request may have moved, so the
    // tracked items refresh, and the directory is told to look again.
    globalEventHub?.subscribeEvent((event, scope) => {
      const isIdle = (event.type === 'session.status' && event.runtimeStatus === 'idle')
        || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled';
      if (!isIdle) return;
      trackedItemsService.noteTurnFinished();
      providerReadCache.clear();
      if (scope?.cwd) announceTurnFinished(scope.cwd);
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // The hub translates v2 wire events into the server's vocabulary once.
    globalEventHub?.subscribeEvent((event) => {
      for (const payload of event?.translated?.() ?? []) {
        if (payload?.type === 'session.idle' || (payload?.type === 'session.status' && payload.properties?.status?.type === 'idle')) {
          trackedItemsService.noteTurnFinished();
          providerReadCache.clear();
          if (event.directory && event.directory !== 'global') announceTurnFinished(event.directory);
          return;
        }
      }
========
    globalEventHub?.subscribeEvent((event) => {
      for (const payload of event?.translated?.() ?? []) {
        if (payload?.type === 'session.idle' || (payload?.type === 'session.status' && payload.properties?.status?.type === 'idle')) {
          trackedItemsService.noteTurnFinished();
          providerReadCache.clear();
          if (event.directory && event.directory !== 'global') announceTurnFinished(event.directory);
          return;
        }
      }
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    });
    registerTrackedItemsRoutes(app, { service: trackedItemsService });
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    const resolveGitIdentity = async (identityId) => {
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // An agent waiting on its pull request reads it through the same service.
    prWatchRuntime?.attach({ trackedItems: trackedItemsService, readers: trackedItemReaders });
    void mergeFollowRuntime?.attach(trackedItemsService).catch((error) => console.warn('[merge-follow] attach failed:', error.message));
    const resolveGitIdentity = async (identityId) => {
========
    prWatchRuntime?.attach({ trackedItems: trackedItemsService, readers: trackedItemReaders });
    void mergeFollowRuntime?.attach(trackedItemsService).catch((error) => console.warn('[merge-follow] attach failed:', error.message));
    const resolveGitIdentity = async (identityId: string) => {
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      if (identityId === 'global') {
        const identity = await getGlobalIdentity();
        return identity?.userName && identity?.userEmail ? { userName: identity.userName, userEmail: identity.userEmail } : null;
      }
      const identity = getProfile(identityId);
      return identity?.userName && identity?.userEmail ? identity : null;
    };
    const validateGitIdentity = async (identityId: string) => {
      const profile = await resolveGitIdentity(identityId);
      if (!profile) throw new Error('Git identity profile is unavailable');
      return profile;
    };
    const networkOperationStore = createGitNetworkOperationStore({
      filePath: path.join(openchamberDataDir, 'git-network-operations.json'),
      fsImpl: fsPromises,
    });
    const gitCredentialResolver = createGitCredentialResolver({
      readTransportCredential: sourceControlProviders.readTransportCredential,
      describeProvider: sourceControlProviders.describe,
      lookupManagedSshKey: sshCredentialStore.lookup,
      passphrases: sshPassphrases,
      fsImpl: fsPromises,
      snapshotRoot: path.join(openchamberDataDir, 'git-ssh-operation-keys'),
    });
    skillRepositoryDependencies = {
      readSettingsFromDisk,
      sanitizeSkillCatalogs,
      resolveCatalogGitIdentity: createSkillRepositoryIdentityResolver({ getProfile, resolveSourceControlAccount, createHttpsCredentialReference }),
      credentialResolver: gitCredentialResolver,
    };
    gitRepositoryCredentialRuntime = createGitRepositoryCredentialRuntime({
      readBinding: walkthroughBindingService.get,
      credentialResolver: gitCredentialResolver,
      dataDir: openchamberDataDir,
      fsPromises,
      getActivePort: routeDependencies.getActivePort ?? (() => null),
      getActiveHost: routeDependencies.getActiveHost ?? (() => null),
    });
    gitRepositoryCredentialRuntime.registerRoutes(app);
    networkOperations = createNetworkOperations({
      validateManagedSshCredential: managedSshInventory.assertAvailable,
      resolveSourceControlAccount,
      bindClonedRepository: walkthroughBindingService.bindClonedRepository,
      validateGitTransportContext: walkthroughBindingService.validateGitTransportContext,
      validateGitAuxiliaryContext: walkthroughBindingService.validateGitAuxiliaryContext,
      contributorProvenance,
      resolveChangeRequestSource: walkthroughBindingService.resolveChangeRequestSource,
      credentialResolver: gitCredentialResolver,
      runtimeIdentity: gitRuntimeIdentity,
      auditStore: sourceControlAuditStore,
      operationStore: networkOperationStore,
      onCheckoutHydrated: (directory) => completeWorktreeCheckoutHydration(directory, {
        bootstrapStore: worktreeBootstrapStore,
      }),
      spawnImpl: spawn,
      fsImpl: fsPromises,
      pathImpl: path,
      gitBinary,
      validateGitIdentity,
      resolveGitIdentity,
      trustedDirectoriesConfig: createTrustedDirectoriesConfig({ gitBinary }),
    });
    await registerBuiltInGuests({ persistPath: extensionsPersistPath(openchamberDataDir), root: routeDependencies.builtInExtensionsDir });
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    // Extensions that act as a Git host, kept in step with the catalog; every
    // client re-reads the provider list when the set changes.
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // A change every client reads again from the server; the event carries nothing.
    const announceChange = (type) => {
      const clients = getOpenChamberEventClients();
      for (const client of clients) {
        try {
          writeSseEvent(client, { type, properties: {} });
        } catch {
          clients.delete(client);
        }
      }
    };
    // Theme files edited by hand or by an agent reach every client without a reload.
    themeFolderWatch?.stop();
    themeFolderWatch = customThemesDir
      ? createThemeFolderWatch({
        fsPromises,
        path,
        themesDir: customThemesDir,
        onChange: () => announceChange('openchamber:themes-changed'),
      })
      : null;
    // Extensions that act as a Git host, kept in step with the catalog; every
    // client re-reads the provider list when the set changes.
========
    const announceChange = (type: string) => {
      const clients = getOpenChamberEventClients();
      for (const client of clients) {
        try {
          writeSseEvent(client, { type, properties: {} });
        } catch {
          clients.delete(client);
        }
      }
    };
    themeFolderWatch?.stop();
    themeFolderWatch = customThemesDir
      ? createThemeFolderWatch({
        fsPromises,
        path,
        themesDir: customThemesDir,
        onChange: () => announceChange('openchamber:themes-changed'),
      })
      : null;
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    const extensionSourceControlProviders = createExtensionProviders({
      listGuests: () => listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }),
      register: walkthroughBindingService.registerExtensionProvider,
      unregister: walkthroughBindingService.unregisterExtensionProvider,
      dropSection: (id) => sourceControlAuthStore.dropSection(id),
      emitChanged: () => {
        const clients = getOpenChamberEventClients();
        for (const client of clients) {
          try {
            writeSseEvent(client, { type: 'openchamber:source-control-providers-changed', properties: {} });
          } catch {
            clients.delete(client);
          }
        }
      },
    });
    const trackerOutboundHandles = createOutboundHandles();
    setHostCallbackRoute(TRACKER_OUTBOUND_PATH, {
      refusal: trackerOutboundHandles.refusal,
      serve: trackerOutboundHandles.serve,
    });
    const extensionTrackers = createExtensionTrackers({
      listGuests: () => listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }),
      currentGuest: async (guestId) => (await listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }))
        .find((guest) => guest.id === guestId) ?? null,
      registry: trackers,
      accounts: createTrackerAccounts({ persistPath: trackerAccountsPersistPath(openchamberDataDir) }),
      handles: trackerOutboundHandles,
      oauth: createTrackerOAuth(),
      sessionStatus: { forget: () => { } },
      persistPath: extensionsPersistPath(openchamberDataDir),
      emitChanged: () => {
        const clients = getOpenChamberEventClients();
        for (const client of clients) {
          try {
            writeSseEvent(client, { type: 'openchamber:tracker-providers-changed', properties: {} });
          } catch {
            clients.delete(client);
          }
        }
      },
    });
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js

    registerGuestRoutes(app, {
      openchamberDataDir,
      openchamberVersion,
      resolveGitBinaryForSpawn,
      resolveOptionalProjectDirectory,
      getSmallModelService,
      resolveWorkspaceScope,
      // One failing listener never skips the other: a browser role that fails
      // to hand back still lets the Git host be withdrawn.
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // Extensions that report usage, attached to the quota registry beside the
    // built-ins and kept in step with the catalog. The quota module stays
    // unloaded until a request or such an extension needs it.
    const extensionQuotaProviders = createExtensionQuotaProviders({
      listGuests: () => listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }),
      currentGuest: async (guestId) => (await listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }))
        .find((guest) => guest.id === guestId) ?? null,
      loadRegistry: getQuotaProviders,
      persistPath: extensionsPersistPath(openchamberDataDir),
      emitChanged: () => announceChange('openchamber:quota-providers-changed'),
    });
    configureGuestOpenCodeProvider(createGuestOpenCodeProvider({
      currentGuest: async (guestId) => (await listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }))
        .find((guest) => guest.id === guestId) ?? null,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
    }));
    stopGuestPackageWatch();
    ({ stopPackageWatch: stopGuestPackageWatch } = registerGuestRoutes(app, {
      openchamberDataDir, openchamberVersion, resolveGitBinaryForSpawn, resolveOptionalProjectDirectory, getSmallModelService,
      // One failing listener never skips the other: a browser role that
      // fails to hand back still lets the Git host be withdrawn.
========
    const extensionQuotaProviders = createExtensionQuotaProviders({
      listGuests: () => listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }),
      currentGuest: async (guestId) => (await listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }))
        .find((guest) => guest.id === guestId) ?? null,
      loadRegistry: getQuotaProviders,
      persistPath: extensionsPersistPath(openchamberDataDir),
      emitChanged: () => announceChange('openchamber:quota-providers-changed'),
    });
    configureGuestOpenCodeProvider(createGuestOpenCodeProvider({
      currentGuest: async (guestId) => (await listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }))
        .find((guest) => guest.id === guestId) ?? null,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
    }));
    stopGuestPackageWatch();
    ({ stopPackageWatch: stopGuestPackageWatch } = registerGuestRoutes(app, {
      openchamberDataDir, openchamberVersion, resolveGitBinaryForSpawn, resolveOptionalProjectDirectory, getSmallModelService,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      onGuestDeactivated: settleGuestDeactivationListeners([
        { name: 'hand back an extension role', listener: onGuestDeactivated },
        { name: 'withdraw an extension Git host', listener: (event) => extensionSourceControlProviders.deactivated(event) },
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
        { name: 'withdraw an extension notification channel', listener: (event) => routeDependencies.extensionNotificationChannels?.deactivated(event) },
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
        { name: 'drop an extension\'s session event subscription', listener: () => onExtensionSessionEventsChanged() },
        { name: 'withdraw an extension notification channel', listener: (event) => extensionNotificationChannels?.deactivated(event) },
========
        { name: 'drop an extension\'s session event subscription', listener: () => onExtensionSessionEventsChanged() },
        { name: 'end an extension\'s waits', listener: () => onExtensionWaitsChanged() },
        { name: 'withdraw an extension notification channel', listener: (event) => extensionNotificationChannels?.deactivated(event) },
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
        { name: 'withdraw an extension tracker', listener: (event) => extensionTrackers.deactivated(event) },
      ]),
      onGuestActivated: async () => {
        await Promise.allSettled([
          extensionSourceControlProviders.reconcile(),
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
          routeDependencies.extensionNotificationChannels?.reconcile(),
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
          onExtensionSessionEventsChanged(),
          extensionNotificationChannels?.reconcile(),
========
          onExtensionSessionEventsChanged(),
          onExtensionWaitsChanged(),
          extensionNotificationChannels?.reconcile(),
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
          extensionTrackers.reconcile(),
        ]);
      },
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
      onGuestsChanged: () => {
        const clients = getOpenChamberEventClients();
        for (const client of clients) {
          try {
            writeSseEvent(client, { type: 'openchamber:guests-changed', properties: {} });
          } catch {
            clients.delete(client);
          }
        }
      },
      surfaceViewerHeaders,
      trackers,
    });
    // The providers extensions served before the restart, before any request reads the list.
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      onGuestsChanged: () => announceChange('openchamber:guests-changed'),
      watchFolderInstalls: true,
      surfaceViewerHeaders, trackers,
      opencodePlugins: { delivery: getOpenCodePluginDelivery, readGlobalEntries: readGlobalPluginEntries, addGlobalEntry: addGlobalPluginEntry },
    }));
    // The providers extensions served before the restart, before any request reads the list.
========
      onGuestsChanged: () => announceChange('openchamber:guests-changed'),
      watchFolderInstalls: true,
      surfaceViewerHeaders, trackers,
      opencodePlugins: { delivery: getOpenCodePluginDelivery, readGlobalEntries: readGlobalPluginEntries, addGlobalEntry: addGlobalPluginEntry },
    }));
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    await extensionSourceControlProviders.reconcile().catch((error) => {
      console.warn('Failed to load extension Git hosts:', error?.message ?? error);
    });
    await extensionTrackers.reconcile().catch((error) => {
      console.warn('Failed to load extension trackers:', error?.message ?? error);
    });
    if (routeDependencies.extensionNotificationChannels) {
      registerNotificationChannelRoutes(app, { channels: routeDependencies.extensionNotificationChannels });
      await routeDependencies.extensionNotificationChannels.reconcile().catch((error) => {
        console.warn('Failed to load extension notification channels:', error?.message ?? error);
      });
    }
    gitWorktreeCreation = registerGitRoutes(app, {
      backfillIdentities: walkthroughBindingService.backfillConnectedIdentities,
      managedSshInventory,
      networkOperations,
      contributorProvenance,
      resolveChangeRequestSource: walkthroughBindingService.resolveChangeRequestSource,
      createHttpsCredentialReference,
      getSourceControlBinding: walkthroughBindingService.get,
      // The Change-Id amend rewrites a branch tip, so its cached status is old.
      onBranchRewritten: walkthroughBindingService.invalidateBranchStatus,
      resolveSourceControlAccount,
      errorRedactionSecrets: [openchamberDataDir],
      worktreeBootstrapStore,
      worktreeLeaseControl: routeDependencies.worktreeLeaseControl,
      worktreeArchiveSessionService: routeDependencies.worktreeArchiveSessionService,
      emitWorktreeChanged: ({ directories, at }) => {
        const clients = getOpenChamberEventClients();
        for (const client of clients) {
          try {
            writeSseEvent(client, {
              type: 'openchamber:worktree-changed',
              properties: { directories, at },
            });
          } catch {
            clients.delete(client);
          }
        }
      },
    });
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // `/api/tracker/*` first; the legacy `/api/linear/*` routes and the
    // Linear OAuth callback stay for older clients and the SDK contract.
    registerTrackerRoutes(app, { registry: trackers });
========
    registerTrackerRoutes(app, { registry: trackers });
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    registerLinearRoutes(app);
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    registerTrackerRoutes(app, { registry: trackers });
    routeDependencies.prWatchRuntime?.attach?.({ trackedItems: trackedItemsService, readers: trackedItemReaders });
    // The session service was built before Git routes: fill the move bridge
    // with the same creation pipeline and stash operations the dialog uses.
    if (routeDependencies.sessionWorktreeMoveBridge) {
      fillSessionWorktreeMoveBridge(routeDependencies.sessionWorktreeMoveBridge, {
        createWorktree: gitWorktreeCreation?.createWorktree,
        removeWorktree: removeWorktreeService,
        hydrateCheckout: networkOperations.hydrateBoundCheckout,
        // The move must not relocate into a checkout whose setup is still
        // running: the rest of the pipeline (bootstrap status values) is the
        // same one the worktree status route reads.
        waitForWorktreeReady: async (directory) => {
          await waitForActiveWorktreeBootstrap(directory);
          const status = await getWorktreeBootstrapStatus(directory, { bootstrapStore: worktreeBootstrapStore });
          if (status?.status === 'failed') throw new OpenChamberControlError(`Worktree bootstrap failed: ${status.error || 'unknown error'}`, 500);
          if (status?.status !== 'ready' || status?.phase !== 'setup-ready') {
            throw new OpenChamberControlError('Worktree bootstrap has not completed', 503);
          }
          return { setupStillRunning: false };
        },
        bootstrapStore: worktreeBootstrapStore,
        stashPush: gitStashPushService,
        getPathsWithoutChanges: gitPathsWithoutChangesService,
        stashApply: gitStashApplyService,
        stashDrop: gitStashDropService,
        listStashes: gitListStashesService,
        getBranches: gitBranchesService,
        resolvePrimaryWorktreeRoot,
        resolveWorktreeSetup: async (directory) => {
          const scope = await routeDependencies.resolveWorkspaceDirectory?.(directory).catch(() => null);
          if (!scope || typeof routeDependencies.readWorktreeSetup !== 'function') return { startCommand: '', untrustedSkipped: [] };
          return worktreeSetupOf(await routeDependencies.readWorktreeSetup(scope.projectId), scope.projectDirectory ?? directory);
        },
      });
    }
    if (routeDependencies.scheduledWorktreeBridge) {
      fillScheduledWorktreeBridge(routeDependencies.scheduledWorktreeBridge, {
        createWorktree: gitWorktreeCreation?.createWorktree,
        removeWorktree: removeWorktreeService,
        deleteBranch: deleteBranchService,
        isGitRepository: isGitRepositoryService,
        bootstrapStore: worktreeBootstrapStore,
      });
    }
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // Register scheduled isolation with the dialog's worktree pipeline.
    fillScheduledWorktreeBridge(routeDependencies.scheduledWorktreeBridge, {
      createWorktree: gitWorktreeCreation?.createWorktree,
      createWorktreeInstanceDisposer: gitWorktreeCreation?.createWorktreeInstanceDisposer,
      removeWorktree: removeWorktreeService,
      deleteBranch: deleteBranchService,
      isGitRepository: isGitRepositoryService,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      bootstrapStore: worktreeBootstrapStore,
    });
========
    fillScheduledWorktreeBridge(routeDependencies.scheduledWorktreeBridge, {
      createWorktree: gitWorktreeCreation?.createWorktree,
      createWorktreeInstanceDisposer: gitWorktreeCreation?.createWorktreeInstanceDisposer,
      removeWorktree: removeWorktreeService,
      deleteBranch: deleteBranchService,
      isGitRepository: isGitRepositoryService,
      buildOpenCodeUrl,
      getOpenCodeAuthHeaders,
      bootstrapStore: worktreeBootstrapStore,
    });
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    registerDevServerRoutes(app, { scanner: devServerScanner, getOwnPorts });
    ({ overridesForDirectory: magicPromptOverridesForDirectory } = registerMagicPromptRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir,
      projectConfigRuntime,
      readSettingsFromDisk,
      sanitizeProjects,
      resolvePrimaryWorktreeRoot,
      resolveWorktreeTopLevel,
    }));
    registerProjectContextRoutes(app, { projectContextRuntime });
    registerProjectDirectoryRoutes(app, {
      fsPromises,
      validateDirectoryPath,
      readSettingsFromDisk,
      sanitizeProjects,
      persistSettings,
    });
    registerProjectSetupRoutes(app, { projectConfigRuntime });
    registerSessionKnowledgeRoutes(app, { sessionKnowledgeRuntime });
    registerBehaviorRoutes(app, { fsPromises, os, resolveWorkspaceDirectory, resolveWorkspaceScope });
    registerMessageSearchRoutes(app, { messageSearchRuntime });
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    registerSessionWarmingRoutes(app, {
      sessionWarmingRuntime,
      setGlobalWarming: setWarmingEnabled,
      setGlobalWarmingDuration: setWarmingDuration,
    });
========
    registerSessionTodosRoutes(app, { sessionTodosRuntime });
    registerSessionWarmingRoutes(app, {
      sessionWarmingRuntime,
      setGlobalWarming: setWarmingEnabled,
      setGlobalWarmingDuration: setWarmingDuration,
    });
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts

    if (!routeDependencies.sessionFoldersStore) throw new Error('Feature routes require the Host session folder store');
    registerSessionFoldersRoutes(app, {
      sessionFoldersStore: routeDependencies.sessionFoldersStore,
      openchamberDataDir,
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
      // Folders are shared by every client of this server; each one reads
      // them again when told they changed.
      onChanged: (updatedAt) => {
        const clients = getOpenChamberEventClients();
        for (const client of clients) {
          try {
            writeSseEvent(client, { type: 'openchamber:session-folders-changed', properties: { updatedAt } });
          } catch {
            clients.delete(client);
          }
        }
      },
========
      onChanged: (updatedAt) => {
        const clients = getOpenChamberEventClients();
        for (const client of clients) {
          try {
            writeSseEvent(client, { type: 'openchamber:session-folders-changed', properties: { updatedAt } });
          } catch {
            clients.delete(client);
          }
        }
      },
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    });
    registerSessionDraftRoutes(app, {
      fsPromises,
      path,
      openchamberDataDir,
      onChanged: (updatedAt) => {
        const clients = getOpenChamberEventClients();
        for (const client of clients) {
          try {
            writeSseEvent(client, { type: 'openchamber:session-drafts-changed', properties: { updatedAt } });
          } catch {
            clients.delete(client);
          }
        }
      },
    });
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    // Content search looks for ripgrep on the same PATH user commands get, so
    // a desktop app launched from the Dock still finds a Homebrew install.
    const { resolveRipgrepBinary } = createRipgrepResolver({ fs, path, buildSearchPath: buildAugmentedPath });
========
    const { resolveRipgrepBinary } = createRipgrepResolver({ fs, path, buildSearchPath: buildAugmentedPath });
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    registerFsRoutes(app, {
      os,
      path,
      fsPromises,
      spawn,
      crypto,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      buildAugmentedPath,
      resolveGitBinaryForSpawn,
      resolveRipgrepBinary: createRipgrepResolver({ fs, path, buildSearchPath: buildAugmentedPath }).resolveRipgrepBinary,
      openchamberUserConfigRoot,
      cloneRepository: networkOperations.cloneRepository,
      managedChatsRoot,
      environmentRuntime,
    });
    registerEnvironmentRoutes(app, { store: environmentStore, runtime: environmentRuntime, listProjects: listConfiguredProjects });
  };

  return {
    registerRoutes,
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    getSkillRepositoryDependencies() {
      if (!skillRepositoryDependencies) throw new Error('Skill repository credentials are unavailable until Host initialization completes');
      return skillRepositoryDependencies;
    },
    /** Writes the Git credential helper's endpoint file; a no-op until the Git routes are registered. */
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    hydrateBoundCheckout,
    createChangeRequestWorktree,
    /** Writes the Git credential helper's endpoint file; a no-op until the Git routes are registered. */
========
    hydrateBoundCheckout,
    createChangeRequestWorktree,
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
    publishRepositoryCredentialEndpoint: async () => { await gitRepositoryCredentialRuntime?.publish(); },
<<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    dispose() {
      themeFolderWatch?.stop();
      themeFolderWatch = null;
    },
    stopThemeWatch() {
|||||||| bc50ba56aa:packages/web/server/lib/opencode/feature-routes-runtime.js
    /** Both folder watches: the themes folder and the extensions installed from a folder. */
    stopFolderWatches: () => {
========
    stopFolderWatches: () => {
>>>>>>>> upstream/main:packages/web/server/lib/server-frame/feature-routes-runtime.ts
      themeFolderWatch?.stop();
      themeFolderWatch = null;
    },
  };
};
