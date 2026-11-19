<<<<<<< HEAD:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js
/**
 * Zhipu AI Coding Plan quota fetch
 *
 * API: https://open.bigmodel.cn/api/monitor/usage/quota/limit
 *
 * bigmodel.cn reports business failures inside HTTP 200 bodies
 * (`{code, msg, success: false}`), so the envelope must be validated before
 * `data.limits` is parsed. A missing envelope is treated as legacy success.
 *
 * Response limits:
 * - TOKENS_LIMIT / CREDIT_LIMIT: token/credit usage windows (5-hour and weekly).
 *   The API renamed TOKENS_LIMIT to CREDIT_LIMIT; CREDIT_LIMIT entries
 *   additionally carry `usage` (total), `currentValue` (consumed), `remaining`,
 *   and `percentage` (used percent, derived from currentValue/usage when absent).
 * - TIME_LIMIT: MCP tools usage (monthly window)
 *
 * `data.level` is the plan tier (for example "lite") and becomes `planLabel`.
 */
import { credentialAccessToken } from './selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js
/**
 * Zhipu AI Coding Plan quota fetch
 *
 * API: https://open.bigmodel.cn/api/monitor/usage/quota/limit
 *
 * bigmodel.cn reports business failures inside HTTP 200 bodies
 * (`{code, msg, success: false}`), so the envelope must be validated before
 * `data.limits` is parsed. A missing envelope is treated as legacy success.
 *
 * Response limits:
 * - TOKENS_LIMIT / CREDIT_LIMIT: token/credit usage windows (5-hour and weekly).
 *   The API renamed TOKENS_LIMIT to CREDIT_LIMIT; CREDIT_LIMIT entries
 *   additionally carry `usage` (total), `currentValue` (consumed), `remaining`,
 *   and `percentage` (used percent, derived from currentValue/usage when absent).
 * - TIME_LIMIT: MCP tools usage (monthly window)
 *
 * `data.level` is the plan tier (for example "lite") and becomes `planLabel`.
 */
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import { readConfigLayers } from '../../opencode/shared.js';
=======
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import type { LegacyAuthFile } from '../../opencode/auth.js';
import { readConfigLayers } from '../../opencode/config-files.js';
import type { TokenWindowLimit, UsageWindow } from '../utils/contracts.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/zhipuai-coding-plan.ts
import {
  asNonEmptyString,
  buildResult,
  toUsageWindow,
  toNumber,
  resolveWindowSeconds,
  resolveWindowLabel,
  normalizeTimestamp
} from '../utils/index.js';

export const providerId = 'zhipuai-coding-plan';
export const providerName = 'Zhipu AI Coding Plan';
<<<<<<< HEAD:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js

||||||| bc50ba56aa:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js
const aliases = ['zhipuai-coding-plan', 'zhipuai', 'zhipu'];
=======
const aliases = ['zhipuai-coding-plan', 'zhipuai', 'zhipu'] as const;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/zhipuai-coding-plan.ts

export interface EnvelopeFields {
  code?: unknown;
  success?: unknown;
  msg?: unknown;
}

interface CodingPlanLimitFields extends TokenWindowLimit {
  type?: unknown;
  currentValue?: unknown;
  usage?: unknown;
  percentage?: unknown;
  nextResetTime?: unknown;
}

export const hasPayloadFields = (value: unknown): value is EnvelopeFields & { data?: unknown } => value != null;
export const hasDataFields = (value: unknown): value is { limits?: unknown; level?: unknown } => value != null;
const hasLimitFields = (value: unknown): value is CodingPlanLimitFields => value != null;
export const isLimitArray = (value: unknown): value is unknown[] => Array.isArray(value);
export const isNumber = (value: unknown): value is number => typeof value === 'number';
export const isCreditLimit = (value: unknown): value is CodingPlanLimitFields =>
  hasLimitFields(value) && (value.type === 'TOKENS_LIMIT' || value.type === 'CREDIT_LIMIT');
export const isTimeLimit = (value: unknown): value is CodingPlanLimitFields =>
  hasLimitFields(value) && value.type === 'TIME_LIMIT';
const hasAuthFields = (value: unknown): value is { key?: unknown; token?: unknown } => value != null;
const hasProviderAliases = (value: unknown): value is Partial<Record<typeof aliases[number], unknown>> => value != null;
const hasProviderOptions = (value: unknown): value is { options?: unknown } => value != null;
const hasApiKey = (value: unknown): value is { apiKey?: unknown } => value != null;

const formatCreditAmount = (value: number) => {
  if (value < 1000) return value.toLocaleString('en-US');
  return `${Math.round(value / 100) / 10}k`;
};

export const formatCreditValueLabel = (limit: CodingPlanLimitFields) => {
  const used = toNumber(limit?.currentValue);
  const total = toNumber(limit?.usage);
  if (used === null || total === null) return null;
  return `${formatCreditAmount(used)} / ${formatCreditAmount(total)} credits`;
};

const resolveUsedPercent = (limit: CodingPlanLimitFields) => {
  const percentage = toNumber(limit?.percentage);
  if (percentage !== null) {
    return percentage;
  }
  const used = toNumber(limit?.currentValue);
  const total = toNumber(limit?.usage);
  if (used === null || total === null || total <= 0) return null;
  return Math.round((used / total) * 100);
};

export const envelopeError = (payload: EnvelopeFields | null | undefined) => {
  const code = payload?.code;
  if (payload?.success !== false && !(code !== undefined && code !== null && code !== 200)) {
    return null;
  }
  return Number.isSafeInteger(code) ? `API error: ${code}` : 'Provider request failed';
};

<<<<<<< HEAD:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js
function getApiKey(auth) {
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const apiKeyFromAuth = entry?.key ?? entry?.token;
=======
function getApiKey(auth: LegacyAuthFile) {
  const rawEntry: unknown = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const entry = hasAuthFields(rawEntry) ? rawEntry : null;
  const apiKeyFromAuth = entry?.key ?? entry?.token;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/zhipuai-coding-plan.ts

export const isConfigured = (credential) => Boolean(credentialAccessToken(credential));

<<<<<<< HEAD:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js
export const fetchQuota = async ({ credential } = {}) => {
  const apiKey = credentialAccessToken(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js
  try {
    const { mergedConfig } = readConfigLayers();

    for (const alias of aliases) {
      const providerConfig = mergedConfig?.provider?.[alias];
      if (providerConfig?.options?.apiKey) {
        return resolveConfigApiKey(providerConfig.options.apiKey);
      }
    }
  } catch {
    // Ignore config read errors; the provider will be treated as not configured.
  }

  return null;
}

export const isConfigured = (auth) => {
  return Boolean(getApiKey(auth));
};

export const fetchQuota = async () => {
  const apiKey = getApiKey(await readOpenCodeCredentials());
=======
  try {
    const { mergedConfig } = readConfigLayers();

    for (const alias of aliases) {
      const provider = mergedConfig?.provider;
      const providerConfig = hasProviderAliases(provider) ? provider[alias] : undefined;
      const options = hasProviderOptions(providerConfig) ? providerConfig.options : undefined;
      if (hasApiKey(options) && options.apiKey) {
        const key: unknown = resolveConfigApiKey(options.apiKey);
        return key;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export const isConfigured = (auth: LegacyAuthFile) => {
  return Boolean(getApiKey(auth));
};

export const fetchQuota = async () => {
  const apiKey = getApiKey(await readOpenCodeCredentials());
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/zhipuai-coding-plan.ts

  if (!apiKey) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  try {
    const response = await fetch('https://open.bigmodel.cn/api/monitor/usage/quota/limit', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`
      });
    }

    const rawPayload: unknown = await response.json();
    const payload = hasPayloadFields(rawPayload) ? rawPayload : null;

    const failure = envelopeError(payload);
    if (failure) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: failure
      });
    }

    const data = hasDataFields(payload?.data) ? payload.data : null;
    const limits = isLimitArray(data?.limits) ? data.limits : [];

    const windows: Record<string, UsageWindow> = {};

    for (const limit of limits.filter(isCreditLimit)) {
      const windowSeconds = resolveWindowSeconds(limit);
      const windowLabel = resolveWindowLabel(windowSeconds);
      const resetAt = limit?.nextResetTime ? normalizeTimestamp(limit.nextResetTime) : null;

      windows[windowLabel] = toUsageWindow({
        usedPercent: resolveUsedPercent(limit),
        windowSeconds,
        resetAt,
        valueLabel: formatCreditValueLabel(limit)
      });
    }

    const mcpToolsTimeLimit = limits.find(isTimeLimit);
    if (mcpToolsTimeLimit) {
      const monthSeconds = 30 * 24 * 60 * 60;
      const resetAt = mcpToolsTimeLimit?.nextResetTime ? normalizeTimestamp(mcpToolsTimeLimit.nextResetTime) : null;
<<<<<<< HEAD:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js
      const usedPercent = toNumber(mcpToolsTimeLimit?.percentage);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/zhipuai-coding-plan.js
      const usedPercent = typeof mcpToolsTimeLimit?.percentage === 'number' ? mcpToolsTimeLimit.percentage : null;
=======
      const usedPercent = isNumber(mcpToolsTimeLimit.percentage) ? mcpToolsTimeLimit.percentage : null;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/zhipuai-coding-plan.ts

      windows['MCP Tools'] = toUsageWindow({
        usedPercent,
        windowSeconds: monthSeconds,
        resetAt
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
      planLabel: asNonEmptyString(data?.level)
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
