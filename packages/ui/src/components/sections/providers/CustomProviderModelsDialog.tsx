import React from 'react';
import type { ModelCatalogInfo, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import {
  SettingsChipGroup,
  SettingsGroupTitle,
  SETTINGS_FIELD_LABEL_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_DIALOG_ICON_BUTTON_CLASS,
} from '@/components/sections/shared/SettingsSection';
import { SettingsInfoHint } from '@/components/sections/shared/SettingsInfoHint';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useI18n } from '@/lib/i18n';
import { formatGoalTokens } from '@/lib/sessionGoalMetadata';
import { cn } from '@/lib/utils';
import {
  discoveryFilterCounts,
  discoveryFilterValues,
  discoveryRows,
  groupDiscoveryRows,
  idsToAdd,
  matchesDiscoveryFilter,
  staleModelIds,
  type DiscoveryFilter,
  type DiscoveryRow,
} from './custom-provider-autofill';
import type { ModelRow } from './custom-provider-model-rows';
import type { CustomProviderTranslator } from './custom-provider-form';

/** Below this many rows the list is short enough to scan without a search field. */
const SEARCH_THRESHOLD = 8;

interface CustomProviderModelsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  discovered: readonly ProviderModelDiscoveryResult['models'][number][];
  models: readonly ModelRow[];
  /** Add these ids as new form rows; ids already in the form are skipped. */
  onAdd: (modelIds: string[]) => void;
  /** Remove the form rows carrying these ids. */
  onRemove: (modelIds: string[]) => void;
  busy?: boolean;
}

const CapabilityBadge: React.FC<{ icon: IconName; label: string; title: string }> = ({ icon, label, title }) => (
  <span
    className="flex shrink-0 items-center gap-1 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 typography-micro text-muted-foreground"
    title={title}
  >
    <Icon name={icon} className="size-3" />
    {label}
  </span>
);

const capabilityBadges = (catalog: ModelCatalogInfo | undefined, t: CustomProviderTranslator): React.ReactNode[] => {
  if (!catalog) return [];
  const badges: React.ReactNode[] = [];
  if (catalog.input.includes('text')) {
    badges.push(<CapabilityBadge key="text" icon="text" title={t('settings.providers.page.models.capability.textInput')} label={t('settings.providers.page.models.capability.textInput')} />);
  }
  if (catalog.input.includes('image')) {
    badges.push(<CapabilityBadge key="image" icon="file-image" title={t('settings.providers.page.models.capability.imageInput')} label={t('settings.providers.page.models.capability.imageInput')} />);
  }
  if (catalog.reasoning) {
    badges.push(<CapabilityBadge key="reasoning" icon="brain-ai-3" title={t('settings.providers.page.models.capability.reasoning')} label={t('settings.providers.page.models.capability.reasoning')} />);
  }
  if (catalog.toolsSupported) {
    badges.push(<CapabilityBadge key="tools" icon="tools" title={t('settings.providers.page.models.capability.toolCalling')} label={t('settings.providers.page.models.capability.toolCalling')} />);
  }
  badges.push((
    <span
      key="context"
      className="shrink-0 rounded bg-[var(--surface-muted)] px-1.5 py-0.5 typography-micro text-muted-foreground tabular-nums"
      title={t('settings.providers.page.custom.models.contextWindow')}
    >
      {formatGoalTokens(catalog.contextWindow)}
    </span>
  ));
  return badges;
};

const ModelLine: React.FC<{
  row: DiscoveryRow;
  busy: boolean;
  onAdd: (modelId: string) => void;
  onRemove: (modelId: string) => void;
}> = ({ row, busy, onAdd, onRemove }) => {
  const { t } = useI18n();
  const added = row.formRow !== undefined;
  const stale = row.kind === 'stale';
  const title = row.name || row.modelId;
  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className={cn('truncate', SETTINGS_FIELD_LABEL_CLASS)}>{title}</span>
          {row.name && row.name !== row.modelId ? (
            <span className="truncate font-mono text-xs text-muted-foreground">{row.modelId}</span>
          ) : null}
          {added && !stale ? (
            <span className={cn('shrink-0', SETTINGS_HELPER_CLASS)}>{t('settings.providers.page.custom.discovery.alreadyAdded')}</span>
          ) : null}
          {stale ? (
            <span className="shrink-0 typography-micro text-[var(--status-warning)]">{t('settings.providers.page.custom.models.dialog.stale')}</span>
          ) : null}
        </div>
        {row.catalog ? <div className="flex flex-wrap items-center gap-1">{capabilityBadges(row.catalog, t)}</div> : null}
      </div>
      {stale || added ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(SETTINGS_DIALOG_ICON_BUTTON_CLASS, 'shrink-0 text-muted-foreground hover:text-[var(--status-error)]')}
          disabled={busy}
          onClick={() => onRemove(row.modelId)}
          aria-label={t('settings.providers.page.custom.models.dialog.removeModelAria', { model: row.modelId })}
          title={t('settings.providers.page.custom.models.dialog.removeModelAria', { model: row.modelId })}
        >
          <Icon name="delete-bin" className="size-3.5" />
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn(SETTINGS_DIALOG_ICON_BUTTON_CLASS, 'shrink-0 text-muted-foreground hover:text-foreground')}
          disabled={busy}
          onClick={() => onAdd(row.modelId)}
          aria-label={t('settings.providers.page.custom.models.dialog.addModelAria', { model: row.modelId })}
          title={t('settings.providers.page.custom.models.dialog.addModelAria', { model: row.modelId })}
        >
          <Icon name="add" className="size-3.5" />
        </Button>
      )}
    </div>
  );
};

/**
 * Reviews a provider's freshly discovered models against the form: add one or
 * all missing ids, search and filter the list, and drop rows the provider no
 * longer returns (after confirming the ids, since that discards typed limits).
 */
export const CustomProviderModelsDialog: React.FC<CustomProviderModelsDialogProps> = ({
  open,
  onOpenChange,
  discovered,
  models,
  onAdd,
  onRemove,
  busy = false,
}) => {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [filter, setFilter] = React.useState<DiscoveryFilter>('all');
  const [query, setQuery] = React.useState('');
  // Opening this dialog from the settings window makes that window
  // `aria-hidden` while its trigger keeps focus, which browsers report and
  // then hide from assistive tech; focus moves in here on open instead.
  const searchRef = React.useRef<HTMLInputElement | null>(null);
  const surfaceRef = React.useRef<HTMLDivElement | null>(null);
  const focusIntoDialog = React.useCallback(() => {
    const target = searchRef.current ?? surfaceRef.current;
    if (!target) return true;
    // A control that already took focus (an autoFocus button) keeps it.
    const dialog = target.closest('[data-slot="dialog-content"]');
    if (dialog?.contains(document.activeElement)) return true;
    return target;
  }, []);

  const rows = React.useMemo(() => discoveryRows(discovered, models), [discovered, models]);
  const staleIds = React.useMemo(() => staleModelIds(models, discovered), [models, discovered]);
  const addableIds = React.useMemo(() => idsToAdd(models, discovered), [models, discovered]);
  const counts = React.useMemo(() => discoveryFilterCounts(rows), [rows]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = rows.filter((row) => matchesDiscoveryFilter(row, filter)
    && (!normalizedQuery || [row.modelId, row.name ?? ''].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))));
  const grouping = groupDiscoveryRows(visible);

  const requestRemoveStale = async () => {
    if (staleIds.length === 0) return;
    const confirmed = await confirm({
      title: t('settings.providers.page.custom.models.dialog.removeStaleTitle'),
      message: t('settings.providers.page.custom.models.dialog.removeStaleMessage', { models: staleIds.join(', ') }),
      action: t('settings.providers.page.custom.models.dialog.removeStaleAction'),
      destructive: true,
    });
    if (!confirmed) return;
    onRemove(staleIds);
    // The rows the dialog was reviewing are gone; a stale-only view would read
    // as an empty list, so it returns to all before the next look.
    setFilter('all');
  };

  const filterOptions = discoveryFilterValues.map((value) => ({
    value,
    label: `${t(`settings.providers.page.custom.models.dialog.filter.${value}`)} (${counts[value]})`,
  }));

  const renderRow = (row: DiscoveryRow) => (
    <ModelLine
      key={row.modelId}
      row={row}
      busy={busy}
      onAdd={(modelId) => onAdd([modelId])}
      onRemove={(modelId) => onRemove([modelId])}
    />
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl" initialFocus={focusIntoDialog}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              {t('settings.providers.page.custom.models.dialog.title')}
              <SettingsInfoHint>{t('settings.providers.page.custom.models.dialog.info')}</SettingsInfoHint>
            </DialogTitle>
            <DialogDescription>
              {t('settings.providers.page.custom.models.dialog.counts', { total: rows.length, visible: visible.length })}
            </DialogDescription>
          </DialogHeader>

          <div ref={surfaceRef} tabIndex={-1} className="@container space-y-3 outline-none">
            <div className="flex flex-wrap items-center gap-2">
              <SettingsChipGroup
                value={filter}
                options={filterOptions}
                onChange={(value) => setFilter(value)}
                aria-label={t('settings.providers.page.custom.models.dialog.filterAria')}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="xs"
                disabled={busy || addableIds.length === 0}
                onClick={() => onAdd(addableIds)}
              >
                <Icon name="add" className="size-3.5" />
                {t('settings.providers.page.custom.models.dialog.addAll', { count: addableIds.length })}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={busy || staleIds.length === 0}
                onClick={() => void requestRemoveStale()}
              >
                <Icon name="delete-bin" className="size-3.5" />
                {t('settings.providers.page.custom.models.dialog.removeStale', { count: staleIds.length })}
              </Button>
            </div>

            {rows.length > SEARCH_THRESHOLD ? (
              <div className="relative">
                <Icon
                  name="search"
                  className="pointer-events-none absolute inset-s-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && query) {
                      event.preventDefault();
                      event.stopPropagation();
                      setQuery('');
                    }
                  }}
                  placeholder={t('settings.providers.page.models.filterPlaceholder')}
                  aria-label={t('settings.providers.page.models.filterPlaceholder')}
                  className="h-8 rounded-md ps-8"
                />
              </div>
            ) : null}

            <ScrollableOverlay
              outerClassName="oc-tile-inset max-h-[min(24rem,55dvh)] rounded-md"
              className="px-2 py-1"
              disableHorizontal
              preventOverscroll
              useScrollShadow
            >
              {visible.length === 0 ? (
                <p className="px-2 py-6 text-center typography-meta text-muted-foreground">
                  {t('settings.providers.page.models.noModelsMatchFilter')}
                </p>
              ) : grouping.grouped ? (
                grouping.groups.map((group) => (
                  <div key={group.family} className="py-1">
                    <SettingsGroupTitle>{group.family}</SettingsGroupTitle>
                    <div className="divide-y divide-[var(--surface-subtle)]">{group.rows.map(renderRow)}</div>
                  </div>
                ))
              ) : (
                <div className="divide-y divide-[var(--surface-subtle)]">{visible.map(renderRow)}</div>
              )}
            </ScrollableOverlay>
          </div>

          <DialogFooter>
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>
              {t('settings.providers.page.custom.discovery.cancel')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
};
