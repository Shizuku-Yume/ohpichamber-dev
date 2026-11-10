import { OpenChamberLogo } from '@/components/ui/OpenChamberLogo';
import React from 'react';
import { isDesktopShell, startDesktopWindowDrag } from '@/lib/desktop';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RemoteConnectionForm } from './RemoteConnectionForm';
import { desktopHostsGet, desktopHostsSet } from '@/lib/desktopHosts';
import { useI18n } from '@/lib/i18n';
<<<<<<< HEAD
=======
import { runtimeFetch } from '@/lib/runtime-fetch';
import { useEnterprisePolicyStore } from '@/stores/useEnterprisePolicyStore';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

const INSTALL_COMMAND = 'curl -fsSL https://opencode.ai/v2/install | bash';
const WINDOWS_INSTALL_COMMAND = 'npm install -g @opencode/cli';
const DOCS_URL = 'https://opencode.ai/download';
const POLL_INTERVAL_MS = 2500;

type OnboardingPlatform = 'macos' | 'linux' | 'windows' | 'unknown';
>>>>>>> bc50ba56a

type ChooserScreenProps = {
  onChooseLocal?: () => void;
  localAvailable?: boolean;
};

<<<<<<< HEAD
=======
function InstallCommand({ windows, onCopy, copyTitle }: { windows: boolean; onCopy: () => void; copyTitle: string }) {
  return (
    <div className="flex items-center justify-between gap-3 w-full">
      <ScrollableOverlay as="code" outerClassName="overlay-scrollbar-wrapper--no-gutter flex-1 min-w-0" fillContainer={false} className="text-start whitespace-nowrap">
        {windows ? (
          <span style={{ color: 'var(--syntax-keyword)' }}>{WINDOWS_INSTALL_COMMAND}</span>
        ) : (
          <>
            <span style={{ color: 'var(--syntax-keyword)' }}>curl</span>
            <span className="text-muted-foreground"> -fsSL </span>
            <span style={{ color: 'var(--syntax-string)' }}>https://opencode.ai/v2/install</span>
            <span className="text-muted-foreground"> | </span>
            <span style={{ color: 'var(--syntax-keyword)' }}>bash</span>
          </>
        )}
      </ScrollableOverlay>
      <button
        onClick={onCopy}
        className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
        title={copyTitle}
        aria-label={copyTitle}
      >
        <Icon name="file-copy" className="h-4 w-4" />
      </button>
    </div>
  );
}
>>>>>>> bc50ba56a

export function ChooserScreen({ onChooseLocal, localAvailable = true }: ChooserScreenProps) {
  const { t } = useI18n();
  const [isDesktopApp, setIsDesktopApp] = React.useState(false);
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


  const showLocal = localAvailable && (!isDesktopApp || activeTab === 'local');

  return (
    <ScrollableOverlay
      outerClassName="h-full bg-transparent"
      className="app-region-drag flex items-center justify-center p-8 cursor-default select-none"
      onMouseDown={handleDragStart}
      disableHorizontal
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
<<<<<<< HEAD
          <div className="app-region-no-drag mt-6 flex justify-center">
            <Button type="button" onClick={() => void chooseLocal()}>
              {t('onboarding.desktopRecovery.common.useLocal')}
            </Button>
=======
          <div className="mt-6">
            {platform === 'windows' && (
              <div className="mb-4 rounded-lg border border-border p-4">
                <div className="text-sm text-foreground">{t('onboarding.localSetup.windows.title')}</div>
                <ol className="mt-2 list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
                  <li>{t('onboarding.localSetup.windows.stepRunInstallInWsl')}</li>
                  <li>{t('onboarding.localSetup.windows.stepSetBinaryPath')}</li>
                </ol>
              </div>
            )}

            <p className="text-center text-sm leading-relaxed text-muted-foreground text-balance">
              {t('onboarding.localSetup.intro')}
            </p>

            <div className="app-region-no-drag mt-3 rounded-lg border border-border bg-background/60 px-4 py-3 font-mono text-sm">
              {copied ? (
                <div className="flex items-center gap-2" style={{ color: 'var(--status-success)' }}>
                  <Icon name="check" className="h-4 w-4" />
                  {t('onboarding.common.status.copiedToClipboard')}
                </div>
              ) : (
                <InstallCommand windows={platform === 'windows'} onCopy={handleCopy} copyTitle={t('onboarding.common.copyToClipboard')} />
              )}
            </div>

            <div className="app-region-no-drag mt-3 flex items-center gap-2.5 px-1" role="status" aria-live="polite">
              <span className="relative inline-flex h-2 w-2 shrink-0" aria-hidden>
                <WatchingDot />
              </span>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                <span className="text-foreground">{t('onboarding.localSetup.status.watching')}</span>
                {' · '}
                {t('onboarding.localSetup.status.autoContinue')}
              </span>
              <button
                type="button"
                onClick={handleManualCheck}
                disabled={isManualChecking}
                className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                {isManualChecking ? t('onboarding.localSetup.actions.checking') : t('onboarding.localSetup.actions.checkNow')}
              </button>
            </div>

            <div className="mt-6 divide-y divide-edge border-y border-edge">
              <details
                className="app-region-no-drag group"
                open={advancedOpen}
                onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <span>{t('onboarding.localSetup.advanced.title')}</span>
                  <Icon name="arrow-down-s" className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-2 pb-4">
                  <div className="flex gap-2">
                    <Input
                      value={pinnedBinary ?? opencodeBinary}
                      onChange={(e) => setOpencodeBinary(e.target.value)}
                      placeholder={binaryPlaceholder}
                      disabled={isApplyingPath || pinnedBinary !== null}
                      className="flex-1 font-mono text-xs"
                    />
                    {pinnedBinary === null && (
                      <>
                        <Button type="button" variant="secondary" size="sm" onClick={handleBrowse} disabled={isApplyingPath || !isDesktopApp}>
                          {t('onboarding.localSetup.actions.browse')}
                        </Button>
                        <Button type="button" size="sm" onClick={handleApplyPath} disabled={isApplyingPath || !opencodeBinary.trim()}>
                          {t('onboarding.localSetup.actions.apply')}
                        </Button>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(pinnedBinary === null ? 'onboarding.localSetup.helper.saveAndReload' : 'onboarding.localSetup.helper.pinnedByAdministrator')}
                  </p>
                </div>
              </details>
              <details
                className="app-region-no-drag group"
                open={troubleOpen}
                onToggle={(e) => setTroubleOpen(e.currentTarget.open)}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                  <span>{t('onboarding.localSetup.troubleshoot.title')}</span>
                  <Icon name="arrow-down-s" className="h-4 w-4 transition-transform group-open:rotate-180" />
                </summary>
                <ul className="list-disc space-y-1.5 pb-4 ps-4 text-xs text-muted-foreground">
                  {platform === 'windows' ? (
                    <li>{t('onboarding.localSetup.windows.hintDetectionFailed')}</li>
                  ) : (
                    <>
                      <li>{t('onboarding.localSetup.hint.ensurePath')}</li>
                      <li>{t('onboarding.localSetup.hint.setEnv')}</li>
                      <li>{t('onboarding.localSetup.hint.missingRuntime')}</li>
                    </>
                  )}
                </ul>
              </details>
            </div>

            <div className="app-region-no-drag mt-5 text-center">
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                {platform === 'windows' ? t('onboarding.localSetup.docs.windows') : t('onboarding.localSetup.docs.default')}
                <Icon name="external-link" className="h-3 w-3" />
              </a>
            </div>
>>>>>>> bc50ba56a
          </div>
        )}
      </div>
    </ScrollableOverlay>
  );
}
