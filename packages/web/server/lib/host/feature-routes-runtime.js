import { createRipgrepResolver } from '../fs/ripgrep.js';
import { registerFsRoutes } from '../fs/routes.js';
import { registerEnvironmentRoutes } from '../environment/routes.js';
import { registerQuotaRoutes } from '../quota/routes.js';
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
=======
import { createExtensionQuotaProviders } from '../quota/extension-quotas.js';
import { registerSmallModelRoutes } from '../small-model/routes.js';
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
import { registerWalkthroughRoutes } from '../walkthrough/routes.js';
import { registerSourceControlRoutes } from '../source-control/routes.js';
import { registerLinearRoutes } from '../linear/routes.js';
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
import { registerGuestRoutes, settleGuestDeactivationListeners } from '../guests/routes.js';
import { listInstalledGuests, registerBuiltInGuests } from '../guests/catalog.js';
import { proxyGuestServiceRequest } from '../guests/service.js';
=======
import { registerTrackerRoutes } from '../trackers/routes.js';
import { createExtensionTrackers } from '../trackers/extension-trackers.js';
import { createTrackerAccounts, trackerAccountsPersistPath } from '../trackers/extension-accounts.js';
import { createTrackerOAuth } from '../trackers/extension-oauth.js';
import { registerGuestRoutes, settleGuestDeactivationListeners } from '../guests/routes.js';
import { listInstalledGuests, registerBuiltInGuests } from '../guests/catalog.js';
import { setHostCallbackRoute } from '../guests/host-callback.js';
import { createGuestOpenCodeProvider } from '../guests/opencode-provider/index.js';
import { configureGuestOpenCodeProvider } from '../guests/service.js';
import { registerNotificationChannelRoutes } from '../notifications/channel-routes.js';
import { createOutboundHandles } from '../source-control/outbound-handles.js';
import { createExtensionProviders } from '../source-control/extension-providers.js';
import { SOURCE_CONTROL_OUTBOUND_PATH, TRACKER_OUTBOUND_PATH } from '@openchamber/sdk';
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
import { extensionsPersistPath } from '../guests/persist.js';
import { createWorktreeInstanceDisposer, registerGitRoutes } from '../git/routes.js';
import { registerDevServerRoutes } from '../dev-servers/routes.js';
import { registerMagicPromptRoutes } from '../magic-prompts/routes.js';
import { registerSessionFoldersRoutes } from '../session-folders/routes.js';
import { registerSessionDraftRoutes } from '../session-drafts/routes.js';
import { registerProjectContextRoutes } from '../project-context/routes.js';
import { registerProjectDirectoryRoutes, registerProjectSetupRoutes } from '../projects/routes.js';
import { registerAgentMemoryRoutes } from '../agent-memory/routes.js';
import { registerSessionKnowledgeRoutes } from '../session-knowledge/routes.js';
import { registerBehaviorRoutes } from './behavior-routes.js';
import { registerMessageSearchRoutes } from '../message-search/routes.js';
import { registerMessageQueueRoutes } from '../message-queue/runtime.js';
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
import { registerRoutingRoutes } from '../routing/routes.js';
import { registerPermissionAutoAcceptRoutes } from '../permission-auto-accept/runtime.js';
=======
import { registerAutoReviewRoutes } from '../auto-review/runtime.js';
import { registerPrWatchRoutes } from '../pr-watch/runtime.js';
import { registerWorkflowRoutes } from '../workflows/routes.js';
import { registerRoutingPromptRewrite, registerRoutingRoutes } from '../routing/routes.js';
import { registerConfigEntityRoutes } from './config-entity-routes.js';
import { createThemeFolderWatch } from './theme-watch.js';
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
import { registerSettingsUtilityRoutes } from './core-routes.js';
import { createThemeFolderWatch } from './theme-watch.js';
import { registerProjectIconRoutes } from './project-icon-routes.js';
import { registerProviderLogoRoutes } from './provider-logo-routes.js';
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
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
import { createSkillRepositoryIdentityResolver } from './skill-repository-identity.js';
import fs from 'node:fs';
=======
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
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
import crypto from 'node:crypto';
import { createSourceControlAuthStore } from '../source-control/auth-storage.js';
import { createSourceControlProviders } from '../source-control/provider-registry.js';
import { createOutboundHandles } from '../source-control/outbound-handles.js';
import { createExtensionProviders } from '../source-control/extension-providers.js';
import { createTrackerRegistry } from '../trackers/registry.js';
import { registerTrackerRoutes } from '../trackers/routes.js';
import { SOURCE_CONTROL_OUTBOUND_PATH } from '@openchamber/sdk';
import { setHostCallbackRoute } from '../guests/host-callback.js';
import { createGitCredentialResolver, createHttpsCredentialReference, parseGitCredentialReference } from '../git/credential-resolver.js';
import { createGitRepositoryCredentialRuntime } from '../git/repository-credential-runtime.js';
import { managedSshCommand } from '../git/network-operations.js';
import { createNetworkOperations, createTrustedDirectoriesConfig } from '../git/network-operations.js';
import { createManagedSshCredentialStore } from '../git/ssh-credential-storage.js';
import { createManagedSshInventory } from '../git/credentials.js';
import { createSshPassphraseStore } from '../git/ssh-passphrases.js';
import { openCodeCredentialSource } from './auth.js';
import { createContributorProvenanceStore } from '../git/contributor-provenance-storage.js';
import { createGitNetworkOperationStore } from '../git/network-operation-storage.js';
import { readEffectiveGitTransportRevision } from '../git/transport-config.js';
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
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

export const createFeatureRoutesRuntime = () => {
  let skillRepositoryDependencies = null;
  let themeFolderWatch = null;
=======
import { completeWorktreeCheckoutHydration, configureRepositoryTransport, deleteBranch as deleteBranchService, isGitRepository as isGitRepositoryService, removeWorktree as removeWorktreeService, resolvePrimaryWorktreeRoot, resolveWorktreeTopLevel } from '../git/service.js';
import { createPrivateRepositoryIdentityResolver, resolveRepositoryId } from '../source-control/repository-identity.js';
import { createSourceControlAuditStore } from '../source-control/audit-storage.js';

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
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
  const gitRuntimeIdentity = Object.freeze({
    id: `server_${crypto.randomUUID()}`,
    platform: process.env.OPENCHAMBER_RUNTIME === 'desktop' ? 'desktop' : 'web',
  });

  let themeFolderWatch = null;
  let stopGuestPackageWatch = () => {};
  let quotaProviders = null;
  const getQuotaProviders = async () => {
    if (!quotaProviders) {
      quotaProviders = await import('../quota/index.js');
    }
    return quotaProviders;
  };

  let smallModelService = null;
  const getSmallModelService = async () => {
    if (!smallModelService) {
      smallModelService = await import('../small-model/index.js');
    }
    return smallModelService;
  };

  let walkthroughService = null;
  let magicPromptOverridesForDirectory;
  let walkthroughBindingService = null;
  let gitRepositoryCredentialRuntime = null;
  let networkOperations = null;
  let gitWorktreeCreation = null;
  const getWalkthroughService = async () => {
    if (!walkthroughService) {
      const [service, pullRequest] = await Promise.all([
        import('../walkthrough/index.js'),
        import('../walkthrough/pull-request.js'),
      ]);
      walkthroughService = {
        ...service,
        // Forward only the request options by name: the remaining slots are
        // dependency overrides and must not be reachable from a route.
        getPullRequestDiff: (directory, number, readContext, { allowEmpty, sourceRepo, revision } = {}) => pullRequest.getPullRequestDiff(
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
        getPullRequestFileContents: (directory, number, readContext, { path, previousPath, status, sourceRepo, revision, binary }) => pullRequest.getPullRequestFileContents(
          directory,
          number,
          readContext,
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
          {
            path,
            previousPath,
            status,
            sourceRepo,
            revision,
            onAccountUnavailable: walkthroughBindingService?.accountUnavailable,
            readChangeRequestFile: walkthroughBindingService?.readChangeRequestFile,
          },
=======
          { path, previousPath, status, sourceRepo, revision, binary, readChangeRequestFile: walkthroughBindingService?.readChangeRequestFile },
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
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

<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
=======
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
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js

  const registerRoutes = async (app, routeDependencies) => {
    const {
      messageSearchRuntime,
      crypto,
      os,
      path,
      fsPromises,
      spawn,
      resolveGitBinaryForSpawn,
      createFsSearchRuntime,
      openchamberDataDir,
      onGuestDeactivated,
      onExtensionSessionEventsChanged = () => {},
      extensionNotificationChannels = null,
      surfaceViewerHeaders,
      // How an extension's OpenCode plugin reaches OpenCode right now (`guests/opencode-plugin.js`).
      getOpenCodePluginDelivery = () => 'file',
      openchamberUserConfigRoot,
      managedChatsRoot,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      validateDirectoryPath,
      // Absent in tests; without it the themes folder is not watched.
      customThemesDir = null,
      readCustomThemesFromDisk,
      saveImportedTheme,
      deleteImportedTheme,
      readSettingsFromDisk,
      readSettingsFromDiskMigrated,
      persistSettings,
      persistResolvedSettings,
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
      agentMemoryRuntime,
      isAgentMemoryEnabled,
      sessionKnowledgeRuntime,
      scheduledTasksRuntime,
      scheduledTaskService,
      openChamberSessionService,
      openChamberControlService,
      getOpenChamberEventClients,
      writeSseEvent,
      worktreeBootstrapStore,
      messageQueueRuntime,
      autoReviewRuntime,
      prWatchRuntime = null,
      mergeFollowRuntime = null,
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
    } = routeDependencies;

    registerSettingsUtilityRoutes(app, {
      readCustomThemesFromDisk,
      saveImportedTheme,
      deleteImportedTheme,
    });

<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
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
=======
    registerPermissionAutoAcceptRoutes(app, permissionAutoAcceptRuntime);
    registerMessageQueueRoutes(app, messageQueueRuntime);
    registerAutoReviewRoutes(app, autoReviewRuntime);
    if (prWatchRuntime) registerPrWatchRoutes(app, prWatchRuntime);
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
    registerRoutingRoutes(app, routingRuntime);
    registerPermissionAutoAcceptRoutes(app, permissionAutoAcceptRuntime);


    registerProjectIconRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir,
      sanitizeProjects,
      readSettingsFromDiskMigrated,
      persistSettings,
      persistResolvedSettings,
      createFsSearchRuntime,
      spawn,
      resolveGitBinaryForSpawn,
    });

    registerProviderLogoRoutes(app, {
      fsPromises,
      path,
      crypto,
      openchamberDataDir,
      readSettingsFromDiskMigrated,
      persistResolvedSettings,
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
      isRequestOriginAllowed: routeDependencies.isRequestOriginAllowed,
      sessionService: openChamberSessionService,
    });

    registerOpenChamberControlRoutes(app, { controlService: openChamberControlService });

    // Agent workflows, present only in a build with OPENCHAMBER_WORKFLOWS_ENABLE.
    routeDependencies.workflows?.register(app);

    registerMarkdownImageGrantRoutes(app, {
      fsPromises,
      path,
      crypto,
      sessionService: openChamberSessionService,
      resolveSessionScope,
      approvedTempRoot: os.tmpdir(),
    });

<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js


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
    });
=======
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
    });

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
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
    const gitBinary = resolveGitBinaryForSpawn();
    // One server token store for every provider. OAuth tokens that expire
    // (GitLab's live two hours) are renewed before they lapse, through the
    // implementation of the provider that issued them.
    const sourceControlAuthStore = createSourceControlAuthStore({
      filePath: path.join(openchamberDataDir, 'source-control-auth.json'),
      refreshOAuthToken: async ({ provider, origin, refreshToken }) => {
        const impl = await sourceControlProviders.implementation(provider);
        if (!(impl?.auth.refreshOAuthToken instanceof Function)) throw new Error('Source control OAuth renewal is unavailable');
        return impl.auth.refreshOAuthToken({ instance: origin, refreshToken });
      },
    });
    // An extension's Git host reaches its forge only through these handles,
    // served on the callback listener its service is told about.
    const sourceControlOutboundHandles = createOutboundHandles();
    setHostCallbackRoute(SOURCE_CONTROL_OUTBOUND_PATH, {
      refusal: sourceControlOutboundHandles.refusal,
      serve: sourceControlOutboundHandles.serve,
    });
    // The provider registry: descriptors now, implementations on first use.
    const sourceControlProviders = createSourceControlProviders({
      authStore: sourceControlAuthStore,
      extensionServices: {
        handles: sourceControlOutboundHandles,
        persistPath: extensionsPersistPath(openchamberDataDir),
        // The row as it is now: the catalog applies enterprise policy on every read.
        currentGuest: async (guestId) => (await listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }))
          .find((guest) => guest.id === guestId) ?? null,
        // Only called while serving a request, after the reconciler below exists.
        reconcile: () => extensionSourceControlProviders.reconcile(),
      },
      readSettings: readSettingsFromDisk,
      configRoot: openchamberDataDir,
      hostServices: {
        github: {
          // A worktree made from a fork PR has no upstream; its provenance says
          // which remote the branch came from, so PR status can find the PR.
          readContributorProvenance: (directory) => contributorProvenance.read(directory),
        },
      },
    });
    // Tracker ids share the provider-id namespace with source control, so an
    // overlap fails at startup instead of shadowing a provider.
    const trackers = createTrackerRegistry(undefined, {
      foreignIds: sourceControlProviders.list().map((descriptor) => descriptor.id),
    });
    // The exact credential behind an account reference, as a neutral Git
    // transport credential: a stored account, or a CLI login the user
    // switched to, so Git transport accepts what reads do.
    const resolveSourceControlAccount = ({ provider, instance, accountId, credentialRevision }) => sourceControlProviders
      .readTransportCredential({ provider, instance, credentialId: accountId, credentialRevision });
    const resolveTransportRepository = createPrivateRepositoryIdentityResolver({
      getTransportRevision: (directory) => readEffectiveGitTransportRevision(directory, { gitBinary }),
    });
    // A provenance record is keyed by the repository ID alone, so its reads
    // take the ID-only resolver: the remote and transport Git processes a
    // binding read needs answer nothing here (#6084).
    const contributorProvenance = createContributorProvenanceStore({
      filePath: path.join(openchamberDataDir, 'git-contributor-provenance.json'),
      resolveRepositoryIdentity: resolveRepositoryId,
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
    const sshPassphrases = createSshPassphraseStore(openCodeCredentialSource({ buildOpenCodeUrl, getOpenCodeAuthHeaders }));
    const managedSshInventory = createManagedSshInventory({
      passphrases: sshPassphrases,
      store: sshCredentialStore,
      snapshotRoot: path.join(openchamberDataDir, 'git-ssh-operation-keys'),
      discoveryRoot: path.join(os.homedir(), '.ssh'),
      managedKeyRoot: path.join(openchamberDataDir, 'git-ssh-private-keys'),
      fsImpl: fsPromises,
    });
    // What a repository's own `.git/config` names for pushing and pulling
    // follows its grants: OpenChamber's credential helper for an account, the
    // SSH wrapper with the key for a managed key, nothing for System Git.
    const syncRepositoryTransport = async (directory, read) => {
      if (typeof directory !== 'string' || !directory.trim() || !gitRepositoryCredentialRuntime) return;
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
    // Shared short-lived answers for provider reads; registered before the
    // source-control and tracker routes it fronts. A change made through them,
    // or a refresh the user asked for, also reads the followed items again.
    let trackedItemsService = null;
    const providerReadCache = createProviderReadCache({
      sourceControlProviderIds: sourceControlProviders.list().map((descriptor) => descriptor.id),
      // Extension trackers attach and detach while the server runs.
      trackerIds: () => trackers.list(),
      onChange: (provider) => trackedItemsService?.refreshProvider(provider),
      onItemRefresh: (provider, item) => trackedItemsService?.refreshItem(provider, item),
    });
    app.use(providerReadCache.middleware);
    walkthroughBindingService = registerSourceControlRoutes(app, {
      onMutationSucceeded: (mutation) => mergeFollowRuntime?.onMutationSucceeded(mutation),
      onMutationStarting: (mutation) => mergeFollowRuntime?.onMutationStarting(mutation) ?? null,
      onRepositoryTransportChanged: syncRepositoryTransport,
      validateManagedSshCredential: managedSshInventory.assertAvailable,
      readManagedSshCredentialPresentation: managedSshInventory.presentation,
      configRoot: openchamberDataDir,
      resolveTransportRepository,
      auditStore: sourceControlAuditStore,
      runtimeIdentity: gitRuntimeIdentity,
      providers: sourceControlProviders,
      readTransportAccount: resolveSourceControlAccount,
      resolveCheckoutAuxiliary: async ({ directory, parentEndpoint, parentRemoteName, kind, path: checkoutPath }) => {
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
    // Live state of the linked pull requests, merge requests and issues the
    // clients show, refreshed here and pushed over the event stream.
    const findEventClient = (connectionId) => {
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
    // A finished agent turn may have pushed a branch or opened a pull request.
    // Followed items refresh on the server; clients are told which directory
    // to look at again for branches that had no pull request. Bursts of idle
    // events around a turn boundary are coalesced per directory.
    const TURN_SETTLE_MS = 3000;
    const settlingDirectories = new Map();
    const announceTurnFinished = (directory) => {
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
    });
    registerTrackedItemsRoutes(app, { service: trackedItemsService });
    // An agent waiting on its pull request reads it through the same service.
    prWatchRuntime?.attach({ trackedItems: trackedItemsService, readers: trackedItemReaders });
    void mergeFollowRuntime?.attach(trackedItemsService).catch((error) => console.warn('[merge-follow] attach failed:', error.message));
    const resolveGitIdentity = async (identityId) => {
      if (identityId === 'global') {
        const identity = await getGlobalIdentity();
        return identity?.userName && identity?.userEmail ? { userName: identity.userName, userEmail: identity.userEmail } : null;
      }
      const identity = getProfile(identityId);
      return identity?.userName && identity?.userEmail ? identity : null;
    };
    const validateGitIdentity = async (identityId) => {
      const profile = await resolveGitIdentity(identityId);
      if (!profile) throw new Error('Git identity profile is unavailable');
      return profile;
    };
    const networkOperationStore = createGitNetworkOperationStore({
      filePath: path.join(openchamberDataDir, 'git-network-operations.json'),
      fsImpl: fsPromises,
    });
    const gitCredentialResolver = createGitCredentialResolver({
      passphrases: sshPassphrases,
      readTransportCredential: sourceControlProviders.readTransportCredential,
      describeProvider: sourceControlProviders.describe,
      lookupManagedSshKey: sshCredentialStore.lookup,
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
      readBinding: (directory) => walkthroughBindingService.get(directory),
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
        disposeInstance: createWorktreeInstanceDisposer({ buildOpenCodeUrl, getOpenCodeAuthHeaders }),
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
    const extensionSourceControlProviders = createExtensionProviders({
      listGuests: () => listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }),
      register: walkthroughBindingService.registerExtensionProvider,
      unregister: walkthroughBindingService.unregisterExtensionProvider,
      dropSection: (id) => sourceControlAuthStore.dropSection(id),
      emitChanged: () => announceChange('openchamber:source-control-providers-changed'),
    });
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    registerGuestRoutes(app, {
      openchamberDataDir,
      openchamberVersion,
      resolveGitBinaryForSpawn,
      resolveOptionalProjectDirectory,
      getSmallModelService,
      resolveWorkspaceScope,
      // One failing listener never skips the other: a browser role that fails
      // to hand back still lets the Git host be withdrawn.
=======
    // Extensions that act as a tracker, attached to the registry beside Linear
    // and kept in step with the catalog; their accounts live in their own
    // store, and their services reach the tracker's server only through these
    // handles on the callback listener.
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
      sessionStatus: trackerSessionStatus ?? { forget: () => {} },
      persistPath: extensionsPersistPath(openchamberDataDir),
      emitChanged: () => announceChange('openchamber:tracker-providers-changed'),
    });
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
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
      onGuestDeactivated: settleGuestDeactivationListeners([
        { name: 'hand back an extension role', listener: onGuestDeactivated },
        { name: 'withdraw an extension Git host', listener: (event) => extensionSourceControlProviders.deactivated(event) },
        { name: 'drop an extension\'s session event subscription', listener: () => onExtensionSessionEventsChanged() },
        { name: 'withdraw an extension notification channel', listener: (event) => extensionNotificationChannels?.deactivated(event) },
        { name: 'withdraw an extension tracker', listener: (event) => extensionTrackers.deactivated(event) },
        { name: 'withdraw an extension usage provider', listener: () => extensionQuotaProviders.deactivated() },
      ]),
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
      onGuestActivated: () => extensionSourceControlProviders.reconcile(),
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
=======
      // One failing reconcile never skips another; each failure is logged by the route.
      onGuestActivated: async () => {
        const results = await Promise.allSettled([
          extensionSourceControlProviders.reconcile(),
          onExtensionSessionEventsChanged(),
          extensionNotificationChannels?.reconcile(),
          extensionTrackers.reconcile(),
          extensionQuotaProviders.reconcile(),
        ]);
        const failed = results.find((result) => result.status === 'rejected');
        if (failed) throw failed.reason;
      },
      onGuestsChanged: () => announceChange('openchamber:guests-changed'),
      watchFolderInstalls: true,
      surfaceViewerHeaders, trackers,
      opencodePlugins: { delivery: getOpenCodePluginDelivery, readGlobalEntries: readGlobalPluginEntries, addGlobalEntry: addGlobalPluginEntry },
    }));
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
    // The providers extensions served before the restart, before any request reads the list.
    await extensionSourceControlProviders.reconcile().catch((error) => {
      console.warn('Failed to load extension Git hosts:', error?.message ?? error);
    });
    await extensionTrackers.reconcile().catch((error) => {
      console.warn('Failed to load extension trackers:', error?.message ?? error);
    });
    await extensionQuotaProviders.reconcile().catch((error) => {
      console.warn('Failed to load extension usage providers:', error?.message ?? error);
    });
    if (extensionNotificationChannels) {
      registerNotificationChannelRoutes(app, { channels: extensionNotificationChannels });
      await extensionNotificationChannels.reconcile().catch((error) => {
        console.warn('Failed to load extension notification channels:', error?.message ?? error);
      });
    }
    gitWorktreeCreation = registerGitRoutes(app, {
      // Identities for accounts connected before identities carried one are
      // made the first time identities are listed: a moment someone asked for,
      // not startup, where a development restart can kill a process holding a
      // provider store's lock.
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
    registerLinearRoutes(app);
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    registerTrackerRoutes(app, { registry: trackers });
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
=======
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
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
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
    registerAgentMemoryRoutes(app, { agentMemoryRuntime, isAgentMemoryEnabled });
    registerSessionKnowledgeRoutes(app, { sessionKnowledgeRuntime });
    registerBehaviorRoutes(app, { fsPromises, os, resolveWorkspaceDirectory, resolveWorkspaceScope });
    registerMessageSearchRoutes(app, { messageSearchRuntime });

    if (!routeDependencies.sessionFoldersStore) throw new Error('Feature routes require the Host session folder store');
    registerSessionFoldersRoutes(app, {
      sessionFoldersStore: routeDependencies.sessionFoldersStore,
      openchamberDataDir,
    });
    registerSessionDraftRoutes(app, { fsPromises, path, openchamberDataDir });
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
      projectRealpath: (target) => new Promise((resolve, reject) => {
        fs.realpath(target, (error, resolved) => (error ? reject(error) : resolve(resolved)));
      }),
    });
    registerEnvironmentRoutes(app, { store: environmentStore, runtime: environmentRuntime, listProjects: listConfiguredProjects });
  };

  return {
    registerRoutes,
    getSkillRepositoryDependencies() {
      if (!skillRepositoryDependencies) throw new Error('Skill repository credentials are unavailable until Host initialization completes');
      return skillRepositoryDependencies;
    },
    /** Writes the Git credential helper's endpoint file; a no-op until the Git routes are registered. */
    publishRepositoryCredentialEndpoint: async () => { await gitRepositoryCredentialRuntime?.publish(); },
<<<<<<< HEAD:packages/web/server/lib/host/feature-routes-runtime.js
    dispose() {
      themeFolderWatch?.stop();
      themeFolderWatch = null;
    },
    stopThemeWatch() {
      themeFolderWatch?.stop();
      themeFolderWatch = null;
=======
    /** Both folder watches: the themes folder and the extensions installed from a folder. */
    stopFolderWatches: () => {
      themeFolderWatch?.stop();
      themeFolderWatch = null;
      stopGuestPackageWatch();
      stopGuestPackageWatch = () => {};
>>>>>>> bc50ba56a:packages/web/server/lib/opencode/feature-routes-runtime.js
    },
  };
};
