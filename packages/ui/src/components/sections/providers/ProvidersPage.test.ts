import { describe, expect, test } from 'bun:test';
import type { ProviderOAuthMethods } from '@openchamber/agent-contract';
import { oauthMethodsForProvider } from './providerAuth';
import { providerHeaderWrite, createEmptyCustomProviderForm } from './custom-provider-form';

const methods: ProviderOAuthMethods['methods'] = [
  { methodId: 'console-login', providerId: 'native-console', name: 'Console', storeCredentialsAs: 'openai' },
  { methodId: 'other-login', providerId: 'other', name: 'Other', storeCredentialsAs: 'anthropic' },
];

describe('native provider management UI contracts', () => {
  test('keeps OAuth method identity separate from stored provider identity', () => {
    expect(oauthMethodsForProvider(methods, 'openai')).toEqual([methods[0]]);
    expect(oauthMethodsForProvider(methods, 'console-login')).toEqual([]);
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
