import { buildResult } from '../../utils/index.js';
import { credentialAccessToken } from '../selected-credential.js';
import {
  resolveGoogleAuthSources,
  DEFAULT_PROJECT_ID
} from './auth.js';
import { transformQuotaBucket, transformModelData } from './transforms.js';
import {
  fetchGoogleQuotaBuckets,
  fetchGoogleModels
} from './api.js';
import { refreshGoogleAccessToken } from './oauth.js';
import type { JsonObject, JsonValue, ProviderUsage } from '../../utils/contracts.js';

export const providerId = 'google';
export const providerName = 'Google';

export const isConfigured = (credential) => credential?.type === 'oauth' && Boolean(credentialAccessToken(credential));

export const fetchGoogleQuota = async ({ credential } = {}) => {
  const authSources = resolveGoogleAuthSources(credential);
  if (!authSources.length) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: isConfigured(credential),
      error: isConfigured(credential) ? 'Selected native Google OAuth credential lacks supported quota project metadata' : 'Not configured'
    });
  }

  const models: Record<string, ProviderUsage> = {};
  const sourceErrors: string[] = [];

  for (const source of authSources) {
    let accessToken = source.accessToken;
    if (!accessToken || (typeof source.expires === 'number' && source.expires <= Date.now())) {
      if (!source.refreshToken) {
        sourceErrors.push(`${source.sourceLabel}: Missing refresh token`);
        continue;
      }
      const refreshed = await refreshGoogleAccessToken(source.refreshToken, 'gemini', { fallbackToAntigravity: true });
      if (!refreshed.ok) {
        sourceErrors.push(`${source.sourceLabel}: Failed to refresh OAuth token`);
        continue;
      }
      accessToken = refreshed.accessToken;
    }

    const projectId = source.projectId ?? DEFAULT_PROJECT_ID;
    let mergedAnyModel = false;

    const quotaPayload = await fetchGoogleQuotaBuckets(accessToken, projectId);
    const buckets = isJsonContainer(quotaPayload) && 'buckets' in quotaPayload
      && Array.isArray(quotaPayload.buckets) ? quotaPayload.buckets : [];

    for (const bucket of buckets) {
      const transformed = transformQuotaBucket(bucket, source.sourceId);
      if (transformed) {
        Object.assign(models, transformed);
        mergedAnyModel = true;
      }
    }

    const payload = await fetchGoogleModels(accessToken, projectId);
    if (payload) {
      const modelDataByName = isJsonContainer(payload) && 'models' in payload ? payload.models ?? {} : {};
      for (const [modelName, modelData] of Object.entries(modelDataByName)) {
        const transformed = transformModelData(modelName, modelData, source.sourceId);
        Object.assign(models, transformed);
        mergedAnyModel = true;
      }
    }

    if (!mergedAnyModel) {
      sourceErrors.push(`${source.sourceLabel}: Failed to fetch models`);
    }
  }

  if (!Object.keys(models).length) {
    return buildResult({
      providerId,
      providerName,
      ok: false,
      configured: true,
      error: sourceErrors[0] ?? 'Failed to fetch models'
    });
  }

  return buildResult({
    providerId,
    providerName,
    ok: true,
    configured: true,
    usage: {
      windows: {},
      models: Object.keys(models).length ? models : undefined
    }
  });
};
