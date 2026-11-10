import { afterEach, beforeEach, describe, expect, spyOn, test, type Mock } from 'bun:test';
import type { Agent, AgentCatalog } from '@openchamber/agent-contract';
import { canonicalClient, type CanonicalClient } from '@/api/canonicalClient';
import { useProjectsStore } from './useProjectsStore';
import { invalidateAgentsLoadCache, selectAgentsForDirectory, useAgentsStore } from './useAgentsStore';

const AMBIENT = '/workspace/ambient';
const DIRECTORY = '/workspace/settings-project';
const agent = (name: string): Agent => ({
  agentId: name, name, description: '', model: null, allowedTools: [],
});
const catalog = (workspaceId: string, agents: Agent[], revision = '1'): AgentCatalog => ({ workspaceId, revision, agents });
const deferred = <T>() => {
  let resolvePromise: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolve) => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
};
let resolveWorkspace: Mock<CanonicalClient['resolveWorkspace']>;
let getAgents: Mock<CanonicalClient['getAgents']>;
beforeEach(() => {
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async (directory) => ({
    workspaceId: directory === AMBIENT ? 'ambient-workspace' : 'settings-workspace', projectId: 'project', name: directory,
  }));
  getAgents = spyOn(canonicalClient, 'getAgents');
  useProjectsStore.setState({ projects: [{ id: 'ambient', path: AMBIENT }], activeProjectId: 'ambient' });
  useAgentsStore.getState().resetForRuntimeSwitch();
});

afterEach(() => {
  resolveWorkspace.mockRestore();
  getAgents.mockRestore();
});

describe('native agent catalog refresh', () => {
  test('replaces the Settings directory list while keeping the ambient project mirror', async () => {
    const lists = new Map([['ambient-workspace', [agent('ambient-agent')]], ['settings-workspace', [agent('old-agent')]]]);
    getAgents.mockImplementation(async (workspaceId) => catalog(workspaceId, lists.get(workspaceId) ?? []));
    await useAgentsStore.getState().loadAgents(AMBIENT);
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    lists.set('settings-workspace', [agent('new-agent')]);

    invalidateAgentsLoadCache();
    invalidateAgentsLoadCache(DIRECTORY);
    await Promise.all([useAgentsStore.getState().loadAgents(), useAgentsStore.getState().loadAgents(DIRECTORY)]);

    expect(selectAgentsForDirectory(useAgentsStore.getState(), DIRECTORY).map((entry) => entry.name)).toEqual(['new-agent']);
    expect(useAgentsStore.getState().agents.map((entry) => entry.name)).toEqual(['ambient-agent']);
    expect(resolveWorkspace).toHaveBeenCalledWith(DIRECTORY);
    expect(getAgents).toHaveBeenCalledWith('settings-workspace');
  });

  test('an invalidated response cannot publish a pre-change list or fresh TTL', async () => {
    const staleResponse = deferred<AgentCatalog>();
    const started = deferred<void>();
    let listCalls = 0;
    getAgents.mockImplementation(async (workspaceId) => {
      if (++listCalls === 1) { started.resolve(); return staleResponse.promise; }
      return catalog(workspaceId, [agent('new-agent')], '2');
    });
    const staleLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    await started.promise;
    invalidateAgentsLoadCache(DIRECTORY);
    const freshLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    staleResponse.resolve(catalog('settings-workspace', [agent('old-agent')]));

    expect(await staleLoad).toBe(true);
    expect(await freshLoad).toBe(true);
    expect(listCalls).toBe(2);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), DIRECTORY).map((entry) => entry.name)).toEqual(['new-agent']);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('2');
    await useAgentsStore.getState().loadAgents(DIRECTORY);
    expect(listCalls).toBe(2);
  });

  test('a caller that joined a read before invalidation gets the replacement list', async () => {
    const staleResponse = deferred<AgentCatalog>();
    const started = deferred<void>();
    let listCalls = 0;
    getAgents.mockImplementation(async (workspaceId) => {
      if (++listCalls === 1) { started.resolve(); return staleResponse.promise; }
      return catalog(workspaceId, [agent('new-agent')], '2');
    });
    const ownerLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    await started.promise;
    const joinedLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    invalidateAgentsLoadCache(DIRECTORY);
    staleResponse.resolve(catalog('settings-workspace', [agent('old-agent')]));

    expect(await ownerLoad).toBe(true);
    expect(await joinedLoad).toBe(true);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), DIRECTORY).map((entry) => entry.name)).toEqual(['new-agent']);
    expect(listCalls).toBe(2);
  });

  test('runtime reset rejects an older load for the same directory', async () => {
    const staleResponse = deferred<AgentCatalog>();
    const started = deferred<void>();
    let listCalls = 0;
    getAgents.mockImplementation(async (workspaceId) => {
      if (++listCalls === 1) { started.resolve(); return staleResponse.promise; }
      return catalog(workspaceId, [agent('new-runtime-agent')], '2');
    });
    const staleLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    await started.promise;
    useAgentsStore.getState().resetForRuntimeSwitch();
    const freshLoad = useAgentsStore.getState().loadAgents(DIRECTORY);
    staleResponse.resolve(catalog('settings-workspace', [agent('old-runtime-agent')]));

    expect(await staleLoad).toBe(false);
    expect(await freshLoad).toBe(true);
    expect(selectAgentsForDirectory(useAgentsStore.getState(), DIRECTORY).map((entry) => entry.name)).toEqual(['new-runtime-agent']);
    expect(useAgentsStore.getState().revisionsByDirectory[DIRECTORY]).toBe('2');
  });

  test('a retired agent list never starts metadata reads on the replacement runtime', async () => {
    const response = deferred<Agent[]>();
    opencodeClient.listAgents = () => response.promise;
    const fetch = spyOn(globalThis, 'fetch');
    const stale = useAgentsStore.getState().loadAgents(DIRECTORY);
    useAgentsStore.getState().resetForRuntimeSwitch();
    const callsBefore = fetch.mock.calls.length;
    response.resolve([agent('obsolete')]);
    expect(await stale).toBe(false);
    expect(fetch.mock.calls).toHaveLength(callsBefore);
  });
});
