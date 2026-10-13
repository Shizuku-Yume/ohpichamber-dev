import { credentialAccessToken } from './selected-credential.js';
import {
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp
} from '../utils/index.js';

const providerId = 'openai';
const providerName = 'OpenAI';


export const fetchQuota = async ({ credential } = {}) => {
  const accessToken = credentialAccessToken(credential);

  if (!accessToken) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  try {
    const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
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

    const payload = await response.json();
    const primary = payload?.rate_limit?.primary_window ?? null;
    const secondary = payload?.rate_limit?.secondary_window ?? null;

    const windows = {};
    if (primary) {
      windows['5h'] = toUsageWindow({
        usedPercent: primary.used_percent ?? null,
        windowSeconds: primary.limit_window_seconds ?? null,
        resetAt: primary.reset_at ? primary.reset_at * 1000 : null
      });
    }
    if (secondary) {
      windows['weekly'] = toUsageWindow({
        usedPercent: secondary.used_percent ?? null,
        windowSeconds: secondary.limit_window_seconds ?? null,
        resetAt: secondary.reset_at ? secondary.reset_at * 1000 : null
      });
    }

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows }
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
