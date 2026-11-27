import { modelRefKey } from '@openchamber/agent-contract';
import type * as nodeOs from 'node:os';
import type * as nodePath from 'node:path';
import { z } from 'zod';
import { isBoolean, isRecord, isString } from '../shared/object-guards.js';

const rawValueSchema = z.unknown();
export type RawValue = z.infer<typeof rawValueSchema>;
const rawDocumentSchema = z.looseObject({});
type RawDocument = z.infer<typeof rawDocumentSchema>;

const isObjectLike = (value: unknown): value is RawDocument => Boolean(value && typeof value === 'object');
const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export interface SettingsNormalizationDependencies {
  os: Pick<typeof nodeOs, 'homedir'>;
  path: Pick<typeof nodePath, 'delimiter' | 'join' | 'resolve'>;
  processLike: Pick<NodeJS.Process, 'platform'>;
  realpathSync?: (path: string) => string;
  readdirSync?: (path: string) => string[];
  tunnelBootstrapTtlDefaultMs: number;
  tunnelBootstrapTtlMinMs: number;
  tunnelBootstrapTtlMaxMs: number;
  tunnelSessionTtlDefaultMs: number;
  tunnelSessionTtlMinMs: number;
  tunnelSessionTtlMaxMs: number;
}

export interface NormalizedProjectIconImage {
  mime: string;
  updatedAt: number;
  source: 'custom' | 'auto';
}

export interface NormalizedProject {
  id: string;
  path: string;
  label?: string;
  labelSource?: 'manual' | 'auto';
  icon?: string;
  iconImage?: NormalizedProjectIconImage | null;
  iconBackground?: string | null;
  color?: string;
  defaultModel?: string;
  defaultVariant?: string;
  addedAt?: number;
  lastOpenedAt?: number;
  sidebarCollapsed?: boolean;
}

export interface ManagedRemoteTunnelPreset {
  id: string;
  name: string;
  hostname: string;
}

export interface TypographySizesPartial {
  markdown?: string;
  code?: string;
  uiHeader?: string;
  uiLabel?: string;
  meta?: string;
  micro?: string;
}

export interface NormalizedModelRef {
  providerID: string;
  modelID: string;
}

export interface NormalizedSkillCatalog {
  id: string;
  label: string;
  source: string;
  subpath?: string;
  gitIdentityId?: string;
}

export const createSettingsNormalizationRuntime = (dependencies: SettingsNormalizationDependencies) => {
  const {
    os,
    path,
    processLike,
    realpathSync,
    readdirSync,
    tunnelBootstrapTtlDefaultMs,
    tunnelBootstrapTtlMinMs,
    tunnelBootstrapTtlMaxMs,
    tunnelSessionTtlDefaultMs,
    tunnelSessionTtlMinMs,
    tunnelSessionTtlMaxMs,
  } = dependencies;

  function normalizeDirectoryPath(value: string): string;
  function normalizeDirectoryPath<Value>(value: Value): Value extends string ? string : Value;
  function normalizeDirectoryPath<Value>(value: Value): string | Value {
    if (!isString(value)) {
      return value;
    }

    let trimmed = value.trim();
    if (trimmed.length >= 2
      && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
        || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    if (!trimmed) {
      return trimmed;
    }

    if (trimmed === '~') {
      return os.homedir();
    }

    if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
      return path.join(os.homedir(), trimmed.slice(2));
    }

    return trimmed;
  }

  const CASE_INSENSITIVE_PLATFORMS = new Set<NodeJS.Platform>(['win32', 'darwin']);

  const rootLengthOf = (value: string) => {
    const drive = /^[a-zA-Z]:[\\/]/.exec(value);
    if (drive) return 3;
    return value.startsWith('/') ? 1 : 0;
  };

  const canonicalizePathCase = (value: string, listings?: Map<string, string[] | null>): string => {
    if (!readdirSync || !value) return value;
    if (!CASE_INSENSITIVE_PLATFORMS.has(processLike?.platform)) return value;

    let result = value;
    try {
      const rootLength = rootLengthOf(value);
      if (rootLength === 0) return value;
      const root = value.slice(0, rootLength);
      const separator = processLike.platform === 'win32' ? /[\\/]+/ : /\/+/;
      const segments = value.slice(rootLength).split(separator).filter(Boolean);
      let current = root;
      for (const segment of segments) {
        let entries = listings?.get(current);
        if (entries === undefined) {
          try {
            entries = readdirSync(current);
          } catch {
            entries = null;
          }
          listings?.set(current, entries);
        }
        if (!entries) return value;
        let next: string | undefined = segment;
        if (!entries.includes(segment)) {
          next = entries.find((entry) => entry.toLowerCase() === segment.toLowerCase());
          if (!next) return value;
        }
        current = path.join(current, next);
      }
      result = current;
    } catch {
      return value;
    }
    return result;
  };

  function safeRealpathSync(value: string, listings?: Map<string, string[] | null>): string;
  function safeRealpathSync<Value>(value: Value, listings?: Map<string, string[] | null>): Value extends string ? string : Value;
  function safeRealpathSync<Value>(value: Value, listings?: Map<string, string[] | null>): string | Value {
    if (!isString(value) || !value) {
      return value;
    }
    if (!realpathSync) {
      return canonicalizePathCase(value, listings);
    }
    let resolved: string;
    try {
      resolved = realpathSync(value);
    } catch {
      return value;
    }
    return canonicalizePathCase(resolved, listings);
  }

  function normalizePathForPersistence(value: string, options?: { resolveRealpath?: boolean }): string;
  function normalizePathForPersistence<Value>(value: Value, options?: { resolveRealpath?: boolean }): Value extends string ? string : Value;
  function normalizePathForPersistence<Value>(value: Value, options: { resolveRealpath?: boolean } = {}): string | Value {
    if (!isString(value)) {
      return value;
    }

    const normalized = normalizeDirectoryPath(value);
    if (!isString(normalized)) {
      return normalized;
    }

    const trimmed = normalized.trim();
    if (!trimmed) {
      return trimmed;
    }

    const uppercaseDriveLetter = (p: string) =>
      p.replace(/^([a-z]):/, (_, letter: string) => letter.toUpperCase() + ':');

    const isWindows = processLike.platform === 'win32';
    const caseNormalized = isWindows ? uppercaseDriveLetter(trimmed) : trimmed;
    const resolved = options.resolveRealpath === false ? caseNormalized : safeRealpathSync(caseNormalized);

    const finalResolved = isWindows && isString(resolved)
      ? uppercaseDriveLetter(resolved)
      : resolved;

    if (!isWindows) {
      return finalResolved;
    }

    return finalResolved.replace(/\//g, '\\');
  }

  const areStringArraysEqual = (a: string[], b: RawValue) => {
    if (!Array.isArray(b)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  };

  const normalizeStringArray = (input: RawValue): string[] => {
    if (!Array.isArray(input)) {
      return [];
    }
    return Array.from(
      new Set(
        input.filter((entry): entry is string => isString(entry) && entry.length > 0),
      ),
    );
  };

  const sanitizeProjects = (input: RawValue): NormalizedProject[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const hexColorPattern = /^#(?:[\da-fA-F]{3}|[\da-fA-F]{6})$/;
    const normalizeIconBackground = (value: RawValue): string | null => {
      if (!isString(value)) {
        return null;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      return hexColorPattern.test(trimmed) ? trimmed.toLowerCase() : null;
    };

    const result: NormalizedProject[] = [];
    const seenIds = new Set<string>();
    const seenPaths = new Set<string>();
    const listings = new Map<string, string[] | null>();

    for (const entry of input) {
      if (!isObjectLike(entry)) continue;

      const candidate = entry;
      const id = isString(candidate.id) ? candidate.id.trim() : '';
      const rawPath = isString(candidate.path) ? candidate.path.trim() : '';
      const resolvedPath = rawPath ? safeRealpathSync(path.resolve(normalizeDirectoryPath(rawPath)), listings) : '';
      const normalizedPath = resolvedPath ? normalizePathForPersistence(resolvedPath, { resolveRealpath: false }) : '';
      const label = isString(candidate.label) ? candidate.label.trim() : '';
      const labelSource = candidate.labelSource === 'manual' || candidate.labelSource === 'auto'
        ? candidate.labelSource
        : '';
      const icon = isString(candidate.icon) ? candidate.icon.trim() : '';
      const iconImage = isObjectLike(candidate.iconImage) ? candidate.iconImage : null;
      const iconBackground = normalizeIconBackground(candidate.iconBackground);
      const color = isString(candidate.color) ? candidate.color.trim() : '';
      const defaultModel = isString(candidate.defaultModel) ? candidate.defaultModel.trim() : '';
      const defaultVariant = isString(candidate.defaultVariant) ? candidate.defaultVariant.trim() : '';
      const addedAt = isFiniteNumber(candidate.addedAt) ? candidate.addedAt : null;
      const lastOpenedAt = isFiniteNumber(candidate.lastOpenedAt) ? candidate.lastOpenedAt : null;

      if (!id || !normalizedPath) continue;
      if (seenIds.has(id)) continue;
      if (seenPaths.has(normalizedPath)) continue;

      seenIds.add(id);
      seenPaths.add(normalizedPath);

      const project: NormalizedProject = { id, path: normalizedPath };
      if (label) project.label = label;
      if (icon) project.icon = icon;
      if (iconBackground) project.iconBackground = iconBackground;
      if (color) project.color = color;
      if (defaultModel && defaultModel.includes('/')) {
        project.defaultModel = defaultModel;
        if (defaultVariant) project.defaultVariant = defaultVariant;
      }
      if (addedAt !== null && addedAt >= 0) project.addedAt = addedAt;
      if (lastOpenedAt !== null && lastOpenedAt >= 0) project.lastOpenedAt = lastOpenedAt;
      if (label && labelSource) project.labelSource = labelSource;

      if (candidate.iconImage === null) {
        project.iconImage = null;
      } else if (iconImage) {
        const mime = isString(iconImage.mime) ? iconImage.mime.trim() : '';
        const updatedAt = isFiniteNumber(iconImage.updatedAt)
          ? Math.max(0, Math.round(iconImage.updatedAt))
          : 0;
        const source = iconImage.source === 'custom' || iconImage.source === 'auto'
          ? iconImage.source
          : null;
        if (mime && updatedAt > 0 && source) {
          project.iconImage = { mime, updatedAt, source };
        }
      }

      if (candidate.iconBackground === null) {
        project.iconBackground = null;
      }

      if (isBoolean(candidate.sidebarCollapsed)) {
        project.sidebarCollapsed = candidate.sidebarCollapsed;
      }

      result.push(project);
    }

    return result;
  };

  const normalizeSettingsPaths = (input: RawValue) => {
    const settings: RawDocument = isObjectLike(input) ? input : {};
    let next: RawDocument = settings;
    let changed = false;

    const ensureNext = () => {
      if (next === settings) {
        next = { ...settings };
      }
    };

    const normalizePathField = (key: 'lastDirectory' | 'homeDirectory') => {
      const current = settings[key];
      if (!isString(current) || current.length === 0) {
        return;
      }
      const normalized = normalizePathForPersistence(current);
      if (normalized !== current) {
        ensureNext();
        next[key] = normalized;
        changed = true;
      }
    };

    const normalizePathArrayField = (key: 'pinnedDirectories') => {
      const current = settings[key];
      if (!Array.isArray(current)) {
        return;
      }

      const normalized = normalizeStringArray(
        current
          .map((entry) => (isString(entry) ? normalizePathForPersistence(entry) : entry))
          .filter((entry): entry is string => isString(entry) && entry.length > 0),
      );

      if (!areStringArraysEqual(normalized, current)) {
        ensureNext();
        next[key] = normalized;
        changed = true;
      }
    };

    normalizePathField('lastDirectory');
    normalizePathField('homeDirectory');
    normalizePathArrayField('pinnedDirectories');

    if (Array.isArray(settings.projects)) {
      const normalizedProjects = sanitizeProjects(settings.projects) || [];
      if (JSON.stringify(normalizedProjects) !== JSON.stringify(settings.projects)) {
        ensureNext();
        next.projects = normalizedProjects;
        changed = true;
      }
    }

    return { settings: next, changed };
  };

  const clampNumber = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const normalizeTunnelBootstrapTtlMs = (value: RawValue): number | null => {
    if (value === null) {
      return null;
    }
    if (!isFiniteNumber(value)) {
      return tunnelBootstrapTtlDefaultMs;
    }
    return clampNumber(Math.round(value), tunnelBootstrapTtlMinMs, tunnelBootstrapTtlMaxMs);
  };

  const normalizeTunnelSessionTtlMs = (value: RawValue): number => {
    if (!isFiniteNumber(value)) {
      return tunnelSessionTtlDefaultMs;
    }
    return clampNumber(Math.round(value), tunnelSessionTtlMinMs, tunnelSessionTtlMaxMs);
  };

  const normalizeManagedRemoteTunnelHostname = (value: RawValue): string | undefined => {
    if (!isString(value)) {
      return undefined;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }

    const parsed = (() => {
      try {
        if (trimmed.includes('://')) {
          return new URL(trimmed);
        }
        return new URL(`https://${trimmed}`);
      } catch {
        return null;
      }
    })();

    const hostname = parsed?.hostname?.trim().toLowerCase() || '';
    if (!hostname) {
      return undefined;
    }
    return hostname;
  };

  const normalizeManagedRemoteTunnelPresets = (value: RawValue): ManagedRemoteTunnelPreset[] | undefined => {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const result: ManagedRemoteTunnelPreset[] = [];
    const seenIds = new Set<string>();
    const seenHostnames = new Set<string>();

    for (const entry of value) {
      if (!isObjectLike(entry)) continue;
      const candidate = entry;
      const id = isString(candidate.id) ? candidate.id.trim() : '';
      const name = isString(candidate.name) ? candidate.name.trim() : '';
      const hostname = normalizeManagedRemoteTunnelHostname(candidate.hostname);
      if (!id || !name || !hostname) continue;
      if (seenIds.has(id) || seenHostnames.has(hostname)) continue;
      seenIds.add(id);
      seenHostnames.add(hostname);
      result.push({ id, name, hostname });
    }

    return result;
  };

  const normalizeManagedRemoteTunnelPresetTokens = (value: RawValue): Record<string, string> | undefined => {
    if (!isRecord(value)) {
      return undefined;
    }

    const result: Record<string, string> = {};
    for (const [rawId, rawToken] of Object.entries(value)) {
      const id = rawId.trim();
      const token = isString(rawToken) ? rawToken.trim() : '';
      if (!id || !token) {
        continue;
      }
      result[id] = token;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  };

  const sanitizeTypographySizesPartial = (input: RawValue): TypographySizesPartial | undefined => {
    if (!isObjectLike(input)) {
      return undefined;
    }
    const candidate = input;
    const result: TypographySizesPartial = {};
    let populated = false;

    const assign = (key: keyof TypographySizesPartial) => {
      const value = candidate[key];
      if (isString(value) && value.length > 0) {
        result[key] = value;
        populated = true;
      }
    };

    assign('markdown');
    assign('code');
    assign('uiHeader');
    assign('uiLabel');
    assign('meta');
    assign('micro');

    return populated ? result : undefined;
  };

  const sanitizeModelRefs = (input: RawValue, limit: number): NormalizedModelRef[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const result: NormalizedModelRef[] = [];
    const seen = new Set<string>();

    for (const entry of input) {
      if (!isObjectLike(entry)) continue;
      const providerID = isString(entry.providerID) ? entry.providerID.trim() : '';
      const modelID = isString(entry.modelID) ? entry.modelID.trim() : '';
      if (!providerID || !modelID) continue;
      const key = modelRefKey(providerID, modelID);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ providerID, modelID });
      if (result.length >= limit) break;
    }

    return result;
  };

  const sanitizeSkillCatalogs = (input: RawValue): NormalizedSkillCatalog[] | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const result: NormalizedSkillCatalog[] = [];
    const seen = new Set<string>();

    for (const entry of input) {
      if (!isObjectLike(entry)) continue;

      const id = isString(entry.id) ? entry.id.trim() : '';
      const label = isString(entry.label) ? entry.label.trim() : '';
      const source = isString(entry.source) ? entry.source.trim() : '';
      const subpath = isString(entry.subpath) ? entry.subpath.trim() : '';
      const gitIdentityId = isString(entry.gitIdentityId) ? entry.gitIdentityId.trim() : '';

      if (!id || !label || !source) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      const catalog: NormalizedSkillCatalog = { id, label, source };
      if (subpath) catalog.subpath = subpath;
      if (gitIdentityId) catalog.gitIdentityId = gitIdentityId;
      result.push(catalog);
    }

    return result;
  };

  return {
    normalizeDirectoryPath,
    normalizePathForPersistence,
    normalizeSettingsPaths,
    normalizeTunnelBootstrapTtlMs,
    normalizeTunnelSessionTtlMs,
    normalizeManagedRemoteTunnelHostname,
    normalizeManagedRemoteTunnelPresets,
    normalizeManagedRemoteTunnelPresetTokens,
    sanitizeTypographySizesPartial,
    normalizeStringArray,
    sanitizeModelRefs,
    sanitizeSkillCatalogs,
    sanitizeProjects,
  };
};
