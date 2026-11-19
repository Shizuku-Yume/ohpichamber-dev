import { OpenChamberLogo } from '@/components/ui/OpenChamberLogo';
import React from 'react';
import { isDesktopShell, startDesktopWindowDrag } from '@/lib/desktop';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RemoteConnectionForm } from './RemoteConnectionForm';
import { desktopHostsGet, desktopHostsSet } from '@/lib/desktopHosts';
import { useI18n } from '@/lib/i18n';

type ChooserScreenProps = {
<<<<<<< HEAD
  onChooseLocal?: () => void;
||||||| bc50ba56aa
  /** Callback when CLI becomes available */
  onCliAvailable?: () => void;
=======
  onCliAvailable?: () => void;
>>>>>>> upstream/main
  localAvailable?: boolean;
};


<<<<<<< HEAD
export function ChooserScreen({ onChooseLocal, localAvailable = true }: ChooserScreenProps) {
||||||| bc50ba56aa
// Its own component: the blink re-renders this dot once a second, not the whole screen.
function WatchingDot() {
  const blink = useWaitingBlink(true);
  return <span className={cn('absolute inset-0 rounded-full', blink)} style={{ backgroundColor: 'var(--primary-base)' }} />;
}

export function ChooserScreen({ onCliAvailable, localAvailable = true }: ChooserScreenProps) {
=======
function WatchingDot() {
  const blink = useWaitingBlink(true);
  return <span className={cn('absolute inset-0 rounded-full', blink)} style={{ backgroundColor: 'var(--primary-base)' }} />;
}

export function ChooserScreen({ onCliAvailable, localAvailable = true }: ChooserScreenProps) {
>>>>>>> upstream/main
  const { t } = useI18n();
  const [isDesktopApp, setIsDesktopApp] = React.useState(false);
<<<<<<< HEAD
||||||| bc50ba56aa
  const [isApplyingPath, setIsApplyingPath] = React.useState(false);
  const [isManualChecking, setIsManualChecking] = React.useState(false);
  const [opencodeBinary, setOpencodeBinary] = React.useState('');
  // The server ignores the user's path while the administrator pins one.
  const pinnedBinary = useEnterprisePolicyStore((state) => state.opencodeBinary);
  const [platform, setPlatform] = React.useState<OnboardingPlatform>('unknown');
=======
  const [isApplyingPath, setIsApplyingPath] = React.useState(false);
  const [isManualChecking, setIsManualChecking] = React.useState(false);
  const [opencodeBinary, setOpencodeBinary] = React.useState('');
  const pinnedBinary = useEnterprisePolicyStore((state) => state.opencodeBinary);
  const [platform, setPlatform] = React.useState<OnboardingPlatform>('unknown');
>>>>>>> upstream/main
  const [activeTab, setActiveTab] = React.useState<'local' | 'remote'>(() => localAvailable ? 'local' : 'remote');

  React.useEffect(() => {
    setIsDesktopApp(isDesktopShell());
  }, []);


  const handleDragStart = React.useCallback(async (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('.app-region-no-drag')) return;
    if (target.closest('button, a, input, select, textarea, code, summary, details')) return;
    if (e.button !== 0) return;
    if (isDesktopApp) {
      await startDesktopWindowDrag();
    }
  }, [isDesktopApp]);


  const persistFirstChoice = React.useCallback(async (choice: 'local' | 'remote') => {
    if (!isDesktopApp) return;

    const config = await desktopHostsGet();
    await desktopHostsSet({
      ...config,
      ...(choice === 'local' ? { defaultHostId: 'local' } : {}),
      initialHostChoiceCompleted: true,
    });
  }, [isDesktopApp]);

  const chooseLocal = React.useCallback(async () => {
    if (isDesktopApp) {
      await persistFirstChoice('local');
    }
    onChooseLocal?.();
  }, [isDesktopApp, onChooseLocal, persistFirstChoice]);

<<<<<<< HEAD
||||||| bc50ba56aa
  // Background polling: while the local tab is visible, periodically check
  // whether the OpenCode CLI is reachable. As soon as it is, transition
  // automatically — the user doesn't have to click anything.
  React.useEffect(() => {
    if (!localAvailable || activeTab !== 'local') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const available = await checkCliAvailability();
        if (cancelled) return;
        if (available) {
          await announceAvailable();
          return;
        }
      } catch {
        // ignore
      }
      if (!cancelled) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeTab, checkCliAvailability, announceAvailable, localAvailable]);

  const handleManualCheck = React.useCallback(async () => {
    setIsManualChecking(true);
    try {
      const available = await checkCliAvailability();
      if (available) await announceAvailable();
    } finally {
      setIsManualChecking(false);
    }
  }, [checkCliAvailability, announceAvailable]);

  const handleBrowse = React.useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!isDesktopApp) return;

    try {
      const selected = await requestFileAccess();
      if (selected.success && selected.path && selected.path.trim().length > 0) {
        setOpencodeBinary(selected.path.trim());
      }
    } catch {
      // ignore
    }
  }, [isDesktopApp]);

  const handleApplyPath = React.useCallback(async () => {
    setIsApplyingPath(true);
    try {
      await updateDesktopSettings({ opencodeBinary: opencodeBinary.trim() });
      if (isDesktopApp) {
        await persistFirstChoice('local');
        await restartDesktopApp();
        return;
      }
      await runtimeFetch('/api/config/reload', { method: 'POST' });
    } finally {
      setTimeout(() => setIsApplyingPath(false), 1000);
    }
  }, [isDesktopApp, opencodeBinary, persistFirstChoice]);

  const handleCopy = React.useCallback(async () => {
    const result = await copyTextToClipboard(platform === 'windows' ? WINDOWS_INSTALL_COMMAND : INSTALL_COMMAND);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      console.error('Failed to copy:', result.error);
    }
  }, [platform]);

  const docsUrl = DOCS_URL;
  const binaryPlaceholder =
    platform === 'windows'
      ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\opencode.cmd'
      : platform === 'linux'
        ? '/home/you/.opencode/bin/opencode'
        : '/Users/you/.opencode/bin/opencode';
=======
  React.useEffect(() => {
    if (!localAvailable || activeTab !== 'local') return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (cancelled) return;
      try {
        const available = await checkCliAvailability();
        if (cancelled) return;
        if (available) {
          await announceAvailable();
          return;
        }
      } catch {
        // ignore
      }
      if (!cancelled) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    timer = setTimeout(tick, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeTab, checkCliAvailability, announceAvailable, localAvailable]);

  const handleManualCheck = React.useCallback(async () => {
    setIsManualChecking(true);
    try {
      const available = await checkCliAvailability();
      if (available) await announceAvailable();
    } finally {
      setIsManualChecking(false);
    }
  }, [checkCliAvailability, announceAvailable]);

  const handleBrowse = React.useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!isDesktopApp) return;

    try {
      const selected = await requestFileAccess();
      if (selected.success && selected.path && selected.path.trim().length > 0) {
        setOpencodeBinary(selected.path.trim());
      }
    } catch {
      // ignore
    }
  }, [isDesktopApp]);

  const handleApplyPath = React.useCallback(async () => {
    setIsApplyingPath(true);
    try {
      await updateDesktopSettings({ opencodeBinary: opencodeBinary.trim() });
      if (isDesktopApp) {
        await persistFirstChoice('local');
        await restartDesktopApp();
        return;
      }
      await runtimeFetch('/api/config/reload', { method: 'POST' });
    } finally {
      setTimeout(() => setIsApplyingPath(false), 1000);
    }
  }, [isDesktopApp, opencodeBinary, persistFirstChoice]);

  const handleCopy = React.useCallback(async () => {
    const result = await copyTextToClipboard(platform === 'windows' ? WINDOWS_INSTALL_COMMAND : INSTALL_COMMAND);
    if (result.ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      console.error('Failed to copy:', result.error);
    }
  }, [platform]);

  const docsUrl = DOCS_URL;
  const binaryPlaceholder =
    platform === 'windows'
      ? 'C:\\Users\\you\\AppData\\Roaming\\npm\\opencode.cmd'
      : platform === 'linux'
        ? '/home/you/.opencode/bin/opencode'
        : '/Users/you/.opencode/bin/opencode';
>>>>>>> upstream/main

  const showLocal = localAvailable && (!isDesktopApp || activeTab === 'local');

  return (
    <div
      className="app-region-drag h-full flex items-center justify-center bg-transparent p-8 cursor-default select-none overflow-y-auto"
      onMouseDown={handleDragStart}
    >
      <div className="w-full max-w-md">
        <header className="flex flex-col items-center text-center">
          <OpenChamberLogo width={48} height={48} />
          <h1 className="mt-6 text-xl font-semibold tracking-tight text-foreground">
            {t('onboarding.chooser.title')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('onboarding.chooser.description')}
          </p>
        </header>

        {isDesktopApp && localAvailable && (
          <div role="tablist" className="app-region-no-drag mt-7 flex gap-1 rounded-lg border border-border p-1">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'local'}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors',
                activeTab === 'local'
                  ? 'bg-[var(--interactive-selection)] text-[var(--interactive-selection-foreground)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('local')}
            >
              {t('onboarding.chooser.tabs.localInstall')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'remote'}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors',
                activeTab === 'remote'
                  ? 'bg-[var(--interactive-selection)] text-[var(--interactive-selection-foreground)]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setActiveTab('remote')}
            >
              {t('onboarding.chooser.tabs.connectRemote')}
            </button>
          </div>
        )}

        {isDesktopApp && activeTab === 'remote' ? (
          <div className="app-region-no-drag mt-6">
            <RemoteConnectionForm
              onBack={() => localAvailable && setActiveTab('local')}
              showBackButton={false}
              showInstancePicker={!localAvailable}
              onSwitchToLocal={localAvailable ? () => setActiveTab('local') : undefined}
            />
          </div>
        ) : null}

        {showLocal && (
          <div className="app-region-no-drag mt-6 flex justify-center">
            <Button type="button" onClick={() => void chooseLocal()}>
              {t('onboarding.desktopRecovery.common.useLocal')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
