<<<<<<< HEAD
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { MCPConfigurationState, MCPConnectionTestResult, MCPConfigureRequest } from '@openchamber/agent-contract';

const configuration: MCPConfigurationState = { workspaceId: 'workspace', persistedRevision: '3', config: { servers: [{ serverId: 'tools', label: 'Tools', enabled: false, transport: { type: 'http', url: 'https://mcp.example.test' } }] } };
let pending = Promise.withResolvers<MCPConfigurationState>();
let configRead = () => Promise.resolve(configuration);
let failRead = false;
const configure = mock(async (_workspaceId: string, request: MCPConfigureRequest) => ({ kind: 'mcp' as const, status: 'no-active-workers' as const, configuration: { ...configuration, persistedRevision: '4', config: request.config }, workers: [] }));
const testServer = mock(async (): Promise<MCPConnectionTestResult> => ({ workspaceId: 'workspace', serverId: 'tools', persistedRevision: '3', status: 'connected', toolCount: 2 }));
const resolveWorkspace = mock(async () => ({ workspaceId: 'workspace', projectId: 'project', name: 'Workspace' }));
// Load the store only after installing its canonical transport seam.
const actual = await import('@/api/canonicalClient');
mock.module('@/api/canonicalClient', () => ({ ...actual, canonicalClient: {
  resolveWorkspace,
  getWorkspaceMcpConfig: async () => { if (failRead) throw new Error('offline'); return configRead(); },
  listSessions: async () => ({ items: [], errors: {} }),
  configureWorkspaceMcp: configure,
  testWorkspaceMcpServer: testServer,
} }));
const { useMcpStore, computeMcpHealth } = await import('./useMcpStore');
const { useMcpConfigStore } = await import('./useMcpConfigStore');

beforeEach(() => {
  useMcpStore.getState().resetForRuntimeSwitch();
  pending = Promise.withResolvers(); configRead = () => Promise.resolve(configuration); failRead = false;
  configure.mockClear(); testServer.mockClear(); resolveWorkspace.mockClear();
});
describe('native workspace MCP runtime consumers', () => {
  test('no sessions still exposes persisted servers, not a fabricated connected status', async () => {
    await useMcpStore.getState().refresh({ directory: '/repo' });
    const status = useMcpStore.getState().getStatusForDirectory('/repo');
    expect(status.tools.configuration).toEqual(configuration.config.servers[0]);
    expect(status.tools.catalogs).toEqual([]);
    expect(computeMcpHealth(status)).toEqual({ connected: 0, total: 1, hasFailed: false });
  });
  test('enable and disable persist through workspace CAS rather than transient connect/disconnect', async () => {
    await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
    await useMcpStore.getState().connect('tools', '/repo');
    expect(configure.mock.calls[0][1]).toEqual({ expectedPersistedRevision: '3', config: { servers: [{ ...configuration.config.servers[0], enabled: true }] } });
    await useMcpStore.getState().disconnect('tools', '/repo');
    expect(configure.mock.calls[1][1].config.servers[0].enabled).toBe(false);
  });
  test('testing a disabled server uses an isolated probe and does not alter configuration or worker catalogs', async () => {
    const result = await useMcpStore.getState().testConnection('tools', '/repo');
    expect(result.status).toBe('connected');
    expect(testServer.mock.calls).toHaveLength(1);
    expect(configure).not.toHaveBeenCalled();
    expect(useMcpStore.getState().getStatusForDirectory('/repo').tools.configuration.enabled).toBe(false);
    expect(computeMcpHealth(useMcpStore.getState().getStatusForDirectory('/repo')).connected).toBe(0);
  });
  test('a failed status read leaves authoritative prior data and exposes its failure', async () => {
    await useMcpStore.getState().refresh({ directory: '/repo' });
    failRead = true;
    await useMcpStore.getState().refresh({ directory: '/repo' });
    expect(Object.keys(useMcpStore.getState().getStatusForDirectory('/repo'))).toEqual(['tools']);
    expect(useMcpStore.getState().getErrorForDirectory('/repo')).toBe('offline');
  });
  test('runtime switch rejects an in-flight status and configuration read', async () => {
    configRead = () => pending.promise;
    const refresh = useMcpStore.getState().refresh({ directory: '/repo' });
    useMcpStore.getState().resetForRuntimeSwitch();
    pending.resolve(configuration); await refresh;
    expect(useMcpStore.getState().getStatusForDirectory('/repo')).toEqual({});
    expect(useMcpConfigStore.getState().configurationsByDirectory).toEqual({});
  });
  test('concurrent panel freshness requests use one authoritative read', async () => {
    configRead = () => pending.promise;
    const first = useMcpStore.getState().ensureFresh({ directory: '/repo', maxAgeMs: 60000 });
    const second = useMcpStore.getState().ensureFresh({ directory: '/repo', maxAgeMs: 60000 });
    pending.resolve(configuration); await Promise.all([first, second]);
    expect(resolveWorkspace).toHaveBeenCalledTimes(1);
=======
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { opencodeClient } from '@/lib/opencode/client';
import type { McpServerStatus } from '@/lib/opencode/model';
import { useMcpStore } from './useMcpStore';
import { useMcpConfigStore, type McpDraft } from './useMcpConfigStore';

const DIRECTORY = '/workspace/project';

type ServerState = McpServerStatus['status'];

// OpenCode's transitions as a real 2.2.0 host shows them: connect starts the
// server, disconnect leaves it `disabled` until someone connects it again.
let server: ServerState | null;
const spies: Array<{ mockRestore: () => void }> = [];
let disconnects = 0;
let connects = 0;

beforeEach(() => {
  disconnects = 0;
  connects = 0;
  useMcpStore.getState().resetForRuntimeSwitch();
  spies.push(
    spyOn(opencodeClient, 'listMcpServers').mockImplementation(async () => (server ? [{ name: 'lab', status: server }] : [])),
    spyOn(opencodeClient, 'connectMcpServer').mockImplementation(async () => {
      connects += 1;
      server = { status: 'connected' };
    }),
    spyOn(opencodeClient, 'disconnectMcpServer').mockImplementation(async () => {
      disconnects += 1;
      server = { status: 'disabled' };
    }),
  );
});

afterEach(() => {
  for (const spy of spies.splice(0)) spy.mockRestore();
});

const testFrom = async (before: ServerState | null) => {
  server = before;
  await useMcpStore.getState().refresh({ directory: DIRECTORY, silent: true });
  const result = await useMcpStore.getState().testConnection('lab', DIRECTORY);
  return { result, after: useMcpStore.getState().getStatusForDirectory(DIRECTORY).lab?.status.status };
};

describe('testConnection', () => {
  const repairable: ServerState[] = [
    { status: 'failed', error: 'process exited with code 1' },
    { status: 'needs_auth', error: 'sign in required' },
    { status: 'pending' },
  ];
  for (const before of repairable) {
    test(`a ${before.status} server that now connects stays connected`, async () => {
      const { result, after } = await testFrom(before);

      expect(result.status?.status.status).toBe('connected');
      expect(disconnects).toBe(0);
      expect(after).toBe('connected');
    });
  }

  test('a server with no status held yet stays connected', async () => {
    const { after } = await testFrom(null);

    expect(disconnects).toBe(0);
    expect(after).toBe('connected');
  });

  test('a server the user turned off is turned off again after the test', async () => {
    const { result, after } = await testFrom({ status: 'disabled' });

    expect(result.status?.status.status).toBe('connected');
    expect(disconnects).toBe(1);
    expect(after).toBe('disabled');
  });

  test('a connected server is left connected', async () => {
    const { after } = await testFrom({ status: 'connected' });

    expect(disconnects).toBe(0);
    expect(after).toBe('connected');
  });
});

describe('setEnabled', () => {
  const configStore = useMcpConfigStore.getState();
  let updates: Array<[string, Partial<McpDraft>, string | null | undefined]>;

  // `configured` is what the config file says; null means no file defines it.
  const withConfig = (configured: { disabled?: boolean } | null) => {
    updates = [];
    const entries = configured ? [{ name: 'lab', type: 'local' as const, command: ['lab'], ...configured }] : [];
    useMcpConfigStore.setState({
      serversByDirectory: { [DIRECTORY]: entries },
      loadMcpConfigs: async () => true,
      updateMcp: async (name, config, directory) => {
        updates.push([name, config, directory]);
        return { ok: true };
      },
    });
  };

  afterEach(() => {
    useMcpConfigStore.setState({
      serversByDirectory: {},
      loadMcpConfigs: configStore.loadMcpConfigs,
      updateMcp: configStore.updateMcp,
    });
  });

  test('switching off a configured server writes it off in its config file', async () => {
    withConfig({});
    server = { status: 'connected' };
    await useMcpStore.getState().setEnabled('lab', false, DIRECTORY);

    expect(updates).toEqual([['lab', { disabled: true }, DIRECTORY]]);
    expect(disconnects).toBe(1);
  });

  test('switching on a server its config turns off writes it on', async () => {
    withConfig({ disabled: true });
    server = { status: 'disabled' };
    await useMcpStore.getState().setEnabled('lab', true, DIRECTORY);

    expect(updates).toEqual([['lab', { disabled: false }, DIRECTORY]]);
    expect(connects).toBe(0);
  });

  test('switching on a server its config enables reconnects without a write', async () => {
    withConfig({});
    server = { status: 'failed', error: 'process exited with code 1' };
    await useMcpStore.getState().setEnabled('lab', true, DIRECTORY);

    expect(updates).toEqual([]);
    expect(useMcpStore.getState().getStatusForDirectory(DIRECTORY).lab?.status.status).toBe('connected');
  });

  test('a server no config file defines is only disconnected', async () => {
    withConfig(null);
    server = { status: 'connected' };
    await useMcpStore.getState().setEnabled('lab', false, DIRECTORY);

    expect(updates).toEqual([]);
    expect(disconnects).toBe(1);
>>>>>>> bc50ba56a
  });
});
