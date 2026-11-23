import { expect, spyOn, test } from 'bun:test';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { __resetDirsFromEnvForTests, getPluginsDir, getPluginsLockfile, getProjectPluginOverridesPath, setAgentDir } from '@oh-my-pi/pi-utils';
import { PluginManager } from '@oh-my-pi/pi-coding-agent/extensibility/plugins/manager';
import { getEnabledPlugins, getPluginSettings } from '@oh-my-pi/pi-coding-agent/extensibility/plugins/loader';
import { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import { NativePlugins } from './catalog-plugins.ts';
import { nativeExtensionRoots } from './native-runtime.ts';
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

async function fixture(configDir = '.omp') {
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
  process.env.PI_CONFIG_DIR = configDir;
  for (const key of ['OMP_PROFILE', 'PI_PROFILE', 'PI_CODING_AGENT_DIR']) delete process.env[key];
  for (const key of ['XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME']) process.env[key] = join(root, key.toLowerCase());
  __resetDirsFromEnvForTests();
  setAgentDir(agentDirectory);
  await writeFile(join(packageDirectory, 'package.json'), JSON.stringify({
    name: '@native-proof/plugin', version: '1.0.0',
    omp: {
      description: 'Native package proof', features: { stable: { default: true }, preview: { description: 'Preview capability' } }, settings: {
        greeting: { type: 'string' }, retries: { type: 'number', min: 0, max: 3 }, token: { type: 'string', secret: true },
      }
    }
  }));
  const settings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  const extensionRoots = nativeExtensionRoots(settings);
  return {
    root, home, cwd, agentDirectory, packageDirectory, settings,
    plugins: new NativePlugins({ cwd, agentDirectory, worker, settings, extensionRoots }),
    cleanup: async () => {
      settings.cancelPendingSaves();
      await resetNativeState();
      for (const [key, value] of Object.entries(environment)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      __resetDirsFromEnvForTests();
      await rm(root, { recursive: true, force: true });
    },
  };
}

nativeTest('native linked package round-trips enablement and validated settings without leaking declared or undeclared secrets', async () => {
  const context = await fixture();
  try {
    const native = new PluginManager(context.cwd);
    await native.link(context.packageDirectory);
    await native.setPluginSetting('@native-proof/plugin', 'undeclaredToken', 'must-never-leak');
    const target = { kind: 'package' as const, name: '@native-proof/plugin' };
    await context.plugins.operation({
      type: 'plugins.configure', request: {
        expectedRevision: '0', target,
        enabled: false, settingsScope: 'global', settings: { greeting: 'hello', retries: 2, token: 'secret-token' }
      }
    }, '1');
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
    await expect(context.plugins.operation({
      type: 'plugins.configure', request: {
        expectedRevision: '0',
        target: { kind: 'package', name: '@native-proof/plugin' }, settingsScope: 'global', settings: { greeting: 'not-committed', retries: 99 }
      }
    }, '1')).rejects.toMatchObject({ status: 400 });
    expect(await readFile(getPluginsLockfile(), 'utf8')).toBe(before);
    await expect(context.plugins.operation({
      type: 'plugins.configure', request: {
        expectedRevision: '0',
        target: { kind: 'package', name: '../../outside' }, enabled: true
      }
    }, '1')).rejects.toMatchObject({ status: 400 });
    await expect(context.plugins.operation({
      type: 'plugins.install', request: {
        expectedRevision: '0',
        source: { kind: 'package', spec: 'bad;touch injected' }
      }
    }, '1')).rejects.toMatchObject({ status: 400 });
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
    await writeFile(join(marketplaceRoot, '.omp-plugin', 'marketplace.json'), JSON.stringify({
      name: 'local-proof', owner: { name: 'Test' },
      plugins: [{ name: 'proof', source: './plugins/proof', version: '1.0.0', description: 'Local native marketplace plugin' }]
    }));
    const manager = new MarketplaceManager({
      marketplacesRegistryPath: getMarketplacesRegistryPath(), installedRegistryPath: getInstalledPluginsRegistryPath(),
      projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(context.cwd), marketplacesCacheDir: getMarketplacesCacheDir(),
      pluginsCacheDir: getPluginsCacheDir(), clearPluginRootsCache: clearPluginRootsAndCaches
    });
    await manager.addMarketplace(marketplaceRoot);
    await context.plugins.operation({
      type: 'plugins.install', request: {
        expectedRevision: '0',
        source: { kind: 'marketplace', name: 'proof', marketplace: 'local-proof', scope: 'project' }
      }
    }, '1');
    const target = { kind: 'marketplace' as const, name: 'proof', marketplace: 'local-proof', scope: 'project' as const };
    await context.plugins.operation({
      type: 'plugins.configure', request: {
        expectedRevision: '1', target, enabled: false,
        settingsScope: 'global', settings: { greeting: 'global greeting', token: 'global secret' }
      }
    }, '2');
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
    const userTarget = { ...target, scope: 'user' as const };
    await context.plugins.operation({
      type: 'plugins.install', request: { expectedRevision: '4', source: userTarget }
    }, '5');
    await context.plugins.operation({
      type: 'plugins.configure', request: { expectedRevision: '5', target: userTarget, settingsScope: 'global', enabledFeatures: ['preview'] }
    }, '6');
    expect((await getEnabledPlugins(sibling)).find(plugin => plugin.name === '@native-proof/plugin')?.enabledFeatures).toEqual(['preview']);
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
    const nestedSettings = await Settings.loadIsolated({ cwd: nested, agentDir: context.agentDirectory });
    const inherited = await new NativePlugins({
      cwd: nested,
      agentDirectory: context.agentDirectory,
      worker: { ...worker, workspaceId: 'nested-workspace' },
      settings: nestedSettings,
      extensionRoots: nativeExtensionRoots(nestedSettings),
    }).operation({ type: 'plugins.owner' }, '0');
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
    await context.plugins.operation({
      type: 'plugins.configure', request: {
        expectedRevision: '0', target: { kind: 'package', name: '@native-proof/plugin' },
        settingsScope: 'global', settings: { greeting: 'saved globally' }
      }
    }, '1');
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

nativeTest('native feature selection and workspace overrides round-trip without changing the legacy catalog shape', async () => {
  const context = await fixture();
  try {
    const native = new PluginManager(context.cwd);
    await native.link(context.packageDirectory);
    const target = { kind: 'package' as const, name: '@native-proof/plugin' };
    const path = getProjectPluginOverridesPath(context.cwd);
    await mkdir(join(context.cwd, '.omp'));
    await writeFile(path, JSON.stringify({
      future: { kept: true }, settings: { [target.name]: { token: 'fixture-secret', undeclared: 'private' } }
    }));
    const configure = (request: Omit<Extract<Parameters<NativePlugins['operation']>[0], { type: 'plugins.configure' }>['request'], 'target' | 'expectedRevision'>) =>
      context.plugins.operation({ type: 'plugins.configure', request: { ...request, target, expectedRevision: '0' } }, '1');
    await configure({ settingsScope: 'global', enabledFeatures: ['preview'], settings: { greeting: 'global' } });
    await configure({ settingsScope: 'workspace', enabledFeatures: [], settings: { greeting: 'project' } });
    const global = new PluginManager(context.root);
    expect(await global.getEnabledFeatures(target.name)).toEqual(['preview']);
    expect((await getEnabledPlugins(context.cwd)).find(plugin => plugin.name === target.name)?.enabledFeatures).toEqual([]);
    expect(await getPluginSettings(target.name, context.cwd)).toMatchObject({ greeting: 'project', token: 'fixture-secret' });
    expect(await getPluginSettings(target.name, context.root)).toEqual({ greeting: 'global' });
    const result = await context.plugins.operation({ type: 'plugins.lifecycle' }, '1');
    if (result.type !== 'plugins.lifecycle') throw new Error('Expected opt-in lifecycle data');
    expect(result.result.plugins[0]).toMatchObject({
      availableFeatures: [{ name: 'stable', defaultEnabled: true }, { name: 'preview', defaultEnabled: false, description: 'Preview capability' }],
      globalFeatures: ['preview'], workspaceFeatures: [], projectSettings: { greeting: 'project' }
    });
    expect(JSON.stringify(result)).not.toContain('fixture-secret');
    expect(JSON.stringify(result)).not.toContain('undeclared');
    expect((await context.plugins.read('1')).plugins[0]).not.toHaveProperty('projectSettings');
    expect(await Bun.file(path).json()).toMatchObject({ future: { kept: true } });
    await expect(configure({ settingsScope: 'workspace', settings: { token: 'blocked' } })).rejects.toMatchObject({ status: 400 });
    await expect(configure({ settingsScope: 'global', enabledFeatures: ['unknown'] })).rejects.toMatchObject({ status: 400 });
    await configure({ settingsScope: 'workspace', enabledFeatures: null, settings: {} });
    expect((await getEnabledPlugins(context.cwd)).find(plugin => plugin.name === target.name)?.enabledFeatures).toEqual(['preview']);
    expect(await getPluginSettings(target.name, context.cwd)).toMatchObject({ greeting: 'global', token: 'fixture-secret' });
    await configure({ settingsScope: 'global', enabledFeatures: null });
    expect(await new PluginManager(context.cwd).getEnabledFeatures(target.name)).toBeNull();
  } finally { await context.cleanup(); }
});

nativeTest('workspace settings roll back a committed override and enablement if the authoritative catalog cannot be read', async () => {
  const context = await fixture();
  try {
    await new PluginManager(context.cwd).link(context.packageDirectory);
    await mkdir(join(context.cwd, '.omp'));
    const path = getProjectPluginOverridesPath(context.cwd);
    const nativeBefore = await readFile(getPluginsLockfile(), 'utf8');
    const overridesBefore = '{"settings":{"@native-proof/plugin":{"greeting":"keep"}}}\n';
    await writeFile(path, overridesBefore);
    await symlink(context.root, join(context.cwd, '.omp', 'extensions'), 'dir');
    await expect(context.plugins.operation({
      type: 'plugins.configure', request: {
        expectedRevision: '0', target: { kind: 'package', name: '@native-proof/plugin' },
        enabled: false, settingsScope: 'workspace', settings: { greeting: 'rollback' }
      }
    }, '1')).rejects.toMatchObject({ status: 403 });
    expect(await readFile(path, 'utf8')).toBe(overridesBefore);
    expect(await readFile(getPluginsLockfile(), 'utf8')).toBe(nativeBefore);
  } finally { await context.cleanup(); }
});

nativeTest('workspace overrides never overwrite a symlink or shadow a native fallback file', async () => {
  const context = await fixture();
  try {
    await new PluginManager(context.cwd).link(context.packageDirectory);
    const path = getProjectPluginOverridesPath(context.cwd);
    const outside = join(context.root, 'outside.json');
    await mkdir(join(context.cwd, '.omp'));
    await writeFile(outside, '{}');
    await symlink(outside, path);
    const write = () => context.plugins.operation({
      type: 'plugins.configure', request: {
        expectedRevision: '0', target: { kind: 'package', name: '@native-proof/plugin' },
        settingsScope: 'workspace', settings: { greeting: 'blocked' }
      }
    }, '1');
    await expect(write()).rejects.toMatchObject({ status: 403 });
    expect(await readFile(outside, 'utf8')).toBe('{}');
    await rm(path);
    await mkdir(join(context.cwd, '.claude'));
    await writeFile(join(context.cwd, '.claude', 'plugin-overrides.json'), '{}');
    await expect(write()).rejects.toMatchObject({ status: 403 });
    expect(await Bun.file(path).exists()).toBe(false);
  } finally { await context.cleanup(); }
});

nativeTest('workspace overrides do not create a new registry root inside a Git workspace', async () => {
  const context = await fixture();
  try {
    await mkdir(join(context.cwd, '.git'));
    const cwd = join(context.cwd, 'nested');
    await mkdir(cwd);
    const target = { kind: 'package' as const, name: '@native-proof/plugin' };
    await new PluginManager(cwd).link(context.packageDirectory);
    const nested = new NativePlugins({ cwd, worker, agentDirectory: context.agentDirectory, settings: context.settings, extensionRoots: nativeExtensionRoots(context.settings) });
    const prospectiveRegistry = join(context.cwd, '.omp', 'plugins', 'installed_plugins.json');
    expect(await resolveOrDefaultProjectRegistryPath(cwd)).toBe(prospectiveRegistry);
    expect(await Bun.file(prospectiveRegistry).exists()).toBe(false);
    const write = (plugins: NativePlugins) => plugins.operation({
      type: 'plugins.configure', request: { expectedRevision: '0', target, settingsScope: 'workspace', enabledFeatures: ['preview'] }
    }, '1');
    expect(await nested.operation({ type: 'plugins.lifecycle' }, '0')).toMatchObject({
      type: 'plugins.lifecycle', result: { projectWritable: false, projectWriteBlock: 'registry-root-change', plugins: [{ target, workspaceWritable: false }] }
    });
    await expect(write(nested)).rejects.toMatchObject({ status: 403, details: { projectWriteBlock: 'registry-root-change' } });
    expect(await resolveOrDefaultProjectRegistryPath(cwd)).toBe(prospectiveRegistry);
    expect(await Bun.file(getProjectPluginOverridesPath(cwd)).exists()).toBe(false);

    const expectWritable = async (path: string, plugins: NativePlugins) => {
      expect(await plugins.operation({ type: 'plugins.lifecycle' }, '0')).toMatchObject({
        type: 'plugins.lifecycle', result: { projectWritable: true, plugins: [{ target, workspaceWritable: true }] }
      });
      await write(plugins);
      expect(await Bun.file(getProjectPluginOverridesPath(path)).json()).toEqual({ features: { [target.name]: ['preview'] } });
      expect(await getEnabledPlugins(path)).toContainEqual(expect.objectContaining({ name: target.name, enabledFeatures: ['preview'] }));
    };
    await expectWritable(context.cwd, context.plugins);
    await mkdir(join(cwd, '.omp'));
    await expectWritable(cwd, nested);
    const outsideGit = join(context.root, 'outside-git');
    await mkdir(outsideGit);
    await mkdir(join(context.root, '.omp'));
    expect(await resolveOrDefaultProjectRegistryPath(outsideGit)).toBe(join(context.root, '.omp', 'plugins', 'installed_plugins.json'));
    const independent = new NativePlugins({ cwd: outsideGit, worker, agentDirectory: context.agentDirectory, settings: context.settings, extensionRoots: nativeExtensionRoots(context.settings) });
    await expectWritable(outsideGit, independent);
  } finally { await context.cleanup(); }
});

for (const caseInsensitive of [false, true]) {
  nativeTest(`workspace overrides handle differently cased registry roots on case-${caseInsensitive ? 'insensitive' : 'sensitive'} filesystems`, async () => {
    const configDir = '.OMP';
    const context = await fixture(configDir);
    try {
      await mkdir(join(context.cwd, '.git'));
      const cwd = join(context.cwd, 'nested');
      await mkdir(cwd);
      const root = await fs.realpath(cwd);
      const alias = join(root, '..', 'Nested');
      if (!caseInsensitive && existsSync(alias)) return;
      const target = { kind: 'package' as const, name: '@native-proof/plugin' };
      await new PluginManager(cwd).link(context.packageDirectory);
      const nested = new NativePlugins({ cwd, worker, agentDirectory: context.agentDirectory, settings: context.settings, extensionRoots: nativeExtensionRoots(context.settings) });
      const registry = join(context.cwd, configDir, 'plugins', 'installed_plugins.json');
      expect(await resolveOrDefaultProjectRegistryPath(cwd)).toBe(registry);
      const lstat = fs.lstat;
      const probe = caseInsensitive
        ? spyOn(fs, 'lstat').mockImplementation((path, options) => lstat(path === alias ? root : path, options))
        : null;
      try {
        const lifecycle = await nested.operation({ type: 'plugins.lifecycle' }, '0');
        const write = () => nested.operation({
          type: 'plugins.configure', request: { expectedRevision: '0', target, settingsScope: 'workspace', enabledFeatures: ['preview'] }
        }, '1');
        if (caseInsensitive) {
          expect(lifecycle).toMatchObject({
            type: 'plugins.lifecycle', result: { projectWritable: false, projectWriteBlock: 'registry-root-change', plugins: [{ target, workspaceWritable: false }] }
          });
          await expect(write()).rejects.toMatchObject({ status: 403, details: { projectWriteBlock: 'registry-root-change' } });
          expect(await readdir(cwd)).toEqual([]);
        } else {
          expect(lifecycle).toMatchObject({
            type: 'plugins.lifecycle', result: { projectWritable: true, plugins: [{ target, workspaceWritable: true }] }
          });
          await write();
          expect(await Bun.file(getProjectPluginOverridesPath(cwd)).json()).toEqual({ features: { [target.name]: ['preview'] } });
          expect(await getEnabledPlugins(cwd)).toContainEqual(expect.objectContaining({ name: target.name, enabledFeatures: ['preview'] }));
        }
        expect(await resolveOrDefaultProjectRegistryPath(cwd)).toBe(registry);
      } finally { probe?.mockRestore(); }
    } finally { await context.cleanup(); }
  });
}

nativeTest('workspace overrides do not change registry discovery under a custom native config directory', async () => {
  const configDir = '.custom-omp';
  const context = await fixture(configDir);
  try {
    await mkdir(join(context.cwd, '.git'));
    const cwd = join(context.cwd, 'nested');
    await mkdir(cwd);
    const target = { kind: 'package' as const, name: '@native-proof/plugin' };
    await new PluginManager(cwd).link(context.packageDirectory);
    const nested = new NativePlugins({ cwd, worker, agentDirectory: context.agentDirectory, settings: context.settings, extensionRoots: nativeExtensionRoots(context.settings) });
    const registry = join(context.cwd, configDir, 'plugins', 'installed_plugins.json');
    expect(await resolveOrDefaultProjectRegistryPath(cwd)).toBe(registry);
    expect(await Bun.file(registry).exists()).toBe(false);
    expect(getProjectPluginOverridesPath(cwd)).toBe(join(cwd, '.omp', 'plugin-overrides.json'));
    expect(await nested.operation({ type: 'plugins.lifecycle' }, '0')).toMatchObject({
      type: 'plugins.lifecycle', result: { projectWritable: true, plugins: [{ target, workspaceWritable: true }] }
    });
    await nested.operation({
      type: 'plugins.configure', request: { expectedRevision: '0', target, settingsScope: 'workspace', enabledFeatures: ['preview'] }
    }, '1');
    expect(await Bun.file(getProjectPluginOverridesPath(cwd)).json()).toEqual({ features: { [target.name]: ['preview'] } });
    expect(await getEnabledPlugins(cwd)).toContainEqual(expect.objectContaining({ name: target.name, enabledFeatures: ['preview'] }));
    expect(await resolveOrDefaultProjectRegistryPath(cwd)).toBe(registry);
  } finally { await context.cleanup(); }
});

nativeTest('workspace overrides leave an inherited marketplace install visible to the catalog and native loader', async () => {
  const context = await fixture();
  try {
    const marketplace = join(context.root, 'inherited-marketplace');
    await mkdir(join(marketplace, '.omp-plugin'), { recursive: true });
    await mkdir(join(marketplace, 'proof'));
    await writeFile(join(marketplace, 'proof', 'package.json'), await readFile(join(context.packageDirectory, 'package.json')));
    await writeFile(join(marketplace, '.omp-plugin', 'marketplace.json'), marketplaceCatalog('inherited-proof', [{
      name: 'proof', source: './proof', version: '1.0.0', description: 'Inherited project plugin'
    }]));
    await context.plugins.operation({ type: 'plugins.marketplace.manage', request: { action: 'add', expectedRevision: '0', source: marketplace } }, '1');
    const target = { kind: 'marketplace' as const, name: 'proof', marketplace: 'inherited-proof', scope: 'project' as const };
    await context.plugins.operation({ type: 'plugins.install', request: { expectedRevision: '1', source: target } }, '2');
    const cwd = join(context.cwd, 'nested');
    await mkdir(cwd);
    const nested = new NativePlugins({ cwd, worker, agentDirectory: context.agentDirectory, settings: context.settings, extensionRoots: nativeExtensionRoots(context.settings) });
    const inherited = join(context.cwd, '.omp', 'plugins', 'installed_plugins.json');
    expect(await Bun.file(inherited).exists()).toBe(true);
    expect(await resolveOrDefaultProjectRegistryPath(cwd)).toBe(inherited);
    expect((await nested.read('2')).plugins).toContainEqual(expect.objectContaining({ target }));
    expect(await getEnabledPlugins(cwd)).toContainEqual(expect.objectContaining({ name: '@native-proof/plugin', scope: 'project' }));
    const lifecycle = await nested.operation({ type: 'plugins.lifecycle' }, '2');
    const save = await nested.operation({
      type: 'plugins.configure', request: { expectedRevision: '2', target, settingsScope: 'workspace', enabledFeatures: ['preview'] }
    }, '3').catch((error: unknown) => error);
    expect(await resolveOrDefaultProjectRegistryPath(cwd)).toBe(inherited);
    expect((await nested.read('2')).plugins).toContainEqual(expect.objectContaining({ target }));
    expect(await getEnabledPlugins(cwd)).toContainEqual(expect.objectContaining({ name: '@native-proof/plugin', scope: 'project' }));
    expect(lifecycle).toMatchObject({ type: 'plugins.lifecycle', result: { projectWritable: false } });
    expect(save).toMatchObject({ status: 403 });
    expect(await Bun.file(getProjectPluginOverridesPath(cwd)).exists()).toBe(false);
  } finally { await context.cleanup(); }
});

const marketplaceCatalog = (name: string, plugins: Array<Record<string, unknown>>) => JSON.stringify({
  name, owner: { name: 'Test' }, plugins,
});

nativeTest('only the active copy of a package can change shared workspace features', async () => {
  const context = await fixture();
  try {
    await new PluginManager(context.cwd).link(context.packageDirectory);
    const global = { kind: 'package' as const, name: '@native-proof/plugin' };
    const marketplace = join(context.root, 'shadowing-marketplace');
    await mkdir(join(marketplace, '.omp-plugin'), { recursive: true });
    await mkdir(join(marketplace, 'proof'));
    await writeFile(join(marketplace, 'proof', 'package.json'), JSON.stringify({
      name: global.name, version: '2.0.0', omp: { features: { stable: { default: true }, 'project-only': { default: true } } }
    }));
    await writeFile(join(marketplace, '.omp-plugin', 'marketplace.json'), marketplaceCatalog('shadow-proof', [{
      name: 'proof', source: './proof', version: '2.0.0', description: 'Project copy of a global package'
    }]));
    await context.plugins.operation({ type: 'plugins.marketplace.manage', request: { action: 'add', expectedRevision: '0', source: marketplace } }, '1');
    const project = { kind: 'marketplace' as const, name: 'proof', marketplace: 'shadow-proof', scope: 'project' as const };
    await context.plugins.operation({ type: 'plugins.install', request: { expectedRevision: '1', source: project } }, '2');
    expect((await context.plugins.read('2')).plugins.map(entry => entry.target)).toEqual([global, project]);
    await context.plugins.operation({
      type: 'plugins.configure', request: { expectedRevision: '2', target: project, settingsScope: 'workspace', enabledFeatures: ['stable', 'project-only'] }
    }, '3');
    const active = async () => (await getEnabledPlugins(context.cwd)).find(entry => entry.name === global.name);
    expect(await active()).toMatchObject({ scope: 'project', version: '2.0.0', enabledFeatures: ['stable', 'project-only'] });
    const lifecycle = await context.plugins.operation({ type: 'plugins.lifecycle' }, '3');
    const save = await context.plugins.operation({
      type: 'plugins.configure', request: { expectedRevision: '3', target: global, settingsScope: 'workspace', enabledFeatures: [] }
    }, '4').catch((error: unknown) => error);
    expect(await active()).toMatchObject({ scope: 'project', version: '2.0.0', enabledFeatures: ['stable', 'project-only'] });
    expect(save).toMatchObject({ status: 400 });
    await expect(context.plugins.operation({
      type: 'plugins.configure', request: { expectedRevision: '3', target: project, settingsScope: 'workspace', enabled: false, enabledFeatures: [] }
    }, '4')).rejects.toMatchObject({ status: 400 });
    expect(await active()).toMatchObject({ scope: 'project', version: '2.0.0', enabledFeatures: ['stable', 'project-only'] });
    expect(lifecycle).toMatchObject({ type: 'plugins.lifecycle', result: { plugins: [
      { target: global, globalFeaturesWritable: true, workspaceWritable: false },
      { target: project, workspaceWritable: true }
    ] } });
  } finally { await context.cleanup(); }
});

nativeTest('marketplace source management reads, adds and removes native registry entries without inventing catalogs', async () => {
  const context = await fixture();
  try {
    const empty = await context.plugins.operation({ type: 'plugins.marketplace' }, '0');
    if (empty.type !== 'plugins.marketplace') throw new Error('Expected cached marketplace state');
    expect(empty.result.sources).toEqual([]);
    expect(empty.result.updates).toEqual([]);

    const sourceRoot = join(context.root, 'source-marketplace');
    await mkdir(join(sourceRoot, '.omp-plugin'), { recursive: true });
    await writeFile(join(sourceRoot, '.omp-plugin', 'marketplace.json'), marketplaceCatalog('source-proof', []));
    await context.plugins.operation({
      type: 'plugins.marketplace.manage',
      request: { action: 'add', expectedRevision: '0', source: sourceRoot }
    }, '1');
    const catalog = await context.plugins.read('1');
    expect(catalog.marketplaceSources).toEqual([expect.objectContaining({
      name: 'source-proof', sourceType: 'local', sourceUri: sourceRoot
    })]);
    expect(catalog.marketplace).toEqual([]);

    const state = await context.plugins.operation({ type: 'plugins.marketplace' }, '1');
    if (state.type !== 'plugins.marketplace') throw new Error('Expected cached marketplace state');
    expect(state.result.sources.map(source => source.name)).toEqual(['source-proof']);

    // `list` is the manage read: it returns the same registry rows without a revision to commit.
    const listed = await context.plugins.operation({
      type: 'plugins.marketplace.manage',
      request: { action: 'list' }
    }, '1');
    if (listed.type !== 'plugins.marketplaceSources') throw new Error('Expected native marketplace source listing');
    expect(listed.result).toMatchObject({ workspaceId: worker.workspaceId, revision: '1' });
    expect(listed.result.sources).toEqual(state.result.sources);
    expect(listed.result.sources).toEqual([expect.objectContaining({ sourceType: 'local', catalogPath: expect.any(String) })]);

    await context.plugins.operation({
      type: 'plugins.marketplace.manage',
      request: { action: 'remove', expectedRevision: '1', name: 'source-proof' }
    }, '2');
    expect((await context.plugins.read('2')).marketplaceSources).toEqual([]);
  } finally { clearPluginRootsAndCaches(); await context.cleanup(); }
});

nativeTest('marketplace entries expose rich manifest metadata and update checks report from-to pairs per native scope', async () => {
  const context = await fixture();
  try {
    const marketplaceRoot = join(context.root, 'rich-marketplace');
    await mkdir(join(marketplaceRoot, '.omp-plugin'), { recursive: true });
    const pluginDirectory = join(marketplaceRoot, 'plugins', 'proof');
    await mkdir(pluginDirectory, { recursive: true });
    await writeFile(join(pluginDirectory, 'package.json'), JSON.stringify({ name: '@native-proof/plugin', version: '1.0.0' }));
    await writeFile(join(marketplaceRoot, '.omp-plugin', 'marketplace.json'), marketplaceCatalog('rich-proof', [{
      name: 'proof', source: './plugins/proof', version: '1.0.0', description: 'Rich marketplace plugin',
      author: { name: 'Native Author', email: 'author@example.invalid' }, homepage: 'https://example.invalid/home',
      repository: 'https://example.invalid/repo', license: 'MIT', keywords: ['native', 'proof'], category: 'tools',
      commands: ['proof-command'], agents: ['proof-agent'], mcpServers: { proof: { command: 'proof-server' } },
      lspServers: ['./lsp.json'],
    }]));
    const manager = new MarketplaceManager({
      marketplacesRegistryPath: getMarketplacesRegistryPath(), installedRegistryPath: getInstalledPluginsRegistryPath(),
      projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(context.cwd), marketplacesCacheDir: getMarketplacesCacheDir(),
      pluginsCacheDir: getPluginsCacheDir(), clearPluginRootsCaches: undefined
    });
    await manager.addMarketplace(marketplaceRoot);

    const catalog = await context.plugins.read('0');
    expect(catalog.marketplaceSources.map(source => source.name)).toEqual(['rich-proof']);
    expect(catalog.marketplace[0]).toMatchObject({
      marketplace: 'rich-proof', name: 'proof', version: '1.0.0',
      details: {
        author: { name: 'Native Author', email: 'author@example.invalid' },
        license: 'MIT', keywords: ['native', 'proof'], category: 'tools',
        commands: ['proof-command'], agents: ['proof-agent'], lspServers: ['./lsp.json'],
      },
    });

    await context.plugins.operation({
      type: 'plugins.install', request: {
        expectedRevision: '0',
        source: { kind: 'marketplace', name: 'proof', marketplace: 'rich-proof', scope: 'user' }
      }
    }, '1');
    await writeFile(join(marketplaceRoot, '.omp-plugin', 'marketplace.json'), marketplaceCatalog('rich-proof', [{
      name: 'proof', source: './plugins/proof', version: '2.0.0', description: 'Rich marketplace plugin'
    }]));
    await manager.updateMarketplace('rich-proof');

    const checked = await context.plugins.operation({ type: 'plugins.marketplace.checkUpdates' }, '1');
    if (checked.type !== 'plugins.updateCheck') throw new Error('Expected native update check');
    expect(checked.result.updates).toEqual([{
      pluginId: 'proof@rich-proof', scope: 'global',
      target: { kind: 'marketplace', name: 'proof', marketplace: 'rich-proof', scope: 'user' }, from: '1.0.0', to: '2.0.0'
    }]);
    expect((await context.plugins.read('1')).availableUpdates).toEqual(checked.result.updates);
  } finally { clearPluginRootsAndCaches(); await context.cleanup(); }
});

nativeTest('batch upgrade installs only outdated marketplace plugins and previews report the native change', async () => {
  const context = await fixture();
  try {
    const marketplaceRoot = join(context.root, 'upgrade-marketplace');
    await mkdir(join(marketplaceRoot, '.omp-plugin'), { recursive: true });
    for (const name of ['current', 'outdated']) {
      const pluginDirectory = join(marketplaceRoot, 'plugins', name);
      await mkdir(pluginDirectory, { recursive: true });
      await writeFile(join(pluginDirectory, 'package.json'), JSON.stringify({ name: `@native-proof/${name}`, version: '1.0.0' }));
    }
    await writeFile(join(marketplaceRoot, '.omp-plugin', 'marketplace.json'), marketplaceCatalog('upgrade-proof', [
      { name: 'current', source: './plugins/current', version: '1.0.0', description: 'Current plugin' },
      { name: 'outdated', source: './plugins/outdated', version: '1.0.0', description: 'Outdated plugin' },
    ]));
    const manager = new MarketplaceManager({
      marketplacesRegistryPath: getMarketplacesRegistryPath(), installedRegistryPath: getInstalledPluginsRegistryPath(),
      projectInstalledRegistryPath: await resolveOrDefaultProjectRegistryPath(context.cwd), marketplacesCacheDir: getMarketplacesCacheDir(),
      pluginsCacheDir: getPluginsCacheDir(), clearPluginRootsCaches: undefined
    });
    await manager.addMarketplace(marketplaceRoot);
    for (const [index, name] of ['current', 'outdated'].entries()) {
      await context.plugins.operation({
        type: 'plugins.install', request: {
          expectedRevision: index === 0 ? '0' : '1',
          source: { kind: 'marketplace', name, marketplace: 'upgrade-proof', scope: 'user' }
        }
      }, String(index + 1));
    }
    await writeFile(join(marketplaceRoot, 'plugins', 'outdated', 'package.json'), JSON.stringify({ name: '@native-proof/outdated', version: '2.0.0' }));
    await writeFile(join(marketplaceRoot, '.omp-plugin', 'marketplace.json'), marketplaceCatalog('upgrade-proof', [
      { name: 'current', source: './plugins/current', version: '1.0.0', description: 'Current plugin' },
      { name: 'outdated', source: './plugins/outdated', version: '2.0.0', description: 'Outdated plugin' },
    ]));
    await manager.updateMarketplace('upgrade-proof');

    const preview = await context.plugins.operation({
      type: 'plugins.marketplace.previewUpgrade',
      request: { target: { kind: 'marketplace', name: 'outdated', marketplace: 'upgrade-proof', scope: 'user' } }
    }, '2');
    if (preview.type !== 'plugins.upgradePreview') throw new Error('Expected native upgrade preview');
    expect(preview.result.preview).toEqual([{
      pluginId: 'outdated@upgrade-proof', scope: 'global',
      target: { kind: 'marketplace', name: 'outdated', marketplace: 'upgrade-proof', scope: 'user' },
      from: '1.0.0', to: '2.0.0', change: 'upgrade'
    }]);

    const before = (await context.plugins.read('2')).plugins.map(plugin => [plugin.name, plugin.version]);
    expect(before).toEqual([['current', '1.0.0'], ['outdated', '1.0.0']]);
    await context.plugins.operation({ type: 'plugins.marketplace.upgradeAll', request: { expectedRevision: '2' } }, '3');
    const after = (await context.plugins.read('3')).plugins.map(plugin => [plugin.name, plugin.version]);
    expect(after).toEqual([['current', '1.0.0'], ['outdated', '2.0.0']]);
    expect((await context.plugins.read('3')).availableUpdates).toEqual([]);
  } finally { clearPluginRootsAndCaches(); await context.cleanup(); }
});
