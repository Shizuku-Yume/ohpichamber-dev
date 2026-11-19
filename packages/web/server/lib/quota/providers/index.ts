
import { buildResult } from '../utils/index.js';
<<<<<<< HEAD:packages/web/server/lib/quota/providers/index.js
import {
  requireSelectedCredential,
  SELECTED_CREDENTIAL_UNAVAILABLE,
} from './selected-credential.js';
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/index.js
=======
import type { LegacyAuthFile } from '../../opencode/auth.js';
import type { QuotaResult } from '../utils/contracts.js';

interface QuotaProvider {
  readonly providerId: string | null;
  readonly providerName: string;
  readonly isConfigured: (auth: LegacyAuthFile) => boolean;
  readonly fetchQuota: () => Promise<QuotaResult<string | null>>;
}

interface QuotaProviderRegistry {
  [providerId: string]: QuotaProvider;
}
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/index.ts

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
import * as mistral from './mistral.js';
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

const registry: QuotaProviderRegistry = {
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
<<<<<<< HEAD:packages/web/server/lib/quota/providers/index.js
    isConfigured: zenmux.isConfigured,
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/index.js
    // ZenMux reads its own managed credential; the list's OpenCode auth is not for it.
    isConfigured: () => zenmux.isConfigured(),
=======
    isConfigured: () => zenmux.isConfigured(),
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/index.ts
    fetchQuota: zenmux.fetchQuota
  },
  xai: {
    providerId: xai.providerId,
    providerName: xai.providerName,
    isConfigured: xai.isConfigured,
    fetchQuota: xai.fetchQuota
  },
  mistral: {
    providerId: mistral.providerId,
    providerName: mistral.providerName,
    isConfigured: mistral.isConfigured,
    fetchQuota: mistral.fetchQuota
  }
};

<<<<<<< HEAD:packages/web/server/lib/quota/providers/index.js
const pendingFetches = new Map();
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/index.js
export { attachExtensionQuotaProvider, detachExtensionQuotaProvider } from '../extension-registry.js';

// `hasOwn`, so an id such as `constructor` never resolves to the object's own prototype members.
const providerOf = (providerId) => (Object.hasOwn(registry, providerId) ? registry[providerId] : extensionQuotaProvider(providerId));
const providerEntries = () => [...Object.entries(registry), ...extensionQuotaProviderEntries()];

const pendingFetches = new Map();
=======
export { attachExtensionQuotaProvider, detachExtensionQuotaProvider } from '../extension-registry.js';

const providerOf = (providerId: string | null) => (Object.hasOwn(registry, String(providerId)) ? registry[String(providerId)] : extensionQuotaProvider(providerId));
const providerEntries = (): [string | null, QuotaProvider][] => [...Object.entries(registry), ...extensionQuotaProviderEntries()];

const pendingFetches = new Map<string | null, Promise<QuotaResult<string | null, string | null>>>();
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/index.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/index.js
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/index.js
// The registry entries Settings > Usage never reads. Its built-in list
// (`QUOTA_PROVIDERS` in packages/ui/src/lib/quota/providers/index.ts) shows
// GitHub Copilot once; the add-on entry asks GitHub a second time.
const NOT_ON_USAGE_PAGE = new Set([copilot.providerIdAddon]);
=======
const NOT_ON_USAGE_PAGE = new Set<string | null>([copilot.providerIdAddon]);
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/index.ts

<<<<<<< HEAD:packages/web/server/lib/quota/providers/index.js
/**
 * Provider selections are supplied by the Host's selected workspace catalog.
 * This registry never enumerates or reads a credential store itself.
 */
export const listConfiguredQuotaProviders = async ({ selections = [] } = {}) => {
  const providerIds = new Set();
  for (const selection of selections) {
    const providerId = selection?.quotaProviderId ?? selection?.providerId;
    if (Object.hasOwn(registry, providerId)) providerIds.add(providerId);
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/index.js
/**
 * The providers Settings > Usage reads, built-ins first, then the attached
 * extensions: what an agent reading usage may ask, so it never makes a
 * request the page does not make.
 */
export const listUsagePageProviders = () => providerEntries()
  .filter(([id]) => !NOT_ON_USAGE_PAGE.has(id))
  .map(([providerId, provider]) => ({ providerId, providerName: provider.providerName }));


/**
 * Providers with a usable credential. OpenCode's stored credentials are read
 * once and handed to every provider; when OpenCode cannot be asked this
 * throws, so a transient failure does not look like "nothing configured".
 */
export const listConfiguredQuotaProviders = async () => {
  const auth = await readOpenCodeCredentials();
  const configured = [];

  for (const [id, provider] of providerEntries()) {
    try {
      if (provider.isConfigured(auth)) {
        configured.push(id);
      }
    } catch {
      // Ignore provider-specific config errors in list API.
    }
=======
export const listUsagePageProviders = () => providerEntries()
  .filter(([id]) => !NOT_ON_USAGE_PAGE.has(id))
  .map(([providerId, provider]) => ({ providerId, providerName: provider.providerName }));


export const listConfiguredQuotaProviders = async () => {
  const auth = await readOpenCodeCredentials();
  const configured = [];

  for (const [id, provider] of providerEntries()) {
    try {
      if (provider.isConfigured(auth)) {
        configured.push(id);
      }
    } catch {
      continue;
    }
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/index.ts
  }
  return [...providerIds];
};

<<<<<<< HEAD:packages/web/server/lib/quota/providers/index.js
/** A provider outside the registry is unsupported, not unconfigured. */
export const buildUnconfiguredQuotaResult = (providerId) => {
  const provider = registry[providerId];
  if (!provider) return null;
  return buildResult({
    providerId: provider.providerId,
    providerName: provider.providerName,
    ok: false,
    configured: false,
||||||| bc50ba56aa:packages/web/server/lib/quota/providers/index.js
const fetchQuotaForProviderUncoalesced = async (providerId) => {
  const provider = providerOf(providerId);

  if (!provider) {
    return buildResult({
      providerId,
      providerName: providerId,
      ok: false,
      configured: false,
      error: 'Unsupported provider'
    });
  }

  try {
    return await provider.fetchQuota();
  } catch (error) {
    // The extension layer's own answer for a service reply OpenChamber cannot use: the route answers its status and code.
    if (error instanceof QuotaRouteError) throw error;
    return buildResult({
      providerId: provider.providerId,
      providerName: provider.providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed'
    });
  }
};

export const fetchQuotaForProvider = (providerId) => {
  const existing = pendingFetches.get(providerId);
  if (existing) return existing;

  const pending = fetchQuotaForProviderUncoalesced(providerId).finally(() => {
    if (pendingFetches.get(providerId) === pending) pendingFetches.delete(providerId);
=======
const fetchQuotaForProviderUncoalesced = async (providerId: string | null) => {
  const provider = providerOf(providerId);

  if (!provider) {
    return buildResult({
      providerId,
      providerName: providerId,
      ok: false,
      configured: false,
      error: 'Unsupported provider'
    });
  }

  try {
    return await provider.fetchQuota();
  } catch (error) {
    if (error instanceof QuotaRouteError) throw error;
    return buildResult({
      providerId: provider.providerId,
      providerName: provider.providerName,
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed'
    });
  }
};

export const fetchQuotaForProvider = (providerId: string | null) => {
  const existing = pendingFetches.get(providerId);
  if (existing) return existing;

  const pending = fetchQuotaForProviderUncoalesced(providerId).finally(() => {
    if (pendingFetches.get(providerId) === pending) pendingFetches.delete(providerId);
>>>>>>> upstream/main:packages/web/server/lib/quota/providers/index.ts
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
