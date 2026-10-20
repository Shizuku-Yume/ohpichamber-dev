import React from 'react';
import type { InstalledPluginEntry, LocalExtensionEntry, PluginCatalogState } from '@openchamber/agent-contract';
import { useI18n } from '@/lib/i18n';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { SETTINGS_CARD_GRID_CLASS, SettingsAddCard, SettingsCard, SettingsCardChip, SettingsCardIcon, SettingsCardPill, SettingsCardSearch } from '@/components/sections/shared/SettingsCards';

export type PluginSelection = { kind: 'plugin'; id: string } | { kind: 'local'; extensionId: string };
export type PluginDeleteTarget = { kind: 'plugin'; plugin: InstalledPluginEntry } | { kind: 'local'; extension: LocalExtensionEntry };
type GridItem = { kind: 'plugin'; plugin: InstalledPluginEntry } | { kind: 'local'; extension: LocalExtensionEntry };

export const PluginsGrid: React.FC<{
  catalog: PluginCatalogState;
  onAdd: () => void;
  onSelect: (selection: PluginSelection) => void;
  onDelete: (target: PluginDeleteTarget) => void;
}> = ({ catalog, onAdd, onSelect, onDelete }) => {
  const { t } = useI18n();
  const [query, setQuery] = React.useState('');
  const items: GridItem[] = [
    ...catalog.plugins.map((plugin): GridItem => ({ kind: 'plugin', plugin })),
    ...catalog.localExtensions.map((extension): GridItem => ({ kind: 'local', extension })),
  ];
  const filtered = rankByQuery(items, query, item => item.kind === 'plugin'
    ? [item.plugin.name, item.plugin.description] : [item.extension.extensionId, item.extension.relativePath]);
  return (
    <div className="space-y-4">
      {items.length ? <SettingsCardSearch value={query} onChange={setQuery} placeholder={t('settings.plugins.grid.searchPlaceholder')} /> : null}
      {items.length === 0 ? <p className="typography-meta text-muted-foreground">{t('settings.plugins.grid.empty')}</p> : null}
      {items.length > 0 && filtered.length === 0 ? <p className="typography-meta text-muted-foreground">{t('settings.plugins.grid.noMatches', { query })}</p> : null}
      <div className={SETTINGS_CARD_GRID_CLASS}>
        <SettingsAddCard label={t('settings.plugins.sidebar.actions.addTitle')} onClick={onAdd} settingsItem="plugins.create" />
        {filtered.map(item => item.kind === 'plugin' ? (
          <SettingsCard key={item.plugin.id} icon={<SettingsCardIcon name="code-box" />} title={item.plugin.name}
            badges={<SettingsCardPill tone={item.plugin.enabled ? 'success' : 'neutral'}>{t(item.plugin.enabled ? 'settings.plugins.status.enabled' : 'settings.plugins.status.disabled')}</SettingsCardPill>}
            footer={<><span>{item.plugin.version}</span><SettingsCardChip>{t(item.plugin.scope === 'global' ? 'settings.plugins.scope.global' : 'settings.plugins.scope.workspace')}</SettingsCardChip></>}
            onOpen={() => onSelect({ kind: 'plugin', id: item.plugin.id })}
            actionsLabel={t('settings.plugins.grid.actionsAria', { name: item.plugin.name })}
            actions={[{ label: t('settings.plugins.action.uninstall'), icon: 'delete-bin', destructive: true, onSelect: () => onDelete(item) }]}
          />
        ) : (
          <SettingsCard key={item.extension.extensionId} icon={<SettingsCardIcon name="file-text" />} title={item.extension.extensionId}
            footer={<SettingsCardChip>{t('settings.plugins.local.title')}</SettingsCardChip>}
            onOpen={() => onSelect({ kind: 'local', extensionId: item.extension.extensionId })}
            actionsLabel={t('settings.plugins.grid.actionsAria', { name: item.extension.extensionId })}
            actions={[{ label: t('settings.common.actions.delete'), icon: 'delete-bin', destructive: true, onSelect: () => onDelete(item) }]}
          />
        ))}
      </div>
    </div>
  );
};
