import { z } from 'zod';
import { JsonObjectSchema, type JsonObject, type JsonValue } from '@openchamber/agent-contract';
import type { I18nKey } from '@/lib/i18n/store';

/**
 * A role edited on another page, where it sits beside the controls that
 * depend on it. The hub shows its value and sends the reader there.
 */
interface LinkedRole {
  readonly page: string;
  readonly item?: string;
  readonly linkKey: I18nKey;
}

export const LINKED_ROLES: Readonly<Record<string, LinkedRole>> = {
  web: { page: 'web-search', linkKey: 'settings.omp.modelRoles.link.webSearch' },
  speech: { page: 'voice', linkKey: 'settings.omp.modelRoles.link.voice' },
};

/**
 * OMP 19.1's built-in roles in its own order (`config/model-roles.ts`). Chat
 * roles accept a chat model, so the chat catalog is their exact candidate
 * list. `judge` also accepts chat models; `image` reads the image catalog.
 * `dictation` is left out: only the terminal's speech input reads it, and
 * the app dictates through Voice.
 */
export const CHAT_ROLES = ['default', 'smol', 'slow', 'vision', 'plan', 'commit', 'tiny', 'memory', 'task', 'advisor', 'widget'] as const;
export const KIND_ROLES = ['image', 'web', 'speech', 'judge'] as const;

/** Built-in roles the hub leaves out, each with the reason. */
export const OMITTED_ROLES: Readonly<Record<string, string>> = {
  dictation: 'Only the terminal speech input reads it; the app dictates through Voice.',
};

const BUILTIN_ROLE_IDS: ReadonlySet<string> = new Set([
  ...CHAT_ROLES,
  ...KIND_ROLES,
  ...Object.keys(OMITTED_ROLES),
]);

const CUSTOM_ROLE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;

const ModelTagFieldsSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
  hidden: z.boolean().optional(),
});

const ModelTagsRecordSchema = z.record(z.string(), JsonObjectSchema);
export type ModelTagsRecord = z.infer<typeof ModelTagsRecordSchema>;

export function parseModelTagsRecord(value: JsonValue | undefined): ModelTagsRecord {
  const record = JsonObjectSchema.safeParse(value);
  if (!record.success) return {};
  const result: ModelTagsRecord = {};
  for (const [key, entry] of Object.entries(record.data)) {
    const parsed = JsonObjectSchema.safeParse(entry);
    if (parsed.success) result[key] = parsed.data;
  }
  return result;
}

export function modelTagDisplayName(entry: JsonObject | undefined): string {
  if (!entry) return '';
  const parsed = ModelTagFieldsSchema.safeParse(entry);
  return parsed.success ? (parsed.data.name?.trim() ?? '') : '';
}

export function deriveCustomRoleIds(
  rolesValue: JsonValue | undefined,
  modelTagsValue: JsonValue | undefined,
): string[] {
  const roles = JsonObjectSchema.safeParse(rolesValue);
  const tags = parseModelTagsRecord(modelTagsValue);
  const ids = new Set<string>();
  if (roles.success) {
    for (const key of Object.keys(roles.data)) {
      if (!BUILTIN_ROLE_IDS.has(key)) ids.add(key);
    }
  }
  for (const key of Object.keys(tags)) {
    if (!BUILTIN_ROLE_IDS.has(key)) ids.add(key);
  }
  return [...ids].sort();
}

export type CustomRoleIdValidation =
  | { readonly valid: true; readonly id: string }
  | { readonly valid: false; readonly reason: 'required' | 'invalidFormat' | 'builtinCollision' | 'duplicate' };

export function validateCustomRoleId(
  rawId: string,
  existingCustomIds: readonly string[],
): CustomRoleIdValidation {
  const id = rawId.trim();
  if (!id) return { valid: false, reason: 'required' };
  if (!CUSTOM_ROLE_ID_PATTERN.test(id)) return { valid: false, reason: 'invalidFormat' };
  if (BUILTIN_ROLE_IDS.has(id)) return { valid: false, reason: 'builtinCollision' };
  if (existingCustomIds.includes(id)) return { valid: false, reason: 'duplicate' };
  return { valid: true, id };
}

export function saveCustomRoleTag(
  rawTags: JsonValue | undefined,
  roleId: string,
  displayName: string,
  hasRoleAssignment: boolean,
): JsonObject {
  const next = parseModelTagsRecord(rawTags);
  const trimmed = displayName.trim();
  const existing = next[roleId];
  if (trimmed.length > 0) {
    next[roleId] = existing ? { ...existing, name: trimmed } : { name: trimmed };
    return next;
  }
  if (!hasRoleAssignment) {
    next[roleId] = existing ? { ...existing, name: '' } : { name: '' };
    return next;
  }
  if (!existing) return next;
  const rest = { ...existing };
  delete rest.name;
  if (Object.keys(rest).length === 0) {
    delete next[roleId];
  } else {
    next[roleId] = rest;
  }
  return next;
}

export function removeCustomRoleTag(rawTags: JsonValue | undefined, roleId: string): JsonObject {
  const next = parseModelTagsRecord(rawTags);
  delete next[roleId];
  return next;
}
