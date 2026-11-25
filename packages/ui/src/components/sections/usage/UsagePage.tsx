import React from 'react';
import type { UsageAccounts, UsageAuthLimit, UsageAuthReport } from '@openchamber/agent-contract';
import { UsageCard } from './UsageCard';
import { useQuotaAutoRefresh, useQuotaProviders, useQuotaStore } from '@/stores/useQuotaStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { QuotaProviderLogo } from '@/components/usage/QuotaProviderLogo';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { UsageWindow, UsageWindows, QuotaProviderId } from '@/types';
import { getAllModelFamilies, getDisplayModelName, sortModelFamilies, groupModelsByFamilyWithGetter } from '@/lib/quota/model-families';
import { Icon } from '@/components/icon/Icon';
import { getCurrentIntlLocale, useI18n } from '@/lib/i18n';
import { formatTimeForPreference } from '@/lib/timeFormat';
import { useUIStore, type TimeFormatPreference } from '@/stores/useUIStore';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsSection,
  SettingsControlGroup,
  SettingsCheckboxRow,
  SETTINGS_SPACE_ROW_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { UsageStatsReport } from '@/components/views/usage/UsageStatsView';
import { useUsageStatsStore } from '@/components/views/usage/usageStatsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { quotaCardProviderIds, hasQuotaData } from './usageProviderRows';
import { resolveQuotaProviderId } from '@/components/chat/work-status/usageHeadline';

const formatTime = (timestamp: number | null, timeFormatPreference: TimeFormatPreference) => {
  if (!timestamp) return '-';
  try {
    return formatTimeForPreference(timestamp, timeFormatPreference, { fallback: '-' });
  } catch {
    return '-';
  }
};

function nativeUsageWindow(limit: UsageAuthLimit): UsageWindow {
  const { used, limit: total, remaining, usedFraction, remainingFraction, unit } = limit.amount;
  let usedPercent: number | null = null;
  if (usedFraction !== undefined) usedPercent = usedFraction * 100;
  else if (used !== undefined && total !== undefined && total > 0) usedPercent = used / total * 100;
  else if (unit === 'percent' && used !== undefined) usedPercent = used;
  else if (remainingFraction !== undefined) usedPercent = Math.max(0, 1 - remainingFraction) * 100;
  const remainingPercent = remainingFraction !== undefined ? remainingFraction * 100
    : usedPercent === null ? null : Math.max(0, 100 - usedPercent);
  return {
    usedPercent,
    remainingPercent,
    windowSeconds: limit.window?.durationMs === undefined ? null : limit.window.durationMs / 1000,
    resetAt: limit.window?.resetsAt ?? null,
    resetAfterSeconds: null,
    resetAtFormatted: null,
    resetAfterFormatted: null,
    valueLabel: unit === 'credits' && remaining !== undefined && usedPercent === null
      ? new Intl.NumberFormat(getCurrentIntlLocale(), { maximumFractionDigits: 2 }).format(remaining)
      : undefined,
    value: unit === 'usd' ? { kind: 'spend', spent: used ?? null, limit: total ?? null }
      : unit === 'requests' && used !== undefined ? { kind: 'requests', count: used } : undefined,
  };
}

const NativeAccountUsage: React.FC<{ accounts: UsageAccounts; settingsItem?: string }> = ({ accounts, settingsItem }) => {
  const { t } = useI18n();
  const providers = useConfigStore((state) => state.providers);
  const timeFormatPreference = useUIStore((state) => state.timeFormatPreference);
  const reports = accounts.reports;
  if (!reports?.length) return null;

  const format = new Intl.NumberFormat(getCurrentIntlLocale(), { maximumFractionDigits: 2 });
  const reportsByProvider = new Map<string, UsageAuthReport[]>();
  for (const report of reports) {
    if (report.limits.length === 0 && !report.resetCredits) continue;
    const group = reportsByProvider.get(report.provider);
    if (group) group.push(report);
    else reportsByProvider.set(report.provider, [report]);
  }
  if (reportsByProvider.size === 0) return null;
  return (
    <SettingsSection title={t('settings.usage.native.title')} description={t('settings.usage.native.description')} settingsItem={settingsItem}>
      {[...reportsByProvider].flatMap(([provider, group]) => {
        const name = providers.find((entry) => entry.providerId === provider)?.name || provider;
        return group.map((report, index) => (
          <SettingsControlGroup key={`${provider}:${index}`}
            title={group.length === 1 ? name : t('settings.usage.native.account', { provider: name, number: format.format(index + 1) })}
            description={t('settings.usage.page.header.lastUpdated', { time: formatTime(report.fetchedAt, timeFormatPreference) })}
          >
            {report.resetCredits ? (
              <p className="typography-meta text-muted-foreground">
                {t('settings.usage.native.resetCredits', { count: format.format(report.resetCredits.availableCount) })}
              </p>
            ) : null}
            {report.limits.map((limit, limitIndex) => (
              <UsageCard key={`${limit.id}:${limitIndex}`} title={limit.label} subtitle={limit.scope.modelId}
                window={nativeUsageWindow(limit)}
                status={limit.status === 'exhausted' ? t('settings.usage.native.limitReached') : undefined} />
            ))}
          </SettingsControlGroup>
        ));
      })}
    </SettingsSection>
  );
};

interface ModelInfo {
  name: string;
  windows: UsageWindows;
}

/** One provider's quota panel: its windows, its models, and the work-status switch. */
const ProviderQuota: React.FC<{ providerId: QuotaProviderId; settingsItem?: string; nativeWindows?: ReadonlySet<number> }> = ({
  providerId, settingsItem, nativeWindows,
}) => {
  const { t } = useI18n();
  const timeFormatPreference = useUIStore((state) => state.timeFormatPreference);
  const results = useQuotaStore((state) => state.results);
  const isLoading = useQuotaStore((state) => state.isLoading);
  const lastUpdated = useQuotaStore((state) => state.lastUpdated);
  const refreshErrors = useQuotaStore((state) => state.refreshErrors);
  const dropdownProviderIds = useQuotaStore((state) => state.dropdownProviderIds);
  const setProviderInDropdown = useQuotaStore((state) => state.setProviderInDropdown);
  const selectedModels = useQuotaStore((state) => state.selectedModels);
  const setSelectedModels = useQuotaStore((state) => state.setSelectedModels);
  const applyDefaultSelections = useQuotaStore((state) => state.applyDefaultSelections);
  const providers = useQuotaProviders();

  const providerName = providers.find((provider) => provider.id === providerId)?.name ?? providerId;
  const result = results.find((entry) => entry.providerId === providerId) ?? null;
  const usage = result?.usage;
  const providerWindows = Object.entries(usage?.windows ?? {}).filter(([, window]) =>
    window.windowSeconds === null || !nativeWindows?.has(window.windowSeconds));
  const refreshError = refreshErrors[providerId];
  const error = refreshError
    ? usage
      ? t('header.services.usageRefreshFailedStale', { error: refreshError })
      : refreshError
    : result?.configured && result.error
      ? result.error
      : null;
  const showInDropdown = dropdownProviderIds.includes(providerId);

  const providerModels = React.useMemo((): ModelInfo[] => {
    if (!usage?.models) return [];
    return Object.entries(usage.models)
      .map(([name, modelUsage]) => ({ name, windows: modelUsage }))
      .filter((model) => Object.keys(model.windows.windows).length > 0);
  }, [usage?.models]);

  React.useEffect(() => {
    if (providerModels.length > 0) {
      applyDefaultSelections(providerId, providerModels.map((model) => model.name));
    }
  }, [providerId, providerModels, applyDefaultSelections]);

  const modelsByFamily = React.useMemo(() => {
    if (providerModels.length === 0) return new Map<string | null, ModelInfo[]>();
    return groupModelsByFamilyWithGetter(providerModels, (model) => model.name, providerId);
  }, [providerModels, providerId]);

  const sortedFamilies = React.useMemo(
    () => sortModelFamilies(getAllModelFamilies(providerId)),
    [providerId],
  );

  const [collapsedFamilies, setCollapsedFamilies] = React.useState<Record<string, boolean>>({});
  const toggleFamilyCollapsed = React.useCallback((familyId: string) => {
    setCollapsedFamilies((previous) => ({ ...previous, [familyId]: !previous[familyId] }));
  }, []);

  const providerSelectedModels = React.useMemo(
    () => selectedModels[providerId] ?? [],
    [selectedModels, providerId],
  );
  const handleModelToggle = React.useCallback((modelName: string) => {
    const isSelected = providerSelectedModels.includes(modelName);
    const nextSelected = isSelected
      ? providerSelectedModels.filter((model) => model !== modelName)
      : [...providerSelectedModels, modelName];
    setSelectedModels(providerId, nextSelected);
    void updateDesktopSettings({ usageSelectedModels: { ...selectedModels, [providerId]: nextSelected } });
  }, [providerId, providerSelectedModels, selectedModels, setSelectedModels]);

  const familyRows = (models: ModelInfo[]) => models.map((model) => {
    const entries = Object.entries(model.windows.windows);
    if (entries.length === 0) return null;
    const [label, window] = entries[0];
    return (
      <UsageCard
        key={model.name}
        title={label}
        subtitle={getDisplayModelName(model.name)}
        window={window}
        showToggle
        toggleEnabled={providerSelectedModels.includes(model.name)}
        onToggle={() => handleModelToggle(model.name)}
      />
    );
  });

  const otherModels = modelsByFamily.get(null) ?? [];

  return (
    <SettingsSection
      title={(
        <span className="flex items-center gap-2">
          <QuotaProviderLogo providerId={providerId} className="h-4 w-4 shrink-0" />
          {providerName}
        </span>
      )}
      description={isLoading
        ? t('settings.usage.page.header.refreshing')
        : result?.planLabel
          ? t('settings.usage.page.header.lastUpdatedWithPlan', {
            plan: result.planLabel,
            time: formatTime(lastUpdated, timeFormatPreference),
          })
          : result?.accountLabel
            ? t('settings.usage.page.header.lastUpdatedWithAccount', {
              account: result.accountLabel,
              time: formatTime(lastUpdated, timeFormatPreference),
            })
            : t('settings.usage.page.header.lastUpdated', { time: formatTime(lastUpdated, timeFormatPreference) })}
      settingsItem={settingsItem}
      contentClassName={SETTINGS_SPACE_ROW_CLASS}
    >
      <SettingsCheckboxRow
        checked={showInDropdown}
        onChange={(enabled) => void updateDesktopSettings({
          usageDropdownProviders: setProviderInDropdown(providerId, enabled),
        })}
        label={t('settings.usage.page.options.showInWorkStatus')}
        ariaLabel={t('settings.usage.page.options.showInWorkStatusAria')}
        info={t('settings.usage.page.options.showInWorkStatusTooltip')}
      />

      {error ? (
        <div className="rounded-lg bg-[var(--status-error-background)] px-4 py-3">
          <p className="typography-ui-label font-medium text-[var(--status-error)]">{t('settings.usage.page.state.refreshFailedTitle')}</p>
          <p dir="auto" className="typography-meta text-[var(--status-error)]/80 mt-1">{error}</p>
        </div>
      ) : null}

      {providerWindows.length > 0 ? (
        <div className="divide-y divide-[var(--surface-subtle)]">
          {providerWindows.map(([label, window]) => (
            <UsageCard key={label} title={label} window={window} providerId={providerId} />
          ))}
        </div>
      ) : null}

      {providerModels.length > 0 ? (
        <div className="space-y-2">
          <p className="typography-micro uppercase tracking-wide text-muted-foreground">
            {t('settings.usage.page.section.modelQuotas')}
          </p>
          {sortedFamilies.map((family) => {
            const familyModels = modelsByFamily.get(family.id) ?? [];
            if (familyModels.length === 0) return null;
            const isCollapsed = collapsedFamilies[family.id] ?? false;
            return (
              <Collapsible key={family.id} open={!isCollapsed} onOpenChange={() => toggleFamilyCollapsed(family.id)}>
                <CollapsibleTrigger className="flex w-full items-center justify-between py-0.5 group">
                  <span className="flex items-center gap-1.5 text-start">
                    <span className="typography-ui-label font-normal text-foreground">{family.labelKey ? t(family.labelKey) : family.label}</span>
                    <span className="typography-micro text-muted-foreground">({familyModels.length})</span>
                  </span>
                  <Icon
                    name="arrow-right-s"
                    className={`h-4 w-4 text-muted-foreground group-hover:text-foreground transition-transform duration-150 motion-reduce:transition-none ${isCollapsed ? '' : 'rotate-90 rtl:-rotate-90'}`}
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="divide-y divide-[var(--surface-subtle)] mt-1">{familyRows(familyModels)}</div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          {otherModels.length > 0 ? (
            <Collapsible
              open={!(collapsedFamilies.other ?? false)}
              onOpenChange={() => toggleFamilyCollapsed('other')}
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between py-0.5 group">
                <span className="flex items-center gap-1.5 text-start">
                  <span className="typography-ui-label font-normal text-foreground">{t('settings.usage.page.section.otherModels')}</span>
                  <span className="typography-micro text-muted-foreground">({otherModels.length})</span>
                </span>
                <Icon
                  name="arrow-right-s"
                  className={`h-4 w-4 text-muted-foreground group-hover:text-foreground transition-transform duration-150 motion-reduce:transition-none ${collapsedFamilies.other ? '' : 'rotate-90 rtl:-rotate-90'}`}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="divide-y divide-[var(--surface-subtle)] mt-1">{familyRows(otherModels)}</div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ) : null}

      {!nativeWindows && !error && !hasQuotaData(usage) ? (
        <div>
          <p className="typography-ui-label text-foreground">{t('settings.usage.page.state.noQuotaWindowsTitle')}</p>
          <p className="typography-meta text-muted-foreground mt-1">{t('settings.usage.page.state.noQuotaWindowsDescription')}</p>
        </div>
      ) : null}
    </SettingsSection>
  );
};

/**
 * Usage: what the agent spent (token analytics from the session store) and
 * what each configured provider's plan has left. A provider OMP holds no
 * credential for is not a card — its quota cannot be read, so there is
 * nothing to show and nothing to configure here.
 */
export const UsagePage: React.FC = () => {
  const { t } = useI18n();
  const selectedProvider = useUsageStatsStore((state) => state.selectedProvider);
  const quotaProviders = useQuotaProviders();
  const results = useQuotaStore((state) => state.results);
  const refreshErrors = useQuotaStore((state) => state.refreshErrors);
  const nativeToLogical = useQuotaStore((state) => state.nativeToLogical);
  const configProviders = useConfigStore((state) => state.providers);
  useQuotaAutoRefresh(true, true);

  const quotaCardIds = React.useMemo(
    () => quotaCardProviderIds(quotaProviders, results, refreshErrors),
    [quotaProviders, refreshErrors, results],
  );

  const title = selectedProvider === null ? t('settings.page.usage.title')
    : configProviders.find((p) => p.providerId === selectedProvider)?.name || selectedProvider;
  const selectedQuotaId = resolveQuotaProviderId(selectedProvider, nativeToLogical);
  const visibleQuotaIds = selectedProvider === null ? quotaCardIds : quotaCardIds.filter((id) => id === selectedQuotaId);
  return (
    <SettingsPageLayout title={title} showSaveStatus={false}>
      <UsageStatsReport renderReport={(report, accounts) => {
        const reports = accounts?.reports;
        const hasNativeData = reports?.some((entry) => entry.limits.length > 0 || entry.resetCredits) ?? false;
        const nativeWindows = new Map<string, Set<number>>();
        for (const entry of reports ?? []) {
          const providerId = resolveQuotaProviderId(entry.provider, nativeToLogical);
          if (!providerId) continue;
          for (const limit of entry.limits) {
            const duration = limit.window?.durationMs;
            if (limit.scope.modelId || limit.scope.tier || duration === undefined) continue;
            if (nativeUsageWindow(limit).usedPercent === null && limit.status !== 'exhausted') continue;
            const covered = nativeWindows.get(providerId) ?? new Set<number>();
            covered.add(duration / 1000);
            nativeWindows.set(providerId, covered);
          }
        }
        return (
          <>
            <SettingsSection title={t('usageStats.title')} divider={false} settingsItem="usage.statistics">
              {report}
            </SettingsSection>
            {hasNativeData && accounts ? <NativeAccountUsage accounts={accounts} settingsItem="usage.quotas" /> : null}
            {visibleQuotaIds.map((providerId, index) => (
              <ProviderQuota key={providerId} providerId={providerId}
                settingsItem={!hasNativeData && index === 0 ? 'usage.quotas' : undefined}
                nativeWindows={nativeWindows.get(providerId)} />
            ))}
            {selectedProvider !== null && !hasNativeData && visibleQuotaIds.length === 0 ? (
              <SettingsSection title={t('settings.usage.page.section.quotas')} settingsItem="usage.quotas">
                <p className="typography-micro text-muted-foreground">{t('usageStats.providers.noQuota')}</p>
              </SettingsSection>
            ) : null}
          </>
        );
      }} />
    </SettingsPageLayout>
  );
};
