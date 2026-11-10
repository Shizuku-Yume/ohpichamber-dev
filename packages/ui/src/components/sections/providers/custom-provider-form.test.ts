import { expect, test } from 'bun:test';
import type { Model, ProviderConfigurationRead } from '@openchamber/agent-contract';
import {
  buildCustomProviderRequest,
  createEmptyCustomProviderForm,
  createModelRow,
  isCustomProviderProtocol,
  validateCustomProviderForm,
  type CustomProviderTranslator,
} from './custom-provider-form';

const translate: CustomProviderTranslator = (key) => key;

test('the protocol guard admits only the native provider protocols', () => {
  expect(isCustomProviderProtocol('responses')).toBe(true);
  expect(isCustomProviderProtocol('generate-content')).toBe(true);
  expect(isCustomProviderProtocol('openai-chat')).toBe(false);
});

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
    pricing: {
      inputPerMillionTokens: 1, outputPerMillionTokens: 3,
      cacheReadPerMillionTokens: 0.1, cacheWritePerMillionTokens: null
    },
  };
  const initial: ProviderConfigurationRead = {
    revision: '4', configuration: {
      providerId: 'campus', name: 'Campus',
      endpoint: 'https://models.example.edu/v1', protocol: 'responses', credentialRef: null
    },
    headerNames: ['X-Tenant'], models: [model], imageModels: [],
  };
  const form = createEmptyCustomProviderForm(initial);
  form.endpoint = 'https://models.example.edu/v2';

  const saved = buildCustomProviderRequest(form, '4');
  expect(saved.request.configuration.endpoint).toBe(form.endpoint);
  expect(saved.request.models).toEqual([model]);
});

test('model controls update only the edited native fields', () => {
  const model: Model = {
    modelId: 'research', provider: 'campus', name: 'Research', modalities: ['text'],
    contextWindow: 32768, maxOutputTokens: 4096, reasoningEffortSupported: true,
    reasoningOptions: [{ reasoningEffort: 'high', label: 'High', budgetTokens: 2048 }],
    variants: [], toolsSupported: false,
    pricing: {
      inputPerMillionTokens: 1, outputPerMillionTokens: 3,
      cacheReadPerMillionTokens: 0.1, cacheWritePerMillionTokens: null
    },
  };
  const form = createEmptyCustomProviderForm({
    revision: '4', configuration: {
      providerId: 'campus', name: 'Campus',
      endpoint: 'https://models.example.edu/v1', protocol: 'chat-completions', credentialRef: null
    },
    headerNames: [], models: [model], imageModels: [],
  });
  form.models[0]!.modalities = ['text', 'image'];
  form.models[0]!.toolsSupported = true;

  expect(buildCustomProviderRequest(form, '4').request.models?.[0]).toMatchObject({
    modalities: ['text', 'image'],
    toolsSupported: true,
    reasoningOptions: model.reasoningOptions,
    pricing: model.pricing,
  });
});

test('validation points at duplicate model identities and invalid limits before submit', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'campus';
  form.name = 'Campus';
  form.endpoint = 'https://models.example.edu/v1';
  form.models = [
    { ...createModelRow(), modelId: 'research', name: 'Research', contextWindow: '100', maxOutputTokens: '200' },
    { ...createModelRow(), modelId: 'research', name: 'Research copy', contextWindow: '100', maxOutputTokens: '50' },
  ];

  const validation = validateCustomProviderForm(form, new Set(), false, translate);
  expect(validation.valid).toBe(false);
  expect(validation.models[0]?.maxOutputTokens).toBe('settings.providers.native.invalidConfiguration');
  expect(validation.models[1]?.modelId).toBe('settings.providers.page.custom.error.duplicate');
});

test('validation rejects a taken provider id only when creating', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'campus';
  form.name = 'Campus';
  form.endpoint = 'https://models.example.edu/v1';
  form.models[0]!.modelId = 'research';
  form.models[0]!.name = 'Research';
  form.models[0]!.contextWindow = '1024';
  form.models[0]!.maxOutputTokens = '512';

  expect(validateCustomProviderForm(form, new Set(['campus']), false, translate).fields.providerId)
    .toBe('settings.providers.page.custom.error.providerID.exists');
  expect(validateCustomProviderForm(form, new Set(['campus']), true, translate).fields.providerId)
    .toBeUndefined();
});
