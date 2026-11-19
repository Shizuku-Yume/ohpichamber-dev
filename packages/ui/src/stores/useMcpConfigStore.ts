import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { MCPApplyResultSchema, MCPServerConfigSchema, type MCPApplyResult, type MCPConfigurationState, type MCPServerConfig } from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { problemMessage } from '@/lib/problemMessage';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

type McpDraft = MCPServerConfig;
type McpInstallOutcome = 'applied' | 'saved-needs-auth' | 'saved-not-connected';
export type McpMutationResult =
  | { ok: true; result: MCPApplyResult; outcome: McpInstallOutcome }
  | { ok: false; error: string; result?: MCPApplyResult; outcome?: McpInstallOutcome };

export const createMcpDraft = (serverId: string, scope: 'project' | 'user' = 'project'): McpDraft => ({
  serverId, label: serverId, enabled: true, scope, transport: { type: 'stdio', command: '', args: [] },
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

const NO_SERVERS: MCPServerConfig[] = [];
export const selectMcpServersForDirectory = (state: Pick<McpConfigStore, 'serversByDirectory' | 'mcpServers'>, directory?: string | null): MCPServerConfig[] =>
  state.serversByDirectory[keyFor(directory)] ?? NO_SERVERS;

export const useMcpConfigStore = create<McpConfigStore>()(devtools((set, get) => {
  const publish = (directory: string, configuration: MCPConfigurationState, result?: MCPApplyResult) => {
    set(state => {
      const next = {
        configurationsByDirectory: { ...state.configurationsByDirectory, [directory]: configuration },
        serversByDirectory: { ...state.serversByDirectory, [directory]: configuration.config.servers },
        errorsByDirectory: { ...state.errorsByDirectory, [directory]: undefined },
        mcpServers: state.mcpServers,
        applyResultsByDirectory: state.applyResultsByDirectory,
      };
      // These two mirror the directory only when it is the one the store is
      // currently read through; another directory's write must not touch them.
      if (directory === keyFor()) next.mcpServers = configuration.config.servers;
      if (result) next.applyResultsByDirectory = { ...state.applyResultsByDirectory, [directory]: result };
      return next;
    });
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
      const outcome: McpInstallOutcome = result.outcome;
      if (outcome === 'applied' || outcome === 'saved-needs-auth') {
        return { ok: true, result, outcome };
      }
      const failureDetail = result.workers.find(worker => worker.outcome === 'failed')?.error.detail || 'The MCP server could not connect.';
      return { ok: false, error: failureDetail, result, outcome };
    } catch (error) {
      const message = problemMessage(error, 'The MCP configuration could not be saved.');
      const parsed = error instanceof CanonicalApiError ? MCPApplyResultSchema.safeParse(error.problem.details?.result) : null;
      const result = parsed?.success && parsed.data.configuration.workspaceId === workspaceId ? parsed.data : undefined;
      // A rejected apply still advanced the persisted revision: adopt it as the next CAS baseline.
      if (result && ownerGeneration === generation) {
        revisions.set(key, ++mutationRevision);
        publish(key, result.configuration, result);
      }
      // A server saved with authorization still pending is a sign-in, not a
      // failed save: it succeeds with an action even when the refusal body
      // carried it.
      if (result?.outcome === 'saved-needs-auth') {
        return { ok: true, result, outcome: 'saved-needs-auth' };
      }
      if (ownerGeneration === generation) {
        set(state => ({ errorsByDirectory: { ...state.errorsByDirectory, [key]: message } }));
      }
      if (!result) return { ok: false, error: message };
      return { ok: false, error: message, result, outcome: result.outcome };
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
      return [...servers, MCPServerConfigSchema.parse({ ...config, scope: config.scope ?? 'project' })];
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
