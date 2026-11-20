import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { MCPConfigurationState, MCPConnectionTestResult, MCPConfigureRequest } from '@openchamber/agent-contract';

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
  });
});
