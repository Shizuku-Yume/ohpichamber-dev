
import express from 'express';

import { createRelayIdentityRuntime } from './identity.js';
import { describeRelayError, startRelayHost } from './host-client.js';
import { isEnterpriseMode, readEnterprisePolicy } from '../enterprise-mode.js';
import type { Application } from '../shared/http-contracts.js';
import type { RelaySigningDependencies } from './signing-key.js';
import type { RelayLegacySettings, RelayPublicJwk } from './key-store.js';
import type { RelayHostLock } from './host-lock.js';

export interface RelayServiceDependencies extends RelaySigningDependencies {
  readSettingsFromDiskMigrated: () => Promise<RelayLegacySettings>;
  writeSettingsToDisk: (settings: RelayLegacySettings) => Promise<void>;
  getLocalPort: () => number;
  hasRelayDemand?: () => Promise<boolean>;
  hostLock?: RelayHostLock | null;
  allowPassiveHost?: boolean;
  onShareState?: (shareId: string) => void;
  logger?: Pick<Console, 'warn'>;
}

export interface RelayServiceStatus {
  state: string;
  lastError: string | null;
  connectedClients: number;
  identityConflict?: boolean;
}

export interface RelayPairingCandidate {
  type: 'relay';
  relayUrl: string;
  serverId: string;
  hostEncPubJwk: RelayPublicJwk;
  priority: number;
}

export interface RelayStatus {
  enabled: boolean;
  state: string;
  serverId: string;
  connectedClients: number;
  relayUrl: string;
  relayUrlLocked: boolean;
  blockedByEnterprise: boolean;
  identityConflict: boolean | undefined;
  lastError?: string;
}

interface RelayConfig {
  enabled: boolean;
  relayUrl: string;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const hasRelayConfigFields = (value: unknown): value is { enabled?: unknown; relayUrl?: unknown } =>
  value !== null && value !== undefined;
const hasRelayUrlField = (value: unknown): value is { relayUrl?: unknown } =>
  value !== null && value !== undefined;
const hasErrorMessage = (value: unknown): value is { message?: unknown } => value !== null && value !== undefined;



const isValidRelayUrl = (value: unknown): value is string => {
  if (!isString(value)) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
};

export const normalizeRelayUrl = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || !isValidRelayUrl(trimmed)) return null;
  return trimmed;
};

export const pinnedRelayUrl = () => {
  const raw = readEnterprisePolicy().relayUrl;
  return raw && isValidRelayUrl(raw) ? raw.trim() : null;
};

const RELAY_BLOCKED_ERROR = 'In enterprise mode the relay runs on your own endpoint: set relayUrl in the policy file or OPENCHAMBER_RELAY_URL to a self-hosted relay.';
const RELAY_UNCONFIGURED_ERROR = 'No relay URL is configured. Set OPENCHAMBER_RELAY_URL, relayUrl in the policy file, or privateRelay.relayUrl in settings.json.';
export const relayBlockedByEnterprise = () => isEnterpriseMode() && pinnedRelayUrl() === null;

export const createRelayService = ({
  crypto,
  readSettingsFromDiskMigrated,
  writeSettingsToDisk,
  relayKeyStore,
  getLocalPort,
  hasRelayDemand = async () => false,
  hostLock = null,
  allowPassiveHost = true,
  onShareState = () => {},
  logger = console,
}: RelayServiceDependencies) => {
  const identityRuntime = createRelayIdentityRuntime({ crypto, relayKeyStore });

  let hostClient: ReturnType<typeof startRelayHost> | null = null;
  let status: RelayServiceStatus = { state: 'disabled', lastError: null, connectedClients: 0 };
  let claimWatchTimer: ReturnType<typeof setInterval> | null = null;
  const CLAIM_WATCH_INTERVAL_MS = 30_000;
  const CLAIM_TAKEOVER_GRACE_MS = 120_000;
  let claimFreeSinceMs: number | null = null;

  const readConfig = async () => {
    const settings = await readSettingsFromDiskMigrated();
    const rawStored = settings?.privateRelay;
    const stored = hasRelayConfigFields(rawStored) ? rawStored : null;
    const override = pinnedRelayUrl();
    return {
      enabled: stored?.enabled === true,
      relayUrl: override ?? normalizeRelayUrl(isString(stored?.relayUrl) ? stored.relayUrl : undefined),
      relayUrlLocked: override !== null,
    };
  };

  const writeConfig = async (config: RelayConfig) => {
    const settings = await readSettingsFromDiskMigrated();
    await writeSettingsToDisk({
      ...settings,
      privateRelay: { enabled: config.enabled === true, relayUrl: normalizeRelayUrl(config.relayUrl) },
    });
  };

  const stopHostClient = () => {
    if (!hostClient) return;
    hostClient.stop();
    hostClient = null;
  };

  const standbyStatus = (holder: ReturnType<RelayHostLock['otherLiveClaimant']>) => ({
    state: 'standby',
    lastError: holder?.host
      ? `relay host is owned by another OhPiChamber process sharing this data dir (pid ${holder.pid} on ${holder.host})`
      : 'relay host is owned by another OhPiChamber process sharing this data dir',
    connectedClients: 0,
  });

  // Claim watcher, active while the relay is enabled:
  //   - standby → claimant died → take over (start our host);
  //   - running → another live process claimed → stand down (stop, standby);
  //     otherwise refresh the claim, which keeps it live for instances on
  //     other hosts or containers that cannot probe our pid.
  // This back-off is what actually ends the mutual-eviction fight: the loser
  // must STOP reconnecting, otherwise both keep replacing each other forever.
  const ensureClaimWatch = () => {
    if (!hostLock || claimWatchTimer) return;
    claimWatchTimer = setInterval(() => {
      // Same queue as start/stop/disable: the tick must not act on a config
      // (enabled, enterprise, passive) that changed while it was scheduled.
      void serializedLifecycle(async () => {
        try {
          const config = await readConfig();
          if (!config.enabled || relayBlockedByEnterprise() || !config.relayUrl) {
            stopClaimWatch();
            stopHostClient();
            status = {
              state: 'disabled',
              lastError: config.enabled && !relayBlockedByEnterprise() && !config.relayUrl ? RELAY_UNCONFIGURED_ERROR : null,
              connectedClients: 0,
            };
            return;
          }
          if (hostClient) {
            if (!hostLock.tryClaim()) {
              logger.warn('[Relay] host claim taken by another instance — standing down');
              stopHostClient();
              status = standbyStatus(hostLock.otherLiveClaimant());
            }
            return;
          }
          if (status.state !== 'standby' || !allowPassiveHost) return;
          if (hostLock.otherLiveClaimant() !== null) {
            claimFreeSinceMs = null;
            return;
          }
          if (claimFreeSinceMs === null) {
            claimFreeSinceMs = Date.now();
            return;
          }
          if (Date.now() - claimFreeSinceMs < CLAIM_TAKEOVER_GRACE_MS) return;
          if (hostLock.tryClaim()) {
            claimFreeSinceMs = null;
            logger.warn('[Relay] host claim stayed free — taking over the relay host');
            await startHost(config.relayUrl);
          }
        } catch (error) {
          logger.warn(`[Relay] claim watch failed: ${describeRelayError(error)}`);
        }
      });
    }, CLAIM_WATCH_INTERVAL_MS);
    claimWatchTimer.unref();
  };

  const stopClaimWatch = () => {
    if (!claimWatchTimer) return;
    clearInterval(claimWatchTimer);
    claimWatchTimer = null;
    claimFreeSinceMs = null;
  };

  const startHost = async (relayUrl, { claim = 'try' } = {}) => {
    if (hostClient) return;
    if (relayBlockedByEnterprise()) {
      status = { state: 'disabled', lastError: RELAY_BLOCKED_ERROR, connectedClients: 0 };
      return;
    }
    const normalizedUrl = normalizeRelayUrl(relayUrl);
    if (!normalizedUrl) {
      status = { state: 'disabled', lastError: RELAY_UNCONFIGURED_ERROR, connectedClients: 0 };
      return;
    }
    if (claim !== 'force' && !allowPassiveHost) {
      status = {
        state: 'standby',
        lastError: 'passive relay hosting is disabled on this instance — enable the relay or create a pairing link to host here',
        connectedClients: 0,
      };
      return;
    }
    if (hostLock) {
      const claimed = claim === 'force' ? hostLock.forceClaim() : hostLock.tryClaim();
      if (!claimed) {
        status = standbyStatus(hostLock.otherLiveClaimant());
        ensureClaimWatch();
        return;
      }
    }
    const identity = await identityRuntime.getRelayIdentity();
    const hostOptions = {
      relayUrl: normalizedUrl,
      identity,
      getLocalPort,
      logger,
      onShareState,
      onStatus: (next: RelayServiceStatus) => {
        status = next;
      },
    };
    hostClient = startRelayHost(hostOptions);
    status = hostClient.getStatus();
    ensureClaimWatch();
  };

  const stopHost = () => {
    stopClaimWatch();
    stopHostClient();
    if (hostLock) hostLock.release();
    status = { state: 'disabled', lastError: null, connectedClients: 0 };
  };

  const startIfEnabledHost = async () => {
    try {
      const config = await readConfig();
      if (config.enabled) {
        await startHost(config.relayUrl);
      }
    } catch (error) {
      logger.warn(`[Relay] startup failed: ${describeRelayError(error)}`);
    }
  };

  // Drive the relay lifecycle from demand: run it when a device or pending
  // session uses the relay, stop it when none remain. Called on startup and after
  // pairing/device changes, so the operator never toggles it manually.
  const reconcileHost = async () => {
    try {
      const demand = await hasRelayDemand();
      const config = await readConfig();
      if (demand) {
        if (relayBlockedByEnterprise()) {
          stopHost();
          status = { state: 'disabled', lastError: RELAY_BLOCKED_ERROR, connectedClients: 0 };
          return;
        }
        if (!config.relayUrl) {
          stopHost();
          status = { state: 'disabled', lastError: RELAY_UNCONFIGURED_ERROR, connectedClients: 0 };
          return;
        }
        if (!config.enabled) await writeConfig({ enabled: true, relayUrl: config.relayUrl });
        if (!hostClient) {
          const next = await readConfig();
          await startHost(next.relayUrl);
        }
      } else {
        if (config.enabled) await writeConfig({ enabled: false, relayUrl: config.relayUrl });
        stopHost();
      }
    } catch (error) {
      logger.warn(`[Relay] reconcile failed: ${describeRelayError(error)}`);
    }
  };

  const getServerId = async () => {
    const identity = await identityRuntime.getRelayIdentity();
    return identity.serverId;
  };

  const getStatus = async (): Promise<RelayStatus> => {
    const config = await readConfig();
    const identity = await identityRuntime.getRelayIdentity();
    const live: RelayServiceStatus = hostClient ? hostClient.getStatus() : status;
    const result: RelayStatus = {
      enabled: config.enabled,
      state: hostClient ? live.state : (status.state === 'standby' ? 'standby' : 'disabled'),
      serverId: identity.serverId,
      connectedClients: live.connectedClients,
      relayUrl: config.relayUrl,
      relayUrlLocked: config.relayUrlLocked,
      blockedByEnterprise: relayBlockedByEnterprise(),
      identityConflict: hostClient ? live.identityConflict : false,
    };
    if (live.lastError) result.lastError = live.lastError;
    return result;
  };

  // Pairing candidate for the unified connection payload (pairing v2). Relay is
  // just another transport: it carries the relay route + E2EE trust anchor, no
  // embedded token — the client redeems the one-time pairing secret over the
  // tunnel like any other candidate. Returns null when the host relay is off, so
  // callers only advertise relay when it is actually reachable. Priority is high
  // (tried after LAN/tunnel) since the relay path is the last-resort transport.
  const buildPairingCandidate = async (configOverride) => {
    const config = configOverride ?? await readConfig();
    if (!config.relayUrl) return null;
    const identity = await identityRuntime.getRelayIdentity();
    return {
      type: 'relay',
      relayUrl: config.relayUrl,
      serverId: identity.serverId,
      hostEncPubJwk: identity.hostEncPubJwk,
      priority: 30,
    };
  };

  const getPairingCandidate = async () => {
    const config = await readConfig();
    if (!config.enabled || !config.relayUrl || relayBlockedByEnterprise()) return null;
    return buildPairingCandidate(config);
  };

  // Enable the relay host on demand and return its pairing candidate. Creating a
  // relay pairing link IS the demand signal, so the relay turns itself on here
  // rather than requiring a separate manual toggle. Idempotent: a no-op when the
  // relay is already enabled and running.
  const ensureEnabledForPairingHost = async () => {
    // Direct pairing still works: the pairing route drops a failed relay candidate.
    if (relayBlockedByEnterprise()) throw Object.assign(new Error(RELAY_BLOCKED_ERROR), { statusCode: 403 });
    const config = await readConfig();
    if (!config.relayUrl) throw Object.assign(new Error(RELAY_UNCONFIGURED_ERROR), { statusCode: 400 });
    if (!config.enabled) {
      await writeConfig({ enabled: true, relayUrl: config.relayUrl });
    }
    if (!hostClient) {
      const next = await readConfig();
      if (!next.relayUrl) throw Object.assign(new Error(RELAY_UNCONFIGURED_ERROR), { statusCode: 400 });
      // Force-claim: creating a pairing link is explicit user intent — the
      // instance the user is pairing against MUST be the one devices reach,
      // even if another local process currently holds the machine's claim
      // (its claim watcher sees the takeover and stands down).
      await startHost(next.relayUrl, { claim: 'force' });
    }
    return buildPairingCandidate();
  };

  // Gives this copy its own identity. Both copies of a copied data dir hold the
  // same keys and evict each other at the relay; after the reset, devices that
  // know the old identity keep reaching the other copy until they pair here again.
  const resetIdentityHost = async () => {
    const wasHosting = hostClient !== null;
    stopHostClient();
    await relayKeyStore.reset();
    // A reset only runs through this queue, but a host started before it can
    // still be live; stop whatever exists now so no host keeps signing with
    // the abandoned identity.
    stopHostClient();
    if (!wasHosting) return;
    const config = await readConfig();
    if (!config.enabled || !config.relayUrl || relayBlockedByEnterprise()) return;
    // Explicit identity rotation is user intent: claim the host like enable.
    await startHost(config.relayUrl, { claim: 'force' });
  };

  // One lifecycle mutation at a time: boot, demand reconcile, explicit
  // enable/disable and identity reset read and replace the same host and key
  // state. Serializing them also keeps a reset from restarting a host built
  // from the identity it is replacing.
  let lifecycleQueue = Promise.resolve();
  const serializedLifecycle = (task) => {
    const run = lifecycleQueue.then(task, task);
    lifecycleQueue = run.then(() => undefined, () => undefined);
    return run;
  };
  const start = (relayUrl, options) => serializedLifecycle(() => startHost(relayUrl, options));
  const stop = () => serializedLifecycle(() => stopHost());
  const startIfEnabled = () => serializedLifecycle(() => startIfEnabledHost());
  const reconcile = () => serializedLifecycle(() => reconcileHost());
  const ensureEnabledForPairing = () => serializedLifecycle(() => ensureEnabledForPairingHost());
  const resetIdentity = () => serializedLifecycle(() => resetIdentityHost());
  const enableRelay = (relayUrl) => serializedLifecycle(async () => {
    stopHost();
    await startHost(relayUrl, { claim: 'force' });
  });

  const registerRoutes = (app) => {
    app.get('/api/openchamber/relay/status', async (_req, res) => {
      try {
        res.json(await getStatus());
      } catch (error) {
        res.status(500).json({ error: (hasErrorMessage(error) ? error.message : undefined) ?? 'Failed to read relay status' });
      }
    });

    app.post('/api/openchamber/relay/enable', express.json({ limit: '16kb' }), async (req, res) => {
      if (relayBlockedByEnterprise()) {
        return res.status(403).json({ error: RELAY_BLOCKED_ERROR, code: 'enterprise_mode' });
      }
      try {
        const current = await readConfig();
        const hasExplicitUrl = req.body?.relayUrl !== undefined && req.body?.relayUrl !== null;
        if (hasExplicitUrl && !isValidRelayUrl(req.body.relayUrl)) {
          return res.status(400).json({ error: 'Invalid relay URL. Use a ws:// or wss:// URL.' });
        }
        const relayUrl = current.relayUrlLocked
          ? current.relayUrl
          : hasExplicitUrl
            ? normalizeRelayUrl(req.body.relayUrl)
            : current.relayUrl;
        if (!relayUrl) {
          return res.status(400).json({ error: RELAY_UNCONFIGURED_ERROR });
        }
        await writeConfig({ enabled: true, relayUrl });
        // Explicit user action: take the machine's host claim like pairing does.
        await enableRelay(relayUrl);
        res.json(await getStatus());
      } catch (error) {
        res.status(500).json({ error: (hasErrorMessage(error) ? error.message : undefined) ?? 'Failed to enable relay' });
      }
    });

    app.post('/api/openchamber/relay/reset-identity', async (_req, res) => {
      try {
        await resetIdentity();
        res.json(await getStatus());
      } catch (error) {
        res.status(500).json({ error: (hasErrorMessage(error) ? error.message : undefined) ?? 'Failed to reset relay identity' });
      }
    });

    app.post('/api/openchamber/relay/disable', async (_req, res) => {
      try {
        const current = await readConfig();
        await writeConfig({ enabled: false, relayUrl: current.relayUrl });
        stop();
        res.json(await getStatus());
      } catch (error) {
        res.status(500).json({ error: (hasErrorMessage(error) ? error.message : undefined) ?? 'Failed to disable relay' });
      }
    });

  };

  return {
    registerRoutes,
    startIfEnabled,
    reconcile,
    stop,
    getStatus,
    isConfigured: async () => !relayBlockedByEnterprise() && (await readConfig()).relayUrl !== null,
    getServerId,
    resetIdentity,
    getPairingCandidate,
    ensureEnabledForPairing,
  };
};
