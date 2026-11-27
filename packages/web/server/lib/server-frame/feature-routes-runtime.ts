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
import type * as nodeChildProcess from 'node:child_process';
import type * as nodeFsPromises from 'node:fs/promises';
import type * as nodeOs from 'node:os';
import type * as nodePath from 'node:path';
import { z } from 'zod';
import type { Application } from '../shared/http-contracts.js';
import { isString } from '../shared/object-guards.js';
import type * as quotaIndex from '../quota/index.js';
import type * as smallModelIndex from '../small-model/index.js';
import type { createOpenChamberSessionService } from '../openchamber-sessions/routes.js';
import type { createExtensionNotificationChannels } from '../notifications/extension-channels.js';
import type { QuotaRoutesDependencies } from '../quota/routes.js';
import type { InstalledGuest } from '../guests/catalog.js';
import type { AccountIdentity } from '../source-control/provider-contract.js';
import type { createGlobalMessageStreamHub } from '../event-stream/global-hub.js';
import type { createFsSearchRuntime } from '../fs/search.js';
import type { createEnvironmentStore } from '../environment/store.js';
import type { createEnvironmentRuntime } from '../environment/runtime.js';
import type { createProjectConfigRuntime } from '../projects/project-config.js';
import type { createProjectContextRuntime } from '../project-context/runtime.js';
import type { createScheduledTaskService } from '../scheduled-tasks/service.js';
import type { createWorktreeBootstrapStore } from '../git/worktree-bootstrap-storage.js';
import type { createLaterPages } from '../openchamber-control/later-pages.js';
import type { createSharePagesRuntime } from '../share-pages/runtime.js';
import type { createReceivedPagesRuntime } from '../share-pages/received-runtime.js';
import type { createWorkflowsModule } from '../workflows/routes.js';
import type { createAutoReviewRuntime } from '../auto-review/runtime.js';
import type { createPrWatchRuntime } from '../pr-watch/runtime.js';
import type { createExtensionWaitsRuntime } from '../extension-waits/runtime.js';
import type { SettingsUtilityRouteDependencies } from './core-routes.js';
import type { SettingsDocument } from '../settings/settings-helpers.js';
import type { RequestOriginChecker } from '../security/request-security.js';
import type { createDevServerScanner } from '../dev-servers/routes.js';
import type { NormalizedSkillCatalog, RawValue } from '../settings/settings-normalization-runtime.js';
import type { WorktreeSetupInput } from '../projects/contracts.js';
import { createSourceControlAuthStore } from '../source-control/auth-storage.js';
import { createSourceControlProviders } from '../source-control/provider-registry.js';
import type { createSettingsRuntime } from '../settings/settings-runtime.js';
import type { createSettingsNormalizationRuntime } from '../settings/settings-normalization-runtime.js';
import type { GitRouteDependencies } from '../git/routes.js';
import type { SourceControlRouteOptions } from '../source-control/routes.js';
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

type FeatureSseEvent = Parameters<Parameters<typeof registerScheduledTaskRoutes>[1]['writeSseEvent']>[1];

export interface SkillRepositoryDependencies {
  readSettingsFromDisk: () => Promise<SettingsDocument>;
  sanitizeSkillCatalogs: (raw: RawValue) => NormalizedSkillCatalog[] | undefined;
  resolveCatalogGitIdentity: ReturnType<typeof createSkillRepositoryIdentityResolver>;
  credentialResolver: ReturnType<typeof createGitCredentialResolver>;
}

export interface FeatureRoutesDependencies extends SettingsUtilityRouteDependencies {
  messageSearchRuntime: Parameters<typeof registerMessageSearchRoutes>[1]['messageSearchRuntime'];
  crypto: typeof crypto;
  os: typeof nodeOs;
  path: typeof nodePath;
  fsPromises: typeof nodeFsPromises;
  spawn: typeof nodeChildProcess.spawn;
  resolveGitBinaryForSpawn: () => string;
  createFsSearchRuntime: typeof createFsSearchRuntime;
  openchamberDataDir: string;
  onGuestDeactivated: (event: { guestId: string; removed?: boolean }) => Promise<void> | void;
  surfaceViewerHeaders: Parameters<typeof registerGuestRoutes>[1]['surfaceViewerHeaders'];
  openchamberUserConfigRoot: string;
  managedChatsRoot: string;
  normalizeDirectoryPath: Parameters<typeof registerFsRoutes>[1]['normalizeDirectoryPath'];
  resolveProjectDirectory: Parameters<typeof registerFsRoutes>[1]['resolveProjectDirectory'];
  resolveOptionalProjectDirectory: Parameters<typeof registerGuestRoutes>[1]['resolveOptionalProjectDirectory'];
  validateDirectoryPath: Parameters<typeof registerProjectDirectoryRoutes>[1]['validateDirectoryPath'];
  readSettingsFromDisk: () => Promise<SettingsDocument>;
  readSettingsFromDiskMigrated: () => Promise<SettingsDocument>;
  persistSettings: ReturnType<typeof createSettingsRuntime>['persistSettings'];
  persistResolvedSettings: ReturnType<typeof createSettingsRuntime>['persistResolvedSettings'];
  sanitizeProjects: ReturnType<typeof createSettingsNormalizationRuntime>['sanitizeProjects'];
  sanitizeSkillCatalogs: (raw: RawValue) => NormalizedSkillCatalog[] | undefined;
  getOwnPorts: Parameters<typeof registerDevServerRoutes>[1]['getOwnPorts'];
  devServerScanner: ReturnType<typeof createDevServerScanner>;
  buildAugmentedPath: () => string;
  environmentStore: ReturnType<typeof createEnvironmentStore>;
  environmentRuntime: ReturnType<typeof createEnvironmentRuntime>;
  listConfiguredProjects: Parameters<typeof registerEnvironmentRoutes>[1]['listProjects'];
  projectConfigRuntime: ReturnType<typeof createProjectConfigRuntime>;
  projectContextRuntime: ReturnType<typeof createProjectContextRuntime>;
  sessionKnowledgeRuntime: Parameters<typeof registerSessionKnowledgeRoutes>[1]['sessionKnowledgeRuntime'];
  scheduledTasksRuntime: Parameters<typeof registerScheduledTaskRoutes>[1]['scheduledTasksRuntime'];
  scheduledTaskService: ReturnType<typeof createScheduledTaskService>;
  openChamberSessionService: ReturnType<typeof createOpenChamberSessionService>;
  openChamberControlService: Parameters<typeof registerOpenChamberControlRoutes>[1]['controlService'];
  getOpenChamberEventClients: Parameters<typeof registerScheduledTaskRoutes>[1]['getOpenChamberEventClients'];
  writeSseEvent: Parameters<typeof registerScheduledTaskRoutes>[1]['writeSseEvent'];
  worktreeBootstrapStore: ReturnType<typeof createWorktreeBootstrapStore>;
  messageQueueRuntime: Parameters<typeof registerMessageQueueRoutes>[1];
  routingRuntime: Parameters<typeof registerRoutingRoutes>[1];
  permissionAutoAcceptRuntime: Parameters<typeof registerPermissionAutoAcceptRoutes>[1];
  globalEventHub: ReturnType<typeof createGlobalMessageStreamHub>;
  resolveWorkspaceScope: NonNullable<Parameters<typeof registerGuestRoutes>[1]['resolveWorkspaceScope']>
  & Parameters<typeof registerBehaviorRoutes>[1]['resolveWorkspaceScope'];
  resolveWorkspaceDirectory: (directory: string) => Promise<{ workspaceId?: string; projectId: string; projectDirectory?: string } | null | undefined>;
  resolveRepositoryWorkspace: Parameters<typeof registerWalkthroughRoutes>[1]['resolveRepositoryWorkspace'];
  resolveSessionScope: Parameters<typeof registerMarkdownImageGrantRoutes>[1]['resolveSessionScope'];
  resolveHostSessionScope: Parameters<typeof registerMessageQueueRoutes>[2]['resolveSessionScope'];
  listQueueScopes: Parameters<typeof registerMessageQueueRoutes>[2]['listQueueScopes'];
  resolveQuotaSelection: Parameters<typeof registerQuotaRoutes>[1]['resolveQuotaSelection'];
  listQuotaSelections: Parameters<typeof registerQuotaRoutes>[1]['listQuotaSelections'];
  resolveCredential: Parameters<typeof registerQuotaRoutes>[1]['resolveCredential'];
  readNativeReports: Parameters<typeof registerQuotaRoutes>[1]['readNativeReports'];
  resolvePrimaryWorktreeRoot: Parameters<typeof registerMagicPromptRoutes>[1]['resolvePrimaryWorktreeRoot'];
  resolveWorktreeTopLevel: Parameters<typeof registerMagicPromptRoutes>[1]['resolveWorktreeTopLevel'];
  sessionWorktreeMoveBridge: Parameters<typeof fillSessionWorktreeMoveBridge>[0];
  scheduledWorktreeBridge?: Parameters<typeof fillScheduledWorktreeBridge>[0];
  readWorktreeSetup?: ((projectId: string) => Promise<WorktreeSetupInput>) | undefined;
  openchamberVersion: string;
  themesDir?: string | null;
  isRequestOriginAllowed: RequestOriginChecker;
  laterPagesRuntime?: ReturnType<typeof createLaterPages> | null;
  sharePagesRuntime?: ReturnType<typeof createSharePagesRuntime> | null;
  receivedPagesRuntime?: ReturnType<typeof createReceivedPagesRuntime> | null;
  workflows?: ReturnType<typeof createWorkflowsModule> | null;
  autoReviewRuntime?: ReturnType<typeof createAutoReviewRuntime> | null;
  prWatchRuntime?: ReturnType<typeof createPrWatchRuntime> | null;
  extensionWaitsRuntime?: ReturnType<typeof createExtensionWaitsRuntime> | null;
  getActivePort?: () => number | null;
  getActiveHost?: () => string | null;
  builtInExtensionsDir?: string | undefined;
  extensionNotificationChannels?: ReturnType<typeof createExtensionNotificationChannels> | null;
  worktreeLeaseControl?: GitRouteDependencies['worktreeLeaseControl'];
  worktreeArchiveSessionService?: GitRouteDependencies['worktreeArchiveSessionService'];
  sessionFoldersStore?: Parameters<typeof registerSessionFoldersRoutes>[1]['sessionFoldersStore'];
}

const fileCodeSchema = z.object({ code: z.string() });
const passphraseEntrySchema = z.object({
  id: z.string(),
  integrationID: z.string(),
  value: z.object({
    type: z.string(),
    key: z.string().optional(),
  }),
});
type SshPassphraseSource = Parameters<typeof createSshPassphraseStore>[0];
type PassphraseEntry = Parameters<SshPassphraseSource['create']>[0];
type ListedPassphraseEntry = z.infer<typeof passphraseEntrySchema>;
type WalkthroughModule = Awaited<ReturnType<Parameters<typeof registerWalkthroughRoutes>[1]['getWalkthroughService']>>;
export const createFeatureRoutesRuntime = () => {
  let skillRepositoryDependencies: SkillRepositoryDependencies | null = null;
  let themeFolderWatch: ReturnType<typeof createThemeFolderWatch> | null = null;
  let stopTrackerSessionStatus = () => { };
  const gitRuntimeIdentity = Object.freeze({
    id: `server_${crypto.randomUUID()}`,
    platform: process.env.OPENCHAMBER_RUNTIME === 'desktop' ? 'desktop' : 'web',
  });

  let quotaProviders: typeof quotaIndex | null = null;
  const getQuotaProviders = async () => {
    if (!quotaProviders) {
      quotaProviders = await import('../quota/index.js');
    }
    return quotaProviders;
  };

  let smallModelService: typeof smallModelIndex | null = null;
  const getSmallModelService = async () => {
    if (!smallModelService) {
      smallModelService = await import('../small-model/index.js');
    }
    return smallModelService;
  };

  let walkthroughService: WalkthroughModule | null = null;
  let magicPromptOverridesForDirectory: ((directory: string) => Promise<Record<string, string>>) | undefined;
  let walkthroughBindingService: ReturnType<typeof registerSourceControlRoutes> | null = null;
  let gitRepositoryCredentialRuntime: ReturnType<typeof createGitRepositoryCredentialRuntime> | null = null;
  let networkOperations: ReturnType<typeof createNetworkOperations> | null = null;
  let gitWorktreeCreation: ReturnType<typeof registerGitRoutes> | null = null;
  const getWalkthroughService = async () => {
    if (!walkthroughService) {
      const [service, pullRequest] = await Promise.all([
        import('../walkthrough/index.js'),
        import('../walkthrough/pull-request.js'),
      ]);
      walkthroughService = {
        ...service,
        getPullRequestDiff: (directory, number, readContext, options) => pullRequest.getPullRequestDiff(
          directory,
          number,
          readContext,
          {
            allowEmpty: options?.allowEmpty,
            sourceRepo: options?.sourceRepo ?? null,
            revision: options?.revision,
            readChangeRequestPatch: walkthroughBindingService?.readChangeRequestPatch,
          },
        ),
        getPullRequestFileContents: (directory, number, readContext, options) => pullRequest.getPullRequestFileContents(
          directory,
          number,
          readContext,
          {
            path: options.path,
            previousPath: options.previousPath,
            status: options.status,
            sourceRepo: options.sourceRepo ?? null,
            revision: options.revision,
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

  const registerRoutes = async (app: Application, routeDependencies: FeatureRoutesDependencies) => {
    const {
      messageSearchRuntime,
      crypto: routeCrypto,
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
      readNativeReports,
      resolvePrimaryWorktreeRoot,
      resolveWorktreeTopLevel,
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
      crypto: routeCrypto,
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
      sanitizeProjects: (projects) => sanitizeProjects(projects) ?? [],
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

    routeDependencies.workflows?.register(app);

    if (routeDependencies.autoReviewRuntime) registerAutoReviewRoutes(app, routeDependencies.autoReviewRuntime);
    if (routeDependencies.prWatchRuntime) registerPrWatchRoutes(app, routeDependencies.prWatchRuntime);
    if (routeDependencies.extensionWaitsRuntime) registerExtensionWaitsRoutes(app, routeDependencies.extensionWaitsRuntime);
    registerProviderLogoRoutes(app, {
      fsPromises,
      path,
      crypto: routeCrypto,
      openchamberDataDir,
      readSettingsFromDiskMigrated,
      persistResolvedSettings: routeDependencies.persistResolvedSettings,
    });
    registerMarkdownImageGrantRoutes(app, {
      fsPromises,
      path,
      crypto: routeCrypto,
      sessionService: openChamberSessionService,
      resolveSessionScope,
      approvedTempRoot: os.tmpdir(),
    });



    const { getProfile, getGlobalIdentity, resolveRepositoryGitPaths } = await import('../git/index.js');

    const extensionQuotaGuests = () => listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) });
    const readExtensionCredential: NonNullable<QuotaRoutesDependencies<InstalledGuest>['readExtensionCredential']> = async (req, _guest, nativeProviderId) => {
      const selections = await listQuotaSelections(req).catch(() => []);
      const selection = selections.find((entry) => entry.providerId === nativeProviderId) ?? null;
      if (!selection) return null;
      const { workspaceId, agentDirectoryId, providerId, credentialRef } = selection;
      return resolveCredential({ workspaceId, agentDirectoryId, providerId, credentialRef, purpose: 'quota' }).catch(() => null);
    };
    const requestExtensionService: NonNullable<QuotaRoutesDependencies<InstalledGuest>['requestExtensionService']> = (guest, params) => {
      if (!guest.service) throw new Error('Guest extension has no service contribution');
      return proxyGuestServiceRequest({
        guestId: guest.id,
        guestName: guest.name,
        packageRoot: guest.packageRoot,
        service: guest.service,
        granted: guest.capabilityGrants,
        persistPath: extensionsPersistPath(openchamberDataDir),
        idleStopMs: guest.service.keepRunning ? undefined : 10 * 60_000,
        ...params,
      });
    };
    registerQuotaRoutes(app, {
      getQuotaProviders,
      resolveQuotaSelection,
      listQuotaSelections,
      resolveCredential,
      listExtensionQuotaGuests: extensionQuotaGuests,
      readExtensionCredential,
      requestExtensionService,
      readNativeReports,
    });
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
          readContributorProvenance: (directory) => contributorProvenance.read(directory),
        },
      },
    });
    const trackers = createTrackerRegistry(undefined, {
      foreignIds: sourceControlProviders.list().map((descriptor) => descriptor.id),
    });
    stopTrackerSessionStatus();
    const trackerSessionStatus = createTrackerSessionStatus({ registry: trackers });
    const unsubscribeTrackerStatus = globalEventHub.subscribeEvent(trackerSessionStatus.processPayload);
    stopTrackerSessionStatus = () => { unsubscribeTrackerStatus(); trackerSessionStatus.stop(); };
    const resolveSourceControlAccount = ({ provider, instance, accountId, credentialRevision }: AccountIdentity & { credentialRevision?: number }) => sourceControlProviders
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
    const sshPassphraseSource: SshPassphraseSource = {
      list: async (): Promise<ListedPassphraseEntry[]> => {
        try {
          const raw = await fsPromises.readFile(path.join(openchamberDataDir, 'git-ssh-passphrases.json'), 'utf8');
          const parsed = z.array(passphraseEntrySchema).safeParse(JSON.parse(raw));
          return parsed.success ? parsed.data : [];
        } catch (err) {
          if (fileCodeSchema.safeParse(err).data?.code === 'ENOENT') return [];
          throw err;
        }
      },
      create: async (entry: PassphraseEntry) => {
        const p = path.join(openchamberDataDir, 'git-ssh-passphrases.json');
        let list: ListedPassphraseEntry[] = [];
        try {
          const raw = await fsPromises.readFile(p, 'utf8');
          const parsed = z.array(passphraseEntrySchema).safeParse(JSON.parse(raw));
          if (parsed.success) list = parsed.data;
        } catch (err) {
          if (fileCodeSchema.safeParse(err).data?.code !== 'ENOENT') throw err;
        }
        const idx = list.findIndex((e) => e.id === entry.id);
        if (idx >= 0) list[idx] = entry;
        else list.push(entry);
        const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
        await fsPromises.writeFile(tmp, JSON.stringify(list, null, 2), { mode: 0o600 });
        await fsPromises.rename(tmp, p);
      },
      remove: async (id: string) => {
        const p = path.join(openchamberDataDir, 'git-ssh-passphrases.json');
        let list: ListedPassphraseEntry[] = [];
        try {
          const raw = await fsPromises.readFile(p, 'utf8');
          const parsed = z.array(passphraseEntrySchema).safeParse(JSON.parse(raw));
          if (parsed.success) list = parsed.data;
        } catch (err) {
          if (fileCodeSchema.safeParse(err).data?.code !== 'ENOENT') throw err;
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
    const syncRepositoryTransport: NonNullable<SourceControlRouteOptions['onRepositoryTransportChanged']> = async (directory, read) => {
      if (!isString(directory) || !directory.trim() || !gitRepositoryCredentialRuntime) return;
      const grants = (read?.binding?.remotes ?? []).filter((grant) => grant.readiness === 'ready' && grant.mode === 'managed' && grant.credentialId);
      let credentialHelper: string | null = null;
      let sshCommand: string | null = null;
      for (const grant of grants) {
        if (!grant.credentialId) continue;
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
    let trackedItemsService: ReturnType<typeof createTrackedItemsService> | null = null;
    const providerReadCache = createProviderReadCache({
      sourceControlProviderIds: sourceControlProviders.list().map((descriptor) => descriptor.id),
      trackerIds: trackers.list(),
      onChange: (provider) => trackedItemsService?.refreshProvider(provider),
      onItemRefresh: (provider, item) => trackedItemsService?.refreshItem(provider, item),
    });
    app.use((req, res, next) => {
      providerReadCache.middleware(req, res, next);
    });
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
      resolveCheckoutAuxiliary: async ({ directory, parentEndpoint, parentRemoteName, kind, path: checkoutPath }: {
        directory: string;
        parentEndpoint: string;
        parentRemoteName: string;
        kind: string;
        path: string;
      }) => {
        if (!(networkOperations?.inspectCheckoutHydration instanceof Function)) return null;
        const inspection = await networkOperations.inspectCheckoutHydration({
          directory, parentEndpoint, parentRemoteName,
        });
        return inspection.requirements.find((entry: { kind: string; path: string }) => entry.kind === kind && entry.path === checkoutPath) ?? null;
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
      isConnectionOpen: (connectionId: string) => findEventClient(connectionId) !== null,
      send: (connectionId: string, event: FeatureSseEvent) => {
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
    globalEventHub?.subscribeEvent((event, scope) => {
      const isIdle = (event.type === 'session.status' && event.runtimeStatus === 'idle')
        || event.type === 'run.completed' || event.type === 'run.failed' || event.type === 'run.cancelled';
      if (!isIdle) return;
      trackedItemsService.noteTurnFinished();
      providerReadCache.clear();
      if (scope?.cwd) announceTurnFinished(scope.cwd);
    });
    registerTrackedItemsRoutes(app, { service: trackedItemsService });
    const resolveGitIdentity = async (identityId: string) => {
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
    const binding = walkthroughBindingService;
    gitRepositoryCredentialRuntime = createGitRepositoryCredentialRuntime({
      readBinding: (directory) => binding.get(directory),
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
      onCheckoutHydrated: (directory: string) => completeWorktreeCheckoutHydration(directory, {
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
      currentGuest: async (guestId: string) => (await listInstalledGuests({ persistPath: extensionsPersistPath(openchamberDataDir) }))
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
      getSmallModelService,
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
      onQuotaProviderChanged: ({ providerId }: { providerId: string }) => {
        const clients = getOpenChamberEventClients();
        for (const client of clients) {
          try {
            writeSseEvent(client, { type: 'openchamber:quota-providers-changed', properties: { providerId } });
          } catch {
            clients.delete(client);
          }
        }
      },
      trackers,
      resolveWorkspaceScope,
      surfaceViewerHeaders,
      resolveOptionalProjectDirectory,
    });
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
      onBranchRewritten: walkthroughBindingService.invalidateBranchStatus,
      resolveSourceControlAccount,
      errorRedactionSecrets: [openchamberDataDir],
      worktreeBootstrapStore,
      worktreeLeaseControl: routeDependencies.worktreeLeaseControl,
      worktreeArchiveSessionService: routeDependencies.worktreeArchiveSessionService,
      emitWorktreeChanged: ({ directories, at }: { directories: string[]; at: number }) => {
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
    if (routeDependencies.sessionWorktreeMoveBridge) {
      fillSessionWorktreeMoveBridge(routeDependencies.sessionWorktreeMoveBridge, {
        createWorktree: gitWorktreeCreation?.createWorktree,
        removeWorktree: removeWorktreeService,
        hydrateCheckout: networkOperations.hydrateBoundCheckout,
        waitForWorktreeReady: async (directory: string) => {
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
        resolveWorktreeSetup: async (directory: string) => {
          const scope = await routeDependencies.resolveWorkspaceDirectory?.(directory).catch(() => null);
          if (!scope || !routeDependencies.readWorktreeSetup) return { startCommand: '', untrustedSkipped: [] };
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
      onChanged: (updatedAt: number) => {
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
      crypto: routeCrypto,
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
