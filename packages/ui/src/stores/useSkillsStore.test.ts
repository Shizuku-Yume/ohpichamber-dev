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
  });
});
