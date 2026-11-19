import type { I18nKey, I18nParams, Locale } from '@/lib/i18n';

export type AgentStatus = {
  key: I18nKey;
  count?: number;
  name?: string;
<<<<<<< HEAD
  /**
   * A phrase the harness or the tool wrote itself — a running call's `input.i`
   * intent, or the call's own description — shown verbatim in place of the
   * dictionary's phrase.
   */
  text?: string;
||||||| bc50ba56aa
  /** The reasoning part behind "thinking", which keys its occasional joke. */
  seed?: string;
=======
  seed?: string;
>>>>>>> upstream/main
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

<<<<<<< HEAD
/** The phrase alone, as the dictionary writes it ("running 3 commands"). */
const formatAgentStatusPhrase = (t: Translate, locale: Locale, status: AgentStatus): string => {
  const raw = status.text ?? t(status.key);
||||||| bc50ba56aa
/** The phrase alone, as the dictionary writes it ("running 3 commands"). */
export const formatAgentStatusPhrase = (t: Translate, locale: Locale, status: AgentStatus): string => {
  const raw = t(status.key);
=======
export const formatAgentStatusPhrase = (t: Translate, locale: Locale, status: AgentStatus): string => {
  const raw = t(status.key);
>>>>>>> upstream/main
  const counted = status.count === undefined ? raw : applyPlural(raw, status.count, locale);
  return counted.replace(/\{name\}/g, () => status.name ?? '');
};

<<<<<<< HEAD
/** The label the status row and the pill show: after the model's name when it is known, else the phrase alone with a capital first letter. */
export const formatAgentStatus = (t: Translate, locale: Locale, status: AgentStatus, modelName?: string | null): string => {
  const phrase = formatAgentStatusPhrase(t, locale, status);
||||||| bc50ba56aa
/**
 * The label the status row and the pill show: after the model's name when it
 * is known, else the phrase on its own with a capital first letter. `phrase`
 * replaces the dictionary's, for an easter-egg line said in its place.
 */
export const formatAgentStatus = (t: Translate, locale: Locale, status: AgentStatus, modelName?: string | null, phrase = formatAgentStatusPhrase(t, locale, status)): string => {
=======
export const formatAgentStatus = (t: Translate, locale: Locale, status: AgentStatus, modelName?: string | null, phrase = formatAgentStatusPhrase(t, locale, status)): string => {
>>>>>>> upstream/main
  const model = modelName?.trim() ?? '';
  if (model) return t('chat.statusRow.modelStatus', { model, status: phrase });
  return phrase.charAt(0).toLocaleUpperCase(locale) + phrase.slice(1);
};
<<<<<<< HEAD
||||||| bc50ba56aa

/** A stable string for comparing statuses: equal statuses read the same in every language. */
export const agentStatusSignature = (status: AgentStatus): string => `${status.key}|${status.count ?? ''}|${status.name ?? ''}|${status.seed ?? ''}`;
=======

export const agentStatusSignature = (status: AgentStatus): string => `${status.key}|${status.count ?? ''}|${status.name ?? ''}|${status.seed ?? ''}`;
>>>>>>> upstream/main
