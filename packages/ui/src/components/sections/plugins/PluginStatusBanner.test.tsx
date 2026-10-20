import React from 'react';
import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { PluginMutationResultSchema, type PluginMutationResult, type PluginWorkerApplyOutcome } from '@openchamber/agent-contract';
import { I18nProvider, useI18nStore } from '@/lib/i18n';
import { PluginStatusBanner } from './PluginStatusBanner';

const worker = { rootSessionId: 'session_one', workspaceId: 'workspace_one', workerGeneration: 'generation_one' };
const failed: PluginWorkerApplyOutcome = {
  worker, outcome: 'failed', appliedRevision: '2',
  error: { code: 'RESTART_REQUIRED', detail: 'The previous plugin runtime is still active.', retryable: false },
};

const result = (workers: PluginWorkerApplyOutcome[], status: PluginMutationResult['status']): PluginMutationResult => PluginMutationResultSchema.parse({
  workspaceId: worker.workspaceId, revision: '3', persistence: 'committed', status, workers,
  catalog: { workspaceId: worker.workspaceId, revision: '3', plugins: [], marketplace: [], localExtensions: [], workers: [] },
});

test('a saved configuration with a failed runtime apply stays visibly committed and explains the retained runtime', async () => {
  await useI18nStore.getState().setLocale('en');
  const output = renderToStaticMarkup(<I18nProvider><PluginStatusBanner result={result([failed], 'failed')} /></I18nProvider>);
  expect(output).toContain('Committed');
  expect(output).toContain('Failed to apply');
  expect(output).toContain('Restart required');
  expect(output).toContain('The previous plugin runtime is still active.');
  expect(output).not.toContain('>Applied<');
});

test('a partial apply does not claim all workers loaded the new configuration', async () => {
  await useI18nStore.getState().setLocale('en');
  const applied: PluginWorkerApplyOutcome = { worker: { ...worker, rootSessionId: 'session_two' }, outcome: 'applied', appliedRevision: '3' };
  const output = renderToStaticMarkup(<I18nProvider><PluginStatusBanner result={result([applied, failed], 'partial')} /></I18nProvider>);
  expect(output).toContain('Partially applied (1 failed)');
  expect(output).toContain('session_one');
  expect(output).toContain('Restart required');
});

test('saving with no active sessions does not display a fake runtime apply success', async () => {
  await useI18nStore.getState().setLocale('en');
  const output = renderToStaticMarkup(<I18nProvider><PluginStatusBanner result={result([], 'no-active-workers')} /></I18nProvider>);
  expect(output).toContain('Committed');
  expect(output).toContain('No active workers');
  expect(output).not.toContain('>Applied<');
  expect(output).not.toContain('Restart required');
});
