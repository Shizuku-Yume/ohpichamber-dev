import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

let runtimeKey = 'remote';
const requests: Array<{ path: string; options?: { query?: Record<string, string>; headers?: Record<string, string>; signal?: AbortSignal } }> = [];
const responses: Response[] = [];
mock.module('@/lib/runtime-switch', () => ({ getRuntimeKey: () => runtimeKey }));
mock.module('@/lib/desktop', () => ({ getDesktopHomeDirectory: async () => '/local/home' }));
mock.module('@/contexts/runtimeAPIRegistry', () => ({ getRegisteredRuntimeAPIs: () => null }));
mock.module('@/lib/runtime-fetch', () => ({
  runtimeFetch: async (path: string, options?: typeof requests[number]['options']) => {
    requests.push({ path, options });
    const response = responses.shift();
    if (!response) throw new Error('No response configured');
    return response;
  },
}));
// Load after transport/runtime mocks: this intentionally tests the module boundary without an SDK.
const { hostFilesystem } = await import('./host-filesystem');

beforeEach(() => {
  runtimeKey = 'remote';
  requests.length = 0;
  responses.length = 0;
  hostFilesystem.resetRequests();
  hostFilesystem.setDirectory(undefined);
});
afterEach(() => hostFilesystem.resetRequests());

describe('Host filesystem boundary without an agent SDK', () => {
  test('remote homes come from the active Host, local desktop homes stay local', async () => {
    responses.push(Response.json({ home: '/remote/home' }));
    expect(await hostFilesystem.getFilesystemHome()).toBe('/remote/home');
    expect(requests[0].path).toBe('/api/fs/home');
    runtimeKey = 'local';
    expect(await hostFilesystem.getFilesystemHome()).toBe('/local/home');
    expect(requests).toHaveLength(1);
  });

  test('authoritative home failure is not an older Host omitting chat roots', async () => {
    responses.push(new Response(null, { status: 503 }));
    await expect(hostFilesystem.getFilesystemHomeInfo()).rejects.toThrow('(503)');
    responses.push(Response.json({ home: '/home/user' }));
    expect(await hostFilesystem.getFilesystemHomeInfo()).toEqual({ home: '/home/user' });
    responses.push(Response.json({ home: 'relative' }));
    await expect(hostFilesystem.getFilesystemHomeInfo()).rejects.toThrow();
  });

  test('missing, unavailable and present directories remain distinct', async () => {
    responses.push(Response.json({ reason: 'not-found' }, { status: 404 }));
    expect(await hostFilesystem.getDirectoryAvailability('/missing')).toBe('missing');
    responses.push(Response.json({ reason: 'os-permission' }, { status: 403 }));
    expect(await hostFilesystem.getDirectoryAvailability('/locked')).toBe('unknown');
    responses.push(Response.json({ isDirectory: true }));
    expect(await hostFilesystem.getDirectoryAvailability('/present')).toBe('available');
  });

  test('search scopes its Host request and parses native filesystem hits', async () => {
    hostFilesystem.setDirectory('/repo/with space');
    responses.push(Response.json([{ name: 'src', path: 'C:\\repo\\with space\\src', relativePath: 'src' }]));
    expect(await hostFilesystem.searchFiles('sr', { type: 'directory', includeHidden: true, respectGitignore: false })).toEqual([
      { name: 'src', path: 'C:/repo/with space/src', relativePath: 'src' },
    ]);
    expect(requests[0]).toMatchObject({
      path: '/api/fs/search',
      options: {
        query: { directory: '/repo/with space', query: 'sr', type: 'directory', includeHidden: 'true', respectGitignore: 'false' },
      },
    });
    responses.push(Response.json(['legacy-sdk-path']));
    await expect(hostFilesystem.searchFiles('bad')).rejects.toThrow();
  });

  test('search propagates an already cancelled caller signal', async () => {
    const controller = new AbortController();
    controller.abort();
    responses.push(Response.json([]));
    await hostFilesystem.searchFiles('file', { directory: '/repo', signal: controller.signal });
    expect(requests[0].options?.signal?.aborted).toBe(true);
  });

  test('listing shares reads only until the Host request owner resets', async () => {
    const entries = [{ name: 'file.txt', path: '/repo/file.txt', isDirectory: false, isFile: true }];
    responses.push(Response.json({ entries }));
    expect(await hostFilesystem.listLocalDirectory('/repo')).toEqual(entries);
    expect(await hostFilesystem.listLocalDirectory('/repo')).toEqual(entries);
    expect(requests).toHaveLength(1);
    hostFilesystem.resetRequests();
    responses.push(Response.json({ entries: [] }));
    expect(await hostFilesystem.listLocalDirectory('/repo')).toEqual([]);
    expect(requests).toHaveLength(2);
  });
});
