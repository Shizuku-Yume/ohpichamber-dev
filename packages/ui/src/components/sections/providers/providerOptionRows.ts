import type { OmpSetting } from '@openchamber/agent-contract';

const PROVIDER_OPTION_IDS = new Map<string, readonly string[]>([
  ['openai', ['tier.openai', 'providers.openaiResponsesWebsockets']],
  ['openai-codex', ['tier.openai', 'providers.openaiWebsockets', 'providers.openaiLiveSteering']],
  ['anthropic', ['tier.anthropic']],
  ['google', ['tier.google']],
  ['google-vertex', ['tier.google']],
  ['fireworks', ['providers.fireworksTier']],
  ['kimi-code', ['providers.kimiApiFormat']],
  ['openrouter', ['providers.openrouterVariant']],
]);

export function providerOptionSettingIds(providerId: string): readonly string[] {
  return PROVIDER_OPTION_IDS.get(providerId) ?? [];
}

export function selectProviderOptionSettings(
  providerId: string,
  sectionSettings: readonly OmpSetting[],
): OmpSetting[] {
  const ids = providerOptionSettingIds(providerId);
  if (ids.length === 0) return [];
  const byId = new Map<string, OmpSetting>();
  for (const setting of sectionSettings) {
    if (setting.conditionActive !== false) {
      byId.set(setting.id, setting);
    }
  }
  const rows: OmpSetting[] = [];
  for (const id of ids) {
    const setting = byId.get(id);
    if (setting) rows.push(setting);
  }
  return rows;
}
