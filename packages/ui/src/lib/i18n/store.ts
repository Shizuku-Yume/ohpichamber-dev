import { create } from 'zustand';

import { dict as enDict, type I18nKey } from './messages/en';
import { subagentHudI18n } from './messages/subagent-hud.i18n';
import { timelineNoticesI18n } from './messages/timeline-notices.i18n';
import { DEFAULT_LOCALE, detectInitialLocale, type Locale, writeStoredLocale } from './runtime';
import { hasRightToLeftText, isolateInsertedText } from './textDirection';

export type I18nParams = Record<string, string | number | boolean | null | undefined>;
export type I18nDictionary = Record<I18nKey, string>;
/** A dictionary read for one message: a locale may still lack keys, and `en` answers for them. */
export type I18nLookup = Partial<I18nDictionary>;

type I18nState = {
  locale: Locale;
  dictionary: I18nDictionary;
  loadingLocale: Locale | null;
  setLocale: (locale: Locale) => void;
};

const dictionaries = new Map<Locale, I18nDictionary>([[DEFAULT_LOCALE, enDict]]);

export function resetI18nDictionaryCacheForTests(): void {
  dictionaries.clear();
  dictionaries.set(DEFAULT_LOCALE, enDict);
}

async function loadDictionary(locale: Locale): Promise<I18nDictionary> {
  const cached = dictionaries.get(locale);
  if (cached) {
    return cached;
  }

  const mod = locale === 'zh-CN'
    ? await import('./messages/zh-CN') as { dict: I18nDictionary }
    : locale === 'fr'
      ? await import('./messages/fr') as { dict: I18nDictionary }
      : locale === 'nl'
        ? await import('./messages/nl') as { dict: I18nDictionary }
    : locale === 'zh-TW'
      ? await import('./messages/zh-TW') as { dict: I18nDictionary }
      : locale === 'es'
        ? await import('./messages/es') as { dict: I18nDictionary }
        : locale === 'pt-BR'
          ? await import('./messages/pt-BR') as { dict: I18nDictionary }
          : locale === 'uk'
            ? await import('./messages/uk') as { dict: I18nDictionary }
            : locale === 'ko'
              ? await import('./messages/ko') as { dict: I18nDictionary }
              : locale === 'pl'
                ? await import('./messages/pl') as { dict: I18nDictionary }
                : locale === 'de'
                  ? await import('./messages/de') as { dict: I18nDictionary }
                  : locale === 'ja'
                    ? await import('./messages/ja') as { dict: I18nDictionary }
                    : locale === 'tr'
                      ? await import('./messages/tr') as { dict: I18nDictionary }
                      : locale === 'ar'
                        ? await import('./messages/ar') as { dict: I18nDictionary }
                        : locale === 'he'
                          ? await import('./messages/he') as { dict: I18nDictionary }
                          : { dict: enDict };
  const subagentDict = subagentHudI18n[locale] ?? subagentHudI18n.en;
  const noticeDict = (timelineNoticesI18n as Record<string, Record<string, string>>)[locale] ?? timelineNoticesI18n.en;
  const fullDict = { ...mod.dict, ...subagentDict, ...noticeDict } as I18nDictionary;
  dictionaries.set(locale, fullDict);
  return fullDict;
}

export const useI18nStore = create<I18nState>()((set, get) => ({
  locale: DEFAULT_LOCALE,
  dictionary: enDict,
  loadingLocale: null,
  setLocale: (locale) => {
    const current = get();
    const cached = dictionaries.get(locale);
    if (current.locale === locale && current.loadingLocale !== locale && cached) {
      return;
    }

    writeStoredLocale(locale);

    set({
      locale,
      dictionary: cached ?? current.dictionary,
      loadingLocale: cached ? null : locale,
    });

    if (cached) {
      return;
    }

    void loadDictionary(locale).then((dictionary) => {
      if (get().locale !== locale) {
        return;
      }
      set({ dictionary, loadingLocale: null });
    }).catch((error) => {
      console.error(`[i18n] failed to load locale ${locale}`, error);
      if (get().locale === locale) {
        set({ dictionary: enDict, loadingLocale: null });
      }
    });
  },
}));

export function initializeLocale(): void {
  useI18nStore.getState().setLocale(detectInitialLocale());
}

export function formatMessage(dictionary: I18nLookup, key: I18nKey, params?: I18nParams): string {
  const template = dictionary[key] ?? enDict[key] ?? key;
  if (!params) {
    return template;
  }

  const sentenceHasRightToLeft = hasRightToLeftText(template);
  return template.replace(/\{([^{}]+)\}/g, (match, rawKey) => {
    const value = params[rawKey.trim()];
    if (value === null || value === undefined) return match;
    // Numbers have no direction of their own, even written as 1e-7 or NaN;
    // only strings come back from String() unchanged.
    const text = String(value);
    return text === value ? isolateInsertedText(text, sentenceHasRightToLeft) : text;
  });
}

export type { I18nKey, Locale };
