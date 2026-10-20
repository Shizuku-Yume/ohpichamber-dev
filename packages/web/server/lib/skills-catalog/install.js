import fs from 'fs';
import os from 'os';
import path from 'path';

import { assertGitAvailable, looksLikeAuthError, runGit } from './git.js';
import { parseSkillRepoSource } from './source.js';

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;


function validateSkillName(skillName) {
  if (typeof skillName !== 'string') return false;
  if (skillName.length < 1 || skillName.length > 64) return false;
  return SKILL_NAME_PATTERN.test(skillName);
}

async function safeRm(dir) {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

function toFsPath(repoDir, repoRelPosixPath) {
  return path.join(repoDir, ...repoRelPosixPath.split('/'));
}

async function ensureDir(dirPath) {
  await fs.promises.mkdir(dirPath, { recursive: true });
}

async function copyDirectoryNoSymlinks(srcDir, dstDir) {
  const srcReal = await fs.promises.realpath(srcDir);
  await ensureDir(dstDir);

  const walk = async (currentSrc, currentDst) => {
    const entries = await fs.promises.readdir(currentSrc, { withFileTypes: true });
    for (const entry of entries) {
      const nextSrc = path.join(currentSrc, entry.name);
      const nextDst = path.join(currentDst, entry.name);

      const stat = await fs.promises.lstat(nextSrc);
      if (stat.isSymbolicLink()) {
        throw new Error('Symlinks are not supported in skills');
      }

      // Guard against traversal: ensure source is still under srcReal
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
          // best-effort
        }
        continue;
      }

      // Skip other types (sockets, devices, etc.)
    }
  };

  await walk(srcDir, dstDir);
}

async function cloneRepo({ cloneUrl, identity, credentialResolver, tempDir, ref = null }) {
  // A `#ref` on the source picks the branch or tag; otherwise the default branch.
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

/** Prepare untrusted repository files; only the Host source owner may commit them. */
export async function prepareSkillsFromRepository({ source, subpath, identity, credentialResolver, selections }, consume) {
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

    // Selective checkout for only requested skill dirs.
    await runGit(['-C', tempBase, 'sparse-checkout', 'init', '--cone'], { timeoutMs: 15_000 });
    const setResult = await runGit(['-C', tempBase, 'sparse-checkout', 'set', ...requestedDirs], { timeoutMs: 30_000 });
    if (!setResult.ok) {
      return { ok: false, error: { kind: 'unknown', message: setResult.stderr || setResult.message || 'Failed to configure sparse checkout' } };
    }

    // The checkout fetches the selected blobs from the partial clone, so it
    // authenticates like the clone did.
    const checkoutResult = await runGit(['-C', tempBase, 'checkout', '--force', 'HEAD'], { identity, credentialResolver, timeoutMs: 60_000 });
    if (!checkoutResult.ok) {
      return { ok: false, error: { kind: 'unknown', message: checkoutResult.stderr || checkoutResult.message || 'Failed to checkout repository' } };
    }

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
      }
      return await consume(installations);
    } finally {
      await safeRm(stagingRoot);
    }
  } finally {
    await safeRm(tempBase);
  }
}
