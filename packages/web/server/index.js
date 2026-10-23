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
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { createUiAuth } from './lib/ui-auth/ui-auth.js';
import { createTunnelAuth } from './lib/host/tunnel-auth.js';
import { createManagedTunnelConfigRuntime } from './lib/tunnels/managed-config.js';
import { createTunnelProviderRegistry } from './lib/tunnels/registry.js';
import { createCloudflareTunnelProvider } from './lib/tunnels/providers/cloudflare.js';
import { createNgrokTunnelProvider } from './lib/tunnels/providers/ngrok.js';
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
import { createProjectDirectoryRuntime } from './lib/host/project-directory-runtime.js';
import { createSettingsNormalizationRuntime } from './lib/host/settings-normalization-runtime.js';
import { createSettingsHelpers } from './lib/host/settings-helpers.js';
import { createThemeRuntime } from './lib/host/theme-runtime.js';
import { parseServeCliOptions } from './lib/host/cli-options.js';
import {
  isRequestAuthorized,
  registerAuthAndAccessRoutes,
  registerCommonRequestMiddleware,
  registerServerStatusRoutes,
} from './lib/host/core-routes.js';
import { registerOpenChamberRoutes } from './lib/host/openchamber-routes.js';
import { createStaticRoutesRuntime } from './lib/host/static-routes-runtime.js';
import { listPwaSessions } from './lib/host/pwa-session-shortcuts.js';
import { createSettingsRuntime } from './lib/host/settings-runtime.js';
import { registerSettingsRoutes } from './lib/host/settings-routes.js';
import { createSessionRuntime } from './lib/host/session-runtime.js';
import { createServerUtilsRuntime } from './lib/host/server-utils-runtime.js';
import { createFeatureRoutesRuntime } from './lib/host/feature-routes-runtime.js';
import { createBootstrapRuntime } from './lib/host/bootstrap-runtime.js';
import { createGracefulShutdownRuntime } from './lib/host/shutdown-runtime.js';
import { runCliEntryIfMain } from './lib/host/cli-entry-runtime.js';
import { configureAgentService } from './lib/small-model/client.js';
import { createSessionAssistRuntime } from './lib/session-assist/runtime.js';
import { createSessionGoalRuntime } from './lib/session-goal/runtime.js';
import { createContextObligatoryRuntime } from './lib/context-obligatory/runtime.js';
import { createLinearSessionStatusRuntime } from './lib/linear/status-runtime.js';
import { createSessionKnowledgeRuntime } from './lib/session-knowledge/runtime.js';
import { createMessageSearchRuntime } from './lib/message-search/runtime.js';
import { createScheduledTasksRuntime } from './lib/scheduled-tasks/runtime.js';
import { resolveSessionDefaults } from './lib/scheduled-tasks/session-defaults.js';
import { createScheduledTaskContext } from './lib/scheduled-tasks/existing-session.js';
import { createChatsScope } from './lib/scheduled-tasks/chats-scope.js';
import { createServerStartupRuntime } from './lib/host/server-startup-runtime.js';
import { createTunnelWiringRuntime } from './lib/host/tunnel-wiring-runtime.js';
import { createStartupPipelineRuntime } from './lib/host/startup-pipeline-runtime.js';
import { registerNotificationRoutes } from './lib/notifications/routes.js';
import { createNotificationEmitterRuntime } from './lib/notifications/emitter-runtime.js';
import { createNotificationTriggerRuntime } from './lib/notifications/runtime.js';
import { createPushRuntime } from './lib/notifications/push-runtime.js';
import { createApnsRuntime } from './lib/notifications/apns-runtime.js';
import { createNotificationTemplateRuntime } from './lib/notifications/template-runtime.js';
import { createPermissionAutoAcceptRuntime } from './lib/permission-auto-accept/runtime.js';
import { createCanonicalQueueRuntime, createPromptQueueStore, registerCanonicalQueueRoutes } from './lib/message-queue/runtime.js';
import { createDispatchResultsRuntime } from './lib/dispatch-results/runtime.js';
import { createRoutingRuntime } from './lib/routing/runtime.js';
import { createJevClient } from './lib/routing/jev.js';
import { createSessionWorkRuntime } from './lib/session-work/runtime.js';
import { createSessionLineage } from './lib/session-lineage.js';
import { beginGuestServiceHost, beginGuestServiceShutdown, stopAllGuestServices } from './lib/guests/service.js';
import { findInstalledGuest } from './lib/guests/catalog.js';
import { extensionsPersistPath } from './lib/guests/persist.js';
import { createGuestSurfaceRuntime } from './lib/guests/surface.js';
import { BROWSER_PROVIDER_IDLE_MS } from '@openchamber/sdk';
import { createProjectConfigRuntime } from './lib/projects/project-config.js';
import { ensureChatsDir, migrateLegacyUserDirs } from './lib/data-dir-migration.js';
import { createProjectContextRuntime } from './lib/project-context/runtime.js';
import { createAgentMemoryRuntime } from './lib/agent-memory/runtime.js';
import { createAgentMemoryActions } from './lib/agent-memory/actions.js';
import { createMemoryProjectResolver } from './lib/agent-memory/project-resolution.js';
import { isAgentMemoryFeatureAvailable } from './lib/agent-memory/feature-flag.js';
import { createSpacesHost } from './lib/spaces/host.js';
import { createSpaceArchive } from './lib/spaces/space-archive.js';
import { CHAT_EXPORT_TIMEOUT_MS } from './lib/spaces/space-native-archive.js';
import { readIdleStopSetting, startIdleStop } from './lib/spaces/idle-stop.js';
import { SPACE_IDLE_EXIT_CODE } from './lib/spaces/layout.js';
import { createSwitchController, registerSpaceRoutes } from './lib/spaces/routes.js';
import { configureGitEnvironment, configureProjectWorktreeDirectory, resolvePrimaryWorktreeRoot, getWorktrees } from './lib/git/service.js';
import { createEnvironmentStore } from './lib/environment/store.js';
import { createEnvironmentRuntime } from './lib/environment/runtime.js';
import { createWorktreeBootstrapStore } from './lib/git/worktree-bootstrap-storage.js';
import { createRemoteClientAuthRuntime } from './lib/client-auth/remote-clients.js';
import { createClientPairingRuntime } from './lib/client-auth/pairing.js';
import { attachRealtimeProxy } from './lib/realtime-proxy.js';
import { createRelayService, relayBlockedByEnterprise } from './lib/relay/service.js';
import { createRelayHostLock } from './lib/relay/host-lock.js';
import { createRelayKeyStore } from './lib/relay/key-store.js';
import { createBrowserControlBroker } from './lib/browser-control/broker.js';
import { createBrowserControlRouter } from './lib/browser-control/provider.js';
import { createDevServerScanner } from './lib/dev-servers/routes.js';
import { createDevTunnelRuntime } from './lib/dev-tunnel/runtime.js';
import { registerBrowserControlRoutes } from './lib/browser-control/routes.js';
import { createOpenChamberSessionService, registerCanonicalSessionRoutes } from './lib/openchamber-sessions/routes.js';
import { createHostSessionState } from './lib/host/session-state.js';
import { createHostAgentScopeRuntime } from './lib/host/agent-scope-runtime.js';
import { createHostAgentRuntime } from './lib/host/agent-runtime.js';
import { createAttachmentRoutes } from './lib/host/attachment-routes.js';
import { createLegacyAttachmentImporter } from './lib/host/legacy-attachment-importer.js';
import { createHostPromptDeliveryRuntime } from './lib/host/prompt-delivery-runtime.js';
import { createSelectedCredentialResolver, createSelectedCredentialHandoff, createCatalogCredentialSelections } from './lib/host/private-credential.js';
import { createScheduledTaskService } from './lib/scheduled-tasks/service.js';
import { createOpenChamberControlService } from './lib/openchamber-control/service.js';
import { createPluginNotificationEmitter } from './lib/notifications/emit-route.js';
import { OpenChamberControlError } from './lib/openchamber-control/error.js';
import { createSessionLinker } from './lib/openchamber-sessions/session-link.js';
import { createFileOpenRequester } from './lib/openchamber-control/file-open.js';
import { applyConnectAttemptTimeout } from './lib/network-defaults.js';
import { applyOutboundProxyFromEnv } from './lib/outbound-proxy.js';

// Background CLI launches enter here in a fresh process, without CLI defaults.
applyConnectAttemptTimeout();
applyOutboundProxyFromEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
const DESKTOP_NOTIFY_PREFIX = '[OpenChamberDesktopNotify] ';
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
// `~/.config/openchamber`, or `OPENCHAMBER_DATA_DIR` when set. The user
// folders (`projects/`, `themes/`, `speech-models/`) are copied into a custom
// root once at startup (`migrateLegacyUserDirs`), because they used to ignore
// the variable.
const OPENCHAMBER_DEFAULT_CONFIG_ROOT = path.join(os.homedir(), '.config', 'openchamber');
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
let clearPendingPushBadge = () => {};
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
const hostAgentRuntime = createHostAgentRuntime({
  dataDir: OPENCHAMBER_DATA_DIR,
  scopeRuntime: agentScopeRuntime,
  bunPath: process.env.OHPICHAMBER_BUN,
  entrypoint: process.env.OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT,
  validateDirectoryPath,
  getEnvironmentForDirectory: async (directory) => await environmentRuntime.forDirectory(directory) ?? {},
  invokeHostAction: (scope, request, signal) => openChamberControlService.invokeHostAction(scope, request, signal),
});
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
      properties: { sessionID, metadata: result.metadata, revision: result.revision },
    });
  }
  // The write itself arms the goal loop: it is the authoritative signal and
  // does not depend on the event stream being connected.
  // Called, not captured: the runtime is declared further down.
  if (result.changed && patch?.openchamber && 'goal' in patch.openchamber) {
    void Promise.resolve(sessionGoalRuntime.notifyGoalChanged(sessionID, directory, result.metadata))
      .catch((error) => console.warn('[session-goal] could not arm after a goal change:', error?.message ?? error));
  }
  return result;
};

/** A metadata change decided against the record at write time; broadcast only when it changed. */
const updateSessionMetadataWith = async (sessionID, decide, { directory = '' } = {}) => {
  const result = await sessionMetadataStore.updateSessionMetadata(sessionID, decide, { directory });
  if (result.changed) {
    broadcastOpenChamberUiEvent({
      type: 'openchamber:session-metadata',
      properties: { sessionID, metadata: result.metadata, revision: result.revision },
    });
  }
  return result;
};
const openChamberSessionService = createOpenChamberSessionService({
  service: hostAgentRuntime.service,
  resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
  resolveSessionScope: hostAgentRuntime.resolveSessionScope,
  resolveHostSessionScope: hostAgentRuntime.resolveHostSessionScope,
  resolveHostRelocationScope: hostAgentRuntime.resolveHostRelocationScope,
  agentScopeStore,
  listWorkspaceScopes,
  registerSessionScope: agentScopeRuntime.registerSessionScope,
  resolveAttachments,
  capturePrompt: (...args) => hostPromptDeliveryRuntime.capturePrompt(...args),
  beforeDispatch: (scope, capture) => hostPromptDeliveryRuntime.beforeDispatch(scope, capture.request),
  onPromptAccepted: (scope, capture, receipt) => hostPromptDeliveryRuntime.onPromptAccepted(scope, capture.request, receipt),
  publishSessionEvent: (event) => {
    void globalMessageStreamHub.subscribeSession(event.properties.sessionId)
      .catch((error) => console.warn('[agent-events] session observation failed:', error.code ?? 'SERVICE_UNAVAILABLE'));
  },
  sessionMetadataStore,
  directCommandAdmissionStore: hostSessionState.directCommandAdmissionStore,
  archiveStore,
  persistSessionMetadata: persistSessionMetadataPatch,
  broadcastGlobalUiEvent: broadcastOpenChamberUiEvent,
  onArchiveDeleted: async (scope, ack) => {
    await agentScopeStore.removeSessionFamily(scope.rootSessionId);
    spaceArchive?.forgetChat(ack.sessionId);
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
});
// Git asks the canonical project config for the personal worktree folder; it
// never reads OpenCode's JSONC configuration.
configureProjectWorktreeDirectory((projectConfigId) => projectConfigRuntime.readWorktreeDirectory(projectConfigId));

const projectContextRuntime = createProjectContextRuntime({
  fsPromises,
  path,
  projectsDirPath: OPENCHAMBER_PROJECTS_CONFIG_DIR,
  resolveSharedPlansDir: (projectId) => projectConfigRuntime.resolveSharedPlansDir(projectId),
  onChanged: (projectId) => broadcastOpenChamberUiEvent({
    type: 'openchamber:project-context-changed',
    properties: { projectId },
  }),
});

const agentMemoryRuntime = createAgentMemoryRuntime({
  fsPromises,
  path,
  projectsDirPath: OPENCHAMBER_PROJECTS_CONFIG_DIR,
  userConfigRoot: OPENCHAMBER_USER_CONFIG_ROOT,
});

/**
 * One switch for everything memory-related. It gates the tool, these routes,
 * and the session index alike, so turning memory off leaves nothing behind
 * that still reads or writes the store.
 */
const isAgentMemoryEnabled = async () => {
  // The feature gate comes first: unreleased means absent, not merely switched
  // off, so no stored setting can bring it back.
  if (!isAgentMemoryFeatureAvailable()) {
    return false;
  }
  const settings = await readSettingsFromDiskMigrated().catch(() => null);
  return settings?.agentMemoryToolEnabled === true;
};



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
  readSessionMetadata: readStoredSessionMetadata,
  readSettingsFromDisk,
});

const notificationTriggerRuntime = createNotificationTriggerRuntime({
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
  readSessionMetadata: readStoredSessionMetadata,
});

const setAutoAcceptSession = (sessionId, enabled) => permissionAutoAcceptRuntime.setSessionPolicy(sessionId, enabled);
clearPendingPushBadge = () => notificationTriggerRuntime.clearPendingPushBadge();

// Which sessions are subsessions: per-turn work skips them without reading.
const sessionLineage = createSessionLineage();

const sessionAssistRuntime = createSessionAssistRuntime({
  sessionService: openChamberSessionService,
  resolveSessionScope: hostAgentRuntime.resolveSessionScope,
  getSmallModelService: async () => import('./lib/small-model/index.js'),
  persistSessionAssist: (sessionID, directory, assist) =>
    persistSessionMetadataPatch(sessionID, { openchamber: { assist } }, { directory }),
});
const sessionGoalRuntime = createSessionGoalRuntime({
  sessionService: openChamberSessionService,
  resolveSessionScope: hostAgentRuntime.resolveSessionScope,
  getSmallModelService: async () => import('./lib/small-model/index.js'),
  classifierEndpoint: (workspaceId) => routingRuntime.classifierEndpoint(workspaceId),
  jev: createJevClient(),
  readSessionMetadata: readStoredSessionMetadata,
  persistSessionGoal: (sessionID, directory, goal) =>
    persistSessionMetadataPatch(sessionID, { openchamber: { goal } }, { directory }),
  emitGoalNotification: async ({ sessionId, directory, status, goal }) => {
    // The goal settle notification replaces the per-turn ready notifications
    // (suppressed while the goal is active) — so it obeys the same toggle.
    const settings = await readSettingsFromDisk();
    if (settings.notifyOnCompletion === false) {
      return;
    }
    const title = status === 'complete'
      ? 'Goal complete'
      : (status === 'budgetLimited' ? 'Goal reached its token budget' : 'Goal blocked');
    const detail = goal?.statusReason && goal.statusReason !== 'verified by audit' && goal.statusReason !== 'reported by agent'
      ? goal.statusReason
      : '';
    const objective = typeof goal?.objective === 'string' ? goal.objective.slice(0, 140) : '';
    const notificationPayload = {
      title,
      body: [objective, detail].filter(Boolean).join(' — ').slice(0, 240),
      tag: `goal-${sessionId}`,
      kind: 'goal',
      sessionId,
      directory,
    };
    const desktopNotificationDelivered = emitDesktopNotification(notificationPayload);
    broadcastUiNotification(notificationPayload, { desktopNotificationDelivered });
    void notificationTriggerRuntime.sendGoalSettlePush({
      sessionId,
      directory,
      status,
      title,
      body: notificationPayload.body,
    }).catch((error) => {
      console.warn('[session-goal] push fanout failed:', error?.message || error);
    });
  },
});
/**
 * Owns what a session must be told about the project's knowledge. Every sender
 * asks it — the UI over HTTP, scheduled tasks and agent-dispatched sessions in
 * process — so the answer cannot differ between them.
 */
const sessionKnowledgeRuntime = createSessionKnowledgeRuntime({
  projectContextRuntime,
  agentMemoryRuntime,
  // Called, not captured: the resolver is declared further down, and taking a
  // reference here would read it before it exists.
  resolveProjectId: (directory) => resolveMemoryProjectId(directory),
  isAgentMemoryEnabled,
  isSessionLinkingAvailable: async () => {
    const settings = await readSettingsFromDiskMigrated();
    return settings.agentControlToolEnabled !== false;
  },
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
  chatRoots: [path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'chats'), OPENCHAMBER_CHATS_DIR],
  lineage: sessionLineage,
});

const permissionAutoAcceptRuntime = createPermissionAutoAcceptRuntime({
  service: hostAgentRuntime.service,
  globalEventHub: globalMessageStreamHub,
  listWorkspaceScopes,
  resolveSessionScope: hostAgentRuntime.resolveSessionScope,
  readSettingsFromDiskMigrated,
  persistSettings,
  broadcastGlobalUiEvent,
  evaluatePermission: (permission, directory) => routingRuntime.evaluatePermission(permission, directory),
  onPermissionReplied: (permissionId) => routingRuntime.forgetPermission(permissionId),
  resolveLegacyEnabledMode: async () => ((await routingRuntime.legacySafetyNetEnabled()) ? 'safety' : 'auto'),
});
// A request the safety net held still needs the user, so only one that was
// actually answered automatically skips the notification.
notificationTriggerRuntime.setGetIsSessionAutoAccepting(
  (sessionId, scope, approvalId) => permissionAutoAcceptRuntime.isPermissionAutoAnswered(sessionId, scope.cwd, approvalId),
);

// Queued follow-up messages are delivered by the server so a closed tab or a
// dropped connection no longer strands them.
const messageQueueRuntime = createCanonicalQueueRuntime({
  store: promptQueueStore,
  service: hostAgentRuntime.service,
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

// Full-text search over this server's conversations (user messages and agent
// replies). Opt-in: off by default, and off means idle. The index is derived
// data in the data dir, fed from the same event stream; see lib/message-search.
const messageSearchRuntime = createMessageSearchRuntime({
  dataDir: OPENCHAMBER_DATA_DIR,
  sessionService: openChamberSessionService,
  resolveSessionScope: hostAgentRuntime.resolveSessionScope,
  readSessionMetadata: readStoredSessionMetadata,
  globalEventHub: globalMessageStreamHub,
  readSettings: async () => {
    const settings = await readSettingsFromDisk();
    return { enabled: settings.messageSearchEnabled === true, reasoning: settings.messageSearchReasoningEnabled === true };
  },
});


globalMessageStreamHub.subscribeSnapshot((snapshot, scope) => {
  sessionRuntime.applySnapshot(snapshot, scope);
});
globalMessageStreamHub.subscribeEvent(async (event, scope) => {
  sessionRuntime.processCanonicalEvent(event, scope);
  await messageQueueRuntime.observe({ ...scope, sessionId: event.sessionId }, event);
  sessionLineage.observe(event);
  sessionAssistRuntime.processCanonicalEvent(event, scope);
  sessionWorkRuntime.processCanonicalEvent(event, scope);
  sessionGoalRuntime.processCanonicalEvent(event, scope);
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
  readSessionDefaults: async (projectID) => {
    const settings = await readSettingsFromDiskMigrated();
    const project = sanitizeProjects(settings?.projects || []).find((entry) => entry.id === projectID) ?? null;
    return resolveSessionDefaults({ settings, project });
  },
  listProjects: async () => {
    const settings = await readSettingsFromDiskMigrated();
    return sanitizeProjects(settings?.projects || []);
  },
  persistSessionGoal: (sessionID, directory, goal) =>
    persistSessionMetadataPatch(sessionID, { openchamber: { goal } }, { directory }),
  setSessionAutoAccept: (sessionId, enabled, directory) => permissionAutoAcceptRuntime.setSessionPolicy(sessionId, enabled, directory),
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
      const options = task.execution.useDefaults
        ? { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null }
        : { providerId: task.execution.providerID ?? null, modelId: task.execution.modelID ?? null, agentId: task.execution.agent ?? null, variant: task.execution.variant ?? null, reasoningEffort: null };
      return {
        options,
        context: [createScheduledTaskContext({ projectId: scope.hostProjectId, taskId: task.id, sessionId: scope.sessionId,
          workspaceId: scope.workspaceId, mode: 'existing', triggeredAt: task.state?.lastRunAt ?? Date.now() })],
      };
    },
  });
  if (result.status === 'partial' || result.status === 'failed') {
    console.warn('[message-queue] legacy conversion incomplete:', result.status, result.storage ?? 'conversion_failed', result.errors.length);
  }
};
/**
 * Maps a session directory onto the project whose memory it belongs to, so a
 * session running in a worktree writes to the project the panel shows.
 */
const resolveMemoryProjectId = createMemoryProjectResolver({
  listProjectPaths: async () => {
    const settings = await readSettingsFromDiskMigrated().catch(() => null);
    return sanitizeProjects(settings?.projects || []).map((project) => project.path);
  },
  resolvePrimaryWorktreeRoot,
  managedProjectRoots: [...new Set([path.join(OPENCHAMBER_USER_CONFIG_ROOT, 'chats'), OPENCHAMBER_CHATS_DIR])],
});

/**
 * Tells open panels that the service changed what it remembers, so what it just
 * stored is visible without reopening anything.
 */
const emitAgentMemoryChangedEvent = (event) => {
  for (const client of uiOpenChamberEventClients) {
    try {
      writeSseEvent(client, {
        type: 'openchamber:service-memory-changed',
        properties: {
          scope: event.scope,
          ...(event.projectId ? { projectId: event.projectId } : {}),
        },
      });
    } catch {
      uiOpenChamberEventClients.delete(client);
    }
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
  fileOpen: fileOpenRequester,
  // The tool is off by default; a plugin generated before it was switched off
  // must not keep paging the user.
  notifyUser: async (input) => {
    const settings = await readSettingsFromDiskMigrated().catch(() => null);
    if (settings?.agentNotifyToolEnabled !== true) {
      return { status: 403, body: { error: 'The notify tool is turned off in OpenChamber settings' } };
    }
    return pluginNotificationEmitter.emit(input);
  },
  agentMemoryActions: createAgentMemoryActions({
    agentMemoryRuntime,
    createError: (message, status) => new OpenChamberControlError(message, status),
    onMemoryChanged: emitAgentMemoryChangedEvent,
    isAgentMemoryEnabled,
    resolveProjectId: resolveMemoryProjectId,
  }),
  sessionLinks: createSessionLinker({
    updateMetadata: updateSessionMetadataWith,
    createError: (message, status) => new OpenChamberControlError(message, status),
  }),
  dispatchResults: dispatchResultsRuntime,
  archiveStore: openChamberSessionService.archiveStore,
});

const ensureGlobalWatcherStarted = async () => {
  if (hostAgentRuntime.service.getState().phase !== 'ready') return;
  await globalMessageStreamHub.start();
  const listed = await openChamberSessionService.list();
  if (Object.keys(listed.errors).length > 0) {
    console.warn('[agent-events] persisted session discovery was partial:', Object.values(listed.errors).join(','));
  }
  for (const session of listed.items) {
    try {
      await openChamberSessionService.open(session.sessionId);
      await globalMessageStreamHub.subscribeSession(session.sessionId);
    } catch (error) {
      console.warn('[agent-events] persisted session observation failed:', error.code ?? 'SERVICE_UNAVAILABLE');
    }
  }
};
const startAgentService = async () => {
  await hostAgentRuntime.start();
  if (isShuttingDown) return hostAgentRuntime.service.getState();
  permissionAutoAcceptRuntime.start();
  await ensureGlobalWatcherStarted();
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
  syncToHmrState: () => {},
  hostAgentRuntime,
  permissionAutoAcceptRuntime,
  sessionAssistRuntime,
  sessionWorkRuntime,
  sessionGoalRuntime,
  contextObligatoryRuntime,
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
  stopAllGuestServices,
  getGuestSurfaceRuntime: () => guestSurfaceRuntime,
  getRealtimeProxyRuntime: () => realtimeProxyRuntime,
  getDictationRuntime: () => dictationRuntime,
  getRelayService: () => relayServiceInstance,
  getRelayReconcileTimer: () => relayReconcileTimer,
  getSpacesHost: () => spacesHost,
});

const gracefulShutdown = (...args) => gracefulShutdownRuntime.gracefulShutdown(...args);

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
  const resolvePairingTransports = (req) => {
    const activePort = tunnelRuntimeContext.getActivePort() || port;
    const local = `http://127.0.0.1:${activePort}`;
    if (advertisedLanUrl) {
      return { local, lan: advertisedLanUrl, relayAvailable: !relayBlockedByEnterprise() };
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
    return { local, lan, relayAvailable: !relayBlockedByEnterprise() };
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
  const desktopUpdater = options.desktopUpdater
    && typeof options.desktopUpdater.check === 'function'
    && typeof options.desktopUpdater.install === 'function'
    && typeof options.desktopUpdater.restart === 'function'
    ? options.desktopUpdater
    : null;

  console.log(`Starting OpenChamber on port ${port === 0 ? 'auto' : port}`);

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
          await hostAgentRuntime.service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }).catch(() => {});
          await agentScopeStore.removeSessionFamily(sessionId).catch(() => {});
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
  if (startupSettings?.isolatedSpacesEnabled === true) {
    try {
      spacesHost = buildSpacesHost();
    } catch (error) {
      // The feature is absent then, and the rest of the server starts as with the switch off.
      console.error(`[spaces] isolated spaces are unavailable this start: ${error?.code ?? ''} ${error?.message ?? error}`.trim());
      spacesHost = null;
    }
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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept,X-Requested-With,Cache-Control,X-OpenChamber-Directory,X-OpenChamber-Directory-Encoding,Ngrok-Skip-Browser-Warning,X-OpenChamber-Surface,X-OpenChamber-Provider,X-OpenChamber-Model');
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
        return typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'OpenChamber';
      } catch {
        return 'OpenChamber';
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
    updateUiVisibility,
    clearPendingPushBadge: () => clearPendingPushBadge(),
    isUiVisible,
    getUiNotificationClients: () => uiNotificationClients,
    writeSseEvent,
    pluginNotificationEmitter,
    sessionRuntime,
    setPushInitialized,
    fs,
    os,
    path,
    server,
    __dirname,
    openchamberDataDir: OPENCHAMBER_DATA_DIR,
    modelsDevApiUrl: MODELS_DEV_API_URL,
    modelsMetadataCacheTtl: MODELS_METADATA_CACHE_TTL,
    setAutoAcceptSession,
    desktopUpdater,
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
    // Every space's events join the host's hub, and the host asks each space for its live status.
    void host.startEvents(globalMessageStreamHub).catch((error) => {
      console.warn(`[spaces] could not follow the spaces: ${error?.message ?? error}`);
    });
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
  });

  await featureRoutesRuntime.registerRoutes(app, {
    environmentStore,
    environmentRuntime,
    listConfiguredProjects,
    messageSearchRuntime,
    sessionFoldersStore,
    isRequestOriginAllowed,
    resolveWorkspaceScope: hostAgentRuntime.resolveWorkspaceScope,
    resolveSessionScope: hostAgentRuntime.resolveSessionScope,
    resolveHostSessionScope: hostAgentRuntime.resolveHostSessionScope,
    listQueueScopes,
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
    projectContextRuntime,
    agentMemoryRuntime,
    isAgentMemoryEnabled,
    sessionKnowledgeRuntime,
    scheduledTasksRuntime,
    scheduledTaskService,
    openChamberSessionService,
    openChamberControlService,
    getOpenChamberEventClients: () => uiOpenChamberEventClients,
    writeSseEvent,
    globalEventHub: globalMessageStreamHub,
    permissionAutoAcceptRuntime,
    worktreeBootstrapStore,
    messageQueueRuntime,
    routingRuntime,
  });

  // After bootstrap: the upgrade gate needs the real UI auth controller.
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
    syncToHmrState: () => {},
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

  // Relay demand can change outside our routes: `openchamber connect-url
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
        await gracefulShutdown({ exitProcess: false }).catch(() => {});
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
      permissionAutoAcceptRuntime.stop();
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
