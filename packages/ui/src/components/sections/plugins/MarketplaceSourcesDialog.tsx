import React from 'react';
import type { MarketplaceSource, MarketplaceSourceFailure, PluginMutationResult } from '@openchamber/agent-contract';
import { CanonicalApiError } from '@/api/canonicalClient';
import { formatMarketplaceFailure, formatMarketplaceProblemLines } from './marketplaceError';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icon/Icon';
import { toast } from '@/components/ui';
import { SettingsFieldRow } from '@/components/sections/shared/SettingsSection';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { usePluginsStore } from '@/stores/usePluginsStore';

const SOURCE_TYPE_LABEL = {
 github: 'settings.plugins.marketplace.source.github',
 git: 'settings.plugins.marketplace.source.git',
 url: 'settings.plugins.marketplace.source.url',
 local: 'settings.plugins.marketplace.source.local',
} as const satisfies Record<MarketplaceSource['sourceType'], string>;

const EMPTY_SOURCES: MarketplaceSource[] = [];
const EMPTY_FAILURES: Record<string, MarketplaceSourceFailure> = {};

/**
 * Catalog sources are user-scoped native registries. Adding or refreshing one
 * fetches over the network, so every action here is an explicit user command.
 */
export const MarketplaceSourcesDialog: React.FC<{
 open: boolean;
 onOpenChange: (open: boolean) => void;
}> = ({ open, onOpenChange }) => {
 const { t } = useI18n();
 const sources = usePluginsStore(state => state.catalog?.marketplaceSources) ?? EMPTY_SOURCES;
 const marketplaceFailures = usePluginsStore(state => state.marketplaceFailures) ?? EMPTY_FAILURES;
 const [source, setSource] = React.useState('');
 const [pending, setPending] = React.useState(false);
 const [refreshing, setRefreshing] = React.useState<string | null>(null);
 const [errorLines, setErrorLines] = React.useState<string[]>([]);

 React.useEffect(() => {
  if (open) return;
  setSource('');
 setErrorLines([]);
  setPending(false);
  setRefreshing(null);
 }, [open]);

 const perform = async (action: () => Promise<PluginMutationResult>, success: string) => {
  setPending(true);
  setErrorLines([]);
  try {
   await action();
   toast.success(success);
  } catch (failure) {
   setErrorLines(formatMarketplaceProblemLines(failure instanceof CanonicalApiError ? failure.problem : null, t));
  } finally {
   setPending(false);
  }
 };

 const add = () => {
  const trimmed = source.trim();
  if (trimmed === '' || pending) return;
  void perform(async () => {
   const result = await usePluginsStore.getState().addMarketplaceSource(trimmed);
   setSource('');
   return result;
  }, t('settings.plugins.marketplace.sources.added'));
 };

 const remove = (name: string) => {
  void perform(() => usePluginsStore.getState().removeMarketplaceSource(name),
   t('settings.plugins.marketplace.sources.removed'));
 };

 const refresh = async (name?: string) => {
  setRefreshing(name ?? '*');
  try {
   await perform(() => usePluginsStore.getState().updateMarketplaceSource(name),
    t('settings.plugins.marketplace.sources.refreshed'));
  } finally {
   setRefreshing(null);
  }
 };

 return (
  <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next); }}>
   <DialogContent className="max-w-lg">
    <DialogHeader>
     <DialogTitle>{t('settings.plugins.marketplace.sources.title')}</DialogTitle>
     <DialogDescription>{t('settings.plugins.marketplace.sources.description')}</DialogDescription>
    </DialogHeader>

    <div className="space-y-4">
     <div className="flex items-center gap-2">
      <Input
       value={source}
       onChange={event => setSource(event.target.value)}
       placeholder={t('settings.plugins.marketplace.sources.placeholder')}
       aria-label={t('settings.plugins.marketplace.sources.placeholder')}
       disabled={pending}
       onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); add(); } }}
      />
      <Button size="sm" onClick={add} disabled={pending || source.trim() === ''}>
       {pending ? <Icon name="loader-4" className="size-3.5 animate-spin" /> : null}
       {t('settings.plugins.marketplace.sources.add')}
      </Button>
     </div>

     {sources.length === 0 ? (
      <p className="typography-meta text-muted-foreground">{t('settings.plugins.marketplace.sources.empty')}</p>
     ) : (
      <>
       <SettingsFieldRow label={t('settings.plugins.marketplace.sources.refreshAll')}>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => void refresh()}>
         <Icon name="refresh" className={cn('size-3.5', refreshing === '*' && 'animate-spin')} />
         {t('settings.plugins.action.refresh')}
        </Button>
       </SettingsFieldRow>
       <div className="divide-y divide-[var(--surface-subtle)]">
       {sources.map(item => {
        const itemFailure = marketplaceFailures[item.name];
        return (
        <div key={item.name} className="flex min-w-0 flex-col gap-2 py-2 @xl:flex-row @xl:items-center @xl:gap-4">
         <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
           <span className="truncate typography-ui-label text-foreground">{item.name}</span>
           <span className="oc-tile-inset shrink-0 rounded-full px-2 py-px text-[0.625rem] font-medium">
            {t(SOURCE_TYPE_LABEL[item.sourceType])}
           </span>
          </div>
          <p className="truncate font-mono typography-micro text-muted-foreground" title={item.sourceUri}>{item.sourceUri}</p>
          {itemFailure ? (
           <p className="mt-1 typography-micro text-[var(--status-error)]">
            {formatMarketplaceFailure(itemFailure, t)}
           </p>
          ) : null}
         </div>
          <div className="flex shrink-0 items-center gap-1">
           <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            disabled={pending}
            onClick={() => void refresh(item.name)}
            aria-label={t('settings.plugins.marketplace.sources.refresh')}
            title={t('settings.plugins.marketplace.sources.refresh')}
           >
            <Icon name="refresh" className={cn('size-3.5', refreshing === item.name && 'animate-spin')} />
           </Button>
           <Button
            variant="ghost"
            size="icon"
            className="size-7 text-[var(--status-error)]"
            disabled={pending}
            onClick={() => remove(item.name)}
            aria-label={t('settings.plugins.marketplace.sources.remove')}
            title={t('settings.plugins.marketplace.sources.remove')}
           >
            <Icon name="delete-bin" className="size-3.5" />
           </Button>
          </div>
        </div>
        );
       })}
      </div>
     </>
    )}

    {errorLines.length > 0 ? (
     <div role="alert" className="space-y-1 typography-meta text-[var(--status-error)]">
      {errorLines.map((line, index) => (
       <p key={index}>{line}</p>
      ))}
     </div>
    ) : null}
    </div>

    <DialogFooter>
     <Button size="sm" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
      {t('settings.plugins.details.close')}
     </Button>
    </DialogFooter>
   </DialogContent>
  </Dialog>
 );
};
