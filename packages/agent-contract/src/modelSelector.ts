/**
 * The one grammar for a model selector: `provider/model[:thinking][#variant][@upstream]`.
 *
 * OMP's grammar, ported from `pi-tui/overlays/model-selector`
 * (`parseThinkingSuffix`, `splitThinkingSuffix`, `parseModelString`,
 * `formatModelSelectorValue`, `splitUpstreamRouting`) and
 * `pi-coding-agent/config/model-resolver` (role aliases and their `default`
 * fallback). UI, Host and Agent Service parse and format selectors here, so a
 * `provider/model:high` written on one layer reads the same way everywhere.
 *
 * The grammar's one hazard is a literal model id that ends in a suffix the
 * thinking grammar would claim: real ids such as `glm-4.7:max` exist, so `:max`
 * and `:auto` are only stripped when the caller opts in
 * (`MAX_THINKING_SUFFIX_OPTIONS`) and an authoritative literal-id lookup does
 * not claim the whole id first. A caller without that lookup gets OMP's strict
 * behavior, which never mistakes `:max` for a thinking level.
 */
import type { JsonObject, JsonValue } from './primitives.js';

/** Thinking selectors, in OMP's display order. */
export const THINKING_LEVELS = ['inherit', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** OMP's session-level "pick per prompt" sentinel; never a concrete level. */
export const AUTO_THINKING = 'auto';
export type ConfiguredThinkingLevel = ThinkingLevel | typeof AUTO_THINKING;

/** Opt-in selectors that can otherwise be literal model-id suffixes. */
export interface ThinkingSuffixOptions {
  allowMaxSuffix?: boolean;
  allowAutoAlias?: boolean;
}

/** Selector parsing options with authoritative literal-model lookup. */
export interface ParseModelSelectorOptions extends ThinkingSuffixOptions {
  /**
   * True when the provider serves this exact id, suffix text and all. The
   * provider is undefined for a value that is not a `provider/model` pair.
   */
  isLiteralModelId?: (providerId: string | undefined, modelId: string) => boolean;
  /**
   * Read a trailing `@<slug>` as provider routing. Off by default: OMP only
   * honors it when the base resolves to an aggregator, and a caller that
   * cannot check that would strip `@` from real ids such as
   * `anthropic/claude-opus-4-8@default` and rewrite stored configuration.
   */
  allowUpstreamRouting?: boolean;
}

/** Recognize all configured effort selectors after literal-id matching. */
export const MAX_THINKING_SUFFIX_OPTIONS: ThinkingSuffixOptions = { allowMaxSuffix: true, allowAutoAlias: true };

const THINKING_LEVELS_BY_SELECTOR: Readonly<Record<string, ThinkingLevel>> = Object.fromEntries(
  THINKING_LEVELS.map((level) => [level, level]),
);

/**
 * Parse a thinking selector, accepting unambiguous abbreviations: `xhi` is
 * `xhigh`, `med` is `medium`. A two-character minimum keeps a single letter
 * from guessing, matching OMP's own selector lookup.
 */
export function parseThinkingLevel(value: string | null | undefined): ThinkingLevel | undefined {
  if (value === null || value === undefined) return undefined;
  if (Object.hasOwn(THINKING_LEVELS_BY_SELECTOR, value)) return THINKING_LEVELS_BY_SELECTOR[value];
  if (value.length < 2) return undefined;
  const matches = THINKING_LEVELS.filter((level) => level.startsWith(value));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Parse a suffix while preserving selectors not explicitly enabled. */
export function parseThinkingSuffix(
  value: string,
  options?: ThinkingSuffixOptions,
): ConfiguredThinkingLevel | undefined {
  const level = parseThinkingLevel(value);
  if (level === 'max') return options?.allowMaxSuffix === true ? level : undefined;
  if (level !== undefined) return level;
  if (options?.allowAutoAlias === true && value === AUTO_THINKING) return AUTO_THINKING;
  return undefined;
}

/** Parse a configured thinking selector: `auto` or a concrete level. */
export function parseConfiguredThinkingLevel(value: string | null | undefined): ConfiguredThinkingLevel | undefined {
  if (value === AUTO_THINKING) return AUTO_THINKING;
  return parseThinkingLevel(value);
}

/**
 * Split a trailing `:<level>` thinking selector off a model pattern.
 *
 * `level` is set when the suffix parses as a concrete thinking level (or, when
 * the caller opts in, the guarded `:max` level or `:auto` sentinel); `base`
 * then has the suffix stripped. Otherwise `base` is the input.
 * `minColonIndex` requires the colon to appear strictly after that index —
 * role-alias callers pass the matched alias prefix length.
 */
export function splitThinkingSuffix(
  pattern: string,
  minColonIndex = -1,
  options?: ThinkingSuffixOptions,
): ThinkingSuffixSplit {
  const colonIndex = pattern.lastIndexOf(':');
  if (colonIndex <= minColonIndex) return { base: pattern };
  const level = parseThinkingSuffix(pattern.slice(colonIndex + 1), options);
  return level === undefined ? { base: pattern } : { base: pattern.slice(0, colonIndex), level };
}

/** A pattern split into its base and, when the grammar owns the suffix, its level. */
export interface ThinkingSuffixSplit {
  base: string;
  level?: ConfiguredThinkingLevel;
}

export type ParsedModelString = { providerId: string; modelId: string; thinkingLevel?: ConfiguredThinkingLevel };

/**
 * Parse a model string in `provider/modelId` format. Returns null when the
 * string is not one. OMP's `parseModelString`, in contract field names.
 */
export function parseModelString(
  value: string,
  options?: ParseModelSelectorOptions,
): ParsedModelString | null {
  const slashIndex = value.indexOf('/');
  if (slashIndex <= 0) return null;
  const providerId = value.slice(0, slashIndex);
  const modelPart = value.slice(slashIndex + 1);
  if (!modelPart) return null;
  // Strict thinking levels first: `claude-sonnet-4-6:high` is an id and a level.
  const strict = splitThinkingSuffix(modelPart);
  if (strict.level !== undefined) {
    return strict.base ? { providerId, modelId: strict.base, thinkingLevel: strict.level } : null;
  }
  // `max` is a real thinking level, but real ids can also end in `:max`.
  const maxAlias = splitThinkingSuffix(modelPart, -1, options);
  if (maxAlias.level !== undefined) {
    if (options?.isLiteralModelId?.(providerId, modelPart) === true) return { providerId, modelId: modelPart };
    return maxAlias.base ? { providerId, modelId: maxAlias.base, thinkingLevel: maxAlias.level } : null;
  }
  return { providerId, modelId: modelPart };
}

/** Bare slug (`cerebras`) or tiered slug (`google-ai-studio/priority`). */
const UPSTREAM_ROUTING_SLUG = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;

/**
 * Split a trailing `@<upstream>` provider-routing selector off a model pattern.
 *
 * `openrouter/z-ai/glm-4.7@cerebras` splits into that base and `cerebras`.
 * Tiered upstreams keep their path, and a `:thinking` suffix after the slug
 * stays on the base. The split is suffix-shaped only: `parseModelSelector`
 * enforces OMP's real rule that routing applies just to an aggregator base,
 * so an id that legitimately contains `@` is kept whole unless the caller
 * allows routing.
 */
export function splitUpstreamRouting(pattern: string): { base: string; upstream: string } | undefined {
  const at = pattern.lastIndexOf('@');
  if (at <= 0) return undefined;
  const rest = pattern.slice(at + 1);
  const colon = rest.indexOf(':');
  const upstream = colon === -1 ? rest : rest.slice(0, colon);
  if (!UPSTREAM_ROUTING_SLUG.test(upstream)) return undefined;
  const trailing = colon === -1 ? '' : rest.slice(colon);
  return { base: pattern.slice(0, at) + trailing, upstream };
}

/** A selector split into the model half a control edits and its thinking level. */
export interface SelectorThinkingSplit {
  model: string;
  thinkingLevel?: ConfiguredThinkingLevel;
}

/** A parsed selector: its provider/model pair plus the suffixes that qualify it. */
export interface ModelSelector {
  providerId: string;
  modelId: string;
  thinkingLevel?: ConfiguredThinkingLevel;
  variant?: string;
  upstream?: string;
}

/**
 * Parse a full selector: `provider/model[:thinking][#variant][@upstream]`.
 * Returns null when the string names no provider/model pair.
 *
 * The grammar's suffix order is thinking, then `#variant`, then `@upstream`;
 * it is read back to front. A suffix the grammar does not own stays in the id,
 * so nothing is silently reinterpreted.
 */
export function parseModelSelector(
  value: string | null | undefined,
  options?: ParseModelSelectorOptions,
): ModelSelector | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const routing = options?.allowUpstreamRouting === true ? splitUpstreamRouting(trimmed) : undefined;
  const withoutVariant = (routing?.base ?? trimmed).split('#', 2);
  const variant = withoutVariant.length === 2 ? withoutVariant[1].trim() : undefined;
  const parsed = parseModelString(withoutVariant[0], options);
  if (!parsed) return null;
  const selector: ModelSelector = { providerId: parsed.providerId, modelId: parsed.modelId };
  if (parsed.thinkingLevel !== undefined) selector.thinkingLevel = parsed.thinkingLevel;
  if (variant && !variant.includes('#')) selector.variant = variant;
  if (routing) selector.upstream = routing.upstream;
  return selector;
}

/**
 * Append a thinking suffix to an already-formatted selector. `inherit` adds
 * nothing: an inherited level is the absence of an explicit one.
 */
export function formatModelSelectorValue(
  selector: string,
  thinkingLevel: ConfiguredThinkingLevel | undefined,
): string {
  return thinkingLevel && thinkingLevel !== 'inherit' ? `${selector}:${thinkingLevel}` : selector;
}

/** Format a parsed selector back to its canonical spelling. Empty names give ''. */
export function formatModelSelector(selector: ModelSelector): string {
  const providerId = selector.providerId.trim();
  const modelId = selector.modelId.trim();
  if (!providerId || !modelId) return '';
  let formatted = formatModelSelectorValue(`${providerId}/${modelId}`, selector.thinkingLevel);
  const variant = selector.variant?.trim();
  if (variant) formatted = `${formatted}#${variant}`;
  const upstream = selector.upstream?.trim();
  if (upstream) formatted = `${formatted}@${upstream}`;
  return formatted;
}

/**
 * Split a selector into the model half a control edits and its thinking level.
 * An unparseable value keeps its whole text as the model half, so a custom or
 * alias selector stays visible and editable instead of vanishing.
 */
export function splitSelectorThinking(
  value: string | null | undefined,
  options?: ParseModelSelectorOptions,
): SelectorThinkingSplit {
  const trimmed = value?.trim() ?? '';
  const result: SelectorThinkingSplit = { model: trimmed };
  if (!trimmed) return result;
  const parsed = parseModelSelector(trimmed, options);
  if (parsed) {
    result.model = formatModelSelector({
      providerId: parsed.providerId,
      modelId: parsed.modelId,
      variant: parsed.variant,
      upstream: parsed.upstream,
    });
    if (parsed.thinkingLevel !== undefined) result.thinkingLevel = parsed.thinkingLevel;
    return result;
  }
  // Not a provider/model pair: strip only a suffix the grammar owns, and only
  // when no literal id claims the whole text.
  if (options?.isLiteralModelId?.(undefined, trimmed) === true) return result;
  const split = splitThinkingSuffix(trimmed, -1, MAX_THINKING_SUFFIX_OPTIONS);
  if (split.level === undefined) return result;
  result.model = split.base;
  result.thinkingLevel = split.level;
  return result;
}

/**
 * A provider/model pair as a catalogue row, session record or settings entry
 * spells it: canonical records use `provider`/`modelId`, the inherited export
 * uses `providerID`/`modelID`, and a provider list row names itself `id`.
 */
export interface ModelRefLike {
  provider?: string;
  providerId?: string;
  providerID?: string;
  modelId?: string;
  modelID?: string;
  id?: string;
}

/** The provider half of a reference, from whichever shape supplied it. */
function providerOf(ref: ModelRefLike): string {
  return ref.provider ?? ref.providerId ?? ref.providerID ?? '';
}

/** The model half of a reference. A provider row's `id` is its provider id. */
function modelOf(ref: ModelRefLike): string {
  return ref.modelId ?? ref.modelID ?? ref.id ?? '';
}

/**
 * `provider/model` spelling of a reference, with no suffixes. Empty when the
 * reference names no pair, so a caller never joins a half-formed value.
 */
export function formatModelRef(ref: ModelRefLike): string {
  const providerId = providerOf(ref).trim();
  const modelId = modelOf(ref).trim();
  return providerId && modelId ? `${providerId}/${modelId}` : '';
}

/**
 * Whether a stored selector names the given catalogue row.
 *
 * The comparison runs on the parsed pair, so `provider/model:high` matches the
 * row for `provider/model` — the bug where a role written with a thinking
 * level stopped matching its own model. Unparseable selectors never match.
 */
export function modelRefEquals(selector: string | null | undefined, ref: ModelRefLike): boolean {
  const parsed = parseModelSelector(selector, MAX_THINKING_SUFFIX_OPTIONS);
  if (!parsed) return false;
  return parsed.providerId === providerOf(ref) && parsed.modelId === modelOf(ref);
}

/** Whether a selector resolves to the model a session message names. */
export function selectorMatchesMessage(
  selector: string | null | undefined,
  message: { providerId?: string; modelId?: string; providerID?: string; modelID?: string },
): boolean {
  return modelRefEquals(selector, message);
}

/**
 * The stable in-memory map key for a provider/model pair, `providerId/modelId`.
 * Callers that key a cache, a preference record or a look-up map use this
 * instead of spelling the join themselves; it is not a persisted format.
 */
export function modelRefKey(providerId: string | null | undefined, modelId: string | null | undefined): string {
  const provider = providerId?.trim() ?? '';
  const model = modelId?.trim() ?? '';
  return provider && model ? `${provider}/${model}` : '';
}

/** The same key in the UI's colon form, for React keys and dnd ids. */
export function modelRefInstanceKey(providerId: string | null | undefined, modelId: string | null | undefined): string {
  const provider = providerId?.trim() ?? '';
  const model = modelId?.trim() ?? '';
  return provider && model ? `${provider}:${model}` : '';
}

/** OMP's model-role ids, in display order. A configured record may add keys. */
export const MODEL_ROLE_IDS = [
  'default', 'smol', 'slow', 'vision', 'plan', 'commit', 'tiny', 'memory', 'task', 'advisor',
  'image', 'web', 'speech', 'dictation', 'judge',
] as const;
export type ModelRoleId = (typeof MODEL_ROLE_IDS)[number];

/** Canonical role-selector prefix. `*` is the shorthand for `default`. */
export const MODEL_ROLE_ALIAS_PREFIX = '@';
/** Legacy prefix accepted for role selectors. */
export const LEGACY_MODEL_ROLE_ALIAS_PREFIX = 'pi/';
export const DEFAULT_MODEL_ROLE = 'default';
export const DEFAULT_MODEL_ROLE_ALIAS = '*';

/**
 * The persisted `modelRoles` record. OMP 19.1 resolves strings and lists of
 * strings; other saved values are preserved by editors but not resolved.
 */
export type ModelRoleValues = Readonly<JsonObject>;

/** The first nonblank selector in a native array or comma-separated chain. */
function roleValue(value: JsonValue | undefined): string | undefined {
  const entries = typeof value === 'string' ? [value]
    : Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value
    : [];
  for (const entry of entries) {
    const selector = entry.split(',').map((part) => part.trim()).find(Boolean);
    if (selector) return selector;
  }
  return undefined;
}

/** True when the record configures this role at all, even to an unexpandable value. */
export function isRoleConfigured(role: string, roles: ModelRoleValues): boolean {
  return roleValue(roles[role]) !== undefined;
}

/**
 * Minimum colon index for splitting a `:<level>` suffix off a role alias, or
 * undefined when the value is not role-alias shaped. Doubles as the role name
 * offset for prefixed aliases; the bare `*` alias returns 0.
 */
function roleAliasPrefixLength(value: string): number | undefined {
  if (value === DEFAULT_MODEL_ROLE_ALIAS || value.startsWith(`${DEFAULT_MODEL_ROLE_ALIAS}:`)) return 0;
  return [MODEL_ROLE_ALIAS_PREFIX, LEGACY_MODEL_ROLE_ALIAS_PREFIX]
    .find((prefix) => value.startsWith(prefix))?.length;
}

/** The role a value names, when it is role-alias shaped: `@smol`, `pi/slow`, `*`. */
export function parseRoleAlias(value: string | null | undefined): string | undefined {
  const normalized = value?.trim() ?? '';
  const prefixLength = roleAliasPrefixLength(normalized);
  if (prefixLength === undefined) return undefined;
  if (normalized === DEFAULT_MODEL_ROLE_ALIAS) return DEFAULT_MODEL_ROLE;
  const role = normalized.slice(prefixLength).trim();
  return role || undefined;
}

/**
 * Expand a role name to the selector it resolves to.
 *
 * A configured value may itself name another role (`@tiny`), so expansion
 * follows the chain; a `:level` written on a hop carries to the resolved
 * selector, and the outermost level wins. An unset role falls back to
 * `default` — OMP's own fallback — and an unset `default` resolves to nothing.
 * Values are trimmed, and a malformed or cyclic chain resolves to nothing
 * instead of guessing.
 */
export function resolveRoleSelector(role: string, roles: ModelRoleValues): string | undefined {
  const trimmed = role.trim();
  if (!trimmed) return undefined;
  const split = splitThinkingSuffix(trimmed, roleAliasPrefixLength(trimmed) ?? -1, MAX_THINKING_SUFFIX_OPTIONS);
  const alias = parseRoleAlias(split.base);
  const name = alias ?? (isRoleName(split.base, roles) ? split.base : undefined);
  // A provider/model selector resolves to itself; its suffix is already its own.
  if (name === undefined) return trimmed;
  const configured = roleValue(roles[name]);
  if (configured) return expandRoleChain(configured, roles, split.level, new Set([name]));
  if (name === DEFAULT_MODEL_ROLE) return undefined;
  const fallback = roleValue(roles[DEFAULT_MODEL_ROLE]);
  return fallback ? expandRoleChain(fallback, roles, split.level, new Set([name, DEFAULT_MODEL_ROLE])) : undefined;
}

/** A role name is a canonical id, or any key the record configures. */
function isRoleName(value: string, roles: ModelRoleValues): boolean {
  return (MODEL_ROLE_IDS as readonly string[]).includes(value) || Object.hasOwn(roles, value);
}

function expandRoleChain(
  value: string,
  roles: ModelRoleValues,
  carriedLevel: ConfiguredThinkingLevel | undefined,
  visited: Set<string>,
): string | undefined {
  const split = splitThinkingSuffix(value, roleAliasPrefixLength(value) ?? -1, MAX_THINKING_SUFFIX_OPTIONS);
  // The outermost level wins: a role written `@tiny:high` asks for high even
  // when `tiny` itself carries `:low`.
  const level = carriedLevel ?? split.level;
  const alias = parseRoleAlias(split.base);
  if (alias === undefined) return withLevel(value, carriedLevel);
  if (visited.has(alias)) return undefined;
  visited.add(alias);
  const configured = roleValue(roles[alias]);
  if (configured) return expandRoleChain(configured, roles, level, visited);
  if (alias === DEFAULT_MODEL_ROLE || visited.has(DEFAULT_MODEL_ROLE)) return undefined;
  visited.add(DEFAULT_MODEL_ROLE);
  const fallback = roleValue(roles[DEFAULT_MODEL_ROLE]);
  return fallback ? expandRoleChain(fallback, roles, level, visited) : undefined;
}

/**
 * Apply a carried level to a resolved selector. The level goes in its grammar
 * position, before `#variant`/`@upstream`, so a later parse reads it back.
 */
function withLevel(selector: string, level: ConfiguredThinkingLevel | undefined): string {
  if (level === undefined) return selector;
  const parsed = parseModelSelector(selector, { ...MAX_THINKING_SUFFIX_OPTIONS, allowUpstreamRouting: true });
  return parsed ? formatModelSelector({ ...parsed, thinkingLevel: level }) : selector;
}

/**
 * The selector a role resolves to, parsed. Unparseable resolution yields null
 * rather than a fabricated provider/model pair.
 */
export function resolveRoleModelSelector(
  role: string,
  roles: ModelRoleValues,
  options?: ParseModelSelectorOptions,
): ModelSelector | null {
  const selector = resolveRoleSelector(role, roles);
  return selector ? parseModelSelector(selector, options) : null;
}

/**
 * The reasoning effort a configured selector asks a provider for: `off`,
 * `inherit` and the per-prompt `auto` sentinel ask for none. Null means the
 * request carries no explicit effort.
 */
export function thinkingLevelToReasoningEffort(
  level: ConfiguredThinkingLevel | undefined,
): string | null {
  if (level === undefined || level === 'inherit' || level === 'off' || level === AUTO_THINKING) return null;
  return level;
}

/**
 * True when a selector designates OMP's inherit sentinel rather than a model:
 * the `inherit` level on its own, or a role that resolves to nothing.
 */
export function isInheritSelector(value: string, roles?: ModelRoleValues): boolean {
  const trimmed = value.trim();
  if (trimmed === 'inherit') return true;
  if (trimmed === 'default' || trimmed === DEFAULT_MODEL_ROLE_ALIAS) {
    if (!roles) return true;
    return resolveRoleSelector(trimmed, roles) === undefined;
  }
  return false;
}
