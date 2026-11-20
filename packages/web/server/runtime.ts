import { webPackagePaths } from './lib/web-package-paths.js';
import 'reflect-metadata';
import express from 'express';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import http from 'http';
import net from 'net';
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
import { isEnterpriseMode, isNetworkAccessBlocked, NETWORK_ACCESS_BLOCKED_ERROR, readEnterprisePolicy } from './lib/enterprise-mode.js';
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
import { createPermissionAutoAcceptRuntime, registerPermissionAutoAcceptRoutes } from './lib/permission-auto-accept/runtime.js';
import { createJevClient } from './lib/routing/jev.js';
import { createSessionWorkRuntime } from './lib/session-work/runtime.js';
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
import { createSelectedCredentialResolver, createSelectedCredentialHandoff, createCatalogCredentialSelections } from './lib/host/private-credential.js';
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
// Background CLI launches enter here in a fresh process, without CLI defaults.
applyConnectAttemptTimeout();
applySystemCertificates();
applyOutboundProxyFromEnv();

const __filename = fileURLToPath(new URL('./index.js', import.meta.url));
const __dirname = path.join(webPackagePaths.root, 'server');
let exitOnShutdown = false;
let isShuttingDown = false;
let activeTunnelController = null;
let runtimeManagedRemoteTunnelHostname = null;
let expressApp = null;
let server = null;
let runtimeManagedRemoteTunnelToken = null;
let uiAuthController = null;
let spacesHost = null;
let realtimeProxyRuntime = null;
let guestSurfaceRuntime = null;
let relayServiceInstance = null;
let terminalRuntime = null;
let dictationRuntime = null;
let messageStreamRuntime = null;
let signalsAttached = false;
let relayReconcileTimer = null;

const DEFAULT_PORT = 3000;
const DESKTOP_NOTIFY_PREFIX = '[OhPiChamberDesktopNotify] ';
const uiNotificationClients = new Set();
const uiNotificationWsClients = new Set();
const uiOpenChamberEventClients = new Set();
const SHUTDOWN_TIMEOUT = 10000;
const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const MODELS_METADATA_CACHE_TTL = 5 * 60 * 1000;
const TUNNEL_BOOTSTRAP_TTL_DEFAULT_MS = 30 * 60 * 1000;
const TUNNEL_BOOTSTRAP_TTL_MIN_MS = 60 * 1000;
const TUNNEL_BOOTSTRAP_TTL_MAX_MS = 24 * 60 * 60 * 1000;
const TUNNEL_SESSION_TTL_DEFAULT_MS = 8 * 60 * 60 * 1000;
const TUNNEL_SESSION_TTL_MIN_MS = 5 * 60 * 1000;
const TUNNEL_SESSION_TTL_MAX_MS = 30 * 24 * 60 * 60 * 1000;

function headerIncludesEventStream(value) {
 if (typeof value === 'string') {
  return value.toLowerCase().includes('text/event-stream');
 }

 if (Array.isArray(value)) {
  return value.some((entry) => typeof entry === 'string' && entry.toLowerCase().includes('text/event-stream'));
 }

 return false;
}

/**
 * SSE endpoint paths that must never be compressed by the compression middleware.
 *
 * The compression middleware filter runs before route handlers, so
 * `res.getHeader('Content-Type')` is still undefined at that point.
 * This means the Accept-header check alone is not sufficient for
 * non-standard clients (e.g. curl, fetch) that omit Accept.
 * Path-based exclusion acts as a deterministic fallback.
 */
const SSE_PATH_PREFIXES = [
 '/api/event',
 '/api/global/event',
 '/api/notifications/stream',
 '/api/openchamber/events',
 '/api/openchamber/realtime-proxy/sse',
];

function shouldSkipCompression(req, res) {
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
  const pkg = JSON.parse(raw);
  if (pkg && typeof pkg.version === 'string' && pkg.version.trim().length > 0) {
   return pkg.version.trim();
  }
 } catch {
 }
 return 'unknown';
})();

const isEnvFlagEnabled = (value) => {
 if (value === true || value === 1) return true;
 if (typeof value !== 'string') return false;
 const normalized = value.trim().toLowerCase();
 return normalized === '1' || normalized === 'true';
};

const isEnvFlagDisabled = (value) => {
 if (value === false || value === 0) return true;
 if (typeof value !== 'string') return false;
 const normalized = value.trim().toLowerCase();
 return normalized === '0' || normalized === 'false';
};

const shouldSkipApiCompression = () => {
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

const normalizeDirectoryPath = (...args) => settingsNormalizationRuntime.normalizeDirectoryPath(...args);
const normalizePathForPersistence = (...args) => settingsNormalizationRuntime.normalizePathForPersistence(...args);
const normalizeSettingsPaths = (...args) => settingsNormalizationRuntime.normalizeSettingsPaths(...args);
const normalizeTunnelBootstrapTtlMs = (...args) => settingsNormalizationRuntime.normalizeTunnelBootstrapTtlMs(...args);
const normalizeTunnelSessionTtlMs = (...args) => settingsNormalizationRuntime.normalizeTunnelSessionTtlMs(...args);
const normalizeManagedRemoteTunnelHostname = (...args) =>
 settingsNormalizationRuntime.normalizeManagedRemoteTunnelHostname(...args);
const normalizeManagedRemoteTunnelPresets = (...args) =>
 settingsNormalizationRuntime.normalizeManagedRemoteTunnelPresets(...args);
const normalizeManagedRemoteTunnelPresetTokens = (...args) =>
 settingsNormalizationRuntime.normalizeManagedRemoteTunnelPresetTokens(...args);
const normalizeStringArray = (...args) => settingsNormalizationRuntime.normalizeStringArray(...args);
const sanitizeModelRefs = (...args) => settingsNormalizationRuntime.sanitizeModelRefs(...args);
const sanitizeSkillCatalogs = (...args) => settingsNormalizationRuntime.sanitizeSkillCatalogs(...args);
const sanitizeProjects = (...args) => settingsNormalizationRuntime.sanitizeProjects(...args);

// Every OpenChamber-owned file and folder hangs off one root: the default
// `~/.config/ohpichamber`, or `OPENCHAMBER_DATA_DIR` when set. The user
// folders (`projects/`, `themes/`, `speech-models/`) are copied into a custom
// root once at startup (`migrateLegacyUserDirs`), because they used to ignore
// the variable.
const OPENCHAMBER_DEFAULT_CONFIG_ROOT = path.join(os.homedir(), '.config', 'ohpichamber');
const OPENCHAMBER_USER_CONFIG_ROOT = process.env.OPENCHAMBER_DATA_DIR
 ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
 : OPENCHAMBER_DEFAULT_CONFIG_ROOT;
const OPENCHAMBER_USER_THEMES_DIR = path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'themes');
const OPENCHAMBER_PROJECTS_CONFIG_DIR = path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'projects');
// OPENCHAMBER_CHATS_DIR relocates managed chat worktrees for the Host Gateway.
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

const readCustomThemesFromDisk = (...args) => themeRuntime.readCustomThemesFromDisk(...args);
const saveImportedTheme = (...args) => themeRuntime.saveImportedTheme(...args);
const deleteImportedTheme = (...args) => themeRuntime.deleteImportedTheme(...args);

let notificationTemplateRuntime = null;

const resolveNotificationTemplate = (...args) => notificationTemplateRuntime.resolveNotificationTemplate(...args);
const shouldApplyResolvedTemplateMessage = (...args) => notificationTemplateRuntime.shouldApplyResolvedTemplateMessage(...args);
const extractLastMessageText = (...args) => notificationTemplateRuntime.extractLastMessageText(...args);
const fetchLastAssistantMessageText = (...args) => notificationTemplateRuntime.fetchLastAssistantMessageText(...args);
const buildTemplateVariables = (...args) => notificationTemplateRuntime.buildTemplateVariables(...args);

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

const readManagedRemoteTunnelConfigFromDisk = (...args) => managedTunnelConfigRuntime.readManagedRemoteTunnelConfigFromDisk(...args);
const syncManagedRemoteTunnelConfigWithPresets = (...args) => managedTunnelConfigRuntime.syncManagedRemoteTunnelConfigWithPresets(...args);
const upsertManagedRemoteTunnelToken = (...args) => managedTunnelConfigRuntime.upsertManagedRemoteTunnelToken(...args);
const resolveManagedRemoteTunnelToken = (...args) => managedTunnelConfigRuntime.resolveManagedRemoteTunnelToken(...args);

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

const normalizePwaAppName = (...args) => settingsHelpers.normalizePwaAppName(...args);
const normalizePwaOrientation = (...args) => settingsHelpers.normalizePwaOrientation(...args);
const sanitizeSettingsUpdate = (...args) => settingsHelpers.sanitizeSettingsUpdate(...args);
const mergePersistedSettings = (...args) => settingsHelpers.mergePersistedSettings(...args);
const formatSettingsResponse = (...args) => settingsHelpers.formatSettingsResponse(...args);

const projectDirectoryRuntime = createProjectDirectoryRuntime({
 fsPromises,
 path,
 normalizeDirectoryPath,
 getReadSettingsFromDiskMigrated: () => readSettingsFromDiskMigrated,
 sanitizeProjects,
 // A space's directory never runs on the host, whatever route carries it.
 refuseDirectory: (candidate) => spacesHost?.refuseDirectory(candidate) ?? null,
});

const resolveDirectoryCandidate = (...args) => projectDirectoryRuntime.resolveDirectoryCandidate(...args);
const validateDirectoryPath = (...args) => projectDirectoryRuntime.validateDirectoryPath(...args);
const resolveProjectDirectory = (...args) => projectDirectoryRuntime.resolveProjectDirectory(...args);
const resolveOptionalProjectDirectory = (...args) => projectDirectoryRuntime.resolveOptionalProjectDirectory(...args);

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
 // Declared further down; settings are only saved once the server serves requests.
 onMessageSearchEnabledChanged: (enabled) => messageSearchRuntime.setEnabled(enabled),
 onMessageSearchReasoningChanged: (enabled) => messageSearchRuntime.setReasoningEnabled(enabled),
});

const readSettingsFromDiskMigrated = (...args) => settingsRuntime.readSettingsFromDiskMigrated(...args);
const readSettingsFromDisk = (...args) => settingsRuntime.readSettingsFromDisk(...args);
const readSettingsFromDiskStrict = (...args) => settingsRuntime.readSettingsFromDiskStrict(...args);
const writeSettingsToDisk = (...args) => settingsRuntime.writeSettingsToDisk(...args);
const persistSettings = (...args) => settingsRuntime.persistSettings(...args);

const requestSecurityRuntime = createRequestSecurityRuntime({
 readSettingsFromDiskMigrated,
 allowLocalDevOrigins: allowsLocalDevOrigins(process.env),
});

const getUiSessionTokenFromRequest = (...args) => requestSecurityRuntime.getUiSessionTokenFromRequest(...args);

const pushRuntime = createPushRuntime({
 fsPromises,
 path,
 loadWebPush: () => import('web-push').then((module) => module.default),
 PUSH_SUBSCRIPTIONS_FILE_PATH,
 readSettingsFromDiskMigrated,
 writeSettingsToDisk,
});

const getOrCreateVapidKeys = (...args) => pushRuntime.getOrCreateVapidKeys(...args);
const addOrUpdatePushSubscription = (...args) => pushRuntime.addOrUpdatePushSubscription(...args);
const removePushSubscription = (...args) => pushRuntime.removePushSubscription(...args);
const sendPushToAllUiSessions = (...args) => pushRuntime.sendPushToAllUiSessions(...args);
// Set once the notification trigger runtime exists (declared later). When a UI
// client reports it became visible, reset the native push badge set — the same
// moment the device zeroes its icon badge on becomeActive, keeping them in sync.
let clearPendingPushBadge = () => { };
const updateUiVisibility = (token, visible, platform) => {
 if (visible === true) clearPendingPushBadge();
 return pushRuntime.updateUiVisibility(token, visible, platform);
};
const isAnyUiVisible = (...args) => pushRuntime.isAnyUiVisible(...args);
const isAnyInteractiveClientVisible = (...args) => pushRuntime.isAnyInteractiveClientVisible(...args);
const isUiVisible = (...args) => pushRuntime.isUiVisible(...args);
const ensurePushInitialized = (...args) => pushRuntime.ensurePushInitialized(...args);
const setPushInitialized = (...args) => pushRuntime.setPushInitialized(...args);

// Host relay identity keys, shared by the push relay and the private relay.
const relayKeyStore = createRelayKeyStore({
 fsPromises,
 path,
 dataDir: OPENCHAMBER_DATA_DIR,
 readSettingsFromDiskMigrated,
 readSettingsStrict: readSettingsFromDiskStrict,
 writeSettingsToDisk,
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

const addOrUpdateApnsToken = (...args) => apnsRuntime.addOrUpdateApnsToken(...args);
const removeApnsToken = (...args) => apnsRuntime.removeApnsToken(...args);
const sendApnsToAllUiSessions = (...args) => apnsRuntime.sendApnsToAllUiSessions(...args);
const resolveApnsStatus = (...args) => apnsRuntime.resolveApnsStatus(...args);

const TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW = 128;
const TERMINAL_INPUT_WS_REBIND_WINDOW_MS = 60 * 1000;
const TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS = 15 * 1000;

const rejectWebSocketUpgrade = (...args) => requestSecurityRuntime.rejectWebSocketUpgrade(...args);


const isRequestOriginAllowed = (...args) => requestSecurityRuntime.isRequestOriginAllowed(...args);

const notificationEmitterRuntime = createNotificationEmitterRuntime({
 process,
 getDesktopNotifyEnabled: () => ENV_DESKTOP_NOTIFY,
 desktopNotifyPrefix: DESKTOP_NOTIFY_PREFIX,
 getUiNotificationClients: () => uiNotificationClients,
 getOpenChamberEventClients: () => uiOpenChamberEventClients,
 getBroadcastGlobalUiEvent: () => broadcastGlobalUiEvent,
});

const writeSseEvent = (...args) => notificationEmitterRuntime.writeSseEvent(...args);
const emitDesktopNotification = (...args) => notificationEmitterRuntime.emitDesktopNotification(...args);
const broadcastGlobalUiEvent = createGlobalUiEventBroadcaster({
 sseClients: uiNotificationClients,
 wsClients: uiNotificationWsClients,
 writeSseEvent,
});
const broadcastUiNotification = (...args) => notificationEmitterRuntime.broadcastUiNotification(...args);

// OpenChamber-owned events travel on the shared control stream, not an engine proxy.
const broadcastOpenChamberUiEvent = createGlobalUiEventBroadcaster({
 sseClients: uiOpenChamberEventClients,
 wsClients: uiNotificationWsClients,
 writeSseEvent,
});

// Operational session state remains Host-owned when agent execution is unavailable.
const hostSessionState = createHostSessionState({ dataDir: OPENCHAMBER_DATA_DIR });
const { sessionMetadataStore, archiveStore, sessionFoldersStore, agentScopeStore, attachmentStore } = hostSessionState;
const scheduledChatsScope = createChatsScope(OPENCHAMBER_CHATS_DIR);
let spaceArchive = null;
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
 // Captured at worker admission: a saved change applies to workers started after it.
 getEnvironmentForDirectory: async (directory) => {
  const environment = await environmentRuntime.forDirectory(directory) ?? {};
  const settings = await readSettingsFromDiskMigrated().catch(() => ({}));
  const checker = settings?.sessionGoalChecker === 'small-model' ? 'small-model' : 'classifier';
  const maxTurns = Number.isSafeInteger(settings?.sessionGoalMaxAutoTurns) ? settings.sessionGoalMaxAutoTurns : 20;
  return {
   ...environment,
   OPENCHAMBER_SESSION_GOAL_CHECKER: checker,
   OPENCHAMBER_SESSION_GOAL_MAX_AUTO_TURNS: String(maxTurns),
   OPENCHAMBER_PLAN_ALLOW_AGENTS: settings?.planModeAllowAgents === true ? 'true' : 'false',
  };
 },
 invokeHostAction: (scope, request, signal) => openChamberControlService.invokeHostAction(scope, request, signal),
});
// The Host generates the lease id before the Agent Service sees it and releases
// that same id on every path. Restarts stay held from just before the acquire
// until the release, so a crashed service cannot admit a new generation while
// the archive still removes the folder.
const worktreeLeaseControl = {
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
   const problem = await response.json().catch(() => null);
   const details = problem && typeof problem.details === 'object' ? problem.details : undefined;
   // A duplicate lease id names a lease this archive never created;
   // releasing it would end another archive's hold.
   if (problem?.code === 'COMMAND_IN_FLIGHT' && details?.leaseId === leaseId) {
    hostAgentRuntime.service.resumeRestarts();
    throw Object.assign(
     new Error(problem?.detail || 'The worktree lease id is already held'),
     { status: 409, code: problem.code, details, releaseNotNeeded: true },
    );
   }
   throw Object.assign(
    new Error(problem?.detail || 'The worktree lease was refused'),
    {
     status: Number.isInteger(problem?.status) ? problem.status : response.status,
     code: problem?.code,
     details,
    },
   );
  }
  return response.json();
 },
 async release(leaseId) {
  try {
   await hostAgentRuntime.service.request(`/internal/worktree-leases/${encodeURIComponent(leaseId)}`, { method: 'DELETE' });
  } catch {
   // A live, hung service keeps the in-memory lease until it restarts; the
   // folder is already gone, and the resumed supervisor still starts it.
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
const ttsService = createTTSService({ resolveCredential });
const resolveAttachments = (scope, attachments) => attachmentStore.resolveAttachments(scope, attachments);
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
 const items = [];
 const errors = [...stored.errors];
 for (const entry of stored.items) {
  try {
   const scope = await hostAgentRuntime.resolveHostSessionScope(entry.scope.sessionId);
   if (!scope || scope.projectId !== entry.scope.projectId || scope.workspaceId !== entry.scope.workspaceId) {
    errors.push({ code: 'SESSION_NOT_FOUND' });
    continue;
   }
   items.push({ sessionId: scope.sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId });
  } catch (error) { errors.push({ code: error.code ?? 'METADATA_READ_FAILED' }); }
 }
 return { items, errors };
};

const readStoredSessionMetadata = (sessionID) => sessionMetadataStore.get(sessionID);

const persistSessionMetadataPatch = async (sessionID, patch, { directory = '' } = {}) => {
 const result = await sessionMetadataStore.setSessionMetadata(sessionID, patch);
 if (result.changed) {
  broadcastOpenChamberUiEvent({
   type: 'openchamber:session-metadata',
   properties: { sessionId: sessionID, sessionID, metadata: result.metadata, revision: result.revision },
  });
 }
 return result;
};

/** A metadata change decided against the record at write time; broadcast only when it changed. */
const updateSessionMetadataWith = async (sessionID, decide, { directory = '' } = {}) => {
 const result = await sessionMetadataStore.updateSessionMetadata(sessionID, decide, { directory });
 if (result.changed) {
  broadcastOpenChamberUiEvent({
   type: 'openchamber:session-metadata',
   properties: { sessionId: sessionID, sessionID, metadata: result.metadata, revision: result.revision },
  });
 }
 return result;
};
// The Git routes register later; until they do, a session move refuses
// rather than pretending it created a checkout.
const sessionWorktreeMoveBridge = createUnregisteredSessionWorktreeMoveBridge();
const openChamberSessionService = createOpenChamberSessionService({
 service: hostAgentRuntime.service,
 // One creation pipeline, one bootstrap and one stash owner for the move: the
 // same Git operations the New worktree dialog and the scheduler use.
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
  get resolveWorktreeSetup() { return sessionWorktreeMoveBridge.resolveWorktreeSetup ?? undefined; },
  warn: (message, error) => console.warn(message, error instanceof Error ? error.message : String(error)),
 },
 readSettings: readSettingsFromDiskMigrated,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
 resolveWorkspaceDirectory: agentScopeRuntime.resolveWorkspaceDirectory,
 resolveHostWorkspaceScope: agentScopeRuntime.resolveWorkspaceScope,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 resolveHostSessionScope: hostAgentRuntime.resolveHostSessionScope,
 resolveHostRelocationScope: hostAgentRuntime.resolveHostRelocationScope,
 // The move resolves the worktree's start folder and the project's trusted
 // setup commands through the same owners the dialog reads.
 resolveWorktreeTopLevel,
 // The move's start-folder check uses the Git module's own rule.
 validateWorktreeDirectory: (directory, worktreeRoot) => validateWorktreeDirectory(directory, worktreeRoot),
 resolveProjectDirectory: async (directory) => {
  const resolved = await agentScopeRuntime.resolveWorkspaceDirectory(directory);
  return resolved ? { projectId: resolved.projectId, projectDirectory: resolved.projectDirectory } : null;
 },
 worktreeSetupOf,
 agentScopeStore,
 listWorkspaceScopes,
 registerSessionScope: agentScopeRuntime.registerSessionScope,
 resolveAttachments,
 capturePrompt: (...args) => hostPromptDeliveryRuntime.capturePrompt(...args),
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
   console.warn('[agent-events] session observation failed:', error?.code ?? 'SERVICE_UNAVAILABLE');
  }
  return result;
 },
 publishSessionEvent: (event) => {
  const sessionId = event?.properties?.sessionId;
  if (sessionId) {
   if (globalMessageStreamHub.retainSession) {
    void globalMessageStreamHub.retainSession(sessionId, 'session-created')
     .then((lease) => lease?.release?.())
     .catch((error) => console.warn('[agent-events] session observation failed:', error?.code ?? 'SERVICE_UNAVAILABLE'));
   } else {
    void globalMessageStreamHub.subscribeSession(sessionId)
     .catch((error) => console.warn('[agent-events] session observation failed:', error?.code ?? 'SERVICE_UNAVAILABLE'));
   }
  }
  // A new top-level session starts in the default permission mode; the runtime
  // never reaches back into existing sessions.
  if (event?.type === 'openchamber:session-created' && sessionId) {
   void permissionAutoAcceptRuntime?.applyDefaultMode(sessionId)
    .catch((error) => console.warn('[permission-auto-accept] failed to apply the default mode:', error?.message ?? error));
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
 writeSseEvent,
 getNotificationClients: () => uiNotificationClients,
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
 switchNotesTodosStorage: (...args) => projectContextRuntime.switchNotesTodosStorage(...args),
});
// Git asks the canonical project config for the personal worktree folder; it
// never reads OpenCode's JSONC configuration.
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

 const argv0 = typeof process.argv?.[0] === 'string' ? process.argv[0] : '';
 const argv1 = typeof process.argv?.[1] === 'string' ? process.argv[1] : '';
 return /openchamber-server/i.test(argv0) || /openchamber-server/i.test(argv1);
})();
configureAgentService(hostAgentRuntime.service, {
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
});



notificationTemplateRuntime = createNotificationTemplateRuntime({
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 readSettingsFromDisk,
});
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

let autoReviewRuntime = null;
let prWatchRuntime = null;
const notificationTriggerRuntime = createNotificationTriggerRuntime({
 openPushTagsStore: createPushTagsStore(path.join(OPENCHAMBER_DATA_DIR, 'push-tags.json')),
 clearApnsNotifications: apnsRuntime.clearApnsNotifications,
 isAnyUiVisible,
 readSettingsFromDisk,
 prepareNotificationLastMessage,
 buildTemplateVariables,
 extractLastMessageText,
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
 isInAutoReview: (sessionId, turnEndedAt) => autoReviewRuntime.speaksFor(sessionId, turnEndedAt),
});

clearPendingPushBadge = () => notificationTriggerRuntime.clearPendingPushBadge();

// Which sessions are subsessions: per-turn work skips them without reading.
const sessionLineage = createSessionLineage();

const sessionAssistRuntime = createSessionAssistRuntime({
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 lineage: sessionLineage,
 onTurnSettled: (sessionId) => {
  void globalMessageStreamHub.releaseSession(sessionId, 'run');
 },
});
/**
 * Owns what a session must be told about the project's knowledge. Every sender
 * asks it — the UI over HTTP, scheduled tasks and agent-dispatched sessions in
 * process — so the answer cannot differ between them.
 */
const sessionKnowledgeRuntime = createSessionKnowledgeRuntime({
 projectContextRuntime,
 resolveProjectId: (directory) => resolveProjectContextId(directory),
 readSessionMetadata: readStoredSessionMetadata,
 // Pins and the delivered-signature cursor are read from OpenChamber's own store.
 persistSessionMetadata: (sessionID, directory, patch) => persistSessionMetadataPatch(sessionID, patch, { directory }),
});

const contextObligatoryRuntime = createContextObligatoryRuntime({
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 sessionKnowledgeRuntime,
 readSessionMetadata: readStoredSessionMetadata,
 persistContextCursor: (sessionID, directory, patch) => persistSessionMetadataPatch(sessionID, patch, { directory }),
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
 isSessionArchived: (sessionID) => openChamberSessionService.archiveStore.isArchived(sessionID),
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
 isSessionArchived: (sessionID) => openChamberSessionService.archiveStore.isArchived(sessionID),
 insideSpace: Boolean(process.env.OPENCHAMBER_SPACE_IDLE_STOP_FILE),
});
extensionWaitsRuntime.start(globalMessageStreamHub);
const postSyntheticToSession = createSyntheticDelivery({ sessionService: openChamberSessionService });
const laterPagesRuntime = createLaterPages({
 dataDir: OPENCHAMBER_DATA_DIR,
 postSynthetic: postSyntheticToSession,
 broadcastUiEvent: broadcastOpenChamberUiEvent,
 readArchiveState: async (sessionID) => (await openChamberSessionService.archiveStore.isArchived(sessionID) ? 'archived' : 'active'),
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
 console.warn('[share-pages] failed to start:', error?.message ?? error);
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
// Jev model routing and the permission safety net. Every failure keeps the
// user's own model or the auto-accept reply it was asked about.
const routingRuntime = createRoutingRuntime({
 dataDir: OPENCHAMBER_DATA_DIR,
 service: hostAgentRuntime.service,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 resolveCredential,
 broadcastGlobalUiEvent: broadcastOpenChamberUiEvent,
});

// The authoritative per-session permission policy (`ask`, `safety`, `auto`).
// The Agent Service raises approval cards; this Host decides — before the card
// reaches the user — whether the request is answered for them, and only tool
// execution permissions ever pass through it.
const permissionAutoAcceptRuntime = createPermissionAutoAcceptRuntime({
 readSettingsFromDiskMigrated,
 persistSettings,
 broadcastGlobalUiEvent: broadcastOpenChamberUiEvent,
 evaluatePermission: (permission, directory) => routingRuntime.evaluatePermission(permission, directory),
 resolveLegacyEnabledMode: async () => ((await routingRuntime.legacySafetyNetEnabled()) ? 'safety' : 'auto'),
 resolveSessionParent: async (sessionId) => {
  try {
   const response = await hostAgentRuntime.service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`);
   // A failed lookup is unknown lineage, not a root: caching it would keep a
   // subagent from inheriting its parent after a transient error.
   if (!response.ok) return undefined;
   const parsed = RuntimeSessionSchema.safeParse(await response.json());
   if (!parsed.success) return undefined;
   const runtime = parsed.data;
   const parent = runtime.parentSessionId;
   return typeof parent === 'string' && parent && parent !== sessionId ? parent : null;
  } catch { return undefined; }
 },
 // The Agent Service owns approval CAS; the Host only tells it that the
 // authoritative mode changed, so approvals already waiting are reconsidered.
 onSessionPolicyChanged: async (sessionId, mode) => {
  try {
   await hostAgentRuntime.service.request(`/internal/sessions/${encodeURIComponent(sessionId)}/permission-mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
   });
  } catch (error) {
   console.warn('[permission-auto-accept] mode push failed:', error?.message ?? error);
  }
 },
});

// The service asks the Host about modes and safety verdicts over IPC; it must
// never default to an answering mode while this runtime is still unbuilt.
registerHostPermissionRuntime(permissionAutoAcceptRuntime);

// A request the policy held still needs the user, so only one that was
// actually answered automatically skips its permission notification.
notificationTriggerRuntime.setGetIsSessionAutoAccepting(
 (sessionId, scope, approvalId) => permissionAutoAcceptRuntime.isPermissionAutoAnswered(sessionId, approvalId, scope?.cwd),
);
// "In work": Jev opens a session when real work starts in it and hints when a
// turn looks like the end of it. The same turn-end call gates session assist.
const sessionWorkRuntime = createSessionWorkRuntime({
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 classifierEndpoint: (workspaceId) => routingRuntime.classifierEndpoint(workspaceId),
 jev: createJevClient(),
 readMetadata: (sessionID, directory) => sessionMetadataStore.get(sessionID, { directory }),
 updateMetadata: updateSessionMetadataWith,
 isSessionArchived: (sessionID) => openChamberSessionService.archiveStore.isArchived(sessionID),
 isWorktreePinned: isWorktreeDirectoryPinned,
 chatRoots: [path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'chats'), OPENCHAMBER_CHATS_DIR],
 lineage: sessionLineage,
});


// Queued follow-up messages are delivered by the server so a closed tab or a
// dropped connection no longer strands them.
const messageQueueRuntime = createCanonicalQueueRuntime({
 store: promptQueueStore,
 service: hostAgentRuntime.service,
 ensureSessionObserved: async (scope) => globalMessageStreamHub.subscribeSession(scope.sessionId),
 resolveAttachments,
 capturePrompt: (...args) => hostPromptDeliveryRuntime.capturePrompt(...args),
 beforeDispatch: (scope, capture) => hostPromptDeliveryRuntime.beforeDispatch(scope, capture.request),
 onPromptAccepted: (scope, capture) => hostPromptDeliveryRuntime.onPromptAccepted(scope, capture.request, { runId: capture.runId }),
 onScheduledTaskResult: (...args) => scheduledTasksRuntime.onScheduledTaskResult(...args),
 publishQueue: (properties) => broadcastOpenChamberUiEvent({ type: 'openchamber:message-queue.updated', properties }),
 reportFailure: ({ sessionId, code }) => {
  const properties = { code };
  if (sessionId) properties.sessionId = sessionId;
  broadcastOpenChamberUiEvent({ type: 'openchamber:message-queue.failed', properties });
 },
});

// Sessions an agent dispatched with `returnResult` report back to it: their
// final answer lands in the dispatching session and wakes it.
const dispatchResultsRuntime = createDispatchResultsRuntime({
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 dataDir: OPENCHAMBER_DATA_DIR,
 // Declared further down; only ever called after startup.
 isSessionArchived: (sessionID) => openChamberSessionService.archiveStore.isArchived(sessionID),
});
dispatchResultsRuntime.start();

// Agent workflows: scripts that fan a task out to many agents, run here while
// the agent that asked stays free. Absent entirely unless OPENCHAMBER_WORKFLOWS_ENABLE
// is set, the same gate as upstream.
const workflowsModule = createWorkflowsModule({
 sessionService: openChamberSessionService,
 resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
 listWorkspaceScopes,
 dataDir: OPENCHAMBER_DATA_DIR,
 fsPromises,
 path,
 broadcast: (event) => broadcastOpenChamberUiEvent(event),
});

// Full-text search over this server's conversations (user messages and agent
// replies). Off means idle. The index is derived
// data in the data dir, fed from the same event stream; see lib/message-search.
const messageSearchRuntime = createMessageSearchRuntime({
 dataDir: OPENCHAMBER_DATA_DIR,
 sessionService: openChamberSessionService,
 resolveSessionScope: hostAgentRuntime.resolveSessionScope,
 readArchiveStates: () => openChamberSessionService.archiveStore.listAll(),
 globalEventHub: globalMessageStreamHub,
 readSettings: async () => {
  const settings = await readSettingsFromDisk();
  return { enabled: settings.messageSearchEnabled !== false, reasoning: settings.messageSearchReasoningEnabled === true };
 },
});


// Turn lengths come from the canonical run events the Hub always holds, so
// the sidebar can show how long a turn took on any device, not only in the
// page that watched it run.
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
 sessionAssistRuntime.processCanonicalEvent(event, scope);
 sessionWorkRuntime.processCanonicalEvent(event, scope);
 contextObligatoryRuntime.processCanonicalEvent(event, scope);
 linearSessionStatusRuntime.processCanonicalEvent(event, scope);
 await dispatchResultsRuntime.processCanonicalEvent(event, scope);
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
 return sanitizeProjects(settings?.projects || []);
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
 __dirname,
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
 // uiAuthController is created at startup, after this runtime: read it per request.
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
 TUNNEL_MODE_QUICK,
 TUNNEL_MODE_MANAGED_LOCAL,
 TUNNEL_MODE_MANAGED_REMOTE,
 TUNNEL_PROVIDER_CLOUDFLARE,
 TunnelServiceError,
 getActiveTunnelController: () => activeTunnelController,
 setActiveTunnelController: (value) => {
  activeTunnelController = value;
 },
 getRuntimeManagedRemoteTunnelHostname: () => runtimeManagedRemoteTunnelHostname,
 setRuntimeManagedRemoteTunnelHostname: (value) => {
  runtimeManagedRemoteTunnelHostname = value;
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
 isSessionArchived: (sessionID) => openChamberSessionService.archiveStore.isArchived(sessionID),
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
  const project = sanitizeProjects(settings?.projects || []).find((entry) => entry.id === projectID) ?? null;
  return resolveSessionDefaults({ settings, project });
 },
 readDefaultGoalTokenBudget: async () => {
  const settings = await readSettingsFromDiskMigrated();
  return settings?.sessionGoalDefaultBudgetEnabled === true ? settings.sessionGoalDefaultBudget ?? null : null;
 },
 listProjects: async () => {
  const settings = await readSettingsFromDiskMigrated();
  return sanitizeProjects(settings?.projects || []);
 },
 setSessionAutoAccept: (sessionId, enabled, directory) => permissionAutoAcceptRuntime.setSessionPolicy(sessionId, enabled ? 'auto' : 'ask', directory),
 emitTaskRunEvent: (event) => {
  for (const client of uiOpenChamberEventClients) {
   try {
    writeSseEvent(client, {
     type: 'openchamber:scheduled-task-ran',
     properties: {
      projectId: scheduledChatsScope.toPublicID(event.projectID),
      taskId: event.taskID,
      ranAt: event.ranAt,
      status: event.status,
      ...(event.sessionID ? { sessionId: event.sessionID } : {}),
     },
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
 // Behavior text is opt-in; the source resolves to an empty list when the
 // profile sets no rules and no non-default response style.
 behaviorPromptSource: createBehaviorPromptSource({
  fsModule: fs,
  pathModule: path,
  settingsFilePath: SETTINGS_FILE_PATH,
  readMergedSettings: readMergedSettingsSync,
 }),
});
const convertLegacyQueue = async () => {
 const result = await promptQueueStore.convertLegacy({
  resolveScope: async (sessionId, directory) => {
   const scope = await hostAgentRuntime.resolveHostSessionScope(sessionId);
   if (!scope || await fsPromises.realpath(directory) !== scope.cwd) {
    throw new OpenChamberControlError('Legacy queue session scope is unavailable', 404);
   }
   return { sessionId: scope.sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId };
  },
  importAttachment: importLegacyAttachment,
  resolveScheduledTask: async (queuedScope, hint) => {
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
 sanitizeProjects,
 projectConfigRuntime,
 scheduledTasksRuntime,
 resolveWorkspaceScope: agentScopeRuntime.resolveWorkspaceScope,
 chatsScope: scheduledChatsScope,
});
// Browser actions are published to whichever OpenChamber clients are connected;
// the one owning the browser panel answers. `emitRequest` returns the number of
// clients reached so the broker can fail fast when nobody is listening.
const browserControlBroker = createBrowserControlBroker({
 createId: () => `browser-${crypto.randomUUID()}`,
 emitRequest: (request) => {
  // Opening a page only needs a panel to open it in; everything else needs a
  // client that can actually drive one. Counting the right clients is what
  // lets the broker say "not here" instead of timing out.
  const needsBrowserView = request.action !== 'browser.open';
  let delivered = 0;
  for (const client of uiOpenChamberEventClients) {
   if (needsBrowserView && client.openchamberBrowserCapable !== true) continue;
   try {
    writeSseEvent(client, {
     type: 'openchamber:browser-control-request',
     properties: {
      requestId: request.requestId,
      action: request.action,
      parameters: request.parameters,
      context: request.context,
     },
    });
    delivered += 1;
   } catch {
    uiOpenChamberEventClients.delete(client);
   }
  }
  return delivered;
 },
});

/**
 * Tells every client the selected browser provider was dropped back to the
 * in-app browser, so Settings shows the change and the user hears why.
 */
const emitBrowserProviderResetEvent = ({ guestId, guestName }) => {
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
// Every browser action passes through here: the in-app view by default, or an
// extension service chosen in Settings → OpenChamber Tools.
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

// "Show this file" reaches every connected client; the ones showing that
// project open it. Nothing comes back, so the count of clients reached is the
// only signal the agent gets.
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
 // The tool is off by default; a plugin generated before it was switched off
 // must not keep paging the user.
 notifyUser: async (input) => {
  const settings = await readSettingsFromDiskMigrated().catch(() => null);
  if (settings?.agentNotifyToolEnabled !== true) {
   return { status: 403, body: { error: 'The notify tool is turned off in OhPiChamber settings' } };
  }
  return pluginNotificationEmitter.emit(input);
 },
 projectContextRuntime,
 // The resolver session knowledge reads pinned notes and plans through, so
 // what an agent writes is what the next session is given.
 resolveProjectContextId,
 // On by default: the knowledge tool is the canonical owner of notes, todos
 // and plans, and a client must not keep writing after it is switched off.
 isKnowledgeToolEnabled: async () => {
  const settings = await readSettingsFromDiskMigrated().catch(() => null);
  return settings?.agentKnowledgeToolEnabled !== false;
 },
 // Like file.open: every connected window hears it, and the ones showing
 // that project open the plan.
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
  const queue = await promptQueueStore.getState({ sessionId, projectId: scope.projectId, workspaceId: scope.workspaceId });
  return queue.items.length > 0;
 },
 dispatchResults: dispatchResultsRuntime,
 prWatch: prWatchRuntime,
 extensionWaits: extensionWaitsRuntime,
 laterPages: process.env.OPENCHAMBER_SPACE_IDLE_STOP_FILE ? null : laterPagesRuntime,
 sharePages: sharePagesRuntime,
 archiveStore: openChamberSessionService.archiveStore,
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
 // Reads are cold: boot must not start a worker for every persisted session.
 // Live observation starts when a session publishes its first event.
};
const startAgentService = async () => {
 await hostAgentRuntime.start();
 if (isShuttingDown) return hostAgentRuntime.service.getState();
 await ensureGlobalWatcherStarted();
 void workflowsModule.deliverPending?.();
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

const gracefulShutdown = (...args) => {
 featureRoutesRuntime.dispose();
 return gracefulShutdownRuntime.gracefulShutdown(...args);
};

async function main(options = {}) {
 await hostSessionState.initialize();
 await agentScopeRuntime.initialize();
 beginGuestServiceHost();
 // Again at start: the desktop shell merges the login shell's environment,
 // where proxy variables often live, after this module first loaded.
 applyOutboundProxyFromEnv();
 const port = Number.isFinite(options.port) && options.port >= 0 ? Math.trunc(options.port) : DEFAULT_PORT;
 const host = typeof options.host === 'string' && options.host.length > 0 ? options.host : undefined;
 const effectiveBindHost = host
  || (typeof process.env.OPENCHAMBER_HOST === 'string' && process.env.OPENCHAMBER_HOST.trim().length > 0
   ? process.env.OPENCHAMBER_HOST.trim()
   : '127.0.0.1');
 await ensureChatsDir({ fsPromises, chatsDir: OPENCHAMBER_CHATS_DIR, warn: (message) => console.warn(`[data-dir] ${message}`) });

 // Pairing transports advertised to the create-device dialog. LAN reachability is
 // derived from the SERVER's actual bind (a wildcard bind → the machine's LAN IP;
 // a specific non-loopback host → that host), NOT from how the UI was opened — so
 // "Local network" works even when the UI is opened on localhost, and is absent
 // when the server is only bound to loopback (a LAN link would not connect).
 // The IPv4 the requesting client actually reached this server on (if any).
 // Strips the IPv6-mapped prefix; loopback means "not a LAN path".
 const requestReachedLanAddress = (req) => {
  const raw = typeof req?.socket?.localAddress === 'string' ? req.socket.localAddress : '';
  const address = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return null;
  if (address.startsWith('127.')) return null;
  return address;
 };
 const advertisedLanUrl = readAdvertisedLanUrl();
 const resolvePairingTransports = async (req) => {
  const activePort = tunnelRuntimeContext.getActivePort() || port;
  const local = `http://127.0.0.1:${activePort}`;
  const relayAvailable = !relayBlockedByEnterprise()
   && (relayServiceInstance ? await relayServiceInstance.isConfigured() : pinnedRelayUrl() !== null);
  if (advertisedLanUrl) {
   return { local, lan: advertisedLanUrl, relayAvailable };
  }
  let lanHost = null;
  if (isNetworkExposedBindHost(effectiveBindHost)) {
   // Prefer the address the client is ALREADY talking to us on — it is the
   // one interface guaranteed to be routable from that client's network.
   // Interface scanning is only a fallback: on servers with virtual bridges
   // (docker0 etc.) the first non-internal IPv4 can be an address no other
   // machine can reach, which produced pairing links whose LAN candidate
   // silently failed and forced devices onto the relay.
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
 // ALL direct LAN URLs this server is currently reachable on, for the
 // candidates-refresh endpoint: the address the requesting client already
 // reached us on first (guaranteed routable from its network — over the relay
 // tunnel this is loopback and yields nothing), then every non-internal IPv4
 // interface. A client that paired while the machine had a different DHCP
 // lease uses this to replace its stale LAN candidate.
 const resolveDirectLanUrls = (req) => {
  if (advertisedLanUrl) return [advertisedLanUrl];
  const activePort = tunnelRuntimeContext.getActivePort() || port;
  const urls = [];
  const push = (host) => {
   if (typeof host !== 'string' || !host) return;
   const url = `http://${host.includes(':') ? `[${host}]` : host}:${activePort}`;
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
    // interface scan failure → whatever we already collected
   }
  } else {
   const h = String(effectiveBindHost || '').toLowerCase();
   if (h && h !== '127.0.0.1' && h !== 'localhost' && h !== '::1') push(effectiveBindHost);
  }
  return urls;
 };
 const uiPassword = typeof options.uiPassword === 'string'
  ? options.uiPassword
  : (typeof process.env.OPENCHAMBER_UI_PASSWORD === 'string' ? process.env.OPENCHAMBER_UI_PASSWORD : null);
 if (
  isNetworkExposedBindHost(effectiveBindHost)
  && !(typeof uiPassword === 'string' && uiPassword.trim().length > 0)
  && !isUnsafeUnauthenticatedLanAllowed(process.env)
 ) {
  throw new Error(getUnauthenticatedLanErrorMessage(effectiveBindHost));
 }
 // Enterprise mode keeps the server on this machine unless the administrator
 // allowed network access. The server is a package anyone can install, so
 // this holds for the CLI and --host as much as for the desktop toggle.
 if (isNetworkExposedBindHost(effectiveBindHost) && isNetworkAccessBlocked()) {
  throw new Error(NETWORK_ACCESS_BLOCKED_ERROR);
 }
 const tryCfTunnel = options.tryCfTunnel === true;
 const apiOnly = options.apiOnly === true || isEnvFlagEnabled(process.env.OPENCHAMBER_API_ONLY);
 const shouldUseCanonicalTunnelConfig = typeof options.tunnelMode === 'string'
  || typeof options.tunnelProvider === 'string'
  || options.tunnelConfigPath === null
  || typeof options.tunnelConfigPath === 'string'
  || typeof options.tunnelToken === 'string'
  || typeof options.tunnelHostname === 'string';
 const startupTunnelRequest = shouldUseCanonicalTunnelConfig
  ? normalizeTunnelStartRequest({
   provider: normalizeTunnelProvider(options.tunnelProvider),
   mode: options.tunnelMode,
   configPath: normalizeOptionalPath(options.tunnelConfigPath),
   token: typeof options.tunnelToken === 'string' ? options.tunnelToken.trim() : '',
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
 const onTunnelReady = typeof options.onTunnelReady === 'function' ? options.onTunnelReady : null;
 if (typeof options.exitOnShutdown === 'boolean') {
  exitOnShutdown = options.exitOnShutdown;
 }
 if (typeof options.onDesktopNotification === 'function') {
  notificationEmitterRuntime.setOnDesktopNotification(options.onDesktopNotification);
 }
 if (typeof options.getIsWindowFocused === 'function') {
  notificationTriggerRuntime.setGetIsWindowFocused(options.getIsWindowFocused);
 }
 const getDesktopRuntimeConfig = typeof options.getDesktopRuntimeConfig === 'function'
  ? options.getDesktopRuntimeConfig
  : null;

 console.log(`Starting OhPiChamber on port ${port === 0 ? 'auto' : port}`);

 // Voice enumeration is independent from route registration and Agent Service startup.
 const sayTTSCapability = detectSayTtsCapability(process);

 // Native archive bytes and metadata are owned by the Agent Service; Host scope is selected here.
 spaceArchive = createSpaceArchive({
  dataDir: OPENCHAMBER_DATA_DIR,
  nativeArchive: {
   importChat: async ({ sessionId, bundlePath, directory, spaceId, archivedAt, deadline }) => {
    const remainingMs = Math.min(CHAT_EXPORT_TIMEOUT_MS, deadline - Date.now());
    if (remainingMs <= 0) throw Object.assign(new Error('Native archive import deadline expired'), { code: 'chat_export_timed_out' });
    const scope = await agentScopeRuntime.archiveScope(spaceId, directory);
    const response = await hostAgentRuntime.service.request('/internal/archive/import', {
     method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' },
     body: JSON.stringify({ sessionId, bundlePath, destinationDirectory: directory, spaceId, archivedAt, scope }),
     signal: AbortSignal.timeout(remainingMs),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw Object.assign(new Error(body?.detail ?? 'Native archive import failed'), { status: response.status, code: body?.code });
    try {
     if (body?.imported !== true || body.sessionId !== sessionId || body.session?.sessionId !== sessionId
      || body.session.rootSessionId !== sessionId || body.session.projectId !== scope.projectId || body.session.workspaceId !== scope.workspaceId)
      throw new Error('Native archive import acknowledgement does not match its Host-selected scope');
     await agentScopeRuntime.registerArchiveSession(body.session, body.children ?? [], scope);
    }
    catch (error) {
     await hostAgentRuntime.service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => { });
     await agentScopeStore.removeSessionFamily(sessionId).catch(() => { });
     throw error;
    }
    return body;
   },
   removeChat: async (sessionId) => {
    const response = await hostAgentRuntime.service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Native archive rollback could not remove an imported session');
   },
  },
 });

 // The isolated-spaces switch, read here at start and changed live through its route below.
 // While it is off the feature has no place, no manager, no route and runs no `docker`.
 const buildSpacesHost = () => createSpacesHost({
  dataDir: OPENCHAMBER_DATA_DIR,
  dockerPath: serverUtilsRuntime.searchPathFor('docker', serverUtilsRuntime.buildAugmentedPath()) ?? 'docker',
  colimaPath: serverUtilsRuntime.searchPathFor('colima', serverUtilsRuntime.buildAugmentedPath()),
  gitPath: serverUtilsRuntime.searchPathFor('git', serverUtilsRuntime.buildAugmentedPath()) ?? 'git',
  hostEnvironment: { ...process.env, PATH: serverUtilsRuntime.buildAugmentedPath() },
  // So the session list can say which registered project each space was made for.
  listProjectDirectories: async () => {
   const settings = await readSettingsFromDiskMigrated();
   return sanitizeProjects(settings?.projects || []).map((project) => project.path);
  },
  readIdleStop: async () => readIdleStopSetting((await readSettingsFromDiskMigrated())?.isolatedSpacesIdleStop),
  saveIdleStop: (setting) => persistSettings({ isolatedSpacesIdleStop: setting }),
  archive: spaceArchive,
 });
 const startupSettings = await readSettingsFromDiskMigrated().catch(() => null);
 if (spacesHostEnabled(startupSettings)) {
  try {
   spacesHost = buildSpacesHost();
  } catch (error) {
   // The feature is absent then, and the rest of the server starts as with the switch off.
   console.error(`[spaces] isolated spaces are unavailable this start: ${error?.code ?? ''} ${error?.message ?? error}`.trim());
   spacesHost = null;
  }
 } else if (startupSettings?.isolatedSpacesEnabled === true) {
  // The saved switch cannot bring the feature up while the server gate is closed.
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
 // Keeps other sites from framing the app (clickjacking). Routes that serve
 // untrusted documents set a Content-Security-Policy of their own, which
 // replaces this one.
 const frameAncestorsPolicy = buildFrameAncestorsPolicy({
  allowLocalDevOrigins,
  extra: process.env.OPENCHAMBER_FRAME_ANCESTORS,
 });
 // Forwarded headers are believed only from a proxy on this machine or a
 // private network (cloudflared, Docker, a LAN reverse proxy). From anyone
 // else they are the client's own words, and the login rate limit keys on
 // req.ip, so a client must not be able to name its own address.
 app.set('trust proxy', 'loopback, linklocal, uniquelocal');
 // Keep self-hosted instances out of search engines. The app shell is served
 // publicly (it loads before prompting for the UI password), so without this
 // even a password-protected instance gets crawled and indexed. Applies to
 // every response; the robots.txt route makes the intent explicit for crawlers.
 app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  // The preview proxy relays a dev server's own pages, whose types and
  // referrer behaviour are that app's business. Everything else is ours:
  // served with real types, and its address (a tunnel host, short-lived
  // auth tokens, session ids) never follows a link out as a Referer.
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
  const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
  if (packagedClientOrigins.has(origin) || (allowLocalDevOrigins && isLocalDevClientOrigin(origin))) {
   res.setHeader('Access-Control-Allow-Origin', origin);
   res.setHeader('Access-Control-Allow-Credentials', 'true');
   res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
   // The packaged desktop UI (openchamber-ui://) and the dev UI sit on a
   // different origin, so every custom request header must be listed here or
   // the browser refuses the request at preflight, before it reaches a route.
   // Last-Event-ID is sent when a session event stream resumes; without it
   // the packaged UI's preflight fails, the stream cannot recover, and the
   // directory's authoritative session status is invalidated to unavailable.
   res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept,X-Requested-With,Cache-Control,Last-Event-ID,X-OhPiChamber-Directory,X-OhPiChamber-Directory-Encoding,Ngrok-Skip-Browser-Warning,X-OhPiChamber-Surface,X-OhPiChamber-Provider,X-OhPiChamber-Model');
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
 expressApp = app;
 server = http.createServer(app);
 gracefulShutdownRuntime.trackServerConnections(server);
 // A policy placed while the server runs cannot rebind it, so connections
 // from other machines are dropped until the next start binds loopback.
 if (isNetworkExposedBindHost(effectiveBindHost)) {
  server.on('connection', (socket) => {
   if (!isLoopbackBindHost(socket.remoteAddress ?? '') && isNetworkAccessBlocked()) socket.destroy();
  });
 }
 // Same pattern for the tunnel runtime: created after the base routes so
 // /api/system/info resolves port + tunnel URL lazily at request time.
 let tunnelRuntimeContextHolder = null;

 const bootstrapResult = bootstrapRuntime.setupBaseRoutes(app, {
  process,
  openchamberVersion: OPENCHAMBER_VERSION,
  runtimeName: process.env.OPENCHAMBER_RUNTIME || 'web',
  serverStartedAt,
  getHealthSnapshot: () => ({
   agentService: hostAgentRuntime.service.getState(),
   desktopNotifyEnabled: ENV_DESKTOP_NOTIFY,
   planModeExperimentalEnabled: PLAN_MODE_EXPERIMENT_ENABLED,
   apiOnly,
  }),
  // Port this instance serves on and the active tunnel's public URL (if
  // any), for /api/system/info. Resolved lazily because the tunnel runtime
  // is created after these base routes are registered.
  getServerPort: () => {
   const activePort = tunnelRuntimeContextHolder?.getActivePort?.();
   if (Number.isFinite(activePort) && activePort > 0) return activePort;
   return Number.isFinite(port) && port > 0 ? port : null;
  },
  getTunnelUrl: () => tunnelRuntimeContextHolder?.tunnelService?.getPublicUrl?.() ?? null,
  verboseRequestLogs: OPENCHAMBER_VERBOSE_REQUEST_LOGS,
  uiPassword,
  tunnelAuthController,
  remoteClientAuthRuntime,
  clientPairingRuntime,
  getRelayPairingCandidate: (options) => {
   if (!relayServiceInstance) return null;
   // A relay pairing link enables the relay on demand; a plain link only
   // advertises relay when it is already on.
   return options?.ensureEnabled
    ? relayServiceInstance.ensureEnabledForPairing()
    : relayServiceInstance.getPairingCandidate();
  },
  // Re-evaluate the relay lifecycle after pairing/device changes (a revoked or
  // redeemed device can flip relay demand on or off).
  reconcileRelay: () => (relayServiceInstance ? relayServiceInstance.reconcile() : Promise.resolve()),
  removeClientPushDevices: clientPushAccess.removeDevicesOfClients,
  getPairingTransports: resolvePairingTransports,
  getDirectCandidateUrls: resolveDirectLanUrls,
  // Stable server identity for client-side verification of learned addresses.
  // Lazily resolved: the relay service is constructed after these routes.
  getServerId: () => (relayServiceInstance ? relayServiceInstance.getServerId() : Promise.resolve(null)),
  // The display name a paired device shows for THIS server. Devices name the
  // connection by the issuing machine's hostname, not the per-device pairing
  // label typed by the operator.
  getServerLabel: () => {
   try {
    const name = os.hostname();
    return typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'OhPiChamber';
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
   queueRoutes: (router) => registerCanonicalQueueRoutes(router, messageQueueRuntime, {
    resolveSessionScope: hostAgentRuntime.resolveHostSessionScope,
   }),
   sessionRoutes: (router) => registerCanonicalSessionRoutes(router, openChamberSessionService),
   attachmentRoutes: (router) => router.use(createAttachmentRoutes({
    express, store: attachmentStore, resolveWorkspaceScope: agentScopeRuntime.resolveWorkspaceScope,
   })),
   globalEventHub: globalMessageStreamHub,
   resolveHostTools,
  },
  ensurePushInitialized,
  ensureGlobalWatcherStarted,
  getOrCreateVapidKeys,
  getUiSessionTokenFromRequest,
  writeSettingsToDisk,
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
 const forwardNativeArchive = async (pathname, res, accept) => {
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
 app.get('/api/openchamber/space/archive/sessions/:id', (req, res) => forwardNativeArchive(`/internal/archive/sessions/${encodeURIComponent(req.params.id)}`, res, 'application/x-tar'));
 // After the API auth gate, before every route that reads a directory.
 // The slot is mounted once and reads the host at call time, so the switch can turn the feature
 // on and off live: with no host it passes every request on and no upgrade is taken.
 // An archived chat of a deleted space is read and deleted, never run or changed.
 app.use(spaceArchive.guard);
 app.use((req, res, next) => (spacesHost ? spacesHost.middleware(req, res, next) : next()));
 server.on('upgrade', (...args) => { spacesHost?.upgradeHandler(...args); });
 const startSpacesHost = (host) => {
  host.prepareUpgrades({ uiAuthController, isRequestOriginAllowed });
  // The journey's progress events enter the host's hub, and a start cut short leaves the
  // grants of its running spaces to be said again.
  host.start(globalMessageStreamHub);
 };
 if (spacesHost) startSpacesHost(spacesHost);
 const spacesSwitch = createSwitchController({
  getHost: () => spacesHost,
  setHost: (host) => { spacesHost = host; },
  buildHost: buildSpacesHost,
  startHost: startSpacesHost,
  persist: (enabled) => persistSettings({ isolatedSpacesEnabled: enabled }),
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

 // Private relay host service: config + management routes + host client
 // lifecycle. Loopback port comes from the same source the tunnel uses so
 // relay-tunneled requests hit the local Express app on 127.0.0.1.
 const relayService = createRelayService({
  crypto,
  os,
  readSettingsFromDiskMigrated,
  writeSettingsToDisk,
  relayKeyStore,
  remoteClientAuthRuntime,
  onShareState: (shareId) => {
   void sharePagesRuntime.handleShareState(shareId).catch(() => undefined);
  },
  getLocalPort: () => tunnelRuntimeContext.getActivePort(),
  // One relay host per machine: every instance sharing this data dir shares
  // the relay identity (serverId), so concurrent hosts evict each other at
  // the relay worker and devices land on a random local instance.
  hostLock: createRelayHostLock({
   lockFilePath: path.join(OPENCHAMBER_DATA_DIR, 'relay-host.lock'),
   fs,
   process,
  }),
  // Dev/debug instances share the data dir (and thus the relay identity) with
  // the production instance, so they must not host the relay on their own —
  // paired devices would land on them. OPENCHAMBER_RELAY_HOST=off disables
  // passive hosting explicitly (dev scripts set it); the Electron dev shell is
  // covered via OPENCHAMBER_ELECTRON_DEV. OPENCHAMBER_RELAY_HOST=on overrides
  // both. Explicit enable/pairing on the instance still hosts regardless.
  allowPassiveHost: process.env.OPENCHAMBER_RELAY_HOST === 'on'
   || (process.env.OPENCHAMBER_RELAY_HOST !== 'off' && process.env.OPENCHAMBER_ELECTRON_DEV !== '1'),
  // Relay demand = any paired device or pending pairing session that uses the
  // relay transport. Drives the auto on/off lifecycle.
  hasRelayDemand: async () => {
   // A store read failure must NOT masquerade as "no demand": reconcile
   // persists enabled=false and severs paired devices. Any affirmative
   // answer wins; otherwise a failed check aborts reconcile (throw) so the
   // relay keeps its current state until a trustworthy read succeeds.
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
 relayService.registerRoutes(app);

 registerBrowserControlRoutes(app, { express, broker: browserControlBroker });
 registerUploadRoute(app, { store: browserUploads });

 // One scanner backs both discovery and the tunnel allowlist, so a port the
 // user can see is exactly a port the tunnel will dial.
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
  persistSettings,
  onSettingsUpdated: async (settings) => {
   try {
    const tools = {
     openchamber: settings?.agentControlToolEnabled !== false,
     web: settings?.agentWebToolEnabled !== false,
     openchamber_knowledge: settings?.agentKnowledgeToolEnabled !== false,
     notify: settings?.agentNotifyToolEnabled === true,
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
    // ignore if service not ready
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
  persistResolvedSettings: (...args) => settingsRuntime.persistResolvedSettings(...args),
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
   return browserControlRouter.handleGuestDeactivated(event);
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
  sanitizeSkillCatalogs,
  getActivePort: () => {
   const address = server?.address?.();
   return address && Number.isInteger(address.port) ? address.port : null;
  },
  // A pipe listener reports a string here, which has no address to bind back to.
  getActiveHost: () => server?.address?.()?.address ?? null,
  devServerScanner,
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
  isExecutable: (filePath) => serverUtilsRuntime.isExecutable(filePath),
  isRequestOriginAllowed,
  rejectWebSocketUpgrade,
  globalEventHub: globalMessageStreamHub,
  messageStreamWsClients: uiNotificationWsClients,
  terminalHeartbeatIntervalMs: TERMINAL_INPUT_WS_HEARTBEAT_INTERVAL_MS,
  terminalRebindWindowMs: TERMINAL_INPUT_WS_REBIND_WINDOW_MS,
  terminalMaxRebindsPerWindow: TERMINAL_INPUT_WS_MAX_REBINDS_PER_WINDOW,
  environmentRuntime,
  // The terminal panel is authoritative on the Host: a session opened, closed
  // or killed here (from another window or a project action) invalidates every
  // open panel through the same SSE stream the rest of the UI listens to.
  broadcastUiEvent: (event) => {
   for (const client of uiOpenChamberEventClients) {
    try {
     writeSseEvent(client, event);
    } catch {
     uiOpenChamberEventClients.delete(client);
    }
   }
  },
  startAgentService: () => startAgentService().catch((error) => {
   console.error('Agent Service startup failed:', error instanceof Error ? error.message : String(error));
  }),
  // Publish Git's credential-helper endpoint after the Host port is known
  // and before the Agent Service starts shells that may use it.
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


 // Only opens a relay control socket when the user opted in (config enabled).
 // Reconcile the relay lifecycle from demand on startup: run it if any relay
 // device/session exists, stop it (and clear a stale enabled flag) otherwise.
 void relayService.reconcile();

 // Relay demand can change outside our routes: `ohpichamber connect-url
 // --relay` writes a pending relay session straight to the on-disk store, and
 // pending sessions expire without any request hitting us. Poll reconcile so a
 // headless instance picks the relay up (or drops it) within a minute.
 relayReconcileTimer = setInterval(() => {
  void relayService.reconcile();
 }, 60_000);
 relayReconcileTimer.unref?.();

 // The server inside an isolated space stops itself after the user's idle hours, and the space's
 // container with it (DESIGN.md, decision 11). Only a space's environment names the setting's
 // file, so this never runs anywhere else. The exit code tells the host why it stopped.
 const spaceIdleStopFile = process.env.OPENCHAMBER_SPACE_IDLE_STOP_FILE;
 if (spaceIdleStopFile) {
  startIdleStop({
   settingsPath: spaceIdleStopFile,
   readSessionStates: () => sessionRuntime.getSessionStateSnapshot(),
   readPendingRequests: () => sessionRuntime.getPendingBlockingRequestsSnapshot(),
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
