import { describe, expect, test } from 'bun:test';
<<<<<<< HEAD
import type { Provider, ProviderOAuthMethods } from '@openchamber/agent-contract';
import { getProviderCardStatus, oauthMethodsForProvider, requiresProviderAuth, shouldAutoOpenAuthPanel } from './providerAuth';
import { listConnectableProviders, splitConnectableProviders } from './connectableProviders';
import { providerHeaderWrite, createEmptyCustomProviderForm } from './custom-provider-form';
=======
import type { ConnectionInfo, IntegrationInfo } from '@opencode/client';
import {
  findIntegrationForProvider,
  getCredentialConnections,
  getKeyMethod,
  getProviderConnections,
  getProviderCardStatus,
  getSignInIntegrationId,
  getSignInMethods,
  providerHasCredentials,
  providerHoldsStoredLogin,
  shouldShowApiKeyAuth,
  shouldShowModelsSection,
  usesMachineCredentials,
} from './providerAuth';
>>>>>>> bc50ba56a

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

  test('connected-only provider filter selects configured credentials or executable models', () => {
    const providers = [
      provider({ providerId: 'unconfigured-1', name: 'Unconfigured 1', auth: { status: 'missing' } }),
      provider({ providerId: 'configured-auth', name: 'Configured Auth', auth: { status: 'configured', credentialRef: 'c1', method: 'api-key', source: 'stored-credential' } }),
      provider({ providerId: 'ollama', name: 'Ollama', auth: { status: 'missing' } }),
    ];
<<<<<<< HEAD
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
=======
    expect(getProviderConnections(list, 'opencode-go')).toEqual([credential]);
    expect(getProviderConnections(list, 'anthropic')).toBe(undefined);
    expect(getProviderConnections([integration({ connections: [envConnection] })], 'anthropic')).toEqual([envConnection]);
  });
});

describe('provider credential state helpers', () => {
  test('providerHasCredentials requires a connection or an inline options.apiKey', () => {
    // Built-in catalog entry with no credential signal at all.
    expect(providerHasCredentials({ connections: [] })).toBe(false);
    expect(providerHasCredentials({})).toBe(false);

    // A stored credential is the ordinary "logged in" signal.
    expect(providerHasCredentials({ connections: [credential] })).toBe(true);
  });

  test('providerHasCredentials counts an env connection', () => {
    // Bedrock/Azure/Vertex resolve credentials from environment variables;
    // OpenCode reports those as env connections on the integration.
    expect(providerHasCredentials({ connections: [envConnection] })).toBe(true);
  });

  test('providerHasCredentials treats options.apiKey as a usable credential', () => {
    // Config-defined providers write the key straight into opencode.json, so
    // they never get an integration connection.
    expect(providerHasCredentials({ connections: [], optionsApiKey: 'sk-config' })).toBe(true);
    expect(providerHasCredentials({ connections: [], optionsApiKey: '' })).toBe(false);
    expect(providerHasCredentials({ connections: [], optionsApiKey: '   ' })).toBe(false);
    expect(providerHasCredentials({ connections: [], optionsApiKey: null })).toBe(false);
  });

  test('OAuth-only provider without credentials hides models', () => {
    const hasCredentials = providerHasCredentials({ connections: [] });
    expect(hasCredentials).toBe(false);
    expect(shouldShowModelsSection({
      modelCount: 1,
      integrationsLoaded: true,
      hasCredentials,
    })).toBe(false);
  });

  test('provider with a stored credential shows Connected and models', () => {
    const hasCredentials = providerHasCredentials({ connections: [credential] });
    expect(hasCredentials).toBe(true);
    expect(shouldShowModelsSection({
      modelCount: 3,
      integrationsLoaded: true,
      hasCredentials,
    })).toBe(true);
  });

  test('editable custom provider keeps models visible even with no credentials signal', () => {
    // Config-defined custom providers (e.g. local LM Studio/Ollama style)
    // are user-editable in place; a stale 'Credentials missing' must not
    // hide their models section.
    const hasCredentials = providerHasCredentials({ connections: [], optionsApiKey: null });
    expect(hasCredentials).toBe(false);
    expect(shouldShowModelsSection({
      modelCount: 1,
      integrationsLoaded: true,
      hasCredentials: false,
      isEditableCustomProvider: true,
    })).toBe(true);
    expect(shouldShowModelsSection({
      modelCount: 1,
      integrationsLoaded: true,
      hasCredentials: false,
      isEditableCustomProvider: false,
    })).toBe(false);
  });

  test('a credential write flips the page out of the missing-credentials state', () => {
    // Pre-save: the integration reports no connection.
    const before = providerHasCredentials({ connections: [] });
    expect(before).toBe(false);
    expect(shouldShowModelsSection({
      modelCount: 2,
      integrationsLoaded: true,
      hasCredentials: before,
    })).toBe(false);

    // After the integration refetch, the stored credential shows up.
    const after = providerHasCredentials({ connections: [credential] });
    expect(after).toBe(true);
    expect(shouldShowModelsSection({
      modelCount: 2,
      integrationsLoaded: true,
      hasCredentials: after,
    })).toBe(true);
  });

  test('models stay visible while integrations are still loading', () => {
    expect(shouldShowModelsSection({
      modelCount: 4,
      integrationsLoaded: false,
      hasCredentials: false,
    })).toBe(true);
  });
});

describe('getProviderCardStatus', () => {
  const second: ConnectionInfo = { type: 'credential', id: 'cred_2', label: 'Work', method: 'oauth' };
  const status = (integrations: IntegrationInfo[] | null, optionsApiKey?: string | null) =>
    getProviderCardStatus({ integrations, providerId: 'anthropic', optionsApiKey });

  test('shows nothing until integrations load', () => {
    expect(status(null)).toBe(null);
  });

  test('counts accounts only when there is more than one to switch between', () => {
    expect(status([integration({ connections: [credential, second, envConnection] })])).toEqual({ kind: 'accounts', count: 2 });
    expect(status([integration({ connections: [credential, envConnection] })])).toEqual({ kind: 'connected' });
  });

  test('an inline config key counts as connected', () => {
    expect(status([integration()], 'sk-inline')).toEqual({ kind: 'connected' });
  });

  test('separates environment-only connections from missing sign-in', () => {
    expect(status([integration({ connections: [envConnection] })])).toEqual({ kind: 'environment' });
    expect(status([integration()])).toEqual({ kind: 'signInNeeded' });
  });

  test('a connection OpenCode flagged for a new sign-in outranks every other status', () => {
    const expired: ConnectionInfo = { ...second, status: { status: 'needs_auth', message: 'Signed out of OpenCode Console.' } };
    expect(status([integration({ connections: [credential, expired] })])).toEqual({ kind: 'reauthNeeded' });
  });

  test('a provider with no integration gets no status instead of a false warning', () => {
    expect(status([integration({ id: 'openai' })])).toBe(null);
  });

  test('a stored login with no model says so, and a needed new sign-in outranks it', () => {
    const noModels = (connections: ConnectionInfo[]) => getProviderCardStatus({
      integrations: [integration({ connections })],
      providerId: 'anthropic',
      noModels: true,
    });
    expect(noModels([credential])).toEqual({ kind: 'noModels' });
    expect(noModels([{ ...credential, status: { status: 'needs_auth', message: 'Signed out.' } }])).toEqual({ kind: 'reauthNeeded' });
  });
});

describe('providerHoldsStoredLogin', () => {
  test('reads the integration OpenCode uses for the provider', () => {
    const consoleLogin = integration({ id: 'opencode', connections: [credential] });
    expect(providerHoldsStoredLogin([consoleLogin], { id: 'opencode-go', integrationID: 'opencode' })).toBe(true);
    expect(providerHoldsStoredLogin([consoleLogin], { id: 'opencode-go' })).toBe(false);
  });

  test('a login the provider page would not list does not count', () => {
    const consoleLogin = integration({ id: 'opencode', connections: [credential] });
    expect(providerHoldsStoredLogin([consoleLogin], { id: 'console-openai', integrationID: 'opencode' })).toBe(false);
  });

  test('an environment key or an unread list is no stored login', () => {
    expect(providerHoldsStoredLogin([integration({ connections: [envConnection] })], { id: 'anthropic' })).toBe(false);
    expect(providerHoldsStoredLogin(null, { id: 'anthropic' })).toBe(false);
  });
});

describe('Vertex with Application Default Credentials', () => {
  // What OpenCode serves for Vertex signed in with
  // `gcloud auth application-default login` and a project in config.
  const vertexIntegration = integration({
    id: 'google-vertex',
    name: 'Vertex',
    methods: [{ type: 'key' }, { type: 'env', names: ['GOOGLE_VERTEX_API_KEY'] }],
  });
  const vertexPackage = '@opencode/ai/providers/google-vertex';
  const vertex = { id: 'google-vertex', package: vertexPackage, settings: { project: 'my-project', location: 'global' } };

  test('a project OpenCode resolved means credentials on the machine', () => {
    expect(usesMachineCredentials(vertex)).toBe(true);
    expect(usesMachineCredentials({ ...vertex, settings: { location: 'global' } })).toBe(false);
    expect(usesMachineCredentials({ ...vertex, settings: { project: '' } })).toBe(false);
    expect(usesMachineCredentials({ id: 'anthropic', package: '@opencode/ai/providers/anthropic', settings: { project: 'my-project' } })).toBe(false);
    expect(usesMachineCredentials(undefined)).toBe(false);
  });

  test('a config alias on the Vertex package counts like Vertex itself', () => {
    expect(usesMachineCredentials({ ...vertex, id: 'vertex-eu' })).toBe(true);
    expect(usesMachineCredentials({ ...vertex, package: '@opencode/ai/providers/openai-compatible' })).toBe(true);
    expect(usesMachineCredentials({ ...vertex, id: 'other', package: '@opencode/ai/providers/openai-compatible' })).toBe(false);
  });

  test('shows From environment and the models section instead of a sign-in prompt', () => {
    const machineCredentials = usesMachineCredentials(vertex);
    expect(getProviderCardStatus({ integrations: [vertexIntegration], providerId: 'google-vertex', machineCredentials }))
      .toEqual({ kind: 'environment' });
    const hasCredentials = providerHasCredentials({ connections: [], machineCredentials });
    expect(hasCredentials).toBe(true);
    expect(shouldShowModelsSection({ modelCount: 2, integrationsLoaded: true, hasCredentials })).toBe(true);
  });

  test('a stored key still counts as a connected account', () => {
    const keyed = integration({ ...vertexIntegration, connections: [credential] });
    expect(getProviderCardStatus({ integrations: [keyed], providerId: 'google-vertex', machineCredentials: true }))
      .toEqual({ kind: 'connected' });
>>>>>>> bc50ba56a
  });
});
