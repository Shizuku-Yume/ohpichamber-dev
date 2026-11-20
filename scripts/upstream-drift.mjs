#!/usr/bin/env node
// The upstream disposition ledger, derived from git blobs instead of maintained
// by hand.
//
// Every path that the fork and pinned upstream baseline do not share
// byte-for-byte gets a state from the trees themselves:
//
//   identical      both sides hold the same blob
//   upstream-only  upstream has the path, the fork does not
//   fork-only      the fork has the path, upstream does not
//   fork-differs   both sides have the path with different blobs
//
// A `fork-differs` path also gets a class, so a review can tell a deliberate
// OMP-boundary fork from a standing exclusion from an unexplained one:
//
//   omp-boundary        the path belongs to the Canonical Client, the agent
//                       contract, the Agent Service, or the Host gateway
//   excluded            a standing exclusion: the merge keeps the fork's copy of
//                       a retired surface whatever upstream did
//   decision            `.workflow/upstream-deltas.tsv` names a
//                       `.workflow/decisions.md` heading for it
//   unexplained         none of the above
//
// A path only one side has needs no decision: upstream's additions were either
// adopted (and are then identical) or excluded by the standing-exclusion rule
// (`upstream-excluded`), and a fork-only path is the fork's own work
// (`fork-added`). Both are `excluded` or `omp-boundary` when either rule claims
// them.
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
//   bun scripts/upstream-drift.mjs --check --slice 32   the same check over repair
//                                                      slice 32's paths; a scoped
//                                                      check also reports how many
//                                                      unexplained paths it cannot see
//
// An argument the parser does not know is an error, never a path filter: a typo
// must not turn a failing check into a pass. Usage problems exit 2.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const UPSTREAM = 'cf18602cc77146f35e26e103dbee1ab8e218b663';
export const DELTAS_FILE = '.workflow/upstream-deltas.tsv';
export const LANES_FILE = '.workflow/research/ux-v270-omp-alignment/merge-lanes.tsv';
export const SLICES_FILE = '.workflow/research/ux-v270-omp-alignment/repair-slices.tsv';
export const DECISIONS_FILE = '.workflow/decisions.md';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// A conflict marker line: `<<<<<<< `, an exactly-`=======` line, or `>>>>>>> `.
// The delimiters are matched strictly, so ordinary text such as `<<<<<<<word`
// or an `=======` underline is not a marker.
const MARKER_LINE = /^(?:<<<<<<< |=======$|>>>>>>> )/u;

/**
 * Paths the merge keeps on the fork side because they are the OMP boundary:
 * the Canonical Client, the agent contract, the Agent Service, the Host
 * gateway, and the vendored OMP runtime that boundary is built on. Upstream's
 * changes to them never land (decision 2026-11-10, merge upstream with a real
 * git merge).
 */
export const BOUNDARY_PREFIXES = [
  'packages/agent-contract/',
  'packages/agent-service/',
  'packages/ui/src/api/',
  'packages/web/server/lib/host/',
  'vendor/omp/',
];

/**
 * Standing exclusions: the upstream surfaces the merge keeps on the fork side
 * whatever upstream did, because a recorded decision retired them (`packages/vscode`,
 * the OpenCode engine, folder trust, isolated-spaces code, `.github` collaboration/CI,
 * `changelog/`, `nix/`, and upstream agent guidance; decision 2026-11-10, merge
 * upstream OpenChamber with a real git merge; `specs/upstream-refresh.md`, "Excluded
 * on purpose").
 */
export const EXCLUDED_PREFIXES = [
  'packages/vscode/',
  'packages/web/server/lib/opencode/',
  'packages/ui/src/lib/opencode/',
  'packages/web/server/lib/opencode-trust/',
  'packages/web/server/lib/spaces/',
  'packages/ui/src/lib/spaces/',
  'packages/ui/src/components/session/spaces/',
  'nix/',
  'changelog/',
  '.agents/',
  '.claude/',
  '.opencode/',
  '.github/',
  '.workflow/',
  'scripts/omp-m0/',
];

/** Root files the exclusion rule keeps; prefixes are directories, these are paths. */
export const EXCLUDED_FILES = new Set([
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

/** Whether a path belongs to the OMP boundary. */
export const isBoundaryPath = (file) => (
  BOUNDARY_PREFIXES.some((prefix) => file.startsWith(prefix))
);

/** Whether a path is a standing exclusion the merge never adopts. */
export const isExcludedPath = (file) => (
  EXCLUDED_FILES.has(file) || EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix))
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
    else if (isExcludedPath(file)) reason = 'excluded';
    else if (state !== 'fork-differs') reason = state === 'upstream-only' ? 'upstream-excluded' : 'fork-added';
    else if (row && headings.has(row.decision)) reason = 'decision';
    // A row's label documents the class, it does not create it: the path itself
    // has to carry the boundary (prefix or content token).
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
    const claimed = row['class'];
    if ((claimed === 'omp-boundary' || claimed === 'excluded') && entry.class !== claimed) {
      problems.push({
        row,
        why: `${row.path} claims ${claimed}, but neither its path, its content nor a decision shows that class (class ${entry.class})`,
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
 * What lane 11 owns: the standing exclusions, the boundary trees, the manifests,
 * the lockfile and the ledger itself. The later lanes read their paths from
 * `merge-lanes.tsv`; this one is fixed because it is the lane that writes those
 * tables.
 */
export const SCAFFOLD_PATHS = [
  ...EXCLUDED_FILES,
  ...EXCLUDED_PREFIXES,
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
  SLICES_FILE,
  'scripts/upstream-drift.mjs',
  'scripts/upstream-drift.test.mjs',
];

/** Paths one lane owns; lane 11 is the scaffold lane, the rest come from the table. */
export const lanePaths = (root, lane) => (String(lane) === '11'
  ? SCAFFOLD_PATHS
  : readTsv(root, LANES_FILE)
    .filter((row) => String(row.lane) === String(lane))
    .map((row) => row.path));

/** Paths one repair slice owns, from `repair-slices.tsv`. */
export const slicePaths = (root, slice) => readTsv(root, SLICES_FILE)
  .filter((row) => String(row.slice) === String(slice))
  .map((row) => row.path);

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

const USAGE = `Usage:
  bun scripts/upstream-drift.mjs                      print the ledger
  bun scripts/upstream-drift.mjs --markers            fail on conflict markers
  bun scripts/upstream-drift.mjs --markers --lane 14  markers in lane 14's paths
  bun scripts/upstream-drift.mjs --markers <paths…>   markers in those paths
  bun scripts/upstream-drift.mjs --check              fail on conflict markers, on
                                                      any unexplained path, and on
                                                      ledger rows that contradict git
  bun scripts/upstream-drift.mjs --check --slice 32   the same check over repair
                                                      slice 32's paths; a scoped
                                                      check also reports how many
                                                      unexplained paths it cannot see

Paths, --lane and --slice are alternative scopes. An argument the parser does not
know is a usage error (exit 2), never a path filter.`;

class UsageError extends Error { }

const parseArgs = (argv) => {
  const options = { markers: false, check: false, lane: null, slice: null, paths: [] };
  const takeValue = (name, index) => {
    const value = argv[index];
    if (value === undefined || value === '' || value.startsWith('-')) {
      throw new UsageError(`${name} needs a value`);
    }
    return value;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--') {
      options.paths.push(...argv.slice(index + 1));
      break;
    }
    if (arg === '--markers') options.markers = true;
    else if (arg === '--check') options.check = true;
    else if (arg === '--lane') {
      index += 1;
      options.lane = takeValue('--lane', index);
    } else if (arg.startsWith('--lane=')) options.lane = arg.slice('--lane='.length);
    else if (arg === '--slice') {
      index += 1;
      options.slice = takeValue('--slice', index);
    } else if (arg.startsWith('--slice=')) options.slice = arg.slice('--slice='.length);
    else if (arg.startsWith('-')) throw new UsageError(`unknown argument: ${arg}`);
    else options.paths.push(arg);
  }
  if (options.lane !== null && options.lane === '') throw new UsageError('--lane needs a value');
  if (options.slice !== null && options.slice === '') throw new UsageError('--slice needs a value');
  const scopes = [options.paths.length > 0, options.lane !== null, options.slice !== null].filter(Boolean);
  if (scopes.length > 1) throw new UsageError('pass one scope: paths, --lane or --slice');
  return options;
};

/** Paths the options scope the run to, or `[]` for the whole repository. */
const scopedTargets = (options, root) => {
  if (options.paths.length > 0) {
    // A path scope that matches no tracked file is a typo, not an empty pass.
    const tracked = git(root, ['ls-files', '-z', '--', ...options.paths]).split('\0').filter(Boolean);
    if (tracked.length === 0) throw new UsageError(`no tracked file under: ${options.paths.join(', ')}`);
    return options.paths;
  }
  if (options.lane !== null) {
    const paths = lanePaths(root, options.lane);
    if (paths.length === 0) throw new UsageError(`${LANES_FILE} has no paths for lane ${options.lane}`);
    return paths;
  }
  if (options.slice !== null) {
    const paths = slicePaths(root, options.slice);
    if (paths.length === 0) throw new UsageError(`${SLICES_FILE} has no paths for slice ${options.slice}`);
    return paths;
  }
  return [];
};

const scopeName = (options) => {
  if (options.paths.length > 0) return options.paths.join(', ');
  if (options.lane !== null) return `lane ${options.lane}`;
  if (options.slice !== null) return `slice ${options.slice}`;
  return 'all files';
};

/** A scope target without its trailing slash, so `dir/` and `dir` scope alike. */
const normalizeTarget = (target) => target.replace(/\/+$/u, '');

const inScope = (targets, file) => targets.some((target) => {
  const scope = normalizeTarget(target);
  // `.` and `/` are the repository root, which scopes every path.
  if (scope === '' || scope === '.') return true;
  return file === scope || file.startsWith(`${scope}/`);
});

/**
 * What a scoped run owes and what it leaves unchecked. With no targets every
 * path is in scope; with targets `outside` counts the unexplained paths the
 * scope cannot see, so a scoped pass is never read as a global one.
 */
export const scopeReport = (ledger, targets = []) => {
  const owed = targets.length > 0 ? ledger.filter((entry) => inScope(targets, entry.path)) : ledger;
  const unexplained = owed.filter((entry) => entry.class === 'unexplained');
  const outside = targets.length > 0
    ? ledger.filter((entry) => entry.class === 'unexplained' && !inScope(targets, entry.path)).length
    : 0;
  return { owed, unexplained, outside };
};

const main = () => {
  const exitCode = runCli({ root: REPO_ROOT, argv: process.argv.slice(2), log: console.log, error: console.error });
  process.exit(exitCode);
};

/**
 * The command, with the repository root and output sinks supplied so a test can
 * run it against a fixture. Returns the exit code and never exits the process:
 * usage errors are 2, a failed check is 1, a pass is 0.
 */
export const runCli = ({ root = REPO_ROOT, upstream = UPSTREAM, argv = [], log = () => { }, error = () => { } } = {}) => {
  let options;
  let targets;
  try {
    options = parseArgs(argv);
    targets = scopedTargets(options, root);
  } catch (exception) {
    if (!(exception instanceof UsageError)) throw exception;
    error(exception.message);
    error(USAGE);
    return 2;
  }
  let failed = false;

  if (options.markers || options.check) {
    const markers = findMarkers({ root, paths: targets });
    if (markers.length > 0) {
      failed = true;
      error(`conflict markers (${markers.length}):`);
      for (const marker of markers) error(`  ${marker}`);
    } else {
      log(`no conflict markers (${scopeName(options)})`);
    }
  }

  const { base, ledger } = buildLedger({ root, upstream });
  if (options.check) {
    const rows = readTsv(root, DELTAS_FILE);
    const headings = readDecisionHeadings(root);
    const contradictions = contradictingRows(ledger, rows, headings);
    if (contradictions.length > 0) {
      failed = true;
      error(`${DELTAS_FILE} rows that git contradicts (${contradictions.length}):`);
      for (const { row, why } of contradictions) error(`  ${why} (decision "${row.decision}")`);
    }
    // A scoped check only owes the scope; everything outside it is reported as a
    // count so a scoped pass cannot be read as a global pass.
    const { unexplained, outside } = scopeReport(ledger, targets);
    if (unexplained.length > 0) {
      failed = true;
      error(`paths that differ from ${upstream} with no boundary, exclusion or decision reason, in ${scopeName(options)} (${unexplained.length}):`);
      for (const entry of unexplained.slice(0, 20)) error(`  ${entry.state}\t${entry.path}`);
      if (unexplained.length > 20) error(`  … ${unexplained.length - 20} more`);
    }
    if (targets.length > 0) {
      log(`outside ${scopeName(options)}: ${outside} unexplained path${outside === 1 ? '' : 's'} not checked`);
    }
    if (!failed) log(`drift check passed: no conflict markers, no unexplained path in ${scopeName(options)}, no contradicting row (base ${base.slice(0, 7)})`);
  } else if (!options.markers) {
    const { owed, outside } = scopeReport(ledger, targets);
    const counts = owed.reduce((tally, entry) => {
      tally[entry.class] = (tally[entry.class] ?? 0) + 1;
      return tally;
    }, {});
    log(`upstream ${upstream}, merge base ${base.slice(0, 7)}, ${owed.length} differing paths in ${scopeName(options)}`);
    log(`  ${Object.entries(counts).map(([name, count]) => `${name}: ${count}`).join(', ')}`);
    for (const entry of owed) log(`${entry.state}\t${entry.class}\t${entry.path}\t${entry.decision}`);
    if (targets.length > 0) {
      log(`outside ${scopeName(options)}: ${outside} unexplained path${outside === 1 ? '' : 's'} not listed`);
    }
  }

  return failed ? 1 : 0;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
