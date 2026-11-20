import { ModelSchema, ProviderConfigureRequestSchema, ProviderModelDiscoveryRequestSchema } from '@openchamber/agent-contract';
import type { Model, ModelCatalogInfo, ModelInfoSource, ProviderConfigurationRead, ProviderConfigureRequest, ProviderModelDiscoveryRequest, ProviderModelDiscoveryResult } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n';
import type { CustomProviderIcon } from '@/lib/customProviderIcons';

export const CUSTOM_PROVIDER_ID = '__custom_provider__';
export const CUSTOM_PROVIDER_PROTOCOLS = ['chat-completions', 'responses', 'messages', 'generate-content'] as const;

export type CustomProviderProtocol = (typeof CUSTOM_PROVIDER_PROTOCOLS)[number];

export const isCustomProviderProtocol = (value: string): value is CustomProviderProtocol =>
  CUSTOM_PROVIDER_PROTOCOLS.some((protocol) => protocol === value);

/** The fields auto-fill may write, and the only ones whose provenance it tracks. */
export type ModelAutoFillField = 'contextWindow' | 'maxOutputTokens' | 'modalities' | 'toolsSupported' | 'reasoning' | 'pricing';

export interface ModelRow {
  row: string;
  modelId: string;
  name: string;
  contextWindow: string;
  maxOutputTokens: string;
  modalities: Model['modalities'];
  /**
   * The row's native runner kind. OMP publishes `audio` only for `tts`/`stt`
   * models and `embedding` only for embedding models, and the writer rejects
   * either on any other kind, so which chips may be offered follows from here.
   */
  nativeKind: NativeModelKind;
  toolsSupported?: boolean;
  /** Canonical fields the controls do not edit (reasoning, pricing, status, enabled). */
  base?: Model;
  /** Auto-filled reasoning support, overriding `base`; absent when no catalog answered. */
  reasoningEffortSupported?: boolean;
  /** Auto-filled pricing, overriding `base`; absent when no catalog answered. */
  pricing?: Model['pricing'];
  /**
   * Fields the user set (typed or saved). Auto-fill may refill its own values
   * but never one of these, so a typed limit survives a later catalog read.
   */
  typed: ReadonlySet<ModelAutoFillField>;
  /** Where each auto-filled value came from, for the label under the control. */
  filledFrom: Partial<Record<ModelAutoFillField, ModelInfoSource>>;
  /** Catalog family, when a catalog read named one; the dialog groups by it. */
  family?: string;
}
export interface HeaderRow { row: string; name: string; value: string }
/** What Save does with the uploaded logo image. */
export type CustomProviderLogoPlan =
  | { kind: 'keep' }
  | { kind: 'remove' }
  | { kind: 'upload'; file: File };

export interface CustomProviderFormState {
  providerId: string;
  name: string;
  endpoint: string;
  protocol: CustomProviderProtocol;
  credentialRef: string | null;
  apiKey: string;
  replaceHeaders: boolean;
  headerNames: string[];
  headers: HeaderRow[];
  models: ModelRow[];
  icon: CustomProviderIcon | null;
  logo: File | 'removed' | null;
}
export interface CustomProviderPersistPlan {
  request: ProviderConfigureRequest;
  apiKey: string;
  icon: CustomProviderIcon | null;
  logo: CustomProviderLogoPlan;
}

export type CustomProviderTranslator = (key: I18nKey) => string;

export interface CustomProviderFieldErrors {
  providerId?: string;
  name?: string;
  endpoint?: string;
}
export interface ModelFieldErrors {
  modelId?: string;
  name?: string;
  contextWindow?: string;
  maxOutputTokens?: string;
}
export interface HeaderFieldErrors {
  name?: string;
  value?: string;
}
export interface CustomProviderValidation {
  fields: CustomProviderFieldErrors;
  models: ModelFieldErrors[];
  headers: HeaderFieldErrors[];
  valid: boolean;
}

const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * OMP's selector grammar: the provider is the text before the first `/`, so
 * the delimiter set below would split a selection, and the id also keys plain
 * objects (`config.providers`, `metadata.providers`), so prototype names are
 * refused even though they pass the character rule.
 */
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PROVIDER_ID_DELIMITERS = /[/#@:\s]/;
// A Set, not a Record: `__proto__` as an object-literal key would set the
// prototype instead of carrying the name as data.
const PROTOTYPE_KEY_HAZARDS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** The one provider-id rule, used by the editor's field check and the request builder. */
export function isValidProviderID(value: string): boolean {
  return PROVIDER_ID_PATTERN.test(value)
    && !PROVIDER_ID_DELIMITERS.test(value)
    && !PROTOTYPE_KEY_HAZARDS.has(value);
}

/** OMP matches provider ids case-insensitively, so a taken id differs only by case. */
function isProviderIDTaken(providerId: string, existing: ReadonlySet<string>): boolean {
  const normalized = providerId.toLowerCase();
  for (const id of existing) {
    if (id.toLowerCase() === normalized) return true;
  }
  return false;
}

const positiveInteger = (value: string): boolean => {
  const parsed = Number(value.trim());
  return /^[0-9]+$/.test(value.trim()) && Number.isSafeInteger(parsed) && parsed > 0;
};

/**
 * The native runner kinds whose modality chips differ. A canonical `Model`
 * carries no kind, so a tts or stt model is only recognizable by its `audio`
 * modality; both allow the same chips, so they collapse into one kind here.
 */
export type NativeModelKind = 'chat' | 'tts' | 'stt' | 'embedding';

const BASE_MODALITIES = ['text', 'image'] as const;

/**
 * Which input chips a model of this kind can actually save. OpenChamber's
 * writer keeps `audio` only for tts/stt runners and `embedding` only for an
 * embedding runner; on any other kind it rejects the request with 422.
 */
export function modelModalitiesForKind(kind: NativeModelKind): readonly Model['modalities'][number][] {
  if (kind === 'tts' || kind === 'stt') return [...BASE_MODALITIES, 'audio'];
  if (kind === 'embedding') return [...BASE_MODALITIES, 'embedding'];
  return BASE_MODALITIES;
}

/**
 * Drops a modality the kind cannot save and keeps text or image, which the
 * writer requires even from a tts or embedding runner.
 */
export function normalizeModelModalities(
  kind: NativeModelKind,
  modalities: readonly Model['modalities'][number][],
): Model['modalities'] {
  const allowed = modelModalitiesForKind(kind);
  const kept = [...new Set(modalities)].filter((modality) => allowed.includes(modality));
  if (!kept.some((modality) => modality === 'text' || modality === 'image')) kept.unshift('text');
  return kept;
}

/**
 * A catalog's text/image inputs in the editor's order: text first. The writer
 * and the pickers read the list as-is, so an OpenRouter answer that lists
 * `image` before `text` must not produce a row that reads image-first.
 */
export function catalogInputs(input: readonly ('text' | 'image')[]): Array<'text' | 'image'> {
  return (['text', 'image'] as const).filter((modality) => input.includes(modality));
}

/** A canonical model's kind as far as the editor can tell; absent kinds are chat. */
function nativeKindOf(modalities: readonly Model['modalities'][number][]): NativeModelKind {
  if (modalities.includes('embedding')) return 'embedding';
  if (modalities.includes('audio')) return 'tts';
  return 'chat';
}

/** A query string is part of a gateway endpoint (`?api-version=` on Azure);
 *  embedded credentials and fragments are not. */
const isHttpEndpoint = (value: string): boolean => {
  try {
    const endpoint = new URL(value);
    return (endpoint.protocol === 'http:' || endpoint.protocol === 'https:')
      && endpoint.username === '' && endpoint.password === '' && endpoint.hash === '';
  } catch {
    return false;
  }
};

const isCanonicalModel = (model: Model | ProviderModelDiscoveryResult['models'][number] | undefined): model is Model =>
  model !== undefined && 'modalities' in model;

/**
 * A row from a saved model knows every field it carries was set by a person,
 * so auto-fill leaves all of them alone. A new row starts with nothing typed.
 */
export function createModelRow(model?: Model | ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const canonical = isCanonicalModel(model) ? { ...model } : undefined;
  const { modelId = '', name = '', contextWindow, maxOutputTokens } = model ?? {};
  const modalities: Model['modalities'] = canonical ? [...canonical.modalities] : ['text'];
  const nativeKind = nativeKindOf(modalities);
  const typed: ModelAutoFillField[] = canonical ? ['contextWindow', 'maxOutputTokens', 'modalities', 'reasoning', 'pricing'] : [];
  if (canonical?.toolsSupported !== undefined) typed.push('toolsSupported');
  return {
    row: crypto.randomUUID(),
    modelId,
    name,
    contextWindow: contextWindow === undefined ? '' : String(contextWindow),
    maxOutputTokens: maxOutputTokens === undefined ? '' : String(maxOutputTokens),
    modalities: normalizeModelModalities(nativeKind, modalities),
    nativeKind,
    toolsSupported: canonical?.toolsSupported,
    base: canonical,
    typed: new Set(typed),
    filledFrom: {},
  };
}

export function createHeaderRow(): HeaderRow {
  return { row: crypto.randomUUID(), name: '', value: '' };
}

export function createEmptyCustomProviderForm(
  initial?: ProviderConfigurationRead,
  icon: CustomProviderIcon | null = null,
): CustomProviderFormState {
  return {
    providerId: initial?.configuration.providerId ?? '',
    name: initial?.configuration.name ?? '',
    endpoint: initial?.configuration.endpoint ?? '',
    protocol: initial?.configuration.protocol ?? 'chat-completions',
    credentialRef: initial?.configuration.credentialRef ?? null,
    apiKey: '',
    replaceHeaders: !initial,
    headerNames: initial?.headerNames ?? [],
    headers: initial ? [] : [createHeaderRow()],
    models: initial ? initial.models.map(createModelRow) : [createModelRow()],
    icon,
    logo: null,
  };
}

/** Omission preserves stored headers; an explicitly empty replacement removes them. */
export function providerHeaderWrite(form: CustomProviderFormState): Record<string, string> | undefined {
  if (!form.replaceHeaders) return undefined;
  const headers: Record<string, string> = {};
  const names = new Set<string>();
  for (const row of form.headers) {
    const name = row.name.trim();
    if (!name && !row.value) continue;
    if (!name || names.has(name.toLowerCase())) throw new Error('Invalid or duplicate header');
    names.add(name.toLowerCase());
    headers[name] = row.value;
  }
  return headers;
}

/**
 * Field-level checks the editor can point at. The canonical build still runs
 * afterwards, because model reasoning/variant invariants belong to its schema.
 */
export function validateCustomProviderForm(
  form: CustomProviderFormState,
  existingProviderIDs: ReadonlySet<string>,
  editing: boolean,
  t: CustomProviderTranslator,
): CustomProviderValidation {
  const fields: CustomProviderFieldErrors = {};
  const providerId = form.providerId.trim();
  const name = form.name.trim();
  const endpoint = form.endpoint.trim();

  if (!providerId) fields.providerId = t('settings.providers.page.custom.error.providerID.required');
  else if (!isValidProviderID(providerId)) fields.providerId = t('settings.providers.page.custom.error.providerID.format');
  else if (!editing && isProviderIDTaken(providerId, existingProviderIDs)) fields.providerId = t('settings.providers.page.custom.error.providerID.exists');

  if (!name) fields.name = t('settings.providers.page.custom.error.name.required');

  if (!endpoint) fields.endpoint = t('settings.providers.page.custom.error.baseURL.required');
  else if (!isHttpEndpoint(endpoint)) fields.endpoint = t('settings.providers.page.custom.error.baseURL.format');

  const models = form.models.map((row): ModelFieldErrors => {
    const errors: ModelFieldErrors = {};
    if (!row.modelId.trim()) errors.modelId = t('settings.providers.page.custom.error.required');
    if (!row.name.trim()) errors.name = t('settings.providers.page.custom.error.required');
    if (!row.contextWindow.trim()) errors.contextWindow = t('settings.providers.page.custom.error.required');
    else if (!positiveInteger(row.contextWindow)) errors.contextWindow = t('settings.providers.page.custom.error.positiveInteger');
    if (!row.maxOutputTokens.trim()) errors.maxOutputTokens = t('settings.providers.page.custom.error.required');
    else if (!positiveInteger(row.maxOutputTokens)) errors.maxOutputTokens = t('settings.providers.page.custom.error.positiveInteger');
    else if (positiveInteger(row.contextWindow) && Number(row.maxOutputTokens) > Number(row.contextWindow)) {
      errors.maxOutputTokens = t('settings.providers.page.custom.error.maxOutputExceedsContext');
    }
    return errors;
  });
  const seenModelIds = new Set<string>();
  for (const [index, row] of form.models.entries()) {
    const modelId = row.modelId.trim();
    if (!modelId) continue;
    if (seenModelIds.has(modelId)) models[index]!.modelId = t('settings.providers.page.custom.error.duplicate');
    else seenModelIds.add(modelId);
  }

  const headers = form.replaceHeaders
    ? form.headers.map((row): HeaderFieldErrors => {
      const errors: HeaderFieldErrors = {};
      const headerName = row.name.trim();
      if (!headerName && !row.value) return errors;
      if (!headerName) errors.name = t('settings.providers.page.custom.error.required');
      else if (!HEADER_NAME_PATTERN.test(headerName)) errors.name = t('settings.providers.page.custom.error.headerName.format');
      if (!row.value) errors.value = t('settings.providers.page.custom.error.required');
      return errors;
    })
    : [];
  if (form.replaceHeaders) {
    const seenHeaders = new Set<string>();
    for (const [index, row] of form.headers.entries()) {
      const headerName = row.name.trim().toLowerCase();
      if (!headerName) continue;
      if (seenHeaders.has(headerName)) headers[index]!.name = t('settings.providers.page.custom.error.duplicate');
      else seenHeaders.add(headerName);
    }
  }

  const valid = !fields.providerId && !fields.name && !fields.endpoint
    && models.every((errors) => !errors.modelId && !errors.name && !errors.contextWindow && !errors.maxOutputTokens)
    && headers.every((errors) => !errors.name && !errors.value);
  return { fields, models, headers, valid };
}

export function buildCustomProviderRequest(form: CustomProviderFormState, expectedRevision: string): CustomProviderPersistPlan {
  const providerId = form.providerId.trim();
  if (!isValidProviderID(providerId)) throw new Error('Invalid provider ID');
  const models = form.models.map((row) => {
    // All canonical metadata survives editing. Discovery supplies no fabricated limits.
    const model = {
      ...(row.base ?? { reasoningEffortSupported: false, reasoningOptions: [], variants: [], pricing: null }),
      provider: providerId,
      modelId: row.modelId.trim(),
      name: row.name.trim(),
      contextWindow: row.contextWindow.trim() ? Number(row.contextWindow) : 0,
      maxOutputTokens: row.maxOutputTokens.trim() ? Number(row.maxOutputTokens) : 0,
      // A saved row can predate a kind change; the request carries only what
      // the native runner accepts, matching the writer's own modality rule.
      modalities: normalizeModelModalities(row.nativeKind, row.modalities),
    };
    // Auto-fill only ever replaces fields the user did not set, so these
    // overrides cannot disagree with a value typed into the editor.
    if (row.reasoningEffortSupported !== undefined) model.reasoningEffortSupported = row.reasoningEffortSupported;
    if (row.pricing !== undefined) model.pricing = row.pricing;
    // Omission preserves the native runner's own tool-support default.
    if (row.toolsSupported === undefined) return ModelSchema.parse(model);
    return ModelSchema.parse({ ...model, toolsSupported: row.toolsSupported });
  });
  if (new Set(models.map((model) => model.modelId)).size !== models.length) throw new Error('Duplicate model ID');
  return {
    apiKey: form.apiKey,
    icon: form.icon,
    logo: logoPlanOf(form.logo),
    request: ProviderConfigureRequestSchema.parse({
      expectedRevision,
      configuration: {
        providerId,
        name: form.name.trim(),
        endpoint: form.endpoint.trim(),
        protocol: form.protocol,
        credentialRef: form.credentialRef,
      },
      headers: providerHeaderWrite(form),
      models,
    }),
  };
}

export function buildProviderDiscoveryRequest(form: CustomProviderFormState, editing: boolean): ProviderModelDiscoveryRequest {
  const request: ProviderModelDiscoveryRequest = {
    endpoint: form.endpoint.trim(),
    protocol: form.protocol,
    headers: providerHeaderWrite(form),
  };
  if (editing) request.providerId = form.providerId;
  if (form.apiKey) request.apiKey = form.apiKey;
  if (form.credentialRef) request.credentialRef = form.credentialRef;
  return ProviderModelDiscoveryRequestSchema.parse(request);
}

// Only what the user did in the field changes the stored image; an untouched
// field keeps whatever is stored, including a logo another client just uploaded.
function logoPlanOf(logo: CustomProviderFormState['logo']): CustomProviderLogoPlan {
  if (logo === null) return { kind: 'keep' };
  if (logo === 'removed') return { kind: 'remove' };
  return { kind: 'upload', file: logo };
}

// ── Model info auto-fill and the discovery dialog ──────────────────────────

/** A catalog answer keyed by model id, as both auto-fill sources return it. */
export type ModelCatalogAnswers = ReadonlyMap<string, ModelCatalogInfo>;

/**
 * Which fields a catalog answer can still write into a row. A field the user
 * set is skipped even when it is empty: "I typed it" is the user's answer.
 */
export function autoFillFields(row: ModelRow, catalog: ModelCatalogInfo): ModelAutoFillField[] {
  const fields: ModelAutoFillField[] = [];
  if (fillableLimit(row, 'contextWindow', String(catalog.contextWindow))) fields.push('contextWindow');
  if (fillableLimit(row, 'maxOutputTokens', String(catalog.maxTokens))) fields.push('maxOutputTokens');
  if (!row.typed.has('modalities')) {
    const next = catalogInputs(catalog.input);
    if (next.length > 0 && !sameModalities(next, row.modalities)) fields.push('modalities');
  }
  if (!row.typed.has('toolsSupported') && row.toolsSupported === undefined && catalog.toolsSupported !== undefined) fields.push('toolsSupported');
  if (!row.typed.has('reasoning') && row.reasoningEffortSupported === undefined) fields.push('reasoning');
  if (!row.typed.has('pricing') && row.pricing === undefined) fields.push('pricing');
  return fields;
}

const sameModalities = (left: readonly string[], right: readonly Model['modalities'][number][]): boolean =>
  left.length === right.length && left.every((value, index) => right[index] === value);

/**
 * A limit may be written when the field is empty and unset, or when nothing
 * but a previous auto-fill put the current value there. A typed value stays.
 */
const fillableLimit = (row: ModelRow, field: 'contextWindow' | 'maxOutputTokens', value: string): boolean => {
  if (row.typed.has(field)) return false;
  const current = row[field].trim();
  if (!current) return true;
  return row.filledFrom[field] !== undefined && current !== value;
};

/**
 * Applies the answers to the form's rows. Only fields the user did not set are
 * written, and each written field records its source for the label under the
 * control. A row whose id no answer names is left exactly as it was.
 */
export function applyModelCatalogInfo(
  models: readonly ModelRow[],
  answers: ModelCatalogAnswers,
): { models: ModelRow[]; filled: number } {
  let filled = 0;
  const next = models.map((row) => {
    const catalog = answers.get(row.modelId.trim());
    if (!catalog) return row;
    const fields = autoFillFields(row, catalog);
    // A family alone groups the dialog row; it is not a value the user reads
    // in the form, so a family-only answer counts as nothing filled.
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
      else if (field === 'reasoning') updated.reasoningEffortSupported = catalog.reasoning;
      else if (field === 'pricing') {
        updated.pricing = {
          inputPerMillionTokens: catalog.cost.input,
          outputPerMillionTokens: catalog.cost.output,
          cacheReadPerMillionTokens: catalog.cost.cacheRead,
          cacheWritePerMillionTokens: catalog.cost.cacheWrite,
        };
      }
    }
    if (catalog.family !== undefined) updated.family = catalog.family;
    return updated;
  });
  return { models: next, filled };
}

/**
 * The ids to ask the OpenRouter route for: models the OMP catalog did not
 * answer, and only when they are not already catalogued from a previous fill.
 */
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

/** Each request keeps to its own id limit: the agent contract caps 500, the Host route 200. */
export const AUTO_FILL_ENRICH_LIMIT = 500;
export const AUTO_FILL_OPENROUTER_LIMIT = 200;

/** The distinct model ids a fill would ask about, in form order. */
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

/** Why a fill has nothing more to say, when it does. */
export type AutoFillNotice =
  /** The OpenRouter leg was refused by enterprise policy. */
  | 'enterprise'
  /** The OpenRouter leg failed. */
  | 'failed'
  /** No source knew any of the ids. */
  | 'none'
  /** Every row already had its own value. */
  | 'nothing'
  /** Some ids stayed unknown; they are listed in the notice. */
  | 'partial';

/**
 * The distinct ids no source answered for, in the order given. Ids a source
 * cap kept out of a request belong here too: nobody asked, so nobody answered,
 * and the reader is told which models stayed empty rather than left to guess.
 */
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

/** How many unknown ids the partial notice names before counting the rest. */
const AUTO_FILL_NOTICE_ID_LIMIT = 10;

/**
 * What the fill reports, in order of what the reader must know: a refused or
 * failed lookup first (a catalog-only result must never read as success), then
 * the case where no source answered at all, then the ids that stayed unknown,
 * and only then "nothing left to fill". Unknown ids outrank "nothing": a
 * second click, or a discovery that already prefilled the catalogued rows,
 * fills nothing while those models still have no limits.
 */
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

/** The ids a notice names, and how many it leaves to a count. */
export function autoFillNoticeIds(ids: readonly string[]): { shown: string[]; hidden: number } {
  const shown = ids.slice(0, AUTO_FILL_NOTICE_ID_LIMIT);
  return { shown, hidden: Math.max(0, ids.length - shown.length) };
}

/**
 * The id list a partial notice prints. The count past the cap goes through the
 * caller's translated template, so every locale keeps its own way of saying
 * "and N more" (and its own bidi order) instead of a bare `(+N)`.
 */
export function formatAutoFillNoticeModels(
  ids: readonly string[],
  more: (models: string, count: number) => string,
): string {
  const { shown, hidden } = autoFillNoticeIds(ids);
  const list = shown.join(', ');
  return hidden > 0 ? more(list, hidden) : list;
}

/** A row imported from a discovery result, prefilled from what the catalog already knows. */
export function createDiscoveredModelRow(model: ProviderModelDiscoveryResult['models'][number]): ModelRow {
  const row = createModelRow(model);
  if (!model.catalog) return row;
  return applyModelCatalogInfo([row], new Map([[row.modelId.trim(), model.catalog]])).models[0];
}

/**
 * Records that the user set this field by hand, so auto-fill stops touching it.
 * The typing also retires the field's provenance: a value the user wrote (or
 * cleared) came from the user, not from the catalog that filled it before.
 */
export function markModelFieldTyped(row: ModelRow, field: ModelAutoFillField): ModelRow {
  if (row.typed.has(field) && row.filledFrom[field] === undefined) return row;
  const { [field]: _retired, ...filledFrom } = row.filledFrom;
  return { ...row, typed: new Set([...row.typed, field]), filledFrom };
}

/** A row whose id the freshly discovered list no longer carries. */
export function staleModelIds(models: readonly ModelRow[], discovered: readonly { modelId: string }[]): string[] {
  // Ids compare trimmed on both sides: a discovery result may pad an id that
  // a form row already carries without the padding.
  const known = new Set(discovered.map((model) => model.modelId.trim()));
  return models
    .map((row) => row.modelId.trim())
    .filter((modelId) => modelId !== '' && !known.has(modelId));
}

/** Every discovered id the form does not hold yet, in discovery order. */
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

/**
 * Every chip the dialog offers. The contract has no video modality, so there
 * is no video chip; a chip whose count is zero shows zero rather than vanish,
 * because a hidden chip would read as "this provider cannot do that".
 */
export const discoveryFilterValues: readonly DiscoveryFilter[] = ['all', 'stale', 'text', 'image', 'embedding', 'audio'];

/** One row of the dialog: a discovered model, or a form row the list lost. */
export interface DiscoveryRow {
  kind: 'discovered' | 'stale';
  modelId: string;
  name?: string;
  catalog?: ModelCatalogInfo;
  /** The form row this id already belongs to, when it does. */
  formRow?: ModelRow;
  family?: string;
}

/**
 * The dialog's rows: every discovered model, plus form rows the fresh list
 * does not carry (a stale row can be removed individually). A form row marks
 * the discovered model it stands for, so a row is never listed twice.
 */
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

/**
 * A row passes the chosen filter. Text and image read the catalog's input
 * modalities, or the form row's own when no catalog answered; embedding and
 * audio read the native kind, which is what OMP accepts for them.
 */
export function matchesDiscoveryFilter(row: DiscoveryRow, filter: DiscoveryFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'stale') return row.kind === 'stale';
  // A discovered model with no catalog and no form row still accepts text:
  // every custom provider model can, so the chip counts it rather than hiding it.
  const inputs = row.catalog?.input ?? row.formRow?.modalities ?? ['text'];
  if (filter === 'text' || filter === 'image') return inputs.includes(filter);
  if (filter === 'embedding') return row.formRow?.nativeKind === 'embedding';
  return row.formRow?.nativeKind === 'tts' || row.formRow?.nativeKind === 'stt';
}

/**
 * Grouping by family only pays off when every visible row names one; a list
 * with a single unnamed row stays flat, since half a grouping reads worse.
 */
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

/** How many rows each filter would show. A chip is always offered, count and all. */
export function discoveryFilterCounts(rows: readonly DiscoveryRow[]): Record<DiscoveryFilter, number> {
  const counts: Record<DiscoveryFilter, number> = { all: rows.length, stale: 0, text: 0, image: 0, embedding: 0, audio: 0 };
  for (const row of rows) {
    for (const filter of ['stale', 'text', 'image', 'embedding', 'audio'] as const) {
      if (matchesDiscoveryFilter(row, filter)) counts[filter] += 1;
    }
  }
  return counts;
}
