import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { FileResourceSkillEntry, SkillFileCatalogState, SkillFilesState, SkillInstallResult } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { invalidateSkillsLoadCache, selectAvailableSkillsForDirectory, useSkillsStore } from './useSkillsStore';
import { useProjectsStore } from './useProjectsStore';

const directory = '/native-skills';
const rawMarkdown = '---\r\nname: native\r\ndescription: "Keep me"\r\ncustom: { arguments: "$@", allowedTools: [read] }\r\n---\r\n\r\n  body $1  \r\n';
const entry: FileResourceSkillEntry = { skillId: 'native-opaque-id', authoredSkillId: 'folder/native', name: 'native', description: 'Keep me', content: rawMarkdown, scope: 'workspace', source: '.omp/skills', readOnly: false };
const files: SkillFileCatalogState = { workspaceId: 'workspace', sources: { workspace: '7', agent: '2' }, skills: [{ skillId: 'folder/native', name: 'native', scope: 'workspace', files: ['SKILL.md', 'reference.txt'] }] };
const detail: SkillFilesState = { workspaceId: 'workspace', skillId: 'folder/native', scope: 'workspace', sourceRevision: '7', files: [{ filePath: 'SKILL.md', content: rawMarkdown }, { filePath: 'reference.txt', content: 'reference\n' }] };
const committed: SkillInstallResult = { scope: { kind: 'workspace', workspaceId: 'workspace' }, sourceRevision: '8', persistence: 'committed', apply: null };
const resolve = spyOn(canonicalClient, 'resolveWorkspace');
const catalog = spyOn(canonicalClient.fileResources, 'getSkills');
const fileCatalog = spyOn(canonicalClient.fileResources, 'getSkillFileCatalog');
const read = spyOn(canonicalClient.fileResources, 'getSkillFiles');
const write = spyOn(canonicalClient.fileResources, 'writeSkillFile');
const remove = spyOn(canonicalClient.fileResources, 'deleteSkill');

beforeEach(() => {
  resolve.mockResolvedValue({ workspaceId: 'workspace', projectId: 'project', name: 'Native' });
  catalog.mockResolvedValue({ workspaceId: 'workspace', skills: [entry] });
  fileCatalog.mockResolvedValue(files);
  read.mockResolvedValue(detail);
  write.mockResolvedValue(committed);
  remove.mockResolvedValue(committed);
  useProjectsStore.setState({ projects: [{ id: 'project', path: directory }], activeProjectId: 'project' });
  useSkillsStore.getState().resetForRuntimeSwitch();
  write.mockClear(); remove.mockClear(); read.mockClear();
});
afterEach(() => {
  resolve.mockClear(); catalog.mockClear(); fileCatalog.mockClear();
  useSkillsStore.getState().resetForRuntimeSwitch();
});
afterAll(() => {
  resolve.mockRestore(); catalog.mockRestore(); fileCatalog.mockRestore();
  read.mockRestore(); write.mockRestore(); remove.mockRestore();
});

<<<<<<< HEAD
describe('native authored skills', () => {
  test('authored-only files remain repairable without inventing executable discovery IDs', async () => {
    catalog.mockResolvedValue({ workspaceId: 'workspace', skills: [] });
    const store = useSkillsStore.getState();
    await store.loadSkills(directory);
    const authored = { scope: 'workspace' as const, authoredSkillId: 'folder/native' };
    store.setSelectedAuthoredSkill(authored);
    expect(useSkillsStore.getState().selectedSkillName).toBeNull();
    expect(useSkillsStore.getState().skills).toEqual([]);
    expect((await store.getSkillDetail(authored, directory))?.content).toBe(rawMarkdown);
    expect(await store.updateSkill(authored, rawMarkdown, directory)).toBe(true);
    expect(write).toHaveBeenCalledWith('workspace', 'folder/native', 'SKILL.md', { scope: 'workspace', expectedSourceRevision: '7', content: rawMarkdown });
    expect(useSkillsStore.getState().skills).toEqual([]);
  });
  test('Host source catalog remains available when native discovery fails', async () => {
    catalog.mockRejectedValueOnce(new Error('native discovery unavailable'));
    const store = useSkillsStore.getState();
    expect(await store.loadSkills(directory)).toBe(false);
    expect(useSkillsStore.getState().filesByDirectory[directory]).toEqual(files);
    expect((await store.getSkillDetail({ scope: 'workspace', authoredSkillId: 'folder/native' }, directory))?.content).toBe(rawMarkdown);
=======
const runtimeFetchMock = async (url: string, init?: RequestInit) => {
  runtimeFetchCalls.push({ url: String(url), headers: init?.headers });
  return runtimeFetchImpl(url, init);
};

mock.module('@/lib/opencode/client', () => ({
  opencodeClient: {
    getDirectory: () => getDirectoryImpl(),
    checkHealth: async () => true,
    getIntegrationPolicies: () => policiesImpl(),
  },
}));

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

mock.module('@/lib/configUpdate', () => ({
  startConfigUpdate: mock(() => undefined),
  finishConfigUpdate: mock(() => undefined),
  updateConfigUpdateMessage: mock(() => undefined),
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

const { invalidateSkillsLoadCache, selectAvailableSkillsForDirectory, selectSkillsLoadedForDirectory, useSkillsStore } = await import('./useSkillsStore');

describe('useSkillsStore directory resolution', () => {
  beforeEach(() => {
    runtimeFetchCalls = [];
    getDirectoryImpl = () => undefined;
    policiesImpl = async () => [];
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
      policiesByDirectory: {},
      isLoading: false,
      skillDraft: null,
    });
  });

  test('a project counts as loaded once its skills are read, even when it has none or the read fails', async () => {
    const loaded = (directory: string) => selectSkillsLoadedForDirectory(useSkillsStore.getState(), directory);
    expect(loaded(activeProjectPath)).toBe(false);

    runtimeFetchImpl = async () => new Response(JSON.stringify({ skills: [] }), { headers: { 'Content-Type': 'application/json' } });
    await useSkillsStore.getState().loadSkills(activeProjectPath);
    expect(selectAvailableSkillsForDirectory(useSkillsStore.getState(), activeProjectPath)).toEqual([]);
    expect(loaded(activeProjectPath)).toBe(true);

    runtimeFetchImpl = async () => new Response('{}', { status: 500 });
    expect(await useSkillsStore.getState().loadSkills('/workspace/other-project')).toBe(false);
    expect(loaded('/workspace/other-project')).toBe(true);
  });

  test('loading another project leaves the active project\'s skills alone', async () => {
    // Settings can browse a project the app is not on. Chat autocompletes read
    // `skills`, so that list must keep describing the active project.
    const activeSkills = [{
      id: 'active-only',
      name: 'active-only',
      path: `${activeProjectPath}/.agents/skills/active-only/SKILL.md`,
      scope: 'project' as const,
      source: 'agents' as const,
      description: 'Active project skill',
      group: undefined,
      renamable: false,
    }];
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
>>>>>>> bc50ba56a
  });
  test('browsing a different settings directory never replaces ambient skills', async () => {
    const store = useSkillsStore.getState();
    expect(await store.loadSkills(directory)).toBe(true);
    const other = { ...entry, skillId: 'other-native', name: 'other' };
    catalog.mockResolvedValueOnce({ workspaceId: 'workspace', skills: [other] });
    expect(await store.loadSkills('/other-settings-project')).toBe(true);
    expect(useSkillsStore.getState().skills).toEqual([entry]);
    expect(selectAvailableSkillsForDirectory(useSkillsStore.getState(), '/other-settings-project')).toEqual([other]);
  });
  test('successful empty discovery clears only the addressed directory and remains cached', async () => {
    const store = useSkillsStore.getState();
    expect(await store.loadSkills(directory)).toBe(true);
    invalidateSkillsLoadCache(directory);
    catalog.mockResolvedValueOnce({ workspaceId: 'workspace', skills: [] });
    expect(await store.loadSkills(directory)).toBe(true);
    const calls = catalog.mock.calls.length;
    expect(await store.loadSkills(directory)).toBe(true);
    expect(catalog.mock.calls.length).toBe(calls);
    expect(useSkillsStore.getState().skills).toEqual([]);
  });
  test('failed CAS writes preserve the editor source and do not retry against an unseen revision', async () => {
    const store = useSkillsStore.getState();
    await store.loadSkills(directory);
    await store.getSkillDetail(entry.skillId, directory);
    write.mockRejectedValueOnce(new Error('REVISION_CONFLICT'));
    expect(await store.updateSkill(entry.skillId, rawMarkdown + 'edit', directory)).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    expect(useSkillsStore.getState().detailsByDirectory[directory]?.[entry.skillId]?.files[0].content).toBe(rawMarkdown);
  });
  test('keeps native selection IDs separate from confined authoring IDs and preserves exact Markdown', async () => {
    const store = useSkillsStore.getState();
    expect(await store.loadSkills(directory)).toBe(true);
    expect((await store.getSkillDetail(entry.skillId, directory))?.content).toBe(rawMarkdown);
    expect(await store.readSupportingFile(entry.skillId, 'reference.txt', directory)).toBe('reference\n');
    expect(await store.updateSkill(entry.skillId, rawMarkdown + 'next', directory)).toBe(true);
    expect(write).toHaveBeenCalledWith('workspace', 'folder/native', 'SKILL.md', { scope: 'workspace', expectedSourceRevision: '7', content: rawMarkdown + 'next' });
  });
  test('authoritative discovery failure preserves the previous catalog', async () => {
    const store = useSkillsStore.getState();
    expect(await store.loadSkills(directory)).toBe(true);
    catalog.mockRejectedValueOnce(new Error('offline'));
    invalidateSkillsLoadCache(directory);
    expect(await store.loadSkills(directory)).toBe(false);
    expect(selectAvailableSkillsForDirectory(useSkillsStore.getState(), directory)).toEqual([entry]);
  });
  test('external native roots remain viewable but never enter authoring mutations', async () => {
    const external = { ...entry, authoredSkillId: undefined, readOnly: true, scope: 'inherited' as const };
    catalog.mockResolvedValueOnce({ workspaceId: 'workspace', skills: [external] });
    const store = useSkillsStore.getState();
    expect(await store.loadSkills(directory)).toBe(true);
    expect((await store.getSkillDetail(entry.skillId, directory))?.content).toBe(rawMarkdown);
    expect(await store.updateSkill(entry.skillId, 'overwrite', directory)).toBe(false);
    expect(await store.deleteSkill(entry.skillId, directory)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
<<<<<<< HEAD
  test('runtime switch rejects an older discovery completion', async () => {
    const pending = Promise.withResolvers<{ workspaceId: string; skills: FileResourceSkillEntry[] }>();
    const started = Promise.withResolvers<void>();
    catalog.mockImplementationOnce(() => { started.resolve(); return pending.promise; });
    const store = useSkillsStore.getState();
    const loading = store.loadSkills(directory);
    await started.promise;
    store.resetForRuntimeSwitch();
    pending.resolve({ workspaceId: 'workspace', skills: [entry] });
    expect(await loading).toBe(false);
    expect(selectAvailableSkillsForDirectory(useSkillsStore.getState(), directory)).toEqual([]);
=======

  test('a switch write moves the skill only after the server answers', async () => {
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    const [skill] = useSkillsStore.getState().skillsByDirectory[activeProjectPath];

    runtimeFetchImpl = async () => new Response(JSON.stringify({ error: 'Failed to write OpenCode configuration' }), { status: 500 });
    expect(await useSkillsStore.getState().setSkillEnabled(skill, false)).toBe(false);
    expect(selectAvailableSkillsForDirectory(useSkillsStore.getState())).toEqual([skill]);

    let body = '';
    runtimeFetchImpl = async (_url, init) => {
      body = String(init?.body);
      return new Response(JSON.stringify({ changed: [`${activeProjectPath}/.opencode/opencode.json`] }), { headers: { 'Content-Type': 'application/json' } });
    };
    expect(await useSkillsStore.getState().setSkillEnabled(skill, false)).toBe(true);
    expect(JSON.parse(body)).toEqual({ id: 'repo-local-skill', enabled: false, scope: 'project' });
    expect(runtimeFetchCalls.at(-1)?.url).toContain('/api/config/skill-switch');
    expect(selectAvailableSkillsForDirectory(useSkillsStore.getState())).toEqual([]);
    expect(useSkillsStore.getState().policiesByDirectory[activeProjectPath]).toEqual([
      { resource: 'skill:repo-local-skill', effect: 'deny', path: `${activeProjectPath}/.opencode/opencode.json` },
    ]);
  });

  test('a switch from a project with a non-Latin path reaches the server', async () => {
    const directory = '/workspace/мій-проєкт';
    expect(await useSkillsStore.getState().loadSkills(directory)).toBe(true);
    const [skill] = useSkillsStore.getState().skillsByDirectory[directory];

    runtimeFetchImpl = async () => new Response(JSON.stringify({ changed: [`${directory}/.opencode/opencode.json`] }), { headers: { 'Content-Type': 'application/json' } });
    expect(await useSkillsStore.getState().setSkillEnabled(skill, false, directory)).toBe(true);
    const switchCall = runtimeFetchCalls.at(-1);
    expect(switchCall?.url).toContain(`/api/config/skill-switch?directory=${encodeURIComponent(directory)}`);
    expect(switchCall?.headers).toEqual({ 'Content-Type': 'application/json', 'x-opencode-directory': directory });
  });

  test('statements never read are unknown, not empty, and the next load asks again', async () => {
    policiesImpl = async () => { throw new Error('offline'); };
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(useSkillsStore.getState().policiesByDirectory[activeProjectPath]).toBeUndefined();

    policiesImpl = async () => [{ resource: 'skill:repo-local-skill', effect: 'deny', path: '/home/u/.config/opencode/opencode.json' }];
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    expect(runtimeFetchCalls.length).toBe(2);
    expect(selectAvailableSkillsForDirectory(useSkillsStore.getState())).toEqual([]);
  });

  test('a user skill switched off shows off in every loaded directory; nothing written is a failure', async () => {
    const globalConfig = '/home/u/.config/opencode/opencode.json';
    useSkillsStore.setState({ policiesByDirectory: { '/workspace/other-project': [] } });
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);
    const skill = { ...useSkillsStore.getState().skillsByDirectory[activeProjectPath][0], scope: 'user' as const };

    runtimeFetchImpl = async () => new Response(JSON.stringify({ changed: [globalConfig] }), { headers: { 'Content-Type': 'application/json' } });
    expect(await useSkillsStore.getState().setSkillEnabled(skill, false)).toBe(true);
    const deny: Policy = { resource: 'skill:repo-local-skill', effect: 'deny', path: globalConfig };
    expect(useSkillsStore.getState().policiesByDirectory).toEqual({ [activeProjectPath]: [deny], '/workspace/other-project': [deny] });

    // The deny lives where the server cannot edit it: on writes nothing.
    useSkillsStore.setState({ policiesByDirectory: { [activeProjectPath]: [{ ...deny, path: '/broken/opencode.json' }] } });
    runtimeFetchImpl = async () => new Response(JSON.stringify({ changed: [] }), { headers: { 'Content-Type': 'application/json' } });
    expect(await useSkillsStore.getState().setSkillEnabled(skill, true)).toBe(false);
  });

  test('renaming a switched-off skill carries its rule to the new id', async () => {
    const projectConfig = `${activeProjectPath}/.opencode/opencode.json`;
    policiesImpl = async () => [{ resource: 'skill:repo-local-skill', effect: 'deny', path: projectConfig }];
    expect(await useSkillsStore.getState().loadSkills()).toBe(true);

    const switches: unknown[] = [];
    runtimeFetchImpl = async (url, init) => {
      if (String(url).includes('/api/config/skill-switch')) {
        const body = JSON.parse(String(init?.body));
        switches.push(body);
        return new Response(JSON.stringify({ changed: [projectConfig] }), { headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ skills: [] }), { headers: { 'Content-Type': 'application/json' } });
    };
    expect(await useSkillsStore.getState().renameSkill('repo-local-skill', 'shipped')).toBe(true);
    expect(switches).toEqual([
      { id: 'shipped', enabled: false, scope: 'project' },
      { id: 'repo-local-skill', enabled: true, scope: 'project' },
    ]);
>>>>>>> bc50ba56a
  });
});
