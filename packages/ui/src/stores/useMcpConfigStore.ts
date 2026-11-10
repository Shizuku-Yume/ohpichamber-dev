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

<<<<<<< HEAD
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
=======
const EMPTY_MCP_SERVERS: McpServerWithScope[] = [];

/**
 * Servers of one project. Returns a stored array so components can select it
 * directly; an omitted directory means the project the app is on.
 */
export const selectMcpServersForDirectory = (
  state: Pick<McpConfigStore, 'serversByDirectory'>,
  directory?: string | null,
): McpServerWithScope[] => {
  const cacheKey = getMcpCacheKey(resolveDirectory(directory));
  return state.serversByDirectory[cacheKey] ?? EMPTY_MCP_SERVERS;
};

/**
 * Whether this directory's config catalog has been read at least once. A
 * runtime-only MCP row (#5935) waits for that read: before it, every server
 * the runtime reports would read as runtime-only, and a configured server
 * would flash as one while its config entry was still loading.
 */
export const hasLoadedMcpConfigsForDirectory = (
  state: Pick<McpConfigStore, 'serversByDirectory'>,
  directory?: string | null,
): boolean => state.serversByDirectory[getMcpCacheKey(resolveDirectory(directory))] !== undefined;

export const useMcpConfigStore = create<McpConfigStore>()(
  devtools(
    persist(
      (set, get) => ({
        mcpServers: [],
        serversByDirectory: {},
        selectedMcpName: null,
        isLoading: false,
        mcpDraft: null,

        setSelectedMcp: (name) => set({ selectedMcpName: name }),

        setMcpDraft: (draft) => set({ mcpDraft: draft }),

        loadMcpConfigs: async (options) => {
          const configDirectory = resolveDirectory(options?.directory);
          const cacheKey = getMcpCacheKey(configDirectory);
          const isAmbient = cacheKey === getMcpCacheKey(getConfigDirectory());
          const now = Date.now();
          const loadedAt = mcpLastLoadedAt.get(cacheKey) ?? 0;
          const hasCachedConfigs = (get().serversByDirectory[cacheKey] ?? (isAmbient ? get().mcpServers : [])).length > 0;

          if (!options?.force && hasCachedConfigs && now - loadedAt < MCP_LOAD_CACHE_TTL_MS) {
            return true;
          }

          const inFlight = mcpLoadInFlight.get(cacheKey);
          if (!options?.force && inFlight) {
            return inFlight;
          }

          const request = (async () => {
            set({ isLoading: true });
            try {
              const queryParams = configDirectory ? `?directory=${encodeURIComponent(configDirectory)}` : '';
              const response = await runtimeFetch(`/api/config/mcp${queryParams}`, {
                headers: configDirectory ? { 'x-opencode-directory': configDirectory } : undefined,
              });
              if (!response.ok) {
                throw new Error('Failed to load MCP configs');
              }
              const data: McpServerWithScope[] = await response.json();
              set((state) => {
                const next: Partial<McpConfigStore> = {
                  serversByDirectory: { ...state.serversByDirectory, [cacheKey]: data },
                  isLoading: false,
                };
                if (isAmbient) next.mcpServers = data;
                return next;
              });
              mcpLastLoadedAt.set(cacheKey, Date.now());
              return true;
            } catch (error) {
              console.error('[McpConfigStore] Failed to load MCP configs:', error);
              set({ isLoading: false });
              return false;
            }
          })();

          mcpLoadInFlight.set(cacheKey, request);
          try {
            return await request;
          } finally {
            mcpLoadInFlight.delete(cacheKey);
          }
        },

        createMcp: async (config: McpDraft, directory?: string | null) => {
          try {
            const body = buildMcpBody(config);
            const configDirectory = resolveDirectory(directory);
            const queryParams = configDirectory ? `?directory=${encodeURIComponent(configDirectory)}` : '';
            const response = await runtimeFetch(`/api/config/mcp/${encodeURIComponent(config.name)}${queryParams}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(configDirectory ? { 'x-opencode-directory': configDirectory } : {}),
              },
              body: JSON.stringify(body),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(payload?.error || 'Failed to create MCP server');
            }

            invalidateMcpCache(configDirectory);

            if (payload?.requiresManualRestart) {
              await get().loadMcpConfigs({ force: true, directory: configDirectory });
              return {
                ok: true,
                requiresManualRestart: true,
                reloadFailed: payload?.reloadFailed === true,
                message: payload?.message,
                warning: payload?.warning,
              };
            }

            if (payload?.requiresReload) {
              startConfigUpdate('Creating MCP server configuration…');
              await refreshAfterOpenCodeRestart({
                message: payload.message,
                delayMs: payload.reloadDelayMs ?? CLIENT_RELOAD_DELAY_MS,
                scopes: ['all'],
              });
              await get().loadMcpConfigs({ force: true, directory: configDirectory });
              return {
                ok: true,
                reloadFailed: payload?.reloadFailed === true,
                message: payload?.message,
                warning: payload?.warning,
              };
            }

            await get().loadMcpConfigs({ force: true, directory: configDirectory });
            return {
              ok: true,
              reloadFailed: payload?.reloadFailed === true,
              message: payload?.message,
              warning: payload?.warning,
            };
          } catch (error) {
            console.error('[McpConfigStore] Failed to create MCP:', error);
            throw error;
          }
        },

        updateMcp: async (name: string, config: Partial<McpDraft>, directory?: string | null) => {
          try {
            const body = buildMcpBody(config);
            const configDirectory = resolveDirectory(directory);
            const queryParams = configDirectory ? `?directory=${encodeURIComponent(configDirectory)}` : '';
            const response = await runtimeFetch(`/api/config/mcp/${encodeURIComponent(name)}${queryParams}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(configDirectory ? { 'x-opencode-directory': configDirectory } : {}),
              },
              body: JSON.stringify(body),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(payload?.error || 'Failed to update MCP server');
            }

            invalidateMcpCache(configDirectory);

            if (payload?.requiresManualRestart) {
              await get().loadMcpConfigs({ force: true, directory: configDirectory });
              return {
                ok: true,
                requiresManualRestart: true,
                reloadFailed: payload?.reloadFailed === true,
                message: payload?.message,
                warning: payload?.warning,
              };
            }

            if (payload?.requiresReload) {
              startConfigUpdate('Updating MCP server configuration…');
              await refreshAfterOpenCodeRestart({
                message: payload.message,
                delayMs: payload.reloadDelayMs ?? CLIENT_RELOAD_DELAY_MS,
                scopes: ['all'],
              });
              await get().loadMcpConfigs({ force: true, directory: configDirectory });
              return {
                ok: true,
                reloadFailed: payload?.reloadFailed === true,
                message: payload?.message,
                warning: payload?.warning,
              };
            }

            await get().loadMcpConfigs({ force: true, directory: configDirectory });
            return {
              ok: true,
              reloadFailed: payload?.reloadFailed === true,
              message: payload?.message,
              warning: payload?.warning,
            };
          } catch (error) {
            console.error('[McpConfigStore] Failed to update MCP:', error);
            throw error;
          }
        },

        deleteMcp: async (name: string, directory?: string | null) => {
          try {
            const configDirectory = resolveDirectory(directory);
            const queryParams = configDirectory ? `?directory=${encodeURIComponent(configDirectory)}` : '';
            const response = await runtimeFetch(`/api/config/mcp/${encodeURIComponent(name)}${queryParams}`, {
              method: 'DELETE',
              headers: configDirectory ? { 'x-opencode-directory': configDirectory } : undefined,
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              throw new Error(payload?.error || 'Failed to delete MCP server');
            }

            invalidateMcpCache(configDirectory);

            if (get().selectedMcpName === name) {
              set({ selectedMcpName: null });
            }

            if (payload?.requiresManualRestart) {
              await get().loadMcpConfigs({ force: true, directory: configDirectory });
              return {
                ok: true,
                requiresManualRestart: true,
                reloadFailed: payload?.reloadFailed === true,
                message: payload?.message,
                warning: payload?.warning,
              };
            }

            if (payload?.requiresReload) {
              startConfigUpdate('Deleting MCP server configuration…');
              await refreshAfterOpenCodeRestart({
                message: payload.message,
                delayMs: payload.reloadDelayMs ?? CLIENT_RELOAD_DELAY_MS,
                scopes: ['all'],
              });
            }

            await get().loadMcpConfigs({ force: true, directory: configDirectory });
            return {
              ok: true,
              reloadFailed: payload?.reloadFailed === true,
              message: payload?.message,
              warning: payload?.warning,
            };
          } catch (error) {
            console.error('[McpConfigStore] Failed to delete MCP:', error);
            return { ok: false };
          }
        },

        getMcpByName: (name: string, directory?: string | null) => {
          return get().getMcpServersForDirectory(directory).find((s) => s.name === name);
        },

        getMcpServersForDirectory: (directory?: string | null) => {
          return selectMcpServersForDirectory(get(), directory);
        },
      }),
      {
        name: 'mcp-config-store',
        storage: createDeferredSafeJSONStorage(),
        partialize: (state) => ({ selectedMcpName: state.selectedMcpName }),
      },
    ),
    { name: 'mcp-config-store' },
  ),
);

// ============== HELPERS ==============

function buildMcpBody(config: Partial<McpDraft>): Record<string, unknown> {
  const body: Record<string, unknown> = {};

  if (config.scope !== undefined) body.scope = config.scope;

  // v2 requires `type`: an entry without it is dropped when the config loads.
  if (config.type !== undefined) body.type = config.type;

  if (config.type === 'local' || config.command !== undefined) {
    body.command = (config.command ?? []).filter((s) => s.trim());
  }

  if (config.type === 'remote' || config.url !== undefined) {
    body.url = config.url?.trim() ?? '';
  }

  if (config.environment !== undefined) {
    body.environment = envArrayToRecord(config.environment) ?? {};
  }

  if (config.headers !== undefined) {
    body.headers = envArrayToRecord(config.headers) ?? {};
  }

  const touchesOAuth =
    config.oauthEnabled !== undefined ||
    config.oauthClientId !== undefined ||
    config.oauthClientSecret !== undefined ||
    config.oauthScope !== undefined ||
    config.oauthRedirectUri !== undefined ||
    config.oauthCallbackPort !== undefined ||
    config.oauthAuthServerMetadataUrl !== undefined;

  if (touchesOAuth) {
    if (config.oauthEnabled === false) {
      body.oauth = false;
    } else {
      const callbackPort = positiveInteger(config.oauthCallbackPort);
      const oauth: McpOAuthConfig = {};
      const clientId = trimOptionalString(config.oauthClientId);
      const clientSecret = trimOptionalString(config.oauthClientSecret);
      const scope = trimOptionalString(config.oauthScope);
      const redirectUri = trimOptionalString(config.oauthRedirectUri);
      const authServerMetadataUrl = trimOptionalString(config.oauthAuthServerMetadataUrl);
      if (clientId) oauth.client_id = clientId;
      if (clientSecret) oauth.client_secret = clientSecret;
      if (scope) oauth.scope = scope;
      if (redirectUri) oauth.redirect_uri = redirectUri;
      if (callbackPort !== undefined) oauth.callback_port = callbackPort;
      // An emptied field drops the key: the object is rebuilt from the form
      // every save rather than merged onto what is already stored.
      if (authServerMetadataUrl) oauth.auth_server_metadata_url = authServerMetadataUrl;

      if (Object.keys(oauth).length > 0 || config.oauthEnabled) {
        body.oauth = oauth;
      } else {
        body.oauth = false;
>>>>>>> bc50ba56a
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
