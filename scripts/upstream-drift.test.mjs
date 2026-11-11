#!/usr/bin/env node
// `bun scripts/upstream-drift.test.mjs` — plain asserts, no test runner, so the
// gate runs the same way from a terminal and from the task's Check.
//
// The fixture is a real repository: three commits on one branch, an upstream
// branch whose merge base is the second commit, and one path per state. The
// ledger reads git, so git is what the test exercises.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  buildLedger,
  contradictingRows,
  diffTrees,
  findMarkers,
  isBoundaryPath,
  isExcludedPath,
  lanePaths,
  readDecisionHeadings,
  readTree,
  readTsv,
  runCli,
  SCAFFOLD_PATHS,
  slicePaths,
} from './upstream-drift.mjs';

const write = (root, file, content) => {
  const absolute = path.join(root, file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
};

const commit = (root, message) => {
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', message], { cwd: root });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
};

const makeFixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'upstream-drift-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root });
  write(root, 'README.md', 'base\n');
  write(root, 'shared.txt', 'base\n');
  write(root, 'LICENSE', 'license\n');
  write(root, 'packages/ui/src/App.tsx', 'base\n');
  write(root, 'packages/sdk/src/manifest.ts', 'base\n');
  const base = commit(root, 'base');

  // The base the fork and upstream share is this commit.
  write(root, 'GUIDE.md', 'fork readme\n');
  write(root, 'fork-only.txt', 'fork\n');
  write(root, 'packages/ui/src/App.tsx', 'fork app\n');
  write(root, 'packages/ui/src/api/client.ts', 'fork api\n');
  write(root, '.workflow/decisions.md', '# Decisions\n\n## 2026-01-01 - Keep the fork readme\n\nWhy.\n');
  write(root, '.workflow/upstream-deltas.tsv', [
    'path\tstate\tclass\tdecision\treason',
    'GUIDE.md\tfork-differs\tdecision\t2026-01-01 - Keep the fork readme\tFork wording',
  ].join('\n') + '\n');
  // A standing exclusion and an OMP-boundary path: both differ from upstream and
  // neither is unexplained.
  write(root, '.github/workflows/ci.yml', 'fork ci\n');
  write(root, 'packages/web/server/lib/host/gateway.ts', 'fork gateway\n');
  write(root, '.workflow/research/ux-v270-omp-alignment/merge-lanes.tsv', [
    '# Conflicted paths by merge lane.',
    'path\tlane\tclass',
    'packages/sdk/src/manifest.ts\t12\t',
    'shared.txt\t12\t',
  ].join('\n') + '\n');
  write(root, '.workflow/research/ux-v270-omp-alignment/repair-slices.tsv', [
    'path\tslice\tsource',
    'packages/sdk/src/manifest.ts\t35\tunexplained',
    'shared.txt\t35\tunexplained',
  ].join('\n') + '\n');
  const fork = commit(root, 'fork');

  execFileSync('git', ['checkout', '-q', '-b', 'upstream', base], { cwd: root });
  write(root, 'GUIDE.md', 'upstream readme\n');
  write(root, 'upstream-only.txt', 'upstream\n');
  write(root, 'shared.txt', 'upstream\n');
  write(root, 'packages/sdk/src/manifest.ts', 'upstream manifest\n');
  const upstream = commit(root, 'upstream');

  execFileSync('git', ['checkout', '-q', 'main'], { cwd: root });
  write(root, 'packages/ui/src/conflicted.ts', [
    '<<<<<<< HEAD',
    'fork',
    '=======',
    'upstream',
    '>>>>>>> upstream',
  ].join('\n') + '\n');
  // Delimiter-shaped text that is not a conflict marker.
  write(root, 'packages/ui/src/notes.md', [
    '<<<<<<<word',
    '======= not a delimiter',
    '>>>>>>>word',
    '========',
    'Title',
    '=====',
  ].join('\n') + '\n');
  commit(root, 'scaffold');
  return { root, fork, upstream };
};

const check = (name, run) => {
  try {
    run();
    console.log(`ok  ${name}`);
  } catch (error) {
    console.error(`not ok  ${name}`);
    console.error(error.message.split('\n').map((line) => `  ${line}`).join('\n'));
    throw error;
  }
};

const fixture = makeFixture();
const { root, upstream } = fixture;

check('a tree maps every path to its blob', () => {
  const tree = readTree(root, upstream);
  assert.equal(tree.get('GUIDE.md').length, 40);
  assert.ok(tree.has('packages/sdk/src/manifest.ts'));
});

check('every differing path gets one state, identical paths get none', () => {
  const forkTree = readTree(root, 'HEAD');
  const upstreamTree = readTree(root, upstream);
  const states = diffTrees(forkTree, upstreamTree);
  assert.equal(states.get('GUIDE.md'), 'fork-differs');
  assert.equal(states.get('shared.txt'), 'fork-differs');
  assert.equal(states.get('fork-only.txt'), 'fork-only');
  assert.equal(states.get('upstream-only.txt'), 'upstream-only');
  assert.equal(states.get('packages/sdk/src/manifest.ts'), 'fork-differs');
  // `LICENSE` is untouched on both sides; `identical` is a state of the union but
  // never a ledger row.
  assert.equal(states.get('LICENSE'), 'identical');
  assert.equal(states.has('packages/ui/src/App.tsx'), true);
});

check('the OMP boundary, the exclusions and the decisions file classify drift', () => {
  const { base, ledger } = buildLedger({ root, upstream, forkRef: 'HEAD' });
  assert.equal(base, execFileSync('git', ['merge-base', 'HEAD', upstream], { cwd: root, encoding: 'utf8' }).trim());
  const byPath = new Map(ledger.map((entry) => [entry.path, entry]));
  assert.equal(byPath.get('packages/ui/src/api/client.ts').class, 'omp-boundary');
  assert.equal(byPath.get('packages/web/server/lib/host/gateway.ts').class, 'omp-boundary');
  assert.equal(byPath.get('.github/workflows/ci.yml').class, 'excluded');
  assert.equal(byPath.get('GUIDE.md').class, 'decision');
  assert.equal(byPath.get('shared.txt').class, 'unexplained');
  assert.equal(byPath.get('fork-only.txt').class, 'fork-added');
  assert.equal(byPath.get('upstream-only.txt').class, 'upstream-excluded');
  assert.equal(byPath.get('packages/sdk/src/manifest.ts').class, 'unexplained');
  // A path the fork left alone and upstream changed still moved by upstream.
  assert.equal(byPath.get('shared.txt').movedBy, 'upstream');
  assert.equal(byPath.get('GUIDE.md').movedBy, 'both');
  assert.equal(byPath.get('fork-only.txt').movedBy, 'fork');
  assert.equal(ledger.some((entry) => entry.state === 'identical'), false);
});

check('the boundary and the exclusions are separate classes', () => {
  assert.equal(isBoundaryPath('vendor/omp/x/GUIDE.md'), true);
  assert.equal(isBoundaryPath('packages/docs/content/docs/chat-input.mdx'), false);
  assert.equal(isBoundaryPath('.workflow/specs/x.md'), false);
  assert.equal(isBoundaryPath('.agents/skills/x/SKILL.md'), false);
  assert.equal(isBoundaryPath('nix/module.nix'), false);
  assert.equal(isBoundaryPath('Dockerfile'), false);
  assert.equal(isExcludedPath('.workflow/specs/x.md'), true);
  assert.equal(isExcludedPath('.agents/skills/x/SKILL.md'), true);
  assert.equal(isExcludedPath('.github/workflows/ci.yml'), true);
  assert.equal(isExcludedPath('nix/module.nix'), true);
  assert.equal(isExcludedPath('changelog/1.0.1.md'), true);
  assert.equal(isExcludedPath('packages/vscode/package.json'), true);
  assert.equal(isExcludedPath('Dockerfile'), true);
  assert.equal(isExcludedPath('flake.nix'), true);
  assert.equal(isExcludedPath('packages/web/server/lib/host/x.js'), false);
  assert.equal(isExcludedPath('packages/ui/src/App.tsx'), false);
});

check('boundary detection is by prefix and by nothing else', () => {
  assert.equal(isBoundaryPath('packages/agent-contract/src/index.ts'), true);
  assert.equal(isBoundaryPath('packages/ui/src/api/client.ts'), true);
  assert.equal(isBoundaryPath('packages/web/server/lib/host/x.js'), true);
  assert.equal(isBoundaryPath('packages/ui/src/App.tsx'), false);
});

check('lane 11 scans every excluded file and prefix, not a second hand-kept list', () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'README.md', 'CHANGELOG.md', 'SECURITY.md', 'Dockerfile', 'flake.nix', 'flake.lock']) {
    assert.equal(isExcludedPath(file), true, file);
    assert.equal(SCAFFOLD_PATHS.includes(file), true, file);
  }
  assert.equal(SCAFFOLD_PATHS.includes('.workflow/'), true);
  assert.equal(SCAFFOLD_PATHS.includes('.agents/'), true);
  assert.equal(SCAFFOLD_PATHS.includes('packages/vscode/'), true);
  assert.equal(SCAFFOLD_PATHS.includes('packages/web/server/lib/host/'), true);
});

check('a ledger row that misstates git is reported', () => {
  const { ledger } = buildLedger({ root, upstream, forkRef: 'HEAD' });
  const headings = readDecisionHeadings(root);
  const rows = [
    { path: 'GUIDE.md', state: 'fork-differs', decision: '2026-01-01 - Keep the fork readme' },
    { path: 'shared.txt', state: 'fork-only', decision: '2026-01-01 - Keep the fork readme' },
    { path: 'GUIDE.md', state: 'fork-differs', decision: '2026-01-01 - No such decision' },
    { path: 'missing.txt', state: 'fork-only', decision: '2026-01-01 - Keep the fork readme' },
    // A label is a claim, not evidence: neither the path nor its content is the
    // boundary.
    { path: 'packages/sdk/src/manifest.ts', state: 'fork-differs', 'class': 'omp-boundary', decision: '' },
    // The same rule for an exclusion label on a path the merge does not exclude.
    { path: 'packages/sdk/src/manifest.ts', state: 'fork-differs', 'class': 'excluded', decision: '' },
  ];
  const problems = contradictingRows(ledger, rows, headings);
  assert.equal(problems.length, 5);
  assert.match(problems[0].why, /shared.txt is fork-differs in git/);
  assert.match(problems[1].why, /cites no heading/);
  assert.match(problems[2].why, /git shows no fork-only path missing.txt/);
  assert.match(problems[3].why, /claims omp-boundary/);
  assert.match(problems[4].why, /claims excluded/);
});

check('a clean ledger contradicts nothing', () => {
  const { ledger } = buildLedger({ root, upstream, forkRef: 'HEAD' });
  const headings = readDecisionHeadings(root);
  const rows = readTsv(root, '.workflow/upstream-deltas.tsv');
  assert.deepEqual(contradictingRows(ledger, rows, headings), []);
});

check('markers are found by line, under the paths asked for', () => {
  const all = findMarkers({ root });
  assert.deepEqual(all, [
    'packages/ui/src/conflicted.ts:1: <<<<<<< HEAD',
    'packages/ui/src/conflicted.ts:3: =======',
    'packages/ui/src/conflicted.ts:5: >>>>>>> upstream',
  ]);
  assert.equal(findMarkers({ root, paths: ['packages/sdk'] }).length, 0);
  // Delimiter-shaped lines that are not conflict markers are not reported.
  assert.equal(findMarkers({ root, paths: ['packages/ui/src/notes.md'] }).length, 0);
  write(root, 'packages/ui/src/conflicted.ts', 'resolved\n');
  commit(root, 'resolve');
  assert.equal(findMarkers({ root }).length, 0);
});

check('a repository without the ledger files yields empty tables', () => {
  const empty = mkdtempSync(path.join(tmpdir(), 'upstream-drift-empty-'));
  assert.deepEqual(readTsv(empty, '.workflow/upstream-deltas.tsv'), []);
  assert.deepEqual([...readDecisionHeadings(empty)], []);
  assert.deepEqual(slicePaths(empty, 31), []);
  rmSync(empty, { recursive: true, force: true });
});

/** Run the CLI against the fixture and collect what it printed. */
const cli = (argv) => {
  const lines = [];
  const errors = [];
  const code = runCli({
    root,
    upstream,
    argv,
    log: (line) => lines.push(line),
    error: (line) => errors.push(line),
  });
  return { code, lines, errors, printed: [...lines, ...errors].join('\n') };
};

check('an argument the parser does not know exits 2 with usage instead of becoming a path', () => {
  const unknown = cli(['--check', '--json']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.printed, /unknown argument: --json/);
  assert.match(unknown.printed, /^Usage:/m);
  // A misspelled flag is the failure this guards: as a path filter it selected
  // nothing and the check printed "passed".
  const typo = cli(['--chek']);
  assert.equal(typo.code, 2);
  assert.match(typo.printed, /unknown argument: --chek/);
  // A flag that needs a value cannot swallow the next flag.
  assert.equal(cli(['--slice', '--check']).code, 2);
  assert.equal(cli(['--slice', '99']).code, 2);
  assert.match(cli(['--slice', '99']).printed, /repair-slices\.tsv has no paths for slice 99/);
  // A path scope that matches nothing is a typo, not a vacuous pass.
  assert.equal(cli(['--check', 'no-such-path']).code, 2);
  assert.match(cli(['--check', 'no-such-path']).printed, /no tracked file under: no-such-path/);
});

check('a scoped check reports how many unexplained paths it cannot see', () => {
  const scoped = cli(['--check', 'packages/sdk']);
  assert.equal(scoped.code, 1);
  assert.match(scoped.printed, /no conflict markers \(packages\/sdk\)/);
  assert.match(scoped.printed, /in packages\/sdk \(1\)/);
  assert.match(scoped.printed, /packages\/sdk\/src\/manifest\.ts/);
  // Two unexplained paths remain outside: `shared.txt` and `App.tsx`.
  assert.match(scoped.printed, /outside packages\/sdk: 2 unexplained paths not checked/);

  // A trailing slash scopes the same directory, it does not match nothing.
  const slash = cli(['--check', 'packages/sdk/']);
  assert.equal(slash.code, 1);
  assert.match(slash.printed, /in packages\/sdk\/ \(1\)/);
  assert.match(slash.printed, /outside packages\/sdk\/: 2 unexplained paths not checked/);

  // A scope whose own paths are all explained passes and still names the rest.
  const clean = cli(['--check', 'packages/ui/src/api']);
  assert.equal(clean.code, 0);
  assert.match(clean.printed, /drift check passed: no conflict markers, no unexplained path in packages\/ui\/src\/api/);
  assert.match(clean.printed, /outside packages\/ui\/src\/api: 3 unexplained paths not checked/);

  // A whole-repository check has no outside, and fails.
  const global = cli(['--check']);
  assert.equal(global.code, 1);
  assert.match(global.printed, /no conflict markers \(all files\)/);
  assert.match(global.printed, /in all files \(3\)/);
  assert.equal(global.lines.some((line) => line.startsWith('outside')), false);
});

check('--slice reads the repair slice table', () => {
  assert.deepEqual(slicePaths(root, 35), ['packages/sdk/src/manifest.ts', 'shared.txt']);
  assert.deepEqual(slicePaths(root, 31), []);
  const scoped = cli(['--check', '--slice', '35']);
  assert.equal(scoped.code, 1);
  assert.match(scoped.printed, /no conflict markers \(slice 35\)/);
  assert.match(scoped.printed, /in slice 35 \(2\)/);
  assert.match(scoped.printed, /outside slice 35: 1 unexplained path not checked/);
  // Paths, lanes and slices are alternative scopes, not additive filters.
  assert.equal(cli(['--check', 'packages/sdk', '--slice', '35']).code, 2);
  assert.match(cli(['--check', 'packages/sdk', '--slice', '35']).printed, /pass one scope/);
});

check('--lane reads the merge lane table', () => {
  assert.deepEqual(lanePaths(root, '12'), ['packages/sdk/src/manifest.ts', 'shared.txt']);
  assert.equal(lanePaths(root, '11').includes('.workflow/'), true);
});

rmSync(root, { recursive: true, force: true });
console.log('upstream-drift: all checks passed');
