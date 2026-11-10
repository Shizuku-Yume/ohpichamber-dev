<<<<<<< HEAD
import { credentialAccessToken } from './selected-credential.js';
import { buildResult } from '../utils/index.js';
import { fetchOpenCodeZenUsage } from './opencode-zen.js';

// OpenCode Zen is a native provider (`opencode-zen`) in the Host catalog, so its
// usage is read with the credential the Host selected for that provider. The
// console API takes a bearer token and needs the console organization id for
// organization-scoped usage; a console OAuth selection supplies `orgId`.
export const providerId = 'opencode';
export const providerName = 'OpenCode Zen';

const consoleOrganizationPattern = /^(?:org|wrk)_[A-Za-z0-9]+$/;
const asText = (value) => typeof value === 'string' && value.trim() ? value : null;

const consoleCredential = (credential) => {
  const access = credentialAccessToken(credential);
  if (!access) return null;
  if (credential.type !== 'oauth') return { apiKey: access };
  const orgID = asText(credential.orgId);
  // Without a console organization id the usage endpoints cannot scope the
  // request, so the selection stays configured but unreadable.
  return orgID && consoleOrganizationPattern.test(orgID) ? { accessToken: access, orgID } : null;
};

export const isConfigured = (credential) => credentialAccessToken(credential) != null;

export const fetchQuota = async ({ credential, fetchImpl = fetch } = {}) => {
  try {
    if (!isConfigured(credential)) return buildResult({ providerId, providerName, ok: false, configured: false, error: 'Not configured' });
    const selected = consoleCredential(credential);
    if (!selected) return buildResult({ providerId, providerName, ok: false, configured: true, error: 'OpenCode console organization id is unavailable' });
    const usage = await fetchOpenCodeZenUsage(selected, fetchImpl);
    return buildResult({ providerId, providerName, ok: true, configured: true, usage });
  } catch {
    return buildResult({ providerId, providerName, ok: false, configured: true, error: 'Request failed' });
=======
import { readOpenCodeCredentials } from '../../opencode/auth.js';
import {
  asNonEmptyString,
  buildResult,
  getAuthEntry,
  normalizeAuthEntry,
} from '../utils/index.js';
import { fetchOpenCodeZenUsage } from './opencode-zen.js';
export { parseConsoleSummary, parseConsoleBudget, parseConsoleModelUsage } from './opencode-zen.js';

export const providerId = 'opencode';
export const providerName = 'OpenCode Zen';

const CONSOLE_SERVER = 'https://opencode.ai/console';
const CONSOLE_INTEGRATION_ID = 'opencode';
const ORGANIZATION_ID_PATTERN = /^(?:org|wrk)_[A-Za-z0-9]+$/;

const readKey = (entry) => asNonEmptyString(entry?.key) ?? asNonEmptyString(entry?.token);

const getApiKey = (auth) => {
  const entry = normalizeAuthEntry(getAuthEntry(auth, [CONSOLE_INTEGRATION_ID]));
  if (!entry || entry.type === 'oauth') return null;
  const key = readKey(entry);
  return key ? { apiKey: key } : null;
};

const getConsoleCredential = (auth) => {
  const entry = normalizeAuthEntry(getAuthEntry(auth, [CONSOLE_INTEGRATION_ID]));
  if (!entry || entry.type !== 'oauth') return null;
  const access = asNonEmptyString(entry.access);
  const orgID = asNonEmptyString(entry.orgID);
  if (!access || entry.server !== CONSOLE_SERVER || !orgID || !ORGANIZATION_ID_PATTERN.test(orgID)) return null;
  return { accessToken: access, orgID };
};

export const isConfigured = (auth) => Boolean(getConsoleCredential(auth) || getApiKey(auth));

export const fetchQuota = async ({ readAuth = readOpenCodeCredentials, fetchImpl = fetch } = {}) => {
  try {
    const auth = await readAuth();
    const credential = getConsoleCredential(auth) ?? getApiKey(auth);
    if (!credential) {
      return buildResult({ providerId, providerName, ok: false, configured: false, error: 'Not configured' });
    }

    const { windows, models } = await fetchOpenCodeZenUsage(credential, fetchImpl);

    return buildResult({
      providerId,
      providerName,
      ok: true,
      configured: true,
      usage: { windows, models: Object.keys(models).length ? models : undefined },
    });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed',
    });
>>>>>>> bc50ba56a
  }
};
