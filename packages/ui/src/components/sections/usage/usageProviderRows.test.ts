import { describe, expect, test } from 'bun:test';
import type { ProviderResult } from '@/types';
import { buildUsageProviderRows, hasQuotaData, quotaCardProviderIds } from './usageProviderRows';

const quotaResult = (providerId: ProviderResult['providerId'], providerName: string): ProviderResult => ({
  providerId,
  providerName,
  ok: true,
  configured: true,
  usage: null,
  fetchedAt: 1,
});

const nativeToLogical = { anthropic: 'claude', 'openai-codex': 'codex' };

describe('buildUsageProviderRows', () => {
  test('a native provider id and its logical quota id merge into one row', () => {
    const rows = buildUsageProviderRows({
      configProviders: [{ providerId: 'anthropic', name: 'Anthropic' }],
      statsProviders: [{ providerId: 'anthropic' }],
      results: [quotaResult('claude', 'Claude')],
      nativeToLogical,
    });
    expect(rows).toEqual([{ quotaProviderId: 'claude', statsProviderId: 'anthropic', name: 'Anthropic' }]);
  });

  test('a logical quota result for a provider the config lists is not a second row', () => {
    const rows = buildUsageProviderRows({
      configProviders: [{ providerId: 'openai-codex', name: 'OpenAI Codex' }],
      statsProviders: [],
      results: [quotaResult('codex', 'Codex')],
      nativeToLogical,
    });
    expect(rows.map((row) => row.quotaProviderId)).toEqual(['codex']);
    expect(rows[0].statsProviderId).toBe('openai-codex');
  });

  test('a quota result with no native counterpart keeps its own row', () => {
    const rows = buildUsageProviderRows({
      configProviders: [],
      statsProviders: [],
      results: [quotaResult('antigravity', 'Antigravity')],
      nativeToLogical,
    });
    expect(rows).toEqual([{ quotaProviderId: 'antigravity', statsProviderId: 'antigravity', name: 'Antigravity' }]);
  });

  test('an unconfigured quota result adds no row', () => {
    const rows = buildUsageProviderRows({
      configProviders: [],
      statsProviders: [],
      results: [{ ...quotaResult('claude', 'Claude'), configured: false }],
      nativeToLogical,
    });
    expect(rows).toEqual([]);
  });

  test('a provider only the statistics report keeps its native id for filtering', () => {
    const rows = buildUsageProviderRows({
      configProviders: [],
      statsProviders: [{ providerId: 'CLIProxyAPI' }],
      results: [],
      nativeToLogical,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].statsProviderId).toBe('CLIProxyAPI');
    expect(rows[0].name).toBe('CLIProxyAPI');
  });
});

const usageWindow = {
  usedPercent: 40,
  remainingPercent: 60,
  windowSeconds: 18000,
  resetAfterSeconds: null,
  resetAt: null,
  resetAtFormatted: null,
  resetAfterFormatted: null,
};

describe('hasQuotaData', () => {
  test('provider windows and model windows each count as data', () => {
    expect(hasQuotaData({ windows: { session: usageWindow } })).toBe(true);
    expect(hasQuotaData({ windows: {}, models: { 'gemini-3': { windows: { daily: usageWindow } } } })).toBe(true);
    expect(hasQuotaData({ windows: {}, models: { 'gemini-3': { windows: {} } } })).toBe(false);
    expect(hasQuotaData({ windows: {} })).toBe(false);
    expect(hasQuotaData(null)).toBe(false);
  });
});

describe('quotaCardProviderIds', () => {
  const providers = [{ id: 'claude' as const }, { id: 'antigravity' as const }, { id: 'codex' as const }];

  test('a model-only quota plan keeps its card', () => {
    const antigravity: ProviderResult = {
      ...quotaResult('antigravity', 'Antigravity'),
      usage: { windows: {}, models: { 'gemini-3': { windows: { daily: usageWindow } } } },
    };
    expect(quotaCardProviderIds(providers, [antigravity], {})).toEqual(['antigravity']);
  });

  test('a configured provider whose fetch failed keeps its card with the error', () => {
    const failed: ProviderResult = { ...quotaResult('claude', 'Claude'), ok: false, error: 'Quota endpoint returned 503', usage: null };
    expect(quotaCardProviderIds(providers, [failed], {})).toEqual(['claude']);
  });

  test('a refresh failure with no sample keeps its card, unless the list says the provider is unconfigured', () => {
    expect(quotaCardProviderIds(providers, [], { codex: 'Network error' })).toEqual(['codex']);
    const unconfigured: ProviderResult = { ...quotaResult('codex', 'Codex'), configured: false };
    expect(quotaCardProviderIds(providers, [unconfigured], { codex: 'Network error' })).toEqual([]);
  });

  test('a configured provider with neither data nor an error has no card, and an unconfigured one never does', () => {
    const empty: ProviderResult = { ...quotaResult('claude', 'Claude'), usage: null };
    const unconfigured: ProviderResult = { ...quotaResult('codex', 'Codex'), configured: false, usage: { windows: { session: usageWindow } } };
    expect(quotaCardProviderIds(providers, [empty, unconfigured], {})).toEqual([]);
  });
});
