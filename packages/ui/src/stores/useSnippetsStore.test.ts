import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { PromptTemplateCatalogState, PromptTemplateEntry } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { useDirectoryStore } from './useDirectoryStore';
import { useUIStore } from './useUIStore';
import { selectSnippetsForDirectory, useSnippetsStore } from './useSnippetsStore';

const template = (overrides: Partial<PromptTemplateEntry> = {}): PromptTemplateEntry => ({
  templateId: 'template-one', name: 'deploy', description: 'Deploy application',
  content: '# Deployment\n\nDeploy $1\n', scope: 'workspace', source: '(project)', editable: true,
  ...overrides,
});
const catalog = (templates: PromptTemplateEntry[] = [template()], revision = '1', workspaceId = 'workspace'): PromptTemplateCatalogState => ({ workspaceId, revision, templates });

let resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace');
let list = spyOn(canonicalClient.fileResources, 'getPromptTemplates');
let create = spyOn(canonicalClient.fileResources, 'createPromptTemplate');
let update = spyOn(canonicalClient.fileResources, 'updatePromptTemplate');
let remove = spyOn(canonicalClient.fileResources, 'deletePromptTemplate');
let expand = spyOn(canonicalClient.fileResources, 'expandPromptText');

beforeEach(() => {
  useSnippetsStore.getState().resetForRuntimeSwitch();
  useDirectoryStore.setState({ currentDirectory: '/repo' });
  useUIStore.setState({ settingsProjectPath: null });
  resolveWorkspace = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async directory => ({
    workspaceId: directory === '/other' ? 'other-workspace' : 'workspace', projectId: 'project', name: directory,
  }));
  list = spyOn(canonicalClient.fileResources, 'getPromptTemplates').mockImplementation(async workspaceId => catalog([template()], '1', workspaceId));
  create = spyOn(canonicalClient.fileResources, 'createPromptTemplate').mockResolvedValue(catalog([template()], '2'));
  update = spyOn(canonicalClient.fileResources, 'updatePromptTemplate').mockResolvedValue(catalog([template()], '2'));
  remove = spyOn(canonicalClient.fileResources, 'deletePromptTemplate').mockResolvedValue(catalog([], '2'));
  expand = spyOn(canonicalClient.fileResources, 'expandPromptText').mockResolvedValue({ content: 'native rendered content' });
});

afterEach(() => {
  resolveWorkspace.mockRestore(); list.mockRestore(); create.mockRestore();
  update.mockRestore(); remove.mockRestore(); expand.mockRestore();
  useSnippetsStore.getState().resetForRuntimeSwitch();
  useUIStore.setState({ settingsProjectPath: null });
});

describe('native prompt template registry', () => {
  test('loads the admitted settings workspace and preserves native entries', async () => {
    useUIStore.setState({ settingsProjectPath: '/other' });
    const entry = template({ group: 'releases', modelSelection: { providerId: 'provider', modelId: 'model' }, agentId: 'agent' });
    list.mockResolvedValue(catalog([entry], '18446744073709551615', 'other-workspace'));
    expect(await useSnippetsStore.getState().loadSnippets()).toBe(true);
    expect(resolveWorkspace).toHaveBeenCalledWith('/other');
    expect(list).toHaveBeenCalledWith('other-workspace');
    expect(useSnippetsStore.getState().snippets).toEqual([entry]);
    expect(useSnippetsStore.getState().catalog?.revision).toBe('18446744073709551615');
  });

  test('explicit null does not silently use an ambient workspace', async () => {
    expect(await useSnippetsStore.getState().loadSnippets(null)).toBe(false);
    expect(resolveWorkspace).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });

<<<<<<< HEAD
  test('authoritative load failure preserves the previous catalog; successful empty replaces it', async () => {
    await useSnippetsStore.getState().loadSnippets();
    list.mockRejectedValueOnce(new Error('offline'));
    expect(await useSnippetsStore.getState().loadSnippets()).toBe(false);
    expect(useSnippetsStore.getState().snippets).toEqual([template()]);
=======
    const earlyLoad = useSnippetsStore.getState().loadSnippets();
    expect(await useSnippetsStore.getState().createSnippet('deploy', 'deploy body')).toEqual({ ok: true });
    expect(listReads()).toHaveLength(2);
    expect(useSnippetsStore.getState().snippets.map((item) => item.name)).toEqual(['deploy']);

    staleRead.resolve(Response.json([]));
    expect(await earlyLoad).toBe(true);
    // Before: the create awaited the early read and published its empty list.
    expect(useSnippetsStore.getState().snippets.map((item) => item.name)).toEqual(['deploy']);
>>>>>>> bc50ba56a
    expect(useSnippetsStore.getState().isLoading).toBe(false);
    list.mockResolvedValueOnce(catalog([], '2'));
    expect(await useSnippetsStore.getState().loadSnippets()).toBe(true);
    expect(useSnippetsStore.getState().snippets).toEqual([]);
  });

  test('creates using viewed CAS and preserves Markdown without renderer expansion', async () => {
    await useSnippetsStore.getState().loadSnippets();
    const content = '# Heading\n\n  $1\n\n{{arguments}}\n';
    const entry = template({ content, scope: 'agent', source: '(user)' });
    create.mockResolvedValue(catalog([entry], '2'));
    expect(await useSnippetsStore.getState().createSnippet('deploy', content, { scope: 'agent', group: 'releases' })).toBe(true);
    expect(create).toHaveBeenCalledWith('workspace', { expectedRevision: '1', name: 'deploy', content, scope: 'agent', group: 'releases' });
    expect(useSnippetsStore.getState().selectedSnippetName).toBe(entry.templateId);
    expect(useSnippetsStore.getState().snippets[0].content).toBe(content);
    expect(expand).not.toHaveBeenCalled();
  });

  test('updates by opaque identity while preserving scope, group and execution bindings', async () => {
    const entry = template({ group: 'releases', agentId: 'build', modelSelection: { providerId: 'provider', modelId: 'model' } });
    list.mockResolvedValue(catalog([entry], '7'));
    await useSnippetsStore.getState().loadSnippets();
    expect(await useSnippetsStore.getState().updateSnippet(entry.templateId, { content: '  raw\n\nMarkdown\n' })).toBe(true);
    expect(update).toHaveBeenCalledWith('workspace', {
      templateId: entry.templateId, expectedRevision: '7', name: entry.name, scope: entry.scope,
      content: '  raw\n\nMarkdown\n', description: entry.description,
      group: entry.group, agentId: entry.agentId, modelSelection: entry.modelSelection,
    });
  });

  test('CAS conflict leaves the viewed catalog and draft untouched and never upserts', async () => {
    await useSnippetsStore.getState().loadSnippets();
    const draft = { name: 'deploy', content: 'new content', scope: 'agent' as const };
    useSnippetsStore.getState().setSnippetDraft(draft);
    create.mockRejectedValue(new Error('revision conflict'));
    expect(await useSnippetsStore.getState().createSnippet('deploy', draft.content)).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(useSnippetsStore.getState().catalog?.revision).toBe('1');
    expect(useSnippetsStore.getState().snippetDraft).toEqual(draft);
  });

  test('external templates cannot be mutated even if called outside settings controls', async () => {
    const entry = template({ scope: 'inherited', editable: false, source: 'external root' });
    list.mockResolvedValue(catalog([entry]));
    await useSnippetsStore.getState().loadSnippets();
    expect(await useSnippetsStore.getState().updateSnippet(entry.templateId, { content: 'changed' })).toBe(false);
    expect(await useSnippetsStore.getState().deleteSnippet(entry.templateId)).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  test('delete uses opaque identity and clears selection only after a successful commit', async () => {
    await useSnippetsStore.getState().loadSnippets();
    useSnippetsStore.getState().setSelectedSnippet('template-one');
    remove.mockRejectedValueOnce(new Error('revision conflict'));
    expect(await useSnippetsStore.getState().deleteSnippet('template-one')).toBe(false);
    expect(useSnippetsStore.getState().selectedSnippetName).toBe('template-one');
    expect(await useSnippetsStore.getState().deleteSnippet('template-one')).toBe(true);
    expect(remove).toHaveBeenLastCalledWith('workspace', { templateId: 'template-one', expectedRevision: '1' });
    expect(useSnippetsStore.getState().selectedSnippetName).toBeNull();
    expect(useSnippetsStore.getState().snippets).toEqual([]);
  });

  test('a read begun before a mutation cannot resurrect removed templates', async () => {
    await useSnippetsStore.getState().loadSnippets();
    const stale = Promise.withResolvers<PromptTemplateCatalogState>();
    const started = Promise.withResolvers<void>();
    list.mockImplementationOnce(() => { started.resolve(); return stale.promise; });
    const loading = useSnippetsStore.getState().loadSnippets();
    await started.promise;
    expect(await useSnippetsStore.getState().deleteSnippet('template-one')).toBe(true);
    stale.resolve(catalog([template()], '1'));
    expect(await loading).toBe(true);
    expect(useSnippetsStore.getState().catalog?.revision).toBe('2');
    expect(useSnippetsStore.getState().snippets).toEqual([]);
  });

  test('a previous directory read cannot replace a newer workspace', async () => {
    const stale = Promise.withResolvers<PromptTemplateCatalogState>();
    const started = Promise.withResolvers<void>();
    list.mockImplementationOnce(() => { started.resolve(); return stale.promise; });
    const oldLoad = useSnippetsStore.getState().loadSnippets('/repo');
    await started.promise;
    useDirectoryStore.setState({ currentDirectory: '/other' });
    await useSnippetsStore.getState().loadSnippets('/other');
    stale.resolve(catalog([template({ name: 'stale' })]));
    expect(await oldLoad).toBe(true);
    expect(useSnippetsStore.getState().catalog?.workspaceId).toBe('other-workspace');
    expect(selectSnippetsForDirectory(useSnippetsStore.getState(), '/repo').map(entry => entry.name)).toEqual(['stale']);
    expect(selectSnippetsForDirectory(useSnippetsStore.getState(), '/other').map(entry => entry.name)).toEqual(['deploy']);
  });

  test('composer catalog reads do not replace a different settings workspace', async () => {
    useUIStore.setState({ settingsProjectPath: '/other' });
    await useSnippetsStore.getState().loadSnippets();
    const settingsEntries = selectSnippetsForDirectory(useSnippetsStore.getState(), '/other');
    await useSnippetsStore.getState().loadSnippets('/repo');
    expect(useSnippetsStore.getState().directory).toBe('/other');
    expect(useSnippetsStore.getState().catalog?.workspaceId).toBe('other-workspace');
    expect(selectSnippetsForDirectory(useSnippetsStore.getState(), '/other')).toBe(settingsEntries);
    expect(selectSnippetsForDirectory(useSnippetsStore.getState(), '/repo')).toEqual([template()]);
    expect(selectSnippetsForDirectory(useSnippetsStore.getState(), '/missing')).toBe(selectSnippetsForDirectory(useSnippetsStore.getState(), '/missing'));
  });

  test('reset retires late mutation completions and prevents stale selection restoration', async () => {
    await useSnippetsStore.getState().loadSnippets();
    const response = Promise.withResolvers<PromptTemplateCatalogState>();
    create.mockReturnValueOnce(response.promise);
    const saving = useSnippetsStore.getState().createSnippet('deploy', 'content');
    useSnippetsStore.getState().resetForRuntimeSwitch();
    response.resolve(catalog([template()], '2'));
    expect(await saving).toBe(false);
    expect(useSnippetsStore.getState().catalog).toBeNull();
    expect(useSnippetsStore.getState().selectedSnippetName).toBeNull();
  });

  test('native /name invocations and arguments are passed intact to the worker', async () => {
    useUIStore.setState({ settingsProjectPath: '/other' });
    expect(await useSnippetsStore.getState().expandText('/deploy "release one" two')).toBe('native rendered content');
    expect(resolveWorkspace).toHaveBeenCalledWith('/repo');
    expect(expand).toHaveBeenCalledWith('workspace', { text: '/deploy "release one" two' });
    expect(await useSnippetsStore.getState().expandText('Use #deploy or /deploy inline')).toBe('Use #deploy or /deploy inline');
    expect(expand).toHaveBeenCalledTimes(1);
  });

  test('explicit absent expansion scope cannot fall back to ambient workspace', async () => {
    await expect(useSnippetsStore.getState().expandText('/deploy', null)).rejects.toThrow('Workspace directory is unavailable');
    expect(resolveWorkspace).not.toHaveBeenCalled();
    expect(expand).not.toHaveBeenCalled();
  });

  test('worker expansion failure is not disguised as unchanged success', async () => {
    expand.mockRejectedValue(new Error('worker unavailable'));
    await expect(useSnippetsStore.getState().expandText('/deploy')).rejects.toThrow('worker unavailable');
  });

  test('a rename moves the open snippet to its new name', async () => {
    useDirectoryStore.setState({ currentDirectory: '/repo-rename' });
    useSnippetsStore.setState({ snippets: [snippet('old-name')], selectedSnippetName: 'old-name' });
    handle = (request) => (
      request.method === 'PATCH'
        ? Response.json({ success: true, snippet: snippet('new-name') })
        : Response.json([snippet('new-name')])
    );

    expect(await useSnippetsStore.getState().updateSnippet('old-name', { name: 'new-name' })).toEqual({ ok: true });
    expect(useSnippetsStore.getState().selectedSnippetName).toBe('new-name');
  });

  test('a new snippet under a taken name leaves the existing one alone', async () => {
    useDirectoryStore.setState({ currentDirectory: '/repo-taken' });
    handle = (request) => (
      request.method === 'POST'
        ? Response.json({ error: 'Snippet "deploy" already exists' }, { status: 409 })
        : Response.json([snippet('deploy')])
    );

    expect(await useSnippetsStore.getState().createSnippet('deploy', 'other body')).toEqual({ ok: false, reason: 'taken' });
    // Before: a 409 fell through to a PATCH that overwrote the existing snippet.
    expect(requests.filter((request) => request.method === 'PATCH')).toHaveLength(0);
  });
});
