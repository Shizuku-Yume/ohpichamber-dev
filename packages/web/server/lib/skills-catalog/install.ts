import fs from 'fs';
import os from 'os';
import path from 'path';

import { assertGitAvailable, looksLikeAuthError, runGit } from './git.js';
import { parseSkillRepoSource } from './source.js';
import { removeDirectory, removeStaleCatalogFolders } from './remove-directory.js';
<<<<<<< HEAD:packages/web/server/lib/skills-catalog/install.js
||||||| bc50ba56aa:packages/web/server/lib/skills-catalog/install.js
import { OPENCODE_CONFIG_DIR } from '../opencode/shared.js';
=======
import { OPENCODE_CONFIG_DIR } from '../opencode/config-files.js';
import type { CatalogGitOptions, GitResult } from './git.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

interface CatalogCloneOptions extends Pick<CatalogGitOptions, 'identity' | 'credentialResolver'> {
  cloneUrl: string;
  tempDir: string;
  ref?: string | null;
}

type CatalogCloneResult = { ok: true } | { ok: false; error: GitResult };

export interface SkillsInstallOptions extends Pick<CatalogGitOptions, 'identity' | 'credentialResolver'> {
  source?: JsonValue | undefined;
  subpath?: JsonValue | undefined;
  defaultSubpath?: string;
  scope?: JsonValue | undefined;
  targetSource?: JsonValue | undefined;
  workingDirectory?: string | null;
  userSkillDir?: string | null;
  selections?: { skillDir?: JsonValue }[] | null | undefined;
  conflictPolicy?: JsonValue | undefined;
  conflictDecisions?: JsonObject | null | undefined;
}

export interface SkillInstallConflict {
  skillName: string;
  scope: 'user' | 'project';
  source: 'agents' | 'opencode';
}

export interface InstalledSkill extends SkillInstallConflict {
  skillDir: string;
}

export interface SkippedSkill {
  skillName: string;
  reason: string;
}

export type SkillsInstallResult = {
  ok: true;
  installed: InstalledSkill[];
  skipped: SkippedSkill[];
} | {
  ok: false;
  error: {
    kind: 'gitUnavailable' | 'unknown' | 'invalidSource' | 'conflicts' | 'authRequired' | 'networkError';
    message: string;
    conflicts?: SkillInstallConflict[];
  };
};

interface TargetSkillOptions {
  scope: 'user' | 'project';
  targetSource: string | undefined;
  workingDirectory: string | null | undefined;
  userSkillDir: string;
  skillName: string;
}

const isDefaultSubpath = (value: unknown): value is string => typeof value === 'string';
>>>>>>> upstream/main:packages/web/server/lib/skills-catalog/install.ts

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

<<<<<<< HEAD:packages/web/server/lib/skills-catalog/install.js
||||||| bc50ba56aa:packages/web/server/lib/skills-catalog/install.js
function normalizeUserSkillDir(userSkillDir) {
  if (!userSkillDir) return null;
  const legacySkillDir = path.join(OPENCODE_CONFIG_DIR, 'skill');
  const pluralSkillDir = path.join(OPENCODE_CONFIG_DIR, 'skills');
  if (userSkillDir === legacySkillDir) {
    if (fs.existsSync(legacySkillDir) && !fs.existsSync(pluralSkillDir)) return legacySkillDir;
    return pluralSkillDir;
  }
  return userSkillDir;
}
=======
function normalizeUserSkillDir(userSkillDir: string | null | undefined) {
  if (!userSkillDir) return null;
  const legacySkillDir = path.join(OPENCODE_CONFIG_DIR, 'skill');
  const pluralSkillDir = path.join(OPENCODE_CONFIG_DIR, 'skills');
  if (userSkillDir === legacySkillDir) {
    if (fs.existsSync(legacySkillDir) && !fs.existsSync(pluralSkillDir)) return legacySkillDir;
    return pluralSkillDir;
  }
  return userSkillDir;
}
>>>>>>> upstream/main:packages/web/server/lib/skills-catalog/install.ts

function validateSkillName(skillName: string) {
  if (skillName.length < 1 || skillName.length > 64) return false;
  return SKILL_NAME_PATTERN.test(skillName);
}

<<<<<<< HEAD:packages/web/server/lib/skills-catalog/install.js
function toFsPath(repoDir, repoRelPosixPath) {
  return path.join(repoDir, ...repoRelPosixPath.split('/'));
||||||| bc50ba56aa:packages/web/server/lib/skills-catalog/install.js
function toFsPath(repoDir, repoRelPosixPath) {
  const parts = String(repoRelPosixPath || '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  return path.join(repoDir, ...parts);
=======
function toFsPath(repoDir: string, repoRelPosixPath: string) {
  const parts = String(repoRelPosixPath || '')
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean);
  return path.join(repoDir, ...parts);
>>>>>>> upstream/main:packages/web/server/lib/skills-catalog/install.ts
}

async function ensureDir(dirPath: string) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function copyDirectoryNoSymlinks(srcDir: string, dstDir: string) {
  const srcReal = await fs.promises.realpath(srcDir);
  await ensureDir(dstDir);

  const walk = async (currentSrc: string, currentDst: string): Promise<void> => {
    const entries = await fs.promises.readdir(currentSrc, { withFileTypes: true });
    for (const entry of entries) {
      const nextSrc = path.join(currentSrc, entry.name);
      const nextDst = path.join(currentDst, entry.name);

      const stat = await fs.promises.lstat(nextSrc);
      if (stat.isSymbolicLink()) {
        throw new Error('Symlinks are not supported in skills');
      }

      const nextRealParent = await fs.promises.realpath(path.dirname(nextSrc));
      if (nextRealParent !== srcReal && !nextRealParent.startsWith(`${srcReal}${path.sep}`)) {
        throw new Error('Invalid source path traversal detected');
      }

      if (stat.isDirectory()) {
        await ensureDir(nextDst);
        await walk(nextSrc, nextDst);
        continue;
      }

      if (stat.isFile()) {
        await ensureDir(path.dirname(nextDst));
        await fs.promises.copyFile(nextSrc, nextDst);
        try {
          await fs.promises.chmod(nextDst, stat.mode & 0o777);
        } catch {
          continue;
        }
        continue;
      }
    }
  };

  await walk(srcDir, dstDir);
}

async function cloneRepo({ cloneUrl, identity, credentialResolver, tempDir, ref = null }: CatalogCloneOptions): Promise<CatalogCloneResult> {
  const branch = ref ? ['--branch', ref] : [];
  const preferred = ['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', ...branch, cloneUrl, tempDir];
  const fallback = ['clone', '--depth', '1', '--no-checkout', ...branch, cloneUrl, tempDir];

  const options = { identity, credentialResolver, timeoutMs: 90_000 };
  const result = await runGit(preferred, options);
  if (result.ok) return { ok: true };
  if (looksLikeAuthError(`${result.stderr || ''}\n${result.message || ''}`)) {
    return { ok: false, error: result };
  }

  const fallbackResult = await runGit(fallback, options);
  if (fallbackResult.ok) return { ok: true };

  return {
    ok: false,
    error: fallbackResult,
  };
}

<<<<<<< HEAD:packages/web/server/lib/skills-catalog/install.js
/** Prepare untrusted repository files; only the Host source owner may commit them. */
export async function prepareSkillsFromRepository({ source, subpath, identity, credentialResolver, selections }, consume) {
||||||| bc50ba56aa:packages/web/server/lib/skills-catalog/install.js
function getTargetSkillDir({ scope, targetSource, workingDirectory, userSkillDir, skillName }) {
  const source = targetSource === 'agents' ? 'agents' : 'opencode';

  if (scope === 'user') {
    if (source === 'agents') {
      return path.join(os.homedir(), '.agents', 'skills', skillName);
    }
    return path.join(userSkillDir, skillName);
  }

  if (!workingDirectory) {
    throw new Error('workingDirectory is required for project installs');
  }

  if (source === 'agents') {
    return path.join(workingDirectory, '.agents', 'skills', skillName);
  }

  return path.join(workingDirectory, '.opencode', 'skills', skillName);
}

export async function installSkillsFromRepository({
  source,
  subpath,
  defaultSubpath,
  identity,
  credentialResolver,
  scope,
  targetSource,
  workingDirectory,
  userSkillDir,
  selections,
  conflictPolicy,
  conflictDecisions,
} = {}) {
=======
function getTargetSkillDir({ scope, targetSource, workingDirectory, userSkillDir, skillName }: TargetSkillOptions) {
  const source = targetSource === 'agents' ? 'agents' : 'opencode';

  if (scope === 'user') {
    if (source === 'agents') {
      return path.join(os.homedir(), '.agents', 'skills', skillName);
    }
    return path.join(userSkillDir, skillName);
  }

  if (!workingDirectory) {
    throw new Error('workingDirectory is required for project installs');
  }

  if (source === 'agents') {
    return path.join(workingDirectory, '.agents', 'skills', skillName);
  }

  return path.join(workingDirectory, '.opencode', 'skills', skillName);
}

export async function installSkillsFromRepository({
  source,
  subpath,
  defaultSubpath,
  identity,
  credentialResolver,
  scope,
  targetSource,
  workingDirectory,
  userSkillDir,
  selections,
  conflictPolicy,
  conflictDecisions,
}: SkillsInstallOptions = {}): Promise<SkillsInstallResult> {
>>>>>>> upstream/main:packages/web/server/lib/skills-catalog/install.ts
  const gitCheck = await assertGitAvailable();
  if (!gitCheck.ok) return { ok: false, error: gitCheck.error };
  const parsed = parseSkillRepoSource(source, { subpath });
  if (!parsed.ok) return { ok: false, error: parsed.error };
  const requestedDirs = selections.map(selection => selection.skillDir);
  if (requestedDirs.some(directory => directory.includes('\\') || directory.split('/').some(part => !part || part === '.' || part === '..'))) {
    return { ok: false, error: { kind: 'invalidSource', message: 'Invalid repository skill directory' } };
  }
  if (parsed.effectiveSubpath && requestedDirs.some(directory => directory !== parsed.effectiveSubpath && !directory.startsWith(`${parsed.effectiveSubpath}/`))) {
    return { ok: false, error: { kind: 'invalidSource', message: 'Selected skill is outside the repository subpath' } };
  }
  const skillPlans = requestedDirs.map(skillDirPosix => ({ skillDirPosix, skillName: path.posix.basename(skillDirPosix) }));
  if (skillPlans.some(plan => !validateSkillName(plan.skillName)) || new Set(skillPlans.map(plan => plan.skillName)).size !== skillPlans.length) {
    return { ok: false, error: { kind: 'invalidSource', message: 'Invalid or duplicate skill name' } };
  }
<<<<<<< HEAD:packages/web/server/lib/skills-catalog/install.js
||||||| bc50ba56aa:packages/web/server/lib/skills-catalog/install.js

  const effectiveSubpath = parsed.effectiveSubpath || (typeof defaultSubpath === 'string' && defaultSubpath.trim() ? defaultSubpath.trim() : null);
  void effectiveSubpath;

=======

  const effectiveSubpath = parsed.effectiveSubpath || (isDefaultSubpath(defaultSubpath) && defaultSubpath.trim() ? defaultSubpath.trim() : null);
  void effectiveSubpath;

>>>>>>> upstream/main:packages/web/server/lib/skills-catalog/install.ts
  const cloneUrl = identity?.transport === 'ssh' ? parsed.cloneUrlSsh : parsed.cloneUrlHttps;
<<<<<<< HEAD:packages/web/server/lib/skills-catalog/install.js
||||||| bc50ba56aa:packages/web/server/lib/skills-catalog/install.js

  const requestedDirs = Array.isArray(selections) ? selections.map((s) => String(s?.skillDir || '').trim()).filter(Boolean) : [];
  if (requestedDirs.length === 0) {
    return { ok: false, error: { kind: 'invalidSource', message: 'No skills selected for installation' } };
  }

  // Validate names early and compute conflicts without mutating.
  const skillPlans = requestedDirs.map((skillDirPosix) => {
    const skillName = path.posix.basename(skillDirPosix);
    return { skillDirPosix, skillName, installable: validateSkillName(skillName) };
  });

  const conflicts = [];
  for (const plan of skillPlans) {
    if (!plan.installable) {
      continue;
    }

    const targetDir = getTargetSkillDir({ scope, targetSource, workingDirectory, userSkillDir, skillName: plan.skillName });
    if (fs.existsSync(targetDir)) {
      const decision = conflictDecisions?.[plan.skillName];
      const hasAutoPolicy = conflictPolicy === 'skipAll' || conflictPolicy === 'overwriteAll';
      if (!decision && !hasAutoPolicy) {
        conflicts.push({ skillName: plan.skillName, scope, source: targetSource === 'agents' ? 'agents' : 'opencode' });
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      error: {
        kind: 'conflicts',
        message: 'Some skills already exist in the selected scope',
        conflicts,
      },
    };
  }

=======

  const requestedDirs = Array.isArray(selections) ? selections.map((s) => String(s?.skillDir || '').trim()).filter(Boolean) : [];
  if (requestedDirs.length === 0) {
    return { ok: false, error: { kind: 'invalidSource', message: 'No skills selected for installation' } };
  }

  const skillPlans = requestedDirs.map((skillDirPosix) => {
    const skillName = path.posix.basename(skillDirPosix);
    return { skillDirPosix, skillName, installable: validateSkillName(skillName) };
  });

  const conflicts: SkillInstallConflict[] = [];
  for (const plan of skillPlans) {
    if (!plan.installable) {
      continue;
    }

    const targetDir = getTargetSkillDir({ scope, targetSource, workingDirectory, userSkillDir, skillName: plan.skillName });
    if (fs.existsSync(targetDir)) {
      const decision = conflictDecisions?.[plan.skillName];
      const hasAutoPolicy = conflictPolicy === 'skipAll' || conflictPolicy === 'overwriteAll';
      if (!decision && !hasAutoPolicy) {
        conflicts.push({ skillName: plan.skillName, scope, source: targetSource === 'agents' ? 'agents' : 'opencode' });
      }
    }
  }

  if (conflicts.length > 0) {
    return {
      ok: false,
      error: {
        kind: 'conflicts',
        message: 'Some skills already exist in the selected scope',
        conflicts,
      },
    };
  }

>>>>>>> upstream/main:packages/web/server/lib/skills-catalog/install.ts
  void removeStaleCatalogFolders();
  const tempBase = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'openchamber-skills-install-'));

  try {
    const cloned = await cloneRepo({ cloneUrl, identity, credentialResolver, tempDir: tempBase, ref: parsed.ref });
    if (!cloned.ok) {
      const msg = `${cloned.error?.stderr || ''}\n${cloned.error?.message || ''}`.trim();
      if (looksLikeAuthError(msg)) {
        return { ok: false, error: { kind: 'authRequired', message: 'Authentication required to access this repository' } };
      }
      return { ok: false, error: { kind: 'networkError', message: msg || 'Failed to clone repository' } };
    }

    await runGit(['-C', tempBase, 'sparse-checkout', 'init', '--cone'], { timeoutMs: 15_000 });
    const setResult = await runGit(['-C', tempBase, 'sparse-checkout', 'set', ...requestedDirs], { timeoutMs: 30_000 });
    if (!setResult.ok) {
      return { ok: false, error: { kind: 'unknown', message: setResult.stderr || setResult.message || 'Failed to configure sparse checkout' } };
    }

    const checkoutResult = await runGit(['-C', tempBase, 'checkout', '--force', 'HEAD'], { identity, credentialResolver, timeoutMs: 60_000 });
    if (!checkoutResult.ok) {
      return { ok: false, error: { kind: 'unknown', message: checkoutResult.stderr || checkoutResult.message || 'Failed to checkout repository' } };
    }

<<<<<<< HEAD:packages/web/server/lib/skills-catalog/install.js
    const stagingRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'openchamber-skills-stage-'));
    try {
      const installations = [];
      for (const plan of skillPlans) {
        const srcDir = toFsPath(tempBase, plan.skillDirPosix);
        let component = tempBase;
        for (const part of plan.skillDirPosix.split('/')) {
          component = path.join(component, part);
          if ((await fs.promises.lstat(component)).isSymbolicLink()) throw new Error('Linked repository directories are not supported');
        }
        const stat = await fs.promises.lstat(srcDir);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid repository skill directory');
        const skillMd = await fs.promises.lstat(path.join(srcDir, 'SKILL.md'));
        if (!skillMd.isFile() || skillMd.isSymbolicLink()) throw new Error('SKILL.md must be a regular file');
        const stagingDirectory = path.join(stagingRoot, plan.skillName);
        await copyDirectoryNoSymlinks(srcDir, stagingDirectory);
        installations.push({ name: plan.skillName, stagingDirectory });
||||||| bc50ba56aa:packages/web/server/lib/skills-catalog/install.js
    const installed = [];
    const skipped = [];

    for (const plan of skillPlans) {
      if (!plan.installable) {
        skipped.push({ skillName: plan.skillName, reason: 'Invalid skill name (directory basename)' });
        continue;
      }

      const srcDir = toFsPath(tempBase, plan.skillDirPosix);
      const skillMdPath = path.join(srcDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        skipped.push({ skillName: plan.skillName, reason: 'SKILL.md not found in selected directory' });
        continue;
      }

      const targetDir = getTargetSkillDir({ scope, targetSource, workingDirectory, userSkillDir, skillName: plan.skillName });
      const exists = fs.existsSync(targetDir);

      let decision = conflictDecisions?.[plan.skillName] || null;
      if (!decision) {
        if (exists && conflictPolicy === 'skipAll') decision = 'skip';
        if (exists && conflictPolicy === 'overwriteAll') decision = 'overwrite';
        if (!exists) decision = 'overwrite'; // no conflict, proceed
      }

      if (exists && decision === 'skip') {
        skipped.push({ skillName: plan.skillName, reason: 'Already installed (skipped)' });
        continue;
      }

      if (exists && decision === 'overwrite') {
        await removeDirectory(targetDir);
      }

      // Ensure project parent directories exist
      await ensureDir(path.dirname(targetDir));

      try {
        await copyDirectoryNoSymlinks(srcDir, targetDir);
        installed.push({ skillName: plan.skillName, skillDir: plan.skillDirPosix, scope, source: targetSource === 'agents' ? 'agents' : 'opencode' });
      } catch (error) {
        await removeDirectory(targetDir);
        skipped.push({
          skillName: plan.skillName,
          reason: error instanceof Error ? error.message : 'Failed to copy skill files',
        });
=======
    const installed: InstalledSkill[] = [];
    const skipped: SkippedSkill[] = [];

    for (const plan of skillPlans) {
      if (!plan.installable) {
        skipped.push({ skillName: plan.skillName, reason: 'Invalid skill name (directory basename)' });
        continue;
      }

      const srcDir = toFsPath(tempBase, plan.skillDirPosix);
      const skillMdPath = path.join(srcDir, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) {
        skipped.push({ skillName: plan.skillName, reason: 'SKILL.md not found in selected directory' });
        continue;
      }

      const targetDir = getTargetSkillDir({ scope, targetSource, workingDirectory, userSkillDir, skillName: plan.skillName });
      const exists = fs.existsSync(targetDir);

      let decision = conflictDecisions?.[plan.skillName] || null;
      if (!decision) {
        if (exists && conflictPolicy === 'skipAll') decision = 'skip';
        if (exists && conflictPolicy === 'overwriteAll') decision = 'overwrite';
        if (!exists) decision = 'overwrite';
      }

      if (exists && decision === 'skip') {
        skipped.push({ skillName: plan.skillName, reason: 'Already installed (skipped)' });
        continue;
      }

      if (exists && decision === 'overwrite') {
        await removeDirectory(targetDir);
      }

      await ensureDir(path.dirname(targetDir));

      try {
        await copyDirectoryNoSymlinks(srcDir, targetDir);
        installed.push({ skillName: plan.skillName, skillDir: plan.skillDirPosix, scope, source: targetSource === 'agents' ? 'agents' : 'opencode' });
      } catch (error) {
        await removeDirectory(targetDir);
        skipped.push({
          skillName: plan.skillName,
          reason: error instanceof Error ? error.message : 'Failed to copy skill files',
        });
>>>>>>> upstream/main:packages/web/server/lib/skills-catalog/install.ts
      }
      return await consume(installations);
    } finally {
      await removeDirectory(stagingRoot);
    }
  } finally {
    await removeDirectory(tempBase);
  }
}
