<<<<<<< HEAD:packages/web/server/lib/quota/providers/hyper.js
import { credentialAccessToken } from './selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/hyper.js
import { readOpenCodeCredentials } from '../../opencode/auth.js';
=======
import { z } from 'zod';
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import type { LegacyAuthFile } from '../../opencode/auth.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/hyper.ts
import {
  buildResult,
  toUsageWindow,
  toNumber,
  formatMoney,
  asObject,
  asNonEmptyString
} from '../utils/index.js';

interface HyperFields {
  key?: unknown;
  token?: unknown;
  balance?: unknown;
}

const isObject = (value: unknown): value is HyperFields => asObject(value) !== null;
const asFields = z.custom<HyperFields | null>(isObject).catch(null).parse;

export interface HyperDependencies {
  readAuth?: () => LegacyAuthFile | Promise<LegacyAuthFile>;
  fetchImpl?: typeof fetch;
}

export const providerId = 'hyper';
export const providerName = 'Charm Hyper';

const HYPER_QUOTA_URL = 'https://hyper.charm.land/v1/credits';
const CREDIT_TO_USD = 0.05;

<<<<<<< HEAD:packages/web/server/lib/quota/providers/hyper.js
const getApiKey = (credential) => credentialAccessToken(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/hyper.js
const getApiKey = (auth) => {
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return asNonEmptyString(entry?.key) ?? asNonEmptyString(entry?.token);
};
=======
const getApiKey = (auth: LegacyAuthFile) => {
  const entry = asFields(normalizeAuthEntry(getAuthEntry(auth, aliases)));
  return asNonEmptyString(entry?.key) ?? asNonEmptyString(entry?.token);
};
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/hyper.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/hyper.js
export const isConfigured = (credential) => Boolean(getApiKey(credential));
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/hyper.js
export const isConfigured = (auth) => Boolean(getApiKey(auth));
=======
export const isConfigured = (auth: LegacyAuthFile) => Boolean(getApiKey(auth));
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/hyper.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/hyper.js
export const fetchQuota = async ({ credential, fetchImpl = fetch } = {}) => {
  const apiKey = getApiKey(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/hyper.js
export const fetchQuota = async ({ readAuth = readOpenCodeCredentials, fetchImpl = fetch } = {}) => {
  const apiKey = getApiKey(await readAuth());
=======
export const fetchQuota = async ({ readAuth = readOpenCodeCredentials, fetchImpl = fetch }: HyperDependencies = {}) => {
  const apiKey = getApiKey(await readAuth());
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/hyper.ts

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
    const response = await fetchImpl(HYPER_QUOTA_URL, {
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
        error: response.status === 401 || response.status === 403
          ? 'Session expired — please re-authenticate with Charm Hyper'
          : `API error: ${response.status}`
      });
    }

    const payload = asFields(await response.json());
    const rawBalance = payload?.balance;
    const balance = toNumber(asNonEmptyString(rawBalance)
      ?? (Number.isFinite(rawBalance) ? rawBalance : null));

    if (balance === null) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: 'No quota data in response'
      });
    }

    const creditsLabel = Number.isInteger(balance) ? String(balance) : formatMoney(balance);
    const windows = {
      credits_balance: toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel: `$${formatMoney(balance * CREDIT_TO_USD)}`
      }),
      credits: toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel: creditsLabel
      })
    };

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
