import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { __resetDirsFromEnvForTests, getPluginsDir, getPluginsLockfile, getProjectPluginOverridesPath, setAgentDir } from '@oh-my-pi/pi-utils';
import { PluginManager } from '@oh-my-pi/pi-coding-agent/extensibility/plugins/manager';
import { NativePlugins } from './catalog-plugins.ts';
import { PluginLocalSource } from './plugin-local-source.ts';
import { MarketplaceManager, getMarketplacesRegistryPath, getInstalledPluginsRegistryPath, getMarketplacesCacheDir, getPluginsCacheDir } from '@oh-my-pi/pi-coding-agent/extensibility/plugins/marketplace';
import { clearPluginRootsAndCaches, resolveOrDefaultProjectRegistryPath } from '@oh-my-pi/pi-coding-agent/discovery/helpers';

const worker = { rootSessionId: 'plugin-root', workspaceId: 'plugin-workspace', workerGeneration: 'plugin-generation' };

// Bun caches os.homedir() at process start, so a per-test HOME assignment cannot
// move the SDK resolver. The suite re-executes itself once with an isolated HOME;
// every fixture then runs against that process home and clears the shared native
// plugin state between tests.
const fixtureHome = process.env.OPENCHAMBER_PLUGIN_FIXTURE_HOME;
if (fixtureHome === undefined) {
  test('native plugin fixtures rerun with an isolated HOME', async () => {
    const home = await mkdtemp(join(tmpdir(), 'native-plugins-home-'));
    try {
      const environment = { ...process.env, HOME: home, USERPROFILE: home, OPENCHAMBER_PLUGIN_FIXTURE_HOME: home };
      for (const key of ['PI_CONFIG_DIR', 'OMP_PROFILE', 'PI_PROFILE', 'PI_CODING_AGENT_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME']) delete environment[key];
      const child = Bun.spawn([process.execPath, 'test', import.meta.path], { env: environment, stdout: 'pipe', stderr: 'pipe' });
      const [status, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
      if (status !== 0) throw new Error(`Fresh-HOME native plugin fixture failed (${status}):\n${stdout}\n${stderr}`);
    } finally { await rm(home, { recursive: true, force: true }); }
  });
}
const nativeTest = fixtureHome === undefined ? test.skip : test;

async function resetNativeState(): Promise<void> {
  await Promise.all([
    rm(getPluginsDir(), { recursive: true, force: true }),
    rm(getInstalledPluginsRegistryPath(), { force: true }),
    rm(getMarketplacesRegistryPath(), { force: true }),
    rm(getMarketplacesCacheDir(), { recursive: true, force: true }),
    rm(getPluginsCacheDir(), { recursive: true, force: true }),
  ]);
  clearPluginRootsAndCaches();
}

async function fixture() {
  const keys = ['HOME', 'USERPROFILE', 'PI_CONFIG_DIR', 'OMP_PROFILE', 'PI_PROFILE', 'PI_CODING_AGENT_DIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME'] as const;
  const environment: Record<(typeof keys)[number], string | undefined> = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const home = homedir();
  const root = await mkdtemp(join(tmpdir(), 'native-plugins-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  const packageDirectory = join(root, 'local-package');
  await Promise.all([mkdir(cwd), mkdir(agentDirectory), mkdir(packageDirectory)]);
  await resetNativeState();
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.PI_CONFIG_DIR = '.omp';
  for (const key of ['OMP_PROFILE', 'PI_PROFILE', 'PI_CODING_AGENT_DIR']) delete process.env[key];
  for (const key of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME']) process.env[key] = join(root, key.toLowerCase());
  __resetDirsFromEnvForTests();
  setAgentDir(agentDirectory);
  await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({ name: '@native-proof/plugin', version: '1.0.0',
    omp: { description: 'Native package proof', settings: {
      greeting: { type: 'string' }, retries: { type: 'number', min: 0, max: 3 }, token: { type: 'string', secret: true },
    } } }));
  return { root, home, cwd, packageDirectory, plugins: new NativePlugins({ cwd, worker }), cleanup: async () => {
    await resetNativeState();
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    __resetDirsFromEnvForTests();
    await rm(root, { recursive: true, force: true });
  } };
}

nativeTest('native linked package round-trips enablement and validated settings without leaking declared or undeclared secrets', async () => {
  const context = await fixture();
  try {
    const native = new PluginManager(context.cwd);
    await native.link(context.packageDirectory);
    await native.setPluginSetting('@native-proof/plugin', 'undeclaredToken', 'must-never-leak');
    const target = { kind: 'package' as const, name: '@native-proof/plugin' };
    await context.plugins.operation({ type: 'plugins.configure', request: { expectedRevision: '0', target,
      enabled: false, settingsScope: 'global', settings: { greeting: 'hello', retries: 2, token: 'secret-token' } } }, '1');
    const catalog = await context.plugins.read('1');
    const installed = catalog.plugins.find(plugin => plugin.name === target.name);
    expect(installed?.enabled).toBe(false);
    expect(installed?.settings).toEqual({ greeting: 'hello', retries: 2 });
    expect(installed?.settingDefinitions.find(setting => setting.key === 'token')).toMatchObject({ secret: true, configured: true });
    expect(JSON.stringify(catalog)).not.toContain('secret-token');
    expect(JSON.stringify(catalog)).not.toContain('must-never-leak');
    expect(await new PluginManager(context.cwd).getPluginSettings(target.name)).toMatchObject({ token: 'secret-token', greeting: 'hello' });
    await context.plugins.operation({ type: 'plugins.configure', request: { expectedRevision: '1', target, enabled: true } }, '2');
    expect((await context.plugins.read('2')).plugins.find(plugin => plugin.name === target.name)?.enabled).toBe(true);
    await context.plugins.operation({ type: 'plugins.configure', request: { expectedRevision: '2', target, settingsScope: 'global', settings: { greeting: 'replacement' } } }, '3');
    const replaced = await new PluginManager(context.cwd).getPluginSettings(target.name);
    expect(replaced.token).toBe('secret-token');
    expect(replaced.greeting).toBe('replacement');
    expect(Object.hasOwn(replaced, 'retries')).toBe(false);
  } finally { await context.cleanup(); }
});

nativeTest('native setting validation rejects the whole invalid patch before changing an earlier valid key', async () => {
  const context = await fixture();
  try {
    await new PluginManager(context.cwd).link(context.packageDirectory);
    const before = await readFile(getPluginsLockfile(), 'utf8');
    await expect(context.plugins.operation({ type: 'plugins.configure', request: { expectedRevision: '0',
      target: { kind: 'package', name: '@native-proof/plugin' }, settingsScope: 'global', settings: { greeting: 'not-committed', retries: 99 } } }, '1')).rejects.toMatchObject({ status: 400 });
    expect(await readFile(getPluginsLockfile(), 'utf8')).toBe(before);
    await expect(context.plugins.operation({ type: 'plugins.configure', request: { expectedRevision: '0',
      target: { kind: 'package', name: '../../outside' }, enabled: true } }, '1')).rejects.toMatchObject({ status: 400 });
    await expect(context.plugins.operation({ type: 'plugins.install', request: { expectedRevision: '0',
      source: { kind: 'package', spec: 'bad;touch injected' } } }, '1')).rejects.toMatchObject({ status: 400 });
    expect(await readFile(getPluginsLockfile(), 'utf8')).toBe(before);
  } finally { await context.cleanup(); }
});

nativeTest('corrupt native configuration is a failed authoritative read, never an empty catalog', async () => {
  const context = await fixture();
  try {
    await new PluginManager(context.cwd).link(context.packageDirectory);
    await writeFile(getPluginsLockfile(), '{broken');
    await expect(context.plugins.read('0')).rejects.toMatchObject({ status: 503 });
  } finally { await context.cleanup(); }
});

test('local extension authoring atomically preserves valid source on syntax error and rejects traversal and symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-plugin-source-'));
  const cwd = join(root, 'workspace');
  await mkdir(cwd);
  const local = new PluginLocalSource(cwd);
  try {
    expect(await local.list()).toEqual([]);
    const source = 'export default function (pi) { pi.on("session_start", () => {}); }';
    await local.write('proof.ts', source);
    expect(await local.read('proof.ts')).toBe(source);
    await expect(local.write('proof.ts', 'export default function ( {')).rejects.toMatchObject({ status: 400 });
    expect(await local.read('proof.ts')).toBe(source);
    await expect(local.write('../escape.ts', source)).rejects.toMatchObject({ status: 400 });
    const outside = join(root, 'outside.ts');
    await writeFile(outside, 'outside');
    await symlink(outside, join(cwd, '.omp', 'extensions', 'linked.ts'));
    await expect(local.write('linked.ts', source)).rejects.toMatchObject({ status: 403 });
    await expect(local.delete('linked.ts')).rejects.toMatchObject({ status: 403 });
    expect(await readFile(outside, 'utf8')).toBe('outside');
    expect(await local.list()).toEqual(['proof.ts']);
    await local.delete('proof.ts');
    expect(await local.list()).toEqual([]);
    await rm(join(cwd, '.omp', 'extensions'), { recursive: true });
    await symlink(root, join(cwd, '.omp', 'extensions'));
    await expect(local.write('escape.ts', source)).rejects.toMatchObject({ status: 403 });
  } finally { await rm(root, { recursive: true, force: true }); }
});

nativeTest('native marketplace project installs retain scoped enablement while declared settings remain explicitly global', async () => {
  const context = await fixture();
  try {
    const marketplaceRoot = join(context.root, 'marketplace');
    await mkdir(join(marketplaceRoot, '.omp-plugin'), { recursive: true });
    const pluginDirectory = join(marketplaceRoot, 'plugins', 'proof');
    await mkdir(pluginDirectory, { recursive: true });
    await writeFile(join(pluginDirectory, 'package.json'), await readFile(join(context.packageDirectory, 'package.json')));
    await writeFile(join(marketplaceRoot, '.omp-plugin', 'marketplace.json'), JSON.stringify({ name: 'local-proof', owner: { name: 'Test' },
      plugins: [{ name: 'proof', source: './plugins/proof', version: '1.0.0', description: 'Local native marketplace plugin' }] }));
    const manager = new MarketplaceManager({ marketplacesRegistryPath: getMarketplacesRegistryPath(), installedRegistryPath: getInstalledPluginsRegistryPath(),
      projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(context.cwd), marketplacesCacheDir: getMarketplacesCacheDir(),
      pluginsCacheDir: getPluginsCacheDir(), clearPluginRootsCache: clearPluginRootsAndCaches });
    await manager.addMarketplace(marketplaceRoot);
    await context.plugins.operation({ type: 'plugins.install', request: { expectedRevision: '0',
      source: { kind: 'marketplace', name: 'proof', marketplace: 'local-proof', scope: 'project' } } }, '1');
    const target = { kind: 'marketplace' as const, name: 'proof', marketplace: 'local-proof', scope: 'project' as const };
    await context.plugins.operation({ type: 'plugins.configure', request: { expectedRevision: '1', target, enabled: false,
      settingsScope: 'global', settings: { greeting: 'global greeting', token: 'global secret' } } }, '2');
    const installed = (await context.plugins.read('2')).plugins.find(plugin => plugin.target.kind === 'marketplace');
    expect(installed).toMatchObject({ name: 'proof', target, scope: 'workspace', enabled: false, settingsScope: 'global', globalSettings: { greeting: 'global greeting' }, settings: { greeting: 'global greeting' } });
    expect(JSON.stringify(installed)).not.toContain('global secret');
    const projectSettings = await new PluginManager(context.cwd).getPluginSettings('@native-proof/plugin');
    expect(projectSettings).toMatchObject({ greeting: 'global greeting', token: 'global secret' });
    const sibling = join(context.root, 'sibling');
    await mkdir(sibling);
    expect(await new PluginManager(sibling).getPluginSettings('@native-proof/plugin')).toEqual({ greeting: 'global greeting', token: 'global secret' });
    await context.plugins.operation({ type: 'plugins.configure', request: { expectedRevision: '2', target, settingsScope: 'global', settings: {} } }, '3');
    expect(await new PluginManager(context.cwd).getPluginSettings('@native-proof/plugin')).toEqual({ token: 'global secret' });
    await context.plugins.operation({ type: 'plugins.uninstall', request: { expectedRevision: '3', target } }, '4');
    expect((await context.plugins.read('4')).plugins).toEqual([]);
  } finally { clearPluginRootsAndCaches(); await context.cleanup(); }
});

nativeTest('native plugin ownership follows actual resolver root rather than agentDirectory or workspace labels', async () => {
  const context = await fixture();
  try {
    const first = await context.plugins.operation({ type: 'plugins.owner' }, '0');
    if (first.type !== 'plugins.owner') throw new Error('Expected native owner identity');
    expect(first.rootPath).toBe(getPluginsDir());
    expect(first.rootPath).toBe(join(context.home, '.omp', 'plugins'));
    const alternativeAgent = join(context.root, 'another-agent');
    await mkdir(alternativeAgent);
    setAgentDir(alternativeAgent);
    const second = await context.plugins.operation({ type: 'plugins.owner' }, '0');
    expect(second).toEqual(first);
    await mkdir(join(context.cwd, '.omp'));
    const nested = join(context.cwd, 'nested');
    await mkdir(nested);
    const inherited = await new NativePlugins({ cwd: nested, worker: { ...worker, workspaceId: 'nested-workspace' } }).operation({ type: 'plugins.owner' }, '0');
    if (inherited.type !== 'plugins.owner') throw new Error('Expected native owner identity');
    expect(inherited.projectRegistryPath).toBe(join(context.cwd, '.omp', 'plugins', 'installed_plugins.json'));
  } finally { await context.cleanup(); }
});

nativeTest('global setting writes preserve native project overrides and expose saved-global versus effective values without secret values', async () => {
  const context = await fixture();
  try {
    await new PluginManager(context.cwd).link(context.packageDirectory);
    await mkdir(join(context.cwd, '.omp'));
    const path = getProjectPluginOverridesPath(context.cwd);
    const original = JSON.stringify({ settings: { '@native-proof/plugin': { greeting: 'project wins', token: 'project-only-secret' } } });
    await writeFile(path, original);
    await context.plugins.operation({ type: 'plugins.configure', request: { expectedRevision: '0', target: { kind: 'package', name: '@native-proof/plugin' },
      settingsScope: 'global', settings: { greeting: 'saved globally' } } }, '1');
    const installed = (await context.plugins.read('1')).plugins.find(plugin => plugin.name === '@native-proof/plugin');
    expect(installed).toMatchObject({ settingsScope: 'global', globalSettings: { greeting: 'saved globally' }, settings: { greeting: 'project wins' } });
    expect(installed?.settingDefinitions.find(setting => setting.key === 'greeting')).toMatchObject({ configured: true, globalConfigured: true, overridden: true });
    expect(installed?.settingDefinitions.find(setting => setting.key === 'token')).toMatchObject({ configured: true, globalConfigured: false, overridden: true });
    expect(JSON.stringify(installed)).not.toContain('project-only-secret');
    expect(await readFile(path, 'utf8')).toBe(original);
  } finally { await context.cleanup(); }
});

nativeTest('native doctor reports real checks without exposing native profile or plugin paths', async () => {
  const context = await fixture();
  try {
    await new PluginManager(context.cwd).link(context.packageDirectory);
    const result = await context.plugins.operation({ type: 'plugins.doctor' }, '0');
    if (result.type !== 'plugins.doctor') throw new Error('Expected native doctor diagnostics');
    expect(result.result.checks.find(check => check.name === 'plugins_directory')).toMatchObject({ status: 'ok' });
    expect(result.result.checks.length).toBeGreaterThan(0);
    expect(JSON.stringify(result)).not.toContain(context.root);
    expect(JSON.stringify(result)).toContain('[native plugin location]');
  } finally { await context.cleanup(); }
});
