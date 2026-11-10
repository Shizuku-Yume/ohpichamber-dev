#!/usr/bin/env node
// The upstream disposition ledger, derived from git blobs instead of maintained
// by hand.
//
// Every path that the fork and upstream v2.7.0 (`bc50ba56a`) do not share
// byte-for-byte gets a state from the trees themselves:
//
//   identical      both sides hold the same blob
//   upstream-only  upstream has the path, the fork does not
//   fork-only      the fork has the path, upstream does not
//   fork-differs   both sides have the path with different blobs
//
// A `fork-differs` path also gets a class, so a review can tell a deliberate
// OMP-boundary fork from an unexplained one:
//
//   omp-boundary        the path belongs to the Canonical Client, the agent
//                       contract, the Agent Service, the Host gateway, or one
//                       of the standing exclusions the merge keeps on the fork
//                       side
//   decision            `.workflow/upstream-deltas.tsv` names a
//                       `.workflow/decisions.md` heading for it
//   unexplained         neither
//
// A path only one side has needs no decision: upstream's additions were either
// adopted (and are then identical) or excluded by the standing-exclusion rule
// (`upstream-excluded`), and a fork-only path is the fork's own work
// (`fork-added`). Both are still `omp-boundary` when the boundary owns them.
//
// The merge base decides which side moved, not what the state is: a path the
// fork changed and upstream left alone is `fork-differs` all the same.
//
// Usage:
//   bun scripts/upstream-drift.mjs                      print the ledger
//   bun scripts/upstream-drift.mjs --markers            fail on conflict markers
//   bun scripts/upstream-drift.mjs --markers --lane 14  markers in lane 14's paths
//   bun scripts/upstream-drift.mjs --markers <paths…>   markers in those paths
//   bun scripts/upstream-drift.mjs --check              fail on conflict markers, on
//                                                      any unexplained path, and on
//                                                      ledger rows that contradict git

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UPSTREAM = 'bc50ba56a';
export const DELTAS_FILE = '.workflow/upstream-deltas.tsv';
export const LANES_FILE = '.workflow/research/ux-v270-omp-alignment/merge-lanes.tsv';
export const DECISIONS_FILE = '.workflow/decisions.md';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A conflict marker line: `<<<<<<< `, an exactly-`=======` line, or `>>>>>>> `.
// The delimiters are matched strictly, so ordinary text such as `<<<<<<<word`
// or an `=======` underline is not a marker.
const MARKER_LINE = /^(?:<<<<<<< |=======$|>>>>>>> )/u;

/**
 * Paths the merge keeps on the fork side regardless of what upstream did.
 * Each entry is a decision, not a heuristic: the OMP boundary owns them, or a
 * recorded decision removed them, and upstream's changes to them never land.
 */
export const BOUNDARY_PREFIXES = [
  'packages/agent-contract/',
  'packages/agent-service/',
  'packages/ui/src/api/',
  'packages/web/server/lib/host/',
  'packages/web/server/lib/opencode/',
  'packages/ui/src/lib/opencode/',
  'packages/web/server/lib/spaces/',
  'packages/ui/src/lib/spaces/',
  'packages/ui/src/components/session/spaces/',
  'packages/vscode/',
  'packages/web/server/lib/opencode-trust/',
  'nix/',
  'changelog/',
  '.workflow/',
  '.agents/',
  '.claude/',
  '.opencode/',
  '.github/',
  'vendor/omp/',
  'scripts/omp-m0/',
];

/** Files the boundary owns by name; prefixes are directories, these are paths. */
export const BOUNDARY_FILES = new Set([
  'flake.nix',
  'flake.lock',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'README.md',
  'CHANGELOG.md',
  'SECURITY.md',
  'Dockerfile',
]);

const BOUNDARY_TOKENS = [
  '/api/agent/v1',
  'RuntimeAPIs',
  'runtimeFetch',
  'canonical-routes',
  '@openchamber/agent-contract',
  '@openchamber/agent-service',
];

/** Whether a path belongs to the OMP boundary or a standing exclusion. */
export const isBoundaryPath = (file) => (
  BOUNDARY_FILES.has(file) || BOUNDARY_PREFIXES.some((prefix) => file.startsWith(prefix))
);

const git = (root, args) => execFileSync('git', args, {
  cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
});

/** One `path -> blob` map for a commit, or an empty map when it has no tree. */
export const readTree = (root, ref) => {
  const lines = git(root, ['ls-tree', '-r', '-z', '--full-tree', ref]).split('\0');
  const tree = new Map();
  for (const line of lines) {
    if (!line) continue;
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    tree.set(line.slice(tab + 1), line.slice(0, tab).split(' ')[2]);
  }
  return tree;
};

/** The state of every path one side knows, given both sides' trees. */
export const diffTrees = (forkTree, upstreamTree) => {
  const paths = new Set([...forkTree.keys(), ...upstreamTree.keys()]);
  const states = new Map();
  for (const file of [...paths].sort()) {
    const theirs = upstreamTree.get(file);
    const ours = forkTree.get(file);
    if (ours === undefined) states.set(file, 'upstream-only');
    else if (theirs === undefined) states.set(file, 'fork-only');
    else states.set(file, ours === theirs ? 'identical' : 'fork-differs');
  }
  return states;
};

/** Blob ids of the paths a tree changed relative to the merge base. */
const changedPaths = (tree, baseTree) => {
  const changed = new Set();
  for (const [file, blob] of tree) {
    if (baseTree.get(file) !== blob) changed.add(file);
  }
  for (const file of baseTree.keys()) {
    if (!tree.has(file)) changed.add(file);
  }
  return changed;
};

/** Rows of a TSV file as records; the header names the columns. */
export const readTsv = (root, file) => {
  let text;
  try {
    text = readFileSync(path.join(root, file), 'utf8');
  } catch {
    return [];
  }
  const lines = text.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));
  if (lines.length === 0) return [];
  const header = lines[0].split('\t');
  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row = {};
    header.forEach((name, index) => { row[name.trim()] = (cells[index] ?? '').trim(); });
    return row;
  });
};

/** Headings of `.workflow/decisions.md`, which a ledger row cites by text. */
export const readDecisionHeadings = (root) => {
  let text;
  try {
    text = readFileSync(path.join(root, DECISIONS_FILE), 'utf8');
  } catch {
    return new Set();
  }
  return new Set(text.split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim()));
};

/** `fork-differs` files whose content carries an OMP boundary token. */
const boundaryToken = (root, ref, file) => {
  let text;
  try {
    text = git(root, ['show', `${ref}:${file}`]);
  } catch {
    return false;
  }
  return BOUNDARY_TOKENS.some((token) => text.includes(token));
};

/**
 * The full ledger: one record per path that differs from upstream, with its
 * state, class and the reason a class was chosen.
 */
export const buildLedger = ({ root = REPO_ROOT, upstream = UPSTREAM, forkRef = 'HEAD' } = {}) => {
  const base = git(root, ['merge-base', forkRef, upstream]).trim();
  const forkTree = readTree(root, forkRef);
  const upstreamTree = readTree(root, upstream);
  const baseTree = readTree(root, base);
  const states = diffTrees(forkTree, upstreamTree);
  const forkChanged = changedPaths(forkTree, baseTree);
  const upstreamChanged = changedPaths(upstreamTree, baseTree);
  const headings = readDecisionHeadings(root);
  const rows = readTsv(root, DELTAS_FILE);
  const rowByPath = new Map(rows.map((row) => [row.path, row]));

  const ledger = [];
  for (const [file, state] of states) {
    if (state === 'identical') continue;
    const row = rowByPath.get(file);
    let reason = null;
    if (isBoundaryPath(file)) reason = 'omp-boundary';
    else if (state !== 'fork-differs') reason = state === 'upstream-only' ? 'upstream-excluded' : 'fork-added';
    else if (row && headings.has(row.decision)) reason = 'decision';
    // A row's `omp-boundary` label documents the class, it does not create it:
    // the path itself has to carry the boundary (prefix, name, or content token).
    else if (boundaryToken(root, forkRef, file)) reason = 'omp-boundary';
    ledger.push({
      path: file,
      state,
      class: reason ?? 'unexplained',
      decision: row?.decision ?? '',
      note: row?.reason ?? '',
      movedBy: forkChanged.has(file) && upstreamChanged.has(file) ? 'both'
        : forkChanged.has(file) ? 'fork' : upstreamChanged.has(file) ? 'upstream' : 'base',
    });
  }
  return { base, ledger };
};

/** Rows that claim a state git does not show, or cite no known decision. */
export const contradictingRows = (ledger, rows, headings) => {
  const byPath = new Map(ledger.map((entry) => [entry.path, entry]));
  const problems = [];
  for (const row of rows) {
    const entry = byPath.get(row.path);
    if (!entry) {
      problems.push({ row, why: `git shows no ${row.state} path ${row.path}` });
      continue;
    }
    if (row.state && row.state !== entry.state) {
      problems.push({ row, why: `${row.path} is ${entry.state} in git, the row says ${row.state}` });
      continue;
    }
    if (row['class'] === 'omp-boundary' && entry.class !== 'omp-boundary') {
      problems.push({
        row,
        why: `${row.path} claims omp-boundary, but neither its path, its content nor a decision shows the boundary (class ${entry.class})`,
      });
      continue;
    }
    // A boundary row documents the path's class; only a `decision` row must
    // name the heading it rests on.
    const needsHeading = row.decision || row['class'] === 'decision';
    if (needsHeading && !headings.has(row.decision)) {
      problems.push({ row, why: `${row.path} cites no heading in ${DECISIONS_FILE}: ${row.decision}` });
    }
  }
  return problems;
};

/**
 * What lane 11 owns: the standing exclusions, the manifests, the lockfile and
 * the ledger itself. The later lanes read their paths from `merge-lanes.tsv`;
 * this one is fixed because it is the lane that writes that table.
 */
export const SCAFFOLD_PATHS = [
  ...BOUNDARY_FILES,
  ...BOUNDARY_PREFIXES,
  'package.json',
  'packages/ui/package.json',
  'packages/web/package.json',
  'packages/electron/package.json',
  'packages/mobile/package.json',
  'packages/sdk/package.json',
  'bun.lock',
  DELTAS_FILE,
  LANES_FILE,
  'scripts/upstream-drift.mjs',
  'scripts/upstream-drift.test.mjs',
];

/** Paths lane N owns; lane 11 is the scaffold lane, the rest come from the table. */
export const lanePaths = (root, lane) => (String(lane) === '11'
  ? SCAFFOLD_PATHS
  : readTsv(root, LANES_FILE)
    .filter((row) => String(row.lane) === String(lane))
    .map((row) => row.path));

/** `path:line` for every conflict marker under the given paths. */
export const findMarkers = ({ root = REPO_ROOT, paths = [] } = {}) => {
  const targets = paths.length > 0 ? paths : ['.'];
  const tracked = git(root, ['ls-files', '-z', '--', ...targets]).split('\0').filter(Boolean);
  const found = [];
  for (const file of tracked) {
    let text;
    try {
      text = readFileSync(path.join(root, file), 'utf8');
    } catch { continue; }
    // Skip the line scan only when the file cannot hold one of the delimiters.
    if (!text.includes('<<<<<<<') && !text.includes('=======') && !text.includes('>>>>>>>')) continue;
    text.split('\n').forEach((line, index) => {
      if (MARKER_LINE.test(line)) found.push(`${file}:${index + 1}: ${line}`);
    });
  }
  return found;
};

const parseArgs = (argv) => {
  const options = { markers: false, check: false, lane: null, paths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--markers') options.markers = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--lane') {
      index += 1;
      options.lane = argv[index];
    } else if (arg.startsWith('--lane=')) options.lane = arg.slice('--lane='.length);
    else options.paths.push(arg);
  }
  return options;
};

const main = () => {
  const options = parseArgs(process.argv.slice(2));
  const targets = options.paths.length > 0 ? options.paths
    : options.lane !== null ? lanePaths(REPO_ROOT, options.lane) : [];
  let failed = false;

  if (options.lane !== null && targets.length === 0) {
    console.error(`${LANES_FILE} has no paths for lane ${options.lane}`);
    process.exit(2);
  }

  if (options.markers || options.check) {
    const markers = findMarkers({ root: REPO_ROOT, paths: targets });
    if (markers.length > 0) {
      failed = true;
      console.error(`conflict markers (${markers.length}):`);
      for (const marker of markers) console.error(`  ${marker}`);
    } else {
      const scope = options.lane !== null ? `lane ${options.lane}` : targets.length > 0 ? targets.join(', ') : 'all files';
      console.log(`no conflict markers (${scope})`);
    }
  }

  const { base, ledger } = buildLedger({ root: REPO_ROOT });
  if (options.check) {
    const rows = readTsv(REPO_ROOT, DELTAS_FILE);
    const headings = readDecisionHeadings(REPO_ROOT);
    const contradictions = contradictingRows(ledger, rows, headings);
    if (contradictions.length > 0) {
      failed = true;
      console.error(`${DELTAS_FILE} rows that git contradicts (${contradictions.length}):`);
      for (const { row, why } of contradictions) console.error(`  ${why} (decision "${row.decision}")`);
    }
    const scope = targets.length > 0 ? new Set(targets) : null;
    const unexplained = ledger.filter((entry) => entry.class === 'unexplained'
      && (scope === null || [...scope].some((target) => entry.path === target || entry.path.startsWith(`${target}/`))));
    if (unexplained.length > 0) {
      failed = true;
      console.error(`paths that differ from ${UPSTREAM} with no OMP-boundary or decision reason (${unexplained.length}):`);
      for (const entry of unexplained.slice(0, 20)) console.error(`  ${entry.state}\t${entry.path}`);
      if (unexplained.length > 20) console.error(`  … ${unexplained.length - 20} more`);
    }
    if (!failed) console.log(`drift check passed: no conflict markers, no unexplained path, no contradicting row (base ${base.slice(0, 7)})`);
  } else if (!options.markers) {
    const counts = ledger.reduce((tally, entry) => {
      tally[entry.class] = (tally[entry.class] ?? 0) + 1;
      return tally;
    }, {});
    console.log(`upstream ${UPSTREAM}, merge base ${base.slice(0, 7)}, ${ledger.length} differing paths`);
    console.log(`  ${Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(', ')}`);
    for (const entry of ledger) console.log(`${entry.state}\t${entry.class}\t${entry.path}\t${entry.decision}`);
  }

  process.exit(failed ? 1 : 0);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
