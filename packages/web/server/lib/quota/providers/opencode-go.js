import { credentialAccessToken } from './selected-credential.js';
import {
  asObject,
  buildResult,
  toNumber,
  toTimestamp,
  toUsageWindow,
} from '../utils/index.js';

export const providerId = 'opencode-go';
export const providerName = 'OpenCode Go';
const API_KEY_USAGE_URL = 'https://opencode.ai/zen/go/v1/usage';
const REQUEST_TIMEOUT_MS = 15_000;

const API_KEY_WINDOW_FIELDS = {
  '5h': 'rolling',
  weekly: 'weekly',
  monthly: 'monthly',
};


const clampPercent = (value) => Math.min(100, Math.max(0, value));

export const parseOpenCodeGoUsage = (payload) => {
  const usage = asObject(payload) ? asObject(payload.usage) : null;
  if (!usage) return {};
  const windows = {};
  for (const [key, field] of Object.entries(API_KEY_WINDOW_FIELDS)) {
    const entry = asObject(usage[field]);
    if (!entry) continue;
    const usedPercent = toNumber(entry.percent);
    const resetAt = toTimestamp(entry.resetsAt);
    if (usedPercent === null || resetAt === null) continue;
    windows[key] = toUsageWindow({
      usedPercent: clampPercent(usedPercent),
      resetAt,
      windowSeconds: null,
    });
  }
  return windows;
};


export const fetchOpenCodeGoUsage = async (apiKey, fetchImpl = fetch) => {
  const response = await fetchImpl(API_KEY_USAGE_URL, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'x-opencode-session': 'openchamber-usage',
      'User-Agent': 'OpenChamber quota provider',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error('OpenCode Go authentication failed');
  }
  if (!response.ok) throw new Error(`OpenCode Go usage API returned HTTP ${response.status}`);
  const windows = parseOpenCodeGoUsage(await response.json().catch(() => null));
  if (Object.keys(windows).length === 0) throw new Error('OpenCode Go usage data could not be parsed');
  return windows;
};



export const isConfigured = (credential) => Boolean(credentialAccessToken(credential));

export const fetchQuota = async ({ credential, fetchImpl = fetch } = {}) => {
  try {
    const access = credentialAccessToken(credential);
    if (!access) return buildResult({ providerId, providerName, ok: false, configured: false, error: 'Not configured' });
    if (credential.type === 'oauth') return buildResult({ providerId, providerName, ok: false, configured: true, error: 'Selected native OAuth credential is unsupported for OpenCode Go quota' });
    const windows = await fetchOpenCodeGoUsage(access, fetchImpl);
    return buildResult({ providerId, providerName, ok: true, configured: true, usage: { windows } });
  } catch (error) {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: 'Request failed' });
  }
};
