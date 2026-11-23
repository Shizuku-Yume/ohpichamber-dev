import React from 'react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Icon } from "@/components/icon/Icon";
import { cn } from '@/lib/utils';
import { resolveUsageTone } from '@/lib/quota';
import { useQuotaAutoRefresh, useQuotaStore } from '@/stores/useQuotaStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUsageStatsStore } from '@/components/views/usage/usageStatsStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { useI18n } from '@/lib/i18n';
import type { UsageProvider } from '@openchamber/agent-contract';
import { SETTINGS_SECTION_TITLE_CLASS, SETTINGS_SELECT_TRIGGER_CLASS } from '@/components/sections/shared/SettingsSection';
import { buildUsageProviderRows } from './usageProviderRows';

interface UsageSidebarProps {
  onItemSelect?: () => void;
}
const getUsagePercent = (usage: { windows?: Record<string, { usedPercent: number | null }> } | null | undefined) => {
  const windows = usage?.windows ?? {};
  const values = Object.values(windows)
    .map((window) => window.usedPercent)
    .filter((value): value is number => typeof value === 'number');
  if (values.length === 0) {
    return null;
  }
  return Math.max(...values);
};

const EMPTY_PROVIDERS: readonly UsageProvider[] = [];

export const UsageSidebar: React.FC<UsageSidebarProps> = ({ onItemSelect }) => {
  const { t } = useI18n();
  const results = useQuotaStore((state) => state.results);
  const selectedProvider = useUsageStatsStore((state) => state.selectedProvider);
  const setSelectedProvider = useUsageStatsStore((state) => state.setSelectedProvider);
  const refreshSettingsReport = useUsageStatsStore((state) => state.refreshSettingsReport);
  const fetchAllQuotas = useQuotaStore((state) => state.fetchAllQuotas);
  const isLoading = useQuotaStore((state) => state.isLoading);
  const quotaPhase = useQuotaStore((state) => state.phase);
  const usageDisplayMode = useQuotaStore((state) => state.displayMode);
  const setUsageDisplayMode = useQuotaStore((state) => state.setDisplayMode);
  const nativeToLogical = useQuotaStore((state) => state.nativeToLogical);
  const configProviders = useConfigStore((state) => state.providers);
  const statsProviders = useUsageStatsStore((state) => {
    for (const key of Object.keys(state.entries)) {
      const providers = state.entries[key]?.stats?.providers;
      if (providers && providers.length > 0) return providers;
    }
    return EMPTY_PROVIDERS;
  });
  useQuotaAutoRefresh(true, true);

  const rows = React.useMemo(() => buildUsageProviderRows({
    configProviders,
    statsProviders,
    results,
    nativeToLogical,
  }), [configProviders, nativeToLogical, results, statsProviders]);

  const persistUsageSettings = React.useCallback(async (changes: { usageDisplayMode?: 'usage' | 'remaining'; usageDropdownProviders?: string[] }) => {
    try {
      await updateDesktopSettings(changes);
    } catch (error) {
      console.warn('Failed to save usage settings:', error);
    }
  }, []);

  const handleUsageDisplayModeChange = React.useCallback((value: string) => {
    if (value !== 'usage' && value !== 'remaining') {
      return;
    }
    setUsageDisplayMode(value);
    void persistUsageSettings({ usageDisplayMode: value });
  }, [persistUsageSettings, setUsageDisplayMode]);

  const bgClass = 'bg-background';

  return (
    <div className={cn('flex h-full flex-col', bgClass)}>
      <div className="border-b px-3 pt-4 pb-3">
        <h2 className={`${SETTINGS_SECTION_TITLE_CLASS} mb-3`}>{t('settings.usage.sidebar.title')}</h2>
        <div className="flex items-center justify-between gap-2">
          <span className="typography-meta text-muted-foreground">{t('settings.usage.sidebar.total', { count: rows.length })}</span>
          <div className="flex items-center gap-2">
            <Button size="sm"
              variant="ghost"
              className="h-7 w-7 px-0 text-muted-foreground"
              onClick={() => {
                refreshSettingsReport();
                void fetchAllQuotas();
              }}
              aria-label={t('settings.usage.sidebar.actions.refreshAria')}
              title={t('settings.usage.sidebar.actions.refreshTitle')}
              disabled={isLoading}
            >
              <Icon name="refresh" className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="typography-micro text-muted-foreground">{t('settings.usage.sidebar.field.display')}</span>
          <Select value={usageDisplayMode} onValueChange={handleUsageDisplayModeChange}>
            <SelectTrigger className={SETTINGS_SELECT_TRIGGER_CLASS}>
              <SelectValue>
                {usageDisplayMode === 'remaining'
                  ? t('settings.usage.sidebar.field.displayModeRemaining')
                  : t('settings.usage.sidebar.field.displayModeUsage')}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="usage">{t('settings.usage.sidebar.field.displayModeUsage')}</SelectItem>
              <SelectItem value="remaining">{t('settings.usage.sidebar.field.displayModeRemaining')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2 overflow-x-hidden">
        {/* All providers row */}
        <div
          className={cn(
            'group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200',
            selectedProvider === null ? 'bg-interactive-selection' : 'hover:bg-interactive-hover'
          )}
        >
          <button
            type="button"
            onClick={() => {
              setSelectedProvider(null);
              onItemSelect?.();
            }}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Icon name="bar-chart-2" className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="typography-ui-label font-medium truncate flex-1 min-w-0 text-foreground">
              {t('usageStats.providers.allProviders')}
            </span>
          </button>
        </div>

        {quotaPhase === 'unknown' && rows.length === 0 ? (
          <p className="typography-meta px-1 text-muted-foreground">{t('settings.usage.state.unknown')}</p>
        ) : null}
        {rows.map((row) => {
          const result = results.find((entry) => entry.providerId === row.quotaProviderId);
          const percent = getUsagePercent(result?.usage);
          const tone = resolveUsageTone(percent);
          const isSelected = row.statsProviderId === selectedProvider;
          const configured = result?.configured ?? true;

          const statusStyle = !configured
            ? { backgroundColor: 'var(--surface-muted-foreground)', opacity: 0.4 }
            : tone === 'critical'
              ? { backgroundColor: 'var(--status-error)' }
              : tone === 'warn'
                ? { backgroundColor: 'var(--status-warning)' }
                : { backgroundColor: 'var(--status-success)' };

          return (
            <div
              key={row.quotaProviderId}
              className={cn(
                'group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200',
                isSelected ? 'bg-interactive-selection' : 'hover:bg-interactive-hover'
              )}
            >
              <button
                type="button"
                onClick={() => {
                  setSelectedProvider(row.statsProviderId);
                  onItemSelect?.();
                }}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {result?.usage ? (
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={statusStyle} />
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full flex-shrink-0 bg-transparent" />
                )}
                <ProviderLogo providerId={row.statsProviderId} alt={row.name} className="h-4 w-4 flex-shrink-0" />
                <span className="typography-ui-label font-normal truncate flex-1 min-w-0 text-foreground">
                  {row.name}
                </span>
              </button>
            </div>
          );
        })}
      </ScrollableOverlay>
    </div>
  );
};
