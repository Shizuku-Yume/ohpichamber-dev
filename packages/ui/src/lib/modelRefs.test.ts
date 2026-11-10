import { describe, expect, test } from 'bun:test';
<<<<<<< HEAD
type ModelRef = { providerID: string; modelID: string };
interface TestModel {
  id: string;
  modelID: string;
  providerID: string;
  name: string;
  capabilities: { tools: boolean; input: string[]; output: string[] };
  variants: never[];
  time: { released: number };
  cost: Array<{ input: number; output: number; cache: { read: number; write: number } }>;
  status: 'active';
  enabled: boolean;
  limit: { context: number; output: number };
}
interface TestProvider {
  id: string;
  name: string;
  activation: 'enabled';
  package: string;
  models: TestModel[];
}

const resolveModelRefs = (
  refs: readonly ModelRef[],
  providersList: readonly TestProvider[],
  hiddenModels: readonly ModelRef[],
): Array<ModelRef & { provider: TestProvider; model: TestModel }> => refs.flatMap(({ providerID, modelID }) => {
  const p = providersList.find((entry) => entry.id === providerID);
  const m = p?.models.find((entry) => entry.modelID === modelID);
  if (!p || !m) return [];
  if (hiddenModels.some((item) => item.providerID === providerID && item.modelID === modelID)) return [];
  return [{ provider: p, model: m, providerID, modelID }];
});

const getNextFavoriteModel = (
  favs: readonly ModelRef[],
  providersList: readonly TestProvider[],
  hiddenModels: readonly ModelRef[],
  current: ModelRef,
  delta: number,
): ModelRef | null => {
  const available = resolveModelRefs(favs, providersList, hiddenModels);
  if (available.length === 0) return null;
  const index = available.findIndex((item) => (
    item.providerID === current.providerID && item.modelID === current.modelID
  ));
  const next = available[(index + delta + available.length) % available.length];
  return next ? { providerID: next.providerID, modelID: next.modelID } : null;
};
=======
import { getNextFavoriteModel, resolveModelRefs } from './modelRefs';
>>>>>>> bc50ba56a

const model = (providerId: string, modelId: string) => ({
  id: `${providerId}/${modelId}`,
  modelID: modelId,
  providerID: providerId,
  name: modelId,
  capabilities: { tools: true, input: ['text'], output: ['text'] },
  variants: [],
  time: { released: 0 },
  cost: [{ input: 0, output: 0, cache: { read: 0, write: 0 } }],
  status: 'active' as const,
  enabled: true,
  limit: { context: 0, output: 0 },
});

const provider = (id: string, modelIds: string[]) => ({
  id,
  name: id,
  activation: 'enabled' as const,
  package: id,
  models: modelIds.map((modelId) => model(id, modelId)),
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
