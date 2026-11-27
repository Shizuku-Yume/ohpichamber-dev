import { z } from 'zod';
import { credentialAccessToken } from './selected-credential.js';
import type { CredentialJson } from '../credentials/contracts.js';
import type { ProviderUsage, QuotaResult, UsageWindow } from '../utils/contracts.js';
import {
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
} from '../utils/index.js';

export interface NanoGptDependencies {
  readAuth?: (() => CredentialJson | Promise<CredentialJson>) | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export interface NanoGptFetchOptions {
  credential?: CredentialJson | undefined;
  fetchImpl?: typeof fetch | undefined;
}

const nanoGptQuotaWindowSchema = z.object({
  percentUsed: z.number().nullish(),
  used: z.union([z.number(), z.string()]).nullish(),
  limit: z.union([z.number(), z.string()]).nullish(),
  limits: z.object({
    daily: z.union([z.number(), z.string()]).nullish(),
    monthly: z.union([z.number(), z.string()]).nullish(),
  }).nullish(),
  resetAt: z.union([z.number(), z.string()]).nullish(),
  degraded: z.boolean().optional(),
}).nullish();

const nanoGptUsageSchema = z.object({
  state: z.string().nullish(),
  period: z.object({ currentPeriodEnd: z.union([z.number(), z.string()]).nullish() }).nullish(),
  limits: z.object({
    dailyInputTokens: z.number().nullish(),
    weeklyInputTokens: z.number().nullish(),
  }).nullish(),
  dailyInputTokens: nanoGptQuotaWindowSchema,
  weeklyInputTokens: nanoGptQuotaWindowSchema,
  daily: nanoGptQuotaWindowSchema,
  monthly: nanoGptQuotaWindowSchema,
});

const NANO_GPT_DAILY_WINDOW_SECONDS = 86400;

export const providerId = 'nano-gpt';
export const providerName = 'NanoGPT';

export const isConfigured = (credential?: CredentialJson): boolean => Boolean(credentialAccessToken(credential));

export const fetchQuota = async ({ credential, fetchImpl = fetch }: NanoGptFetchOptions = {}): Promise<QuotaResult<string, string, ProviderUsage>> => {
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
    const response = await fetchImpl('https://nano-gpt.com/api/subscription/v1/usage', {
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

    const payload = nanoGptUsageSchema.parse(await response.json());
    const windows: Record<string, UsageWindow> = {};
    const state = payload.state ?? 'active';
    const daily = payload.dailyInputTokens !== undefined ? payload.dailyInputTokens : payload.daily;
    const quotas = [
      {
        name: 'daily',
        quota: daily,
        limit: payload.dailyInputTokens !== undefined
          ? payload.limits?.dailyInputTokens
          : daily?.limit ?? daily?.limits?.daily,
        windowSeconds: NANO_GPT_DAILY_WINDOW_SECONDS,
        resetAt: daily?.resetAt,
      },
      {
        name: 'weekly',
        quota: payload.weeklyInputTokens,
        limit: payload.limits?.weeklyInputTokens,
        windowSeconds: 7 * NANO_GPT_DAILY_WINDOW_SECONDS,
        resetAt: payload.weeklyInputTokens?.resetAt,
      },
      {
        name: 'monthly',
        quota: payload.monthly,
        limit: payload.monthly?.limit ?? payload.monthly?.limits?.monthly,
        windowSeconds: null,
        resetAt: payload.monthly?.resetAt ?? payload.period?.currentPeriodEnd,
      },
    ];

    for (const { name, quota, limit: rawLimit, windowSeconds, resetAt } of quotas) {
      if (!quota) continue;
      const percentUsed = toNumber(quota.percentUsed);
      const used = toNumber(quota.used);
      const limit = toNumber(rawLimit);
      let usedPercent = null;
      if (!quota.degraded) {
        if (percentUsed !== null) {
          usedPercent = Math.max(0, Math.min(100, percentUsed * 100));
        } else if (used !== null && limit !== null && limit > 0) {
          usedPercent = Math.max(0, Math.min(100, (used / limit) * 100));
        }
      }
      windows[name] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt: toTimestamp(resetAt),
        valueLabel: state !== 'active' ? `(${state})` : null,
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows }
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
