<<<<<<< HEAD
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { MCPApplyResult, MCPConfigurationState, MCPConfigureRequest, MCPServerConfig } from '@openchamber/agent-contract';
import { MCPApplyResultSchema } from '@openchamber/agent-contract';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
||||||| bc50ba56aa
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { McpDraft } from './useMcpConfigStore';
=======
import { beforeEach, describe, expect, test } from 'bun:test';
import type { McpDraft } from './useMcpConfigStore';
import { directoryEnvironment } from './test-support/directoryEnvironment';

const environment = directoryEnvironment({ home: '/workspace', fakeTimers: false });
>>>>>>> upstream/main

const server: MCPServerConfig = { serverId: 'tools', label: 'Tools', enabled: true, scope: 'project' as const, transport: { type: 'stdio', command: 'mcp-tools', args: [] } };
let current: MCPConfigurationState;
let readFailure: Error | null;
let writeFailure: Error | null;
let captured: MCPConfigureRequest[];
let pendingRead: Promise<MCPConfigurationState> | null;
const realClient = await import('@/api/canonicalClient');
const { CanonicalApiError } = realClient;
const resolveWorkspace = mock(async (directory: string) => ({ workspaceId: directory === '/other' ? 'other' : 'workspace', projectId: 'project', name: 'Workspace' }));
mock.module('@/api/canonicalClient', () => ({
  ...realClient, canonicalClient: {
    resolveWorkspace,
    getWorkspaceMcpConfig: async () => { if (readFailure) throw readFailure; return pendingRead ?? current; },
    configureWorkspaceMcp: async (_workspaceId: string, request: MCPConfigureRequest): Promise<MCPApplyResult> => {
      captured.push(request);
      // The substitute endpoint enforces the workspace owner's compare-and-set revision.
      if (request.expectedPersistedRevision !== current.persistedRevision) throw new Error('CATALOG_CONFLICT');
      if (writeFailure) {
        // A rejected apply that still committed carries its persisted configuration.
        const persisted = writeFailure instanceof CanonicalApiError ? MCPApplyResultSchema.safeParse(writeFailure.problem.details?.result) : undefined;
        if (persisted?.success) current = persisted.data.configuration;
        throw writeFailure;
      }
      current = { ...current, persistedRevision: String(BigInt(current.persistedRevision) + 1n), config: request.config };
      return { kind: 'mcp', status: 'no-active-workers', outcome: 'applied', configuration: current, workers: [] };
    },
    applyWorkspaceMcp: async (): Promise<MCPApplyResult> => ({ kind: 'mcp', status: 'no-active-workers', outcome: 'applied', configuration: current, workers: [] }),
  }
<<<<<<< HEAD
}));
||||||| bc50ba56aa
  captured.push({ url, method, body: JSON.parse(String(init?.body ?? '{}')) });
  return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
};

mock.module('@/lib/runtime-fetch', () => ({ runtimeFetch: runtimeFetchMock }));

mock.module('@/lib/opencode/client', () => ({
  opencodeClient: { getDirectory: () => '/workspace/project' },
}));

mock.module('@/stores/useProjectsStore', () => ({
  useProjectsStore: {
    getState: () => ({ getActiveProject: () => ({ path: '/workspace/project' }) }),
  },
}));

mock.module('@/lib/configUpdate', () => ({
  startConfigUpdate: mock(() => undefined),
  finishConfigUpdate: mock(() => undefined),
  updateConfigUpdateMessage: mock(() => undefined),
}));

mock.module('@/stores/useAgentsStore', () => ({
  refreshAfterOpenCodeRestart: mock(async () => undefined),
}));

=======
  captured.push({ url, method, body: JSON.parse(String(init?.body ?? '{}')) });
  return new Response(JSON.stringify({}), { headers: { 'Content-Type': 'application/json' } });
};

environment.respond(async (url, init) => {
  if (url.pathname.startsWith('/api/config/mcp')) return runtimeFetchMock(`${url.pathname}${url.search}`, init);
  if (url.pathname === '/api/fs/home') return Response.json({ home: '/workspace', chatsRoot: '/workspace/chats' });
  if (url.pathname === '/api/location' || url.pathname === '/api/session') return Response.json({}, { status: 401 });
  throw new Error(`Unexpected request: ${url}`);
});
const { useProjectsStore } = await import('./useProjectsStore');
useProjectsStore.setState({ projects: [{ id: 'project', path: '/workspace/project' }], activeProjectId: 'project' });

>>>>>>> upstream/main
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
  test('partial apply exposes failure and does not publish failed state to store', async () => {
    await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
    const partial: MCPApplyResult = {
      kind: 'mcp', status: 'partial', outcome: 'saved-not-connected', configuration: { ...current, persistedRevision: '5', config: { servers: [{ ...server, enabled: false }] } }, workers: [
        { worker: { workspaceId: 'workspace', rootSessionId: 'root_a', workerGeneration: 'generation_a' }, outcome: 'applied', revisions: { runtimeStatus: 'ready', appliedRevision: '5', catalogRevision: '2' } },
        { worker: { workspaceId: 'workspace', rootSessionId: 'root_b', workerGeneration: 'generation_b' }, outcome: 'failed', revisions: { runtimeStatus: 'ready', appliedRevision: '4', catalogRevision: '1' }, error: { code: 'MCP_APPLY_FAILED', detail: 'Worker could not apply.', retryable: true } },
      ]
    };
    writeFailure = new CanonicalApiError({ type: 'urn:problem:MCP_APPLY_FAILED', title: 'Incomplete', status: 503, detail: 'Worker could not apply.', code: 'MCP_APPLY_FAILED', retryable: true, details: { result: partial } });
    const result = await useMcpConfigStore.getState().updateMcp('tools', { enabled: false }, '/repo');
    expect(result.ok).toBe(false);
    expect(result.result).toEqual(partial);
    // the rejected apply advanced persistence; the store adopts that revision as its baseline
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
  test('a saved-not-connected failure refreshes the mutation baseline for the next edit', async () => {
    await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
    const notConnected: MCPApplyResult = {
      kind: 'mcp', status: 'no-active-workers', outcome: 'saved-not-connected',
      configuration: { ...current, persistedRevision: '5', config: { servers: [{ ...server, enabled: false }] } }, workers: [],
    };
    writeFailure = new CanonicalApiError({ type: 'urn:problem:MCP_APPLY_FAILED', title: 'Not connected', status: 503, detail: 'ECONNREFUSED', code: 'MCP_APPLY_FAILED', retryable: true, details: { result: notConnected } });
    expect((await useMcpConfigStore.getState().updateMcp('tools', { enabled: false }, '/repo')).ok).toBe(false);
    writeFailure = null;
    expect((await useMcpConfigStore.getState().updateMcp('tools', { label: 'Renamed' }, '/repo')).ok).toBe(true);
    expect(captured[captured.length - 1].expectedPersistedRevision).toBe('5');
  });
  test('a server saved with sign-in pending is a success with an action, even through the refused apply', async () => {
    await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
    const needsAuth: MCPApplyResult = {
      kind: 'mcp', status: 'no-active-workers', outcome: 'saved-needs-auth',
      configuration: { ...current, persistedRevision: '5', config: { servers: [{ ...server, transport: { type: 'http', url: 'https://mcp.example.test/mcp' } }] } }, workers: [],
    };
    // The coordinator refuses a configure whose probe needs authorization, so the
    // install learns the outcome from the problem body instead of the return value.
    const refusal = new CanonicalApiError({ type: 'urn:problem:MCP_OAUTH_FAILED', title: 'Sign-in required', status: 422, detail: 'HTTP 403 forbidden', code: 'MCP_OAUTH_FAILED', retryable: false, details: { result: needsAuth } });
    writeFailure = refusal;
    const result = await useMcpConfigStore.getState().updateMcp('tools', { transport: { type: 'http', url: 'https://mcp.example.test/mcp' } }, '/repo');
    expect(result.ok).toBe(true);
    expect(result.outcome).toBe('saved-needs-auth');
    expect(result.result).toEqual(needsAuth);
    // The refused apply still advanced persistence, and the store must not
    // remember it as a failure.
    expect(useMcpConfigStore.getState().configurationsByDirectory['/repo'].persistedRevision).toBe('5');
    expect(useMcpConfigStore.getState().errorsByDirectory['/repo']).toBeUndefined();
  });
  test('an unread directory shows no servers of the current directory', async () => {
    // Static import above: no mock is needed for the directory store.
    useDirectoryStore.setState({ currentDirectory: '/repo' });
    try {
      await useMcpConfigStore.getState().loadMcpConfigs({ directory: '/repo' });
      expect(useMcpConfigStore.getState().getMcpServersForDirectory('/repo')).toEqual([server]);
      expect(useMcpConfigStore.getState().getMcpServersForDirectory('/other')).toEqual([]);
    } finally {
      useDirectoryStore.setState({ currentDirectory: '' });
    }
  });
});
