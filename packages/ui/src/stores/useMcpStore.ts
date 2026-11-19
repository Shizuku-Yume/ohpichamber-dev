import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { MCPCatalogState, MCPServerConfig, MCPConnectionTestResult } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { resolveMcpDirectory, useMcpConfigStore } from './useMcpConfigStore';
import type { LoadPhase } from './loadPhase';

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
<<<<<<< HEAD
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
||||||| bc50ba56aa
const EMPTY_DIAGNOSTICS: McpRuntimeDiagnosticMap = {};

type McpHealth = {
  connected: number;
  total: number;
  hasFailed: boolean;
  hasAuthRequired: boolean;
};

const normalizeDirectory = (directory: string | null | undefined): string | null => {
  if (typeof directory !== 'string') return null;
  const trimmed = directory.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\\/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
};

const toKey = (directory: string | null | undefined): string => normalizeDirectory(directory) ?? '__global__';

export const computeMcpHealth = (status: McpStatusMap | null | undefined): McpHealth => {
  const entries = Object.entries(status ?? {});
  const connected = entries.filter(([, s]) => s?.status.status === 'connected').length;
  const total = entries.length;
  const hasFailed = entries.some(([, s]) => s?.status.status === 'failed');
  const hasAuthRequired = entries.some(([, s]) => s?.status.status === 'needs_auth');
  return { connected, total, hasFailed, hasAuthRequired };
};

type RefreshOptions = {
  directory?: string | null;
  silent?: boolean;
};

const ensureFreshInFlight = new Map<string, Promise<void>>();
// Bumped on every runtime switch. Status is keyed by directory alone and two
// instances can hold the same project path, so a request already in flight for
// the previous instance would otherwise write its servers over the new one's.
let mcpGeneration = 0;
// Bumped per directory when its status is forgotten, so a read that started
// before OpenCode stopped the directory cannot write the status back.
const forgetGenerations = new Map<string, number>();

type TestConnectionResult = {
  status?: McpServerStatus;
  error?: string;
  warning?: string;
};

=======
const EMPTY_DIAGNOSTICS: McpRuntimeDiagnosticMap = {};

const normalizeDirectory = (directory: string | null | undefined): string | null => {
  if (typeof directory !== 'string') return null;
  const trimmed = directory.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\\/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
};

const toKey = (directory: string | null | undefined): string => normalizeDirectory(directory) ?? '__global__';

type RefreshOptions = {
  directory?: string | null;
  silent?: boolean;
};

const ensureFreshInFlight = new Map<string, Promise<void>>();
let mcpGeneration = 0;
const forgetGenerations = new Map<string, number>();

type TestConnectionResult = {
  status?: McpServerStatus;
  error?: string;
  warning?: string;
};

>>>>>>> upstream/main
interface McpStore {
  byDirectory: Record<string, McpStatusMap>;
  /**
   * Per directory: `unknown` until its status was read. An unread directory's
   * empty map is not "every configured server is unapplied".
   */
  phaseKeys: Record<string, LoadPhase>;
  loadingKeys: Record<string, boolean>;
  lastErrorKeys: Record<string, string | null>;
  refreshedAtKeys: Record<string, number>;
  getStatusForDirectory: (directory?: string | null) => McpStatusMap;
  getPhaseForDirectory: (directory?: string | null) => LoadPhase;
  getErrorForDirectory: (directory?: string | null) => string | null;
  refresh: (options?: RefreshOptions) => Promise<void>;
  ensureFresh: (options: RefreshOptions & { maxAgeMs: number }) => Promise<void>;
  refreshIfHeld: (directory: string) => Promise<void>;
<<<<<<< HEAD
  connect: (serverId: string, directory?: string | null) => Promise<void>;
  disconnect: (serverId: string, directory?: string | null) => Promise<void>;
  reconnect: (serverId: string, directory?: string | null) => Promise<void>;
  testConnection: (serverId: string, directory?: string | null) => Promise<MCPConnectionTestResult>;
||||||| bc50ba56aa
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
=======
  forgetDirectory: (directory: string) => void;
  connect: (name: string, directory?: string | null) => Promise<void>;
  disconnect: (name: string, directory?: string | null) => Promise<void>;
  setEnabled: (name: string, enabled: boolean, directory?: string | null) => Promise<void>;
  testConnection: (name: string, directory?: string | null) => Promise<TestConnectionResult>;
>>>>>>> upstream/main
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
    byDirectory: {}, phaseKeys: {}, loadingKeys: {}, lastErrorKeys: {}, refreshedAtKeys: {},
    resetForRuntimeSwitch: () => {
      generation += 1;
      inFlight.clear();
      useMcpConfigStore.getState().resetForRuntimeSwitch();
      set({ byDirectory: {}, phaseKeys: {}, loadingKeys: {}, lastErrorKeys: {}, refreshedAtKeys: {} });
    },
    getStatusForDirectory: directory => get().byDirectory[directoryKey(directory)] ?? EMPTY_STATUS,
    getPhaseForDirectory: directory => get().phaseKeys[directoryKey(directory)] ?? 'unknown',
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
          phaseKeys: { ...state.phaseKeys, [key]: 'ready' },
          refreshedAtKeys: { ...state.refreshedAtKeys, [key]: Date.now() }, lastErrorKeys: { ...state.lastErrorKeys, [key]: null } }));
      } catch (error) {
        if (owner !== generation || revision !== operationRevision) return;
        const message = error instanceof Error ? error.message : 'Failed to load MCP status';
        set((state) => ({
          loadingKeys: { ...state.loadingKeys, [key]: false },
          // A failed read keeps any status already held; with nothing held it
          // is unknown, not an empty map of unapplied servers.
          phaseKeys: { ...state.phaseKeys, [key]: state.phaseKeys[key] === 'ready' ? 'ready' : 'error' },
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
<<<<<<< HEAD
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
||||||| bc50ba56aa

    refreshIfHeld: async (directory) => {
      const normalized = normalizeDirectory(directory);
      if (!normalized || !get().byDirectory[toKey(normalized)]) return;
      await get().refresh({ directory: normalized, silent: true });
    },

    forgetDirectory: (directory) => {
      const normalized = normalizeDirectory(directory);
      if (!normalized) return;
      const key = toKey(normalized);
      // A read already in flight would write the status back, and the next
      // announcement would then find it held and start the directory again.
      forgetGenerations.set(key, (forgetGenerations.get(key) ?? 0) + 1);
      ensureFreshInFlight.delete(key);
      const state = get();
      if (!(key in state.byDirectory) && !(key in state.loadingKeys)) return;
      const without = <T>(record: Record<string, T>) => {
        const next = { ...record };
        delete next[key];
        return next;
      };
      set((current) => ({
        byDirectory: without(current.byDirectory),
        diagnosticsByDirectory: without(current.diagnosticsByDirectory),
        loadingKeys: without(current.loadingKeys),
        lastErrorKeys: without(current.lastErrorKeys),
        refreshedAtKeys: without(current.refreshedAtKeys),
      }));
    },

    connect: async (name, directory) => {
      const normalized = normalizeDirectory(directory ?? useDirectoryStore.getState().currentDirectory);
      const key = toKey(normalized);
      try {
        await opencodeClient.connectMcpServer(name, normalized);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection failed';
        set((state) => ({
          diagnosticsByDirectory: {
            ...state.diagnosticsByDirectory,
            [key]: {
              ...(state.diagnosticsByDirectory[key] ?? {}),
              [name]: { status: 'failed', error: message },
            },
          },
        }));
        throw error;
=======

    refreshIfHeld: async (directory) => {
      const normalized = normalizeDirectory(directory);
      if (!normalized || !get().byDirectory[toKey(normalized)]) return;
      await get().refresh({ directory: normalized, silent: true });
    },

    forgetDirectory: (directory) => {
      const normalized = normalizeDirectory(directory);
      if (!normalized) return;
      const key = toKey(normalized);
      forgetGenerations.set(key, (forgetGenerations.get(key) ?? 0) + 1);
      ensureFreshInFlight.delete(key);
      const state = get();
      if (!(key in state.byDirectory) && !(key in state.loadingKeys)) return;
      const without = <T>(record: Record<string, T>) => {
        const next = { ...record };
        delete next[key];
        return next;
      };
      set((current) => ({
        byDirectory: without(current.byDirectory),
        diagnosticsByDirectory: without(current.diagnosticsByDirectory),
        loadingKeys: without(current.loadingKeys),
        lastErrorKeys: without(current.lastErrorKeys),
        refreshedAtKeys: without(current.refreshedAtKeys),
      }));
    },

    connect: async (name, directory) => {
      const normalized = normalizeDirectory(directory ?? useDirectoryStore.getState().currentDirectory);
      const key = toKey(normalized);
      try {
        await opencodeClient.connectMcpServer(name, normalized);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Connection failed';
        set((state) => ({
          diagnosticsByDirectory: {
            ...state.diagnosticsByDirectory,
            [key]: {
              ...(state.diagnosticsByDirectory[key] ?? {}),
              [name]: { status: 'failed', error: message },
            },
          },
        }));
        throw error;
>>>>>>> upstream/main
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
||||||| bc50ba56aa

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
=======

    setEnabled: async (name, enabled, directory) => {
      const normalized = normalizeDirectory(directory ?? useDirectoryStore.getState().currentDirectory);
      const configStore = useMcpConfigStore.getState();
      const generation = mcpGeneration;
      if (!await configStore.loadMcpConfigs({ force: true, directory: normalized })) {
        throw new Error('Failed to load MCP configs');
      }
      if (generation !== mcpGeneration) return;
      const configured = useMcpConfigStore.getState().getMcpByName(name, normalized);
      const disabledInConfig = configured?.disabled === true;
      if (configured && disabledInConfig === enabled) {
        await configStore.updateMcp(name, { disabled: !enabled }, normalized);
      }
      if (enabled && !disabledInConfig) await get().connect(name, normalized);
      else if (!enabled) await get().disconnect(name, normalized);
      else await get().refresh({ directory: normalized, silent: true });
    },

    testConnection: async (name, directory) => {
      const normalized = normalizeDirectory(directory ?? useDirectoryStore.getState().currentDirectory);
      const key = toKey(normalized);
      const previousStatus = get().getStatusForDirectory(normalized)[name];
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
>>>>>>> upstream/main
