import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui';
import { Icon } from '@/components/icon/Icon';
import { SettingsPageLayout } from '@/components/sections/shared/SettingsPageLayout';
import { SettingsProjectSelector } from '@/components/sections/shared/SettingsProjectSelector';
import {
  SETTINGS_CARD_GRID_CLASS,
  SettingsAddCard,
  SettingsCard,
  SettingsCardIcon,
  SettingsCardPill,
  SettingsCardSearch,
  type SettingsCardTone,
} from '@/components/sections/shared/SettingsCards';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';
import { createMcpDraft, selectMcpServersForDirectory, useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { getMcpServerStatus, useMcpStore } from '@/stores/useMcpStore';

const nextServerId = (existing: readonly { serverId: string }[]): string => {
  const baseName = 'new-mcp-server';
  let name = baseName;
  let counter = 1;
  while (existing.some((server) => server.serverId === name)) {
    name = `${baseName}-${counter}`;
    counter += 1;
  }
  return name;
};

type McpRuntimeStatus = 'ready' | 'unavailable' | 'disabled' | 'unapplied';

const StatusPill: React.FC<{
  status: McpRuntimeStatus;
  enabled: boolean;
}> = ({ status, enabled }) => {
  const { t } = useI18n();
  if (!enabled) return <SettingsCardPill tone="neutral">{t('settings.mcp.grid.status.disabled')}</SettingsCardPill>;
  const pill: { tone: SettingsCardTone; label: string } = status === 'ready'
    ? { tone: 'success', label: t('settings.mcp.page.status.label.connected') }
    : status === 'unavailable'
      ? { tone: 'error', label: t('settings.mcp.page.status.label.failed') }
      : { tone: 'neutral', label: t('settings.mcp.grid.status.pending') };
  return <SettingsCardPill tone={pill.tone}>{pill.label}</SettingsCardPill>;
};

const transportTarget = (transport: { type: 'stdio'; command: string; args: string[] } | { type: 'http' | 'sse'; url: string }): string =>
  transport.type === 'stdio' ? [transport.command, ...transport.args].join(' ') : transport.url;

/** Browse view of the MCP page: one card per configured server with its live status. */
export const McpGrid: React.FC = () => {
  const { t } = useI18n();
  const settingsDirectory = useSettingsDirectory();
  const setSelectedMcp = useMcpConfigStore((state) => state.setSelectedMcp);
  const setMcpDraft = useMcpConfigStore((state) => state.setMcpDraft);
  const loadMcpConfigs = useMcpConfigStore((state) => state.loadMcpConfigs);
  const deleteMcp = useMcpConfigStore((state) => state.deleteMcp);
  const [deleteTarget, setDeleteTarget] = React.useState<string | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const servers = useMcpConfigStore((state) => selectMcpServersForDirectory(state, settingsDirectory));
  const mcpStatus = useMcpStore((state) => state.getStatusForDirectory(settingsDirectory));
  const refreshStatus = useMcpStore((state) => state.refresh);
  const getErrorForDirectory = useMcpStore((state) => state.getErrorForDirectory);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [query, setQuery] = React.useState('');

  React.useEffect(() => {
    void loadMcpConfigs({ directory: settingsDirectory });
    void refreshStatus({ directory: settingsDirectory, silent: true });
  }, [loadMcpConfigs, refreshStatus, settingsDirectory]);

  const handleRefresh = () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    void Promise.all([
      loadMcpConfigs({ directory: settingsDirectory, force: true }),
      refreshStatus({ directory: settingsDirectory, silent: true }),
    ])
      .then(() => {
        const error = getErrorForDirectory(settingsDirectory);
        if (error) toast.error(error);
      })
      .finally(() => setIsRefreshing(false));
  };

  const handleCreate = () => {
    const serverId = nextServerId(servers);
    setMcpDraft(createMcpDraft(serverId));
    setSelectedMcp(serverId);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const result = await deleteMcp(deleteTarget, settingsDirectory);
      if (result.result) {
        setDeleteTarget(null);
        void refreshStatus({ directory: settingsDirectory, silent: true });
      }
      if (!result.ok) toast.error(result.error || t('settings.mcp.page.toast.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = rankByQuery([...servers], query, (server) => [
    server.label,
    server.serverId,
    transportTarget(server.transport),
  ]);
  const hasQuery = query.trim().length > 0;
  const deleteLabel = servers.find((server) => server.serverId === deleteTarget)?.label ?? deleteTarget ?? '';

  return (
    <SettingsPageLayout
      title={t('settings.page.mcp.title')}
      description={t('settings.mcp.grid.description')}
      headerEnd={(
        <div className="flex w-full items-center gap-2 @xl:w-auto">
          <SettingsProjectSelector className="min-w-0 flex-1 @xl:w-56 @xl:flex-none" />
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 text-muted-foreground"
            disabled={isRefreshing}
            onClick={handleRefresh}
            aria-label={t('settings.mcp.sidebar.actions.refreshStatusAria')}
            title={t('settings.mcp.sidebar.actions.refreshStatusTitle')}
          >
            <Icon name="refresh" className={cn('size-4', isRefreshing && 'animate-spin')} />
          </Button>
        </div>
      )}
    >
      {servers.length > 0 ? (
        <SettingsCardSearch value={query} onChange={setQuery} placeholder={t('settings.mcp.grid.searchPlaceholder')} />
      ) : null}

      {servers.length === 0 ? (
        <p className="py-6 typography-meta text-muted-foreground">{t('settings.mcp.grid.empty')}</p>
      ) : filtered.length === 0 ? (
        <p className="py-6 typography-meta text-muted-foreground">{t('settings.mcp.grid.noMatches', { query: query.trim() })}</p>
      ) : null}

      <div className={SETTINGS_CARD_GRID_CLASS}>
        {hasQuery ? null : (
          <SettingsAddCard
            label={t('settings.mcp.sidebar.actions.addServerTitle')}
            hint={t('settings.mcp.grid.addHint')}
            onClick={handleCreate}
            settingsItem="mcp.create"
          />
        )}
        {filtered.map((server) => {
          const status = getMcpServerStatus(mcpStatus[server.serverId]);
          const target = transportTarget(server.transport);
          const transportKey = server.transport.type === 'stdio'
            ? 'settings.mcp.sidebar.serverType.localTitle'
            : 'settings.mcp.sidebar.serverType.remoteTitle';
          return (
            <SettingsCard
              key={server.serverId}
              icon={<SettingsCardIcon name={server.transport.type === 'stdio' ? 'server' : 'global'} />}
              title={server.label}
              subtitle={target || undefined}
              badges={<StatusPill status={status} enabled={server.enabled} />}
              muted={!server.enabled}
              footer={<span>{t(transportKey)}</span>}
              onOpen={() => {
                setMcpDraft(null);
                setSelectedMcp(server.serverId);
              }}
              actionsLabel={t('settings.mcp.grid.actionsAria', { name: server.label })}
              actions={[{
                label: t('settings.common.actions.delete'),
                icon: 'delete-bin',
                destructive: true,
                onSelect: () => setDeleteTarget(server.serverId),
              }]}
            />
          );
        })}
      </div>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open && !isDeleting) setDeleteTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.mcp.page.deleteDialog.title', { name: deleteLabel })}</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={isDeleting}>
              {isDeleting ? t('settings.mcp.page.actions.deleting') : t('settings.common.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageLayout>
  );
};
