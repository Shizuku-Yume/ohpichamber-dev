import fs from 'fs';
import os from 'os';
import path from 'path';

import { assertGitAvailable, looksLikeAuthError, runGit } from './git.js';
import { parseSkillRepoSource } from './source.js';
import type { CatalogGitOptions, GitResult } from './git.js';
import type { JsonValue } from '../shared/json-values.js';

interface CatalogCloneOptions extends Pick<CatalogGitOptions, 'identity' | 'credentialResolver'> {
  cloneUrl: string;
  tempDir: string;
  ref?: string | null;
}

type CatalogCloneResult = { ok: true } | { ok: false; error: GitResult };

export interface SkillSelection {
  skillDir: string;
}

export interface PreparedSkillDirectory {
  name: string;
  stagingDirectory: string;
}

export interface PrepareSkillsFromRepositoryInput extends Pick<CatalogGitOptions, 'identity' | 'credentialResolver'> {
  source: JsonValue | undefined;
  subpath?: JsonValue | undefined;
  selections: readonly SkillSelection[];
}

export type PrepareSkillsErrorKind = 'gitUnavailable' | 'invalidSource' | 'authRequired' | 'networkError' | 'unknown';

export interface PrepareSkillsFailure {
  ok: false;
  error: { kind: PrepareSkillsErrorKind; message: string };
}
import { removeDirectory, removeStaleCatalogFolders } from './remove-directory.js';

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;


function validateSkillName(skillName: string) {
  if (skillName.length < 1 || skillName.length > 64) return false;
  return SKILL_NAME_PATTERN.test(skillName);
}

function toFsPath(repoDir: string, repoRelPosixPath: string) {
  return path.join(repoDir, ...repoRelPosixPath.split('/'));
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

export async function prepareSkillsFromRepository<Result>(
  { source, subpath, identity, credentialResolver, selections }: PrepareSkillsFromRepositoryInput,
  consume: (installations: PreparedSkillDirectory[]) => Promise<Result>,
): Promise<Result | PrepareSkillsFailure> {
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
  const cloneUrl = identity?.transport === 'ssh' ? parsed.cloneUrlSsh : parsed.cloneUrlHttps;
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

    const stagingRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'openchamber-skills-stage-'));
    try {
      const installations: PreparedSkillDirectory[] = [];
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
      }
      return await consume(installations);
    } finally {
      await removeDirectory(stagingRoot);
    }
  } finally {
    await removeDirectory(tempBase);
  }
}
