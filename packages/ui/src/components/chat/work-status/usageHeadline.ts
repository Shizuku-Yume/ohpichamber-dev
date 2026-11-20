import { useQuotaStore } from '@/stores/useQuotaStore';
import type { UsageProviderGroup, UsageLimitRow } from '@/components/usage/usageGroups';


const normalize = (value: string | null | undefined): string => (value ?? '').trim().toLowerCase();

export const resolveQuotaProviderId = (
  modelProviderId: string | null | undefined,
  mapping?: Record<string, string>,
): string | null => {
  const normalized = normalize(modelProviderId);
  if (!normalized) return null;
  const nativeToLogical = mapping ?? useQuotaStore.getState().nativeToLogical;
  return nativeToLogical[normalized] ?? normalized;
};

export const pickUsageHeadline = (
  groups: readonly UsageProviderGroup[],
  modelProviderId: string | null | undefined,
  mapping?: Record<string, string>,
): { group: UsageProviderGroup; row: UsageLimitRow } | null => {
  const quotaProviderId = resolveQuotaProviderId(modelProviderId, mapping);
  if (!quotaProviderId) return null;

  const group = groups.find((candidate) => normalize(candidate.providerId) === quotaProviderId);
  if (!group || group.rows.length === 0) return null;

  const providerRows = group.rows.filter((row) => !row.subtitle);
  const rows = providerRows.length > 0 ? providerRows : group.rows;

  let best: UsageLimitRow | null = null;
  let bestSeconds = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const seconds = row.window.windowSeconds;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) continue;
    if (seconds < bestSeconds) {
      best = row;
      bestSeconds = seconds;
    }
  }

  return { group, row: best ?? rows[0] };
};
