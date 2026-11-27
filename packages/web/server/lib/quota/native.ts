import type { JsonValue } from '../shared/json-values.js';
import { z } from 'zod';
import { UsageStatsSchema, UsageQuerySchema } from '@openchamber/agent-contract';
import type { UsageAuthReport, UsageAuthLimit } from '@openchamber/agent-contract';
import { buildResult, toUsageWindow } from './utils/index.js';
import type { ProviderUsage, QuotaResult, UsageWindow, UsageWindowInput } from './utils/contracts.js';

export const NATIVE_QUOTA_PROVIDERS = {
  claude: { providers: ['anthropic'] },
  codex: { providers: ['openai-codex'] },
  'github-copilot': { providers: ['github-copilot'] },
  'github-copilot-addon': { providers: ['github-copilot'] },
  cursor: { providers: ['cursor'] },
  xai: { providers: ['xai-oauth'] },
  'cline-pass': { providers: ['cline-pass'] },
  hyper: { providers: ['charm-hyper'] },
  'zai-coding-plan': { providers: ['zai'] },
  'minimax-coding-plan': { providers: ['minimax-code'] },
} as const;

export type NativeQuotaProviderId = keyof typeof NATIVE_QUOTA_PROVIDERS;

export const NATIVE_QUOTA_PROVIDER_IDS: readonly string[] = Object.keys(NATIVE_QUOTA_PROVIDERS);

const resolveUsedPercent = (limit: UsageAuthLimit): number | null => {
  const { used, limit: total, usedFraction, remainingFraction, unit } = limit.amount;
  if (usedFraction !== undefined) return usedFraction * 100;
  if (used !== undefined && total !== undefined && total > 0) return (used / total) * 100;
  if (unit === 'percent' && used !== undefined) return used;
  if (remainingFraction !== undefined) return Math.max(0, 1 - remainingFraction) * 100;
  return null;
};

const formatAmount = (value: number): string => {
  if (!Number.isFinite(value)) return String(value);
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded)
    ? rounded.toLocaleString('en-US')
    : rounded.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
};

const windowLabelOf = (limit: UsageAuthLimit): string => {
  const window = limit.window;
  if (!window) return limit.label || 'limit';
  const durationMs = window.durationMs;
  if (durationMs === undefined) return window.label || limit.label || 'limit';
  const seconds = durationMs / 1000;
  if (seconds % 86400 === 0) {
    const days = seconds / 86400;
    return days === 7 ? 'weekly' : `${days}d`;
  }
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  return `${seconds}s`;
};

const windowKeyOf = (limit: UsageAuthLimit, bucket: Record<string, UsageWindow<number | null | undefined, number | null>>): string => {
  const label = windowLabelOf(limit);
  if (!(label in bucket)) return label;
  const unit = limit.amount.unit;
  const keyed = `${label}-${unit}`;
  if (!(keyed in bucket)) return keyed;
  return limit.id;
};

const toHostWindow = (limit: UsageAuthLimit): UsageWindow<number | null | undefined, number | null> => {
  const { used, limit: total, unit } = limit.amount;
  const usedPercent = resolveUsedPercent(limit);
  const input: UsageWindowInput<number | null, number | null> = {
    usedPercent,
    windowSeconds: limit.window?.durationMs === undefined ? null : limit.window.durationMs / 1000,
    resetAt: limit.window?.resetsAt ?? null,
  };
  if (unit === 'credits' && used !== undefined && total !== undefined) {
    input.valueLabel = `${formatAmount(used)} / ${formatAmount(total)} credits`;
  } else if (unit === 'tokens' && used !== undefined && total !== undefined) {
    input.valueLabel = `${formatAmount(used)} / ${formatAmount(total)} tokens`;
  }
  if (unit === 'usd') {
    input.value = { kind: 'spend', spent: used ?? null, limit: total ?? null };
  } else if (unit === 'requests' && used !== undefined) {
    input.value = { kind: 'requests', count: used };
  }
  return toUsageWindow(input);
};

interface NativeProviderSpec {
  providerId: string;
  providerName: string;
  nativeProviders: readonly string[];
  enrich?: (result: QuotaResult<string, string, ProviderUsage>, options: NativeQuotaProviderOptions) => Promise<void>;
}

export const nativeReportsToProviderResult = (
  reports: readonly UsageAuthReport[],
  { providerId, providerName, nativeProviders }: NativeProviderSpec,
  { selectedNativeProviderId, configured = true }: { selectedNativeProviderId?: string | null; configured?: boolean } = {},
): QuotaResult<string, string, ProviderUsage> => {
  const own = reports.filter((report) => nativeProviders.includes(report.provider));
  if (own.length === 0) {
    return buildResult<string, string, ProviderUsage>({ providerId, providerName, ok: false, configured, usage: null, error: configured ? 'No native usage report' : undefined });
  }
  const selected = selectedNativeProviderId !== undefined && selectedNativeProviderId !== null
    ? own.filter((report) => report.provider === selectedNativeProviderId)
    : [];
  const byFetchedDesc = (left: UsageAuthReport, right: UsageAuthReport) => right.fetchedAt - left.fetchedAt;
  const head = (selected.length > 0 ? selected : own).slice().sort(byFetchedDesc);
  const rest = own.filter((report) => !head.includes(report)).sort(byFetchedDesc);
  const ordered = [...head, ...rest];

  const windows: ProviderUsage['windows'] = {};
  const models: NonNullable<ProviderUsage['models']> = {};
  const seen = new Set<string>();
  let fetchedAt = 0;
  for (const report of ordered) {
    fetchedAt = Math.max(fetchedAt, report.fetchedAt);
    for (const limit of report.limits) {
      if (seen.has(limit.id)) continue;
      seen.add(limit.id);
      const window = toHostWindow(limit);
      const modelId = limit.scope.modelId;
      const tier = limit.scope.tier;
      const bucket = modelId || tier ? (models[modelId ?? tier ?? 'account'] ??= { windows: {} }).windows : windows;
      bucket[windowKeyOf(limit, bucket)] = window;
    }
  }

  const usage: ProviderUsage = { windows };
  if (Object.keys(models).length > 0) usage.models = models;

  const result = buildResult({ providerId, providerName, ok: true, configured: true, usage });
  result.fetchedAt = fetchedAt || result.fetchedAt;
  return result;
};

const NATIVE_USAGE_WINDOW_MS = 60_000;
const NATIVE_USAGE_TIMEOUT_MS = 30_000;

interface WorkspaceScopeReader {
  (workspaceId: string): Promise<{ workspaceId: string; projectId: string; agentDirectoryId?: string } | null>;
}

interface NativeUsageReaderDependencies {
  service: {
    getState: () => { phase: string };
    request: (path: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<JsonValue> }>;
  };
  resolveWorkspaceScope: WorkspaceScopeReader;
}

export interface NativeUsageReportRead {
  reports: UsageAuthReport[] | null;
  error: string | null;
}

export type ReadNativeReports = (input: { workspaceId: string; nativeProviders: readonly string[] }) => Promise<NativeUsageReportRead>;

const NativeServiceDependencySchema = z.object({
  getState: z.function(),
  request: z.function(),
});

export const createNativeUsageReader = ({ service, resolveWorkspaceScope }: NativeUsageReaderDependencies): ReadNativeReports => {
  if (!NativeServiceDependencySchema.safeParse(service).success) {
    throw new TypeError('Native usage reads require the real Agent Service');
  }
  if (!z.function().safeParse(resolveWorkspaceScope).success) {
    throw new TypeError('Native usage reads require the Host workspace scope resolver');
  }
  const pending = new Map<string, Promise<NativeUsageReportRead>>();

  const readUncoalesced = async (workspaceId: string, nativeProviders: readonly string[]): Promise<NativeUsageReportRead> => {
    if (service.getState().phase !== 'ready') return { reports: null, error: 'The Agent Service is not ready' };
    const scope = await resolveWorkspaceScope(workspaceId);
    if (!scope || scope.workspaceId !== workspaceId) return { reports: null, error: 'The selected workspace is not authorized' };
    const authorizedScopes = [{ workspaceId: scope.workspaceId, projectId: scope.projectId }];
    const reads = nativeProviders.length > 0 ? nativeProviders : [undefined];
    const collected: UsageAuthReport[] = [];
    let failure: string | null = null;
    for (const providerId of reads) {
      const queryInput: z.input<typeof UsageQuerySchema> = {
        from: Date.now() - NATIVE_USAGE_WINDOW_MS,
        to: Date.now(),
        timezone: 'UTC',
      };
      if (providerId !== undefined) queryInput.providerId = providerId;
      const query = UsageQuerySchema.parse(queryInput);
      try {
        const response = await service.request('/internal/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, authorizedScopes }),
          signal: AbortSignal.timeout(NATIVE_USAGE_TIMEOUT_MS),
        });
        if (!response.ok) {
          failure = `The Agent Service answered HTTP ${response.status}`;
          continue;
        }
        const parsed = UsageStatsSchema.safeParse(await response.json());
        if (!parsed.success) {
          failure = 'The native usage report is invalid';
          continue;
        }
        const reports = parsed.data.accounts?.reports;
        if (reports === null || reports === undefined) {
          failure = 'Native usage reports are unavailable';
          continue;
        }
        collected.push(...reports);
      } catch {
        failure = 'The native usage report could not be read';
      }
    }
    if (failure !== null) return { reports: null, error: failure };
    return { reports: collected, error: null };
  };

  return ({ workspaceId, nativeProviders }) => {
    const key = `${workspaceId}${[...nativeProviders].sort().join(',')}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const read = readUncoalesced(workspaceId, nativeProviders).finally(() => {
      if (pending.get(key) === read) pending.delete(key);
    });
    pending.set(key, read);
    return read;
  };
};

export type NativeResolvedCredential =
  | { type: 'api_key'; key: string }
  | { type: 'oauth'; access: string; refresh?: string; expires?: number }
  | null;

interface NativeQuotaProviderOptions {
  readNativeReports?: ReadNativeReports;
  workspaceId?: string;
  providerId?: string;
  agentDirectoryId?: string;
  credentialRef?: string;
  resolveCredential?: (input: { workspaceId: string; agentDirectoryId: string; providerId: string; credentialRef: string; purpose: string }) => Promise<NativeResolvedCredential>;
}

export const createNativeQuotaProvider = ({ providerId, providerName, nativeProviders, enrich }: NativeProviderSpec) => ({
  providerId,
  providerName,
  nativeProviders,
  isConfigured: () => true,
  fetchQuota: async (options: NativeQuotaProviderOptions = {}): Promise<QuotaResult<string, string, ProviderUsage>> => {
    const { readNativeReports, workspaceId } = options;
    if (readNativeReports === undefined || workspaceId === undefined || workspaceId.length === 0) {
      return buildResult({ providerId, providerName, ok: false, configured: true, error: 'Native usage reads are unavailable' });
    }
    let read: NativeUsageReportRead;
    try {
      read = await readNativeReports({ workspaceId, nativeProviders });
    } catch {
      return buildResult({ providerId, providerName, ok: false, configured: true, error: 'Native usage report could not be read' });
    }
    if (read.reports === null) {
      return buildResult({ providerId, providerName, ok: false, configured: true, error: read.error ?? 'Native usage report could not be read' });
    }
    const result = nativeReportsToProviderResult(read.reports, { providerId, providerName, nativeProviders }, {
      selectedNativeProviderId: options.providerId ?? null,
    });
    if (enrich !== undefined && result.ok && result.usage !== null) {
      try {
        await enrich(result, options);
      } catch {
        void 0;
      }
    }
    return result;
  },
});

