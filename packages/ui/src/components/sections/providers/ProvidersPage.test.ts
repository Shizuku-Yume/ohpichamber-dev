import { describe, expect, test } from 'bun:test';
import type { Provider, ProviderOAuthMethods } from '@openchamber/agent-contract';
import { getProviderCardStatus, oauthMethodsForProvider, requiresProviderAuth, shouldAutoOpenAuthPanel } from './providerAuth';
import { listConnectableProviders, splitConnectableProviders } from './connectableProviders';
import { providerHeaderWrite, createEmptyCustomProviderForm } from './custom-provider-form';

const methods: ProviderOAuthMethods['methods'] = [
  { methodId: 'console-login', providerId: 'native-console', name: 'Console', storeCredentialsAs: 'openai' },
  { methodId: 'other-login', providerId: 'other', name: 'Other', storeCredentialsAs: 'anthropic' },
];

const provider = (overrides: Partial<Provider> = {}): Provider => ({
  providerId: 'openai',
  name: 'OpenAI',
  endpoint: null,
  protocol: null,
  authMethods: ['api-key'],
  auth: { status: 'missing' },
  ...overrides,
});

describe('native provider management UI contracts', () => {
  test('keeps OAuth method identity separate from stored provider identity', () => {
    expect(oauthMethodsForProvider(methods, 'openai')).toEqual([methods[0]]);
    expect(oauthMethodsForProvider(methods, 'console-login')).toEqual([]);
  });

  test('a stored credential reads as connected while environment credentials are labelled separately', () => {
    expect(getProviderCardStatus(provider({
      auth: { status: 'configured', credentialRef: 'credential_1', method: 'api-key', source: 'stored-credential' },
    }))).toEqual({ kind: 'connected' });
    expect(getProviderCardStatus(provider({
      auth: { status: 'configured', credentialRef: 'credential_1', method: 'api-key', source: 'external-environment' },
    }))).toEqual({ kind: 'environment' });
    expect(getProviderCardStatus(provider())).toEqual({ kind: 'signInNeeded' });
    expect(getProviderCardStatus(provider({ authMethods: [] }))).toBe(null);
  });

  test('credential forms auto-open only for a missing credential the user has not dismissed', () => {
    expect(requiresProviderAuth(provider())).toBe(true);
    expect(requiresProviderAuth(provider({
      auth: { status: 'configured', credentialRef: 'credential_1', method: 'oauth', source: 'stored-credential' },
    }))).toBe(false);
    expect(shouldAutoOpenAuthPanel({ provider: provider(), userDismissed: false, editingConfiguration: false })).toBe(true);
    expect(shouldAutoOpenAuthPanel({ provider: provider(), userDismissed: true, editingConfiguration: false })).toBe(false);
    expect(shouldAutoOpenAuthPanel({ provider: provider(), userDismissed: false, editingConfiguration: true })).toBe(false);
  });

  test('connectable providers exclude anything with credentials and keep popular entries first', () => {
    const providers = [
      provider({ providerId: 'zeta', name: 'Zeta' }),
      provider({ providerId: 'openai', name: 'OpenAI' }),
      provider({
        providerId: 'anthropic',
        name: 'Anthropic',
        auth: { status: 'configured', credentialRef: 'credential_1', method: 'oauth', source: 'stored-credential' },
      }),
      provider({ providerId: 'alpha', name: 'Alpha' }),
    ];
    const connectable = listConnectableProviders(providers);
    expect(connectable.map((entry) => entry.id)).toEqual(['alpha', 'openai', 'zeta']);
    const groups = splitConnectableProviders(connectable);
    expect(groups.popular.map((entry) => entry.id)).toEqual(['openai']);
    expect(groups.popular[0]?.recommended).toBe(true);
    expect(groups.others.map((entry) => entry.id)).toEqual(['alpha', 'zeta']);
  });

  test('does not expose header values while editing configured header names', () => {
    const form = createEmptyCustomProviderForm({
      revision: '1',
      configuration: { providerId: 'custom', name: 'Custom', endpoint: 'https://example.com', protocol: 'responses', credentialRef: null },
      headerNames: ['Authorization', 'X-Tenant'],
      models: [],
    });
    expect(form.headerNames).toEqual(['Authorization', 'X-Tenant']);
    expect(form.headers).toEqual([]);
    expect(providerHeaderWrite(form)).toBeUndefined();
  });

  test('explicit header replacement can clear all write-only values', () => {
    const form = { ...createEmptyCustomProviderForm(), replaceHeaders: true, headers: [] };
    expect(providerHeaderWrite(form)).toEqual({});
  });
});
