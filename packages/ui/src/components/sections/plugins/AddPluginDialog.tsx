import React from 'react';
import { LocalExtensionIdSchema, type MarketplaceEntry, type MarketplaceSource } from '@openchamber/agent-contract';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { SortableTabsStrip, type SortableTabsStripItem } from '@/components/ui/sortable-tabs-strip';
import { SettingsStackedField, SETTINGS_SELECT_TRIGGER_CLASS } from '@/components/sections/shared/SettingsSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/lib/i18n';
import { CanonicalApiError } from '@/api/canonicalClient';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';
import { usePluginsStore } from '@/stores/usePluginsStore';
import { MarketplaceSourcesDialog } from './MarketplaceSourcesDialog';

type TabKey = 'marketplace' | 'package' | 'local';

interface AddPluginDialogProps {
 open: boolean;
 onOpenChange: (open: boolean) => void;
}

const SourceTypeChip: React.FC<{ sourceType: MarketplaceSource['sourceType'] }> = ({ sourceType }) => {
 const { t } = useI18n();
 const label = {
  github: 'settings.plugins.marketplace.source.github',
  git: 'settings.plugins.marketplace.source.git',
  url: 'settings.plugins.marketplace.source.url',
  local: 'settings.plugins.marketplace.source.local',
 } as const;
 return <span className="oc-tile-inset shrink-0 rounded-full px-2 py-px text-[0.625rem] font-medium">{t(label[sourceType])}</span>;
};

/** One searchable marketplace row: category and keyword badges plus an external links line. */
const MarketplaceRow: React.FC<{
 entry: MarketplaceEntry;
 installed: boolean;
 disabled: boolean;
 onInstall: () => void;
}> = ({ entry, installed, disabled, onInstall }) => {
 const { t } = useI18n();
 const details = entry.details;
 const badges = [details?.category, ...(details?.keywords ?? [])].filter((value): value is string => Boolean(value));
 const links = [
  details?.homepage ? { href: details.homepage, label: t('settings.plugins.details.homepage') } : null,
  details?.repository ? { href: details.repository, label: t('settings.plugins.details.repository') } : null,
 ].filter((link): link is { href: string; label: string } => link !== null);

 return (
  <div className="flex min-w-0 flex-col gap-2 py-3 @xl:flex-row @xl:items-start @xl:gap-4">
   <div className="min-w-0 flex-1 break-words">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
     <span className="max-w-full truncate typography-ui-label text-foreground" title={entry.name}>{entry.name}</span>
     <span className="max-w-full shrink-0 truncate font-mono typography-micro text-muted-foreground" title={entry.version ?? undefined}>{entry.version ?? '—'}</span>
     <span className="oc-tile-inset max-w-full shrink-0 truncate rounded-full px-2 py-px text-[0.625rem] font-medium" title={entry.marketplace}>{entry.marketplace}</span>
    </div>
    {entry.description ? <p className="line-clamp-2 typography-micro text-muted-foreground">{entry.description}</p> : null}
    {details?.author ? (
     <p className="typography-micro text-muted-foreground">
      {t('settings.plugins.details.author')}
      {': '}
      {details.author.name}
     </p>
    ) : null}
    {badges.length > 0 ? (
     <div className="mt-1 flex flex-wrap gap-1">
      {badges.slice(0, 6).map(badge => (
       <span key={badge} className="oc-tile-inset max-w-full truncate rounded-full px-2 py-px text-[0.625rem] text-muted-foreground">{badge}</span>
      ))}
     </div>
    ) : null}
    {links.length > 0 ? (
     <div className="mt-1 flex flex-wrap items-center gap-3">
      {links.map(link => (
       <a
        key={link.href}
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 typography-micro text-[var(--status-info)] hover:underline"
       >
        <Icon name="external-link" className="size-3" />
        {link.label}
       </a>
      ))}
     </div>
    ) : null}
   </div>
   <Button
    variant={installed ? 'ghost' : 'outline'}
    size="sm"
    className="max-w-full shrink-0 self-start whitespace-normal break-words"
    disabled={disabled || installed}
    onClick={onInstall}
   >
    {installed ? t('settings.plugins.status.enabled') : t('settings.plugins.action.install')}
   </Button>
  </div>
 );
};

export const AddPluginDialog: React.FC<AddPluginDialogProps> = ({ open, onOpenChange }) => {
 const { t } = useI18n();
 const catalog = usePluginsStore(state => state.catalog);
 const [tab, setTab] = React.useState<TabKey>('marketplace');
 const [spec, setSpec] = React.useState('');
 const [fileName, setFileName] = React.useState('');
 const [content, setContent] = React.useState('');
 const [query, setQuery] = React.useState('');
 const [scope, setScope] = React.useState<'user' | 'project'>('user');
 const [submitting, setSubmitting] = React.useState<string | null>(null);
 const [sourcesOpen, setSourcesOpen] = React.useState(false);
 const [error, setError] = React.useState<string | null>(null);

 const resetForm = React.useCallback(() => {
  setSpec('');
  setFileName('');
  setContent('');
  setQuery('');
  setError(null);
 }, []);

 React.useEffect(() => {
  if (!open) return;
  setTab('marketplace');
  resetForm();
  void usePluginsStore.getState().loadMarketplace().catch(() => undefined);
 }, [open, resetForm]);

 const handleTabChange = (next: TabKey) => {
  if (next === tab) return;
  setTab(next);
  resetForm();
 };

 const trimmedFileName = fileName.trim();
 const fileNameInvalid = tab === 'local' && trimmedFileName !== '' && !LocalExtensionIdSchema.safeParse(trimmedFileName).success;
 const specEmpty = tab === 'package' && spec.trim() === '';
 const contentEmpty = tab === 'local' && content.trim() === '';

 const marketplaceEntries = React.useMemo(
  () => rankByQuery(catalog?.marketplace ?? [], query, entry => [
   entry.name, entry.description, entry.marketplace,
   entry.details?.category ?? '', ...(entry.details?.keywords ?? []), entry.details?.author?.name ?? '',
  ]),
  [catalog, query],
 );
 const installedIds = React.useMemo(() => new Set((catalog?.plugins ?? []).flatMap(plugin => (
  plugin.target.kind === 'marketplace' ? [`${plugin.target.name}@${plugin.target.marketplace}`] : [])),
 ), [catalog]);

 const submitDisabled =
  submitting !== null
  || (tab === 'package' && specEmpty)
  || (tab === 'local' && (trimmedFileName === '' || fileNameInvalid || contentEmpty));

 const handleSubmit = async () => {
  if (submitDisabled) return;
  setSubmitting('form');
  setError(null);
  try {
   const store = usePluginsStore.getState();
   if (tab === 'package') await store.installPlugin({ kind: 'package', spec: spec.trim() });
   else await store.writeLocalExtension(trimmedFileName, content);
   toast.success(t('settings.plugins.toast.created'));
   onOpenChange(false);
  } catch (failure) {
   const message = failure instanceof CanonicalApiError ? failure.message : t('settings.plugins.error.operation');
   setError(message);
   toast.error(message);
  } finally {
   setSubmitting(null);
  }
 };

 const installMarketplaceEntry = async (entry: MarketplaceEntry) => {
  const key = `${entry.name}@${entry.marketplace}`;
  setSubmitting(key);
  setError(null);
  try {
   await usePluginsStore.getState().installPlugin({
    kind: 'marketplace', name: entry.name, marketplace: entry.marketplace, scope,
   });
   toast.success(t('settings.plugins.marketplace.toast.installed', { name: entry.name }));
  } catch (failure) {
   const message = failure instanceof CanonicalApiError ? failure.message : t('settings.plugins.error.operation');
   setError(message);
   toast.error(message);
  } finally {
   setSubmitting(null);
  }
 };

 const tabs = React.useMemo<SortableTabsStripItem[]>(() => [
  { id: 'marketplace', label: t('settings.plugins.marketplace.title') },
  { id: 'package', label: t('settings.plugins.sidebar.kind.package') },
  { id: 'local', label: t('settings.plugins.local.title') },
 ], [t]);

 return (
  <>
   <Dialog
    open={open}
    onOpenChange={(next) => {
     if (!next && submitting !== null) return;
     onOpenChange(next);
    }}
   >
    <DialogContent className="max-w-2xl">
     <DialogHeader>
      <DialogTitle>{t('settings.plugins.dialog.add.title')}</DialogTitle>
      <DialogDescription>{t('settings.plugins.grid.description')}</DialogDescription>
     </DialogHeader>

     <SortableTabsStrip
      items={tabs}
      activeId={tab}
      onSelect={(id) => {
       if (id === 'marketplace' || id === 'package' || id === 'local') handleTabChange(id);
      }}
      layoutMode="fit"
      variant="active-pill"
      activePillLowercase={false}
      className="h-10"
     />

     <div className="flex flex-col gap-4">
      {tab === 'marketplace' ? (
       <>
        <div className="flex flex-wrap items-center gap-2">
         <div className="relative min-w-0 flex-1">
          <Icon
           name="search"
           className="pointer-events-none absolute inset-s-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
           aria-hidden
          />
          <Input
           value={query}
           onChange={event => setQuery(event.target.value)}
           placeholder={t('settings.plugins.grid.searchPlaceholder')}
           aria-label={t('settings.plugins.grid.searchPlaceholder')}
           className="ps-8"
          />
         </div>
         <Select
          value={scope}
          onValueChange={value => {
           if (value === 'user' || value === 'project') setScope(value);
          }}
         >
          <SelectTrigger className={SETTINGS_SELECT_TRIGGER_CLASS} aria-label={t('settings.plugins.page.field.scope')}>
           <SelectValue>
            {scope === 'user' ? t('settings.plugins.scope.user') : t('settings.plugins.scope.project')}
           </SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
           <SelectItem value="user">{t('settings.plugins.scope.user')}</SelectItem>
           <SelectItem value="project">{t('settings.plugins.scope.project')}</SelectItem>
          </SelectContent>
         </Select>
         <Button
          variant="ghost"
          size="sm"
          onClick={() => setSourcesOpen(true)}
         >
          <Icon name="settings-3" className="size-3.5" />
          {t('settings.plugins.marketplace.sourcesButton')}
         </Button>
        </div>

        {(catalog?.marketplaceSources.length ?? 0) > 0 ? (
         <div className="flex flex-wrap items-center gap-2">
          {catalog?.marketplaceSources.map(source => (
           <span key={source.name} className="flex items-center gap-1.5">
            <SourceTypeChip sourceType={source.sourceType} />
            <span className="typography-micro text-muted-foreground">{source.name}</span>
           </span>
          ))}
         </div>
        ) : null}

        {(catalog?.marketplace.length ?? 0) === 0 ? (
         <p className="py-2 typography-meta text-muted-foreground">{t('settings.plugins.marketplace.sources.empty')}</p>
        ) : marketplaceEntries.length === 0 ? (
         <p className="py-2 typography-meta text-muted-foreground">
          {t('settings.plugins.grid.noMatches', { query: query.trim() })}
         </p>
        ) : (
         <div className="max-h-[48vh] overflow-y-auto divide-y divide-[var(--surface-subtle)]">
          {marketplaceEntries.map(entry => (
           <MarketplaceRow
            key={`${entry.marketplace}:${entry.name}`}
            entry={entry}
            installed={installedIds.has(`${entry.name}@${entry.marketplace}`)}
            disabled={submitting !== null}
            onInstall={() => void installMarketplaceEntry(entry)}
           />
          ))}
         </div>
        )}
       </>
      ) : null}

      {tab === 'package' ? (
       <SettingsStackedField
        settingsItem="plugins.spec"
        label={t('settings.plugins.page.field.spec')}
        controlClassName="w-full max-w-none"
        description={specEmpty ? t('settings.plugins.validation.specRequired') : t('settings.plugins.scope.global')}
        descriptionPlacement="after"
       >
        <Input
         id="plugin-spec"
         value={spec}
         onChange={(event) => setSpec(event.target.value)}
         placeholder={t('settings.plugins.page.field.spec.placeholder')}
         aria-label={t('settings.plugins.page.field.spec')}
         disabled={submitting !== null}
        />
       </SettingsStackedField>
      ) : null}

      {tab === 'local' ? (
       <>
        <SettingsStackedField
         settingsItem="plugins.fileName"
         label={t('settings.plugins.page.field.fileName')}
         controlClassName="w-full max-w-none"
         description={fileNameInvalid ? (
          t('settings.plugins.validation.fileNameNative')
         ) : (
          <span className="font-mono">.omp/extensions/{trimmedFileName}</span>
         )}
         descriptionPlacement="after"
        >
         <Input
          id="plugin-filename"
          value={fileName}
          onChange={(event) => setFileName(event.target.value)}
          placeholder="my-extension.ts"
          aria-label={t('settings.plugins.page.field.fileName')}
          aria-invalid={fileNameInvalid || undefined}
          disabled={submitting !== null}
         />
        </SettingsStackedField>

        <SettingsStackedField
         settingsItem="plugins.content"
         label={t('settings.plugins.page.field.content')}
         controlClassName="w-full max-w-none"
        >
         <Textarea
          id="plugin-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={16}
          className="font-mono w-full"
          aria-label={t('settings.plugins.page.field.content')}
          disabled={submitting !== null}
         />
        </SettingsStackedField>
       </>
      ) : null}

      {error ? <p role="alert" className="typography-meta text-[var(--status-error)]">{error}</p> : null}
     </div>

     <DialogFooter>
      <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting !== null}>
       {t('settings.plugins.dialog.add.action.cancel')}
      </Button>
      <Button
       size="sm"
       className={cn(tab === 'marketplace' && 'hidden')}
       onClick={() => void handleSubmit()}
       disabled={submitDisabled}
      >
       {submitting === 'form' ? <Icon name="loader-4" className="size-3.5 animate-spin" /> : null}
       {t('settings.plugins.dialog.add.action.submit')}
      </Button>
     </DialogFooter>
    </DialogContent>
   </Dialog>
   <MarketplaceSourcesDialog open={sourcesOpen && open} onOpenChange={setSourcesOpen} />
  </>
 );
};
