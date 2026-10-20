import { afterEach, expect, spyOn, test } from 'bun:test';
import { expandNativeFileResource, expandWorkspaceSkillNames } from './fileResourceExpansion';

let restoreFetch: () => void = () => {};
afterEach(() => restoreFetch());

test('ordinary prompts never resolve a workspace or launch native file discovery', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('No network expected'); });
  restoreFetch = () => fetchSpy.mockRestore();
  expect(await expandNativeFileResource('Ordinary Markdown with #reference and $literal', null)).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a native invocation requires an explicit workspace instead of an ambient fallback', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('No network expected'); });
  restoreFetch = () => fetchSpy.mockRestore();
  await expect(expandNativeFileResource('/team/review "two words"', null)).rejects.toThrow('workspace directory');
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('draft skill context uses worker IDs and preserves builder Markdown without local interpretation', async () => {
  const calls: Array<{ method: string; path: string; body: string }> = [];
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input.toString(), 'http://localhost'), init);
    const path = new URL(request.url).pathname;
    calls.push({ method: request.method, path, body: await request.text() });
    if (path === '/api/agent/v1/workspaces/resolve') return Response.json({ workspaceId: 'workspace_draft', projectId: 'project_draft', name: 'Draft' });
    if (path.endsWith('/skills/catalog')) return Response.json({ workspaceId: 'workspace_draft', skills: [{ skillId: 'native_skill', name: 'review', description: 'Review', content: 'not client expanded', scope: 'workspace', readOnly: false, source: 'project' }] });
    if (path.endsWith('/skills/expand')) return Response.json({ content: '\n<skill>\n# Worker Markdown\n$1 is literal here\n</skill>\n' });
    throw new Error(`Unexpected request ${path}`);
  });
  restoreFetch = () => fetchSpy.mockRestore();
  expect(await expandWorkspaceSkillNames('/repo', ['review', 'review'])).toBe('\n<skill>\n# Worker Markdown\n$1 is literal here\n</skill>\n');
  expect(calls.map(call => call.path)).toEqual(['/api/agent/v1/workspaces/resolve', '/api/agent/v1/workspaces/workspace_draft/skills/catalog', '/api/agent/v1/workspaces/workspace_draft/skills/expand']);
  expect(JSON.parse(calls[2].body)).toEqual({ skillId: 'native_skill', arguments: '' });
});

test('missing workspace skills reject instead of returning an empty instruction', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input.toString(), 'http://localhost'), init);
    if (new URL(request.url).pathname.endsWith('/resolve')) return Response.json({ workspaceId: 'workspace_draft', projectId: 'project_draft', name: 'Draft' });
    return Response.json({ workspaceId: 'workspace_draft', skills: [] });
  });
  restoreFetch = () => fetchSpy.mockRestore();
  await expect(expandWorkspaceSkillNames('/repo', ['missing'])).rejects.toThrow('unavailable');
});

test('empty skill selections do not resolve a workspace or request expansion', async () => {
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('No network expected'); });
  restoreFetch = () => fetchSpy.mockRestore();
  expect(await expandWorkspaceSkillNames(null, [])).toBeNull();
  expect(fetchSpy).not.toHaveBeenCalled();
});
