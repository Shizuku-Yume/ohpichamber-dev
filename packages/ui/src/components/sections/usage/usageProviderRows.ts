import type { ProviderResult, QuotaProviderId } from '@/types';
import { resolveQuotaProviderId } from '@/components/chat/work-status/usageHeadline';

/**
 * OMP names providers by native ids (`anthropic`, `openai-codex`), while quota
 * plans use logical ids (`claude`, `codex`). The Host's `nativeToLogical` map
 * joins the two, so one provider is one sidebar row and one quota card.
 */

interface UsageProviderRow {
  /** The quota id the row is keyed and merged by; also the id its sample is read under. */
  quotaProviderId: string;
  /** The id the Usage statistics filter by: OMP's native id when one is known. */
  statsProviderId: string;
  name: string;
}

/**
 * One row per provider. Configured providers come first, then providers the
 * statistics report, then quota results; a provider already present under its
 * quota id is merged into that row rather than repeated.
 */
export const buildUsageProviderRows = ({ configProviders, statsProviders, results, nativeToLogical }: {
  configProviders: readonly { providerId: string; name: string }[];
  statsProviders: readonly { providerId: string }[];
  results: readonly ProviderResult[];
  nativeToLogical: Record<string, string>;
}): UsageProviderRow[] => {
  const rows = new Map<string, UsageProviderRow>();
  const add = (providerId: string, name: string) => {
    const quotaProviderId = resolveQuotaProviderId(providerId, nativeToLogical);
    if (!quotaProviderId || rows.has(quotaProviderId)) return;
    rows.set(quotaProviderId, { quotaProviderId, statsProviderId: providerId, name });
  };
  for (const provider of configProviders) add(provider.providerId, provider.name || provider.providerId);
  for (const provider of statsProviders) add(provider.providerId, provider.providerId);
  for (const result of results) {
    if (result.configured) add(result.providerId, result.providerName || result.providerId);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
};

/**
 * A sample has something to show: provider windows or model windows.
 * Model-only plans, such as Antigravity, report no provider windows.
 */
export const hasQuotaData = (usage: ProviderResult['usage'] | undefined): boolean => {
  if (!usage) return false;
  if (Object.keys(usage.windows).length > 0) return true;
  return Object.values(usage.models ?? {}).some((model) => Object.keys(model.windows).length > 0);
};

/**
 * Quota cards for the Usage page, in result order and then refresh failures. A
 * configured provider gets a card when it has quota data or an error to report;
 * one with neither has nothing to show. A refresh failure keeps its card, so the
 * error stays visible, unless the list already says the provider is unconfigured.
 */
export const quotaCardProviderIds = (
  providers: readonly { id: QuotaProviderId }[],
  results: readonly ProviderResult[],
  refreshErrors: Partial<Record<QuotaProviderId, string>>,
): QuotaProviderId[] => {
  const ids: QuotaProviderId[] = [];
  const add = (id: QuotaProviderId) => {
    if (!ids.includes(id)) ids.push(id);
  };
  for (const result of results) {
    if (result.configured && (hasQuotaData(result.usage) || Boolean(result.error))) add(result.providerId);
  }
  for (const provider of providers) {
    const known = results.find((result) => result.providerId === provider.id);
    if (refreshErrors[provider.id] && known?.configured !== false) add(provider.id);
  }
  return ids;
};
