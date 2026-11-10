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
  readDecisionHeadings,
  readTree,
  readTsv,
  SCAFFOLD_PATHS,
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

check('the OMP boundary and the decisions file classify drift', () => {
  const { base, ledger } = buildLedger({ root, upstream, forkRef: 'HEAD' });
  assert.equal(base, execFileSync('git', ['merge-base', 'HEAD', upstream], { cwd: root, encoding: 'utf8' }).trim());
  const byPath = new Map(ledger.map((entry) => [entry.path, entry]));
  assert.equal(byPath.get('packages/ui/src/api/client.ts').class, 'omp-boundary');
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

check('a single-sided path is classed by which side has it, unless the boundary claims it', () => {
  assert.equal(isBoundaryPath('vendor/omp/x/GUIDE.md'), true);
  assert.equal(isBoundaryPath('packages/docs/content/docs/chat-input.mdx'), false);
});

check('boundary detection is by prefix, by file and by nothing else', () => {
  assert.equal(isBoundaryPath('packages/agent-contract/src/index.ts'), true);
  assert.equal(isBoundaryPath('packages/ui/src/api/client.ts'), true);
  assert.equal(isBoundaryPath('.workflow/specs/x.md'), true);
  assert.equal(isBoundaryPath('Dockerfile'), true);
  assert.equal(isBoundaryPath('packages/ui/src/App.tsx'), false);
});

check('lane 11 scans every boundary file and prefix, not a second hand-kept list', () => {
  for (const file of ['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'README.md', 'CHANGELOG.md', 'SECURITY.md', 'Dockerfile', 'flake.nix', 'flake.lock']) {
    assert.equal(isBoundaryPath(file), true, file);
    assert.equal(SCAFFOLD_PATHS.includes(file), true, file);
  }
  assert.equal(SCAFFOLD_PATHS.includes('.workflow/'), true);
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
  ];
  const problems = contradictingRows(ledger, rows, headings);
  assert.equal(problems.length, 4);
  assert.match(problems[0].why, /shared.txt is fork-differs in git/);
  assert.match(problems[1].why, /cites no heading/);
  assert.match(problems[2].why, /git shows no fork-only path missing.txt/);
  assert.match(problems[3].why, /claims omp-boundary/);
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
  rmSync(empty, { recursive: true, force: true });
});

rmSync(root, { recursive: true, force: true });
console.log('upstream-drift: all checks passed');
