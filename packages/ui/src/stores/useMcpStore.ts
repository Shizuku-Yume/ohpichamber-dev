import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
<<<<<<< HEAD
import type { MCPCatalogState, MCPServerConfig, MCPConnectionTestResult } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { resolveMcpDirectory, useMcpConfigStore } from './useMcpConfigStore';
=======
import type { McpServerStatus } from '@/lib/opencode/model';
import { opencodeClient } from '@/lib/opencode/client';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useMcpConfigStore } from '@/stores/useMcpConfigStore';
>>>>>>> bc50ba56a

export interface McpServerRuntimeState {
  configuration: MCPServerConfig;
  catalogs: MCPCatalogState[];
  probe?: MCPConnectionTestResult;
}
export const isMcpServerConnected = (entry: McpServerRuntimeState | undefined): boolean =>
  !!entry?.catalogs.some(catalog => catalog.activeServers.includes(entry.configuration.serverId));
export const getMcpServerError = (entry: McpServerRuntimeState | undefined): string | undefined =>
  entry?.probe?.status === 'failed' ? entry.probe.error.detail : undefined;
export const getMcpServerStatus = (entry: McpServerRuntimeState | undefined): 'ready' | 'unavailable' | 'disabled' | 'unapplied' => {
  if (!entry) return 'unapplied';
  if (!entry.configuration.enabled) return 'disabled';
  if (entry.probe?.status === 'failed' || entry.catalogs.some(catalog => catalog.runtimeStatus === 'unavailable')) return 'unavailable';
  return isMcpServerConnected(entry) ? 'ready' : 'unapplied';
};
type McpStatusMap = Record<string, McpServerRuntimeState>;
const EMPTY_STATUS: McpStatusMap = {};
let generation = 0;
let operationRevision = 0;
const inFlight = new Map<string, Promise<void>>();
const directoryKey = (directory?: string | null): string => { try { return resolveMcpDirectory(directory); } catch { return ''; } };
export const computeMcpHealth = (status: McpStatusMap | null | undefined) => {
  const entries = Object.values(status ?? {});
  return { connected: entries.filter(isMcpServerConnected).length, total: entries.length,
    hasFailed: entries.some(entry => getMcpServerStatus(entry) === 'unavailable') };
};
type RefreshOptions = { directory?: string | null; silent?: boolean };
interface McpStore {
  byDirectory: Record<string, McpStatusMap>;
  loadingKeys: Record<string, boolean>;
  lastErrorKeys: Record<string, string | null>;
  refreshedAtKeys: Record<string, number>;
  getStatusForDirectory: (directory?: string | null) => McpStatusMap;
  getErrorForDirectory: (directory?: string | null) => string | null;
  refresh: (options?: RefreshOptions) => Promise<void>;
  ensureFresh: (options: RefreshOptions & { maxAgeMs: number }) => Promise<void>;
  refreshIfHeld: (directory: string) => Promise<void>;
<<<<<<< HEAD
  connect: (serverId: string, directory?: string | null) => Promise<void>;
  disconnect: (serverId: string, directory?: string | null) => Promise<void>;
  reconnect: (serverId: string, directory?: string | null) => Promise<void>;
  testConnection: (serverId: string, directory?: string | null) => Promise<MCPConnectionTestResult>;
=======
  /**
   * OpenCode stopped this directory's servers. The held status describes
   * servers that are gone, and keeping it would make the shutdown's own
   * announcements re-read the directory, which starts it again. A surface that
   * shows the directory later reads it afresh.
   */
  forgetDirectory: (directory: string) => void;
  connect: (name: string, directory?: string | null) => Promise<void>;
  disconnect: (name: string, directory?: string | null) => Promise<void>;
  /**
   * The on/off switch. A disconnect alone lasts only until OpenCode starts the
   * directory again (after an idle hour, a restart), so a configured server is
   * turned off in the config file that defines it, where OpenCode keeps it off.
   * A server no config file defines can only be disconnected.
   */
  setEnabled: (name: string, enabled: boolean, directory?: string | null) => Promise<void>;
  testConnection: (name: string, directory?: string | null) => Promise<TestConnectionResult>;
  /**
   * MCP status is keyed by directory alone, and two instances can hold the same
   * project path — so on a switch the previous instance's servers would be
   * reported for the new one. Drop everything and let consumers re-ask.
   */
>>>>>>> bc50ba56a
  resetForRuntimeSwitch: () => void;
}
export const useMcpStore = create<McpStore>()(devtools((set, get) => {
  const toggle = async (serverId: string, enabled: boolean, directory?: string | null) => {
    const owner = generation;
    operationRevision += 1;
    const result = await useMcpConfigStore.getState().updateMcp(serverId, { enabled }, directory);
    if (owner !== generation) return;
    await get().refresh({ directory, silent: true });
    if (!result.ok) throw new Error(result.error);
  };
  return {
    byDirectory: {}, loadingKeys: {}, lastErrorKeys: {}, refreshedAtKeys: {},
    resetForRuntimeSwitch: () => {
      generation += 1;
      inFlight.clear();
      useMcpConfigStore.getState().resetForRuntimeSwitch();
      set({ byDirectory: {}, loadingKeys: {}, lastErrorKeys: {}, refreshedAtKeys: {} });
    },
    getStatusForDirectory: directory => get().byDirectory[directoryKey(directory)] ?? EMPTY_STATUS,
    getErrorForDirectory: directory => get().lastErrorKeys[directoryKey(directory)] ?? null,
    refresh: async options => {
      const owner = generation;
      const revision = operationRevision;
      const key = directoryKey(options?.directory);
      if (!options?.silent) set(state => ({ loadingKeys: { ...state.loadingKeys, [key]: true } }));
      try {
        const directory = resolveMcpDirectory(options?.directory);
        const workspace = await canonicalClient.resolveWorkspace(directory);
        const [configuration, sessions] = await Promise.all([
          canonicalClient.getWorkspaceMcpConfig(workspace.workspaceId), canonicalClient.listSessions(workspace.workspaceId),
        ]);
        if (Object.keys(sessions.errors).length) throw new Error(Object.values(sessions.errors).join('\n'));
        const roots = sessions.items.filter(session => session.sessionId === session.rootSessionId && session.runtimeStatus !== 'unavailable');
        const catalogs = await Promise.all(roots.map(session => canonicalClient.getMcpCatalog(session)));
        if (owner !== generation || revision !== operationRevision) return;
        const previous = get().byDirectory[key];
        const workerCatalogs = catalogs.map(result => result.workerCatalog);
        const entries = Object.fromEntries(configuration.config.servers.map(server => {
          const entry: McpServerRuntimeState = { configuration: server, catalogs: workerCatalogs };
          const probe = previous?.[server.serverId]?.probe;
          if (probe?.persistedRevision === configuration.persistedRevision) entry.probe = probe;
          return [server.serverId, entry];
        }));
        set(state => ({ byDirectory: { ...state.byDirectory, [key]: entries },
          refreshedAtKeys: { ...state.refreshedAtKeys, [key]: Date.now() }, lastErrorKeys: { ...state.lastErrorKeys, [key]: null } }));
      } catch (error) {
        if (owner !== generation || revision !== operationRevision) return;
        const message = error instanceof Error ? error.message : 'Failed to load MCP status';
        set((state) => ({
          loadingKeys: { ...state.loadingKeys, [key]: false },
          lastErrorKeys: { ...state.lastErrorKeys, [key]: message },
        }));
      }
    },
    ensureFresh: async ({ maxAgeMs, ...options }) => {
      const key = directoryKey(options.directory);
      if (Date.now() - (get().refreshedAtKeys[key] ?? 0) < maxAgeMs) return;
      const current = inFlight.get(key);
      if (current) return current;
      const request = get().refresh(options);
      inFlight.set(key, request);
      try { await request; } finally { if (inFlight.get(key) === request) inFlight.delete(key); }
    },
    refreshIfHeld: async directory => { if (get().byDirectory[directoryKey(directory)]) await get().refresh({ directory, silent: true }); },
    connect: (serverId, directory) => toggle(serverId, true, directory),
    disconnect: (serverId, directory) => toggle(serverId, false, directory),
    reconnect: async (serverId, directory) => {
      const owner = generation;
      operationRevision += 1;
      const workspace = await canonicalClient.resolveWorkspace(resolveMcpDirectory(directory));
      const current = await canonicalClient.getWorkspaceMcpConfig(workspace.workspaceId);
      const result = await canonicalClient.reconnectWorkspaceMcpServer(workspace.workspaceId, serverId, { persistedRevision: current.persistedRevision });
      if (owner !== generation) return;
      await get().refresh({ directory, silent: true });
      if (result.status === 'partial' || result.status === 'failed' || result.probe?.status === 'failed') {
        const probeError = result.probe?.status === 'failed' ? result.probe.error.detail : undefined;
        throw new Error(result.workers.filter(worker => worker.outcome === 'failed').map(worker => worker.error.detail).join('\n') || probeError);
      }
    },
    testConnection: async (serverId, directory) => {
      const owner = generation;
      const key = resolveMcpDirectory(directory);
      const workspace = await canonicalClient.resolveWorkspace(key);
      const current = await canonicalClient.getWorkspaceMcpConfig(workspace.workspaceId);
      const probe = await canonicalClient.testWorkspaceMcpServer(workspace.workspaceId, serverId, { persistedRevision: current.persistedRevision });
      const server = current.config.servers.find(entry => entry.serverId === serverId);
      if (owner === generation && server) set(state => ({ byDirectory: { ...state.byDirectory, [key]: {
        ...state.byDirectory[key], [serverId]: { configuration: server, catalogs: state.byDirectory[key]?.[serverId]?.catalogs ?? [], probe },
      } } }));
      return probe;
    },
<<<<<<< HEAD
  };
}, { name: 'mcp-store' }));
=======

    setEnabled: async (name, enabled, directory) => {
      const normalized = normalizeDirectory(directory ?? useDirectoryStore.getState().currentDirectory);
      const configStore = useMcpConfigStore.getState();
      const generation = mcpGeneration;
      // Without the config there is no telling whether the server has a file
      // to keep it off, and a disconnect alone would not last.
      if (!await configStore.loadMcpConfigs({ force: true, directory: normalized })) {
        throw new Error('Failed to load MCP configs');
      }
      // The app switched to another instance meanwhile; the same path there is
      // another machine's config.
      if (generation !== mcpGeneration) return;
      const configured = useMcpConfigStore.getState().getMcpByName(name, normalized);
      const disabledInConfig = configured?.disabled === true;
      if (configured && disabledInConfig === enabled) {
        // OpenCode watches the file and starts or stops the server itself.
        await configStore.updateMcp(name, { disabled: !enabled }, normalized);
      }
      // Switching on a server the config already enables is a reconnect (a
      // failed one, or one only disconnected). Switching off also disconnects:
      // a server started by hand while its config says off stays running
      // through an unchanged file.
      if (enabled && !disabledInConfig) await get().connect(name, normalized);
      else if (!enabled) await get().disconnect(name, normalized);
      else await get().refresh({ directory: normalized, silent: true });
    },

    testConnection: async (name, directory) => {
      const normalized = normalizeDirectory(directory ?? useDirectoryStore.getState().currentDirectory);
      const key = toKey(normalized);
      const previousStatus = get().getStatusForDirectory(normalized)[name];
      // Only a server the user turned off goes back off after the test.
      // Disconnecting leaves a server `disabled` in OpenCode, so doing it to a
      // failed, unauthorized, pending or not yet read server would switch off
      // the server the test just started.
      const wasDisabled = previousStatus?.status.status === 'disabled';
      let errorMessage: string | undefined;
      let warningMessage: string | undefined;

      try {
        await opencodeClient.connectMcpServer(name, normalized);
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : 'Connection failed';
        set((state) => ({
          diagnosticsByDirectory: {
            ...state.diagnosticsByDirectory,
            [key]: {
              ...(state.diagnosticsByDirectory[key] ?? {}),
              [name]: { status: 'failed', error: errorMessage ?? 'Connection failed' },
            },
          },
        }));
      }

      await get().refresh({ directory: normalized, silent: true });
      const currentStatus = get().getStatusForDirectory(normalized)[name];
      const observedStatus = currentStatus;

      if (wasDisabled && currentStatus?.status.status === 'connected') {
        try {
          await opencodeClient.disconnectMcpServer(name, normalized);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Disconnect failed';
          warningMessage = `Connection test succeeded, but cleanup disconnect failed: ${message}`;
        }
        await get().refresh({ directory: normalized, silent: true });
      }

      return {
        status: observedStatus ?? get().getStatusForDirectory(normalized)[name],
        error: errorMessage,
        warning: warningMessage,
      };
    },

  }))
);
>>>>>>> bc50ba56a
