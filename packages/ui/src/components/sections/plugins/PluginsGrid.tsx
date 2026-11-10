import React from 'react';
import type { InstalledPluginEntry, LocalExtensionEntry, PluginCatalogState, PluginUpdateCheckEntry } from '@openchamber/agent-contract';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import {
 SETTINGS_CARD_GRID_CLASS,
 SettingsAddCard,
 SettingsCard,
 SettingsCardChip,
 SettingsCardIcon,
 SettingsCardPill,
 SettingsCardSearch,
} from '@/components/sections/shared/SettingsCards';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { useI18n } from '@/lib/i18n';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';

export type PluginSelection = { kind: 'plugin'; id: string } | { kind: 'local'; extensionId: string };
export type PluginDeleteTarget = { kind: 'plugin'; plugin: InstalledPluginEntry } | { kind: 'local'; extension: LocalExtensionEntry };
type GridItem = { kind: 'plugin'; plugin: InstalledPluginEntry } | { kind: 'local'; extension: LocalExtensionEntry };

/**
 * Runtime is published per worker for the whole plugin catalog, never per
 * package, so a card can only report the workspace publication it shares.
 */
const WorkspaceRuntimePill: React.FC<{ catalog: PluginCatalogState }> = ({ catalog }) => {
 const { t } = useI18n();
 if (catalog.workers.length === 0) return null;
 if (catalog.workers.some(worker => worker.status === 'unavailable' || worker.error !== null)) {
  return <SettingsCardPill tone="error">{t('settings.plugins.status.unavailable')}</SettingsCardPill>;
 }
 if (catalog.workers.every(worker => worker.appliedRevision === catalog.revision)) {
  return <SettingsCardPill tone="success">{t('settings.plugins.apply.applied')}</SettingsCardPill>;
 }
 return <SettingsCardPill tone="neutral">{t('settings.plugins.status.ready')}</SettingsCardPill>;
};

/** Native scopes (`user`/`project`) and contract scopes (`global`/`workspace`) name the same install. */
// oxlint-disable-next-line react/only-export-components
export const pluginUpdateFor = (
 updates: readonly PluginUpdateCheckEntry[],
 plugin: InstalledPluginEntry,
): PluginUpdateCheckEntry | undefined => {
 if (plugin.target.kind !== 'marketplace') return undefined;
 const target = plugin.target;
 const nativeScope = plugin.scope === 'global' ? 'user' : 'project';
 return updates.find((update): update is PluginUpdateCheckEntry => update.target.kind === 'marketplace'
  && update.target.name === target.name && update.target.marketplace === target.marketplace
  && update.target.scope === nativeScope);
};

/** Browse view of the Plugins page: native plugins and local extensions as cards. */
export const PluginsGrid: React.FC<{
 catalog: PluginCatalogState;
 refreshing: boolean;
 upgradingAll: boolean;
 onRefresh: () => void;
 onAdd: () => void;
 onSelect: (selection: PluginSelection) => void;
 onDelete: (target: PluginDeleteTarget) => void;
 onUpdate: (plugin: InstalledPluginEntry) => void;
 onUpgradeAll: () => void;
 /** Operations and marketplace results surfaced above the card grid. */
 notices?: React.ReactNode;
 children?: React.ReactNode;
}> = ({ catalog, refreshing, upgradingAll, onRefresh, onAdd, onSelect, onDelete, onUpdate, onUpgradeAll, notices, children }) => {
 const { t } = useI18n();
 const [query, setQuery] = React.useState('');
 const items: GridItem[] = [
  ...catalog.plugins.map((plugin): GridItem => ({ kind: 'plugin', plugin })),
  ...catalog.localExtensions.map((extension): GridItem => ({ kind: 'local', extension })),
 ];
 const filtered = rankByQuery(items, query, item => item.kind === 'plugin'
  ? [item.plugin.name, item.plugin.description, item.plugin.target.name]
  : [item.extension.extensionId, item.extension.relativePath]);
 const hasQuery = query.trim().length > 0;
 const runtimeUnavailable = catalog.workers.some(worker => worker.status === 'unavailable');
 const updates = catalog.availableUpdates;

 return (
  <SettingsPageLayout
   title={t('settings.page.plugins.title')}
   description={t('settings.plugins.grid.description')}
   headerEnd={(
    <div className="flex items-center gap-2">
     {runtimeUnavailable ? (
      <span className="inline-flex items-center gap-1 typography-meta text-muted-foreground">
       <Icon name="question" className="size-3.5" />
       {t('settings.plugins.status.sidebar.unavailable')}
      </span>
     ) : null}
     {updates.length > 0 ? (
      <Button variant="outline" size="sm" onClick={onUpgradeAll} disabled={upgradingAll || refreshing}>
       <Icon name="refresh" className={cn('size-3.5', upgradingAll && 'animate-spin')} />
       {upgradingAll ? t('settings.plugins.upgradeAll.running') : t('settings.plugins.action.upgradeAll')}
      </Button>
     ) : null}
     <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 shrink-0 text-muted-foreground"
      onClick={onRefresh}
      disabled={refreshing}
      aria-label={t('settings.plugins.action.refresh')}
      title={t('settings.plugins.action.refresh')}
     >
      <Icon name="refresh" className={cn('size-4', refreshing && 'animate-spin')} />
     </Button>
    </div>
   )}
  >
   {notices}

   {items.length > 0 ? (
    <SettingsCardSearch value={query} onChange={setQuery} placeholder={t('settings.plugins.grid.searchPlaceholder')} />
   ) : null}

   {items.length === 0 ? (
    <p className="py-6 typography-meta text-muted-foreground">{t('settings.plugins.grid.empty')}</p>
   ) : filtered.length === 0 ? (
    <p className="py-6 typography-meta text-muted-foreground">{t('settings.plugins.grid.noMatches', { query: query.trim() })}</p>
   ) : null}

   <div className={SETTINGS_CARD_GRID_CLASS}>
    {hasQuery ? null : (
     <SettingsAddCard
      label={t('settings.plugins.sidebar.actions.addTitle')}
      hint={t('settings.plugins.grid.addHint')}
      onClick={onAdd}
      settingsItem="plugins.create"
     />
    )}
    {filtered.map((item) => {
     if (item.kind === 'plugin') {
      const { plugin } = item;
      const update = pluginUpdateFor(updates, plugin);
      return (
       <SettingsCard
        key={plugin.id}
        icon={<SettingsCardIcon name={plugin.target.kind === 'package' ? 'code-box' : 'folder'} />}
        title={plugin.name}
        subtitle={plugin.target.kind === 'marketplace' ? plugin.target.marketplace : undefined}
        description={plugin.description || undefined}
        muted={!plugin.enabled}
        badges={(
         <>
          {update ? (
           <SettingsCardPill tone="info">
            {t('settings.plugins.update.badge', { from: update.from, to: update.to })}
           </SettingsCardPill>
          ) : null}
          <SettingsCardPill tone={plugin.enabled ? 'success' : 'neutral'}>
           {t(plugin.enabled ? 'settings.plugins.status.enabled' : 'settings.plugins.status.disabled')}
          </SettingsCardPill>
          <WorkspaceRuntimePill catalog={catalog} />
         </>
        )}
        footer={(
         <>
          <span>{plugin.version || '—'}</span>
          <SettingsCardChip>
           {t(plugin.scope === 'workspace' ? 'settings.plugins.scope.workspace' : 'settings.plugins.scope.global')}
          </SettingsCardChip>
         </>
        )}
        onOpen={() => onSelect({ kind: 'plugin', id: plugin.id })}
        actionsLabel={t('settings.plugins.grid.actionsAria', { name: plugin.name })}
        actions={[
         ...(update ? [{
          label: t('settings.plugins.action.update'), icon: 'refresh' as const,
          onSelect: () => onUpdate(plugin)
         }] : []),
         {
          label: t('settings.plugins.action.uninstall'),
          icon: 'delete-bin',
          destructive: true,
          onSelect: () => onDelete({ kind: 'plugin', plugin }),
         },
        ]}
       />
      );
     }
     const { extension } = item;
     return (
      <SettingsCard
       key={extension.extensionId}
       icon={<SettingsCardIcon name="file-text" />}
       title={extension.extensionId}
       subtitle={extension.relativePath}
       footer={(
        <>
         <span>{t('settings.plugins.local.title')}</span>
         <SettingsCardChip>{t('settings.plugins.scope.workspace')}</SettingsCardChip>
        </>
       )}
       onOpen={() => onSelect({ kind: 'local', extensionId: extension.extensionId })}
       actionsLabel={t('settings.plugins.grid.actionsAria', { name: extension.extensionId })}
       actions={[{
        label: t('settings.common.actions.delete'),
        icon: 'delete-bin',
        destructive: true,
        onSelect: () => onDelete({ kind: 'local', extension }),
       }]}
      />
     );
    })}
   </div>

   {children}
  </SettingsPageLayout>
 );
};
