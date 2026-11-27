import type * as nodeCrypto from 'node:crypto';
import type * as nodeFsPromises from 'node:fs/promises';
import type * as nodePath from 'node:path';
import { createProjectIdFromPath, projectConfigFileStemOf } from '../projects/project-id.js';
import type { createProjectDirectoryRuntime } from '../projects/project-directory-runtime.js';
import { isBoolean, isString } from '../shared/object-guards.js';
import type { createManagedTunnelConfigRuntime } from '../tunnels/managed-config.js';
import {
  buildPreferencesFields,
  flattenPreferences,
  instancePartOf,
  isDeviceSettingsKey,
  isProfileSettingsKey,
  legacySettingsDocumentOf,
  normalizeSettingsSurface,
  parsePreferencesDocument,
  preferencesFilePathFor,
  profilePartOf,
  seedPreferencesFrom,
  serializePreferencesDocument,
} from './settings-files.js';
import type { PreferenceFields } from './settings-files.js';
import type { SettingsDocument, createSettingsHelpers } from './settings-helpers.js';
import type { ManagedRemoteTunnelPreset, NormalizedProject, createSettingsNormalizationRuntime } from './settings-normalization-runtime.js';
import { createSettingsWriteQueue } from './settings-write-queue.js';

type SettingsHelpers = ReturnType<typeof createSettingsHelpers>;
type SettingsNormalization = ReturnType<typeof createSettingsNormalizationRuntime>;
type ManagedTunnelConfig = ReturnType<typeof createManagedTunnelConfigRuntime>;
type ProjectDirectory = ReturnType<typeof createProjectDirectoryRuntime>;

export interface SettingsRuntimeDependencies {
  fsPromises: Pick<typeof nodeFsPromises, 'access' | 'chmod' | 'copyFile' | 'mkdir' | 'readFile' | 'readdir' | 'realpath' | 'rename' | 'rm' | 'stat' | 'writeFile'>;
  path: Pick<typeof nodePath, 'basename' | 'dirname' | 'isAbsolute' | 'join' | 'relative' | 'sep'>;
  crypto: Pick<typeof nodeCrypto, 'createHash'>;
  SETTINGS_FILE_PATH: string;
  sanitizeProjects: SettingsNormalization['sanitizeProjects'];
  sanitizeSettingsUpdate: SettingsHelpers['sanitizeSettingsUpdate'];
  mergePersistedSettings: SettingsHelpers['mergePersistedSettings'];
  normalizeSettingsPaths: SettingsNormalization['normalizeSettingsPaths'];
  normalizeStringArray: SettingsNormalization['normalizeStringArray'];
  formatSettingsResponse: SettingsHelpers['formatSettingsResponse'];
  resolveDirectoryCandidate: ProjectDirectory['resolveDirectoryCandidate'];
  managedChatsRoot?: string | null;
  normalizeManagedRemoteTunnelHostname: SettingsNormalization['normalizeManagedRemoteTunnelHostname'];
  normalizeManagedRemoteTunnelPresets: SettingsNormalization['normalizeManagedRemoteTunnelPresets'];
  normalizeManagedRemoteTunnelPresetTokens: SettingsNormalization['normalizeManagedRemoteTunnelPresetTokens'];
  syncManagedRemoteTunnelConfigWithPresets: ManagedTunnelConfig['syncManagedRemoteTunnelConfigWithPresets'];
  upsertManagedRemoteTunnelToken: ManagedTunnelConfig['upsertManagedRemoteTunnelToken'];
  onMessageSearchEnabledChanged?: (enabled: boolean) => void;
  onMessageSearchReasoningChanged?: (enabled: boolean) => void;
}

interface NotificationTemplateEntry {
  title: string;
  message: string;
}

type NotificationEventKey = 'completion' | 'error' | 'question' | 'subtask';

interface OrphanProjectFile {
  orphanId: string;
  filePath: string;
  content: SettingsDocument;
}

type PreferenceReadResult =
  | { status: 'missing' }
  | { status: 'failed' }
  | { status: 'ok'; fields: PreferenceFields };

const NOTIFICATION_EVENT_KEYS = ['completion', 'error', 'question', 'subtask'] as const;
const DEFAULT_NOTIFICATION_TEMPLATES = {
  completion: { title: '{agent_name} is ready', message: '{model_name} completed the task' },
  error: { title: 'Tool error', message: '{last_message}' },
  question: { title: 'Input needed', message: '{last_message}' },
  subtask: { title: '{agent_name} is ready', message: '{model_name} completed the task' },
} satisfies Record<NotificationEventKey, NotificationTemplateEntry>;

const isObjectLike = (value: unknown): value is SettingsDocument => Boolean(value && typeof value === 'object');
const hasErrorCode = (value: unknown): value is { code?: unknown } => Boolean(value && typeof value === 'object');
const isCallable = (value: unknown): value is (current: SettingsDocument) => SettingsDocument => typeof value === 'function';

const normalizeNotificationTemplates = (templates: SettingsDocument[string]) => {
  const input: SettingsDocument = isObjectLike(templates) ? templates : {};
  let changed = false;
  const next: Partial<Record<NotificationEventKey, NotificationTemplateEntry>> = {};

  for (const event of NOTIFICATION_EVENT_KEYS) {
    const currentEntry = isObjectLike(input[event]) ? input[event] : null;
    const base = DEFAULT_NOTIFICATION_TEMPLATES[event];
    const currentTitle = currentEntry && isString(currentEntry.title) ? currentEntry.title : base.title;
    const currentMessage = currentEntry && isString(currentEntry.message) ? currentEntry.message : base.message;
    if (!currentEntry || !isString(currentEntry.title) || !isString(currentEntry.message)) {
      changed = true;
    }
    next[event] = { title: currentTitle, message: currentMessage };
  }

  return { templates: next, changed };
};

export const createSettingsRuntime = (deps: SettingsRuntimeDependencies) => {
  const {
    fsPromises,
    path,
    crypto,
    SETTINGS_FILE_PATH,
    sanitizeProjects,
    sanitizeSettingsUpdate,
    mergePersistedSettings,
    normalizeSettingsPaths,
    normalizeStringArray,
    formatSettingsResponse,
    resolveDirectoryCandidate,
    managedChatsRoot,
    normalizeManagedRemoteTunnelHostname,
    normalizeManagedRemoteTunnelPresets,
    normalizeManagedRemoteTunnelPresetTokens,
    syncManagedRemoteTunnelConfigWithPresets,
    upsertManagedRemoteTunnelToken,
    onMessageSearchEnabledChanged = () => { },
    onMessageSearchReasoningChanged = () => { },
  } = deps;

  const PREFERENCES_FILE_PATH = preferencesFilePathFor(SETTINGS_FILE_PATH, path);
  let preferencesUnavailable = false;
  let preferencesFailureLogged = false;
  let orphanRecoveryDone = false;

  const PROJECTS_ROOT_DIR = path.join(path.dirname(SETTINGS_FILE_PATH), 'projects');
  const PROJECT_ICONS_DIR = path.join(path.dirname(SETTINGS_FILE_PATH), 'project-icons');

  const isManagedChatDirectory = async (candidate: string) => {
    if (!managedChatsRoot) return false;
    const root = await fsPromises.realpath(managedChatsRoot).catch((error) => {
      if (hasErrorCode(error) && error.code === 'ENOENT') return null;
      throw error;
    });
    if (!root) return false;
    const directory = await fsPromises.realpath(candidate);
    const relative = path.relative(root, directory);
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  };

  const sha1Hex = (value: string) => crypto.createHash('sha1').update(value).digest('hex');
  const projectIconBaseName = (projectId: string) => `project-${sha1Hex(projectId)}`;
  const PROJECT_ICON_EXTENSIONS = ['png', 'jpg', 'svg', 'webp', 'ico'];

  const readJsonFile = async (filePath: string): Promise<SettingsDocument | null> => {
    try {
      const raw = await fsPromises.readFile(filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      return isObjectLike(parsed) ? parsed : null;
    } catch (error) {
      if (hasErrorCode(error) && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  };

  const writeJsonFile = async (filePath: string, value: SettingsDocument) => {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  };

  const uniqueStrings = (values: SettingsDocument[string][]) =>
    Array.from(new Set(values.filter((value): value is string => isString(value) && value.trim().length > 0)));

  const mergeByKey = (oldItems: SettingsDocument[string], newItems: SettingsDocument[string], getKey: (item: SettingsDocument) => string | undefined): SettingsDocument[] => {
    const result: SettingsDocument[] = [];
    const seen = new Set<string>();
    const candidates = [
      ...(Array.isArray(newItems) ? newItems : []),
      ...(Array.isArray(oldItems) ? oldItems : []),
    ];
    for (const item of candidates) {
      if (!isObjectLike(item)) continue;
      const key = getKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result;
  };

  const remapPlanPaths = (entries: SettingsDocument[string], fromDir: string, toDir: string): SettingsDocument[string][] => {
    if (!Array.isArray(entries) || !fromDir || !toDir || fromDir === toDir) {
      return Array.isArray(entries) ? entries : [];
    }
    return entries.map((entry) => {
      if (!isObjectLike(entry) || !isString(entry.path)) {
        return entry;
      }
      const trimmedPath = entry.path.trim();
      const relativePath = path.relative(fromDir, trimmedPath);
      if (relativePath && (relativePath.startsWith('..') || path.isAbsolute(relativePath))) {
        return entry;
      }
      return {
        ...entry,
        path: relativePath ? path.join(toDir, relativePath) : toDir,
      };
    });
  };

  const mergeProjectConfigData = ({ oldConfig, newConfig, oldStorageDir, newStorageDir, projectPath }: {
    oldConfig: SettingsDocument | null;
    newConfig: SettingsDocument | null;
    oldStorageDir: string;
    newStorageDir: string;
    projectPath: string;
  }): SettingsDocument => {
    const oldValue: SettingsDocument = isObjectLike(oldConfig) ? oldConfig : {};
    const newValue: SettingsDocument = isObjectLike(newConfig) ? newConfig : {};
    const oldPlanFiles = remapPlanPaths(oldValue.projectPlanFiles, oldStorageDir, newStorageDir);
    const newPlanFiles = remapPlanPaths(newValue.projectPlanFiles, oldStorageDir, newStorageDir);
    const oldNotes = isString(oldValue.projectNotes) ? oldValue.projectNotes : '';
    const newNotes = isString(newValue.projectNotes) ? newValue.projectNotes : '';

    const merged: SettingsDocument = {
      ...oldValue,
      ...newValue,
    };
    if (isString(projectPath) && projectPath.trim().length > 0) {
      merged.projectPath = projectPath;
    }
    const setupWorktree = uniqueStrings([
      ...(Array.isArray(oldValue['setup-worktree']) ? oldValue['setup-worktree'] : []),
      ...(Array.isArray(newValue['setup-worktree']) ? newValue['setup-worktree'] : []),
    ]);
    if (setupWorktree.length > 0) {
      merged['setup-worktree'] = setupWorktree;
    }
    if (oldNotes || newNotes) {
      merged.projectNotes = newNotes || oldNotes;
    }
    const projectTodos = mergeByKey(oldValue.projectTodos, newValue.projectTodos, (item) => (isString(item.id) ? item.id : undefined));
    if (projectTodos.length > 0) {
      merged.projectTodos = projectTodos;
    }
    const projectActions = mergeByKey(oldValue.projectActions, newValue.projectActions, (item) => (isString(item.id) ? item.id : undefined));
    if (projectActions.length > 0) {
      merged.projectActions = projectActions;
    }
    const scheduledTasks = mergeByKey(oldValue.scheduledTasks, newValue.scheduledTasks, (item) => (isString(item.id) ? item.id : undefined));
    if (scheduledTasks.length > 0) {
      merged.scheduledTasks = scheduledTasks;
    }
    const planFiles = mergeByKey(
      oldPlanFiles,
      newPlanFiles,
      (item) => (isString(item.id) && item.id ? item.id : (isString(item.path) ? item.path : undefined)),
    );
    if (planFiles.length > 0) {
      merged.projectPlanFiles = planFiles;
    }
    if (isString(newValue.projectActionsPrimaryId) && newValue.projectActionsPrimaryId.trim().length > 0) {
      merged.projectActionsPrimaryId = newValue.projectActionsPrimaryId;
    } else if (isString(oldValue.projectActionsPrimaryId) && oldValue.projectActionsPrimaryId.trim().length > 0) {
      merged.projectActionsPrimaryId = oldValue.projectActionsPrimaryId;
    }
    return merged;
  };

  const moveDirectoryContents = async (fromDir: string, toDir: string) => {
    try {
      const entries = await fsPromises.readdir(fromDir, { withFileTypes: true });
      await fsPromises.mkdir(toDir, { recursive: true });

      for (const entry of entries) {
        const fromPath = path.join(fromDir, entry.name);
        const toPath = path.join(toDir, entry.name);
        if (entry.isDirectory()) {
          await moveDirectoryContents(fromPath, toPath);
          continue;
        }
        try {
          await fsPromises.access(toPath);
        } catch {
          await fsPromises.rename(fromPath, toPath);
        }
      }

      await fsPromises.rm(fromDir, { recursive: true, force: true });
    } catch (error) {
      if (!(hasErrorCode(error) && error.code === 'ENOENT')) {
        throw error;
      }
    }
  };

  const migrateProjectIconFiles = async ({ oldId, newId }: { oldId: string; newId: string }) => {
    if (!oldId || !newId || oldId === newId) {
      return;
    }

    const oldBase = projectIconBaseName(oldId);
    const newBase = projectIconBaseName(newId);

    await fsPromises.mkdir(PROJECT_ICONS_DIR, { recursive: true });

    for (const ext of PROJECT_ICON_EXTENSIONS) {
      const oldPath = path.join(PROJECT_ICONS_DIR, `${oldBase}.${ext}`);
      const newPath = path.join(PROJECT_ICONS_DIR, `${newBase}.${ext}`);
      try {
        await fsPromises.access(oldPath);
      } catch (error) {
        if (hasErrorCode(error) && error.code === 'ENOENT') {
          continue;
        }
        throw error;
      }

      try {
        await fsPromises.access(newPath);
      } catch {
        await fsPromises.rename(oldPath, newPath);
        continue;
      }

      await fsPromises.rm(oldPath, { force: true });
    }
  };

  const mergeProjectContextFiles = async (oldStorageDir: string, newStorageDir: string) => {
    const oldContextPath = path.join(oldStorageDir, 'context.json');
    const newContextPath = path.join(newStorageDir, 'context.json');

    const [oldContext, newContext] = await Promise.all([
      readJsonFile(oldContextPath).catch(() => null),
      readJsonFile(newContextPath).catch(() => null),
    ]);

    if (!oldContext || !newContext) {
      return;
    }

    const mergeNotes = () => {
      const oldIsList = Array.isArray(oldContext.notes);
      const newIsList = Array.isArray(newContext.notes);
      if (oldIsList && newIsList) {
        return mergeByKey(oldContext.notes, newContext.notes, (item) => (isString(item.id) ? item.id : undefined));
      }
      if (newIsList) return newContext.notes;
      if (oldIsList) return oldContext.notes;
      return newContext.notes || oldContext.notes || '';
    };

    await writeJsonFile(newContextPath, {
      ...oldContext,
      ...newContext,
      notes: mergeNotes(),
      todos: mergeByKey(oldContext.todos, newContext.todos, (item) => (isString(item.id) ? item.id : undefined)),
      plans: mergeByKey(
        oldContext.plans,
        newContext.plans,
        (item) => (isString(item.id) && item.id ? item.id : (isString(item.file) ? item.file : undefined)),
      ),
    });
    await fsPromises.rm(oldContextPath, { force: true });
  };

  const migrateProjectScopedStorage = async ({ oldId, newId, projectPath }: { oldId: string; newId: string; projectPath: string }) => {
    if (!oldId || !newId || oldId === newId) {
      return;
    }

    const oldConfigPath = path.join(PROJECTS_ROOT_DIR, `${projectConfigFileStemOf(oldId)}.json`);
    const newConfigPath = path.join(PROJECTS_ROOT_DIR, `${projectConfigFileStemOf(newId)}.json`);
    const oldStorageDir = path.join(PROJECTS_ROOT_DIR, projectConfigFileStemOf(oldId));
    const newStorageDir = path.join(PROJECTS_ROOT_DIR, projectConfigFileStemOf(newId));

    const [oldConfig, newConfig] = await Promise.all([
      readJsonFile(oldConfigPath),
      readJsonFile(newConfigPath),
    ]);

    if (oldConfig || newConfig) {
      const merged = mergeProjectConfigData({ oldConfig, newConfig, oldStorageDir, newStorageDir, projectPath });
      await writeJsonFile(newConfigPath, merged);
    }

    await mergeProjectContextFiles(oldStorageDir, newStorageDir);
    await moveDirectoryContents(oldStorageDir, newStorageDir);
    await fsPromises.rm(oldConfigPath, { force: true });
  };

  const migrateRawIdStorageFolder = async (projectId: string) => {
    const stem = projectConfigFileStemOf(projectId);
    if (stem === projectId) return;
    const rawStorageDir = path.join(PROJECTS_ROOT_DIR, projectId);
    try {
      await fsPromises.stat(rawStorageDir);
    } catch (error) {
      if (hasErrorCode(error) && (error.code === 'ENOENT' || error.code === 'ENAMETOOLONG')) return;
      throw error;
    }
    const boundedStorageDir = path.join(PROJECTS_ROOT_DIR, stem);
    await mergeProjectContextFiles(rawStorageDir, boundedStorageDir);
    await moveDirectoryContents(rawStorageDir, boundedStorageDir);
  };

  const recoverOrphanProjectFiles = async (canonicalProjects: NormalizedProject[]) => {
    let entries;
    try {
      entries = await fsPromises.readdir(PROJECTS_ROOT_DIR, { withFileTypes: true });
    } catch (error) {
      if (hasErrorCode(error) && error.code === 'ENOENT') return;
      throw error;
    }

    const canonicalIds = new Set(canonicalProjects.map((project) => project.id));
    const orphanFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name.replace(/\.json$/, ''))
      .filter((id) => id && !id.startsWith('path_') && !canonicalIds.has(id));

    if (orphanFiles.length === 0) return;

    console.warn(`[projects] Found ${orphanFiles.length} orphan project config(s) without projectPath.`);

    const orphans: OrphanProjectFile[] = [];
    for (const orphanId of orphanFiles) {
      const filePath = path.join(PROJECTS_ROOT_DIR, `${orphanId}.json`);
      const content = await readJsonFile(filePath);
      if (!content) continue;
      const hasContent = [
        isString(content.projectNotes) && content.projectNotes.trim().length > 0,
        Array.isArray(content.projectTodos) && content.projectTodos.length > 0,
        Array.isArray(content.projectActions) && content.projectActions.length > 0,
        Array.isArray(content['setup-worktree']) && content['setup-worktree'].length > 0,
        Array.isArray(content.projectPlanFiles) && content.projectPlanFiles.length > 0,
      ].some(Boolean);
      if (!hasContent) continue;
      orphans.push({ orphanId, filePath, content });
    }

    if (orphans.length === 0) return;

    const basenameOf = (projectPath: string) => {
      if (!isString(projectPath)) return '';
      const normalized = projectPath.replace(/\\/g, '/').replace(/\/+$/g, '');
      const idx = normalized.lastIndexOf('/');
      return (idx >= 0 ? normalized.slice(idx + 1) : normalized).toLowerCase();
    };

    const extractRootRelPaths = (orphan: OrphanProjectFile) => {
      const setupCommands = Array.isArray(orphan.content['setup-worktree']) ? orphan.content['setup-worktree'] : [];
      const actionCommands = Array.isArray(orphan.content.projectActions)
        ? orphan.content.projectActions.map((a) => (isObjectLike(a) && isString(a.command) ? a.command : ''))
        : [];
      const commands = [...setupCommands, ...actionCommands].filter((s): s is string => isString(s));
      const results = new Set<string>();
      const re = /\$(?:\{)?ROOT_(?:PROJECT|WORKTREE)_PATH\}?\/([A-Za-z0-9._/-]+)/g;
      for (const cmd of commands) {
        let match: RegExpExecArray | null;
        while ((match = re.exec(cmd)) !== null) {
          if (match[1]) results.add(match[1]);
        }
      }
      return Array.from(results);
    };

    const fileExistsInProject = async (projectPath: string, relPath: string) => {
      try {
        await fsPromises.access(path.join(projectPath, relPath));
        return true;
      } catch {
        return false;
      }
    };

    const orphanMatchesProject = async (orphan: OrphanProjectFile, project: NormalizedProject) => {
      if (!isString(project.path) || !project.path.trim()) return false;
      const rels = extractRootRelPaths(orphan);
      for (const rel of rels) {
        if (await fileExistsInProject(project.path, rel)) {
          return true;
        }
      }
      const name = basenameOf(project.path);
      if (!name) return false;
      const setupLines = Array.isArray(orphan.content['setup-worktree']) ? orphan.content['setup-worktree'] : [];
      const actionLines = Array.isArray(orphan.content.projectActions)
        ? orphan.content.projectActions.map((a) => (isObjectLike(a) ? `${isString(a.name) ? a.name : ''} ${isString(a.command) ? a.command : ''}` : ''))
        : [];
      const haystacks = [...setupLines, ...actionLines].join(' ').toLowerCase();
      return haystacks.includes(name);
    };

    const matches = new Map<string, OrphanProjectFile[]>();
    for (const orphan of orphans) {
      const matchedProjects: NormalizedProject[] = [];
      for (const project of canonicalProjects) {
        if (await orphanMatchesProject(orphan, project)) {
          matchedProjects.push(project);
        }
      }
      if (matchedProjects.length === 1) {
        const project = matchedProjects[0];
        if (project) {
          const list = matches.get(project.id) || [];
          list.push(orphan);
          matches.set(project.id, list);
        }
      }
    }

    const orphansConsumed = new Set<string>();
    for (const [projectId, orphansForProject] of matches.entries()) {
      const project = canonicalProjects.find((p) => p.id === projectId);
      if (!project) continue;
      const targetStem = projectConfigFileStemOf(project.id);
      const targetPath = path.join(PROJECTS_ROOT_DIR, `${targetStem}.json`);
      const targetStorageDir = path.join(PROJECTS_ROOT_DIR, targetStem);

      for (const orphan of orphansForProject) {
        const targetExisting = (await readJsonFile(targetPath)) || {};
        const orphanStorageDir = path.join(PROJECTS_ROOT_DIR, orphan.orphanId);
        const merged = mergeProjectConfigData({
          oldConfig: orphan.content,
          newConfig: targetExisting,
          oldStorageDir: orphanStorageDir,
          newStorageDir: targetStorageDir,
          projectPath: project.path,
        });
        await writeJsonFile(targetPath, merged);
        await moveDirectoryContents(orphanStorageDir, targetStorageDir);
        await fsPromises.rm(orphan.filePath, { force: true });
        orphansConsumed.add(orphan.orphanId);
        console.log(`[projects] Recovered orphan ${orphan.orphanId} -> ${project.id} (${project.path})`);
      }
    }

    const remaining = orphans.filter((orphan) => !orphansConsumed.has(orphan.orphanId));
    if (remaining.length > 0) {
      console.warn(`[projects] ${remaining.length} orphan project file(s) could not be auto-matched: ${remaining.map((o) => o.orphanId).join(', ')}`);
    }
  };

  const migrateSettingsToDeterministicProjectIds = async (current: SettingsDocument) => {
    const settings: SettingsDocument = isObjectLike(current) ? current : {};
    const projects = sanitizeProjects(settings.projects) || [];
    if (projects.length === 0) {
      return { settings, changed: false };
    }

    let changed = false;
    const projectIdMap = new Map<string, string>();
    const nextProjects: NormalizedProject[] = [];

    for (const project of projects) {
      const canonicalId = createProjectIdFromPath(project.path);
      const nextId = canonicalId || project.id;
      projectIdMap.set(project.id, nextId);
      if (nextId !== project.id) {
        changed = true;
        await migrateProjectScopedStorage({ oldId: project.id, newId: nextId, projectPath: project.path });
        await migrateProjectIconFiles({ oldId: project.id, newId: nextId });
      }
      await migrateRawIdStorageFolder(nextId);
      nextProjects.push({ ...project, id: nextId });
    }

    if (!orphanRecoveryDone) {
      orphanRecoveryDone = true;
      try {
        await recoverOrphanProjectFiles(nextProjects);
      } catch (error) {
        console.warn('[projects] Orphan recovery failed, continuing startup:', error);
      }
    }

    if (!changed) {
      return { settings, changed: false };
    }

    const currentActiveId = isString(settings.activeProjectId) ? settings.activeProjectId : '';
    const nextActiveProjectId = projectIdMap.get(currentActiveId) || currentActiveId || nextProjects[0]?.id;
    const nextSettings: SettingsDocument = {
      ...settings,
      projects: nextProjects,
    };
    if (nextActiveProjectId) {
      nextSettings.activeProjectId = nextActiveProjectId;
    }

    return {
      settings: nextSettings,
      changed: true,
    };
  };

  const readInstanceSettingsFromDisk = async (): Promise<SettingsDocument> => {
    try {
      const raw = await fsPromises.readFile(SETTINGS_FILE_PATH, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      if (isObjectLike(parsed)) {
        return parsed;
      }
      return {};
    } catch (error) {
      if (hasErrorCode(error) && error.code === 'ENOENT') {
        return {};
      }
      console.warn('Failed to read settings file:', error);
      return {};
    }
  };

  const readPreferenceFields = async (): Promise<PreferenceReadResult> => {
    let raw: string;
    try {
      raw = await fsPromises.readFile(PREFERENCES_FILE_PATH, 'utf8');
    } catch (error) {
      if (hasErrorCode(error) && error.code === 'ENOENT') {
        return { status: 'missing' };
      }
      if (!preferencesFailureLogged) {
        preferencesFailureLogged = true;
        console.warn('Failed to read preferences file:', error);
      }
      return { status: 'failed' };
    }
    const parsed = parsePreferencesDocument(raw);
    if (!parsed.ok) {
      if (!preferencesFailureLogged) {
        preferencesFailureLogged = true;
        console.warn(`Preferences file is unreadable (${parsed.reason}); profile writes are paused until it is fixed or removed.`);
      }
      return { status: 'failed' };
    }
    preferencesFailureLogged = false;
    return { status: 'ok', fields: parsed.fields };
  };

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const isTransientWindowsReplaceError = (error: unknown): error is { code: 'EPERM' | 'EACCES' | 'EBUSY' } => {
    if (process.platform !== 'win32' || !hasErrorCode(error)) {
      return false;
    }
    return error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'EBUSY';
  };

  const replaceFile = async (tmp: string, target: string) => {
    const maxAttempts = process.platform === 'win32' ? 6 : 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await fsPromises.rename(tmp, target);
        return;
      } catch (error) {
        if (!isTransientWindowsReplaceError(error)) {
          throw error;
        }
        if (attempt === maxAttempts) {
          break;
        }
        await sleep(25 * attempt);
      }
    }
    try {
      await fsPromises.copyFile(tmp, target);
    } finally {
      await fsPromises.rm(tmp, { force: true }).catch(() => { });
    }
  };

  const cleanupOrphanedSettingsTempFiles = async (directory: string) => {
    try {
      const entries = await fsPromises.readdir(directory, { withFileTypes: true });
      const cleanupTasks = entries
        .filter((entry) => entry.isFile() && (entry.name.startsWith('settings.json.tmp-') || entry.name.startsWith('preferences.json.tmp-')))
        .map((entry) => fsPromises.rm(path.join(directory, entry.name), { force: true }).catch(() => { }));
      await Promise.all(cleanupTasks);
    } catch {
      void 0;
    }
  };

  const writeJsonFileAtomic = async (filePath: string, text: string) => {
    const directory = path.dirname(filePath);
    const created = await fsPromises.mkdir(directory, { recursive: true, mode: 0o700 });
    if (created && process.platform !== 'win32') await fsPromises.chmod(directory, 0o700);
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      await fsPromises.writeFile(tmp, text, { encoding: 'utf8', mode: 0o600 });
      if (process.platform !== 'win32') await fsPromises.chmod(tmp, 0o600);
      await replaceFile(tmp, filePath);
      if (process.platform !== 'win32') await fsPromises.chmod(filePath, 0o600);
    } catch (error) {
      await fsPromises.rm(tmp, { force: true }).catch(() => { });
      console.warn(`Failed to write ${path.basename(filePath)}:`, error);
      throw error;
    }
  };

  const writePreferencesToDisk = async (fields: PreferenceFields) => {
    await writeJsonFileAtomic(PREFERENCES_FILE_PATH, serializePreferencesDocument(fields));
  };

  const readSettingsFromDisk = async ({ surface = null }: { surface?: SettingsDocument[string] } = {}): Promise<SettingsDocument> => {
    const instance = await readInstanceSettingsFromDisk();
    const preferences = await readPreferenceFields();
    if (preferences.status === 'failed') {
      preferencesUnavailable = true;
      return instance;
    }
    preferencesUnavailable = false;
    if (preferences.status === 'missing') {
      const seeded = seedPreferencesFrom(instance, Date.now());
      try {
        await writePreferencesToDisk(seeded);
      } catch (error) {
        console.warn('Failed to seed preferences file:', error);
      }
      return instance;
    }
    return { ...instance, ...flattenPreferences(preferences.fields, normalizeSettingsSurface(surface)) };
  };

  const readSettingsFromDiskStrict = async (): Promise<SettingsDocument> => {
    let raw: string;
    try {
      raw = await fsPromises.readFile(SETTINGS_FILE_PATH, 'utf8');
    } catch (error) {
      if (hasErrorCode(error) && error.code === 'ENOENT') {
        return {};
      }
      throw error;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isObjectLike(parsed)) {
      throw new Error('Settings file is malformed (non-object payload)');
    }
    return parsed;
  };

  const writeSettingsToDisk = async (
    settings: SettingsDocument,
    { surface = null, changedKeys = null }: { surface?: SettingsDocument[string]; changedKeys?: Iterable<string> | null } = {},
  ) => {
    const current = preferencesUnavailable ? { status: 'failed' as const } : await readPreferenceFields();
    if (current.status === 'failed') {
      preferencesUnavailable = true;
      const onDisk = await readInstanceSettingsFromDisk();
      await writeJsonFileAtomic(SETTINGS_FILE_PATH, JSON.stringify({
        ...instancePartOf(settings),
        ...profilePartOf(onDisk),
      }, null, 2));
      return;
    }
    const previousFields = current.status === 'ok' ? current.fields : {};
    const nextFields = buildPreferencesFields(previousFields, settings, Date.now(), {
      surface: normalizeSettingsSurface(surface),
      changedKeys,
    });
    await writeJsonFileAtomic(SETTINGS_FILE_PATH, JSON.stringify(legacySettingsDocumentOf(settings, nextFields), null, 2));
    await writePreferencesToDisk(nextFields);
  };

  const validateProjectEntries = async (projects: SettingsDocument[string][]): Promise<SettingsDocument[string][]> => {
    if (!Array.isArray(projects)) {
      return [];
    }

    const validations = projects.map(async (project) => {
      if (!isObjectLike(project) || !isString(project.path) || project.path.length === 0) {
        console.warn('[validateProjectEntries] Dropping project entry with missing or empty path');
        return null;
      }
      try {
        const stats = await fsPromises.stat(project.path);
        if (!stats.isDirectory()) {
          console.warn(`[validateProjectEntries] Dropping project — path is not a directory: ${project.path}`);
          return null;
        }
        return project;
      } catch (error) {
        if (hasErrorCode(error) && error.code === 'ENOENT') {
          console.warn(`[validateProjectEntries] Dropping project — directory no longer exists: ${project.path}`);
          return null;
        }
        return project;
      }
    });

    return (await Promise.all(validations)).filter((p) => p !== null);
  };

  const migrateSettingsFromLegacyLastDirectory = async (current: SettingsDocument) => {
    const settings: SettingsDocument = isObjectLike(current) ? current : {};
    const now = Date.now();

    const sanitizedProjects = sanitizeProjects(settings.projects) || [];
    let nextProjects = sanitizedProjects;
    let nextActiveProjectId = isString(settings.activeProjectId) ? settings.activeProjectId : undefined;
    let changed = false;

    if (nextProjects.length === 0) {
      const legacy = isString(settings.lastDirectory) ? settings.lastDirectory.trim() : '';
      const candidate = legacy ? resolveDirectoryCandidate(legacy) : null;

      if (candidate) {
        try {
          const stats = await fsPromises.stat(candidate);
          if (stats.isDirectory() && !await isManagedChatDirectory(candidate)) {
            const id = createProjectIdFromPath(candidate);
            nextProjects = [
              {
                id,
                path: candidate,
                addedAt: now,
                lastOpenedAt: now,
              },
            ];
            nextActiveProjectId = id;
            changed = true;
          }
        } catch {
          void 0;
        }
      }
    }

    if (nextProjects.length > 0) {
      const active = nextProjects.find((project) => project.id === nextActiveProjectId) || null;
      if (!active) {
        nextActiveProjectId = nextProjects[0]?.id;
        changed = true;
      }
    } else if (nextActiveProjectId) {
      nextActiveProjectId = undefined;
      changed = true;
    }

    if (!changed) {
      return { settings, changed: false };
    }

    const nextSettings: SettingsDocument = {
      ...settings,
      projects: nextProjects,
      activeProjectId: nextActiveProjectId ?? undefined,
    };
    const merged = mergePersistedSettings(settings, nextSettings);

    return { settings: merged, changed: true };
  };

  const migrateSettingsFromLegacyThemePreferences = async (current: SettingsDocument) => {
    const settings: SettingsDocument = isObjectLike(current) ? current : {};

    const themeId = isString(settings.themeId) ? settings.themeId.trim() : '';
    const themeVariant = isString(settings.themeVariant) ? settings.themeVariant.trim() : '';

    const hasLight = isString(settings.lightThemeId) && settings.lightThemeId.trim().length > 0;
    const hasDark = isString(settings.darkThemeId) && settings.darkThemeId.trim().length > 0;

    if (hasLight && hasDark) {
      return { settings, changed: false };
    }

    const defaultLight = 'openchamber-light';
    const defaultDark = 'openchamber-dark';

    let nextLightThemeId = hasLight && isString(settings.lightThemeId) ? settings.lightThemeId : undefined;
    let nextDarkThemeId = hasDark && isString(settings.darkThemeId) ? settings.darkThemeId : undefined;

    if (!hasLight) {
      nextLightThemeId = themeId && themeVariant === 'light' ? themeId : defaultLight;
    }

    if (!hasDark) {
      nextDarkThemeId = themeId && themeVariant === 'dark' ? themeId : defaultDark;
    }

    const patch: SettingsDocument = { ...settings };
    if (nextLightThemeId) patch.lightThemeId = nextLightThemeId;
    if (nextDarkThemeId) patch.darkThemeId = nextDarkThemeId;
    const merged = mergePersistedSettings(settings, patch);

    return { settings: merged, changed: true };
  };

  const migrateSettingsFromLegacyCollapsedProjects = async (current: SettingsDocument) => {
    const settings: SettingsDocument = isObjectLike(current) ? current : {};
    const collapsed = Array.isArray(settings.collapsedProjects)
      ? normalizeStringArray(settings.collapsedProjects)
      : [];

    if (collapsed.length === 0 || !Array.isArray(settings.projects)) {
      if (collapsed.length === 0) {
        return { settings, changed: false };
      }
      const next = { ...settings };
      delete next.collapsedProjects;
      return { settings: next, changed: true };
    }

    const set = new Set(collapsed);
    const projects = sanitizeProjects(settings.projects) || [];
    let changed = false;

    const nextProjects = projects.map((project) => {
      const shouldCollapse = set.has(project.id);
      if (project.sidebarCollapsed !== shouldCollapse) {
        changed = true;
        return { ...project, sidebarCollapsed: shouldCollapse };
      }
      return project;
    });

    if (!changed) {
      if (Object.prototype.hasOwnProperty.call(settings, 'collapsedProjects')) {
        const next = { ...settings };
        delete next.collapsedProjects;
        return { settings: next, changed: true };
      }
      return { settings, changed: false };
    }

    const next: SettingsDocument = { ...settings, projects: nextProjects };
    delete next.collapsedProjects;
    return { settings: next, changed: true };
  };

  const migrateSettingsNotificationDefaults = async (current: SettingsDocument) => {
    const settings: SettingsDocument = isObjectLike(current) ? current : {};
    let changed = false;
    const next: SettingsDocument = { ...settings };

    if (!isBoolean(settings.notifyOnSubtasks)) {
      next.notifyOnSubtasks = true;
      changed = true;
    }
    if (!isBoolean(settings.notifyOnCompletion)) {
      next.notifyOnCompletion = true;
      changed = true;
    }
    if (!isBoolean(settings.notifyOnError)) {
      next.notifyOnError = true;
      changed = true;
    }
    if (!isBoolean(settings.notifyOnQuestion)) {
      next.notifyOnQuestion = true;
      changed = true;
    }

    const { templates, changed: templatesChanged } = normalizeNotificationTemplates(settings.notificationTemplates);
    if (templatesChanged || !isObjectLike(settings.notificationTemplates)) {
      next.notificationTemplates = templates;
      changed = true;
    }

    return { settings: changed ? next : settings, changed };
  };

  const migrateSettingsFromLegacyNamedTunnelKeys = async (current: SettingsDocument) => {
    const settings: SettingsDocument = isObjectLike(current) ? current : {};
    const next: SettingsDocument = { ...settings };
    let changed = false;

    if (!Object.prototype.hasOwnProperty.call(next, 'managedRemoteTunnelHostname')
      && Object.prototype.hasOwnProperty.call(next, 'namedTunnelHostname')) {
      next.managedRemoteTunnelHostname = normalizeManagedRemoteTunnelHostname(next.namedTunnelHostname);
      changed = true;
    }

    if (!Object.prototype.hasOwnProperty.call(next, 'managedRemoteTunnelToken')
      && Object.prototype.hasOwnProperty.call(next, 'namedTunnelToken')) {
      if (next.namedTunnelToken === null) {
        next.managedRemoteTunnelToken = null;
      } else if (isString(next.namedTunnelToken)) {
        next.managedRemoteTunnelToken = next.namedTunnelToken.trim();
      }
      changed = true;
    }

    if (!Object.prototype.hasOwnProperty.call(next, 'managedRemoteTunnelPresets')
      && Object.prototype.hasOwnProperty.call(next, 'namedTunnelPresets')) {
      next.managedRemoteTunnelPresets = normalizeManagedRemoteTunnelPresets(next.namedTunnelPresets);
      changed = true;
    }

    if (!Object.prototype.hasOwnProperty.call(next, 'managedRemoteTunnelPresetTokens')
      && Object.prototype.hasOwnProperty.call(next, 'namedTunnelPresetTokens')) {
      next.managedRemoteTunnelPresetTokens = normalizeManagedRemoteTunnelPresetTokens(next.namedTunnelPresetTokens);
      changed = true;
    }

    const legacyKeys = [
      'namedTunnelHostname',
      'namedTunnelToken',
      'namedTunnelPresets',
      'namedTunnelPresetTokens',
      'namedTunnelSelectedPresetId',
    ];
    for (const key of legacyKeys) {
      if (Object.prototype.hasOwnProperty.call(next, key)) {
        delete next[key];
        changed = true;
      }
    }

    return { settings: changed ? next : settings, changed };
  };

  const migrateSettingsRemoveApprovedDirectories = (current: SettingsDocument) => {
    const settings: SettingsDocument = isObjectLike(current) ? current : {};
    if (!Object.prototype.hasOwnProperty.call(settings, 'approvedDirectories')) {
      return { settings, changed: false };
    }
    const next = { ...settings };
    delete next.approvedDirectories;
    return { settings: next, changed: true };
  };

  let hasCleanedOrphanedTempFiles = false;

  const readSettingsFromDiskMigrated = async ({ surface = null }: { surface?: SettingsDocument[string] } = {}): Promise<SettingsDocument> => {
    if (!hasCleanedOrphanedTempFiles) {
      hasCleanedOrphanedTempFiles = true;
      await cleanupOrphanedSettingsTempFiles(path.dirname(SETTINGS_FILE_PATH));
    }
    const current = await readSettingsFromDisk();
    const migration1 = await migrateSettingsFromLegacyLastDirectory(current);
    const migration2 = await migrateSettingsFromLegacyThemePreferences(migration1.settings);
    const migration3 = await migrateSettingsFromLegacyCollapsedProjects(migration2.settings);
    const migration4 = await migrateSettingsNotificationDefaults(migration3.settings);
    const migration5 = await migrateSettingsFromLegacyNamedTunnelKeys(migration4.settings);
    const migration6 = normalizeSettingsPaths(migration5.settings);
    const migration7 = await migrateSettingsToDeterministicProjectIds(migration6.settings);
    const migration8 = migrateSettingsRemoveApprovedDirectories(migration7.settings);
    if (migration1.changed || migration2.changed || migration3.changed || migration4.changed || migration5.changed || migration6.changed || migration7.changed || migration8.changed) {
      await writeSettingsToDisk(migration8.settings);
    }
    return normalizeSettingsSurface(surface) ? readSettingsFromDisk({ surface }) : migration8.settings;
  };

  const { enqueue, updateSettingsFromDisk } = createSettingsWriteQueue(readSettingsFromDiskMigrated, writeSettingsToDisk);

  const persistResolvedSettings = async (
    resolveChanges: SettingsDocument | ((current: SettingsDocument) => SettingsDocument),
    { surface = null, preserveProjectIcons = false }: { surface?: SettingsDocument[string]; preserveProjectIcons?: boolean } = {},
  ) => {
    return enqueue(async () => {
      const current = await readSettingsFromDisk({ surface });
      const changes = isCallable(resolveChanges) ? resolveChanges(current) : resolveChanges;
      console.log('[persistSettings] Updating fields:', Object.keys(changes || {}).join(', ') || '(none)');
      const sanitized = sanitizeSettingsUpdate(changes);
      if (preserveProjectIcons && Array.isArray(sanitized.projects)) {
        const iconsByPath = new Map(sanitizeProjects(current.projects)?.map((project) => [project.path, project.iconImage]));
        sanitized.projects = sanitized.projects.map(({ iconImage: _clientIcon, ...project }) => {
          const iconImage = iconsByPath.get(project.path);
          return iconImage === undefined ? project : { ...project, iconImage };
        });
      }
      for (const key of Object.keys(sanitized)) {
        if (isDeviceSettingsKey(key)) {
          Reflect.deleteProperty(sanitized, key);
        } else if (preferencesUnavailable && isProfileSettingsKey(key)) {
          console.warn(`[persistSettings] Dropping ${key}: preferences file is unreadable`);
          Reflect.deleteProperty(sanitized, key);
        }
      }
      let next = mergePersistedSettings(current, sanitized);

      const normalizedState = normalizeSettingsPaths(next);
      if (normalizedState.changed) {
        next = normalizedState.settings;
      }

      const deterministicProjectIdMigration = await migrateSettingsToDeterministicProjectIds(next);
      if (deterministicProjectIdMigration.changed) {
        next = deterministicProjectIdMigration.settings;
      }

      const approvedDirectoriesMigration = migrateSettingsRemoveApprovedDirectories(next);
      if (approvedDirectoriesMigration.changed) {
        next = approvedDirectoriesMigration.settings;
      }

      if (Object.prototype.hasOwnProperty.call(sanitized, 'projects') && Array.isArray(next.projects)) {
        const validated = await validateProjectEntries(next.projects);
        next = { ...next, projects: validated };
      }

      if (Array.isArray(next.projects) && next.projects.length > 0) {
        const activeId = isString(next.activeProjectId) ? next.activeProjectId : '';
        const active = next.projects.find((project) => project.id === activeId) || null;
        const firstProject = isObjectLike(next.projects[0]) ? next.projects[0] : null;
        const firstProjectId = firstProject && isString(firstProject.id) ? firstProject.id : undefined;
        if (!active && firstProjectId) {
          console.log(`[persistSettings] Active project ID ${activeId} not found, switching to ${firstProjectId}`);
          next = { ...next, activeProjectId: firstProjectId };
        }
      } else if (next.activeProjectId) {
        console.log(`[persistSettings] No projects found, clearing activeProjectId ${next.activeProjectId}`);
        next = { ...next, activeProjectId: undefined };
      }

      if (Object.prototype.hasOwnProperty.call(sanitized, 'managedRemoteTunnelPresets')) {
        await syncManagedRemoteTunnelConfigWithPresets(next.managedRemoteTunnelPresets);
      }

      if (Object.prototype.hasOwnProperty.call(sanitized, 'managedRemoteTunnelPresetTokens') && sanitized.managedRemoteTunnelPresetTokens) {
        const currentPresets = Array.isArray(next.managedRemoteTunnelPresets) ? next.managedRemoteTunnelPresets : [];
        const presetsById = new Map(
          currentPresets
            .filter((entry): entry is ManagedRemoteTunnelPreset => isObjectLike(entry) && isString(entry.id) && isString(entry.name) && isString(entry.hostname))
            .map((entry) => [entry.id, entry]),
        );
        const updates: Array<{ id: string; name: string; hostname: string; token: string }> = [];
        for (const [presetId, token] of Object.entries(sanitized.managedRemoteTunnelPresetTokens)) {
          const preset = presetsById.get(presetId);
          if (!preset || !isString(token) || token.trim().length === 0) {
            continue;
          }
          updates.push({
            id: preset.id,
            name: preset.name,
            hostname: preset.hostname,
            token: token.trim(),
          });
        }

        for (const update of updates) {
          await upsertManagedRemoteTunnelToken(update);
        }
      }

      const changedKeys = Object.keys(sanitized);
      await writeSettingsToDisk(next, { surface, changedKeys });
      if (changedKeys.includes('messageSearchEnabled')) {
        onMessageSearchEnabledChanged(next.messageSearchEnabled === true);
      }
      if (changedKeys.includes('messageSearchReasoningEnabled')) {
        onMessageSearchReasoningChanged(next.messageSearchReasoningEnabled === true);
      }
      return formatSettingsResponse(next);
    });
  };

  const persistSettings = (
    changes: SettingsDocument,
    options?: { surface?: SettingsDocument[string]; preserveProjectIcons?: boolean },
  ) => persistResolvedSettings(() => changes, options);

  return {
    readSettingsFromDisk,
    readSettingsFromDiskStrict,
    readSettingsFromDiskMigrated,
    writeSettingsToDisk,
    persistSettings,
    persistResolvedSettings,
    updateSettingsFromDisk,
  };
};
