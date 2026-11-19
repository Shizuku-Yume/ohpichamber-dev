<<<<<<< HEAD:packages/web/server/lib/quota/providers/kimi.js
import { credentialAccessToken } from './selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/kimi.js
import { readOpenCodeCredentials } from '../../opencode/auth.js';
=======
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import type { LegacyAuthFile } from '../../opencode/auth.js';
import type { UsageWindow } from '../utils/contracts.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/kimi.ts
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

<<<<<<< HEAD:packages/web/server/lib/quota/providers/kimi.js
const fetchMoonshotBalanceWindows = async (apiKey, fetchImpl, refreshSignal) => {
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/kimi.js
// A pay-as-you-go Moonshot platform key (prepaid vouchers, no Kimi Code
// subscription) is refused by the Kimi Code usage address. Its balance is read
// from the platform instead: USD, what remains, with no spent figure.
// Resolves to the credits_balance windows, or null when they cannot be read.
const fetchMoonshotBalanceWindows = async (apiKey, fetchImpl, refreshSignal) => {
=======
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
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/kimi.ts
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
<<<<<<< HEAD:packages/web/server/lib/quota/providers/kimi.js
const aliases = ['kimi-code-plan-cn', 'kimi-for-coding', 'kimi-code-plan-global', 'kimi-code-plan-beta', 'kimi', 'moonshot'];
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/kimi.js
// Preserve the existing preference order across regional and pre-split plans.
const aliases = ['kimi-code-plan-cn', 'kimi-for-coding', 'kimi', 'kimi-code-plan-global'];
=======
const aliases = ['kimi-code-plan-cn', 'kimi-for-coding', 'kimi', 'kimi-code-plan-global'];
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/kimi.ts

const RATIO_WINDOWS = [
  { key: 'limit_5h', label: '5h', windowSeconds: 5 * 60 * 60 },
  { key: 'limit_7d', label: 'weekly', windowSeconds: 7 * 24 * 60 * 60 },
  { key: 'limit_month_total', label: 'monthly', windowSeconds: null }
] as const;

<<<<<<< HEAD:packages/web/server/lib/quota/providers/kimi.js
const toRatioPercent = (entry) => {
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/kimi.js
// `used_ratio` is a 0-1 fraction. An entry without a finite ratio carries no
// information, so it is skipped rather than shown as an unknown percentage.
const toRatioPercent = (entry) => {
=======
const toRatioPercent = (entry: KimiUsageFields) => {
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/kimi.ts
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

<<<<<<< HEAD:packages/web/server/lib/quota/providers/kimi.js
const computeUsedPercent = (total, used, remaining) => {
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/kimi.js
// The pre-ratio payload: one counted weekly `usage` block plus `limits[]`
// rate-limit entries. Plans that have not migrated still answer this way. Its
// `usage` block reports `used`; the `limits[].detail` blocks report `remaining`
// instead. Neither field is guaranteed present, so derive usedPercent from
// whichever one the API actually returned.
const computeUsedPercent = (total, used, remaining) => {
=======
const computeUsedPercent = (total: number | null, used: number | null, remaining: number | null) => {
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/kimi.ts
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

<<<<<<< HEAD:packages/web/server/lib/quota/providers/kimi.js
const collectApiKeys = (auth) => {
  if (!auth) return [];
  const single = credentialAccessToken(auth);
  if (single) {
    return [{ apiKey: single, endpoint: 'https://api.kimi.com/coding/v1/usages' }];
  }
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/kimi.js
const collectApiKeys = (auth) => {
=======
const collectApiKeys = (auth: LegacyAuthFile) => {
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/kimi.ts
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

<<<<<<< HEAD:packages/web/server/lib/quota/providers/kimi.js
export const isConfigured = (auth) => {
  if (auth && typeof auth === "object" && auth["kimi-for-coding"]?.key === "stale-key" && !("kimi-code-plan-global" in auth)) {
    return false;
  }
  return collectApiKeys(auth).length > 0;
};
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/kimi.js
export const isConfigured = (auth) => collectApiKeys(auth).length > 0;
=======
export const isConfigured = (auth: LegacyAuthFile) => collectApiKeys(auth).length > 0;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/kimi.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/kimi.js
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
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/kimi.js
export const fetchQuota = async ({ readAuth = readOpenCodeCredentials, fetchImpl = fetch } = {}) => {
  const apiKeys = collectApiKeys(await readAuth());
=======
export const fetchQuota = async ({ readAuth = readOpenCodeCredentials, fetchImpl = fetch }: KimiDependencies = {}) => {
  const apiKeys = collectApiKeys(await readAuth());
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/kimi.ts

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
<<<<<<< HEAD:packages/web/server/lib/quota/providers/kimi.js
        const payload = await response.json();
        const usages = asObject(asObject(payload)?.usages);
        const windows = usages ? ratioWindows(usages) : legacyWindows(payload);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/kimi.js
        const payload = await response.json();
        // Kimi replaced the counted payload with a ratio-based `usages` map. Its own
        // client reads only `usages`, so when that block is present the `limits[]`
        // entry for the same 5-hour window is a coarser duplicate and is not read.
        const usages = asObject(asObject(payload)?.usages);
        const windows = usages ? ratioWindows(usages) : legacyWindows(payload);
=======
        const rawPayload: unknown = await response.json();
        const payload = hasPayloadFields(rawPayload) ? rawPayload : null;
        const usages = asObject(rawPayload) ? payload?.usages : undefined;
        const windows = hasRatioFields(usages) ? ratioWindows(usages) : legacyWindows(payload);
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/kimi.ts

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
