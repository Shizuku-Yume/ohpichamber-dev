import { z } from 'zod';
import { asNonEmptyString, isBoolean, isString } from './lib/shared/object-guards.js';
import type { Application, Request, Response, Router } from './lib/shared/http-contracts.js';
import type { JsonValue } from './lib/shared/json-values.js';
import type { DesktopRuntimeConfig } from './lib/realtime-proxy.js';
import type { NotificationPayload } from './lib/notifications/contracts.js';
import type { ScheduledTaskEventClient } from './lib/scheduled-tasks/routes.js';
import type { FormattedSettings, SettingsDocument } from './lib/settings/settings-helpers.js';
import type { HostActionRequest, HostAuthorizationScope } from '@openchamber/agent-service/private-protocol';
import type { ArchiveSnapshot } from './lib/message-search/store.js';
import type { StreamSocket } from './lib/event-stream/contracts.js';
import type { TunnelController } from './lib/tunnels/contracts.js';
import type { WorktreeLeaseControl } from './lib/git/service-contracts.js';
import type { ListenOptions } from './lib/server-frame/server-startup-runtime.js';
import { webPackagePaths } from './lib/web-package-paths.js';
import 'reflect-metadata';
import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';
import http2 from 'node:http2';
import { RuntimeSessionSchema } from '@openchamber/agent-contract';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createUiAuth, getBearerTokenFromRequest } from './lib/ui-auth/ui-auth.js';
import { createTunnelAuth } from './lib/tunnels/tunnel-auth.js';
import { createManagedTunnelConfigRuntime } from './lib/tunnels/managed-config.js';
import { createTunnelProviderRegistry } from './lib/tunnels/registry.js';
import { createCloudflareTunnelProvider } from './lib/tunnels/providers/cloudflare.js';
import { createNgrokTunnelProvider } from './lib/tunnels/providers/ngrok.js';
import { createTailscaleTunnelProvider } from './lib/tunnels/providers/tailscale.js';
import { allowsLocalDevOrigins, buildFrameAncestorsPolicy, createRequestSecurityRuntime, isLocalDevClientOrigin } from './lib/security/request-security.js';
import {
 getUnauthenticatedLanErrorMessage,
 isLoopbackBindHost,
 isNetworkExposedBindHost,
 isUnsafeUnauthenticatedLanAllowed,
 readAdvertisedLanUrl,
} from './lib/security/bind-host.js';
import { isEnterpriseMode, isNetworkAccessBlocked, NETWORK_ACCESS_BLOCKED_ERROR } from './lib/enterprise-mode.js';
import {
 TUNNEL_MODE_MANAGED_LOCAL,
 TUNNEL_MODE_MANAGED_REMOTE,
 TUNNEL_MODE_QUICK,
 TUNNEL_PROVIDER_CLOUDFLARE,
 TunnelServiceError,
 isSupportedTunnelMode,
 normalizeOptionalPath,
 normalizeTunnelStartRequest,
 normalizeTunnelMode,
 normalizeTunnelProvider,
} from './lib/tunnels/types.js';
import { prepareNotificationLastMessage } from './lib/notifications/index.js';
import { registerTtsRoutes } from './lib/tts/routes.js';
import { createTTSService } from './lib/tts/service.js';
import { detectSayTtsCapability } from './lib/tts/capability-runtime.js';
import { createTerminalRuntime } from './lib/terminal/runtime.js';
import { createDictationRuntime } from './lib/dictation/runtime.js';
import {
 createGlobalUiEventBroadcaster,
 createGlobalMessageStreamHub,
 createMessageStreamWsRuntime,
} from './lib/event-stream/index.js';
import { createFsSearchRuntime as createFsSearchRuntimeFactory } from './lib/fs/search.js';
import { createProjectDirectoryRuntime } from './lib/projects/project-directory-runtime.js';
import { createSettingsNormalizationRuntime } from './lib/settings/settings-normalization-runtime.js';
import { createSettingsHelpers } from './lib/settings/settings-helpers.js';
import { createThemeRuntime } from './lib/appearance/theme-runtime.js';
import { parseServeCliOptions } from './lib/server-frame/cli-options.js';
import {
 isRequestAuthorized,
 registerAuthAndAccessRoutes,
 registerCommonRequestMiddleware,
 registerServerStatusRoutes,
} from './lib/server-frame/core-routes.js';
import { registerOpenChamberRoutes } from './lib/self-update/openchamber-routes.js';
import { createStaticRoutesRuntime } from './lib/server-frame/static-routes-runtime.js';
import { listPwaSessions } from './lib/host/pwa-session-shortcuts.js';
import { createSettingsRuntime } from './lib/settings/settings-runtime.js';
import { registerSettingsRoutes } from './lib/host/settings-routes.js';
import { createSessionRuntime } from './lib/host/session-runtime.js';
import { createServerUtilsRuntime } from './lib/server-frame/server-utils-runtime.js';
import { createFeatureRoutesRuntime } from './lib/server-frame/feature-routes-runtime.js';
import { createBootstrapRuntime } from './lib/server-frame/bootstrap-runtime.js';
import { createGracefulShutdownRuntime } from './lib/server-frame/shutdown-runtime.js';
import { runCliEntryIfMain } from './lib/server-frame/cli-entry-runtime.js';
import { configureAgentService } from './lib/small-model/client.js';
import { createSessionAssistRuntime } from './lib/session-assist/runtime.js';
import { createChatDirectoryCleanupRuntime } from './lib/chat-directories/runtime.js';
import { createContextObligatoryRuntime } from './lib/context-obligatory/runtime.js';
import { createLinearSessionStatusRuntime } from './lib/linear/status-runtime.js';
import { createSessionKnowledgeRuntime } from './lib/session-knowledge/runtime.js';
import { createMessageSearchRuntime } from './lib/message-search/runtime.js';
import { createScheduledTasksRuntime } from './lib/scheduled-tasks/runtime.js';
import { createUnregisteredScheduledWorktreeBridge } from './lib/scheduled-tasks/worktree-bridge.js';
import { createUnregisteredSessionWorktreeMoveBridge } from './lib/openchamber-sessions/worktree-move-bridge.js';
import { resolveScheduledTaskOptions, resolveSessionDefaults } from './lib/scheduled-tasks/session-defaults.js';
import { createScheduledTaskContext } from './lib/scheduled-tasks/existing-session.js';
import { createChatsScope } from './lib/scheduled-tasks/chats-scope.js';
import { createServerStartupRuntime } from './lib/server-frame/server-startup-runtime.js';
import { createTunnelWiringRuntime } from './lib/tunnels/tunnel-wiring-runtime.js';
import { createStartupPipelineRuntime } from './lib/server-frame/startup-pipeline-runtime.js';
import { registerNotificationRoutes } from './lib/notifications/routes.js';
import { createNotificationEmitterRuntime } from './lib/notifications/emitter-runtime.js';
import { createNotificationTriggerRuntime } from './lib/notifications/runtime.js';
import { createPushTagsStore } from './lib/notifications/push-tags-store.js';
import { createPushRuntime } from './lib/notifications/push-runtime.js';
import { createApnsRuntime } from './lib/notifications/apns-runtime.js';
import { createNotificationTemplateRuntime } from './lib/notifications/template-runtime.js';
import { createCanonicalQueueRuntime, createPromptQueueStore, registerCanonicalQueueRoutes } from './lib/message-queue/runtime.js';
import { createDispatchResultsRuntime } from './lib/dispatch-results/runtime.js';
import { createRoutingRuntime } from './lib/routing/runtime.js';
import { registerHostPermissionRuntime } from './lib/permission-auto-accept/host-channel.js';
import { createPermissionAutoAcceptRuntime } from './lib/permission-auto-accept/runtime.js';
import { createJevClient } from './lib/routing/jev.js';
import { createSessionWorkRuntime } from './lib/session-work/runtime.js';
import { createSelectedUsageQuota } from './lib/quota/selected-usage.js';
import { createCanonicalActivityProbe } from './lib/session-work/activity-probe.js';
import { createSessionLineage } from './lib/session-lineage.js';
import { beginGuestServiceHost, beginGuestServiceShutdown, stopAllGuestServices } from './lib/guests/service.js';
import { findInstalledGuest, listInstalledGuests } from './lib/guests/catalog.js';
import { extensionsPersistPath } from './lib/guests/persist.js';
import { createGuestSurfaceRuntime } from './lib/guests/surface.js';
import { BROWSER_PROVIDER_IDLE_MS } from 'ohpichamber-sdk';
import { createProjectConfigRuntime } from './lib/projects/project-config.js';
import { worktreeSetupOf } from './lib/projects/worktree-setup.js';
import { ensureChatsDir, migrateLegacyUserDirs } from './lib/data-dir-migration.js';
import { createProjectContextRuntime } from './lib/project-context/runtime.js';
import { resolveProjectContextId } from './lib/projects/project-context-id.js';
import { createSpacesHost } from './lib/spaces/host.js';
import { createSpaceArchive } from './lib/spaces/space-archive.js';
import { CHAT_EXPORT_TIMEOUT_MS } from './lib/spaces/space-native-archive.js';
import { readIdleStopSetting, startIdleStop } from './lib/spaces/idle-stop.js';
import { SPACE_IDLE_EXIT_CODE } from './lib/spaces/layout.js';
import { createSwitchController, registerSpaceRoutes } from './lib/spaces/routes.js';
import { spacesHostEnabled } from './lib/spaces/release.js';
import { configureGitEnvironment, configureProjectWorktreeDirectory, resolvePrimaryWorktreeRoot, resolveWorktreeTopLevel, validateWorktreeDirectory, getWorktrees, isWorktreeDirectoryPinned } from './lib/git/service.js';
import { createEnvironmentStore } from './lib/environment/store.js';
import { createEnvironmentRuntime } from './lib/environment/runtime.js';
import { createWorktreeBootstrapStore } from './lib/git/worktree-bootstrap-storage.js';
import { createRemoteClientAuthRuntime } from './lib/client-auth/remote-clients.js';
import { createClientPairingRuntime } from './lib/client-auth/pairing.js';
import { attachRealtimeProxy } from './lib/realtime-proxy.js';
import { createRelayService, pinnedRelayUrl, relayBlockedByEnterprise } from './lib/relay/service.js';
import { createRelayHostLock } from './lib/relay/host-lock.js';
import { createRelayKeyStore } from './lib/relay/key-store.js';
import { createBrowserControlBroker } from './lib/browser-control/broker.js';
import { createBrowserClientEvents } from './lib/browser-control/client-events.js';
import { createBrowserControlRouter } from './lib/browser-control/provider.js';
import { createDevServerScanner } from './lib/dev-servers/routes.js';
import { createDevTunnelRuntime } from './lib/dev-tunnel/runtime.js';
import { registerBrowserControlRoutes } from './lib/browser-control/routes.js';
import { createUploadStore, registerUploadRoute } from './lib/browser-control/uploads.js';
import { createOpenChamberSessionService, registerCanonicalSessionRoutes } from './lib/openchamber-sessions/routes.js';
import { createHostSessionState } from './lib/host/session-state.js';
import { createHostAgentScopeRuntime } from './lib/host/agent-scope-runtime.js';
import { createHostAgentRuntime } from './lib/host/agent-runtime.js';
import { createAttachmentRoutes } from './lib/host/attachment-routes.js';
import { createLegacyAttachmentImporter } from './lib/host/legacy-attachment-importer.js';
import { createHostPromptDeliveryRuntime } from './lib/host/prompt-delivery-runtime.js';
import { createBehaviorPromptSource } from './lib/host/behavior-prompt.js';
import { readMergedSettingsSync } from './lib/host/settings-files.js';
import { createSelectedCredentialResolver, createSelectedCredentialHandoff, createCatalogCredentialSelections, quotaProviderIdsForNativeProvider } from './lib/host/private-credential.js';
import { createNativeUsageReader } from './lib/quota/native.js';
import { buildQuotaProvidersChangedEventForProvider } from './lib/quota/extension-registry.js';
import { createScheduledTaskService } from './lib/scheduled-tasks/service.js';
import { createOpenChamberControlService } from './lib/openchamber-control/service.js';
import { createLaterPages } from './lib/openchamber-control/later-pages.js';
import { createSyntheticDelivery } from './lib/openchamber-control/synthetic-delivery.js';
import { createSharePagesRuntime } from './lib/share-pages/runtime.js';
import { createSharePageStore } from './lib/share-pages/store.js';
import {
 createRelayShareSigner,
 createShareRelayClient,
 createShareViewerClient,
 isRelayBaseAllowed,
 isSharingAvailable,
 resolveShareRelayBase,
} from './lib/share-pages/relay-client.js';
import { allowedReceiveBases } from './lib/share-pages/received-link.js';
import { createReceivedPagesRuntime } from './lib/share-pages/received-runtime.js';
import { createReceivedPageStore } from './lib/share-pages/received-store.js';
import { createWorkflowsModule } from './lib/workflows/routes.js';
import { isWorkflowFeatureAvailable } from './lib/workflows/routes.js';
import { createPluginNotificationEmitter } from './lib/notifications/emit-route.js';
import { OpenChamberControlError } from './lib/openchamber-control/error.js';
import { createSessionLinker } from './lib/openchamber-sessions/session-link.js';
import { createTurnDurationRecorder } from './lib/openchamber-sessions/turn-duration.js';
import { createFileOpenRequester } from './lib/openchamber-control/file-open.js';
import { applyConnectAttemptTimeout } from './lib/network-defaults.js';
import { applyOutboundProxyFromEnv } from './lib/outbound-proxy.js';
import { applySystemCertificates } from './lib/system-ca.js';
import { createOutboundHandles } from './lib/source-control/outbound-handles.js';
import { createNotificationChannelAccounts, notificationChannelsPersistPath } from './lib/notifications/channel-accounts.js';
import { createExtensionNotificationChannels } from './lib/notifications/extension-channels.js';
import { NOTIFICATIONS_OUTBOUND_PATH } from 'ohpichamber-sdk';
import { createAutoReviewRuntime } from './lib/auto-review/runtime.js';
import { createPrWatchRuntime } from './lib/pr-watch/runtime.js';
import { createExtensionWaitsRuntime } from './lib/extension-waits/runtime.js';
import { createClientPushAccess } from './lib/notifications/client-push-access.js';
import { proxyGuestServiceRequest } from './lib/guests/service.js';
import { setHostCallbackRoute } from './lib/guests/host-callback.js';
import { registerGuestServiceHost } from './lib/guests/service-host.js';
applyConnectAttemptTimeout();
applySystemCertificates();
applyOutboundProxyFromEnv();

export interface QuitRiskStatus {
 tunnel: { active: boolean };
 scheduledTasks: ReturnType<typeof createScheduledTasksRuntime>['getStatus'] extends () => infer Status ? Status : never;
}

export interface WebUiServerController {
 expressApp: Application;
 httpServer: http.Server;
 getPort: () => number;
 startAgentService: () => ReturnType<typeof hostAgentRuntime.service.getState> | Promise<ReturnType<typeof hostAgentRuntime.service.getState>>;
 stopAgentService: () => Promise<void>;
 getAgentServiceState: () => ReturnType<typeof hostAgentRuntime.service.getState>;
 getTunnelUrl: () => string | null;
 getQuitRiskStatus: () => QuitRiskStatus;
 stop: (options?: { exitProcess?: boolean }) => Promise<void>;
}

export interface StartWebUiServerOptions {
 port?: number | undefined;
 host?: string | undefined;
 attachSignals?: boolean | undefined;
 exitOnShutdown?: boolean | undefined;
 apiOnly?: boolean | undefined;
 uiPassword?: string | null | undefined;
 tryCfTunnel?: boolean | undefined;
 tunnelProvider?: string | undefined;
 tunnelMode?: string | undefined;
 tunnelConfigPath?: string | null | undefined;
 tunnelToken?: string | undefined;
 tunnelHostname?: string | undefined;
 builtInExtensionsDir?: string | undefined;
 onTunnelReady?: ListenOptions['onTunnelReady'] | undefined;
 onDesktopNotification?: ((payload: NotificationPayload) => void) | undefined;
 getIsWindowFocused?: (() => boolean) | undefined;
 getDesktopRuntimeConfig?: (() => DesktopRuntimeConfig | null) | undefined;
}

const packageVersionSchema = z.object({ version: z.string().optional() });
const errorDetailsSchema = z.object({
 code: z.string().optional(),
 message: z.string().optional(),
});
const worktreeLeaseProblemSchema = z.object({
 code: z.string().optional(),
 detail: z.string().optional(),
 status: z.number().optional(),
 details: z.object({ leaseId: z.string().optional() }).optional(),
});
const archiveImportAckSchema = z.object({
 imported: z.boolean().optional(),
 sessionId: z.string().optional(),
 session: z.looseObject({
  sessionId: z.string().optional(),
  rootSessionId: z.string().optional(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
 }).optional(),
 children: z.array(z.looseObject({ childSessionId: z.string() })).optional(),
 detail: z.string().optional(),
 code: z.string().optional(),
});
const providerMutationSchema = z.object({ providerId: z.string() });
type QueueFailureProperties = { code: string; sessionId?: string };
type ScheduledTaskRanProperties = {
 projectId: string;
 taskId: string;
 ranAt: number;
 status: string;
 sessionId?: string;
};
const __filename = fileURLToPath(new URL('./index.js', import.meta.url));
const __dirname = path.join(webPackagePaths.root, 'server');
let exitOnShutdown = false;
let isShuttingDown = false;
let activeTunnelController: TunnelController | null = null;
let runtimeManagedRemoteTunnelHostname: string | null = null;
let server: http.Server | null = null;
let runtimeManagedRemoteTunnelToken: string | null = null;
let uiAuthController: ReturnType<typeof createUiAuth> | null = null;
let spacesHost: ReturnType<typeof createSpacesHost> | null = null;
let realtimeProxyRuntime: ReturnType<typeof attachRealtimeProxy> | null = null;
let guestSurfaceRuntime: ReturnType<typeof createGuestSurfaceRuntime> | null = null;
let relayServiceInstance: ReturnType<typeof createRelayService> | null = null;
let terminalRuntime: ReturnType<typeof createTerminalRuntime> | null = null;
let dictationRuntime: ReturnType<typeof createDictationRuntime> | null = null;
let messageStreamRuntime: ReturnType<typeof createMessageStreamWsRuntime> | null = null;
let signalsAttached = false;
let relayReconcileTimer: ReturnType<typeof setInterval> | null = null;

const DEFAULT_PORT = 3000;
const DESKTOP_NOTIFY_PREFIX = '[OhPiChamberDesktopNotify] ';
const uiNotificationClients = new Set<Response>();
const uiNotificationWsClients = new Set<StreamSocket>();
const uiOpenChamberEventClients = new Set<ScheduledTaskEventClient>();
const SHUTDOWN_TIMEOUT = 10000;
const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const MODELS_METADATA_CACHE_TTL = 5 * 60 * 1000;
const TUNNEL_BOOTSTRAP_TTL_DEFAULT_MS = 30 * 60 * 1000;
const TUNNEL_BOOTSTRAP_TTL_MIN_MS = 60 * 1000;
const TUNNEL_BOOTSTRAP_TTL_MAX_MS = 24 * 60 * 60 * 1000;
const TUNNEL_SESSION_TTL_DEFAULT_MS = 8 * 60 * 60 * 1000;
const TUNNEL_SESSION_TTL_MIN_MS = 5 * 60 * 1000;
const TUNNEL_SESSION_TTL_MAX_MS = 30 * 24 * 60 * 60 * 1000;

function headerIncludesEventStream(value: string | string[] | number | undefined): boolean {
 if (isString(value)) {
  return value.toLowerCase().includes('text/event-stream');
 }

 if (Array.isArray(value)) {
  return value.some((entry) => isString(entry) && entry.toLowerCase().includes('text/event-stream'));
 }

 return false;
}

const SSE_PATH_PREFIXES = [
 '/api/event',
 '/api/global/event',
 '/api/notifications/stream',
 '/api/openchamber/events',
 '/api/openchamber/realtime-proxy/sse',
];

function shouldSkipCompression(req: Request, res: Response): boolean {
 if (process.env.OPENCHAMBER_RUNTIME === 'desktop') {
  return true;
 }

 if (headerIncludesEventStream(req.headers.accept)) {
  return true;
 }

 const pathname = req.path || req.url || '';
 if ((pathname === '/api' || pathname.startsWith('/api/')) && shouldSkipApiCompression()) {
  return true;
 }

 for (const prefix of SSE_PATH_PREFIXES) {
  if (pathname === prefix) {
   return true;
  }
 }

 return headerIncludesEventStream(res.getHeader('Content-Type'));
}

const OPENCHAMBER_VERSION = (() => {
 try {
  const packagePath = path.resolve(__dirname, '..', 'package.json');
  const raw = fs.readFileSync(packagePath, 'utf8');
  const parsed = packageVersionSchema.safeParse(JSON.parse(raw));
  const version = parsed.success ? asNonEmptyString(parsed.data.version) : null;
  if (version) {
   return version;
  }
 } catch {
  return 'unknown';
 }
 return 'unknown';
})();

const isEnvFlagEnabled = (value: string | boolean | number | undefined): boolean => {
 if (value === true || value === 1) return true;
 if (!isString(value)) return false;
 const normalized = value.trim().toLowerCase();
 return normalized === '1' || normalized === 'true';
};

const isEnvFlagDisabled = (value: string | boolean | number | undefined): boolean => {
 if (value === false || value === 0) return true;
 if (!isString(value)) return false;
 const normalized = value.trim().toLowerCase();
 return normalized === '0' || normalized === 'false';
};

const shouldSkipApiCompression = (): boolean => {
 if (isEnvFlagEnabled(process.env.OPENCHAMBER_SKIP_API_COMPRESSION)) return true;
 if (isEnvFlagEnabled(process.env.OPENCHAMBER_COMPRESS_API)) return false;
 if (isEnvFlagDisabled(process.env.OPENCHAMBER_COMPRESS_API)) return true;
 return process.env.OPENCHAMBER_RUNTIME === 'desktop';
};

const OPENCHAMBER_VERBOSE_REQUEST_LOGS = isEnvFlagEnabled(process.env.OPENCHAMBER_VERBOSE_REQUEST_LOGS);

const PLAN_MODE_EXPERIMENT_ENABLED =
 isEnvFlagEnabled(process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE)
 || isEnvFlagEnabled(process.env.OPENCODE_EXPERIMENTAL);

const fsPromises = fs.promises;

const settingsNormalizationRuntime = createSettingsNormalizationRuntime({
 os,
 path,
 processLike: process,
 realpathSync: fs.realpathSync,
 readdirSync: fs.readdirSync,
 tunnelBootstrapTtlDefaultMs: TUNNEL_BOOTSTRAP_TTL_DEFAULT_MS,
 tunnelBootstrapTtlMinMs: TUNNEL_BOOTSTRAP_TTL_MIN_MS,
 tunnelBootstrapTtlMaxMs: TUNNEL_BOOTSTRAP_TTL_MAX_MS,
 tunnelSessionTtlDefaultMs: TUNNEL_SESSION_TTL_DEFAULT_MS,
 tunnelSessionTtlMinMs: TUNNEL_SESSION_TTL_MIN_MS,
 tunnelSessionTtlMaxMs: TUNNEL_SESSION_TTL_MAX_MS,
});

const {
 normalizeDirectoryPath,
 normalizePathForPersistence,
 normalizeSettingsPaths,
 normalizeTunnelBootstrapTtlMs,
 normalizeTunnelSessionTtlMs,
 normalizeManagedRemoteTunnelHostname,
 normalizeManagedRemoteTunnelPresets,
 normalizeManagedRemoteTunnelPresetTokens,
 normalizeStringArray,
 sanitizeModelRefs,
 sanitizeSkillCatalogs,
 sanitizeProjects,
} = settingsNormalizationRuntime;

const OPENCHAMBER_DEFAULT_CONFIG_ROOT = path.join(os.homedir(), '.config', 'ohpichamber');
const OPENCHAMBER_USER_CONFIG_ROOT = process.env.OPENCHAMBER_DATA_DIR
 ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
 : OPENCHAMBER_DEFAULT_CONFIG_ROOT;
const OPENCHAMBER_USER_THEMES_DIR = path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'themes');
const OPENCHAMBER_PROJECTS_CONFIG_DIR = path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'projects');
const OPENCHAMBER_CHATS_DIR = process.env.OPENCHAMBER_CHATS_DIR && process.env.OPENCHAMBER_CHATS_DIR.trim()
 ? path.resolve(process.env.OPENCHAMBER_CHATS_DIR.trim())
 : path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'chats');

const MAX_THEME_JSON_BYTES = 512 * 1024;

const themeRuntime = createThemeRuntime({
 fsPromises,
 path,
 themesDir: OPENCHAMBER_USER_THEMES_DIR,
 maxThemeJsonBytes: MAX_THEME_JSON_BYTES,
 logger: console,
});

const { readCustomThemesFromDisk, saveImportedTheme, deleteImportedTheme } = themeRuntime;
const OPENCHAMBER_DATA_DIR = OPENCHAMBER_USER_CONFIG_ROOT;
const SETTINGS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'settings.json');
const PUSH_SUBSCRIPTIONS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'push-subscriptions.json');
const APNS_TOKENS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'apns-tokens.json');
const REMOTE_CLIENTS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'remote-clients.json');
const CLIENT_PAIRING_SESSIONS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'client-pairing-sessions.json');
const CLOUDFLARE_MANAGED_REMOTE_TUNNELS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'cloudflare-managed-remote-tunnels.json');
const CLOUDFLARE_LEGACY_NAMED_TUNNELS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'cloudflare-named-tunnels.json');
const CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION = 1;
const worktreeBootstrapStore = createWorktreeBootstrapStore({
 filePath: path.join(OPENCHAMBER_DATA_DIR, 'git-worktree-bootstrap.json'),
 fsImpl: fsPromises,
});

const managedTunnelConfigRuntime = createManagedTunnelConfigRuntime({
 fsPromises,
 path,
 normalizeManagedRemoteTunnelHostname,
 normalizeManagedRemoteTunnelPresets,
 constants: {
  CLOUDFLARE_MANAGED_REMOTE_TUNNELS_FILE_PATH,
  CLOUDFLARE_LEGACY_NAMED_TUNNELS_FILE_PATH,
  CLOUDFLARE_MANAGED_REMOTE_TUNNELS_VERSION,
 },
});

const {
 readManagedRemoteTunnelConfigFromDisk,
 syncManagedRemoteTunnelConfigWithPresets,
 upsertManagedRemoteTunnelToken,
 resolveManagedRemoteTunnelToken,
} = managedTunnelConfigRuntime;

const settingsHelpers = createSettingsHelpers({
 normalizePathForPersistence,
 normalizeTunnelBootstrapTtlMs,
 normalizeTunnelSessionTtlMs,
 normalizeTunnelProvider,
 normalizeTunnelMode,
 normalizeOptionalPath,
 normalizeManagedRemoteTunnelHostname,
 normalizeManagedRemoteTunnelPresets,
 normalizeManagedRemoteTunnelPresetTokens,
 normalizeStringArray,
 sanitizeModelRefs,
 sanitizeSkillCatalogs,
 sanitizeProjects,
});

const {
 normalizePwaAppName,
 normalizePwaOrientation,
 sanitizeSettingsUpdate,
 mergePersistedSettings,
 formatSettingsResponse,
} = settingsHelpers;

const projectDirectoryRuntime = createProjectDirectoryRuntime({
 fsPromises,
 path,
 normalizeDirectoryPath,
 getReadSettingsFromDiskMigrated: () => readSettingsFromDiskMigrated,
 sanitizeProjects,
 refuseDirectory: (candidate) => spacesHost?.refuseDirectory(candidate) ?? null,
});

const {
 resolveDirectoryCandidate,
 validateDirectoryPath,
 resolveProjectDirectory,
 resolveOptionalProjectDirectory,
} = projectDirectoryRuntime;

const settingsRuntime = createSettingsRuntime({
 fsPromises,
 path,
 crypto,
 SETTINGS_FILE_PATH,
 sanitizeProjects,
 sanitizeSettingsUpdate,
 mergePersistedSettings,
 normalizeSettingsPaths,
 normalizeStringArray,
 formatSettingsResponse,
 resolveDirectoryCandidate,
 managedChatsRoot: OPENCHAMBER_CHATS_DIR,
 normalizeManagedRemoteTunnelHostname,
 normalizeManagedRemoteTunnelPresets,
 normalizeManagedRemoteTunnelPresetTokens,
 syncManagedRemoteTunnelConfigWithPresets,
 upsertManagedRemoteTunnelToken,
 onMessageSearchEnabledChanged: (enabled) => messageSearchRuntime.setEnabled(enabled),
 onMessageSearchReasoningChanged: (enabled) => messageSearchRuntime.setReasoningEnabled(enabled),
});

const {
 readSettingsFromDiskMigrated,
 readSettingsFromDisk,
 readSettingsFromDiskStrict,
 persistSettings,
} = settingsRuntime;

const requestSecurityRuntime = createRequestSecurityRuntime({
 readSettingsFromDiskMigrated,
 allowLocalDevOrigins: allowsLocalDevOrigins(process.env),
});

const { getUiSessionTokenFromRequest, rejectWebSocketUpgrade, isRequestOriginAllowed } = requestSecurityRuntime;

const pushRuntime = createPushRuntime({
 fsPromises,
 path,
 loadWebPush: () => import('web-push').then((module) => module.default),
 PUSH_SUBSCRIPTIONS_FILE_PATH,
 readSettingsFromDiskMigrated,
 updateSettingsFromDisk: settingsRuntime.updateSettingsFromDisk,
});

const {
 getOrCreateVapidKeys,
 addOrUpdatePushSubscription,
 removePushSubscription,
 sendPushToAllUiSessions,
 isAnyUiVisible,
 isAnyInteractiveClientVisible,
 isUiVisible,
 ensurePushInitialized,
 setPushInitialized,
} = pushRuntime;

let clearPendingPushBadge = () => { };
const updateUiVisibility: typeof pushRuntime.updateUiVisibility = (token, visible, platform) => {
 if (visible === true) clearPendingPushBadge();
 return pushRuntime.updateUiVisibility(token, visible, platform);
};

const relayKeyStore = createRelayKeyStore({
 fsPromises,
 path,
 dataDir: OPENCHAMBER_DATA_DIR,
 readSettingsFromDiskMigrated,
 readSettingsStrict: readSettingsFromDiskStrict,
 updateSettingsFromDisk: settingsRuntime.updateSettingsFromDisk,
});

const apnsRuntime = createApnsRuntime({
 fsPromises,
 path,
 crypto,
 http2,
 APNS_TOKENS_FILE_PATH,
 readSettingsFromDiskMigrated,
 relayKeyStore,
});

const { addOrUpdateApnsToken, removeApnsToken, sendApnsToAllUiSessions, resolveApnsStatus } = apnsRuntime;

const TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS = 15 * 1000;

const notificationEmitterRuntime = createNotificationEmitterRuntime({
 process,
 getDesktopNotifyEnabled: () => ENV_DESKTOP_NOTIFY,
 desktopNotifyPrefix: DESKTOP_NOTIFY_PREFIX,
 getUiNotificationClients: () => uiNotificationClients,
 getOpenChamberEventClients: () => uiOpenChamberEventClients,
 getBroadcastGlobalUiEvent: () => broadcastGlobalUiEvent,
});

const { writeSseEvent, emitDesktopNotification, broadcastUiNotification } = notificationEmitterRuntime;
const broadcastGlobalUiEvent = createGlobalUiEventBroadcaster({
 sseClients: uiNotificationClients,
 wsClients: uiNotificationWsClients,
 writeSseEvent,
});

const broadcastOpenChamberUiEvent = createGlobalUiEventBroadcaster({
 sseClients: uiOpenChamberEventClients,
 wsClients: uiNotificationWsClients,
 writeSseEvent,
});

const hostSessionState = createHostSessionState({ dataDir: OPENCHAMBER_DATA_DIR });
const { sessionMetadataStore, archiveStore, sessionFoldersStore, agentScopeStore, attachmentStore } = hostSessionState;
const scheduledChatsScope = createChatsScope(OPENCHAMBER_CHATS_DIR);
let spaceArchive: ReturnType<typeof createSpaceArchive> | null = null;
const agentScopeRuntime = createHostAgentScopeRuntime({
 store: agentScopeStore,
 readSettings: readSettingsFromDiskStrict,
 sanitizeProjects,
 validateDirectoryPath,
 getWorktrees,
 managedChatsScope: scheduledChatsScope,
 getArchiveCatalog: () => spaceArchive?.listArchiveCatalog?.() ?? [],
 fsPromises,
});
const resolveHostTools = async () => {
 const settings = await readSettingsFromDiskMigrated().catch(() => null);
 return {
  openchamber: settings?.agentControlToolEnabled !== false,
  web: settings?.agentWebToolEnabled !== false,
  openchamber_knowledge: settings?.agentKnowledgeToolEnabled !== false,
  notify: settings?.agentNotifyToolEnabled === true,
  openchamber_usage: settings?.agentUsageToolEnabled === true,
  openchamber_render: settings?.agentRenderToolEnabled !== false,
  openchamber_secret: settings?.agentSecretToolEnabled !== false,
  openchamber_workflow: isWorkflowFeatureAvailable() && settings?.agentWorkflowToolEnabled !== false,
 };
};
const hostAgentRuntime = createHostAgentRuntime({
 dataDir: OPENCHAMBER_DATA_DIR,
 scopeRuntime: agentScopeRuntime,
 bunPath: process.env.OHPICHAMBER_BUN,
 entrypoint: process.env.OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT,
 validateDirectoryPath,
 resolveHostTools,
 getEnvironmentForDirectory: async (directory: string) => {
  const environment = await environmentRuntime.forDirectory(directory) ?? {};
  const settings: SettingsDocument | null = await readSettingsFromDiskMigrated().catch(() => null);
  const checker = settings?.sessionGoalChecker === 'small-model' ? 'small-model' : 'classifier';
  const parsedMaxTurns = z.number().int().safeParse(settings?.sessionGoalMaxAutoTurns);
  const maxTurns = parsedMaxTurns.success && Number.isSafeInteger(parsedMaxTurns.data)
   ? parsedMaxTurns.data
   : 20;
  return {
   ...environment,
   OPENCHAMBER_SESSION_GOAL_CHECKER: checker,
   OPENCHAMBER_SESSION_GOAL_MAX_AUTO_TURNS: String(maxTurns),
   OPENCHAMBER_PLAN_ALLOW_AGENTS: settings?.planModeAllowAgents === true ? 'true' : 'false',
  };
 },
 invokeHostAction: (scope: HostAuthorizationScope, request: HostActionRequest, signal: AbortSignal) => openChamberControlService.invokeHostAction(scope, request, signal),
});
const worktreeLeaseControl: WorktreeLeaseControl = {
 async acquire(directory, leaseId) {
  hostAgentRuntime.service.holdRestarts();
  let response;
  try {
   response = await hostAgentRuntime.service.request('/internal/worktree-leases', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ leaseId, directory }),
   });
  } catch (error) {
   throw Object.assign(
    new Error(`The Agent Service cannot release the worktree's workers: ${error instanceof Error ? error.message : String(error)}`),
    { status: 503, code: 'SERVICE_UNAVAILABLE' },
   );
  }
  if (!response.ok) {
   const rawProblem: unknown = await response.json().catch(() => null);
   const parsed = worktreeLeaseProblemSchema.safeParse(rawProblem);
   const problem = parsed.success ? parsed.data : undefined;
   const details = problem?.details;
   if (problem?.code === 'COMMAND_IN_FLIGHT' && details?.leaseId === leaseId) {
    hostAgentRuntime.service.resumeRestarts();
    throw Object.assign(
     new Error(problem.detail || 'The worktree lease id is already held'),
     { status: 409, code: problem.code, details, releaseNotNeeded: true },
    );
   }
   throw Object.assign(
    new Error(problem?.detail || 'The worktree lease was refused'),
    {
     status: problem?.status !== undefined && Number.isInteger(problem.status) ? problem.status : response.status,
     code: problem?.code,
     details,
    },
   );
  }
  const ack: JsonValue = await response.json();
  return ack;
 },
 async release(leaseId) {
  try {
   await hostAgentRuntime.service.request(`/internal/worktree-leases/${encodeURIComponent(leaseId)}`, { method: 'DELETE' });
  } catch {
   void 0;
  } finally {
   hostAgentRuntime.service.resumeRestarts();
  }
 },
};
const promptQueueStore = createPromptQueueStore({ dataDir: OPENCHAMBER_DATA_DIR });
const resolveCredential = createSelectedCredentialResolver({
 service: hostAgentRuntime.service,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
});
const resolveCredentialHandoff = createSelectedCredentialHandoff({
 service: hostAgentRuntime.service,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
});
const { resolveQuotaSelection, listQuotaSelections, resolveTtsSelection } = createCatalogCredentialSelections({
 service: hostAgentRuntime.service,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
 getQuotaProviders: () => import('./lib/quota/index.js'),
});
const readNativeReports = createNativeUsageReader({
 service: hostAgentRuntime.service,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
});
const ttsService = createTTSService({ resolveCredential });
const resolveAttachments = (...args: Parameters<typeof attachmentStore.resolveAttachments>) => attachmentStore.resolveAttachments(...args);
const importLegacyAttachment = createLegacyAttachmentImporter({
 store: attachmentStore,
 resolveWorkspaceScope: agentScopeRuntime.resolveWorkspaceScope,
 maxBytes: 20 * 1024 * 1024,
});
const listWorkspaceScopes = async () => {
 const listed = await agentScopeRuntime.listWorkspaces();
 return { items: listed.items.map(({ workspaceId }) => ({ workspaceId })), errors: listed.errors };
};
const listQueueScopes = async () => {
 const stored = await promptQueueStore.list();
 const items: { sessionId: string; projectId: string; workspaceId: string }[] = [];
 const errors: { code: string }[] = [...stored.errors];
 for (const entry of stored.items) {
  try {
   const scope = await hostAgentRuntime.resolveHostSessionScope(entry.scope.sessionId);
   if (!scope || scope.projectId !== entry.scope.projectId || scope.workspaceId !== entry.scope.workspaceId) {
    errors.push({ code: 'SESSION_NOT_FOUND' });
    continue;
   }
   items.push({ sessionId: scope.sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId });
  } catch (error) {
   errors.push({ code: errorDetailsSchema.safeParse(error).data?.code ?? 'METADATA_READ_FAILED' });
  }
 }
 return { items, errors };
};

const readStoredSessionMetadata = (sessionID: string) => sessionMetadataStore.get(sessionID);

const persistSessionMetadataPatch = async (
 sessionID: string,
 patch: Parameters<typeof sessionMetadataStore.setSessionMetadata>[1],
 { directory: _directory = '' } = {},
) => {
 const result = await sessionMetadataStore.setSessionMetadata(sessionID, patch);
 if (result.changed) {
  broadcastOpenChamberUiEvent({
   type: 'openchamber:session-metadata',
   properties: { sessionId: sessionID, sessionID, metadata: result.metadata, revision: result.revision },
  });
 }
 return result;
};

const updateSessionMetadataWith = async (
 sessionID: string,
 decide: Parameters<typeof sessionMetadataStore.updateSessionMetadata>[1],
 { directory: _directory = '' } = {},
) => {
 const result = await sessionMetadataStore.updateSessionMetadata(sessionID, decide);
 if (result.changed) {
  broadcastOpenChamberUiEvent({
   type: 'openchamber:session-metadata',
   properties: { sessionId: sessionID, sessionID, metadata: result.metadata, revision: result.revision },
  });
 }
 return result;
};
const sessionWorktreeMoveBridge = createUnregisteredSessionWorktreeMoveBridge();
const openChamberSessionService = createOpenChamberSessionService({
 service: hostAgentRuntime.service,
 worktreeMove: {
  get createWorktree() { return sessionWorktreeMoveBridge.createWorktree ?? undefined; },
  get removeWorktree() { return sessionWorktreeMoveBridge.removeWorktree ?? undefined; },
  get hydrateCheckout() { return sessionWorktreeMoveBridge.hydrateCheckout ?? undefined; },
  get waitForWorktreeReady() { return sessionWorktreeMoveBridge.waitForWorktreeReady ?? undefined; },
  get bootstrapStore() { return sessionWorktreeMoveBridge.bootstrapStore ?? undefined; },
  get stashPush() { return sessionWorktreeMoveBridge.stashPush ?? undefined; },
  get getPathsWithoutChanges() { return sessionWorktreeMoveBridge.getPathsWithoutChanges ?? undefined; },
  get stashApply() { return sessionWorktreeMoveBridge.stashApply ?? undefined; },
  get stashDrop() { return sessionWorktreeMoveBridge.stashDrop ?? undefined; },
  get listStashes() { return sessionWorktreeMoveBridge.listStashes ?? undefined; },
  get getBranches() { return sessionWorktreeMoveBridge.getBranches ?? undefined; },
  get resolvePrimaryWorktreeRoot() { return sessionWorktreeMoveBridge.resolvePrimaryWorktreeRoot ?? undefined; },
  warn: (message, error) => console.warn(message, error instanceof Error ? error.message : String(error)),
 },
 readSettings: readSettingsFromDiskMigrated,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
 resolveWorkspaceDirectory: agentScopeRuntime.resolveWorkspaceDirectory,
 resolveHostWorkspaceScope: agentScopeRuntime.resolveWorkspaceScope,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 resolveHostSessionScope: hostAgentRuntime.resolveHostSessionScope,
 resolveHostRelocationScope: hostAgentRuntime.resolveHostRelocationScope,
 resolveWorktreeTopLevel,
 validateWorktreeDirectory: (directory, worktreeRoot) => validateWorktreeDirectory(directory, worktreeRoot),
 resolveProjectDirectory: async (directory) => {
  const resolved = await agentScopeRuntime.resolveWorkspaceDirectory(directory);
  return resolved ? { projectId: resolved.projectId } : null;
 },
 worktreeSetupOf: (setup, directory) => worktreeSetupOf(setup, directory),
 agentScopeStore,
 listWorkspaceScopes,
 registerSessionScope: async (session) => Boolean(await agentScopeRuntime.registerSessionScope(session)),
 resolveAttachments,
 capturePrompt: (...args: Parameters<typeof hostPromptDeliveryRuntime.capturePrompt>) => hostPromptDeliveryRuntime.capturePrompt(...args),
 beforeDispatch: (scope, capture) => hostPromptDeliveryRuntime.beforeDispatch(scope, capture.request),
 onPromptAccepted: async (scope, capture, receipt) => {
  const result = await hostPromptDeliveryRuntime.onPromptAccepted(scope, capture.request, receipt);
  try {
   if (globalMessageStreamHub.retainSession) {
    await globalMessageStreamHub.retainSession(scope.sessionId, 'run');
   } else {
    await globalMessageStreamHub.subscribeSession(scope.sessionId);
   }
  } catch (error) {
   console.warn('[agent-events] session observation failed:', errorDetailsSchema.safeParse(error).data?.code ?? 'SERVICE_UNAVAILABLE');
  }
  return result;
 },
 publishSessionEvent: (event) => {
  const sessionId = event?.properties?.sessionId;
  if (isString(sessionId)) {
   if (globalMessageStreamHub.retainSession) {
    void globalMessageStreamHub.retainSession(sessionId, 'session-created')
     .then((lease) => lease?.release?.())
     .catch((error) => console.warn('[agent-events] session observation failed:', errorDetailsSchema.safeParse(error).data?.code ?? 'SERVICE_UNAVAILABLE'));
   } else {
    void globalMessageStreamHub.subscribeSession(sessionId)
     .catch((error) => console.warn('[agent-events] session observation failed:', errorDetailsSchema.safeParse(error).data?.code ?? 'SERVICE_UNAVAILABLE'));
   }
   if (event?.type === 'openchamber:session-created') {
    void permissionAutoAcceptRuntime?.applyDefaultMode(sessionId)
     .catch((error) => console.warn('[permission-auto-accept] failed to apply the default mode:', error instanceof Error ? error.message : String(error)));
   }
  }
 },
 sessionMetadataStore,
 directCommandAdmissionStore: hostSessionState.directCommandAdmissionStore,
 archiveStore,
 persistSessionMetadata: persistSessionMetadataPatch,
 updateSessionMetadata: updateSessionMetadataWith,
 broadcastGlobalUiEvent: broadcastOpenChamberUiEvent,
 onArchiveDeleted: async (scope, ack) => {
  await agentScopeStore.removeSessionFamily(scope.rootSessionId);
  spaceArchive?.forgetChat(ack.sessionId);
  void globalMessageStreamHub.unsubscribeSession(ack.sessionId).catch(() => { });
 },
});

const sessionRuntime = createSessionRuntime({
 broadcastEvent: broadcastGlobalUiEvent,
});

const movedUserDirs = await migrateLegacyUserDirs({
 fsPromises,
 path,
 dataDir: OPENCHAMBER_USER_CONFIG_ROOT,
 legacyRoot: OPENCHAMBER_DEFAULT_CONFIG_ROOT,
 warn: (message) => console.warn(`[data-dir] ${message}`),
});
if (movedUserDirs.length > 0) {
 console.log(`[data-dir] Copied ${movedUserDirs.join(', ')} into ${OPENCHAMBER_USER_CONFIG_ROOT}`);
}

const projectConfigRuntime = createProjectConfigRuntime({
 fsPromises,
 path,
 projectsDirPath: OPENCHAMBER_PROJECTS_CONFIG_DIR,
 switchNotesTodosStorage: (...args: Parameters<typeof projectContextRuntime.switchNotesTodosStorage>) => projectContextRuntime.switchNotesTodosStorage(...args),
});
configureProjectWorktreeDirectory((projectConfigId) => projectConfigRuntime.readWorktreeDirectory(projectConfigId));

const projectContextRuntime = createProjectContextRuntime({
 fsPromises,
 path,
 projectsDirPath: OPENCHAMBER_PROJECTS_CONFIG_DIR,
 resolveSharedPlansDir: (projectId) => projectConfigRuntime.resolveSharedPlansDir(projectId),
 resolveNotesTodosFile: (projectId) => projectConfigRuntime.resolveNotesTodosFile(projectId),
 onChanged: (projectId) => broadcastOpenChamberUiEvent({
  type: 'openchamber:project-context-changed',
  properties: { projectId },
 }),
});




const ENV_DESKTOP_NOTIFY = (() => {
 if (process.env.OPENCHAMBER_DESKTOP_NOTIFY === 'true') {
  return true;
 }

 if (process.env.OPENCHAMBER_RUNTIME === 'desktop') {
  return true;
 }

 const argv0 = isString(process.argv?.[0]) ? process.argv[0] : '';
 const argv1 = isString(process.argv?.[1]) ? process.argv[1] : '';
 return /openchamber-server/i.test(argv0) || /openchamber-server/i.test(argv1);
})();
configureAgentService(hostAgentRuntime.service, {
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
});



const notificationTemplateRuntime = createNotificationTemplateRuntime({
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 readSettingsFromDisk,
});
const {
 resolveNotificationTemplate,
 shouldApplyResolvedTemplateMessage,
 fetchLastAssistantMessageText,
 buildTemplateVariables,
} = notificationTemplateRuntime;
const notificationChannelHandles = createOutboundHandles();
setHostCallbackRoute(NOTIFICATIONS_OUTBOUND_PATH, {
 refusal: notificationChannelHandles.refusal,
 serve: notificationChannelHandles.serve,
});
const extensionNotificationChannels = createExtensionNotificationChannels({
 listGuests: () => listInstalledGuests({ persistPath: extensionsPersistPath(OPENCHAMBER_DATA_DIR) }),
 proxyServiceRequest: proxyGuestServiceRequest,
 persistPath: extensionsPersistPath(OPENCHAMBER_DATA_DIR),
 accounts: createNotificationChannelAccounts({ persistPath: notificationChannelsPersistPath(OPENCHAMBER_DATA_DIR) }),
 handles: notificationChannelHandles,
 isAnyUiVisible,
});

let autoReviewRuntime: ReturnType<typeof createAutoReviewRuntime> | null = null;
let prWatchRuntime: ReturnType<typeof createPrWatchRuntime> | null = null;
const notificationTriggerRuntime = createNotificationTriggerRuntime({
 openPushTagsStore: createPushTagsStore(path.join(OPENCHAMBER_DATA_DIR, 'push-tags.json')),
 clearApnsNotifications: apnsRuntime.clearApnsNotifications,
 isAnyUiVisible,
 readSettingsFromDisk,
 prepareNotificationLastMessage,
 buildTemplateVariables,
 fetchLastAssistantMessageText,
 resolveNotificationTemplate,
 shouldApplyResolvedTemplateMessage,
 emitDesktopNotification,
 broadcastUiNotification,
 sendPushToAllUiSessions,
 sendApnsToAllUiSessions,
 isAnyInteractiveClientVisible,
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 deliverToExtensionChannels: (delivery) => extensionNotificationChannels.deliver(delivery),
});

clearPendingPushBadge = () => notificationTriggerRuntime.clearPendingPushBadge();

const sessionLineage = createSessionLineage();

const sessionAssistRuntime = createSessionAssistRuntime({
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 lineage: sessionLineage,
 onTurnSettled: (sessionId) => {
  void globalMessageStreamHub.releaseSession(sessionId, 'run');
 },
});
const sessionKnowledgeRuntime = createSessionKnowledgeRuntime({
 projectContextRuntime,
 resolveProjectId: (directory) => resolveProjectContextId(directory),
 readSessionMetadata: readStoredSessionMetadata,
 persistSessionMetadata: async (sessionID, directory, patch) => { await persistSessionMetadataPatch(sessionID, patch, { directory }); },
});

const contextObligatoryRuntime = createContextObligatoryRuntime({
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 sessionKnowledgeRuntime,
 readSessionMetadata: readStoredSessionMetadata,
 persistContextCursor: async (sessionID, directory, patch) => { await persistSessionMetadataPatch(sessionID, patch, { directory }); },
});
const linearSessionStatusRuntime = createLinearSessionStatusRuntime();

const globalMessageStreamHub = createGlobalMessageStreamHub({
 service: hostAgentRuntime.service,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
});

const chatDirectoryCleanupRuntime = createChatDirectoryCleanupRuntime({
 roots: [OPENCHAMBER_CHATS_DIR, path.join(OPENCHAMBER_DEFAULT_CONFIG_ROOT, 'chats')],
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 getOwner: () => isShuttingDown ? null : hostAgentRuntime,
 eventHub: globalMessageStreamHub,
});

autoReviewRuntime = createAutoReviewRuntime({
 globalEventHub: globalMessageStreamHub,
 sessionService: openChamberSessionService,
 broadcastUiEvent: broadcastOpenChamberUiEvent,
 onRunEnded: (ended) => notificationTriggerRuntime.notifyAutoReviewEnded(ended),
 dataDir: OPENCHAMBER_DATA_DIR,
});
autoReviewRuntime.start();

prWatchRuntime = createPrWatchRuntime({
 sessionService: openChamberSessionService,
 broadcastUiEvent: broadcastOpenChamberUiEvent,
 dataDir: OPENCHAMBER_DATA_DIR,
 readCleanupOnMerge: async () => (await readSettingsFromDiskMigrated())?.mergedWorktreeCleanupEnabled === true,
 isSessionArchived: (sessionID) => archiveStore.isArchived(sessionID),
 insideSpace: Boolean(process.env.OPENCHAMBER_SPACE_IDLE_STOP_FILE),
});
prWatchRuntime.start(globalMessageStreamHub);
const extensionWaitsRuntime = createExtensionWaitsRuntime({
 sessionService: openChamberSessionService,
 listGuests: () => listInstalledGuests({ persistPath: extensionsPersistPath(OPENCHAMBER_DATA_DIR) }),
 proxyServiceRequest: proxyGuestServiceRequest,
 persistPath: extensionsPersistPath(OPENCHAMBER_DATA_DIR),
 dataDir: OPENCHAMBER_DATA_DIR,
 broadcastUiEvent: broadcastOpenChamberUiEvent,
 isSessionArchived: (sessionID) => archiveStore.isArchived(sessionID),
 insideSpace: Boolean(process.env.OPENCHAMBER_SPACE_IDLE_STOP_FILE),
});
extensionWaitsRuntime.start(globalMessageStreamHub);
const postSyntheticToSession = createSyntheticDelivery({ sessionService: openChamberSessionService });
const laterPagesRuntime = createLaterPages({
 dataDir: OPENCHAMBER_DATA_DIR,
 postSynthetic: postSyntheticToSession,
 broadcastUiEvent: broadcastOpenChamberUiEvent,
 readArchiveState: async (sessionID) => (await archiveStore.isArchived(sessionID) ? 'archived' : 'active'),
});
laterPagesRuntime.start(globalMessageStreamHub);
const sharePagesRuntime = createSharePagesRuntime({
 crypto,
 store: createSharePageStore({ fsPromises, path, dataDir: OPENCHAMBER_DATA_DIR }),
 relay: createShareRelayClient({ getSigner: createRelayShareSigner({ crypto, relayKeyStore }) }),
 postSynthetic: postSyntheticToSession,
 onAnswerDelivered: (answer) => notificationTriggerRuntime.notifyShareAnswer(answer),
 broadcast: (event) => broadcastOpenChamberUiEvent(event),
 isAvailable: isSharingAvailable,
 isRelayBaseAllowed,
 resolveRelayBase: async () => resolveShareRelayBase(await readSettingsFromDiskMigrated().catch(() => null)),
});
void sharePagesRuntime.start().catch((error) => {
 console.warn('[share-pages] failed to start:', error instanceof Error ? error.message : String(error));
});
globalMessageStreamHub.subscribeStatus((status) => {
 if (status?.type === 'connect') void sharePagesRuntime.poll();
});
const receivedPagesRuntime = createReceivedPagesRuntime({
 crypto,
 store: createReceivedPageStore({ fsPromises, path, dataDir: OPENCHAMBER_DATA_DIR }),
 relay: createShareViewerClient(),
 isAvailable: isSharingAvailable,
 isEnterpriseMode: () => isEnterpriseMode(),
 allowedBases: async () => allowedReceiveBases(await readSettingsFromDiskMigrated().catch(() => null)),
 broadcast: (event) => broadcastOpenChamberUiEvent(event),
});
const routingRuntime = createRoutingRuntime({
 dataDir: OPENCHAMBER_DATA_DIR,
 service: hostAgentRuntime.service,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 resolveCredential,
 broadcastGlobalUiEvent: broadcastOpenChamberUiEvent,
});

const permissionAutoAcceptRuntime = createPermissionAutoAcceptRuntime({
 readSettingsFromDiskMigrated,
 persistSettings,
 broadcastGlobalUiEvent: broadcastOpenChamberUiEvent,
 evaluatePermission: (permission, directory) => routingRuntime.evaluatePermission(permission, directory),
 resolveLegacyEnabledMode: async () => ((await routingRuntime.legacySafetyNetEnabled()) ? 'safety' : 'auto'),
 resolveSessionParent: async (sessionId) => {
  try {
   const response = await hostAgentRuntime.service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`);
   if (!response.ok) return undefined;
   const parsed = RuntimeSessionSchema.safeParse(await response.json());
   if (!parsed.success) return undefined;
   const runtime = parsed.data;
   const parent = runtime.parentSessionId;
   return isString(parent) && parent && parent !== sessionId ? parent : null;
  } catch { return undefined; }
 },
 onSessionPolicyChanged: async (sessionId, mode) => {
  try {
   await hostAgentRuntime.service.request(`/internal/sessions/${encodeURIComponent(sessionId)}/permission-mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
   });
  } catch (error) {
   console.warn('[permission-auto-accept] mode push failed:', error instanceof Error ? error.message : String(error));
  }
 },
});

registerHostPermissionRuntime(permissionAutoAcceptRuntime);

notificationTriggerRuntime.setGetIsSessionAutoAccepting(
 (sessionId, scope, approvalId) => permissionAutoAcceptRuntime.isPermissionAutoAnswered(sessionId, approvalId, scope?.cwd),
);
const sessionWorkRuntime = createSessionWorkRuntime({
 activityProbe: createCanonicalActivityProbe({ service: hostAgentRuntime.service }),
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 classifierEndpoint: (workspaceId) => routingRuntime.classifierEndpoint(workspaceId),
 jev: createJevClient(),
 readMetadata: (sessionID) => sessionMetadataStore.get(sessionID),
 updateMetadata: updateSessionMetadataWith,
 isSessionArchived: (sessionID) => archiveStore.isArchived(sessionID),
 isWorktreePinned: isWorktreeDirectoryPinned,
 chatRoots: [path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'chats'), OPENCHAMBER_CHATS_DIR],
 lineage: sessionLineage,
});

const messageQueueRuntime = createCanonicalQueueRuntime({
 store: promptQueueStore,
 service: hostAgentRuntime.service,
 ensureSessionObserved: async (scope) => globalMessageStreamHub.subscribeSession(scope.sessionId),
 resolveAttachments: (scope, attachments) => resolveAttachments({
  projectId: scope.projectId,
  workspaceId: scope.workspaceId,
  agentDirectoryId: scope.agentDirectoryId ?? '',
 }, attachments),
 capturePrompt: (scope, request) => hostPromptDeliveryRuntime.capturePrompt({ sessionId: scope.sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId, cwd: scope.cwd ?? '' }, request),
 beforeDispatch: (scope, capture) => hostPromptDeliveryRuntime.beforeDispatch({ sessionId: scope.sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId, cwd: scope.cwd ?? '' }, capture.request),
 onPromptAccepted: (scope, capture) => hostPromptDeliveryRuntime.onPromptAccepted({ sessionId: scope.sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId, cwd: scope.cwd ?? '' }, capture.request, { runId: capture.runId }),
 onScheduledTaskResult: async (...args: Parameters<typeof scheduledTasksRuntime.onScheduledTaskResult>) => { await scheduledTasksRuntime.onScheduledTaskResult(...args); },
 publishQueue: (properties: { sessionId: string; queue: JsonValue }) => broadcastOpenChamberUiEvent({ type: 'openchamber:message-queue.updated', properties }),
 reportFailure: ({ sessionId, code }: { sessionId?: string; code: string }) => {
  const properties: QueueFailureProperties = { code };
  if (sessionId) properties.sessionId = sessionId;
  broadcastOpenChamberUiEvent({ type: 'openchamber:message-queue.failed', properties });
 },
});

const dispatchResultsRuntime = createDispatchResultsRuntime({
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 dataDir: OPENCHAMBER_DATA_DIR,
 isSessionArchived: (sessionID) => archiveStore.isArchived(sessionID),
});
dispatchResultsRuntime.start();

const workflowsModule = createWorkflowsModule({
 sessionService: openChamberSessionService,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
 listWorkspaceScopes,
 dataDir: OPENCHAMBER_DATA_DIR,
 fsPromises,
 path,
 broadcast: (event) => broadcastOpenChamberUiEvent(event),
});

const messageSearchRuntime = createMessageSearchRuntime({
 dataDir: OPENCHAMBER_DATA_DIR,
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 readArchiveStates: async () => {
  const listed = await archiveStore.listAll();
  const entries: Record<string, { archivedAt: number | null }> = {};
  for (const [id, state] of Object.entries(listed.entries)) {
   if (state) entries[id] = { archivedAt: state.archivedAt };
  }
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(listed.errors ?? {})) {
   errors[key] = String(value);
  }
  const snapshot: ArchiveSnapshot = {
   entries,
   errors,
  };
  if (listed.conversion.code !== undefined) snapshot.conversion = { code: listed.conversion.code };
  return snapshot;
 },
 globalEventHub: globalMessageStreamHub,
 readSettings: async () => {
  const settings = await readSettingsFromDisk();
  return { enabled: settings.messageSearchEnabled !== false, reasoning: settings.messageSearchReasoningEnabled === true };
 },
});


const turnDurationRuntime = createTurnDurationRecorder({
 persistSessionMetadataPatch,
 isChildSession: (sessionID) => sessionLineage.isChild(sessionID),
});

globalMessageStreamHub.subscribeSnapshot((snapshot, scope) => {
 sessionRuntime.applySnapshot(snapshot, scope);
});
globalMessageStreamHub.subscribeEvent(async (event, scope) => {
 if (event.type === 'session.deleted') {
  for (const id of event.deletedSessionIds ?? []) {
   void globalMessageStreamHub.unsubscribeSession(id).catch(() => { });
  }
 }
 sessionRuntime.processCanonicalEvent(event, scope);
 await messageQueueRuntime.observe({ ...scope, sessionId: event.sessionId }, event);
 sessionLineage.observe(event);
 if (event.type === 'session.updated' && event.session) permissionAutoAcceptRuntime.observeSession(event.session);
 turnDurationRuntime.processCanonicalEvent(event, scope);
 const eventSessionId = scope.sessionId ?? event.sessionId;
 const eventScope = eventSessionId ? { ...scope, sessionId: eventSessionId } : undefined;
 sessionAssistRuntime.processCanonicalEvent(event, eventScope);
 sessionWorkRuntime.processCanonicalEvent(event, eventScope);
 contextObligatoryRuntime.processCanonicalEvent(event, eventScope);
 linearSessionStatusRuntime.processCanonicalEvent(event);
 await dispatchResultsRuntime.processCanonicalEvent(event, eventScope);
 await notificationTriggerRuntime.processCanonicalEvent(event, scope);
});



const serverUtilsRuntime = createServerUtilsRuntime({
 os,
 path,
 process,
});


const environmentStore = createEnvironmentStore({
 filePath: path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'environment.json'),
});
const listConfiguredProjects = async () => {
 const settings = await readSettingsFromDiskMigrated();
 return sanitizeProjects(settings?.projects || []) ?? [];
};
const environmentRuntime = createEnvironmentRuntime({
 store: environmentStore,
 listProjects: listConfiguredProjects,
 spawn,
 commandBaseEnv: () => ({ ...process.env, PATH: serverUtilsRuntime.buildAugmentedPath() }),
 isEnterpriseMode: () => isEnterpriseMode(),
});
configureGitEnvironment(environmentRuntime);
const staticRoutesRuntime = createStaticRoutesRuntime({
 fs,
 path,
 process,
 express,
 resolveProjectDirectory,
 listSessions: (directory) => listPwaSessions({
  directory,
  listWorkspaces: () => agentScopeStore.listWorkspaces(),
  listSessions: openChamberSessionService.list,
 }),
 readSettingsFromDiskMigrated,
 normalizePwaAppName,
 normalizePwaOrientation,
 isRequestAuthorized: (req, res) => isRequestAuthorized(req, res, { tunnelAuthController, uiAuthController }),
});
const remoteClientAuthRuntime = createRemoteClientAuthRuntime({
 fsPromises,
 path,
 crypto,
 storePath: REMOTE_CLIENTS_FILE_PATH,
});
const clientPairingRuntime = createClientPairingRuntime({
 fsPromises,
 path,
 crypto,
 storePath: CLIENT_PAIRING_SESSIONS_FILE_PATH,
 remoteClientAuthRuntime,
});
const clientPushAccess = createClientPushAccess({
 listClients: remoteClientAuthRuntime.listClients,
 removeDevicesOfSessions: [apnsRuntime.removeApnsDevicesOfSessions, pushRuntime.removePushDevicesOfSessions],
 authenticateBearerClient: async (req) => (await remoteClientAuthRuntime.authenticateBearerToken(getBearerTokenFromRequest(req), req))?.client ?? null,
});
const featureRoutesRuntime = createFeatureRoutesRuntime();
const bootstrapRuntime = createBootstrapRuntime({
 createUiAuth,
 registerServerStatusRoutes,
 registerCommonRequestMiddleware,
 registerAuthAndAccessRoutes,
 registerTtsRoutes,
 registerNotificationRoutes,
 registerOpenChamberRoutes,
 express,
});
const tunnelProviderRegistry = createTunnelProviderRegistry([
 createCloudflareTunnelProvider(),
 createNgrokTunnelProvider(),
 createTailscaleTunnelProvider(),
]);
const tunnelAuthController = createTunnelAuth();
const tunnelWiringRuntime = createTunnelWiringRuntime({
 crypto,
 URL,
 tunnelProviderRegistry,
 tunnelAuthController,
 readSettingsFromDiskMigrated,
 readManagedRemoteTunnelConfigFromDisk,
 normalizeTunnelProvider,
 normalizeTunnelMode,
 normalizeOptionalPath,
 normalizeManagedRemoteTunnelHostname,
 normalizeTunnelBootstrapTtlMs,
 normalizeTunnelSessionTtlMs,
 isSupportedTunnelMode,
 upsertManagedRemoteTunnelToken,
 resolveManagedRemoteTunnelToken,
 TUNNEL_MODE_MANAGED_REMOTE,
 TUNNEL_PROVIDER_CLOUDFLARE,
 TunnelServiceError,
 getActiveTunnelController: () => activeTunnelController,
 setActiveTunnelController: (value) => {
  activeTunnelController = value;
 },
 getRuntimeManagedRemoteTunnelHostname: () => runtimeManagedRemoteTunnelHostname ?? undefined,
 setRuntimeManagedRemoteTunnelHostname: (value) => {
  runtimeManagedRemoteTunnelHostname = value ?? null;
 },
 getRuntimeManagedRemoteTunnelToken: () => runtimeManagedRemoteTunnelToken,
 setRuntimeManagedRemoteTunnelToken: (value) => {
  runtimeManagedRemoteTunnelToken = value;
 },
});
const startupPipelineRuntime = createStartupPipelineRuntime({
 createTerminalRuntime,
 createDictationRuntime,
 createMessageStreamWsRuntime,
 createServerStartupRuntime,
});

const scheduledWorktreeBridge = createUnregisteredScheduledWorktreeBridge();
const scheduledTasksRuntime = createScheduledTasksRuntime({
 projectConfigRuntime,
 chatsScope: scheduledChatsScope,
 sessionService: openChamberSessionService,
 service: hostAgentRuntime.service,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 listWorkspaceScopes,
 createChatWorkspace: agentScopeRuntime.createChatWorkspace,
 messageQueueRuntime,
 isSessionArchived: (sessionID) => archiveStore.isArchived(sessionID),
 createTaskWorktree: (input) => {
  const create = scheduledWorktreeBridge.create;
  if (!create) {
   return Promise.reject(new Error('worktree creation is unavailable'));
  }
  return create(input);
 },
 removeTaskWorktree: (input) => scheduledWorktreeBridge.remove(input),
 isGitRepository: (projectDirectory) => scheduledWorktreeBridge.isGitRepository(projectDirectory),
 readSessionDefaults: async (projectID) => {
  const settings = await readSettingsFromDiskMigrated();
  const project = (sanitizeProjects(settings?.projects || []) ?? []).find((entry) => entry.id === projectID) ?? null;
  return resolveSessionDefaults({ settings, project });
 },
 readDefaultGoalTokenBudget: async () => {
  const settings = await readSettingsFromDiskMigrated();
  const parsedBudget = z.number().finite().safeParse(settings?.sessionGoalDefaultBudget);
  return settings?.sessionGoalDefaultBudgetEnabled === true && parsedBudget.success ? parsedBudget.data : null;
 },
 listProjects: async () => {
  const settings = await readSettingsFromDiskMigrated();
  return sanitizeProjects(settings?.projects || []) ?? [];
 },
 setSessionAutoAccept: async (sessionId, enabled, directory) => {
  await permissionAutoAcceptRuntime.setSessionPolicy(sessionId, enabled ? 'auto' : 'ask', directory);
 },
 emitTaskRunEvent: (event) => {
  const properties: ScheduledTaskRanProperties = {
   projectId: scheduledChatsScope.toPublicID(event.projectID),
   taskId: event.taskID,
   ranAt: event.ranAt,
   status: event.status,
  };
  if (event.sessionID) {
   properties.sessionId = event.sessionID;
  }
  for (const client of uiOpenChamberEventClients) {
   try {
    writeSseEvent(client, {
     type: 'openchamber:scheduled-task-ran',
     properties,
    });
   } catch {
    uiOpenChamberEventClients.delete(client);
   }
  }
 },
 logger: console,
});
const hostPromptDeliveryRuntime = createHostPromptDeliveryRuntime({
 resolveSessionScope: hostAgentRuntime.resolveHostSessionScope,
 routingRuntime,
 sessionKnowledgeRuntime,
 scheduledTasksRuntime,
 sessionRuntime,
 behaviorPromptSource: createBehaviorPromptSource({
  fsModule: fs,
  pathModule: path,
  settingsFilePath: SETTINGS_FILE_PATH,
  readMergedSettings: readMergedSettingsSync,
 }),
});
const convertLegacyQueue = async () => {
 const result = await promptQueueStore.convertLegacy({
  resolveScope: async (sessionId: string, directory: string) => {
   const scope = await hostAgentRuntime.resolveHostSessionScope(sessionId);
   if (!scope || await fsPromises.realpath(directory) !== scope.cwd) {
    throw new OpenChamberControlError('Legacy queue session scope is unavailable', 404);
   }
   return { sessionId: scope.sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId };
  },
  importAttachment: importLegacyAttachment,
  resolveScheduledTask: async (queuedScope: { sessionId: string; projectId: string; workspaceId: string }, hint: { projectId: string; taskId: string }) => {
   const scope = await hostAgentRuntime.resolveHostSessionScope(queuedScope.sessionId);
   if (!scope || scope.projectId !== queuedScope.projectId || scope.workspaceId !== queuedScope.workspaceId || scope.hostProjectId !== hint.projectId) {
    throw new OpenChamberControlError('Legacy scheduled queue scope does not match', 409);
   }
   const task = (await projectConfigRuntime.listScheduledTasks(scope.hostProjectId)).find((entry) => entry.id === hint.taskId);
   if (!task || task.targetSessionId !== scope.sessionId) {
    throw new OpenChamberControlError('Legacy scheduled queue target is unavailable', 409);
   }
   await scheduledTasksRuntime.validateTarget(scope.hostProjectId, scope.sessionId);
   const options = resolveScheduledTaskOptions(task.execution);
   return {
    options,
    context: [createScheduledTaskContext({
     projectId: scope.hostProjectId, taskId: task.id, sessionId: scope.sessionId,
     workspaceId: scope.workspaceId, mode: 'existing', triggeredAt: task.state?.lastRunAt ?? Date.now()
    })],
   };
  },
 });
 if (result.status === 'partial' || result.status === 'failed') {
  console.warn('[message-queue] legacy conversion incomplete:', result.status, result.storage ?? 'conversion_failed', result.errors.length);
 }
};
const scheduledTaskService = createScheduledTaskService({
 readSettingsFromDiskMigrated,
 sanitizeProjects: (projects) => sanitizeProjects(projects) ?? [],
 projectConfigRuntime,
 scheduledTasksRuntime,
 resolveWorkspaceScope: agentScopeRuntime.resolveWorkspaceScope,
 chatsScope: scheduledChatsScope,
});
const browserClientEvents = createBrowserClientEvents({ clients: uiOpenChamberEventClients, writeEvent: (client, event) => writeSseEvent(client, event) });
const browserControlBroker = createBrowserControlBroker({
 createId: () => `browser-${crypto.randomUUID()}`,
 emitRequest: browserClientEvents.emitRequest,
});

const emitBrowserProviderResetEvent = ({ guestId, guestName }: { guestId: string; guestName: string }) => {
 for (const client of uiOpenChamberEventClients) {
  try {
   writeSseEvent(client, {
    type: 'openchamber:browser-provider-reset',
    properties: { guestId, guestName },
   });
  } catch {
   uiOpenChamberEventClients.delete(client);
  }
 }
};
const browserControlRouter = createBrowserControlRouter({
 broker: browserControlBroker,
 readSettings: () => readSettingsFromDiskMigrated(),
 persistSettings: (changes) => persistSettings(changes),
 findGuest: (id) => findInstalledGuest(id, extensionsPersistPath(OPENCHAMBER_DATA_DIR)),
 persistPath: extensionsPersistPath(OPENCHAMBER_DATA_DIR),
 emitProviderReset: emitBrowserProviderResetEvent,
 createId: () => `browser-${crypto.randomUUID()}`,
 surfaceControl: {
  userControls: (guestId) => guestSurfaceRuntime?.userControls(guestId) ?? false,
  noteAgentActivity: (guestId) => guestSurfaceRuntime?.noteAgentActivity(guestId),
 },
});

const fileOpenRequester = createFileOpenRequester({
 emit: (request) => {
  let delivered = 0;
  for (const client of uiOpenChamberEventClients) {
   try {
    writeSseEvent(client, { type: 'openchamber:file-open-request', properties: request });
    delivered += 1;
   } catch {
    uiOpenChamberEventClients.delete(client);
   }
  }
  return delivered;
 },
});

const pluginNotificationEmitter = createPluginNotificationEmitter({
 readSettingsFromDiskMigrated,
 emitDesktopNotification,
 broadcastUiNotification,
});

const browserUploads = createUploadStore();
const openChamberControlService = createOpenChamberControlService({
 updateSessionMetadata: updateSessionMetadataWith,
 isWorktreePinned: isWorktreeDirectoryPinned,
 chatRoots: [path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'chats'), OPENCHAMBER_CHATS_DIR],
 loadQuota: createSelectedUsageQuota({ loadQuota: () => import('./lib/quota/index.js'), listQuotaSelections, resolveQuotaSelection, resolveCredential, readNativeReports }),
 readSettingsFromDiskMigrated,
 service: hostAgentRuntime.service,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 listWorkspaceScopes,
 listProjects: agentScopeRuntime.listProjects,
 sessionService: openChamberSessionService,
 scheduledTaskService,
 browserControl: browserControlRouter,
 browserUploads,
 getTerminalRuntime: () => terminalRuntime,
 fileOpen: fileOpenRequester,
 notifyUser: async (input) => {
  const settings = await readSettingsFromDiskMigrated().catch(() => null);
  if (settings?.agentNotifyToolEnabled !== true) {
   return { status: 403, body: { error: 'The notify tool is turned off in OhPiChamber settings' } };
  }
  return pluginNotificationEmitter.emit(input);
 },
 projectContextRuntime,
 resolveProjectContextId,
 isKnowledgeToolEnabled: async () => {
  const settings = await readSettingsFromDiskMigrated().catch(() => null);
  return settings?.agentKnowledgeToolEnabled !== false;
 },
 showPlan: (request) => {
  let delivered = 0;
  for (const client of uiOpenChamberEventClients) {
   try {
    writeSseEvent(client, { type: 'openchamber:plan-open-request', properties: request });
    delivered += 1;
   } catch {
    uiOpenChamberEventClients.delete(client);
   }
  }
  return delivered;
 },
 sessionLinks: createSessionLinker({
  updateMetadata: updateSessionMetadataWith,
  createError: (message, status) => new OpenChamberControlError(message, status),
 }),
 isSecretToolEnabled: async () => (await readSettingsFromDiskMigrated())?.agentSecretToolEnabled !== false,
 hasUnreadChat: async (sessionId) => {
  const scope = await hostAgentRuntime.resolveSessionScope(sessionId);
  if (!scope) throw new OpenChamberControlError('Session scope is unavailable', 404);
  const queue = await promptQueueStore.getState({ sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId });
  return queue.items.length > 0;
 },
 dispatchResults: dispatchResultsRuntime,
 prWatch: prWatchRuntime,
 extensionWaits: extensionWaitsRuntime,
 laterPages: process.env.OPENCHAMBER_SPACE_IDLE_STOP_FILE ? null : laterPagesRuntime,
 sharePages: sharePagesRuntime,
 archiveStore,
 workflowRuntime: workflowsModule.workflowRuntime,
});

const guestServiceHost = registerGuestServiceHost({
 dataDir: OPENCHAMBER_DATA_DIR,
 listGuests: () => listInstalledGuests({ persistPath: extensionsPersistPath(OPENCHAMBER_DATA_DIR) }),
 control: openChamberControlService,
 sessions: openChamberSessionService,
 request: (pathname, init) => hostAgentRuntime.service.request(pathname, init),
 broadcast: broadcastOpenChamberUiEvent,
});

const ensureGlobalWatcherStarted = async () => {
 if (hostAgentRuntime.service.getState().phase !== 'ready') return;
 await globalMessageStreamHub.start();
 const listed = await openChamberSessionService.list();
 if (Object.keys(listed.errors).length > 0) {
  console.warn('[agent-events] persisted session discovery was partial:', Object.values(listed.errors).join(','));
 }
};
const startAgentService = async () => {
 await hostAgentRuntime.start();
 if (isShuttingDown) return hostAgentRuntime.service.getState();
 await ensureGlobalWatcherStarted();
 if (workflowsModule.available) void workflowsModule.deliverPending();
 await convertLegacyQueue();
 await messageQueueRuntime.start();
 await scheduledTasksRuntime.start();
 return hostAgentRuntime.service.getState();
};
const gracefulShutdownRuntime = createGracefulShutdownRuntime({
 process,
 shutdownTimeoutMs: SHUTDOWN_TIMEOUT,
 getExitOnShutdown: () => exitOnShutdown,
 getIsShuttingDown: () => isShuttingDown,
 setIsShuttingDown: (value) => {
  isShuttingDown = value;
 },
 syncToHmrState: () => { },
 globalMessageStreamHub,
 hostAgentRuntime,
 openChamberSessionService,
 chatDirectoryCleanupRuntime,
 sessionAssistRuntime,
 sessionWorkRuntime,
 contextObligatoryRuntime,
 autoReviewRuntime,
 prWatchRuntime,
 extensionWaitsRuntime,
 messageQueueRuntime,
 dispatchResultsRuntime,
 messageSearchRuntime,
 sessionRuntime,
 getTerminalRuntime: () => terminalRuntime,
 setTerminalRuntime: (value) => {
  terminalRuntime = value;
 },
 getMessageStreamRuntime: () => messageStreamRuntime,
 setMessageStreamRuntime: (value) => {
  messageStreamRuntime = value;
 },
 getServer: () => server,
 getUiAuthController: () => uiAuthController,
 setUiAuthController: (value) => {
  uiAuthController = value;
 },
 getActiveTunnelController: () => activeTunnelController,
 setActiveTunnelController: (value) => {
  activeTunnelController = value;
 },
 tunnelAuthController,
 scheduledTasksRuntime,
 hostSessionState,
 beginGuestServiceShutdown,
 stopAllGuestServices: async () => {
  try { await stopAllGuestServices(); } finally { guestServiceHost.dispose(); }
 },
 getGuestSurfaceRuntime: () => guestSurfaceRuntime,
 getRealtimeProxyRuntime: () => realtimeProxyRuntime,
 getDictationRuntime: () => dictationRuntime,
 getRelayService: () => relayServiceInstance,
 getRelayReconcileTimer: () => relayReconcileTimer,
 getSpacesHost: () => spacesHost,
});

const gracefulShutdown: typeof gracefulShutdownRuntime.gracefulShutdown = (...args) => {
 featureRoutesRuntime.dispose();
 return gracefulShutdownRuntime.gracefulShutdown(...args);
};

async function main(options: StartWebUiServerOptions = {}): Promise<WebUiServerController> {
 await hostSessionState.initialize();
 await agentScopeRuntime.initialize();
 beginGuestServiceHost();
 applyOutboundProxyFromEnv();
 const port = options.port !== undefined && Number.isFinite(options.port) && options.port >= 0
  ? Math.trunc(options.port)
  : DEFAULT_PORT;
 const host = isString(options.host) && options.host.length > 0 ? options.host : undefined;
 const envBindHost = asNonEmptyString(process.env.OPENCHAMBER_HOST);
 const effectiveBindHost = host || envBindHost || '127.0.0.1';
 await ensureChatsDir({ fsPromises, chatsDir: OPENCHAMBER_CHATS_DIR, warn: (message) => console.warn(`[data-dir] ${message}`) });

 const requestReachedLanAddress = (req: Request): string | null => {
  const raw = isString(req.socket?.localAddress) ? req.socket.localAddress : '';
  const address = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return null;
  if (address.startsWith('127.')) return null;
  return address;
 };
 const advertisedLanUrl = readAdvertisedLanUrl();
 const resolvePairingTransports = async (req: Request) => {
  const activePort = tunnelRuntimeContext.getActivePort() || port;
  const local = `http://127.0.0.1:${activePort}`;
  const relayAvailable = !relayBlockedByEnterprise()
   && (relayServiceInstance ? await relayServiceInstance.isConfigured() : pinnedRelayUrl() !== null);
  if (advertisedLanUrl) {
   return { local, lan: advertisedLanUrl, relayAvailable };
  }
  let lanHost: string | null = null;
  if (isNetworkExposedBindHost(effectiveBindHost)) {
   lanHost = requestReachedLanAddress(req);
   try {
    if (!lanHost) {
     for (const list of Object.values(os.networkInterfaces())) {
      for (const entry of (list || [])) {
       if (entry.family === 'IPv4' && !entry.internal) { lanHost = entry.address; break; }
      }
      if (lanHost) break;
     }
    }
   } catch {
    lanHost = null;
   }
  } else {
   const h = String(effectiveBindHost || '').toLowerCase();
   if (h && h !== '127.0.0.1' && h !== 'localhost' && h !== '::1') lanHost = effectiveBindHost;
  }
  const lan = lanHost ? `http://${lanHost.includes(':') ? `[${lanHost}]` : lanHost}:${activePort}` : null;
  return { local, lan, relayAvailable };
 };
 const resolveDirectLanUrls = (req: Request): string[] => {
  if (advertisedLanUrl) return [advertisedLanUrl];
  const activePort = tunnelRuntimeContext.getActivePort() || port;
  const urls: string[] = [];
  const push = (candidateHost: string | null | undefined) => {
   if (!isString(candidateHost) || !candidateHost) return;
   const url = `http://${candidateHost.includes(':') ? `[${candidateHost}]` : candidateHost}:${activePort}`;
   if (!urls.includes(url)) urls.push(url);
  };
  if (isNetworkExposedBindHost(effectiveBindHost)) {
   push(requestReachedLanAddress(req));
   try {
    for (const list of Object.values(os.networkInterfaces())) {
     for (const entry of (list || [])) {
      if (entry.family === 'IPv4' && !entry.internal) push(entry.address);
     }
    }
   } catch {
    void 0;
   }
  } else {
   const h = String(effectiveBindHost || '').toLowerCase();
   if (h && h !== '127.0.0.1' && h !== 'localhost' && h !== '::1') push(effectiveBindHost);
  }
  return urls;
 };
 const uiPassword = isString(options.uiPassword)
  ? options.uiPassword
  : (isString(process.env.OPENCHAMBER_UI_PASSWORD) ? process.env.OPENCHAMBER_UI_PASSWORD : null);
 if (
  isNetworkExposedBindHost(effectiveBindHost)
  && !(isString(uiPassword) && uiPassword.trim().length > 0)
  && !isUnsafeUnauthenticatedLanAllowed(process.env)
 ) {
  throw new Error(getUnauthenticatedLanErrorMessage(effectiveBindHost));
 }
 if (isNetworkExposedBindHost(effectiveBindHost) && isNetworkAccessBlocked()) {
  throw new Error(NETWORK_ACCESS_BLOCKED_ERROR);
 }
 const tryCfTunnel = options.tryCfTunnel === true;
 const apiOnly = options.apiOnly === true || isEnvFlagEnabled(process.env.OPENCHAMBER_API_ONLY);
 const shouldUseCanonicalTunnelConfig = isString(options.tunnelMode)
  || isString(options.tunnelProvider)
  || options.tunnelConfigPath === null
  || isString(options.tunnelConfigPath)
  || isString(options.tunnelToken)
  || isString(options.tunnelHostname);
 const startupTunnelRequest = shouldUseCanonicalTunnelConfig
  ? normalizeTunnelStartRequest({
   provider: normalizeTunnelProvider(options.tunnelProvider),
   mode: options.tunnelMode,
   configPath: normalizeOptionalPath(options.tunnelConfigPath),
   token: isString(options.tunnelToken) ? options.tunnelToken.trim() : '',
   hostname: normalizeManagedRemoteTunnelHostname(options.tunnelHostname),
  })
  : (tryCfTunnel
   ? {
    provider: TUNNEL_PROVIDER_CLOUDFLARE,
    mode: TUNNEL_MODE_QUICK,
    configPath: undefined,
    token: '',
    hostname: undefined,
   }
   : null);
 const attachSignals = options.attachSignals !== false;
 const onTunnelReady = options.onTunnelReady ?? null;
 if (isBoolean(options.exitOnShutdown)) {
  exitOnShutdown = options.exitOnShutdown;
 }
 if (options.onDesktopNotification) {
  notificationEmitterRuntime.setOnDesktopNotification(options.onDesktopNotification);
 }
 if (options.getIsWindowFocused) {
  notificationTriggerRuntime.setGetIsWindowFocused(options.getIsWindowFocused);
 }
 const getDesktopRuntimeConfig = options.getDesktopRuntimeConfig ?? null;

 console.log(`Starting OhPiChamber on port ${port === 0 ? 'auto' : port}`);

 const sayTTSCapability = detectSayTtsCapability(process);

 spaceArchive = createSpaceArchive({
  dataDir: OPENCHAMBER_DATA_DIR,
  nativeArchive: {
   importChat: async ({ sessionId, bundlePath, directory, spaceId, archivedAt, deadline }: {
    sessionId: string;
    bundlePath: string;
    directory: string;
    spaceId: string;
    archivedAt: number;
    deadline: number;
   }) => {
    const remainingMs = Math.min(CHAT_EXPORT_TIMEOUT_MS, deadline - Date.now());
    if (remainingMs <= 0) throw Object.assign(new Error('Native archive import deadline expired'), { code: 'chat_export_timed_out' });
    const scope = await agentScopeRuntime.archiveScope(spaceId, directory);
    const response = await hostAgentRuntime.service.request('/internal/archive/import', {
     method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
     body: JSON.stringify({ sessionId, bundlePath, destinationDirectory: directory, spaceId, archivedAt, scope }),
     signal: AbortSignal.timeout(remainingMs),
    });
    const rawBody: unknown = await response.json().catch(() => null);
    const parsedBody = archiveImportAckSchema.safeParse(rawBody);
    const body = parsedBody.success ? parsedBody.data : undefined;
    if (!response.ok) {
     throw Object.assign(new Error(body?.detail ?? 'Native archive import failed'), { status: response.status, code: body?.code });
    }
    try {
     const importedSession = body?.session;
     if (body?.imported !== true || body.sessionId !== sessionId || !importedSession || importedSession.sessionId !== sessionId
      || importedSession.rootSessionId !== sessionId || importedSession.projectId !== scope.projectId || importedSession.workspaceId !== scope.workspaceId)
      throw new Error('Native archive import acknowledgement does not match its Host-selected scope');
     await agentScopeRuntime.registerArchiveSession({ sessionId, rootSessionId: sessionId }, body.children ?? [], scope);
    }
    catch (error) {
     await hostAgentRuntime.service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => { });
     await agentScopeStore.removeSessionFamily(sessionId).catch(() => { });
     throw error;
    }
   },
   removeChat: async (sessionId: string) => {
    const response = await hostAgentRuntime.service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Native archive rollback could not remove an imported session');
   },
  },
 });

 const buildSpacesHost = () => createSpacesHost({
  dataDir: OPENCHAMBER_DATA_DIR,
  dockerPath: serverUtilsRuntime.searchPathFor('docker', serverUtilsRuntime.buildAugmentedPath()) ?? 'docker',
  colimaPath: serverUtilsRuntime.searchPathFor('colima', serverUtilsRuntime.buildAugmentedPath()),
  gitPath: serverUtilsRuntime.searchPathFor('git', serverUtilsRuntime.buildAugmentedPath()) ?? 'git',
  hostEnvironment: { ...process.env, PATH: serverUtilsRuntime.buildAugmentedPath() },
  listProjectDirectories: async () => {
   const settings = await readSettingsFromDiskMigrated();
   return (sanitizeProjects(settings?.projects || []) ?? []).map((project) => project.path);
  },
  readIdleStop: async () => readIdleStopSetting((await readSettingsFromDiskMigrated())?.isolatedSpacesIdleStop),
  saveIdleStop: async (setting) => { await persistSettings({ isolatedSpacesIdleStop: setting }); },
  archive: spaceArchive,
 });
 const startupSettings = await readSettingsFromDiskMigrated().catch(() => null);
 if (spacesHostEnabled(startupSettings)) {
  try {
   spacesHost = buildSpacesHost();
  } catch (error) {
   const parsedError = errorDetailsSchema.safeParse(error).data;
   const message = error instanceof Error ? error.message : (parsedError?.message ?? String(error));
   console.error(`[spaces] isolated spaces are unavailable this start: ${parsedError?.code ?? ''} ${message}`.trim());
   spacesHost = null;
  }
 } else if (startupSettings?.isolatedSpacesEnabled === true) {
  console.warn('[spaces] isolated spaces are not released yet; the saved switch is ignored until the OMP space runtime is built');
 }

 const app = express();
 const serverStartedAt = new Date().toISOString();
 const packagedClientOrigins = new Set([
  'openchamber-ui://app',
  'capacitor://localhost',
  'http://localhost',
  'https://localhost',
 ]);
 const allowLocalDevOrigins = allowsLocalDevOrigins(process.env);
 const frameAncestorsPolicy = buildFrameAncestorsPolicy({
  allowLocalDevOrigins,
  extra: process.env.OPENCHAMBER_FRAME_ANCESTORS,
 });
 app.set('trust proxy', 'loopback, linklocal, uniquelocal');
 app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  if (!req.path.startsWith('/api/preview/proxy/')) {
   res.setHeader('X-Content-Type-Options', 'nosniff');
   res.setHeader('Referrer-Policy', 'same-origin');
   res.setHeader('Content-Security-Policy', frameAncestorsPolicy);
  }
  next();
 });
 app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send('User-agent: *\nDisallow: /\n');
 });
 app.use((req, res, next) => {
  const origin = isString(req.headers.origin) ? req.headers.origin : '';
  if (packagedClientOrigins.has(origin) || (allowLocalDevOrigins && isLocalDevClientOrigin(origin))) {
   res.setHeader('Access-Control-Allow-Origin', origin);
   res.setHeader('Access-Control-Allow-Credentials', 'true');
   res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept,X-Requested-With,Cache-Control,Last-Event-ID,X-OpenChamber-Directory,X-OpenChamber-Directory-Encoding,Ngrok-Skip-Browser-Warning,X-OpenChamber-Surface,X-OpenChamber-Provider,X-OpenChamber-Model');
   res.setHeader('Access-Control-Expose-Headers', 'x-next-cursor');
   res.setHeader('Vary', 'Origin');
   if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
   }
  }
  next();
 });
 app.use(compression({
  filter: (req, res) => {
   if (shouldSkipCompression(req, res)) return false;
   return compression.filter(req, res);
  },
  threshold: 1024,
 }));
 server = http.createServer(app);
 gracefulShutdownRuntime.trackServerConnections(server);
 if (isNetworkExposedBindHost(effectiveBindHost)) {
  server.on('connection', (socket) => {
   if (!isLoopbackBindHost(socket.remoteAddress ?? '') && isNetworkAccessBlocked()) socket.destroy();
  });
 }
 let tunnelRuntimeContextHolder: ReturnType<ReturnType<typeof createTunnelWiringRuntime>['initialize']> | null = null;
 const bootstrapResult = bootstrapRuntime.setupBaseRoutes(app, {
  process,
  openchamberVersion: OPENCHAMBER_VERSION,
  runtimeName: process.env.OPENCHAMBER_RUNTIME || 'web',
  serverStartedAt,
  gracefulShutdown,
  getHealthSnapshot: () => ({
   agentService: hostAgentRuntime.service.getState(),
   desktopNotifyEnabled: ENV_DESKTOP_NOTIFY,
   planModeExperimentalEnabled: PLAN_MODE_EXPERIMENT_ENABLED,
   apiOnly,
  }),
  getServerPort: () => {
   const activePort = tunnelRuntimeContextHolder?.getActivePort?.();
   if (activePort !== undefined && Number.isFinite(activePort) && activePort > 0) return activePort;
   return Number.isFinite(port) && port > 0 ? port : null;
  },
  getTunnelUrl: () => tunnelRuntimeContextHolder?.tunnelService?.getPublicUrl?.() ?? null,
  verboseRequestLogs: OPENCHAMBER_VERBOSE_REQUEST_LOGS,
  uiPassword,
  tunnelAuthController,
  remoteClientAuthRuntime,
  clientPairingRuntime,
  getRelayPairingCandidate: async (candidateOptions) => {
   if (!relayServiceInstance) return null;
   return candidateOptions?.ensureEnabled
    ? relayServiceInstance.ensureEnabledForPairing()
    : relayServiceInstance.getPairingCandidate();
  },
  reconcileRelay: () => (relayServiceInstance ? relayServiceInstance.reconcile() : Promise.resolve()),
  removeClientPushDevices: clientPushAccess.removeDevicesOfClients,
  getPairingTransports: resolvePairingTransports,
  getDirectCandidateUrls: resolveDirectLanUrls,
  getServerId: () => (relayServiceInstance ? relayServiceInstance.getServerId() : Promise.resolve(null)),
  getServerLabel: () => {
   try {
    const name = os.hostname();
    return isString(name) && name.trim().length > 0 ? name.trim() : 'OhPiChamber';
   } catch {
    return 'OhPiChamber';
   }
  },
  readSettingsFromDiskMigrated,
  normalizeTunnelSessionTtlMs,
  sayTTSCapability,
  ttsService,
  resolveTtsSelection,
  canonicalAgentRoutes: {
   service: hostAgentRuntime.service,
   skillFileOwner: hostAgentRuntime.skillFileOwner,
   resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
   resolveWorkspaceDirectory: hostAgentRuntime.resolveWorkspaceDirectory,
   resolveSessionScope: hostAgentRuntime.resolveSessionScope,
   resolveHostSessionScope: hostAgentRuntime.resolveHostSessionScope,
   listProjects: agentScopeRuntime.listProjects,
   listWorkspaces: agentScopeRuntime.listWorkspaces,
   resolveCredentialHandoff,
   getSkillRepositoryDependencies: featureRoutesRuntime.getSkillRepositoryDependencies,
   queueRoutes: (router: Router) => registerCanonicalQueueRoutes(router, messageQueueRuntime, {
    resolveSessionScope: hostAgentRuntime.resolveHostSessionScope,
   }),
   sessionRoutes: (router: Router) => registerCanonicalSessionRoutes(router, openChamberSessionService),
   attachmentRoutes: (router: Router) => router.use(createAttachmentRoutes({
    express, store: attachmentStore, resolveWorkspaceScope: agentScopeRuntime.resolveWorkspaceScope,
   })),
   globalEventHub: globalMessageStreamHub,
   resolveHostTools,
   onProviderConfigurationMutation: (payload: JsonValue) => {
    const parsed = providerMutationSchema.safeParse(payload);
    const providerId = parsed.success ? parsed.data.providerId : '';
    void (async () => {
     try {
      const quota = await import('./lib/quota/index.js');
      const usagePageIds = new Set(quota.listUsagePageProviders().map((provider) => provider.providerId));
      for (const logicalId of quotaProviderIdsForNativeProvider(providerId)) {
       if (!usagePageIds.has(logicalId)) continue;
       const event = buildQuotaProvidersChangedEventForProvider(logicalId);
       if (!event) continue;
       for (const client of uiOpenChamberEventClients) {
        try {
         writeSseEvent(client, event);
        } catch {
         uiOpenChamberEventClients.delete(client);
        }
       }
      }
     } catch (error) {
      console.warn('Failed to announce a usage provider change:', error instanceof Error ? error.message : error);
     }
    })();
   },
  },
  ensurePushInitialized,
  ensureGlobalWatcherStarted,
  getOrCreateVapidKeys,
  getUiSessionTokenFromRequest,
  updateSettingsFromDisk: settingsRuntime.updateSettingsFromDisk,
  addOrUpdatePushSubscription,
  removePushSubscription,
  addOrUpdateApnsToken,
  removeApnsToken,
  resolveApnsStatus,
  isLocalOnlyPushRequest: (req, uiSessionToken) => clientPushAccess.isLocalOnlyRequest(req, uiSessionToken),
  updateUiVisibility,
  clearPendingPushBadge: () => clearPendingPushBadge(),
  clearSessionPushNotifications: notificationTriggerRuntime.clearSessionPushNotifications,
  isUiVisible,
  getUiNotificationClients: () => uiNotificationClients,
  writeSseEvent,
  pluginNotificationEmitter,
  sessionRuntime,
  setPushInitialized,
  modelsDevApiUrl: MODELS_DEV_API_URL,
  modelsMetadataCacheTtl: MODELS_METADATA_CACHE_TTL,
  skipBodyParsing: (req) => spacesHost?.skipsBodyParsing(req) === true,
  isRequestOriginAllowed,
 });
 uiAuthController = bootstrapResult.uiAuthController;
 const forwardNativeArchive = async (pathname: string, res: Response, accept: string) => {
  try {
   const response = await hostAgentRuntime.service.request(pathname, { headers: { accept } });
   res.status(response.status);
   res.setHeader('Cache-Control', 'no-store');
   res.setHeader('Content-Type', response.headers.get('content-type') ?? accept);
   if (!response.ok) return res.send(await response.text());
   if (!response.body) return res.end();
   return Readable.fromWeb(response.body).pipe(res);
  } catch {
   return res.status(503).json({ code: 'SERVICE_UNAVAILABLE', detail: 'Native archive service is unavailable.' });
  }
 };
 app.get('/api/openchamber/space/archive/manifest', (_req, res) => forwardNativeArchive('/internal/archive/manifest', res, 'application/json'));
 app.get('/api/openchamber/space/archive/sessions/:id', (req, res) => forwardNativeArchive(`/internal/archive/sessions/${encodeURIComponent(req.params.id ?? '')}`, res, 'application/x-tar'));
 if (spaceArchive) app.use(spaceArchive.guard);
 app.use((req, res, next) => (spacesHost ? spacesHost.middleware(req, res, next) : next()));
 server.on('upgrade', (...args) => { spacesHost?.upgradeHandler(...args); });
 const startSpacesHost = (hostInstance: NonNullable<typeof spacesHost>) => {
  hostInstance.prepareUpgrades({ uiAuthController, isRequestOriginAllowed });
  hostInstance.start(globalMessageStreamHub);
 };
 if (spacesHost) startSpacesHost(spacesHost);
 const spacesSwitch = createSwitchController({
  getHost: () => spacesHost,
  setHost: (hostInstance: typeof spacesHost) => { spacesHost = hostInstance; },
  buildHost: buildSpacesHost,
  startHost: startSpacesHost,
  persist: async (enabled: boolean) => { await persistSettings({ isolatedSpacesEnabled: enabled }); },
 });
 registerSpaceRoutes(app, {
  getJourney: () => spacesHost?.journey ?? null,
  getPlaces: () => spacesHost?.places() ?? [],
  readSwitch: spacesSwitch.readSwitch,
  setSwitch: spacesSwitch.setSwitch,
  getArchive: () => spaceArchive,
 });
 realtimeProxyRuntime = attachRealtimeProxy({
  app,
  server,
  getDesktopRuntimeConfig,
  getUiAuthController: () => uiAuthController,
  isRequestOriginAllowed,
 });

 const tunnelRuntimeContext = tunnelWiringRuntime.initialize(app, port, Boolean(uiPassword?.trim()));
 const { tunnelService, startTunnelWithNormalizedRequest } = tunnelRuntimeContext;
 tunnelRuntimeContextHolder = tunnelRuntimeContext;

 const relayService = createRelayService({
  crypto,
  readSettingsFromDiskMigrated,
  updateSettingsFromDisk: settingsRuntime.updateSettingsFromDisk,
  relayKeyStore,
  onShareState: (shareId) => {
   void sharePagesRuntime.handleShareState(shareId).catch(() => undefined);
  },
  getLocalPort: () => tunnelRuntimeContext.getActivePort(),
  hostLock: createRelayHostLock({
   lockFilePath: path.join(OPENCHAMBER_DATA_DIR, 'relay-host.lock'),
   fs,
   process,
  }),
  allowPassiveHost: process.env.OPENCHAMBER_RELAY_HOST === 'on'
   || (process.env.OPENCHAMBER_RELAY_HOST !== 'off' && process.env.OPENCHAMBER_ELECTRON_DEV !== '1'),
  hasRelayDemand: async () => {
   const [pendingRelay, deviceRelay] = await Promise.allSettled([
    clientPairingRuntime.hasActiveRelaySession(),
    remoteClientAuthRuntime.hasActiveRelayClients(),
   ]);
   if (pendingRelay.status === 'fulfilled' && pendingRelay.value) return true;
   if (deviceRelay.status === 'fulfilled' && deviceRelay.value) return true;
   if (pendingRelay.status === 'rejected') throw pendingRelay.reason;
   if (deviceRelay.status === 'rejected') throw deviceRelay.reason;
   return false;
  },
 });
 relayServiceInstance = relayService;
 relayService.registerRoutes(app, server);

 registerBrowserControlRoutes(app, { express, broker: browserControlBroker, preferredClient: browserClientEvents.preferredClient });
 registerUploadRoute(app, { store: browserUploads });

 const devServerScanner = createDevServerScanner({ spawn, platform: process.platform });
 const listDevServers = () => devServerScanner.discover({
 });

 createDevTunnelRuntime({
  server,
  discoverDevServers: listDevServers,
  uiAuthController,
  isRequestOriginAllowed,
  rejectWebSocketUpgrade,
  logger: console,
 });

 registerSettingsRoutes(app, {
  readSettingsFromDiskMigrated,
  formatSettingsResponse,
  persistSettings: (changes: SettingsDocument, options?: { surface?: SettingsDocument[string]; preserveProjectIcons?: boolean }) => persistSettings(changes, { ...options, preserveProjectIcons: true }),
  onSettingsUpdated: async (settings: FormattedSettings | SettingsDocument) => {
   try {
    const tools = {
     openchamber: settings?.agentControlToolEnabled !== false,
     web: settings?.agentWebToolEnabled !== false,
     openchamber_knowledge: settings?.agentKnowledgeToolEnabled !== false,
     notify: settings?.agentNotifyToolEnabled === true,
     openchamber_usage: settings?.agentUsageToolEnabled === true,
     openchamber_render: settings?.agentRenderToolEnabled !== false,
     openchamber_secret: settings?.agentSecretToolEnabled !== false,
     openchamber_workflow: isWorkflowFeatureAvailable() && settings?.agentWorkflowToolEnabled !== false,
    };
    await hostAgentRuntime.service.request('/internal/workers/host-tools', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ tools }),
    });
   } catch {
    void 0;
   }
  },
 });

 await featureRoutesRuntime.registerRoutes(app, {
  extensionNotificationChannels,
  autoReviewRuntime,
  prWatchRuntime,
  extensionWaitsRuntime,
  laterPagesRuntime,
  sharePagesRuntime,
  receivedPagesRuntime,
  persistResolvedSettings: settingsRuntime.persistResolvedSettings,
  environmentStore,
  environmentRuntime,
  listConfiguredProjects,
  messageSearchRuntime,
  sessionFoldersStore,
  isRequestOriginAllowed,
  resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
  resolveWorkspaceDirectory: hostAgentRuntime.resolveWorkspaceDirectory,
  resolveRepositoryWorkspace: hostAgentRuntime.resolveRepositoryWorkspace,
  resolveSessionScope: hostAgentRuntime.resolveSessionScope,
  resolveHostSessionScope: hostAgentRuntime.resolveHostSessionScope,
  listQueueScopes,
  workflows: workflowsModule,
  resolveQuotaSelection,
  listQuotaSelections,
  resolveCredential,
  readNativeReports,
  crypto,
  os,
  path,
  fsPromises,
  spawn,
  createFsSearchRuntime: createFsSearchRuntimeFactory,
  openchamberDataDir: OPENCHAMBER_DATA_DIR,
  openchamberVersion: OPENCHAMBER_VERSION,
  onGuestDeactivated: async (event) => {
   guestSurfaceRuntime?.endForGuest(event.guestId);
   await browserControlRouter.handleGuestDeactivated({ guestId: event.guestId, guestName: event.guestId });
  },
  surfaceViewerHeaders: (guestId, viewerId) => guestSurfaceRuntime?.viewerHeaders(guestId, viewerId) ?? null,
  builtInExtensionsDir: options.builtInExtensionsDir,
  openchamberUserConfigRoot: OPENCHAMBER_USER_CONFIG_ROOT,
  managedChatsRoot: OPENCHAMBER_CHATS_DIR,
  normalizeDirectoryPath,
  resolveProjectDirectory,
  readWorktreeSetup: (projectId) => projectConfigRuntime.readProjectSetup(projectId),
  resolveOptionalProjectDirectory,
  validateDirectoryPath,
  readCustomThemesFromDisk,
  saveImportedTheme,
  deleteImportedTheme,
  readSettingsFromDisk,
  readSettingsFromDiskMigrated,
  persistSettings,
  sanitizeProjects,
  sanitizeSkillCatalogs: (raw) => sanitizeSkillCatalogs(raw) ?? [],
  devServerScanner,
  getOwnPorts: () => {
   const activePort = tunnelRuntimeContext.getActivePort();
   return Number.isInteger(activePort) && activePort > 0 ? [activePort] : [];
  },
  getActivePort: () => {
   const address = server?.address();
   return address && !isString(address) && Number.isInteger(address.port) ? address.port : null;
  },
  getActiveHost: () => {
   const address = server?.address();
   return address && !isString(address) ? address.address : null;
  },
  buildAugmentedPath: () => serverUtilsRuntime.buildAugmentedPath(),
  resolveGitBinaryForSpawn: () => (process.platform === 'win32' ? 'git.exe' : 'git'),
  projectConfigRuntime,
  resolvePrimaryWorktreeRoot,
  resolveWorktreeTopLevel,
  projectContextRuntime,
  sessionKnowledgeRuntime,
  scheduledTasksRuntime,
  scheduledTaskService,
  scheduledWorktreeBridge,
  sessionWorktreeMoveBridge,
  openChamberSessionService,
  openChamberControlService,
  getOpenChamberEventClients: () => uiOpenChamberEventClients,
  writeSseEvent,
  globalEventHub: globalMessageStreamHub,
  worktreeBootstrapStore,
  worktreeLeaseControl,
  worktreeArchiveSessionService: openChamberSessionService,
  messageQueueRuntime,
  routingRuntime,
  permissionAutoAcceptRuntime,
 });
 guestSurfaceRuntime = createGuestSurfaceRuntime({
  server,
  uiAuthController,
  isRequestOriginAllowed,
  rejectWebSocketUpgrade,
  persistPath: extensionsPersistPath(OPENCHAMBER_DATA_DIR),
  findGuest: (id) => findInstalledGuest(id, extensionsPersistPath(OPENCHAMBER_DATA_DIR)),
  idleStopMs: BROWSER_PROVIDER_IDLE_MS,
 });

 const startupPipelineResult = await startupPipelineRuntime.run({
  app,
  server,
  express,
  fs,
  path,
  uiAuthController,
  buildAugmentedPath: () => serverUtilsRuntime.buildAugmentedPath(),
  searchPathFor: (name, searchPath) => serverUtilsRuntime.searchPathFor(name, searchPath),
  isRequestOriginAllowed,
  rejectWebSocketUpgrade,
  globalEventHub: globalMessageStreamHub,
  messageStreamWsClients: uiNotificationWsClients,
  terminalHeartbeatIntervalMs: TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS,
  environmentRuntime,
  broadcastUiEvent: (event) => {
   for (const client of uiOpenChamberEventClients) {
    try {
     writeSseEvent(client, event);
    } catch {
     uiOpenChamberEventClients.delete(client);
    }
   }
  },
  startAgentService: async () => {
   try {
    await startAgentService();
   } catch (error) {
    console.error('Agent Service startup failed:', error instanceof Error ? error.message : String(error));
   }
  },
  onListenerReady: async () => {
   try { await featureRoutesRuntime.publishRepositoryCredentialEndpoint(); }
   catch (error) { console.warn('Git credential helper endpoint was not published:', error instanceof Error ? error.message : String(error)); }
  },
  staticRoutesRuntime,
  process,
  crypto,
  normalizeTunnelBootstrapTtlMs,
  readSettingsFromDiskMigrated,
  tunnelAuthController,
  startTunnelWithNormalizedRequest,
  gracefulShutdown,
  getSignalsAttached: () => signalsAttached,
  setSignalsAttached: (value) => { signalsAttached = value; },
  syncToHmrState: () => { },
  TUNNEL_MODE_QUICK,
  TUNNEL_MODE_MANAGED_LOCAL,
  TUNNEL_MODE_MANAGED_REMOTE,
  host,
  port,
  startupTunnelRequest,
  onTunnelReady,
  tunnelRuntimeContext,
  attachSignals,
  apiOnly,
  dictationModelsDir: path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'speech-models'),
 });
 terminalRuntime = startupPipelineResult.terminalRuntime;
 dictationRuntime = startupPipelineResult.dictationRuntime;
 messageStreamRuntime = startupPipelineResult.messageStreamRuntime;


 void relayService.reconcile();

 relayReconcileTimer = setInterval(() => {
  void relayService.reconcile();
 }, 60_000);
 relayReconcileTimer.unref?.();

 const spaceIdleStopFile = process.env.OPENCHAMBER_SPACE_IDLE_STOP_FILE;
 if (spaceIdleStopFile) {
  startIdleStop({
   settingsPath: spaceIdleStopFile,
   readSessionStates: () => sessionRuntime.getSessionStateSnapshot(),
   readPendingRequests: () => Object.fromEntries(
    Object.entries(sessionRuntime.getPendingBlockingRequestsSnapshot()).map(([id, entry]) => [
     id,
     { permissions: entry.approvals, forms: entry.questions },
    ]),
   ),
   stopSpace: async () => {
    await gracefulShutdown({ exitProcess: false }).catch(() => { });
    process.exit(SPACE_IDLE_EXIT_CODE);
   },
  });
 }

 return {
  expressApp: app,
  httpServer: server,
  getPort: () => tunnelRuntimeContext.getActivePort(),
  startAgentService,
  stopAgentService: async () => {
   await scheduledTasksRuntime.stop();
   await messageQueueRuntime.stop();
   await globalMessageStreamHub.stop();
   await hostAgentRuntime.stop();
   sessionRuntime.interruptBusySessionsAfterRestart();
  },
  getAgentServiceState: () => hostAgentRuntime.service.getState(),
  getTunnelUrl: () => tunnelService.getPublicUrl(),
  getQuitRiskStatus: () => ({
   tunnel: {
    active: Boolean(tunnelService.getPublicUrl()),
   },
   scheduledTasks: scheduledTasksRuntime.getStatus(),
  }),
  stop: (shutdownOptions = {}) => gracefulShutdown({ exitProcess: shutdownOptions.exitProcess ?? false }),
 };
}

runCliEntryIfMain({
 process,
 currentFilename: __filename,
 parseServeCliOptions,
 defaultPort: DEFAULT_PORT,
 cloudflareProvider: TUNNEL_PROVIDER_CLOUDFLARE,
 managedLocalMode: TUNNEL_MODE_MANAGED_LOCAL,
 setExitOnShutdown: (value) => {
  exitOnShutdown = value;
 },
 startServer: main,
});

export {
 gracefulShutdown,
 main as startWebUiServer,
 parseServeCliOptions as parseArgs,
};
