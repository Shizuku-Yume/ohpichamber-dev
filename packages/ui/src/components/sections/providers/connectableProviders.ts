import type { Provider } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';

export interface ConnectableProvider {
  id: string;
  name: string;
}

interface PopularProvider {
  id: string;
  /** One line saying what the provider gives you. */
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

/**
 * What can still be connected: native providers the workspace reports without
 * a configured credential. Sorted by name so the compact rows stay scannable.
 */
export const listConnectableProviders = (
  providers: readonly Provider[],
): ConnectableProvider[] => providers
  .filter((provider) => provider.auth.status === 'missing' && provider.authMethods.length > 0)
  .map((provider) => ({ id: provider.providerId, name: provider.name || provider.providerId }))
  .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

interface ConnectableProviderGroups {
  /** Popular providers that can still be connected, in `POPULAR_PROVIDERS` order. */
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
