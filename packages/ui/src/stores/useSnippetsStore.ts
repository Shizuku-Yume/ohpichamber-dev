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

/** The quick "save as snippet" dialog: text from a message, a selection or the composer. */
export interface SnippetQuickCreate {
  name?: string;
  content: string;
  /** Runs once the snippet is saved, with the name it got. */
  onSaved?: (name: string) => void;
}
type SnippetInput = Omit<PromptTemplateCreateRequest, 'expectedRevision'>;
type SnippetDraft = Pick<SnippetInput, 'name' | 'scope'> & Partial<Omit<SnippetInput, 'name' | 'scope'>>;

interface SnippetsStore {
  snippets: Snippet[];
  catalog: PromptTemplateCatalogState | null;
  catalogsByDirectory: ReadonlyMap<string, PromptTemplateCatalogState>;
  directory: string | null;
  isLoading: boolean;
  selectedSnippetName: string | null;
  snippetDraft: SnippetDraft | null;
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
  getSnippetByName: (name: string) => Snippet | undefined;
  resetForRuntimeSwitch: () => void;
}

const resolveDirectory = (directory?: string | null): string => {
  if (directory === null) throw new Error('Workspace directory is unavailable');
  const resolved = directory ?? useUIStore.getState().settingsProjectPath
    ?? useDirectoryStore.getState().currentDirectory
    ?? useProjectsStore.getState().getActiveProject()?.path
    ?? hostFilesystem.getDirectory();
  if (!resolved?.trim()) throw new Error('Workspace directory is unavailable');
  return resolved.trim();
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
