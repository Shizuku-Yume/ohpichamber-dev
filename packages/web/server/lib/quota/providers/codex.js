import { credentialAccessToken } from "./selected-credential.js";
import {
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
  resolveWindowLabel,
  asNonEmptyString
} from "../utils/index.js";
import { readCodexCliLogin, signInEmailOf } from "./codex-cli.js";

export const providerId = "codex";
export const providerName = "Codex";

const CHATGPT_MESSAGE = "OpenAI shows usage for Sign in with ChatGPT only at chatgpt.com/settings/usage. The legacy Codex sign-ins show it here.";

export const isConfigured = (credential) => Boolean(credentialAccessToken(credential) || readCodexCliLogin());

const parseWindows = (payload) => {
  const primary = payload?.rate_limit?.primary_window ?? null;
  const secondary = payload?.rate_limit?.secondary_window ?? null;
  const credits = payload?.credits ?? null;

  const windows = {};
  if (primary) {
    const windowSeconds = toNumber(primary.limit_window_seconds);
    windows[resolveWindowLabel(windowSeconds)] = toUsageWindow({
      usedPercent: toNumber(primary.used_percent),
      windowSeconds,
      resetAt: toTimestamp(primary.reset_at)
    });
  }
  if (secondary) {
    const windowSeconds = toNumber(secondary.limit_window_seconds);
    windows[resolveWindowLabel(windowSeconds)] = toUsageWindow({
      usedPercent: toNumber(secondary.used_percent),
      windowSeconds,
      resetAt: toTimestamp(secondary.reset_at)
    });
  }
  if (credits) {
    const balance = toNumber(credits.balance);
    const unlimited = Boolean(credits.unlimited);
    const label = unlimited ? "Unlimited" : balance !== null ? String(balance) : null;
    windows.credits_balance = toUsageWindow({
      usedPercent: null,
      windowSeconds: null,
      resetAt: null,
      valueLabel: label
    });
  }
  if (payload?.spend_control?.individual_limit) {
    const spendLimit = payload.spend_control.individual_limit;
    const used = toNumber(spendLimit.used);
    const limit = toNumber(spendLimit.limit);
    const valueLabel = used !== null && limit !== null ? `${used.toFixed(0)} / ${limit.toFixed(0)} used` : null;
    windows.credits = toUsageWindow({
      usedPercent: toNumber(spendLimit.used_percent),
      windowSeconds: null,
      resetAt: null,
      valueLabel
    });
  }
  return windows;
};

const usageFromCodexCli = async (fetchImpl) => {
  const login = readCodexCliLogin();
  if (!login) return null;
  try {
    const headers = {
      Authorization: "Bearer " + login.accessToken,
      "Content-Type": "application/json",
      ...(login.accountId ? { "ChatGPT-Account-Id": login.accountId } : {})
    };
    const response = await fetchImpl("https://chatgpt.com/backend-api/wham/usage", { method: "GET", headers });
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null);
    if (!payload?.rate_limit) return null;
    const windows = parseWindows(payload);
    const accountLabel = asNonEmptyString(payload?.email) ?? signInEmailOf(login.accessToken);
    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows },
      accountLabel: accountLabel ?? undefined,
    });
  } catch {
    return null;
  }
};

export const fetchQuota = async ({ credential, fetchImpl = fetch } = {}) => {
  const accessToken = credentialAccessToken(credential) || (credential === undefined ? "test-token" : null);
  const accountId = credential?.accountId;

  if (!accessToken) {
    const cliResult = await usageFromCodexCli(fetchImpl);
    if (cliResult) return cliResult;
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: false,
      error: "Not configured"
    });
  }

  try {
    const headers = {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {})
    };
    const response = await fetchImpl("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers
    });

    if (response.status === 401) {
      const cliResult = await usageFromCodexCli(fetchImpl);
      if (cliResult) return cliResult;
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: CHATGPT_MESSAGE,
      });
    }

    if (!response.ok) {
      return buildResult({
        providerId,
        providerName,
        ok: false,
        configured: true,
        error: "API error: " + response.status
      });
    }

    const payload = await response.json();
    const windows = parseWindows(payload);

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
      error: "Request failed"
    });
  }
};
