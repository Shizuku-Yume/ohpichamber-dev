import { isString } from '../shared/guards.js';
import { getRepositoryRoot, isOutsideGitRepository } from '../git/service.js';
import { describeSmallModel, generateSmallModelText } from '../small-model/index.js';
import { buildDigest } from './digest.js';
import { indexHunks } from './hunks.js';
import { normalizeLanguage } from './languages.js';
import { buildPrompt, JSON_RESPONSE_INSTRUCTION } from './prompt.js';
import { normalizeWalkthrough, parseModelJson, responseSchema } from './schema.js';
import {
  buildCacheKey,
  canonicalReadContext,
  pruneMissingRepositories,
  readCachedWalkthrough,
  readPointer,
  writeCachedWalkthrough,
  writePointer,
} from './store.js';
import { loadSourceSections, parseSource, sourceKey, WalkthroughSourceError } from './sources.js';
import { supportsChangeRequestPatch } from './pull-request.js';
import { formatModelRef, modelRefKey } from '@openchamber/agent-contract';

export interface WalkthroughInput {
  directory: string;
  source: Parameters<typeof parseSource>[0];
  model?: string | undefined;
  providerID?: string | undefined;
  modelID?: string | undefined;
  language?: string | undefined;
  readContext?: ReadContext | undefined;
  force?: boolean;
}

export interface WalkthroughDependencies {
  getPullRequestDiff?: WalkthroughRouteService['getPullRequestDiff'] | undefined;
  readWalkthroughInstructions?: WalkthroughRouteService['readWalkthroughInstructions'] | undefined;
}

type Model = NonNullable<Awaited<ReturnType<typeof describeSmallModel>>>;
type BuiltDiff = ReturnType<typeof buildDigest>;
type Stage = 'collecting' | 'asking' | 'retrying' | 'assembling';
type CachedWalkthrough = NonNullable<ReturnType<typeof readCachedWalkthrough>>['walkthrough'];

interface GenerationInput {
  directory: string;
  source: WalkthroughSource;
  repoRoot: string;
  key: string;
  force: boolean;
  explicitModel: string | undefined;
  providerID: string | undefined;
  modelID: string | undefined;
  language: Language;
  readContext: ReadContext | undefined;
  signal: AbortSignal;
}

interface GenerationFailure {
  code?: unknown;
  message?: unknown;
  status?: unknown;
  requiredChars?: unknown;
  availableChars?: unknown;
}

interface FailureDetails {
  code?: string;
  model?: Model;
  requiredChars?: GenerationFailure['requiredChars'];
  availableChars?: GenerationFailure['availableChars'];
  cause?: GenerationFailure['message'];
}

const hasFailureFields = (value: unknown): value is GenerationFailure => value !== null && value !== undefined;
const isFalse = (value: boolean | null): value is false => value === false;
const isSymbolMessage = (value: unknown): value is symbol => typeof value === 'symbol';

setTimeout(() => {
  void pruneMissingRepositories().catch(() => {});
}, 0).unref?.();

const GENERATION_TIMEOUT_BASE_MS = 120_000;
const GENERATION_TIMEOUT_PER_HUNK_MS = 1_000;
const GENERATION_TIMEOUT_MAX_MS = 900_000;

const generationTimeoutMs = (hunkCount: number) => Math.min(
  GENERATION_TIMEOUT_MAX_MS,
  GENERATION_TIMEOUT_BASE_MS + Math.max(0, hunkCount) * GENERATION_TIMEOUT_PER_HUNK_MS,
);
const MIN_OUTPUT_TOKENS = 24_000;
const MAX_OUTPUT_TOKENS = 96_000;
const OUTPUT_CONTEXT_SHARE = 0.25;

const walkthroughOutputTokens = ({ contextTokens, outputTokenLimit }: ModelLimits) => {
  const wanted = Math.min(
    MAX_OUTPUT_TOKENS,
    Math.max(MIN_OUTPUT_TOKENS, Math.floor((Number(contextTokens) || 0) * OUTPUT_CONTEXT_SHARE)),
  );
  return Number(outputTokenLimit) > 0 ? Math.min(wanted, Number(outputTokenLimit)) : wanted;
};

async function readInstructions(directory: string, deps: WalkthroughDependencies) {
  if (!deps.readWalkthroughInstructions) return '';
  try {
    return String((await deps.readWalkthroughInstructions(directory)) ?? '').trim();
  } catch (error) {
    throw fail(`Walkthrough instructions could not be read: ${error instanceof Error ? error.message : String(error)}`, 500, { code: 'instructions-unreadable' });
  }
}

const fail = (message, statusCode, extra = {}) =>
  Object.assign(new Error(message), { statusCode, ...extra });

// Generation outlives the request that started it.
//
// A dropped connection and a deliberate cancel look identical at the socket, so
// tying the work to the request lifetime meant an accidental refresh threw away
// a minute of paid-for work. Jobs are keyed by repository + source, so a client
// that comes back attaches to the running job instead of starting a second one,
// and cancelling is an explicit request rather than a side effect of leaving.
const jobs = new Map<string, { controller: AbortController; promise: ReturnType<typeof runGeneration>; stage: Stage }>();

// Providers that answered a schema request with a 4xx. Retrying the schema on
// every generation means paying for a call we already know will fail, so the
// refusal is remembered and the fallback goes first next time.
//
// Process-lifetime only, on purpose: a provider that gains structured-output
// support should not need a settings change to be tried again — a restart is
// enough, and the cost of one wasted first attempt after that is small.
const schemaRefusedBy = new Set<string>();

const modelKey = (model) => modelRefKey(model.providerID, model.modelID);
const addReadContext = (result, readContext) => {
  if (readContext) result.readContext = readContext;
  return result;
};

const jobKey = (repoRoot: string, sourceKeyValue: string, readContext: ReadContext | undefined) => readContext
  ? JSON.stringify({
    repoRoot,
    sourceKey: sourceKeyValue,
    readContext: canonicalReadContext(readContext),
  })
  : `${repoRoot}\0${sourceKeyValue}`;

const readContextForSource = (source: WalkthroughSource, readContext: ReadContext | undefined) => {
  if (source.kind !== 'pr') return undefined;
  const valid = readContext
    && supportsChangeRequestPatch(readContext.provider)
    && isString(readContext.instance)
    && isString(readContext.accountId)
    && isString(readContext.repositoryId)
    && Number.isInteger(readContext.bindingRevision)
    && isString(readContext.directory)
    && isString(readContext.primaryRemote);
  if (!valid) {
    throw fail('A trusted source control read context is required for pull request walkthroughs', 400, {
      code: 'INVALID_SOURCE_CONTROL_READ_CONTEXT',
    });
  }
  return Object.freeze(canonicalReadContext(readContext));
};

const setStage = (repoRoot: string, sourceKeyValue: string, stage: Stage, readContext: ReadContext | undefined) => {
  const job = jobs.get(jobKey(repoRoot, sourceKeyValue, readContext));
  if (job) job.stage = stage;
};

export function getGenerationStage(repoRoot: string, sourceKeyValue: string, readContext?: ReadContext) {
  return jobs.get(jobKey(repoRoot, sourceKeyValue, readContext))?.stage ?? null;
}

export function isGenerating(repoRoot: string, sourceKeyValue: string, readContext?: ReadContext) {
  return jobs.has(jobKey(repoRoot, sourceKeyValue, readContext));
}

// A walkthrough is keyed by the repository it documents. A directory outside
// any repository is a caller-visible precondition (the client asked about a
// folder that is not a repository), not a fault in this module: the routes
// answer 422 with the same code the source-control binding routes use instead
// of a 500. The classification asks Git's exit status and the filesystem, not
// its message: Git translates and rewords that diagnostic, so a regex over it
// would turn a localized refusal into a 500.
const UNSUPPORTED_REPOSITORY_MESSAGE = 'Directory is not a supported Git repository';
const resolveRepositoryRoot = async (directory) => {
  try {
    return await getRepositoryRoot(directory);
  } catch (error) {
    if (!await isOutsideGitRepository(directory)) throw error;
    throw Object.assign(new Error(UNSUPPORTED_REPOSITORY_MESSAGE), {
      code: 'UNSUPPORTED_SOURCE_CONTROL_REPOSITORY',
      reason: 'not-a-git-repository',
    });
  }
};

/**
 * Resolve the pair the job registry is keyed by, for callers that need to look
 * a job up without doing any diff work.
 */
/** @public */
export async function getRepositoryRootFor(directory, rawSource, rawReadContext) {
  const source = parseSource(rawSource);
  const readContext = readContextForSource(source, rawReadContext);
  return { repoRoot: await resolveRepositoryRoot(directory), sourceKey: sourceKey(source), readContext };
}

export async function cancelWalkthroughGeneration({ directory, source: rawSource, readContext: rawReadContext }: WalkthroughInput) {
  const source = parseSource(rawSource);
  const readContext = readContextForSource(source, rawReadContext);
  const repoRoot = await resolveRepositoryRoot(directory);
  const job = jobs.get(jobKey(repoRoot, sourceKey(source), readContext));
  if (!job) return addReadContext({ cancelled: false }, readContext);
  job.controller.abort();
  return addReadContext({ cancelled: true }, readContext);
}

const modelLabel = (model) => formatModelRef({ providerId: model.providerID, modelId: model.modelID });

/**
 * Resolve the model for this feature: an explicit per-review choice outranks the
 * walkthrough's native `slow` role, which is what the user picks in Settings.
 *
 * `providerID` / `modelID` are the user's composer: without a model of its own
 * choosing, the walkthrough stays on that provider rather than on whichever
 * provider happens to be connected, and on that model when the provider has no
 * small one.
 * A free zen model without a login counts as unset here, and the small-model
 * chain decides (`../small-model/DOCUMENTATION.md`, *Free tier and the
 * session fallback*).
 */
const resolveModel = (workspaceId, explicitModel, providerID, modelID) => describeSmallModel({
  workspaceId,
  outputReserveTokens: walkthroughOutputTokens,
  // An explicit per-review pick outranks the role; otherwise the walkthrough
  // uses the native `slow` role, which the resolver falls back to the default
  // role for.
  overrideModel: explicitModel,
  preferredProviderID: providerID || undefined,
  preferredModelID: modelID || undefined,
  role: 'slow',
});

export const __testing = { generationTimeoutMs, walkthroughOutputTokens };

async function loadCurrentDiff(directory: string, source: WalkthroughSource, deps: WalkthroughDependencies, readContext: ReadContext | undefined) {
  const { sections } = await loadSourceSections(directory, source, { ...deps, readContext });
  const built = buildDigest(sections);
  return built;
}

const isJsonObject = (value: ModelJson | undefined): value is ModelJsonObject => value !== null && typeof value === 'object';

const storedField = (value: ModelJson, field: 'stops' | 'hunkIds' | 'id') => {
  if (value === null) throw new TypeError(`Cannot read properties of null (reading '${field}')`);
  return isJsonObject(value) ? value[field] : undefined;
};

const chapterStops = (chapter: ModelJson) => {
  const stops = storedField(chapter, 'stops');
  if (stops === null || stops === undefined) throw new TypeError(`Cannot read properties of ${stops} (reading 'flatMap')`);
  if (!Array.isArray(stops)) throw new TypeError('chapter.stops.flatMap is not a function');
  return stops;
};

const stopHunkIds = (walkthrough: CachedWalkthrough) =>
  walkthrough.chapters.flatMap((chapter) => chapterStops(chapter).flatMap((stop) => storedField(stop, 'hunkIds')));

function resolveAgainstCurrent(walkthrough: CachedWalkthrough, hunkIndex: ReturnType<typeof indexHunks>) {
  const missingHunkIds: ModelJson[] = [];
  const staleStopIds: (ModelJson | undefined)[] = [];

  for (const chapter of walkthrough.chapters) {
    const stops = storedField(chapter, 'stops');
    if (!Array.isArray(stops) && !isString(stops)) throw new TypeError('chapter.stops is not iterable');
    for (const stop of stops) {
      const hunkIds = storedField(stop, 'hunkIds');
      if (hunkIds === null || hunkIds === undefined) throw new TypeError(`Cannot read properties of ${hunkIds} (reading 'filter')`);
      if (!Array.isArray(hunkIds)) throw new TypeError('stop.hunkIds.filter is not a function');
      const missing = hunkIds.filter((id) => !isString(id) || !hunkIndex.has(id));
      if (missing.length === 0) continue;
      missingHunkIds.push(...missing);
      staleStopIds.push(storedField(stop, 'id'));
    }
  }

  const covered = new Set(stopHunkIds(walkthrough));
  const uncoveredHunkIds = [...hunkIndex.keys()].filter((id) => !covered.has(id));

  return {
    isStale: missingHunkIds.length > 0,
    missingHunkIds,
    staleStopIds,
    uncoveredHunkIds,
  };
}

const serializeHunks = (files: DigestFile[]) => files.flatMap((file) => file.hunks.map((hunk) => ({
  id: hunk.id,
  path: file.path,
  oldPath: file.oldPath || null,
  status: file.status,
  scope: file.scope,
  header: hunk.header,
  newStart: hunk.newStart,
  added: hunk.added,
  deleted: hunk.deleted,
  patch: hunk.patch,
})));

/**
 * Read the last walkthrough for a source, resolved against the current diff.
 * Never generates and never spends tokens.
 */
export async function getWalkthrough({ directory, workspaceId, source: rawSource, model: explicitModel, providerID, modelID, language: rawLanguage, readContext: rawReadContext }, deps = {}) {
  const source = parseSource(rawSource);
  const readContext = readContextForSource(source, rawReadContext);
  const repoRoot = await resolveRepositoryRoot(directory);
  const key = sourceKey(source);
  const language = normalizeLanguage(rawLanguage);

  const pointer = readPointer(repoRoot, key, readContext);
  const [built, model, instructions] = await Promise.all([
    loadCurrentDiff(directory, source, deps, readContext),
    resolveModel(workspaceId, explicitModel, providerID, modelID).catch(() => null),
    // Readiness only measures the prompt; an unreadable preference fails the
    // generation that would send it, not the read.
    readInstructions(directory, deps).catch(() => ''),
  ]);
  const { files } = built;
  const hunkIndex = indexHunks(files);
  const readiness = computeReadiness({ ...built, model, source, language, instructions });

  const base = addReadContext({
    source,
    hunks: serializeHunks(files),
    hunkCount: hunkIndex.size,
    readiness,
    generating: isGenerating(repoRoot, key, readContext),
  }, readContext);

  const requestedKey = model
    ? buildCacheKey({
      repoRoot,
      sourceKey: key,
      providerID: model.providerID,
      modelID: model.modelID,
      language,
      files,
      readContext,
    })
    : null;

  const requested = requestedKey ? readCachedWalkthrough(requestedKey) : null;
  const entry = requested ?? (pointer ? readCachedWalkthrough(pointer.cacheKey) : null);
  if (!entry) {
    return { ...base, walkthrough: null };
  }

  if (requested && requestedKey !== null && pointer?.cacheKey !== requestedKey) {
    writePointer(repoRoot, key, {
      repoRoot,
      sourceKey: key,
      cacheKey: requestedKey,
      generatedAt: requested.generatedAt,
    }, readContext);
  }

  return {
    ...base,
    walkthrough: entry.walkthrough,
    model: entry.model,
    language: entry.language ?? null,
    generatedAt: entry.generatedAt,
    ...resolveAgainstCurrent(entry.walkthrough, hunkIndex),
  };
}

function computeReadiness({ model, digest, files, fileCount, hunkCount, generatedFileCount, source, language, instructions }: BuiltDiff & { model: Model | null; source: WalkthroughSource; language: Language; instructions: string }) {
  if (!model) return { ready: false, reason: 'no-model' };

  if (hunkCount === 0) {
    const reason = files.length > 0 && generatedFileCount === files.length ? 'only-generated' : 'empty-diff';
    return { ready: false, reason, model, generatedFileCount };
  }

  if (model.hasLogin === false) {
    return { ready: false, reason: 'no-provider-login' };
  }

  const { prompt, system } = buildPrompt({ digest, fileCount, hunkCount, source, language, instructions });
  const requiredChars = prompt.length + system.length;

  if (isFalse(model.structuredOutput)) {
    return { ready: false, reason: 'structured-output-unsupported', model, requiredChars };
  }

  if (requiredChars > model.inputCharBudget) {
    return {
      ready: false,
      reason: 'context-too-small',
      model,
      requiredChars,
      availableChars: model.inputCharBudget,
    };
  }

  return { ready: true, model, requiredChars, availableChars: model.inputCharBudget, hunkCount, fileCount };
}

/**
 * Generate a walkthrough for a source.
 *
 * Returns the cached entry when the diff, model, and prompt are all unchanged —
 * which also means returning to a previous state of the working tree costs
 * nothing.
 */
export async function generateWalkthrough({ directory, workspaceId, source: rawSource, force = false, model: explicitModel, providerID, modelID, language: rawLanguage, readContext: rawReadContext }, deps = {}) {
  const source = parseSource(rawSource);
  const readContext = readContextForSource(source, rawReadContext);
  const repoRoot = await resolveRepositoryRoot(directory);
  const key = sourceKey(source);
  const language = normalizeLanguage(rawLanguage);

  const existing = jobs.get(jobKey(repoRoot, key, readContext));
  if (existing) return existing.promise;

  const controller = new AbortController();
  const promise = runGeneration({ directory, workspaceId, source, repoRoot, key, force, explicitModel, providerID, modelID, language, readContext, signal: controller.signal }, deps)
    .finally(() => {
      if (jobs.get(jobKey(repoRoot, key, readContext))?.controller === controller) {
        jobs.delete(jobKey(repoRoot, key, readContext));
      }
    });

  jobs.set(jobKey(repoRoot, key, readContext), { controller, promise, stage: 'collecting' });
  return promise;
}

async function runGeneration({ directory, workspaceId, source, repoRoot, key, force, explicitModel, providerID, modelID, language, readContext, signal }, deps) {

  const model = await resolveModel(workspaceId, explicitModel, providerID, modelID);
  if (!model) {
    throw fail('No model is available — sign in to a provider first', 404, { code: 'no-model' });
  }
  if (model.hasLogin === false) {
    throw fail(
      `No OpenCode login found for provider "${model.providerID}" — sign in or choose a different model`,
      401,
      { code: 'no-provider-login', model },
    );
  }

  const { digest, files, idByAlias, fileCount, hunkCount, generatedFileCount } = await loadCurrentDiff(directory, source, deps, readContext);
  setStage(repoRoot, key, 'asking', readContext);
  if (hunkCount === 0) {
    if (files.length > 0 && generatedFileCount === files.length) {
      throw fail('Only generated files changed — there is nothing to review', 400, { code: 'only-generated' });
    }
    throw fail('There are no changes to review', 400, { code: 'empty-diff' });
  }

  const cacheKey = buildCacheKey({
    repoRoot,
    sourceKey: key,
    providerID: model.providerID,
    modelID: model.modelID,
    language,
    files,
    readContext,
  });

  const hunkIndex = indexHunks(files);

  if (!force) {
    const cached = readCachedWalkthrough(cacheKey);
    if (cached) {
      writePointer(repoRoot, key, {
        repoRoot,
        sourceKey: key,
        cacheKey,
        generatedAt: cached.generatedAt,
      }, readContext);
      return addReadContext({
        source,
        walkthrough: cached.walkthrough,
        model: cached.model,
        language: cached.language ?? null,
        generatedAt: cached.generatedAt,
        fromCache: true,
        hunks: serializeHunks(files),
        hunkCount,
        ...resolveAgainstCurrent(cached.walkthrough, hunkIndex),
      }, readContext);
    }
  }

  let previousWalkthrough: ModelJson = null;
  const pointer = readPointer(repoRoot, key, readContext);
  if (pointer) {
    const previousEntry = readCachedWalkthrough(pointer.cacheKey);
    if (
      previousEntry
      && previousEntry.cacheKey !== cacheKey
      && (isJsonObject(previousEntry.model) ? previousEntry.model.providerID : undefined) === model.providerID
      && (isJsonObject(previousEntry.model) ? previousEntry.model.modelID : undefined) === model.modelID
      && normalizeLanguage(previousEntry.language) === language
    ) {
      previousWalkthrough = previousEntry.walkthrough;
    }
  }

  const instructions = await readInstructions(directory, deps);
  const { prompt, system } = buildPrompt({ digest, fileCount, hunkCount, source, previousWalkthrough, language, instructions });

  if (isFalse(model.structuredOutput)) {
    throw fail(
      `${modelLabel(model)} cannot produce structured output — choose a different small model`,
      409,
      { code: 'structured-output-unsupported', model },
    );
  }

  const run = (options: Pick<GenerationOptions, 'prompt' | 'system' | 'responseSchema'>) => generateSmallModelText({
    prompt: options.prompt,
    system: options.system,
    workspaceId,
    model: formatModelRef({ providerId: model.providerID, modelId: model.modelID }),
    variant: model.variant,
    responseSchema: options.responseSchema,
    onOverflow: 'error',
    timeoutMs: generationTimeoutMs(hunkCount),
    maxOutputTokens: model.outputTokens ?? MIN_OUTPUT_TOKENS,
    signal,
  });

  const withSchema = () => run({ prompt, system, responseSchema });
  const withoutSchema = () => run({
    prompt,
    system: `${system}\n${JSON_RESPONSE_INSTRUCTION}`,
    responseSchema: undefined,
  });

  const asRequestFailure = (cause: unknown) => {
    const error = hasFailureFields(cause) ? cause : undefined;
    if (error?.code === 'context-too-small') {
      return fail(error.message, 409, {
        code: 'context-too-small',
        model,
        requiredChars: error.requiredChars,
        availableChars: error.availableChars,
      });
    }
    if (error?.code === 'output-exhausted') {
      return fail(error.message, 409, { code: 'output-exhausted', model });
    }
    if (error?.code === 'no-provider-login') {
      return fail(error.message, 401, { code: 'no-provider-login', model });
    }
    return null;
  };

  const refusesSchema = (error: GenerationFailure | null | undefined) => error?.code === 'structured-output-unsupported'
    || (Number(error?.status) >= 400 && Number(error?.status) < 500);

  let raw;
  let usedSchema = false;

  if (schemaRefusedBy.has(modelKey(model))) {
    setStage(repoRoot, key, 'retrying', readContext);
    try {
      raw = await withoutSchema();
    } catch (error) {
      throw asRequestFailure(error) ?? error;
    }
  } else {
    try {
      raw = await withSchema();
      usedSchema = true;
    } catch (error) {
      const failure = asRequestFailure(error);
      if (failure) throw failure;
      if (!refusesSchema(hasFailureFields(error) ? error : undefined)) throw error;

      schemaRefusedBy.add(modelKey(model));
      setStage(repoRoot, key, 'retrying', readContext);
      try {
        raw = await withoutSchema();
      } catch (fallbackError) {
        throw asRequestFailure(fallbackError) ?? fallbackError;
      }
    }
  }

  setStage(repoRoot, key, 'assembling', readContext);

  let walkthrough;
  try {
    walkthrough = normalizeWalkthrough(parseModelJson(raw.text), idByAlias, digest.files);
  } catch (error) {
    if (!usedSchema) {
      throw fail(
        `${modelLabel(model)} could not return the structured response a walkthrough needs`,
        409,
        { code: 'structured-output-unsupported', model },
      );
    }
    throw fail(
      `${modelLabel(model)} did not return a usable walkthrough — try a different small model`,
      502,
      { code: 'invalid-walkthrough', model, cause: hasFailureFields(error) ? error.message : undefined },
    );
  }

  const generatedAt = new Date().toISOString();
  const entry = {
    cacheKey,
    generatedAt,
    repoRoot,
    sourceKey: key,
    model: { providerID: model.providerID, modelID: model.modelID, source: model.source },
    language,
    walkthrough,
  };
  addReadContext(entry, readContext);

  writeCachedWalkthrough(cacheKey, entry);
  writePointer(repoRoot, key, { repoRoot, sourceKey: key, cacheKey, generatedAt }, readContext);

  return addReadContext({
    source,
    walkthrough,
    model: entry.model,
    language,
    generatedAt,
    fromCache: false,
    hunks: serializeHunks(files),
    hunkCount,
    ...resolveAgainstCurrent(walkthrough, hunkIndex),
  }, readContext);
}
