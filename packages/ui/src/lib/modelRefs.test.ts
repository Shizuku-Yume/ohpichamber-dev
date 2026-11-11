import { describe, expect, test } from 'bun:test';
import type { Model, Provider } from '@openchamber/agent-contract';
import { getNextFavoriteModel, resolveModelRefs } from './modelRefs';

const model = (providerId: string, modelId: string): Model => ({
  modelId,
  provider: providerId,
  name: modelId,
  modalities: ['text'],
  contextWindow: 1024,
  maxOutputTokens: 512,
  reasoningEffortSupported: false,
  reasoningOptions: [],
  variants: [],
  pricing: null,
});

const provider = (providerId: string, modelIds: string[]): Provider & { models: Model[] } => ({
  providerId,
  name: providerId,
  endpoint: null,
  protocol: null,
  authMethods: [],
  auth: { status: 'missing' },
  models: modelIds.map((modelId) => model(providerId, modelId)),
});

const ref = (providerID: string, modelID: string) => ({ providerID, modelID });

// The catalog after OpenAI was disconnected: its favorite stays stored.
const providers = [provider('anthropic', ['opus', 'sonnet', 'haiku'])];
const favorites = [ref('anthropic', 'opus'), ref('openai', 'gpt'), ref('anthropic', 'sonnet'), ref('anthropic', 'gone')];

describe('resolveModelRefs', () => {
  test('keeps the stored order and drops unknown providers, unknown models and hidden ones', () => {
    const resolved = resolveModelRefs(
      [...favorites, ref('anthropic', 'haiku')],
      providers,
      [ref('anthropic', 'haiku')],
    );
    expect(resolved.map(({ providerID, modelID }) => `${providerID}/${modelID}`)).toEqual([
      'anthropic/opus',
      'anthropic/sonnet',
    ]);
  });
});

describe('getNextFavoriteModel', () => {
  test('cycles forward and backward over resolvable favorites only', () => {
    expect(getNextFavoriteModel(favorites, providers, [], ref('anthropic', 'opus'), 1)).toEqual(ref('anthropic', 'sonnet'));
    expect(getNextFavoriteModel(favorites, providers, [], ref('anthropic', 'sonnet'), 1)).toEqual(ref('anthropic', 'opus'));
    expect(getNextFavoriteModel(favorites, providers, [], ref('anthropic', 'opus'), -1)).toEqual(ref('anthropic', 'sonnet'));
  });

  test('leaves an unavailable current model for the first available favorite', () => {
    expect(getNextFavoriteModel(favorites, providers, [], ref('openai', 'gpt'), 1)).toEqual(ref('anthropic', 'opus'));
  });

  test('returns null when no favorite resolves', () => {
    expect(getNextFavoriteModel([ref('openai', 'gpt')], providers, [], ref('anthropic', 'opus'), 1)).toBeNull();
    expect(getNextFavoriteModel(favorites, providers, favorites, ref('anthropic', 'opus'), 1)).toBeNull();
  });
});
