import { z } from 'zod';
import { credentialAccessToken } from './selected-credential.js';
import type { CredentialJson } from '../credentials/contracts.js';
import type { ProviderUsage, QuotaResult, UsageWindow } from '../utils/contracts.js';
import {
  buildResult,
  toUsageWindow,
} from '../utils/index.js';

const providerId = 'openai';
const providerName = 'OpenAI';

const openaiWindowSchema = z.object({
  used_percent: z.number().nullish(),
  limit_window_seconds: z.number().nullish(),
  reset_at: z.number().nullish(),
}).nullish();

const openaiUsagePayloadSchema = z.object({
  rate_limit: z.object({
    primary_window: openaiWindowSchema,
    secondary_window: openaiWindowSchema,
  }).nullish(),
});

export const fetchQuota = async ({ credential }: { credential?: CredentialJson } = {}): Promise<QuotaResult<string, string, ProviderUsage>> => {
  const accessToken = credentialAccessToken(credential);

  if (!accessToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Not configured',
    });
  }

  try {
    const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const parsedPayload = openaiUsagePayloadSchema.safeParse(await response.json());
    const rateLimit = parsedPayload.success ? parsedPayload.data.rate_limit : null;
    const primary = rateLimit?.primary_window ?? null;
    const secondary = rateLimit?.secondary_window ?? null;

    const windows: Record<string, UsageWindow> = {};
    if (primary) {
      windows['5h'] = toUsageWindow({
        usedPercent: primary.used_percent ?? null,
        windowSeconds: primary.limit_window_seconds ?? null,
        resetAt: primary.reset_at ? primary.reset_at * 1000 : null,
      });
    }
    if (secondary) {
      windows.weekly = toUsageWindow({
        usedPercent: secondary.used_percent ?? null,
        windowSeconds: secondary.limit_window_seconds ?? null,
        resetAt: secondary.reset_at ? secondary.reset_at * 1000 : null,
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: 'Request failed',
    });
  }
};
