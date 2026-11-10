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
<<<<<<< HEAD
  skillsByDirectory: { [directory: string]: DiscoveredSkill[] };
  filesByDirectory: { [directory: string]: SkillFileCatalogState };
  detailsByDirectory: { [directory: string]: { [skillId: string]: SkillFilesState } };
=======
  /** Every directory loaded so far, including the ambient one. Holds switched-off skills too. */
  skillsByDirectory: Record<string, DiscoveredSkill[]>;
  /**
   * The `skill.use` and `mcp.use` statements OpenCode applies per directory, which
   * decide the skills agents can use (`skillSwitch.ts`). A failed read keeps
   * the last ones known; a directory never read has no entry.
   */
  policiesByDirectory: Record<string, IntegrationPolicy[]>;
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
  const mutate = async (directory: string, operation: (workspaceId: string) => Promise<SkillInstallResult>): Promise<boolean> => {
    const owner = generation;
    set({ lastMutationResult: null, lastMutationDirectory: directory });
=======
  if (get().selectedSkillName === name) {
    nextState.selectedSkillName = null;
  }
  set(nextState);
};

const EMPTY_SKILLS: DiscoveredSkill[] = [];

/**
 * Skills of one project. Returns a stored array so components can select it
 * directly; an omitted directory means the project the app is on.
 */
export const selectSkillsForDirectory = (
  state: Pick<SkillsStore, 'skillsByDirectory'>,
  directory?: string | null,
): DiscoveredSkill[] => {
  const cacheKey = getSkillsCacheKey(resolveDirectory(directory));
  return state.skillsByDirectory[cacheKey] ?? EMPTY_SKILLS;
};

/**
 * Whether one project's skills have been read; until then its empty list is
 * not an answer. A failed read settles it to the skills known before.
 */
export const selectSkillsLoadedForDirectory = (
  state: Pick<SkillsStore, 'skillsByDirectory'>,
  directory?: string | null,
): boolean => Object.hasOwn(state.skillsByDirectory, getSkillsCacheKey(resolveDirectory(directory)));

/**
 * The policy statements of one project, or null while none could be read; an
 * omitted directory means the project the app is on.
 */
export const selectSkillPoliciesForDirectory = (
  state: Pick<SkillsStore, 'policiesByDirectory'>,
  directory?: string | null,
): IntegrationPolicy[] | null => {
  const cacheKey = getSkillsCacheKey(resolveDirectory(directory));
  return state.policiesByDirectory[cacheKey] ?? null;
};

const availableSkillsCache = new WeakMap<DiscoveredSkill[], { policies: IntegrationPolicy[] | null; available: DiscoveredSkill[] }>();

/**
 * The skills of one project agents can use: everything the chat offers or
 * attaches reads this, while Settings lists every installed skill. The result
 * is kept per input, so a selector returns the same array until either changes.
 */
export const selectAvailableSkillsForDirectory = (
  state: Pick<SkillsStore, 'skillsByDirectory' | 'policiesByDirectory'>,
  directory?: string | null,
): DiscoveredSkill[] => {
  const skills = selectSkillsForDirectory(state, directory);
  const policies = selectSkillPoliciesForDirectory(state, directory);
  const cached = availableSkillsCache.get(skills);
  if (cached?.policies === policies) return cached.available;
  const available = filterAvailableSkills(skills, policies);
  availableSkillsCache.set(skills, { policies, available });
  return available;
};

/** The skill of that name when its own exact deny switches it off, else null. */
const switchedOffSkillNamed = (
  state: Pick<SkillsStore, 'skillsByDirectory' | 'policiesByDirectory'>,
  name: string,
  directory: string | null,
): DiscoveredSkill | null => {
  const skill = selectSkillsForDirectory(state, directory).find((entry) => entry.name === name);
  if (!skill) return null;
  return isSwitchedOffByOwnDeny(state.policiesByDirectory[getSkillsCacheKey(directory)] ?? null, skill.id) ? skill : null;
};

/**
 * Drops the row a load kept for a switched-off id (`keepSwitchedOffSkills`)
 * once its rule is gone, so a renamed or deleted skill leaves no row behind.
 */
const dropSkillRow = (
  set: (updater: (state: SkillsStore) => Partial<SkillsStore>) => void,
  directory: string | null,
  id: string,
) => {
  const cacheKey = getSkillsCacheKey(directory);
  set((state) => {
    const skills = state.skillsByDirectory[cacheKey] ?? EMPTY_SKILLS;
    const kept = skills.filter((skill) => skill.id !== id);
    if (kept.length === skills.length) return {};
    const next: Partial<SkillsStore> = { skillsByDirectory: { ...state.skillsByDirectory, [cacheKey]: kept } };
    if (cacheKey === getSkillsCacheKey(getRequestDirectory())) next.skills = kept;
    return next;
  });
};

/** Writes one skill's switch through the server; answers the config files it changed. */
const writeSkillSwitch = async (
  skill: Pick<DiscoveredSkill, 'id' | 'scope'>,
  enabled: boolean,
  directory: string | null,
): Promise<string[]> => {
  const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
  const response = await runtimeFetch(`/api/config/skill-switch${queryParams}`, {
    method: 'PUT',
    // A plain object, so runtimeFetch can URI-encode a non-Latin-1 directory; Headers.set would throw.
    headers: directory
      ? { 'Content-Type': 'application/json', 'x-opencode-directory': directory }
      : { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: skill.id, enabled, scope: skill.scope }),
  });
  const payload: { changed?: string[]; error?: string } | null = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || 'Failed to switch skill');
  }
  return payload?.changed ?? [];
};

/**
 * Reads OpenCode's statements again after a switch write until they show it,
 * then commits them. The last read is committed either way: OpenCode's view is
 * the authority, and a rule elsewhere may keep the skill as it was.
 */
const recheckSkillPolicies = async (
  set: (updater: (state: SkillsStore) => Partial<SkillsStore>) => void,
  directory: string | null,
  id: string,
  enabled: boolean,
) => {
  const cacheKey = getSkillsCacheKey(directory);
  const write = skillSwitchWrites.get(cacheKey);
  const generation = skillsGeneration;
  const isCurrent = () => generation === skillsGeneration && skillSwitchWrites.get(cacheKey) === write;
  for (const [attempt, delay] of SKILL_SWITCH_RECHECK_MS.entries()) {
    await sleep(delay);
    if (!isCurrent()) return;
    let policies: IntegrationPolicy[];
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
  };
  return {
    selectedSkillName: null, selectedAuthoredSkill: null, skills: [], skillsByDirectory: {}, filesByDirectory: {}, detailsByDirectory: {}, isLoading: false, skillDraft: null, lastMutationResult: null, lastMutationDirectory: null,
    setSelectedSkill: selectedSkillName => set({ selectedSkillName, selectedAuthoredSkill: null }),
    setSelectedAuthoredSkill: selectedAuthoredSkill => set({ selectedAuthoredSkill, selectedSkillName: null, skillDraft: null }),
    setSkillDraft: skillDraft => set({ skillDraft }),
    resetForRuntimeSwitch: () => {
      generation++; loadedAt.clear(); inFlight.clear(); revisions.clear();
      set({ selectedSkillName: null, selectedAuthoredSkill: null, skillDraft: null, skills: [], skillsByDirectory: {}, filesByDirectory: {}, detailsByDirectory: {}, isLoading: false, lastMutationResult: null, lastMutationDirectory: null });
=======
    if (!isCurrent()) return;
    const hasDeny = policies.some((policy) => policy.resource === `skill:${id}` && policy.effect === 'deny');
    if (hasDeny === enabled && attempt < SKILL_SWITCH_RECHECK_MS.length - 1) continue;
    set((state) => ({ policiesByDirectory: { ...state.policiesByDirectory, [cacheKey]: policies } }));
    emitConfigChange("skills", { source: CONFIG_EVENT_SOURCE });
    return;
  }
};

export const useSkillsStore = create<SkillsStore>()(
  devtools(
    persist(
      (set, get) => ({
        selectedSkillName: null,
        skills: [],
        skillsByDirectory: {},
        policiesByDirectory: {},
        isLoading: false,
        skillDraft: null,

        resetForRuntimeSwitch: () => {
          skillsGeneration += 1;
          skillsLastLoadedAt.clear();
          skillsLoadInFlight.clear();
          set({ skills: [], skillsByDirectory: {}, policiesByDirectory: {}, isLoading: false });
        },

        setSelectedSkill: (name: string | null) => {
          set({ selectedSkillName: name });
        },

        setSkillDraft: (draft: SkillDraft | null) => {
          set({ skillDraft: draft });
        },

        loadSkills: async (requestedDirectory?: string | null) => {
          const directory = resolveDirectory(requestedDirectory);
          const cacheKey = getSkillsCacheKey(directory);
          const isAmbient = cacheKey === getSkillsCacheKey(getRequestDirectory());
          const now = Date.now();
          const loadedAt = skillsLastLoadedAt.get(cacheKey) ?? 0;
          const hasCachedSkills = (get().skillsByDirectory[cacheKey] ?? (isAmbient ? get().skills : [])).length > 0;

          if (hasCachedSkills && now - loadedAt < SKILLS_LOAD_CACHE_TTL_MS) {
            return true;
          }

          const inFlight = skillsLoadInFlight.get(cacheKey);
          if (inFlight) {
            return inFlight;
          }

          const generation = skillsGeneration;
          const request = (async () => {
            set({ isLoading: true });
            // Failure must never look like an empty project. The mirror is the
            // fallback so a directory loaded before this map existed still counts.
            const previousSkills = get().skillsByDirectory[cacheKey] ?? (isAmbient ? get().skills : []);
            let lastError: unknown = null;

            // The statements that decide which skills agents get, read beside
            // the list. A failed read keeps the last ones known: it must not
            // turn every skill back on.
            const switchWrite = skillSwitchWrites.get(cacheKey);
            const policiesRequest = (async () => {
              try {
                return await opencodeClient.getIntegrationPolicies(directory);
              } catch (error) {
                console.warn('[SkillsStore] could not read OpenCode skill policies:', error instanceof Error ? error.message : String(error));
                return null;
              }
            })();

            for (let attempt = 0; attempt < 3; attempt++) {
              if (generation !== skillsGeneration) return false;
              try {
                const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';

                const response = await runBackgroundNetworkTask(() => runtimeFetch(`/api/config/skills${queryParams}`, {
                  priority: 'low',
                  headers: directory ? { 'x-opencode-directory': directory } : undefined,
                }));
                if (response === undefined) return false;
                if (!response.ok) {
                  throw new Error(`Failed to list skills: ${response.status}`);
                }

                const data = await response.json();
                const rawSkills: RawSkillResponse[] = data.skills || [];
                const configSkills: DiscoveredSkill[] = rawSkills.map((s) => ({
                  id: s.id ?? skillIdFromPath(s.path, s.name),
                  name: s.name,
                  path: s.path,
                  scope: s.scope ?? 'user',
                  source: s.source ?? 'opencode',
                  description: s.sources?.md?.description || '',
                  group: parseSkillGroup(s.path),
                  renamable: s.renamable === true,
                }));

                // OpenCode loads a narrower set than this scan finds, and the
                // rules live in server-side env flags the browser cannot read.
                // The route reports them; `filterSkillsByRuntimeFlags` mirrors
                // OpenCode's discovery, including the `.agents`-wins dedup that
                // matters when `.claude/skills` are symlinks back into it.
                //
                // Deliberately not OpenCode's own skill endpoint: measured
                // against 1.18.14 it lists only global and builtin skills and
                // omits the project skills the agent actually has.
                const scannedSkills = filterSkillsByRuntimeFlags(
                  configSkills,
                  data.externalSkills ?? null,
                );
                // The server answers with only its disk scan when OpenCode's
                // own list could not be read. That is not a complete list:
                // keep what was known and retry on the next load.
                const isPartial = data.openCodeSkillsUnavailable === true;
                const visibleSkills = isPartial
                  ? mergePartialSkills(scannedSkills, previousSkills)
                  : scannedSkills;

                const policies = await policiesRequest;
                if (generation !== skillsGeneration) return false;
                set((state) => {
                  const freshPolicies = policies && skillSwitchWrites.get(cacheKey) === switchWrite ? policies : null;
                  const directorySkills = keepSwitchedOffSkills(
                    visibleSkills,
                    previousSkills,
                    freshPolicies ?? state.policiesByDirectory[cacheKey] ?? EMPTY_POLICIES,
                    switchedOffSkillFromId,
                  );
                  const next: Partial<SkillsStore> = {
                    skillsByDirectory: { ...state.skillsByDirectory, [cacheKey]: directorySkills },
                    isLoading: false,
                  };
                  if (freshPolicies) {
                    next.policiesByDirectory = { ...state.policiesByDirectory, [cacheKey]: freshPolicies };
                  }
                  if (isAmbient) next.skills = directorySkills;
                  return next;
                });
                // Unread statements are not a complete answer either.
                if (isPartial || !policies) {
                  skillsLastLoadedAt.delete(cacheKey);
                } else {
                  skillsLastLoadedAt.set(cacheKey, Date.now());
                }
                return true;
              } catch (error) {
                lastError = error;
                const waitMs = 200 * (attempt + 1);
                await new Promise((resolve) => setTimeout(resolve, waitMs));
              }
            }

            console.error("Failed to load skills:", lastError);
            if (generation !== skillsGeneration) return false;
            set((state) => {
              const next: Partial<SkillsStore> = {
                skillsByDirectory: { ...state.skillsByDirectory, [cacheKey]: previousSkills },
                isLoading: false,
              };
              if (isAmbient) next.skills = previousSkills;
              return next;
            });
            return false;
          })();

          skillsLoadInFlight.set(cacheKey, request);
          try {
            return await request;
          } finally {
            skillsLoadInFlight.delete(cacheKey);
          }
        },

        setSkillEnabled: async (skill: DiscoveredSkill, enabled: boolean, requestedDirectory?: string | null) => {
          const directory = resolveDirectory(requestedDirectory);
          const cacheKey = getSkillsCacheKey(directory);
          const generation = skillsGeneration;
          let changed: string[];
          try {
            changed = await writeSkillSwitch(skill, enabled, directory);
          } catch (error) {
            console.error('Failed to switch skill:', error);
            return false;
          }
          if (generation !== skillsGeneration) return false;
          // Nothing written while the outcome should change: the rule lives
          // where the server cannot edit it (a file it cannot parse, config
          // with no file), so the switch did nothing.
          const current = get().policiesByDirectory[cacheKey] ?? null;
          if (changed.length === 0 && current && getSkillSwitchState(current, skill.id).enabled !== enabled) {
            return false;
          }

          // OpenCode applies the files once its watcher sees them. Show the
          // write now in every directory that reads the changed files: a user
          // skill's rule is in the global config, which every project reads.
          // The recheck confirms it here; other directories read again on
          // their next load.
          const affected = skill.scope === 'project'
            ? [cacheKey]
            : Object.keys(get().policiesByDirectory).concat(cacheKey);
          for (const key of new Set(affected)) {
            skillSwitchWrites.set(key, (skillSwitchWrites.get(key) ?? 0) + 1);
            skillsLastLoadedAt.delete(key);
          }
          set((state) => {
            const policiesByDirectory = { ...state.policiesByDirectory };
            for (const key of new Set(affected)) {
              const policies = state.policiesByDirectory[key];
              if (policies || key === cacheKey) {
                policiesByDirectory[key] = applySkillSwitch(policies ?? EMPTY_POLICIES, skill.id, enabled, changed);
              }
            }
            return { policiesByDirectory };
          });
          void recheckSkillPolicies(set, directory, skill.id, enabled);
          return true;
        },

        getSkillDetail: async (name: string, requestedDirectory?: string | null) => {
          try {
            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
            
            const response = await runtimeFetch(`/api/config/skills/${encodeURIComponent(name)}${queryParams}`, {
              headers: directory ? { 'x-opencode-directory': directory } : undefined,
            });
            if (!response.ok) {
              return null;
            }
            
            return await response.json() as SkillDetail;
          } catch {
            return null;
          }
        },

        createSkill: async (config: SkillConfig, requestedDirectory?: string | null) => {
          try {
            const skillConfig: Record<string, unknown> = {
              name: config.name,
              description: config.description,
            };

            if (config.instructions) skillConfig.instructions = config.instructions;
            if (config.scope) skillConfig.scope = config.scope;
            if (config.source) skillConfig.source = config.source;
            if (config.supportingFiles) skillConfig.supportingFiles = config.supportingFiles;
            if (config.disableModelInvocation) skillConfig.disableModelInvocation = true;

            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';

            const response = await runtimeFetch(`/api/config/skills/${encodeURIComponent(config.name)}${queryParams}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(directory ? { 'x-opencode-directory': directory } : {}),
              },
              body: JSON.stringify(skillConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to create skill';
              throw new Error(message);
            }

            invalidateSkillsLoadCache(directory);

            if (payload?.requiresManualRestart) {
              upsertSkillLocal(set, get, config.name, config, directory);
              return true;
            }

            if (payload?.requiresReload) {
              startConfigUpdate("Creating skill...");
              await refreshSkillsAfterOpenCodeRestart({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadSkills(directory);
            if (loaded) {
              emitConfigChange("skills", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch {
            return false;
          }
        },

        updateSkill: async (name: string, config: Partial<SkillConfig>, requestedDirectory?: string | null) => {
          try {
            const skillConfig: Record<string, unknown> = {};

            if (config.description !== undefined) skillConfig.description = config.description;
            if (config.instructions !== undefined) skillConfig.instructions = config.instructions;
            if (config.supportingFiles !== undefined) skillConfig.supportingFiles = config.supportingFiles;
            if (config.targetPath !== undefined) skillConfig.targetPath = config.targetPath;
            if (config.disableModelInvocation !== undefined) skillConfig.disableModelInvocation = config.disableModelInvocation;

            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';

            const response = await runtimeFetch(`/api/config/skills/${encodeURIComponent(name)}${queryParams}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(directory ? { 'x-opencode-directory': directory } : {}),
              },
              body: JSON.stringify(skillConfig)
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to update skill';
              throw new Error(message);
            }

            invalidateSkillsLoadCache(directory);

            if (payload?.requiresManualRestart) {
              upsertSkillLocal(set, get, name, config, directory);
              return true;
            }

            if (payload?.requiresReload) {
              startConfigUpdate("Updating skill...");
              await refreshSkillsAfterOpenCodeRestart({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadSkills(directory);
            if (loaded) {
              emitConfigChange("skills", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch {
            return false;
          }
        },

        renameSkill: async (name: string, newName: string, requestedDirectory?: string | null) => {
          try {
            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
            const switchedOff = switchedOffSkillNamed(get(), name, directory);

            const response = await runtimeFetch(`/api/config/skills/${encodeURIComponent(name)}${queryParams}`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                ...(directory ? { 'x-opencode-directory': directory } : {}),
              },
              body: JSON.stringify({ renameTo: newName }),
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to rename skill';
              throw new Error(message);
            }

            const needsReload = payload?.requiresReload ?? false;
            invalidateSkillsLoadCache(directory);
            if (needsReload) {
              await refreshSkillsAfterOpenCodeRestart({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadSkills(directory);
            // The folder, and so the id, takes the new name. The rule follows
            // it, or the skill would come back on under its new id.
            if (switchedOff) {
              await get().setSkillEnabled({ ...switchedOff, id: newName, name: newName }, false, directory);
              await get().setSkillEnabled(switchedOff, true, directory);
              dropSkillRow(set, directory, switchedOff.id);
            }
            if (loaded) {
              emitConfigChange("skills", { source: CONFIG_EVENT_SOURCE });
            }
            return loaded;
          } catch {
            return false;
          }
        },

        deleteSkill: async (name: string, requestedDirectory?: string | null, location?: { scope: SkillScope; source: SkillSource }) => {
          try {
            const directory = resolveDirectory(requestedDirectory);
            const params = new URLSearchParams();
            if (directory) params.set('directory', directory);
            if (location) {
              params.set('scope', location.scope);
              params.set('source', location.source);
            }
            const query = params.toString();
            const queryParams = query ? `?${query}` : '';
            // Deleting every copy leaves the skill's own rule with nothing to
            // switch; deleting one copy keeps it for the copies left.
            const switchedOff = location ? null : switchedOffSkillNamed(get(), name, directory);

            const response = await runtimeFetch(`/api/config/skills/${encodeURIComponent(name)}${queryParams}`, {
              method: 'DELETE',
              headers: directory ? { 'x-opencode-directory': directory } : undefined,
            });

            const payload = await response.json().catch(() => null);
            if (!response.ok) {
              const message = payload?.error || 'Failed to delete skill';
              throw new Error(message);
            }

            invalidateSkillsLoadCache(directory);

            if (payload?.requiresManualRestart) {
              removeSkillLocal(set, get, name);
              return true;
            }

            if (payload?.requiresReload) {
              startConfigUpdate("Deleting skill...");
              await refreshSkillsAfterOpenCodeRestart({
                message: payload?.message,
                delayMs: payload?.reloadDelayMs,
              });
              return true;
            }

            const loaded = await get().loadSkills(directory);
            if (switchedOff) {
              await get().setSkillEnabled(switchedOff, true, directory);
              dropSkillRow(set, directory, switchedOff.id);
            }
            if (loaded) {
              emitConfigChange("skills", { source: CONFIG_EVENT_SOURCE });
            }

            if (get().selectedSkillName === name) {
              set({ selectedSkillName: null });
            }

            return loaded;
          } catch {
            return false;
          }
        },

        getSkillByName: (name: string, requestedDirectory?: string | null) => {
          return selectSkillsForDirectory(get(), requestedDirectory).find((skill) => skill.name === name);
        },

        readSupportingFile: async (skillName: string, filePath: string, requestedDirectory?: string | null) => {
          try {
            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `&directory=${encodeURIComponent(directory)}` : '';
            
            const response = await runtimeFetch(
              `/api/config/skills/${encodeURIComponent(skillName)}/files/${encodeURIComponent(filePath)}?${queryParams.slice(1)}`,
              { headers: directory ? { 'x-opencode-directory': directory } : undefined },
            );
            if (!response.ok) {
              return null;
            }
            
            const data = await response.json();
            return data.content ?? null;
          } catch {
            return null;
          }
        },

        writeSupportingFile: async (skillName: string, filePath: string, content: string, requestedDirectory?: string | null) => {
          try {
            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
            
            const response = await runtimeFetch(
              `/api/config/skills/${encodeURIComponent(skillName)}/files/${encodeURIComponent(filePath)}${queryParams}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  ...(directory ? { 'x-opencode-directory': directory } : {}),
                },
                body: JSON.stringify({ content })
              }
            );
            
            return response.ok;
          } catch {
            return false;
          }
        },

        deleteSupportingFile: async (skillName: string, filePath: string, requestedDirectory?: string | null) => {
          try {
            const directory = resolveDirectory(requestedDirectory);
            const queryParams = directory ? `?directory=${encodeURIComponent(directory)}` : '';
            
            const response = await runtimeFetch(
              `/api/config/skills/${encodeURIComponent(skillName)}/files/${encodeURIComponent(filePath)}${queryParams}`,
              {
                method: 'DELETE',
                headers: directory ? { 'x-opencode-directory': directory } : undefined,
              }
            );
            
            return response.ok;
          } catch {
            return false;
          }
        },
      }),
      {
        name: "skills-store",
        storage: createDeferredSafeJSONStorage(),
        partialize: (state) => ({
          selectedSkillName: state.selectedSkillName,
        }),
      },
    ),
    {
      name: "skills-store",
>>>>>>> bc50ba56a
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
