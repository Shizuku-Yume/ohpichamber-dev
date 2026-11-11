#!/usr/bin/env node
// The repo-wide gate: the type check, then the upstream drift report with its
// conflict-marker scan.
//
// Later tasks add their class guardrails here, so `bun run check` is the one
// command a review runs. `bun check --all` reaches this script too, because
// Bun resolves a `check` script before its own type checker; the type step
// therefore asks for `--no-script` and otherwise forwards the caller's flags,
// so `bun check --all` still reports every type error repo-wide.
//
// A step failure does not stop the next step: one run reports every broken
// guardrail, and the exit code is non-zero when any of them failed.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bun = process.env.BUN_BINARY || 'bun';

// Flags that belong to the type check. Anything else is rejected, so a typo
// cannot quietly turn a passing run into a run that never checked anything.
const TYPE_CHECK_FLAGS = new Set(['-b', '--build', '--all', '--no-pretty', '--pretty']);

const argv = process.argv.slice(2);
const typeFlags = [];
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  const name = arg.split('=')[0];
  if (!TYPE_CHECK_FLAGS.has(name)) {
    console.error(`unknown argument: ${arg}`);
    console.error(`usage: bun run check [-b] [--all] [--no-pretty] [--pretty]`);
    process.exit(2);
  }
  typeFlags.push(arg);
}

const steps = [
  {
    name: 'type-check',
    command: bun,
    args: ['check', '--no-script', ...typeFlags],
  },
  {
    // `--check` verifies the ledger and the rows; `--markers` names the
    // conflict-marker scan as its own verdict in the same pass.
    name: 'upstream-drift',
    command: bun,
    args: ['scripts/upstream-drift.mjs', '--markers', '--check'],
  },
];

const failed = [];
for (const step of steps) {
  console.log(`\n[check] ${step.name}`);
  const result = spawnSync(step.command, step.args, { cwd: REPO_ROOT, stdio: 'inherit', env: process.env });
  if (result.error) failed.push(`${step.name} (${result.error.message})`);
  else if (result.status !== 0) failed.push(`${step.name} (exit ${result.status ?? 'unknown'})`);
}

console.log(`\n[check] ${steps.length - failed.length}/${steps.length} steps passed`);
if (failed.length > 0) {
  console.error(`[check] failed: ${failed.join(', ')}`);
  process.exit(1);
}
