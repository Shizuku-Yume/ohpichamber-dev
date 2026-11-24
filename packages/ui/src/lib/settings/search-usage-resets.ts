import type { SettingsSearchItem } from './search';

const USAGE_RESETS_SETTING_IDS = [
  'codexResets.autoRedeem5h',
  'codexResets.autoRedeemWeekly',
  'codexResets.minBlockedMinutes',
  'codexResets.keepCredits',
  'codexResets.salvageHorizonHours',
  'claudeResets.autoRedeem5h',
  'claudeResets.autoRedeemWeekly',
  'claudeResets.autoRedeemFable',
  'claudeResets.minBlockedMinutes',
  'claudeResets.keepCredits',
  'claudeResets.salvageHorizonHours',
] as const;

export const usageResetsSearchItems = (): SettingsSearchItem[] => USAGE_RESETS_SETTING_IDS.map((settingId) => ({
  id: `omp.${settingId}`,
  page: 'usage',
  titleKey: `settings.omp.items.${settingId}.label`,
  descriptionKey: `settings.omp.items.${settingId}.description`,
}));

export const MODEL_ROLES_CUSTOM_SECTION_SEARCH_ITEM: SettingsSearchItem = {
  id: 'model-roles.section.custom',
  page: 'model-roles',
  titleKey: 'settings.omp.modelRoles.section.custom.title',
  descriptionKey: 'settings.omp.modelRoles.section.custom.description',
  keywords: ['roles', 'custom', 'tags', 'model tags', 'add role'],
};
