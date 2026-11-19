import { create } from 'zustand';

import { dict as enDict, type I18nKey } from './messages/en';
import { subagentHudI18n } from './messages/subagent-hud.i18n';
import { timelineNoticesI18n } from './messages/timeline-notices.i18n';
import { DEFAULT_LOCALE, detectInitialLocale, type Locale, writeStoredLocale } from './runtime';
import { formatTemplate, type I18nParams } from './format';

export type I18nDictionary = Record<I18nKey, string>;

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

/** One dictionary module; every locale file exports its strings as `dict`. */
type I18nModule = { readonly dict: I18nDictionary };

// A total map rather than a switch, so the module contract is checked at each
// import instead of asserted after a union of import results.
const DICTIONARY_LOADERS = {
  en: () => import('./messages/en'),
  de: () => import('./messages/de'),
  fr: () => import('./messages/fr'),
  nl: () => import('./messages/nl'),
  'zh-CN': () => import('./messages/zh-CN'),
  'zh-TW': () => import('./messages/zh-TW'),
  uk: () => import('./messages/uk'),
  es: () => import('./messages/es'),
  'pt-BR': () => import('./messages/pt-BR'),
  ko: () => import('./messages/ko'),
  pl: () => import('./messages/pl'),
  ja: () => import('./messages/ja'),
  tr: () => import('./messages/tr'),
  ar: () => import('./messages/ar'),
  he: () => import('./messages/he'),
} satisfies Record<Locale, () => Promise<I18nModule>>;

async function loadDictionary(locale: Locale): Promise<I18nDictionary> {
  const cached = dictionaries.get(locale);
  if (cached) {
    return cached;
  }

  const mod = await DICTIONARY_LOADERS[locale]();
  const subagentDict = subagentHudI18n[locale] ?? subagentHudI18n.en;
  /* SAFETY: timelineNoticesI18n structure is Record<string, Record<string, string>>. */
  const noticeDict = (timelineNoticesI18n as Record<string, Record<string, string>>)[locale] ?? timelineNoticesI18n.en;

  /* SAFETY: The merged dictionary follows the I18nDictionary contract. */
  const fullDict = { ...mod.dict, ...subagentDict, ...noticeDict };
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

export function formatMessage(dictionary: I18nDictionary, key: I18nKey, params?: I18nParams): string {
  return formatTemplate(dictionary[key] ?? enDict[key] ?? key, params);
}

export type { I18nKey, I18nParams, Locale };
