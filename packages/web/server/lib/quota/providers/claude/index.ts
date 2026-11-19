
import { createHash } from 'crypto';

import { buildResult } from '../../utils/index.js';
<<<<<<< HEAD:packages/web/server/lib/quota/providers/claude/index.js
import { credentialAccessToken, credentialRefreshToken } from '../selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/claude/index.js
import { findClaudeCredential, loadClaudeCredential } from './auth.js';
=======
import type { ProviderUsage, QuotaResult } from '../../utils/contracts.js';
import type { LegacyAuthFile } from '../../../opencode/auth.js';
import { findClaudeCredential, loadClaudeCredential } from './auth.js';
import type { ClaudeCredential } from './auth.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/claude/index.ts
import { toClaudeUsage } from './transforms.js';

export const providerId = 'claude';
export const providerName = 'Claude';

const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const OAUTH_BETA_HEADER = 'oauth-2025-04-20';
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_COOLDOWN_MS = 60 * 60 * 1000;
<<<<<<< HEAD:packages/web/server/lib/quota/providers/claude/index.js
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/claude/index.js
const SESSION_EXPIRED_ERROR = 'Claude session expired. Open Claude Code to sign in again.';
=======
const SESSION_EXPIRED_ERROR = 'Claude session expired. Open Claude Code to sign in again.';
const USAGE_DENIED_ERROR = 'Anthropic does not let this Claude token read usage. A token from `claude setup-token` cannot; a Claude Code sign-in (`/login`) can.';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/claude/index.ts

let cachedUsage: { fingerprint: string; usage: ProviderUsage; planLabel: string | null } | null = null;
let cooldownUntil = 0;
<<<<<<< HEAD:packages/web/server/lib/quota/providers/claude/index.js
const pendingFetches = new Map();
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/claude/index.js
let pendingFetch = null;
let lastFingerprint = null;
=======
let pendingFetch: Promise<QuotaResult> | null = null;
let lastFingerprint: string | null = null;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/claude/index.ts

const fingerprintOf = (credential: ClaudeCredential) =>
  createHash('sha256').update(`${credential.accessToken}\0${credential.refreshToken ?? ''}`).digest('hex');

const cooldownFromHeader = (response: Response) => {
  const raw = response.headers.get('retry-after');
  const retryAfter = raw ? Number(raw) : Number.NaN;
  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return Math.min(retryAfter * 1000, MAX_COOLDOWN_MS);
  }
  const retryAt = raw ? Date.parse(raw) : Number.NaN;
  if (Number.isFinite(retryAt) && retryAt > Date.now()) {
    return Math.min(retryAt - Date.now(), MAX_COOLDOWN_MS);
  }
  return DEFAULT_COOLDOWN_MS;
};

const cachedResultFor = (fingerprint: string, planLabel: string | null) => {
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

const failure = (error: string, { configured = true } = {}) =>
  buildResult({ providerId, providerName, ok: false, configured, error });

<<<<<<< HEAD:packages/web/server/lib/quota/providers/claude/index.js
export const isConfigured = (credential) => credential?.type === 'oauth' && Boolean(credentialAccessToken(credential));
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/claude/index.js
export const isConfigured = (auth) => Boolean(findClaudeCredential(auth));
=======
export const isConfigured = (auth: LegacyAuthFile) => Boolean(findClaudeCredential(auth));
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/claude/index.ts

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
<<<<<<< HEAD:packages/web/server/lib/quota/providers/claude/index.js
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/claude/index.js
  lastFingerprint = fingerprint;

  const expiresAt = credential.expiresAt;
  if (Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now()) {
    return failure(SESSION_EXPIRED_ERROR);
  }
=======
  lastFingerprint = fingerprint;

  const expiresAt = credential.expiresAt;
  if (expiresAt !== null && Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now()) {
    return failure(SESSION_EXPIRED_ERROR);
  }
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/claude/index.ts

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

<<<<<<< HEAD:packages/web/server/lib/quota/providers/claude/index.js
  if (response.status === 401 || response.status === 403) {
    return failure('Claude session expired. Open Claude Code to sign in again.');
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/claude/index.js
  if (response.status === 401 || response.status === 403) {
    return failure(SESSION_EXPIRED_ERROR);
=======
  if (response.status === 401) {
    return failure(SESSION_EXPIRED_ERROR);
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/claude/index.ts
  }

  if (response.status === 403) {
    return failure(USAGE_DENIED_ERROR);
  }

  if (!response.ok) {
    return failure(`API error: ${response.status}`);
  }

  let payload: unknown;
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

export const resetClaudeQuotaCache = () => {
  cachedUsage = null;
  cooldownUntil = 0;
  pendingFetches.clear();
};
