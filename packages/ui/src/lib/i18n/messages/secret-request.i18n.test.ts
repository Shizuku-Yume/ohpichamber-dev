import { expect, test } from 'bun:test';
import { secretRequestI18n } from './secret-request.i18n';

test('every secret locale translates refusal and lookup recovery with matching placeholders', () => {
  for (const [locale, dictionary] of Object.entries(secretRequestI18n)) {
    expect(Object.keys(dictionary).sort()).toEqual(Object.keys(secretRequestI18n.en).sort());
    for (const [key, english] of Object.entries(secretRequestI18n.en)) {
      const text = new Map(Object.entries(dictionary)).get(key)!;
      expect(text.trim()).not.toBe('');
      expect(text.match(/\{\w+\}/g) ?? []).toEqual(english.match(/\{\w+\}/g) ?? []);
      if (locale !== 'en') expect(text).not.toBe(english);
    }
  }
});
