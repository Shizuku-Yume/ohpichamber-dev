import type {
  Model,
  ModelCatalogInfo,
  ProviderModelDiscoveryResult,
} from '@openchamber/agent-contract';
import {
  catalogInputs,
  createModelRow,
  nativeKindOf,
  normalizeModelModalities,
  toTriState,
  type ModelAutoFillField,
  type ModelRow,
} from './custom-provider-model-rows';

export type ModelCatalogAnswers = ReadonlyMap<string, ModelCatalogInfo>;

export function autoFillFields(row: ModelRow, catalog: ModelCatalogInfo): ModelAutoFillField[] {
  const fields: ModelAutoFillField[] = [];
  if (fillableLimit(row, 'contextWindow', String(catalog.contextWindow))) fields.push('contextWindow');
  if (fillableLimit(row, 'maxOutputTokens', String(catalog.maxTokens))) fields.push('maxOutputTokens');
  if (!row.typed.has('modalities')) {
    const next = catalogInputs(catalog.input);
    if (next.length > 0 && !sameModalities(next, row.modalities)) fields.push('modalities');
  }
  if (!row.typed.has('toolsSupported') && row.toolsSupported === undefined && catalog.toolsSupported !== undefined) fields.push('toolsSupported');
  if (!row.typed.has('reasoning') && row.reasoning === undefined) fields.push('reasoning');
  if (!row.typed.has('pricing') && !row.costInput.trim() && !row.costOutput.trim()) fields.push('pricing');
  if (!row.typed.has('thinking') && !row.thinkingMode && catalog.thinking !== undefined) fields.push('thinking');
  if (!row.typed.has('imageCountBudget') && !row.imageCountBudget.trim() && catalog.imageCountBudget !== undefined) fields.push('imageCountBudget');
  return fields;
}

const sameModalities = (left: readonly string[], right: readonly Model['modalities'][number][]): boolean =>
  left.length === right.length && left.every((value, index) => right[index] === value);

const fillableLimit = (row: ModelRow, field: 'contextWindow' | 'maxOutputTokens', value: string): boolean => {
  if (row.typed.has(field)) return false;
  const current = row[field].trim();
  if (!current) return true;
  return row.filledFrom[field] !== undefined && current !== value;
};

export function applyModelCatalogInfo(
  models: readonly ModelRow[],
  answers: ModelCatalogAnswers,
): { models: ModelRow[]; filled: number } {
  let filled = 0;
  const next = models.map((row) => {
    const catalog = answers.get(row.modelId.trim());
    if (!catalog) return row;
    const fields = autoFillFields(row, catalog);
    if (fields.length === 0) return row;
    filled += 1;
    const filledFrom = { ...row.filledFrom };
    const updated: ModelRow = { ...row, filledFrom };
    for (const field of fields) {
      filledFrom[field] = catalog.source;
      if (field === 'contextWindow') updated.contextWindow = String(catalog.contextWindow);
      else if (field === 'maxOutputTokens') updated.maxOutputTokens = String(catalog.maxTokens);
      else if (field === 'modalities') {
        const inputs = catalogInputs(catalog.input);
        const nativeKind = nativeKindOf(inputs);
        updated.nativeKind = nativeKind;
        updated.modalities = normalizeModelModalities(nativeKind, inputs);
      } else if (field === 'toolsSupported') updated.toolsSupported = catalog.toolsSupported;
      else if (field === 'reasoning') {
        updated.reasoning = catalog.reasoning;
        updated.reasoningEffortSupported = catalog.reasoning;
      } else if (field === 'pricing') {
        updated.costInput = String(catalog.cost.input);
        updated.costOutput = String(catalog.cost.output);
        updated.costCacheRead = String(catalog.cost.cacheRead);
        updated.costCacheWrite = String(catalog.cost.cacheWrite);
        updated.pricing = {
          inputPerMillionTokens: catalog.cost.input,
          outputPerMillionTokens: catalog.cost.output,
          cacheReadPerMillionTokens: catalog.cost.cacheRead,
          cacheWritePerMillionTokens: catalog.cost.cacheWrite,
        };
      } else if (field === 'thinking' && catalog.thinking) {
        updated.thinkingMode = catalog.thinking.mode;
        updated.thinkingEfforts = [...catalog.thinking.efforts];
        updated.thinkingDefaultLevel = catalog.thinking.defaultLevel ?? '';
        updated.thinkingSupportsDisplay = toTriState(catalog.thinking.supportsDisplay);
        updated.thinkingRequiresEffort = toTriState(catalog.thinking.requiresEffort);
        updated.thinkingEffortMapJson = catalog.thinking.effortMap ? JSON.stringify(catalog.thinking.effortMap, null, 2) : '';
      } else if (field === 'imageCountBudget' && catalog.imageCountBudget !== undefined) {
        updated.imageCountBudget = String(catalog.imageCountBudget);
      }
    }
    if (catalog.family !== undefined) updated.family = catalog.family;
    return updated;
  });
  return { models: next, filled };
}

export function idsMissingCatalog(
  models: readonly ModelRow[],
  catalogued: ModelCatalogAnswers,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of models) {
    const modelId = row.modelId.trim();
    if (!modelId || seen.has(modelId) || catalogued.has(modelId)) continue;
    seen.add(modelId);
    ids.push(modelId);
  }
  return ids;
}

export const AUTO_FILL_ENRICH_LIMIT = 500;
export const AUTO_FILL_OPENROUTER_LIMIT = 200;

export function autoFillIds(models: readonly ModelRow[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of models) {
    const modelId = row.modelId.trim();
    if (!modelId || seen.has(modelId)) continue;
    seen.add(modelId);
    ids.push(modelId);
  }
  return ids;
}

export type AutoFillNotice =
  | 'enterprise'
  | 'failed'
  | 'none'
  | 'nothing'
  | 'partial';

export function unresolvedAutoFillIds(ids: readonly string[], answers: ModelCatalogAnswers): string[] {
  const seen = new Set<string>();
  const unresolved: string[] = [];
  for (const id of ids) {
    const modelId = id.trim();
    if (!modelId || answers.has(modelId) || seen.has(modelId)) continue;
    seen.add(modelId);
    unresolved.push(modelId);
  }
  return unresolved;
}

const AUTO_FILL_NOTICE_ID_LIMIT = 10;

export function autoFillNoticeFor(input: {
  lookup: 'enterprise' | 'failed' | null;
  answered: number;
  filled: number;
  unresolved: readonly string[];
}): AutoFillNotice | null {
  if (input.lookup) return input.lookup;
  if (input.answered === 0) return 'none';
  if (input.unresolved.length > 0) return 'partial';
  if (input.filled === 0) return 'nothing';
  return null;
}

export function autoFillNoticeIds(ids: readonly string[]): { shown: string[]; hidden: number } {
  const shown = ids.slice(0, AUTO_FILL_NOTICE_ID_LIMIT);
  return { shown, hidden: Math.max(0, ids.length - shown.length) };
}

export function formatAutoFillNoticeModels(
  ids: readonly string[],
  more: (models: string, count: number) => string,
): string {
  const { shown, hidden } = autoFillNoticeIds(ids);
  const list = shown.join(', ');
  return hidden > 0 ? more(list, hidden) : list;
}

export function createDiscoveredModelRow(model: ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const row = createModelRow(model);
  if (!model.catalog) return row;
  return applyModelCatalogInfo([row], new Map([[row.modelId.trim(), model.catalog]])).models[0];
}

export function staleModelIds(models: readonly ModelRow[], discovered: readonly { modelId: string }[]): string[] {
  const known = new Set(discovered.map((model) => model.modelId.trim()));
  return models
    .map((row) => row.modelId.trim())
    .filter((modelId) => modelId !== '' && !known.has(modelId));
}

export function idsToAdd(models: readonly ModelRow[], discovered: readonly { modelId: string }[]): string[] {
  const existing = new Set(models.map((row) => row.modelId.trim()).filter(Boolean));
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const model of discovered) {
    const modelId = model.modelId.trim();
    if (!modelId || existing.has(modelId) || seen.has(modelId)) continue;
    seen.add(modelId);
    ids.push(modelId);
  }
  return ids;
}

export type DiscoveryFilter = 'all' | 'stale' | 'text' | 'image' | 'embedding' | 'audio';

export const discoveryFilterValues: readonly DiscoveryFilter[] = ['all', 'stale', 'text', 'image', 'embedding', 'audio'];

export interface DiscoveryRow {
  kind: 'discovered' | 'stale';
  modelId: string;
  name?: string;
  catalog?: ModelCatalogInfo;
  formRow?: ModelRow;
  family?: string;
}

export function discoveryRows(
  discovered: readonly ProviderModelDiscoveryResult['models'][number][],
  models: readonly ModelRow[],
): DiscoveryRow[] {
  const formById = new Map<string, ModelRow>();
  for (const row of models) {
    const modelId = row.modelId.trim();
    if (modelId && !formById.has(modelId)) formById.set(modelId, row);
  }
  const discoveredIds = new Set(discovered.map((model) => model.modelId.trim()));
  const rows: DiscoveryRow[] = discovered.map((model) => {
    const modelId = model.modelId.trim();
    return {
      kind: 'discovered',
      modelId,
      name: model.name,
      catalog: model.catalog,
      formRow: formById.get(modelId),
      family: model.catalog?.family,
    };
  });
  for (const [modelId, formRow] of formById) {
    if (discoveredIds.has(modelId)) continue;
    rows.push({ kind: 'stale', modelId, name: formRow.name, formRow, family: formRow.family });
  }
  return rows;
}

export function matchesDiscoveryFilter(row: DiscoveryRow, filter: DiscoveryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'stale') return row.kind === 'stale';
  const inputs = row.catalog?.input ?? row.formRow?.modalities ?? ['text'];
  if (filter === 'text' || filter === 'image') return inputs.includes(filter);
  if (filter === 'embedding') return row.formRow?.nativeKind === 'embedding';
  return row.formRow?.nativeKind === 'tts' || row.formRow?.nativeKind === 'stt';
}

export function groupDiscoveryRows(rows: readonly DiscoveryRow[]): { grouped: boolean; groups: Array<{ family: string; rows: DiscoveryRow[] }> } {
  if (rows.length === 0 || rows.some((row) => !row.family)) return { grouped: false, groups: [] };
  const groups = new Map<string, DiscoveryRow[]>();
  for (const row of rows) {
    const family = row.family!;
    const bucket = groups.get(family);
    if (bucket) bucket.push(row);
    else groups.set(family, [row]);
  }
  return { grouped: true, groups: [...groups].map(([family, familyRows]) => ({ family, rows: familyRows })) };
}

export function discoveryFilterCounts(rows: readonly DiscoveryRow[]): Record<DiscoveryFilter, number> {
  const counts: Record<DiscoveryFilter, number> = { all: rows.length, stale: 0, text: 0, image: 0, embedding: 0, audio: 0 };
  for (const row of rows) {
    for (const filter of ['stale', 'text', 'image', 'embedding', 'audio'] as const) {
      if (matchesDiscoveryFilter(row, filter)) counts[filter] += 1;
    }
  }
  return counts;
}
