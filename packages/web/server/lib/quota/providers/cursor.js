import { credentialAccessToken, credentialRefreshToken } from './selected-credential.js';
import {
  buildResult,
  formatMoney,
  toNumber,
  toTimestamp,
  toUsageWindow
} from '../utils/index.js';

const BASE_URL = 'https://api2.cursor.sh';
const USAGE_URL = `${BASE_URL}/aiserver.v1.DashboardService/GetCurrentPeriodUsage`;
const PLAN_URL = `${BASE_URL}/aiserver.v1.DashboardService/GetPlanInfo`;
const HARD_LIMIT_URL = `${BASE_URL}/aiserver.v1.DashboardService/GetHardLimit`;
const TEAM_SPEND_URL = `${BASE_URL}/aiserver.v1.DashboardService/GetTeamSpend`;
const ME_URL = `${BASE_URL}/aiserver.v1.DashboardService/GetMe`;
const AUTH_USAGE_URL = `${BASE_URL}/auth/usage`;
const STRIPE_PROFILE_URL = `${BASE_URL}/auth/full_stripe_profile`;
const CREDITS_URL = `${BASE_URL}/aiserver.v1.DashboardService/GetCreditGrantsBalance`;
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const providerId = 'cursor';
export const providerName = 'Cursor';


const readJwtPayload = (token) => {
  try {
    const [, payload] = String(token).split('.');
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
};


const tokenNeedsRefresh = (token) => {
  if (!token) return true;
  const payload = readJwtPayload(token);
  const expiresAt = typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
  return !expiresAt || expiresAt - Date.now() <= REFRESH_BUFFER_MS;
};



const connectPost = async (url, accessToken, body = {}) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Connect-Protocol-Version': '1'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Cursor session expired' : `API error: ${response.status}`);
  }

  return response.json();
};

const connectGet = async (url, accessToken) => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? 'Cursor session expired' : `API error: ${response.status}`);
  }

  return response.json();
};

const centsLabel = (cents) => {
  const value = toNumber(cents);
  return value === null ? null : `$${formatMoney(value / 100)}`;
};

const percentFromSpend = (planUsage) => {
  const explicit = toNumber(planUsage?.totalPercentUsed);
  if (explicit !== null) return explicit;
  const limit = toNumber(planUsage?.limit);
  const remaining = toNumber(planUsage?.remaining);
  if (!limit || remaining === null) return null;
  return Math.min(100, Math.max(0, ((limit - remaining) / limit) * 100));
};

const buildWindows = (usage, plan) => {
  const planUsage = usage?.planUsage ?? {};
  const spendLimitUsage = usage?.spendLimitUsage ?? {};
  const resetAt = toTimestamp(usage?.billingCycleEnd ?? plan?.planInfo?.billingCycleEnd);
  const windowSeconds = resetAt ? Math.max(0, Math.floor((resetAt - Date.now()) / 1000)) : null;
  const windows = {};

  windows.billing_cycle = toUsageWindow({
    usedPercent: percentFromSpend(planUsage),
    windowSeconds,
    resetAt,
    valueLabel: centsLabel(planUsage.totalSpend)
  });

  const autoPercent = toNumber(planUsage.autoPercentUsed);
  if (autoPercent !== null) {
    windows.auto = toUsageWindow({ usedPercent: autoPercent, windowSeconds, resetAt });
  }

  const apiPercent = toNumber(planUsage.apiPercentUsed);
  if (apiPercent !== null) {
    windows.api = toUsageWindow({ usedPercent: apiPercent, windowSeconds, resetAt });
  }

  const planLimit = centsLabel(planUsage.limit);
  if (planLimit) {
    const limit = toNumber(planUsage.limit);
    const remaining = toNumber(planUsage.remaining);
    windows.plan_limit = toUsageWindow({
      usedPercent: limit && remaining !== null
        ? Math.min(100, Math.max(0, ((limit - remaining) / limit) * 100))
        : null,
      windowSeconds,
      resetAt,
      valueLabel: `${centsLabel(planUsage.remaining) ?? '$0.00'} remaining of ${planLimit}`
    });
  }

  const onDemandLimit = toNumber(spendLimitUsage.individualLimit) ?? toNumber(spendLimitUsage.pooledLimit);
  if (onDemandLimit && onDemandLimit > 0) {
    const remaining = toNumber(spendLimitUsage.individualRemaining) ?? toNumber(spendLimitUsage.pooledRemaining) ?? 0;
    windows.on_demand = toUsageWindow({
      usedPercent: Math.min(100, Math.max(0, ((onDemandLimit - remaining) / onDemandLimit) * 100)),
      windowSeconds,
      resetAt,
      valueLabel: `${centsLabel(remaining) ?? '$0.00'} remaining of ${centsLabel(onDemandLimit)}`
    });
  }

  return windows;
};

const AUTH_USAGE_METADATA_KEYS = new Set(['startOfMonth']);

const pickRequestUsage = (authUsage) => {
  let best = null;
  for (const [key, entry] of Object.entries(authUsage ?? {})) {
    if (AUTH_USAGE_METADATA_KEYS.has(key)) continue;
    const used = toNumber(entry?.numRequests);
    const limit = toNumber(entry?.maxRequestUsage);
    if (used === null || !limit) continue;
    if (!best || limit > best.limit) best = { used, limit, bucket: key };
  }
  return best;
};

const pickTeamMemberSpendByUserId = (teamSpend, userId) => {
  const id = toNumber(userId);
  if (id === null || !Array.isArray(teamSpend?.teamMemberSpend)) return null;
  return teamSpend.teamMemberSpend.find((member) => toNumber(member?.userId) === id) ?? null;
};

const buildEnterpriseWindows = (usage, plan, authUsage, hardLimit, teamMemberSpend) => {
  const resetAt = toTimestamp(plan?.planInfo?.billingCycleEnd ?? usage?.billingCycleEnd);
  const windowSeconds = resetAt ? Math.max(0, Math.floor((resetAt - Date.now()) / 1000)) : null;
  const windows = {};
  const requestUsage = pickRequestUsage(authUsage);

  if (requestUsage) {
    const { used, limit } = requestUsage;
    windows.billing_cycle = toUsageWindow({
      usedPercent: Math.min(100, Math.max(0, (used / limit) * 100)),
      windowSeconds,
      resetAt,
      valueLabel: `${Math.round(used)} / ${Math.round(limit)}`
    });
  }

  const onDemandLimitDollars = toNumber(hardLimit?.hardLimitPerUser);
  const onDemandUsedCents = toNumber(teamMemberSpend?.spendCents);
  if (onDemandLimitDollars > 0 && onDemandUsedCents !== null) {
    const onDemandLimitCents = onDemandLimitDollars * 100;
    windows.on_demand = toUsageWindow({
      usedPercent: Math.min(100, Math.max(0, (onDemandUsedCents / onDemandLimitCents) * 100)),
      windowSeconds,
      resetAt,
      valueLabel: `${centsLabel(onDemandUsedCents)} / ${centsLabel(onDemandLimitCents)}`
    });
  }

  return windows;
};

const appendCreditsWindow = (windows, credits) => {
  const balance = toNumber(credits?.balanceCents ?? credits?.totalBalanceCents ?? credits?.amountCents);
  if (balance === null) return;
  windows.credits = toUsageWindow({
    usedPercent: null,
    windowSeconds: null,
    resetAt: null,
    valueLabel: centsLabel(balance)
  });
};

export const isConfigured = (credential) => Boolean(credentialAccessToken(credential) || credentialRefreshToken(credential));

export const fetchQuota = async ({ credential } = {}) => {
  const accessToken = credentialAccessToken(credential);
  if (accessToken && (tokenNeedsRefresh(accessToken) || (Number.isFinite(credential.expires) && credential.expires <= Date.now()))) {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: 'Selected Cursor credential requires re-authentication' });
  }
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
    const [usage, plan, credits] = await Promise.all([
      connectPost(USAGE_URL, accessToken),
      connectPost(PLAN_URL, accessToken).catch(() => null),
      connectPost(CREDITS_URL, accessToken).catch(() => null)
    ]);

    if (usage?.enabled === false) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: 'No active Cursor subscription'
      });
    }

    if (!usage?.planUsage) {
      const profile = await connectGet(STRIPE_PROFILE_URL, accessToken).catch(() => null);
      const teamId = profile?.teamId ? String(profile.teamId) : null;
      const hardLimitBody = teamId ? { teamId } : {};
      const [authUsage, hardLimit, teamSpend, me] = await Promise.all([
        connectGet(AUTH_USAGE_URL, accessToken).catch(() => null),
        connectPost(HARD_LIMIT_URL, accessToken, hardLimitBody).catch(() => null),
        teamId ? connectPost(TEAM_SPEND_URL, accessToken, hardLimitBody).catch(() => null) : null,
        connectPost(ME_URL, accessToken).catch(() => null)
      ]);
      const memberSpend = pickTeamMemberSpendByUserId(teamSpend, me?.userId);
      const windows = buildEnterpriseWindows(usage, plan, authUsage, hardLimit, memberSpend);
      if (!windows.billing_cycle && !windows.on_demand) {
        return buildResult({
          providerId,
          providerName,
          ok: false,
          configured: true,
          error: 'No active Cursor subscription'
        });
      }
      appendCreditsWindow(windows, credits);

      const planName = plan?.planInfo?.planName;
      return buildResult({
        providerId,
        providerName: planName ? `Cursor ${planName}` : providerName,
        ok: true,
        configured: true,
        usage: { windows }
      });
    }

    const windows = buildWindows(usage, plan);
    appendCreditsWindow(windows, credits);

    return buildResult({
      providerId,
      providerName: plan?.planInfo?.planName ? `Cursor ${plan.planInfo.planName}` : providerName,
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
