import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SkillsApplyResult, SkillsCatalogState, SkillsWorkerApplyOutcome } from '@openchamber/agent-contract';
import { SkillSourceRevisionsSchema } from '@openchamber/agent-contract';
import { CatalogCoordinator, CatalogCoordinatorError, type CatalogWorker } from './catalog.ts';

for (const scenario of [
  { first: 'applied', second: 'applied', status: 'applied' },
  { first: 'failed', second: 'applied', status: 'applied' },
  { first: 'applied', second: 'failed', status: 'failed' },
  { first: 'applied', second: 'retired', status: 'no-active-workers' },
] as const) {
  test(`skill fanout discards earlier ${scenario.first} after retirement with later ${scenario.second}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'skill-fanout-'));
    const secondStarted = Promise.withResolvers<void>();
    const releaseSecond = Promise.withResolvers<void>();
    const trace: string[] = [];
    const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => null,
      commitMcp: async () => { throw new Error('Skill fanout must not commit MCP configuration'); } });
    const createWorker = (rootSessionId: string, outcome: 'applied' | 'failed', delayed: boolean) => {
      const identity = { rootSessionId, workspaceId: 'workspace', workerGeneration: `generation-${rootSessionId}` };
      let live = true;
      let catalog: SkillsCatalogState = { worker: identity, agentDirectoryId: 'agent-source', runtimeStatus: 'ready',
        persistedSources: { workspace: '0', agent: '0' }, appliedSources: { workspace: '0', agent: '0' }, catalogRevision: '1', skills: [] };
      const unused = async (): Promise<never> => { throw new Error('Unrelated catalog operation'); };
      const worker: CatalogWorker = { identity: { ...identity, agentDirectoryId: 'agent-source' }, isLive: () => live,
        mcp: { read: async configuration => ({ configuration, workerCatalog: { worker: identity, runtimeStatus: 'unavailable',
          appliedRevision: null, catalogRevision: '0', activeServers: [], tools: [] } }),
        apply: unused, reconnect: unused, oauth: unused, oauthStatus: unused },
        skills: { read: async sources => ({ ...catalog, persistedSources: sources }), expand: unused,
          apply: async (sources, catalogRevision): Promise<SkillsWorkerApplyOutcome> => {
            trace.push(`${rootSessionId}:apply`);
            if (delayed) { secondStarted.resolve(); await releaseSecond.promise; }
            if (outcome === 'applied') catalog = { ...catalog, appliedSources: sources, persistedSources: sources,
              catalogRevision, skills: [{ skillId: 'new-skill', name: 'New skill', description: 'Published sibling skill', scope: 'workspace' }] };
            trace.push(`${rootSessionId}:settled`);
            const revisions = { runtimeStatus: catalog.runtimeStatus, persistedSources: sources,
              appliedSources: catalog.appliedSources, catalogRevision: catalog.catalogRevision };
            return outcome === 'applied' ? { worker: identity, outcome, revisions }
              : { worker: identity, outcome, revisions, error: { code: 'SKILLS_LOAD_FAILED', detail: 'Unreadable skill', retryable: true } };
          } } };
      return { worker, retire: () => { live = false; coordinator.retire(rootSessionId, identity.workerGeneration); } };
    };
    const first = createWorker('first', scenario.first, false);
    const second = createWorker('second', scenario.second === 'failed' ? 'failed' : 'applied', true);
    try {
      await coordinator.initialize();
      await coordinator.registerWorkspace('workspace', 'agent-source');
      await coordinator.register(first.worker);
      await coordinator.register(second.worker);
      await coordinator.publishSources('workspace', { scope: 'workspace', sourceRevision: '1', expectedSourceRevision: '0' });
      const application = coordinator.applySkillsWorkspace('workspace', 'agent-source', { scope: 'workspace', sourceRevision: '1' }, async () => ({ workspace: '1', agent: '0' }));
      // Attach the rejection handler before releasing a failed sibling.
      const result = application.catch(error => {
        if (!(error instanceof CatalogCoordinatorError) || error.code !== 'SKILL_APPLY_FAILED' || error.status !== 503 || error.details.result?.kind !== 'skills') throw error;
        return error.details.result;
      });
      await secondStarted.promise;
      expect(trace).toEqual(['first:apply', 'first:settled', 'second:apply']);
      first.retire();
      if (scenario.second === 'retired') second.retire();
      releaseSecond.resolve();
      const aggregate: SkillsApplyResult = await result;
      expect(aggregate.status).toBe(scenario.status);
      expect(aggregate.workers.map(target => target.outcome)).toEqual(['retired', scenario.second]);
      expect(aggregate.workers[0]).toEqual({ worker: { rootSessionId: 'first', workspaceId: 'workspace', workerGeneration: 'generation-first' }, outcome: 'retired' });
      if (scenario.second === 'applied') {
        const retained = await coordinator.readSkills('second');
        expect(retained.appliedSources).toEqual({ workspace: '1', agent: '0' });
        expect(retained.catalogRevision).toBe('2');
        expect(retained.skills.map(skill => skill.skillId)).toEqual(['new-skill']);
      }
    } finally {
      releaseSecond.resolve();
      await rm(directory, { recursive: true, force: true });
    }
  });
}

test('Host source publication is durable and idempotent without claiming active application', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skill-source-publication-'));
  const options = { readMcpConfiguration: async () => null, commitMcp: async () => { throw new Error('Source publication cannot write MCP configuration'); } };
  let coordinator = new CatalogCoordinator(directory, options);
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent-source');
    const request = { scope: 'workspace' as const, sourceRevision: '2', expectedSourceRevision: '0' };
    const committed = await coordinator.publishSources('workspace', request);
    expect(committed).toEqual({ scope: { kind: 'workspace', workspaceId: 'workspace' }, sourceRevision: '2', persistence: 'committed', apply: null });
    coordinator = new CatalogCoordinator(directory, options);
    await coordinator.initialize();
    expect(await coordinator.publishSources('workspace', request)).toEqual(committed);
    expect(await coordinator.applySkillsWorkspace('workspace', 'agent-source', { scope: 'workspace', sourceRevision: '2' }, async () => ({ workspace: '2', agent: '0' }))).toEqual({ kind: 'skills', status: 'no-active-workers', scope: committed.scope, sourceRevision: '2', workers: [] });
    await expect(coordinator.applySkillsWorkspace('workspace', 'agent-source', { scope: 'workspace', sourceRevision: '1' }, async () => ({ workspace: '2', agent: '0' }))).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
    await expect(coordinator.publishSources('workspace', { ...request, sourceRevision: '3' })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT', details: { currentRevision: '2' } });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Host disk commit, source publication and root admission share one lifecycle transaction', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skill-source-admission-'));
  const hostFile = join(directory, 'host-sources.json');
  const skillDirectory = join(directory, 'workspace', '.omp', 'skills', 'review');
  const skillFile = join(skillDirectory, 'SKILL.md');
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(hostFile, JSON.stringify({ workspace: '0', agent: '0' }));
  await writeFile(skillFile, 'Previous skill');
  const coordinator = new CatalogCoordinator(join(directory, 'service'), { readMcpConfiguration: async () => null,
    commitMcp: async () => { throw new Error('Skill transactions cannot configure MCP'); } });
  const diskCommitted = Promise.withResolvers<void>();
  const finishCommit = Promise.withResolvers<void>();
  const reconcile = async () => SkillSourceRevisionsSchema.parse(JSON.parse(await readFile(hostFile, 'utf8')));
  let admitted = false;
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent-source');
    const commit = coordinator.commitSkillFiles('workspace', { scope: 'workspace', agentDirectoryId: 'agent-source', expectedSourceRevision: '0', operationId: 'author-operation' }, {
      reconcile,
      commit: async () => {
        await writeFile(`${skillFile}.tmp`, 'Committed skill');
        await rename(`${skillFile}.tmp`, skillFile);
        diskCommitted.resolve();
        await finishCommit.promise;
        await writeFile(hostFile, JSON.stringify({ workspace: '1', agent: '0' }));
        return '1';
      },
    });
    await diskCommitted.promise;
    const admission = coordinator.admit({ workspaceId: 'workspace', agentDirectoryId: 'agent-source', catalogRevision: '0' }, reconcile, async bootstrap => {
      admitted = true;
      return { sources: bootstrap.skillSources, content: await readFile(skillFile, 'utf8') };
    });
    const pendingApply = Promise.allSettled([coordinator.applySkillsWorkspace('workspace', 'agent-source', { scope: 'workspace', sourceRevision: '1' }, reconcile)]);
    expect(admitted).toBe(false);
    finishCommit.resolve();
    expect(await commit).toMatchObject({ persistence: 'committed', sourceRevision: '1', apply: { status: 'no-active-workers', workers: [] } });
    expect(await admission).toEqual({ sources: { workspace: '1', agent: '0' }, content: 'Committed skill' });
    expect(await pendingApply).toMatchObject([{ status: 'fulfilled', value: { status: 'no-active-workers', sourceRevision: '1' } }]);
    let staleWriterInvoked = false;
    await expect(coordinator.commitSkillFiles('workspace', { scope: 'workspace', agentDirectoryId: 'agent-source', expectedSourceRevision: '0', operationId: 'stale-operation' }, {
      reconcile, commit: async () => { staleWriterInvoked = true; return '2'; },
    })).rejects.toMatchObject({ status: 409, code: 'CATALOG_CONFLICT' });
    expect(staleWriterInvoked).toBe(false);
    expect(await readFile(skillFile, 'utf8')).toBe('Committed skill');
  } finally { finishCommit.resolve(); await rm(directory, { recursive: true, force: true }); }
});

test('cold admission reconciles a committed Host source after service publication loss without replaying apply', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'skill-source-recovery-'));
  const options = { readMcpConfiguration: async () => null, commitMcp: async () => { throw new Error('Recovery cannot configure MCP'); } };
  try {
    const original = new CatalogCoordinator(directory, options);
    await original.initialize();
    await original.registerWorkspace('workspace', 'agent-source');
    const hostFile = join(directory, 'committed-host-sources.json');
    await writeFile(hostFile, JSON.stringify({ workspace: '3', agent: '2' }));
    const recovered = new CatalogCoordinator(directory, options);
    await recovered.initialize();
    const bootstrap = await recovered.admit({ workspaceId: 'workspace', agentDirectoryId: 'agent-source', catalogRevision: '0' }, async () => SkillSourceRevisionsSchema.parse(JSON.parse(await readFile(hostFile, 'utf8'))), async bootstrap => bootstrap);
    expect(bootstrap.skillSources).toEqual({ workspace: '3', agent: '2' });
    const cold = new CatalogCoordinator(directory, options);
    await cold.initialize();
    expect((await cold.prepareBootstrap({ workspaceId: 'workspace', agentDirectoryId: 'agent-source', catalogRevision: '0' })).skillSources).toEqual({ workspace: '3', agent: '2' });
    await expect(cold.admit({ workspaceId: 'workspace', agentDirectoryId: 'agent-source', catalogRevision: '0' }, async () => { throw new Error('Host source recovery unavailable'); }, async () => { throw new Error('Admission must not proceed'); })).rejects.toThrow('Host source recovery unavailable');
  } finally { await rm(directory, { recursive: true, force: true }); }
});
