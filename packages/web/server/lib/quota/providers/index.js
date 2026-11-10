/**
 * Quota Providers Registry
 *
 * Implements quota fetching for various AI providers using a registry pattern.
 * @module quota/providers
 */

import { buildResult } from '../utils/index.js';
import {
  requireSelectedCredential,
  SELECTED_CREDENTIAL_UNAVAILABLE,
} from './selected-credential.js';

import * as claude from './claude/index.js';
import * as clinePass from './cline-pass.js';
import * as codex from './codex.js';
import * as copilot from './copilot.js';
import * as cursor from './cursor.js';
import * as deepinfra from './deepinfra.js';
import * as deepseek from './deepseek.js';
import * as exeDev from './exe-dev.js';
import * as antigravity from './antigravity/index.js';
import * as google from './google/index.js';
import * as hyper from './hyper.js';
import * as kimi from './kimi.js';
import * as nanogpt from './nanogpt.js';
import * as openai from './openai.js';
import * as openrouter from './openrouter.js';
import * as zai from './zai.js';
import * as zhipuaiCodingPlan from './zhipuai-coding-plan.js';
import * as minimaxCodingPlan from './minimax-coding-plan.js';
import * as minimaxCnCodingPlan from './minimax-cn-coding-plan.js';
import * as neuralwatt from './neuralwatt.js';
import * as kilo from './kilo.js';
import * as zenmux from './zenmux.js';
import * as ollamaCloud from './ollama-cloud.js';
import * as wafer from './wafer.js';
import * as opencodeGo from './opencode-go.js';
import * as opencode from './opencode.js';
import * as xai from './xai.js';

const registry = {
  claude: {
    providerId: claude.providerId,
    providerName: claude.providerName,
    isConfigured: claude.isConfigured,
    fetchQuota: claude.fetchQuota
  },
  'cline-pass': {
    providerId: clinePass.providerId,
    providerName: clinePass.providerName,
    isConfigured: clinePass.isConfigured,
    fetchQuota: clinePass.fetchQuota
  },
  codex: {
    providerId: codex.providerId,
    providerName: codex.providerName,
    isConfigured: codex.isConfigured,
    fetchQuota: codex.fetchQuota
  },
  cursor: {
    providerId: cursor.providerId,
    providerName: cursor.providerName,
    isConfigured: cursor.isConfigured,
    fetchQuota: cursor.fetchQuota
  },
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
  antigravity: {
    providerId: antigravity.providerId,
    providerName: antigravity.providerName,
    isConfigured: antigravity.isConfigured,
    fetchQuota: antigravity.fetchQuota
  },
  hyper: {
    providerId: hyper.providerId,
    providerName: hyper.providerName,
    isConfigured: hyper.isConfigured,
    fetchQuota: hyper.fetchQuota
  },
  'zai-coding-plan': {
    providerId: zai.providerId,
    providerName: zai.providerName,
    isConfigured: zai.isConfigured,
    fetchQuota: zai.fetchQuota
  },
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
  'github-copilot': {
    providerId: copilot.providerId,
    providerName: copilot.providerName,
    isConfigured: copilot.isConfigured,
    fetchQuota: copilot.fetchQuota
  },
  'github-copilot-addon': {
    providerId: copilot.providerIdAddon,
    providerName: copilot.providerNameAddon,
    isConfigured: copilot.isConfigured,
    fetchQuota: copilot.fetchQuotaAddon
  },
  'minimax-coding-plan': {
    providerId: minimaxCodingPlan.providerId,
    providerName: minimaxCodingPlan.providerName,
    isConfigured: minimaxCodingPlan.isConfigured,
    fetchQuota: minimaxCodingPlan.fetchQuota
  },
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
  'opencode-go': {
    providerId: opencodeGo.providerId,
    providerName: opencodeGo.providerName,
    isConfigured: opencodeGo.isConfigured,
    fetchQuota: opencodeGo.fetchQuota
  },
  opencode: {
    providerId: opencode.providerId,
    providerName: opencode.providerName,
    isConfigured: opencode.isConfigured,
    fetchQuota: opencode.fetchQuota
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
  xai: {
    providerId: xai.providerId,
    providerName: xai.providerName,
    isConfigured: xai.isConfigured,
    fetchQuota: xai.fetchQuota
  }
};

const pendingFetches = new Map();


/**
 * Provider selections are supplied by the Host's selected workspace catalog.
 * This registry never enumerates or reads a credential store itself.
 */
export const listConfiguredQuotaProviders = async ({ selections = [] } = {}) => {
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

export const fetchClaudeQuota = claude.fetchQuota;
export const fetchOpenaiQuota = openai.fetchQuota;
export const fetchGoogleQuota = google.fetchGoogleQuota;
export const fetchCodexQuota = codex.fetchQuota;
export const fetchCursorQuota = cursor.fetchQuota;
export const fetchDeepinfraQuota = deepinfra.fetchQuota;
export const fetchDeepseekQuota = deepseek.fetchQuota;
export const fetchHyperQuota = hyper.fetchQuota;
export const fetchCopilotQuota = copilot.fetchQuota;
export const fetchCopilotAddonQuota = copilot.fetchQuotaAddon;
export const fetchKimiQuota = kimi.fetchQuota;
export const fetchOpenRouterQuota = openrouter.fetchQuota;
export const fetchZaiQuota = zai.fetchQuota;
export const fetchNanoGptQuota = nanogpt.fetchQuota;
export const fetchMinimaxCodingPlanQuota = minimaxCodingPlan.fetchQuota;
export const fetchMinimaxCnCodingPlanQuota = minimaxCnCodingPlan.fetchQuota;
export const fetchOllamaCloudQuota = ollamaCloud.fetchQuota;
export const fetchWaferQuota = wafer.fetchQuota;
export const fetchZhipuaiQuota = zhipuaiCodingPlan.fetchQuota;
export const fetchAntigravityQuota = antigravity.fetchQuota;
