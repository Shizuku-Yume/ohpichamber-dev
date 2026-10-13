/**
 * Claude subscription quota.
 *
 * Reports the plan limits Claude Code itself is bound by (rolling session
 * window, weekly windows, model-scoped weekly windows, and paid extra usage)
 * using the OAuth credential Claude Code already holds.
 *
 * @module quota/providers/claude
 */

import { createHash } from 'crypto';

import { buildResult } from '../../utils/index.js';
import { credentialAccessToken, credentialRefreshToken } from '../selected-credential.js';
import { toClaudeUsage } from './transforms.js';

export const providerId = 'claude';
export const providerName = 'Claude';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA_HEADER = 'oauth-2025-04-20';
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Last good payload, kept only to survive Anthropic's aggressive rate limiting.
 * Keyed by credential fingerprint so a second account never sees the first
 * account's numbers.
 *
 * @type {{ fingerprint: string, usage: object, planLabel: string|null }|null}
 */
let cachedUsage = null;
let cooldownUntil = 0;
const pendingFetches = new Map();

const fingerprintOf = (credential) =>
  createHash('sha256').update(`${credential.accessToken}\0${credential.refreshToken ?? ''}`).digest('hex');

const cooldownFromHeader = (response) => {
  const raw = response.headers.get('retry-after');
  const retryAfter = Number(raw);
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, MAX_COOLDOWN_MS);
  }
  const retryAt = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isFinite(retryAt) && retryAt > Date.now()) {
    return Math.min(retryAt - Date.now(), MAX_COOLDOWN_MS);
  }
  return DEFAULT_COOLDOWN_MS;
};

const cachedResultFor = (fingerprint, planLabel) => {
  if (!cachedUsage || cachedUsage.fingerprint !== fingerprint) return null;
  return buildResult({
    providerId,
    providerName,
    ok: true,
    configured: true,
    usage: cachedUsage.usage,
    planLabel: planLabel ?? cachedUsage.planLabel
  });
};

const failure = (error, { configured = true } = {}) =>
  buildResult({ providerId, providerName, ok: false, configured, error });

export const isConfigured = (credential) => credential?.type === 'oauth' && Boolean(credentialAccessToken(credential));

const fetchQuotaUncoalesced = async ({ credential: selectedCredential } = {}) => {
  const accessToken = isConfigured(selectedCredential) ? credentialAccessToken(selectedCredential) : null;
  const credential = accessToken ? { accessToken, refreshToken: credentialRefreshToken(selectedCredential) } : null;
  if (!credential) {
    return failure('Not configured', { configured: false });
  }
  if (Number.isFinite(selectedCredential.expires) && selectedCredential.expires <= Date.now()) return failure('Selected Claude OAuth credential requires re-authentication');

  const fingerprint = fingerprintOf(credential);
  if (cachedUsage && cachedUsage.fingerprint !== fingerprint) {
    cachedUsage = null;
    cooldownUntil = 0;
  }

  if (Date.now() < cooldownUntil) {
    return cachedResultFor(fingerprint, credential.planLabel)
      ?? failure('Rate limited. Retrying soon.');
  }

  let response;
  try {
    response = await fetch(USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credential.accessToken}`,
        'anthropic-beta': OAUTH_BETA_HEADER
      }
    });
  } catch (error) {
    return failure('Request failed');
  }

  if (response.status === 429) {
    cooldownUntil = Date.now() + cooldownFromHeader(response);
    return cachedResultFor(fingerprint, credential.planLabel)
      ?? failure('Rate limited. Retrying soon.');
  }

  if (response.status === 401 || response.status === 403) {
    return failure('Claude session expired. Open Claude Code to sign in again.');
  }

  if (!response.ok) {
    return failure(`API error: ${response.status}`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    return failure('Unexpected response from Anthropic');
  }

  const { windows, models } = toClaudeUsage(payload);
  const usage = Object.keys(models).length > 0 ? { windows, models } : { windows };
  cachedUsage = { fingerprint, usage, planLabel: credential.planLabel };

  return buildResult({
    providerId,
    providerName,
    ok: true,
    configured: true,
    usage,
    planLabel: credential.planLabel
  });
};

export const fetchQuota = (options = {}) => {
  const key = credentialAccessToken(options.credential);
  if (pendingFetches.has(key)) return pendingFetches.get(key);
  const pending = fetchQuotaUncoalesced(options).finally(() => {
    if (pendingFetches.get(key) === pending) pendingFetches.delete(key);
  });
  pendingFetches.set(key, pending);
  return pending;
};

/** Test seam: clears the rate-limit cache between cases. */
export const resetClaudeQuotaCache = () => {
  cachedUsage = null;
  cooldownUntil = 0;
  pendingFetches.clear();
};
