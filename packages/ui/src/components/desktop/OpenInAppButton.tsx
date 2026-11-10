import React from 'react';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui';
import { Icon } from "@/components/icon/Icon";
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { useWaitingBlink } from '@/hooks/useDurationTicker';
import { isDesktopLocalOriginActive, isDesktopShell, openDesktopPath, openDesktopProjectInApp } from '@/lib/desktop';
import { DEFAULT_OPEN_IN_APP_ID, OPEN_IN_APPS } from '@/lib/openInApps';
import { useOpenInAppsStore, type OpenInAppOption } from '@/stores/useOpenInAppsStore';
import { useI18n } from '@/lib/i18n';

<<<<<<< HEAD

type OpenInAppButtonProps = {
  directory: string;
  className?: string;
};

const OpenInAppButtonComponent = ({ directory, className: _className }: OpenInAppButtonProps) => {
=======
type OpenInAppButtonProps = {
  directory: string;
  /** The header's icon-button look, shared with its neighbours. */
  buttonClassName: string;
};

/**
 * The header's Open In button: the app icon opens the project in that app, a
 * right click copies the path or picks another app.
 */
const OpenInAppButtonComponent = ({ directory, buttonClassName }: OpenInAppButtonProps) => {
>>>>>>> bc50ba56a
  const { t } = useI18n();
  const selectedAppId = useOpenInAppsStore((state) => state.selectedAppId);
  const availableApps = useOpenInAppsStore((state) => state.availableApps);
  const isCacheStale = useOpenInAppsStore((state) => state.isCacheStale);
  const isScanning = useOpenInAppsStore((state) => state.isScanning);
  const blink = useWaitingBlink(isScanning);
  const initialize = useOpenInAppsStore((state) => state.initialize);
  const loadInstalledApps = useOpenInAppsStore((state) => state.loadInstalledApps);
  const selectApp = useOpenInAppsStore((state) => state.selectApp);

  React.useEffect(() => {
    initialize();
  }, [initialize]);

  const isDesktopLocal = isDesktopShell() && isDesktopLocalOriginActive();

  const selectedApp = React.useMemo(() => {
    return availableApps.find((app) => app.id === selectedAppId)
      ?? availableApps.find((app) => app.id === DEFAULT_OPEN_IN_APP_ID)
      ?? availableApps[0]
      ?? OPEN_IN_APPS[0];
  }, [availableApps, selectedAppId]);

  if (!isDesktopLocal || !directory || availableApps.length === 0) {
    return null;
  }

  const handleOpen = async (app: OpenInAppOption) => {
    const opened = await openDesktopProjectInApp(directory, app.id, app.appName);
    if (!opened) {
      await openDesktopPath(directory, app.appName);
    }
  };

  const handleSelect = async (app: OpenInAppOption) => {
    await selectApp(app.id);
    await handleOpen(app);
  };

  const handleCopyPath = async () => {
    const text = directory;
    const result = await copyTextToClipboard(text);
    if (!result.ok) {
      return;
    }
    toast.success(t('openInApp.toast.pathCopied'));
  };

  return (
<<<<<<< HEAD
    <div className="inline-flex items-center text-muted-foreground">
      <button
        type="button"
        onClick={() => void handleOpen(selectedApp)}
        className={cn(
          // No hover fill: the work-status panel shows interactivity through the
          // glyph, not blocks of colour.
          'inline-flex size-6 items-center justify-center rounded-md opacity-85 transition-opacity hover:opacity-100',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--interactive-focus-ring)]',
          blink
        )}
        aria-label={t('openInApp.actions.openInAria', { app: selectedApp.label })}
        title={t('openInApp.actions.openInAria', { app: selectedApp.label })}
      >
        <Icon name={selectedApp.icon} className="size-4" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--interactive-focus-ring)] data-[popup-open]:text-foreground"
            aria-label={t('openInApp.actions.chooseAppAria')}
          >
            <Icon name="arrow-down-s" className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          data-work-status-popup
          align="end"
          className="w-56 max-h-[70vh] overflow-y-auto"
        >
          <DropdownMenuItem className="flex items-center gap-2" onClick={() => void handleCopyPath()}>
            <Icon name="file-copy" className="h-4 w-4" />
            <span className="typography-ui-label text-foreground">{t('openInApp.actions.copyPath')}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {availableApps.map((app) => (
            <DropdownMenuItem
              key={app.id}
              className="flex items-center gap-2"
              onClick={() => void handleSelect(app)}
            >
              <Icon name={app.icon} className="size-4" />
              <span className="typography-ui-label text-foreground">{app.label}</span>
              {selectedApp.id === app.id ? (
                <Icon name="check" className="ms-auto h-4 w-4 text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))}
          {isCacheStale ? (
            <DropdownMenuItem
              className="flex items-center gap-2"
              onClick={() => void loadInstalledApps(true)}
=======
    <ContextMenu>
      <Tooltip>
        <ContextMenuTrigger render={<div className="inline-flex" />}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void handleOpen(selectedApp)}
              className={cn(buttonClassName, blink)}
              aria-label={t('openInApp.actions.openInAria', { app: selectedApp.label })}
>>>>>>> bc50ba56a
            >
              <Icon name={selectedApp.icon} className="size-4" />
            </button>
          </TooltipTrigger>
        </ContextMenuTrigger>
        <TooltipContent side="bottom">{t('openInApp.actions.openInAria', { app: selectedApp.label })}</TooltipContent>
      </Tooltip>
      <ContextMenuContent className="w-56 max-h-[70vh] overflow-y-auto">
        <ContextMenuItem className="flex items-center gap-2" onClick={() => void handleCopyPath()}>
          <Icon name="file-copy" className="h-4 w-4" />
          <span className="typography-ui-label text-foreground">{t('openInApp.actions.copyPath')}</span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        {availableApps.map((app) => (
          <ContextMenuItem
            key={app.id}
            className="flex items-center gap-2"
            onClick={() => void handleSelect(app)}
          >
            <Icon name={app.icon} className="h-4 w-4" />
            <span className="typography-ui-label text-foreground">{app.label}</span>
            {selectedApp.id === app.id ? (
              <Icon name="check" className="ms-auto h-4 w-4 text-primary" />
            ) : null}
          </ContextMenuItem>
        ))}
        {isCacheStale ? (
          <ContextMenuItem
            className="flex items-center gap-2"
            onClick={() => void loadInstalledApps(true)}
          >
            <Icon name="refresh" className="h-4 w-4" />
            <span className="typography-ui-label text-foreground">{t('openInApp.actions.refreshApps')}</span>
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  );
};

// Memoised: the header re-renders on many session changes; its props are a
// directory and a constant class.
export const OpenInAppButton = React.memo(OpenInAppButtonComponent);
