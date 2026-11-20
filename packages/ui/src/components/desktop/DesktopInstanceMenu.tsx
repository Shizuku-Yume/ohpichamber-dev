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
