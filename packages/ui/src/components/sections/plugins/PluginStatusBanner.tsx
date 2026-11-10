import React from 'react';
import type { PluginMutationResult } from '@openchamber/agent-contract';
import { Icon } from '@/components/icon/Icon';
import { SettingsCardPill } from '@/components/sections/shared/SettingsCards';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type BannerTone = 'success' | 'warning' | 'error' | 'neutral';

const TONE_ICON_CLASS = {
  success: 'text-[var(--status-success)]',
  warning: 'text-[var(--status-warning)]',
  error: 'text-[var(--status-error)]',
  neutral: 'text-muted-foreground',
} as const satisfies Record<BannerTone, string>;

const TONE_TITLE_CLASS = {
  success: 'text-[var(--status-success)]',
  warning: 'text-[var(--status-warning)]',
  error: 'text-[var(--status-error)]',
  neutral: 'text-foreground',
} as const satisfies Record<BannerTone, string>;

/** A committed configuration and an active worker publication are independent outcomes. */
export const PluginStatusBanner: React.FC<{ result: PluginMutationResult }> = ({ result }) => {
  const { t } = useI18n();
<<<<<<< HEAD
  const failedWorkers = result.workers.filter(worker => worker.outcome === 'failed');
  const failedCount = failedWorkers.length;
  const presentation = result.status === 'applied'
    ? { tone: 'success' as const, icon: 'checkbox-circle' as const, label: t('settings.plugins.apply.applied') }
    : result.status === 'partial'
      ? { tone: 'warning' as const, icon: 'error-warning' as const, label: t('settings.plugins.apply.partial', { failedCount }) }
      : result.status === 'failed'
        ? { tone: 'error' as const, icon: 'error-warning' as const, label: t('settings.plugins.apply.failed') }
        : { tone: 'neutral' as const, icon: 'time' as const, label: t('settings.plugins.apply.noActiveWorkers') };
  const runtimeProblem = presentation.tone === 'warning' || presentation.tone === 'error';
=======
  const status = usePluginRuntimeStatus(target);
  const packageUpdate = usePluginPackageUpdate(target);
  const loadRuntime = usePluginsStore((s) => s.loadRuntime);
  const updatePackage = usePluginsStore((s) => s.updatePackage);

  if (status.kind === 'loading') return null;

  if (status.kind === 'unknown') {
    return (
      <div className="oc-tile rounded-md p-3 flex items-start gap-3">
        <Icon name="question" className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="typography-label text-foreground">{t('settings.plugins.status.unknown.title')}</p>
          <p className="typography-micro text-muted-foreground mt-0.5">
            {t('settings.plugins.status.unknown.description')}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadRuntime()}>
          {t('settings.plugins.status.retry')}
        </Button>
      </div>
    );
  }

  const { load, update } = status;
  const packageTarget = status.target.kind === 'package' ? status.target.target : null;
  const isUpdating = update === 'updating' || packageUpdate?.kind === 'running';

  const handleUpdate = async () => {
    if (!packageTarget) return;
    const ok = await updatePackage(packageTarget);
    if (ok) toast.success(t('settings.plugins.update.toast.done', { name }));
    else toast.error(t('settings.plugins.update.toast.failed', { name }));
  };

  const loadBlock = (() => {
    switch (load.kind) {
      case 'active':
        return (
          <p className="typography-meta flex items-center gap-1.5 text-muted-foreground">
            <Icon name="checkbox-circle" className="h-4 w-4 text-[var(--status-success)]" />
            {load.version
              ? t('settings.plugins.status.loadedVersion', { version: load.version })
              : t('settings.plugins.status.loaded')}
          </p>
        );
      case 'notReported':
        return (
          <div className="oc-tile rounded-md p-3 flex items-start gap-3">
            <Icon name="time" className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="typography-label text-foreground">{t('settings.plugins.status.notReported.title')}</p>
              <p className="typography-micro text-muted-foreground mt-0.5">
                {t('settings.plugins.status.notReported.description')}
              </p>
            </div>
          </div>
        );
      case 'failed':
        return (
          <div className="oc-tile rounded-md p-3 flex items-start gap-3">
            <Icon name="error-warning" className="h-5 w-5 text-[var(--status-error)] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="typography-label text-[var(--status-error)]">{t('settings.plugins.status.failed.title')}</p>
              <p dir="ltr" className="typography-micro font-mono text-foreground mt-1 whitespace-pre-wrap break-words">
                {load.error}
              </p>
              {load.ref ? (
                <p className="typography-micro text-muted-foreground mt-1">
                  {t('settings.plugins.status.failed.ref', { ref: load.ref })}
                </p>
              ) : null}
            </div>
          </div>
        );
    }
  })();

  const showUpdate = packageTarget !== null && (update !== 'none' || packageUpdate !== null);
>>>>>>> bc50ba56a

  return (
    <div role="status" className="rounded-md border border-border bg-card p-3 flex items-start gap-3">
      <Icon name={presentation.icon} className={cn('size-5 shrink-0 mt-0.5', TONE_ICON_CLASS[presentation.tone])} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('typography-ui-label', TONE_TITLE_CLASS[presentation.tone])}>{presentation.label}</p>
          <SettingsCardPill tone="neutral">{t('settings.plugins.apply.committed')}</SettingsCardPill>
        </div>
        {runtimeProblem ? (
          <p className={cn('typography-micro mt-1', TONE_TITLE_CLASS[presentation.tone])}>
            {t('settings.plugins.apply.restartRequired')}
          </p>
        ) : null}
        {failedWorkers.map(outcome => (
          <p
            key={`${outcome.worker.rootSessionId}:${outcome.worker.workerGeneration}`}
            className="typography-micro font-mono text-[var(--status-error)] mt-1 whitespace-pre-wrap break-words"
          >
            {outcome.worker.rootSessionId}: {outcome.error.detail}
          </p>
        ))}
      </div>
    </div>
  );
};
