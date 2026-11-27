import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { EXIT_CODE, TunnelCliError } from './cli-errors.js';
import {
  assertSafeBrowserPort,
  resolveConfiguredBindHost,
  buildLocalUrl,
  detectLanIPv4Address,
  formatHostForUrl,
} from './cli-network.js';
import { discoverRunningInstances } from './cli-lifecycle.js';
import { getInstanceFilePath, hasInstanceFields, readInstanceOptions } from './cli-process.js';
import { createRemoteClientAuthRuntime } from '../../server/lib/client-auth/remote-clients.js';
import { createClientPairingRuntime } from '../../server/lib/client-auth/pairing.js';
import { createRelayIdentityRuntime } from '../../server/lib/relay/identity.js';
import { createRelayKeyStore, type RelayLegacySettings } from '../../server/lib/relay/key-store.js';
import { pinnedRelayUrl, type RelayPairingCandidate } from '../../server/lib/relay/service.js';
import { bytesToBase64Url } from '../../server/lib/relay/e2ee.js';
import { createSettingsAccessors as createSettingsAccessorsModule } from './cli-settings-accessors.js';
import { isString } from '../../server/lib/shared/object-guards.js';
import type { JsonObject, JsonValue } from '../../server/lib/shared/json-values.js';
import { parseJsonObject } from '../../server/lib/shared/json-values.js';
import type { CliOptions } from './cli-args.js';
import type { ServeOptions } from './commands-serve.js';
import {
  intro as clackIntro,
  outro as clackOutro,
  log as clackLog,
  isJsonMode,
  isQuietMode,
  printJson,
  logStatus,
} from '../cli-output.js';

const REMOTE_CLIENTS_FILE_NAME = 'remote-clients.json';
const PAIRING_SESSIONS_FILE_NAME = 'client-pairing-sessions.json';

type ConnectSettings = JsonObject;

type DirectPairingCandidate = {
  type: 'tunnel' | 'lan';
  url: string;
  priority: number;
};

type ConnectRelayCandidate = {
  type: 'relay';
  relayUrl: string;
  serverId: string;
  hostEncPubJwk: {
    kty?: string | undefined;
    crv?: string | undefined;
    x?: string | undefined;
    y?: string | undefined;
  };
  priority: number;
};

type ConnectCandidate = DirectPairingCandidate | ConnectRelayCandidate;

type PairingPayload = {
  v: 2;
  pairingId: string;
  secret: string;
  label?: string;
  fingerprint?: string;
  expiresAt?: string;
  candidates: ConnectCandidate[];
};

export interface ConnectUrlCommandDependencies {
  serveCommand: (options: ServeOptions) => Promise<number>;
}

export type ConnectUrlOptions = Partial<Omit<CliOptions, 'port'>> & {
  port?: number | undefined;
  apiOnly?: boolean | undefined;
};

function isValidRelayUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'ws:' || url.protocol === 'wss:';
  } catch {
    return false;
  }
}

function resolveRelayUrl(settings: ConnectSettings | null | undefined): string | null {
  const pinned = pinnedRelayUrl();
  if (pinned) return pinned;
  const stored = (parseJsonObject(settings?.privateRelay) ?? {}).relayUrl;
  if (isValidRelayUrl(stored)) return stored.trim();
  return null;
}

function createSettingsAccessors() {
  return createSettingsAccessorsModule({
    fsPromises: fs.promises,
    path,
    dataDir: getOpenChamberDataDir(),
    settingsFileName: 'settings.json',
  });
}

function toConnectRelayCandidate(candidate: RelayPairingCandidate): ConnectRelayCandidate {
  return {
    type: 'relay',
    relayUrl: candidate.relayUrl,
    serverId: candidate.serverId,
    hostEncPubJwk: {
      kty: candidate.hostEncPubJwk.kty,
      crv: candidate.hostEncPubJwk.crv,
      x: candidate.hostEncPubJwk.x,
      y: candidate.hostEncPubJwk.y,
    },
    priority: candidate.priority,
  };
}

async function buildRelayPairingCandidate(): Promise<{
  enabled: boolean;
  relayUrl: string | null;
  serverId: string | null;
  candidate: ConnectRelayCandidate | null;
}> {
  const accessors = createSettingsAccessors();
  const rawSettings = await accessors.readSettingsFromDiskMigrated();
  const settings = parseJsonObject(rawSettings) ?? {};
  const privateRelay = parseJsonObject(settings.privateRelay) ?? {};
  const relayUrl = resolveRelayUrl(settings);
  if (!relayUrl) {
    return {
      enabled: privateRelay.enabled === true,
      relayUrl: null,
      serverId: null,
      candidate: null,
    };
  }
  const relayKeyStore = createRelayKeyStore({
    fsPromises: fs.promises,
    path,
    dataDir: getOpenChamberDataDir(),
    readSettingsFromDiskMigrated: async (): Promise<RelayLegacySettings> => {
      const loaded = await accessors.readSettingsFromDiskMigrated();
      return parseJsonObject(loaded) ?? {};
    },
    readSettingsStrict: accessors.readSettingsStrict,
    updateSettingsFromDisk: accessors.updateSettingsFromDisk,
  });
  const identityRuntime = createRelayIdentityRuntime({ crypto, relayKeyStore });
  const identity = await identityRuntime.getRelayIdentity();
  return {
    enabled: privateRelay.enabled === true,
    relayUrl,
    serverId: identity.serverId,
    candidate: toConnectRelayCandidate({
      type: 'relay',
      relayUrl,
      serverId: identity.serverId,
      hostEncPubJwk: identity.hostEncPubJwk,
      priority: 30,
    }),
  };
}

function createCliPairingRuntime() {
  const dataDir = getOpenChamberDataDir();
  const remoteClientAuthRuntime = createRemoteClientAuthRuntime({
    fsPromises: fs.promises,
    path,
    crypto,
    storePath: path.join(dataDir, REMOTE_CLIENTS_FILE_NAME),
  });
  return createClientPairingRuntime({
    fsPromises: fs.promises,
    path,
    crypto,
    storePath: path.join(dataDir, PAIRING_SESSIONS_FILE_NAME),
    remoteClientAuthRuntime,
  });
}

function encodePairingConnectUrl(payload: PairingPayload): string {
  const encoded = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  return `ohpichamber://connect?v=2&p=${encoded}`;
}

function buildPairingPayload({
  pairing,
  label,
  candidates,
}: {
  pairing: { id: string; secret: string; fingerprint?: string | undefined; expiresAt?: string | undefined };
  label: string;
  candidates: ConnectCandidate[];
}): PairingPayload {
  const payload: PairingPayload = {
    v: 2,
    pairingId: pairing.id,
    secret: pairing.secret,
    candidates,
  };
  if (label) payload.label = label;
  if (pairing.fingerprint) payload.fingerprint = pairing.fingerprint;
  if (pairing.expiresAt) payload.expiresAt = pairing.expiresAt;
  return payload;
}

async function resolveConnectUrlServerUrl(options: ConnectUrlOptions & { port: number }): Promise<{
  serverUrl: string;
  source: 'configured-host' | 'loopback-fallback' | 'lan-detected';
}> {
  let hostOverride: JsonValue | undefined = options.host;
  if (!isString(hostOverride) && !process.env.OPENCHAMBER_HOST) {
    const storedRaw = readInstanceOptions(await getInstanceFilePath(options.port));
    const storedOptions = hasInstanceFields(storedRaw) ? storedRaw : null;
    if (isString(storedOptions?.host) && storedOptions.host.trim()) {
      hostOverride = storedOptions.host.trim();
    }
  }

  const bindHost = resolveConfiguredBindHost(hostOverride);
  const hostAsServerUrl = normalizeServerUrlForConnection(bindHost);
  if (hostAsServerUrl) {
    return { serverUrl: hostAsServerUrl, source: 'configured-host' };
  }

  if (!isWildcardBindHost(bindHost)) {
    return {
      serverUrl: buildLocalUrl(options.port, '/', hostOverride).replace(/\/+$/, ''),
      source: 'configured-host',
    };
  }

  const lanAddress = await detectLanIPv4Address();
  if (!lanAddress) {
    return {
      serverUrl: buildLocalUrl(options.port, '/').replace(/\/+$/, ''),
      source: 'loopback-fallback',
    };
  }

  return {
    serverUrl: `http://${formatHostForUrl(lanAddress)}:${options.port}`,
    source: 'lan-detected',
  };
}

function isWildcardBindHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::' || host === '[::]';
}

function isLoopbackServerUrl(serverUrl: string): boolean {
  try {
    const hostname = new URL(serverUrl).hostname.replace(/^\[|\]$/g, '');
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
}

function normalizeServerUrlForConnection(value: string | null | undefined): string | null {
  const trimmed = isString(value) ? value.trim() : '';
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function getOpenChamberDataDir(): string {
  return process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'ohpichamber');
}

async function displayTunnelQrCode(url: string): Promise<void> {
  try {
    const qrcode = await import('qrcode-terminal');
    console.log('\n📱 Scan this QR code to access the tunnel:\n');
    qrcode.default.generate(url, { small: true });
    console.log('');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Could not generate QR code: ${message}`);
  }
}

function createConnectUrlCommand({ serveCommand }: ConnectUrlCommandDependencies) {
  return async function connectUrlCommand(options: ConnectUrlOptions = {}) {
    assertSafeBrowserPort(options.port, { context: 'OhPiChamber connect-url' });
    const targetPort = options.port ?? 3000;
    const explicitServerUrl = options.server ? normalizeServerUrlForConnection(options.server) : null;
    if (options.server && !explicitServerUrl) {
      throw new TunnelCliError('Invalid --server URL. Use an http:// or https:// URL.', EXIT_CODE.USAGE_ERROR);
    }

    const relay = await buildRelayPairingCandidate();
    if (options.relay && !relay.candidate) {
      throw new TunnelCliError(
        'No relay URL is configured. Set OPENCHAMBER_RELAY_URL or privateRelay.relayUrl in settings.json.',
        EXIT_CODE.USAGE_ERROR,
      );
    }
    const running = await discoverRunningInstances();
    const serverState = running.some((entry) => entry.port === targetPort)
      ? { port: targetPort, autoStarted: false }
      : await (async () => {
        await serveCommand({
          port: targetPort,
          explicitPort: true,
          host: options.host,
          uiPassword: options.uiPassword,
          apiOnly: options.apiOnly,
          suppressUnsafePortWarning: true,
          suppressUiPasswordWarning: true,
          suppressStartupSummary: true,
          suppressQuietOutput: true,
        });
        return { port: targetPort, autoStarted: true };
      })();

    const resolvedServerUrl = explicitServerUrl
      ? { serverUrl: explicitServerUrl, source: 'explicit' as const }
      : await resolveConnectUrlServerUrl({ ...options, port: targetPort });
    const serverUrl = resolvedServerUrl.serverUrl;
    const label = options.name || os.hostname();

    const candidates: ConnectCandidate[] = [
      { type: serverUrl.startsWith('https://') ? 'tunnel' : 'lan', url: serverUrl, priority: 10 },
    ];
    const relayCandidate = relay.candidate && (options.relay || relay.enabled) ? relay.candidate : null;
    if (relayCandidate) candidates.push(relayCandidate);

    const pairingRuntime = createCliPairingRuntime();
    const usesRelay = candidates.some((candidate) => candidate.type === 'relay');
    const { pairing } = await pairingRuntime.createPairingSession({ label, usesRelay });
    const connectUrl = encodePairingConnectUrl(buildPairingPayload({ pairing, label, candidates }));

    if (isJsonMode(options)) {
      printJson({
        serverUrl,
        connectUrl,
        pairingId: pairing.id,
        fingerprint: pairing.fingerprint,
        expiresAt: pairing.expiresAt,
        candidates,
        autoStarted: serverState.autoStarted,
      });
      return;
    }

    if (isQuietMode(options)) {
      process.stdout.write(`${connectUrl}\n`);
      return;
    }

    clackIntro('OhPiChamber pairing link');
    if (serverState.autoStarted) {
      logStatus('success', `started OhPiChamber on port ${targetPort}`);
    }
    logStatus('success', connectUrl);
    clackLog.info(`Server URL: ${serverUrl}`);
    if (relayCandidate) {
      clackLog.info(`Relay fallback: ${relay.relayUrl}`);
    }
    if (relayCandidate && options.relay && !relay.enabled) {
      logStatus('info', '[RELAY_STARTING]', 'Relay is not up yet. A running instance starts it within a minute; a stopped instance starts it on next launch.');
    }
    if (pairing.fingerprint) {
      clackLog.info(`Fingerprint: ${pairing.fingerprint}`);
    }
    if (resolvedServerUrl.source === 'lan-detected') {
      clackLog.info('Detected a LAN address because OhPiChamber is bound to all interfaces. Use --server to override it.');
    } else if (resolvedServerUrl.source === 'loopback-fallback') {
      clackLog.warn('OhPiChamber is bound to all interfaces, but no LAN address was detected. Use --server to provide a reachable URL.');
    } else if (isLoopbackServerUrl(serverUrl)) {
      logStatus('info', '[LOOPBACK_URL]', 'This link uses localhost for direct connections. For another device, use --server with a reachable address or include --relay.');
    }
    clackLog.info('Scan or paste this link into another OhPiChamber client. It is single-use and expires.');
    if (options.qr === true) {
      await displayTunnelQrCode(connectUrl);
    }
    clackOutro('pairing link generated');
  };
}

export { createConnectUrlCommand };
