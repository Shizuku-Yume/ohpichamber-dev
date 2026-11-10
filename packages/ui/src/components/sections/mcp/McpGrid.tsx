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
  SettingsCardToolbar,
  type SettingsCardTone,
} from '@/components/sections/shared/SettingsCards';
import { useSettingsDirectory } from '@/hooks/useSettingsDirectory';
import { useI18n } from '@/lib/i18n';
import { rankByQuery } from '@/lib/search/fuzzySearch';
import { cn } from '@/lib/utils';
<<<<<<< HEAD
import { createMcpDraft, selectMcpServersForDirectory, useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { getMcpServerStatus, useMcpStore } from '@/stores/useMcpStore';
=======
import { hasLoadedMcpConfigsForDirectory, selectMcpServersForDirectory, useMcpConfigStore, type McpDraft } from '@/stores/useMcpConfigStore';
import { useMcpStore } from '@/stores/useMcpStore';
import type { McpServerStatus } from '@/lib/opencode/model';
import { useIntegrationPolicyBlock } from '@/components/sections/shared/useIntegrationPolicyBlock';
import { MCP_DRAFT_OAUTH_UNSET } from './mcpDraft';
>>>>>>> bc50ba56a

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
  managed?: boolean;
}> = ({ status, enabled, managed }) => {
  const { t } = useI18n();
  if (managed === false) {
    return (
      <div className="flex items-center gap-1">
        <SettingsCardPill tone="neutral">{t('settings.mcp.grid.status.readOnly')}</SettingsCardPill>
        {!enabled ? <SettingsCardPill tone="neutral">{t('settings.mcp.grid.status.disabled')}</SettingsCardPill> : null}
      </div>
    );
  }
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
<<<<<<< HEAD
=======
  // Runtime-only rows wait for the config catalog: before it is read, every
  // server the runtime reports would read as runtime-only, and a configured
  // server would flash as one while its config entry was still loading.
  const configsLoaded = useMcpConfigStore((state) => hasLoadedMcpConfigsForDirectory(state, settingsDirectory));
  const isBlocked = useIntegrationPolicyBlock(settingsDirectory);
>>>>>>> bc50ba56a
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

<<<<<<< HEAD
  const filtered = rankByQuery([...servers], query, (server) => [
    server.label,
    server.serverId,
    transportTarget(server.transport),
=======
  // OpenCode adds servers at runtime that live in no config file — the Console
  // MCP of a signed-in workspace. They still run, so the grid shows them as
  // read-only rows beside the configured ones (#5935).
  const configNames = new Set(servers.map((server) => server.name));
  const runtimeServers = configsLoaded
    ? Object.values(mcpStatus).filter((server) => !configNames.has(server.name))
    : [];
  const rows = [
    ...servers.map((server) => ({ kind: 'config' as const, server })),
    ...runtimeServers.map((server) => ({ kind: 'runtime' as const, server })),
  ];
  const filtered = rankByQuery(rows, query, (row) => [
    row.server.name,
    row.kind === 'config'
      ? row.server.type === 'local' ? row.server.command?.join(' ') ?? '' : row.server.url ?? ''
      : '',
>>>>>>> bc50ba56a
  ]);
  const hasQuery = query.trim().length > 0;
  const deleteLabel = servers.find((server) => server.serverId === deleteTarget)?.label ?? deleteTarget ?? '';

  return (
    <SettingsPageLayout
      title={t('settings.page.mcp.title')}
      namedBySidebar
    >
      <SettingsCardToolbar
        search={rows.length > 0 ? { value: query, onChange: setQuery, placeholder: t('settings.mcp.grid.searchPlaceholder') } : null}
        actions={(
          <>
            <Button
              variant="ghost"
              size="sm"
              className="w-7 shrink-0 px-0 text-muted-foreground"
              disabled={isRefreshing}
              onClick={handleRefresh}
              aria-label={t('settings.mcp.sidebar.actions.refreshStatusAria')}
              title={t('settings.mcp.sidebar.actions.refreshStatusTitle')}
            >
              <Icon name="refresh" className={cn('size-4', isRefreshing && 'animate-spin')} />
            </Button>
            <SettingsProjectSelector className="min-w-0 w-56" />
          </>
        )}
      />

      {rows.length === 0 ? (
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
<<<<<<< HEAD
        {filtered.map((server) => {
          const status = getMcpServerStatus(mcpStatus[server.serverId]);
          const target = transportTarget(server.transport);
          const transportKey = server.transport.type === 'stdio'
            ? 'settings.mcp.sidebar.serverType.localTitle'
            : 'settings.mcp.sidebar.serverType.remoteTitle';
=======
        {filtered.map((row) => {
          if (row.kind === 'runtime') {
            const blocked = isBlocked(`mcp:${row.server.name}`);
            // No config entry backs this server, so it opens nothing and offers
            // no delete: the row is what the runtime reports, read-only.
            return (
              <SettingsCard
                key={row.server.name}
                icon={<SettingsCardIcon name="server" />}
                title={row.server.name}
                badges={(
                  <StatusPill
                    status={row.server.status.status}
                    enabled={row.server.status.status !== 'disabled'}
                    blocked={blocked}
                  />
                )}
                muted={row.server.status.status === 'disabled' || blocked}
                footer={<SettingsCardChip>{t('settings.mcp.grid.runtimeProvided')}</SettingsCardChip>}
              />
            );
          }
          const server = row.server;
          const enabled = server.disabled !== true;
          const blocked = isBlocked(`mcp:${server.name}`);
          const target = server.type === 'local' ? server.command?.join(' ') : server.url;
>>>>>>> bc50ba56a
          return (
            <SettingsCard
              key={server.serverId}
              icon={<SettingsCardIcon name={server.transport.type === 'stdio' ? 'server' : 'global'} />}
              title={server.label}
              subtitle={target || undefined}
              badges={<StatusPill status={status} enabled={server.enabled} managed={server.managed} />}
              muted={!server.enabled}
              footer={<span>{t(transportKey)}</span>}
              onOpen={() => {
                setMcpDraft(null);
                setSelectedMcp(server.serverId);
              }}
              actionsLabel={t('settings.mcp.grid.actionsAria', { name: server.label })}
              actions={server.managed === false ? [] : [{
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
