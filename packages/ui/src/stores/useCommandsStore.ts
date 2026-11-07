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
   const match = get().commands.find(c => c.name === name);
   set({ selectedCommandName: name, selectedCommandId: match?.commandId ?? null });
  },
  setSelectedCommandId: (id) => {
   const match = get().commands.find(c => c.commandId === id);
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
    if (get().selectedCommandId === entry.commandId || get().selectedCommandName === name) {
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
