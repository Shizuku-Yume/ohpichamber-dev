import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { FileResourceScope, PromptTemplateCatalogState, PromptTemplateCreateRequest } from '@openchamber/agent-contract';
import type { Snippet } from '@/types/snippet';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';

export type SnippetScope = FileResourceScope;

<<<<<<< HEAD
/** The quick "save as snippet" dialog: text from a message, a selection or the composer. */
export interface SnippetQuickCreate {
  name?: string;
  content: string;
  /** Runs once the snippet is saved, with the name it got. */
  onSaved?: (name: string) => void;
=======
export interface SnippetDraft {
  name: string;
  scope: SnippetScope;
  content?: string;
  aliases?: string[];
  description?: string;
>>>>>>> bc50ba56a
}
type SnippetInput = Omit<PromptTemplateCreateRequest, 'expectedRevision'>;
type SnippetDraft = Pick<SnippetInput, 'name' | 'scope'> & Partial<Omit<SnippetInput, 'name' | 'scope'>>;

/** A write either lands, or fails because the name is taken, or fails otherwise. */
type SnippetWriteResult = { ok: true } | { ok: false; reason: 'taken' | 'failed' };

/** The quick "save as snippet" dialog: text from a message, a selection or the composer. */
export interface SnippetQuickCreate {
  name?: string;
  content: string;
  /** Runs once the snippet is saved, with the name it got. */
  onSaved?: (name: string) => void;
}

interface SnippetsStore {
  snippets: Snippet[];
  catalog: PromptTemplateCatalogState | null;
  catalogsByDirectory: ReadonlyMap<string, PromptTemplateCatalogState>;
  directory: string | null;
  isLoading: boolean;
  selectedSnippetName: string | null;
  snippetDraft: SnippetDraft | null;
<<<<<<< HEAD
  quickCreate: SnippetQuickCreate | null;
  openQuickCreate: (request: SnippetQuickCreate) => void;
  closeQuickCreate: () => void;
  setSelectedSnippet: (id: string | null) => void;
  setSnippetDraft: (draft: SnippetDraft | null) => void;
  loadSnippets: (directory?: string | null) => Promise<boolean>;
  createSnippet: (name: string, content: string, options?: Omit<SnippetInput, 'name' | 'content'>) => Promise<boolean>;
  updateSnippet: (id: string, updates: { content: string; description?: string }) => Promise<boolean>;
  deleteSnippet: (id: string) => Promise<boolean>;
  expandText: (text: string, directory?: string | null) => Promise<string>;
=======
  /** The editor holds edits that switching to another snippet would drop. */
  hasUnsavedChanges: boolean;
  quickCreate: SnippetQuickCreate | null;

  setSelectedSnippet: (name: string | null) => void;
  setSnippetDraft: (draft: SnippetDraft | null) => void;
  setHasUnsavedChanges: (value: boolean) => void;
  openQuickCreate: (request: SnippetQuickCreate) => void;
  closeQuickCreate: () => void;
  loadSnippets: () => Promise<boolean>;
  createSnippet: (name: string, content: string, options?: { aliases?: string[]; description?: string; scope?: SnippetScope }) => Promise<SnippetWriteResult>;
  /** `name` renames the snippet, `scope` moves it to the other folder. */
  updateSnippet: (name: string, updates: { name?: string; scope?: SnippetScope; content?: string; aliases?: string[]; description?: string }) => Promise<SnippetWriteResult>;
  deleteSnippet: (name: string) => Promise<boolean>;
  expandText: (text: string) => Promise<string>;
  /** What a snippet body sends once used, saved or not. */
  previewSnippet: (content: string) => Promise<string>;
>>>>>>> bc50ba56a
  getSnippetByName: (name: string) => Snippet | undefined;
  resetForRuntimeSwitch: () => void;
}

<<<<<<< HEAD
const resolveDirectory = (directory?: string | null): string => {
  if (directory === null) throw new Error('Workspace directory is unavailable');
  const resolved = directory ?? useUIStore.getState().settingsProjectPath
    ?? useDirectoryStore.getState().currentDirectory
    ?? useProjectsStore.getState().getActiveProject()?.path
    ?? hostFilesystem.getDirectory();
  if (!resolved?.trim()) throw new Error('Workspace directory is unavailable');
  return resolved.trim();
=======
const writeFailure = (status: number): SnippetWriteResult => ({ ok: false, reason: status === 409 ? 'taken' : 'failed' });

const SNIPPETS_LOAD_CACHE_TTL_MS = 5000;
let lastLoadedAt = 0;
/**
 * Advances on every local change. A load started before a change answers with
 * the list from before it, so it neither commits nor serves later callers.
 */
let registryGeneration = 0;
let loadInFlight: { generation: number; promise: Promise<boolean> } | null = null;
/**
 * The directory the loaded list is complete for; undefined until a load
 * succeeds, and again from a local change until the reload lands.
 */
let registryDirectory: string | null | undefined;

/**
 * Snippets are files on disk that another window, client or editor can add,
 * so the loaded list stands for the directory's registry only as long as the
 * load cache does. Only such a list may rule out an expansion without asking
 * the server.
 */
const isRegistryCurrent = (directory: string | null): boolean => (
  registryDirectory === directory && Date.now() - lastLoadedAt < SNIPPETS_LOAD_CACHE_TTL_MS
);

const invalidateRegistry = () => {
  registryGeneration += 1;
  lastLoadedAt = 0;
  registryDirectory = undefined;
>>>>>>> bc50ba56a
};

const EMPTY_SNIPPETS: Snippet[] = [];
export const selectSnippetsForDirectory = (state: SnippetsStore, directory: string | null | undefined): Snippet[] =>
  directory ? state.catalogsByDirectory.get(directory.trim())?.templates ?? EMPTY_SNIPPETS : EMPTY_SNIPPETS;

let generation = 0;
const mutationRevisions = new Map<string, number>();
const pendingLoads = new Map<string, { revision: number; promise: Promise<boolean> }>();

export const useSnippetsStore = create<SnippetsStore>()(devtools((set, get) => {
  const publish = (directory: string, catalog: PromptTemplateCatalogState) => {
    const catalogsByDirectory = new Map(get().catalogsByDirectory);
    catalogsByDirectory.set(directory, catalog);
    if (get().directory === directory) set({ catalogsByDirectory, snippets: catalog.templates, catalog, isLoading: false });
    else set({ catalogsByDirectory });
  };

<<<<<<< HEAD
  const mutate = async (operation: (catalog: PromptTemplateCatalogState) => Promise<PromptTemplateCatalogState>): Promise<boolean> => {
    const owner = generation;
    const runtime = getRuntimeKey();
    try {
      const directory = resolveDirectory();
      const catalog = get().catalog;
      // Writes use the revision the user viewed, never an unseen refreshed revision.
      if (!catalog || get().directory !== directory) throw new Error('Prompt template catalog is unavailable');
      const result = await operation(catalog);
      if (owner !== generation || runtime !== getRuntimeKey() || resolveDirectory() !== directory) return false;
      mutationRevisions.set(directory, (mutationRevisions.get(directory) ?? 0) + 1);
      pendingLoads.delete(directory);
      publish(directory, result);
      return true;
    } catch (error) {
      console.error('[SnippetsStore] Failed to mutate:', error);
      return false;
    }
  };

  return {
    snippets: [], catalog: null, catalogsByDirectory: new Map(), directory: null, isLoading: false,
    selectedSnippetName: null, snippetDraft: null, quickCreate: null,
    openQuickCreate: (request) => set({ quickCreate: request }),
    closeQuickCreate: () => set({ quickCreate: null }),
    setSelectedSnippet: (id) => set({ selectedSnippetName: id }),
    setSnippetDraft: (draft) => set({ snippetDraft: draft }),
    resetForRuntimeSwitch: () => {
      generation += 1;
      pendingLoads.clear();
      mutationRevisions.clear();
      set({ snippets: [], catalog: null, catalogsByDirectory: new Map(), directory: null, isLoading: false, selectedSnippetName: null, snippetDraft: null, quickCreate: null });
    },
    loadSnippets: async (requestedDirectory) => {
      let directory: string;
      try { directory = resolveDirectory(requestedDirectory); } catch { return false; }
      const owner = generation;
      const runtime = getRuntimeKey();
      const revision = mutationRevisions.get(directory) ?? 0;
      // Explicit composer reads populate their own directory without replacing a settings selection.
      if (directory === resolveDirectory() && get().directory !== directory) {
        const catalog = get().catalogsByDirectory.get(directory) ?? null;
        set({ directory, snippets: catalog?.templates ?? [], catalog, selectedSnippetName: null, snippetDraft: null });
      }
      const pending = pendingLoads.get(directory);
      if (pending?.revision === revision) return pending.promise;
      if (get().directory === directory) set({ isLoading: true });
      const promise = (async () => {
        try {
          const workspace = await canonicalClient.resolveWorkspace(directory);
          if (owner !== generation || runtime !== getRuntimeKey()) return false;
          const catalog = await canonicalClient.fileResources.getPromptTemplates(workspace.workspaceId);
          if (owner !== generation || runtime !== getRuntimeKey()) return false;
          if (revision === (mutationRevisions.get(directory) ?? 0)) publish(directory, catalog);
          if (get().directory === directory) set({ isLoading: false });
          return true;
        } catch (error) {
          if (owner === generation && get().directory === directory) set({ isLoading: false });
          console.error('[SnippetsStore] Failed to load:', error);
          return false;
        }
      })();
      const entry = { revision, promise };
      pendingLoads.set(directory, entry);
      try { return await promise; } finally { if (pendingLoads.get(directory) === entry) pendingLoads.delete(directory); }
    },
    createSnippet: async (name, content, options = { scope: 'agent' }) => {
      const success = await mutate((catalog) => canonicalClient.fileResources.createPromptTemplate(catalog.workspaceId, {
        ...options, name, content, expectedRevision: catalog.revision,
      }));
      if (success) {
        const created = get().snippets.find(template => template.name === name && template.scope === options.scope);
        if (created) set({ selectedSnippetName: created.templateId });
      }
      return success;
    },
    updateSnippet: (id, updates) => mutate((catalog) => {
      const template = catalog.templates.find(item => item.templateId === id);
      if (!template?.editable || template.scope === 'inherited') throw new Error('Prompt template is read-only');
      return canonicalClient.fileResources.updatePromptTemplate(catalog.workspaceId, {
        templateId: id, expectedRevision: catalog.revision, name: template.name, scope: template.scope,
        content: updates.content, description: updates.description ?? template.description,
        group: template.group, agentId: template.agentId, modelSelection: template.modelSelection,
      });
=======
/**
 * The server's expansion: `text` is a prompt to expand, `content` a snippet
 * body to preview as it would send.
 */
const requestExpansion = async (directory: string | null, body: { text: string } | { content: string }): Promise<string | undefined> => {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (directory) headers.set('x-opencode-directory', directory);
  const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
  const response = await runtimeFetch(`/api/config/snippets/expand${queryParams}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Failed to expand snippets');
  return (await response.json()).text;
};

export const useSnippetsStore = create<SnippetsStore>()(
  devtools(
    (set, get) => ({
      snippets: [],
      isLoading: false,
      selectedSnippetName: null,
      snippetDraft: null,
      hasUnsavedChanges: false,
      quickCreate: null,

      setSelectedSnippet: (name) => set({ selectedSnippetName: name }),
      setSnippetDraft: (draft) => set({ snippetDraft: draft }),
      setHasUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),
      openQuickCreate: (request) => set({ quickCreate: request }),
      closeQuickCreate: () => set({ quickCreate: null }),

      loadSnippets: async () => {
        const directory = getRequestDirectory();
        if (get().snippets.length > 0 && isRegistryCurrent(directory)) return true;
        if (loadInFlight?.generation === registryGeneration) return loadInFlight.promise;

        const generation = registryGeneration;
        const request = (async (): Promise<boolean> => {
          set({ isLoading: true });
          try {
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
            const response = await runtimeFetch(`/api/config/snippets${queryParams}`, {
              headers: { 'Cache-Control': 'no-cache', ...(directory ? { 'x-opencode-directory': directory } : {}) },
              // runtimeFetch joins concurrent identical config reads unless the
              // request carries a signal. A read after a local change must not
              // join one started before it.
              signal: new AbortController().signal,
            });
            if (!response.ok) throw new Error('Failed to load snippets');
            const snippets: Snippet[] = await response.json();
            // A local change landed while this read was in flight: its list is
            // from before the change. Answer with the read that follows it.
            if (generation !== registryGeneration) return get().loadSnippets();
            set({ snippets, isLoading: false });
            lastLoadedAt = Date.now();
            registryDirectory = directory;
            return true;
          } catch (error) {
            if (generation !== registryGeneration) return get().loadSnippets();
            console.error('[SnippetsStore] Failed to load:', error);
            set({ isLoading: false });
            return false;
          }
        })();

        const entry = { generation, promise: request };
        loadInFlight = entry;
        try {
          return await request;
        } finally {
          if (loadInFlight === entry) loadInFlight = null;
        }
      },

      createSnippet: async (name, content, options = {}) => {
        try {
          const directory = getRequestDirectory();
          const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
          const response = await runtimeFetch(`/api/config/snippets/${encodeURIComponent(name)}${queryParams}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(directory ? { 'x-opencode-directory': directory } : {}) },
            body: JSON.stringify({ content, aliases: options.aliases, description: options.description, scope: options.scope }),
          });
          if (!response.ok) {
            console.error('[SnippetsStore] Failed to create:', (await response.json().catch(() => null))?.error);
            return writeFailure(response.status);
          }
          invalidateRegistry();
          await get().loadSnippets();
          return { ok: true };
        } catch (error) {
          console.error('[SnippetsStore] Failed to create:', error);
          return { ok: false, reason: 'failed' };
        }
      },

      updateSnippet: async (name, updates) => {
        try {
          const directory = getRequestDirectory();
          const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
          const response = await runtimeFetch(`/api/config/snippets/${encodeURIComponent(name)}${queryParams}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...(directory ? { 'x-opencode-directory': directory } : {}) },
            body: JSON.stringify(updates),
          });
          if (!response.ok) {
            console.error('[SnippetsStore] Failed to update:', (await response.json().catch(() => null))?.error);
            return writeFailure(response.status);
          }
          // A rename or a move gives the snippet another file. The list and
          // the selection follow it in one step, so the editor never looks
          // up a name the list no longer has.
          const payload: { snippet?: Snippet } = await response.json().catch(() => ({}));
          const saved = payload.snippet;
          if (saved) {
            set((state) => ({
              snippets: state.snippets.map((item) => (item.name === name ? saved : item)),
              selectedSnippetName: state.selectedSnippetName === name ? saved.name : state.selectedSnippetName,
            }));
          }
          invalidateRegistry();
          await get().loadSnippets();
          return { ok: true };
        } catch (error) {
          console.error('[SnippetsStore] Failed to update:', error);
          return { ok: false, reason: 'failed' };
        }
      },

      deleteSnippet: async (name) => {
        try {
          const directory = getRequestDirectory();
          const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
          const response = await runtimeFetch(`/api/config/snippets/${encodeURIComponent(name)}${queryParams}`, {
            method: 'DELETE',
            headers: directory ? { 'x-opencode-directory': directory } : undefined,
          });
          if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Failed to delete snippet');
          if (get().selectedSnippetName === name) set({ selectedSnippetName: null });
          invalidateRegistry();
          await get().loadSnippets();
          return true;
        } catch (error) {
          console.error('[SnippetsStore] Failed to delete:', error);
          return false;
        }
      },

      expandText: async (text) => {
        if (!/#[a-z0-9_-]+/i.test(text)) return text;
        const directory = getRequestDirectory();
        // "fix #42" names no snippet: skip the round trip when the current
        // directory's list is loaded and none of its triggers appears.
        if (isRegistryCurrent(directory) && !namesKnownSnippet(text, get().snippets)) return text;
        return (await requestExpansion(directory, { text })) ?? text;
      },

      previewSnippet: async (content) => (await requestExpansion(getRequestDirectory(), { content })) ?? '',

      getSnippetByName: (name) => get().snippets.find((snippet) => snippet.name === name || snippet.aliases.includes(name)),
>>>>>>> bc50ba56a
    }),
    deleteSnippet: async (id) => {
      const success = await mutate((catalog) => {
        const template = catalog.templates.find(item => item.templateId === id);
        if (!template?.editable) throw new Error('Prompt template is read-only');
        return canonicalClient.fileResources.deletePromptTemplate(catalog.workspaceId, { templateId: id, expectedRevision: catalog.revision });
      });
      if (success && get().selectedSnippetName === id) set({ selectedSnippetName: null });
      return success;
    },
    expandText: async (text, requestedDirectory) => {
      if (!text.startsWith('/')) return text;
      if (requestedDirectory === null) throw new Error('Workspace directory is unavailable');
      const owner = generation;
      const runtime = getRuntimeKey();
      const directory = requestedDirectory ?? useDirectoryStore.getState().currentDirectory ?? useProjectsStore.getState().getActiveProject()?.path ?? hostFilesystem.getDirectory();
      if (!directory?.trim()) throw new Error('Workspace directory is unavailable');
      const workspace = await canonicalClient.resolveWorkspace(directory.trim());
      if (owner !== generation || runtime !== getRuntimeKey()) throw new Error('Runtime changed during prompt expansion');
      const result = await canonicalClient.fileResources.expandPromptText(workspace.workspaceId, { text });
      if (owner !== generation || runtime !== getRuntimeKey()) throw new Error('Runtime changed during prompt expansion');
      return result.content;
    },
    getSnippetByName: (name) => get().snippets.find(template => template.name === name),
  };
}, { name: 'snippets-store' }));

subscribeRuntimeEndpointWillChange(() => useSnippetsStore.getState().resetForRuntimeSwitch());
