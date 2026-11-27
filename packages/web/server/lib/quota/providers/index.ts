import { z } from 'zod';
import { buildResult } from '../utils/index.js';
import {
  requireSelectedCredential,
  SELECTED_CREDENTIAL_UNAVAILABLE,
} from './selected-credential.js';
import {
  createNativeQuotaProvider,
  NATIVE_QUOTA_PROVIDERS,
  type NativeQuotaProviderId,
  type NativeResolvedCredential,
} from '../native.js';
import { attachZaiGiftResets, listZaiGiftResets } from './zai-gift-reset.js';
import type { CredentialJson } from '../credentials/contracts.js';
import type { ProviderUsage, QuotaResult } from '../utils/contracts.js';
import type { ReadNativeReports } from '../native.js';

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

export interface QuotaProviderFetchOptions {
  workspaceId?: string | undefined;
  agentDirectoryId?: string | undefined;
  providerId?: string | undefined;
  credentialRef?: string | undefined;
  resolveCredential?: ((input: {
    workspaceId: string;
    agentDirectoryId: string;
    providerId: string;
    credentialRef: string;
    purpose: string;
  }) => Promise<NativeResolvedCredential>) | undefined;
  readNativeReports?: ReadNativeReports | undefined;
  credential?: CredentialJson;
  readAuth?: (() => CredentialJson | Promise<CredentialJson>) | undefined;
  fetchImpl?: typeof fetch | undefined;
}

interface QuotaProviderEntry {
  providerId: string;
  providerName: string;
  nativeProviders?: readonly string[];
  isConfigured: (credential?: CredentialJson) => boolean;
  fetchQuota: (options?: QuotaProviderFetchOptions) => Promise<QuotaResult<string, string, ProviderUsage>>;
}
const nonEmptyString = z.string().min(1);
const unavailableErrorSchema = z.object({ code: z.literal(SELECTED_CREDENTIAL_UNAVAILABLE) });

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
} satisfies Record<NativeQuotaProviderId, string>;

const enrichZaiGiftResets = async (result: QuotaResult<string, string, ProviderUsage>, options: QuotaProviderFetchOptions): Promise<void> => {
  const { resolveCredential, workspaceId, agentDirectoryId, providerId, credentialRef } = options;
  if (!resolveCredential || !z.function().safeParse(resolveCredential).success || !result.usage) return;
  const resolve = resolveCredential;
  const parsedWorkspace = nonEmptyString.safeParse(workspaceId);
  const parsedAgentDir = nonEmptyString.safeParse(agentDirectoryId);
  const parsedProvider = nonEmptyString.safeParse(providerId);
  const parsedCredRef = nonEmptyString.safeParse(credentialRef);
  if (!parsedWorkspace.success || !parsedAgentDir.success || !parsedProvider.success || !parsedCredRef.success) {
    return;
  }
  const credential = await resolve({
    workspaceId: parsedWorkspace.data,
    agentDirectoryId: parsedAgentDir.data,
    providerId: parsedProvider.data,
    credentialRef: parsedCredRef.data,
    purpose: 'quota',
  });
  const list = await listZaiGiftResets({ credential });
  if (list === null) return;
  attachZaiGiftResets(result.usage.windows, list);
};

const nativeQuotaProvider = (logicalId: NativeQuotaProviderId): QuotaProviderEntry => {
  const spec = NATIVE_QUOTA_PROVIDERS[logicalId];
  const providerConfig: Parameters<typeof createNativeQuotaProvider>[0] = {
    providerId: logicalId,
    providerName: NATIVE_PROVIDER_NAMES[logicalId],
    nativeProviders: spec.providers,
  };
  if (logicalId === 'zai-coding-plan') {
    providerConfig.enrich = enrichZaiGiftResets;
  }
  const provider = createNativeQuotaProvider(providerConfig);
  return {
    providerId: provider.providerId,
    providerName: provider.providerName,
    nativeProviders: provider.nativeProviders,
    isConfigured: provider.isConfigured,
    fetchQuota: (options: QuotaProviderFetchOptions = {}) => {
      const nativeOptions: Parameters<typeof provider.fetchQuota>[0] = {};
      if (options.readNativeReports !== undefined) nativeOptions.readNativeReports = options.readNativeReports;
      if (options.workspaceId !== undefined) nativeOptions.workspaceId = options.workspaceId;
      if (options.providerId !== undefined) nativeOptions.providerId = options.providerId;
      if (options.agentDirectoryId !== undefined) nativeOptions.agentDirectoryId = options.agentDirectoryId;
      if (options.credentialRef !== undefined) nativeOptions.credentialRef = options.credentialRef;
      if (options.resolveCredential !== undefined) nativeOptions.resolveCredential = options.resolveCredential;
      return provider.fetchQuota(nativeOptions);
    },
  };
};

const copilotAddon = nativeQuotaProvider('github-copilot-addon');

const registry = {
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
} satisfies Record<string, QuotaProviderEntry>;

const pendingFetches = new Map<string, Promise<QuotaResult<string, string, ProviderUsage>>>();

const lookupProvider = (providerId: string): QuotaProviderEntry | null =>
  Object.entries(registry).find(([id]) => id === providerId)?.[1] ?? null;
export const listUsagePageProviders = (): Array<{ providerId: string; providerName: string }> => Object.entries(registry)
  .filter(([id]) => id !== 'github-copilot-addon')
  .map(([providerId, provider]) => ({ providerId, providerName: provider.providerName }));

export const listConfiguredQuotaProviders = async ({ selections = [] }: {
  selections?: Array<{ quotaProviderId?: string | undefined; providerId?: string | undefined }>;
} = {}): Promise<string[]> => {
  const providerIds = new Set<string>();
  for (const selection of selections) {
    const providerId = selection?.quotaProviderId ?? selection?.providerId;
    if (providerId && Object.hasOwn(registry, providerId)) providerIds.add(providerId);
  }
  return [...providerIds];
};

export const buildUnconfiguredQuotaResult = (providerId: string): QuotaResult<string, string, ProviderUsage> | null => {
  const provider = lookupProvider(providerId);
  if (!provider) return null;
  return buildResult({
    providerId: provider.providerId,
    providerName: provider.providerName,
    ok: false,
    configured: false,
  });
};

const fetchQuotaForProviderUncoalesced = async (
  providerId: string,
  options: QuotaProviderFetchOptions = {},
): Promise<QuotaResult<string, string, ProviderUsage>> => {
  const provider = lookupProvider(providerId);
  if (!provider) return buildResult({ providerId, providerName: providerId, ok: false, configured: false, error: 'Unsupported provider' });
  if (Array.isArray(provider.nativeProviders)) {
    try {
      return await provider.fetchQuota(options);
    } catch {
      return buildResult({ providerId: provider.providerId, providerName: provider.providerName, ok: false, configured: true, error: 'Request failed' });
    }
  }
  let credential: CredentialJson;
  try {
    credential = await requireSelectedCredential({
      workspaceId: options.workspaceId,
      agentDirectoryId: options.agentDirectoryId,
      providerId: options.providerId,
      credentialRef: options.credentialRef,
      resolveCredential: options.resolveCredential,
      purpose: 'quota',
    });
  } catch (error) {
    if (unavailableErrorSchema.safeParse(error).success) {
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

export const fetchQuotaForProvider = (
  providerId: string,
  options: QuotaProviderFetchOptions = {},
): Promise<QuotaResult<string, string, ProviderUsage>> => {
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
