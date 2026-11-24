import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_SEARCH_ITEMS as searchItems } from '@/lib/settings/search';
import {
  CHAT_ROLES,
  KIND_ROLES,
  LINKED_ROLES,
  OMITTED_ROLES,
  deriveCustomRoleIds,
  parseModelTagsRecord,
  removeCustomRoleTag,
  saveCustomRoleTag,
  validateCustomRoleId,
} from './modelRoleLayout';

const OMP_MODEL_ROLES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../agent-service/node_modules/@oh-my-pi/pi-coding-agent/src/config/model-roles.ts',
);

/** The pinned OMP's built-in roles and their section, read from its own table. */
function nativeRoles(): { chat: string[]; kind: string[] } {
  const source = readFileSync(OMP_MODEL_ROLES, 'utf8');
  const table = source.slice(source.indexOf('export const MODEL_ROLES'));
  const roles = { chat: [] as string[], kind: [] as string[] };
  for (const match of table.matchAll(/^\t(\w+): \{[^]*?section: "(chat|kind)"/gm)) {
    roles[match[2] as 'chat' | 'kind'].push(match[1]);
  }
  return roles;
}

test('the hub lists every pinned OMP built-in role in its own section and order', () => {
  const native = nativeRoles();
  expect(native.chat.length + native.kind.length).toBe(16);
  expect([...CHAT_ROLES]).toEqual(native.chat);
  expect([...KIND_ROLES, ...Object.keys(OMITTED_ROLES)].sort()).toEqual([...native.kind].sort());
  expect(KIND_ROLES.filter((role) => role in OMITTED_ROLES)).toEqual([]);
});

test('every hub role is searchable on the hub, and linked roles name their owner page', () => {
  const hubItems = new Set(searchItems.filter((item) => item.page === 'model-roles').map((item) => item.id));
  for (const role of [...CHAT_ROLES, ...KIND_ROLES]) {
    if (role in LINKED_ROLES) continue;
    expect(`${role}: ${hubItems.has(`omp.modelRoles.${role}`)}`).toBe(`${role}: true`);
  }
  for (const [role, linked] of Object.entries(LINKED_ROLES)) {
    expect(`${role}: ${linked.page !== 'model-roles'}`).toBe(`${role}: true`);
    if (linked.item) expect(searchItems.find((item) => item.id === linked.item)?.page).toBe(linked.page);
  }
});

test('custom role section is indexed under model-roles', () => {
  expect(searchItems.find((item) => item.id === 'model-roles.section.custom')?.page).toBe('model-roles');
});

test('deriveCustomRoleIds returns sorted union of modelRoles and modelTags keys excluding built-in and omitted roles', () => {
  const roles = {
    default: 'openai/gpt-5',
    smol: 'openai/gpt-5-mini',
    dictation: 'openai/whisper',
    'review-fast': 'anthropic/claude-haiku',
    zeta: 'openai/gpt-5',
  };
  const tags = {
    smol: { name: 'Mini' },
    alpha: { name: 'Alpha Role', color: 'accent' },
    'review-fast': { name: 'Fast Reviewer' },
  };

  expect(deriveCustomRoleIds(roles, tags)).toEqual(['alpha', 'review-fast', 'zeta']);
  expect(deriveCustomRoleIds(null, undefined)).toEqual([]);
});

test('validateCustomRoleId enforces slug format and rejects built-in or existing collisions', () => {
  expect(validateCustomRoleId('', [])).toEqual({ valid: false, reason: 'required' });
  expect(validateCustomRoleId('   ', [])).toEqual({ valid: false, reason: 'required' });
  expect(validateCustomRoleId('InvalidRole', [])).toEqual({ valid: false, reason: 'invalidFormat' });
  expect(validateCustomRoleId('-bad', [])).toEqual({ valid: false, reason: 'invalidFormat' });
  expect(validateCustomRoleId('has space', [])).toEqual({ valid: false, reason: 'invalidFormat' });
  expect(validateCustomRoleId('smol', [])).toEqual({ valid: false, reason: 'builtinCollision' });
  expect(validateCustomRoleId('dictation', [])).toEqual({ valid: false, reason: 'builtinCollision' });
  expect(validateCustomRoleId('image', [])).toEqual({ valid: false, reason: 'builtinCollision' });
  expect(validateCustomRoleId('review-fast', ['review-fast'])).toEqual({ valid: false, reason: 'duplicate' });
  expect(validateCustomRoleId(' review_2 ', ['review-fast'])).toEqual({ valid: true, id: 'review_2' });
});

test('saveCustomRoleTag and removeCustomRoleTag preserve unrelated tags and clean up empty entries', () => {
  const initial = parseModelTagsRecord({
    other: { name: 'Other', color: 'info' },
    custom: { name: 'Old', hidden: true },
  });
  const savedWithName = saveCustomRoleTag(initial, 'custom', 'Reviewer', true);
  expect(savedWithName).toEqual({
    other: { name: 'Other', color: 'info' },
    custom: { name: 'Reviewer', hidden: true },
  });

  // Clearing display name while retaining an existing role assignment strips name only
  const clearedNameWithRole = saveCustomRoleTag(savedWithName, 'custom', '', true);
  expect(clearedNameWithRole).toEqual({
    other: { name: 'Other', color: 'info' },
    custom: { hidden: true },
  });

  // Creating a tag-only custom role without model keeps an entry in modelTags so it stays discoverable
  const tagOnly = saveCustomRoleTag({}, 'tag-only', '', false);
  expect(tagOnly).toEqual({ 'tag-only': { name: '' } });

  // Deleting removes the custom role key cleanly without touching other tags
  expect(removeCustomRoleTag(savedWithName, 'custom')).toEqual({
    other: { name: 'Other', color: 'info' },
  });
});
