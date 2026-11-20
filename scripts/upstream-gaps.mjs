#!/usr/bin/env node
/**
 * scripts/upstream-gaps.mjs
 *
 * Guardrail comparing the pinned upstream baseline with the working tree on:
 * - route registrations and runtime deps
 * - runtime constructors (create*) that exist only upstream
 * - uncalled route functions (an import is not a call)
 * - UI/Electron/mobile /api calls versus mounted string, parameter and regex routes
 *   (404 fallbacks and unmounted modules do not count; explicit methods must match)
 * - settings items, registry keys, sanitizer keys, store fields and setters
 *   (a setter counts only when its implementation exists), and search entries
 *
 * Allowlist rows must cite a specific heading in .workflow/decisions.md (not a
 * catch-all process heading) or an OMP owner module that exists in the repository.
 *
 * Usage:
 *   node scripts/upstream-gaps.mjs [--check] [--upstream-ref bc50ba56a] [--allowlist <path>]
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = process.cwd();
const args = process.argv.slice(2);
const CHECK_MODE = args.includes('--check');

function getFlag(name, fallback) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return fallback;
}

const UPSTREAM_REF = getFlag('--upstream-ref', null)
  ?? JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.workflow/upstream-baseline.json'), 'utf8')).upstream.revision;
const ALLOWLIST_PATH = path.resolve(getFlag('--allowlist', path.join(REPO_ROOT, 'scripts/upstream-gaps.allowlist.tsv')));
const DECISIONS_PATH = path.join(REPO_ROOT, '.workflow/decisions.md');

// 1. Load allowlist
if (!fs.existsSync(ALLOWLIST_PATH)) {
  console.error(`Allowlist not found: ${ALLOWLIST_PATH}`);
  process.exit(1);
}

const decisionHeadings = new Set(
  fs.readFileSync(DECISIONS_PATH, 'utf8').split('\n').filter((line) => line.startsWith('## ')).map((line) => line.trimEnd()),
);

// A citation is a decisions.md heading, or `OMP <path>` naming a module that exists.
function isValidCitation(citation) {
  if (decisionHeadings.has(citation)) return true;
  const omp = /^OMP\s+(\S+)$/.exec(citation);
  return omp !== null && fs.existsSync(path.join(REPO_ROOT, omp[1]));
}

const allowlistLines = fs.readFileSync(ALLOWLIST_PATH, 'utf8').trim().split('\n');
const allowlist = new Map();
const invalidCitations = [];

for (let i = 1; i < allowlistLines.length; i++) {
  const line = allowlistLines[i].trim();
  if (!line) continue;
  const parts = line.split('\t');
  const cls = parts[0];
  const item = parts[1];
  const citation = parts[2] || '';
  const key = `${cls}:${item}`;

  if (!isValidCitation(citation)) {
    invalidCitations.push({ key, citation, line: i + 1 });
  }

  allowlist.set(key, { citation, line: i + 1 });
}

console.log(`[upstream-gaps] Loaded ${allowlist.size} allowlisted gap entries from ${path.relative(REPO_ROOT, ALLOWLIST_PATH)}`);

// 2. Run server wiring audit
console.log('[upstream-gaps] Auditing server wiring and uncalled route functions...');
const serverAuditScript = path.join(REPO_ROOT, 'scripts/lib/upstream-gaps/audit-server-wiring.mjs');
const serverOutRaw = execFileSync('node', [serverAuditScript, '--upstream-ref', UPSTREAM_REF, '--json'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const serverOut = JSON.parse(serverOutRaw);

// 3. Run UI API calls audit
console.log('[upstream-gaps] Auditing UI / Electron / Mobile /api calls against server routes...');
const uiAuditScript = path.join(REPO_ROOT, 'scripts/lib/upstream-gaps/audit-ui-api.mjs');
const uiOutRaw = execFileSync('node', [uiAuditScript, '--json'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const uiOut = JSON.parse(uiOutRaw);

// 4. Run Settings inventory audit
console.log('[upstream-gaps] Auditing settings items, registry keys, sanitizers, stores, and search entries...');
const settingsAuditScript = path.join(REPO_ROOT, 'scripts/lib/upstream-gaps/audit-settings.mjs');
const settingsOutRaw = execFileSync('node', [settingsAuditScript, '--upstream-ref', UPSTREAM_REF, '--json'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const settingsOut = JSON.parse(settingsOutRaw);

// 5. Collect all detected gaps
const detectedGaps = [];

// Route registrations missing on fork
for (const item of serverOut.registerCalls.onlyUpstream) {
  detectedGaps.push({ class: 'route-registration', item: item.name, detail: item.upstream.join(', ') });
}

// Route dependencies missing on fork (from register* and create* calls)
for (const item of serverOut.registerCalls.depDiffs) {
  for (const dep of item.missingInFork) {
    detectedGaps.push({ class: 'route-deps', item: `${item.name}.${dep}`, detail: `missing from ${item.fork.join(', ')}` });
  }
}
for (const item of serverOut.createCalls.depDiffs) {
  for (const dep of item.missingInFork) {
    detectedGaps.push({ class: 'route-deps', item: `${item.name}.${dep}`, detail: `missing from ${item.fork.join(', ')}` });
  }
}

// Runtime constructors called upstream and by no fork production file (a deleted create*Runtime call)
for (const item of serverOut.createCalls.onlyUpstream) {
  detectedGaps.push({ class: 'runtime-constructor', item: item.name, detail: `upstream ${item.upstream.join(', ')}; no fork call` });
}

// Uncalled route functions
for (const item of serverOut.unusedExports) {
  detectedGaps.push({ class: 'unused-route-fn', item: item.name, detail: `${item.file}:${item.line}` });
}

// UI / Electron / mobile API calls with no matching server route
const seenUiGaps = new Set();
for (const item of uiOut.unmatched) {
  const norm = item.normalized;
  if (seenUiGaps.has(norm)) continue;
  seenUiGaps.add(norm);
  detectedGaps.push({ class: 'ui-call-no-route', item: norm, detail: `${item.file}:${item.line}` });
}

// Settings classes
for (const item of settingsOut) {
  if (item.status === 'missing' || item.status === 'half-present') {
    detectedGaps.push({ class: item.class, item: item.item, detail: `${item.status}: ${item.notes}` });
  }
}

// 6. Check detected gaps against allowlist
const unallowlistedGaps = [];
const detectedKeys = new Set();
for (const gap of detectedGaps) {
  const key = `${gap.class}:${gap.item}`;
  detectedKeys.add(key);
  if (!allowlist.has(key)) {
    unallowlistedGaps.push(gap);
  }
}

// An allowlist row whose gap no longer exists is dead weight: it outlives the
// code it described and hides a future regression under a stale citation.
const staleRows = [];
for (const [key, row] of allowlist) {
  if (!detectedKeys.has(key)) staleRows.push({ key, line: row.line });
}

console.log(`[upstream-gaps] Total detected gaps: ${detectedGaps.length}`);
console.log(`[upstream-gaps] Allowlisted gaps: ${detectedGaps.length - unallowlistedGaps.length}`);
console.log(`[upstream-gaps] Unallowlisted gaps: ${unallowlistedGaps.length}`);

if (invalidCitations.length > 0) {
  console.error(`\n[upstream-gaps] FAILED: ${invalidCitations.length} allowlist rows lack a decisions.md heading or an existing OMP owner module:`);
  for (const row of invalidCitations) {
    console.error(`  - line ${row.line} [${row.key}] citation: ${row.citation || '(empty)'}`);
  }
}

if (staleRows.length > 0) {
  console.error(`\n[upstream-gaps] FAILED: ${staleRows.length} allowlist rows describe a gap that no longer exists:`);
  for (const row of staleRows) console.error(`  - line ${row.line} [${row.key}]`);
}

if (unallowlistedGaps.length > 0) {
  console.error('\n[upstream-gaps] FAILED: Found unallowlisted merge gaps:');
  for (const g of unallowlistedGaps) {
    console.error(`  - [${g.class}] ${g.item} (${g.detail || ''})`);
  }
}

if (unallowlistedGaps.length > 0 || invalidCitations.length > 0 || staleRows.length > 0) {
  if (CHECK_MODE) {
    process.exit(1);
  }
} else {
  console.log('\n[upstream-gaps] PASSED: All detected gaps are accounted for in the allowlist or working tree.');
  process.exit(0);
}
