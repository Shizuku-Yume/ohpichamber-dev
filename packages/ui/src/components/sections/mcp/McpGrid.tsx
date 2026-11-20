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
import { SETTINGS_WIDTH_SHORT_TEXT_CLASS } from '@/components/sections/shared/SettingsSection';
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
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
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
  const refreshStatus = useMcpStore((state) => state.refresh);
  const getErrorForDirectory = useMcpStore((state) => state.getErrorForDirectory);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [addOpen, setAddOpen] = React.useState(false);
  const settingsProjectPath = useUIStore((state) => state.settingsProjectPath);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const projects = useProjectsStore((state) => state.projects);
  const hasSelectedProject = Boolean(
    settingsProjectPath
      ? projects.some((p) => p.path === settingsProjectPath)
      : activeProjectId && projects.some((p) => p.id === activeProjectId),
  );
  const [addScope, setAddScope] = React.useState<'project' | 'user'>('project');
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
    setAddScope(hasSelectedProject ? 'project' : 'user');
    setAddOpen(true);
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
          <SettingsProjectSelector className={`min-w-0 flex-1 @xl:flex-none ${SETTINGS_WIDTH_SHORT_TEXT_CLASS}`} />
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
              badges={
                <div className="flex items-center gap-1.5">
                  <SettingsCardPill tone="neutral">
                    {server.scope === 'user' ? t('settings.mcp.grid.scope.user') : t('settings.mcp.grid.scope.project')}
                  </SettingsCardPill>
                  <StatusPill status={status} enabled={server.enabled} managed={server.managed} />
                </div>
              }
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

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('settings.mcp.dialog.add.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <label className="flex items-center gap-3 rounded-lg border border-[var(--interactive-border)] p-3 cursor-pointer hover:bg-[var(--surface-hover)]">
              <input
                type="radio"
                name="mcp-add-scope"
                value="project"
                checked={addScope === 'project'}
                onChange={() => setAddScope('project')}
                className="size-4"
              />
              <span className="text-sm font-medium text-foreground">{t('settings.mcp.dialog.add.scope.project')}</span>
            </label>
            <label className="flex items-center gap-3 rounded-lg border border-[var(--interactive-border)] p-3 cursor-pointer hover:bg-[var(--surface-hover)]">
              <input
                type="radio"
                name="mcp-add-scope"
                value="user"
                checked={addScope === 'user'}
                onChange={() => setAddScope('user')}
                className="size-4"
              />
              <span className="text-sm font-medium text-foreground">{t('settings.mcp.dialog.add.scope.user')}</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {t('settings.common.actions.cancel')}
            </Button>
            <Button
              onClick={() => {
                const serverId = nextServerId(servers);
                setMcpDraft(createMcpDraft(serverId, addScope));
                setSelectedMcp(serverId);
                setAddOpen(false);
              }}
            >
              {t('settings.mcp.dialog.add.title')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageLayout>
  );
};
