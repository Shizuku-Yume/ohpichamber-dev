import { describe, expect, test } from 'bun:test';
import type { OmpSetting } from '@openchamber/agent-contract';
import { providerOptionSettingIds, selectProviderOptionSettings } from './providerOptionRows';

const setting = (
  id: string,
  section: 'service-tier' | 'protocol',
  overrides: Partial<OmpSetting> = {},
): OmpSetting => ({
  id,
  type: id === 'providers.openaiResponsesWebsockets' || id === 'providers.openaiLiveSteering'
    ? 'boolean'
    : 'enum',
  value: null,
  default: null,
  configured: false,
  placement: { type: 'page', page: 'providers', section },
  ...overrides,
});

const ALL_PROVIDER_SETTINGS: readonly OmpSetting[] = [
  setting('tier.openai', 'service-tier'),
  setting('tier.anthropic', 'service-tier'),
  setting('tier.google', 'service-tier'),
  setting('providers.fireworksTier', 'service-tier'),
  setting('providers.kimiApiFormat', 'protocol'),
  setting('providers.openaiWebsockets', 'protocol'),
  setting('providers.openaiResponsesWebsockets', 'protocol'),
  setting('providers.openaiLiveSteering', 'protocol'),
  setting('providers.openrouterVariant', 'protocol'),
];

describe('providerOptionRows', () => {
  const cases: Array<[string, readonly string[]]> = [
    ['openai', ['tier.openai', 'providers.openaiResponsesWebsockets']],
    ['openai-codex', ['tier.openai', 'providers.openaiWebsockets', 'providers.openaiLiveSteering']],
    ['anthropic', ['tier.anthropic']],
    ['google', ['tier.google']],
    ['google-vertex', ['tier.google']],
    ['fireworks', ['providers.fireworksTier']],
    ['kimi-code', ['providers.kimiApiFormat']],
    ['openrouter', ['providers.openrouterVariant']],
  ];
  test.each(cases)('%s maps to its exact setting ids', (providerId, expectedIds) => {
    expect(providerOptionSettingIds(providerId)).toEqual(expectedIds);
    expect(selectProviderOptionSettings(providerId, ALL_PROVIDER_SETTINGS).map((row) => row.id)).toEqual(
      [...expectedIds],
    );
  });

  test('unknown and unrelated providers yield no rows', () => {
    for (const providerId of ['unknown-provider', 'moonshot', 'amazon-bedrock', 'github-copilot', 'custom-1']) {
      expect(providerOptionSettingIds(providerId)).toEqual([]);
      expect(selectProviderOptionSettings(providerId, ALL_PROVIDER_SETTINGS)).toEqual([]);
    }
  });

  test('openai and openai-codex select distinct protocol rows while sharing tier.openai', () => {
    const openaiIds = providerOptionSettingIds('openai');
    const codexIds = providerOptionSettingIds('openai-codex');
    expect(openaiIds).toContain('tier.openai');
    expect(codexIds).toContain('tier.openai');
    expect(openaiIds).toContain('providers.openaiResponsesWebsockets');
    expect(openaiIds).not.toContain('providers.openaiWebsockets');
    expect(openaiIds).not.toContain('providers.openaiLiveSteering');
    expect(codexIds).toContain('providers.openaiWebsockets');
    expect(codexIds).toContain('providers.openaiLiveSteering');
    expect(codexIds).not.toContain('providers.openaiResponsesWebsockets');
  });

  test('google-vertex receives tier.google', () => {
    const rows = selectProviderOptionSettings('google-vertex', ALL_PROVIDER_SETTINGS);
    expect(rows.map((row) => row.id)).toEqual(['tier.google']);
  });

  test('skips settings whose conditionActive is false', () => {
    const gated = ALL_PROVIDER_SETTINGS.map((row) => (
      row.id === 'providers.openaiLiveSteering'
        ? { ...row, condition: 'codexWebsocketsActive', conditionActive: false }
        : row
    ));
    expect(selectProviderOptionSettings('openai-codex', gated).map((row) => row.id)).toEqual([
      'tier.openai',
      'providers.openaiWebsockets',
    ]);
  });
});
