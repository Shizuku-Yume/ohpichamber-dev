import { z } from 'zod';
import {
  JsonObjectSchema,
  parseConfiguredThinkingLevel,
  type JsonObject,
  type JsonValue,
  type OmpSettingsChange,
} from '@openchamber/agent-contract';
import { parseRolesRecord } from '@/components/sections/shared/modelRoleSelectors';

const PRESET_NAME_PATTERN = /^[a-zA-Z][\w-]*$/;

export const PRESET_THINKING_LEVELS = ['auto', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;

const PresetRolesRecordSchema = z.record(
  z.string(),
  z.string().refine((value) => value.trim().length > 0),
);

const ModelPresetEntrySchema = z.object({
  modelRoles: PresetRolesRecordSchema,
  defaultThinkingLevel: z.string().optional(),
});

export type PresetRolesMap = z.infer<typeof PresetRolesRecordSchema>;
export type ModelPresetEntry = z.infer<typeof ModelPresetEntrySchema>;

type ModelPresetLookup =
  | { readonly kind: 'valid'; readonly preset: ModelPresetEntry }
  | { readonly kind: 'invalid' };

export interface ModelPresetsMap {
  [name: string]: ModelPresetLookup;
}

export function isValidPresetThinkingLevel(level: string): boolean {
  return PRESET_THINKING_LEVELS.some((candidate) => candidate === level);
}

export function parseModelPresetsRecord(value: JsonValue | undefined): ModelPresetsMap {
  const parsed = JsonObjectSchema.safeParse(value);
  if (!parsed.success) return {};
  const entries: ModelPresetsMap = {};
  for (const [name, raw] of Object.entries(parsed.data)) {
    const entry = ModelPresetEntrySchema.safeParse(raw);
    if (!entry.success) {
      entries[name] = { kind: 'invalid' };
      continue;
    }
    const rawLevel = entry.data.defaultThinkingLevel;
    if (rawLevel !== undefined) {
      const normalized = parseConfiguredThinkingLevel(rawLevel);
      if (normalized === undefined || !isValidPresetThinkingLevel(normalized)) {
        entries[name] = { kind: 'invalid' };
        continue;
      }
      entries[name] = {
        kind: 'valid',
        preset: { modelRoles: entry.data.modelRoles, defaultThinkingLevel: normalized },
      };
      continue;
    }
    entries[name] = {
      kind: 'valid',
      preset: { modelRoles: entry.data.modelRoles },
    };
  }
  return entries;
}

export type PresetNameValidation =
  | { readonly valid: true; readonly name: string }
  | { readonly valid: false; readonly reason: 'required' | 'invalidFormat' | 'duplicate' };

export function validatePresetName(
  rawName: string,
  existingNames: readonly string[],
  originalName?: string,
): PresetNameValidation {
  const name = rawName.trim();
  if (name.length === 0) return { valid: false, reason: 'required' };
  if (!PRESET_NAME_PATTERN.test(name)) return { valid: false, reason: 'invalidFormat' };
  if (name !== originalName && existingNames.includes(name)) return { valid: false, reason: 'duplicate' };
  return { valid: true, name };
}

const StringRoleValueSchema = z.string();
const StringArrayRoleValueSchema = z.array(z.string());

function normalizeRoleValue(value: JsonValue | undefined): string | undefined {
  const direct = StringRoleValueSchema.safeParse(value);
  if (direct.success) return direct.data;
  const list = StringArrayRoleValueSchema.safeParse(value);
  if (list.success) return list.data.join(',');
  return undefined;
}

export function effectiveRoleAssignments(rolesValue: JsonValue | undefined): PresetRolesMap {
  const roles = parseRolesRecord(rolesValue);
  const normalized: PresetRolesMap = {};
  for (const [role, value] of Object.entries(roles)) {
    const selector = normalizeRoleValue(value);
    if (selector !== undefined && selector.trim() !== '') normalized[role] = selector;
  }
  return normalized;
}

export function findActivePresetName(
  presets: Readonly<ModelPresetsMap>,
  rolesValue: JsonValue | undefined,
  defaultThinkingLevel: string | undefined,
): string | undefined {
  const effective = effectiveRoleAssignments(rolesValue);
  const effectiveNames = Object.keys(effective);
  const names = Object.keys(presets).sort((a, b) => a.localeCompare(b));
  return names.find((name) => {
    const lookup = presets[name];
    if (lookup?.kind !== 'valid') return false;
    const { modelRoles, defaultThinkingLevel: presetLevel } = lookup.preset;
    if (presetLevel !== undefined && presetLevel !== defaultThinkingLevel) return false;
    const presetRoles = Object.keys(modelRoles);
    return (
      presetRoles.length === effectiveNames.length
      && presetRoles.every((role) => Object.hasOwn(effective, role) && effective[role] === modelRoles[role])
    );
  });
}

export function applyPresetChanges(preset: ModelPresetEntry): OmpSettingsChange[] {
  const roles: JsonObject = { ...preset.modelRoles };
  const changes: OmpSettingsChange[] = [{ id: 'modelRoles', value: roles }];
  if (preset.defaultThinkingLevel !== undefined) {
    changes.push({ id: 'defaultThinkingLevel', value: preset.defaultThinkingLevel });
  }
  return changes;
}

export function presetDraftFromCurrentRoles(
  rolesValue: JsonValue | undefined,
  defaultThinkingLevel: string | undefined,
): ModelPresetEntry {
  const modelRoles = effectiveRoleAssignments(rolesValue);
  if (defaultThinkingLevel !== undefined && isValidPresetThinkingLevel(defaultThinkingLevel)) {
    return { modelRoles, defaultThinkingLevel };
  }
  return { modelRoles };
}

export function sanitizePresetRoles(modelRoles: Readonly<PresetRolesMap>): PresetRolesMap {
  const clean: PresetRolesMap = {};
  for (const [role, selector] of Object.entries(modelRoles)) {
    if (selector.trim() !== '') clean[role] = selector;
  }
  return clean;
}

function serializePresetEntry(entry: ModelPresetEntry): JsonObject {
  const modelRoles: JsonObject = {};
  for (const [role, selector] of Object.entries(sanitizePresetRoles(entry.modelRoles))) {
    modelRoles[role] = selector;
  }
  const result: JsonObject = { modelRoles };
  if (entry.defaultThinkingLevel !== undefined) {
    result.defaultThinkingLevel = entry.defaultThinkingLevel;
  }
  return result;
}

export function savePresetInRecord(
  rawRecord: JsonValue | undefined,
  name: string,
  entry: ModelPresetEntry,
  originalName?: string,
): JsonObject {
  const current = JsonObjectSchema.safeParse(rawRecord);
  const base: JsonObject = current.success ? current.data : {};
  const serialized = serializePresetEntry(entry);
  if (originalName === undefined || originalName === name) {
    return { ...base, [name]: serialized };
  }
  const next: JsonObject = {};
  let replaced = false;
  for (const [key, value] of Object.entries(base)) {
    if (key === originalName) {
      next[name] = serialized;
      replaced = true;
      continue;
    }
    if (key === name) continue;
    next[key] = value;
  }
  if (!replaced) {
    next[name] = serialized;
  }
  return next;
}

export function deletePresetFromRecord(rawRecord: JsonValue | undefined, name: string): JsonObject {
  const current = JsonObjectSchema.safeParse(rawRecord);
  if (!current.success) return {};
  const next: JsonObject = {};
  for (const [key, value] of Object.entries(current.data)) {
    if (key !== name) next[key] = value;
  }
  return next;
}
