import { credentialAccessToken } from './selected-credential.js';
import type { CredentialJson } from '../credentials/contracts.js';
import type { ProviderUsage, QuotaResult, TokenWindowLimit, UsageWindow } from '../utils/contracts.js';
import {
  asNonEmptyString,
  buildResult,
  toUsageWindow,
  toNumber,
  resolveWindowSeconds,
  resolveWindowLabel,
  normalizeTimestamp,
} from '../utils/index.js';
export const providerId = 'zhipuai-coding-plan';
export const providerName = 'Zhipu AI Coding Plan';


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


export const isConfigured = (credential?: CredentialJson): boolean => Boolean(credentialAccessToken(credential));

export const fetchQuota = async ({ credential }: { credential?: CredentialJson } = {}): Promise<QuotaResult<string, string, ProviderUsage>> => {
  const apiKey = credentialAccessToken(credential);

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
      const usedPercent = toNumber(mcpToolsTimeLimit?.percentage);

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
  } catch {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: 'Request failed'
    });
  }
};
