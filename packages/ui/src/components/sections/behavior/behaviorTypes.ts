import {
  BehaviorFileFieldsSchema,
  BehaviorRuleFieldsSchema,
  type BehaviorFileEntry,
  type BehaviorFileFields,
  type FileResourceScope,
} from '@openchamber/agent-contract';

export type InterruptMode = NonNullable<BehaviorFileFields['interruptMode']>;
export type RepeatMode = NonNullable<BehaviorFileFields['repeatMode']>;

export type BehaviorSelection =
  | { type: 'prompt' }
  | { type: 'agents-md'; scope: 'global' | 'project' }
  | { type: 'native-file'; scope: FileResourceScope; kind: BehaviorFileEntry['kind']; name: string }
  | { type: 'new-draft'; scope: FileResourceScope; kind: 'rule' | 'instruction'; name: string };

export interface BehaviorDraftTarget {
  scope: FileResourceScope;
  kind: 'rule' | 'instruction';
  name: string;
}

export interface StructuredBehaviorFields {
  enabled: boolean | null;
  alwaysApply: boolean | null;
  description: string;
  globs: string[];
  agents: string[];
  scope: string[];
  condition: string[];
  astCondition: string[];
  question: string;
  interruptMode: InterruptMode | null;
  repeatMode: RepeatMode | null;
  applyTo: string;
}

export const FIXED_NATIVE_FILES = [
  { kind: 'sticky-rules', name: 'RULES.md' },
  { kind: 'system', name: 'SYSTEM.md' },
] as const;

export const INTERRUPT_MODES: readonly InterruptMode[] = ['never', 'prose-only', 'tool-only', 'always'];
export const REPEAT_MODES: readonly RepeatMode[] = ['once', 'after-gap', 'always'];

const RULE_FILENAME_PATTERN = /^[\p{L}\p{N}_-][\p{L}\p{N}_. -]*\.(?:mdc|md)$/u;
const RESERVED_WINDOWS_NAME_PATTERN = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])\./i;

export function isValidRuleFilename(name: string): boolean {
  return RULE_FILENAME_PATTERN.test(name) && !RESERVED_WINDOWS_NAME_PATTERN.test(name);
}

export function isValidInstructionFilename(name: string): boolean {
  return name.endsWith('.md') && isValidRuleFilename(name);
}

export function normalizeCreateFilename(raw: string, kind: 'rule' | 'instruction'): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (!trimmed.includes('.')) {
    return `${trimmed}${kind === 'rule' ? '.mdc' : '.md'}`;
  }
  return trimmed;
}

export function selectionKey(selection: BehaviorSelection): string {
  switch (selection.type) {
    case 'prompt':
      return 'prompt';
    case 'agents-md':
      return `agents-md:${selection.scope}`;
    case 'native-file':
      return `native-file:${selection.scope}:${selection.kind}:${selection.name}`;
    case 'new-draft':
      return `new-draft:${selection.scope}:${selection.kind}:${selection.name}`;
  }
}

export function toStringList(value: string | string[] | null | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return [...value];
  return value === '' ? [] : [value];
}

export function stringListsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function structuredFieldsFromEntry(fields?: BehaviorFileFields): StructuredBehaviorFields {
  return {
    enabled: fields?.enabled ?? null,
    alwaysApply: fields?.alwaysApply ?? null,
    description: fields?.description ?? '',
    globs: toStringList(fields?.globs),
    agents: toStringList(fields?.agents),
    scope: toStringList(fields?.scope),
    condition: toStringList(fields?.condition),
    astCondition: toStringList(fields?.astCondition),
    question: fields?.question ?? '',
    interruptMode: fields?.interruptMode ?? null,
    repeatMode: fields?.repeatMode ?? null,
    applyTo: fields?.applyTo ?? '',
  };
}

export function structuredFieldsEqual(left: StructuredBehaviorFields, right: StructuredBehaviorFields): boolean {
  return (
    left.enabled === right.enabled &&
    left.alwaysApply === right.alwaysApply &&
    left.description === right.description &&
    stringListsEqual(left.globs, right.globs) &&
    stringListsEqual(left.agents, right.agents) &&
    stringListsEqual(left.scope, right.scope) &&
    stringListsEqual(left.condition, right.condition) &&
    stringListsEqual(left.astCondition, right.astCondition) &&
    left.question === right.question &&
    left.interruptMode === right.interruptMode &&
    left.repeatMode === right.repeatMode &&
    left.applyTo === right.applyTo
  );
}

export function isNewRuleUsable(fields: StructuredBehaviorFields): boolean {
  if (fields.enabled === false) return true;
  if (fields.alwaysApply === true) return true;
  if (fields.description.trim().length > 0) return true;
  if (fields.question.trim().length > 0) return true;
  if (fields.condition.length > 0) return true;
  if (fields.astCondition.length > 0) return true;
  return false;
}

export function buildFieldPatch(
  kind: BehaviorFileEntry['kind'],
  draft: StructuredBehaviorFields,
  original?: BehaviorFileFields,
): BehaviorFileFields | undefined {
  if (kind === 'sticky-rules' || kind === 'system') return undefined;
  return buildFieldPatchFromStructured(kind, draft, structuredFieldsFromEntry(original));
}

export function buildFieldPatchFromStructured(
  kind: BehaviorFileEntry['kind'],
  draft: StructuredBehaviorFields,
  base: StructuredBehaviorFields,
): BehaviorFileFields | undefined {
  if (kind === 'sticky-rules' || kind === 'system') return undefined;

  if (kind === 'instruction') {
    if (draft.applyTo === base.applyTo) return undefined;
    return BehaviorFileFieldsSchema.parse({
      applyTo: draft.applyTo === '' ? null : draft.applyTo,
    });
  }
  const patch: Record<string, unknown> = {};

  if (draft.enabled !== base.enabled) patch.enabled = draft.enabled;
  if (draft.alwaysApply !== base.alwaysApply) patch.alwaysApply = draft.alwaysApply;
  if (draft.description !== base.description) patch.description = draft.description === '' ? null : draft.description;
  if (!stringListsEqual(draft.globs, base.globs)) patch.globs = draft.globs.length === 0 ? null : draft.globs;
  if (!stringListsEqual(draft.agents, base.agents)) patch.agents = draft.agents.length === 0 ? null : draft.agents;
  if (!stringListsEqual(draft.scope, base.scope)) patch.scope = draft.scope.length === 0 ? null : draft.scope;
  if (!stringListsEqual(draft.condition, base.condition)) patch.condition = draft.condition.length === 0 ? null : draft.condition;
  if (!stringListsEqual(draft.astCondition, base.astCondition)) patch.astCondition = draft.astCondition.length === 0 ? null : draft.astCondition;
  if (draft.question !== base.question) patch.question = draft.question === '' ? null : draft.question;
  if (draft.interruptMode !== base.interruptMode) patch.interruptMode = draft.interruptMode;
  if (draft.repeatMode !== base.repeatMode) patch.repeatMode = draft.repeatMode;

  if (Object.keys(patch).length === 0) return undefined;
  return BehaviorRuleFieldsSchema.parse(patch);
}
