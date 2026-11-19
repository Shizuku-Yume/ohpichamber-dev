import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { WorkerRegistry } from './workers.ts';
import { WorkerBootstrapMessageSchema } from '../protocol.ts';

const sentinels = {
  OPENCHAMBER_UI_PASSWORD: 'ui-password-sentinel-1f3a',
  OPENCHAMBER_UNRELATED_TOKEN: 'unrelated-token-sentinel-9c2b',
  OHPICHAMBER_INTERNAL_SECRET: 'internal-secret-sentinel-4d7e',
  OPENAI_API_KEY: 'provider-key-sentinel-8a1c',
};

test('replacement worker bootstraps retain repeated promotion lineage without foreign roots', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-promotion-'));
  const workerEntrypoint = join(root, 'worker.mjs');
  const report = join(root, 'bootstrap.json');
  await writeFile(workerEntrypoint, [
    "import { writeFileSync } from 'node:fs';",
    "process.on('message', message => {",
    "  if (message.type === 'bootstrap') {",
    "    writeFileSync(process.env.BOOTSTRAP_REPORT, JSON.stringify(message));",
    "    process.send({ type: 'ready', workerGeneration: message.workerGeneration });",
    "  } else if (message.type === 'stop') process.exit(0);",
    "});",
    "process.on('disconnect', () => process.exit(0));",
  ].join('\n'));
  const registry = new WorkerRegistry({ workerEntrypoint, startupTimeoutMs: 10_000, stopTimeoutMs: 2_000 });
  const input = { rootSessionId: 'a', workspaceId: 'workspace', projectId: 'project', cwd: root, agentDirectory: root, env: { BOOTSTRAP_REPORT: report } };
  const observed = async () => WorkerBootstrapMessageSchema.parse(JSON.parse(await readFile(report, 'utf8')));
  try {
    await registry.start(input);
    expect((await observed()).retiredSessionIds).toBeUndefined();
    registry.rekey('a', 'b');
    registry.rekey('b', 'c');
    await registry.stop('c');
    await registry.start({ ...input, rootSessionId: 'c' });
    expect((await observed()).retiredSessionIds).toEqual(['a', 'b']);
    await registry.stop('c');
    await registry.start({ ...input, rootSessionId: 'foreign' });
    expect((await observed()).retiredSessionIds).toBeUndefined();
  } finally {
    await registry.close();
    await rm(root, { recursive: true, force: true });
  }
});

// A real worker process runs `env` through a shell-equivalent lookup and writes
// what a model-invoked shell would see. The test observes that output, not the
// spawn options we passed in.
const FIXTURE = [
  "import { spawnSync } from 'node:child_process';",
  "import { writeFileSync } from 'node:fs';",
  "const report = process.env.WORKER_ENV_REPORT;",
  "process.on('message', message => {",
  "  if (message?.type === 'bootstrap') {",
  "    const environment = process.platform === 'win32'",
  "      ? Object.entries(process.env).map(([key, value]) => key + '=' + value).join('\\n')",
  "      : spawnSync('env', [], { encoding: 'utf8' }).stdout ?? '';",
  "    writeFileSync(report, environment);",
  "    process.send({ type: 'ready', workerGeneration: message.workerGeneration });",
  "  } else if (message?.type === 'stop') {",
  "    process.exit(0);",
  "  }",
  "});",
  "process.on('disconnect', () => process.exit(0));",
].join('\n');

test('a real worker shell sees the allowlist, the directory overlay and no Host secret', async () => {
  const root = await mkdtemp(join(tmpdir(), 'worker-environment-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const reportPath = join(root, 'worker-env.txt');
  const workerEntrypoint = join(root, 'worker-fixture.mjs');
  await mkdir(cwd);
  await mkdir(agentDirectory);
  await writeFile(workerEntrypoint, FIXTURE);

  const saved: Record<string, string | undefined> = {};
  const modified = {
    ...sentinels,
    PATH: process.env.PATH,
    OMP_PROFILE: 'allowlisted-profile',
    PI_PROFILE: 'allowlisted-pi-profile',
    OPENCHAMBER_MANAGED_PROCESS_TOKEN: 'tree-token',
    BUN_BE_BUN: '1',
    SystemRoot: 'C:\\Windows',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
  };
  for (const key of Object.keys(modified)) saved[key] = process.env[key];
  Object.assign(process.env, sentinels, {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    OMP_PROFILE: 'allowlisted-profile',
    PI_PROFILE: 'allowlisted-pi-profile',
    OPENCHAMBER_MANAGED_PROCESS_TOKEN: 'tree-token',
    BUN_BE_BUN: '1',
    SystemRoot: 'C:\\Windows',
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
  });

  const registry = new WorkerRegistry({
    workerEntrypoint,
    workerRuntime: process.execPath,
    startupTimeoutMs: 10_000,
    stopTimeoutMs: 2_000,
  });

  try {
    const worker = await registry.start({
      rootSessionId: 'root-session', projectId: 'project', workspaceId: 'workspace',
      cwd, agentDirectory, env: {
        WORKER_ENV_REPORT: reportPath,
        OPENAI_API_KEY: 'overlay-key',
        OHPICHAMBER_INTERNAL_SECRET: 'overlay-secret',
        OPENCHAMBER_MANAGED_PROCESS_TOKEN: 'overlay-token',
        BUN_BE_BUN: '0',
        bun_be_bun: '0',
        PI_CODING_AGENT_DIR: '/overlay-agent-directory',
        pi_coding_agent_dir: '/lowercase-overlay-directory',
        OMP_PROFILE: 'overlay-profile',
        PI_PROFILE: 'overlay-pi-profile',
      },
    });
    expect(worker.state).toBe('ready');

    const observed = await readFile(reportPath, 'utf8');
    for (const value of Object.values(sentinels)) {
      expect(observed).not.toContain(value);
    }
    expect(observed).toContain('WORKER_ENV_REPORT=');
    expect(observed).toContain('OPENAI_API_KEY=overlay-key');
    expect(observed).toContain(`PI_CODING_AGENT_DIR=${agentDirectory}`);
    expect(observed).toContain('OPENCHAMBER_MANAGED_PROCESS_TOKEN=tree-token');
    expect(observed).toContain('BUN_BE_BUN=1');
    expect(observed.toLowerCase()).not.toContain('bun_be_bun=0');

    expect(observed).toContain('SystemRoot=');
    expect(observed).toContain('PATHEXT=');
    expect(observed).not.toContain('overlay-secret');
    expect(observed).not.toContain('overlay-token');
    expect(observed).not.toContain('/overlay-agent-directory');
    expect(observed).not.toContain('/lowercase-overlay-directory');
    // Named profiles are part of the authorized overlay and must be preserved.
    expect(observed).toContain('OMP_PROFILE=overlay-profile');
    expect(observed).toContain('PI_PROFILE=overlay-pi-profile');
  } finally {
    try {
      await registry.close();
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await rm(root, { recursive: true, force: true });
    }
  }
}, 15_000);
