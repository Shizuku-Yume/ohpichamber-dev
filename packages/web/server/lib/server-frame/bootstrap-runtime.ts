import type { registerNotificationRoutes as RegisterNotificationRoutes, NotificationRouteDependencies } from '../notifications/routes.js';
import type { NotificationEmitRouteDependencies } from '../notifications/emit-route.js';
import { registerNotificationEmitRoutes } from '../notifications/emit-route.js';
import type { registerOpenChamberRoutes as RegisterOpenChamberRoutes } from '../self-update/openchamber-routes.js';
import type { registerTtsRoutes as RegisterTtsRoutes, TtsRoutesDependencies } from '../tts/routes.js';
import type { createUiAuth as CreateUiAuth, UiAuthOptions } from '../ui-auth/ui-auth.js';
import type { createTunnelAuth } from '../tunnels/tunnel-auth.js';
import { registerCanonicalHostRoutes, type CanonicalHostRoutesOptions } from '../host/canonical-routes.js';
import type { Application, ExpressFactory } from '../shared/http-contracts.js';
import type { RequestOriginChecker } from '../security/request-security.js';
import { createApiAuthGate } from './api-auth-gate.js';
import type {
  AuthAndAccessRouteDependencies,
  CommonRequestMiddlewareDependencies,
  registerAuthAndAccessRoutes as RegisterAuthAndAccessRoutes,
  registerCommonRequestMiddleware as RegisterCommonRequestMiddleware,
  registerServerStatusRoutes as RegisterServerStatusRoutes,
  ServerStatusRouteDependencies,
} from './core-routes.js';

export interface BootstrapDependencies {
  createUiAuth: typeof CreateUiAuth;
  registerServerStatusRoutes: typeof RegisterServerStatusRoutes;
  registerCommonRequestMiddleware: typeof RegisterCommonRequestMiddleware;
  registerAuthAndAccessRoutes: typeof RegisterAuthAndAccessRoutes;
  registerTtsRoutes: typeof RegisterTtsRoutes;
  registerNotificationRoutes: typeof RegisterNotificationRoutes;
  registerOpenChamberRoutes: typeof RegisterOpenChamberRoutes;
  express: ExpressFactory;
}

export type CanonicalAgentRoutesInput = Omit<
  CanonicalHostRoutesOptions,
  'express' | 'uiAuthController' | 'tunnelAuthController' | 'isRequestOriginAllowed'
>;

export interface BootstrapSessionRuntime {
  getSessionActivitySnapshot: NotificationRouteDependencies['getSessionActivitySnapshot'];
  getSessionStateSnapshot: NotificationRouteDependencies['getSessionStateSnapshot'];
  getPendingBlockingRequestsSnapshot: NotificationRouteDependencies['getPendingBlockingRequestsSnapshot'];
  getSessionContextSnapshot?: NotificationRouteDependencies['getSessionContextSnapshot'];
  getSessionState: NotificationRouteDependencies['getSessionState'];
}

export interface SetupBaseRoutesOptions extends
  Omit<ServerStatusRouteDependencies, 'express' | 'uiAuthController' | 'tunnelAuthController'>,
  Omit<AuthAndAccessRouteDependencies, 'express' | 'uiAuthController' | 'tunnelAuthController' | 'readSettingsFromDiskMigrated'>,
  TtsRoutesDependencies,
  Omit<NotificationRouteDependencies,
    'uiAuthController' | 'getSessionActivitySnapshot' | 'getSessionStateSnapshot' | 'getPendingBlockingRequestsSnapshot' | 'getSessionContextSnapshot' | 'getSessionState'> {
  verboseRequestLogs?: CommonRequestMiddlewareDependencies['verboseRequestLogs'];
  skipBodyParsing?: CommonRequestMiddlewareDependencies['skipBodyParsing'];
  uiPassword: string | null;
  tunnelAuthController: ReturnType<typeof createTunnelAuth>;
  readSettingsFromDiskMigrated: NonNullable<UiAuthOptions['readSettingsFromDiskMigrated']> & AuthAndAccessRouteDependencies['readSettingsFromDiskMigrated'];
  canonicalAgentRoutes: CanonicalAgentRoutesInput;
  sessionRuntime: BootstrapSessionRuntime;
  modelsDevApiUrl: string;
  modelsMetadataCacheTtl: number;
  pluginNotificationEmitter: NotificationEmitRouteDependencies['emitter'];
  isRequestOriginAllowed: RequestOriginChecker;
}

export const createBootstrapRuntime = (dependencies: BootstrapDependencies) => {
  const {
    createUiAuth,
    registerServerStatusRoutes,
    registerCommonRequestMiddleware,
    registerAuthAndAccessRoutes,
    registerTtsRoutes,
    registerNotificationRoutes,
    registerOpenChamberRoutes,
    express,
  } = dependencies;

  const setupBaseRoutes = (app: Application, options: SetupBaseRoutesOptions) => {
    const {
      process,
      openchamberVersion,
      runtimeName,
      serverStartedAt,
      gracefulShutdown,
      getHealthSnapshot,
      getServerPort,
      getTunnelUrl,
      verboseRequestLogs,
      uiPassword,
      tunnelAuthController,
      remoteClientAuthRuntime,
      clientPairingRuntime,
      getRelayPairingCandidate,
      reconcileRelay,
      removeClientPushDevices,
      getPairingTransports,
      getDirectCandidateUrls,
      getServerId,
      getServerLabel,
      readSettingsFromDiskMigrated,
      normalizeTunnelSessionTtlMs,
      sayTTSCapability,
      ttsService,
      resolveTtsSelection,
      canonicalAgentRoutes,
      ensurePushInitialized,
      ensureGlobalWatcherStarted,
      getOrCreateVapidKeys,
      getUiSessionTokenFromRequest,
      updateSettingsFromDisk,
      addOrUpdatePushSubscription,
      removePushSubscription,
      addOrUpdateApnsToken,
      removeApnsToken,
      resolveApnsStatus,
      isLocalOnlyPushRequest,
      updateUiVisibility,
      clearPendingPushBadge,
      clearSessionPushNotifications,
      isUiVisible,
      getUiNotificationClients,
      writeSseEvent,
      sessionRuntime,
      setPushInitialized,
      modelsDevApiUrl,
      modelsMetadataCacheTtl,
      setAutoAcceptSession,
      pluginNotificationEmitter,
      skipBodyParsing,
      isRequestOriginAllowed,
    } = options;

    const uiAuthController = createUiAuth({
      password: uiPassword,
      readSettingsFromDiskMigrated,
      clientAuthController: remoteClientAuthRuntime,
    });
    if (uiAuthController.enabled) {
      console.log('UI password protection enabled for browser sessions');
    }

    registerServerStatusRoutes(app, {
      express,
      process,
      openchamberVersion,
      runtimeName,
      serverStartedAt,
      gracefulShutdown,
      getHealthSnapshot,
      getServerId,
      getServerPort,
      getTunnelUrl,
      tunnelAuthController,
      uiAuthController,
    });

    registerCommonRequestMiddleware(app, { express, verboseRequestLogs, skipBodyParsing });

    registerCanonicalHostRoutes(app, {
      ...canonicalAgentRoutes,
      enterprisePolicyOptions: canonicalAgentRoutes?.enterprisePolicyOptions,
      onProviderConfigurationMutation: canonicalAgentRoutes?.onProviderConfigurationMutation,
      express,
      uiAuthController,
      tunnelAuthController,
      isRequestOriginAllowed,
    });

    const notificationEmitRoutes = registerNotificationEmitRoutes(app, {
      express,
      emitter: pluginNotificationEmitter,
    });

    registerAuthAndAccessRoutes(app, {
      express,
      tunnelAuthController,
      uiAuthController,
      remoteClientAuthRuntime,
      clientPairingRuntime,
      getRelayPairingCandidate,
      reconcileRelay,
      removeClientPushDevices,
      getPairingTransports,
      getDirectCandidateUrls,
      getServerId,
      getServerLabel,
      readSettingsFromDiskMigrated,
      normalizeTunnelSessionTtlMs,
    });

    notificationEmitRoutes.registerApiRoute(createApiAuthGate({ tunnelAuthController, uiAuthController }));

    registerTtsRoutes(app, { sayTTSCapability, ttsService, resolveTtsSelection });

    registerNotificationRoutes(app, {
      uiAuthController,
      ensurePushInitialized,
      ensureGlobalWatcherStarted,
      getOrCreateVapidKeys,
      getUiSessionTokenFromRequest,
      updateSettingsFromDisk,
      addOrUpdatePushSubscription,
      removePushSubscription,
      addOrUpdateApnsToken,
      removeApnsToken,
      resolveApnsStatus,
      isLocalOnlyPushRequest,
      updateUiVisibility,
      clearPendingPushBadge,
      clearSessionPushNotifications,
      isUiVisible,
      getUiNotificationClients,
      writeSseEvent,
      getSessionActivitySnapshot: sessionRuntime.getSessionActivitySnapshot,
      getSessionStateSnapshot: sessionRuntime.getSessionStateSnapshot,
      getPendingBlockingRequestsSnapshot: sessionRuntime.getPendingBlockingRequestsSnapshot,
      getSessionContextSnapshot: sessionRuntime.getSessionContextSnapshot,
      getSessionState: sessionRuntime.getSessionState,
      setPushInitialized,
      setAutoAcceptSession,
    });

    registerOpenChamberRoutes(app, {
      modelsDevApiUrl,
      modelsMetadataCacheTtl,
    });

    return {
      uiAuthController,
    };
  };

  return {
    setupBaseRoutes,
  };
};
