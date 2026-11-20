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
  }
};
