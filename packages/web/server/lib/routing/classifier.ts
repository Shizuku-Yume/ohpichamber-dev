import {
  GEMINI_DECISIONS_API_URL,
  GEMINI_DECISIONS_MODEL,
  JEV_API_URL,
  JEV_MODEL,
  OPENROUTER_JEV_API_URL,
  OPENROUTER_JEV_MODEL,
  VERCEL_JEV_API_URL,
  VERCEL_JEV_MODEL,
} from './defaults.js';
import { readEnterprisePolicy } from '../enterprise-mode.js';
import type { EnterprisePolicyOptions } from '../enterprise-mode.js';
import type { CustomEndpoint } from './store.js';

export const CLASSIFIER_SOURCES = ['off', 'openrouter', 'vercel', 'gemini', 'typesafe', 'custom'] as const;
export type ClassifierSource = typeof CLASSIFIER_SOURCES[number];
export const RETIRED_CLASSIFIER_SOURCES = ['zen-promo', 'zen-key'] as const;
export type RetiredClassifierSource = typeof RETIRED_CLASSIFIER_SOURCES[number];
export interface ClassifierKeys {
  typesafeKey?: string | null;
  openrouterKey?: string | null;
  vercelKey?: string | null;
  geminiKey?: string | null;
  customEndpoint?: CustomEndpoint | null;
}
export interface Classifier {
  selected: ClassifierSource;
  effective: Exclude<ClassifierSource, 'off'> | null;
  sources: { id: ClassifierSource; usable: boolean }[];
}
export interface ClassifierEndpoint {
  url: string;
  model: string;
  headers: Record<string, string>;
  format?: 'gemini';
}
const FALLBACK_ORDER: Exclude<ClassifierSource, 'off'>[] = ['typesafe', 'custom', 'openrouter', 'vercel'];

export const parseCustomEndpointUrl = (input: string | null | undefined) => {
  const invalid = (message: string) => Object.assign(new Error(message), { status: 400 });
  let url;
  try {
    url = new URL(String(input ?? '').trim());
  } catch {
    throw invalid('Enter a full http:// or https:// URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw invalid('Only http:// and https:// URLs are supported');
  if (url.username || url.password) throw invalid('Put the key in the API key field, not in the URL');
  url.hash = '';
  return url.toString();
};

let warnedInvalidPin = false;

export const readPinnedCustomEndpoint = (options?: EnterprisePolicyOptions): CustomEndpoint | null => {
  const pinned = readEnterprisePolicy(options).jev;
  if (!pinned) return null;
  let url;
  try {
    url = parseCustomEndpointUrl(pinned.url);
  } catch (error) {
    if (!warnedInvalidPin) console.warn('[routing] the pinned Jev endpoint is ignored:', error instanceof Error ? error.message : undefined);
    warnedInvalidPin = true;
    return null;
  }
  const model = pinned.model || JEV_MODEL;
  return pinned.apiKey ? { url, model, key: pinned.apiKey } : { url, model };
};

const LEGACY_SOURCES: ClassifierSource[] = ['typesafe'];

export const resolveClassifier = ({
  selected,
  typesafeKey,
  openrouterKey,
  vercelKey,
  geminiKey,
  customEndpoint,
}: ClassifierKeys & { selected: ClassifierSource | RetiredClassifierSource | null }): Classifier => {
  const isRetired = selected === 'zen-promo' || selected === 'zen-key';
  const usable = {
    off: true,
    openrouter: Boolean(openrouterKey),
    vercel: Boolean(vercelKey),
    gemini: Boolean(geminiKey),
    typesafe: Boolean(typesafeKey),
    custom: Boolean(customEndpoint),
  };
  const chosen: ClassifierSource = isRetired
    ? (FALLBACK_ORDER.find((source) => usable[source]) ?? 'off')
    : (selected ?? (typesafeKey ? 'typesafe' : 'off'));
  const effective = chosen === 'off'
    ? null
    : usable[chosen] ? chosen : FALLBACK_ORDER.find((source) => usable[source]) ?? null;
  return {
    selected: chosen,
    effective,
    sources: CLASSIFIER_SOURCES.map((id) => ({ id, usable: usable[id] })),
  };
};

export const legacyClassifier = (classifier: Classifier) => {
  const legacy = (source: ClassifierSource | null) => source === null || LEGACY_SOURCES.includes(source);
  if (!legacy(classifier.selected) || !legacy(classifier.effective)) return null;
  return { ...classifier, sources: classifier.sources.filter((source) => LEGACY_SOURCES.includes(source.id)) };
};

export const classifierEndpoint = (...args:
  | [source: 'custom', keys: ClassifierKeys & { customEndpoint: CustomEndpoint }]
  | [source: 'gemini', keys: ClassifierKeys & { geminiKey: string }]
  | [source: Exclude<ClassifierSource, 'off' | 'custom' | 'gemini'>, keys: ClassifierKeys]
): ClassifierEndpoint => {
  const [source, keys] = args;
  if (source === 'custom') {
    const { customEndpoint } = keys;
    const headers: Record<string, string> = {};
    if (customEndpoint.key) headers.authorization = `Bearer ${customEndpoint.key}`;
    return { url: customEndpoint.url, model: customEndpoint.model, headers };
  }
  if (source === 'gemini') {
    return { url: GEMINI_DECISIONS_API_URL, model: GEMINI_DECISIONS_MODEL, headers: { 'x-goog-api-key': keys.geminiKey }, format: 'gemini' };
  }
  const { typesafeKey, openrouterKey, vercelKey } = keys;
  if (source === 'typesafe') {
    return { url: JEV_API_URL, model: JEV_MODEL, headers: { authorization: `Bearer ${typesafeKey}` } };
  }
  if (source === 'openrouter') {
    return { url: OPENROUTER_JEV_API_URL, model: OPENROUTER_JEV_MODEL, headers: { authorization: `Bearer ${openrouterKey}` } };
  }
  return { url: VERCEL_JEV_API_URL, model: VERCEL_JEV_MODEL, headers: { authorization: `Bearer ${vercelKey}` } };
};
