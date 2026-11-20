import { describe, expect, test } from 'bun:test';

import { routingI18n } from './routing.i18n';

const locales = ['en', 'de', 'fr', 'nl', 'es', 'ja', 'pt-BR', 'uk', 'ko', 'pl', 'zh-CN', 'zh-TW', 'tr', 'ar', 'he'] as const;

// Technical terms and cognates intentionally identical to English in some European locales.
const SHARED_WITH_ENGLISH: Record<string, true> = {
  'chat.modelControls.autoModel': true,
  'settings.page.routing.title': true,
  'settings.routing.category.name': true,
  'settings.routing.category.description': true,
  'settings.routing.category.model': true,
  'settings.routing.category.agent': true,
  'settings.classification.custom.model.label': true,
  'settings.classification.custom.key.placeholder': true,
  'settings.sessions.permissions.defaultMode': true,
  'settings.classification.source.gemini.name': true,
};
describe('Routing and classification translations', () => {
  test('every locale has every key, translated', () => {
    const english = Object.entries(routingI18n.en);
    for (const locale of locales) {
      const dictionary = new Map<string, string>(Object.entries(routingI18n[locale]));
      expect([...dictionary.keys()].sort()).toEqual(english.map(([key]) => key).sort());
      for (const [key, englishText] of english) {
        const value = dictionary.get(key);
        expect(value?.trim()).toBeTruthy();
        if (locale !== 'en' && !SHARED_WITH_ENGLISH[key]) {
          expect(`${locale} ${key}: ${value}`).not.toBe(`${locale} ${key}: ${englishText}`);
        }
        for (const placeholder of englishText.match(/\{\w+\}/g) ?? []) {
          expect(value).toContain(placeholder);
        }
      }
    }
  });

  test('new create-category dialog keys are present and translated in every locale', () => {
    const keys = [
      'settings.routing.categories.addCategory',
      'settings.routing.categories.createDialog.title',
      'settings.routing.categories.createDialog.description',
      'settings.routing.categories.createDialog.submit',
      'settings.routing.category.namePlaceholder',
      'settings.routing.category.descriptionPlaceholder',
      'settings.routing.category.nameDuplicate',
    ] as const;

    const englishDictionary = new Map<string, string>(Object.entries(routingI18n.en));
    for (const key of keys) {
      const englishText = englishDictionary.get(key);
      expect(englishText?.trim()).toBeTruthy();
      for (const locale of locales) {
        const dictionary = new Map<string, string>(Object.entries(routingI18n[locale]));
        const value = dictionary.get(key);
        expect(value?.trim()).toBeTruthy();
        if (locale !== 'en') {
          expect(`${locale} ${key}: ${value}`).not.toBe(`${locale} ${key}: ${englishText}`);
        }
      }
    }
  });
});
