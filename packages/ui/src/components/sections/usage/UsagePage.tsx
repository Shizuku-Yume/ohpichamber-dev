import React from 'react';
import { UsageCard } from './UsageCard';
import { ConsoleBudgetsSection } from './ConsoleBudgetsSection';
import { useQuotaAutoRefresh, useQuotaProviders, useQuotaStore } from '@/stores/useQuotaStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { QuotaProviderLogo } from '@/components/usage/QuotaProviderLogo';
import { selectVisibleModelNames, toggleVisibleModel } from '@/components/usage/usageModelSelection';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { UsageWindows, QuotaProviderId } from '@/types';
import { getAllModelFamilies, getDisplayModelName, sortModelFamilies, groupModelsByFamilyWithGetter } from '@/lib/quota/model-families';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
import { formatTimeForPreference } from '@/lib/timeFormat';
import { useUIStore, type TimeFormatPreference } from '@/stores/useUIStore';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import {
  SettingsSection,
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

interface ModelInfo {
  name: string;
  windows: UsageWindows;
}

/** One provider's quota panel: its windows, its models, and the work-status switch. */
const ProviderQuota: React.FC<{ providerId: QuotaProviderId; settingsItem?: string }> = ({ providerId, settingsItem }) => {
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
  const refreshError = refreshErrors[providerId];
  const error = refreshError
    ? usage
      ? t('header.services.usageRefreshFailedStale', { error: refreshError })
      : refreshError
<<<<<<< HEAD
    : result?.configured && result.error
      ? result.error
||||||| bc50ba56aa
    // OpenCode Go reports a failed Go read beside the Console budgets it still has.
    : selectedResult?.configured && selectedResult.error
      ? selectedResult.error
=======
    : selectedResult?.configured && selectedResult.error
      ? selectedResult.error
>>>>>>> upstream/main
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

<<<<<<< HEAD
  const providerSelectedModels = React.useMemo(
    () => selectedModels[providerId] ?? [],
    [selectedModels, providerId],
  );
||||||| bc50ba56aa
=======
  const providerSelectedModels = React.useMemo(
    () => (selectedProviderId ? (selectedModels[selectedProviderId] ?? []) : []),
    [selectedModels, selectedProviderId],
  );
  const providerModelNames = React.useMemo(() => providerModels.map((model) => model.name), [providerModels]);
  const visibleModelNames = React.useMemo(
    () => new Set(selectedProviderId
      ? selectVisibleModelNames(selectedProviderId, providerModelNames, providerSelectedModels)
      : []),
    [providerModelNames, providerSelectedModels, selectedProviderId],
  );

>>>>>>> upstream/main
  const handleModelToggle = React.useCallback((modelName: string) => {
<<<<<<< HEAD
    toggleModelSelected(providerId, modelName);
    const isSelected = providerSelectedModels.includes(modelName);
    const nextSelected = isSelected
      ? providerSelectedModels.filter((model) => model !== modelName)
      : [...providerSelectedModels, modelName];
    void updateDesktopSettings({ usageSelectedModels: { ...selectedModels, [providerId]: nextSelected } });
  }, [providerId, providerSelectedModels, selectedModels, toggleModelSelected]);

  const familyRows = (models: ModelInfo[]) => models.map((model) => {
    const entries = Object.entries(model.windows.windows);
    if (entries.length === 0) return null;
    const [label, window] = entries[0];
||||||| bc50ba56aa
    if (!selectedProviderId) return;
    toggleModelSelected(selectedProviderId, modelName);
    const currentSelected = selectedModels[selectedProviderId] ?? [];
    const isSelected = currentSelected.includes(modelName);
    const nextSelected = isSelected
      ? currentSelected.filter((m) => m !== modelName)
      : [...currentSelected, modelName];
    const nextSettings: Record<string, string[]> = { ...selectedModels, [selectedProviderId]: nextSelected };
    void updateDesktopSettings({ usageSelectedModels: nextSettings });
  }, [selectedProviderId, selectedModels, toggleModelSelected]);

  const providerSelectedModels = selectedProviderId ? (selectedModels[selectedProviderId] ?? []) : [];

  if (!selectedProviderId) {
=======
    if (!selectedProviderId) return;
    const nextSelected = toggleVisibleModel(selectedProviderId, providerModelNames, providerSelectedModels, modelName);
    setSelectedModels(selectedProviderId, nextSelected);
    void updateDesktopSettings({ usageSelectedModels: { ...selectedModels, [selectedProviderId]: nextSelected } });
  }, [providerModelNames, providerSelectedModels, selectedModels, selectedProviderId, setSelectedModels]);

  if (!selectedProviderId) {
>>>>>>> upstream/main
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

      {usage?.windows && Object.keys(usage.windows).length > 0 ? (
        <div className="divide-y divide-[var(--surface-subtle)]">
          {Object.entries(usage.windows).map(([label, window]) => (
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
                    name={isCollapsed ? 'arrow-right-s' : 'arrow-down-s'}
                    className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors"
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
                  name={collapsedFamilies.other ? 'arrow-right-s' : 'arrow-down-s'}
                  className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors"
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="divide-y divide-[var(--surface-subtle)] mt-1">{familyRows(otherModels)}</div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      ) : null}

      {usage?.consoleBudgets ? <ConsoleBudgetsSection consoleBudgets={usage.consoleBudgets} /> : null}

      {!error && !hasQuotaData(usage) ? (
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

  if (selectedProvider !== null) {
    const cfg = configProviders.find((p) => p.providerId === selectedProvider);
    const providerName = cfg?.name || selectedProvider;
    const quotaId = quotaProviders.find((p) => p.id === resolveQuotaProviderId(selectedProvider, nativeToLogical))?.id ?? null;

    return (
      <SettingsPageLayout title={providerName} showSaveStatus={false}>
        <SettingsSection
          title={t('usageStats.title')}
          divider={false}
          settingsItem="usage.statistics"
        >
          <UsageStatsReport />
        </SettingsSection>

        {quotaId && quotaCardIds.includes(quotaId) ? (
          <ProviderQuota providerId={quotaId} />
        ) : (
          <SettingsSection title={t('settings.usage.page.section.quotas')} settingsItem="usage.quotas">
            <p className="typography-micro text-muted-foreground">{t('usageStats.providers.noQuota')}</p>
          </SettingsSection>
        )}
      </SettingsPageLayout>
    );
  }

  return (
<<<<<<< HEAD
    <SettingsPageLayout title={t('settings.page.usage.title')} showSaveStatus>
      <SettingsSection
        title={t('usageStats.title')}
        divider={false}
        settingsItem="usage.statistics"
      >
        <UsageStatsReport />
||||||| bc50ba56aa
    <SettingsPageLayout
      title={t('settings.usage.page.header.providerUsage', { provider: providerName })}
      titleLeading={<QuotaProviderLogo providerId={selectedProviderId} className="h-5 w-5 shrink-0" />}
      description={
        isLoading ? (
          <span className={cn('typography-settings-description text-muted-foreground', blink)}>{t('settings.usage.page.header.refreshing')}</span>
        ) : selectedResult?.planLabel ? (
          t('settings.usage.page.header.lastUpdatedWithPlan', {
            plan: selectedResult.planLabel,
            time: formatTime(lastUpdated, timeFormatPreference),
          })
        ) : selectedResult?.accountLabel ? (
          t('settings.usage.page.header.lastUpdatedWithAccount', {
            account: selectedResult.accountLabel,
            time: formatTime(lastUpdated, timeFormatPreference),
          })
        ) : (
          t('settings.usage.page.header.lastUpdated', { time: formatTime(lastUpdated, timeFormatPreference) })
        )
      }
      showSaveStatus
    >
      <SettingsSection divider={false} settingsItem="usage.work-status-panel">
        <SettingsCheckboxRow
          checked={showInDropdown}
          onChange={handleDropdownToggle}
          label={t('settings.usage.page.options.showInWorkStatus')}
          ariaLabel={t('settings.usage.page.options.showInWorkStatusAria')}
          info={t('settings.usage.page.options.showInWorkStatusTooltip')}
        />
=======
    <SettingsPageLayout
      title={t('settings.usage.page.header.providerUsage', { provider: providerName })}
      titleLeading={<QuotaProviderLogo providerId={selectedProviderId} className="h-5 w-5 shrink-0" />}
      description={
        isLoading ? (
          <span className={cn('typography-settings-description text-muted-foreground', blink)}>{t('settings.usage.page.header.refreshing')}</span>
        ) : selectedResult?.planLabel ? (
          t('settings.usage.page.header.lastUpdatedWithPlan', {
            plan: selectedResult.planLabel,
            time: formatTime(lastUpdated, timeFormatPreference),
          })
        ) : selectedResult?.accountLabel ? (
          t('settings.usage.page.header.lastUpdatedWithAccount', {
            account: selectedResult.accountLabel,
            time: formatTime(lastUpdated, timeFormatPreference),
          })
        ) : (
          t('settings.usage.page.header.lastUpdated', { time: formatTime(lastUpdated, timeFormatPreference) })
        )
      }
      showSaveStatus
    >
      <SettingsSection settingsItem="usage.work-status-panel">
        <SettingsCheckboxRow
          checked={showInDropdown}
          onChange={handleDropdownToggle}
          label={t('settings.usage.page.options.showInWorkStatus')}
          ariaLabel={t('settings.usage.page.options.showInWorkStatusAria')}
          info={t('settings.usage.page.options.showInWorkStatusTooltip')}
        />
>>>>>>> upstream/main
      </SettingsSection>

<<<<<<< HEAD
      {quotaCardIds.length > 0 ? (
        quotaCardIds.map((providerId, index) => (
          <ProviderQuota
            key={providerId}
            providerId={providerId}
            settingsItem={index === 0 ? 'usage.quotas' : undefined}
          />
        ))
      ) : null}
||||||| bc50ba56aa
      {!selectedResult && (
        <p className="typography-ui-label text-foreground pb-8">{t('settings.usage.page.state.noData')}</p>
      )}

      {/* Only the selected provider's own failure belongs in its panel. The
          store's global `error` is whichever provider failed first and has no
          UI consumer left; shown here it labeled DeepSeek with Claude's
          rate-limit message. */}
      {selectedProviderError && (
        <div className="mb-8 rounded-lg bg-[var(--status-error-background)] px-4 py-3">
          <p className="typography-ui-label font-medium text-[var(--status-error)]">{t('settings.usage.page.state.refreshFailedTitle')}</p>
          <p dir="auto" className="typography-meta text-[var(--status-error)]/80 mt-1">{selectedProviderError}</p>
        </div>
      )}

      {/* Providers with an inline credentials form don't need the "go to Providers" banner — the form IS the fix. */}
      {selectedResult && !selectedResult.configured && !hasCredentialsForm && (
        <div className="mb-8 rounded-lg bg-[var(--status-warning-background)] px-4 py-3">
          {/* Claude usage comes from Claude Code's own login, which Providers cannot add. */}
          {selectedProviderId === 'claude' ? (
            <>
              <p className="typography-ui-label font-medium text-[var(--status-warning)]">{t('settings.usage.page.state.claudeSignedOutTitle')}</p>
              <ClaudeCodeSignIn onSignedIn={() => void fetchProviderQuota('claude')} />
            </>
          ) : (
            <>
              <p className="typography-ui-label font-medium text-[var(--status-warning)]">{t('settings.usage.page.state.providerNotConfiguredTitle')}</p>
              <p className="typography-meta text-[var(--status-warning)]/80 mt-1">
                {t('settings.usage.page.state.providerNotConfiguredDescription')}
              </p>
            </>
          )}
        </div>
      )}

      {credentialProviderId && (
        <QuotaCredentials providerId={credentialProviderId} providerName={providerName} />
      )}

      {usage?.windows && Object.keys(usage.windows).length > 0 && (
        <SettingsSection settingsItem="usage.model-quotas">
          <div className="divide-y divide-[var(--surface-subtle)]">
            {Object.entries(usage.windows).map(([label, window]) => (
              <UsageCard key={label} title={label} window={window} providerId={selectedProviderId} />
            ))}
          </div>
        </SettingsSection>
      )}

      {usage?.consoleBudgets && <ConsoleBudgetsSection consoleBudgets={usage.consoleBudgets} />}

      {providerModels.length > 0 && (
        <SettingsSection
          title={t('settings.usage.page.section.modelQuotas')}
          contentClassName="space-y-3"
        >
          {sortedFamilies.map((family) => {
            const familyModels = modelsByFamily.get(family.id) ?? [];
            if (familyModels.length === 0) return null;

            const isCollapsed = collapsedFamilies[family.id] ?? false;

            return (
              <section key={family.id} className="p-2">
                <Collapsible
                  open={!isCollapsed}
                  onOpenChange={() => toggleFamilyCollapsed(family.id)}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-0.5 group">
                    <div className="flex items-center gap-1.5 text-start">
                      <span className="typography-ui-label font-normal text-foreground">{family.labelKey ? t(family.labelKey) : family.label}</span>
                      <span className="typography-micro text-muted-foreground">
                        ({familyModels.length})
                      </span>
                    </div>
                    {isCollapsed ? (
                      <Icon name="arrow-right-s" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <Icon name="arrow-down-s" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="divide-y divide-[var(--surface-subtle)] mt-1">
                      {familyModels.map((model) => {
                        const entries = Object.entries(model.windows.windows);
                        if (entries.length === 0) return null;
                        const [label, window] = entries[0];
                        const isSelected = providerSelectedModels.includes(model.name);

                        return (
                          <UsageCard
                            key={model.name}
                            title={label}
                            subtitle={getDisplayModelName(model.name)}
                            window={window}
                            showToggle
                            toggleEnabled={isSelected}
                            onToggle={() => handleModelToggle(model.name)}
                          />
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            );
          })}

          {(() => {
            const otherModels = modelsByFamily.get(null) ?? [];
            if (otherModels.length === 0) return null;

            const isCollapsed = collapsedFamilies['other'] ?? false;

            return (
              <section className="p-2">
                <Collapsible
                  open={!isCollapsed}
                  onOpenChange={() => toggleFamilyCollapsed('other')}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-0.5 group">
                    <div className="flex items-center gap-1.5 text-start">
                      <span className="typography-ui-label font-normal text-foreground">{t('settings.usage.page.section.otherModels')}</span>
                      <span className="typography-micro text-muted-foreground">
                        ({otherModels.length})
                      </span>
                    </div>
                    {isCollapsed ? (
                      <Icon name="arrow-right-s" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <Icon name="arrow-down-s" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="divide-y divide-[var(--surface-subtle)] mt-1">
                      {otherModels.map((model) => {
                        const entries = Object.entries(model.windows.windows);
                        if (entries.length === 0) return null;
                        const [label, window] = entries[0];
                        const isSelected = providerSelectedModels.includes(model.name);

                        return (
                          <UsageCard
                            key={model.name}
                            title={label}
                            subtitle={getDisplayModelName(model.name)}
                            window={window}
                            showToggle
                            toggleEnabled={isSelected}
                            onToggle={() => handleModelToggle(model.name)}
                          />
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            );
          })()}
        </SettingsSection>
      )}

      {selectedResult?.configured && usage && Object.keys(usage.windows ?? {}).length === 0 &&
        providerModels.length === 0 && !usage.consoleBudgets && (
        <div className="pb-8">
          <p className="typography-ui-label text-foreground">{t('settings.usage.page.state.noQuotaWindowsTitle')}</p>
          <p className="typography-meta text-muted-foreground mt-1">{t('settings.usage.page.state.noQuotaWindowsDescription')}</p>
        </div>
      )}
=======
      {!selectedResult && (
        <p className="typography-ui-label text-foreground pb-8">{t('settings.usage.page.state.noData')}</p>
      )}

      {selectedProviderError && (
        <div className="mb-8 rounded-lg bg-[var(--status-error-background)] px-4 py-3">
          <p className="typography-ui-label font-medium text-[var(--status-error)]">{t('settings.usage.page.state.refreshFailedTitle')}</p>
          <p dir="auto" className="typography-meta text-[var(--status-error)]/80 mt-1">{selectedProviderError}</p>
        </div>
      )}

      {selectedResult && !selectedResult.configured && !hasCredentialsForm && (
        <div className="mb-8 rounded-lg bg-[var(--status-warning-background)] px-4 py-3">
          {selectedProviderId === 'claude' ? (
            <>
              <p className="typography-ui-label font-medium text-[var(--status-warning)]">{t('settings.usage.page.state.claudeSignedOutTitle')}</p>
              <ClaudeCodeSignIn onSignedIn={() => void fetchProviderQuota('claude')} />
            </>
          ) : (
            <>
              <p className="typography-ui-label font-medium text-[var(--status-warning)]">{t('settings.usage.page.state.providerNotConfiguredTitle')}</p>
              <p className="typography-meta text-[var(--status-warning)]/80 mt-1">
                {t('settings.usage.page.state.providerNotConfiguredDescription')}
              </p>
            </>
          )}
        </div>
      )}

      {credentialProviderId && (
        <QuotaCredentials providerId={credentialProviderId} providerName={providerName} />
      )}

      {usage?.windows && Object.keys(usage.windows).length > 0 && (
        <SettingsSection settingsItem="usage.model-quotas">
          <div className="divide-y divide-[var(--surface-subtle)]">
            {Object.entries(usage.windows).map(([label, window]) => (
              <UsageCard key={label} title={label} window={window} providerId={selectedProviderId} />
            ))}
          </div>
        </SettingsSection>
      )}

      {usage?.consoleBudgets && <ConsoleBudgetsSection consoleBudgets={usage.consoleBudgets} />}

      {providerModels.length > 0 && (
        <SettingsSection
          title={t('settings.usage.page.section.modelQuotas')}
          contentClassName="space-y-3"
        >
          {sortedFamilies.map((family) => {
            const familyModels = modelsByFamily.get(family.id) ?? [];
            if (familyModels.length === 0) return null;

            const isCollapsed = collapsedFamilies[family.id] ?? false;

            return (
              <section key={family.id} className="p-2">
                <Collapsible
                  open={!isCollapsed}
                  onOpenChange={() => toggleFamilyCollapsed(family.id)}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-0.5 group">
                    <div className="flex items-center gap-1.5 text-start">
                      <span className="typography-ui-label font-normal text-foreground">{family.labelKey ? t(family.labelKey) : family.label}</span>
                      <span className="typography-micro text-muted-foreground">
                        ({familyModels.length})
                      </span>
                    </div>
                    {isCollapsed ? (
                      <Icon name="arrow-right-s" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <Icon name="arrow-down-s" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="divide-y divide-[var(--surface-subtle)] mt-1">
                      {familyModels.map((model) => {
                        const entries = Object.entries(model.windows.windows);
                        if (entries.length === 0) return null;
                        const [label, window] = entries[0];
                        const isShown = visibleModelNames.has(model.name);

                        return (
                          <UsageCard
                            key={model.name}
                            title={label}
                            subtitle={getDisplayModelName(model.name)}
                            window={window}
                            showToggle
                            toggleEnabled={isShown}
                            toggleDisabled={isShown && visibleModelNames.size === 1}
                            onToggle={() => handleModelToggle(model.name)}
                          />
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            );
          })}

          {(() => {
            const otherModels = modelsByFamily.get(null) ?? [];
            if (otherModels.length === 0) return null;

            const isCollapsed = collapsedFamilies['other'] ?? false;

            return (
              <section className="p-2">
                <Collapsible
                  open={!isCollapsed}
                  onOpenChange={() => toggleFamilyCollapsed('other')}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-0.5 group">
                    <div className="flex items-center gap-1.5 text-start">
                      <span className="typography-ui-label font-normal text-foreground">{t('settings.usage.page.section.otherModels')}</span>
                      <span className="typography-micro text-muted-foreground">
                        ({otherModels.length})
                      </span>
                    </div>
                    {isCollapsed ? (
                      <Icon name="arrow-right-s" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <Icon name="arrow-down-s" className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="divide-y divide-[var(--surface-subtle)] mt-1">
                      {otherModels.map((model) => {
                        const entries = Object.entries(model.windows.windows);
                        if (entries.length === 0) return null;
                        const [label, window] = entries[0];
                        const isShown = visibleModelNames.has(model.name);

                        return (
                          <UsageCard
                            key={model.name}
                            title={label}
                            subtitle={getDisplayModelName(model.name)}
                            window={window}
                            showToggle
                            toggleEnabled={isShown}
                            toggleDisabled={isShown && visibleModelNames.size === 1}
                            onToggle={() => handleModelToggle(model.name)}
                          />
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </section>
            );
          })()}
        </SettingsSection>
      )}

      {selectedResult?.configured && usage && Object.keys(usage.windows ?? {}).length === 0 &&
        providerModels.length === 0 && !usage.consoleBudgets && (
        <div className="pb-8">
          <p className="typography-ui-label text-foreground">{t('settings.usage.page.state.noQuotaWindowsTitle')}</p>
          <p className="typography-meta text-muted-foreground mt-1">{t('settings.usage.page.state.noQuotaWindowsDescription')}</p>
        </div>
      )}
>>>>>>> upstream/main
    </SettingsPageLayout>
  );
};
