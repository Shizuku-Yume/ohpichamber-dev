import { createRipgrepResolver } from '../fs/ripgrep.js';
import { registerFsRoutes } from '../fs/routes.js';
import { registerEnvironmentRoutes } from '../environment/routes.js';
import { registerQuotaRoutes } from '../quota/routes.js';
import { registerWalkthroughRoutes } from '../walkthrough/routes.js';
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
import { registerBehaviorRoutes } from '../host/behavior-routes.js';
import { registerMessageSearchRoutes } from '../message-search/routes.js';
import { registerMessageQueueRoutes } from '../message-queue/runtime.js';
import { registerRoutingRoutes } from '../routing/routes.js';
import { registerPermissionAutoAcceptRoutes } from '../permission-auto-accept/runtime.js';
import { registerSettingsUtilityRoutes } from './core-routes.js';
import { createThemeFolderWatch } from '../appearance/theme-watch.js';
import { registerProjectIconRoutes } from '../appearance/project-icon-routes.js';
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
import { createSkillRepositoryIdentityResolver } from '../host/skill-repository-identity.js';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createSourceControlAuthStore } from '../source-control/auth-storage.js';
import { createSourceControlProviders } from '../source-control/provider-registry.js';
import { createOutboundHandles } from '../source-control/outbound-handles.js';
import { createExtensionProviders } from '../source-control/extension-providers.js';
import { createTrackerRegistry } from '../trackers/registry.js';
import { createTrackerSessionStatus } from '../trackers/session-status.js';
import { registerTrackerRoutes } from '../trackers/routes.js';
import { SOURCE_CONTROL_OUTBOUND_PATH, TRACKER_OUTBOUND_PATH } from 'ohpichamber-sdk';
import { createExtensionTrackers } from '../trackers/extension-trackers.js';
import { createTrackerAccounts, trackerAccountsPersistPath } from '../trackers/extension-accounts.js';
import { createTrackerOAuth } from '../trackers/extension-oauth.js';
import { registerNotificationChannelRoutes } from '../notifications/channel-routes.js';
import { registerAutoReviewRoutes } from '../auto-review/runtime.js';
import { registerPrWatchRoutes } from '../pr-watch/runtime.js';
import { registerExtensionWaitsRoutes } from '../extension-waits/runtime.js';
import { registerReceivedPageRoutes, registerSharePageRoutes } from '../share-pages/routes.js';
import { registerProviderLogoRoutes } from '../appearance/provider-logo-routes.js';
import { createSshPassphraseStore } from '../git/ssh-passphrases.js';
import { setHostCallbackRoute } from '../guests/host-callback.js';
import { createGitCredentialResolver, createHttpsCredentialReference, parseGitCredentialReference } from '../git/credential-resolver.js';
import { createGitRepositoryCredentialRuntime } from '../git/repository-credential-runtime.js';
import { managedSshCommand } from '../git/network-operations.js';
import { createNetworkOperations, createTrustedDirectoriesConfig } from '../git/network-operations.js';
import { createManagedSshCredentialStore } from '../git/ssh-credential-storage.js';
import { createManagedSshInventory } from '../git/credentials.js';
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

export const createFeatureRoutesRuntime = () => {
  let skillRepositoryDependencies = null;
  let themeFolderWatch = null;
  let stopTrackerSessionStatus = () => {};
  const gitRuntimeIdentity = Object.freeze({
    id: `server_${crypto.randomUUID()}`,
    platform: process.env.OPENCHAMBER_RUNTIME === 'desktop' ? 'desktop' : 'web',
  });

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
      surfaceViewerHeaders,
      openchamberUserConfigRoot,
      managedChatsRoot,
      normalizeDirectoryPath,
      resolveProjectDirectory,
      resolveOptionalProjectDirectory,
      validateDirectoryPath,
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
      persistResolvedSettings: routeDependencies.persistResolvedSettings,
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
      isRequestOriginAllowed: routeDependencies.isRequestOriginAllowed,
      sessionService: openChamberSessionService,
    });

    registerOpenChamberControlRoutes(app, { controlService: openChamberControlService, laterPages: routeDependencies.laterPagesRuntime ?? null });
    if (routeDependencies.sharePagesRuntime) registerSharePageRoutes(app, routeDependencies.sharePagesRuntime);
    if (routeDependencies.receivedPagesRuntime) registerReceivedPageRoutes(app, routeDependencies.receivedPagesRuntime);

    // Agent workflows, present only in a build with OPENCHAMBER_WORKFLOWS_ENABLE.
    routeDependencies.workflows?.register(app);

    if (routeDependencies.autoReviewRuntime) registerAutoReviewRoutes(app, routeDependencies.autoReviewRuntime);
    if (routeDependencies.prWatchRuntime) registerPrWatchRoutes(app, routeDependencies.prWatchRuntime);
    if (routeDependencies.extensionWaitsRuntime) registerExtensionWaitsRoutes(app, routeDependencies.extensionWaitsRuntime);
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
    stopTrackerSessionStatus();
    const trackerSessionStatus = createTrackerSessionStatus({ registry: trackers });
    const unsubscribeTrackerStatus = globalEventHub.subscribeEvent(trackerSessionStatus.processPayload);
    stopTrackerSessionStatus = () => { unsubscribeTrackerStatus(); trackerSessionStatus.stop(); };
    // The exact credential behind an account reference, as a neutral Git
    // transport credential: a stored account, or a CLI login the user
    // switched to, so Git transport accepts what reads do.
    const resolveSourceControlAccount = ({ provider, instance, accountId, credentialRevision }) => sourceControlProviders
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
      trackerIds: trackers.list(),
      onChange: (provider) => trackedItemsService?.refreshProvider(provider),
      onItemRefresh: (provider, item) => trackedItemsService?.refreshItem(provider, item),
    });
    app.use(providerReadCache.middleware);
    walkthroughBindingService = registerSourceControlRoutes(app, {
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
    // A session's turn ended: a followed pull request may have moved, so the
    // tracked items refresh, and the directory is told to look again.
    globalEventHub?.subscribeEvent((event, scope) => {
      const isIdle = (event.type === 'session.status' && event.runtimeStatus === 'idle')
        || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled';
      if (!isIdle) return;
      trackedItemsService.noteTurnFinished();
      providerReadCache.clear();
      if (scope?.cwd) announceTurnFinished(scope.cwd);
    });
    registerTrackedItemsRoutes(app, { service: trackedItemsService });
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
    // Extensions that act as a Git host, kept in step with the catalog; every
    // client re-reads the provider list when the set changes.
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
      sessionStatus: trackerSessionStatus,
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

    registerGuestRoutes(app, {
      openchamberDataDir,
      openchamberVersion,
      resolveGitBinaryForSpawn,
      resolveOptionalProjectDirectory,
      getSmallModelService,
      resolveWorkspaceScope,
      // One failing listener never skips the other: a browser role that fails
      // to hand back still lets the Git host be withdrawn.
      onGuestDeactivated: settleGuestDeactivationListeners([
        { name: 'hand back an extension role', listener: onGuestDeactivated },
        { name: 'withdraw an extension Git host', listener: (event) => extensionSourceControlProviders.deactivated(event) },
        { name: 'withdraw an extension notification channel', listener: (event) => routeDependencies.extensionNotificationChannels?.deactivated(event) },
        { name: 'withdraw an extension tracker', listener: (event) => extensionTrackers.deactivated(event) },
        { name: 'end an extension’s waits', listener: () => routeDependencies.extensionWaitsRuntime?.reconcile() },
      ]),
      onGuestActivated: async () => {
        await Promise.allSettled([
          extensionSourceControlProviders.reconcile(),
          routeDependencies.extensionNotificationChannels?.reconcile(),
          extensionTrackers.reconcile(),
          routeDependencies.extensionWaitsRuntime?.reconcile(),
        ]);
      },
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

    if (!routeDependencies.sessionFoldersStore) throw new Error('Feature routes require the Host session folder store');
    registerSessionFoldersRoutes(app, {
      sessionFoldersStore: routeDependencies.sessionFoldersStore,
      openchamberDataDir,
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
    getSkillRepositoryDependencies() {
      if (!skillRepositoryDependencies) throw new Error('Skill repository credentials are unavailable until Host initialization completes');
      return skillRepositoryDependencies;
    },
    /** Writes the Git credential helper's endpoint file; a no-op until the Git routes are registered. */
    publishRepositoryCredentialEndpoint: async () => { await gitRepositoryCredentialRuntime?.publish(); },
    dispose() {
      stopTrackerSessionStatus();
      themeFolderWatch?.stop();
      themeFolderWatch = null;
    },
    stopThemeWatch() {
      themeFolderWatch?.stop();
      themeFolderWatch = null;
    },
  };
};
