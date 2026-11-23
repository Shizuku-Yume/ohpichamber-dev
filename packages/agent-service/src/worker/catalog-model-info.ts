/**
 * Capability metadata from OMP's bundled model catalog.
 *
 * The bundled catalog is the data OMP itself executes with, so auto-fill reads
 * it offline instead of trusting a second authority. Lookup tries the provider
 * the caller named (a bundled provider's own row) first, then OMP's proxy
 * reference matcher, which understands reseller ids such as
 * `[Kiro] claude-opus-4-6`, `gpt-5.4:cloud` and `vendor/claude-sonnet-4-6`.
 */
import {
  getBundledModelReferenceIndex, getBundledModels, isGeneratedProvider, resolveModelReference,
  type Model as CatalogModel,
} from '@oh-my-pi/pi-catalog';
import { ModelCatalogInfoSchema, OmpThinkingConfigSchema, type ModelCatalogInfo } from '@openchamber/agent-contract';

// Keyed by provider id: a provider's bundled rows change only with the pinned
// package, so one lowercase lookup per provider is built and reused.
const providerLookups = new Map<string, Map<string, CatalogModel>>();

function bundledModel(providerId: string, modelId: string): CatalogModel | undefined {
  if (!isGeneratedProvider(providerId)) return undefined;
  let lookup = providerLookups.get(providerId);
  if (!lookup) {
    lookup = new Map();
    for (const model of getBundledModels(providerId)) lookup.set(model.id.toLowerCase(), model);
    providerLookups.set(providerId, lookup);
  }
  return lookup.get(modelId.toLowerCase());
}

function toCatalogInfo(model: CatalogModel): ModelCatalogInfo | undefined {
  const { contextWindow, maxTokens, cost } = model;
  // Catalog rows without usable limits cannot fill a models.yml row.
  if (contextWindow === null || maxTokens === null || contextWindow <= 0 || maxTokens <= 0) return undefined;
  const input = [...new Set(model.input)].filter((modality): modality is 'text' | 'image' => modality === 'text' || modality === 'image');
  if (input.length === 0) return undefined;
  const rates = [cost.input, cost.output, cost.cacheRead, cost.cacheWrite];
  // Zero-priced and unpriced rows are representable; a negative sentinel rate
  // ("unlimited credits") is not a price and leaves the row unenriched.
  if (!rates.every(rate => Number.isFinite(rate) && rate >= 0)) return undefined;
  const info: ModelCatalogInfo = {
    source: 'omp-catalog',
    input,
    contextWindow,
    maxTokens,
    cost: { input: cost.input, output: cost.output, cacheRead: cost.cacheRead, cacheWrite: cost.cacheWrite },
    reasoning: model.reasoning || (model.thinking?.efforts.length ?? 0) > 0,
  };
  if (model.supportsTools !== undefined) info.toolsSupported = model.supportsTools;
  if (model.thinking !== undefined) {
    const thinkingCandidate: {
      mode: typeof model.thinking.mode;
      efforts: typeof model.thinking.efforts[number][];
      defaultLevel?: typeof model.thinking.defaultLevel;
      effortMap?: Record<string, string>;
      supportsDisplay?: boolean;
      requiresEffort?: boolean;
    } = {
      mode: model.thinking.mode,
      efforts: [...model.thinking.efforts],
    };
    if (model.thinking.defaultLevel !== undefined) thinkingCandidate.defaultLevel = model.thinking.defaultLevel;
    if (model.thinking.effortMap !== undefined) thinkingCandidate.effortMap = { ...model.thinking.effortMap };
    if (model.thinking.supportsDisplay !== undefined) thinkingCandidate.supportsDisplay = model.thinking.supportsDisplay;
    if (model.thinking.requiresEffort !== undefined) thinkingCandidate.requiresEffort = model.thinking.requiresEffort;
    const parsedThinking = OmpThinkingConfigSchema.safeParse(thinkingCandidate);
    if (parsedThinking.success) info.thinking = parsedThinking.data;
  }
  if (model.imageCountBudget !== undefined) info.imageCountBudget = model.imageCountBudget;
  if (model.identity?.family !== undefined) info.family = model.identity.family;
  if (model.isBeta) info.status = 'beta';
  return ModelCatalogInfoSchema.parse(info);
}

/** Resolve one model id against the bundled catalog; `undefined` when unknown. */
export function catalogModelInfo(modelId: string, providerId?: string): ModelCatalogInfo | undefined {
  const model = (providerId === undefined ? undefined : bundledModel(providerId, modelId))
    ?? resolveModelReference(modelId, getBundledModelReferenceIndex());
  return model === undefined ? undefined : toCatalogInfo(model);
}
