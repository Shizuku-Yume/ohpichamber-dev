import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { Window } from 'happy-dom';
import { UsageStatsSchema, type OmpSetting, type OmpSettingsState } from '@openchamber/agent-contract';
import * as omp from '@/components/sections/shared/useOmpPageSettings';
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
        configuredResult('claude', 'Claude', { usage: { windows: {
          'Duplicate quota window': usageWindow,
          'Other quota window': { ...usageWindow, windowSeconds: null },
        } } }),
        configuredResult('ext-fixture', 'Fixture extension', { usage: { windows: { 'Guest quota window': usageWindow } } }),
      ],
      nativeToLogical: { anthropic: 'claude' },
    });
    const request = { range: '30d', projectDirectory: null } as const;
    Object.assign(usageServer, { entries: {
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
    } });
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

describe('Usage page reset credit disclosures', () => {
  let browser: Window;
  let host: HTMLDivElement;
  let root: Root;
  let restoreOmp: (() => void) | null = null;

  beforeEach(() => {
    browser = new Window({ url: 'http://localhost/' });
    Object.assign(globalThis, {
      window: browser,
      document: browser.document,
      navigator: browser.navigator,
      Node: browser.Node,
      Element: browser.Element,
      HTMLElement: browser.HTMLElement,
      Event: browser.Event,
      MouseEvent: browser.MouseEvent,
      MutationObserver: browser.MutationObserver,
      getComputedStyle: browser.getComputedStyle.bind(browser),
      requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
      cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
      IS_REACT_ACT_ENVIRONMENT: true,
    });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    restoreOmp?.();
    restoreOmp = null;
    host.remove();
    browser.close();
  });

  const resetSetting = (
    id: string,
    type: 'enum' | 'number',
    value: string | number,
    conditionActive = true,
  ): OmpSetting => {
    const base: OmpSetting = {
      id,
      type,
      default: value,
      configured: true,
      value,
      conditionActive,
      placement: { type: 'page', page: 'usage', section: 'resets' },
    };
    if (type === 'enum') {
      return { ...base, enumValues: ['unset', 'yes', 'no'] };
    }
    return base;
  };
  test('renders Codex and Claude disclosures collapsed by default and expands auto-redeem rows before thresholds', async () => {
    const resetSettings: OmpSetting[] = [
      resetSetting('codexResets.autoRedeem5h', 'enum', 'yes'),
      resetSetting('codexResets.autoRedeemWeekly', 'enum', 'no', false),
      resetSetting('codexResets.minBlockedMinutes', 'number', 45),
      resetSetting('codexResets.keepCredits', 'number', 2),
      resetSetting('codexResets.salvageHorizonHours', 'number', 8),
      resetSetting('claudeResets.autoRedeem5h', 'enum', 'unset'),
      resetSetting('claudeResets.autoRedeemWeekly', 'enum', 'unset'),
      resetSetting('claudeResets.autoRedeemFable', 'enum', 'unset'),
      resetSetting('claudeResets.minBlockedMinutes', 'number', 60),
      resetSetting('claudeResets.keepCredits', 'number', 0),
      resetSetting('claudeResets.salvageHorizonHours', 'number', 12),
    ];
    const ompState: OmpSettingsState = {
      workspaceId: 'workspace_1',
      revision: '1',
      totalCount: resetSettings.length,
      settings: resetSettings,
    };
    const spy = spyOn(omp, 'useOmpPageSettings').mockReturnValue({
      state: ompState,
      form: {},
      loading: false,
      saving: false,
      pageSettings: resetSettings,
      getSectionSettings: (section) => (section === 'resets' ? resetSettings : []),
      updateSetting: async () => { },
      updateSettings: async () => true,
    });
    restoreOmp = () => spy.mockRestore();

    await act(async () => root.render(<I18nProvider><UsagePage /></I18nProvider>));

    const triggers = Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'));
    const codexTrigger = triggers.find((button) => button.textContent?.includes('Codex'));
    const claudeTrigger = triggers.find((button) => button.textContent?.includes('Claude'));
    expect(codexTrigger?.getAttribute('aria-expanded')).toBe('false');
    expect(claudeTrigger?.getAttribute('aria-expanded')).toBe('false');
    expect(codexTrigger?.textContent).toContain('Mixed · 45m · 2 · 8h');
    expect(claudeTrigger?.textContent).toContain('Ask · 60m · 0 · 12h');

    expect(host.querySelector('[data-settings-item="omp.codexResets.autoRedeem5h"]')).toBeNull();
    expect(host.querySelector('[data-settings-item="omp.codexResets.minBlockedMinutes"]')).toBeNull();

    await act(async () => codexTrigger?.click());
    expect(codexTrigger?.getAttribute('aria-expanded')).toBe('true');

    const codexRowIds = Array.from(host.querySelectorAll<HTMLElement>('[data-settings-item^="omp.codexResets."]'))
      .map((node) => node.getAttribute('data-settings-item'));
    expect(codexRowIds).toEqual([
      'omp.codexResets.autoRedeem5h',
      'omp.codexResets.autoRedeemWeekly',
      'omp.codexResets.minBlockedMinutes',
      'omp.codexResets.keepCredits',
      'omp.codexResets.salvageHorizonHours',
    ]);
    expect(host.textContent).toContain('A native configuration override sets this value.');
    expect(host.querySelector('[data-settings-item="omp.claudeResets.autoRedeem5h"]')).toBeNull();
  });
});
