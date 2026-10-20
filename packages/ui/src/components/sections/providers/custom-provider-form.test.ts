import { expect, test } from 'bun:test';
import type { Model, ProviderConfigurationRead } from '@openchamber/agent-contract';
import { buildCustomProviderRequest, createEmptyCustomProviderForm, createModelRow } from './custom-provider-form';

test('discovering only an identity does not invent model limits that can be saved', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'campus';
  form.name = 'Campus';
  form.endpoint = 'https://models.example.edu/v1';
  form.models = [createModelRow({ modelId: 'research', name: 'Research' })];

  expect(() => buildCustomProviderRequest(form, '4')).toThrow();

  // The user reviews and supplies the missing native execution limits before saving.
  form.models[0]!.contextWindow = '32768';
  form.models[0]!.maxOutputTokens = '4096';
  expect(buildCustomProviderRequest(form, '4').request.models?.[0]).toMatchObject({
    modelId: 'research', contextWindow: 32768, maxOutputTokens: 4096,
  });
});

test('editing provider connection settings preserves reviewed canonical model capabilities', () => {
  const model: Model = {
    modelId: 'research', provider: 'campus', name: 'Research', modalities: ['text', 'image'],
    contextWindow: 32768, maxOutputTokens: 4096, reasoningEffortSupported: true,
    reasoningOptions: [{ reasoningEffort: 'high', label: 'High', budgetTokens: 2048 }],
    variants: [{ variant: 'deep', label: 'Deep', reasoningEffort: 'high' }],
    toolsSupported: false, enabled: true, status: 'beta',
    pricing: { inputPerMillionTokens: 1, outputPerMillionTokens: 3,
      cacheReadPerMillionTokens: 0.1, cacheWritePerMillionTokens: null },
  };
  const initial: ProviderConfigurationRead = {
    revision: '4', configuration: { providerId: 'campus', name: 'Campus',
      endpoint: 'https://models.example.edu/v1', protocol: 'responses', credentialRef: null },
    headerNames: ['X-Tenant'], models: [model],
  };
  const form = createEmptyCustomProviderForm(initial);
  form.endpoint = 'https://models.example.edu/v2';

  const saved = buildCustomProviderRequest(form, '4');
  expect(saved.request.configuration.endpoint).toBe(form.endpoint);
  expect(saved.request.models).toEqual([model]);
});
