import React from 'react';
import { Button } from '@/components/ui/button';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import { SETTINGS_CARD_GRID_CLASS, SettingsAddCard, SettingsCard, SettingsCardIcon, SettingsCardPill, SettingsCardSearch } from '@/components/sections/shared/SettingsCards';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { createMcpDraft, resolveMcpDirectory, selectMcpServersForDirectory, useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { getMcpServerStatus, useMcpStore } from '@/stores/useMcpStore';

export const McpGrid: React.FC = () => {
  const { t } = useI18n();
  const directory = useSettingsDirectory();
  const servers = useMcpConfigStore(state => selectMcpServersForDirectory(state, directory));
  const error = useMcpConfigStore(state => state.errorsByDirectory[directory ? resolveMcpDirectory(directory) : '']);
  const statuses = useMcpStore(state => state.getStatusForDirectory(directory));
  const statusError = useMcpStore(state => state.getErrorForDirectory(directory));
  const [query, setQuery] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [mutationError, setMutationError] = React.useState<string | null>(null);
  React.useEffect(() => {
    void useMcpConfigStore.getState().loadMcpConfigs({ directory });
    void useMcpStore.getState().refresh({ directory, silent: true });
  }, [directory]);
  const filtered = rankByQuery([...servers], query, server => [server.label, server.serverId, server.transport.type === 'stdio' ? [server.transport.command, ...server.transport.args].join(' ') : server.transport.url]);
  return <SettingsPageLayout title={t('settings.page.mcp.title')} description={t('settings.mcp.grid.description')} headerEnd={<>
    <SettingsProjectSelector />
    <Button disabled={busy} onClick={() => {
      setBusy(true);
      void Promise.all([useMcpConfigStore.getState().loadMcpConfigs({ directory }), useMcpStore.getState().refresh({ directory })]).finally(() => setBusy(false));
    }}>{t('settings.mcp.sidebar.actions.refreshStatusTitle')}</Button>
  </>}>
    {(error || statusError || mutationError) && <p role="alert" className="text-status-error">{error || statusError || mutationError}</p>}
    <SettingsCardSearch value={query} onChange={setQuery} placeholder={t('settings.mcp.grid.searchPlaceholder')} />
    <div className={SETTINGS_CARD_GRID_CLASS}>
      <SettingsAddCard label={t('settings.mcp.sidebar.actions.addServerTitle')} onClick={() => {
        let serverId = 'new-mcp-server'; let suffix = 1;
        while (servers.some(server => server.serverId === serverId)) serverId = `new-mcp-server-${suffix++}`;
        useMcpConfigStore.getState().setMcpDraft(createMcpDraft(serverId));
        useMcpConfigStore.getState().setSelectedMcp(serverId);
      }} settingsItem="mcp.create" />
      {filtered.map(server => <SettingsCard key={server.serverId} title={server.label}
        icon={<SettingsCardIcon name={server.transport.type === 'stdio' ? 'server' : 'global'} />}
        subtitle={server.transport.type === 'stdio' ? [server.transport.command, ...server.transport.args].join(' ') : server.transport.url}
        badges={<SettingsCardPill tone={getMcpServerStatus(statuses[server.serverId]) === 'unavailable' ? 'error' : 'neutral'}>{!server.enabled ? t('settings.mcp.grid.status.disabled') : getMcpServerStatus(statuses[server.serverId]) === 'ready' ? t('settings.mcp.page.status.label.connected') : t('settings.mcp.grid.status.pending')}</SettingsCardPill>}
        muted={!server.enabled} onOpen={() => { useMcpConfigStore.getState().setMcpDraft(null); useMcpConfigStore.getState().setSelectedMcp(server.serverId); }}
        actionsLabel={t('settings.mcp.grid.actionsAria', { name: server.label })}
        actions={[{ label: t('settings.common.actions.delete'), icon: 'delete-bin', destructive: true, onSelect: () => setDeleteTarget(server.serverId) }]} />)}
    </div>
    {!servers.length && !error && <p>{t('settings.mcp.grid.empty')}</p>}
    {deleteTarget && <section role="alertdialog" aria-label={t('settings.mcp.page.deleteDialog.title', { name: deleteTarget })}>
      <p>{t('settings.mcp.page.deleteDialog.title', { name: deleteTarget })}</p>
      <Button disabled={busy} onClick={() => setDeleteTarget(null)}>{t('settings.common.actions.cancel')}</Button>
      <Button disabled={busy} variant="destructive" onClick={() => {
        setBusy(true);
        void useMcpConfigStore.getState().deleteMcp(deleteTarget, directory).then(result => {
          if (!result.ok) setMutationError(result.error);
          if (result.result) setDeleteTarget(null);
        }).finally(() => setBusy(false));
      }}>{t('settings.common.actions.delete')}</Button>
    </section>}
  </SettingsPageLayout>;
};
