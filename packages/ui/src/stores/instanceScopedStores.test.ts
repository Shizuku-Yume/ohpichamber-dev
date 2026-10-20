import { afterEach, expect, spyOn, test } from 'bun:test';
import { useSkillsStore } from './useSkillsStore';

let restoreFetch: () => void = () => {};
afterEach(() => { restoreFetch(); useSkillsStore.getState().resetForRuntimeSwitch(); });

test('a skill workspace resolution from the previous runtime cannot publish native resources', async () => {
  useSkillsStore.getState().resetForRuntimeSwitch();
  const pending = Promise.withResolvers<Response>();
  const started = Promise.withResolvers<void>();
  const paths: string[] = [];
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input instanceof Request ? input : new URL(input.toString(), 'http://localhost'), init);
    const path = new URL(request.url).pathname;
    paths.push(path);
    if (path !== '/api/agent/v1/workspaces/resolve') throw new Error(`Unexpected request ${path}`);
    started.resolve();
    return pending.promise;
  });
  restoreFetch = () => fetchSpy.mockRestore();
  const load = useSkillsStore.getState().loadSkills('/repo');
  await started.promise;
  useSkillsStore.getState().resetForRuntimeSwitch();
  pending.resolve(Response.json({ workspaceId: 'old_workspace', projectId: 'old_project', name: 'Old workspace' }));
  expect(await load).toBe(false);
  expect(useSkillsStore.getState().skillsByDirectory['/repo']).toBeUndefined();
  expect(paths).toEqual(['/api/agent/v1/workspaces/resolve']);
});
