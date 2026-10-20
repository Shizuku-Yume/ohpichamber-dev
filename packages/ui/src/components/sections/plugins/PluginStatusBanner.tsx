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

  return (
    <div role="status" className="rounded-md border border-border bg-card p-3 flex items-start gap-3">
      <Icon name={presentation.icon} className={cn('h-5 w-5 shrink-0 mt-0.5', TONE_ICON_CLASS[presentation.tone])} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('typography-label', TONE_TITLE_CLASS[presentation.tone])}>{presentation.label}</p>
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
