import React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DesktopHostSwitcherDialog } from '@/components/desktop/DesktopHostSwitcher';
import { useKeybinds } from '@/hooks/useKeybind';
import { isDesktopLocalOriginActive, isDesktopShell } from '@/lib/desktop';
import { desktopHostsGet, redactSensitiveUrl } from '@/lib/desktopHosts';
import {
  getLocalDesktopOrigin,
  LOCAL_HOST_ID,
  resolveCurrentDesktopHost,
  withLocalDesktopHost,
} from '@/lib/desktopCurrentHost';
import { useI18n } from '@/lib/i18n';
import { subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { formatShortcutForDisplay, getEffectiveShortcutCombo } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';

type Props = {
  className?: string;
};

export function DesktopInstanceMenu({ className }: Props): React.ReactNode {
  const [isDesktopApp] = React.useState(() => isDesktopShell());
  if (!isDesktopApp) {
    return null;
  }
  return <DesktopInstanceMenuContent className={className} />;
}

function DesktopInstanceMenuContent({ className }: Props): React.ReactNode {
  const { t } = useI18n();
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides);
  const [open, setOpen] = React.useState(false);
  const [currentInstanceLabel, setCurrentInstanceLabel] = React.useState('Local');
  const [currentInstanceIsLocal, setCurrentInstanceIsLocal] = React.useState(true);

  const refreshCurrentInstanceLabel = React.useCallback(async () => {
    if (isDesktopLocalOriginActive()) {
      setCurrentInstanceLabel('Local');
      setCurrentInstanceIsLocal(true);
      return;
    }

    const hosts = await desktopHostsGet()
      .then((cfg) => withLocalDesktopHost(cfg.hosts, cfg.localOrigin))
      .catch(() => withLocalDesktopHost([], getLocalDesktopOrigin()));
    const resolved = resolveCurrentDesktopHost(hosts);

    if (resolved.id === LOCAL_HOST_ID) {
      setCurrentInstanceLabel('Local');
      setCurrentInstanceIsLocal(true);
      return;
    }

    setCurrentInstanceIsLocal(false);
    setCurrentInstanceLabel(redactSensitiveUrl(resolved.label.trim() || 'Instance'));
  }, []);

  React.useEffect(() => {
    void refreshCurrentInstanceLabel();
    return subscribeRuntimeEndpointChanged(() => {
      void refreshCurrentInstanceLabel();
    });
  }, [refreshCurrentInstanceLabel]);

<<<<<<< HEAD
||||||| bc50ba56aa
  const checkRemoteInstanceUpdate = React.useCallback(async () => {
    if (currentInstanceIsLocal) {
      setRemoteUpdateInfo(null);
      setRemoteUpdateError(null);
      return;
    }

    setRemoteUpdateChecking(true);
    setRemoteUpdateError(null);
    try {
      // Status-only poll: must not count as usage on the remote server's install id.
      const params = new URLSearchParams({ appType: 'web', instanceMode: 'remote', reportUsage: 'false' });
      const response = await runtimeFetch(`/api/openchamber/update-check?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      // The shared parse keeps installBlocked, so the dialog never offers a
      // command that cannot update this server.
      setRemoteUpdateInfo(parseUpdateCheckResponse(await response.json()));
    } catch (error) {
      setRemoteUpdateInfo(null);
      setRemoteUpdateError(error instanceof Error ? error.message : t('header.services.remoteUpdate.error'));
    } finally {
      setRemoteUpdateChecking(false);
    }
  }, [currentInstanceIsLocal, t]);

  React.useEffect(() => {
    setRemoteUpdateInfo(null);
    setRemoteUpdateError(null);
    setRemoteUpdateDialogOpen(false);
  }, [currentInstanceIsLocal, currentInstanceLabel]);

  React.useEffect(() => {
    if (currentInstanceIsLocal) {
      return;
    }

    const initialDelayMs = 3000;
    const intervalMs = 60 * 60 * 1000;
    let disposed = false;
    let timer: number | null = null;

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(() => {
        if (disposed || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
          schedule(intervalMs);
          return;
        }
        void checkRemoteInstanceUpdate().finally(() => {
          if (!disposed) {
            schedule(intervalMs);
          }
        });
      }, delayMs);
    };

    schedule(initialDelayMs);

    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [checkRemoteInstanceUpdate, currentInstanceIsLocal, currentInstanceLabel]);

  const openRemoteInstanceUpdate = React.useCallback(() => {
    if (remoteUpdateInfo?.available) {
      setRemoteUpdateDialogOpen(true);
      return;
    }
    void checkRemoteInstanceUpdate();
  }, [checkRemoteInstanceUpdate, remoteUpdateInfo?.available]);

=======
  const checkRemoteInstanceUpdate = React.useCallback(async () => {
    if (currentInstanceIsLocal) {
      setRemoteUpdateInfo(null);
      setRemoteUpdateError(null);
      return;
    }

    setRemoteUpdateChecking(true);
    setRemoteUpdateError(null);
    try {
      const params = new URLSearchParams({ appType: 'web', instanceMode: 'remote', reportUsage: 'false' });
      const response = await runtimeFetch(`/api/openchamber/update-check?${params.toString()}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      setRemoteUpdateInfo(parseUpdateCheckResponse(await response.json()));
    } catch (error) {
      setRemoteUpdateInfo(null);
      setRemoteUpdateError(error instanceof Error ? error.message : t('header.services.remoteUpdate.error'));
    } finally {
      setRemoteUpdateChecking(false);
    }
  }, [currentInstanceIsLocal, t]);

  React.useEffect(() => {
    setRemoteUpdateInfo(null);
    setRemoteUpdateError(null);
    setRemoteUpdateDialogOpen(false);
  }, [currentInstanceIsLocal, currentInstanceLabel]);

  React.useEffect(() => {
    if (currentInstanceIsLocal) {
      return;
    }

    const initialDelayMs = 3000;
    const intervalMs = 60 * 60 * 1000;
    let disposed = false;
    let timer: number | null = null;

    const schedule = (delayMs: number) => {
      timer = window.setTimeout(() => {
        if (disposed || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) {
          schedule(intervalMs);
          return;
        }
        void checkRemoteInstanceUpdate().finally(() => {
          if (!disposed) {
            schedule(intervalMs);
          }
        });
      }, delayMs);
    };

    schedule(initialDelayMs);

    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [checkRemoteInstanceUpdate, currentInstanceIsLocal, currentInstanceLabel]);

  const openRemoteInstanceUpdate = React.useCallback(() => {
    if (remoteUpdateInfo?.available) {
      setRemoteUpdateDialogOpen(true);
      return;
    }
    void checkRemoteInstanceUpdate();
  }, [checkRemoteInstanceUpdate, remoteUpdateInfo?.available]);

>>>>>>> upstream/main
  const handleOpenChange = React.useCallback((next: boolean) => {
    setOpen(next);
    if (next) {
      void refreshCurrentInstanceLabel();
    }
  }, [refreshCurrentInstanceLabel]);

  useKeybinds({
    toggle_services_menu: () => {
      if (open) {
        setOpen(false);
        return;
      }
      const ui = useUIStore.getState();
      if (!ui.isSidebarOpen) {
        ui.setSidebarOpen(true);
      }
      handleOpenChange(true);
    },
  });

  const toggleShortcut = formatShortcutForDisplay(getEffectiveShortcutCombo('toggle_services_menu', shortcutOverrides));

  return (
    <>
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('header.services.openWithCurrent', { current: currentInstanceLabel })}
                className={className}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', currentInstanceIsLocal ? 'bg-status-success' : 'bg-status-info')} aria-hidden="true" />
                <span className="truncate typography-ui-label">{currentInstanceLabel}</span>
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={4}>
            <p>
              {t('header.services.tooltip.currentInstance', {
                current: currentInstanceLabel,
                toggle: toggleShortcut,
              })}
            </p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          side="top"
          align="end"
          className="w-[min(27rem,calc(100vw-2rem))] max-h-[75vh] overflow-y-auto p-0"
        >
          <DesktopHostSwitcherDialog
            embedded
            open={open}
            onOpenChange={() => {}}
            onHostSwitched={() => setOpen(false)}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
