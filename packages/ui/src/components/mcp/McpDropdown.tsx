import React from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Switch } from '@/components/ui/switch';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { cn } from '@/lib/utils';
import { useDeviceInfo } from '@/lib/device';
import { selectMcpServersForDirectory, useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { computeMcpHealth, getMcpServerError, getMcpServerStatus, useMcpStore, type McpServerRuntimeState } from '@/stores/useMcpStore';
import { McpIcon } from '@/components/icons/McpIcon';
import { Icon } from "@/components/icon/Icon";
import { useI18n } from '@/lib/i18n';
import { toast } from 'sonner';
import { useMcpDirectory } from './useMcpDirectory';

// Opening a panel reads existing workspace configuration and admitted catalogs.
const MCP_STATUS_MAX_AGE_MS = 60_000;

const statusTooltip = (
  server: McpServerRuntimeState | undefined,
  t: ReturnType<typeof useI18n>['t']
): string => {
  const status = getMcpServerStatus(server);
  if (status === 'ready') return t('settings.mcp.page.status.label.connected');
  if (status === 'unavailable') return getMcpServerError(server) || t('settings.mcp.page.status.description.failedDefault');
  return t('chat.workStatus.mcp.unknown');
};

const statusTone = (server: McpServerRuntimeState | undefined): 'default' | 'success' | 'warning' | 'error' => {
  const status = getMcpServerStatus(server);
  return status === 'ready' ? 'success' : status === 'unavailable' ? 'error' : 'default';
};

interface McpDropdownProps {
  headerIconButtonClass: string;
}

export const McpDropdownContent: React.FC<{
  active: boolean;
  className?: string;
  listClassName?: string;
  hideHeader?: boolean;
  mobileListDensity?: boolean;
}> = ({ active, className: _className, listClassName: _listClassName, hideHeader: _hideHeader, mobileListDensity: _mobileListDensity }) => {
  const { t } = useI18n();
  const directory = useMcpDirectory(active);
  const status = useMcpStore((state) => directory ? state.getStatusForDirectory(directory) : null);
  const phase = useMcpStore((state) => directory ? state.getPhaseForDirectory(directory) : 'unknown');
  const refresh = useMcpStore((state) => state.refresh);
  const ensureFresh = useMcpStore((state) => state.ensureFresh);
  const connect = useMcpStore((state) => state.connect);
  const disconnect = useMcpStore((state) => state.disconnect);
  const mcpServers = useMcpConfigStore((state) => directory ? selectMcpServersForDirectory(state, directory) : null);
  const loadMcpConfigs = useMcpConfigStore((state) => state.loadMcpConfigs);
  const [isSpinning, setIsSpinning] = React.useState(false);
  const [busyName, setBusyName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!active || !directory) return;
    void Promise.all([
      ensureFresh({ directory, silent: true, maxAgeMs: MCP_STATUS_MAX_AGE_MS }),
      loadMcpConfigs({ force: true, directory }),
    ]);
  }, [active, ensureFresh, directory, loadMcpConfigs]);

  const sortedNames = React.useMemo(() => {
    const names = new Set<string>(Object.keys(status ?? {}));
    if (mcpServers) for (const server of mcpServers) {
      if (server?.serverId) {
        names.add(server.serverId);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [mcpServers, status]);

  const handleRefresh = React.useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    if (isSpinning || !directory) return;
    setIsSpinning(true);
    const minSpinPromise = new Promise(resolve => setTimeout(resolve, 500));
    Promise.all([refresh({ directory }), minSpinPromise]).finally(() => {
      setIsSpinning(false);
    });
  }, [isSpinning, refresh, directory]);

  return (
    <div className="w-full">
      <div className="border-b border-[var(--interactive-border)]">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0 flex items-baseline gap-2">
            <div className="typography-ui-header font-semibold text-foreground">{t('chat.workStatus.breakdown.mcp')}</div>
            {directory && (
              <div className="truncate typography-micro text-muted-foreground">
                {directory.split('/').pop() || directory}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={isSpinning || !directory}
              onClick={handleRefresh}
              aria-label={t('settings.mcp.sidebar.actions.refreshStatusAria')}
            >
              <Icon name="refresh" className={cn('h-4 w-4', isSpinning && 'animate-spin')} />
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto px-3 py-2.5">
        <div className={cn(sortedNames.length > 0 && 'p-1.5')}>
        {sortedNames.map((serverName) => {
          const serverStatus = status?.[serverName];
          const tone = statusTone(serverStatus);
          const isConnected = serverStatus?.configuration.enabled ?? mcpServers?.find(server => server.serverId === serverName)?.enabled ?? false;
          const isBusy = busyName === serverName;
          const tooltip = statusTooltip(serverStatus, t);

          return (
            <div
              key={serverName}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 hover:bg-interactive-hover',
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full flex-shrink-0',
                          tone === 'success' && 'bg-status-success',
                          tone === 'error' && 'bg-status-error',
                          tone === 'warning' && 'bg-status-warning',
                          tone === 'default' && 'bg-muted-foreground/40'
                        )}
                        aria-label={tooltip}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="truncate typography-ui-label">
                    {serverName}
                  </span>
                </div>
              </div>

              <Switch
                checked={isConnected}
                disabled={isBusy}
                className="data-[checked]:bg-status-info"
                onCheckedChange={async (checked) => {
                  if (!directory) return;
                  setBusyName(serverName);
                  try {
                    if (checked) {
                      await connect(serverName, directory);
                    } else {
                      await disconnect(serverName, directory);
                    }
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : t('errorBoundary.state.unknownError'));
                  } finally {
                    setBusyName(null);
                  }
                }}
              />
            </div>
          );
        })}

        {directory && sortedNames.length === 0 && (
          <div className="px-4 py-5 typography-ui-label text-muted-foreground text-center">
            {phase === 'unknown' ? t('chat.workStatus.mcp.unknown') : t('settings.mcp.grid.empty')}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export const McpDropdown: React.FC<McpDropdownProps> = ({ headerIconButtonClass }) => {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [tooltipOpen, setTooltipOpen] = React.useState(false);
  const blockTooltipRef = React.useRef(false);
  const { isMobile } = useDeviceInfo();
  // Desktop content owns preparation once the dropdown opens.
  const directory = useMcpDirectory(isMobile && open);

  const status = useMcpStore((state) => directory ? state.getStatusForDirectory(directory) : null);
  const phase = useMcpStore((state) => directory ? state.getPhaseForDirectory(directory) : 'unknown');
  const refresh = useMcpStore((state) => state.refresh);
  const ensureFresh = useMcpStore((state) => state.ensureFresh);
  const connect = useMcpStore((state) => state.connect);
  const disconnect = useMcpStore((state) => state.disconnect);
  const mcpServers = useMcpConfigStore((state) => directory ? selectMcpServersForDirectory(state, directory) : null);
  const loadMcpConfigs = useMcpConfigStore((state) => state.loadMcpConfigs);

  const handleDropdownOpenChange = React.useCallback((isOpen: boolean) => {
    if (!isOpen) {
      blockTooltipRef.current = true;
      setTooltipOpen(false);
      setTimeout(() => {
        blockTooltipRef.current = false;
      }, 200);
    }
    setOpen(isOpen);
  }, []);

  const handleTooltipOpenChange = React.useCallback((isOpen: boolean) => {
    if (blockTooltipRef.current) return;
    setTooltipOpen(isOpen);
  }, []);

  const [isSpinning, setIsSpinning] = React.useState(false);

  const [busyName, setBusyName] = React.useState<string | null>(null);

  // Existing catalog reads wait until the dropdown is opened.
  React.useEffect(() => {
    if (!open || !directory) return;
    void Promise.all([
      ensureFresh({ directory, silent: true, maxAgeMs: MCP_STATUS_MAX_AGE_MS }),
      loadMcpConfigs({ force: true, directory }),
    ]);
  }, [open, ensureFresh, directory, loadMcpConfigs]);

  const health = React.useMemo(() => computeMcpHealth(status), [status]);

  const sortedNames = React.useMemo(() => {
    const names = new Set<string>(Object.keys(status ?? {}));
    if (mcpServers) for (const server of mcpServers) {
      if (server?.serverId) {
        names.add(server.serverId);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [mcpServers, status]);

  const handleRefresh = React.useCallback((e?: React.MouseEvent) => {
    e?.preventDefault();
    if (isSpinning || !directory) return;
    setIsSpinning(true);
    const minSpinPromise = new Promise(resolve => setTimeout(resolve, 500));
    Promise.all([refresh({ directory }), minSpinPromise]).finally(() => {
      setIsSpinning(false);
    });
  }, [isSpinning, refresh, directory]);

  const renderServerList = () => (
    <>
      {sortedNames.map((serverName) => {
        const serverStatus = status?.[serverName];
        const tone = statusTone(serverStatus);
        const isConnected = serverStatus?.configuration.enabled ?? mcpServers?.find(server => server.serverId === serverName)?.enabled ?? false;
        const isBusy = busyName === serverName;
        const tooltip = statusTooltip(serverStatus, t);

        return (
          <div
            key={serverName}
            className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-interactive-hover/50"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                {isMobile ? (
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full flex-shrink-0',
                      tone === 'success' && 'bg-status-success',
                      tone === 'error' && 'bg-status-error',
                      tone === 'warning' && 'bg-status-warning',
                      tone === 'default' && 'bg-muted-foreground/40'
                    )}
                    aria-label={tooltip}
                  />
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full flex-shrink-0',
                          tone === 'success' && 'bg-status-success',
                          tone === 'error' && 'bg-status-error',
                          tone === 'warning' && 'bg-status-warning',
                          tone === 'default' && 'bg-muted-foreground/40'
                        )}
                        aria-label={tooltip}
                      />
                    </TooltipTrigger>
                    <TooltipContent side="left">
                      <p>{tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <span className="typography-ui-label truncate">{serverName}</span>
              </div>
            </div>

            <Switch
              checked={isConnected}
              disabled={isBusy}
              className="data-[checked]:bg-status-info"
              onCheckedChange={async (checked) => {
                if (!directory) return;
                setBusyName(serverName);
                try {
                  if (checked) {
                    await connect(serverName, directory);
                  } else {
                    await disconnect(serverName, directory);
                  }
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t('errorBoundary.state.unknownError'));
                } finally {
                  setBusyName(null);
                }
              }}
            />
          </div>
        );
      })}

      {directory && sortedNames.length === 0 && (
        <div className="px-2 py-3 typography-ui-label text-muted-foreground text-center">
          {phase === 'unknown' ? t('chat.workStatus.mcp.unknown') : t('settings.mcp.grid.empty')}
        </div>
      )}
    </>
  );

  const triggerButton = (
    <button
      type="button"
      aria-label={t('chat.workStatus.breakdown.mcp')}
      className={cn(headerIconButtonClass, 'relative')}
      onClick={isMobile ? () => setOpen(true) : undefined}
    >
      <McpIcon className="h-[1.0625rem] w-[1.0625rem]" />
      {health.total > 0 && (
        <span
          className={cn(
            'absolute top-1.5 inset-e-1.5 h-1.5 w-1.5 rounded-full',
            health.hasFailed
              ? 'bg-status-error'
              : health.connected > 0
                ? 'bg-status-success'
                : 'bg-muted-foreground/40'
          )}
          aria-label={t('settings.mcp.page.status.runtimeStatus')}
        />
      )}
    </button>
  );

  // Mobile: use MobileOverlayPanel
  if (isMobile) {
    return (
      <>
        {triggerButton}
        <MobileOverlayPanel
          open={open}
          title={t('chat.workStatus.breakdown.mcp')}
          onClose={() => setOpen(false)}
          renderHeader={(closeButton) => (
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
              <h2 className="typography-ui-label font-semibold text-foreground">{t('chat.workStatus.breakdown.mcp')}</h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover transition-colors"
                  disabled={isSpinning || !directory}
                  onClick={handleRefresh}
                  aria-label={t('settings.mcp.sidebar.actions.refreshStatusAria')}
                >
                  <Icon name="refresh" className={cn('h-4 w-4', isSpinning && 'animate-spin')} />
                </button>
                {closeButton}
              </div>
            </div>
          )}
        >
          <div className="py-1">
            {renderServerList()}
          </div>
          {directory && (
            <div className="px-2 py-1 border-t border-border/40 mt-1">
              <span className="typography-meta text-muted-foreground truncate block">
                {directory.split('/').pop() || directory}
              </span>
            </div>
          )}
        </MobileOverlayPanel>
      </>
    );
  }

  // Desktop: use DropdownMenu
  return (
    <DropdownMenu open={open} onOpenChange={handleDropdownOpenChange}>
      <Tooltip open={open ? false : tooltipOpen} onOpenChange={handleTooltipOpenChange}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            {triggerButton}
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>{t('chat.workStatus.breakdown.mcp')}</p>
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-72">
        <McpDropdownContent active={open} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
