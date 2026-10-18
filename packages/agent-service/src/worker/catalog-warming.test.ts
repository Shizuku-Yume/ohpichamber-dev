import { afterEach, beforeEach, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Settings, resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { cfgProvidersCacheWarming } from '@oh-my-pi/pi-coding-agent/session/settings';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import type { AgentSession } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import { createAgentSession } from '@oh-my-pi/pi-coding-agent/sdk';
import { NativeCacheWarming } from './catalog-warming.ts';
import { openNativeRuntime, type NativeWorkerRuntime } from './native-runtime.ts';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'native-cache-warming-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd);
  await mkdir(agentDirectory);
  return { root, cwd, agentDirectory };
}

test('native warming flush reopens from workspace disk and does not change shared or sibling config', async () => {
  const { root, cwd, agentDirectory } = await fixture();
  const sharedConfig = join(agentDirectory, 'config.yml');
  const sibling = join(root, 'sibling');
  const network = spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Warming config must not call a provider'); });
  try {
    await mkdir(sibling);
    await mkdir(join(cwd, '.omp'));
    await writeFile(sharedConfig, 'providers:\n  cacheWarming: streaming\n');
    await writeFile(join(cwd, '.omp', 'config.yml'), 'providers:\n  cacheRetention: long\n');
    const warming = new NativeCacheWarming({ cwd, agentDirectory });
    const other = new NativeCacheWarming({ cwd: sibling, agentDirectory });
    expect(await warming.read('workspace', '0')).toEqual({ workspaceId: 'workspace', revision: '0', mode: 'streaming' });
    const sharedBefore = await readFile(sharedConfig, 'utf8');
    for (const [index, mode] of (['off', 'streaming', 'idle'] as const).entries()) {
      const revision = String(index + 1);
      expect(await warming.persist('workspace', mode, revision)).toEqual({ workspaceId: 'workspace', revision, mode });
      const reopened = await Settings.loadReadOnly({ cwd, agentDir: agentDirectory });
      expect(cfgProvidersCacheWarming.get(reopened)).toBe(mode);
      expect(await new NativeCacheWarming({ cwd, agentDirectory }).read('workspace', revision)).toEqual({ workspaceId: 'workspace', revision, mode });
      expect((await other.read('sibling', '0')).mode).toBe('streaming');
    }
    expect(await readFile(sharedConfig, 'utf8')).toBe(sharedBefore);
    expect(await readFile(join(cwd, '.omp', 'config.yml'), 'utf8')).toContain('cacheRetention: long');
    expect(network).not.toHaveBeenCalled();
  } finally {
    network.mockRestore();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('a native live session applies all warming modes without persisting session overrides or sending turns', async () => {
  const { root, cwd, agentDirectory } = await fixture();
  const network = spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Warming mode application must not call a provider'); });
  let runtime: NativeWorkerRuntime | undefined;
  let session: AgentSession | undefined;
  try {
    const warming = new NativeCacheWarming({ cwd, agentDirectory });
    await warming.persist('workspace', 'off', '1');
    runtime = await openNativeRuntime({ cwd, agentDirectory });
    const result = await createAgentSession({
      cwd, agentDir: agentDirectory, settings: runtime.settings, authStorage: runtime.authStorage,
      modelRegistry: runtime.modelRegistry, initialModelRefreshStrategy: 'offline',
      sessionManager: SessionManager.inMemory(cwd),
      enableMCP: false, enableLsp: false, disableExtensionDiscovery: true,
      toolNames: [], restrictToolNames: true, skills: [], rules: [], contextFiles: [], promptTemplates: [], slashCommands: [],
    });
    session = result.session;
    const live = new NativeCacheWarming({ cwd, agentDirectory, session });
    const before = await readFile(join(cwd, '.omp', 'config.yml'), 'utf8');
    for (const mode of ['streaming', 'idle', 'off'] as const) {
      expect(live.apply(mode)).toBe(mode);
      expect(cfgProvidersCacheWarming.get(session.settings)).toBe(mode);
      expect((await live.read('workspace', '1')).mode).toBe('off');
    }
    expect(session.messages).toHaveLength(0);
    expect(await readFile(join(cwd, '.omp', 'config.yml'), 'utf8')).toBe(before);
    expect(network).not.toHaveBeenCalled();
  } finally {
    await session?.dispose();
    runtime?.authStorage.close();
    runtime?.settings.cancelPendingSaves();
    network.mockRestore();
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});

test('warming validates before disk writes and reports unavailable live application explicitly', async () => {
  const { root, cwd, agentDirectory } = await fixture();
  try {
    const warming = new NativeCacheWarming({ cwd, agentDirectory });
    await expect(warming.persist('workspace', 'off', '0')).rejects.toThrow();
    await expect(warming.persist('workspace', 'off', '18446744073709551616')).rejects.toThrow();
    expect((await warming.read('workspace', '0')).mode).toBe('idle');
    expect(() => warming.apply('off')).toThrow('No native session');
    const rejecting = new NativeCacheWarming({ cwd, agentDirectory, session: {
      setCacheWarmingMode: () => { throw new Error('private native failure'); },
    } });
    expect(() => rejecting.apply('idle')).toThrow('Native cache warming mode could not be applied');
    const mismatched = new NativeCacheWarming({ cwd, agentDirectory, session: { setCacheWarmingMode: () => 'off' } });
    expect(() => mismatched.apply('idle')).toThrow('Native cache warming mode could not be applied');
  } finally {
    resetSettingsForTest();
    await rm(root, { recursive: true, force: true });
  }
});
