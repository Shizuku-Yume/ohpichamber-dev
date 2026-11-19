<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
import { credentialAccessToken } from './selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js
import { readOpenCodeCredentials } from '../../opencode/auth.js';
=======
import { z } from 'zod';
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import type { LegacyAuthFile } from '../../opencode/auth.js';
import type { UsageWindow } from '../utils/contracts.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts
import {
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
  formatCredits
} from '../utils/index.js';

<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
const buildCopilotWindows = (payload) => {
  const quota = payload?.quota_snapshots ?? {};
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js
const resolveCopilotPlanLabel = (payload) => {
  if (!payload) return null;
  const sku = asNonEmptyString(payload.access_type_sku);
  const plan = asNonEmptyString(payload.copilot_plan);
  const canSignup = Boolean(payload.can_signup_for_limited);

  if (sku === 'free_limited_copilot') return 'Copilot Free';
  if (sku === 'free_educational_quota') return 'Copilot Student';
  if (plan === 'individual_edu') return 'Copilot Student';
  if (plan === 'individual') return 'Copilot Pro';
  if (plan === 'individual_pro') return 'Copilot Pro+';
  if (plan === 'individual_max') return 'Copilot Max';
  if (plan === 'business') return 'Copilot Business';
  if (plan === 'enterprise') return 'Copilot Enterprise';
  if (canSignup) return 'Copilot Free';
  return null;
};

const buildCopilotWindows = (payload) => {
  const quota = payload?.quota_snapshots ?? {};
=======
interface CopilotPayload {
  access_type_sku?: unknown;
  copilot_plan?: unknown;
  can_signup_for_limited?: unknown;
  quota_snapshots?: unknown;
  quota_reset_date?: unknown;
}

interface CopilotSnapshots {
  premium_interactions?: unknown;
}

interface CopilotSnapshot {
  unlimited?: unknown;
  credits_used?: unknown;
  has_quota?: unknown;
  entitlement?: unknown;
  quota_remaining?: unknown;
  remaining?: unknown;
  percent_remaining?: unknown;
}

interface CopilotAuthFields {
  access?: unknown;
  token?: unknown;
  enterpriseUrl?: unknown;
}

const hasFields = (value: unknown): value is Record<string, unknown> => value !== null && value !== undefined;
const asPayload = z.custom<CopilotPayload>(hasFields).nullish().parse;
const asSnapshots = z.custom<CopilotSnapshots>(hasFields).nullish().parse;
const asSnapshot = z.custom<CopilotSnapshot>(hasFields).nullish().parse;
const asAuthFields = z.custom<CopilotAuthFields>(hasFields).nullish().parse;
const isString = (value: unknown): value is string => typeof value === 'string';

const resolveCopilotPlanLabel = (payload: CopilotPayload | null | undefined) => {
  if (!payload) return null;
  const sku = asNonEmptyString(payload.access_type_sku);
  const plan = asNonEmptyString(payload.copilot_plan);
  const canSignup = Boolean(payload.can_signup_for_limited);

  if (sku === 'free_limited_copilot') return 'Copilot Free';
  if (sku === 'free_educational_quota') return 'Copilot Student';
  if (plan === 'individual_edu') return 'Copilot Student';
  if (plan === 'individual') return 'Copilot Pro';
  if (plan === 'individual_pro') return 'Copilot Pro+';
  if (plan === 'individual_max') return 'Copilot Max';
  if (plan === 'business') return 'Copilot Business';
  if (plan === 'enterprise') return 'Copilot Enterprise';
  if (canSignup) return 'Copilot Free';
  return null;
};

const buildCopilotWindows = (payload: CopilotPayload | null | undefined) => {
  const quota = asSnapshots(payload?.quota_snapshots) ?? {};
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts
  const resetAt = toTimestamp(payload?.quota_reset_date);
  const windows: Record<string, UsageWindow> = {};

<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
  // Mirrors the quota semantics of microsoft/vscode-copilot-chat
  // (CopilotUserQuotaInfo): each snapshot carries entitlement, remaining,
  // unlimited, and percent_remaining. Unlimited plans report no usable
  // entitlement; percent_remaining is a server-computed fallback.
  const addWindow = (label, snapshot) => {
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js
  // Mirrors the quota semantics of microsoft/vscode-copilot-chat
  // (CopilotUserQuotaInfo): each snapshot carries entitlement, remaining,
  // unlimited, and percent_remaining. Unlimited plans report no usable
  // entitlement; percent_remaining is a server-computed fallback.
  // `usedPercent` is computed from remaining/entitlement, and the value label
  // derives its credits from the same `entitlement - quota_remaining` axis
  // GitHub's own Copilot panel uses, so the percent and the label agree.
  const addWindow = (label, snapshot) => {
=======
  const addWindow = (label: string, snapshot: CopilotSnapshot | null | undefined) => {
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts
    if (!snapshot) return;

    if (snapshot.unlimited === true) {
<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js
      const creditsUsed = toNumber(typeof snapshot.credits_used === 'string'
        ? asNonEmptyString(snapshot.credits_used)
        : snapshot.credits_used);
      const showCreditsUsed = snapshot.has_quota !== false && creditsUsed !== null && creditsUsed >= 0;
=======
      const creditsUsed = toNumber(isString(snapshot.credits_used)
        ? asNonEmptyString(snapshot.credits_used)
        : snapshot.credits_used);
      const showCreditsUsed = snapshot.has_quota !== false && creditsUsed !== null && creditsUsed >= 0;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts
      windows[label] = toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt,
        valueLabel: 'Unlimited'
      });
      return;
    }

    const entitlement = toNumber(snapshot.entitlement);
    const remaining = toNumber(snapshot.quota_remaining) ?? toNumber(snapshot.remaining);
    let usedPercent = entitlement !== null && entitlement > 0 && remaining !== null
      ? Math.min(100, Math.max(0, 100 - (remaining / entitlement) * 100))
      : null;
    if (usedPercent === null) {
      const percentRemaining = toNumber(snapshot.percent_remaining);
      if (percentRemaining !== null) {
        usedPercent = Math.min(100, Math.max(0, 100 - percentRemaining));
      }
    }
    const used = entitlement === null || entitlement <= 0
      ? null
      : remaining !== null
        ? Math.max(0, Math.min(entitlement, entitlement - remaining))
        : null;
    const valueLabel = used === null || entitlement === null
      ? null
      : `${formatCredits(used)} / ${formatCredits(entitlement)} used`;
    windows[label] = toUsageWindow({
      usedPercent,
      windowSeconds: null,
      resetAt,
      valueLabel
    });
  };

  addWindow('premium_interactions', asSnapshot(quota.premium_interactions));

  return windows;
};

export const providerId = 'github-copilot';
export const providerName = 'GitHub Copilot';
const INVALID_COPILOT_ENTERPRISE_URL = 'Invalid GitHub Copilot Enterprise URL';
<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js

// A Copilot login on GitHub Enterprise Server carries `enterpriseUrl`, and that
// server hosts its own quota endpoint. Only a bare origin with a plausible DNS
// hostname is accepted, so a value that is not a usable host is refused here
// rather than turned into a request that carries the credential.
=======

>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts
const COPILOT_ENTERPRISE_HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

const copilotUserUrl = z.unknown().transform((enterpriseUrl) => {
  const host = `${enterpriseUrl ?? ''}`.trim();
  if (!host) return 'https://api.github.com/copilot_internal/user';
  let url;
  try {
    url = new URL(host.includes('://') ? host : `https://${host}`);
  } catch {
    throw new Error(INVALID_COPILOT_ENTERPRISE_URL);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(INVALID_COPILOT_ENTERPRISE_URL);
  if (url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) {
    throw new Error(INVALID_COPILOT_ENTERPRISE_URL);
  }
  if (!COPILOT_ENTERPRISE_HOST.test(url.hostname)) throw new Error(INVALID_COPILOT_ENTERPRISE_URL);
  return `https://api.${url.hostname}/copilot_internal/user`;
}).parse;

<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
export const isConfigured = (credential) => Boolean(credentialAccessToken(credential));
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js
export const isConfigured = (auth) => {
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.access || entry?.token);
};
=======
export const isConfigured = (auth: LegacyAuthFile) => {
  const entry = asAuthFields(normalizeAuthEntry(getAuthEntry(auth, aliases)));
  return Boolean(entry?.access || entry?.token);
};
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
export const fetchQuota = async ({ credential } = {}) => {
  const accessToken = credentialAccessToken(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js
export const fetchQuota = async () => {
  const auth = await readOpenCodeCredentials();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = entry?.access ?? entry?.token;
=======
export const fetchQuota = async () => {
  const auth = await readOpenCodeCredentials();
  const entry = asAuthFields(normalizeAuthEntry(getAuthEntry(auth, aliases)));
  const accessToken = entry?.access ?? entry?.token;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts

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
    const response = await fetch(copilotUserUrl(credential?.enterpriseUrl), {
      method: 'GET',
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.96.2',
        'X-Github-Api-Version': '2025-04-01'
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

<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
    const payload = await response.json();
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js
    const payload = await response.json();
    const planLabel = resolveCopilotPlanLabel(payload);
=======
    const payload = asPayload(await response.json());
    const planLabel = resolveCopilotPlanLabel(payload);
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts
    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows: buildCopilotWindows(payload) }
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error?.message === INVALID_COPILOT_ENTERPRISE_URL ? error.message : 'Request failed'
    });
  }
};

export const providerIdAddon = 'github-copilot-addon';
export const providerNameAddon = 'GitHub Copilot Add-on';

<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
export const fetchQuotaAddon = async ({ credential } = {}) => {
  const accessToken = credentialAccessToken(credential);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js
export const fetchQuotaAddon = async () => {
  const auth = await readOpenCodeCredentials();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = entry?.access ?? entry?.token;
=======
export const fetchQuotaAddon = async () => {
  const auth = await readOpenCodeCredentials();
  const entry = asAuthFields(normalizeAuthEntry(getAuthEntry(auth, aliases)));
  const accessToken = entry?.access ?? entry?.token;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts

  if (!accessToken) {
    return buildResult({
      providerId: providerIdAddon,
      providerName: providerNameAddon,
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  try {
    const response = await fetch(copilotUserUrl(credential?.enterpriseUrl), {
      method: 'GET',
      headers: {
        Authorization: `token ${accessToken}`,
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.96.2',
        'X-Github-Api-Version': '2025-04-01'
      }
    });

    if (!response.ok) {
      return buildResult({
        providerId: providerIdAddon,
        providerName: providerNameAddon,
        ok: false,
        configured: true,
        error: `API error: ${response.status}`
      });
    }

<<<<<<< HEAD:packages/web/server/lib/quota/providers/copilot.js
    const payload = await response.json();
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/copilot.js
    const payload = await response.json();
    const planLabel = resolveCopilotPlanLabel(payload);
=======
    const payload = asPayload(await response.json());
    const planLabel = resolveCopilotPlanLabel(payload);
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/copilot.ts
    return buildResult({
      providerId: providerIdAddon,
      providerName: providerNameAddon,
      ok: true,
      configured: true,
      usage: { windows: buildCopilotWindows(payload) }
    });
  } catch (error) {
    return buildResult({
      providerId: providerIdAddon,
      providerName: providerNameAddon,
      ok: false,
      configured: true,
      error: error?.message === INVALID_COPILOT_ENTERPRISE_URL ? error.message : 'Request failed'
    });
  }
};
