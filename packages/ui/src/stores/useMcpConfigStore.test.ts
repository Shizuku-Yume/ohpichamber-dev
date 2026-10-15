import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { MCPApplyResult, MCPConfigurationState, MCPConfigureRequest, MCPServerConfig } from '@openchamber/agent-contract';

const server: MCPServerConfig = { serverId: 'tools', label: 'Tools', enabled: true, transport: { type: 'stdio', command: 'mcp-tools', args: [] } };
let current: MCPConfigurationState;
let readFailure: Error | null;
let writeFailure: Error | null;
let captured: MCPConfigureRequest[];
let pendingRead: Promise<MCPConfigurationState> | null;
const realClient = await import('@/api/canonicalClient');
const { CanonicalApiError } = realClient;
const resolveWorkspace = mock(async (directory: string) => ({ workspaceId: directory === '/other' ? 'other' : 'workspace', projectId: 'project', name: 'Workspace' }));
mock.module('@/api/canonicalClient', () => ({ ...realClient, canonicalClient: {
  resolveWorkspace,
  getWorkspaceMcpConfig: async () => { if (readFailure) throw readFailure; return pendingRead ?? current; },
  configureWorkspaceMcp: async (_workspaceId: string, request: MCPConfigureRequest): Promise<MCPApplyResult> => {
    captured.push(request);
    if (writeFailure) throw writeFailure;
    current = { ...current, persistedRevision: String(BigInt(current.persistedRevision) + 1n), config: request.config };
    return { kind: 'mcp', status: 'no-active-workers', configuration: current, workers: [] };
  },
  applyWorkspaceMcp: async (): Promise<MCPApplyResult> => ({ kind: 'mcp', status: 'no-active-workers', configuration: current, workers: [] }),
} }));
const { useMcpConfigStore } = await import('./useMcpConfigStore');

beforeEach(() => {
  useMcpConfigStore.getState().resetForRuntimeSwitch();
  current = { workspaceId: 'workspace', persistedRevision: '4', config: { servers: [server] } };
  captured = []; readFailure = null; writeFailure = null; pendingRead = null; resolveWorkspace.mockClear();
});
describe('workspace MCP configuration consumers', () => {
  test('read and toggle use workspace CAS without creating a session', async () => {
    expect(await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' })).toBe(true);
    const result = await useMcpConfigStore.getState().updateMcp('tools', { enabled: false }, '/repo');
    expect(result.ok).toBe(true);
    expect(captured).toEqual([{ expectedPersistedRevision: '4', config: { servers: [{ ...server, enabled: false }] } }]);
    expect(useMcpConfigStore.getState().getMcpByName('tools', '/repo')?.enabled).toBe(false);
    expect(resolveWorkspace.mock.calls.map(call => call[0])).toEqual(['/repo', '/repo']);
  });
  test('failed authoritative reads and failed writes preserve the last valid configuration', async () => {
    await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
    readFailure = new Error('offline');
    expect(await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' })).toBe(false);
    expect(useMcpConfigStore.getState().getMcpServersForDirectory('/repo')).toEqual([server]);
    writeFailure = new Error('conflict');
    const result = await useMcpConfigStore.getState().deleteMcp('tools', '/repo');
    expect(result.ok).toBe(false);
    expect(useMcpConfigStore.getState().getMcpServersForDirectory('/repo')).toEqual([server]);
  });
  test('partial apply exposes failure but retains the persisted revision for the next edit', async () => {
    await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
    const partial: MCPApplyResult = { kind: 'mcp', status: 'partial', configuration: { ...current, persistedRevision: '5', config: { servers: [{ ...server, enabled: false }] } }, workers: [
      { worker: { workspaceId: 'workspace', rootSessionId: 'root_a', workerGeneration: 'generation_a' }, outcome: 'applied', revisions: { runtimeStatus: 'ready', appliedRevision: '5', catalogRevision: '2' } },
      { worker: { workspaceId: 'workspace', rootSessionId: 'root_b', workerGeneration: 'generation_b' }, outcome: 'failed', revisions: { runtimeStatus: 'ready', appliedRevision: '4', catalogRevision: '1' }, error: { code: 'MCP_APPLY_FAILED', detail: 'Worker could not apply.', retryable: true } },
    ] };
    writeFailure = new CanonicalApiError({ type: 'urn:problem:MCP_APPLY_FAILED', title: 'Incomplete', status: 503, detail: 'Worker could not apply.', code: 'MCP_APPLY_FAILED', retryable: true, details: { result: partial } });
    const result = await useMcpConfigStore.getState().updateMcp('tools', { enabled: false }, '/repo');
    expect(result.ok).toBe(false);
    expect(result.result).toEqual(partial);
    expect(useMcpConfigStore.getState().configurationsByDirectory['/repo'].persistedRevision).toBe('5');
    writeFailure = null;
    await useMcpConfigStore.getState().updateMcp('tools', { label: 'Renamed' }, '/repo');
    expect(captured[1].expectedPersistedRevision).toBe('5');
  });
  test('an older load cannot resurrect a server deleted after that load started', async () => {
    await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
    let finish!: (value: MCPConfigurationState) => void;
    pendingRead = new Promise(resolve => { finish = resolve; });
    const old = current;
    const loading = useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
    await useMcpConfigStore.getState().deleteMcp('tools', '/repo');
    finish(old); await loading;
    expect(useMcpConfigStore.getState().getMcpServersForDirectory('/repo')).toEqual([]);
  });
  test('a runtime switch drops old reads, drafts and configuration', async () => {
    let finish!: (value: MCPConfigurationState) => void;
    pendingRead = new Promise(resolve => { finish = resolve; });
    const loading = useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
    useMcpConfigStore.getState().resetForRuntimeSwitch();
    finish(current); await loading;
    expect(useMcpConfigStore.getState().getMcpServersForDirectory('/repo')).toEqual([]);
    expect(useMcpConfigStore.getState().configurationsByDirectory).toEqual({});
  });
  test('unregistered directory fails instead of silently loading a global workspace', async () => {
    expect(await useMcpConfigStore.getState().loadMcpConfigs({ directory: null })).toBe(false);
    expect(resolveWorkspace).not.toHaveBeenCalled();
  });
});
