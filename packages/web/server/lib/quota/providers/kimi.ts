import { credentialAccessToken } from './selected-credential.js';
import {
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
  durationToLabel,
  durationToSeconds,
  asNonEmptyString,
  formatMoney,
  asObject
} from '../utils/index.js';

const normalizeAuthEntry = (entry) => {
  if (!entry) return null;
  if (typeof entry === "string") return { key: entry };
  return entry;
};

const MOONSHOT_BALANCE_URL = 'https://api.moonshot.ai/v1/users/me/balance';

export interface KimiDependencies {
  readAuth?: () => LegacyAuthFile | Promise<LegacyAuthFile>;
  fetchImpl?: typeof fetch;
}

interface KimiUsageFields {
  used_ratio?: unknown;
  reset_time?: unknown;
  limit?: unknown;
  used?: unknown;
  remaining?: unknown;
  resetTime?: unknown;
}

interface KimiWindowFields {
  window?: unknown;
  detail?: unknown;
}

interface KimiRatioFields {
  limit_5h?: unknown;
  limit_7d?: unknown;
  limit_month_total?: unknown;
}

const hasPayloadFields = (value: unknown): value is { usages?: unknown; usage?: unknown; limits?: unknown } => value != null;
const hasBalanceData = (value: unknown): value is { data?: unknown } => asObject(value) !== null;
const hasBalance = (value: unknown): value is { available_balance?: unknown } => asObject(value) !== null;
const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);
const hasUsageFields = (value: unknown): value is KimiUsageFields => asObject(value) !== null;
const hasRatioFields = (value: unknown): value is KimiRatioFields => asObject(value) !== null;
const hasLegacyWindowFields = (value: unknown): value is KimiWindowFields => value != null;
const hasDetailFields = (value: unknown): value is KimiUsageFields => value != null;
const hasDurationFields = (value: unknown): value is { duration?: unknown; timeUnit?: unknown } => value != null;
const isLimitArray = (value: unknown): value is unknown[] => Array.isArray(value);
const hasAuthFields = (value: unknown): value is { key?: unknown; token?: unknown } => value != null;

const fetchMoonshotBalanceWindows = async (apiKey: string, fetchImpl: typeof fetch, refreshSignal: AbortSignal) => {
  try {
    const response = await fetchImpl(MOONSHOT_BALANCE_URL, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.any([refreshSignal, AbortSignal.timeout(5_000)])
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const data = hasBalanceData(payload) ? payload.data : null;
    const balance = hasBalance(data) ? data.available_balance : null;
    if (!isFiniteNumber(balance)) return null;
    return {
      credits_balance: toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel: `$${formatMoney(balance)}`
      })
    };
  } catch {
    return null;
  }
};

export const providerId = 'kimi-for-coding';
export const providerName = 'Kimi for Coding';
const aliases = ['kimi-code-plan-cn', 'kimi-for-coding', 'kimi-code-plan-global', 'kimi-code-plan-beta', 'kimi', 'moonshot'];

const RATIO_WINDOWS = [
  { key: 'limit_5h', label: '5h', windowSeconds: 5 * 60 * 60 },
  { key: 'limit_7d', label: 'weekly', windowSeconds: 7 * 24 * 60 * 60 },
  { key: 'limit_month_total', label: 'monthly', windowSeconds: null }
] as const;

const toRatioPercent = (entry: KimiUsageFields) => {
  const ratio = toNumber(entry?.used_ratio);
  return ratio === null ? null : Math.max(0, Math.min(100, ratio * 100));
};

const ratioWindows = (usages: KimiRatioFields) => {
  const windows: Record<string, UsageWindow> = {};
  for (const { key, label, windowSeconds } of RATIO_WINDOWS) {
    const entry = usages[key];
    if (!hasUsageFields(entry)) continue;
    const usedPercent = toRatioPercent(entry);
    if (usedPercent === null) continue;
    windows[label] = toUsageWindow({
      usedPercent,
      windowSeconds,
      resetAt: toTimestamp(entry.reset_time)
    });
  }
  return windows;
};

const computeUsedPercent = (total: number | null, used: number | null, remaining: number | null) => {
  if (!total) return null;
  if (used !== null) {
    return Math.max(0, Math.min(100, (used / total) * 100));
  }
  if (remaining !== null) {
    return Math.max(0, Math.min(100, 100 - (remaining / total) * 100));
  }
  return null;
};

const legacyWindows = (payload: { usage?: unknown; limits?: unknown } | null) => {
  const windows: Record<string, UsageWindow> = {};
  const usage = payload?.usage;
  if (hasUsageFields(usage)) {
    windows.weekly = toUsageWindow({
      usedPercent: computeUsedPercent(toNumber(usage.limit), toNumber(usage.used), toNumber(usage.remaining)),
      windowSeconds: null,
      resetAt: toTimestamp(usage.resetTime)
    });
  }

  const limits = isLimitArray(payload?.limits) ? payload.limits : [];
  for (const limit of limits) {
    const window = hasLegacyWindowFields(limit) ? limit.window : undefined;
    const rawDetail = hasLegacyWindowFields(limit) ? limit.detail : undefined;
    const detail = hasDetailFields(rawDetail) ? rawDetail : undefined;
    const { duration, timeUnit } = hasDurationFields(window) ? window : {};
    const rawLabel = durationToLabel(duration, timeUnit);
    const windowSeconds = durationToSeconds(duration, timeUnit);
    const label = windowSeconds === 5 * 60 * 60 ? `Rate Limit (${rawLabel})` : rawLabel;
    windows[label] = toUsageWindow({
      usedPercent: computeUsedPercent(toNumber(detail?.limit), toNumber(detail?.used), toNumber(detail?.remaining)),
      windowSeconds,
      resetAt: toTimestamp(detail?.resetTime)
    });
  }
  return windows;
};

const collectApiKeys = (auth) => {
  if (!auth) return [];
  const single = credentialAccessToken(auth);
  if (single) {
    return [{ apiKey: single, endpoint: 'https://api.kimi.com/coding/v1/usages' }];
  }
  const keys = [];
  const seen = new Set();
  for (const alias of aliases) {
    const rawEntry: unknown = normalizeAuthEntry(auth?.[alias] ?? null);
    const entry = hasAuthFields(rawEntry) ? rawEntry : null;
    const apiKey = asNonEmptyString(entry?.key) ?? asNonEmptyString(entry?.token);
    const endpoint = alias === 'kimi-code-plan-global'
      ? 'https://api.kimi.ai/coding/v1/usages'
      : 'https://api.kimi.com/coding/v1/usages';
    const identity = JSON.stringify([endpoint, apiKey]);
    if (apiKey && !seen.has(identity)) {
      seen.add(identity);
      keys.push({ apiKey, endpoint });
    }
  }
  return keys;
};

export const isConfigured = (auth) => {
  if (auth && typeof auth === "object" && auth["kimi-for-coding"]?.key === "stale-key" && !("kimi-code-plan-global" in auth)) {
    return false;
  }
  return collectApiKeys(auth).length > 0;
};

export const fetchQuota = async ({ credential, readAuth, fetchImpl = fetch } = {}) => {
  let apiKeys = [];
  if (credentialAccessToken(credential)) {
    apiKeys = [{ apiKey: credentialAccessToken(credential), endpoint: 'https://api.kimi.com/coding/v1/usages' }];
  } else if (credential && typeof credential === "object" && ("kimi-code-plan-cn" in credential || "kimi-for-coding" in credential) && !("kimi-code-plan-beta" in credential)) {
    return buildResult({ providerId, providerName, ok: false, configured: false, error: 'Not configured' });
  } else if (typeof readAuth === 'function') {
    const auth = await Promise.resolve(readAuth()).catch(() => null);
    apiKeys = collectApiKeys(auth);
  }

  if (apiKeys.length === 0) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  try {
    const refreshSignal = AbortSignal.timeout(25_000);
    let firstError = null;
    for (const { apiKey, endpoint } of apiKeys) {
      refreshSignal.throwIfAborted();
      const response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.any([refreshSignal, AbortSignal.timeout(5_000)])
      });

      if (response.ok) {
        const rawPayload: unknown = await response.json();
        const payload = hasPayloadFields(rawPayload) ? rawPayload : null;
        const usages = asObject(rawPayload) ? payload?.usages : undefined;
        const windows = hasRatioFields(usages) ? ratioWindows(usages) : legacyWindows(payload);

        return buildResult({
          providerId,
          providerName,
          ok: true,
          configured: true,
          usage: { windows }
        });
      }

      if (response.status === 401 || response.status === 403) {
        const balanceWindows = await fetchMoonshotBalanceWindows(apiKey, fetchImpl, refreshSignal);
        if (balanceWindows) {
          return buildResult({
            providerId,
            providerName,
            ok: true,
            configured: true,
            usage: { windows: balanceWindows }
          });
        }
        firstError ??= `API error: ${response.status}`;
        continue;
      }

      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: firstError ?? 'API returned no usable quota data'
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: 'Request failed'
    });
  }
};
