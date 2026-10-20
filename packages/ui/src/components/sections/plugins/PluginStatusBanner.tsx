import React from 'react';
import type { PluginMutationResult } from '@openchamber/agent-contract';
import { useI18n } from '@/lib/i18n';

/** A committed configuration and an active worker publication are independent outcomes. */
export const PluginStatusBanner: React.FC<{ result: PluginMutationResult }> = ({ result }) => {
  const { t } = useI18n();
  const failedCount = result.workers.filter(worker => worker.outcome === 'failed').length;
  const status = result.status === 'applied' ? t('settings.plugins.apply.applied')
    : result.status === 'partial' ? t('settings.plugins.apply.partial', { failedCount })
      : result.status === 'failed' ? t('settings.plugins.apply.failed') : t('settings.plugins.apply.noActiveWorkers');
  return (
    <div role="status" className="space-y-1 rounded-md border p-3 typography-meta">
      <p>{t('settings.plugins.apply.committed')}</p><p>{status}</p>
      {result.status === 'failed' || result.status === 'partial' ? <p>{t('settings.plugins.apply.restartRequired')}</p> : null}
      {result.workers.map(outcome => outcome.outcome === 'failed' ? <p key={`${outcome.worker.rootSessionId}:${outcome.worker.workerGeneration}`}>{outcome.worker.rootSessionId}: {outcome.error.detail}</p> : null)}
    </div>
  );
};
