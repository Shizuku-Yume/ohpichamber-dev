
import { create } from 'zustand';
import type { StoreApi, UseBoundStore } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { FileResourceSkillEntry, SkillFileCatalogState, SkillFilesState, SkillInstallResult } from '@openchamber/agent-contract';
import { SkillInstallResultSchema } from '@openchamber/agent-contract';
import { canonicalClient, CanonicalApiError } from '@/api/canonicalClient';
import { emitConfigChange, scopeMatches, subscribeToConfigChanges } from '@/lib/configSync';
import { createDeferredSafeJSONStorage } from './utils/safeStorage';
import { useProjectsStore } from './useProjectsStore';

export type DiscoveredSkill = FileResourceSkillEntry;
export interface AuthoredSkillReference { scope: 'workspace' | 'agent'; authoredSkillId: string }
type SkillReference = string | AuthoredSkillReference;
interface SupportingFile { path: string }
export interface PendingFile { path: string; content: string }
interface SkillConfig {
  name: string;
  scope: 'workspace' | 'agent';
  content: string;
  supportingFiles?: PendingFile[];
}
interface SkillDraft {
  name: string;
  scope: 'workspace' | 'agent';
  content: string;
  pendingFiles?: PendingFile[];
}
interface SkillDetail { content: string; supportingFiles: SupportingFile[] }
interface SkillsStore {
  selectedSkillName: string | null;
  selectedAuthoredSkill: AuthoredSkillReference | null;
  setSelectedAuthoredSkill: (skill: AuthoredSkillReference | null) => void;
  skills: DiscoveredSkill[];
  skillsByDirectory: { [directory: string]: DiscoveredSkill[] };
  filesByDirectory: { [directory: string]: SkillFileCatalogState };
  detailsByDirectory: { [directory: string]: { [skillId: string]: SkillFilesState } };
  isLoading: boolean;
  skillDraft: SkillDraft | null;
  lastMutationResult: SkillInstallResult | null;
  lastMutationDirectory: string | null;
  setSelectedSkill: (skillId: string | null) => void;
  setSkillDraft: (draft: SkillDraft | null) => void;
  loadSkills: (directory?: string | null) => Promise<boolean>;
  getSkillDetail: (skillId: SkillReference, directory?: string | null) => Promise<SkillDetail | null>;
  createSkill: (config: SkillConfig, directory?: string | null) => Promise<boolean>;
  updateSkill: (skillId: SkillReference, content: string, directory?: string | null) => Promise<boolean>;
  renameSkill: (skillId: SkillReference, name: string, directory?: string | null) => Promise<boolean>;
  deleteSkill: (skillId: SkillReference, directory?: string | null) => Promise<boolean>;
  getSkillByName: (skillId: string, directory?: string | null) => DiscoveredSkill | undefined;
  resetForRuntimeSwitch: () => void;
  readSupportingFile: (skillId: SkillReference, path: string, directory?: string | null) => Promise<string | null>;
  writeSupportingFile: (skillId: SkillReference, path: string, content: string, directory?: string | null) => Promise<boolean>;
  deleteSupportingFile: (skillId: SkillReference, path: string, directory?: string | null) => Promise<boolean>;
}

const resolveDirectory = (directory?: string | null): string | null => directory === undefined
  ? useProjectsStore.getState().getActiveProject()?.path?.trim() || null
  : directory?.trim() || null;
const keyFor = (directory: string | null) => directory ?? '__default__';
const emptySkills: DiscoveredSkill[] = [];
let generation = 0;
let mutationRevision = 0;
const loadedAt = new Map<string, number>();
const inFlight = new Map<string, Promise<boolean>>();
const revisions = new Map<string, number>();
const eventSource = 'useSkillsStore';
export const invalidateSkillsLoadCache = (directory: string | null = resolveDirectory()) => { loadedAt.delete(keyFor(directory)); };
export const selectAvailableSkillsForDirectory = (state: Pick<SkillsStore, 'skillsByDirectory'>, directory?: string | null): DiscoveredSkill[] => state.skillsByDirectory[keyFor(resolveDirectory(directory))] ?? emptySkills;
const detailKey = (reference: SkillReference): string => typeof reference === 'string' ? reference : JSON.stringify([reference.scope, reference.authoredSkillId]);

export const useSkillsStore = create<SkillsStore>()(devtools(persist((set, get) => {
  const requireDirectory = (requested?: string | null) => {
    const directory = resolveDirectory(requested);
    if (!directory) throw new Error('Workspace directory is unavailable');
    return directory;
  };
  const writable = (reference: SkillReference, directory: string) => {
    const catalog = get().filesByDirectory[directory];
    const native = typeof reference === 'string' ? get().getSkillByName(reference, directory) : null;
    if (typeof reference === 'string' && (!native || native.readOnly || !native.authoredSkillId || native.scope === 'inherited')) throw new Error('Skill is read-only');
    const authored = typeof reference === 'string'
      ? catalog?.skills.find(skill => skill.skillId === native?.authoredSkillId && skill.scope === native?.scope)
      : catalog?.skills.find(skill => skill.skillId === reference.authoredSkillId && skill.scope === reference.scope);
    if (!authored) throw new Error('Authored skill is unavailable');
    const detail = get().detailsByDirectory[directory]?.[detailKey(reference)];
    const expectedSourceRevision = detail?.sourceRevision ?? catalog?.sources[authored.scope];
    if (expectedSourceRevision === undefined) throw new Error('Skill source revision is unavailable');
    return { skillId: authored.skillId, scope: authored.scope, expectedSourceRevision };
  };
  const mutate = async (directory: string, operation: (workspaceId: string) => Promise<SkillInstallResult>): Promise<boolean> => {
    const owner = generation;
    set({ lastMutationResult: null, lastMutationDirectory: directory });
    try {
      const workspace = await canonicalClient.resolveWorkspace(directory);
      if (owner !== generation) return false;
      const result = await operation(workspace.workspaceId).catch(error => {
        if (error instanceof CanonicalApiError && error.problem.code === 'SKILL_APPLY_FAILED') {
          const committed = SkillInstallResultSchema.safeParse(error.problem.details?.result);
          if (committed.success) return committed.data;
        }
        throw error;
      });
      if (owner !== generation) return false;
      set({ lastMutationResult: result });
      revisions.set(directory, ++mutationRevision);
      loadedAt.delete(directory);
      const scope = result.scope.kind;
      if (scope === 'workspace' || scope === 'agent') {
        set(state => {
          const catalog = state.filesByDirectory[directory];
          const details = state.detailsByDirectory[directory];
          return {
            filesByDirectory: catalog ? { ...state.filesByDirectory, [directory]: { ...catalog, sources: { ...catalog.sources, [scope]: result.sourceRevision } } } : state.filesByDirectory,
            detailsByDirectory: details ? { ...state.detailsByDirectory, [directory]: Object.fromEntries(Object.entries(details).map(([id, detail]) => [id, detail.scope === scope ? { ...detail, sourceRevision: result.sourceRevision } : detail])) } : state.detailsByDirectory,
          };
        });
      }
      // A committed source is not proof that every live worker applied it.
      emitConfigChange('skills', { source: eventSource });
      const pendingLoad = inFlight.get(directory);
      if (pendingLoad) await pendingLoad;
      loadedAt.delete(directory);
      await get().loadSkills(directory);
      return result.apply === null || result.apply.status === 'applied' || result.apply.status === 'no-active-workers';
    } catch (error) {
      console.error('Skill source mutation failed:', error);
      if (owner === generation) {
        revisions.set(directory, ++mutationRevision);
        const pendingLoad = inFlight.get(directory);
        if (pendingLoad) await pendingLoad;
        loadedAt.delete(directory);
        await get().loadSkills(directory);
      }
      return false;
    }
  };
  return {
    selectedSkillName: null, selectedAuthoredSkill: null, skills: [], skillsByDirectory: {}, filesByDirectory: {}, detailsByDirectory: {}, isLoading: false, skillDraft: null, lastMutationResult: null, lastMutationDirectory: null,
    setSelectedSkill: selectedSkillName => set({ selectedSkillName, selectedAuthoredSkill: null }),
    setSelectedAuthoredSkill: selectedAuthoredSkill => set({ selectedAuthoredSkill, selectedSkillName: null, skillDraft: null }),
    setSkillDraft: skillDraft => set({ skillDraft }),
    resetForRuntimeSwitch: () => {
      generation++; loadedAt.clear(); inFlight.clear(); revisions.clear();
      set({ selectedSkillName: null, selectedAuthoredSkill: null, skillDraft: null, skills: [], skillsByDirectory: {}, filesByDirectory: {}, detailsByDirectory: {}, isLoading: false, lastMutationResult: null, lastMutationDirectory: null });
    },
    loadSkills: async requested => {
      const directory = resolveDirectory(requested);
      if (!directory) return false;
      if (Date.now() - (loadedAt.get(directory) ?? 0) < 5000) return true;
      const existing = inFlight.get(directory);
      if (existing) return existing;
      const owner = generation;
      const revision = revisions.get(directory) ?? 0;
      const request = (async () => {
        set({ isLoading: true });
        try {
          const workspace = await canonicalClient.resolveWorkspace(directory);
          if (owner !== generation) return false;
          const [catalog, files] = await Promise.allSettled([
            canonicalClient.fileResources.getSkills(workspace.workspaceId),
            canonicalClient.fileResources.getSkillFileCatalog(workspace.workspaceId),
          ]);
          if (owner !== generation || revision !== (revisions.get(directory) ?? 0)) return false;
          set(state => ({
            ...(catalog.status === 'fulfilled' ? { skillsByDirectory: { ...state.skillsByDirectory, [directory]: catalog.value.skills } } : {}),
            ...(files.status === 'fulfilled' ? { filesByDirectory: { ...state.filesByDirectory, [directory]: files.value } } : {}),
            ...(catalog.status === 'fulfilled' && directory === resolveDirectory() ? { skills: catalog.value.skills } : {}),
          }));
          if (catalog.status === 'rejected' || files.status === 'rejected') return false;
          loadedAt.set(directory, Date.now());
          return true;
        } catch (error) {
          console.error('Failed to load skills:', error);
          return false;
        } finally {
          if (owner === generation) set({ isLoading: false });
        }
      })();
      inFlight.set(directory, request);
      try { return await request; } finally { if (inFlight.get(directory) === request) inFlight.delete(directory); }
    },
    getSkillByName: (skillId, directory) => selectAvailableSkillsForDirectory(get(), directory).find(skill => skill.skillId === skillId),
    getSkillDetail: async (skillId, requested) => {
      const owner = generation;
      try {
        const directory = requireDirectory(requested);
        const revision = revisions.get(directory) ?? 0;
        if (typeof skillId === 'string') {
          const skill = get().getSkillByName(skillId, directory);
          if (!skill) return null;
          if (skill.readOnly || !skill.authoredSkillId || skill.scope === 'inherited') return { content: skill.content, supportingFiles: [] };
        }
        const target = writable(skillId, directory);
        const workspace = await canonicalClient.resolveWorkspace(directory);
        if (owner !== generation) return null;
        const detail = await canonicalClient.fileResources.getSkillFiles(workspace.workspaceId, target.skillId, target.scope);
        if (owner !== generation || revision !== (revisions.get(directory) ?? 0)) return null;
        set(state => ({ detailsByDirectory: { ...state.detailsByDirectory, [directory]: { ...state.detailsByDirectory[directory], [detailKey(skillId)]: detail } } }));
        return { content: detail.files.find(file => file.filePath === 'SKILL.md')?.content ?? '', supportingFiles: detail.files.filter(file => file.filePath !== 'SKILL.md').map(file => ({ path: file.filePath })) };
      } catch { return null; }
    },
    createSkill: async (config, requested) => {
      try {
        const directory = requireDirectory(requested);
        const owner = generation;
        const revision = get().filesByDirectory[directory]?.sources[config.scope];
        if (revision === undefined) return false;
        const success = await mutate(directory, async workspaceId => {
          let result = await canonicalClient.fileResources.writeSkillFile(workspaceId, config.name, 'SKILL.md', { scope: config.scope, expectedSourceRevision: revision, content: config.content });
          for (const file of config.supportingFiles ?? []) {
            if (owner !== generation) throw new Error('Runtime changed before supporting-file write');
            result = await canonicalClient.fileResources.writeSkillFile(workspaceId, config.name, file.path, { scope: config.scope, expectedSourceRevision: result.sourceRevision, content: file.content });
          }
          return result;
        });
        if (success) {
          const created = selectAvailableSkillsForDirectory(get(), directory).find(skill => skill.authoredSkillId === config.name && skill.scope === config.scope);
          set({ selectedSkillName: created?.skillId ?? null, selectedAuthoredSkill: created ? null : { scope: config.scope, authoredSkillId: config.name }, skillDraft: null });
        }
        return success;
      } catch { return false; }
    },
    updateSkill: async (skillId, content, requested) => {
      try {
        const directory = requireDirectory(requested);
        const target = writable(skillId, directory);
        const success = await mutate(directory, workspaceId => canonicalClient.fileResources.writeSkillFile(workspaceId, target.skillId, 'SKILL.md', { scope: target.scope, expectedSourceRevision: target.expectedSourceRevision, content }));
        if (typeof skillId === 'string' && get().selectedSkillName === skillId && !get().getSkillByName(skillId, directory)) {
          set({ selectedSkillName: null, selectedAuthoredSkill: { scope: target.scope, authoredSkillId: target.skillId } });
        }
        return success;
      } catch { return false; }
    },
    renameSkill: async (skillId, name, requested) => {
      try {
        const directory = requireDirectory(requested);
        const target = writable(skillId, directory);
        const success = await mutate(directory, workspaceId => canonicalClient.fileResources.renameSkill(workspaceId, target.skillId, { scope: target.scope, expectedSourceRevision: target.expectedSourceRevision, name }));
        if (success) {
          const native = selectAvailableSkillsForDirectory(get(), directory).find(skill => skill.authoredSkillId === name && skill.scope === target.scope);
          set({ selectedSkillName: native?.skillId ?? null, selectedAuthoredSkill: native ? null : { scope: target.scope, authoredSkillId: name } });
        }
        return success;
      } catch { return false; }
    },
    deleteSkill: async (skillId, requested) => {
      try {
        const directory = requireDirectory(requested);
        const target = writable(skillId, directory);
        const success = await mutate(directory, workspaceId => canonicalClient.fileResources.deleteSkill(workspaceId, target.skillId, { scope: target.scope, expectedSourceRevision: target.expectedSourceRevision }));
        if (success) set({ selectedSkillName: null, selectedAuthoredSkill: null });
        return success;
      } catch { return false; }
    },
    readSupportingFile: async (skillId, path, requested) => {
      try {
        const directory = requireDirectory(requested);
        const detail = get().detailsByDirectory[directory]?.[detailKey(skillId)];
        return detail?.files.find(file => file.filePath === path)?.content ?? null;
      } catch { return null; }
    },
    writeSupportingFile: async (skillId, path, content, requested) => {
      try {
        const directory = requireDirectory(requested);
        const target = writable(skillId, directory);
        return await mutate(directory, workspaceId => canonicalClient.fileResources.writeSkillFile(workspaceId, target.skillId, path, { scope: target.scope, expectedSourceRevision: target.expectedSourceRevision, content }));
      } catch { return false; }
    },
    deleteSupportingFile: async (skillId, path, requested) => {
      try {
        const directory = requireDirectory(requested);
        const target = writable(skillId, directory);
        return await mutate(directory, workspaceId => canonicalClient.fileResources.deleteSkillFile(workspaceId, target.skillId, path, { scope: target.scope, expectedSourceRevision: target.expectedSourceRevision }));
      } catch { return false; }
    },
  };
}, { name: 'skills-store', storage: createDeferredSafeJSONStorage(), partialize: state => ({ selectedSkillName: state.selectedSkillName }) }), { name: 'skills-store' }));
declare global { interface Window { __zustand_skills_store__?: UseBoundStore<StoreApi<SkillsStore>> } }
if (typeof window !== 'undefined') window.__zustand_skills_store__ = useSkillsStore;
subscribeToConfigChanges(event => {
  if (event.source !== eventSource && scopeMatches(event, 'skills')) {
    invalidateSkillsLoadCache();
    void useSkillsStore.getState().loadSkills();
  }
});

