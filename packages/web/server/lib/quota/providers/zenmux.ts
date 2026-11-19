<<<<<<< HEAD:packages/web/server/lib/quota/providers/zenmux.js
import { credentialAccessToken } from './selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/zenmux.js
import { readManagedCredential } from '../credentials/providers.js';
=======
import { z } from 'zod';
import { readManagedCredential } from '../credentials/providers.js';
import type { ZenmuxCredential } from '../credentials/contracts.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/zenmux.ts
import {
  buildResult,
  toUsageWindow,
  toNumber,
  formatMoney,
  asObject,
  asNonEmptyString
} from '../utils/index.js';

interface ZenmuxFields {
  data?: unknown;
  total_credits?: unknown;
}

const isObject = (value: unknown): value is ZenmuxFields => asObject(value) !== null;
const asFields = z.custom<ZenmuxFields | null>(isObject).catch(null).parse;

export interface ZenmuxDependencies {
  readCredential?: () => ZenmuxCredential | null;
  fetchImpl?: typeof fetch;
}

export const providerId = 'zenmux';
export const providerName = 'ZenMux';
<<<<<<< HEAD:packages/web/server/lib/quota/providers/zenmux.js

||||||| bc50ba56aa:packages/web/server/lib/quota/providers/zenmux.js
const aliases = ['zenmux'];
=======
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/zenmux.ts
const ZENMUX_BALANCE_URL = 'https://zenmux.ai/api/v1/management/payg/balance';

<<<<<<< HEAD:packages/web/server/lib/quota/providers/zenmux.js
const getPlatformApiKey = (credential) => credentialAccessToken(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/zenmux.js
const readStoredCredential = () => readManagedCredential(providerId);

const getPlatformApiKey = (credential) => asNonEmptyString(credential?.platformApiKey);
=======
const readStoredCredential = () => readManagedCredential(providerId);

const getPlatformApiKey = (credential: ZenmuxCredential | null) => asNonEmptyString(credential?.platformApiKey);
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/zenmux.ts

const parseCredits = z.unknown().transform((value) => toNumber(asNonEmptyString(value)
  ?? (Number.isFinite(value) ? value : null))).parse;

export const isConfigured = (credential) => Boolean(getPlatformApiKey(credential));

<<<<<<< HEAD:packages/web/server/lib/quota/providers/zenmux.js
export const fetchQuota = async ({ credential, fetchImpl = fetch } = {}) => {
  const apiKey = getPlatformApiKey(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/zenmux.js
export const fetchQuota = async ({
  readCredential = readStoredCredential,
  fetchImpl = fetch
} = {}) => {
  const apiKey = getPlatformApiKey(readCredential());
=======
export const fetchQuota = async ({
  readCredential = readStoredCredential,
  fetchImpl = fetch
}: ZenmuxDependencies = {}) => {
  const apiKey = getPlatformApiKey(readCredential());
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/zenmux.ts

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
    const response = await fetchImpl(ZENMUX_BALANCE_URL, {
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
          ? 'Invalid ZenMux Platform API key'
          : `API error: ${response.status}`
      });
    }

    const payload = asFields(await response.json());
    const data = asFields(payload?.data);
    const totalCredits = parseCredits(data?.total_credits);

    if (totalCredits === null) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: 'No quota data in response'
      });
    }

    const windows = {
      credits_balance: toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel: `$${formatMoney(totalCredits)}`
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
