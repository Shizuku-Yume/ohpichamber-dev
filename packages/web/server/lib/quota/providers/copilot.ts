import { credentialAccessToken } from './selected-credential.js';
import {
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
  formatCredits
} from '../utils/index.js';

const buildCopilotWindows = (payload) => {
  const quota = payload?.quota_snapshots ?? {};
  const resetAt = toTimestamp(payload?.quota_reset_date);
  const windows: Record<string, UsageWindow> = {};

  const addWindow = (label: string, snapshot: CopilotSnapshot | null | undefined) => {
    if (!snapshot) return;

    if (snapshot.unlimited === true) {
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

export const isConfigured = (credential) => Boolean(credentialAccessToken(credential));

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

    const payload = await response.json();
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

export const fetchQuotaAddon = async ({ credential } = {}) => {
  const accessToken = credentialAccessToken(credential);

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

    const payload = await response.json();
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
