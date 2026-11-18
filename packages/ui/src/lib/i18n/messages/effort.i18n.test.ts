import { describe, expect, test } from 'bun:test';

import { effortI18n } from './effort.i18n';

const locales = ['en', 'de', 'es', 'fr', 'nl', 'pl', 'pt-BR', 'tr', 'uk', 'ja', 'ko', 'ar', 'he', 'zh-CN', 'zh-TW'] as const;

// Cognates that are the same word in English and in this language.
const SHARED_WITH_ENGLISH: Record<string, readonly string[]> = {
  de: ['effort.minimal', 'effort.auto'],
  fr: ['effort.minimal', 'effort.auto'],
  es: ['effort.auto'],
  nl: ['effort.auto'],
  pl: ['effort.auto'],
  'pt-BR': ['effort.auto'],
  tr: ['effort.minimal', 'effort.auto'],
  uk: ['effort.auto'],
  ja: ['effort.auto'],
  ko: ['effort.auto'],
  ar: ['effort.auto'],
  he: ['effort.auto'],
  'zh-CN': ['effort.auto'],
  'zh-TW': ['effort.auto'],
};

describe('effort labels', () => {
  test('every locale names every level, and none falls back to the English word', () => {
    const englishKeys = Object.keys(effortI18n.en).sort();
    for (const locale of locales) {
      const dictionary: Map<string, string> = new Map(Object.entries(effortI18n[locale]));
      expect([...dictionary.keys()].sort(), `${locale} keys`).toEqual(englishKeys);
      for (const [key, englishText] of Object.entries(effortI18n.en)) {
        const value = dictionary.get(key);
        expect(`${locale} ${key}: ${value?.trim()}`).not.toBe(`${locale} ${key}:`);
        const allowed = SHARED_WITH_ENGLISH[locale] ?? [];
        if (locale !== 'en' && !allowed.includes(key)) {
          expect(`${locale} ${key}: ${value}`).not.toBe(`${locale} ${key}: ${englishText}`);
        }
      }
    }
  });
});
