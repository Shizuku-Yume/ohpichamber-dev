
import { buildResult } from '../utils/index.js';
import {
  requireSelectedCredential,
  SELECTED_CREDENTIAL_UNAVAILABLE,
} from './selected-credential.js';
import { createNativeQuotaProvider, NATIVE_QUOTA_PROVIDERS } from '../native.js';
import { attachZaiGiftResets, listZaiGiftResets } from './zai-gift-reset.js';

import * as deepinfra from './deepinfra.js';
import * as deepseek from './deepseek.js';
import * as exeDev from './exe-dev.js';
import * as google from './google/index.js';
import * as kimi from './kimi.js';
import * as mistral from './mistral.js';
import * as nanogpt from './nanogpt.js';
import * as openai from './openai.js';
import * as openrouter from './openrouter.js';
import * as zhipuaiCodingPlan from './zhipuai-coding-plan.js';
import * as minimaxCnCodingPlan from './minimax-cn-coding-plan.js';
import * as neuralwatt from './neuralwatt.js';
import * as kilo from './kilo.js';
import * as zenmux from './zenmux.js';
import * as ollamaCloud from './ollama-cloud.js';
import * as wafer from './wafer.js';

const enrichZaiGiftResets = async (result, options) => {
  const { resolveCredential, workspaceId, agentDirectoryId, providerId, credentialRef } = options;
  if (typeof resolveCredential !== 'function') return;
  if (![workspaceId, agentDirectoryId, providerId, credentialRef].every((value) => typeof value === 'string' && value)) return;
  const credential = await resolveCredential({ workspaceId, agentDirectoryId, providerId, credentialRef, purpose: 'quota' });
  const list = await listZaiGiftResets({ credential });
  if (list === null) return;
  attachZaiGiftResets(result.usage.windows, list);
};

const nativeQuotaProvider = (logicalId) => {
  const spec = NATIVE_QUOTA_PROVIDERS[logicalId];
  return createNativeQuotaProvider({
    providerId: logicalId,
    providerName: NATIVE_PROVIDER_NAMES[logicalId],
    nativeProviders: spec.providers,
    enrich: logicalId === 'zai-coding-plan' ? enrichZaiGiftResets : undefined,
  });
};

const NATIVE_PROVIDER_NAMES = {
  claude: 'Claude',
  codex: 'Codex',
  'github-copilot': 'GitHub Copilot',
  'github-copilot-addon': 'GitHub Copilot Add-on',
  cursor: 'Cursor',
  xai: 'xAI',
  'cline-pass': 'ClinePass',
  hyper: 'Charm Hyper',
  'zai-coding-plan': 'z.ai',
  'minimax-coding-plan': 'MiniMax Coding Plan (minimax.io)',
};

const copilotAddon = nativeQuotaProvider('github-copilot-addon');

const registry: QuotaProviderRegistry = {
  claude: nativeQuotaProvider('claude'),
  'cline-pass': nativeQuotaProvider('cline-pass'),
  codex: nativeQuotaProvider('codex'),
  cursor: nativeQuotaProvider('cursor'),
  deepinfra: {
    providerId: deepinfra.providerId,
    providerName: deepinfra.providerName,
    isConfigured: deepinfra.isConfigured,
    fetchQuota: deepinfra.fetchQuota
  },
  deepseek: {
    providerId: deepseek.providerId,
    providerName: deepseek.providerName,
    isConfigured: deepseek.isConfigured,
    fetchQuota: deepseek.fetchQuota
  },
  'exe-dev': {
    providerId: exeDev.providerId,
    providerName: exeDev.providerName,
    isConfigured: exeDev.isConfigured,
    fetchQuota: exeDev.fetchQuota
  },
  google: {
    providerId: google.providerId,
    providerName: google.providerName,
    isConfigured: google.isConfigured,
    fetchQuota: google.fetchGoogleQuota
  },
  hyper: nativeQuotaProvider('hyper'),
  'zai-coding-plan': nativeQuotaProvider('zai-coding-plan'),
  'zhipuai-coding-plan': {
    providerId: zhipuaiCodingPlan.providerId,
    providerName: zhipuaiCodingPlan.providerName,
    isConfigured: zhipuaiCodingPlan.isConfigured,
    fetchQuota: zhipuaiCodingPlan.fetchQuota
  },
  'kimi-for-coding': {
    providerId: kimi.providerId,
    providerName: kimi.providerName,
    isConfigured: kimi.isConfigured,
    fetchQuota: kimi.fetchQuota
  },
  openrouter: {
    providerId: openrouter.providerId,
    providerName: openrouter.providerName,
    isConfigured: openrouter.isConfigured,
    fetchQuota: openrouter.fetchQuota
  },
  'nano-gpt': {
    providerId: nanogpt.providerId,
    providerName: nanogpt.providerName,
    isConfigured: nanogpt.isConfigured,
    fetchQuota: nanogpt.fetchQuota
  },
  'github-copilot': nativeQuotaProvider('github-copilot'),
  'github-copilot-addon': copilotAddon,
  'minimax-coding-plan': nativeQuotaProvider('minimax-coding-plan'),
  'minimax-cn-coding-plan': {
    providerId: minimaxCnCodingPlan.providerId,
    providerName: minimaxCnCodingPlan.providerName,
    isConfigured: minimaxCnCodingPlan.isConfigured,
    fetchQuota: minimaxCnCodingPlan.fetchQuota
  },
  'ollama-cloud': {
    providerId: ollamaCloud.providerId,
    providerName: ollamaCloud.providerName,
    isConfigured: ollamaCloud.isConfigured,
    fetchQuota: ollamaCloud.fetchQuota
  },
  wafer: {
    providerId: wafer.providerId,
    providerName: wafer.providerName,
    isConfigured: wafer.isConfigured,
    fetchQuota: wafer.fetchQuota
  },
  neuralwatt: {
    providerId: neuralwatt.providerId,
    providerName: neuralwatt.providerName,
    isConfigured: neuralwatt.isConfigured,
    fetchQuota: neuralwatt.fetchQuota
  },
  kilo: {
    providerId: kilo.providerId,
    providerName: kilo.providerName,
    isConfigured: kilo.isConfigured,
    fetchQuota: kilo.fetchQuota
  },
  zenmux: {
    providerId: zenmux.providerId,
    providerName: zenmux.providerName,
    isConfigured: zenmux.isConfigured,
    fetchQuota: zenmux.fetchQuota
  },
  xai: nativeQuotaProvider('xai'),
  mistral: {
    providerId: mistral.providerId,
    providerName: mistral.providerName,
    isConfigured: mistral.isConfigured,
    fetchQuota: mistral.fetchQuota
  }
};

const pendingFetches = new Map();

export const listUsagePageProviders = () => Object.entries(registry)
  .filter(([id]) => id !== 'github-copilot-addon')
  .map(([providerId, provider]) => ({ providerId, providerName: provider.providerName }));


/**
 * Provider selections are supplied by the Host's selected workspace catalog.
 * This registry never enumerates or reads a credential store itself.
 */
export const listConfiguredQuotaProviders = async ({ selections = [] }: {
  selections?: { quotaProviderId?: string; providerId?: string }[];
} = {}) => {
  const providerIds = new Set();
  for (const selection of selections) {
    const providerId = selection?.quotaProviderId ?? selection?.providerId;
    if (Object.hasOwn(registry, providerId)) providerIds.add(providerId);
  }
  return [...providerIds];
};

/** A provider outside the registry is unsupported, not unconfigured. */
export const buildUnconfiguredQuotaResult = (providerId) => {
  const provider = registry[providerId];
  if (!provider) return null;
  return buildResult({
    providerId: provider.providerId,
    providerName: provider.providerName,
    ok: false,
    configured: false,
  });
};

const fetchQuotaForProviderUncoalesced = async (providerId, options = {}) => {
  const provider = registry[providerId];
  if (!provider) return buildResult({ providerId, providerName: providerId, ok: false, configured: false, error: 'Unsupported provider' });
  if (Array.isArray(provider.nativeProviders)) {
    try {
      return await provider.fetchQuota(options);
    } catch {
      return buildResult({ providerId: provider.providerId, providerName: provider.providerName, ok: false, configured: true, error: 'Request failed' });
    }
  }
  let credential;
  try {
    credential = await requireSelectedCredential({ ...options, purpose: 'quota' });
  } catch (error) {
    // No stored credential is an ordinary configuration state. Any other
    // resolution failure belongs to a provider the catalog already reported
    // as connected, so it must stay visible instead of looking unconfigured.
    if (error?.code === SELECTED_CREDENTIAL_UNAVAILABLE) {
      return buildResult({ providerId: provider.providerId, providerName: provider.providerName, ok: false, configured: false });
    }
    return buildResult({ providerId: provider.providerId, providerName: provider.providerName, ok: false, configured: true, error: 'Selected credential unavailable' });
  }
  try {
    return await provider.fetchQuota({ ...options, credential });
  } catch {
    return buildResult({ providerId: provider.providerId, providerName: provider.providerName, ok: false, configured: true, error: 'Request failed' });
  }
};

export const fetchQuotaForProvider = (providerId, options = {}) => {
  const requestKey = JSON.stringify([providerId, options.providerId, options.workspaceId, options.agentDirectoryId, options.credentialRef]);
  const existing = pendingFetches.get(requestKey);
  if (existing) return existing;
  const pending = fetchQuotaForProviderUncoalesced(providerId, options).finally(() => {
    if (pendingFetches.get(requestKey) === pending) pendingFetches.delete(requestKey);
  });
  pendingFetches.set(requestKey, pending);
  return pending;
};

export const fetchOpenaiQuota = openai.fetchQuota;
export const fetchGoogleQuota = google.fetchGoogleQuota;
export const fetchDeepinfraQuota = deepinfra.fetchQuota;
export const fetchDeepseekQuota = deepseek.fetchQuota;
export const fetchKimiQuota = kimi.fetchQuota;
export const fetchOpenRouterQuota = openrouter.fetchQuota;
export const fetchNanoGptQuota = nanogpt.fetchQuota;
export const fetchMinimaxCnCodingPlanQuota = minimaxCnCodingPlan.fetchQuota;
export const fetchOllamaCloudQuota = ollamaCloud.fetchQuota;
export const fetchWaferQuota = wafer.fetchQuota;
export const fetchZhipuaiQuota = zhipuaiCodingPlan.fetchQuota;
