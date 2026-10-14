import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { canonicalClient } from '@/api/canonicalClient';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { guestGenerate } from './generate';

let restorers: Array<() => void>;
beforeEach(() => {
  switchRuntimeEndpoint({ apiBaseUrl: 'https://guest-generate.test', runtimeKey: `guest-generate-${crypto.randomUUID()}` });
  const scope = spyOn(canonicalClient, 'resolveWorkspace').mockImplementation(async directory => {
    expect(directory).toBe('/project');
    return { workspaceId: 'workspace-guest', projectId: 'project-guest', name: 'Guest' };
  });
  restorers = [() => scope.mockRestore()];
});
afterEach(() => { for (const restore of restorers.reverse()) restore(); });

describe('Guest canonical generation scope', () => {
  test('retains the Host grant owner and sends an admitted workspace instead of an engine header', async () => {
    const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const request = new Request(input, init);
      expect(new URL(request.url).pathname).toBe('/api/guests/guest-a/generate');
      expect(request.headers.has('x-opencode-directory')).toBe(false);
      expect(request.headers.get('x-openchamber-provider')).toBe('selected-provider');
      expect(request.headers.get('x-openchamber-model')).toBe('selected-model');
      expect(await request.json()).toEqual({ workspaceId: 'workspace-guest', prompt: 'Summarize this' });
      return Response.json({ ok: true, result: { text: 'Summary' } });
    });
    restorers.push(() => fetcher.mockRestore());
    expect(await guestGenerate('guest-a', { prompt: 'Summarize this' }, '/project', { providerID: 'selected-provider', modelID: 'selected-model' })).toEqual({ ok: true, result: { text: 'Summary' } });
  });
  test('grant denial is observable and never becomes successful empty text', async () => {
    const fetcher = spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ error: 'NOT_GRANTED', message: 'Model grant required' }, { status: 400 }));
    restorers.push(() => fetcher.mockRestore());
    expect(await guestGenerate('guest-a', { prompt: 'Summarize this' }, '/project', { providerID: null, modelID: null })).toEqual({ ok: false, code: 'NOT_GRANTED', message: 'Model grant required' });
  });
  test('missing directory cannot fall through to another workspace or engine', async () => {
    const fetcher = spyOn(globalThis, 'fetch');
    restorers.push(() => fetcher.mockRestore());
    expect(await guestGenerate('guest-a', { prompt: 'Summarize this' }, null, { providerID: null, modelID: null })).toMatchObject({ ok: false });
    expect(canonicalClient.resolveWorkspace).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
