import type { Provider } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import { getProviderEnvironment } from './providerAuth';

export interface ConnectableProvider {
  id: string;
  name: string;
}

interface PopularProvider {
  id: string;
  noteKey: I18nKey;
  recommended: boolean;
}

/**
 * Leads the connect page, in this order. Recommended providers come first; a
 * provider that is already configured drops out, because it connects from its
 * own page.
 */
const POPULAR_PROVIDERS: readonly PopularProvider[] = [
  { id: 'openai', noteKey: 'settings.providers.connect.note.openai', recommended: true },
  { id: 'opencode-go', noteKey: 'settings.providers.connect.note.opencodeGo', recommended: true },
  { id: 'openrouter', noteKey: 'settings.providers.connect.note.openrouter', recommended: true },
  { id: 'anthropic', noteKey: 'settings.providers.connect.note.anthropic', recommended: false },
  { id: 'github-copilot', noteKey: 'settings.providers.connect.note.githubCopilot', recommended: false },
  { id: 'google', noteKey: 'settings.providers.connect.note.google', recommended: false },
  { id: 'vercel', noteKey: 'settings.providers.connect.note.vercel', recommended: false },
];

const POPULAR_IDS: Record<string, true> = Object.fromEntries(
  POPULAR_PROVIDERS.map((provider) => [provider.id, true] as const),
);

const toConnectable = (provider: Provider): ConnectableProvider => ({
  id: provider.providerId,
  name: provider.name || provider.providerId,
});

const byName = (a: ConnectableProvider, b: ConnectableProvider) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export const listConnectableProviders = (
  providers: readonly Provider[],
): ConnectableProvider[] => providers
  .filter((provider) => provider.auth.status === 'missing' && provider.authMethods.length > 0)
  .map(toConnectable)
  .sort(byName);

/**
 * Providers the environment is currently authenticating: the picker leaves
 * them out because they are configured, yet a key saved here outranks the
 * variable, so their cards need the "Add a key" way in. Once a stored key
 * wins, the provider's own accounts section is the place to add another, and a
 * provider without the API-key method has nothing to save.
 */
export const listProvidersAcceptingKey = (
  providers: readonly Provider[],
): ConnectableProvider[] => providers
  .filter((provider) => provider.authMethods.includes('api-key')
    && getProviderEnvironment(provider)?.active === true)
  .map(toConnectable)
  .sort(byName);

interface ConnectableProviderGroups {
  popular: Array<ConnectableProvider & PopularProvider>;
  others: ConnectableProvider[];
}

export const splitConnectableProviders = (providers: readonly ConnectableProvider[]): ConnectableProviderGroups => {
  const byId = new Map(providers.map((provider) => [provider.id, provider]));
  return {
    popular: POPULAR_PROVIDERS.flatMap((popular) => {
      const provider = byId.get(popular.id);
      return provider ? [{ ...provider, ...popular }] : [];
    }),
    others: providers.filter((provider) => POPULAR_IDS[provider.id] !== true),
  };
};
