import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MCPCatalogState, MCPServerConfig, MCPConnectionTestResult } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { resolveMcpDirectory, useMcpConfigStore } from './useMcpConfigStore';

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
  connect: (serverId: string, directory?: string | null) => Promise<void>;
  disconnect: (serverId: string, directory?: string | null) => Promise<void>;
  reconnect: (serverId: string, directory?: string | null) => Promise<void>;
  testConnection: (serverId: string, directory?: string | null) => Promise<MCPConnectionTestResult>;
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
  };
}, { name: 'mcp-store' }));
