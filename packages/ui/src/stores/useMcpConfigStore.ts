import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { MCPApplyResultSchema, MCPServerConfigSchema, type MCPApplyResult, type MCPConfigurationState, type MCPServerConfig } from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

export type McpDraft = MCPServerConfig;
type McpMutationResult =
  | { ok: true; result: MCPApplyResult }
  | { ok: false; error: string; result?: MCPApplyResult };

export const createMcpDraft = (serverId: string): McpDraft => ({
  serverId, label: serverId, enabled: true, transport: { type: 'stdio', command: '', args: [] },
});

export const resolveMcpDirectory = (directory?: string | null): string => {
  const resolved = directory === undefined ? useDirectoryStore.getState().currentDirectory : directory;
  if (!resolved?.trim()) throw new Error('A workspace directory is required.');
  return resolved.trim().replace(/\\/g, '/').replace(/\/$/, '') || '/';
};

const keyFor = (directory?: string | null): string => {
  try { return resolveMcpDirectory(directory); } catch { return ''; }
};
let generation = 0;
let mutationRevision = 0;
const revisions = new Map<string, number>();
const EMPTY_SERVERS: MCPServerConfig[] = [];

interface McpConfigStore {
  mcpServers: MCPServerConfig[];
  serversByDirectory: Record<string, MCPServerConfig[]>;
  configurationsByDirectory: Record<string, MCPConfigurationState>;
  errorsByDirectory: Record<string, string | undefined>;
  applyResultsByDirectory: Record<string, MCPApplyResult | undefined>;
  selectedMcpName: string | null;
  mcpDraft: McpDraft | null;
  isLoading: boolean;
  setSelectedMcp: (serverId: string | null) => void;
  setMcpDraft: (draft: McpDraft | null) => void;
  loadMcpConfigs: (options?: { force?: boolean; directory?: string | null }) => Promise<boolean>;
  createMcp: (config: McpDraft, directory?: string | null) => Promise<McpMutationResult>;
  updateMcp: (serverId: string, config: Partial<MCPServerConfig>, directory?: string | null) => Promise<McpMutationResult>;
  deleteMcp: (serverId: string, directory?: string | null) => Promise<McpMutationResult>;
  getMcpByName: (serverId: string, directory?: string | null) => MCPServerConfig | undefined;
  getMcpServersForDirectory: (directory?: string | null) => MCPServerConfig[];
  apply: (directory?: string | null) => Promise<McpMutationResult>;
  resetForRuntimeSwitch: () => void;
}

export const selectMcpServersForDirectory = (state: Pick<McpConfigStore, 'serversByDirectory'>, directory?: string | null): MCPServerConfig[] =>
  state.serversByDirectory[keyFor(directory)] ?? EMPTY_SERVERS;

export const useMcpConfigStore = create<McpConfigStore>()(devtools((set, get) => {
  const publish = (directory: string, configuration: MCPConfigurationState, result?: MCPApplyResult) => {
    set(state => ({
      configurationsByDirectory: { ...state.configurationsByDirectory, [directory]: configuration },
      serversByDirectory: { ...state.serversByDirectory, [directory]: configuration.config.servers },
      ...(directory === keyFor() ? { mcpServers: configuration.config.servers } : {}),
      errorsByDirectory: { ...state.errorsByDirectory, [directory]: undefined },
      ...(result ? { applyResultsByDirectory: { ...state.applyResultsByDirectory, [directory]: result } } : {}),
    }));
  };
  const mutate = async (directory: string | null | undefined, transform?: (servers: MCPServerConfig[]) => MCPServerConfig[]): Promise<McpMutationResult> => {
    const ownerGeneration = generation;
    let key = '';
    let workspaceId: string | undefined;
    try {
      key = resolveMcpDirectory(directory);
      const workspace = await canonicalClient.resolveWorkspace(key);
      workspaceId = workspace.workspaceId;
      if (ownerGeneration !== generation) throw new Error('Runtime changed.');
      // Use the configuration the user actually viewed for CAS, not an unseen newer revision.
      const current = get().configurationsByDirectory[key] ?? await canonicalClient.getWorkspaceMcpConfig(workspaceId);
      if (current.workspaceId !== workspaceId) throw new Error('Workspace changed.');
      const result = transform
        ? await canonicalClient.configureWorkspaceMcp(workspaceId, { expectedPersistedRevision: current.persistedRevision, config: { servers: transform(current.config.servers) } })
        : await canonicalClient.applyWorkspaceMcp(workspaceId, { persistedRevision: current.persistedRevision });
      if (ownerGeneration !== generation) throw new Error('Runtime changed.');
      revisions.set(key, ++mutationRevision);
      publish(key, result.configuration, result);
      return result.status === 'applied' || result.status === 'no-active-workers'
        ? { ok: true, result }
        : { ok: false, error: result.workers.filter(worker => worker.outcome === 'failed').map(worker => worker.error.detail).join('\n'), result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const parsed = error instanceof CanonicalApiError ? MCPApplyResultSchema.safeParse(error.problem.details?.result) : null;
      const result = parsed?.success && parsed.data.configuration.workspaceId === workspaceId ? parsed.data : undefined;
      if (ownerGeneration === generation) {
        if (result) {
          revisions.set(key, ++mutationRevision);
          publish(key, result.configuration, result);
        }
        set(state => ({ errorsByDirectory: { ...state.errorsByDirectory, [key]: message } }));
      }
      return { ok: false, error: message, ...(result ? { result } : {}) };
    }
  };
  return {
    mcpServers: [], serversByDirectory: {}, configurationsByDirectory: {}, errorsByDirectory: {}, applyResultsByDirectory: {},
    selectedMcpName: null, mcpDraft: null, isLoading: false,
    setSelectedMcp: selectedMcpName => set({ selectedMcpName }),
    setMcpDraft: mcpDraft => set({ mcpDraft }),
    resetForRuntimeSwitch: () => {
      generation += 1;
      revisions.clear();
      set({ mcpServers: [], serversByDirectory: {}, configurationsByDirectory: {}, errorsByDirectory: {}, applyResultsByDirectory: {}, selectedMcpName: null, mcpDraft: null, isLoading: false });
    },
    loadMcpConfigs: async options => {
      const ownerGeneration = generation;
      const revision = mutationRevision;
      let key = '';
      set({ isLoading: true });
      try {
        key = resolveMcpDirectory(options?.directory);
        const workspace = await canonicalClient.resolveWorkspace(key);
        const configuration = await canonicalClient.getWorkspaceMcpConfig(workspace.workspaceId);
        if (ownerGeneration !== generation) return false;
        if ((revisions.get(key) ?? 0) <= revision) publish(key, configuration);
        return true;
      } catch (error) {
        if (ownerGeneration === generation) set(state => ({ errorsByDirectory: { ...state.errorsByDirectory, [key]: error instanceof Error ? error.message : String(error) } }));
        return false;
      } finally { if (ownerGeneration === generation) set({ isLoading: false }); }
    },
    createMcp: (config, directory) => mutate(directory, servers => {
      if (servers.some(server => server.serverId === config.serverId)) throw new Error('MCP server already exists.');
      return [...servers, MCPServerConfigSchema.parse(config)];
    }),
    updateMcp: (serverId, config, directory) => mutate(directory, servers => {
      if (!servers.some(server => server.serverId === serverId)) throw new Error('MCP server not found.');
      return servers.map(server => server.serverId === serverId ? MCPServerConfigSchema.parse({ ...server, ...config, serverId }) : server);
    }),
    deleteMcp: (serverId, directory) => mutate(directory, servers => servers.filter(server => server.serverId !== serverId)),
    getMcpByName: (serverId, directory) => get().getMcpServersForDirectory(directory).find(server => server.serverId === serverId),
    getMcpServersForDirectory: directory => selectMcpServersForDirectory(get(), directory),
    apply: directory => mutate(directory),
  };
}, { name: 'mcp-config-store' }));
