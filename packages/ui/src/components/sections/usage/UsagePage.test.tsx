import { afterEach, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { UsageStatsSchema } from '@openchamber/agent-contract';
import type { ProviderResult } from '@/types';
import { I18nProvider } from '@/lib/i18n';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { usageStatsKey, useUsageStatsStore } from '@/components/views/usage/usageStatsStore';
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
  Object.assign(usageServer, { selectedProvider: null, entries: {} });
});

describe('Usage page quota cards', () => {
  test('uses canonical quota windows for multiple OMP accounts and retains Work status controls', () => {
    Object.assign(quotaServer, {
      results: [
        configuredResult('claude', 'Claude', {
          usage: {
            windows: {
              'Duplicate quota window': usageWindow,
              'Other quota window': { ...usageWindow, windowSeconds: null },
            }
          }
        }),
        configuredResult('ext-fixture', 'Fixture extension', { usage: { windows: { 'Guest quota window': usageWindow } } }),
      ],
      nativeToLogical: { anthropic: 'claude' },
    });
    const request = { range: '30d', projectDirectory: null } as const;
    Object.assign(usageServer, {
      entries: {
        [usageStatsKey(getRuntimeKey(), request)]: {
          stats: UsageStatsSchema.parse({
            range: { from: 1, to: 1000 }, sessions: 0, subagents: 0, prompts: 0, steps: 0,
            tokens: { input: 0, output: 0, reasoning: null, cacheRead: 0, cacheWrite: 0, total: 0 }, cost: 0,
            tools: { mode: 'none' }, activeDays: 0, streak: 0, activity: [], providers: [], models: [], partial: false,
            accounts: {
              history: [],
              reports: [
                {
                  provider: 'anthropic', fetchedAt: 1000, limits: [{
                    id: 'weekly', label: 'Native weekly quota', scope: { provider: 'anthropic' },
                    window: { id: 'weekly', label: 'Native weekly quota', durationMs: 18000000 },
                    amount: { unit: 'percent', usedFraction: 1 }, status: 'exhausted',
                  }], resetCredits: { availableCount: 2 },
                },
                {
                  provider: 'anthropic', fetchedAt: 1000, limits: [{
                    id: 'weekly', label: 'Native weekly quota', scope: { provider: 'anthropic' },
                    amount: { unit: 'percent', remainingFraction: 0.6 },
                  }, {
                    id: 'balance', label: 'Credit balance', scope: { provider: 'anthropic' },
                    amount: { unit: 'credits', remaining: 17.25 },
                  }],
                },
              ],
            },
          }),
          loading: false, error: null, fetchedAt: 1000,
        },
      }
    });
    const html = render();
    expect(html).toContain('anthropic account 1');
    expect(html).toContain('anthropic account 2');
    expect(html).toContain('Available reset credits: 2');
    expect(html).toContain('Quota limit reached');
    expect(html).toContain('Native weekly quota');
    expect(html).toMatch(/Credit balance.*>17\.25</);
    expect(html).toContain('Guest quota window');
    expect(html).toContain('Show in work status');
    expect(html).toContain('Other quota window');
    expect(html).not.toContain('Duplicate quota window');
  });

  test('a model-only quota plan shows its model windows instead of being hidden', () => {
    Object.assign(quotaServer, {
      results: [configuredResult('google', 'Google', {
        usage: { windows: {}, models: { 'gemini-3': { windows: { weekly: usageWindow } } } },
      })],
    });
    const html = render();
    expect(html).toContain('Google');
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

describe('Usage page reset credit rules', () => {
  test('UsagePage does not render reset credit rules (moved to OMP settings)', () => {
    const html = render();
    expect(html).not.toContain('codexResets');
    expect(html).not.toContain('claudeResets');
    // The reset disclosures and their section title live on the OMP settings
    // advanced tab, not on Usage.
    expect(html).not.toContain('data-settings-item="omp.codexResets.autoRedeem5h"');
    expect(html).not.toContain('Auto-use reset credits');
  });
});
