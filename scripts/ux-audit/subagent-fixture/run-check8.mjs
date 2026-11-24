#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCheck8MockProvider } from './mock-provider.mjs';

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');
const CLI_PATH = join(REPO_ROOT, 'packages', 'web', 'bin', 'cli.js');

function parseArgs(argv) {
  const options = {
    tmpDir: process.env.UXFIX_CHECK8_DIR || '/tmp/uxfix-04-check8',
    providerPort: Number(process.env.MOCK_PROVIDER_PORT || 18477),
    webPort: Number(process.env.OPENCHAMBER_PORT || 18478),
    holdMs: Number(process.env.MOCK_PROVIDER_HOLD_MS || 150),
    keepAlive: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--keep-alive') options.keepAlive = true;
    else if (arg === '--tmp' && argv[i + 1]) options.tmpDir = argv[++i];
    else if (arg === '--provider-port' && argv[i + 1]) options.providerPort = Number(argv[++i]);
    else if (arg === '--web-port' && argv[i + 1]) options.webPort = Number(argv[++i]);
    else if (arg === '--hold-ms' && argv[i + 1]) options.holdMs = Number(argv[++i]);
  }
  return options;
}

function runCmd(command, args, { cwd, env }) {
  return new Promise((resolveCmd, rejectCmd) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', rejectCmd);
    child.on('exit', (code) => {
      if (code === 0) resolveCmd({ stdout, stderr });
      else rejectCmd(new Error(`${command} ${args.join(' ')} exited ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function waitForServer(baseUrl, getServerLog, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastHealth = 'none';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      const text = await res.text();
      lastHealth = `${res.status} ${text}`;
      if (res.ok) {
        const body = JSON.parse(text);
        if (body && body.status === 'ok' && body.agentService && body.agentService.phase === 'ready') return;
      }
    } catch (error) {
      lastHealth = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for OpenChamber server at ${baseUrl} (last /health: ${lastHealth})\nServer log:\n${getServerLog()}`);
}

async function prepareFixtureTree(tmpDir, providerPort) {
  await rm(tmpDir, { recursive: true, force: true });
  const homeDir = join(tmpDir, 'home');
  const dataDir = join(tmpDir, 'data');
  const agentDir = join(homeDir, '.omp', 'agent');
  const projectDir = join(tmpDir, 'project');
  await mkdir(agentDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });
  await mkdir(projectDir, { recursive: true });

  await writeFile(
    join(agentDir, 'models.yml'),
    [
      'providers:',
      '  multiprov:',
      `    baseUrl: http://127.0.0.1:${providerPort}/v1`,
      '    apiKey: check8-mock-key',
      '    api: openai-completions',
      '    models:',
      '      - id: mock-gpt',
      '        name: Mock GPT',
      '        contextWindow: 128000',
      '        maxTokens: 4096',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(
    join(agentDir, 'config.yml'),
    [
      'modelRoles:',
      '  default: multiprov/mock-gpt',
      '  smol: multiprov/mock-gpt',
      '  task: multiprov/mock-gpt',
      '',
    ].join('\n'),
    'utf8',
  );

  await writeFile(join(projectDir, 'README.md'), '# Check 8 Fixture Project\n', 'utf8');
  const gitEnv = { ...process.env, HOME: homeDir };
  await runCmd('git', ['init', '-q'], { cwd: projectDir, env: gitEnv });
  await runCmd('git', ['config', 'user.name', 'Check8 Fixture'], { cwd: projectDir, env: gitEnv });
  await runCmd('git', ['config', 'user.email', 'check8@example.invalid'], { cwd: projectDir, env: gitEnv });
  await runCmd('git', ['add', 'README.md'], { cwd: projectDir, env: gitEnv });
  await runCmd('git', ['commit', '-q', '-m', 'init'], { cwd: projectDir, env: gitEnv });

  return { homeDir, dataDir, agentDir, projectDir };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { homeDir, dataDir, agentDir, projectDir } = await prepareFixtureTree(options.tmpDir, options.providerPort);

  const isolatedEnv = {
    ...process.env,
    HOME: homeDir,
    OPENCHAMBER_DATA_DIR: dataDir,
    PI_CODING_AGENT_DIR: agentDir,
  };

  const mockServer = await startCheck8MockProvider({
    port: options.providerPort,
    holdMs: options.holdMs,
  });

  const webProcess = spawn(
    'bun',
    [CLI_PATH, 'serve', '--foreground', '--port', String(options.webPort)],
    {
      cwd: REPO_ROOT,
      env: isolatedEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let serverLog = '';
  webProcess.stdout.on('data', (chunk) => { serverLog += chunk.toString(); });
  webProcess.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

  const cleanup = async () => {
    if (!webProcess.killed) webProcess.kill('SIGTERM');
    await new Promise((resolveExit) => {
      const timer = setTimeout(() => {
        if (!webProcess.killed) webProcess.kill('SIGKILL');
        resolveExit();
      }, 3000);
      webProcess.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
    await new Promise((resolveClose) => mockServer.close(() => resolveClose()));
  };

  try {
    const baseUrl = `http://127.0.0.1:${options.webPort}`;
    await waitForServer(baseUrl, () => serverLog);

    const registerRes = await fetch(`${baseUrl}/api/openchamber/directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: projectDir }),
    });
    if (!registerRes.ok) {
      throw new Error(`POST /api/openchamber/directory failed: ${registerRes.status} ${await registerRes.text()}`);
    }

    const createResult = await runCmd(
      'bun',
      [
        CLI_PATH,
        'session',
        'create',
        '--port',
        String(options.webPort),
        '--dir',
        projectDir,
        '--prompt',
        'Run [CHECK8_SUBAGENT] to spawn home-disk-usage-2',
        '--model',
        'multiprov/mock-gpt',
        '--wait',
        '--timeout',
        '60',
        '--json',
      ],
      { cwd: REPO_ROOT, env: isolatedEnv },
    );

    const created = JSON.parse(createResult.stdout);
    const parentSessionId = created.sessionId;
    if (!parentSessionId) throw new Error(`Missing sessionId in response: ${createResult.stdout}`);

    const sessionAuthRes = await fetch(`${baseUrl}/auth/session`);
    const rawCookie = sessionAuthRes.headers.get('set-cookie');
    const authHeaders = rawCookie ? { Cookie: rawCookie.split(';', 1)[0] } : {};

    const subagentsRes = await fetch(`${baseUrl}/api/agent/v1/subagents?sessionId=${encodeURIComponent(parentSessionId)}`, {
      headers: authHeaders,
    });
    if (!subagentsRes.ok) {
      throw new Error(`GET /api/agent/v1/subagents failed: ${subagentsRes.status} ${await subagentsRes.text()}`);
    }
    const subagents = await subagentsRes.json();

    const hubSubagentsRes = await fetch(`${baseUrl}/api/agent/v1/sessions/${encodeURIComponent(parentSessionId)}/subagents`, {
      headers: authHeaders,
    });
    const hubSubagents = hubSubagentsRes.ok ? await hubSubagentsRes.json() : { status: hubSubagentsRes.status };

    const summary = {
      webUrl: `${baseUrl}/?session=${encodeURIComponent(parentSessionId)}`,
      baseUrl,
      providerUrl: `http://127.0.0.1:${options.providerPort}/v1`,
      parentSessionId,
      projectDir,
      homeDir,
      dataDir,
      subagents,
      hubSubagents,
    };

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

    if (!Array.isArray(subagents) || subagents.length === 0) {
      throw new Error(`Expected >=1 live subagent for ${parentSessionId}, got: ${JSON.stringify(subagents)}\nServer log:\n${serverLog}`);
    }

    if (options.keepAlive) {
      await new Promise((resolveSignal) => {
        process.once('SIGINT', resolveSignal);
        process.once('SIGTERM', resolveSignal);
      });
    }
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
