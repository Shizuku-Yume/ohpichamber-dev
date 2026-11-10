<<<<<<< HEAD
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { CommandCatalogState, CommandEntry } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { emitConfigChange, scopeMatches, subscribeToConfigChanges } from '@/lib/configSync';

export type CommandScope = 'workspace' | 'agent';
export type Command = CommandEntry;
export type CommandConfig = Pick<CommandEntry, 'name' | 'description' | 'content' | 'argumentHint' | 'agentId' | 'modelSelection' | 'group'> & { scope?: CommandScope };
type CommandDraft = Omit<CommandConfig, 'content' | 'description'> & { content?: string; description?: string; scope: CommandScope };
=======
import { create } from "zustand";
import type { StoreApi, UseBoundStore } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { opencodeClient } from "@/lib/opencode/client";
import {
  startConfigUpdate,
  finishConfigUpdate,
  updateConfigUpdateMessage,
} from "@/lib/configUpdate";
import { emitConfigChange, scopeMatches, subscribeToConfigChanges } from "@/lib/configSync";
import { waitForOpenCodeConnection } from "@/stores/waitForOpenCodeConnection";
import { createDeferredSafeJSONStorage } from "./utils/safeStorage";
import { useProjectsStore } from "@/stores/useProjectsStore";
import { runtimeFetch } from "@/lib/runtime-fetch";
import { runBackgroundNetworkTask } from '@/lib/background-network';
import { normalizePath } from '@/lib/pathNormalization';


export type CommandScope = 'user' | 'project';

/**
 * The command entity as OpenChamber persists it, i.e. the OpenCode 2 shape the
 * config routes read and write. `template` is the markdown body of a `.md`
 * command; `model` is the joined `provider/model#variant` string; `subagent`
 * runs the command in a child session instead of the current one.
 */
export interface CommandConfig {
  name: string;
  description?: string;
  agent?: string | null;
  model?: string | null;
  source?: string;
  template?: string;
  subagent?: boolean;
  scope?: CommandScope;
}

export interface Command extends CommandConfig {
  isBuiltIn?: boolean;
  /** The file OpenChamber would rewrite on the next save. */
  path?: string | null;
  /** The file still uses v1 spellings; the next save rewrites it in v2. */
  legacy?: boolean;
  /** OpenChamber confirmed no command file or config entry: OpenCode or a plugin defines it. */
  fromOpenCode?: boolean;
}

// Built-in commands provided by OpenCode (not defined in user config directories)
const BUILTIN_COMMAND_NAMES = new Set(['init', 'review']);

/** What `GET /api/config/commands/:name/config` answers. */
interface CommandEntityEnvelope {
  source: 'md' | 'json' | 'none';
  scope: CommandScope | null;
  path: string | null;
  legacy: boolean;
  config: Omit<CommandConfig, 'name' | 'scope' | 'source'>;
}

export const isCommandBuiltIn = (command: Command): boolean => {
  return BUILTIN_COMMAND_NAMES.has(command.name);
};

// OpenCode's own `/goal` (2.2.1+) duplicates Goal Mode, so the composer does
// not offer it. A user's own `goal` command, or one whose metadata read
// failed, stays.
const HIDDEN_OPENCODE_COMMAND_NAMES = new Set(['goal']);

export const isCommandOfferedInComposer = (command: Command): boolean => {
  return !(command.fromOpenCode && !command.scope && HIDDEN_OPENCODE_COMMAND_NAMES.has(command.name));
};

const CONFIG_EVENT_SOURCE = "useCommandsStore";
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const COMMANDS_LOAD_CACHE_TTL_MS = 5000;
const DEFAULT_COMMANDS_CACHE_KEY = '__default__';
const commandsLastLoadedAt = new Map<string, number>();
const commandsLoadInFlight = new Map<string, Promise<boolean>>();
let commandsGeneration = 0;
const commandReadControllers = new Set<AbortController>();

const readCommandMetadata = <T>(generation: number, read: (signal: AbortSignal) => Promise<T>): Promise<T> => (
  runBackgroundNetworkTask(async () => {
    if (generation !== commandsGeneration) throw new Error('Command discovery superseded');
    const controller = new AbortController();
    commandReadControllers.add(controller);
    const timeout = setTimeout(() => controller.abort(new Error('Command discovery timed out')), 30_000);
    try {
      return await read(controller.signal);
    } finally {
      clearTimeout(timeout);
      commandReadControllers.delete(controller);
    }
  }).then((result) => {
    if (result === undefined) throw new Error('Command discovery superseded');
    return result;
  })
);

const getCommandsCacheKey = (directory: string | null): string => {
  return directory?.trim() || DEFAULT_COMMANDS_CACHE_KEY;
};

export const invalidateCommandsLoadCache = (directory: string | null = getRequestDirectory()) => {
  commandsLastLoadedAt.delete(getCommandsCacheKey(directory));
};

const buildCommandsSignature = (commands: Command[]): string => {
  return commands
    .map((command) => [
      command.name,
      command.scope ?? '',
      command.description ?? '',
      command.agent ?? '',
      command.model ?? '',
      command.template ?? '',
      String(command.subagent === true),
      String(command.legacy === true),
      String(command.isBuiltIn === true),
      String(command.fromOpenCode === true),
    ].join('|'))
    .join('||');
};

const upsertCommandLocal = (
  set: (updater: (state: CommandsStore) => Partial<CommandsStore>) => void,
  get: () => CommandsStore,
  name: string,
  config: Partial<CommandConfig>,
  directory: string | null,
) => {
  const cacheKey = getCommandsCacheKey(directory);
  const isAmbient = cacheKey === getCommandsCacheKey(getRequestDirectory());
  const current = get().commandsByDirectory[cacheKey] ?? [];
  const existing = current.find((command) => command.name === name);
  const nextCommand: Command = {
    ...existing,
    name,
    ...config,
    source: config.source ?? existing?.source,
    scope: config.scope ?? existing?.scope,
    isBuiltIn: existing?.isBuiltIn,
  };
  const nextCommands = current.some((command) => command.name === name)
    ? current.map((command) => (command.name === name ? nextCommand : command))
    : [...current, nextCommand];
  set((state) => {
    const next: Partial<CommandsStore> = {
      commandsByDirectory: { ...state.commandsByDirectory, [cacheKey]: nextCommands },
    };
    if (isAmbient) next.commands = nextCommands;
    return next;
  });
};

const removeCommandLocal = (
  set: (updater: (state: CommandsStore) => Partial<CommandsStore>) => void,
  get: () => CommandsStore,
  name: string,
  directory: string | null,
) => {
  const cacheKey = getCommandsCacheKey(directory);
  const isAmbient = cacheKey === getCommandsCacheKey(getRequestDirectory());
  const nextCommands = (get().commandsByDirectory[cacheKey] ?? []).filter((command) => command.name !== name);
  const clearSelection = get().selectedCommandName === name;
  set((state) => {
    const next: Partial<CommandsStore> = {
      commandsByDirectory: { ...state.commandsByDirectory, [cacheKey]: nextCommands },
    };
    if (isAmbient) next.commands = nextCommands;
    if (clearSelection) next.selectedCommandName = null;
    return next;
  });
};

/**
 * Directory a call operates on. Settings can browse another project without
 * moving the app, so every entry point takes one; omitting it means the project
 * the app is currently on.
 */
const resolveDirectory = (directory?: string | null): string | null => {
  if (directory !== undefined) {
    const trimmed = directory?.trim();
    return trimmed ? trimmed : null;
  }
  return getRequestDirectory();
};

const getRequestDirectory = (): string | null => {
  try {
    const projectsStore = useProjectsStore.getState();
    const activeProject = projectsStore.getActiveProject?.();
    
    // 1. Primary: Active project path from store
    if (activeProject?.path?.trim()) {
      return activeProject.path.trim();
    }

    // 2. Fallback: current OpenCode directory (session / runtime)
    const clientDir = opencodeClient.getDirectory();
    if (clientDir?.trim()) {
      return clientDir.trim();
    }
  } catch (err) {
    console.warn('[CommandsStore] Error resolving config directory:', err);
  }

  return null;
};

interface CommandDraft {
  name: string;
  scope: CommandScope;
  description?: string;
  agent?: string | null;
  model?: string | null;
  template?: string;
  subagent?: boolean;
}
>>>>>>> bc50ba56a

interface CommandsStore {
  selectedCommandId: string | null;
  selectedCommandName: string | null;
  commands: Command[];
  commandsByDirectory: { [directory: string]: Command[] };
  catalogsByDirectory: { [directory: string]: CommandCatalogState };
  isLoading: boolean;
  commandDraft: CommandDraft | null;
  setSelectedCommand: (name: string | null) => void;
  setSelectedCommandId: (id: string | null) => void;
  setCommandDraft: (draft: CommandDraft | null) => void;
  loadCommands: (directory?: string | null) => Promise<boolean>;
  resetForRuntimeSwitch: () => void;
  createCommand: (config: CommandConfig, directory?: string | null) => Promise<boolean>;
  updateCommand: (name: string, config: Partial<Omit<CommandConfig, 'agentId'>> & { agentId?: string | null }, directory?: string | null, commandId?: string | null) => Promise<boolean>;
  deleteCommand: (name: string, directory?: string | null, commandId?: string | null) => Promise<boolean>;
  getCommandByName: (name: string, directory?: string | null) => Command | undefined;
}

interface ResourceOwner {
  directory: string;
  workspaceId: string;
  runtimeKey: string;
  currentGeneration: number;
}

const EMPTY_COMMANDS: Command[] = [];
const EMPTY_BUILTIN_COMMANDS: CommandCatalogState['builtinCommands'] = [];
const DEFAULT_DIRECTORY = '__default__';
const SOURCE = 'useCommandsStore';
let generation = 0;
const loads = new Map<string, Promise<boolean>>();
const loadedAt = new Map<string, number>();
const requestDirectory = (): string | null => useDirectoryStore.getState().currentDirectory
  || useProjectsStore.getState().getActiveProject()?.path || null;
const resolveDirectory = (directory?: string | null): string | null => directory === undefined ? requestDirectory() : directory;
const keyFor = (directory?: string | null): string => resolveDirectory(directory)?.trim() || DEFAULT_DIRECTORY;
export const isCommandBuiltIn = (command: Command): boolean => !command.editable;
export const invalidateCommandsLoadCache = (directory?: string | null): void => { loadedAt.delete(keyFor(directory)); };
export const selectCommandsForDirectory = (state: Pick<CommandsStore, 'commandsByDirectory'>, directory?: string | null): Command[] =>
  state.commandsByDirectory[keyFor(directory)] ?? EMPTY_COMMANDS;
export const selectBuiltinCommandsForDirectory = (state: Pick<CommandsStore, 'catalogsByDirectory'>, directory?: string | null): CommandCatalogState['builtinCommands'] =>
  state.catalogsByDirectory[keyFor(directory)]?.builtinCommands ?? EMPTY_BUILTIN_COMMANDS;

<<<<<<< HEAD
export const useCommandsStore = create<CommandsStore>()(devtools((set, get) => {
  const publish = (directory: string, catalog: CommandCatalogState): void => {
    const key = keyFor(directory);
    const previous = get().catalogsByDirectory[key];
    if (previous && BigInt(previous.revision) > BigInt(catalog.revision)) return;
    loadedAt.set(key, Date.now());
    set((state) => ({
      catalogsByDirectory: { ...state.catalogsByDirectory, [key]: catalog },
      commandsByDirectory: { ...state.commandsByDirectory, [key]: catalog.commands },
      ...(key === keyFor() ? { commands: catalog.commands } : {}),
    }));
  };
  const context = async (requestedDirectory?: string | null): Promise<ResourceOwner> => {
    const directory = resolveDirectory(requestedDirectory);
    if (!directory) throw new Error('A workspace directory is required for file resources');
    const runtimeKey = getRuntimeKey();
    const currentGeneration = generation;
    const workspace = await canonicalClient.resolveWorkspace(directory);
    if (runtimeKey !== getRuntimeKey() || currentGeneration !== generation) throw new Error('File resource runtime changed');
    return { directory, workspaceId: workspace.workspaceId, runtimeKey, currentGeneration };
  };
  const current = (owner: ResourceOwner): boolean =>
    owner.runtimeKey === getRuntimeKey() && owner.currentGeneration === generation;
  const catalogFor = async (owner: ResourceOwner): Promise<CommandCatalogState> => {
    const existing = get().catalogsByDirectory[keyFor(owner.directory)];
    if (existing) return existing;
    const catalog = await canonicalClient.fileResources.getCommands(owner.workspaceId);
    if (!current(owner)) throw new Error('File resource runtime changed');
    publish(owner.directory, catalog);
    return catalog;
  };
  return {
    selectedCommandId: null, selectedCommandName: null, commands: [], commandsByDirectory: {}, catalogsByDirectory: {}, isLoading: false, commandDraft: null,
    setSelectedCommand: (name) => {
      let match = get().commands.find(c => c.name === name);
      if (!match) {
        for (const list of Object.values(get().commandsByDirectory)) {
          match = list.find(c => c.name === name);
          if (match) break;
        }
      }
      set({ selectedCommandName: name, selectedCommandId: match?.commandId ?? null });
=======
/**
 * Commands of one project. Returns a stored array so components can select it
 * directly; an omitted directory means the project the app is on.
 */
export const selectCommandsForDirectory = (
  state: Pick<CommandsStore, 'commandsByDirectory'>,
  directory?: string | null,
): Command[] => {
  const cacheKey = getCommandsCacheKey(resolveDirectory(directory));
  return state.commandsByDirectory[cacheKey] ?? EMPTY_COMMANDS;
};

type CommandDirectorySource = {
  open: boolean;
  worktreeStartDirectory?: { worktreeRoot: string; directory: string | null } | null;
};

type ComposerCommandDirectory =
  | { status: 'pending' }
  | { status: 'resolved'; directory: string | null | undefined };

/** A draft uses its start folder; pending discovery must never request the root. */
export const resolveCommandDirectory = (
  directory: string | null | undefined,
  draft: CommandDirectorySource | null,
): ComposerCommandDirectory => {
  const start = draft?.open ? draft.worktreeStartDirectory : null;
  if (!start || !directory || normalizePath(directory) !== start.worktreeRoot) {
    return { status: 'resolved', directory };
  }
  if (start.directory === null) return { status: 'pending' };
  return { status: 'resolved', directory: start.directory };
};

export const selectCommandsForComposer = (
  state: Pick<CommandsStore, 'commandsByDirectory'>,
  target: ComposerCommandDirectory,
): Command[] => (target.status === 'pending' ? EMPTY_COMMANDS : selectCommandsForDirectory(state, target.directory));

export const useCommandsStore = create<CommandsStore>()(
  devtools(
    persist(
      (set, get) => ({

        selectedCommandName: null,
        commands: [],
        commandsByDirectory: {},
        isLoading: false,
        commandDraft: null,

        setSelectedCommand: (name: string | null) => {
          set({ selectedCommandName: name });
        },

        setCommandDraft: (draft: CommandDraft | null) => {
          set({ commandDraft: draft });
        },

        resetForRuntimeSwitch: () => {
          commandsGeneration += 1;
          for (const controller of commandReadControllers) controller.abort();
          commandReadControllers.clear();
          commandsLastLoadedAt.clear();
          commandsLoadInFlight.clear();
          set({ commands: [], commandsByDirectory: {}, isLoading: false });
        },

        loadCommands: async (requestedDirectory?: string | null) => {
          const directory = resolveDirectory(requestedDirectory);
          const cacheKey = getCommandsCacheKey(directory);
          const isAmbient = cacheKey === getCommandsCacheKey(getRequestDirectory());
          const now = Date.now();
          const loadedAt = commandsLastLoadedAt.get(cacheKey) ?? 0;
          const cachedCommands = get().commandsByDirectory[cacheKey];
          if (isAmbient && get().commands !== (cachedCommands ?? EMPTY_COMMANDS)) {
            set({ commands: cachedCommands ?? EMPTY_COMMANDS });
          }

          if (cachedCommands !== undefined && now - loadedAt < COMMANDS_LOAD_CACHE_TTL_MS) {
            return true;
          }

          const inFlight = commandsLoadInFlight.get(cacheKey);
          if (inFlight) {
            return inFlight;
          }

          const generation = commandsGeneration;
          const request = (async () => {
            set({ isLoading: true });
            // Only this directory can supply the comparison baseline. The mirror
            // may still describe the project we just left.
            const previousCommands = get().commandsByDirectory[cacheKey];
            const previousSignature = buildCommandsSignature(previousCommands ?? EMPTY_COMMANDS);
            let lastError: unknown = null;

            for (let attempt = 0; attempt < 3; attempt++) {
              try {
                const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';

                // Ensure the list is scoped to the same directory we use for config source detection.
                // v2 keeps skills in their own catalog, so every command here is a real command file.
                const commands = await readCommandMetadata(generation, (signal) => opencodeClient.listCommands(directory, signal));
                if (generation !== commandsGeneration) return false;

                const commandsWithScope = await Promise.all(
                  commands.map((cmd) => readCommandMetadata(generation, async (signal) => {
                    if (generation !== commandsGeneration) return cmd;
                    try {
                      // The v2 `CommandInfo` OpenCode lists carries only a name
                      // and description, so the editable fields come from the
                      // command's own stored entry.
                      const response = await runtimeFetch(`/api/config/commands/${encodeURIComponent(cmd.name)}/config${queryParams}`, {
                        signal,
                        headers: {
                          'Cache-Control': 'no-cache',
                          ...(directory ? { 'x-opencode-directory': directory } : {}),
                        }
                      });

                      if (response.ok) {
                        // SAFETY: `/api/config/commands/:name/config` is
                        // OpenChamber's own route; it normalizes the entry
                        // through `config-v2.js` before answering.
                        const data = await response.json() as CommandEntityEnvelope;
                        const scope = data.scope === 'project' || data.scope === 'user' ? data.scope : undefined;
                        return {
                          ...cmd,
                          ...data.config,
                          name: cmd.name,
                          description: data.config?.description ?? cmd.description,
                          scope,
                          path: data.path,
                          legacy: data.legacy === true,
                          ...(data.source === 'none' ? { fromOpenCode: true } : {}),
                        };
                      }
                    } catch (err) {
                      if (generation !== commandsGeneration) return cmd;
                      console.warn(`[CommandsStore] Failed to fetch config for command ${cmd.name}:`, err);
                    }
                    return cmd;
                  }))
                );
                if (generation !== commandsGeneration) return false;

                const nextSignature = buildCommandsSignature(commandsWithScope);
                const nextCommands = previousCommands !== undefined && previousSignature === nextSignature
                  ? previousCommands
                  : commandsWithScope;
                set((state) => {
                  const next: Partial<CommandsStore> = { isLoading: false };
                  if (state.commandsByDirectory[cacheKey] !== nextCommands) {
                    next.commandsByDirectory = { ...state.commandsByDirectory, [cacheKey]: nextCommands };
                  }
                  if (cacheKey === getCommandsCacheKey(getRequestDirectory())) {
                    next.commands = nextCommands;
                  }
                  return next;
                });
                commandsLastLoadedAt.set(cacheKey, Date.now());
                return true;
              } catch (error) {
                if (generation !== commandsGeneration) return false;
                lastError = error;
                const waitMs = 200 * (attempt + 1);
                await new Promise((resolve) => setTimeout(resolve, waitMs));
              }
            }

            if (generation !== commandsGeneration) return false;
            console.error("Failed to load commands:", lastError);
            // Keep the current directory cache, including edits made during the load.
            set({ isLoading: false });
            return false;
          })();

          commandsLoadInFlight.set(cacheKey, request);
          try {
            return await request;
          } finally {
            if (commandsLoadInFlight.get(cacheKey) === request) commandsLoadInFlight.delete(cacheKey);
          }
        },

        createCommand: async (config: CommandConfig, requestedDirectory?: string | null) => {
          const generation = commandsGeneration;
          try {
            console.log('[CommandsStore] Creating command:', config.name);

            const commandConfig: Record<string, unknown> = {
              template: config.template || '',
            };

            if (config.description) commandConfig.description = config.description;
            if (config.agent) commandConfig.agent = config.agent;
            if (config.model) commandConfig.model = config.model;
            if (config.subagent !== undefined) commandConfig.subagent = config.subagent;
            if (config.scope) commandConfig.scope = config.scope;

            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';

            const response = await runtimeFetch(`/api/config/commands/${encodeURIComponent(config.name)}${queryParams}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(directory ? { 'x-opencode-directory': directory } : {}),
              },
              body: JSON.stringify(commandConfig)
            });

            const payload = await response.json().catch(() => null);
            if (generation !== commandsGeneration) return false;
            if (!response.ok) {
              const message = payload?.error || 'Failed to create command';
              throw new Error(message);
            }

            console.log('[CommandsStore] Command created successfully');

            invalidateCommandsLoadCache(directory);

            if (payload?.requiresManualRestart) {
              upsertCommandLocal(set, get, config.name, config, directory);
              return true;
            }

            if (payload?.requiresReload) {
              startConfigUpdate("Creating command configuration…");
              await performFullConfigRefresh({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              });
              return generation === commandsGeneration;
            }

            const loaded = await get().loadCommands(directory);
            if (generation !== commandsGeneration) return false;
            if (loaded) {
              emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch (error) {
            console.error("[CommandsStore] Failed to create command:", error);
            return false;
          }
        },

        updateCommand: async (name: string, config: Partial<CommandConfig>, requestedDirectory?: string | null) => {
          const generation = commandsGeneration;
          try {
            console.log('[CommandsStore] Updating command:', name);

            const commandConfig: Record<string, unknown> = {};

            if (config.description !== undefined) commandConfig.description = config.description;
            if (config.agent !== undefined) commandConfig.agent = config.agent;
            if (config.model !== undefined) commandConfig.model = config.model;
            if (config.template !== undefined) commandConfig.template = config.template;
            if (config.subagent !== undefined) commandConfig.subagent = config.subagent;

            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';

            const response = await runtimeFetch(`/api/config/commands/${encodeURIComponent(name)}${queryParams}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(directory ? { 'x-opencode-directory': directory } : {}),
              },
              body: JSON.stringify(commandConfig)
            });

            const payload = await response.json().catch(() => null);
            if (generation !== commandsGeneration) return false;
            if (!response.ok) {
              const message = payload?.error || 'Failed to update command';
              throw new Error(message);
            }

            console.log('[CommandsStore] Command updated successfully');

            invalidateCommandsLoadCache(directory);

            if (payload?.requiresManualRestart) {
              upsertCommandLocal(set, get, name, config, directory);
              return true;
            }

            if (payload?.requiresReload) {
              startConfigUpdate("Updating command configuration…");
              await performFullConfigRefresh({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              });
              return generation === commandsGeneration;
            }

            const loaded = await get().loadCommands(directory);
            if (generation !== commandsGeneration) return false;
            if (loaded) {
              emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch (error) {
            console.error("[CommandsStore] Failed to update command:", error);
            return false;
          }
        },

        deleteCommand: async (name: string, requestedDirectory?: string | null) => {
          const generation = commandsGeneration;
          try {
            // Use active project root for project-level command support
            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';

            const response = await runtimeFetch(`/api/config/commands/${encodeURIComponent(name)}${queryParams}`, {
              method: 'DELETE',
              headers: directory ? { 'x-opencode-directory': directory } : undefined,
            });

            const payload = await response.json().catch(() => null);
            if (generation !== commandsGeneration) return false;
            if (!response.ok) {
              const message = payload?.error || 'Failed to delete command';
              throw new Error(message);
            }

            console.log('[CommandsStore] Command deleted successfully');

            invalidateCommandsLoadCache(directory);

            if (payload?.requiresManualRestart) {
              removeCommandLocal(set, get, name, directory);
              return true;
            }

            if (payload?.requiresReload) {
              startConfigUpdate("Deleting command configuration…");
              await performFullConfigRefresh({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              });
              return generation === commandsGeneration;
            }

            const loaded = await get().loadCommands(directory);
            if (generation !== commandsGeneration) return false;
            if (loaded) {
              emitConfigChange("commands", { source: CONFIG_EVENT_SOURCE });
            }

            if (get().selectedCommandName === name) {
              set({ selectedCommandName: null });
            }

            return loaded;
          } catch (error) {
            console.error("Failed to delete command:", error);
            return false;
          }
        },

        getCommandByName: (name: string, requestedDirectory?: string | null) => {
          return selectCommandsForDirectory(get(), requestedDirectory).find((command) => command.name === name);
        },
      }),
      {
        name: "commands-store",
        storage: createDeferredSafeJSONStorage(),
        partialize: (state) => ({
          selectedCommandName: state.selectedCommandName,
        }),
      },
    ),
    {
      name: "commands-store",
>>>>>>> bc50ba56a
    },
    setSelectedCommandId: (id) => {
      let match = get().commands.find(c => c.commandId === id);
      if (!match) {
        for (const list of Object.values(get().commandsByDirectory)) {
          match = list.find(c => c.commandId === id);
          if (match) break;
        }
      }
      set({ selectedCommandId: id, selectedCommandName: match?.name ?? id });
    },
    setCommandDraft: (draft) => set({ commandDraft: draft, selectedCommandId: null }),
    resetForRuntimeSwitch: () => {
      generation += 1; loads.clear(); loadedAt.clear();
      set({ commands: [], commandsByDirectory: {}, catalogsByDirectory: {}, isLoading: false, commandDraft: null, selectedCommandName: null, selectedCommandId: null });
    },
    loadCommands: async (requestedDirectory) => {
      const directory = resolveDirectory(requestedDirectory);
      const key = keyFor(directory);
      if (Date.now() - (loadedAt.get(key) ?? 0) < 5000) return true;
      const inflight = loads.get(key);
      if (inflight) return inflight;
      const request = (async () => {
        const startedGeneration = generation;
        set({ isLoading: true });
        try {
          const owner = await context(directory);
          const catalog = await canonicalClient.fileResources.getCommands(owner.workspaceId);
          if (!current(owner)) return false;
          publish(owner.directory, catalog);
          return true;
        } catch (error) {
          console.error('[CommandsStore] Failed to load native commands:', error);
          return false;
        } finally {
          if (startedGeneration === generation) set({ isLoading: false });
        }
      })();
      loads.set(key, request);
      try { return await request; } finally { if (loads.get(key) === request) loads.delete(key); }
    },
    createCommand: async (config, directory) => {
      try {
        const owner = await context(directory);
        const catalog = await catalogFor(owner);
        const next = await canonicalClient.fileResources.createCommand(owner.workspaceId, {
          ...config, content: config.content, expectedRevision: catalog.revision, scope: config.scope ?? 'agent',
        });
        if (!current(owner)) return false;
        publish(owner.directory, next);
        emitConfigChange('commands', { source: SOURCE });
        return true;
      } catch (error) { console.error('[CommandsStore] Failed to create command:', error); return false; }
    },
    updateCommand: async (name, config, directory, commandId) => {
      try {
        const owner = await context(directory);
        const catalog = await catalogFor(owner);
        const entry = commandId
          ? catalog.commands.find((command) => command.commandId === commandId)
          : (catalog.commands.find((command) => command.name === name && command.editable && command.scope !== 'inherited')
            ?? catalog.commands.find((command) => command.name === name));
        if (!entry?.editable || entry.scope === 'inherited') return false;
        const next = await canonicalClient.fileResources.updateCommand(owner.workspaceId, {
          name: config.name ?? entry.name, description: config.description ?? entry.description,
          content: config.content ?? entry.content, argumentHint: config.argumentHint ?? entry.argumentHint,
          agentId: null,
          modelSelection: 'modelSelection' in config ? config.modelSelection : entry.modelSelection,
          group: config.group ?? entry.group,
          scope: entry.scope, expectedRevision: catalog.revision, commandId: entry.commandId,
        });
        if (!current(owner)) return false;
        publish(owner.directory, next);
        emitConfigChange('commands', { source: SOURCE });
        return true;
      } catch (error) { console.error('[CommandsStore] Failed to update command:', error); return false; }
    },
    deleteCommand: async (name, directory, commandId) => {
      try {
        const owner = await context(directory);
        const catalog = await catalogFor(owner);
        const entry = commandId
          ? catalog.commands.find((command) => command.commandId === commandId)
          : (catalog.commands.find((command) => command.name === name && command.editable && command.scope !== 'inherited')
            ?? catalog.commands.find((command) => command.name === name));
        if (!entry?.editable) return false;
        const next = await canonicalClient.fileResources.deleteCommand(owner.workspaceId, { expectedRevision: catalog.revision, commandId: entry.commandId });
        if (!current(owner)) return false;
        publish(owner.directory, next);
        const state = get();
        const shouldClear = state.selectedCommandId !== null
          ? state.selectedCommandId === entry.commandId
          : state.selectedCommandName === name;
        if (shouldClear) {
          set({ selectedCommandName: null, selectedCommandId: null });
        }
        emitConfigChange('commands', { source: SOURCE });
        return true;
      } catch (error) { console.error('[CommandsStore] Failed to delete command:', error); return false; }
    },
    getCommandByName: (name, directory) => selectCommandsForDirectory(get(), directory).find((command) => command.name === name),
  };
}, { name: 'commands-store' }));

subscribeToConfigChanges((event) => {
  if (event.source !== SOURCE && scopeMatches(event, 'commands')) {
    invalidateCommandsLoadCache();
    void useCommandsStore.getState().loadCommands();
  }
});
