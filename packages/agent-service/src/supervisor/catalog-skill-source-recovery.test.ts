import { expect, test } from 'bun:test';
import { mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { CounterSchema, type SkillSourceRevisions, type SkillsCatalogState } from '@openchamber/agent-contract';
import { CatalogCoordinator, type CatalogWorker } from './catalog.ts';

const HostSourcesSchema = z.strictObject({ a: CounterSchema, b: CounterSchema, agent: CounterSchema });

test('global apply reconciles a sibling workspace whose Host commit survived a failed service publication', async () => {
  const root = await mkdtemp(join(tmpdir(), 'skill-cross-workspace-recovery-'));
  const serviceDirectory = join(root, 'service');
  const backup = join(root, 'service-backup');
  const hostFile = join(root, 'host-sources.json');
  const agentFile = join(root, 'agent-skill.md');
  const paths = { a: join(root, 'a-skill.md'), b: join(root, 'b-skill.md') };
  await writeFile(hostFile, JSON.stringify({ a: '0', b: '0', agent: '0' }));
  await writeFile(paths.a, 'A previous'); await writeFile(paths.b, 'B unchanged'); await writeFile(agentFile, 'Agent previous');
  const coordinator = new CatalogCoordinator(serviceDirectory, { readMcpConfiguration: async () => null,
    commitMcp: async () => { throw new Error('Skill source recovery cannot configure MCP'); } });
  const observed: Array<{ workspaceId: string; sources: SkillSourceRevisions; workspaceBody: string; agentBody: string }> = [];
  const reconcile = async (workspaceId: string): Promise<SkillSourceRevisions> => {
    const sources = HostSourcesSchema.parse(JSON.parse(await readFile(hostFile, 'utf8')));
    if (workspaceId !== 'a' && workspaceId !== 'b') throw new Error('Unexpected source owner');
    return { workspace: sources[workspaceId], agent: sources.agent };
  };
  const worker = (workspaceId: 'a' | 'b'): CatalogWorker => {
    const identity = { rootSessionId: `root-${workspaceId}`, workspaceId, workerGeneration: `generation-${workspaceId}` };
    let catalog: SkillsCatalogState = { worker: identity, agentDirectoryId: 'shared-agent', runtimeStatus: 'ready', persistedSources: { workspace: '0', agent: '0' }, appliedSources: { workspace: '0', agent: '0' }, catalogRevision: '1', skills: [] };
    const unrelated = async (): Promise<never> => { throw new Error('Unrelated native operation'); };
    return { identity: { ...identity, agentDirectoryId: 'shared-agent' }, isLive: () => true,
      mcp: { read: async configuration => ({ configuration, workerCatalog: { worker: identity, runtimeStatus: 'unavailable', appliedRevision: null, catalogRevision: '0', activeServers: [], tools: [] } }), apply: unrelated, reconnect: unrelated, oauth: unrelated, oauthStatus: unrelated },
      skills: { read: async sources => ({ ...catalog, persistedSources: sources }), expand: unrelated,
        apply: async (sources, catalogRevision) => {
          const workspaceBody = await readFile(paths[workspaceId], 'utf8');
          const agentBody = await readFile(agentFile, 'utf8');
          observed.push({ workspaceId, sources, workspaceBody, agentBody });
          catalog = { ...catalog, persistedSources: sources, appliedSources: sources, catalogRevision, skills: [{ skillId: 'workspace-skill', name: 'Workspace skill', description: workspaceBody, scope: 'workspace' }, { skillId: 'agent-skill', name: 'Agent skill', description: agentBody, scope: 'agent' }] };
          return { worker: identity, outcome: 'applied', revisions: { runtimeStatus: 'ready', persistedSources: sources, appliedSources: sources, catalogRevision } };
        },
      },
    };
  };
  try {
    await coordinator.initialize();
    await coordinator.registerWorkspace('a', 'shared-agent'); await coordinator.registerWorkspace('b', 'shared-agent');
    await coordinator.register(worker('a')); await coordinator.register(worker('b'));
    await expect(coordinator.commitSkillFiles('a', { scope: 'workspace', agentDirectoryId: 'shared-agent', expectedSourceRevision: '0', operationId: 'a-commit' }, {
      reconcile,
      commit: async () => {
        await writeFile(paths.a, 'A committed');
        await writeFile(hostFile, JSON.stringify({ a: '1', b: '0', agent: '0' }));
        // Fail the real service state writer only after the Host source is durable.
        await rename(serviceDirectory, backup);
        await writeFile(serviceDirectory, 'not a directory');
        return '1';
      },
    })).rejects.toThrow();
    await rm(serviceDirectory); await rename(backup, serviceDirectory);
    expect(observed).toEqual([]);
    const committed = await coordinator.commitSkillFiles('b', { scope: 'agent', agentDirectoryId: 'shared-agent', expectedSourceRevision: '0', operationId: 'agent-commit' }, {
      reconcile,
      commit: async () => { await writeFile(agentFile, 'Agent committed'); await writeFile(hostFile, JSON.stringify({ a: '1', b: '0', agent: '1' })); return '1'; },
    });
    expect(committed.apply?.status).toBe('applied');
    expect(observed).toEqual([
      { workspaceId: 'a', sources: { workspace: '1', agent: '1' }, workspaceBody: 'A committed', agentBody: 'Agent committed' },
      { workspaceId: 'b', sources: { workspace: '0', agent: '1' }, workspaceBody: 'B unchanged', agentBody: 'Agent committed' },
    ]);
    expect((await coordinator.readSkills('root-a')).appliedSources).toEqual({ workspace: '1', agent: '1' });
    // Session-scoped explicit apply must reconcile the initiating source as well.
    await writeFile(paths.a, 'A second committed');
    await writeFile(hostFile, JSON.stringify({ a: '2', b: '0', agent: '1' }));
    const explicit = await coordinator.applySkills('root-a', { scope: 'workspace', sourceRevision: '2' }, reconcile);
    expect(explicit.status).toBe('applied');
    expect(observed.at(-1)).toEqual({ workspaceId: 'a', sources: { workspace: '2', agent: '1' }, workspaceBody: 'A second committed', agentBody: 'Agent committed' });
    const cold = new CatalogCoordinator(serviceDirectory, { readMcpConfiguration: async () => null, commitMcp: async () => { throw new Error('Recovery cannot configure MCP'); } });
    await cold.initialize();
    expect((await cold.prepareBootstrap({ workspaceId: 'a', agentDirectoryId: 'shared-agent', catalogRevision: '0' })).skillSources).toEqual({ workspace: '2', agent: '1' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
