<<<<<<< HEAD:packages/web/server/lib/quota/providers/deepinfra.js
import { credentialAccessToken } from './selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/deepinfra.js
import { readOpenCodeCredentials } from '../../opencode/auth.js';
=======
import { z } from 'zod';
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import type { LegacyAuthFile } from '../../opencode/auth.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/deepinfra.ts
import {
  buildResult,
  toUsageWindow,
  toNumber,
  formatMoney
} from '../utils/index.js';

interface DeepInfraFields {
  key?: unknown;
  token?: unknown;
  checklist?: unknown;
  stripe_balance?: unknown;
}

const hasFields = (value: unknown): value is DeepInfraFields => value !== null && value !== undefined;
const asFields = z.custom<DeepInfraFields | null>(hasFields).catch(null).parse;

export interface DeepInfraDependencies {
  readCredentials?: () => LegacyAuthFile | Promise<LegacyAuthFile>;
}

export const providerId = 'deepinfra';
export const providerName = 'DeepInfra';

const DEEPINFRA_ME_URL = 'https://api.deepinfra.com/v1/me?checklist=true';

<<<<<<< HEAD:packages/web/server/lib/quota/providers/deepinfra.js
export const isConfigured = (credential) => Boolean(credentialAccessToken(credential));
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/deepinfra.js
export const isConfigured = (auth) => {
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.key || entry?.token);
};
=======
export const isConfigured = (auth: LegacyAuthFile) => {
  const entry = asFields(normalizeAuthEntry(getAuthEntry(auth, aliases)));
  return Boolean(entry?.key || entry?.token);
};
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/deepinfra.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/deepinfra.js
export const fetchQuota = async ({ credential } = {}) => {
  const apiKey = credentialAccessToken(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/deepinfra.js
export const fetchQuota = async ({ readCredentials = readOpenCodeCredentials } = {}) => {
  const auth = await readCredentials();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKey = entry?.key ?? entry?.token;
=======
export const fetchQuota = async ({ readCredentials = readOpenCodeCredentials }: DeepInfraDependencies = {}) => {
  const auth = await readCredentials();
  const entry = asFields(normalizeAuthEntry(getAuthEntry(auth, aliases)));
  const apiKey = entry?.key ?? entry?.token;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/deepinfra.ts

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
    const response = await fetch(DEEPINFRA_ME_URL, {
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
          ? 'Session expired — please re-authenticate with DeepInfra'
          : `API error: ${response.status}`
      });
    }

    const payload = asFields(await response.json());
    const rawBalance = asFields(payload?.checklist)?.stripe_balance;
    const stripeBalance = String(rawBalance ?? '').trim() === '' ? null : toNumber(rawBalance);

    if (stripeBalance === null) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: 'No quota data in response'
      });
    }

    const availableCredits = -stripeBalance;
    const symbol = availableCredits < 0 ? '-$' : '$';
    const valueLabel = `${symbol}${formatMoney(Math.abs(availableCredits))}`;

    const windows = {
      credits_balance: toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel
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
