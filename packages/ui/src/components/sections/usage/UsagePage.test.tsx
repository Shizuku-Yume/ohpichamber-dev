import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ProviderResult } from '@/types';
import { I18nProvider } from '@/lib/i18n';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { useUsageStatsStore } from '@/components/views/usage/usageStatsStore';
import { UsagePage } from './UsagePage';

// Server rendering reads each store's initial state, not its live state, so the
// fixtures are written onto the initial state (as UsageStatsView.test does).
const quotaServer = useQuotaStore.getInitialState();
const usageServer = useUsageStatsStore.getInitialState();

const usageWindow = {
  usedPercent: 40,
  remainingPercent: 60,
  windowSeconds: 18000,
  resetAfterSeconds: null,
  resetAt: null,
  resetAtFormatted: null,
  resetAfterFormatted: null,
};

const configuredResult = (providerId: ProviderResult['providerId'], providerName: string, patch: Partial<ProviderResult>): ProviderResult => ({
  providerId,
  providerName,
  ok: true,
  configured: true,
  usage: null,
  fetchedAt: 1,
  ...patch,
});

const render = () => renderToStaticMarkup(<I18nProvider><UsagePage /></I18nProvider>);

afterEach(() => {
  Object.assign(quotaServer, { results: [], refreshErrors: {}, nativeToLogical: {} });
  Object.assign(usageServer, { selectedProvider: null });
});

describe('Usage page quota cards', () => {
  test('a model-only quota plan shows its model windows instead of being hidden', () => {
    Object.assign(quotaServer, {
      results: [configuredResult('antigravity', 'Antigravity', {
        usage: { windows: {}, models: { 'gemini-3': { windows: { weekly: usageWindow } } } },
      })],
    });
    const html = render();
    expect(html).toContain('Antigravity');
    expect(html).toContain('Weekly');
    expect(html).not.toContain('No quota windows reported');
  });

  test('a configured provider whose quota fetch failed shows the error, not the empty-state copy', () => {
    Object.assign(quotaServer, {
      results: [configuredResult('claude', 'Claude', { ok: false, error: 'Quota endpoint returned 503' })],
    });
    const html = render();
    expect(html).toContain('Quota endpoint returned 503');
    expect(html).not.toContain('No quota windows reported');
  });

  test('a native provider selection resolves to its logical quota and shows the configured error', () => {
    Object.assign(quotaServer, {
      results: [configuredResult('claude', 'Claude', { ok: false, error: 'Quota endpoint returned 503' })],
      nativeToLogical: { anthropic: 'claude' },
    });
    Object.assign(usageServer, { selectedProvider: 'anthropic' });
    const html = render();
    expect(html).toContain('Quota endpoint returned 503');
    expect(html).not.toContain('does not provide quota data');
  });

  test('a selected configured provider with no quota data says it provides none', () => {
    Object.assign(quotaServer, {
      results: [configuredResult('claude', 'Claude', { usage: null })],
      nativeToLogical: { anthropic: 'claude' },
    });
    Object.assign(usageServer, { selectedProvider: 'anthropic' });
    const html = render();
    expect(html).toContain('does not provide quota data');
  });
});
