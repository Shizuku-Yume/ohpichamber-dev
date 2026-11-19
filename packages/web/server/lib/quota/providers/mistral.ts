import { credentialAccessToken } from './selected-credential.js';
import { buildResult } from '../utils/index.js';
import { fetchMistralUsage } from './mistral-billing.js';

export const providerId = 'mistral';
export const providerName = 'Mistral';
export const isConfigured = (credential) => Boolean(credentialAccessToken(credential));

export const fetchQuota = async ({ credential } = {}) => {
  const apiKey = credentialAccessToken(credential);
  if (!apiKey) {
    return buildResult({ providerId, providerName, ok: false, configured: false, error: 'Not configured' });
  }

  try {
    const { windows, planLabel } = await fetchMistralUsage(`${apiKey}`);
    return buildResult({ providerId, providerName, ok: true, configured: true, usage: { windows }, planLabel });
  } catch (error) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed'
    });
  }
};
