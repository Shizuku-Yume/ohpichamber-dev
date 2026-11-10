import type { Provider, ProviderOAuthMethods } from '@openchamber/agent-contract';

/** Login method identity is not necessarily its stored provider identity. */
export function oauthMethodsForProvider(methods: ProviderOAuthMethods['methods'], providerId: string) {
  return methods.filter((method) => method.storeCredentialsAs === providerId);
}

/**
 * A provider still needs a sign-in before it can be used. The native catalog
 * always advertises the API key method, so the auth state — not the method
 * list — is the authoritative signal.
 */
export const requiresProviderAuth = (provider: Provider): boolean =>
  provider.auth.status === 'missing' && provider.authMethods.length > 0;

export type ProviderCardStatus =
  | { kind: 'connected' }
  | { kind: 'environment' }
  | { kind: 'signInNeeded' };

/**
 * The one-glance status a provider card shows. Environment-managed credentials
 * are configured but not stored in the app, so they get their own label.
 */
export const getProviderCardStatus = (provider: Provider): ProviderCardStatus | null => {
  if (provider.auth.status === 'configured') {
    return provider.auth.source === 'stored-credential' ? { kind: 'connected' } : { kind: 'environment' };
  }
  return provider.authMethods.length > 0 ? { kind: 'signInNeeded' } : null;
};

/**
 * Credential forms open on their own for a provider that has none, unless the
 * user explicitly hid them; an editable configuration page never has to wait
 * for a sign-in.
 */
export const shouldAutoOpenAuthPanel = (input: {
  provider: Provider;
  userDismissed: boolean;
  editingConfiguration: boolean;
}): boolean =>
  requiresProviderAuth(input.provider) && !input.userDismissed && !input.editingConfiguration;
