import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { redactDiagnostic } from '../index.ts';
import { WorkerRegistry, type WorkerDiagnostic } from './workers.ts';

const fixture = (lines: string[]) => [
  ...lines.map(line => `process.stderr.write(${JSON.stringify(`${line}\n`)});`),
  "process.on('message', message => {",
  "  if (message?.type === 'bootstrap') process.send({ type: 'ready', workerGeneration: message.workerGeneration });",
  "  else if (message?.type === 'stop') process.exit(0);",
  "});",
  "process.on('disconnect', () => process.exit(0));",
].join('\n');

const runFixture = async (lines: string[]) => {
  const root = await mkdtemp(join(tmpdir(), 'worker-diagnostics-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd);
  await mkdir(agentDirectory);
  await writeFile(join(root, 'worker-fixture.mjs'), fixture(lines));
  const diagnostics: WorkerDiagnostic[] = [];
  const registry = new WorkerRegistry({
    workerEntrypoint: join(root, 'worker-fixture.mjs'),
    workerRuntime: process.execPath,
    startupTimeoutMs: 10_000,
    stopTimeoutMs: 2_000,
    onDiagnostic: entry => diagnostics.push(entry),
  });
  try {
    await registry.start({ rootSessionId: 'root-session', projectId: 'project', workspaceId: 'workspace', cwd, agentDirectory });
    await new Promise(resolve => setTimeout(resolve, 60));
    return diagnostics;
  } finally {
    try { await registry.close(); } finally { await rm(root, { recursive: true, force: true }); }
  }
};

test('a worker diagnostic keeps its level, root and generation while dropping free text', async () => {
  const diagnostics = await runFixture([
    JSON.stringify({ type: 'openchamber.diagnostic', level: 'warn', code: 'TEST_SENTINEL', secret: 'sentinel-secret-value' }),
    'PROMPT_SENTINEL this free-form stderr must never be logged',
  ]);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toMatchObject({ level: 'warn', rootSessionId: 'root-session', message: 'TEST_SENTINEL' });
  expect(diagnostics[0].workerGeneration.length).toBeGreaterThan(0);
  expect(JSON.stringify(diagnostics)).not.toContain('sentinel-secret-value');
  expect(JSON.stringify(diagnostics)).not.toContain('PROMPT_SENTINEL');
  expect(redactDiagnostic(diagnostics[0].message)).toBe('TEST_SENTINEL');
}, 15_000);

test('an MCP runtime failure is normalized to its code without free text', async () => {
  const diagnostics = await runFixture([
    JSON.stringify({ type: 'mcp.runtime.failure', error: { code: 'MCP_STARTUP_FAILED', message: 'secret prompt text' } }),
  ]);
  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toMatchObject({ level: 'error', message: 'MCP runtime failure (MCP_STARTUP_FAILED)' });
  expect(JSON.stringify(diagnostics)).not.toContain('secret prompt text');
}, 15_000);

test('a worker initialization failure is reported by code only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-init-diagnostics-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd);
  await mkdir(agentDirectory);
  const source = [
    "process.on('message', message => {",
    "  if (message?.type === 'bootstrap') process.send({ type: 'error', workerGeneration: message.workerGeneration, code: 'MCP_APPLY_FAILED' });",
    "});",
  ].join('\n');
  await writeFile(join(root, 'worker-fixture.mjs'), source);
  const diagnostics: WorkerDiagnostic[] = [];
  const registry = new WorkerRegistry({
    workerEntrypoint: join(root, 'worker-fixture.mjs'),
    workerRuntime: process.execPath,
    startupTimeoutMs: 5_000,
    stopTimeoutMs: 2_000,
    onDiagnostic: entry => diagnostics.push(entry),
  });
  try {
    await expect(registry.start({ rootSessionId: 'root-init', projectId: 'project', workspaceId: 'workspace', cwd, agentDirectory })).rejects.toBeDefined();
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({ level: 'error', rootSessionId: 'root-init', message: 'Worker initialization failed (MCP_APPLY_FAILED)' });
  } finally {
    try { await registry.close(); } finally { await rm(root, { recursive: true, force: true }); }
  }
}, 15_000);


test('a worker initialization refusal keeps the status the worker reported', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-init-refusal-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd);
  await mkdir(agentDirectory);
  const source = [
    "process.on('message', message => {",
    "  if (message?.type === 'bootstrap') process.send({ type: 'error', workerGeneration: message.workerGeneration, code: 'MODEL_UNAVAILABLE', status: 422 });",
    "});",
  ].join('\n');
  await writeFile(join(root, 'worker-fixture.mjs'), source);
  const registry = new WorkerRegistry({ workerEntrypoint: join(root, 'worker-fixture.mjs'), workerRuntime: process.execPath, startupTimeoutMs: 5_000, stopTimeoutMs: 2_000 });
  try {
    await expect(registry.start({ rootSessionId: 'root-refused', projectId: 'project', workspaceId: 'workspace', cwd, agentDirectory }))
      .rejects.toMatchObject({ status: 422, code: 'MODEL_UNAVAILABLE' });
  } finally {
    try { await registry.close(); } finally { await rm(root, { recursive: true, force: true }); }
  }
}, 15_000);

test('a huge no-newline worker stderr chunk is dropped without affecting readiness', async () => {
  const diagnostics = await runFixture(['x'.repeat(20_000)]);
  expect(diagnostics).toEqual([]);
}, 15_000);
