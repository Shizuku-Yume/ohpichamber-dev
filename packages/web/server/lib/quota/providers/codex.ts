<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
import { credentialAccessToken } from "./selected-credential.js";
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
import { readOpenCodeCredentials } from '../../opencode/auth.js';
=======
import { z } from 'zod';
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import type { LegacyAuthFile } from '../../opencode/auth.js';
import type { UsageWindow } from '../utils/contracts.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts
import {
  buildResult,
  toUsageWindow,
  toNumber,
  toTimestamp,
  resolveWindowLabel,
<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
  asNonEmptyString
} from "../utils/index.js";
import { readCodexCliLogin, signInEmailOf } from "./codex-cli.js";
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
  asNonEmptyString
} from '../utils/index.js';
import { readCodexCliLogin, signInEmailOf } from './codex-cli.js';
=======
  asNonEmptyString,
  formatCredits,
  formatMoney
} from '../utils/index.js';
import { readCodexCliLogin, signInEmailOf } from './codex-cli.js';
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
export const providerId = "codex";
export const providerName = "Codex";
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
export const providerId = 'codex';
export const providerName = 'Codex';
const aliases = ['openai', 'codex', 'chatgpt'];
=======
interface CodexFields {
  access?: unknown;
  token?: unknown;
  accountId?: unknown;
  rate_limit?: unknown;
  primary_window?: unknown;
  secondary_window?: unknown;
  credits?: unknown;
  limit_window_seconds?: unknown;
  used_percent?: unknown;
  reset_at?: unknown;
  balance?: unknown;
  unlimited?: unknown;
  spend_control?: unknown;
  individual_limit?: unknown;
  used?: unknown;
  limit?: unknown;
  unit?: unknown;
  email?: unknown;
  error?: unknown;
  type?: unknown;
}

const hasFields = (value: unknown): value is CodexFields => value !== null && value !== undefined;
const asFields = z.custom<CodexFields | null>(hasFields).catch(null).parse;

interface UsageCredential {
  accessToken: unknown;
  accountId?: unknown;
}

type UsageHeaders = {
  Authorization: string;
  'Content-Type': string;
  'ChatGPT-Account-Id'?: string;
};

export const providerId = 'codex';
export const providerName = 'Codex';
const aliases = ['openai', 'codex', 'chatgpt'];
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts

const CHATGPT_MESSAGE = "OpenAI shows usage for Sign in with ChatGPT only at chatgpt.com/settings/usage. The legacy Codex sign-ins show it here.";

<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
export const isConfigured = (credential) => Boolean(credentialAccessToken(credential) || readCodexCliLogin());
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
export const isConfigured = (auth) => {
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  return Boolean(entry?.access || entry?.token);
};
=======
export const isConfigured = (auth: LegacyAuthFile) => {
  const entry = asFields(normalizeAuthEntry(getAuthEntry(auth, aliases)));
  return Boolean(entry?.access || entry?.token);
};
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
const parseWindows = (payload) => {
  const primary = payload?.rate_limit?.primary_window ?? null;
  const secondary = payload?.rate_limit?.secondary_window ?? null;
  const credits = payload?.credits ?? null;
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
// A fixed origin with a bearer token: a redirect would carry the token elsewhere.
const requestUsage = (accessToken, accountId) => fetch(USAGE_URL, {
  method: 'GET',
  redirect: 'error',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    ...(accountId ? { 'ChatGPT-Account-Id': accountId } : {})
  }
});

const usageWindowsOf = (payload) => {
  const primary = payload?.rate_limit?.primary_window ?? null;
  const secondary = payload?.rate_limit?.secondary_window ?? null;
  const credits = payload?.credits ?? null;
=======
const requestUsage = ({ accessToken, accountId }: UsageCredential) => {
  const headers: UsageHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  };
  if (accountId) headers['ChatGPT-Account-Id'] = `${accountId}`;
  return fetch(USAGE_URL, {
  method: 'GET',
  redirect: 'error',
  headers
});
};

const usageWindowsOf = (payload: CodexFields | null) => {
  const primary = asFields(asFields(payload?.rate_limit)?.primary_window) ?? null;
  const secondary = asFields(asFields(payload?.rate_limit)?.secondary_window) ?? null;
  const credits = asFields(payload?.credits) ?? null;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts

  const windows: Record<string, UsageWindow> = {};
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
<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
    const label = unlimited ? "Unlimited" : balance !== null ? String(balance) : null;
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
    const label = unlimited
      ? 'Unlimited'
      : balance !== null
        ? String(balance)
        : null;
=======
    const label = unlimited
      ? 'Unlimited'
      : balance !== null
        ? formatCredits(balance)
        : null;
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts
    windows.credits_balance = toUsageWindow({
      usedPercent: null,
      windowSeconds: null,
      resetAt: null,
      valueLabel: label
    });
  }
<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
  if (payload?.spend_control?.individual_limit) {
    const spendLimit = payload.spend_control.individual_limit;
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js

  // Business/enterprise accounts expose a dollar spend cap under
  // `spend_control.individual_limit`. Surface it as an additive `credits`
  // window so existing consumers keep working.
  if (payload?.spend_control?.individual_limit) {
    const spendLimit = payload.spend_control.individual_limit;
=======

  const spendLimit = asFields(asFields(payload?.spend_control)?.individual_limit);
  if (spendLimit) {
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts
    const used = toNumber(spendLimit.used);
    const limit = toNumber(spendLimit.limit);
<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
    const valueLabel = used !== null && limit !== null ? `${used.toFixed(0)} / ${limit.toFixed(0)} used` : null;
    windows.credits = toUsageWindow({
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
    const valueLabel = used !== null && limit !== null
      ? `${used.toFixed(0)} / ${limit.toFixed(0)} used`
      : null;
    windows.credits = toUsageWindow({
=======
    const isUsd = spendLimit.unit === 'usd';
    const valueLabel = used !== null && limit !== null
      ? isUsd
        ? `$${formatMoney(used)} / $${formatMoney(limit)}`
        : `${used.toFixed(0)} / ${limit.toFixed(0)} used`
      : null;
    windows[isUsd ? 'usage' : 'credits'] = toUsageWindow({
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts
      usedPercent: toNumber(spendLimit.used_percent),
      windowSeconds: null,
      resetAt: null,
      valueLabel
    });
  }
  return windows;
};

<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
const usageFromCodexCli = async (fetchImpl) => {
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
const usageResult = (payload, accountLabel = null) => buildResult({
  providerId,
  providerName,
  ok: true,
  configured: true,
  usage: { windows: usageWindowsOf(payload) },
  accountLabel
});

const failure = (error, configured = true) => buildResult({ providerId, providerName, ok: false, configured, error });

/**
 * Usage read with the Codex CLI's sign-in when OpenCode's cannot read it. The
 * numbers are always named by the CLI account's email (from the answer, else
 * from the CLI token): OpenCode's token-sharing token says nothing about whose
 * it is, so another account's limits could otherwise pass for the user's own.
 * A CLI read that fails in any way leaves the message.
 */
const usageFromCodexCli = async () => {
=======
const usageResult = (payload: CodexFields | null, accountLabel: string | null = null) => buildResult({
  providerId,
  providerName,
  ok: true,
  configured: true,
  usage: { windows: usageWindowsOf(payload) },
  accountLabel
});

const failure = (error: string, configured = true) => buildResult({ providerId, providerName, ok: false, configured, error });

const usageFromCodexCli = async () => {
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts
  const login = readCodexCliLogin();
  if (!login) return null;
<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
  const response = await requestUsage(login.accessToken, login.accountId).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json();
  return usageResult(payload, asNonEmptyString(payload?.email) ?? signInEmailOf(login.accessToken));
};

export const fetchQuota = async () => {
  const auth = await readOpenCodeCredentials();
  const entry = normalizeAuthEntry(getAuthEntry(auth, aliases));
  const accessToken = entry?.access ?? entry?.token;
  const accountId = entry?.accountId;

  if (!accessToken) return failure('Not configured', false);

=======
  const response = await requestUsage(login).catch(() => null);
  if (!response?.ok) return null;
  const payload = asFields(await response.json());
  return usageResult(payload, asNonEmptyString(payload?.email) ?? signInEmailOf(login.accessToken));
};

export const fetchQuota = async () => {
  const auth = await readOpenCodeCredentials();
  const entry = asFields(normalizeAuthEntry(getAuthEntry(auth, aliases)));
  const accessToken = entry?.access ?? entry?.token;
  const accountId = entry?.accountId;

  if (!accessToken) return failure('Not configured', false);

>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts
  try {
<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
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
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
    const response = await requestUsage(accessToken, accountId);
    if (response.ok) return usageResult(await response.json());
    if (response.status !== 401) return failure(`API error: ${response.status}`);
=======
    const response = await requestUsage({ accessToken, accountId });
    if (response.ok) return usageResult(asFields(await response.json()));
    if (response.status !== 401) return failure(`API error: ${response.status}`);
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/codex.js
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
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/codex.js
    // A 401 is not always an expired token. OpenCode's `chatgpt-token-sharing`
    // sign-in ("Sign in with ChatGPT") holds a token that only reaches the
    // Responses route, and the usage endpoint refuses it with an
    // access-enforcement body (`rejected_by_access_enforcement`). OpenAI has no
    // usage endpoint for that sign-in, so the numbers come from the Codex CLI's
    // own sign-in on this machine when it has one; without it the message
    // sends the user to the ChatGPT usage page instead of asking to sign in again.
    const body = await response.json().catch(() => null);
    if (asNonEmptyString(body?.error?.type) !== 'rejected_by_access_enforcement') {
      return failure('Session expired — please re-authenticate with OpenAI');
=======
    const body = asFields(await response.json().catch(() => null));
    if (asNonEmptyString(asFields(body?.error)?.type) !== 'rejected_by_access_enforcement') {
      return failure('Session expired — please re-authenticate with OpenAI');
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/codex.ts
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
