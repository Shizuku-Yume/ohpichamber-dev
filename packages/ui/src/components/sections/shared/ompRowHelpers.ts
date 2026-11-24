import type { OmpSettingValue } from '@openchamber/agent-contract';

/** Display unit of a free-form number row, chosen by the id's camelCase suffix. */
export type OmpRowUnit =
  | 'percent'
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'tokens'
  | 'milliseconds'
  | 'kilobytes'
  | 'lines'
  | 'columns'
  | 'calls';

/**
 * Suffix → unit, longest first so `Milliseconds` cannot be read as `Ms` and
 * `Percent` cannot be read as `Pct`.
 */
const UNIT_SUFFIXES = [
  ['Percent', 'percent'],
  ['Pct', 'percent'],
  ['Seconds', 'seconds'],
  ['Sec', 'seconds'],
  ['Minutes', 'minutes'],
  ['Hours', 'hours'],
  ['Tokens', 'tokens'],
  ['Milliseconds', 'milliseconds'],
  ['Ms', 'milliseconds'],
  ['Bytes', 'kilobytes'],
  ['Lines', 'lines'],
  ['Columns', 'columns'],
] satisfies ReadonlyArray<readonly [string, OmpRowUnit]>;

/** Unit per id, for the rows no suffix rule can describe; `null` means no chip. */
interface UnitOverrides {
  readonly [id: string]: OmpRowUnit | null;
}

/**
 * Units the suffix cannot express, checked before it.
 *
 * - `null` marks an id whose suffix names the field's origin, not its stored
 *   unit: `tools.artifactMaxBytes` is stored in MB and `tools.outputMaxColumns`
 *   is a per-line byte cap. Both rows' option labels already carry the real
 *   unit, so a chip would contradict them.
 * - `read.summarize.unfoldUntil` and `unfoldLimit` count visible summary lines
 *   but carry no `Lines` suffix, so they are listed here rather than by a
 *   looser suffix rule that would also match unrelated ids.
 * - `model.toolCallLoopGuard.threshold` counts consecutive identical tool
 *   calls, so it takes the count chip its neighbours on the page show.
 */
const UNIT_OVERRIDES: UnitOverrides = {
  'tools.artifactMaxBytes': null,
  'tools.outputMaxColumns': null,
  'read.summarize.unfoldUntil': 'lines',
  'read.summarize.unfoldLimit': 'lines',
  'model.toolCallLoopGuard.threshold': 'calls',
};

/** True when `id` ends with `suffix` as a whole camelCase word. */
function endsWithWord(id: string, suffix: string): boolean {
  if (!id.endsWith(suffix)) return false;
  if (id.length === suffix.length) return true;
  // A camelCase word starts after a lower-case letter or digit.
  return /[a-z0-9]/.test(id.charAt(id.length - suffix.length - 1));
}

/**
 * Infer the display unit for a number setting, from the override table first
 * and the id's naming convention second.
 *
 * `Bytes` means kilobytes: OMP stores `tools.artifactSpillThreshold`,
 * `tools.artifactTailBytes` and `tools.artifactHeadBytes` in KB and converts
 * at consumption time (`value * 1024`). Every `Bytes` and `Columns` row today
 * also declares options, and a number row with options shows its units in the
 * option labels instead, so only the milliseconds, minutes, hours, lines and
 * calls chips are reachable; the mappings stay complete because the next such
 * row may be free-form.
 */
export function inferUnit(id: string): OmpRowUnit | undefined {
  const overridden = UNIT_OVERRIDES[id];
  if (overridden !== undefined) return overridden ?? undefined;
  for (const [suffix, unit] of UNIT_SUFFIXES) {
    if (endsWithWord(id, suffix)) return unit;
  }
  return undefined;
}

/** Lower-case, hyphenated slug the option-label keys use. */
export function optionSlug(value: string | number): string {
  // `-1` is a normal numeric option on `task.maxRecursionDepth`, where it means
  // unlimited. It must not collapse to the same slug as the value `1`.
  if (value === -1 || String(value).trim() === '-1') return 'unlimited';
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * OMP's own "unset" sentinel option. `-1` is not a sentinel: it is a real
 * option value ("unlimited") wherever a row declares it.
 */
export function isSentinelOption(value: string): boolean {
  return value === 'default';
}

/** The four read-summary thresholds a preset writes; the switch is separate. */
const READ_SUMMARY_THRESHOLD_KEYS = [
  'read.summarize.minBodyLines',
  'read.summarize.minCommentLines',
  'read.summarize.unfoldUntil',
  'read.summarize.unfoldLimit',
] as const;

type ReadSummaryThresholdKey = (typeof READ_SUMMARY_THRESHOLD_KEYS)[number];

export type ReadSummaryPreset = 'off' | 'balanced' | 'aggressive' | 'custom';

const READ_SUMMARY_ENABLED_KEY = 'read.summarize.enabled';

/** OMP's own defaults: what an unset row means. */
const READ_SUMMARY_DEFAULTS = {
  'read.summarize.minBodyLines': 4,
  'read.summarize.minCommentLines': 6,
  'read.summarize.unfoldUntil': 50,
  'read.summarize.unfoldLimit': 100,
} satisfies Record<ReadSummaryThresholdKey, number>;

/**
 * The four thresholds a preset writes: OMP's own defaults for Balanced, the
 * smaller tuple that unfolds less for Aggressive.
 */
const READ_SUMMARY_PRESET_THRESHOLDS = {
  balanced: {
    'read.summarize.minBodyLines': 4,
    'read.summarize.minCommentLines': 6,
    'read.summarize.unfoldUntil': 50,
    'read.summarize.unfoldLimit': 100,
  },
  aggressive: {
    'read.summarize.minBodyLines': 3,
    'read.summarize.minCommentLines': 4,
    'read.summarize.unfoldUntil': 30,
    'read.summarize.unfoldLimit': 60,
  },
} satisfies Record<'balanced' | 'aggressive', Record<ReadSummaryThresholdKey, number>>;

/**
 * The number a stored setting holds, or `undefined` when it holds another type.
 *
 * OMP's settings rows carry JSON values, so a number control has to recognise
 * its own value instead of asserting it; an unset row (`null`) has none.
 */
export function storedNumber(value: OmpSettingValue): number | undefined {
  return Number.isFinite(value) ? Number(value) : undefined;
}

/** The change set a preset produces: the ids whose value differs, and nothing else. */
export interface ReadSummaryPresetChanges {
  [id: string]: OmpSettingValue;
}

/**
 * The threshold a config effectively uses: the stored number, or OMP's default
 * when the row is unset (`null`).
 */
function effectiveThreshold(
  values: Readonly<Record<string, OmpSettingValue>>,
  key: ReadSummaryThresholdKey,
): number {
  return storedNumber(values[key]) ?? READ_SUMMARY_DEFAULTS[key];
}

/** Which preset the current read-summary configuration matches. */
export function readSummaryPresetOf(
  values: Readonly<Record<string, OmpSettingValue>>,
): ReadSummaryPreset {
  // Read summaries are on unless the config explicitly turns them off.
  if (values[READ_SUMMARY_ENABLED_KEY] === false) return 'off';
  for (const preset of ['balanced', 'aggressive'] as const) {
    const thresholds = READ_SUMMARY_PRESET_THRESHOLDS[preset];
    // An unset (`null`) row is OMP's default, so a fresh config reads Balanced.
    const matches = READ_SUMMARY_THRESHOLD_KEYS.every((key) => effectiveThreshold(values, key) === thresholds[key]);
    if (matches) return preset;
  }
  return 'custom';
}

/**
 * The keys a preset changes, so a write never rewrites a value the row already
 * holds. An unset (`null`) row counts as its OMP default, which makes Balanced
 * on a default config a no-op; Custom writes nothing at all.
 */
export function readSummaryPresetChanges(
  preset: ReadSummaryPreset,
  values: Readonly<Record<string, OmpSettingValue>>,
): ReadSummaryPresetChanges {
  const changes: ReadSummaryPresetChanges = {};
  if (preset === 'custom') return changes;
  const enabled = values[READ_SUMMARY_ENABLED_KEY] !== false;
  if (preset === 'off') {
    if (enabled) changes[READ_SUMMARY_ENABLED_KEY] = false;
    return changes;
  }
  if (!enabled) changes[READ_SUMMARY_ENABLED_KEY] = true;

  const thresholds = READ_SUMMARY_PRESET_THRESHOLDS[preset];
  for (const key of READ_SUMMARY_THRESHOLD_KEYS) {
    if (effectiveThreshold(values, key) !== thresholds[key]) changes[key] = thresholds[key];
  }
  return changes;
}
