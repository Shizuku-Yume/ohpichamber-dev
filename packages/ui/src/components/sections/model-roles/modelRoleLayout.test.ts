import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS_SEARCH_ITEMS as searchItems } from '@/lib/settings/search';
import { CHAT_ROLES, KIND_ROLES, LINKED_ROLES, OMITTED_ROLES } from './modelRoleLayout';

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
