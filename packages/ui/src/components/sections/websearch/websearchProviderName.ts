import type { WebSearchProviderEntry } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';

/** Native search providers whose service-side name needs the UI's own wording. */
const WEB_SEARCH_PROVIDER_NAME_KEYS = {
  'web/hosted': 'settings.webSearch.provider.hosted',
} satisfies Record<string, I18nKey>;

type KnownProviderId = keyof typeof WEB_SEARCH_PROVIDER_NAME_KEYS;

const isKnownProviderId = (providerId: string): providerId is KnownProviderId =>
  Object.hasOwn(WEB_SEARCH_PROVIDER_NAME_KEYS, providerId);

/** The reader's name for a search provider: a known id is translated, an unknown one keeps the service's name. */
export const getWebSearchProviderName = (
  provider: Pick<WebSearchProviderEntry, 'providerId' | 'name'>,
  t: (key: I18nKey) => string,
): string => {
  return isKnownProviderId(provider.providerId)
    ? t(WEB_SEARCH_PROVIDER_NAME_KEYS[provider.providerId])
    : provider.name;
};
