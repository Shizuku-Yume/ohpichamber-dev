import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OMP_SETTING_PLACEMENTS } from '../../../../agent-service/src/worker/settings-ui';

/**
 * One settings item id, one owning page.
 *
 * Search, deep links and the Settings anchors all address a control by its
 * `data-settings-item` value, so two pages claiming the same id send a reader
 * to whichever one they happen to land on. The OMP page's duplicate-owner
 * classification relies on the same rule: a setting classified `duplicate`
 * names an id here, and that id must have exactly one owner.
 */

const SECTIONS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Same-page claims: a dialog or an inline form beside the main control, both
 * under one page. They cannot send a reader to the wrong page because the page
 * is the same, and the pair is deliberately two views of one concept.
 */
const SAME_PAGE_CLAIMS = new Map(Object.entries({
  'commands.argument-hint': 'CommandsPage shows the hint in the list row and in the editor',
  'plugins.content': 'PluginsPage lists the plugin; AddPluginDialog edits one',
  'projects.worktree': 'The project tab and its worktree list both name the worktree setting',
  'providers.auth': 'ProvidersPage authenticates the same provider in two places',
  'providers.connect': 'ProviderConnectPicker opens the form ProviderGrid resells',
  'providers.custom': 'ProviderConnectPicker offers custom setup; CustomProviderForm is it',
  'providers.logo': 'ProvidersPage lists custom provider logos; CustomProviderForm edits them',
}));

interface Claim {
  readonly id: string;
  readonly page: string;
  readonly file: string;
  /** True when `id` is a static prefix covering every id beneath it. */
  readonly namespace?: boolean;
}

function walk(directory: string, files: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      walk(full, files);
    } else if (/\.tsx$/.test(entry) && !/\.test\.tsx$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

/**
 * A claim is either one id or a whole namespace: `settingsItem={`omp.modelRoles.${role}`}`
 * claims every `omp.modelRoles.<role>` id, not just a literal it happens to write.
 * `owner: null` marks a namespace, whose static prefix is its `id`.
 */
function collectClaims(): Claim[] {
  const claims: Claim[] = [];
  for (const fullPath of walk(SECTIONS_ROOT)) {
    const source = readFileSync(fullPath, 'utf8');
    const file = relative(SECTIONS_ROOT, fullPath).split(sep).join('/');
    const page = file.split('/')[0];
    for (const match of source.matchAll(/settingsItem=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const literal = match[1];
      const template = match[2];
      if (literal !== undefined) {
        claims.push({ id: literal, page, file });
        continue;
      }
      // `a.${x}.b` covers `a.<x>.b`; the trailing static part still separates
      // it from the sibling `a.<x>.c` namespace.
      const prefixHead = template.split('${')[0];
      const prefixTail = template.includes('}') ? template.slice(template.lastIndexOf('}') + 1) : '';
      if (prefixHead.length === 0 || prefixTail.length > 0) continue;
      claims.push({ id: prefixHead, page, file, namespace: true });
    }
  }
  return claims;
}

/** Two claims collide when one id falls inside the other's namespace. */
function collides(left: Claim, right: Claim): boolean {
  if (left.namespace === true && right.namespace === true) return left.id === right.id;
  if (left.namespace === true) return right.id.startsWith(left.id);
  if (right.namespace === true) return left.id.startsWith(right.id);
  return left.id === right.id;
}

describe('settings item ownership', () => {
  test('no settings item id is claimed by two pages', () => {
    const claims = collectClaims();
    const offenders: string[] = [];
    for (const claim of claims) {
      const others = claims.filter((other) => other !== claim && other.file !== claim.file && collides(claim, other));
      if (others.length === 0) continue;
      const pages = new Set([claim.page, ...others.map((other) => other.page)]);
      // Same page: allowed only when the pair is named here with its reason,
      // so a second control on one page is still a deliberate decision.
      if (pages.size === 1 && SAME_PAGE_CLAIMS.has(claim.id)) continue;
      offenders.push(`${claim.id}: ${[claim.file, ...others.map((other) => other.file)].join(', ')}`);
    }
    expect([...new Set(offenders)].sort()).toEqual([]);
  });

  test('the same-page allowlist names a claim that still exists, and says why', () => {
    const ids = new Set(collectClaims().map((claim) => claim.id));
    for (const [id, reason] of SAME_PAGE_CLAIMS) {
      expect(`${id} claimed: ${ids.has(id)}`).toBe(`${id} claimed: true`);
      expect(`${id} reason: ${reason.length > 0}`).toBe(`${id} reason: true`);
    }
  });

  test('every owned-by row names a control that writes its OMP key', () => {
    const claims = collectClaims();
    const claimsByOwner = new Map(claims.map((claim) => [claim.id, claim]));
    const ownedByEntries = Object.entries(OMP_SETTING_PLACEMENTS)
      .flatMap((entry): Array<readonly [string, string]> => {
        const [id, placement] = entry;
        return placement.type === 'owned-by' ? [[id, placement.owner]] : [];
      });
    expect(ownedByEntries.length).toBeGreaterThan(0);

    for (const [id, owner] of ownedByEntries) {
      const claim = claimsByOwner.get(owner);
      expect(claim !== undefined, `Owner "${owner}" for OMP setting "${id}" must exist in UI claims`).toBe(true);
      const claimFileSource = readFileSync(join(SECTIONS_ROOT, claim!.file), 'utf8');
      // A write may name the key literally (`id: 'compaction.modelThresholds'`)
      // or through a same-file const alias (`const MODEL_THRESHOLDS = '…'`).
      const alias = new RegExp(`const\\s+[A-Z0-9_]+\\s*=\\s*'${id.replace(/\./g, '\\.')}'`, 'g');
      const aliases = [...claimFileSource.matchAll(alias)].map((match) => {
        const constMatch = match[0].match(/const\s+([A-Z0-9_]+)/);
        return constMatch ? constMatch[1] : null;
      }).filter((name): name is string => name !== null);
      const idPattern = `(?:'${id.replace(/\./g, '\\.')}'${aliases.length > 0 ? `|${aliases.join('|')}` : ''})`;
      const writesOmpKeyPattern = new RegExp(`(?:updateOmpSettings|updateSettings)[\\s\\S]*?id:\\s*${idPattern}`);
      const writesModelRoles = id === 'modelRoles'
        && claimFileSource.includes('useOmpPageSettings(')
        && /updateSettings\(\(state\) => \[modelRoleChange\(state,/.test(claimFileSource);
      expect(
        writesModelRoles || writesOmpKeyPattern.test(claimFileSource),
        `File ${claim!.file} claiming "${owner}" must write OMP setting "${id}" via updateOmpSettings`,
      ).toBe(true);
    }
  });

  test('ModelRolesPage is the sole owner of omp.modelRoles and DefaultsSettings does not claim it', () => {
    const claims = collectClaims();
    const modelRolesFiles = new Set(claims
      .filter((claim) => claim.id === 'omp.modelRoles.' || claim.id === 'omp.modelRoles' || claim.id.startsWith('omp.modelRoles.'))
      .map((claim) => claim.file));
    expect([...modelRolesFiles]).toEqual(['sections/model-roles/ModelRolesPage.tsx']);
    expect(claims.some((claim) => claim.file === 'sections/openchamber/DefaultsSettings.tsx' && claim.id.startsWith('omp.modelRoles'))).toBe(false);
  });
});
