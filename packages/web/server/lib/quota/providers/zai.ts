import { credentialAccessToken } from './selected-credential.js';
import { envelopeError } from './zhipuai-coding-plan.js';
import { buildResult,
toUsageWindow,
toNumber,
resolveWindowSeconds,
resolveWindowLabel,
normalizeTimestamp } from '../utils/index.js'
import { isString } from "../../shared/object-guards.js";

import { isLimitArray } from "./zhipuai-coding-plan.js";

import { hasPayloadFields } from "./zhipuai-coding-plan.js";

import { hasDataFields } from "./zhipuai-coding-plan.js";

import { isCreditLimit } from "./zhipuai-coding-plan.js";

import { isNumber } from "./zhipuai-coding-plan.js";

import { formatCreditValueLabel } from "./zhipuai-coding-plan.js";

import { isTimeLimit } from "./zhipuai-coding-plan.js";


export const providerId = 'zai-coding-plan';
export const providerName = 'z.ai';


interface ZaiGiftFields {
  available?: unknown;
  recordId?: unknown;
  expireTime?: unknown;
  grantType?: unknown;
}

interface GiftReset {
  recordId: number;
  expireAt: number;
  grantType?: string;
}

interface GiftResetRequest {
  recordId?: unknown;
  resetType: string;
  grantType?: unknown;
}

const hasAuthFields = (value: unknown): value is { key?: unknown; token?: unknown } => value != null;
type GiftResetLists = { fiveHourResets?: unknown; weekResets?: unknown };
const hasGiftLists = (value: unknown): value is GiftResetLists => Boolean(value);
const hasGiftFields = (value: unknown): value is ZaiGiftFields => Boolean(value);
const isFiniteNumber = (value: unknown): value is number => Number.isFinite(value);

const ZAI_RESET_TIME_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const parseZaiResetExpire = (record: ZaiGiftFields) => {
  const value = record.expireTime;
  if (!ZAI_RESET_TIME_PATTERN.test(`${value}`)) return null;
  if (!isString(value)) throw new TypeError();
  const timestamp = Date.parse(`${value.replace(' ', 'T')}+08:00`);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const pickZaiGiftReset = (data: GiftResetLists, field: keyof GiftResetLists) => {
  const records = data[field];
  if (!isLimitArray(records)) return null;
  const now = Date.now();
  let best: GiftReset | null = null;
  for (const record of records) {
    if (!hasGiftFields(record) || record.available !== true) continue;
    if (!isFiniteNumber(record.recordId)) continue;
    const expireAt = parseZaiResetExpire(record);
    if (expireAt === null || expireAt <= now) continue;
    if (best === null || expireAt < best.expireAt) {
      best = { recordId: record.recordId, expireAt };
    }
  }
  return best;
};

const ZAI_GIFT_RESET_URL = 'https://api.z.ai/api/biz/customer-package-reset/list?targetType=PERSONAL';
const ZAI_FIVE_HOUR_WINDOW_SECONDS = 5 * 60 * 60;
const ZAI_WEEK_WINDOW_SECONDS = 7 * 24 * 60 * 60;

type ZaiWindow = UsageWindow & { giftReset?: GiftReset };

const attachZaiGiftResets = async (windows: Record<string, ZaiWindow>, { apiKey }: { apiKey: unknown }) => {
  try {
    const response = await fetch(ZAI_GIFT_RESET_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) return;
    const payload: unknown = await response.json();
    const data = hasPayloadFields(payload) ? payload.data : undefined;
    if (!hasGiftLists(data)) return;

    const fiveHour = pickZaiGiftReset(data, 'fiveHourResets');
    const weekly = pickZaiGiftReset(data, 'weekResets');

    for (const window of Object.values(windows)) {
      if (window?.windowSeconds === ZAI_FIVE_HOUR_WINDOW_SECONDS && fiveHour) {
        window.giftReset = fiveHour;
      } else if (window?.windowSeconds === ZAI_WEEK_WINDOW_SECONDS && weekly) {
        window.giftReset = weekly;
      }
    }
  } catch {
    return;
  }
};

export const isConfigured = (credential) => Boolean(credentialAccessToken(credential));

const ZAI_GIFT_RESET_USE_URL = 'https://api.z.ai/api/biz/customer-package-reset/use';
export const giftResetTypes = ['FIVE_HOUR', 'WEEK'];

export const useZaiGiftReset = async ({ recordId, resetType, credential }) => {
  const apiKey = credentialAccessToken(credential);

  if (!apiKey) {
    throw new Error('Not configured');
  }
  if (!Number.isFinite(recordId) || !giftResetTypes.includes(resetType)) {
    throw new Error('Invalid gift reset request');
  }

  const response = await fetch(ZAI_GIFT_RESET_USE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      targetType: 'PERSONAL',
      resetType,
      recordId,
      requestId: crypto.randomUUID()
    })
  });

  const rawPayload: unknown = await response.json().catch(() => null);
  const payload = hasPayloadFields(rawPayload) ? rawPayload : null;
  if (!response.ok || payload?.success !== true) {
    throw new Error(envelopeError(payload) ?? `API error: ${response.status}`);
  }
  return true;
};

export const fetchQuota = async ({ credential } = {}) => {
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
    const response = await fetch('https://api.z.ai/api/monitor/usage/quota/limit', {
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
    const windows: Record<string, ZaiWindow> = {};
    for (const limit of limits.filter(isCreditLimit)) {
      const windowSeconds = resolveWindowSeconds(limit);
      const windowLabel = resolveWindowLabel(windowSeconds);
      const resetAt = limit?.nextResetTime ? normalizeTimestamp(limit.nextResetTime) : null;
      const usedPercent = isNumber(limit.percentage) ? limit.percentage : null;
      const creditValueLabel = formatCreditValueLabel(limit);

      windows[windowLabel] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt,
        valueLabel: creditValueLabel
      });
    }

    const mcpToolsTimeLimit = limits.find(isTimeLimit);
    if (mcpToolsTimeLimit) {
      windows['MCP Tools'] = toUsageWindow({
        usedPercent: isNumber(mcpToolsTimeLimit.percentage) ? mcpToolsTimeLimit.percentage : null,
        windowSeconds: 30 * 24 * 60 * 60,
        resetAt: mcpToolsTimeLimit.nextResetTime ? normalizeTimestamp(mcpToolsTimeLimit.nextResetTime) : null
      });
    }

    await attachZaiGiftResets(windows, { apiKey });

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
      planLabel: isString(data?.level) && data.level ? data.level : null
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
