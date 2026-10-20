import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CatalogWorkerIdentity, PluginWorkerApplyOutcome } from '@openchamber/agent-contract';
import { CatalogCoordinator, type CatalogWorker } from './catalog.ts';

function worker(rootSessionId: string, workspaceId: string, agentDirectoryId: string): CatalogWorker {
  const identity = { rootSessionId, workspaceId, workerGeneration: `generation-${rootSessionId}` };
  const unrelated = async (): Promise<never> => { throw new Error('Plugin fanout must not mutate unrelated catalogs'); };
  return { identity: { ...identity, agentDirectoryId }, isLive: () => true,
    mcp: { read: async configuration => ({ configuration, workerCatalog: { worker: identity, runtimeStatus: 'unavailable',
      appliedRevision: null, catalogRevision: '0', activeServers: [], tools: [] } }),
      apply: unrelated, reconnect: unrelated, oauth: unrelated, oauthStatus: unrelated },
    skills: { read: async persistedSources => ({ worker: identity, agentDirectoryId, runtimeStatus: 'unavailable', persistedSources,
      appliedSources: null, catalogRevision: '0', skills: [] }), apply: unrelated, expand: unrelated } };
}

function reloadRequired(identity: CatalogWorkerIdentity): PluginWorkerApplyOutcome {
  return { worker: identity, outcome: 'failed', appliedRevision: null,
    error: { code: 'RELOAD_REQUIRED', detail: 'New extension modules require a native worker restart.', retryable: false } };
}

test('resolved plugin targets retain prior applied revisions while unselected roots stay ready', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plugin-coordinator-'));
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => null,
    commitMcp: async () => { throw new Error('Plugin changes must not persist MCP'); } });
  try {
    await coordinator.initialize();
    for (const [workspaceId, agentDirectoryId] of [['first', 'shared-agent'], ['sibling', 'shared-agent'], ['unrelated', 'other-agent']]) {
      await coordinator.registerWorkspace(workspaceId, agentDirectoryId);
      const registered = worker(`root-${workspaceId}`, workspaceId, agentDirectoryId);
      await coordinator.register(registered);
      coordinator.publishPluginRuntime(registered.identity, '3');
    }
    const outcomes = await coordinator.pluginsChanged({ rootSessionIds: ['root-first', 'root-sibling'], revision: '4' }, async identity => reloadRequired(identity));
    expect(outcomes.map(outcome => outcome.worker.workspaceId)).toEqual(['first', 'sibling']);
    expect(outcomes.map(outcome => outcome.outcome === 'failed' ? outcome.appliedRevision : null)).toEqual(['3', '3']);
    expect(await coordinator.pluginRuntime('first')).toMatchObject([{ status: 'unavailable', appliedRevision: '3', error: { code: 'RELOAD_REQUIRED' } }]);
    expect(await coordinator.pluginRuntime('unrelated')).toMatchObject([{ status: 'ready', appliedRevision: '3', error: null }]);
    const project = await coordinator.pluginsChanged({ rootSessionIds: ['root-first'], revision: '5' }, async identity => reloadRequired(identity));
    expect(project.map(outcome => outcome.worker.workspaceId)).toEqual(['first']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('plugin fanout removes an earlier generation retired while a later sibling settles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plugin-retirement-'));
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => null,
    commitMcp: async () => { throw new Error('Plugin changes must not persist MCP'); } });
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'shared-agent');
    const first = worker('first', 'workspace', 'shared-agent');
    const second = worker('second', 'workspace', 'shared-agent');
    await coordinator.register(first);
    await coordinator.register(second);
    const secondStarted = Promise.withResolvers<void>();
    const releaseSecond = Promise.withResolvers<void>();
    const application = coordinator.pluginsChanged({ rootSessionIds: ['first', 'second'], revision: '1' }, async identity => {
      if (identity.rootSessionId === 'second') { secondStarted.resolve(); await releaseSecond.promise; }
      return reloadRequired(identity);
    });
    await secondStarted.promise;
    coordinator.retire('first', first.identity.workerGeneration);
    releaseSecond.resolve();
    const outcomes = await application;
    expect(outcomes.map(outcome => outcome.outcome)).toEqual(['retired', 'failed']);
    expect((await coordinator.pluginRuntime('workspace')).map(state => state.worker.rootSessionId)).toEqual(['second']);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('captured plugin restart admission excludes all mutations and ordinary admissions until application settles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'plugin-admission-'));
  const coordinator = new CatalogCoordinator(directory, { readMcpConfiguration: async () => null,
    commitMcp: async () => { throw new Error('Plugin application must not persist MCP'); } });
  const release = Promise.withResolvers<void>();
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('workspace', 'agent');
    const trace: string[] = [];
    const entered = Promise.withResolvers<void>();
    const input = { workspaceId: 'workspace', agentDirectoryId: 'agent', catalogRevision: '0' };
    const application = coordinator.runPluginApplication(async admit => {
      await admit(input, async () => ({ workspace: '0', agent: '0' }), async bootstrap => {
        expect(bootstrap.workspaceId).toBe('workspace');
        trace.push('captured admission');
      });
      entered.resolve();
      await release.promise;
      trace.push('application settled');
    });
    await entered.promise;
    const mutation = coordinator.runPluginOperation(async () => { trace.push('mutation'); });
    const admission = coordinator.admit(input, async () => ({ workspace: '0', agent: '0' }), async () => { trace.push('ordinary admission'); });
    expect(trace).toEqual(['captured admission']);
    release.resolve();
    await Promise.all([application, mutation, admission]);
    expect(trace).toEqual(['captured admission', 'application settled', 'mutation', 'ordinary admission']);
  } finally { release.resolve(); await rm(directory, { recursive: true, force: true }); }
});
