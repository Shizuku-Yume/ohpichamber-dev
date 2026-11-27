
import express from 'express';
import type { Server } from 'node:http';
import { z } from 'zod';
import { createRelayIdentityRuntime } from './identity.js';
import { describeRelayError, startRelayHost } from './host-client.js';
import { consumeRelayProof } from './provenance.js';
import { isEnterpriseMode, readEnterprisePolicy } from '../enterprise-mode.js';
import type { Application } from '../shared/http-contracts.js';
import type { RelaySigningDependencies } from './signing-key.js';
import type { RelayLegacySettings, RelayPublicJwk } from './key-store.js';
import type { RelayHostLock } from './host-lock.js';
import type { UpdateSettingsFromDisk } from '../settings/settings-write-queue.js';

export interface RelayServiceDependencies extends RelaySigningDependencies {
  readSettingsFromDiskMigrated: () => Promise<RelayLegacySettings>;
  updateSettingsFromDisk: UpdateSettingsFromDisk;
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
  relayUrl: string | null;
  relayUrlLocked: boolean;
  blockedByEnterprise: boolean;
  identityConflict: boolean | undefined;
  lastError?: string;
}

interface RelayConfig {
  enabled: boolean;
  relayUrl: string | null;
}

const isString = (value: unknown): value is string => typeof value === 'string';
const hasRelayConfigFields = (value: unknown): value is { enabled?: unknown; relayUrl?: unknown } =>
  value !== null && value !== undefined;
const hasErrorMessage = (value: unknown): value is { message?: unknown } => value !== null && value !== undefined;

const enableRelayBodySchema = z.object({ relayUrl: z.unknown().optional() }).optional();

const isValidRelayUrl = (value: unknown): value is string => {
  if (!isString(value)) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
};

export const normalizeRelayUrl = (value: string | null | undefined) => {
  if (!isString(value)) return null;
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
  updateSettingsFromDisk,
  relayKeyStore,
  getLocalPort,
  hasRelayDemand = async () => false,
  hostLock = null,
  allowPassiveHost = true,
  onShareState = () => { },
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
    await updateSettingsFromDisk((settings) => ({
      ...settings,
      privateRelay: { enabled: config.enabled === true, relayUrl: normalizeRelayUrl(config.relayUrl) },
    }));
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

  const ensureClaimWatch = () => {
    if (!hostLock || claimWatchTimer) return;
    claimWatchTimer = setInterval(() => {
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

  const startHost = async (relayUrl: string | null, { claim = 'try' }: { claim?: 'try' | 'force' } = {}) => {
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

  const buildPairingCandidate = async (configOverride?: {
    enabled: boolean;
    relayUrl: string | null;
    relayUrlLocked: boolean;
  }): Promise<RelayPairingCandidate | null> => {
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

  const ensureEnabledForPairingHost = async () => {
    if (relayBlockedByEnterprise()) throw Object.assign(new Error(RELAY_BLOCKED_ERROR), { statusCode: 403 });
    const config = await readConfig();
    if (!config.relayUrl) throw Object.assign(new Error(RELAY_UNCONFIGURED_ERROR), { statusCode: 400 });
    if (!config.enabled) {
      await writeConfig({ enabled: true, relayUrl: config.relayUrl });
    }
    if (!hostClient) {
      const next = await readConfig();
      if (!next.relayUrl) throw Object.assign(new Error(RELAY_UNCONFIGURED_ERROR), { statusCode: 400 });
      await startHost(next.relayUrl, { claim: 'force' });
    }
    return buildPairingCandidate();
  };

  const resetIdentityHost = async () => {
    const wasHosting = hostClient !== null;
    stopHostClient();
    await relayKeyStore.reset();
    stopHostClient();
    if (!wasHosting) return;
    const config = await readConfig();
    if (!config.enabled || !config.relayUrl || relayBlockedByEnterprise()) return;
    await startHost(config.relayUrl, { claim: 'force' });
  };

  let lifecycleQueue = Promise.resolve();
  const serializedLifecycle = <T>(task: () => Promise<T>): Promise<T> => {
    const run = lifecycleQueue.then(task, task);
    lifecycleQueue = run.then(() => undefined, () => undefined);
    return run;
  };
  const stop = () => serializedLifecycle(() => Promise.resolve(stopHost()));
  const startIfEnabled = () => serializedLifecycle(() => startIfEnabledHost());
  const reconcile = () => serializedLifecycle(() => reconcileHost());
  const ensureEnabledForPairing = () => serializedLifecycle(() => ensureEnabledForPairingHost());
  const resetIdentity = () => serializedLifecycle(() => resetIdentityHost());
  const enableRelay = (relayUrl: string) => serializedLifecycle(async () => {
    stopHost();
    await startHost(relayUrl, { claim: 'force' });
  });

  const registerRoutes = (app: Application, server: Pick<Server, 'prependListener'>) => {
    server.prependListener('request', consumeRelayProof);
    server.prependListener('upgrade', consumeRelayProof);
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
        const parsedBody = enableRelayBodySchema.safeParse(req.body);
        const requestedUrl = parsedBody.success ? parsedBody.data?.relayUrl : undefined;
        const hasExplicitUrl = requestedUrl !== undefined && requestedUrl !== null;
        if (hasExplicitUrl && !isValidRelayUrl(requestedUrl)) {
          return res.status(400).json({ error: 'Invalid relay URL. Use a ws:// or wss:// URL.' });
        }
        const relayUrl = current.relayUrlLocked
          ? current.relayUrl
          : hasExplicitUrl && isString(requestedUrl)
            ? normalizeRelayUrl(requestedUrl)
            : current.relayUrl;
        if (!relayUrl) {
          return res.status(400).json({ error: RELAY_UNCONFIGURED_ERROR });
        }
        await writeConfig({ enabled: true, relayUrl });
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
