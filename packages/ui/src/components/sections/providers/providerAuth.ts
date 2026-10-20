import type { Provider, ProviderOAuthMethods } from '@openchamber/agent-contract';

/** Login method identity is not necessarily its stored provider identity. */
export function oauthMethodsForProvider(methods: ProviderOAuthMethods['methods'], providerId: string) {
  return methods.filter((method) => method.storeCredentialsAs === providerId);
}

export function hasCanonicalStoredCredential(provider: Provider): boolean {
  return provider.auth.status === 'configured' && provider.auth.source === 'stored-credential';
}
