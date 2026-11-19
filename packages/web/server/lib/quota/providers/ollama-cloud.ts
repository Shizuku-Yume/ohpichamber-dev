
import { credentialAccessToken } from './selected-credential.js';
import { z } from 'zod';
import { asNonEmptyString, asObject, buildResult, formatMoney, toNumber, toTimestamp, toUsageWindow } from '../utils/index.js';

interface OllamaFields {
  key?: unknown;
  token?: unknown;
  included?: unknown;
  allowance_usd?: unknown;
  balance_usd?: unknown;
  period?: unknown;
  until?: unknown;
  session?: unknown;
  weekly?: unknown;
  remaining_percent?: unknown;
  resets_at?: unknown;
  purchased?: unknown;
  Plan?: unknown;
}

const isObject = (value: unknown): value is OllamaFields => asObject(value) !== null;
const asFields = z.custom<OllamaFields | null>(isObject).catch(null).parse;

export const providerId = 'ollama-cloud';
export const providerName = 'Ollama Cloud';

const BALANCE_URL = 'https://ollama.com/api/balance';
const ME_URL = 'https://ollama.com/api/me';

/**
 * The account's windows, read from an already-parsed `/api/balance` payload.
 *
 * `included` is one of two documented shapes. A credits plan reports the month's
 * pool: the used fraction is `(allowance_usd - balance_usd) / allowance_usd`,
 * clamped because a pool at or over its cap must read as 100 and never above,
 * with the reset at `period.until`. A legacy plan reports `session` and
 * `weekly` limits instead, each a `remaining_percent` with a `resets_at`; those
 * become their own windows. Whichever buckets are present are rendered, so a
 * plan on one shape keeps reporting while Ollama serves the other. A pool with
 * no positive allowance is skipped, not guessed at.
 *
 * `purchased.balance_usd` is pay-as-you-go credit bought on top of the plan. It
 * is a money balance, not a fraction of anything, so it is surfaced only while
 * positive; a zero or absent balance adds no row.
 */
export const toUsageWindows = z.unknown().transform((payload) => {
  const windows = {};
  const included = asObject(asObject(payload)?.included);
  const allowance = toNumber(included?.allowance_usd);
  const remaining = toNumber(included?.balance_usd);
  if (allowance !== null && allowance > 0 && remaining !== null) {
    windows.monthly = toUsageWindow({
      usedPercent: Math.min(100, Math.max(0, ((allowance - remaining) / allowance) * 100)),
      windowSeconds: null,
      resetAt: toTimestamp(asFields(included?.period)?.until),
    });
  }

  for (const name of ['session', 'weekly'] as const) {
    const limit = asFields(included?.[name]);
    const remainingPercent = toNumber(limit?.remaining_percent);
    if (remainingPercent === null) continue;
    windows[name] = toUsageWindow({
      usedPercent: Math.min(100, Math.max(0, 100 - remainingPercent)),
      windowSeconds: null,
      resetAt: toTimestamp(limit?.resets_at),
    });
  }

  const purchased = toNumber(asFields(asFields(payload)?.purchased)?.balance_usd);
  if (purchased !== null && purchased > 0) {
    windows.purchased_credits = toUsageWindow({
      usedPercent: null,
      windowSeconds: null,
      resetAt: null,
      valueLabel: `$${formatMoney(purchased)}`,
    });
  }
  return windows;
}).parse;

export const isConfigured = (credential) => Boolean(credentialAccessToken(credential));

export const fetchOllamaCloudUsage = async (apiKey: string, fetchImpl = fetch) => {
  const response = await fetchImpl(BALANCE_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('Ollama Cloud authentication failed');
  }
  if (!response.ok) throw new Error(`Ollama Cloud returned HTTP ${response.status}`);

  const windows = toUsageWindows(await response.json());
  if (Object.keys(windows).length === 0) throw new Error('Ollama Cloud usage data could not be parsed');
  return windows;
};

export const fetchOllamaCloudPlan = async (apiKey: string, fetchImpl = fetch) => {
  const response = await fetchImpl(ME_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  return asNonEmptyString(asFields(await response.json())?.Plan);
};

export const fetchQuota = async ({ credential } = {}) => {
  const apiKey = credentialAccessToken(credential);
  if (!apiKey) {
    return buildResult({ providerId, providerName, ok: false, configured: false, error: 'Not configured' });
  }

  try {
    const [windows, plan] = await Promise.all([
      fetchOllamaCloudUsage(apiKey),
      fetchOllamaCloudPlan(apiKey).catch(() => null),
    ]);
    return buildResult({ providerId, providerName, ok: true, configured: true, usage: { windows }, planLabel: plan });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error?.name === 'TimeoutError' ? 'Request timed out' : error instanceof SyntaxError ? 'Invalid response from provider' : 'Request failed',
    });
  }
};
