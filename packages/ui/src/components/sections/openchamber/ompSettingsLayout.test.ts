import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlacement } from '@openchamber/agent-contract';
import { dict as enDict } from '@/lib/i18n/messages/en';
import { dict as esDict } from '@/lib/i18n/messages/es';
import { dict as deDict } from '@/lib/i18n/messages/de';
import { dict as frDict } from '@/lib/i18n/messages/fr';
import { dict as nlDict } from '@/lib/i18n/messages/nl';
import { dict as jaDict } from '@/lib/i18n/messages/ja';
import { dict as koDict } from '@/lib/i18n/messages/ko';
import { dict as plDict } from '@/lib/i18n/messages/pl';
import { dict as ptBrDict } from '@/lib/i18n/messages/pt-BR';
import { dict as ukDict } from '@/lib/i18n/messages/uk';
import { dict as zhCnDict } from '@/lib/i18n/messages/zh-CN';
import { dict as zhTwDict } from '@/lib/i18n/messages/zh-TW';
import { dict as trDict } from '@/lib/i18n/messages/tr';
import { dict as arDict } from '@/lib/i18n/messages/ar';
import { dict as heDict } from '@/lib/i18n/messages/he';
import { SETTINGS_SEARCH_ITEMS } from '@/lib/settings/search';

import {
  OMP_SETTINGS_LAYOUT,
  isPresetEntry,
  ompLayoutSettingIds,
  ompSettingsTabForSearchTarget,
  type OmpLayoutGroup,
  type OmpLayoutTab,
  type OmpSettingsTab,
} from './ompSettingsLayout';

const OMP_SETTING_IDS = ompLayoutSettingIds();

const localeDictionaries = {
  en: enDict,
  de: deDict,
  fr: frDict,
  nl: nlDict,
  es: esDict,
  ja: jaDict,
  'pt-BR': ptBrDict,
  uk: ukDict,
  ko: koDict,
  pl: plDict,
  'zh-CN': zhCnDict,
  'zh-TW': zhTwDict,
  tr: trDict,
  ar: arDict,
  he: heDict,
} satisfies Record<string, Record<string, string>>;

/** Engine ids the agent service places on the OMP page, read from its placement table. */
const exposedEngineIds = (): string[] => {
  const settingsUiPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../agent-service/src/worker/settings-ui.ts',
  );
  const source = readFileSync(settingsUiPath, 'utf8');
  const match = source.match(/const RAW_PLACEMENTS: Readonly<Record<string, string>> = \{([\s\S]*?)\n\};/);
  if (!match) throw new Error('RAW_PLACEMENTS not found in settings-ui.ts');
  const ids: string[] = [];
  for (const rawLine of match[1].split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//')) continue;
    const entry = line.match(/^'([^']+)':\s*'([^']+)',?(?:\s*\/\/.*)?$/);
    if (!entry) throw new Error(`Unparseable RAW_PLACEMENTS entry: ${line}`);
    if (parsePlacement(entry[2]).type === 'engine') ids.push(entry[1]);
  }
  return ids;
};
const ENGINE_PLACED_IDS = exposedEngineIds();

const groupSettingIds = (group: OmpLayoutGroup): string[] => group.entries.map(
  (entry) => (isPresetEntry(entry) ? 'read.summarize.enabled' : entry),
);

const tabOf = (settingId: string): OmpSettingsTab | null => (
  OMP_SETTINGS_LAYOUT.find((tab: OmpLayoutTab) => tab.groups.some(
    (group) => groupSettingIds(group).includes(settingId),
  ))?.id ?? null
);

describe('OMP settings layout', () => {
  test('the layout covers each engine row the agent service exposes exactly once', () => {
    expect(ENGINE_PLACED_IDS.length).toBe(102);
    expect([...OMP_SETTING_IDS].sort()).toEqual([...ENGINE_PLACED_IDS].sort());
  });

  test('no setting appears twice across the four tabs or twice inside one tab', () => {
    expect(new Set(OMP_SETTING_IDS).size).toBe(OMP_SETTING_IDS.length);
    for (const tab of OMP_SETTINGS_LAYOUT) {
      const ids = tab.groups.flatMap(groupSettingIds);
      expect({ tab: tab.id, unique: new Set(ids).size === ids.length }).toEqual({ tab: tab.id, unique: true });
    }
  });

  test('the four tabs are ordered common, editing, execution, advanced', () => {
    expect(OMP_SETTINGS_LAYOUT.map((tab) => tab.id)).toEqual(['common', 'editing', 'execution', 'advanced']);
  });

  test('terminal-only and egress rows are not in the layout', () => {
    const moved = [
      'read.renderMarkdown', 'read.toolResultPreview', 'mcp.renderMarkdownResults',
      'async.printWake', 'extensionRenderers.assistantText',
      'dev.autoqa', 'spotlight.experiment.enabled',
    ];
    for (const id of moved) {
      expect(`${id}: ${OMP_SETTING_IDS.includes(id)}`).toBe(`${id}: false`);
    }
  });

  test('the read-summary preset owns the enabled switch instead of a separate row', () => {
    const presetEntries = OMP_SETTINGS_LAYOUT.flatMap((tab) => tab.groups.flatMap((group) => group.entries))
      .filter(isPresetEntry);
    expect(presetEntries).toEqual([{ preset: 'readSummary' }]);
    expect(OMP_SETTING_IDS.filter((id) => id === 'read.summarize.enabled').length).toBe(1);
    expect(tabOf('read.summarize.enabled')).toBe('editing');
  });

  test('every tab and group title has copy in all fifteen locales', () => {
    const keys = [
      ...OMP_SETTINGS_LAYOUT.map((tab) => `settings.omp.tab.${tab.id}`),
      ...OMP_SETTINGS_LAYOUT.flatMap((tab) => tab.groups.map((group) => `settings.omp.group.${group.id}`)),
    ];
    const missing: string[] = [];
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      for (const key of keys) {
        if (!Object.hasOwn(dictionary, key)) missing.push(`${locale}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
    expect(Object.keys(localeDictionaries)).toHaveLength(15);
  });

  test('every layout row has a label and description in the English dictionary', () => {
    const missing = OMP_SETTING_IDS.flatMap((id) => [
      `settings.omp.items.${id}.label`,
      `settings.omp.items.${id}.description`,
    ]).filter((key) => !Object.hasOwn(localeDictionaries.en, key));
    expect(missing).toEqual([]);
  });

  test('the search table has one entry per layout row and none for a moved row', () => {
    const ompPageIds = SETTINGS_SEARCH_ITEMS.filter((item) => item.page === 'omp').map((item) => item.id);
    for (const id of OMP_SETTING_IDS) {
      const matches = ompPageIds.filter((candidate) => candidate === `omp.${id}`);
      expect({ id, count: matches.length }).toEqual({ id, count: 1 });
    }
    // The page's own non-row anchors: the closing config.yml section and the
    // reset-credit rules, which the advanced tab draws as two provider
    // disclosures rather than as layout rows. Model roles moved to their own page.
    const extra = ompPageIds.filter((candidate) => !OMP_SETTING_IDS.some((id) => candidate === `omp.${id}`));
    expect(extra.sort()).toEqual([
      'omp.claudeResets.autoRedeem5h',
      'omp.claudeResets.autoRedeemFable',
      'omp.claudeResets.autoRedeemWeekly',
      'omp.claudeResets.keepCredits',
      'omp.claudeResets.minBlockedMinutes',
      'omp.claudeResets.salvageHorizonHours',
      'omp.codexResets.autoRedeem5h',
      'omp.codexResets.autoRedeemWeekly',
      'omp.codexResets.keepCredits',
      'omp.codexResets.minBlockedMinutes',
      'omp.codexResets.salvageHorizonHours',
      'omp.configFile',
    ]);
    for (const id of ['omp.dev.autoqa', 'omp.spotlight.experiment.enabled', 'omp.read.renderMarkdown']) {
      expect(`${id}: ${ompPageIds.includes(id)}`).toBe(`${id}: false`);
    }
  });

  test('each search anchor opens the tab that draws its row', () => {
    for (const id of OMP_SETTING_IDS) {
      expect({ id, tab: ompSettingsTabForSearchTarget(`omp.${id}`) }).toEqual({ id, tab: tabOf(id) });
    }
    expect(ompSettingsTabForSearchTarget('omp.preset.readSummary')).toBe('editing');
    expect(ompSettingsTabForSearchTarget('omp.configFile')).toBe('advanced');
    expect(ompSettingsTabForSearchTarget('omp.codexResets.autoRedeem5h')).toBe('advanced');
    expect(ompSettingsTabForSearchTarget('omp.claudeResets.keepCredits')).toBe('advanced');
    expect(ompSettingsTabForSearchTarget('chat.streaming')).toBeNull();
  });
});
