import React from 'react';
import type { ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import {
  SettingsCheckboxRow,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icon/Icon';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useI18n } from '@/lib/i18n';
import { formatGoalTokens } from '@/lib/sessionGoalMetadata';

/** Below this many results the list is short enough to scan without a filter. */
const SEARCH_THRESHOLD = 8;

type DiscoveredModel = ProviderModelDiscoveryResult['models'][number];

interface CustomProviderModelDiscoveryProps {
  models: readonly DiscoveredModel[];
  /** Model ids already in the form; they show as added and cannot be picked again. */
  existingIds: ReadonlySet<string>;
  onAdd: (selected: DiscoveredModel[]) => void;
  onCancel: () => void;
}

/**
 * The one-time review step after asking a provider for its models: pick
 * which ones to add, then the panel closes. Nothing here stays in sync with
 * the provider afterwards.
 */
export const CustomProviderModelDiscovery: React.FC<CustomProviderModelDiscoveryProps> = ({ models, existingIds, onAdd, onCancel }) => {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState<Set<string>>(
    () => new Set(models.filter((model) => !existingIds.has(model.modelId)).map((model) => model.modelId)),
  );

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = normalizedQuery
    ? models.filter((model) => [model.modelId, model.name]
      .some((value) => value.toLocaleLowerCase().includes(normalizedQuery)))
    : models;
  const selectable = visible.filter((model) => !existingIds.has(model.modelId));
  const allVisibleSelected = selectable.length > 0 && selectable.every((model) => selected.has(model.modelId));

  const toggleAll = () => setSelected((previous) => {
    const next = new Set(previous);
    for (const model of selectable) {
      if (allVisibleSelected) next.delete(model.modelId);
      else next.add(model.modelId);
    }
    return next;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className={SETTINGS_FIELD_LABEL_CLASS}>{t('settings.providers.page.custom.discovery.review')}</p>
          <p className={SETTINGS_HELPER_CLASS}>
            {t('settings.providers.page.custom.discovery.counts', {
              matching: visible.length,
              total: models.length,
              selected: selected.size,
            })}
          </p>
        </div>
        <Button type="button" variant="ghost" size="xs" disabled={selectable.length === 0} onClick={toggleAll}>
          {allVisibleSelected
            ? t('settings.providers.page.custom.discovery.deselectAll')
            : t('settings.providers.page.custom.discovery.selectAll')}
        </Button>
      </div>

      {models.length > SEARCH_THRESHOLD ? (
        <div className="relative">
          <Icon
            name="search"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query) {
                event.preventDefault();
                event.stopPropagation();
                setQuery('');
              }
            }}
            placeholder={t('settings.agents.modelSelector.searchPlaceholder')}
            aria-label={t('settings.agents.modelSelector.searchPlaceholder')}
            className="h-8 rounded-md pl-8"
          />
        </div>
      ) : null}

      <ScrollableOverlay
        outerClassName="max-h-[min(18rem,45dvh)] rounded-md border border-border/60"
        className="px-2 py-1"
        disableHorizontal
        preventOverscroll
        useScrollShadow
      >
        {visible.length > 0 ? visible.map((model) => {
          const added = existingIds.has(model.modelId);
          const limits = [
            model.contextWindow
              ? t('settings.providers.page.custom.discovery.contextValue', { value: formatGoalTokens(model.contextWindow) })
              : null,
            model.maxOutputTokens
              ? t('settings.providers.page.custom.discovery.outputValue', { value: formatGoalTokens(model.maxOutputTokens) })
              : null,
          ].filter(Boolean).join(' · ');
          return (
            <SettingsCheckboxRow
              key={model.modelId}
              checked={added || selected.has(model.modelId)}
              disabled={added}
              onChange={(checked) => setSelected((previous) => {
                const next = new Set(previous);
                if (checked) next.add(model.modelId);
                else next.delete(model.modelId);
                return next;
              })}
              label={<span className="block truncate font-mono text-xs">{model.modelId}</span>}
              description={added
                ? t('settings.providers.page.custom.discovery.alreadyAdded')
                : (limits || model.name)}
              ariaLabel={model.modelId}
              className="py-1.5"
            />
          );
        }) : (
          <p className="px-2 py-6 text-center typography-meta text-muted-foreground">
            {t('settings.agents.modelSelector.state.noModelsFound')}
          </p>
        )}
      </ScrollableOverlay>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          type="button"
          size="xs"
          className="!font-normal"
          disabled={selected.size === 0}
          onClick={() => onAdd(models.filter((model) => selected.has(model.modelId)))}
        >
          {t('settings.providers.page.custom.discovery.importSelected', { count: selected.size })}
        </Button>
        <Button type="button" variant="ghost" size="xs" className="!font-normal" onClick={onCancel}>
          {t('settings.providers.page.custom.discovery.cancel')}
        </Button>
      </div>
    </div>
  );
};
