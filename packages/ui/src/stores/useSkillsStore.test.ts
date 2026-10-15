import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { DiscoveredSkill } from './useSkillsStore';

const activeProjectPath = '/workspace/project-with-agents-skills';

let runtimeFetchCalls: Array<{ url: string; headers?: HeadersInit }> = [];
let runtimeFetchImpl: (url: string, init?: RequestInit) => Promise<Response> = async () => (
  new Response(JSON.stringify({ skills: [] }), {
    headers: { 'Content-Type': 'application/json' },
  })
);

const runtimeFetchMock = async (url: string, init?: RequestInit) => {
  runtimeFetchCalls.push({ url: String(url), headers: init?.headers });
  return runtimeFetchImpl(url, init);
};


mock.module('@/stores/useProjectsStore', () => ({
  useProjectsStore: {
    getState: () => ({
      getActiveProject: () => ({ path: activeProjectPath }),
    }),
  },
}));

mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: runtimeFetchMock,
}));

mock.module('@/lib/background-network', () => ({
  runBackgroundNetworkTask: async <T,>(task: () => Promise<T>) => task(),
}));


mock.module('@/lib/configSync', () => ({
  emitConfigChange: mock(() => undefined),
  scopeMatches: mock(() => false),
  subscribeToConfigChanges: mock(() => () => undefined),
}));

mock.module('./utils/safeStorage', () => ({
  createDeferredSafeJSONStorage: () => ({
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  }),
}));

// Store modules must load after transport/project mocks are registered.
const { invalidateSkillsLoadCache, useSkillsStore } = await import('./useSkillsStore');
const { useSkillsCatalogStore } = await import('./useSkillsCatalogStore');

describe('useSkillsStore directory resolution', () => {
  beforeEach(() => {
    runtimeFetchCalls = [];
    runtimeFetchImpl = async () => new Response(JSON.stringify({
      skills: [{
        name: 'repo-local-skill',
        path: `${activeProjectPath}/.agents/skills/repo-local-skill/SKILL.md`,
        scope: 'project',
        source: 'agents',
        sources: { md: { description: 'Repository local' } },
      }],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    invalidateSkillsLoadCache(activeProjectPath);
    invalidateSkillsLoadCache('/workspace/other-project');
    useSkillsStore.setState({
      selectedSkillName: null,
      skills: [],
      skillsByDirectory: {},
      isLoading: false,
      skillDraft: null,
    });
  });

  test('loading another project leaves the active project\'s skills alone', async () => {
    // Settings can browse a project the app is not on. Chat autocompletes read
    // `skills`, so that list must keep describing the active project.
    const activeSkills = [
      {
        name: 'active-only',
        path: `${activeProjectPath}/.agents/skills/active-only/SKILL.md`,
        scope: 'project',
        source: 'agents',
        description: 'Active project skill',
        group: undefined,
        renamable: false,
      },
    ] satisfies DiscoveredSkill[];
    useSkillsStore.setState({
      skills: activeSkills,
      skillsByDirectory: { [activeProjectPath]: activeSkills },
    });

    const loaded = await useSkillsStore.getState().loadSkills('/workspace/other-project');

    expect(loaded).toBe(true);
    expect(runtimeFetchCalls[0]?.url).toContain(`directory=${encodeURIComponent('/workspace/other-project')}`);
    const state = useSkillsStore.getState();
    expect(state.skills).toEqual(activeSkills);
    expect(state.skillsByDirectory['/workspace/other-project']?.map((skill) => skill.name)).toEqual(['repo-local-skill']);
  });

  test('loadSkills scopes discovery to the active project', async () => {
    const loaded = await useSkillsStore.getState().loadSkills();

    expect(loaded).toBe(true);
    expect(runtimeFetchCalls.length).toBe(1);
    expect(runtimeFetchCalls[0]?.url).toContain(`directory=${encodeURIComponent(activeProjectPath)}`);
    expect(useSkillsStore.getState().skills).toEqual([{
      name: 'repo-local-skill',
      path: `${activeProjectPath}/.agents/skills/repo-local-skill/SKILL.md`,
      scope: 'project',
      source: 'agents',
      description: 'Repository local',
      group: undefined,
      renamable: false,
    }]);
  });

  test('loadSkills maps authoritative renamable from the list response', async () => {
    runtimeFetchImpl = async () => new Response(JSON.stringify({
      skills: [
        {
          name: 'managed-skill',
          path: `${activeProjectPath}/.opencode/skills/managed-skill/SKILL.md`,
          scope: 'project',
          source: 'opencode',
          renamable: true,
          sources: { md: { description: 'Managed' } },
        },
        {
          name: 'cache-skill',
          path: '/home/ubuntu/.cache/opencode/skills/hash/cache-skill/SKILL.md',
          scope: 'user',
          source: 'opencode',
          renamable: false,
          sources: { md: { description: 'Cache' } },
        },
      ],
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(useSkillsStore.getState().skills).toEqual([
      {
        name: 'managed-skill',
        path: `${activeProjectPath}/.opencode/skills/managed-skill/SKILL.md`,
        scope: 'project',
        source: 'opencode',
        description: 'Managed',
        group: undefined,
        renamable: true,
      },
      {
        name: 'cache-skill',
        path: '/home/ubuntu/.cache/opencode/skills/hash/cache-skill/SKILL.md',
        scope: 'user',
        source: 'opencode',
        description: 'Cache',
        group: 'hash',
        renamable: false,
      },
    ]);
  });

  test('renameSkill uses getRequestDirectory query and x-opencode-directory header', async () => {
    runtimeFetchImpl = async (_url, init) => {
      if (init?.method === 'PATCH') {
        return new Response(JSON.stringify({
          success: true,
          requiresReload: false,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        skills: [{
          name: 'new-skill',
          path: `${activeProjectPath}/.opencode/skills/new-skill/SKILL.md`,
          scope: 'project',
          source: 'opencode',
          renamable: true,
          sources: { md: { description: 'Renamed' } },
        }],
      }), {
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const renamed = await useSkillsStore.getState().renameSkill('old-skill', 'new-skill');
    expect(renamed).toBe(true);

    const renameCall = runtimeFetchCalls.find((call) => String(call.url).includes('/api/config/skills/old-skill'));
    expect(renameCall).toBeTruthy();
    expect(renameCall?.url).toContain(`directory=${encodeURIComponent(activeProjectPath)}`);

    const headers = new Headers(renameCall?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-opencode-directory')).toBe(activeProjectPath);
  });

  test('invalidateSkillsLoadCache() with no argument clears the active-project cache key used by loadSkills', async () => {
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(runtimeFetchCalls.length).toBe(1);

    // A null directory maps to __default__, not the active project.
    invalidateSkillsLoadCache(null);
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(runtimeFetchCalls.length).toBe(1);

    // Default resolution must match loadSkills (active project first).
    invalidateSkillsLoadCache();
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(runtimeFetchCalls.length).toBe(2);
    expect(runtimeFetchCalls[1]?.url).toContain(`directory=${encodeURIComponent(activeProjectPath)}`);
  });
  test('an authoritative empty list replaces previous skills and is cached', async () => {
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    invalidateSkillsLoadCache();
    runtimeFetchImpl = async () => new Response(JSON.stringify({ skills: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });

    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(useSkillsStore.getState().skills).toEqual([]);
    expect(useSkillsStore.getState().skillsByDirectory[activeProjectPath]).toEqual([]);
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(runtimeFetchCalls.length).toBe(2);
  });

  test('failed discovery preserves the previous directory state', async () => {
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    const previous = useSkillsStore.getState().skills;
    invalidateSkillsLoadCache();
    runtimeFetchImpl = async () => new Response('unavailable', { status: 503 });

    expect(await useSkillsStore.getState().loadSkills()).toBe(false);
    expect(useSkillsStore.getState().skills).toEqual(previous);
    expect(useSkillsStore.getState().skillsByDirectory[activeProjectPath]).toEqual(previous);
  });

  test('runtime switch rejects an obsolete discovery completion', async () => {
    const { promise, resolve: complete } = Promise.withResolvers<Response>();
    runtimeFetchImpl = () => promise;
    const pending = useSkillsStore.getState().loadSkills();
    useSkillsStore.getState().resetForRuntimeSwitch();
    complete(new Response(JSON.stringify({ skills: [] }), {
      headers: { 'Content-Type': 'application/json' },
    }));
    expect(await pending).toBe(false);
    expect(useSkillsStore.getState().skillsByDirectory).toEqual({});
  });

  test.each(['create', 'update', 'delete'] as const)('%s reloads Host state after CRUD', async (operation) => {
    runtimeFetchImpl = async (_url, init) => new Response(JSON.stringify(
      init?.method ? { success: true } : { skills: [] },
    ), { headers: { 'Content-Type': 'application/json' } });
    const store = useSkillsStore.getState();
    const saved = operation === 'create'
      ? await store.createSkill({ name: 'saved', description: 'Saved' })
      : operation === 'update'
        ? await store.updateSkill('saved', { description: 'Updated' })
        : await store.deleteSkill('saved');
    expect(saved).toBe(true);
    expect(runtimeFetchCalls.length).toBe(2);
    expect(runtimeFetchCalls.every((call) => call.url.includes(`directory=${encodeURIComponent(activeProjectPath)}`))).toBe(true);
    expect(useSkillsStore.getState().skills).toEqual([]);
  });

  test('catalog source and scan use the active project directory', async () => {
    runtimeFetchImpl = async () => new Response(JSON.stringify({ ok: true, items: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
    expect(await useSkillsCatalogStore.getState().loadSource('host-source', { refresh: true })).toBe(true);
    expect((await useSkillsCatalogStore.getState().scanRepo({ source: 'owner/skills' })).ok).toBe(true);
    expect(runtimeFetchCalls.length).toBe(2);
    expect(runtimeFetchCalls.every((call) => call.url.includes(`directory=${encodeURIComponent(activeProjectPath)}`))).toBe(true);
  });

  test('catalog install reloads skills in the installation directory and refreshes catalog', async () => {
    const targetDirectory = '/workspace/other-project';
    runtimeFetchImpl = async (url) => {
      const payload = url.includes('/install')
        ? { ok: true, installed: [], skipped: [] }
        : url.includes('/catalog')
          ? { ok: true, sources: [], itemsBySource: {} }
          : { skills: [] };
      return new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
    };
    const loadCatalog = useSkillsCatalogStore.getState().loadCatalog;
    const refreshCatalog = mock(async () => true);
    useSkillsCatalogStore.setState({ loadCatalog: refreshCatalog });
    try {
      const result = await useSkillsCatalogStore.getState().installSkills({
        source: 'owner/skills',
        scope: 'project',
        targetSource: 'agents',
        selections: [],
      }, { directory: targetDirectory });
      expect(result.ok).toBe(true);
      expect(runtimeFetchCalls.length).toBe(2);
      expect(runtimeFetchCalls[0]?.url).toContain(`directory=${encodeURIComponent(targetDirectory)}`);
      expect(runtimeFetchCalls[1]?.url).toBe(`/api/config/skills?directory=${encodeURIComponent(targetDirectory)}`);
      expect(refreshCatalog).toHaveBeenCalledWith({ refresh: true });
      expect(useSkillsStore.getState().skillsByDirectory[targetDirectory]).toEqual([]);
    } finally {
      useSkillsCatalogStore.setState({ loadCatalog });
    }
  });
});
