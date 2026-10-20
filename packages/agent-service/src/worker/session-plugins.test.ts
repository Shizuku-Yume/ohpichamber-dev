import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { __resetDirsFromEnvForTests, getActiveProfile, getPluginsDir, setProfile } from '@oh-my-pi/pi-utils';
import { PluginManager } from '@oh-my-pi/pi-coding-agent/extensibility/plugins/manager';
import { PluginLocalSource } from './plugin-local-source.ts';
import { WorkerSession } from './session.ts';

const directoryEnvironmentKeys = ['HOME', 'USERPROFILE', 'PI_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OMP_PROFILE', 'PI_PROFILE', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME'] as const;
let environmentRoot = '';
let previousEnvironment: Array<readonly [string, string | undefined]> = [];
beforeEach(async () => {
  resetSettingsForTest();
  environmentRoot = await mkdtemp(join(tmpdir(), 'native-plugin-profile-'));
  previousEnvironment = directoryEnvironmentKeys.map(key => [key, process.env[key]] as const);
  for (const key of directoryEnvironmentKeys) delete process.env[key];
  process.env.HOME = environmentRoot;
  process.env.USERPROFILE = environmentRoot;
  process.env.PI_CONFIG_DIR = '.omp';
  process.env.XDG_DATA_HOME = join(environmentRoot, 'data');
  process.env.XDG_STATE_HOME = join(environmentRoot, 'state');
  process.env.XDG_CACHE_HOME = join(environmentRoot, 'cache');
  __resetDirsFromEnvForTests();
});
afterEach(async () => {
  resetSettingsForTest();
  for (const [key, value] of previousEnvironment) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __resetDirsFromEnvForTests();
  await rm(environmentRoot, { recursive: true, force: true });
});

const toolExtension = `export default api => {
  api.registerTool({ name: 'native_local_proof', label: 'Native local proof', description: 'A native authored extension tool',
    parameters: { type: 'object', properties: {}, required: [] },
    execute: async () => ({ content: [{ type: 'text', text: 'Native extension executed' }], details: {} }) });
};`;

test('new native session exposes authored extension tools without losing Host-owned tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-plugin-session-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  let worker: WorkerSession | undefined;
  try {
    await mkdir(cwd, { recursive: true });
    await mkdir(agentDirectory, { recursive: true });
    await new PluginLocalSource(cwd).write('proof.ts', toolExtension);
    worker = await WorkerSession.open({ type: 'bootstrap', rootSessionId: 'native-plugin-root', workerGeneration: 'generation',
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd, agentDirectory,
      sessionsDirectory: join(root, 'sessions') }, () => {}, () => { throw new Error('No interaction expected'); },
    () => { throw new Error('Native extension session must remain healthy'); }, async () => {},
    async () => { throw new Error('No Host action expected'); }, () => {});
    const tools = worker.session.getAllToolInfos().map(tool => tool.name);
    expect(tools).toContain('native_local_proof');
    expect(tools).toContain('openchamber');
    expect(tools).toContain('bash');
    const sessionFile = worker.sessionFile;
    await worker.close();
    worker = await WorkerSession.open({ type: 'bootstrap', rootSessionId: 'native-plugin-root', workerGeneration: 'reopened-generation',
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd, agentDirectory, sessionFile,
      sessionsDirectory: join(root, 'sessions') }, () => {}, () => { throw new Error('No interaction expected'); },
    () => { throw new Error('Reopened native extension session must remain healthy'); }, async () => {},
    async () => { throw new Error('No Host action expected'); }, () => {});
    expect(worker.sessionFile).toBe(sessionFile);
    expect(worker.session.getAllToolInfos().map(tool => tool.name)).toContain('native_local_proof');
  } finally {
    await worker?.close();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

test('extension evaluation failure refuses native session readiness instead of publishing a clean runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-plugin-failure-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  try {
    await mkdir(join(cwd, '.omp', 'extensions'), { recursive: true });
    await mkdir(agentDirectory, { recursive: true });
    await writeFile(join(cwd, '.omp', 'extensions', 'broken.ts'), 'throw new Error("private extension failure"); export default () => {};');
    await expect(WorkerSession.open({ type: 'bootstrap', rootSessionId: 'broken-plugin-root', workerGeneration: 'generation',
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd, agentDirectory,
      sessionsDirectory: join(root, 'sessions') }, () => {}, () => {}, () => {}, async () => {},
    async () => { throw new Error('No Host action expected'); }, () => {})).rejects.toThrow('Native plugin or local extension failed to load');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

test('new native roots load the selected profile plugin tree rather than an inferred agent-directory sibling', async () => {
  const cwd = join(environmentRoot, 'workspace');
  const agentDirectory = join(environmentRoot, 'private-agent');
  const packageDirectory = join(environmentRoot, 'profile-package');
  let worker: WorkerSession | undefined;
  try {
    await mkdir(cwd, { recursive: true });
    await mkdir(agentDirectory, { recursive: true });
    await mkdir(packageDirectory, { recursive: true });
    setProfile('work');
    const pluginRoot = getPluginsDir();
    await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({
      name: 'native-profile-proof', version: '1.0.0', omp: { extensions: ['extension.ts'] },
    }));
    await writeFile(join(packageDirectory, 'extension.ts'), toolExtension);
    await new PluginManager(cwd).link(packageDirectory);
    worker = await WorkerSession.open({ type: 'bootstrap', rootSessionId: 'profile-plugin-root', workerGeneration: 'generation',
      projectId: 'project', workspaceId: 'workspace', agentDirectoryId: 'source', cwd, agentDirectory,
      sessionsDirectory: join(environmentRoot, 'sessions') }, () => {}, () => {}, () => {}, async () => {},
    async () => { throw new Error('No Host action expected'); }, () => {});
    expect(getActiveProfile()).toBe('work');
    expect(getPluginsDir()).toBe(pluginRoot);
    expect(worker.session.getAllToolInfos().map(tool => tool.name)).toContain('native_local_proof');
  } finally {
    await worker?.close();
  }
}, 30000);
