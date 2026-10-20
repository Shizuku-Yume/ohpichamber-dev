import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as C from '@openchamber/agent-contract';
import { createSkillFileOwner } from './skill-file-owner.js';

function serviceBoundary(scope, currentOwner) {
  const published = { workspace: '0', agent: '0' };
  const applications = [];
  const ids = { projectId: scope.projectId, workspaceId: scope.workspaceId, agentDirectoryId: scope.agentDirectoryId };
  let losePublication = false;
  let loseAppliedResponse = false;
  let failApply = false;
  let nextCommit;
  function sourceScope(selection) {
    return selection === 'workspace'
      ? { kind: 'workspace', workspaceId: scope.workspaceId }
      : { kind: 'agent', agentDirectoryId: scope.agentDirectoryId };
  }
  function problem(code, detail = 'Skill source operation failed.') {
    const status = { CATALOG_CONFLICT: 409, UNAUTHORIZED: 403, INVALID_REQUEST: 400, NOT_FOUND: 404 }[code] ?? 503;
    return Response.json(C.ProblemDetailsSchema.parse({
      type: `urn:ohpichamber:problem:${code}`, title: detail, status, code, detail, retryable: status === 503,
    }), { status });
  }
  async function reconcile() {
    const recovered = await currentOwner().handle({ action: 'reconcile', ...ids }, scope);
    if (recovered.status !== 'reconciled') return { error: problem(recovered.code) };
    Object.assign(published, recovered.sources);
    return { sources: recovered.sources };
  }
  function apply(selection, sourceRevision) {
    if (failApply) {
      failApply = false;
      return { error: problem('SKILL_APPLY_FAILED', 'Active skill reload failed.') };
    }
    const result = C.SkillsApplyResultSchema.parse({
      kind: 'skills', scope: sourceScope(selection), sourceRevision, status: 'no-active-workers', workers: [],
    });
    applications.push(result);
    return { result };
  }
  return {
    published,
    applications,
    loseNextPublicationResponse() { losePublication = true; },
    loseNextAppliedResponse() { loseAppliedResponse = true; },
    failNextApply() { failApply = true; },
    holdNextCommit() {
      let entered, release;
      const started = new Promise(resolve => { entered = resolve; });
      const admitted = new Promise(resolve => { release = resolve; });
      nextCommit = { entered, admitted };
      return { started, release };
    },
    async request(url, options) {
      const body = JSON.parse(options.body);
      if (options.method !== 'POST') throw new Error(`Unexpected service method: ${options.method}`);
      if (url.endsWith('/skill-files/reconcile')) {
        const recovered = await reconcile();
        return recovered.error ?? Response.json({ sources: recovered.sources });
      }
      if (url.endsWith('/skill-files/commit')) {
        const operation = { action: 'commit', ...ids, ...body };
        const admission = nextCommit;
        nextCommit = undefined;
        if (admission) {
          admission.entered(operation);
          await admission.admitted;
        }
        const recovered = await reconcile();
        if (recovered.error) return recovered.error;
        if (published[body.scope] !== body.expectedSourceRevision) return problem('CATALOG_CONFLICT');
        const committed = await currentOwner().handle(operation, scope);
        if (committed.status !== 'committed') return problem(committed.code);
        published[body.scope] = committed.sourceRevision;
        if (losePublication) {
          losePublication = false;
          throw new Error('Publication accepted, but its response was lost.');
        }
        const applied = apply(body.scope, committed.sourceRevision);
        if (applied.error) return applied.error;
        if (loseAppliedResponse) {
          loseAppliedResponse = false;
          throw new Error('Skills applied, but the final response was lost.');
        }
        return Response.json(C.SkillInstallResultSchema.parse({
          scope: sourceScope(body.scope), sourceRevision: committed.sourceRevision,
          persistence: 'committed', apply: applied.result,
        }));
      }
      if (url.endsWith('/skill-files/apply')) {
        const applied = apply(body.scope, body.sourceRevision);
        return applied.error ?? Response.json(applied.result);
      }
      throw new Error(`Unexpected service operation: ${options.method} ${url}`);
    },
  };
}

describe('skill file source ownership', () => {
  let directory, scope, service, owner;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-file-owner-'));
    scope = {
      projectId: 'project_test', workspaceId: 'workspace_test', agentDirectoryId: 'agent_test',
      cwd: path.join(directory, 'workspace'), agentDirectory: path.join(directory, 'agent'),
    };
    await Promise.all([fs.mkdir(scope.cwd), fs.mkdir(scope.agentDirectory)]);
    service = serviceBoundary(scope, () => owner);
    owner = createSkillFileOwner({ service });
  });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  function root(selection) {
    return selection === 'workspace' ? path.join(scope.cwd, '.omp', 'skills') : path.join(scope.agentDirectory, 'skills');
  }
  function ledger(selection) {
    return selection === 'workspace'
      ? path.join(scope.cwd, '.omp', '.openchamber-skill-source.json')
      : path.join(scope.agentDirectory, '.openchamber-skill-source.json');
  }
  async function seed(selection, relative, content) {
    const target = path.join(root(selection), relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content);
  }
  async function journal(selection, pending, revision = '1') {
    await fs.mkdir(root(selection), { recursive: true });
    await fs.writeFile(ledger(selection), JSON.stringify({ revision, pending }));
  }
  function write(selection, revision, content, filePath = 'SKILL.md', skillId = 'review') {
    return owner.mutate(scope, selection, revision, skillId, {
      kind: 'write', target: `${skillId}/${filePath}`, content,
    });
  }

  it('reconciles and catalogs missing source roots without creating authoring directories', async () => {
    const operation = {
      action: 'reconcile', projectId: scope.projectId, workspaceId: scope.workspaceId,
      agentDirectoryId: scope.agentDirectoryId,
    };
    await expect(owner.handle(operation, scope)).resolves.toEqual({
      status: 'reconciled', sources: { workspace: '0', agent: '0' },
    });
    expect(await owner.catalog(scope)).toEqual({
      workspaceId: scope.workspaceId, sources: { workspace: '0', agent: '0' }, skills: [],
    });
    owner = createSkillFileOwner({ service });
    await owner.catalog(scope);
    expect(await fs.readdir(scope.cwd)).toEqual([]);
    expect(await fs.readdir(scope.agentDirectory)).toEqual([]);
    expect(service.applications).toEqual([]);
  });

  for (const selection of ['workspace', 'agent']) {
    describe(`${selection} source`, () => {
      for (const responseKind of ['fabricated', 'invalid-schema', 'invalid-json']) {
        it(`rejects a ${responseKind} success response without an actual Host commit`, async () => {
          await seed(selection, 'review/SKILL.md', 'original');
          const selectedScope = selection === 'workspace'
            ? { kind: 'workspace', workspaceId: scope.workspaceId }
            : { kind: 'agent', agentDirectoryId: scope.agentDirectoryId };
          owner = createSkillFileOwner({ service: {
            async request(url, options) {
              if (!url.endsWith('/skill-files/commit')) return service.request(url, options);
              if (responseKind === 'invalid-json') return new Response('{', { status: 200 });
              if (responseKind === 'invalid-schema') return Response.json({ sourceRevision: 1 });
              return Response.json(C.SkillInstallResultSchema.parse({
                scope: selectedScope, sourceRevision: '1', persistence: 'committed',
                apply: { kind: 'skills', scope: selectedScope, sourceRevision: '1', status: 'no-active-workers', workers: [] },
              }));
            },
          } });
          await expect(write(selection, '0', 'must not claim persistence')).rejects.toMatchObject({
            status: 503, code: 'SERVICE_UNAVAILABLE',
          });
          expect((await owner.read(scope, selection, 'review', 'SKILL.md')).content).toBe('original');
          expect((await owner.catalog(scope)).sources[selection]).toBe('0');
          expect(service.applications).toEqual([]);
        });
      }

      for (const mismatch of ['revision', 'scope', 'missing-apply']) {
        it(`preserves the real committed identity when the service acknowledges a different ${mismatch}`, async () => {
          const selectedScope = selection === 'workspace'
            ? { kind: 'workspace', workspaceId: scope.workspaceId }
            : { kind: 'agent', agentDirectoryId: scope.agentDirectoryId };
          owner = createSkillFileOwner({ service: {
            async request(url, options) {
              const response = await service.request(url, options);
              if (!url.endsWith('/skill-files/commit')) return response;
              const result = await response.json();
              if (mismatch === 'revision') {
                result.sourceRevision = '99';
                result.apply.sourceRevision = '99';
              } else if (mismatch === 'scope') {
                result.scope = selection === 'workspace'
                  ? { kind: 'workspace', workspaceId: 'foreign_workspace' }
                  : { kind: 'agent', agentDirectoryId: 'foreign_agent' };
                result.apply.scope = result.scope;
              } else result.apply = null;
              return Response.json(C.SkillInstallResultSchema.parse(result));
            },
          } });
          await expect(write(selection, '0', 'actual committed bytes')).rejects.toMatchObject({
            status: 503, code: 'SKILL_APPLY_FAILED',
            details: { result: { scope: selectedScope, sourceRevision: '1', persistence: 'committed', apply: null } },
          });
          owner = createSkillFileOwner({ service });
          expect(await owner.read(scope, selection, 'review', 'SKILL.md')).toMatchObject({
            sourceRevision: '1', content: 'actual committed bytes',
          });
          expect((await owner.catalog(scope)).sources[selection]).toBe('1');
          expect(service.applications.map(result => result.sourceRevision)).toEqual(['1']);
        });
      }

      it('commits only the captured operation and trusted roots after supervisor admission', async () => {
        await seed(selection, 'review/SKILL.md', 'unchanged before admission');
        const admission = service.holdNextCommit();
        const mutation = write(selection, '0', 'committed after admission');
        let operation;
        try {
          operation = await admission.started;
          for (const key of ['projectId', 'workspaceId', 'agentDirectoryId']) {
            await expect(owner.handle({ ...operation, [key]: 'foreign_id' }, scope)).resolves.toEqual({
              status: 'failed', code: 'SERVICE_UNAVAILABLE',
            });
          }
          for (const key of ['cwd', 'agentDirectory']) {
            await expect(owner.handle(operation, { ...scope, [key]: directory })).resolves.toEqual({
              status: 'failed', code: 'SERVICE_UNAVAILABLE',
            });
          }
          await expect(owner.handle({ ...operation, expectedSourceRevision: '9' }, scope)).resolves.toEqual({
            status: 'failed', code: 'SERVICE_UNAVAILABLE',
          });
          await expect(owner.handle({ ...operation, scope: selection === 'workspace' ? 'agent' : 'workspace' }, scope)).resolves.toEqual({
            status: 'failed', code: 'SERVICE_UNAVAILABLE',
          });
          await expect(owner.handle({ ...operation, operationId: 'unknown_operation' }, scope)).resolves.toEqual({
            status: 'failed', code: 'SERVICE_UNAVAILABLE',
          });
          await expect(owner.handle({ ...operation, cwd: directory }, scope)).rejects.toThrow();
          expect(await fs.readFile(path.join(root(selection), 'review', 'SKILL.md'), 'utf8')).toBe('unchanged before admission');
          expect(service.published[selection]).toBe('0');
          expect(service.applications).toEqual([]);
        } finally {
          admission.release();
          await mutation;
        }
        expect((await owner.read(scope, selection, 'review', 'SKILL.md')).content).toBe('committed after admission');
        await expect(owner.handle(operation, scope)).resolves.toEqual({ status: 'failed', code: 'SERVICE_UNAVAILABLE' });
        expect(service.applications.map(result => result.sourceRevision)).toEqual(['1']);
      });

      it('rejects a directory write without reserving a revision or leaving recovery work', async () => {
        await seed(selection, 'review/SKILL.md', 'original');
        await expect(owner.mutate(scope, selection, '0', 'review', {
          kind: 'write', target: 'review', content: 'cannot replace a directory',
        })).rejects.toMatchObject({ status: 400, code: 'INVALID_REQUEST' });
        owner = createSkillFileOwner({ service });
        expect((await owner.read(scope, selection, 'review', 'SKILL.md')).content).toBe('original');
        expect((await owner.catalog(scope)).sources[selection]).toBe('0');
        expect(service.applications).toEqual([]);
      });

      it('roundtrips raw Markdown and nested supporting text without interpreting frontmatter', async () => {
        const markdown = '---\nname: "Review: exact"\ndescription: |\n  Preserve this.\nunknown: [one, two]\n---\n\n# Review\n\n{{arguments}}\r\n';
        const supporting = '#!/bin/sh\nprintf "%s\\n" "$1"\n';
        const committed = await write(selection, '0', markdown);
        expect(committed).toMatchObject({
          sourceRevision: '1', persistence: 'committed',
          apply: { sourceRevision: '1', status: 'no-active-workers', workers: [] },
        });
        await write(selection, '1', supporting, 'scripts/check.sh');
        expect(await owner.read(scope, selection, 'review', 'SKILL.md')).toMatchObject({
          sourceRevision: '2', filePath: 'SKILL.md', content: markdown,
        });
        expect((await owner.read(scope, selection, 'review')).files).toEqual([
          { filePath: 'SKILL.md', content: markdown },
          { filePath: 'scripts/check.sh', content: supporting },
        ]);
        const catalog = await owner.catalog(scope);
        expect(catalog.sources).toEqual(selection === 'workspace' ? { workspace: '2', agent: '0' } : { workspace: '0', agent: '2' });
        expect(catalog.skills).toEqual([{
          skillId: 'review', name: 'review', scope: selection, files: ['SKILL.md', 'scripts/check.sh'],
        }]);
        expect(await fs.readFile(path.join(root(selection), 'review', 'SKILL.md'), 'utf8')).toBe(markdown);
      });

      it('rejects stale write, delete, rename, install and apply without changing the committed directory', async () => {
        await write(selection, '0', 'current Markdown');
        await seed(selection, 'review/keep.bin', Buffer.from([0, 255, 1, 128]));
        const stagingDirectory = path.join(directory, 'repository');
        await fs.mkdir(stagingDirectory);
        await fs.writeFile(path.join(stagingDirectory, 'SKILL.md'), 'replacement');
        const operations = [
          () => write(selection, '0', 'stale Markdown'),
          () => owner.mutate(scope, selection, '0', 'review', { kind: 'delete', target: 'review' }),
          () => owner.mutate(scope, selection, '0', 'review', { kind: 'rename', target: 'review', destination: 'renamed' }),
          () => owner.install(scope, selection, '0', [{ name: 'review', stagingDirectory, overwrite: true }]),
          () => owner.apply(scope, selection, '0'),
        ];
        for (const operation of operations) {
          await expect(operation()).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
        }
        expect(await fs.readFile(path.join(root(selection), 'review', 'SKILL.md'), 'utf8')).toBe('current Markdown');
        expect(await fs.readFile(path.join(root(selection), 'review', 'keep.bin'))).toEqual(Buffer.from([0, 255, 1, 128]));
        expect(await fs.readdir(root(selection))).toEqual(['review']);
        expect((await owner.catalog(scope)).sources[selection]).toBe('1');
        expect(service.applications).toHaveLength(1);
      });

      it('rejects traversal in reads, writes, rename destinations and installation names', async () => {
        await write(selection, '0', 'safe');
        const outside = path.join(directory, 'outside.txt');
        await fs.writeFile(outside, 'private');
        for (const relative of ['../outside.txt', '/tmp/outside.txt', 'review/../../outside.txt', 'review\\outside.txt']) {
          await expect(owner.read(scope, selection, 'review', relative)).rejects.toThrow();
          await expect(Promise.resolve().then(() => owner.mutate(scope, selection, '1', 'review', { kind: 'write', target: relative, content: 'escaped' }))).rejects.toThrow();
          await expect(Promise.resolve().then(() => owner.mutate(scope, selection, '1', 'review', { kind: 'rename', target: 'review', destination: relative }))).rejects.toThrow();
          await expect(owner.install(scope, selection, '1', [{ name: relative, stagingDirectory: directory, overwrite: true }])).rejects.toThrow();
        }
        expect(await fs.readFile(outside, 'utf8')).toBe('private');
        expect(await fs.readFile(path.join(root(selection), 'review', 'SKILL.md'), 'utf8')).toBe('safe');
        expect((await owner.catalog(scope)).sources[selection]).toBe('1');
      });

      it('refuses symlink escapes for reads, writes and rename without modifying their target', async () => {
        await write(selection, '0', 'safe');
        const outside = path.join(directory, 'outside');
        await fs.mkdir(outside);
        await fs.writeFile(path.join(outside, 'secret.txt'), 'private');
        await fs.symlink(outside, path.join(root(selection), 'linked'), 'dir');
        await fs.symlink(path.join(outside, 'secret.txt'), path.join(root(selection), 'review', 'linked.txt'));
        await expect(owner.read(scope, selection, 'linked', 'secret.txt')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        await expect(owner.read(scope, selection, 'review', 'linked.txt')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        await expect(write(selection, '1', 'escaped', 'secret.txt', 'linked')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        await expect(write(selection, '1', 'escaped', 'linked.txt')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        await expect(owner.mutate(scope, selection, '1', 'review', {
          kind: 'rename', target: 'review', destination: 'linked/moved',
        })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        expect(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8')).toBe('private');
        expect((await owner.catalog(scope)).sources[selection]).toBe('1');
        expect((await owner.read(scope, selection, 'review')).files).toEqual([{ filePath: 'SKILL.md', content: 'safe' }]);
      });

      it('rejects linked managed roots and linked repository assets before source commit', async () => {
        const outside = path.join(directory, 'outside');
        await fs.mkdir(outside);
        await fs.writeFile(path.join(outside, 'SKILL.md'), 'private source');
        await fs.mkdir(path.dirname(root(selection)), { recursive: true });
        await fs.symlink(outside, root(selection), 'dir');
        await expect(owner.handle({
          action: 'reconcile', projectId: scope.projectId, workspaceId: scope.workspaceId,
          agentDirectoryId: scope.agentDirectoryId,
        }, scope)).resolves.toEqual({ status: 'reconciled', sources: { workspace: '0', agent: '0' } });
        expect(await owner.catalog(scope)).toEqual({
          workspaceId: scope.workspaceId, sources: { workspace: '0', agent: '0' }, skills: [],
        });
        expect(await fs.readdir(outside)).toEqual(['SKILL.md']);
        expect(service.applications).toEqual([]);
        await expect(write(selection, '0', 'escaped')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        expect(await fs.readFile(path.join(outside, 'SKILL.md'), 'utf8')).toBe('private source');
        await fs.unlink(root(selection));
        await write(selection, '0', 'original');
        const stagingDirectory = path.join(directory, 'linked-repository');
        await fs.mkdir(stagingDirectory);
        await fs.writeFile(path.join(stagingDirectory, 'SKILL.md'), 'replacement');
        await fs.symlink(path.join(outside, 'SKILL.md'), path.join(stagingDirectory, 'linked.md'));
        await expect(owner.install(scope, selection, '1', [{
          name: 'review', stagingDirectory, overwrite: true,
        }])).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
        expect((await owner.read(scope, selection, 'review', 'SKILL.md')).content).toBe('original');
        expect((await owner.catalog(scope)).sources[selection]).toBe('1');
        expect(service.applications.map(result => result.sourceRevision)).toEqual(['1']);
      });

      it('treats a linked source ledger as read-only state rather than importing its revision', async () => {
        await seed(selection, 'review/SKILL.md', 'native read-only source');
        const externalLedger = path.join(directory, 'external-ledger.json');
        const originalLedger = JSON.stringify({ revision: '99' });
        await fs.writeFile(externalLedger, originalLedger);
        await fs.symlink(externalLedger, ledger(selection));
        expect(await owner.catalog(scope)).toEqual({
          workspaceId: scope.workspaceId, sources: { workspace: '0', agent: '0' }, skills: [],
        });
        await expect(write(selection, '0', 'must not replace native source')).rejects.toMatchObject({
          status: 403, code: 'UNAUTHORIZED',
        });
        expect(await fs.readFile(externalLedger, 'utf8')).toBe(originalLedger);
        expect(await fs.readFile(path.join(root(selection), 'review', 'SKILL.md'), 'utf8')).toBe('native read-only source');
        expect(service.applications).toEqual([]);
      });

      it('replaces an existing directory only when overwrite is explicit', async () => {
        await write(selection, '0', 'original');
        await seed(selection, 'review/obsolete.txt', 'remove with old directory');
        const stagingDirectory = path.join(directory, 'replacement');
        await fs.mkdir(stagingDirectory);
        await fs.writeFile(path.join(stagingDirectory, 'SKILL.md'), 'replacement');
        await expect(owner.install(scope, selection, '1', [{
          name: 'review', stagingDirectory, overwrite: false,
        }])).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
        expect((await owner.read(scope, selection, 'review', 'SKILL.md')).content).toBe('original');
        await owner.install(scope, selection, '1', [{ name: 'review', stagingDirectory, overwrite: true }]);
        expect((await owner.read(scope, selection, 'review')).files).toEqual([
          { filePath: 'SKILL.md', content: 'replacement' },
        ]);
        expect((await owner.catalog(scope)).sources[selection]).toBe('2');
      });

      it('finishes an installation interrupted after the old directory was backed up', async () => {
        await seed(selection, 'review/SKILL.md', 'original');
        const staging = '.openchamber-skill-stage-33333333-3333-3333-3333-333333333333';
        const backup = '.openchamber-skill-backup-44444444-4444-4444-4444-444444444444';
        const parent = path.dirname(root(selection));
        await fs.mkdir(path.join(parent, staging));
        await fs.writeFile(path.join(parent, staging, 'SKILL.md'), 'installed after interrupted swap');
        await fs.rename(path.join(root(selection), 'review'), path.join(parent, backup));
        await journal(selection, { kind: 'install', replacements: [{ target: 'review', staging, backup }] });
        owner = createSkillFileOwner({ service });
        expect(await owner.read(scope, selection, 'review', 'SKILL.md')).toMatchObject({
          sourceRevision: '1', content: 'installed after interrupted swap',
        });
        expect((await fs.readdir(parent)).filter(name => /^\.openchamber-skill-(?:stage|backup)-/.test(name))).toEqual([]);
        owner = createSkillFileOwner({ service });
        expect((await owner.catalog(scope)).sources[selection]).toBe('1');
        expect(service.applications).toEqual([]);
        await owner.apply(scope, selection, '1');
        expect(service.applications.map(result => result.sourceRevision)).toEqual(['1']);
      });

      it('renames the whole directory and installs binary assets without rewriting source bytes', async () => {
        const markdown = '---\nname: source-name\n---\n\nKeep authored name and spacing.  \n';
        const binary = Buffer.from([0, 255, 128, 10, 13, 0, 1]);
        const stagingDirectory = path.join(directory, 'repository');
        await fs.mkdir(path.join(stagingDirectory, 'assets'), { recursive: true });
        await fs.mkdir(path.join(stagingDirectory, 'empty'));
        await fs.writeFile(path.join(stagingDirectory, 'SKILL.md'), markdown);
        await fs.writeFile(path.join(stagingDirectory, 'assets', 'image.bin'), binary);
        await owner.install(scope, selection, '0', [{ name: 'review', stagingDirectory, overwrite: false }]);
        await owner.mutate(scope, selection, '1', 'review', { kind: 'rename', target: 'review', destination: 'renamed' });
        expect(await fs.readdir(root(selection))).toEqual(['renamed']);
        expect(await fs.readFile(path.join(root(selection), 'renamed', 'SKILL.md'), 'utf8')).toBe(markdown);
        expect(await fs.readFile(path.join(root(selection), 'renamed', 'assets', 'image.bin'))).toEqual(binary);
        expect(await fs.readdir(path.join(root(selection), 'renamed', 'empty'))).toEqual([]);
        expect(await fs.readFile(path.join(stagingDirectory, 'assets', 'image.bin'))).toEqual(binary);
        expect((await owner.catalog(scope)).skills).toEqual([{
          skillId: 'renamed', name: 'renamed', scope: selection, files: ['SKILL.md', 'assets/image.bin'],
        }]);
        await owner.mutate(scope, selection, '2', 'renamed', { kind: 'delete', target: 'renamed' });
        expect((await owner.catalog(scope)).skills).toEqual([]);
        expect((await owner.catalog(scope)).sources[selection]).toBe('3');
      });

      it('keeps a committed source revision after active apply fails and retries only on explicit apply', async () => {
        service.failNextApply();
        await expect(write(selection, '0', 'durable despite reload failure')).rejects.toMatchObject({
          code: 'SKILL_APPLY_FAILED', details: { result: { sourceRevision: '1', persistence: 'committed' } },
        });
        owner = createSkillFileOwner({ service });
        expect(await owner.read(scope, selection, 'review', 'SKILL.md')).toMatchObject({
          content: 'durable despite reload failure', sourceRevision: '1',
        });
        expect((await owner.catalog(scope)).sources[selection]).toBe('1');
        expect(service.applications).toEqual([]);
        const applied = await owner.apply(scope, selection, '1');
        expect(applied).toMatchObject({ sourceRevision: '1', persistence: 'committed', apply: { status: 'no-active-workers' } });
        expect(service.applications.map(result => result.sourceRevision)).toEqual(['1']);
      });

      it('does not repeat completed worker apply when its final response was lost', async () => {
        service.loseNextAppliedResponse();
        await expect(write(selection, '0', 'applied before lost response')).rejects.toMatchObject({
          code: 'SKILL_APPLY_FAILED', details: { result: { sourceRevision: '1', persistence: 'committed', apply: null } },
        });
        expect(service.applications.map(result => result.sourceRevision)).toEqual(['1']);
        owner = createSkillFileOwner({ service });
        expect((await owner.read(scope, selection, 'review', 'SKILL.md')).content).toBe('applied before lost response');
        await owner.catalog(scope);
        expect(service.applications.map(result => result.sourceRevision)).toEqual(['1']);
        await write(selection, '1', 'next explicit revision');
        expect(service.applications.map(result => result.sourceRevision)).toEqual(['1', '2']);
      });

      it('recovers a lost publication response without rolling back or automatically applying twice', async () => {
        service.loseNextPublicationResponse();
        await expect(write(selection, '0', 'committed before response loss')).rejects.toMatchObject({
          code: 'SKILL_APPLY_FAILED', details: { result: { sourceRevision: '1', persistence: 'committed', apply: null } },
        });
        expect(service.published[selection]).toBe('1');
        owner = createSkillFileOwner({ service });
        expect(await owner.read(scope, selection, 'review', 'SKILL.md')).toMatchObject({
          sourceRevision: '1', content: 'committed before response loss',
        });
        expect((await owner.catalog(scope)).sources[selection]).toBe('1');
        expect(service.applications).toEqual([]);
        await write(selection, '1', 'second revision');
        expect(service.applications.map(result => result.sourceRevision)).toEqual(['2']);
        owner = createSkillFileOwner({ service });
        expect((await owner.read(scope, selection, 'review', 'SKILL.md')).content).toBe('second revision');
        await owner.catalog(scope);
        expect(service.applications.map(result => result.sourceRevision)).toEqual(['2']);
      });

      for (const kind of ['write', 'delete', 'rename', 'install']) {
        for (const alreadyApplied of [false, true]) {
          it(`reopens a durable ${kind} intent ${alreadyApplied ? 'after' : 'before'} its filesystem operation without worker apply`, async () => {
            await seed(selection, 'review/SKILL.md', 'original');
            let pending;
            if (kind === 'write') {
              pending = { kind, target: 'review/SKILL.md', content: 'recovered raw Markdown\r\n' };
              if (alreadyApplied) await seed(selection, pending.target, pending.content);
            } else if (kind === 'delete') {
              pending = { kind, target: 'review' };
              if (alreadyApplied) await fs.rm(path.join(root(selection), 'review'), { recursive: true });
            } else if (kind === 'rename') {
              pending = { kind, target: 'review', destination: 'renamed' };
              if (alreadyApplied) await fs.rename(path.join(root(selection), 'review'), path.join(root(selection), 'renamed'));
            } else {
              const staging = '.openchamber-skill-stage-11111111-1111-1111-1111-111111111111';
              const backup = '.openchamber-skill-backup-22222222-2222-2222-2222-222222222222';
              const stagedRoot = path.join(path.dirname(root(selection)), staging);
              await fs.mkdir(path.join(stagedRoot, 'assets'), { recursive: true });
              await fs.writeFile(path.join(stagedRoot, 'SKILL.md'), 'installed recovery');
              await fs.writeFile(path.join(stagedRoot, 'assets', 'bytes.bin'), Buffer.from([0, 255, 128]));
              pending = { kind, replacements: [{ target: 'review', staging, backup }] };
              if (alreadyApplied) {
                await fs.rename(path.join(root(selection), 'review'), path.join(path.dirname(root(selection)), backup));
                await fs.rename(stagedRoot, path.join(root(selection), 'review'));
              }
            }
            await journal(selection, pending);
            owner = createSkillFileOwner({ service });
            expect((await owner.catalog(scope)).sources[selection]).toBe('1');
            if (kind === 'delete') {
              expect(await fs.readdir(root(selection))).toEqual([]);
            } else {
              const skillId = kind === 'rename' ? 'renamed' : 'review';
              const content = kind === 'write' ? pending.content : kind === 'install' ? 'installed recovery' : 'original';
              expect((await owner.read(scope, selection, skillId, 'SKILL.md')).content).toBe(content);
              if (kind === 'install') {
                expect(await fs.readFile(path.join(root(selection), 'review', 'assets', 'bytes.bin'))).toEqual(Buffer.from([0, 255, 128]));
                expect((await fs.readdir(path.dirname(root(selection)))).filter(name => /^\.openchamber-skill-(?:stage|backup)-/.test(name))).toEqual([]);
              }
            }
            owner = createSkillFileOwner({ service });
            expect((await owner.catalog(scope)).sources[selection]).toBe('1');
            expect(service.published[selection]).toBe('1');
            expect(service.applications).toEqual([]);
            await write(selection, '1', 'next explicit edit', 'SKILL.md', 'next');
            expect(service.published[selection]).toBe('2');
            expect(service.applications.map(result => result.sourceRevision)).toEqual(['2']);
          });
        }
      }
    });
  }
});
