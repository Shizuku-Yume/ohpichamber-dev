import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { dict as enDict } from './messages/en';
import { getCustomizableShortcutActions } from '@/lib/shortcuts';
import { dict as esDict } from './messages/es';
import { dict as deDict } from './messages/de';
import { dict as frDict } from './messages/fr';
import { dict as nlDict } from './messages/nl';
import { dict as jaDict } from './messages/ja';
import { dict as koDict } from './messages/ko';
import { dict as plDict } from './messages/pl';
import { dict as ptBrDict } from './messages/pt-BR';
import { dict as ukDict } from './messages/uk';
import { dict as zhCnDict } from './messages/zh-CN';
import { dict as zhTwDict } from './messages/zh-TW';
import { dict as trDict } from './messages/tr';
import { dict as arDict } from './messages/ar';
import { dict as heDict } from './messages/he';
import { ompSettingsI18n } from './messages/omp-settings.i18n';

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
} as const;

describe('i18n dictionaries', () => {
  test('structured quota value labels are translated and preserve their value placeholders in every locale', () => {
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      expect(dictionary['quota.value.requests']).toContain('{count}');
      expect(dictionary['quota.value.spent']).toContain('{spent}');
      expect(dictionary['quota.value.spentOf']).toContain('{spent}');
      expect(dictionary['quota.value.spentOf']).toContain('{limit}');
      if (locale !== 'en') {
        for (const key of ['quota.value.requests', 'quota.value.spent', 'quota.value.spentOf'] as const) {
          expect(dictionary[key]).not.toBe(enDict[key]);
        }
      }
    }
  });

  test('credits-used messages carry the amount and are translated in every locale', () => {
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      expect(dictionary['quota.value.creditsUsed']).toContain('{credits}');
      if (locale !== 'en') {
        expect(dictionary['quota.value.creditsUsed']).not.toBe(enDict['quota.value.creditsUsed']);
      }
    }
  });

  test('monthly spending labels and the unknown amount are translated in every locale', () => {
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      expect(dictionary['quota.window.monthlyTotal']).toBeTruthy();
      expect(dictionary['quota.window.monthlyByok']).toContain('BYOK');
      expect(dictionary['quota.value.unknown']).toBeTruthy();
      if (locale !== 'en') {
        expect(dictionary['quota.window.monthlyTotal']).not.toBe(enDict['quota.window.monthlyTotal']);
        expect(dictionary['quota.window.monthlyByok']).not.toBe(enDict['quota.window.monthlyByok']);
        expect(dictionary['quota.value.unknown']).not.toBe(enDict['quota.value.unknown']);
      }
    }
  });
  test('repository links name either provider in every locale', () => {
    for (const dictionary of Object.values(localeDictionaries)) {
      expect(dictionary['gitView.header.openRepository']).toContain('{provider}');
    }
  });

  // A review host's change carries the same provider-neutral wording as a pull
  // or merge request: each `change` member names its host through `{provider}`.
  test('change families name their provider in every locale', () => {
    const changeKeys = [
      'settings.sourceControl.provider.description.change',
      'references.picker.empty.notConnected.change',
      'chat.chatInput.actions.linkRepositoryItem.change',
      'session.newWorktree.actions.startFromRepository.change',
      'sourceBoard.list.repository.change',
      'gitView.change.actions.openOnProviderAria',
      'settings.sourceControl.field.username.info',
      'settings.sourceControl.field.httpPassword.info',
      'settings.sourceControl.field.httpPassword.rejected',
    ] as const;
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      for (const key of changeKeys) {
        expect(`${locale} ${key}: ${dictionary[key].includes('{provider}')}`).toBe(`${locale} ${key}: true`);
        expect(`${locale} ${key}: ${/GitHub|GitLab|Gerrit|Linear/.test(dictionary[key])}`).toBe(`${locale} ${key}: false`);
      }
    }
  });
  // A sentence that names its provider through `{provider}` serves every
  // provider; a literal product name would put GitHub's words on Gitea's card.
  test('provider sentences keep {provider} and name no product in every locale', () => {
    const english: Record<string, string> = enDict;
    const providerKeys = Object.keys(english).filter((key) => english[key].includes('{provider}'));
    expect(providerKeys.length).toBeGreaterThan(0);
    expect(providerKeys).toContain('sourceBoard.list.repository.change');
    expect(providerKeys).toContain('chat.chatInput.actions.linkRepositoryItem.change');
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      const translated: Record<string, string> = dictionary;
      for (const key of providerKeys) {
        const text = translated[key];
        if (text === undefined && (locale === 'ar' || locale === 'he')) continue;
        expect(`${locale} ${key}: ${(text ?? '').includes('{provider}')}`).toBe(`${locale} ${key}: true`);
        expect(`${locale} ${key}: ${/GitHub|GitLab|Linear/.test(text ?? '')}`).toBe(`${locale} ${key}: false`);
      }
    }
  });

  test('anonymous transport has a translated read-only label in every locale', () => {
    const key = 'settings.sourceControl.transport.anonymous';
    expect(enDict[key]).toBe('Anonymous HTTPS, read-only');
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      expect(dictionary[key]).toBeTruthy();
      if (locale !== 'en') expect(dictionary[key]).not.toBe(enDict[key]);
    }
  });

  test('double-paste settings copy is translated', () => {
    const labelKey = 'settings.openchamber.visual.option.largeTextPaste.inlineDoublePaste.label';
    const hintKey = 'settings.openchamber.visual.field.largeTextPasteHint';
    expect(enDict[labelKey]).toBe('Paste inline, double-paste to attach');
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      expect(dictionary[labelKey]).toBeTruthy();
      if (locale !== 'en') {
        expect(dictionary[labelKey]).not.toBe(enDict[labelKey]);
        expect(dictionary[hintKey]).not.toBe(enDict[hintKey]);
      }
    }
  });
  test('every customizable shortcut has an English label', () => {
    const missing = getCustomizableShortcutActions()
      .map((action) => action.settingsLabelKey)
      .filter((key) => !(key in enDict));
    expect(missing).toEqual([]);
  });

  test('all locales stay in key parity with english', () => {
    const sharedEnglishKeys = Object.keys(enDict).filter((k) => !k.startsWith('settings.omp.')).sort();
    const allEnglishKeys = Object.keys(enDict).sort();

    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      if (locale === 'ar' || locale === 'he') {
        const extra = Object.keys(dictionary).filter((k) => !(k in enDict));
        expect(extra, `${locale} extra keys`).toEqual([]);
      } else if (locale === 'zh-CN') {
        expect(Object.keys(dictionary).sort(), `${locale} keys`).toEqual(allEnglishKeys);
      } else {
        expect(Object.keys(dictionary).filter((k) => !k.startsWith('settings.omp.')).sort(), `${locale} keys`)
          .toEqual(sharedEnglishKeys);
      }
    }
  });

  test('the OMP settings page is translated in every locale, not just English', () => {
    // The page renders only curated rows, so its copy is ordinary vocabulary
    // now: each locale carries every OMP key, translated, with the same
    // placeholders. A missing key would otherwise fall back to its raw id or
    // to English at runtime.
    const ompKeys = Object.keys(enDict).filter((k) => k.startsWith('settings.omp.')).sort();
    expect(ompKeys.length).toBeGreaterThan(0);
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      const missing = ompKeys.filter((key) => !(key in dictionary));
      expect(missing, `${locale} missing OMP keys`).toEqual([]);
      const removed = [
        'settings.omp.configFile.terminal',
        'settings.omp.configFile.elsewhere',
        'settings.omp.configFile.egress',
      ].filter((key) => key in dictionary);
      expect(removed, `${locale} unexpected removed OMP footer keys`).toEqual([]);
      if (locale === 'en') continue;
      // Some vocabulary is genuinely shared (`OMP`, a `Skills` heading, `%`),
      // so equality alone is not proof of an untranslated string: the product
      // name stays `OMP` in every locale by design. The page-level prose must
      // differ; every key must at least be present.
      for (const key of [
        'settings.page.omp.description',
        'settings.omp.configFile.title',
        'settings.omp.openConfig',
        'settings.omp.modelRoles.description',
        'settings.omp.section.retry.description',
      ] as const) {
        expect(dictionary[key], `${locale} ${key}`).not.toBe(enDict[key]);
      }
      const placeholderDrift = ompKeys.filter((key) => {
        const pattern = /\{\w+\}/g;
        const english = (enDict as Record<string, string>)[key] ?? '';
        const translated = (dictionary as Record<string, string>)[key] ?? '';
        return (english.match(pattern) ?? []).join() !== (translated.match(pattern) ?? []).join();
      });
      expect(placeholderDrift, `${locale} OMP placeholder drift`).toEqual([]);
    }
  });

  test('every OMP settings section has a translated purpose, not a raw group name', () => {
    // A section heading is the one place the page could fall back to OMP's own
    // English group name, so each section carries a title and a sentence in
    // every locale. A shell name stays `Bash` by design; its purpose does not.
    const sectionKeys = Object.keys(enDict)
      .filter((k) => /^settings\.omp\.section\..+\.(title|description)$/.test(k))
      .sort();
    expect(sectionKeys.length).toBeGreaterThan(0);
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      const missing = sectionKeys.filter((key) => !(key in dictionary));
      expect(missing, `${locale} missing OMP section keys`).toEqual([]);
      if (locale === 'en') continue;
      const untranslated = sectionKeys
        .filter((key) => key.endsWith('.description'))
        .filter((key) => (dictionary as Record<string, string>)[key] === (enDict as Record<string, string>)[key]);
      expect(untranslated, `${locale} untranslated OMP section purposes`).toEqual([]);
    }
  });

  test('all locales expose language label keys', () => {
    for (const [, dictionary] of Object.entries(localeDictionaries)) {
      expect(dictionary['common.language.german']).toBeTruthy();
      expect(dictionary['common.language.dutch']).toBeTruthy();
      expect(dictionary['common.language.french']).toBeTruthy();
      expect(dictionary['common.language.japanese']).toBeTruthy();
      expect(dictionary['common.language.arabic']).toBeTruthy();
      expect(dictionary['common.language.hebrew']).toBeTruthy();
    }
  });

  test('telemetry translations retain the numeric token placeholders', () => {
    for (const dictionary of Object.values(localeDictionaries)) {
      expect(dictionary['chat.workStatus.telemetry.tokens.inOut']).toContain('{input}');
      expect(dictionary['chat.workStatus.telemetry.tokens.inOut']).toContain('{output}');
      for (const parameter of ['input', 'output']) {
        expect(dictionary['chat.workStatus.telemetry.tokensDescription']).toContain(`{${parameter}}`);
      }
    }
  });

  test('all telemetry rows have translated explanations and compact labels', () => {
    const metrics = ['responseSpeed', 'speed', 'llmDuration', 'toolDuration', 'ttft', 'steps', 'tokens', 'cacheHit', 'cost'] as const;
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      for (const metric of metrics) {
        const label = dictionary[`chat.workStatus.telemetry.${metric}`];
        const description = dictionary[`chat.workStatus.telemetry.${metric}Description`];
        expect(label.length <= 16).toBe(true);
        expect(description.length > 30).toBe(true);
        if (locale !== 'en') expect(description === enDict[`chat.workStatus.telemetry.${metric}Description`]).toBe(false);
      }
    }
  });

  // OMP is the fork's only engine. OpenCode survives in English where it names
  // host infrastructure (the CLI, a config file, a provider); a locale may use
  // the same name on exactly those keys and nowhere else, so a translation
  // cannot quietly reintroduce OpenCode as the thing running the session.
  test('no locale names OpenCode on a key whose english value does not', () => {
    const mentionsOpenCode = /opencode/i;
    const englishValues: Record<string, string> = enDict;
    const failures: string[] = [];

    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      if (locale === 'en') continue;
      for (const [key, value] of Object.entries(dictionary)) {
        if (typeof value !== 'string') continue;
        if (!mentionsOpenCode.test(value)) continue;
        const enValue = englishValues[key] ?? '';
        if (!mentionsOpenCode.test(enValue)) {
          failures.push(`${locale} ${key}: "${value}" names OpenCode but en does not ("${enValue}")`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  // OMP reads models.yml, mcp.json and config.yml: OpenCode's `{env:VAR}` and
  // `{file:path}` substitutions and its opencode.json file do not exist there.
  // OpenCode may still be named where it is a real provider, a discovery source,
  // a compatible format, an extension contract or legacy-data notice; anything
  // else would describe OpenCode as the runtime.
  test('no locale shows OpenCode config syntax, and english names OpenCode only on audited keys', () => {
    const openCodeSyntax = /\{env:|\{file:|opencode\.jsonc?/i;
    const syntaxFailures: string[] = [];
    for (const [locale, dictionary] of Object.entries(localeDictionaries)) {
      for (const [key, value] of Object.entries(dictionary)) {
        if (typeof value === 'string' && openCodeSyntax.test(value)) syntaxFailures.push(`${locale} ${key}: "${value}"`);
      }
    }
    expect(syntaxFailures).toEqual([]);

    const auditedOpenCodeKeys = new Set([
      'integrationsCatalog.entry.resource-monitor.details',
      'integrationsCatalog.group.plugin',
      'integrationsCatalog.plugin.confirm.description',
      'integrationsCatalog.status.plugin',
      'settings.extensions.capability.service.providesQuota',
      'settings.extensions.capability.service.providesQuota.credentials',
      'settings.extensions.capability.service.providesQuota.none',
      'settings.extensions.service.providesQuota',
      'settings.extensions.service.providesQuota.none',
      'settings.extensions.toast.invalidOpenCodePlugin',
      'settings.omp.items.commands.enableOpencodeProject.description',
      'settings.omp.items.commands.enableOpencodeProject.label',
      'settings.omp.items.commands.enableOpencodeUser.description',
      'settings.omp.items.commands.enableOpencodeUser.label',
      'settings.page.extensions.description',
      'settings.remoteInstances.page.error.hint.noOpencode',
      'settings.skills.catalog.conflicts.source.opencode',
      'settings.skills.sidebar.badge.opencode',
      'settings.sourceControl.ssh.passphraseHint',
      'spaces.create.access.hostKeysNotReused',
      'startup.legacyNotice.descriptionGeneric',
      'startup.legacyNotice.title',
    ]);
    const unaudited = Object.entries(enDict as Record<string, string>)
      .filter(([key, value]) => /opencode/i.test(value) && !auditedOpenCodeKeys.has(key))
      .map(([key, value]) => `${key}: "${value}"`);
    expect(unaudited).toEqual([]);
  });
  test('every exposed OMP setting id has a non-empty translated label in omp-settings.i18n.ts across all 15 locales', () => {
    const agentServiceDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../agent-service');
    const rawExposedIds = execFileSync(
      process.execPath,
      ['-e', "import { OMP_SETTING_EXPOSED_IDS } from './src/worker/settings-ui.ts'; process.stdout.write(JSON.stringify([...OMP_SETTING_EXPOSED_IDS]));"],
      { cwd: agentServiceDir, encoding: 'utf8' },
    );
    const exposedIds = z.array(z.string()).parse(JSON.parse(rawExposedIds));
    expect(exposedIds.length).toBeGreaterThan(250);

    const allLocales = Object.keys(localeDictionaries);
    const ompEntries = new Map<string, ReadonlyMap<string, string>>(
      Object.entries(ompSettingsI18n).map(([locale, dict]) => [locale, new Map(Object.entries(dict))]),
    );
    expect([...ompEntries.keys()].sort()).toEqual([...allLocales].sort());

    const nonEnglishLocales = allLocales.filter((locale) => locale !== 'en');
    const cjkAndRtlLocales = nonEnglishLocales.filter((locale) => locale !== 'zh-CN' && locale !== 'zh-TW');
    const identicalToEnglishAllowlist = {
      topP: nonEnglishLocales,
      topK: nonEnglishLocales,
      minP: nonEnglishLocales,
      'glob.enabled': nonEnglishLocales,
      'grep.enabled': nonEnglishLocales,
      'ratchet.enabled': nonEnglishLocales,
      'prewalk.enabled': cjkAndRtlLocales,
      'magicKeywords.ultrathink': nonEnglishLocales,
      'magicKeywords.chillax': nonEnglishLocales,
      'magicKeywords.jevify': nonEnglishLocales,
      'magicKeywords.orchestrate': nonEnglishLocales.filter((locale) => locale !== 'he'),
      'magicKeywords.workflow': nonEnglishLocales.filter((locale) => locale !== 'he'),
      'skills.enabled': ['de'],
      'debug.enabled': ['de', 'nl', 'pl'],
      'skills.enablePiUser': ['es'],
      'skills.enableAgentsUser': ['es'],
      'skills.enableClaudeProject': ['nl'],
      'skills.enablePiProject': ['nl'],
      'skills.enableAgentsProject': ['nl'],
      'commands.enableClaudeProject': ['nl'],
    } satisfies Record<string, readonly string[]>;

    const englishMap = ompEntries.get('en')!;
    const missing: string[] = [];
    const empty: string[] = [];
    const rawFallback: string[] = [];
    const untranslated: string[] = [];

    for (const id of exposedIds) {
      const key = `settings.omp.items.${id}.label`;
      const englishValue = englishMap.get(key);
      const rawIdFallback = id.replace(/\./g, ' ');
      const allowed = Object.hasOwn(identicalToEnglishAllowlist, id)
        ? Object.entries(identicalToEnglishAllowlist).find(([entryId]) => entryId === id)?.[1] ?? []
        : [];
      const allowedLocales = new Set(allowed);

      for (const locale of allLocales) {
        const localeMap = ompEntries.get(locale);
        const value = localeMap?.get(key);
        if (value === undefined) {
          missing.push(`${locale}: ${key}`);
          continue;
        }
        if (value.trim().length === 0) {
          empty.push(`${locale}: ${key}`);
          continue;
        }
        if (value === id || value === rawIdFallback) {
          rawFallback.push(`${locale}: ${key} = "${value}"`);
          continue;
        }
        if (locale !== 'en' && value === englishValue && !allowedLocales.has(locale)) {
          untranslated.push(`${locale}: ${key} = "${value}"`);
        }
      }
    }

    const exposedSet = new Set(exposedIds);
    const staleAllowlist: string[] = [];
    for (const [id, locales] of Object.entries(identicalToEnglishAllowlist)) {
      if (!exposedSet.has(id)) {
        staleAllowlist.push(`${id} (not exposed)`);
        continue;
      }
      const key = `settings.omp.items.${id}.label`;
      const englishValue = englishMap.get(key);
      for (const locale of locales) {
        if (ompEntries.get(locale)?.get(key) !== englishValue) {
          staleAllowlist.push(`${id}:${locale}`);
        }
      }
    }

    expect(missing).toEqual([]);
    expect(empty).toEqual([]);
    expect(rawFallback).toEqual([]);
    expect(untranslated).toEqual([]);
    expect(staleAllowlist).toEqual([]);
  });

  test('OMP number unit labels for minutes and hours are translated across all 15 locales', () => {
    const allLocales = Object.keys(localeDictionaries);
    const ompEntries = new Map<string, ReadonlyMap<string, string>>(
      Object.entries(ompSettingsI18n).map(([locale, dict]) => [locale, new Map(Object.entries(dict))]),
    );
    const enUnits = ompEntries.get('en')!;
    for (const unitKey of ['settings.omp.unit.minutes', 'settings.omp.unit.hours'] as const) {
      const enValue = enUnits.get(unitKey);
      expect(enValue).toBeTruthy();
      for (const locale of allLocales) {
        const value = ompEntries.get(locale)?.get(unitKey);
        expect(value?.trim().length ?? 0, `${locale} ${unitKey}`).toBeGreaterThan(0);
        if (locale !== 'en' && !(unitKey === 'settings.omp.unit.minutes' && locale === 'fr')) {
          expect(value, `${locale} ${unitKey}`).not.toBe(enValue);
        }
      }
    }
  });
});
