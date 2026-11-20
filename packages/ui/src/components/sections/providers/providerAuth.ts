

import type { Provider, ProviderOAuthMethods } from '@openchamber/agent-contract';

/** Login method identity is not necessarily its stored provider identity. */
export function oauthMethodsForProvider(methods: ProviderOAuthMethods['methods'], providerId: string) {
  return methods.filter((method) => method.storeCredentialsAs === providerId);
}

export const requiresProviderAuth = (provider: Provider): boolean =>
  provider.auth.status === 'missing' && provider.authMethods.length > 0;

export interface ProviderEnvironmentStatus {
  /** The environment variable's name, or null when no single name applies. */
  variable: string | null;
  /** The variable currently supplies the winning credential. */
  active: boolean;
}

/**
 * The environment variable behind a provider's credential, whether or not it
 * currently wins. `variable === null` means no single name applies (a computed
 * resolver); a blank name means the variable is unset, so it reports nothing.
 *
 * Only `external-environment` is the machine's environment. A
 * `managed-environment` credential comes from the runtime/models.yml config
 * key, which outranks a saved key, so it is not an env var and gets no badge,
 * no key override hint and no place in the key picker.
 */
export const getProviderEnvironment = (provider: Provider): ProviderEnvironmentStatus | null => {
  if (provider.auth.status !== 'configured') return null;
  if (provider.auth.source === 'managed-environment') return null;
  const reported = provider.auth.environment;
  if (!reported) {
    return provider.auth.source === 'external-environment' ? { variable: null, active: true } : null;
  }
  if (reported.variable === null) return { variable: null, active: reported.active };
  const variable = reported.variable.trim();
  if (variable === '') return null;
  return { variable, active: reported.active };
};

export interface ProviderCardStatus {
  /** The one-glance state of the card. */
  kind: 'connected' | 'environment' | 'signInNeeded';
  /**
   * The environment badge. Kept beside `kind` rather than folded into it, so a
   * stored key that wins still shows that an environment variable exists.
   */
  environment: ProviderEnvironmentStatus | null;
}

/**
 * The one-glance status a provider card shows. A stored key reads as
 * connected while its environment badge stays visible; when the environment
 * supplies the credential, that badge is the status itself.
 */
export const getProviderCardStatus = (provider: Provider): ProviderCardStatus | null => {
  if (provider.auth.status === 'configured') {
    const environment = getProviderEnvironment(provider);
    return provider.auth.source === 'stored-credential'
      ? { kind: 'connected', environment }
      : { kind: 'environment', environment };
  }
  return provider.authMethods.length > 0 ? { kind: 'signInNeeded', environment: null } : null;
};

export const shouldAutoOpenAuthPanel = (input: {
  provider: Provider;
  userDismissed: boolean;
  editingConfiguration: boolean;
}): boolean =>
  requiresProviderAuth(input.provider) && !input.userDismissed && !input.editingConfiguration;
