import { credentialAccessToken } from './selected-credential.js';
import {
  asObject,
  buildResult,
  toNumber,
  toTimestamp,
  toUsageWindow,
} from '../utils/index.js';
import { z } from "zod";


export interface ConsoleGoCredential {
  access: string;
  orgID: string;
  expires: number | null;
}

const KEY_AUTH_FAILED = 'OpenCode Go authentication failed';

export interface OpenCodeGoQuotaDependencies {
  readAuth?: () => LegacyAuthFile | Promise<LegacyAuthFile>;
  fetchImpl?: typeof fetch;
  readBudgets?: () => ConsoleBudgetsRead | null | Promise<ConsoleBudgetsRead | null>;
}

interface GoPayload {
  usage?: unknown;
  access?: unknown;
  meters?: unknown;
  availableMicroCents?: unknown;
  error?: unknown;
  code?: unknown;
  product?: unknown;
}

interface ApiKeyMeters {
  rolling?: unknown;
  weekly?: unknown;
  monthly?: unknown;
}

interface ConsoleMeters {
  fiveHour?: unknown;
  week?: unknown;
  month?: unknown;
}

interface GoMeter {
  percent?: unknown;
  resetsAt?: unknown;
  limitMicroCents?: unknown;
  usedMicroCents?: unknown;
}

interface GoAuthFields {
  label?: unknown;
  key?: unknown;
  token?: unknown;
  type?: unknown;
  access?: unknown;
  orgID?: unknown;
  server?: unknown;
  expires?: unknown;
}

interface ConsoleFailure {
  error?: unknown;
}

const isObject = (value: unknown): value is Record<string, unknown> => asObject(value) !== null;
const asPayload = z.custom<GoPayload | null>(isObject).catch(null).parse;
const asApiKeyMeters = z.custom<ApiKeyMeters | null>(isObject).catch(null).parse;
const asConsoleMeters = z.custom<ConsoleMeters | null>(isObject).catch(null).parse;
const asMeter = z.custom<GoMeter | null>(isObject).catch(null).parse;
const asAuthFields = z.custom<GoAuthFields | null>(isObject).catch(null).parse;
const isString = (value: unknown): value is string => typeof value === 'string';

export const providerId = 'opencode-go';
export const providerName = 'OpenCode Go';
const API_KEY_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';
const REQUEST_TIMEOUT_MS = 15_000;

const API_KEY_WINDOW_FIELDS = {
  '5h': 'rolling',
  weekly: 'weekly',
  monthly: 'monthly',
} satisfies Record<string, keyof ApiKeyMeters>;


const clampPercent = (value: number) => Math.min(100, Math.max(0, value));

export const parseOpenCodeGoUsage = z.unknown().transform((payload) => {
  const usage = asPayload(payload) ? asApiKeyMeters(asPayload(payload)?.usage) : null;
  if (!usage) return {};
  const windows: Record<string, UsageWindow> = {};
  for (const [key, field] of Object.entries(API_KEY_WINDOW_FIELDS)) {
    const entry = asMeter(usage[field]);
    if (!entry) continue;
    const usedPercent = toNumber(entry.percent);
    const resetAt = toTimestamp(entry.resetsAt);
    if (usedPercent === null || resetAt === null) continue;
    windows[key] = toUsageWindow({
      usedPercent: clampPercent(usedPercent),
      resetAt,
      windowSeconds: null,
    });
  }
  return windows;
}).parse;


export const fetchOpenCodeGoUsage = async (apiKey, fetchImpl = fetch) => {
  const response = await fetchImpl(API_KEY_USAGE_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'x-opencode-session': 'openchamber-usage',
      'User-Agent': 'OhPiChamber quota provider',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(KEY_AUTH_FAILED);
  }
  if (!response.ok) throw new Error(`OpenCode Go usage API returned HTTP ${response.status}`);
  const windows = parseOpenCodeGoUsage(await response.json().catch(() => null));
  if (Object.keys(windows).length === 0) throw new Error('OpenCode Go usage data could not be parsed');
  return windows;
};



export const isConfigured = (credential) => Boolean(credentialAccessToken(credential));

export const fetchQuota = async ({ credential, fetchImpl = fetch } = {}) => {
  try {
    const access = credentialAccessToken(credential);
    if (!access) return buildResult({ providerId, providerName, ok: false, configured: false, error: 'Not configured' });
    if (credential.type === 'oauth') return buildResult({ providerId, providerName, ok: false, configured: true, error: 'Selected native OAuth credential is unsupported for OpenCode Go quota' });
    const windows = await fetchOpenCodeGoUsage(access, fetchImpl);
    return buildResult({ providerId, providerName, ok: true, configured: true, usage: { windows } });
  } catch (error) {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: 'Request failed' });
  }
};
