import { describe, expect, test } from 'bun:test';

import { findAnsweringModelKey, findSessionModelKey, limitsForAnsweringModel } from './contextWindowLimits';

describe('findAnsweringModelKey', () => {
  test('names the newest assistant message with model ids', () => {
    expect(findAnsweringModelKey([
      { role: 'assistant', providerId: 'zai', modelId: 'glm-4' },
      { role: 'user' },
      { role: 'assistant', providerId: 'openai', modelId: 'gpt' },
      { role: 'user' },
    ])).toBe('openai/gpt');
  });

  test('reads the canonical providerId/modelId of a synced answer', () => {
    expect(findAnsweringModelKey([
      { role: 'user' },
      { role: 'assistant', providerId: 'openai', modelId: 'gpt-5' },
    ])).toBe('openai/gpt-5');
  });

  test('does not interpret fields outside the canonical message contract', () => {
    expect(findAnsweringModelKey([{ role: 'assistant', ...{ providerID: 'legacy', modelID: 'm1' } }])).toBeNull();
  });

  test('is null before the first answer or when the answer names no model', () => {
    expect(findAnsweringModelKey([{ role: 'user' }])).toBeNull();
    expect(findAnsweringModelKey([{ role: 'assistant' }])).toBeNull();
  });
});

describe('findSessionModelKey', () => {
  test('names the model the session record runs on, null when it has none', () => {
    expect(findSessionModelKey({ model: { providerId: 'openai', modelId: 'gpt' } })).toBe('openai/gpt');
    expect(findSessionModelKey({ model: null })).toBeNull();
    expect(findSessionModelKey({})).toBeNull();
    expect(findSessionModelKey(undefined)).toBeNull();
  });
});

describe('limitsForAnsweringModel', () => {
  test('reads the answering model window from the provider list, zero when it is missing', () => {
    const providers = [{ providerId: 'zai', models: [{ modelId: 'glm-4', contextWindow: 1_000_000, maxOutputTokens: 128_000 }] }];
    expect(limitsForAnsweringModel('zai/glm-4', providers)).toEqual({ context: 1_000_000, output: 128_000 });
    expect(limitsForAnsweringModel('zai/other', providers)).toEqual({ context: 0, output: 0 });
    expect(limitsForAnsweringModel('other/model', providers)).toEqual({ context: 0, output: 0 });
    expect(limitsForAnsweringModel(null, providers)).toEqual({ context: 0, output: 0 });
  });
});
