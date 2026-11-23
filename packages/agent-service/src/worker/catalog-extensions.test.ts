import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Settings, resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { cfgDisabledExtensions } from '@oh-my-pi/pi-coding-agent/extensibility/settings';
import { cfgDisabledProviders, cfgEnabledProviders } from '@oh-my-pi/pi-coding-agent/config/model-settings';
import { getAllProvidersInfo } from '@oh-my-pi/pi-coding-agent/discovery';
import { reset } from '@oh-my-pi/pi-coding-agent/capability';
import { NativeExtensions } from './catalog-extensions.ts';
import { nativeExtensionRoots } from './native-runtime.ts';

beforeEach(resetSettingsForTest);
afterEach(() => {
  resetSettingsForTest();
  reset();
});

const worker = { rootSessionId: 'session', workspaceId: 'workspace', workerGeneration: 'generation' };

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'catalog-extensions-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(join(cwd, '.git'), { recursive: true });
  await mkdir(join(agentDirectory), { recursive: true });
  await mkdir(join(cwd, '.agents', 'skills', 'lint-fix'), { recursive: true });
  await writeFile(join(cwd, '.agents', 'skills', 'lint-fix', 'SKILL.md'),
    '---\nname: lint-fix\ndescription: Fix lint failures\n---\nPROJECT_BODY\n');
  const settings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  const extensions = new NativeExtensions({
    cwd, agentDirectory, worker, settings, extensionRoots: nativeExtensionRoots(settings),
  });
  return {
    settings, cwd, agentDirectory, extensions,
    async close() {
      settings.cancelPendingSaves();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('inventory keeps every registered provider, including providers with no rows', async () => {
  const f = await fixture();
  try {
    const inventory = await f.extensions.readInventory();
    expect(inventory.providers.map(provider => provider.id)).toEqual(getAllProvidersInfo().map(provider => provider.id));
    expect(inventory.providers.some(provider => provider.itemCount === 0)).toBe(true);
    const agents = inventory.providers.find(provider => provider.id === 'agents');
    expect(agents?.itemCount).toBeGreaterThan(0);
    const skill = inventory.items.find(item => item.name === 'lint-fix');
    expect(skill?.providerId).toBe('agents');
    expect(skill?.kind).toBe('skill');
    expect(skill?.toggleable).toBe(true);
    expect(inventory.kinds.find(entry => entry.kind === 'skill')?.label.length).toBeGreaterThan(0);
  } finally { await f.close(); }
});

test('display paths never leak absolute host paths', async () => {
  const f = await fixture();
  try {
    const inventory = await f.extensions.readInventory();
    const serialized = JSON.stringify(inventory);
    expect(serialized).not.toContain(f.agentDirectory);
    expect(serialized).not.toContain(f.cwd);
    const skill = inventory.items.find(item => item.name === 'lint-fix');
    expect(skill?.path).toBe('<workspace>/.agents/skills/lint-fix/SKILL.md');
    expect(skill?.content).toContain('PROJECT_BODY');
  } finally { await f.close(); }
});

test('provider switches persist to native disabledProviders and refresh reflects them', async () => {
  const f = await fixture();
  try {
    const before = await f.extensions.readInventory();
    expect(before.providers.find(provider => provider.id === 'agents')?.enabled).toBe(true);
    const result = await f.extensions.toggle({ expectedRevision: '0', providerId: 'agents', enabled: false }, '1');
    expect(result.type).toBe('extensions.inventory');
    expect(result.state.revision).toBe('1');
    expect(cfgDisabledProviders.get(f.settings)).toContain('agents');
    const after = await f.extensions.readInventory();
    expect(after.providers.find(provider => provider.id === 'agents')?.enabled).toBe(false);
    // Native discovery suppresses a disabled provider's rows entirely, so the
    // switch shows in the provider strip rather than as per-row state.
    expect(after.items.some(item => item.providerId === 'agents')).toBe(false);
    const second = await Settings.loadIsolated({ cwd: f.cwd, agentDir: f.agentDirectory });
    expect(cfgDisabledProviders.get(second)).toContain('agents');
  } finally { await f.close(); }
});

test('user-source opt-out writes enabledProviders only and leaves disabledProviders untouched', async () => {
  const f = await fixture();
  try {
    const before = await f.extensions.readInventory();
    const provider = before.providers.find(candidate => candidate.id === 'opencode');
    expect(provider?.foreignUserSource).toBe(true);
    const disabledBefore = [...cfgDisabledProviders.get(f.settings)];
    await f.extensions.toggle({ expectedRevision: '0', providerId: 'opencode', enabled: false, userSource: true }, '1');
    expect(cfgDisabledProviders.get(f.settings)).toEqual(disabledBefore);
    expect(cfgEnabledProviders.get(f.settings)).not.toContain('opencode');
  } finally { await f.close(); }
});

test('item switches persist disabledExtensions and refresh reflects them', async () => {
  const f = await fixture();
  try {
    const inventory = await f.extensions.readInventory();
    const skill = inventory.items.find(item => item.name === 'lint-fix');
    if (skill === undefined) throw new Error('Missing skill row');
    expect(skill.enabled).toBe(true);
    await f.extensions.toggle({ expectedRevision: '0', providerId: skill.providerId, extensionId: skill.id, enabled: false }, '1');
    expect(cfgDisabledExtensions.get(f.settings)).toContain('skill:lint-fix');
    const disabled = (await f.extensions.readInventory()).items.find(item => item.id === skill.id);
    expect(disabled?.enabled).toBe(false);
    expect(disabled?.disabledReason).toBe('item-disabled');
    await f.extensions.toggle({ expectedRevision: '1', providerId: skill.providerId, extensionId: skill.id, enabled: true }, '2');
    expect(cfgDisabledExtensions.get(f.settings)).not.toContain('skill:lint-fix');
    expect((await f.extensions.readInventory()).items.find(item => item.id === skill.id)?.enabled).toBe(true);
  } finally { await f.close(); }
});

test('rows without a native per-item switch are not toggleable', async () => {
  const f = await fixture();
  try {
    const inventory = await f.extensions.readInventory();
    for (const row of inventory.items.filter(item => item.kind === 'ssh')) {
      expect(row.toggleable).toBe(false);
    }
  } finally { await f.close(); }
});

test('SSH aliases from a single file have unique IDs independent of file order', async () => {
  const f = await fixture();
  try {
    const path = join(f.cwd, 'ssh.json');
    const first = { host: 'shared-host.invalid' };
    const second = { host: 'shared-host.invalid', port: 2222 };
    const readIds = async () => new Map((await f.extensions.readInventory()).items
      .filter(item => item.providerId === 'ssh-json' && item.scope === 'project')
      .map(item => [item.name, item.id]));
    await writeFile(path, JSON.stringify({ hosts: { first, second } }));
    const ids = await readIds();
    expect([...ids.keys()].sort()).toEqual(['first', 'second']);
    expect(new Set(ids.values()).size).toBe(2);
    await writeFile(path, JSON.stringify({ hosts: { second, first } }));
    expect(await readIds()).toEqual(ids);
  } finally { await f.close(); }
});

test('MCP rows publish only sanitized connection facts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-extensions-secrets-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(join(cwd, '.git'), { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  await mkdir(join(cwd, '.omp'), { recursive: true });
  await writeFile(join(cwd, '.omp', 'mcp.json'), JSON.stringify({
    mcpServers: {
      private: {
        command: 'private-binary', args: ['--token', 'SECRET_TOKEN'], env: { PRIVATE_ENV: 'SECRET_ENV' },
        url: 'https://example.test/mcp', headers: { Authorization: 'SECRET_HEADER' },
      },
    }
  }, null, 2));
  const settings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  try {
    const inventory = await new NativeExtensions({
      cwd, agentDirectory, worker, settings, extensionRoots: nativeExtensionRoots(settings),
    }).readInventory();
    const serialized = JSON.stringify(inventory);
    for (const secret of ['SECRET_TOKEN', 'SECRET_ENV', 'SECRET_HEADER', 'private-binary', agentDirectory, cwd]) {
      expect(serialized).not.toContain(secret);
    }
    const mcp = inventory.items.find(item => item.name === 'private');
    expect(mcp?.metadata).toMatchObject({ transport: expect.any(String), host: 'example.test' });
  } finally {
    settings.cancelPendingSaves();
    await rm(root, { recursive: true, force: true });
  }
});

test('server refuses toggling shadowed rows and leaves native settings unchanged', async () => {
  const root = await mkdtemp(join(tmpdir(), 'catalog-extensions-shadow-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(join(cwd, '.git'), { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  await mkdir(join(cwd, '.omp', 'skills', 'dup-skill'), { recursive: true });
  await writeFile(join(cwd, '.omp', 'skills', 'dup-skill', 'SKILL.md'), '---\nname: dup-skill\ndescription: Winner\n---\nWINNER');
  await mkdir(join(cwd, '.agents', 'skills', 'dup-skill'), { recursive: true });
  await writeFile(join(cwd, '.agents', 'skills', 'dup-skill', 'SKILL.md'), '---\nname: dup-skill\ndescription: Shadowed\n---\nSHADOWED');

  const settings = await Settings.loadIsolated({ cwd, agentDir: agentDirectory });
  try {
    const ext = new NativeExtensions({
      cwd, agentDirectory, worker, settings, extensionRoots: nativeExtensionRoots(settings),
    });
    const inventory = await ext.readInventory();
    const winner = inventory.items.find(item => item.name === 'dup-skill' && !item.shadowed);
    const shadowed = inventory.items.find(item => item.name === 'dup-skill' && item.shadowed);
    expect(winner).toBeDefined();
    expect(winner?.enabled).toBe(true);
    expect(shadowed).toBeDefined();
    expect(shadowed?.enabled).toBe(false);
    expect(shadowed?.shadowedBy).toContain(winner?.path ?? '');

    const disabledBefore = [...cfgDisabledExtensions.get(settings)];
    await expect(ext.toggle({
      expectedRevision: '0',
      providerId: shadowed!.providerId,
      extensionId: shadowed!.id,
      enabled: false,
    }, '1')).rejects.toThrow(/Shadowed extension items cannot be toggled/);

    expect(cfgDisabledExtensions.get(settings)).toEqual(disabledBefore);
    const refreshed = await ext.readInventory();
    const winnerAfter = refreshed.items.find(item => item.name === 'dup-skill' && !item.shadowed);
    expect(winnerAfter?.enabled).toBe(true);
  } finally {
    settings.cancelPendingSaves();
    await rm(root, { recursive: true, force: true });
  }
});
