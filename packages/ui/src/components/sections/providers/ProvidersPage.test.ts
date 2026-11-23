import { describe, expect, test } from 'bun:test';
import type { Provider, ProviderAccounts, ProviderOAuthMethods } from '@openchamber/agent-contract';
import {
  getProviderCardStatus,
  getProviderEnvironment,
  oauthMethodsForProvider,
  providerAccountName,
  requiresProviderAuth,
  shouldAutoOpenAuthPanel,
} from './providerAuth';
import { listConnectableProviders, listProvidersAcceptingKey, splitConnectableProviders } from './connectableProviders';
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
  test('account names prefer visible identity fields and otherwise use a localized method and roster position', () => {
    const account: ProviderAccounts['accounts'][number] = { credentialRef: 'credential_opaque', method: 'api-key', active: false, disabled: false };
    const t = (key: string) => key.endsWith('.oauth') ? 'OAuth' : 'API key';
    expect(providerAccountName(account, 1, t)).toBe('API key 2');
    expect(providerAccountName({ ...account, method: 'oauth', label: '', email: '', accountId: '' }, 2, t)).toBe('OAuth 3');
    expect(providerAccountName({ ...account, accountId: 'account-name' }, 1, t)).toBe('account-name');
    expect(providerAccountName({ ...account, email: 'email-name', accountId: 'account-name' }, 1, t)).toBe('email-name');
    expect(providerAccountName({ ...account, label: 'Work', email: 'email-name', accountId: 'account-name' }, 1, t)).toBe('Work');
  });
  test('keeps OAuth method identity separate from stored provider identity', () => {
    expect(oauthMethodsForProvider(methods, 'openai')).toEqual([methods[0]]);
    expect(oauthMethodsForProvider(methods, 'console-login')).toEqual([]);
  });

  test('a stored credential reads as connected while environment credentials are labelled separately', () => {
    expect(getProviderCardStatus(provider({
      auth: { status: 'configured', credentialRef: 'credential_1', method: 'api-key', source: 'stored-credential' },
    }))).toEqual({ kind: 'connected', environment: null });
    expect(getProviderCardStatus(provider({
      auth: { status: 'configured', credentialRef: 'credential_1', method: 'api-key', source: 'external-environment' },
    }))).toEqual({ kind: 'environment', environment: { variable: null, active: true } });
    expect(getProviderCardStatus(provider())).toEqual({ kind: 'signInNeeded', environment: null });
    expect(getProviderCardStatus(provider({ authMethods: [] }))).toBe(null);
  });

  test('an environment variable stays visible while a stored key wins', () => {
    const storedKeyWins = provider({
      auth: {
        status: 'configured',
        credentialRef: 'credential_1',
        method: 'api-key',
        source: 'stored-credential',
        environment: { variable: 'OPENAI_API_KEY', active: false },
      },
    });
    expect(getProviderEnvironment(storedKeyWins)).toEqual({ variable: 'OPENAI_API_KEY', active: false });
    expect(getProviderCardStatus(storedKeyWins)).toEqual({
      kind: 'connected',
      environment: { variable: 'OPENAI_API_KEY', active: false },
    });

    const environmentWins = provider({
      auth: {
        status: 'configured',
        credentialRef: 'credential_1',
        method: 'api-key',
        source: 'external-environment',
        environment: { variable: 'OPENAI_API_KEY', active: true },
      },
    });
    expect(getProviderCardStatus(environmentWins)).toEqual({
      kind: 'environment',
      environment: { variable: 'OPENAI_API_KEY', active: true },
    });
  });

  test('a variable-less environment source names no variable and a blank one is absent', () => {
    const computed = provider({
      auth: {
        status: 'configured',
        credentialRef: 'credential_1',
        method: 'api-key',
        source: 'external-environment',
        environment: { variable: null, active: true },
      },
    });
    expect(getProviderEnvironment(computed)).toEqual({ variable: null, active: true });
    expect(getProviderCardStatus(computed)).toEqual({
      kind: 'environment',
      environment: { variable: null, active: true },
    });

    const blank = provider({
      auth: {
        status: 'configured',
        credentialRef: 'credential_1',
        method: 'api-key',
        source: 'external-environment',
        environment: { variable: '   ', active: true },
      },
    });
    expect(getProviderEnvironment(blank)).toBe(null);
    expect(getProviderCardStatus(blank)).toEqual({ kind: 'environment', environment: null });
  });

  test('a legacy record reads as an environment source only when that is where it comes from', () => {
    // Before the contract carried `environment`, an external-environment
    // credential still had to read as an environment source rather than look
    // keyless, so it becomes an unnamed one.
    const legacyExternal = provider({
      auth: { status: 'configured', credentialRef: 'credential_1', method: 'api-key', source: 'external-environment' },
    });
    expect(getProviderEnvironment(legacyExternal)).toEqual({ variable: null, active: true });
    expect(getProviderCardStatus(legacyExternal)).toEqual({
      kind: 'environment',
      environment: { variable: null, active: true },
    });

    // A managed-environment credential is a config key, not a variable: it
    // outranks a saved key, so it must not claim one takes precedence.
    const managed = provider({
      auth: { status: 'configured', credentialRef: 'credential_2', method: 'api-key', source: 'managed-environment' },
    });
    expect(getProviderEnvironment(managed)).toBe(null);
    expect(getProviderCardStatus(managed)).toEqual({ kind: 'environment', environment: null });

    const reportedForManaged = provider({
      auth: {
        status: 'configured',
        credentialRef: 'credential_2',
        method: 'api-key',
        source: 'managed-environment',
        environment: { variable: 'OPENAI_API_KEY', active: true },
      },
    });
    expect(getProviderEnvironment(reportedForManaged)).toBe(null);
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

  test('env-backed providers stay out of the connect picker but offer a key form', () => {
    const providers = [
      provider({
        providerId: 'openai',
        name: 'OpenAI',
        auth: {
          status: 'configured',
          credentialRef: 'credential_1',
          method: 'api-key',
          source: 'external-environment',
          environment: { variable: 'OPENAI_API_KEY', active: true },
        },
      }),
      provider({
        providerId: 'anthropic',
        name: 'Anthropic',
        auth: {
          status: 'configured',
          credentialRef: 'credential_2',
          method: 'api-key',
          source: 'stored-credential',
          environment: { variable: 'ANTHROPIC_API_KEY', active: false },
        },
      }),
      provider({
        providerId: 'google',
        name: 'Google',
        authMethods: ['api-key', 'oauth'],
        auth: {
          status: 'configured',
          credentialRef: 'credential_3',
          method: 'oauth',
          source: 'stored-credential',
        },
      }),
      provider({
        providerId: 'managed',
        name: 'Managed',
        auth: { status: 'configured', credentialRef: 'credential_4', method: 'api-key', source: 'managed-environment' },
      }),
      provider({ providerId: 'zeta', name: 'Zeta' }),
    ];
    expect(listConnectableProviders(providers).map((entry) => entry.id)).toEqual(['zeta']);
    // Only the provider the environment currently authenticates needs the
    // direct way in: a stored key already has an accounts list for adding
    // more, a managed config key is not an environment variable, and a
    // provider without the API-key method has nothing to save.
    expect(listProvidersAcceptingKey(providers).map((entry) => entry.id)).toEqual(['openai']);
  });

  test('connected-only provider filter selects configured credentials or executable models', () => {
    const providers = [
      provider({ providerId: 'unconfigured-1', name: 'Unconfigured 1', auth: { status: 'missing' } }),
      provider({ providerId: 'configured-auth', name: 'Configured Auth', auth: { status: 'configured', credentialRef: 'c1', method: 'api-key', source: 'stored-credential' } }),
      provider({ providerId: 'ollama', name: 'Ollama', auth: { status: 'missing' } }),
    ];
    const models = [
      { modelId: 'llama3', provider: 'ollama', name: 'Llama 3' },
    ];
    const executableProviders = new Set(models.map((m) => m.provider));
    const connected = providers.filter(
      (p) => p.auth.status === 'configured' || executableProviders.has(p.providerId),
    );
    expect(connected.map((p) => p.providerId)).toEqual(['configured-auth', 'ollama']);
  });

  test('does not expose header values while editing configured header names', () => {
    const form = createEmptyCustomProviderForm({
      revision: '1',
      configuration: { providerId: 'custom', name: 'Custom', endpoint: 'https://example.com', protocol: 'responses', credentialRef: null },
      headerNames: ['Authorization', 'X-Tenant'],
      models: [],
      imageModels: [],
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
