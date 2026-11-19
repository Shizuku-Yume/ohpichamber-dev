import type { I18nKey, I18nParams, Locale } from '@/lib/i18n';

export type AgentStatus = {
  key: I18nKey;
  count?: number;
  name?: string;
  /**
   * A phrase the harness or the tool wrote itself — a running call's `input.i`
   * intent, or the call's own description — shown verbatim in place of the
   * dictionary's phrase.
   */
  text?: string;
};

type Translate = (key: I18nKey, params?: I18nParams) => string;

const PLURAL = /\{count, plural,((?:[^{}]|\{[^{}]*\})*)\}/g;
const PLURAL_CASE = /(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g;

export const applyPlural = (template: string, count: number, locale: Locale): string => {
  const category = new Intl.PluralRules(locale).select(count);
  const number = new Intl.NumberFormat(locale).format(count);
  return template.replace(PLURAL, (_match, body: string) => {
    const cases = new Map<string, string>();
    for (const [, selector, text] of body.matchAll(PLURAL_CASE)) cases.set(selector, text);
    const chosen = cases.get(`=${count}`) ?? cases.get(category) ?? cases.get('other') ?? '';
    return chosen.replace(/#/g, number);
  });
};

/** The phrase alone, as the dictionary writes it ("running 3 commands"). */
const formatAgentStatusPhrase = (t: Translate, locale: Locale, status: AgentStatus): string => {
  const raw = status.text ?? t(status.key);
  const counted = status.count === undefined ? raw : applyPlural(raw, status.count, locale);
  return counted.replace(/\{name\}/g, () => status.name ?? '');
};

/** The label the status row and the pill show: after the model's name when it is known, else the phrase alone with a capital first letter. */
export const formatAgentStatus = (t: Translate, locale: Locale, status: AgentStatus, modelName?: string | null): string => {
  const phrase = formatAgentStatusPhrase(t, locale, status);
  const model = modelName?.trim() ?? '';
  if (model) return t('chat.statusRow.modelStatus', { model, status: phrase });
  return phrase.charAt(0).toLocaleUpperCase(locale) + phrase.slice(1);
};
