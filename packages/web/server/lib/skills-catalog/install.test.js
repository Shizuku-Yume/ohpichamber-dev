import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { prepareSkillsFromRepository } from './install.js';
import { scanSkillsRepository } from './scan.js';

const exec = promisify(execFile);
let root; let repository;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-repository-git-'));
  repository = path.join(root, 'repository');
  await fs.mkdir(repository);
  await exec('git', ['init', '--initial-branch=main', repository]);
  await exec('git', ['-C', repository, 'config', 'user.name', 'Fixture']);
  await exec('git', ['-C', repository, 'config', 'user.email', 'fixture@example.test']);
  const skill = path.join(repository, 'skills/review');
  await fs.mkdir(skill, { recursive: true });
  await fs.writeFile(path.join(skill, 'SKILL.md'), '---\nname: review\ndescription: Review code\n---\nKeep markdown.\n');
  await fs.writeFile(path.join(skill, 'asset.bin'), Buffer.from([0, 255, 16]));
  await exec('git', ['-C', repository, 'add', '.']);
  await exec('git', ['-C', repository, 'commit', '-m', 'fixture']);
  // Exercise real clone/sparse-checkout without contacting any external host.
  vi.stubEnv('GIT_CONFIG_COUNT', '1');
  vi.stubEnv('GIT_CONFIG_KEY_0', `url.file://${repository}.insteadOf`);
  vi.stubEnv('GIT_CONFIG_VALUE_0', 'https://github.com/fixture/skills.git');
  vi.stubEnv('GIT_ALLOW_PROTOCOL', 'file');
});
afterEach(async () => { vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true }); });
const input = { source: 'fixture/skills', subpath: 'skills', selections: [{ skillDir: 'skills/review' }] };

describe('Repository staging boundary with real Git', () => {
  it('preserves binary supporting files and deletes staging after the Host consumes it', async () => {
    let staged;
    const result = await prepareSkillsFromRepository(input, async installations => {
      expect(installations.map(item => item.name)).toEqual(['review']);
      staged = installations[0].stagingDirectory;
      expect(await fs.readFile(path.join(staged, 'asset.bin'))).toEqual(Buffer.from([0, 255, 16]));
      expect(await fs.readFile(path.join(staged, 'SKILL.md'), 'utf8')).toContain('Keep markdown.');
      return { consumed: true };
    });
    expect(result).toEqual({ consumed: true });
    await expect(fs.stat(staged)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('rejects supporting symlinks before calling the source commit callback', async () => {
    await fs.symlink('SKILL.md', path.join(repository, 'skills/review/linked'));
    await exec('git', ['-C', repository, 'add', '.']);
    await exec('git', ['-C', repository, 'commit', '-m', 'linked support file']);
    let consumed = false;
    await expect(prepareSkillsFromRepository(input, async () => { consumed = true; })).rejects.toThrow('Symlinks are not supported');
    expect(consumed).toBe(false);
  });
  it('never reads an external file through a linked SKILL.md during scanning', async () => {
    const secret = path.join(root, 'private.md');
    await fs.writeFile(secret, '---\nname: review\ndescription: PRIVATE HOST CONTENT\n---\nsecret');
    await fs.rm(path.join(repository, 'skills/review/SKILL.md'));
    await fs.symlink(secret, path.join(repository, 'skills/review/SKILL.md'));
    await exec('git', ['-C', repository, 'add', '.']);
    await exec('git', ['-C', repository, 'commit', '-m', 'linked skill definition']);
    const result = await scanSkillsRepository({ source: input.source, subpath: input.subpath });
    expect(result.ok).toBe(true);
    expect(result.items).toEqual([]);
  });
  it('refuses traversal and selections outside the approved repository subpath', async () => {
    let consumed = false;
    for (const skillDir of ['../private', 'skills/../private', '/private', 'other/review']) {
      const result = await prepareSkillsFromRepository({ ...input, selections: [{ skillDir }] }, async () => { consumed = true; });
      expect(result).toMatchObject({ ok: false, error: { kind: 'invalidSource' } });
    }
    expect(consumed).toBe(false);
  });
});
