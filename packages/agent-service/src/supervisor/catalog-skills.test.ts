import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SkillsApplyResult, SkillsCatalogState, SkillsWorkerApplyOutcome } from '@openchamber/agent-contract';
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
      const application = coordinator.applySkills('first', { scope: 'workspace', sourceRevision: '1' });
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
