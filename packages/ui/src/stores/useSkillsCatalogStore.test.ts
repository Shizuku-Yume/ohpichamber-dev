import { afterAll, afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { CanonicalApiError, canonicalClient } from '@/api/canonicalClient';
import { useProjectsStore } from './useProjectsStore';
import { useSkillsStore } from './useSkillsStore';
import { useSkillsCatalogStore } from './useSkillsCatalogStore';

const workspace = { workspaceId: 'workspace_test', projectId: 'project_test', name: 'Workspace' };
const source = { id: 'custom:team', label: 'Team', source: 'owner/team', stars: null, repoUpdatedAt: null };
const item = { sourceId: source.id, repoSource: 'owner/team', skillDir: 'skills/review', skillName: 'review', installable: true, installed: { isInstalled: false as const } };
const resolve = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue(workspace);
const catalog = spyOn(canonicalClient.skillRepositories, 'catalog');
const sourceRead = spyOn(canonicalClient.skillRepositories, 'source');
const scan = spyOn(canonicalClient.skillRepositories, 'scan');
const install = spyOn(canonicalClient.skillRepositories, 'install');
const fileCatalog = spyOn(canonicalClient.fileResources, 'getSkillFileCatalog');
const reload = spyOn(useSkillsStore.getState(), 'loadSkills').mockResolvedValue(true);
beforeEach(() => {
  useProjectsStore.setState({ projects: [{ id: 'project_test', path: '/workspace' }], activeProjectId: 'project_test' });
  useSkillsCatalogStore.getState().resetForRuntimeSwitch();
  catalog.mockResolvedValue({ workspaceId: workspace.workspaceId, sources: [source] });
  sourceRead.mockResolvedValue({ workspaceId: workspace.workspaceId, items: [item] });
  scan.mockResolvedValue({ workspaceId: workspace.workspaceId, items: [item] });
  fileCatalog.mockResolvedValue({ workspaceId: workspace.workspaceId, sources: { workspace: '7', agent: '3' }, skills: [] });
  catalog.mockClear(); sourceRead.mockClear(); scan.mockClear(); install.mockClear(); fileCatalog.mockClear(); reload.mockClear(); resolve.mockClear();
});
afterEach(() => { useSkillsCatalogStore.getState().resetForRuntimeSwitch(); });
afterAll(() => { resolve.mockRestore(); catalog.mockRestore(); sourceRead.mockRestore(); scan.mockRestore(); install.mockRestore(); fileCatalog.mockRestore(); reload.mockRestore(); });

describe('Canonical skill repository store', () => {
  test('an older source response cannot undo an explicit post-mutation refresh', async () => {
    const deferred = Promise.withResolvers<{ workspaceId: string; items: typeof item[] }>();
    const started = Promise.withResolvers<void>();
    sourceRead.mockImplementationOnce(() => { started.resolve(); return deferred.promise; });
    const oldLoad = useSkillsCatalogStore.getState().loadSource(source.id);
    await started.promise;
    sourceRead.mockResolvedValueOnce({ workspaceId: workspace.workspaceId, items: [] });
    expect(await useSkillsCatalogStore.getState().loadSource(source.id, { refresh: true })).toBe(true);
    deferred.resolve({ workspaceId: workspace.workspaceId, items: [item] });
    expect(await oldLoad).toBe(false);
    expect(useSkillsCatalogStore.getState().itemsBySource[source.id]).toEqual([]);
  });
  test('shares catalog and source loads and treats an empty policy response as authoritative', async () => {
    await Promise.all([useSkillsCatalogStore.getState().loadCatalog(), useSkillsCatalogStore.getState().loadCatalog()]);
    expect(catalog).toHaveBeenCalledTimes(1);
    await Promise.all([useSkillsCatalogStore.getState().loadSource(source.id), useSkillsCatalogStore.getState().loadSource(source.id)]);
    expect(sourceRead).toHaveBeenCalledTimes(1);
    catalog.mockResolvedValueOnce({ workspaceId: workspace.workspaceId, sources: [] });
    await useSkillsCatalogStore.getState().loadCatalog({ refresh: true });
    expect(useSkillsCatalogStore.getState().sources).toEqual([]);
    expect(useSkillsCatalogStore.getState().selectedSourceId).toBeNull();
  });
  test('failed authoritative loads preserve the prior successful catalog', async () => {
    await useSkillsCatalogStore.getState().loadCatalog();
    catalog.mockRejectedValueOnce(new Error('Host unavailable'));
    expect(await useSkillsCatalogStore.getState().loadCatalog({ refresh: true })).toBe(false);
    expect(useSkillsCatalogStore.getState().sources).toEqual([source]);
    expect(useSkillsCatalogStore.getState().lastCatalogError?.message).toBe('Host unavailable');
  });
  test('obsolete endpoint results cannot repopulate a reset store', async () => {
    const deferred = Promise.withResolvers<{ workspaceId: string; sources: typeof source[] }>();
    const started = Promise.withResolvers<void>();
    catalog.mockImplementationOnce(() => { started.resolve(); return deferred.promise; });
    const pending = useSkillsCatalogStore.getState().loadCatalog();
    await started.promise;
    useSkillsCatalogStore.getState().resetForRuntimeSwitch();
    deferred.resolve({ workspaceId: workspace.workspaceId, sources: [source] });
    expect(await pending).toBe(false);
    expect(useSkillsCatalogStore.getState().sources).toEqual([]);
  });
  test('passes only approved source identity and the selected scope source revision to installation', async () => {
    const scope = { kind: 'agent' as const, agentDirectoryId: 'agent_test' };
    const result = { ok: true as const, workspaceId: workspace.workspaceId, installed: [{ skillName: 'review', scope: 'agent' as const }], skipped: [],
      commit: { scope, sourceRevision: '4', persistence: 'committed' as const, apply: null } };
    install.mockRejectedValueOnce(new CanonicalApiError({ type: 'urn:test:skill-apply', title: 'Apply failed', status: 503, code: 'SKILL_APPLY_FAILED',
      detail: 'Skill source saved but worker unavailable', retryable: true, details: { result: result.commit, repository: result } }));
    const actual = await useSkillsCatalogStore.getState().installSkills({ sourceId: source.id, scope: 'agent', selections: [{ skillDir: item.skillDir }] });
    expect(install).toHaveBeenCalledWith(workspace.workspaceId, { sourceId: source.id, scope: 'agent', selections: [{ skillDir: item.skillDir }], expectedSourceRevision: '3' });
    expect(actual).toEqual(result);
    expect(reload).toHaveBeenCalledWith('/workspace');
  });
});
