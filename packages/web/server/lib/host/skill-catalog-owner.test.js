import { afterEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSkillFileOwner } from './skill-file-owner.js';
import { createSkillCatalogOwner } from './skill-catalog-owner.js';
import express from 'express';
import { once } from 'node:events';
import { registerSkillRepositoryRoutes } from './skill-catalog-routes.js';

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
async function fixture({ hideBuiltins = false, denyIdentity = false, failApply = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-repository-boundary-')); roots.push(root);
  const cwd = path.join(root, 'workspace'); const agentDirectory = path.join(root, 'agent'); const stagingDirectory = path.join(root, 'staged');
  await Promise.all([cwd, agentDirectory, stagingDirectory].map(directory => fs.mkdir(directory)));
  await fs.writeFile(path.join(stagingDirectory, 'SKILL.md'), '---\nname: review\ndescription: Review code\n---\nKeep this body.');
  await fs.writeFile(path.join(stagingDirectory, 'image.bin'), Buffer.from([0, 255, 128, 65]));
  const scope = { projectId: 'project_test', workspaceId: 'workspace_test', cwd, agentDirectory, agentDirectoryId: 'agent_test' };
  const published = { workspace: '0', agent: '0' }; const publications = []; const scans = [];
  const ids = { projectId: scope.projectId, workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId };
  const problem = code => {
    const status = { CATALOG_CONFLICT: 409, UNAUTHORIZED: 403, INVALID_REQUEST: 400, NOT_FOUND: 404 }[code] ?? 503;
    return Response.json({ type: `urn:ohpichamber:problem:${code}`, title: 'Skill source operation failed', status, code, detail: 'The skill source operation could not finish.', retryable: status === 503 }, { status });
  };
  const owner = createSkillFileOwner({ service: { async request(endpoint, options) {
    const input = JSON.parse(options.body);
    expect(options.method).toBe('POST');
    const recovered = await owner.handle({ action: 'reconcile', ...ids }, scope);
    if (recovered.status !== 'reconciled') return problem(recovered.code);
    Object.assign(published, recovered.sources);
    if (endpoint.endsWith('/skill-files/reconcile')) return Response.json({ sources: recovered.sources });
    const sourceScope = input.scope === 'workspace' ? { kind: 'workspace', workspaceId: scope.workspaceId } : { kind: 'agent', agentDirectoryId: scope.agentDirectoryId };
    if (endpoint.endsWith('/skill-files/commit')) {
      if (published[input.scope] !== input.expectedSourceRevision) return problem('CATALOG_CONFLICT');
      const committed = await owner.handle({ action: 'commit', ...ids, ...input }, scope);
      if (committed.status !== 'committed') return problem(committed.code);
      published[input.scope] = committed.sourceRevision;
      publications.push({ scope: input.scope, sourceRevision: committed.sourceRevision });
      if (failApply) return problem('SKILL_APPLY_FAILED');
      return Response.json({ scope: sourceScope, sourceRevision: committed.sourceRevision, persistence: 'committed',
        apply: { kind: 'skills', status: 'no-active-workers', scope: sourceScope, sourceRevision: committed.sourceRevision, workers: [] } });
    }
    if (endpoint.endsWith('/skill-files/apply')) {
      if (failApply) return problem('SKILL_APPLY_FAILED');
      return Response.json({ kind: 'skills', status: 'no-active-workers', scope: sourceScope, sourceRevision: input.sourceRevision, workers: [] });
    }
    throw new Error(`Unexpected service request: ${endpoint}`);
  } } });
  const dependencies = {
    readSettingsFromDisk: async () => ({ skillCatalogs: [{ id: 'custom:team', label: 'Team', source: 'owner/team' }] }),
    sanitizeSkillCatalogs: entries => entries,
    resolveCatalogGitIdentity: async () => denyIdentity ? { ok: false, error: { kind: 'authRequired', message: 'Identity unavailable' } } : { ok: true, identity: { transport: 'ssh', credentialId: 'managed', endpoint: 'git@github.com:owner/team.git' } },
    credentialResolver: () => { throw new Error('Fixture never resolves a real credential'); },
  };
  const catalog = createSkillCatalogOwner({ owner, getDependencies: () => dependencies,
    policyOptions: { env: {}, readFile: () => JSON.stringify({ hideBuiltinSkillCatalogs: hideBuiltins }) },
    metadata: async () => ({}),
    scan: async input => { scans.push(input); return { ok: true, items: ['review', 'docx'].map(skillName => ({ repoSource: input.source, skillDir: `skills/${skillName}`, skillName, installable: true })) }; },
    prepare: async (input, consume) => consume(input.selections.map(selection => ({ name: selection.skillDir.split('/').at(-1), stagingDirectory }))),
  });
  return { root, cwd, scope, owner, catalog, publications, scans };
}
const install = { sourceId: 'custom:team', scope: 'workspace', expectedSourceRevision: '0', selections: [{ skillDir: 'skills/review' }], conflictPolicy: 'prompt' };

describe('Host canonical skill repository boundary', () => {
  it('enforces workspace authorization, strict install inputs and committed failure HTTP status', async () => {
    const f = await fixture({ failApply: true });
    const app = express(); const router = express.Router();
    registerSkillRepositoryRoutes(router, { express, catalogOwner: f.catalog, resolveWorkspaceScope: async workspaceId => workspaceId === f.scope.workspaceId ? f.scope : null });
    app.use('/api/agent/v1', router);
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}/api/agent/v1/workspaces`;
    try {
      const denied = await fetch(`${base}/workspace_other/skills/repositories`);
      expect(denied.status).toBe(403);
      const invalid = await fetch(`${base}/workspace_test/skills/repositories/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...install, destination: '/private/skills' }) });
      expect(invalid.status).toBe(400);
      const applied = await fetch(`${base}/workspace_test/skills/repositories/install`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(install) });
      expect(applied.status).toBe(503);
      expect(await applied.json()).toMatchObject({ code: 'SKILL_APPLY_FAILED', details: { result: { sourceRevision: '1', persistence: 'committed' }, repository: { installed: [{ skillName: 'review', scope: 'workspace' }] } } });
    } finally {
      const stopped = Promise.withResolvers();
      server.close(error => error ? stopped.reject(error) : stopped.resolve());
      server.closeAllConnections();
      await stopped.promise;
    }
  });
  it('publishes one revision for a multi-skill batch and rejects linked staged files without replacing originals', async () => {
    const f = await fixture();
    const result = await f.catalog.install(f.scope, { ...install, selections: [{ skillDir: 'skills/review' }, { skillDir: 'skills/docx' }] });
    expect(result.installed.map(entry => entry.skillName)).toEqual(['review', 'docx']);
    expect(result.commit.sourceRevision).toBe('1');
    expect(f.publications).toHaveLength(1);
    await fs.symlink(path.join(f.root, 'staged/image.bin'), path.join(f.root, 'staged/linked.bin'));
    await expect(f.catalog.install(f.scope, { ...install, expectedSourceRevision: '1', conflictPolicy: 'overwriteAll' })).rejects.toMatchObject({ status: 403 });
    expect(await fs.readFile(path.join(f.cwd, '.omp/skills/review/image.bin'))).toEqual(Buffer.from([0, 255, 128, 65]));
    expect((await f.owner.catalog(f.scope)).sources.workspace).toBe('1');
    expect(f.publications).toHaveLength(1);
  });
  it('rejects arbitrary source URLs, hidden sources and selections outside authorized catalog items', async () => {
    const f = await fixture({ hideBuiltins: true });
    await expect(f.catalog.install(f.scope, { ...install, source: 'https://attacker.example/repo' })).rejects.toThrow();
    await expect(f.catalog.install(f.scope, { ...install, sourceId: 'anthropic' })).rejects.toMatchObject({ status: 404 });
    await expect(f.catalog.install(f.scope, { ...install, selections: [{ skillDir: 'unlisted/skill' }] })).rejects.toMatchObject({ status: 403 });
    expect((await f.owner.catalog(f.scope)).sources.workspace).toBe('0');
  });
  it('hides builtins at the authoritative boundary but retains configured repositories', async () => {
    const hidden = await fixture({ hideBuiltins: true });
    expect((await hidden.catalog.catalog(hidden.scope)).sources.map(source => source.id)).toEqual(['custom:team']);
    await expect(hidden.catalog.source(hidden.scope, { sourceId: 'anthropic' })).rejects.toMatchObject({ status: 404 });
    expect(hidden.scans).toHaveLength(0);
    const normal = await fixture();
    expect((await normal.catalog.catalog(normal.scope)).sources.some(source => source.id === 'anthropic')).toBe(true);
  });
  it('preserves licensed exclusions and refuses unavailable selected credentials before scanning', async () => {
    const normal = await fixture();
    expect((await normal.catalog.source(normal.scope, { sourceId: 'anthropic', refresh: true })).items.map(item => item.skillName)).toEqual(['review']);
    const denied = await fixture({ denyIdentity: true });
    await expect(denied.catalog.scan(denied.scope, { source: 'owner/team', gitIdentityId: 'missing' })).rejects.toMatchObject({ status: 401 });
    expect(denied.scans).toHaveLength(0);
  });
  it('commits binary supporting files into native workspace storage with one revision and rejects stale CAS', async () => {
    const f = await fixture();
    const result = await f.catalog.install(f.scope, install);
    expect(result.ok).toBe(true); expect(result.commit.sourceRevision).toBe('1');
    expect(await fs.readFile(path.join(f.cwd, '.omp/skills/review/image.bin'))).toEqual(Buffer.from([0, 255, 128, 65]));
    expect(f.publications).toHaveLength(1);
    await expect(fs.stat(path.join(f.cwd, '.opencode'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(f.catalog.install(f.scope, { ...install, conflictPolicy: 'overwriteAll' })).rejects.toMatchObject({ status: 409 });
    expect((await f.owner.catalog(f.scope)).sources.workspace).toBe('1');
  });
  it('prompts before overwriting and installs into the selected agent directory independently', async () => {
    const f = await fixture();
    await f.catalog.install(f.scope, install);
    const conflict = await f.catalog.install(f.scope, { ...install, expectedSourceRevision: '1' });
    expect(conflict).toMatchObject({ ok: false, error: { kind: 'conflicts', conflicts: [{ skillName: 'review', scope: 'workspace' }] } });
    const skipped = await f.catalog.install(f.scope, { ...install, expectedSourceRevision: '1', conflictPolicy: 'skipAll' });
    expect(skipped).toMatchObject({ ok: true, commit: null, installed: [] });
    const agent = await f.catalog.install(f.scope, { ...install, scope: 'agent' });
    expect(agent.commit.scope).toEqual({ kind: 'agent', agentDirectoryId: 'agent_test' });
    expect(await fs.readFile(path.join(f.scope.agentDirectory, 'skills/review/image.bin'))).toEqual(Buffer.from([0, 255, 128, 65]));
    expect((await f.owner.catalog(f.scope)).sources).toEqual({ workspace: '1', agent: '1' });
  });
  it('reports a persisted source independently of failed active application', async () => {
    const f = await fixture({ failApply: true });
    await expect(f.catalog.install(f.scope, install)).rejects.toMatchObject({ status: 503, code: 'SKILL_APPLY_FAILED', details: {
      result: { persistence: 'committed', sourceRevision: '1', apply: null },
      repository: { installed: [{ skillName: 'review', scope: 'workspace' }], skipped: [], commit: { persistence: 'committed', sourceRevision: '1', apply: null } },
    } });
    expect(await fs.readFile(path.join(f.cwd, '.omp/skills/review/SKILL.md'), 'utf8')).toContain('Keep this body.');
  });
});
