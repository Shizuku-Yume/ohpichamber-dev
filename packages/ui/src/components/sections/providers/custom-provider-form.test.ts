import { expect, test } from 'bun:test';
import type { Model, ModelCatalogInfo, ProviderConfigurationRead } from '@openchamber/agent-contract';
import { OMP_MODEL_APIS, OMP_PROVIDER_APIS } from '@openchamber/agent-contract';
import { apiDisplayLabel, modelApiDisplayLabel } from './provider-api-labels';
import {
  applyModelCatalogInfo,
  autoFillFields,
  autoFillIds,
  autoFillNoticeFor,
  autoFillNoticeIds,
  createDiscoveredModelRow,
  discoveryFilterCounts,
  discoveryFilterValues,
  discoveryRows,
  formatAutoFillNoticeModels,
  groupDiscoveryRows,
  idsMissingCatalog,
  idsToAdd,
  matchesDiscoveryFilter,
  staleModelIds,
  unresolvedAutoFillIds,
} from './custom-provider-autofill';
import { buildCustomProviderRequest } from './custom-provider-persist';
import {
  catalogInputs,
  createModelRow,
  duplicateModelRow,
  markModelFieldTyped,
  modelModalitiesForKind,
  normalizeModelModalities,
  readCompatBooleanFlag,
  readCompatMaxTokensField,
  updateCompatJsonFlag,
} from './custom-provider-model-rows';
import {
  createEmptyCustomProviderForm,
  isCustomProviderProtocol,
  isValidProviderID,
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

  const withoutLimits = buildCustomProviderRequest(form, '4').request.native?.models?.[0];
  expect(withoutLimits?.contextWindow).toBeUndefined();
  expect(withoutLimits?.maxTokens).toBeUndefined();

  // The user reviews and supplies limits before saving.
  form.models[0]!.contextWindow = '32768';
  form.models[0]!.maxOutputTokens = '4096';
  expect(buildCustomProviderRequest(form, '4').request.native?.models?.[0]).toMatchObject({
    id: 'research', contextWindow: 32768, maxTokens: 4096,
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
  expect(saved.request.configuration?.endpoint).toBe(form.endpoint);
  expect(saved.request.native?.models?.[0]).toMatchObject({
    id: 'research',
    name: 'Research',
    input: ['text', 'image'],
    contextWindow: 32768,
    maxTokens: 4096,
    reasoning: true,
    supportsTools: false,
    cost: { input: 1, output: 3, cacheRead: 0.1, cacheWrite: 0 },
  });
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

  expect(buildCustomProviderRequest(form, '4').request.native?.models?.[0]).toMatchObject({
    input: ['text', 'image'],
    supportsTools: true,
    reasoning: true,
    cost: { input: 1, output: 3, cacheRead: 0.1, cacheWrite: 0 },
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
  expect(validation.models[0]?.maxOutputTokens).toBe('settings.providers.page.custom.error.maxOutputExceedsContext');
  expect(validation.models[1]?.modelId).toBe('settings.providers.page.custom.error.duplicate');
});

test('the provider id rule follows OMP\'s selector grammar', () => {
  expect(isValidProviderID('Campus.2')).toBe(true);
  expect(isValidProviderID('campus_2-alpha')).toBe(true);

  for (const invalid of ['a/b', 'a#b', 'a@b', 'a:b', 'a b', '__proto__', 'constructor', 'prototype', '', 'a'.repeat(129)]) {
    expect(isValidProviderID(invalid)).toBe(false);
  }
  expect(isValidProviderID('a'.repeat(128))).toBe(true);

  expect(validateCustomProviderForm({ ...createEmptyCustomProviderForm(), providerId: 'a/b' }, new Set(), false, translate)
    .fields.providerId).toBe('settings.providers.page.custom.error.providerID.format');
});

test('provider ids are unique regardless of case', () => {
  const form = { ...createEmptyCustomProviderForm(), providerId: 'Campus.2' };
  expect(validateCustomProviderForm(form, new Set(['campus.2']), false, translate).fields.providerId)
    .toBe('settings.providers.page.custom.error.providerID.exists');
  expect(validateCustomProviderForm(form, new Set(['campus.3']), false, translate).fields.providerId)
    .toBeUndefined();
});

test('the request builder keeps a gateway query string unchanged', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'Campus.2';
  form.name = 'Campus';
  form.endpoint = 'https://res.openai.azure.com/openai/v1?api-version=2024-10-21';
  form.models[0]!.modelId = 'research';
  form.models[0]!.name = 'Research';
  form.models[0]!.contextWindow = '32768';
  form.models[0]!.maxOutputTokens = '4096';

  expect(validateCustomProviderForm(form, new Set(), false, translate).fields.endpoint).toBeUndefined();
  expect(buildCustomProviderRequest(form, '4').request.configuration?.endpoint)
    .toBe('https://res.openai.azure.com/openai/v1?api-version=2024-10-21');
});

test('the base URL still refuses fragments and embedded credentials', () => {
  for (const endpoint of [
    'https://user:secret@models.example.edu/v1',
    'https://user@models.example.edu/v1',
    'https://models.example.edu/v1#section',
    'ftp://models.example.edu/v1',
  ]) {
    const form = { ...createEmptyCustomProviderForm(), endpoint };
    expect(validateCustomProviderForm(form, new Set(), false, translate).fields.endpoint)
      .toBe('settings.providers.page.custom.error.baseURL.format');
  }
});

test('audio and embedding chips follow the native kind the writer accepts', () => {
  expect(modelModalitiesForKind('chat')).toEqual(['text', 'image']);
  expect(modelModalitiesForKind('tts')).toEqual(['text', 'image', 'audio']);
  expect(modelModalitiesForKind('stt')).toEqual(['text', 'image', 'audio']);
  expect(modelModalitiesForKind('embedding')).toEqual(['text', 'image', 'embedding']);

  // A saved chat row can still carry an audio modality; the request drops it
  // instead of sending a combination the writer rejects with 422.
  expect(normalizeModelModalities('chat', ['text', 'audio'])).toEqual(['text']);
  expect(normalizeModelModalities('embedding', ['text', 'audio'])).toEqual(['text']);
  expect(normalizeModelModalities('tts', ['audio'])).toEqual(['text', 'audio']);
});

test('a tts row keeps its native kind in the built request', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'speech';
  form.name = 'Speech';
  form.endpoint = 'https://models.example.edu/v1';
  form.models[0]!.modelId = 'voice';
  form.models[0]!.name = 'Voice';
  form.models[0]!.contextWindow = '4096';
  form.models[0]!.maxOutputTokens = '1024';
  form.models[0]!.kind = 'tts';
  form.models[0]!.nativeKind = 'tts';
  form.models[0]!.modalities = ['text', 'audio'];

  expect(buildCustomProviderRequest(form, '4').request.native?.models?.[0]).toMatchObject({
    id: 'voice',
    kind: 'tts',
    input: ['text'],
  });
});

test('a row carries the native kind a saved model implies', () => {
  const embedding = createModelRow({
    modelId: 'embed', provider: 'campus', name: 'Embed', modalities: ['text', 'embedding'],
    contextWindow: 8192, maxOutputTokens: 1024, reasoningEffortSupported: false,
    reasoningOptions: [], variants: [], pricing: null,
  });
  expect(embedding.nativeKind).toBe('embedding');
  expect(embedding.modalities).toEqual(['text', 'embedding']);

  const speech = createModelRow({
    modelId: 'voice', provider: 'campus', name: 'Voice', modalities: ['text', 'audio'],
    contextWindow: 8192, maxOutputTokens: 1024, reasoningEffortSupported: false,
    reasoningOptions: [], variants: [], pricing: null,
  });
  // OMP publishes audio only for a tts/stt runner, so the modality identifies
  // the kind and the row keeps offering the audio chip.
  expect(speech.nativeKind).toBe('tts');
  expect(speech.modalities).toEqual(['text', 'audio']);
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

// ── Model-info auto-fill and the discovery dialog ──────────────────────────

const catalog = (overrides: Partial<ModelCatalogInfo> = {}): ModelCatalogInfo => ({
  source: 'omp-catalog',
  input: ['text'],
  contextWindow: 200000,
  maxTokens: 32000,
  cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 },
  reasoning: true,
  toolsSupported: true,
  family: 'claude',
  ...overrides,
});

test('auto-fill writes only empty fields and never a value the user typed', () => {
  const row = createModelRow({ modelId: 'claude-opus-4-6', name: 'Claude Opus 4.6' });
  row.contextWindow = '4096';
  const typed = markModelFieldTyped(row, 'contextWindow');

  const fields = autoFillFields(typed, catalog({ input: ['text', 'image'] }));
  expect(fields).not.toContain('contextWindow');
  expect(fields).toEqual(expect.arrayContaining(['maxOutputTokens', 'modalities', 'toolsSupported', 'reasoning', 'pricing']));

  const { models } = applyModelCatalogInfo([typed], new Map([['claude-opus-4-6', catalog()]]));
  expect(models[0]!.contextWindow).toBe('4096');
  expect(models[0]!.maxOutputTokens).toBe('32000');
  expect(models[0]!.filledFrom.contextWindow).toBeUndefined();
  expect(models[0]!.filledFrom.maxOutputTokens).toBe('omp-catalog');
  expect(models[0]!.family).toBe('claude');
});

test('a filled value may be refilled, and the label follows the later source', () => {
  const row = createModelRow({ modelId: 'mystery-model', name: 'Mystery' });
  const first = applyModelCatalogInfo([row], new Map([['mystery-model', catalog({ source: 'omp-catalog' })]]));
  const second = applyModelCatalogInfo(first.models, new Map([['mystery-model', catalog({ source: 'openrouter', maxTokens: 64000 })]]));
  expect(second.models[0]!.maxOutputTokens).toBe('64000');
  expect(second.models[0]!.filledFrom.maxOutputTokens).toBe('openrouter');
});

test('new catalog-filled reasoning rows preserve reasoning boolean in the native payload', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'campus';
  form.name = 'Campus';
  form.endpoint = 'https://models.example.edu/v1';
  form.models = [createDiscoveredModelRow({ modelId: 'research', name: 'Research', catalog: catalog() })];
  expect(buildCustomProviderRequest(form, '4').request.native?.models?.[0]).toMatchObject({
    reasoning: true,
  });
  const plain = applyModelCatalogInfo([createModelRow({ modelId: 'plain', name: 'Plain' })], new Map([['plain', catalog({ reasoning: false })]]));
  form.models = plain.models;
  expect(buildCustomProviderRequest(form, '4').request.native?.models?.[0]).toMatchObject({
    reasoning: false,
  });
});

test('stale ids are the form rows the fresh discovery list no longer carries', () => {
  const kept = createModelRow({ modelId: 'kept', name: 'Kept' });
  const gone = createModelRow({ modelId: 'gone', name: 'Gone' });
  const blank = createModelRow();
  expect(staleModelIds([kept, gone, blank], [{ modelId: 'kept' }])).toEqual(['gone']);
});

test('add-all offers exactly the discovered ids the form does not hold', () => {
  const existing = createModelRow({ modelId: 'b', name: 'B' });
  expect(idsToAdd([existing], [
    { modelId: 'a' },
    { modelId: 'b' },
    { modelId: 'a' },
  ])).toEqual(['a']);
});

test('a discovered row is prefilled from its catalog without marking the values as typed', () => {
  const row = createDiscoveredModelRow({ modelId: 'claude-opus-4-6', name: 'Claude Opus 4.6', catalog: catalog() });
  expect(row.contextWindow).toBe('200000');
  expect(row.filledFrom.contextWindow).toBe('omp-catalog');
  // A later catalog read may still correct these values.
  expect(autoFillFields(row, catalog({ maxTokens: 64000 }))).toContain('maxOutputTokens');
});

test('filter chips count every kind, and a chip whose count is zero still exists', () => {
  const rows = discoveryRows(
    [
      { modelId: 'text-model', name: 'Text', catalog: catalog({ input: ['text'] }) },
      { modelId: 'vision-model', name: 'Vision', catalog: catalog({ input: ['text', 'image'] }) },
    ],
    [createModelRow({ modelId: 'stale-model', name: 'Stale' })],
  );
  const counts = discoveryFilterCounts(rows);
  expect(counts).toMatchObject({ all: 3, stale: 1, text: 3, image: 1, embedding: 0, audio: 0 });
  expect(discoveryFilterValues).toEqual(['all', 'stale', 'text', 'image', 'embedding', 'audio']);
  expect(matchesDiscoveryFilter(rows[0]!, 'image')).toBe(false);
  expect(matchesDiscoveryFilter(rows[1]!, 'image')).toBe(true);
  expect(matchesDiscoveryFilter(rows[2]!, 'stale')).toBe(true);
});

test('family grouping only happens when every visible row names a family', () => {
  const familyRows = discoveryRows([
    { modelId: 'a', name: 'A', catalog: catalog({ family: 'claude', input: ['text'] }) },
    { modelId: 'b', name: 'B', catalog: catalog({ family: 'claude', input: ['text'] }) },
  ], []);
  expect(groupDiscoveryRows(familyRows).grouped).toBe(true);

  const mixed = discoveryRows([
    { modelId: 'a', name: 'A', catalog: catalog({ family: 'claude', input: ['text'] }) },
    { modelId: 'b', name: 'B', catalog: catalog({ input: ['text'], family: undefined }) },
  ], []);
  expect(groupDiscoveryRows(mixed).grouped).toBe(false);
});

test('the OpenRouter step asks only for ids the OMP catalog did not answer', () => {
  const known = createModelRow({ modelId: 'known', name: 'Known' });
  const unknown = createModelRow({ modelId: 'unknown', name: 'Unknown' });
  const answers = new Map([['known', catalog()]]);
  expect(idsMissingCatalog([known, unknown], answers)).toEqual(['unknown']);
});

test('an enterprise refusal is reported even when no catalog answered any id', () => {
  expect(autoFillNoticeFor({ lookup: 'enterprise', answered: 0, filled: 0, unresolved: ['a', 'b'] })).toBe('enterprise');
  expect(autoFillNoticeFor({ lookup: 'failed', answered: 0, filled: 0, unresolved: [] })).toBe('failed');
});

test('the notice tells no-data, nothing-to-fill and partial apart', () => {
  expect(autoFillNoticeFor({ lookup: null, answered: 0, filled: 0, unresolved: ['a'] })).toBe('none');
  expect(autoFillNoticeFor({ lookup: null, answered: 2, filled: 0, unresolved: [] })).toBe('nothing');
  expect(autoFillNoticeFor({ lookup: null, answered: 2, filled: 1, unresolved: ['b'] })).toBe('partial');
  expect(autoFillNoticeFor({ lookup: null, answered: 2, filled: 1, unresolved: [] })).toBeNull();
});

test('catalog inputs are written text first regardless of the source order', () => {
  expect(catalogInputs(['image', 'text'])).toEqual(['text', 'image']);
  const row = createModelRow({ modelId: 'vision-model', name: 'Vision' });
  const { models } = applyModelCatalogInfo([row], new Map([['vision-model', catalog({ input: ['image', 'text'] })]]));
  expect(models[0]!.modalities).toEqual(['text', 'image']);
});

test('a family-only answer fills nothing', () => {
  const row = createModelRow({ modelId: 'plain', name: 'Plain', contextWindow: 1, maxOutputTokens: 1, });
  const typedAll = ['contextWindow', 'maxOutputTokens', 'modalities', 'toolsSupported', 'reasoning', 'pricing'] as const;
  let current = row;
  for (const field of typedAll) current = markModelFieldTyped(current, field);
  const { filled, models } = applyModelCatalogInfo([current], new Map([['plain', catalog({ family: 'claude' })]]));
  expect(filled).toBe(0);
  expect(models[0]!.family).toBeUndefined();
});

test('a discovered row with no catalog and no form row still counts as text', () => {
  const rows = discoveryRows([{ modelId: 'bare', name: 'Bare' }], []);
  expect(matchesDiscoveryFilter(rows[0]!, 'text')).toBe(true);
  expect(discoveryFilterCounts(rows).text).toBe(1);
});

test('auto-fill ids are distinct model ids in form order', () => {
  const models = [createModelRow({ modelId: ' a ', name: 'A' }), createModelRow({ modelId: 'b', name: 'B' }), createModelRow({ modelId: 'a', name: 'A again' })];
  expect(autoFillIds(models)).toEqual(['a', 'b']);
});

test('validation names the output limit and header problems specifically', () => {
  const form = createEmptyCustomProviderForm();
  form.providerId = 'campus';
  form.name = 'Campus';
  form.endpoint = 'https://models.example.edu/v1';
  form.models[0]!.modelId = 'research';
  form.models[0]!.name = 'Research';
  form.models[0]!.contextWindow = '4096';
  form.models[0]!.maxOutputTokens = '8192';
  expect(validateCustomProviderForm(form, new Set(), false, translate).models[0]!.maxOutputTokens)
    .toBe('settings.providers.page.custom.error.maxOutputExceedsContext');

  form.models[0]!.maxOutputTokens = '512';
  form.headers[0]!.name = 'bad header';
  form.headers[0]!.value = 'x';
  expect(validateCustomProviderForm(form, new Set(), false, translate).headers[0]!.name)
    .toBe('settings.providers.page.custom.error.headerName.format');
});

test('discovered ids compare trimmed against form rows', () => {
  const row = createModelRow({ modelId: 'kept', name: 'Kept' });
  expect(staleModelIds([row], [{ modelId: ' kept ' }])).toEqual([]);
  expect(idsToAdd([row], [{ modelId: ' kept ' }, { modelId: ' new ' }])).toEqual(['new']);
  expect(discoveryRows([{ modelId: ' kept ', name: 'Kept' }], [row])[0]!.formRow).toBe(row);
});

test('a real-path fill reports exactly the ids no source answered', () => {
  // Six models in the form: the OMP catalog knows three, OpenRouter one more,
  // and two stay unknown — those two are what the notice must list.
  const ids = ['known-a', 'known-b', 'known-c', 'openrouter-d', 'unknown-e', 'unknown-f'];
  const answers = new Map<string, ModelCatalogInfo>([
    ['known-a', catalog()],
    ['known-b', catalog()],
    ['known-c', catalog()],
    ['openrouter-d', catalog({ source: 'openrouter' })],
  ]);
  // The first 200 of the catalog's misses go to the Host route, so with a
  // short list every id reaches the unresolved set.
  const candidates = unresolvedAutoFillIds(ids, answers);
  expect(candidates).toEqual(['unknown-e', 'unknown-f']);
  expect(autoFillNoticeFor({ lookup: null, answered: answers.size, filled: 3, unresolved: candidates })).toBe('partial');

  // A deduped list: the same id twice in the form is reported once.
  expect(unresolvedAutoFillIds(['ghost', 'ghost', 'known-a'], answers)).toEqual(['ghost']);
});

test('ids a source cap kept out of the request are reported as unresolved', () => {
  const answers = new Map([['asked', catalog()]]);
  const overCap = ['beyond-cap-1', 'beyond-cap-2'];
  const unresolved = unresolvedAutoFillIds(['asked', ...overCap], answers);
  expect(unresolved).toEqual(['beyond-cap-1', 'beyond-cap-2']);
  expect(autoFillNoticeFor({ lookup: null, answered: 1, filled: 1, unresolved })).toBe('partial');
});

test('typing into a filled field retires its source label', () => {
  const row = createModelRow({ modelId: 'claude-opus-4-6', name: 'Claude Opus 4.6' });
  const filled = applyModelCatalogInfo([row], new Map([['claude-opus-4-6', catalog()]])).models[0]!;
  expect(filled.filledFrom.contextWindow).toBe('omp-catalog');

  const typed = markModelFieldTyped(filled, 'contextWindow');
  expect(typed.typed.has('contextWindow')).toBe(true);
  expect(typed.filledFrom.contextWindow).toBeUndefined();
  // The other fields keep their provenance.
  expect(typed.filledFrom.maxOutputTokens).toBe('omp-catalog');
  // Clearing the limit keeps it typed, so auto-fill leaves it empty.
  expect(autoFillFields({ ...typed, contextWindow: '' }, catalog())).not.toContain('contextWindow');
});

test('add-all takes a padded discovered id and adds it trimmed', () => {
  const discovered = [
    { modelId: ' model-a ', name: 'A' },
    { modelId: 'model-b', name: 'B' },
  ];
  const addable = idsToAdd([], discovered);
  expect(addable).toEqual(['model-a', 'model-b']);

  // What the form's add path does with those ids.
  const wanted = new Set(addable);
  const added = discovered
    .map((model) => ({ ...model, modelId: model.modelId.trim() }))
    .filter((model) => wanted.has(model.modelId));
  expect(added.map((model) => model.modelId)).toEqual(['model-a', 'model-b']);
  expect(added.map((model) => createDiscoveredModelRow(model).modelId)).toEqual(['model-a', 'model-b']);
});

test('unknown ids outrank "nothing to fill" on a repeat or prefilled fill', () => {
  // A discovery already prefilled the catalogued rows, so this fill writes
  // nothing — while two models still have no limits from any source.
  expect(autoFillNoticeFor({ lookup: null, answered: 4, filled: 0, unresolved: ['x'] })).toBe('partial');
  // Nothing was written and nothing is unknown: that is the "nothing" case.
  expect(autoFillNoticeFor({ lookup: null, answered: 4, filled: 0, unresolved: [] })).toBe('nothing');
  // No source answered at all still says so, with or without ids left.
  expect(autoFillNoticeFor({ lookup: null, answered: 0, filled: 0, unresolved: ['x'] })).toBe('none');
});

test('the partial notice names at most ten unknown ids and counts the rest', () => {
  const ids = Array.from({ length: 13 }, (_, index) => `unknown-${index + 1}`);
  const capped = autoFillNoticeIds(ids);
  expect(capped.shown).toHaveLength(10);
  expect(capped.shown[9]).toBe('unknown-10');
  expect(capped.hidden).toBe(3);

  expect(autoFillNoticeIds(['a', 'b'])).toEqual({ shown: ['a', 'b'], hidden: 0 });
  expect(autoFillNoticeIds([])).toEqual({ shown: [], hidden: 0 });
});

test('the capped id list hands its remainder to a translated sentence', () => {
  const more = (models: string, count: number) => `${models} and ${count} more`;
  expect(formatAutoFillNoticeModels(['a', 'b'], more)).toBe('a, b');
  expect(formatAutoFillNoticeModels([], more)).toBe('');
  const ids = Array.from({ length: 13 }, (_, index) => `m${index + 1}`);
  expect(formatAutoFillNoticeModels(ids, more)).toBe(`${ids.slice(0, 10).join(', ')} and 3 more`);
});
test('duplicateModelRow copies settings while clearing identity and headers', () => {
  const source = {
    ...createModelRow(),
    modelId: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    api: 'anthropic-messages' as const,
    baseUrl: 'https://proxy.example/v1',
    contextWindow: '200000',
    maxOutputTokens: '16384',
    thinkingMode: 'anthropic-adaptive' as const,
    thinkingEfforts: ['low', 'medium', 'high'] as Array<'low' | 'medium' | 'high'>,
    headerNames: ['X-Secret'],
    headers: [{ row: 'h1', name: 'X-Custom', value: 'secret' }],
    compatJson: '{"supportsStore":true}',
  };
  const copy = duplicateModelRow(source);
  expect(copy.row).not.toBe(source.row);
  expect(copy.modelId).toBe('');
  expect(copy.name).toBe('');
  expect(copy.api).toBe('anthropic-messages');
  expect(copy.baseUrl).toBe('https://proxy.example/v1');
  expect(copy.contextWindow).toBe('200000');
  expect(copy.thinkingEfforts).toEqual(['low', 'medium', 'high']);
  expect(copy.compatJson).toBe('{"supportsStore":true}');
  expect(copy.headerNames).toEqual([]);
  expect(copy.headers).toEqual([]);
  expect(copy.base).toBeUndefined();
});

test('compat flag helpers round-trip known flags while preserving unknown keys', () => {
  const initial = '{"customVendorFlag":42,"supportsStore":true}';
  expect(readCompatBooleanFlag(initial, 'supportsStore')).toBe('true');
  expect(readCompatBooleanFlag(initial, 'requiresThinkingAsText')).toBe('default');
  expect(readCompatMaxTokensField(initial)).toBe('');

  const withThinking = updateCompatJsonFlag(initial, 'requiresThinkingAsText', 'false');
  const withMaxField = updateCompatJsonFlag(withThinking, 'maxTokensField', 'max_tokens');
  expect(readCompatBooleanFlag(withMaxField, 'requiresThinkingAsText')).toBe('false');
  expect(readCompatMaxTokensField(withMaxField)).toBe('max_tokens');
  expect(JSON.parse(withMaxField)).toEqual({
    customVendorFlag: 42,
    supportsStore: true,
    requiresThinkingAsText: false,
    maxTokensField: 'max_tokens',
  });

  const cleared = updateCompatJsonFlag(withMaxField, 'supportsStore', 'default');
  expect(JSON.parse(cleared)).toEqual({
    customVendorFlag: 42,
    requiresThinkingAsText: false,
    maxTokensField: 'max_tokens',
  });
});

test('every known OMP provider and model api maps to a human label, not its raw slug', () => {
  const required = {
    'openai-completions': 'OpenAI Chat Completions',
    'openai-responses': 'OpenAI Responses',
    'openai-codex-responses': 'OpenAI Codex Responses',
    'openai-images': 'OpenAI Images',
    'anthropic-messages': 'Anthropic Messages',
    'google-generative-ai': 'Google Gemini',
    'google-vertex': 'Google Vertex AI',
    'google-gemini-cli': 'Google Gemini CLI',
    'bedrock-converse-stream': 'AWS Bedrock',
    'azure-openai-responses': 'Azure OpenAI',
  };

  for (const api of OMP_PROVIDER_APIS) {
    const label = apiDisplayLabel(api);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe(api);
    expect(label).not.toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
  }

  for (const api of OMP_MODEL_APIS) {
    const label = modelApiDisplayLabel(api);
    expect(label.length).toBeGreaterThan(0);
    expect(label).not.toBe(api);
    expect(label).not.toMatch(/^[a-z0-9]+(-[a-z0-9]+)+$/);
  }

  for (const [api, expected] of Object.entries(required)) {
    expect(modelApiDisplayLabel(api)).toBe(expected);
  }

  expect(apiDisplayLabel('openai-images')).toBe('openai-images');
  expect(modelApiDisplayLabel('openai-images')).toBe('OpenAI Images');
  expect(apiDisplayLabel('not-a-real-api')).toBe('not-a-real-api');
  expect(modelApiDisplayLabel('not-a-real-api')).toBe('not-a-real-api');
  expect(apiDisplayLabel('toString')).toBe('toString');
  expect(modelApiDisplayLabel('constructor')).toBe('constructor');
});
