<<<<<<< HEAD:packages/web/server/lib/quota/providers/cline-pass.js
import { credentialAccessToken } from './selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/cline-pass.js
import { readOpenCodeCredentials } from '../../opencode/auth.js';
=======
import { z } from 'zod';
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import type { LegacyAuthFile } from '../../opencode/auth.js';
import type { UsageWindow } from '../utils/contracts.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/cline-pass.ts
import {
  asObject,
  asNonEmptyString,
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp
} from '../utils/index.js';

interface ClineFields {
  key?: unknown;
  token?: unknown;
  data?: unknown;
  limits?: unknown;
  type?: unknown;
  percentUsed?: unknown;
  resetsAt?: unknown;
}

const isObject = (value: unknown): value is ClineFields => asObject(value) !== null;
const asFields = z.custom<ClineFields | null>(isObject).catch(null).parse;

export interface ClineDependencies {
  readAuth?: () => LegacyAuthFile | Promise<LegacyAuthFile>;
  fetchImpl?: typeof fetch;
}

interface ClineWindowKind {
  key: string;
  windowSeconds: number | null;
}

export const providerId = 'cline-pass';
export const providerName = 'ClinePass';

const CLINE_USAGE_URL = 'https://api.cline.bot/api/v1/users/me/plan/usage-limits';

const WINDOW_KINDS = new Map<string | null, ClineWindowKind>([
  ['five_hour', { key: '5h', windowSeconds: 5 * 60 * 60 }],
  ['weekly', { key: 'weekly', windowSeconds: 7 * 24 * 60 * 60 }],
  ['monthly', { key: 'monthly', windowSeconds: null }]
]);

<<<<<<< HEAD:packages/web/server/lib/quota/providers/cline-pass.js
const getApiKey = (credential) => credentialAccessToken(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/cline-pass.js
const getApiKey = (auth) => {
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return asNonEmptyString(entry?.key) ?? asNonEmptyString(entry?.token);
};
=======
const getApiKey = (auth: LegacyAuthFile) => {
  const entry = asFields(normalizeAuthEntry(getAuthEntry(auth, aliases)));
  return asNonEmptyString(entry?.key) ?? asNonEmptyString(entry?.token);
};
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/cline-pass.ts

export const isConfigured = (auth: LegacyAuthFile) => Boolean(getApiKey(auth));

<<<<<<< HEAD:packages/web/server/lib/quota/providers/cline-pass.js
export const fetchQuota = async ({ credential, fetchImpl = fetch } = {}) => {
  const apiKey = getApiKey(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/cline-pass.js
export const fetchQuota = async ({ readAuth = readOpenCodeCredentials, fetchImpl = fetch } = {}) => {
  const apiKey = getApiKey(await readAuth());
=======
export const fetchQuota = async ({ readAuth = readOpenCodeCredentials, fetchImpl = fetch }: ClineDependencies = {}) => {
  const apiKey = getApiKey(await readAuth());
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/cline-pass.ts

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  const timeoutSignal = AbortSignal.timeout(15_000);

  try {
    const response = await fetchImpl(CLINE_USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Accept-Encoding': 'identity'
      },
      signal: timeoutSignal
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: response.status === 401
          ? 'Session expired — please re-authenticate with ClinePass'
          : `API error: ${response.status}`
      });
    }

    const payload = asFields(await response.json());
    const data = asFields(payload?.data);
    const limits = Array.isArray(data?.limits) ? data.limits : [];

    const windows: Record<string, UsageWindow> = {};
    for (const item of limits) {
      const limit = asFields(item);
      if (!limit) continue;
      const kind = WINDOW_KINDS.get(asNonEmptyString(limit.type));
      if (!kind) continue;
      const usedPercent = toNumber(asNonEmptyString(limit.percentUsed)
        ?? (Number.isFinite(limit.percentUsed) ? limit.percentUsed : null));
      if (usedPercent === null) continue;
      windows[kind.key] = toUsageWindow({
        usedPercent,
        windowSeconds: kind.windowSeconds,
        resetAt: toTimestamp(limit.resetsAt)
      });
    }

    if (Object.keys(windows).length === 0) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: 'No quota data in response'
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows }
    });
  } catch (error) {
    const isTimeout = error instanceof DOMException && (
      error.name === 'TimeoutError' || (error.name === 'AbortError' && timeoutSignal.aborted)
    );
    const isParseError = error instanceof SyntaxError;
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: isTimeout
        ? 'Request timed out'
        : isParseError
          ? 'Invalid response from provider'
          : ('Request failed')
    });
  }
};
