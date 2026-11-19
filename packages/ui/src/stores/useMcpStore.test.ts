import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { MCPConfigurationState, MCPConnectionTestResult, MCPConfigureRequest } from '@openchamber/agent-contract';

<<<<<<< HEAD
const configuration: MCPConfigurationState = { workspaceId: 'workspace', persistedRevision: '3', config: { servers: [{ serverId: 'tools', label: 'Tools', enabled: false, scope: 'project' as const, transport: { type: 'http', url: 'https://mcp.example.test' } }] } };
let pending = Promise.withResolvers<MCPConfigurationState>();
let configRead = () => Promise.resolve(configuration);
let failRead = false;
const configure = mock(async (_workspaceId: string, request: MCPConfigureRequest) => ({ kind: 'mcp' as const, status: 'no-active-workers' as const, outcome: 'applied' as const, configuration: { ...configuration, persistedRevision: '4', config: request.config }, workers: [] }));
const testServer = mock(async (): Promise<MCPConnectionTestResult> => ({ workspaceId: 'workspace', serverId: 'tools', persistedRevision: '3', status: 'connected', toolCount: 2 }));
const resolveWorkspace = mock(async () => ({ workspaceId: 'workspace', projectId: 'project', name: 'Workspace' }));
// Load the store only after installing its canonical transport seam.
const actual = await import('@/api/canonicalClient');
mock.module('@/api/canonicalClient', () => ({
  ...actual, canonicalClient: {
    resolveWorkspace,
    getWorkspaceMcpConfig: async () => { if (failRead) throw new Error('offline'); return configRead(); },
    listSessions: async () => ({ items: [], errors: {} }),
    configureWorkspaceMcp: configure,
    testWorkspaceMcpServer: testServer,
  }
}));
const { useMcpStore, computeMcpHealth } = await import('./useMcpStore');
const { useMcpConfigStore } = await import('./useMcpConfigStore');
||||||| bc50ba56aa
const DIRECTORY = '/workspace/project';

type ServerState = McpServerStatus['status'];

// OpenCode's transitions as a real 2.2.0 host shows them: connect starts the
// server, disconnect leaves it `disabled` until someone connects it again.
let server: ServerState | null;
const spies: Array<{ mockRestore: () => void }> = [];
let disconnects = 0;
let connects = 0;
=======
const DIRECTORY = '/workspace/project';

type ServerState = McpServerStatus['status'];

// OpenCode's transitions as a real 2.2.0 host shows them: connect starts the
// server, disconnect leaves it `disabled` until someone connects it again.
let server: ServerState | null;
const spies: Array<{ mockRestore: () => void }> = [];
let disconnects = 0;
let connects = 0;
let reads = 0;
let statusResponse: Promise<McpServerStatus[]> | null = null;
>>>>>>> upstream/main

beforeEach(() => {
<<<<<<< HEAD
||||||| bc50ba56aa
  disconnects = 0;
  connects = 0;
=======
  disconnects = 0;
  connects = 0;
  reads = 0;
  statusResponse = null;
>>>>>>> upstream/main
  useMcpStore.getState().resetForRuntimeSwitch();
<<<<<<< HEAD
  pending = Promise.withResolvers(); configRead = () => Promise.resolve(configuration); failRead = false;
  configure.mockClear(); testServer.mockClear(); resolveWorkspace.mockClear();
||||||| bc50ba56aa
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
=======
  spies.push(
    spyOn(opencodeClient, 'listMcpServers').mockImplementation(async () => {
      reads += 1;
      return statusResponse ?? (server ? [{ name: 'lab', status: server }] : []);
    }),
    spyOn(opencodeClient, 'connectMcpServer').mockImplementation(async () => {
      connects += 1;
      server = { status: 'connected' };
    }),
    spyOn(opencodeClient, 'disconnectMcpServer').mockImplementation(async () => {
      disconnects += 1;
      server = { status: 'disabled' };
    }),
  );
>>>>>>> upstream/main
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
<<<<<<< HEAD
  test('a failed status read leaves authoritative prior data and exposes its failure', async () => {
    await useMcpStore.getState().refresh({ directory: '/repo' });
    failRead = true;
    await useMcpStore.getState().refresh({ directory: '/repo' });
    expect(Object.keys(useMcpStore.getState().getStatusForDirectory('/repo'))).toEqual(['tools']);
    expect(useMcpStore.getState().getErrorForDirectory('/repo')).toBe('offline');
||||||| bc50ba56aa
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
=======
});

test('concurrent freshness requests share one status read and both receive its result', async () => {
  let release: ((servers: McpServerStatus[]) => void) | undefined;
  statusResponse = new Promise((resolve) => { release = resolve; });
  const store = useMcpStore.getState();
  const options = { directory: DIRECTORY, silent: true, maxAgeMs: 60_000 };
  const first = store.ensureFresh(options);
  const second = store.ensureFresh(options);

  try {
    expect(reads).toBe(1);
  } finally {
    release?.([{ name: 'lab', status: { status: 'connected' } }]);
    await Promise.all([first, second]);
  }
  expect(store.getStatusForDirectory(DIRECTORY).lab?.status.status).toBe('connected');
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
>>>>>>> upstream/main
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
  });
});
