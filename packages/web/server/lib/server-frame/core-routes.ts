import { z } from 'zod';
import type { AuthContext, ClientAuthentication } from '../ui-auth/ui-auth.js';
import { getBearerTokenFromRequest } from '../ui-auth/ui-auth.js';
import type { BearerRequest, ClientInput, CreatedClient, PairingInput, PairingSession, RedemptionInput, RemoteClient } from '../client-auth/contracts.js';
import { candidateUrlType, isLocalOnlyCandidateSet, isLoopbackCandidateUrl, normalizeCandidateUrl } from '../client-auth/pairing-candidates.js';
import type { BootstrapExchangeResult, TunnelSession, createTunnelAuth } from '../tunnels/tunnel-auth.js';
import type { RawValue } from '../settings/settings-normalization-runtime.js';
import { registerThemeCatalogRoutes } from '../appearance/theme-catalog.js';
import { ThemeImportStorageError } from '../appearance/theme-runtime.js';
import type { NormalizedTheme } from '../appearance/theme-runtime.js';
import { collectLocalFileDiagnostics } from '../diagnostics/local-files.js';
import { hasLegacyOpenCodeData } from '../host/legacy-data.js';
import type { Application, ExpressFactory, NextFunction, Request, RequestHandler, Response } from '../shared/http-contracts.js';
import { isBoolean, isRecord, isString } from '../shared/object-guards.js';
import { parseJsonObject } from '../shared/json-values.js';
import type { JsonValue } from '../shared/json-values.js';
import { isRouteGatedApiRequest } from './api-auth-gate.js';
import type { RelayPairingCandidate } from '../relay/service.js';

export type RequestScope = ReturnType<ReturnType<typeof createTunnelAuth>['classifyRequestScope']>;

export interface TunnelAuthControllerContract {
  classifyRequestScope?: (req: Request) => RequestScope;
  getTunnelSessionFromRequest: (req: Request) => TunnelSession | null;
  requireTunnelSession?: RequestHandler;
  clearTunnelSessionCookie: (req: Request, res: Response) => void;
  exchangeBootstrapToken: (input: { req: Request; res: Response; token: string; sessionTtlMs: number }) => BootstrapExchangeResult;
}

export interface UiAuthControllerContract {
  enabled?: boolean;
  requireAuth?: RequestHandler;
  requireSessionAuth?: RequestHandler;
  resolveAuthContext?: (req: Request, res: Response, options?: { allowClientAuth?: boolean; allowUrlToken?: boolean }) => Promise<AuthContext | null>;
  handleSessionStatus: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handleSessionCreate: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handleUrlAuthToken: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handlePasskeyStatus: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handlePasskeyAuthenticationOptions: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handlePasskeyAuthenticationVerify: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handlePasskeyRegistrationOptions: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handlePasskeyRegistrationVerify: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handlePasskeyList: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handlePasskeyRevoke: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handlePasskeyRename?: (req: Request, res: Response) => Promise<void | Response> | void | Response;
  handleResetAuth: (req: Request, res: Response) => Promise<void | Response> | void | Response;
}

export interface HealthSnapshot {
  agentService?: {
    ompVersion?: string | null;
    phase?: string;
    ready?: boolean;
    status?: string;
  };
  desktopNotifyEnabled?: boolean;
  planModeExperimentalEnabled?: boolean;
  apiOnly?: boolean;
}

export interface ServerStatusRouteDependencies {
  express: Pick<ExpressFactory, 'json'>;
  process: Pick<NodeJS.Process, 'env' | 'platform' | 'pid' | 'ppid' | 'kill' | 'exit'>;
  openchamberVersion: string;
  runtimeName: string;
  serverStartedAt: string;
  gracefulShutdown: (options?: { exitProcess?: boolean }) => Promise<void>;
  getHealthSnapshot: () => HealthSnapshot;
  getServerPort?: (() => number | null) | undefined;
  getTunnelUrl?: (() => string | null) | undefined;
  getOmpVersion?: (() => string | null | undefined) | null | undefined;
  getServerId?: (() => Promise<string | null> | string | null) | undefined;
  tunnelAuthController?: Pick<TunnelAuthControllerContract, 'classifyRequestScope' | 'getTunnelSessionFromRequest' | 'requireTunnelSession'> | null | undefined;
  uiAuthController?: Pick<UiAuthControllerContract, 'requireAuth' | 'resolveAuthContext'> | null | undefined;
}

export type CandidateEntry = {
  type: string;
  url: string;
  priority: number;
} | RelayPairingCandidate;

export interface AuthAndAccessRouteDependencies {
  express: Pick<ExpressFactory, 'json'>;
  tunnelAuthController: TunnelAuthControllerContract;
  uiAuthController: UiAuthControllerContract;
  remoteClientAuthRuntime: {
    listClients: () => Promise<RemoteClient[]>;
    createClient: (input: ClientInput) => Promise<CreatedClient>;
    revokeClient: (id: string) => Promise<{ revoked: boolean; client?: RemoteClient }>;
    purgeRevokedClients: () => Promise<{ purged: number }>;
    authenticateBearerToken: (token: string, req: BearerRequest) => Promise<ClientAuthentication | null>;
  };
  clientPairingRuntime: {
    createPairingSession: (input: PairingInput) => Promise<{ pairing: PairingSession }>;
    listPendingSessions: () => Promise<PairingSession[]>;
    cancelPairingSession: (id: string) => Promise<{ cancelled: boolean }>;
    redeemPairingSession: (input: RedemptionInput) => Promise<{
      pairing: PairingSession;
      client: RemoteClient;
      token: string;
      replacedClientIds: string[];
    }>;
  };
  readSettingsFromDiskMigrated: () => Promise<{ tunnelSessionTtlMs?: RawValue } | null | undefined>;
  normalizeTunnelSessionTtlMs: (value: RawValue) => number;
  getRelayPairingCandidate?: ((options: { ensureEnabled: boolean }) => Promise<CandidateEntry | null>) | undefined;
  reconcileRelay?: (() => Promise<void> | void) | undefined;
  removeClientPushDevices?: ((clientIds: string[]) => Promise<void>) | undefined;
  getLegacyDataPresence?: (() => Promise<boolean> | boolean) | undefined;
  getPairingTransports?: ((req: Request) => Promise<{ local: string | null; lan: string | null; relayAvailable: boolean }> | { local: string | null; lan: string | null; relayAvailable: boolean }) | undefined;
  getDirectCandidateUrls?: ((req: Request) => string[]) | undefined;
  getServerId?: (() => Promise<string | null> | string | null) | undefined;
  getServerLabel?: (() => string) | undefined;
}

export interface SettingsUtilityRouteDependencies {
  readCustomThemesFromDisk: () => Promise<NormalizedTheme[]>;
  saveImportedTheme: (raw: Request['body']) => Promise<NormalizedTheme>;
  deleteImportedTheme: (id: string | undefined) => Promise<void>;
}

export interface CommonRequestMiddlewareDependencies {
  express: Pick<ExpressFactory, 'json' | 'urlencoded'>;
  verboseRequestLogs?: boolean | undefined;
  skipBodyParsing?: ((req: Request) => boolean) | undefined;
}


const probeUrlBodySchema = z.object({
  url: z.string(),
});

const errorDetailsSchema = z.object({
  message: z.string().optional(),
  statusCode: z.number().optional(),
});

const formatErrorDetail = (parsed: { message?: string | undefined; statusCode?: number | undefined } | undefined, fallback: string) =>
  parsed?.message || fallback;

const parseLoopbackUrl = (rawUrl: string) => {
  if (!isString(rawUrl)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }

  const host = url.hostname;
  if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '0.0.0.0') {
    return null;
  }

  return url;
};

export const isRequestAuthorized = async (
  req: Request,
  res: Response,
  {
    tunnelAuthController,
    uiAuthController,
  }: {
    tunnelAuthController?: Pick<TunnelAuthControllerContract, 'classifyRequestScope' | 'getTunnelSessionFromRequest'> | null;
    uiAuthController?: Pick<UiAuthControllerContract, 'resolveAuthContext'> | null;
  },
) => {
  const scope = tunnelAuthController?.classifyRequestScope?.(req);
  if (scope === 'tunnel' || scope === 'unknown-public') {
    return Boolean(tunnelAuthController?.getTunnelSessionFromRequest(req));
  }
  if (!uiAuthController?.resolveAuthContext) return false;
  return Boolean(await uiAuthController.resolveAuthContext(req, res, { allowUrlToken: false }));
};

export const registerServerStatusRoutes = (app: Application, dependencies: ServerStatusRouteDependencies) => {
  const {
    express,
    process,
    openchamberVersion,
    runtimeName,
    serverStartedAt,
    gracefulShutdown,
    getHealthSnapshot,
    getServerPort = () => null,
    getTunnelUrl = () => null,
    getOmpVersion = null,
    getServerId = async () => null,
    tunnelAuthController = null,
    uiAuthController = null,
  } = dependencies;

  let cachedServerId: string | null = null;
  const resolveServerId = async () => {
    if (cachedServerId) return cachedServerId;
    try {
      const value = await getServerId();
      cachedServerId = isString(value) && value.trim() ? value.trim() : null;
    } catch {
      cachedServerId = null;
    }
    return cachedServerId;
  };

  const allocateLoopbackPort = async () => {
    const net = await import('node:net');
    return await new Promise<number>((resolve, reject) => {
      const server = net.createServer();
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        try {
          const parsedAddress = z.object({ port: z.number() }).safeParse(server.address());
          const port = parsedAddress.success ? parsedAddress.data.port : 0;
          server.close(() => {
            resolve(port);
          });
        } catch (error) {
          try {
            server.close();
          } catch {
            void 0;
          }
          reject(error);
        }
      });
    });
  };

  const compatibility = {
    apiVersion: 1,
    minClientApiVersion: 1,
    capabilities: [
      'api.health.v1',
      'api.runtime-url.v1',
      'api.raw-file.v1',
      'api.notifications.emit.v1',
      'realtime.sse.v1',
      'realtime.websocket.global-events.v1',
      'terminal.websocket.v1',
    ],
  };

  const isDevShutdownAllowed = () => process.env.OPENCHAMBER_DEV_SHUTDOWN === 'true';

  const isSameOriginRequest = (req: Request) => {
    const originHeader = req.get?.('origin');
    const hostHeader = req.get?.('host');
    const rawOrigin = isString(originHeader) ? originHeader : '';
    const rawHost = isString(hostHeader) ? hostHeader : '';
    if (!rawOrigin || !rawHost) {
      return false;
    }
    try {
      const origin = new URL(rawOrigin);
      return origin.host === rawHost;
    } catch {
      return false;
    }
  };

  const resolveProcessGroupId = async (pid: number) => {
    if (!Number.isFinite(pid) || pid <= 0) {
      return null;
    }
    if (process.platform === 'win32') {
      return null;
    }

    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      const result = await execFileAsync('ps', ['-o', 'pgid=', '-p', String(pid)]);
      const raw = String(result.stdout || '').trim();
      const pgid = Number.parseInt(raw, 10);
      return Number.isFinite(pgid) && pgid > 0 ? pgid : null;
    } catch {
      return null;
    }
  };

  const parseLoopbackPort = (rawUrl: string) => {
    if (!isString(rawUrl)) {
      return null;
    }
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    const host = url.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1' && host !== '::1' && host !== '0.0.0.0') {
      return null;
    }
    const port = url.port ? Number.parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      return null;
    }
    return port;
  };

  const killListenPort = async (port: number) => {
    if (!Number.isFinite(port) || port <= 0) {
      return;
    }
    if (process.platform === 'win32') {
      return;
    }

    try {
      const { execFile } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execFileAsync = promisify(execFile);
      const result = await execFileAsync('lsof', ['-nP', '-t', `-iTCP:${Math.trunc(port)}`, '-sTCP:LISTEN'], {
        timeout: 2500,
      });
      const pids = String(result.stdout || '')
        .split(/\s+/)
        .map((value) => Number.parseInt(value, 10))
        .filter((pid) => Number.isFinite(pid) && pid > 0 && pid !== process.pid);

      for (const pid of pids) {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          void 0;
        }
      }
      if (pids.length > 0) {
        setTimeout(() => {
          for (const pid of pids) {
            try {
              process.kill(pid, 'SIGKILL');
            } catch {
              void 0;
            }
          }
        }, 1200).unref?.();
      }
    } catch {
      void 0;
    }
  };

  app.get('/health', async (_req, res) => {
    const serverId = await resolveServerId();
    interface HealthResponse extends HealthSnapshot {
      status: string;
      timestamp: string;
      openchamberVersion: string;
      runtime: string;
      compatibility: typeof compatibility;
      serverId?: string;
    }
    const body: HealthResponse = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      openchamberVersion,
      runtime: runtimeName,
      compatibility,
      ...getHealthSnapshot(),
    };
    if (serverId) body.serverId = serverId;
    res.json(body);
  });

  const requireLocalDiagnostics = (req: Request, res: Response, next: NextFunction) => {
    const remoteAddress = req.socket?.remoteAddress;
    if (!remoteAddress || !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress)
      || req.headers['x-openchamber-relay-connection']
      || (tunnelAuthController?.classifyRequestScope && tunnelAuthController.classifyRequestScope(req) !== 'local')) {
      res.status(403).json({ error: 'Local diagnostics require a loopback connection' });
      return;
    }
    if (uiAuthController?.requireAuth) return uiAuthController.requireAuth(req, res, next);
    next();
  };

  app.get('/api/diagnostics/local-files', requireLocalDiagnostics, async (_req, res) => {
    try {
      const webPort = getServerPort();
      res.json(await collectLocalFileDiagnostics(webPort !== null ? { webPort } : {}));
    } catch {
      res.status(500).json({ error: 'Diagnostics unavailable' });
    }
  });

  app.get('/api/version', async (_req, res) => {
    const serverId = await resolveServerId();
    interface VersionResponse {
      status: string;
      openchamberVersion: string;
      runtime: string;
      startedAt: string;
      compatibility: typeof compatibility;
      serverId?: string;
    }
    const body: VersionResponse = {
      status: 'ok',
      openchamberVersion,
      runtime: runtimeName,
      startedAt: serverStartedAt,
      compatibility,
    };
    if (serverId) body.serverId = serverId;
    res.json(body);
  });

  const isLoopbackPeer = (req: Request) => {
    const remoteAddress = req.socket?.remoteAddress;
    return Boolean(remoteAddress) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remoteAddress);
  };

  const requireShutdownAuth = async (req: Request, res: Response, next: NextFunction) => {
    if (!uiAuthController?.requireAuth) {
      if (!isLoopbackPeer(req)) {
        res.status(403).json({ error: 'Shutdown requires authentication or a loopback connection' });
        return;
      }
      return next();
    }
    const requestScope = tunnelAuthController?.classifyRequestScope
      ? tunnelAuthController.classifyRequestScope(req)
      : 'local';
    if (
      (requestScope === 'tunnel' || requestScope === 'unknown-public')
      && tunnelAuthController?.requireTunnelSession
    ) {
      return tunnelAuthController.requireTunnelSession(req, res, next);
    }
    return uiAuthController.requireAuth(req, res, next);
  };

  app.post('/api/system/shutdown', async (req, res, next) => {
    try {
      await requireShutdownAuth(req, res, () => {
        res.json({ ok: true });
        gracefulShutdown({ exitProcess: true }).catch((error) => {
          console.error('Shutdown request failed:', error instanceof Error ? error.message : error);
        });
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/system/dev-shutdown', express.json({ limit: '64kb' }), async (req, res, next) => {
    if (!isDevShutdownAllowed()) {
      return res.status(403).json({ ok: false, error: 'Dev shutdown is disabled' });
    }
    if (!isSameOriginRequest(req)) {
      return res.status(403).json({ ok: false, error: 'Invalid origin' });
    }

    try {
      await requireShutdownAuth(req, res, () => {
        void handleDevShutdownRequest(req, res);
      });
    } catch (error) {
      next(error);
    }
  });

  const handleDevShutdownRequest = async (req: Request, res: Response) => {
    res.json({ ok: true });

    try {
      const body = parseJsonObject(req.body) ?? {};
      const rawPreviewUrls = Array.isArray(body.previewUrls) ? body.previewUrls : [];
      const previewPorts = Array.from(new Set(
        rawPreviewUrls
          .map((value) => (isString(value) ? parseLoopbackPort(value) : null))
          .filter((port): port is number => port !== null),
      ));
      await Promise.all(previewPorts.map((port) => killListenPort(port)));

      const pgid = await resolveProcessGroupId(process.pid);
      const ppid = Number.isFinite(process.ppid) ? process.ppid : null;
      const parentPgid = ppid ? await resolveProcessGroupId(ppid) : null;

      void gracefulShutdown({ exitProcess: false });

      const pgidsToKill = Array.from(new Set([pgid, parentPgid].filter((id): id is number => id !== null)));
      for (const id of pgidsToKill) {
        try {
          process.kill(-id, 'SIGTERM');
        } catch {
          void 0;
        }
      }

      setTimeout(() => {
        for (const id of pgidsToKill) {
          try {
            process.kill(-id, 'SIGKILL');
          } catch {
            void 0;
          }
        }
      }, 1500).unref?.();

      setTimeout(() => {
        try {
          process.exit(0);
        } catch {
          void 0;
        }
      }, 2500).unref?.();
    } catch (error) {
      console.error('Dev shutdown request failed:', error instanceof Error ? error.message : error);
      try {
        process.exit(0);
      } catch {
        void 0;
      }
    }
  };

  app.get('/api/system/info', async (req, res) => {
    const readOmpVersion = (value: string | null | undefined) => (isString(value) && value.trim().length > 0 ? value.trim() : null);
    const resolveOmpVersion = () => {
      try {
        const direct = getOmpVersion?.();
        if (readOmpVersion(direct) !== null) return readOmpVersion(direct);
      } catch { void 0; }
      try {
        const snapshotValue = getHealthSnapshot()?.agentService?.ompVersion;
        if (readOmpVersion(snapshotValue) !== null) return readOmpVersion(snapshotValue);
      } catch { void 0; }
      return null;
    };
    interface SystemInfoResponse {
      openchamberVersion: string;
      ompVersion: string | null;
      runtime: string;
      pid: number;
      startedAt: string;
      port?: number | null;
      tunnelUrl?: string | null;
    }
    const info: SystemInfoResponse = {
      openchamberVersion,
      ompVersion: resolveOmpVersion(),
      runtime: runtimeName,
      pid: process.pid,
      startedAt: serverStartedAt,
    };
    if (await isRequestAuthorized(req, res, { tunnelAuthController, uiAuthController }).catch(() => false)) {
      info.port = getServerPort();
      info.tunnelUrl = getTunnelUrl();
    }
    res.json(info);
  });

  app.get('/api/system/free-port', async (_req, res) => {
    try {
      const port = await allocateLoopbackPort();
      if (!Number.isFinite(port) || port <= 0) {
        return res.status(500).json({ error: 'Failed to allocate port' });
      }
      return res.json({ port });
    } catch (error) {
      const message = error instanceof Error ? error.message : errorDetailsSchema.safeParse(error).data?.message;
      return res.status(500).json({ error: message || 'Failed to allocate port' });
    }
  });

};

export const registerAuthAndAccessRoutes = (app: Application, dependencies: AuthAndAccessRouteDependencies) => {
  const {
    express,
    tunnelAuthController,
    uiAuthController,
    remoteClientAuthRuntime,
    clientPairingRuntime,
    readSettingsFromDiskMigrated,
    normalizeTunnelSessionTtlMs,
    getRelayPairingCandidate = async () => null,
    reconcileRelay = async () => { },
    removeClientPushDevices = async () => { },
    getLegacyDataPresence = hasLegacyOpenCodeData,
    getPairingTransports = () => ({ local: null, lan: null, relayAvailable: true }),
    getDirectCandidateUrls = () => [],
    getServerId = async () => null,
    getServerLabel = () => 'OhPiChamber'
  } = dependencies;
  const PAIRING_REDEEM_RATE_LIMIT_WINDOW_MS = 300000;
  const PAIRING_REDEEM_RATE_LIMIT_MAX_ATTEMPTS = 10;
  const pairingRedeemAttempts = new Map<string, { count: number; firstAttemptAt: number }>();
  const runWithUiAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
    handler: () => Promise<void> | void,
    options: { sessionOnly?: boolean } = {},
  ) => {
    try {
      const requireAuth = options.sessionOnly === true && uiAuthController.requireSessionAuth
        ? uiAuthController.requireSessionAuth
        : uiAuthController.requireAuth;
      if (!requireAuth) {
        await handler();
        return;
      }
      await requireAuth(req, res, async () => {
        await handler();
      });
    } catch (error) {
      next(error);
    }
  };
  const runWithClientManagementAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
    handler: (context: AuthContext) => Promise<void | Response> | void | Response,
  ) => {
    try {
      if (uiAuthController.resolveAuthContext) {
        const context = await uiAuthController.resolveAuthContext(req, res, {
          allowClientAuth: true,
          allowUrlToken: false,
        });
        if (context?.type === 'session' || context?.type === 'client') {
          await handler(context);
          return;
        }
      }
      await runWithUiAuth(req, res, next, async () => {
        await handler({ type: 'session', token: null });
      }, { sessionOnly: true });
    } catch (error) {
      next(error);
    }
  };
  const runWithClientCreateAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
    handler: (context: AuthContext) => Promise<void | Response> | void | Response,
  ) => {
    try {
      if (uiAuthController.resolveAuthContext) {
        const context = await uiAuthController.resolveAuthContext(req, res, {
          allowClientAuth: true,
          allowUrlToken: false,
        });
        if (context?.type === "session") {
          await handler(context);
          return;
        }
        if (context?.type === "client") {
          const client = await clientRecordFromAuthContext(context);
          if (client?.clientKind === "desktop-local") {
            await handler({ ...context, client });
            return;
          }
          return res.status(403).json({ error: "Client tokens cannot create remote clients" });
        }
      }
      await runWithUiAuth(req, res, next, async () => {
        await handler({ type: 'session', token: null });
      }, { sessionOnly: true });
    } catch (error) {
      next(error);
    }
  };
  const clientIdFromAuthContext = (context: AuthContext) => {
    const raw = context?.client?.id || context?.clientId;
    return raw && raw.length > 0 ? raw : null;
  };
  const clientRecordFromAuthContext = async (context: AuthContext) => {
    if (context?.client) {
      return context.client;
    }
    const clientId = clientIdFromAuthContext(context);
    if (!clientId)
      return null;
    const clients = await remoteClientAuthRuntime.listClients();
    return clients.find((client) => client.id === clientId) || null;
  };
  const requestOrigin = (req: Request) => {
    const forwardedProto = isString(req.headers?.['x-forwarded-proto']) ? req.headers['x-forwarded-proto'].split(',')[0]?.trim() : '';
    const protocol = forwardedProto || (req.socket && 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http');
    const host = isString(req.headers?.host) ? req.headers.host.trim() : '';
    if (!host)
      return null;
    return `${protocol}://${host}`;
  };
  const requestIp = (req: Request) => req.socket?.remoteAddress || 'unknown';
  const pairingIdFromRequest = (req: Request) => {
    const pairingId = isRecord(req.body) ? req.body.pairingId : undefined;
    const raw = isString(pairingId) ? pairingId.trim() : '';
    return raw || 'missing';
  };
  const checkPairingRedeemRateLimit = (req: Request) => {
    const now = Date.now();
    const key = `${requestIp(req)}:${pairingIdFromRequest(req)}`;
    for (const [entryKey, entry] of pairingRedeemAttempts.entries()) {
      if (!entry || now - entry.firstAttemptAt >= PAIRING_REDEEM_RATE_LIMIT_WINDOW_MS) {
        pairingRedeemAttempts.delete(entryKey);
      }
    }
    const entry = pairingRedeemAttempts.get(key);
    if (!entry) {
      pairingRedeemAttempts.set(key, { count: 1, firstAttemptAt: now });
      return { allowed: true, remaining: PAIRING_REDEEM_RATE_LIMIT_MAX_ATTEMPTS - 1, reset: Math.ceil((now + PAIRING_REDEEM_RATE_LIMIT_WINDOW_MS) / 1000) };
    }
    const reset = Math.ceil((entry.firstAttemptAt + PAIRING_REDEEM_RATE_LIMIT_WINDOW_MS) / 1000);
    if (entry.count >= PAIRING_REDEEM_RATE_LIMIT_MAX_ATTEMPTS) {
      return {
        allowed: false,
        remaining: 0,
        reset,
        retryAfter: Math.max(1, Math.ceil((entry.firstAttemptAt + PAIRING_REDEEM_RATE_LIMIT_WINDOW_MS - now) / 1000))
      };
    }
    entry.count += 1;
    return { allowed: true, remaining: PAIRING_REDEEM_RATE_LIMIT_MAX_ATTEMPTS - entry.count, reset };
  };
  const clearPairingRedeemRateLimit = (req: Request) => {
    pairingRedeemAttempts.delete(`${requestIp(req)}:${pairingIdFromRequest(req)}`);
  };
  const pairingServerCandidates = async (
    req: Request,
    { preferredServerUrl, includeRelay, includeDirect = true }: { preferredServerUrl?: JsonValue | undefined; includeRelay?: boolean | undefined; includeDirect?: boolean } = {},
  ) => {
    const candidates: CandidateEntry[] = [];
    if (includeDirect) {
      const preferred = normalizeCandidateUrl(preferredServerUrl);
      const origin = normalizeCandidateUrl(requestOrigin(req));
      const direct = preferred || origin;
      if (direct) {
        candidates.push({ type: candidateUrlType(direct), url: direct, priority: 10 });
      }
      if (origin && direct && origin !== direct && !isLoopbackCandidateUrl(origin)) {
        candidates.push({ type: candidateUrlType(origin), url: origin, priority: 20 });
      }
    }
    if (includeRelay !== false) {
      try {
        const relayCandidate = await getRelayPairingCandidate({ ensureEnabled: includeRelay === true });
        if (relayCandidate)
          candidates.push(relayCandidate);
      } catch { void 0; }
    }
    return candidates;
  };
  const sendPairingRedeemError = (res: Response, statusCode: number) => {
    res.status(statusCode).json({ error: 'Invalid or expired pairing session' });
  };
  const selfAuthenticatedApiPaths = new Set(['/api/git/repository-credential']);
  const isGuestOauthCallback = (req: Request) => req.method === 'GET' && /^\/(?:guests\/[a-z][a-z0-9-]*|tracker\/ext-[a-z][a-z0-9-]*)\/oauth\/callback$/.test(req.path || '');
  const isMcpOauthCallback = (req: Request) => req.method === 'GET' && /^\/mcp\/oauth\/[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?\/callback$/.test(req.path || '');
  const isFilePreviewRead = (req: Request) => req.method === 'GET' && /^\/fs\/preview\/[^/]+\/./.test(req.path || '');
  const isGuestFrameFileRead = (req: Request) => req.method === 'GET' && /^\/guest-files\/[^/]+\/./.test(req.path || '');
  const requireApiAuth: RequestHandler = async (req, res, next) => {
    const pathname = (req.originalUrl || '').split('?', 1).join('');
    if (selfAuthenticatedApiPaths.has(pathname))
      return next();
    if (isGuestOauthCallback(req) || isMcpOauthCallback(req) || isFilePreviewRead(req) || isGuestFrameFileRead(req)) {
      return next();
    }
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === 'tunnel' || requestScope === 'unknown-public') {
      return tunnelAuthController.requireTunnelSession?.(req, res, next);
    }
    return uiAuthController.requireAuth?.(req, res, next);
  };
  app.get("/auth/session", async (req, res) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      const tunnelSession = tunnelAuthController.getTunnelSessionFromRequest(req);
      if (tunnelSession) {
        return res.json({ authenticated: true, scope: "tunnel" });
      }
      tunnelAuthController.clearTunnelSessionCookie(req, res);
      return res.status(401).json({ authenticated: false, locked: true, tunnelLocked: true });
    }
    try {
      await uiAuthController.handleSessionStatus(req, res);
    } catch {
      res.status(500).json({ error: "Internal server error" });
    }
  });
  app.post("/auth/session", (req, res) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.status(403).json({ error: "Password login is disabled for tunnel scope", tunnelLocked: true });
    }
    return uiAuthController.handleSessionCreate(req, res);
  });
  app.post("/auth/url-token", async (req, res, next) => {
    try {
      await uiAuthController.handleUrlAuthToken(req, res);
    } catch (error) {
      next(error);
    }
  });
  app.get("/auth/passkey/status", (req, res) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.json({ enabled: false, hasPasskeys: false, passkeyCount: 0, rpID: null, tunnelLocked: true });
    }
    return uiAuthController.handlePasskeyStatus(req, res);
  });
  app.post("/auth/passkey/authenticate/options", (req, res) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.status(403).json({ error: "Passkey login is disabled for tunnel scope", tunnelLocked: true });
    }
    return uiAuthController.handlePasskeyAuthenticationOptions(req, res);
  });
  app.post("/auth/passkey/authenticate/verify", (req, res) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.status(403).json({ error: "Passkey login is disabled for tunnel scope", tunnelLocked: true });
    }
    return uiAuthController.handlePasskeyAuthenticationVerify(req, res);
  });
  app.post("/auth/passkey/register/options", async (req, res, next) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.status(403).json({ error: "Passkey setup is disabled for tunnel scope", tunnelLocked: true });
    }
    try {
      await uiAuthController.requireSessionAuth?.(req, res, async () => {
        await uiAuthController.handlePasskeyRegistrationOptions(req, res);
      });
    } catch (error) {
      next(error);
    }
  });
  app.post("/auth/passkey/register/verify", async (req, res, next) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.status(403).json({ error: "Passkey setup is disabled for tunnel scope", tunnelLocked: true });
    }
    try {
      await uiAuthController.requireSessionAuth?.(req, res, async () => {
        await uiAuthController.handlePasskeyRegistrationVerify(req, res);
      });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/passkeys", async (req, res, next) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.status(403).json({ error: "Passkey management is disabled for tunnel scope", tunnelLocked: true });
    }
    try {
      await uiAuthController.requireSessionAuth?.(req, res, async () => {
        await uiAuthController.handlePasskeyList(req, res);
      });
    } catch (error) {
      next(error);
    }
  });
  app.delete("/api/passkeys/:id", async (req, res, next) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.status(403).json({ error: "Passkey management is disabled for tunnel scope", tunnelLocked: true });
    }
    try {
      await uiAuthController.requireSessionAuth?.(req, res, async () => {
        await uiAuthController.handlePasskeyRevoke(req, res);
      });
    } catch (error) {
      next(error);
    }
  });
  app.patch("/api/passkeys/:id", express.json({ limit: "8kb" }), async (req, res, next) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.status(403).json({ error: "Passkey management is disabled for tunnel scope", tunnelLocked: true });
    }
    try {
      await uiAuthController.requireSessionAuth?.(req, res, async () => {
        if (!uiAuthController.handlePasskeyRename) {
          throw new TypeError("uiAuthController.handlePasskeyRename is not a function");
        }
        await uiAuthController.handlePasskeyRename(req, res);
      });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/auth/reset", async (req, res, next) => {
    const requestScope = tunnelAuthController.classifyRequestScope?.(req);
    if (requestScope === "tunnel" || requestScope === "unknown-public") {
      return res.status(403).json({ error: "Global sign-out is disabled for tunnel scope", tunnelLocked: true });
    }
    try {
      await uiAuthController.requireSessionAuth?.(req, res, async () => {
        await uiAuthController.handleResetAuth(req, res);
      });
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/client-auth/clients", async (req, res, next) => {
    await runWithClientManagementAuth(req, res, next, async (authContext) => {
      if (authContext.type === "client") {
        const client = await clientRecordFromAuthContext(authContext);
        if (client?.clientKind !== "desktop-local") {
          return res.json({ clients: client ? [client] : [] });
        }
      }
      const clients = await remoteClientAuthRuntime.listClients();
      res.json({ clients });
    });
  });
  app.post("/api/client-auth/clients", express.json({ limit: "64kb" }), async (req, res, next) => {
    await runWithClientCreateAuth(req, res, next, async () => {
      const body = parseJsonObject(req.body) ?? {};
      const result = await remoteClientAuthRuntime.createClient({
        label: body.label,
        clientKind: body.clientKind,
        dedupeKey: body.dedupeKey,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json(result);
    });
  });
  app.delete('/api/client-auth/clients/:id', async (req, res, next) => {
    await runWithClientManagementAuth(req, res, next, async (authContext) => {
      const targetClientId = req.params?.id ?? '';
      if (authContext.type === 'client') {
        const actingClient = await clientRecordFromAuthContext(authContext);
        if (actingClient?.clientKind !== 'desktop-local') {
          const clientId = clientIdFromAuthContext(authContext);
          if (!clientId || clientId !== targetClientId) {
            return res.status(403).json({ revoked: false, error: 'Client tokens can only revoke themselves' });
          }
        }
      }
      const result = await remoteClientAuthRuntime.revokeClient(targetClientId);
      if (!result.revoked) {
        return res.status(404).json({ revoked: false, error: 'Client not found' });
      }
      await removeClientPushDevices([targetClientId]).catch((error) => {
        console.warn('Failed to remove push registrations of a revoked client:', error instanceof Error ? error.message : error);
      });
      reconcileRelay();
      res.json(result);
    });
  });
  app.delete("/api/client-auth/clients", async (req, res, next) => {
    await runWithClientManagementAuth(req, res, next, async (authContext) => {
      if (authContext.type === "client") {
        const actingClient = await clientRecordFromAuthContext(authContext);
        if (actingClient?.clientKind !== "desktop-local") {
          return res.status(403).json({ purged: 0, error: "Client tokens cannot purge revoked devices" });
        }
      }
      const clients = await remoteClientAuthRuntime.listClients();
      await removeClientPushDevices(clients.filter((client) => client.revokedAt).map((client) => client.id));
      const result = await remoteClientAuthRuntime.purgeRevokedClients();
      reconcileRelay();
      res.json(result);
    });
  });
  app.post("/api/client-auth/pairing/sessions", express.json({ limit: "64kb" }), async (req, res, next) => {
    await runWithClientCreateAuth(req, res, next, async (authContext) => {
      const body = parseJsonObject(req.body) ?? {};
      const candidates = await pairingServerCandidates(req, {
        preferredServerUrl: body.serverUrl,
        includeRelay: isBoolean(body.includeRelay) ? body.includeRelay : undefined,
        includeDirect: body.includeDirect !== false,
      });
      const usesRelay = candidates.some((candidate) => candidate.type === 'relay');
      const result = await clientPairingRuntime.createPairingSession({
        label: body.label,
        allowedClientKinds: body.allowedClientKinds,
        createdByClientId: clientIdFromAuthContext(authContext),
        usesRelay,
        localOnly: isLocalOnlyCandidateSet(candidates),
      });
      reconcileRelay();
      res.setHeader('Cache-Control', 'no-store');
      res.status(201).json({
        ...result,
        server: { label: getServerLabel(), candidates },
      });
    });
  });
  app.get('/api/client-auth/connection/candidates', async (req, res, next) => {
    await runWithClientManagementAuth(req, res, next, async (authContext) => {
      const candidates: CandidateEntry[] = [];
      const directUrls = (() => {
        try {
          const urls = getDirectCandidateUrls(req);
          return Array.isArray(urls) ? urls : [];
        } catch {
          return [];
        }
      })();
      for (const url of directUrls) {
        const normalized = normalizeCandidateUrl(url);
        if (normalized)
          candidates.push({ type: "lan", url: normalized, priority: 10 });
      }
      const bearerToken = getBearerTokenFromRequest(req);
      const bearerClient = bearerToken ? await remoteClientAuthRuntime.authenticateBearerToken(bearerToken, req) : null;
      const actingClient = bearerClient?.client ?? (authContext.type === "client" ? await clientRecordFromAuthContext(authContext) : null);
      if (actingClient?.localOnly !== true) {
        try {
          const relayCandidate = await getRelayPairingCandidate({ ensureEnabled: false });
          if (relayCandidate)
            candidates.push(relayCandidate);
        } catch { void 0; }
      }
      let serverId = null;
      try {
        const value = await getServerId();
        serverId = value && value.trim() ? value.trim() : null;
      } catch {
        serverId = null;
      }
      res.setHeader("Cache-Control", "no-store");
      interface ConnectionCandidatesResponse {
        label: string;
        serverId?: string;
        candidates: CandidateEntry[];
      }
      const responsePayload: ConnectionCandidatesResponse = {
        label: getServerLabel(),
        candidates,
      };
      if (serverId)
        responsePayload.serverId = serverId;
      res.json(responsePayload);
    });
  });
  app.get("/api/client-auth/pairing/transports", async (req, res, next) => {
    await runWithClientCreateAuth(req, res, next, async () => {
      res.setHeader("Cache-Control", "no-store");
      res.json(await getPairingTransports(req));
    });
  });
  app.get("/api/client-auth/pairing/sessions", async (req, res, next) => {
    await runWithClientCreateAuth(req, res, next, async () => {
      const pending = await clientPairingRuntime.listPendingSessions();
      res.setHeader("Cache-Control", "no-store");
      res.json({ pending });
    });
  });
  app.delete("/api/client-auth/pairing/sessions/:id", async (req, res, next) => {
    await runWithClientCreateAuth(req, res, next, async () => {
      const result = await clientPairingRuntime.cancelPairingSession(req.params?.id ?? '');
      if (!result.cancelled) {
        return res.status(404).json({ cancelled: false, error: "Pairing session not found" });
      }
      reconcileRelay();
      res.json(result);
    });
  });
  app.post("/api/client-auth/pairing/redeem", express.json({ limit: "64kb" }), async (req, res, next) => {
    try {
      const rateLimit = checkPairingRedeemRateLimit(req);
      res.setHeader("X-RateLimit-Limit", PAIRING_REDEEM_RATE_LIMIT_MAX_ATTEMPTS);
      res.setHeader("X-RateLimit-Remaining", rateLimit.remaining);
      res.setHeader("X-RateLimit-Reset", rateLimit.reset);
      if (!rateLimit.allowed) {
        if (rateLimit.retryAfter !== undefined) res.setHeader('Retry-After', rateLimit.retryAfter);
        return res.status(429).json({ error: 'Invalid or expired pairing session' });
      }
      const body = parseJsonObject(req.body) ?? {};
      const result = await clientPairingRuntime.redeemPairingSession({
        pairingId: body.pairingId,
        secret: body.secret,
        clientLabel: body.clientLabel,
        clientKind: body.clientKind,
        deviceName: body.deviceName,
        devicePlatform: body.devicePlatform,
        deviceModel: body.deviceModel,
        appVersion: body.appVersion,
        dedupeKey: body.dedupeKey,
      });
      clearPairingRedeemRateLimit(req);
      if (result.replacedClientIds?.length) {
        await removeClientPushDevices(result.replacedClientIds).catch((error) => {
          console.warn('Failed to remove push registrations of a replaced client:', error instanceof Error ? error.message : error);
        });
      }
      reconcileRelay();
      res.setHeader('Cache-Control', 'no-store');
      res.json({
        ok: true,
        server: {
          label: getServerLabel(),
          url: requestOrigin(req),
          fingerprint: result.pairing?.fingerprint || null,
        },
        client: result.client,
        clientToken: result.token,
      });
    } catch (error) {
      const parsedError = errorDetailsSchema.safeParse(error).data;
      if (parsedError?.message === 'Invalid or expired pairing session') {
        sendPairingRedeemError(res, parsedError.statusCode ?? 400);
        return;
      }
      next(error);
    }
  });
  app.get("/connect", async (req, res) => {
    try {
      const token = isString(req.query?.t) ? req.query.t : "";
      const settings = await readSettingsFromDiskMigrated();
      const tunnelSessionTtlMs = normalizeTunnelSessionTtlMs(settings?.tunnelSessionTtlMs);
      const exchange = tunnelAuthController.exchangeBootstrapToken({
        req,
        res,
        token,
        sessionTtlMs: tunnelSessionTtlMs
      });
      res.setHeader("Cache-Control", "no-store");
      if (!exchange.ok) {
        if (exchange.reason === "rate-limited") {
          res.setHeader("Retry-After", String(exchange.retryAfter || 60));
          return res.status(429).type("text/plain").send("Too many attempts. Please try again later.");
        }
        return res.status(401).type("text/plain").send("Connection link is invalid or expired.");
      }
      return res.redirect(302, "/");
    } catch {
      return res.status(500).type("text/plain").send("Failed to process connect request.");
    }
  });
  app.post("/api/system/probe-url", express.json({ limit: "16kb" }), async (req, res, next) => {
    try {
      await requireApiAuth(req, res, async () => {
        const parsedBody = probeUrlBodySchema.safeParse(req.body);
        const url = parsedBody.success ? parseLoopbackUrl(parsedBody.data.url) : null;
        if (!url) {
          return res.status(400).json({ ok: false, error: 'Invalid loopback URL' });
        }
        try {
          const response = await fetch(url.toString(), {
            method: 'GET',
            redirect: 'manual',
            signal: AbortSignal.timeout(1500),
          });
          return res.json({ ok: response.status >= 200 && response.status < 600, status: response.status });
        } catch (error) {
          const message = formatErrorDetail(errorDetailsSchema.safeParse(error).data, error instanceof Error ? error.message : 'Probe failed');
          return res.json({ ok: false, error: message });
        }
      });
    } catch (error) {
      next(error);
    }
  });
  app.get('/api/host/legacy-data', async (req, res, next) => {
    try {
      await requireApiAuth(req, res, async () => {
        res.setHeader('Cache-Control', 'no-store');
        res.json({ present: Boolean(await getLegacyDataPresence()) });
      });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", async (req, res, next) => {
    if (isRouteGatedApiRequest(req)) return next();
    try {
      await requireApiAuth(req, res, next);
    } catch (err) {
      next(err);
    }
  });
};

export const registerSettingsUtilityRoutes = (app: Application, dependencies: SettingsUtilityRouteDependencies) => {
  const {
    readCustomThemesFromDisk,
    saveImportedTheme,
    deleteImportedTheme,
  } = dependencies;

  app.get('/api/config/themes', async (_req, res) => {
    try {
      const customThemes = await readCustomThemesFromDisk();
      res.json({ themes: customThemes });
    } catch (error) {
      console.error('Failed to load custom themes:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load custom themes' });
    }
  });

  app.post('/api/config/themes', async (req, res) => {
    try {
      const theme = await saveImportedTheme((parseJsonObject(req.body) ?? {}).theme);
      res.status(201).json({ theme });
    } catch (error) {
      if (error instanceof ThemeImportStorageError) {
        res.status(error.status).json({ error: error.code });
        return;
      }
      console.error('[themes] Failed to save imported theme');
      res.status(500).json({ error: 'save' });
    }
  });

  registerThemeCatalogRoutes(app);
  app.delete('/api/config/themes/:id', async (req, res) => {
    try {
      await deleteImportedTheme(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(error instanceof ThemeImportStorageError ? error.status : 500).json({ error: 'delete' });
    }
  });
};

export const registerCommonRequestMiddleware = (app: Application, dependencies: CommonRequestMiddlewareDependencies) => {
  const { express, verboseRequestLogs = false, skipBodyParsing = () => false } = dependencies;

  app.use((req, res, next) => {
    if (skipBodyParsing(req)) {
      next();
    } else if (req.path === '/api/config/themes' || req.path.startsWith('/api/config/themes/')) {
      express.json({ limit: '1mb' })(req, res, next);
    } else if (req.path.startsWith('/api/behavior')) {
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      if (contentLength > 1024 * 1024) {
        return res.status(413).json({ error: 'Content exceeds maximum size of 1048576 bytes' });
      }
      express.json({ limit: '1mb' })(req, res, next);
    } else if (req.path.startsWith('/api/source-control')) {
      express.json({ limit: '256kb' })(req, res, next);
    } else if (
      req.path.startsWith('/api/config/agents') ||
      req.path.startsWith('/api/config/settings') ||
      req.path.startsWith('/api/projects') ||
      req.path.startsWith('/api/fs') ||
      req.path.startsWith('/api/git') ||
      req.path.startsWith('/api/magic-prompts') ||
      req.path.startsWith('/api/prompts') ||
      req.path.startsWith('/api/terminal') ||
      req.path.startsWith('/api/opencode') ||
      req.path === '/api/openchamber/directory' ||
      req.path.startsWith('/api/push') ||
      req.path.startsWith('/api/notifications') ||
      req.path.startsWith('/api/message-queue') ||
      req.path.startsWith('/api/provider') ||
      req.path.startsWith('/api/session-folders') ||
      req.path.startsWith('/api/walkthrough') ||
      req.path.startsWith('/api/text') ||
      req.path.startsWith('/api/voice') ||
      req.path.startsWith('/api/environment') ||
      req.path.startsWith('/api/tts') ||
      req.path.startsWith('/api/openchamber/tunnel') ||
      req.path.startsWith('/api/openchamber/spaces')
    ) {
      express.json({ limit: '50mb' })(req, res, next);
    } else if (req.path.startsWith('/api')) {
      next();
    } else {
      express.json({ limit: '50mb' })(req, res, next);
    }
  });

  const urlencoded = express.urlencoded({ extended: true, limit: '50mb' });
  app.use((req, res, next) => {
    if (req.path === '/api/agent/v1' || req.path.startsWith('/api/agent/v1/') || skipBodyParsing(req)) {
      next();
      return;
    }
    urlencoded(req, res, next);
  });

  app.use((req, _res, next) => {
    if (verboseRequestLogs) {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    }
    next();
  });
};
